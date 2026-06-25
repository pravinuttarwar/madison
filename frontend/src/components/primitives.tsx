import type { ReactNode } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Minus,
  AlertTriangle,
  Clock,
  CheckCircle2,
  CircleDot,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Source chip — names which system a section reads from ─────────────────────
export function SourceChip({ children, mode }: { children: ReactNode; mode?: 'mock' | 'sandbox' | 'live' }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
      {mode === 'sandbox' && (
        <span className="rounded-full bg-warning/15 px-1.5 py-px text-[10px] font-semibold text-warning">
          TEST
        </span>
      )}
      {mode === 'live' && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-success/15 px-1.5 py-px text-[10px] font-semibold text-success">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          LIVE
        </span>
      )}
    </span>
  );
}

// ── Mode banner — global sandbox/test indicator ───────────────────────────────
export function ModeBanner({ mode }: { mode: 'mock' | 'sandbox' | 'live' }) {
  if (mode === 'live' || mode === 'mock') return null;
  return (
    <div className="border-b border-warning/30 bg-warning/10 px-4 py-1.5 text-center text-[11px] font-medium text-warning sm:px-6">
      Test mode — connected to a test Microsoft 365 account set up for this demo.
    </div>
  );
}

// ── Section card — the standard panel surface ─────────────────────────────────
export function Panel({
  title,
  subtitle,
  source,
  sourceMode,
  action,
  children,
  className,
}: {
  title?: string;
  subtitle?: string;
  source?: string;
  sourceMode?: 'mock' | 'sandbox' | 'live';
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md',
        className,
      )}
    >
      {(title || source || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-3.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              {title && <h2 className="text-sm font-semibold text-foreground">{title}</h2>}
              {source && <SourceChip mode={sourceMode}>{source}</SourceChip>}
            </div>
            {subtitle && <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

// ── Trend badge — direction shown by ARROW + sign + value, color is secondary ──
export function Trend({
  delta,
  unit = '',
  goodWhenUp = true,
}: {
  delta: number;
  unit?: string;
  goodWhenUp?: boolean;
}) {
  const dir = delta === 0 ? 'flat' : delta > 0 ? 'up' : 'down';
  const Icon = dir === 'up' ? ArrowUpRight : dir === 'down' ? ArrowDownRight : Minus;
  const isGood = dir === 'flat' ? true : (dir === 'up') === goodWhenUp;
  const tone =
    dir === 'flat'
      ? 'text-muted-foreground bg-muted'
      : isGood
        ? 'text-success bg-success/10'
        : 'text-warning bg-warning/10';
  const sign = delta > 0 ? '+' : '';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums',
        tone,
      )}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
      {sign}
      {delta}
      {unit}
    </span>
  );
}

// ── Status pill — color-blind safe: distinct ICON + label, color reinforces ───
export type StatusKind = 'overdue' | 'due-today' | 'upcoming' | 'done' | 'urgent';
const STATUS_META: Record<StatusKind, { label: string; icon: LucideIcon; cls: string }> = {
  overdue: { label: 'Overdue', icon: AlertTriangle, cls: 'border-destructive/30 bg-destructive/10 text-destructive' },
  'due-today': { label: 'Due today', icon: Clock, cls: 'border-warning/30 bg-warning/10 text-warning' },
  upcoming: { label: 'Upcoming', icon: CircleDot, cls: 'border-border bg-muted text-muted-foreground' },
  done: { label: 'Done', icon: CheckCircle2, cls: 'border-success/30 bg-success/10 text-success' },
  urgent: { label: 'Urgent', icon: AlertTriangle, cls: 'border-destructive/30 bg-destructive/10 text-destructive' },
};

export function StatusPill({ kind, labelOverride }: { kind: StatusKind; labelOverride?: string }) {
  const m = STATUS_META[kind];
  const Icon = m.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
        m.cls,
      )}
    >
      <Icon className="h-3 w-3" strokeWidth={2.5} aria-hidden />
      {labelOverride ?? m.label}
    </span>
  );
}

// ── Owner avatar chip — initials in a branded tint ────────────────────────────
export function OwnerChip({ label, full }: { label: string; full?: string }) {
  return (
    <span
      title={full ?? label}
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground"
    >
      <span className="grid h-4 w-4 place-items-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
        {label.slice(0, 1)}
      </span>
      {full ?? label}
    </span>
  );
}

// ── KPI tile — a single headline number with a trend ──────────────────────────
export function KpiTile({
  label,
  value,
  sub,
  trend,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  trend?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />}
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">{value}</span>
        {trend}
      </div>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ── Horizontal bar — for the encounters-by-specialty visual ───────────────────
export function Bar({ value, max, colorVar }: { value: number; max: number; colorVar: string }) {
  const pct = Math.max(2, Math.round((value / max) * 100));
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: colorVar }} />
    </div>
  );
}
