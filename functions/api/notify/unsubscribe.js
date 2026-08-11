import { verifySession } from '../../_lib/session.js';
import { readStore, writeStore, addNotifyOptOut } from '../../_lib/store.js';

function escHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// A plain, unauthenticated confirmation page — this link is clicked straight
// out of an email client, so there's no session/cookie to render a page inside.
function htmlPage(title, message, ok) {
  const badgeBg = ok ? 'linear-gradient(135deg,#14532d,#2f9e58)' : 'linear-gradient(135deg,#7a2a1f,#b3261e)';
  const glyph = ok ? '&#10003;' : '&#10005;';
  return new Response(`<!doctype html>
<html lang="en"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(title)}</title>
</head>
<body style="margin:0;background:#f4f6f5;font-family:'Segoe UI',Arial,sans-serif">
  <div style="max-width:420px;margin:64px auto;padding:0 16px">
    <div style="background:#ffffff;border-radius:16px;border:1px solid #e7ebe9;padding:36px 32px;text-align:center;box-shadow:0 8px 32px rgba(15,31,51,0.10)">
      <div style="width:48px;height:48px;border-radius:12px;margin:0 auto 16px;line-height:48px;background:${badgeBg};color:#ffffff;font-size:20px">${glyph}</div>
      <h1 style="margin:0 0 8px;font-size:19px;color:#1a1f1c">${escHtml(title)}</h1>
      <p style="margin:0;font-size:14px;color:#64726c;line-height:1.55">${escHtml(message)}</p>
    </div>
  </div>
</body></html>`, {
    status: ok ? 200 : 400,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

export async function onRequestGet({ request, env }) {
  const token = new URL(request.url).searchParams.get('token');
  const payload = token ? await verifySession(token, env.SESSION_SECRET) : null;

  if (!payload || payload.purpose !== 'notifyUnsub' || !payload.email) {
    return htmlPage(
      'Link invalid',
      'This unsubscribe link is invalid or has expired. Ask an admin to update your notification settings instead.',
      false
    );
  }

  const store = await readStore(env);
  addNotifyOptOut(store, payload.email);
  await writeStore(env, store);

  return htmlPage(
    'Unsubscribed',
    `${payload.email} won't receive new-request notification emails anymore. Your admin access to the tracker is unaffected.`,
    true
  );
}
