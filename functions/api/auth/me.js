import { json } from '../../_lib/http.js';
import { readStore, findPersonByEmail } from '../../_lib/store.js';

export async function onRequestGet({ env, data }) {
  const session = data.session;
  if (!session) return json({ authenticated: false });

  // Looked up fresh rather than trusting the session's snapshot — an admin may
  // have linked or created this person's record after the session was issued
  // (e.g. by approving their first-ever request), and staff shouldn't have to
  // sign out/in just to see it.
  let person = null;
  if (session.role !== 'admin') {
    try {
      const store = await readStore(env);
      const match = findPersonByEmail(store, session.email);
      if (match) person = { id: match.person.id, name: match.person.name, category: match.category, archived: !!match.person.archived };
    } catch { /* leave person null on read failure */ }
  }

  return json({
    authenticated: true,
    email: session.email,
    name: session.name,
    role: session.role,
    person
  });
}
