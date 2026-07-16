import { json } from '../../_lib/http.js';
import { readStore, writeStore, findPersonByEmail } from '../../_lib/store.js';

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function isOffDay(dow, worksSaturday) {
  if (dow === 0) return false; // Sunday never counts
  if (dow === 6) return !!worksSaturday;
  return true;
}

function countOffDays(startDate, endDate, worksSaturday) {
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  if (isNaN(start) || isNaN(end) || end < start) return 0;
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    if (isOffDay(cur.getDay(), worksSaturday)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

export async function onRequestPost({ request, env, data }) {
  const session = data.session;
  if (!session) return json({ error: 'Unauthorized' }, 401);
  // No linked person record yet is fine — this becomes their first-ever request,
  // and an admin assigns them to Instructors/Employees when they approve it.

  let body;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }

  const { startDate, endDate, note, worksSaturday } = body;
  if (!startDate || !endDate) return json({ error: 'Start and end date are required.' }, 400);
  if (endDate < startDate) return json({ error: 'End date must be on or after the start date.' }, 400);
  if (countOffDays(startDate, endDate, !!worksSaturday) < 1) {
    return json({ error: 'Duration must be at least 1 day.' }, 400);
  }

  const store = await readStore(env);
  // Looked up fresh rather than trusting the session's snapshot — same reason
  // as /api/data and /api/auth/me: a record may have been linked since sign-in.
  const match = findPersonByEmail(store, session.email);
  const requestObj = {
    id: uid(),
    category: match ? match.category : null,
    personId: match ? match.person.id : null,
    personName: match ? match.person.name : session.name,
    submittedByEmail: session.email,
    startDate,
    endDate,
    note: (note || '').trim().slice(0, 500),
    worksSaturday: !!worksSaturday,
    status: 'pending',
    createdAt: Date.now(),
    decidedAt: null,
    decidedByEmail: null,
    denialReason: null
  };
  store.requests.push(requestObj);
  await writeStore(env, store);
  return json({ ok: true, request: requestObj }, 201);
}
