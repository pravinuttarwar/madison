import { useState } from 'react';
import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Panel, StatusPill, OwnerChip } from '@/components/primitives';
import { Loading, ErrorState } from '@/components/AsyncState';
import { useApi } from '@/hooks/useApi';
import { getTasks, sourceModeFor } from '@/lib/api';
import { type Task } from '@/lib/data';
import { useUser } from '@/context/UserContext';

const todoMode = sourceModeFor('microsoftToDo');
const isLive = todoMode !== 'mock';

const ORDER: Record<Task['status'], number> = { overdue: 0, 'due-today': 1, upcoming: 2, done: 3 };

type Filter = 'all' | Task['status'];

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

export default function Tasks() {
  const [filter, setFilter] = useState<Filter>('all');
  const { data: tasks, loading, error } = useApi(getTasks, []);
  const { user } = useUser();

  if (loading) return <Loading label="Loading tasks…" />;
  if (error || !tasks) return <ErrorState message={error?.message} />;

  // Microsoft To Do only exposes the signed-in person's own lists. Live already
  // returns just their tasks; for the sample we scope to the owner ('DCR') so the
  // screen shows one person's list — never a multi-owner board we can't power yet.
  const myTasks = isLive ? tasks : tasks.filter((t) => t.owner === 'DCR');
  const myName = user?.displayName || 'You';

  if (myTasks.length === 0)
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Your tasks</h1>
        </div>
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-sm font-medium text-foreground">No tasks found</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isLive
              ? "Your Microsoft To Do has no tasks yet — add some and they'll appear here."
              : 'No tasks in the sample data.'}
          </p>
        </div>
      </div>
    );

  const overdue = myTasks.filter((t) => t.status === 'overdue').length;
  const dueToday = myTasks.filter((t) => t.status === 'due-today').length;
  const openCount = myTasks.filter((t) => t.status !== 'done').length;

  const filters: { id: Filter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: myTasks.length },
    { id: 'overdue', label: 'Overdue', count: overdue },
    { id: 'due-today', label: 'Due today', count: dueToday },
    { id: 'upcoming', label: 'Upcoming', count: myTasks.filter((t) => t.status === 'upcoming').length },
  ];

  const visible = myTasks
    .filter((t) => filter === 'all' || t.status === filter)
    .sort((a, b) => ORDER[a.status] - ORDER[b.status]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Your tasks</h1>
          <p className="text-sm text-muted-foreground">Your Microsoft To Do, grouped by status.</p>
        </div>
        <div className="inline-flex items-center rounded-lg border border-border bg-muted p-0.5">
          {filters.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                filter === f.id ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {f.label}
              <span className="rounded-full bg-background px-1.5 text-[10px] tabular-nums">{f.count}</span>
            </button>
          ))}
        </div>
      </div>

      <Panel
        title={undefined}
        action={
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{openCount} open</span>
            {overdue > 0 && <StatusPill kind="overdue" labelOverride={`${overdue} overdue`} />}
          </div>
        }
      >
        <div className="mb-3">
          <OwnerChip label={myName} full={myName} />
        </div>
        {visible.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No tasks match this filter.</p>
        ) : (
          <ul className="space-y-2">
            {visible.map((t) => (
              <TaskRow key={t.id} t={t} />
            ))}
          </ul>
        )}
      </Panel>

      <div className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-muted/20 p-4">
        <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div>
          <p className="text-sm font-medium text-foreground">Showing your tasks only</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Microsoft To Do only exposes the signed-in person's own lists, so this view is scoped to
            you. A shared "tasks by owner" view across the team (Hetal, front desk, providers) is a
            later-phase step — it needs Microsoft Planner shared plans or delegated access to each
            person's lists, set up with admin consent.
          </p>
        </div>
      </div>
    </div>
  );
}
