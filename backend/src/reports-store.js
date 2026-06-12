// Persisted list of report spreadsheet sources (the practice's file links, keyed by
// year). This is PRACTICE-LEVEL CONFIG, not customer data — a handful of share-link
// pointers — so it's global (same for everyone) and survives restarts. Stored as a
// small JSON file next to the process (gitignored, chmod 600). No PHI, no patient data.
//
// Each entry: { kind:'url'|'local', year, url?, file?, fileName? }.

import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const FILE =
  process.env.REPORTS_STORE_FILE ||
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../.reports-sources.json');

let cache = null;

export function loadSources() {
  if (cache) return cache;
  try {
    cache = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : [];
  } catch {
    cache = [];
  }
  return cache;
}

export function saveSources(list) {
  cache = Array.isArray(list) ? list : [];
  try {
    writeFileSync(FILE, JSON.stringify(cache, null, 2));
    chmodSync(FILE, 0o600);
  } catch {
    /* best-effort persistence; the in-memory copy still works this run */
  }
  return cache;
}
