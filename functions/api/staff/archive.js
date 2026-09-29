import { json } from '../../_lib/http.js';
import { readStore, writeStore, findPersonById } from '../../_lib/store.js';

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const AUTO_CLOSE_REASON = 'Automatically closed — this staff member was archived.';

// Admin-only: archive an ex-staff member. Unlike /api/staff/delete, nothing is
// removed — the record just gets `archived: true`, which hides it from the
// main Instructors / Office Employees panels (it moves to the Archived tab)
// while keeping every vacation entry, request, and audit entry intact. Fully
// reversible via /api/staff/unarchive.
//
// Their still-pending requests are closed as part of the same write (marked
// denied with an explanatory reason, `autoClosed: true`), so nothing is left
// sitting in the admin queue for someone who no longer works here — and the
// person sees that reason in their own request history if they sign in.
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
  if (person.archived) return json({ error: `${person.name} is already archived.` }, 409);

  const now = Date.now();
  person.archived = true;
  person.archivedAt = now;
  person.archivedByEmail = session.email;

  // A first-time request (submitted before this person's record existed, e.g.
  // before an admin added them by email) has no personId yet — match those by
  // the email it was submitted from, so they're closed too.
  const email = (person.email || '').toLowerCase();
  let closedRequestCount = 0;
  store.requests.forEach(r => {
    if (r.status !== 'pending') return;
    const isTheirs = r.personId === personId ||
      (!r.personId && email && (r.submittedByEmail || '').toLowerCase() === email);
    if (!isTheirs) return;
    r.status = 'denied';
    r.denialReason = AUTO_CLOSE_REASON;
    r.autoClosed = true;
    r.decidedAt = now;
    r.decidedByEmail = session.email;
    closedRequestCount++;
  });

  store.auditLog.push({
    id: uid(),
    type: 'person-archived',
    category,
    personId,
    personName: person.name,
    vacationCount: person.vacations.length,
    closedRequestCount,
    archivedByEmail: session.email,
    archivedAt: now
  });

  try {
    await writeStore(env, store);
  } catch {
    return json({ error: 'Storage write failed' }, 500);
  }

  return json({ ok: true, person, category, closedRequestCount });
}
