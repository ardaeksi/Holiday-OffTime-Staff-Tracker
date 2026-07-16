import { json } from '../../_lib/http.js';
import { readStore, writeStore } from '../../_lib/store.js';

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
  const { requestId, reason } = body;
  if (!requestId) return json({ error: 'requestId is required' }, 400);
  if (!reason || !reason.trim()) return json({ error: 'Denial reason is required.' }, 400);

  const store = await readStore(env);
  const req = store.requests.find(r => r.id === requestId);
  if (!req) return json({ error: 'Request not found' }, 404);
  if (req.status !== 'pending') return json({ error: 'Request already decided' }, 409);

  req.status = 'denied';
  req.denialReason = reason.trim().slice(0, 500);
  req.decidedAt = Date.now();
  req.decidedByEmail = session.email;

  await writeStore(env, store);
  return json({ ok: true, request: req });
}
