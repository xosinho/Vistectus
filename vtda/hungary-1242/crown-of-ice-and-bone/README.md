# A Crown of Ice and Bone — how this chronicle's site works

A Vampire: The Dark Ages chronicle. It works like the Dead Hand chronicle
(`htr/brooklyn/dead-hand/`) and shares its Supabase project, sign-in,
Storytellers and tables; the two chronicles' data are kept apart by the
chronicle id `crown-of-ice-and-bone`.

Every page except the front page (`index.html`) is for the chronicle's
members only: it opens after signing in, and only for someone added to
the chronicle (`gate.js` at the site root; the database checks too).

## How the pages are built

The pages are this chronicle's own (their wording, art and layout), but
the scripts and styles that draw them are the ones every Vampire
chronicle made with the Builder uses, in `vtda/assets/`:

| Shared file | Used by |
|---|---|
| `js/render.js` | The coterie and People (cards, pop-ups, hiding) |
| `js/viewer.js` | Documents and Maps |
| `js/sheet.js`, `js/storyteller.js`, `js/create.js` | The sheet, the Storyteller page, Create Kindred |
| `js/site.js` | The page title |
| `js/rules.js` | The world's rules page (`../rules.html`) |
| `css/chronicle.css`, `css/sheet.css`, `css/rules.css` | Their styles (the handout and map pages use `/shared/css/resources.css`, shared by every system) |
| `data/rules-data.js` | Names and numbers for the sheet's dropdowns (`window.VAMPIRE_RULES`) |
| `intrigue-board/` | The Intrigue Board (`intrigue-board/index.html` is only its page) |

They learn which chronicle they are drawing from the page's `<body>`:
`data-chronicle="crown-of-ice-and-bone"`, `data-chronicle-name`,
`data-world="hungary-1242"` and `data-world-name`. Do not copy them into
this folder: a change to the shared files reaches every chronicle,
this one included. After changing one, run `python tools/set-version.py`
so every page asks for the new copy.

What only this chronicle has stays here: the pages, the art, and the
data files in `assets/data/` (`window.VAMPIRE_PLAYERS`, `VAMPIRE_NPCS`,
`VAMPIRE_DOCUMENTS`, `VAMPIRE_MAPS`, `VAMPIRE_RESOURCES`). Each page
shows its data file's entries first, then what the Storyteller adds in
the Builder's workshop (`content.js` at the site root).

| Page | What it is |
|---|---|
| `index.html` | The chronicle's front page (open to everyone) |
| `players.html` | The coterie: one card per Cainite, from `assets/data/players.js` and the workshop |
| `npcs.html` | People, from `assets/data/npcs.js` and the workshop (Storyteller can hide entries) |
| `resources.html` | Links to Documents, Maps, Locations and the Intrigue Board |
| `documents.html`, `maps.html` | From `assets/data/documents.js` and `maps.js`, and the workshop (hideable) |
| `locations/` | The Locations board: a shell around the shared real-map app (`/shared/locations/`), set to the Kingdom of Hungary |
| `intrigue-board/` | The coterie's board (people, places, documents, strings) |
| `create.html` | Create Kindred: a player makes a Cainite step by step; it comes to the Storyteller for approval |
| `sheet.html?c=<name>` | A Cainite's V20 Dark Ages sheet, with XP |
| `sheet.html?npc=<name>` | An NPC stat sheet (Storyteller only) |
| `storyteller.html` | The coterie's XP and players, characters waiting for approval, NPC sheets |
| `../rules.html` | The Dark Ages rules from Obsidian, for every Hungary 1242 member (one level up) |

## One-time setup

1. **SQL**, in Supabase → SQL Editor, in this order (each is safe to run
   again): `admin/sql/access.sql` (chronicles and members, site-wide),
   then `assets/sql/setup.sql` (this chronicle). They build on the Dead
   Hand files already run. Then make yourself site admin with the line at
   the end of `access.sql`.
2. **Authentication → Hooks**: add *Before User Created* → Postgres →
   `public.hook_before_user_created`. **Authentication → Sign In /
   Providers**: turn *Allow new users to sign up* on. Together these let
   an email added to a chronicle create its account at its first
   sign-in, and nobody else.
3. **Authentication → URL Configuration → Redirect URLs**: add
   `https://vistectus.com/**`.
4. **The rules**: on `../rules.html`, a Storyteller opens *Update from
   Obsidian* and follows the three steps there.

## People

- **Storytellers** are added to the chronicle by a site admin on the
  Admin page (`/admin/`).
- **Players** are added by the chronicle's Storyteller, under *Players*
  on the Storyteller page (or by a site admin). Adding an email is the
  invitation: tell them to sign in with it on any of the chronicle's
  pages; the first link creates their account.
- **A player's character**: the player makes it with *Create Kindred*,
  the Storyteller reviews it from the Storyteller page and approves it
  (it becomes their sheet) or sends it back with a note. A Storyteller
  can also create a blank sheet on the Storyteller page and choose who
  plays it.
- Add each Cainite's card to `assets/data/players.js` (or in the
  workshop) with `sheet: "<short name>"`.

Emails live only in the database, never in the site's files.

## NPCs, documents and maps

Add them in the workshop (the Storyteller page links to it), or add
entries to `assets/data/npcs.js`, `documents.js` and `maps.js` and put
the files in `assets/img/npcs/`, `assets/resources/Documents/` and
`assets/resources/Maps/`. Each file explains its fields. Signed in as
Storyteller, each page shows *Hide from players* on every entry, so you
can add things ahead of time and reveal them when the coterie finds
them. Hiding takes an entry off the page; the file itself is still on
the site. What is hidden is kept by the person's name, or by the
document's `file` or the map's `image` exactly as written in the data
file: change that text and the entry shows again.

## The character sheet and XP

The sheet follows V20 Dark Ages: Attributes, Talents/Skills/Knowledges
with areas of expertise, Disciplines (◆ marks clan Disciplines),
Backgrounds, the two Virtues the Road calls for plus Courage, Paths and
Rituals, Merits and Flaws, Road (with the Aura it gives), Willpower,
a blood pool sized by Generation, and the seven health levels.

XP costs are the book's, in the `vtda_xp_costs` table (change a figure
there and the sheets follow): Attribute ×4, Ability ×2 (new 3), clan
Discipline ×5, other ×7 (new 10), secondary Path ×4 (new 7), Ritual
level ×2, Virtue ×2, Road ×2, Willpower ×1, expertise 1, Background ×2
for existing ones only. Players request; the Storyteller approves on the
sheet, where the purchase is written on. New Backgrounds have no cost
set, so they are given in play.

`vtda/assets/data/rules-data.js` holds the names the sheet's dropdowns
use (clans and their Disciplines, Roads, Archetypes, Merits and
Flaws...), generated from the vault and shared by every Vampire
chronicle — names and numbers only; the rules text stays in the
members-only rules pages.

## The rules pages

The Dark Ages notes are kept in the `vault_notes` table for the world
Hungary 1242, readable by every member of its chronicles and nobody
else; nothing of the rules is in the site's files. The website cannot
reach Obsidian on your computer, so a Storyteller copies the notes up
from the rules page (*Update from Obsidian*): choose the vault's
`dark-ages` folder, press Upload. The page is drawn by the shared
`vtda/assets/js/rules.js`; its `data-vault-folder` attribute names the
folder in the steps it shows. Do it again after changing the notes.
They are your notes on a published rulebook: keep them for the table.
