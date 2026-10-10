/* =====================================================================
   D&D 5e — Create a Character (shared by every campaign)
   ---------------------------------------------------------------------
   create.html walks a player through making a level 1 adventurer, step
   by step, and keeps the result as a draft in the character_drafts
   table:

     create.html               your drafts (and, for the Dungeon Master,
                               the drafts waiting for approval)
     create.html?new=1         a new adventurer
     create.html?draft=<id>    carry on with a draft
     create.html?review=<id>   a draft read-only, with every rule checked
                               again here; the Dungeon Master approves it
                               or sends it back from this view

   The campaign comes from <body data-campaign="..."> (its name from
   data-campaign-name). The draft's data/play are a complete sheet in
   the shape described in dnd/README.md, plus data._creation: this
   page's own record of the choices (the point buy or the dice rolled,
   the origin increase, the skills and spells picked...). Everything on
   the sheet is rebuilt from that record, so the Dungeon Master's review
   can check that the two still agree, and that every rule holds, even
   if the draft was written by something other than this page.

   Drafts are only written through the database's functions (save_draft,
   submit_draft, withdraw_draft, delete_draft, approve_draft,
   reject_draft). This page waits for the members' gate (gate.js) and
   uses its Supabase client.

   Names, numbers and links come from ../assets/data/rules-5e.js
   (window.DND_RULES). No rules text is copied here: names link to their
   page on https://dnd5e.wikidot.com/ (new tab).
   ===================================================================== */
(function () {
  "use strict";

  if (!window.Gate) return;

  var BODY = document.body;
  var CAMPAIGN = BODY.getAttribute("data-campaign") || "";
  var CAMPAIGN_NAME = BODY.getAttribute("data-campaign-name") || "the campaign";
  var R = window.DND_RULES || {};
  ["abilities", "skills", "alignments", "species", "backgrounds", "feats", "classes", "spells", "proficiencyBonus"].forEach(function (k) {
    if (!Array.isArray(R[k])) R[k] = [];
  });
  if (!R.pointBuy) R.pointBuy = { budget: 27, min: 8, max: 15, cost: { "8": 0, "9": 1, "10": 2, "11": 3, "12": 4, "13": 5, "14": 7, "15": 9 } };
  if (!R.slots) R.slots = {};
  var WIKI = R.wiki || "https://dnd5e.wikidot.com/";
  var PAGE = (window.location.pathname.split("/").pop() || "create.html");

  var ABILS = R.abilities.length ? R.abilities : [["str", "Strength"], ["dex", "Dexterity"], ["con", "Constitution"], ["int", "Intelligence"], ["wis", "Wisdom"], ["cha", "Charisma"]];
  var AKEYS = ABILS.map(function (a) { return a[0]; });
  var ANAME = {};
  ABILS.forEach(function (a) { ANAME[a[0]] = a[1]; });
  var SKILLS = R.skills;
  var SKEYS = SKILLS.map(function (s) { return s.key; });
  var SNAME = {};
  SKILLS.forEach(function (s) { SNAME[s.key] = s.name; });

  var STANDARD_CLASSES = ["artificer", "barbarian", "bard", "cleric", "druid", "fighter", "monk", "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard"];
  var DICE = [6, 8, 10, 12];
  var BOOK_AT_1 = 6;                                  // a wizard's spellbook at level 1
  var EXPERTISE = { rogue: { 1: 2, 6: 2 }, bard: { 3: 2, 10: 2 } };   // class level: skills gaining expertise

  var STEPS = ["Concept", "Class", "Ability scores", "Background", "Skills", "Spells", "Hit points & gear", "Details", "Review"];
  var REVIEW = STEPS.length - 1;
  var STATUS = { draft: "Draft", submitted: "Waiting for the Dungeon Master", rejected: "Sent back", approved: "Approved" };

  var S = {
    db: null, role: "player", email: "",
    mode: "list", row: null, id: null, status: "draft",
    d: null, w: null,
    saveChain: Promise.resolve(true), saving: false, dirty: false, flash: false, filters: {}
  };

  /* ------------------------------------------------------------ helpers */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function int(v, def, min, max) {
    v = parseInt(v, 10);
    if (isNaN(v)) v = def;
    return Math.max(min, Math.min(max, v));
  }
  function str(v, max) { return typeof v === "string" ? v.slice(0, max || 200) : ""; }
  function trim(v) { return String(v == null ? "" : v).trim(); }
  function same(a, b) { return trim(a).toLowerCase() === trim(b).toLowerCase(); }
  function obj(v) { return (v && typeof v === "object" && !Array.isArray(v)) ? v : {}; }
  function strList(v, n, max) {
    var out = [];
    (Array.isArray(v) ? v : []).slice(0, n).forEach(function (x) { x = str(x, max); if (x && out.indexOf(x) < 0) out.push(x); });
    return out;
  }
  function errText(e) { return (e && e.message) ? e.message : String(e); }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); }
  function list(names) {
    if (names.length < 2) return names.join("");
    return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
  }
  function signed(n) { return (n >= 0 ? "+" : "−") + Math.abs(n); }
  function mod(score) { return Math.floor((int(score, 10, 0, 40) - 10) / 2); }
  function fmtDate(iso) {
    var d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }
  function fmtDateTime(iso) {
    var d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  function toast(msg) {
    var t = $("sheetToast");
    if (!t) return;
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { t.hidden = true; }, 3600);
  }
  function setStatus(msg, isError) {
    var el = $("sheetStatus");
    if (!el) return;
    el.textContent = msg || "";
    el.classList.toggle("is-error", !!isError);
  }
  // A name linked to its page on the wiki (new tab); plain text otherwise.
  function wiki(url, text) {
    return url && /^https?:\/\/(www\.)?dnd5e\.wikidot\.com\//i.test(String(url))
      ? '<a href="' + esc(url) + '" target="_blank" rel="noopener" title="Open on dnd5e.wikidot.com (new tab)">' + esc(text) + "</a>" : esc(text);
  }
  function findByName(arr, name) { return trim(name) ? (arr || []).filter(function (x) { return same(x.name, name); })[0] || null : null; }
  function canon(v) {
    if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
    if (v && typeof v === "object") return "{" + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ":" + canon(v[k]); }).join(",") + "}";
    return JSON.stringify(v === undefined ? null : v);
  }
  function randInt(n) { return 1 + Math.floor(crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296 * n); }

  /* ------------------------------------------------------- rules data */
  function classOf(key) { return trim(key) ? R.classes.filter(function (c) { return c.key === key; })[0] || null : null; }
  function speciesOf(d) { return findByName(R.species, d.species); }
  function subraceOf(sp, name) { return sp ? findByName(sp.subraces || [], name) : null; }
  function backgroundOf(d) { return findByName(R.backgrounds, d.background); }
  function spellOf(name) { return findByName(R.spells, name); }
  function sizeOptions(sp) {
    if (!sp || !sp.size) return [];
    return String(sp.size).split(/\s+or\s+|\s*\/\s*|\s*,\s*/i).map(trim).filter(Boolean);
  }
  function skillFrom(c) {
    if (!c || !c.skillChoices) return [];
    return c.skillChoices.from === "any" || !Array.isArray(c.skillChoices.from) ? SKEYS.slice() : c.skillChoices.from.filter(function (k) { return SNAME[k]; });
  }
  function skillCount(c) { return c && c.skillChoices ? int(c.skillChoices.count, 0, 0, 18) : 0; }

  // Spell slots for one class on its own, at a class level.
  function classSlotRow(c, lvl) {
    var sc = c && c.spellcasting;
    if (!sc || lvl < 1) return null;
    if (sc.progression === "pact") {
      var p = (R.slots.pact || [])[lvl - 1];
      return p ? { pact: true, slots: int(p.slots, 0, 0, 9), level: int(p.level, 0, 0, 9) } : null;
    }
    var t = (R.slots[sc.progression] || [])[lvl - 1];
    return Array.isArray(t) ? { pact: false, row: t } : null;
  }
  function maxSpellLevel(c, lvl) {
    var r = classSlotRow(c, lvl);
    if (!r) return 0;
    if (r.pact) return r.slots > 0 ? r.level : 0;
    var m = 0;
    r.row.forEach(function (n, i) { if (n > 0) m = i + 1; });
    return m;
  }
  function cantripsAt(c, lvl) { var sc = c && c.spellcasting; return sc && Array.isArray(sc.cantrips) ? int(sc.cantrips[lvl - 1], 0, 0, 20) : 0; }
  function knownAt(c, lvl) { var sc = c && c.spellcasting; return sc && Array.isArray(sc.known) ? int(sc.known[lvl - 1], 0, 0, 40) : 0; }
  function preparedAt(c, lvl, abilities) {
    var sc = c && c.spellcasting;
    if (!sc || !sc.prepared || maxSpellLevel(c, lvl) < 1) return 0;
    var m = mod(abilities[sc.ability]);
    return Math.max(1, m + (sc.prepared === "ability+half" ? Math.floor(lvl / 2) : lvl));
  }
  function classSpells(c, minL, maxL) {
    if (!c) return [];
    return R.spells.filter(function (s) {
      return Array.isArray(s.classes) && s.classes.indexOf(c.key) >= 0 && s.level >= minL && s.level <= maxL;
    }).sort(function (a, b) { return a.level - b.level || (a.name < b.name ? -1 : 1); });
  }
  function onClassList(c, name, minL, maxL) {
    var s = spellOf(name);
    return !!s && Array.isArray(s.classes) && s.classes.indexOf(c.key) >= 0 && s.level >= minL && s.level <= maxL;
  }
  // What a class asks for at level 1.
  function spellNeeds(c, abilities) {
    var sc = c && c.spellcasting, n = { cantrips: 0, known: 0, book: 0, prepared: 0, maxLevel: 0, type: sc ? sc.type : "" };
    if (!sc) return n;
    n.maxLevel = maxSpellLevel(c, 1);
    n.cantrips = cantripsAt(c, 1);
    if (sc.type === "known") n.known = n.maxLevel >= 1 ? knownAt(c, 1) : 0;
    else if (sc.type === "spellbook") { n.book = n.maxLevel >= 1 ? BOOK_AT_1 : 0; n.prepared = preparedAt(c, 1, abilities); }
    else n.prepared = preparedAt(c, 1, abilities);
    return n;
  }

  /* -------------------------------------------- the wizard's record */
  // Coerce a saved record into a safe shape: never trust it, it may
  // have been written by something other than this page.
  function normW(raw) {
    var w = obj(raw), pb = obj(w.pointBuy), asg = obj(w.assign), og = obj(w.origin), sw = obj(w.bgSwap);
    var o = {
      version: 1,
      step: int(w.step, 0, 0, REVIEW),
      method: w.method === "roll" || w.method === "pointbuy" ? w.method : "",
      pointBuy: {}, rolls: null, assign: {},
      origin: { mode: og.mode === "1-1-1" ? "1-1-1" : "2-1", a: [0, 1, 2].map(function (i) { var v = Array.isArray(og.a) ? og.a[i] : ""; return AKEYS.indexOf(v) >= 0 ? v : ""; }) },
      bgSwap: {},
      classSkills: strList(w.classSkills, 18, 40),
      expertise: strList(w.expertise, 6, 40),
      cantrips: strList(w.cantrips, 12, 80),
      spells: strList(w.spells, 40, 80),
      prepared: strList(w.prepared, 40, 80),
      acCustom: w.acCustom === true,
      acNote: str(w.acNote, 200),
      toolsSet: w.toolsSet === true,
      bgChoice: strList(w.bgChoice, 6, 40)
    };
    AKEYS.forEach(function (k) { o.pointBuy[k] = int(pb[k], 8, 1, 30); o.assign[k] = int(asg[k], -1, -1, 5); });
    if (w.rolls && typeof w.rolls === "object" && Array.isArray(w.rolls.sets)) {
      o.rolls = {
        sets: w.rolls.sets.slice(0, 6).map(function (s) { return (Array.isArray(s) ? s : []).slice(0, 4).map(function (x) { return int(x, 1, 1, 6); }); }),
        rolledAt: str(w.rolls.rolledAt, 40)
      };
    }
    Object.keys(sw).slice(0, 4).forEach(function (k) { var v = str(sw[k], 40); if (SNAME[k] && v) o.bgSwap[k] = v; });
    return o;
  }

  function rollTotal(set) {
    if (!Array.isArray(set) || set.length !== 4) return 0;
    var s = set.slice().sort(function (a, b) { return a - b; });
    return s[1] + s[2] + s[3];
  }
  function originBonus(w) {
    var b = {};
    AKEYS.forEach(function (k) { b[k] = 0; });
    var a = w.origin.a;
    if (w.origin.mode === "2-1") { if (a[0]) b[a[0]] += 2; if (a[1]) b[a[1]] += 1; }
    else a.forEach(function (k) { if (k) b[k] += 1; });
    return b;
  }

  /* ---------------------------------------------- derived figures */
  function compute(d, w) {
    var info = { c: classOf(d.cls), sp: speciesOf(d), bg: backgroundOf(d) };
    info.sub = subraceOf(info.sp, d.subspecies);
    info.base = {}; info.bonus = originBonus(w); info.final = {};
    info.spent = 0;
    AKEYS.forEach(function (k) {
      var b = 0;
      if (w.method === "pointbuy") { b = w.pointBuy[k]; info.spent += pbCost(b); }
      else if (w.method === "roll" && w.rolls && w.assign[k] >= 0) b = rollTotal(w.rolls.sets[w.assign[k]]);
      info.base[k] = b;
      info.final[k] = b + info.bonus[k];
    });
    info.left = int(R.pointBuy.budget, 27, 0, 99) - info.spent;
    var c = info.c;
    // skills
    var bgFixed = info.bg && Array.isArray(info.bg.skills) ? info.bg.skills.filter(function (k) { return SNAME[k]; }) : [];
    info.bgFixed = bgFixed;
    info.bgChoice = bgChoiceOf(info.bg);
    // the skills the background gives: its fixed ones and the ones chosen from its list
    var bgSkills = bgFixed.concat(info.bgChoice ? w.bgChoice.filter(function (k, i) { return SNAME[k] && bgFixed.indexOf(k) < 0 && w.bgChoice.indexOf(k) === i; }) : []);
    info.bgSkills = bgSkills;
    info.bgEffective = bgSkills.map(function (k) { return w.bgSwap[k] && SNAME[w.bgSwap[k]] ? w.bgSwap[k] : k; });
    info.skills = {};
    SKEYS.forEach(function (k) { info.skills[k] = 0; });
    info.bgEffective.forEach(function (k) { info.skills[k] = 1; });
    w.classSkills.forEach(function (k) { if (SNAME[k]) info.skills[k] = 1; });
    var nExp = c && EXPERTISE[c.key] ? EXPERTISE[c.key][1] || 0 : 0;
    info.expertiseCount = nExp;
    if (nExp) w.expertise.forEach(function (k) { if (info.skills[k] === 1) info.skills[k] = 2; });
    // hit points, armour class, speed, size
    var cm = mod(info.final.con), dm = mod(info.final.dex);
    info.conMod = cm; info.dexMod = dm;
    // a class without a hit die in the rules data: the one agreed with the DM
    info.die = !c ? 0 : c.hitDie ? int(c.hitDie, 8, 4, 12) : DICE.indexOf(int(d.hitDie, 0, 0, 20)) >= 0 ? int(d.hitDie, 0, 0, 20) : 0;
    info.hpMax = c && info.die ? Math.max(1, info.die + cm) : 0;
    info.acDefault = 10 + dm;
    info.ac = w.acCustom ? int(d.ac, info.acDefault, 0, 40) : info.acDefault;
    info.speed = info.sub && info.sub.speed ? int(info.sub.speed, 30, 0, 120) : info.sp ? int(info.sp.speed, 30, 0, 120) : 0;
    var sizes = sizeOptions(info.sp);
    info.sizes = sizes;
    info.size = sizes.length > 1 ? (sizes.filter(function (s) { return same(s, d.size); })[0] || "") : (sizes[0] || "");
    info.needs = spellNeeds(c, info.final);
    return info;
  }
  function bgChoiceOf(bg) {
    var ch = bg && bg.skillChoice;
    if (!ch || !int(ch.count, 0, 0, 18)) return null;
    var from = ch.from === "any" || !Array.isArray(ch.from) ? SKEYS.slice() : ch.from.filter(function (k) { return SNAME[k]; });
    return { count: int(ch.count, 0, 0, 18), from: from, any: ch.from === "any" };
  }
  function pbCost(score) {
    var c = R.pointBuy.cost[String(score)];
    return c == null ? 99 : c;
  }

  // The sheet itself, in the shape of dnd/README.md, rebuilt from the record.
  function buildSheet(d, w) {
    var info = compute(d, w), c = info.c;
    var spells = [];
    if (c && c.spellcasting) {
      var t = c.spellcasting.type;
      w.cantrips.forEach(function (n) { var s = spellOf(n); spells.push({ name: s ? s.name : n, level: 0, class: c.key, prepared: true }); });
      w.spells.forEach(function (n) {
        var s = spellOf(n);
        spells.push({ name: s ? s.name : n, level: s ? s.level : 1, class: c.key, prepared: t === "spellbook" ? w.prepared.indexOf(n) >= 0 : true });
      });
    }
    var tools = trim(d.tools);
    var data = {
      name: trim(d.name), species: trim(d.species), subspecies: trim(d.subspecies), background: trim(d.background), alignment: trim(d.alignment),
      classes: c ? [{ key: c.key, name: c.name, level: 1, subclass: trim(d.subclass), hitDie: info.die || 8 }] : [],
      abilities: JSON.parse(JSON.stringify(info.final)),
      saves: c && Array.isArray(c.saves) ? c.saves.slice() : [],
      skills: JSON.parse(JSON.stringify(info.skills)),
      languages: trim(d.languages), tools: tools,
      armor: c ? str(c.armor, 400) : "", weapons: c ? str(c.weapons, 400) : "",
      hpMax: info.hpMax, ac: info.ac, speed: info.speed, size: info.size,
      feats: trim(d.feat) ? [{ name: (findByName(R.feats, d.feat) || { name: trim(d.feat) }).name }] : [],
      features: "",
      spells: spells,
      equipment: trim(d.equipment), personality: trim(d.personality), ideals: trim(d.ideals), bonds: trim(d.bonds),
      flaws: trim(d.flaws), backstory: trim(d.backstory), appearance: trim(d.appearance),
      _creation: w
    };
    var hd = {};
    if (c) hd["d" + (info.die || 8)] = 0;
    var play = {
      hp: info.hpMax, tempHp: 0, hitDiceUsed: hd, deathSaves: { success: 0, fail: 0 },
      slotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0], pactUsed: 0, inspiration: false, conditions: "",
      coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }, inventory: "", notes: ""
    };
    return { data: data, play: play, info: info };
  }

  /* --------------------------------------------------------- the rules */
  // Every rule, as a list of checks. step: where it is fixed. flag: a
  // note for the Dungeon Master rather than a fault.
  function checks(d, w, stored) {
    var L = [], info = compute(d, w), c = info.c, sp = info.sp, bg = info.bg;
    function add(step, label, problem) { L.push({ step: step, label: label, problem: problem || "", ok: !problem, flag: false }); }
    function note(step, label) { L.push({ step: step, label: label, problem: "", ok: true, flag: true }); }

    /* 1. Concept */
    add(0, "A name", !trim(d.name) && "Give your adventurer a name.");
    add(0, "A species", !trim(d.species) ? "Choose a species." : !sp ? "“" + d.species + "” is not a species in these rules: choose one from the list." : "");
    if (sp && (sp.subraces || []).length && (sp.subraceRequired || trim(d.subspecies))) {
      add(0, "A subrace", !trim(d.subspecies) ? "Choose which kind of " + sp.name + " you are" + (sp.subraces.length <= 4 ? " (" + list(sp.subraces.map(function (x) { return x.name; })).replace(/ and ([^,]*)$/, " or $1") + ")." : ", from the list.")
        : !info.sub ? "“" + d.subspecies + "” is not a subrace of " + sp.name + ": choose one from the list." : "");
    } else if (sp && trim(d.subspecies)) add(0, "No subrace", sp.name + " has no subraces: clear “" + d.subspecies + "”.");
    if (info.sizes.length > 1) add(0, "A size", !info.size && "Choose your size: " + list(info.sizes).replace(/ and /, " or ") + ".");
    add(0, "An alignment", !trim(d.alignment) ? "Choose an alignment." : R.alignments.length && !R.alignments.some(function (a) { return same(a, d.alignment); }) ? "“" + d.alignment + "” is not an alignment in the list." : "");

    /* 2. Class */
    add(1, "A class", !trim(d.cls) ? "Choose a class." : !c ? "That class is not in these rules: choose one from the list." : "");
    if (c) {
      if (STANDARD_CLASSES.indexOf(c.key) < 0) note(1, c.name + (c.source ? " (" + c.source + ")" : "") + " is not one of the thirteen standard classes: the Dungeon Master agrees to it and checks its features" +
        (c.spellcasting ? "." : ", and any spells it casts (these rules list none for it)."));
      if (!c.hitDie) add(1, "A hit die agreed with the Dungeon Master", !info.die && "The rules list no hit die for the " + c.name + ": ask the Dungeon Master which to use, and choose it.");
      if (!c.hitDie && info.die) note(1, "Hit die d" + info.die + " for the " + c.name + " (the rules list none): the Dungeon Master confirms it.");
      var subs = c.subclasses || [], subL = c.subclassLevel == null ? 0 : int(c.subclassLevel, 3, 1, 20);
      if (!subL) {
        if (subs.length) note(1, "The rules give no subclass level for the " + c.name + ": the Dungeon Master says when to choose one.");
        if (trim(d.subclass)) add(1, "No subclass yet", "Choose the " + c.name + "’s subclass when the Dungeon Master says: clear it for now.");
      } else if (subL <= 1) add(1, "A " + (c.subclassLabel || "subclass"), !trim(d.subclass) ? c.name + "s choose their " + (c.subclassLabel || "subclass") + " at level 1: choose one."
        : !findByName(subs, d.subclass) ? "“" + d.subclass + "” is not a " + (c.subclassLabel || "subclass") + " of the " + c.name + ": choose one from the list." : "");
      else if (trim(d.subclass)) add(1, "No subclass yet", c.name + "s choose their " + (c.subclassLabel || "subclass") + " at level " + subL + ", not now: clear it.");
    }

    /* 3. Ability scores */
    add(2, "A way to find the scores", !w.method && "Choose how to find your ability scores: point buy, or rolling 4d6.");
    if (w.method === "pointbuy") {
      var lo = int(R.pointBuy.min, 8, 1, 30), hi = int(R.pointBuy.max, 15, 1, 30), budget = int(R.pointBuy.budget, 27, 0, 99);
      var out = AKEYS.filter(function (k) { return w.pointBuy[k] < lo || w.pointBuy[k] > hi || R.pointBuy.cost[String(w.pointBuy[k])] == null; });
      add(2, "Point buy: every score from " + lo + " to " + hi, out.length && list(out.map(function (k) { return ANAME[k] + " is " + w.pointBuy[k]; })) +
        ", but scores bought with points go from " + lo + " to " + hi + ".");
      if (!out.length) add(2, "Point buy: all " + budget + " points spent", info.left !== 0 && (info.left > 0
        ? "You have " + plural(info.left, "point") + " of " + budget + " left to spend: raise a score."
        : "You have spent " + plural(-info.left, "point") + " more than the " + budget + " you have: lower a score."));
      if (w.rolls) note(2, "The dice were rolled first (" + w.rolls.sets.map(rollTotal).join(", ") + "), then point buy was chosen instead: the Dungeon Master decides whether that is fine.");
    } else if (w.method === "roll") {
      if (!w.rolls) add(2, "The dice rolled", "Roll your six ability scores.");
      else {
        var setsOk = w.rolls.sets.length === 6 && w.rolls.sets.every(function (s) { return s.length === 4; });
        add(2, "Six rolls of 4d6 recorded", !setsOk && "The record of the dice is incomplete: it should hold six rolls of four dice. Ask the Dungeon Master.");
        var none = AKEYS.filter(function (k) { return w.assign[k] < 0; });
        var used = {}, twice = [];
        AKEYS.forEach(function (k) { var i = w.assign[k]; if (i >= 0) { if (used[i]) twice.push(i); used[i] = true; } });
        add(2, "Each roll used once", none.length ? "Give each ability one of the six rolls: " + list(none.map(function (k) { return ANAME[k]; })) + (none.length === 1 ? " has" : " have") + " none yet."
          : twice.length ? "Roll " + list(twice.map(function (i) { return String(i + 1); })) + (twice.length === 1 ? " is" : " are") + " used twice: each roll goes to one ability." : "");
      }
    }
    var a = w.origin.a, need = w.origin.mode === "2-1" ? 2 : 3, picked = a.slice(0, need).filter(Boolean);
    var oProb = "";
    if (w.origin.mode === "2-1") {
      if (!a[0]) oProb = "Choose the ability that gets +2.";
      else if (!a[1]) oProb = "Choose the ability that gets +1.";
      else if (a[0] === a[1]) oProb = "The +2 and the +1 go to two different abilities.";
    } else {
      if (new Set(picked).size < picked.length) oProb = "The three +1s go to three different abilities.";
      else if (picked.length < 3) oProb = "Choose three abilities for +1 each: " + plural(3 - picked.length, "more", "more") + " to go.";
    }
    add(2, "The origin increase: +2 and +1, or +1, +1 and +1", oProb);
    var over = AKEYS.filter(function (k) { return info.final[k] > 20; });
    add(2, "No score above 20", over.length && list(over.map(function (k) { return ANAME[k] + " would be " + info.final[k]; })) + ": no score goes above 20.");
    if (!oProb) note(2, "Origin increase (" + AKEYS.filter(function (k) { return info.bonus[k]; }).map(function (k) { return ANAME[k] + " +" + info.bonus[k]; }).join(", ") +
      "), on any abilities: this is the “customising your origin” option, which replaces the species’ own increases.");

    /* 4. Background */
    add(3, "A background", !trim(d.background) ? "Choose a background." : !bg ? "“" + d.background + "” is not a background in these rules: choose one from the list." : "");
    if (info.bgChoice) {
      var bc = info.bgChoice, bp = [], dupFixed = w.bgChoice.filter(function (k) { return info.bgFixed.indexOf(k) >= 0; });
      var offList = w.bgChoice.filter(function (k) { return bc.from.indexOf(k) < 0; });
      if (offList.length) bp.push(list(offList.map(function (k) { return SNAME[k] || k; })) + (offList.length === 1 ? " is" : " are") + " not among the skills the " + bg.name + " offers.");
      if (dupFixed.length) bp.push(list(dupFixed.map(function (k) { return SNAME[k]; })) + " already comes with the background: choose another.");
      if (w.bgChoice.length !== bc.count) bp.push(w.bgChoice.length < bc.count ? "Choose " + plural(bc.count, "skill") + " from the " + bg.name + "’s list: " + w.bgChoice.length + " chosen."
        : "The " + bg.name + " gives " + plural(bc.count, "skill") + ", but " + w.bgChoice.length + " are chosen: untick " + (w.bgChoice.length - bc.count) + ".");
      add(3, bg.name + ": " + plural(bc.count, "skill") + " of your choice", bp.join(" "));
    } else if (w.bgChoice.length) add(3, "No skill choice for this background", "This background gives no skill of your choice: untick " + list(w.bgChoice.map(function (k) { return SNAME[k] || k; })) + ".");
    var swaps = Object.keys(w.bgSwap);
    if (swaps.length) {
      var sp2 = [];
      swaps.forEach(function (k) {
        var r = w.bgSwap[k];
        if (info.bgSkills.indexOf(k) < 0) sp2.push((SNAME[k] || k) + " is not one of your background’s skills, so there is nothing to swap.");
        else if (!SNAME[r]) sp2.push("“" + r + "” is not a skill.");
        else if (info.bgSkills.indexOf(r) >= 0 || swaps.some(function (o) { return o !== k && w.bgSwap[o] === r; })) sp2.push(SNAME[r] + " is already among your background’s skills: choose another.");
      });
      add(3, "Swapped background skills are new skills", sp2.join(" "));
      if (!sp2.length) note(3, "Background skill swapped: " + swaps.map(function (k) { return SNAME[k] + " → " + SNAME[w.bgSwap[k]]; }).join(", ") +
        " (allowed when the character already has that skill, for example from their species): the Dungeon Master checks.");
    }

    /* 5. Skills */
    if (c) {
      var from = skillFrom(c), n = skillCount(c), cs = w.classSkills, probs = [];
      var notList = cs.filter(function (k) { return from.indexOf(k) < 0; });
      var fromBg = cs.filter(function (k) { return info.bgSkills.indexOf(k) >= 0 || info.bgEffective.indexOf(k) >= 0; });
      if (notList.length) probs.push(list(notList.map(function (k) { return SNAME[k] || k; })) + (notList.length === 1 ? " is" : " are") + " not on the " + c.name + "’s skill list.");
      if (fromBg.length) probs.push(list(fromBg.map(function (k) { return SNAME[k] || k; })) + " already " + (fromBg.length === 1 ? "comes" : "come") + " from your background: choose another.");
      if (cs.length !== n) probs.push(cs.length < n ? "Choose " + plural(n, "skill") + (c.skillChoices && c.skillChoices.from === "any" ? " (any skills)" : " from the " + c.name + "’s list") + ": " + cs.length + " chosen, " + (n - cs.length) + " to go."
        : "The " + c.name + " chooses " + plural(n, "skill") + ", but " + cs.length + " are chosen: untick " + (cs.length - n) + ".");
      add(4, c.name + ": " + plural(n, "skill") + " from the class list", probs.join(" "));
      if (info.expertiseCount) {
        var ex = w.expertise, eb = [];
        var notProf = ex.filter(function (k) { return !SNAME[k] || (info.skills[k] || 0) < 1; });
        if (notProf.length) eb.push("Expertise only goes to skills you are proficient in: untick " + list(notProf.map(function (k) { return SNAME[k] || k; })) + ".");
        if (ex.length !== info.expertiseCount) eb.push(ex.length < info.expertiseCount ? "Choose " + plural(info.expertiseCount, "skill") + " for Expertise: " + ex.length + " chosen."
          : "Only " + plural(info.expertiseCount, "skill") + " get Expertise: untick " + (ex.length - info.expertiseCount) + ".");
        add(4, c.name + ": Expertise in " + plural(info.expertiseCount, "skill"), eb.join(" "));
      } else if (w.expertise.length) add(4, "No Expertise at level 1", "Only some classes (the Rogue) gain Expertise at level 1: untick it.");
    }

    /* 6. Spells */
    if (c) {
      var nd = info.needs;
      if (!c.spellcasting) {
        add(5, "No spells for a " + c.name, (w.cantrips.length || w.spells.length) && "The " + c.name + " casts no spells: take them off.");
      } else {
        add(5, plural(nd.cantrips, "cantrip") + " from the " + c.name + " list", spellListProblem(c, w.cantrips, nd.cantrips, 0, 0, "cantrip"));
        if (nd.type === "known") add(5, plural(nd.known, "spell") + " known", spellListProblem(c, w.spells, nd.known, 1, nd.maxLevel, "spell"));
        else if (nd.type === "spellbook") {
          add(5, plural(nd.book, "1st-level spell") + " in the spellbook", spellListProblem(c, w.spells, nd.book, 1, 1, "spell"));
          var outBook = w.prepared.filter(function (n) { return w.spells.indexOf(n) < 0; });
          var pp = outBook.length ? list(outBook) + (outBook.length === 1 ? " is" : " are") + " not in your spellbook: you prepare from the book." : "";
          if (!pp && w.prepared.length !== nd.prepared) pp = w.prepared.length < nd.prepared ? "Prepare " + plural(nd.prepared, "spell") + " from your spellbook (Intelligence modifier + 1): " + w.prepared.length + " prepared."
            : "You can prepare " + plural(nd.prepared, "spell") + " (Intelligence modifier + 1), but " + w.prepared.length + " are prepared: untick " + (w.prepared.length - nd.prepared) + ".";
          add(5, plural(nd.prepared, "spell") + " prepared from the spellbook", pp);
        } else {
          if (nd.prepared) add(5, plural(nd.prepared, "spell") + " prepared", spellListProblem(c, w.spells, nd.prepared, 1, nd.maxLevel, "spell", prepFormula(c)));
          else add(5, "No prepared spells at level 1", w.spells.length && "The " + c.name + " prepares no spells at level 1: take them off.");
        }
        if (nd.type !== "spellbook" && w.prepared.length) add(5, "Only a wizard prepares from a spellbook", "Clear the prepared spells: only a wizard prepares from a spellbook.");
      }
    }

    /* 7. Hit points & gear */
    if (w.acCustom) {
      var acv = parseInt(d.ac, 10);
      add(6, "Armour Class from 1 to 30", (isNaN(acv) || acv < 1 || acv > 30) && "Give your Armour Class as a number from 1 to 30.");
      add(6, "Where the Armour Class comes from", !trim(w.acNote) && "Say where your Armour Class of " + (isNaN(acv) ? "…" : acv) + " comes from (for example: chain mail and a shield).");
      if (!isNaN(acv) && trim(w.acNote)) note(6, "Armour Class " + acv + ", from " + trim(w.acNote) + " (unarmoured it would be " + info.acDefault + "): the Dungeon Master checks it.");
    }

    /* 8. Details */
    if (trim(d.feat)) {
      var ft = findByName(R.feats, d.feat);
      add(7, "A feat from the list", !ft && "“" + d.feat + "” is not a feat in these rules: choose one from the list, or none.");
      if (ft) note(7, "Feat at level 1: " + ft.name + (ft.prerequisite ? " (prerequisite: " + ft.prerequisite + ")" : "") +
        ". Only if your species (for example a variant human or a custom lineage) or the Dungeon Master grants one: the Dungeon Master checks.");
    }

    /* The saved sheet against its record (the Dungeon Master's review). */
    if (stored) {
      add(REVIEW, "The creation record is kept with the draft", !(stored.data && stored.data._creation) &&
        "This draft has no creation record, so its choices cannot be checked here.");
      var diffs = sheetDiffs(stored, buildSheet(d, w));
      add(REVIEW, "The sheet matches the choices recorded step by step", diffs.length &&
        "The saved sheet differs from its creation record in: " + diffs.join(", ") + ". It may have been changed outside this page.");
    }
    return L;
  }

  function spellListProblem(c, names, n, minL, maxL, what, formula) {
    var out = [], seen = {};
    names.forEach(function (nm) {
      var s = spellOf(nm);
      if (!s) out.push("“" + nm + "” is not a spell in these rules.");
      else if (!onClassList(c, nm, 0, 9)) out.push(s.name + " is not on the " + c.name + " spell list.");
      else if (s.level < minL || s.level > maxL) out.push(s.name + " is " + (s.level ? "a level " + s.level + " spell" : "a cantrip") +
        (minL === 0 && maxL === 0 ? ", not a cantrip." : "; at level 1 you can only take " + (maxL === 1 ? "1st-level" : "level " + minL + "–" + maxL) + " spells here."));
      if (seen[nm]) out.push(nm + " is taken twice.");
      seen[nm] = true;
    });
    if (names.length !== n) out.push(names.length < n
      ? "Choose " + plural(n, what) + (formula ? " (" + formula + ")" : "") + ": " + names.length + " chosen, " + (n - names.length) + " to go."
      : "You can have " + plural(n, what) + (formula ? " (" + formula + ")" : "") + ", but " + names.length + " are chosen: untick " + (names.length - n) + ".");
    return out.join(" ");
  }

  var COMPARE = ["name", "species", "subspecies", "background", "alignment", "classes", "abilities", "saves", "skills", "armor", "weapons",
    "hpMax", "ac", "speed", "size", "feats", "spells"];
  var DIFF_NAMES = { hpMax: "hit points", ac: "Armour Class", subspecies: "subrace", abilities: "ability scores", saves: "saving throws" };
  function sheetDiffs(stored, built) {
    var sd = stored.data || {}, out = [];
    COMPARE.forEach(function (k) {
      var a = sd[k], b = built.data[k];
      if (typeof b === "string") a = trim(a);
      if (canon(a) !== canon(b)) out.push(DIFF_NAMES[k] || k);
    });
    if (int((stored.play || {}).hp, -1, -1, 999) !== built.play.hp) out.push("current hit points");
    return out;
  }

  function problemsFor(L, step) { return L.filter(function (x) { return x.step === step && !x.ok; }); }
  function firstBadStep(L) {
    for (var i = 0; i < REVIEW; i++) if (problemsFor(L, i).length) return i;
    return REVIEW;
  }

  /* ------------------------------------------------------------ boot */
  ensureChrome();
  window.Gate.ready.then(function (g) {
    S.db = g.db; S.role = g.role; S.email = String(g.email || "").toLowerCase();
    if (!CAMPAIGN) { root().innerHTML = '<div class="sheet-notice">This page does not say which campaign it belongs to.</div>'; return; }
    if (!R.classes.length) { root().innerHTML = '<div class="sheet-notice">The rules could not be loaded just now. Try again in a moment.</div>'; setStatus(""); return; }
    var q = new URLSearchParams(window.location.search);
    if (q.get("review")) return openReview(q.get("review"));
    if (q.get("draft")) return openDraft(q.get("draft"));
    if (q.has("new")) return openNew();
    return showList();
  });

  function root() { return $("create"); }
  function isDM() { return S.role === "storyteller"; }
  function mine(row) { return String(row.email || "").toLowerCase() === S.email; }
  function link(q) { return PAGE + (q ? "?" + q : ""); }

  // The dialogs and the toast, if the page does not have them.
  function ensureChrome() {
    if (!$("approveDialog")) {
      document.body.insertAdjacentHTML("beforeend",
        '<dialog id="approveDialog" class="sheet-dialog" aria-labelledby="approveTitle"><form id="approveForm" method="dialog">' +
        '<h2 id="approveTitle">Approve this adventurer</h2>' +
        "<p>Approving makes the character sheet, owned by the player. Give the sheet a short name for its address: lower-case letters, digits and hyphens, at most 40.</p>" +
        '<label for="approveSlug">Short name</label><input id="approveSlug" required maxlength="40" pattern="[a-z0-9\\-]{1,40}" autocomplete="off" spellcheck="false">' +
        '<label for="approveNote">Note for the player (optional)</label><textarea id="approveNote" maxlength="2000" rows="3"></textarea>' +
        '<p id="approveMsg" class="sheet-status" role="status"></p>' +
        '<div class="dialog-actions"><button type="button" class="btn btn--ghost" id="approveCancel">Cancel</button><button type="submit" class="btn" id="approveSend">Approve</button></div></form></dialog>' +
        '<dialog id="rejectDialog" class="sheet-dialog" aria-labelledby="rejectTitle"><form id="rejectForm" method="dialog">' +
        '<h2 id="rejectTitle">Send back to the player</h2><p>Say what needs changing. The player sees this note and can edit the draft again.</p>' +
        '<label for="rejectNote">Note for the player</label><textarea id="rejectNote" required maxlength="2000" rows="5"></textarea>' +
        '<p id="rejectMsg" class="sheet-status" role="status"></p>' +
        '<div class="dialog-actions"><button type="button" class="btn btn--ghost" id="rejectCancel">Cancel</button><button type="submit" class="btn" id="rejectSend">Send back</button></div></form></dialog>');
    }
    if (!$("sheetToast")) document.body.insertAdjacentHTML("beforeend", '<div class="sheet-toast" id="sheetToast" role="status" aria-live="polite" hidden></div>');
  }

  /* ------------------------------------------------------- the list */
  async function showList() {
    S.mode = "list";
    setStatus("Opening your drafts…");
    var rows;
    try {
      var r = await S.db.from("character_drafts")
        .select("id,chronicle,email,name,status,note,sheet_slug,created_at,updated_at,submitted_at,decided_at")
        .eq("chronicle", CAMPAIGN).order("updated_at", { ascending: false });
      if (r.error) throw r.error;
      rows = r.data || [];
    } catch (e) {
      console.error(e);
      setStatus("");
      root().innerHTML = '<div class="sheet-notice">Your drafts could not be reached just now (' + esc(errText(e)) + "). Try again in a moment.</div>";
      return;
    }
    setStatus(isDM() ? "Dungeon Master: you see every draft in " + CAMPAIGN_NAME + "." : "");
    var own = rows.filter(mine), others = rows.filter(function (x) { return !mine(x); });
    var h = '<section class="create-panel" aria-labelledby="ownTitle"><h2 id="ownTitle">Your adventurers</h2>' +
      "<p>An adventurer is built in eight short steps and saved as a draft as you go. When every rule is met, send it to the Dungeon Master, who approves it (it then becomes your character sheet and joins the party) or sends it back with a note. " +
      "The rules themselves are on " + wiki(WIKI, "dnd5e.wikidot.com") + ".</p>";
    if (!own.length) h += '<p class="empty-line">No adventurers yet.</p>';
    else h += '<ul class="draft-list">' + own.map(function (x) { return draftItem(x, true); }).join("") + "</ul>";
    h += '<p style="margin-top:1rem"><a class="btn" href="' + esc(link("new=1")) + '">Create a new adventurer</a></p></section>';

    if (isDM()) {
      var queue = rows.filter(function (x) { return x.status === "submitted"; });
      h += '<section class="create-panel" aria-labelledby="waitTitle"><h2 id="waitTitle">Waiting for your approval</h2>';
      if (!queue.length) h += '<p class="empty-line">Nothing is waiting.</p>';
      else h += '<ul class="draft-list">' + queue.map(function (x) {
        return '<li><div class="who"><b>' + esc(x.name || "Unnamed") + "</b><span>" + esc(x.email) + " · sent " + esc(fmtDate(x.submitted_at || x.updated_at)) + "</span></div>" +
          '<div class="acts"><a class="btn" href="' + esc(link("review=" + encodeURIComponent(x.id))) + '">Review</a></div></li>';
      }).join("") + "</ul>";
      h += "</section>";
      var progress = others.filter(function (x) { return x.status === "draft" || x.status === "rejected"; });
      h += '<section class="create-panel" aria-labelledby="progTitle"><h2 id="progTitle">Drafts in progress</h2>' +
        "<p>Other players’ drafts that are not yet sent. You can read them; only their players can change them.</p>";
      if (!progress.length) h += '<p class="empty-line">None.</p>';
      else h += '<ul class="draft-list">' + progress.map(function (x) {
        return '<li><div class="who"><b>' + esc(x.name || "Unnamed") + "</b><span>" + esc(x.email) + " · " + esc(STATUS[x.status] || x.status) +
          " · updated " + esc(fmtDate(x.updated_at)) + "</span></div>" +
          '<div class="acts"><a class="btn btn--ghost" href="' + esc(link("review=" + encodeURIComponent(x.id))) + '">View</a></div></li>';
      }).join("") + "</ul>";
      h += "</section>";
    }
    root().innerHTML = h;
  }

  function draftItem(x, own) {
    var st = x.status, acts = "";
    var id = encodeURIComponent(x.id);
    if (st === "draft" || st === "rejected") acts += '<a class="btn" href="' + esc(link("draft=" + id)) + '">Continue</a>';
    if (st === "submitted") acts += '<a class="btn btn--ghost" href="' + esc(link("review=" + id)) + '">View</a>' +
      '<button type="button" class="btn btn--ghost" data-act="withdraw" data-id="' + esc(x.id) + '">Withdraw</button>';
    if (st === "approved" && x.sheet_slug) acts += '<a class="btn" href="sheet.html?c=' + esc(encodeURIComponent(x.sheet_slug)) + '">Open the sheet</a>' +
      '<a class="btn btn--ghost" href="levelup.html?c=' + esc(encodeURIComponent(x.sheet_slug)) + '">Level up</a>';
    if (st !== "approved" && own) acts += '<button type="button" class="btn btn--ghost" data-act="delete" data-id="' + esc(x.id) + '">Delete</button>';
    var when = st === "submitted" ? "sent " + fmtDate(x.submitted_at || x.updated_at)
      : st === "approved" || st === "rejected" ? fmtDate(x.decided_at || x.updated_at) : "updated " + fmtDate(x.updated_at);
    return '<li><div class="who"><b>' + esc(x.name || "Unnamed") + '</b><span><span class="status status-' + esc(st) + '">' + esc(STATUS[st] || st) + "</span> · " + esc(when) + "</span>" +
      (x.note && (st === "rejected" || st === "approved") ? '<span class="note">' + (st === "rejected" ? "The Dungeon Master: " : "") + esc(x.note) + "</span>" : "") +
      '</div><div class="acts">' + acts + "</div></li>";
  }

  async function listAction(act, id) {
    var fn = act === "withdraw" ? "withdraw_draft" : "delete_draft";
    var ask = act === "withdraw"
      ? "Withdraw this adventurer from the Dungeon Master? It goes back to being a draft you can change."
      : "Delete this draft for good? This cannot be undone.";
    if (!window.confirm(ask)) return;
    try {
      var r = await S.db.rpc(fn, { p_id: +id });
      if (r.error) throw r.error;
      toast(act === "withdraw" ? "Withdrawn: it is a draft again." : "Draft deleted.");
    } catch (e) {
      console.error(e);
      window.alert("That did not work: " + errText(e));
    }
    if (S.mode === "list") showList(); else window.location.href = link("");
  }

  /* ------------------------------------------------- opening a draft */
  var D_FIELDS = ["name", "species", "subspecies", "size", "alignment", "cls", "subclass", "hitDie", "background", "ac", "equipment",
    "languages", "tools", "feat", "personality", "ideals", "bonds", "flaws", "backstory", "appearance"];
  function blankD() { var d = {}; D_FIELDS.forEach(function (k) { d[k] = ""; }); return d; }

  function openNew() {
    S.mode = "edit"; S.row = null; S.id = null; S.status = "draft";
    S.d = blankD();
    S.w = normW({});
    setStatus("A new adventurer: nothing is saved until you move to the next step or press Save.");
    render();
  }

  async function fetchRow(id) {
    if (!/^\d{1,18}$/.test(String(id))) return null;
    var r = await S.db.from("character_drafts").select("*").eq("id", +id).maybeSingle();
    if (r.error) throw r.error;
    return r.data && r.data.chronicle === CAMPAIGN ? r.data : null;
  }

  function loadRow(row) {
    var data = obj(row.data);
    S.row = row; S.id = row.id; S.status = row.status;
    S.d = blankD();
    ["name", "species", "subspecies", "size", "alignment", "background", "equipment", "languages", "tools",
      "personality", "ideals", "bonds", "flaws", "backstory", "appearance"].forEach(function (k) { S.d[k] = str(data[k], 20000); });
    var c0 = obj(Array.isArray(data.classes) ? data.classes[0] : null);
    S.d.cls = str(c0.key, 40);
    S.d.subclass = str(c0.subclass, 120);
    S.d.hitDie = c0.hitDie == null ? "" : String(int(c0.hitDie, 8, 4, 12));
    S.d.ac = data.ac == null ? "" : String(int(data.ac, 10, 0, 99));
    var f0 = obj(Array.isArray(data.feats) ? data.feats[0] : null);
    S.d.feat = str(f0.name, 120);
    if (!S.d.name) S.d.name = str(row.name, 200);
    S.w = normW(data._creation);
  }

  async function openDraft(id) {
    setStatus("Opening the draft…");
    var row;
    try { row = await fetchRow(id); }
    catch (e) { console.error(e); setStatus(""); root().innerHTML = '<div class="sheet-notice">The draft could not be reached just now (' + esc(errText(e)) + ").</div>"; return; }
    if (!row) { setStatus(""); root().innerHTML = '<div class="sheet-notice">There is no draft at this address. <a href="' + esc(link("")) + '">Back to your adventurers</a>.</div>'; return; }
    if (!mine(row) || (row.status !== "draft" && row.status !== "rejected")) { window.location.replace(link("review=" + encodeURIComponent(row.id))); return; }
    loadRow(row);
    S.mode = "edit";
    setStatus(row.status === "rejected" ? "Sent back by the Dungeon Master: change what the note asks, then send it again." : "Saved drafts carry on where you left off.");
    render();
  }

  async function openReview(id) {
    setStatus("Opening the draft…");
    var row;
    try { row = await fetchRow(id); }
    catch (e) { console.error(e); setStatus(""); root().innerHTML = '<div class="sheet-notice">The draft could not be reached just now (' + esc(errText(e)) + ").</div>"; return; }
    if (!row) { setStatus(""); root().innerHTML = '<div class="sheet-notice">There is no draft at this address, or it is not yours to see. <a href="' + esc(link("")) + '">Back to the list</a>.</div>'; return; }
    loadRow(row);
    S.mode = "review";
    setStatus(isDM() ? "Dungeon Master’s review: every rule is checked again here." : "Read only.");
    renderReview();
  }

  /* ------------------------------------------------------------ saving */
  function save(quiet) {
    S.saveChain = S.saveChain.then(function () { return doSave(quiet); });
    return S.saveChain;
  }
  async function doSave(quiet) {
    if (S.mode !== "edit") return false;
    S.saving = true;
    setStatus("Saving…");
    var built = buildSheet(S.d, S.w);
    try {
      var r = await S.db.rpc("save_draft", {
        p_id: S.id, p_chronicle: CAMPAIGN, p_name: built.data.name || "Unnamed adventurer",
        p_data: built.data, p_play: built.play
      });
      if (r.error) throw r.error;
      if (r.data != null && !S.id) {
        S.id = r.data;
        try { window.history.replaceState(null, "", link("draft=" + encodeURIComponent(S.id))); } catch (e) { /* ignore */ }
      }
      S.status = "draft"; S.saving = false; S.dirty = false;
      setStatus("Saved " + new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) + ".");
      if (!quiet) toast("Draft saved.");
      return true;
    } catch (e) {
      console.error(e);
      S.saving = false;
      setStatus("Not saved: " + errText(e), true);
      toast("Not saved: " + errText(e));
      return false;
    }
  }

  /* ------------------------------------------------------- rendering */
  function render() {
    if (S.mode !== "edit") return;
    var active = document.activeElement, f = active && active.getAttribute && active.getAttribute("data-f");
    var built = buildSheet(S.d, S.w), L = checks(S.d, S.w), w = S.w, step = w.step;
    var reach = firstBadStep(L);
    var h = '<div class="sheet-bar"><a class="btn btn--ghost" href="' + esc(link("")) + '" data-act="leave">&larr; Your adventurers</a><span class="spacer"></span>' +
      '<button type="button" class="btn" data-act="save" data-f="save">Save</button></div>';
    if (S.status === "rejected" && S.row && S.row.note) {
      h += '<div class="sheet-notice rejected-note"><strong>Sent back by the Dungeon Master:</strong> ' + esc(S.row.note) + "</div>";
    }
    h += '<ol class="steps" aria-label="Steps">' + STEPS.map(function (name, i) {
      var bad = i < REVIEW && problemsFor(L, i).length && i < step;
      return '<li><button type="button" data-act="go" data-step="' + i + '" data-f="go' + i + '"' + (i === step ? ' aria-current="step"' : "") +
        (i > reach ? " disabled" : "") + ' class="' + (bad ? "bad" : i < step ? "done" : "") + '">' + (i + 1) + ". " + esc(name) + "</button></li>";
    }).join("") + "</ol>";

    h += stepBody(step, built, L);

    var probs = problemsFor(L, step);
    h += '<div id="problems">' + problemsHtml(probs) + "</div>";
    h += '<div class="step-nav">' +
      (step > 0 ? '<button type="button" class="btn btn--ghost" data-act="back" data-f="back">&larr; Back</button>' : "") +
      '<span class="spacer"></span>' +
      (step < REVIEW ? '<button type="button" class="btn" data-act="next" data-f="next"' + (probs.length ? ' aria-disabled="true"' : "") + ">Next: " + esc(STEPS[step + 1]) + " &rarr;</button>" : "") +
      "</div>";
    root().innerHTML = h;
    if (f) {
      var el = root().querySelector('[data-f="' + (window.CSS && CSS.escape ? CSS.escape(f) : f) + '"]');
      if (el) el.focus({ preventScroll: true });
    }
  }

  // After typing: only the problems, the steps and the Next button change.
  function softRefresh() {
    if (S.mode !== "edit") return;
    var L = checks(S.d, S.w), probs = problemsFor(L, S.w.step), reach = firstBadStep(L);
    var box = $("problems");
    if (box) box.innerHTML = problemsHtml(probs);
    var next = root().querySelector('[data-act="next"]');
    if (next) { if (probs.length) next.setAttribute("aria-disabled", "true"); else next.removeAttribute("aria-disabled"); }
    root().querySelectorAll('[data-act="go"]').forEach(function (b) { b.disabled = +b.getAttribute("data-step") > reach; });
    S.dirty = true;
  }

  function problemsHtml(probs) {
    if (!probs.length) return S.w && S.w.step < REVIEW ? '<p class="step-ok">Everything on this step is in order.</p>' : "";
    return '<div class="problems' + (S.flash ? " flash" : "") + '" role="alert"><h3>Before you go on</h3><ul>' +
      probs.map(function (x) { return "<li>" + esc(x.problem) + "</li>"; }).join("") + "</ul></div>";
  }

  function select(path, value, options, opt) {
    opt = opt || {};
    var known = options.some(function (o) { return String(o.value != null ? o.value : o) === String(value); });
    var h = '<select data-bind="' + esc(path) + '" data-f="' + esc("sel:" + path) + '"' + (opt.id ? ' id="' + esc(opt.id) + '"' : "") +
      (opt.num ? " data-num" : "") + (opt.label ? ' aria-label="' + esc(opt.label) + '"' : "") + ">" +
      '<option value="">' + esc(opt.blank || "—") + "</option>";
    if (value !== "" && value != null && !known) h += '<option selected value="' + esc(value) + '">' + esc(value) + "</option>";
    var group = null;
    options.forEach(function (o) {
      var v = o.value != null ? o.value : o, t = o.text != null ? o.text : v;
      if (o.group && o.group !== group) { h += (group ? "</optgroup>" : "") + '<optgroup label="' + esc(o.group) + '">'; group = o.group; }
      h += "<option" + (String(v) === String(value) ? " selected" : "") + (o.disabled ? " disabled" : "") + ' value="' + esc(v) + '">' + esc(t) + "</option>";
    });
    return h + (group ? "</optgroup>" : "") + "</select>";
  }
  function input(path, value, opt) {
    opt = opt || {};
    return '<input data-bind="' + esc(path) + '" data-f="' + esc("in:" + path) + '" value="' + esc(value) + '"' +
      (opt.id ? ' id="' + esc(opt.id) + '"' : "") + (opt.label ? ' aria-label="' + esc(opt.label) + '"' : "") +
      (opt.type ? ' type="' + opt.type + '" inputmode="numeric"' : "") +
      ' maxlength="' + (opt.max || 80) + '"' + (opt.placeholder ? ' placeholder="' + esc(opt.placeholder) + '"' : "") + ">";
  }
  function textarea(path, value, rows, id, max) {
    return '<textarea data-bind="' + esc(path) + '" data-f="' + esc("ta:" + path) + '" id="' + esc(id) + '" rows="' + rows + '" maxlength="' + (max || 8000) + '">' + esc(value) + "</textarea>";
  }
  function radio(path, value, current, text, id) {
    return '<label class="opt" for="' + esc(id) + '"><input type="radio" id="' + esc(id) + '" name="' + esc(path) + '" data-bind="' + esc(path) + '" data-f="' + esc("ra:" + id) +
      '" value="' + esc(value) + '"' + (String(value) === String(current) ? " checked" : "") + "> " + text + "</label>";
  }
  // A grid of tick boxes; path names an array in S.
  function tickList(path, items, chosen, max, opt) {
    opt = opt || {};
    var full = chosen.length >= max, f = trim(S.filters[path]).toLowerCase();
    var box = items.length > 16 ? '<input type="search" class="tick-filter" data-filter="' + esc(path) + '" data-f="' + esc("flt:" + path) + '" value="' + esc(S.filters[path] || "") +
      '" placeholder="Filter by name or school…" aria-label="Filter the list">' : "";
    return box + '<div class="tick-grid" data-grid="' + esc(path) + '">' + items.map(function (it, i) {
      var on = chosen.indexOf(it.value) >= 0, id = "t-" + path.replace(/\W/g, "") + "-" + i;
      var dis = it.locked || (!on && full) || it.disabled;
      var hide = f && !on && (it.text + " " + (it.sub || "")).toLowerCase().indexOf(f) < 0;
      return '<div class="tick' + (on ? " on" : "") + (it.locked ? " locked" : "") + (hide ? " hide" : "") + '" data-text="' + esc((it.text + " " + (it.sub || "")).toLowerCase()) + '"><input type="checkbox" id="' + id + '" data-toggle="' + esc(path) + '" data-f="' + esc("tk:" + path + ":" + it.value) +
        '" value="' + esc(it.value) + '"' + (on || it.locked ? " checked" : "") + (dis ? " disabled" : "") + '><label for="' + id + '">' + esc(it.text) +
        (it.sub ? "<small>" + esc(it.sub) + "</small>" : "") + "</label>" + (it.url ? " " + wikiIcon(it.url, it.text) : "") + "</div>";
    }).join("") + "</div>";
  }
  function wikiIcon(url, name) {
    return /^https?:\/\/(www\.)?dnd5e\.wikidot\.com\//i.test(String(url || ""))
      ? '<a class="wiki-link" href="' + esc(url) + '" target="_blank" rel="noopener" aria-label="' + esc(name) + ' on the wiki (new tab)" title="Open on the wiki (new tab)">↗</a>' : "";
  }
  function counter(n, allow) {
    var left = allow - n;
    return '<span class="count' + (left < 0 ? " over" : "") + '">' + (left === 0 ? "all " + allow + " chosen" : left > 0 ? n + " of " + allow + " chosen, " + left + " to go" : (-left) + " too many") + "</span>";
  }

  function stepBody(step, built, L) {
    var b = '<section class="page wiz-page" aria-labelledby="stepTitle">' + '<h3 id="stepTitle" style="margin-top:0">' + (step + 1) + ". " + esc(STEPS[step]) + "</h3>";
    switch (step) {
      case 0: b += stepConcept(built); break;
      case 1: b += stepClass(built); break;
      case 2: b += stepAbilities(built); break;
      case 3: b += stepBackground(built); break;
      case 4: b += stepSkills(built); break;
      case 5: b += stepSpells(built); break;
      case 6: b += stepGear(built); break;
      case 7: b += stepDetails(built); break;
      default: return stepReview(built, L);
    }
    return b + "</section>";
  }

  /* 1. Concept */
  function stepConcept(built) {
    var d = S.d, info = built.info, sp = info.sp;
    var h = '<p class="help">Start with who your adventurer is: a name, the species they were born to, and how they see right and wrong. ' +
      "Each name links to its page on the " + wiki(WIKI, "rules wiki") + ".</p>";
    h += '<div class="grid2">' +
      '<div><label class="lbl" for="fName">Name</label>' + input("d.name", d.name, { id: "fName", max: 80, placeholder: "e.g. Bryn Ashdown" }) + "</div>" +
      '<div><label class="lbl" for="fAlign">Alignment</label>' + select("d.alignment", d.alignment, R.alignments.map(function (a) { return { value: a, text: a }; }), { id: "fAlign", blank: "Choose…" }) + "</div>" +
      '<div><label class="lbl" for="fSpecies">Species</label>' + select("d.species", d.species, R.species.map(function (s) { return { value: s.name, text: s.name + (s.source ? " (" + s.source + ")" : "") }; }), { id: "fSpecies", blank: "Choose…" }) +
      (sp ? '<p class="info">' + wiki(sp.url, "About the " + sp.name) + " · " + esc(sp.size) + ", speed " + esc(sp.speed) + " ft.</p>" : "") + "</div>";
    if (sp && (sp.subraces || []).length) {
      h += '<div><label class="lbl" for="fSub">' + (sp.subraceRequired ? "Subrace" : "Subrace or variant (optional)") + "</label>" +
        select("d.subspecies", d.subspecies, sp.subraces.map(function (s) { return { value: s.name, text: s.name }; }), { id: "fSub", blank: sp.subraceRequired ? "Choose…" : "None: the " + sp.name + " as written" }) +
        (info.sub ? '<p class="info">' + wiki(info.sub.url, "About the " + info.sub.name) + "</p>"
                  : '<p class="info">' + (sp.subraceRequired ? "The " + esc(sp.name) + " comes in several kinds: choose one." : "Optional: a variant or another book&rsquo;s version, if the Dungeon Master allows it.") + "</p>") + "</div>";
    }
    if (info.sizes.length > 1) {
      h += '<div><label class="lbl" for="fSize">Size</label>' + select("d.size", info.size || d.size, info.sizes.map(function (s) { return { value: s, text: s }; }), { id: "fSize", blank: "Choose…" }) + "</div>";
    }
    h += "</div>";
    return h;
  }

  /* 2. Class */
  function stepClass(built) {
    var d = S.d, c = built.info.c;
    var h = '<p class="help">Your class is what your adventurer does best. It gives your hit points, your saving throws, the skills you choose from, and your spells, if any. ' +
      "You start at level 1.</p>";
    h += '<div class="grid2"><div><label class="lbl" for="fClass">Class</label>' +
      select("d.cls", d.cls, R.classes.map(function (x) { return { value: x.key, text: x.name }; }), { id: "fClass", blank: "Choose…" }) + "</div>";
    if (c) {
      var subL = c.subclassLevel == null ? 0 : int(c.subclassLevel, 3, 1, 20);
      if (!subL) h += '<div><span class="lbl">' + esc(c.subclassLabel || "Subclass") + '</span><p class="info" style="margin-top:0">' +
        ((c.subclasses || []).length ? "The rules give no level for it: the Dungeon Master says when." : "None in these rules.") + "</p></div>";
      else if (subL <= 1) {
        h += '<div><label class="lbl" for="fSubclass">' + esc(c.subclassLabel || "Subclass") + "</label>" +
          select("d.subclass", d.subclass, (c.subclasses || []).map(function (s) { return { value: s.name, text: s.name + (s.source ? " (" + s.source + ")" : "") }; }), { id: "fSubclass", blank: "Choose…" }) +
          (findByName(c.subclasses, d.subclass) ? '<p class="info">' + wiki(findByName(c.subclasses, d.subclass).url, "About " + findByName(c.subclasses, d.subclass).name) + "</p>" : "") + "</div>";
      } else h += '<div><span class="lbl">' + esc(c.subclassLabel || "Subclass") + '</span><p class="info" style="margin-top:0">Chosen at level ' + subL + ", when you level up.</p></div>";
    }
    if (c && !c.hitDie) {
      h += '<div><label class="lbl" for="fDie">Hit die (ask the Dungeon Master)</label>' +
        select("d.hitDie", d.hitDie, DICE.map(function (n) { return { value: String(n), text: "d" + n }; }), { id: "fDie", blank: "Choose…" }) +
        '<p class="info">The rules list no hit die for this class.</p></div>';
    }
    h += "</div>";
    if (c) {
      var sc = c.spellcasting, dieTxt = built.info.die ? String(built.info.die) : "?";
      h += '<div class="derived">' +
        "<div><b>" + wiki(c.url, c.name) + '</b><span class="tracker-note">Read the class on the wiki for its features.</span></div>' +
        '<div><b>Hit die</b><span class="big">d' + dieTxt + '</span><span class="tracker-note">Level 1: ' + dieTxt + " + your Constitution modifier.</span></div>" +
        "<div><b>Saving throws</b>" + esc((c.saves || []).map(function (k) { return ANAME[k] || k; }).join(" and ")) + "</div>" +
        "<div><b>Skills</b>" + esc(plural(skillCount(c), "skill")) + " from " + (c.skillChoices && c.skillChoices.from === "any" ? "any skill" : esc(list(skillFrom(c).map(function (k) { return SNAME[k]; })))) + "</div>" +
        "<div><b>Armour</b>" + esc(c.armor || "None") + "</div>" +
        "<div><b>Weapons</b>" + esc(c.weapons || "None") + "</div>" +
        "<div><b>Spells</b>" + (sc ? esc(ANAME[sc.ability] || sc.ability) + "-based; " + (maxSpellLevel(c, 1) || cantripsAt(c, 1) ? "from level 1." : "from level 2.") : "None.") + "</div>" +
        "<div><b>Multiclassing</b>" + esc(mcText(c)) + "</div>" +
        "</div>";
    }
    return h;
  }
  function mcText(c) {
    var req = obj(c.multiclass && c.multiclass.requires), keys = Object.keys(req);
    if (!keys.length) return "No requirement.";
    return "Needs " + keys.map(function (k) { return (ANAME[k] || k) + " " + req[k]; }).join(c.multiclass.any ? " or " : " and ") + ".";
  }

  /* 3. Ability scores */
  function stepAbilities(built) {
    var w = S.w, info = built.info, pb = R.pointBuy, lo = int(pb.min, 8, 1, 30), hi = int(pb.max, 15, 1, 30);
    var h = '<p class="help">Your six ability scores. Either buy them with ' + esc(pb.budget) + " points (every score from " + lo + " to " + hi + "), " +
      "or roll four six-sided dice six times, dropping the lowest die each time, and place the six totals where you like. The dice are rolled once, and the Dungeon Master sees them. " +
      "Then raise one score by 2 and another by 1, or three scores by 1. No score goes above 20. " + wiki(WIKI + "ability-scores", "Ability scores on the wiki") + ".</p>";
    h += '<div class="opts" role="radiogroup" aria-label="How to find the scores">' +
      radio("w.method", "pointbuy", w.method, "Point buy", "mPB") + radio("w.method", "roll", w.method, "Roll 4d6, drop the lowest", "mRoll") + "</div>";

    if (w.method === "pointbuy") {
      h += '<div class="freebie-sum' + (info.left < 0 ? " over" : "") + '" aria-live="polite"><span class="left">' +
        (info.left === 0 ? "All " + esc(pb.budget) + " points spent" : info.left > 0 ? plural(info.left, "point") + " left" : plural(-info.left, "point") + " overspent") +
        "</span><small>Cost of each score: " + Object.keys(pb.cost).map(function (k) { return k + " = " + pb.cost[k]; }).join(", ") + "</small></div>";
      h += '<div class="pb-grid">' + AKEYS.map(function (k) {
        var v = w.pointBuy[k], up = R.pointBuy.cost[String(v + 1)];
        var canUp = v < hi && up != null && up - pbCost(v) <= info.left;
        return '<div class="pb-row"><span class="pb-name">' + esc(ANAME[k]) + '</span>' +
          '<button type="button" class="mini" data-act="pb" data-k="' + k + '" data-d="-1" data-f="pb-' + k + '" aria-label="Lower ' + esc(ANAME[k]) + '"' + (v <= lo ? " disabled" : "") + ">−</button>" +
          '<span class="pb-val" aria-live="polite">' + v + "</span>" +
          '<button type="button" class="mini" data-act="pb" data-k="' + k + '" data-d="1" data-f="pb+' + k + '" aria-label="Raise ' + esc(ANAME[k]) + '"' + (canUp ? "" : " disabled") + ">+</button>" +
          '<span class="pb-cost">' + plural(pbCost(v), "pt") + "</span></div>";
      }).join("") + "</div>";
    } else if (w.method === "roll") {
      if (!w.rolls) {
        h += '<div class="roll-box"><p>Six rolls of 4d6; the lowest die of each is dropped. You roll once.</p>' +
          '<button type="button" class="btn" data-act="roll" data-f="roll">Roll the dice</button></div>';
      } else {
        h += '<div class="roll-sets">' + w.rolls.sets.map(function (s, i) {
          var drop = s.indexOf(Math.min.apply(null, s));
          return '<div class="roll-set"><b>Roll ' + (i + 1) + "</b> " + s.map(function (x, j) { return j === drop ? "<s>" + x + "</s>" : String(x); }).join(" ") +
            ' = <strong>' + rollTotal(s) + "</strong></div>";
        }).join("") + '<p class="info">Rolled ' + esc(fmtDateTime(w.rolls.rolledAt)) + ". Struck-through dice are dropped.</p></div>";
        var opts = w.rolls.sets.map(function (s, i) { return { value: String(i), text: "Roll " + (i + 1) + ": " + rollTotal(s) }; });
        h += '<div class="grid3">' + AKEYS.map(function (k) {
          return '<div><label class="lbl" for="as-' + k + '">' + esc(ANAME[k]) + "</label>" +
            select("w.assign." + k, w.assign[k] >= 0 ? String(w.assign[k]) : "", opts, { id: "as-" + k, blank: "Choose a roll…", num: true }) + "</div>";
        }).join("") + "</div>";
      }
    }

    var o = w.origin, aOpts = AKEYS.map(function (k) { return { value: k, text: ANAME[k] }; });
    h += '<h3>Origin increase</h3><p class="help">Raise one score by 2 and another by 1, or three different scores by 1. ' +
      "Any abilities may be raised (this is the “customising your origin” option; the Dungeon Master sees it).</p>";
    h += '<div class="opts" role="radiogroup" aria-label="Origin increase">' + radio("w.origin.mode", "2-1", o.mode, "+2 and +1", "o21") + radio("w.origin.mode", "1-1-1", o.mode, "+1, +1 and +1", "o111") + "</div>";
    h += '<div class="grid3">';
    if (o.mode === "2-1") {
      h += '<div><label class="lbl" for="o0">+2 to</label>' + select("w.origin.a.0", o.a[0], aOpts, { id: "o0", blank: "Choose…" }) + "</div>" +
        '<div><label class="lbl" for="o1">+1 to</label>' + select("w.origin.a.1", o.a[1], aOpts, { id: "o1", blank: "Choose…" }) + "</div>";
    } else {
      [0, 1, 2].forEach(function (i) { h += '<div><label class="lbl" for="o' + i + '">+1 to</label>' + select("w.origin.a." + i, o.a[i], aOpts, { id: "o" + i, blank: "Choose…" }) + "</div>"; });
    }
    h += "</div>";

    h += '<h3>Your scores</h3><table class="grid-table ab-table"><thead><tr><th>Ability</th><th>Base</th><th>Origin</th><th>Score</th><th>Mod.</th></tr></thead><tbody>' +
      AKEYS.map(function (k) {
        var f = info.final[k];
        return "<tr><td>" + esc(ANAME[k]) + "</td><td>" + (info.base[k] || "—") + "</td><td>" + (info.bonus[k] ? "+" + info.bonus[k] : "") + "</td><td" + (f > 20 ? ' class="over"' : "") + "><strong>" + (info.base[k] ? f : "—") +
          "</strong></td><td>" + (info.base[k] ? signed(mod(f)) : "") + "</td></tr>";
      }).join("") + "</tbody></table>";
    return h;
  }

  /* 4. Background */
  function stepBackground(built) {
    var d = S.d, w = S.w, info = built.info, bg = info.bg;
    var h = '<p class="help">Your background is what your adventurer did before adventuring. It gives two skills, and sometimes tools and languages. ' +
      "If you already have one of its skills (from your species, say), you may swap it for any other skill.</p>";
    h += '<div class="grid2"><div><label class="lbl" for="fBg">Background</label>' +
      select("d.background", d.background, R.backgrounds.map(function (b) { return { value: b.name, text: b.name + (b.source ? " (" + b.source + ")" : "") }; }), { id: "fBg", blank: "Choose…" }) +
      (bg ? '<p class="info">' + wiki(bg.url, "About the " + bg.name) + "</p>" : "") + "</div><div></div></div>";
    if (bg) {
      h += '<div class="derived">' +
        "<div><b>Skills</b>" + (esc(list(info.bgFixed.map(function (k) { return SNAME[k]; }))) + (info.bgChoice ? (info.bgFixed.length ? ", and " : "") + plural(info.bgChoice.count, "skill") + " of your choice" : "") || "None") + "</div>" +
        "<div><b>Tools</b>" + esc(bg.tools || "None") + "</div>" +
        "<div><b>Languages</b>" + (int(bg.languages, 0, 0, 9) ? plural(int(bg.languages, 0, 0, 9), "language") + " of your choice" : "None") + "</div></div>";
      if (info.bgChoice) {
        var bcItems = info.bgChoice.from.filter(function (k) { return info.bgFixed.indexOf(k) < 0; }).map(function (k) { return { value: k, text: SNAME[k] }; });
        h += "<h3>" + plural(info.bgChoice.count, "skill") + " of your choice " + counter(w.bgChoice.length, info.bgChoice.count) + "</h3>" +
          tickList("w.bgChoice", bcItems, w.bgChoice, info.bgChoice.count);
      }
      h += "<h3>Swap a skill you already have</h3>";
      info.bgSkills.forEach(function (k) {
        var others = SKEYS.filter(function (x) { return info.bgSkills.indexOf(x) < 0; }).map(function (x) { return { value: x, text: SNAME[x] }; });
        h += '<div class="swap-row"><label class="lbl" for="sw-' + esc(k) + '">' + esc(SNAME[k]) + "</label>" +
          select("w.bgSwap." + k, w.bgSwap[k] || "", others, { id: "sw-" + k, blank: "Keep " + SNAME[k] }) + "</div>";
      });
    }
    return h;
  }

  /* 5. Skills */
  function stepSkills(built) {
    var w = S.w, info = built.info, c = info.c;
    if (!c) return '<p class="empty-line">Choose a class in step 2 first.</p>';
    var n = skillCount(c), from = skillFrom(c);
    var h = '<p class="help">Choose ' + plural(n, "skill") + (c.skillChoices && c.skillChoices.from === "any" ? " (the " + esc(c.name) + " may choose any)" : " from the " + esc(c.name) + "’s list") + ". Skills your background already gives are ticked and cannot be chosen again. " +
      "You are also proficient in the " + esc(c.name) + "’s saving throws: " + esc(list((c.saves || []).map(function (k) { return ANAME[k] || k; }))) + ".</p>";
    h += "<h3>" + esc(c.name) + " skills " + counter(w.classSkills.length, n) + "</h3>";
    var items = from.map(function (k) {
      var bgHas = info.bgEffective.indexOf(k) >= 0 || info.bgSkills.indexOf(k) >= 0;
      return { value: k, text: SNAME[k], sub: (ANAME[abilityOfSkill(k)] || "") + (bgHas ? " · from your background" : ""), locked: bgHas && w.classSkills.indexOf(k) < 0 };
    });
    h += tickList("w.classSkills", items, w.classSkills, n);
    if (info.expertiseCount) {
      var prof = SKEYS.filter(function (k) { return info.skills[k] >= 1; });
      h += "<h3>Expertise " + counter(w.expertise.length, info.expertiseCount) + '</h3><p class="help">The ' + esc(c.name) +
        " doubles the proficiency bonus for " + plural(info.expertiseCount, "skill") + " it is proficient in (or one skill and thieves’ tools: note that for the Dungeon Master in the feature notes later).</p>";
      h += tickList("w.expertise", prof.map(function (k) { return { value: k, text: SNAME[k] }; }), w.expertise, info.expertiseCount);
    }
    h += '<h3>All your skills</h3><p class="info">' + esc(list(SKEYS.filter(function (k) { return info.skills[k]; }).map(function (k) { return SNAME[k] + (info.skills[k] === 2 ? " (expertise)" : ""); })) || "None yet.") + "</p>";
    return h;
  }
  function abilityOfSkill(k) { var s = SKILLS.filter(function (x) { return x.key === k; })[0]; return s ? s.ability : ""; }

  /* 6. Spells */
  function stepSpells(built) {
    var w = S.w, info = built.info, c = info.c, nd = info.needs;
    if (!c) return '<p class="empty-line">Choose a class in step 2 first.</p>';
    if (!c.spellcasting) return '<p class="help">The ' + esc(c.name) + " casts no spells. Nothing to choose here: go on to the next step.</p>";
    if (!nd.cantrips && !nd.known && !nd.book && !nd.prepared) return '<p class="help">The ' + esc(c.name) + "’s spells begin at a later level (" + wiki(c.url, "see its page") + "). Nothing to choose at level 1: go on to the next step.</p>";
    var sc = c.spellcasting, abil = ANAME[sc.ability] || sc.ability, m = mod(info.final[sc.ability]);
    var h = '<p class="help">The ' + esc(c.name) + " casts with " + esc(abil) + " (modifier " + signed(m) + "). Only spells on the " + esc(c.name) + " list, and only of a level you can cast now. ";
    if (nd.type === "known") h += "You know " + plural(nd.cantrips, "cantrip") + " and " + plural(nd.known, "spell") + ".";
    else if (nd.type === "spellbook") h += "You know " + plural(nd.cantrips, "cantrip") + ". Your spellbook holds " + plural(nd.book, "1st-level spell") + "; each day you prepare " + plural(nd.prepared, "of them", "of them") + " (Intelligence modifier + your level).";
    else h += "You know " + plural(nd.cantrips, "cantrip") + (nd.prepared ? " and prepare " + plural(nd.prepared, "spell") + " each day from the whole " + esc(c.name) + " list (" + esc(prepFormula(c)) + "); you can change them after a long rest." : ". Spells come at level 2.");
    h += "</p>";
    if (nd.cantrips) {
      h += "<h3>Cantrips " + counter(w.cantrips.length, nd.cantrips) + "</h3>";
      h += tickList("w.cantrips", spellItems(classSpells(c, 0, 0)), w.cantrips, nd.cantrips);
    }
    if (nd.type === "known" && nd.known) {
      h += "<h3>Spells known " + counter(w.spells.length, nd.known) + "</h3>";
      h += tickList("w.spells", spellItems(classSpells(c, 1, nd.maxLevel)), w.spells, nd.known);
    } else if (nd.type === "spellbook" && nd.book) {
      h += "<h3>Your spellbook " + counter(w.spells.length, nd.book) + "</h3>";
      h += tickList("w.spells", spellItems(classSpells(c, 1, 1)), w.spells, nd.book);
      h += "<h3>Prepared today " + counter(w.prepared.length, nd.prepared) + "</h3>";
      if (!w.spells.length) h += '<p class="empty-line">Fill your spellbook first.</p>';
      else h += tickList("w.prepared", spellItems(w.spells.map(spellOf).filter(Boolean)), w.prepared, nd.prepared);
    } else if (nd.prepared) {
      h += "<h3>Prepared spells " + counter(w.spells.length, nd.prepared) + "</h3>";
      h += tickList("w.spells", spellItems(classSpells(c, 1, nd.maxLevel)), w.spells, nd.prepared);
    }
    return h;
  }
  function prepFormula(c) {
    var sc = c.spellcasting;
    return (ANAME[sc.ability] || sc.ability) + " modifier + " + (sc.prepared === "ability+half" ? "half your level (rounded down), at least 1" : "your level");
  }
  function spellItems(spells) {
    return spells.map(function (s) {
      var tags = [s.level ? "level " + s.level : "cantrip", s.school].filter(Boolean);
      if (s.ritual) tags.push("ritual");
      if (s.concentration) tags.push("concentration");
      return { value: s.name, text: s.name, sub: tags.join(" · "), url: s.url };
    });
  }

  /* 7. Hit points & gear */
  function stepGear(built) {
    var d = S.d, w = S.w, info = built.info, c = info.c;
    var h = '<p class="help">These follow from what you have chosen. Your Armour Class is 10 + your Dexterity modifier without armour; ' +
      "if your armour or a feature gives another, enter it and say where it comes from: the Dungeon Master checks it. " + wiki(WIKI + "equipment", "Equipment on the wiki") + ".</p>";
    h += '<div class="derived">' +
      '<div><b>Hit points</b><span class="big">' + info.hpMax + "</span>" +
      '<span class="tracker-note">' + (c && info.die ? "Hit die " + info.die + " + Constitution " + signed(info.conMod) + (info.die + info.conMod < 1 ? ", at least 1" : "") : c ? "Agree the hit die with the Dungeon Master (step 2)" : "Choose a class first") + ".</span></div>" +
      '<div><b>Armour Class</b><span class="big">' + info.ac + '</span><span class="tracker-note">' + (w.acCustom ? "From your armour or a feature" : "10 + Dexterity " + signed(info.dexMod)) + ".</span></div>" +
      '<div><b>Speed</b><span class="big">' + (info.speed || "—") + ' ft.</span><span class="tracker-note">From your species.</span></div>' +
      '<div><b>Size</b><span class="big">' + esc(info.size || "—") + '</span><span class="tracker-note">From your species.</span></div>' +
      "</div>";
    h += "<h3>Armour Class</h3>" + '<div class="opts" role="radiogroup" aria-label="Armour Class">' +
      radio("w.acCustom", "false", String(w.acCustom), "Unarmoured: 10 + Dexterity (" + info.acDefault + ")", "acU") +
      radio("w.acCustom", "true", String(w.acCustom), "From my armour or a feature", "acC") + "</div>";
    if (w.acCustom) {
      h += '<div class="grid2"><div><label class="lbl" for="fAc">Armour Class</label>' + input("d.ac", d.ac, { id: "fAc", max: 2, type: "number" }) + "</div>" +
        '<div><label class="lbl" for="fAcNote">From your armour (or what gives it)</label>' + input("w.acNote", w.acNote, { id: "fAcNote", max: 200, placeholder: "e.g. chain mail and a shield" }) + "</div></div>";
    }
    h += '<label class="lbl" for="fEq" style="margin-top:.8rem">Equipment</label>' +
      '<p class="info" style="margin-top:0">What you carry: your class’s and background’s starting equipment, as the wiki lists them.</p>' +
      textarea("d.equipment", d.equipment, 5, "fEq", 8000);
    return h;
  }

  /* 8. Details */
  function stepDetails(built) {
    var d = S.d, w = S.w, info = built.info, c = info.c, bg = info.bg;
    if (!w.toolsSet) {
      var parts = [c && c.tools, bg && bg.tools].filter(function (x) { return trim(x); });
      if (!trim(d.tools) && parts.length) d.tools = parts.join("; ");
      w.toolsSet = true;
    }
    var nl = bg ? int(bg.languages, 0, 0, 9) : 0;
    var feats = R.feats.map(function (f) { return { value: f.name, text: f.name + (f.prerequisite ? " (needs: " + f.prerequisite + ")" : "") }; });
    var ft = findByName(R.feats, d.feat);
    var h = '<p class="help">All of these can be changed on the sheet later.</p>';
    h += '<div class="grid2"><div><label class="lbl" for="fLang">Languages</label>' + input("d.languages", d.languages, { id: "fLang", max: 300, placeholder: "e.g. Common, Elvish" }) +
      '<p class="info">Common and your species’ languages' + (nl ? ", plus " + plural(nl, "language") + " of your choice from your background" : "") + ".</p></div>" +
      '<div><label class="lbl" for="fTools">Tools</label>' + input("d.tools", d.tools, { id: "fTools", max: 300 }) +
      '<p class="info">From your class and background: choose the exact ones where it says “one type of”.</p></div></div>';
    h += '<div class="grid2"><div><label class="lbl" for="fFeat">Feat (optional)</label>' + select("d.feat", d.feat, feats, { id: "fFeat", blank: "No feat" }) +
      '<p class="info">Only if your species or the Dungeon Master grants one at level 1 (for example a variant human or a custom lineage). The Dungeon Master checks.' +
      (ft ? " " + wiki(ft.url, "About " + ft.name) + "." : "") + "</p></div><div></div></div>";
    h += '<div class="grid2">' +
      '<div><label class="lbl" for="fPers">Personality traits</label>' + textarea("d.personality", d.personality, 3, "fPers", 4000) + "</div>" +
      '<div><label class="lbl" for="fIdeals">Ideals</label>' + textarea("d.ideals", d.ideals, 3, "fIdeals", 4000) + "</div>" +
      '<div><label class="lbl" for="fBonds">Bonds</label>' + textarea("d.bonds", d.bonds, 3, "fBonds", 4000) + "</div>" +
      '<div><label class="lbl" for="fFlaws">Flaws</label>' + textarea("d.flaws", d.flaws, 3, "fFlaws", 4000) + "</div></div>";
    h += '<label class="lbl" for="fApp" style="margin-top:.8rem">Appearance</label>' + textarea("d.appearance", d.appearance, 3, "fApp", 4000) +
      '<label class="lbl" for="fStory" style="margin-top:.8rem">Backstory</label>' + textarea("d.backstory", d.backstory, 8, "fStory", 20000);
    return h;
  }

  /* 9. Review (in the editor) */
  function stepReview(built, L) {
    var ok = L.every(function (x) { return x.ok; });
    var h = '<section class="create-panel" aria-labelledby="stepTitle"><h2 id="stepTitle">9. Review</h2>' +
      "<p>This is the sheet as it will be. Every rule is listed below; when all are ticked, send it to the Dungeon Master. " +
      "Notes marked ! are for the Dungeon Master to agree, and do not stop you.</p>" +
      checklistHtml(L) + abilityRecord(built.info, S.w) +
      '<p style="margin-top:1rem"><button type="button" class="btn" data-act="submit" data-f="submit"' + (ok ? "" : " disabled") + ">Send to the Dungeon Master</button> " +
      (ok ? "" : '<span class="xp-hint">Fix the points marked ✗ first.</span>') + "</p></section>";
    h += sheetHtml(built.data, built.play);
    return h;
  }

  function checklistHtml(L) {
    var h = "";
    STEPS.forEach(function (name, i) {
      var items = L.filter(function (x) { return x.step === i; });
      if (!items.length) return;
      h += "<h3>" + (i + 1) + ". " + esc(name) + '</h3><ul class="checklist">' + items.map(function (x) {
        return '<li class="' + (x.flag ? "flag" : x.ok ? "ok" : "bad") + '">' + (x.flag ? "<em>Note for the Dungeon Master:</em> " : "") + esc(x.label) +
          (x.problem ? '<span class="why">' + esc(x.problem) + "</span>" : "") + "</li>";
      }).join("") + "</ul>";
    });
    return h;
  }

  // How the scores were found, for the review.
  function abilityRecord(info, w) {
    var h = "<h3>How the ability scores were found</h3>";
    if (w.method === "pointbuy") h += "<p>Point buy: " + AKEYS.map(function (k) { return ANAME[k] + " " + w.pointBuy[k]; }).join(", ") + " (" + info.spent + " of " + esc(R.pointBuy.budget) + " points).</p>";
    else if (w.method === "roll" && w.rolls) h += "<p>Rolled " + esc(fmtDateTime(w.rolls.rolledAt)) + ": " + w.rolls.sets.map(function (s, i) {
      return "roll " + (i + 1) + " [" + s.join(", ") + "] = " + rollTotal(s);
    }).join("; ") + ".</p><p>Placed: " + AKEYS.map(function (k) { return ANAME[k] + " " + (w.assign[k] >= 0 ? "roll " + (w.assign[k] + 1) : "none"); }).join(", ") + ".</p>";
    else h += '<p class="empty-line">Not chosen yet.</p>';
    if (w.rolls && w.method !== "roll") h += "<p>Dice also rolled (" + esc(fmtDateTime(w.rolls.rolledAt)) + "): " + w.rolls.sets.map(rollTotal).join(", ") + ".</p>";
    h += "<p>Origin increase: " + (AKEYS.filter(function (k) { return info.bonus[k]; }).map(function (k) { return ANAME[k] + " +" + info.bonus[k]; }).join(", ") || "none yet") + ".</p>";
    return h;
  }

  /* ------------------------------------------- the sheet, read only */
  function sheetHtml(d, p) {
    d = obj(d); p = obj(p);
    var ab = obj(d.abilities), sk = obj(d.skills), classes = Array.isArray(d.classes) ? d.classes : [];
    var level = classes.reduce(function (n, c) { return n + int(obj(c).level, 0, 0, 20); }, 0) || 1;
    var pbn = int(R.proficiencyBonus[level - 1], 2, 2, 6);
    var saves = Array.isArray(d.saves) ? d.saves : [];
    var classLine = classes.map(function (c) { c = obj(c); var rc = classOf(c.key); return (rc ? wiki(rc.url, c.name || rc.name) : esc(c.name)) + " " + int(c.level, 1, 1, 20) + (c.subclass ? " (" + esc(c.subclass) + ")" : ""); }).join(" / ");
    var sp = findByName(R.species, d.species), bg = findByName(R.backgrounds, d.background);
    var h = '<section class="page dnd-sheet" aria-label="Character sheet">';
    h += '<div class="dnd-head"><div class="dnd-name">' + esc(d.name || "Unnamed") + "</div>" +
      '<div class="dnd-line">Level ' + level + " · " + (classLine || "no class") + "</div>" +
      '<div class="dnd-line">' + (sp ? wiki(sp.url, d.species) : esc(d.species || "—")) + (d.subspecies ? " (" + esc(d.subspecies) + ")" : "") +
      " · " + (bg ? wiki(bg.url, d.background) : esc(d.background || "—")) + " · " + esc(d.alignment || "—") + "</div></div>";
    var perc = mod(ab.wis) + int(sk.perception, 0, 0, 2) * pbn;
    h += '<div class="dnd-stats">' +
      stat("Proficiency", signed(pbn)) + stat("Armour Class", int(d.ac, 10, 0, 99)) + stat("Hit points", int(d.hpMax, 0, 0, 999)) +
      stat("Speed", int(d.speed, 0, 0, 999) + " ft.") + stat("Initiative", signed(mod(ab.dex))) + stat("Passive Perception", 10 + perc) +
      stat("Hit dice", classes.map(function (c) { c = obj(c); return int(c.level, 1, 1, 20) + "d" + int(c.hitDie, 8, 4, 12); }).join(" + ") || "—") + stat("Size", esc(d.size || "—")) + "</div>";
    h += '<h3>Ability scores</h3><div class="ab-grid">' + AKEYS.map(function (k) {
      var v = int(ab[k], 10, 0, 40), m = mod(v), prof = saves.indexOf(k) >= 0;
      return '<div class="ab-box"><b>' + esc(ANAME[k]) + '</b><span class="ab-score">' + v + '</span><span class="ab-mod">' + signed(m) + "</span>" +
        '<span class="ab-save"><span class="dot' + (prof ? " on" : "") + '" aria-hidden="true"></span> Save ' + signed(m + (prof ? pbn : 0)) + "</span></div>";
    }).join("") + "</div>";
    h += '<h3>Skills</h3><div class="skill-cols">' + SKILLS.map(function (s) {
      var lv = int(sk[s.key], 0, 0, 2);
      return '<div class="trait"><span class="trait-name"><span class="dot' + (lv ? " on" : "") + (lv === 2 ? " exp" : "") + '" aria-hidden="true"></span> ' + esc(s.name) +
        " <small>" + esc((ANAME[s.ability] || "").slice(0, 3)) + (lv === 2 ? " · expertise" : lv ? " · proficient" : "") + '</small></span><span class="trait-end">' + signed(mod(ab[s.ability]) + lv * pbn) + "</span></div>";
    }).join("") + "</div>";
    var spells = Array.isArray(d.spells) ? d.spells : [];
    if (spells.length) {
      h += "<h3>Spells</h3>";
      classes.forEach(function (c) {
        c = obj(c);
        var rc = classOf(c.key), sc = rc && rc.spellcasting;
        if (!sc) return;
        var m = mod(ab[sc.ability]);
        h += '<p class="info">' + esc(c.name) + ": " + esc(ANAME[sc.ability] || sc.ability) + ", save DC " + (8 + pbn + m) + ", attack " + signed(pbn + m) + ".</p>";
      });
      var byL = {};
      spells.forEach(function (s) { s = obj(s); var l = int(s.level, 0, 0, 9); (byL[l] = byL[l] || []).push(s); });
      h += '<table class="grid-table spell-table"><tbody>' + Object.keys(byL).sort().map(function (l) {
        return "<tr><th>" + (+l === 0 ? "Cantrips" : "Level " + l) + "</th><td>" + byL[l].map(function (s) {
          var r = spellOf(s.name), cl = classOf(s.class);
          return (r ? wiki(r.url, s.name) : esc(s.name)) + (+l > 0 && s.prepared === false ? ' <small class="unprep">(in the book, not prepared)</small>' : "") +
            (classes.length > 1 && cl ? " <small>" + esc(cl.name) + "</small>" : "");
        }).join(", ") + "</td></tr>";
      }).join("") + "</tbody></table>";
    }
    var feats = (Array.isArray(d.feats) ? d.feats : []).map(function (f) { f = obj(f); var r = findByName(R.feats, f.name); return r ? wiki(r.url, f.name) : esc(f.name); });
    h += '<h3>Proficiencies</h3><table class="grid-table"><tbody>' +
      "<tr><th>Armour</th><td>" + esc(d.armor || "None") + "</td></tr><tr><th>Weapons</th><td>" + esc(d.weapons || "None") + "</td></tr>" +
      "<tr><th>Tools</th><td>" + esc(d.tools || "None") + "</td></tr><tr><th>Languages</th><td>" + esc(d.languages || "—") + "</td></tr>" +
      "<tr><th>Feats</th><td>" + (feats.join(", ") || "None") + "</td></tr></tbody></table>";
    h += "<h3>Equipment</h3>" + prose(d.equipment);
    h += '<h3>Personality</h3><div class="split">' + labelled("Personality traits", d.personality) + labelled("Ideals", d.ideals) + labelled("Bonds", d.bonds) + labelled("Flaws", d.flaws) + "</div>";
    h += "<h3>Appearance</h3>" + prose(d.appearance) + "<h3>Backstory</h3>" + prose(d.backstory);
    return h + "</section>";
  }
  function stat(label, v) { return '<div class="dnd-stat"><b>' + esc(label) + "</b><span>" + v + "</span></div>"; }
  function prose(v) { return trim(v) ? '<div class="prose-box">' + esc(v) + "</div>" : '<p class="empty-line">—</p>'; }
  function labelled(label, v) { return '<div class="labelled"><b>' + esc(label) + '</b><div class="prose-box">' + (trim(v) ? esc(v) : "—") + "</div></div>"; }

  /* ------------------------------------------------- the review view */
  function renderReview() {
    var row = S.row, data = obj(row.data), play = obj(row.play);
    var stored = { data: data, play: play };
    var L = checks(S.d, S.w, stored);
    var bad = L.filter(function (x) { return !x.ok; }), flags = L.filter(function (x) { return x.flag; });
    var info = compute(S.d, S.w);
    var h = '<div class="sheet-bar"><a class="btn btn--ghost" href="' + esc(link("")) + '">&larr; ' + (isDM() ? "All drafts" : "Your adventurers") + "</a></div>";
    h += '<section class="create-panel" aria-labelledby="revTitle"><h2 id="revTitle">' + esc(row.name || "Unnamed") + "</h2>" +
      "<p><strong>" + esc(STATUS[row.status] || row.status) + "</strong> · by " + esc(row.email) +
      " · started " + esc(fmtDate(row.created_at)) + (row.submitted_at ? " · sent " + esc(fmtDateTime(row.submitted_at)) : "") +
      (row.decided_at ? " · decided " + esc(fmtDate(row.decided_at)) : "") + "</p>";
    if (row.note) h += '<div class="sheet-notice rejected-note"><strong>Dungeon Master’s note:</strong> ' + esc(row.note) + "</div>";
    if (row.status === "approved" && row.sheet_slug) h += '<p><a class="btn" href="sheet.html?c=' + esc(encodeURIComponent(row.sheet_slug)) + '">Open the character sheet</a></p>';
    h += bad.length
      ? '<div class="problems" role="alert"><h3>' + plural(bad.length, "rule") + " not met</h3><ul>" + bad.map(function (x) { return "<li>" + esc(x.problem) + "</li>"; }).join("") + "</ul></div>"
      : '<p class="step-ok">Every rule is met.' + (flags.length ? " " + plural(flags.length, "note") + " for the Dungeon Master below." : "") + "</p>";

    if (isDM() && row.status === "submitted") {
      h += '<p class="step-nav" style="margin:.6rem 0"><button type="button" class="btn" data-act="approve" data-f="approve">Approve</button>' +
        '<button type="button" class="btn btn--ghost" data-act="sendback" data-f="sendback">Send back</button></p>';
    } else if (mine(row) && row.status === "submitted") {
      h += '<p class="step-nav" style="margin:.6rem 0"><button type="button" class="btn btn--ghost" data-act="withdraw" data-id="' + esc(row.id) + '">Withdraw</button></p>';
    } else if (mine(row) && (row.status === "draft" || row.status === "rejected")) {
      h += '<p><a class="btn" href="' + esc(link("draft=" + encodeURIComponent(row.id))) + '">Continue</a></p>';
    }
    h += abilityRecord(info, S.w);
    h += checklistHtml(L) + "</section>";
    h += sheetHtml(data, play);
    root().innerHTML = h;
  }

  /* --------------------------------------------- Dungeon Master actions */
  function slugify(name) {
    var s = String(name || "");
    if (s.normalize) s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "") || "adventurer";
  }
  function openApprove() {
    var bad = checks(S.d, S.w, { data: obj(S.row.data), play: obj(S.row.play) }).filter(function (x) { return !x.ok; });
    if (bad.length && !window.confirm("This draft breaks " + plural(bad.length, "rule") + " (listed in red). Approve it anyway?")) return;
    $("approveSlug").value = slugify(S.row.name);
    $("approveNote").value = "";
    $("approveMsg").textContent = "";
    $("approveSend").disabled = false;
    $("approveDialog").showModal();
    $("approveSlug").focus();
  }
  function openReject() {
    $("rejectNote").value = "";
    $("rejectMsg").textContent = "";
    $("rejectSend").disabled = false;
    $("rejectDialog").showModal();
    $("rejectNote").focus();
  }
  $("approveCancel").addEventListener("click", function () { $("approveDialog").close(); });
  $("rejectCancel").addEventListener("click", function () { $("rejectDialog").close(); });
  $("approveForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var slug = $("approveSlug").value.trim().toLowerCase(), msg = $("approveMsg");
    if (!/^[a-z0-9-]{1,40}$/.test(slug)) { msg.textContent = "Use only lower-case letters, digits and hyphens, at most 40."; return; }
    $("approveSend").disabled = true; msg.textContent = "Approving…";
    try {
      var r = await S.db.rpc("approve_draft", { p_id: +S.row.id, p_slug: slug, p_note: $("approveNote").value.trim() });
      if (r.error) throw r.error;
      $("approveDialog").close();
      toast("Approved: the character sheet is made.");
      var row = await fetchRow(S.row.id);
      if (row) { loadRow(row); renderReview(); }
      var bar = root().querySelector(".sheet-bar");
      if (bar) bar.insertAdjacentHTML("afterend", '<div class="sheet-notice">Approved. The sheet is at <a href="sheet.html?c=' + esc(encodeURIComponent(slug)) + '">sheet.html?c=' + esc(slug) + "</a>.</div>");
    } catch (err) {
      console.error(err);
      msg.textContent = "Not approved: " + errText(err);
      $("approveSend").disabled = false;
    }
  });
  $("rejectForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var note = $("rejectNote").value.trim(), msg = $("rejectMsg");
    if (!note) { msg.textContent = "Write a note so the player knows what to change."; return; }
    $("rejectSend").disabled = true; msg.textContent = "Sending…";
    try {
      var r = await S.db.rpc("reject_draft", { p_id: +S.row.id, p_note: note });
      if (r.error) throw r.error;
      $("rejectDialog").close();
      toast("Sent back to the player.");
      var row = await fetchRow(S.row.id);
      if (row) { loadRow(row); renderReview(); }
    } catch (err) {
      console.error(err);
      msg.textContent = "Not sent: " + errText(err);
      $("rejectSend").disabled = false;
    }
  });

  /* ---------------------------------------------------- editing state */
  function getPath(path) {
    var parts = path.split("."), o = S;
    for (var i = 0; i < parts.length; i++) { if (o == null) return undefined; o = o[parts[i]]; }
    return o;
  }
  function setPath(path, value) {
    var parts = path.split("."), o = S;
    for (var i = 0; i < parts.length - 1; i++) { if (o[parts[i]] == null) return; o = o[parts[i]]; }
    var last = parts[parts.length - 1];
    if (/^w\.bgSwap\./.test(path) && !value) delete o[last];
    else o[last] = value;
  }

  function onChanged(path, old) {
    var d = S.d, w = S.w;
    if (path === "d.species" && !same(old, d.species)) { d.subspecies = ""; d.size = ""; }
    if (path === "d.cls" && old !== d.cls) {
      d.subclass = ""; d.hitDie = ""; w.classSkills = []; w.expertise = []; w.cantrips = []; w.spells = []; w.prepared = [];
      w.toolsSet = false; d.tools = "";
    }
    if (path === "d.background" && !same(old, d.background)) {
      w.bgSwap = {}; w.bgChoice = []; w.toolsSet = false; d.tools = "";
      var info = compute(d, w);
      w.classSkills = w.classSkills.filter(function (k) { return info.bgSkills.indexOf(k) < 0; });
    }
    if (/^w\.bgSwap\./.test(path) || path === "w.bgChoice") {
      var inf = compute(d, w);
      w.classSkills = w.classSkills.filter(function (k) { return inf.bgEffective.indexOf(k) < 0; });
    }
    if (path === "w.origin.mode") w.origin.a = ["", "", ""];
    if (path === "w.method" && old !== w.method) { /* the dice stay recorded either way */ }
    if (path === "w.acCustom") {
      w.acCustom = w.acCustom === true || w.acCustom === "true";
      if (w.acCustom && !trim(d.ac)) d.ac = String(compute(d, w).acDefault);
    }
    // keep the dependent lists honest
    var inf2 = compute(d, w);
    w.expertise = w.expertise.filter(function (k) { return inf2.skills[k] >= 1; });
    w.prepared = w.prepared.filter(function (n) { return w.spells.indexOf(n) >= 0; });
  }

  function goStep(n) {
    var L = checks(S.d, S.w), from = S.w.step;
    n = Math.max(0, Math.min(REVIEW, n));
    if (n > from) {
      for (var i = from; i < n; i++) {
        if (problemsFor(L, i).length) {
          S.w.step = i; S.flash = true; render(); S.flash = false;
          var box = $("problems");
          if (box) box.scrollIntoView({ block: "center", behavior: "smooth" });
          toast("Not yet: " + problemsFor(L, i)[0].problem);
          return;
        }
      }
    }
    S.w.step = n;
    render();
    var top = root().querySelector(".steps");
    if (top) top.scrollIntoView({ block: "start", behavior: "smooth" });
    save(true);
  }

  async function rollDice() {
    if (S.w.rolls) return;
    var sets = [];
    for (var i = 0; i < 6; i++) sets.push([randInt(6), randInt(6), randInt(6), randInt(6)]);
    S.w.rolls = { sets: sets, rolledAt: new Date().toISOString() };
    AKEYS.forEach(function (k) { S.w.assign[k] = -1; });
    render();
    await save(true);
  }

  async function submit() {
    var L = checks(S.d, S.w);
    if (!L.every(function (x) { return x.ok; })) { toast("Some rules are not met yet."); return; }
    if (!window.confirm("Send " + (trim(S.d.name) || "this adventurer") + " to the Dungeon Master? You cannot change it while it waits, but you can withdraw it.")) return;
    var ok = await save(true);
    if (!ok) return;
    try {
      var r = await S.db.rpc("submit_draft", { p_id: +S.id });
      if (r.error) throw r.error;
      S.dirty = false;
      toast("Sent to the Dungeon Master.");
      window.location.href = link("");
    } catch (e) {
      console.error(e);
      setStatus("Not sent: " + errText(e), true);
      window.alert("Not sent: " + errText(e));
    }
  }

  /* ----------------------------------------------------------- events */
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]");
    if (!b || !root() || !root().contains(b)) return;
    var a = b.getAttribute("data-act");
    if (a === "withdraw" || a === "delete") { listAction(a, b.getAttribute("data-id")); return; }
    if (a === "approve") { openApprove(); return; }
    if (a === "sendback") { openReject(); return; }
    if (S.mode !== "edit") return;
    var w = S.w;
    if (a === "leave") {
      e.preventDefault();
      var href = b.getAttribute("href");
      save(true).then(function (ok) {
        if (ok || window.confirm("The draft could not be saved. Leave anyway?")) { S.dirty = false; window.location.href = href; }
      });
      return;
    }
    if (a === "pb") {
      var k = b.getAttribute("data-k"), dd = +b.getAttribute("data-d");
      if (AKEYS.indexOf(k) >= 0) w.pointBuy[k] = int(w.pointBuy[k] + dd, 8, int(R.pointBuy.min, 8, 1, 30), int(R.pointBuy.max, 15, 1, 30));
      S.dirty = true;
      render();
    } else if (a === "go") goStep(+b.getAttribute("data-step"));
    else if (a === "next") goStep(w.step + 1);
    else if (a === "back") goStep(w.step - 1);
    else if (a === "save") save(false);
    else if (a === "roll") rollDice();
    else if (a === "submit") submit();
  });

  document.addEventListener("input", function (e) {
    var t = e.target;
    if (t.matches && t.matches("input[data-filter]") && root() && root().contains(t)) { applyFilter(t); return; }
    if (S.mode !== "edit" || !root() || !root().contains(t) || !t.matches("input[data-bind]:not([type=radio]), textarea[data-bind]")) return;
    setPath(t.getAttribute("data-bind"), t.value);
    if (t.getAttribute("data-bind") === "d.ac") {
      // the derived boxes show the AC: keep them in step without stealing focus
      var big = root().querySelectorAll(".derived .big")[1];
      if (big) big.textContent = String(compute(S.d, S.w).ac);
    }
    softRefresh();
  });

  // Narrow a long list without redrawing it (ticked items always stay visible).
  function applyFilter(t) {
    var path = t.getAttribute("data-filter"), f = trim(t.value).toLowerCase(), grid = t.nextElementSibling;
    S.filters[path] = t.value;
    if (!grid) return;
    grid.querySelectorAll(".tick").forEach(function (el) {
      var on = el.classList.contains("on");
      el.classList.toggle("hide", !!f && !on && (el.getAttribute("data-text") || "").indexOf(f) < 0);
    });
  }

  document.addEventListener("change", function (e) {
    var t = e.target;
    if (S.mode !== "edit" || !root() || !root().contains(t)) return;
    var w = S.w;
    if (t.matches("input[type=checkbox][data-toggle]")) {
      var arr = getPath(t.getAttribute("data-toggle"));
      if (!Array.isArray(arr)) return;
      var i = arr.indexOf(t.value);
      if (t.checked && i < 0) arr.push(t.value);
      if (!t.checked && i >= 0) arr.splice(i, 1);
      onChanged(t.getAttribute("data-toggle"), null);
      S.dirty = true;
      render();
      return;
    }
    if (!t.matches("select[data-bind], input[type=radio][data-bind]")) return;
    var path = t.getAttribute("data-bind"), old = getPath(path);
    var val = t.value;
    var am = path.match(/^w\.assign\.(\w+)$/);
    if (am) {
      val = t.value === "" ? -1 : int(t.value, -1, -1, 5);
      // a roll goes to one ability: the one that had it takes this one's old roll
      if (val >= 0) AKEYS.forEach(function (k) { if (k !== am[1] && w.assign[k] === val) w.assign[k] = old; });
    }
    var om = path.match(/^w\.origin\.a\.(\d)$/);
    if (om) { w.origin.a[+om[1]] = val; onChanged(path, old); S.dirty = true; render(); return; }
    setPath(path, val);
    onChanged(path, old);
    S.dirty = true;
    render();
  });

  window.addEventListener("beforeunload", function (e) {
    if (S.mode === "edit" && (S.dirty || S.saving)) { e.preventDefault(); e.returnValue = ""; }
  });
})();
