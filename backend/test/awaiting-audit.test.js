// HIPAA logging guarantees for the awaiting-response engine (MAD-18, AC-7/AC-8). Reading
// the owner's mailbox to build the follow-up list must leave an audit trail (method + path
// + outcome) but NEVER log message content (subjects, recipient names/addresses, bodies).
// Runs on the LIVE path against synthetic upstream fixtures (FIXTURES_DIR): spawn the real
// server, capture its stdout, hit /api/email/awaiting, and assert the audit line is present
// AND no fixture content leaked. SYNTHETIC data only — no real PHI.

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

test('[AC-7][AC-8] GET /api/email/awaiting — audit-logged read with no PHI/content in logs', async () => {
  const fixturesDir = mkdtempSync(path.join(tmpdir(), 'madison-awaiting-'));
  writeFixtures(fixturesDir, new Date());
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  let logs = '';
  const child = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      ...FIXTURE_ENV,
      DEMO_MODE: '',
      FIXTURES_DIR: fixturesDir,
      PORT: String(port),
      FRONTEND_DIST: '/nonexistent',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => (logs += d.toString()));
  child.stderr.on('data', (d) => (logs += d.toString()));
  try {
    const deadline = Date.now() + 10_000;
    for (;;) {
      try {
        if ((await fetch(`${base}/health`)).ok) break;
      } catch {
        /* not up yet */
      }
      if (Date.now() > deadline) throw new Error('server did not become healthy');
      await new Promise((r) => setTimeout(r, 150));
    }
    const res = await fetch(`${base}/api/email/awaiting`);
    assert.equal(res.status, 200);
    await new Promise((r) => setTimeout(r, 150)); // let the res.on('finish') audit line flush

    // AC-7 audit-logging: the read is recorded with method + path + outcome (no query string).
    assert.match(logs, /GET \/api\/email\/awaiting → 200/);

    // AC-8 safe-logging: NONE of the sent-item content from the synthetic fixtures is logged.
    const forbidden = ['Awaiting reply', 'External Lab', 'lab@external.example', 'await-1@madison.example'];
    for (const s of forbidden) {
      assert.ok(!logs.includes(s), `log must not contain mail content: "${s}"`);
    }
  } finally {
    child.kill();
    rmSync(fixturesDir, { recursive: true, force: true });
  }
});
