// Audit coverage for the generic /api/data admin save — the path used when
// an admin adds a day off (or a brand-new person, bundled with it) directly
// through the calendar, bypassing /api/staff/add and /api/requests/approve.
// deletions are covered in leaveType.test.js; this file covers additions
// plus mixed add+delete saves and the shape of every field the Log UI reads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost as saveData } from '../functions/api/data.js';
import { makeEnv, adminSession, staffSession, jsonRequest } from './helpers.js';

const URL = 'https://example.com/api/data';

test('data.js POST: rejects non-admin', async () => {
  const env = makeEnv({ seed: { instructors: [], employees: [], requests: [], auditLog: [], notifyOptOuts: [] } });
  const resp = await saveData({
    request: jsonRequest(URL, { instructors: [], employees: [] }),
    env, data: staffSession()
  });
  assert.equal(resp.status, 403);
});

test('data.js POST: a brand-new person added directly logs person-added with the bundled vacation count, and no separate vacation-added entries', async () => {
  const env = makeEnv({ seed: { instructors: [], employees: [], requests: [], auditLog: [], notifyOptOuts: [] } });
  const resp = await saveData({
    request: jsonRequest(URL, {
      instructors: [{
        id: 'new1', name: 'Casey New', email: '', vacations: [
          { id: 'v1', leaveType: 'vacation', startDate: '2026-05-01', endDate: '2026-05-03' }
        ]
      }],
      employees: []
    }),
    env, data: adminSession('admin@x.com')
  });
  assert.equal(resp.status, 200);

  const stored = env.TRACKER_KV._dump();
  assert.equal(stored.auditLog.length, 1);
  const entry = stored.auditLog[0];
  assert.equal(entry.type, 'person-added');
  assert.equal(entry.category, 'instructors');
  assert.equal(entry.personId, 'new1');
  assert.equal(entry.personName, 'Casey New');
  assert.equal(entry.vacationCount, 1);
  assert.equal(entry.addedByEmail, 'admin@x.com');
  assert.equal(typeof entry.addedAt, 'number');
});

test('data.js POST: a new vacation added to an existing person logs vacation-added with leave type and dates', async () => {
  const env = makeEnv({
    seed: {
      instructors: [{ id: 'p1', name: 'Jane', email: '', vacations: [] }],
      employees: [], requests: [], auditLog: [], notifyOptOuts: []
    }
  });
  const resp = await saveData({
    request: jsonRequest(URL, {
      instructors: [{
        id: 'p1', name: 'Jane', email: '', vacations: [
          { id: 'v1', leaveType: 'sick', startDate: '2026-06-10', endDate: '2026-06-10', halfDay: false }
        ]
      }],
      employees: []
    }),
    env, data: adminSession('admin@x.com')
  });
  assert.equal(resp.status, 200);

  const stored = env.TRACKER_KV._dump();
  assert.equal(stored.auditLog.length, 1);
  const entry = stored.auditLog[0];
  assert.equal(entry.type, 'vacation-added');
  assert.equal(entry.category, 'instructors');
  assert.equal(entry.personId, 'p1');
  assert.equal(entry.personName, 'Jane');
  assert.equal(entry.leaveType, 'sick');
  assert.equal(entry.startDate, '2026-06-10');
  assert.equal(entry.endDate, '2026-06-10');
  assert.equal(entry.halfDay, false);
  assert.equal(entry.addedByEmail, 'admin@x.com');
  assert.equal(typeof entry.addedAt, 'number');
});

test('data.js POST: a half-day vacation addition carries halfDay through the audit entry', async () => {
  const env = makeEnv({
    seed: {
      instructors: [], employees: [{ id: 'e1', name: 'Bob', email: '', vacations: [] }],
      requests: [], auditLog: [], notifyOptOuts: []
    }
  });
  await saveData({
    request: jsonRequest(URL, {
      instructors: [],
      employees: [{
        id: 'e1', name: 'Bob', email: '', vacations: [
          { id: 'v1', leaveType: 'vacation', startDate: '2026-06-11', endDate: '2026-06-11', halfDay: true }
        ]
      }]
    }),
    env, data: adminSession()
  });
  const stored = env.TRACKER_KV._dump();
  assert.equal(stored.auditLog[0].type, 'vacation-added');
  assert.equal(stored.auditLog[0].halfDay, true);
});

test('data.js POST: adding one vacation and deleting another in the same save logs both, independently', async () => {
  const env = makeEnv({
    seed: {
      instructors: [{
        id: 'p1', name: 'Jane', email: '', vacations: [
          { id: 'old', leaveType: 'vacation', startDate: '2026-01-01', endDate: '2026-01-02' }
        ]
      }],
      employees: [], requests: [], auditLog: [], notifyOptOuts: []
    }
  });
  const resp = await saveData({
    request: jsonRequest(URL, {
      instructors: [{
        id: 'p1', name: 'Jane', email: '', vacations: [
          { id: 'new', leaveType: 'sick', startDate: '2026-02-01', endDate: '2026-02-01' }
        ]
      }],
      employees: []
    }),
    env, data: adminSession('admin@x.com')
  });
  assert.equal(resp.status, 200);

  const stored = env.TRACKER_KV._dump();
  assert.equal(stored.auditLog.length, 2);
  const byType = Object.fromEntries(stored.auditLog.map(e => [e.type, e]));
  assert.equal(byType['vacation-deleted'].startDate, '2026-01-01');
  assert.equal(byType['vacation-added'].startDate, '2026-02-01');
  assert.equal(byType['vacation-added'].leaveType, 'sick');
});

test('data.js POST: an untouched roster (no adds, no deletes) writes no new audit entries', async () => {
  const seed = {
    instructors: [{ id: 'p1', name: 'Jane', email: '', vacations: [{ id: 'v1', leaveType: 'vacation', startDate: '2026-01-01', endDate: '2026-01-01' }] }],
    employees: [], requests: [], auditLog: [{ id: 'pre-existing', type: 'person-added' }], notifyOptOuts: []
  };
  const env = makeEnv({ seed });
  await saveData({
    request: jsonRequest(URL, { instructors: seed.instructors, employees: [] }),
    env, data: adminSession()
  });
  const stored = env.TRACKER_KV._dump();
  assert.equal(stored.auditLog.length, 1);
  assert.equal(stored.auditLog[0].id, 'pre-existing');
});

test('data.js POST: existing audit entries are preserved (appended to, not overwritten)', async () => {
  const env = makeEnv({
    seed: {
      instructors: [], employees: [], requests: [],
      auditLog: [{ id: 'old-entry', type: 'person-deleted', deletedAt: 1 }],
      notifyOptOuts: []
    }
  });
  await saveData({
    request: jsonRequest(URL, {
      instructors: [{ id: 'new1', name: 'Casey', email: '', vacations: [] }],
      employees: []
    }),
    env, data: adminSession()
  });
  const stored = env.TRACKER_KV._dump();
  assert.equal(stored.auditLog.length, 2);
  assert.ok(stored.auditLog.some(e => e.id === 'old-entry'));
  assert.ok(stored.auditLog.some(e => e.type === 'person-added'));
});
