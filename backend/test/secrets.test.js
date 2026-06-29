// MAD-14 — AC-3: secrets stay server-side behind a single vault-ready accessor, and app
// credentials are never sent to the browser. The accessor is the one seam a vault would
// replace later; the spawn test proves no endpoint leaks the secret. Synthetic data only.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSecret } from '../src/config.js';
import { writeFixtures, FIXTURE_ENV } from './fixtures/generate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '../src/server.js');

// Synthetic sentinels — if either ever shows up in an HTTP response, that's a leak.
const MS_SECRET = 'ms-secret-SENTINEL-9z8x7c';
const QBO_SECRET = 'qbo-secret-SENTINEL-1a2b3c';

test('[AC-3] getSecret reads a named credential from the configured source (single seam)', () => {
  assert.equal(getSecret('SOME_KEY', { SOME_KEY: 'value-123' }), 'value-123');
  assert.equal(getSecret('MISSING', {}), '');
});

// ── No app credential is ever serialized to a client ──────────────────────────
let child;
let base;
let fixturesDir;

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
async function waitForHealth(url, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('server did not become healthy in time');
}

before(async () => {
  fixturesDir = mkdtempSync(path.join(tmpdir(), 'madison-secrets-'));
  writeFixtures(fixturesDir, new Date());
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      ...FIXTURE_ENV,
      DEMO_MODE: '',
      FIXTURES_DIR: fixturesDir,
      PORT: String(port),
      FRONTEND_DIST: '/nonexistent',
      MS_CLIENT_SECRET: MS_SECRET,
      QBO_CLIENT_SECRET: QBO_SECRET,
    },
    stdio: 'ignore',
  });
  await waitForHealth(base);
});

after(() => {
  if (child) child.kill();
  if (fixturesDir) rmSync(fixturesDir, { recursive: true, force: true });
});

test('[AC-3] app credentials are never sent to the browser (no endpoint leaks the secret)', async () => {
  for (const p of ['/health', '/api/settings', '/api/sources/status', '/api/me']) {
    const res = await fetch(`${base}${p}`);
    const text = await res.text();
    assert.ok(!text.includes(MS_SECRET), `${p} leaked the Microsoft client secret`);
    assert.ok(!text.includes(QBO_SECRET), `${p} leaked the QuickBooks client secret`);
  }
});
