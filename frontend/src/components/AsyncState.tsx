import { AlertCircle, Loader2 } from 'lucide-react';

// Shared loading + error surfaces for pages that consume `@/lib/api` getters.
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
