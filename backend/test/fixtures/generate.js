// Synthetic UPSTREAM fixtures for the live-path gate (MBI-34). Writes raw Microsoft
// Graph / QuickBooks payloads (the shapes the real clients return) into a target dir so
// graph.js/qbo.js can resolve from them via FIXTURES_DIR. Dates are computed relative to
// `now` so the date-relative transforms (today / yesterday / this-week) produce
// deterministic results at test time. SYNTHETIC ONLY — no real patient data / PHI.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Owner mailbox — also passed as MS_USER so the awaiting-response engine recognizes
// "latest message is from the owner". Synthetic.
export const MS_USER = 'owner@madison.example';

// MAD-27: the report reads workbook GRIDS (no named ranges). Synthetic env drive-paths for
// the current-year + prior-year files — graph.js fixture routing keys off the '2026'/'2025'
// marker in the path to serve the right worksheet list + grids. Never a real drive path.
const CURRENT_WORKBOOK_PATH = '/synthetic/2026 Patient Numbers.xlsx';
const PREV_YEAR_WORKBOOK_PATH = '/synthetic/2025 Patient Numbers.xlsx';

// MAD-37: synthetic team for the multi-owner "tasks by owner" board. The third UPN has NO
// user fixture on purpose → resolveUser returns null → it's skipped (proves unreadable
// owners don't break the board). Synthetic only — never real team addresses.
export const TASKS_TEAM = ['alice@clinic.test', 'bob@clinic.test', 'ghost@clinic.test'];
export const TASKS_TEAM_ENV = { TASKS_TEAM_USERS: TASKS_TEAM.join(',') };

// Env the spawned server needs for the live path to read these fixtures.
export const FIXTURE_ENV = {
  MS_USER,
  // Pin the single-user path for the default characterization run: never inherit a dev's
  // local .env TASKS_TEAM_USERS (real addresses). The team-board test sets it explicitly.
  TASKS_TEAM_USERS: '',
  // MAD-27: the report reads workbook GRIDS via env drive-path fallback (no connection
  // persisted in the characterization run). The current-year file feeds last/prior; the
  // prior-year file feeds the additive yearAgo (YoY). Synthetic — never a real drive path.
  SPREADSHEET_DRIVE_PATH: CURRENT_WORKBOOK_PATH,
  SPREADSHEET_PREV_YEAR_DRIVE_PATH: PREV_YEAR_WORKBOOK_PATH,
};

const DAY = 86_400_000;
const p2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

export function writeFixtures(dir, now = new Date()) {
  const g = join(dir, 'graph');
  const q = join(dir, 'qbo');
  const usedrange = join(g, 'usedrange');             // MAD-27: current-year tab grids
  const usedrangePrev = join(g, 'usedrange-prevyear'); // MAD-27: prior-year tab grids
  mkdirSync(usedrange, { recursive: true });
  mkdirSync(usedrangePrev, { recursive: true });
  mkdirSync(q, { recursive: true });
  const w = (...parts) => (obj) => writeFileSync(join(...parts), JSON.stringify(obj, null, 2));

  // A Date `deltaDays` from now at hour `h` (local zone), and its ISO instant.
  const at = (deltaDays, h = 9) => {
    const d = new Date(now.getTime() + deltaDays * DAY);
    d.setHours(h, 0, 0, 0);
    return d;
  };
  const iso = (d) => d.toISOString();

  // ── Graph: inbox messages (all classify to action-needed with empty live rules) ──
  w(g, 'messages.json')({
    value: [
      { id: 'm1', from: { emailAddress: { name: 'Billing Partner', address: 'billing@partner.example' } }, subject: 'UB-04 analysis ready', bodyPreview: 'Numbers are in.', body: { contentType: 'html', content: '<p>Numbers are in for the transition model.</p>' }, receivedDateTime: iso(at(0, 8)), isRead: false, importance: 'high' },
      { id: 'm2', from: { emailAddress: { name: 'Research Lab', address: 'lab@research.example' } }, subject: 'Positive reply — pilot', bodyPreview: 'Interested.', body: { contentType: 'text', content: 'Interested, schedule a call.' }, receivedDateTime: iso(at(0, 7)), isRead: false, importance: 'normal', flag: { flagStatus: 'flagged' } },
      { id: 'm3', from: { emailAddress: { name: 'Vendor Support', address: 'support@vendor.example' } }, subject: 'Coding follow-up', bodyPreview: 'Routed.', body: { contentType: 'text', content: 'Routed to the billing team.' }, receivedDateTime: iso(at(0, 6)), isRead: true, importance: 'normal' },
      { id: 'm4', from: { emailAddress: { name: 'Payer Relations', address: 'relations@payer.example' } }, subject: 'Network notice', bodyPreview: 'No action.', body: { contentType: 'text', content: 'Routine network bulletin.' }, receivedDateTime: iso(at(-1, 16)), isRead: true, importance: 'normal' },
      { id: 'm5', from: { emailAddress: { name: 'Front Desk', address: 'frontdesk@madison.example' } }, subject: 'SOP draft 2', bodyPreview: 'Draft 2 attached.', body: { contentType: 'text', content: 'Draft 2 of the rollout SOP attached.' }, receivedDateTime: iso(at(-1, 14)), isRead: true, importance: 'high' },
    ],
  });

  // ── Graph: signed-in profile ──
  w(g, 'me.json')({ displayName: 'Dr. Romano', mail: MS_USER });

  // ── Graph: calendar — events across 5 distinct days incl. today ──
  const ev = (deltaDays, h, subject) => ({
    subject,
    start: { dateTime: iso(at(deltaDays, h)), timeZone: 'UTC' },
    end: { dateTime: iso(at(deltaDays, h + 1)), timeZone: 'UTC' },
    attendees: [],
    location: { displayName: 'Clinic' },
  });
  w(g, 'calendar.json')({
    value: [ev(0, 8, 'Clinic huddle'), ev(0, 10, 'Billing review'), ev(1, 9, 'Caltech call'), ev(2, 11, 'UB-04 decision'), ev(3, 13, 'IG Live'), ev(4, 15, 'ROI review')],
  });

  // ── Graph: To Do lists + tasks (one per status bucket) ──
  w(g, 'todo-lists.json')({ value: [{ id: 'list1', displayName: 'Tasks' }] });
  const due = (deltaDays) => ({ dateTime: `${ymd(at(deltaDays))}T00:00:00.0000000`, timeZone: 'UTC' });
  w(g, 'todo-tasks.json')({
    value: [
      { id: 'k1', title: 'Overdue item', status: 'notStarted', dueDateTime: due(-2) },
      { id: 'k2', title: 'Due today item', status: 'notStarted', dueDateTime: due(0) },
      { id: 'k3', title: 'Upcoming item', status: 'notStarted', dueDateTime: due(3) },
      { id: 'k4', title: 'No-date item', status: 'notStarted' },
      { id: 'k5', title: 'Completed item', status: 'completed', dueDateTime: due(-1) },
    ],
  });

  // ── Graph: MAD-37 multi-owner "tasks by owner" (app-only Tasks.Read.All) ──
  // Per-OWNER fixtures so each owner has a DISTINCT, non-overlapping task set → owner
  // attribution + isolation are observable, and Alice (more overdue) sorts before Bob.
  // ghost@clinic.test deliberately has NO user fixture → resolveUser → null → skipped.
  const users = join(g, 'users');
  mkdirSync(users, { recursive: true });
  w(users, 'alice@clinic.test.json')({ id: 'u-alice', displayName: 'Alice Adams', userPrincipalName: 'alice@clinic.test' });
  w(users, 'bob@clinic.test.json')({ id: 'u-bob', displayName: 'Bob Brown', userPrincipalName: 'bob@clinic.test' });
  w(users, 'u-alice-lists.json')({ value: [{ id: 'la1', displayName: 'Clinic' }] });
  w(users, 'u-bob-lists.json')({ value: [{ id: 'lb1', displayName: 'Clinic' }] });
  // Alice: 2 overdue + 1 due-today + 1 upcoming (4 open). Distinct titles (isolation probe).
  w(users, 'u-alice-tasks.json')({
    value: [
      { id: 'a1', title: 'Alice overdue A', status: 'notStarted', dueDateTime: due(-3) },
      { id: 'a2', title: 'Alice overdue B', status: 'notStarted', dueDateTime: due(-1) },
      { id: 'a3', title: 'Alice due today', status: 'notStarted', dueDateTime: due(0) },
      { id: 'a4', title: 'Alice upcoming', status: 'notStarted', dueDateTime: due(4) },
    ],
  });
  // Bob: 1 upcoming only (0 overdue) → sorts after Alice. The fetch already filters
  // completed at the source, so no 'done' task is included here.
  w(users, 'u-bob-tasks.json')({
    value: [{ id: 'b1', title: 'Bob upcoming', status: 'notStarted', dueDateTime: due(5) }],
  });

  // ── Graph: sent items + conversation (awaiting-response engine: latest from owner, old) ──
  // The sent item carries the real threading signals — internetMessageId + the RFC headers
  // and conversationIndex — so the live path threads it via awaiting.js (NOT conversationId).
  w(g, 'sent.json')({
    value: [{
      conversationId: 'c1',
      conversationIndex: Buffer.alloc(22, 3).toString('base64'),
      internetMessageId: '<await-1@madison.example>',
      internetMessageHeaders: [{ name: 'Message-ID', value: '<await-1@madison.example>' }],
      subject: 'Awaiting reply',
      sentDateTime: iso(at(-5, 9)),
      toRecipients: [{ emailAddress: { name: 'External Lab', address: 'lab@external.example' } }],
    }],
  });
  w(g, 'conversation.json')({ value: [{ from: { emailAddress: { address: MS_USER } }, sentDateTime: iso(at(-5, 9)) }] });

  // ── QuickBooks: deposits + purchases (QueryResponse objects) ──
  const dep = (deltaDays, amt, note) => ({ TxnDate: ymd(at(deltaDays)), TotalAmt: amt, DepositToAccountRef: { name: 'Operating', value: '1' }, PrivateNote: note });
  w(q, 'deposits.json')({ Deposit: [dep(-1, 58420, 'Card batch AM'), dep(-3, 64890, 'Card batch'), dep(-10, 59140, 'Card batch'), dep(-40, 50000, 'Prior-window')] });
  const pur = (deltaDays, amt, acct) => ({ TxnDate: ymd(at(deltaDays)), TotalAmt: amt, AccountRef: { value: acct } });
  w(q, 'purchases.json')({ Purchase: [pur(-1, 14210, '5'), pur(-5, 8000, '5'), pur(-40, 3000, '5')] });

  // ── QuickBooks: ProfitAndLoss report (accrual revenue — MAD-23) ──
  // The Income section's Summary carries "Total Income" in the last column. The revenue
  // route reads the same fixture for each window (last week / prior week / MTD).
  w(q, 'profitandloss.json')({
    Header: { ReportName: 'ProfitAndLoss', ReportBasis: 'Accrual' },
    Rows: {
      Row: [
        {
          group: 'Income',
          type: 'Section',
          Rows: { Row: [
            { type: 'Data', ColData: [{ value: 'Patient Services' }, { value: '264500.00' }] },
            { type: 'Data', ColData: [{ value: 'Ancillary' }, { value: '23900.00' }] },
          ] },
          Summary: { ColData: [{ value: 'Total Income' }, { value: '288400.00' }] },
        },
        { group: 'COGS', type: 'Section', Summary: { ColData: [{ value: 'Total Cost of Goods Sold' }, { value: '40000.00' }] } },
      ],
    },
  });

  // ── QuickBooks: open invoices (A/R aging — MAD-24) ──
  // Open invoices (Balance > 0) spanning every aging bucket, dated relative to NOW so the
  // days-past-due bucketing is deterministic at test time. CustomerRef carries a synthetic
  // patient name on purpose — the aggregate-only DTO must strip it (no PHI surfaces). One
  // fully-paid invoice (Balance 0) is included to prove it's excluded from the totals.
  const inv = (dueDeltaDays, balance) => ({
    DueDate: ymd(at(dueDeltaDays)),
    Balance: balance,
    TotalAmt: balance,
    CustomerRef: { value: '99', name: 'Synthetic Patient' },
  });
  w(q, 'invoices.json')({
    Invoice: [
      inv(10, 900),    // not yet due → Current
      inv(-5, 1200),   // 1–30
      inv(-40, 3400),  // 31–60
      inv(-75, 2100),  // 61–90
      inv(-120, 5000), // 90+
      inv(-200, 0),    // fully paid → excluded
    ],
  });

  // ── Graph: workbook GRIDS (MAD-41 real orientation) — the real Totals-Madison tabs put
  // METRICS as ROW LABELS in column A, DAYS across columns, a "Totals" column, a "TOTAL"
  // subtotal row, and (in the real files) stacked weekly blocks. Each metric row's value lands
  // in the Mon column with the per-metric Totals col = the same value (which the parser must
  // EXCLUDE, not double-count). An unknown "Sprained Wombat" row label must surface as unmapped.
  const HEADER_ROW = ['', 'Mon', 'Tues', 'Wed', 'Thur', 'Fri', 'Sat', 'Sun', 'Totals'];
  const mrow = (label, v) => [label, v, 0, 0, 0, 0, 0, 0, v]; // value in Mon; Totals col = v (excluded)
  // MAD-51: the real tabs hold STACKED WEEKLY blocks (header → DATE serials → rows → TOTAL). Each
  // month splits across two weeks (prior = Jun 15, current = Jun 22) whose columns SUM to the
  // monthly value — so the monthly rollup (MAD-50) is byte-identical while the weekly view (MAD-51)
  // can pick a single block. Excel serials: 46188 = 2026-06-15, 46195 = 2026-06-22.
  const W1_SERIALS = [46188, 46189, 46190, 46191, 46192, 46193, 46194]; // week of Jun 15 (prior)
  const W2_SERIALS = [46195, 46196, 46197, 46198, 46199, 46200, 46201]; // week of Jun 22 (current)
  const splitWk = (v) => { const w2 = Math.floor(v * 0.4); return [v - w2, w2]; }; // [prior, current]
  const pickWk = (c, idx) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, splitWk(v)[idx]]));
  const weekBlock = (serials, c) => [
    HEADER_ROW,
    ['DATE', ...serials, ''],
    mrow('Med', c.med), mrow('Chiro', c.chiro), mrow('Pod', c.pod), mrow('PT', c.pt),
    mrow('IV', c.ivMa), mrow('ACU', c.acu),
    ['TOTAL', 777, 0, 0, 0, 0, 0, 0, 777], // subtotal row → must be IGNORED, not counted
    mrow('MO', c.mo), mrow('Allergy', c.allergy), mrow('Covid Test', c.covid), mrow('Telehealth', c.telehealth),
    ['Sprained Wombat', 9, 0, 0, 0, 0, 0, 0, 9], // unknown row label → surfaced as unmapped
    [`New Patients: ${c.newPatients}`],
  ];
  const gridFor = (c) => ({
    values: [
      ...weekBlock(W1_SERIALS, pickWk(c, 0)), // prior week (Jun 15)
      ...weekBlock(W2_SERIALS, pickWk(c, 1)), // current week (Jun 22, latest)
    ],
  });
  const emptyTab = { values: [HEADER_ROW, ['DATE', '', '', '', '', '', '', '', '']] }; // no metric rows
  const JUNE = { med: 120, chiro: 64, pod: 20, pt: 30, ivMa: 40, acu: 12, mo: 6, allergy: 8, covid: 3, telehealth: 5, newPatients: 31 };
  const MAY = { med: 110, chiro: 60, pod: 18, pt: 28, ivMa: 36, acu: 10, mo: 5, allergy: 7, covid: 2, telehealth: 4, newPatients: 20 };
  const PREV_JUNE = { med: 100, chiro: 55, pod: 16, pt: 25, ivMa: 33, acu: 9, mo: 4, allergy: 6, covid: 2, telehealth: 3, newPatients: 18 };

  // Current-year file: month tabs (May, June populated; July EMPTY — a future month) + provider
  // / microsoft.com tabs that selectMetricTabs EXCLUDES. The empty July tab must be SKIPPED so
  // June=current, May=prior (MAD-41 AC-5). Tab names carry the real files' dirtiness.
  w(g, 'worksheets.json')({
    value: [
      { name: 'May Totals Madison' }, { name: 'May Provider Totals ' },
      { name: 'June Totals Madison' }, { name: 'June Provier Totals ' },
      { name: 'July Totals Madison' }, { name: 'July Provider Totals ' }, // July empty (future month)
      { name: 'microsoft.com:RD' },
    ],
  });
  w(usedrange, 'June Totals Madison.json')(gridFor(JUNE));
  w(usedrange, 'May Totals Madison.json')(gridFor(MAY));
  w(usedrange, 'July Totals Madison.json')(emptyTab);

  // MAD-46: Provider Totals tabs — providers as row labels (same layout). June=current, May=prior;
  // a trailing-space variant ("Bachman " / "Bachman") proves name normalization merges them.
  // MAD-50: providers are the rows BETWEEN a block's DATE and its TOTAL. "Bachman " (block 1) and
  // "Bachman" (block 2) both sit BEFORE their TOTALs → still merge (name normalization). A service
  // tally ("allergy") sits AFTER block 1's TOTAL → it is NOT a provider; it's surfaced as a
  // "found but not counted" warning, never miscounted.
  const provGrid = (c) => ({
    values: [
      ['', 'Mon', 'Tues', 'Totals'],
      ['DATE', 45663, 45664, ''],
      ['Lisa', c.lisa, 0, c.lisa],
      ['Bachman ', c.bachman, 0, c.bachman], // trailing space → merges with "Bachman" below
      ['Mac', c.mac, 0, c.mac],
      ['TOTAL', 0, 0, 0],
      ['allergy', c.allergy, 0, c.allergy], // AFTER total → not a provider (warning)
      ['', '', '', ''],
      ['', 'Mon', 'Tues', 'Totals'], // block 2
      ['DATE', 45670, 45671, ''],
      ['Bachman', 0, c.bachman2, c.bachman2], // no space → merges with "Bachman " above
      ['TOTAL', 0, 0, 0],
    ],
  });
  w(usedrange, 'June Provier Totals .json')(provGrid({ lisa: 50, bachman: 30, bachman2: 4, mac: 20, allergy: 8 }));
  w(usedrange, 'May Provider Totals .json')(provGrid({ lisa: 45, bachman: 28, bachman2: 0, mac: 18, allergy: 7 }));

  // Prior-year file (YoY): one month tab → its values become the additive yearAgo.
  w(g, 'worksheets-prevyear.json')({ value: [{ name: 'June Totals Madison' }, { name: 'microsoft.com:RD' }] });
  w(usedrangePrev, 'June Totals Madison.json')(gridFor(PREV_JUNE));

  // ── Graph: workbook connection (MAD-26) — drive item a share-URL / drive path resolves to.
  // Synthetic refs only (no real drive). A connected read addresses item-9 → served the same
  // current-year worksheets/grids above (graph.js fixture routing defaults to current). ──
  w(g, 'driveitem.json')({ id: 'item-9', name: 'Madison Weekly Report.xlsx', parentReference: { driveId: 'drive-1' } });
}
