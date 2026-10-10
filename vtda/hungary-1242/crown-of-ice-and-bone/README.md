# A Crown of Ice and Bone — how this chronicle's site works

A Vampire: the Dark Ages chronicle. It works like the Dead Hand chronicle
(`htr/brooklyn/dead-hand/`) and shares its Supabase project, sign-in,
Storytellers and tables; the two chronicles' data are kept apart by the
chronicle id `crown-of-ice-and-bone`.

| Page | What it is |
|---|---|
| `index.html` | The chronicle's front page |
| `players.html` | The coterie: one card per Cainite, from `assets/data/players.js` |
| `npcs.html` | People, from `assets/data/npcs.js` (Storyteller can hide entries) |
| `resources.html` | Links to Documents, Maps, Locations, the Intrigue Board and the rules |
| `documents.html`, `maps.html` | From `assets/data/documents.js` and `maps.js` (hideable) |
| `locations/` | The Locations app: pins you reveal, private notes |
| `intrigue-board/` | The coterie's board (people, places, documents, strings) |
| `sheet.html?c=<name>` | A Cainite's V20 Dark Ages sheet, with XP |
| `sheet.html?npc=<name>` | An NPC stat sheet (Storyteller only) |
| `storyteller.html` | Sign-in, the coterie's XP and players, NPC sheets, rules upload |
| `rules.html` | The Dark Ages rules from the Obsidian vault — coterie only |

## One-time setup

1. **SQL.** In Supabase, SQL Editor → New query, run
   `assets/sql/setup.sql`. It builds on what the Dead Hand already set
   up, so those files must have been run first, in this order:
   `htr/brooklyn/dead-hand/assets/sheets/sql/setup.sql`,
   `npc-sheets.sql`, `archive-hidden.sql` (same folder), the case files
   block in the Dead Hand `README.md`, `rico-case/editors.sql`, and
   `locations/setup.sql`. Safe to run again; it changes nothing for the
   Dead Hand. If `rico-case/editors.sql` is ever run again, run this
   file again after it.
2. **Sign-in links.** Authentication → URL Configuration → Redirect
   URLs: add `https://vistectus.com/vtda/**`, so sign-in links can
   bring people back to these pages.
3. **The rules.** On the Storyteller page, under *The rules (Obsidian)*,
   choose the folder `Obsidian Vault/RPG/wiki/dark-ages` and upload.
   Do it again whenever you change the notes in Obsidian.

## Adding a player

1. Storyteller page → *New character sheet*: a name and a short name
   (e.g. `istvan`). Fill the sheet with **Edit sheet**.
2. Supabase → Authentication → Users → *Invite user* with the
   player's email. Then, on the Storyteller page, type the same email
   in the *Player* box beside the Cainite and press Save. That player
   can now update the sheet, spend XP and read the rules.
3. Add their card to `assets/data/players.js`, with `sheet: "istvan"`.

Players' emails live only in the database (`sheet_owners`), never in
the site's files.

## NPCs, documents and maps

Add entries to `assets/data/npcs.js`, `documents.js` and `maps.js`, and
put the files in `assets/img/npcs/`, `assets/resources/Documents/` and
`assets/resources/Maps/`. Each file explains its fields. Signed in as
Storyteller, each page shows *Hide from players* on every entry, so you
can add things ahead of time and reveal them when the coterie finds
them. Hiding takes an entry off the page; the file itself is still on
the site.

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

`assets/data/rules-data.js` holds the names the sheet's dropdowns use
(clans and their Disciplines, Roads, Archetypes, Merits and Flaws...),
generated from the vault — names and numbers only; the rules text
stays in the members-only rules pages.

## The rules pages

The notes are kept in the `vault_notes` table. The database lets only a
Storyteller, or a player with a sheet in this chronicle, read them;
visitors who are not signed in get nothing, and nothing of the rules is
in the site's files. They are your notes on a published rulebook: keep
them for the table.
