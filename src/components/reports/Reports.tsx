import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, BarChart3, Download, Loader2, Trophy } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/PageHeader';
import { apiClient } from '@/lib/api';
import { TONE_BADGE, type Tone } from '@/lib/ticketStatus';

/* eslint-disable @typescript-eslint/no-explicit-any -- report rows are
   untyped, German-keyed arrays straight from Report4/Report5. */

interface ReportData {
  report: any[];
  result: string;
}

interface TopUser {
  id: number;
  name: string;
  total_points: number;
}

const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

/**
 * Reports.
 *
 * Read-only views over Report4 (customer ratings), Report5 (technician
 * statistics) and getTopUsers. These are the only three reporting endpoints the
 * API exposes; the web UI has considerably more.
 */
export function Reports() {
  const [tab, setTab] = useState('reviews');

  const [reviews, setReviews] = useState<ReportData | null>(null);
  const [stats, setStats] = useState<ReportData | null>(null);
  const [topUsers, setTopUsers] = useState<TopUser[] | null>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  useEffect(() => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setStartDate(first.toISOString().slice(0, 10));
    setEndDate(last.toISOString().slice(0, 10));
  }, []);

  const run = useCallback(
    async (key: string, fn: () => Promise<void>) => {
      setBusy(key);
      setError(null);
      try {
        await fn();
      } catch (err) {
        console.error(`Report ${key} failed:`, err);
        setError('Der Bericht konnte nicht geladen werden. Verbindung prüfen und erneut versuchen.');
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const loadReviews = () =>
    run('reviews', async () => {
      const response = await apiClient.getReport4(startDate, endDate);
      setReviews(response as unknown as ReportData);
    });

  const loadStats = () =>
    run('stats', async () => {
      const response = await apiClient.getReport5(startDate, endDate);
      setStats(response as unknown as ReportData);
    });

  const loadTopUsers = () =>
    run('top', async () => {
      const response = await apiClient.getTopUsers(month);
      setTopUsers(((response as any).top_users ?? []) as TopUser[]);
    });

  // Report4 mixes an "average note" summary entry into the same array as the
  // rows, so real rows are the objects carrying a technician name.
  const reviewRows = useMemo(
    () => (reviews?.report ?? []).filter((r) => typeof r === 'object' && r?.Techniker),
    [reviews],
  );
  const averageNote = useMemo(
    () => (reviews?.report as any)?.['average note'] ?? null,
    [reviews],
  );

  const dateRangeInvalid = Boolean(startDate && endDate && startDate > endDate);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Berichte"
        description="Bewertungen und Technikerstatistiken aus dem Ticketsystem."
        icon={BarChart3}
      />

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-tone-danger-soft px-3 py-2 text-xs text-tone-danger">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="reviews" className="text-xs">Bewertungen</TabsTrigger>
          <TabsTrigger value="stats" className="text-xs">Technikerstatistik</TabsTrigger>
          <TabsTrigger value="top" className="text-xs">Top-Techniker</TabsTrigger>
        </TabsList>

        {/* Shared range picker: both date-based reports use the same window. */}
        {tab !== 'top' && (
          <Toolbar>
            <Field label="Von">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-8 w-[150px] text-xs"
              />
            </Field>
            <Field label="Bis">
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-8 w-[150px] text-xs"
              />
            </Field>
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs"
              disabled={busy !== null || dateRangeInvalid || !startDate || !endDate}
              onClick={() => (tab === 'reviews' ? void loadReviews() : void loadStats())}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BarChart3 className="h-3.5 w-3.5" />}
              Bericht erstellen
            </Button>
            {dateRangeInvalid && (
              <span className="text-xs text-tone-danger">Startdatum liegt nach dem Enddatum.</span>
            )}
          </Toolbar>
        )}

        <TabsContent value="reviews" className="m-0">
          <ReportShell
            title="Kundenbewertungen"
            count={reviewRows.length}
            loading={busy === 'reviews'}
            loaded={reviews !== null}
            onExport={() => exportCsv(reviewRows, 'kundenbewertungen')}
            aside={
              averageNote != null && (
                <Badge variant="outline" className={`${TONE_BADGE[noteTone(Number(averageNote))]} text-[10px]`}>
                  Ø {averageNote}
                </Badge>
              )
            }
          >
            <table className="w-full border-collapse text-xs">
              <THead
                columns={['Techniker', 'Ticket', 'Kunde', 'Note']}
                align={['left', 'left', 'left', 'right']}
                narrow={[0, 1, 3]}
              />
              <tbody>
                {reviewRows.map((row, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-accent/40">
                    <td className="py-1.5 pr-3 pl-3 font-medium">{row.Techniker || '—'}</td>
                    <td className="py-1.5 pr-3 font-mono text-[11px] tabular-nums text-muted-foreground">
                      {row['Ticket-ID'] ?? '—'}
                    </td>
                    <td className="py-1.5 pr-3 text-muted-foreground">{row.Kunde || '—'}</td>
                    <td className="py-1.5 pr-3 text-right">
                      <Badge
                        variant="outline"
                        className={`${TONE_BADGE[noteTone(Number(row.Note))]} px-1.5 py-0 text-[10px] tabular-nums`}
                      >
                        {row.Note ?? '—'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ReportShell>
        </TabsContent>

        <TabsContent value="stats" className="m-0">
          <ReportShell
            title="Technikerstatistik"
            count={stats?.report?.length ?? 0}
            loading={busy === 'stats'}
            loaded={stats !== null}
            onExport={() => exportCsv(stats?.report ?? [], 'technikerstatistik')}
          >
            <table className="w-full border-collapse text-xs">
              <THead
                columns={['Techniker', 'Gesamt', 'Geschlossen', 'Wiedereröffnet', 'Bewertet', 'Wiederöffnungsquote', 'Bewertungsquote']}
                align={['left', 'right', 'right', 'right', 'right', 'right', 'right']}
                narrow={[1, 2, 3, 4, 5, 6]}
              />
              <tbody>
                {(stats?.report ?? []).map((row, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-accent/40">
                    <td className="py-1.5 pl-3 pr-3 font-medium">{row.Techniker || '—'}</td>
                    <Num>{row['All tickets']}</Num>
                    <Num>{row['All closed tickets']}</Num>
                    <Num>{row['All reopened tickets']}</Num>
                    <Num>{row['All reviewed tickets']}</Num>
                    <td className="py-1.5 pr-3 text-right">
                      <Badge
                        variant="outline"
                        className={`${TONE_BADGE[reopenTone(row['Percentage 1'])]} px-1.5 py-0 text-[10px] tabular-nums`}
                      >
                        {row['Percentage 1'] || '0%'}
                      </Badge>
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-muted-foreground">
                      {row['Percentage 2'] || '0%'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ReportShell>
        </TabsContent>

        <TabsContent value="top" className="m-0 space-y-4">
          <Toolbar>
            <Field label="Monat">
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger className="h-8 w-[150px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((name, i) => (
                    <SelectItem key={name} value={String(i + 1)} className="text-xs">
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs"
              disabled={busy !== null}
              onClick={() => void loadTopUsers()}
            >
              {busy === 'top' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trophy className="h-3.5 w-3.5" />}
              Anzeigen
            </Button>
          </Toolbar>

          <ReportShell
            title={`Top-Techniker — ${MONTHS[month - 1]}`}
            count={topUsers?.length ?? 0}
            loading={busy === 'top'}
            loaded={topUsers !== null}
            onExport={() => exportCsv(topUsers ?? [], 'top_techniker')}
          >
            <table className="w-full border-collapse text-xs">
              <THead columns={['#', 'Techniker', 'Punkte']} align={['left', 'left', 'right']} narrow={[0, 2]} />
              <tbody>
                {(topUsers ?? []).map((user, i) => (
                  <tr key={user.id} className="border-b last:border-0 hover:bg-accent/40">
                    <td className="w-px whitespace-nowrap py-1.5 pl-3 pr-3">
                      <span
                        className={[
                          'inline-flex h-5 w-5 items-center justify-center rounded-full font-mono text-[10px] tabular-nums',
                          i === 0
                            ? 'bg-tone-warning-soft text-tone-warning'
                            : 'bg-secondary text-muted-foreground',
                        ].join(' ')}
                      >
                        {i + 1}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 font-medium">{user.name}</td>
                    <td className="py-1.5 pr-3 text-right font-mono tabular-nums">
                      {user.total_points}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ReportShell>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Toolbar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border bg-card p-3">{children}</div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function THead({
  columns,
  align,
  narrow = [],
}: {
  columns: string[];
  align: Array<'left' | 'right'>;
  /** Columns that should hug their content rather than absorb slack. */
  narrow?: number[];
}) {
  return (
    <thead className="sticky top-0 z-10 bg-background">
      <tr className="border-b text-[10px] uppercase tracking-wider text-muted-foreground">
        {columns.map((column, i) => (
          <th
            key={column}
            className={[
              'whitespace-nowrap py-2 pr-3 font-medium',
              i === 0 ? 'pl-3' : '',
              narrow.includes(i) ? 'w-px' : '',
              align[i] === 'right' ? 'text-right' : 'text-left',
            ].join(' ')}
          >
            {column}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function Num({ children }: { children: React.ReactNode }) {
  return (
    <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{children ?? 0}</td>
  );
}

function ReportShell({
  title,
  count,
  loading,
  loaded,
  onExport,
  aside,
  children,
}: {
  title: string;
  count: number;
  loading: boolean;
  loaded: boolean;
  onExport: () => void;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden py-0">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide">{title}</h2>
          {loaded && (
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{count}</span>
          )}
          {aside}
        </div>
        {loaded && count > 0 && (
          <Button variant="outline" size="sm" onClick={onExport} className="h-7 gap-1.5 text-xs">
            <Download className="h-3 w-3" />
            CSV
          </Button>
        )}
      </div>

      {loading ? (
        <div className="divide-y">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex animate-pulse gap-3 px-3 py-2.5">
              <div className="h-3 flex-1 rounded bg-muted" />
              <div className="h-3 w-16 rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : !loaded ? (
        <p className="px-3 py-10 text-center text-xs text-muted-foreground">
          Zeitraum wählen und Bericht erstellen.
        </p>
      ) : count === 0 ? (
        <p className="px-3 py-10 text-center text-xs text-muted-foreground">
          Keine Daten für diesen Zeitraum.
        </p>
      ) : (
        <div className="max-h-[520px] overflow-auto">{children}</div>
      )}
    </Card>
  );
}

/** Ratings run 1–5; higher is better. */
function noteTone(note: number): Tone {
  if (!Number.isFinite(note)) return 'neutral';
  if (note >= 4) return 'success';
  if (note >= 3) return 'warning';
  return 'danger';
}

/** A high reopen rate is bad, so the scale is inverted relative to ratings. */
function reopenTone(percentage: unknown): Tone {
  const value = parseFloat(String(percentage ?? ''));
  if (!Number.isFinite(value)) return 'neutral';
  if (value > 20) return 'danger';
  if (value > 10) return 'warning';
  return 'success';
}

function exportCsv(rows: any[], filename: string) {
  if (!rows.length) return;

  const columns = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    const text = value == null ? '' : String(value);
    return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  // Semicolons and a BOM: Excel in a German locale opens comma-separated UTF-8
  // as one column and mangles umlauts otherwise.
  const csv = [
    columns.join(';'),
    ...rows.map((row) => columns.map((c) => escape(row[c])).join(';')),
  ].join('\r\n');

  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

