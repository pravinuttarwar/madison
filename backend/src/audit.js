// Audit trail (MAD-14, AC-4/AC-5). One line per request — the "which source was read,
// when" trail from ARCHITECTURE.md §6. Logs method · path · status · ms only:
//  - never request/response BODIES (no content, no PHI), and
//  - never the QUERY STRING — an OAuth callback carries the authorization `code`, and
//    query params can carry tokens/PHI, so we log the pathname alone.
// Extracted from server.js so the safe-logging guarantee is unit-testable.

// The pathname with the query string removed (the only part safe to log).
export function auditPath(req) {
  const url = req.originalUrl || req.url || '';
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

// Auth-event audit entry (MAD-15, AC-6). Records WHO (session reference, not a name/PHI) ·
// WHAT (event: consent_granted | token_refresh | reauth_required) · WHEN · OUTCOME for the
// OAuth/token lifecycle — the "who connected / re-authed, when" trail. It receives only
// references: NEVER a token, client secret, or OAuth code value (MAD-15, AC-7). `log` and
// `now` are injectable for tests.
// tz-safe: now() is an ISO-8601 UTC audit timestamp for machine ordering — never parsed
// back or rendered to a user, so timezone/DST never enters in.
export function authEvent(event, { sessionId = 'none', source = 'graph', outcome = 'ok' } = {}, log = console.log, now = () => new Date().toISOString()) {
  log(`audit auth ${source} ${event} session=${sessionId} → ${outcome} @${now()}`);
}

// Workbook-access audit entry (MAD-26, AC-7). Records WHO (session reference, not a name/PHI) ·
// WHAT (action: resolve | validate | read + the drive-ITEM reference, not the share-URL) · WHEN ·
// OUTCOME (ok | denied) for the weekly-report workbook connection — the "who resolved/validated/
// read which workbook, when" trail. It receives only references: NEVER the raw share-URL (which can
// embed an access token) and NEVER cell values (MAD-26, AC-8). `log` and `now` are injectable.
// tz-safe: now() is an ISO-8601 UTC audit timestamp for machine ordering — never parsed back or
// rendered to a user, so timezone/DST never enters in.
export function workbookEvent(action, { sessionId = 'none', ref = 'none', outcome = 'ok' } = {}, log = console.log, now = () => new Date().toISOString()) {
  log(`audit workbook ${action} session=${sessionId} item=${ref} → ${outcome} @${now()}`);
}

// Express middleware factory. `log` and `now` are injectable for tests.
// tz-safe: now() is used only for an elapsed-millisecond duration (end - start); no
// calendar/user-facing time, so timezone/DST never enters in.
export function auditMiddleware(log = console.log, now = Date.now) {
  return (req, res, next) => {
    const start = now();
    res.on('finish', () => {
      log(`${req.method} ${auditPath(req)} → ${res.statusCode} (${now() - start}ms)`);
    });
    next();
  };
}
