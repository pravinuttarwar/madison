import { createContext, useContext, useState, type ReactNode } from 'react';

export type ViewMode = 'monday' | 'weekday';

type Ctx = { mode: ViewMode; setMode: (m: ViewMode) => void };

const ViewModeContext = createContext<Ctx | null>(null);

// The practice's canonical timezone. "Is it Monday?" is decided by the practice's
// calendar day, not the viewer's device — so opening the dashboard from another zone
// near midnight still matches the practice's day (MBI-27).
const PRACTICE_TIME_ZONE = 'America/New_York';

// The dashboard opens to the view that fits the day: Monday gets the weekly recap,
// every other weekday gets the daily view. The owner can still toggle to override.
export function defaultViewMode(date: Date): ViewMode {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: PRACTICE_TIME_ZONE,
    weekday: 'short',
  }).format(date);
  return weekday === 'Mon' ? 'monday' : 'weekday';
}

export function ViewModeProvider({
  children,
  initialMode,
}: {
  children: ReactNode;
  initialMode?: ViewMode;
}) {
  const [mode, setMode] = useState<ViewMode>(initialMode ?? defaultViewMode(new Date()));
  return <ViewModeContext.Provider value={{ mode, setMode }}>{children}</ViewModeContext.Provider>;
}

export function useViewMode(): Ctx {
  const ctx = useContext(ViewModeContext);
  if (!ctx) throw new Error('useViewMode must be used within ViewModeProvider');
  return ctx;
}
