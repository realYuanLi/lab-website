# Huang Lab Website

Static multi-page site for the Huang Lab at Penn Medicine.

## Pages
- `index.html` — Home
- `about.html` — About the lab + people
- `research.html` — Research areas
- `publications.html` — Publications
- `news.html` — News & announcements
- `join.html` — Join Us

## Local preview
```bash
# any static server works
python3 -m http.server 4173
# then open http://localhost:4173
```

## Deploy on Railway
1. Push this repo to GitHub.
2. On [Railway](https://railway.app), create a new project → **Deploy from GitHub repo** → select this repo.
3. Railway detects `package.json` and runs `npm install && npm start`.
4. A public URL is generated (e.g. `huang-lab-production-xxx.up.railway.app`).

## Access (soft password gate)
The site is gated by a password defined in `gate.js`. The current password is **`penn`**.
Bypass link for direct access: append `?key=penn` to any page URL.

> Note: the gate is client-side; the password is visible in the JS source. This is a soft access control, not real authentication.

## Review tool (mentor walkthrough)
A floating **+ Add note** button on every page lets a reviewer annotate the site:
- Click **+ Add note**, then click anywhere on the page
- A modal appears with an auto-filled **Place** and a **Suggestion** textarea
- Notes are stored in the reviewer's browser (`sessionStorage`)
- Click **Notes (N)** to view, then **Copy as Claude prompt** to copy a paste-ready string for Claude Code, or **Export Markdown / JSON** to download a file
- Click **×** on the FAB to hide the tool; reopen with `?review=on`
