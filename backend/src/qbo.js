import { config } from './config.js';
import { qboToken } from './auth.js';
import { currentSession } from './session.js';
import { loadFixture } from './fixtures.js';

function base() {
  return config.qbo.environment === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com';
}

// The QBO company (realm) is per-session — captured at that visitor's OAuth callback.
function realm() {
  return currentSession()?.qbo.realmId || '';
}

// Read-only SQL-like query (the ONLY thing we call — never a write/POST to an entity).
export async function query(sql) {
  // TEST-ONLY (MBI-34): resolve from synthetic fixtures (the QueryResponse object).
  if (config.fixturesMode) {
    if (/FROM Deposit/i.test(sql)) return loadFixture('qbo', 'deposits.json');
    if (/FROM Purchase/i.test(sql)) return loadFixture('qbo', 'purchases.json');
    return {};
  }
  const token = await qboToken();
  const url =
    `${base()}/v3/company/${realm()}/query?query=${encodeURIComponent(sql)}` +
    `&minorversion=73`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`QBO query → ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.QueryResponse || {};
}

// A named report (e.g. ProfitAndLoss) over a date range.
export async function report(name, params = {}) {
  // TEST-ONLY (MBI-34 / MAD-23): resolve from synthetic fixtures (the raw report JSON).
  if (config.fixturesMode) {
    if (/ProfitAndLoss/i.test(name)) return loadFixture('qbo', 'profitandloss.json');
    return {};
  }
  const token = await qboToken();
  const qs = new URLSearchParams({ ...params, minorversion: '73' }).toString();
  const url = `${base()}/v3/company/${realm()}/reports/${name}?${qs}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`QBO report ${name} → ${res.status}: ${await res.text()}`);
  return res.json();
}

// Deposits + purchases for a date range. Variable spend excludes the fixed-cost accounts.
export async function deposits(fromISO, toISO) {
  const r = await query(
    `SELECT * FROM Deposit WHERE TxnDate >= '${fromISO}' AND TxnDate <= '${toISO}'`,
  );
  return r.Deposit || [];
}

export async function purchases(fromISO, toISO) {
  const r = await query(
    `SELECT * FROM Purchase WHERE TxnDate >= '${fromISO}' AND TxnDate <= '${toISO}'`,
  );
  return r.Purchase || [];
}
