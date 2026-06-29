// MAD-14 — proxy-aware TLS enforcement + HSTS + secure-cookie gating.
// Unit tests on the middleware/helpers through their public interface (fake req/res),
// so they pin behavior without needing a real TLS socket. Synthetic data only.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tlsEnforcement, isSecureCookie } from '../src/security.js';

// Minimal Express-ish req/res doubles.
function mkReq({ proto, method = 'GET', url = '/api/dashboard', host = 'app.example.com' } = {}) {
  const headers = { host };
  if (proto) headers['x-forwarded-proto'] = proto;
  return { method, originalUrl: url, url, headers, get: (h) => headers[h.toLowerCase()] };
}
function mkRes() {
  return {
    statusCode: 200,
    headers: {},
    redirected: null,
    finished: false,
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
    },
    getHeader(k) {
      return this.headers[k.toLowerCase()];
    },
    redirect(status, location) {
      this.statusCode = status;
      this.redirected = location;
      this.finished = true;
    },
  };
}

test('[AC-1] enforcement on: X-Forwarded-Proto http redirects to the same URL on https', () => {
  const mw = tlsEnforcement({ FORCE_HTTPS: '1' });
  const req = mkReq({ proto: 'http', url: '/api/dashboard?view=monday' });
  const res = mkRes();
  let nexted = false;
  mw(req, res, () => {
    nexted = true;
  });
  assert.equal(nexted, false, 'must not fall through on an insecure request');
  assert.ok(res.statusCode >= 300 && res.statusCode < 400, `expected a redirect, got ${res.statusCode}`);
  assert.equal(res.redirected, 'https://app.example.com/api/dashboard?view=monday');
});

test('[AC-1] enforcement on: X-Forwarded-Proto https passes through (no redirect)', () => {
  const mw = tlsEnforcement({ FORCE_HTTPS: '1' });
  const req = mkReq({ proto: 'https' });
  const res = mkRes();
  let nexted = false;
  mw(req, res, () => {
    nexted = true;
  });
  assert.equal(nexted, true, 'a secure request must proceed');
  assert.equal(res.redirected, null);
});

test('[AC-1] enforcement off (FORCE_HTTPS unset): http is NOT redirected (local dev)', () => {
  const mw = tlsEnforcement({});
  const req = mkReq({ proto: 'http' });
  const res = mkRes();
  let nexted = false;
  mw(req, res, () => {
    nexted = true;
  });
  assert.equal(nexted, true, 'with enforcement off, requests proceed untouched');
  assert.equal(res.redirected, null);
});

test('[AC-2] enforcement on: a secure response carries the HSTS header', () => {
  const mw = tlsEnforcement({ FORCE_HTTPS: '1' });
  const req = mkReq({ proto: 'https' });
  const res = mkRes();
  mw(req, res, () => {});
  const hsts = res.getHeader('Strict-Transport-Security');
  assert.ok(hsts && /max-age=\d+/.test(hsts), `expected an HSTS header, got ${hsts}`);
});

test('[AC-2] enforcement off: no HSTS header is set', () => {
  const mw = tlsEnforcement({});
  const req = mkReq({ proto: 'https' });
  const res = mkRes();
  mw(req, res, () => {});
  assert.equal(res.getHeader('Strict-Transport-Security'), undefined);
});

test('[AC-2] session cookie is Secure when FORCE_HTTPS=1 or COOKIE_SECURE=1, else not', () => {
  assert.equal(isSecureCookie({ FORCE_HTTPS: '1' }), true);
  assert.equal(isSecureCookie({ COOKIE_SECURE: '1' }), true);
  assert.equal(isSecureCookie({}), false);
});
