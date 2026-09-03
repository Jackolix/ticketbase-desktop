/**
 * Development-only Tauri stub.
 *
 * Every Tauri API call — commands, plugins, events — funnels through
 * `window.__TAURI_INTERNALS__.invoke`. Replacing that lets the whole app run in
 * an ordinary browser against fixtures, so layout and spacing can be reviewed
 * without a backend, a login, or a compiled binary.
 *
 * Activated by `?preview=1`, and stripped from production builds by the
 * `import.meta.env.DEV` guard at the call site in main.tsx.
 */

import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';

const COMPANIES = [
  { id: 8, name: 'Müller Logistik GmbH', number: 'K-1042' },
  { id: 12, name: 'Stadtwerke Bergheim', number: 'K-2210' },
  { id: 19, name: 'Kern & Partner Steuerberatung', number: 'K-0517' },
  { id: 23, name: 'Hoffmann Bau AG', number: 'K-3390' },
];

/**
 * The customer list behind the search box's suggestions.
 *
 * Deliberately wider than the four companies that own tickets, and deliberately
 * full of names that share a prefix — the whole point of the feature is finding
 * the right "Müller" without knowing how it was typed into the database.
 */
const CUSTOMERS = [
  ...COMPANIES.map((c) => ({ ...c, zip: '50667', location: 'Köln', passive: 0 })),
  { id: 31, name: 'MÜLLER & SÖHNE KG', number: 'K-4401', zip: '53111', location: 'Bonn', passive: 0 },
  { id: 44, name: 'Müllermann Elektro', number: 'K-5120', zip: '50129', location: 'Bergheim', passive: 0 },
  { id: 57, name: 'Bäckerei Müller', number: 'K-6033', zip: '50931', location: 'Köln', passive: 1 },
  { id: 61, name: 'Schmidt Metallbau', number: 'K-7712', zip: '51105', location: 'Köln', passive: 0 },
];

const SUMMARIES: Array<[string, string, string, string]> = [
  ['Exchange-Server nimmt keine Mails an', 'E-Mail', 'VERY_HIGH', 'In Bearbeitung'],
  ['Drucker EG rechts offline nach Update', 'Drucker', 'HIGH', 'Warten auf Rückmeldung (extern)'],
  ['VPN-Zugang für neue Mitarbeiterin einrichten', 'Netzwerk', 'NORMAL', 'Neu'],
  ['Backup-Job läuft seit Freitag auf Warnung', 'Backup', 'HIGH', 'Prüfen'],
  ['Neue Arbeitsplätze aufbauen (4 Stück)', 'Hardware', 'NORMAL', 'Terminiert'],
  ['Telefonanlage: Durchwahl 214 klingelt nicht', 'Telefonie', 'NORMAL', 'In Bearbeitung'],
  ['Outlook stürzt beim Öffnen von Anhängen ab', 'E-Mail', 'HIGH', 'Zugewiesen'],
  ['Firewall-Regel für neuen Standort', 'Netzwerk', 'VERY_HIGH', 'Vor Ort'],
  ['Windows-Update schlägt auf 6 Clients fehl', 'Client', 'NORMAL', 'Wieder geöffnet'],
  ['Lizenzverlängerung Antivirus klären', 'Lizenzen', 'NORMAL', 'Abgeschlossen'],
  ['Scanner wird am Terminalserver nicht erkannt', 'Hardware', 'NORMAL', 'Neu'],
  ['Passwort-Reset für Aussendienst', 'Konten', 'NORMAL', 'Abgeschlossen'],
];

function pad(n: number) {
  return n.toString().padStart(2, '0');
}

/** Backend format: d-m-Y H:i. */
function backendDate(daysAgo: number, hour = 9, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(hour)}:${pad(minute)}`;
}

function makeTicket(i: number) {
  const [summary, subject, priority, status] = SUMMARIES[i % SUMMARIES.length];
  const company = COMPANIES[i % COMPANIES.length];
  const scheduledToday = i % 5 === 0;

  return {
    id: 4700 + i,
    description: i % 3 === 0 ? `${summary}. Ausführliche Beschreibung des gemeldeten Problems.` : '',
    status,
    status_id: 3,
    summary,
    subject,
    priority,
    index: priority === 'VERY_HIGH' ? 9 : priority === 'HIGH' ? 6 : 2,
    ticketCreator: 'Anna Weber',
    ticketUser: 'Jonas Müller',
    ticketUserPhone: '+49 221 5550101',
    ticketTerminatedUser: '',
    pool_name: i % 3 === 0 ? 'Nord' : 'Süd',
    playStatus: i === 0 ? 1 : i === 3 ? 2 : null,
    attachments: i % 4 === 0 ? ['screenshot.png'] : [],
    my_ticket_id: i % 7 === 0 ? 0 : 17,
    location_id: 42,
    dyn_template_id: 0,
    company: {
      id: company.id,
      name: company.name,
      number: company.number,
      companyMail: 'it@example.test',
      companyPhone: '+49 221 5550100',
      companyZip: '50667',
      companyAdress: 'Hafenstraße 12',
      locations: [],
    },
    created_at: backendDate(i % 20, 8 + (i % 9), (i * 7) % 60),
    ticket_start: scheduledToday ? backendDate(0, 8 + (i % 9), 0) : '',
    ticketMessagesCount: i % 6 === 0 ? 2 : 0,
    // Every third ticket carries a template, so the detail page's form
    // rendering is exercised in the preview.
    template_data:
      i % 3 === 1
        ? JSON.stringify({
            'Wo befindet sich der Virus': ['Lokaler PC / Notebook'],
            'Wie viele sind betroffen?': 'Ein Arbeitsplatz',
            'Bitte geben Sie weitere Informationen ein':
              'Es gibt keinen Virus, aber auf meinem Laptop ist die Lizenz für McAfee nicht mehr aktiv.\nBitte prüfen und ggf. verlängern.',
          })
        : i % 3 === 2
          ? JSON.stringify({
              Titel: '',
              Anrede: 'Herr',
              Vorname: 'Ayyub',
              Nachname: 'Abodji',
              'Eintritts Datum': '2026-10-01',
              'Initiales Passwort': 'Start1234',
              'Windows Anmeldename': 'a.abodji@example.test',
              'Windows Berechtigung': 'wie Frau Nalepa',
              'GGF Spezielle Ordner': '',
              'E-Mail Adresse': 'a.abodji@example.test',
              Anzeigename: 'Ayyub Abodji',
            })
          : JSON.stringify({
            Description: `${summary}. Ausführliche Beschreibung des gemeldeten Problems.`,
            Kategorie: 'Sonstiges',
          }),
  };
}

const TICKETS = Array.from({ length: 24 }, (_, i) => makeTicket(i));

const MINE = TICKETS.filter((t) => t.my_ticket_id !== 0);
const POOL = TICKETS.filter((t) => t.my_ticket_id === 0);

/**
 * The archive, which only fills once something asks for it.
 *
 * Modelled on what the real endpoints hand back rather than on the live list:
 * `getCompanyById` joins none of the relations `getTickets` does, so these
 * carry no subject, pool or message count, and they are years old.
 */
const ARCHIVE: Array<ReturnType<typeof makeTicket>> = [];

interface PreviewTimer {
  ticketId: number;
  userId: number;
  running: boolean;
  startedAt: number | null;
  accumulatedMs: number;
  elapsedMs: number;
}

const TIMERS = new Map<number, PreviewTimer>();

function timerElapsed(timer: PreviewTimer | undefined, now: number): number {
  if (!timer) return 0;
  const current = timer.running && timer.startedAt ? Math.max(0, now - timer.startedAt) : 0;
  return Math.max(0, timer.accumulatedMs) + current;
}

function makeArchivedTicket(i: number, companyIndex: number) {
  const [summary] = SUMMARIES[i % SUMMARIES.length];
  const company = COMPANIES[companyIndex];
  const year = 2024 + (i % 2);

  return {
    ...makeTicket(i),
    id: 3100 + i,
    status: 'Abgeschlossen',
    status_id: 4,
    subject: '',
    pool_name: '',
    ticketMessagesCount: 0,
    playStatus: null,
    summary,
    created_at: `${pad(1 + (i % 27))}-${pad(1 + (i % 12))}-${year} ${pad(8 + (i % 9))}:15`,
    company: {
      id: company.id,
      name: company.name,
      number: company.number,
      companyMail: 'it@example.test',
      companyPhone: '+49 221 5550100',
      companyZip: '50667',
      companyAdress: 'Hafenstraße 12',
      locations: [],
    },
  };
}

function matches(ticket: ReturnType<typeof makeTicket>, query: Record<string, unknown>) {
  if (query.id && ticket.id !== query.id) return false;

  if (query.search) {
    const needle = String(query.search).toLowerCase();
    const haystack = [ticket.summary, ticket.description, ticket.company.name, String(ticket.id)]
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(needle)) return false;
  }

  if (query.companyId && ticket.company.id !== query.companyId) return false;

  if (query.companyName) {
    if (!ticket.company.name.toLowerCase().includes(String(query.companyName).toLowerCase())) {
      return false;
    }
  }

  if (query.status && !ticket.status.toLowerCase().startsWith(String(query.status).toLowerCase())) {
    return false;
  }

  if (query.priority && ticket.priority.toLowerCase() !== String(query.priority).toLowerCase()) {
    return false;
  }

  return true;
}

const HANDLERS: Record<string, (args: any) => unknown> = {
  query_tickets: ({ query = {} }: any) => {
    // Archived rows have no bucket, so asking for one never returns them —
    // exactly as in SQLite, where the bucket join does the excluding.
    const source =
      query.archived === true
        ? ARCHIVE
        : query.bucket === 'mine'
          ? MINE
          : query.bucket === 'new'
            ? POOL
            : query.archived === undefined
              ? [...TICKETS, ...ARCHIVE]
              : TICKETS;
    const rows = source.filter((t) => matches(t, query));
    return query.limit ? rows.slice(0, query.limit) : rows;
  },
  ticket_counts: () => ({
    new: POOL.length,
    mine: MINE.length,
    all: TICKETS.length,
    archive: ARCHIVE.length,
  }),
  search_customers: ({ query = '', limit = 8 }: any) => {
    const needle = String(query).trim().toLowerCase();
    const rank = (name: string) => {
      const lower = name.toLowerCase();
      if (!needle || lower === needle) return 0;
      return lower.startsWith(needle) ? 1 : 2;
    };

    return CUSTOMERS.filter(
      (c) =>
        !needle ||
        c.name.toLowerCase().includes(needle) ||
        c.number.toLowerCase().includes(needle),
    )
      .sort(
        (a, b) =>
          rank(a.name) - rank(b.name) ||
          a.passive - b.passive ||
          (needle ? a.name.length - b.name.length : 0) ||
          a.name.localeCompare(b.name),
      )
      .slice(0, limit);
  },
  fetch_company_archive: ({ companyId }: any) => {
    const index = COMPANIES.findIndex((c) => c.id === companyId);
    if (index < 0) return { returned: 0, cached: 0, closed: 0 };

    const fetched = Array.from({ length: 9 }, (_, i) => makeArchivedTicket(i, index));
    for (const ticket of fetched) {
      if (!ARCHIVE.some((existing) => existing.id === ticket.id)) ARCHIVE.push(ticket);
    }

    return { returned: fetched.length + 2, cached: fetched.length, closed: fetched.length };
  },
  /**
   * Timers, kept in memory the way the Rust store keeps them on disk.
   *
   * The point being exercised is that reopening a ticket does not reset the
   * clock, so the record has to outlive the component.
   */
  timer_status: ({ ticketId }: any) => TIMERS.get(ticketId) ?? null,
  timer_record: ({ ticketId, action, baseMs }: any) => {
    const now = Date.now();
    const existing = TIMERS.get(ticketId);

    if (action === 'clear') {
      TIMERS.delete(ticketId);
      return null;
    }

    if (action === 'start') {
      TIMERS.set(ticketId, {
        ticketId,
        userId: 17,
        running: true,
        startedAt: now,
        accumulatedMs: 0,
        elapsedMs: 0,
      });
    } else if (action === 'pause') {
      const elapsed = timerElapsed(existing, now);
      TIMERS.set(ticketId, {
        ticketId,
        userId: 17,
        running: false,
        startedAt: null,
        accumulatedMs: elapsed,
        elapsedMs: elapsed,
      });
    } else if (action === 'resume' && !existing?.running) {
      TIMERS.set(ticketId, {
        ticketId,
        userId: 17,
        running: true,
        startedAt: now,
        accumulatedMs: existing?.accumulatedMs ?? Math.max(0, baseMs ?? 0),
        elapsedMs: 0,
      });
    }

    const current = TIMERS.get(ticketId);
    return current ? { ...current, elapsedMs: timerElapsed(current, now) } : null;
  },
  fetch_ticket_by_number: ({ ticketId }: any) => {
    const known = [...TICKETS, ...ARCHIVE].find((t) => t.id === ticketId);
    if (known) return known;

    // The case the command exists for: a closed ticket the sync has never
    // seen and never could. getTicketById returns it all the same.
    if (ticketId >= 3100 && ticketId < 3200) {
      const fetched = makeArchivedTicket(ticketId - 3100, ticketId % COMPANIES.length);
      fetched.id = ticketId;
      ARCHIVE.push(fetched);
      return fetched;
    }

    return null;
  },
  get_ticket: ({ ticketId }: any) => TICKETS.find((t) => t.id === ticketId) ?? TICKETS[0],
  sync_status: () => ({
    state: 'ok',
    lastSyncedAt: Date.now() - 12_000,
    lastError: null,
    retrying: false,
    droppedLastSync: 0,
    counts: {
      new: POOL.length,
      mine: MINE.length,
      all: TICKETS.length,
      archive: ARCHIVE.length,
    },
  }),
  sync_start: () => null,
  sync_stop: () => null,
  sync_refresh: () => null,
  sync_set_interval: () => null,
  open_ticket_window: () => null,
  show_ticket: () => null,
};

/**
 * Responses for the REST calls that still go through the HTTP plugin.
 *
 * A fixture may be a function so it can reflect state the preview has changed
 * — the player status has to agree with the mock timers, or reopening a ticket
 * would look broken here in a way it is not in the real app.
 */
const HTTP_FIXTURES: Array<[RegExp, unknown | ((url: string) => unknown)]> = [
  [/getTicketData/, {
    status: 'success',
    ticket_data: [
      {
        id: 1, ticket_id: 4700, technician_id: 17, status_id: 3,
        technician_reply: '<p>Exchange-Warteschlange geprüft, 240 Nachrichten blockiert. Transportregel angepasst.</p>',
        created_at: '2026-09-01 14:22:00', updated_at: '2026-09-01 14:22:00',
        service_start: 0, service_end: 0, total_time: 2700,
        user: { name: 'Anna Weber' }, status_name: 'In Bearbeitung',
      },
      {
        id: 2, ticket_id: 4700, technician_id: 18, status_id: 2,
        technician_reply: '<p>Rückmeldung vom Kunden abgewartet.</p>',
        created_at: '2026-08-31 09:10:00', updated_at: '2026-08-31 09:10:00',
        service_start: 0, service_end: 0, total_time: 900,
        user: { name: 'Tim Kern' }, status_name: 'Terminiert',
      },
    ],
  }],
  [/getCheckList/, {
    status: 'success',
    check_list: [
      { id: 1, ticket_id: 4700, user_id: 17, to_do: 'Transportregel prüfen', checked: 1, created_at: '' },
      { id: 2, ticket_id: 4700, user_id: 17, to_do: 'Kunden informieren', checked: 0, created_at: '' },
      { id: 3, ticket_id: 4700, user_id: 17, to_do: 'Monitoring nachziehen', checked: 0, created_at: '' },
    ],
  }],
  [/getPlayerStatus/, () => {
    // The request body is not visible to a URL matcher, and the preview only
    // ever runs one timer at a time, so any running timer stands for this one.
    const running = [...TIMERS.values()].find((timer) => timer.running);
    const paused = [...TIMERS.values()].find((timer) => !timer.running);
    const active = running ?? paused;

    return {
      status: 'success',
      playerStatus: active
        ? {
            id: active.ticketId,
            play_status: running ? 1 : 2,
            status_id: 13,
            // Deliberately 0, exactly as the real backend reports it for a
            // running timer: calculateTotalTime returns 0 until the first
            // pause, and total_time_raw is overwritten with 0 before it is
            // returned. This is what the local record exists to survive.
            total_time: 0,
            total_time_raw: '0',
            tmp_description: '',
            ticket_status_id: 13,
          }
        : null,
    };
  }],
  [/getTicketMessages/, { status: 'success', messages: [] }],
  [/getUsersMailSettings/, {
    status: 'success',
    data: {
      user_mail_settings_arr: {
        new_ticket_pool_mail: true,
        new_help_mail: false,
        new_message_mail: true,
        new_forward_mail: false,
      },
    },
  }],
  [/getUserStatus/, { status: 'success', activity: { activeStatus: true, message: 'User Activated' } }],
  [/changeUserStatus/, { status: 'success', activity: { activeStatus: true, message: 'Status Changed' } }],
  [/getLocationUsers/, {
    status: 'success',
    users: [
      { id: 17, name: 'Anna Weber', email: 'anna.weber@example.test' },
      { id: 18, name: 'Tim Kern', email: 'tim.kern@example.test' },
      { id: 19, name: 'Jonas Müller', email: 'jonas.mueller@example.test' },
      { id: 20, name: 'Lea Schmitt', email: 'lea.schmitt@example.test' },
    ],
  }],
  [/getCustomers/, { status: 'success', customers: COMPANIES }],
  [/getTemplates/, { status: 'success', templates: [{ id: 1, name: 'Standard' }] }],
  [/getWikiData/, {
    status: 'success',
    wikiData: [
      {
        id: 1,
        title: 'VPN-Zugang einrichten',
        content: '<p>Schritt 1: Client installieren. Schritt 2: Profil importieren.</p>',
        category: 'Anleitung',
        folder: 'Netzwerk',
        writer: { name: 'Anna Weber', email: 'a@example.test' },
        created_at: '2026-01-04 09:00:00',
        updated_at: '2026-08-19 11:20:00',
      },
      {
        id: 2,
        title: 'Drucker am Terminalserver bereitstellen',
        content: '<p>Treiber paketieren und per GPO verteilen.</p>',
        category: 'Anleitung',
        folder: 'Hardware',
        writer: { name: 'Tim Kern', email: 't@example.test' },
        created_at: '2026-02-11 09:00:00',
        updated_at: '2026-07-02 15:41:00',
      },
      {
        id: 3,
        title: 'Exchange: Warteschlange prüfen',
        content: '<p>Get-Queue verwenden und blockierte Nachrichten identifizieren.</p>',
        category: 'Runbook',
        folder: 'E-Mail',
        writer: { name: 'Anna Weber', email: 'a@example.test' },
        created_at: '2026-03-02 09:00:00',
        updated_at: '2026-08-30 08:05:00',
      },
    ],
  }],
  [/Report4/, {
    result: 'success',
    report: Array.from({ length: 9 }, (_, i) => ({
      Techniker: ['Anna Weber', 'Tim Kern', 'Jonas Müller'][i % 3],
      'Ticket-ID': 4700 + i,
      Kunde: COMPANIES[i % COMPANIES.length].name,
      Note: (i % 5) + 1,
    })),
  }],
  [/Report5/, {
    result: 'success',
    report: ['Anna Weber', 'Tim Kern', 'Jonas Müller', 'Lea Schmitt'].map((name, i) => ({
      Techniker: name,
      'All tickets': 120 - i * 17,
      'All closed tickets': 104 - i * 15,
      'All reopened tickets': i * 4,
      'All reviewed tickets': 60 - i * 8,
      'Percentage 1': `${i * 9}%`,
      'Percentage 2': `${55 - i * 6}%`,
    })),
  }],
  [/getTopUsers/, {
    status: 'success',
    top_users: ['Anna Weber', 'Tim Kern', 'Jonas Müller', 'Lea Schmitt', 'Ben Roth'].map(
      (name, i) => ({ id: i + 1, name, total_points: 980 - i * 120 }),
    ),
  }],
];

export function installPreviewBackend() {
  // Tauri ships mockIPC/mockWindows for exactly this. They install the full
  // internals surface — callbacks, event plugin, window metadata — so only the
  // command responses have to be supplied here.
  mockWindows('main');
  mockIPC(handleCommand, { shouldMockEvents: true });

  // A signed-in user, so the app renders past the login screen.
  localStorage.setItem('auth_token', 'preview-token');
  localStorage.setItem(
    'user',
    JSON.stringify({
      id: 17,
      name: 'Anna Weber',
      email: 'anna.weber@example.test',
      firstname: 'Anna',
      surname: 'Weber',
      phone: '+49 221 5550111',
      company_id: 1,
      user_group_id: 1,
      sub_user_group_id: 0,
      location_id: 1,
      profile_photo_url: '',
      role: { id: 1, name: 'Techniker' },
    }),
  );
}

const pendingRequests = new Map<number, string>();
let nextRid = 1;

async function handleCommand(cmd: string, args: any): Promise<unknown> {
  // The HTTP plugin is a three-step protocol: open a request, send it, then
  // stream the body over a Channel. All three are emulated so apiClient works
  // unchanged.
  if (cmd === 'plugin:http|fetch') {
    const rid = nextRid++;
    pendingRequests.set(rid, String(args?.clientConfig?.url ?? ''));
    return rid;
  }
  if (cmd === 'plugin:http|fetch_send') {
    const url = pendingRequests.get(args?.rid) ?? '';
    pendingRequests.delete(args?.rid);
    const responseRid = nextRid++;
    pendingRequests.set(responseRid, url);
    return { status: 200, statusText: 'OK', url, headers: {}, rid: responseRid };
  }
  if (cmd === 'plugin:http|fetch_read_body') {
    const url = pendingRequests.get(args?.rid) ?? '';
    pendingRequests.delete(args?.rid);

    const match = HTTP_FIXTURES.find(([pattern]) => pattern.test(url));
    if (!match) console.warn('[preview] no fixture for', url);

    const fixture = match ? match[1] : { status: 'success' };
    const body = typeof fixture === 'function' ? (fixture as (u: string) => unknown)(url) : fixture;

    const bytes = Array.from(new TextEncoder().encode(JSON.stringify(body)));
    const emit = (window as any).__TAURI_INTERNALS__.runCallback;

    // A trailing 0 marks a data chunk; a lone 1 closes the stream.
    emit(args.streamChannel.id, { index: 0, message: [...bytes, 0] });
    emit(args.streamChannel.id, { index: 1, message: [1] });
    return null;
  }

  // Window, notification and updater calls are inert in a browser.
  if (cmd.startsWith('plugin:') || cmd.startsWith('core:')) return null;

  const handler = HANDLERS[cmd];
  if (handler) return handler(args ?? {});

  console.warn('[preview] unhandled command:', cmd, args);
  return null;
}
