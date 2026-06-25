// Characterization tests — pin the CURRENT behavior of the read-only BFF so refactors
// and feature work (e.g. email prioritization, Daily/Monday views) can't silently change
// the contract the frontend depends on. Runs entirely in DEMO_MODE: deterministic sample
// data, no OAuth, no network. Uses only node:test + node:http (no extra deps).
//
// Run: `npm test` (from backend/ or repo root). Spawns the real server.js on a free port
// and exercises it over HTTP, so the full wiring (middleware, router, demo mode) is covered.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '../src/server.js');

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
  const body = await res.json();
  return { status: res.status, body };
}

before(async () => {
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, DEMO_MODE: '1', PORT: String(port), FRONTEND_DIST: '/nonexistent' },
    stdio: 'ignore',
  });
  await waitForHealth(base);
});

after(() => {
  if (child) child.kill();
});

test('GET /health — liveness reports demo mode', async () => {
  const { status, body } = await getJson('/health');
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.demoMode, true);
});

test('GET /api/me — owner identity in demo', async () => {
  const { status, body } = await getJson('/api/me');
  assert.equal(status, 200);
  assert.equal(body.displayName, 'Dr. Romano');
});

test('GET /api/settings — awaiting-response threshold exposed (env-driven number)', async () => {
  const { status, body } = await getJson('/api/settings');
  assert.equal(status, 200);
  // Value comes from backend/.env (AWAITING_THRESHOLD_HOURS), default 48 — env-dependent,
  // so pin the shape/type, not the number.
  assert.equal(typeof body.awaitingThresholdHours, 'number');
});

test('GET /api/email — full list with importance/unread flags (prioritization contract)', async () => {
  const { status, body } = await getJson('/api/email');
  assert.equal(status, 200);
  assert.equal(body.length, 8);
  for (const e of body) {
    assert.equal(typeof e.important, 'boolean');
    assert.equal(typeof e.unread, 'boolean');
    assert.ok('from' in e && 'subject' in e);
  }
  // The Dashboard "unread important" KPI derives from these flags — pin the count.
  const unreadImportant = body.filter((e) => e.important && e.unread).length;
  assert.equal(unreadImportant, 3);
});

test('GET /api/email — every email carries a valid category; important set spans all three buckets (MBI-19)', async () => {
  const { status, body } = await getJson('/api/email');
  assert.equal(status, 200);
  const VALID = ['management', 'operational', 'action-needed'];
  for (const e of body) {
    assert.ok(VALID.includes(e.category), `category must be a valid enum, got ${e.category}`);
  }
  // The dashboard briefing shows only important emails by category — the sample data
  // must exercise all three buckets so the categorized UI is demoable.
  const importantCats = new Set(body.filter((e) => e.important).map((e) => e.category));
  for (const c of VALID) assert.ok(importantCats.has(c), `important emails should include a ${c} example`);
});

test('GET /api/email/:id — body resolves for a known id', async () => {
  const { status, body } = await getJson('/api/email/e1');
  assert.equal(status, 200);
  assert.equal(body.id, 'e1');
  assert.ok(body.body && body.body.length > 0);
});

test('GET /api/email/awaiting — follow-up list', async () => {
  const { status, body } = await getJson('/api/email/awaiting');
  assert.equal(status, 200);
  assert.equal(body.length, 4);
});

test('GET /api/calendar — today + week ahead', async () => {
  const { status, body } = await getJson('/api/calendar');
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.today) && body.today.length > 0);
  assert.equal(body.week.length, 5);
});

test('GET /api/tasks — owner-grouped task list', async () => {
  const { status, body } = await getJson('/api/tasks');
  assert.equal(status, 200);
  assert.equal(body.length, 14);
  for (const t of body) assert.ok(['overdue', 'due-today', 'upcoming'].includes(t.status));
});

test('GET /api/financials — weekly + daily snapshot', async () => {
  const { status, body } = await getJson('/api/financials');
  assert.equal(status, 200);
  assert.ok(body.weekly && body.daily);
  assert.equal(body.weekly.totalDeposits.last, 312380);
});

test('GET /api/reports — 12 weekly metrics + encounters by specialty', async () => {
  const { status, body } = await getJson('/api/reports');
  assert.equal(status, 200);
  assert.equal(body.metrics.length, 12);
  assert.equal(body.encountersBySpecialty.length, 6);
  assert.equal(body.totalEncounters.last, 1547);
});

test('GET /api/dashboard — default weekday view aggregate', async () => {
  const { status, body } = await getJson('/api/dashboard');
  assert.equal(status, 200);
  assert.equal(body.view, 'weekday');
  assert.equal(body.owner, 'Dr. Romano');
  assert.equal(body.emails.length, 8);
  assert.equal(body.tasks.length, 14);
});

test('GET /api/dashboard?view=monday — Monday (weekly recap) view', async () => {
  const { status, body } = await getJson('/api/dashboard?view=monday');
  assert.equal(status, 200);
  assert.equal(body.view, 'monday');
  assert.ok(body.financialWeek);
  assert.equal(body.priorityToday.length, 5);
});

test('GET /api/sources/status — four in-scope sources; all sandbox in demo (no Teams)', async () => {
  const { status, body } = await getJson('/api/sources/status');
  assert.equal(status, 200);
  assert.equal(body.length, 4);
  const byId = Object.fromEntries(body.map((s) => [s.id, s.mode]));
  // In demo mode every in-scope source reports 'sandbox'. Microsoft Teams was removed —
  // it was never wired and is out of scope per the SOW, so it must not appear at all.
  for (const id of ['outlook', 'microsoftToDo', 'quickbooks', 'spreadsheet']) {
    assert.equal(byId[id], 'sandbox', `${id} should be sandbox in demo`);
  }
  assert.equal(byId.microsoftTeams, undefined);
});

test('GET /api/unknown — JSON 404, never SPA fallthrough', async () => {
  const { status, body } = await getJson('/api/does-not-exist');
  assert.equal(status, 404);
  assert.equal(body.error, 'not_found');
});
