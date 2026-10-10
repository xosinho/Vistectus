# The World Builder — how worlds, chronicles and their content work

VisTectus has three games, each with worlds, and chronicles (D&D:
campaigns) inside the worlds:

```
htr/<world>/<chronicle>/     Hunter: the Reckoning     (chronicle, Storyteller, the cell)
vtda/<world>/<chronicle>/    Vampire: the Dark Ages     (chronicle, Storyteller, the coterie)
dnd/<world>/<campaign>/      Dungeons & Dragons 5e      (campaign, Dungeon Master, the party)
```

Two kinds of world and chronicle live side by side:

- **In the site's files** (Brooklyn/Dead Hand, Hungary 1242/A Crown of
  Ice and Bone, Shrouded/The Wheel of Time, The Last Garden/Campaign 1):
  real HTML pages and data files in the repository.
- **Made with the Builder**: no files at all. They live in the database
  and their pages are drawn from shared templates (below).

Both kinds can receive content from the site as play goes on (NPCs,
handouts, maps, reference links, adventurers' cards, factions): it is
stored in the database and the pages show it next to what the files
hold.

## Database (`builders/sql/world-builder.sql`, run last)

| Table | What |
|---|---|
| `builders (email)` | who may start a new world (the Admin page adds them) |
| `worlds (id, game, name, tagline, overview, card_image, hero_image, options, status, review_note, static_path, created_by)` | every world; `static_path` set for the four file worlds; `status` draft → pending → approved / rejected |
| `world_factions (id, world, name, chip, epithet, goals[], figures[{name,note}], prose, image, sort)` | a world's factions, in the faction-page format |
| `chronicles` (+ `status, tagline, premise, card_image, created_by`) | every chronicle/campaign; new ones are draft → pending → approved |
| `chronicle_items (id, chronicle, kind, data, sort)` | content added on the site; `kind` = `player`, `npc`, `document`, `map`, `resource`; `data` has the same fields as the matching data file entry (pictures and files as `world-media` paths) |
| storage bucket `world-media` (public) | pictures and files, under `<world>/...` or `<world>/<chronicle>/...` |

`options` (world): `{"creeds": [...]}` (Hunter), `{"clans": [...]}`
(Vampire), `{"species": [...], "classes": [...]}` (D&D); a missing key
means everything.

Who may do what (the database enforces it):

- **Read**: approved worlds and their factions are public; a world in the
  making only for its editors. Chronicle content (`chronicle_items`) only
  for the chronicle's members. Approved chronicles' rows are public.
- **World editor** (`is_world_editor(world)`): a site admin, the builder
  who made it, or a Storyteller/DM of any chronicle in it. Edits the
  world (`builder_save_world`), its factions (direct insert/update/delete
  on `world_factions`), and uploads to `world-media/<world>/...`.
- **Chronicle Storyteller/DM** (`is_chronicle_storyteller`): adds, edits
  and removes `chronicle_items` (direct insert/update/delete), and its
  Locations pins as before.
- RPCs: `builder_save_world(p_id, p_game, p_name, p_tagline, p_overview,
  p_card_image, p_hero_image, p_options)`, `builder_save_chronicle(p_world,
  p_id, p_name, p_tagline, p_premise, p_card_image)` (its maker becomes
  the chronicle's Storyteller/DM at once), `builder_submit(p_world,
  p_chronicle|null)`, `builder_delete_world(p_world)`, `is_builder()`;
  site admin: `admin_review(p_world, p_chronicle|null, p_approve, p_note)`,
  `admin_set_builder(p_email, p_add)`, `admin_builders()`.

## Shared browser modules (site root)

| File | What |
|---|---|
| `/gate.js` | members' gate (`Gate.ready` → `{db, role, email, session}`) |
| `/content.js` | `ChronicleContent`: `merge(kind, staticList, chronicleId)` → Promise of the list plus the database's items (same shape as data-file entries; picture/file paths turned into links), `items(db, chronicle, kind)`, `factions(worldId)`, `world(id)`, `chronicles(worldId)`, `upload([world, chronicle?], folder, blob, name)` → stored path, `remove(path)`, `mediaUrl(path)` |
| `/cropper.js` | `ImageCropper.open(file, {aspect: "card"|"portrait", title})` → Promise of a JPEG Blob (16:9 at up to 1600×900, or 3:4 at up to 900×1200) or null |
| `/members.js` | `ChronicleMembers.render(el, {db, chronicle, admin, unit, dm})` |
| `/login.js` | the Log in page |
| `/world.js`, `/factions-view.js`, `/options-view.js`, `/listings.js` | world pages, faction pages, player-option pages, and the lists of Builder-made worlds/chronicles on the file pages |

## Pages for Builder-made worlds and chronicles: `404.html` + `router.js`

GitHub Pages serves `/404.html` for any address without a file. The
router reads the address, looks the world (and chronicle) up, fetches the
matching template and writes it in with these placeholders filled in
(HTML-escaped): `{{WORLD_ID}} {{WORLD_NAME}} {{CHRONICLE_ID}} {{CHRONICLE_NAME}}`.

```
/<sys>/<world>/                       ->  /<sys>/_world/index.html
/<sys>/<world>/factions/index.html    ->  /<sys>/_world/factions/index.html
/<sys>/<world>/options/index.html     ->  /<sys>/_world/options/index.html
/vtda/<world>/rules.html              ->  /vtda/_world/rules.html
/<sys>/<world>/<chronicle>/<page>     ->  /<sys>/_world/_chronicle/<page>
   e.g. players.html, sheet.html, locations/index.html, board/index.html
```

The template sits at the same folder depth as the address it serves, so
every relative link in it (`../../assets/js/...`, `../../../style.css`,
`players.html`, `../index.html`) works unchanged. Templates therefore:

- put `data-world="{{WORLD_ID}}" data-world-name="{{WORLD_NAME}}"` on
  `<body>`, and on chronicle pages also `data-chronicle="{{CHRONICLE_ID}}"
  data-chronicle-name="{{CHRONICLE_NAME}}"` (D&D: also `data-campaign=`
  and `data-campaign-name=` with the same values, which the D&D scripts read);
- load only shared scripts that read the ids from those attributes
  (`htr/assets/js/`, `vtda/assets/js/`, `dnd/assets/`);
- start their data arrays empty inline (`window.X_NPCS = [];`) and show
  the database's content through `ChronicleContent.merge`;
- gate members-only pages with `/gate.js` exactly as the file chronicles do,
  using `data-chronicle="{{CHRONICLE_ID}}"`.

Locations on Builder-made chronicles use the uploaded-map app
(`dnd/assets/locations/`, wording from data attributes), since a made-up
or unknown place has no street map.

## Pictures

Card pictures (worlds, chronicles, resource cards): **16:9**.
Portraits (adventurers, NPCs, factions): **3:4**. Every upload goes
through `ImageCropper` first. Maps and handouts are not cropped.

## The Builder (`builders/`)

- `index.html` — sign in (builders, Storytellers, DMs).
- `dashboard.html` — your worlds and chronicles (status, continue, open
  the workshop), "Build a new world", and the old file upload for
  anything else.
- `build.html` — the guided wizard: system → world (name, short name,
  tagline, overview, card picture) → factions (in the faction format,
  with a prompt to describe each) → player options (Creeds / Clans /
  Races & Classes, with the system's wiki) → the first chronicle/campaign
  (name, tagline, premise, card picture) → NPCs to begin with (3:4
  portraits) → resources to begin with (handouts, maps, places for the
  Locations app) → review → send for approval.
- `workshop.html?w=<world>` / `?c=<chronicle>` — keep adding and editing
  factions, NPCs, adventurers' cards, handouts, maps, reference links and
  places as the chronicle goes on. Linked from every Storyteller page and
  DM Screen.
