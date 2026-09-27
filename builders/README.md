# Builders — setup

The Builders area is two static pages (`index.html` to sign in,
`dashboard.html` to upload) backed by **Supabase**, which provides the
accounts, the file storage, and — most importantly — the rules about who
may touch what.

## Where the security is

Not in these pages. A static site cannot keep a secret: anything the
browser runs, a visitor can read and change. So:

- **Who can sign in** is decided by Supabase: sign-ups are switched off,
  and only people you invite have accounts.
- **What a Builder can see or change** is decided by the row-level
  security policies below, which run on Supabase's servers. A Builder can
  only read, upload to, or delete from their own folder. Editing the
  page's JavaScript in the browser gains them nothing.

The anon key in `config.js` is designed to be public. The
`service_role` key is not — never put it in any file in this repository.

## One-time setup (about 15 minutes)

### 1. Create the project

Create a free project at supabase.com. From **Project Settings → API**,
copy the **Project URL** and the **anon public** key into `config.js`.

### 2. Lock the door

**Authentication → Sign In / Providers**

- Email provider: **on**
- **Allow new users to sign up: off** — this is the gate. Without it,
  anyone could create an account.

**Authentication → URL Configuration**

- Site URL: `https://vistectus.com`
- Redirect URLs: add `https://vistectus.com/builders/dashboard.html`

### 3. Run this SQL

In **SQL Editor**, run the whole block once.

```sql
-- The storage bucket: private, 25 MB per file, only the accepted types.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'builder-uploads', 'builder-uploads', false, 26214400,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain', 'text/markdown'
  ]
);

-- Each Builder works inside a folder named after their own user id.
create policy "Builders read their own files"
  on storage.objects for select to authenticated
  using (bucket_id = 'builder-uploads'
         and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Builders upload into their own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'builder-uploads'
              and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Builders delete their own files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'builder-uploads'
         and (storage.foldername(name))[1] = (select auth.uid())::text);

-- A record of every upload, so they can be listed, reviewed and placed.
create table public.builder_uploads (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid()
                   references auth.users (id) on delete cascade,
  world          text not null,
  world_name     text not null,
  chronicle      text not null,
  chronicle_name text not null,
  category       text not null,
  path           text not null unique,
  file_name      text not null,
  size_bytes     bigint not null,
  content_type   text,
  note           text,
  created_at     timestamptz not null default now()
);

alter table public.builder_uploads enable row level security;

create policy "Builders see their own uploads"
  on public.builder_uploads for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Builders record their own uploads"
  on public.builder_uploads for insert to authenticated
  with check (user_id = (select auth.uid())
              and split_part(path, '/', 1) = (select auth.uid())::text);

create policy "Builders delete their own uploads"
  on public.builder_uploads for delete to authenticated
  using (user_id = (select auth.uid()));
```

### 4. Invite your first Builder

**Authentication → Users → Invite user**, enter their email. They sign
in from `vistectus.com/builders/` with a one-time link — no password.

## Day to day

- **Adding a Builder:** invite them (step 4). The natural source is the
  Host a World form.
- **Reviewing uploads:** the **Table Editor → builder_uploads** view and
  **Storage → builder-uploads** in the Supabase dashboard show everything
  from every Builder. The dashboard uses your admin access; the policies
  above only restrict Builders.
- **Publishing:** uploads do not appear on the site by themselves.
  Download what you want to use, put it in the world's `art/` or
  `assets/` folder, and commit. Builders are told this on the page.
- **New worlds and chronicles:** add them to the `WORLDS` list at the top
  of `builders.js` so Builders can pick them.

## Also used by the case board

The Dead Hand **RICO Case** board saves its case files to this same
project, and the same invited accounts can save there. Its extra setup
(one table, one bucket) is in `htr/brooklyn/dead-hand/README.md`.

## Before real use

Supabase's built-in email sender is limited to a handful of messages per
hour and is meant for testing. Before inviting more than a few people,
set up your own sender under **Authentication → Emails → SMTP Settings**.
