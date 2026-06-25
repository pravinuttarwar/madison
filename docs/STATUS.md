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
| Color-blind-accessible UI (never color alone) | accessibility primitives + Display menu | ✅ Pattern in place; exact-palette match open (MBI-21) |
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

### 🟡 Remaining (open in Jira — blocked on customer inputs)

- **[MBI-21](https://connecthealth.atlassian.net/browse/MBI-21) — Colorblind-strict palette matching the original design.**
  Production palette must use strong black/red/white and match the original design's exact hex.
  **Blocked on:** the owner's original design file/HTML to extract exact color codes, and
  confirmation of the specific color-vision type. (The never-color-alone pattern already holds; this
  is the exact-match + default-palette polish.)
- **[MBI-22](https://connecthealth.atlassian.net/browse/MBI-22) — Operational reporting from SharePoint/OneDrive spreadsheets.**
  Reports must read the practice's departmental spreadsheets via Microsoft Graph Excel (not CureMD/
  PNC), aggregate multiple files, and ship a documented file template. **Blocked on:** the file
  organization (folder + named-range layout); customer is open to our proposed template.

---

## Known cleanup / tech debt

Tracked in [CLAUDE.md](../CLAUDE.md) "Known gaps". Current candidates:

- **Dead scaffolding (frontend):** Redux + redux-persist + `crypto-js` (hardcoded key — *not* a
  real security control), and orphaned `pages/Overview.tsx` / `pages/Connections.tsx`. Remove or
  revive deliberately.
- **Microsoft Teams source** is hardcoded `mock` — never wired (out of scope per SOW).
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
