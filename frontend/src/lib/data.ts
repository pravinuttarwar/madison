// ─────────────────────────────────────────────────────────────────────────────
// Madison Command Center — sample data
//
// Mirrors the customer's own "Command Center" mockup (docs/context). Per the
// agreed scope we DROPPED: the Projects card, the AI assistant panel, and the
// EHR + direct bank-feed data sources. What remains is sourced only from the
// systems still in scope: Outlook (mail + calendar), Microsoft To Do, Microsoft
// Teams, QuickBooks, and the providers' weekly spreadsheet.
//
// All figures here are realistic SAMPLE data so the screens are clickable today;
// live read-only connections are the next-phase step.
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
export type WeeklyMetric = { key: string; label: string; last: number; prior: number };

export const WEEK_NUMBER = 16;

export const WEEKLY_METRICS: WeeklyMetric[] = [
  { key: 'new_patients', label: 'New patients', last: 22, prior: 18 },
  { key: 'medical_seen', label: 'Medical seen', last: 284, prior: 271 },
  { key: 'n1', label: 'N1 visits', last: 187, prior: 192 },
  { key: 'chiro_seen', label: 'Chiropractic seen', last: 612, prior: 598 },
  { key: 'admin_codes', label: 'Admin codes', last: 94, prior: 88 },
  { key: 'allergy_tests', label: 'Allergy tests', last: 14, prior: 11 },
  { key: 'allergy_kits', label: 'Allergy kits dispersed', last: 9, prior: 12 },
  { key: 'recovery_new', label: 'Recovery — new', last: 17, prior: 13 },
  { key: 'recovery_all', label: 'Recovery — all', last: 142, prior: 129 },
  { key: 'pod', label: 'Podiatry', last: 78, prior: 82 },
  { key: 'acu', label: 'Acupuncture', last: 56, prior: 61 },
  { key: 'procedures', label: 'Procedures', last: 31, prior: 28 },
];

// Encounters by specialty (for the Reports bar visual)
export type EncounterRow = { label: string; last: number; prior: number };

export const ENCOUNTERS_BY_SPECIALTY: EncounterRow[] = [
  { label: 'Chiropractic', last: 612, prior: 598 },
  { label: 'Medical', last: 284, prior: 271 },
  { label: 'Recovery', last: 142, prior: 129 },
  { label: 'Podiatry', last: 78, prior: 82 },
  { label: 'Acupuncture', last: 56, prior: 61 },
  { label: 'Procedures', last: 31, prior: 28 },
];

export const TOTAL_ENCOUNTERS = { last: 1547, prior: 1489 };

// ── Financial (QuickBooks) ────────────────────────────────────────────────────
export type WeeklyFinancial = {
  depositsByDay: { day: string; amount: number }[];
  totalDeposits: { last: number; prior: number };
  variableSpend: { last: number; prior: number };
  netContribution: { last: number; prior: number };
  topCategory: { name: string; amount: number };
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

export const WEEKLY_FINANCIAL: WeeklyFinancial = {
  depositsByDay: [
    { day: 'Mon', amount: 58420 },
    { day: 'Tue', amount: 71210 },
    { day: 'Wed', amount: 64890 },
    { day: 'Thu', amount: 59140 },
    { day: 'Fri', amount: 58720 },
  ],
  totalDeposits: { last: 312380, prior: 298640 },
  variableSpend: { last: 87440, prior: 91200 },
  netContribution: { last: 224940, prior: 207440 },
  topCategory: { name: 'Med supplies', amount: 24000 },
};

export const DAILY_FINANCIAL: DailyFinancial = {
  depositYesterday: {
    breakdown: [
      { label: 'Card batch — AM', amount: 22140 },
      { label: 'Card batch — PM', amount: 28640 },
      { label: 'Insurance ACH', amount: 7640 },
    ],
    total: 58420,
    prior: 54180,
    account: 'Business operating account',
    posted: 'Posted 06:42 ET',
  },
  variableSpend: {
    yesterday: { last: 14210, prior: 12980 },
    wtd: 48640,
    mtd: 214820,
    topCategories: [
      { name: 'Med supplies', amount: 62140 },
      { name: 'Lab / regenerative', amount: 48290 },
      { name: 'Marketing', amount: 31420 },
    ],
  },
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

export const TODAY_SCHEDULE: ScheduleItem[] = [
  {
    time: '08:00', end: '08:30', title: 'Clinic open / staff huddle',
    detail: 'Front desk · full team', location: 'Front desk',
    description: 'Daily huddle — yesterday’s no-shows, today’s schedule risks, recovery-suite room turnover.',
    organizer: 'Dr. Romano',
    attendees: [
      { name: 'Front desk lead', response: 'accepted' },
      { name: 'Hetal · Billing', response: 'accepted' },
      { name: 'Provider team', response: 'tentative' },
    ],
  },
  {
    time: '09:30', end: '10:15', title: 'UB-04 transition review',
    detail: 'with Hetal (Billing)', location: 'Microsoft Teams',
    description: 'Walk the UB-04 model and the two payer edge cases before the Wednesday decision meeting.',
    joinUrl: 'https://teams.microsoft.com/l/meetup-join/sample-ub04',
    organizer: 'Hetal · Billing',
    attendees: [
      { name: 'Dr. Romano', response: 'accepted' },
      { name: 'Hetal · Billing', response: 'accepted' },
    ],
  },
  {
    time: '11:00', end: '11:45', title: 'Wearable pilot — scoping call',
    detail: 'Research lab', location: 'Microsoft Teams',
    description: 'Scope the pilot protocol and data-sharing terms. Confirm Tue/Wed for the follow-up.',
    joinUrl: 'https://teams.microsoft.com/l/meetup-join/sample-wearable',
    organizer: 'Dr. Romano',
    attendees: [
      { name: 'Dr. Romano', response: 'accepted' },
      { name: 'Research lab', response: 'accepted' },
    ],
  },
  {
    time: '12:30', end: '13:00', title: 'Provider 1:1 — onboarding',
    detail: 'Dr. Ianuzzi · onboarding progress', location: 'Office',
    description: 'Track-C onboarding check-in: peptide deck review status, IG Live segment this week.',
    organizer: 'Dr. Romano',
    attendees: [{ name: 'Dr. Ianuzzi', response: 'accepted' }],
  },
  { time: '14:00', end: '14:30', title: 'Open slot', detail: '2pm patient moved', open: true },
  {
    time: '16:30', end: '17:15', title: 'Peptide protocol review',
    detail: 'Regenerative team', location: 'Recovery suite',
    description: 'Sign off handout v3 and confirm the reorder cold-chain timing for Thursday.',
    organizer: 'Dr. Romano',
    attendees: [
      { name: 'Regenerative team', response: 'accepted' },
      { name: 'Dr. Ianuzzi', response: 'tentative' },
    ],
  },
];

export type CalendarDay = {
  day: string;
  long: string;
  date?: string;
  count: number;
  events: ScheduleItem[];
  today?: boolean;
};

export const WEEK_CALENDAR: CalendarDay[] = [
  {
    day: 'MON', long: 'Monday', count: 3, today: true,
    events: [
      { time: '08:00', title: 'Staff huddle', detail: 'Front desk' },
      { time: '09:00', title: 'Weekly leadership sync', detail: 'Microsoft Teams', joinUrl: 'https://teams.microsoft.com/l/meetup-join/sample-lead' },
      { time: '15:00', title: 'Payer call — commercial plans', detail: 'Aetna / Horizon' },
    ],
  },
  {
    day: 'TUE', long: 'Tuesday', count: 4,
    events: [
      { time: '08:00', title: 'Staff huddle', detail: 'Front desk' },
      { time: '10:00', title: 'N1 conversion SOP — MA walkthrough', detail: 'Training room' },
      { time: '13:30', title: 'Vendor demo — regenerative supplier', detail: 'Microsoft Teams', joinUrl: 'https://teams.microsoft.com/l/meetup-join/sample-vendor' },
      { time: '16:00', title: 'Recovery suite walkthrough', detail: 'Recovery suite' },
    ],
  },
  {
    day: 'WED', long: 'Wednesday', count: 5,
    events: [
      { time: '08:00', title: 'Staff huddle', detail: 'Front desk' },
      { time: '09:30', title: 'Provider 1:1', detail: 'Office' },
      { time: '11:00', title: 'UB-04 final decision meeting', detail: 'with Hetal · Microsoft Teams', joinUrl: 'https://teams.microsoft.com/l/meetup-join/sample-ub04-final' },
      { time: '14:00', title: 'Allergy program review', detail: 'Clinical' },
      { time: '16:00', title: 'Cryotherapy chamber — service review', detail: 'Vendor' },
    ],
  },
  {
    day: 'THU', long: 'Thursday', count: 4,
    events: [
      { time: '08:00', title: 'Staff huddle', detail: 'Front desk' },
      { time: '12:00', title: 'Social — IG Live segment prep', detail: 'with Social manager' },
      { time: '15:00', title: 'Vendor demo (regenerative)', detail: 'Microsoft Teams', joinUrl: 'https://teams.microsoft.com/l/meetup-join/sample-regen' },
      { time: '18:00', title: 'IG Live segment', detail: 'Evening · Social' },
    ],
  },
  {
    day: 'FRI', long: 'Friday', count: 3,
    events: [
      { time: '08:00', title: 'Staff huddle', detail: 'Front desk' },
      { time: '10:00', title: 'Recovery suite ROI review', detail: 'Recovery suite' },
      { time: '16:30', title: 'Peptide protocol sign-off', detail: 'Regenerative team' },
    ],
  },
];

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

export const EMAILS: Email[] = [
  {
    id: 'e1',
    unread: true,
    important: true,
    category: 'action-needed',
    from: 'Hetal — Billing',
    subject: 'UB-04 analysis ready',
    preview: 'Numbers are in for the transition model — needs your sign-off before the Wed meeting.',
    time: 'Last night · 23:14',
    body: "Hi Dr. Romano — I've finished the UB-04 transition model. The headline numbers look workable but I want your sign-off before Wednesday's decision meeting. I flagged two payer edge cases in the sheet. Can we cover them at the 10am review?",
  },
  {
    id: 'e2',
    unread: true,
    important: true,
    category: 'management',
    from: 'Research lab',
    subject: 'Positive reply — wearable pilot',
    preview: 'They are interested and want to schedule a call next week to scope the pilot protocol.',
    time: 'Today · 07:55',
    body: 'Thanks for the outreach. We reviewed the proposal and would like to move ahead with a scoping call next week. Tuesday or Wednesday afternoon works on our side. We can walk through the pilot protocol and data-sharing terms.',
  },
  {
    id: 'e3',
    unread: true,
    important: false,
    category: 'operational',
    from: 'Billing system support',
    subject: 'Coding question — follow-up',
    preview: 'Following up on the place-of-service coding question from last week.',
    time: 'Today · 09:10',
    body: "Following up on your place-of-service classification question. We've routed it to the billing configuration team; expect a response within two business days. Let us know if anything is urgent.",
  },
  {
    id: 'e4',
    unread: false,
    important: false,
    category: 'operational',
    from: 'Commercial payer relations',
    subject: 'Provider notice — network update',
    preview: 'Routine network bulletin. No action required at this time.',
    time: 'Yesterday · 16:20',
    body: 'This is a routine provider network bulletin regarding upcoming portal maintenance. No action is required at this time. Full details are attached.',
  },
  {
    id: 'e5',
    unread: false,
    important: true,
    category: 'operational',
    from: 'Front desk lead',
    subject: 'N1 conversion SOP — draft 2',
    preview: 'Second draft of the rollout plan for the MAs, ready for your review.',
    time: 'Yesterday · 14:02',
    body: "Attached is draft 2 of the N1 conversion SOP for the medical assistants. I incorporated your notes on the intake script. If this looks good I'll schedule the team walkthrough for Thursday.",
  },
  {
    id: 'e6',
    unread: true,
    important: true,
    category: 'management',
    from: 'Practice manager',
    subject: 'Monday provider report — ready',
    preview: "This week's provider spreadsheet is finalized and shared to the team folder.",
    time: 'Today · 06:48',
    body: "Morning — the weekly provider report is done and in the shared folder. Encounters are up across chiro and recovery; allergy kits dipped. Flagging it so it's on your Monday view.",
  },
  {
    id: 'e7',
    unread: true,
    important: false,
    category: 'operational',
    from: 'Regenerative supplier',
    subject: 'Reorder confirmation',
    preview: 'Your peptide protocol reorder is confirmed and ships Thursday.',
    time: 'Today · 08:20',
    body: 'This confirms your regenerative protocol reorder. Expected to ship Thursday with standard cold-chain handling. Reply here if quantities need adjusting.',
  },
  {
    id: 'e8',
    unread: true,
    important: false,
    category: 'operational',
    from: 'IT support',
    subject: 'Mailbox storage notice',
    preview: 'Routine notice — your mailbox is at 70% of its storage quota.',
    time: 'Yesterday · 18:05',
    body: 'Routine maintenance notice: your mailbox has reached 70% of its storage quota. No action is required yet; we will archive older items automatically.',
  },
];

// `wait` is the display label ("2h" / "7d"); `hours` is for sorting newest-waited last.
export type AwaitingResponse = { id: string; days: number; hours?: number; wait: string; to: string; subject: string; detail: string };

export const AWAITING_RESPONSE: AwaitingResponse[] = [
  { id: 'a1', days: 7, wait: '7d', to: 'University lab', subject: 'Wearable outreach', detail: 'No reply since the initial intro email' },
  { id: 'a2', days: 5, wait: '5d', to: 'Payer provider relations', subject: 'UB-04 question', detail: 'Awaiting clarification on the payer requirement' },
  { id: 'a3', days: 3, wait: '3d', to: 'Cryotherapy vendor', subject: 'Chamber service quote', detail: 'Requested a service + maintenance quote' },
  { id: 'a4', days: 2, wait: '2d', to: 'Social manager', subject: 'Live segment brief', detail: 'Confirmation needed on the Thursday slot' },
];

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

export const TASKS: Task[] = [
  { id: 't1', title: 'Reply to Hetal — UB-04 model', owner: 'DCR', due: 'Before 10am', status: 'due-today' },
  { id: 't2', title: 'Confirm wearable scoping call slot', owner: 'DCR', due: 'Tue or Wed', status: 'due-today' },
  { id: 't3', title: 'Recovery Suite ROI model v3', owner: 'DCR', due: 'Fri', status: 'upcoming' },
  { id: 't4', title: 'Sign off peptide handout v3', owner: 'DCR', due: 'Mon next', status: 'overdue' },
  { id: 't5', title: 'Recovery suite walkthrough notes', owner: 'DCR', due: 'For ROI v3', status: 'upcoming' },
  { id: 't6', title: 'Pilot protocol v2 draft', owner: 'DCR', due: 'Fri', status: 'upcoming' },
  { id: 't7', title: 'UB-04 transition — final recommendation', owner: 'HETAL', due: 'Wed', status: 'due-today' },
  { id: 't8', title: 'Payer call notes — commercial plans', owner: 'HETAL', due: 'Thu', status: 'upcoming' },
  { id: 't9', title: 'Reconcile front-desk vs deposit gap', owner: 'HETAL', due: 'Fri', status: 'upcoming' },
  { id: 't10', title: 'Live segment confirmation', owner: 'SOCIAL', due: 'Yesterday', status: 'overdue' },
  { id: 't11', title: 'Recovery suite content calendar', owner: 'SOCIAL', due: 'Thu', status: 'upcoming' },
  { id: 't14', title: 'N1 conversion SOP rollout to MAs', owner: 'FRONT', due: 'Thu', status: 'upcoming' },
  { id: 't15', title: 'Intake script update', owner: 'FRONT', due: 'Fri', status: 'upcoming' },
  { id: 't16', title: 'Peptide deck review', owner: 'PROVIDER', due: 'Mon next', status: 'upcoming' },
];

// ── Priority items (the owner's "do-this" list) ───────────────────────────────
export type Priority = { id: string; urgent: boolean; title: string; detail: string; owner: Owner };

export const PRIORITY_WEEK: Priority[] = [
  { id: 'p1', urgent: true, title: 'Finalize UB-04 transition decision', detail: 'Hetal needs sign-off · due Wed', owner: 'DCR' },
  { id: 'p2', urgent: true, title: 'Confirm wearable scoping call', detail: 'Tue or Wed slot', owner: 'DCR' },
  { id: 'p3', urgent: false, title: 'Live segment execution', detail: 'Thu evening · Social manager owns', owner: 'SOCIAL' },
  { id: 'p4', urgent: false, title: 'Recovery Suite ROI model v3', detail: 'Due Fri', owner: 'DCR' },
  { id: 'p5', urgent: false, title: 'N1 conversion SOP rollout', detail: 'Front desk lead', owner: 'FRONT' },
  { id: 'p6', urgent: false, title: 'Peptide handout v3 sign-off', detail: 'Due Mon next', owner: 'DCR' },
];

export const PRIORITY_TODAY: Priority[] = [
  { id: 'pt1', urgent: true, title: 'Reply to Hetal — UB-04 model', detail: 'Before the 10am meeting', owner: 'DCR' },
  { id: 'pt2', urgent: true, title: 'Confirm wearable call slot', detail: 'Tue or Wed', owner: 'DCR' },
  { id: 'pt3', urgent: false, title: 'Sign off peptide handout v3', detail: 'Provider waiting', owner: 'DCR' },
  { id: 'pt4', urgent: false, title: 'N1 SOP rollout check-in', detail: 'Front desk lead', owner: 'FRONT' },
  { id: 'pt5', urgent: false, title: 'Recovery suite walkthrough notes', detail: 'For ROI v3', owner: 'DCR' },
];

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
