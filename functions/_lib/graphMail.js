// Sends mail via Microsoft Graph using an app-only (client credentials) token —
// distinct from the delegated sign-in flow in msEntra.js. Requires the Azure
// app registration to have the Graph *Application* permission `Mail.Send`
// with tenant admin consent granted, and GRAPH_SENDER_EMAIL set to a real
// mailbox in the tenant to send from.
import { getAppOnlyToken } from './graphAuth.js';

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
