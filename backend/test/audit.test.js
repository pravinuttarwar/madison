// MAD-14 — audit trail (AC-4) + PHI-/secret-safe logging (AC-5).
// The audit middleware is the single request logger. These tests pin that it records
// method · path · status · ms, never request bodies, and never the query string (which
// can carry the OAuth `code` or other secrets). Synthetic data only.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditMiddleware, auditPath } from '../src/audit.js';

function mkReq({ method = 'GET', url = '/api/dashboard', body } = {}) {
  return { method, originalUrl: url, url, body };
}
function mkRes(statusCode = 200) {
  const handlers = {};
  return {
    statusCode,
    on(ev, cb) {
      handlers[ev] = cb;
    },
    finish() {
      handlers.finish && handlers.finish();
    },
  };
}

test('[AC-4] logs method, path, status and elapsed ms for an /api request', () => {
  const lines = [];
  const mw = auditMiddleware((l) => lines.push(l));
  const req = mkReq({ method: 'GET', url: '/api/financials' });
  const res = mkRes(200);
  let nexted = false;
  mw(req, res, () => {
    nexted = true;
  });
  assert.equal(nexted, true, 'middleware must call next so the request proceeds');
  res.finish();
  assert.equal(lines.length, 1);
  assert.match(lines[0], /GET/);
  assert.match(lines[0], /\/api\/financials/);
  assert.match(lines[0], /200/);
  assert.match(lines[0], /\(\d+ms\)/);
});

test('[AC-4] never logs the request body (no content/PHI in the audit line)', () => {
  const lines = [];
  const mw = auditMiddleware((l) => lines.push(l));
  // A synthetic body that would be a PHI leak if it ever reached the log.
  const req = mkReq({ method: 'POST', url: '/api/anything', body: { patientName: 'Jane Synthetic', mrn: 'MRN-000123' } });
  const res = mkRes(404);
  mw(req, res, () => {});
  res.finish();
  assert.equal(lines.length, 1);
  assert.doesNotMatch(lines[0], /Jane Synthetic/);
  assert.doesNotMatch(lines[0], /MRN-000123/);
});

test('[AC-5] strips the query string so the OAuth code / tokens never land in logs', () => {
  const lines = [];
  const mw = auditMiddleware((l) => lines.push(l));
  const req = mkReq({ method: 'GET', url: '/auth/microsoft/callback?code=SECRET_AUTH_CODE_123&state=xyz' });
  const res = mkRes(302);
  mw(req, res, () => {});
  res.finish();
  assert.equal(lines.length, 1);
  assert.match(lines[0], /\/auth\/microsoft\/callback/);
  assert.doesNotMatch(lines[0], /SECRET_AUTH_CODE_123/);
  assert.doesNotMatch(lines[0], /state=xyz/);
});

test('[AC-5] auditPath returns the pathname without the query string', () => {
  assert.equal(auditPath({ originalUrl: '/api/x?token=abc' }), '/api/x');
  assert.equal(auditPath({ originalUrl: '/api/x' }), '/api/x');
});
