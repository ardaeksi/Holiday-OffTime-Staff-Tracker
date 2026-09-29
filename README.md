# Holiday / Off Time Staff Tracker
**Canadian All Care College — Internal Tool**

A single-page web application for tracking instructor and office employee vacation time. Designed for a small internal team with cloud sync via Cloudflare — no server to manage, always online. Sign-in is via Microsoft Entra ID (Azure AD), with separate **Admin** and **Staff** views.

---

## Features

- **Microsoft sign-in** — staff sign in with their existing Microsoft/Entra ID account; no shared password
- **Two roles** — Admins manage everyone's time off; Staff see and manage only their own
- **Time-off requests** — staff submit a request (same End Date / Weeks / Days entry as admins use) as either **Vacation/Holiday** or **Sick/Medical**; admins approve (becomes an official vacation entry of that same type) or deny with a reason, which the staff member then sees
- **Vacation vs. Sick/Medical leave types** — every entry and request is one or the other, color-coded throughout the app (🟠 orange = Vacation/Holiday, 🟣 purple = Sick/Medical) so which is which is visible at a glance — see [Leave Types](#leave-types-vacation--sick-medical) below
- **Two staff panels (admin view)** — Instructors and Office Employees tracked separately
- **Add Staff Member** — admins can add someone straight away by email, before they've ever requested time off; their name is looked up automatically via Microsoft, and they start at 0 days
- **Delete Staff Member** — admins can permanently remove a person's profile, vacation history, and requests, behind a confirmation that spells out what's being lost
- **Archive ex-staff** — instructors and office employees who've left can be archived instead of deleted: they disappear from the main panels into a separate **Archived** tab with all of their history kept, can't submit new requests, and can be unarchived at any time — see [Archiving Ex-Staff](#archiving-ex-staff) below
- **Three ways to enter duration** — end date, number of weeks, or number of days
- **Mini vacation calendar** — scrollable monthly view with orange (Vacation/Holiday) or purple (Sick/Medical) highlights per person
- **Live countdown badges** — shows "Vacation ends in X days" / "Sick leave ends in X days" (or "Starts in X days") on each card, colored and iconed to match the leave type
- **Split year totals** — two separate per-person 2026 summaries, "Vacation/Holiday Leave" and "Sick/Medical Leave" (days / hours each), plus a combined all-time total
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
│   │   ├── staff/
│   │   │   ├── add.js          # Admin: add a person by email (0 vacations), name resolved via Graph
│   │   │   ├── archive.js      # Admin: archive an ex-staff member (hidden, history kept, pending requests closed)
│   │   │   ├── unarchive.js    # Admin: bring an archived person back into the main panels
│   │   │   └── delete.js       # Admin: permanently remove a person, their vacations, and their requests
│   │   └── notify/
│   │       ├── unsubscribe.js  # One-click, no-login unsubscribe link clicked from the notification email
│   │       └── preference.js   # GET/POST — admin's own notification on/off toggle, used by the app UI
│   └── _lib/                   # Shared helpers (session signing, KV storage, Microsoft OAuth calls,
│                                #   Graph app-only auth, Graph email sending, Graph user lookup,
│                                #   notification email templates)
├── backup-worker/               # Standalone Worker — daily KV backups (see "Daily Backups" below)
│   ├── index.js
│   └── wrangler.toml
├── package.json                 # Exists only to run the backend test suite (`npm test`) — see Testing below;
│                                #   the app itself has no build step and no runtime dependencies
└── test/                        # Backend unit/integration tests (Node's built-in test runner) — see Testing below
    ├── helpers.js               # Shared test scaffolding: in-memory KV, fake sessions, fetch stubbing
    ├── store.test.js
    ├── graphUsers.test.js
    ├── staffAdd.test.js
    ├── staffDelete.test.js
    ├── leaveType.test.js
    ├── archive.test.js          # Archiving scenarios end-to-end (see "Archiving Ex-Staff")
    └── ...                      # plus dataAudit, auditList, requestsDecision tests
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

## Adding / Removing Staff

**Adding a staff member by email** — previously the only way to get someone into the tracker was to log a vacation for them first. The **+ Add Staff Member** button (top toolbar, admin view) skips that: pick Instructor or Office Employee, enter their Microsoft sign-in email, and they're added immediately with 0 vacation days — no waiting for their first time-off entry.
- Their display name is looked up automatically via Microsoft Graph (requires the `User.ReadBasic.All` permission — see Step 5 above). If that lookup can't find or confirm the account (permission not granted yet, or the address isn't in this tenant), you're prompted to type their name instead and the record is still created.
- If that email is already linked to someone, you'll get an error naming who instead of a duplicate.

**Archiving vs. deleting** — for someone who has *left*, use 📦 **Archive** (next section), not 🗑 Delete. Archiving keeps their record and is reversible; deleting is permanent.

**Deleting a staff member** — the 🗑 button next to the ✎ edit button on each person's card permanently removes their profile, every vacation entry, and their request history (pending, approved, or denied). A confirmation dialog spells out exactly what's being deleted before it happens, and it cannot be undone from within the app — restoring someone would mean restoring from a [daily backup](#daily-backups). The deletion itself is recorded in the Activity Log (who removed them and when), same as it always has been for the "delete someone's last vacation entry" path.

---

## Archiving Ex-Staff

When an instructor or office employee leaves, click the **📦** button next to ✎ on their card. They move out of the Instructors / Office Employees panel into the **Archived** tab (next to Office Employees in the admin tab bar). Nothing is deleted.

| | Active staff | Archived (ex-)staff |
|---|---|---|
| Shown in Instructors / Office Employees panels, tab counts, stats | ✅ | ❌ — only under **Archived** |
| Team Calendar, page-load "ending soon" alerts, name suggestions | ✅ | ❌ |
| Vacation history, requests, Activity Log entries | ✅ | ✅ kept exactly as they were |
| Can sign in and see their own history | ✅ | ✅ with a notice that their profile is archived |
| Can submit a time-off request | ✅ | ❌ — button hidden **and** rejected by the server (403) |
| Admin can add/remove time off or edit them | ✅ | ❌ — read-only; **↩ Unarchive** first |
| Admin can permanently delete them | ✅ | ✅ (🗑 still available on the Archived card) |

**What happens to their requests when they're archived:** any request still *pending* is closed automatically (stored as denied, with the reason *"Automatically closed — this staff member was archived."*, `autoClosed: true`, and who/when), so nothing is left sitting in the admin queue. It shows as **Closed** in the Activity Log and in the person's own "My Requests." Approved/denied requests and all vacation entries — past *and* future-dated — stay on the record untouched. To remove a future entry an ex-employee no longer needs, unarchive them, delete the entry, and archive again.

**Unarchiving (e.g. a rehire):** click **↩ Unarchive** on their Archived card. They return to their original panel with all history intact and can request time off again; requests that were auto-closed stay closed. If an admin tries to **+ Add Staff Member** with an archived person's email, the app says so and offers to unarchive them instead of creating a duplicate profile. Unarchiving is refused if another *active* record is already using the same sign-in email, so one login never maps to two people.

Every archive and unarchive is recorded in the Activity Log (who, when, how many vacations kept, how many pending requests closed).

**Edge cases handled server-side** (not just hidden in the UI): approving a stale pending request for an archived person → refused (409); approving a first-time request whose email now belongs to an archived person → refused rather than creating a second profile; adding time off by name for someone who's only in the Archived list → blocked with a prompt to unarchive.

**Storage / data safety:** archiving is just an `archived: true` flag (plus `archivedAt` / `archivedByEmail`) on the existing person record, still inside the same `tracker-data` KV value, in the same `instructors` / `employees` array. Nothing is moved, renamed or copied, so there's no migration step, no new KV key, no new Cloudflare binding or environment variable, and the daily backup Worker needs no changes (archived people are in every snapshot like everyone else). Records created before this feature are treated as active (`functions/_lib/store.js` → `migrate()`).

The flag can **only** change through `/api/staff/archive` and `/api/staff/unarchive`. The general admin save (`POST /api/data`) always keeps archived records exactly as stored. If a save leaves one out (an old browser tab still running a pre-2.10 version of the page) or sends a modified copy, the stored record is kept, and it can't archive or unarchive anyone either. So a stale tab can't silently delete or change an ex-employee's history.

---

## Leave Types: Vacation / Sick-Medical

Every vacation entry and every time-off request is one of exactly two **leave types**:

| Leave Type | Color | Used for |
|---|---|---|
| **Vacation / Holiday** | 🟠 Orange | Ordinary planned time off — the default, and what every entry was before this distinction existed |
| **Sick / Medical Leave** | 🟣 Purple | Sick days, medical appointments, anything health-related |

**Where it shows up:**
- **The Add Vacation modal (admin) and Request Time Off modal (staff)** both have a "Leave Type" picker — Vacation/Holiday is pre-selected, so nothing changes for anyone who doesn't care about the distinction.
- **Each person's card** shows two separate year-total pills instead of one combined total — **"{year} Vacation/Holiday Leave"** (orange) and **"{year} Sick/Medical Leave"** (purple) — each with its own day/hour count. A combined "{year} combined: X days / Y hrs" line remains at the bottom of the expanded card for the full picture, alongside the existing all-time total.
- **Every vacation-entry row, request row, and Activity Log deletion entry** carries a small colored tag (Vacation / Sick-Medical) next to the date, plus a matching icon color.
- **The mini per-person calendar and its legend** highlight sick days in purple and vacation days in orange (a day covered by entries of both types — an edge case — shows purple, since that's the one worth noticing).
- **Countdown badges/banners** ("Vacation ends in 3 days" vs. "Sick leave ends in 3 days") switch wording, icon (🏖 vs. 🤒), and color to match.
- **Notification emails** (new request, approval, approval confirmation) include a "Type" field and adjust their subject line for sick/medical requests, e.g. *"Jane requested sick/medical leave!"* instead of the standard *"Jane put a new request on Vacation Tracker!"*.

**What deliberately did *not* change:** the **Team Calendar** (the section-level calendar at the bottom of each panel) still colors each person's chips by *person* (via its own 12-color palette), not by leave type — its job is "who is off, at a glance," and overloading it with a second color axis would work against that. Half Day remains an independent "duration shape" flag (the small "Half Day" text badge, now neutral navy) — you can have a half-day vacation or a half-day sick entry; it no longer forces the purple color the way it used to before this feature existed.

**Data model / migration:** every vacation entry and request has a `leaveType` field (`"vacation"` or `"sick"`). Anything created before this feature — or anything malformed — is treated as `"vacation"` automatically, both when read from storage (`functions/_lib/store.js` → `migrate()` / `normalizeLeaveType()`) and defensively re-checked on every admin save (`functions/api/data.js`), so there's no manual migration step and no way to end up with an invalid value in storage.

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
- To enable name auto-fill when [adding a staff member](#adding-a-staff-member-by-email) by email (optional): same place, search `User.ReadBasic.All` instead → check it → **Add permissions** → **Grant admin consent**. Without this, adding someone by email still works, but the admin has to type their name manually rather than it being looked up.

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

## Email Notifications

The app emails everyone in `ADMIN_EMAILS` (minus anyone excluded — see below) at two points, so nothing sits unnoticed and approvals are visible to the whole admin team, not just whoever clicked Approve. It sends via Microsoft Graph, using the same Azure app registration as sign-in — no separate email vendor or account needed.

| Event | Fires from | Subject | Template function |
|---|---|---|---|
| Staff submits a request | `functions/api/requests/submit.js` | `"<name> put a new request on Vacation Tracker!"` | `newRequestNotificationEmail()` |
| Admin approves a request | `functions/api/requests/approve.js` | `"<name>'s time off request was approved!"` | `approvedRequestEmail()` |

Both live in `functions/_lib/emailTemplates.js` and share the same card layout (a `emailShell()` helper) and footer — the approval email swaps the navy/green header + app icon for a green header + a CSS-drawn checkmark badge (no image, so it renders instantly even if the client blocks remote images), and adds "Approved By" / "Approved On" fields alongside the dates and note. Revisit either function directly if you want to change wording or layout further. Denial doesn't send an email yet — the admin team already sees a denial the moment they load the app.

**Setup:**
1. Grant the `Mail.Send` **Application** permission with admin consent (Step 5 above)
2. Set `GRAPH_SENDER_EMAIL` to a real, licensed mailbox in your tenant to send from — e.g. a shared mailbox like `notifications@canadianallcare.com`, or an admin's own mailbox
3. Set `APP_BASE_URL` — effectively required, not just nice-to-have: it's what builds the app icon's image URL, each email's button link, and the unsubscribe link. Without it, all three are silently omitted and the email falls back to a plain text-only version.

**Behavior notes:**
- Sending is best-effort — if Graph is unreachable or misconfigured, the request submission itself still succeeds; the failure is only logged (visible in the Pages Functions real-time logs), never shown to the staff member
- If `ADMIN_EMAILS` is empty or `GRAPH_SENDER_EMAIL` isn't set, no email is sent — the app works exactly as before
- Each admin gets their own copy of the email (not one email addressed to all of them) — this is what lets each copy carry that recipient's own personal unsubscribe link, and it also means admins never see each other's addresses in the message

**Excluding an admin from notifications** — three ways, all leave their admin access untouched:
- **You do it:** add their address to `ADMIN_EMAILS_NO_NOTIFY` (comma-separated, same format as `ADMIN_EMAILS`) and redeploy
- **They do it from the email:** click "Unsubscribe from these notifications" at the bottom of any notification email — no login, no redeploy. This adds their email to `notifyOptOuts` in the KV data (not an env var), via the signed one-click link handled by `functions/api/notify/unsubscribe.js`
- **They do it from the app:** signed in as an admin, the **🔔 Notifications On** button next to Sign Out toggles it directly (`functions/api/notify/preference.js`, GET to check status / POST to flip it) — same `notifyOptOuts` list as the email link, so either method reverses the other. If they're excluded via `ADMIN_EMAILS_NO_NOTIFY` instead, this button shows a disabled **🔕 Notifications Off** state, since toggling their own KV flag wouldn't matter while the env-var exclusion still applies

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

## Testing

The backend (`functions/`) has an automated test suite using Node's built-in test runner — no test framework dependency, consistent with the app having no build step at all (see "Hosting on Cloudflare" above: build command/output are deliberately left blank). `package.json` exists solely to declare the `npm test` script; nothing in it is needed to deploy or run the app itself.

```bash
npm test
```

Requires Node 18+ (anything with `node:test` built in). This runs every `*.test.js` file under `test/` — 82 tests as of this writing, covering:
- **`functions/_lib/store.js`** — data migration/defaults (including the leave-type backfill described above), person lookups, admin/notify-opt-out logic
- **`functions/_lib/graphUsers.js`** — the Microsoft Graph user-lookup call backing "Add Staff Member," with `global.fetch` stubbed so tests never touch the real network
- **`functions/api/staff/add.js`** and **`staff/delete.js`** — validation, duplicate detection, the Graph-lookup-fails-so-ask-for-a-name fallback, and that deletion cleans up a person's requests and writes the right audit entry
- **Archiving ex-staff** (`test/archive.test.js`) — archive/unarchive permissions and validation; history kept intact; pending requests auto-closed (including a first-time request matched by email) and nobody else's; an archived person submitting a request is rejected with nothing stored and no email sent; they still see their own history; stale approvals and duplicate-profile paths are refused; re-adding a rehire by email points to Unarchive; the general admin save can't delete, edit, move, archive or un-archive an archived record; and `notifyOptOuts` survive admin saves
- **The leave-type feature end-to-end** (`test/leaveType.test.js`) — a staff request's `leaveType` survives submission, defaults correctly when omitted, carries onto the resulting vacation entry on approval (including the first-time-requester path that creates the person record), and that the admin full-roster save both normalizes a bogus `leaveType` and records it correctly on a vacation-deletion audit entry

**What's intentionally *not* covered:** `index.html`'s frontend logic (rendering, the two split year-pills, calendar coloring, the modal). It's a single inline `<script>` with no module system by design — see "Local Development" above and the "no build step" note in Hosting — so unit-testing it would mean introducing a bundler/JSDOM purely for tests, which is a bigger architectural change than this feature warranted. The backend tests above verify the *data* is always correct (right `leaveType`, right defaults, right propagation); verifying the *pixels* (correct color swatch, pill layout, modal wiring) is a manual QA pass — reload the app, add a sick entry and a vacation entry for the same person, and confirm: the two year-pills on their card, the mini-calendar colors + legend, the countdown badge/banner wording and icon, and the colored tags in the Requests dropdown / Activity Log all agree with each other.

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
