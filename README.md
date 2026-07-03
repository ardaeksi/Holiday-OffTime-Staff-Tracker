# Holiday / Off Time Staff Tracker
**Canadian All Care College — Internal Tool**

A single-page web application for tracking instructor and office employee vacation time. Designed for 2–3 internal users with cloud sync via Cloudflare — no server to manage, always online.
  a
---

## Features

- **Two staff panels** — Instructors and Office Employees tracked separately
- **Three ways to enter duration** — end date, number of weeks, or number of days
- **Mini vacation calendar** — scrollable monthly view with orange vacation highlights per person
- **Live countdown badges** — shows "Vacation ends in X days" or "Starts in X days" on each card
- **Year totals** — per-person 2026 off-time summary (days / hours), separate from all-time total
- **Page-load notifications** — dismissible alerts for vacations ending within 3 days or ended within 3 days
- **Name search** — filters across the active panel in real time
- **Cloud sync** — all users see the same data; changes save to the cloud on every entry
- **Offline fallback** — if the cloud is unreachable, the app works from the local browser cache and syncs when back online
- **Color-coded panels** — navy theme for Instructors, green theme for Office Employees

---

## File Structure

```
/
├── index.html                  # The entire application (HTML + CSS + JS)
├── LogoHighPixelated.png.png   # Company logo used in header and login screen
├── holiday-tracker-data.json   # Demo/seed data (not used at runtime — cloud is the source of truth)
├── wrangler.toml               # Cloudflare configuration (for local dev only)
├── README.md                   # This file
└── functions/
    └── api/
        └── data.js             # Cloudflare Pages Function — handles GET and POST for /api/data
```

---

## How the Cloud Sync Works

```
Browser (index.html)
    │
    │  GET /api/data   → load all vacation data
    │  POST /api/data  → save after every change
    ▼
Cloudflare Pages Function (functions/api/data.js)
    │  checks password header on every request
    ▼
Cloudflare KV (key-value store)
    │  stores the full dataset as a single JSON value
    └─ key: "tracker-data"
```

- Data is stored as one JSON blob under the key `tracker-data` in a Cloudflare KV namespace.
- Every save (add vacation, delete entry) immediately POSTs the updated data to the cloud.
- On page load, the app renders instantly from the browser's local cache, then fetches the latest from the cloud in the background and re-renders if anything changed.
- The access password is checked server-side on every request. It is stored as an encrypted environment variable in Cloudflare — never in the code.

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

### 5. Add the access password as an environment variable

- Still in Settings → **Environment variables** → **Add variable**
- **Variable name:** `APP_PASSWORD`
- **Value:** your chosen password
- Click **Encrypt** to hide it from the dashboard
- Apply to both **Production** and **Preview** environments

### 6. Redeploy

- Settings → **Deployments** → open the latest deployment → **Retry deployment**
- This picks up the new environment variables

### 7. Share with staff

- Send colleagues the Pages URL and the access password
- Their browser remembers the password after first login — they won't need to enter it again unless they clear browser data

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

- The access password is verified server-side on every API request — the app cannot be used without it
- The password is stored as an encrypted environment variable in Cloudflare, not in any source file
- The GitHub repository should remain **private**
- If you need to rotate the password: update the `APP_PASSWORD` environment variable in Cloudflare dashboard → redeploy → inform staff of the new password
- Data is stored in Cloudflare's infrastructure (SOC 2 compliant, data centres in North America by default)

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| Login says "Incorrect password" | `APP_PASSWORD` env var not set or typo | Check Cloudflare → Settings → Environment variables |
| Sync fails after login | KV binding missing or wrong name | Confirm binding name is exactly `TRACKER_KV` |
| Changes not showing for other users | They have a stale cache | They should refresh the page |
| Cloudflare shows "KV namespace not found" | KV Namespace ID in `wrangler.toml` not updated | Only matters for local dev; production uses the dashboard binding |
| Page shows a blank white screen | JavaScript error | Open browser DevTools (F12) → Console tab for details |
