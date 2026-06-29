// MAD-15 — Microsoft sign-in handlers, extracted from server.js so the token-exchange
// guarantees (refresh token stays server-side; the OAuth code never reaches the browser)
// are unit-testable without spawning the HTTP server. server.js registers these on the
// app; the pure scope/URL helpers live in oauth-graph.js.

import { config } from './config.js';
import { currentSession } from './session.js';
import { GRAPH_SCOPE, buildAuthorizeUrl } from './oauth-graph.js';
import { authEvent } from './audit.js';

const PORT = process.env.PORT || 8787;
// Redirect URIs are env-overridable so production registers its own HTTPS callback while
// local dev stays on localhost. /auth/microsoft/callback is canonical; /callback is an alias.
export const MS_REDIRECT = process.env.MS_REDIRECT_URI || `http://localhost:${PORT}/auth/microsoft/callback`;

// GET /auth/microsoft — redirect the owner to the Microsoft consent screen.
export function startMsSignIn(req, res) {
  const clientId = req.query.client_id || config.graph.clientId;
  const tenant = req.query.tenant_id || config.graph.tenantId || 'common';
  if (!clientId) {
    return res.send(`
      <h2>Microsoft login — set up</h2>
      <p>Open this URL with your Azure AD app credentials appended:</p>
      <pre>http://localhost:${config.port}/auth/microsoft?client_id=YOUR_CLIENT_ID&tenant_id=YOUR_TENANT_ID</pre>
      <p>Or fill <code>MS_CLIENT_ID</code> and <code>MS_TENANT_ID</code> in <code>backend/.env</code> first, then visit <a href="/auth/microsoft">/auth/microsoft</a> again.</p>
    `);
  }
  res.redirect(buildAuthorizeUrl({ clientId, tenant, redirectUri: MS_REDIRECT }));
}

// GET /auth/microsoft/callback — exchange the authorization code for tokens. The refresh
// token + display name are stored on THIS visitor's in-memory session; nothing token-bearing
// (and not the code) is ever sent back to the browser — only a success redirect. (MAD-15, AC-2)
export async function handleMsCallback(req, res) {
  const { code, error, error_description } = req.query;
  if (error) return res.status(400).send(`<h2>Auth error</h2><pre>${error}: ${error_description}</pre>`);
  const clientId = config.graph.clientId;
  const clientSecret = config.graph.clientSecret;
  const tenant = config.graph.tenantId || 'common';
  if (!clientId || !clientSecret) {
    return res.status(400).send('<h2>Missing MS_CLIENT_ID / MS_CLIENT_SECRET in backend/.env</h2>');
  }
  try {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: MS_REDIRECT,
      scope: GRAPH_SCOPE,
    });
    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const json = await tokenRes.json();
    if (!tokenRes.ok) return res.status(502).send('<h2>Token exchange failed</h2>');

    const refreshToken = json.refresh_token;
    // Decode the id_token JWT claims — name claim is available from the 'profile' scope.
    // base64url → base64 conversion for Node compat (pad + replace - and _).
    let displayName = '';
    if (json.id_token) {
      try {
        const part = json.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(Buffer.from(part, 'base64').toString('utf8'));
        displayName = payload.name || payload.preferred_username || '';
      } catch { /* ignore malformed token */ }
    }
    // Store on THIS visitor's session only (in memory) — not a global/shared slot.
    const s = currentSession();
    s.graph.refreshToken = refreshToken;
    s.graph.displayName = displayName;
    s.graph.accessToken = null;
    s.graph.expiresAt = 0;
    authEvent('consent_granted', { sessionId: s.id, outcome: 'ok' });

    const frontendUrl = process.env.FRONTEND_URL || ''; // relative → same origin (single-port deploy)
    res.redirect(`${frontendUrl}/#/?auth=success`);
  } catch {
    // Never echo the upstream error body — it can carry sensitive token detail (AC-7).
    res.status(502).send('<h2>Token exchange error</h2>');
  }
}
