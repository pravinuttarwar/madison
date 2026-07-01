import { useRef, useState } from 'react';
import { RefreshCw, FileSpreadsheet, AlertTriangle, Pencil } from 'lucide-react';
import { Panel, Trend, Bar } from '@/components/primitives';
import { Loading } from '@/components/AsyncState';
import { useApi } from '@/hooks/useApi';
import { getReports, getWorkbookConnection, connectWorkbook, getAuthScopes, sourceModeFor } from '@/lib/api';
import { pctChange } from '@/lib/format';

const spreadsheetMode = sourceModeFor('spreadsheet');

// MAD-42 — when the granted scopes lack Sites.Read.All, explain why a SharePoint-hosted file
// won't resolve (OneDrive still works). Renders nothing until the scopes are known.
function SharePointHint() {
  const { data } = useApi(getAuthScopes, []);
  if (!data || data.delegated.length === 0) return null;
  if (data.delegated.some((s) => /^Sites\.Read/i.test(s))) return null;
  return (
    <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" aria-hidden />
      <span>SharePoint-hosted files need Sites.Read.All (not currently granted). OneDrive workbooks work today.</span>
    </p>
  );
}

// MAD-43 — connect/edit the weekly workbook inline on Reports (no separate Connections tab).
// Paste a OneDrive/SharePoint share-link or drive path; the backend validates read-only
// reachability and persists only the location. On failure it shows the backend's plain-language
// reason (what's wrong) — never the raw URL/token.
// tz-safe: the current calendar year is only the DEFAULT for the year selector (a label the user
// can change); a one-off ±1 near New Year's is harmless and self-correcting.
const THIS_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [0, 1, 2, 3, 4].map((n) => THIS_YEAR - n); // this year + 4 back

function ReportsConnect({
  connectedName,
  readFailed,
  onConnected,
  onCancel,
  canCancel,
  connectedYears = [],
}: {
  connectedName: string | null;
  readFailed: boolean;
  onConnected: () => void;
  onCancel: () => void;
  canCancel: boolean;
  connectedYears?: number[];
}) {
  const [input, setInput] = useState('');
  const [year, setYear] = useState(THIS_YEAR);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // MAD-52 [AC-2]: when the chosen year is already connected, the first Connect click arms an
  // overwrite confirm instead of replacing silently; a second (Replace) click proceeds.
  const [confirmingOverwrite, setConfirmingOverwrite] = useState(false);
  const yearTaken = connectedYears.includes(year);

  async function submit() {
    const value = input.trim();
    if (!value || busy) return;
    if (yearTaken && !confirmingOverwrite) {
      setConfirmingOverwrite(true); // warn first — don't overwrite the existing year silently
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await connectWorkbook(value, year);
      setConfirmingOverwrite(false);
      onConnected();
    } catch (e) {
      // ApiError.message carries the backend's plain-language reason — never the raw URL/token.
      setError(e instanceof Error ? e.message : 'Could not connect that workbook.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Providers' weekly report</h1>
        <p className="text-sm text-muted-foreground">
          A live snapshot of your weekly provider spreadsheet — week-over-week, no waiting for it to
          be handed over.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <FileSpreadsheet className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {connectedName ? 'Change the connected workbook' : 'Connect your weekly spreadsheet'}
            </p>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
              {readFailed && connectedName
                ? `We're connected to "${connectedName}", but couldn't read it as a report. Paste a different link, or check the file.`
                : connectedName
                  ? `Currently reading "${connectedName}". Paste a new OneDrive/SharePoint share-link or drive path to replace it.`
                  : 'Paste the OneDrive or SharePoint share-link (or drive path) to your providers\' weekly workbook. We confirm we can read it, then read the report live each time — we store only the file\'s location, never its contents.'}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Paste a share link or drive path"
            aria-label="Workbook share link or drive path"
            className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/30"
          />
          {/* MAD-52: which YEAR this workbook covers — connect two years to get the YoY comparison. */}
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Year
            <select
              value={year}
              onChange={(e) => { setYear(Number(e.target.value)); setConfirmingOverwrite(false); }}
              aria-label="Year this workbook covers"
              className="rounded-lg border border-border bg-card px-2 py-2 text-sm text-foreground shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/30"
            >
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>{y}{connectedYears.includes(y) ? ' • connected' : ''}</option>
              ))}
            </select>
          </label>
          <button
            onClick={submit}
            disabled={busy || !input.trim()}
            className="inline-flex items-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Checking…' : confirmingOverwrite ? `Replace ${year} workbook` : connectedName ? 'Connect new workbook' : 'Connect'}
          </button>
          {canCancel && (
            <button
              onClick={onCancel}
              className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50"
            >
              Cancel
            </button>
          )}
        </div>

        {/* MAD-52 [AC-2]: overwrite warning — the chosen year is already connected. */}
        {confirmingOverwrite && (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
            <span>
              A <span className="font-semibold">{year}</span> workbook is already connected. Connecting
              this one will <span className="font-semibold">replace</span> it. Click "Replace {year} workbook" to continue, or pick another year.
            </span>
          </p>
        )}

        {error && (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
            <span>
              <span className="font-semibold">Couldn't connect.</span> {error}
            </span>
          </p>
        )}

        <SharePointHint />
      </div>
    </div>
  );
}

const CHART_COLORS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
  'var(--color-primary)',
];

export default function Reports() {
  // reloadKey bumps after a (re)connect to refetch; editing shows the connect form over a report.
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState(false);
  // MAD-51: Month (default) vs Week period view. Only offered when the report carries a `weekly`
  // block section; selecting it swaps the numbers AND the labels to the weekly period.
  const [view, setView] = useState<'month' | 'week'>('month');
  // MAD-48: the report is cached 24h; the Refresh button forces a re-read via getReports(refresh).
  const forceRefresh = useRef(false);
  const { data, loading } = useApi(() => {
    const r = forceRefresh.current;
    forceRefresh.current = false;
    return getReports(r);
  }, [reloadKey]);
  const { data: conn } = useApi(getWorkbookConnection, [reloadKey]);
  const onRefresh = () => { forceRefresh.current = true; setReloadKey((k) => k + 1); };

  if (loading) return <Loading label="Loading the weekly report…" />;

  const connectedName = conn && conn.connected ? conn.name : null;
  // No report (not connected, or connected-but-unreadable) OR the user chose to change it →
  // show the inline connect/edit card (MAD-43). No separate Connections tab.
  if (!data || editing) {
    return (
      <ReportsConnect
        connectedName={connectedName}
        connectedYears={(conn && 'years' in conn && conn.years ? conn.years.map((y) => y.year) : [])}
        readFailed={!data && Boolean(connectedName)}
        canCancel={editing && Boolean(data)}
        onCancel={() => setEditing(false)}
        onConnected={() => {
          setEditing(false);
          setReloadKey((k) => k + 1);
        }}
      />
    );
  }

  // MAD-51: the weekly-block view is additive — present only when the workbook had a weekly block.
  // The toggle is shown only then; if absent, we stay on the monthly view as before.
  const WEEKLY = data.weekly && view === 'week' ? data.weekly : null;
  const showToggle = Boolean(data.weekly);
  // The ACTIVE view drives every number + period below: the weekly block when Week is selected,
  // else the monthly rollup. `warnings` always come from the monthly parse (source-level).
  const active = WEEKLY ?? data;
  const isWeek = Boolean(WEEKLY);
  const {
    period: PERIOD = null,
    metrics: WEEKLY_METRICS,
    encountersBySpecialty: ENCOUNTERS_BY_SPECIALTY,
    totalEncounters: TOTAL_ENCOUNTERS,
    providers: PROVIDERS = [],
  } = active;
  const WARNINGS = data.warnings ?? [];
  // View-aware labels — the inner cards now read the SELECTED period, never a hardcoded "week"
  // (MAD-51 retires the stale "Last week"/"week-over-week" labels on monthly data). The base
  // last-vs-prior comparison is named by period noun, distinct from the MoM/YoY columns.
  const periodNoun = isWeek ? 'week' : 'month';
  const PRIMARY_LABEL = isWeek ? 'This week' : 'This month';
  // MAD-50: the real period label. For the weekly view, "Week of Jun 22 vs Jun 15" (drop the
  // redundant "Week of " on the prior side).
  const PERIOD_LABEL = PERIOD?.current
    ? `${PERIOD.current}${PERIOD.prior ? ` vs ${isWeek ? PERIOD.prior.replace(/^Week of /, '') : PERIOD.prior}` : ''}`
    : 'this period';
  const maxEnc = Math.max(...ENCOUNTERS_BY_SPECIALTY.map((e) => e.last));
  // MAD-46: a per-provider breakdown appears only when provider tabs are connected/readable.
  const maxProv = Math.max(1, ...PROVIDERS.map((p) => p.current));
  // MAD-29: a year-ago column appears only when the workbook supplies prior-year values.
  const hasYoY = WEEKLY_METRICS.some((m) => m.yearAgo !== undefined);
  // MAD-28: a month-over-month column appears only when the workbook supplies month values.
  const hasMoM = WEEKLY_METRICS.some((m) => m.monthToDate !== undefined && m.prevMonth !== undefined);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Providers' report</h1>
          <p className="text-sm text-muted-foreground">
            A live snapshot of the providers' spreadsheet — {PERIOD_LABEL}. No more waiting for it to
            be handed over.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* MAD-51: Month | Week period toggle — only when the report carries a weekly block. */}
          {showToggle && (
            <div className="inline-flex rounded-full border border-border bg-card p-0.5 text-xs font-medium" role="group" aria-label="Reporting period">
              {(['month', 'week'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  aria-pressed={view === v}
                  className={`rounded-full px-3 py-1 capitalize transition-colors ${
                    view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/50'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={onRefresh}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Refresh
          </button>
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            Change workbook
          </button>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Snapshot · refreshed each Monday
          </span>
        </div>
      </div>

      {/* MAD-50: "found but not counted" — labels the parser saw but excluded (an after-TOTAL
          row, an unrecognized metric label). Surfaced so nothing is silently dropped; references
          only, never values. */}
      {WARNINGS.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          <div>
            <p className="font-medium text-foreground">
              {WARNINGS.length} {WARNINGS.length === 1 ? 'item' : 'items'} found but not counted — review
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              These spreadsheet rows weren't recognized as a metric or provider, so they're excluded
              from the totals: {WARNINGS.map((w) => w.label).join(', ')}.
            </p>
          </div>
        </div>
      )}

      {/* MAD-53: the prior-year sheet is a partial match for this month — YoY is shown only for the
          metrics it covers (the rest read "—"), and this note explains why, so a sparse prior-year
          workbook never silently produces a misleading comparison. */}
      {data.yoyNote && (
        <div className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          <p className="text-xs leading-relaxed text-foreground">{data.yoyNote}</p>
        </div>
      )}

      {/* Top-line encounters */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm sm:col-span-1">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total encounters</div>
          <div className="mt-2 flex items-end justify-between">
            <span className="text-2xl font-semibold tabular-nums text-foreground">
              {TOTAL_ENCOUNTERS.last.toLocaleString()}
            </span>
            <Trend delta={pctChange(TOTAL_ENCOUNTERS.last, TOTAL_ENCOUNTERS.prior)} unit="%" />
          </div>
          {hasYoY && TOTAL_ENCOUNTERS.yearAgo !== undefined && (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>YoY</span>
              <Trend delta={pctChange(TOTAL_ENCOUNTERS.last, TOTAL_ENCOUNTERS.yearAgo)} unit="%" />
            </div>
          )}
          {hasMoM && TOTAL_ENCOUNTERS.monthToDate !== undefined && TOTAL_ENCOUNTERS.prevMonth !== undefined && (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>MoM</span>
              <Trend delta={pctChange(TOTAL_ENCOUNTERS.monthToDate, TOTAL_ENCOUNTERS.prevMonth)} unit="%" />
            </div>
          )}
        </div>
        {WEEKLY_METRICS.slice(0, 3).map((m) => (
          <div key={m.key} className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{m.label}</div>
            <div className="mt-2 flex items-end justify-between">
              <span className="text-2xl font-semibold tabular-nums text-foreground">{m.last}</span>
              <Trend delta={m.last - m.prior} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        {/* Encounters by specialty */}
        <Panel title="Encounters by specialty" source="Weekly spreadsheet" sourceMode={spreadsheetMode} className="lg:col-span-2">
          <ul className="space-y-3.5">
            {ENCOUNTERS_BY_SPECIALTY.map((e, i) => (
              <li key={e.label}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">{e.label}</span>
                  <span className="flex items-center gap-2 tabular-nums text-muted-foreground">
                    {e.last}
                    <Trend delta={e.last - e.prior} />
                    {hasMoM && e.monthToDate !== undefined && e.prevMonth !== undefined && (
                      <span className="flex items-center gap-1">
                        <span className="text-[10px] uppercase tracking-wide">MoM</span>
                        <Trend delta={e.monthToDate - e.prevMonth} />
                      </span>
                    )}
                    {hasYoY && e.yearAgo !== undefined && (
                      <span className="flex items-center gap-1">
                        <span className="text-[10px] uppercase tracking-wide">YoY</span>
                        <Trend delta={e.last - e.yearAgo} />
                      </span>
                    )}
                  </span>
                </div>
                <Bar value={e.last} max={maxEnc} colorVar={CHART_COLORS[i % CHART_COLORS.length]} />
              </li>
            ))}
          </ul>
        </Panel>

        {/* Full 12-metric table */}
        <Panel title={`${isWeek ? 'Weekly' : 'Monthly'} metrics`} source="12 metrics" className="lg:col-span-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Metric</th>
                  <th className="py-2 px-3 text-right font-medium">{PRIMARY_LABEL}</th>
                  <th className="py-2 px-3 text-right font-medium">Prior</th>
                  <th className="py-2 px-3 text-right font-medium">Change</th>
                  {hasMoM && <th className="py-2 px-3 text-right font-medium">MoM</th>}
                  {hasYoY && <th className="py-2 pl-3 text-right font-medium">YoY</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {WEEKLY_METRICS.map((m) => (
                  <tr key={m.key} className="transition-colors hover:bg-muted/50">
                    <td className="py-2.5 pr-3 font-medium text-foreground">{m.label}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-foreground">{m.last}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">{m.prior}</td>
                    <td className="py-2.5 px-3 text-right">
                      <Trend delta={m.last - m.prior} />
                    </td>
                    {hasMoM && (
                      <td className="py-2.5 px-3 text-right">
                        {m.monthToDate !== undefined && m.prevMonth !== undefined ? <Trend delta={m.monthToDate - m.prevMonth} /> : <span className="text-muted-foreground">—</span>}
                      </td>
                    )}
                    {hasYoY && (
                      <td className="py-2.5 pl-3 text-right">
                        {m.yearAgo !== undefined ? <Trend delta={m.last - m.yearAgo} /> : <span className="text-muted-foreground">—</span>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Change is the count difference vs the prior {periodNoun}{hasMoM ? '; MoM compares month-to-date against the prior month' : ''}{hasYoY ? '; YoY compares against the same period last year' : ''}. We'd
            mirror your exact metric layout and named ranges once you share the source file.
          </p>
        </Panel>
      </div>

      {/* MAD-46 — by-provider breakdown (only when provider data is connected) */}
      {PROVIDERS.length > 0 && (
        <Panel title="By provider" source="Provider totals" sourceMode={spreadsheetMode}>
          <ul className="grid gap-3.5 sm:grid-cols-2">
            {PROVIDERS.map((p, i) => (
              <li key={p.name}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">{p.name}</span>
                  <span className="flex items-center gap-2 tabular-nums text-muted-foreground">
                    {p.current}
                    <Trend delta={p.current - p.prior} />
                  </span>
                </div>
                <Bar value={p.current} max={maxProv} colorVar={CHART_COLORS[i % CHART_COLORS.length]} />
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Encounters by provider this {periodNoun} vs last — from your Provider Totals tabs.
          </p>
        </Panel>
      )}
    </div>
  );
}
