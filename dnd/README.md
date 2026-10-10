# D&D — how this section works

Dungeons & Dragons 5th edition. Built like the Hunter and Vampire
sections (worlds → campaigns → members-only campaign pages), with D&D
names for things.

| Hunter / Vampire | D&D |
|---|---|
| Chronicle | Campaign |
| Storyteller | Dungeon Master (DM) |
| The cell / The coterie | The Party |
| Hunter / Cainite | Adventurer (character) |
| People | NPCs |
| Documents | Handouts |
| RICO Case / Intrigue Board | Quest Board |
| Storyteller page | DM Screen |
| Spend XP (Storyteller approves) | Level up (DM approves) |
| The rules (Obsidian) | The Rules: dnd5e.wikidot.com (public wiki, linked) |

## Layout

```
dnd/
  index.html                      the worlds
  README.md                       this file
  sql/setup.sql                   D&D tables and functions (run after admin/sql/access.sql)
  assets/                         shared by every campaign (campaign pages read their id
    data/rules-5e.js              from <body data-campaign="...">)
    js/  sheet.js dm.js render.js viewer.js site.js create.js levelup.js
    css/ sheet.css campaign.css
    locations/                    the Locations app (shared code)
    quest-board/                  the Quest Board (shared code)
  shrouded/                       a world
    index.html  world.css  art/
    campaign-one/                 a campaign: id "shrouded-campaign-one"
      index.html                  front page (public)
      players.html                The Party            (members only)
      npcs.html                   NPCs                 (members only)
      resources.html              Handouts, Maps, Locations, Quest Board (members only)
      documents.html  maps.html   Handouts / Maps      (members only)
      sheet.html                  ?c=<slug> character sheet, ?npc=<slug> NPC (DM only)
      create.html                 Create a Character   (members only)
      levelup.html                ?c=<slug> Level up   (the player, members only)
      dm.html                     DM Screen            (the campaign's DMs only)
      login.html                  Log in               (public)
      locations/index.html        Locations            (members only)
      quest-board/index.html      Quest Board          (members only)
      assets/data/  players.js npcs.js documents.js maps.js resources.js
      assets/img/npcs/ assets/img/players/ assets/resources/Documents/ assets/resources/Maps/
  the-last-garden/                a world
    campaign-one/                 id "the-last-garden-campaign-one"
```

Campaign pages set `<body data-campaign="<id>">`; every shared script
reads it from there. Data files define `window.CAMPAIGN_PLAYERS`,
`CAMPAIGN_NPCS`, `CAMPAIGN_DOCUMENTS`, `CAMPAIGN_MAPS`, `CAMPAIGN_RESOURCES`.

Campaign tabs: Campaign (index.html) · The Party (players.html) ·
NPCs (npcs.html) · Resources (resources.html) · Log in (login.html) ·
DM Screen (dm.html). World tabs: Campaigns · Overview · The Rules
(https://dnd5e.wikidot.com/, opens in a new tab).

Members-only pages use the site's gate (`/gate.js`) with
`data-chronicle="<campaign id>"` and `data-dm-label="DM"`; the DM Screen
adds `data-need="storyteller"`. In the database the role is still called
`storyteller`; the pages say Dungeon Master / DM.

## Rules data: `assets/data/rules-5e.js`

`window.DND_RULES` — names, numbers and links only. Descriptions are
never copied: every entry has `url`, a page on https://dnd5e.wikidot.com/.

```js
{
  wiki: "https://dnd5e.wikidot.com/",
  abilities: [["str","Strength"],["dex","Dexterity"],["con","Constitution"],["int","Intelligence"],["wis","Wisdom"],["cha","Charisma"]],
  skills: [{ key: "acrobatics", name: "Acrobatics", ability: "dex" }, ...18],
  alignments: ["Lawful Good", ... 9],
  xpThresholds: [0, 300, 900, ... 355000],          // index = level - 1
  proficiencyBonus: [2,2,2,2,3, ... 6],              // index = level - 1
  pointBuy: { budget: 27, min: 8, max: 15, cost: { "8":0,"9":1,"10":2,"11":3,"12":4,"13":5,"14":7,"15":9 } },
  species: [{ name, source, url, size, speed, subraces: [{ name, url }] }],
  backgrounds: [{ name, source, url, skills: ["insight","religion"], tools: "", languages: 0 }],
  feats: [{ name, source, url, prerequisite: "" }],
  classes: [{
    key: "wizard", name: "Wizard", source, url, hitDie: 6,
    saves: ["int","wis"], skillChoices: { count: 2, from: ["arcana", ...] },   // from: "any" for any skill
    armor: "", weapons: "", tools: "",
    subclassLevel: 2, subclassLabel: "Arcane Tradition",
    asiLevels: [4,8,12,16,19],
    multiclass: { requires: { int: 13 }, any: false },   // any: true = one of the listed abilities is enough
    spellcasting: null | {
      ability: "int", progression: "full" | "half" | "third" | "artificer" | "pact",
      type: "known" | "prepared" | "spellbook",
      cantrips: [20 numbers], known: [20 numbers] | null,
      prepared: "ability+level" | "ability+half" | null
    },
    subclasses: [{ name, source, url }]
  }],
  spells: [{ name, level, school, classes: ["wizard","sorcerer"], ritual, concentration, source, url }],
  slots: { full: [[9 numbers] x 20], half: [...], third: [...], artificer: [...],
           pact: [{ slots, level } x 20] }
}
```

## Character sheet data (`character_sheets.data` / `.play`, and drafts)

```js
data: {
  name, species, subspecies, background, alignment,
  classes: [{ key, name, level, subclass, hitDie }],   // first = starting class; level = sum of levels
  abilities: { str, dex, con, int, wis, cha },        // final scores
  saves: ["int","wis"],                               // from the starting class
  skills: { acrobatics: 0|1|2, ... all 18 },          // 1 proficient, 2 expertise
  languages: "", tools: "", armor: "", weapons: "",
  hpMax, ac, speed, size,
  feats: [{ name }], features: "",                    // features: the DM's/player's notes
  spells: [{ name, level, class, prepared }],         // class = class key that grants it
  equipment: "", personality: "", ideals: "", bonds: "", flaws: "", backstory: "", appearance: "",
  _creation: { ... }                                   // the wizard's own record (dropped on approval)
}
play: { hp, tempHp, hitDiceUsed: { "d8": 0 }, deathSaves: { success: 0, fail: 0 },
        slotsUsed: [0,0,0,0,0,0,0,0,0], pactUsed: 0, inspiration: false, conditions: "",
        coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }, inventory: "", notes: "" }
```

## Database (`sql/setup.sql`, after `admin/sql/access.sql`)

- `campaign_settings (chronicle, advancement 'xp'|'milestone', start_level)` — the DM chooses.
- `dnd_awards (id, slug, xp, levels, note, awarded_at)` — XP (XP campaigns) or levels (milestone).
- `dnd_levelups (id, slug, from_level, to_level, data, status, note, requested_at, decided_at)`.
- Functions:
  `dnd_allowed_level(p_slug)` → the level the character may reach now;
  `dnd_request_levelup(p_slug, p_data)` (the player: full new `data`, one level higher);
  `dnd_close_levelup(p_id, p_note)` (player withdraws / DM rejects);
  `dnd_approve_levelup(p_id, p_note)` (DM: the sheet's data becomes the proposal);
  `dnd_award(p_slug, p_xp, p_levels, p_note)`, `dnd_delete_award(p_id)`;
  `dnd_set_advancement(p_chronicle, p_mode, p_start_level)`;
  `dnd_save_sheet(p_slug, p_data, p_play)`, `dnd_create_sheet(p_slug, p_chronicle, p_name)`, `dnd_delete_sheet(p_slug)`.
- Shared with the other games (access.sql): `save_play`, `sheet_role`, drafts
  (`save_draft`, `submit_draft`, `withdraw_draft`, `delete_draft`, `approve_draft`,
  `reject_draft`), members, NPC sheets (`npc_sheets`), hidden lists, boards, locations.

## Character creation (create.html) — the rules enforced

1. Concept: name, species (and subrace where it has them), alignment.
2. Class at level 1 (and subclass if the class takes it at level 1).
3. Ability scores: point buy (27 points, 8–15) or 4d6 drop the lowest,
   rolled once and recorded; then the origin increase (+2 and +1, or +1 +1 +1),
   no score above 20.
4. Background: its two skills.
5. Skills: the class's number of choices from its list (a skill already
   given by the background can be swapped for any skill); saving throws
   from the class.
6. Spells, for casters at level 1: cantrips and spells as the class allows.
7. Hit points (hit die maximum + Constitution modifier), AC, speed, equipment.
8. Details: personality, ideals, bonds, flaws, backstory, appearance, languages and tools.
9. Review → sent to the DM, who approves it into a sheet or sends it back.

## Levelling up (levelup.html)

When the character may go up a level (XP threshold reached, or the DM
granted a milestone level), the player levels up step by step: class
(or a new class, with the multiclass requirements), hit points (roll
once, or take the average) plus Constitution, subclass at its level,
ability score increase or feat at its levels, new cantrips and spells.
The request goes to the DM, who approves it onto the sheet.
