const authBase = (tenantId) => `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0`;

const SCOPE = 'openid profile email';

export function buildAuthorizeUrl(env, state) {
  const params = new URLSearchParams({
    client_id: env.AZURE_CLIENT_ID,
    response_type: 'code',
    redirect_uri: env.AZURE_REDIRECT_URI,
    response_mode: 'query',
    scope: SCOPE,
    state
  });
  return `${authBase(env.AZURE_TENANT_ID)}/authorize?${params.toString()}`;
}

export async function exchangeCodeForTokens(env, code) {
  const params = new URLSearchParams({
    client_id: env.AZURE_CLIENT_ID,
    client_secret: env.AZURE_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: env.AZURE_REDIRECT_URI,
    scope: SCOPE
  });
  const resp = await fetch(`${authBase(env.AZURE_TENANT_ID)}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  if (!resp.ok) return null;
  return resp.json();
}

function b64urlDecodeToString(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// The id_token is fetched directly from Microsoft's /token endpoint over an
// HTTPS call authenticated with our client secret (never handled by the
// browser), so there's no untrusted hop to forge it on — we validate the
// claims that matter for this app instead of doing full JWKS/RS256 verification.
export function decodeIdToken(idToken, env) {
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  let payload;
  try {
    payload = JSON.parse(b64urlDecodeToString(parts[1]));
  } catch {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== env.AZURE_CLIENT_ID) return null;
  if (payload.tid !== env.AZURE_TENANT_ID) return null;
  if (payload.iss !== `https://login.microsoftonline.com/${env.AZURE_TENANT_ID}/v2.0`) return null;
  if (!payload.exp || payload.exp < now) return null;
  return payload;
}
