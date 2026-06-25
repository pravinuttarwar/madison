// Sample payloads matching the front-end DTOs exactly. Served when DEMO_MODE=1 so the
// FE ↔ BE round-trip (and the DTO contract) can be verified before any credentials exist.
// Mirrors frontend/src/lib/data.ts.

const OWNER = 'Dr. Romano';
const DATES = { monday: 'Monday, April 27, 2026', weekday: 'Tuesday, April 28, 2026' };
const WEEK_NUMBER = 16;

const WEEKLY_METRICS = [
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

const ENCOUNTERS_BY_SPECIALTY = [
  { label: 'Chiropractic', last: 612, prior: 598 },
  { label: 'Medical', last: 284, prior: 271 },
  { label: 'Recovery', last: 142, prior: 129 },
  { label: 'Podiatry', last: 78, prior: 82 },
  { label: 'Acupuncture', last: 56, prior: 61 },
  { label: 'Procedures', last: 31, prior: 28 },
];
const TOTAL_ENCOUNTERS = { last: 1547, prior: 1489 };

const WEEKLY_FINANCIAL = {
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

const DAILY_FINANCIAL = {
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

const TODAY_SCHEDULE = [
  { time: '08:00', end: '08:30', title: 'Clinic open / staff huddle', detail: 'Front desk · full team', location: 'Front desk', description: 'Daily huddle — no-shows, schedule risks, recovery-suite turnover.', organizer: 'Dr. Romano', attendees: [{ name: 'Front desk lead', response: 'accepted' }, { name: 'Hetal · Billing', response: 'accepted' }] },
  { time: '09:30', end: '10:15', title: 'UB-04 transition review', detail: 'with Hetal (Billing)', location: 'Microsoft Teams', description: 'Walk the UB-04 model and two payer edge cases before Wednesday.', joinUrl: 'https://teams.microsoft.com/l/meetup-join/sample-ub04', organizer: 'Hetal · Billing', attendees: [{ name: 'Dr. Romano', response: 'accepted' }, { name: 'Hetal · Billing', response: 'accepted' }] },
  { time: '11:00', end: '11:45', title: 'Wearable pilot — scoping call', detail: 'Research lab', location: 'Microsoft Teams', description: 'Scope the pilot protocol and data-sharing terms.', joinUrl: 'https://teams.microsoft.com/l/meetup-join/sample-wearable', organizer: 'Dr. Romano', attendees: [{ name: 'Research lab', response: 'accepted' }] },
  { time: '12:30', end: '13:00', title: 'Provider 1:1 — onboarding', detail: 'Dr. Ianuzzi', location: 'Office', organizer: 'Dr. Romano', attendees: [{ name: 'Dr. Ianuzzi', response: 'accepted' }] },
  { time: '14:00', end: '14:30', title: 'Open slot', detail: '2pm patient moved', open: true },
  { time: '16:30', end: '17:15', title: 'Peptide protocol review', detail: 'Regenerative team', location: 'Recovery suite', description: 'Sign off handout v3, confirm Thursday reorder cold-chain.', organizer: 'Dr. Romano', attendees: [{ name: 'Regenerative team', response: 'accepted' }] },
];

const WEEK_CALENDAR = [
  { day: 'MON', long: 'Monday', count: 3, today: true, events: [
    { time: '08:00', title: 'Staff huddle', detail: 'Front desk' },
    { time: '09:00', title: 'Weekly leadership sync', detail: 'Microsoft Teams', joinUrl: 'https://teams.microsoft.com/l/meetup-join/sample-lead' },
    { time: '15:00', title: 'Payer call — commercial plans', detail: 'Aetna / Horizon' },
  ] },
  { day: 'TUE', long: 'Tuesday', count: 4, events: [
    { time: '08:00', title: 'Staff huddle', detail: 'Front desk' },
    { time: '10:00', title: 'N1 conversion SOP — MA walkthrough', detail: 'Training room' },
    { time: '13:30', title: 'Vendor demo — regenerative supplier', detail: 'Microsoft Teams', joinUrl: 'https://teams.microsoft.com/l/meetup-join/sample-vendor' },
    { time: '16:00', title: 'Recovery suite walkthrough', detail: 'Recovery suite' },
  ] },
  { day: 'WED', long: 'Wednesday', count: 5, events: [
    { time: '08:00', title: 'Staff huddle', detail: 'Front desk' },
    { time: '09:30', title: 'Provider 1:1', detail: 'Office' },
    { time: '11:00', title: 'UB-04 final decision meeting', detail: 'with Hetal · Microsoft Teams', joinUrl: 'https://teams.microsoft.com/l/meetup-join/sample-ub04-final' },
    { time: '14:00', title: 'Allergy program review', detail: 'Clinical' },
    { time: '16:00', title: 'Cryotherapy chamber — service review', detail: 'Vendor' },
  ] },
  { day: 'THU', long: 'Thursday', count: 4, events: [
    { time: '08:00', title: 'Staff huddle', detail: 'Front desk' },
    { time: '12:00', title: 'Social — IG Live segment prep', detail: 'with Social manager' },
    { time: '15:00', title: 'Vendor demo (regenerative)', detail: 'Microsoft Teams', joinUrl: 'https://teams.microsoft.com/l/meetup-join/sample-regen' },
    { time: '18:00', title: 'IG Live segment', detail: 'Evening · Social' },
  ] },
  { day: 'FRI', long: 'Friday', count: 3, events: [
    { time: '08:00', title: 'Staff huddle', detail: 'Front desk' },
    { time: '10:00', title: 'Recovery suite ROI review', detail: 'Recovery suite' },
    { time: '16:30', title: 'Peptide protocol sign-off', detail: 'Regenerative team' },
  ] },
];

const EMAILS = [
  { id: 'e1', unread: true, important: true, category: 'action-needed', from: 'Hetal — Billing', subject: 'UB-04 analysis ready', preview: 'Numbers are in for the transition model — needs your sign-off before the Wed meeting.', time: 'Last night · 23:14', body: "Hi Dr. Romano — I've finished the UB-04 transition model. Sign-off before Wednesday's meeting?" },
  { id: 'e2', unread: true, important: true, category: 'management', from: 'Research lab', subject: 'Positive reply — wearable pilot', preview: 'They are interested and want to schedule a call next week.', time: 'Today · 07:55', body: 'We would like to move ahead with a scoping call next week.' },
  { id: 'e3', unread: true, important: false, category: 'operational', from: 'Billing system support', subject: 'Coding question — follow-up', preview: 'Following up on the place-of-service coding question.', time: 'Today · 09:10', body: 'Routed to the billing configuration team; expect a reply within two business days.' },
  { id: 'e4', unread: false, important: false, category: 'operational', from: 'Commercial payer relations', subject: 'Provider notice — network update', preview: 'Routine network bulletin. No action required.', time: 'Yesterday · 16:20', body: 'Routine provider network bulletin. No action required at this time.' },
  { id: 'e5', unread: false, important: true, category: 'operational', from: 'Front desk lead', subject: 'N1 conversion SOP — draft 2', preview: 'Second draft of the rollout plan for the MAs.', time: 'Yesterday · 14:02', body: 'Draft 2 of the N1 conversion SOP for the medical assistants is attached.' },
  { id: 'e6', unread: true, important: true, category: 'management', from: 'Practice manager', subject: 'Monday provider report — ready', preview: "This week's provider spreadsheet is finalized and shared.", time: 'Today · 06:48', body: 'The weekly provider report is done and in the shared folder.' },
  { id: 'e7', unread: true, important: false, category: 'operational', from: 'Regenerative supplier', subject: 'Reorder confirmation', preview: 'Your peptide protocol reorder ships Thursday.', time: 'Today · 08:20', body: 'This confirms your regenerative protocol reorder; ships Thursday.' },
  { id: 'e8', unread: true, important: false, category: 'operational', from: 'IT support', subject: 'Mailbox storage notice', preview: 'Routine — mailbox at 70% of quota.', time: 'Yesterday · 18:05', body: 'Your mailbox has reached 70% of its storage quota. No action required yet.' },
];

const AWAITING_RESPONSE = [
  { id: 'a1', days: 7, wait: '7d', to: 'University lab', subject: 'Wearable outreach', detail: 'No reply since the initial intro email' },
  { id: 'a2', days: 5, wait: '5d', to: 'Payer provider relations', subject: 'UB-04 question', detail: 'Awaiting clarification on the payer requirement' },
  { id: 'a3', days: 3, wait: '3d', to: 'Cryotherapy vendor', subject: 'Chamber service quote', detail: 'Requested a service + maintenance quote' },
  { id: 'a4', days: 2, wait: '2d', to: 'Social manager', subject: 'Live segment brief', detail: 'Confirmation needed on the Thursday slot' },
];

const TASKS = [
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

const PRIORITY_WEEK = [
  { id: 'p1', urgent: true, title: 'Finalize UB-04 transition decision', detail: 'Hetal needs sign-off · due Wed', owner: 'DCR' },
  { id: 'p2', urgent: true, title: 'Confirm wearable scoping call', detail: 'Tue or Wed slot', owner: 'DCR' },
  { id: 'p3', urgent: false, title: 'Live segment execution', detail: 'Thu evening · Social manager owns', owner: 'SOCIAL' },
  { id: 'p4', urgent: false, title: 'Recovery Suite ROI model v3', detail: 'Due Fri', owner: 'DCR' },
  { id: 'p5', urgent: false, title: 'N1 conversion SOP rollout', detail: 'Front desk lead', owner: 'FRONT' },
  { id: 'p6', urgent: false, title: 'Peptide handout v3 sign-off', detail: 'Due Mon next', owner: 'DCR' },
];

const PRIORITY_TODAY = [
  { id: 'pt1', urgent: true, title: 'Reply to Hetal — UB-04 model', detail: 'Before the 10am meeting', owner: 'DCR' },
  { id: 'pt2', urgent: true, title: 'Confirm wearable call slot', detail: 'Tue or Wed', owner: 'DCR' },
  { id: 'pt3', urgent: false, title: 'Sign off peptide handout v3', detail: 'Provider waiting', owner: 'DCR' },
  { id: 'pt4', urgent: false, title: 'N1 SOP rollout check-in', detail: 'Front desk lead', owner: 'FRONT' },
  { id: 'pt5', urgent: false, title: 'Recovery suite walkthrough notes', detail: 'For ROI v3', owner: 'DCR' },
];

export const demo = {
  emails: () => EMAILS,
  email: (id) => EMAILS.find((e) => e.id === id),
  awaiting: () => AWAITING_RESPONSE,
  calendar: () => ({ today: TODAY_SCHEDULE, week: WEEK_CALENDAR }),
  tasks: () => TASKS,
  financials: () => ({ weekly: WEEKLY_FINANCIAL, daily: DAILY_FINANCIAL }),
  reports: () => ({
    weekNumber: WEEK_NUMBER,
    metrics: WEEKLY_METRICS,
    encountersBySpecialty: ENCOUNTERS_BY_SPECIALTY,
    totalEncounters: TOTAL_ENCOUNTERS,
  }),
  dashboard: (view) => ({
    view,
    owner: OWNER,
    dates: DATES,
    weekNumber: WEEK_NUMBER,
    metrics: WEEKLY_METRICS,
    totalEncounters: TOTAL_ENCOUNTERS,
    financialWeek: WEEKLY_FINANCIAL,
    financialDay: DAILY_FINANCIAL,
    schedule: TODAY_SCHEDULE,
    weekCalendar: WEEK_CALENDAR,
    emails: EMAILS,
    awaiting: AWAITING_RESPONSE,
    tasks: TASKS,
    priorityWeek: PRIORITY_WEEK,
    priorityToday: PRIORITY_TODAY,
    awaitingThresholdHours: 48,
  }),
};
