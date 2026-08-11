export const KV_KEY = 'tracker-data';

export function migrate(d) {
  if (!d || typeof d !== 'object') d = {};
  if (!Array.isArray(d.instructors)) d.instructors = [];
  if (!Array.isArray(d.employees)) d.employees = [];
  if (!Array.isArray(d.requests)) d.requests = [];
  if (!Array.isArray(d.auditLog)) d.auditLog = [];
  if (!Array.isArray(d.notifyOptOuts)) d.notifyOptOuts = [];
  [...d.instructors, ...d.employees].forEach(p => {
    if (typeof p.email !== 'string') p.email = '';
    if (!Array.isArray(p.vacations)) p.vacations = [];
  });
  return d;
}

export async function readStore(env) {
  const raw = await env.TRACKER_KV.get(KV_KEY);
  return migrate(raw ? JSON.parse(raw) : {});
}

export async function writeStore(env, store) {
  await env.TRACKER_KV.put(KV_KEY, JSON.stringify(store));
}

export function findPersonByEmail(store, email) {
  if (!email) return null;
  const lower = email.toLowerCase();
  for (const category of ['instructors', 'employees']) {
    const person = store[category].find(p => p.email && p.email.toLowerCase() === lower);
    if (person) return { person, category };
  }
  return null;
}

export function findPersonById(store, category, personId) {
  if (!category || !store[category]) return null;
  return store[category].find(p => p.id === personId) || null;
}

export function getAdminEmails(env) {
  return (env.ADMIN_EMAILS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

// Two independent ways an admin ends up excluded from the new-request
// notification email while keeping full admin access otherwise:
//  - ADMIN_EMAILS_NO_NOTIFY: an env-var exclude list another admin sets
//  - store.notifyOptOuts: self-serve, set by clicking the unsubscribe link
//    in the email itself (see functions/api/notify/unsubscribe.js) — kept in
//    KV rather than an env var so opting out doesn't require a redeploy.
export function getNotifyAdminEmails(env, store) {
  const envExcluded = new Set(
    (env.ADMIN_EMAILS_NO_NOTIFY || '')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean)
  );
  const optedOut = new Set((store?.notifyOptOuts || []).map(e => e.toLowerCase()));
  return getAdminEmails(env).filter(email => {
    const lower = email.toLowerCase();
    return !envExcluded.has(lower) && !optedOut.has(lower);
  });
}

export function addNotifyOptOut(store, email) {
  const lower = (email || '').trim().toLowerCase();
  if (!lower) return;
  if (!store.notifyOptOuts.some(e => e.toLowerCase() === lower)) {
    store.notifyOptOuts.push(lower);
  }
}

export function resolveRole(email, env) {
  const admins = getAdminEmails(env).map(e => e.toLowerCase());
  return admins.includes((email || '').toLowerCase()) ? 'admin' : 'staff';
}
