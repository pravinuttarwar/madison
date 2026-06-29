// MAD-17 — the customer's designated sender→category lists, supplied via config
// (CATEGORY_RULES env), must drive the email category classifier with NO code change.
// transforms.js stays a pure mapper: routes.js injects config.graph.categoryRules into
// emailsFromGraph(messages, rules). Covers [AC-3] (classification from supplied rules)
// and [AC-4] (the env→config→route seam + safe fallback). Live route + transforms path,
// run against synthetic upstream fixtures (FIXTURES_DIR) — no network, no creds, no PHI.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { emailsFromGraph } from '../src/transforms.js';
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

// Spawn the real server against synthetic fixtures with an optional CATEGORY_RULES env,
// fetch the live /api/email, return its parsed body. Proves the env→config→route→transform
// wiring end-to-end (not just the pure mapper).
async function emailsWithRulesEnv(categoryRulesEnv) {
  const fixturesDir = mkdtempSync(path.join(tmpdir(), 'madison-catrules-'));
  writeFixtures(fixturesDir, new Date());
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      ...FIXTURE_ENV,
      DEMO_MODE: '',
      FIXTURES_DIR: fixturesDir,
      PORT: String(port),
      FRONTEND_DIST: '/nonexistent',
      ...(categoryRulesEnv === undefined ? {} : { CATEGORY_RULES: categoryRulesEnv }),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
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
    const res = await fetch(`${base}/api/email`);
    return { status: res.status, body: await res.json() };
  } finally {
    child.kill();
    rmSync(fixturesDir, { recursive: true, force: true });
  }
}

test('[AC-3] emailsFromGraph threads supplied rules — exact sender wins, then domain, else action-needed', () => {
  const rules = {
    'billing@partner.example': 'operational', // exact sender
    'madison.example': 'management', // bare domain
  };
  const messages = [
    { id: 'm1', from: { emailAddress: { address: 'billing@partner.example' } } },
    { id: 'm5', from: { emailAddress: { address: 'frontdesk@madison.example' } } },
    { id: 'mx', from: { emailAddress: { address: 'stranger@unknown.example' } } },
  ];
  const out = emailsFromGraph(messages, rules);
  assert.deepEqual(
    out.map((e) => e.category),
    ['operational', 'management', 'action-needed'],
  );
});

test('[AC-4] CATEGORY_RULES env drives live /api/email categories with no code change', async () => {
  const { status, body } = await emailsWithRulesEnv(
    JSON.stringify({ 'billing@partner.example': 'operational', 'madison.example': 'management' }),
  );
  assert.equal(status, 200);
  const byId = Object.fromEntries(body.map((e) => [e.id, e.category]));
  assert.equal(byId.m1, 'operational', 'exact-sender rule applied via config');
  assert.equal(byId.m5, 'management', 'domain rule applied via config');
  assert.equal(byId.m3, 'action-needed', 'unmatched sender keeps the default');
});

test('[AC-4] malformed CATEGORY_RULES falls back to no rules — route stays up, all action-needed', async () => {
  const { status, body } = await emailsWithRulesEnv('{not valid json');
  assert.equal(status, 200, 'malformed config must not crash the route');
  assert.ok(body.length > 0);
  for (const e of body) {
    assert.equal(e.category, 'action-needed', 'safe fallback: every email defaults to action-needed');
  }
});
