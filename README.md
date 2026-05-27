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

## Deploy on GitHub Pages
1. Push this repo to GitHub (must be public for free Pages).
2. **Settings → Pages → Source:** Deploy from a branch → **Branch:** `main` / `/(root)` → **Save**.
3. After ~1 minute the site is live at `https://<user>.github.io/lab-website/`.

The `.nojekyll` file prevents Jekyll from interfering with files starting with `_`.

## Deploy on Railway (alternative)
1. On [Railway](https://railway.app), create a new project → **Deploy from GitHub repo** → select this repo.
2. Railway detects `package.json` and runs `npm install && npm start`.
3. A public URL is generated automatically.

## Access (soft password gate)
The site is gated by a password defined in `gate.js`. The current password is **`penn`**.
Bypass link for direct access: append `?key=penn` to any page URL.

> Note: the gate is client-side; the password is visible in the JS source. This is a soft access control, not real authentication.

## Review tool (mentor walkthrough)
A floating **+ Add note** button on every page lets reviewers annotate the site:
- Click **+ Add note**, then click anywhere on the page
- A modal appears with **Your name**, an auto-filled **Place**, and a **Suggestion** textarea
- Notes are stored in a **shared Supabase table**, so every reviewer's comments are visible to everyone (and to you). See [`SETUP.md`](SETUP.md) for the one-time backend setup.
- Click **Notes (N)** to view all comments; the panel shows a sync status and auto-refreshes (⟳ to force). Use **Copy as Claude prompt** for a paste-ready string, or **Export Markdown / JSON** to download a file
- Click **×** on the FAB to hide the tool; reopen with `?review=on`

> Until `review.js`'s `CONFIG` is filled in (see `SETUP.md`), the tool runs in **local-only** mode — comments stay in the reviewer's own browser and don't sync.
