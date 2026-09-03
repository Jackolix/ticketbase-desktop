import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { Ticket, User } from '@/types/api';

/**
 * Client for the Rust sync core.
 *
 * Reads here never touch the network: they query the local SQLite store, which
 * a single background task keeps current for the whole application. That task
 * exists once no matter how many windows are open — previously every window ran
 * its own 30-second poll of an endpoint that rebuilds the entire open-ticket
 * universe on each call.
 *
 * The Rust `Ticket` is serialized with exactly the key names in `@/types/api`,
 * so components consume it unchanged. That contract is pinned by a test in
 * src-tauri/src/api/models.rs.
 *
 * The archive functions are the exception to "reads never touch the network".
 * `getTickets` filters `status_id != 4`, so a closed ticket can never arrive
 * through the sync no matter how long it runs; it has to be asked for by
 * number or by customer. Those calls take as long as the backend does and are
 * always driven by something the user did.
 */

export const EVENT_SYNC_STATUS = 'sync://status';
export const EVENT_SYNC_CHANGED = 'sync://changed';

/** Which server-side list a ticket belongs to. */
export type Bucket = 'new' | 'mine' | 'all';

export type TicketSort =
  | 'date-desc'
  | 'date-asc'
  | 'priority-high'
  | 'priority-low'
  | 'id-desc'
  | 'id-asc'
  | 'company-asc'
  | 'company-desc'
  | 'status-asc'
  | 'status-desc';

export interface TicketQuery {
  bucket?: Bucket;
  /**
   * `true` restricts to cached closed tickets, `false` to live ones. Omit to
   * span both, which is what a lookup by ticket number wants.
   */
  archived?: boolean;
  /** Free text over summary, description, company name, id and template data. */
  search?: string;
  /** Exact ticket id. */
  id?: number;
  companyId?: number;
  /** Substring match on the company name only, unlike `search`. */
  companyName?: string;
  /** Prefix match, so `warten` finds every "Warten auf …" variant. */
  status?: string;
  priority?: string;
  /** Inclusive, ISO `YYYY-MM-DD`. */
  dateFrom?: string;
  /** Inclusive, ISO `YYYY-MM-DD`. */
  dateTo?: string;
  sort?: TicketSort;
  limit?: number;
  offset?: number;
}

export interface BucketCounts {
  new: number;
  mine: number;
  all: number;
  /**
   * Closed tickets cached so far. Unlike the others this is not a server-side
   * total — there is no endpoint that could tell us one.
   */
  archive: number;
}

/** A customer, for the search box's company suggestions. */
export interface Customer {
  id: number;
  name: string;
  number: string;
  zip: string;
  /** The town. */
  location: string;
  /** Non-zero for customers the backend marks inactive. */
  passive: number;
}

/** What an archive fetch actually did. */
export interface ArchiveFetch {
  /** Tickets the backend returned for the customer, of any status. */
  returned: number;
  /** How many were written to the archive; open ones are left to the sync. */
  cached: number;
  /** How many are actually closed. */
  closed: number;
}

export type SyncState = 'idle' | 'syncing' | 'ok' | 'failed';

export interface SyncStatus {
  state: SyncState;
  /** Unix millis of the last successful sync; survives app restarts. */
  lastSyncedAt: number | null;
  lastError: string | null;
  /** Whether the last failure looked retryable. */
  retrying: boolean;
  /**
   * Ticket entries the backend emitted as null from its own catch block during
   * the last sync. Non-zero means the server dropped rows, not us.
   */
  droppedLastSync: number;
  counts: BucketCounts | null;
}

export interface SyncChanged {
  newlyInPool: number[];
  newlyAssigned: number[];
  counts: BucketCounts;
}

/** Starts syncing for this session and triggers an immediate pull. */
export async function syncStart(token: string, user: User): Promise<void> {
  await invoke('sync_start', {
    token,
    user: {
      id: user.id,
      user_group_id: user.user_group_id,
      company_id: user.company_id,
      location_id: user.location_id,
      sub_user_group_id: user.sub_user_group_id,
    },
  });
}

/** Stops syncing and wipes the local store. Call this on logout. */
export async function syncStop(): Promise<void> {
  await invoke('sync_stop');
}

/** Asks for an immediate sync, bypassing any active backoff. */
export async function syncRefresh(): Promise<void> {
  await invoke('sync_refresh');
}

/**
 * Sets the poll interval. Values below the engine's floor are raised to it —
 * one pull is expensive server-side, so a very short interval would hurt every
 * client on the system.
 */
export async function syncSetInterval(seconds: number): Promise<void> {
  await invoke('sync_set_interval', { seconds });
}

/**
 * Current sync state. A window opened after a sync missed the event, so it
 * calls this once on mount to catch up.
 */
export function getSyncStatus(): Promise<SyncStatus> {
  return invoke<SyncStatus>('sync_status');
}

/**
 * Queries the local store.
 *
 * Covers every synced ticket, not just the page that happens to be rendered —
 * which is what the old client filtered over.
 */
export function queryTickets(query: TicketQuery = {}): Promise<Ticket[]> {
  return invoke<Ticket[]>('query_tickets', { query });
}

export function getTicketCounts(): Promise<BucketCounts> {
  return invoke<BucketCounts>('ticket_counts');
}

/**
 * Fetches one ticket, preferring the local store.
 *
 * Falls back to the network only for tickets never synced. That fallback uses
 * `getTicketById`, whose controller loads fewer relations, so the result has no
 * pool name, scheduled start, or unread message count.
 */
export function getTicket(ticketId: number): Promise<Ticket | null> {
  return invoke<Ticket | null>('get_ticket', { ticketId });
}

/**
 * Customers matching a partial name or customer number.
 *
 * Served from the local cache the sync engine fills, so it is cheap enough to
 * call on every keystroke. Returns nothing — rather than failing — before the
 * first sync has populated that cache.
 */
export function searchCustomers(query: string, limit = 8): Promise<Customer[]> {
  return invoke<Customer[]>('search_customers', { query, limit });
}

/**
 * Pulls every ticket belonging to one customer into the local archive.
 *
 * This is the only bulk route to closed tickets the backend has, and it is an
 * expensive one: `getCompanyById` eager-loads the same ticket relation five
 * times over. Hence an explicit action rather than anything automatic.
 */
export function fetchCompanyArchive(companyId: number): Promise<ArchiveFetch> {
  return invoke<ArchiveFetch>('fetch_company_archive', { companyId });
}

/**
 * Looks a ticket up by number, reaching past the local store when it has to.
 *
 * Resolves to null when no ticket has that number, which is an ordinary
 * outcome for a search box rather than an error.
 */
export function fetchTicketByNumber(ticketId: number): Promise<Ticket | null> {
  return invoke<Ticket | null>('fetch_ticket_by_number', { ticketId });
}

export function onSyncStatus(handler: (status: SyncStatus) => void): Promise<UnlistenFn> {
  return listen<SyncStatus>(EVENT_SYNC_STATUS, (event) => handler(event.payload));
}

export function onSyncChanged(handler: (change: SyncChanged) => void): Promise<UnlistenFn> {
  return listen<SyncChanged>(EVENT_SYNC_CHANGED, (event) => handler(event.payload));
}
