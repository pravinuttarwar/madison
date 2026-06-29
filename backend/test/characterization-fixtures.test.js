// Characterization tests on the LIVE path (MBI-34). Spawns the real server.js with
// FIXTURES_DIR set — graph.js/qbo.js resolve from synthetic upstream fixtures instead of
// calling Microsoft/Intuit, so the gate exercises the real routes + transforms.js offline,
// with NO DEMO_MODE and no demo.js dependency. This is the test the contract relies on once
// the runtime sample path is removed (MBI-35/36). Synthetic data only — never real PHI.

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

async function getJson(pathname) {
  const res = await fetch(`${base}${pathname}`);
  const body = await res.json();
  return { status: res.status, body };
}

before(async () => {
  // Generate synthetic upstream fixtures with dates relative to NOW into a temp dir.
  fixturesDir = mkdtempSync(path.join(tmpdir(), 'madison-fixtures-'));
  writeFixtures(fixturesDir, new Date());

  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [SERVER], {
    // FIXTURES_DIR on, DEMO_MODE OFF — the live route + transforms path runs against fixtures.
    env: {
      ...process.env,
      ...FIXTURE_ENV,
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

test('GET /health — live (not demo) and reachable', async () => {
  const { status, body } = await getJson('/health');
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.notEqual(body.demoMode, true); // fixtures mode is NOT demo mode
});

test('GET /api/unknown — JSON 404, never SPA fallthrough', async () => {
  const { status, body } = await getJson('/api/does-not-exist');
  assert.equal(status, 404);
  assert.equal(body.error, 'not_found');
});

test('GET /api/sources/status — four in-scope sources, env-driven sandbox/live, never mock (no Teams)', async () => {
  const { status, body } = await getJson('/api/sources/status');
  assert.equal(status, 200);
  assert.equal(body.length, 4);
  const byId = Object.fromEntries(body.map((s) => [s.id, s.mode]));
  for (const id of ['outlook', 'microsoftToDo', 'quickbooks', 'spreadsheet']) {
    // MBI-36: mode is env-driven. The gate runs with the default QBO_ENV/MS_ENV (sandbox)
    // and 'mock' is retired — so every source reports 'sandbox', never 'mock'/'live'.
    assert.equal(byId[id], 'sandbox', `${id} should be sandbox under default env`);
  }
  for (const s of body) assert.notEqual(s.mode, 'mock');
  assert.equal(byId.microsoftTeams, undefined);
});

test('GET /api/me — owner identity from the Graph profile fixture', async () => {
  const { status, body } = await getJson('/api/me');
  assert.equal(status, 200);
  assert.equal(body.displayName, 'Dr. Romano');
});

test('[AC-1][AC-2] GET /api/email — full list, importance/unread flags + valid category through the live classifier', async () => {
  const { status, body } = await getJson('/api/email');
  assert.equal(status, 200);
  assert.equal(body.length, 5);
  const VALID = ['management', 'operational', 'action-needed'];
  for (const e of body) {
    assert.equal(typeof e.important, 'boolean');
    assert.equal(typeof e.unread, 'boolean');
    assert.ok('from' in e && 'subject' in e);
    // Live classifier ships with an EMPTY sender map → every email defaults to action-needed.
    assert.ok(VALID.includes(e.category), `category must be valid, got ${e.category}`);
    assert.equal(e.category, 'action-needed');
  }
  // m1 (high) + m2 (flagged) are important AND unread.
  assert.equal(body.filter((e) => e.important && e.unread).length, 2);
});

test('GET /api/email/:id — body resolves for a known id', async () => {
  const { status, body } = await getJson('/api/email/m1');
  assert.equal(status, 200);
  assert.equal(body.id, 'm1');
  assert.ok(body.body && body.body.length > 0);
});

test('[AC-4] GET /api/email/awaiting — follow-up list (latest from owner, past threshold) with the stable DTO shape', async () => {
  const { status, body } = await getJson('/api/email/awaiting');
  assert.equal(status, 200);
  assert.ok(Array.isArray(body));
  assert.equal(body.length, 1);
  // Contract preserved for the EmailQueue consumer — exact field set, unchanged.
  assert.deepEqual(Object.keys(body[0]).sort(), ['days', 'detail', 'hours', 'id', 'subject', 'to', 'wait']);
  assert.equal(typeof body[0].wait, 'string');
  assert.equal(body[0].to, 'External Lab');
});

test('GET /api/calendar — today events + week-ahead grouping', async () => {
  const { status, body } = await getJson('/api/calendar');
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.today) && body.today.length >= 1);
  assert.ok(Array.isArray(body.week) && body.week.length >= 1 && body.week.length <= 5);
});

test('GET /api/tasks — owner-grouped tasks with valid status buckets', async () => {
  const { status, body } = await getJson('/api/tasks');
  assert.equal(status, 200);
  assert.equal(body.length, 5);
  const statuses = new Set(body.map((t) => t.status));
  for (const s of statuses) assert.ok(['overdue', 'due-today', 'upcoming', 'done'].includes(s));
  // The four buckets are represented by the fixtures.
  for (const s of ['overdue', 'due-today', 'upcoming', 'done']) assert.ok(statuses.has(s), `missing ${s}`);
});

test('GET /api/financials — weekly + daily snapshot through transforms', async () => {
  const { status, body } = await getJson('/api/financials');
  assert.equal(status, 200);
  assert.ok(body.weekly && body.daily);
  assert.ok(body.weekly.totalDeposits.last > 0);
  assert.ok(body.daily.depositYesterday.total > 0);
});

// [AC-1] Revenue is an ADDITIVE field: accrual Total Income parsed from the QBO
// ProfitAndLoss report, over the week/MTD windows. The existing weekly/daily contract
// (asserted above) is unchanged.
test('[AC-1] GET /api/financials — additive revenue from ProfitAndLoss (accrual Total Income)', async () => {
  const { status, body } = await getJson('/api/financials');
  assert.equal(status, 200);
  assert.ok(body.weekly && body.daily, 'existing weekly/daily contract is preserved');
  assert.ok(body.revenue, 'revenue field is present');
  assert.equal(body.revenue.weekly.last, 288400);
  assert.equal(body.revenue.weekly.prior, 288400);
  assert.equal(body.revenue.mtd, 288400);
});

// [AC-1] Receivables is an ADDITIVE field: aggregate A/R from open QBO Invoices
// (Balance > 0) with aging buckets. The weekly/daily/revenue contract is unchanged.
// [AC-10] proves the synthetic invoices.json fixture flows through the live route.
test('[AC-1][AC-10] GET /api/financials — additive receivables (A/R aging) from open invoices', async () => {
  const { status, body } = await getJson('/api/financials');
  assert.equal(status, 200);
  assert.ok(body.weekly && body.daily && body.revenue, 'existing weekly/daily/revenue contract is preserved');
  assert.ok(body.receivables, 'receivables field is present');
  assert.equal(body.receivables.openCount, 5); // 5 open; the fully-paid (Balance 0) invoice is excluded
  assert.equal(body.receivables.totalOutstanding, 12600);
  assert.equal(body.receivables.aging.length, 5);
  const amt = Object.fromEntries(body.receivables.aging.map((a) => [a.bucket, a.amount]));
  assert.equal(amt['Current'], 900);
  assert.equal(amt['1–30'], 1200);
  assert.equal(amt['31–60'], 3400);
  assert.equal(amt['61–90'], 2100);
  assert.equal(amt['90+'], 5000);
  // buckets partition the total exactly.
  assert.equal(body.receivables.aging.reduce((s, a) => s + a.amount, 0), 12600);
});

// [AC-4] aggregate-only: the response carries NO customer/patient name from the fixture's
// CustomerRef — only totals, counts and bucket sums.
test('[AC-4] GET /api/financials — receivables exposes no customer/patient names', async () => {
  const { status, body } = await getJson('/api/financials');
  assert.equal(status, 200);
  assert.ok(!JSON.stringify(body.receivables).includes('Patient'), 'receivables must not carry patient/customer names');
});

test('GET /api/reports — 12 weekly metrics + encounters by specialty', async () => {
  const { status, body } = await getJson('/api/reports');
  assert.equal(status, 200);
  assert.equal(body.metrics.length, 12);
  assert.equal(body.encountersBySpecialty.length, 6);
  assert.ok(body.totalEncounters.last > 0);
});

test('GET /api/dashboard — default weekday aggregate', async () => {
  const { status, body } = await getJson('/api/dashboard');
  assert.equal(status, 200);
  assert.equal(body.view, 'weekday');
  assert.ok(Array.isArray(body.emails) && body.emails.length === 5);
  assert.ok(Array.isArray(body.tasks) && body.tasks.length === 5);
});

test('GET /api/dashboard?view=monday — Monday (weekly recap) view', async () => {
  const { status, body } = await getJson('/api/dashboard?view=monday');
  assert.equal(status, 200);
  assert.equal(body.view, 'monday');
  assert.ok(body.financialWeek);
  assert.ok(Array.isArray(body.priorityToday));
});
