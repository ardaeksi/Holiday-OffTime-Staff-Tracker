# Holiday / Off Time Staff Tracker
**Canadian All Care College — Internal Tool**

A single-page web application for tracking instructor and office employee vacation time. Designed for a small internal team with cloud sync via Cloudflare — no server to manage, always online. Sign-in is via Microsoft Entra ID (Azure AD), with separate **Admin** and **Staff** views.

---

## Features

- **Microsoft sign-in** — staff sign in with their existing Microsoft/Entra ID account; no shared password
- **Two roles** — Admins manage everyone's time off; Staff see and manage only their own
- **Time-off requests** — staff submit a request (same End Date / Weeks / Days entry as admins use); admins approve (becomes an official vacation entry) or deny with a reason, which the staff member then sees
- **Two staff panels (admin view)** — Instructors and Office Employees tracked separately
- **Three ways to enter duration** — end date, number of weeks, or number of days
- **Mini vacation calendar** — scrollable monthly view with orange vacation highlights per person
- **Live countdown badges** — shows "Vacation ends in X days" or "Starts in X days" on each card
- **Year totals** — per-person 2026 off-time summary (days / hours), separate from all-time total
- **Page-load notifications** — dismissible alerts for vacations ending within 3 days or ended within 3 days
- **Name search** — filters across the active panel in real time
- **Cloud sync** — all users see the same data; changes save to the cloud on every entry
- **Offline fallback** — if the cloud is unreachable, the app works from the local browser cache and syncs when back online
- **Color-coded panels** — navy theme for Instructors, green theme for Office Employees
- **Team Calendar** — section-level calendar at the bottom of each panel showing current month and next month, with color-coded chips per person so you can see at a glance who is off and when

---

## File Structure

```
/
├── index.html                  # The entire application (HTML + CSS + JS)
├── LogoHighPixelated.png.png   # Company logo used in header and login screen
├── favicon.ico, favicon-16x16.png, favicon-32x32.png,
│   icon-192.png, icon-512.png, apple-touch-icon.png   # Browser tab / home-screen icon
├── holiday-tracker-data.json   # Demo/seed data (not used at runtime — cloud is the source of truth)
├── README.md                   # This file
├── CHANGELOG.md                # Version history
├── functions/
│   ├── api/
│   │   ├── _middleware.js      # Verifies the session cookie on every /api/* request
│   │   ├── data.js             # GET/POST /api/data — role-scoped (admin: full, staff: own record)
│   │   ├── auth/
│   │   │   ├── login.js        # Redirects to Microsoft sign-in
│   │   │   ├── callback.js     # Exchanges the auth code, resolves role, issues the session cookie
│   │   │   ├── logout.js       # Clears the session cookie
│   │   │   └── me.js           # Returns the current signed-in identity/role
│   │   ├── requests/
│   │   │   ├── submit.js       # Staff: create a pending time-off request
│   │   │   ├── mine.js         # Staff: own request history
│   │   │   ├── list.js         # Admin: list requests (default: pending)
│   │   │   ├── approve.js      # Admin: request → official vacation entry
│   │   │   └── deny.js         # Admin: request → denied, with a reason
│   │   └── notify/
│   │       └── unsubscribe.js  # One-click, no-login unsubscribe link clicked from the notification email
│   └── _lib/                   # Shared helpers (session signing, KV storage, Microsoft OAuth calls,
│                                #   Graph email sending, notification email templates)
└── backup-worker/               # Standalone Worker — daily KV backups (see "Daily Backups" below)
    ├── index.js
    └── wrangler.toml
```

---

## How Sign-In and Cloud Sync Work

```
Browser (index.html)
    │
    │  /api/auth/login    → redirect to Microsoft sign-in
    │  /api/auth/callback → Microsoft redirects back here with a code
    │  GET  /api/data     → load vacation data (admin: everyone, staff: just themselves)
    │  POST /api/data     → save (admin only)
    │  /api/requests/*    → submit / review / approve / deny time-off requests
    ▼
Cloudflare Pages Functions (functions/api/*)
    │  every request is checked against a signed session cookie
    ▼
Cloudflare KV (key-value store)
    │  stores the full dataset as a single JSON value
    └─ key: "tracker-data"
```

- Staff sign in with their Microsoft account (Entra ID). There is no shared password.
- Whether someone is an **Admin** or **Staff** is decided by the `ADMIN_EMAILS` list (see setup below) — anyone not on that list is Staff.
- A Staff member's Microsoft email is matched against the `email` field on a person record (set by an admin via the ✎ button on their card) to determine which vacation record is "theirs."
- Data is stored as one JSON blob under the key `tracker-data` in a Cloudflare KV namespace, including a `requests` array for time-off requests.
- Every admin save (add vacation, delete entry, edit a person) immediately POSTs the updated data to the cloud. Staff cannot write to `/api/data` at all — their only write path is submitting a request.
- On page load, the app renders instantly from the browser's local cache, then fetches the latest from the cloud in the background and re-renders if anything changed.

---

## Hosting on Cloudflare (One-Time Setup)

**Prerequisites:** A free Cloudflare account at cloudflare.com

### 1. Create a GitHub repository

- Go to github.com → New repository → set it to **Private**
- Upload all files from this folder to the repository root (drag-and-drop in the GitHub UI works)

### 2. Create a KV Namespace

- In the Cloudflare dashboard: **Workers & Pages** → **KV** → **Create a namespace**
- Name it anything (e.g. `tracker-kv`)
- Copy the **Namespace ID** — you will need it in Step 4

### 3. Create a Cloudflare Pages project

- **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
- Select your GitHub repository
- Build settings: leave **Build command** and **Build output directory** both blank
- Click **Save and Deploy**
- Cloudflare will give you a URL like `https://your-project-name.pages.dev`

### 4. Add the KV binding

- In your Pages project: **Settings** → **Functions** → **KV Namespace Bindings**
- Add a binding:
  - **Variable name:** `TRACKER_KV`
  - **KV namespace:** select the namespace you created in Step 2

### 5. Create the Azure App Registration

- In the [Azure Portal](https://portal.azure.com) → **App registrations** → **New registration**
- Name it anything (e.g. `Holiday Tracker`) — not user-facing
- **Supported account types:** "Accounts in this organizational directory only (single tenant)"
- **Redirect URI:** platform = **Web**, value = `https://<your-pages-project>.pages.dev/api/auth/callback` (use your real Pages URL)
- Click **Register**, then note the **Application (client) ID** and **Directory (tenant) ID** from the Overview page
- **Certificates & secrets** → **New client secret** → copy the **Value** immediately (shown once)
- **Token configuration** → **Add optional claim** → token type **ID** → check **email** → Add
- Sign-in itself needs no API permission changes — the default `User.Read` is fine
- To enable [email notifications](#email-notifications-new-request-submitted) (optional but recommended): **API permissions** → **Add a permission** → **Microsoft Graph** → **Application permissions** → search `Mail.Send` → check it → **Add permissions**, then click **Grant admin consent for &lt;org&gt;** (requires a Global/Application Administrator). This is a separate, more powerful permission than the delegated `User.Read` used for sign-in — see the note in that section on scoping it down.

### 6. Add environment variables

In your Pages project: **Settings** → **Environment variables** → **Add variable** for each (apply to **Production**; add to **Preview** too only if you also register a Preview redirect URI — see the note below):

| Variable | Value | Encrypt? |
|---|---|---|
| `AZURE_TENANT_ID` | Directory (tenant) ID from Step 5 | No |
| `AZURE_CLIENT_ID` | Application (client) ID from Step 5 | No |
| `AZURE_CLIENT_SECRET` | Client secret value from Step 5 | **Yes** |
| `AZURE_REDIRECT_URI` | The exact URL registered in Step 5 (e.g. `https://your-project.pages.dev/api/auth/callback`) | No |
| `SESSION_SECRET` | A random 32+ byte string (e.g. `openssl rand -base64 32`) | **Yes** |
| `ADMIN_EMAILS` | Comma-separated admin emails, e.g. `admin1@canadianallcare.com,admin2@canadianallcare.com` | No |
| `GRAPH_SENDER_EMAIL` | Mailbox to send notification emails from, e.g. `notifications@canadianallcare.com` (optional — see [Email Notifications](#email-notifications-new-request-submitted)) | No |
| `ADMIN_EMAILS_NO_NOTIFY` | Comma-separated subset of `ADMIN_EMAILS` to exclude from the new-request notification email — they keep full admin access, they just won't get emailed (optional) | No |
| `APP_BASE_URL` | Your Pages URL, e.g. `https://your-project.pages.dev` — used only to build the "Open Vacation Tracker" link in notification emails (optional) | No |

> Cloudflare Pages *Preview* deployments get a different URL per commit, which can't practically be pre-registered as an Azure redirect URI. Test sign-in against the fixed Production URL rather than a Preview link.

### 7. Redeploy

- Settings → **Deployments** → open the latest deployment → **Retry deployment**
- This picks up the new environment variables

### 8. Link staff to their vacation record and set admins

- Sign in yourself first (your email must be in `ADMIN_EMAILS` to get the Admin view)
- For each existing person, click the ✎ next to their name and set their **Sign-in Email** to the Microsoft account they'll log in with
- Anyone whose email is in `ADMIN_EMAILS` gets the Admin view; everyone else gets the Staff view scoped to their linked record
- Share the Pages URL with staff — they sign in with their existing Microsoft account, no password to distribute

---

## Email Notifications (New Request Submitted)

When a staff member submits a time-off request, the app emails everyone in `ADMIN_EMAILS` so a request never sits unnoticed. It sends via Microsoft Graph, using the same Azure app registration as sign-in — no separate email vendor or account needed.

**Current state:** trigger, sender, recipient list, and the email design itself are all wired up and live. Subject line is `"<name> put a new request on Vacation Tracker!"`. The email (`functions/_lib/emailTemplates.js`) shows the app icon, the request's dates and note as labeled fields, a "Review Request" button back into the tracker, and a one-click unsubscribe link — revisit `newRequestNotificationEmail()` there if you want to change the wording or layout further.

**Setup:**
1. Grant the `Mail.Send` **Application** permission with admin consent (Step 5 above)
2. Set `GRAPH_SENDER_EMAIL` to a real, licensed mailbox in your tenant to send from — e.g. a shared mailbox like `notifications@canadianallcare.com`, or an admin's own mailbox
3. Set `APP_BASE_URL` — with the redesigned template this is effectively required, not just nice-to-have: it's what builds the app icon's image URL, the "Review Request" button's link, and the unsubscribe link. Without it, all three are silently omitted and the email falls back to a plain text-only version.

**Behavior notes:**
- Sending is best-effort — if Graph is unreachable or misconfigured, the request submission itself still succeeds; the failure is only logged (visible in the Pages Functions real-time logs), never shown to the staff member
- If `ADMIN_EMAILS` is empty or `GRAPH_SENDER_EMAIL` isn't set, no email is sent — the app works exactly as before
- Each admin gets their own copy of the email (not one email addressed to all of them) — this is what lets each copy carry that recipient's own personal unsubscribe link, and it also means admins never see each other's addresses in the message

**Excluding an admin from notifications** — two ways, both leave their admin access untouched:
- **You do it:** add their address to `ADMIN_EMAILS_NO_NOTIFY` (comma-separated, same format as `ADMIN_EMAILS`) and redeploy
- **They do it themselves:** they click "Unsubscribe from these notifications" at the bottom of any notification email — no login needed, no redeploy needed. This adds their email to `notifyOptOuts` in the KV data (not an env var), via the signed one-click link handled by `functions/api/notify/unsubscribe.js`
- To reverse a self-serve unsubscribe (there's no UI for this yet): Cloudflare dashboard → **Workers & Pages** → **KV** → your namespace → open the `tracker-data` key → remove their address from the `notifyOptOuts` array → save

**Security note:** the `Mail.Send` *Application* permission is powerful — once granted, the app can technically send mail as **any** mailbox in your tenant, not just the one in `GRAPH_SENDER_EMAIL`. To lock it down to only that mailbox, an Exchange Online admin can run (in [Exchange Online PowerShell](https://learn.microsoft.com/en-us/powershell/exchange/connect-to-exchange-online-powershell)):
```powershell
New-ApplicationAccessPolicy -AppId <AZURE_CLIENT_ID> -PolicyScopeGroupId notifications@canadianallcare.com -AccessRight RestrictAccess -Description "Holiday Tracker: restrict to the notifications mailbox only"
```
This is optional but recommended — without it, a leaked `AZURE_CLIENT_SECRET` would let someone send mail as anyone in the organization.

---

## Importing Existing Data (First Login)

On first login, if the cloud is empty but the browser has data saved locally from before the cloud setup, the app automatically pushes the local data up to the cloud. No manual step needed.

---

## Updating the Application

Any time you make a change to the code:

1. Replace the updated files in your GitHub repository
2. Cloudflare detects the push and redeploys automatically within ~30 seconds
3. All users are on the new version on their next page load

No server restarts, no downtime.

---

## Daily Backups

A separate small Cloudflare Worker (`backup-worker/`), deployed and live at **https://holiday-tracker-backup.arda-eksioglu12.workers.dev**, automatically snapshots the KV data once a day, keeping the **last 3 snapshots** and overwriting the oldest each time a new one is taken.

It has its own password, `BACKUP_PASSWORD`, deliberately separate from the main app's Microsoft sign-in — the backup/restore access (which can overwrite live data) is a single long random secret rather than tied to any one person's account. It's stored as an encrypted Wrangler secret (`wrangler secret put BACKUP_PASSWORD`), not in any file — keep the actual value in a password manager, not in this repo.

### One-time setup (already done for this deployment)

1. Install Wrangler if you don't have it: `npm install -g wrangler`, then `wrangler login`
2. Open `backup-worker/wrangler.toml` and paste in the **same KV namespace ID** already bound to the main Pages project (Cloudflare dashboard → Workers & Pages → KV → your namespace → copy the ID)
3. From inside `backup-worker/`, run:
   ```bash
   wrangler deploy
   ```
4. Set the backup password as an encrypted secret (from inside `backup-worker/`):
   ```bash
   wrangler secret put BACKUP_PASSWORD
   ```
   (paste/type a long random value when prompted — do not reuse the office `APP_PASSWORD`)
5. Confirm the cron trigger is listed under **Settings → Triggers** in the Cloudflare dashboard for the `holiday-tracker-backup` Worker (already defined in `wrangler.toml` — runs daily at 08:00 UTC)

### How it works

- Each run reads the current `tracker-data` key and writes it into one of three rotating slots (`backup:0`, `backup:1`, `backup:2`) alongside a timestamp
- A `backup:meta` key tracks which slot gets overwritten next, so it's always the oldest of the three

### Checking backups / restoring

These call the deployed backup Worker directly and require the `X-Backup-Password` header (the value set via `wrangler secret put` above):

```bash
# List backup timestamps
curl -H "X-Backup-Password: yourbackuppassword" https://holiday-tracker-backup.arda-eksioglu12.workers.dev/list

# Force an extra backup right now
curl -X POST -H "X-Backup-Password: yourbackuppassword" https://holiday-tracker-backup.arda-eksioglu12.workers.dev/run

# Restore slot 0/1/2 back into the live app (overwrites current data!)
curl -X POST -H "X-Backup-Password: yourbackuppassword" https://holiday-tracker-backup.arda-eksioglu12.workers.dev/restore/0
```

---

## Local Development (Optional)

To run the app locally with cloud sync working, you need the Wrangler CLI:

```bash
npm install -g wrangler
wrangler login
wrangler pages dev . --kv TRACKER_KV
```

Opening the file directly (`index.html` via `file://`) works for UI development but will run in **local mode** — no cloud sync, data stays in the browser only.

---

## Cost

This setup runs entirely on Cloudflare's free tier:

| Resource | Free Limit | Typical Daily Usage (3 users) |
|---|---|---|
| Pages requests | Unlimited | ~50–200 |
| Worker invocations | 100,000 / day | ~20–50 |
| KV reads | 100,000 / day | ~20–50 |
| KV writes | 1,000 / day | ~10–30 |

**Expected monthly cost: $0**

The free tier does not expire and does not pause due to inactivity (unlike some other platforms).

---

## Access & Security Notes

- Sign-in is via Microsoft Entra ID — there is no shared password, and Microsoft tokens never reach the browser (the server exchanges the auth code for tokens directly and issues its own HttpOnly session cookie)
- Every `/api/*` request is checked against that signed session cookie server-side; role (Admin vs. Staff) and data scoping are enforced in the Functions, not just hidden in the UI
- `AZURE_CLIENT_SECRET` and `SESSION_SECRET` are stored as encrypted environment variables in Cloudflare, never in source
- The GitHub repository should remain **private**
- To remove someone's access, remove them from the Azure AD tenant/app (or unset their `email` field on their person record to unlink them from their data — they'll still be able to sign in but won't see or request against any record)
- To change who is an admin: update `ADMIN_EMAILS` → redeploy
- Data is stored in Cloudflare's infrastructure (SOC 2 compliant, data centres in North America by default)

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| "Sign-in failed" after clicking Sign in with Microsoft | Redirect URI mismatch, or `AZURE_*` env vars missing/wrong | Confirm `AZURE_REDIRECT_URI` matches the redirect URI registered in the Azure App Registration exactly |
| Signed in but see "Account not linked yet" | No person record has this Microsoft email set | An admin: open the person's card → ✎ → set their Sign-in Email to match |
| Signed in as Staff but expected Admin | Email isn't in `ADMIN_EMAILS` | Check the `ADMIN_EMAILS` env var (comma-separated, case-insensitive) and redeploy |
| Sync fails after login | KV binding missing or wrong name | Confirm binding name is exactly `TRACKER_KV` |
| Changes not showing for other users | They have a stale cache | They should refresh the page |
| Page shows a blank white screen | JavaScript error | Open browser DevTools (F12) → Console tab for details |
