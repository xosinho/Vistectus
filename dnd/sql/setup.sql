-- =====================================================================
-- Dungeons & Dragons campaigns — character sheets, XP and levelling up
-- ---------------------------------------------------------------------
-- Run this whole file in Supabase: SQL Editor -> New query -> Run.
-- Run it AFTER admin/sql/access.sql (chronicles/campaigns and members),
-- which comes after the Dead Hand files. Safe to run again.
--
-- Who may do what (enforced here, by the database, not by the pages):
--   * A campaign's members (players and Dungeon Masters) read its
--     sheets, awards and level-ups. Nobody else does.
--   * A player tracks hit points, slots, coins and notes on their own
--     sheet (save_play, from the Dead Hand setup), and asks to level up.
--   * A level-up only changes the sheet when the campaign's DM approves.
--   * The campaign's DMs award XP (XP campaigns) or levels (milestone
--     campaigns), approve or send back level-ups, create and edit sheets.
--   * New characters come through Create a Character (character_drafts,
--     admin/sql/access.sql) and the DM's approval.
-- In the database a DM is a chronicle_members row with role 'storyteller'.
-- =====================================================================


-- ------------------------------------------------------------- tables

-- How the campaign advances: 'xp' (the DM awards XP; levels come at the
-- thresholds) or 'milestone' (the DM grants levels). start_level: the
-- level characters may reach before any award.
create table if not exists public.campaign_settings (
  chronicle    text primary key references public.chronicles (id) on delete cascade,
  advancement  text not null default 'xp' check (advancement in ('xp', 'milestone')),
  start_level  integer not null default 1 check (start_level between 1 and 20),
  updated_at   timestamptz not null default now()
);
insert into public.campaign_settings (chronicle)
  select id from public.chronicles where game = 'dnd'
on conflict (chronicle) do nothing;

-- XP and milestone levels given by the DM. A character's total is the sum.
create table if not exists public.dnd_awards (
  id          bigint generated always as identity primary key,
  slug        text not null references public.character_sheets (slug) on delete cascade,
  xp          integer not null default 0,
  levels      integer not null default 0,
  note        text not null default '',
  awarded_at  timestamptz not null default now(),
  check (xp <> 0 or levels <> 0)
);

-- Level-ups: the whole new sheet, one level higher, waiting for the DM.
create table if not exists public.dnd_levelups (
  id            bigint generated always as identity primary key,
  slug          text not null references public.character_sheets (slug) on delete cascade,
  from_level    integer not null,
  to_level      integer not null,
  data          jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) < 200000),
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  note          text not null default '',
  requested_at  timestamptz not null default now(),
  decided_at    timestamptz
);
create index if not exists dnd_levelups_slug on public.dnd_levelups (slug, requested_at);

alter table public.campaign_settings enable row level security;
alter table public.dnd_awards        enable row level security;
alter table public.dnd_levelups      enable row level security;
revoke all on public.campaign_settings, public.dnd_awards, public.dnd_levelups from anon;

drop policy if exists "Members read settings"  on public.campaign_settings;
drop policy if exists "Members read awards"    on public.dnd_awards;
drop policy if exists "Members read level-ups" on public.dnd_levelups;
create policy "Members read settings"  on public.campaign_settings for select to authenticated
  using (public.is_chronicle_member(chronicle));
create policy "Members read awards"    on public.dnd_awards for select to authenticated
  using (public.is_chronicle_member(public.sheet_chronicle(slug)));
create policy "Members read level-ups" on public.dnd_levelups for select to authenticated
  using (public.is_chronicle_member(public.sheet_chronicle(slug)));
-- No insert, update or delete policies: all writes go through the
-- functions below.

-- The Locations app: a D&D campaign's world map is a location_maps row
-- of kind 'world' (an image the DM uploads; pins sit on it).
alter table public.location_maps drop constraint if exists location_maps_kind_check;
alter table public.location_maps add constraint location_maps_kind_check check (kind in ('area', 'building', 'world'));


-- ------------------------------------------------------------- helpers

-- Is this a D&D sheet?
create or replace function public.dnd_is_sheet(d jsonb) returns boolean
language sql immutable
as $$ select coalesce(jsonb_typeof(d -> 'abilities') = 'object' and jsonb_typeof(d -> 'classes') = 'array', false) $$;

-- The character's level: the sum of its class levels.
create or replace function public.dnd_level(d jsonb) returns integer
language sql immutable
as $$ select coalesce((select sum(coalesce((c ->> 'level')::integer, 0)) from jsonb_array_elements(coalesce(d -> 'classes', '[]')) c), 0)::integer $$;

-- The level a character may reach now: from its XP in an XP campaign,
-- from the start level and the levels granted in a milestone one.
create or replace function public.dnd_allowed_level(p_slug text) returns integer
language plpgsql stable security definer set search_path = public
as $$
declare c text := sheet_chronicle(p_slug); st campaign_settings; total_xp integer; lv integer; t integer[] :=
  array[0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];
begin
  if c is null or not is_chronicle_member(c) then return null; end if;
  select * into st from campaign_settings where chronicle = c;
  if st.advancement = 'milestone' then
    select coalesce(sum(a.levels), 0) into lv from dnd_awards a where a.slug = p_slug;
    return least(20, greatest(1, coalesce(st.start_level, 1) + lv));
  end if;
  select coalesce(sum(a.xp), 0) into total_xp from dnd_awards a where a.slug = p_slug;
  lv := 1;
  for i in 2..20 loop
    if total_xp >= t[i] then lv := i; end if;
  end loop;
  return least(20, greatest(lv, coalesce(st.start_level, 1)));
end $$;


-- ------------------------------------------------------- levelling up

-- The player (or a DM): the whole new sheet, exactly one level higher.
create or replace function public.dnd_request_levelup(p_slug text, p_data jsonb)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare s character_sheets; cur integer; allowed integer; new_id bigint;
begin
  if not (owns_sheet(p_slug) or is_sheet_storyteller(p_slug)) then raise exception 'You can only level up your own character.'; end if;
  select * into s from character_sheets where slug = p_slug for update;
  if not found or not dnd_is_sheet(s.data) then raise exception 'There is no such D&D sheet.'; end if;
  if not dnd_is_sheet(p_data) then raise exception 'That is not a complete character.'; end if;
  if exists (select 1 from dnd_levelups where slug = p_slug and status = 'pending') then
    raise exception 'A level-up is already waiting for the Dungeon Master.';
  end if;
  cur := dnd_level(s.data);
  allowed := dnd_allowed_level(p_slug);
  if allowed is null or allowed <= cur then raise exception 'Not yet: this character may not go above level % for now.', cur; end if;
  if dnd_level(p_data) <> cur + 1 then raise exception 'A level-up adds exactly one level (to %).', cur + 1; end if;
  insert into dnd_levelups (slug, from_level, to_level, data) values (p_slug, cur, cur + 1, p_data) returning id into new_id;
  return new_id;
end $$;

-- The player withdraws a waiting level-up; the DM sends it back.
create or replace function public.dnd_close_levelup(p_id bigint, p_note text default '')
returns void
language plpgsql security definer set search_path = public
as $$
declare r dnd_levelups; new_status text;
begin
  select * into r from dnd_levelups where id = p_id for update;
  if not found or r.status <> 'pending' then raise exception 'That level-up is no longer waiting.'; end if;
  if is_sheet_storyteller(r.slug) then new_status := 'rejected';
  elsif owns_sheet(r.slug) then new_status := 'cancelled';
  else raise exception 'Only the player or the Dungeon Master can do that.';
  end if;
  update dnd_levelups set status = new_status, note = left(coalesce(p_note, ''), 1000), decided_at = now() where id = p_id;
end $$;

-- The DM: the sheet becomes the level-up.
create or replace function public.dnd_approve_levelup(p_id bigint, p_note text default '')
returns void
language plpgsql security definer set search_path = public
as $$
declare r dnd_levelups; d jsonb;
begin
  select * into r from dnd_levelups where id = p_id for update;
  if not found or r.status <> 'pending' then raise exception 'That level-up is no longer waiting.'; end if;
  if not is_sheet_storyteller(r.slug) then raise exception 'Only the campaign''s Dungeon Master can approve a level-up.'; end if;
  select data into d from character_sheets where slug = r.slug for update;
  if dnd_level(d) <> r.from_level then
    raise exception 'The sheet is no longer at level %; send this level-up back.', r.from_level;
  end if;
  update character_sheets set data = r.data, name = coalesce(nullif(btrim(r.data ->> 'name'), ''), name), updated_at = now()
   where slug = r.slug;
  update dnd_levelups set status = 'approved', note = left(coalesce(p_note, ''), 1000), decided_at = now() where id = p_id;
end $$;


-- ------------------------------------------------- awards and settings

create or replace function public.dnd_award(p_slug text, p_xp integer, p_levels integer, p_note text default '')
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_sheet_storyteller(p_slug) then raise exception 'Only the campaign''s Dungeon Master can award XP or levels.'; end if;
  if not exists (select 1 from character_sheets where slug = p_slug and dnd_is_sheet(data)) then raise exception 'There is no such D&D sheet.'; end if;
  if coalesce(p_xp, 0) = 0 and coalesce(p_levels, 0) = 0 then raise exception 'Award some XP or a level.'; end if;
  insert into dnd_awards (slug, xp, levels, note) values (p_slug, coalesce(p_xp, 0), coalesce(p_levels, 0), left(coalesce(p_note, ''), 200));
end $$;

create or replace function public.dnd_delete_award(p_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare a dnd_awards;
begin
  select * into a from dnd_awards where id = p_id for update;
  if not found then raise exception 'That award is already gone.'; end if;
  if not is_sheet_storyteller(a.slug) then raise exception 'Only the campaign''s Dungeon Master can remove an award.'; end if;
  delete from dnd_awards where id = p_id;
end $$;

create or replace function public.dnd_set_advancement(p_chronicle text, p_mode text, p_start_level integer default 1)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from chronicles where id = p_chronicle and game = 'dnd') then raise exception 'There is no such campaign.'; end if;
  if not is_chronicle_storyteller(p_chronicle) then raise exception 'Only the campaign''s Dungeon Master can change this.'; end if;
  if p_mode not in ('xp', 'milestone') then raise exception 'Choose XP or milestone.'; end if;
  insert into campaign_settings (chronicle, advancement, start_level, updated_at)
  values (p_chronicle, p_mode, least(20, greatest(1, coalesce(p_start_level, 1))), now())
  on conflict (chronicle) do update set advancement = excluded.advancement, start_level = excluded.start_level, updated_at = now();
end $$;


-- ------------------------------------------------------------- sheets

create or replace function public.dnd_save_sheet(p_slug text, p_data jsonb, p_play jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_sheet_storyteller(p_slug) then raise exception 'Only the campaign''s Dungeon Master can edit the whole sheet.'; end if;
  if jsonb_typeof(p_data) <> 'object' or not dnd_is_sheet(p_data) or jsonb_typeof(p_play) <> 'object'
     or octet_length(p_data::text) + octet_length(p_play::text) > 200000 then
    raise exception 'That sheet could not be saved.';
  end if;
  update character_sheets
     set data = p_data, play = p_play, name = coalesce(nullif(btrim(p_data ->> 'name'), ''), name), updated_at = now()
   where slug = p_slug and dnd_is_sheet(data);
  if not found then raise exception 'There is no such D&D sheet.'; end if;
end $$;

-- The DM: a blank level-1 sheet (characters normally come through Create a Character).
create or replace function public.dnd_create_sheet(p_slug text, p_chronicle text, p_name text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from chronicles where id = p_chronicle and game = 'dnd') then raise exception 'There is no such campaign.'; end if;
  if not is_chronicle_storyteller(p_chronicle) then raise exception 'Only the campaign''s Dungeon Master can create sheets.'; end if;
  if coalesce(p_slug, '') !~ '^[a-z0-9-]{1,40}$' then raise exception 'The short name may use a-z, 0-9 and dashes only.'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 120 then raise exception 'Give the character a name.'; end if;
  if exists (select 1 from character_sheets where slug = p_slug) then raise exception 'That short name is already taken.'; end if;
  insert into character_sheets (slug, chronicle, name, data, play) values (p_slug, p_chronicle, btrim(p_name),
    jsonb_build_object('name', btrim(p_name), 'classes', '[]'::jsonb, 'saves', '[]'::jsonb,
      'abilities', jsonb_build_object('str', 10, 'dex', 10, 'con', 10, 'int', 10, 'wis', 10, 'cha', 10),
      'skills', '{}'::jsonb, 'spells', '[]'::jsonb, 'feats', '[]'::jsonb, 'hpMax', 1, 'ac', 10, 'speed', 30),
    '{}'::jsonb);
end $$;

create or replace function public.dnd_delete_sheet(p_slug text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_sheet_storyteller(p_slug) then raise exception 'Only the campaign''s Dungeon Master can delete sheets.'; end if;
  delete from character_sheets where slug = p_slug and dnd_is_sheet(data);
  if not found then raise exception 'There is no such D&D sheet.'; end if;
end $$;


-- ------------------------------------------------------ permissions
revoke execute on function
  public.dnd_allowed_level(text), public.dnd_request_levelup(text, jsonb), public.dnd_close_levelup(bigint, text),
  public.dnd_approve_levelup(bigint, text), public.dnd_award(text, integer, integer, text), public.dnd_delete_award(bigint),
  public.dnd_set_advancement(text, text, integer), public.dnd_save_sheet(text, jsonb, jsonb),
  public.dnd_create_sheet(text, text, text), public.dnd_delete_sheet(text)
  from public, anon;
grant execute on function
  public.dnd_allowed_level(text), public.dnd_request_levelup(text, jsonb), public.dnd_close_levelup(bigint, text),
  public.dnd_approve_levelup(bigint, text), public.dnd_award(text, integer, integer, text), public.dnd_delete_award(bigint),
  public.dnd_set_advancement(text, text, integer), public.dnd_save_sheet(text, jsonb, jsonb),
  public.dnd_create_sheet(text, text, text), public.dnd_delete_sheet(text)
  to authenticated;
