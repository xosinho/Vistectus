-- =====================================================================
-- VisTectus — who belongs to which chronicle
-- ---------------------------------------------------------------------
-- Run this whole file once in Supabase: SQL Editor -> New query -> Run.
-- Safe to run again. Run it AFTER the Dead Hand files (sheets setup,
-- npc-sheets, archive-hidden, the case files block, rico-case/editors,
-- locations/setup) and BEFORE the Vampire chronicle's setup.sql.
--
-- What it does:
--   * chronicles: the list of chronicles (Dead Hand; A Crown of Ice and
--     Bone), each with its game and world.
--   * chronicle_members: who plays in, or tells, each chronicle. Adding
--     someone's email here is also their invitation: the sign-up check
--     at the end lets only listed emails create an account.
--   * site_admins: who may allocate Storytellers (you). Add yourself
--     with the line at the very end of this file.
--   * character_drafts: characters made with Create Hunter / Create
--     Kindred, waiting for the chronicle's Storyteller.
--   * Every rule that said "a Storyteller" now says "this chronicle's
--     Storyteller", and everything kept in the database (sheets, XP,
--     boards, hidden lists, locations, NPC sheets) is readable only by
--     the chronicle's members.
--
-- The existing Storytellers (the storytellers table) become Storytellers
-- of Dead Hand, and every player with a sheet becomes a player of that
-- sheet's chronicle, so nobody loses access.
-- =====================================================================


-- ------------------------------------------------------------ tables

create table if not exists public.site_admins (
  email  text primary key
);

-- A chronicle (D&D: a campaign). `path` is where its pages live on the
-- site, e.g. 'dnd/shrouded/campaign-one/'.
create table if not exists public.chronicles (
  id          text primary key check (id ~ '^[a-z0-9-]{1,60}$'),
  name        text not null,
  game        text not null,
  world       text not null check (world ~ '^[a-z0-9-]{1,60}$'),
  created_at  timestamptz not null default now()
);
alter table public.chronicles add column if not exists path text;
alter table public.chronicles drop constraint if exists chronicles_game_check;
alter table public.chronicles add constraint chronicles_game_check check (game in ('hunter', 'vampire', 'dnd'));
insert into public.chronicles (id, name, game, world, path) values
  ('dead-hand', 'Dead Hand', 'hunter', 'brooklyn', 'htr/brooklyn/dead-hand/'),
  ('crown-of-ice-and-bone', 'A Crown of Ice and Bone', 'vampire', 'hungary-1242', 'vtda/hungary-1242/crown-of-ice-and-bone/'),
  ('shrouded-campaign-one', 'Shrouded — Campaign One', 'dnd', 'shrouded', 'dnd/shrouded/campaign-one/'),
  ('the-last-garden-campaign-one', 'The Last Garden — Campaign One', 'dnd', 'the-last-garden', 'dnd/the-last-garden/campaign-one/')
on conflict (id) do nothing;
update public.chronicles set path = 'htr/brooklyn/dead-hand/' where id = 'dead-hand' and path is null;
update public.chronicles set path = 'vtda/hungary-1242/crown-of-ice-and-bone/' where id = 'crown-of-ice-and-bone' and path is null;

create table if not exists public.chronicle_members (
  chronicle  text not null references public.chronicles (id) on delete cascade,
  email      text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role       text not null check (role in ('player', 'storyteller')),
  added_by   text not null default '',
  added_at   timestamptz not null default now(),
  primary key (chronicle, email)
);

-- Characters made with Create Hunter / Create Kindred.
--   draft      the player is still working on it
--   submitted  waiting for the chronicle's Storyteller
--   approved   it is a character sheet now (sheet_slug)
--   rejected   sent back with a note; the player can change and resubmit
create table if not exists public.character_drafts (
  id            bigint generated always as identity primary key,
  chronicle     text not null references public.chronicles (id) on delete cascade,
  email         text not null,
  name          text not null default '' check (char_length(name) <= 120),
  data          jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  play          jsonb not null default '{}'::jsonb check (jsonb_typeof(play) = 'object'),
  status        text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected')),
  note          text not null default '',
  sheet_slug    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  submitted_at  timestamptz,
  decided_at    timestamptz,
  check (octet_length(data::text) + octet_length(play::text) < 200000)
);
create index if not exists character_drafts_chronicle on public.character_drafts (chronicle, status);

alter table public.site_admins       enable row level security;
alter table public.chronicles        enable row level security;
alter table public.chronicle_members enable row level security;
alter table public.character_drafts  enable row level security;

-- Who is a member is private: read only through the functions below.
-- The list of chronicles is not secret.
drop policy if exists "Chronicles are public" on public.chronicles;
create policy "Chronicles are public" on public.chronicles for select to anon, authenticated using (true);


-- ----------------------------------------------------------- who is who

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from site_admins where lower(email) = my_email() and my_email() <> '') $$;

-- 'storyteller', 'player', or null for someone not in the chronicle.
-- A site admin counts as a Storyteller of every chronicle.
create or replace function public.chronicle_role(p_chronicle text) returns text
language sql stable security definer set search_path = public
as $$
  select case when is_admin() and exists (select 1 from chronicles where id = p_chronicle) then 'storyteller'
              else (select role from chronicle_members where chronicle = p_chronicle and email = my_email() and my_email() <> '') end
$$;

create or replace function public.is_chronicle_storyteller(p_chronicle text) returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(chronicle_role(p_chronicle) = 'storyteller', false) $$;

create or replace function public.is_chronicle_member(p_chronicle text) returns boolean
language sql stable security definer set search_path = public
as $$ select chronicle_role(p_chronicle) is not null $$;

-- Worlds hold chronicles: the Dark Ages rules belong to Hungary 1242.
create or replace function public.is_world_member(p_world text) returns boolean
language sql stable security definer set search_path = public
as $$
  select is_admin() or exists (select 1 from chronicle_members m join chronicles c on c.id = m.chronicle
                                where c.world = p_world and m.email = my_email() and my_email() <> '')
$$;
create or replace function public.is_world_storyteller(p_world text) returns boolean
language sql stable security definer set search_path = public
as $$
  select is_admin() or exists (select 1 from chronicle_members m join chronicles c on c.id = m.chronicle
                                where c.world = p_world and m.role = 'storyteller' and m.email = my_email() and my_email() <> '')
$$;

-- Storyteller of any chronicle at all (shared things: the Hunter rules
-- tables, the Locations factions).
create or replace function public.is_storyteller() returns boolean
language sql stable security definer set search_path = public
as $$
  select is_admin() or exists (select 1 from chronicle_members where role = 'storyteller' and email = my_email() and my_email() <> '')
$$;

create or replace function public.sheet_chronicle(p_slug text) returns text
language sql stable security definer set search_path = public
as $$ select chronicle from character_sheets where slug = p_slug $$;

create or replace function public.is_sheet_storyteller(p_slug text) returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(is_chronicle_storyteller(sheet_chronicle(p_slug)), false) $$;

-- The chronicles the signed-in account belongs to, for the pages.
create or replace function public.my_chronicles()
returns table (chronicle text, name text, game text, world text, role text)
language sql stable security definer set search_path = public
as $$
  select c.id, c.name, c.game, c.world, chronicle_role(c.id)
    from chronicles c where chronicle_role(c.id) is not null order by c.name
$$;

-- The signed-in player's own character sheets in a chronicle (the Log in page).
create or replace function public.my_sheets(p_chronicle text)
returns table (slug text, name text)
language sql stable security definer set search_path = public
as $$
  select s.slug, s.name from character_sheets s join sheet_owners o on o.slug = s.slug
   where s.chronicle = p_chronicle and lower(o.email) = my_email() and my_email() <> ''
     and is_chronicle_member(p_chronicle)
   order by s.name
$$;


-- -------------------------------------------------------- allocating

-- A chronicle's members: for its Storytellers and site admins.
create or replace function public.members_of(p_chronicle text)
returns table (email text, role text, added_at timestamptz, has_account boolean)
language sql stable security definer set search_path = public
as $$
  select m.email, m.role, m.added_at, exists (select 1 from auth.users u where lower(u.email) = m.email)
    from chronicle_members m
   where m.chronicle = p_chronicle and is_chronicle_storyteller(p_chronicle)
   order by m.role desc, m.email
$$;

-- Add someone, or change their role. A site admin may add Storytellers
-- and players anywhere; a chronicle's Storyteller may add players to it.
create or replace function public.add_member(p_chronicle text, p_email text, p_role text)
returns void
language plpgsql security definer set search_path = public
as $$
declare cur text;
begin
  p_email := lower(btrim(coalesce(p_email, '')));
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'That is not an email address.'; end if;
  if p_role not in ('player', 'storyteller') then raise exception 'The role is player or storyteller.'; end if;
  if not exists (select 1 from chronicles where id = p_chronicle) then raise exception 'There is no such chronicle.'; end if;
  select role into cur from chronicle_members where chronicle = p_chronicle and email = p_email;
  if not is_admin() then
    if not is_chronicle_storyteller(p_chronicle) then raise exception 'Only the chronicle''s Storyteller can add players.'; end if;
    if p_role <> 'player' or cur = 'storyteller' then raise exception 'Only a site admin can add or change Storytellers.'; end if;
  end if;
  insert into chronicle_members (chronicle, email, role, added_by) values (p_chronicle, p_email, p_role, my_email())
    on conflict (chronicle, email) do update set role = excluded.role;
end $$;

-- Take someone out of a chronicle. They lose their sheets' ownership in
-- it too (the sheets stay, for the Storyteller to give to someone else).
create or replace function public.remove_member(p_chronicle text, p_email text)
returns void
language plpgsql security definer set search_path = public
as $$
declare cur text;
begin
  p_email := lower(btrim(coalesce(p_email, '')));
  select role into cur from chronicle_members where chronicle = p_chronicle and email = p_email;
  if cur is null then raise exception 'That email is not in the chronicle.'; end if;
  if not is_admin() then
    if not is_chronicle_storyteller(p_chronicle) then raise exception 'Only the chronicle''s Storyteller can remove players.'; end if;
    if cur = 'storyteller' then raise exception 'Only a site admin can remove a Storyteller.'; end if;
  end if;
  delete from chronicle_members where chronicle = p_chronicle and email = p_email;
  delete from sheet_owners o using character_sheets s
   where s.slug = o.slug and s.chronicle = p_chronicle and lower(o.email) = p_email;
end $$;

-- Storyteller: say which member plays a character. An empty email
-- removes the player.
create or replace function public.set_sheet_owner(p_slug text, p_email text)
returns void
language plpgsql security definer set search_path = public
as $$
declare c text := sheet_chronicle(p_slug);
begin
  if c is null then raise exception 'There is no such sheet.'; end if;
  if not is_chronicle_storyteller(c) then raise exception 'Only the chronicle''s Storyteller can assign players.'; end if;
  p_email := lower(btrim(coalesce(p_email, '')));
  if p_email = '' then delete from sheet_owners where slug = p_slug; return; end if;
  if not exists (select 1 from chronicle_members where chronicle = c and email = p_email) then
    raise exception 'Add % to the chronicle first.', p_email;
  end if;
  insert into sheet_owners (slug, email) values (p_slug, p_email)
    on conflict (slug) do update set email = excluded.email;
end $$;

-- Storyteller: who plays which character in a chronicle.
create or replace function public.sheet_owners_of(p_chronicle text)
returns table (slug text, email text)
language sql stable security definer set search_path = public
as $$
  select o.slug, lower(o.email) from sheet_owners o join character_sheets s on s.slug = o.slug
   where s.chronicle = p_chronicle and is_chronicle_storyteller(p_chronicle)
$$;

-- Site admin: add or rename a chronicle or campaign. p_path: where its
-- pages live, e.g. 'dnd/shrouded/campaign-two/' (empty: the usual place).
drop function if exists public.save_chronicle(text, text, text, text);
create or replace function public.save_chronicle(p_id text, p_name text, p_game text, p_world text, p_path text default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'Only a site admin can add chronicles.'; end if;
  p_path := nullif(btrim(coalesce(p_path, '')), '');
  if p_path is not null and p_path !~ '^[a-z0-9/-]{1,200}/$' then raise exception 'The folder looks like dnd/world/campaign/ (lower case, ending in /).'; end if;
  insert into chronicles (id, name, game, world, path)
  values (p_id, btrim(p_name), p_game, p_world,
          coalesce(p_path, case p_game when 'hunter' then 'htr/' when 'vampire' then 'vtda/' else 'dnd/' end || p_world || '/' || p_id || '/'))
    on conflict (id) do update set name = excluded.name, game = excluded.game, world = excluded.world, path = excluded.path;
end $$;


-- --------------------------------------------- the existing members
insert into chronicle_members (chronicle, email, role, added_by)
  select 'dead-hand', lower(btrim(email)), 'storyteller', 'migration' from storytellers
  where lower(btrim(email)) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
on conflict (chronicle, email) do nothing;
insert into chronicle_members (chronicle, email, role, added_by)
  select distinct s.chronicle, lower(btrim(o.email)), 'player', 'migration'
    from sheet_owners o join character_sheets s on s.slug = o.slug
   where s.chronicle in (select id from chronicles) and lower(btrim(o.email)) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
on conflict (chronicle, email) do nothing;


-- ---------------------------------------------------- creating characters

-- Save a draft (new when p_id is null). Players of the chronicle, and
-- its Storytellers, may make characters; each keeps their own drafts.
create or replace function public.save_draft(p_id bigint, p_chronicle text, p_name text, p_data jsonb, p_play jsonb)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare d character_drafts; new_id bigint;
begin
  if my_email() = '' then raise exception 'Sign in first.'; end if;
  if jsonb_typeof(p_data) <> 'object' or jsonb_typeof(p_play) <> 'object' then raise exception 'That character could not be saved.'; end if;
  if p_id is null then
    if not is_chronicle_member(p_chronicle) then raise exception 'You are not in this chronicle.'; end if;
    if (select count(*) from character_drafts where chronicle = p_chronicle and email = my_email() and status <> 'approved') >= 5 then
      raise exception 'You already have five characters in progress here. Finish or delete one first.';
    end if;
    insert into character_drafts (chronicle, email, name, data, play)
    values (p_chronicle, my_email(), left(btrim(coalesce(p_name, '')), 120), p_data, p_play) returning id into new_id;
    return new_id;
  end if;
  select * into d from character_drafts where id = p_id for update;
  if not found or d.email <> my_email() then raise exception 'That is not your character.'; end if;
  if not is_chronicle_member(d.chronicle) then raise exception 'You are no longer in this chronicle.'; end if;
  if d.status not in ('draft', 'rejected') then raise exception 'This character is with the Storyteller; withdraw it first to change it.'; end if;
  update character_drafts set name = left(btrim(coalesce(p_name, '')), 120), data = p_data, play = p_play,
         status = 'draft', updated_at = now() where id = p_id;
  return p_id;
end $$;

create or replace function public.submit_draft(p_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare d character_drafts;
begin
  select * into d from character_drafts where id = p_id for update;
  if not found or d.email <> my_email() then raise exception 'That is not your character.'; end if;
  if d.status not in ('draft', 'rejected') then raise exception 'This character has already been sent.'; end if;
  if btrim(d.name) = '' then raise exception 'Give the character a name first.'; end if;
  update character_drafts set status = 'submitted', submitted_at = now(), updated_at = now() where id = p_id;
end $$;

-- Take a sent character back to change it.
create or replace function public.withdraw_draft(p_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare d character_drafts;
begin
  select * into d from character_drafts where id = p_id for update;
  if not found or d.email <> my_email() then raise exception 'That is not your character.'; end if;
  if d.status <> 'submitted' then raise exception 'Only a character waiting for the Storyteller can be withdrawn.'; end if;
  update character_drafts set status = 'draft', updated_at = now() where id = p_id;
end $$;

create or replace function public.delete_draft(p_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare d character_drafts;
begin
  select * into d from character_drafts where id = p_id for update;
  if not found then raise exception 'That character is already gone.'; end if;
  if not (d.email = my_email() or is_chronicle_storyteller(d.chronicle)) then raise exception 'That is not your character.'; end if;
  if d.status = 'approved' then raise exception 'An approved character is a sheet now; it cannot be deleted here.'; end if;
  delete from character_drafts where id = p_id;
end $$;

-- Storyteller: turn a submitted character into a sheet the player owns.
create or replace function public.approve_draft(p_id bigint, p_slug text, p_note text default '')
returns void
language plpgsql security definer set search_path = public
as $$
declare d character_drafts; g text;
begin
  select * into d from character_drafts where id = p_id for update;
  if not found then raise exception 'There is no such character.'; end if;
  if not is_chronicle_storyteller(d.chronicle) then raise exception 'Only the chronicle''s Storyteller can approve characters.'; end if;
  if d.status <> 'submitted' then raise exception 'Only a character sent for approval can be approved.'; end if;
  if coalesce(p_slug, '') !~ '^[a-z0-9-]{1,40}$' then raise exception 'The short name may use a-z, 0-9 and dashes only.'; end if;
  if exists (select 1 from character_sheets where slug = p_slug) then raise exception 'That short name is already taken.'; end if;
  select game into g from chronicles where id = d.chronicle;
  if g = 'vampire' and not coalesce(jsonb_typeof(d.data -> 'attributes') = 'object' and jsonb_typeof(d.data -> 'abilities') = 'object', false) then
    raise exception 'This is not a complete Dark Ages character.';
  end if;
  if g = 'hunter' and not coalesce(jsonb_typeof(d.data -> 'attributes') = 'object' and jsonb_typeof(d.data -> 'skills') = 'object', false) then
    raise exception 'This is not a complete Hunter character.';
  end if;
  if g = 'dnd' and not coalesce(jsonb_typeof(d.data -> 'abilities') = 'object' and jsonb_typeof(d.data -> 'classes') = 'array'
                                and jsonb_array_length(d.data -> 'classes') > 0, false) then
    raise exception 'This is not a complete D&D character.';
  end if;
  insert into character_sheets (slug, chronicle, name, data, play)
  values (p_slug, d.chronicle, coalesce(nullif(btrim(d.name), ''), p_slug), (d.data - '_creation') || jsonb_build_object('name', d.name), d.play);
  insert into chronicle_members (chronicle, email, role, added_by) values (d.chronicle, d.email, 'player', my_email())
    on conflict (chronicle, email) do nothing;
  insert into sheet_owners (slug, email) values (p_slug, d.email)
    on conflict (slug) do update set email = excluded.email;
  update character_drafts set status = 'approved', sheet_slug = p_slug, note = left(coalesce(p_note, ''), 1000),
         decided_at = now(), updated_at = now() where id = p_id;
end $$;

create or replace function public.reject_draft(p_id bigint, p_note text)
returns void
language plpgsql security definer set search_path = public
as $$
declare d character_drafts;
begin
  select * into d from character_drafts where id = p_id for update;
  if not found then raise exception 'There is no such character.'; end if;
  if not is_chronicle_storyteller(d.chronicle) then raise exception 'Only the chronicle''s Storyteller can send characters back.'; end if;
  if d.status <> 'submitted' then raise exception 'Only a character sent for approval can be sent back.'; end if;
  update character_drafts set status = 'rejected', note = left(coalesce(p_note, ''), 1000), decided_at = now(), updated_at = now()
   where id = p_id;
end $$;

drop policy if exists "Own drafts, or the Storyteller's" on public.character_drafts;
create policy "Own drafts, or the Storyteller's" on public.character_drafts for select to authenticated
  using ((email = my_email() and my_email() <> '' and is_chronicle_member(chronicle)) or is_chronicle_storyteller(chronicle));
revoke all on public.character_drafts from anon;


-- ------------------------------------------- the Dead Hand sheet rules
-- (assets/sheets/sql/setup.sql), now checking the sheet's own chronicle

create or replace function public.sheet_role(p_slug text) returns text
language sql stable security definer set search_path = public
as $$ select case when is_sheet_storyteller(p_slug) then 'storyteller'
                  when owns_sheet(p_slug) then 'owner'
                  else 'viewer' end $$;

create or replace function public.request_xp(p_slug text, p_kind text, p_trait text, p_detail text default '')
returns void
language plpgsql security definer set search_path = public
as $$
declare
  s        character_sheets;
  lvl      integer := 0;
  price    integer;
  avail    integer;
  waiting  integer;
  idx      integer;
begin
  if not (owns_sheet(p_slug) or is_sheet_storyteller(p_slug)) then
    raise exception 'You can only spend XP on your own sheet.';
  end if;
  select * into s from character_sheets where slug = p_slug for update;
  if not found then raise exception 'There is no such sheet.'; end if;

  p_trait  := btrim(coalesce(p_trait, ''));
  p_detail := btrim(coalesce(p_detail, ''));
  if char_length(p_trait) > 80 or char_length(p_detail) > 80 then
    raise exception 'That name is too long.';
  end if;

  select count(*) into waiting from xp_requests
   where slug = p_slug and kind = p_kind and lower(trait) = lower(p_trait) and status = 'pending';

  if p_kind in ('attribute', 'skill') then
    if s.data -> (p_kind || 's') -> p_trait is null then
      raise exception 'Unknown %.', p_kind;
    end if;
    lvl := (s.data -> (p_kind || 's') ->> p_trait)::integer + waiting;
    if lvl >= 5 then raise exception 'That is already at five dots.'; end if;

  elsif p_kind = 'advantage' then
    if p_trait = '' then raise exception 'Name the Advantage.'; end if;
    idx := row_index(s.data, 'advantages', p_trait);
    if idx is null and waiting = 0 and jsonb_array_length(coalesce(s.data -> 'advantages', '[]'))
         + (select count(distinct lower(trait)) from xp_requests
             where slug = p_slug and kind = 'advantage' and status = 'pending' and from_level = 0) >= 11 then
      raise exception 'The sheet has no room for another Advantage.';
    end if;
    lvl := coalesce((s.data -> 'advantages' -> idx ->> 'dots')::integer, 0) + waiting;
    if lvl >= 5 then raise exception 'That is already at five dots.'; end if;

  elsif p_kind = 'specialty' then
    if s.data -> 'skills' -> p_trait is null then raise exception 'Unknown skill.'; end if;
    if (s.data -> 'skills' ->> p_trait)::integer < 1 then
      raise exception 'A Specialty needs at least one dot in its Skill.';
    end if;
    if p_detail = '' then raise exception 'Name the Specialty.'; end if;
    if exists (select 1 from jsonb_array_elements(coalesce(s.data -> 'specialties', '[]')) e(v)
               where e.v ->> 'skill' = p_trait and lower(e.v ->> 'name') = lower(p_detail))
       or exists (select 1 from xp_requests where slug = p_slug and kind = 'specialty' and status = 'pending'
                  and trait = p_trait and lower(detail) = lower(p_detail)) then
      raise exception 'That Specialty is already on the sheet or waiting.';
    end if;

  elsif p_kind = 'edge' then
    if p_trait = '' then raise exception 'Name the Edge.'; end if;
    if row_index(s.data, 'edges', p_trait) is not null or waiting > 0 then
      raise exception 'That Edge is already on the sheet or waiting.';
    end if;
    if jsonb_array_length(coalesce(s.data -> 'edges', '[]'))
       + (select count(*) from xp_requests where slug = p_slug and kind = 'edge' and status = 'pending') >= 11 then
      raise exception 'The sheet has no room for another Edge.';
    end if;

  elsif p_kind = 'perk' then
    if row_index(s.data, 'edges', p_trait) is null then raise exception 'Unknown Edge.'; end if;
    if p_detail = '' then raise exception 'Name the Perk.'; end if;

  else
    raise exception 'Unknown kind of purchase.';
  end if;

  select case when per_level then cost * (lvl + 1) else cost end into price
    from xp_costs where kind = p_kind;
  if price is null then
    raise exception 'The Storyteller has not set a cost for this yet.';
  end if;

  avail := xp_available(p_slug);
  if price > avail then
    raise exception 'Not enough XP: this costs %, and % is available.', price, avail;
  end if;

  insert into xp_requests (slug, kind, trait, detail, from_level, to_level, cost)
  values (p_slug, p_kind, p_trait, p_detail, lvl, lvl + 1, price);
end $$;

create or replace function public.close_xp_request(p_id bigint, p_note text default '')
returns void
language plpgsql security definer set search_path = public
as $$
declare r xp_requests; new_status text;
begin
  select * into r from xp_requests where id = p_id for update;
  if not found or r.status <> 'pending' then raise exception 'That purchase is no longer waiting.'; end if;
  if is_sheet_storyteller(r.slug) then new_status := 'rejected';
  elsif owns_sheet(r.slug) then new_status := 'cancelled';
  else raise exception 'Only the player or a Storyteller can do that.';
  end if;

  update xp_requests
     set status = new_status, decided_at = now(), note = left(coalesce(p_note, ''), 300)
   where status = 'pending' and slug = r.slug and kind = r.kind and lower(trait) = lower(r.trait)
     and (id = r.id or (r.kind in ('attribute', 'skill', 'advantage') and to_level > r.to_level));
end $$;

create or replace function public.approve_xp_request(p_id bigint, p_note text default '')
returns void
language plpgsql security definer set search_path = public
as $$
declare
  r    xp_requests;
  d    jsonb;
  idx  integer;
  cur  integer;
  awarded integer;
  spent   integer;
begin
  select * into r from xp_requests where id = p_id for update;
  if not found or r.status <> 'pending' then raise exception 'That purchase is no longer waiting.'; end if;
  if not is_sheet_storyteller(r.slug) then raise exception 'Only the chronicle''s Storyteller can approve purchases.'; end if;
  select data into d from character_sheets where slug = r.slug for update;

  select coalesce(sum(amount), 0) into awarded from xp_awards where slug = r.slug;
  select coalesce(sum(cost), 0) into spent from xp_requests where slug = r.slug and status = 'approved';
  if spent + r.cost > awarded then
    raise exception 'Not enough XP left for this: % awarded, % already spent.', awarded, spent;
  end if;

  if r.kind in ('attribute', 'skill') then
    cur := (d -> (r.kind || 's') ->> r.trait)::integer;
    if cur <> r.from_level then
      raise exception 'The sheet shows % at %, not %. Approve the earlier purchase first, or reject this one.',
        r.trait, cur, r.from_level;
    end if;
    d := jsonb_set(d, array[r.kind || 's', r.trait], to_jsonb(r.to_level));

  elsif r.kind = 'advantage' then
    idx := row_index(d, 'advantages', r.trait);
    cur := coalesce((d -> 'advantages' -> idx ->> 'dots')::integer, 0);
    if cur <> r.from_level then
      raise exception 'The sheet shows % at %, not %. Approve the earlier purchase first.', r.trait, cur, r.from_level;
    end if;
    if idx is null then
      if jsonb_array_length(coalesce(d -> 'advantages', '[]')) >= 11 then
        raise exception 'The sheet has no room for another Advantage.';
      end if;
      d := jsonb_set(d, '{advantages}', coalesce(d -> 'advantages', '[]')
             || jsonb_build_array(jsonb_build_object('name', r.trait, 'dots', 1)));
    else
      d := jsonb_set(d, array['advantages', idx::text, 'dots'], to_jsonb(r.to_level));
    end if;

  elsif r.kind = 'specialty' then
    d := jsonb_set(d, '{specialties}', coalesce(d -> 'specialties', '[]')
           || jsonb_build_array(jsonb_build_object('skill', r.trait, 'name', r.detail)));

  elsif r.kind = 'edge' then
    if jsonb_array_length(coalesce(d -> 'edges', '[]')) >= 11 then
      raise exception 'The sheet has no room for another Edge.';
    end if;
    d := jsonb_set(d, '{edges}', coalesce(d -> 'edges', '[]')
           || jsonb_build_array(jsonb_build_object('name', r.trait, 'perks', '[]'::jsonb, 'notes', '')));

  elsif r.kind = 'perk' then
    idx := row_index(d, 'edges', r.trait);
    if idx is null then raise exception 'The Edge % is no longer on the sheet.', r.trait; end if;
    d := jsonb_set(d, array['edges', idx::text, 'perks'],
           coalesce(d -> 'edges' -> idx -> 'perks', '[]') || to_jsonb(r.detail));
  end if;

  update character_sheets set data = d, updated_at = now() where slug = r.slug;
  update xp_requests set status = 'approved', decided_at = now(), note = left(coalesce(p_note, ''), 300)
   where id = r.id;
end $$;

create or replace function public.refund_xp_request(p_id bigint, p_note text default '')
returns void
language plpgsql security definer set search_path = public
as $$
declare
  r    xp_requests;
  d    jsonb;
  idx  integer;
  cur  integer;
  perks jsonb;
begin
  select * into r from xp_requests where id = p_id for update;
  if not found or r.status <> 'approved' then raise exception 'Only an approved purchase can be refunded.'; end if;
  if not is_sheet_storyteller(r.slug) then raise exception 'Only the chronicle''s Storyteller can refund purchases.'; end if;
  select data into d from character_sheets where slug = r.slug for update;

  if r.kind in ('attribute', 'skill') then
    cur := (d -> (r.kind || 's') ->> r.trait)::integer;
    if cur <> r.to_level then
      raise exception 'The sheet now shows % at %. Refund later purchases first, or change it by hand.', r.trait, cur;
    end if;
    d := jsonb_set(d, array[r.kind || 's', r.trait], to_jsonb(r.from_level));

  elsif r.kind = 'advantage' then
    idx := row_index(d, 'advantages', r.trait);
    cur := coalesce((d -> 'advantages' -> idx ->> 'dots')::integer, 0);
    if idx is null or cur <> r.to_level then
      raise exception 'The sheet no longer shows % at %. Change it by hand instead.', r.trait, r.to_level;
    end if;
    if r.from_level = 0 then
      d := jsonb_set(d, '{advantages}', (d -> 'advantages') - idx);
    else
      d := jsonb_set(d, array['advantages', idx::text, 'dots'], to_jsonb(r.from_level));
    end if;

  elsif r.kind = 'specialty' then
    d := jsonb_set(d, '{specialties}', coalesce((
           select jsonb_agg(e.v order by e.ord) from jsonb_array_elements(d -> 'specialties') with ordinality e(v, ord)
            where not (e.v ->> 'skill' = r.trait and lower(e.v ->> 'name') = lower(r.detail))), '[]'));

  elsif r.kind = 'edge' then
    idx := row_index(d, 'edges', r.trait);
    if idx is null then raise exception 'The Edge % is no longer on the sheet.', r.trait; end if;
    d := jsonb_set(d, '{edges}', (d -> 'edges') - idx);

  elsif r.kind = 'perk' then
    idx := row_index(d, 'edges', r.trait);
    if idx is null then raise exception 'The Edge % is no longer on the sheet.', r.trait; end if;
    select coalesce(jsonb_agg(e.v order by e.ord), '[]') into perks
      from jsonb_array_elements(coalesce(d -> 'edges' -> idx -> 'perks', '[]')) with ordinality e(v, ord)
     where lower(e.v #>> '{}') <> lower(r.detail);
    d := jsonb_set(d, array['edges', idx::text, 'perks'], perks);
  end if;

  update character_sheets set data = d, updated_at = now() where slug = r.slug;
  update xp_requests set status = 'refunded', decided_at = now(), note = left(coalesce(p_note, ''), 300)
   where id = r.id;
end $$;

create or replace function public.award_xp(p_slug text, p_amount integer, p_note text default '')
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_sheet_storyteller(p_slug) then raise exception 'Only the chronicle''s Storyteller can award XP.'; end if;
  if not exists (select 1 from character_sheets where slug = p_slug) then raise exception 'There is no such sheet.'; end if;
  if coalesce(p_amount, 0) = 0 then raise exception 'Award a number of XP other than zero.'; end if;
  if xp_available(p_slug) + p_amount < 0 then
    raise exception 'That would leave less XP than has already been spent or requested.';
  end if;
  insert into xp_awards (slug, amount, note) values (p_slug, p_amount, left(coalesce(p_note, ''), 200));
end $$;

create or replace function public.delete_xp_award(p_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare a xp_awards;
begin
  select * into a from xp_awards where id = p_id for update;
  if not found then raise exception 'That award is already gone.'; end if;
  if not is_sheet_storyteller(a.slug) then raise exception 'Only the chronicle''s Storyteller can remove an award.'; end if;
  if xp_available(a.slug) - a.amount < 0 then
    raise exception 'Removing it would leave less XP than has already been spent or requested.';
  end if;
  delete from xp_awards where id = p_id;
end $$;

create or replace function public.save_play(p_slug text, p_play jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not (owns_sheet(p_slug) or is_sheet_storyteller(p_slug)) then
    raise exception 'You can only change your own sheet.';
  end if;
  if jsonb_typeof(p_play) <> 'object' or octet_length(p_play::text) > 100000 then
    raise exception 'That sheet could not be saved.';
  end if;
  update character_sheets set play = p_play, updated_at = now() where slug = p_slug;
  if not found then raise exception 'There is no such sheet.'; end if;
end $$;

create or replace function public.save_sheet(p_slug text, p_data jsonb, p_play jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_sheet_storyteller(p_slug) then raise exception 'Only the chronicle''s Storyteller can edit the whole sheet.'; end if;
  if jsonb_typeof(p_data) <> 'object' or jsonb_typeof(p_data -> 'attributes') <> 'object'
     or jsonb_typeof(p_data -> 'skills') <> 'object' or jsonb_typeof(p_play) <> 'object'
     or octet_length(p_data::text) + octet_length(p_play::text) > 200000 then
    raise exception 'That sheet could not be saved.';
  end if;
  update character_sheets
     set data = p_data, play = p_play, name = coalesce(nullif(btrim(p_data ->> 'name'), ''), name), updated_at = now()
   where slug = p_slug;
  if not found then raise exception 'There is no such sheet.'; end if;
end $$;

drop policy if exists "Sheets are public"    on public.character_sheets;
drop policy if exists "Members read sheets"  on public.character_sheets;
create policy "Members read sheets" on public.character_sheets for select to authenticated
  using (is_chronicle_member(chronicle));
drop policy if exists "Awards are public"    on public.xp_awards;
drop policy if exists "Members read awards"  on public.xp_awards;
create policy "Members read awards" on public.xp_awards for select to authenticated
  using (is_chronicle_member(sheet_chronicle(slug)));
drop policy if exists "Purchases are public"   on public.xp_requests;
drop policy if exists "Members read purchases" on public.xp_requests;
create policy "Members read purchases" on public.xp_requests for select to authenticated
  using (is_chronicle_member(sheet_chronicle(slug)));


-- -------------------------------------------------------- NPC sheets
drop policy if exists "Storytellers only" on public.npc_sheets;
create policy "Storytellers only" on public.npc_sheets for all to authenticated
  using (is_chronicle_storyteller(chronicle)) with check (is_chronicle_storyteller(chronicle));


-- ----------------------------------------------- hidden from players
drop policy if exists "Anyone reads the hidden list" on public.archive_hidden;
drop policy if exists "Members read the hidden list" on public.archive_hidden;
drop policy if exists "Storytellers hide items"      on public.archive_hidden;
drop policy if exists "Storytellers show items"      on public.archive_hidden;
create policy "Members read the hidden list" on public.archive_hidden for select to authenticated
  using (is_chronicle_member(chronicle));
create policy "Storytellers hide items" on public.archive_hidden for insert to authenticated
  with check (is_chronicle_storyteller(chronicle));
create policy "Storytellers show items" on public.archive_hidden for delete to authenticated
  using (is_chronicle_storyteller(chronicle));


-- ------------------------------------------------------------- boards
-- The RICO Case board and the Intrigue Board share case_files and the
-- case-photos bucket; rows are kept apart by chronicle, pictures by
-- their first folder.

-- Dead Hand: Vivienne's and Ezekiel's players, and its Storytellers.
create or replace function public.case_board_editor() returns boolean
language sql stable security definer set search_path = public
as $$ select owns_sheet('vivienne') or owns_sheet('ezekiel') or is_chronicle_storyteller('dead-hand') $$;

-- May the signed-in account save and delete this chronicle's boards?
create or replace function public.board_editor(p_chronicle text) returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(case p_chronicle when 'dead-hand' then case_board_editor()
                                   else is_chronicle_member(p_chronicle) end, false)
$$;
revoke execute on function public.board_editor(text) from public;
grant  execute on function public.board_editor(text) to anon, authenticated, service_role;

drop policy if exists "Anyone can open case files"           on public.case_files;
drop policy if exists "Members open boards"                  on public.case_files;
drop policy if exists "Signed-in players save case files"    on public.case_files;
drop policy if exists "Signed-in players delete case files"  on public.case_files;
drop policy if exists "Case board editors save case files"   on public.case_files;
drop policy if exists "Case board editors delete case files" on public.case_files;
drop policy if exists "Board editors save boards"            on public.case_files;
drop policy if exists "Board editors delete boards"          on public.case_files;
create policy "Members open boards" on public.case_files for select to authenticated
  using (is_chronicle_member(chronicle));
create policy "Board editors save boards" on public.case_files for insert to authenticated
  with check (saved_by = (select auth.uid()) and board_editor(chronicle));
create policy "Board editors delete boards" on public.case_files for delete to authenticated
  using (board_editor(chronicle));

drop policy if exists "Signed-in players add case photos"  on storage.objects;
drop policy if exists "Case board editors add case photos" on storage.objects;
drop policy if exists "Board editors add board photos"     on storage.objects;
create policy "Board editors add board photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'case-photos' and case
                when name like 'dead-hand/%' or name not like '%/%' then case_board_editor()
                when split_part(name, '/', 1) in (select id from chronicles) then board_editor(split_part(name, '/', 1))
                else false end);


-- ---------------------------------------------------------- locations
drop policy if exists "Revealed pins are public"  on public.location_pins;
drop policy if exists "Members see revealed pins" on public.location_pins;
drop policy if exists "Storytellers add pins"     on public.location_pins;
drop policy if exists "Storytellers change pins"  on public.location_pins;
drop policy if exists "Storytellers remove pins"  on public.location_pins;
create policy "Members see revealed pins" on public.location_pins for select to authenticated
  using (is_chronicle_storyteller(chronicle) or (revealed and is_chronicle_member(chronicle)));
create policy "Storytellers add pins"    on public.location_pins for insert to authenticated with check (is_chronicle_storyteller(chronicle));
create policy "Storytellers change pins" on public.location_pins for update to authenticated
  using (is_chronicle_storyteller(chronicle)) with check (is_chronicle_storyteller(chronicle));
create policy "Storytellers remove pins" on public.location_pins for delete to authenticated using (is_chronicle_storyteller(chronicle));

drop policy if exists "Revealed maps are public"  on public.location_maps;
drop policy if exists "Members see revealed maps" on public.location_maps;
drop policy if exists "Storytellers add maps"     on public.location_maps;
drop policy if exists "Storytellers change maps"  on public.location_maps;
drop policy if exists "Storytellers remove maps"  on public.location_maps;
create policy "Members see revealed maps" on public.location_maps for select to authenticated
  using (is_chronicle_storyteller(chronicle) or (revealed and is_chronicle_member(chronicle)));
create policy "Storytellers add maps"    on public.location_maps for insert to authenticated with check (is_chronicle_storyteller(chronicle));
create policy "Storytellers change maps" on public.location_maps for update to authenticated
  using (is_chronicle_storyteller(chronicle)) with check (is_chronicle_storyteller(chronicle));
create policy "Storytellers remove maps" on public.location_maps for delete to authenticated using (is_chronicle_storyteller(chronicle));

drop policy if exists "Storytellers only" on public.location_notes;
create policy "Storytellers only" on public.location_notes for all to authenticated
  using (exists (select 1 from location_pins p where p.id = location_notes.id and is_chronicle_storyteller(p.chronicle)))
  with check (exists (select 1 from location_pins p where p.id = location_notes.id and is_chronicle_storyteller(p.chronicle)));
drop policy if exists "Storytellers only" on public.location_setups;
create policy "Storytellers only" on public.location_setups for all to authenticated
  using (is_chronicle_storyteller(chronicle)) with check (is_chronicle_storyteller(chronicle));
-- location_factions stays shared by every chronicle's Storytellers.

drop policy if exists "Revealed location maps can be seen" on storage.objects;
drop policy if exists "Storytellers upload location maps"  on storage.objects;
drop policy if exists "Storytellers remove location maps"  on storage.objects;
create policy "Revealed location maps can be seen" on storage.objects for select to authenticated
  using (bucket_id = 'location-maps' and exists (
           select 1 from public.location_maps m where m.image_path = objects.name
              and (public.is_chronicle_storyteller(m.chronicle) or (m.revealed and public.is_chronicle_member(m.chronicle)))));
create policy "Storytellers upload location maps" on storage.objects for insert to authenticated
  with check (bucket_id = 'location-maps' and public.is_chronicle_storyteller(split_part(name, '/', 1)));
create policy "Storytellers remove location maps" on storage.objects for delete to authenticated
  using (bucket_id = 'location-maps' and public.is_chronicle_storyteller(split_part(name, '/', 1)));

create or replace function public.location_snapshot(p_chronicle text) returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object('pins', coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'name', p.name, 'description', p.description,
           'lat', p.lat, 'lng', p.lng, 'revealed', p.revealed, 'sort', p.sort,
           'faction', coalesce(n.faction, 'neutral'), 'notes', coalesce(n.notes, ''))
           order by p.sort, p.id), '[]'::jsonb))
  from location_pins p left join location_notes n on n.id = p.id
  where p.chronicle = p_chronicle and is_chronicle_storyteller(p_chronicle)
$$;

create or replace function public.apply_location_snapshot(p_chronicle text, p_snapshot jsonb) returns void
language plpgsql security definer set search_path = public
as $$
declare pin jsonb;
begin
  if not is_chronicle_storyteller(p_chronicle) then raise exception 'Only the chronicle''s Storyteller can load a setup.'; end if;
  if jsonb_typeof(p_snapshot -> 'pins') <> 'array' then raise exception 'That is not a locations setup.'; end if;
  if exists (select 1 from jsonb_array_elements(p_snapshot -> 'pins') e
              join location_pins p on p.id = e ->> 'id' where p.chronicle <> p_chronicle) then
    raise exception 'That setup has pins of another chronicle.';
  end if;
  delete from location_pins where chronicle = p_chronicle
     and id not in (select e ->> 'id' from jsonb_array_elements(p_snapshot -> 'pins') e);
  for pin in select * from jsonb_array_elements(p_snapshot -> 'pins') loop
    if coalesce(pin ->> 'id', '') = '' or coalesce(pin ->> 'name', '') = '' then
      raise exception 'A pin in that setup has no id or name.';
    end if;
    insert into location_pins (id, chronicle, name, description, lat, lng, revealed, sort, updated_at)
    values (pin ->> 'id', p_chronicle, pin ->> 'name', coalesce(pin ->> 'description', ''),
            (pin ->> 'lat')::double precision, (pin ->> 'lng')::double precision,
            coalesce((pin ->> 'revealed')::boolean, false), coalesce((pin ->> 'sort')::integer, 0), now())
    on conflict (id) do update set name = excluded.name, description = excluded.description,
      lat = excluded.lat, lng = excluded.lng, revealed = excluded.revealed, sort = excluded.sort, updated_at = now()
    where location_pins.chronicle = p_chronicle;
    insert into location_notes (id, faction, notes)
    values (pin ->> 'id', coalesce(pin ->> 'faction', 'neutral'), coalesce(pin ->> 'notes', ''))
    on conflict (id) do update set faction = excluded.faction, notes = excluded.notes;
  end loop;
end $$;


-- ---------------------------------------------- the sign-up check
-- Adding an email to a chronicle is its invitation: with this hook
-- switched on, an account can only be created for an email that is in
-- a chronicle (or a site admin, or a Storyteller from before). Switch
-- it on in Supabase: Authentication -> Hooks -> "Before User Created"
-- -> Postgres -> public.hook_before_user_created. Also Authentication
-- -> Sign In / Providers -> "Allow new users to sign up" must be ON.
create or replace function public.hook_before_user_created(event jsonb) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare e text := lower(btrim(coalesce(event -> 'user' ->> 'email', '')));
begin
  if e <> '' and (exists (select 1 from chronicle_members where email = e)
                  or exists (select 1 from site_admins where lower(email) = e)
                  or exists (select 1 from storytellers where lower(email) = e)) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object('http_code', 403,
    'message', 'This email has not been invited to a chronicle. Ask your Storyteller.'));
end $$;
revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    execute 'grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin';
  end if;
end $$;


-- ------------------------------------------------------ permissions
revoke execute on function
  public.members_of(text), public.add_member(text, text, text), public.remove_member(text, text),
  public.set_sheet_owner(text, text), public.sheet_owners_of(text), public.save_chronicle(text, text, text, text, text),
  public.save_draft(bigint, text, text, jsonb, jsonb), public.submit_draft(bigint), public.withdraw_draft(bigint),
  public.delete_draft(bigint), public.approve_draft(bigint, text, text), public.reject_draft(bigint, text),
  public.my_chronicles(), public.my_sheets(text), public.is_chronicle_member(text), public.is_chronicle_storyteller(text),
  public.is_world_member(text), public.is_world_storyteller(text), public.is_admin(), public.chronicle_role(text),
  public.sheet_chronicle(text), public.is_sheet_storyteller(text)
  from public, anon;
grant execute on function
  public.members_of(text), public.add_member(text, text, text), public.remove_member(text, text),
  public.set_sheet_owner(text, text), public.sheet_owners_of(text), public.save_chronicle(text, text, text, text, text),
  public.save_draft(bigint, text, text, jsonb, jsonb), public.submit_draft(bigint), public.withdraw_draft(bigint),
  public.delete_draft(bigint), public.approve_draft(bigint, text, text), public.reject_draft(bigint, text),
  public.my_chronicles(), public.my_sheets(text), public.is_chronicle_member(text), public.is_chronicle_storyteller(text),
  public.is_world_member(text), public.is_world_storyteller(text), public.is_admin(), public.chronicle_role(text),
  public.sheet_chronicle(text), public.is_sheet_storyteller(text)
  to authenticated;


-- ------------------------------------------------------- you, the admin
-- Put your own email between the quotes, remove the two dashes at the
-- start of the line, and run it (once is enough):
-- insert into public.site_admins (email) values ('you@example.com') on conflict do nothing;
