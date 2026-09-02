//! The sync engine.
//!
//! Exactly one of these runs per application, regardless of how many windows
//! are open. Every window reads from the store it fills.
//!
//! This is the core fix for the app's performance: the backend's `getTickets`
//! has no pagination and lazily loads each ticket's company locations, so a
//! single call rebuilds the entire open-ticket universe. The old client made
//! that call from every window every 30 seconds. Now it happens once per
//! interval for the whole app, off the UI's critical path.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::sync::Notify;

use crate::api::client::{ApiClient, ApiError, TicketQueryUser};
use crate::store::{BucketCounts, Store, SyncDiff};

/// Emitted to every window whenever sync state changes.
pub const EVENT_STATUS: &str = "sync://status";
/// Emitted to every window when the ticket data itself changed.
pub const EVENT_CHANGED: &str = "sync://changed";

/// Meta key holding the unix-millis timestamp of the last successful sync.
const META_LAST_SYNCED_AT: &str = "last_synced_at";

const MIN_INTERVAL: Duration = Duration::from_secs(10);
const DEFAULT_INTERVAL: Duration = Duration::from_secs(30);
/// Backoff ceiling. The backend is expensive to query, so a persistent failure
/// should back well off rather than hammer it.
const MAX_BACKOFF: Duration = Duration::from_secs(10 * 60);

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum SyncState {
    /// No session yet — nothing to sync.
    Idle,
    Syncing,
    /// Last sync succeeded.
    Ok,
    /// Last sync failed; the store still holds the previous data.
    Failed,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub state: SyncState,
    /// Unix millis of the last successful sync.
    pub last_synced_at: Option<i64>,
    pub last_error: Option<String>,
    /// Whether the last error looked retryable.
    pub retrying: bool,
    /// Null ticket entries the backend emitted from its own catch block during
    /// the last sync. Surfaced rather than silently swallowed.
    pub dropped_last_sync: usize,
    pub counts: Option<BucketCounts>,
}

impl Default for SyncStatus {
    fn default() -> Self {
        Self {
            state: SyncState::Idle,
            last_synced_at: None,
            last_error: None,
            retrying: false,
            dropped_last_sync: 0,
            counts: None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct Session {
    pub token: String,
    pub user: TicketQueryUser,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangedEvent {
    pub newly_in_pool: Vec<i64>,
    pub newly_assigned: Vec<i64>,
    pub counts: BucketCounts,
}

pub struct SyncEngine {
    store: Arc<Store>,
    client: Arc<ApiClient>,
    session: Mutex<Option<Session>>,
    status: Mutex<SyncStatus>,
    interval: Mutex<Duration>,
    /// Wakes the loop early — for a manual refresh, a new session, or a
    /// changed interval.
    wake: Notify,
}

impl SyncEngine {
    pub fn new(store: Arc<Store>, client: Arc<ApiClient>) -> Self {
        // Carry the previous run's sync time forward, so a cold start can say
        // how stale the data on screen is instead of claiming it never synced.
        let last_synced_at = store
            .get_meta(META_LAST_SYNCED_AT)
            .ok()
            .flatten()
            .and_then(|v| v.parse::<i64>().ok());

        Self {
            store,
            client,
            session: Mutex::new(None),
            status: Mutex::new(SyncStatus {
                last_synced_at,
                ..SyncStatus::default()
            }),
            interval: Mutex::new(DEFAULT_INTERVAL),
            wake: Notify::new(),
        }
    }

    pub fn store(&self) -> &Arc<Store> {
        &self.store
    }

    pub fn client(&self) -> &Arc<ApiClient> {
        &self.client
    }

    pub fn status(&self) -> SyncStatus {
        self.status.lock().expect("status mutex poisoned").clone()
    }

    pub fn session(&self) -> Option<Session> {
        self.session.lock().expect("session mutex poisoned").clone()
    }

    /// Installs credentials and wakes the loop to sync immediately.
    pub fn set_session(&self, session: Session) {
        *self.session.lock().expect("session mutex poisoned") = Some(session);
        self.wake.notify_one();
    }

    /// Clears credentials and wipes the store, so the next user who signs in on
    /// this machine cannot see the previous user's tickets.
    pub fn end_session(&self) {
        *self.session.lock().expect("session mutex poisoned") = None;
        let _ = self.store.clear();

        let mut status = self.status.lock().expect("status mutex poisoned");
        *status = SyncStatus::default();
    }

    /// Sets the poll interval, floored at MIN_INTERVAL.
    ///
    /// The floor matters: the backend rate-limits, and one unbounded query per
    /// tick is expensive enough that a very short interval hurts everyone on
    /// the system, not just this client.
    pub fn set_interval(&self, seconds: u64) {
        let requested = Duration::from_secs(seconds);
        *self.interval.lock().expect("interval mutex poisoned") = requested.max(MIN_INTERVAL);
        self.wake.notify_one();
    }

    pub fn request_refresh(&self) {
        self.wake.notify_one();
    }

    fn interval(&self) -> Duration {
        *self.interval.lock().expect("interval mutex poisoned")
    }

    fn set_status(&self, app: &AppHandle, update: impl FnOnce(&mut SyncStatus)) {
        let snapshot = {
            let mut status = self.status.lock().expect("status mutex poisoned");
            update(&mut status);
            status.clone()
        };
        let _ = app.emit(EVENT_STATUS, &snapshot);
    }

    /// One sync pass. Returns the diff when the data changed.
    async fn sync_once(&self, app: &AppHandle) -> Result<SyncDiff, ApiError> {
        let session = match self.session() {
            Some(s) => s,
            None => return Err(ApiError::Unauthorized),
        };

        self.set_status(app, |s| {
            s.state = SyncState::Syncing;
        });

        let response = self
            .client
            .get_tickets(&session.token, &session.user)
            .await?;

        let parsed = response.into_parsed();
        let synced_at = now_millis();

        let diff = self
            .store
            .replace_all(
                &parsed.new_tickets,
                &parsed.my_tickets,
                &parsed.all_tickets,
                synced_at,
            )
            .map_err(|e| ApiError::Parse(e.to_string()))?;

        if parsed.dropped > 0 {
            log::warn!(
                "backend returned {} null ticket entries; they were dropped",
                parsed.dropped
            );
        }

        let counts = self
            .store
            .counts()
            .map_err(|e| ApiError::Parse(e.to_string()))?;

        let _ = self
            .store
            .set_meta(META_LAST_SYNCED_AT, &synced_at.to_string());

        self.set_status(app, |s| {
            s.state = SyncState::Ok;
            s.last_synced_at = Some(synced_at);
            s.last_error = None;
            s.retrying = false;
            s.dropped_last_sync = parsed.dropped;
            s.counts = Some(counts.clone());
        });

        // One event for every window. Notification change-detection consumes
        // this, so a ticket is announced once no matter how many windows exist.
        let _ = app.emit(
            EVENT_CHANGED,
            ChangedEvent {
                newly_in_pool: diff.newly_in_pool.clone(),
                newly_assigned: diff.newly_assigned.clone(),
                counts,
            },
        );

        Ok(diff)
    }

    /// Runs the sync loop until the app exits.
    pub async fn run(self: Arc<Self>, app: AppHandle) {
        let mut consecutive_failures: u32 = 0;

        loop {
            let has_session = self.session().is_some();

            if has_session {
                match self.sync_once(&app).await {
                    Ok(_) => consecutive_failures = 0,
                    Err(err) => {
                        let transient = err.is_transient();
                        consecutive_failures = if transient {
                            consecutive_failures.saturating_add(1)
                        } else {
                            0
                        };

                        log::warn!("sync failed: {err}");

                        // An expired or rejected token can't be retried into
                        // working; drop the session so the UI can prompt.
                        if matches!(err, ApiError::Unauthorized) {
                            *self.session.lock().expect("session mutex poisoned") = None;
                        }

                        self.set_status(&app, |s| {
                            s.state = SyncState::Failed;
                            s.last_error = Some(err.to_string());
                            s.retrying = transient;
                        });
                    }
                }
            }

            let delay = if consecutive_failures > 0 {
                backoff(self.interval(), consecutive_failures)
            } else if has_session {
                self.interval()
            } else {
                // No session: sleep long and rely on the wake signal.
                Duration::from_secs(3600)
            };

            tokio::select! {
                _ = tokio::time::sleep(delay) => {}
                _ = self.wake.notified() => {
                    // A manual refresh or a new session should not be held back
                    // by an in-progress backoff.
                    consecutive_failures = 0;
                }
            }
        }
    }
}

/// Exponential backoff on the poll interval, capped.
fn backoff(base: Duration, failures: u32) -> Duration {
    let factor = 2u32.saturating_pow(failures.min(10));
    base.saturating_mul(factor).min(MAX_BACKOFF)
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backoff_grows_then_caps() {
        let base = Duration::from_secs(30);

        assert_eq!(backoff(base, 1), Duration::from_secs(60));
        assert_eq!(backoff(base, 2), Duration::from_secs(120));
        assert_eq!(backoff(base, 3), Duration::from_secs(240));

        // Never hammers the backend indefinitely.
        assert_eq!(backoff(base, 20), MAX_BACKOFF);
        assert!(backoff(base, 99) <= MAX_BACKOFF);
    }

    #[test]
    fn interval_has_a_floor() {
        let engine = SyncEngine::new(
            Arc::new(Store::open_in_memory().unwrap()),
            Arc::new(ApiClient::new("http://example.invalid")),
        );

        engine.set_interval(1);
        assert_eq!(engine.interval(), MIN_INTERVAL);

        engine.set_interval(120);
        assert_eq!(engine.interval(), Duration::from_secs(120));
    }

    #[test]
    fn ending_a_session_clears_credentials_and_the_store() {
        let store = Arc::new(Store::open_in_memory().unwrap());
        let engine = SyncEngine::new(store.clone(), Arc::new(ApiClient::new("http://x.invalid")));

        engine.set_session(Session {
            token: "t".into(),
            user: TicketQueryUser {
                id: 1,
                user_group_id: 1,
                company_id: 1,
                location_id: 1,
                sub_user_group_id: 1,
            },
        });
        store.set_meta("last_sync", "1").unwrap();
        assert!(engine.session().is_some());

        engine.end_session();

        assert!(engine.session().is_none());
        assert!(store.get_meta("last_sync").unwrap().is_none());
        assert_eq!(engine.status().state, SyncState::Idle);
    }
}
