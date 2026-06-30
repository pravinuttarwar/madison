// MAD-26 — workbook connection (paste → resolve → validate → persist → read).
// Unit tests on the connection logic with the Graph client injected, so the
// resolve/validate/persist/audit behavior is provable offline (no network, no creds).
// Synthetic data only — no real drive paths, share URLs, or PHI.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  classifyInput, saveWorkbook, readWorkbook, readWorkbooks, workbookRef, workbookRefs, workbookBase,
  connectWorkbook, WorkbookError,
} from '../src/workbook.js';

// A drive-item reference as the Graph resolvers return it (synthetic).
const REF = { driveId: 'drive-1', itemId: 'item-9', name: 'Weekly Report.xlsx' };
const SHARE_URL = 'https://contoso.sharepoint.com/:x:/s/ops/EabcWeekly.xlsx?e=secrettoken';

// Build injected deps with call-recording spies + an in-memory save.
function mkDeps(over = {}) {
  const calls = { resolve: [], validate: [], save: [], audit: [] };
  const deps = {
    sessionId: 'sess-abc',
    resolveShareUrl: async (v) => { calls.resolve.push(['share', v]); return REF; },
    resolveDrivePath: async (v) => { calls.resolve.push(['path', v]); return REF; },
    workbookReachable: async (r) => { calls.validate.push(r); return true; },
    save: (rec, file) => { calls.save.push([rec, file]); return { ...rec, connectedAt: 'T' }; },
    audit: (action, meta) => { calls.audit.push([action, meta]); },
    ...over,
  };
  return { deps, calls };
}

function tmpConfig() {
  const dir = mkdtempSync(path.join(tmpdir(), 'madison-wb-'));
  return { file: path.join(dir, 'nested', 'workbook.json'), dir };
}

test('[AC-1][AC-2] classifyInput distinguishes a share-URL from a drive path', () => {
  // AC-1: an http(s) URL is treated as a share-URL.
  assert.deepEqual(
    classifyInput('https://contoso.sharepoint.com/:x:/s/ops/EabcWeekly.xlsx?e=tok'),
    { kind: 'share-url', value: 'https://contoso.sharepoint.com/:x:/s/ops/EabcWeekly.xlsx?e=tok' },
  );
  // AC-2: anything else is a drive path; a leading slash is normalized in.
  assert.deepEqual(classifyInput('/Reports/Weekly.xlsx'), { kind: 'drive-path', value: '/Reports/Weekly.xlsx' });
  assert.deepEqual(classifyInput('Reports/Weekly.xlsx'), { kind: 'drive-path', value: '/Reports/Weekly.xlsx' });
  // Surrounding whitespace from a paste is trimmed.
  assert.deepEqual(classifyInput('  /Reports/Weekly.xlsx  '), { kind: 'drive-path', value: '/Reports/Weekly.xlsx' });
});

test('[AC-4] persistence stores only the location reference and survives a restart', () => {
  const { file, dir } = tmpConfig();
  try {
    // A connection carries the resolved location refs + workbook name + source — and a row
    // of (synthetic) "cell values" that must NEVER be persisted.
    saveWorkbook({
      driveId: 'drive-1', itemId: 'item-9', name: 'Weekly Report.xlsx', source: 'share-url',
      cellValues: [[22, 18]], // not part of the persisted record
    }, file);

    // Re-reading from disk simulates a backend restart (in-memory state is gone).
    const reloaded = readWorkbook(file);
    assert.equal(reloaded.driveId, 'drive-1');
    assert.equal(reloaded.itemId, 'item-9');
    assert.equal(reloaded.name, 'Weekly Report.xlsx');
    assert.equal(reloaded.source, 'share-url');
    // Drive-path only, never cell values. Pin the EXACT persisted key set — time-independent
    // (the older `.includes('22')` check false-failed when the connectedAt timestamp held "22").
    assert.ok(!('cellValues' in reloaded), 'cell values must not be persisted');
    assert.deepEqual(Object.keys(reloaded).sort(), ['connectedAt', 'driveId', 'itemId', 'name', 'source', 'year']);

    // workbookRef exposes just the item reference reports read from.
    assert.deepEqual(workbookRef(file), { driveId: 'drive-1', itemId: 'item-9' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// MAD-43 [AC-5]: the inline Reports connect reuses this flow — the resolve/validate audit must
// carry the item reference + outcome only, never the raw share-URL/token (no PHI, no secret).
test('[AC-5] connect audits resolve + validate by item reference, never the raw URL/token', async () => {
  const { deps, calls } = mkDeps();
  await connectWorkbook(SHARE_URL, deps);
  const byAction = Object.fromEntries(calls.audit.map(([a, m]) => [a, m]));
  assert.equal(byAction.resolve.ref, 'item-9');
  assert.equal(byAction.resolve.outcome, 'ok');
  assert.equal(byAction.validate.outcome, 'ok');
  const serialized = JSON.stringify(calls.audit);
  assert.doesNotMatch(serialized, /secrettoken/, 'no raw share-URL token in the audit');
  assert.doesNotMatch(serialized, /sharepoint\.com/, 'no share host in the audit');
});

test('[AC-5] multi-year: workbooks persist side-by-side keyed by year (no cell values)', () => {
  const { file, dir } = tmpConfig();
  try {
    // Connect a current-year file, then a prior-year file — different YEARS, both persisted.
    saveWorkbook({ driveId: 'd1', itemId: 'cur', name: '2026.xlsx', source: 'share-url', year: 2026 }, file);
    saveWorkbook({ driveId: 'd1', itemId: 'py', name: '2025.xlsx', source: 'drive-path', year: 2025 }, file);

    const all = readWorkbooks(file);
    assert.equal(all.length, 2, 'both years persisted side-by-side');
    // workbookRefs exposes every connected ref, tagged by year — what the reports route reads.
    const byYear = Object.fromEntries(workbookRefs(file).map((r) => [r.year, r]));
    assert.equal(byYear[2026].itemId, 'cur');
    assert.equal(byYear[2025].itemId, 'py');
    // current source = the LATEST year; readWorkbook()/workbookRef() return it (back-compat).
    assert.equal(readWorkbook(file).itemId, 'cur');
    assert.deepEqual(workbookRef(file), { driveId: 'd1', itemId: 'cur' });
    // re-connecting a YEAR REPLACES only that year (no duplicate), never clobbering the other.
    saveWorkbook({ driveId: 'd1', itemId: 'cur2', name: '2026b.xlsx', source: 'share-url', year: 2026 }, file);
    assert.equal(readWorkbooks(file).length, 2);
    assert.equal(workbookRef(file).itemId, 'cur2');
    // persisted store is location refs only — never cell values.
    assert.ok(!JSON.stringify(readWorkbooks(file)).match(/cellValues|values":\s*\[\[/));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('[AC-4] readWorkbook returns null and workbookRef null when no file exists (env fallback)', () => {
  const missing = path.join(tmpdir(), 'madison-wb-does-not-exist', 'nope.json');
  assert.equal(readWorkbook(missing), null);
  assert.equal(workbookRef(missing), null);
});

test('[AC-1] connect via share-URL resolves, validates and persists, returning the workbook name', async () => {
  const { deps, calls } = mkDeps();
  const result = await connectWorkbook(SHARE_URL, deps);
  // MAD-52: the result + persisted ref now carry a `year` (null when none was selected).
  assert.deepEqual(result, { connected: true, name: 'Weekly Report.xlsx', source: 'share-url', year: null });
  // Resolved via the SHARES endpoint, then reachability validated, then persisted.
  assert.deepEqual(calls.resolve, [['share', SHARE_URL]]);
  assert.equal(calls.validate.length, 1);
  assert.equal(calls.save.length, 1);
  // Persisted record is location refs only — never cell values.
  const [rec] = calls.save[0];
  assert.deepEqual(rec, { driveId: 'drive-1', itemId: 'item-9', name: 'Weekly Report.xlsx', source: 'share-url', year: null });
});

test('[AC-2] connect via drive path validates and persists the same way', async () => {
  const { deps, calls } = mkDeps();
  const result = await connectWorkbook('/Reports/Weekly.xlsx', deps);
  assert.equal(result.connected, true);
  assert.equal(result.source, 'drive-path');
  assert.deepEqual(calls.resolve, [['path', '/Reports/Weekly.xlsx']]);
  assert.equal(calls.save.length, 1);
});

test('[AC-6] connect makes only read-only calls — resolve + validate, never a write', async () => {
  // The injected dependency surface offers no write/mutate Graph call; assert connect uses
  // only the read resolvers + the reachability read (and the local persist), nothing else.
  const { deps, calls } = mkDeps();
  await connectWorkbook(SHARE_URL, deps);
  assert.equal(calls.resolve.length, 1);
  assert.equal(calls.validate.length, 1);
  assert.ok(!('write' in deps) && !('upload' in deps), 'no write capability is even available');
});

test('[AC-7] connect audits resolve + validate with the item reference and outcome', async () => {
  const { deps, calls } = mkDeps();
  await connectWorkbook(SHARE_URL, deps);
  const byAction = Object.fromEntries(calls.audit.map(([a, m]) => [a, m]));
  assert.equal(byAction.resolve.outcome, 'ok');
  assert.equal(byAction.resolve.ref, 'item-9');
  assert.equal(byAction.resolve.sessionId, 'sess-abc');
  assert.equal(byAction.validate.outcome, 'ok');
  assert.equal(byAction.validate.ref, 'item-9');
});

test('[AC-3] a not-reachable resolve throws, does NOT persist, and audits the denial', async () => {
  let saved = false;
  const { deps, calls } = mkDeps({
    resolveShareUrl: async () => { throw new Error('Graph GET /shares/u!SECRETBASE64/driveItem → 404'); },
    save: () => { saved = true; },
  });
  await assert.rejects(
    () => connectWorkbook(SHARE_URL, deps),
    (err) => {
      assert.ok(err instanceof WorkbookError);
      assert.equal(err.code, 'not_reachable');
      assert.ok(err.reason && err.reason.length > 0, 'carries a plain-language reason');
      return true;
    },
  );
  assert.equal(saved, false, 'a failed validation must not overwrite the persisted connection');
  // The denial is audited, with outcome denied and NO share-URL/base64 token in the meta.
  const denied = calls.audit.find(([a, m]) => a === 'resolve' && m.outcome === 'denied');
  assert.ok(denied, 'a denied resolve emits an audit entry');
});

test('[AC-8] a failed connect never surfaces the raw share-URL or its token in the error or audit', async () => {
  const { deps, calls } = mkDeps({
    // Graph error text embeds the base64-encoded URL (a token leak if propagated).
    resolveShareUrl: async () => { throw new Error('Graph GET /shares/u!aHR0cHM6c2VjcmV0/driveItem → 403'); },
  });
  let thrown;
  try { await connectWorkbook(SHARE_URL, deps); } catch (e) { thrown = e; }
  const serialized = JSON.stringify(calls.audit) + String(thrown && thrown.message) + String(thrown && thrown.reason);
  assert.doesNotMatch(serialized, /secrettoken/, 'the raw share-URL token must not leak');
  assert.doesNotMatch(serialized, /aHR0cHM6c2VjcmV0/, 'the encoded share token must not leak');
  assert.doesNotMatch(serialized, /sharepoint\.com/, 'the share host must not leak');
});

test('[AC-5] reads address the connected item when present, the env path only as fallback', () => {
  // A persisted connection → item-addressed read (NOT the env hardcode).
  assert.equal(
    workbookBase({ driveId: 'drive-1', itemId: 'item-9' }, '/me', '/env/Path.xlsx'),
    '/drives/drive-1/items/item-9',
  );
  // No connection → fall back to the env drive path.
  assert.equal(
    workbookBase(null, '/me', '/env/Path.xlsx'),
    '/me/drive/root:/env/Path.xlsx:',
  );
  // Neither connected nor configured → a clear error (not a silent empty read).
  assert.throws(() => workbookBase(null, '/me', ''), /not configured/);
});
