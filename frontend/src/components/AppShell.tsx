import { useState, useEffect, useRef } from 'react';
import { getFriendlyPref, setFriendlyPref } from '@/utils/theme';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  BarChart3,
  Wallet,
  Mail,
  CalendarDays,
  ListChecks,
  Eye,
  SlidersHorizontal,
  LogOut,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { OWNER, DATES } from '@/lib/data';
import madisonLogo from '@/assets/madison-logo.webp';
import { LIVE_MODE } from '@/lib/api';
import { ModeBanner } from '@/components/primitives';
import { useUser } from '@/context/UserContext';

// Nav order + badges mirror the customer's own mockup. Badges are DERIVED from the
// same data the pages render, so a count can never drift from its screen. (Financials
// shows no count — his mock used a "$" glyph, which our publish gate disallows.)
const NAV: { to: string; label: string; icon: LucideIcon; dot?: boolean }[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, dot: true },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/tasks', label: 'Tasks', icon: ListChecks },
  { to: '/email', label: 'Email Queue', icon: Mail },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/financials', label: 'Financials', icon: Wallet },
];

function Wordmark() {
  return (
    <div className="flex items-center gap-3">
      {/* Customer logo on a light lockup tile so the black wordmark stays legible
          on either theme (especially the dark default). */}
      <span className="inline-flex items-center rounded-lg bg-white px-2.5 py-1.5 shadow-sm ring-1 ring-black/5">
        <img
          src={madisonLogo}
          alt="Madison Medical Sports & Wellness"
          className="h-8 w-auto"
        />
      </span>
      <span className="hidden border-l border-border pl-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:block">
        Command Center
      </span>
    </div>
  );
}


// ── Display & Accessibility ───────────────────────────────────────────────────
// One "Display" control grouping theme + color-vision (and, later, contrast / text
// scaling). Named "Display" so physician users don't read it as "not for me".
// The theme/palette logic lives in @/utils/theme (applied at boot in main.tsx so the
// login screen respects it too); this menu just toggles the persisted preference.

function Seg<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string; icon?: LucideIcon }[];
}) {
  return (
    <div className="mt-3 first:mt-0">
      <div className="mb-1.5 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="flex rounded-lg border border-border bg-muted p-0.5">
        {options.map((o) => {
          const Icon = o.icon;
          const active = o.id === value;
          return (
            <button
              key={o.id}
              onClick={() => onChange(o.id)}
              aria-pressed={active}
              className={cn(
                'inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-center text-xs font-semibold leading-tight transition-colors',
                active ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DisplayMenu() {
  const [open, setOpen] = useState(false);
  // Seed from the persisted preference (already applied to the DOM at boot).
  const [friendly, setFriendlyState] = useState(getFriendlyPref);
  const ref = useRef<HTMLDivElement>(null);

  function setFriendly(value: boolean) {
    setFriendlyState(value);
    setFriendlyPref(value); // persist + apply to :root
  }

  // Close on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Display & Accessibility"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden sm:inline">Display</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-72 rounded-xl border border-border bg-card p-3 shadow-lg"
        >
          <p className="px-0.5 text-sm font-semibold text-foreground">Display &amp; Accessibility</p>

          <Seg
            label="Colors"
            value={friendly ? 'friendly' : 'standard'}
            onChange={(v) => setFriendly(v === 'friendly')}
            options={[
              { id: 'standard', label: 'Standard' },
              { id: 'friendly', label: 'Color-Vision Friendly', icon: Eye },
            ]}
          />

          <p className="mt-3 px-0.5 text-[11px] leading-snug text-muted-foreground">
            Status is always shown by icon, shape and label — never color alone. We'd validate the
            exact palette with you.
          </p>
        </div>
      )}
    </div>
  );
}

function ProfileMenu() {
  const { user, logout } = useUser();
  const displayName = user?.displayName || OWNER;
  const initials = displayName.replace(/^Dr\.?\s*/i, '').slice(0, 2).toUpperCase();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div ref={ref} className="relative hidden md:block">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Account menu"
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted"
      >
        <div className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
          {initials}
        </div>
        <div className="hidden leading-tight text-left sm:block">
          <div className="text-xs font-semibold text-foreground">{displayName}</div>
          <div className="text-[10px] text-muted-foreground">{DATES.weekday}</div>
        </div>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-52 rounded-xl border border-border bg-card p-1.5 shadow-lg"
        >
          <div className="px-3 py-2 border-b border-border mb-1">
            <p className="text-xs font-semibold text-foreground truncate">{displayName}</p>
            <p className="text-[11px] text-muted-foreground">Madison Medical</p>
          </div>
          <button
            role="menuitem"
            onClick={() => { setOpen(false); logout(); }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <ModeBanner mode={LIVE_MODE} />
      <header className="sticky top-0 z-30 border-b border-border bg-card/85 backdrop-blur supports-[backdrop-filter]:bg-card/70">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Wordmark />
          <div className="flex items-center gap-3">
            <DisplayMenu />
            <div className="border-l border-border pl-3">
              <ProfileMenu />
            </div>
          </div>
        </div>
        <nav className="mx-auto max-w-[1240px] px-2 sm:px-4">
          <div className="flex items-center gap-1 overflow-x-auto pb-px">
            {NAV.map((n) => {
              const Icon = n.icon;
              const active = loc.pathname === n.to;
              return (
                <NavLink
                  key={n.to}
                  to={n.to}
                  className={cn(
                    'inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                    active
                      ? 'border-primary text-primary [text-shadow:0_0_10px_rgba(192,0,42,0.45)]'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {n.label}
                  {n.dot && (
                    <span
                      className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-primary' : 'bg-muted-foreground/50')}
                      aria-hidden
                    />
                  )}
                </NavLink>
              );
            })}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6">{children}</main>

      <footer className="mx-auto max-w-[1240px] px-4 pb-16 pt-2 sm:px-6">
        <p className="text-center text-[11px] text-muted-foreground">
          {LIVE_MODE === 'sandbox'
            ? 'Connected to a test Microsoft 365 account · read-only · no data is stored.'
            : 'Live read-only connections active · no data is stored.'}
        </p>
      </footer>
    </div>
  );
}
