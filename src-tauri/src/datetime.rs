//! Ticket timestamp handling.
//!
//! The backend formats timestamps with PHP's `date('d-m-Y H:i')` — day first.
//! Sorting those strings directly puts the 25th of every month before the 2nd,
//! and parsing them as if they were month-first silently swaps day and month
//! (or fails outright past the 12th).
//!
//! `to_sortable` normalises them to `YYYY-MM-DDTHH:MM`, which sorts
//! chronologically as plain text — so SQLite can ORDER BY it directly with no
//! date functions and no collation surprises.

/// Converts a backend timestamp into a lexicographically sortable ISO string.
///
/// Unparseable input yields "", which sorts before everything ascending and
/// last descending. Callers keep the original string for display; this value is
/// only ever used for ordering and range filters.
pub fn to_sortable(raw: &str) -> String {
    let raw = raw.trim();
    if raw.is_empty() {
        return String::new();
    }

    // Already ISO-ish (getTicketById returns real timestamps): keep the date and
    // time portion, normalising the separator.
    if let Some(iso) = try_iso(raw) {
        return iso;
    }

    if let Some((date, time)) = try_d_m_y(raw) {
        return format!("{date}T{time}");
    }

    String::new()
}

fn try_iso(raw: &str) -> Option<String> {
    let bytes = raw.as_bytes();
    if bytes.len() < 10 {
        return None;
    }
    // YYYY-MM-DD
    let looks_iso = bytes[0..4].iter().all(u8::is_ascii_digit)
        && bytes[4] == b'-'
        && bytes[5..7].iter().all(u8::is_ascii_digit)
        && bytes[7] == b'-'
        && bytes[8..10].iter().all(u8::is_ascii_digit);
    if !looks_iso {
        return None;
    }

    let date = &raw[0..10];
    let time = raw
        .get(11..16)
        .filter(|t| t.len() == 5 && t.as_bytes()[2] == b':')
        .unwrap_or("00:00");

    Some(format!("{date}T{time}"))
}

fn try_d_m_y(raw: &str) -> Option<(String, String)> {
    let (date_part, time_part) = match raw.split_once(' ') {
        Some((d, t)) => (d, t.trim()),
        None => (raw, ""),
    };

    let mut segments = date_part.split('-');
    let day = segments.next()?;
    let month = segments.next()?;
    let year = segments.next()?;
    if segments.next().is_some() {
        return None;
    }

    if day.len() != 2 || month.len() != 2 || year.len() != 4 {
        return None;
    }
    if !day.bytes().chain(month.bytes()).chain(year.bytes()).all(|b| b.is_ascii_digit()) {
        return None;
    }

    let day_n: u32 = day.parse().ok()?;
    let month_n: u32 = month.parse().ok()?;
    if !(1..=31).contains(&day_n) || !(1..=12).contains(&month_n) {
        return None;
    }

    let time = if time_part.len() >= 5
        && time_part.as_bytes()[2] == b':'
        && time_part[0..2].bytes().all(|b| b.is_ascii_digit())
        && time_part[3..5].bytes().all(|b| b.is_ascii_digit())
    {
        &time_part[0..5]
    } else {
        "00:00"
    };

    Some((format!("{year}-{month}-{day}"), time.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalises_the_backend_day_first_format() {
        assert_eq!(to_sortable("02-09-2026 08:14"), "2026-09-02T08:14");
        assert_eq!(to_sortable("25-12-2026"), "2026-12-25T00:00");
    }

    #[test]
    fn sorts_chronologically_as_plain_text() {
        // The bug this exists to prevent: naive string sort on the raw format
        // puts 25-12 before 02-09, and month-first parsing breaks past the 12th.
        let mut values: Vec<String> = ["25-12-2026", "02-09-2026 08:14", "01-09-2026 16:31"]
            .iter()
            .map(|s| to_sortable(s))
            .collect();
        values.sort();

        assert_eq!(
            values,
            vec!["2026-09-01T16:31", "2026-09-02T08:14", "2026-12-25T00:00"]
        );
    }

    #[test]
    fn keeps_day_and_month_in_the_right_order() {
        // 02-09 is 2 September, never 9 February.
        assert!(to_sortable("02-09-2026").starts_with("2026-09-02"));
        // 11 January sorts before 2 September.
        assert!(to_sortable("11-01-2026") < to_sortable("02-09-2026"));
    }

    #[test]
    fn passes_iso_timestamps_through() {
        assert_eq!(to_sortable("2026-09-02T08:14:00Z"), "2026-09-02T08:14");
        assert_eq!(to_sortable("2026-09-02 08:14:00"), "2026-09-02T08:14");
        assert_eq!(to_sortable("2026-09-02"), "2026-09-02T00:00");
    }

    #[test]
    fn yields_empty_for_junk() {
        assert_eq!(to_sortable(""), "");
        assert_eq!(to_sortable("   "), "");
        assert_eq!(to_sortable("not a date"), "");
        assert_eq!(to_sortable("32-13-2026"), "");
        assert_eq!(to_sortable("2-9-2026"), "");
    }
}
