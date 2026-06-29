// MAD-23 — Revenue visibility (Financials). Accrual-basis Total Income from the QBO
// ProfitAndLoss report, surfaced as an ADDITIVE `revenue` field on /api/financials.
// The practice is in America/New_York; period windows are pinned to that zone so the
// assertions are deterministic regardless of the host/CI clock (matches transforms.test.js).
process.env.TZ = 'America/New_York';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { incomeFromProfitAndLoss, financePeriods } from '../src/transforms.js';
import { writeFixtures, FIXTURE_ENV } from './fixtures/generate.js';

const SERVER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/server.js');

// A realistic QBO ProfitAndLoss report shape: an "Income" section whose Summary row
// carries the "Total Income" figure in the last column. Synthetic — no real data.
const PNL = {
  Header: { ReportName: 'ProfitAndLoss', ReportBasis: 'Accrual' },
  Rows: {
    Row: [
      {
        group: 'Income',
        type: 'Section',
        Rows: { Row: [{ type: 'Data', ColData: [{ value: 'Patient Services' }, { value: '264500.00' }] }] },
        Summary: { ColData: [{ value: 'Total Income' }, { value: '288400.00' }] },
      },
      { group: 'COGS', type: 'Section', Summary: { ColData: [{ value: 'Total Cost of Goods Sold' }, { value: '40000.00' }] } },
    ],
  },
};

// ── [AC-1] parse Total Income from the ProfitAndLoss report ───────────────────
test('[AC-1] incomeFromProfitAndLoss extracts the Total Income summary figure', () => {
  assert.equal(incomeFromProfitAndLoss(PNL), 288400);
});

// ── [AC-4] degrade safely: an empty/malformed report yields 0, never throws ───
test('[AC-4] incomeFromProfitAndLoss returns 0 for empty/malformed reports (no throw)', () => {
  assert.equal(incomeFromProfitAndLoss(undefined), 0);
  assert.equal(incomeFromProfitAndLoss({}), 0);
  assert.equal(incomeFromProfitAndLoss({ Rows: {} }), 0);
  assert.equal(incomeFromProfitAndLoss({ Rows: { Row: [{ Summary: { ColData: [{ value: 'Net Income' }, { value: 'x' }] } }] } }), 0);
});

// ── [AC-2] periods mirror the existing tiles: last week / prior week / MTD ─────
test('[AC-2] financePeriods returns last-week, prior-week (Mon–Sun) and month-to-date ranges', () => {
  const now = new Date('2026-06-29T12:00:00Z'); // Monday 2026-06-29, 08:00 ET
  const p = financePeriods(now);
  assert.deepEqual(p.lastWeek, { start: '2026-06-22', end: '2026-06-28' });
  assert.deepEqual(p.priorWeek, { start: '2026-06-15', end: '2026-06-21' });
  assert.deepEqual(p.mtd, { start: '2026-06-01', end: '2026-06-29' });
});

// ── [AC-5] period windows are derived in the practice zone, not UTC ───────────
// 2026-07-01T03:00:00Z is 2026-06-30 23:00 in America/New_York — the UTC date (Jul 1)
// and the ET day (Jun 30) disagree. MTD must stay in June (the practice-zone month),
// proving the boundary tracks ET, not the host/UTC clock.
test('[AC-5] financePeriods derives month-to-date in the practice zone (no UTC off-by-one)', () => {
  const now = new Date('2026-07-01T03:00:00Z');
  const p = financePeriods(now);
  assert.equal(p.mtd.start, '2026-06-01');
  assert.equal(p.mtd.end, '2026-06-30');
});

// ── shared spawn helper for the live-path (audit / safe-logging) assertions ───
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on('error', reject);
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// [AC-6] audit trail + [AC-7] finance-safe logging. Spawns the real server against
// synthetic fixtures (live route + transforms), hits /api/financials, and asserts the
// read is audit-logged (method+path+status) while NO financial values (Total Income,
// account names, dollar figures) appear anywhere in the logs.
test('[AC-6][AC-7] GET /api/financials — audit-logged read with no financial values in logs', async () => {
  const fixturesDir = mkdtempSync(path.join(tmpdir(), 'madison-revenue-'));
  writeFixtures(fixturesDir, new Date());
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  let logs = '';
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, ...FIXTURE_ENV, DEMO_MODE: '', FIXTURES_DIR: fixturesDir, PORT: String(port), FRONTEND_DIST: '/nonexistent' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => (logs += d.toString()));
  child.stderr.on('data', (d) => (logs += d.toString()));
  try {
    const deadline = Date.now() + 10_000;
    for (;;) {
      try { if ((await fetch(`${base}/health`)).ok) break; } catch { /* not up yet */ }
      if (Date.now() > deadline) throw new Error('server did not become healthy');
      await new Promise((r) => setTimeout(r, 150));
    }
    const res = await fetch(`${base}/api/financials`);
    assert.equal(res.status, 200);
    const body = await res.json();
    // revenue is present and parsed from the ProfitAndLoss fixture (accrual Total Income).
    assert.ok(body.revenue, 'revenue field must be present');
    assert.equal(body.revenue.weekly.last, 288400);
    assert.equal(body.revenue.mtd, 288400);
    await new Promise((r) => setTimeout(r, 150)); // let the audit line flush

    // audit-logging: the read is recorded with method + path + outcome.
    assert.match(logs, /GET \/api\/financials → 200/);

    // finance-safe logging: no financial values / account names from the P&L fixture leak.
    for (const s of ['288400', '264500', 'Total Income', 'Patient Services', 'Operating']) {
      assert.ok(!logs.includes(s), `log must not contain financial value: "${s}"`);
    }
  } finally {
    child.kill();
    rmSync(fixturesDir, { recursive: true, force: true });
  }
});
