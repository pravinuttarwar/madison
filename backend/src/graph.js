import { config } from './config.js';
import { graphToken } from './auth.js';

const BASE = 'https://graph.microsoft.com/v1.0';

// Read-only GET against Graph. The owner's mailbox: /me when MS_USER is blank, else /users/{upn}.
function root() {
  return config.graph.user ? `/users/${encodeURIComponent(config.graph.user)}` : '/me';
}

async function get(path) {
  const token = await graphToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
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
