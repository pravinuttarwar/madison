// MAD-37 AC-1 (multi-owner board) + AC-4 (owner resolution + isolation) + AC-7 (offline
// gate, team variant). Spawns the real server.js with FIXTURES_DIR *and* TASKS_TEAM_USERS
// set to a synthetic team — so the live route + transforms + app-only graph path run
// against synthetic per-owner fixtures, with NO network and NO creds. Synthetic only.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFixtures, FIXTURE_ENV, TASKS_TEAM_ENV } from './fixtures/generate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '../src/server.js');

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
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('server did not become healthy in time');
}

async function getJson(pathname) {
  const res = await fetch(`${base}${pathname}`);
  return { status: res.status, body: await res.json() };
}

before(async () => {
  fixturesDir = mkdtempSync(path.join(tmpdir(), 'madison-team-fixtures-'));
  writeFixtures(fixturesDir, new Date());
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      ...FIXTURE_ENV,
      ...TASKS_TEAM_ENV, // team configured → multi-owner board path
      DEMO_MODE: '',
      FIXTURES_DIR: fixturesDir,
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

// [AC-1][AC-7] With a team configured, the route returns the multi-owner wrapper grouped by
// REAL owner — one card per RESOLVABLE owner (the unreadable ghost is skipped), each with
// the owner's real name + per-owner counts, sorted overdue→open. No hardcoded 'DCR'.
test('[AC-1][AC-7] GET /api/tasks — multi-owner board, one card per resolvable owner, real names, sorted', async () => {
  const { status, body } = await getJson('/api/tasks');
  assert.equal(status, 200);
  assert.equal(body.multiOwner, true);
  assert.ok(Array.isArray(body.owners));
  // 3 configured, but ghost@clinic.test has no user fixture → resolveUser null → skipped.
  assert.equal(body.owners.length, 2);

  const names = body.owners.map((o) => o.name);
  assert.deepEqual(names, ['Alice Adams', 'Bob Brown']); // overdue-desc → Alice first
  assert.ok(!JSON.stringify(body).includes('DCR'), 'no hardcoded DCR owner');

  const alice = body.owners[0];
  assert.deepEqual(Object.keys(alice).sort(), ['dueToday', 'name', 'open', 'overdue', 'tasks', 'upcoming', 'upn']);
  assert.equal(alice.upn, 'alice@clinic.test');
  assert.equal(alice.overdue, 2);
  assert.equal(alice.dueToday, 1);
  assert.equal(alice.upcoming, 1);
  assert.equal(alice.open, 4); // 2 overdue + 1 due-today + 1 upcoming
  // Counts RECONCILE: open = overdue + dueToday + upcoming (the filter chips must add up).
  assert.equal(alice.open, alice.overdue + alice.dueToday + alice.upcoming);
  // tasks within a card are status-ordered (overdue first).
  assert.equal(alice.tasks[0].status, 'overdue');
  for (const t of alice.tasks) assert.ok(['overdue', 'due-today', 'upcoming'].includes(t.status));
});

// [AC-4] Owner isolation: each card carries ONLY that owner's tasks — no cross-owner bleed.
test('[AC-4] GET /api/tasks — owner cards are isolated (no cross-owner task bleed)', async () => {
  const { body } = await getJson('/api/tasks');
  const alice = body.owners.find((o) => o.upn === 'alice@clinic.test');
  const bob = body.owners.find((o) => o.upn === 'bob@clinic.test');

  const aliceTitles = alice.tasks.map((t) => t.title);
  const bobTitles = bob.tasks.map((t) => t.title);
  assert.ok(aliceTitles.every((t) => t.startsWith('Alice')), 'Alice card holds only Alice tasks');
  assert.ok(bobTitles.every((t) => t.startsWith('Bob')), 'Bob card holds only Bob tasks');
  assert.equal(aliceTitles.filter((t) => bobTitles.includes(t)).length, 0, 'no shared tasks across owners');
  assert.equal(bob.overdue, 0); // Bob has no overdue → distinct from Alice
});
