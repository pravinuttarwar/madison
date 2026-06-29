// MAD-26 — workbook connection through the LIVE route (spawns the real server.js with
// FIXTURES_DIR + a temp WORKBOOK_CONFIG_PATH, so the connect endpoints + reports read run the
// real path against synthetic upstream payloads — no network, no creds). Proves AC-1 (connect
// via the shares endpoint) and AC-5 (/api/reports then reads from the persisted connection).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFixtures, FIXTURE_ENV } from './fixtures/generate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '../src/server.js');

let child;
let base;
let fixturesDir;
let workbookConfig;

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

async function waitForHealth(url, timeoutMs = 20_000) {
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

async function getJson(pathname) {
  const res = await fetch(`${base}${pathname}`);
  return { status: res.status, body: await res.json() };
}
async function postJson(pathname, payload) {
  const res = await fetch(`${base}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: await res.json() };
}

before(async () => {
  fixturesDir = mkdtempSync(path.join(tmpdir(), 'madison-wbconn-'));
  writeFixtures(fixturesDir, new Date());
  workbookConfig = path.join(fixturesDir, 'state', 'workbook.json'); // nested → mkdir must happen

  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      ...FIXTURE_ENV,
      DEMO_MODE: '',
      FIXTURES_DIR: fixturesDir,
      WORKBOOK_CONFIG_PATH: workbookConfig,
      PORT: String(port),
      FRONTEND_DIST: '/nonexistent',
    },
    stdio: 'ignore',
  });
  await waitForHealth(base);
});

after(() => {
  if (child) child.kill();
  if (fixturesDir) rmSync(fixturesDir, { recursive: true, force: true });
});

test('[AC-3] GET /api/reports/connection — falls back to the env path before any connect', async () => {
  const { status, body } = await getJson('/api/reports/connection');
  assert.equal(status, 200);
  assert.equal(body.connected, true);
  assert.equal(body.via, 'env'); // SPREADSHEET_DRIVE_PATH from FIXTURE_ENV
});

test('[AC-1] POST /api/reports/connection — a share-URL resolves, validates and connects', async () => {
  const { status, body } = await postJson('/api/reports/connection', {
    input: 'https://contoso.sharepoint.com/:x:/s/ops/EabcWeekly.xlsx?e=tok',
  });
  assert.equal(status, 200);
  assert.equal(body.connected, true);
  assert.equal(body.name, 'Madison Weekly Report.xlsx');
  assert.equal(body.source, 'share-url');
});

test('[AC-4] the connection persisted to disk holds refs only — no cell values', async () => {
  assert.ok(existsSync(workbookConfig), 'the connection file was written');
  const rec = JSON.parse(readFileSync(workbookConfig, 'utf8'));
  assert.equal(rec.driveId, 'drive-1');
  assert.equal(rec.itemId, 'item-9');
  assert.ok(!('cellValues' in rec) && !('values' in rec), 'no cell values persisted');
});

test('[AC-4] GET /api/reports/connection — now reports the connection (not the env fallback)', async () => {
  const { status, body } = await getJson('/api/reports/connection');
  assert.equal(status, 200);
  assert.equal(body.connected, true);
  assert.equal(body.via, 'connection');
  assert.equal(body.name, 'Madison Weekly Report.xlsx');
});

test('[AC-5] GET /api/reports — reads the 12 metrics from the connected workbook', async () => {
  const { status, body } = await getJson('/api/reports');
  assert.equal(status, 200);
  assert.equal(body.metrics.length, 12);
  assert.equal(body.encountersBySpecialty.length, 6);
  assert.ok(body.totalEncounters.last > 0);
});

test('[AC-3] POST /api/reports/connection — empty input is rejected without touching the connection', async () => {
  const { status, body } = await postJson('/api/reports/connection', { input: '   ' });
  assert.equal(status, 400);
  assert.equal(body.error, 'missing_input');
  // The previously-persisted connection is untouched.
  const after = await getJson('/api/reports/connection');
  assert.equal(after.body.via, 'connection');
});
