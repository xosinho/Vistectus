# Dead Hand Chronicle — how to add content

Part of **Vistectus → Hunter → Brooklyn Chronicles → Dead Hand Chronicle**.

## Members only

Every page but the front page (`index.html`) is for the chronicle's
members: it opens after signing in, and only for an email added to
Dead Hand. Storytellers are added on the site's Admin page (`/admin/`);
players by the Storyteller, under *Players* on `storyteller.html`.
Adding an email is the invitation: the person signs in with it on any
of the chronicle's pages, and the first link creates their account.
Players can make a hunter with **Create Hunter** (`create.html`); it
comes to the Storyteller for approval and becomes their sheet.
Setup: `admin/sql/access.sql` (run after the files below; it replaces
the `storytellers` table and the "anyone reads" rules described
further down, which are kept here for reference).

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
- **The Storyteller tab** (after Resources on every chronicle page)
  opens `storyteller.html`: sign in there, then see every hunter's XP
  and the purchases waiting for you, with links to each sheet.

The costs are in the `xp_costs` table (**Table Editor → xp_costs**) and
are shown on every sheet. Attribute: new level × 5; Skill: new level × 3;
Specialty 3; Advantage 3 per dot; Edge 7 each; Perk 3 each.

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
5. **If you ran `setup.sql` before Edge and Perk had costs**, set them:

   ```sql
   update public.xp_costs set cost = 7 where kind = 'edge';
   update public.xp_costs set cost = 3 where kind = 'perk';
   ```

A new hunter later: add them to `players.js` with `sheet: "<name>"`,
then add a row to `character_sheets` (copy one in the Table Editor and
change `slug` and `name`) and to `sheet_owners`.

## Documents, Maps and Locations

The Resources page leads to three archives:

- **Documents** (`documents.html`): handouts that open in a pop-up.
  Put the file in `assets/resources/Documents/` and add an entry to
  `assets/data/documents.js`. HTML, PDF and images all work; a PDF can
  also be offered as a download alongside an HTML version.
- **Maps** (`maps.html`): pictures that open full size in a pop-up.
  Put the image in `assets/resources/Maps/` and add an entry to
  `assets/data/maps.js`.
- **Locations** (`locations/`): the Locations board, kept online in the
  Supabase project. Players see only the pins and maps you have
  revealed, with the description you wrote for them. Signed in as
  Storyteller (the button at the top of its panel, or the Storyteller
  tab), you also see your private notes and factions, and can add,
  drag, edit, reveal, hide and delete pins, upload area maps and
  building plans, place tokens, and save or load setups.

All three are public: only publish what the players have been given.

**Hiding a document, map or NPC (Storyteller):** the People page works the same way, hiding a whole NPC entry.  signed in as Storyteller
(from the Storyteller tab), each document and map shows a **Hide from
players** button; hidden ones stay visible to you, marked. One-time
setup: run `assets/sheets/sql/archive-hidden.sql` in Supabase. Hiding
takes an item off the page only; the file itself is still on the site,
so do not upload anything that must stay secret until you reveal it.

### Locations: one-time setup

1. **SQL Editor**: run `locations/setup.sql` (after the character sheet
   setup, which it builds on).
2. **SQL Editor**: run `locations-seed.sql`. This is **not** in this
   repository: it holds the chronicle's secrets and sits beside the
   original app, in `WoD/Dead Hand/Apps/Maps/`. It loads the built-in
   locations with the Session 3 positions and pins. Every pin starts
   hidden; nothing shows to players until you reveal it.
3. Open the Locations board, sign in, and reveal what the cell knows.
   A pin's **name** and **description** are what players read; the
   Thorne house is named "Thorne house (74 Degraw St.)" for that
   reason, with its full title kept in your notes.

Never put the seed file, or a setups file exported from the board, in
this repository: both contain your notes.

## Rules reference: Creeds, Drives, Edges, Advantages

The `rules_*` tables in Supabase hold the Hunter: The Reckoning rules
reference, compiled from the Hunter: The Reckoning Wiki (CC BY-SA 3.0):
5 Creeds, 9 Drives, 17 Edges plus 10 lineage variants with their 98
Perks and dice pools, and 69 Advantages & Flaws. Names, dice pools and
dots are as on the wiki; descriptions are short summaries linking to it.

On every character and NPC sheet:
- each Edge shows its **dice pool**, requirements and description, and
  each Perk its effect (also in the PDF: the pool is added to the row);
- **Edit sheet** turns Creed and Drive into dropdowns ("Other…" for
  anything else, such as an NPC's clan), gives each Edge and Advantage
  row a "Pick from the list" dropdown, and Perks become tick-boxes;
- **Buy something new** (XP) offers Edges, Perks and Advantages from
  dropdowns, leaving out what the hunter already has.

Existing Edges are recognised by name ("GLOBAL ACCESS (Int + Technology)"
finds Global Access). One that is not on the wiki keeps working as text.
Anyone can read the tables; only Storytellers can change them, in the
Supabase Table Editor. Setup: run `assets/sheets/sql/rules.sql` once;
running it again resets the tables to the file's data.

## NPC stat sheets (Storyteller only)

The Storyteller page has an **NPC stat sheets** section: create a sheet
for any NPC (the names from the People page are suggested), open it, and
change anything with **Edit sheet**. Damage and notes save as you go.
The layout is the hunters' sheet without experience, and **Download PDF**
works as it does for hunters.

They live only in the `npc_sheets` table, which the database lets no
one but a Storyteller read, create, change or delete; visitors are
refused outright and players get nothing back. Nothing about them is in
the website's files. Each opens at `sheet.html?npc=<name>`, which shows
non-Storytellers a "Storytellers only" message and nothing else.

One-time setup: run `assets/sheets/sql/npc-sheets.sql` in Supabase.

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

**Who may save and delete:** only the players of Vivienne and Ezekiel,
and the Storyteller,
set by `rico-case/editors.sql` (run it once, after the sheet setup).
It uses the `sheet_owners` table, so their emails must be linked to
their hunters there. Anyone can still open and read the board. To change
the list, edit `case_board_editor()` in that file and run it again.

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
