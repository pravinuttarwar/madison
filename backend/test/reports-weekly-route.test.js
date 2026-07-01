// MAD-51 — the WEEKLY-block view through the LIVE /api/reports route (spawns the real server with
// FIXTURES_DIR so graph.js resolves synthetic multi-block grids — no network, no creds). Proves the
// additive `weekly` section is wired (AC-4) and that the existing MONTHLY shape is unchanged.

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

async function waitForHealth(url, timeoutMs = 20_000) {
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
  fixturesDir = mkdtempSync(path.join(tmpdir(), 'madison-weekly-'));
  writeFixtures(fixturesDir, new Date());
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env, ...FIXTURE_ENV, DEMO_MODE: '',
      FIXTURES_DIR: fixturesDir, PORT: String(port), FRONTEND_DIST: '/nonexistent',
      // Isolate the workbook store so we never read a developer's real persisted connection.
      WORKBOOK_CONFIG_PATH: path.join(fixturesDir, 'state', 'workbook.json'),
    },
    stdio: 'ignore',
  });
  await waitForHealth(base);
});

after(() => {
  if (child) child.kill();
  if (fixturesDir) rmSync(fixturesDir, { recursive: true, force: true });
});

// [AC-4] /api/reports carries the additive `weekly` section: same shape as the monthly report,
// labeled "Week of …" from the block's DATE serials, and the current week is a SINGLE block (not
// the whole month) — so weekly Med < monthly Med.
test('[AC-4] GET /api/reports — additive weekly-block section, same shape as monthly', async () => {
  const { status, body } = await getJson('/api/reports');
  assert.equal(status, 200);
  assert.ok(body.weekly, 'weekly section present');
  // labeled from the DATE serials (current week = Jun 22, prior = Jun 15) — zone-independent.
  assert.equal(body.weekly.period.current, 'Week of Jun 22');
  assert.equal(body.weekly.period.prior, 'Week of Jun 15');
  // same shape as the monthly report
  assert.equal(body.weekly.metrics.length, 11);
  assert.equal(body.weekly.encountersBySpecialty.length, 6);
  assert.ok(typeof body.weekly.totalEncounters.last === 'number');
  assert.ok(Array.isArray(body.weekly.providers), 'per-week providers present');
  // the WEEKLY current is a single block (Jun 22), NOT the whole-month total
  const wMed = body.weekly.metrics.find((m) => m.key === 'med');
  const mMed = body.metrics.find((m) => m.key === 'med');
  assert.equal(mMed.last, 120, 'monthly Med unchanged (rollup of both weekly blocks)');
  assert.ok(wMed.last < mMed.last, 'a single week is less than the whole month');
});

// [AC-4] the existing MONTHLY contract is unchanged (additive only — no field removed/reshaped).
test('[AC-4] GET /api/reports — monthly shape unchanged (June vs May, providers, warnings)', async () => {
  const { status, body } = await getJson('/api/reports');
  assert.equal(status, 200);
  const year = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric' }).format(new Date());
  assert.deepEqual(body.period, { current: `June ${year}`, prior: `May ${year}` });
  const byKey = Object.fromEntries(body.metrics.map((m) => [m.key, m]));
  assert.equal(byKey.med.last, 120);
  assert.equal(byKey.med.prior, 110);
  assert.equal(byKey.ivMa.last, 40);
  assert.equal(byKey.newPatients.last, 31);
  // providers + warnings still present (MAD-46 / MAD-50)
  assert.ok(Array.isArray(body.providers) && body.providers.length >= 3);
  assert.ok(Array.isArray(body.warnings) && body.warnings.some((w) => /wombat/i.test(w.label)));
});

// [AC-2] MAD-54 — the DTO lists the workbook's months and echoes the resolved selection; the default
// selection is a real month that has data.
test('[AC-2] GET /api/reports — availableMonths + a data-backed default selectedMonth', async () => {
  const { status, body } = await getJson('/api/reports');
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.availableMonths) && body.availableMonths.length > 0, 'availableMonths present');
  for (const m of body.availableMonths) {
    assert.match(m.key, /^\d{4}-\d{2}$/);
    assert.equal(typeof m.hasData, 'boolean');
    assert.ok(m.label);
  }
  const sel = body.availableMonths.find((m) => m.key === body.selectedMonth);
  assert.ok(sel && sel.hasData, 'the default selectedMonth is a month WITH data');
});

// [AC-3] MAD-54 — ?month=YYYY-MM selects that month; the resolved selectedMonth echoes it.
test('[AC-3] GET /api/reports?month= — selects the requested month', async () => {
  const { body } = await getJson('/api/reports');
  const other = body.availableMonths.find((m) => m.key !== body.selectedMonth && m.hasData);
  assert.ok(other, 'fixture has a second month with data to select');
  const { status, body: b2 } = await getJson(`/api/reports?month=${other.key}`);
  assert.equal(status, 200);
  assert.equal(b2.selectedMonth, other.key, 'the requested month is selected');
});
