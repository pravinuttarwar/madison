# Madison Command Center

A single-screen operational dashboard for the owner of **Madison Medical and Sports
Rehabilitation Center** (multi-specialty practice, NJ). One place to open each morning and see
what matters: important emails, this week's calendar, tasks by owner, a clean financial
snapshot, and the providers' weekly report — consolidating Outlook, QuickBooks, Microsoft To Do
and provider spreadsheets that today live in disconnected systems.

The app runs fully on realistic **sample data** so the whole experience is clickable with no
credentials. A **read-only backend-for-frontend (BFF)** is in place to wire the live sources
(Microsoft Graph, QuickBooks) when consent is granted — no page changes required to go live.

> **Healthcare / HIPAA repo.** Read-only by design, **no PHI at rest**, audit-logged, synthetic
> data only in code/tests/logs. See [Compliance posture](#compliance-posture) before contributing.

---

## Quickstart

Monorepo: `frontend/` (React + Vite, **pnpm**) and `backend/` (Node + Express BFF, **npm**).
Node ≥ 20 required.

```bash
npm run install:all     # install both workspaces

# Day-to-day development
npm run dev:frontend    # Vite dev server — mock data, no backend needed (start here)
npm run dev:backend     # Express BFF on :8787 (set DEMO_MODE=1 for deterministic sample data)

# Production-style single-port run (backend builds + serves the SPA + /api)
npm run serve

# The gate — run before every commit/PR (see docs/TESTING.md)
npm test                # backend characterization + frontend typecheck + render tests
```

The frontend works standalone with **no env vars** — every source resolves to bundled sample
data. Going live on a source = implement its backend route, point `VITE_API_URL` at the backend,
and flip that source in `SOURCE_MODES`. Details in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Repo layout

```
frontend/         React 19 + TypeScript + Vite 6 + Tailwind v4, react-router-dom v7 (HashRouter)
  src/pages/        the six tabs: Dashboard, Reports, Financials, EmailQueue, Calendar, Tasks
  src/lib/          api.ts (data-access seam), data.ts (DTOs + mock data), format.ts
  src/components/   AppShell, primitives (accessibility-safe), AsyncState, ui/ (shadcn)
  docs/spec.json    approved scope + the customer's design blueprint
backend/          Node ≥20 ESM, Express 4 — read-only BFF, in-memory sessions, NO database
  src/routes.js     source → producer wiring        src/transforms.js  Graph/QBO → frontend DTOs
  src/demo.js       sample-data mirror (DEMO_MODE)   src/graph.js/qbo.js  upstream clients
  test/             node:test characterization + unit suites
docs/             the documentation set below
```

---

## Documentation map

Start here, then open what you need:

| Doc | Read it to understand… |
|---|---|
| **[docs/CUSTOMER.md](docs/CUSTOMER.md)** | Who the customer is, the real problem, **what they asked for**, the hard constraints, and what was explicitly dropped from scope. |
| **[docs/STATUS.md](docs/STATUS.md)** | **What's done vs. remaining** — customer expectations mapped to screens and to the Jira epic, with what each open item is blocked on. |
| **[docs/ROADMAP.md](docs/ROADMAP.md)** | The **phase-wise approach** — Phase 1 (clickable prototype + one live pipe), Phase 2 (flip sources live), Phase 3 (beyond). |
| **[docs/MODULES.md](docs/MODULES.md)** | The **code module map** — what every frontend/backend module does, the seams, and how data flows end to end. |
| **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** | The **integration plan** — the FE↔BE contract, per-tile feasibility against real APIs, auth/scopes, the no-storage strategy. |
| **[docs/TESTING.md](docs/TESTING.md)** | **How to check, test, and verify** a change — the gate, what each suite pins, and how the work is built (test-first). |
| **[docs/FIRST-WEEK-PLAN.md](docs/FIRST-WEEK-PLAN.md)** | The day-by-day plan to wire the live sources against sandbox/own-tenant accounts. |
| **[handover.md](handover.md)** | The original engineer handover (pre-backend snapshot) — historical context. |
| **[CLAUDE.md](CLAUDE.md)** | Conventions + onboarding notes for AI-assisted work in this repo. |

---

## Compliance posture

- **Profile: `hipaa`.** The backend is treated as in-scope for the HIPAA Security Rule.
- **Read-only** — the backend never writes to any source.
- **No PHI at rest** — in-memory sessions, ~90s cache, no database. Preserve this.
- **Audit trail** — every request is logged `method path → status (ms)`; **bodies/PHI are never
  logged.** Log ids/paths, never patient or content values.
- **Synthetic data only** — sample/test data is fake-but-realistic; never commit real PHI/PII/secrets.

See [docs/ARCHITECTURE.md §6](docs/ARCHITECTURE.md) and [docs/TESTING.md](docs/TESTING.md) for detail.

---

## Status at a glance

Phase 1 prototype is built across all six tabs on sample data. Recent feature work: Daily/Monday
dashboard views, important-email categorization, and timezone-correct date handling. Open items
are blocked on customer inputs (design file, spreadsheet layout) — see **[docs/STATUS.md](docs/STATUS.md)**.
