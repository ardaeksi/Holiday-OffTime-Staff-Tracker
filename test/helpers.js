// Shared test scaffolding — an in-memory stand-in for Cloudflare KV, a fake
// admin/staff session, and a global.fetch stub so tests never hit the real
// network (Microsoft login / Graph) even when a handler under test fires a
// best-effort notification email as a side effect.
//
// No test framework dependency — these run on Node's built-in `node:test`
// (see package.json's "test" script), matching the app's own zero-dependency,
// no-build philosophy (see README "Local Development").

import { KV_KEY } from '../functions/_lib/store.js';

export function makeKv(seed) {
  const data = new Map();
  if (seed !== undefined) data.set(KV_KEY, JSON.stringify(seed));
  return {
    async get(key) { return data.has(key) ? data.get(key) : null; },
    async put(key, value) { data.set(key, value); },
    // Test-only escape hatch to inspect what a handler actually persisted.
    _dump(key = KV_KEY) {
      const v = data.get(key);
      return v ? JSON.parse(v) : null;
    }
  };
}

export function makeEnv(overrides = {}) {
  const { seed, ...rest } = overrides;
  return {
    TRACKER_KV: makeKv(seed),
    ADMIN_EMAILS: '',
    AZURE_TENANT_ID: 'test-tenant',
    AZURE_CLIENT_ID: 'test-client',
    AZURE_CLIENT_SECRET: 'test-secret',
    ...rest
  };
}

export function adminSession(email = 'admin@canadianallcare.com') {
  return { session: { role: 'admin', email } };
}

export function staffSession(email = 'staff@canadianallcare.com') {
  return { session: { role: 'staff', email } };
}

export function jsonRequest(url, body) {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

// Replaces global.fetch for the duration of `fn`, then restores it — even if
// `fn` throws. `handlers` is [ [urlSubstring, async (url, opts) => Response], ... ],
// checked in order; anything unmatched gets a harmless 200 so a handler's
// best-effort/fire-and-forget email side effects never touch the real network
// or fail the test they're incidental to.
export async function withFetch(handlers, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const u = String(url);
    for (const [substr, handler] of handlers) {
      if (u.includes(substr)) return handler(u, opts);
    }
    return new Response('{}', { status: 200 });
  };
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

// A ready-made handler list for tests that don't care about Graph calls at
// all — just needs them to not hit the network. Covers the app-only token
// endpoint (so any sendMail/lookupUserByEmail call under the hood succeeds
// far enough not to throw) plus a generic Graph fallback.
export const NOOP_GRAPH_HANDLERS = [
  ['login.microsoftonline.com', async () => new Response(JSON.stringify({ access_token: 'fake-token', expires_in: 3600 }), { status: 200 })],
  ['graph.microsoft.com', async () => new Response('{}', { status: 200 })]
];
