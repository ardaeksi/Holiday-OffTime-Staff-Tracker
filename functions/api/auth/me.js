import { json } from '../../_lib/http.js';

export async function onRequestGet({ data }) {
  const session = data.session;
  if (!session) return json({ authenticated: false });
  return json({
    authenticated: true,
    email: session.email,
    name: session.name,
    role: session.role,
    person: session.personId
      ? { id: session.personId, name: session.personName, category: session.personCategory }
      : null
  });
}
