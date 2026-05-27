# Shared review comments — Supabase setup

The review tool now stores comments in a **shared** Supabase table so that
every reviewer's notes are visible to everyone (including you). Without this
one-time setup the tool falls back to local-only mode (the old behaviour,
where you can't see other people's comments).

## 1. Create a project
1. Go to <https://supabase.com> → sign in → **New project** (free tier is fine).
2. Pick a name + database password, choose a region, create it (~1 min).

## 2. Create the table + access policies
Open **SQL Editor** → **New query**, paste this, and click **Run**:

```sql
-- Table that holds every review comment
create table if not exists public.review_notes (
  id         uuid primary key default gen_random_uuid(),
  page       text not null,
  place      text not null,
  suggestion text not null,
  author     text,
  ts         timestamptz not null default now()
);

-- Row Level Security: the anon (public) key may read/add/delete comments.
alter table public.review_notes enable row level security;

create policy "anon can read"   on public.review_notes for select to anon using (true);
create policy "anon can insert" on public.review_notes for insert to anon with check (true);
create policy "anon can delete" on public.review_notes for delete to anon using (true);
```

## 3. Copy your keys into `review.js`
In Supabase: **Project Settings → API**. Copy:
- **Project URL** → e.g. `https://abcd1234.supabase.co`
- **Project API keys → `anon` `public`** → a long `eyJ...` token

Open `review.js` and edit the `CONFIG` block at the top:

```js
const CONFIG = {
  supabaseUrl:     'https://abcd1234.supabase.co',   // <- your Project URL
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6...', // <- your anon public key
  table:           'review_notes',
  pollMs:          15000,
};
```

Commit & push. That's it — comments now sync for everyone.

> **Why the anon key is safe to commit:** it's a *public* key. It can only do
> what the Row Level Security policies above allow (read/add/delete review
> notes). It cannot touch anything else in your database.

## Security note
These policies let **anyone with the site's anon key** read, add, and delete
review comments. That's appropriate for a small, password-gated mentor-review
tool. If you later want stronger control (e.g. only you can delete, or
comments require a shared review password), tighten the RLS policies — ask and
I can set that up.

## How it behaves
- **Synced — shared**: connected; everyone sees everyone's comments. The panel
  re-fetches every 15s and whenever you switch back to the tab; the **⟳**
  button forces a refresh.
- **Offline — cached only**: the backend was unreachable; you're seeing the
  last comments that loaded (read-only safety; new local adds warn you).
- **Local only (not set up)**: `CONFIG` still has the `YOUR_...` placeholders.
