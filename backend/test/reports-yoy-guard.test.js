// MAD-55 — year-over-year correctness through the LIVE route (spawns the real server with fixtures
// + an isolated WORKBOOK_CONFIG_PATH). Proves: (AC-3) two DIFFERENT files give a real non-zero YoY;
// (AC-4) the SAME file connected for both years suppresses YoY with an explanatory note — never a
// silent same-file zero. Synthetic data only, no network/creds.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFixtures, FIXTURE_ENV } from './fixtures/generate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '../src/server.js');

let child; let base; let fixturesDir; let workbookConfig;

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on('error', reject);
    srv.listen(0, () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  });
}
async function waitForHealth(url, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { const res = await fetch(`${url}/health`); if (res.ok) return; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('server did not become healthy in time');
}
const getJson = async (p) => { const r = await fetch(`${base}${p}`); return { status: r.status, body: await r.json() }; };
const postJson = async (p, payload) => {
  const r = await fetch(`${base}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  return { status: r.status, body: await r.json() };
};

before(async () => {
  fixturesDir = mkdtempSync(path.join(tmpdir(), 'madison-yoyguard-'));
  writeFixtures(fixturesDir, new Date());
  workbookConfig = path.join(fixturesDir, 'state', 'workbook.json');
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env, ...FIXTURE_ENV, DEMO_MODE: '',
      // No env prior-year path here — YoY must come from the CONNECTIONS only, so the guard is exercised.
      SPREADSHEET_PREV_YEAR_DRIVE_PATH: '',
      FIXTURES_DIR: fixturesDir, WORKBOOK_CONFIG_PATH: workbookConfig,
      PORT: String(port), FRONTEND_DIST: '/nonexistent',
    },
    stdio: 'ignore',
  });
  await waitForHealth(base);
});
after(() => { if (child) child.kill(); if (fixturesDir) rmSync(fixturesDir, { recursive: true, force: true }); });

// [AC-3] two DIFFERENT workbooks (a 2026 file + a 2025 file that resolves to a distinct item with
// genuinely different numbers) → YoY is real and NON-ZERO (yearAgo ≠ current).
test('[AC-3] two different-year files → a real, non-zero year-over-year', async () => {
  await postJson('/api/reports/connection', { input: '/Reports/2026.xlsx', year: 2026 }); // → item-9 (current)
  await postJson('/api/reports/connection', { input: '/Reports/2025.xlsx', year: 2025 }); // → distinct prior-year item
  const { status, body } = await getJson('/api/reports');
  assert.equal(status, 200);
  const med = body.metrics.find((m) => m.key === 'med');
  assert.equal(typeof med.yearAgo, 'number', 'YoY present');
  assert.notEqual(med.yearAgo, med.last, 'prior-year value differs from this year (not a same-file 0)');
  assert.ok(!/same workbook/i.test(body.yoyNote || ''), 'no same-file note when the files differ');
});

// [AC-4] the SAME workbook connected for BOTH years → YoY suppressed + an explanatory note (this is
// the exact live bug: the 2026 file was registered as the 2025 source too).
test('[AC-4] same file for both years → YoY suppressed with a clear note', async () => {
  // Re-connect the SAME file (a path with no year marker → the same item) for both 2026 and 2025.
  await postJson('/api/reports/connection', { input: '/Reports/book.xlsx', year: 2026 });
  await postJson('/api/reports/connection', { input: '/Reports/book.xlsx', year: 2025 });
  const { status, body } = await getJson('/api/reports');
  assert.equal(status, 200);
  assert.ok(!body.metrics.some((m) => 'yearAgo' in m), 'no per-metric yearAgo when the same file is both years');
  assert.ok(!('yearAgo' in body.totalEncounters), 'no total YoY');
  assert.match(body.yoyNote || '', /same workbook is connected for both/i);
});
