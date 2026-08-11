// Notification email content. Kept separate from the sending logic (graphMail.js)
// so the templates can be redesigned without touching how mail gets delivered.
// This is a first-pass layout — subject line format is the one confirmed
// requirement so far; the rest is a placeholder pending a real template.

function escHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtDateForEmail(str) {
  const [y, m, d] = str.split('-');
  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m - 1] + ' ' + (+d) + ', ' + y;
}

// req: a request object as stored by /api/requests/submit (see functions/api/requests/submit.js)
// appUrl: optional deployed site URL (env.APP_BASE_URL) to link back into the tracker
export function newRequestNotificationEmail(req, appUrl) {
  const subject = `${req.personName} put a new request on Vacation Tracker!`;

  const dateLine = req.halfDay
    ? `${fmtDateForEmail(req.startDate)} (half day)`
    : (req.startDate === req.endDate ? fmtDateForEmail(req.startDate) : `${fmtDateForEmail(req.startDate)} – ${fmtDateForEmail(req.endDate)}`);

  const linkHtml = appUrl ? `<p style="margin:20px 0 0"><a href="${escHtml(appUrl)}" style="color:#1c3a5c">Open Vacation Tracker</a></p>` : '';
  const linkText = appUrl ? `\nOpen Vacation Tracker: ${appUrl}` : '';

  const html = `
<div style="font-family:'Segoe UI',system-ui,sans-serif;color:#1a1f1c;font-size:14px;line-height:1.5">
  <p style="margin:0 0 12px"><strong>${escHtml(req.personName)}</strong> submitted a new time-off request.</p>
  <p style="margin:0 0 6px"><strong>Dates:</strong> ${escHtml(dateLine)}</p>
  ${req.note ? `<p style="margin:0 0 6px"><strong>Note:</strong> ${escHtml(req.note)}</p>` : ''}
  ${linkHtml}
</div>`.trim();

  const text = `${req.personName} submitted a new time-off request.\nDates: ${dateLine}${req.note ? `\nNote: ${req.note}` : ''}${linkText}`;

  return { subject, html, text };
}
