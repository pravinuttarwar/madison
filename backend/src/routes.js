import { Router } from 'express';
import { config } from './config.js';
import { cached } from './cache.js';
import { currentSession } from './session.js';
import * as graph from './graph.js';
import * as qbo from './qbo.js';
import * as T from './transforms.js';
import { computeAwaiting } from './awaiting.js';
import { readWorkbook, workbookRef, connectWorkbook, WorkbookError } from './workbook.js';
import { workbookEvent } from './audit.js';

export const router = Router();
const TTL = 90_000; // 90s in-memory cache

// Cache keys are scoped to the current visitor's session so one person's email/calendar
// can never be served to another from the shared cache.
const sk = (key) => `${currentSession()?.id || 'anon'}:${key}`;

// Is the CURRENT visitor connected to the source they're asking for?
// In fixtures mode (MBI-34) the upstream clients resolve from synthetic fixtures, so every
// source counts as connected and the live producer path runs against them.
function graphConnected() {
  return config.fixturesMode || Boolean(currentSession()?.graph.refreshToken);
}
function qboConnected() {
  if (config.fixturesMode) return true;
  const q = currentSession()?.qbo;
  return Boolean(q?.refreshToken && q?.realmId);
}
function sourceReady(id) {
  if (id === 'quickbooks') return qboConnected();
  return graphConnected(); // outlook, microsoftToDo, spreadsheet
}

// Wrap a route: configured → live producer; else → signal "not connected".
// Graph (the Microsoft identity/session) → 401 so the UI returns to login. QuickBooks is a
// secondary connection → 503 so the UI shows a "Connect" button instead of logging out.
// (MBI-36: the runtime sample path is gone — routes are always live.)
// Map a producer error to the response contract. A cleared/rejected token surfaces as
// 'not_authenticated' (from auth.js) → the SAME 401 (Graph) / 503 (QuickBooks) the UI uses
// to re-prompt sign-in or show "Connect" (MAD-15, AC-4). Anything else is a transient
// upstream failure → 502. Pure + exported so the mapping is unit-testable.
export function errorResponse(sourceId, err) {
  const message = String(err?.message || err);
  if (message.startsWith('not_authenticated')) {
    return sourceId === 'quickbooks'
      ? { status: 503, body: { error: 'source_not_connected', source: sourceId } }
      : { status: 401, body: { error: 'not_authenticated', source: sourceId } };
  }
  return { status: 502, body: { error: 'upstream_failed', source: sourceId, message } };
}

function route(sourceId, liveProducer) {
  return async (req, res) => {
    try {
      if (!sourceReady(sourceId)) {
        if (sourceId === 'quickbooks') {
          return res.status(503).json({ error: 'source_not_connected', source: sourceId });
        }
        return res.status(401).json({ error: 'not_authenticated', source: sourceId });
      }
      return res.json(await liveProducer(req));
    } catch (err) {
      const { status, body } = errorResponse(sourceId, err);
      res.status(status).json(body);
    }
  };
}

// ── awaiting-response engine ──────────────────────────────────────────────────
// The engine (threading + detection) lives in awaiting.js so it's unit-testable with
// injected fetchers; here we bind it to the live Graph client + runtime config.
const buildAwaiting = () => computeAwaiting(graph, config.graph);

// ── signed-in user profile ────────────────────────────────────────────────────
// Name comes from the id_token JWT decoded at login (no User.Read needed).
// Falls back to Graph /me if User.Read is granted, then to an empty string.
// Never returns 502 — a missing name is not an auth failure.
router.get('/me', route('outlook',
  async () => {
    const name = currentSession()?.graph.displayName;
    if (name) return { displayName: name, mail: '' };
    try { return await graph.me(); } catch { /* User.Read not granted — that's OK */ }
    return { displayName: '', mail: '' };
  },
));

// ── runtime settings the UI needs (e.g. the awaiting-response threshold) ──────
// Just numbers/labels from config — no creds, safe to expose. Lets the FE show the
// real "Sent ≥ Nh" copy from backend/.env instead of a hardcoded 48.
router.get('/settings', (_req, res) => {
  res.json({ awaitingThresholdHours: config.graph.awaitingThresholdHours });
});

// ── email ──────────────────────────────────────────────────────────────────��─
router.get('/email', route('outlook', async () => T.emailsFromGraph(await cached(sk('msgs'), TTL, () => graph.listMessages(25)), config.graph.categoryRules)));
router.get('/email/awaiting', route('outlook', async () => cached(sk('await'), TTL, buildAwaiting)));
router.get('/email/:id', route('outlook',
  async (req) => {
    const all = T.emailsFromGraph(await cached(sk('msgs50'), TTL, () => graph.listMessages(50)), config.graph.categoryRules);
    return all.find((e) => e.id === req.params.id) || {};
  },
));

// ── calendar ───────────────────────────────────────────────────────────────��─
router.get('/calendar', route('outlook',
  async () => {
    const now = new Date();
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 7);
    return T.calendarFromGraph(await cached(sk('cal'), TTL, () => graph.calendarView(start.toISOString(), end.toISOString())));
  },
));

// ── tasks ──────────────────────────────────────────────────────────────────��─
router.get('/tasks', route('microsoftToDo', async () => T.tasksFromGraph(await cached(sk('tasks'), TTL, () => graph.listTodoTasks()))));

// ── financials ─────────────────────────────────────────────────────────────��─
// Accrual-basis revenue (MAD-23) from the QBO ProfitAndLoss report, over the same
// week/MTD windows as the deposit tiles. Wrapped so a P&L failure degrades to zeroed
// revenue rather than 500-ing the whole snapshot — and the catch logs nothing (no
// financial values / report payloads on any path). ADDITIVE: deposits/variable-spend
// /net-contribution are unchanged.
async function revenueFromQbo(now) {
  try {
    const p = T.financePeriods(now);
    const pnl = (range) => qbo.report('ProfitAndLoss', {
      start_date: range.start,
      end_date: range.end,
      accounting_method: 'Accrual',
    });
    const [last, prior, mtd] = await Promise.all([pnl(p.lastWeek), pnl(p.priorWeek), pnl(p.mtd)]);
    return {
      weekly: { last: T.incomeFromProfitAndLoss(last), prior: T.incomeFromProfitAndLoss(prior) },
      mtd: T.incomeFromProfitAndLoss(mtd),
    };
  } catch {
    return { weekly: { last: 0, prior: 0 }, mtd: 0 };
  }
}

// Outstanding-invoice tracking / A/R aging (MAD-24) from open QBO Invoices. Wrapped so an
// Invoice-query failure degrades to a zeroed receivables snapshot rather than 500-ing the
// whole financials snapshot — and the catch logs nothing (no balances / customer names on
// any path). ADDITIVE: deposits/variable-spend/net-contribution/revenue are unchanged.
async function receivablesFromQbo(now) {
  try {
    return T.outstandingInvoicesFromQbo(await qbo.invoices(), now);
  } catch {
    return T.outstandingInvoicesFromQbo(null, now); // zeroed snapshot, never throws
  }
}

router.get('/financials', route('quickbooks',
  async () => {
    const now = new Date();
    const iso = (d) => d.toISOString().slice(0, 10);
    const from60 = new Date(now.getTime() - 60 * 86_400_000);
    const [dep, pur, revenue, receivables] = await Promise.all([
      cached(sk('qbo-dep'), TTL, () => qbo.deposits(iso(from60), iso(now))),
      cached(sk('qbo-pur'), TTL, () => qbo.purchases(iso(from60), iso(now))),
      cached(sk('qbo-rev'), TTL, () => revenueFromQbo(now)),
      cached(sk('qbo-inv'), TTL, () => receivablesFromQbo(now)),
    ]);
    const fin = T.financialsFromQbo(dep, pur, config.qbo.fixedAccountIds, now);
    fin.revenue = revenue;
    fin.receivables = receivables;
    // Cash-flow (MAD-25) is derived from the deposits/purchases already fetched — no extra
    // I/O, and the transform is defensive (zeroed, never throws), so attach it directly.
    fin.cashFlow = T.cashFlowFromQbo(dep, pur, now);
    return fin;
  },
));

// ── weekly report (spreadsheet) ───────────────────────────────────────────────
router.get('/reports', route('spreadsheet',
  async () => {
    const map = config.graph.namedRanges; // { metricKey: rangeName }
    const labels = {}; // optional: metricKey → label
    const values = {};
    for (const [key, rangeName] of Object.entries(map)) {
      values[key] = await graph.workbookNamedRange(rangeName);
    }
    // MAD-29: prior-year ranges, when configured → additive yearAgo (YoY). Omitted otherwise.
    const prevMap = config.graph.prevYearRanges; // { metricKey: rangeName }
    const prevValues = {};
    for (const [key, rangeName] of Object.entries(prevMap)) {
      prevValues[key] = await graph.workbookNamedRange(rangeName);
    }
    // MAD-28: month-to-date + prior-month ranges, when configured → additive MoM. Omitted otherwise.
    const readMap = async (rangeMap) => {
      const out = {};
      for (const [key, rangeName] of Object.entries(rangeMap)) {
        out[key] = await graph.workbookNamedRange(rangeName);
      }
      return out;
    };
    const monthValues = {
      monthToDate: await readMap(config.graph.monthToDateRanges),
      prevMonth: await readMap(config.graph.prevMonthRanges),
    };
    // Audit the workbook READ once per request — item reference + outcome, never cell values.
    const ref = workbookRef();
    workbookEvent('read', { sessionId: currentSession()?.id || 'none', ref: ref?.itemId || 'env', outcome: 'ok' });
    return T.reportsFromRanges(values, labels, prevValues, monthValues);
  },
));

// ── weekly-report workbook CONNECTION (MAD-26: paste → resolve → validate → persist) ──
// Both routes require the Microsoft session (the workbook lives in the owner's OneDrive/
// SharePoint) → 401 when not connected, mirroring the other Graph-backed routes.
const basename = (p) => String(p || '').split('/').filter(Boolean).pop() || '';

router.get('/reports/connection', (_req, res) => {
  if (!graphConnected()) return res.status(401).json({ error: 'not_authenticated', source: 'spreadsheet' });
  const wb = readWorkbook();
  if (wb) return res.json({ connected: true, name: wb.name, source: wb.source, via: 'connection' });
  if (config.graph.spreadsheetPath) {
    return res.json({ connected: true, name: basename(config.graph.spreadsheetPath), source: 'env', via: 'env' });
  }
  return res.json({ connected: false });
});

router.post('/reports/connection', async (req, res) => {
  if (!graphConnected()) return res.status(401).json({ error: 'not_authenticated', source: 'spreadsheet' });
  const input = (req.body && req.body.input) || '';
  if (!String(input).trim()) return res.status(400).json({ error: 'missing_input' });
  try {
    const result = await connectWorkbook(input, {
      sessionId: currentSession()?.id || 'none',
      resolveShareUrl: graph.resolveShareUrl,
      resolveDrivePath: graph.resolveDrivePath,
      workbookReachable: graph.workbookReachable,
      audit: (action, meta) => workbookEvent(action, meta),
    });
    return res.json(result);
  } catch (err) {
    // not-reachable is the expected "bad paste / no access" outcome — plain-language reason,
    // no upstream error text (which can embed the share-URL/token). Anything else → 502.
    if (err instanceof WorkbookError) {
      return res.status(422).json({ error: 'not_reachable', reason: err.reason });
    }
    return res.status(502).json({ error: 'connect_failed' });
  }
});

// ── dashboard aggregate (BFF) ─────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  const view = req.query.view === 'monday' ? 'monday' : 'weekday';
  try {
    // Microsoft is the session identity — if THIS visitor isn't connected, send them to
    // login (401) rather than returning a blank dashboard (looked like "all data gone").
    if (!graphConnected()) return res.status(401).json({ error: 'not_authenticated' });

    // Build from this visitor's live sources only.
    const d = {
      view,
      owner: currentSession()?.graph.displayName || '',
      emails: [],
      schedule: [],
      weekCalendar: [],
      tasks: [],
      awaiting: [],
      priorityToday: [],
      financialDay: null,
      financialWeek: null,
      awaitingThresholdHours: config.graph.awaitingThresholdHours,
    };

    {
      const now = new Date();
      const start = new Date(now); start.setHours(0, 0, 0, 0);
      const end = new Date(start); end.setDate(end.getDate() + 7);

      // Fan out; each source wrapped in its own try/catch so one failure doesn't kill the whole dashboard.
      const [msgs, cal, tasks, awaiting] = await Promise.all([
        graph.listMessages(25).then(T.emailsFromGraph).catch(() => []),
        graph.calendarView(start.toISOString(), end.toISOString()).then(T.calendarFromGraph).catch(() => null),
        graph.listTodoTasks().then(T.tasksFromGraph).catch(() => []),
        buildAwaiting().catch(() => []),
      ]);

      d.emails = msgs;
      d.tasks = tasks;
      d.awaiting = awaiting;
      if (cal) { d.schedule = cal.today; d.weekCalendar = cal.week; }
      // Priority today: backend computes — overdue first, then due-today, max 5
      d.priorityToday = [
        ...tasks.filter((t) => t.status === 'overdue'),
        ...tasks.filter((t) => t.status === 'due-today'),
      ].slice(0, 5);
    }

    if (qboConnected()) {
      try {
        const now = new Date();
        const iso = (x) => x.toISOString().slice(0, 10);
        const from60 = new Date(now.getTime() - 60 * 86_400_000);
        const [dep, pur] = await Promise.all([qbo.deposits(iso(from60), iso(now)), qbo.purchases(iso(from60), iso(now))]);
        const fin = T.financialsFromQbo(dep, pur, config.qbo.fixedAccountIds, now);
        d.financialWeek = fin.weekly;
        d.financialDay = fin.daily;
      } catch { /* QuickBooks unavailable — leave financialDay/financialWeek as null */ }
    }

    res.json(d);
  } catch (err) {
    res.status(502).json({ error: 'dashboard_failed', message: String(err.message || err) });
  }
});

// ── source status (drives the Connections badges) ─────────────────────────────
// Env-driven (MBI-36): each source reports the environment its app/creds point at —
// 'live' for production, else 'sandbox'. The runtime never serves sample data, so there
// is no 'mock' mode. Per-visitor connection state is signalled separately by the data
// routes (401 Microsoft / 503 QuickBooks when not connected).
router.get('/sources/status', (_req, res) => {
  const modeFor = (environment) => (environment === 'production' ? 'live' : 'sandbox');
  const ms = modeFor(config.graph.environment);
  res.json([
    { id: 'outlook', label: 'Outlook', mode: ms },
    { id: 'microsoftToDo', label: 'Microsoft To Do', mode: ms },
    { id: 'quickbooks', label: 'QuickBooks', mode: modeFor(config.qbo.environment) },
    { id: 'spreadsheet', label: 'Weekly spreadsheet', mode: ms },
  ]);
});
