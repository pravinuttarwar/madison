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
export function emailsFromGraph(messages) {
  return messages.map((m, i) => {
    const rawPreview = decodeHtmlBody(m.bodyPreview || '');
    const rawBody = decodeHtmlBody(m.body?.content || m.bodyPreview || '');
    // Strip the Teams/Zoom meeting boilerplate (underscores + Join URL + IDs +
    // "Need help? / Meeting options" footer) — we surface a Join button instead.
    return {
      id: m.id || `e${i}`,
      unread: m.isRead === false,
      important: m.importance === 'high' || Boolean(m.flag && m.flag.flagStatus === 'flagged'),
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
  const start = new Date(e.start?.dateTime || e.start);
  const end = e.end?.dateTime || e.end ? new Date(e.end?.dateTime || e.end) : null;
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
    .filter((e) => new Date(e.start?.dateTime || e.start).toDateString() === todayStr)
    .map(scheduleItemFromEvent);

  // Group the week (next 5 days with events) — keep EVERY meeting, not just two.
  const byDay = new Map();
  for (const e of events) {
    const d = new Date(e.start?.dateTime || e.start);
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
      date: date.toISOString().slice(0, 10),
      count: evs.length,
      events: evs,
      today: date.toDateString() === todayStr,
    }));

  return { today, week };
}

// ── tasks (Microsoft To Do — single user) ─────────────────────────────────────
export function tasksFromGraph(todo) {
  const now = new Date();
  return todo.map((t, i) => {
    const due = t.dueDateTime?.dateTime ? new Date(t.dueDateTime.dateTime) : null;
    let status = 'upcoming';
    if (t.status === 'completed') status = 'done';
    else if (due && due < now) status = 'overdue';
    else if (due && due.toDateString() === now.toDateString()) status = 'due-today';
    return {
      id: t.id || `t${i}`,
      title: t.title || '(untitled)',
      owner: 'DCR', // To Do is per-user; multi-owner needs Planner + an owner map (see ARCHITECTURE.md)
      due: due ? due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No date',
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
  const depThis = deposits.filter((d) => new Date(d.TxnDate) >= midpoint);
  const depPrior = deposits.filter((d) => new Date(d.TxnDate) < midpoint);
  const purThis = purchases.filter((p) => isVariable(p) && new Date(p.TxnDate) >= midpoint);
  const purPrior = purchases.filter((p) => isVariable(p) && new Date(p.TxnDate) < midpoint);

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
    const day = DAYS[new Date(d.TxnDate).getDay()];
    byDay[day] = (byDay[day] || 0) + Number(d.TotalAmt);
  }
  const depositsByDay = Object.entries(byDay).map(([day, amount]) => ({ day, amount }));

  // Yesterday deposits for the daily KPI tile.
  const yest = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
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
