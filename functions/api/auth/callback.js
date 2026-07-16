import { exchangeCodeForTokens, decodeIdToken } from '../../_lib/msEntra.js';
import { parseCookies, signSession, sessionCookieHeader, serializeCookie, SESSION_TTL_MS } from '../../_lib/session.js';
import { readStore, writeStore, findPersonByEmail, resolveRole } from '../../_lib/store.js';

function redirectToLoginError(clearStateCookie) {
  const headers = new Headers();
  headers.set('Location', '/?loginError=1');
  headers.append('Set-Cookie', clearStateCookie);
  return new Response(null, { status: 302, headers });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');
  const expectedState = parseCookies(request).oauth_state;
  const clearStateCookie = serializeCookie('oauth_state', '', { path: '/api/auth', maxAge: 0 });

  if (oauthError || !code || !state || !expectedState || state !== expectedState) {
    return redirectToLoginError(clearStateCookie);
  }

  const tokens = await exchangeCodeForTokens(env, code);
  if (!tokens || !tokens.id_token) return redirectToLoginError(clearStateCookie);

  const payload = decodeIdToken(tokens.id_token, env);
  if (!payload) return redirectToLoginError(clearStateCookie);

  const email = (payload.email || payload.preferred_username || payload.upn || '').toLowerCase();
  if (!email) return redirectToLoginError(clearStateCookie);
  const name = payload.name || email;
  const role = resolveRole(email, env);

  const store = await readStore(env);
  const match = findPersonByEmail(store, email);

  // Keep the person record's display name in lockstep with their current Azure name.
  if (match && name && match.person.name !== name) {
    match.person.name = name;
    await writeStore(env, store);
  }

  const now = Date.now();
  const session = {
    email,
    name,
    role,
    personId: match ? match.person.id : null,
    personCategory: match ? match.category : null,
    personName: match ? match.person.name : null,
    iat: now,
    exp: now + SESSION_TTL_MS
  };

  const token = await signSession(session, env.SESSION_SECRET);

  const headers = new Headers();
  headers.set('Location', '/');
  headers.append('Set-Cookie', clearStateCookie);
  headers.append('Set-Cookie', sessionCookieHeader(token));
  return new Response(null, { status: 302, headers });
}
