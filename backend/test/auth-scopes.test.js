// Diagnostic: read the GRANTED scopes from an access token's claims (scp = delegated,
// roles = application), WITHOUT ever exposing the token itself. Pure decode — synthetic
// tokens only, no network, no real creds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scopesFromAccessToken } from '../src/oauth-graph.js';

// Build a synthetic JWT (header.payload.signature) carrying the given claims — base64url,
// padding stripped, like a real Microsoft token. The signature is irrelevant to decoding.
function jwt(claims) {
  const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64u({ alg: 'RS256', typ: 'JWT' })}.${b64u(claims)}.sig-not-checked`;
}

test('[AC-1] decodes delegated scopes from the scp claim', () => {
  const token = jwt({ scp: 'Mail.Read Calendars.Read Files.Read', roles: [], tid: 't-1', aud: 'https://graph.microsoft.com' });
  const r = scopesFromAccessToken(token);
  assert.deepEqual(r.delegated, ['Mail.Read', 'Calendars.Read', 'Files.Read']);
  assert.deepEqual(r.app, []);
});

test('[AC-1] decodes application roles (app-only token) from the roles claim', () => {
  const token = jwt({ roles: ['Tasks.Read.All', 'User.ReadBasic.All'], tid: 't-1' });
  const r = scopesFromAccessToken(token);
  assert.deepEqual(r.app, ['Tasks.Read.All', 'User.ReadBasic.All']);
  assert.deepEqual(r.delegated, []);
});

test('[AC-2] never echoes the token, and tolerates a malformed token without throwing', () => {
  const r = scopesFromAccessToken('not-a-jwt');
  assert.deepEqual(r, { delegated: [], app: [] });
  // a missing/empty token is safe too
  assert.deepEqual(scopesFromAccessToken(''), { delegated: [], app: [] });
  assert.deepEqual(scopesFromAccessToken(null), { delegated: [], app: [] });
});
