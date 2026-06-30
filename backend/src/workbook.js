// MAD-26 — workbook connection: resolve a pasted OneDrive/SharePoint share-URL or drive
// path to a Graph drive item, confirm read-only reachability, and persist ONLY the
// location reference (driveId/itemId/name) as non-PHI config — never cell values.
//
// Persistence is a small server-side JSON file (config.workbookConfigPath, gitignored),
// not a DB: the backend stays DB-less and keeps NO PHI at rest (a drive path/id is config,
// not patient data). SPREADSHEET_DRIVE_PATH (env) remains the fallback when no file exists.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from './config.js';

function configFile(file) {
  return file || config.workbookConfigPath;
}

// MAD-27: the report can read MORE than one workbook (e.g. a prior-year file for YoY), so the
// persisted state is an ARRAY of refs, each tagged with a role ('current' | 'prevYear'). The
// store stays a small server-side JSON file (NON-PHI location refs only — never cell values),
// so the backend remains DB-less with no PHI at rest.
export const DEFAULT_ROLE = 'current';

// All persisted connections as an array. BACK-COMPAT: a legacy single-object file (MAD-26)
// reads as a one-element array tagged 'current'. Missing/corrupt → [] (→ env fallback).
export function readWorkbooks(file) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(configFile(file), 'utf8'));
  } catch {
    return [];
  }
  if (Array.isArray(raw)) return raw;
  if (raw && raw.driveId) return [{ ...raw, role: raw.role || DEFAULT_ROLE }]; // legacy single object
  return [];
}

// The connection for a role as a flat object, or null. readWorkbook() (no role) returns the
// 'current' one — back-compat for callers/tests that expect a single connection.
export function readWorkbook(file, role = DEFAULT_ROLE) {
  return readWorkbooks(file).find((w) => (w.role || DEFAULT_ROLE) === role) || null;
}

// Persist ONLY the location reference (driveId/itemId/name/source/role) — never cell values.
// Upserts by ROLE into the array, so connecting a prior-year file doesn't clobber the current
// one (and re-connecting a role replaces it). Extra keys (e.g. fetched values) are dropped.
export function saveWorkbook(ref, file) {
  const role = ref.role || DEFAULT_ROLE;
  const rec = {
    driveId: ref.driveId,
    itemId: ref.itemId,
    name: ref.name,
    source: ref.source,
    role,
    // tz-safe: connectedAt is an ISO-8601 UTC stamp for record-keeping only — never parsed
    // back or rendered as a time-of-day, so timezone/DST never enters in.
    connectedAt: new Date().toISOString(),
  };
  const others = readWorkbooks(file).filter((w) => (w.role || DEFAULT_ROLE) !== role);
  const f = configFile(file);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify([...others, rec], null, 2));
  return rec;
}

// The item reference reports read from for a role, or null when nothing is persisted.
export function workbookRef(file, role = DEFAULT_ROLE) {
  const wb = readWorkbook(file, role);
  return wb && wb.driveId && wb.itemId ? { driveId: wb.driveId, itemId: wb.itemId } : null;
}

// Every persisted ref with both ids, tagged by role — what the reports route iterates.
export function workbookRefs(file) {
  return readWorkbooks(file)
    .filter((w) => w.driveId && w.itemId)
    .map((w) => ({ role: w.role || DEFAULT_ROLE, driveId: w.driveId, itemId: w.itemId, name: w.name }));
}

// The Graph base segment a workbook read addresses: the connected drive item when a
// connection is persisted, else the env drive path (root-relative), else a clear error.
// Pure + injected (ref/root/envPath) so the read-source precedence is unit-testable.
export function workbookBase(ref, root, envPath) {
  if (ref && ref.driveId && ref.itemId) return `/drives/${ref.driveId}/items/${ref.itemId}`;
  if (envPath) return `${root}/drive/root:${envPath}:`;
  throw new Error('SPREADSHEET_DRIVE_PATH not configured');
}

// Classify pasted input: an http(s) URL is a share-URL; anything else is a drive path
// (a leading slash is normalized in). Whitespace from a paste is trimmed.
export function classifyInput(input) {
  const s = String(input || '').trim();
  if (/^https?:\/\//i.test(s)) return { kind: 'share-url', value: s };
  return { kind: 'drive-path', value: s.startsWith('/') ? s : `/${s}` };
}

// A connection failure the route maps to a "not reachable" response. Carries a code and a
// plain-language reason for the UI — and deliberately NOT the upstream error (whose text can
// embed the share-URL/token), so the token never propagates (AC-8).
export class WorkbookError extends Error {
  constructor(code, reason) {
    super(code);
    this.name = 'WorkbookError';
    this.code = code;
    this.reason = reason;
  }
}

// Orchestrate a connect: resolve the pasted share-URL/path → a drive item, confirm read-only
// reachability, then persist ONLY the location reference. Every Graph dependency is injected so
// the flow is unit-testable offline. Audits resolve + validate (item reference, never the URL or
// cell values). On any upstream failure it throws WorkbookError WITHOUT persisting — so a bad
// paste never clobbers an existing connection (AC-3) — and never echoes the raw URL/token (AC-8).
export async function connectWorkbook(input, deps) {
  const {
    resolveShareUrl, resolveDrivePath, workbookReachable,
    audit = () => {}, save = saveWorkbook, configFile: file, sessionId = 'none',
    role = DEFAULT_ROLE,
  } = deps;
  const { kind, value } = classifyInput(input);

  let ref;
  try {
    ref = kind === 'share-url' ? await resolveShareUrl(value) : await resolveDrivePath(value);
  } catch {
    // No item reference yet — log 'unresolved', never the input URL/path.
    audit('resolve', { sessionId, ref: 'unresolved', outcome: 'denied' });
    throw new WorkbookError('not_reachable', "We couldn't open that link. Check the share-URL or drive path and that you have access to the file.");
  }
  audit('resolve', { sessionId, ref: ref.itemId, outcome: 'ok' });

  try {
    await workbookReachable(ref);
  } catch {
    audit('validate', { sessionId, ref: ref.itemId, outcome: 'denied' });
    throw new WorkbookError('not_reachable', "We found the file but couldn't read it as a workbook. Confirm it's an Excel file you can open.");
  }
  audit('validate', { sessionId, ref: ref.itemId, outcome: 'ok' });

  const rec = save({ driveId: ref.driveId, itemId: ref.itemId, name: ref.name, source: kind, role }, file);
  return { connected: true, name: rec.name, source: kind, role: rec.role };
}
