use super::*;
use crate::api::models::{Company, Ticket};

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
    store.put_ticket(&ticket(77, "fetched by id"), 1).unwrap();

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
