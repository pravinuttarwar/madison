import { useState } from 'react';
import { Star, Mail as MailIcon, Video } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Panel } from '@/components/primitives';
import { Loading, ErrorState } from '@/components/AsyncState';
import { useApi } from '@/hooks/useApi';
import { getEmails, getAwaiting, getSettings, sourceModeFor } from '@/lib/api';
const outlookMode = sourceModeFor('outlook');

export default function EmailQueue() {
  const { data: emails, loading, error } = useApi(getEmails, []);
  const { data: awaiting } = useApi(getAwaiting, []);
  const { data: settings } = useApi(getSettings, []);
  const thresholdH = settings?.awaitingThresholdHours ?? 48;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (loading) return <Loading label="Loading your email…" />;
  if (error || !emails || emails.length === 0) return <ErrorState message={error?.message} />;

  const selected = emails.find((e) => e.id === selectedId) ?? emails[0];
  const unread = emails.filter((e) => e.unread).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Email queue</h1>
        <p className="text-sm text-muted-foreground">
          The important messages, triaged — plus a follow-up engine that surfaces anything you sent
          that hasn't been answered. {unread} unread.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        {/* List + detail */}
        <div className="space-y-5 lg:col-span-3">
          <Panel title="Important emails" source="Outlook" sourceMode={outlookMode}>
            <ul className="-mx-2 divide-y divide-border">
              {emails.map((e) => {
                const active = e.id === selected.id;
                return (
                  <li key={e.id}>
                    <button
                      onClick={() => setSelectedId(e.id)}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-lg px-2 py-3 text-left transition-colors',
                        active ? 'bg-primary/5 ring-1 ring-primary/20' : 'hover:bg-muted/60',
                      )}
                    >
                      <span
                        className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', e.unread ? 'bg-primary' : 'bg-border')}
                        aria-label={e.unread ? 'Unread' : 'Read'}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn('truncate text-sm', e.unread ? 'font-semibold text-foreground' : 'font-medium text-foreground')}>
                            {e.from}
                          </span>
                          <span className="shrink-0 text-[11px] text-muted-foreground">{e.time}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {e.important && <Star className="h-3 w-3 shrink-0 fill-warning text-warning" aria-label="Important" />}
                          <span className="truncate text-sm text-foreground">{e.subject}</span>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">{e.preview}</p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>

        {/* Detail + follow-up engine */}
        <div className="space-y-5 lg:col-span-2">
          <Panel title="Message" source="Outlook" sourceMode={outlookMode}>
            <div className="flex items-center gap-1.5">
              {selected.important && <Star className="h-3.5 w-3.5 fill-warning text-warning" aria-hidden />}
              <h3 className="text-base font-semibold text-foreground">{selected.subject}</h3>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{selected.from}</span>
              <span>{selected.time}</span>
            </div>
            {selected.body ? (
              <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-foreground">{selected.body}</p>
            ) : (
              <p className="mt-4 text-sm italic text-muted-foreground">
                {selected.joinUrl ? 'Online meeting invitation — no message text.' : 'No message text.'}
              </p>
            )}
            {selected.joinUrl && (
              <a
                href={selected.joinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
              >
                <Video className="h-3.5 w-3.5" aria-hidden />
                Join meeting
              </a>
            )}
            <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
              Read-only view — surfaced here so nothing important slips. You reply in Outlook as usual.
            </p>
          </Panel>

          <Panel title="Awaiting response" source="Follow-up engine" sourceMode={outlookMode}>
            <p className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <MailIcon className="h-3.5 w-3.5" aria-hidden />
              Messages you sent ≥ {thresholdH}h ago with no reply, sorted by days waiting.
            </p>
            {(awaiting ?? []).length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No unanswered emails right now — all caught up.
              </p>
            ) : (
            <ul className="space-y-3">
              {(awaiting ?? []).map((a) => (
                <li key={a.id} className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
                  <span className="grid h-10 w-12 shrink-0 place-items-center rounded-lg bg-warning/10 text-sm font-bold text-warning">
                    {a.wait}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{a.to}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {a.subject} · {a.detail}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              We'd confirm the no-reply threshold and which mailbox to watch in discovery.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
