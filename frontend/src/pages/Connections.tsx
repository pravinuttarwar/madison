import { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  Mail,
  CalendarDays,
  ListChecks,
  FileSpreadsheet,
  Wallet,
  Check,
  ArrowRight,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';
import { Panel } from '@/components/primitives';
import { Loading, ErrorState } from '@/components/AsyncState';
import { useApi } from '@/hooks/useApi';
import {
  getSourceStatus,
  getWorkbookConnection,
  connectWorkbook,
  type SourceMode,
  type WorkbookConnection,
} from '@/lib/api';

const MODE_COPY: Record<SourceMode, { label: string; cls: string }> = {
  sandbox: { label: 'Sandbox', cls: 'border-warning/30 bg-warning/10 text-warning' },
  live: { label: 'Live', cls: 'border-success/30 bg-success/10 text-success' },
};

function ModeBadge({ mode }: { mode: SourceMode }) {
  const m = MODE_COPY[mode];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${m.cls}`}>
      {mode === 'live' && <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden />}
      {m.label}
    </span>
  );
}

function ScopeRow({ icon: Icon, label, scope }: { icon: LucideIcon; label: string; scope: string }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <span className="flex items-center gap-2.5 text-sm text-foreground">
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
        {label}
      </span>
      <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{scope}</code>
    </li>
  );
}

// The 4-square Microsoft mark, drawn in CSS so there's no external asset dependency.
function MsMark() {
  return (
    <span className="grid grid-cols-2 gap-0.5" aria-hidden>
      <span className="h-2 w-2 bg-[#f25022]" />
      <span className="h-2 w-2 bg-[#7fba00]" />
      <span className="h-2 w-2 bg-[#00a4ef]" />
      <span className="h-2 w-2 bg-[#ffb900]" />
    </span>
  );
}

function ConnectButton({
  onClick,
  children,
  variant,
}: {
  onClick: () => void;
  children: React.ReactNode;
  variant: 'microsoft' | 'quickbooks';
}) {
  const cls =
    variant === 'microsoft'
      ? 'border-border bg-white text-[#1b1b1b] hover:bg-white/90'
      : 'border-transparent bg-[#2ca01c] text-white hover:opacity-90';
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2.5 rounded-lg border px-4 py-2.5 text-sm font-semibold shadow-sm transition-colors ${cls}`}
    >
      {children}
    </button>
  );
}

// MAD-26 — connect the providers' weekly-report workbook by pasting a OneDrive/SharePoint
// share-link or drive path. The backend resolves + validates read-only reachability and
// persists only the location (never cell values); /api/reports then reads from it.
function WorkbookCard() {
  const { data, loading } = useApi(getWorkbookConnection, []);
  const [connection, setConnection] = useState<WorkbookConnection | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A fresh connect result takes precedence over the initially-loaded status.
  const current = connection ?? data ?? null;
  const connectedName = current && current.connected ? current.name : null;

  async function onConnect() {
    const value = input.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await connectWorkbook(value);
      setConnection({ connected: true, name: result.name, source: result.source, via: 'connection' });
      setInput('');
    } catch (e) {
      // ApiError.message carries the backend's plain-language reason — never the raw URL/token.
      setError(e instanceof Error ? e.message : 'Could not connect that workbook.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="Weekly report workbook"
      action={
        connectedName ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">
            <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden /> Connected
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning">
            <AlertTriangle className="h-3 w-3" aria-hidden /> Not connected
          </span>
        )
      }
    >
      <p className="text-sm text-muted-foreground">
        Point the Reports tab at your providers' weekly spreadsheet in OneDrive or SharePoint.
        Paste its share link or drive path — we confirm we can read it, then read the report
        live each time. We store only the file's location, never its contents.
      </p>

      {connectedName && (
        <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
          <FileSpreadsheet className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="font-medium text-foreground">{connectedName}</span>
          {current && current.connected && current.via === 'env' && (
            <span className="text-xs text-muted-foreground">(default location)</span>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Paste a share link or drive path"
          aria-label="Workbook share link or drive path"
          className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/30"
        />
        <button
          onClick={onConnect}
          disabled={busy || loading || !input.trim()}
          className="inline-flex items-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Checking…' : connectedName ? 'Reconnect workbook' : 'Connect workbook'}
        </button>
      </div>

      {error && (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
          <span>
            <span className="font-semibold">Not reachable.</span> {error}
          </span>
        </p>
      )}
    </Panel>
  );
}

export default function Connections() {
  const { data: sources, loading, error } = useApi(getSourceStatus, []);
  const [revealed, setRevealed] = useState<null | 'microsoft' | 'quickbooks'>(null);

  if (loading) return <Loading label="Loading connections…" />;
  if (error || !sources) return <ErrorState message={error?.message} />;

  const byId = Object.fromEntries(sources.map((s) => [s.id, s.mode])) as Record<string, SourceMode>;
  // One Microsoft sign-in covers every Microsoft source at once; live only when all are.
  const msIds = ['outlook', 'microsoftToDo', 'spreadsheet'] as const;
  const msMode: SourceMode = msIds.every((id) => byId[id] === 'live') ? 'live' : 'sandbox';

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Connections</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          One place to grant the read-only access that connects this dashboard to your live numbers.
          Two steps — sign in with Microsoft once, and connect QuickBooks. We never see a password,
          never write anything back, and store no data.
        </p>
      </div>

      {/* Trust strip */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: Lock, t: 'Read-only', d: 'We only read. Nothing is ever written to your systems.' },
          { icon: ShieldCheck, t: 'No data stored', d: 'Read on demand and shown. No copy is kept.' },
          { icon: Check, t: 'You stay in control', d: 'Granted with one click; revoke any time.' },
        ].map((c) => (
          <div key={c.t} className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
            <c.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <div>
              <div className="text-sm font-semibold text-foreground">{c.t}</div>
              <p className="text-xs text-muted-foreground">{c.d}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Microsoft 365 — one sign-in covers four sources */}
      <Panel
        title="Microsoft 365"
        action={<ModeBadge mode={msMode} />}
      >
        <p className="text-sm text-muted-foreground">
          A single sign-in authorizes everything we read from Microsoft — your email, calendar, tasks
          and the providers' weekly spreadsheet. These read-only permissions don't need IT to approve
          them; you can grant access to your own mailbox yourself.
        </p>

        <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-muted/30 px-3">
          <ScopeRow icon={Mail} label="Email — Outlook" scope="Mail.Read" />
          <ScopeRow icon={CalendarDays} label="Calendar — Outlook" scope="Calendars.Read" />
          <ScopeRow icon={ListChecks} label="Tasks — To Do / Planner" scope="Tasks.Read" />
          <ScopeRow icon={FileSpreadsheet} label="Weekly spreadsheet — OneDrive / SharePoint" scope="Files.Read" />
        </ul>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <ConnectButton variant="microsoft" onClick={() => setRevealed('microsoft')}>
            <MsMark /> Sign in with Microsoft
          </ConnectButton>
          <span className="text-xs text-muted-foreground">Read-only · revoke any time</span>
        </div>

        {revealed === 'microsoft' && (
          <p className="mt-3 rounded-lg border border-dashed border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            At go-live this opens the Microsoft sign-in page. You review the read-only permissions and
            approve — the dashboard then shows your live email, calendar, tasks and weekly report. If
            your tenant requires an administrator to approve apps, we'll send a one-click consent link
            for your IT admin instead.
          </p>
        )}
      </Panel>

      {/* Weekly report workbook (MAD-26) — paste, validate, connect */}
      <WorkbookCard />

      {/* QuickBooks */}
      <Panel title="QuickBooks Online" action={<ModeBadge mode={byId.quickbooks ?? 'sandbox'} />}>
        <p className="text-sm text-muted-foreground">
          Connect QuickBooks to pull deposits, variable spend and net contribution into the Financials
          tab — without opening QuickBooks. We only read your accounting data and never post changes
          back to it.
        </p>

        <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-muted/30 px-3">
          <ScopeRow icon={Wallet} label="Deposits, purchases & P&L (read only)" scope="accounting" />
        </ul>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <ConnectButton variant="quickbooks" onClick={() => setRevealed('quickbooks')}>
            Connect to QuickBooks <ArrowRight className="h-4 w-4" aria-hidden />
          </ConnectButton>
          <span className="text-xs text-muted-foreground">We'd also confirm your fixed-cost accounts</span>
        </div>

        {revealed === 'quickbooks' && (
          <p className="mt-3 rounded-lg border border-dashed border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            At go-live this opens Intuit's authorization page; you pick the company and approve. One
            honest note: QuickBooks doesn't offer a read-only permission, so our read-only promise is
            built into how the app works — it simply never calls anything that could change your books.
          </p>
        )}
      </Panel>

      <p className="text-xs text-muted-foreground">
        These read-only connections power every tab. We never write anything back, and no data is
        stored.
      </p>
    </div>
  );
}
