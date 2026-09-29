// Archiving ex-staff (instructors and office employees): what happens to
// their record, their requests, and every other endpoint that can touch them
// once they're archived — and that unarchiving brings everything back intact.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost as archive } from '../functions/api/staff/archive.js';
import { onRequestPost as unarchive } from '../functions/api/staff/unarchive.js';
import { onRequestPost as addStaff } from '../functions/api/staff/add.js';
import { onRequestPost as deleteStaff } from '../functions/api/staff/delete.js';
import { onRequestPost as submitRequest } from '../functions/api/requests/submit.js';
import { onRequestPost as approveRequest } from '../functions/api/requests/approve.js';
import { onRequestPost as denyRequest } from '../functions/api/requests/deny.js';
import { onRequestGet as myRequests } from '../functions/api/requests/mine.js';
import { onRequestGet as getData, onRequestPost as saveData } from '../functions/api/data.js';
import { onRequestGet as me } from '../functions/api/auth/me.js';
import { onRequestGet as auditList } from '../functions/api/audit/list.js';
import { migrate, findPersonByEmail } from '../functions/_lib/store.js';
import { makeEnv, adminSession, staffSession, jsonRequest, withFetch, NOOP_GRAPH_HANDLERS } from './helpers.js';

const BASE = 'https://example.com';

function vac(id, startDate, endDate, extra = {}) {
  return { id, leaveType: 'vacation', startDate, endDate, ...extra };
}

function seedStore(overrides = {}) {
  return {
    instructors: [
      { id: 'i1', name: 'Ian Leaving', email: 'ian@x.com', vacations: [vac('v1', '2026-03-02', '2026-03-06', { fromRequestId: 'r-approved' })] },
      { id: 'i2', name: 'Ivy Staying', email: 'ivy@x.com', vacations: [vac('v2', '2026-04-06', '2026-04-07')] }
    ],
    employees: [
      { id: 'e1', name: 'Eve Office', email: 'eve@x.com', vacations: [] }
    ],
    requests: [
      { id: 'r-approved', personId: 'i1', category: 'instructors', personName: 'Ian Leaving', submittedByEmail: 'ian@x.com', status: 'approved', startDate: '2026-03-02', endDate: '2026-03-06', createdAt: 1 },
      { id: 'r-pending', personId: 'i1', category: 'instructors', personName: 'Ian Leaving', submittedByEmail: 'ian@x.com', status: 'pending', startDate: '2026-11-02', endDate: '2026-11-06', createdAt: 2 },
      { id: 'r-other', personId: 'i2', category: 'instructors', personName: 'Ivy Staying', submittedByEmail: 'ivy@x.com', status: 'pending', startDate: '2026-11-02', endDate: '2026-11-03', createdAt: 3 }
    ],
    auditLog: [],
    notifyOptOuts: ['optedout-admin@x.com'],
    ...overrides
  };
}

const call = (handler, path, body, session) =>
  withFetch(NOOP_GRAPH_HANDLERS, () => handler({ request: jsonRequest(BASE + path, body), env: session.env, data: session.data }));

async function archiveIan(env, adminEmail = 'boss@x.com') {
  return archive({ request: jsonRequest(BASE + '/api/staff/archive', { personId: 'i1', category: 'instructors' }), env, data: adminSession(adminEmail) });
}

// ── archive / unarchive endpoints ─────────────────────────
test('archive: only admins can archive or unarchive', async () => {
  const env = makeEnv({ seed: seedStore() });
  const body = { personId: 'i1', category: 'instructors' };
  assert.equal((await archive({ request: jsonRequest(BASE, body), env, data: { session: null } })).status, 401);
  assert.equal((await archive({ request: jsonRequest(BASE, body), env, data: staffSession('ian@x.com') })).status, 403);
  assert.equal((await unarchive({ request: jsonRequest(BASE, body), env, data: staffSession('ian@x.com') })).status, 403);
  assert.equal(env.TRACKER_KV._dump().instructors[0].archived, undefined, 'nothing was written');
});

test('archive: validates input and 404s for an unknown person', async () => {
  const env = makeEnv({ seed: seedStore() });
  assert.equal((await archive({ request: jsonRequest(BASE, { personId: 'i1' }), env, data: adminSession() })).status, 400);
  assert.equal((await archive({ request: jsonRequest(BASE, { personId: 'i1', category: 'bogus' }), env, data: adminSession() })).status, 400);
  assert.equal((await archive({ request: jsonRequest(BASE, { personId: 'nope', category: 'instructors' }), env, data: adminSession() })).status, 404);
  // Right id, wrong category — must not archive someone by id alone.
  assert.equal((await archive({ request: jsonRequest(BASE, { personId: 'i1', category: 'employees' }), env, data: adminSession() })).status, 404);
});

test('archive: flags the record and keeps every vacation, request and field intact', async () => {
  const env = makeEnv({ seed: seedStore() });
  const before = Date.now();
  const resp = await archiveIan(env);
  assert.equal(resp.status, 200);

  const stored = env.TRACKER_KV._dump();
  const ian = stored.instructors.find(p => p.id === 'i1');
  assert.equal(ian.archived, true);
  assert.equal(ian.archivedByEmail, 'boss@x.com');
  assert.ok(ian.archivedAt >= before);
  // Still in the same list, same id, same email, same history — nothing moved or dropped.
  assert.equal(stored.instructors.length, 2);
  assert.equal(ian.email, 'ian@x.com');
  assert.deepEqual(ian.vacations.map(v => v.id), ['v1']);
  assert.equal(stored.requests.length, 3);
  assert.equal(stored.requests.find(r => r.id === 'r-approved').status, 'approved');
  // Unrelated data untouched.
  assert.deepEqual(stored.notifyOptOuts, ['optedout-admin@x.com']);
  assert.equal(stored.instructors.find(p => p.id === 'i2').archived, false);
});

test('archive: auto-closes only that person\'s pending requests, with who/when/why', async () => {
  const env = makeEnv({ seed: seedStore() });
  const resp = await archiveIan(env);
  const j = await resp.json();
  assert.equal(j.closedRequestCount, 1);

  const stored = env.TRACKER_KV._dump();
  const closed = stored.requests.find(r => r.id === 'r-pending');
  assert.equal(closed.status, 'denied');
  assert.equal(closed.autoClosed, true);
  assert.match(closed.denialReason, /archived/i);
  assert.equal(closed.decidedByEmail, 'boss@x.com');
  assert.equal(typeof closed.decidedAt, 'number');
  // Someone else's pending request is not touched.
  assert.equal(stored.requests.find(r => r.id === 'r-other').status, 'pending');
});

test('archive: also closes a pending first-time request (no personId yet) submitted from their email', async () => {
  const seed = seedStore();
  seed.requests.push({ id: 'r-first', personId: null, category: null, personName: 'Ian Leaving', submittedByEmail: 'IAN@x.com', status: 'pending', startDate: '2026-12-01', endDate: '2026-12-02', createdAt: 4 });
  const env = makeEnv({ seed });
  const j = await (await archiveIan(env)).json();
  assert.equal(j.closedRequestCount, 2);
  assert.equal(env.TRACKER_KV._dump().requests.find(r => r.id === 'r-first').status, 'denied');
});

test('archive: writes a person-archived audit entry, and the Log lists it newest-first', async () => {
  const env = makeEnv({ seed: seedStore({ auditLog: [{ id: 'old', type: 'person-added', personName: 'X', addedAt: 1 }] }) });
  await archiveIan(env, 'boss@x.com');
  const stored = env.TRACKER_KV._dump();
  const entry = stored.auditLog.find(a => a.type === 'person-archived');
  assert.ok(entry);
  assert.equal(entry.personId, 'i1');
  assert.equal(entry.personName, 'Ian Leaving');
  assert.equal(entry.category, 'instructors');
  assert.equal(entry.vacationCount, 1);
  assert.equal(entry.closedRequestCount, 1);
  assert.equal(entry.archivedByEmail, 'boss@x.com');

  const log = await (await auditList({ env, data: adminSession() })).json();
  assert.equal(log.entries[0].type, 'person-archived', 'sorted by archivedAt, newest first');
});

test('archive: archiving twice is a 409, not a second audit entry', async () => {
  const env = makeEnv({ seed: seedStore() });
  await archiveIan(env);
  const again = await archiveIan(env);
  assert.equal(again.status, 409);
  assert.equal(env.TRACKER_KV._dump().auditLog.filter(a => a.type === 'person-archived').length, 1);
});

test('archive: works the same for office employees', async () => {
  const env = makeEnv({ seed: seedStore() });
  const resp = await archive({ request: jsonRequest(BASE, { personId: 'e1', category: 'employees' }), env, data: adminSession() });
  assert.equal(resp.status, 200);
  assert.equal(env.TRACKER_KV._dump().employees[0].archived, true);
});

test('unarchive: restores the person with all history; auto-closed requests stay closed; logs it', async () => {
  const env = makeEnv({ seed: seedStore() });
  await archiveIan(env);
  const resp = await unarchive({ request: jsonRequest(BASE, { personId: 'i1', category: 'instructors' }), env, data: adminSession('hr@x.com') });
  assert.equal(resp.status, 200);

  const stored = env.TRACKER_KV._dump();
  const ian = stored.instructors.find(p => p.id === 'i1');
  assert.equal(ian.archived, false);
  assert.equal(ian.archivedAt, undefined);
  assert.equal(ian.archivedByEmail, undefined);
  assert.deepEqual(ian.vacations.map(v => v.id), ['v1']);
  assert.equal(stored.requests.find(r => r.id === 'r-pending').status, 'denied');

  const entry = stored.auditLog.find(a => a.type === 'person-unarchived');
  assert.equal(entry.unarchivedByEmail, 'hr@x.com');
  assert.equal(typeof entry.unarchivedAt, 'number');
});

test('unarchive: 409 for someone who is not archived; 404 for someone who does not exist', async () => {
  const env = makeEnv({ seed: seedStore() });
  assert.equal((await unarchive({ request: jsonRequest(BASE, { personId: 'i2', category: 'instructors' }), env, data: adminSession() })).status, 409);
  assert.equal((await unarchive({ request: jsonRequest(BASE, { personId: 'nope', category: 'instructors' }), env, data: adminSession() })).status, 404);
});

test('unarchive: refused if another active record now uses the same sign-in email', async () => {
  const env = makeEnv({ seed: seedStore() });
  await archiveIan(env);
  // Someone later gave another active record Ian's email (e.g. via ✎ Edit).
  const s = env.TRACKER_KV._dump();
  s.employees[0].email = 'ian@x.com';
  await env.TRACKER_KV.put('tracker-data', JSON.stringify(s));

  const resp = await unarchive({ request: jsonRequest(BASE, { personId: 'i1', category: 'instructors' }), env, data: adminSession() });
  assert.equal(resp.status, 409);
  assert.match((await resp.json()).error, /Eve Office/);
  assert.equal(env.TRACKER_KV._dump().instructors[0].archived, true, 'still archived');
});

// ── the ex-employee's own experience ──────────────────────
test('scenario: an archived ex-employee submits a time-off request → 403, nothing stored, no admin email sent', async () => {
  const env = makeEnv({ seed: seedStore(), ADMIN_EMAILS: 'boss@x.com', GRAPH_SENDER_EMAIL: 'noreply@x.com' });
  await archiveIan(env);
  const requestsBefore = env.TRACKER_KV._dump().requests.length;

  let mailSent = false;
  const resp = await withFetch([
    ['sendMail', async () => { mailSent = true; return new Response('', { status: 202 }); }],
    ...NOOP_GRAPH_HANDLERS
  ], () => submitRequest({
    request: jsonRequest(BASE + '/api/requests/submit', { startDate: '2026-12-07', endDate: '2026-12-08', leaveType: 'vacation' }),
    env, data: staffSession('ian@x.com')
  }));

  assert.equal(resp.status, 403);
  const j = await resp.json();
  assert.equal(j.code, 'archived');
  assert.match(j.error, /archived/i);
  assert.equal(env.TRACKER_KV._dump().requests.length, requestsBefore);
  assert.equal(mailSent, false);
});

test('scenario: the email match is case-insensitive, so a differently-cased sign-in is still blocked', async () => {
  const env = makeEnv({ seed: seedStore() });
  await archiveIan(env);
  const resp = await call(submitRequest, '/api/requests/submit',
    { startDate: '2026-12-07', endDate: '2026-12-08' },
    { env, data: staffSession('Ian@X.com') });
  assert.equal(resp.status, 403);
});

test('scenario: after unarchiving, the same person can submit requests again', async () => {
  const env = makeEnv({ seed: seedStore() });
  await archiveIan(env);
  await unarchive({ request: jsonRequest(BASE, { personId: 'i1', category: 'instructors' }), env, data: adminSession() });
  const resp = await call(submitRequest, '/api/requests/submit',
    { startDate: '2026-12-07', endDate: '2026-12-08' },
    { env, data: staffSession('ian@x.com') });
  assert.equal(resp.status, 201);
  const req = (await resp.json()).request;
  assert.equal(req.personId, 'i1', 'linked to the original record, not a new one');
});

test('scenario: an archived ex-employee signing in still sees their own history, flagged archived', async () => {
  const env = makeEnv({ seed: seedStore() });
  await archiveIan(env);

  const who = await (await me({ env, data: { session: { role: 'staff', email: 'ian@x.com', name: 'Ian' } } })).json();
  assert.deepEqual(who.person, { id: 'i1', name: 'Ian Leaving', category: 'instructors', archived: true });

  const d = await (await getData({ env, data: staffSession('ian@x.com') })).json();
  assert.equal(d.instructors.length, 1);
  assert.equal(d.instructors[0].id, 'i1');
  assert.equal(d.instructors[0].archived, true);
  assert.equal(d.employees.length, 0, 'still only their own record, never the roster');

  const mine = await (await myRequests({ env, data: staffSession('ian@x.com') })).json();
  const closed = mine.requests.find(r => r.id === 'r-pending');
  assert.equal(closed.status, 'denied');
  assert.match(closed.denialReason, /archived/i, 'they can see why their pending request was closed');
});

// ── admin actions that could touch an archived person ─────
test('scenario: approving a stale pending request for an archived person → 409, no vacation added', async () => {
  const env = makeEnv({ seed: seedStore() });
  // Simulate a request left pending on an already-archived record (e.g. data
  // from before auto-close, or a race with a stale admin tab).
  const s = migrate(seedStore());
  s.instructors[0].archived = true;
  await env.TRACKER_KV.put('tracker-data', JSON.stringify(s));

  const resp = await call(approveRequest, '/api/requests/approve', { requestId: 'r-pending' }, { env, data: adminSession() });
  assert.equal(resp.status, 409);
  const stored = env.TRACKER_KV._dump();
  assert.equal(stored.instructors[0].vacations.length, 1);
  assert.equal(stored.requests.find(r => r.id === 'r-pending').status, 'pending');
});

test('scenario: approving a first-time request whose email belongs to an archived person → 409, no duplicate record', async () => {
  const seed = migrate(seedStore());
  seed.instructors[0].archived = true;
  seed.requests.push({ id: 'r-first', personId: null, category: null, personName: 'Ian Leaving', submittedByEmail: 'ian@x.com', status: 'pending', startDate: '2026-12-01', endDate: '2026-12-02', createdAt: 4 });
  const env = makeEnv({ seed });
  const resp = await call(approveRequest, '/api/requests/approve', { requestId: 'r-first', category: 'employees' }, { env, data: adminSession() });
  assert.equal(resp.status, 409);
  const stored = env.TRACKER_KV._dump();
  assert.equal(stored.employees.length, 1, 'no second profile created');
  assert.equal(stored.instructors.length, 2);
});

test('scenario: denying a stale pending request for an archived person still works', async () => {
  const s = migrate(seedStore());
  s.instructors[0].archived = true;
  const env = makeEnv({ seed: s });
  const resp = await denyRequest({ request: jsonRequest(BASE, { requestId: 'r-pending', reason: 'No longer employed' }), env, data: adminSession() });
  assert.equal(resp.status, 200);
});

test('scenario: re-adding a rehired ex-employee by email points the admin to Unarchive instead of creating a duplicate', async () => {
  const env = makeEnv({ seed: seedStore() });
  await archiveIan(env);
  const resp = await call(addStaff, '/api/staff/add', { email: 'IAN@x.com', category: 'employees', name: 'Ian Again' }, { env, data: adminSession() });
  assert.equal(resp.status, 409);
  const j = await resp.json();
  assert.equal(j.error, 'archived');
  assert.equal(j.personId, 'i1');
  assert.equal(j.category, 'instructors');
  assert.match(j.message, /Unarchive/);
  assert.equal(env.TRACKER_KV._dump().employees.length, 1);
});

test('scenario: an archived person can still be permanently deleted (explicit admin action)', async () => {
  const env = makeEnv({ seed: seedStore() });
  await archiveIan(env);
  const resp = await deleteStaff({ request: jsonRequest(BASE, { personId: 'i1', category: 'instructors' }), env, data: adminSession() });
  assert.equal(resp.status, 200);
  const stored = env.TRACKER_KV._dump();
  assert.equal(stored.instructors.map(p => p.id).join(), 'i2');
  assert.ok(stored.auditLog.some(a => a.type === 'person-deleted' && a.personId === 'i1'));
});

// ── data safety of the generic admin save (/api/data) ─────
test('data safety: an admin save that omits an archived person (e.g. an old cached page) does NOT delete them', async () => {
  const env = makeEnv({ seed: seedStore() });
  await archiveIan(env);
  const stored = env.TRACKER_KV._dump();
  const auditBefore = stored.auditLog.length;

  // Client sends only active people.
  const body = {
    instructors: stored.instructors.filter(p => !p.archived),
    employees: stored.employees
  };
  const resp = await saveData({ request: jsonRequest(BASE + '/api/data', body), env, data: adminSession() });
  assert.equal(resp.status, 200);

  const after = env.TRACKER_KV._dump();
  const ian = after.instructors.find(p => p.id === 'i1');
  assert.ok(ian, 'archived person survives');
  assert.equal(ian.archived, true);
  assert.deepEqual(ian.vacations.map(v => v.id), ['v1']);
  // Their approved request must survive too (the orphaned-approval cleanup
  // must see the preserved vacation's fromRequestId).
  assert.ok(after.requests.some(r => r.id === 'r-approved'));
  assert.equal(after.auditLog.length, auditBefore, 'no spurious person-deleted entry');
});

test('data safety: an admin save cannot un-archive someone or edit an archived record', async () => {
  const env = makeEnv({ seed: seedStore() });
  await archiveIan(env);
  const stored = env.TRACKER_KV._dump();
  const tampered = JSON.parse(JSON.stringify(stored));
  const ian = tampered.instructors.find(p => p.id === 'i1');
  ian.archived = false;
  ian.name = 'Renamed';
  ian.vacations = [];

  await saveData({ request: jsonRequest(BASE + '/api/data', { instructors: tampered.instructors, employees: tampered.employees }), env, data: adminSession() });
  const after = env.TRACKER_KV._dump().instructors.find(p => p.id === 'i1');
  assert.equal(after.archived, true);
  assert.equal(after.name, 'Ian Leaving');
  assert.deepEqual(after.vacations.map(v => v.id), ['v1']);
});

test('data safety: moving an archived person to the other category in a save does not un-archive or duplicate them', async () => {
  const env = makeEnv({ seed: seedStore() });
  await archiveIan(env);
  const stored = env.TRACKER_KV._dump();
  const ian = { ...stored.instructors.find(p => p.id === 'i1'), archived: false };
  const body = {
    instructors: stored.instructors.filter(p => p.id !== 'i1'),
    employees: [...stored.employees, ian]
  };
  await saveData({ request: jsonRequest(BASE + '/api/data', body), env, data: adminSession() });
  const after = env.TRACKER_KV._dump();
  const all = [...after.instructors, ...after.employees].filter(p => p.id === 'i1');
  assert.equal(all.length, 1);
  assert.equal(after.instructors.find(p => p.id === 'i1').archived, true);
});

test('data safety: an admin save cannot archive someone either (only the archive endpoint can)', async () => {
  const env = makeEnv({ seed: seedStore() });
  const s = migrate(seedStore());
  s.instructors[1].archived = true;
  s.instructors[1].archivedAt = 5;
  await saveData({ request: jsonRequest(BASE + '/api/data', { instructors: s.instructors, employees: s.employees }), env, data: adminSession() });
  const ivy = env.TRACKER_KV._dump().instructors.find(p => p.id === 'i2');
  assert.equal(ivy.archived, false);
  assert.equal(ivy.archivedAt, undefined);
});

test('data safety: an admin save preserves notifyOptOuts (previously reset on every save)', async () => {
  const env = makeEnv({ seed: seedStore() });
  const s = env.TRACKER_KV._dump();
  await saveData({ request: jsonRequest(BASE + '/api/data', { instructors: s.instructors, employees: s.employees }), env, data: adminSession() });
  assert.deepEqual(env.TRACKER_KV._dump().notifyOptOuts, ['optedout-admin@x.com']);
});

test('data safety: normal edits to active people still work alongside archived ones', async () => {
  const env = makeEnv({ seed: seedStore() });
  await archiveIan(env);
  const s = env.TRACKER_KV._dump();
  s.instructors.find(p => p.id === 'i2').vacations.push(vac('v9', '2026-06-01', '2026-06-02'));
  await saveData({ request: jsonRequest(BASE + '/api/data', { instructors: s.instructors, employees: s.employees }), env, data: adminSession() });
  const after = env.TRACKER_KV._dump();
  assert.deepEqual(after.instructors.find(p => p.id === 'i2').vacations.map(v => v.id), ['v2', 'v9']);
  assert.ok(after.auditLog.some(a => a.type === 'vacation-added' && a.personId === 'i2'));
});

test('admin GET /api/data returns archived people too (flagged) so the Archived tab can show them', async () => {
  const env = makeEnv({ seed: seedStore() });
  await archiveIan(env);
  const d = await (await getData({ env, data: adminSession() })).json();
  assert.equal(d.instructors.length, 2);
  assert.equal(d.instructors.find(p => p.id === 'i1').archived, true);
  assert.equal(d.instructors.find(p => p.id === 'i2').archived, false);
});

// ── storage / migration ───────────────────────────────────
test('migrate: records from before this feature are active; only literal true counts as archived', () => {
  const d = migrate({
    instructors: [
      { id: 'a', name: 'A', vacations: [] },
      { id: 'b', name: 'B', vacations: [], archived: true },
      { id: 'c', name: 'C', vacations: [], archived: 'yes' }
    ],
    employees: []
  });
  assert.deepEqual(d.instructors.map(p => p.archived), [false, true, false]);
});

test('findPersonByEmail: prefers an active record over an archived one with the same email', () => {
  const store = migrate({
    instructors: [{ id: 'old', name: 'Old', email: 'same@x.com', vacations: [], archived: true }],
    employees: [{ id: 'new', name: 'New', email: 'SAME@x.com', vacations: [] }]
  });
  assert.equal(findPersonByEmail(store, 'same@x.com').person.id, 'new');
  store.employees = [];
  assert.equal(findPersonByEmail(store, 'same@x.com').person.id, 'old', 'still found when only archived');
});
