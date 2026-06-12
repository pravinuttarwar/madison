import { Link } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarDays,
  ListChecks,
  Mail,
  BarChart3,
  Wallet,
  ArrowRight,
  Lock,
  ShieldCheck,
  Eye,
  Check,
  Plug,
  type LucideIcon,
} from 'lucide-react';
import { Panel } from '@/components/primitives';

// Customer-facing overview — what we set up this week, the (final, feasibility-checked)
// screens, and how the read-only connection works. Secondary to the live product at "/".
// All semantic tokens, so it inherits the default dark + color-vision-friendly theme.

const SCREENS: { to: string; label: string; icon: LucideIcon; desc: string }[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, desc: 'Your morning glance — priorities, schedule, email, financials, in one place.' },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays, desc: "Today's schedule and the week ahead, from Outlook." },
  { to: '/tasks', label: 'Tasks', icon: ListChecks, desc: 'Work by owner, with due and overdue at a glance.' },
  { to: '/email', label: 'Email Queue', icon: Mail, desc: 'Important mail triaged, plus what you sent that has no reply yet.' },
  { to: '/reports', label: 'Reports', icon: BarChart3, desc: "Your providers' weekly report as a live snapshot, week-over-week." },
  { to: '/financials', label: 'Financials', icon: Wallet, desc: 'Deposits, variable spend and net contribution — without the clutter.' },
];

const STEPS: { n: string; title: string; body: string }[] = [
  {
    n: '1',
    title: 'Sign in with Microsoft — once',
    body: 'One read-only sign-in covers your email, calendar, tasks and the weekly spreadsheet. You approve your own mailbox; we never see a password, and you can revoke it any time.',
  },
  {
    n: '2',
    title: 'Connect your financials',
    body: 'One click to authorize a read-only view of deposits and spend. We never post anything back to your books.',
  },
  {
    n: '3',
    title: 'Point us at the weekly file',
    body: 'Tell us where the providers’ spreadsheet lives, and we mirror the exact metrics you already read each Monday.',
  },
];

function Trust({ icon: Icon, t, d }: { icon: LucideIcon; t: string; d: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
      <div>
        <div className="text-sm font-semibold text-foreground">{t}</div>
        <p className="text-xs text-muted-foreground">{d}</p>
      </div>
    </div>
  );
}

export default function Overview() {
  return (
    <div className="space-y-6">
      {/* Compact intro (not a marketing hero) */}
      <div className="rounded-xl border border-border bg-gradient-to-br from-primary to-primary/85 p-6 text-primary-foreground shadow-sm">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide opacity-90">
          <Plug className="h-4 w-4" aria-hidden /> Your Command Center · the one-week setup
        </div>
        <h1 className="mt-2 text-xl font-semibold sm:text-2xl">Built on your design — here's what we switch on this week.</h1>
        <p className="mt-1 max-w-2xl text-sm opacity-90">
          The six views you laid out, in one place, opening to today. Everything here is read-only,
          nothing is stored, and the dark, color-vision-friendly view is the default. Below: the
          screens (already built), and the two short sign-ins it takes to make them live.
        </p>
      </div>

      {/* What you'll have in a week */}
      <Panel title="What you'll have in a week">
        <ul className="grid gap-3 sm:grid-cols-2">
          {[
            'Your six views, live and in one place — no switching between systems.',
            'Important email surfaced, plus a follow-up list of what you sent with no reply.',
            'Your QuickBooks numbers, read cleanly — deposits, spend, net contribution.',
            "Your providers' weekly report as a live snapshot, with week-over-week change.",
          ].map((t) => (
            <li key={t} className="flex items-start gap-2.5 text-sm text-foreground">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
              {t}
            </li>
          ))}
        </ul>
      </Panel>

      {/* The screens — already built */}
      <div>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Your screens — already built</h2>
            <p className="text-xs text-muted-foreground">
              These are the actual screens, checked for feasibility against Outlook, QuickBooks and your
              spreadsheet. What you click today is what goes live — open any of them.
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SCREENS.map((s) => (
            <Link
              key={s.to}
              to={s.to}
              className="group rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                  <s.icon className="h-5 w-5" aria-hidden />
                </span>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
              </div>
              <div className="mt-3 text-sm font-semibold text-foreground">{s.label}</div>
              <p className="mt-1 text-xs text-muted-foreground">{s.desc}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* How you connect it */}
      <Panel
        title="How you connect it — about 10 minutes, read-only"
        action={
          <Link to="/connections" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
            Open Connections <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        }
      >
        <ol className="space-y-3">
          {STEPS.map((s) => (
            <li key={s.n} className="flex items-start gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                {s.n}
              </span>
              <div>
                <div className="text-sm font-semibold text-foreground">{s.title}</div>
                <p className="text-xs text-muted-foreground">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Trust icon={Lock} t="Read-only" d="We only read. Nothing is written back to your systems." />
          <Trust icon={ShieldCheck} t="No data stored" d="Read on demand and shown. No copy is kept." />
          <Trust icon={Eye} t="Built for your vision" d="Dark, color-vision-friendly view by default; status shown by icon and label, not color alone." />
        </div>
      </Panel>

      {/* What we need from you */}
      <Panel title="What we need from you">
        <p className="text-sm text-muted-foreground">
          Just the read-only access above. For Microsoft, a one-click sign-in to your own mailbox is
          enough — or, if your team has IT approve new apps, we'll send them a short read-only consent
          link to approve (a couple of minutes, no change to your systems). You can withdraw access at
          any time, and we never store your data.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Today every view runs on realistic sample data so you can try the full experience first —
          connecting your live systems is the next step we'd do together.
        </p>
      </Panel>
    </div>
  );
}
