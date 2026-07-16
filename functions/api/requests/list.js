import { json } from '../../_lib/http.js';
import { readStore } from '../../_lib/store.js';

export async function onRequestGet({ request, env, data }) {
  const session = data.session;
  if (!session) return json({ error: 'Unauthorized' }, 401);
  if (session.role !== 'admin') return json({ error: 'Forbidden' }, 403);

  const status = new URL(request.url).searchParams.get('status') || 'pending';
  const store = await readStore(env);
  let requests = store.requests;
  if (status !== 'all') requests = requests.filter(r => r.status === status);
  requests = requests.slice().sort((a, b) => {
    if (status === 'all') {
      const rank = s => s === 'pending' ? 0 : 1;
      const rankDiff = rank(a.status) - rank(b.status);
      if (rankDiff !== 0) return rankDiff;
    }
    return b.createdAt - a.createdAt;
  });
  return json({ requests });
}
