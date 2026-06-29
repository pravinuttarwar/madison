import { config } from './config.js';
import { graphToken } from './auth.js';
import { loadFixture } from './fixtures.js';
import { workbookBase, workbookRef } from './workbook.js';

const BASE = 'https://graph.microsoft.com/v1.0';

// Read-only GET against Graph. The owner's mailbox: /me when MS_USER is blank, else /users/{upn}.
function root() {
  return config.graph.user ? `/users/${encodeURIComponent(config.graph.user)}` : '/me';
}

// TEST-ONLY (MBI-34): map a Graph request path to a synthetic upstream fixture. Order matters
// (more specific paths first). Each fixture mirrors the raw Graph JSON the live call returns.
function graphFixture(reqPath) {
  if (reqPath.includes("mailFolders('sentitems')")) return loadFixture('graph', 'sent.json');
  if (reqPath.includes('conversationId eq')) return loadFixture('graph', 'conversation.json');
  if (reqPath.includes('/calendarView')) return loadFixture('graph', 'calendar.json');
  if (/\/todo\/lists\/[^/]+\/tasks/.test(reqPath)) return loadFixture('graph', 'todo-tasks.json');
  if (reqPath.includes('/todo/lists')) return loadFixture('graph', 'todo-lists.json');
  // MAD-26 workbook connection: share-URL resolve, drive-path resolve, reachability check.
  if (reqPath.includes('/shares/')) return loadFixture('graph', 'driveitem.json');
  if (reqPath.includes('/workbook/worksheets')) return loadFixture('graph', 'worksheets.json');
  if (reqPath.includes('/drive/root:') && reqPath.includes('$select=id,name')) return loadFixture('graph', 'driveitem.json');
  const nr = reqPath.match(/\/workbook\/names\/([^/]+)\/range/);
  if (nr) return loadFixture('graph', 'names', `${decodeURIComponent(nr[1])}.json`);
  if (reqPath.startsWith('/me?$select=displayName')) return loadFixture('graph', 'me.json');
  if (reqPath.includes('/messages')) return loadFixture('graph', 'messages.json');
  throw new Error(`No graph fixture for path: ${reqPath}`);
}

async function get(path, extraHeaders = {}) {
  if (config.fixturesMode) return graphFixture(path);
  const token = await graphToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...extraHeaders },
  });
  if (!res.ok) throw new Error(`Graph GET ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

// Inbox — important/recent messages.
export async function listMessages(top = 25) {
  const sel = 'from,subject,bodyPreview,receivedDateTime,isRead,importance,flag,body';
  const json = await get(
    `${root()}/messages?$top=${top}&$orderby=receivedDateTime desc&$select=${sel}`,
  );
  return json.value || [];
}

// Sent items in the lookback window — input to the awaiting-response engine. We select the
// RFC threading signals (internetMessageId + the In-Reply-To/References headers) and
// conversationIndex so the engine can thread WITHOUT relying on conversationId (see
// awaiting.js). conversationId is still selected — used only to fetch a thread's messages.
export async function listSentItems(lookbackDays) {
  const since = new Date(Date.now() - lookbackDays * 86_400_000).toISOString();
  const sel =
    'toRecipients,subject,sentDateTime,conversationId,conversationIndex,' +
    'internetMessageId,internetMessageHeaders';
  const json = await get(
    `${root()}/mailFolders('sentitems')/messages?$top=100&$orderby=sentDateTime desc` +
      `&$filter=sentDateTime ge ${since}&$select=${sel}`,
  );
  return json.value || [];
}

// Most recent message in a thread — to test whether the recipient has replied. Threading
// (which sent items are the same conversation) is decided by RFC headers/conversationIndex
// in awaiting.js; here we only FETCH the thread's messages, for which conversationId is the
// one practical Graph filter. NOTE: Graph rejects $filter on conversationId combined with
// $orderby on a different field ("restriction/sort too complex") — so we filter, then pick
// the newest in JS.
export async function latestInThread(rep) {
  const conversationId = rep && rep.conversationId;
  if (!conversationId) return null;
  const sel = 'from,sentDateTime';
  const json = await get(
    `${root()}/messages?$top=25&$filter=conversationId eq '${conversationId}'&$select=${sel}`,
  );
  const msgs = json.value || [];
  msgs.sort((a, b) => new Date(b.sentDateTime) - new Date(a.sentDateTime));
  return msgs[0] || null;
}

// Calendar — events between start/end (ISO).
export async function calendarView(startISO, endISO) {
  // Pull everything the UI can render: time window, location, attendees + their
  // responses, a body preview (description), the online-meeting join link, organizer.
  const sel =
    'subject,start,end,location,attendees,isAllDay,bodyPreview,' +
    'isOnlineMeeting,onlineMeeting,onlineMeetingUrl,organizer,showAs';
  // Force UTC so event start/end come back as a known zone (Graph otherwise returns a
  // zoneless dateTime in the mailbox's zone); transforms.graphInstant reads it as UTC
  // and the UI renders it in the practice zone (TZ=America/New_York).
  const json = await get(
    `${root()}/calendarView?startDateTime=${startISO}&endDateTime=${endISO}` +
      `&$orderby=start/dateTime&$top=100&$select=${sel}`,
    { Prefer: 'outlook.timezone="UTC"' },
  );
  return json.value || [];
}

// Signed-in user profile — display name + mail.
export async function me() {
  const json = await get('/me?$select=displayName,mail');
  return { displayName: json.displayName || '', mail: json.mail || '' };
}

// Tasks — across the owner's To Do lists. (Multi-owner boards need Planner; see ARCHITECTURE.md.)
export async function listTodoTasks() {
  const lists = (await get(`${root()}/todo/lists`)).value || [];
  const all = [];
  for (const list of lists) {
    const tasks =
      (await get(`${root()}/todo/lists/${list.id}/tasks?$top=100`)).value || [];
    for (const t of tasks) all.push({ ...t, _list: list.displayName });
  }
  return all;
}

// ── MAD-26: workbook connection (resolve a pasted share-URL/path → a drive item) ──

// Encode a share-URL for Graph's /shares/{token} endpoint: un-padded base64url, 'u!' prefixed.
export function encodeShareUrl(shareUrl) {
  const b64 = Buffer.from(String(shareUrl), 'utf8')
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `u!${b64}`;
}

// Resolve a OneDrive/SharePoint share-URL → a drive-item reference (read-only).
export async function resolveShareUrl(shareUrl) {
  const json = await get(`/shares/${encodeShareUrl(shareUrl)}/driveItem?$select=id,name,parentReference`);
  return { driveId: json.parentReference?.driveId || '', itemId: json.id || '', name: json.name || '' };
}

// Resolve a drive path (e.g. /Reports/Weekly.xlsx) → a drive-item reference (read-only).
export async function resolveDrivePath(p) {
  const json = await get(`${root()}/drive/root:${p}:?$select=id,name,parentReference`);
  return { driveId: json.parentReference?.driveId || '', itemId: json.id || '', name: json.name || '' };
}

// Confirm read-only reachability — open the workbook (list one worksheet). Throws if unreadable.
export async function workbookReachable({ driveId, itemId }) {
  const base = driveId ? `/drives/${driveId}/items/${itemId}` : `${root()}/drive/items/${itemId}`;
  await get(`${base}/workbook/worksheets?$top=1&$select=name`);
  return true;
}

// Weekly spreadsheet — read a named range's values (2-D array). Reads address the CONNECTED
// drive item (MAD-26) when one is persisted, else fall back to the SPREADSHEET_DRIVE_PATH env.
export async function workbookNamedRange(name) {
  const base = workbookBase(workbookRef(), root(), config.graph.spreadsheetPath);
  const json = await get(
    `${base}/workbook/names/${encodeURIComponent(name)}/range?$select=values`,
  );
  return json.values || [];
}
