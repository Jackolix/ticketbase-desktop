//! Tauri commands the frontend calls instead of fetching.
//!
//! Reads are served from the local store and never touch the network, so they
//! return in microseconds and work offline.
//!
//! The exceptions are the archive commands. Closed tickets are invisible to
//! `getTickets` — its query filters `status_id != 4` — so they cannot be synced
//! and have to be asked for explicitly, one ticket or one customer at a time.
//! Those are the only commands here that can block on the backend, and each one
//! is driven by a deliberate user action rather than by a timer.

use std::sync::Arc;

use tauri::State;

use crate::api::client::TicketQueryUser;
use crate::api::models::{Customer, Ticket, CLOSED_STATUS_ID};
use crate::store::{BucketCounts, TicketQuery, Timer};
use crate::sync::{Session, SyncEngine, SyncStatus};

pub struct AppState {
    pub sync: Arc<SyncEngine>,
}

/// Hands the sync engine its credentials and kicks off an immediate sync.
#[tauri::command]
pub fn sync_start(
    state: State<'_, AppState>,
    token: String,
    user: TicketQueryUser,
) -> Result<(), String> {
    state.sync.set_session(Session { token, user });
    Ok(())
}

/// Clears credentials and wipes the local store.
#[tauri::command]
pub fn sync_stop(state: State<'_, AppState>) -> Result<(), String> {
    state.sync.end_session();
    Ok(())
}

#[tauri::command]
pub fn sync_refresh(state: State<'_, AppState>) -> Result<(), String> {
    state.sync.request_refresh();
    Ok(())
}

#[tauri::command]
pub fn sync_set_interval(state: State<'_, AppState>, seconds: u64) -> Result<(), String> {
    state.sync.set_interval(seconds);
    Ok(())
}

/// Current sync state. Windows opened after a sync use this to catch up,
/// since they missed the event.
#[tauri::command]
pub fn sync_status(state: State<'_, AppState>) -> SyncStatus {
    state.sync.status()
}

/// Queries the local store.
///
/// This replaces filtering a partially-loaded list in the browser, so results
/// cover every synced ticket rather than the first 50 that happened to render.
#[tauri::command]
pub fn query_tickets(
    state: State<'_, AppState>,
    query: TicketQuery,
) -> Result<Vec<Ticket>, String> {
    state
        .sync
        .store()
        .query(&query)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ticket_counts(state: State<'_, AppState>) -> Result<BucketCounts, String> {
    state.sync.store().counts().map_err(|e| e.to_string())
}

/// Fetches one ticket, preferring the local store.
///
/// The store's copy comes from `getTickets` and is complete. The network
/// fallback uses `getTicketById`, whose controller loads fewer relations — no
/// pool, no scheduled start, no unread message count — so it is genuinely less
/// complete and is only used for tickets we have never synced.
#[tauri::command]
pub async fn get_ticket(
    state: State<'_, AppState>,
    ticket_id: i64,
) -> Result<Option<Ticket>, String> {
    let sync = state.sync.clone();

    if let Some(ticket) = sync.store().get_ticket(ticket_id).map_err(|e| e.to_string())? {
        return Ok(Some(ticket));
    }

    let session = match sync.session() {
        Some(s) => s,
        None => return Ok(None),
    };

    match sync.client().get_ticket_by_id(&session.token, ticket_id).await {
        Ok(ticket) => {
            // Cache it, but without claiming bucket membership we don't know.
            // Archived, because a ticket absent from the live pull would
            // otherwise be purged the moment the next sync lands.
            let _ = sync.store().put_ticket(&ticket, now_millis(), true);
            Ok(Some(ticket))
        }
        Err(err) => Err(err.to_string()),
    }
}

/// Customers matching a partial name or number, from the local cache.
///
/// Answers from SQLite, so it can run on every keystroke. The cache is filled
/// by the sync engine; before the first sync completes this returns nothing
/// rather than failing, and the search box simply shows no suggestions.
#[tauri::command]
pub fn search_customers(
    state: State<'_, AppState>,
    query: String,
    limit: Option<i64>,
) -> Result<Vec<Customer>, String> {
    state
        .sync
        .store()
        .search_customers(&query, limit.unwrap_or(8).clamp(1, 50))
        .map_err(|e| e.to_string())
}

/// What an archive fetch actually did.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveFetch {
    /// Tickets the backend returned for the company, of any status.
    pub returned: usize,
    /// How many were written to the archive. Lower than `returned` whenever the
    /// customer also has open tickets, which are left to the live sync.
    pub cached: usize,
    /// How many of them are actually closed. Reported because it is the
    /// question the fetch was run to answer, and because a customer whose
    /// tickets are all still open is worth telling apart from a failed pull.
    pub closed: usize,
}

/// Pulls every ticket belonging to one customer into the local archive.
///
/// Deliberately explicit and never automatic. `getCompanyById` is the only
/// endpoint that exposes closed tickets in bulk, and it eager-loads the same
/// ticket relation five times over, so the response for a long-standing
/// customer is large. Running it on a timer would undo the reason the sync core
/// exists.
#[tauri::command]
pub async fn fetch_company_archive(
    state: State<'_, AppState>,
    company_id: i64,
) -> Result<ArchiveFetch, String> {
    let sync = state.sync.clone();

    let session = sync
        .session()
        .ok_or_else(|| "not signed in".to_string())?;

    let tickets = sync
        .client()
        .get_company_tickets(&session.token, company_id)
        .await
        .map_err(|e| e.to_string())?;

    let cached = sync
        .store()
        .put_archived(&tickets, now_millis())
        .map_err(|e| e.to_string())?;

    Ok(ArchiveFetch {
        returned: tickets.len(),
        cached,
        closed: tickets
            .iter()
            .filter(|t| t.status_id == CLOSED_STATUS_ID)
            .count(),
    })
}

/// Looks a ticket up by number, reaching past the live sync if need be.
///
/// Unlike `get_ticket` this is what a search box calls: a closed ticket is not
/// in the store and never will be, so a store miss has to become a request
/// rather than a "not found".
#[tauri::command]
pub async fn fetch_ticket_by_number(
    state: State<'_, AppState>,
    ticket_id: i64,
) -> Result<Option<Ticket>, String> {
    let sync = state.sync.clone();

    if let Some(ticket) = sync.store().get_ticket(ticket_id).map_err(|e| e.to_string())? {
        return Ok(Some(ticket));
    }

    let session = match sync.session() {
        Some(s) => s,
        None => return Ok(None),
    };

    match sync.client().get_ticket_by_id(&session.token, ticket_id).await {
        Ok(ticket) => {
            let _ = sync.store().put_ticket(&ticket, now_millis(), true);
            Ok(Some(ticket))
        }
        // A number that matches nothing is an ordinary outcome for a search
        // box, not an error worth surfacing as one.
        Err(crate::api::client::ApiError::Parse(_)) => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

/// What happened to a timer.
#[derive(Debug, Clone, Copy, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TimerAction {
    /// A fresh session, from zero.
    Start,
    /// Continue a paused one — or adopt a running one we have no record of.
    Resume,
    Pause,
    /// The work session ended; forget it.
    Clear,
}

/// This client's own record of a running timer.
///
/// The backend cannot answer "how long has this been running": `getPlayerStatus`
/// computes the elapsed seconds and then overwrites the variable with 0 before
/// returning, and its `total_time` is a rounded billing figure that stays 0
/// until the first pause. Both windows and both restarts read from here
/// instead, which is why a reopened ticket no longer starts counting at zero.
#[tauri::command]
pub fn timer_status(
    state: State<'_, AppState>,
    ticket_id: i64,
) -> Result<Option<Timer>, String> {
    let sync = state.sync.clone();
    let Some(session) = sync.session() else {
        return Ok(None);
    };

    sync.store()
        .timer(ticket_id, session.user.id, now_millis())
        .map_err(|e| e.to_string())
}

/// Records a timer transition and returns the resulting snapshot.
///
/// `base_ms` is only consulted by `Resume` when there is no local record, to
/// seed the total from whatever the server could tell us.
#[tauri::command]
pub fn timer_record(
    state: State<'_, AppState>,
    ticket_id: i64,
    action: TimerAction,
    base_ms: Option<i64>,
) -> Result<Option<Timer>, String> {
    let sync = state.sync.clone();
    let Some(session) = sync.session() else {
        return Ok(None);
    };

    let user_id = session.user.id;
    let now = now_millis();
    let store = sync.store();

    match action {
        TimerAction::Start => store.timer_start(ticket_id, user_id, now),
        TimerAction::Resume => {
            store.timer_resume(ticket_id, user_id, base_ms.unwrap_or(0), now)
        }
        TimerAction::Pause => store.timer_pause(ticket_id, user_id, now),
        TimerAction::Clear => store.timer_clear(ticket_id, user_id),
    }
    .map_err(|e| e.to_string())?;

    store
        .timer(ticket_id, user_id, now)
        .map_err(|e| e.to_string())
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
