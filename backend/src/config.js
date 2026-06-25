import 'dotenv/config';

// Tokens live in memory ONLY. They are captured exclusively via the live OAuth flow at
// runtime — never seeded from .env or disk. So every start begins disconnected and the
// owner connects Microsoft + QuickBooks per session. .env holds only app credentials
// (client id/secret/tenant) and config, never user refresh tokens.
const env = process.env;

export const config = {
  port: Number(env.PORT) || 8787,
  corsOrigins: (env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:4173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  // TEST-ONLY (MBI-34): when FIXTURES_DIR is set, graph.js/qbo.js resolve from synthetic
  // upstream fixtures instead of calling Microsoft/Intuit, so the real route + transforms
  // path runs against them in the gate. Never set in production — it bypasses OAuth/upstream.
  fixturesDir: env.FIXTURES_DIR || '',
  fixturesMode: Boolean(env.FIXTURES_DIR),

  // App credentials + non-secret config only. Per-visitor tokens (refresh token,
  // display name, QBO realm) live on the session (see session.js), never here.
  graph: {
    // Which Microsoft app/tenant the deployment is wired to: 'sandbox' (dev tenant, the
    // default) or 'production'. Drives the source-status badge — mirrors QBO_ENV.
    environment: env.MS_ENV || 'sandbox',
    tenantId: env.MS_TENANT_ID || '',
    clientId: env.MS_CLIENT_ID || '',
    clientSecret: env.MS_CLIENT_SECRET || '',
    user: env.MS_USER || '', // empty → use /me
    awaitingThresholdHours: Number(env.AWAITING_THRESHOLD_HOURS) || 48,
    awaitingLookbackDays: Number(env.AWAITING_LOOKBACK_DAYS) || 14,
    spreadsheetPath: env.SPREADSHEET_DRIVE_PATH || '',
    namedRanges: safeJson(env.SPREADSHEET_NAMED_RANGES) || {},
  },

  qbo: {
    environment: env.QBO_ENV || 'sandbox',
    clientId: env.QBO_CLIENT_ID || '',
    clientSecret: env.QBO_CLIENT_SECRET || '',
    fixedAccountIds: (env.QBO_FIXED_ACCOUNT_IDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },

  // Whether the app has the credentials to OFFER each source (not whether a given
  // visitor is connected — that's per-session). Drives the source-status badges.
  hasGraphCreds: Boolean(env.MS_CLIENT_ID && env.MS_CLIENT_SECRET),
  hasQboCreds: Boolean(env.QBO_CLIENT_ID && env.QBO_CLIENT_SECRET),
};

function safeJson(s) {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
