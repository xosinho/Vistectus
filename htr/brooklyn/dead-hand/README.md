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
sheet     -> assets/sheets/pdf/        (PDF)
```

Any field but `name` may be left out. No portrait falls back to
`assets/img/placeholder.svg`; no sheetPdf hides the download row;
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

## The RICO Case board

`rico-case/` is the case board, opened from the **RICO Case** button in
Vivienne's dossier (the `links` field on her entry in `players.js`).

It opens whatever `rico-case/case.json` contains, which starts blank. To
publish changes:

1. Open the board, build or edit the case.
2. **Save** — this downloads a file such as `rico-case-v2.json`.
3. Replace `rico-case/case.json` with that file (keep the name
   `case.json`) and commit.

Edits a visitor makes are never saved to the site: they stay in their
own browser unless they download them. Nothing on the board is private,
so keep the chronicle's secrets off it.

Live shared editing through Firebase is built in but switched off. The
page is public, so before turning it on, protect the database with
sign-in rules; the open rules in the code comments would let anyone
edit or delete the board.

## Pictures

`art/` beside this file is for chronicle artwork — a hero image, band
strips, card art. See `../../../art/README.txt` for the four image slots
and how paths resolve.
