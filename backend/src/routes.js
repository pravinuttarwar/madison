import { Router } from 'express';
import { config } from './config.js';
import { cached } from './cache.js';
import { demo } from './demo.js';
import { currentSession } from './session.js';
import { reportFromWorkbook } from './reports.js';
import * as graph from './graph.js';
import * as qbo from './qbo.js';
import * as T from './transforms.js';

export const router = Router();
const TTL = 90_000; // 90s in-memory cache

// Cache keys are scoped to the current visitor's session so one person's email/calendar
// can never be served to another from the shared cache.
const sk = (key) => `${currentSession()?.id || 'anon'}:${key}`;

// Is the CURRENT visitor connected to the source they're asking for?
function graphConnected() {
  return Boolean(currentSession()?.graph.refreshToken);
}
function qboConnected() {
  const q = currentSession()?.qbo;
  return Boolean(q?.refreshToken && q?.realmId);
}
function sourceReady(id) {
  if (config.demoMode) return true;
  if (id === 'quickbooks') return qboConnected();
  return graphConnected(); // outlook, microsoftToDo, microsoftTeams, spreadsheet
}

// Wrap a route: demo → sample; configured → live producer; else → signal "not connected".
// Graph (the Microsoft identity/session) → 401 so the UI returns to login. QuickBooks is a
// secondary connection → 503 so the UI shows a "Connect" button instead of logging out.
function route(sourceId, liveProducer, demoProducer) {
  return async (req, res) => {
    try {
      if (config.demoMode) return res.json(await demoProducer(req));
      if (!sourceReady(sourceId)) {
        if (sourceId === 'quickbooks') {
          return res.status(503).json({ error: 'source_not_connected', source: sourceId });
        }
        return res.status(401).json({ error: 'not_authenticated', source: sourceId });
      }
      return res.json(await liveProducer(req));
    } catch (err) {
      res.status(502).json({ error: 'upstream_failed', source: sourceId, message: String(err.message || err) });
    }
  };
}

// ── awaiting-response engine (per the customer's backend spec) ────────────────
async function computeAwaiting() {
  const { awaitingThresholdHours, awaitingLookbackDays, user } = config.graph;
  const owner = (user || '').toLowerCase();
  const sent = await graph.listSentItems(awaitingLookbackDays);
  const seen = new Set();
  const out = [];
  let idx = 0;
  for (const msg of sent) {
    if (!msg.conversationId || seen.has(msg.conversationId)) continue;
    seen.add(msg.conversationId);
    const latest = await graph.latestInConversation(msg.conversationId);
    if (!latest) continue;
    const latestFrom = (latest.from?.emailAddress?.address || '').toLowerCase();
    const fromOwner = owner ? latestFrom === owner : true; // set MS_USER for a precise test
    const ageH = (Date.now() - new Date(latest.sentDateTime).getTime()) / 3_600_000;
    if (fromOwner && ageH >= awaitingThresholdHours) {
      out.push(T.awaitingItem(msg, ageH, idx++));
    }
  }
  return out.sort((a, b) => b.hours - a.hours);
}

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
  async () => ({ displayName: 'Dr. Romano', mail: '' }),
));

// ── runtime settings the UI needs (e.g. the awaiting-response threshold) ──────
// Just numbers/labels from config — no creds, safe to expose. Lets the FE show the
// real "Sent ≥ Nh" copy from backend/.env instead of a hardcoded 48.
router.get('/settings', (_req, res) => {
  res.json({ awaitingThresholdHours: config.graph.awaitingThresholdHours });
});

// ── email ──────────────────────────────────────────────────────────────────��─
router.get('/email', route('outlook', async () => T.emailsFromGraph(await cached(sk('msgs'), TTL, () => graph.listMessages(25))), async () => demo.emails()));
router.get('/email/awaiting', route('outlook', async () => cached(sk('await'), TTL, computeAwaiting), async () => demo.awaiting()));
router.get('/email/:id', route('outlook',
  async (req) => {
    const all = T.emailsFromGraph(await cached(sk('msgs50'), TTL, () => graph.listMessages(50)));
    return all.find((e) => e.id === req.params.id) || {};
  },
  async (req) => demo.email(req.params.id) || {},
));

// ── calendar ───────────────────────────────────────────────────────────────��─
router.get('/calendar', route('outlook',
  async () => {
    const now = new Date();
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 7);
    return T.calendarFromGraph(await cached(sk('cal'), TTL, () => graph.calendarView(start.toISOString(), end.toISOString())));
  },
  async () => demo.calendar(),
));

// ── tasks ──────────────────────────────────────────────────────────────────��─
router.get('/tasks', route('microsoftToDo', async () => T.tasksFromGraph(await cached(sk('tasks'), TTL, () => graph.listTodoTasks())), async () => demo.tasks()));

// ── financials ─────────────────────────────────────────────────────────────��─
router.get('/financials', route('quickbooks',
  async () => {
    const now = new Date();
    const iso = (d) => d.toISOString().slice(0, 10);
    const from60 = new Date(now.getTime() - 60 * 86_400_000);
    const [dep, pur] = await Promise.all([
      cached(sk('qbo-dep'), TTL, () => qbo.deposits(iso(from60), iso(now))),
      cached(sk('qbo-pur'), TTL, () => qbo.purchases(iso(from60), iso(now))),
    ]);
    return T.financialsFromQbo(dep, pur, config.qbo.fixedAccountIds, now);
  },
  async () => demo.financials(),
));

// ── weekly report (spreadsheet) ───────────────────────────────────────────────
// The owner pastes a SharePoint/OneDrive share link; we download the workbook (Graph
// shares API), parse it IN MEMORY, and return the latest week + week-over-week. The
// parsed result is cached per-session (REPORTS_TTL) and refreshable on demand. The
// file bytes are never written to disk.
const REPORTS_TTL = 6 * 60 * 60 * 1000; // 6h

function reportsUrl() {
  return currentSession()?.reports?.url || config.reports.shareUrl || '';
}

async function buildReport() {
  const url = reportsUrl();
  if (!url) return { configured: false };
  const { name, buffer } = await graph.downloadShared(url);
  const r = reportFromWorkbook(buffer);
  return { configured: true, fileName: name, ...r };
}

router.get('/reports', route('spreadsheet',
  async (req) => {
    if (!reportsUrl()) return { configured: false };
    if (req.query.refresh === '1') return cached(sk('reports'), 0, buildReport); // bust
    return cached(sk('reports'), REPORTS_TTL, buildReport);
  },
  async () => ({ configured: true, ...demo.reports() }),
));

// Set/clear the spreadsheet source for THIS visitor; validates by parsing it once.
router.post('/reports/source', async (req, res) => {
  const s = currentSession();
  if (!s?.graph.refreshToken) return res.status(401).json({ error: 'not_authenticated' });
  const url = String(req.body?.url || '').trim();
  s.reports.url = url;
  if (!url) return res.json({ configured: false });
  try {
    const { name, buffer } = await graph.downloadShared(url);
    const r = reportFromWorkbook(buffer);
    const out = { configured: true, fileName: name, ...r };
    // cache it immediately so the next GET is instant
    await cached(sk('reports'), REPORTS_TTL, async () => out);
    res.json(out);
  } catch (err) {
    s.reports.url = ''; // don't keep a bad URL
    if (err.code === 'FORMAT') return res.status(422).json({ error: 'format_unrecognized' });
    if (err.status === 403) return res.status(403).json({ error: 'no_file_permission' });
    res.status(502).json({ error: 'read_failed', message: String(err.message || err) });
  }
});

// Debug probe: can the CURRENT scope read this share link? (used to decide if we need
// Files.Read.All / Sites.Read.All). Returns the resolved name or the Graph error.
router.get('/reports/probe', async (req, res) => {
  const s = currentSession();
  if (!s?.graph.refreshToken) return res.status(401).json({ error: 'not_authenticated' });
  const url = String(req.query.url || reportsUrl());
  if (!url) return res.status(400).json({ error: 'no_url' });
  try {
    const meta = await graph.resolveShare(url);
    res.json({ ok: true, name: meta.name, sizeKB: meta.sizeKB });
  } catch (err) {
    res.json({ ok: false, status: err.status || 0, message: String(err.message || err).slice(0, 300) });
  }
});

// ── dashboard aggregate (BFF) ─────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  const view = req.query.view === 'monday' ? 'monday' : 'weekday';
  try {
    if (config.demoMode) return res.json(demo.dashboard(view));

    // Microsoft is the session identity — if THIS visitor isn't connected, send them to
    // login (401) rather than returning a blank dashboard (looked like "all data gone").
    if (!graphConnected()) return res.status(401).json({ error: 'not_authenticated' });

    // Live mode: build from this visitor's live sources only — never fall back to demo.
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
        computeAwaiting().catch(() => []),
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
router.get('/sources/status', (_req, res) => {
  const g = graphConnected();
  const mode = (ready) => (config.demoMode ? 'sandbox' : ready ? 'live' : 'mock');
  res.json([
    { id: 'outlook', label: 'Outlook', mode: mode(g) },
    { id: 'microsoftToDo', label: 'Microsoft To Do', mode: mode(g) },
    { id: 'microsoftTeams', label: 'Microsoft Teams', mode: 'mock' },
    { id: 'quickbooks', label: 'QuickBooks', mode: mode(qboConnected()) },
    { id: 'spreadsheet', label: 'Weekly spreadsheet', mode: mode(g) },
  ]);
});
