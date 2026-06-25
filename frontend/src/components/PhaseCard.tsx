import { Workflow, FlaskConical, CircleCheck } from 'lucide-react';

// ── Architect-grade phasing close ────────────────────────────────────────────
// How the front end will call the backend, the sandbox-first integration order,
// and the data model we've checked against the third-party payloads — so what
// the screens promise is feasible, not aspirational.

type EndpointRow = { tile: string; endpoint: string };

const ENDPOINTS: EndpointRow[] = [
  { tile: 'Dashboard first paint', endpoint: 'GET /api/briefing' },
  { tile: 'Email triage', endpoint: 'GET /api/inbox' },
  { tile: 'Awaiting response', endpoint: 'GET /api/inbox/awaiting' },
  { tile: 'Today + week calendar', endpoint: 'GET /api/calendar' },
  { tile: 'Tasks by owner', endpoint: 'GET /api/tasks' },
  { tile: 'Weekly report', endpoint: 'GET /api/reports/weekly' },
  { tile: 'Deposits', endpoint: 'GET /api/finance/deposits' },
  { tile: 'Variable spend', endpoint: 'GET /api/finance/spend' },
  { tile: 'Source health strip', endpoint: 'GET /api/health' },
];

type SandboxStep = {
  step: number;
  title: string;
  detail: string;
  status: 'pilot' | 'next' | 'later';
};

const SANDBOX: SandboxStep[] = [
  {
    step: 1,
    title: 'Microsoft Graph — sandbox tenant',
    detail:
      'One app registration. Read-only delegated scopes (Mail.Read, Calendars.Read, Tasks.Read). Unlocks calendar, email triage, follow-up engine and tasks — the bulk of the dashboard.',
    status: 'pilot',
  },
  {
    step: 2,
    title: 'QuickBooks Online — sandbox company',
    detail:
      'OAuth against a sandbox company. Reads deposits + purchases. Fixed-cost account list confirmed with you. Powers the deposits and variable-spend tiles.',
    status: 'next',
  },
  {
    step: 3,
    title: 'Provider spreadsheet — Excel via Graph',
    detail:
      'Same Microsoft auth, no second credential. We map your 12 weekly metrics by named range. Reports goes live.',
    status: 'later',
  },
];

type FieldRow = { panel: string; mapping: string };

const FIELD_MAP: FieldRow[] = [
  { panel: 'Calendar event', mapping: 'event.subject · event.start · event.attendees → "Today" + "Week ahead"' },
  { panel: 'Email + follow-up', mapping: 'message.from · sentDateTime · conversationId → "Triage" + "Awaiting response" (sent ≥ 48h, no reply)' },
  { panel: 'Task', mapping: 'todoTask.title · dueDateTime · status → "Tasks by owner" + status pill' },
  { panel: 'Deposit', mapping: 'Deposit.amount · TxnDate → "Yesterday deposit", grouped by day for the week' },
  { panel: 'Variable spend', mapping: 'Purchase WHERE AccountRef ∉ FIXED → yesterday / WTD / MTD' },
  { panel: 'Weekly metric', mapping: 'workbook range cell → 12 named metrics, one cell map per metric' },
];

export default function PhaseCard() {
  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3.5">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand/10 text-brand">
          <Workflow className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">Next phase — a production-grade plan</h2>
          <p className="text-xs text-muted-foreground">
            How the front end calls the backend, the sandbox-first integration order, and a data model
            we've checked against the third-party payloads.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          <FlaskConical className="h-3 w-3" aria-hidden />
          Today: sandbox
        </span>
      </header>

      <div className="grid gap-5 p-5 lg:grid-cols-3">
        {/* 1 — Front end → backend */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-primary/10 text-[11px] font-bold text-primary">
              1
            </span>
            <h3 className="text-sm font-semibold text-foreground">Front end → backend</h3>
          </div>
          <p className="text-xs leading-snug text-muted-foreground">
            One endpoint per tile, plus a single composite
            <code className="mx-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10.5px]">/api/briefing</code>
            warm-load for first paint. Per-tile endpoints let us refresh and degrade independently — if
            one source is down, that tile shows stale, the rest stay live.
          </p>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {ENDPOINTS.map((e) => (
              <li key={e.endpoint} className="flex items-center gap-3 px-3 py-2 text-xs">
                <span className="min-w-0 flex-1 truncate text-foreground">{e.tile}</span>
                <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10.5px] text-foreground">
                  {e.endpoint}
                </code>
              </li>
            ))}
          </ul>
        </div>

        {/* 2 — Sandbox, one source at a time */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-primary/10 text-[11px] font-bold text-primary">
              2
            </span>
            <h3 className="text-sm font-semibold text-foreground">Sandbox — one source at a time</h3>
          </div>
          <p className="text-xs leading-snug text-muted-foreground">
            We stand each third party up in a sandbox, prove the contract end-to-end, then promote to
            your production credentials. Order chosen by value unlocked.
          </p>
          <ol className="space-y-2">
            {SANDBOX.map((s) => {
              const isPilot = s.status === 'pilot';
              return (
                <li
                  key={s.step}
                  className={
                    isPilot
                      ? 'rounded-lg border border-primary/40 bg-primary/5 p-3'
                      : 'rounded-lg border border-border bg-muted/30 p-3'
                  }
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        isPilot
                          ? 'grid h-5 w-5 place-items-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground'
                          : 'grid h-5 w-5 place-items-center rounded-md border border-border bg-card text-[11px] font-bold text-muted-foreground'
                      }
                    >
                      {s.step}
                    </span>
                    <span className="text-sm font-medium text-foreground">{s.title}</span>
                    {isPilot && (
                      <span className="ml-auto inline-flex items-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
                        First up
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-[11.5px] leading-snug text-muted-foreground">{s.detail}</p>
                </li>
              );
            })}
          </ol>
        </div>

        {/* 3 — Data model & feasibility */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-primary/10 text-[11px] font-bold text-primary">
              3
            </span>
            <h3 className="text-sm font-semibold text-foreground">Data model &amp; feasibility</h3>
          </div>
          <p className="text-xs leading-snug text-muted-foreground">
            Every field shown on screen maps to a field we've verified in the third-party payload — not
            aspirational.
          </p>
          <ul className="space-y-2">
            {FIELD_MAP.map((row) => (
              <li key={row.panel} className="rounded-md border border-border bg-muted/30 p-2.5">
                <div className="text-[11px] font-semibold text-foreground">{row.panel}</div>
                <div className="text-[11px] leading-snug text-muted-foreground">{row.mapping}</div>
              </li>
            ))}
          </ul>
          <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-success">
            <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div className="min-w-0">
              <div className="text-xs font-semibold">Pilot we'd stand up first</div>
              <div className="text-[11.5px] leading-snug">
                Microsoft Graph in a sandbox tenant — calendar, mail, To Do — read-only. Two-week proof,
                then promote to production with your Microsoft 365 admin.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
