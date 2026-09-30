# Dead Hand Chronicle — how to add content

Part of **Vistectus → Hunter → Brooklyn Chronicles → Dead Hand Chronicle**.

## The one rule

**You add people by editing data files, never HTML.**

```
assets/data/players.js   the cell
assets/data/npcs.js      people of Red Hook
assets/js/site.js        the menu, if you add a whole page
```

Copy an existing block, fill it in, drop the files where its paths point:

```
portrait  -> assets/img/players/   or   assets/img/npcs/    (lowercase filenames)
sheet     -> online; see "Character sheets and XP" below
```

Any field but `name` may be left out. No portrait falls back to
`assets/img/placeholder.svg`; no `sheet` hides the sheet button;
NPCs without `stats` simply show no stat block.

**Use lowercase filenames.** Windows does not care, but a web host does,
and a portrait named `Payne.jpg` will not load from a path that says
`payne.jpg`.

## Styling

There is none in this folder, on purpose. The pages use:

```
../../../style.css   the shared Vistectus wireframe
../world.css         Brooklyn Chronicles flavour: blood accent, Garamond, bone text
```

To restyle the whole world — every chronicle in it — edit `../world.css`.
Nothing here needs to change. The previous standalone stylesheet is kept
at `../_legacy/style.old.css` for reference.

## Pages

| File | What it is |
|------|------------|
| `index.html` | Chronicle landing, spoiler-free |
| `players.html` | The cell |
| `npcs.html` | People of Red Hook |
| `resources.html` | Documents, handouts and references from the chronicle |
| `compendium.html` | Redirects to `resources.html` (kept so old links work) |

## Resources

The Resources page lists everything the table has been given. Like the
cell and the NPCs, it is built from a data file:

```
assets/data/resources.js   one entry per document or link
assets/resources/          put the files themselves here
```

Copy an entry, fill it in, and the page lists it under its category.
Only `title` and `href` are required. The Compendium is one entry among
the others: replace `assets/compendium/compendium.html` with the real
document, keeping the filename, and its link keeps working.

## Character sheets and XP

Each hunter's profile opens `sheet.html?c=<name>`: the sheet laid out
like the printed one, kept online in the site's Supabase project (the
same one as the Builders area and the RICO board).

- **Anyone** can read every sheet and download it as the official PDF,
  filled in with the sheet as it stands.
- **The player**, signed in, marks Health and Willpower damage and
  Despair, and keeps their own Ambition, Desire, Touchstones, equipment,
  notes and description up to date. These save as they type.
- **XP**: the player asks to buy a dot (or a Specialty, Advantage, Edge
  or Perk). It shows striped on their sheet and holds the XP until you
  approve or reject it. Approving writes it onto the sheet. You can
  refund an approved purchase while the sheet still shows it.
- **You**, as Storyteller, award XP, handle purchases, and change
  anything on any sheet with **Edit sheet**.

The costs are in the `xp_costs` table (**Table Editor → xp_costs**) and
are shown on every sheet. Attribute: new level × 5; Skill: new level × 3;
Specialty 3; Advantage 3 per dot. **Edge and Perk are empty until you
fill them in**, and cannot be bought until then.

If the online sheet cannot be reached, the page shows the copy in
`assets/sheets/data/<name>.json` read-only. Those files are the sheets
as they stood in the old PDFs, and `sql/seed.sql` is made from them.

### One-time setup

In the Supabase dashboard:

1. **SQL Editor**: run `assets/sheets/sql/setup.sql`, then
   `assets/sheets/sql/seed.sql`. (Run the seed only once: running it
   again resets every sheet to its original values.)
2. **SQL Editor**: say who you are and who plays whom. Use real
   addresses here, in the dashboard only. Never put them in a file in
   this repository: it is public.

   ```sql
   insert into public.storytellers (email) values ('your-email@example.com');

   insert into public.sheet_owners (slug, email) values
     ('payne',    'player-email@example.com'),
     ('dorian',   'player-email@example.com'),
     ('jack',     'player-email@example.com'),
     ('ezekiel',  'player-email@example.com'),
     ('adelina',  'player-email@example.com'),
     ('vivienne', 'player-email@example.com'),
     ('raven',    'player-email@example.com');
   ```
3. **Authentication → Users → Invite user** for each player not yet
   invited, with the same address.
4. **Authentication → URL Configuration → Redirect URLs**: replace
   `https://vistectus.com/htr/brooklyn/dead-hand/rico-case/**` with
   `https://vistectus.com/htr/brooklyn/dead-hand/**`, which covers both
   the sheets and the RICO board.
5. **Edge and Perk costs**, once you know them:

   ```sql
   update public.xp_costs set cost = 7 where kind = 'edge';   -- your figure
   update public.xp_costs set cost = 3 where kind = 'perk';   -- your figure
   ```

A new hunter later: add them to `players.js` with `sheet: "<name>"`,
then add a row to `character_sheets` (copy one in the Table Editor and
change `slug` and `name`) and to `sheet_owners`.

## The RICO Case board

`rico-case/` is the case board, opened from the **RICO Case** button in
Vivienne's dossier (the `links` field on her entry in `players.js`).

Case files are kept online, in the same Supabase project as the Builders
area (the board reads its address and key from `builders/config.js`).

- **Save** stores the board as a new version: V1, V2, V3… Nothing is
  ever overwritten.
- **Open…** lists every case file and every saved version, with the
  date, and opens the one you pick.
- The page opens on the latest saved version of the RICO case, or a
  blank board if none has been saved yet.
- **Anyone can open** saved versions. **Saving and deleting need an
  invited account**, the same accounts as the Builders area: invite a
  player under **Authentication → Users → Invite user** and they sign in
  from the board with an email link. Nothing on the board is private,
  so keep the chronicle's secrets off it.
- Photos are uploaded when the board is saved, so versions share them
  instead of each carrying a copy.

Until `builders/config.js` is filled in, the board still works but says
"Not connected" when you Save or Open.

### One-time setup

Do the Builders setup first (`builders/README.md`, steps 1 and 2). Then:

**Authentication → URL Configuration → Redirect URLs**: add
`https://vistectus.com/htr/brooklyn/dead-hand/rico-case/**` so sign-in
links can return to the board.

**SQL Editor**: run this once.

```sql
-- Every saved version of every case file.
create table public.case_files (
  id          uuid primary key default gen_random_uuid(),
  chronicle   text not null,
  board       text not null,
  name        text not null check (char_length(name) between 1 and 60),
  version     integer not null check (version > 0),
  data        jsonb not null check (octet_length(data::text) < 2000000),
  saved_by    uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (chronicle, board, version)
);

alter table public.case_files enable row level security;

create policy "Anyone can open case files"
  on public.case_files for select to anon, authenticated
  using (true);

create policy "Signed-in players save case files"
  on public.case_files for insert to authenticated
  with check (saved_by = (select auth.uid()));

create policy "Signed-in players delete case files"
  on public.case_files for delete to authenticated
  using (true);

-- Photos pinned to the boards: public to view, 2 MB each, images only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('case-photos', 'case-photos', true, 2097152,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

create policy "Signed-in players add case photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'case-photos');
```

To make the case files readable only by signed-in players, change
`to anon, authenticated` in the first policy to `to authenticated`.

Deleting a case file removes its versions but not its photos; clear old
ones from **Storage → case-photos** if space ever matters.

## Pictures

`art/` beside this file is for chronicle artwork — a hero image, band
strips, card art. See `../../../art/README.txt` for the four image slots
and how paths resolve.
