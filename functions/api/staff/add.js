import { json } from '../../_lib/http.js';
import { readStore, writeStore, findPersonByEmail } from '../../_lib/store.js';
import { lookupUserByEmail } from '../../_lib/graphUsers.js';

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Admin-only: add a staff member by email alone, with no vacation entries yet
// (the gap this closes — previously a person only existed in the tracker
// once someone logged a vacation for them). The display name is resolved via
// Microsoft Graph so the admin doesn't have to type it; if that lookup can't
// find or confirm the account, the client retries this same endpoint with an
// explicit `name` to add them manually instead.
export async function onRequestPost({ request, env, data }) {
  const session = data.session;
  if (!session) return json({ error: 'Unauthorized' }, 401);
  if (session.role !== 'admin') return json({ error: 'Forbidden' }, 403);

  let body;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return json({ error: 'invalid_request', message: 'Invalid request' }, 400);
  }

  const email = (body.email || '').trim().toLowerCase();
  const category = body.category;
  const manualName = (body.name || '').trim();

  if (!EMAIL_RE.test(email)) {
    return json({ error: 'invalid_email', message: 'Please enter a valid email address.' }, 400);
  }
  if (category !== 'instructors' && category !== 'employees') {
    return json({ error: 'invalid_category', message: 'category must be "instructors" or "employees".' }, 400);
  }

  const store = await readStore(env);

  const existing = findPersonByEmail(store, email);
  if (existing) {
    const catLabel = existing.category === 'instructors' ? 'Instructors' : 'Office Employees';
    return json({
      error: 'already_exists',
      message: `${existing.person.name} is already tracked (${catLabel}) with this email.`
    }, 409);
  }

  let name = manualName;
  if (!name) {
    let match;
    try {
      match = await lookupUserByEmail(env, email);
    } catch {
      return json({
        error: 'lookup_failed',
        message: "Couldn't check that email against your organization's directory. Enter their name manually to add them anyway."
      }, 502);
    }
    if (!match) {
      return json({
        error: 'not_found',
        message: 'No Microsoft account with that email was found in your organization. Enter their name manually to add them anyway.'
      }, 404);
    }
    name = match.displayName || match.mail || email;
  }

  const person = { id: uid(), name, email, vacations: [] };
  store[category].push(person);

  try {
    await writeStore(env, store);
  } catch {
    return json({ error: 'storage_failed', message: 'Storage write failed' }, 500);
  }

  return json({ ok: true, person, category }, 201);
}
