# Changelog

All notable changes to the Holiday / Off Time Staff Tracker are documented here.

This log follows [Keep a Changelog](https://keepachangelog.com/) style. Version numbers are shown in the app footer (`vX.Y.Z`). Version tracking started at **2.1.0** (2026-08-11) — the section below that date summarizes the pre-versioning project history reconstructed from commit messages, without invented version numbers.

---

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
