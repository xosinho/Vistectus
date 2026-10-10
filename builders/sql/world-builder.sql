-- =====================================================================
-- VisTectus — the World Builder: worlds, factions and chronicle content
-- ---------------------------------------------------------------------
-- Run this whole file in Supabase: SQL Editor -> New query -> Run.
-- Run it LAST: after the Dead Hand files, admin/sql/access.sql, the
-- Vampire setup.sql and dnd/sql/setup.sql. Safe to run again.
--
-- What it adds:
--   * builders: who may start a new world (you add them on the Admin
--     page). Being added is also their invitation to sign in.
--   * worlds: every world, with its game, name, pitch, pictures and the
--     player options it allows. A new world stays private to its
--     builder until a site admin approves it. The four worlds that
--     already exist as site files are listed too (static_path).
--   * world_factions: a world's factions, in the site's faction format.
--   * chronicles get a status, tagline, premise and card picture: new
--     ones also wait for approval.
--   * chronicle_items: NPCs, adventurers' cards, handouts, maps and
--     reference links a Storyteller/DM adds from the site as play goes
--     on. The chronicle's pages show them beside what is in the files.
--   * world-media: a public storage bucket for their pictures and files
--     (the pages that show them are members-only, as with the files in
--     the repository, but a file can be opened by anyone with its link).
-- =====================================================================


-- ------------------------------------------------------------- tables

create table if not exists public.builders (
  email     text primary key check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  added_at  timestamptz not null default now()
);

create table if not exists public.worlds (
  id           text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$'),
  game         text not null check (game in ('hunter', 'vampire', 'dnd')),
  name         text not null check (char_length(name) between 1 and 120),
  tagline      text not null default '' check (char_length(tagline) <= 300),
  overview     text not null default '' check (char_length(overview) <= 20000),
  card_image   text not null default '',
  hero_image   text not null default '',
  options      jsonb not null default '{}'::jsonb check (jsonb_typeof(options) = 'object'),
  status       text not null default 'draft' check (status in ('draft', 'pending', 'approved', 'rejected')),
  review_note  text not null default '',
  static_path  text,                      -- the four worlds that are site files
  created_by   text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
insert into public.worlds (id, game, name, status, static_path) values
  ('brooklyn', 'hunter', 'Brooklyn Chronicles', 'approved', 'htr/brooklyn/'),
  ('hungary-1242', 'vampire', 'Hungary 1242', 'approved', 'vtda/hungary-1242/'),
  ('shrouded', 'dnd', 'Shrouded', 'approved', 'dnd/shrouded/'),
  ('the-last-garden', 'dnd', 'The Last Garden', 'approved', 'dnd/the-last-garden/')
on conflict (id) do nothing;

create table if not exists public.world_factions (
  id          uuid primary key default gen_random_uuid(),
  world       text not null references public.worlds (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  chip        text not null default '' check (char_length(chip) <= 80),     -- a few words: "The patient rival"
  epithet     text not null default '' check (char_length(epithet) <= 600), -- one sentence
  goals       text[] not null default '{}',
  figures     jsonb not null default '[]'::jsonb check (jsonb_typeof(figures) = 'array'),  -- [{name, note}]
  prose       text not null default '' check (char_length(prose) <= 12000),
  image       text not null default '',                                        -- world-media path, 3:4
  sort        integer not null default 0,
  created_by  text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists world_factions_world on public.world_factions (world, sort);

alter table public.chronicles add column if not exists status text not null default 'approved';
alter table public.chronicles drop constraint if exists chronicles_status_check;
alter table public.chronicles add constraint chronicles_status_check check (status in ('draft', 'pending', 'approved', 'rejected'));
alter table public.chronicles add column if not exists tagline text not null default '';
alter table public.chronicles add column if not exists premise text not null default '';
alter table public.chronicles add column if not exists card_image text not null default '';
alter table public.chronicles add column if not exists created_by text not null default '';

create table if not exists public.chronicle_items (
  id          uuid primary key default gen_random_uuid(),
  chronicle   text not null references public.chronicles (id) on delete cascade,
  kind        text not null check (kind in ('player', 'npc', 'document', 'map', 'resource')),
  data        jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) < 100000),
  sort        integer not null default 0,
  created_by  text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists chronicle_items_chronicle on public.chronicle_items (chronicle, kind, sort);


-- ------------------------------------------------------------ helpers

create or replace function public.is_builder() returns boolean
language sql stable security definer set search_path = public
as $$ select is_admin() or exists (select 1 from builders where email = my_email() and my_email() <> '') $$;

-- May the signed-in account change this world (its page, factions,
-- pictures)? A site admin; the builder who made it; a Storyteller/DM of
-- one of its chronicles.
create or replace function public.is_world_editor(p_world text) returns boolean
language sql stable security definer set search_path = public
as $$
  select my_email() <> '' and (is_admin()
    or exists (select 1 from worlds where id = p_world and created_by = my_email())
    or is_world_storyteller(p_world))
$$;

create or replace function public.world_visible(p_world text) returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from worlds where id = p_world and status = 'approved') or is_world_editor(p_world) $$;

create or replace function public.world_path(p_game text) returns text
language sql immutable
as $$ select case p_game when 'hunter' then 'htr' when 'vampire' then 'vtda' else 'dnd' end $$;


-- -------------------------------------------------------------- rules

alter table public.builders        enable row level security;
alter table public.worlds          enable row level security;
alter table public.world_factions  enable row level security;
alter table public.chronicle_items enable row level security;

-- builders: private (read through functions only).

drop policy if exists "Approved worlds are public" on public.worlds;
drop policy if exists "Editors see their worlds"   on public.worlds;
create policy "Approved worlds are public" on public.worlds for select to anon using (status = 'approved');
create policy "Editors see their worlds"   on public.worlds for select to authenticated
  using (status = 'approved' or is_world_editor(id));
-- Worlds change only through the functions below.

drop policy if exists "Factions of visible worlds" on public.world_factions;
drop policy if exists "Editors add factions"       on public.world_factions;
drop policy if exists "Editors change factions"    on public.world_factions;
drop policy if exists "Editors remove factions"    on public.world_factions;
create policy "Factions of visible worlds" on public.world_factions for select to anon, authenticated
  using (world_visible(world));
create policy "Editors add factions"    on public.world_factions for insert to authenticated with check (is_world_editor(world));
create policy "Editors change factions" on public.world_factions for update to authenticated
  using (is_world_editor(world)) with check (is_world_editor(world));
create policy "Editors remove factions" on public.world_factions for delete to authenticated using (is_world_editor(world));

-- Chronicles: approved ones are public; a draft or pending one only
-- for its builder, its members and site admins.
drop policy if exists "Chronicles are public"           on public.chronicles;
drop policy if exists "Approved chronicles are public"  on public.chronicles;
drop policy if exists "Members see their chronicles"    on public.chronicles;
create policy "Approved chronicles are public" on public.chronicles for select to anon using (status = 'approved');
create policy "Members see their chronicles"   on public.chronicles for select to authenticated
  using (status = 'approved' or is_admin() or (created_by <> '' and created_by = my_email()) or chronicle_role(id) is not null);

drop policy if exists "Members read the content"      on public.chronicle_items;
drop policy if exists "Storytellers add content"      on public.chronicle_items;
drop policy if exists "Storytellers change content"   on public.chronicle_items;
drop policy if exists "Storytellers remove content"   on public.chronicle_items;
create policy "Members read the content"    on public.chronicle_items for select to authenticated using (is_chronicle_member(chronicle));
create policy "Storytellers add content"    on public.chronicle_items for insert to authenticated with check (is_chronicle_storyteller(chronicle));
create policy "Storytellers change content" on public.chronicle_items for update to authenticated
  using (is_chronicle_storyteller(chronicle)) with check (is_chronicle_storyteller(chronicle));
create policy "Storytellers remove content" on public.chronicle_items for delete to authenticated using (is_chronicle_storyteller(chronicle));

-- Pictures and files: public to read (by link); a world's editors put
-- them under '<world>/...'.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('world-media', 'world-media', true, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'text/plain', 'text/markdown'])
on conflict (id) do nothing;
drop policy if exists "World editors add media"    on storage.objects;
drop policy if exists "World editors remove media" on storage.objects;
create policy "World editors add media" on storage.objects for insert to authenticated
  with check (bucket_id = 'world-media' and public.is_world_editor(split_part(name, '/', 1)));
create policy "World editors remove media" on storage.objects for delete to authenticated
  using (bucket_id = 'world-media' and public.is_world_editor(split_part(name, '/', 1)));


-- ------------------------------------------------- building a world

-- A builder starts a world, or its editor changes it. The game cannot
-- change once chosen. p_options: the player options it allows, e.g.
-- {"creeds": ["Martial", ...]}, {"clans": [...]}, {"species": [...],
-- "classes": [...]}; a missing key means "all".
create or replace function public.builder_save_world(p_id text, p_game text, p_name text, p_tagline text,
  p_overview text, p_card_image text, p_hero_image text, p_options jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare w worlds;
begin
  if my_email() = '' then raise exception 'Sign in first.'; end if;
  p_id := lower(btrim(coalesce(p_id, '')));
  select * into w from worlds where id = p_id for update;
  if not found then
    if not is_builder() then raise exception 'Only invited builders can start a world. Ask the site''s admin.'; end if;
    if p_id !~ '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$' then raise exception 'The short name may use a-z, 0-9 and dashes (3 to 60 characters).'; end if;
    if p_id in ('assets', 'art', 'admin', 'builders', 'index', 'world', 'worlds', 'template', 'rules', 'factions', 'options') or p_id like '\_%' then
      raise exception 'That short name is reserved; choose another.';
    end if;
    if p_game not in ('hunter', 'vampire', 'dnd') then raise exception 'Choose Hunter, Vampire or D&D.'; end if;
    if (select count(*) from worlds where created_by = my_email() and status in ('draft', 'pending', 'rejected')) >= 5 and not is_admin() then
      raise exception 'You already have five worlds in the making. Finish or delete one first.';
    end if;
    insert into worlds (id, game, name, tagline, overview, card_image, hero_image, options, status, created_by)
    values (p_id, p_game, left(btrim(coalesce(p_name, '')), 120), left(coalesce(p_tagline, ''), 300), left(coalesce(p_overview, ''), 20000),
            coalesce(p_card_image, ''), coalesce(p_hero_image, ''), coalesce(p_options, '{}'::jsonb), 'draft', my_email());
    return;
  end if;
  if not is_world_editor(p_id) then raise exception 'That short name is taken; choose another.'; end if;
  update worlds set name = coalesce(nullif(left(btrim(coalesce(p_name, '')), 120), ''), name), tagline = left(coalesce(p_tagline, ''), 300),
         overview = left(coalesce(p_overview, ''), 20000), card_image = coalesce(p_card_image, ''), hero_image = coalesce(p_hero_image, ''),
         options = coalesce(p_options, '{}'::jsonb), updated_at = now(),
         status = case when status = 'rejected' then 'draft' else status end
   where id = p_id;
end $$;

-- A chronicle (D&D: campaign) in a world the account may edit. Its
-- maker becomes its Storyteller/DM straight away; others see it once
-- it is approved (with its world, or on its own in an approved world).
create or replace function public.builder_save_chronicle(p_world text, p_id text, p_name text, p_tagline text,
  p_premise text, p_card_image text)
returns void
language plpgsql security definer set search_path = public
as $$
declare w worlds; c chronicles;
begin
  select * into w from worlds where id = p_world;
  if not found then raise exception 'There is no such world.'; end if;
  if not is_world_editor(p_world) then raise exception 'You cannot add chronicles to this world.'; end if;
  p_id := lower(btrim(coalesce(p_id, '')));
  select * into c from chronicles where id = p_id for update;
  if not found then
    if p_id !~ '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$' then raise exception 'The short name may use a-z, 0-9 and dashes (3 to 60 characters).'; end if;
    if p_id in ('assets', 'art', 'factions', 'options', 'rules', 'index', 'locations') or p_id like '\_%' then raise exception 'That short name is reserved.'; end if;
    insert into chronicles (id, name, game, world, path, status, tagline, premise, card_image, created_by)
    values (p_id, left(btrim(coalesce(p_name, '')), 120), w.game, p_world, world_path(w.game) || '/' || p_world || '/' || p_id || '/',
            case when is_admin() and w.status = 'approved' then 'approved' else 'draft' end,
            left(coalesce(p_tagline, ''), 300), left(coalesce(p_premise, ''), 20000), coalesce(p_card_image, ''), my_email());
    insert into chronicle_members (chronicle, email, role, added_by) values (p_id, my_email(), 'storyteller', my_email())
      on conflict (chronicle, email) do update set role = 'storyteller';
    if w.game = 'dnd' then
      execute 'insert into campaign_settings (chronicle) values ($1) on conflict do nothing' using p_id;
    end if;
    return;
  end if;
  if c.world <> p_world then raise exception 'That short name is taken; choose another.'; end if;
  if not is_chronicle_storyteller(p_id) then raise exception 'Only the chronicle''s Storyteller can change it.'; end if;
  update chronicles set name = coalesce(nullif(left(btrim(coalesce(p_name, '')), 120), ''), name), tagline = left(coalesce(p_tagline, ''), 300),
         premise = left(coalesce(p_premise, ''), 20000), card_image = coalesce(p_card_image, ''),
         status = case when status = 'rejected' then 'draft' else status end
   where id = p_id;
end $$;

-- The builder sends a world (with its chronicles) or a chronicle in an
-- approved world to the site's admins.
create or replace function public.builder_submit(p_world text, p_chronicle text default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_world_editor(p_world) then raise exception 'That is not your world.'; end if;
  if p_chronicle is null then
    update worlds set status = 'pending', updated_at = now() where id = p_world and status in ('draft', 'rejected');
    update chronicles set status = 'pending' where world = p_world and status in ('draft', 'rejected');
  else
    if not is_chronicle_storyteller(p_chronicle) then raise exception 'That is not your chronicle.'; end if;
    update chronicles set status = 'pending' where id = p_chronicle and world = p_world and status in ('draft', 'rejected');
  end if;
end $$;

-- Site admin: approve or send back a world (and its waiting
-- chronicles), or a single chronicle.
create or replace function public.admin_review(p_world text, p_chronicle text, p_approve boolean, p_note text default '')
returns void
language plpgsql security definer set search_path = public
as $$
declare st text := case when p_approve then 'approved' else 'rejected' end;
begin
  if not is_admin() then raise exception 'Only a site admin can approve worlds.'; end if;
  if p_chronicle is null then
    update worlds set status = st, review_note = left(coalesce(p_note, ''), 2000), updated_at = now() where id = p_world and static_path is null;
    if not found then raise exception 'There is no such world to review.'; end if;
    update chronicles set status = st where world = p_world and status = 'pending';
  else
    update chronicles set status = st where id = p_chronicle and world = p_world;
    if not found then raise exception 'There is no such chronicle.'; end if;
    update worlds set review_note = left(coalesce(p_note, ''), 2000) where id = p_world and not p_approve;
  end if;
end $$;

-- Delete a world still in the making (or any, for a site admin).
create or replace function public.builder_delete_world(p_world text)
returns void
language plpgsql security definer set search_path = public
as $$
declare w worlds;
begin
  select * into w from worlds where id = p_world for update;
  if not found then raise exception 'There is no such world.'; end if;
  if w.static_path is not null then raise exception 'This world is part of the site''s files; it cannot be deleted here.'; end if;
  if not (is_admin() or (w.created_by = my_email() and w.status <> 'approved')) then
    raise exception 'Only a site admin can delete an approved world.';
  end if;
  delete from chronicles where world = p_world and status <> 'approved' or (world = p_world and is_admin());
  delete from worlds where id = p_world;
end $$;

-- Site admin: the builders.
create or replace function public.admin_set_builder(p_email text, p_add boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'Only a site admin can do that.'; end if;
  p_email := lower(btrim(coalesce(p_email, '')));
  if p_add then
    if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'That is not an email address.'; end if;
    insert into builders (email) values (p_email) on conflict do nothing;
  else
    delete from builders where email = p_email;
  end if;
end $$;

create or replace function public.admin_builders()
returns table (email text, added_at timestamptz, worlds integer)
language sql stable security definer set search_path = public
as $$
  select b.email, b.added_at, (select count(*)::integer from worlds w where w.created_by = b.email)
    from builders b where is_admin() order by b.email
$$;


-- ------------------------------------------------- the sign-up check
-- (admin/sql/access.sql) — builders may create their account too.
create or replace function public.hook_before_user_created(event jsonb) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare e text := lower(btrim(coalesce(event -> 'user' ->> 'email', '')));
begin
  if e <> '' and (exists (select 1 from chronicle_members where email = e)
                  or exists (select 1 from site_admins where lower(email) = e)
                  or exists (select 1 from builders where email = e)
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
  public.builder_save_world(text, text, text, text, text, text, text, jsonb),
  public.builder_save_chronicle(text, text, text, text, text, text),
  public.builder_submit(text, text), public.admin_review(text, text, boolean, text),
  public.builder_delete_world(text), public.admin_set_builder(text, boolean), public.admin_builders()
  from public, anon;
grant execute on function
  public.builder_save_world(text, text, text, text, text, text, text, jsonb),
  public.builder_save_chronicle(text, text, text, text, text, text),
  public.builder_submit(text, text), public.admin_review(text, text, boolean, text),
  public.builder_delete_world(text), public.admin_set_builder(text, boolean), public.admin_builders(),
  public.is_builder()
  to authenticated;
-- Used inside the row rules, which anonymous visitors also go through.
grant execute on function public.world_visible(text), public.is_world_editor(text) to anon, authenticated;
