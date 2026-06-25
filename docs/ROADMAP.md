# Roadmap — the phased approach

> How the product gets from a clickable prototype to a live system, in deliberate phases. The
> phasing *is* the de-risking story for the customer: prove the pipes first, flip sources live
> second, expand third. Tied to [STATUS.md](STATUS.md) (what's done) and
> [ARCHITECTURE.md](ARCHITECTURE.md) (how the integration works).

Three principles run through every phase:

1. **Read-only** — we only ever read the customer's systems.
2. **No PHI at rest** — read on demand, render, don't persist (one tiny scalar exception for deltas).
3. **Phased** — each phase is independently demoable and reversible.

---

## Phase 1 — Clickable command center (now)

**Goal:** make the six-tab command center *real* on realistic sample data, so the owner clicks
through the actual experience and confirms scope — with one live pipe wired end-to-end to prove
the machinery.

- ✅ All six tabs built and navigable on bundled sample data.
- ✅ Read-only BFF in place: holds tokens server-side, transforms upstream payloads to the exact
  frontend DTOs, in-memory sessions, no database. Live-only — the test gate runs the same route +
  transforms path offline against synthetic fixtures (`FIXTURES_DIR`).
- ✅ Data-access seam (`frontend/src/lib/api.ts`) so the frontend reads every source through the backend.
- ✅ Feature refinements from customer feedback: Daily/Monday views (MBI-20), important-email
  categorization (MBI-19), timezone-correct dates (MBI-26/27/28).
- ✅ Color-blind-safe rendering pattern (icon + shape + text) throughout.
- 🟡 **In flight / blocked on customer inputs:** exact colorblind palette (MBI-21), SharePoint/
  OneDrive spreadsheet reporting (MBI-22).

**The honest "what we'd confirm to go live" checklist** travels with this phase — see the open
questions in [ARCHITECTURE.md §9](ARCHITECTURE.md).

## Phase 2 — Flip the sources live

**Goal:** point the same UI at the owner's real accounts behind the read-only, no-storage backend.
Consent → read → transform → render. Nothing about the front-end changes; each source is enabled
via env + `SOURCE_MODES`.

Rough sequence (full day-by-day in [FIRST-WEEK-PLAN.md](FIRST-WEEK-PLAN.md)):

1. **Backend foundation hardening** — secrets in a vault (not plain env), TLS-only, audit-log
   completeness, token refresh/re-auth flows.
2. **Microsoft Graph first (biggest unlock)** — mail, calendar, To Do. Read-only delegated scopes;
   the owner can self-consent for his own mailbox. Wire the awaiting-response follow-up engine.
3. **Financial layer** — QuickBooks OAuth; deposits + variable spend with the confirmed fixed-cost
   account list; the minimal daily scalar snapshot for day-over-day deltas.
4. **Spreadsheet ingestion** — first **connect the workbook** (UI to paste a OneDrive/SharePoint
   link → resolve to a Graph drive path → validate read-only reachability → persist the non-PHI
   path; MBI-29/30), then read the provider Excel via Graph Excel named ranges → the 12 metrics,
   once the file layout is confirmed (MBI-22).
5. **Auth & access** — Microsoft Entra ID SSO + MFA for the dashboard; small managed allowlist
   (the owner first, optionally a few senior staff later).

**Dependencies / blockers** (carried from discovery — see [ARCHITECTURE.md §9](ARCHITECTURE.md)):
M365 admin consent if the tenant restricts user consent; QBO realm + fixed-cost account IDs;
the spreadsheet location + named-range map; the follow-up threshold + mailbox scope; an acceptable
retention window for the scalar daily snapshot; the exact color-vision palette; hosting target +
which vendors need a Business Associate Agreement.

## Phase 3 — Beyond the command center

The larger opportunity the prototype opens up, framed as a separate future conversation (out of
scope for Phases 1–2):

- A configurable / open-EHR build for the multi-specialty cash/self-pay/insurance workflows that
  the current EHR (CureMD) can't accommodate.
- Agentic automation of the manual copy-paste bridging staff do across systems today.

---

## How the phases map to the codebase

The architecture was built so phase transitions are **configuration, not rewrites**:

- The frontend reads everything through `getDashboard`/`getEmails`/… in `lib/api.ts`, which fetch the
  backend (`VITE_API_URL`) — live-only, no component edits to wire a source.
- The backend maps upstream payloads to the DTOs in `transforms.js`, wired per source in `routes.js`.
  In tests, `graph.js`/`qbo.js` resolve from synthetic fixtures (`FIXTURES_DIR`) so the live path runs
  offline. See [MODULES.md](MODULES.md).
