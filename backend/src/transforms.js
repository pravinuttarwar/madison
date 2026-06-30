// Map raw Microsoft Graph / QuickBooks payloads → the exact front-end DTO shapes
// (see frontend/src/lib/api.ts). These are best-effort against the documented response
// shapes; tune field paths against real sandbox responses on Day 2–3 of the build.

// ── time formatting ──────────────────────────────────────────────────────────
function hhmm(d) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function relativeTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yest = new Date(now.getTime() - 86_400_000).toDateString() === d.toDateString();
  if (sameDay) return `Today · ${hhmm(d)}`;
  if (yest) return d.getHours() >= 21 ? `Last night · ${hhmm(d)}` : `Yesterday · ${hhmm(d)}`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ` · ${hhmm(d)}`;
}
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// QuickBooks TxnDate (and other date-only "YYYY-MM-DD" values) are calendar dates in
// the company's local zone, NOT instants. `new Date("2026-06-24")` parses as UTC
// midnight, which rolls back a day once read with local getters in a negative-offset
// zone (ET). Parse the parts into a local Date so the weekday/day bucket is correct.
// The process runs in the practice zone (TZ=America/New_York), so "local" = practice.
function parseLocalDate(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
// Format a Date as "YYYY-MM-DD" in the process-local (practice) zone — the local-zone
// counterpart to toISOString().slice(0,10), which would give the UTC date instead.
function localYmd(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}
// Microsoft Graph returns event times as a ZONELESS dateTime + a separate timeZone
// field (UTC by default — no trailing Z). Plain `new Date(dateTime)` on a zoneless
// string assumes the process-local zone, which is wrong. Combine the two into the
// correct instant: honour an explicit Z/offset, else read the stated zone (UTC).
function graphInstant(slot) {
  if (slot == null) return new Date(NaN);
  if (typeof slot === 'string') return new Date(slot);
  const dt = slot.dateTime;
  if (!dt) return new Date(slot);
  // Already an unambiguous instant (trailing Z or ±HH:MM offset) → use as-is.
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(dt)) return new Date(dt);
  // Zoneless: Graph's default zone is UTC (we also request Prefer: outlook.timezone=UTC),
  // so read it as UTC. A named zone is best-effort as-is (we force UTC upstream).
  if (!slot.timeZone || slot.timeZone === 'UTC') return new Date(dt + 'Z');
  return new Date(dt);
}

function decodeHtmlBody(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, ' ')          // strip tags
    .replace(/&#(\d+);/g, (_, n) => {  // numeric entities
      const cp = Number(n);
      if (cp === 65279 || cp === 8203 || cp === 160) return ' '; // BOM / ZW-space / nbsp
      return String.fromCharCode(cp);
    })
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/﻿/g, '')            // BOM character
    .replace(/\s+/g, ' ')
    .trim();
}

// ── email ────────────────────────────────────────────────────────────────────
// Phase-1 category classifier (MBI-19). Importance is already rule-based above; the
// briefing additionally tags each email Management / Operational / Action-needed.
// Classification is a sender/domain → category map. The map ships EMPTY until the
// customer supplies their designated-sender lists (see the ticket's Open items); any
// unmatched email defaults to `action-needed` so nothing surfaces uncategorized and
// important mail is never hidden behind an unknown sender. Pure data in → no logging
// of senders/subjects/bodies happens here (PHI-safe).
export const EMAIL_CATEGORIES = ['management', 'operational', 'action-needed'];
export const CATEGORY_DEFAULT = 'action-needed';
const CATEGORY_RULES = {
  // Populate from the customer's designated-sender lists. Keys are either a full sender
  // address or a bare domain; values are the category. e.g. an owner mailbox → 'management',
  // a 'billing.partner.example' domain → 'operational'. Left empty until the lists arrive.
};
export function classifyCategory(fromAddress, rules = CATEGORY_RULES) {
  if (!fromAddress) return CATEGORY_DEFAULT;
  const addr = String(fromAddress).toLowerCase().trim();
  if (!addr) return CATEGORY_DEFAULT;
  if (rules[addr]) return rules[addr]; // exact sender match wins
  const at = addr.lastIndexOf('@');
  const domain = at >= 0 ? addr.slice(at + 1) : addr;
  if (rules[domain]) return rules[domain]; // then domain match
  return CATEGORY_DEFAULT;
}

export function emailsFromGraph(messages, rules = CATEGORY_RULES) {
  return messages.map((m, i) => {
    const rawPreview = decodeHtmlBody(m.bodyPreview || '');
    const rawBody = decodeHtmlBody(m.body?.content || m.bodyPreview || '');
    // Strip the Teams/Zoom meeting boilerplate (underscores + Join URL + IDs +
    // "Need help? / Meeting options" footer) — we surface a Join button instead.
    return {
      id: m.id || `e${i}`,
      unread: m.isRead === false,
      important: m.importance === 'high' || Boolean(m.flag && m.flag.flagStatus === 'flagged'),
      category: classifyCategory(m.from?.emailAddress?.address, rules),
      from: m.from?.emailAddress?.name || m.from?.emailAddress?.address || 'Unknown',
      subject: m.subject || '(no subject)',
      preview: cleanDescription(rawPreview),
      time: m.receivedDateTime ? relativeTime(m.receivedDateTime) : '',
      body: cleanDescription(rawBody),
      joinUrl: joinUrlFromBody(rawBody) || undefined,
    };
  });
}

// ── awaiting-response: built in routes (needs async per-thread lookups), formatted here ──
// Takes the raw age in hours; shows "Nh" under a day and "Nd" beyond, so a 2h-old
// email reads "2h" not "0d".
export function awaitingItem(sentMsg, ageHours, idx) {
  const to = sentMsg.toRecipients?.[0]?.emailAddress?.name || sentMsg.toRecipients?.[0]?.emailAddress?.address || 'Recipient';
  const days = Math.floor(ageHours / 24);
  const wait = days >= 1 ? `${days}d` : `${Math.max(1, Math.round(ageHours))}h`;
  return {
    id: `a${idx}`,
    hours: Math.round(ageHours),
    days,
    wait,
    to,
    subject: sentMsg.subject || '(no subject)',
    detail: `Sent ${wait} ago · no reply`,
  };
}

// ── calendar ───────────────────────────────────────────────────────────────��─
// Teams/Zoom auto-insert a wall of join boilerplate (underscores + "Join:" URL +
// Meeting ID + Passcode) into the body. We render a dedicated Join button, so cut
// that noise and keep only the human-written agenda above it. Also extract a join
// URL from the body as a fallback when the event isn't a native online meeting.
const JOIN_URL_RE = /(https:\/\/[^\s]*(teams\.microsoft\.com|teams\.live\.com|zoom\.us|meet\.google\.com)[^\s]*)/i;
function joinUrlFromBody(text) {
  const m = (text || '').match(JOIN_URL_RE);
  return m ? m[1] : undefined;
}
function cleanDescription(text) {
  if (!text) return '';
  const markers = [
    /_{3,}/,                                       // the underscore divider Teams inserts
    /Microsoft Teams meeting/i,
    /Join the meeting now/i,
    /Join Zoom Meeting/i,
    /is inviting you to a scheduled Zoom meeting/i,
    /________________________________________/,
  ];
  let cut = text.length;
  for (const m of markers) {
    const idx = text.search(m);
    if (idx >= 0 && idx < cut) cut = idx;
  }
  return text.slice(0, cut).replace(/\s+/g, ' ').trim();
}

// Map a Graph event into the rich ScheduleItem the UI renders (description, join
// link, attendees + responses, organizer, location, end time).
function scheduleItemFromEvent(e) {
  const start = graphInstant(e.start);
  const end = e.end?.dateTime || e.end ? graphInstant(e.end) : null;
  const attendees = (e.attendees || []).map((a) => ({
    name: a.emailAddress?.name || a.emailAddress?.address || 'Guest',
    email: a.emailAddress?.address || undefined,
    response: a.status?.response || 'none',
  }));
  const location = e.location?.displayName || '';
  const rawBody = decodeHtmlBody(e.bodyPreview || '');
  return {
    time: e.isAllDay ? 'All day' : hhmm(start),
    end: end && !e.isAllDay ? hhmm(end) : undefined,
    title: e.subject || '(busy)',
    detail: location || (attendees.length ? `${attendees.length} attendees` : ''),
    location: location || undefined,
    description: cleanDescription(rawBody) || undefined,
    // Native online-meeting link first; else sniff a join URL out of the body.
    joinUrl: e.onlineMeeting?.joinUrl || e.onlineMeetingUrl || joinUrlFromBody(rawBody) || undefined,
    attendees: attendees.length ? attendees : undefined,
    organizer: e.organizer?.emailAddress?.name || undefined,
    isAllDay: Boolean(e.isAllDay) || undefined,
  };
}

export function calendarFromGraph(events) {
  const now = new Date();
  const todayStr = now.toDateString();

  const today = events
    .filter((e) => graphInstant(e.start).toDateString() === todayStr)
    .map(scheduleItemFromEvent);

  // Group the week (next 5 days with events) — keep EVERY meeting, not just two.
  const byDay = new Map();
  for (const e of events) {
    const d = graphInstant(e.start);
    const key = d.toDateString();
    if (!byDay.has(key)) byDay.set(key, { date: d, events: [] });
    byDay.get(key).events.push(scheduleItemFromEvent(e));
  }
  const week = [...byDay.values()]
    .sort((a, b) => a.date - b.date)
    .slice(0, 5)
    .map(({ date, events: evs }) => ({
      day: DAYS[date.getDay()],
      long: LONG[date.getDay()],
      date: localYmd(date),
      count: evs.length,
      events: evs,
      today: date.toDateString() === todayStr,
    }));

  return { today, week };
}

// ── tasks (Microsoft To Do) ───────────────────────────────────────────────────
// `owner` stamps each task's attribution. Single-user/dashboard pass nothing (the legacy
// 'DCR' placeholder — unused by the single-user view). The multi-owner board (MAD-37)
// passes the REAL owner (upn) so tasks carry true attribution, never a hardcoded owner.
export function tasksFromGraph(todo, now = new Date(), owner = 'DCR') {
  const todayYmd = localYmd(now);
  return todo.map((t, i) => {
    // To Do dues are all-day calendar dates (midnight in some zone). Take the date part
    // literally — ignore the time/zone — so an all-day due isn't shifted across midnight,
    // and compare by practice-zone calendar date so "overdue"/"due-today" are correct.
    const dueYmd = t.dueDateTime?.dateTime ? String(t.dueDateTime.dateTime).slice(0, 10) : null;
    let status = 'upcoming';
    if (t.status === 'completed') status = 'done';
    else if (dueYmd && dueYmd < todayYmd) status = 'overdue';
    else if (dueYmd && dueYmd === todayYmd) status = 'due-today';
    return {
      id: t.id || `t${i}`,
      title: t.title || '(untitled)',
      owner, // single-user: legacy 'DCR' (unused); team board: the real owner upn (MAD-37)
      due: dueYmd ? parseLocalDate(dueYmd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No date',
      status,
    };
  });
}

// ── financials (QuickBooks) ───────────────────────────────────────────────────
function sum(arr, f) {
  return arr.reduce((a, x) => a + (f(x) || 0), 0);
}
export function financialsFromQbo(deposits, purchases, fixedAccountIds, now = new Date()) {
  const fixed = new Set(fixedAccountIds);
  const isVariable = (p) => !(p.AccountRef && fixed.has(String(p.AccountRef.value)));

  // "This" = all fetched transactions (last 60 days); "prior" = oldest half for delta.
  const midpoint = new Date(now.getTime() - 30 * 86_400_000);
  const depThis = deposits.filter((d) => parseLocalDate(d.TxnDate) >= midpoint);
  const depPrior = deposits.filter((d) => parseLocalDate(d.TxnDate) < midpoint);
  const purThis = purchases.filter((p) => isVariable(p) && parseLocalDate(p.TxnDate) >= midpoint);
  const purPrior = purchases.filter((p) => isVariable(p) && parseLocalDate(p.TxnDate) < midpoint);

  // If nothing in "this" half, promote everything so numbers always show.
  const effectiveDepThis = depThis.length ? depThis : deposits;
  const effectivePurThis = purThis.length ? purThis : purchases.filter(isVariable);

  const totalDep = sum(effectiveDepThis, (d) => Number(d.TotalAmt));
  const totalDepPrior = sum(depPrior, (d) => Number(d.TotalAmt));
  const totalPur = sum(effectivePurThis, (p) => Number(p.TotalAmt));
  const totalPurPrior = sum(purPrior, (p) => Number(p.TotalAmt));

  // Build per-day deposits for the bar chart (last 7 days, any with data).
  const byDay = {};
  for (const d of effectiveDepThis) {
    const day = DAYS[parseLocalDate(d.TxnDate).getDay()];
    byDay[day] = (byDay[day] || 0) + Number(d.TotalAmt);
  }
  const depositsByDay = Object.entries(byDay).map(([day, amount]) => ({ day, amount }));

  // Yesterday deposits for the daily KPI tile. Compute the date in the practice zone
  // (matching QBO's company-local TxnDate), not the UTC date, to avoid an off-by-one.
  const yest = localYmd(new Date(now.getTime() - 86_400_000));
  const depYest = deposits.filter((d) => d.TxnDate === yest);
  const depYestTotal = sum(depYest, (d) => Number(d.TotalAmt));

  const daily = {
    depositYesterday: {
      breakdown: depYest.slice(0, 3).map((d) => ({
        label: d.PrivateNote || d.DocNumber || 'Deposit',
        amount: Number(d.TotalAmt) || 0,
      })),
      total: depYestTotal || totalDep,
      prior: 0,
      account: (depYest[0] || effectiveDepThis[0])?.DepositToAccountRef?.name || 'Operating account',
      posted: depYest[0]?.TxnDate || depThis[0]?.TxnDate || '',
    },
    variableSpend: {
      yesterday: { last: sum(purchases.filter((p) => isVariable(p) && p.TxnDate === yest), (p) => Number(p.TotalAmt)), prior: 0 },
      wtd: totalPur,
      mtd: totalPur,
      topCategories: [],
    },
  };

  const weekly = {
    depositsByDay,
    totalDeposits: { last: totalDep, prior: totalDepPrior },
    variableSpend: { last: totalPur, prior: totalPurPrior },
    netContribution: { last: totalDep - totalPur, prior: totalDepPrior - totalPurPrior },
    topCategory: { name: '', amount: 0 },
  };

  return { weekly, daily };
}

// ── outstanding invoices / A/R aging (QuickBooks) — MAD-24 ────────────────────
// Aggregate-only A/R snapshot from open QBO Invoices (Balance > 0). Returns totals +
// aging buckets ONLY — CustomerRef / patient names NEVER leave this transform (HIPAA /
// SOW no-PHI posture). Aging = days past due from each invoice's DueDate, computed in the
// process (practice) zone via parseLocalDate — the same ET convention as the deposit
// buckets, so there's no UTC off-by-one. Defensive: missing/empty/malformed input yields a
// zeroed snapshot (never throws) so the financials route degrades safely rather than 500-ing.
const AGING_BUCKETS = ['Current', '1–30', '31–60', '61–90', '90+'];

// Map days-past-due → bucket index. ≤0 (not yet due / due today) = Current.
function agingBucketIndex(daysPastDue) {
  if (daysPastDue <= 0) return 0;
  if (daysPastDue <= 30) return 1;
  if (daysPastDue <= 60) return 2;
  if (daysPastDue <= 90) return 3;
  return 4;
}

export function outstandingInvoicesFromQbo(invoices, now = new Date()) {
  const aging = AGING_BUCKETS.map((bucket) => ({ bucket, amount: 0, count: 0 }));
  if (!Array.isArray(invoices)) {
    return { totalOutstanding: 0, openCount: 0, asOf: localYmd(now), aging };
  }
  // "Today" as a practice-zone calendar date (local midnight) — the reference for
  // days-past-due. Math.round absorbs the 23h/25h day at a DST boundary (no off-by-one).
  const today = parseLocalDate(localYmd(now));
  let totalOutstanding = 0;
  let openCount = 0;
  for (const inv of invoices) {
    const balance = Number(inv?.Balance);
    if (!(balance > 0)) continue; // open invoices only — fully-paid (Balance 0) excluded
    openCount += 1;
    totalOutstanding += balance;
    const due = inv?.DueDate ? parseLocalDate(inv.DueDate) : today;
    const daysPastDue = Math.round((today - due) / 86_400_000);
    const bucket = aging[agingBucketIndex(daysPastDue)];
    bucket.amount += balance;
    bucket.count += 1;
  }
  return { totalOutstanding, openCount, asOf: localYmd(now), aging };
}

// ── cash-flow overview (QuickBooks) — MAD-25 ──────────────────────────────────
// Derived cash movement from data already fetched: cash IN = deposits, cash OUT = ALL
// purchases (including fixed-cost accounts, unlike variableSpend), net = in − out. Over
// last week vs the prior week (WoW) and month-to-date, using the same financePeriods
// windows as revenue — so the boundaries are practice-zone (ET) correct. TxnDate and the
// window bounds are both date-only "YYYY-MM-DD", so a string comparison is an exact
// calendar test (DST-immune). Defensive: missing/empty input yields a zeroed summary
// (never throws) so the financials snapshot degrades safely. Pure account-level totals.
export function cashFlowFromQbo(deposits, purchases, now = new Date()) {
  const dep = Array.isArray(deposits) ? deposits : [];
  const pur = Array.isArray(purchases) ? purchases : [];
  const p = financePeriods(now);
  const inWindow = (txn, w) => typeof txn === 'string' && txn >= w.start && txn <= w.end;
  const flow = (w) => {
    const inflow = sum(dep.filter((d) => inWindow(d.TxnDate, w)), (d) => Number(d.TotalAmt));
    const outflow = sum(pur.filter((x) => inWindow(x.TxnDate, w)), (x) => Number(x.TotalAmt));
    return { inflow, outflow, net: inflow - outflow };
  };
  const last = flow(p.lastWeek);
  const prior = flow(p.priorWeek);
  return {
    weekly: {
      inflow: { last: last.inflow, prior: prior.inflow },
      outflow: { last: last.outflow, prior: prior.outflow },
      net: { last: last.net, prior: prior.net },
    },
    mtd: flow(p.mtd),
  };
}

// ── revenue (QuickBooks ProfitAndLoss) ────────────────────────────────────────
// MAD-23: accrual-basis revenue = the "Total Income" summary line of the QBO
// ProfitAndLoss report. Walk the report rows and return the Total Income figure
// (the last column of the Income section's Summary). Defensive: any missing/empty/
// malformed report yields 0 — never throws — so the financials snapshot degrades
// safely rather than 500-ing the whole route.
export function incomeFromProfitAndLoss(report) {
  // The income figure lives in a Money column that is NOT reliably the last ColData
  // entry — comparison/period P&L reports append blank trailing columns, and a blank
  // value coerces to 0 (Number('') === 0), which would silently report zero revenue.
  // Take the last column whose value is a real number instead.
  const lastNumeric = (colData) => {
    if (!Array.isArray(colData)) return null;
    for (let i = colData.length - 1; i >= 0; i--) {
      const raw = colData[i]?.value;
      if (raw === '' || raw == null) continue;
      const n = Number(raw);
      if (Number.isFinite(n)) return n;
    }
    return null;
  };

  let income = 0, found = false;
  const visit = (rows) => {
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      const cd = row?.Summary?.ColData;
      // Identify the Income summary by the canonical label OR the section's group
      // (QBO marks the income section group:"Income" even when the label is localized).
      const label = String(cd?.[0]?.value || '').trim();
      const isIncome = Array.isArray(cd) &&
        (/^total income$/i.test(label) || String(row?.group || '').toLowerCase() === 'income');
      if (isIncome) {
        const amt = lastNumeric(cd);
        if (amt != null) { income = amt; found = true; }
      }
      visit(row?.Rows?.Row);
    }
  };
  visit(report?.Rows?.Row);
  return found ? income : 0;
}

// The date ranges for the revenue tiles, mirroring how deposits/variable-spend are
// presented: last full week vs the prior week (Mon–Sun, for the WoW delta) and
// month-to-date. Computed in the process (practice) zone — TZ=America/New_York — the
// same convention as parseLocalDate/localYmd above, so boundaries are ET-correct.
export function financePeriods(now = new Date()) {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const dow = today.getDay();                  // 0=Sun … 6=Sat
  const sinceMonday = dow === 0 ? 6 : dow - 1; // days back to this week's Monday
  const shift = (base, days) => { const d = new Date(base); d.setDate(base.getDate() + days); return d; };

  const thisMonday = shift(today, -sinceMonday);
  const lastMonday = shift(thisMonday, -7);
  const lastSunday = shift(thisMonday, -1);
  const priorMonday = shift(lastMonday, -7);
  const priorSunday = shift(lastMonday, -1);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  return {
    lastWeek: { start: localYmd(lastMonday), end: localYmd(lastSunday) },
    priorWeek: { start: localYmd(priorMonday), end: localYmd(priorSunday) },
    mtd: { start: localYmd(monthStart), end: localYmd(today) },
  };
}


// ── MAD-27: tolerant workbook GRID parser + normalization (Strategy A) ─────────
// Replaces the named-range read path. The real workbooks are several multi-tab files of
// free-typed day-grids with NO named ranges and inconsistent headers — so we read each
// worksheet's used-range grid (rows = days, first row = headers), normalize the dirty
// headers to canonical metric keys, sum each metric column, and aggregate across tabs +
// files. Pure + period-agnostic: callers (routes.js) decide which grids feed which period
// (current / prior / yearAgo / month) — no date math here, so no timezone concerns.

// Canonical metric order → drives a deterministic DTO (encountersBySpecialty = first 6).
// Keys/labels mirror the customer's Totals-Madison columns; `newPatients` is parsed from
// the free-typed "New Patients: N" cells. Add a metric by extending this list + ALIASES.
export const REPORT_METRICS = [
  { key: 'med', label: 'Medical' },
  { key: 'chiro', label: 'Chiro' },
  { key: 'pod', label: 'Podiatry' },
  { key: 'pt', label: 'PT / OT' },
  { key: 'ivMa', label: 'IV / MA' },
  { key: 'acu', label: 'Acupuncture' },
  { key: 'mo', label: 'MO' },
  { key: 'allergy', label: 'Allergy' },
  { key: 'covid', label: 'Covid' },
  { key: 'telehealth', label: 'Telehealth' },
  { key: 'newPatients', label: 'New patients' },
];
const METRIC_LABELS = Object.fromEntries(REPORT_METRICS.map((m) => [m.key, m.label]));

// Normalize a raw header to a comparison form: decode &amp;, lowercase, strip punctuation
// (& / -), collapse whitespace. So "PT&OT", "PT OT", "PT/OT" all reduce to "pt ot" etc.
function normHeader(raw) {
  return String(raw == null ? '' : raw)
    .replace(/&amp;/gi, '&')
    .toLowerCase()
    .replace(/[&/\\.\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Structural / non-metric columns we skip SILENTLY (not surfaced as "unmapped" — they're
// expected): the date column, totals, and weekday headers.
const IGNORED_HEADERS = new Set([
  '', 'date', 'total', 'totals',
  'mon', 'tue', 'tues', 'wed', 'thu', 'thur', 'thurs', 'fri', 'sat', 'sun',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
]);

// normalized-header → canonical metric key. Every documented dirty variant resolves here.
// AC-2: the combined ("iv & ma", "iv and ma") AND split ("iv", "ma") columns ALL map to one
// `ivMa` key — a single canonical bucket avoids double-counting when a month splits them.
const METRIC_ALIASES = new Map(Object.entries({
  med: 'med',
  chiro: 'chiro',
  pod: 'pod',
  pt: 'pt', 'pt ot': 'pt', 'pt and ot': 'pt',
  iv: 'ivMa', ma: 'ivMa', 'iv ma': 'ivMa', 'ma iv': 'ivMa', 'iv and ma': 'ivMa',
  acu: 'acu', accu: 'acu',
  mo: 'mo',
  allergy: 'allergy', allegy: 'allergy',
  covid: 'covid', 'covid test': 'covid',
  telehealth: 'telehealth',
}));

// Map ONE raw header → a verdict: {ignored} structural, {key} a canonical metric, or
// {unmapped} an unrecognized column (surfaced for review, never crashes).
export function mapHeader(raw) {
  const n = normHeader(raw);
  if (IGNORED_HEADERS.has(n)) return { ignored: true };
  const key = METRIC_ALIASES.get(n);
  return key ? { key } : { unmapped: true };
}

// From a workbook's worksheet names, keep only the monthly "Totals Madison" metric tabs, in
// workbook order. Tolerant of the real files' dirtiness ("AugustTotals Madison", trailing
// spaces) and excludes provider tabs ("... Provider/Provier Totals") and the defined-name /
// external-link artifact tabs Excel exposes ("microsoft.com:RD", etc.) — AC-1/AC-4.
export function selectMetricTabs(names) {
  return (Array.isArray(names) ? names : []).filter((raw) => {
    const n = String(raw == null ? '' : raw).toLowerCase();
    if (n.startsWith('microsoft.com:')) return false;
    if (/provi(d|e)er/.test(n)) return false;          // "provider"/"provier" totals tabs
    return /totals?\s*madison/.test(n.replace(/([a-z])(totals)/, '$1 $2'));
  });
}

// "New Patients: 31" (and "New Patient: 7", trailing notes) → 31. Non-matching cell → null.
function newPatientsInCell(cell) {
  const m = String(cell == null ? '' : cell).match(/new\s+patient[s]?\s*:?\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}

const numeric = (v) => (typeof v === 'number' ? v : (v != null && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : null));

// How many cells in an axis map to a known metric — used to detect the label axis (MAD-41).
function metricMatchCount(cells) {
  return (Array.isArray(cells) ? cells : []).filter((c) => mapHeader(c).key).length;
}

// Parse ONE used-range grid (2-D array) into { counts: {metricKey: sum}, unmapped: [{...}] }.
// ORIENTATION-AWARE (MAD-41): the real workbooks put metrics as ROW LABELS in column A with
// days across columns (and stacked weekly blocks), while the MAD-27 model put metrics as
// column HEADERS in row 0. We auto-detect which axis carries the metric labels and sum the
// value cells along the other axis. Tolerant: blank/non-numeric cells skipped, ragged rows
// fine, malformed grid → empty counts, never throws (AC-7). `unmapped` carries REFERENCES
// only (index + label text), never cell values (AC-9).
export function countsFromGrid(grid) {
  const counts = {};
  const unmapped = [];
  const seenUnmapped = new Set();
  const rows = Array.isArray(grid) ? grid : [];
  const add = (key, n) => { counts[key] = (counts[key] || 0) + n; };
  const surface = (ref) => {
    const k = String(ref.header || '').toLowerCase();
    if (seenUnmapped.has(k)) return; // dedupe (stacked blocks repeat the same label)
    seenUnmapped.add(k); unmapped.push(ref);
  };

  // Detect the label axis: compare metric matches in row 0 (column-header layout) vs column A
  // (row-label layout). More matches wins; ties favor the header model (MAD-27 back-compat).
  const headerRow = Array.isArray(rows[0]) ? rows[0] : [];
  const colA = rows.map((r) => (Array.isArray(r) ? r[0] : undefined));
  const rowLabelMode = metricMatchCount(colA) > metricMatchCount(headerRow);

  if (rowLabelMode) {
    // Columns that are a "Totals" column anywhere → excluded so we don't double-count (AC-4).
    const totalsCols = new Set([0]); // col 0 is the metric LABEL, never a value
    rows.forEach((row) => (Array.isArray(row) ? row : []).forEach((cell, c) => {
      if (['total', 'totals'].includes(normHeader(cell))) totalsCols.add(c);
    }));
    rows.forEach((row, r) => {
      const v = mapHeader(Array.isArray(row) ? row[0] : '');
      if (v.ignored) return;            // DATE / TOTAL / day-header / blank rows
      if (v.unmapped) { surface({ row: r, header: String((row && row[0]) ?? '') }); return; }
      let total = 0; let saw = false;
      (Array.isArray(row) ? row : []).forEach((cell, c) => {
        if (totalsCols.has(c)) return;  // skip the label col + any Totals column
        const n = numeric(cell);
        if (n != null) { total += n; saw = true; }
      });
      if (saw) add(v.key, total);       // a metric recurring across blocks accumulates (AC-3)
    });
  } else {
    // Column-header layout (MAD-27): metric per column header, days down the rows.
    const body = rows.slice(1);
    headerRow.forEach((h, col) => {
      const v = mapHeader(h);
      if (v.ignored) return;
      if (v.unmapped) { surface({ col, header: String(h == null ? '' : h) }); return; }
      let total = 0; let saw = false;
      for (const row of body) {
        const n = numeric(Array.isArray(row) ? row[col] : undefined);
        if (n != null) { total += n; saw = true; }
      }
      if (saw) add(v.key, total);
    });
  }

  // newPatients lives as free text anywhere in the grid → scan every cell, sum the numbers.
  let np = 0; let sawNp = false;
  for (const row of (Array.isArray(rows) ? rows : [])) {
    for (const cell of (Array.isArray(row) ? row : [])) {
      const n = newPatientsInCell(cell);
      if (n != null) { np += n; sawNp = true; }
    }
  }
  if (sawNp) add('newPatients', np);

  return { counts, unmapped };
}

// From metric tabs read in workbook order (each { tab, counts }), pick the period maps: the
// LATEST tab with data is the current period, the previous tab with data is prior. Empty
// trailing/interleaved tabs are skipped (a year file's future months are blank) — MAD-41 AC-5.
// Position/data-based only — no date math, so no timezone concern.
export function pickNonEmptyPeriods(items) {
  const nonEmpty = (Array.isArray(items) ? items : [])
    .filter((it) => it && it.counts && Object.keys(it.counts).length > 0);
  const current = nonEmpty[nonEmpty.length - 1]?.counts || {};
  const prior = nonEmpty.length >= 2 ? nonEmpty[nonEmpty.length - 2].counts : {};
  return { current, prior };
}

// ── MAD-44: deterministic read of a designated "Command Center" summary tab ───
// The owner maintains one fixed-layout table — metric label | this period | last period |
// [year ago]. We read those exact cells: NO orientation detection, NO tab-selection, NO month
// guessing, NO date math. Determinism comes from the controlled input, not a cleverer parser.

// label → canonical metric key, recognizing the published labels (Medical / PT / OT / IV / MA /
// Acupuncture …), the canonical keys, AND the dirty-grid alias set. Built once from REPORT_METRICS.
const SUMMARY_LABEL_MAP = (() => {
  const m = new Map(METRIC_ALIASES); // 'med'→med, 'pt ot'→pt, 'iv ma'→ivMa, …
  for (const { key, label } of REPORT_METRICS) {
    m.set(normHeader(label), key); // 'medical'→med, 'podiatry'→pod, 'acupuncture'→acu, 'new patients'→newPatients
    m.set(normHeader(key), key);   // 'med'→med
  }
  return m;
})();

// Non-metric rows in a summary (the header row, blanks, a totals row) — skipped silently.
const SUMMARY_IGNORED = new Set(['', 'metric', 'metrics', 'label', 'total', 'totals']);

function mapSummaryLabel(raw) {
  const n = normHeader(raw);
  if (SUMMARY_IGNORED.has(n)) return { ignored: true };
  const key = SUMMARY_LABEL_MAP.get(n);
  return key ? { key } : { unmapped: true };
}

// Parse the summary grid into { current, prior, yearAgo } count-maps + the unmapped labels.
// Each metric row contributes one value per column straight from the cell — the owner controls
// the period, so current/prior need no inference. Tolerant: a malformed grid yields empty maps,
// never throws (AC-1). `unmapped` carries the row LABEL reference only (a metric name the owner
// typed, never a cell value) for PHI-safe surfacing (AC-2/AC-6).
export function summaryPeriods(grid) {
  const current = {}; const prior = {}; const yearAgo = {}; const unmapped = [];
  for (const row of (Array.isArray(grid) ? grid : [])) {
    if (!Array.isArray(row)) continue;
    const v = mapSummaryLabel(row[0]);
    if (v.ignored) continue;
    if (v.unmapped) { unmapped.push({ label: String(row[0] == null ? '' : row[0]) }); continue; }
    const cur = numeric(row[1]); const pri = numeric(row[2]); const ya = numeric(row[3]);
    if (cur != null) current[v.key] = cur;
    if (pri != null) prior[v.key] = pri;
    if (ya != null) yearAgo[v.key] = ya;
  }
  return { current, prior, yearAgo, unmapped };
}

// Sum a list of count-maps ({metricKey: n}) into one — aggregation across tabs AND files (AC-3).
export function mergeCounts(maps) {
  const out = {};
  for (const m of (maps || [])) {
    for (const [k, v] of Object.entries(m || {})) out[k] = (out[k] || 0) + (Number(v) || 0);
  }
  return out;
}

// Build the /api/reports DTO from already-aggregated count-maps per period. Byte-compatible
// with reportsFromRanges (AC-6): same { weekNumber, metrics[], encountersBySpecialty[],
// totalEncounters } shape, same additive yearAgo / monthToDate / prevMonth semantics —
// each present ONLY when its period map is supplied (else the WoW shape, unchanged). A metric
// row appears when ANY period has a value for it, in REPORT_METRICS order; the optional
// periods read 0 for an absent key (additive, never reshaping the base contract).
export function reportsFromGrids(periods, labels = METRIC_LABELS) {
  const { current = {}, prior = {}, yearAgo, monthToDate, prevMonth } = periods || {};
  const hasYoY = yearAgo && Object.keys(yearAgo).length > 0;
  const hasMoM = monthToDate && prevMonth
    && Object.keys(monthToDate).length > 0 && Object.keys(prevMonth).length > 0;

  // Stable order: known metrics first (REPORT_METRICS), then any extra keys seen in the data.
  const seen = new Set();
  for (const map of [current, prior, yearAgo || {}, monthToDate || {}, prevMonth || {}]) {
    for (const k of Object.keys(map)) seen.add(k);
  }
  const order = [...REPORT_METRICS.map((m) => m.key).filter((k) => seen.has(k)),
    ...[...seen].filter((k) => !METRIC_LABELS[k])];

  const at = (map, key) => Number((map || {})[key]) || 0;
  const metrics = order.map((key) => {
    const m = { key, label: labels[key] || key, last: at(current, key), prior: at(prior, key) };
    if (hasYoY) m.yearAgo = at(yearAgo, key);
    if (hasMoM) { m.monthToDate = at(monthToDate, key); m.prevMonth = at(prevMonth, key); }
    return m;
  });
  const totalEncounters = { last: sum(metrics, (m) => m.last), prior: sum(metrics, (m) => m.prior) };
  if (hasYoY) totalEncounters.yearAgo = sum(metrics, (m) => m.yearAgo || 0);
  if (hasMoM) {
    totalEncounters.monthToDate = sum(metrics, (m) => m.monthToDate || 0);
    totalEncounters.prevMonth = sum(metrics, (m) => m.prevMonth || 0);
  }
  return {
    weekNumber: 0,
    metrics,
    encountersBySpecialty: metrics.slice(0, 6).map((m) => {
      const row = { label: m.label, last: m.last, prior: m.prior };
      if (hasYoY) row.yearAgo = m.yearAgo;
      if (hasMoM) { row.monthToDate = m.monthToDate; row.prevMonth = m.prevMonth; }
      return row;
    }),
    totalEncounters,
  };
}
