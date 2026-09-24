import { json } from '../_lib/http.js';
import { readStore, writeStore, findPersonByEmail, normalizeLeaveType } from '../_lib/store.js';

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

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
  // Looked up fresh by email (not the session's snapshot) for the same reason
  // as /api/auth/me: a record may have been linked/created after sign-in.
  const match = findPersonByEmail(store, session.email);
  const result = { instructors: [], employees: [] };
  if (match) result[match.category] = [match.person];
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
  // Defensive, not just trusting the client: every vacation gets a valid
  // leaveType regardless of what this particular save sent (old cached page,
  // a bug, a direct API call) — same normalization migrate() applies on read.
  [...body.instructors, ...body.employees].forEach(p => {
    (p.vacations || []).forEach(v => { v.leaveType = normalizeLeaveType(v.leaveType); });
  });

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

    // Audit trail: anything present in this save but missing from the stored
    // state is something an admin just added, and vice versa for something
    // that disappeared — log who/what/when, so admins reviewing each other's
    // changes can see what changed and by whom. This is the only record of a
    // person or vacation added directly through the calendar (rather than via
    // /api/staff/add or an approved request), so it has to run here too.
    const auditLog = existing.auditLog.slice();
    const now = Date.now();
    ['instructors', 'employees'].forEach(category => {
      const oldList = existing[category] || [];
      const newList = body[category] || [];
      const oldById = new Map(oldList.map(p => [p.id, p]));
      const newById = new Map(newList.map(p => [p.id, p]));

      oldList.forEach(oldPerson => {
        const newPerson = newById.get(oldPerson.id);
        if (!newPerson) {
          auditLog.push({
            id: uid(),
            type: 'person-deleted',
            category,
            personId: oldPerson.id,
            personName: oldPerson.name,
            vacationCount: oldPerson.vacations.length,
            deletedByEmail: session.email,
            deletedAt: now
          });
          return;
        }
        const oldVacIds = new Set(oldPerson.vacations.map(v => v.id));
        const newVacIds = new Set(newPerson.vacations.map(v => v.id));
        oldPerson.vacations.forEach(oldVac => {
          if (!newVacIds.has(oldVac.id)) {
            auditLog.push({
              id: uid(),
              type: 'vacation-deleted',
              category,
              personId: oldPerson.id,
              personName: newPerson.name,
              leaveType: normalizeLeaveType(oldVac.leaveType),
              startDate: oldVac.startDate,
              endDate: oldVac.endDate,
              halfDay: !!oldVac.halfDay,
              deletedByEmail: session.email,
              deletedAt: now
            });
          }
        });
        // Only diffed for a person who already existed — a vacation that
        // arrives bundled with a brand-new person is covered by that
        // person's own vacationCount below, mirroring how person-deleted
        // doesn't also emit a vacation-deleted per vacation they took with them.
        newPerson.vacations.forEach(newVac => {
          if (!oldVacIds.has(newVac.id)) {
            auditLog.push({
              id: uid(),
              type: 'vacation-added',
              category,
              personId: newPerson.id,
              personName: newPerson.name,
              leaveType: normalizeLeaveType(newVac.leaveType),
              startDate: newVac.startDate,
              endDate: newVac.endDate,
              halfDay: !!newVac.halfDay,
              addedByEmail: session.email,
              addedAt: now
            });
          }
        });
      });

      newList.forEach(newPerson => {
        if (!oldById.has(newPerson.id)) {
          auditLog.push({
            id: uid(),
            type: 'person-added',
            category,
            personId: newPerson.id,
            personName: newPerson.name,
            vacationCount: newPerson.vacations.length,
            addedByEmail: session.email,
            addedAt: now
          });
        }
      });
    });

    const merged = { instructors: body.instructors, employees: body.employees, requests, auditLog };
    await writeStore(env, merged);
    return json({ ok: true });
  } catch {
    return json({ error: 'Storage write failed' }, 500);
  }
}
