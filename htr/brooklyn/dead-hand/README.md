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
JSON sheet-> assets/sheets/json/
PDF sheet -> assets/sheets/pdf/
```

Any field but `name` may be left out. No portrait falls back to
`assets/img/placeholder.svg`; no sheet paths hides the download row;
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
| `compendium.html` | The compendium, in an isolated frame |

## The compendium

Replace `assets/compendium/compendium.html` with the real document,
keeping the filename. It is embedded in an iframe so its own styling
stays sealed off from the site.

## Pictures

`art/` beside this file is for chronicle artwork — a hero image, band
strips, card art. See `../../../art/README.txt` for the four image slots
and how paths resolve.
