import { json } from '../../_lib/http.js';
import { clearSessionCookieHeader } from '../../_lib/session.js';

export async function onRequestPost() {
  return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookieHeader() });
}
