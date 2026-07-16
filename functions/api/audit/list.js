import { json } from '../../_lib/http.js';
import { readStore } from '../../_lib/store.js';

export async function onRequestGet({ env, data }) {
  const session = data.session;
  if (!session) return json({ error: 'Unauthorized' }, 401);
  if (session.role !== 'admin') return json({ error: 'Forbidden' }, 403);

  const store = await readStore(env);
  const entries = store.auditLog.slice().sort((a, b) => b.deletedAt - a.deletedAt);
  return json({ entries });
}
