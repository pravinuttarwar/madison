import { useState } from 'react';
import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Panel, StatusPill, OwnerChip } from '@/components/primitives';
import { Loading, ErrorState } from '@/components/AsyncState';
import { useApi } from '@/hooks/useApi';
import { getTasks, type OwnerTasks } from '@/lib/api';
import { type Task } from '@/lib/data';
import { useUser } from '@/context/UserContext';

const ORDER: Record<Task['status'], number> = { overdue: 0, 'due-today': 1, upcoming: 2, done: 3 };
type Filter = 'all' | 'overdue' | 'due-today' | 'upcoming';

function TaskRow({ t }: { t: Task }) {
  return (
    <li className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{t.title}</p>
        <p className="text-xs text-muted-foreground">Due: {t.due}</p>
      </div>
      <StatusPill kind={t.status} />
    </li>
  );
}

function FilterChips({ filter, setFilter, counts }: { filter: Filter; setFilter: (f: Filter) => void; counts: Record<Filter, number> }) {
  const items: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' }, { id: 'overdue', label: 'Overdue' },
    { id: 'due-today', label: 'Due today' }, { id: 'upcoming', label: 'Upcoming' },
  ];
  return (
    <div className="inline-flex items-center rounded-lg border border-border bg-muted p-0.5">
      {items.map((f) => (
        <button
          key={f.id} onClick={() => setFilter(f.id)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
            filter === f.id ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {f.label}
          <span className="rounded-full bg-background px-1.5 text-[10px] tabular-nums">{counts[f.id]}</span>
        </button>
      ))}
    </div>
  );
}

// ── Multi-owner "tasks by owner" board (app-only Tasks.Read.All) ──────────────
function OwnerBoard({ owners }: { owners: OwnerTasks[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const match = (t: Task) => filter === 'all' || t.status === filter;
  // Counts come from the owners' FULL per-status totals (incl. o.upcoming) — never derived
  // from the capped `tasks` list — so the chips reconcile: All = Overdue + Due-today + Upcoming.
  const counts: Record<Filter, number> = {
    all: owners.reduce((s, o) => s + o.open, 0),
    overdue: owners.reduce((s, o) => s + o.overdue, 0),
    'due-today': owners.reduce((s, o) => s + o.dueToday, 0),
    upcoming: owners.reduce((s, o) => s + o.upcoming, 0),
  };
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Tasks by owner</h1>
          <p className="text-sm text-muted-foreground">
            Open To Do items across the team — {owners.length} {owners.length === 1 ? 'person' : 'people'}, sorted by overdue.
          </p>
        </div>
        <FilterChips filter={filter} setFilter={setFilter} counts={counts} />
      </div>

      <div className="grid items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
        {owners.map((o) => {
          const list = o.tasks.filter(match).sort((a, b) => ORDER[a.status] - ORDER[b.status]);
          const capped = o.open > o.tasks.length; // backend caps loaded tasks per owner
          return (
            <Panel
              key={o.upn}
              action={
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{o.open} open</span>
                  {o.overdue > 0 && <StatusPill kind="overdue" labelOverride={`${o.overdue} overdue`} />}
                </div>
              }
            >
              <div className="mb-3"><OwnerChip label={o.name} full={o.name} /></div>
              {/* Fixed-height, scrollable list → all cards line up at the same height */}
              <div className="h-64 overflow-y-auto pr-1">
                {list.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">No tasks match this filter.</p>
                ) : (
                  <ul className="space-y-2">
                    {list.map((t) => <TaskRow key={t.id} t={t} />)}
                    {capped && filter === 'all' && (
                      <li className="pt-1 text-center text-[11px] text-muted-foreground">
                        Showing {o.tasks.length} of {o.open} — open To Do for the rest
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

// ── Single-user view (no team configured) ────────────────────────────────────
function MyTasks({ tasks }: { tasks: Task[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const { user } = useUser();
  const myName = user?.displayName || 'You';
  const counts: Record<Filter, number> = {
    all: tasks.length,
    overdue: tasks.filter((t) => t.status === 'overdue').length,
    'due-today': tasks.filter((t) => t.status === 'due-today').length,
    upcoming: tasks.filter((t) => t.status === 'upcoming').length,
  };
  const open = tasks.filter((t) => t.status !== 'done').length;
  const visible = tasks.filter((t) => filter === 'all' || t.status === filter).sort((a, b) => ORDER[a.status] - ORDER[b.status]);

  if (tasks.length === 0)
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-semibold text-foreground">Your tasks</h1>
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-sm font-medium text-foreground">No tasks found</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Your Microsoft To Do has no tasks yet — add some and they'll appear here.
          </p>
        </div>
      </div>
    );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Your tasks</h1>
          <p className="text-sm text-muted-foreground">Your Microsoft To Do, grouped by status.</p>
        </div>
        <FilterChips filter={filter} setFilter={setFilter} counts={counts} />
      </div>
      <Panel
        action={
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{open} open</span>
            {counts.overdue > 0 && <StatusPill kind="overdue" labelOverride={`${counts.overdue} overdue`} />}
          </div>
        }
      >
        <div className="mb-3"><OwnerChip label={myName} full={myName} /></div>
        {visible.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No tasks match this filter.</p>
        ) : (
          <ul className="space-y-2">{visible.map((t) => <TaskRow key={t.id} t={t} />)}</ul>
        )}
      </Panel>
      <div className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-muted/20 p-4">
        <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div>
          <p className="text-sm font-medium text-foreground">Showing your tasks only</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            A shared "tasks by owner" view across the team turns on once the team's accounts are
            configured — read-only, via the granted Microsoft Tasks permission.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Tasks() {
  const { data, loading, error } = useApi(getTasks, []);
  if (loading) return <Loading label="Loading tasks…" />;
  if (error || !data) return <ErrorState message={error?.message} />;

  if (data.multiOwner && data.owners) return <OwnerBoard owners={data.owners} />;
  return <MyTasks tasks={data.tasks ?? []} />;
}
