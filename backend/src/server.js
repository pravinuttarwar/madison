import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { sessionMiddleware, currentSession, clearCurrentSession } from './session.js';
import { router } from './routes.js';
import { tlsEnforcement } from './security.js';
import { auditMiddleware } from './audit.js';

// Pin the process to the practice timezone so all date/time bucketing + display
// (QuickBooks day buckets, calendar/email times, "yesterday"/"last week" windows)
// is correct regardless of the host server's zone or how the process is launched
// (systemd, npm, raw node). An operator can still override by exporting TZ. Safe to
// set here — no imported module reads Date at load time. (MBI-26)
process.env.TZ = process.env.TZ || 'America/New_York';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Single-repo deploy: the backend also serves the built frontend, so one Node process
// (one port) serves the SPA + /api + OAuth. Override with FRONTEND_DIST if needed.
const FRONTEND_DIST = process.env.FRONTEND_DIST || path.resolve(__dirname, '../../frontend/dist');

const MS_SCOPES = 'openid profile Mail.Read Calendars.Read Tasks.Read Files.Read offline_access';
const PORT = process.env.PORT || 8787;
// Redirect URIs are env-overridable so production (e.g. the studio.mindbowser.com
// backend) can register its own HTTPS callback while local dev stays on localhost.
// The path /auth/microsoft/callback is the canonical one; /callback is kept as an alias.
const MS_REDIRECT = process.env.MS_REDIRECT_URI || `http://localhost:${PORT}/auth/microsoft/callback`;
const QBO_REDIRECT = process.env.QBO_REDIRECT_URI || `http://localhost:${PORT}/auth/qbo/callback`;
const QBO_SCOPES = 'com.intuit.quickbooks.accounting';

const app = express();

// Behind a TLS-terminating proxy in prod: trust X-Forwarded-* so req.secure reflects the
// edge, then enforce https (redirect + HSTS). Both are no-ops unless FORCE_HTTPS=1. (MAD-14)
if (process.env.FORCE_HTTPS === '1') app.set('trust proxy', true);
app.use(tlsEnforcement());

app.use(
  cors({
    origin: config.corsOrigins.length ? config.corsOrigins : true,
    credentials: true,
  }),
);
app.use(express.json());

// Per-visitor session (HttpOnly cookie → in-memory token store). Must run before any
// route so OAuth callbacks and API reads resolve the right visitor's tokens.
app.use(sessionMiddleware);

// Audit log: method + path + status + ms only — never request/response bodies and never
// the query string (no content, no PHI, no OAuth code/tokens). The "which source was
// read, when" trail from ARCHITECTURE.md §6. See audit.js. (MAD-14)
// eslint-disable-next-line no-console
app.use(auditMiddleware(console.log));

// Liveness.
app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// ── One-time Microsoft OAuth flow (run locally only, captures refresh token) ──
app.get('/auth/microsoft', (req, res) => {
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
  const url = new URL(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', MS_REDIRECT);
  url.searchParams.set('scope', MS_SCOPES);
  url.searchParams.set('response_mode', 'query');
  url.searchParams.set('prompt', 'select_account');
  res.redirect(url.toString());
});

async function handleMsCallback(req, res) {
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
      scope: MS_SCOPES,
    });
    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const json = await tokenRes.json();
    if (!tokenRes.ok) return res.status(502).send(`<h2>Token exchange failed</h2><pre>${JSON.stringify(json, null, 2)}</pre>`);

    const refreshToken = json.refresh_token;
    // Decode the id_token JWT claims — name claim is available from 'profile' scope.
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

    const frontendUrl = process.env.FRONTEND_URL || ''; // relative → same origin (single-port deploy)
    res.redirect(`${frontendUrl}/#/?auth=success`);
  } catch (err) {
    res.status(502).send(`<h2>Error</h2><pre>${err.message}</pre>`);
  }
}

// Canonical path + backward-compatible alias.
app.get('/auth/microsoft/callback', handleMsCallback);
app.get('/callback', handleMsCallback);

// ── One-time QuickBooks OAuth flow (run locally only, captures refresh token + realm) ──
app.get('/auth/qbo', (req, res) => {
  const clientId = config.qbo.clientId;
  if (!clientId) {
    return res.send(`<h2>QuickBooks login — set up</h2><p>Fill <code>QBO_CLIENT_ID</code> and <code>QBO_CLIENT_SECRET</code> in <code>backend/.env</code> first.</p>`);
  }
  const url = new URL('https://appcenter.intuit.com/connect/oauth2');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', QBO_SCOPES);
  url.searchParams.set('redirect_uri', QBO_REDIRECT);
  url.searchParams.set('state', 'madison-qbo');
  res.redirect(url.toString());
});

app.get('/auth/qbo/callback', async (req, res) => {
  const { code, realmId, error, error_description } = req.query;
  if (error) return res.status(400).send(`<h2>QBO auth error</h2><pre>${error}: ${error_description}</pre>`);
  if (!code || !realmId) return res.status(400).send('<h2>Missing code or realmId</h2>');
  const { clientId, clientSecret } = config.qbo;
  if (!clientId || !clientSecret) {
    return res.status(400).send('<h2>Missing QBO_CLIENT_ID / QBO_CLIENT_SECRET in backend/.env</h2>');
  }
  try {
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: QBO_REDIRECT,
    });
    const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body,
    });
    const json = await tokenRes.json();
    if (!tokenRes.ok) return res.status(502).send(`<h2>QBO token exchange failed</h2><pre>${JSON.stringify(json, null, 2)}</pre>`);

    // Store on THIS visitor's session only (in memory).
    const s = currentSession();
    s.qbo.refreshToken = json.refresh_token;
    s.qbo.realmId = String(realmId);
    s.qbo.accessToken = null;
    s.qbo.expiresAt = 0;

    const frontendUrl = process.env.FRONTEND_URL || ''; // relative → same origin (single-port deploy)
    res.redirect(`${frontendUrl}/#/financials`);
  } catch (err) {
    res.status(502).send(`<h2>Error</h2><pre>${err.message}</pre>`);
  }
});

// ── Sign out — clear THIS visitor's session tokens (other sessions untouched) ──
app.post('/auth/logout', (_req, res) => {
  clearCurrentSession();
  res.json({ ok: true });
});

app.use('/api', router);

// Unknown /api routes → JSON 404 (never fall through to the SPA).
app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));

// ── Serve the built frontend (single-port deploy) ─────────────────────────────
// If frontend/dist exists, this process serves the SPA too; otherwise it runs
// API-only (e.g. when the FE is hosted separately during development).
const haveFrontend = existsSync(path.join(FRONTEND_DIST, 'index.html'));
if (haveFrontend) {
  app.use(express.static(FRONTEND_DIST));
  // SPA fallback for any non-API/OAuth GET (HashRouter means this is mostly '/').
  app.get('*', (req, res, next) => {
    if (
      req.path.startsWith('/api') ||
      req.path.startsWith('/auth') ||
      req.path === '/callback' ||
      req.path === '/health'
    ) {
      return next();
    }
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
}

app.use((_req, res) => res.status(404).json({ error: 'not_found' }));

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(
    `Madison Command Center on http://localhost:${config.port}  ` +
      `(frontend=${haveFrontend ? 'served' : 'API-only'})`,
  );
});
