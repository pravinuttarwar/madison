// Unit tests for the Phase-1 email category classifier (MBI-19). The classifier is
// rule-based: a sender/domain → category map (empty until the customer supplies their
// designated-sender lists) with an `action-needed` default so nothing important hides
// behind an unknown sender. Categories: management | operational | action-needed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyCategory, emailsFromGraph } from '../src/transforms.js';
import { writeFixtures, FIXTURE_ENV } from './fixtures/generate.js';

const VALID = ['management', 'operational', 'action-needed'];
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

test('classifyCategory — exact sender rule wins', () => {
  const rules = { 'ceo@madison.example': 'management' };
  assert.equal(classifyCategory('ceo@madison.example', rules), 'management');
});

test('classifyCategory — domain rule applies when no exact sender match', () => {
  const rules = { 'billing.example': 'operational' };
  assert.equal(classifyCategory('clerk@billing.example', rules), 'operational');
});

test('classifyCategory — unmatched sender defaults to action-needed', () => {
  assert.equal(classifyCategory('stranger@unknown.example', {}), 'action-needed');
});

test('classifyCategory — empty/missing address defaults to action-needed', () => {
  assert.equal(classifyCategory('', {}), 'action-needed');
  assert.equal(classifyCategory(undefined, {}), 'action-needed');
});

test('emailsFromGraph — every email carries a valid category; defaults to action-needed with the empty live map', () => {
  const messages = [
    { id: 'm1', importance: 'high', isRead: false, from: { emailAddress: { name: 'A', address: 'a@unknown.example' } }, subject: 'Hi' },
    { id: 'm2', importance: 'normal', isRead: true, from: { emailAddress: { name: 'B', address: 'b@unknown.example' } }, subject: 'Yo' },
    { id: 'm3' }, // no sender at all
  ];
  const out = emailsFromGraph(messages);
  for (const e of out) {
    assert.ok(VALID.includes(e.category), `category should be valid, got ${e.category}`);
  }
  // With no customer rules wired yet, the default applies across the board.
  assert.deepEqual(out.map((e) => e.category), ['action-needed', 'action-needed', 'action-needed']);
});

// HIPAA (MBI-19): reading mail to classify it must leave an audit trail (who/what via
// method+path, when, outcome) but NEVER log message content. The classifier must not
// change that. Runs on the LIVE path against synthetic upstream fixtures (FIXTURES_DIR,
// MBI-36 — DEMO_MODE is gone): spawn a real server, capture its stdout, hit /api/email,
// and assert the audit line is present AND no subject/sender/body string leaked.
test('GET /api/email — audit-logged read with no PHI/content in logs (safe-logging)', async () => {
  const fixturesDir = mkdtempSync(path.join(tmpdir(), 'madison-emailcat-'));
  writeFixtures(fixturesDir, new Date());
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  let logs = '';
  const child = spawn(process.execPath, [SERVER], {
    // Live route + transforms against fixtures; DEMO_MODE OFF (retired in MBI-36).
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
    // wait for liveness
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
    const res = await fetch(`${base}/api/email`);
    assert.equal(res.status, 200);
    await new Promise((r) => setTimeout(r, 150)); // let the res.on('finish') audit line flush

    // audit-logging: the read is recorded with method + path + outcome.
    assert.match(logs, /GET \/api\/email → 200/);

    // safe-logging: NONE of the email content (subjects, senders, body fragments) from
    // the synthetic fixtures is logged.
    const forbidden = [
      'UB-04 analysis ready', 'Billing Partner', 'transition model',
      'Research Lab', 'rollout SOP', 'schedule a call',
    ];
    for (const s of forbidden) {
      assert.ok(!logs.includes(s), `log must not contain email content: "${s}"`);
    }
  } finally {
    child.kill();
    rmSync(fixturesDir, { recursive: true, force: true });
  }
});
