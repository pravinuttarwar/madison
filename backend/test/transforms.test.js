// Timezone characterization for the Graph/QuickBooks → DTO transforms (MBI-26).
// The practice is in America/New_York; these assertions are pinned to that zone so
// they're deterministic regardless of the host/CI zone. The test:backend script also
// exports TZ=America/New_York; this line keeps the file correct when run directly.
process.env.TZ = 'America/New_York';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { financialsFromQbo, outstandingInvoicesFromQbo, cashFlowFromQbo, calendarFromGraph, tasksFromGraph, emailsFromGraph, reportsFromRanges } from '../src/transforms.js';

// ── MAD-29: year-over-year reporting comparison (thin additive on named ranges) ──
const RV = { newPatients: [[22, 18]], medicalSeen: [[284, 271]] }; // { key: [[last, prior]] }

test('[AC-1] reportsFromRanges adds yearAgo per metric + a summed total when prior-year ranges are present', () => {
  const prevYear = { newPatients: [[15]], medicalSeen: [[250]] }; // { key: [[yearAgo]] }
  const r = reportsFromRanges(RV, {}, prevYear);
  const byKey = Object.fromEntries(r.metrics.map((m) => [m.key, m]));
  assert.equal(byKey.newPatients.yearAgo, 15);
  assert.equal(byKey.medicalSeen.yearAgo, 250);
  // existing WoW fields untouched
  assert.equal(byKey.newPatients.last, 22);
  assert.equal(byKey.newPatients.prior, 18);
  // total year-ago is the sum
  assert.equal(r.totalEncounters.yearAgo, 265);
});

test('[AC-3] reportsFromRanges omits yearAgo entirely when no prior-year ranges (back-compat)', () => {
  const r = reportsFromRanges(RV, {}); // no third arg
  for (const m of r.metrics) assert.ok(!('yearAgo' in m), 'no yearAgo on metric');
  assert.ok(!('yearAgo' in r.totalEncounters), 'no yearAgo on total');
  // unchanged WoW shape
  assert.equal(r.totalEncounters.last, 22 + 284);
});

test('[AC-4] encountersBySpecialty rows carry yearAgo when prior-year is present', () => {
  const prevYear = { newPatients: [[15]], medicalSeen: [[250]] };
  const r = reportsFromRanges(RV, {}, prevYear);
  for (const row of r.encountersBySpecialty) assert.equal(typeof row.yearAgo, 'number');
  assert.equal(r.encountersBySpecialty[0].yearAgo, 15);
});

// ── MAD-25: cash-flow overview (derived inflow/outflow/net) ───────────────────
// now = 2026-06-25 (Thu) ET → financePeriods: lastWeek 06-15..06-21, priorWeek
// 06-08..06-14, mtd 06-01..06-25. Cash in = deposits, cash out = ALL purchases
// (incl. fixed-cost accounts), net = in − out — over each window in the practice zone.
const CF_NOW = new Date('2026-06-25T12:00:00Z'); // 08:00 ET on 2026-06-25
const CF_DEPOSITS = [
  { TxnDate: '2026-06-17', TotalAmt: 5000 }, // last week
  { TxnDate: '2026-06-10', TotalAmt: 3000 }, // prior week
  { TxnDate: '2026-06-03', TotalAmt: 1000 }, // MTD only (neither week)
];
const CF_PURCHASES = [
  { TxnDate: '2026-06-18', TotalAmt: 1200, AccountRef: { value: '99' } }, // last week, FIXED account
  { TxnDate: '2026-06-19', TotalAmt: 800, AccountRef: { value: '5' } },   // last week, variable
  { TxnDate: '2026-06-11', TotalAmt: 600, AccountRef: { value: '5' } },   // prior week
  { TxnDate: '2026-06-02', TotalAmt: 400, AccountRef: { value: '5' } },   // MTD only
];

test('[AC-2] cash-flow inflow/outflow/net over last/prior week + MTD windows (practice zone)', () => {
  const cf = cashFlowFromQbo(CF_DEPOSITS, CF_PURCHASES, CF_NOW);
  assert.deepEqual(cf.weekly.inflow, { last: 5000, prior: 3000 });
  assert.deepEqual(cf.weekly.outflow, { last: 2000, prior: 600 }); // 1200 fixed + 800 var
  assert.deepEqual(cf.weekly.net, { last: 3000, prior: 2400 });
  assert.deepEqual(cf.mtd, { inflow: 9000, outflow: 3000, net: 6000 });
});

test('[AC-3] cash-flow outflow INCLUDES fixed-cost purchases (distinct from variable spend)', () => {
  const cf = cashFlowFromQbo(CF_DEPOSITS, CF_PURCHASES, CF_NOW);
  // last-week outflow is 2000 (fixed 1200 + variable 800); dropping the fixed one would be 800.
  assert.equal(cf.weekly.outflow.last, 2000);
  // sanity: variable-only financials excludes the fixed account → its spend differs.
  const { weekly } = financialsFromQbo(CF_DEPOSITS, CF_PURCHASES, ['99'], CF_NOW);
  assert.notEqual(weekly.variableSpend.last, cf.weekly.outflow.last);
});

test('[AC-4] cash-flow degrades to zeroed inflow/outflow/net for empty/missing input (never throws)', () => {
  for (const [d, p] of [[[], []], [undefined, undefined], [null, null]]) {
    const cf = cashFlowFromQbo(d, p, CF_NOW);
    assert.deepEqual(cf.weekly.inflow, { last: 0, prior: 0 });
    assert.deepEqual(cf.weekly.outflow, { last: 0, prior: 0 });
    assert.deepEqual(cf.weekly.net, { last: 0, prior: 0 });
    assert.deepEqual(cf.mtd, { inflow: 0, outflow: 0, net: 0 });
  }
});

// ── MAD-24: outstanding-invoice tracking / A/R aging (aggregate-only) ──────────
// 2026-06-25 is a Thursday in EDT. QBO Invoice carries a date-only DueDate (company-local
// calendar date) + a Balance; CustomerRef may be a patient name (PHI) and must NEVER
// surface — the DTO is aggregate-only.

test('[AC-2][AC-4] outstanding invoices: totals/count exclude fully-paid; aggregate-only (no customer names)', () => {
  const now = new Date('2026-06-25T16:00:00Z'); // 12:00 ET
  const invoices = [
    { Balance: 1200, DueDate: '2026-06-20', CustomerRef: { name: 'Jane Patient' } },
    { Balance: 800, DueDate: '2026-06-24', CustomerRef: { name: 'John Patient' } },
    { Balance: 0, DueDate: '2026-05-01', CustomerRef: { name: 'Paid Patient' } }, // excluded (Balance 0)
  ];
  const r = outstandingInvoicesFromQbo(invoices, now);
  assert.equal(r.openCount, 2);
  assert.equal(r.totalOutstanding, 2000);
  // aggregate-only: no customer/patient names or per-invoice identifiers anywhere in the DTO.
  assert.ok(!JSON.stringify(r).includes('Patient'), 'DTO must not carry customer/patient names');
});

test('[AC-3] A/R aging buckets by days-past-due (practice zone, DST-correct) sum to total', () => {
  const now = new Date('2026-06-25T16:00:00Z'); // 12:00 ET (EDT)
  const invoices = [
    { Balance: 100, DueDate: '2026-07-10' }, // not yet due → Current
    { Balance: 200, DueDate: '2026-06-10' }, // 15 days → 1–30
    { Balance: 300, DueDate: '2026-05-10' }, // 46 days → 31–60
    { Balance: 400, DueDate: '2026-04-10' }, // 76 days → 61–90
    { Balance: 500, DueDate: '2026-01-10' }, // 166 days, spans the 2026-03-08 DST switch → 90+
  ];
  const r = outstandingInvoicesFromQbo(invoices, now);
  const amt = Object.fromEntries(r.aging.map((a) => [a.bucket, a.amount]));
  assert.equal(amt['Current'], 100);
  assert.equal(amt['1–30'], 200);
  assert.equal(amt['31–60'], 300);
  assert.equal(amt['61–90'], 400);
  assert.equal(amt['90+'], 500); // rounding absorbs the DST day-length drift (no off-by-one)
  // the five buckets partition the outstanding total exactly.
  assert.equal(r.aging.reduce((s, a) => s + a.amount, 0), r.totalOutstanding);
  assert.equal(r.aging.length, 5);
});

test('[AC-5] outstanding invoices degrade to a zeroed snapshot for empty/missing/malformed input (never throws)', () => {
  const now = new Date('2026-06-25T16:00:00Z');
  for (const input of [[], undefined, null, [{}], [{ Balance: 'not-a-number' }]]) {
    const r = outstandingInvoicesFromQbo(input, now);
    assert.equal(r.totalOutstanding, 0);
    assert.equal(r.openCount, 0);
    assert.equal(r.aging.length, 5);
    assert.equal(r.aging.reduce((s, a) => s + a.amount + a.count, 0), 0);
  }
});

// [AC-7] Email receivedDateTime (UTC instant) renders in the practice zone (ET), not UTC —
// including the date-boundary case where the ET wall-clock falls on the previous calendar
// day. 2026-03-15T02:30Z is 2026-03-14 22:30 in America/New_York (EDT, UTC-4). The label
// must read "Mar 14 · 22:30", proving the conversion is zone-correct and DST-aware (this
// date is after the 2026-03-08 DST switch). Pinned to ET, deterministic on any host clock.
test('[AC-7] email time renders in the practice zone with a correct UTC→ET date shift', () => {
  const out = emailsFromGraph([
    { id: 'tz', receivedDateTime: '2026-03-15T02:30:00Z', from: { emailAddress: { address: 'x@y.example' } } },
  ]);
  assert.equal(out[0].time, 'Mar 14 · 22:30');
});

// 2026-06-24 is a Wednesday. QBO TxnDate is a date-only string in the company's
// local zone — it must bucket under Wed, not roll back a day via UTC-midnight parsing.
test('QBO deposit (date-only TxnDate) buckets to the correct ET weekday', () => {
  const deposits = [{ TxnDate: '2026-06-24', TotalAmt: 1000, DepositToAccountRef: { name: 'Operating' } }];
  const now = new Date('2026-06-25T12:00:00Z');
  const { weekly } = financialsFromQbo(deposits, [], [], now);
  assert.deepEqual(weekly.depositsByDay, [{ day: 'WED', amount: 1000 }]);
});

// At 23:00 ET on 2026-06-25, "yesterday" is 2026-06-24 in the practice zone — but the
// UTC date of (now - 24h) is 2026-06-25. The window must use the practice-zone date so
// the true previous day's deposit is picked up (not an off-by-one).
test("yesterday-deposit window uses the practice-zone date (no off-by-one near midnight)", () => {
  const deposits = [
    { TxnDate: '2026-06-24', TotalAmt: 1000, DepositToAccountRef: { name: 'Operating' } },
    { TxnDate: '2026-06-20', TotalAmt: 5000, DepositToAccountRef: { name: 'Operating' } },
  ];
  const now = new Date('2026-06-26T03:00:00Z'); // 2026-06-25 23:00 America/New_York
  const { daily } = financialsFromQbo(deposits, [], [], now);
  assert.equal(daily.depositYesterday.total, 1000);
  assert.equal(daily.depositYesterday.posted, '2026-06-24');
});

// 2026-06-25T02:00:00Z is 2026-06-24 22:00 in ET — the UTC date (25th) and the ET day
// (Wed 24th) disagree. The calendar `date` must reflect the ET day so it agrees with
// the `day` label and the displayed time.
test('calendar date + day are both derived in the practice zone (no UTC/local split)', () => {
  const events = [{ start: { dateTime: '2026-06-25T02:00:00Z' }, subject: 'Late meeting' }];
  const { week } = calendarFromGraph(events);
  assert.equal(week[0].day, 'WED');
  assert.equal(week[0].date, '2026-06-24');
  assert.equal(week[0].events[0].time, '22:00');
});

// Both render 09:00 ET from DIFFERENT UTC instants — 13:00Z in summer (EDT, UTC-4) and
// 14:00Z in winter (EST, UTC-5) — proving the offset tracks DST (no fixed ±4/±5).
test('event display time is ET wall-clock and DST-correct', () => {
  const summer = calendarFromGraph([{ start: { dateTime: '2026-06-24T13:00:00Z' }, subject: 'Summer 9am' }]);
  assert.equal(summer.week[0].events[0].time, '09:00'); // EDT

  const winter = calendarFromGraph([{ start: { dateTime: '2026-01-15T14:00:00Z' }, subject: 'Winter 9am' }]);
  assert.equal(winter.week[0].events[0].time, '09:00'); // EST
});

// To Do dues are all-day calendar dates (midnight). A task due TODAY must read
// 'due-today', not 'overdue' just because midnight has passed — compare by the
// practice-zone calendar date, not the instant.
test('To Do task due today (practice zone) is due-today, not overdue', () => {
  const now = new Date('2026-06-25T18:00:00Z'); // 14:00 ET on 2026-06-25
  const todo = [{ id: 'x1', title: 'Due today', dueDateTime: { dateTime: '2026-06-25T00:00:00.0000000', timeZone: 'UTC' } }];
  const [task] = tasksFromGraph(todo, now);
  assert.equal(task.status, 'due-today');
});

test('To Do task status by practice-zone calendar date (overdue / due-today / upcoming / done)', () => {
  const now = new Date('2026-06-25T18:00:00Z'); // 2026-06-25 ET
  const todo = [
    { id: 'o', title: 'Yesterday', dueDateTime: { dateTime: '2026-06-24T00:00:00.0000000', timeZone: 'UTC' } },
    { id: 't', title: 'Today', dueDateTime: { dateTime: '2026-06-25T00:00:00.0000000', timeZone: 'UTC' } },
    { id: 'u', title: 'Tomorrow', dueDateTime: { dateTime: '2026-06-26T00:00:00.0000000', timeZone: 'UTC' } },
    { id: 'd', title: 'Finished', status: 'completed', dueDateTime: { dateTime: '2026-06-24T00:00:00.0000000', timeZone: 'UTC' } },
  ];
  const byId = Object.fromEntries(tasksFromGraph(todo, now).map((t) => [t.id, t.status]));
  assert.equal(byId.o, 'overdue');
  assert.equal(byId.t, 'due-today');
  assert.equal(byId.u, 'upcoming');
  assert.equal(byId.d, 'done');
});

// The displayed due date is the calendar date, even when the dueDateTime carries a Z
// (UTC) — slicing the date part avoids the all-day off-by-one that UTC→ET would cause.
test('To Do due date displays the calendar date (no off-by-one for an all-day UTC due)', () => {
  const now = new Date('2026-06-20T18:00:00Z');
  const todo = [{ id: 'z', title: 'All-day UTC', dueDateTime: { dateTime: '2026-06-25T00:00:00Z', timeZone: 'UTC' } }];
  const [task] = tasksFromGraph(todo, now);
  assert.equal(task.due, 'Jun 25');
});

// Microsoft Graph returns calendar times as a ZONELESS dateTime plus a separate
// timeZone field (UTC by default — no trailing Z). The transform must combine the two
// into the correct instant, not let new Date() assume the process-local zone.
test('Graph zoneless dateTime + timeZone field is read as the stated zone, then shown in ET', () => {
  const events = [{ start: { dateTime: '2026-06-24T13:00:00.0000000', timeZone: 'UTC' }, subject: 'Real Graph shape' }];
  const { week } = calendarFromGraph(events);
  assert.equal(week[0].events[0].time, '09:00'); // 13:00 UTC → 09:00 EDT, NOT 13:00 local
  assert.equal(week[0].date, '2026-06-24');
});
