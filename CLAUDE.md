# Madison Medical and Sports Rehabilitation Center — Madison Command Center

## Intent
Madison Command Center is a working, clickable version of the dashboard you designed — one place to open each morning and see what matters: your important emails and follow-ups, this week's calendar, tasks by owner, a clean financial snapshot, and your providers' weekly report. It keeps your Monday-vs-weekday view, presents your QuickBooks numbers without the visual clutter, and shows the weekly spreadsheet as a live snapshot. This first version runs on realistic sample data so you can click through the real experience; the live connections to Outlook, QuickBooks and your spreadsheets are the next step we'd wire up together.

## Lead context (anchored)
- Customer: Madison Medical and Sports Rehabilitation Center, Healthcare
- Key pain points (with primary-source citations):
  - "Dr. Carmen described as having strong financial capacity — "He is rich and has money to invest, it seems." High investment appetite signal." — buying_trigger, 2026-06-04
  - "Verbal commitment to start work before contract signing; sign-off expected next week" — buying_trigger, 2026-06-03
  - "Current EHR (CureMD) is antiquated and cannot accommodate 15 subspecialties with complex cash/self-pay/insurance billing workflows" — pain_point, 2026-06-03
  - "Vizenda reporting tool creates data duplicates and cannot join appointment + provider note datasets; reports exported to Excel for manual cleanup" — pain_point, 2026-06-03
  - "Staff manually bridging data gaps between systems (copy-paste, print/re-enter); technology should automate what humans are doing today" — pain_point, 2026-06-03
  - "EHR replacement or custom EHR build (Phase 2) — evaluating KRMD and open-EHR options like MedPlum; configurable to fit non-standard multi-specialty workflows" — use_case, 2026-06-03
  - "Shawn initiated formal kickoff meeting to 'officially kick off the project, review pricing, discuss the anticipated project timeline and next steps'" — buying_trigger, 2026-05-29
  - "Dr. Carmen initiated the call to discuss 'building a dashboard' — active intent to move forward with a consolidation solution for her practice." — buying_trigger, 2026-05-29
  - "Dr. Carmen articulated dashboard consolidation/integration needs, current workflow challenges, and vision for a streamlined centralized platform" — pain_point, 2026-05-29
  - "Business operations fragmented across multiple disconnected systems (email, calendar, banking, spreadsheets); no single view of practice data." — pain_point, 2026-05-29
  - "Dashboard to consolidate Outlook (email+calendar), PNC banking, and spreadsheets with weekly reporting data into one centralized platform for medical practice ops." — use_case, 2026-05-29
  - "May 28 kickoff call cancelled due to a conflicting meeting on Shawn's side; deal momentum paused pending reschedule to early next week." — blocker, 2026-05-28
  - "Dr. Romano explicitly stated she wanted this done 2 months ago and is ready to move — high urgency, not interested in slow month-by-month retainer" — buying_trigger, 2026-05-28
  - "Requested scope document and cost estimate by next day; receptive to in-person meeting in NJ" — buying_trigger, 2026-05-28
  - "Customer explicitly requested kickoff to 'officially kick off the project, review pricing, discuss anticipated project timeline' — clear intent to proceed." — buying_trigger, 2026-05-28
- Stakeholders: _(none captured)_

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
