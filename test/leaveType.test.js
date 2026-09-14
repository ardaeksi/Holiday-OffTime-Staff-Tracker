// End-to-end coverage of the leave-type (Vacation/Holiday vs Sick/Medical)
// feature across the handlers that actually create/carry/persist it:
// submit -> approve (propagation) and the admin full-roster save (defensive
// normalization + audit trail). This is the core of the "big upgrade" —
// getting this wrong silently mislabels someone's time off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost as submitRequest } from '../functions/api/requests/submit.js';
import { onRequestPost as approveRequest } from '../functions/api/requests/approve.js';
import { onRequestPost as saveData } from '../functions/api/data.js';
import { makeEnv, adminSession, staffSession, jsonRequest } from './helpers.js';

function submitUrl() { return 'https://example.com/api/requests/submit'; }
function approveUrl() { return 'https://example.com/api/requests/approve'; }
function dataUrl() { return 'https://example.com/api/data'; }

test('submit: leaveType defaults to "vacation" when omitted', async () => {
  const env = makeEnv();
  const resp = await submitRequest({
    request: jsonRequest(submitUrl(), { startDate: '2026-03-02', endDate: '2026-03-02' }),
    env, data: staffSession('staff@x.com')
  });
  assert.equal(resp.status, 201);
  const body = await resp.json();
  assert.equal(body.request.leaveType, 'vacation');
});

test('submit: an explicit "sick" leaveType is preserved; a bogus value is not', async () => {
  const env = makeEnv();
  const sick = await submitRequest({
    request: jsonRequest(submitUrl(), { startDate: '2026-03-02', endDate: '2026-03-02', leaveType: 'sick' }),
    env, data: staffSession('staff@x.com')
  });
  assert.equal((await sick.json()).request.leaveType, 'sick');

  const bogus = await submitRequest({
    request: jsonRequest(submitUrl(), { startDate: '2026-03-03', endDate: '2026-03-03', leaveType: 'made-up' }),
    env, data: staffSession('staff2@x.com')
  });
  assert.equal((await bogus.json()).request.leaveType, 'vacation');
});

test('approve: the created vacation entry carries the request\'s leaveType (existing person)', async () => {
  const env = makeEnv({
    seed: {
      instructors: [{ id: 'p1', name: 'Jane', email: 'jane@x.com', vacations: [] }],
      employees: [],
      requests: [{
        id: 'r1', category: 'instructors', personId: 'p1', personName: 'Jane',
        submittedByEmail: 'jane@x.com', leaveType: 'sick',
        startDate: '2026-04-01', endDate: '2026-04-01', note: '', worksSaturday: false,
        halfDay: false, halfDayFrom: '', status: 'pending', createdAt: 1, decidedAt: null, decidedByEmail: null, denialReason: null
      }],
      auditLog: [], notifyOptOuts: []
    }
  });

  const resp = await approveRequest({
    request: jsonRequest(approveUrl(), { requestId: 'r1' }),
    env, data: adminSession()
  });
  assert.equal(resp.status, 200);
  const body = await resp.json();
  assert.equal(body.vacation.leaveType, 'sick');

  const stored = env.TRACKER_KV._dump();
  assert.equal(stored.instructors[0].vacations[0].leaveType, 'sick');
  assert.equal(stored.instructors[0].vacations[0].fromRequestId, 'r1');
});

test('approve: leaveType still carries through on a first-time requester (no person record yet)', async () => {
  const env = makeEnv({
    seed: {
      instructors: [], employees: [],
      requests: [{
        id: 'r1', category: null, personId: null, personName: 'New Person',
        submittedByEmail: 'new@x.com', leaveType: 'vacation',
        startDate: '2026-04-01', endDate: '2026-04-03', note: '', worksSaturday: false,
        halfDay: false, halfDayFrom: '', status: 'pending', createdAt: 1, decidedAt: null, decidedByEmail: null, denialReason: null
      }],
      auditLog: [], notifyOptOuts: []
    }
  });

  const resp = await approveRequest({
    request: jsonRequest(approveUrl(), { requestId: 'r1', category: 'employees' }),
    env, data: adminSession()
  });
  assert.equal(resp.status, 200);
  const stored = env.TRACKER_KV._dump();
  assert.equal(stored.employees.length, 1);
  assert.equal(stored.employees[0].vacations[0].leaveType, 'vacation');
});

test('data.js POST: normalizes a bogus leaveType defensively, regardless of what the client sent', async () => {
  const env = makeEnv({ seed: { instructors: [], employees: [], requests: [], auditLog: [], notifyOptOuts: [] } });
  const resp = await saveData({
    request: jsonRequest(dataUrl(), {
      instructors: [{ id: 'p1', name: 'Jane', email: '', vacations: [{ id: 'v1', leaveType: 'not-a-real-type', startDate: '2026-01-01', endDate: '2026-01-01' }] }],
      employees: []
    }),
    env, data: adminSession()
  });
  assert.equal(resp.status, 200);
  const stored = env.TRACKER_KV._dump();
  assert.equal(stored.instructors[0].vacations[0].leaveType, 'vacation');
});

test('data.js POST: a vacation-deleted audit entry captures which leave type was removed', async () => {
  const env = makeEnv({
    seed: {
      instructors: [{
        id: 'p1', name: 'Jane', email: '',
        vacations: [{ id: 'v1', leaveType: 'sick', startDate: '2026-01-01', endDate: '2026-01-01' }]
      }],
      employees: [], requests: [], auditLog: [], notifyOptOuts: []
    }
  });
  // Same person, but the vacation entry is now gone from the saved payload.
  const resp = await saveData({
    request: jsonRequest(dataUrl(), {
      instructors: [{ id: 'p1', name: 'Jane', email: '', vacations: [] }],
      employees: []
    }),
    env, data: adminSession('admin@x.com')
  });
  assert.equal(resp.status, 200);
  const stored = env.TRACKER_KV._dump();
  assert.equal(stored.auditLog.length, 1);
  assert.equal(stored.auditLog[0].type, 'vacation-deleted');
  assert.equal(stored.auditLog[0].leaveType, 'sick');
  assert.equal(stored.auditLog[0].deletedByEmail, 'admin@x.com');
});
