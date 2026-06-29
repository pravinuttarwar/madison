// MAD-26 — Graph share-URL encoding. Microsoft Graph's /shares/{token} endpoint takes a
// share-URL encoded as un-padded base64url with a 'u!' prefix. Pin that transform so a
// pasted SharePoint/OneDrive URL resolves correctly. Pure + synthetic — no network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeShareUrl } from '../src/graph.js';

test('[AC-1] encodeShareUrl produces the u! base64url share token (padding stripped, +/ → -_)', () => {
  const url = 'https://contoso.sharepoint.com/:x:/s/ops/EabcWeekly.xlsx?e=tok';
  const token = encodeShareUrl(url);
  assert.ok(token.startsWith('u!'), 'has the u! prefix');
  assert.doesNotMatch(token, /=/, 'base64 padding is stripped');
  assert.doesNotMatch(token.slice(2), /[+/]/, 'url-unsafe + and / are replaced');
  // Round-trips back to the original URL when decoded as base64url.
  const decoded = Buffer.from(token.slice(2).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  assert.equal(decoded, url);
});
