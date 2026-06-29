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
