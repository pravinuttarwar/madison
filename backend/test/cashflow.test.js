// MAD-25 — Cash-flow overview (Financials). Derived inflow/outflow/net, surfaced as an
// ADDITIVE `cashFlow` field on /api/financials. Spawns the real server so the live route +
// transforms path is exercised; TZ pinned to the practice zone (America/New_York) for
// deterministic window boundaries. Synthetic only — no creds, no network, no PHI.
process.env.TZ = 'America/New_York';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFixtures, FIXTURE_ENV } from './fixtures/generate.js';

const SERVER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/server.js');

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

async function waitForHealth(base, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try { if ((await fetch(`${base}/health`)).ok) break; } catch { /* not up yet */ }
    if (Date.now() > deadline) throw new Error('server did not become healthy');
    await new Promise((r) => setTimeout(r, 150));
  }
}

// [AC-6] audit trail + [AC-7] finance-safe logging for the cash-flow path. Spawn the real
// server against synthetic fixtures, read /api/financials, and assert the read is
// audit-logged (method+path+status) while NO deposit/purchase amounts from the fixtures
// appear anywhere in the logs.
test('[AC-6][AC-7] GET /api/financials — cash-flow read is audit-logged with no deposit/purchase amounts in logs', async () => {
  const fixturesDir = mkdtempSync(path.join(tmpdir(), 'madison-cashflow-'));
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
    await waitForHealth(base);
    const res = await fetch(`${base}/api/financials`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.cashFlow, 'cashFlow field must be present');
    assert.equal(body.cashFlow.weekly.net.last, body.cashFlow.weekly.inflow.last - body.cashFlow.weekly.outflow.last);
    await new Promise((r) => setTimeout(r, 150)); // let the audit line flush

    // audit-logging: the read is recorded with method + path + outcome.
    assert.match(logs, /GET \/api\/financials → 200/);

    // finance-safe logging: no deposit/purchase amounts from the fixtures leak.
    for (const s of ['58420', '64890', '59140', '14210', '8000']) {
      assert.ok(!logs.includes(s), `log must not contain a cash amount: "${s}"`);
    }
  } finally {
    child.kill();
    rmSync(fixturesDir, { recursive: true, force: true });
  }
});
