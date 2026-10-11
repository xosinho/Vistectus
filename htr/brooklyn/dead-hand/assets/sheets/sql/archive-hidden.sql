-- !! Since admin/sql/access.sql (chronicles and their members), this file
-- !! only creates the table; who may read and change it is set there.
-- !! Safe to run again: it no longer touches any access rule.
-- =====================================================================
-- Documents, Maps and People: items the Storyteller has hidden
-- ---------------------------------------------------------------------
-- Run once in Supabase: SQL Editor -> New query. Needs the character
-- sheet setup (setup.sql in this folder), which defines is_storyteller().
-- Safe to run again.
--
-- Each row hides one document or map (by its file path) or one NPC
-- (by name) from the Documents, Maps or People page. The chronicle's
-- members read the list, so the pages know what to leave out; only its
-- Storyteller adds or removes rows (rules: admin/sql/access.sql).
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

-- Access rules: admin/sql/access.sql.
