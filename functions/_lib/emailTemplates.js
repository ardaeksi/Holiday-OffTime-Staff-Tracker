// Notification email content. Kept separate from the sending logic (graphMail.js)
// so the templates can be redesigned without touching how mail gets delivered.
// Layout uses tables + inline styles throughout (not flexbox/grid) because this
// is read mostly in Outlook, whose desktop rendering engine ignores most modern CSS.

import { signSession } from './session.js';

const UNSUBSCRIBE_TOKEN_TTL_MS = 10 * 365 * 24 * 60 * 60 * 1000; // effectively permanent

function escHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtDateForEmail(str) {
  const [y, m, d] = str.split('-');
  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m - 1] + ' ' + (+d) + ', ' + y;
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

// req: a request object as stored by /api/requests/submit (see functions/api/requests/submit.js)
// appUrl: env.APP_BASE_URL — used for the logo, the "Review Request" button, and building the unsubscribe link
// unsubscribeUrl: this recipient's personal link, from buildUnsubscribeUrl() above (or null to omit it)
export function newRequestNotificationEmail(req, appUrl, unsubscribeUrl) {
  const subject = `${req.personName} put a new request on Vacation Tracker!`;

  const dateLine = req.halfDay
    ? `${fmtDateForEmail(req.startDate)} (half day, off from ${req.halfDayFrom || 'TBD'})`
    : (req.startDate === req.endDate ? fmtDateForEmail(req.startDate) : `${fmtDateForEmail(req.startDate)} – ${fmtDateForEmail(req.endDate)}`);
  const noteLine = req.note ? escHtml(req.note) : '<span style="color:#8a948f;font-style:italic">No description provided</span>';

  const base = appUrl ? normalizeBaseUrl(appUrl) : null;
  const logoUrl = base ? `${base}/icon-192.png` : null;

  const buttonHtml = base ? `
        <tr>
          <td style="padding:26px 32px 34px;text-align:center;">
            <a href="${escHtml(base)}" style="display:inline-block;background:#f97316;color:#ffffff;font-size:14px;font-weight:700;font-family:'Segoe UI',Arial,sans-serif;text-decoration:none;padding:13px 32px;border-radius:999px;">Review Request</a>
          </td>
        </tr>` : '';

  const unsubscribeHtml = unsubscribeUrl
    ? `<p style="margin:6px 0 0;font-size:11px;line-height:1.5"><a href="${escHtml(unsubscribeUrl)}" style="color:#8a948f;text-decoration:underline">Unsubscribe from these notifications</a></p>`
    : '';

  const logoHtml = logoUrl
    ? `<img src="${escHtml(logoUrl)}" width="56" height="56" alt="" style="display:block;margin:0 auto 12px;border-radius:12px;border:0">`
    : '';

  const html = `
<div style="background:#f4f6f5;padding:32px 16px;font-family:'Segoe UI',Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;border:1px solid #e7ebe9;overflow:hidden">
    <tr>
      <td style="background:linear-gradient(135deg,#0f1f33 0%,#1c3a5c 60%,#14532d 100%);padding:28px 32px;text-align:center">
        ${logoHtml}
        <p style="margin:0;color:rgba(255,255,255,0.65);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px">Holiday / Off Time Staff Tracker</p>
      </td>
    </tr>
    <tr>
      <td style="padding:30px 32px 6px;text-align:center">
        <h1 style="margin:0 0 8px;font-size:21px;font-weight:800;color:#1a1f1c;line-height:1.3">New time-off request</h1>
        <p style="margin:0;font-size:14px;color:#64726c;line-height:1.5"><strong style="color:#1a1f1c">${escHtml(req.personName)}</strong> submitted a request — it's waiting for your review.</p>
      </td>
    </tr>
    <tr>
      <td style="padding:22px 32px 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6f5;border-radius:12px">
          <tr>
            <td style="padding:16px 20px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;color:#8a948f;padding:5px 0;width:80px;vertical-align:top;white-space:nowrap">Dates</td>
                  <td style="font-size:13px;color:#1a1f1c;padding:5px 0;line-height:1.5">${escHtml(dateLine)}</td>
                </tr>
                <tr>
                  <td style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;color:#8a948f;padding:5px 0;vertical-align:top;white-space:nowrap">Note</td>
                  <td style="font-size:13px;color:#1a1f1c;padding:5px 0;line-height:1.5">${noteLine}</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>${buttonHtml}
    <tr>
      <td style="padding:16px 32px 28px;border-top:1px solid #e7ebe9;text-align:center">
        <p style="margin:0;font-size:11px;color:#8a948f;line-height:1.5">Canadian All Care College — you're getting this because you're listed as an admin on the tracker.</p>
        ${unsubscribeHtml}
      </td>
    </tr>
  </table>
</div>`.trim();

  const text = `${req.personName} submitted a new time-off request.
Dates: ${dateLine}
Note: ${req.note || 'No description provided'}
${base ? `\nReview it: ${base}` : ''}

Canadian All Care College — you're getting this because you're listed as an admin on the tracker.${unsubscribeUrl ? `\nUnsubscribe: ${unsubscribeUrl}` : ''}`;

  return { subject, html, text };
}
