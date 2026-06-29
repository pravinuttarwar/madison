// MAD-15 — sign-in/consent + auth-event audit pins.
// Pure helpers (no server spawn): the authorize-URL builder, the scope set, the auth-event
// audit seam, and the callback's no-token-to-browser guarantee. Synthetic data only.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GRAPH_SCOPE, buildAuthorizeUrl } from '../src/oauth-graph.js';
import { authEvent } from '../src/audit.js';
import { handleMsCallback } from '../src/server-oauth.js';
import { sessionContext } from '../src/session.js';

test('[AC-1] the consent scope set is read-only and minimal — no write or SharePoint/Planner scopes', () => {
  for (const scope of ['openid', 'profile', 'offline_access', 'Mail.Read', 'Calendars.Read', 'Tasks.Read', 'Files.Read']) {
    assert.match(GRAPH_SCOPE, new RegExp(`(^| )${scope}( |$)`), `requests ${scope}`);
  }
  // Never request write or the conditional SharePoint/Planner scopes (their own stories).
  assert.doesNotMatch(GRAPH_SCOPE, /ReadWrite|\.Write|Sites\.Read\.All|Group\.Read\.All|Mail\.Send/);
});

test('[AC-1][AC-5] authorize URL pins the configured tenant, an HTTPS redirect, the read-only scope, and no secret', () => {
  const url = buildAuthorizeUrl({
    clientId: 'public-client-id',
    tenant: 'practice-tenant-id',
    redirectUri: 'https://studio.example.com/auth/microsoft/callback',
  });
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, 'https://login.microsoftonline.com/practice-tenant-id/oauth2/v2.0/authorize',
    'pins the practice tenant, not common');
  assert.equal(u.searchParams.get('redirect_uri'), 'https://studio.example.com/auth/microsoft/callback');
  assert.ok(u.searchParams.get('redirect_uri').startsWith('https://'), 'production redirect is HTTPS');
  assert.equal(u.searchParams.get('scope'), GRAPH_SCOPE);
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.doesNotMatch(url, /secret/i, 'the client secret never appears in the authorize URL');
});

test('[AC-5] with no tenant configured the builder falls back to the multi-tenant common endpoint', () => {
  const u = new URL(buildAuthorizeUrl({ clientId: 'c', tenant: '', redirectUri: 'http://localhost:8787/cb' }));
  assert.match(u.pathname, /^\/common\//);
});

test('[AC-6] authEvent records who·what·outcome and carries no token/secret/code', () => {
  const lines = [];
  authEvent('consent_granted', { sessionId: 'sess-abc', outcome: 'ok' }, (l) => lines.push(l), () => '2026-06-29T00:00:00.000Z');
  assert.equal(lines.length, 1);
  assert.match(lines[0], /consent_granted/);     // what
  assert.match(lines[0], /session=sess-abc/);     // who (reference, not a name)
  assert.match(lines[0], /→ ok/);                 // outcome
  assert.match(lines[0], /2026-06-29T00:00:00\.000Z/); // when
});

test('[AC-2] the OAuth callback stores the refresh token server-side and never sends it (or the code) to the browser', async () => {
  const fakeIdToken = `x.${Buffer.from(JSON.stringify({ name: 'Owner Synthetic' })).toString('base64')}.y`;
  const realFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ refresh_token: 'rt-server-only', access_token: 'at-secret', id_token: fakeIdToken }),
  });
  const session = { id: 's1', graph: { refreshToken: '', displayName: '', accessToken: null, expiresAt: 0 }, qbo: {} };
  let redirectedTo = '';
  const res = {
    redirect(loc) { redirectedTo = loc; },
    status() { return { send: () => {}, json: () => {} }; },
  };
  const req = { query: { code: 'AUTH_CODE_SECRET' } };
  try {
    await sessionContext.run(session, () => handleMsCallback(req, res));
  } finally {
    global.fetch = realFetch;
  }
  assert.equal(session.graph.refreshToken, 'rt-server-only', 'refresh token captured into the session');
  assert.equal(session.graph.displayName, 'Owner Synthetic');
  // The browser redirect must not carry the refresh token, access token, or the auth code.
  assert.doesNotMatch(redirectedTo, /rt-server-only/);
  assert.doesNotMatch(redirectedTo, /at-secret/);
  assert.doesNotMatch(redirectedTo, /AUTH_CODE_SECRET/);
});
