// MAD-15 verification aid — a DEV-ONLY hook to force the Graph re-auth path live.
// It invalidates the current session's refresh token so the next Graph call gets rejected
// by Microsoft (invalid_grant) → graphToken() clears creds → routes return 401. Env-gated
// off by default and hard-disabled in production. Synthetic data only.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { devHooksEnabled, expireGraphToken, handleExpireGraph } from '../src/dev-hooks.js';
import { sessionContext } from '../src/session.js';

function mkSession() {
  return {
    id: 's-dev',
    graph: { refreshToken: 'rt-live-synthetic', displayName: 'Owner', accessToken: 'at-cached', expiresAt: Date.now() + 3_600_000 },
    qbo: { refreshToken: '', realmId: '', accessToken: null, expiresAt: 0 },
  };
}

test('[MAD-15] expireGraphToken corrupts the refresh token and clears the cached access token', () => {
  const s = mkSession();
  expireGraphToken(s);
  assert.notEqual(s.graph.refreshToken, 'rt-live-synthetic', 'refresh token replaced with an invalid value');
  assert.ok(s.graph.refreshToken.length > 0, 'still non-empty so graphToken attempts a refresh (not the no-token 401)');
  assert.equal(s.graph.accessToken, null, 'cached access token cleared so a refresh is attempted at once');
  assert.equal(s.graph.expiresAt, 0);
});

test('[MAD-15] devHooksEnabled is true only with the flag set AND not production', () => {
  assert.equal(devHooksEnabled({ ALLOW_TEST_HOOKS: '1', MS_ENV: 'sandbox' }), true);
  assert.equal(devHooksEnabled({ ALLOW_TEST_HOOKS: '1', MS_ENV: 'production' }), false, 'hard-disabled in production');
  assert.equal(devHooksEnabled({ ALLOW_TEST_HOOKS: '0', MS_ENV: 'sandbox' }), false);
  assert.equal(devHooksEnabled({}), false, 'off by default');
});

// Drive the gate via process.env (the handler reads it directly), restoring after.
function withEnv(vars, fn) {
  const saved = {};
  for (const k of Object.keys(vars)) { saved[k] = process.env[k]; process.env[k] = vars[k]; }
  try { return fn(); } finally {
    for (const k of Object.keys(vars)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}

test('[MAD-15] the handler 404s when disabled and never touches the session', () => {
  const s = mkSession();
  let status = 0;
  const res = { status(c) { status = c; return this; }, json() { return this; } };
  withEnv({ ALLOW_TEST_HOOKS: '0', MS_ENV: 'sandbox' }, () =>
    sessionContext.run(s, () => handleExpireGraph({}, res)));
  assert.equal(status, 404);
  assert.equal(s.graph.refreshToken, 'rt-live-synthetic', 'session untouched when the hook is disabled');
});

test('[MAD-15] the handler works when Express invokes it as (req, res, next) — next must not disable the gate', () => {
  const s = mkSession();
  let status = 0;
  let payload;
  const res = { status(c) { status = c; return this; }, json(b) { payload = b; return this; } };
  // Express passes `next` as the 3rd arg. Regression for the bug where a 3rd `env` param
  // captured `next` and silently 404'd the live route.
  const next = () => { throw new Error('next() must not be called'); };
  withEnv({ ALLOW_TEST_HOOKS: '1', MS_ENV: 'sandbox' }, () =>
    sessionContext.run(s, () => handleExpireGraph({}, res, next)));
  assert.equal(status, 200, 'enabled route returns 200 even when called Express-style');
  assert.equal(payload.ok, true);
  assert.notEqual(s.graph.refreshToken, 'rt-live-synthetic', 'session refresh token invalidated');
  // The response must not echo any token value (safe-logging discipline carries to responses).
  assert.doesNotMatch(JSON.stringify(payload), /rt-live-synthetic|at-cached/);
});
