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
import * as mock from '@/lib/data';
import type {
  Email,
  AwaitingResponse,
  ScheduleItem,
  CalendarDay,
  Task,
  WeeklyMetric,
  WeeklyFinancial,
  DailyFinancial,
} from '@/lib/data';

// ── Sources & their wiring ───────────────────────────────────────────────────
// One entry per upstream system. 'mock' = sample data (default, ships today).
// 'sandbox' = wired to a vendor sandbox / dev tenant (Phase-1 trial). 'live' =
// the customer's real, admin-consented tenant (Phase 2). Flip an entry to start
// reading that source from the backend; everything else keeps using sample data.
export type SourceId =
  | 'outlook' // Outlook mail + calendar (Microsoft Graph)
  | 'microsoftToDo' // Tasks by owner (Microsoft Graph / To Do or Planner)
  | 'microsoftTeams' // Mentions + DMs (Microsoft Graph)
  | 'quickbooks' // Deposits + spend (QuickBooks Online)
  | 'spreadsheet'; // Providers' weekly report (Excel via Graph Workbook)

export type SourceMode = 'mock' | 'sandbox' | 'live';

// Which sources are wired to the backend is driven by env, so going live needs NO code edit:
//   VITE_API_URL=http://localhost:8787   VITE_LIVE_SOURCES=outlook,quickbooks   VITE_LIVE_MODE=sandbox
// Any source not listed stays on sample data. Default (no env) = everything mock, so the
// standalone prototype keeps working with no backend.
export const LIVE_MODE = (import.meta.env.VITE_LIVE_MODE as SourceMode) || 'sandbox';
const LIVE_SOURCES = new Set(
  (import.meta.env.VITE_LIVE_SOURCES || '')
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean),
);
function modeFor(id: SourceId): SourceMode {
  return LIVE_SOURCES.has(id) ? LIVE_MODE : 'mock';
}

export const SOURCE_MODES: Record<SourceId, SourceMode> = {
  outlook: modeFor('outlook'),
  microsoftToDo: modeFor('microsoftToDo'),
  microsoftTeams: modeFor('microsoftTeams'),
  quickbooks: modeFor('quickbooks'),
  spreadsheet: modeFor('spreadsheet'),
};

export const SOURCE_LABELS: Record<SourceId, string> = {
  outlook: 'Outlook',
  microsoftToDo: 'Microsoft To Do',
  microsoftTeams: 'Microsoft Teams',
  quickbooks: 'QuickBooks',
  spreadsheet: 'Weekly spreadsheet',
};

export type SourceStatus = { id: SourceId; label: string; mode: SourceMode };

// ── Response DTOs (the contract) ─────────────────────────────────────────────
export type CalendarData = { today: ScheduleItem[]; week: CalendarDay[] };

export type FinancialsData = { weekly: WeeklyFinancial; daily: DailyFinancial };

export type MetricWoW = { last: number; prior: number | null };
export type ModalityRow = { key: string; label: string; last: number; prior: number | null };
export type ProviderRow = { name: string; last: number; prior: number | null };
export type MonthRow = { month: string; label: string; total: number };
export type ReportSource = { year: string; kind: 'url' | 'local'; fileName?: string };
export type YoY = { label: string; total: MetricWoW; modalities: ModalityRow[] };

// Reports reads the owner's real weekly spreadsheet(s) (SharePoint/OneDrive share links,
// keyed by year — or local test files). `configured:false` → none connected yet.
export type ReportsData = {
  configured: boolean;
  allowLocal?: boolean;
  sources?: ReportSource[];
  week?: {
    weekStart: string;
    priorWeekStart: string | null;
    totalEncounters: MetricWoW;
    modalities: ModalityRow[];
    providers: ProviderRow[];
    covidTest?: MetricWoW;
    telehealth?: MetricWoW;
  };
  months?: MonthRow[];
  yoy?: YoY | null;
  weeksAvailable?: number;
};

// The Dashboard is a composed (BFF) view — the backend fans out to the sources it
// needs in parallel and returns one payload, so the browser makes a single call.
export type DashboardData = {
  view: ViewMode;
  owner: string;
  dates: { monday: string; weekday: string };
  weekNumber: number;
  metrics: WeeklyMetric[];
  totalEncounters: { last: number; prior: number };
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

// A source is "live" purely from VITE_LIVE_SOURCES — NOT from the API URL, because
// in the single-port deploy the backend is same-origin (apiUrl is empty / relative).
// The static (no-backend) build must omit VITE_LIVE_SOURCES so everything stays mock.
function isLive(source: SourceId): boolean {
  return SOURCE_MODES[source] !== 'mock';
}

// True when the composed dashboard should be fetched from the backend BFF.
function dashboardLive(): boolean {
  return Object.values(SOURCE_MODES).some((m) => m !== 'mock');
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${config.apiUrl}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
    credentials: 'include', // backend holds the session/token; browser never sees keys
  });
  // 401 = the in-memory Microsoft session is gone → bounce to login. (403 is a real
  // "forbidden" — e.g. a file the user can't access — and is left for the caller.)
  if (res.status === 401) {
    _onAuthError?.();
    throw new ApiError(401, path, 'Session expired — please sign in again');
  }
  if (!res.ok) throw new ApiError(res.status, path, res.statusText);
  return (await res.json()) as T;
}

// Read a source: return sample data unless that source is wired, in which case
// hit the backend route. This is the only branch a dev touches to go live.
async function read<T>(source: SourceId, path: string, sample: T): Promise<T> {
  if (!isLive(source)) return sample;
  return fetchJson<T>(path);
}

// ── Getters (what the UI calls) ──────────────────────────────────────────────
export function getEmails(): Promise<Email[]> {
  return read('outlook', '/api/email', mock.EMAILS);
}

export function getEmail(id: string): Promise<Email | undefined> {
  if (!isLive('outlook')) return Promise.resolve(mock.EMAILS.find((e) => e.id === id));
  return fetchJson<Email>(`/api/email/${id}`);
}

// Derived "follow-up engine" — not a raw mailbox field (see ARCHITECTURE.md).
export function getAwaiting(): Promise<AwaitingResponse[]> {
  return read('outlook', '/api/email/awaiting', mock.AWAITING_RESPONSE);
}

export function getCalendar(): Promise<CalendarData> {
  return read('outlook', '/api/calendar', {
    today: mock.TODAY_SCHEDULE,
    week: mock.WEEK_CALENDAR,
  });
}

export function getTasks(): Promise<Task[]> {
  return read('microsoftToDo', '/api/tasks', mock.TASKS);
}

export function getFinancials(): Promise<FinancialsData> {
  return read('quickbooks', '/api/financials', {
    weekly: mock.WEEKLY_FINANCIAL,
    daily: mock.DAILY_FINANCIAL,
  });
}

export function getReports(refresh = false): Promise<ReportsData> {
  // Mock mode has no backend → "not configured" so the page shows its pending/connect UI.
  return read('spreadsheet', `/api/reports${refresh ? '?refresh=1' : ''}`, { configured: false });
}

// Add/update a spreadsheet source (overwrite same year). Throws ApiError on 422/403.
export function addReportsSource(url: string, year?: string): Promise<ReportsData> {
  return fetchJson<ReportsData>('/api/reports/source', { method: 'POST', body: JSON.stringify({ url, year }) });
}

// Load the on-disk test files (dev-only local mode) through the same parser path.
export function loadLocalReports(): Promise<ReportsData> {
  return fetchJson<ReportsData>('/api/reports/source', { method: 'POST', body: JSON.stringify({ local: true }) });
}

// Remove a source by year.
export function removeReportsSource(year: string): Promise<ReportsData> {
  return fetchJson<ReportsData>(`/api/reports/source/${encodeURIComponent(year)}`, { method: 'DELETE' });
}

export function getDashboard(view: ViewMode): Promise<DashboardData> {
  const sample: DashboardData = {
    view,
    owner: mock.OWNER,
    dates: mock.DATES,
    weekNumber: mock.WEEK_NUMBER,
    metrics: mock.WEEKLY_METRICS,
    totalEncounters: mock.TOTAL_ENCOUNTERS,
    financialWeek: mock.WEEKLY_FINANCIAL,
    financialDay: mock.DAILY_FINANCIAL,
    schedule: mock.TODAY_SCHEDULE,
    weekCalendar: mock.WEEK_CALENDAR,
    emails: mock.EMAILS,
    awaiting: mock.AWAITING_RESPONSE,
    tasks: mock.TASKS,
    // Sample priority derived from sample tasks — same logic as the live backend
    priorityToday: [
      ...mock.TASKS.filter((t) => t.status === 'overdue'),
      ...mock.TASKS.filter((t) => t.status === 'due-today'),
    ].slice(0, 5),
    awaitingThresholdHours: 48, // sample default; live value comes from the backend
  };
  if (!dashboardLive()) return Promise.resolve(sample);
  return fetchJson<DashboardData>(`/api/dashboard?view=${view}`);
}

export type MeData = { displayName: string; mail: string };

// Explicit auth probe used on load. A 403/401 here is the EXPECTED "not signed in"
// answer (first visit or after a restart) — so it does NOT fire the global auth-error
// handler (which would wrongly flash "session expired" on a clean first load). The
// caller treats a thrown/rejected probe as unauthenticated.
export async function getMe(): Promise<MeData> {
  if (!isLive('outlook')) return { displayName: mock.OWNER, mail: '' };
  const res = await fetch(`${config.apiUrl}/api/me`, {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  if (!res.ok) throw new ApiError(res.status, '/api/me', res.statusText);
  return (await res.json()) as MeData;
}

// Runtime settings (e.g. the awaiting-response threshold) from backend/.env. In
// mock mode there's no backend, so the documented 48h default is returned.
export function getSettings(): Promise<AppSettings> {
  return read('outlook', '/api/settings', { awaitingThresholdHours: 48 });
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
