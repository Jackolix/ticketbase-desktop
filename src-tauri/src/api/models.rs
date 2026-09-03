//! Wire models for the Ticketbase API.
//!
//! These mirror what `APIController::getTicketDataa` actually emits, which is a
//! mix of snake_case and camelCase keys, so every rename here is deliberate
//! rather than a blanket rename_all.
//!
//! Two properties of the backend drive the defensiveness below:
//!
//!   1. `getTicketDataa` wraps its body in `try/catch(\Throwable)` and returns
//!      *nothing* on error — an implicit PHP null that lands in the middle of
//!      the tickets array. So ticket lists deserialize as `Vec<Option<Ticket>>`
//!      and the nulls are counted and dropped rather than failing the batch.
//!
//!   2. PHP is loose about number vs. string. Fields the controller does not
//!      explicitly `(int)` cast go through `flexible_i64`, so `5`, `"5"` and
//!      `null` all land as an i64 instead of failing the whole ticket.

use serde::{Deserialize, Deserializer, Serialize};

/// Accepts a JSON number, a numeric string, or null. Anything else is 0.
///
/// Guards against a single loosely-typed field discarding an otherwise valid
/// ticket.
fn flexible_i64<'de, D>(deserializer: D) -> Result<i64, D::Error>
where
    D: Deserializer<'de>,
{
    let value = serde_json::Value::deserialize(deserializer)?;
    Ok(value_to_i64(&value))
}

fn flexible_opt_i64<'de, D>(deserializer: D) -> Result<Option<i64>, D::Error>
where
    D: Deserializer<'de>,
{
    let value = serde_json::Value::deserialize(deserializer)?;
    Ok(match value {
        serde_json::Value::Null => None,
        other => Some(value_to_i64(&other)),
    })
}

fn value_to_i64(value: &serde_json::Value) -> i64 {
    match value {
        serde_json::Value::Number(n) => n.as_i64().or_else(|| n.as_f64().map(|f| f as i64)).unwrap_or(0),
        serde_json::Value::String(s) => s.trim().parse::<i64>().unwrap_or(0),
        serde_json::Value::Bool(b) => *b as i64,
        _ => 0,
    }
}

/// Accepts a string, a number, or null, yielding "" for null.
fn flexible_string<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: Deserializer<'de>,
{
    let value = serde_json::Value::deserialize(deserializer)?;
    Ok(match value {
        serde_json::Value::Null => String::new(),
        serde_json::Value::String(s) => s,
        serde_json::Value::Number(n) => n.to_string(),
        serde_json::Value::Bool(b) => b.to_string(),
        other => other.to_string(),
    })
}

/// Attachments arrive as a list of filenames from `getTickets`, but the raw
/// `attachments` DB column exposed by `getTicketById` is a JSON array of
/// `{filename, path}` objects. Accept both, and ignore entries that are neither.
fn flexible_attachments<'de, D>(deserializer: D) -> Result<Vec<String>, D::Error>
where
    D: Deserializer<'de>,
{
    let value = serde_json::Value::deserialize(deserializer)?;
    Ok(parse_attachments(&value))
}

pub fn parse_attachments(value: &serde_json::Value) -> Vec<String> {
    let items: Vec<serde_json::Value> = match value {
        serde_json::Value::Array(items) => items.clone(),
        // getTicketById hands back the raw column: a JSON string.
        serde_json::Value::String(raw) => match serde_json::from_str(raw) {
            Ok(serde_json::Value::Array(items)) => items,
            _ => return Vec::new(),
        },
        _ => return Vec::new(),
    };

    items
        .iter()
        .filter_map(|item| match item {
            serde_json::Value::String(s) if !s.is_empty() => Some(s.clone()),
            serde_json::Value::Object(map) => map
                .get("filename")
                .and_then(|f| f.as_str())
                .filter(|s| !s.is_empty())
                .map(str::to_owned),
            _ => None,
        })
        .collect()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CompanyLocation {
    #[serde(default, deserialize_with = "flexible_i64")]
    pub id: i64,
    #[serde(default, deserialize_with = "flexible_string")]
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct Company {
    #[serde(default, deserialize_with = "flexible_i64")]
    pub id: i64,
    #[serde(default, deserialize_with = "flexible_string")]
    pub name: String,
    #[serde(default, deserialize_with = "flexible_string")]
    pub number: String,
    #[serde(rename = "companyMail", default, deserialize_with = "flexible_string")]
    pub company_mail: String,
    #[serde(rename = "companyPhone", default, deserialize_with = "flexible_string")]
    pub company_phone: String,
    #[serde(rename = "companyZip", default, deserialize_with = "flexible_string")]
    pub company_zip: String,
    // Spelling matches the backend's key, which is misspelled at the source.
    #[serde(rename = "companyAdress", default, deserialize_with = "flexible_string")]
    pub company_address: String,
    #[serde(default)]
    pub locations: Vec<CompanyLocation>,
}

/// A ticket as the app uses it.
///
/// Serialized back to the frontend in camelCase so the TypeScript side keeps
/// the field names it already has.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Ticket {
    #[serde(deserialize_with = "flexible_i64")]
    pub id: i64,

    #[serde(default, deserialize_with = "flexible_string")]
    pub description: String,
    #[serde(default, deserialize_with = "flexible_string")]
    pub status: String,
    #[serde(default, deserialize_with = "flexible_string")]
    pub summary: String,
    #[serde(default, deserialize_with = "flexible_string")]
    pub subject: String,
    #[serde(default, deserialize_with = "flexible_string")]
    pub priority: String,

    #[serde(rename = "ticketCreator", default, deserialize_with = "flexible_string")]
    pub ticket_creator: String,
    #[serde(rename = "ticketUser", default, deserialize_with = "flexible_string")]
    pub ticket_user: String,
    #[serde(rename = "ticketUserPhone", default, deserialize_with = "flexible_string")]
    pub ticket_user_phone: String,
    #[serde(
        rename = "ticketTerminatedUser",
        default,
        deserialize_with = "flexible_string"
    )]
    pub ticket_terminated_user: String,

    #[serde(rename = "pool_name", default, deserialize_with = "flexible_string")]
    pub pool_name: String,

    #[serde(rename = "playStatus", default, deserialize_with = "flexible_opt_i64")]
    pub play_status: Option<i64>,

    #[serde(default, deserialize_with = "flexible_attachments")]
    pub attachments: Vec<String>,

    #[serde(default, deserialize_with = "flexible_i64")]
    pub index: i64,
    #[serde(default, deserialize_with = "flexible_i64")]
    pub my_ticket_id: i64,
    #[serde(default, deserialize_with = "flexible_i64")]
    pub location_id: i64,
    #[serde(default, deserialize_with = "flexible_i64")]
    pub status_id: i64,
    #[serde(default, deserialize_with = "flexible_i64")]
    pub dyn_template_id: i64,

    #[serde(default)]
    pub company: Company,

    #[serde(default, deserialize_with = "flexible_string")]
    pub created_at: String,
    #[serde(default, deserialize_with = "flexible_string")]
    pub ticket_start: String,

    #[serde(
        rename = "ticketMessagesCount",
        default,
        deserialize_with = "flexible_i64"
    )]
    pub ticket_messages_count: i64,

    #[serde(default, deserialize_with = "flexible_string")]
    pub template_data: String,
}

/// Which list a ticket appeared in. The backend buckets these server-side and
/// a ticket can legitimately be in more than one, so this is stored per-bucket
/// rather than as a single column on the ticket.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Bucket {
    New,
    Mine,
    All,
}

impl Bucket {
    pub fn as_str(self) -> &'static str {
        match self {
            Bucket::New => "new",
            Bucket::Mine => "mine",
            Bucket::All => "all",
        }
    }
}

/// Raw `getTickets` response.
///
/// The `Option<Ticket>` is load-bearing: see the module docs.
#[derive(Debug, Deserialize)]
pub struct TicketsResponse {
    #[serde(default)]
    pub new_tickets: Vec<Option<Ticket>>,
    #[serde(default)]
    pub my_tickets: Vec<Option<Ticket>>,
    #[serde(default)]
    pub all_tickets: Vec<Option<Ticket>>,
}

/// Tickets that survived parsing, plus how many the backend dropped.
pub struct ParsedTickets {
    pub new_tickets: Vec<Ticket>,
    pub my_tickets: Vec<Ticket>,
    pub all_tickets: Vec<Ticket>,
    /// Null entries the backend emitted from its own catch block. Surfaced so
    /// this stays visible instead of silently shrinking the list.
    pub dropped: usize,
}

impl TicketsResponse {
    pub fn into_parsed(self) -> ParsedTickets {
        let mut dropped = 0;
        let mut take = |items: Vec<Option<Ticket>>| -> Vec<Ticket> {
            items
                .into_iter()
                .filter_map(|t| {
                    if t.is_none() {
                        dropped += 1;
                    }
                    t
                })
                .collect()
        };

        ParsedTickets {
            new_tickets: take(self.new_tickets),
            my_tickets: take(self.my_tickets),
            all_tickets: take(self.all_tickets),
            dropped,
        }
    }
}

/// The id of the "Abgeschlossen" status in the backend's `statuses` table.
///
/// Load-bearing: `getTicketsQuery` filters with `status_id != 4`, so a ticket
/// reaching this value disappears from every list the sync pulls. Closed
/// tickets are therefore only reachable one at a time (`getTicketById`) or a
/// whole company at a time (`getCompanyById`).
pub const CLOSED_STATUS_ID: i64 = 4;

/// Status names by id, mirroring the backend's `statuses` seeder.
///
/// `getTickets` sends the name along because its query eager-loads the status
/// relation. `getCompanyById` does not, so its ticket rows carry only
/// `status_id` and the name has to be resolved here. Keeping the table in one
/// place beats leaving every archived row with a blank status badge.
pub fn status_name(id: i64) -> Option<&'static str> {
    Some(match id {
        1 => "Neu",
        2 => "Terminiert",
        3 => "Prüfen",
        4 => "Abgeschlossen",
        5 => "Ausstehend",
        6 => "Vor Ort",
        8 => "Wieder geöffnet",
        9 => "Warten auf Rückmeldung vom Ticketbenutzer",
        10 => "Reterminiert",
        11 => "Warten auf Rückmeldung (extern)",
        12 => "Zugewiesen",
        13 => "In Bearbeitung",
        _ => return None,
    })
}

/// A customer, as `getCustomers` returns it.
///
/// That endpoint hands back whole Eloquent models with every column on them;
/// only the fields a name lookup needs are kept. Cached locally so the search
/// box can suggest companies without a round trip per keystroke.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct Customer {
    #[serde(default, deserialize_with = "flexible_i64")]
    pub id: i64,
    #[serde(default, deserialize_with = "flexible_string")]
    pub name: String,
    #[serde(default, deserialize_with = "flexible_string")]
    pub number: String,
    #[serde(default, deserialize_with = "flexible_string")]
    pub zip: String,
    /// The town, under the backend's own column name.
    #[serde(default, deserialize_with = "flexible_string")]
    pub location: String,
    /// Non-zero for customers the backend marks inactive. Kept so they can be
    /// ranked below active ones rather than hidden — their old tickets are
    /// exactly what an archive search is for.
    #[serde(default, deserialize_with = "flexible_i64")]
    pub passive: i64,
}

/// Raw `getCustomers` response.
///
/// `Option<Customer>` for the same reason ticket lists use it: a null in the
/// middle of the array must not discard every customer around it.
#[derive(Debug, Deserialize)]
pub struct CustomersResponse {
    #[serde(default)]
    pub customers: Vec<Option<Customer>>,
}

impl CustomersResponse {
    pub fn into_customers(self) -> Vec<Customer> {
        self.customers
            .into_iter()
            .flatten()
            .filter(|c| c.id > 0 && !c.name.trim().is_empty())
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_full_ticket() {
        let json = serde_json::json!({
            "id": 4812,
            "description": "Exchange-Server nimmt keine Mails an",
            "status": "In Arbeit",
            "summary": "Mailversand gestört",
            "ticketCreator": "Anna Weber",
            "ticketUser": "Jonas Müller",
            "pool_name": "Nord",
            "ticketUserPhone": "+49 221 5550101",
            "playStatus": 1,
            "ticketTerminatedUser": "Anna Weber",
            "attachments": ["screenshot.png", "log.txt"],
            "subject": "E-Mail",
            "priority": "Hoch",
            "index": 3,
            "my_ticket_id": 17,
            "location_id": 42,
            "status_id": 3,
            "company": {
                "id": 8,
                "name": "Müller Logistik GmbH",
                "number": "K-1042",
                "companyMail": "it@mueller.example",
                "companyPhone": "+49 221 5550100",
                "companyZip": "50667",
                "companyAdress": "Hafenstraße 12",
                "locations": [{ "id": 1, "name": "Nord" }]
            },
            "dyn_template_id": 5,
            "created_at": "02-09-2026 08:14",
            "ticket_start": "03-09-2026 09:00",
            "ticketMessagesCount": 2,
            "template_data": "{\"Fehlercode\":\"550\"}"
        });

        let t: Ticket = serde_json::from_value(json).expect("should parse");
        assert_eq!(t.id, 4812);
        assert_eq!(t.pool_name, "Nord");
        assert_eq!(t.play_status, Some(1));
        assert_eq!(t.attachments, vec!["screenshot.png", "log.txt"]);
        assert_eq!(t.ticket_messages_count, 2);
        assert_eq!(t.company.company_address, "Hafenstraße 12");
        assert_eq!(t.company.locations.len(), 1);
    }

    #[test]
    fn survives_a_ticket_with_everything_missing() {
        let t: Ticket = serde_json::from_value(serde_json::json!({ "id": 1 })).expect("should parse");
        assert_eq!(t.id, 1);
        assert_eq!(t.summary, "");
        assert_eq!(t.play_status, None);
        assert!(t.attachments.is_empty());
        assert_eq!(t.company.id, 0);
    }

    #[test]
    fn accepts_numbers_as_strings() {
        let json = serde_json::json!({
            "id": "4812",
            "index": "3",
            "location_id": null,
            "status_id": 3.0
        });
        let t: Ticket = serde_json::from_value(json).expect("should parse");
        assert_eq!(t.id, 4812);
        assert_eq!(t.index, 3);
        assert_eq!(t.location_id, 0);
        assert_eq!(t.status_id, 3);
    }

    #[test]
    fn accepts_attachments_as_objects_and_as_a_raw_json_string() {
        let as_objects = serde_json::json!({
            "id": 1,
            "attachments": [{ "filename": "a.png", "path": "/x/a.png" }, { "path": "/no/name" }]
        });
        let t: Ticket = serde_json::from_value(as_objects).unwrap();
        assert_eq!(t.attachments, vec!["a.png"]);

        // getTicketById hands back the raw DB column, which is a JSON string.
        let as_raw_column = serde_json::json!({
            "id": 2,
            "attachments": "[{\"filename\":\"b.pdf\",\"path\":\"/x/b.pdf\"}]"
        });
        let t: Ticket = serde_json::from_value(as_raw_column).unwrap();
        assert_eq!(t.attachments, vec!["b.pdf"]);
    }

    /// The frontend's `Ticket` interface predates this module. Serializing back
    /// with exactly those key names is what let the whole UI keep working
    /// unchanged when fetching moved into Rust, so it is worth pinning.
    #[test]
    fn serializes_with_the_key_names_the_frontend_expects() {
        let t: Ticket = serde_json::from_value(serde_json::json!({ "id": 1 })).unwrap();
        let json = serde_json::to_value(&t).unwrap();
        let obj = json.as_object().expect("should be an object");

        let expected = [
            "id", "description", "status", "status_id", "summary", "subject", "priority",
            "index", "my_ticket_id", "location_id", "dyn_template_id", "company",
            "created_at", "ticket_start", "template_data", "attachments", "pool_name",
            "ticketCreator", "ticketUser", "ticketUserPhone", "ticketTerminatedUser",
            "playStatus", "ticketMessagesCount",
        ];

        for key in expected {
            assert!(obj.contains_key(key), "missing key {key:?}");
        }
        assert_eq!(obj.len(), expected.len(), "unexpected extra keys: {obj:?}");

        let company = obj["company"].as_object().unwrap();
        for key in [
            "id", "name", "number", "companyMail", "companyPhone", "companyZip",
            "companyAdress", "locations",
        ] {
            assert!(company.contains_key(key), "missing company key {key:?}");
        }
    }

    /// Attachments always come back as a flat list of filenames, so the
    /// frontend no longer has to handle a string-or-object union — the source
    /// of the ticket detail crash fixed in c2f4805.
    #[test]
    fn attachments_always_serialize_as_plain_strings() {
        let t: Ticket = serde_json::from_value(serde_json::json!({
            "id": 1,
            "attachments": [{ "filename": "a.png", "path": "/x" }, "b.pdf"]
        }))
        .unwrap();

        let json = serde_json::to_value(&t).unwrap();
        assert_eq!(json["attachments"], serde_json::json!(["a.png", "b.pdf"]));
    }

    #[test]
    fn drops_and_counts_the_nulls_the_backend_emits() {
        let json = serde_json::json!({
            "new_tickets": [{ "id": 1 }, null, { "id": 2 }],
            "my_tickets": [null],
            "all_tickets": []
        });

        let parsed: TicketsResponse = serde_json::from_value(json).unwrap();
        let parsed = parsed.into_parsed();

        assert_eq!(parsed.new_tickets.len(), 2);
        assert_eq!(parsed.my_tickets.len(), 0);
        assert_eq!(parsed.dropped, 2);
    }
}
