//! HTTP client for the Ticketbase API.
//!
//! This is the only place in the app that talks to the backend for ticket data.
//! Previously every window did, independently.

use std::time::Duration;

use super::models::{Ticket, TicketsResponse};

pub const DEFAULT_BASE_URL: &str = "https://itm.ticketbase.net/api";

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("network error: {0}")]
    Network(String),

    /// The API group runs Laravel's `throttle:api`. The old client polled often
    /// enough to trip it, so this is called out separately to drive backoff
    /// rather than being lumped in with real failures.
    #[error("rate limited by the server")]
    RateLimited,

    #[error("not authenticated")]
    Unauthorized,

    #[error("server returned {status}: {body}")]
    Status { status: u16, body: String },

    #[error("could not parse response: {0}")]
    Parse(String),
}

impl ApiError {
    /// Whether retrying later could plausibly succeed.
    pub fn is_transient(&self) -> bool {
        match self {
            ApiError::Network(_) | ApiError::RateLimited => true,
            ApiError::Status { status, .. } => *status >= 500,
            ApiError::Unauthorized | ApiError::Parse(_) => false,
        }
    }
}

pub struct ApiClient {
    http: reqwest::Client,
    base_url: String,
}

impl ApiClient {
    pub fn new(base_url: impl Into<String>) -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(60))
            .build()
            .expect("failed to build HTTP client");

        Self {
            http,
            base_url: base_url.into(),
        }
    }

    async fn post_json<T: serde::de::DeserializeOwned>(
        &self,
        token: &str,
        path: &str,
        body: serde_json::Value,
    ) -> Result<T, ApiError> {
        let url = format!("{}{}", self.base_url, path);

        let response = self
            .http
            .post(&url)
            .bearer_auth(token)
            .header("Accept", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| ApiError::Network(e.to_string()))?;

        self.read(response).await
    }

    async fn get_json<T: serde::de::DeserializeOwned>(
        &self,
        token: &str,
        path: &str,
    ) -> Result<T, ApiError> {
        let url = format!("{}{}", self.base_url, path);

        let response = self
            .http
            .get(&url)
            .bearer_auth(token)
            .header("Accept", "application/json")
            .send()
            .await
            .map_err(|e| ApiError::Network(e.to_string()))?;

        self.read(response).await
    }

    async fn read<T: serde::de::DeserializeOwned>(
        &self,
        response: reqwest::Response,
    ) -> Result<T, ApiError> {
        let status = response.status();

        if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
            return Err(ApiError::RateLimited);
        }
        if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
            return Err(ApiError::Unauthorized);
        }
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(ApiError::Status {
                status: status.as_u16(),
                body: body.chars().take(500).collect(),
            });
        }

        // Read as text first so a parse failure can report what actually
        // arrived — the backend returns HTML error pages on some failures.
        let text = response
            .text()
            .await
            .map_err(|e| ApiError::Network(e.to_string()))?;

        serde_json::from_str(&text).map_err(|e| {
            ApiError::Parse(format!(
                "{e} (first 200 bytes: {})",
                text.chars().take(200).collect::<String>()
            ))
        })
    }

    /// Full ticket pull.
    ///
    /// The backend has no delta endpoint and we cannot add one, so this fetches
    /// every open ticket the user can see. That is why it must happen once for
    /// the whole app rather than once per window.
    pub async fn get_tickets(
        &self,
        token: &str,
        user: &TicketQueryUser,
    ) -> Result<TicketsResponse, ApiError> {
        self.post_json(
            token,
            "/getTickets",
            serde_json::json!({
                "user_id": user.id,
                "user_group_id": user.user_group_id,
                "company_id": user.company_id,
                "location_id": user.location_id,
                "for_user_id": user.id,
                "sub_user_group_id": user.sub_user_group_id,
            }),
        )
        .await
    }

    /// Single-ticket fallback for tickets not present in the local store.
    ///
    /// Returns the raw Eloquent model, which carries fewer relations than
    /// `getTickets` — no pool, no scheduled start, no unread message count. Use
    /// the store first and only fall back to this.
    pub async fn get_ticket_by_id(&self, token: &str, ticket_id: i64) -> Result<Ticket, ApiError> {
        #[derive(serde::Deserialize)]
        struct Envelope {
            tickets: Option<serde_json::Value>,
        }

        let envelope: Envelope = self
            .get_json(token, &format!("/getTicketById?ticket_id={ticket_id}"))
            .await?;

        let raw = envelope
            .tickets
            .ok_or_else(|| ApiError::Parse(format!("ticket {ticket_id} not found")))?;

        parse_ticket_by_id(&raw)
            .ok_or_else(|| ApiError::Parse(format!("could not read ticket {ticket_id}")))
    }
}

/// The subset of the logged-in user that `getTickets` needs.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct TicketQueryUser {
    pub id: i64,
    pub user_group_id: i64,
    pub company_id: i64,
    pub location_id: i64,
    pub sub_user_group_id: i64,
}

/// Flattens the raw Eloquent model from `getTicketById` into a `Ticket`.
///
/// This replaces the transform that was copy-pasted across three components and
/// dropped attachments on every path. Attachments are recovered here from the
/// raw JSON column. The fields this endpoint genuinely cannot supply —
/// pool_name, ticket_start, ticketTerminatedUser, ticketMessagesCount — are
/// left empty, because their relations are not loaded by the controller.
pub fn parse_ticket_by_id(raw: &serde_json::Value) -> Option<Ticket> {
    use super::models::parse_attachments;

    // Small helpers kept local: this shape is unique to one endpoint.
    fn get_str(raw: &serde_json::Value, path: &[&str]) -> String {
        let mut node = raw;
        for key in path {
            match node.get(key) {
                Some(next) => node = next,
                None => return String::new(),
            }
        }
        match node {
            serde_json::Value::String(v) => v.clone(),
            serde_json::Value::Number(n) => n.to_string(),
            _ => String::new(),
        }
    }

    fn get_i64(raw: &serde_json::Value, key: &str) -> i64 {
        match raw.get(key) {
            Some(serde_json::Value::Number(n)) => n.as_i64().unwrap_or(0),
            Some(serde_json::Value::String(v)) => v.trim().parse().unwrap_or(0),
            _ => 0,
        }
    }

    let id = get_i64(raw, "id");
    if id == 0 {
        return None;
    }

    Some(Ticket {
        id,
        description: get_str(raw, &["description"]),
        status: get_str(raw, &["status", "name"]),
        status_id: get_i64(raw, "status_id"),
        summary: get_str(raw, &["summary"]),
        subject: get_str(raw, &["servicedetail", "name"]),
        priority: get_str(raw, &["priority"]),
        ticket_creator: get_str(raw, &["userone", "name"]),
        ticket_user: get_str(raw, &["ticketuser", "name"]),
        ticket_user_phone: get_str(raw, &["ticketuser", "phone"]),

        // Not loaded by getTicketById — the store is the source for these.
        ticket_terminated_user: String::new(),
        pool_name: String::new(),
        ticket_start: String::new(),
        ticket_messages_count: 0,
        play_status: None,

        // Recovered from the raw column. This is the field the old transform
        // hardcoded to [], which is why attachments vanished when a ticket was
        // opened by ID.
        attachments: raw
            .get("attachments")
            .map(parse_attachments)
            .unwrap_or_default(),

        index: get_i64(raw, "priority_index"),
        my_ticket_id: get_i64(raw, "my_ticket_id"),
        location_id: get_i64(raw, "location_id"),
        dyn_template_id: get_i64(raw, "dyn_template_id"),

        company: super::models::Company {
            id: raw
                .get("companyone")
                .map(|c| get_i64(c, "id"))
                .unwrap_or(0),
            name: get_str(raw, &["companyone", "name"]),
            number: get_str(raw, &["companyone", "number"]),
            company_mail: get_str(raw, &["companyone", "email"]),
            company_phone: get_str(raw, &["companyone", "phone"]),
            company_zip: get_str(raw, &["companyone", "zip"]),
            company_address: get_str(raw, &["companyone", "address"]),
            locations: Vec::new(),
        },

        created_at: get_str(raw, &["created_at"]),
        template_data: get_str(raw, &["template_data"]),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recovers_attachments_that_the_old_transform_dropped() {
        let raw = serde_json::json!({
            "id": 4812,
            "description": "Exchange down",
            "status": { "name": "In Arbeit" },
            "status_id": 3,
            "summary": "Mail",
            "servicedetail": { "name": "E-Mail" },
            "priority": "Hoch",
            "priority_index": 3,
            "my_ticket_id": 17,
            "location_id": 42,
            "dyn_template_id": 5,
            "userone": { "name": "Anna Weber" },
            "ticketuser": { "name": "Jonas Müller", "phone": "+49 221 5550101" },
            "companyone": {
                "id": 8, "name": "Müller Logistik", "number": "K-1042",
                "email": "it@m.example", "phone": "+49 221", "zip": "50667",
                "address": "Hafenstraße 12"
            },
            "attachments": "[{\"filename\":\"screenshot.png\",\"path\":\"/x\"}]",
            "created_at": "2026-09-02T08:14:00Z",
            "template_data": "{}"
        });

        let t = parse_ticket_by_id(&raw).expect("should parse");

        assert_eq!(t.id, 4812);
        assert_eq!(t.status, "In Arbeit");
        assert_eq!(t.ticket_creator, "Anna Weber");
        assert_eq!(t.company.name, "Müller Logistik");
        assert_eq!(t.company.company_address, "Hafenstraße 12");
        // The whole point:
        assert_eq!(t.attachments, vec!["screenshot.png"]);
    }

    #[test]
    fn rejects_a_response_with_no_id() {
        assert!(parse_ticket_by_id(&serde_json::json!({ "summary": "x" })).is_none());
    }

    #[test]
    fn tolerates_every_relation_being_absent() {
        let t = parse_ticket_by_id(&serde_json::json!({ "id": 7 })).expect("should parse");
        assert_eq!(t.id, 7);
        assert_eq!(t.status, "");
        assert_eq!(t.company.id, 0);
        assert!(t.attachments.is_empty());
    }

    #[test]
    fn rate_limit_and_network_errors_are_retryable_but_auth_is_not() {
        assert!(ApiError::RateLimited.is_transient());
        assert!(ApiError::Network("dns".into()).is_transient());
        assert!(ApiError::Status { status: 503, body: String::new() }.is_transient());
        assert!(!ApiError::Unauthorized.is_transient());
        assert!(!ApiError::Status { status: 422, body: String::new() }.is_transient());
    }
}
