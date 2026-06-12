import { CalendarDays, Video, MapPin, Users, Clock3, Check, X, HelpCircle, Circle, User } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Panel } from '@/components/primitives';
import { Loading, ErrorState } from '@/components/AsyncState';
import { useApi } from '@/hooks/useApi';
import { getCalendar, sourceModeFor } from '@/lib/api';
import type { ScheduleItem, Attendee, AttendeeResponse } from '@/lib/data';

const outlookMode = sourceModeFor('outlook');

// Attendee response → icon + label + tone. Status is shown by icon + label, never
// color alone (color-vision safe).
const RESPONSE_META: Record<AttendeeResponse, { icon: LucideIcon; label: string; tone: string }> = {
  accepted: { icon: Check, label: 'Going', tone: 'text-success' },
  tentative: { icon: HelpCircle, label: 'Maybe', tone: 'text-warning' },
  declined: { icon: X, label: 'Declined', tone: 'text-destructive' },
  none: { icon: Circle, label: 'Invited', tone: 'text-muted-foreground' },
};

function JoinButton({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
    >
      <Video className="h-3.5 w-3.5" aria-hidden />
      Join
    </a>
  );
}

function AttendeeList({ attendees }: { attendees: Attendee[] }) {
  return (
    <div className="mt-2.5 border-t border-border pt-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Users className="h-3.5 w-3.5" aria-hidden />
        {attendees.length} {attendees.length === 1 ? 'attendee' : 'attendees'}
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {attendees.map((a) => {
          const meta = RESPONSE_META[a.response ?? 'none'];
          const Icon = meta.icon;
          return (
            <li
              key={a.email || a.name}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 py-1 pl-1.5 pr-2.5 text-xs"
              title={`${a.name} · ${meta.label}`}
            >
              <span className="grid h-5 w-5 place-items-center rounded-full bg-secondary text-[9px] font-semibold text-secondary-foreground">
                {a.name.replace(/^Dr\.?\s*/i, '').slice(0, 2).toUpperCase()}
              </span>
              <span className="max-w-[10rem] truncate text-foreground">{a.name}</span>
              <Icon className={cn('h-3 w-3 shrink-0', meta.tone)} aria-hidden />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Rich card for the Today timeline — renders whatever the event carries.
function EventCard({ s }: { s: ScheduleItem }) {
  return (
    <div
      className={cn(
        'rounded-lg border p-3.5',
        s.open ? 'border-dashed border-border bg-muted/30' : 'border-border bg-card shadow-sm',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn('text-sm font-semibold', s.open ? 'text-muted-foreground' : 'text-foreground')}>
            {s.title}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3.5 w-3.5" aria-hidden />
              {s.time}{s.end ? `–${s.end}` : ''}
            </span>
            {s.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" aria-hidden />
                {s.location}
              </span>
            )}
            {s.organizer && (
              <span className="inline-flex items-center gap-1">
                <User className="h-3.5 w-3.5" aria-hidden />
                {s.organizer}
              </span>
            )}
          </div>
        </div>
        {s.joinUrl && <div className="shrink-0"><JoinButton url={s.joinUrl} /></div>}
      </div>

      {s.description && (
        <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{s.description}</p>
      )}

      {s.attendees && s.attendees.length > 0 && <AttendeeList attendees={s.attendees} />}
    </div>
  );
}

// Compact row for the Week-ahead day columns.
function WeekRow({ s }: { s: ScheduleItem }) {
  return (
    <li className="flex items-start gap-2 rounded-md bg-card px-2 py-1.5 text-xs shadow-sm">
      <span className="w-10 shrink-0 pt-px text-right font-semibold tabular-nums text-primary">{s.time}</span>
      <span className="min-w-0 flex-1 text-foreground">
        <span className="line-clamp-2">{s.title}</span>
        {s.detail && <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{s.detail}</span>}
      </span>
      {s.joinUrl && (
        <a href={s.joinUrl} target="_blank" rel="noopener noreferrer" title="Join online" className="shrink-0 pt-px text-primary hover:opacity-80">
          <Video className="h-3.5 w-3.5" aria-hidden />
        </a>
      )}
    </li>
  );
}

export default function Calendar() {
  const { data, loading, error } = useApi(getCalendar, []);

  if (loading) return <Loading label="Loading your calendar…" />;
  if (error || !data) return <ErrorState message={error?.message} />;

  const { today, week } = data;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Calendar</h1>
        <p className="text-sm text-muted-foreground">
          Your Outlook calendar in context — today's schedule and the week ahead, with full meeting
          detail.
        </p>
      </div>

      {/* Week ahead — every meeting per day, scroll when a day is busy */}
      <Panel title="Week ahead" source="Outlook" sourceMode={outlookMode}>
        {week.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No events this week in your calendar.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
            {week.map((d) => (
              <div
                key={d.day}
                className={cn(
                  'flex h-80 flex-col rounded-xl border p-3.5 transition-shadow hover:shadow-sm',
                  d.today ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/30',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cn('text-xs font-bold', d.today ? 'text-primary' : 'text-muted-foreground')}>
                    {d.day}
                  </span>
                  {d.today && (
                    <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                      Today
                    </span>
                  )}
                </div>
                <p className="mt-1 shrink-0 text-[11px] text-muted-foreground">
                  {d.count} {d.count === 1 ? 'meeting' : 'meetings'}
                </p>
                {d.events.length === 0 ? (
                  <p className="mt-3 text-[11px] italic text-muted-foreground/70">No meetings</p>
                ) : (
                  <ul className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
                    {d.events.map((ev, i) => (
                      <WeekRow key={`${ev.time}-${i}`} s={ev} />
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Today timeline — rich detail per event */}
      <Panel
        title="Today"
        source="Outlook"
        sourceMode={outlookMode}
        action={
          today.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              {today.length} events
            </span>
          ) : undefined
        }
      >
        {today.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No events scheduled for today.</p>
        ) : (
          <ul className="space-y-1">
            {today.map((s, i) => (
              <li key={`${s.time}-${i}`} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span className="w-14 text-right text-sm font-semibold tabular-nums text-primary">{s.time}</span>
                </div>
                <div className="relative flex-1 pb-4">
                  {i < today.length - 1 && (
                    <span className="absolute left-[-18px] top-2 h-full w-px bg-border" aria-hidden />
                  )}
                  <span
                    className={cn(
                      'absolute left-[-22px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-card',
                      s.open ? 'bg-border' : 'bg-primary',
                    )}
                    aria-hidden
                  />
                  <EventCard s={s} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
