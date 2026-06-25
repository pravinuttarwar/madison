// MBI-36: the runtime DEMO_MODE sample path is retired. Even with DEMO_MODE=1 set, the
// server must NEVER serve sample payloads — routes go live and signal "not connected"
// (401 Microsoft / 503 QuickBooks) when there's no session, and /health no longer reports
// a demoMode flag. Spawn the real server with DEMO_MODE=1 and no fixtures/session to prove
// the flag is inert. Synthetic only — no creds, no network.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/server.js');

let child;
let base;

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
      if ((await fetch(`${url}/health`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('server did not become healthy in time');
}

async function getJson(pathname) {
  const res = await fetch(`${base}${pathname}`);
  let body = null;
  try { body = await res.json(); } catch { /* empty */ }
  return { status: res.status, body };
}

before(async () => {
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [SERVER], {
    // DEMO_MODE=1 must be IGNORED — no fixtures, no session → routes are live + disconnected.
    env: { ...process.env, DEMO_MODE: '1', FIXTURES_DIR: '', PORT: String(port), FRONTEND_DIST: '/nonexistent' },
    stdio: 'ignore',
  });
  await waitForHealth(base);
});

after(() => {
  if (child) child.kill();
});

test('/health does not report a demoMode flag', async () => {
  const { status, body } = await getJson('/health');
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.demoMode, undefined);
});

test('Microsoft routes 401 (not a demo payload) when disconnected, even with DEMO_MODE=1', async () => {
  const { status, body } = await getJson('/api/email');
  assert.equal(status, 401);
  assert.equal(body.error, 'not_authenticated');
});

test('QuickBooks route 503 (not a demo payload) when disconnected, even with DEMO_MODE=1', async () => {
  const { status, body } = await getJson('/api/financials');
  assert.equal(status, 503);
  assert.equal(body.error, 'source_not_connected');
});

test('the dashboard 401s (no demo aggregate) when disconnected, even with DEMO_MODE=1', async () => {
  const { status } = await getJson('/api/dashboard?view=monday');
  assert.equal(status, 401);
});

test('source-status never reports mock, even with DEMO_MODE=1', async () => {
  const { status, body } = await getJson('/api/sources/status');
  assert.equal(status, 200);
  for (const s of body) assert.notEqual(s.mode, 'mock');
});
