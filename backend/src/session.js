// Per-visitor sessions. Each browser gets an HttpOnly cookie (mcc_sid) mapped to an
// in-memory session that holds THAT visitor's Microsoft + QuickBooks tokens — so two
// browsers authenticate independently and only ever see their own data. Tokens are
// carried through the request via AsyncLocalStorage (no need to thread req everywhere).
//
// In-memory only (single container, by design): a restart drops all sessions and
// everyone re-authenticates. Nothing is written to disk.

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';

const COOKIE = 'mcc_sid';
const TTL_MS = 12 * 60 * 60 * 1000; // 12h idle lifetime

export const sessionContext = new AsyncLocalStorage();
const sessions = new Map(); // sid → session

function freshTokens() {
  return {
    graph: { refreshToken: '', displayName: '', accessToken: null, expiresAt: 0 },
    qbo: { refreshToken: '', realmId: '', accessToken: null, expiresAt: 0 },
  };
}

export function currentSession() {
  return sessionContext.getStore() || null;
}

function parseSid(req) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    if (part.slice(0, i).trim() === COOKIE) return part.slice(i + 1).trim();
  }
  return null;
}

// Drop sessions untouched for longer than the TTL so the map can't grow unbounded.
function sweep() {
  const cutoff = Date.now() - TTL_MS;
  for (const [sid, s] of sessions) if (s.lastSeen < cutoff) sessions.delete(sid);
}

export function sessionMiddleware(req, res, next) {
  let sid = parseSid(req);
  if (!sid || !sessions.has(sid)) {
    if (sessions.size > 5000) sweep();
    sid = randomBytes(18).toString('hex');
    // `reports.sources` = the spreadsheet links the owner pastes, keyed by year (or the
    // local test files). Pointers, not data; kept across logout within the same browser.
    sessions.set(sid, { id: sid, lastSeen: Date.now(), reports: { sources: [] }, ...freshTokens() });
    res.cookie(COOKIE, sid, {
      httpOnly: true,
      sameSite: 'lax', // sent on the top-level OAuth redirect back to /callback
      secure: process.env.COOKIE_SECURE === '1',
      path: process.env.COOKIE_PATH || '/',
      maxAge: TTL_MS,
    });
  }
  const session = sessions.get(sid);
  session.lastSeen = Date.now();
  sessionContext.run(session, () => next());
}

// Sign out THIS browser only — clears its tokens, leaving other sessions intact.
export function clearCurrentSession() {
  const s = currentSession();
  if (s) Object.assign(s, freshTokens());
}
