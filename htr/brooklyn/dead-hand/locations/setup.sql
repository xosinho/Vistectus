-- !! Since admin/sql/access.sql (chronicles and their members), this file's
-- !! rules are replaced there. If you ever run this file again, run
-- !! admin/sql/access.sql again straight after it.
-- =====================================================================
-- Locations app — one-time setup
-- ---------------------------------------------------------------------
-- Run once in Supabase: SQL Editor -> New query. Run it AFTER
-- assets/sheets/sql/setup.sql, which defines is_storyteller().
-- Then run the private seed file (kept outside this repository), which
-- loads the chronicle's locations.
--
-- Who sees what (enforced here, by the database):
--   * Anyone sees the pins and maps a Storyteller has marked revealed:
--     their name, position and the description written for players.
--   * Only Storytellers see unrevealed pins and maps, the private notes,
--     the faction of each pin, and the saved setups, and only they can
--     change anything.
-- None of the private material is in the page's code.
-- =====================================================================


-- ---------------------------------------------------------------- tables

-- A place. `name` and `description` are what players read once it is
-- revealed. No position (lat/lng null): known, but not on the map yet.
create table public.location_pins (
  id           text primary key,
  chronicle    text not null,
  name         text not null check (char_length(name) between 1 and 120),
  description  text not null default '' check (char_length(description) <= 4000),
  lat          double precision check (lat between -90 and 90),
  lng          double precision check (lng between -180 and 180),
  revealed     boolean not null default false,
  sort         integer not null default 0,
  updated_at   timestamptz not null default now(),
  check ((lat is null) = (lng is null))
);

-- The Storyteller's side of each place: private notes and faction.
create table public.location_notes (
  id       text primary key references public.location_pins (id) on delete cascade,
  faction  text not null default 'neutral',
  notes    text not null default '' check (char_length(notes) <= 8000)
);

-- Pin colours by faction, seen only by Storytellers. Players see every
-- pin in one neutral colour, so a colour never gives anything away.
create table public.location_factions (
  key    text primary key,
  label  text not null,
  color  text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  sort   integer not null default 0
);
insert into public.location_factions (key, label, color, sort)
values ('neutral', 'Neutral / Contested', '#c9a227', 99);

-- Area maps and building plans. The image is in the location-maps
-- bucket; tokens are the markers placed on it.
create table public.location_maps (
  id          text primary key,
  chronicle   text not null,
  kind        text not null check (kind in ('area', 'building')),
  name        text not null check (char_length(name) between 1 and 120),
  image_path  text not null unique,
  tokens      jsonb not null default '[]'::jsonb check (jsonb_typeof(tokens) = 'array'),
  revealed    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Named snapshots of every pin, to go back to a session's layout.
create table public.location_setups (
  id         bigint generated always as identity primary key,
  chronicle  text not null,
  name       text not null check (char_length(name) between 1 and 60),
  snapshot   jsonb not null,
  saved_at   timestamptz not null default now()
);


-- ------------------------------------------------------------- rules

alter table public.location_pins     enable row level security;
alter table public.location_notes    enable row level security;
alter table public.location_factions enable row level security;
alter table public.location_maps     enable row level security;
alter table public.location_setups   enable row level security;

create policy "Revealed pins are public"
  on public.location_pins for select to anon, authenticated
  using (revealed or public.is_storyteller());
create policy "Storytellers add pins"    on public.location_pins for insert to authenticated with check (public.is_storyteller());
create policy "Storytellers change pins" on public.location_pins for update to authenticated using (public.is_storyteller()) with check (public.is_storyteller());
create policy "Storytellers remove pins" on public.location_pins for delete to authenticated using (public.is_storyteller());

create policy "Revealed maps are public"
  on public.location_maps for select to anon, authenticated
  using (revealed or public.is_storyteller());
create policy "Storytellers add maps"    on public.location_maps for insert to authenticated with check (public.is_storyteller());
create policy "Storytellers change maps" on public.location_maps for update to authenticated using (public.is_storyteller()) with check (public.is_storyteller());
create policy "Storytellers remove maps" on public.location_maps for delete to authenticated using (public.is_storyteller());

-- Notes, factions and setups: Storytellers only, reading included.
create policy "Storytellers only" on public.location_notes    for all to authenticated using (public.is_storyteller()) with check (public.is_storyteller());
create policy "Storytellers only" on public.location_factions for all to authenticated using (public.is_storyteller()) with check (public.is_storyteller());
create policy "Storytellers only" on public.location_setups   for all to authenticated using (public.is_storyteller()) with check (public.is_storyteller());


-- ------------------------------------------------------------- images

-- A private bucket: an image can only be fetched while its map is
-- revealed, or by a Storyteller.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('location-maps', 'location-maps', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy "Revealed location maps can be seen"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'location-maps'
         and (public.is_storyteller()
              or exists (select 1 from public.location_maps m
                          where m.image_path = objects.name and m.revealed)));
create policy "Storytellers upload location maps"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'location-maps' and public.is_storyteller());
create policy "Storytellers remove location maps"
  on storage.objects for delete to authenticated
  using (bucket_id = 'location-maps' and public.is_storyteller());


-- ------------------------------------------------------------- setups

-- The current pins of a chronicle, notes included, as one snapshot.
create function public.location_snapshot(p_chronicle text) returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object('pins', coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'name', p.name, 'description', p.description,
           'lat', p.lat, 'lng', p.lng, 'revealed', p.revealed, 'sort', p.sort,
           'faction', coalesce(n.faction, 'neutral'), 'notes', coalesce(n.notes, ''))
           order by p.sort, p.id), '[]'::jsonb))
  from location_pins p left join location_notes n on n.id = p.id
  where p.chronicle = p_chronicle and is_storyteller()
$$;

-- Storyteller: make the chronicle's pins exactly what a snapshot holds.
-- Pins not in the snapshot are removed.
create function public.apply_location_snapshot(p_chronicle text, p_snapshot jsonb) returns void
language plpgsql security definer set search_path = public
as $$
declare pin jsonb;
begin
  if not is_storyteller() then raise exception 'Only a Storyteller can load a setup.'; end if;
  if jsonb_typeof(p_snapshot -> 'pins') <> 'array' then raise exception 'That is not a locations setup.'; end if;

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

revoke execute on function public.apply_location_snapshot(text, jsonb) from public, anon;
grant execute on function public.apply_location_snapshot(text, jsonb) to authenticated;
