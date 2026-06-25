# The customer & what they asked for

> Why this product exists, who it's for, what they explicitly wanted (and didn't), and the hard
> constraints that shape every decision. Read this before [STATUS.md](STATUS.md) and [ROADMAP.md](ROADMAP.md).

## Who

**Madison Medical and Sports Rehabilitation Center** — a small, multi-specialty integrative
practice in NJ (chiropractic, medical, physical rehab, recovery, podiatry, acupuncture,
regenerative/peptide, allergy). Small headcount, wide surface: ~40 office systems, 15
subspecialties, mixed billing (insurance + cash/self-pay + point-of-sale).

**The buyer and sole intended end-user is the physician-owner/CEO** — a hands-on clinician who
runs the business on the side. Decisive, time-starved, tech-curious but not technical. In the
sample data he is "Dr. Romano". Tone for anything user-facing: confident, concrete, plain — no
hype, no jargon.

## The problem (from discovery)

Business data is fragmented across disconnected systems — Outlook mail/calendar, Microsoft Teams,
Microsoft To Do, QuickBooks Online, and provider-maintained Excel spreadsheets. There is **no
single view**. Stated pains:

- Context-switching across email/calendar/financials/spreadsheets; late-night catch-up just to
  know where things stand.
- QuickBooks Online is visually overwhelming for a quick read.
- Weekly provider numbers arrive as a spreadsheet handed over on Monday; the owner waits for it
  rather than self-serving.
- Important emails get lost in volume.

The goal: **consolidate these into one command center** that automates the copy-paste bridging
staff do today.

## What they asked for — the six tabs

The owner built his own clickable HTML mockup ("Command Center") with an AI tool. The product
**deliberately mirrors that mockup's structure and content**, refined and with de-scoped pieces
removed. The committed Phase-1 surface is six tabs:

| Tab | What it's for | Live source (eventual) |
|---|---|---|
| **Dashboard** | One at-a-glance view; a **Daily** view on weekdays and a **Monday** view that adds last week's recap. | aggregate of all below |
| **Email Queue** | Important-email triage + an "awaiting response" (sent, no reply) follow-up list. | Microsoft Graph (mail) |
| **Calendar** | Today + the week ahead. | Microsoft Graph (calendar) |
| **Tasks** | Tasks grouped by owner with due/overdue status. | Microsoft To Do / Planner |
| **Financials** | A clean QuickBooks snapshot: deposits, variable spend WTD/MTD, net contribution. | QuickBooks Online |
| **Reports** | The weekly provider spreadsheet as a live snapshot: patient volumes, encounters by specialty, week-over-week deltas. | provider spreadsheet (Graph Excel) |

## Hard constraints (non-negotiable)

1. **Color-blind owner.** Status and severity must **never** be conveyed by color alone — always
   **icon + shape + text label**. Honored in the prototype via the accessibility primitives; must
   carry into production. (See Jira MBI-21 for the exact-palette follow-up.)
2. **Read-only.** The dashboard only ever *reads* the owner's systems; nothing writes back.
3. **No data storage / no PHI at rest.** Read on demand, render, don't persist. The single
   deliberate exception is a tiny scalar daily snapshot for day-over-day deltas (no line items,
   no patient data) — see [ARCHITECTURE.md §6](ARCHITECTURE.md).
4. **Simplicity is a feature.** The owner wanted the *important things*, not the maximal mockup.
   Fewer screens done well beats breadth.

## What was explicitly dropped (do NOT build)

The owner's AI-generated mockup and an early backend spec were *maximal* and listed more than he
actually wanted. From his own words, the leaner cut is the source of truth. Explicitly cut:

- **CureMD (EHR) integration** — "I don't need the cure section." EHR replacement is a separate
  future conversation, not this product.
- **Direct bank feed (Plaid/PNC)** for the prototype — QuickBooks stands in for financials; the
  connector is designed source-swappable for when the bank settles.
- **AI assistant / "Jarvis" voice-chat panel** — "I don't need it to speak to me like Jarvis."
- **Front-desk reconciliation, a Projects tracker, the Connections screen, the Microsoft Teams
  panel** — out of scope.
- **Invented sample content** (Wearable Device / Recovery Suite / specific universities) — fine as
  sample *row text*, never as dedicated tiles.

See [ARCHITECTURE.md §10](ARCHITECTURE.md) for the full reconciliation of the mockup vs. his
actual words.

## Success metric

For the prototype: that we faithfully captured the owner's own design across the six tabs and
understood the real integration nuance (read-only, secure, no-PHI-at-rest) better than the AI
mockup did. It's a click-through to confirm scope before the live build — then flip sources live.
