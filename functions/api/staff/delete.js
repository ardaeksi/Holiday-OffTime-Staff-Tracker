import { json } from '../../_lib/http.js';
import { readStore, writeStore, findPersonById } from '../../_lib/store.js';

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Admin-only: permanently remove a staff member — profile, every vacation
// entry, and their request history. Distinct from the generic /api/data save
// (which only removes a person implicitly, as a side effect of the client
// omitting them from a full-roster POST) so this can also be reached with a
// single, purpose-built confirm-and-delete action, and so it can clean up
// their requests directly rather than leaving pending/denied ones dangling
// on a personId that no longer resolves to anyone.
export async function onRequestPost({ request, env, data }) {
  const session = data.session;
  if (!session) return json({ error: 'Unauthorized' }, 401);
  if (session.role !== 'admin') return json({ error: 'Forbidden' }, 403);

  let body;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }
  const { personId, category } = body;
  if (!personId || (category !== 'instructors' && category !== 'employees')) {
    return json({ error: 'personId and category are required' }, 400);
  }

  const store = await readStore(env);
  const person = findPersonById(store, category, personId);
  if (!person) return json({ error: 'Staff record not found' }, 404);

  store[category] = store[category].filter(p => p.id !== personId);
  store.requests = store.requests.filter(r => r.personId !== personId);

  store.auditLog.push({
    id: uid(),
    type: 'person-deleted',
    category,
    personId,
    personName: person.name,
    vacationCount: person.vacations.length,
    deletedByEmail: session.email,
    deletedAt: Date.now()
  });

  try {
    await writeStore(env, store);
  } catch {
    return json({ error: 'Storage write failed' }, 500);
  }

  return json({ ok: true });
}
