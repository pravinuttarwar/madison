# Madison Command Center — Architecture & Integration Plan

How the command center is built today, and exactly how it goes live — written so an
engineer can pick it up and wire the real connections without guesswork. Every
integration claim below was checked against the current vendor docs (Microsoft Graph
v1.0, Intuit QuickBooks Online, Microsoft Graph Excel) and is cited.

Three principles run through all of it:

1. **Read-only.** We only ever read your systems. Nothing in the dashboard writes back.
2. **No data storage.** The dashboard reads on demand and renders. Patient data is never
   stored. (One tiny, non-clinical exception for day-over-day deltas — see §6.)
3. **Phased.** Phase 1 is the clickable command center on sample data with one live
   connection wired. Phase 2 flips the rest live behind a secure backend.

---

## 1. System shape

```
                  Browser (React SPA — this prototype)
                            │  HTTPS, one call per view
                            ▼
                  Backend-for-frontend (BFF)
                   • holds OAuth tokens (encrypted)
                   • read-only calls to each source
                   • transforms → the JSON the UI expects
                   • short-lived in-memory cache only
                            │
        ┌───────────────────┼───────────────────────────┐
        ▼                   ▼                             ▼
  Microsoft Graph      QuickBooks Online        Microsoft Graph (Excel)
  mail / calendar /    deposits / spend /        providers' weekly
  tasks                P&L                        spreadsheet
```

The browser never sees a credential. It talks only to our backend; the backend holds the
tokens and is the only thing that talks to Microsoft / Intuit.

---

## 2. FE ↔ BE contract — endpoints

**Not one endpoint per tile.** There are ~15 tiles but only 5 sources, and tiles reuse the
same data (the Dashboard re-shows email, tasks, calendar, financials that also have their
own tabs). One-call-per-tile would mean duplicate fetches and a request waterfall in the
browser. Instead: **one endpoint per source, plus one aggregate for the Dashboard.**

| Method & path | Backs | Notes |
|---|---|---|
| `GET /api/dashboard?view=weekday\|monday` | The whole Dashboard tab | **Aggregate (BFF).** Server fans out to the sources it needs *in parallel*, composes the tiles, returns one payload. One round-trip, one cache window. |
| `GET /api/email?filter=important` | Email Queue, triage tiles | list |
| `GET /api/email/:id` | Message detail | |
| `GET /api/email/awaiting` | Awaiting-response tile | **Derived** — see §4 |
| `GET /api/calendar` | Calendar tab, schedule tiles | `{ today, week }` |
| `GET /api/tasks` | Tasks tab, owner-summary tile | grouped by owner server-side |
| `GET /api/financials` | Financials tab, financial tiles | `{ weekly, daily }` |
| `GET /api/reports` | Reports tab + W-o-W deltas | weekly spreadsheet snapshot |
| `GET /api/sources/status` | Connection badges (live / sandbox / sample) | |

~8 endpoints, not ~15. Tile composition is the server's job (the Dashboard aggregate),
not the browser's.

### The shapes are the contract

The TypeScript types in [`frontend/src/lib/api.ts`](../frontend/src/lib/api.ts) and
[`frontend/src/lib/data.ts`](../frontend/src/lib/data.ts) **are** the v1 API contract
(`Email`, `ScheduleItem`, `Task`, `WeeklyMetric`, `WeeklyFinancial`, `DashboardData`, …).
The backend's only job is to return JSON matching them. The front end already routes every
read through the `@/lib/api` seam, so going live means returning the same JSON from a real
endpoint — no UI changes.

---

## 3. Per-tile → real-field feasibility

This is the honest core: which displayed numbers map cleanly to a real API field, and
which are *derived* or *config-dependent*. Verdicts checked against vendor docs.

### Email (Microsoft Graph)

| Shown | Real source | Verdict |
|---|---|---|
| from, subject, preview, time, unread, importance/flag | `GET /me/messages` → `from`, `subject`, `bodyPreview`, `receivedDateTime`, `isRead`, `importance`, `flag` | ✅ direct field map |

- Resource: `microsoft.graph.message`. Least scope `Mail.ReadBasic`; `Mail.Read` to read body.
- Docs: https://learn.microsoft.com/en-us/graph/api/user-list-messages and
  https://learn.microsoft.com/en-us/graph/api/resources/message

### Awaiting-response (the follow-up engine) — **derived, not a field**

We scan Sent Items (`GET /me/mailFolders('SentItems')/messages`), find threads whose latest
message is the owner's, older than a threshold, with no reply, and group by recipient.

- ⚠️ **`conversationId` is NOT reliable for threading** — Exchange can mint a new
  `conversationId` when external parties reply or the thread-index is missing. Group instead
  on `conversationIndex` + the RFC-5322 headers (`Message-ID` / `In-Reply-To` / `References`)
  and order by `sentDateTime`.
- Docs: https://learn.microsoft.com/en-us/graph/api/mailfolder-list-messages
- The customer's own backend spec defines this engine precisely, and we match it: **48-hour**
  threshold, **14-day** sent-items lookback, owner's mailbox, "no reply" = the latest message in
  the conversation is still the owner's, grouped by recipient and days-waiting (sorted desc). His
  spec keys on `conversationId`; we improve on that with `conversationIndex` + RFC headers, since
  `conversationId` is unreliable (above).

### Calendar (Microsoft Graph)

| Shown | Real source | Verdict |
|---|---|---|
| time, title, detail, week view | `GET /me/calendarView?startDateTime=…&endDateTime=…` → `subject`, `start`, `end`, `location`, `attendees` | ✅ direct |

- Least scope `Calendars.ReadBasic`; `Calendars.Read` for full detail. No admin consent needed.
- Docs: https://learn.microsoft.com/en-us/graph/api/calendar-list-calendarview

### Tasks by owner — **API choice depends on how they track tasks**

| Shown | Real source | Verdict |
|---|---|---|
| title, due, status | per-task fields | ✅ |
| **owner** (multiple staff) | — | ⚠️ see below |

- **Microsoft To Do is per-user/personal** (`GET /me/todo/lists/{id}/tasks`, scope `Tasks.Read`).
  You can't read another person's lists unless they're explicitly shared with you. It does
  **not** model a multi-owner team board.
- For a real "tasks by owner across the team" board, the correct API is **Microsoft Planner**
  (Group → Plan → Bucket → Task, with `assignedTo`; scopes `Tasks.Read` + `Group.Read.All`).
- Docs: https://learn.microsoft.com/en-us/graph/api/resources/todotask and
  https://learn.microsoft.com/en-us/graph/api/resources/planner-overview
- **Confirm with customer:** do owners share Microsoft To Do lists, or track work in Planner?
  That decides which API backs this tile. (The UI mirrors his design's "Microsoft To Do"
  label; the backend adapter is swapped to match reality.)

### Financials — **source is in flux; design it source-swappable**

> Important grounding from the calls: the owner's *real* deposit source is **his PNC bank
> (via Plaid)**, not QuickBooks — "if I'm into PNC, I don't necessarily need QBO." He is also
> **switching banks soon** and will send "the list of accounts" once scope is finalized. His own
> backend spec splits it: **deposits from Plaid/PNC**, **variable spend from QuickBooks**. So the
> financial connector must be **swappable** behind the same `/api/financials` shape — Plaid today,
> a different bank feed after the switch, QuickBooks for spend (optional for deposits).
> Plaid caveats his spec calls out: a one-time PNC "Link" by the owner, possible "Cash Flow
> Insight" prerequisite, and **token re-auth every 60–90 days** (build a re-auth nudge).
> The clickable Phase-1 prototype wires QuickBooks because it has a clean sandbox and avoids the
> Plaid re-auth/bank-switch churn — see the open decision in §10.

#### QuickBooks Online (spend; optional for deposits)

| Shown | Real source | Verdict |
|---|---|---|
| deposits by day, total, breakdown | `Deposit` entity (with `DepositLineDetail`: payment method, linked `SalesReceipt`/`Payment`) | ✅ |
| variable spend | `Purchase` / `Bill` entities, filtered by `AccountRef`, **excluding a fixed-cost account list** | ⚠️ needs their fixed-cost `Account` IDs |
| net contribution | derived (deposits − variable spend) | ✅ |
| category rollups | `Account` entity + `ProfitAndLoss` report (Reports API) | ✅ |

- Query endpoint: `GET /v3/company/{realmId}/query?query=…` — SQL-like, supports `TxnDate`
  filters. No `OR`, `GROUP BY`, or `JOIN`; ~500 req/min/realm. Tokens: access 1h, refresh ~101d.
- Docs: https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/deposit
  and https://developer.intuit.com/app/developer/qbo/docs/learn/explore-the-quickbooks-online-api/data-queries
- ⚠️ **No read-only OAuth scope exists.** The only accounting scope is
  `com.intuit.quickbooks.accounting`, which grants read **and** write. Our read-only posture
  is therefore a **code-level guarantee** (the backend never calls a POST/PUT/PATCH/DELETE on
  any accounting entity), not something Intuit enforces at the token level. We state this
  plainly; it's the honest representation for a HIPAA-aware buyer.
- **Confirm with customer:** which `Account`s are "fixed" (rent, base utilities, contracted IT).

### Weekly clinical report (Microsoft Graph — Excel)

| Shown | Real source | Verdict |
|---|---|---|
| 12 metrics + W-o-W deltas, encounters by specialty | a worksheet range / named ranges in their `.xlsx` | ⚠️ feasible; fully depends on their file layout |

- Range read: `GET /me/drive/items/{id}/workbook/worksheets/{id}/range(address='A1:D12')` →
  `values` (2-D array). Path addressing works:
  `GET /me/drive/root:/path/to/file.xlsx:/workbook/worksheets/…`.
- **Prefer named ranges** (`/workbook/names/{name}/range`) so the map survives row shifts.
- `.xlsx` only (not legacy `.xls`); read scope `Files.Read` (OneDrive) or `Sites.Read.All`
  (SharePoint); same API for SharePoint via `/sites/{site-id}/drive/items/{id}/workbook/…`.
  Sessions are optional for reads (recommended only for many sequential reads).
- Docs: https://learn.microsoft.com/en-us/graph/api/worksheet-range and
  https://learn.microsoft.com/en-us/graph/api/workbook-list-names
- **Confirm with customer:** the file location(s) and the cell / named-range → metric map. One
  file or several?

### Day-over-day deltas — **the one storage exception** (see §6).

---

## 4. Authentication & scopes

### Microsoft Graph (Outlook mail/calendar, tasks, Excel) — delegated, read-only

`Mail.Read`, `Calendars.Read`, `Tasks.Read` (+ `Group.Read.All` if Planner), `Files.Read`
(+ `Sites.Read.All` if the spreadsheet is in SharePoint).

- **These read-only delegated scopes do not require tenant-admin consent.** A single
  physician-owner can consent for **their own mailbox** at sign-in, with no IT involvement.
- Admin consent is only needed if (a) their tenant has turned off user consent, or (b) we
  later read mailboxes other than the signed-in user's. In that case we send a one-click
  admin-consent link for their IT admin to approve.
- Docs: https://learn.microsoft.com/en-us/graph/permissions-overview

### QuickBooks Online — OAuth2

Scope `com.intuit.quickbooks.accounting` (see the read-only caveat in §3). The owner clicks
"Connect to QuickBooks" and authorizes; we capture the `realmId` (company) and tokens.

- Docs: https://developer.intuit.com/app/developer/qbo/docs/learn/scopes

Tokens (Graph + QBO refresh tokens) are the only durable secrets — held in an encrypted
secret store / token vault, never in the browser, never alongside any of their content.

---

## 5. Phase-1 trial wiring (what's live vs sample)

The chosen live-wired source for the trial is **Microsoft Graph**, run against **a Microsoft
365 tenant/mailbox we control** (so email/calendar/tasks and the awaiting-response engine
make real Graph calls end-to-end). Their *own* mailbox is then a one-click consent away — no
new engineering.

> Note: the public Microsoft 365 Developer Program sandbox is now gated (Visual Studio
> Enterprise subscribers / Microsoft partners only, as of 2024). So the trial uses a tenant
> we own rather than relying on that free program.

QuickBooks and the spreadsheet stay on sample data for the trial, with their adapters and
contract already in place (QBO has a clean free sandbox company for when we wire it).

`GET /api/sources/status` reports each source's mode so the UI can badge it honestly
(`live` / `sandbox` / `sample`). Modes are declared in `SOURCE_MODES` in
[`frontend/src/lib/api.ts`](../frontend/src/lib/api.ts).

---

## 6. No-storage strategy

1. **Backend holds secrets, not data.** OAuth tokens live in an encrypted vault. No database
   of their mail / financials / patient data.
2. **On-demand reads.** Each request calls the source, transforms, returns. Nothing persisted.
3. **In-memory cache only**, short TTL (~60–120s), per session, evicted — so tab-switching
   doesn't hammer the APIs. That's *caching*, not *storage*; it never touches disk.
4. **The one deliberate exception — deltas.** "Up vs yesterday" needs yesterday's number. We
   persist **only a handful of scalar aggregates** (total deposits, variable spend, encounter
   counts — plain integers), **never line items, never anything patient-level.** A tiny
   daily-KPI snapshot.
   - **Confirm with customer:** an acceptable retention window for those scalars (e.g. 90 days).
5. **HIPAA-aware posture:** TLS only, encrypted tokens, read-only by code contract, audit log
   of *which source was read when* (not the content).

---

## 7. Dev handover — how to extend this

### Go live on a source (the only change needed)

1. Implement the backend route for that source (table in §2), returning JSON that matches the
   DTO in `@/lib/api` (e.g. `getFinancials` expects `{ weekly: WeeklyFinancial; daily: DailyFinancial }`).
2. Set `VITE_API_URL` to the backend origin (already read by `@/config/environment`).
3. Flip the source in `SOURCE_MODES` (in `frontend/src/lib/api.ts`) from `'mock'` to
   `'live'` (or `'sandbox'`).

That's it — no page changes. Until a source is flipped, it returns the bundled sample data,
so the app keeps working with any subset wired.

```ts
// frontend/src/lib/api.ts
export const SOURCE_MODES: Record<SourceId, SourceMode> = {
  outlook: 'live',        // ← flip when /api/email, /api/calendar are up
  microsoftToDo: 'mock',
  microsoftTeams: 'mock',
  quickbooks: 'mock',
  spreadsheet: 'mock',
};
```

The fetch path is already written: each getter calls `read(source, path, sample)`, which
hits `${VITE_API_URL}${path}` when the source is live and returns sample data otherwise.

### Add a new tile / endpoint

1. Add the DTO type + an async getter in `@/lib/api.ts` (return sample data via `read(...)`).
2. Consume it in a page with the `useApi` hook:
   `const { data, loading, error } = useApi(getThing, [])`.
3. Render `<Loading />` / `<ErrorState />` from `@/components/AsyncState` for the two states.
4. Implement the matching backend route returning the same shape.

### Charts & data-viz — convention by visual type

We deliberately use **two rendering approaches, picked by what the visual IS** — not one library
everywhere. Keep this consistent:

- **Plotted charts → Recharts** (the charting lib). Use it when there's an axis + series:
  trends over time, multi-series comparisons. Today that's the year-over-year `LineChart` in
  `pages/Reports.tsx` (the only place Recharts is imported). Recharts is **code-split** there via
  `React.lazy` (see `App.tsx`) so its ~100 KB only loads when Reports opens — keep new plotted
  charts inside that lazy boundary.
- **Ranked / progress bars → CSS** (a `<div>` with `width: %`). Use it for a list of label → value
  rows with a proportional bar + delta chip — they're list UI, not plotted charts. The shared
  primitive is `components/primitives.tsx` (`MetricList`); also `Financials.tsx` (deposits, spend
  by category). Bars carry meaning via the `chart-1..5` / `success/warning/destructive` tokens.

Rule of thumb: **does it need an axis?** Yes → Recharts (lazy). No (it's a ranked/progress list)
→ CSS bar. Don't push ranked lists through Recharts (loses the inline delta chips, adds weight),
and don't hand-roll an axis chart (use the lib). The Microsoft logo SVG on the login button is
not a chart.

### Per-source backend checklist

| Source | API | Read scope(s) | Sandbox for dev |
|---|---|---|---|
| Outlook mail + calendar | Microsoft Graph | `Mail.Read`, `Calendars.Read` | own M365 tenant |
| Tasks | Graph To Do **or** Planner | `Tasks.Read` (+ `Group.Read.All`) | own M365 tenant |
| Teams mentions/DMs | Microsoft Graph | `Chat.Read`, `ChannelMessage.Read.All` | own M365 tenant |
| Financials | QuickBooks Online | `com.intuit.quickbooks.accounting` (read by code contract) | Intuit sandbox company |
| Weekly spreadsheet | Graph Excel | `Files.Read` / `Sites.Read.All` | own M365 tenant |

---

## 8. Phase plan (tied to what the customer asked for)

Mirrors his own Command Center design: six tabs (Dashboard, Reports, Financials, Email Queue,
Calendar, Tasks), the Monday/Weekday toggle (default Weekday), color-vision-friendly. The
items he asked to drop stay dropped (legacy EHR source, direct bank feed, projects card, AI panel).

**Phase 1 (now).** The clickable command center on realistic sample data, with Microsoft Graph
wired live against a tenant we control to prove the pipe end-to-end — plus the short "what we'd
confirm together to go live" checklist (the ⚠️ items above).

**Phase 2.** Flip all sources live on his real tenant behind the read-only, no-storage backend
(consent → read → transform → render). Then the larger opportunity: the configurable /
open-EHR build for the multi-specialty cash/self-pay/insurance workflows, and the agentic
automation of the manual copy-paste bridging the staff do today.

---

## 9. Open questions to confirm with the customer

1. **Financials source:** is the live deposit feed PNC (via Plaid) or the new bank he's moving to?
   We need the **account list** he said he'd send. Is QuickBooks in scope for spend, or just the bank?
2. **Fixed vs variable:** which accounts to treat as "fixed cost" (tie this to the account list).
3. **Tasks:** shared Microsoft To Do lists, or Microsoft Planner? (decides the task API)
4. **Spreadsheet:** confirmed it's **one file from one provider** on Microsoft storage — we need the
   OneDrive/SharePoint path and the cell / named-range → metric map.
5. **Microsoft 365:** the owner can self-consent for his own mailbox for the read-only scopes; if the
   tenant restricts that, who grants admin consent — their MSP (Titanium) or an internal contact (Ben)?
6. **Deltas:** acceptable retention window for the scalar daily KPIs (no PHI) — he verbally accepted
   that day-over-day comparison requires storing two days of figures.
7. **Awaiting-response:** confirm 48h / his mailbox (per his spec) — already specified, just verify.

---

## 10. Reconciliation — his mock & backend spec vs. what he actually said

We have three source artifacts in the lead folder, and they **do not agree** — the distinction
drove the scope:

- **`madison_medical_jarvis_v2.html`** (his Claude-generated mock) and **`Jarvis_Backend_Developer_Spec`**
  are the *maximal* versions. They include 6 data sources — Microsoft Graph, **CureMD**, **Plaid/PNC**,
  QuickBooks, spreadsheets, **Anthropic "Jarvis" chatbot** — plus panels for Teams, a "Derosa" report,
  front-desk reconciliation, a projects tracker, and the Wearable/Recovery initiatives.
- **The call transcripts (his own words)** are *leaner* and are the source of truth. Verbatim, his
  top four are **"email, calendar, bank, and spreadsheets,"** and he said the mock is **"more than you
  need… I just want to pick the important things."**

What he **explicitly dropped** (so we don't build it): CureMD API ("I don't need the cure section"),
front-desk reconciliation ("I'm not worried about front desk reconciliation"), the Jarvis voice/chat
("I don't need it to speak to me like Jarvis"). **Wearable Device / Recovery Suite / Caltech / UCSD
do not appear in any transcript** — they're sample content invented in his mock; fine as sample row
text, not as dedicated tiles.

This is why the prototype is the lean six-tab cut, not the bloated mock. Our scope matches what he
*asked for*, not what Claude *generated for him*.

**Three things his own spec gets wrong that we correct (and should tell him plainly):**
1. **QuickBooks has no read-only scope** — his spec assumes a "read-only OAuth flow"; there isn't one.
   Read-only is our code guarantee (we only issue read queries).
2. **Multi-owner "tasks by owner" can't come from one person's Microsoft To Do** (it's per-user). The
   correct source is Planner — his spec uses To Do and still groups by owner, which won't work as-is.
3. **`conversationId`** (used in his awaiting-response steps) is unreliable for threading; we use
   `conversationIndex` + RFC headers instead.

**Open decision (yours):** for the Phase-1 demo, keep **QuickBooks** as the financial source (stable
sandbox, no Plaid re-auth/bank-switch churn) and frame the connector as swappable to PNC/the new bank
at go-live — OR switch the demo's financial framing to **bank/PNC** now to match his words exactly.
Recommendation: keep QuickBooks for the clickable demo, be explicit in the customer note that the live
deposit feed will point at his bank once the account list and bank switch settle.
