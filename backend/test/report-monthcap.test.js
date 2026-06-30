// MAD-45 — calendar-capped month selection. The connected current-role workbook is the
// current YEAR, so "is this tab a future month?" is just a month comparison in the practice
// zone. Excludes future-month tabs (the phantom-December bug) before the latest-with-data
// scan. Pure-unit tests; synthetic data only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  monthIndexFromTabName, monthInZone, capMetricTabsToMonth,
  countsFromGrid, reportsFromGrids,
} from '../src/transforms.js';

// A row-label month grid as the real Totals-Madison tabs look (metrics in col A, days across).
const MONTH_GRID = [
  ['', 'Mon', 'Tues', 'Wed', 'Totals'],
  ['Med', 10, 12, 8, 30],
  ['Chiro', 5, 6, 4, 15],
  ['Sprained Wombat', 9, 0, 0, 9], // unknown label → surfaced by reference, not counted
];

test('[AC-1] monthIndexFromTabName reads the month from a (messy) tab name', () => {
  assert.equal(monthIndexFromTabName('January Totals Madison'), 0);
  assert.equal(monthIndexFromTabName('Janurary Totals Madison'), 0); // real misspelling
  assert.equal(monthIndexFromTabName('May Totals Madison'), 4);
  assert.equal(monthIndexFromTabName('AugustTotals Madison'), 7);    // no space in the real file
  assert.equal(monthIndexFromTabName('December Totals Madison'), 11);
  assert.equal(monthIndexFromTabName('Provider Totals'), null);      // no month → null
});

// ── [AC-4] timezone-correct month boundary (DST/offset matrix) ─────────────────
test('[AC-4] monthInZone computes the month in the practice zone (America/New_York), not UTC', () => {
  // 2026-07-01 02:00 UTC = 2026-06-30 22:00 ET → still JUNE in the practice zone.
  assert.equal(monthInZone(new Date('2026-07-01T02:00:00Z')), 5);
  // 2026-07-01 12:00 UTC = 08:00 ET → JULY.
  assert.equal(monthInZone(new Date('2026-07-01T12:00:00Z')), 6);
  // DST month boundary: 2026-11-01 03:00 UTC = 2026-10-31 23:00 ET → still OCTOBER.
  assert.equal(monthInZone(new Date('2026-11-01T03:00:00Z')), 9);
  assert.equal(monthInZone(new Date('2026-11-01T12:00:00Z')), 10); // 07:00 ET → November
  // explicit-zone, independent of the host TZ
  assert.equal(monthInZone(new Date('2026-07-01T02:00:00Z'), 'UTC'), 6); // UTC sees July
});

// ── [AC-1] cap excludes future months (the December-noise fix) ─────────────────
const YEAR_TABS = [
  'January Totals Madison', 'February Totals Madison', 'March Totals Madison',
  'April Totals Madison', 'May Totals Madison', 'June Totals Madison',
  'July Totals Madison', 'AugustTotals Madison', 'September Totals Madison',
  'October Totals Madison', 'November Totals Madison', 'December Totals Madison',
];

test('[AC-1] capMetricTabsToMonth keeps only months up to the current one (future months excluded)', () => {
  // On 2026-06-30 (ET) → keep Jan–June; Jul–Dec (incl. the phantom Dec) are dropped.
  const kept = capMetricTabsToMonth(YEAR_TABS, new Date('2026-06-30T18:00:00Z'));
  assert.deepEqual(kept.map(monthIndexFromTabName), [0, 1, 2, 3, 4, 5]);
  assert.ok(!kept.some((t) => /december/i.test(t)), 'December (future) is excluded');
});

test('[AC-3] the current month tab is KEPT (not dropped) — emptiness is handled later by latest-with-data', () => {
  // On 2026-07-15 → July is current, kept (even if empty); the backward latest-with-data scan
  // then falls to June when July has no data yet. The cap only removes FUTURE months (Aug–Dec).
  const kept = capMetricTabsToMonth(YEAR_TABS, new Date('2026-07-15T18:00:00Z'));
  assert.ok(kept.some((t) => /july/i.test(t)), 'current month (July) is kept');
  assert.ok(!kept.some((t) => /august/i.test(t)), 'next month (August) excluded');
});

// ── [AC-2] the APP does the calculation from the owner's existing month tabs ───
test('[AC-2] the selected month grid is summed by the app (no owner-maintained summary needed)', () => {
  const { counts } = countsFromGrid(MONTH_GRID); // app sums the day columns per metric
  assert.equal(counts.med, 30);   // 10+12+8 (Totals column excluded)
  assert.equal(counts.chiro, 15);
});

// ── [AC-5] the capped/parsed path feeds the unchanged report DTO ───────────────
test('[AC-5] reportsFromGrids over the selected counts yields the byte-compatible DTO (MAD-43 renders it)', () => {
  const dto = reportsFromGrids({ current: countsFromGrid(MONTH_GRID).counts, prior: { med: 25, chiro: 12 } });
  assert.deepEqual(Object.keys(dto).sort(), ['encountersBySpecialty', 'metrics', 'totalEncounters', 'weekNumber']);
  const med = dto.metrics.find((m) => m.key === 'med');
  assert.equal(med.last, 30);
  assert.equal(med.prior, 25);
});

// ── [AC-6] unmapped labels surface PHI-safely (reference only, no cell values) ──
test('[AC-6] an unknown row label is surfaced by reference only — never a cell value', () => {
  const { unmapped } = countsFromGrid(MONTH_GRID);
  const wombat = unmapped.find((u) => /wombat/i.test(u.header));
  assert.ok(wombat);
  assert.ok(!('value' in wombat), 'no cell value on the reference');
  assert.equal(JSON.stringify(wombat).includes('9'), false); // the wombat day value (9) never surfaces
});
