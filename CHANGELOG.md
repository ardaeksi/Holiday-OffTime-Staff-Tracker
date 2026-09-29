# Changelog

All notable changes to the Holiday / Off Time Staff Tracker are documented here.

This log follows [Keep a Changelog](https://keepachangelog.com/) style. Version numbers are shown in the app footer (`vX.Y.Z`). Version tracking started at **2.1.0** (2026-08-11) — the section below that date summarizes the pre-versioning project history reconstructed from commit messages, without invented version numbers.

---

## [2.10.0] - 2026-09-29

### Added
- **Archive ex-staff (instructors and office employees).** A 📦 button on every card archives someone who has left: they move out of the main panels into a new **Archived** tab, with their full vacation history, requests and Activity Log entries kept. **↩ Unarchive** brings them back exactly as they were. See the new **Archiving Ex-Staff** section in the README
  - `functions/api/staff/archive.js` / `unarchive.js`, the only way the archive flag can change. Both are logged to the Activity Log (`person-archived` / `person-unarchived`)
  - Archiving closes the person's pending requests automatically (stored as denied with an explanatory reason and `autoClosed: true`, shown as **Closed**)
  - Archived staff can still sign in and see their history, with a notice; submitting a new request is rejected server-side (403) as well as hidden in the UI
  - Archived staff are excluded from tab counts, stats, the Team Calendar, page-load alerts and name suggestions; their cards are greyed and read-only
  - Adding a staff member whose email belongs to an archived person offers to unarchive them instead of creating a duplicate; approving a request for an archived person is refused (409)
- `test/archive.test.js`: 29 scenario tests (82 total)

### Fixed
- **Admin saves no longer reset `notifyOptOuts`.** `POST /api/data` rebuilt the stored value from only instructors/employees/requests/auditLog, so any admin's "unsubscribe from notifications" choice was silently cleared the next time anyone saved. It now starts from the full stored value and overwrites only the fields it manages, so this field and any added later are kept

### Changed
- `POST /api/data` keeps archived records exactly as stored, even if the client omits or modifies them (e.g. an old cached page), and ignores archive fields sent by the client
- `findPersonByEmail()` still finds archived records, but prefers an active record with the same email

### Migration notes
- No manual step, no new KV key, binding or environment variable. `archived` is a flag on the existing person record; every record from before this version is treated as active. The backup Worker is unchanged

## [2.9.0] - 2026-09-14

### Added
- **Leave Types: Vacation/Holiday vs. Sick/Medical.** Every vacation entry and time-off request is now one of two types, color-coded everywhere (🟠 orange = Vacation/Holiday, 🟣 purple = Sick/Medical):
  - "Leave Type" picker in the shared Add Vacation (admin) / Request Time Off (staff) modal, defaulting to Vacation/Holiday
  - Each person's card now shows **two** year-total pills — "{year} Vacation/Holiday Leave" and "{year} Sick/Medical Leave" — instead of one combined pill; a combined line remains lower in the card for the full-picture total
  - Colored tags + matching icon colors on every vacation-entry row, request row (admin dropdown and Log), and vacation-deletion Activity Log entry
  - Mini per-person calendar (and its legend) highlights sick days in purple, vacation days in orange
  - Countdown badges/banners switch wording ("Vacation ends…" vs. "Sick leave ends…"), icon (🏖 vs. 🤒), and color to match the entry's type
  - Notification emails gain a "Type" field and a distinct subject line for sick/medical requests
  - See the new **Leave Types** section in the README for the full rundown, including what was deliberately left unchanged (the Team Calendar still colors by person, not by type)
- `functions/_lib/store.js`: `normalizeLeaveType()` — the single source of truth for "what counts as a valid leaveType," used by every endpoint that reads or writes one; `migrate()` now backfills `leaveType` on both vacations and requests
- **Automated backend test suite** (`npm test`, Node's built-in test runner, zero new dependencies) — 29 tests across `test/*.test.js` covering the leave-type feature end-to-end (submit → approve propagation, migration/defaults, defensive normalization on admin save) plus the staff add/delete endpoints from 2.8.0, which shipped without tests. See the new **Testing** section in the README for what is and isn't covered (frontend rendering is manual-QA only — see that section for why)

### Changed
- `.hd-tag` ("Half Day" badge) recolored from purple to neutral navy — purple is now reserved for the Sick/Medical leave type, and Half Day is an orthogonal "duration shape" that applies to either type (a half-day entry can be Vacation or Sick)
- Per-entry icon coloring (`.vac-icon`) is now driven by leave type instead of half-day/currently-active status; "currently on vacation" is still visible via the existing "● On Vacation Now" tag, just no longer via a third icon-color state
- `functions/api/requests/submit.js` and `approve.js` accept/propagate `leaveType`; `functions/api/data.js` defensively normalizes `leaveType` on every admin save and records it on `vacation-deleted` audit entries

### Migration notes
- No manual step needed — every vacation entry and request created before this version has no `leaveType` field, and is treated as `"vacation"` automatically wherever data is read (`migrate()`) or saved (`functions/api/data.js`), matching what it always implicitly was

## [2.8.0] - 2026-09-14

### Added
- **Add Staff Member** — admins can now add a person straight away by email alone, with 0 vacation entries, instead of only being able to create a profile by logging their first vacation. `functions/api/staff/add.js` resolves their display name via Microsoft Graph (`User.ReadBasic.All`, app-only); if the email can't be matched in the tenant directory, the admin is prompted to enter the name manually and the record is created anyway. New "+ Add Staff Member" button and modal next to "Add Vacation / Off Time"
- **Delete Staff Member** — a 🗑 button next to the existing ✎ on every card, behind a confirmation that spells out exactly what's being lost (vacation entry count, this year's days, request history). `functions/api/staff/delete.js` removes the person, drops any of their requests (pending/approved/denied), and logs the deletion to the existing Activity Log — same audit entry shape the old "delete their last vacation" path already produced, so no changes needed there
- `functions/_lib/graphUsers.js` — `lookupUserByEmail()`, the Graph call backing the name auto-fill above
- `functions/_lib/graphAuth.js` — app-only Graph token acquisition factored out of `graphMail.js` so both it and `graphUsers.js` share the same cached-token logic instead of duplicating it

### Changed
- README: new setup step for the `User.ReadBasic.All` Graph Application permission (admin consent required), needed only for the name auto-fill above — everything else in the app works unchanged without it (the manual-name fallback covers it)

## [2.7.0] - 2026-07-20

### Added
- Approval confirmation email to the **staff member** whose request it was, not just to admins — `staffApprovedEmail()` in `functions/_lib/emailTemplates.js`, sent alongside the existing admin copy in `functions/api/requests/approve.js`
- First-person copy ("Your time off is approved") and no unsubscribe link — this is a direct confirmation of the recipient's own request, not a subscribable admin notification, so it isn't gated by `notifyOptOuts`/`ADMIN_EMAILS_NO_NOTIFY`
- `emailShell()` now takes an optional `footerText` so non-admin-facing emails aren't stuck with the "you're getting this because you're listed as an admin" footer line

## [2.6.0] - 2026-08-11

### Added
- Approval confirmation email: when an admin approves a request, every subscribed admin (not just the approver) gets an email showing who was approved, the dates, the reason given, who approved it, and when — `approvedRequestEmail()` in `functions/_lib/emailTemplates.js`, wired into `functions/api/requests/approve.js` with the same best-effort/fire-and-forget/one-per-recipient/personal-unsubscribe-link pattern as the new-request notification
- Visually distinct from the new-request email: green "approved" header with a CSS-drawn checkmark badge instead of the navy/green header and app icon — renders instantly even in clients that block remote images by default, since it isn't one

### Changed
- `emailTemplates.js` refactored: the shared card shell, footer, button, and details-table markup that both email templates use is now factored into `emailShell()` / `actionButtonHtml()` / `detailsTableHtml()` helpers instead of being duplicated

## [2.5.1] - 2026-08-11

### Added
- **🔔 Notifications On/Off** button in the signed-in bar (next to Sign Out, admins only) to re-subscribe after unsubscribing from an email, or turn notifications off without waiting for one to arrive
- `functions/api/notify/preference.js` — GET/POST endpoint backing the button; self-serve, same `notifyOptOuts` KV list the email's unsubscribe link uses, so either method reverses the other
- `store.js`: `isNotifyOptedOut()`, `isNotifyExcludedByEnv()`, `removeNotifyOptOut()` — `getNotifyAdminEmails()` now built from these instead of inlined logic

### Changed
- If an admin is excluded via `ADMIN_EMAILS_NO_NOTIFY`, the button shows a disabled "set by admin" state instead of a toggle that wouldn't do anything

## [2.5.0] - 2026-08-11

### Added
- Redesigned new-request notification email: app icon in the header, request dates/note shown as labeled fields, a real "Review Request" button linking into the tracker, and a one-click unsubscribe link
- Self-serve unsubscribe: `functions/api/notify/unsubscribe.js`, a no-login endpoint reached via a signed link in the email that adds the admin to a new `notifyOptOuts` list kept in the KV data — takes effect immediately, no redeploy needed
- Notification emails are now sent one-per-recipient rather than one email to all admins, so each copy can carry that admin's own unsubscribe link (and admins no longer see each other's addresses in the message)

### Changed
- `APP_BASE_URL` is now effectively required for the full email experience — it builds the icon image URL, the review button's link, and the unsubscribe link; without it the email falls back to a plain, link-free version

## [2.4.1] - 2026-08-11

### Added
- `ADMIN_EMAILS_NO_NOTIFY` env var — lets specific admins keep full admin access while opting out of the new-request notification email

## [2.4.0] - 2026-08-11

### Added
- Email notifications: submitting a time-off request now emails everyone in `ADMIN_EMAILS`, sent via Microsoft Graph using the app's existing Azure AD registration (no separate email vendor)
- `functions/_lib/graphMail.js` — app-only Graph token acquisition (client credentials) and `sendMail()`
- `functions/_lib/emailTemplates.js` — notification email content, kept separate from the sending logic so it can be redesigned independently; currently a first-pass template (subject: `"<name> put a new request on Vacation Tracker!"`) pending final copy
- New optional env vars: `GRAPH_SENDER_EMAIL` (mailbox to send from) and `APP_BASE_URL` (used to link back into the tracker from the email)
- README: setup steps for the `Mail.Send` Graph application permission (with admin consent) and an optional Exchange Online `ApplicationAccessPolicy` to restrict it to just the sender mailbox

### Notes
- Sending is best-effort and fire-and-forget (`waitUntil`) — a Graph/email failure is logged but never blocks or fails the request submission itself
- No admin emails configured, or `GRAPH_SENDER_EMAIL` unset → notification is silently skipped, no behavior change from before

## [2.3.0] - 2026-08-11

### Changed
- Requests panel (pending dropdown and Log modal) now shows clearly labeled fields — **Date Requested**, **Note**, **Decided**, **Reason** — instead of one run-together line, so admins can tell at a glance if a request came in with no description
- A request with no note now explicitly shows "No description provided" instead of just omitting the line
- Submitted timestamp moved into its own pill-shaped badge with a background fill and clock icon, visually distinct from the requested vacation date

## [2.2.0] - 2026-08-11

### Added
- Custom browser tab icon (favicon) — a vacation calendar with a highlighted day, framed by palm trees and a sun, in the app's navy/green/orange color theme
- `favicon.ico` (16/32/48px) plus PNG icons at 16, 32, 192, and 512px, and an `apple-touch-icon.png` (180px) for mobile home-screen bookmarks

## [2.1.0] - 2026-08-11

### Added
- Version number shown in the site footer (`vX.Y.Z`), color-synced with the active panel theme (navy for Instructors, green for Office Employees)
- Submission timestamp displayed on time-off requests

## [2.0.x and earlier] - 2026-07-02 to 2026-08-04

_Reconstructed from commit history — no formal version numbers were tracked before 2.1.0._

### Added
- Initial holiday/off-time tracker application (Instructors and Office Employees panels)
- Cloud sync via Cloudflare Pages Functions + KV, replacing local file storage
- Sign-in with Microsoft Entra ID (Azure AD), with separate Admin and Staff roles/views
- Staff time-off request workflow: submit, admin approve/deny with reason
- Half-day time-off requests
- Mini vacation calendar and Team Calendar section with monthly views
- Audit log for admin deletions
- Saturday work schedule support
- Daily automated KV backups via a separate Cloudflare Worker, with its own rotating-slot backup password
- Comprehensive README with setup/hosting/troubleshooting documentation

### Fixed
- Server treated as source of truth; response caching disabled to prevent stale data
- Staff person link now resolved fresh from email instead of a stale session snapshot
- Approved request record cleared when its linked vacation entry is deleted
- Admin saves no longer silently overwrite concurrent approvals
- Request item text no longer squeezed unreadable by action buttons
- Overlap warning added and double-counted vacation days fixed
