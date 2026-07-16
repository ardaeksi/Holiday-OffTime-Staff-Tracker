export const COOKIE_NAME = 'tracker_session';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function b64urlEncode(bytes) {
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function signSession(payload, secret) {
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const sig = b64urlEncode(new Uint8Array(sigBuf));
  return `${body}.${sig}`;
}

export async function verifySession(token, secret) {
  if (!token || !secret) return null;
  const dot = token.lastIndexOf('.');
  if (dot === -1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const key = await hmacKey(secret);
  let valid;
  try {
    valid = await crypto.subtle.verify('HMAC', key, b64urlDecode(sig), new TextEncoder().encode(body));
  } catch {
    return null;
  }
  if (!valid) return null;
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
  } catch {
    return null;
  }
  if (!payload.exp || payload.exp < Date.now()) return null;
  return payload;
}

export function parseCookies(request) {
  const header = request.headers.get('Cookie') || '';
  const out = {};
  header.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

export function serializeCookie(name, value, opts = {}) {
  let str = `${name}=${encodeURIComponent(value)}`;
  str += `; Path=${opts.path || '/'}`;
  if (opts.maxAge !== undefined) str += `; Max-Age=${opts.maxAge}`;
  str += '; HttpOnly; Secure; SameSite=Lax';
  return str;
}

export async function getSession(request, env) {
  const cookies = parseCookies(request);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  return verifySession(token, env.SESSION_SECRET);
}

export function sessionCookieHeader(token) {
  return serializeCookie(COOKIE_NAME, token, { maxAge: Math.floor(SESSION_TTL_MS / 1000) });
}

export function clearSessionCookieHeader() {
  return serializeCookie(COOKIE_NAME, '', { maxAge: 0 });
}
