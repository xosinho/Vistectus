# The Dead Hand — player resource site

A small, self-contained static website for publishing your *Hunter: The Reckoning*
campaign resources to your players. No build step, no framework, no server
required — it works opened straight from disk or hosted anywhere.

## Pages

| File | Purpose |
|------|---------|
| `index.html` | Spoiler-free landing page describing the chronicle. |
| `players.html` | The cell — player cards that expand to backgrounds + sheet downloads. |
| `npcs.html` | People of Red Hook — NPC cards that expand to dossiers + optional stats. |
| `compendium.html` | Embeds your compendium document in an isolated frame. |

## The one rule of this site

**You add content by editing data files, never HTML.**
Everything routine lives in three easy files:

```
assets/data/players.js   ← add / edit players here
assets/data/npcs.js      ← add / edit NPCs here
assets/js/site.js        ← the menu + site name (only if you add a whole page)
```

Because each page is a standalone file that only *reads* the shared assets,
editing one page — including the landing page — can never break another.

---

## How to add a PLAYER

1. Open `assets/data/players.js`.
2. Copy one of the example blocks and fill it in:

```js
{
  name: "Mara Quimby",
  tagline: "Night-shift nurse who asks too many questions",
  role: "Creed: Martyr",
  portrait: "assets/img/players/mara.jpg",
  meta: ["Creed: Martyr", "Drive: Atonement"],
  background: "Mara has worked the graveyard shift for nine years...\n\nSecond paragraph...",
  sheetJson: "assets/sheets/json/mara.json",
  sheetPdf:  "assets/sheets/pdf/mara.pdf"
}
```

3. Drop the files where the paths point:
   - portrait → `assets/img/players/`
   - JSON sheet → `assets/sheets/json/`
   - PDF sheet → `assets/sheets/pdf/`

Any field except `name` can be left out. No portrait → a placeholder is shown.
No sheet paths → the download section is hidden. The `background` can be plain
text, an array of paragraphs, or a path to a full `.html` page in
`assets/backgrounds/`.

## How to add an NPC

Same idea in `assets/data/npcs.js`. NPCs also support an optional `stats`
object rendered as a stat block:

```js
{
  name: "Gerald Pike",
  role: "Mortal · City official",
  portrait: "assets/img/npcs/pike.jpg",
  meta: ["Faction: City", "Disposition: Wary"],
  description: "A mid-level functionary who signs things he shouldn't...",
  stats: { "Health": "6", "Willpower": "4", "Physical": "Str 2 · Dex 2 · Sta 2" }
}
```

Leave out `stats` entirely for a social-only NPC and the block disappears.

## How to publish your COMPENDIUM

Replace `assets/compendium/compendium.html` with your real compendium HTML
document, keeping the filename. It renders on the Compendium page automatically,
inside an isolated frame so its styling stays separate.
(Different filename? Update the two references in `compendium.html`.)

## Matching your existing document styling

All styling lives in **`assets/css/style.css`**. The colours and fonts are at
the very top in the `:root` block — swap those values for the ones from your
existing campaign HTML docs and the whole site follows. Fonts load from Google
Fonts with graceful fallbacks if you're offline.

---

## Viewing it

- **Quickest:** double-click `index.html`. Everything works from disk, including
  the player/NPC data, because the data loads as plain scripts (no server needed).
- **In VSCode:** the *Live Server* extension gives you auto-reload while you edit.

## Publishing it (when you decide where)

It's a plain static folder, so any of these work with zero changes:

- **GitHub Pages** — commit the folder to a repo, enable Pages on the branch.
- **Netlify / Vercel / Cloudflare Pages** — drag the folder onto their dashboard.
- **Any web host** — upload the folder over FTP.

## Folder map

```
dead-hand-site/
├── index.html            landing (spoiler-free)
├── players.html          the cell
├── npcs.html             people of Red Hook
├── compendium.html       compendium frame
├── README.md             this file
└── assets/
    ├── css/style.css     ← all styling (edit :root to restyle)
    ├── js/
    │   ├── site.js       ← nav + footer (edit to add a page)
    │   └── render.js     roster + popup engine (no need to edit)
    ├── data/
    │   ├── players.js    ← add players here
    │   └── npcs.js       ← add NPCs here
    ├── img/
    │   ├── players/      player portraits
    │   ├── npcs/         NPC portraits
    │   └── placeholder.svg
    ├── sheets/
    │   ├── json/         character-sheet JSON
    │   └── pdf/          character-sheet PDFs
    ├── backgrounds/      optional full-page backgrounds/dossiers
    └── compendium/
        └── compendium.html   ← replace with your compendium
```
