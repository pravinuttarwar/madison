# MBI-19 — Email prioritization: important-only morning briefing (align note)

> Working note from `/align` (BUILD-PREP). **Kept spec lives in Jira MBI-19** — this is scratch.
> Sprint: Madison · Epic: MBI-18 · Type: Story · Priority: Medium

## Decision (fork resolved)
- **Scope: Field + UI + ready seam.** Add the `category` field, render icon+text on the dashboard
  panel, seed demo/mock across all 3 buckets, AND add a config-driven classifier seam in
  `transforms.js`. Classifier map ships **empty** (customer sender lists pending — ticket Open items);
  unmatched important emails **default to `action-needed`**.

## Grounding (confirmed at HEAD)
- Importance already rule-based: `transforms.js:81` `importance === 'high' || flag.flagStatus === 'flagged'`.
- Dashboard panel already important-only, no inbox count: `Dashboard.tsx:201` (`filter(e => e.important)`, top 4).
- Email Queue already shows full list + `Star` icon for important: `EmailQueue.tsx:61`.
- Audit middleware logs `method path → status (ms)`, no bodies: `server.js:45`.
- **Gap:** no `category` field on the `Email` DTO (`data.ts:261`); dashboard panel renders no category icon today.
- Char test pins 8 emails, importance/unread booleans, 3 unread-important: `characterization.test.js:88`.

## Contract / safety
- Adding `category` is **additive** — no removed/renamed fields, backward compatible.
- No DB in repo → no migration concern.
- HIPAA criteria already met by existing audit line; add the constraint that the classifier logs no content.

## Acceptance criteria
Recorded on Jira MBI-19 (Functional / Technical / HIPAA). PHI-redaction scan: clean (0 hits).

## Files to touch (next, in /tdd)
- backend: `transforms.js` (classifier + category), `demo.js` (seed buckets), `routes.js` (unchanged wiring)
- frontend: `lib/data.ts` (type + mock), `pages/Dashboard.tsx` (icon+text badge)
- tests: `backend/test/characterization.test.js`, frontend render test
