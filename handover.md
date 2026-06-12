# Engineer Handover — Madison Command Center

**Customer:** Madison Medical and Sports Rehabilitation Center (NJ, USA)
**Project:** Madison Command Center — a single-screen operational dashboard for the practice owner.
**Status at handover:** Frontend-only clickable prototype on mock data. No backend, no auth, no live integrations.

---

## 1. Context

**Who.** Madison Medical is a small multi-specialty integrative practice (chiropractic, medical, physical rehab, recovery, podiatry, acupuncture, regenerative/peptide, allergy). Headcount is small but they run a wide surface: ~40 office systems, 15 subspecialties, and a mixed billing model (insurance + cash/self-pay + point-of-sale). The buyer and sole intended end-user of this product is the **physician-owner/CEO** (referred to in the mock data as "Dr. Romano").

**The problem (from discovery).** The owner's business data is fragmented across disconnected systems — Outlook mail/calendar, Microsoft Teams, Microsoft To Do, QuickBooks Online, and provider-maintained Excel spreadsheets. There is no single view. Concrete pains stated on calls:
- Context-switching across email/calendar/financials/spreadsheets; doing catch-up late at night just to know where things stand.
- QuickBooks Online is visually overwhelming for a quick read ("massive amounts of nonsense").
- Weekly provider numbers arrive as a spreadsheet handed over on Monday; the owner waits for it rather than self-serving.
- Important emails get lost in volume.
- Their current BI/reporting tool (Vizenda, a SQL front-end over the EHR) produces duplicate rows when joining appointment + provider-note datasets and can't be trusted; staff re-clean exports in Excel by hand. (This is the EHR-reporting pain — **out of scope** for this build, see below.)

**Origin of the design.** The owner built his own clickable HTML mockup ("Command Center") with Claude. This prototype deliberately mirrors that mockup's structure and content, refined and with de-scoped pieces removed. The customer also drafted a backend developer spec (`docs/context/doc-2-other.md`) describing the integration intent — useful as a reference but written before scope was cut, so it still lists CureMD/Plaid/Anthropic which are no longer in scope.

**Success metric the prototype is meant to prove.** That we faithfully captured the owner's own design across the six committed tabs and that the team understands the real integration nuance (read-only, secure, no-PHI-at-rest) better than the AI mockup did. It is a click-through to confirm scope before the build, not a working system.

**Hard design constraint.** The owner is color-blind. Status and severity must never be conveyed by color alone — always icon + shape + text label. This is honored in the prototype and must carry into production.

---

## 2. What's done vs not

### Built & working (real code, clickable in the browser)
- **Six routed pages** (`frontend/src/App.tsx`, HashRouter): Dashboard `/`, Calendar `/calendar`, Tasks `/tasks`, Email Queue `/email`, Reports `/reports`, Financials `/financials`. All render and navigate.
- **App shell** (`components/AppShell.tsx`): sticky header with the customer's real Madison logo on a white lockup tile, a static "Today" pill, a working **Display & Accessibility** menu, and a tabbed nav with badge counts derived from the mock data.
- **Display & Accessibility menu** — genuinely functional:
  - Theme Light/Dark toggles the `.dark` class on `<html>` live (default Dark).
  - Colors Standard/Color-Vision-Friendly live-swaps a set of CSS custom properties for status + chart hues (default Color-Vision-Friendly). These are in-memory React state only — **not persisted**; a refresh resets to defaults.
- **Dashboard** (`pages/Dashboard.tsx`): greeting, four KPI tiles (computed from mock data — unread-important email count, tasks due/overdue, awaiting-response count, yesterday deposit), today's schedule, a calm "Priority today" list (no urgency styling, per customer ask), email triage preview, awaiting-response preview.
- **Email Queue** (`pages/EmailQueue.tsx`): master/detail — click an email to read its body in the side panel; awaiting-response follow-up list. Selection state is real React state.
- **Reports** (`pages/Reports.tsx`): top-line encounter KPIs, encounters-by-specialty bars, full 12-metric week-over-week table.
- **Financials** (`pages/Financials.tsx`): deposit and variable-spend KPIs, deposits breakdown, variable-spend-by-category bars with WTD/MTD.
- **Tasks** (`pages/Tasks.tsx`): tasks grouped by owner with a working status filter (All / Overdue / Due today / Upcoming); color-blind-safe status pills (icon + label).
- **Calendar** (`pages/Calendar.tsx`): week-ahead grid + today timeline.
- **Accessibility primitives** (`components/primitives.tsx`): `Trend` (arrow + sign + value, color secondary), `StatusPill` (distinct icon per status), `OwnerChip` — all designed so meaning survives without color.
- **Data-access seam** (`lib/api.ts`): every page reads through async getters (`getDashboard`, `getEmails`, `getCalendar`, etc.) consumed via a `useApi` hook with loading/error states. Today the getters resolve mock data; the fetch-from-backend branch is already written and gated on env vars (`VITE_API_URL`, `VITE_LIVE_SOURCES`, `VITE_LIVE_MODE`). This is the single intended integration point — see §4.

### Faked / mocked (looks real, isn't)
- **All data is hardcoded sample data** in `lib/data.ts`. Emails, calendar, tasks, weekly clinical metrics, financial figures, priorities, and the awaiting-response list are static literals. Numbers are realistic but invented.
- **Awaiting-response "engine"** is a static list, not a computed result. No mail is scanned; the "≥48h, no reply" copy is descriptive only.
- **KPIs/badges** are computed from the mock arrays, so they're internally consistent but not live.
- **"Source" chips** (Outlook, QuickBooks, Weekly spreadsheet, Follow-up engine) are labels only — nothing connects to those systems.
- **Theme/accessibility preferences** are not persisted across reloads.
- **Financials view-mode is partially dead.** A `ViewMode` context (`context/view-mode.tsx`) still exists and defaults to `weekday`; `Financials.tsx` branches on `isMonday` to show a weekly vs daily layout. But the Monday/Weekday **toggle UI was removed** and nothing ever calls `setMode`, so the `isMonday` branch is currently **unreachable**. Dead branch — either wire a control back or delete it.
- **No empty/error realism.** Error and empty states exist as components (`AsyncState.tsx`) but since mock data always resolves, they're effectively never shown.

### Not built
- **No backend at all.** No server, no API, no `node-express-psql-ts` service. The fetch path in `lib/api.ts` points at a `VITE_API_URL` that doesn't exist yet.
- **No real integrations.** Microsoft Graph (Outlook mail/calendar, To Do, Teams), QuickBooks Online, and spreadsheet ingestion are all unimplemented.
- **No auth / identity.** No login, no session, no Microsoft SSO, no bearer token. The dashboard is wide open.
- **No persistence / database.** Nothing is stored.
- **Dead scaffolding present.** `main.tsx` wires Redux + redux-persist with an AES-encrypted `localStorage` adapter (`store/index.ts`, `utils/secureStorage.ts`, `utils/encryption.ts`), but the only reducer is a dummy `sampleReducer` (a counter). None of the app reads or writes this store. The `crypto-js` "encryption service" uses a hardcoded default key and is **not** a real security control — treat it as boilerplate to remove or replace, not as something to build on.
- **Orphaned pages.** `pages/Overview.tsx` and `pages/Connections.tsx` exist in the source but are **not routed** in `App.tsx`. Connections was explicitly dropped from scope. Both are dead code — delete unless intentionally revived.
- **No tests.** No unit/integration/e2e tests in the repo.
- **No no-reply threshold logic, no fixed-cost account logic, no spreadsheet cell mapping** — all of these are described in copy but not implemented.

---

## 3. Customer requirements → screen map

| Requirement (from discovery) | Screen / mechanism | Status |
|---|---|---|
| One consolidated at-a-glance view to end the late-night catch-up | Dashboard (`/`) | Done (UI on mock data) |
| Important-email triage; "notify me of important emails" | Email Queue + Dashboard email panel | Partial — UI done, no live mail, importance is a hardcoded flag |
| Awaiting-response / "sent, no reply" follow-up | Email Queue + Dashboard "Awaiting response" | Partial — static list; detection engine not built |
| Outlook calendar: today + week ahead | Calendar (`/calendar`) | Done (UI on mock data) |
| Tasks grouped by owner with due/overdue | Tasks (`/tasks`) | Done (UI on mock data) |
| Clean QuickBooks financial snapshot (deposits, variable spend WTD/MTD, net contribution) | Financials (`/financials`) | Partial — UI done, no QBO connection; "fixed-cost exclusion" is copy only |
| Weekly provider spreadsheet as a live snapshot (new patients, encounters by specialty, WoW deltas) | Reports (`/reports`) | Partial — UI done with the customer's 12 metrics; no spreadsheet read |
| Color-blind-accessible UI (never color alone) | Display menu + accessibility primitives | Done |
| Mirror the owner's HTML; drop Projects card, AI panel, CureMD, Plaid, Connections, Monday toggle, urgent flags | App shell + page composition | Done |
| Monday (last-week recap) view | — | Missing — removed at customer request; deferred. Note `Financials` still has a dead `isMonday` branch |
| EHR / clinical reporting (CureMD), front-desk reconciliation, AI assistant | — | Out of scope (de-scoped in discovery; Phase 2 EHR is a separate future conversation) |

---

## 4. Recommended architecture

**Frontend (keep as-is).** React 19 + TypeScript + Vite + Tailwind v4. Routing is `react-router-dom` v7 with `HashRouter`. Keep the existing `lib/api.ts` getter seam — it is the intended integration boundary and the page components do not need to change to go live.

Recommended cleanup before building on it: remove the dead Redux/redux-persist/crypto-js scaffolding and the orphaned `Overview`/`Connections` pages, and either restore a view-mode control or delete the `ViewMode` context and the `isMonday` branch in `Financials`.

**Backend (build new).** Use Mindbowser's `node-express-psql-ts` stack as a **read-only proxy / BFF**. The browser must never hold third-party credentials. The customer's own draft spec (`docs/context/doc-2-other.md`) already lays out this pattern; align to it but drop the de-scoped sources. The frontend expects JSON matching the DTOs in `lib/api.ts` (`DashboardData`, `CalendarData`, `FinancialsData`, `ReportsData`, plus `Email[]`, `Task[]`, `AwaitingResponse[]`). Match those shapes and no page edits are required.

Suggested endpoints (mirroring the getter seam):
- `GET /api/dashboard?view=…` — composed BFF payload (fans out to the sources below in parallel).
- `GET /api/email`, `GET /api/email/:id`, `GET /api/email/awaiting`
- `GET /api/calendar`
- `GET /api/tasks`
- `GET /api/financials`
- `GET /api/reports`

**Data model implied by the mock data** (`lib/data.ts`). Note the owner's stated preference for read-only, real-time snapshots with minimal-to-no storage and no PHI. Most of this should flow through, not persist. The only thing that *needs* persistence is a minimal daily snapshot of financial figures to compute day-over-day deltas.

- **WeeklyMetric** — `{ key, label, last, prior }`. 12 clinical metrics (new patients, medical seen, N1, chiro seen, admin codes, allergy tests, allergy kits, recovery new/all, podiatry, acupuncture, procedures). Source: provider weekly Excel. Relationship: also rolled up into `EncounterRow` (encounters by specialty) and a `totalEncounters`.
- **WeeklyFinancial / DailyFinancial** — deposits (by day, with breakdown: card AM/PM, insurance ACH), variable spend (yesterday/WTD/MTD, top categories), net contribution. Source: QuickBooks Online. "Variable" = all spend minus a configured list of fixed-cost accounts.
- **Email** — `{ id, unread, important, from, subject, preview, time, body }`. Source: Microsoft Graph mail.
- **AwaitingResponse** — `{ id, days, to, subject, detail }`. **Derived**, not a stored field — computed by the follow-up engine (see risks).
- **ScheduleItem / CalendarDay** — today's events and week-ahead. Source: Microsoft Graph calendar.
- **Task** — `{ id, title, owner, due, status }` grouped by **Owner** enum (DCR / HETAL / SOCIAL / FRONT / PROVIDER). Source: Microsoft To Do (or Planner). Owner roster mapping is an open question.
- **Priority** — `{ id, title, detail, owner }` (an `urgent` field exists in the type but is intentionally unused in the UI). Currently hand-curated; in production this is a derived/editorial view, not a system field.

**Integration points surfaced in discovery:**
- **Microsoft Graph** (single Azure app registration) — Outlook mail + calendar, To Do, Teams. Delegated, read-only scopes. This is the single biggest unlock (the customer's own spec estimates it covers the majority of dashboard value).
- **QuickBooks Online** — OAuth, read-only; pull deposits and purchases, exclude configured fixed-cost accounts.
- **Spreadsheet ingestion** — read the provider Excel file(s) via Microsoft Graph Excel/Workbook endpoints (same Graph auth), mapping named ranges/cells to the 12 metrics.
- **Out of scope:** CureMD (EHR), Plaid/PNC direct bank feed, Anthropic/AI assistant, front-desk reconciliation. Do not build these; they appear in the customer's older draft spec but were explicitly cut.

**Auth & roles.** Single primary user (the owner) initially, with the possibility of extending read access to a few senior staff later. Recommend Microsoft Entra ID SSO with MFA for the dashboard front-end, plus a server-side bearer/session for the proxy. No public access. Plan for a small, explicitly-managed allowlist of users rather than open self-registration.

---

## 5. Feasibility & risks

- **HIPAA / PHI posture.** This is healthcare. Even though the in-scope sources (mail, calendar, tasks, QBO, operational spreadsheets) are intended to avoid clinical PHI, the practice's data and the broader context are HIPAA-sensitive. Treat the backend as in-scope for the HIPAA Security Rule: TLS-only, server-side secrets (secrets manager, not plain `.env` in prod), audit logging with long retention, full-disk encryption, no PHI written to disk, scrubbed logs. Confirm which connected vendors need a Business Associate Agreement and whether the hosting target requires one. Validate with the customer that the spreadsheet/QBO data genuinely contains no PHI before relying on that assumption.
- **Microsoft 365 admin dependency.** Live mail/calendar/tasks require the tenant admin to register the Azure app and grant admin consent for read-only delegated scopes. The admin has not been identified — this is a hard, early blocker for ~60% of the value.
- **QuickBooks specifics.** Need the realm/company and the exact account IDs to classify as "fixed" vs "variable," or the variable-spend number is meaningless. The practice is also mid-switch on banking; the direct bank feed was dropped, so financials come from QBO — confirm that holds after the bank change.
- **Spreadsheet shape is unknown.** The owner committed to share a sample but hadn't at last contact. We need exact file location(s) (OneDrive/SharePoint), whether it's one file or several, and the cell/named-range map for each of the 12 metrics. The prototype assumes one provider file; verify.
- **Awaiting-response engine is non-trivial.** Logic (per the customer's draft spec): scan sent items over a window, group by conversation, flag conversations whose latest message is from the owner and older than a threshold with no reply, sort by days waiting. Cost drivers: Graph query volume/throttling, conversation threading correctness, and agreeing the threshold (48h? 5 business days?) and which mailbox(es) to watch.
- **Day-over-day deltas require minimal storage.** The owner prefers "no storage." Reconcile that with the fact that deltas need at least a small daily snapshot persisted. Agree an acceptable minimal retention window.
- **Token lifecycle.** Graph/QBO refresh tokens expire and need silent refresh + re-auth handling; the owner runs the OAuth consent flows once. Build re-auth notifications.
- **Color-vision palette.** The friendly palette is implemented but the specific color-vision type wasn't confirmed; tune and contrast-test with the owner.
- **Estimate-blowers to flag:** M365 admin-consent delays, spreadsheet format surprises (merged cells, per-provider variance), QBO fixed-cost taxonomy churn, BAA negotiation lead time, and the throttling/threading complexity of the follow-up engine.

---

## 6. Build plan (phased, rough sequence)

1. **Backend foundation.** Stand up the `node-express-psql-ts` proxy. Define the JSON contract to match `lib/api.ts` DTOs exactly. Health endpoint. Secrets management, TLS, audit logging skeleton from day one (HIPAA-aware from the start, not bolted on).
2. **Microsoft Graph first (biggest unlock).** Tenant admin registers the Azure app and grants read-only delegated consent. Wire calendar, mail, To Do (and Teams if still wanted). Flip `outlook` / `microsoftToDo` sources live in the frontend via env — no page changes.
3. **Financial layer.** QBO OAuth (owner runs consent once). Implement deposits + variable spend with the confirmed fixed-cost account list. Add the minimal daily snapshot for day-over-day deltas.
4. **Spreadsheet ingestion.** Once the owner shares the file(s) and the cell/range map, read via Graph Excel endpoints and normalize into the 12 metrics.
5. **Follow-up engine.** Implement awaiting-response detection with the agreed threshold and mailbox scope; group and sort.
6. **Hardening.** Auth/SSO + MFA, input validation at the proxy boundary, real error/empty/loading states end-to-end, token re-auth flows, audit-log completeness, and tests (unit for normalization + spend exclusion + follow-up logic; integration against Graph/QBO sandboxes). Remove dead scaffolding (Redux/crypto-js, orphaned pages, dead view-mode branch).

---

## 7. Run it locally

```
cd frontend
pnpm install
pnpm dev      # Vite dev server
pnpm build    # tsc -b && vite build (production build)
```

No environment variables are required to run the prototype — with no `VITE_API_URL` set, every source resolves to mock data and the app is fully clickable standalone. (`npm`/`yarn` also work; scripts are in `frontend/package.json`.)

---

## 8. Version history

Every build, edit, and restore of this prototype is a git commit. `git log --oneline` walks the full timeline. Restores are append-only commits (never history rewrites), so the log is a complete and honest record of how the prototype evolved.

---

## 9. Open questions for the customer

1. **M365 admin:** Who administers the Microsoft 365 tenant and can register the Azure app + grant read-only admin consent? (Early blocker.)
2. **Spreadsheet:** Can the owner share the actual provider weekly file(s)? Where do they live (OneDrive/SharePoint), one file or several, and what are the cell locations / named ranges for each of the 12 metrics?
3. **QuickBooks:** Which company/realm, and which account IDs are "fixed" vs "variable"? Does QBO remain the financial source after the pending bank switch?
4. **Follow-up engine:** What is the no-reply threshold (e.g. 48h vs 5 business days), and which mailbox(es) should be monitored?
5. **Tasks:** Should the owner roster come from Microsoft To Do / Outlook assignments, or is there a separate roster to mirror? Confirm the owner enum mapping.
6. **Deltas vs no-storage:** What minimal retention window is acceptable for the daily financial snapshot needed to compute day-over-day change?
7. **Accessibility:** Which color-vision type, so we tune palette + contrast precisely? Confirm Dark + Color-Vision-Friendly as go-live defaults, and whether preferences should persist per user.
8. **Compliance/hosting:** Hosting target, and which connected vendors require a BAA. Confirm the in-scope sources contain no PHI.
9. **Monday recap:** Is the last-week recap view wanted later as its own surface (currently removed; a dead branch remains in Financials)?
10. **Users:** Beyond the owner, which senior staff (if any) get read access, and to which tabs?
