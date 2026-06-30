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
function ReportsConnect({
  connectedName,
  readFailed,
  onConnected,
  onCancel,
  canCancel,
}: {
  connectedName: string | null;
  readFailed: boolean;
  onConnected: () => void;
  onCancel: () => void;
  canCancel: boolean;
}) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const value = input.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    try {
      await connectWorkbook(value);
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
          <button
            onClick={submit}
            disabled={busy || !input.trim()}
            className="inline-flex items-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Checking…' : connectedName ? 'Connect new workbook' : 'Connect'}
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

  const {
    weekNumber: WEEK_NUMBER,
    metrics: WEEKLY_METRICS,
    encountersBySpecialty: ENCOUNTERS_BY_SPECIALTY,
    totalEncounters: TOTAL_ENCOUNTERS,
    providers: PROVIDERS = [],
  } = data;
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
          <h1 className="text-xl font-semibold text-foreground">Providers' weekly report</h1>
          <p className="text-sm text-muted-foreground">
            A live snapshot of the weekly spreadsheet — Week {WEEK_NUMBER} vs the prior week. No more
            waiting for it to be handed over.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
        <Panel title="Weekly metrics" source="12 metrics" className="lg:col-span-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Metric</th>
                  <th className="py-2 px-3 text-right font-medium">Last week</th>
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
            Change is the week-over-week count difference{hasMoM ? '; MoM compares month-to-date against the prior month' : ''}{hasYoY ? '; YoY compares against the same period last year' : ''}. We'd
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
            Encounters by provider this month vs last — from your Provider Totals tabs.
          </p>
        </Panel>
      )}
    </div>
  );
}
