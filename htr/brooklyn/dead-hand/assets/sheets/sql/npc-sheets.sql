-- !! Since admin/sql/access.sql (chronicles and their members), this file
-- !! only creates the table; who may read and change it is set there.
-- !! Safe to run again: it no longer touches any access rule.
-- =====================================================================
-- NPC stat sheets — Storyteller only
-- ---------------------------------------------------------------------
-- Run once in Supabase: SQL Editor -> New query. Needs the character
-- sheet setup (setup.sql in this folder), which defines is_storyteller().
-- Safe to run again.
--
-- NPC sheets have the same layout as the hunters' sheets, without XP.
-- Only the chronicle's Storyteller can read, create, change or delete
-- them (rules: admin/sql/access.sql): visitors
-- are refused outright, and signed-in players get nothing back. The
-- sheets live only here, never in the website's files.
-- =====================================================================

create table if not exists public.npc_sheets (
  slug        text primary key check (slug ~ '^[a-z0-9-]{1,40}$'),
  chronicle   text not null,
  name        text not null check (char_length(name) between 1 and 120),
  data        jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  play        jsonb not null default '{}'::jsonb check (jsonb_typeof(play) = 'object'),
  updated_at  timestamptz not null default now(),
  check (octet_length(data::text) + octet_length(play::text) < 200000)
);

alter table public.npc_sheets enable row level security;

-- Visitors who are not signed in may not touch the table at all.
revoke all on public.npc_sheets from anon;

-- Access rules: admin/sql/access.sql.
