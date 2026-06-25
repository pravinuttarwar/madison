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
| Tasks grouped by owner, due/overdue | Tasks (`/tasks`) | ✅ UI done on sample data |
| Clean QuickBooks snapshot (deposits, variable spend, net contribution) | Financials (`/financials`) | 🟡 UI done; QBO not connected; fixed-cost exclusion is config-only |
| Weekly provider spreadsheet snapshot + WoW deltas | Reports (`/reports`) | 🟡 UI done with the 12 metrics; spreadsheet read not wired (MBI-22) |
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

### 🟡 Remaining (open in Jira)

- **[MBI-33](https://connecthealth.atlassian.net/browse/MBI-33) — Remove sample data, go live-only (Phase-2 epic).**
  Graduate from the sample-data prototype to a **live-only product**. Live integration is wired to **sandbox**
  apps (badges read `sandbox`; `live` on the production apps). **MBI-34 (fixtures), MBI-35 (frontend live-only),
  and MBI-36 (backend `DEMO_MODE`/`demo.js` retired) are done** — the runtime sample path is gone end-to-end and
  the gate runs the live path offline against fixtures. **Remaining:** MBI-37 (harden empty/error + auth states),
  MBI-38 (Connections badges consume live `/api/sources/status` + `SourceMode` cleanup), MBI-39 (standalone
  demo's fate).
- **[MBI-22](https://connecthealth.atlassian.net/browse/MBI-22) — Operational reporting from SharePoint/OneDrive spreadsheets.**
  Reports must read the practice's departmental spreadsheets via Microsoft Graph Excel (not CureMD/
  PNC). **Build-prep (2026-06-25) split this into "connect the workbook now, map the metrics later":**
  - **[MBI-29](https://connecthealth.atlassian.net/browse/MBI-29) — Paste & validate a workbook link** —
    revive/route `Connections.tsx`, resolve a OneDrive/SharePoint share-URL → Graph drive path, confirm
    read-only reachability. **Unblocked — ready to build** (no customer input needed).
  - **[MBI-30](https://connecthealth.atlassian.net/browse/MBI-30) — Persist the link & read `/api/reports`
    off it** — durable **non-PHI** drive path (path only, never cell values); blocked-by MBI-29.
  - **Parked — realign MBI-22 when the practice shares all departmental sheet formats:** the named-range
    → 12-metric mapping + file architecture (**single canonical workbook** chosen). **Blocked on:** the
    file layout (folder + named-range map); customer is open to our proposed template.

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
