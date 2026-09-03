//! Local SQLite store.
//!
//! Holds the last known state of every ticket the user can see, so the UI reads
//! from disk instead of waiting on a backend that rebuilds the entire
//! open-ticket universe on each request.
//!
//! Bucket membership (new / mine / all) is decided server-side and a ticket can
//! be in more than one, so it lives in its own table rather than as a column.
//!
//! Closed tickets are a separate matter. `getTicketsQuery` filters them out
//! with `status_id != 4`, so no amount of syncing will ever bring one in. They
//! are fetched on demand instead and marked `archived`, which is what exempts
//! them from the purge that drops anything missing from the latest pull.

use std::path::Path;
use std::sync::Mutex;

use rusqlite::functions::FunctionFlags;
use rusqlite::{params, Connection, OptionalExtension};

use crate::api::models::{Bucket, Company, Customer, Ticket};

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("database error: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("serialization error: {0}")]
    Serde(#[from] serde_json::Error),
}

pub struct Store {
    conn: Mutex<Connection>,
}

impl Store {
    pub fn open(path: &Path) -> Result<Self, StoreError> {
        let conn = Connection::open(path)?;
        Self::init(&conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    #[cfg(test)]
    pub fn open_in_memory() -> Result<Self, StoreError> {
        let conn = Connection::open_in_memory()?;
        Self::init(&conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    fn init(conn: &Connection) -> Result<(), StoreError> {
        // WAL keeps reads from blocking behind the sync task's writes.
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;

        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS tickets (
                id                    INTEGER PRIMARY KEY,
                description           TEXT NOT NULL DEFAULT '',
                status                TEXT NOT NULL DEFAULT '',
                status_id             INTEGER NOT NULL DEFAULT 0,
                summary               TEXT NOT NULL DEFAULT '',
                subject               TEXT NOT NULL DEFAULT '',
                priority              TEXT NOT NULL DEFAULT '',
                priority_index        INTEGER NOT NULL DEFAULT 0,
                ticket_creator        TEXT NOT NULL DEFAULT '',
                ticket_user           TEXT NOT NULL DEFAULT '',
                ticket_user_phone     TEXT NOT NULL DEFAULT '',
                ticket_terminated_user TEXT NOT NULL DEFAULT '',
                pool_name             TEXT NOT NULL DEFAULT '',
                play_status           INTEGER,
                attachments           TEXT NOT NULL DEFAULT '[]',
                my_ticket_id          INTEGER NOT NULL DEFAULT 0,
                location_id           INTEGER NOT NULL DEFAULT 0,
                dyn_template_id       INTEGER NOT NULL DEFAULT 0,
                company               TEXT NOT NULL DEFAULT '{}',
                company_id            INTEGER NOT NULL DEFAULT 0,
                company_name          TEXT NOT NULL DEFAULT '',
                created_at            TEXT NOT NULL DEFAULT '',
                created_at_sortable   TEXT NOT NULL DEFAULT '',
                ticket_start          TEXT NOT NULL DEFAULT '',
                ticket_messages_count INTEGER NOT NULL DEFAULT 0,
                template_data         TEXT NOT NULL DEFAULT '',
                synced_at             INTEGER NOT NULL DEFAULT 0,
                archived              INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS ticket_buckets (
                ticket_id INTEGER NOT NULL,
                bucket    TEXT NOT NULL,
                PRIMARY KEY (ticket_id, bucket),
                FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_buckets_bucket ON ticket_buckets(bucket);
            CREATE INDEX IF NOT EXISTS idx_tickets_company ON tickets(company_id);
            CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status_id);
            CREATE INDEX IF NOT EXISTS idx_tickets_sort ON tickets(created_at_sortable);

            CREATE TABLE IF NOT EXISTS meta (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS companies (
                id        INTEGER PRIMARY KEY,
                name      TEXT NOT NULL DEFAULT '',
                number    TEXT NOT NULL DEFAULT '',
                zip       TEXT NOT NULL DEFAULT '',
                location  TEXT NOT NULL DEFAULT '',
                passive   INTEGER NOT NULL DEFAULT 0,
                synced_at INTEGER NOT NULL DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name COLLATE NOCASE);
            "#,
        )?;

        register_unicode_lower(conn)?;

        // Databases written before archiving existed have no such column, and
        // an install that upgrades in place must not lose its cache over it.
        add_column_if_missing(conn, "tickets", "archived", "INTEGER NOT NULL DEFAULT 0")?;
        conn.execute_batch(
            "CREATE INDEX IF NOT EXISTS idx_tickets_archived ON tickets(archived);",
        )?;

        Ok(())
    }

    /// Replaces the contents of all three buckets in one transaction.
    ///
    /// Returns the ids that are newly present in each bucket, which is what
    /// notification change-detection consumes. Doing it here means it happens
    /// once for the whole app instead of once per window.
    pub fn replace_all(
        &self,
        new_tickets: &[Ticket],
        my_tickets: &[Ticket],
        all_tickets: &[Ticket],
        synced_at: i64,
    ) -> Result<SyncDiff, StoreError> {
        let mut conn = self.conn.lock().expect("store mutex poisoned");
        let tx = conn.transaction()?;

        let previous_new = bucket_ids(&tx, Bucket::New)?;
        let previous_mine = bucket_ids(&tx, Bucket::Mine)?;
        let is_first_sync = tx
            .query_row("SELECT COUNT(*) FROM tickets", [], |r| r.get::<_, i64>(0))?
            == 0;

        tx.execute("DELETE FROM ticket_buckets", [])?;

        for (bucket, tickets) in [
            (Bucket::New, new_tickets),
            (Bucket::Mine, my_tickets),
            (Bucket::All, all_tickets),
        ] {
            for ticket in tickets {
                // A ticket present in the live pull is open by definition, so
                // this also un-archives one that was reopened after we cached
                // it from the archive.
                upsert_ticket(&tx, ticket, synced_at, false)?;
                tx.execute(
                    "INSERT OR IGNORE INTO ticket_buckets (ticket_id, bucket) VALUES (?1, ?2)",
                    params![ticket.id, bucket.as_str()],
                )?;
            }
        }

        // Anything not in this pull is closed or no longer visible. Archived
        // rows are exempt: they were fetched deliberately and were never
        // expected to appear here.
        tx.execute(
            "DELETE FROM tickets \
             WHERE archived = 0 AND id NOT IN (SELECT ticket_id FROM ticket_buckets)",
            [],
        )?;

        let current_new = bucket_ids(&tx, Bucket::New)?;
        let current_mine = bucket_ids(&tx, Bucket::Mine)?;

        tx.commit()?;

        Ok(SyncDiff {
            // On the very first sync everything is "new"; reporting that would
            // notify about the entire backlog.
            newly_in_pool: if is_first_sync {
                Vec::new()
            } else {
                current_new.iter().filter(|id| !previous_new.contains(id)).copied().collect()
            },
            newly_assigned: if is_first_sync {
                Vec::new()
            } else {
                current_mine.iter().filter(|id| !previous_mine.contains(id)).copied().collect()
            },
            is_first_sync,
        })
    }

    pub fn get_ticket(&self, id: i64) -> Result<Option<Ticket>, StoreError> {
        let conn = self.conn.lock().expect("store mutex poisoned");
        conn.query_row(
            &format!("SELECT {TICKET_COLUMNS} FROM tickets t WHERE t.id = ?1"),
            params![id],
            row_to_ticket,
        )
        .optional()
        .map_err(Into::into)
    }

    /// Upserts a single ticket without touching bucket membership.
    ///
    /// Used by the `getTicketById` fallback so a ticket fetched individually is
    /// still cached, but does not pretend to know which bucket it belongs to.
    ///
    /// Such a ticket has no bucket rows, so it would be purged by the next sync
    /// unless it is marked archived — which is exactly right for a closed one
    /// and merely means an open one is refreshed from the pull instead.
    pub fn put_ticket(
        &self,
        ticket: &Ticket,
        synced_at: i64,
        archived: bool,
    ) -> Result<(), StoreError> {
        let conn = self.conn.lock().expect("store mutex poisoned");
        upsert_ticket(&conn, ticket, synced_at, archived)
    }

    /// Caches a batch of archived tickets in one transaction.
    ///
    /// Tickets already known from the live sync are left alone: their rows come
    /// from `getTickets`, which loads relations `getCompanyById` does not, so
    /// overwriting them would blank out the subject, pool and message count of
    /// every open ticket the customer happens to have.
    pub fn put_archived(&self, tickets: &[Ticket], synced_at: i64) -> Result<usize, StoreError> {
        let mut conn = self.conn.lock().expect("store mutex poisoned");
        let tx = conn.transaction()?;

        let mut written = 0;
        for ticket in tickets {
            let is_live: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM ticket_buckets WHERE ticket_id = ?1)",
                params![ticket.id],
                |r| r.get(0),
            )?;
            if is_live {
                continue;
            }

            upsert_ticket(&tx, ticket, synced_at, true)?;
            written += 1;
        }

        tx.commit()?;
        Ok(written)
    }

    /// Replaces the cached customer list.
    pub fn replace_customers(
        &self,
        customers: &[Customer],
        synced_at: i64,
    ) -> Result<(), StoreError> {
        let mut conn = self.conn.lock().expect("store mutex poisoned");
        let tx = conn.transaction()?;

        tx.execute("DELETE FROM companies", [])?;
        for customer in customers {
            tx.execute(
                "INSERT OR REPLACE INTO companies \
                 (id, name, number, zip, location, passive, synced_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    customer.id,
                    customer.name,
                    customer.number,
                    customer.zip,
                    customer.location,
                    customer.passive,
                    synced_at,
                ],
            )?;
        }

        tx.commit()?;
        Ok(())
    }

    /// Customers matching a partial name or customer number.
    ///
    /// Ranked so that typing the beginning of a name puts it at the top, which
    /// is the whole point: nobody remembers whether the record reads "Müller
    /// GmbH", "Mueller GmbH & Co. KG" or "Müller Logistik".
    ///
    /// An empty query returns the first `limit` customers alphabetically, so
    /// typing `firma:` alone still offers something to pick from.
    pub fn search_customers(&self, query: &str, limit: i64) -> Result<Vec<Customer>, StoreError> {
        let conn = self.conn.lock().expect("store mutex poisoned");
        let needle = query.trim().to_lowercase();

        let mut stmt = conn.prepare(
            "SELECT id, name, number, zip, location, passive FROM companies \
             WHERE ?1 = '' OR ulower(name) LIKE ?2 OR ulower(number) LIKE ?2 \
             ORDER BY \
               CASE WHEN ?1 = '' THEN 0 \
                    WHEN ulower(name) = ?1 THEN 0 \
                    WHEN ulower(name) LIKE ?3 THEN 1 \
                    WHEN ulower(number) = ?1 THEN 1 \
                    ELSE 2 END ASC, \
               passive ASC, \
               CASE WHEN ?1 = '' THEN 0 ELSE length(name) END ASC, \
               name COLLATE NOCASE ASC \
             LIMIT ?4",
        )?;

        let rows = stmt.query_map(
            params![needle, format!("%{needle}%"), format!("{needle}%"), limit],
            |row| {
                Ok(Customer {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    number: row.get(2)?,
                    zip: row.get(3)?,
                    location: row.get(4)?,
                    passive: row.get(5)?,
                })
            },
        )?;

        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    /// Queries the local store. This replaces client-side filtering over a
    /// partially-loaded list, so results cover every synced ticket rather than
    /// the first 50 rendered.
    pub fn query(&self, q: &TicketQuery) -> Result<Vec<Ticket>, StoreError> {
        let conn = self.conn.lock().expect("store mutex poisoned");

        let mut sql = format!("SELECT {TICKET_COLUMNS} FROM tickets t");
        let mut clauses: Vec<String> = Vec::new();
        let mut args: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(bucket) = q.bucket {
            sql.push_str(" JOIN ticket_buckets b ON b.ticket_id = t.id");
            clauses.push("b.bucket = ?".into());
            args.push(Box::new(bucket.as_str().to_string()));
        }

        // Archived rows have no bucket, so a bucket query already excludes
        // them; this is what lets the archive be asked for on its own.
        if let Some(archived) = q.archived {
            clauses.push("t.archived = ?".into());
            args.push(Box::new(i64::from(archived)));
        }

        if let Some(search) = q.search.as_ref().filter(|s| !s.trim().is_empty()) {
            let like = format!("%{}%", search.trim().to_lowercase());
            clauses.push(
                "(ulower(t.summary) LIKE ? OR ulower(t.description) LIKE ? \
                  OR ulower(t.company_name) LIKE ? OR CAST(t.id AS TEXT) LIKE ? \
                  OR ulower(t.template_data) LIKE ?)"
                    .into(),
            );
            for _ in 0..5 {
                args.push(Box::new(like.clone()));
            }
        }

        if let Some(id) = q.id {
            clauses.push("t.id = ?".into());
            args.push(Box::new(id));
        }

        if let Some(company_id) = q.company_id {
            clauses.push("t.company_id = ?".into());
            args.push(Box::new(company_id));
        }

        if let Some(name) = q.company_name.as_ref().filter(|s| !s.trim().is_empty()) {
            clauses.push("ulower(t.company_name) LIKE ?".into());
            args.push(Box::new(format!("%{}%", name.trim().to_lowercase())));
        }

        if let Some(status) = q.status.as_ref().filter(|s| !s.is_empty()) {
            // Prefix match so `status:warten` finds every "Warten auf …" variant
            // without the user typing the whole label.
            clauses.push("ulower(t.status) LIKE ?".into());
            args.push(Box::new(format!("{}%", status.to_lowercase())));
        }

        if let Some(priority) = q.priority.as_ref().filter(|s| !s.is_empty()) {
            clauses.push("ulower(t.priority) = ?".into());
            args.push(Box::new(priority.to_lowercase()));
        }

        // Sortable dates are ISO, so plain string comparison is chronological.
        if let Some(from) = q.date_from.as_ref().filter(|s| !s.is_empty()) {
            clauses.push("t.created_at_sortable >= ?".into());
            args.push(Box::new(from.clone()));
        }
        if let Some(to) = q.date_to.as_ref().filter(|s| !s.is_empty()) {
            clauses.push("t.created_at_sortable <= ?".into());
            args.push(Box::new(format!("{to}T23:59")));
        }

        if !clauses.is_empty() {
            sql.push_str(" WHERE ");
            sql.push_str(&clauses.join(" AND "));
        }

        sql.push_str(match q.sort {
            TicketSort::DateDesc => " ORDER BY t.created_at_sortable DESC, t.id DESC",
            TicketSort::DateAsc => " ORDER BY t.created_at_sortable ASC, t.id ASC",
            TicketSort::PriorityHigh => " ORDER BY t.priority_index DESC, t.id DESC",
            TicketSort::PriorityLow => " ORDER BY t.priority_index ASC, t.id DESC",
            TicketSort::IdDesc => " ORDER BY t.id DESC",
            TicketSort::IdAsc => " ORDER BY t.id ASC",
            TicketSort::CompanyAsc => " ORDER BY t.company_name COLLATE NOCASE ASC, t.id DESC",
            TicketSort::CompanyDesc => " ORDER BY t.company_name COLLATE NOCASE DESC, t.id DESC",
            TicketSort::StatusAsc => " ORDER BY t.status COLLATE NOCASE ASC, t.id DESC",
            TicketSort::StatusDesc => " ORDER BY t.status COLLATE NOCASE DESC, t.id DESC",
        });

        if let Some(limit) = q.limit {
            sql.push_str(&format!(" LIMIT {limit}"));
            if let Some(offset) = q.offset {
                sql.push_str(&format!(" OFFSET {offset}"));
            }
        }

        let mut stmt = conn.prepare(&sql)?;
        let refs: Vec<&dyn rusqlite::ToSql> = args.iter().map(|a| a.as_ref()).collect();
        let rows = stmt.query_map(refs.as_slice(), row_to_ticket)?;

        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn counts(&self) -> Result<BucketCounts, StoreError> {
        let conn = self.conn.lock().expect("store mutex poisoned");
        let count = |bucket: Bucket| -> Result<i64, rusqlite::Error> {
            conn.query_row(
                "SELECT COUNT(*) FROM ticket_buckets WHERE bucket = ?1",
                params![bucket.as_str()],
                |r| r.get(0),
            )
        };

        Ok(BucketCounts {
            new: count(Bucket::New)?,
            mine: count(Bucket::Mine)?,
            all: count(Bucket::All)?,
            archive: conn.query_row(
                "SELECT COUNT(*) FROM tickets WHERE archived = 1",
                [],
                |r| r.get(0),
            )?,
        })
    }

    pub fn set_meta(&self, key: &str, value: &str) -> Result<(), StoreError> {
        let conn = self.conn.lock().expect("store mutex poisoned");
        conn.execute(
            "INSERT INTO meta (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn get_meta(&self, key: &str) -> Result<Option<String>, StoreError> {
        let conn = self.conn.lock().expect("store mutex poisoned");
        conn.query_row("SELECT value FROM meta WHERE key = ?1", params![key], |r| {
            r.get(0)
        })
        .optional()
        .map_err(Into::into)
    }

    /// Drops everything. Used on logout so one user's tickets are never visible
    /// to the next person who signs in on the same machine.
    pub fn clear(&self) -> Result<(), StoreError> {
        let conn = self.conn.lock().expect("store mutex poisoned");
        conn.execute_batch(
            "DELETE FROM ticket_buckets; DELETE FROM tickets; \
             DELETE FROM companies; DELETE FROM meta;",
        )?;
        Ok(())
    }
}

const TICKET_COLUMNS: &str = "t.id, t.description, t.status, t.status_id, t.summary, t.subject, \
     t.priority, t.priority_index, t.ticket_creator, t.ticket_user, t.ticket_user_phone, \
     t.ticket_terminated_user, t.pool_name, t.play_status, t.attachments, t.my_ticket_id, \
     t.location_id, t.dyn_template_id, t.company, t.created_at, t.ticket_start, \
     t.ticket_messages_count, t.template_data";

fn row_to_ticket(row: &rusqlite::Row) -> Result<Ticket, rusqlite::Error> {
    let attachments: String = row.get(14)?;
    let company: String = row.get(18)?;

    Ok(Ticket {
        id: row.get(0)?,
        description: row.get(1)?,
        status: row.get(2)?,
        status_id: row.get(3)?,
        summary: row.get(4)?,
        subject: row.get(5)?,
        priority: row.get(6)?,
        index: row.get(7)?,
        ticket_creator: row.get(8)?,
        ticket_user: row.get(9)?,
        ticket_user_phone: row.get(10)?,
        ticket_terminated_user: row.get(11)?,
        pool_name: row.get(12)?,
        play_status: row.get(13)?,
        attachments: serde_json::from_str(&attachments).unwrap_or_default(),
        my_ticket_id: row.get(15)?,
        location_id: row.get(16)?,
        dyn_template_id: row.get(17)?,
        company: serde_json::from_str::<Company>(&company).unwrap_or_default(),
        created_at: row.get(19)?,
        ticket_start: row.get(20)?,
        ticket_messages_count: row.get(21)?,
        template_data: row.get(22)?,
    })
}

/// Registers `ulower(text)`, a Unicode-aware replacement for SQLite's own
/// `lower()`.
///
/// The built-in folds ASCII only, so a customer stored as "MÜLLER GMBH" does
/// not match a search for "müller" — the Ü survives `lower()` untouched while
/// the needle, lowercased in Rust, does not. On German customer names that is
/// not a corner case, and it would have shown up as the search box suggesting a
/// company whose tickets the very next query then failed to find.
fn register_unicode_lower(conn: &Connection) -> Result<(), StoreError> {
    conn.create_scalar_function(
        "ulower",
        1,
        FunctionFlags::SQLITE_UTF8 | FunctionFlags::SQLITE_DETERMINISTIC,
        |ctx| {
            Ok(ctx
                .get_raw(0)
                .as_str()
                .map(str::to_lowercase)
                .unwrap_or_default())
        },
    )?;
    Ok(())
}

/// Adds a column to an existing table when a previous version wrote the
/// database without it. `ALTER TABLE ... ADD COLUMN` has no `IF NOT EXISTS`, so
/// the column list is checked first.
fn add_column_if_missing(
    conn: &Connection,
    table: &str,
    column: &str,
    definition: &str,
) -> Result<(), StoreError> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let existing: Vec<String> = stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<Result<_, _>>()?;

    if existing.iter().any(|name| name == column) {
        return Ok(());
    }

    conn.execute_batch(&format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"))?;
    Ok(())
}

fn upsert_ticket(
    conn: &Connection,
    ticket: &Ticket,
    synced_at: i64,
    archived: bool,
) -> Result<(), StoreError> {
    conn.execute(
        r#"
        INSERT INTO tickets (
            id, description, status, status_id, summary, subject, priority, priority_index,
            ticket_creator, ticket_user, ticket_user_phone, ticket_terminated_user, pool_name,
            play_status, attachments, my_ticket_id, location_id, dyn_template_id,
            company, company_id, company_name, created_at, created_at_sortable, ticket_start,
            ticket_messages_count, template_data, synced_at, archived
        ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18,
            ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28
        )
        ON CONFLICT(id) DO UPDATE SET
            description = excluded.description,
            status = excluded.status,
            status_id = excluded.status_id,
            summary = excluded.summary,
            subject = excluded.subject,
            priority = excluded.priority,
            priority_index = excluded.priority_index,
            ticket_creator = excluded.ticket_creator,
            ticket_user = excluded.ticket_user,
            ticket_user_phone = excluded.ticket_user_phone,
            ticket_terminated_user = excluded.ticket_terminated_user,
            pool_name = excluded.pool_name,
            play_status = excluded.play_status,
            attachments = excluded.attachments,
            my_ticket_id = excluded.my_ticket_id,
            location_id = excluded.location_id,
            dyn_template_id = excluded.dyn_template_id,
            company = excluded.company,
            company_id = excluded.company_id,
            company_name = excluded.company_name,
            created_at = excluded.created_at,
            created_at_sortable = excluded.created_at_sortable,
            ticket_start = excluded.ticket_start,
            ticket_messages_count = excluded.ticket_messages_count,
            template_data = excluded.template_data,
            synced_at = excluded.synced_at,
            archived = excluded.archived
        "#,
        params![
            ticket.id,
            ticket.description,
            ticket.status,
            ticket.status_id,
            ticket.summary,
            ticket.subject,
            ticket.priority,
            ticket.index,
            ticket.ticket_creator,
            ticket.ticket_user,
            ticket.ticket_user_phone,
            ticket.ticket_terminated_user,
            ticket.pool_name,
            ticket.play_status,
            serde_json::to_string(&ticket.attachments)?,
            ticket.my_ticket_id,
            ticket.location_id,
            ticket.dyn_template_id,
            serde_json::to_string(&ticket.company)?,
            ticket.company.id,
            ticket.company.name,
            ticket.created_at,
            crate::datetime::to_sortable(&ticket.created_at),
            ticket.ticket_start,
            ticket.ticket_messages_count,
            ticket.template_data,
            synced_at,
            i64::from(archived),
        ],
    )?;
    Ok(())
}

fn bucket_ids(conn: &Connection, bucket: Bucket) -> Result<Vec<i64>, rusqlite::Error> {
    let mut stmt =
        conn.prepare("SELECT ticket_id FROM ticket_buckets WHERE bucket = ?1")?;
    let ids = stmt
        .query_map(params![bucket.as_str()], |r| r.get(0))?
        .collect::<Result<Vec<i64>, _>>()?;
    Ok(ids)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum TicketSort {
    #[default]
    DateDesc,
    DateAsc,
    PriorityHigh,
    PriorityLow,
    IdDesc,
    IdAsc,
    CompanyAsc,
    CompanyDesc,
    StatusAsc,
    StatusDesc,
}

#[derive(Debug, Clone, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TicketQuery {
    pub bucket: Option<Bucket>,
    pub search: Option<String>,
    /// Exact ticket id, from an `id:` term in structured search.
    pub id: Option<i64>,
    pub company_id: Option<i64>,
    /// Substring match on the company name, from a `firma:` term. Distinct
    /// from `search`, which also spans summary, description and template data.
    pub company_name: Option<String>,
    /// `Some(true)` asks for cached closed tickets only, `Some(false)` for live
    /// ones only. `None` spans both, which is what a lookup by ticket number
    /// wants.
    pub archived: Option<bool>,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    #[serde(default)]
    pub sort: TicketSort,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct BucketCounts {
    pub new: i64,
    pub mine: i64,
    pub all: i64,
    /// Closed tickets currently cached. Unlike the others this is not a
    /// server-side total — it counts what has been pulled into the archive so
    /// far, which is what the tab needs to label itself.
    pub archive: i64,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncDiff {
    pub newly_in_pool: Vec<i64>,
    pub newly_assigned: Vec<i64>,
    pub is_first_sync: bool,
}

#[cfg(test)]
mod tests;
