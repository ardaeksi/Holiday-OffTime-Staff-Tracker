const MAIN_KEY   = 'tracker-data';
const META_KEY   = 'backup:meta';
const SLOT_COUNT = 3;
const PRE_RESTORE_KEY = 'backup:pre-restore';

function slotKey(i) { return `backup:${i}`; }

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

// Constant-time comparison: both values are hashed to a fixed length first so
// neither the content nor the length of the real password leaks via timing.
async function checkAuth(request, env) {
  const pw = request.headers.get('X-Backup-Password');
  if (!env.BACKUP_PASSWORD || !pw) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(pw)),
    crypto.subtle.digest('SHA-256', enc.encode(env.BACKUP_PASSWORD))
  ]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function runBackup(env) {
  const raw = await env.TRACKER_KV.get(MAIN_KEY);
  if (!raw) return { ok: false, reason: 'No data to back up yet.' };

  const metaRaw = await env.TRACKER_KV.get(META_KEY);
  const meta = metaRaw ? JSON.parse(metaRaw) : { nextIndex: 0 };
  const idx  = meta.nextIndex % SLOT_COUNT;
  const savedAt = new Date().toISOString();

  await env.TRACKER_KV.put(slotKey(idx), JSON.stringify({ savedAt, data: raw }));
  await env.TRACKER_KV.put(META_KEY, JSON.stringify({ nextIndex: (idx + 1) % SLOT_COUNT }));

  return { ok: true, slot: idx, savedAt };
}

export default {
  // Fires automatically on the cron schedule defined in wrangler.toml
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runBackup(env));
  },

  // Manual endpoints, protected by their own BACKUP_PASSWORD (separate from the main app's password)
  async fetch(request, env) {
    if (!(await checkAuth(request, env))) return json({ error: 'Unauthorized' }, 401);

    const url = new URL(request.url);

    if (url.pathname === '/run' && request.method === 'POST') {
      return json(await runBackup(env));
    }

    if (url.pathname === '/list' && request.method === 'GET') {
      const slots = [];
      for (let i = 0; i < SLOT_COUNT; i++) {
        const raw = await env.TRACKER_KV.get(slotKey(i));
        slots.push(raw ? { slot: i, savedAt: JSON.parse(raw).savedAt } : { slot: i, empty: true });
      }
      return json({ slots });
    }

    const restoreMatch = url.pathname.match(/^\/restore\/([0-2])$/);
    if (restoreMatch && request.method === 'POST') {
      const idx = Number(restoreMatch[1]);
      const raw = await env.TRACKER_KV.get(slotKey(idx));
      if (!raw) return json({ error: 'That backup slot is empty' }, 404);
      let data;
      try {
        ({ data } = JSON.parse(raw));
        JSON.parse(data); // never restore something the app couldn't read back
      } catch {
        return json({ error: 'That backup slot is corrupt; nothing was changed' }, 422);
      }
      // A restore overwrites live data, so keep a copy of what's being replaced
      // (outside the 3 rotating slots) in case the wrong slot was picked.
      const current = await env.TRACKER_KV.get(MAIN_KEY);
      if (current) {
        await env.TRACKER_KV.put(PRE_RESTORE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), data: current }));
      }
      await env.TRACKER_KV.put(MAIN_KEY, data);
      return json({ ok: true, restoredSlot: idx, previousDataKeptAt: current ? PRE_RESTORE_KEY : null });
    }

    return json({ error: 'Not found. Use POST /run, GET /list, or POST /restore/0|1|2.' }, 404);
  }
};
