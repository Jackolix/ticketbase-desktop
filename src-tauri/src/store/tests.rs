use super::*;
use crate::api::models::{Company, Customer, Ticket};

fn ticket(id: i64, summary: &str) -> Ticket {
    Ticket {
        id,
        description: String::new(),
        status: "In Arbeit".into(),
        status_id: 3,
        summary: summary.into(),
        subject: "E-Mail".into(),
        priority: "Hoch".into(),
        index: 3,
        ticket_creator: "Anna Weber".into(),
        ticket_user: "Jonas Müller".into(),
        ticket_user_phone: String::new(),
        ticket_terminated_user: String::new(),
        pool_name: "Nord".into(),
        play_status: None,
        attachments: vec!["screenshot.png".into()],
        my_ticket_id: 17,
        location_id: 42,
        dyn_template_id: 0,
        company: Company {
            id: 8,
            name: "Müller Logistik".into(),
            ..Default::default()
        },
        created_at: "02-09-2026 08:14".into(),
        ticket_start: String::new(),
        ticket_messages_count: 2,
        template_data: String::new(),
    }
}

fn with_date(id: i64, created_at: &str) -> Ticket {
    Ticket {
        created_at: created_at.into(),
        ..ticket(id, "x")
    }
}

#[test]
fn round_trips_a_ticket_with_every_field_intact() {
    let store = Store::open_in_memory().unwrap();
    let t = ticket(4812, "Mailversand gestört");

    store.replace_all(&[], std::slice::from_ref(&t), &[], 1).unwrap();

    let loaded = store.get_ticket(4812).unwrap().expect("should be present");
    assert_eq!(loaded, t);
    // The fields the old getTicketById transform silently dropped:
    assert_eq!(loaded.attachments, vec!["screenshot.png"]);
    assert_eq!(loaded.pool_name, "Nord");
    assert_eq!(loaded.ticket_messages_count, 2);
}

#[test]
fn a_ticket_can_be_in_several_buckets_at_once() {
    let store = Store::open_in_memory().unwrap();
    let t = ticket(1, "shared");

    let one = std::slice::from_ref(&t);
    store.replace_all(one, one, one, 1).unwrap();

    let counts = store.counts().unwrap();
    assert_eq!(counts.new, 1);
    assert_eq!(counts.mine, 1);
    assert_eq!(counts.all, 1);

    // Still one row, three memberships.
    let all = store.query(&TicketQuery::default()).unwrap();
    assert_eq!(all.len(), 1);
}

#[test]
fn tickets_missing_from_a_sync_are_removed() {
    let store = Store::open_in_memory().unwrap();
    store
        .replace_all(&[], &[ticket(1, "a"), ticket(2, "b")], &[], 1)
        .unwrap();
    assert_eq!(store.query(&TicketQuery::default()).unwrap().len(), 2);

    // Ticket 2 was closed server-side and no longer comes back.
    store.replace_all(&[], &[ticket(1, "a")], &[], 2).unwrap();

    assert_eq!(store.query(&TicketQuery::default()).unwrap().len(), 1);
    assert!(store.get_ticket(2).unwrap().is_none());
}

#[test]
fn first_sync_reports_no_new_tickets() {
    let store = Store::open_in_memory().unwrap();

    let diff = store
        .replace_all(&[ticket(1, "a"), ticket(2, "b")], &[], &[], 1)
        .unwrap();

    // Otherwise signing in would notify about the entire backlog at once.
    assert!(diff.is_first_sync);
    assert!(diff.newly_in_pool.is_empty());
    assert!(diff.newly_assigned.is_empty());
}

#[test]
fn later_syncs_report_only_genuinely_new_tickets() {
    let store = Store::open_in_memory().unwrap();
    store.replace_all(&[ticket(1, "a")], &[], &[], 1).unwrap();

    let diff = store
        .replace_all(&[ticket(1, "a"), ticket(2, "b")], &[ticket(3, "c")], &[], 2)
        .unwrap();

    assert!(!diff.is_first_sync);
    assert_eq!(diff.newly_in_pool, vec![2]);
    assert_eq!(diff.newly_assigned, vec![3]);
}

#[test]
fn search_covers_every_synced_ticket_not_just_a_page() {
    let store = Store::open_in_memory().unwrap();
    let many: Vec<Ticket> = (1..=500)
        .map(|i| ticket(i, if i == 480 { "Exchange down" } else { "routine" }))
        .collect();
    store.replace_all(&[], &many, &[], 1).unwrap();

    let found = store
        .query(&TicketQuery {
            search: Some("exchange".into()),
            ..Default::default()
        })
        .unwrap();

    // The old client filtered only the 50 rendered rows, so #480 was invisible.
    assert_eq!(found.len(), 1);
    assert_eq!(found[0].id, 480);
}

#[test]
fn search_is_case_insensitive_and_matches_id_and_company() {
    let store = Store::open_in_memory().unwrap();
    store.replace_all(&[], &[ticket(4812, "Mailversand")], &[], 1).unwrap();

    for term in ["MAILVERSAND", "4812", "müller logistik"] {
        let found = store
            .query(&TicketQuery {
                search: Some(term.into()),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(found.len(), 1, "term {term:?} should match");
    }
}

#[test]
fn date_sort_is_chronological_past_the_twelfth() {
    let store = Store::open_in_memory().unwrap();
    store
        .replace_all(
            &[],
            &[
                with_date(1, "25-12-2026"),
                with_date(2, "02-09-2026 08:14"),
                with_date(3, "01-09-2026 16:31"),
            ],
            &[],
            1,
        )
        .unwrap();

    let asc = store
        .query(&TicketQuery {
            sort: TicketSort::DateAsc,
            ..Default::default()
        })
        .unwrap();

    // Naive parsing made this order undefined; 25-12 was Invalid Date.
    assert_eq!(asc.iter().map(|t| t.id).collect::<Vec<_>>(), vec![3, 2, 1]);

    let desc = store
        .query(&TicketQuery {
            sort: TicketSort::DateDesc,
            ..Default::default()
        })
        .unwrap();
    assert_eq!(desc.iter().map(|t| t.id).collect::<Vec<_>>(), vec![1, 2, 3]);
}

#[test]
fn date_range_filter_uses_the_normalised_value() {
    let store = Store::open_in_memory().unwrap();
    store
        .replace_all(
            &[],
            &[
                with_date(1, "01-09-2026 10:00"),
                with_date(2, "15-09-2026 10:00"),
                with_date(3, "25-12-2026"),
            ],
            &[],
            1,
        )
        .unwrap();

    let found = store
        .query(&TicketQuery {
            date_from: Some("2026-09-01".into()),
            date_to: Some("2026-09-30".into()),
            sort: TicketSort::IdAsc,
            ..Default::default()
        })
        .unwrap();

    assert_eq!(found.iter().map(|t| t.id).collect::<Vec<_>>(), vec![1, 2]);
}

#[test]
fn filters_by_bucket_company_status_and_priority() {
    let store = Store::open_in_memory().unwrap();
    let mut other = ticket(2, "other");
    other.company.id = 99;
    other.status = "Neu".into();
    other.priority = "Niedrig".into();

    store.replace_all(&[other.clone()], &[ticket(1, "mine")], &[], 1).unwrap();

    let mine = store
        .query(&TicketQuery {
            bucket: Some(Bucket::Mine),
            ..Default::default()
        })
        .unwrap();
    assert_eq!(mine.iter().map(|t| t.id).collect::<Vec<_>>(), vec![1]);

    let by_company = store
        .query(&TicketQuery {
            company_id: Some(99),
            ..Default::default()
        })
        .unwrap();
    assert_eq!(by_company.iter().map(|t| t.id).collect::<Vec<_>>(), vec![2]);

    let by_status = store
        .query(&TicketQuery {
            status: Some("neu".into()),
            ..Default::default()
        })
        .unwrap();
    assert_eq!(by_status.iter().map(|t| t.id).collect::<Vec<_>>(), vec![2]);

    let by_priority = store
        .query(&TicketQuery {
            priority: Some("HOCH".into()),
            ..Default::default()
        })
        .unwrap();
    assert_eq!(by_priority.iter().map(|t| t.id).collect::<Vec<_>>(), vec![1]);
}

#[test]
fn put_ticket_caches_without_claiming_bucket_membership() {
    let store = Store::open_in_memory().unwrap();
    store
        .put_ticket(&ticket(77, "fetched by id"), 1, true)
        .unwrap();

    assert!(store.get_ticket(77).unwrap().is_some());

    let counts = store.counts().unwrap();
    assert_eq!(counts.new + counts.mine + counts.all, 0);
}

#[test]
fn clear_removes_everything_for_the_next_user() {
    let store = Store::open_in_memory().unwrap();
    store.replace_all(&[], &[ticket(1, "a")], &[], 1).unwrap();
    store.set_meta("last_sync", "123").unwrap();

    store.clear().unwrap();

    assert!(store.query(&TicketQuery::default()).unwrap().is_empty());
}

#[test]
fn filters_by_exact_id_for_structured_search() {
    let store = Store::open_in_memory().unwrap();
    store
        .replace_all(&[], &[ticket(4812, "a"), ticket(4813, "b")], &[], 1)
        .unwrap();

    let found = store
        .query(&TicketQuery {
            id: Some(4812),
            ..Default::default()
        })
        .unwrap();

    assert_eq!(found.iter().map(|t| t.id).collect::<Vec<_>>(), vec![4812]);
}

#[test]
fn company_name_filter_matches_a_substring() {
    let store = Store::open_in_memory().unwrap();
    let mut other = ticket(2, "other");
    other.company.name = "Stadtwerke Bergheim".into();

    store.replace_all(&[], &[ticket(1, "mine"), other], &[], 1).unwrap();

    let found = store
        .query(&TicketQuery {
            company_name: Some("müller".into()),
            ..Default::default()
        })
        .unwrap();

    assert_eq!(found.iter().map(|t| t.id).collect::<Vec<_>>(), vec![1]);
}

#[test]
fn company_name_filter_does_not_span_other_columns() {
    let store = Store::open_in_memory().unwrap();
    // The summary mentions a company the ticket does not belong to.
    store
        .replace_all(&[], &[ticket(1, "Anruf von Stadtwerke Bergheim")], &[], 1)
        .unwrap();

    let found = store
        .query(&TicketQuery {
            company_name: Some("stadtwerke".into()),
            ..Default::default()
        })
        .unwrap();

    // Unlike `search`, this is scoped to the company column.
    assert!(found.is_empty());
}

#[test]
fn status_filter_matches_by_prefix() {
    let store = Store::open_in_memory().unwrap();
    let mut waiting = ticket(2, "waiting");
    waiting.status = "Warten auf Rückmeldung (extern)".into();

    store.replace_all(&[], &[ticket(1, "a"), waiting], &[], 1).unwrap();

    // So `status:warten` finds every "Warten auf …" variant.
    let found = store
        .query(&TicketQuery {
            status: Some("warten".into()),
            ..Default::default()
        })
        .unwrap();

    assert_eq!(found.iter().map(|t| t.id).collect::<Vec<_>>(), vec![2]);
}

// --------------------------------------------------------------------------
// The archive.
//
// getTicketsQuery filters `status_id != 4`, so a closed ticket is not merely
// absent from the current pull — it can never appear in one. These tests pin
// the consequence: the purge that keeps the live set honest must not treat an
// archived row as stale.
// --------------------------------------------------------------------------

fn closed(id: i64, summary: &str) -> Ticket {
    Ticket {
        status: "Abgeschlossen".into(),
        status_id: 4,
        ..ticket(id, summary)
    }
}

fn customer(id: i64, name: &str, number: &str) -> Customer {
    Customer {
        id,
        name: name.into(),
        number: number.into(),
        zip: "50667".into(),
        location: "Köln".into(),
        passive: 0,
    }
}

#[test]
fn archived_tickets_survive_a_sync_that_never_mentions_them() {
    let store = Store::open_in_memory().unwrap();

    store.put_archived(&[closed(900, "letztes Jahr")], 1).unwrap();
    // A perfectly ordinary sync: the closed ticket is nowhere in it, because
    // the backend cannot return it.
    store.replace_all(&[], &[ticket(1, "offen")], &[], 2).unwrap();

    assert!(
        store.get_ticket(900).unwrap().is_some(),
        "the purge dropped a ticket the backend was never going to send"
    );
}

#[test]
fn the_archive_can_be_queried_on_its_own() {
    let store = Store::open_in_memory().unwrap();

    store.replace_all(&[], &[ticket(1, "offen")], &[], 1).unwrap();
    store.put_archived(&[closed(900, "erledigt")], 1).unwrap();

    let archived = store
        .query(&TicketQuery {
            archived: Some(true),
            ..Default::default()
        })
        .unwrap();
    assert_eq!(archived.iter().map(|t| t.id).collect::<Vec<_>>(), vec![900]);

    let live = store
        .query(&TicketQuery {
            archived: Some(false),
            ..Default::default()
        })
        .unwrap();
    assert_eq!(live.iter().map(|t| t.id).collect::<Vec<_>>(), vec![1]);

    // A lookup by number spans both, which is the point of leaving it None.
    let both = store.query(&TicketQuery::default()).unwrap();
    assert_eq!(both.len(), 2);
}

#[test]
fn archiving_never_overwrites_a_ticket_the_live_sync_owns() {
    let store = Store::open_in_memory().unwrap();
    store.replace_all(&[], &[ticket(1, "offen")], &[], 1).unwrap();

    // getCompanyById loads none of the relations getTickets does, so its copy
    // of an open ticket is missing the subject, pool and message count.
    let stripped = Ticket {
        subject: String::new(),
        pool_name: String::new(),
        ticket_messages_count: 0,
        ..ticket(1, "offen")
    };
    let written = store
        .put_archived(&[stripped, closed(900, "erledigt")], 2)
        .unwrap();

    assert_eq!(written, 1, "only the ticket the sync does not own");

    let live = store.get_ticket(1).unwrap().unwrap();
    assert_eq!(live.subject, "E-Mail");
    assert_eq!(live.pool_name, "Nord");
    assert_eq!(live.ticket_messages_count, 2);
}

#[test]
fn a_reopened_ticket_rejoins_the_live_set() {
    let store = Store::open_in_memory().unwrap();
    store.put_archived(&[closed(900, "erledigt")], 1).unwrap();

    // Someone reopens it, so the next pull does include it.
    let reopened = Ticket {
        status: "Wieder geöffnet".into(),
        status_id: 8,
        ..ticket(900, "erledigt")
    };
    store.replace_all(&[], &[reopened], &[], 2).unwrap();

    let archived = store
        .query(&TicketQuery {
            archived: Some(true),
            ..Default::default()
        })
        .unwrap();
    assert!(archived.is_empty(), "it is live again, not archived");
    assert_eq!(store.counts().unwrap().mine, 1);
}

#[test]
fn counts_report_the_archive_separately() {
    let store = Store::open_in_memory().unwrap();
    store.replace_all(&[], &[ticket(1, "a")], &[], 1).unwrap();
    store
        .put_archived(&[closed(900, "x"), closed(901, "y")], 1)
        .unwrap();

    let counts = store.counts().unwrap();
    assert_eq!(counts.mine, 1);
    assert_eq!(counts.archive, 2);
    // The archive is not a bucket, so it must not inflate the live tabs.
    assert_eq!(counts.all, 0);
}

// --------------------------------------------------------------------------
// Customer suggestions.
// --------------------------------------------------------------------------

#[test]
fn customer_search_puts_the_name_you_started_typing_first() {
    let store = Store::open_in_memory().unwrap();
    store
        .replace_customers(
            &[
                customer(1, "Bäckerei Müller", "K-2001"),
                customer(2, "Müller Logistik GmbH", "K-1042"),
                customer(3, "Schmidt AG", "K-3003"),
            ],
            1,
        )
        .unwrap();

    let hits = store.search_customers("müller", 10).unwrap();

    // Both contain it; only one starts with it.
    assert_eq!(
        hits.iter().map(|c| c.id).collect::<Vec<_>>(),
        vec![2, 1],
        "a prefix match has to outrank a match buried mid-name"
    );
}

#[test]
fn customer_search_also_matches_the_customer_number() {
    let store = Store::open_in_memory().unwrap();
    store
        .replace_customers(&[customer(2, "Müller Logistik GmbH", "K-1042")], 1)
        .unwrap();

    let hits = store.search_customers("1042", 10).unwrap();
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].id, 2);
}

#[test]
fn an_empty_query_offers_something_to_pick_from() {
    let store = Store::open_in_memory().unwrap();
    store
        .replace_customers(
            &[
                customer(3, "Schmidt AG", "K-3003"),
                customer(1, "Bäckerei Müller", "K-2001"),
            ],
            1,
        )
        .unwrap();

    // Typing `firma:` alone should still drop a list down, alphabetically.
    let hits = store.search_customers("", 10).unwrap();
    assert_eq!(hits.iter().map(|c| c.id).collect::<Vec<_>>(), vec![1, 3]);

    assert_eq!(store.search_customers("", 1).unwrap().len(), 1);
}

#[test]
fn inactive_customers_rank_below_active_ones_without_disappearing() {
    let store = Store::open_in_memory().unwrap();
    store
        .replace_customers(
            &[
                Customer {
                    passive: 1,
                    ..customer(1, "Müller alt", "K-1")
                },
                customer(2, "Müller neu", "K-2"),
            ],
            1,
        )
        .unwrap();

    let hits = store.search_customers("müller", 10).unwrap();
    // Their closed tickets are exactly what an archive search is for, so a
    // passive customer must still be reachable.
    assert_eq!(hits.iter().map(|c| c.id).collect::<Vec<_>>(), vec![2, 1]);
}

#[test]
fn signing_out_clears_the_customer_cache_too() {
    let store = Store::open_in_memory().unwrap();
    store
        .replace_customers(&[customer(1, "Müller Logistik", "K-1042")], 1)
        .unwrap();

    store.clear().unwrap();

    assert!(store.search_customers("müller", 10).unwrap().is_empty());
}

#[test]
fn an_upgraded_database_gains_the_archived_column() {
    // Simulates a store written before archiving existed: the column is added
    // in place rather than the cache being thrown away.
    let conn = rusqlite::Connection::open_in_memory().unwrap();
    conn.execute_batch("CREATE TABLE tickets (id INTEGER PRIMARY KEY);")
        .unwrap();

    add_column_if_missing(&conn, "tickets", "archived", "INTEGER NOT NULL DEFAULT 0").unwrap();
    // Idempotent: startup runs it on every launch.
    add_column_if_missing(&conn, "tickets", "archived", "INTEGER NOT NULL DEFAULT 0").unwrap();

    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM tickets WHERE archived = 0", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert_eq!(count, 0);
}

// --------------------------------------------------------------------------
// Case folding.
//
// SQLite's own lower() folds ASCII only, so "MÜLLER" stays "MÜLLER" while a
// needle lowercased in Rust becomes "müller" and the two never meet. On German
// customer names that is not a corner case: it would show a suggestion for a
// company and then find none of its tickets.
// --------------------------------------------------------------------------

#[test]
fn an_all_caps_customer_name_still_matches_a_lowercase_search() {
    let store = Store::open_in_memory().unwrap();
    store
        .replace_customers(&[customer(1, "MÜLLER LOGISTIK GMBH", "K-1042")], 1)
        .unwrap();

    let hits = store.search_customers("müller", 10).unwrap();
    assert_eq!(hits.len(), 1, "SQLite's lower() would have missed this");
}

#[test]
fn the_company_filter_folds_umlauts_the_same_way() {
    let store = Store::open_in_memory().unwrap();
    let t = Ticket {
        company: Company {
            id: 8,
            name: "MÜLLER LOGISTIK GMBH".into(),
            ..Default::default()
        },
        ..ticket(1, "offen")
    };
    store.replace_all(&[], &[t], &[], 1).unwrap();

    let hits = store
        .query(&TicketQuery {
            company_name: Some("müller".into()),
            ..Default::default()
        })
        .unwrap();
    assert_eq!(hits.len(), 1);

    // And through free text, which spans the same column.
    let hits = store
        .query(&TicketQuery {
            search: Some("MÜLLER".into()),
            ..Default::default()
        })
        .unwrap();
    assert_eq!(hits.len(), 1);
}

// --------------------------------------------------------------------------
// Timers.
//
// The backend cannot say how long a running timer has been going:
// getPlayerStatus computes the elapsed seconds into $total_raw_time and then
// assigns $total_raw_time = 0 before returning, and its total_time is a
// rounded billing figure that stays 0 until the first pause. This is the
// client's own record, and it has to survive a window being closed.
// --------------------------------------------------------------------------

const T0: i64 = 1_700_000_000_000;
const MINUTE: i64 = 60_000;

#[test]
fn a_running_timer_survives_the_window_closing() {
    let store = Store::open_in_memory().unwrap();
    store.timer_start(4812, 17, T0).unwrap();

    // Reopened five minutes later: a fresh read, as a new window would do.
    let timer = store.timer(4812, 17, T0 + 5 * MINUTE).unwrap().unwrap();

    assert!(timer.running);
    assert_eq!(timer.elapsed_ms, 5 * MINUTE, "it restarted from zero");
}

#[test]
fn pausing_banks_the_time_and_resuming_continues_from_it() {
    let store = Store::open_in_memory().unwrap();

    store.timer_start(4812, 17, T0).unwrap();
    store.timer_pause(4812, 17, T0 + 5 * MINUTE).unwrap();

    let paused = store.timer(4812, 17, T0 + 60 * MINUTE).unwrap().unwrap();
    assert!(!paused.running);
    // An hour of being paused adds nothing.
    assert_eq!(paused.elapsed_ms, 5 * MINUTE);

    store.timer_resume(4812, 17, 0, T0 + 60 * MINUTE).unwrap();
    let resumed = store.timer(4812, 17, T0 + 63 * MINUTE).unwrap().unwrap();

    assert!(resumed.running);
    assert_eq!(resumed.elapsed_ms, 8 * MINUTE);
}

#[test]
fn resuming_a_running_timer_does_not_restart_it() {
    // Two windows are open; both reconcile with the server and both see it
    // running. The second must not reset the first.
    let store = Store::open_in_memory().unwrap();
    store.timer_start(4812, 17, T0).unwrap();

    store.timer_resume(4812, 17, 0, T0 + 5 * MINUTE).unwrap();

    let timer = store.timer(4812, 17, T0 + 5 * MINUTE).unwrap().unwrap();
    assert_eq!(timer.elapsed_ms, 5 * MINUTE);
}

#[test]
fn a_timer_started_elsewhere_is_adopted_with_what_the_server_knew() {
    // Started from the web UI, so there is no local record; the server's
    // rounded total is the only figure available.
    let store = Store::open_in_memory().unwrap();

    store.timer_resume(4812, 17, 15 * MINUTE, T0).unwrap();

    let timer = store.timer(4812, 17, T0 + 2 * MINUTE).unwrap().unwrap();
    assert!(timer.running);
    assert_eq!(timer.elapsed_ms, 17 * MINUTE);
}

#[test]
fn timers_are_per_ticket_and_per_user() {
    let store = Store::open_in_memory().unwrap();
    store.timer_start(4812, 17, T0).unwrap();

    assert!(store.timer(4813, 17, T0).unwrap().is_none());
    assert!(store.timer(4812, 18, T0).unwrap().is_none());
}

#[test]
fn clearing_forgets_the_timer() {
    let store = Store::open_in_memory().unwrap();
    store.timer_start(4812, 17, T0).unwrap();

    store.timer_clear(4812, 17).unwrap();

    assert!(store.timer(4812, 17, T0).unwrap().is_none());
}

#[test]
fn a_clock_that_jumps_backwards_never_counts_down() {
    // NTP corrections and manual clock changes both do this.
    let store = Store::open_in_memory().unwrap();
    store.timer_start(4812, 17, T0).unwrap();

    let timer = store.timer(4812, 17, T0 - 10 * MINUTE).unwrap().unwrap();
    assert_eq!(timer.elapsed_ms, 0);
}

#[test]
fn signing_out_clears_timers_with_everything_else() {
    let store = Store::open_in_memory().unwrap();
    store.timer_start(4812, 17, T0).unwrap();

    store.clear().unwrap();

    assert!(store.timer(4812, 17, T0).unwrap().is_none());
}

#[test]
fn a_timer_outlives_the_sync_purge() {
    // Timers are keyed by ticket, and a ticket can leave the live set while
    // its clock is still running — being closed by someone else, say.
    let store = Store::open_in_memory().unwrap();
    store.replace_all(&[], &[ticket(4812, "offen")], &[], 1).unwrap();
    store.timer_start(4812, 17, T0).unwrap();

    store.replace_all(&[], &[], &[], 2).unwrap();

    assert!(store.timer(4812, 17, T0 + MINUTE).unwrap().is_some());
}
