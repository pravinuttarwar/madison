// MAD-53 — normalized per-year/month/week report model. Each connected workbook is parsed ONCE
// into a clean structure so every view (monthly / WoW / MoM / YoY) is a simple lookup instead of an
// ad-hoc per-view tab scan. Pure functions, synthetic data only — no network, no creds, no PHI.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildYearModel, reportsFromGrids, assembleReportDTO } from '../src/transforms.js';

// A current-year (2026) model: May + June populated, June has two weekly blocks.
const CUR_MODEL = {
  year: 2026,
  months: {
    4: { label: 'May', metrics: { med: 110, chiro: 60 }, providers: { lisa: { name: 'Lisa', count: 45 } },
      weeks: [{ startSerial: 46153, label: 'May 18', metrics: { med: 55, chiro: 30 }, providers: { lisa: { name: 'Lisa', count: 22 } } }], warnings: [] },
    5: { label: 'June', metrics: { med: 120, chiro: 64 }, providers: { lisa: { name: 'Lisa', count: 50 } },
      weeks: [
        { startSerial: 46188, label: 'Jun 15', metrics: { med: 70, chiro: 34 }, providers: { lisa: { name: 'Lisa', count: 20 } } },
        { startSerial: 46195, label: 'Jun 22', metrics: { med: 50, chiro: 30 }, providers: { lisa: { name: 'Lisa', count: 30 } } },
      ], warnings: [{ label: 'Sprained Wombat' }] },
  },
};
// A prior-year (2025) model: June (the SAME month, full) AND a later sparse December tab. The OLD
// code picked the file's latest tab (December) — the bug. YoY must use June 2025.
const PRIOR_FULL = {
  year: 2025,
  months: {
    5: { label: 'June', metrics: { med: 100, chiro: 55 }, providers: {}, weeks: [], warnings: [] },
    11: { label: 'December', metrics: { med: 5 }, providers: {}, weeks: [], warnings: [] },
  },
};
const JUNE_2026 = new Date('2026-06-30T12:00:00Z'); // monthInZone(ET) = June (5)

// Excel serials: 46188 = 2026-06-15 (week 1), 46195 = 2026-06-22 (week 2, latest).
const HDR = ['', 'Mon', 'Tues', 'Totals'];
const mrow = (l, v) => [l, v, 0, v]; // value in Mon col; Totals col excluded by the day-anchored sum

// A month metric tab with TWO weekly blocks (w1 then w2). A stray "Sprained Wombat" row in week 1 is
// unmapped → a not-counted warning for that month.
const metricGrid = (w1, w2) => [
  HDR, ['DATE', 46188, 46189, ''], mrow('Med', w1.med), mrow('Chiro', w1.chiro), ['Sprained Wombat', 9, 0, 9], ['TOTAL', 0, 0, 0],
  HDR, ['DATE', 46195, 46196, ''], mrow('Med', w2.med), mrow('Chiro', w2.chiro), ['TOTAL', 0, 0, 0],
];
// A provider tab with two weekly blocks; "allergy" sits AFTER week 1's TOTAL → not a provider (warned).
const providerGrid = (w1, w2) => [
  HDR, ['DATE', 46188, 46189, ''], ['Lisa', w1.lisa, 0, w1.lisa], ['TOTAL', 0, 0, 0], ['allergy', 5, 0, 5],
  HDR, ['DATE', 46195, 46196, ''], ['Lisa', w2.lisa, 0, w2.lisa], ['TOTAL', 0, 0, 0],
];

const JUNE_W1 = { med: 70, chiro: 34, lisa: 20 };
const JUNE_W2 = { med: 50, chiro: 30, lisa: 30 };

function juneModel() {
  return buildYearModel({
    year: 2026,
    metricTabs: [{ name: 'June Totals Madison', grid: metricGrid(JUNE_W1, JUNE_W2) }],
    providerTabs: [{ name: 'June Provider Totals', grid: providerGrid(JUNE_W1, JUNE_W2) }],
  });
}

// [AC-1] one parse → a per-year model keyed by month, each month carrying its metric totals,
// provider totals, the weekly blocks, and its own warnings.
test('[AC-1] buildYearModel produces a per-year/month/week structure from a workbook', () => {
  const model = juneModel();
  assert.equal(model.year, 2026);
  const june = model.months[5]; // 0-indexed → June
  assert.ok(june, 'June present at month index 5');
  assert.equal(june.label, 'June');

  // month totals = sum of the two weekly blocks (Totals column excluded)
  assert.equal(june.metrics.med, 120, '70 + 50');
  assert.equal(june.metrics.chiro, 64, '34 + 30');
  assert.equal(june.providers.lisa.count, 50, '20 + 30');
});

// [AC-1] the month carries its weekly blocks in chronological order, each labeled + summed.
test('[AC-1] each month carries its weekly blocks (label + per-week metrics + providers)', () => {
  const june = juneModel().months[5];
  assert.equal(june.weeks.length, 2);
  assert.deepEqual(june.weeks.map((w) => w.label), ['Jun 15', 'Jun 22']);
  assert.equal(june.weeks[0].metrics.med, 70, 'week 1 Med');
  assert.equal(june.weeks[1].metrics.med, 50, 'week 2 (latest) Med');
  assert.equal(june.weeks[0].providers.lisa.count, 20, 'week 1 provider');
  assert.equal(june.weeks[1].providers.lisa.count, 30, 'week 2 provider');
});

// [AC-1][AC-5] each month carries its OWN not-counted warnings (labels only, no values) — the
// unmapped metric row + the after-TOTAL provider row.
test('[AC-1] each month carries its own not-counted warnings (labels only)', () => {
  const june = juneModel().months[5];
  const labels = june.warnings.map((w) => w.label.toLowerCase());
  assert.ok(labels.includes('sprained wombat'), 'unmapped metric label');
  assert.ok(labels.includes('allergy'), 'after-TOTAL provider row');
  for (const w of june.warnings) assert.deepEqual(Object.keys(w), ['label']); // references only
  assert.ok(!/\b9\b|\b5\b/.test(JSON.stringify(june.warnings)), 'no cell values leak');
});

// [AC-3] a metric ABSENT from the prior-year period gets NO yearAgo (renders "—"), not a fake
// "current − 0" delta; and a PARTIAL prior-year sheet yields no total YoY (not apples-to-apples).
test('[AC-3] yearAgo only for metrics present in the prior-year period; partial → no total YoY', () => {
  const dto = reportsFromGrids({
    current: { med: 100, chiro: 60 },
    prior: { med: 90, chiro: 55 },
    yearAgo: { med: 80 }, // chiro ABSENT in the prior-year sheet
  });
  assert.equal(dto.metrics.find((m) => m.key === 'med').yearAgo, 80, 'present metric keeps yearAgo');
  assert.equal(dto.metrics.find((m) => m.key === 'chiro').yearAgo, undefined, 'absent metric → no fake +60');
  assert.ok(!('yearAgo' in dto.totalEncounters), 'partial coverage → total YoY omitted');
});

// [AC-3] full prior-year coverage still yields per-metric + total yearAgo (unchanged for the good case).
test('[AC-3] full prior-year coverage yields per-metric + total yearAgo', () => {
  const dto = reportsFromGrids({
    current: { med: 100, chiro: 60 }, prior: { med: 90, chiro: 55 },
    yearAgo: { med: 80, chiro: 50 },
  });
  assert.equal(dto.metrics.find((m) => m.key === 'med').yearAgo, 80);
  assert.equal(dto.metrics.find((m) => m.key === 'chiro').yearAgo, 50);
  assert.equal(dto.totalEncounters.yearAgo, 130, '80 + 50');
});

// [AC-2] YoY compares the SAME month a year ago (June 2026 vs June 2025) — NOT the prior-year
// file's latest tab (December). This is the core fix for the +4118% garbage.
test('[AC-2] assembleReportDTO uses the same month a year ago for YoY (not the latest prior-year tab)', () => {
  const dto = assembleReportDTO({ currentModel: CUR_MODEL, priorYearModel: PRIOR_FULL, now: JUNE_2026 });
  const med = dto.metrics.find((m) => m.key === 'med');
  const chiro = dto.metrics.find((m) => m.key === 'chiro');
  assert.equal(med.yearAgo, 100, 'June 2025 Med (100), not December (5)');
  assert.equal(chiro.yearAgo, 55, 'June 2025 Chiro');
  assert.equal(dto.totalEncounters.yearAgo, 155, 'full coverage → total YoY = 100 + 55');
});

// [AC-4] every view is assembled from the one model: monthly (this month vs prior month), the
// additive weekly (WoW) section, providers, and the real period label.
test('[AC-4] assembleReportDTO builds monthly + weekly + providers from the model', () => {
  const dto = assembleReportDTO({ currentModel: CUR_MODEL, priorYearModel: PRIOR_FULL, now: JUNE_2026 });
  assert.deepEqual(dto.period, { current: 'June 2026', prior: 'May 2026' });
  const med = dto.metrics.find((m) => m.key === 'med');
  assert.equal(med.last, 120, 'this month (June)');
  assert.equal(med.prior, 110, 'prior month (May)');
  // weekly (WoW): latest week vs prior week, from June's blocks
  assert.ok(dto.weekly, 'weekly section present');
  assert.deepEqual(dto.weekly.period, { current: 'Week of Jun 22', prior: 'Week of Jun 15' });
  assert.equal(dto.weekly.metrics.find((m) => m.key === 'med').last, 50, 'current-week Med');
  // providers (this month vs last)
  assert.ok(Array.isArray(dto.providers) && dto.providers.some((p) => p.name === 'Lisa'));
  // the current month's own warnings surface
  assert.ok(dto.warnings.some((w) => /wombat/i.test(w.label)));
});

// [AC-6] a PARTIAL prior-year same-month tab (missing metrics) → no fake deltas, no total YoY, and
// a note telling the user the prior-year sheet is incomplete.
test('[AC-6] partial prior-year coverage surfaces a note and suppresses the total YoY', () => {
  const priorPartial = { year: 2025, months: { 5: { label: 'June', metrics: { med: 100 }, providers: {}, weeks: [], warnings: [] } } };
  const dto = assembleReportDTO({ currentModel: CUR_MODEL, priorYearModel: priorPartial, now: JUNE_2026 });
  assert.equal(dto.metrics.find((m) => m.key === 'med').yearAgo, 100, 'present metric keeps YoY');
  assert.equal(dto.metrics.find((m) => m.key === 'chiro').yearAgo, undefined, 'absent metric → no fake delta');
  assert.ok(!('yearAgo' in dto.totalEncounters), 'no total YoY on partial coverage');
  assert.ok(dto.yoyNote && /prior-year/i.test(dto.yoyNote), 'a partial-YoY note is surfaced');
});

// [AC-2] no prior-year model at all → no YoY anywhere (monthly report intact).
test('[AC-2] no prior-year model → no YoY, monthly report intact', () => {
  const dto = assembleReportDTO({ currentModel: CUR_MODEL, priorYearModel: null, now: JUNE_2026 });
  assert.ok(!dto.metrics.some((m) => 'yearAgo' in m), 'no yearAgo without a prior-year model');
  assert.ok(!dto.yoyNote, 'no partial note when YoY was never attempted');
  assert.equal(dto.metrics.find((m) => m.key === 'med').last, 120);
});

// ── MAD-54: month picker + non-zero-month default ─────────────────────────────
// A current-year model where the current calendar month (July) has columns but a ZERO total (the
// live sheet on the 1st: tab present, no encounters yet). Default must skip it → June.
const CUR_EMPTY_JULY = {
  year: 2026,
  months: {
    4: { label: 'May', metrics: { med: 110 }, providers: {}, weeks: [], warnings: [] },
    5: {
      label: 'June', metrics: { med: 120 }, providers: {},
      weeks: [
        { startSerial: 46188, label: 'Jun 15', metrics: { med: 70 }, providers: {} },
        { startSerial: 46195, label: 'Jun 22', metrics: { med: 50 }, providers: {} },
      ], warnings: [],
    },
    6: { label: 'July', metrics: { med: 0, chiro: 0 }, providers: {}, weeks: [{ startSerial: 46234, label: 'Jul 1', metrics: { med: 0 }, providers: {} }], warnings: [] },
  },
};
const JULY_1 = new Date('2026-07-01T12:00:00Z'); // monthInZone(ET) = July (6)

// [AC-1] the empty current month (July, zero total) is skipped → default is June (latest non-zero).
test('[AC-1] default skips an empty current month, falling back to the latest month with data', () => {
  const dto = assembleReportDTO({ currentModel: CUR_EMPTY_JULY, priorYearModel: null, now: JULY_1 });
  assert.deepEqual(dto.period, { current: 'June 2026', prior: 'May 2026' });
  assert.equal(dto.metrics.find((m) => m.key === 'med').last, 120);
  assert.equal(dto.selectedMonth, '2026-06');
});

// [AC-2] the DTO lists the workbook's months (latest first) with hasData, and echoes selectedMonth.
test('[AC-2] availableMonths (latest first, with hasData) + selectedMonth are on the DTO', () => {
  const dto = assembleReportDTO({ currentModel: CUR_EMPTY_JULY, priorYearModel: null, now: JULY_1 });
  assert.deepEqual(dto.availableMonths.map((m) => m.key), ['2026-07', '2026-06', '2026-05']);
  const july = dto.availableMonths.find((m) => m.key === '2026-07');
  assert.equal(july.label, 'July 2026');
  assert.equal(july.hasData, false);
  assert.equal(dto.availableMonths.find((m) => m.key === '2026-06').hasData, true);
  assert.equal(dto.selectedMonth, '2026-06');
});

// [AC-3] an explicit month selection shows THAT month (even the empty one) vs its prior month.
test('[AC-3] explicit month=2026-07 shows July (empty) vs June', () => {
  const dto = assembleReportDTO({ currentModel: CUR_EMPTY_JULY, priorYearModel: null, now: JULY_1, month: '2026-07' });
  assert.deepEqual(dto.period, { current: 'July 2026', prior: 'June 2026' });
  assert.equal(dto.metrics.find((m) => m.key === 'med').last, 0);
  assert.equal(dto.selectedMonth, '2026-07');
});

// [AC-3] an unknown month key falls back to the default.
test('[AC-3] an unknown month key falls back to the default month', () => {
  const dto = assembleReportDTO({ currentModel: CUR_EMPTY_JULY, priorYearModel: null, now: JULY_1, month: '2026-12' });
  assert.equal(dto.selectedMonth, '2026-06');
});

// ── MAD-55: Total excludes New patients; same-file YoY guard ──────────────────
// [AC-1] "New patients" is a descriptor (a subset count), not an encounter type — it must NOT be
// summed into Total Encounters, though it still shows as its own metric row.
test('[AC-1] Total Encounters excludes the New patients descriptor', () => {
  const dto = reportsFromGrids({
    current: { med: 100, chiro: 50, newPatients: 20 },
    prior: { med: 90, chiro: 40, newPatients: 10 },
    yearAgo: { med: 80, chiro: 30, newPatients: 5 },
  });
  assert.ok(dto.metrics.find((m) => m.key === 'newPatients'), 'New patients still a visible metric row');
  assert.equal(dto.totalEncounters.last, 150, '100 + 50 (NOT + 20)');
  assert.equal(dto.totalEncounters.prior, 130, '90 + 40 (NOT + 10)');
  assert.equal(dto.totalEncounters.yearAgo, 110, '80 + 30 (NOT + 5)');
});
