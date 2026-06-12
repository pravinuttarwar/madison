import { useState } from 'react';
import { RefreshCw, FileSpreadsheet, Link2, Loader2, AlertCircle, Users } from 'lucide-react';
import { Panel, Trend, Bar, KpiTile } from '@/components/primitives';
import { Loading } from '@/components/AsyncState';
import { useApi } from '@/hooks/useApi';
import { getReports, setReportsSource, sourceModeFor, ApiError, type ReportsData } from '@/lib/api';

const spreadsheetMode = sourceModeFor('spreadsheet');

const CHART_COLORS = [
  'var(--color-chart-1)', 'var(--color-chart-2)', 'var(--color-chart-3)',
  'var(--color-chart-4)', 'var(--color-chart-5)', 'var(--color-primary)', 'var(--color-brand)',
];

function fmtWeek(iso?: string) {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Mock / no-backend → keep the explicit "pending" beat.
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
            Connect a live backend to read your providers' weekly spreadsheet and show each week's
            encounters by modality and provider, week-over-week.
          </p>
        </div>
      </div>
    </div>
  );
}

// Live but no file connected yet → paste the share link.
function ConnectSpreadsheet({ onConnected }: { onConnected: (r: ReportsData) => void }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await setReportsSource(url.trim());
      if (!r.configured) throw new Error('Could not read that file.');
      onConnected(r);
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      setError(
        status === 422
          ? "That file doesn't match the expected weekly format (Totals / Provider sheets)."
          : status === 403
            ? "We couldn't access that file — check the link is shared with your account."
            : 'Could not read that file. Check the link and try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Providers' weekly report</h1>
        <p className="text-sm text-muted-foreground">
          Connect your weekly spreadsheet and we'll show each week's encounters by modality and
          provider — read-only, refreshed on demand.
        </p>
      </div>
      <Panel title="Connect your spreadsheet" source="OneDrive / SharePoint" sourceMode={spreadsheetMode}>
        <p className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link2 className="h-3.5 w-3.5" aria-hidden />
          Paste the share link to your "Patient Numbers" workbook (OneDrive or SharePoint).
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && connect()}
            placeholder="https://…sharepoint.com/…"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none ring-primary/30 focus:ring-2"
          />
          <button
            onClick={connect}
            disabled={busy || !url.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileSpreadsheet className="h-4 w-4" aria-hidden />}
            Connect
          </button>
        </div>
        {error && (
          <p className="mt-2.5 flex items-start gap-1.5 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {error}
          </p>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          We read the file in memory to show the latest week — nothing is stored. Same-format files
          (new months/years) work as-is; a different layout is flagged rather than shown wrong.
        </p>
      </Panel>
    </div>
  );
}

function ReportView({ data, onChange }: { data: ReportsData; onChange: (r: ReportsData) => void }) {
  const [refreshing, setRefreshing] = useState(false);
  const specialties = data.specialties ?? [];
  const providers = data.providers ?? [];
  const total = data.totalEncounters ?? { last: 0, prior: null };
  const maxSpec = Math.max(1, ...specialties.map((s) => s.last));
  const maxProv = Math.max(1, ...providers.map((p) => p.last));

  async function refresh() {
    setRefreshing(true);
    try {
      onChange(await getReports(true));
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Providers' weekly report</h1>
          <p className="text-sm text-muted-foreground">
            Week of <span className="font-medium text-foreground">{fmtWeek(data.weekStart)}</span>
            {data.priorWeekStart ? ` vs prior week (${fmtWeek(data.priorWeekStart)})` : ''}
            {data.fileName ? ` · ${data.fileName}` : ''}
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden />
          Refresh
        </button>
      </div>

      {/* Headline */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiTile
          label="Total encounters"
          value={total.last.toLocaleString()}
          sub="This week"
          trend={total.prior != null ? <Trend delta={total.last - total.prior} /> : undefined}
        />
        {specialties.slice(0, 3).map((s) => (
          <KpiTile
            key={s.key}
            label={s.label}
            value={s.last.toLocaleString()}
            trend={s.prior != null ? <Trend delta={s.last - s.prior} /> : undefined}
          />
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* By modality / specialty */}
        <Panel title="Encounters by modality" source="OneDrive / SharePoint" sourceMode={spreadsheetMode}>
          {specialties.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No modality rows this week.</p>
          ) : (
            <ul className="space-y-3.5">
              {specialties.map((s, i) => (
                <li key={s.key}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">{s.label}</span>
                    <span className="flex items-center gap-2 tabular-nums text-muted-foreground">
                      {s.last}
                      {s.prior != null && <Trend delta={s.last - s.prior} />}
                    </span>
                  </div>
                  <Bar value={s.last} max={maxSpec} colorVar={CHART_COLORS[i % CHART_COLORS.length]} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* By provider */}
        <Panel
          title="By provider"
          subtitle="Weekly encounters per provider"
          source="OneDrive / SharePoint"
          sourceMode={spreadsheetMode}
        >
          {providers.length === 0 ? (
            <p className="flex items-center justify-center gap-2 py-6 text-center text-sm text-muted-foreground">
              <Users className="h-4 w-4" aria-hidden /> No provider breakdown for this week.
            </p>
          ) : (
            <ul className="space-y-3.5">
              {providers.map((p, i) => (
                <li key={p.name}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">{p.name}</span>
                    <span className="flex items-center gap-2 tabular-nums text-muted-foreground">
                      {p.last}
                      {p.prior != null && <Trend delta={p.last - p.prior} />}
                    </span>
                  </div>
                  <Bar value={p.last} max={maxProv} colorVar={CHART_COLORS[i % CHART_COLORS.length]} />
                </li>
              ))}
            </ul>
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
  if (!report || !report.configured) return <ConnectSpreadsheet onConnected={setOverride} />;
  return <ReportView data={report} onChange={setOverride} />;
}
