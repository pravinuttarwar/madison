# Madison Command Center — First-week delivery plan

The goal of week one is to make the Command Center **real** on the six views and prove every
integration pipe end-to-end against **sandbox / own-tenant** accounts — so the walkthrough shows the
actual machinery (read-only, nothing stored), with the customer's data one consent away rather than a
rebuild away.

**Live-wired this week:** Microsoft Graph (against a Microsoft 365 tenant we control) + QuickBooks
(Intuit sandbox company). The bank/PNC deposit feed stays on sample data — QuickBooks stands in for
financials, and the connector is designed source-swappable (see `ARCHITECTURE.md §3, §10`).

Everything below maps to the contract in `frontend/src/lib/api.ts` and the design in
`ARCHITECTURE.md`. Going live on a source = implement its backend route, point `VITE_API_URL` at the
backend, and flip that source in `SOURCE_MODES` from `'mock'` to `'sandbox'`. No page changes.

---

## Day 1 — App registrations + backend skeleton
- **Azure AD app** (single-tenant on our M365), delegated **read-only** scopes `Mail.Read`,
  `Calendars.Read`, `Tasks.Read`, `Files.Read`; redirect URI; run OAuth once → store the refresh
  token in the encrypted vault.
- **Intuit app** → create the **sandbox company**; OAuth → capture `realmId` + tokens.
- Stand up the **read-only BFF** (Node/Express): bearer auth, `/health`, CORS to the front-end,
  token vault, in-memory cache scaffold.
- Seed the M365 mailbox / calendar / To-Do with realistic content; place a **sample weekly `.xlsx`**
  in OneDrive with **named ranges** for the 12 metrics.

## Day 2 — Microsoft Graph endpoints
- `GET /api/email`, `GET /api/calendar` (`calendarView`), `GET /api/tasks` (To Do).
- `GET /api/email/awaiting` — the **follow-up engine**: Sent Items, 14-day lookback,
  latest-message-from-owner, **48h** threshold, grouped by recipient (per the customer's backend
  spec). Use `conversationIndex` + RFC headers, NOT `conversationId` (unreliable — see ARCHITECTURE).
- Verify each response matches its `@/lib/api` DTO exactly.

## Day 3 — QuickBooks + the weekly spreadsheet
- `GET /api/financials` on the QBO sandbox: `Deposit`, `Purchase`/`Bill` minus fixed-cost
  `AccountRef`, `ProfitAndLoss`; `TxnDate` queries for yesterday / WTD / MTD.
- `GET /api/reports` on the Excel workbook: read named ranges → 12 metrics + week-over-week deltas.

## Day 4 — Aggregate, no-storage, wire the front-end
- `GET /api/dashboard` (BFF — **parallel fan-out**) + `GET /api/sources/status`.
- In-memory cache (60–120s TTL); the **scalar daily-KPI snapshot** for deltas (the only thing
  persisted — the owner already accepted this on the 06-03 call).
- Front-end: set `VITE_API_URL`, flip wired sources in `SOURCE_MODES` to `'sandbox'` → the
  Connections-screen badges go live. End-to-end test all six tabs.

## Day 5 — Harden + rehearse
- Token refresh, QBO rate-limit backoff (≈500 req/min/realm), loading / empty / error states,
  audit log (*which source, when* — never content).
- Security pass: TLS-only, zero credentials in the browser, **read-only verified** (grep for any
  write call).
- Rehearse the walkthrough; assemble the customer go-live checklist. Keep buffer for slippage.

---

## Testing matrix (per endpoint)

| Check | Pass criterion |
|---|---|
| Real data returns | live call to the sandbox/tenant returns rows |
| Shape | response matches the FE DTO in `@/lib/api` |
| Read-only | no POST / PUT / PATCH / DELETE anywhere in the source path |
| Token refresh | expired access token auto-refreshes and the call still succeeds |
| Failure | a source error renders `ErrorState`, not a blank screen |

---

## What we can demonstrate at the end of week one

The same six-tab Command Center the customer clicked through — but with **Email, Calendar, Tasks and
Reports pulling from a real Microsoft Graph tenant** and **Financials from a real QuickBooks company**,
read-only, nothing stored, each source badged live on the Connections screen. The message: *the pipes
are real and working; switching to your accounts is a consent click, not new engineering.*

### Honest caveats (carried into the customer note)
- His own mailbox needs his one-click consent (or his admin's, via the MSP / internal IT contact).
- Multi-owner "tasks by owner" is a Microsoft Planner configuration we'd confirm in Phase 2 (To Do is
  per-user).
- QuickBooks read-only is enforced by our code (no read-only OAuth scope exists).
- The bank/PNC deposit feed is not wired in week one.

---

## To re-confirm during the week (flagged in research, not yet independently verified)
- Current QuickBooks Online rate-limit numbers.
- The Excel Workbook API file-size cap.
