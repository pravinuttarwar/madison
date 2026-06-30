import { config } from './config.js';
import { currentSession } from './session.js';
import { GRAPH_SCOPE } from './oauth-graph.js';
import { authEvent } from './audit.js';

// Access + refresh tokens live on the CURRENT visitor's session (in memory only).
// Each call resolves the session via AsyncLocalStorage, so two browsers never share
// a connection. A 'not_authenticated' throw → the route layer returns 401 → login.

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
  if (!res.ok) {
    // 400/401 from the token endpoint = the refresh token itself is rejected (revoked /
    // expired / password reset). Clear THIS session's Graph creds so the next request is
    // treated as unauthenticated, audit the forced re-auth, and signal not_authenticated
    // → the route layer returns 401 (re-prompt sign-in), not a transient 502. (MAD-15, AC-4)
    if (res.status === 400 || res.status === 401) {
      g.refreshToken = '';
      g.accessToken = null;
      g.expiresAt = 0;
      authEvent('reauth_required', { sessionId: s.id, outcome: 'refresh_rejected' });
      throw new Error('not_authenticated:graph');
    }
    // Transient upstream failure — keep creds (a later request may succeed), surface as 502.
    // Note: the upstream body is NOT included — it can carry sensitive detail (AC-7).
    throw new Error(`Graph token refresh failed (${res.status})`);
  }
  const json = await res.json();
  // Microsoft rotates refresh tokens — keep the session's copy current.
  if (json.refresh_token) g.refreshToken = json.refresh_token;
  g.accessToken = json.access_token;
  g.expiresAt = Date.now() + json.expires_in * 1000;
  authEvent('token_refresh', { sessionId: s.id, outcome: 'ok' });
  return g.accessToken;
}

// ── Microsoft Graph: app-only (client-credentials) token — NOT per session ────
// For the multi-owner "tasks by owner" board (MAD-37): the app reads each configured
// team member's To Do with its OWN Application permissions (Tasks.Read.All), so there is
// no per-visitor delegated token. Cached at module scope (the app identity is shared, not
// per-visitor — no PHI, no session data). Requires MS_TENANT_ID (a specific tenant, never
// 'common', for client-credentials). The app secret stays server-side (config.getSecret).
let appTok = null;
export async function appToken() {
  if (appTok && Date.now() < appTok.expiresAt - 60_000) return appTok.accessToken;
  const tenant = config.graph.tenantId;
  if (!tenant) throw new Error('MS_TENANT_ID required for app-only token');
  const body = new URLSearchParams({
    client_id: config.graph.clientId,
    client_secret: config.graph.clientSecret,
    grant_type: 'client_credentials',
    scope: 'https://graph.microsoft.com/.default',
  });
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  // Body is NOT included in the throw — a token-endpoint error can echo client detail.
  if (!res.ok) throw new Error(`App token request failed (${res.status})`);
  const json = await res.json();
  appTok = { accessToken: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return appTok.accessToken;
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
