// MAD-49 — deterministic weekday-column anchoring. Live verification found Reports showing
// Covid prior = 4709: the real `May Totals Madison` `Covid test` row is 0 across Mon–Sun but
// carries a stray value in an out-of-grid column (and note text in another). The parser summed
// every numeric cell, so the stray landed in Covid. Fix: sum ONLY the columns under a weekday
// header. Pure-unit tests; synthetic data modeled on the real row shape.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countsFromGrid } from '../src/transforms.js';

// The real shape: 9 grid columns (label + Mon–Sun + Totals), then stray cells in columns with
// NO weekday header — a note in col J (index 9) and a stray number in col K (index 10).
const STRAY_COL_GRID = [
  ['',           'Mon', 'Tues', 'Wed', 'Thur', 'Fri', 'Sat', 'Sun', 'Totals'],
  ['DATE',       45663, 45664, 45665, 45666, 45667, 45668, 45669, ''],
  ['Med',        10, 12, 8, 9, 11, 0, 0, 50],
  ['Covid test', 0, 0, 0, 0, 0, 0, 0, 0, '6 tests no kits', 4709], // J=note, K=4709 (out of grid)
];

test('[AC-2] a stray value outside the Mon–Sun grid is NOT counted (Covid 4709 → 0)', () => {
  const { counts } = countsFromGrid(STRAY_COL_GRID);
  assert.equal(counts.covid, 0, 'the stray K=4709 must not be summed into Covid');
});

test('[AC-1] only weekday-headed columns are summed (Med = Mon..Sun, Totals + stray cols excluded)', () => {
  const { counts } = countsFromGrid(STRAY_COL_GRID);
  assert.equal(counts.med, 50); // 10+12+8+9+11 (+0+0); the Totals column (50) is not double-counted
});

// ── [AC-3] back-compat: a clean stacked grid still yields the same metric values ───
const CLEAN_GRID = [
  ['',      'Mon', 'Tues', 'Wed', 'Thur', 'Fri', 'Sat', 'Sun', 'Totals'],
  ['Med',   10, 12, 8, 0, 0, 0, 0, 30],
  ['Chiro', 5, 6, 4, 0, 0, 0, 0, 15],
  ['IV',    2, 1, 0, 0, 0, 0, 0, 3],
];
test('[AC-3] existing clean tabs are unchanged — only out-of-grid cells were ever the problem', () => {
  const { counts } = countsFromGrid(CLEAN_GRID);
  assert.equal(counts.med, 30);
  assert.equal(counts.chiro, 15);
  assert.equal(counts.ivMa, 3);
});

// ── [AC-4] no weekday-header row → fall back to old summation (never silently zero) ─
const NO_HEADER_GRID = [
  ['Med', 5, 3],   // no Mon..Sun header anywhere
  ['Chiro', 2, 1],
];
test('[AC-4] a row-label grid with no weekday header falls back to all-non-Totals (no zeroing)', () => {
  const { counts } = countsFromGrid(NO_HEADER_GRID);
  assert.equal(counts.med, 8);   // 5+3 — fallback, not 0
  assert.equal(counts.chiro, 3); // 2+1
});

// ── [AC-5] PHI-safe: the stray value never appears in the parser output ────────────
test('[AC-5] the stray out-of-grid value is never surfaced in counts or unmapped', () => {
  const result = countsFromGrid(STRAY_COL_GRID);
  assert.equal(result.counts.covid, 0);
  assert.equal(JSON.stringify(result).includes('4709'), false); // the stray value leaks nowhere
});
