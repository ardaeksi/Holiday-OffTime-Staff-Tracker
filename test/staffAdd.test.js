import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../functions/api/staff/add.js';
import { makeEnv, adminSession, staffSession, jsonRequest, withFetch } from './helpers.js';

const URL = 'https://example.com/api/staff/add';
const TOKEN_HANDLER = ['login.microsoftonline.com', async () =>
  new Response(JSON.stringify({ access_token: 'fake-token', expires_in: 3600 }), { status: 200 })];

function graphFound(displayName) {
  return ['graph.microsoft.com/v1.0/users/', async () => new Response(JSON.stringify({ displayName, mail: '', userPrincipalName: '' }), { status: 200 })];
}
function graphNotFound() {
  return ['graph.microsoft.com/v1.0/users/', async () => new Response('not found', { status: 404 })];
}

test('staff/add: rejects unauthenticated and non-admin requests', async () => {
  const env = makeEnv();
  const anon = await onRequestPost({ request: jsonRequest(URL, {}), env, data: { session: null } });
  assert.equal(anon.status, 401);

  const staff = await onRequestPost({ request: jsonRequest(URL, {}), env, data: staffSession() });
  assert.equal(staff.status, 403);
});

test('staff/add: validates email format and category', async () => {
  const env = makeEnv();
  const badEmail = await onRequestPost({ request: jsonRequest(URL, { email: 'not-an-email', category: 'instructors' }), env, data: adminSession() });
  assert.equal(badEmail.status, 400);
  assert.equal((await badEmail.json()).error, 'invalid_email');

  const badCategory = await onRequestPost({ request: jsonRequest(URL, { email: 'a@x.com', category: 'managers' }), env, data: adminSession() });
  assert.equal(badCategory.status, 400);
  assert.equal((await badCategory.json()).error, 'invalid_category');
});

test('staff/add: creates a person with 0 vacations, name resolved via Graph', async () => {
  const env = makeEnv();
  await withFetch([TOKEN_HANDLER, graphFound('Jane Smith')], async () => {
    const resp = await onRequestPost({
      request: jsonRequest(URL, { email: 'Jane@CanadianAllCare.com', category: 'instructors' }),
      env, data: adminSession()
    });
    assert.equal(resp.status, 201);
    const body = await resp.json();
    assert.equal(body.person.name, 'Jane Smith');
    assert.equal(body.person.email, 'jane@canadianallcare.com'); // lowercased
    assert.deepEqual(body.person.vacations, []);
  });

  const stored = env.TRACKER_KV._dump();
  assert.equal(stored.instructors.length, 1);
  assert.equal(stored.instructors[0].name, 'Jane Smith');
});

test('staff/add: 404 from Graph asks for a manual name instead of failing outright', async () => {
  const env = makeEnv();
  await withFetch([TOKEN_HANDLER, graphNotFound()], async () => {
    const resp = await onRequestPost({
      request: jsonRequest(URL, { email: 'ghost@elsewhere.com', category: 'employees' }),
      env, data: adminSession()
    });
    assert.equal(resp.status, 404);
    assert.equal((await resp.json()).error, 'not_found');
  });
  // Nothing was created on the failed lookup.
  assert.equal(env.TRACKER_KV._dump(), null);

  // Client retries with an explicit name (as the UI does on `not_found`) — no
  // Graph call needed this time since `name` is provided.
  const resp2 = await onRequestPost({
    request: jsonRequest(URL, { email: 'ghost@elsewhere.com', category: 'employees', name: 'Casper Ghost' }),
    env, data: adminSession()
  });
  assert.equal(resp2.status, 201);
  const stored = env.TRACKER_KV._dump();
  assert.equal(stored.employees[0].name, 'Casper Ghost');
});

test('staff/add: rejects a duplicate email, naming the existing person', async () => {
  const env = makeEnv({
    seed: {
      instructors: [{ id: 'p1', name: 'Existing Person', email: 'dup@x.com', vacations: [] }],
      employees: [], requests: [], auditLog: [], notifyOptOuts: []
    }
  });
  const resp = await onRequestPost({
    request: jsonRequest(URL, { email: 'DUP@X.com', category: 'employees', name: 'Someone Else' }),
    env, data: adminSession()
  });
  assert.equal(resp.status, 409);
  const body = await resp.json();
  assert.equal(body.error, 'already_exists');
  assert.match(body.message, /Existing Person/);
});
