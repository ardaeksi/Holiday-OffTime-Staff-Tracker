import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet as listAudit } from '../functions/api/audit/list.js';
import { auditEntryTimestamp } from '../functions/_lib/store.js';
import { makeEnv, adminSession, staffSession } from './helpers.js';

const URL = 'https://example.com/api/audit/list';

test('audit/list: rejects unauthenticated and non-admin requests', async () => {
  const env = makeEnv({ seed: { instructors: [], employees: [], requests: [], auditLog: [], notifyOptOuts: [] } });
  const anon = await listAudit({ env, data: { session: null } });
  assert.equal(anon.status, 401);
  const staff = await listAudit({ env, data: staffSession() });
  assert.equal(staff.status, 403);
});

test('audit/list: returns entries newest-first across mixed addition/deletion types', async () => {
  const env = makeEnv({
    seed: {
      instructors: [], employees: [], requests: [],
      auditLog: [
        { id: 'a', type: 'person-deleted', deletedAt: 100 },
        { id: 'b', type: 'person-added', addedAt: 300 },
        { id: 'c', type: 'vacation-deleted', deletedAt: 200 },
        { id: 'd', type: 'vacation-added', addedAt: 400 }
      ],
      notifyOptOuts: []
    }
  });
  const resp = await listAudit({ env, data: adminSession() });
  assert.equal(resp.status, 200);
  const { entries } = await resp.json();
  assert.deepEqual(entries.map(e => e.id), ['d', 'b', 'c', 'a']);
});

test('auditEntryTimestamp: reads whichever verb-specific field a given entry type carries', () => {
  assert.equal(auditEntryTimestamp({ deletedAt: 5 }), 5);
  assert.equal(auditEntryTimestamp({ addedAt: 7 }), 7);
  assert.equal(auditEntryTimestamp({}), 0);
});
