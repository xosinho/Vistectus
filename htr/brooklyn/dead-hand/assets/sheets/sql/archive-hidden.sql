-- !! Since admin/sql/access.sql (chronicles and their members), this file's
-- !! rules are replaced there. If you ever run this file again, run
-- !! admin/sql/access.sql again straight after it.
-- =====================================================================
-- Documents, Maps and People: items the Storyteller has hidden
-- ---------------------------------------------------------------------
-- Run once in Supabase: SQL Editor -> New query. Needs the character
-- sheet setup (setup.sql in this folder), which defines is_storyteller().
-- Safe to run again.
--
-- Each row hides one document or map (by its file path) or one NPC
-- (by name) from the Documents, Maps or People page. Anyone can read the list, so the pages know
-- what to leave out; only a Storyteller can add or remove rows.
-- Hiding takes an item off the page. It does not make the file secret:
-- the file itself is still on the website.
-- =====================================================================

create table if not exists public.archive_hidden (
  chronicle  text not null,
  kind       text not null,
  item       text not null,
  hidden_at  timestamptz not null default now(),
  primary key (chronicle, kind, item)
);

-- Which pages can hide things. Set here rather than in the table so
-- running this file again also updates an older table.
alter table public.archive_hidden drop constraint if exists archive_hidden_kind_check;
alter table public.archive_hidden add constraint archive_hidden_kind_check
  check (kind in ('documents', 'maps', 'npcs'));

alter table public.archive_hidden enable row level security;

drop policy if exists "Anyone reads the hidden list" on public.archive_hidden;
drop policy if exists "Storytellers hide items"      on public.archive_hidden;
drop policy if exists "Storytellers show items"      on public.archive_hidden;

create policy "Anyone reads the hidden list" on public.archive_hidden
  for select to anon, authenticated using (true);
create policy "Storytellers hide items" on public.archive_hidden
  for insert to authenticated with check (public.is_storyteller());
create policy "Storytellers show items" on public.archive_hidden
  for delete to authenticated using (public.is_storyteller());
