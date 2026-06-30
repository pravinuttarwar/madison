// MAD-46 — per-provider breakdown. The Provider Totals tabs and Chiro Numbers file use the
// same row-label layout as the metric tabs, but the row labels are PROVIDER names (staff, not
// patient PHI). Parse each provider's encounters, normalize case/whitespace variants, and build
// the additive `providers` section. Pure-unit tests; synthetic data only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  providerCountsFromGrid, mergeProviderCounts, providersSection,
  selectProviderTabs, capMetricTabsToMonth, monthIndexFromTabName,
} from '../src/transforms.js';

// A provider grid as the real Provider Totals / Chiro tabs look: provider row labels, days as
// columns, a Totals column (excluded), a TOTAL subtotal row, stacked weekly blocks.
const PROVIDER_GRID = [
  ['', 'Mon', 'Tues', 'Wed', 'Totals'],
  ['DATE', 45663, 45664, 45665, ''],
  ['Romano', 9, 6, 2, 17],
  ['Gunn ', 24, 20, 34, 78],     // trailing space → same provider as "Gunn"
  ['DeRosa', 22, 23, 41, 86],
  ['TOTAL', 55, 49, 77, 181],    // subtotal row → excluded
  ['', '', '', '', ''],
  ['', 'Mon', 'Tues', 'Wed', 'Totals'], // BLOCK 2
  ['DATE', 45670, 45671, '', ''],
  ['Romano', 9, 6, 0, 15],       // same provider, next week → accumulates
  ['Gunn', 10, 0, 0, 10],        // "Gunn" (no space) merges with "Gunn "
];

test('[AC-1] providerCountsFromGrid sums each provider across stacked blocks; TOTAL + Totals col excluded', () => {
  const counts = providerCountsFromGrid(PROVIDER_GRID);
  assert.equal(counts.romano.count, 32);  // (9+6+2) + (9+6) = 17 + 15
  assert.equal(counts.derosa.count, 86);  // 22+23+41
  assert.equal(counts.romano.name, 'Romano');
  // the TOTAL subtotal row never becomes a provider
  assert.ok(!('total' in counts));
});

test('[AC-2] case/whitespace variants merge to one provider (Gunn / "Gunn ")', () => {
  const counts = providerCountsFromGrid(PROVIDER_GRID);
  assert.equal(counts.gunn.count, 88);   // (24+20+34) + 10 = 78 + 10
  assert.equal(counts.gunn.name, 'Gunn'); // canonical display (trimmed)
});

test('[AC-4] mergeProviderCounts + providersSection → sorted name/current/prior rows', () => {
  const current = mergeProviderCounts([
    providerCountsFromGrid(PROVIDER_GRID),
    { osman: { name: 'Osman', count: 5 } },
  ]);
  const prior = { romano: { name: 'Romano', count: 20 }, gunn: { name: 'Gunn', count: 70 } };
  const section = providersSection(current, prior);
  // sorted by current encounters desc
  assert.equal(section[0].name, 'Gunn');
  assert.equal(section[0].current, 88);
  assert.equal(section[0].prior, 70);
  // a provider with no prior reads 0, never undefined
  const osman = section.find((p) => p.name === 'Osman');
  assert.equal(osman.current, 5);
  assert.equal(osman.prior, 0);
});

test('[AC-1] a malformed/empty grid yields no providers, never throws', () => {
  assert.deepEqual(providerCountsFromGrid(null), {});
  assert.deepEqual(providerCountsFromGrid([['', 'Mon', 'Totals']]), {});
});

// ── [AC-2] selectProviderTabs matches the real "Provier" misspelling ───────────
test('[AC-2] selectProviderTabs picks Provider Totals incl. the real "Provier" typo, excludes metric/microsoft tabs', () => {
  const tabs = selectProviderTabs([
    'June Totals Madison', 'June Provier Totals ', 'May Provider Totals ', 'microsoft.com:RD',
  ]);
  assert.deepEqual(tabs, ['June Provier Totals ', 'May Provider Totals ']);
});

// ── [AC-3] provider tabs are calendar-capped to the current month ──────────────
test('[AC-3] capMetricTabsToMonth applies to provider tabs — future months excluded', () => {
  const provTabs = ['April Provider Totals ', 'May Provider Totals ', 'June Provier Totals ', 'July Provider Totals '];
  const kept = capMetricTabsToMonth(provTabs, new Date('2026-06-30T18:00:00Z')); // June ET
  assert.ok(!kept.some((t) => /july/i.test(t)), 'July (future) excluded');
  assert.ok(kept.some((t) => /june/i.test(t)), 'June (current) kept');
});

// ── [AC-5] the Chiro file (no Provider Totals tabs) falls back to its month tabs ─
test('[AC-5] a Chiro-style file has no Provider Totals tabs, so its month tabs are the provider source', () => {
  const chiroNames = ['Oct', 'Nov', 'dec', 'Jan 26', 'June 26', 'microsoft.com:RD'];
  assert.deepEqual(selectProviderTabs(chiroNames), []); // no "Provider Totals" tabs
  // the route's fallback: month-named tabs are the provider data
  const monthTabs = chiroNames.filter((n) => monthIndexFromTabName(n) != null && !n.startsWith('microsoft'));
  assert.deepEqual(monthTabs, ['Oct', 'Nov', 'dec', 'Jan 26', 'June 26']);
  // and the chiropractor grid parses by provider
  const chiroGrid = [['', 'Mon', 'Totals'], ['DATE', 46174, ''], ['Romano', 9, 9], ['Gunn', 24, 24]];
  const counts = providerCountsFromGrid(chiroGrid);
  assert.equal(counts.romano.count, 9);
  assert.equal(counts.gunn.count, 24);
});

// ── [AC-6] the breakdown carries names + counts only — no cell-value leakage ────
test('[AC-6] providersSection exposes only provider name + aggregate counts (staff, not patient PHI)', () => {
  const section = providersSection(
    { gunn: { name: 'Gunn', count: 88 } },
    { gunn: { name: 'Gunn', count: 70 } },
  );
  assert.deepEqual(Object.keys(section[0]).sort(), ['current', 'name', 'prior']);
  // aggregate counts only — no per-day cell values, no raw URL, no patient identifiers
  assert.equal(typeof section[0].current, 'number');
  assert.ok(!/@|sharepoint|http/i.test(JSON.stringify(section)));
});
