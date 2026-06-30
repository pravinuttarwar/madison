import { Router } from 'express';
import { config } from './config.js';
import { cached } from './cache.js';
import { currentSession } from './session.js';
import * as graph from './graph.js';
import * as qbo from './qbo.js';
import * as T from './transforms.js';
import { computeAwaiting } from './awaiting.js';
import { readWorkbook, workbookRefs, resolveYearSources, connectWorkbook, WorkbookError } from './workbook.js';
import { workbookEvent, workbookUnmappedEvent, tasksEvent } from './audit.js';
import { graphToken } from './auth.js';
import { scopesFromAccessToken, GRAPH_SCOPE } from './oauth-graph.js';

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

// ── diagnostic: which Microsoft scopes this session was actually GRANTED ───────
// Decodes the current access token's claims and returns the scope NAMES only — the token
// itself never leaves the server. `requested` is what we ask Microsoft for; `delegated` is
// what was actually consented (a subset if an admin trimmed it). Use it to confirm e.g.
// whether Sites.Read.All is present before pointing at a SharePoint-hosted workbook.
router.get('/auth/scopes', route('outlook',
  async () => {
    const granted = scopesFromAccessToken(await graphToken());
    return {
      requested: GRAPH_SCOPE.split(' ').filter(Boolean),
      delegated: granted.delegated, // actually-granted delegated scopes (scp claim)
      app: granted.app,             // application roles, if any (app-only token)
    };
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
// Multi-owner "tasks by owner" when a team is configured (app-only, Tasks.Read.All);
// otherwise the signed-in person's own To Do (delegated). The DTO carries `multiOwner` as
// the discriminator: { multiOwner:false, tasks } | { multiOwner:true, owners }.
const TASKS_TEAM_TTL = 5 * 60_000; // 5 min — team task lists don't change second-to-second

// Build the team board: every configured owner fetched in PARALLEL (each owner's lists are
// parallel too), grouped by REAL owner. An unreadable/unresolvable owner is skipped, not
// fatal. Each owner read is audited (ok | denied) with only references + a count — never a
// task title (PHI-adjacent). One owner's tasks never enter another's card. Per-owner counts
// + the capped display list come from the pure summarizeOwnerTasks (counts are FULL/truthful;
// see transforms.js) so the board's filter chips reconcile (open = overdue+dueToday+upcoming).
async function buildTeamTasks(upns, sessionId) {
  const owners = (
    await Promise.all(
      upns.map(async (upn) => {
        const u = await graph.resolveUser(upn);
        if (!u) return null;
        let tasks = [];
        try {
          tasks = T.tasksFromGraph(await graph.userTodoTasks(u.id), new Date(), u.upn);
          tasksEvent('read', { sessionId, owner: u.id, count: tasks.length, outcome: 'ok' });
        } catch {
          tasksEvent('read', { sessionId, owner: u.id, outcome: 'denied' }); // skip unreadable
        }
        return { upn: u.upn, name: u.name, ...T.summarizeOwnerTasks(tasks) };
      }),
    )
  ).filter(Boolean);
  owners.sort((a, b) => b.overdue - a.overdue || b.open - a.open);
  return { multiOwner: true, owners };
}

router.get('/tasks', route('microsoftToDo', async (req) => {
  const sessionId = currentSession()?.id || 'none';
  const team = config.tasks.teamUpns;
  // Team mode needs app creds (client-credentials); fixtures mode bypasses tokens entirely.
  if (team.length && (config.hasGraphCreds || config.fixturesMode)) {
    return cached(sk('tasks-team'), req.query.refresh === '1' ? 0 : TASKS_TEAM_TTL, () => buildTeamTasks(team, sessionId));
  }
  const tasks = T.tasksFromGraph(await cached(sk('tasks'), TTL, () => graph.listTodoTasks()));
  tasksEvent('read', { sessionId, owner: 'self', count: tasks.length, outcome: 'ok' });
  return { multiOwner: false, tasks };
}));

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
// MAD-27: tolerant GRID parser over the real workbooks (Strategy A) — replaces the named-range
// path. We list each connected workbook's worksheets, select the monthly "Totals Madison"
// metric tabs, read their used-range grids, normalize the dirty headers, and aggregate across
// tabs AND files. Period tabs are chosen by POSITION (latest = current, previous = prior) — no
// date math, so no timezone concerns. A connected prior-year workbook supplies the additive
// year-ago values (YoY). The DTO shape is unchanged (back-compat — AC-6).
// MAD-48: the report is the slow path (lists worksheets + many used-range reads), and the data
// changes ~daily at most — so cache the payload for 24h per session, with a ?refresh=1 bypass
// (a Refresh button). The whole producer is cached, so a cache HIT does no upstream read and
// emits no spurious workbook-read audit (the audit lives inside the producer).
export const REPORT_TTL_MS = 24 * 60 * 60 * 1000; // tz-safe: a fixed cache duration, not a calendar time
export function reportCacheTtl(refresh) { return refresh ? 0 : REPORT_TTL_MS; }

router.get('/reports', route('spreadsheet',
  async (req) => cached(sk('reports'), reportCacheTtl(req?.query?.refresh === '1'), async () => {
    const sessionId = currentSession()?.id || 'none';
    // MAD-52: connections are keyed by YEAR — the latest connected year is the current source,
    // the next-latest is the prior-year (YoY) source. Falls back to the env drive path(s).
    const { current: currentSrc, prevYear: prevYearSrc } = resolveYearSources(workbookRefs());
    const currentSources = currentSrc ? [currentSrc] : [null]; // null → current env path
    const prevYearSources = prevYearSrc
      ? [prevYearSrc]
      : (config.graph.prevYearSpreadsheetPath ? [{ envPath: config.graph.prevYearSpreadsheetPath }] : []);

    // Read ONE workbook source → { current, prior } metric count-maps. We read the metric tabs
    // from the LATEST backward and keep the first two WITH DATA. For the current-year file we
    // first CAP to the current calendar month (MAD-45) so a phantom future-month tab (e.g. stray
    // December entries) can't be picked over the real current month; the prior-year file is NOT
    // capped (all its months are in the past). The current-month tab is kept even if empty — the
    // latest-with-data scan then falls back to the last month with data (AC-3).
    const readSource = async (src, capToMonth) => {
      let metricTabs = T.selectMetricTabs(await graph.workbookWorksheetNames(src));
      if (capToMonth) metricTabs = T.capMetricTabsToMonth(metricTabs, new Date()); // current month, practice zone
      const item = (src && src.itemId) || 'env';
      const collected = []; // latest-first: [{ counts, tab }]
      const unmapped = []; // MAD-50: unrecognized metric labels (references only) → report warnings
      for (let i = metricTabs.length - 1; i >= 0 && collected.length < 2; i -= 1) {
        const tab = metricTabs[i];
        const parsed = T.countsFromGrid(await graph.workbookUsedRange(tab, src));
        // AC-8/9: surface unmapped labels PHI-safely — item + sheet + index references, no values.
        if (parsed.unmapped.length) {
          workbookUnmappedEvent({ sessionId, ref: item, sheet: tab, columns: parsed.unmapped.map((u) => u.col ?? u.row) });
          unmapped.push(...parsed.unmapped);
        }
        if (Object.keys(parsed.counts).length > 0) collected.push({ counts: parsed.counts, tab }); // skip empty tabs
      }
      return {
        current: collected[0]?.counts || {},
        prior: collected[1]?.counts || {},
        currentTab: collected[0]?.tab || null, // MAD-50: drives the real period label
        priorTab: collected[1]?.tab || null,
        unmapped,
      };
    };

    // Aggregate current/prior across all current sources — capped to the current month (MAD-45).
    const currentReads = await Promise.all(currentSources.map((src) => readSource(src, true)));
    const current = T.mergeCounts(currentReads.map((r) => r.current));
    const prior = T.mergeCounts(currentReads.map((r) => r.prior));
    // MAD-50: the real period (month labels) comes from the first source that yielded a current tab.
    const periodLead = currentReads.find((r) => r.currentTab) || {};
    // tz-safe: period month comes from the tab name (data); `new Date()` only supplies the calendar
    // year, which periodFromTabs pins to the practice zone — zone-independent for the user.
    const period = T.periodFromTabs(periodLead.currentTab, periodLead.priorTab, new Date());
    const metricUnmapped = currentReads.flatMap((r) => r.unmapped || []);
    // YoY: the prior-year file's latest tab → additive yearAgo (NOT capped — it's a past year).
    const prevYearReads = await Promise.all(prevYearSources.map((src) => readSource(src, false)));
    const yearAgo = T.mergeCounts(prevYearReads.map((r) => r.current));

    // MAD-46: per-provider breakdown — read the Provider Totals tabs (or, for the Chiro file
    // which has no such tabs, its month tabs) from each current source, capped to the current
    // month, latest-with-data. Additive; failures degrade to an empty list (never break the report).
    const readProviders = async (src) => {
      const names = await graph.workbookWorksheetNames(src);
      let provTabs = T.selectProviderTabs(names);
      if (!provTabs.length) {
        // Chiro Numbers: no "Provider Totals" tabs — its month tabs ARE the provider data.
        provTabs = names.filter((n) => T.monthIndexFromTabName(n) != null && !String(n).toLowerCase().startsWith('microsoft.com:'));
      }
      provTabs = T.capMetricTabsToMonth(provTabs, new Date());
      const item = (src && src.itemId) || 'env';
      const collected = []; // latest-first: [current, prior]
      const skipped = []; // MAD-50: after-TOTAL labels found but not counted (references only)
      for (let i = provTabs.length - 1; i >= 0 && collected.length < 2; i -= 1) {
        const { counts, skipped: sk } = T.providerCountsFromGrid(await graph.workbookUsedRange(provTabs[i], src));
        if (sk.length) skipped.push(...sk);
        if (Object.keys(counts).length > 0) collected.push(counts);
      }
      return { current: collected[0] || {}, prior: collected[1] || {}, item, skipped };
    };
    let providers = [];
    let providerSkipped = [];
    try {
      const provReads = await Promise.all(currentSources.map(readProviders));
      providers = T.providersSection(
        T.mergeProviderCounts(provReads.map((r) => r.current)),
        T.mergeProviderCounts(provReads.map((r) => r.prior)),
      );
      providerSkipped = provReads.flatMap((r) => r.skipped || []);
    } catch { providers = []; } // additive — a provider-read failure never breaks the metrics report

    // MAD-51: the WEEKLY view — split each current source's metric tabs into their stacked weekly
    // blocks (latest-first across tabs), taking the latest block as the current week and the
    // previous block as the prior week. Providers are summed per week the same way. Additive: the
    // `weekly` section is built only when a current week block exists; a failure degrades to no
    // weekly section, never breaking the monthly report.
    const readWeeklyBlocks = async (src, counter) => {
      let tabs = T.selectMetricTabs(await graph.workbookWorksheetNames(src));
      tabs = T.capMetricTabsToMonth(tabs, new Date());
      const blocks = []; // latest-first: [current, prior]
      for (let i = tabs.length - 1; i >= 0 && blocks.length < 2; i -= 1) {
        const wbs = T.splitWeeklyBlocks(await graph.workbookUsedRange(tabs[i], src));
        for (let b = wbs.length - 1; b >= 0 && blocks.length < 2; b -= 1) {
          const counts = counter(wbs[b].rows);
          if (Object.keys(counts).length > 0) blocks.push({ serials: wbs[b].dateSerials, counts });
        }
      }
      return blocks;
    };
    const readWeeklyProviderBlocks = async (src) => {
      const names = await graph.workbookWorksheetNames(src);
      let provTabs = T.selectProviderTabs(names);
      if (!provTabs.length) {
        provTabs = names.filter((n) => T.monthIndexFromTabName(n) != null && !String(n).toLowerCase().startsWith('microsoft.com:'));
      }
      provTabs = T.capMetricTabsToMonth(provTabs, new Date());
      const blocks = []; // latest-first: [current, prior]
      for (let i = provTabs.length - 1; i >= 0 && blocks.length < 2; i -= 1) {
        const wbs = T.splitWeeklyBlocks(await graph.workbookUsedRange(provTabs[i], src));
        for (let b = wbs.length - 1; b >= 0 && blocks.length < 2; b -= 1) {
          const counts = T.providerCountsFromGrid(wbs[b].rows).counts;
          if (Object.keys(counts).length > 0) blocks.push(counts);
        }
      }
      return blocks;
    };
    let weekly = null;
    try {
      const weekReads = await Promise.all(currentSources.map((src) => readWeeklyBlocks(src, (rows) => T.countsFromGrid(rows).counts)));
      const curBlocks = weekReads.map((b) => b[0]).filter(Boolean);
      const priorBlocks = weekReads.map((b) => b[1]).filter(Boolean);
      if (curBlocks.length) {
        let wProviders = [];
        try {
          const provWeek = await Promise.all(currentSources.map(readWeeklyProviderBlocks));
          wProviders = T.providersSection(
            T.mergeProviderCounts(provWeek.map((b) => b[0]).filter(Boolean)),
            T.mergeProviderCounts(provWeek.map((b) => b[1]).filter(Boolean)),
          );
        } catch { wProviders = []; }
        weekly = T.weeklyReportSection({
          current: T.mergeCounts(curBlocks.map((b) => b.counts)),
          prior: T.mergeCounts(priorBlocks.map((b) => b.counts)),
          currentSerials: curBlocks[0]?.serials || [],
          priorSerials: priorBlocks[0]?.serials || [],
          providers: wProviders,
        });
      }
    } catch { weekly = null; } // additive — a weekly-read failure never breaks the monthly report

    // Audit the workbook READ once per request — item reference(s) + outcome, never cell values (AC-8).
    const items = [...currentSources, ...prevYearSources].map((s) => (s && s.itemId) || 'env').join(',') || 'env';
    workbookEvent('read', { sessionId, ref: items, outcome: 'ok' });

    const dto = T.reportsFromGrids(
      { current, prior, yearAgo: Object.keys(yearAgo).length ? yearAgo : undefined },
      undefined,
      { period }, // MAD-50: real month period (replaces the hardcoded "Week 0")
    );
    if (providers.length) dto.providers = providers; // additive section (MAD-46)
    if (weekly) dto.weekly = weekly; // additive weekly-block view (MAD-51); absent when no week block
    // MAD-50: "found but not counted" — unrecognized metric labels + after-TOTAL provider rows,
    // surfaced for review. Labels/references only, never cell values (AC-3). Additive; absent when empty.
    const warnings = T.reportWarnings(metricUnmapped, providerSkipped);
    if (warnings.length) dto.warnings = warnings;
    return dto;
  }),
));

// ── weekly-report workbook CONNECTION (MAD-26: paste → resolve → validate → persist) ──
// Both routes require the Microsoft session (the workbook lives in the owner's OneDrive/
// SharePoint) → 401 when not connected, mirroring the other Graph-backed routes.
const basename = (p) => String(p || '').split('/').filter(Boolean).pop() || '';

router.get('/reports/connection', (_req, res) => {
  if (!graphConnected()) return res.status(401).json({ error: 'not_authenticated', source: 'spreadsheet' });
  // MAD-52: report the connected workbooks keyed by YEAR (latest first) so the connect UI can
  // show what's connected + warn before overwriting a year. Location refs only — no cell values.
  const years = workbookRefs()
    .filter((r) => r.year != null)
    .map((r) => ({ year: Number(r.year), name: r.name }))
    .sort((a, b) => b.year - a.year);
  const wb = readWorkbook();
  if (wb) return res.json({ connected: true, name: wb.name, source: wb.source, via: 'connection', years });
  if (config.graph.spreadsheetPath) {
    return res.json({ connected: true, name: basename(config.graph.spreadsheetPath), source: 'env', via: 'env', years });
  }
  return res.json({ connected: false, years });
});

router.post('/reports/connection', async (req, res) => {
  if (!graphConnected()) return res.status(401).json({ error: 'not_authenticated', source: 'spreadsheet' });
  const input = (req.body && req.body.input) || '';
  if (!String(input).trim()) return res.status(400).json({ error: 'missing_input' });
  // MAD-52: an optional `year` (the year the workbook covers) keys the connection — the report
  // uses the latest year as current and the next as the prior-year (YoY). A non-numeric year → null.
  const yearNum = Number(req.body && req.body.year);
  const year = Number.isInteger(yearNum) && yearNum > 0 ? yearNum : null;
  try {
    const result = await connectWorkbook(input, {
      sessionId: currentSession()?.id || 'none',
      resolveShareUrl: graph.resolveShareUrl,
      resolveDrivePath: graph.resolveDrivePath,
      workbookReachable: graph.workbookReachable,
      audit: (action, meta) => workbookEvent(action, meta),
      year,
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
