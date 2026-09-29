import { json } from '../../_lib/http.js';
import { readStore, writeStore, findPersonById, findPersonByEmail, getNotifyAdminEmails, normalizeLeaveType } from '../../_lib/store.js';
import { sendMail } from '../../_lib/graphMail.js';
import { approvedRequestEmail, staffApprovedEmail, buildUnsubscribeUrl } from '../../_lib/emailTemplates.js';

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function onRequestPost({ request, env, data, waitUntil }) {
  const session = data.session;
  if (!session) return json({ error: 'Unauthorized' }, 401);
  if (session.role !== 'admin') return json({ error: 'Forbidden' }, 403);

  let body;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }
  const { requestId, category } = body;
  if (!requestId) return json({ error: 'requestId is required' }, 400);

  const store = await readStore(env);
  const req = store.requests.find(r => r.id === requestId);
  if (!req) return json({ error: 'Request not found' }, 404);
  if (req.status !== 'pending') return json({ error: 'Request already decided' }, 409);

  let person;
  if (req.personId) {
    person = findPersonById(store, req.category, req.personId);
    if (!person) return json({ error: 'Staff record no longer exists' }, 404);
    // Normally unreachable (archiving closes pending requests), but a stale
    // admin tab could still try — never add time off to an archived record.
    if (person.archived) {
      return json({ error: `${person.name} is archived — unarchive them first if this request should still be approved.` }, 409);
    }
  } else {
    // Same guard for a first-time request whose email has since been linked
    // to a record that's now archived — creating a new record here would
    // split that person's history across two profiles.
    const existingByEmail = findPersonByEmail(store, req.submittedByEmail);
    if (existingByEmail && existingByEmail.person.archived) {
      return json({ error: `${existingByEmail.person.name} is archived — unarchive them first if this request should still be approved.` }, 409);
    }
    // First-ever request from this person — no record exists yet, so this
    // approval both creates their profile (linked to the email they signed in
    // with) and files their first vacation entry under the chosen category.
    if (category !== 'instructors' && category !== 'employees') {
      return json({ error: 'category (instructors or employees) is required to approve a first-time request' }, 400);
    }
    person = { id: uid(), name: req.personName, email: req.submittedByEmail, vacations: [] };
    store[category].push(person);
    req.personId = person.id;
    req.category = category;
  }

  const vacation = {
    id: uid(),
    leaveType: normalizeLeaveType(req.leaveType),
    startDate: req.startDate,
    endDate: req.endDate,
    note: req.note,
    worksSaturday: req.worksSaturday,
    halfDay: !!req.halfDay,
    halfDayFrom: req.halfDay ? req.halfDayFrom : '',
    createdAt: Date.now(),
    fromRequestId: req.id
  };
  person.vacations.push(vacation);

  req.status = 'approved';
  req.decidedAt = Date.now();
  req.decidedByEmail = session.email;

  await writeStore(env, store);

  // Same best-effort, fire-and-forget, one-per-recipient pattern as the
  // new-request notification in requests/submit.js — see the comment there.
  const adminEmails = getNotifyAdminEmails(env, store);
  const emailTasks = [];
  if (adminEmails.length) {
    emailTasks.push(Promise.allSettled(adminEmails.map(async adminEmail => {
      const unsubscribeUrl = await buildUnsubscribeUrl(env, adminEmail);
      const { subject, html, text } = approvedRequestEmail(req, env.APP_BASE_URL, unsubscribeUrl);
      return sendMail(env, { toEmails: [adminEmail], subject, html, text });
    })).then(results => {
      results.forEach((r, i) => {
        if (r.status === 'rejected') console.error(`Approval email to ${adminEmails[i]} failed:`, r.reason);
      });
    }));
  }

  // Confirm to the staff member this request actually belongs to — always
  // sent, unlike the admin copies above, since it's a direct confirmation of
  // their own request rather than a subscribable admin notification stream
  // (not gated by notifyOptOuts, which only governs that admin stream).
  if (req.submittedByEmail) {
    const { subject, html, text } = staffApprovedEmail(req, env.APP_BASE_URL);
    emailTasks.push(
      sendMail(env, { toEmails: [req.submittedByEmail], subject, html, text })
        .catch(e => console.error(`Approval confirmation email to ${req.submittedByEmail} failed:`, e))
    );
  }

  if (emailTasks.length) {
    const notify = Promise.allSettled(emailTasks);
    if (waitUntil) waitUntil(notify); else await notify;
  }

  return json({ ok: true, request: req, vacation });
}
