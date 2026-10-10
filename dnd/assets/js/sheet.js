/* =====================================================================
   D&D CAMPAIGNS — character sheet (5th edition)
   ---------------------------------------------------------------------
   sheet.html?c=<slug> shows one adventurer's sheet; sheet.html?npc=<slug>
   an NPC stat sheet (Dungeon Master only, from the npc_sheets table).
   The campaign comes from <body data-campaign="...">.

   Who may change what is decided by the database (dnd/sql/setup.sql):
     - the campaign's members read the sheet;
     - the player tracks hit points, hit dice, death saves, spell slots,
       coins, inventory and notes, and levels up (levelup.html), which
       the DM approves;
     - the DM awards XP or milestone levels and can edit everything.

   Derived numbers (modifiers, proficiency bonus, saves, skills, passive
   Perception, spell save DC and attack, spell slots) are worked out
   here from the sheet; they are never stored.
   Names link to their page on dnd5e.wikidot.com (DND_RULES, rules-5e.js).
   ===================================================================== */
(function () {
  "use strict";

  var CAMPAIGN = document.body.getAttribute("data-campaign") || "";
  var R = window.DND_RULES || {};
  var WIKI = R.wiki || "https://dnd5e.wikidot.com/";
  var ABIL = R.abilities || [["str", "Strength"], ["dex", "Dexterity"], ["con", "Constitution"], ["int", "Intelligence"], ["wis", "Wisdom"], ["cha", "Charisma"]];
  var SKILLS = R.skills || [
    ["acrobatics", "Acrobatics", "dex"], ["animalhandling", "Animal Handling", "wis"], ["arcana", "Arcana", "int"], ["athletics", "Athletics", "str"],
    ["deception", "Deception", "cha"], ["history", "History", "int"], ["insight", "Insight", "wis"], ["intimidation", "Intimidation", "cha"],
    ["investigation", "Investigation", "int"], ["medicine", "Medicine", "wis"], ["nature", "Nature", "int"], ["perception", "Perception", "wis"],
    ["performance", "Performance", "cha"], ["persuasion", "Persuasion", "cha"], ["religion", "Religion", "int"], ["sleightofhand", "Sleight of Hand", "dex"],
    ["stealth", "Stealth", "dex"], ["survival", "Survival", "wis"]].map(function (x) { return { key: x[0], name: x[1], ability: x[2] }; });
  var XP_T = R.xpThresholds || [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];
  var PROF = R.proficiencyBonus || [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6];
  var ALIGN = R.alignments || ["Lawful Good", "Neutral Good", "Chaotic Good", "Lawful Neutral", "True Neutral", "Chaotic Neutral", "Lawful Evil", "Neutral Evil", "Chaotic Evil"];
  var COINS = ["cp", "sp", "ep", "gp", "pp"];

  var db = null;
  var params = new URLSearchParams(window.location.search);
  var NPC = params.has("npc");
  var slug = ((NPC ? params.get("npc") : params.get("c")) || "").toLowerCase();

  var S = { sheet: null, online: false, role: "viewer", session: null, settings: { advancement: "xp", start_level: 1 },
            awards: [], levelups: [], allowed: null, edit: null, saveTimer: null, saving: false, saveFailed: false };

  if (NPC) {
    var back = document.querySelector('.sheet-bar a[href="players.html"]');
    if (back) { back.href = "dm.html"; back.innerHTML = "&larr; DM Screen"; }
    document.querySelectorAll(".tabs a").forEach(function (a) {
      if (a.getAttribute("href") === "dm.html") a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    var kicker = document.querySelector(".hero .kicker");
    if (kicker) kicker.textContent = "NPC stat sheet · Dungeon Master only";
  }

  /* ------------------------------------------------------------ helpers */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function int(v, lo, hi, d) { v = parseInt(v, 10); if (isNaN(v)) v = d == null ? lo : d; return Math.max(lo, Math.min(hi, v)); }
  function signed(n) { return (n >= 0 ? "+" : "−") + Math.abs(n); }
  function mod(score) { return Math.floor((score - 10) / 2); }
  function errText(e) { return (e && e.message) ? e.message : String(e); }
  function fmtDate(iso) { var d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); }
  function same(a, b) { return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase(); }
  function toast(msg) { var t = $("sheetToast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 3200); }
  function setStatus(msg, isError) { var el = $("sheetStatus"); el.textContent = msg || ""; el.classList.toggle("is-error", !!isError); }
  function byName(list, name) { return (list || []).filter(function (x) { return same(x.name, name); })[0] || null; }
  function wikiLink(entry, text) {
    var url = entry && entry.url;
    return url && /^https:\/\/dnd5e\.wikidot\.com\//.test(url)
      ? '<a href="' + esc(url) + '" target="_blank" rel="noopener" title="Open on the wiki">' + esc(text) + "</a>" : esc(text);
  }
  function classRule(key, name) {
    return (R.classes || []).filter(function (c) { return (key && c.key === key) || same(c.name, name); })[0] || null;
  }

  /* --------------------------------------------------------- the sheet */
  function normalise(sheet) {
    var d = sheet.data = sheet.data || {}, p = sheet.play = sheet.play || {};
    ["name", "species", "subspecies", "background", "alignment", "languages", "tools", "armor", "weapons", "size", "features",
     "equipment", "personality", "ideals", "bonds", "flaws", "backstory", "appearance"].forEach(function (k) { d[k] = String(d[k] || ""); });
    d.abilities = d.abilities || {};
    ABIL.forEach(function (a) { d.abilities[a[0]] = int(d.abilities[a[0]], 1, 30, 10); });
    d.classes = (Array.isArray(d.classes) ? d.classes : []).map(function (c) {
      var r = classRule(c.key, c.name);
      return { key: String(c.key || (r && r.key) || ""), name: String(c.name || (r && r.name) || ""), level: int(c.level, 1, 20, 1),
               subclass: String(c.subclass || ""), hitDie: int(c.hitDie || (r && r.hitDie), 4, 12, 8) };
    });
    d.saves = (Array.isArray(d.saves) ? d.saves : []).filter(function (k) { return ABIL.some(function (a) { return a[0] === k; }); });
    d.skills = d.skills || {};
    SKILLS.forEach(function (s) { d.skills[s.key] = int(d.skills[s.key], 0, 2, 0); });
    d.hpMax = int(d.hpMax, 1, 999, 1); d.ac = int(d.ac, 0, 40, 10); d.speed = int(d.speed, 0, 200, 30);
    d.feats = (Array.isArray(d.feats) ? d.feats : []).map(function (f) { return { name: String((f && f.name) || f || "") }; });
    d.spells = (Array.isArray(d.spells) ? d.spells : []).map(function (x) {
      return { name: String(x.name || ""), level: int(x.level, 0, 9, 0), class: String(x.class || ""), prepared: !!x.prepared };
    });
    p.hp = p.hp == null ? d.hpMax : int(p.hp, -999, 999, d.hpMax);
    p.tempHp = int(p.tempHp, 0, 999, 0);
    p.hitDiceUsed = p.hitDiceUsed || {};
    p.deathSaves = p.deathSaves || {}; p.deathSaves.success = int(p.deathSaves.success, 0, 3, 0); p.deathSaves.fail = int(p.deathSaves.fail, 0, 3, 0);
    p.slotsUsed = (Array.isArray(p.slotsUsed) ? p.slotsUsed : []).slice(0, 9).map(function (n) { return int(n, 0, 9, 0); });
    while (p.slotsUsed.length < 9) p.slotsUsed.push(0);
    p.pactUsed = int(p.pactUsed, 0, 9, 0);
    p.inspiration = !!p.inspiration;
    p.coins = p.coins || {}; COINS.forEach(function (c) { p.coins[c] = int(p.coins[c], 0, 9999999, 0); });
    ["conditions", "inventory", "notes"].forEach(function (k) { p[k] = String(p[k] || ""); });
    return sheet;
  }

  function view() { return S.edit || S.sheet; }
  function canPlay() { return S.online && (S.role === "owner" || S.role === "storyteller"); }
  function isDM() { return S.online && S.role === "storyteller"; }
  function level(d) { return d.classes.reduce(function (t, c) { return t + c.level; }, 0) || 0; }
  function prof(d) { return PROF[Math.max(1, Math.min(20, level(d) || 1)) - 1]; }
  function classLine(d) {
    if (!d.classes.length) return "";
    return d.classes.map(function (c) { return c.name + (c.subclass ? " (" + c.subclass + ")" : "") + " " + c.level; }).join(" / ");
  }
  function xpTotal() { return S.awards.reduce(function (t, a) { return t + (a.xp || 0); }, 0); }

  /* Spell slots from the multiclass spellcaster rules. */
  function casting(d) {
    var lv = 0, pact = null, casters = [];
    d.classes.forEach(function (c) {
      var r = classRule(c.key, c.name), sc = r && r.spellcasting;
      if (!sc && r && r.subclasses) {
        var sub = byName(r.subclasses, c.subclass);
        sc = sub && sub.spellcasting;
      }
      if (!sc) return;
      casters.push({ cls: c, rule: r, sc: sc });
      if (sc.progression === "full") lv += c.level;
      else if (sc.progression === "half") lv += Math.floor(c.level / 2);
      else if (sc.progression === "artificer") lv += Math.ceil(c.level / 2);
      else if (sc.progression === "third") lv += Math.floor(c.level / 3);
      else if (sc.progression === "pact") pact = (R.slots && R.slots.pact || [])[c.level - 1] || null;
    });
    var only = casters.length === 1 && casters[0].sc.progression !== "pact" ? casters[0] : null;
    var slots = [];
    if (lv > 0 && R.slots) {
      // A single class uses its own table; multiclassing combines into the full-caster table.
      var table = only && R.slots[only.sc.progression] ? R.slots[only.sc.progression] : R.slots.full;
      slots = (table && table[(only ? only.cls.level : lv) - 1]) || [];
    }
    return { casters: casters, slots: slots, pact: pact };
  }

  /* ------------------------------------------------------------ pieces */
  function field(label, html) { return '<div class="field"><b>' + esc(label) + "</b>" + html + "</div>"; }
  function dataInput(k, opts) {
    var v = view().data[k];
    if (opts) return '<select data-src="data" data-key="' + k + '"><option value="">—</option>' + opts.map(function (o) {
      return "<option" + (o === v ? " selected" : "") + ' value="' + esc(o) + '">' + esc(o) + "</option>"; }).join("") +
      (v && opts.indexOf(v) < 0 ? '<option selected value="' + esc(v) + '">' + esc(v) + "</option>" : "") + "</select>";
    return '<input data-src="data" data-key="' + k + '" value="' + esc(v) + '">';
  }
  function text(src, k, rows, label) {
    var v = view()[src][k], editable = src === "play" ? canPlay() && !S.edit || (S.edit && src === "play") : !!S.edit;
    return editable ? '<textarea data-src="' + src + '" data-key="' + k + '" rows="' + (rows || 4) + '" aria-label="' + esc(label) + '">' + esc(v) + "</textarea>"
                    : '<div class="text-block">' + esc(v) + "</div>";
  }

  function header(d) {
    var sp = byName(R.species, d.species), bg = byName(R.backgrounds, d.background);
    var classesHtml = d.classes.length ? d.classes.map(function (c) {
      var r = classRule(c.key, c.name), sub = r && byName(r.subclasses, c.subclass);
      return wikiLink(r, c.name) + (c.subclass ? " (" + wikiLink(sub, c.subclass) + ")" : "") + " " + c.level;
    }).join(" / ") : "";
    var adv = S.settings.advancement === "milestone" ? "Milestone" : xpTotal().toLocaleString() + " XP";
    if (S.edit) {
      return '<div class="sheet-head"><div class="sheet-band"><strong>Dungeons &amp; Dragons</strong><span>5th edition</span></div><div class="sheet-ident">' +
        field("Name", dataInput("name")) + field("Species", dataInput("species", (R.species || []).map(function (x) { return x.name; }))) +
        field("Subrace", dataInput("subspecies")) + field("Background", dataInput("background", (R.backgrounds || []).map(function (x) { return x.name; }))) +
        field("Alignment", dataInput("alignment", ALIGN)) + field("Size", dataInput("size")) + "</div></div>";
    }
    return '<div class="sheet-head"><div class="sheet-band"><strong>Dungeons &amp; Dragons</strong><span>5th edition</span></div><div class="sheet-ident">' +
      field("Name", '<span class="val">' + esc(d.name) + "</span>") +
      field("Class & level", '<span class="val">' + classesHtml + "</span>") +
      field("Background", '<span class="val">' + wikiLink(bg, d.background) + "</span>") +
      field("Species", '<span class="val">' + wikiLink(sp, d.species) + (d.subspecies ? " (" + esc(d.subspecies) + ")" : "") + "</span>") +
      field("Alignment", '<span class="val">' + esc(d.alignment) + "</span>") +
      field(NPC ? "Level" : "Experience", '<span class="val">' + (NPC ? level(d) : esc(adv)) + "</span>") + "</div></div>";
  }

  function abilities(d) {
    return '<div class="abil-col">' + ABIL.map(function (a) {
      var sc = d.abilities[a[0]];
      return '<div class="abil"><b>' + esc(a[1]) + '</b><span class="mod">' + signed(mod(sc)) + "</span>" +
        (S.edit ? '<input class="score" type="number" min="1" max="30" data-ability="' + a[0] + '" value="' + sc + '" aria-label="' + esc(a[1]) + '">'
                : '<span class="score">' + sc + "</span>") + "</div>";
    }).join("") + "</div>";
  }

  function skillsCol(d) {
    var pb = prof(d), p = view().play;
    var h = '<div class="blk"><div class="box-row">' +
      '<div class="stat"><b>' + (canPlay() && !S.edit ? '<button type="button" class="pip-btn" data-action="inspiration" aria-pressed="' + p.inspiration + '" style="font:inherit;background:none;border:0;cursor:pointer">' + (p.inspiration ? "★" : "☆") + "</button>" : (p.inspiration ? "★" : "☆")) + "</b><span>Inspiration</span></div>" +
      '<div class="stat"><b>' + signed(pb) + "</b><span>Proficiency</span></div></div></div>";
    h += '<div class="blk"><h4>Saving throws</h4><ul class="prof-list">' + ABIL.map(function (a) {
      var on = d.saves.indexOf(a[0]) >= 0, v = mod(d.abilities[a[0]]) + (on ? pb : 0);
      return "<li>" + (S.edit ? '<button type="button" class="pip' + (on ? " on" : "") + '" data-action="save" data-key="' + a[0] + '" aria-label="Proficient in ' + esc(a[1]) + ' saves"></button>'
                              : '<span class="pip' + (on ? " on" : "") + '"></span>') +
        '<span class="val">' + signed(v) + "</span> " + esc(a[1]) + "</li>";
    }).join("") + "</ul></div>";
    h += '<div class="blk"><h4>Skills</h4><ul class="prof-list">' + SKILLS.map(function (s) {
      var lvl = d.skills[s.key], v = mod(d.abilities[s.ability]) + lvl * pb;
      var cls = "pip" + (lvl === 2 ? " exp" : lvl === 1 ? " on" : "");
      return "<li>" + (S.edit ? '<button type="button" class="' + cls + '" data-action="skill" data-key="' + s.key + '" aria-label="' + esc(s.name) + ': ' + ["not proficient", "proficient", "expertise"][lvl] + '"></button>'
                              : '<span class="' + cls + '"></span>') +
        '<span class="val">' + signed(v) + "</span> " + esc(s.name) + " <small>" + esc(s.ability.toUpperCase()) + "</small></li>";
    }).join("") + "</ul>" + (S.edit ? '<p class="xp-hint">Click a dot: proficient, then expertise, then neither.</p>' : "") + "</div>";
    var pp = 10 + mod(d.abilities.wis) + d.skills.perception * pb;
    h += '<div class="passive"><b>' + pp + "</b><span>Passive Wisdom (Perception)</span></div>";
    h += '<div class="blk" style="margin-top:.7rem"><h4>Proficiencies &amp; languages</h4>' +
      (S.edit
        ? field("Armour", dataInput("armor")) + field("Weapons", dataInput("weapons")) + field("Tools", dataInput("tools")) + field("Languages", dataInput("languages"))
        : '<div class="text-block">' + [["Armour", d.armor], ["Weapons", d.weapons], ["Tools", d.tools], ["Languages", d.languages]].filter(function (x) { return x[1]; })
            .map(function (x) { return "<b>" + x[0] + ":</b> " + esc(x[1]); }).join("\n") + "</div>") + "</div>";
    return h;
  }

  function combatCol(d) {
    var p = view().play, play = canPlay() && !S.edit;
    var init = mod(d.abilities.dex);
    var h = '<div class="blk"><div class="box-row">' +
      '<div class="stat"><b>' + (S.edit ? '<input type="number" data-src="data" data-key="ac" data-int value="' + d.ac + '">' : d.ac) + "</b><span>Armour Class</span></div>" +
      '<div class="stat"><b>' + signed(init) + "</b><span>Initiative</span></div>" +
      '<div class="stat"><b>' + (S.edit ? '<input type="number" data-src="data" data-key="speed" data-int value="' + d.speed + '">' : d.speed + " ft") + "</b><span>Speed</span></div></div></div>";
    h += '<div class="blk hp"><h4>Hit points</h4>' +
      '<div class="box-row"><div class="stat"><b>' + (S.edit ? '<input type="number" data-src="data" data-key="hpMax" data-int value="' + d.hpMax + '">' : d.hpMax) + "</b><span>Maximum</span></div>" +
      '<div class="stat"><b class="big">' + p.hp + "</b><span>Current</span></div>" +
      '<div class="stat"><b>' + p.tempHp + "</b><span>Temporary</span></div></div>" +
      (play ? '<div class="ctrl"><input type="number" id="hpAmount" min="0" value="1" aria-label="Amount">' +
              '<button type="button" data-action="damage">Damage</button><button type="button" data-action="heal">Heal</button>' +
              '<button type="button" data-action="temp">Set temporary</button><button type="button" data-action="rest">Long rest</button></div>' : "") + "</div>";
    // hit dice, by die size
    var dice = {};
    d.classes.forEach(function (c) { dice["d" + c.hitDie] = (dice["d" + c.hitDie] || 0) + c.level; });
    h += '<div class="box-row">' +
      '<div class="blk" style="flex:1"><h4>Hit dice</h4>' + (Object.keys(dice).length ? Object.keys(dice).map(function (k) {
        var used = int(p.hitDiceUsed[k], 0, dice[k], 0);
        return '<div class="saves-row" style="justify-content:space-between"><span>' + (dice[k] - used) + " of " + dice[k] + k + "</span>" +
          (play ? '<span><button type="button" class="mini" data-action="hd" data-die="' + k + '" data-n="1" aria-label="Spend one ' + k + '">−</button> <button type="button" class="mini" data-action="hd" data-die="' + k + '" data-n="-1" aria-label="Regain one ' + k + '">+</button></span>' : "") + "</div>";
      }).join("") : '<span class="empty-line">—</span>') + "</div>" +
      '<div class="blk death" style="flex:1"><h4>Death saves</h4>' +
        '<div class="saves-row">Successes ' + deathBoxes("success", p.deathSaves.success, play) + "</div>" +
        '<div class="saves-row">Failures ' + deathBoxes("fail", p.deathSaves.fail, play) + "</div></div></div>";
    // feats and features
    h += '<div class="blk"><h4>Features, traits &amp; feats</h4>';
    if (S.edit) {
      h += '<div class="edit-list">' + d.feats.map(function (f, i) {
        return '<div class="row"><input list="featNames" data-list="feats" data-i="' + i + '" data-field="name" value="' + esc(f.name) + '" aria-label="Feat">' +
          '<button type="button" class="mini" data-action="del-row" data-list="feats" data-i="' + i + '">✕</button></div>';
      }).join("") + '<datalist id="featNames">' + (R.feats || []).map(function (f) { return '<option value="' + esc(f.name) + '">'; }).join("") + "</datalist>" +
        '<p><button type="button" class="mini" data-action="add-row" data-list="feats">+ Feat</button></p></div>' + text("data", "features", 5, "Features");
    } else {
      h += (d.feats.length ? '<div class="tag-list">' + d.feats.map(function (f) { return wikiLink(byName(R.feats, f.name), f.name); }).join("") + "</div>" : "") +
        '<div class="text-block">' + esc(d.features) + "</div>" +
        '<p class="xp-hint">Class and species features: see each class and species on the wiki (the links above).</p>';
    }
    h += "</div>";
    h += '<div class="blk"><h4>Conditions</h4>' + (play ? '<input data-src="play" data-key="conditions" value="' + esc(p.conditions) + '" placeholder="e.g. poisoned, prone">' : '<div class="text-block">' + esc(p.conditions) + "</div>") + "</div>";
    return h;
  }
  function deathBoxes(kind, n, play) {
    var h = '<span class="boxes">';
    for (var i = 1; i <= 3; i++) {
      h += play ? '<button type="button" class="box' + (i <= n ? " on" : "") + '" data-action="death" data-kind="' + kind + '" data-n="' + i + '" aria-label="' + kind + " " + i + '">' + (i <= n ? "●" : "") + "</button>"
                : '<span class="box">' + (i <= n ? "●" : "") + "</span>";
    }
    return h + "</span>";
  }

  function page1() {
    var d = view().data;
    return '<section class="page" aria-label="Character sheet, page one">' + header(d) +
      (S.edit ? classesEditor(d) : "") +
      '<div class="fivee"><div>' + abilities(d) + '</div><div class="col2">' + skillsCol(d) + '</div><div class="col3">' + combatCol(d) + "</div></div></section>";
  }

  function classesEditor(d) {
    var opts = (R.classes || []).map(function (c) { return c.name; });
    return '<h3>Classes</h3><div class="edit-list">' + d.classes.map(function (c, i) {
      return '<div class="row"><select data-list="classes" data-i="' + i + '" data-field="name" aria-label="Class"><option value="">—</option>' +
        opts.map(function (o) { return "<option" + (o === c.name ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") +
        (c.name && opts.indexOf(c.name) < 0 ? "<option selected>" + esc(c.name) + "</option>" : "") + "</select>" +
        '<input class="num" type="number" min="1" max="20" data-list="classes" data-i="' + i + '" data-field="level" value="' + c.level + '" aria-label="Level">' +
        '<input data-list="classes" data-i="' + i + '" data-field="subclass" value="' + esc(c.subclass) + '" placeholder="Subclass" aria-label="Subclass">' +
        '<input class="num" type="number" min="4" max="12" step="2" data-list="classes" data-i="' + i + '" data-field="hitDie" value="' + c.hitDie + '" aria-label="Hit die">' +
        '<button type="button" class="mini" data-action="del-row" data-list="classes" data-i="' + i + '">✕</button></div>';
    }).join("") + '<p><button type="button" class="mini" data-action="add-row" data-list="classes">+ Class</button> <span class="xp-hint">Level, subclass and hit die per class. Players normally change these by levelling up.</span></p></div>';
  }

  /* --------------------------------------------------------- spells */
  function page2() {
    var d = view().data, p = view().play, c = casting(d), pb = prof(d), play = canPlay() && !S.edit;
    if (!c.casters.length && !d.spells.length && !S.edit) return "";
    var h = '<section class="page" aria-label="Spellcasting"><h3 style="margin-top:0">Spellcasting</h3><div class="spell-head">';
    c.casters.forEach(function (x) {
      var m = mod(d.abilities[x.sc.ability] || 10);
      h += '<div class="stat"><b>' + esc(String(x.sc.ability || "").toUpperCase()) + "</b><span>" + esc(x.cls.name) + " ability</span></div>" +
        '<div class="stat"><b>' + (8 + pb + m) + "</b><span>Spell save DC</span></div>" +
        '<div class="stat"><b>' + signed(pb + m) + "</b><span>Spell attack</span></div>";
    });
    h += "</div>";
    if (S.edit) {
      h += '<div class="edit-list" style="margin-top:1rem">' + d.spells.map(function (s, i) {
        return '<div class="row"><input list="spellNames" data-list="spells" data-i="' + i + '" data-field="name" value="' + esc(s.name) + '" aria-label="Spell">' +
          '<input class="num" type="number" min="0" max="9" data-list="spells" data-i="' + i + '" data-field="level" value="' + s.level + '" aria-label="Level">' +
          '<input class="num" data-list="spells" data-i="' + i + '" data-field="class" value="' + esc(s.class) + '" aria-label="Class" style="flex:0 0 7rem">' +
          '<label class="chk"><input type="checkbox" data-list="spells" data-i="' + i + '" data-field="prepared"' + (s.prepared ? " checked" : "") + "> prepared</label>" +
          '<button type="button" class="mini" data-action="del-row" data-list="spells" data-i="' + i + '">✕</button></div>';
      }).join("") + '<datalist id="spellNames">' + (R.spells || []).map(function (s) { return '<option value="' + esc(s.name) + '">'; }).join("") + "</datalist>" +
        '<p><button type="button" class="mini" data-action="add-row" data-list="spells">+ Spell</button></p></div>';
      return h + "</section>";
    }
    var levels = [];
    for (var L = 0; L <= 9; L++) levels.push(L);
    h += '<div class="spell-levels">';
    levels.forEach(function (L) {
      var list = d.spells.filter(function (s) { return s.level === L; });
      var total = L === 0 ? 0 : (c.slots[L - 1] || 0);
      var pactHere = c.pact && c.pact.level === L ? c.pact.slots : 0;
      if (!list.length && !total && !pactHere) return;
      h += '<div class="spell-level"><h4><span>' + (L === 0 ? "Cantrips" : "Level " + L) + "</span>" + slotBoxes(L, total, p.slotsUsed[L - 1] || 0, play) +
        (pactHere ? ' <span title="Pact magic">' + slotBoxes("pact", pactHere, p.pactUsed, play) + "</span>" : "") + "</h4><ul>" +
        (list.length ? list.map(function (s) {
          return "<li>" + wikiLink(byName(R.spells, s.name), s.name) + (L > 0 && s.prepared ? ' <span class="prep">prepared</span>' : "") + "</li>";
        }).join("") : '<li class="empty-line">—</li>') + "</ul></div>";
    });
    h += "</div>";
    if (play) h += '<p class="xp-hint">Click a slot box to mark it used; a long rest clears them.</p>';
    return h + "</section>";
  }
  function slotBoxes(L, total, used, play) {
    if (!total) return "";
    var h = '<span class="slots">';
    for (var i = 1; i <= total; i++) {
      h += play ? '<button type="button" class="slot' + (i <= used ? " used" : "") + '" data-action="slot" data-level="' + L + '" data-n="' + i + '" aria-label="Slot ' + i + '"></button>'
                : '<span class="slot' + (i <= used ? " used" : "") + '"></span>';
    }
    return h + "</span>";
  }

  /* ------------------------------------------------- inventory, story */
  function page3() {
    var d = view().data, p = view().play, play = canPlay() && !S.edit;
    var h = '<section class="page" aria-label="Character sheet, story and equipment"><div class="split"><div>' +
      "<h3 style=\"margin-top:0\">Equipment</h3>" + text("data", "equipment", 5, "Equipment") +
      '<div class="blk" style="margin-top:.7rem"><h4>Coins</h4><div class="coins">' + COINS.map(function (c) {
        return "<label>" + c.toUpperCase() + (play ? '<input type="number" min="0" data-coin="' + c + '" value="' + p.coins[c] + '">' : "<span>" + p.coins[c] + "</span>") + "</label>";
      }).join("") + "</div></div>" +
      "<h3>Inventory</h3>" + (play ? '<textarea data-src="play" data-key="inventory" rows="6">' + esc(p.inventory) + "</textarea>" : '<div class="text-block">' + esc(p.inventory) + "</div>") +
      '</div><div><h3 style="margin-top:0">Personality</h3>' +
      '<div class="labelled"><b>Personality traits</b>' + text("data", "personality", 3, "Personality traits") + "</div>" +
      '<div class="labelled"><b>Ideals</b>' + text("data", "ideals", 2, "Ideals") + "</div>" +
      '<div class="labelled"><b>Bonds</b>' + text("data", "bonds", 2, "Bonds") + "</div>" +
      '<div class="labelled"><b>Flaws</b>' + text("data", "flaws", 2, "Flaws") + "</div>" +
      '<div class="labelled"><b>Appearance</b>' + text("data", "appearance", 3, "Appearance") + "</div></div></div>" +
      "<h3>Backstory</h3>" + text("data", "backstory", 8, "Backstory") +
      "<h3>Notes</h3>" + (play ? '<textarea data-src="play" data-key="notes" rows="6">' + esc(p.notes) + "</textarea>" : '<div class="text-block">' + esc(p.notes) + "</div>");
    return h + "</section>";
  }

  /* --------------------------------------------- experience and levels */
  function xpPanel() {
    if (!S.online || NPC) return "";
    var d = S.sheet.data, lv = level(d), allowed = S.allowed || lv, mile = S.settings.advancement === "milestone";
    var xp = xpTotal(), next = XP_T[Math.min(19, lv)], pending = S.levelups.filter(function (l) { return l.status === "pending"; })[0];
    var h = '<section class="xp-panel" aria-labelledby="xpTitle"><h2 id="xpTitle">' + (mile ? "Levels" : "Experience") + "</h2>" +
      '<div class="xp-stats"><div class="xp-stat"><b>' + lv + "</b><span>Level</span></div>" +
      (mile ? '<div class="xp-stat"><b>' + allowed + "</b><span>May reach</span></div>"
            : '<div class="xp-stat"><b>' + xp.toLocaleString() + "</b><span>XP</span></div>" +
              (lv < 20 ? '<div class="xp-stat"><b>' + next.toLocaleString() + "</b><span>Next level at</span></div>" : "")) +
      '<div class="xp-stat is-key"><b>' + (allowed > lv ? "Yes" : "No") + "</b><span>Level up now</span></div></div>";
    h += '<p class="xp-hint">This campaign uses ' + (mile ? "milestone levelling: the Dungeon Master grants a level when the party reaches a milestone." : "experience points: at each threshold the character may go up a level.") +
      " Levelling up happens step by step on the level-up page, and the Dungeon Master approves it.</p>";
    if (pending) h += '<p><span class="status status-pending">Level ' + pending.to_level + " waiting for the Dungeon Master</span> <a class=\"btn btn--ghost\" href=\"levelup.html?c=" + encodeURIComponent(slug) + '">' + (isDM() ? "Review" : "See it") + "</a></p>";
    h += "<h3>" + (mile ? "Levels granted" : "XP awarded") + "</h3>";
    if (!S.awards.length) h += '<p class="empty-line">Nothing yet.</p>';
    else {
      h += '<table class="xp-table"><tr><th>Date</th><th>For</th><th class="num">' + (mile ? "Levels" : "XP") + "</th><th></th></tr>";
      S.awards.forEach(function (a) {
        var amount = mile ? a.levels : a.xp;
        if (!amount) return;
        h += "<tr><td>" + esc(fmtDate(a.awarded_at)) + "</td><td>" + esc(a.note) + '</td><td class="num">' + (amount > 0 ? "+" : "") + amount.toLocaleString() +
          '</td><td class="acts">' + (isDM() ? '<button class="btn btn--ghost" data-action="del-award" data-id="' + a.id + '">Remove</button>' : "") + "</td></tr>";
      });
      h += "</table>";
    }
    if (isDM()) {
      h += '<form class="xp-form" id="awardForm" style="margin-top:.8rem">' +
        (mile ? '<label>Levels<input class="num" type="number" name="amount" step="1" required value="1"></label>'
              : '<label>XP<input class="num" type="number" name="amount" step="1" required value="100"></label>') +
        '<label>For<input name="note" maxlength="200" placeholder="e.g. Session 5"></label>' +
        '<button class="btn" type="submit">' + (mile ? "Grant" : "Award XP") + "</button></form>";
    }
    var past = S.levelups.filter(function (l) { return l.status !== "pending"; });
    if (past.length) {
      h += '<h3>Level-ups</h3><table class="xp-table"><tr><th>Date</th><th>Level</th><th>Status</th></tr>' + past.map(function (l) {
        return "<tr><td>" + esc(fmtDate(l.requested_at)) + "</td><td>" + l.from_level + " → " + l.to_level + (l.note ? '<span class="note">' + esc(l.note) + "</span>" : "") +
          '</td><td><span class="status status-' + esc(l.status === "approved" ? "approved" : "rejected") + '">' + esc({ approved: "approved", rejected: "sent back", cancelled: "withdrawn" }[l.status] || l.status) + "</span></td></tr>";
      }).join("") + "</table>";
    }
    return h + "</section>";
  }

  /* ------------------------------------------------------------ render */
  function render() {
    if (!S.sheet) return;
    $("sheet").innerHTML = page1() + page2() + page3();
    $("xp").innerHTML = xpPanel();
    var d = view().data, name = d.name || (NPC ? "NPC" : "Character sheet");
    $("sheetTitle").textContent = name;
    document.title = name + (NPC ? " · NPC" : " · Character sheet") + " · " + (document.body.getAttribute("data-campaign-name") || "") + " · VisTectus";
    var lv = level(S.sheet.data), pending = S.levelups.some(function (l) { return l.status === "pending"; });
    var lu = $("btnLevelUp");
    lu.hidden = NPC || !canPlay() || !!S.edit || !(S.allowed > lv) || pending;
    lu.href = "levelup.html?c=" + encodeURIComponent(slug);
    lu.textContent = "Level up to " + (lv + 1);
    $("btnEdit").hidden = !isDM() || !!S.edit;
    $("btnSaveSheet").hidden = !S.edit;
    $("btnCancelEdit").hidden = !S.edit;
    if (!S.saving && !S.saveFailed) setStatus(roleLine());
  }
  function roleLine() {
    if (!S.online) return "";
    if (S.edit) return "Editing the whole sheet: nothing is saved until you press Save sheet.";
    if (NPC) return "Dungeon Master only: players cannot see this sheet.";
    if (S.role === "storyteller") return "Dungeon Master: you can change anything on this sheet.";
    if (S.role === "owner") return "Your adventurer: hit points, slots, coins and notes save as you go.";
    return "";
  }

  /* ------------------------------------------------------------ loading */
  async function fetchSheet() {
    if (NPC) {
      if (S.role !== "storyteller") return "denied";
      var n = await db.from("npc_sheets").select("slug,name,data,play,chronicle").eq("slug", slug).maybeSingle();
      if (n.error) throw n.error;
      if (!n.data || n.data.chronicle !== CAMPAIGN) return false;
      S.sheet = normalise(n.data); S.online = true;
      return true;
    }
    var r = await Promise.all([
      db.from("character_sheets").select("slug,name,data,play,chronicle").eq("slug", slug).maybeSingle(),
      db.from("campaign_settings").select("*").eq("chronicle", CAMPAIGN).maybeSingle(),
      db.from("dnd_awards").select("*").eq("slug", slug).order("awarded_at", { ascending: false }),
      db.from("dnd_levelups").select("id,from_level,to_level,status,note,requested_at,decided_at").eq("slug", slug).order("requested_at", { ascending: false }),
      db.rpc("sheet_role", { p_slug: slug }),
      db.rpc("dnd_allowed_level", { p_slug: slug })
    ]);
    if (r[0].error) throw r[0].error;
    if (!r[0].data || r[0].data.chronicle !== CAMPAIGN) return false;
    S.sheet = normalise(r[0].data);
    if (r[1].data) S.settings = r[1].data;
    S.awards = r[2].data || [];
    S.levelups = r[3].data || [];
    S.role = (!r[4].error && r[4].data) || "viewer";
    S.allowed = r[5].error ? null : r[5].data;
    S.online = true;
    return true;
  }

  async function load() {
    if (!/^[a-z0-9-]{1,40}$/.test(slug)) return notFound();
    setStatus("Opening the sheet…");
    try {
      var got = await fetchSheet();
      if (got === "denied") { $("sheet").innerHTML = '<div class="sheet-notice">NPC sheets are for the Dungeon Master.</div>'; setStatus(""); return; }
      if (!got) return notFound();
    } catch (e) {
      console.error(e);
      setStatus("");
      $("sheet").innerHTML = '<div class="sheet-notice">The sheet could not be reached just now: ' + esc(errText(e)) + "</div>";
      return;
    }
    setStatus("");
    render();
  }
  async function reload() {
    try { await fetchSheet(); } catch (e) { console.error(e); toast("Could not refresh the sheet: " + errText(e)); }
    render();
  }
  function notFound() {
    setStatus("");
    $("sheetTitle").textContent = "No such sheet";
    $("sheet").innerHTML = '<div class="sheet-notice">There is no ' + (NPC ? "NPC sheet" : "character sheet") + ' at this address. Go back to <a href="' + (NPC ? "dm.html" : "players.html") + '">' + (NPC ? "the DM Screen" : "the party") + "</a>.</div>";
  }

  /* ------------------------------------------------------------- saving */
  function savePlaySoon() {
    if (!canPlay() || S.edit) return;
    clearTimeout(S.saveTimer);
    S.saving = true; S.saveFailed = false;
    setStatus("Saving…");
    S.saveTimer = setTimeout(savePlay, 800);
  }
  async function savePlay() {
    try {
      var r = NPC ? await db.from("npc_sheets").update({ play: S.sheet.play, updated_at: new Date().toISOString() }).eq("slug", slug)
                  : await db.rpc("save_play", { p_slug: slug, p_play: S.sheet.play });
      if (r.error) throw r.error;
      S.saving = false; setStatus("Saved.");
      setTimeout(function () { if (!S.saving && !S.saveFailed) setStatus(roleLine()); }, 1500);
    } catch (e) {
      console.error(e); S.saving = false; S.saveFailed = true; setStatus("Not saved: " + errText(e), true);
    }
  }
  async function rpc(fn, args, done) {
    try { var r = await db.rpc(fn, args); if (r.error) throw r.error; if (done) toast(done); }
    catch (e) { console.error(e); window.alert(errText(e)); }
    await reload();
  }

  /* ------------------------------------------------------------ actions */
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-action]");
    if (!b || !S.sheet) return;
    var a = b.getAttribute("data-action"), v = view(), d = v.data, p = v.play;
    var amount = function () { return int(($("hpAmount") || {}).value, 0, 999, 0); };
    if (a === "damage" && canPlay()) {
      var dmg = amount(), fromTemp = Math.min(p.tempHp, dmg);
      p.tempHp -= fromTemp; p.hp = Math.max(0, p.hp - (dmg - fromTemp));
      render(); savePlaySoon();
    } else if (a === "heal" && canPlay()) {
      p.hp = Math.min(d.hpMax, Math.max(0, p.hp) + amount());
      if (p.hp > 0) p.deathSaves = { success: 0, fail: 0 };
      render(); savePlaySoon();
    } else if (a === "temp" && canPlay()) {
      p.tempHp = amount(); render(); savePlaySoon();
    } else if (a === "rest" && canPlay()) {
      if (!window.confirm("Long rest: hit points to maximum, spell slots back, death saves cleared, and half your hit dice regained?")) return;
      p.hp = d.hpMax; p.tempHp = 0; p.slotsUsed = [0, 0, 0, 0, 0, 0, 0, 0, 0]; p.pactUsed = 0; p.deathSaves = { success: 0, fail: 0 };
      var total = Math.max(1, Math.floor(level(d) / 2));
      Object.keys(p.hitDiceUsed).forEach(function (k) { var back = Math.min(total, p.hitDiceUsed[k]); p.hitDiceUsed[k] -= back; total -= back; });
      render(); savePlaySoon();
    } else if (a === "hd" && canPlay()) {
      var die = b.getAttribute("data-die"), n = +b.getAttribute("data-n"), max = 0;
      d.classes.forEach(function (c) { if ("d" + c.hitDie === die) max += c.level; });
      p.hitDiceUsed[die] = int((p.hitDiceUsed[die] || 0) + n, 0, max, 0);
      render(); savePlaySoon();
    } else if (a === "death" && canPlay()) {
      var k = b.getAttribute("data-kind"), dn = +b.getAttribute("data-n");
      p.deathSaves[k] = p.deathSaves[k] === dn ? dn - 1 : dn;
      render(); savePlaySoon();
    } else if (a === "slot" && canPlay()) {
      var L = b.getAttribute("data-level"), sn = +b.getAttribute("data-n");
      if (L === "pact") p.pactUsed = p.pactUsed === sn ? sn - 1 : sn;
      else p.slotsUsed[+L - 1] = p.slotsUsed[+L - 1] === sn ? sn - 1 : sn;
      render(); savePlaySoon();
    } else if (a === "inspiration" && canPlay()) {
      p.inspiration = !p.inspiration; render(); savePlaySoon();
    } else if (a === "save" && S.edit) {
      var key = b.getAttribute("data-key"), at = d.saves.indexOf(key);
      if (at >= 0) d.saves.splice(at, 1); else d.saves.push(key);
      render();
    } else if (a === "skill" && S.edit) {
      var sk = b.getAttribute("data-key"); d.skills[sk] = (d.skills[sk] + 1) % 3; render();
    } else if (a === "add-row" && S.edit) {
      var ln = b.getAttribute("data-list");
      d[ln].push({ classes: { key: "", name: "", level: 1, subclass: "", hitDie: 8 }, feats: { name: "" }, spells: { name: "", level: 0, class: "", prepared: false } }[ln]);
      render();
    } else if (a === "del-row" && S.edit) {
      d[b.getAttribute("data-list")].splice(+b.getAttribute("data-i"), 1); render();
    } else if (a === "del-award") {
      if (window.confirm("Remove this award?")) rpc("dnd_delete_award", { p_id: +b.getAttribute("data-id") }, "Award removed.");
    }
  });

  document.addEventListener("input", function (e) {
    var t = e.target;
    if (!S.sheet) return;
    var v = view();
    if (t.hasAttribute("data-coin")) { if (!canPlay()) return; v.play.coins[t.getAttribute("data-coin")] = int(t.value, 0, 9999999, 0); savePlaySoon(); return; }
    if (t.hasAttribute("data-ability")) { if (!S.edit) return; v.data.abilities[t.getAttribute("data-ability")] = int(t.value, 1, 30, 10); return; }
    if (t.matches("[data-list]")) {
      if (!S.edit || t.type === "checkbox") return;
      var row = v.data[t.getAttribute("data-list")][+t.getAttribute("data-i")], f = t.getAttribute("data-field");
      row[f] = (f === "level" || f === "hitDie") ? int(t.value, 0, 20, 1) : t.value;
      return;
    }
    if (!t.matches("[data-src]")) return;
    var src = t.getAttribute("data-src"), k = t.getAttribute("data-key");
    if (src === "data" && !S.edit) return;
    if (src === "play" && !canPlay()) return;
    v[src][k] = t.hasAttribute("data-int") ? int(t.value, 0, 999, 0) : t.value;
    if (src === "play") savePlaySoon();
  });

  document.addEventListener("change", function (e) {
    var t = e.target;
    if (!S.edit || !S.sheet) return;
    var d = view().data;
    if (t.matches("[data-list]")) {
      var list = t.getAttribute("data-list"), row = d[list][+t.getAttribute("data-i")], f = t.getAttribute("data-field");
      row[f] = t.type === "checkbox" ? t.checked : t.value;
      if (list === "classes" && f === "name") {
        var r = classRule(null, t.value);
        if (r) { row.key = r.key; row.hitDie = r.hitDie || row.hitDie; }
        render();
      }
      if (list === "spells" && f === "name") {
        var sp = byName(R.spells, t.value);
        if (sp) { row.level = sp.level; render(); }
      }
      return;
    }
    if (t.matches("select[data-src]")) { d[t.getAttribute("data-key")] = t.value; render(); }
  });

  document.addEventListener("submit", function (e) {
    if (e.target.id !== "awardForm") return;
    e.preventDefault();
    var f = e.target, n = parseInt(f.amount.value, 10), mile = S.settings.advancement === "milestone";
    if (!n) { window.alert("Give a number other than zero."); return; }
    rpc("dnd_award", { p_slug: slug, p_xp: mile ? 0 : n, p_levels: mile ? n : 0, p_note: f.note.value.trim() },
      mile ? (n > 0 ? "+" : "") + n + " level(s) granted." : (n > 0 ? "+" : "") + n + " XP awarded.");
  });

  /* ---------------------------------------------------- toolbar */
  $("btnEdit").addEventListener("click", function () { S.edit = JSON.parse(JSON.stringify({ data: S.sheet.data, play: S.sheet.play })); render(); });
  $("btnCancelEdit").addEventListener("click", function () { if (window.confirm("Discard your changes to the sheet?")) { S.edit = null; render(); } });
  $("btnSaveSheet").addEventListener("click", async function () {
    var d = S.edit.data;
    d.classes = d.classes.filter(function (c) { return c.name.trim(); });
    d.feats = d.feats.filter(function (f) { return f.name.trim(); });
    d.spells = d.spells.filter(function (s) { return s.name.trim(); });
    setStatus("Saving…");
    try {
      var r = NPC
        ? await db.from("npc_sheets").update({ name: (d.name || "").trim() || S.sheet.name, data: d, play: S.edit.play, updated_at: new Date().toISOString() }).eq("slug", slug)
        : await db.rpc("dnd_save_sheet", { p_slug: slug, p_data: d, p_play: S.edit.play });
      if (r.error) throw r.error;
      S.edit = null; toast("Sheet saved."); await reload();
    } catch (err) { console.error(err); setStatus("Not saved: " + errText(err), true); }
  });
  $("btnPrint").addEventListener("click", function () { window.print(); });
  window.addEventListener("beforeunload", function (e) { if (S.edit || S.saving || S.saveFailed) { e.preventDefault(); e.returnValue = ""; } });

  window.Gate.ready.then(function (g) {
    db = g.db; S.session = g.session;
    if (NPC) S.role = g.role;
    load();
  });
})();
