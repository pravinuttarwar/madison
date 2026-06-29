// Proxy-aware TLS enforcement (MAD-14). In production the app sits behind a
// TLS-terminating proxy (load balancer / platform edge), so it doesn't manage
// certificates itself — it trusts the proxy's X-Forwarded-Proto and redirects any
// plaintext request to https, and advertises HSTS. All of this is OFF by default so
// local dev (plain http on localhost) is untouched; ops flips FORCE_HTTPS=1 in prod.

const HSTS_VALUE = 'max-age=31536000; includeSubDomains';

// Did the request reach the proxy over https? Express sets req.secure from
// X-Forwarded-Proto when 'trust proxy' is on; we also read the header directly so the
// middleware is testable without the full Express app.
function isHttps(req) {
  if (req.secure) return true;
  const xf = (req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  return xf === 'https';
}

// Express middleware factory. enabled = FORCE_HTTPS=1.
// When enabled: set HSTS on every response and 308-redirect insecure requests to https
// (308 preserves method + body). When disabled: a transparent pass-through.
export function tlsEnforcement(env = process.env) {
  const enabled = env.FORCE_HTTPS === '1';
  if (!enabled) return (_req, _res, next) => next();
  return (req, res, next) => {
    res.setHeader('Strict-Transport-Security', HSTS_VALUE);
    if (!isHttps(req)) {
      const host = req.headers?.host || '';
      return res.redirect(308, `https://${host}${req.originalUrl}`);
    }
    next();
  };
}

// Whether the session cookie should carry the Secure flag. True under TLS enforcement
// (FORCE_HTTPS=1) or when explicitly opted in (COOKIE_SECURE=1) — so enabling TLS in
// prod also secures the cookie without a second toggle.
export function isSecureCookie(env = process.env) {
  return env.FORCE_HTTPS === '1' || env.COOKIE_SECURE === '1';
}
