import { json } from '../../_lib/http.js';
import { readStore, writeStore, addNotifyOptOut, removeNotifyOptOut, isNotifyOptedOut, isNotifyExcludedByEnv } from '../../_lib/store.js';

// forcedByEnv: true means ADMIN_EMAILS_NO_NOTIFY already excludes this admin,
// so toggling their own KV-backed preference wouldn't actually change
// anything — the UI uses this to show a read-only "set by admin" state.
async function currentPreference(env, email) {
  const store = await readStore(env);
  return {
    optedOut: isNotifyOptedOut(store, email),
    forcedByEnv: isNotifyExcludedByEnv(env, email)
  };
}

export async function onRequestGet({ env, data }) {
  const session = data.session;
  if (!session) return json({ error: 'Unauthorized' }, 401);
  if (session.role !== 'admin') return json({ error: 'Forbidden' }, 403);

  return json(await currentPreference(env, session.email));
}

// Self-serve only — an admin can toggle their own preference, not anyone else's.
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
  if (typeof body.optedOut !== 'boolean') return json({ error: 'optedOut (boolean) is required' }, 400);

  const store = await readStore(env);
  if (body.optedOut) addNotifyOptOut(store, session.email);
  else removeNotifyOptOut(store, session.email);
  await writeStore(env, store);

  // Built from the store already in hand rather than re-reading KV — avoids
  // a redundant round-trip and any read-after-write consistency edge case.
  return json({
    optedOut: isNotifyOptedOut(store, session.email),
    forcedByEnv: isNotifyExcludedByEnv(env, session.email)
  });
}
