import { useState } from 'react';
import {
  RefreshCw, FileSpreadsheet, Link2, Loader2, AlertCircle, Users, Plus, X, HardDrive, CalendarRange,
} from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { Panel, Trend, Bar, KpiTile } from '@/components/primitives';
import { Loading } from '@/components/AsyncState';
import { useApi } from '@/hooks/useApi';
import {
  getReports, addReportsSource, loadLocalReports, removeReportsSource,
  sourceModeFor, ApiError, type ReportsData, type Period,
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const YEAR_COLORS = ['var(--color-chart-2)', 'var(--color-primary)', 'var(--color-chart-3)', 'var(--color-chart-5)', 'var(--color-chart-4)'];

// Multi-year monthly line chart (Recharts) — one line per year, with hover tooltip,
// legend and a responsive container. Each added year is just another <Line>.
function ReportTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => p.value != null && p.value > 0);
  if (!rows.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-semibold text-foreground">{label}</div>
      {rows.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-muted-foreground">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
          {p.name}: <span className="font-semibold tabular-nums text-foreground">{p.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

function YearLineChart({ ym }: { ym: { years: string[]; totals: Record<string, number[]> } }) {
  const { years, totals } = ym;
  const color = (yi: number) => YEAR_COLORS[yi % YEAR_COLORS.length];
  const data = MONTHS.map((m, i) => {
    const row: Record<string, number | string | null> = { month: m };
    for (const y of years) {
      const v = totals[y]?.[i] ?? 0;
      row[y] = v > 0 ? v : null; // null → no point (partial years stop cleanly)
    }
    return row;
  });
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -6 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }} tickLine={false} axisLine={{ stroke: 'var(--color-border)' }} />
        <YAxis tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }} tickLine={false} axisLine={false} width={48} />
        <Tooltip content={<ReportTooltip />} cursor={{ stroke: 'var(--color-muted-foreground)', strokeDasharray: '3 3' }} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        {years.map((y, yi) => (
          <Line key={y} type="monotone" dataKey={y} name={y} stroke={color(yi)} strokeWidth={2}
            dot={{ r: 2.5, fill: color(yi) }} activeDot={{ r: 4 }} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function pctChip(a: number, b: number) {
  if (a === 0) return b > 0 ? <span className="text-success">new</span> : <span className="text-muted-foreground">—</span>;
  const pct = Math.round(((b - a) / a) * 100);
  const cls = pct > 0 ? 'text-success' : pct < 0 ? 'text-destructive' : 'text-muted-foreground';
  return <span className={cls}>{pct > 0 ? '+' : ''}{pct}%</span>;
}

// Pick any two periods (year or month) and see them side by side by modality + provider.
function PeriodCompare({ data }: { data: ReportsData }) {
  const periods = data.periods ?? {};
  const avail = data.available ?? { years: [], months: [] };
  const names = data.modalityNames ?? {};
  const options = [
    ...avail.years.map((y) => ({ id: `year:${y}`, label: y })),
    ...avail.months.map((m) => ({ id: `month:${m}`, label: periods[`month:${m}`]?.label || m })),
  ];
  const lastY = avail.years.length ? `year:${avail.years[avail.years.length - 1]}` : (avail.months.length ? `month:${avail.months[avail.months.length - 1]}` : '');
  const prevY = avail.years.length >= 2 ? `year:${avail.years[avail.years.length - 2]}` : lastY;
  const [a, setA] = useState(prevY);
  const [b, setB] = useState(lastY);

  // Like-for-like: comparing two YEARS where one is partial (current year) clips BOTH to
  // the same months (year-to-date), so "2025 vs 2026" isn't 12 months vs 5.
  const lastMonthIdx = (year: string) => {
    const arr = data.yearMonthly?.totals?.[year] || [];
    let last = -1;
    arr.forEach((v, i) => { if (v > 0) last = i; });
    return last;
  };
  const clipYear = (year: string, maxIdx: number): Period => {
    const modalities: Record<string, number> = {};
    const providers: Record<string, number> = {};
    let total = 0;
    for (let m = 0; m <= maxIdx; m++) {
      const p = periods[`month:${year}-${String(m + 1).padStart(2, '0')}`];
      if (!p) continue;
      total += p.total;
      for (const [k, v] of Object.entries(p.modalities)) modalities[k] = (modalities[k] || 0) + v;
      for (const [k, v] of Object.entries(p.providers)) providers[k] = (providers[k] || 0) + v;
    }
    return { id: `year:${year}`, kind: 'year', label: year, total, modalities, providers };
  };

  const aYear = a.startsWith('year:') ? a.slice(5) : null;
  const bYear = b.startsWith('year:') ? b.slice(5) : null;
  let pa = periods[a];
  let pb = periods[b];
  let clipNote = '';
  if (aYear && bYear) {
    const common = Math.min(lastMonthIdx(aYear), lastMonthIdx(bYear));
    if (common >= 0 && common < 11) {
      pa = clipYear(aYear, common);
      pb = clipYear(bYear, common);
      clipNote = `Year-to-date · Jan–${MONTHS[common]} (like-for-like)`;
    }
  }

  const sel = (val: string, set: (v: string) => void) => (
    <select value={val} onChange={(e) => set(e.target.value)} className="rounded-lg border border-border bg-background px-2 py-1 text-xs font-semibold text-foreground outline-none">
      {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  );

  function rows(field: 'modalities' | 'providers') {
    if (!pa || !pb) return [];
    const keys = [...new Set([...Object.keys(pa[field]), ...Object.keys(pb[field])])];
    return keys
      .map((k) => ({ label: field === 'modalities' ? names[k] || k : k, a: pa[field][k] || 0, b: pb[field][k] || 0 }))
      .filter((r) => r.a > 0 || r.b > 0)
      .sort((x, y) => y.b - x.b);
  }

  if (!pa || !pb) return <p className="py-6 text-center text-sm text-muted-foreground">Add a second period to compare.</p>;
  const paF = pa, pbF = pb; // narrowed for the closure below
  const dataRow = (r: { label: string; a: number; b: number }, bold = false) => (
    <tr key={r.label} className={bold ? 'bg-muted/40' : ''}>
      <td className={`py-1.5 pl-3 pr-3 ${bold ? 'font-semibold' : 'font-medium'} text-foreground`}>{r.label}</td>
      <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">{r.a.toLocaleString()}</td>
      <td className="py-1.5 px-3 text-right font-semibold tabular-nums text-foreground">{r.b.toLocaleString()}</td>
      <td className="py-1.5 pl-3 pr-3 text-right text-xs font-semibold tabular-nums">{pctChip(r.a, r.b)}</td>
    </tr>
  );
  const section = (title: string, field: 'modalities' | 'providers') => {
    const rs = rows(field);
    if (!rs.length) return null;
    return (
      <>
        <tr>
          <td colSpan={4} className="pt-3 pb-1 pl-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</td>
        </tr>
        {rs.map((r) => dataRow(r))}
      </>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        Compare {sel(a, setA)} <span>vs</span> {sel(b, setB)}
        {clipNote && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{clipNote}</span>}
      </div>
      {/* One table → headers and data share the same columns (aligned) */}
      <table className="w-full text-sm">
        <colgroup>
          <col /><col className="w-28" /><col className="w-28" /><col className="w-20" />
        </colgroup>
        <thead>
          <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <th />
            <th className="px-3 py-1.5 text-right font-semibold">{paF.label}</th>
            <th className="px-3 py-1.5 text-right font-semibold">{pbF.label}</th>
            <th className="px-3 py-1.5 text-right font-semibold">Δ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {dataRow({ label: 'Total', a: paF.total, b: pbF.total }, true)}
          {section('By modality', 'modalities')}
          {section('By provider', 'providers')}
        </tbody>
      </table>
    </div>
  );
}

function ReportView({ data, onChange }: { data: ReportsData; onChange: (r: ReportsData) => void }) {
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);
  const week = data.week!;
  const ym = data.yearMonthly;
  const sources = data.sources ?? [];

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
        <span className="mr-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Connected files</span>
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
      <p className="-mt-2 text-[11px] text-muted-foreground">
        Files power the multi-year chart and year-over-year comparison below. The "Latest week"
        figures always reflect your most recent week, so removing an older year won't change them.
      </p>
      {adding && (
        <Panel title="Add another year" source="OneDrive / SharePoint" sourceMode={spreadsheetMode}>
          <AddSourceForm onResult={(r) => { onChange(r); setAdding(false); }} />
        </Panel>
      )}

      {/* Headline */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiTile
          label="Total encounters" value={week.totalEncounters.last.toLocaleString()} sub="Latest week"
          trend={week.totalEncounters.prior != null ? <Trend delta={week.totalEncounters.last - week.totalEncounters.prior} /> : undefined}
        />
        {week.modalities.slice(0, 3).map((m) => (
          <KpiTile key={m.key} label={m.label} value={m.last.toLocaleString()}
            trend={m.prior != null ? <Trend delta={m.last - m.prior} /> : undefined} />
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Latest week by modality" source="OneDrive / SharePoint" sourceMode={spreadsheetMode}>
          {week.modalities.length ? <MetricList rows={week.modalities} /> : <p className="py-6 text-center text-sm text-muted-foreground">No modality rows this week.</p>}
        </Panel>
        <Panel title="Latest week by provider" subtitle="Encounters per provider" source="OneDrive / SharePoint" sourceMode={spreadsheetMode}>
          {week.providers.length ? <MetricList rows={week.providers.map((p) => ({ label: p.name, last: p.last, prior: p.prior }))} /> : (
            <p className="flex items-center justify-center gap-2 py-6 text-center text-sm text-muted-foreground">
              <Users className="h-4 w-4" aria-hidden /> No provider breakdown this week.
            </p>
          )}
        </Panel>
      </div>

      {/* Monthly totals across years — the primary comparison visual */}
      <Panel
        title="Monthly encounters by year"
        subtitle={ym && ym.years.length > 1 ? 'Each line is a year — compare month-to-month and year-to-year' : 'Add a prior-year file to overlay year-over-year'}
        source="OneDrive / SharePoint" sourceMode={spreadsheetMode}
      >
        {ym && ym.years.length ? <YearLineChart ym={ym} /> : (
          <p className="flex items-center justify-center gap-2 py-6 text-center text-sm text-muted-foreground">
            <CalendarRange className="h-4 w-4" aria-hidden /> Not enough data yet.
          </p>
        )}
      </Panel>

      {/* Pick any two periods, side by side. key on the available periods → the A/B
          selectors reset to valid defaults when a year is added/removed. */}
      <Panel title="Side-by-side comparison" subtitle="Any two years or months, by modality and provider" source="OneDrive / SharePoint" sourceMode={spreadsheetMode}>
        <PeriodCompare key={(data.available?.years ?? []).join(',') + '|' + (data.available?.months?.length ?? 0)} data={data} />
      </Panel>

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
