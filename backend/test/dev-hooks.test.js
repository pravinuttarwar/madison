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

test('[MAD-15] the handler 404s when disabled and never touches the session', () => {
  const s = mkSession();
  let status = 0;
  const res = { status(c) { status = c; return this; }, json() { return this; } };
  sessionContext.run(s, () => handleExpireGraph({}, res, { ALLOW_TEST_HOOKS: '0', MS_ENV: 'sandbox' }));
  assert.equal(status, 404);
  assert.equal(s.graph.refreshToken, 'rt-live-synthetic', 'session untouched when the hook is disabled');
});

test('[MAD-15] the handler invalidates the session and returns ok (no token in the response) when enabled', () => {
  const s = mkSession();
  let status = 0;
  let payload;
  const res = { status(c) { status = c; return this; }, json(b) { payload = b; return this; } };
  sessionContext.run(s, () => handleExpireGraph({}, res, { ALLOW_TEST_HOOKS: '1', MS_ENV: 'sandbox' }));
  assert.equal(status, 200);
  assert.equal(payload.ok, true);
  assert.notEqual(s.graph.refreshToken, 'rt-live-synthetic', 'session refresh token invalidated');
  // The response must not echo any token value (safe-logging discipline carries to responses).
  assert.doesNotMatch(JSON.stringify(payload), /rt-live-synthetic|at-cached/);
});
