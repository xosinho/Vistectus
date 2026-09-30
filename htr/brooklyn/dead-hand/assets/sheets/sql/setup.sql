-- =====================================================================
-- Character sheets and experience — one-time setup
-- ---------------------------------------------------------------------
-- Run this whole file once in Supabase: SQL Editor -> New query.
-- Then run seed.sql, which loads the hunters' current sheets.
--
-- Who may do what (enforced here, by the database, not by the page):
--   * Anyone can read the sheets, the XP costs, awards and purchases.
--   * A player can mark damage and edit their own notes, equipment and
--     the like, and ask to buy dots with XP. Nothing else.
--   * A purchase only changes the sheet when a Storyteller approves it.
--   * Storytellers award XP, approve, reject or refund purchases, and
--     can edit any sheet directly.
-- Every change goes through the functions below; nobody, signed in or
-- not, can write to the tables directly.
-- =====================================================================


-- ---------------------------------------------------------------- tables

-- One row per character. `data` is the rule-bound part of the sheet
-- (dots, Edges, Advantages...). `play` is what the player keeps up to
-- date themselves (damage, notes, equipment...).
create table public.character_sheets (
  slug        text primary key,
  chronicle   text not null,
  name        text not null,
  data        jsonb not null check (jsonb_typeof(data) = 'object'),
  play        jsonb not null default '{}'::jsonb check (jsonb_typeof(play) = 'object'),
  updated_at  timestamptz not null default now()
);

-- Which account plays which character. Private: never readable from
-- the site, so players' email addresses stay out of public view.
create table public.sheet_owners (
  slug   text primary key references public.character_sheets (slug) on delete cascade,
  email  text not null
);

-- Who counts as a Storyteller. Private for the same reason.
create table public.storytellers (
  email  text primary key
);

-- What things cost. per_level: cost x the new level (Attributes,
-- Skills); otherwise a flat cost per purchase. A cost left empty
-- (null) cannot be bought until it is filled in.
create table public.xp_costs (
  kind       text primary key,
  label      text not null,
  cost       integer check (cost > 0),
  per_level  boolean not null default false,
  sort       integer not null
);

insert into public.xp_costs (kind, label, cost, per_level, sort) values
  ('attribute', 'Attribute',       5,    true,  1),
  ('skill',     'Skill',           3,    true,  2),
  ('specialty', 'Specialty',       3,    false, 3),
  ('advantage', 'Advantage (per dot)', 3, false, 4),
  ('edge',      'Edge',            7,    false, 5),
  ('perk',      'Perk',            3,    false, 6);

-- XP given out by the Storyteller. A character's total is the sum.
create table public.xp_awards (
  id          bigint generated always as identity primary key,
  slug        text not null references public.character_sheets (slug) on delete cascade,
  amount      integer not null check (amount <> 0),
  note        text not null default '',
  awarded_at  timestamptz not null default now()
);

-- Every purchase request, and what became of it.
--   trait:  the Attribute or Skill key, the Advantage's name, the
--           skill of a Specialty, the Edge a Perk belongs to, or the
--           new Edge's name.
--   detail: the new Specialty's or Perk's name.
create table public.xp_requests (
  id            bigint generated always as identity primary key,
  slug          text not null references public.character_sheets (slug) on delete cascade,
  kind          text not null references public.xp_costs (kind),
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
create index xp_requests_slug on public.xp_requests (slug, requested_at);


-- ------------------------------------------------------ reading is open

alter table public.character_sheets enable row level security;
alter table public.sheet_owners     enable row level security;
alter table public.storytellers     enable row level security;
alter table public.xp_costs         enable row level security;
alter table public.xp_awards        enable row level security;
alter table public.xp_requests      enable row level security;

create policy "Sheets are public"    on public.character_sheets for select to anon, authenticated using (true);
create policy "Costs are public"     on public.xp_costs         for select to anon, authenticated using (true);
create policy "Awards are public"    on public.xp_awards        for select to anon, authenticated using (true);
create policy "Purchases are public" on public.xp_requests      for select to anon, authenticated using (true);
-- sheet_owners and storytellers have no policies at all: unreadable.
-- No table has an insert, update or delete policy: all writes go
-- through the functions below.


-- ------------------------------------------------------------- helpers

create function public.my_email() returns text
language sql stable
as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create function public.is_storyteller() returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from storytellers where lower(email) = my_email() and my_email() <> '') $$;

create function public.owns_sheet(p_slug text) returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from sheet_owners where slug = p_slug and lower(email) = my_email() and my_email() <> '') $$;

-- What the signed-in visitor may do on a sheet: storyteller, owner or viewer.
create function public.sheet_role(p_slug text) returns text
language sql stable security definer set search_path = public
as $$ select case when is_storyteller() then 'storyteller'
                  when owns_sheet(p_slug) then 'owner'
                  else 'viewer' end $$;

create function public.xp_available(p_slug text) returns integer
language sql stable security definer set search_path = public
as $$
  select coalesce((select sum(amount) from xp_awards where slug = p_slug), 0)
       - coalesce((select sum(cost) from xp_requests where slug = p_slug and status in ('approved', 'pending')), 0)
$$;

-- Position (0-based) of the first row in data->p_list whose name matches.
create function public.row_index(p_data jsonb, p_list text, p_name text) returns integer
language sql immutable
as $$
  select (e.ord - 1)::integer
  from jsonb_array_elements(coalesce(p_data -> p_list, '[]'::jsonb)) with ordinality as e(v, ord)
  where lower(btrim(e.v ->> 'name')) = lower(btrim(p_name))
  order by e.ord limit 1
$$;


-- --------------------------------------------------------- purchasing

-- A player (or Storyteller) asks to buy one dot or one new thing.
--   attribute / skill:  p_trait = key, e.g. 'wits'
--   advantage:          p_trait = the Advantage's name (a new one is fine)
--   specialty:          p_trait = skill key, p_detail = specialty name
--   edge:               p_trait = the new Edge's name
--   perk:               p_trait = the Edge's name, p_detail = perk name
-- The level bought, and so the cost, counts purchases still waiting.
create function public.request_xp(p_slug text, p_kind text, p_trait text, p_detail text default '')
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
  if not (owns_sheet(p_slug) or is_storyteller()) then
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


-- Withdraw (player) or turn down (Storyteller) a waiting purchase.
-- Later purchases of the same trait depend on it, so they go too.
create function public.close_xp_request(p_id bigint, p_note text default '')
returns void
language plpgsql security definer set search_path = public
as $$
declare r xp_requests; new_status text;
begin
  select * into r from xp_requests where id = p_id for update;
  if not found or r.status <> 'pending' then raise exception 'That purchase is no longer waiting.'; end if;
  if is_storyteller() then new_status := 'rejected';
  elsif owns_sheet(r.slug) then new_status := 'cancelled';
  else raise exception 'Only the player or a Storyteller can do that.';
  end if;

  update xp_requests
     set status = new_status, decided_at = now(), note = left(coalesce(p_note, ''), 300)
   where status = 'pending' and slug = r.slug and kind = r.kind and lower(trait) = lower(r.trait)
     and (id = r.id or (r.kind in ('attribute', 'skill', 'advantage') and to_level > r.to_level));
end $$;


-- Storyteller: approve a purchase and write it onto the sheet.
create function public.approve_xp_request(p_id bigint, p_note text default '')
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
  if not is_storyteller() then raise exception 'Only a Storyteller can approve purchases.'; end if;
  select * into r from xp_requests where id = p_id for update;
  if not found or r.status <> 'pending' then raise exception 'That purchase is no longer waiting.'; end if;
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


-- Storyteller: undo an approved purchase and give the XP back.
-- Only while the sheet still shows exactly what it bought.
create function public.refund_xp_request(p_id bigint, p_note text default '')
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
  if not is_storyteller() then raise exception 'Only a Storyteller can refund purchases.'; end if;
  select * into r from xp_requests where id = p_id for update;
  if not found or r.status <> 'approved' then raise exception 'Only an approved purchase can be refunded.'; end if;
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


-- ---------------------------------------------------- awarding XP

create function public.award_xp(p_slug text, p_amount integer, p_note text default '')
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_storyteller() then raise exception 'Only a Storyteller can award XP.'; end if;
  if not exists (select 1 from character_sheets where slug = p_slug) then raise exception 'There is no such sheet.'; end if;
  if coalesce(p_amount, 0) = 0 then raise exception 'Award a number of XP other than zero.'; end if;
  if xp_available(p_slug) + p_amount < 0 then
    raise exception 'That would leave less XP than has already been spent or requested.';
  end if;
  insert into xp_awards (slug, amount, note) values (p_slug, p_amount, left(coalesce(p_note, ''), 200));
end $$;

create function public.delete_xp_award(p_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare a xp_awards;
begin
  if not is_storyteller() then raise exception 'Only a Storyteller can remove an award.'; end if;
  select * into a from xp_awards where id = p_id for update;
  if not found then raise exception 'That award is already gone.'; end if;
  if xp_available(a.slug) - a.amount < 0 then
    raise exception 'Removing it would leave less XP than has already been spent or requested.';
  end if;
  delete from xp_awards where id = p_id;
end $$;


-- --------------------------------------------------- editing sheets

-- The player's own part: damage, notes, equipment and so on.
create function public.save_play(p_slug text, p_play jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not (owns_sheet(p_slug) or is_storyteller()) then
    raise exception 'You can only change your own sheet.';
  end if;
  if jsonb_typeof(p_play) <> 'object' or octet_length(p_play::text) > 100000 then
    raise exception 'That sheet could not be saved.';
  end if;
  update character_sheets set play = p_play, updated_at = now() where slug = p_slug;
  if not found then raise exception 'There is no such sheet.'; end if;
end $$;

-- Storyteller: change anything on the sheet directly.
create function public.save_sheet(p_slug text, p_data jsonb, p_play jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_storyteller() then raise exception 'Only a Storyteller can edit the whole sheet.'; end if;
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


-- Nobody signed out may call anything that writes.
revoke execute on function public.request_xp(text, text, text, text), public.close_xp_request(bigint, text),
  public.approve_xp_request(bigint, text), public.refund_xp_request(bigint, text),
  public.award_xp(text, integer, text), public.delete_xp_award(bigint),
  public.save_play(text, jsonb), public.save_sheet(text, jsonb, jsonb)
  from public, anon;
grant execute on function public.request_xp(text, text, text, text), public.close_xp_request(bigint, text),
  public.approve_xp_request(bigint, text), public.refund_xp_request(bigint, text),
  public.award_xp(text, integer, text), public.delete_xp_award(bigint),
  public.save_play(text, jsonb), public.save_sheet(text, jsonb, jsonb)
  to authenticated;
