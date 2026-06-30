// MAD-51 — Reports Month/Week toggle: the WEEKLY-block half. The monthly workbook tabs hold
// stacked weekly blocks (a weekday-header row → DATE serials → metric/provider rows → TOTAL).
// MAD-50 sums a whole month; this proves we can split a tab into its weekly blocks, sum each
// block independently, and label the week from the block's DATE serials via UTC components
// (zone-independent — no TZ conversion). Pure functions, synthetic data only, no network/creds.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  splitWeeklyBlocks, weeklyPeriodFromBlocks, countsFromGrid, providerCountsFromGrid,
  weeklyReportSection, reportWarnings,
} from '../src/transforms.js';

// Excel date serials (1899-12-30 epoch): 46188 = 2026-06-15 (Mon), 46195 = 2026-06-22 (Mon).
const W1 = [46188, 46189, 46190, 46191, 46192, 46193, 46194]; // week of Jun 15 (prior)
const W2 = [46195, 46196, 46197, 46198, 46199, 46200, 46201]; // week of Jun 22 (current)
const HDR = ['', 'Mon', 'Tues', 'Wed', 'Thur', 'Fri', 'Sat', 'Sun', 'Totals'];
const mrow = (label, v) => [label, v, 0, 0, 0, 0, 0, 0, v]; // value in Mon; Totals col excluded

// A month tab with TWO stacked weekly blocks. Block 1 (Jun 15) then block 2 (Jun 22, latest).
const TWO_BLOCK_GRID = [
  HDR, ['DATE', ...W1, ''], mrow('Med', 70), mrow('Chiro', 34), ['TOTAL', 0, 0, 0, 0, 0, 0, 0, 0],
  HDR, ['DATE', ...W2, ''], mrow('Med', 50), mrow('Chiro', 30), ['TOTAL', 0, 0, 0, 0, 0, 0, 0, 0],
];

// [AC-1] a month tab splits into its weekly blocks; each block sums independently and the LATEST
// block (current week) differs from the whole-month sum.
test('[AC-1] splitWeeklyBlocks splits a tab into weekly blocks, latest block sums independently', () => {
  const blocks = splitWeeklyBlocks(TWO_BLOCK_GRID);
  assert.equal(blocks.length, 2, 'two stacked weekly blocks');
  // each block carries its own DATE serials (the week-start lives in dateSerials)
  assert.deepEqual(blocks[0].dateSerials, W1);
  assert.deepEqual(blocks[1].dateSerials, W2);

  // whole-month sum (MAD-50 behavior) = both blocks combined
  const monthMed = countsFromGrid(TWO_BLOCK_GRID).counts.med;
  assert.equal(monthMed, 120, 'whole-month Med = 70 + 50');

  // per-block sums are independent — the latest week (block 2) is NOT the whole-month total
  const week2 = countsFromGrid(blocks[1].rows).counts;
  const week1 = countsFromGrid(blocks[0].rows).counts;
  assert.equal(week2.med, 50, 'current week Med');
  assert.equal(week1.med, 70, 'prior week Med');
  assert.notEqual(week2.med, monthMed, 'a single week differs from the whole-month sum');
});

// [AC-1] a grid with NO weekday-header/DATE rows yields no weekly blocks (graceful — drives the
// "weekly absent" path at the route).
test('[AC-1] a grid without weekly blocks yields none', () => {
  assert.deepEqual(splitWeeklyBlocks([['DATE', 'Med']]), []);
  assert.deepEqual(splitWeeklyBlocks(null), []);
  assert.deepEqual(splitWeeklyBlocks([]), []);
});

// [AC-3] the weekly PERIOD label is derived from the block's DATE serials via UTC components —
// "Week of Jun 22 vs Jun 15", identical under any host/browser timezone (the gate runs under a
// hostile clock; the function uses Date.UTC + getUTC* so the day never shifts across a zone).
test('[AC-3] weeklyPeriodFromBlocks labels the week from DATE serials (UTC, zone-independent)', () => {
  const period = weeklyPeriodFromBlocks(W2, W1);
  assert.deepEqual(period, { current: 'Week of Jun 22', prior: 'Week of Jun 15' });
  // no prior block → prior label empty (a lone current week still labels)
  assert.deepEqual(weeklyPeriodFromBlocks(W2, []), { current: 'Week of Jun 22', prior: '' });
});

// [AC-2] providers are summed PER WEEK BLOCK too — the latest block is the current week, and the
// after-TOTAL service-tally row is still excluded (warned, never miscounted as a provider).
test('[AC-2] provider counts are computed per weekly block, after-TOTAL rows excluded', () => {
  const provBlock1 = [
    ['', 'Mon', 'Tues', 'Totals'], ['DATE', 46188, 46189, ''],
    ['Lisa', 20, 0, 20], ['TOTAL', 0, 0, 0], ['allergy', 5, 0, 5], // allergy AFTER total → not a provider
  ];
  const provBlock2 = [
    ['', 'Mon', 'Tues', 'Totals'], ['DATE', 46195, 46196, ''],
    ['Lisa', 30, 0, 30], ['TOTAL', 0, 0, 0],
  ];
  const blocks = splitWeeklyBlocks([...provBlock1, ...provBlock2]);
  assert.equal(blocks.length, 2);
  const week2 = providerCountsFromGrid(blocks[1].rows);
  const week1 = providerCountsFromGrid(blocks[0].rows);
  assert.equal(week2.counts.lisa.count, 30, 'current-week Lisa');
  assert.equal(week1.counts.lisa.count, 20, 'prior-week Lisa');
  assert.ok(!week1.counts.allergy, 'after-TOTAL allergy is NOT a provider');
  assert.ok(week1.skipped.some((s) => s.label.toLowerCase() === 'allergy'), 'allergy surfaced as skipped');
});

// [AC-4] the additive `weekly` section carries the same shape as the monthly report (period,
// metrics, encountersBySpecialty, totalEncounters [+ providers]) — built from the week blocks.
test('[AC-4] weeklyReportSection builds the additive weekly view from the current/prior blocks', () => {
  const section = weeklyReportSection({
    current: { med: 50, chiro: 30 },
    prior: { med: 70, chiro: 34 },
    currentSerials: W2,
    priorSerials: W1,
    providers: [{ name: 'Lisa', current: 30, prior: 20 }],
  });
  assert.deepEqual(section.period, { current: 'Week of Jun 22', prior: 'Week of Jun 15' });
  const med = section.metrics.find((m) => m.key === 'med');
  assert.equal(med.last, 50, 'weekly current Med');
  assert.equal(med.prior, 70, 'weekly prior Med');
  assert.equal(section.totalEncounters.last, 80, '50 + 30');
  assert.equal(section.encountersBySpecialty.length, 2);
  assert.deepEqual(section.providers, [{ name: 'Lisa', current: 30, prior: 20 }]);
  // weekly is its own section — it does not carry the deprecated weekNumber field
  assert.ok(!('weekNumber' in section));
});

// [AC-1] correctness (surfaced by the weekly fixtures): a "New Patients: N" row IS counted via the
// free-text scan, so it must NOT be surfaced as a "found but not counted" warning. (Pre-MAD-51 it
// leaked into the warnings list.)
test('[AC-1] a "New Patients: N" row is counted, never surfaced as a not-counted warning', () => {
  const grid = [
    ['', 'Mon', 'Totals'],
    ['DATE', 46195, ''],
    ['Med', 10, 10],
    ['New Patients: 8', ''], // counted by the free-text scan → not an "unmapped" row
  ];
  const { counts, unmapped } = countsFromGrid(grid);
  assert.equal(counts.newPatients, 8, 'New Patients counted');
  assert.ok(!unmapped.some((u) => /new patient/i.test(u.header)), 'newPatients row not surfaced as unmapped');
  assert.deepEqual(reportWarnings(unmapped, []), [], 'no not-counted warning for the newPatients row');
});

// [AC-5] no current week block → no weekly section (null), so the route omits `weekly` and the
// monthly report is untouched.
test('[AC-5] weeklyReportSection returns null when there is no current week block', () => {
  assert.equal(weeklyReportSection({ current: {}, prior: {} }), null);
  assert.equal(weeklyReportSection({}), null);
  assert.equal(weeklyReportSection(), null);
});
