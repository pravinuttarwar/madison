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
      // Isolate the workbook connection store to this temp dir — never read a developer's real
      // persisted connection from the default path (which would point graph reads at live items).
      WORKBOOK_CONFIG_PATH: path.join(fixturesDir, 'state', 'workbook.json'),
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

// [AC-2][AC-7] Single-user fallback (no TASKS_TEAM_USERS configured in FIXTURE_ENV): the
// route returns the additive `{ multiOwner:false, tasks:[...] }` wrapper — the only shape
// change — carrying the signed-in person's own To Do, through the live route + transforms.
test('[AC-2][AC-7] GET /api/tasks — single-user wrapper { multiOwner:false, tasks } with valid status buckets', async () => {
  const { status, body } = await getJson('/api/tasks');
  assert.equal(status, 200);
  assert.equal(body.multiOwner, false);
  assert.ok(Array.isArray(body.tasks));
  assert.equal(body.tasks.length, 5);
  const statuses = new Set(body.tasks.map((t) => t.status));
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

// [AC-1] Cash-flow is an ADDITIVE field: derived inflow/outflow/net over the week/MTD
// windows from the deposits + purchases already fetched. The weekly/daily/revenue/
// receivables contract is unchanged. [AC-8] proves it flows through the live route off
// the synthetic deposits/purchases fixtures (offline). Dates in the fixture are relative
// to NOW, so assert the date-robust invariant (net = inflow − outflow) + shape, not fixed
// sums (the exact math is pinned deterministically in transforms.test.js).
test('[AC-1][AC-8] GET /api/financials — additive cashFlow (inflow/outflow/net) wired through the route', async () => {
  const { status, body } = await getJson('/api/financials');
  assert.equal(status, 200);
  assert.ok(body.weekly && body.daily && body.revenue && body.receivables, 'existing contract preserved');
  assert.ok(body.cashFlow, 'cashFlow field is present');
  const w = body.cashFlow.weekly;
  for (const k of ['inflow', 'outflow', 'net']) {
    assert.ok(w[k] && typeof w[k].last === 'number' && typeof w[k].prior === 'number', `weekly.${k} has last+prior`);
  }
  // net = inflow − outflow holds for each window (the defining invariant).
  assert.equal(w.net.last, w.inflow.last - w.outflow.last);
  assert.equal(w.net.prior, w.inflow.prior - w.outflow.prior);
  const m = body.cashFlow.mtd;
  assert.equal(m.net, m.inflow - m.outflow);
  // Date-robust: MTD totals are non-negative numbers. (An earlier check assumed MTD always spans a
  // full month — false on the 1st, when month-to-date is a single day; the net invariant is the real
  // contract and is asserted above.)
  for (const k of ['inflow', 'outflow']) assert.ok(typeof m[k] === 'number' && m[k] >= 0, `mtd.${k} is a non-negative number`);
});

// MAD-27: /api/reports now reads the tolerant GRID parser over the (dirty) Totals-Madison
// tabs — 11 canonical metrics (the unmapped "Sprained Wombat" column is excluded, not crashed
// on), encounters-by-specialty = the first 6, and newPatients parsed from the free-typed cell.
test('[AC-1][AC-2] GET /api/reports — canonical metrics from the grid parser (unmapped column excluded)', async () => {
  const { status, body } = await getJson('/api/reports');
  assert.equal(status, 200);
  assert.equal(body.metrics.length, 11);
  assert.equal(body.encountersBySpecialty.length, 6);
  assert.ok(body.totalEncounters.last > 0);
  const byKey = Object.fromEntries(body.metrics.map((m) => [m.key, m]));
  // June (current) is the latest month tab → last; May → prior (position-based, no date math).
  assert.equal(byKey.med.last, 120);
  assert.equal(byKey.med.prior, 110);
  // the combined "IV & MA" column resolves to the single ivMa bucket (AC-2)
  assert.equal(byKey.ivMa.last, 40);
  // newPatients parsed from the free-typed "New Patients: 31" cell
  assert.equal(byKey.newPatients.last, 31);
  // the unknown column never becomes a metric
  assert.ok(!body.metrics.some((m) => /wombat/i.test(m.key) || /wombat/i.test(m.label)));
});

// MAD-50 [AC-4] the report carries the REAL period (month labels from the selected tabs),
// not the hardcoded "Week 0". June is the latest current-month tab → current; May → prior.
test('[AC-4] GET /api/reports — real month period (June vs May), never "Week 0"', async () => {
  const { status, body } = await getJson('/api/reports');
  assert.equal(status, 200);
  // tz-safe: asserts the practice-zone year (matches periodFromTabs); month is data-driven (June/May).
  const year = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric' }).format(new Date());
  assert.deepEqual(body.period, { current: `June ${year}`, prior: `May ${year}` });
});

// MAD-50 [AC-2][AC-3] "found but not counted" warnings surface the after-TOTAL provider row
// (allergy) AND the unmapped metric label (Sprained Wombat) — as LABELS only, never cell values.
test('[AC-2][AC-3] GET /api/reports — not-counted warnings carry labels only, no values', async () => {
  const { status, body } = await getJson('/api/reports');
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.warnings) && body.warnings.length >= 2);
  const labels = body.warnings.map((w) => w.label.toLowerCase());
  assert.ok(labels.includes('allergy'), 'after-TOTAL provider-tab row surfaced');
  assert.ok(labels.some((l) => /wombat/.test(l)), 'unmapped metric label surfaced');
  // references only — each warning is exactly { label }, no positions/counts
  for (const w of body.warnings) assert.deepEqual(Object.keys(w), ['label']);
  // no provider-tab cell value (e.g. allergy's 8) leaks into the warning payload
  assert.ok(!/\b8\b/.test(JSON.stringify(body.warnings)));
});

// MAD-46 — the additive `providers` section: per-provider counts from the Provider Totals tabs
// (June=current, May=prior), name-normalized (Bachman + "Bachman " merged), sorted by current.
test('[AC-1][AC-4] GET /api/reports — additive per-provider breakdown (name-normalized, sorted)', async () => {
  const { status, body } = await getJson('/api/reports');
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.providers) && body.providers.length >= 3);
  const byName = Object.fromEntries(body.providers.map((p) => [p.name, p]));
  assert.equal(byName.Lisa.current, 50);
  assert.equal(byName.Lisa.prior, 45);
  // "Bachman " (30) + "Bachman" (4) merge to one provider → 34
  assert.equal(byName.Bachman.current, 34);
  // sorted by current encounters, descending
  const currents = body.providers.map((p) => p.current);
  assert.deepEqual(currents, [...currents].sort((a, b) => b - a));
  // existing metrics DTO is unchanged (additive)
  assert.equal(body.metrics.length, 11);
});

// [AC-1] MAD-29: with prior-year ranges configured (FIXTURE_ENV), each metric carries an
// additive yearAgo and totalEncounters.yearAgo is their sum — through the live route.
test('[AC-1] GET /api/reports — additive year-ago (YoY) values from prior-year named ranges', async () => {
  const { status, body } = await getJson('/api/reports');
  assert.equal(status, 200);
  for (const m of body.metrics) {
    assert.equal(typeof m.yearAgo, 'number', `metric ${m.key} has a numeric yearAgo`);
    // existing WoW contract preserved
    assert.equal(typeof m.last, 'number');
    assert.equal(typeof m.prior, 'number');
  }
  assert.equal(typeof body.totalEncounters.yearAgo, 'number');
  assert.equal(body.totalEncounters.yearAgo, body.metrics.reduce((s, m) => s + m.yearAgo, 0));
  // encounters-by-specialty rows carry it too [AC-4]
  for (const row of body.encountersBySpecialty) assert.equal(typeof row.yearAgo, 'number');
});

// MAD-27/MAD-28: the named-range month source is gone. In the monthly-tab model, last/prior
// ALREADY express month-over-month, so the separate MoM fields are not double-supplied — they
// are intentionally ABSENT here. The DTO still SUPPORTS them (reportsFromGrids adds them when a
// month-granular source is supplied — proven in report-grid.test.js), so MAD-28 consumers keep
// working; only the redundant live population is dropped (see PR notes for the owner decision).
test('[AC-6] GET /api/reports — MoM fields intentionally absent (last/prior already are MoM)', async () => {
  const { status, body } = await getJson('/api/reports');
  assert.equal(status, 200);
  for (const m of body.metrics) {
    assert.ok(!('monthToDate' in m) && !('prevMonth' in m), `${m.key} carries no redundant MoM fields`);
  }
  assert.ok(!('monthToDate' in body.totalEncounters) && !('prevMonth' in body.totalEncounters));
});

// [AC-5] MAD-28: the report stays aggregate-only with month fields present — every value
// numeric, no individual identifiers (no email, no MRN/SSN-style ids).
test('[AC-5] GET /api/reports — MoM values are aggregate numbers, no identifiers', async () => {
  const { status, body } = await getJson('/api/reports');
  assert.equal(status, 200);
  for (const m of body.metrics) {
    for (const k of ['monthToDate', 'prevMonth']) {
      if (k in m) assert.equal(typeof m[k], 'number', `${m.key}.${k} is a number`);
    }
  }
  const blob = JSON.stringify(body);
  assert.ok(!/[\w.+-]+@[\w-]+\.[\w.-]+/.test(blob), 'no email addresses in the report payload');
  assert.ok(!/\b\d{3}-\d{2}-\d{4}\b/.test(blob), 'no SSN/MRN-style identifiers in the report payload');
});

// [AC-5] MAD-29: the report is aggregate-only — every metric value is a number and the
// payload carries no individual identifiers (no email addresses, no MRN/SSN-style ids).
// (Metric LABELS like "newPatients" are aggregate names, not identifiers — not banned.)
test('[AC-5] GET /api/reports — aggregate-only, no individual identifiers', async () => {
  const { status, body } = await getJson('/api/reports');
  assert.equal(status, 200);
  for (const m of body.metrics) {
    for (const k of ['last', 'prior', 'yearAgo']) {
      if (k in m) assert.equal(typeof m[k], 'number', `${m.key}.${k} is a number`);
    }
  }
  const blob = JSON.stringify(body);
  assert.ok(!/[\w.+-]+@[\w-]+\.[\w.-]+/.test(blob), 'no email addresses in the report payload');
  assert.ok(!/\b\d{3}-\d{2}-\d{4}\b/.test(blob), 'no SSN/MRN-style identifiers in the report payload');
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
