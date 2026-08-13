// Notification email content. Kept separate from the sending logic (graphMail.js)
// so the templates can be redesigned without touching how mail gets delivered.
// Layout uses tables + inline styles throughout (not flexbox/grid) because this
// is read mostly in Outlook, whose desktop rendering engine ignores most modern CSS.

import { signSession } from './session.js';

const UNSUBSCRIBE_TOKEN_TTL_MS = 10 * 365 * 24 * 60 * 60 * 1000; // effectively permanent
const BUTTON_COLOR = '#f97316'; // orange — the app's one shared accent regardless of which panel/theme it's used in

function escHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtDateForEmail(str) {
  const [y, m, d] = str.split('-');
  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m - 1] + ' ' + (+d) + ', ' + y;
}

// Cloudflare Workers run in UTC, so this reads as UTC — not the recipient's
// local time. Good enough for "approved on" context; not worth chasing a
// per-recipient timezone for a Workers runtime.
function fmtDateTimeForEmail(ms) {
  const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const d = new Date(ms);
  const period = d.getUTCHours() >= 12 ? 'PM' : 'AM';
  const h12 = d.getUTCHours() % 12 === 0 ? 12 : d.getUTCHours() % 12;
  return `${MN[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}, ${h12}:${String(d.getUTCMinutes()).padStart(2, '0')} ${period} UTC`;
}

function dateRangeLine(req) {
  return req.halfDay
    ? `${fmtDateForEmail(req.startDate)} (half day, off from ${req.halfDayFrom || 'TBD'})`
    : (req.startDate === req.endDate ? fmtDateForEmail(req.startDate) : `${fmtDateForEmail(req.startDate)} – ${fmtDateForEmail(req.endDate)}`);
}

function normalizeBaseUrl(url) {
  return String(url).replace(/\/+$/, '');
}

// A signed, essentially non-expiring capability link — clicking it is the
// only "auth" needed, same one-click pattern every mailing-list tool uses.
// Reuses session.js's HMAC sign/verify rather than rolling new crypto; the
// `purpose` field keeps it from being mistaken for a real login session by
// anything else that happens to verify a token.
export async function buildUnsubscribeUrl(env, email) {
  if (!env.APP_BASE_URL || !env.SESSION_SECRET) return null;
  const token = await signSession(
    { email, purpose: 'notifyUnsub', exp: Date.now() + UNSUBSCRIBE_TOKEN_TTL_MS },
    env.SESSION_SECRET
  );
  return `${normalizeBaseUrl(env.APP_BASE_URL)}/api/notify/unsubscribe?token=${encodeURIComponent(token)}`;
}

// ── Shared card shell — every notification email is a white rounded card on
// a grey ground: a colored header (varies by email), a labeled-fields table,
// an optional button, then the same admin/unsubscribe footer on all of them.
function emailShell({ headerHtml, bodyHtml, buttonHtml, unsubscribeUrl }) {
  const unsubscribeHtml = unsubscribeUrl
    ? `<p style="margin:6px 0 0;font-size:11px;line-height:1.5"><a href="${escHtml(unsubscribeUrl)}" style="color:#8a948f;text-decoration:underline">Unsubscribe from these notifications</a></p>`
    : '';
  return `
<div style="background:#f4f6f5;padding:32px 16px;font-family:'Segoe UI',Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;border:1px solid #e7ebe9;overflow:hidden">
    ${headerHtml}
    ${bodyHtml}
    ${buttonHtml || ''}
    <tr>
      <td style="padding:16px 32px 28px;border-top:1px solid #e7ebe9;text-align:center">
        <p style="margin:0;font-size:11px;color:#8a948f;line-height:1.5">Canadian All Care College — you're getting this because you're listed as an admin on the tracker.</p>
        ${unsubscribeHtml}
      </td>
    </tr>
  </table>
</div>`.trim();
}

function actionButtonHtml(base, label) {
  return base ? `
        <tr>
          <td style="padding:26px 32px 34px;text-align:center;">
            <a href="${escHtml(base)}" style="display:inline-block;background:${BUTTON_COLOR};color:#ffffff;font-size:14px;font-weight:700;font-family:'Segoe UI',Arial,sans-serif;text-decoration:none;padding:13px 32px;border-radius:999px;">${escHtml(label)}</a>
          </td>
        </tr>` : '';
}

// rows: [[label, valueHtml], ...] — valueHtml is trusted (call escHtml yourself first)
function detailsTableHtml(rows) {
  const rowsHtml = rows.map(([label, valueHtml]) => `
                <tr>
                  <td style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;color:#8a948f;padding:5px 0;width:92px;vertical-align:top;white-space:nowrap">${escHtml(label)}</td>
                  <td style="font-size:13px;color:#1a1f1c;padding:5px 0;line-height:1.5">${valueHtml}</td>
                </tr>`).join('');
  return `
    <tr>
      <td style="padding:22px 32px 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6f5;border-radius:12px">
          <tr>
            <td style="padding:16px 20px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rowsHtml}
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

// req: a request object as stored by /api/requests/submit (see functions/api/requests/submit.js)
// appUrl: env.APP_BASE_URL — used for the logo, the button link, and building the unsubscribe link
// unsubscribeUrl: this recipient's personal link, from buildUnsubscribeUrl() above (or null to omit it)
export function newRequestNotificationEmail(req, appUrl, unsubscribeUrl) {
  const subject = `${req.personName} put a new request on Vacation Tracker!`;
  const dateLine = dateRangeLine(req);
  const noteLine = req.note ? escHtml(req.note) : '<span style="color:#8a948f;font-style:italic">No description provided</span>';
  const base = appUrl ? normalizeBaseUrl(appUrl) : null;
  const logoUrl = base ? `${base}/icon-192.png` : null;
  const logoHtml = logoUrl
    ? `<img src="${escHtml(logoUrl)}" width="56" height="56" alt="" style="display:block;margin:0 auto 12px;border-radius:12px;border:0">`
    : '';

  const headerHtml = `
    <tr>
      <td style="background:linear-gradient(135deg,#0f1f33 0%,#1c3a5c 60%,#14532d 100%);padding:28px 32px;text-align:center">
        ${logoHtml}
        <p style="margin:0;color:rgba(255,255,255,0.65);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px">Holiday / Off Time Staff Tracker</p>
      </td>
    </tr>`;

  const bodyHtml = `
    <tr>
      <td style="padding:30px 32px 6px;text-align:center">
        <h1 style="margin:0 0 8px;font-size:21px;font-weight:800;color:#1a1f1c;line-height:1.3">New time-off request</h1>
        <p style="margin:0;font-size:14px;color:#64726c;line-height:1.5"><strong style="color:#1a1f1c">${escHtml(req.personName)}</strong> submitted a request — it's waiting for your review.</p>
      </td>
    </tr>` + detailsTableHtml([
      ['Dates', escHtml(dateLine)],
      ['Note', noteLine]
    ]);

  const html = emailShell({ headerHtml, bodyHtml, buttonHtml: actionButtonHtml(base, 'Review Request'), unsubscribeUrl });

  const text = `${req.personName} submitted a new time-off request.
Dates: ${dateLine}
Note: ${req.note || 'No description provided'}
${base ? `\nReview it: ${base}` : ''}

Canadian All Care College — you're getting this because you're listed as an admin on the tracker.${unsubscribeUrl ? `\nUnsubscribe: ${unsubscribeUrl}` : ''}`;

  return { subject, html, text };
}

// req: a request object as stored after /api/requests/approve marks it approved
// (has decidedAt/decidedByEmail set — see functions/api/requests/approve.js)
export function approvedRequestEmail(req, appUrl, unsubscribeUrl) {
  const subject = `${req.personName}'s time off request was approved!`;
  const dateLine = dateRangeLine(req);
  const noteLine = req.note ? escHtml(req.note) : '<span style="color:#8a948f;font-style:italic">No reason given</span>';
  const decidedByLine = req.decidedByEmail ? escHtml(req.decidedByEmail) : 'unknown';
  const decidedOnLine = req.decidedAt ? escHtml(fmtDateTimeForEmail(req.decidedAt)) : '—';
  const base = appUrl ? normalizeBaseUrl(appUrl) : null;

  // A CSS checkmark badge, not an image — approvals should read as "done" the
  // instant the email opens, even in clients that block remote images by default.
  const checkBadgeHtml = `<div style="width:56px;height:56px;line-height:52px;border-radius:50%;background:rgba(255,255,255,0.16);border:2px solid rgba(255,255,255,0.55);margin:0 auto 12px;font-size:28px;font-weight:700;color:#ffffff;font-family:Arial,sans-serif">&#10003;</div>`;

  const headerHtml = `
    <tr>
      <td style="background:linear-gradient(135deg,#14532d 0%,#1b6b3a 55%,#3aad6a 100%);padding:28px 32px;text-align:center">
        ${checkBadgeHtml}
        <p style="margin:0;color:rgba(255,255,255,0.7);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px">Holiday / Off Time Staff Tracker</p>
      </td>
    </tr>`;

  const bodyHtml = `
    <tr>
      <td style="padding:30px 32px 6px;text-align:center">
        <h1 style="margin:0 0 8px;font-size:21px;font-weight:800;color:#1a1f1c;line-height:1.3">Vacation approved</h1>
        <p style="margin:0;font-size:14px;color:#64726c;line-height:1.5"><strong style="color:#1a1f1c">${escHtml(req.personName)}</strong>'s time-off request has been approved.</p>
      </td>
    </tr>` + detailsTableHtml([
      ['Dates', escHtml(dateLine)],
      ['Note', noteLine],
      ['Approved By', decidedByLine],
      ['Approved On', decidedOnLine]
    ]);

  const html = emailShell({ headerHtml, bodyHtml, buttonHtml: actionButtonHtml(base, 'View in Tracker'), unsubscribeUrl });

  const text = `${req.personName}'s time-off request was approved.
Dates: ${dateLine}
Note: ${req.note || 'No reason given'}
Approved by: ${req.decidedByEmail || 'unknown'}
Approved on: ${req.decidedAt ? fmtDateTimeForEmail(req.decidedAt) : '—'}
${base ? `\nView it: ${base}` : ''}

Canadian All Care College — you're getting this because you're listed as an admin on the tracker.${unsubscribeUrl ? `\nUnsubscribe: ${unsubscribeUrl}` : ''}`;

  return { subject, html, text };
}
