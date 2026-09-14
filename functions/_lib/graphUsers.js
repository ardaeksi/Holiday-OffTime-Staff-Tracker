// Looks up a tenant user's display name from their sign-in email via
// Microsoft Graph, using the same app-only (client credentials) token as
// graphMail.js. Requires the Azure app registration to have the Graph
// *Application* permission `User.ReadBasic.All` with tenant admin consent
// granted — see "Add Staff Member" in the README. Used only to prefill a new
// staff member's name when an admin adds them by email; unrelated to sign-in.
import { getAppOnlyToken } from './graphAuth.js';

// Returns { displayName, mail, userPrincipalName } for a user in this tenant,
// or null if no account with that email/UPN exists here. Throws on any other
// failure (e.g. the permission above hasn't been granted yet) so callers can
// tell "not in this tenant" apart from "couldn't check."
export async function lookupUserByEmail(env, email) {
  const token = await getAppOnlyToken(env);
  const resp = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}?$select=displayName,mail,userPrincipalName`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (resp.status === 404) return null;
  if (!resp.ok) {
    throw new Error(`Graph user lookup failed: ${resp.status} ${await resp.text()}`);
  }
  const body = await resp.json();
  return {
    displayName: body.displayName || '',
    mail: body.mail || '',
    userPrincipalName: body.userPrincipalName || ''
  };
}
