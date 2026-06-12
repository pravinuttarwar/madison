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
} from 'lucide-react';
import { Panel, Trend, KpiTile } from '@/components/primitives';
import { Loading, ErrorState } from '@/components/AsyncState';
import { useApi } from '@/hooks/useApi';
import { getDashboard, sourceModeFor, type DashboardData } from '@/lib/api';
import { usd, pctChange } from '@/lib/format';
import { DATES } from '@/lib/data';
import { useUser } from '@/context/UserContext';

const outlookMode = sourceModeFor('outlook');

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


function TodayView({ data }: { data: DashboardData }) {
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

export default function Dashboard() {
  const { data, loading, error } = useApi(() => getDashboard('weekday'), []);

  if (loading) return <Loading label="Loading your command center…" />;
  if (error || !data) return <ErrorState message={error?.message} />;

  return <TodayView data={data} />;
}
