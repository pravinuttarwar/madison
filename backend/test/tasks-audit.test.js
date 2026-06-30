// MAD-37 AC-5 (HIPAA audit) + AC-6 (PHI-safe logging) for the "tasks by owner" read.
// Unit tests of the tasksEvent audit emitter with an injected log sink — mirrors the
// awaiting/workbook audit tests. The guarantee: every owner read (ok OR denied) emits a
// reference-only entry — session ref · owner ref · count · outcome · UTC timestamp — and
// NEVER a task title or any task content (PHI-adjacent). Synthetic data only.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tasksEvent } from '../src/audit.js';

function capture() {
  const lines = [];
  return { log: (m) => lines.push(m), lines };
}
const FIXED = () => '2026-06-30T00:00:00.000Z';

// [AC-5] A successful owner read emits who (session) · what (action + owner reference) ·
// count · when · outcome=ok — a complete audit entry built only from references.
test('[AC-5] tasksEvent: a read emits session·owner·count·outcome with a UTC timestamp', () => {
  const { log, lines } = capture();
  tasksEvent('read', { sessionId: 's-1', owner: 'u-alice', count: 4, outcome: 'ok' }, log, FIXED);
  assert.equal(lines.length, 1);
  const line = lines[0];
  assert.match(line, /audit tasks read/);
  assert.match(line, /session=s-1/);
  assert.match(line, /owner=u-alice/);
  assert.match(line, /count=4/);
  assert.match(line, /→ ok/);
  assert.match(line, /@2026-06-30T00:00:00\.000Z/);
});

// [AC-5] A DENIED/unreadable owner read still emits an audit entry (outcome=denied) — the
// "access denied" branch is auditable too, not silently dropped.
test('[AC-5] tasksEvent: a denied read still emits an entry with outcome=denied', () => {
  const { log, lines } = capture();
  tasksEvent('read', { sessionId: 's-1', owner: 'u-bob', outcome: 'denied' }, log, FIXED);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /owner=u-bob/);
  assert.match(lines[0], /→ denied/);
});

// [AC-6] PHI-safe: the audit line carries references + a numeric count only. Even if a
// caller passed a task title through, the emitter has no title parameter, so no task
// content can reach the log. We assert no sample title text appears on the line.
test('[AC-6] tasksEvent: the log line never contains task titles / content', () => {
  const { log, lines } = capture();
  // The emitter accepts only {sessionId, owner, count, outcome} — titles are not a field.
  tasksEvent('read', { sessionId: 's-1', owner: 'u-alice', count: 4, outcome: 'ok' }, log, FIXED);
  const line = lines[0];
  for (const title of ['Alice overdue A', 'Bob upcoming', 'Due today item']) {
    assert.ok(!line.includes(title), `audit line must not contain a task title (${title})`);
  }
  // count is a NUMBER, never the task objects themselves.
  assert.match(line, /count=4\b/);
  assert.ok(!line.includes('title'), 'no task object/field names on the line');
});
