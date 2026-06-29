// MAD-15 — Microsoft Graph OAuth: the read-only delegated scope set and the authorize-URL
// builder, in one place so auth.js (refresh) and server.js (sign-in) can't drift apart.
//
// Scopes are READ-ONLY and minimal for Phase 1: Mail/Calendars/Tasks/Files read + the
// identity claims (openid/profile) + offline_access (so we get a refresh token). The
// conditional SharePoint/Planner scopes (Sites.Read.All / Group.Read.All) are intentionally
// NOT here — they belong to their own stories.
export const GRAPH_SCOPE = 'openid profile Mail.Read Calendars.Read Tasks.Read Files.Read offline_access';

// Build the Microsoft authorize URL for the sign-in redirect. Pure + testable.
// In production the tenant is PINNED to the practice's tenant (config MS_TENANT_ID); it
// only falls back to the multi-tenant 'common' endpoint when none is configured. The
// redirect URI is passed in so production can register its own HTTPS callback. The client
// SECRET never appears here — only the public client_id does (MAD-15, AC-1/AC-5).
export function buildAuthorizeUrl({ clientId, tenant, redirectUri, scope = GRAPH_SCOPE }) {
  const url = new URL(`https://login.microsoftonline.com/${tenant || 'common'}/oauth2/v2.0/authorize`);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', scope);
  url.searchParams.set('response_mode', 'query');
  url.searchParams.set('prompt', 'select_account');
  return url.toString();
}
