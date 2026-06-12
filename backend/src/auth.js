import { config } from './config.js';
import { currentSession } from './session.js';

// Access + refresh tokens live on the CURRENT visitor's session (in memory only).
// Each call resolves the session via AsyncLocalStorage, so two browsers never share
// a connection. A 'not_authenticated' throw → the route layer returns 401 → login.

const GRAPH_SCOPE = 'openid profile Mail.Read Calendars.Read Tasks.Read Files.Read offline_access';

// ── Microsoft Graph: refresh-token grant (per session) ────────────────────────
export async function graphToken() {
  const s = currentSession();
  if (!s || !s.graph.refreshToken) throw new Error('not_authenticated:graph');
  const g = s.graph;
  if (g.accessToken && Date.now() < g.expiresAt - 60_000) return g.accessToken;

  const tenant = config.graph.tenantId || 'common';
  const body = new URLSearchParams({
    client_id: config.graph.clientId,
    client_secret: config.graph.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: g.refreshToken,
    scope: GRAPH_SCOPE,
  });
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`Graph token refresh failed (${res.status}): ${await res.text()}`);
  const json = await res.json();
  // Microsoft rotates refresh tokens — keep the session's copy current.
  if (json.refresh_token) g.refreshToken = json.refresh_token;
  g.accessToken = json.access_token;
  g.expiresAt = Date.now() + json.expires_in * 1000;
  return g.accessToken;
}

// ── QuickBooks Online: refresh-token grant (per session) ──────────────────────
export async function qboToken() {
  const s = currentSession();
  if (!s || !s.qbo.refreshToken) throw new Error('not_authenticated:qbo');
  const q = s.qbo;
  if (q.accessToken && Date.now() < q.expiresAt - 60_000) return q.accessToken;

  const basic = Buffer.from(`${config.qbo.clientId}:${config.qbo.clientSecret}`).toString('base64');
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: q.refreshToken });
  const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });
  if (!res.ok) throw new Error(`QBO token refresh failed (${res.status}): ${await res.text()}`);
  const json = await res.json();
  // QuickBooks rotates the refresh token on every refresh — capture it in the session.
  if (json.refresh_token) q.refreshToken = json.refresh_token;
  q.accessToken = json.access_token;
  q.expiresAt = Date.now() + json.expires_in * 1000;
  return q.accessToken;
}
