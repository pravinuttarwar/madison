// MAD-52 — connect a per-YEAR workbook for year-over-year. Connections are keyed by year:
// upsert-by-year (re-connecting a year replaces only that year), and the report picks the
// LATEST connected year as current and the next-latest as the prior-year (YoY) source.
// Pure/unit + temp-file persistence — no network, synthetic location refs only.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  saveWorkbook, readWorkbooks, workbookRefs, resolveYearSources, isYearConnected, connectWorkbook,
} from '../src/workbook.js';

function tmpFile() {
  const dir = mkdtempSync(join(tmpdir(), 'mad52-'));
  return join(dir, 'workbook.json');
}

test('[AC-1][AC-4] saveWorkbook persists a per-year ref; upsert-by-year replaces only that year', () => {
  const file = tmpFile();
  saveWorkbook({ driveId: 'd', itemId: 'i2026', name: '2026.xlsx', source: 'share-url', year: 2026 }, file);
  saveWorkbook({ driveId: 'd', itemId: 'i2025', name: '2025.xlsx', source: 'drive-path', year: 2025 }, file);
  assert.equal(readWorkbooks(file).length, 2, 'both years persisted side-by-side');

  // re-connecting 2026 REPLACES the 2026 entry only — never duplicates, never touches 2025.
  saveWorkbook({ driveId: 'd', itemId: 'i2026b', name: '2026b.xlsx', source: 'share-url', year: 2026 }, file);
  const all = readWorkbooks(file);
  assert.equal(all.length, 2);
  const byYear = Object.fromEntries(all.map((w) => [w.year, w]));
  assert.equal(byYear[2026].itemId, 'i2026b');
  assert.equal(byYear[2025].itemId, 'i2025');
  // location refs only — never cell values
  assert.ok(!JSON.stringify(all).match(/cellValues|values":\s*\[\[/));
  rmSync(file, { force: true });
});

test('[AC-4] resolveYearSources: latest year = current, next-latest = prior-year (regardless of connect order)', () => {
  const sources = resolveYearSources([
    { driveId: 'd', itemId: 'i2024', name: '2024.xlsx', year: 2024 },
    { driveId: 'd', itemId: 'i2026', name: '2026.xlsx', year: 2026 },
    { driveId: 'd', itemId: 'i2025', name: '2025.xlsx', year: 2025 },
  ]);
  assert.equal(sources.current.itemId, 'i2026'); // newest year is current
  assert.equal(sources.prevYear.itemId, 'i2025'); // next-newest is the YoY comparison
});

test('[AC-3] resolveYearSources: a single connected year → current only, no prior-year (no YoY)', () => {
  const sources = resolveYearSources([{ driveId: 'd', itemId: 'i', name: '2026.xlsx', year: 2026 }]);
  assert.equal(sources.current.itemId, 'i');
  assert.equal(sources.prevYear, null);
});

test('[AC-2] isYearConnected: true only when a workbook for that exact year is already persisted', () => {
  const file = tmpFile();
  saveWorkbook({ driveId: 'd', itemId: 'i', name: '2026.xlsx', source: 'share-url', year: 2026 }, file);
  assert.equal(isYearConnected(2026, file), true);
  assert.equal(isYearConnected(2025, file), false);
  rmSync(file, { force: true });
});

test('[AC-5] connect audit carries the year + item reference, never the share-URL/token', async () => {
  const audits = [];
  const result = await connectWorkbook('https://contoso.sharepoint.com/x.xlsx?e=secrettoken', {
    resolveShareUrl: async () => ({ driveId: 'd', itemId: 'item-9', name: '2025.xlsx' }),
    resolveDrivePath: async () => ({ driveId: 'd', itemId: 'item-9', name: 'x' }),
    workbookReachable: async () => true,
    audit: (action, meta) => audits.push([action, meta]),
    save: (rec) => ({ ...rec }),
    year: 2025,
  });
  assert.equal(result.year, 2025);
  const validate = audits.find(([a]) => a === 'validate')[1];
  assert.equal(validate.year, 2025);
  assert.equal(validate.ref, 'item-9');
  // never the raw share-URL or its token
  const blob = JSON.stringify(audits);
  assert.doesNotMatch(blob, /secrettoken/);
  assert.doesNotMatch(blob, /sharepoint/);
});

test('[AC-1] persisted record carries the year and only location refs (no cell values)', () => {
  const file = tmpFile();
  saveWorkbook({ driveId: 'd', itemId: 'i', name: '2026.xlsx', source: 'share-url', year: 2026 }, file);
  const rec = readWorkbooks(file)[0];
  assert.equal(rec.year, 2026);
  assert.deepEqual(Object.keys(rec).sort(), ['connectedAt', 'driveId', 'itemId', 'name', 'source', 'year']);
  // workbookRefs exposes the year to the route
  assert.equal(workbookRefs(file)[0].year, 2026);
  rmSync(file, { force: true });
});
