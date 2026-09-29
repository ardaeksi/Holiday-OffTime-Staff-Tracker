import { json } from '../../_lib/http.js';
import { readStore, writeStore, findPersonById } from '../../_lib/store.js';

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Admin-only: bring an archived staff member back into the main panels (e.g.
// a rehire), with all of their history exactly as it was when archived.
// Requests auto-closed by the archive stay closed — they were decided at the
// time and are part of the record; the person can simply submit new ones.
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
  if (!person.archived) return json({ error: `${person.name} is not archived.` }, 409);

  // Two active records sharing a sign-in email would make "which record is
  // theirs" ambiguous for that person's logins and requests — refuse rather
  // than guess, and say who holds the email so an admin can sort it out.
  const email = (person.email || '').toLowerCase();
  if (email) {
    for (const cat of ['instructors', 'employees']) {
      const clash = store[cat].find(p => p.id !== personId && !p.archived && (p.email || '').toLowerCase() === email);
      if (clash) {
        return json({
          error: `Can't unarchive — ${clash.name} is already active with the sign-in email ${person.email}. Change or clear one of their emails first.`
        }, 409);
      }
    }
  }

  const now = Date.now();
  person.archived = false;
  delete person.archivedAt;
  delete person.archivedByEmail;

  store.auditLog.push({
    id: uid(),
    type: 'person-unarchived',
    category,
    personId,
    personName: person.name,
    vacationCount: person.vacations.length,
    unarchivedByEmail: session.email,
    unarchivedAt: now
  });

  try {
    await writeStore(env, store);
  } catch {
    return json({ error: 'Storage write failed' }, 500);
  }

  return json({ ok: true, person, category });
}
