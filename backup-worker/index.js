const MAIN_KEY   = 'tracker-data';
const META_KEY   = 'backup:meta';
const SLOT_COUNT = 3;

function slotKey(i) { return `backup:${i}`; }

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

function checkAuth(request, env) {
  const pw = request.headers.get('X-Backup-Password');
  return env.BACKUP_PASSWORD && pw === env.BACKUP_PASSWORD;
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
    if (!checkAuth(request, env)) return json({ error: 'Unauthorized' }, 401);

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
      const { data } = JSON.parse(raw);
      await env.TRACKER_KV.put(MAIN_KEY, data);
      return json({ ok: true, restoredSlot: idx });
    }

    return json({ error: 'Not found. Use POST /run, GET /list, or POST /restore/0|1|2.' }, 404);
  }
};
