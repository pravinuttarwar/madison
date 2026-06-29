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

// Read the persisted connection, or null when none exists (→ env-path fallback applies).
// A missing/corrupt file is treated as "not connected", never an error.
export function readWorkbook(file) {
  try {
    return JSON.parse(readFileSync(configFile(file), 'utf8'));
  } catch {
    return null;
  }
}

// Persist ONLY the location reference (driveId/itemId/name/source) — never cell values.
// Whatever extra keys (e.g. fetched cell values) the caller passes are deliberately dropped.
export function saveWorkbook(ref, file) {
  const rec = {
    driveId: ref.driveId,
    itemId: ref.itemId,
    name: ref.name,
    source: ref.source,
    // tz-safe: connectedAt is an ISO-8601 UTC stamp for record-keeping only — never parsed
    // back or rendered as a time-of-day, so timezone/DST never enters in.
    connectedAt: new Date().toISOString(),
  };
  const f = configFile(file);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify(rec, null, 2));
  return rec;
}

// The item reference reports read from, or null when nothing is persisted (env fallback).
export function workbookRef(file) {
  const wb = readWorkbook(file);
  return wb && wb.driveId && wb.itemId ? { driveId: wb.driveId, itemId: wb.itemId } : null;
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

  const rec = save({ driveId: ref.driveId, itemId: ref.itemId, name: ref.name, source: kind }, file);
  return { connected: true, name: rec.name, source: kind };
}
