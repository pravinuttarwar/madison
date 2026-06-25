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
Read this file. Read `docs/spec.json` for the current spec. Read the latest `docs/iterations/*.md` for recent thinking. Then ask the SDR what they want to do.

---

# Engineering — harness onboarding (added 2026-06-25)

> The sections above are the SDR/sales prototype record and are partly stale (e.g. "Backend:
> deferred" — a read-only backend now exists). The notes below reflect the **current code at HEAD**.
> Authoritative engineer handover: `handover.md`.

## Stack & layout (monorepo, single-port deploy)
- **frontend/** — React 19 + TypeScript + Vite 6 + Tailwind v4, `react-router-dom` v7 (HashRouter), **pnpm**.
- **backend/** — Node ≥20 ESM, Express 4. A **read-only backend-for-frontend (BFF)**: holds OAuth tokens
  in-memory per visitor, calls Microsoft Graph + QuickBooks read-only, transforms upstream payloads to the
  frontend DTOs. **No database; no PHI at rest.** In production it also serves the built SPA (one port).

## Run
- `npm run dev:frontend` — Vite dev server (mock data; no backend needed).
- `npm run dev:backend` — Express BFF on :8787. `DEMO_MODE=1` serves deterministic sample data (no creds).
- `npm run serve` — production-style: build frontend, then backend serves SPA + `/api` on one port.

## Test gate (one command) — **established during onboarding**
- `npm test` (repo root) = `test:backend` + `test:frontend`.
  - **backend** — `node --test` characterization suite (`backend/test/characterization.test.js`): spawns the
    real server in `DEMO_MODE` on a free port and pins the `/api/*` contract (email importance/unread flags,
    Daily vs Monday dashboard, 12 report metrics, source-status modes, JSON-404). No network, no creds.
  - **frontend** — `tsc -b --noEmit` typecheck (pins the type-level DTO contract).
- This was added by onboarding (the repo shipped with **no tests**). **Extend this suite before/with any
  behavior change** — it is the AFK-build safety net.

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
  (`getDashboard`, `getEmails`, …). The fetch-from-backend branch is gated on `VITE_API_URL` /
  `VITE_LIVE_*`. Pages don't change to go live.
- **Backend contract seam:** `backend/src/transforms.js` maps Graph/QBO → the exact frontend DTOs;
  `backend/src/demo.js` is the sample-data mirror. `routes.js` wires sources → producers.

## Conventions (theirs — follow, don't reformat)
- **Commits:** Conventional Commits (`type(scope): subject`, e.g. `ui(theme):`, `chore:`) — keep it.
- **Branches:** feature branches off `main`, PRs target `main` (an `IN REVIEW` Jira status exists).
- ESLint + Prettier + lint-staged/husky on the frontend. Match existing code style; no mass reformat.

## Known gaps / cleanup (candidate first tasks — pin with characterization tests before changing)
- **Microsoft Teams** source is hardcoded `mock` (`server.js:223`) — never wired (out of scope per SOW).
- **Dead scaffolding (frontend):** Redux + redux-persist + `crypto-js` (hardcoded key — *not* a real
  security control), orphaned `pages/Overview.tsx` & `pages/Connections.tsx`, and an unreachable `isMonday`
  branch in `Financials.tsx` (Monday/Weekday toggle UI was removed). Remove or revive deliberately.
- **Day-over-day deltas** would need a minimal daily financial snapshot persisted — reconcile with the
  owner's no-storage preference before building.
