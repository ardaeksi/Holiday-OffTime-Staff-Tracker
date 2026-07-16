import { json } from '../_lib/http.js';
import { readStore, writeStore } from '../_lib/store.js';

export async function onRequestGet({ env, data }) {
  const session = data.session;
  if (!session) return json({ error: 'Unauthorized' }, 401);

  let store;
  try {
    store = await readStore(env);
  } catch {
    return json({ error: 'Storage read failed' }, 500);
  }

  if (session.role === 'admin') {
    return json({ instructors: store.instructors, employees: store.employees });
  }

  // Staff only ever see their own linked record — never the full roster.
  const result = { instructors: [], employees: [] };
  if (session.personId && session.personCategory) {
    const person = (store[session.personCategory] || []).find(p => p.id === session.personId);
    if (person) result[session.personCategory] = [person];
  }
  return json(result);
}

export async function onRequestPost({ request, env, data }) {
  const session = data.session;
  if (!session) return json({ error: 'Unauthorized' }, 401);
  if (session.role !== 'admin') return json({ error: 'Forbidden — read-only' }, 403);

  let body;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return json({ error: 'Invalid data' }, 400);
  }
  if (!Array.isArray(body.instructors) || !Array.isArray(body.employees)) {
    return json({ error: 'Invalid data' }, 400);
  }

  try {
    // The admin client only ever round-trips instructors/employees, so we
    // must preserve the existing requests array here — otherwise every
    // admin save would silently wipe all pending/decided time-off requests.
    const existing = await readStore(env);

    // If an approved request's resulting vacation entry was deleted (directly,
    // or by deleting the whole person), drop the request record too — otherwise
    // it keeps showing as "Approved" in the Log even though the time off is gone.
    const survivingIds = new Set();
    [...body.instructors, ...body.employees].forEach(p =>
      (p.vacations || []).forEach(v => { if (v.fromRequestId) survivingIds.add(v.fromRequestId); })
    );
    const requests = existing.requests.filter(r => r.status !== 'approved' || survivingIds.has(r.id));

    const merged = { instructors: body.instructors, employees: body.employees, requests };
    await writeStore(env, merged);
    return json({ ok: true });
  } catch {
    return json({ error: 'Storage write failed' }, 500);
  }
}
