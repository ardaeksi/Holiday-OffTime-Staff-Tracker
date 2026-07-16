import { buildAuthorizeUrl } from '../../_lib/msEntra.js';
import { serializeCookie } from '../../_lib/session.js';

export async function onRequestGet({ env }) {
  const state = crypto.randomUUID();
  const url = buildAuthorizeUrl(env, state);
  const headers = new Headers();
  headers.set('Location', url);
  headers.set('Set-Cookie', serializeCookie('oauth_state', state, { path: '/api/auth', maxAge: 600 }));
  return new Response(null, { status: 302, headers });
}
