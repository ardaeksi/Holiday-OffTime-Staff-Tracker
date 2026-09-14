import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lookupUserByEmail } from '../functions/_lib/graphUsers.js';
import { withFetch } from './helpers.js';

const env = { AZURE_TENANT_ID: 't', AZURE_CLIENT_ID: 'c', AZURE_CLIENT_SECRET: 's' };

const TOKEN_HANDLER = ['login.microsoftonline.com', async () =>
  new Response(JSON.stringify({ access_token: 'fake-token', expires_in: 3600 }), { status: 200 })];

test('lookupUserByEmail: resolves displayName/mail/userPrincipalName on success', async () => {
  await withFetch([
    TOKEN_HANDLER,
    ['graph.microsoft.com/v1.0/users/', async () =>
      new Response(JSON.stringify({ displayName: 'Jane Smith', mail: 'jane@x.com', userPrincipalName: 'jane@x.com' }), { status: 200 })]
  ], async () => {
    const result = await lookupUserByEmail(env, 'jane@x.com');
    assert.deepEqual(result, { displayName: 'Jane Smith', mail: 'jane@x.com', userPrincipalName: 'jane@x.com' });
  });
});

test('lookupUserByEmail: returns null (not throws) when the account is not in this tenant', async () => {
  await withFetch([
    TOKEN_HANDLER,
    ['graph.microsoft.com/v1.0/users/', async () => new Response('not found', { status: 404 })]
  ], async () => {
    const result = await lookupUserByEmail(env, 'nobody@elsewhere.com');
    assert.equal(result, null);
  });
});

test('lookupUserByEmail: throws on any other failure (e.g. permission not granted yet)', async () => {
  await withFetch([
    TOKEN_HANDLER,
    ['graph.microsoft.com/v1.0/users/', async () => new Response('Forbidden', { status: 403 })]
  ], async () => {
    await assert.rejects(() => lookupUserByEmail(env, 'jane@x.com'), /Graph user lookup failed: 403/);
  });
});

test('lookupUserByEmail: URL-encodes the email into the request', async () => {
  let capturedUrl = null;
  await withFetch([
    TOKEN_HANDLER,
    ['graph.microsoft.com/v1.0/users/', async (url) => {
      capturedUrl = url;
      return new Response(JSON.stringify({ displayName: 'X' }), { status: 200 });
    }]
  ], async () => {
    await lookupUserByEmail(env, 'first.last+tag@x.com');
  });
  assert.ok(capturedUrl.includes(encodeURIComponent('first.last+tag@x.com')));
});
