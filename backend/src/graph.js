import { config } from './config.js';
import { graphToken, appToken } from './auth.js';

const BASE = 'https://graph.microsoft.com/v1.0';

// ── App-only reads (team tasks) — use the app's Application permissions ────────
async function appGet(path) {
  const token = await appToken();
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (!res.ok) {
    const err = new Error(`Graph(app) GET ${path} → ${res.status}: ${await res.text()}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Resolve a UPN/email → { id, name, upn } (User.ReadBasic.All). Null if not found.
// Cached in memory — user IDs are stable, so we resolve each UPN only once.
const _userCache = new Map();
export async function resolveUser(upn) {
  const key = upn.toLowerCase();
  if (_userCache.has(key)) return _userCache.get(key);
  let val = null;
  try {
    const j = await appGet(`/users/${encodeURIComponent(upn)}?$select=id,displayName,userPrincipalName`);
    val = { id: j.id, name: j.displayName, upn: j.userPrincipalName };
  } catch { /* leave null */ }
  if (val) _userCache.set(key, val);
  return val;
}

// All of a user's To Do tasks across their lists (Tasks.Read.All, app-only). The
// per-list fetches run in PARALLEL and select only the fields we render.
export async function userTodoTasks(userId) {
  const lists = (await appGet(`/users/${userId}/todo/lists`)).value || [];
  // Only OPEN tasks — we never show/count completed ones, so skip them at the source
  // (smaller payload). NOTE: the To Do tasks endpoint rejects $select (400) but accepts
  // $filter + $top. $top=200 is one page (plenty of open items per list).
  const perList = await Promise.all(
    lists.map(async (l) => {
      const r = await appGet(`/users/${userId}/todo/lists/${encodeURIComponent(l.id)}/tasks?$filter=status%20ne%20'completed'&$top=200`);
      return (r.value || []).map((t) => ({ ...t, _list: l.displayName }));
    }),
  );
  return perList.flat();
}

// Read-only GET against Graph. The owner's mailbox: /me when MS_USER is blank, else /users/{upn}.
function root() {
  return config.graph.user ? `/users/${encodeURIComponent(config.graph.user)}` : '/me';
}

async function get(path) {
  const token = await graphToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    const err = new Error(`Graph GET ${path} → ${res.status}: ${await res.text()}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// ── Shared file (SharePoint / OneDrive-for-Business sharing link) ─────────────
// Encode a sharing URL the way Graph's /shares API expects: u! + base64url(url).
function encodeShareUrl(url) {
  const b64 = Buffer.from(url, 'utf8').toString('base64');
  return 'u!' + b64.replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
}

// Resolve a sharing link to its driveItem metadata (name + pre-authenticated download URL).
// Read-only. Returns { name, downloadUrl, sizeKB } or throws (err.status set on Graph errors).
export async function resolveShare(sharingUrl) {
  const meta = await get(
    `/shares/${encodeShareUrl(sharingUrl)}/driveItem?$select=name,size,@microsoft.graph.downloadUrl`,
  );
  return { name: meta.name, downloadUrl: meta['@microsoft.graph.downloadUrl'], sizeKB: Math.round((meta.size || 0) / 1024) };
}

// Download a shared file's bytes into a Buffer (parsed in memory, never written to disk).
export async function downloadShared(sharingUrl) {
  const { name, downloadUrl } = await resolveShare(sharingUrl);
  if (!downloadUrl) throw new Error('No download URL on shared item');
  const res = await fetch(downloadUrl); // pre-authenticated; no auth header needed
  if (!res.ok) throw new Error(`Shared file download → ${res.status}`);
  return { name, buffer: Buffer.from(await res.arrayBuffer()) };
}

// Inbox — important/recent messages.
export async function listMessages(top = 25) {
  const sel = 'from,subject,bodyPreview,receivedDateTime,isRead,importance,flag,body';
  const json = await get(
    `${root()}/messages?$top=${top}&$orderby=receivedDateTime desc&$select=${sel}`,
  );
  return json.value || [];
}

// Sent items in the lookback window — input to the awaiting-response engine.
export async function listSentItems(lookbackDays) {
  const since = new Date(Date.now() - lookbackDays * 86_400_000).toISOString();
  const sel = 'toRecipients,subject,sentDateTime,conversationId,conversationIndex';
  const json = await get(
    `${root()}/mailFolders('sentitems')/messages?$top=100&$orderby=sentDateTime desc` +
      `&$filter=sentDateTime ge ${since}&$select=${sel}`,
  );
  return json.value || [];
}

// Most recent message in a conversation — to test whether the recipient has replied.
// NOTE: Graph rejects $filter on conversationId combined with $orderby on a different
// field ("restriction/sort too complex"). So we filter only, then pick newest in JS.
export async function latestInConversation(conversationId) {
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
  const json = await get(
    `${root()}/calendarView?startDateTime=${startISO}&endDateTime=${endISO}` +
      `&$orderby=start/dateTime&$top=100&$select=${sel}`,
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

// Weekly spreadsheet — read a named range's values (2-D array).
export async function workbookNamedRange(name) {
  const path = config.graph.spreadsheetPath;
  if (!path) throw new Error('SPREADSHEET_DRIVE_PATH not configured');
  const json = await get(
    `${root()}/drive/root:${path}:/workbook/names/${encodeURIComponent(name)}/range?$select=values`,
  );
  return json.values || [];
}
