// MAD-27 — workbook READ audit (AC-8) + PHI-safe unmapped-column logging (AC-9). The report
// read addresses ePHI-adjacent operational workbooks (HIPAA profile), so each read emits an
// audit entry and any parse warning is reference-only. Both are pinned here with an injected
// log spy — no network, no PHI. Synthetic data only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workbookEvent, workbookUnmappedEvent } from '../src/audit.js';

const now = () => '2026-06-30T00:00:00.000Z';

// ── [AC-8] the workbook read is audited: who · what + item ref · when · outcome ───────────
test('[AC-8] workbookEvent(read) records session + item reference + outcome, no cell values', () => {
  const lines = [];
  workbookEvent('read', { sessionId: 'sess-1', ref: 'item-9,item-py', outcome: 'ok' }, (l) => lines.push(l), now);
  assert.equal(lines.length, 1);
  const line = lines[0];
  assert.match(line, /workbook read/);
  assert.match(line, /session=sess-1/);
  assert.match(line, /item=item-9,item-py/);   // item REFERENCES, not names/paths
  assert.match(line, /→ ok/);
  // never a cell value (a metric count) or a share-URL/token
  assert.doesNotMatch(line, /120|New Patients|sharepoint|http/i);
});

// ── [AC-9] unmapped columns surface PHI-safely: item + sheet + column INDEXES only ────────
test('[AC-9] workbookUnmappedEvent logs sheet + column indexes — never cell values or header text', () => {
  const lines = [];
  workbookUnmappedEvent(
    { sessionId: 'sess-1', ref: 'item-9', sheet: 'June Totals Madison', columns: [5, 11] },
    (l) => lines.push(l), now,
  );
  assert.equal(lines.length, 1);
  const line = lines[0];
  assert.match(line, /workbook unmapped/);
  assert.match(line, /item=item-9/);
  assert.match(line, /sheet="June Totals Madison"/); // tab name is a non-PHI reference
  assert.match(line, /columns=5,11/);                // column INDEXES, a reference
  // the free-typed cell values / "New Patients" notes never reach the log
  assert.doesNotMatch(line, /New Patients|Sprained Wombat|\b120\b|\b31\b/);
});

test('[AC-9] workbookUnmappedEvent on empty columns is still safe (no crash, "none")', () => {
  const lines = [];
  workbookUnmappedEvent({ sessionId: 'sess-1', ref: 'env', sheet: 'May Totals Madison' }, (l) => lines.push(l), now);
  assert.match(lines[0], /columns=none/);
});
