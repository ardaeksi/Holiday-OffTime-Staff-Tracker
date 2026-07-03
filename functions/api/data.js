const KV_KEY = 'tracker-data';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'  // never let Cloudflare or the browser cache API responses
    }
  });
}

function checkAuth(request, env) {
  const pw = request.headers.get('X-App-Password');
  return env.APP_PASSWORD && pw === env.APP_PASSWORD;
}

export async function onRequestGet({ request, env }) {
  if (!checkAuth(request, env)) return json({ error: 'Unauthorized' }, 401);
  try {
    const raw = await env.TRACKER_KV.get(KV_KEY);
    return json(raw ? JSON.parse(raw) : { instructors: [], employees: [] });
  } catch {
    return json({ error: 'Storage read failed' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  if (!checkAuth(request, env)) return json({ error: 'Unauthorized' }, 401);
  try {
    const body = await request.text();
    JSON.parse(body); // validate
    await env.TRACKER_KV.put(KV_KEY, body);
    return json({ ok: true });
  } catch {
    return json({ error: 'Invalid data' }, 400);
  }
}
