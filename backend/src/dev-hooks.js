// MAD-15 verification aid — a DEV-ONLY endpoint to force the Graph re-auth path on demand,
// so QA can verify AC-4 (rejected refresh token → 401 re-prompt) in seconds instead of
// revoking sessions at Microsoft and waiting out the access-token cache.
//
// It replaces the current session's refresh token with a guaranteed-invalid value and clears
// the cached access token. The NEXT Graph-backed request then attempts a refresh, Microsoft
// returns invalid_grant, and graphToken() runs the real re-auth path (clears creds → 401).
//
// SAFETY: mounted only when ALLOW_TEST_HOOKS=1 AND the deployment is not production. Off by
// default; never serves in prod. It touches only the caller's own in-memory session and never
// logs or returns a token value.

import { currentSession } from './session.js';

// Sentinel that Microsoft will reject on refresh — non-empty so graphToken() takes the
// refresh path (not the "no refresh token" 401 short-circuit in the route layer).
const INVALID = '__invalidated_by_test_hook__';

export function devHooksEnabled(env = process.env) {
  return env.ALLOW_TEST_HOOKS === '1' && (env.MS_ENV || 'sandbox') !== 'production';
}

// Invalidate a session's Graph credentials so the next refresh is rejected.
export function expireGraphToken(session) {
  if (!session) return;
  session.graph.refreshToken = INVALID;
  session.graph.accessToken = null;
  session.graph.expiresAt = 0;
}

// POST /auth/test/expire-graph — gated; invalidates the caller's session, else 404 (inert).
export function handleExpireGraph(_req, res, env = process.env) {
  if (!devHooksEnabled(env)) return res.status(404).json({ error: 'not_found' });
  expireGraphToken(currentSession());
  // No token value in the response — only a confirmation the next Graph call will re-auth.
  return res.status(200).json({ ok: true, expired: 'graph' });
}
