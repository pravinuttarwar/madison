// MAD-24 — Outstanding-invoice tracking (Financials). Aggregate A/R aging from open QBO
// Invoices, surfaced as an ADDITIVE `receivables` field on /api/financials. These spawn
// the real server so the live route + transforms path is exercised. The practice is in
// America/New_York; TZ is pinned so the assertions are host-clock independent. Synthetic
// only — no creds, no network, no PHI.
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

// [AC-6] The auth/connection contract is unchanged by the additive receivables field:
// with no QuickBooks session and no fixtures, /api/financials still 503s source_not_connected.
test('[AC-6] GET /api/financials — still 503 source_not_connected when QuickBooks is not connected', async () => {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, FIXTURES_DIR: '', PORT: String(port), FRONTEND_DIST: '/nonexistent' },
    stdio: 'ignore',
  });
  try {
    await waitForHealth(base);
    const res = await fetch(`${base}/api/financials`);
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error, 'source_not_connected');
  } finally {
    child.kill();
  }
});

// [AC-8] audit trail + [AC-9] PHI-safe logging for the A/R path. Spawn the real server
// against synthetic fixtures (open invoices with a synthetic CustomerRef name), read
// /api/financials, and assert the read is audit-logged (method+path+status) while NO
// invoice balances and NO customer/patient name from the fixture appear anywhere in logs.
test('[AC-8][AC-9] GET /api/financials — A/R read is audit-logged with no balances or customer names in logs', async () => {
  const fixturesDir = mkdtempSync(path.join(tmpdir(), 'madison-receivables-'));
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
    assert.ok(body.receivables, 'receivables field must be present');
    assert.equal(body.receivables.totalOutstanding, 12600);
    await new Promise((r) => setTimeout(r, 150)); // let the audit line flush

    // audit-logging: the read is recorded with method + path + outcome (no PHI values).
    assert.match(logs, /GET \/api\/financials → 200/);

    // PHI-safe logging: no invoice balances and no fixture customer/patient name leak.
    for (const s of ['Synthetic Patient', '12600', '5000', '3400', '2100']) {
      assert.ok(!logs.includes(s), `log must not contain A/R value/name: "${s}"`);
    }
  } finally {
    child.kill();
    rmSync(fixturesDir, { recursive: true, force: true });
  }
});
