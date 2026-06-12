import { RefreshCw, FileSpreadsheet, Clock } from 'lucide-react';
import { Panel, Trend, Bar } from '@/components/primitives';
import { Loading, ErrorState } from '@/components/AsyncState';
import { useApi } from '@/hooks/useApi';
import { getReports, sourceModeFor } from '@/lib/api';
import { pctChange } from '@/lib/format';

const spreadsheetMode = sourceModeFor('spreadsheet');

// The providers' weekly spreadsheet isn't wired yet (we need the source file + the
// cell/named-range map). Until then the tab shows an explicit "pending" beat rather
// than illustrative numbers, so nothing reads as live that isn't.
function ReportsPending() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Providers' weekly report</h1>
        <p className="text-sm text-muted-foreground">
          A live snapshot of your weekly provider spreadsheet — week-over-week, no waiting for it to
          be handed over.
        </p>
      </div>

      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-card py-16 text-center shadow-sm">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
          <FileSpreadsheet className="h-6 w-6" aria-hidden />
        </div>
        <div>
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Clock className="h-4 w-4 text-muted-foreground" aria-hidden />
            Pending implementation
          </p>
          <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-muted-foreground">
            This view reads your providers' weekly spreadsheet from Microsoft file storage and shows
            each metric week-over-week — new patients, encounters by specialty, recovery, allergy and
            more. To wire it up we need the source file and which cells / named ranges map to each
            metric. Share that and we'll mirror your exact layout here.
          </p>
        </div>
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
  const { data, loading, error } = useApi(getReports, []);

  // Spreadsheet ingestion not wired → show the pending beat instead of mock numbers.
  if (spreadsheetMode === 'mock') return <ReportsPending />;

  if (loading) return <Loading label="Loading the weekly report…" />;
  if (error || !data) return <ErrorState message={error?.message} />;

  const {
    weekNumber: WEEK_NUMBER,
    metrics: WEEKLY_METRICS,
    encountersBySpecialty: ENCOUNTERS_BY_SPECIALTY,
    totalEncounters: TOTAL_ENCOUNTERS,
  } = data;
  const maxEnc = Math.max(...ENCOUNTERS_BY_SPECIALTY.map((e) => e.last));

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
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Snapshot · refreshed each Monday
        </span>
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
                  <th className="py-2 pl-3 text-right font-medium">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {WEEKLY_METRICS.map((m) => (
                  <tr key={m.key} className="transition-colors hover:bg-muted/50">
                    <td className="py-2.5 pr-3 font-medium text-foreground">{m.label}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-foreground">{m.last}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">{m.prior}</td>
                    <td className="py-2.5 pl-3 text-right">
                      <Trend delta={m.last - m.prior} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Change is week-over-week count difference. We'd mirror your exact metric layout and named
            ranges once you share the source file.
          </p>
        </Panel>
      </div>
    </div>
  );
}
