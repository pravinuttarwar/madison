// ─────────────────────────────────────────────────────────────────────────────
// Madison Command Center — shared types + UI constants
//
// This module is the front-end's shape vocabulary: the DTO TYPES the pages and the
// `@/lib/api` getters speak (Email, Task, WeeklyFinancial, …), plus a few small UI
// constants (owner label, source list, the current week's dates).
//
// The runtime SAMPLE data arrays used to live here too; they were removed when the app
// went live-only (MBI-35) — the read-only backend (BFF) is now the single data source.
// Synthetic render fixtures for the tests live in `src/test/fixtures.ts`.
// ─────────────────────────────────────────────────────────────────────────────

export const OWNER = 'Dr. Romano';
export const PRACTICE = 'Madison Medical & Sports Rehabilitation Center';

export type Source =
  | 'Outlook'
  | 'Microsoft To Do'
  | 'QuickBooks'
  | 'Weekly spreadsheet';

export const DATA_SOURCES: { name: Source; detail: string }[] = [
  { name: 'Outlook', detail: 'Email + calendar' },
  { name: 'Microsoft To Do', detail: 'Tasks by owner' },
  { name: 'QuickBooks', detail: 'Deposits + spend' },
  { name: 'Weekly spreadsheet', detail: "Providers' weekly report" },
];

// ── Weekly clinical report (the providers' weekly spreadsheet) ────────────────
// `yearAgo` (MAD-29) is the same-period-last-year value. `monthToDate`/`prevMonth` (MAD-28)
// are the month-over-month pair. All optional — present only when the workbook has the
// corresponding named ranges configured; absent → week-over-week only (back-compat).
export type WeeklyMetric = {
  key: string; label: string; last: number; prior: number;
  yearAgo?: number; monthToDate?: number; prevMonth?: number;
};

// Encounters by specialty (for the Reports bar visual)
export type EncounterRow = {
  label: string; last: number; prior: number;
  yearAgo?: number; monthToDate?: number; prevMonth?: number;
};

// ── Financial (QuickBooks) ────────────────────────────────────────────────────
export type WeeklyFinancial = {
  depositsByDay: { day: string; amount: number }[];
  totalDeposits: { last: number; prior: number };
  variableSpend: { last: number; prior: number };
  netContribution: { last: number; prior: number };
  topCategory: { name: string; amount: number };
};

// Accrual-basis revenue (QuickBooks ProfitAndLoss Total Income), MAD-23. Additive to
// the financials snapshot — last full week vs the prior week (WoW) and month-to-date.
export type RevenueFinancial = {
  weekly: { last: number; prior: number };
  mtd: number;
};

// Outstanding-invoice tracking / A/R aging (QuickBooks open Invoices), MAD-24. Additive to
// the financials snapshot. AGGREGATE-ONLY — totals, counts and aging-bucket sums; never any
// customer/patient name (HIPAA / SOW no-PHI posture). A point-in-time snapshot, so it reads
// the same in the Monday and Weekday views.
export type ReceivablesFinancial = {
  totalOutstanding: number;
  openCount: number;
  asOf: string;
  aging: { bucket: string; amount: number; count: number }[];
};

// Cash-flow overview (QuickBooks deposits vs all purchases), MAD-25. Additive to the
// financials snapshot. Cash in = deposits, cash out = ALL purchases (incl. fixed costs,
// unlike variableSpend), net = in − out — last full week vs prior (WoW) and month-to-date.
export type CashFlowFinancial = {
  weekly: {
    inflow: { last: number; prior: number };
    outflow: { last: number; prior: number };
    net: { last: number; prior: number };
  };
  mtd: { inflow: number; outflow: number; net: number };
};

export type DailyFinancial = {
  depositYesterday: {
    breakdown: { label: string; amount: number }[];
    total: number;
    prior: number;
    account: string;
    posted: string;
  };
  variableSpend: {
    yesterday: { last: number; prior: number };
    wtd: number;
    mtd: number;
    topCategories: { name: string; amount: number }[];
  };
};

// ── Calendar (Outlook) ────────────────────────────────────────────────────────
// Attendee response mirrors Microsoft Graph: accepted | tentative | declined | none.
export type AttendeeResponse = 'accepted' | 'tentative' | 'declined' | 'none';
export type Attendee = { name: string; email?: string; response?: AttendeeResponse };

// A calendar event carries everything Graph can give us — the timeline + detail card
// render whatever is present (description, join link, attendees, organizer, location).
export type ScheduleItem = {
  time: string;
  title: string;
  detail: string;
  open?: boolean;
  end?: string;
  location?: string;
  description?: string;
  joinUrl?: string;
  attendees?: Attendee[];
  organizer?: string;
  isAllDay?: boolean;
};

export type CalendarDay = {
  day: string;
  long: string;
  date?: string;
  count: number;
  events: ScheduleItem[];
  today?: boolean;
};

// ── Email (Outlook) ───────────────────────────────────────────────────────────
// Phase-1 briefing category (MBI-19). Rule-based on the backend (sender/domain →
// category, defaulting to 'action-needed'); the dashboard renders it as icon + text.
export type EmailCategory = 'management' | 'operational' | 'action-needed';

export type Email = {
  id: string;
  unread: boolean;
  important: boolean;
  category: EmailCategory;
  from: string;
  subject: string;
  preview: string;
  time: string;
  body: string;
  joinUrl?: string;
};

// `wait` is the display label ("2h" / "7d"); `hours` is for sorting newest-waited last.
export type AwaitingResponse = { id: string; days: number; hours?: number; wait: string; to: string; subject: string; detail: string };

// ── Tasks (Microsoft To Do) ───────────────────────────────────────────────────
export type Owner = 'DCR' | 'HETAL' | 'SOCIAL' | 'FRONT' | 'PROVIDER';

export const OWNER_NAMES: Record<Owner, string> = {
  DCR: 'Dr. Romano',
  HETAL: 'Hetal · Billing',
  SOCIAL: 'Social manager',
  FRONT: 'Front desk lead',
  PROVIDER: 'Provider onboarding',
};

export type TaskStatus = 'overdue' | 'due-today' | 'upcoming' | 'done';

export type Task = { id: string; title: string; owner: Owner; due: string; status: TaskStatus };

// ── Priority items (the owner's "do-this" list) ───────────────────────────────
export type Priority = { id: string; urgent: boolean; title: string; detail: string; owner: Owner };

// The current week's dates, computed live (Monday + today), for the header chrome.
function fmtDate(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}
const _today = new Date();
const _mon = new Date(_today);
_mon.setDate(_today.getDate() - (_today.getDay() === 0 ? 6 : _today.getDay() - 1));
export const DATES = {
  monday: fmtDate(_mon),
  weekday: fmtDate(_today),
};
