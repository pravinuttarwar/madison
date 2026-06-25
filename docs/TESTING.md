# Testing & how the work is built

> How to check a change, what the test suite guarantees, and the discipline every change follows.
> The one rule: **`npm test` is the gate — it must be green before any commit or PR.**

## The gate — one command

```bash
npm test          # from the repo root
```

runs both halves:

| Half | Command | What it does |
|---|---|---|
| **Backend** | `cd backend && TZ=America/New_York node --test test/` | `node:test` suite — no extra deps, no network, no credentials. |
| **Frontend** | `cd frontend && tsc -b --noEmit && vitest run` | TypeScript typecheck (pins the DTO contract) **+** Vitest + Testing Library render checks (jsdom). |

`TZ=America/New_York` is deliberate — the app reasons in the **practice timezone**, and the date
logic is tested against it. Run the gate the same way locally.

## What each suite pins

### Backend (`backend/test/`)
- **`characterization.test.js`** — spawns the **real server** in `DEMO_MODE` on a free port and
  exercises `/api/*` over HTTP, pinning the contract the frontend depends on: email
  importance/unread/**category** flags, Daily vs Monday dashboard shapes, the 12 report metrics,
  source-status modes, JSON-404. This is the AFK-build safety net — *extend it with any behavior
  change.*
- **`email-category.test.js`** — unit tests for the email category classifier
  (`classifyCategory`, `emailsFromGraph`) **and** a HIPAA check: a `/api/email` read emits the
  audit line and **no subject/sender/body leaks into logs** (safe-logging).
- **`transforms.test.js`** — unit tests for the pure `transforms.js` mappers (incl. timezone-correct
  date handling).

### Frontend
- **`tsc -b --noEmit`** — the type-level DTO contract (`Email`, `DashboardData`, …).
- **Render tests** (`src/**/*.test.{ts,tsx}`): `pages/Dashboard.test.tsx` (Daily/Monday composition,
  WoW deltas, the icon+text category badge, null-safety), `pages/Financials.test.tsx`,
  `context/view-mode.test.tsx`, `lib/format.test.ts`. Pinned to **standalone mock mode** via
  `vitest.config.ts` `test.env` so they never depend on a dev's local `.env`.

## Verifying behavior by hand

Tests prove the contract; to *see* it working:

```bash
npm run dev:frontend          # click through all six tabs on sample data
DEMO_MODE=1 npm run dev:backend
curl localhost:8787/api/dashboard | jq      # inspect the live DTO shape
curl localhost:8787/api/email | jq '.[].category'   # e.g. confirm category values
```

The backend audit line prints to stdout for every request (`GET /api/email → 200 (12ms)`) — that
*is* the "which source read, when" trail. Confirm it never contains email subjects/bodies.

## How a change is built (the discipline)

Work is **test-driven** and ships in small, reviewable, reversible steps:

1. **Branch.** Feature branch off `main` (`feature/<slug>`), referencing the Jira key. Never commit
   on `main`.
2. **Pin behavior first.** For a change in existing code, write/extend a **characterization test**
   that captures current behavior *before* changing it — so you can't silently break the contract.
3. **Red → green → refactor.** Write one failing test for one behavior, add the minimal code to pass
   it, run the gate, then refactor on green. One behavior at a time. Never weaken/skip a test or
   bypass the gate to force green.
4. **Additive, backward-compatible contract changes.** New DTO fields are additive (don't remove/
   rename existing ones). There is **no database**, so no migrations.
5. **Compliance built in (not bolted on).** Synthetic data only — never real PHI/PII/secrets in
   code, tests, fixtures, or logs. For any path that reads ePHI: the read is **audit-logged** (ids/
   paths, never content) and error/operational logs carry **references, never PHI**. These are
   acceptance criteria, proven by tests, like any other behavior.
6. **PR to `main`.** Open a PR with a criteria → test map and the green-gate result so review is
   cheap. Conventional Commits (`type(scope): subject`). Merge closes the work.

The acceptance criteria for each story live in its **Jira ticket** (the kept spec); per-ticket
working notes live under `docs/sprints/<sprint>/`.

## Conventions to match (don't reformat)

- **Commits:** Conventional Commits — `feat(email): …`, `fix(backend): …`, `test(dashboard): …`.
- **Branches:** `feature/<slug>` off `main`; PRs target `main`.
- **Frontend:** ESLint + Prettier + lint-staged/husky run on commit. Match existing style; no mass
  reformat. Use `@/` imports (never relative `../`), `lucide-react` icons, `cn()` from `@/lib/utils`,
  the `@/utils/logger` (never `console.log`), and Tailwind via `src/index.css`.
- **Accessibility:** never convey status by color alone — use the `primitives.tsx` components.
