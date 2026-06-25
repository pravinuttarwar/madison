// Timezone characterization for the Graph/QuickBooks → DTO transforms (MBI-26).
// The practice is in America/New_York; these assertions are pinned to that zone so
// they're deterministic regardless of the host/CI zone. The test:backend script also
// exports TZ=America/New_York; this line keeps the file correct when run directly.
process.env.TZ = 'America/New_York';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { financialsFromQbo, calendarFromGraph } from '../src/transforms.js';

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

// Microsoft Graph returns calendar times as a ZONELESS dateTime plus a separate
// timeZone field (UTC by default — no trailing Z). The transform must combine the two
// into the correct instant, not let new Date() assume the process-local zone.
test('Graph zoneless dateTime + timeZone field is read as the stated zone, then shown in ET', () => {
  const events = [{ start: { dateTime: '2026-06-24T13:00:00.0000000', timeZone: 'UTC' }, subject: 'Real Graph shape' }];
  const { week } = calendarFromGraph(events);
  assert.equal(week[0].events[0].time, '09:00'); // 13:00 UTC → 09:00 EDT, NOT 13:00 local
  assert.equal(week[0].date, '2026-06-24');
});
