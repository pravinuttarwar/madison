import { Link } from 'react-router-dom';
import {
  Mail,
  ListChecks,
  Clock3,
  Wallet,
  ArrowRight,
  Sun,
  CircleDot,
  Video,
  CalendarRange,
  Activity,
  UserPlus,
  Landmark,
  TrendingUp,
  Briefcase,
  Cog,
  AlertCircle,
  type LucideIcon,
} from 'lucide-react';
import { Panel, Trend, KpiTile } from '@/components/primitives';
import { Loading, ErrorState } from '@/components/AsyncState';
import { useApi } from '@/hooks/useApi';
import { getDashboard, sourceModeFor, type DashboardData } from '@/lib/api';
import { usd, pctChange } from '@/lib/format';
import { DATES, type EmailCategory } from '@/lib/data';
import { cn } from '@/lib/utils';
import { useUser } from '@/context/UserContext';
import { useViewMode, type ViewMode } from '@/context/view-mode';

const outlookMode = sourceModeFor('outlook');
const qboMode = sourceModeFor('quickbooks');
const spreadsheetMode = sourceModeFor('spreadsheet');

// Email briefing categories (MBI-19). Each important email is tagged Management /
// Operational / Action-needed, conveyed by icon + text label (never color alone) so the
// briefing is readable for color-vision deficiency. The icon tone is a secondary cue.
const EMAIL_CATEGORY_META: Record<EmailCategory, { label: string; Icon: LucideIcon; tone: string }> = {
  management: { label: 'Management', Icon: Briefcase, tone: 'text-primary' },
  operational: { label: 'Operational', Icon: Cog, tone: 'text-muted-foreground' },
  'action-needed': { label: 'Action needed', Icon: AlertCircle, tone: 'text-warning' },
};

function CategoryBadge({ category }: { category: EmailCategory }) {
  const meta = EMAIL_CATEGORY_META[category];
  const Icon = meta.Icon;
  return (
    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
      <Icon className={`h-3 w-3 shrink-0 ${meta.tone}`} aria-hidden />
      {meta.label}
    </span>
  );
}

// QuickBooks-not-connected note shared by the Monday financial tiles/panel. Keeps the
// view from crashing when financialWeek is null (no QBO session).
function NotConnected({ label = 'QuickBooks not connected' }: { label?: string }) {
  return (
    <p className="py-6 text-center text-sm text-muted-foreground">{label}</p>
  );
}

// ── View toggle — Daily ⇄ Monday ──────────────────────────────────────────────
// The active view is shown by aria-pressed + the active label's icon/weight, never by
// color alone (color-vision constraint). Native buttons = keyboard-accessible.
function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  const options: { id: ViewMode; label: string; icon: typeof Sun }[] = [
    { id: 'weekday', label: 'Daily', icon: Sun },
    { id: 'monday', label: 'Monday', icon: CalendarRange },
  ];
  return (
    <div
      role="group"
      aria-label="Dashboard view"
      className="inline-flex rounded-lg border border-border bg-muted p-0.5"
    >
      {options.map((o) => {
        const Icon = o.icon;
        const active = o.id === mode;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            aria-pressed={active}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
              active ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function SectionLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
    >
      {label}
      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
    </Link>
  );
}


export function TodayView({ data }: { data: DashboardData }) {
  const { user } = useUser();
  const ownerName = user?.displayName || data.owner;
  const dueToday = data.tasks.filter((t) => t.status === 'due-today').length;
  const overdue = data.tasks.filter((t) => t.status === 'overdue').length;
  const unreadImportant = data.emails.filter((e) => e.unread && e.important).length;
  const dep = data.financialDay?.depositYesterday;

  const toDoMode = sourceModeFor('microsoftToDo');

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <div className="rounded-xl border border-border bg-gradient-to-br from-primary to-primary/85 p-6 text-primary-foreground shadow-sm">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide opacity-90">
          <Sun className="h-4 w-4" aria-hidden /> Today
        </div>
        <h1 className="mt-2 text-xl font-semibold sm:text-2xl">Good morning, {ownerName}.</h1>
        <p className="mt-1 text-sm opacity-90">
          {DATES.weekday}
          {(dueToday + overdue + unreadImportant) > 0
            ? ` · ${dueToday + overdue + unreadImportant} item${dueToday + overdue + unreadImportant !== 1 ? 's' : ''} need attention today.`
            : ' · All clear — no urgent items today.'}
        </p>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiTile label="Emails to reply" value={String(unreadImportant)} sub="Flagged important, unread" icon={Mail} />
        <KpiTile label="Tasks due today" value={String(dueToday)} sub={`${overdue} overdue across owners`} icon={ListChecks} />
        <KpiTile label="Awaiting response" value={String(data.awaiting.length)} sub={`Sent ≥ ${data.awaitingThresholdHours}h, no reply`} icon={Clock3} />
        <KpiTile
          label="Yesterday deposit"
          value={dep ? usd(dep.total) : '-'}
          sub={dep ? dep.account : 'QuickBooks not connected'}
          icon={Wallet}
          trend={dep ? <Trend delta={pctChange(dep.total, dep.prior)} unit="%" /> : undefined}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Today's schedule */}
        <Panel title="Today's schedule" source="Outlook" sourceMode={outlookMode} className="lg:col-span-2">
          {data.schedule.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {outlookMode !== 'mock' ? 'No meetings on your calendar today.' : 'No events in sample data.'}
            </p>
          ) : (
          <ul className="divide-y divide-border">
            {data.schedule.map((s, i) => (
              <li key={`${s.time}-${i}`} className="flex items-center gap-4 py-2.5">
                <span className="w-14 shrink-0 text-sm font-semibold tabular-nums text-primary">{s.time}</span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${s.open ? 'text-muted-foreground' : 'text-foreground'}`}>
                    {s.title}
                  </p>
                  <p className="text-xs text-muted-foreground">{s.detail}</p>
                </div>
                {s.joinUrl && (
                  <a
                    href={s.joinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
                  >
                    <Video className="h-3.5 w-3.5" aria-hidden />
                    Join
                  </a>
                )}
                {s.open && !s.joinUrl && (
                  <span className="rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                    open
                  </span>
                )}
              </li>
            ))}
          </ul>
          )}
        </Panel>

        {/* Priority today — computed by the backend from To Do tasks */}
        <Panel
          title="Priority today"
          subtitle="Your overdue, then due-today tasks · top 5"
          source="Microsoft To Do" sourceMode={toDoMode}
        >
          {data.priorityToday.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {toDoMode !== 'mock' ? 'No urgent tasks — you\'re all caught up.' : 'No urgent tasks in sample data.'}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {data.priorityToday.map((item) => (
                <li key={item.id} className="flex items-start gap-3 py-2.5">
                  <CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.due}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Email triage */}
        <Panel
          title="Email triage"
          subtitle="Flagged-important emails in your inbox · most recent first"
          source="Outlook" sourceMode={outlookMode}
          action={<SectionLink to="/email" label="Open queue" />}
        >
          {data.emails.filter((e) => e.important).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {outlookMode !== 'mock' ? 'No flagged emails right now.' : 'No important emails in sample data.'}
            </p>
          ) : (
          <ul className="divide-y divide-border">
            {data.emails
              .filter((e) => e.important)
              .slice(0, 4)
              .map((e) => (
                <li key={e.id} className="flex items-start gap-3 py-2.5">
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${e.unread ? 'bg-primary' : 'bg-border'}`}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-foreground">{e.from}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{e.time}</span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{e.subject}</p>
                    <CategoryBadge category={e.category} />
                  </div>
                </li>
              ))}
          </ul>
          )}
        </Panel>

        {/* Awaiting response */}
        <Panel
          title="Awaiting response"
          subtitle={`Emails you sent ≥ ${data.awaitingThresholdHours}h ago with no reply · grouped by who you're waiting on`}
          source="Follow-up engine" sourceMode={outlookMode}
        >
          {data.awaiting.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {outlookMode !== 'mock' ? 'No unanswered emails — all caught up.' : 'No follow-ups in sample data.'}
            </p>
          ) : (
          <ul className="divide-y divide-border">
            {data.awaiting.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2.5">
                <span className="grid h-9 w-12 shrink-0 place-items-center rounded-lg bg-warning/10 text-sm font-bold text-warning">
                  {a.wait}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {a.to} — {a.subject}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{a.detail}</p>
                </div>
              </li>
            ))}
          </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

// ── Monday view — last week's recap + this Monday's priorities ────────────────
// Shown automatically on Mondays (and via the toggle): the weekly clinical metrics
// with week-over-week deltas, last week's financial summary, and what this week needs.
export function MondayView({ data }: { data: DashboardData }) {
  const { user } = useUser();
  const ownerName = user?.displayName || data.owner;
  const fin = data.financialWeek; // null when QuickBooks isn't connected
  // Spreadsheet-sourced fields are absent in live mode until the weekly spreadsheet is
  // wired — default safely so the view degrades instead of crashing.
  const metrics = data.metrics ?? [];
  const enc = data.totalEncounters ?? null;
  const hasWeeklyReport = metrics.length > 0;
  const newPatients = metrics.find((m) => m.key === 'new_patients');
  const maxDep = fin ? Math.max(...fin.depositsByDay.map((d) => d.amount)) : 0;

  const toDoMode = sourceModeFor('microsoftToDo');

  return (
    <div className="space-y-5">
      {/* Greeting — distinctly the Monday / week-in-review framing */}
      <div className="rounded-xl border border-border bg-gradient-to-br from-primary to-primary/85 p-6 text-primary-foreground shadow-sm">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide opacity-90">
          <CalendarRange className="h-4 w-4" aria-hidden /> Monday · Week in review
        </div>
        <h1 className="mt-2 text-xl font-semibold sm:text-2xl">Good morning, {ownerName}.</h1>
        <p className="mt-1 text-sm opacity-90">
          {DATES.monday} · Here's last week's recap and what this week needs.
        </p>
      </div>

      {/* Weekly recap KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiTile
          label="Total encounters"
          value={enc ? enc.last.toLocaleString() : '—'}
          sub={enc ? 'Last week · all specialties' : 'Weekly report not connected'}
          icon={Activity}
          trend={enc ? <Trend delta={pctChange(enc.last, enc.prior)} unit="%" /> : undefined}
        />
        {newPatients && (
          <KpiTile
            label="New patients"
            value={String(newPatients.last)}
            sub="Last week"
            icon={UserPlus}
            trend={<Trend delta={newPatients.last - newPatients.prior} />}
          />
        )}
        <KpiTile
          label="Deposits (last week)"
          value={fin ? usd(fin.totalDeposits.last) : '—'}
          sub={fin ? 'Week total' : 'QuickBooks not connected'}
          icon={Landmark}
          trend={fin ? <Trend delta={pctChange(fin.totalDeposits.last, fin.totalDeposits.prior)} unit="%" /> : undefined}
        />
        <KpiTile
          label="Net contribution"
          value={fin ? usd(fin.netContribution.last) : '—'}
          sub={fin ? 'Deposits − variable spend' : 'QuickBooks not connected'}
          icon={TrendingUp}
          trend={fin ? <Trend delta={pctChange(fin.netContribution.last, fin.netContribution.prior)} unit="%" /> : undefined}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Full week-over-week metrics table */}
        <Panel
          title="Weekly metrics"
          subtitle={hasWeeklyReport
            ? `Week ${data.weekNumber ?? '—'} vs the prior week · week-over-week`
            : "The providers' weekly spreadsheet isn't connected yet"}
          source="Weekly spreadsheet" sourceMode={spreadsheetMode}
          action={<SectionLink to="/reports" label="Open report" />}
          className="lg:col-span-2"
        >
          {!hasWeeklyReport ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Weekly report not connected — wire the providers' spreadsheet to populate
              new patients, encounters by specialty and the week-over-week metrics.
            </p>
          ) : (
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
                  {metrics.map((m) => (
                    <tr key={m.key} className="transition-colors hover:bg-muted/50">
                      <td className="py-2 pr-3 font-medium text-foreground">{m.label}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-foreground">{m.last}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{m.prior}</td>
                      <td className="py-2 pl-3 text-right">
                        <Trend delta={m.last - m.prior} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {/* This week's priorities — same backend-derived list as the daily view */}
        <Panel
          title="This week's priorities"
          subtitle="Your overdue, then due-today tasks · top 5"
          source="Microsoft To Do" sourceMode={toDoMode}
        >
          {data.priorityToday.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {toDoMode !== 'mock' ? "No urgent tasks — you're all caught up." : 'No urgent tasks in sample data.'}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {data.priorityToday.map((item) => (
                <li key={item.id} className="flex items-start gap-3 py-2.5">
                  <CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.due}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* This Monday's schedule */}
        <Panel title="Today's schedule" source="Outlook" sourceMode={outlookMode} className="lg:col-span-2">
          {data.schedule.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {outlookMode !== 'mock' ? 'No meetings on your calendar today.' : 'No events in sample data.'}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {data.schedule.map((s, i) => (
                <li key={`${s.time}-${i}`} className="flex items-center gap-4 py-2.5">
                  <span className="w-14 shrink-0 text-sm font-semibold tabular-nums text-primary">{s.time}</span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium ${s.open ? 'text-muted-foreground' : 'text-foreground'}`}>
                      {s.title}
                    </p>
                    <p className="text-xs text-muted-foreground">{s.detail}</p>
                  </div>
                  {s.open && (
                    <span className="rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                      open
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Last week's deposits by day — the weekly financial summary */}
        <Panel title="Last week — deposits by day" source="QuickBooks" sourceMode={qboMode}>
          {!fin ? (
            <NotConnected />
          ) : (
            <>
              <div className="space-y-2.5">
                {fin.depositsByDay.map((d) => (
                  <div key={d.day} className="flex items-center gap-3">
                    <span className="w-9 text-xs font-medium text-muted-foreground">{d.day}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-chart-2" style={{ width: `${Math.round((d.amount / maxDep) * 100)}%` }} />
                    </div>
                    <span className="w-20 text-right text-xs font-semibold tabular-nums text-foreground">{usd(d.amount)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                <span className="text-sm text-muted-foreground">Net contribution</span>
                <span className="flex items-center gap-2 text-sm font-semibold tabular-nums">
                  {usd(fin.netContribution.last)}
                  <Trend delta={pctChange(fin.netContribution.last, fin.netContribution.prior)} unit="%" />
                </span>
              </div>
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { mode, setMode } = useViewMode();
  const { data, loading, error } = useApi(() => getDashboard(mode), [mode]);

  return (
    <div className="space-y-5">
      {/* The toggle stays mounted across loads so the owner can always switch views. */}
      <div className="flex items-center justify-end">
        <ViewToggle mode={mode} onChange={setMode} />
      </div>
      {loading ? (
        <Loading label="Loading your command center…" />
      ) : error || !data ? (
        <ErrorState message={error?.message} />
      ) : mode === 'monday' ? (
        <MondayView data={data} />
      ) : (
        <TodayView data={data} />
      )}
    </div>
  );
}
