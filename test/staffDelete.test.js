import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../functions/api/staff/delete.js';
import { makeEnv, adminSession, staffSession, jsonRequest } from './helpers.js';

const URL = 'https://example.com/api/staff/delete';

function seedStore() {
  return {
    instructors: [{
      id: 'p1', name: 'Jane Smith', email: 'jane@x.com',
      vacations: [{ id: 'v1', leaveType: 'sick', startDate: '2026-01-01', endDate: '2026-01-02' }]
    }],
    employees: [],
    requests: [
      { id: 'r1', personId: 'p1', category: 'instructors', status: 'pending' },
      { id: 'r2', personId: 'p1', category: 'instructors', status: 'approved' },
      { id: 'r3', personId: 'other-person', category: 'instructors', status: 'pending' }
    ],
    auditLog: [],
    notifyOptOuts: []
  };
}

test('staff/delete: rejects non-admin', async () => {
  const env = makeEnv({ seed: seedStore() });
  const resp = await onRequestPost({ request: jsonRequest(URL, { personId: 'p1', category: 'instructors' }), env, data: staffSession() });
  assert.equal(resp.status, 403);
});

test('staff/delete: 404s for a person that does not exist', async () => {
  const env = makeEnv({ seed: seedStore() });
  const resp = await onRequestPost({ request: jsonRequest(URL, { personId: 'nope', category: 'instructors' }), env, data: adminSession() });
  assert.equal(resp.status, 404);
});

test('staff/delete: removes the person, drops only their requests, and logs an audit entry', async () => {
  const env = makeEnv({ seed: seedStore() });
  const resp = await onRequestPost({
    request: jsonRequest(URL, { personId: 'p1', category: 'instructors' }),
    env, data: adminSession('admin@x.com')
  });
  assert.equal(resp.status, 200);

  const stored = env.TRACKER_KV._dump();
  assert.equal(stored.instructors.length, 0);

  // r1 and r2 belonged to the deleted person and are gone; r3 (someone else) survives.
  assert.deepEqual(stored.requests.map(r => r.id), ['r3']);

  assert.equal(stored.auditLog.length, 1);
  const entry = stored.auditLog[0];
  assert.equal(entry.type, 'person-deleted');
  assert.equal(entry.personName, 'Jane Smith');
  assert.equal(entry.vacationCount, 1);
  assert.equal(entry.deletedByEmail, 'admin@x.com');
  assert.equal(entry.category, 'instructors');
});
