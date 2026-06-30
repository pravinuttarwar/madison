// MAD-48 — report caching mechanism. /api/reports wraps its (slow) workbook read in the
// shared `cached(key, ttl, producer)` helper with a 24h TTL and a `?refresh=1` bypass. These
// tests pin the cache SEMANTICS the criteria depend on, plus the report TTL seam. Synthetic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cached, clearCache } from '../src/cache.js';
import { reportCacheTtl, REPORT_TTL_MS } from '../src/routes.js';

const DAY = 24 * 60 * 60 * 1000;

// ── [AC-1] within the TTL the producer is NOT re-run (cache hit) ───────────────
test('[AC-1] cached serves the stored value within the TTL — the producer runs once', async () => {
  clearCache();
  let runs = 0;
  const produce = async () => { runs += 1; return { n: runs }; };
  const a = await cached('k-ac1', DAY, produce);
  const b = await cached('k-ac1', DAY, produce);
  assert.equal(runs, 1, 'producer ran exactly once (second call is a cache hit)');
  assert.deepEqual(a, b);
});

// ── [AC-2] ttl 0 (the refresh path) always re-runs ────────────────────────────
test('[AC-2] reportCacheTtl: refresh → 0 (bypass), otherwise the 24h TTL; ttl 0 re-runs the producer', async () => {
  assert.equal(reportCacheTtl(true), 0);
  assert.equal(reportCacheTtl(false), REPORT_TTL_MS);
  assert.equal(REPORT_TTL_MS, DAY);
  clearCache();
  let runs = 0;
  await cached('k-ac2', 0, async () => { runs += 1; });
  await cached('k-ac2', 0, async () => { runs += 1; });
  assert.equal(runs, 2, 'ttl 0 bypasses the cache → producer runs every time (force-refresh)');
});

// ── [AC-3] per-session: different keys cache independently (sk() scopes by session) ──
test('[AC-3] distinct cache keys are isolated — one session\'s report never serves another\'s', async () => {
  clearCache();
  await cached('sessA:reports', DAY, async () => 'A');
  await cached('sessB:reports', DAY, async () => 'B');
  assert.equal(await cached('sessA:reports', DAY, async () => 'X'), 'A');
  assert.equal(await cached('sessB:reports', DAY, async () => 'X'), 'B');
});

// ── [AC-4] an error is NOT cached — a transient failure never sticks ───────────
test('[AC-4] a producer that throws is not cached — the next call re-attempts', async () => {
  clearCache();
  let attempts = 0;
  const flaky = async () => { attempts += 1; if (attempts === 1) throw new Error('upstream'); return 'ok'; };
  await assert.rejects(() => cached('k-ac4', DAY, flaky));
  const v = await cached('k-ac4', DAY, flaky); // retried, not the cached error
  assert.equal(v, 'ok');
  assert.equal(attempts, 2);
});

// ── [AC-5] the audit (a producer side-effect) fires only on the actual read ────
test('[AC-5] a cache hit does not run the producer, so no read-side-effect (audit) is emitted on a hit', async () => {
  clearCache();
  let audits = 0;
  const readAndAudit = async () => { audits += 1; return 'report'; }; // audit lives inside the read
  await cached('k-ac5', DAY, readAndAudit);
  await cached('k-ac5', DAY, readAndAudit); // hit → producer skipped → no audit
  assert.equal(audits, 1, 'the read+audit ran once; the cache hit emitted no spurious audit');
});
