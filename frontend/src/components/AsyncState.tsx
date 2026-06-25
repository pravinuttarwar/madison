import { AlertCircle, Loader2, Inbox, type LucideIcon } from 'lucide-react';

// Shared loading + empty + error surfaces for pages that consume `@/lib/api` getters.
// Kept tasteful and on-brand — these are what the customer sees the instant a live
// source is fetching, so they read as "loading your data", not a broken screen.

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card py-20 text-muted-foreground shadow-sm">
      <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  );
}

// Friendly empty state — a live source returned zero rows (not an error). Distinct from
// ErrorState so an empty inbox/list never reads as "something broke".
export function EmptyState({
  icon: Icon = Inbox,
  title,
  hint,
}: {
  icon?: LucideIcon;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card py-16 text-center shadow-sm">
      <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="max-w-sm text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function ErrorState({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 py-16 text-center">
      <AlertCircle className="h-5 w-5 text-destructive" aria-hidden />
      <p className="text-sm font-medium text-foreground">Couldn't load this view</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        {message ?? 'The connection to this data source is unavailable right now.'}
      </p>
    </div>
  );
}
