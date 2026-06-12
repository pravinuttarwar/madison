import { useState } from 'react';
import {
  RefreshCw, FileSpreadsheet, Link2, Loader2, AlertCircle, Users, Plus, X, HardDrive, CalendarRange,
} from 'lucide-react';
import { Panel, Trend, Bar, KpiTile } from '@/components/primitives';
import { Loading } from '@/components/AsyncState';
import { useApi } from '@/hooks/useApi';
import {
  getReports, addReportsSource, loadLocalReports, removeReportsSource,
  sourceModeFor, ApiError, type ReportsData,
} from '@/lib/api';

const spreadsheetMode = sourceModeFor('spreadsheet');
const COLORS = [
  'var(--color-chart-1)', 'var(--color-chart-2)', 'var(--color-chart-3)',
  'var(--color-chart-4)', 'var(--color-chart-5)', 'var(--color-primary)', 'var(--color-brand)',
];

function fmtDate(iso?: string) {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function errMsg(e: unknown) {
  const s = e instanceof ApiError ? e.status : 0;
  return s === 422
    ? "That file doesn't match the expected weekly format (Totals / Provider sheets)."
    : s === 403
      ? "We couldn't access that file — the link isn't readable with the current permission."
      : 'Could not read that file. Check the link and try again.';
}

function ReportsPending() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Providers' weekly report</h1>
        <p className="text-sm text-muted-foreground">A live snapshot of your weekly provider spreadsheet.</p>
      </div>
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-card py-16 text-center shadow-sm">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
          <FileSpreadsheet className="h-6 w-6" aria-hidden />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Pending implementation</p>
          <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-muted-foreground">
            Connect a live backend to read your providers' weekly spreadsheet and show encounters by
            modality and provider, week-over-week, month-to-month and year-over-year.
          </p>
        </div>
      </div>
    </div>
  );
}

// Add-source form (URL + optional year), reused by the empty state and the manager.
function AddSourceForm({ onResult }: { onResult: (r: ReportsData) => void }) {
  const [url, setUrl] = useState('');
  const [year, setYear] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!url.trim()) return;
    setBusy(true); setError(null);
    try {
      const r = await addReportsSource(url.trim(), year.trim() || undefined);
      setUrl(''); setYear('');
      onResult(r);
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="url" value={url} onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="https://…sharepoint.com/…  (share link)"
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none ring-primary/30 focus:ring-2"
        />
        <input
          value={year} onChange={(e) => setYear(e.target.value)} placeholder="Year"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none ring-primary/30 focus:ring-2 sm:w-24"
        />
        <button
          onClick={add} disabled={busy || !url.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
          Add
        </button>
      </div>
      {error && (
        <p className="mt-2.5 flex items-start gap-1.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {error}
        </p>
      )}
    </div>
  );
}

function ConnectSpreadsheet({ data, onResult }: { data: ReportsData; onResult: (r: ReportsData) => void }) {
  const [localBusy, setLocalBusy] = useState(false);
  async function useLocal() {
    setLocalBusy(true);
    try { onResult(await loadLocalReports()); } finally { setLocalBusy(false); }
  }
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Providers' weekly report</h1>
        <p className="text-sm text-muted-foreground">
          Connect your weekly spreadsheet(s) — by modality and provider, with week-over-week,
          month-to-month and year-over-year. Read-only, refreshed on demand.
        </p>
      </div>
      <Panel title="Connect your spreadsheet" source="OneDrive / SharePoint" sourceMode={spreadsheetMode}>
        <p className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link2 className="h-3.5 w-3.5" aria-hidden />
          Paste the share link to your "Patient Numbers" workbook. Add one per year to compare
          year-over-year.
        </p>
        <AddSourceForm onResult={onResult} />
        {data.allowLocal && (
          <div className="mt-4 border-t border-border pt-3">
            <button
              onClick={useLocal} disabled={localBusy}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              {localBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <HardDrive className="h-3.5 w-3.5" aria-hidden />}
              Use local test files
            </button>
            <span className="ml-2 text-[11px] text-muted-foreground">Dev only — same parser path, on-disk files.</span>
          </div>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          Read in memory to show the latest figures — nothing stored. Same-format files work as-is;
          a different layout is flagged rather than shown wrong.
        </p>
      </Panel>
    </div>
  );
}

function MetricList({ rows }: { rows: { label: string; last: number; prior: number | null }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.last));
  return (
    <ul className="space-y-3.5">
      {rows.map((r, i) => (
        <li key={r.label}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium text-foreground">{r.label}</span>
            <span className="flex items-center gap-2 tabular-nums text-muted-foreground">
              {r.last}
              {r.prior != null && <Trend delta={r.last - r.prior} />}
            </span>
          </div>
          <Bar value={r.last} max={max} colorVar={COLORS[i % COLORS.length]} />
        </li>
      ))}
    </ul>
  );
}

function ReportView({ data, onChange }: { data: ReportsData; onChange: (r: ReportsData) => void }) {
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);
  const week = data.week!;
  const months = data.months ?? [];
  const yoy = data.yoy ?? null;
  const sources = data.sources ?? [];
  const maxMonth = Math.max(1, ...months.map((m) => m.total));

  async function refresh() {
    setRefreshing(true);
    try { onChange(await getReports(true)); } finally { setRefreshing(false); }
  }
  async function remove(year: string) {
    onChange(await removeReportsSource(year));
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Providers' weekly report</h1>
          <p className="text-sm text-muted-foreground">
            Week of <span className="font-medium text-foreground">{fmtDate(week.weekStart)}</span>
            {week.priorWeekStart ? ` vs prior week (${fmtDate(week.priorWeekStart)})` : ''}
          </p>
        </div>
        <button
          onClick={refresh} disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden /> Refresh
        </button>
      </div>

      {/* Connected sources */}
      <div className="flex flex-wrap items-center gap-2">
        {sources.map((s) => (
          <span key={s.year} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-foreground shadow-sm">
            <FileSpreadsheet className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            {s.year}{s.kind === 'local' ? ' · local' : ''}
            <button onClick={() => remove(s.year)} title="Remove" className="text-muted-foreground hover:text-destructive">
              <X className="h-3 w-3" aria-hidden />
            </button>
          </span>
        ))}
        <button
          onClick={() => setAdding((a) => !a)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden /> Add year
        </button>
      </div>
      {adding && (
        <Panel title="Add another year" source="OneDrive / SharePoint" sourceMode={spreadsheetMode}>
          <AddSourceForm onResult={(r) => { onChange(r); setAdding(false); }} />
        </Panel>
      )}

      {/* Headline */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiTile
          label="Total encounters" value={week.totalEncounters.last.toLocaleString()} sub="This week"
          trend={week.totalEncounters.prior != null ? <Trend delta={week.totalEncounters.last - week.totalEncounters.prior} /> : undefined}
        />
        {week.modalities.slice(0, 3).map((m) => (
          <KpiTile key={m.key} label={m.label} value={m.last.toLocaleString()}
            trend={m.prior != null ? <Trend delta={m.last - m.prior} /> : undefined} />
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="This week by modality" source="OneDrive / SharePoint" sourceMode={spreadsheetMode}>
          {week.modalities.length ? <MetricList rows={week.modalities} /> : <p className="py-6 text-center text-sm text-muted-foreground">No modality rows this week.</p>}
        </Panel>
        <Panel title="This week by provider" subtitle="Encounters per provider" source="OneDrive / SharePoint" sourceMode={spreadsheetMode}>
          {week.providers.length ? <MetricList rows={week.providers.map((p) => ({ label: p.name, last: p.last, prior: p.prior }))} /> : (
            <p className="flex items-center justify-center gap-2 py-6 text-center text-sm text-muted-foreground">
              <Users className="h-4 w-4" aria-hidden /> No provider breakdown this week.
            </p>
          )}
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Monthly trend */}
        <Panel title="Monthly trend" subtitle="Total encounters per month" source="OneDrive / SharePoint" sourceMode={spreadsheetMode}>
          {months.length ? (
            <ul className="space-y-2.5">
              {months.map((m) => (
                <li key={m.month} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-xs font-medium text-muted-foreground">{m.label}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-chart-2" style={{ width: `${Math.round((m.total / maxMonth) * 100)}%` }} />
                  </div>
                  <span className="w-14 text-right text-xs font-semibold tabular-nums text-foreground">{m.total.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          ) : <p className="py-6 text-center text-sm text-muted-foreground">Not enough data for a monthly trend.</p>}
        </Panel>

        {/* Year over year */}
        <Panel
          title="Year over year"
          subtitle={yoy ? yoy.label : 'Add a prior-year file to compare'}
          source="OneDrive / SharePoint" sourceMode={spreadsheetMode}
        >
          {yoy ? (
            <>
              <div className="mb-3 flex items-end justify-between border-b border-border pb-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Total (month)</div>
                  <div className="text-2xl font-semibold tabular-nums text-foreground">{yoy.total.last.toLocaleString()}</div>
                </div>
                {yoy.total.prior != null && (
                  <span className="flex items-center gap-2 text-sm tabular-nums text-muted-foreground">
                    vs {yoy.total.prior.toLocaleString()} <Trend delta={yoy.total.last - yoy.total.prior} />
                  </span>
                )}
              </div>
              <MetricList rows={yoy.modalities} />
            </>
          ) : (
            <p className="flex items-center justify-center gap-2 py-6 text-center text-sm text-muted-foreground">
              <CalendarRange className="h-4 w-4" aria-hidden /> Connect this year and last year to compare.
            </p>
          )}
        </Panel>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Read live from your spreadsheet ({data.weeksAvailable ?? 0} weeks available) · in memory only,
        nothing stored · Refresh re-reads the latest saved version.
      </p>
    </div>
  );
}

export default function Reports() {
  const { data, loading } = useApi(getReports, []);
  const [override, setOverride] = useState<ReportsData | null>(null);

  if (spreadsheetMode === 'mock') return <ReportsPending />;
  if (loading && !override) return <Loading label="Loading the weekly report…" />;

  const report = override ?? data;
  if (!report) return <Loading label="Loading the weekly report…" />;
  if (!report.configured || !report.week) return <ConnectSpreadsheet data={report} onResult={setOverride} />;
  return <ReportView data={report} onChange={setOverride} />;
}
