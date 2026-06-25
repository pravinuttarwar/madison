# Madison Medical and Sports Rehabilitation Center — Madison Command Center

## Intent
Madison Command Center is a working, clickable version of the dashboard you designed — one place to open each morning and see what matters: your important emails and follow-ups, this week's calendar, tasks by owner, a clean financial snapshot, and your providers' weekly report. It keeps your Monday-vs-weekday view, presents your QuickBooks numbers without the visual clutter, and shows the weekly spreadsheet as a live snapshot. This first version runs on realistic sample data so you can click through the real experience; the live connections to Outlook, QuickBooks and your spreadsheets are the next step we'd wire up together.

## Customer & problem context (engineering-relevant only)
> Commercial/deal intel (pricing, buying signals, negotiation notes) is intentionally kept OUT of this
> repo — it lives in the CRM/Jira, not in dev-facing docs. Only the product problem context is below.
- Customer: Madison Medical and Sports Rehabilitation Center, Healthcare (multi-specialty practice, NJ).
- Problems the product addresses:
  - Business operations fragmented across disconnected systems (email, calendar, banking, spreadsheets); no single view of practice data.
  - Need to consolidate Outlook (email + calendar), financials, and spreadsheet reporting into one centralized command center for practice ops.
  - Current EHR (CureMD) is antiquated and cannot accommodate 15 subspecialties with complex cash/self-pay/insurance billing workflows. (EHR replacement is a separate future phase — out of scope here.)
  - Vizenda reporting tool creates data duplicates and cannot join appointment + provider-note datasets; reports are exported to Excel for manual cleanup.
  - Staff manually bridge data gaps between systems (copy-paste, print/re-enter); the goal is to automate what humans do today.

## Kind & tech
- Kind: prototype
- Frontend boilerplate: _(not scaffolded)_
- Shadcn layer: Path B (slate)
- React Router: no
- Backend: deferred (Phase 3)

## Approved plan (current spec, last updated 2026-06-05 04:31:04)
- Sections / pages:
  - Dashboard
  - Reports
  - Financials
  - Email Queue
  - Calendar
  - Tasks
- Hero message: _(not set)_
- Key flows:
  - Open to the Dashboard and toggle between Monday view (last week recap) and Weekday view (today).
  - Drill from the Dashboard into Reports, Financials, Email Queue, Calendar or Tasks.
  - Scan important emails and the awaiting-response follow-up list in the Email Queue.
  - Review the weekly report and its week-over-week deltas in Reports.
  - Check the clean financial snapshot in Financials without opening QuickBooks.
- Asked questions (SDR answered):
  - We have the live sources as Outlook (calendar + email), QuickBooks (financials), Microsoft To Do (tasks) and your provider weekly spreadsheet — confirm that's the complete set for Phase 1?
  - For the weekly Reports rollup, can you share the actual spreadsheet so we map to your real columns (new patients, encounters by specialty) rather than our assumed layout?
  - Which financial figures do you want on the Financials snapshot beyond deposits, variable spend WTD/MTD and net contribution — anything else you check weekly?
  - For the awaiting-response follow-up engine, what's your threshold for 'no reply' (e.g. flag after 2 business days)?

## Engineering handoff (internal — how we’d build it)
- **Consolidated command-center front-end (all six tabs + Monday/Weekday toggle)** [clear]: Build the clickable React front-end on mock data mirroring the customer's HTML; one view-mode toggle drives the dashboard composition. — ❓ Final list of tiles/metrics to show per tab and per view-mode.
- **Email, calendar and tasks from the Microsoft stack** [needs-validation]: Server-side proxy holds credentials and calls the Microsoft platform with read-only delegated permissions; front-end never sees keys. — ❓ Who administers the Microsoft 365 tenant and can grant admin consent for read-only scopes?
- **Awaiting-response follow-up engine** [needs-validation]: Scan sent mail, find conversations whose latest message is from the owner and older than a threshold with no reply, group by recipient and days waiting. — ❓ Confirm the no-reply threshold and which mailbox(es) to monitor.
- **Financial snapshot from the accounting system** [needs-validation]: Read-only authorized pull of deposits and purchases, excluding a configured list of fixed-cost accounts to compute variable spend. — ❓ Which account IDs are 'fixed', and what is the financial data source after the planned bank switch?
- **Weekly report ingestion from spreadsheets** [needs-validation]: Read the Excel file(s) from the practice's Microsoft file storage using the same read-only Microsoft auth, mapping cells/named ranges to the report metrics. — ❓ Exact file paths and the cell/named-range map; is it one file or several?
- **Day-over-day deltas on financial figures** [clear]: Persist a minimal daily snapshot of the key figures to compute change-since-yesterday, keeping no PHI. — ❓ What minimal retention window is acceptable given the owner's no-storage preference?
- **Color-blind-accessible UI** [clear]: Convey status/severity with text labels, icons and shapes plus an accessible palette; never color alone. — ❓ Confirm the specific color-vision type so we tune the palette and contrast accordingly.
- **Production security posture** [needs-validation]: All live integrations behind a HIPAA-aware backend: encrypted secrets, read-only access, audit logging, TLS-only, no credentials in the browser. — ❓ Hosting target and which connected systems need a business associate agreement in place.

## What's done
- Scaffolded + generated initial code

## Current state
- Build status: building · last built 2026-06-05 04:31:04
- Preview URL: /api/prototype/preview/madison-medical-and-sports-rehab-0b5c21/
- Customer URL: https://share.mindbowser.com/pub/madison-command-center/

## Open / pending
- _(none yet)_

## How to resume
Read this file, then **[README.md](README.md)** — it's the developer hub and links the full doc set
(customer intent, status, roadmap, modules, architecture, testing). The approved scope/blueprint is
`frontend/docs/spec.json`; recent thinking is in `frontend/docs/iterations/*.md`. Then ask what to do.

---

# Engineering — harness onboarding (added 2026-06-25)

> The sections above are the SDR/sales prototype record and are partly stale (e.g. "Backend:
> deferred" — a read-only backend now exists). The notes below reflect the **current code at HEAD**.
> Authoritative engineer handover: `handover.md`.

## Documentation set (read these first)
**[README.md](README.md)** is the developer hub and links everything. The `docs/` set:
`CUSTOMER.md` (who/why + what's in/out of scope), `STATUS.md` (done vs remaining, tied to Jira epic
MBI-18), `ROADMAP.md` (phases), `MODULES.md` (code map + seams), `ARCHITECTURE.md` (integration
contract + feasibility), `TESTING.md` (the gate + how work is built), `FIRST-WEEK-PLAN.md`
(go-live sequence). **Update `STATUS.md` when a story ships.**

## Stack & layout (monorepo, single-port deploy)
- **frontend/** — React 19 + TypeScript + Vite 6 + Tailwind v4, `react-router-dom` v7 (HashRouter), **pnpm**.
- **backend/** — Node ≥20 ESM, Express 4. A **read-only backend-for-frontend (BFF)**: holds OAuth tokens
  in-memory per visitor, calls Microsoft Graph + QuickBooks read-only, transforms upstream payloads to the
  frontend DTOs. **No database; no PHI at rest.** In production it also serves the built SPA (one port).

## Run
- `npm run dev:frontend` — Vite dev server; point `VITE_API_URL` at the backend (live-only).
- `npm run dev:backend` — Express BFF on :8787. Live-only: each route serves real data once that
  source is connected via OAuth, else 401 (Microsoft) / 503 (QuickBooks).
- `npm run serve` — production-style: build frontend, then backend serves SPA + `/api` on one port.

## Test gate (one command) — **established during onboarding**
- `npm test` (repo root) = `test:backend` + `test:frontend`. Full detail in **[docs/TESTING.md](docs/TESTING.md)**.
  - **backend** — `node --test` suites: `characterization-fixtures.test.js` (spawns the real server with
    `FIXTURES_DIR` so `graph.js`/`qbo.js` resolve from synthetic upstream payloads, pins the `/api/*`
    contract through the **live** route + transforms path — email importance/unread/**category**, Daily vs
    Monday dashboard, 12 report metrics, source-status, JSON-404), `demo-retired.test.js` (proves
    `DEMO_MODE` is inert — no runtime sample path), `email-category.test.js` (category
    classifier + a HIPAA audit/safe-logging check), `transforms.test.js` (pure mapper + timezone
    units). No network, no creds.
  - **frontend** — `tsc -b --noEmit` typecheck (pins the type-level DTO contract) **plus
    Vitest + Testing Library render checks** (`src/**/*.test.{ts,tsx}`, jsdom). `test:frontend` runs
    both. Render tests are pinned to standalone mock mode (see `vitest.config.ts` `test.env`) so
    they don't depend on a dev's local `.env` wiring live sources.
- The repo shipped with **no tests**; this suite is the AFK-build safety net. **Extend it before/with
  any behavior change.**

## Compliance & logging posture (profile: `hipaa`)
- `.health-harness/compliance.json` = `hipaa`. In-scope sources (mail, calendar, tasks, QBO, ops spreadsheets)
  are intended to avoid clinical PHI, but the backend is treated as in-scope for the HIPAA Security Rule.
- **Audit trail — present.** Central middleware (`backend/src/server.js:40-48`) logs `method path → status (ms)`
  for every request — the "which source was read, when" trail. **Never logs request/response bodies.**
- **PHI-safe logging — present.** Only the audit line + a startup line use `console.*`; no PHI values are
  logged. Keep it that way: log ids/paths, never patient/content values.
- **No PHI at rest** is an architectural assumption (in-memory sessions, 90s cache, no DB) — preserve it.

## Seams (where to make changes safely)
- **Frontend data-access seam:** `frontend/src/lib/api.ts` — every page reads through async getters
  (`getDashboard`, `getEmails`, …) which fetch the backend (`VITE_API_URL`). Live-only since MBI-35.
- **Backend contract seam:** `backend/src/transforms.js` maps Graph/QBO → the exact frontend DTOs;
  `routes.js` wires sources → live producers. In tests, `graph.js`/`qbo.js` resolve from synthetic
  fixtures via `FIXTURES_DIR` (see `backend/src/fixtures.js`).

## Conventions (theirs — follow, don't reformat)
- **Commits:** Conventional Commits (`type(scope): subject`, e.g. `ui(theme):`, `chore:`) — keep it.
- **Branches:** feature branches off `main`, PRs target `main` (an `IN REVIEW` Jira status exists).
- ESLint + Prettier + lint-staged/husky on the frontend. Match existing code style; no mass reformat.

## Known gaps / cleanup (candidate tasks — pin with characterization tests before changing)
- **Day-over-day deltas** would need a minimal daily financial snapshot persisted — reconcile with the
  owner's no-storage preference before building.
- **`crypto-js` / `secureStorage`** — weak hardcoded-key "encryption" on non-PHI local prefs; *not* a real
  security control. It is **live** (backs session + theme prefs), so it is NOT dead code — swapping it for
  plain storage would be its own deliberate ticket.
- **Go live-only (Phase-2 epic MBI-33):** MBI-34 (fixtures), MBI-35 (frontend live-only), and MBI-36
  (backend `DEMO_MODE`/`demo.js` retired) are **done** — the runtime sample path is gone end-to-end and the
  gate runs the live path offline against fixtures. **Remaining:** MBI-37 (harden empty/error + auth states),
  MBI-38 (Connections badges consume live `/api/sources/status` + `SourceMode` cleanup), MBI-39 (demo's fate).
- (Resolved) **Microsoft Teams** source removed — MBI-32 (was hardcoded `mock`, out of scope).
- (Resolved) **Dead scaffolding** (Redux + redux-persist + orphaned `pages/Overview.tsx`) removed — MBI-40.
  (`pages/Connections.tsx` is being **deliberately revived** by MBI-29 as the workbook-connection UI — do not delete it.)
- (Resolved) The previously-unreachable `isMonday` branch in `Financials.tsx` is now live — MBI-20
  restored the Daily/Monday toggle.

See **[docs/STATUS.md](docs/STATUS.md)** for the full done-vs-remaining picture and open Jira items.
