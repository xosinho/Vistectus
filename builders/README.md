# The Builder — setup and day-to-day use

The Builder is where new worlds and chronicles are made, and where each
Storyteller or Dungeon Master keeps adding to their chronicle as it goes
on. How it all fits together (tables, templates, the 404 router) is in
[ARCHITECTURE.md](ARCHITECTURE.md); this page is the practical side.

```
builders/index.html       sign in (builders, Storytellers, DMs, the site admin)
builders/dashboard.html   your worlds and chronicles, and "Build a new world"
builders/build.html       the guided wizard for a new world and its first chronicle
builders/workshop.html    add factions, NPCs, handouts, maps, places, links as play goes on
admin/                    the site admin: approvals, builders, members of every chronicle
```

## Where the security is

Not in these pages. A static site cannot keep a secret: anything the
browser runs, a visitor can read and change. Who may do what is decided
by Supabase, on its servers:

- **Who can sign in**: only emails the database already knows (a builder,
  a member of a chronicle, a site admin). The sign-up check
  `hook_before_user_created` refuses everyone else.
- **What each person can see and change**: the row-level rules in the
  SQL files. A builder edits only their own worlds; a Storyteller/DM only
  their own chronicles; a world in the making is visible only to the
  people making it, until the site admin approves it.

The anon key in `config.js` is designed to be public. The `service_role`
key is not: never put it in any file in this repository.

## One-time setup in Supabase

1. **SQL Editor**: run these files, in this order (each can be run again
   safely):
   1. `admin/sql/access.sql`
   2. `vtda/hungary-1242/crown-of-ice-and-bone/assets/sql/setup.sql`
   3. `dnd/sql/setup.sql`
   4. `builders/sql/world-builder.sql` (last: it builds on the others)
2. **Make yourself the site admin** (once), in the SQL Editor:
   `insert into public.site_admins (email) values ('you@example.com');`
   with your own email in place of the example.
3. **Authentication → Hooks**: add a *Before User Created* hook, type
   Postgres, function `public.hook_before_user_created`.
4. **Authentication → Sign In / Providers**: Email on, and *Allow new
   users to sign up* **on**. (The hook above decides who actually may.)
5. **Authentication → URL Configuration**: Site URL
   `https://vistectus.com`; Redirect URLs `https://vistectus.com/**`, so a
   sign-in link can bring people back to any page.
6. **Before real use**: Supabase's built-in email sender allows only a
   few messages an hour. Set up your own under **Authentication → Emails
   → SMTP Settings** before inviting more than a handful of people.

## Day to day

- **Inviting a builder**: on the Admin page (`vistectus.com/admin/`),
  under *Builders*, add their email. That is the invitation: let them
  know, and they sign in at `vistectus.com/builders/` with a link sent to
  that address. Nothing is emailed when you add them.
- **A builder makes a world**: *Build a new world* walks them through it:
  the system (Hunter, Vampire, D&D); the world's name, tagline, overview
  and card picture; its factions, in the factions-page format; which
  Creeds / Clans / races and classes are available, each linked to the
  system's wiki; the first chronicle or campaign; NPCs to begin with; and
  handouts, maps and places to begin with. Pictures are cropped in the
  browser: **card pictures 16:9, portraits of PCs and NPCs 3:4**.
  Everything is saved as a draft as they go, and stays private.
- **Approving**: when they press *Send for approval*, the world appears
  on the Admin page under *Waiting for approval*. *Open it* shows it as it
  will look (you are signed in, so you can see it). *Approve* publishes
  the world and the chronicles sent with it; *Send back* returns it to
  the builder with your note.
- **The builder runs the chronicle**: they become its Storyteller/DM at
  once. They add players on their Storyteller page or DM Screen, and keep
  adding NPCs, handouts, maps, places and factions in the **workshop**,
  linked from the top of every Storyteller page and DM Screen. Those
  additions need no approval: the chronicle is already approved, and
  they are members-only.
- **The worlds in the site's files** (Brooklyn, Hungary 1242, Shrouded,
  The Last Garden) work the same way from the workshop: what is added
  there appears on their pages next to what the files hold.
- **A new chronicle in an existing world**: a Storyteller of that world
  can add one from their dashboard; it waits for your approval like a
  new world.

## The file drop

The dashboard still has the older *Upload a file* box (bucket
`builder-uploads`, table `builder_uploads`, set up earlier) for anything
that does not fit the workshop. Those files never appear on the site by
themselves: download what you want from **Storage → builder-uploads** and
place it in the site's files.

## Also used by the case boards

The Dead Hand **RICO Case** board and every chronicle's board (Case Board,
Intrigue Board, Quest Board) save to the same project; their setup is
part of `admin/sql/access.sql`.
