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

// metricKey → workbook named-range name (drives the 12 weekly report metrics).
const RANGE_NAMES = {
  newPatients: 'NewPatients', medicalSeen: 'MedicalSeen', n1: 'N1', chiroSeen: 'ChiroSeen',
  adminCodes: 'AdminCodes', allergyTests: 'AllergyTests', allergyKits: 'AllergyKits',
  recoveryNew: 'RecoveryNew', recoveryAll: 'RecoveryAll', pod: 'Pod', acu: 'Acu', procedures: 'Procedures',
};

// MAD-29: prior-year named ranges (same metrics, last year) → drives the YoY comparison.
const PREV_YEAR_RANGE_NAMES = Object.fromEntries(
  Object.entries(RANGE_NAMES).map(([k, name]) => [k, `${name}PrevYear`]),
);

// Env the spawned server needs for the live path to read these fixtures.
export const FIXTURE_ENV = {
  MS_USER,
  SPREADSHEET_NAMED_RANGES: JSON.stringify(RANGE_NAMES),
  // MAD-29: prior-year ranges → /api/reports adds an additive yearAgo per metric.
  SPREADSHEET_PREV_YEAR_RANGES: JSON.stringify(PREV_YEAR_RANGE_NAMES),
  // workbookNamedRange() requires a configured path before it reads (the fixtures seam
  // ignores the value). Synthetic — never a real drive path.
  SPREADSHEET_DRIVE_PATH: '/synthetic/Madison Weekly Report.xlsx',
};

const DAY = 86_400_000;
const p2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

export function writeFixtures(dir, now = new Date()) {
  const g = join(dir, 'graph');
  const q = join(dir, 'qbo');
  const names = join(g, 'names');
  mkdirSync(names, { recursive: true });
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

  // ── Graph: workbook named ranges → [[last, prior]] (drives 12 weekly metrics) ──
  const RANGE_VALUES = {
    NewPatients: [22, 18], MedicalSeen: [284, 271], N1: [187, 192], ChiroSeen: [612, 598],
    AdminCodes: [94, 88], AllergyTests: [14, 11], AllergyKits: [9, 12], RecoveryNew: [17, 13],
    RecoveryAll: [142, 129], Pod: [78, 82], Acu: [56, 61], Procedures: [31, 28],
  };
  for (const [name, [last, prior]] of Object.entries(RANGE_VALUES)) {
    w(names, `${name}.json`)({ values: [[last, prior]] });
  }

  // MAD-29: prior-year value per metric (a single cell) → drives the additive yearAgo.
  // Synthetic: ~90% of last-week as the year-ago figure, so YoY deltas are non-trivial.
  for (const [name, [last]] of Object.entries(RANGE_VALUES)) {
    w(names, `${name}PrevYear.json`)({ values: [[Math.round(last * 0.9)]] });
  }

  // ── Graph: workbook connection (MAD-26) — drive item a share-URL / drive path resolves to,
  // and a worksheet list proving read-only reachability. Synthetic refs only (no real drive). ──
  w(g, 'driveitem.json')({ id: 'item-9', name: 'Madison Weekly Report.xlsx', parentReference: { driveId: 'drive-1' } });
  w(g, 'worksheets.json')({ value: [{ name: 'Week' }] });
}
