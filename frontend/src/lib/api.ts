// ─────────────────────────────────────────────────────────────────────────────
// Madison Command Center — front-end data-access seam
//
// This is the SINGLE place the UI gets its data. Every page/tile calls one of the
// async getters below; none of them import the mock data directly anymore.
//
// Why this exists (the Phase-2 handoff):
//   • Today every source resolves to the realistic SAMPLE data in `./data`.
//   • To go live, a dev stands up the read-only backend (see docs/ARCHITECTURE.md),
//     points VITE_API_URL at it, and flips the relevant source in SOURCE_MODES to
//     'live' (or 'sandbox'). The fetch path is already written — no page changes.
//
// The shapes returned here ARE the FE↔BE contract. The backend's only job is to
// return JSON matching these types. See docs/ARCHITECTURE.md for the endpoint map
// and the per-field mapping to the real Microsoft Graph / QuickBooks / spreadsheet
// fields.
// ─────────────────────────────────────────────────────────────────────────────

import { config } from '@/config/environment';
import type { ViewMode } from '@/context/view-mode';
import type {
  Email,
  AwaitingResponse,
  ScheduleItem,
  CalendarDay,
  Task,
  WeeklyMetric,
  EncounterRow,
  WeeklyFinancial,
  DailyFinancial,
  RevenueFinancial,
} from '@/lib/data';

// ── Sources & their wiring ───────────────────────────────────────────────────
// One entry per upstream system. The app is live-only (MBI-35/36) — the mode only
// describes WHICH environment the deployment points at: 'sandbox' (dev/sandbox apps —
// the default today) or 'live' (the customer's production apps). It drives the
// source-status badge, not whether data is fetched.
export type SourceId =
  | 'outlook' // Outlook mail + calendar (Microsoft Graph)
  | 'microsoftToDo' // Tasks by owner (Microsoft Graph / To Do or Planner)
  | 'quickbooks' // Deposits + spend (QuickBooks Online)
  | 'spreadsheet'; // Providers' weekly report (Excel via Graph Workbook)

export type SourceMode = 'sandbox' | 'live';

// The deployment environment, from VITE_LIVE_MODE: 'live' on the production apps;
// anything else (including unset) is the sandbox/dev apps.
export const LIVE_MODE: SourceMode =
  import.meta.env.VITE_LIVE_MODE === 'live' ? 'live' : 'sandbox';

export const SOURCE_MODES: Record<SourceId, SourceMode> = {
  outlook: LIVE_MODE,
  microsoftToDo: LIVE_MODE,
  quickbooks: LIVE_MODE,
  spreadsheet: LIVE_MODE,
};

export const SOURCE_LABELS: Record<SourceId, string> = {
  outlook: 'Outlook',
  microsoftToDo: 'Microsoft To Do',
  quickbooks: 'QuickBooks',
  spreadsheet: 'Weekly spreadsheet',
};

export type SourceStatus = { id: SourceId; label: string; mode: SourceMode };

// ── Response DTOs (the contract) ─────────────────────────────────────────────
export type CalendarData = { today: ScheduleItem[]; week: CalendarDay[] };

export type FinancialsData = { weekly: WeeklyFinancial; daily: DailyFinancial; revenue: RevenueFinancial };

export type ReportsData = {
  weekNumber: number;
  metrics: WeeklyMetric[];
  encountersBySpecialty: EncounterRow[];
  totalEncounters: { last: number; prior: number };
};

// The Dashboard is a composed (BFF) view — the backend fans out to the sources it
// needs in parallel and returns one payload, so the browser makes a single call.
export type DashboardData = {
  view: ViewMode;
  owner: string;
  dates: { monday: string; weekday: string };
  // Spreadsheet-sourced fields: present in mock/demo, but the live BFF omits them when
  // the providers' weekly spreadsheet isn't wired — so treat them as optional/absent.
  weekNumber?: number;
  metrics?: WeeklyMetric[];
  totalEncounters?: { last: number; prior: number };
  financialWeek: WeeklyFinancial | null;
  financialDay: DailyFinancial | null;
  schedule: ScheduleItem[];
  weekCalendar: CalendarDay[];
  emails: Email[];
  awaiting: AwaitingResponse[];
  tasks: Task[];
  priorityToday: Task[];
  awaitingThresholdHours: number;
};

// App-level runtime settings sourced from the backend (.env) — not credentials.
export type AppSettings = { awaitingThresholdHours: number };

// ── Network plumbing ─────────────────────────────────────────────────────────
export class ApiError extends Error {
  constructor(
    public status: number,
    public path: string,
    message?: string,
  ) {
    super(message ?? `Request to ${path} failed (${status})`);
    this.name = 'ApiError';
  }
}

let _onAuthError: (() => void) | null = null;
export function setAuthErrorHandler(fn: () => void) { _onAuthError = fn; }

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${config.apiUrl}${path}`, {
    headers: { Accept: 'application/json' },
    credentials: 'include', // backend holds the session/token; browser never sees keys
  });
  // 403 (Microsoft not connected) / 401 (unauthorized) on a data call = the in-memory
  // session is gone → bounce to login rather than render blanks.
  if (res.status === 403 || res.status === 401) {
    _onAuthError?.();
    throw new ApiError(res.status, path, 'Session expired — please sign in again');
  }
  if (!res.ok) throw new ApiError(res.status, path, res.statusText);
  return (await res.json()) as T;
}

// ── Getters (what the UI calls) ──────────────────────────────────────────────
// Live-only (MBI-35): every getter fetches its backend route. The runtime sample
// fallback is gone — with no backend/session the call rejects and the UI shows a
// loading/empty/not-connected state (via useApi), never sample numbers.
export function getEmails(): Promise<Email[]> {
  return fetchJson<Email[]>('/api/email');
}

export function getEmail(id: string): Promise<Email | undefined> {
  return fetchJson<Email>(`/api/email/${id}`);
}

// Derived "follow-up engine" — not a raw mailbox field (see ARCHITECTURE.md).
export function getAwaiting(): Promise<AwaitingResponse[]> {
  return fetchJson<AwaitingResponse[]>('/api/email/awaiting');
}

export function getCalendar(): Promise<CalendarData> {
  return fetchJson<CalendarData>('/api/calendar');
}

export function getTasks(): Promise<Task[]> {
  return fetchJson<Task[]>('/api/tasks');
}

export function getFinancials(): Promise<FinancialsData> {
  return fetchJson<FinancialsData>('/api/financials');
}

export function getReports(): Promise<ReportsData> {
  return fetchJson<ReportsData>('/api/reports');
}

export function getDashboard(view: ViewMode): Promise<DashboardData> {
  return fetchJson<DashboardData>(`/api/dashboard?view=${view}`);
}

export type MeData = { displayName: string; mail: string };

// Explicit auth probe used on load. A 403/401 here is the EXPECTED "not signed in"
// answer (first visit or after a restart) — so it does NOT fire the global auth-error
// handler (which would wrongly flash "session expired" on a clean first load). The
// caller treats a thrown/rejected probe as unauthenticated.
export async function getMe(): Promise<MeData> {
  const res = await fetch(`${config.apiUrl}/api/me`, {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  if (!res.ok) throw new ApiError(res.status, '/api/me', res.statusText);
  return (await res.json()) as MeData;
}

// Runtime settings (e.g. the awaiting-response threshold) from backend/.env.
export function getSettings(): Promise<AppSettings> {
  return fetchJson<AppSettings>('/api/settings');
}

// Drop the backend session so a page refresh stays signed out. No-op in mock mode
// (no backend / no real session). Resolves even if the call fails — the client-side
// state is cleared regardless.
export async function logoutBackend(): Promise<void> {
  if (!config.apiUrl) return;
  try {
    await fetch(`${config.apiUrl}/auth/logout`, { method: 'POST', credentials: 'include' });
  } catch {
    /* network error — local sign-out still proceeds */
  }
}

// Convenience: returns the mode for a given source, for passing to Panel sourceMode prop.
export function sourceModeFor(id: SourceId): SourceMode {
  return SOURCE_MODES[id];
}

export function getSourceStatus(): Promise<SourceStatus[]> {
  return Promise.resolve(
    (Object.keys(SOURCE_MODES) as SourceId[]).map((id) => ({
      id,
      label: SOURCE_LABELS[id],
      mode: SOURCE_MODES[id],
    })),
  );
}
