# Madison Command Center — backend (BFF)

Read-only backend-for-frontend. Holds the OAuth tokens, calls Microsoft Graph + QuickBooks
**read-only**, and returns JSON in the exact shapes the front-end expects (`frontend/src/lib/api.ts`).
No PHI is stored — see `../docs/ARCHITECTURE.md §6`.

## Run it (demo — no credentials needed)
```bash
cd backend
cp .env.example .env          # DEMO_MODE=1 is the default
npm install
npm start                     # → http://localhost:8787
```
Then point the front-end at it:
```bash
cd ../frontend
cp .env.example .env          # sets VITE_API_URL + VITE_LIVE_SOURCES
npm run dev
```
The dashboard now fetches through the real HTTP path (sample data via `DEMO_MODE`), proving the
front-end ↔ backend contract before any credentials exist.

## Go live on a source (sandbox or production)
1. Set `DEMO_MODE=0` in `backend/.env`.
2. Fill the credentials for the source(s) you're wiring:
   - **Microsoft Graph** (Outlook mail/calendar, To Do, Excel): register a single-tenant Azure AD
     app, delegated scopes `Mail.Read Calendars.Read Tasks.Read Files.Read offline_access`, run the
     auth-code flow once as the owner, paste the refresh token + set `MS_USER`.
   - **QuickBooks**: Intuit app + sandbox company; paste `QBO_CLIENT_ID/SECRET/REFRESH_TOKEN/REALM_ID`
     and the `QBO_FIXED_ACCOUNT_IDS`. (No read-only scope exists — read-only is enforced here by only
     ever issuing `query`/`reports` GETs.)
   - **Weekly spreadsheet**: `SPREADSHEET_DRIVE_PATH` + `SPREADSHEET_NAMED_RANGES`.
3. In `frontend/.env`, list the live sources: `VITE_LIVE_SOURCES=outlook,quickbooks` and
   `VITE_LIVE_MODE=sandbox`. Each unlisted source stays on sample data.

`GET /api/sources/status` reports each source's mode, which drives the Connections-screen badges.

## Endpoints
`/health` · `/api/dashboard?view=weekday|monday` · `/api/email` · `/api/email/:id` ·
`/api/email/awaiting` · `/api/calendar` · `/api/tasks` · `/api/financials` · `/api/reports` ·
`/api/sources/status`

## Notes for the next engineer
- Transforms (`src/transforms.js`) are best-effort against the documented response shapes; tune field
  paths against real sandbox responses (Day 2–3 of `../docs/FIRST-WEEK-PLAN.md`).
- The awaiting-response engine (`computeAwaiting` in `src/routes.js`) follows the customer's spec
  (48h / 14-day / latest-message-from-owner). Set `MS_USER` so "from owner" is tested precisely.
- Day-over-day deltas read prior scalars from `src/snapshot.js` (the only persisted, PHI-free state).
