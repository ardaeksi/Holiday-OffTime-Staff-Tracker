# Changelog

All notable changes to the Holiday / Off Time Staff Tracker are documented here.

This log follows [Keep a Changelog](https://keepachangelog.com/) style. Version numbers are shown in the app footer (`vX.Y.Z`). Version tracking started at **2.1.0** (2026-08-11) — the section below that date summarizes the pre-versioning project history reconstructed from commit messages, without invented version numbers.

---

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
