import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  migrate, normalizeLeaveType, findPersonByEmail, findPersonById, resolveRole,
  getAdminEmails, isNotifyExcludedByEnv, isNotifyOptedOut, getNotifyAdminEmails,
  addNotifyOptOut, removeNotifyOptOut
} from '../functions/_lib/store.js';

test('normalizeLeaveType: "sick" stays "sick", everything else becomes "vacation"', () => {
  assert.equal(normalizeLeaveType('sick'), 'sick');
  assert.equal(normalizeLeaveType('vacation'), 'vacation');
  assert.equal(normalizeLeaveType(undefined), 'vacation');
  assert.equal(normalizeLeaveType(null), 'vacation');
  assert.equal(normalizeLeaveType('holiday'), 'vacation'); // any bogus/legacy value
  assert.equal(normalizeLeaveType(''), 'vacation');
});

test('migrate: backfills leaveType on vacations that predate this feature', () => {
  const store = migrate({
    instructors: [{ id: 'p1', name: 'Jane', vacations: [{ id: 'v1', startDate: '2026-01-01', endDate: '2026-01-05' }] }],
    employees: []
  });
  assert.equal(store.instructors[0].vacations[0].leaveType, 'vacation');
});

test('migrate: preserves an existing sick leaveType, normalizes a bogus one', () => {
  const store = migrate({
    instructors: [{
      id: 'p1', name: 'Jane',
      vacations: [
        { id: 'v1', leaveType: 'sick' },
        { id: 'v2', leaveType: 'bogus' }
      ]
    }],
    employees: []
  });
  assert.equal(store.instructors[0].vacations[0].leaveType, 'sick');
  assert.equal(store.instructors[0].vacations[1].leaveType, 'vacation');
});

test('migrate: backfills leaveType on requests too, and fills in missing arrays', () => {
  const store = migrate({ requests: [{ id: 'r1' }, { id: 'r2', leaveType: 'sick' }] });
  assert.deepEqual(store.instructors, []);
  assert.deepEqual(store.employees, []);
  assert.deepEqual(store.auditLog, []);
  assert.deepEqual(store.notifyOptOuts, []);
  assert.equal(store.requests[0].leaveType, 'vacation');
  assert.equal(store.requests[1].leaveType, 'sick');
});

test('migrate: handles completely empty/garbage input without throwing', () => {
  assert.doesNotThrow(() => migrate(null));
  assert.doesNotThrow(() => migrate({}));
  const store = migrate(undefined);
  assert.deepEqual(store.instructors, []);
});

test('findPersonByEmail: matches case-insensitively across both categories', () => {
  const store = {
    instructors: [{ id: 'i1', email: 'Jane@X.com' }],
    employees: [{ id: 'e1', email: 'bob@x.com' }]
  };
  assert.equal(findPersonByEmail(store, 'jane@x.com').category, 'instructors');
  assert.equal(findPersonByEmail(store, 'BOB@X.COM').category, 'employees');
  assert.equal(findPersonByEmail(store, 'nobody@x.com'), null);
  assert.equal(findPersonByEmail(store, ''), null);
});

test('findPersonById: looks up within the given category only', () => {
  const store = { instructors: [{ id: 'i1' }], employees: [{ id: 'e1' }] };
  assert.equal(findPersonById(store, 'instructors', 'i1').id, 'i1');
  assert.equal(findPersonById(store, 'instructors', 'e1'), null);
  assert.equal(findPersonById(store, 'bogus-category', 'i1'), null);
});

test('resolveRole: admin iff email is in ADMIN_EMAILS (case-insensitive)', () => {
  const env = { ADMIN_EMAILS: 'Admin@X.com, other@x.com' };
  assert.equal(resolveRole('admin@x.com', env), 'admin');
  assert.equal(resolveRole('OTHER@X.COM', env), 'admin');
  assert.equal(resolveRole('staff@x.com', env), 'staff');
  assert.equal(resolveRole('', env), 'staff');
});

test('getAdminEmails: trims and drops blanks', () => {
  assert.deepEqual(getAdminEmails({ ADMIN_EMAILS: ' a@x.com ,, b@x.com,' }), ['a@x.com', 'b@x.com']);
  assert.deepEqual(getAdminEmails({}), []);
});

test('notify opt-out: env-list exclusion and self-serve opt-out both work independently', () => {
  const env = { ADMIN_EMAILS: 'a@x.com,b@x.com,c@x.com', ADMIN_EMAILS_NO_NOTIFY: 'b@x.com' };
  const store = { notifyOptOuts: [] };
  addNotifyOptOut(store, 'C@X.COM');

  assert.equal(isNotifyExcludedByEnv(env, 'b@x.com'), true);
  assert.equal(isNotifyExcludedByEnv(env, 'a@x.com'), false);
  assert.equal(isNotifyOptedOut(store, 'c@x.com'), true);

  // a@x.com: neither excluded nor opted out -> notified
  // b@x.com: env-excluded -> not notified
  // c@x.com: self opted out -> not notified
  assert.deepEqual(getNotifyAdminEmails(env, store), ['a@x.com']);

  removeNotifyOptOut(store, 'c@x.com');
  assert.deepEqual(getNotifyAdminEmails(env, store), ['a@x.com', 'c@x.com']);
});
