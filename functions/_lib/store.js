export const KV_KEY = 'tracker-data';

export function migrate(d) {
  if (!d || typeof d !== 'object') d = {};
  if (!Array.isArray(d.instructors)) d.instructors = [];
  if (!Array.isArray(d.employees)) d.employees = [];
  if (!Array.isArray(d.requests)) d.requests = [];
  if (!Array.isArray(d.auditLog)) d.auditLog = [];
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

export function resolveRole(email, env) {
  const admins = (env.ADMIN_EMAILS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes((email || '').toLowerCase()) ? 'admin' : 'staff';
}
