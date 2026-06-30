# Status — what's done vs. what's remaining

> The honest current state, mapped to **customer expectations** and to the **Jira epic**. Update
> this when a story ships. For the "why" behind each item see [CUSTOMER.md](CUSTOMER.md); for the
> sequence see [ROADMAP.md](ROADMAP.md).

**Where the source of truth lives:** Jira epic **[MBI-18 "Madison Feedback"](https://connecthealth.atlassian.net/browse/MBI-18)**
holds the active feature stories. This doc summarizes; the tickets are authoritative.

---

## Customer expectation → screen → status

| Expectation (from discovery) | Screen / mechanism | Status |
|---|---|---|
| One consolidated at-a-glance view; Daily + Monday recap | Dashboard (`/`) | ✅ Done — both views with toggle (MBI-20) |
| Important-email triage, categorized, never a raw inbox | Email Queue + Dashboard email panel | ✅ Done on sample data (MBI-19); live mail pending consent |
| "Sent, no reply" follow-up | Email Queue + Dashboard "Awaiting response" | 🟡 UI done; detection engine spec'd, not wired (needs live Graph) |
| Calendar: today + week ahead | Calendar (`/calendar`) | ✅ UI done on sample data |
| Tasks grouped by owner, due/overdue | Tasks (`/tasks`) | 🟡 **Multi-owner "tasks by owner" board wired (MAD-37)** — `/api/tasks` reads each configured team member's To Do app-only (`Tasks.Read.All`), grouped server-side by real owner (no hardcoded owner); single-user fallback preserved. Live data pending M365 admin consent for the app-only scope |
| Clean QuickBooks snapshot (deposits, variable spend, net contribution, **revenue**, **outstanding A/R**, **cash flow**) | Financials (`/financials`) | 🟡 UI done incl. accrual revenue tile (MAD-23) + outstanding-invoice / A/R aging (MAD-24) + cash-flow overview (MAD-25); live QBO via OAuth (MAD-15); fixed-cost exclusion is config-only |
| Weekly provider spreadsheet snapshot + WoW/MoM/YoY deltas | Reports (`/reports`) | 🟡 **Tolerant GRID parser over the practice's real workbooks wired (MAD-27)** — `/api/reports` lists each connected workbook's worksheets, selects the monthly "Totals Madison" tabs, reads their used-ranges, normalizes the dirty headers (Med/Chiro/Pod/PT/IV&MA/ACU/MO/Allergy/Covid/Telehealth + free-typed new-patients) to 11 canonical metrics, and aggregates across tabs + files; the named-range read path is **removed**. **Multi-URL connection (MAD-27)** — connect a current + optional prior-year file, persisted as a role-tagged JSON array (no DB, no cell values at rest); **WoW + YoY** wired (prior-year file → additive `yearAgo`); MoM is DTO-supported but not double-populated (last/prior already express month-over-month). Builds on the connection flow from **MAD-26**. UI multi-period source-picker/chart still parked (MBI-22) |
| Color-blind-accessible UI (never color alone) | accessibility primitives + Display menu | ✅ Done — exact dark palette + Color-Vision-Friendly default (MBI-21) |
| Timezone-correct dates (practice zone, America/New_York) | dashboard view default + date transforms | ✅ Done (MBI-26/27/28) |
| Mirror the owner's design; drop CureMD, Plaid, AI panel, Projects, Connections, Teams | app shell + composition | ✅ Done |
| EHR / clinical reporting, AI assistant, front-desk reconciliation | — | ⛔ Out of scope (see [CUSTOMER.md](CUSTOMER.md)) |

Legend: ✅ done · 🟡 prototype/partial (UI real, live data pending) · ⛔ out of scope

---

## Feature stories (epic MBI-18)

### ✅ Done

- **[MBI-19](https://connecthealth.atlassian.net/browse/MBI-19) — Email prioritization: important-only morning briefing.**
  Dashboard email panel shows only important emails, each tagged **Management / Operational /
  Action-needed** via icon + text (never color alone). Backend has a config-driven sender/domain →
  category classifier (empty until the customer's sender lists arrive; unmatched → `action-needed`).
- **[MBI-20](https://connecthealth.atlassian.net/browse/MBI-20) — Daily and Monday dashboard views.**
  Auto-defaults by weekday (Monday → Monday view, else Daily) with a visible, keyboard-accessible
  toggle. Monday view adds the previous-week recap (metrics + WoW deltas, weekly financials, total
  encounters). Revived the previously-dead `isMonday` branch in Financials.
- **Timezone hardening (MBI-26 / MBI-27 / MBI-28).** QuickBooks/Outlook transforms, the
  Daily/Monday auto-default, and To Do due dates all compute against the **practice zone**
  (`America/New_York`) so calendar-date buckets and "overdue/due-today" are correct.
- **[MBI-21](https://connecthealth.atlassian.net/browse/MBI-21) — Colorblind-strict palette matching the original design.**
  One canonical **dark** command-center palette taken verbatim from the owner's `madison_medical_jarvis_v2.html`
  mockup (strong black `#0a0a0c` / crimson `#C0002A` / white `#e8e8ea`); **light mode removed** (the owner
  wants a single dark mode), and **Color-Vision-Friendly is the default-on** scheme. Status stays icon +
  shape + text, never color alone.
- **[MBI-31](https://connecthealth.atlassian.net/browse/MBI-31) — Dashboard crash on an unclassified email category.**
  `CategoryBadge` falls back to `action-needed` instead of dereferencing an undefined lookup (found running live).
- **[MBI-32](https://connecthealth.atlassian.net/browse/MBI-32) — Removed the out-of-scope Microsoft Teams data source**
  (dead `mock` flag, never wired). Calendar "Microsoft Teams" meeting venues are kept.
- **[MBI-40](https://connecthealth.atlassian.net/browse/MBI-40) — Removed dead frontend scaffolding** (Redux
  store + redux-persist + orphaned `pages/Overview.tsx`); bundle −18 kB. (`crypto-js` kept — it backs the live
  `secureStorage`.)
- **[MBI-34](https://connecthealth.atlassian.net/browse/MBI-34) — Replacement test fixtures for the gate** (go-live
  blocker). Synthetic **upstream** Graph/QBO payloads + a `FIXTURES_DIR` seam so `characterization-fixtures.test.js`
  pins the `/api/*` contract through the **live** route + transforms path — no `DEMO_MODE`. Frontend render fixtures
  in `src/test/fixtures.ts`.
- **[MBI-35](https://connecthealth.atlassian.net/browse/MBI-35) — Frontend live-only getters.** `lib/api.ts` getters
  always fetch the backend (sample fallback removed); the runtime sample arrays are gone from `lib/data.ts` and the
  bundle. Render tests run offline via a `fetch` stub serving the fixtures.
- **[MBI-36](https://connecthealth.atlassian.net/browse/MBI-36) — Backend retired `DEMO_MODE` + `demo.js`.** Routes are
  always live (401 Microsoft / 503 QuickBooks when disconnected); `/api/sources/status` reports env-driven
  `sandbox`/`live` (no `mock`). HIPAA audit + PHI-safe logging re-proven on the live path.
- **[MBI-38](https://connecthealth.atlassian.net/browse/MBI-38) — Dropped the `mock` SourceMode.** `SourceMode` is
  `sandbox | live` only; env-driven badges; live-only auth (the sample auto-login is gone); no "sample data" copy anywhere.
- **[MBI-37](https://connecthealth.atlassian.net/browse/MBI-37) — Hardened empty/loading/error states.** Fixed EmailQueue
  treating an empty inbox as an error (friendly `EmptyState` primitive); render tests pin loading/empty/error + 401→login
  + 503→pending across the pages.
- **[MBI-33](https://connecthealth.atlassian.net/browse/MBI-33) — Go live-only (Phase-2 epic) — DONE.** The runtime
  sample path is gone end-to-end (frontend + backend); the gate runs the live path offline against fixtures. **Demo
  decision (MBI-39):** the published `share.mindbowser.com` demo is a **deliberately frozen artifact** — the live-only
  build is **not** deployed to that URL (so it stays the working sample-data demo). ⚠️ Do **not** "fix" the public demo
  by deploying `main` to it; that's intentional, not a regression.
- **[MBI-41](https://connecthealth.atlassian.net/browse/MBI-41) — Removed the Display & Accessibility control.** The
  header `DisplayMenu` (+ its `Seg` helper and the orphaned divider) is gone; the **Color-Vision-Friendly palette stays
  the default**, applied at boot in `main.tsx` via `theme.ts` (no in-app toggle). `theme.ts` left intact.
- **[MAD-14](https://connecthealth.atlassian.net/browse/MAD-14) — Production environment + secrets vault + TLS** (Phase-1
  productionization, epic [MAD-1](https://connecthealth.atlassian.net/browse/MAD-1), MAD Sprint 1). Code-side hardening:
  `security.js` adds **proxy-aware TLS enforcement** (`FORCE_HTTPS=1` → trust-proxy, http→https 308, HSTS; off by default
  so local dev is untouched) + secure-cookie gating; `config.js` adds a single **`getSecret()` accessor** (the one seam a
  vault replaces later — app creds stay in `.env` for now); `audit.js` extracts the request logger and **strips the query
  string** so an OAuth callback's `code`/tokens never land in logs. AC-1..AC-5 pinned by `security/audit/secrets` tests.
  **Deferred to an ops/infra ticket ([MAD-33](https://connecthealth.atlassian.net/browse/MAD-33)):** production provisioning,
  live vault wiring, BAA determination (the original Blocker). PR [#20](https://github.com/pravinuttarwar/madison/pull/20)
  merged; ticket sits in **Testing (owner QA)** — moves to Done after the owner's manual verification.
- **[MAD-15](https://connecthealth.atlassian.net/browse/MAD-15) — Microsoft Graph production OAuth + token management**
  (Phase-1 productionization, epic [MAD-1](https://connecthealth.atlassian.net/browse/MAD-1), MAD Sprint 1). Hardening on
  the existing Graph OAuth plumbing: `auth.js` `graphToken()` now treats a **rejected refresh token** (400/401 = revoked/
  expired/password reset) as a forced re-auth — clears the session's Graph creds, audits it, and signals `not_authenticated`
  so routes return **401** (re-prompt sign-in) instead of a generic 502 (`routes.js` `errorResponse()`). Adds an `authEvent()`
  audit seam (`audit.js`) recording who·what·when·outcome for consent/refresh/re-auth — never a token/secret/code. New
  `oauth-graph.js` (single-source read-only `GRAPH_SCOPE` + pure `buildAuthorizeUrl()`, pinned tenant + HTTPS redirect) and
  `server-oauth.js` (sign-in/callback extracted so the no-token-to-browser guarantee is unit-testable). Refresh tokens stay
  **in-memory** (owner's no-storage preference; a persistent encrypted vault is a separate later ticket). AC-1..AC-7 pinned
  by `graph-oauth`/`oauth-signin` tests. **Deferred:** conditional `Sites.Read.All`/`Group.Read.All` scopes → SharePoint/
  Planner stories; admin-consent/tenant-restriction is a routed product dependency, not code. PR
  [#22](https://github.com/pravinuttarwar/madison/pull/22) merged; ticket sits in **Testing (owner QA)** — moves to Done
  after the owner's manual verification.
- **[MAD-17](https://connecthealth.atlassian.net/browse/MAD-17) — Live Outlook email + important-email surfacing**
  (Phase-1 productionization, epic [MAD-1](https://connecthealth.atlassian.net/browse/MAD-1), MAD Sprint 2). `/api/email`
  + `/api/email/:id` serve live Microsoft Graph mail mapped to the email DTO (`important = high || flagged`, `unread`,
  category); the customer's sender/domain→category lists load from a `CATEGORY_RULES` config seam (empty default →
  `action-needed`, so important mail is never hidden). 401 when Outlook disconnected. AC-1..AC-7 pinned; audit + PHI-safe
  logging re-proven. PR [#27](https://github.com/pravinuttarwar/madison/pull/27) merged; **Testing (owner QA)**.
- **[MAD-23](https://connecthealth.atlassian.net/browse/MAD-23) — Revenue visibility (Financials)**
  (Phase-1 productionization, epic [MAD-1](https://connecthealth.atlassian.net/browse/MAD-1), MAD Sprint 2). Adds an
  **accrual-basis revenue** figure (QuickBooks ProfitAndLoss → Total Income) as an **additive** `revenue` field on
  `/api/financials` — last full week + prior week (WoW) and month-to-date — and a **Revenue** tile in both Financials
  view-modes, noting it is accrual-basis and so differs from cash deposits. Net-new: `qbo.report()` wiring + a synthetic
  ProfitAndLoss fixture, the `incomeFromProfitAndLoss` parser (robust to the real QBO report shape — group-identified
  Income section, blank trailing columns), and `financePeriods` (ET-correct window boundaries). No contract break; no
  DB/migration. AC-1..AC-7 pinned by `revenue`/`characterization-fixtures`/`Financials.test.tsx`. PR
  [#28](https://github.com/pravinuttarwar/madison/pull/28) merged; **Testing (owner QA)**.
- **[MAD-24](https://connecthealth.atlassian.net/browse/MAD-24) — Outstanding-invoice tracking (Financials)**
  (Phase-1 productionization, epic [MAD-1](https://connecthealth.atlassian.net/browse/MAD-1), MAD Sprint 2). Adds
  **aggregate A/R visibility** from open QuickBooks Invoices (`Balance > 0`) as an **additive** `receivables` field on
  `/api/financials` — total outstanding, open-invoice count, and five aging buckets (Current / 1–30 / 31–60 / 61–90 /
  90+ days past due) — plus an **Outstanding A/R** tile and an aging panel in both Financials view-modes. Net-new:
  `qbo.invoices()` query + a synthetic `invoices.json` fixture, the `outstandingInvoicesFromQbo` transform (days-past-due
  in the practice zone, DST-correct; degrades to a zeroed snapshot on failure). **Aggregate-only — no customer/patient
  names in the DTO or logs** (HIPAA / SOW no-PHI posture). No contract break; no DB/migration. AC-1..AC-10 pinned by
  `transforms`/`characterization-fixtures`/`receivables`/`Financials.test.tsx`. PR
  [#30](https://github.com/pravinuttarwar/madison/pull/30) merged; **Testing (owner QA)**.
- **[MAD-25](https://connecthealth.atlassian.net/browse/MAD-25) — Cash-flow overview (Financials)**
  (Phase-1 productionization, epic [MAD-1](https://connecthealth.atlassian.net/browse/MAD-1), MAD Sprint 2). Adds a
  **derived cash-flow summary** as an **additive** `cashFlow` field on `/api/financials` — cash in (deposits), cash out
  (**all** purchases incl. fixed costs, distinct from variable spend), net = in − out — over last week vs prior (WoW) and
  month-to-date, plus a **Net cash flow** tile (Monday: last week + WoW; Weekday: MTD) and an inflow-vs-outflow panel with
  color-blind-safe direction. Net-new: the `cashFlowFromQbo` transform over `financePeriods` windows (practice-zone,
  DST-immune date-only compare; degrades to a zeroed summary), reusing the deposits/purchases already fetched (no new QBO
  call). No contract break; no DB/migration. AC-1..AC-8 pinned by
  `transforms`/`characterization-fixtures`/`cashflow`/`Financials.test.tsx`. PR
  [#32](https://github.com/pravinuttarwar/madison/pull/32) merged; **Testing (owner QA)**.
- **[MAD-26](https://connecthealth.atlassian.net/browse/MAD-26) — Connect SharePoint/OneDrive workbook (paste, validate, persist, read)**
  (Phase-1 productionization, epic [MAD-1](https://connecthealth.atlassian.net/browse/MAD-1), MAD Sprint 2; was
  MBI-22 / MBI-29 / MBI-30). Revives `Connections.tsx` as the **weekly-report workbook connection** UI: a connected
  Graph user pastes a OneDrive/SharePoint **share-URL or drive path**; the backend resolves it to a Graph drive item,
  confirms **read-only reachability**, and shows connected / not-reachable status. The location is persisted as
  **non-PHI config** (driveId/itemId/name only — **never cell values**) to a small **server-side JSON file** (the
  backend stays DB-less / no-PHI-at-rest); `/api/reports` then reads named ranges from the connected item, with
  `SPREADSHEET_DRIVE_PATH` env as fallback. Net-new: `workbook.js` (classify/connect/persist/`workbookBase`),
  `graph.js` share-URL resolve + reachability, `workbookEvent` audit (item reference + outcome, never the share-URL
  or cell values — HIPAA), `GET/POST /api/reports/connection`, and a `WorkbookCard` (paste → validate → status).
  **Additive — `/api/reports` shape unchanged; no DB/migration; no PHI at rest.** AC-1..AC-8 pinned by
  `workbook`/`graph-workbook`/`audit`/`workbook-connection`/`Connections.test.tsx`. PR
  [#34](https://github.com/pravinuttarwar/madison/pull/34) merged; **Testing (owner QA)**. (Named-range → metric
  mapping for the practice's real sheets remains parked under MBI-22, pending the customer's sheet formats.)
- **[MAD-29](https://connecthealth.atlassian.net/browse/MAD-29) — Year-over-year reporting comparison**
  (Phase-1 productionization, epic [MAD-1](https://connecthealth.atlassian.net/browse/MAD-1), MAD Sprint 2; SOW
  Module 4 scope-gap). Adds an **additive** same-period-last-year (`yearAgo`) value to the weekly report, sourced from
  **prior-year named ranges** on the connected workbook (`<Metric>PrevYear`). When present, each metric + the total +
  each specialty row gain a year-ago figure and the Reports page shows a **YoY** column/indicators (color-blind-safe
  `Trend`); when absent the report stays week-over-week **byte-for-byte as before** (back-compat). Net-new:
  `reportsFromRanges` prior-year support, `config.prevYearRanges` (`SPREADSHEET_PREV_YEAR_RANGES`), `/api/reports`
  prior-year reads, optional `yearAgo` on the DTO. **Additive — `/api/reports` shape unchanged without prior-year
  ranges; no DB; not ePHI (aggregate counts).** AC-1..AC-5 pinned by `transforms`/`characterization-fixtures`/
  `Reports.test.tsx`. PR [#36](https://github.com/pravinuttarwar/madison/pull/36) merged; **Testing (owner QA)**.
  Go-live data dependency: customer populates the prior-year ranges. The multi-year source-picker + Recharts chart
  stay parked under MBI-22 (salvage branch `origin/feature/reports-spreadsheet` is the reference).
- **[MAD-28](https://connecthealth.atlassian.net/browse/MAD-28) — Month-over-month reporting comparison**
  (Phase-1 productionization, epic [MAD-1](https://connecthealth.atlassian.net/browse/MAD-1), MAD Sprint 2; SOW
  Module 4 scope-gap). Adds an **additive** true month-over-month comparison — **month-to-date vs prior-month total** —
  to the weekly report, sourced from MTD + prior-month named ranges (`<Metric>MTD` / `<Metric>PrevMonth`), independent
  of the YoY field (MAD-29). When present, each metric + the total + each specialty row gain `monthToDate`/`prevMonth`
  and the Reports page shows a **MoM** column/indicators (color-blind-safe `Trend`); when absent the report stays
  week-over-week **byte-for-byte as before** (back-compat). Net-new: `reportsFromRanges` month support,
  `config.monthToDateRanges`/`prevMonthRanges` (`SPREADSHEET_MTD_RANGES` / `SPREADSHEET_PREV_MONTH_RANGES`),
  `/api/reports` month reads, optional `monthToDate`/`prevMonth` on the DTO. **Additive — `/api/reports` shape
  unchanged without month ranges; no DB; not ePHI.** AC-1..AC-5 pinned by `transforms`/`characterization-fixtures`/
  `Reports.test.tsx`. PR [#38](https://github.com/pravinuttarwar/madison/pull/38) merged; **Testing (owner QA)**.
  Go-live data dependency: customer populates the MTD + prior-month ranges. **With MAD-28 + MAD-29, the SOW Module 4
  WoW/MoM/YoY comparison set is complete** (real-sheet metric mapping + multi-period chart remain parked under MBI-22).
- **[MAD-40](https://connecthealth.atlassian.net/browse/MAD-40) — Self-host the mockup fonts**
  (Phase-1 productionization, epic [MAD-1](https://connecthealth.atlassian.net/browse/MAD-1), MAD Sprint 2). The
  crimson accent + Fraunces/JetBrains-Mono typography already shipped (MBI-21); this removes the **runtime Google
  Fonts CDN** dependency — the fonts are now bundled and **served from our own origin** via `@fontsource-variable`
  (imported in `main.tsx`), eliminating a third-party runtime call (HIPAA/privacy posture + offline-reliable
  shipped artifact). No visual change; the `--font-display`/`--font-mono` tokens now prefer the self-hosted variable
  faces. **Frontend-only; no API/DTO/DB change; not ePHI.** AC-1..AC-3 pinned by `theme-fonts.test.ts`; `pnpm build`
  bundles the woff2 locally and `dist/index.html` has no Google Fonts references. (Applying JetBrains Mono across all
  KPI/metric figures — currently `tabular-nums` only — is a deferred taste decision.)

### 🟡 Remaining (open in Jira)

- **[MBI-22](https://connecthealth.atlassian.net/browse/MBI-22) — Operational reporting from SharePoint/OneDrive spreadsheets.**
  Reports must read the practice's departmental spreadsheets via Microsoft Graph Excel (not CureMD/
  PNC). **Build-prep (2026-06-25) split this into "connect the workbook now, map the metrics later":**
  - **[MBI-29](https://connecthealth.atlassian.net/browse/MBI-29) Paste & validate a workbook link** +
    **[MBI-30](https://connecthealth.atlassian.net/browse/MBI-30) persist the link & read `/api/reports`
    off it** — ✅ **delivered via [MAD-26](https://connecthealth.atlassian.net/browse/MAD-26)** (PR
    [#34](https://github.com/pravinuttarwar/madison/pull/34); Testing/owner QA): connect → validate →
    persist (non-PHI drive path/id only) → `/api/reports` reads from it.
  - **Parked — realign MBI-22 when the practice shares all departmental sheet formats:** the named-range
    → 12-metric mapping + file architecture (**single canonical workbook** chosen). **Blocked on:** the
    file layout (folder + named-range map); customer is open to our proposed template. (The *connection*
    is built; what remains is mapping the ranges to the customer's real sheets.)

---

## Known cleanup / tech debt

Tracked in [CLAUDE.md](../CLAUDE.md) "Known gaps". Current candidates:

- **Dead scaffolding (frontend) — ✅ RESOLVED ([MBI-40](https://connecthealth.atlassian.net/browse/MBI-40)):**
  Redux + redux-persist + orphaned `pages/Overview.tsx` removed. `crypto-js` is **kept** — it is *not*
  dead; it backs the live `secureStorage` (weak hardcoded-key "encryption" on non-PHI local prefs — a
  plain-storage swap would be its own deliberate ticket). (`pages/Connections.tsx` is being **revived**
  by [MBI-29](https://connecthealth.atlassian.net/browse/MBI-29) — do not delete it.)
- **Microsoft Teams source — ✅ RESOLVED ([MBI-32](https://connecthealth.atlassian.net/browse/MBI-32)):**
  removed end-to-end (was hardcoded `mock`, never wired, out of scope per SOW).
- **Day-over-day deltas** need a minimal daily financial snapshot persisted — reconcile with the
  owner's no-storage preference before building (see [ARCHITECTURE.md §6](ARCHITECTURE.md)).

> Note: the previously-listed "unreachable `isMonday` branch" is **resolved** — MBI-20 restored the
> Daily/Monday toggle, so that branch is now reachable.

---

## How to check status yourself

- **Jira:** the epic [MBI-18](https://connecthealth.atlassian.net/browse/MBI-18) and its child
  stories carry the live status, acceptance criteria, and per-ticket build notes.
- **Git:** `git log --oneline | grep MBI-` walks the shipped feature work (each PR references its key).
- **Tests:** `npm test` green means the pinned behavior contract holds — see [TESTING.md](TESTING.md).
- **Per-ticket notes:** working notes for in-flight tickets live under `docs/sprints/<sprint>/`.
