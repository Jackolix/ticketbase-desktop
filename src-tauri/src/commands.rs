//! Tauri commands the frontend calls instead of fetching.
//!
//! Reads are served from the local store and never touch the network, so they
//! return in microseconds and work offline. The only command that can reach the
//! backend is `get_ticket`, and only when the ticket has never been synced.

use std::sync::Arc;

use tauri::State;

use crate::api::client::TicketQueryUser;
use crate::api::models::Ticket;
use crate::store::{BucketCounts, TicketQuery};
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
            let _ = sync.store().put_ticket(&ticket, now_millis());
            Ok(Some(ticket))
        }
        Err(err) => Err(err.to_string()),
    }
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
