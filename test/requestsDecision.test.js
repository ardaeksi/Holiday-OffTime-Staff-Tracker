// Coverage for how "accepting" and denying a vacation request gets logged.
// This app doesn't write approve/deny into the shared auditLog array — it
// records the decision directly on the request itself (status, decidedAt,
// decidedByEmail[, denialReason]), which /api/requests/list?status=all and
// the Log modal both read as the source of truth for who accepted or denied
// what and when. deny.js had no test coverage at all before this file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost as approveRequest } from '../functions/api/requests/approve.js';
import { onRequestPost as denyRequest } from '../functions/api/requests/deny.js';
import { onRequestGet as listRequests } from '../functions/api/requests/list.js';
import { makeEnv, adminSession, staffSession, jsonRequest, withFetch, NOOP_GRAPH_HANDLERS } from './helpers.js';

const approveUrl = 'https://example.com/api/requests/approve';
const denyUrl = 'https://example.com/api/requests/deny';
const listUrl = 'https://example.com/api/requests/list?status=all';

function pendingRequest(overrides = {}) {
  return {
    id: 'r1', category: 'instructors', personId: 'p1', personName: 'Jane',
    submittedByEmail: 'jane@x.com', leaveType: 'vacation',
    startDate: '2026-04-01', endDate: '2026-04-01', note: '', worksSaturday: false,
    halfDay: false, halfDayFrom: '', status: 'pending', createdAt: 1,
    decidedAt: null, decidedByEmail: null, denialReason: null,
    ...overrides
  };
}

function seedWith(request) {
  return {
    instructors: [{ id: 'p1', name: 'Jane', email: 'jane@x.com', vacations: [] }],
    employees: [], requests: [request], auditLog: [], notifyOptOuts: []
  };
}

// ── approve ──────────────────────────────────────────────
test('approve: rejects unauthenticated and non-admin requests', async () => {
  const env = makeEnv({ seed: seedWith(pendingRequest()) });
  const anon = await approveRequest({ request: jsonRequest(approveUrl, { requestId: 'r1' }), env, data: { session: null } });
  assert.equal(anon.status, 401);
  const staff = await approveRequest({ request: jsonRequest(approveUrl, { requestId: 'r1' }), env, data: staffSession() });
  assert.equal(staff.status, 403);
});

test('approve: 400 when requestId is missing, 404 when the request does not exist', async () => {
  const env = makeEnv({ seed: seedWith(pendingRequest()) });
  const missing = await approveRequest({ request: jsonRequest(approveUrl, {}), env, data: adminSession() });
  assert.equal(missing.status, 400);
  const notFound = await approveRequest({ request: jsonRequest(approveUrl, { requestId: 'nope' }), env, data: adminSession() });
  assert.equal(notFound.status, 404);
});

test('approve: records who approved it and when', async () => {
  const env = makeEnv({ seed: seedWith(pendingRequest()) });
  const before = Date.now();
  await withFetch(NOOP_GRAPH_HANDLERS, () =>
    approveRequest({ request: jsonRequest(approveUrl, { requestId: 'r1' }), env, data: adminSession('boss@canadianallcare.com') })
  );
  const stored = env.TRACKER_KV._dump();
  const req = stored.requests[0];
  assert.equal(req.status, 'approved');
  assert.equal(req.decidedByEmail, 'boss@canadianallcare.com');
  assert.ok(req.decidedAt >= before);
});

test('approve: a request already decided cannot be approved again, and its decision record does not change', async () => {
  const decided = pendingRequest({ status: 'approved', decidedAt: 111, decidedByEmail: 'first@x.com' });
  const env = makeEnv({ seed: seedWith(decided) });
  const resp = await approveRequest({ request: jsonRequest(approveUrl, { requestId: 'r1' }), env, data: adminSession('second@x.com') });
  assert.equal(resp.status, 409);
  const stored = env.TRACKER_KV._dump();
  assert.equal(stored.requests[0].decidedByEmail, 'first@x.com');
  assert.equal(stored.requests[0].decidedAt, 111);
});

test('approve: 404 when the linked person record was deleted before the request was decided', async () => {
  const env = makeEnv({
    seed: {
      instructors: [], employees: [],
      requests: [pendingRequest()], auditLog: [], notifyOptOuts: []
    }
  });
  const resp = await approveRequest({ request: jsonRequest(approveUrl, { requestId: 'r1' }), env, data: adminSession() });
  assert.equal(resp.status, 404);
});

test('approve: a first-time requester (no personId) requires a category and creates + links the person', async () => {
  const env = makeEnv({
    seed: {
      instructors: [], employees: [],
      requests: [pendingRequest({ personId: null, category: null, personName: 'New Person', submittedByEmail: 'new@x.com' })],
      auditLog: [], notifyOptOuts: []
    }
  });
  const missingCategory = await approveRequest({ request: jsonRequest(approveUrl, { requestId: 'r1' }), env, data: adminSession() });
  assert.equal(missingCategory.status, 400);

  await withFetch(NOOP_GRAPH_HANDLERS, () =>
    approveRequest({ request: jsonRequest(approveUrl, { requestId: 'r1', category: 'employees' }), env, data: adminSession('boss@x.com') })
  );
  const stored = env.TRACKER_KV._dump();
  assert.equal(stored.employees.length, 1);
  assert.equal(stored.requests[0].status, 'approved');
  assert.equal(stored.requests[0].decidedByEmail, 'boss@x.com');
  assert.equal(stored.requests[0].personId, stored.employees[0].id);
});

// ── deny ─────────────────────────────────────────────────
test('deny: rejects unauthenticated and non-admin requests', async () => {
  const env = makeEnv({ seed: seedWith(pendingRequest()) });
  const anon = await denyRequest({ request: jsonRequest(denyUrl, { requestId: 'r1', reason: 'No coverage' }), env, data: { session: null } });
  assert.equal(anon.status, 401);
  const staff = await denyRequest({ request: jsonRequest(denyUrl, { requestId: 'r1', reason: 'No coverage' }), env, data: staffSession() });
  assert.equal(staff.status, 403);
});

test('deny: requires both requestId and a non-blank reason', async () => {
  const env = makeEnv({ seed: seedWith(pendingRequest()) });
  const noId = await denyRequest({ request: jsonRequest(denyUrl, { reason: 'No coverage' }), env, data: adminSession() });
  assert.equal(noId.status, 400);
  const noReason = await denyRequest({ request: jsonRequest(denyUrl, { requestId: 'r1' }), env, data: adminSession() });
  assert.equal(noReason.status, 400);
  const blankReason = await denyRequest({ request: jsonRequest(denyUrl, { requestId: 'r1', reason: '   ' }), env, data: adminSession() });
  assert.equal(blankReason.status, 400);
});

test('deny: 404 when the request does not exist', async () => {
  const env = makeEnv({ seed: seedWith(pendingRequest()) });
  const resp = await denyRequest({ request: jsonRequest(denyUrl, { requestId: 'nope', reason: 'No coverage' }), env, data: adminSession() });
  assert.equal(resp.status, 404);
});

test('deny: records who denied it, when, and why (reason trimmed and capped at 500 chars)', async () => {
  const env = makeEnv({ seed: seedWith(pendingRequest()) });
  const longReason = '  ' + 'x'.repeat(600) + '  ';
  const before = Date.now();
  const resp = await denyRequest({
    request: jsonRequest(denyUrl, { requestId: 'r1', reason: longReason }),
    env, data: adminSession('boss@canadianallcare.com')
  });
  assert.equal(resp.status, 200);
  const stored = env.TRACKER_KV._dump();
  const req = stored.requests[0];
  assert.equal(req.status, 'denied');
  assert.equal(req.decidedByEmail, 'boss@canadianallcare.com');
  assert.ok(req.decidedAt >= before);
  assert.equal(req.denialReason.length, 500);
  assert.equal(req.denialReason, 'x'.repeat(500));
});

test('deny: a request already decided cannot be denied again, and its decision record does not change', async () => {
  const decided = pendingRequest({ status: 'denied', decidedAt: 111, decidedByEmail: 'first@x.com', denialReason: 'original' });
  const env = makeEnv({ seed: seedWith(decided) });
  const resp = await denyRequest({ request: jsonRequest(denyUrl, { requestId: 'r1', reason: 'second try' }), env, data: adminSession('second@x.com') });
  assert.equal(resp.status, 409);
  const stored = env.TRACKER_KV._dump();
  assert.equal(stored.requests[0].decidedByEmail, 'first@x.com');
  assert.equal(stored.requests[0].denialReason, 'original');
});

// ── surfaced to the Log via requests/list?status=all ────────────────────
test('requests/list?status=all: decided requests carry decidedByEmail/decidedAt through to the admin Log view', async () => {
  const env = makeEnv({ seed: seedWith(pendingRequest()) });
  await withFetch(NOOP_GRAPH_HANDLERS, () =>
    approveRequest({ request: jsonRequest(approveUrl, { requestId: 'r1' }), env, data: adminSession('boss@x.com') })
  );
  const resp = await listRequests({ request: new Request(listUrl), env, data: adminSession() });
  assert.equal(resp.status, 200);
  const { requests } = await resp.json();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].status, 'approved');
  assert.equal(requests[0].decidedByEmail, 'boss@x.com');
});
