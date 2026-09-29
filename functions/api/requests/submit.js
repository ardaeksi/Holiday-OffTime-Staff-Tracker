import { json } from '../../_lib/http.js';
import { readStore, writeStore, findPersonByEmail, getNotifyAdminEmails, normalizeLeaveType } from '../../_lib/store.js';
import { sendMail } from '../../_lib/graphMail.js';
import { newRequestNotificationEmail, buildUnsubscribeUrl } from '../../_lib/emailTemplates.js';

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function isOffDay(dow, worksSaturday) {
  if (dow === 0) return false; // Sunday never counts
  if (dow === 6) return !!worksSaturday;
  return true;
}

function countOffDays(startDate, endDate, worksSaturday) {
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  if (isNaN(start) || isNaN(end) || end < start) return 0;
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    if (isOffDay(cur.getDay(), worksSaturday)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

export async function onRequestPost({ request, env, data, waitUntil }) {
  const session = data.session;
  if (!session) return json({ error: 'Unauthorized' }, 401);
  // No linked person record yet is fine — this becomes their first-ever request,
  // and an admin assigns them to Instructors/Employees when they approve it.

  let body;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }

  const { startDate, endDate, note, worksSaturday, halfDay, halfDayFrom } = body;
  const leaveType = normalizeLeaveType(body.leaveType);
  if (!startDate || !endDate) return json({ error: 'Start and end date are required.' }, 400);
  if (endDate < startDate) return json({ error: 'End date must be on or after the start date.' }, 400);

  if (halfDay) {
    if (startDate !== endDate) return json({ error: 'A half day must be a single date.' }, 400);
    const d = new Date(startDate + 'T00:00:00');
    if (isNaN(d) || !isOffDay(d.getDay(), !!worksSaturday)) {
      return json({ error: 'That date is not a working day.' }, 400);
    }
    if (!halfDayFrom) return json({ error: 'A start time is required for a half day.' }, 400);
  } else if (countOffDays(startDate, endDate, !!worksSaturday) < 1) {
    return json({ error: 'Duration must be at least 1 day.' }, 400);
  }

  const store = await readStore(env);
  // Looked up fresh rather than trusting the session's snapshot — same reason
  // as /api/data and /api/auth/me: a record may have been linked since sign-in.
  const match = findPersonByEmail(store, session.email);
  // An archived (ex-)staff member can still sign in and see their history,
  // but can't file new time off. Checked here, server-side, not just by hiding
  // the button — and must not fall through to the "no record yet" path, or
  // approving it would create a second, duplicate record for them.
  if (match && match.person.archived) {
    return json({
      error: 'Your staff profile has been archived, so new time-off requests are closed. If this is a mistake, please contact an administrator.',
      code: 'archived'
    }, 403);
  }
  const requestObj = {
    id: uid(),
    category: match ? match.category : null,
    personId: match ? match.person.id : null,
    personName: match ? match.person.name : session.name,
    submittedByEmail: session.email,
    leaveType,
    startDate,
    endDate,
    note: (note || '').trim().slice(0, 500),
    worksSaturday: !!worksSaturday,
    halfDay: !!halfDay,
    halfDayFrom: halfDay ? String(halfDayFrom).slice(0, 5) : '',
    status: 'pending',
    createdAt: Date.now(),
    decidedAt: null,
    decidedByEmail: null,
    denialReason: null
  };
  store.requests.push(requestObj);
  await writeStore(env, store);

  // Best-effort admin notification — must never block or fail the submission
  // itself, so it's dispatched via waitUntil (fire-and-forget past the
  // response). Sent one-per-recipient (not a single multi-recipient email)
  // because each admin's copy carries their own unsubscribe link, and this
  // also keeps admins from seeing each other's addresses in the To: line.
  const adminEmails = getNotifyAdminEmails(env, store);
  if (adminEmails.length) {
    const notify = Promise.allSettled(adminEmails.map(async adminEmail => {
      const unsubscribeUrl = await buildUnsubscribeUrl(env, adminEmail);
      const { subject, html, text } = newRequestNotificationEmail(requestObj, env.APP_BASE_URL, unsubscribeUrl);
      return sendMail(env, { toEmails: [adminEmail], subject, html, text });
    })).then(results => {
      results.forEach((r, i) => {
        if (r.status === 'rejected') console.error(`Notification email to ${adminEmails[i]} failed:`, r.reason);
      });
    });
    if (waitUntil) waitUntil(notify); else await notify;
  }

  return json({ ok: true, request: requestObj }, 201);
}
