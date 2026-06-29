// MAD-15 — Microsoft Graph production OAuth + token management.
// Unit-level pins for the token-refresh + re-auth contract. graph.js/qbo.js bypass
// graphToken() in fixtures mode, so these exercise the real refresh path directly with
// a stubbed global.fetch and a synthetic in-memory session. Synthetic data only —
// no real tokens, no network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { graphToken } from '../src/auth.js';
import { errorResponse } from '../src/routes.js';
import { sessionContext } from '../src/session.js';

// A synthetic session with a stored (fake) refresh token.
function withSession(graphOverrides, fn) {
  const session = {
    id: 'sess-synthetic',
    lastSeen: Date.now(),
    graph: { refreshToken: 'rt-old-synthetic', displayName: 'Owner', accessToken: null, expiresAt: 0, ...graphOverrides },
    qbo: { refreshToken: '', realmId: '', accessToken: null, expiresAt: 0 },
  };
  return sessionContext.run(session, () => fn(session));
}

// Swap global.fetch for the duration of one call; restore after.
async function withFetch(stub, fn) {
  const real = global.fetch;
  global.fetch = stub;
  try {
    return await fn();
  } finally {
    global.fetch = real;
  }
}

test('[AC-3] valid refresh returns a fresh access token and rotates the stored refresh token', async () => {
  let sentBody = '';
  const stub = async (_url, opts) => {
    sentBody = String(opts.body);
    return { ok: true, status: 200, json: async () => ({ access_token: 'at-new', refresh_token: 'rt-new', expires_in: 3600 }) };
  };
  await withSession({}, (s) =>
    withFetch(stub, async () => {
      const token = await graphToken();
      assert.equal(token, 'at-new');
      assert.match(sentBody, /grant_type=refresh_token/);
      assert.equal(s.graph.refreshToken, 'rt-new', 'rotates to the new refresh token');
      assert.equal(s.graph.accessToken, 'at-new');
      assert.ok(s.graph.expiresAt > Date.now(), 'caches with a future expiry');
    }),
  );
});

test('[AC-3] a still-valid cached access token is reused without hitting the token endpoint', async () => {
  let called = false;
  const stub = async () => { called = true; return { ok: true, json: async () => ({}) }; };
  await withSession({ accessToken: 'at-cached', expiresAt: Date.now() + 10 * 60_000 }, () =>
    withFetch(stub, async () => {
      const token = await graphToken();
      assert.equal(token, 'at-cached');
      assert.equal(called, false, 'no refresh call when the cached token is still valid');
    }),
  );
});

test('[AC-4] a rejected refresh token clears the session Graph creds and signals re-auth', async () => {
  const logs = [];
  const realLog = console.log;
  console.log = (...a) => logs.push(a.join(' '));
  const stub = async () => ({ ok: false, status: 400, text: async () => '{"error":"invalid_grant"}' });
  try {
    await withSession({}, (s) =>
      withFetch(stub, async () => {
        await assert.rejects(() => graphToken(), /not_authenticated:graph/);
        assert.equal(s.graph.refreshToken, '', 'clears the rejected refresh token');
        assert.equal(s.graph.accessToken, null);
        assert.equal(s.graph.expiresAt, 0);
      }),
    );
  } finally {
    console.log = realLog;
  }
  // [AC-7] the re-auth audit line must not leak the refresh token value.
  const joined = logs.join('\n');
  assert.match(joined, /reauth_required/, 'emits a re-auth audit event');
  assert.doesNotMatch(joined, /rt-old-synthetic/, 'never logs the refresh token value');
});

test('[AC-4] a transient upstream error keeps the refresh token and is not a re-auth', async () => {
  const stub = async () => ({ ok: false, status: 503, text: async () => 'upstream busy' });
  await withSession({}, (s) =>
    withFetch(stub, async () => {
      await assert.rejects(() => graphToken(), (err) => {
        assert.doesNotMatch(String(err.message), /not_authenticated/);
        return true;
      });
      assert.equal(s.graph.refreshToken, 'rt-old-synthetic', 'keeps creds on a transient failure');
    }),
  );
});

test('[AC-4] errorResponse maps not_authenticated to the re-auth contract, else 502', () => {
  assert.deepEqual(errorResponse('outlook', new Error('not_authenticated:graph')), {
    status: 401,
    body: { error: 'not_authenticated', source: 'outlook' },
  });
  assert.deepEqual(errorResponse('quickbooks', new Error('not_authenticated:qbo')), {
    status: 503,
    body: { error: 'source_not_connected', source: 'quickbooks' },
  });
  const upstream = errorResponse('outlook', new Error('Graph GET /me → 500'));
  assert.equal(upstream.status, 502);
  assert.equal(upstream.body.error, 'upstream_failed');
});
