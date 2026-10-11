-- =====================================================================
-- VisTectus — the Builder's file drop ("Send other files to the site's
-- admin" on the dashboard)
-- ---------------------------------------------------------------------
-- Run this whole file in Supabase: SQL Editor -> New query -> Run, after
-- builders/sql/world-builder.sql. Safe to run again: it makes sure the
-- rules below are the ones in force, whatever was set up before.
--
-- Files sent this way never appear on the site by themselves: they wait
-- in the private bucket "builder-uploads" for the site's admin, who sees
-- them all in Storage -> builder-uploads. Each account sees, adds and
-- deletes only the files in its own folder (named after its user id).
-- Only builders and Storytellers/DMs may send files; players may not.
-- =====================================================================

-- The bucket: private (never public), 25 MB per file, these types only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('builder-uploads', 'builder-uploads', false, 26214400,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'text/plain', 'text/markdown'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

-- Who may send files: an invited builder, a site admin, or a Storyteller/DM.
create or replace function public.can_drop_files() returns boolean
language sql stable security definer set search_path = public
as $$
  select is_builder() or exists (select 1 from chronicle_members
                                  where email = my_email() and my_email() <> '' and role = 'storyteller')
$$;
revoke execute on function public.can_drop_files() from public, anon;
grant execute on function public.can_drop_files() to authenticated;

drop policy if exists "Builders read their own files"         on storage.objects;
drop policy if exists "Builders upload into their own folder" on storage.objects;
drop policy if exists "Builders delete their own files"       on storage.objects;
create policy "Builders read their own files" on storage.objects for select to authenticated
  using (bucket_id = 'builder-uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Builders upload into their own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'builder-uploads' and (storage.foldername(name))[1] = (select auth.uid())::text
              and public.can_drop_files());
create policy "Builders delete their own files" on storage.objects for delete to authenticated
  using (bucket_id = 'builder-uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- A record of every file sent, so it can be listed, reviewed and placed.
create table if not exists public.builder_uploads (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
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
revoke all on public.builder_uploads from anon;

drop policy if exists "Builders see their own uploads"    on public.builder_uploads;
drop policy if exists "Builders record their own uploads" on public.builder_uploads;
drop policy if exists "Builders delete their own uploads" on public.builder_uploads;
create policy "Builders see their own uploads" on public.builder_uploads for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Builders record their own uploads" on public.builder_uploads for insert to authenticated
  with check (user_id = (select auth.uid()) and split_part(path, '/', 1) = (select auth.uid())::text
              and public.can_drop_files());
create policy "Builders delete their own uploads" on public.builder_uploads for delete to authenticated
  using (user_id = (select auth.uid()));

-- Check: the bucket is private, and these are the only rules on it.
select id, public from storage.buckets where id = 'builder-uploads';
select policyname, cmd from pg_policies
 where (tablename = 'objects' and coalesce(qual, '') || coalesce(with_check, '') like '%builder-uploads%')
    or tablename = 'builder_uploads'
 order by tablename, policyname;
