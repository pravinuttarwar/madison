import { createContext, useContext, useState, type ReactNode } from 'react';

export type ViewMode = 'monday' | 'weekday';

type Ctx = { mode: ViewMode; setMode: (m: ViewMode) => void };

const ViewModeContext = createContext<Ctx | null>(null);

export function ViewModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ViewMode>('weekday');
  return <ViewModeContext.Provider value={{ mode, setMode }}>{children}</ViewModeContext.Provider>;
}

export function useViewMode(): Ctx {
  const ctx = useContext(ViewModeContext);
  if (!ctx) throw new Error('useViewMode must be used within ViewModeProvider');
  return ctx;
}
