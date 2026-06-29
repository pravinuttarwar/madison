// Awaiting-response follow-up engine (MAD-18). Scans the owner's Sent Items, threads them
// into conversations, and surfaces those whose latest message is still the owner's and is
// older than the threshold — "I wrote, they never replied".
//
// Threading deliberately does NOT use Graph's conversationId: Outlook reports it
// unreliably for threading (forwards, cross-tenant replies and re-subjects split or merge
// it), so the customer's spec calls for grouping on conversationIndex + the RFC headers
// (Message-ID / In-Reply-To / References). conversationId is still used downstream only to
// FETCH a thread's messages (the one practical Graph filter) — never to decide which sent
// items are the same thread. The fetchers are injected (deps) so this whole engine is
// unit-testable without a live Graph or a spawned server.
//
// PHI-safe: this module never logs — it maps message metadata to DTOs and returns them.

import { awaitingItem } from './transforms.js';

// Read an internet message header by name (case-insensitive); '' when absent.
function header(msg, name) {
  const headers = msg && msg.internetMessageHeaders;
  if (!Array.isArray(headers)) return '';
  const lower = name.toLowerCase();
  const hit = headers.find((h) => h && typeof h.name === 'string' && h.name.toLowerCase() === lower);
  return hit && hit.value ? String(hit.value).trim() : '';
}

// First RFC Message-ID token in a header value (References is space-separated, root first).
function firstMessageId(value) {
  const m = String(value).match(/<[^>]+>/);
  if (m) return m[0];
  return String(value).trim().split(/\s+/)[0] || '';
}

// The conversation root encoded in the first 22 bytes of conversationIndex (base64);
// replies append 5-byte blocks, so thread members share this prefix. Returns '' if the
// value isn't decodable.
function conversationIndexPrefix(idx) {
  try {
    const hex = Buffer.from(String(idx), 'base64').subarray(0, 22).toString('hex');
    return hex || '';
  } catch {
    return '';
  }
}

// Stable per-thread key. RFC headers first (the reliable signal across mailboxes), then the
// message's own Message-ID (it is a thread root), then the conversationIndex prefix. Falls
// back to conversationId only when nothing better exists, so a message is never dropped.
export function threadKey(msg) {
  if (!msg) return '';
  const refs = header(msg, 'References');
  if (refs) return `mid:${firstMessageId(refs)}`;
  const inReplyTo = header(msg, 'In-Reply-To');
  if (inReplyTo) return `mid:${firstMessageId(inReplyTo)}`;
  if (msg.internetMessageId) return `mid:${String(msg.internetMessageId).trim()}`;
  if (msg.conversationIndex) {
    const prefix = conversationIndexPrefix(msg.conversationIndex);
    if (prefix) return `ci:${prefix}`;
  }
  if (msg.conversationId) return `cid:${msg.conversationId}`;
  return '';
}

// Collapse sent messages into one representative per thread — the latest send (by
// sentDateTime) carries the recipient + subject we show.
export function groupSentThreads(sentMessages) {
  const byKey = new Map();
  for (const msg of sentMessages || []) {
    const key = threadKey(msg);
    if (!key) continue;
    const prev = byKey.get(key);
    if (!prev || new Date(msg.sentDateTime) > new Date(prev.sentDateTime)) byKey.set(key, msg);
  }
  return [...byKey.values()];
}

// Build the awaiting list. deps: { listSentItems(lookbackDays), latestInThread(rep) }.
// cfg: { awaitingThresholdHours, awaitingLookbackDays, user }. nowMs is injectable for tests.
// tz-safe: ageH is an elapsed-millisecond DURATION (now - sentDateTime); no calendar/
// user-facing date is derived, so timezone/DST never enters in.
export async function computeAwaiting(deps, cfg, nowMs = Date.now()) {
  const { awaitingThresholdHours, awaitingLookbackDays, user } = cfg;
  const owner = (user || '').toLowerCase();
  const sent = await deps.listSentItems(awaitingLookbackDays);
  const reps = groupSentThreads(sent);
  const out = [];
  let idx = 0;
  for (const rep of reps) {
    const latest = await deps.latestInThread(rep);
    if (!latest) continue;
    const latestFrom = (latest.from?.emailAddress?.address || '').toLowerCase();
    const fromOwner = owner ? latestFrom === owner : true; // owner set → precise; unset → assume owner
    if (!fromOwner) continue; // the recipient replied (latest isn't ours) → not awaiting
    const ageH = (nowMs - new Date(latest.sentDateTime).getTime()) / 3_600_000;
    if (ageH >= awaitingThresholdHours) out.push(awaitingItem(rep, ageH, idx++));
  }
  return out.sort((a, b) => b.hours - a.hours);
}
