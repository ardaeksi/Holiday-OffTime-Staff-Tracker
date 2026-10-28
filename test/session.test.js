import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signSession, getSession, COOKIE_NAME } from '../functions/_lib/session.js';

const SECRET = 'test-session-secret';
const env = { SESSION_SECRET: SECRET };

function reqWithCookie(token) {
  return new Request('https://example.test/api/data', {
    headers: { Cookie: `${COOKIE_NAME}=${encodeURIComponent(token)}` }
  });
}

test('a real session token is accepted', async () => {
  const token = await signSession({ email: 'a@x.com', role: 'staff', exp: Date.now() + 60_000 }, SECRET);
  const s = await getSession(reqWithCookie(token), env);
  assert.equal(s.email, 'a@x.com');
});

test('an unsubscribe token is NOT accepted as a login session', async () => {
  const token = await signSession(
    { email: 'admin@x.com', purpose: 'notifyUnsub', exp: Date.now() + 10 * 365 * 24 * 3600 * 1000 },
    SECRET
  );
  assert.equal(await getSession(reqWithCookie(token), env), null);
});

test('a signed token with no valid role is rejected', async () => {
  const token = await signSession({ email: 'a@x.com', role: 'superuser', exp: Date.now() + 60_000 }, SECRET);
  assert.equal(await getSession(reqWithCookie(token), env), null);
});

test('a token signed with a different secret is rejected', async () => {
  const token = await signSession({ email: 'a@x.com', role: 'admin', exp: Date.now() + 60_000 }, 'other-secret');
  assert.equal(await getSession(reqWithCookie(token), env), null);
});
