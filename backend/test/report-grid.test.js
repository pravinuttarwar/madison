// MAD-27 — tolerant workbook grid parser + normalization (Strategy A). Pure-unit tests for
// the parser that replaces the named-range read path: dirty free-typed Totals/Provider grids
// → canonical metric counts → the /api/reports DTO. Synthetic data only (no real PHI).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mapHeader, countsFromGrid, mergeCounts, reportsFromGrids, REPORT_METRICS,
  selectMetricTabs, pickPeriodTabs,
} from '../src/transforms.js';
import { usedRangeAddress } from '../src/graph.js';

// ── [AC-4] external links are read as CACHED values, never resolved ────────────
test('[AC-4] usedRangeAddress requests cached values only (valuesOnly=true), encodes the tab', () => {
  const addr = usedRangeAddress('/drives/d1/items/i9', 'June Provier Totals ');
  assert.match(addr, /usedRange\(valuesOnly=true\)/); // cached values → external links not resolved
  assert.match(addr, /June%20Provier%20Totals%20/);   // sheet name URL-encoded
  assert.match(addr, /\$select=values/);
});

// A dirty Totals-Madison-style grid: row 0 = headers (mixed case/spacing + a combined
// IV/MA col + an unknown col), rows = days with blanks and a free-typed new-patients note.
const DIRTY_GRID = [
  ['DATE', 'Med', 'Chiro', 'Accu', 'IV & MA', 'Sprained Wombat'],
  ['Mon', 10, 5, 2, 4, 1],
  ['Tues', '', 3, '', 'x', 2],   // blank + non-numeric tolerated
  ['Wed', 7, 'New Patients: 4', 1, 6, 3],
];

// ── [AC-2] header normalization / aliasing ────────────────────────────────────
test('[AC-2] case + spacing + punctuation variants collapse to one canonical key', () => {
  // Each group is the dirty real-world spelling → the single canonical key it must resolve to.
  const groups = {
    med: ['Med', 'med', 'MED '],
    pt: ['PT', 'PT&OT', 'PT OT', 'PT/OT', 'pt&ot'],
    // AC-2: the combined AND split IV/MA columns all collapse to ONE key (else double-count).
    ivMa: ['IV', 'MA', 'IV & MA', 'IV and MA', 'MA IV', 'MA/IV', 'IV/MA', 'IV&MA'],
    acu: ['ACU', 'Acu', 'Accu', 'acu '],
    mo: ['MO', 'Mo', 'mo', 'MO '],
    allergy: ['Allergy', 'allergy', 'Allegy', 'Allergy '],
    covid: ['Covid Test', 'Covid test', 'covid'],
  };
  for (const [canonical, variants] of Object.entries(groups)) {
    for (const v of variants) {
      assert.equal(mapHeader(v).key, canonical, `"${v}" → ${canonical}`);
    }
  }
});

test('[AC-2] structural headers are ignored (skipped, not surfaced as unmapped)', () => {
  for (const h of ['DATE', 'Total', 'TOTAL', 'Totals', 'Mon', 'Tues', 'Sun', '', '  ']) {
    assert.equal(mapHeader(h).ignored, true, `"${h}" is structural/ignored`);
  }
});

test('[AC-2] an unrecognized header is unmapped (surfaced), never throws', () => {
  const r = mapHeader('Sprained Wombat');
  assert.equal(r.unmapped, true);
  assert.equal(r.key, undefined);
});

// ── [AC-1][AC-7] tolerant single-grid parse ───────────────────────────────────
test('[AC-1][AC-7] countsFromGrid sums metric columns, tolerates blanks/non-numeric, never throws', () => {
  const { counts } = countsFromGrid(DIRTY_GRID);
  assert.equal(counts.med, 17);        // 10 + (blank) + 7
  assert.equal(counts.chiro, 8);       // 5 + 3 + (non-numeric "New Patients..." → 0)
  assert.equal(counts.acu, 3);         // 2 + (blank) + 1
  assert.equal(counts.ivMa, 10);       // 4 + (non-numeric "x") + 6
  assert.equal(counts.newPatients, 4); // parsed from the free-typed cell
});

test('[AC-2][AC-9] countsFromGrid surfaces unknown columns as references (index+header), no cell values', () => {
  const { unmapped } = countsFromGrid(DIRTY_GRID);
  assert.equal(unmapped.length, 1);
  assert.equal(unmapped[0].col, 5);
  assert.equal(unmapped[0].header, 'Sprained Wombat');
  // the reference carries no day/cell value (e.g. the "3" under that column)
  assert.ok(!('value' in unmapped[0]));
});

test('[AC-7] a malformed / empty grid yields empty counts, never throws', () => {
  assert.deepEqual(countsFromGrid(null).counts, {});
  assert.deepEqual(countsFromGrid([]).counts, {});
  assert.deepEqual(countsFromGrid([['DATE', 'Med']]).counts, {}); // headers only, no body
});

// ── [AC-3] aggregate across tabs + files ──────────────────────────────────────
test('[AC-3] mergeCounts sums count-maps across tabs/files', () => {
  const merged = mergeCounts([{ med: 10, chiro: 5 }, { med: 3, pod: 2 }, null]);
  assert.deepEqual(merged, { med: 13, chiro: 5, pod: 2 });
});

// ── [AC-6] DTO byte-compatibility with reportsFromRanges ──────────────────────
test('[AC-6] reportsFromGrids emits the week-over-week DTO shape (no optional keys)', () => {
  const dto = reportsFromGrids({ current: { med: 20, chiro: 10 }, prior: { med: 18, chiro: 9 } });
  assert.deepEqual(Object.keys(dto).sort(), ['encountersBySpecialty', 'metrics', 'totalEncounters', 'weekNumber']);
  const med = dto.metrics.find((m) => m.key === 'med');
  assert.deepEqual(med, { key: 'med', label: 'Medical', last: 20, prior: 18 });
  assert.equal(dto.totalEncounters.last, 30);
  assert.equal(dto.totalEncounters.prior, 27);
  // no additive keys when those periods are absent (back-compat)
  assert.ok(!('yearAgo' in dto.totalEncounters));
  assert.ok(!('monthToDate' in dto.totalEncounters));
  // metrics follow the canonical REPORT_METRICS order
  assert.equal(dto.metrics[0].key, REPORT_METRICS[0].key);
});

test('[AC-6] reportsFromGrids adds additive yearAgo (YoY) + monthToDate/prevMonth (MoM) when supplied', () => {
  const dto = reportsFromGrids({
    current: { med: 20 }, prior: { med: 18 },
    yearAgo: { med: 15 },
    monthToDate: { med: 80 }, prevMonth: { med: 86 },
  });
  const med = dto.metrics.find((m) => m.key === 'med');
  assert.equal(med.yearAgo, 15);
  assert.equal(med.monthToDate, 80);
  assert.equal(med.prevMonth, 86);
  assert.equal(dto.totalEncounters.yearAgo, 15);
  assert.equal(dto.totalEncounters.monthToDate, 80);
  assert.equal(dto.totalEncounters.prevMonth, 86);
  assert.equal(dto.encountersBySpecialty[0].yearAgo, 15);
});

// ── [AC-1][AC-3] tab selection (the real workbooks' messy tab names) ───────────
const REAL_PN_TABS = [
  'January Totals Madison', 'Janurary Provider Totals',
  'February Totals Madison', 'February Provier Totals',
  'AugustTotals Madison', 'August Provider Totals ',
  'December Totals Madison', 'December Provider Totals',
  'microsoft.com:RD', 'microsoft.com:LAMBDA_WF', // defined-name/externalLink artifacts
];

test('[AC-1] selectMetricTabs keeps only Totals-Madison tabs (tolerant of misspelling/spacing)', () => {
  const tabs = selectMetricTabs(REAL_PN_TABS);
  assert.deepEqual(tabs, [
    'January Totals Madison', 'February Totals Madison', 'AugustTotals Madison', 'December Totals Madison',
  ]);
  // provider tabs and microsoft.com:* artifacts are excluded
  assert.ok(!tabs.some((t) => /provi|microsoft\.com:/i.test(t)));
});

test('[AC-3] pickPeriodTabs takes the last two metric tabs in workbook order (current, prior)', () => {
  assert.deepEqual(
    pickPeriodTabs(['January Totals Madison', 'February Totals Madison', 'December Totals Madison']),
    { current: 'December Totals Madison', prior: 'February Totals Madison' },
  );
  // a single tab → current only, no prior
  assert.deepEqual(pickPeriodTabs(['January Totals Madison']), { current: 'January Totals Madison', prior: null });
  assert.deepEqual(pickPeriodTabs([]), { current: null, prior: null });
});
