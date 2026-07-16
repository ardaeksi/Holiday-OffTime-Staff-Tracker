import { json } from '../../_lib/http.js';
import { readStore } from '../../_lib/store.js';

export async function onRequestGet({ env, data }) {
  const session = data.session;
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const store = await readStore(env);
  // Matched by who submitted it, not personId — a first-time requester has no
  // person record yet (created only once an admin approves), but should still
  // see their own pending/denied request while waiting.
  const requests = store.requests
    .filter(r => r.submittedByEmail === session.email)
    .sort((a, b) => b.createdAt - a.createdAt);
  return json({ requests });
}
