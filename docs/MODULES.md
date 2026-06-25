# Modules — what's where and how data flows

> The code map: every significant module, what it does, and the **seams** where you make changes
> safely. For the *integration* contract (real API fields, scopes) see [ARCHITECTURE.md](ARCHITECTURE.md);
> this doc is the *code* orientation.

## End-to-end data flow

```
Page component (e.g. Dashboard.tsx)
   │  useApi(getDashboard)                         ← hooks/useApi.ts gives {data, loading, error}
   ▼
lib/api.ts  getDashboard() → read('outlook', '/api/dashboard', sample)
   │   read() decides per SOURCE_MODES + VITE_API_URL:
   │     • source live  → fetch `${VITE_API_URL}/api/...`            (real backend)
   │     • otherwise    → return bundled sample data from lib/data.ts (standalone, no backend)
   ▼
backend routes.js  route('outlook', liveProducer, demoProducer)
   │     • DEMO_MODE=1 → demoProducer()  → demo.js   (deterministic sample)
   │     • live + token → liveProducer() → graph.js / qbo.js  → transforms.js → DTO
   │     • live, no token → 401 ;  upstream error → 502
   ▼
JSON matching the DTO in lib/api.ts  → rendered by the page
```

**The contract is the DTO.** The TypeScript types in `frontend/src/lib/api.ts` + `lib/data.ts`
*are* the v1 API. Backend producers (`transforms.js`, `demo.js`) must return JSON matching them.
Match the shape and no page changes are needed to go live.

---

## Frontend (`frontend/src/`)

### Pages — the six tabs (`pages/`)
| File | Route | Notes |
|---|---|---|
| `Dashboard.tsx` | `/` | Daily + Monday views (`TodayView` / `MondayView`), KPI tiles, email triage with category badges, awaiting-response preview. |
| `EmailQueue.tsx` | `/email` | Master/detail email list + awaiting-response follow-up list. |
| `Calendar.tsx` | `/calendar` | Today timeline + week-ahead grid. |
| `Tasks.tsx` | `/tasks` | Tasks grouped by owner with a status filter. |
| `Financials.tsx` | `/financials` | Deposits + variable-spend KPIs; weekly vs daily layout by view mode. |
| `Reports.tsx` | `/reports` | 12-metric weekly table + encounters-by-specialty, week-over-week. |
| `Login.tsx` | `/login` | Auth entry (for the eventual live/SSO flow). |
| `Overview.tsx`, `Connections.tsx` | — | **Orphaned / not routed** — dead code, cleanup candidates. |

### Data + seams (`lib/`)
- **`api.ts` — the data-access seam.** Async getters (`getDashboard`, `getEmails`, `getCalendar`,
  `getTasks`, `getFinancials`, `getReports`, `getAwaiting`, …), the `read(source, path, sample)`
  helper, `SOURCE_MODES` + `sourceModeFor()`, and the response DTO types (`DashboardData`, etc.).
  **This is the single integration boundary — change here to go live, not in pages.**
- **`data.ts`** — the DTO type definitions (`Email`, `Task`, `WeeklyMetric`, `ScheduleItem`,
  `AwaitingResponse`, `Owner`, …) **and** the bundled sample data (`EMAILS`, `TASKS`, …) used in
  standalone/mock mode and by render tests.
- **`format.ts`** — `usd()`, `pctChange()` and other display formatters. `utils.ts` — `cn()`.

### Components + shell (`components/`)
- **`AppShell.tsx`** — sticky header (customer wordmark), nav with badge counts, the **Display &
  Accessibility** menu (theme + color-vision-friendly palette, in-memory only).
- **`primitives.tsx`** — the **accessibility-safe** building blocks: `Panel`, `KpiTile`, `Trend`
  (arrow + sign + value), `StatusPill` (distinct icon per status), `OwnerChip` — all designed so
  meaning survives without color. Reuse these; don't convey status by color alone.
- **`AsyncState.tsx`** — `Loading` / `ErrorState` for the `useApi` states.
- **`PhaseCard.tsx`** — the tasteful "later phase" card. **`MbSignature.tsx`** — required
  attribution mark (render once; don't restyle). **`ui/`** — shadcn button/card/input/label.

### Plumbing
- **`hooks/useApi.ts`** — wraps a getter into `{ data, loading, error }`.
- **`context/view-mode.tsx`** — the Daily/Monday `ViewModeProvider` (drives Dashboard + Financials).
  `context/UserContext.tsx` — current user.
- **`config/environment.ts`** — reads `VITE_API_URL`, `VITE_LIVE_SOURCES`, etc.
- **`utils/`** — `logger.ts` (use instead of `console.log`), `theme.ts`. ⚠️ `secureStorage.ts` /
  `encryption.ts` (`crypto-js`, hardcoded key) and `store/` (Redux + redux-persist) are **dead
  scaffolding** — not a real security control; cleanup candidates.

---

## Backend (`backend/src/`) — read-only BFF

| Module | Responsibility |
|---|---|
| **`server.js`** | Express app: CORS, JSON, session middleware, the **audit-log middleware** (`method path → status (ms)`, never bodies), `/health`, mounts the router, serves the built SPA in production, `listen`. |
| **`routes.js`** | The API surface + **source → producer wiring**. The `route(source, live, demo)` wrapper picks demo vs live vs `401`/`502`; `cached()` applies the short TTL. One endpoint per source + the `/api/dashboard` aggregate (parallel fan-out). |
| **`transforms.js`** | **Upstream → frontend DTO** mappers: `emailsFromGraph` (+ `classifyCategory`), `calendarFromGraph`, `tasksFromGraph`, `financialsFromQbo`, `reportsFromRanges`, `awaitingItem`. Pure functions — easy to unit-test, no logging of content. |
| **`demo.js`** | The **sample-data mirror** of every DTO, served when `DEMO_MODE=1`. Keep it in lockstep with `transforms.js` output and the frontend mock. |
| **`graph.js`** | Microsoft Graph client (mail / calendar / To Do / Excel reads). |
| **`qbo.js`** | QuickBooks Online client (deposits / purchases / reports). |
| **`auth.js`** | OAuth flows for the upstream sources. |
| **`session.js`** | Per-visitor session — in-memory token store keyed by an HttpOnly cookie. **No DB.** |
| **`cache.js`** | Short-TTL (~90s) in-memory cache — *caching, not storage*, never touches disk. |
| **`config.js`** | Env/config (`demoMode`, `port`, source flags). |

### The two backend seams to change safely
- **Contract seam — `transforms.js`:** map a real upstream payload to the exact DTO. Mirror any new
  field into `demo.js` and the frontend `data.ts` type/mock (additive-first — don't break the DTO).
- **Wiring seam — `routes.js`:** wire a source's live + demo producers behind `route(...)`.

---

## Run modes recap

| Command | Mode |
|---|---|
| `npm run dev:frontend` | Frontend standalone — sample data from `lib/data.ts`, no backend. |
| `npm run dev:backend` (`DEMO_MODE=1`) | BFF serving `demo.js` sample data — exercises the full FE↔BE wiring with no credentials. |
| `npm run serve` | Production-style: build the SPA, backend serves it + `/api` on one port. |
| live | Set `VITE_API_URL` + flip `SOURCE_MODES`; backend producers call `graph.js`/`qbo.js`. |
