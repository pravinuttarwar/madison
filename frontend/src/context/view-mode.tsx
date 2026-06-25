import { createContext, useContext, useState, type ReactNode } from 'react';

export type ViewMode = 'monday' | 'weekday';

type Ctx = { mode: ViewMode; setMode: (m: ViewMode) => void };

const ViewModeContext = createContext<Ctx | null>(null);

// The dashboard opens to the view that fits the day: Monday gets the weekly recap,
// every other weekday gets the daily view. The owner can still toggle to override.
export function defaultViewMode(date: Date): ViewMode {
  return date.getDay() === 1 ? 'monday' : 'weekday';
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
