# VisTectus

The source of [vistectus.com](https://vistectus.com): a hub for
tabletop worlds and the chronicles played in them. A static site on
GitHub Pages; accounts, members-only content and everything added from
the site live in a Supabase project.

**Everything in this repository is public**, comments included: GitHub
Pages publishes every file (`.nojekyll`). Storyteller material, players'
details and anything else that must stay private go in `private/`
(ignored by git, never committed) or in the database through the
Builder's workshop, never in the site's files.

## Where things are

```
index.html, style.css            the hub and the site-wide look
404.html, router.js              pages for worlds and chronicles made with the Builder
gate.js, content.js, login.js,   site-wide modules (members' gate, database content,
members.js, world.js, ...        Sign in, members lists, world pages)
shared/                          used by every system: the Resources list, the
                                 handout/map page look, the blank portrait, the
                                 real-map Locations app
htr/  vtda/  dnd/                Hunter: The Reckoning, Vampire: The Dark Ages, D&D 5e
  assets/                        that system's shared code (sheets, rosters, boards, ...)
  _world/                        templates for that system's Builder-made worlds
  <world>/                       a world in the site's files
    <chronicle>/                 a chronicle (D&D: a campaign) in the site's files
builders/                        the Builder: build a world, the workshop, the file drop
admin/                           the site admin's page and admin/sql/access.sql
tools/                           set-version.py (cache markers, see below)
art/                             site-wide pictures (art/README.txt: how pictures work)
private/                         on your computer only (see above)
```

## Documentation

| Read | For |
|---|---|
| [builders/README.md](builders/README.md) | **Start here**: one-time Supabase setup (SQL files in order), inviting builders, approving worlds, the workshop |
| [builders/ARCHITECTURE.md](builders/ARCHITECTURE.md) | how worlds, chronicles, templates, the router and the shared modules fit together |
| [htr/brooklyn/dead-hand/README.md](htr/brooklyn/dead-hand/README.md) | the Dead Hand chronicle: sheets, XP, boards, Locations |
| [vtda/hungary-1242/crown-of-ice-and-bone/README.md](vtda/hungary-1242/crown-of-ice-and-bone/README.md) | A Crown of Ice and Bone, and the Vampire rules from Obsidian |
| [dnd/README.md](dnd/README.md) | the D&D section: campaigns, sheets, levelling, the rules data |
| [art/README.txt](art/README.txt) | where pictures go and how pages use them |

## Working on the site

- After changing any script or stylesheet, run `python tools/set-version.py`
  from this folder: every page then carries the same new `?v=` marker,
  so browsers fetch the new copies.
- Card pictures are 16:9, portraits 3:4.
- Test pages through a local web server (pictures set with `--art` and
  `--hero` need one); opening files from disk does not work.
