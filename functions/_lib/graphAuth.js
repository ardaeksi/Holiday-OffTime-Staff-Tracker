// Shared Microsoft Graph app-only (client credentials) token acquisition —
// used by graphMail.js (Mail.Send) and graphUsers.js (User.ReadBasic.All).
// Cached in module scope so a warm isolate reuses the token across requests
// instead of round-tripping to Azure AD on every Graph call.
let cachedToken = null; // { value, expiresAt }

export async function getAppOnlyToken(env) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.value;
  }
  const params = new URLSearchParams({
    client_id: env.AZURE_CLIENT_ID,
    client_secret: env.AZURE_CLIENT_SECRET,
    grant_type: 'client_credentials',
    scope: 'https://graph.microsoft.com/.default'
  });
  const resp = await fetch(`https://login.microsoftonline.com/${env.AZURE_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  if (!resp.ok) {
    throw new Error(`Graph app-only token request failed: ${resp.status} ${await resp.text()}`);
  }
  const body = await resp.json();
  cachedToken = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return cachedToken.value;
}
