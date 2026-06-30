// MAD-44 — deterministic reporting from a designated "Command Center" summary tab. The owner
// maintains one fixed-layout table (metric label | this period | last period | [year ago]); we
// read it as-is — no orientation detection, no tab-selection, no month/date guessing. Pure-unit
// tests for the parser. Synthetic data only (no real PHI).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summaryPeriods, reportsFromGrids } from '../src/transforms.js';

// A summary grid as Graph's usedRange returns it: a header row + metric rows. Labels use the
// published names; an unknown row ("Sprained Wombat") must be surfaced, not mis-assigned.
const SUMMARY = [
  ['Metric', 'This period', 'Last period', 'Year ago'],
  ['Medical', 120, 110, 100],
  ['Chiro', 64, 60, 55],
  ['Podiatry', 20, 18, 16],
  ['PT / OT', 30, 28, 25],
  ['IV / MA', 40, 36, 33],
  ['Acupuncture', 12, 10, 9],
  ['Sprained Wombat', 9, 9, 9], // unknown label → surfaced, never counted
  ['New patients', 31, 20, 18],
];

test('[AC-1][AC-2] summaryPeriods maps published labels to canonical metrics, current/prior straight from the cells', () => {
  const { current, prior, unmapped } = summaryPeriods(SUMMARY);
  assert.equal(current.med, 120);
  assert.equal(prior.med, 110);
  assert.equal(current.pt, 30);       // "PT / OT" → pt
  assert.equal(current.ivMa, 40);     // "IV / MA" → ivMa
  assert.equal(current.acu, 12);      // "Acupuncture" → acu
  assert.equal(current.newPatients, 31);
  // the header row and the unknown label are NOT metrics
  assert.ok(!('metric' in current));
  assert.ok(unmapped.some((u) => /wombat/i.test(u.label)), 'unknown label surfaced');
  assert.ok(!Object.values(current).includes(9), 'the wombat value (9) is never counted');
});

test('[AC-3] year-ago column → additive yearAgo per metric + summed total (via reportsFromGrids)', () => {
  const { current, prior, yearAgo } = summaryPeriods(SUMMARY);
  assert.equal(yearAgo.med, 100);
  const dto = reportsFromGrids({ current, prior, yearAgo });
  const med = dto.metrics.find((m) => m.key === 'med');
  assert.equal(med.last, 120);
  assert.equal(med.prior, 110);
  assert.equal(med.yearAgo, 100);
  assert.equal(dto.totalEncounters.yearAgo, dto.metrics.reduce((s, m) => s + m.yearAgo, 0));
});

test('[AC-3] no year-ago column → period-over-period only (no yearAgo key)', () => {
  const noYoY = SUMMARY.map((r) => r.slice(0, 3));
  const { current, prior, yearAgo } = summaryPeriods(noYoY);
  assert.deepEqual(yearAgo, {});
  const dto = reportsFromGrids({ current, prior, yearAgo: Object.keys(yearAgo).length ? yearAgo : undefined });
  assert.ok(!('yearAgo' in dto.totalEncounters));
  assert.ok(dto.metrics.every((m) => !('yearAgo' in m)));
});

test('[AC-6] unmapped surfacing carries the metric LABEL reference only — never a cell value (PHI-safe)', () => {
  const { unmapped } = summaryPeriods(SUMMARY);
  const wombat = unmapped.find((u) => /wombat/i.test(u.label));
  assert.ok(wombat);
  // only the typed label is surfaced; the row's values (9) are never in the reference
  assert.deepEqual(Object.keys(wombat), ['label']);
  assert.ok(!JSON.stringify(unmapped).includes('9'), 'no cell values in the unmapped references');
});

test('[AC-5] feeds the unchanged report DTO (so MAD-43 Reports renders); deterministic, no date input', () => {
  const { current, prior, yearAgo } = summaryPeriods(SUMMARY);
  const dto = reportsFromGrids({ current, prior, yearAgo });
  // byte-compatible DTO shape the frontend already renders
  assert.deepEqual(Object.keys(dto).sort(), ['encountersBySpecialty', 'metrics', 'totalEncounters', 'weekNumber']);
  assert.equal(dto.metrics[0].key, 'med');
  assert.ok(dto.encountersBySpecialty.length === 6);
  // pure + clock-independent: same input → same output (no date math anywhere in the path)
  const again = reportsFromGrids(summaryPeriods(SUMMARY));
  assert.deepEqual(dto, again);
});

test('[AC-1] malformed/empty summary degrades to empty periods, never throws', () => {
  assert.deepEqual(summaryPeriods(null), { current: {}, prior: {}, yearAgo: {}, unmapped: [] });
  assert.deepEqual(summaryPeriods([['Metric', 'This', 'Last']]).current, {}); // header only
});
