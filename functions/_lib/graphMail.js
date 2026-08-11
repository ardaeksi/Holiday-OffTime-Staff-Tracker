// Sends mail via Microsoft Graph using an app-only (client credentials) token —
// distinct from the delegated sign-in flow in msEntra.js. Requires the Azure
// app registration to have the Graph *Application* permission `Mail.Send`
// with tenant admin consent granted, and GRAPH_SENDER_EMAIL set to a real
// mailbox in the tenant to send from.

// Cached in module scope so a warm isolate reuses the token across requests
// instead of round-tripping to Azure AD on every email.
let cachedToken = null; // { value, expiresAt }

async function getAppOnlyToken(env) {
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

// Best-effort notification send — callers should not let a failure here block
// the API action that triggered it (e.g. a request submission should still
// succeed even if the admin notification email fails to send).
export async function sendMail(env, { toEmails, subject, html, text }) {
  const recipients = (toEmails || []).filter(Boolean);
  if (!recipients.length) return;
  if (!env.GRAPH_SENDER_EMAIL) {
    throw new Error('GRAPH_SENDER_EMAIL is not configured — cannot send notification email');
  }

  const token = await getAppOnlyToken(env);
  const message = {
    message: {
      subject,
      body: { contentType: 'HTML', content: html || `<p>${text || ''}</p>` },
      toRecipients: recipients.map(address => ({ emailAddress: { address } }))
    },
    saveToSentItems: false
  };
  const resp = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(env.GRAPH_SENDER_EMAIL)}/sendMail`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(message)
  });
  if (!resp.ok) {
    throw new Error(`Graph sendMail failed: ${resp.status} ${await resp.text()}`);
  }
}
