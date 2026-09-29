export const KV_KEY = 'tracker-data';

// The only two leave types the app knows about. Anything else (missing field
// on data older than this feature, a bad value from a buggy/old client, etc.)
// normalizes to 'vacation' — the type every entry implicitly was before this
// distinction existed, so old data keeps meaning what it always meant.
export function normalizeLeaveType(v) {
  return v === 'sick' ? 'sick' : 'vacation';
}

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
    p.vacations.forEach(v => { v.leaveType = normalizeLeaveType(v.leaveType); });
    // Archiving (ex-staff) is a flag on the record itself, not a move to a
    // separate list/key — the person, their vacations, and every request and
    // audit entry pointing at their id stay exactly where they were, so
    // archive/unarchive can never lose or orphan history. Anything that isn't
    // literally `true` (including every record older than this feature) is active.
    p.archived = p.archived === true;
  });
  d.requests.forEach(r => { r.leaveType = normalizeLeaveType(r.leaveType); });
  return d;
}

export async function readStore(env) {
  const raw = await env.TRACKER_KV.get(KV_KEY);
  return migrate(raw ? JSON.parse(raw) : {});
}

export async function writeStore(env, store) {
  await env.TRACKER_KV.put(KV_KEY, JSON.stringify(store));
}

// Archived records are still matched (an ex-employee signing in must resolve
// to their archived record, not look like a brand-new first-time requester),
// but an active record with the same email always wins over an archived one.
export function findPersonByEmail(store, email) {
  if (!email) return null;
  const lower = email.toLowerCase();
  for (const wantArchived of [false, true]) {
    for (const category of ['instructors', 'employees']) {
      const person = store[category].find(p =>
        p.email && p.email.toLowerCase() === lower && !!p.archived === wantArchived
      );
      if (person) return { person, category };
    }
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
//  - store.notifyOptOuts: self-serve, toggled from the "Notifications"
//    button in the app (or the unsubscribe link in the email) — kept in KV
//    rather than an env var so it takes effect without a redeploy.
export function isNotifyExcludedByEnv(env, email) {
  const lower = (email || '').toLowerCase();
  return (env.ADMIN_EMAILS_NO_NOTIFY || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(lower);
}

export function isNotifyOptedOut(store, email) {
  const lower = (email || '').toLowerCase();
  return (store?.notifyOptOuts || []).some(e => e.toLowerCase() === lower);
}

export function getNotifyAdminEmails(env, store) {
  return getAdminEmails(env).filter(email =>
    !isNotifyExcludedByEnv(env, email) && !isNotifyOptedOut(store, email)
  );
}

export function addNotifyOptOut(store, email) {
  const lower = (email || '').trim().toLowerCase();
  if (!lower) return;
  if (!isNotifyOptedOut(store, lower)) store.notifyOptOuts.push(lower);
}

export function removeNotifyOptOut(store, email) {
  const lower = (email || '').trim().toLowerCase();
  store.notifyOptOuts = store.notifyOptOuts.filter(e => e.toLowerCase() !== lower);
}

// Audit entries record "when" under a verb-specific field (deletedAt,
// addedAt, ...) so each reads naturally on its own; this lets callers that
// need to sort or compare across mixed entry types do so without caring
// which verb produced a given entry.
export function auditEntryTimestamp(entry) {
  return entry.deletedAt ?? entry.addedAt ?? entry.archivedAt ?? entry.unarchivedAt ?? 0;
}

export function resolveRole(email, env) {
  const admins = getAdminEmails(env).map(e => e.toLowerCase());
  return admins.includes((email || '').toLowerCase()) ? 'admin' : 'staff';
}
