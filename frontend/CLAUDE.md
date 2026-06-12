# Madison Medical and Sports Rehabilitation Center — prototype (build conventions)

Build the clickable React prototype scoped in `docs/spec.json`.

## How to read your inputs (spec = scope, context = depth, design = yours)
- `docs/spec.json` is the approved SCOPE + intent: which screens exist, what each is FOR, which
  are core vs later, and the objective. Build every `core` screen it names. It is NOT a UI spec —
  it does not dictate layout or components.
- `docs/context/` is the TRUTH for depth: read it to get the real fields, data, terminology,
  personas, and workflow right (internal grounding only — never surface $/pricing/other customers/PHI).
- The HOW — layout, components, visual system, interactions — is YOURS (see Design bar). Ground the
  details in the context; don't invent requirements beyond the spec's scope.

## Customer branding (this is THE CUSTOMER'S product — lead with their identity)
- Customer website: https://madisonmedicalnj.com — draw the visual identity from THEM (their industry,
  name, vibe). Take color inspiration that fits Madison Medical and Sports Rehabilitation Center.
- For the customer's mark, render their NAME as a clean, styled text wordmark (or a monogram —
  their initial(s) in a small branded chip). Do NOT hotlink any external logo/favicon service
  (clearbit, google, the site favicon) — those are third-party runtime deps that break in the
  shipped artifact and read as broken images. A tasteful text wordmark always works and looks
  intentional. (If you have a brand SVG in docs/context, you may inline it; otherwise text.)
- A ready-made <MbSignature /> component (the exact Mindbowser attribution) is already at
`@/components/MbSignature`. Import it and render it ONCE in your root layout/App. Do NOT
restyle, reposition, or remove it, and do NOT build your own — it is the required, pixel-exact
"Prototyped by mindbowser" mark. Otherwise the prototype's look belongs to the customer.
- If the customer's brand is unclear, design a tasteful ORIGINAL identity (your free hand).

## The customer gave us their OWN design — MIRROR it (overrides "design is yours")
Madison Medical and Sports Rehabilitation Center provided a mockup/design/spec (in `docs/context/`): His madison_medical_jarvis_v2.html 'Command Center' — honor the nav, the Monday/Weekday toggle, and the section content; drop the Projects card, the AI assistant panel, and the CureMD & Plaid sources.
- Treat that document as the BLUEPRINT. Reproduce its STRUCTURE, its named sections/metrics/projects,
  its data sources and terminology, and its phased framing — do NOT invent a parallel design.
- This OVERRIDES the default "design is yours": match their layout and naming. The Design bar still
  applies to POLISH (brand color system, depth, craft) — it does not license a redesign.
- Governance still holds: mirror STRUCTURE and terminology, never surface $ amounts, other customers, or PHI.

## Phase 1 framing (phasing is the de-risking close)
- The `core` screens ARE the Phase-1 commitment — present them as "what you can have now": Clickable command-center prototype mirroring his design across the six committed tabs (Dashboard, Reports, Financials, Email Queue, Calendar, Tasks) on realistic mock data, color-blind-accessible.
- Render any `later` page as an explicit, tasteful "later phase" beat (not a generic "coming soon"): Live integrations (Outlook/Microsoft To Do, QuickBooks, provider spreadsheets) via a secure read-only backend, then the Phase 2 custom EHR / agentic workflow opportunity.
  a small titled card that names what's deferred and signals the path — so the phased plan is something
  the customer reads, not a dead stub.

## Frame it for THIS buyer
- This is being presented to a buyer who wants to hear: We took your design and made it real, we left out everything you told us to drop, and here is exactly what we'd confirm together to flip it live — fast.
- Tune emphasis, ordering, and word choice to land for them — on REAL capabilities ONLY. Persona tuning
  NEVER licenses hype (the banned-words list still holds) and never inflates a claim.
- If they signaled they want it SIMPLE / one place: deliberately keep it tight — fewer screens done well
  beats breadth. Simplicity is a feature here, not a shortcut.

## Who this is for + what lands
- Buyer & tone: Physician-owner / CEO-Founder of a non-cookie-cutter, multi-specialty NJ practice; hands-on clinician who runs the business on the side, decisive, time-starved, tech-curious but not technical. · tone: Confident, concrete and respectful of his own design — no hype, no jargon; show we understood the real-world integration nuance Claude glossed over. · emphasize: We took YOUR design and made it real, Plain-language honesty about what each integration needs, One-glance simplicity, Local/in-person and fast · avoid: Re-introducing things he dropped (CureMD, Plaid, Projects, AI panel), Over-promising live data access like an AI demo, Technical jargon, Anything that feels like a slow month-by-month retainer
- Mirror that TONE in the product's microcopy, density, and ordering; lead with what they emphasize,
  steer clear of what backfires — all on REAL capabilities ONLY (no hype, banned-words list still holds).
  This is voice/emphasis, never a new claim.

## This is a PROTOTYPE = the real PRODUCT, not a marketing page
Open DIRECTLY in the working product the user would actually use — the primary screen
(a worklist, dashboard, editor, chart view, inbox…). The first route "/" IS that screen.
- App chrome ONLY: a slim top bar (customer logo + minimal in-app nav) then the live UI.
  Do NOT build a marketing landing / big hero / "Overview" page with feature cards and a
  "four steps" explainer — that is a Concept, not a prototype. No "Get started" splash.
- Every page is a real product screen with realistic seeded data, real interactions
  (open a row → detail → take an action → see it reflected). Make the core flow clickable.
- It should feel like a logged-in SaaS product mid-use, not a website about the product.

## Scope discipline — lead with the CORE, park the rest
Each page in docs/spec.json has a "phase". Build the `phase:"core"` pages as full, polished
screens and make route "/" the most important core screen; the nav leads with core. For any
`phase:"later"` page, render only a SMALL, tasteful "Coming in the discovery phase" placeholder
(a titled card with a one-line note + a muted preview) — NOT a full screen, and never in the
primary nav position. Do not give a deferred/aspirational feature equal billing with committed
work. A tight 3-4-screen demo that nails the core beats a broad one.

## Design bar — establish a BRANDED system first, then polish (Lovable-grade)
A generic slate template is a FAIL. The bar is a product that looks designed for THIS customer.

STEP 1 — set the color system before building screens (do this FIRST):
- Open `src/index.css` and RETUNE the `@theme` brand slots to Madison Medical and Sports Rehabilitation Center's real
  identity: set `--color-primary` (their main brand color, drawn from their site/industry) and
  `--color-brand` (a complementary accent); adjust `--color-ring` to match primary. Optionally
  warm/cool the neutrals. The shipped Button/Card and every `bg-primary`/`text-primary`/
  `bg-brand` utility then inherit it — so the WHOLE app is cohesive and on-brand, not slate.
- Use the brand primary SPARINGLY — key actions, active nav, one or two emphasis moments per
  screen. Neutrals (background / card / muted / border) carry the bulk. Never paint everything primary.
- This is the single biggest quality lever. Do NOT leave the default indigo if the customer has a
  real brand color; do NOT hand-roll one-off hex colors per component (use the tokens for cohesion).

STEP 2 — depth & hierarchy (a flat UI reads as a wireframe; this is what separates it):
- Layer the surfaces: `bg-background` (page) < `bg-card` (panels) < `bg-muted` (insets/zebra).
- Real elevation: cards `shadow-sm` lifting to `shadow-md` on hover; popovers/modals `shadow-lg`.
  Generous radius (`rounded-xl` on cards/inputs). Subtle borders. NEVER ship flat borderless boxes.
- Data-viz/metrics: use the `chart-1..5` + `success/warning/destructive` tokens for trends, status
  pills, and KPI accents — color carries meaning, not decoration.

STEP 3 — craft (table-stakes polish):
- Consistent spacing scale + vertical rhythm; everything on a grid; aligned edges, equal gaps,
  no orphaned/cramped text. Tables/cards/rows share consistent padding + baselines.
- Typography hierarchy (clear size/weight steps, readable line-length, no clipped text),
  disciplined whitespace, tasteful lucide icons. Empty/loading/active states handled. Fully responsive.
- Cohesive across pages (shared header/shell, shared tokens + components). Re-read each screen and
  fix any misalignment or clunk before you finish.
- shadcn primitives (button/card/input/label) are helpers that already read the tokens — build
  custom components in `src/components/` where it raises quality.

## Copy — Mindbowser brand voice (we are writing this for the customer)
- Calm, confident, practical, credible, human. NEVER fluffy/hype.
- BANNED words: innovative, cutting-edge, seamless, robust, transformative, best-in-class.
- Proof over puffery; tie features to real workflow/clinical/operational outcomes.
- CTAs like "Let's talk through your use case" / "See if this fits" — never "unlock transformation".
- Litmus: if the copy could belong to ANY healthcare-tech company, it's too generic — rewrite.
- Realistic, specific mock data (names, metrics, content) — never lorem ipsum or "TODO".

## Tech conventions (the ONLY hard rails — strict TS, must `pnpm build` clean)
- React 19 + TS + Vite + Tailwind 4 (the full utility set is available).
- STYLING IS TAILWIND via the existing `src/index.css` (already imported in main). Do NOT add
  `import './App.css'` or import ANY stylesheet that you don't also create — a phantom CSS import
  fails the vite build ("Could not resolve ./App.css"). Use Tailwind classes; for the rare custom
  rule, add it to `src/index.css`. Same rule for every import: never import a file you didn't write.
- `@/components/ui/{button,card,input,label}` exist if you want them; otherwise write
  custom components in `src/components/`. Do NOT import other `@/components/ui/*` modules
  (they don't exist → build breaks).
- `@/` path alias for all intra-src imports — NEVER relative `../`. lucide-react icons. `cn()` from `@/lib/utils`.
- NEVER raw localStorage/sessionStorage.setItem (use `@/utils/secureStorage`); NEVER console.log (use `@/utils/logger`).
- Pages in `src/pages/*.tsx`; wire them in `src/App.tsx` with a polished nav. Self-contained.
- ROUTING: use `HashRouter` from react-router-dom (NOT BrowserRouter). The prototype is
  served at a variable sub-path (preview AND published /<slug>/) — HashRouter works at
  any mount point with no basename and survives refresh. Routes still defined as "/", "/x".

## Governance
Customer-facing prototype that travels to a GitHub repo. NEVER include: $ amounts, sales stage, win/sentiment, internal commentary, MBI staff names, or the name of ANY company other than the customer.
MONEY & FINANCIAL FIGURES: show money ONLY when the screen/section is genuinely about it (deposits, cash flow, spend, revenue) — never manufacture dollar figures where money is not the point. When you do show it: lead with a TREND (▲/▼ %, "up week-over-week", a bar/sparkline); add a concrete magnitude ONLY if it truly helps, and then in a NON-"$" form (e.g. "48.2K USD", clearly sample data). NEVER write a "$"-prefixed number (it trips the publish redaction gate) and NEVER a masked-dots placeholder like "$ ••,•••" (it reads as broken). The gate's "no $ amounts" targets COMMERCIAL figures (deal value, pricing, our fees) — keep those out entirely.
