-- =====================================================================
-- A Crown of Ice and Bone — character sheets, experience and the rules
-- ---------------------------------------------------------------------
-- Run this whole file in Supabase: SQL Editor -> New query -> Run.
-- Run it AFTER admin/sql/access.sql (who belongs to which chronicle),
-- which in turn comes after the Dead Hand files. Safe to run again.
--
-- Who may do what (enforced here, by the database, not by the pages):
--   * The chronicle's members (players and Storytellers, see the Admin
--     page and the Storyteller page) read its sheets, awards and
--     purchases. Nobody else does.
--   * A player marks damage, blood and Willpower, keeps their own
--     notes, and asks to buy traits with XP. Nothing else.
--   * A purchase only changes the sheet when the chronicle's
--     Storyteller approves it.
--   * The chronicle's Storytellers create sheets, award XP, approve,
--     reject or refund purchases, and edit any sheet.
--   * The Dark Ages rules from Obsidian belong to the world, Hungary
--     1242: every member of a chronicle there may read them, and its
--     Storytellers upload them (from the rules page).
-- =====================================================================


-- ------------------------------------------------------------- tables

-- What things cost, by the Dark Ages rules. A purchase costs new_cost
-- when the trait is new (rating 0), otherwise per_level x the current
-- rating; a Ritual costs per_level x its level. Change a figure here
-- and the sheets follow. A cost left empty cannot be bought.
create table if not exists public.vtda_xp_costs (
  kind       text primary key,
  label      text not null,
  new_cost   integer check (new_cost > 0),
  per_level  integer check (per_level > 0),
  rule       text not null default '',
  sort       integer not null
);
insert into public.vtda_xp_costs (kind, label, new_cost, per_level, rule, sort) values
  ('attribute',       'Attribute',          null, 4, 'Current rating × 4', 1),
  ('ability',         'Ability',            3,    2, 'New: 3 · then current rating × 2', 2),
  ('expertise',       'Area of expertise',  1,    null, '1 per field', 3),
  ('clan_discipline', 'Clan Discipline',    10,   5, 'New: 10 · then current rating × 5', 4),
  ('discipline',      'Other Discipline',   10,   7, 'New: 10 · then current rating × 7', 5),
  ('path',            'Secondary Path',     7,    4, 'New: 7 · then current rating × 4', 6),
  ('ritual',          'Ritual',             null, 2, 'Ritual level × 2', 7),
  ('virtue',          'Virtue',             null, 2, 'Current rating × 2', 8),
  ('road',            'Road',               null, 2, 'Current rating × 2', 9),
  ('willpower',       'Willpower',          null, 1, 'Current rating', 10),
  ('background',      'Background',         null, 2, 'Current rating × 2, at the Storyteller''s discretion', 11)
on conflict (kind) do nothing;

create table if not exists public.vtda_xp_awards (
  id          bigint generated always as identity primary key,
  slug        text not null references public.character_sheets (slug) on delete cascade,
  amount      integer not null check (amount <> 0),
  note        text not null default '',
  awarded_at  timestamptz not null default now()
);

-- Every purchase request, and what became of it.
--   trait:  the Attribute, Ability or Virtue key; the Discipline, Path,
--           Background or Ritual name; the Ability of an expertise.
--   detail: the expertise's field; a new Path's sorcery (Thaumaturgy or
--           Necromancy); a Ritual's level.
create table if not exists public.vtda_xp_requests (
  id            bigint generated always as identity primary key,
  slug          text not null references public.character_sheets (slug) on delete cascade,
  kind          text not null references public.vtda_xp_costs (kind),
  trait         text not null default '',
  detail        text not null default '',
  from_level    integer not null,
  to_level      integer not null,
  cost          integer not null check (cost > 0),
  status        text not null default 'pending'
                  check (status in ('pending', 'approved', 'rejected', 'cancelled', 'refunded')),
  note          text not null default '',
  requested_at  timestamptz not null default now(),
  decided_at    timestamptz
);
create index if not exists vtda_xp_requests_slug on public.vtda_xp_requests (slug, requested_at);

-- The rules wiki: the Dark Ages notes from the Storyteller's Obsidian
-- vault, one row per note, uploaded from the rules page. They belong to
-- a world (Hungary 1242), shared by every chronicle in it.
-- (A first version kept them per chronicle: moved over below.)
do $$ begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'vault_notes' and column_name = 'chronicle') then
    drop policy if exists "Members read the rules" on public.vault_notes;
    alter table public.vault_notes rename column chronicle to world;
    update public.vault_notes set world = 'hungary-1242' where world = 'crown-of-ice-and-bone';
  end if;
end $$;
create table if not exists public.vault_notes (
  world       text not null,
  path        text not null check (path ~ '^[A-Za-z0-9 ._/-]{1,200}$'),
  title       text not null default '',
  body        text not null default '' check (char_length(body) <= 400000),
  updated_at  timestamptz not null default now(),
  primary key (world, path)
);

alter table public.vtda_xp_costs    enable row level security;
alter table public.vtda_xp_awards   enable row level security;
alter table public.vtda_xp_requests enable row level security;
alter table public.vault_notes      enable row level security;

drop policy if exists "Costs are public"     on public.vtda_xp_costs;
drop policy if exists "Awards are public"    on public.vtda_xp_awards;
drop policy if exists "Purchases are public" on public.vtda_xp_requests;
drop policy if exists "Members read awards"    on public.vtda_xp_awards;
drop policy if exists "Members read purchases" on public.vtda_xp_requests;
drop policy if exists "Members read the rules" on public.vault_notes;
create policy "Costs are public"     on public.vtda_xp_costs    for select to anon, authenticated using (true);
create policy "Members read awards"    on public.vtda_xp_awards   for select to authenticated
  using (public.is_chronicle_member(public.sheet_chronicle(slug)));
create policy "Members read purchases" on public.vtda_xp_requests for select to authenticated
  using (public.is_chronicle_member(public.sheet_chronicle(slug)));
-- The rules: members of the world's chronicles only. Visitors who are
-- not signed in cannot even ask.
revoke all on public.vault_notes from anon;
create policy "Members read the rules" on public.vault_notes
  for select to authenticated using (public.is_world_member(world));
-- No table has an insert, update or delete policy: all writes go
-- through the functions below.


-- ------------------------------------------------------------- helpers

-- Is this a Dark Ages sheet? (Dead Hand sheets have Skills, not Abilities.)
create or replace function public.vtda_is_sheet(d jsonb) returns boolean
language sql immutable
as $$ select coalesce(jsonb_typeof(d -> 'attributes') = 'object' and jsonb_typeof(d -> 'abilities') = 'object', false) $$;

-- The highest a trait may go at the sheet's Generation.
create or replace function public.vtda_trait_max(d jsonb) returns integer
language sql immutable
as $$
  select case
    when coalesce((d ->> 'generation')::integer, 12) <= 3 then 10
    when (d ->> 'generation')::integer = 4 then 9
    when (d ->> 'generation')::integer = 5 then 8
    when (d ->> 'generation')::integer = 6 then 7
    when (d ->> 'generation')::integer = 7 then 6
    else 5 end
$$;

create or replace function public.vtda_list_of(p_kind text) returns text
language sql immutable
as $$
  select case p_kind when 'clan_discipline' then 'disciplines' when 'discipline' then 'disciplines'
    when 'path' then 'paths' when 'background' then 'backgrounds' when 'ritual' then 'rituals'
    when 'expertise' then 'expertise' end
$$;

-- A trait's current rating on the sheet; null for an unknown key.
create or replace function public.vtda_level(d jsonb, p_kind text, p_trait text) returns integer
language plpgsql immutable
as $$
declare idx integer;
begin
  if p_kind = 'attribute' then return (d -> 'attributes' ->> p_trait)::integer;
  elsif p_kind = 'ability' then return (d -> 'abilities' ->> p_trait)::integer;
  elsif p_kind = 'virtue' then return (d -> 'virtues' ->> p_trait)::integer;
  elsif p_kind = 'road' then return coalesce((d ->> 'roadRating')::integer, 0);
  elsif p_kind = 'willpower' then return coalesce((d ->> 'willpower')::integer, 0);
  elsif p_kind in ('clan_discipline', 'discipline', 'path', 'background') then
    idx := row_index(d, vtda_list_of(p_kind), p_trait);
    return coalesce((d -> vtda_list_of(p_kind) -> idx ->> 'dots')::integer, 0);
  end if;
  return null;
end $$;

-- The sheet with a trait set to a rating. In the lists, a new name adds
-- a row and a rating of 0 removes it.
create or replace function public.vtda_set_level(d jsonb, p_kind text, p_trait text, p_level integer, p_detail text)
returns jsonb
language plpgsql immutable
as $$
declare idx integer; lst text := vtda_list_of(p_kind); new_row jsonb;
begin
  if p_kind = 'attribute' then return jsonb_set(d, array['attributes', p_trait], to_jsonb(p_level));
  elsif p_kind = 'ability' then return jsonb_set(d, array['abilities', p_trait], to_jsonb(p_level));
  elsif p_kind = 'virtue' then return jsonb_set(d, array['virtues', p_trait], to_jsonb(p_level));
  elsif p_kind = 'road' then return jsonb_set(d, '{roadRating}', to_jsonb(p_level));
  elsif p_kind = 'willpower' then return jsonb_set(d, '{willpower}', to_jsonb(p_level));
  end if;
  idx := row_index(d, lst, p_trait);
  if idx is not null then
    if p_level <= 0 then return jsonb_set(d, array[lst], (d -> lst) - idx); end if;
    return jsonb_set(d, array[lst, idx::text, 'dots'], to_jsonb(p_level));
  end if;
  if p_level <= 0 then return d; end if;
  new_row := case
    when p_kind in ('clan_discipline', 'discipline') then
      jsonb_build_object('name', p_trait, 'dots', p_level, 'clan', p_kind = 'clan_discipline')
    when p_kind = 'path' then
      jsonb_build_object('name', p_trait, 'dots', p_level, 'sorcery', p_detail, 'primary', false)
    else jsonb_build_object('name', p_trait, 'dots', p_level) end;
  return jsonb_set(d, array[lst], coalesce(d -> lst, '[]'::jsonb) || jsonb_build_array(new_row));
end $$;

create or replace function public.vtda_xp_available(p_slug text) returns integer
language sql stable security definer set search_path = public
as $$
  select coalesce((select sum(amount) from vtda_xp_awards where slug = p_slug), 0)
       - coalesce((select sum(cost) from vtda_xp_requests where slug = p_slug and status in ('approved', 'pending')), 0)
$$;


-- --------------------------------------------------------- purchasing

-- A player (or Storyteller) asks to buy one dot or one new thing.
--   attribute / ability / virtue:  p_trait = key, e.g. 'wits', 'hearthwisdom', 'courage'
--   road / willpower:              p_trait = '' (or anything)
--   clan_discipline / discipline:  p_trait = the Discipline's name (a new one is fine)
--   path:                          p_trait = the Path's name; for a new one, p_detail = 'Thaumaturgy' or 'Necromancy'
--   background:                    p_trait = the Background's name
--   ritual:                        p_trait = the Ritual's name, p_detail = its level
--   expertise:                     p_trait = the Ability key, p_detail = the field
-- The level bought, and so the cost, counts purchases still waiting.
create or replace function public.vtda_request_xp(p_slug text, p_kind text, p_trait text, p_detail text default '')
returns void
language plpgsql security definer set search_path = public
as $$
declare
  s        character_sheets;
  c        vtda_xp_costs;
  lvl      integer := 0;
  top      integer;
  to_lvl   integer;
  price    integer;
  avail    integer;
  waiting  integer;
  idx      integer;
  row_clan boolean;
begin
  if not (owns_sheet(p_slug) or is_sheet_storyteller(p_slug)) then
    raise exception 'You can only spend XP on your own sheet.';
  end if;
  select * into s from character_sheets where slug = p_slug for update;
  if not found then raise exception 'There is no such sheet.'; end if;
  if not vtda_is_sheet(s.data) then raise exception 'That is not a Dark Ages sheet.'; end if;
  select * into c from vtda_xp_costs where kind = p_kind;
  if not found then raise exception 'Unknown kind of purchase.'; end if;

  p_trait  := btrim(coalesce(p_trait, ''));
  p_detail := btrim(coalesce(p_detail, ''));
  if char_length(p_trait) > 80 or char_length(p_detail) > 80 then raise exception 'That name is too long.'; end if;
  if p_kind in ('road', 'willpower') then p_trait := p_kind; end if;

  select count(*) into waiting from vtda_xp_requests
   where slug = p_slug and kind = p_kind and lower(trait) = lower(p_trait) and status = 'pending';

  if p_kind in ('attribute', 'ability', 'virtue') then
    lvl := vtda_level(s.data, p_kind, p_trait);
    if lvl is null then raise exception 'Unknown %.', p_kind; end if;
    lvl := lvl + waiting;
    top := case when p_kind = 'virtue' then 5 else vtda_trait_max(s.data) end;

  elsif p_kind in ('road', 'willpower') then
    lvl := vtda_level(s.data, p_kind, p_trait) + waiting;
    top := 10;

  elsif p_kind in ('clan_discipline', 'discipline') then
    if p_trait = '' then raise exception 'Name the Discipline.'; end if;
    idx := row_index(s.data, 'disciplines', p_trait);
    if idx is not null then
      row_clan := coalesce((s.data -> 'disciplines' -> idx ->> 'clan')::boolean, false);
      if row_clan <> (p_kind = 'clan_discipline') then
        raise exception 'On this sheet % is %a clan Discipline.', p_trait, case when row_clan then '' else 'not ' end;
      end if;
    elsif exists (select 1 from vtda_xp_requests where slug = p_slug and kind in ('clan_discipline', 'discipline')
                   and kind <> p_kind and lower(trait) = lower(p_trait) and status = 'pending') then
      raise exception 'That Discipline is already waiting as a different kind.';
    end if;
    lvl := vtda_level(s.data, p_kind, p_trait) + waiting;
    top := vtda_trait_max(s.data);

  elsif p_kind = 'path' then
    if p_trait = '' then raise exception 'Name the Path.'; end if;
    idx := row_index(s.data, 'paths', p_trait);
    if idx is not null and coalesce((s.data -> 'paths' -> idx ->> 'primary')::boolean, false) then
      raise exception 'The primary Path rises with its Discipline: buy a dot of the Discipline instead.';
    end if;
    if idx is null and waiting = 0 and p_detail not in ('Thaumaturgy', 'Necromancy') then
      raise exception 'Say whether the new Path is Thaumaturgy or Necromancy.';
    end if;
    lvl := vtda_level(s.data, p_kind, p_trait) + waiting;
    top := 5;

  elsif p_kind = 'background' then
    if p_trait = '' then raise exception 'Name the Background.'; end if;
    lvl := vtda_level(s.data, p_kind, p_trait) + waiting;
    top := 5;

  elsif p_kind = 'ritual' then
    if p_trait = '' then raise exception 'Name the Ritual.'; end if;
    if p_detail !~ '^([1-9]|10)$' then raise exception 'Give the Ritual''s level, 1 to 10.'; end if;
    if row_index(s.data, 'rituals', p_trait) is not null or waiting > 0 then
      raise exception 'That Ritual is already on the sheet or waiting.';
    end if;

  elsif p_kind = 'expertise' then
    if (s.data -> 'abilities' ->> p_trait) is null then raise exception 'Unknown Ability.'; end if;
    if (s.data -> 'abilities' ->> p_trait)::integer < 1 then
      raise exception 'An area of expertise needs at least one dot in its Ability.';
    end if;
    if p_detail = '' then raise exception 'Name the field.'; end if;
    if exists (select 1 from jsonb_array_elements(coalesce(s.data -> 'expertise', '[]')) e(v)
               where e.v ->> 'ability' = p_trait and lower(e.v ->> 'name') = lower(p_detail))
       or exists (select 1 from vtda_xp_requests where slug = p_slug and kind = 'expertise' and status = 'pending'
                  and trait = p_trait and lower(detail) = lower(p_detail)) then
      raise exception 'That field is already on the sheet or waiting.';
    end if;
  end if;

  if top is not null and lvl >= top then raise exception 'That is already at %, the most this Cainite can reach.', top; end if;

  if p_kind = 'ritual' then
    to_lvl := p_detail::integer; lvl := 0;
    price := c.per_level * to_lvl;
  elsif p_kind = 'expertise' then
    to_lvl := 1; lvl := 0;
    price := c.new_cost;
  else
    to_lvl := lvl + 1;
    price := case when lvl = 0 then c.new_cost else c.per_level * lvl end;
  end if;
  if price is null then
    raise exception 'That cannot be bought with XP unless the Storyteller sets a cost for it.';
  end if;

  avail := vtda_xp_available(p_slug);
  if price > avail then
    raise exception 'Not enough XP: this costs %, and % is available.', price, avail;
  end if;

  insert into vtda_xp_requests (slug, kind, trait, detail, from_level, to_level, cost)
  values (p_slug, p_kind, p_trait, p_detail, lvl, to_lvl, price);
end $$;


-- Withdraw (player) or turn down (Storyteller) a waiting purchase.
-- Later purchases of the same trait depend on it, so they go too.
create or replace function public.vtda_close_xp_request(p_id bigint, p_note text default '')
returns void
language plpgsql security definer set search_path = public
as $$
declare r vtda_xp_requests; new_status text;
begin
  select * into r from vtda_xp_requests where id = p_id for update;
  if not found or r.status <> 'pending' then raise exception 'That purchase is no longer waiting.'; end if;
  if is_sheet_storyteller(r.slug) then new_status := 'rejected';
  elsif owns_sheet(r.slug) then new_status := 'cancelled';
  else raise exception 'Only the player or a Storyteller can do that.';
  end if;
  update vtda_xp_requests
     set status = new_status, decided_at = now(), note = left(coalesce(p_note, ''), 300)
   where status = 'pending' and slug = r.slug and kind = r.kind and lower(trait) = lower(r.trait)
     and (id = r.id or (r.kind not in ('ritual', 'expertise') and to_level > r.to_level));
end $$;


-- Storyteller: approve a purchase and write it onto the sheet.
create or replace function public.vtda_approve_xp_request(p_id bigint, p_note text default '')
returns void
language plpgsql security definer set search_path = public
as $$
declare
  r        vtda_xp_requests;
  d        jsonb;
  cur      integer;
  awarded  integer;
  spent    integer;
begin
  select * into r from vtda_xp_requests where id = p_id for update;
  if not found or r.status <> 'pending' then raise exception 'That purchase is no longer waiting.'; end if;
  if not is_sheet_storyteller(r.slug) then raise exception 'Only the chronicle''s Storyteller can approve purchases.'; end if;
  select data into d from character_sheets where slug = r.slug for update;

  select coalesce(sum(amount), 0) into awarded from vtda_xp_awards where slug = r.slug;
  select coalesce(sum(cost), 0) into spent from vtda_xp_requests where slug = r.slug and status = 'approved';
  if spent + r.cost > awarded then
    raise exception 'Not enough XP left for this: % awarded, % already spent.', awarded, spent;
  end if;

  if r.kind = 'ritual' then
    if row_index(d, 'rituals', r.trait) is not null then raise exception 'The Ritual % is already on the sheet.', r.trait; end if;
    d := jsonb_set(d, '{rituals}', coalesce(d -> 'rituals', '[]')
           || jsonb_build_array(jsonb_build_object('name', r.trait, 'level', r.to_level)));
  elsif r.kind = 'expertise' then
    d := jsonb_set(d, '{expertise}', coalesce(d -> 'expertise', '[]')
           || jsonb_build_array(jsonb_build_object('ability', r.trait, 'name', r.detail)));
  else
    cur := vtda_level(d, r.kind, r.trait);
    if cur is distinct from r.from_level then
      raise exception 'The sheet shows % at %, not %. Approve the earlier purchase first, or reject this one.',
        r.trait, coalesce(cur, 0), r.from_level;
    end if;
    d := vtda_set_level(d, r.kind, r.trait, r.to_level, r.detail);
  end if;

  update character_sheets set data = d, updated_at = now() where slug = r.slug;
  update vtda_xp_requests set status = 'approved', decided_at = now(), note = left(coalesce(p_note, ''), 300)
   where id = r.id;
end $$;


-- Storyteller: undo an approved purchase and give the XP back.
-- Only while the sheet still shows exactly what it bought.
create or replace function public.vtda_refund_xp_request(p_id bigint, p_note text default '')
returns void
language plpgsql security definer set search_path = public
as $$
declare r vtda_xp_requests; d jsonb; cur integer; lst text;
begin
  select * into r from vtda_xp_requests where id = p_id for update;
  if not found or r.status <> 'approved' then raise exception 'Only an approved purchase can be refunded.'; end if;
  if not is_sheet_storyteller(r.slug) then raise exception 'Only the chronicle''s Storyteller can refund purchases.'; end if;
  select data into d from character_sheets where slug = r.slug for update;

  if r.kind in ('ritual', 'expertise') then
    lst := vtda_list_of(r.kind);
    d := jsonb_set(d, array[lst], coalesce((
           select jsonb_agg(e.v order by e.ord) from jsonb_array_elements(coalesce(d -> lst, '[]')) with ordinality e(v, ord)
            where not (case when r.kind = 'ritual' then lower(btrim(e.v ->> 'name')) = lower(btrim(r.trait))
                            else e.v ->> 'ability' = r.trait and lower(e.v ->> 'name') = lower(r.detail) end)), '[]'));
  else
    cur := vtda_level(d, r.kind, r.trait);
    if cur is distinct from r.to_level then
      raise exception 'The sheet now shows % at %. Refund later purchases first, or change it by hand.', r.trait, coalesce(cur, 0);
    end if;
    d := vtda_set_level(d, r.kind, r.trait, r.from_level, r.detail);
  end if;

  update character_sheets set data = d, updated_at = now() where slug = r.slug;
  update vtda_xp_requests set status = 'refunded', decided_at = now(), note = left(coalesce(p_note, ''), 300)
   where id = r.id;
end $$;


-- ---------------------------------------------------- awarding XP

create or replace function public.vtda_award_xp(p_slug text, p_amount integer, p_note text default '')
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_sheet_storyteller(p_slug) then raise exception 'Only the chronicle''s Storyteller can award XP.'; end if;
  if not exists (select 1 from character_sheets where slug = p_slug and vtda_is_sheet(data)) then
    raise exception 'There is no such sheet.';
  end if;
  if coalesce(p_amount, 0) = 0 then raise exception 'Award a number of XP other than zero.'; end if;
  if vtda_xp_available(p_slug) + p_amount < 0 then
    raise exception 'That would leave less XP than has already been spent or requested.';
  end if;
  insert into vtda_xp_awards (slug, amount, note) values (p_slug, p_amount, left(coalesce(p_note, ''), 200));
end $$;

create or replace function public.vtda_delete_xp_award(p_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare a vtda_xp_awards;
begin
  select * into a from vtda_xp_awards where id = p_id for update;
  if not found then raise exception 'That award is already gone.'; end if;
  if not is_sheet_storyteller(a.slug) then raise exception 'Only the chronicle''s Storyteller can remove an award.'; end if;
  if vtda_xp_available(a.slug) - a.amount < 0 then
    raise exception 'Removing it would leave less XP than has already been spent or requested.';
  end if;
  delete from vtda_xp_awards where id = p_id;
end $$;


-- ------------------------------------------------- sheets and players
-- (Damage, blood, notes and the like save through save_play() from the
-- Dead Hand setup: it already lets the player and Storytellers only.)

-- Storyteller: change anything on a Dark Ages sheet directly.
create or replace function public.vtda_save_sheet(p_slug text, p_data jsonb, p_play jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_sheet_storyteller(p_slug) then raise exception 'Only the chronicle''s Storyteller can edit the whole sheet.'; end if;
  if jsonb_typeof(p_data) <> 'object' or not vtda_is_sheet(p_data) or jsonb_typeof(p_play) <> 'object'
     or octet_length(p_data::text) + octet_length(p_play::text) > 200000 then
    raise exception 'That sheet could not be saved.';
  end if;
  update character_sheets
     set data = p_data, play = p_play, name = coalesce(nullif(btrim(p_data ->> 'name'), ''), name), updated_at = now()
   where slug = p_slug and vtda_is_sheet(data);
  if not found then raise exception 'There is no such sheet.'; end if;
end $$;

-- Storyteller: a new, blank Dark Ages sheet in a chronicle.
create or replace function public.vtda_create_sheet(p_slug text, p_chronicle text, p_name text)
returns void
language plpgsql security definer set search_path = public
as $$
declare d jsonb;
begin
  if not exists (select 1 from chronicles where id = p_chronicle and game = 'vampire') then raise exception 'Unknown chronicle.'; end if;
  if not is_chronicle_storyteller(p_chronicle) then raise exception 'Only the chronicle''s Storyteller can create sheets.'; end if;
  if coalesce(p_slug, '') !~ '^[a-z0-9-]{1,40}$' then raise exception 'The short name may use a-z, 0-9 and dashes only.'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 120 then raise exception 'Give the character a name.'; end if;
  if exists (select 1 from character_sheets where slug = p_slug) then raise exception 'That short name is already taken.'; end if;
  d := jsonb_build_object(
    'name', btrim(p_name), 'generation', 12, 'willpower', 1, 'roadRating', 2,
    'attributes', (select jsonb_object_agg(k, 1) from unnest(array['strength', 'dexterity', 'stamina', 'charisma',
                    'manipulation', 'appearance', 'perception', 'intelligence', 'wits']) k),
    'abilities', (select jsonb_object_agg(k, 0) from unnest(array['alertness', 'athletics', 'awareness', 'brawl', 'empathy',
                    'expression', 'intimidation', 'leadership', 'legerdemain', 'subterfuge', 'animalken', 'archery',
                    'commerce', 'crafts', 'etiquette', 'melee', 'performance', 'ride', 'stealth', 'survival',
                    'academics', 'enigmas', 'hearthwisdom', 'investigation', 'law', 'medicine', 'occult',
                    'politics', 'seneschal', 'theology']) k),
    'virtues', jsonb_build_object('conscience', 1, 'conviction', 1, 'selfcontrol', 1, 'instinct', 1, 'courage', 1),
    'disciplines', '[]'::jsonb, 'paths', '[]'::jsonb, 'rituals', '[]'::jsonb, 'backgrounds', '[]'::jsonb,
    'expertise', '[]'::jsonb, 'meritsFlaws', '[]'::jsonb);
  insert into character_sheets (slug, chronicle, name, data, play) values (p_slug, p_chronicle, btrim(p_name), d, '{}'::jsonb);
end $$;

-- Storyteller: delete a Dark Ages sheet, with its XP and purchases.
create or replace function public.vtda_delete_sheet(p_slug text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_sheet_storyteller(p_slug) then raise exception 'Only the chronicle''s Storyteller can delete sheets.'; end if;
  delete from character_sheets where slug = p_slug and vtda_is_sheet(data);
  if not found then raise exception 'There is no such Dark Ages sheet.'; end if;
end $$;

-- -------------------------------------------------------- the rules

-- A world's Storyteller: upload notes from the vault, a batch at a time.
-- p_notes: [{"path": "concepts/abilities", "title": "Abilities", "body": "..."}]
drop function if exists public.vault_sync_notes(text, jsonb);
drop function if exists public.vault_prune_notes(text, text[]);
create or replace function public.vault_sync_notes(p_world text, p_notes jsonb)
returns integer
language plpgsql security definer set search_path = public
as $$
declare n integer;
begin
  if not is_world_storyteller(p_world) then raise exception 'Only a Storyteller of this world can upload the rules.'; end if;
  if jsonb_typeof(p_notes) <> 'array' then raise exception 'Nothing to upload.'; end if;
  insert into vault_notes (world, path, title, body, updated_at)
  select p_world, x ->> 'path', left(coalesce(x ->> 'title', ''), 200), coalesce(x ->> 'body', ''), now()
    from jsonb_array_elements(p_notes) x
  on conflict (world, path) do update set title = excluded.title, body = excluded.body, updated_at = now();
  get diagnostics n = row_count;
  return n;
end $$;

-- A world's Storyteller: after an upload, remove the notes no longer in the vault.
create or replace function public.vault_prune_notes(p_world text, p_keep text[])
returns integer
language plpgsql security definer set search_path = public
as $$
declare n integer;
begin
  if not is_world_storyteller(p_world) then raise exception 'Only a Storyteller of this world can change the rules.'; end if;
  delete from vault_notes where world = p_world and not (path = any (coalesce(p_keep, '{}')));
  get diagnostics n = row_count;
  return n;
end $$;


-- ------------------------------------------------------ permissions

revoke execute on function
  public.vtda_request_xp(text, text, text, text), public.vtda_close_xp_request(bigint, text),
  public.vtda_approve_xp_request(bigint, text), public.vtda_refund_xp_request(bigint, text),
  public.vtda_award_xp(text, integer, text), public.vtda_delete_xp_award(bigint),
  public.vtda_save_sheet(text, jsonb, jsonb), public.vtda_create_sheet(text, text, text),
  public.vtda_delete_sheet(text),
  public.vault_sync_notes(text, jsonb), public.vault_prune_notes(text, text[])
  from public, anon;
grant execute on function
  public.vtda_request_xp(text, text, text, text), public.vtda_close_xp_request(bigint, text),
  public.vtda_approve_xp_request(bigint, text), public.vtda_refund_xp_request(bigint, text),
  public.vtda_award_xp(text, integer, text), public.vtda_delete_xp_award(bigint),
  public.vtda_save_sheet(text, jsonb, jsonb), public.vtda_create_sheet(text, text, text),
  public.vtda_delete_sheet(text),
  public.vault_sync_notes(text, jsonb), public.vault_prune_notes(text, text[])
  to authenticated;
