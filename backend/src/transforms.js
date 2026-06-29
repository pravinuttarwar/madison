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

// ── tasks (Microsoft To Do — single user) ─────────────────────────────────────
export function tasksFromGraph(todo, now = new Date()) {
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
      owner: 'DCR', // To Do is per-user; multi-owner needs Planner + an owner map (see ARCHITECTURE.md)
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

// ── weekly report (Excel named ranges) ────────────────────────────────────────
// rangeValues: { metricKey: [[last, prior]] } — adjust to the customer's sheet layout.
export function reportsFromRanges(rangeValues, labels) {
  const metrics = Object.entries(rangeValues).map(([key, vals]) => {
    const row = (vals && vals[0]) || [];
    return { key, label: labels[key] || key, last: Number(row[0]) || 0, prior: Number(row[1]) || 0 };
  });
  const totalLast = sum(metrics, (m) => m.last);
  const totalPrior = sum(metrics, (m) => m.prior);
  return {
    weekNumber: 0,
    metrics,
    encountersBySpecialty: metrics.slice(0, 6).map((m) => ({ label: m.label, last: m.last, prior: m.prior })),
    totalEncounters: { last: totalLast, prior: totalPrior },
  };
}
