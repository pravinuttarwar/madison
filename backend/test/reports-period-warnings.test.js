// MAD-50 — Reports: block-aware provider parsing, "found but not counted" warnings (PHI-safe),
// real period (no "Week 0"), and Month/Week period extraction. Pure-transform tests — no
// network, no real workbook, synthetic grids modeled on the real monthly-tab/weekly-block shape.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  providerCountsFromGrid,
  reportWarnings,
  periodFromTabs,
  reportsFromGrids,
} from '../src/transforms.js';

// A Provider-Totals grid: two stacked weekly blocks, each DATE → provider rows → TOTAL, with a
// service tally ("allergy") sitting AFTER the block TOTAL (must NOT be a provider) and a stray
// empty label ("Mac", no numbers → silently ignored, not a warning).
const PROVIDER_GRID = [
  ['', 'Mon', 'Tues', 'Wed', 'Thur', 'Fri'],
  ['DATE', 46174, 46175, 46176, 46177, 46178],
  ['Lisa', 21, 18, 15, 34, 29],
  ['Bachman', 13, 11, 16, 23, 29],
  ['TOTAL', 34, 29, 31, 57, 58],
  ['allergy ', 4, 0, 7, 0, 3], // AFTER total → not a provider
  ['', '', '', '', '', ''],
  ['', 'Mon', 'Tues', 'Wed', 'Thur', 'Fri'],
  ['DATE', 46181, 46182, 46183, 46184, 46185],
  ['Lisa', 16, 17, 27, 23, 29],
  ['Bachman', 25, 19, 24, 14, 32],
  ['TOTAL', 41, 36, 51, 37, 61],
  ['allergy', 6, 4, 6, '', 12],
  ['Mac', '', '', '', '', ''], // stray label, no data → ignored, not warned
];

test('[AC-1] providerCountsFromGrid: counts only rows between DATE and TOTAL; after-TOTAL rows excluded', () => {
  const { counts } = providerCountsFromGrid(PROVIDER_GRID);
  // Lisa = (21+18+15+34+29) + (16+17+27+23+29) = 117 + 112 = 229
  assert.equal(counts.lisa.count, 229);
  // Bachman = (13+11+16+23+29) + (25+19+24+14+32) = 92 + 114 = 206
  assert.equal(counts.bachman.count, 206);
  // the after-TOTAL service tally is NOT a provider
  assert.ok(!('allergy' in counts), 'allergy must not be counted as a provider');
  assert.ok(!('mac' in counts), 'a label with no data is not a provider');
});

test('[AC-2] providerCountsFromGrid: surfaces after-TOTAL labels it found-but-did-not-count', () => {
  const { skipped } = providerCountsFromGrid(PROVIDER_GRID);
  const labels = skipped.map((s) => s.label.toLowerCase().trim());
  assert.ok(labels.includes('allergy'), 'allergy is surfaced as not-counted');
  // de-duped across the two blocks (one entry, not two)
  assert.equal(labels.filter((l) => l === 'allergy').length, 1);
});

test('[AC-3] not-counted warnings carry LABELS only — never the cell values', () => {
  const { skipped } = providerCountsFromGrid(PROVIDER_GRID);
  const blob = JSON.stringify(skipped);
  // none of the allergy counts (4,7,6,12) leak into the warning payload
  for (const v of ['4', '7', '6', '12']) {
    // the only numbers allowed are inside label text, not as standalone count fields
    assert.ok(!skipped.some((s) => Object.values(s).includes(v) || Object.values(s).includes(Number(v))),
      `count value ${v} must not appear in a warning`);
  }
  assert.ok(!/"count"|"value"/.test(blob), 'no count/value fields in warnings');
});

test('[AC-2] reportWarnings: merges metric-unmapped + provider-skipped labels, de-duped, labels only', () => {
  const metricUnmapped = [{ row: 5, header: 'Mystery' }, { row: 9, header: 'Mystery' }];
  const providerSkipped = [{ label: 'allergy' }];
  const w = reportWarnings(metricUnmapped, providerSkipped);
  const labels = w.map((x) => x.label.toLowerCase());
  assert.ok(labels.includes('mystery') && labels.includes('allergy'));
  assert.equal(labels.filter((l) => l === 'mystery').length, 1); // de-duped
  assert.ok(!JSON.stringify(w).match(/"row"|"col"|"count"|"value"/), 'references only — no positions/values');
});

test('providerCountsFromGrid: malformed/empty grid → empty, never throws', () => {
  assert.deepEqual(providerCountsFromGrid(null), { counts: {}, skipped: [] });
  assert.deepEqual(providerCountsFromGrid([]), { counts: {}, skipped: [] });
});

test('[AC-4] periodFromTabs: real month labels from the selected tabs (never "Week 0")', () => {
  const now = new Date('2026-06-15T12:00:00Z'); // mid-June
  const p = periodFromTabs('June Totals Madison', 'May Totals Madison', now);
  assert.equal(p.current, 'June 2026');
  assert.equal(p.prior, 'May 2026');
  assert.ok(!/week\s*0/i.test(JSON.stringify(p)));
});

test('[AC-4] periodFromTabs: degrades to the current month when a tab month is unknown (no crash)', () => {
  const now = new Date('2026-06-15T12:00:00Z');
  const p = periodFromTabs(null, null, now);
  assert.equal(p.current, 'June 2026'); // falls back to the practice-zone current month
  assert.equal(p.prior, '');
});

test('[AC-4][AC-6] reportsFromGrids attaches period additively and keeps the existing DTO shape', () => {
  const meta = { period: { current: 'June 2026', prior: 'May 2026' } };
  const dto = reportsFromGrids({ current: { med: 20 }, prior: { med: 18 } }, undefined, meta);
  assert.deepEqual(dto.period, { current: 'June 2026', prior: 'May 2026' });
  // existing shape preserved (back-compat)
  assert.equal(dto.metrics[0].last, 20);
  assert.equal(dto.metrics[0].prior, 18);
  assert.ok('totalEncounters' in dto && 'encountersBySpecialty' in dto);
});
