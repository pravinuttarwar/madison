// Unit tests for the awaiting-response follow-up engine (MAD-18). The engine threads the
// owner's Sent Items into conversations using conversationIndex + RFC headers (Message-ID /
// In-Reply-To / References) — NOT conversationId, which Outlook reports unreliably for
// threading (forwards / cross-tenant replies split it). These are pure unit tests with
// injected fetchers, so the threading + detection logic is exercised without a live Graph
// or a spawned server. SYNTHETIC data only — no real PHI.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { threadKey, groupSentThreads, computeAwaiting } from '../src/awaiting.js';
import { awaitingItem } from '../src/transforms.js';
import { errorResponse } from '../src/routes.js';

const NOW = new Date('2026-06-15T12:00:00Z').getTime();
const HOUR = 3_600_000;
const ago = (hours) => new Date(NOW - hours * HOUR).toISOString();
const CFG = { awaitingThresholdHours: 48, awaitingLookbackDays: 14, user: 'owner@madison.example' };

const ownerLatest = (sentDateTime) => ({ from: { emailAddress: { address: 'owner@madison.example' } }, sentDateTime });
const otherLatest = (sentDateTime) => ({ from: { emailAddress: { address: 'lab@external.example' } }, sentDateTime });

// ── [AC-1] threading by RFC headers + conversationIndex, never conversationId ──

test('[AC-1] References header groups a reply with its root — even with a different conversationId', () => {
  const root = { internetMessageId: '<root@madison.example>', conversationId: 'A' };
  const reply = {
    internetMessageHeaders: [{ name: 'References', value: '<root@madison.example> <mid2@x.example>' }],
    conversationId: 'B', // deliberately different — must NOT change the grouping
  };
  assert.equal(threadKey(root), threadKey(reply));
});

test('[AC-1] In-Reply-To is used to thread when there is no References header', () => {
  const root = { internetMessageId: '<root@madison.example>' };
  const reply = { internetMessageHeaders: [{ name: 'In-Reply-To', value: '<root@madison.example>' }] };
  assert.equal(threadKey(reply), threadKey(root));
});

test('[AC-1] conversationIndex prefix threads messages with no RFC headers and differing conversationId', () => {
  const rootBuf = Buffer.alloc(22, 7); // 22-byte conversation root header
  const replyBuf = Buffer.concat([rootBuf, Buffer.alloc(5, 9)]); // reply appends a 5-byte block
  const a = { conversationIndex: rootBuf.toString('base64'), conversationId: 'X' };
  const b = { conversationIndex: replyBuf.toString('base64'), conversationId: 'Y' };
  assert.equal(threadKey(a), threadKey(b));
  assert.ok(threadKey(a).startsWith('ci:'), 'falls back to the conversationIndex prefix, not conversationId');
});

test('[AC-1] a message with NO conversationId still threads via its Message-ID', () => {
  assert.ok(threadKey({ internetMessageId: '<z@madison.example>' }));
});

test('[AC-1] groupSentThreads collapses a thread to one representative (latest sent wins)', () => {
  const root = { id: 's1', internetMessageId: '<root@madison.example>', sentDateTime: ago(120), conversationId: 'c1' };
  const followup = {
    id: 's2',
    internetMessageHeaders: [{ name: 'References', value: '<root@madison.example>' }],
    sentDateTime: ago(72),
    conversationId: 'c1',
  };
  const reps = groupSentThreads([root, followup]);
  assert.equal(reps.length, 1);
  assert.equal(reps[0].id, 's2'); // the later send represents the thread
});

// ── [AC-2] awaiting detection (latest from owner, past threshold) ──

const sentMsg = (over = {}) => ({
  id: 's1',
  internetMessageId: '<r1@madison.example>',
  conversationId: 'c1',
  sentDateTime: ago(120),
  toRecipients: [{ emailAddress: { name: 'External Lab', address: 'lab@external.example' } }],
  subject: 'Lab results follow-up',
  ...over,
});

test('[AC-2] thread whose latest message is the owner and is past threshold yields one item', async () => {
  const deps = {
    listSentItems: async () => [sentMsg()],
    latestInThread: async () => ownerLatest(ago(120)), // 5 days, owner is latest → no reply
  };
  const out = await computeAwaiting(deps, CFG, NOW);
  assert.equal(out.length, 1);
  assert.equal(out[0].to, 'External Lab');
});

test('[AC-2] thread whose latest message is a reply from someone else is excluded', async () => {
  const deps = {
    listSentItems: async () => [sentMsg()],
    latestInThread: async () => otherLatest(ago(10)), // recipient replied → not awaiting
  };
  const out = await computeAwaiting(deps, CFG, NOW);
  assert.deepEqual(out, []);
});

test('[AC-2] thread younger than the threshold is excluded', async () => {
  const deps = {
    listSentItems: async () => [sentMsg({ sentDateTime: ago(1) })],
    latestInThread: async () => ownerLatest(ago(1)), // 1h < 48h
  };
  const out = await computeAwaiting(deps, CFG, NOW);
  assert.deepEqual(out, []);
});

// ── [AC-3] ordering by days/hours waiting descending ──

test('[AC-3] multiple awaiting items are ordered longest-waiting first', async () => {
  const young = sentMsg({ id: 'sy', internetMessageId: '<y@x>', conversationId: 'cy', sentDateTime: ago(72), subject: 'Younger' });
  const old = sentMsg({ id: 'so', internetMessageId: '<o@x>', conversationId: 'co', sentDateTime: ago(240), subject: 'Older' });
  const latestById = { sy: ownerLatest(ago(72)), so: ownerLatest(ago(240)) };
  const deps = {
    listSentItems: async () => [young, old],
    latestInThread: async (rep) => latestById[rep.id],
  };
  const out = await computeAwaiting(deps, CFG, NOW);
  assert.equal(out.length, 2);
  assert.ok(out[0].hours > out[1].hours, 'oldest-waiting first');
  assert.equal(out[0].subject, 'Older');
});

// ── [AC-4] DTO shape preserved for the EmailQueue consumer ──

test('[AC-4] awaitingItem keeps the exact frontend DTO shape', () => {
  const item = awaitingItem(sentMsg(), 50, 0);
  assert.deepEqual(Object.keys(item).sort(), ['days', 'detail', 'hours', 'id', 'subject', 'to', 'wait']);
  assert.equal(typeof item.hours, 'number');
  assert.equal(typeof item.wait, 'string');
});

// ── [AC-5] injected config (threshold / owner) is honored ──

test('[AC-5] a higher configured threshold excludes a thread under it', async () => {
  const deps = {
    listSentItems: async () => [sentMsg({ sentDateTime: ago(100) })],
    latestInThread: async () => ownerLatest(ago(100)), // 100h
  };
  const out = await computeAwaiting(deps, { ...CFG, awaitingThresholdHours: 200 }, NOW);
  assert.deepEqual(out, []);
});

test('[AC-5] only the owner being the latest sender counts as awaiting', async () => {
  const deps = {
    listSentItems: async () => [sentMsg()],
    latestInThread: async () => ownerLatest(ago(120)),
  };
  // A different configured owner → the latest sender is no longer "the owner" → excluded.
  const out = await computeAwaiting(deps, { ...CFG, user: 'someone-else@madison.example' }, NOW);
  assert.deepEqual(out, []);
});

// ── [AC-6] source-state mapping + empty result ──

test('[AC-6] errorResponse maps not_authenticated→401 and other failures→502 for outlook', () => {
  assert.equal(errorResponse('outlook', new Error('not_authenticated')).status, 401);
  assert.equal(errorResponse('outlook', new Error('upstream boom')).status, 502);
});

test('[AC-6] no awaiting threads returns an empty array', async () => {
  const out = await computeAwaiting({ listSentItems: async () => [], latestInThread: async () => null }, CFG, NOW);
  assert.deepEqual(out, []);
});
