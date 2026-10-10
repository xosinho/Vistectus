/* =====================================================================
   D&D 5e — Level up (shared by every campaign)
   ---------------------------------------------------------------------
   levelup.html?c=<slug> — for the sheet's player (sheet_role "owner")
   and the campaign's Dungeon Master.

   Shows the adventurer's level, the level they may reach now
   (dnd_allowed_level), the campaign's way of advancing (XP or
   milestones) and the level-up requests made for this sheet
   (dnd_levelups). When a level is free and nothing is waiting, the
   player goes up exactly one level, step by step:

     1. Class        an existing class, or a new one (multiclassing needs
                     the requirements of every current class AND the new)
     2. Hit points   roll the hit die once (recorded) or take the average,
                     plus the Constitution modifier, at least 1
     3. Features     the subclass at its level, Expertise, the skill a
                     few classes give when multiclassing into them
     4. Scores/feat  at the class's ASI levels: +2 to one score or +1 to
                     two (max 20), or a feat (flagged for the DM)
     5. Spells       new cantrips and spells from the class tables;
                     known casters may swap one; a wizard writes two
                     spells into the book; prepared casters re-pick
     6. Review       the new sheet against the old; sent with
                     dnd_request_levelup (the whole new data, one level
                     higher, the choices kept in data._levelup)

   The Dungeon Master sees a waiting request with a before/after summary,
   every rule checked again from the recorded choices, and Approve
   (dnd_approve_levelup) / Send back (dnd_close_levelup with a note).

   The choices in progress are kept in this browser (localStorage) so a
   reload does not lose them, or the hit-die roll.

   Proficiency bonus and spell slots are derived, never stored. Names,
   numbers and links come from window.DND_RULES (rules-5e.js); no rules
   text is copied: names link to https://dnd5e.wikidot.com/ (new tab).
   ===================================================================== */
(function () {
  "use strict";

  if (!window.Gate) return;

  var BODY = document.body;
  var CAMPAIGN = BODY.getAttribute("data-campaign") || "";
  var CAMPAIGN_NAME = BODY.getAttribute("data-campaign-name") || "the campaign";
  var R = window.DND_RULES || {};
  ["abilities", "skills", "feats", "classes", "spells", "proficiencyBonus", "xpThresholds"].forEach(function (k) {
    if (!Array.isArray(R[k])) R[k] = [];
  });
  if (!R.slots) R.slots = {};
  var WIKI = R.wiki || "https://dnd5e.wikidot.com/";

  var ABILS = R.abilities.length ? R.abilities : [["str", "Strength"], ["dex", "Dexterity"], ["con", "Constitution"], ["int", "Intelligence"], ["wis", "Wisdom"], ["cha", "Charisma"]];
  var AKEYS = ABILS.map(function (a) { return a[0]; });
  var ANAME = {};
  ABILS.forEach(function (a) { ANAME[a[0]] = a[1]; });
  var SKILLS = R.skills;
  var SKEYS = SKILLS.map(function (s) { return s.key; });
  var SNAME = {};
  SKILLS.forEach(function (s) { SNAME[s.key] = s.name; });

  var BOOK_AT_1 = 6, BOOK_PER_LEVEL = 2;
  var STANDARD_CLASSES = ["artificer", "barbarian", "bard", "cleric", "druid", "fighter", "monk", "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard"];
  var DICE = [6, 8, 10, 12];
  var EXPERTISE = { rogue: { 1: 2, 6: 2 }, bard: { 3: 2, 10: 2 } };
  // What a class gives when multiclassing into it (Player's Handbook, Multiclassing).
  var MC_GAINS = {
    artificer: { armor: "Light armor, medium armor, shields", tools: "Thieves' tools, tinker's tools" },
    barbarian: { armor: "Shields", weapons: "Simple weapons, martial weapons" },
    bard: { armor: "Light armor", tools: "One musical instrument of your choice", skill: "any" },
    cleric: { armor: "Light armor, medium armor, shields" },
    druid: { armor: "Light armor, medium armor, shields" },
    fighter: { armor: "Light armor, medium armor, shields", weapons: "Simple weapons, martial weapons" },
    monk: { weapons: "Simple weapons, shortswords" },
    paladin: { armor: "Light armor, medium armor, shields", weapons: "Simple weapons, martial weapons" },
    ranger: { armor: "Light armor, medium armor, shields", weapons: "Simple weapons, martial weapons", skill: "class" },
    rogue: { armor: "Light armor", tools: "Thieves' tools", skill: "class" },
    sorcerer: {},
    warlock: { armor: "Light armor", weapons: "Simple weapons" },
    wizard: {}
  };

  var STEPS = ["Class", "Hit points", "Class features", "Scores or feat", "Spells", "Review"];
  var REVIEW = STEPS.length - 1;
  var RSTATUS = { pending: "Waiting for the Dungeon Master", approved: "Approved", rejected: "Sent back", cancelled: "Withdrawn" };

  var S = {
    db: null, role: "player", email: "", slug: "",
    sheet: null, raw: null, cur: null, sheetRole: "viewer", allowed: 0, adv: { mode: "", start: 1 }, reqs: [],
    mode: "view", u: null, flash: false, review: null, filters: {}
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
  function clone(v) { return JSON.parse(JSON.stringify(v == null ? null : v)); }
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
  function ord(n) { return n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"); }
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
  function wiki(url, text) {
    return url && /^https?:\/\/(www\.)?dnd5e\.wikidot\.com\//i.test(String(url))
      ? '<a href="' + esc(url) + '" target="_blank" rel="noopener" title="Open on dnd5e.wikidot.com (new tab)">' + esc(text) + "</a>" : esc(text);
  }
  function wikiIcon(url, name) {
    return /^https?:\/\/(www\.)?dnd5e\.wikidot\.com\//i.test(String(url || ""))
      ? '<a class="wiki-link" href="' + esc(url) + '" target="_blank" rel="noopener" aria-label="' + esc(name) + ' on the wiki (new tab)" title="Open on the wiki (new tab)">↗</a>' : "";
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
  function spellOf(name) { return findByName(R.spells, name); }
  function skillFrom(c) {
    if (!c || !c.skillChoices) return [];
    return c.skillChoices.from === "any" || !Array.isArray(c.skillChoices.from) ? SKEYS.slice() : c.skillChoices.from.filter(function (k) { return SNAME[k]; });
  }
  // Who casts for a class: the class itself, or its subclass (an Eldritch
  // Knight, an Arcane Trickster: a third caster on the Wizard list). The
  // result looks like a class: key = the spell list, name, spellcasting.
  function casterOf(c, subName) {
    if (!c) return null;
    if (c.spellcasting) return { key: c.spellcasting.list || c.key, name: c.name, spellcasting: c.spellcasting, sub: "" };
    var s = findByName(c.subclasses, subName);
    if (s && s.spellcasting) {
      var lk = s.spellcasting.list || "wizard", lc = classOf(lk);
      return { key: lk, name: lc ? lc.name : lk, spellcasting: s.spellcasting, sub: s.name };
    }
    return null;
  }
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
  // The highest spell level a class can learn at a class level: as if
  // single-classed (multiclass slots never raise it).
  function maxSpellLevel(c, lvl) {
    var r = classSlotRow(c, lvl);
    if (!r) return 0;
    if (r.pact) return r.slots > 0 ? r.level : 0;
    var m = 0;
    r.row.forEach(function (n, i) { if (n > 0) m = i + 1; });
    return m;
  }
  function cantripsAt(c, lvl) { var sc = c && c.spellcasting; return lvl >= 1 && sc && Array.isArray(sc.cantrips) ? int(sc.cantrips[lvl - 1], 0, 0, 20) : 0; }
  function knownAt(c, lvl) { var sc = c && c.spellcasting; return lvl >= 1 && sc && Array.isArray(sc.known) && maxSpellLevel(c, lvl) >= 1 ? int(sc.known[lvl - 1], 0, 0, 40) : 0; }
  function preparedAt(c, lvl, abilities) {
    var sc = c && c.spellcasting;
    if (!sc || !sc.prepared || maxSpellLevel(c, lvl) < 1) return 0;
    var m = mod(abilities[sc.ability]);
    return Math.max(1, m + (sc.prepared === "ability+half" ? Math.floor(lvl / 2) : lvl));
  }
  function prepFormula(c) {
    var sc = c.spellcasting;
    return (ANAME[sc.ability] || sc.ability) + " modifier + " + (sc.prepared === "ability+half" ? "half your " + c.name + " level (rounded down)" : "your " + c.name + " level") + ", at least 1";
  }
  function classSpells(c, minL, maxL) {
    if (!c) return [];
    return R.spells.filter(function (s) {
      return Array.isArray(s.classes) && s.classes.indexOf(c.key) >= 0 && s.level >= minL && s.level <= maxL;
    }).sort(function (a, b) { return a.level - b.level || (a.name < b.name ? -1 : 1); });
  }
  // Spell slots for a set of classes: one caster uses its own table; several
  // add up their caster levels (full = level, half = level/2 down,
  // artificer = level/2 up, third = level/3 down) on the full table. Pact
  // magic is kept apart.
  function slotsFor(classes) {
    var casters = [], pact = null;
    classes.forEach(function (x) {
      var c = casterOf(classOf(x.key), x.subclass), sc = c && c.spellcasting;
      if (!sc) return;
      if (sc.progression === "pact") { var p = classSlotRow(c, x.level); if (p && p.slots) pact = { slots: p.slots, level: p.level }; }
      else casters.push({ c: c, level: x.level, prog: sc.progression });
    });
    var row = [0, 0, 0, 0, 0, 0, 0, 0, 0], cl = 0;
    if (casters.length === 1) { var r = classSlotRow(casters[0].c, casters[0].level); if (r && r.row) row = r.row.slice(0, 9); }
    else if (casters.length > 1) {
      casters.forEach(function (x) {
        cl += x.prog === "full" ? x.level : x.prog === "half" ? Math.floor(x.level / 2) : x.prog === "artificer" ? Math.ceil(x.level / 2) : x.prog === "third" ? Math.floor(x.level / 3) : 0;
      });
      if (cl > 0) row = ((R.slots.full || [])[Math.min(20, cl) - 1] || row).slice(0, 9);
    }
    while (row.length < 9) row.push(0);
    return { row: row, pact: pact, casterLevel: cl };
  }
  function slotsText(sl) {
    var parts = [];
    sl.row.forEach(function (n, i) { if (n) parts.push(ord(i + 1) + " " + n); });
    var t = parts.length ? parts.join(", ") : "none";
    if (sl.pact) t += "; pact magic " + plural(sl.pact.slots, "slot") + " of " + ord(sl.pact.level) + " level";
    return t;
  }
  function mcRequirement(c) {
    var req = obj(c && c.multiclass && c.multiclass.requires), keys = Object.keys(req).filter(function (k) { return ANAME[k]; });
    return { keys: keys, req: req, any: !!(c && c.multiclass && c.multiclass.any) };
  }
  function mcMet(c, ab) {
    var m = mcRequirement(c);
    if (!m.keys.length) return true;
    var ok = m.keys.map(function (k) { return int(ab[k], 0, 0, 40) >= int(m.req[k], 13, 0, 40); });
    return m.any ? ok.some(Boolean) : ok.every(Boolean);
  }
  function mcText(c, ab) {
    var m = mcRequirement(c);
    if (!m.keys.length) return "no requirement";
    return m.keys.map(function (k) { return ANAME[k] + " " + m.req[k] + (ab ? " (you have " + int(ab[k], 0, 0, 40) + ")" : ""); }).join(m.any ? " or " : " and ");
  }

  /* -------------------------------------------- the sheet as it is */
  function normData(raw) {
    var d = obj(raw), o = {};
    o.name = str(d.name, 200);
    o.classes = (Array.isArray(d.classes) ? d.classes : []).slice(0, 13).map(function (x) {
      x = obj(x);
      var rc = classOf(str(x.key, 40));
      return { key: str(x.key, 40), name: str(x.name, 80) || (rc ? rc.name : ""), level: int(x.level, 1, 1, 20), subclass: str(x.subclass, 120), hitDie: int(x.hitDie, rc ? rc.hitDie : 8, 4, 12) };
    }).filter(function (x) { return x.key; });
    o.level = o.classes.reduce(function (n, x) { return n + x.level; }, 0);
    o.abilities = {};
    var ab = obj(d.abilities);
    AKEYS.forEach(function (k) { o.abilities[k] = int(ab[k], 10, 1, 30); });
    o.skills = {};
    var sk = obj(d.skills);
    SKEYS.forEach(function (k) { o.skills[k] = int(sk[k], 0, 0, 2); });
    o.spells = (Array.isArray(d.spells) ? d.spells : []).slice(0, 200).map(function (s) {
      s = obj(s);
      return { name: str(s.name, 80), level: int(s.level, 0, 0, 9), class: str(s.class, 40), prepared: s.prepared !== false };
    }).filter(function (s) { return s.name; });
    o.feats = (Array.isArray(d.feats) ? d.feats : []).map(function (f) { return { name: str(obj(f).name, 120) }; }).filter(function (f) { return f.name; });
    o.hpMax = int(d.hpMax, 1, 1, 999);
    ["armor", "weapons", "tools"].forEach(function (k) { o[k] = str(d[k], 2000); });
    return o;
  }
  function levelOf(data) { return normData(data).level; }

  /* ------------------------------------------- the choices in progress */
  function normU(raw, from) {
    var u = obj(raw), hp = obj(u.hp), asi = obj(u.asi);
    return {
      v: 1, from: from, active: u.active !== false,
      step: int(u.step, 0, 0, REVIEW),
      cls: str(u.cls, 40),
      hp: { method: hp.method === "roll" || hp.method === "average" ? hp.method : "", roll: hp.roll == null ? null : int(hp.roll, 1, 1, 12), die: hp.die == null ? null : int(hp.die, 8, 4, 12), rolledAt: str(hp.rolledAt, 40) },
      subclass: str(u.subclass, 120),
      die: DICE.indexOf(int(u.die, 0, 0, 20)) >= 0 ? int(u.die, 0, 0, 20) : 0,
      mcSkill: str(u.mcSkill, 40),
      expertise: strList(u.expertise, 4, 40),
      asi: { mode: asi.mode === "asi" || asi.mode === "feat" ? asi.mode : "", split: asi.split === "1-1" ? "1-1" : "2",
        a: [0, 1].map(function (i) { var v = Array.isArray(asi.a) ? asi.a[i] : ""; return AKEYS.indexOf(v) >= 0 ? v : ""; }), feat: str(asi.feat, 120) },
      cantrips: strList(u.cantrips, 6, 80),
      spells: strList(u.spells, 12, 80),
      swapOut: str(u.swapOut, 80), swapIn: str(u.swapIn, 80),
      book: strList(u.book, 12, 80),
      prepared: strList(u.prepared, 40, 80),
      // rolls set aside when the class was changed: kept, so changing class is not a way to roll again
      hpHistory: (Array.isArray(u.hpHistory) ? u.hpHistory : []).slice(0, 12).map(function (x) {
        x = obj(x);
        return { cls: str(x.cls, 40), die: int(x.die, 8, 4, 12), roll: int(x.roll, 1, 1, 12), rolledAt: str(x.rolledAt, 40) };
      })
    };
  }
  function storeKey() { return "dnd-levelup:" + CAMPAIGN + ":" + S.slug + ":" + (S.cur ? S.cur.level : 0); }
  function keep() {
    if (S.mode !== "wizard") return;
    try { window.localStorage.setItem(storeKey(), JSON.stringify(S.u)); } catch (e) { /* private window: fine */ }
  }
  function kept() {
    try { var v = window.localStorage.getItem(storeKey()); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }
  function forget() { try { window.localStorage.removeItem(storeKey()); } catch (e) { /* fine */ } }

  /* ---------------------------------------------- derived figures */
  function compute(cur, u) {
    var i = { c: classOf(u.cls) }, c = i.c;
    i.existing = c ? cur.classes.filter(function (x) { return x.key === c.key; })[0] || null : null;
    i.isNew = !!c && !i.existing;
    i.classLevel = i.existing ? i.existing.level + 1 : 1;
    i.prevClassLevel = i.classLevel - 1;
    i.newLevel = cur.level + 1;
    // ability scores after this level's increase
    i.isAsi = !!c && Array.isArray(c.asiLevels) && c.asiLevels.indexOf(i.classLevel) >= 0;
    i.abilities = clone(cur.abilities);
    if (i.isAsi && u.asi.mode === "asi") {
      if (u.asi.split === "2") { if (u.asi.a[0]) i.abilities[u.asi.a[0]] += 2; }
      else u.asi.a.forEach(function (k) { if (k) i.abilities[k] += 1; });
    }
    // hit points
    // the class's hit die; a class the rules give none keeps the one on the sheet, or the one agreed with the DM
    i.die = !c ? 0 : c.hitDie ? int(c.hitDie, 8, 4, 12) : i.existing ? i.existing.hitDie : u.die;
    i.avg = i.die ? i.die / 2 + 1 : 0;
    i.conOld = mod(cur.abilities.con); i.conNew = mod(i.abilities.con);
    i.hpBase = u.hp.method === "roll" ? (u.hp.roll || 0) : u.hp.method === "average" ? i.avg : 0;
    i.hpGain = c && u.hp.method ? Math.max(1, i.hpBase + i.conNew) : 0;
    i.hpRetro = (i.conNew - i.conOld) * cur.level;
    i.hpMax = cur.hpMax + i.hpGain + i.hpRetro;
    // features
    i.subLevel = c && c.subclassLevel != null ? int(c.subclassLevel, 3, 1, 20) : 99;
    i.needSub = !!c && i.classLevel >= i.subLevel && !(i.existing && trim(i.existing.subclass));
    i.mc = c && i.isNew && cur.level > 0 ? (MC_GAINS[c.key] || {}) : {};
    i.mcSkill = i.mc.skill || "";
    i.expertise = c && EXPERTISE[c.key] ? EXPERTISE[c.key][i.classLevel] || 0 : 0;
    // skills after this level
    i.skills = clone(cur.skills);
    if (i.mcSkill && SNAME[u.mcSkill] && !i.skills[u.mcSkill]) i.skills[u.mcSkill] = 1;
    if (i.expertise) u.expertise.forEach(function (k) { if (i.skills[k] === 1) i.skills[k] = 2; });
    // spells
    var subName = i.existing && trim(i.existing.subclass) ? i.existing.subclass : i.needSub ? u.subclass : "";
    i.cc = casterOf(c, subName);
    var cc = i.cc, sc = cc && cc.spellcasting, L = i.classLevel, P = i.prevClassLevel;
    i.sc = sc;
    i.maxL = sc ? maxSpellLevel(cc, L) : 0;
    i.mine = c ? cur.spells.filter(function (s) { return s.class === c.key; }) : [];
    i.newCantrips = sc ? Math.max(0, cantripsAt(cc, L) - cantripsAt(cc, P)) : 0;
    i.newKnown = sc && sc.type === "known" ? Math.max(0, knownAt(cc, L) - knownAt(cc, P)) : 0;
    i.canSwap = !!sc && sc.type === "known" && P >= 1 && i.mine.some(function (s) { return s.level >= 1; });
    i.newBook = sc && sc.type === "spellbook" && i.maxL >= 1 ? (P >= 1 ? BOOK_PER_LEVEL : BOOK_AT_1) : 0;
    i.prepCount = sc && sc.type !== "known" ? preparedAt(cc, L, i.abilities) : 0;
    return i;
  }

  // The new sheet: the current data with this level's changes.
  function buildProposal(raw, cur, u) {
    var i = compute(cur, u), c = i.c, data = clone(obj(raw));
    delete data._levelup;
    if (!c) return { data: data, info: i };
    var classes = cur.classes.map(function (x) { return clone(x); });
    if (i.existing) classes.forEach(function (x) { if (x.key === c.key) { x.level += 1; if (i.needSub) x.subclass = trim(u.subclass); } });
    else classes.push({ key: c.key, name: c.name, level: 1, subclass: i.needSub ? trim(u.subclass) : "", hitDie: i.die });
    data.classes = classes;
    data.abilities = clone(i.abilities);
    data.hpMax = i.hpMax;
    data.skills = clone(i.skills);
    if (i.isNew) {
      ["armor", "weapons", "tools"].forEach(function (k) {
        var add = i.mc[k];
        if (!add) return;
        var had = trim(cur[k]);
        if (had.toLowerCase().indexOf(add.toLowerCase()) < 0) data[k] = had ? had + "; " + add : add;
        else data[k] = had;
      });
    }
    var feats = clone(cur.feats);
    if (i.isAsi && u.asi.mode === "feat" && trim(u.asi.feat)) feats.push({ name: (findByName(R.feats, u.asi.feat) || { name: trim(u.asi.feat) }).name });
    data.feats = feats;
    // spells
    var others = cur.spells.filter(function (s) { return s.class !== c.key; }), mine = clone(i.mine);
    function entry(n, prepared) { var s = spellOf(n); return { name: s ? s.name : n, level: s ? s.level : 1, class: c.key, prepared: prepared }; }
    if (i.sc) {
      var t = i.sc.type;
      u.cantrips.forEach(function (n) { mine.push(entry(n, true)); });
      if (t === "known") {
        if (i.canSwap && u.swapOut && u.swapIn) {
          mine = mine.filter(function (s) { return !(s.level >= 1 && same(s.name, u.swapOut)); });
          mine.push(entry(u.swapIn, true));
        }
        u.spells.forEach(function (n) { mine.push(entry(n, true)); });
      } else if (t === "spellbook") {
        u.book.forEach(function (n) { mine.push(entry(n, false)); });
        mine.forEach(function (s) { if (s.level >= 1) s.prepared = u.prepared.some(function (p) { return same(p, s.name); }); });
      } else {
        mine = mine.filter(function (s) { return s.level === 0; });
        u.prepared.forEach(function (n) { mine.push(entry(n, true)); });
      }
    }
    data.spells = others.concat(mine);
    data._levelup = {
      from: cur.level, to: i.newLevel, class: c.key, className: c.name, classLevel: i.classLevel, newClass: i.isNew,
      hp: { method: u.hp.method, die: i.die, roll: u.hp.method === "roll" ? u.hp.roll : null, rolledAt: u.hp.method === "roll" ? u.hp.rolledAt : "",
        conMod: i.conNew, gain: i.hpGain, fromConstitution: i.hpRetro },
      choices: clone(u)
    };
    delete data._levelup.choices.step;
    return { data: data, info: i };
  }

  /* --------------------------------------------------------- the rules */
  function checks(cur, u, opts) {
    opts = opts || {};
    var L = [], i = compute(cur, u), c = i.c;
    function add(step, label, problem) { L.push({ step: step, label: label, problem: problem || "", ok: !problem, flag: false }); }
    function note(step, label) { L.push({ step: step, label: label, problem: "", ok: true, flag: true }); }

    /* 1. Class */
    add(0, "Below level 20", cur.level >= 20 && "Level 20 is the highest level.");
    if (opts.allowed != null) add(0, "A level the adventurer may reach", i.newLevel > opts.allowed && "The adventurer may reach level " + opts.allowed + " for now, not level " + i.newLevel + ".");
    add(0, "A class", !trim(u.cls) ? "Choose the class that gains the level." : !c ? "That class is not in these rules: choose one from the list." : "");
    if (c && STANDARD_CLASSES.indexOf(c.key) < 0) note(0, c.name + (c.source ? " (" + c.source + ")" : "") + " is not one of the thirteen standard classes: the Dungeon Master checks what this level brings" +
      (c.spellcasting ? "." : ", and any spells (these rules list none for it)."));
    if (c && !Array.isArray(c.asiLevels)) note(0, "The rules list no Ability Score Improvement levels for the " + c.name + ": the Dungeon Master decides.");
    if (c && c.subclassLevel == null && (c.subclasses || []).length) note(0, "The rules give no subclass level for the " + c.name + ": the Dungeon Master decides when it is chosen.");
    if (c && i.isNew) {
      var unknownMc = cur.classes.map(function (x) { return classOf(x.key); }).concat([c]).filter(function (rc) { return rc && !(rc.multiclass && rc.multiclass.requires); });
      if (unknownMc.length) note(0, "The rules list no multiclassing requirement for " + list(unknownMc.map(function (rc) { return "the " + rc.name; })) + ": the Dungeon Master decides.");
      var bad = [];
      cur.classes.forEach(function (x) {
        var rc = classOf(x.key);
        if (rc && !mcMet(rc, cur.abilities)) bad.push("To leave the " + rc.name + " for another class you need " + mcText(rc, cur.abilities) + ".");
      });
      if (!mcMet(c, cur.abilities)) bad.push("To take a level of " + c.name + " you need " + mcText(c, cur.abilities) + ".");
      add(0, "Multiclassing requirements (" + list(cur.classes.map(function (x) { return x.name; }).concat([c.name])) + ")", bad.join(" "));
      if (!bad.length && !MC_GAINS[c.key]) note(0, "Multiclassing into " + c.name + ": the Dungeon Master says which proficiencies it brings.");
      else if (!bad.length) note(0, "Multiclassing into " + c.name + (Object.keys(i.mc).length ? ": gains " + list(["armor", "weapons", "tools"].filter(function (k) { return i.mc[k]; }).map(function (k) { return i.mc[k].toLowerCase(); })) +
        (i.mcSkill ? (i.mc.armor || i.mc.weapons || i.mc.tools ? " and " : "") + "one skill" : "") : ": no new proficiencies") + ". The Dungeon Master checks the class features.");
    }

    /* 2. Hit points */
    if (c && !i.die) add(1, "A hit die agreed with the Dungeon Master", "The rules list no hit die for the " + c.name + ": ask the Dungeon Master which to use, and choose it.");
    if (c && !c.hitDie && i.isNew && i.die) note(1, "Hit die d" + i.die + " for the " + c.name + " (the rules list none): the Dungeon Master confirms it.");
    if (c && i.die) {
      add(1, "Hit points: rolled or the average", !u.hp.method ? "Roll your d" + i.die + ", or take the average (" + i.avg + ")."
        : u.hp.method === "roll" && !u.hp.roll ? "Roll your d" + i.die + "." : "");
      if (u.hpHistory.length) note(1, "Hit-die rolls set aside when the class was changed: " + u.hpHistory.map(function (x) {
        var rc = classOf(x.cls);
        return x.roll + " on a d" + x.die + (rc ? " (" + rc.name + ")" : "");
      }).join(", ") + ".");
      if (u.hp.method === "roll" && u.hp.roll) {
        add(1, "The roll fits the die", (u.hp.roll < 1 || u.hp.roll > i.die || (u.hp.die && u.hp.die !== i.die)) &&
          "The recorded roll (" + u.hp.roll + (u.hp.die ? " on a d" + u.hp.die : "") + ") does not fit the " + c.name + "’s d" + i.die + ": roll again with the right class.");
      }
    }

    /* 3. Class features */
    if (c && i.needSub) {
      add(2, "A " + (c.subclassLabel || "subclass"), !trim(u.subclass) ? "Choose your " + (c.subclassLabel || "subclass") + ": the " + c.name + " takes it at level " + i.subLevel + "."
        : !findByName(c.subclasses, u.subclass) ? "“" + u.subclass + "” is not a " + (c.subclassLabel || "subclass") + " of the " + c.name + "." : "");
    } else if (trim(u.subclass)) add(2, "No subclass at this level", "No subclass is chosen at this level: clear it.");
    if (c && i.mcSkill) {
      var from = i.mcSkill === "any" ? SKEYS : skillFrom(c);
      add(2, "One skill from multiclassing into " + c.name, !trim(u.mcSkill) ? "Choose one skill" + (i.mcSkill === "any" ? "" : " from the " + c.name + "’s list") + "."
        : from.indexOf(u.mcSkill) < 0 ? (SNAME[u.mcSkill] || u.mcSkill) + " is not " + (i.mcSkill === "any" ? "a skill." : "on the " + c.name + "’s list.")
        : cur.skills[u.mcSkill] ? "You are already proficient in " + SNAME[u.mcSkill] + ": choose another." : "");
    } else if (trim(u.mcSkill)) add(2, "No extra skill at this level", "This level gives no extra skill: clear it.");
    if (i.expertise) {
      var eb = [];
      var notProf = u.expertise.filter(function (k) { return !SNAME[k] || (i.skills[k] || 0) < 1; });
      var already = u.expertise.filter(function (k) { return cur.skills[k] === 2; });
      if (notProf.length) eb.push("Expertise only goes to skills you are proficient in: untick " + list(notProf.map(function (k) { return SNAME[k] || k; })) + ".");
      if (already.length) eb.push("You already have Expertise in " + list(already.map(function (k) { return SNAME[k]; })) + ": choose another.");
      if (u.expertise.length !== i.expertise) eb.push(u.expertise.length < i.expertise ? "Choose " + plural(i.expertise, "skill") + " for Expertise: " + u.expertise.length + " chosen."
        : "Only " + plural(i.expertise, "skill") + " get Expertise: untick " + (u.expertise.length - i.expertise) + ".");
      add(2, "Expertise in " + plural(i.expertise, "skill"), eb.join(" "));
    } else if (u.expertise.length) add(2, "No Expertise at this level", "This level gives no Expertise: untick it.");

    /* 4. Scores or feat */
    if (c && i.isAsi) {
      var a = u.asi;
      if (!a.mode) add(3, "An Ability Score Improvement or a feat", "Choose: raise your ability scores, or take a feat.");
      else if (a.mode === "asi") {
        var p = "";
        if (a.split === "2") { if (!a.a[0]) p = "Choose the ability that gets +2."; }
        else if (!a.a[0] || !a.a[1]) p = "Choose two abilities for +1 each.";
        else if (a.a[0] === a.a[1]) p = "The two +1s go to two different abilities (or choose +2 to one).";
        add(3, "Ability Score Improvement: +2 to one, or +1 to two", p);
        var over = AKEYS.filter(function (k) { return i.abilities[k] > 20; });
        add(3, "No score above 20", over.length && list(over.map(function (k) { return ANAME[k] + " would be " + i.abilities[k]; })) + ": no score goes above 20 this way.");
      } else {
        var ft = findByName(R.feats, a.feat);
        add(3, "A feat from the list", !trim(a.feat) ? "Choose a feat." : !ft ? "“" + a.feat + "” is not a feat in these rules." :
          cur.feats.some(function (f) { return same(f.name, ft.name); }) ? "You already have " + ft.name + ": choose another." : "");
        if (ft) note(3, "Feat: " + ft.name + (ft.prerequisite ? " (prerequisite: " + ft.prerequisite + ")" : "") + ": the Dungeon Master checks it.");
      }
    } else if (u.asi.mode) add(3, "No Ability Score Improvement at this level", "This level gives no Ability Score Improvement: clear it.");

    /* 5. Spells */
    if (c && i.sc) {
      var mineNames = i.mine.map(function (s) { return s.name; });
      if (i.cc.sub) note(4, "Spells from the " + i.cc.sub + " come from the " + i.cc.name + " list, with the limits on its page: the Dungeon Master checks them.");
      if (i.newCantrips || u.cantrips.length) add(4, plural(i.newCantrips, "new cantrip"), spellProblems(i.cc, u.cantrips, i.newCantrips, 0, 0, mineNames, "cantrip"));
      if (i.sc.type === "known") {
        if (i.newKnown || u.spells.length) add(4, plural(i.newKnown, "new spell") + " known", spellProblems(i.cc, u.spells, i.newKnown, 1, i.maxL, mineNames.concat(u.swapIn ? [u.swapIn] : []), "spell"));
        if (u.swapOut || u.swapIn) {
          var sp = "";
          var outS = i.mine.filter(function (s) { return s.level >= 1 && same(s.name, u.swapOut); })[0];
          if (!i.canSwap) sp = "There is no spell to swap at this level: clear the swap.";
          else if (!u.swapOut) sp = "Choose the spell you forget, or clear the swap.";
          else if (!outS) sp = "“" + u.swapOut + "” is not a " + c.name + " spell you know.";
          else if (!u.swapIn) sp = "Choose the spell that replaces " + outS.name + ", or clear the swap.";
          else sp = spellProblems(i.cc, [u.swapIn], 1, 1, i.maxL, mineNames.concat(u.spells), "spell", true);
          add(4, "Swap one known spell (optional)", sp);
        }
      } else if (i.sc.type === "spellbook") {
        if (i.newBook || u.book.length) add(4, plural(i.newBook, "spell") + " written into the spellbook", spellProblems(i.cc, u.book, i.newBook, 1, i.maxL, mineNames, "spell"));
        var bookNames = i.mine.filter(function (s) { return s.level >= 1; }).map(function (s) { return s.name; }).concat(u.book);
        var outB = u.prepared.filter(function (n) { return !bookNames.some(function (b) { return same(b, n); }); });
        var pp = outB.length ? list(outB) + (outB.length === 1 ? " is" : " are") + " not in your spellbook." : countProblem(u.prepared.length, i.prepCount, "spell", prepFormula(i.cc));
        add(4, plural(i.prepCount, "spell") + " prepared from the spellbook", pp);
      } else if (i.prepCount || u.prepared.length) {
        add(4, plural(i.prepCount, "spell") + " prepared", spellProblems(i.cc, u.prepared, i.prepCount, 1, i.maxL, [], "spell", false, prepFormula(i.cc)));
      }
      if (i.sc.type !== "known" && (u.spells.length || u.swapOut || u.swapIn)) add(4, "Only known casters learn or swap spells", "Clear the spells known and the swap: the " + c.name + " does not learn spells that way.");
      if (i.sc.type !== "spellbook" && u.book.length) add(4, "Only a wizard writes spells into a book", "Clear the spellbook choices.");
      if (i.sc.type === "known" && u.prepared.length) add(4, "Known casters do not prepare", "Clear the prepared spells.");
    } else if (u.cantrips.length || u.spells.length || u.book.length || u.prepared.length || u.swapOut || u.swapIn) {
      add(4, "No spells for this class", "This class casts no spells: clear the spell choices.");
    }

    /* The request against its record (the Dungeon Master's review). */
    if (opts.stored) {
      var built = buildProposal(opts.raw, cur, u), diffs = [];
      ["classes", "abilities", "hpMax", "skills", "spells", "feats", "armor", "weapons", "tools"].forEach(function (k) {
        var a1 = opts.stored[k], b1 = built.data[k];
        if (typeof b1 === "string") a1 = trim(a1);
        if (canon(a1) !== canon(b1)) diffs.push(k === "hpMax" ? "hit points" : k === "abilities" ? "ability scores" : k);
      });
      add(REVIEW, "The new sheet matches the choices recorded", diffs.length &&
        "The requested sheet differs from the recorded choices in: " + diffs.join(", ") + ". It may have been changed outside this page, or the sheet changed since.");
      add(REVIEW, "Exactly one level higher", levelOf(opts.stored) !== cur.level + 1 && "The request is for level " + levelOf(opts.stored) + ", but the sheet is level " + cur.level + ".");
    }
    return L;
  }
  function countProblem(n, need, what, formula) {
    if (n === need) return "";
    return n < need ? "Choose " + plural(need, what) + (formula ? " (" + formula + ")" : "") + ": " + n + " chosen, " + (need - n) + " to go."
      : "You can have " + plural(need, what) + (formula ? " (" + formula + ")" : "") + ", but " + n + " are chosen: untick " + (n - need) + ".";
  }
  function spellProblems(c, names, need, minL, maxL, have, what, noCount, formula) {
    var out = [], seen = {};
    names.forEach(function (nm) {
      var s = spellOf(nm);
      if (!s) { out.push("“" + nm + "” is not a spell in these rules."); return; }
      if (!Array.isArray(s.classes) || s.classes.indexOf(c.key) < 0) out.push(s.name + " is not on the " + c.name + " spell list.");
      else if (s.level < minL || s.level > maxL) out.push(s.name + " is " + (s.level ? "a " + ord(s.level) + "-level spell" : "a cantrip") +
        (minL === 0 && maxL === 0 ? ", not a cantrip." : ": you can take spells of " + (maxL <= 1 ? "1st level" : "1st to " + ord(maxL) + " level") + " here."));
      if (have.some(function (h) { return same(h, nm); })) out.push("You already have " + s.name + ".");
      if (seen[nm]) out.push(s.name + " is taken twice.");
      seen[nm] = true;
    });
    if (!noCount) { var cp = countProblem(names.length, need, what, formula); if (cp) out.push(cp); }
    return out.join(" ");
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
    S.slug = String(new URLSearchParams(window.location.search).get("c") || "").toLowerCase();
    if (!CAMPAIGN) { root().innerHTML = '<div class="sheet-notice">This page does not say which campaign it belongs to.</div>'; setStatus(""); return; }
    if (!/^[a-z0-9-]{1,40}$/.test(S.slug)) {
      setStatus("");
      root().innerHTML = '<div class="sheet-notice">Open this page from an adventurer’s sheet: its address needs <code>?c=</code> and the sheet’s short name. <a href="players.html">The Party</a>.</div>';
      return;
    }
    if (!R.classes.length) { root().innerHTML = '<div class="sheet-notice">The rules could not be loaded just now. Try again in a moment.</div>'; setStatus(""); return; }
    load();
  });

  function root() { return $("levelup"); }
  function isDM() { return S.role === "storyteller" || S.sheetRole === "storyteller"; }
  function isOwner() { return S.sheetRole === "owner"; }

  function ensureChrome() {
    if (!$("lvApproveDialog")) {
      document.body.insertAdjacentHTML("beforeend",
        '<dialog id="lvApproveDialog" class="sheet-dialog" aria-labelledby="lvApproveTitle"><form id="lvApproveForm" method="dialog">' +
        '<h2 id="lvApproveTitle">Approve this level</h2><p>The character sheet becomes the new one shown here.</p>' +
        '<label for="lvApproveNote">Note for the player (optional)</label><textarea id="lvApproveNote" maxlength="2000" rows="3"></textarea>' +
        '<p id="lvApproveMsg" class="sheet-status" role="status"></p>' +
        '<div class="dialog-actions"><button type="button" class="btn btn--ghost" id="lvApproveCancel">Cancel</button><button type="submit" class="btn" id="lvApproveSend">Approve</button></div></form></dialog>' +
        '<dialog id="lvRejectDialog" class="sheet-dialog" aria-labelledby="lvRejectTitle"><form id="lvRejectForm" method="dialog">' +
        '<h2 id="lvRejectTitle">Send back to the player</h2><p>Say what needs changing. The player sees this note and can level up again.</p>' +
        '<label for="lvRejectNote">Note for the player</label><textarea id="lvRejectNote" required maxlength="2000" rows="5"></textarea>' +
        '<p id="lvRejectMsg" class="sheet-status" role="status"></p>' +
        '<div class="dialog-actions"><button type="button" class="btn btn--ghost" id="lvRejectCancel">Cancel</button><button type="submit" class="btn" id="lvRejectSend">Send back</button></div></form></dialog>');
    }
    if (!$("sheetToast")) document.body.insertAdjacentHTML("beforeend", '<div class="sheet-toast" id="sheetToast" role="status" aria-live="polite" hidden></div>');
  }

  async function load() {
    setStatus("Opening the adventurer…");
    try {
      var got = await Promise.all([
        S.db.from("character_sheets").select("slug,chronicle,name,data,play").eq("slug", S.slug).maybeSingle(),
        S.db.rpc("sheet_role", { p_slug: S.slug }),
        S.db.rpc("dnd_allowed_level", { p_slug: S.slug }),
        S.db.from("campaign_settings").select("chronicle,advancement,start_level").eq("chronicle", CAMPAIGN).maybeSingle(),
        S.db.from("dnd_levelups").select("*").eq("slug", S.slug).order("requested_at", { ascending: false })
      ]);
      got.forEach(function (r) { if (r.error) throw r.error; });
      var row = got[0].data;
      if (!row || row.chronicle !== CAMPAIGN) {
        setStatus("");
        root().innerHTML = '<div class="sheet-notice">There is no adventurer called “' + esc(S.slug) + '” in ' + esc(CAMPAIGN_NAME) + ', or it is not yours to see. <a href="players.html">The Party</a>.</div>';
        return;
      }
      S.sheet = row; S.raw = obj(row.data); S.cur = normData(S.raw);
      S.sheetRole = String(got[1].data || "viewer");
      S.allowed = int(got[2].data, 0, 0, 20);
      var st = obj(got[3].data);
      S.adv = { mode: st.advancement === "milestone" ? "milestone" : st.advancement === "xp" ? "xp" : "", start: int(st.start_level, 1, 1, 20) };
      S.reqs = got[4].data || [];
    } catch (e) {
      console.error(e);
      setStatus("");
      root().innerHTML = '<div class="sheet-notice">The adventurer could not be reached just now (' + esc(errText(e)) + "). Try again in a moment.</div>";
      return;
    }
    setStatus("");
    if (!isOwner() && !isDM()) {
      root().innerHTML = '<div class="sheet-notice">Only ' + esc(S.sheet.name || S.cur.name || "this adventurer") + "’s player, or the Dungeon Master, can level them up. " +
        '<a href="sheet.html?c=' + esc(encodeURIComponent(S.slug)) + '">Back to the sheet</a>.</div>';
      return;
    }
    if (!S.cur.classes.length) {
      root().innerHTML = '<div class="sheet-notice">This sheet has no class yet, so it cannot level up here. Ask the Dungeon Master.</div>';
      return;
    }
    var saved = kept();
    if (saved && saved.active !== false && canLevel()) { S.u = normU(saved, S.cur.level); S.mode = "wizard"; }
    else { S.mode = "view"; S.u = null; }
    render();
  }

  function pending() { return S.reqs.filter(function (r) { return r.status === "pending"; })[0] || null; }
  function canLevel() { return !pending() && S.allowed > S.cur.level && S.cur.level < 20; }

  /* ------------------------------------------------------- rendering */
  function render() {
    var active = document.activeElement, f = active && active.getAttribute && active.getAttribute("data-f");
    var h = '<div class="sheet-bar"><a class="btn btn--ghost" href="sheet.html?c=' + esc(encodeURIComponent(S.slug)) + '">&larr; The sheet</a>' +
      '<a class="btn btn--ghost" href="players.html">The Party</a></div>';
    h += overview();
    if (S.mode === "wizard" && S.u) h += wizardHtml();
    root().innerHTML = h;
    if (f) {
      var el = root().querySelector('[data-f="' + (window.CSS && CSS.escape ? CSS.escape(f) : f) + '"]');
      if (el) el.focus({ preventScroll: true });
    }
  }

  function overview() {
    var cur = S.cur, pend = pending(), name = S.sheet.name || cur.name || "Unnamed";
    var pb = int(R.proficiencyBonus[cur.level - 1], 2, 2, 6);
    var h = '<section class="create-panel" aria-labelledby="lvTitle"><h2 id="lvTitle">' + esc(name) + "</h2>";
    h += '<p>' + esc(cur.classes.map(function (x) { return x.name + " " + x.level + (x.subclass ? " (" + x.subclass + ")" : ""); }).join(" / ")) + "</p>";
    h += '<div class="lv-figs">' +
      '<div class="lv-fig"><b>' + cur.level + "</b><span>Level now</span></div>" +
      '<div class="lv-fig"><b>' + S.allowed + "</b><span>May reach</span></div>" +
      '<div class="lv-fig"><b>' + signed(pb) + "</b><span>Proficiency</span></div>" +
      '<div class="lv-fig"><b>' + cur.hpMax + "</b><span>Hit points</span></div></div>";
    var modeText = S.adv.mode === "xp" ? "This campaign advances by experience points: a new level comes when the Dungeon Master’s awards reach " +
      (cur.level < 20 ? R.xpThresholds[cur.level] != null ? Number(R.xpThresholds[cur.level]).toLocaleString() + " XP for level " + (cur.level + 1) : "the next threshold" : "the top") + "."
      : S.adv.mode === "milestone" ? "This campaign advances by milestones: the Dungeon Master grants each new level." : "The Dungeon Master has not yet said how this campaign advances.";
    h += "<p>" + esc(modeText) + "</p>";
    if (pend) h += '<p class="xp-hint">A level-up is waiting for the Dungeon Master (below).</p>';
    else if (cur.level >= 20) h += '<p class="xp-hint">Level 20 is the highest level.</p>';
    else if (S.allowed > cur.level) {
      h += '<p class="step-ok">' + esc(name) + " may go up to level " + (cur.level + 1) + (S.allowed > cur.level + 1 ? " (and on to " + S.allowed + ", one level at a time)" : "") + ".</p>";
      if (S.mode !== "wizard") h += '<p><button type="button" class="btn" data-act="start" data-f="start">' + (kept() ? "Carry on levelling up to " : "Level up to ") + (cur.level + 1) + "</button></p>";
    } else h += '<p class="xp-hint">Not yet: ' + esc(S.adv.mode === "milestone" ? "the Dungeon Master grants the next level." : "the next level comes with more experience.") + "</p>";
    h += "<h3>Level-up requests</h3>";
    if (!S.reqs.length) h += '<p class="empty-line">None yet.</p>';
    else h += '<ul class="lv-req">' + S.reqs.map(reqItem).join("") + "</ul>";
    h += "</section>";
    if (pend) h += pendingHtml(pend);
    return h;
  }
  function reqItem(r) {
    var acts = "";
    if (r.status === "pending" && isOwner()) acts += '<button type="button" class="btn btn--ghost" data-act="withdraw" data-id="' + esc(r.id) + '">Withdraw</button>';
    var lu = obj(obj(r.data)._levelup);
    return '<li><div class="who">Level ' + esc(r.from_level) + " → " + esc(r.to_level) + (lu.className ? " · " + esc(lu.className) + " " + esc(lu.classLevel || "") : "") +
      ' <span class="status status-' + esc(r.status) + '">' + esc(RSTATUS[r.status] || r.status) + "</span>" +
      "<small>asked " + esc(fmtDateTime(r.requested_at)) + (r.decided_at ? " · decided " + esc(fmtDateTime(r.decided_at)) : "") + "</small>" +
      (r.note ? '<span class="note">' + (r.status === "rejected" ? "The Dungeon Master: " : "") + esc(r.note) + "</span>" : "") + "</div>" +
      (acts ? '<div class="acts">' + acts + "</div>" : "") + "</li>";
  }

  // A waiting request: the summary, every rule again, and the DM's buttons.
  function pendingHtml(r) {
    var data = obj(r.data), lu = obj(data._levelup), u = normU(lu.choices, S.cur.level);
    var L = checks(S.cur, u, { stored: data, raw: S.raw, allowed: null });
    if (int(r.from_level, -1, -1, 99) !== S.cur.level) L.push({ step: REVIEW, label: "Made at the sheet’s current level", problem: "This request was made at level " + r.from_level + ", but the sheet is now level " + S.cur.level + ".", ok: false, flag: false });
    var bad = L.filter(function (x) { return !x.ok; });
    var changed = carriedChanges(S.raw, data);
    var h = '<section class="create-panel" aria-labelledby="pendTitle"><h2 id="pendTitle">Waiting: level ' + esc(r.from_level) + " → " + esc(r.to_level) + "</h2>";
    h += bad.length ? '<div class="problems" role="alert"><h3>' + plural(bad.length, "rule") + " not met</h3><ul>" + bad.map(function (x) { return "<li>" + esc(x.problem) + "</li>"; }).join("") + "</ul></div>"
      : '<p class="step-ok">Every rule is met.</p>';
    if (S.allowed < S.cur.level + 1) h += '<p class="xp-hint">Note: the adventurer may only reach level ' + S.allowed + " for now.</p>";
    if (changed.length) h += '<p class="xp-hint">The sheet has changed since this request was made (' + esc(changed.join(", ")) + "): approving replaces the sheet with the request’s copy.</p>";
    if (isDM()) h += '<p class="step-nav" style="margin:.6rem 0"><button type="button" class="btn" data-act="approve" data-id="' + esc(r.id) + '">Approve</button>' +
      '<button type="button" class="btn btn--ghost" data-act="sendback" data-id="' + esc(r.id) + '">Send back</button></p>';
    h += hpLine(lu);
    h += diffTable(S.raw, data);
    h += checklistHtml(L);
    return h + "</section>";
  }
  function hpLine(lu) {
    var hp = obj(lu.hp);
    if (!hp.method) return "";
    return "<p>Hit points: " + (hp.method === "roll" ? "rolled " + esc(hp.roll) + " on a d" + esc(hp.die) + (hp.rolledAt ? " (" + esc(fmtDateTime(hp.rolledAt)) + ")" : "") : "the average of a d" + esc(hp.die) + " (" + (int(hp.die, 8, 4, 12) / 2 + 1) + ")") +
      ", Constitution " + signed(int(hp.conMod, 0, -5, 10)) + ": +" + esc(hp.gain) + (int(hp.fromConstitution, 0, -99, 99) ? ", and " + signed(int(hp.fromConstitution, 0, -99, 99)) + " for the higher Constitution" : "") + ".</p>";
  }
  // Fields that are not part of a level-up but differ between the sheet now and the request.
  function carriedChanges(now, req) {
    var out = [];
    Object.keys(obj(now)).concat(Object.keys(obj(req))).forEach(function (k) {
      if (out.indexOf(k) >= 0 || /^(classes|abilities|hpMax|skills|spells|feats|armor|weapons|tools|_levelup|_creation)$/.test(k)) return;
      if (canon(now[k]) !== canon(req[k])) out.push(k);
    });
    return out;
  }

  /* before / after */
  function diffRows(beforeRaw, afterRaw) {
    var b = normData(beforeRaw), a = normData(afterRaw), rows = [];
    function cls(d) { return d.classes.map(function (x) { return x.name + " " + x.level + (x.subclass ? " (" + x.subclass + ")" : ""); }).join(" / "); }
    rows.push(["Level", b.level, a.level]);
    rows.push(["Classes", cls(b), cls(a)]);
    rows.push(["Hit points", b.hpMax, a.hpMax]);
    rows.push(["Proficiency bonus", signed(int(R.proficiencyBonus[b.level - 1], 2, 2, 6)), signed(int(R.proficiencyBonus[a.level - 1], 2, 2, 6))]);
    AKEYS.forEach(function (k) { if (b.abilities[k] !== a.abilities[k]) rows.push([ANAME[k], b.abilities[k], a.abilities[k]]); });
    var word = ["—", "proficient", "expertise"];
    SKEYS.forEach(function (k) { if (b.skills[k] !== a.skills[k]) rows.push([SNAME[k], word[b.skills[k]], word[a.skills[k]]]); });
    var nf = a.feats.filter(function (f) { return !b.feats.some(function (g) { return same(g.name, f.name); }); });
    if (nf.length || a.feats.length !== b.feats.length) rows.push(["Feats", b.feats.map(function (f) { return f.name; }).join(", ") || "—", a.feats.map(function (f) { return f.name; }).join(", ") || "—"]);
    ["armor", "weapons", "tools"].forEach(function (k) { if (trim(b[k]) !== trim(a[k])) rows.push([k === "armor" ? "Armour" : k.charAt(0).toUpperCase() + k.slice(1), b[k] || "—", a[k] || "—"]); });
    function key(s) { return s.class + "|" + s.name.toLowerCase(); }
    var bk = {}, ak = {};
    b.spells.forEach(function (s) { bk[key(s)] = s; });
    a.spells.forEach(function (s) { ak[key(s)] = s; });
    var added = a.spells.filter(function (s) { return !bk[key(s)]; }), gone = b.spells.filter(function (s) { return !ak[key(s)]; });
    var nowPrep = a.spells.filter(function (s) { return s.level >= 1 && s.prepared && bk[key(s)] && !bk[key(s)].prepared; });
    var unPrep = a.spells.filter(function (s) { return s.level >= 1 && !s.prepared && bk[key(s)] && bk[key(s)].prepared; });
    function names(arr) { return arr.map(function (s) { return s.name + (s.level ? " (" + ord(s.level) + (s.prepared ? "" : ", in the book") + ")" : " (cantrip)"); }).join(", "); }
    if (added.length) rows.push(["Spells gained", "", names(added)]);
    if (gone.length) rows.push(["Spells lost", names(gone), ""]);
    if (nowPrep.length) rows.push(["Now prepared", "", names(nowPrep)]);
    if (unPrep.length) rows.push(["No longer prepared", names(unPrep), ""]);
    var sb = slotsFor(b.classes), sa = slotsFor(a.classes);
    if (slotsText(sb) !== slotsText(sa)) rows.push(["Spell slots", slotsText(sb), slotsText(sa)]);
    return rows;
  }
  function diffTable(beforeRaw, afterRaw) {
    return '<table class="lv-diff"><thead><tr><th></th><th>Before</th><th>After</th></tr></thead><tbody>' + diffRows(beforeRaw, afterRaw).map(function (r) {
      var ch = String(r[1]) !== String(r[2]);
      return "<tr><th scope=\"row\">" + esc(r[0]) + "</th><td>" + esc(r[1]) + "</td><td" + (ch ? ' class="chg"' : "") + ">" + esc(r[2]) + "</td></tr>";
    }).join("") + "</tbody></table>";
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

  /* --------------------------------------------------------- the wizard */
  function wizardHtml() {
    var u = S.u, L = checks(S.cur, u, { allowed: S.allowed }), step = u.step, reach = firstBadStep(L);
    var built = buildProposal(S.raw, S.cur, u);
    var h = '<h2 class="lv-wiz-title">Level ' + S.cur.level + " → " + (S.cur.level + 1) + "</h2>";
    h += '<ol class="steps" aria-label="Steps">' + STEPS.map(function (name, i) {
      var bad = i < REVIEW && problemsFor(L, i).length && i < step;
      return '<li><button type="button" data-act="go" data-step="' + i + '" data-f="go' + i + '"' + (i === step ? ' aria-current="step"' : "") +
        (i > reach ? " disabled" : "") + ' class="' + (bad ? "bad" : i < step ? "done" : "") + '">' + (i + 1) + ". " + esc(name) + "</button></li>";
    }).join("") + "</ol>";
    if (step === REVIEW) h += stepReview(built, L);
    else {
      h += '<section class="page wiz-page" aria-labelledby="stepTitle"><h3 id="stepTitle" style="margin-top:0">' + (step + 1) + ". " + esc(STEPS[step]) + "</h3>";
      h += [stepClass, stepHp, stepFeatures, stepAsi, stepSpells][step](built.info);
      h += "</section>";
    }
    var probs = problemsFor(L, step);
    h += '<div id="problems">' + problemsHtml(probs, step) + "</div>";
    h += '<div class="step-nav"><button type="button" class="btn btn--ghost" data-act="cancel" data-f="cancel">Stop for now</button>' +
      (step > 0 ? '<button type="button" class="btn btn--ghost" data-act="back" data-f="back">&larr; Back</button>' : "") +
      '<span class="spacer"></span>' +
      (step < REVIEW ? '<button type="button" class="btn" data-act="next" data-f="next"' + (probs.length ? ' aria-disabled="true"' : "") + ">Next: " + esc(STEPS[step + 1]) + " &rarr;</button>" : "") +
      "</div>";
    return h;
  }
  function problemsHtml(probs, step) {
    if (!probs.length) return step < REVIEW ? '<p class="step-ok">Everything on this step is in order.</p>' : "";
    return '<div class="problems' + (S.flash ? " flash" : "") + '" role="alert"><h3>Before you go on</h3><ul>' +
      probs.map(function (x) { return "<li>" + esc(x.problem) + "</li>"; }).join("") + "</ul></div>";
  }
  function select(path, value, options, opt) {
    opt = opt || {};
    var known = options.some(function (o) { return String(o.value) === String(value); });
    var h = '<select data-bind="' + esc(path) + '" data-f="' + esc("sel:" + path) + '"' + (opt.id ? ' id="' + esc(opt.id) + '"' : "") +
      (opt.label ? ' aria-label="' + esc(opt.label) + '"' : "") + ">" + '<option value="">' + esc(opt.blank || "—") + "</option>";
    if (value && !known) h += '<option selected value="' + esc(value) + '">' + esc(value) + "</option>";
    options.forEach(function (o) {
      h += "<option" + (String(o.value) === String(value) ? " selected" : "") + (o.disabled ? " disabled" : "") + ' value="' + esc(o.value) + '">' + esc(o.text) + "</option>";
    });
    return h + "</select>";
  }
  function radio(path, value, current, text, id, disabled) {
    return '<label class="opt" for="' + esc(id) + '"><input type="radio" id="' + esc(id) + '" name="' + esc(path) + '" data-bind="' + esc(path) + '" data-f="' + esc("ra:" + id) +
      '" value="' + esc(value) + '"' + (String(value) === String(current) ? " checked" : "") + (disabled ? " disabled" : "") + "> " + text + "</label>";
  }
  function tickList(path, items, chosen, max) {
    var full = chosen.length >= max, f = trim(S.filters[path]).toLowerCase();
    if (!items.length) return '<p class="empty-line">Nothing to choose from in the rules list.</p>';
    var box = items.length > 16 ? '<input type="search" class="tick-filter" data-filter="' + esc(path) + '" data-f="' + esc("flt:" + path) + '" value="' + esc(S.filters[path] || "") +
      '" placeholder="Filter by name or school…" aria-label="Filter the list">' : "";
    return box + '<div class="tick-grid">' + items.map(function (it, i) {
      var on = chosen.some(function (c) { return same(c, it.value); }), id = "t-" + path.replace(/\W/g, "") + "-" + i;
      var dis = it.locked || (!on && full);
      var hide = f && !on && (it.text + " " + (it.sub || "")).toLowerCase().indexOf(f) < 0;
      return '<div class="tick' + (on ? " on" : "") + (it.locked ? " locked" : "") + (hide ? " hide" : "") + '" data-text="' + esc((it.text + " " + (it.sub || "")).toLowerCase()) + '"><input type="checkbox" id="' + id + '" data-toggle="' + esc(path) + '" data-f="' + esc("tk:" + path + ":" + it.value) +
        '" value="' + esc(it.value) + '"' + (on || it.locked ? " checked" : "") + (dis ? " disabled" : "") + '><label for="' + id + '">' + esc(it.text) +
        (it.sub ? "<small>" + esc(it.sub) + "</small>" : "") + "</label>" + (it.url ? " " + wikiIcon(it.url, it.text) : "") + "</div>";
    }).join("") + "</div>";
  }
  function counter(n, allow) {
    var left = allow - n;
    return '<span class="count' + (left < 0 ? " over" : "") + '">' + (left === 0 ? "all " + allow + " chosen" : left > 0 ? n + " of " + allow + " chosen, " + left + " to go" : (-left) + " too many") + "</span>";
  }
  function spellItems(spells, have) {
    return spells.map(function (s) {
      var tags = [s.level ? ord(s.level) + " level" : "cantrip", s.school].filter(Boolean);
      if (s.ritual) tags.push("ritual");
      if (s.concentration) tags.push("concentration");
      var already = have && have.some(function (h) { return same(h, s.name); });
      if (already) tags.push("already known");
      return { value: s.name, text: s.name, sub: tags.join(" · "), url: s.url, locked: already };
    });
  }

  /* 1. Class */
  function stepClass(i) {
    var cur = S.cur, u = S.u;
    var opts = R.classes.map(function (c) {
      var ex = cur.classes.filter(function (x) { return x.key === c.key; })[0];
      return { value: c.key, text: ex ? c.name + " (level " + ex.level + " → " + (ex.level + 1) + ")" : c.name + " (new class: needs " + mcText(c) + ")" };
    });
    var h = '<p class="help">Choose the class that gains this level: one you already have, or a new one. ' +
      "A new class (multiclassing) needs the requirements of every class you already have and of the new one, met by your current scores. " +
      wiki(WIKI + "rules:multiclassing", "Multiclassing on the wiki") + ".</p>";
    h += '<div class="grid2"><div><label class="lbl" for="fCls">Class</label>' + select("u.cls", u.cls, opts, { id: "fCls", blank: "Choose…" }) + "</div><div></div></div>";
    var c = i.c;
    if (c) {
      h += '<div class="derived">' +
        "<div><b>" + wiki(c.url, c.name) + '</b><span class="tracker-note">Read what level ' + i.classLevel + " brings on the wiki.</span></div>" +
        '<div><b>New level</b><span class="big">' + c.name + " " + i.classLevel + '</span><span class="tracker-note">Character level ' + i.newLevel + ".</span></div>" +
        "<div><b>Hit die</b>d" + i.die + "</div>" +
        "<div><b>This level</b>" + esc(list([i.needSub ? (c.subclassLabel || "subclass") : "", i.isAsi ? "Ability Score Improvement or feat" : "", i.expertise ? "Expertise" : "",
          i.newCantrips ? plural(i.newCantrips, "cantrip") : "", i.newKnown ? plural(i.newKnown, "new spell") : "", i.newBook ? plural(i.newBook, "spell") + " for the book" : ""].filter(Boolean)) || "hit points and the class’s features") + "</div>" +
        "</div>";
      if (i.isNew) {
        h += "<h3>Multiclassing</h3><p class=\"help\">Your scores now: " + esc(AKEYS.map(function (k) { return ANAME[k] + " " + cur.abilities[k]; }).join(", ")) + ".</p><ul class=\"mc-list\">" +
          cur.classes.concat([{ key: c.key, name: c.name }]).map(function (x) {
            var rc = classOf(x.key), ok = rc ? mcMet(rc, cur.abilities) : false;
            return "<li>" + (ok ? "✓ " : "✗ ") + esc(x.name) + ": " + esc(rc ? mcText(rc) : "unknown class") + "</li>";
          }).join("") + "</ul>";
      }
    }
    return h;
  }

  /* 2. Hit points */
  function stepHp(i) {
    var u = S.u, c = i.c;
    if (!c) return '<p class="empty-line">Choose a class first.</p>';
    if (!c.hitDie && i.isNew && !(u.hp.method === "roll" && u.hp.roll)) {
      var dieSel = '<div class="grid2"><div><label class="lbl" for="fDie">Hit die (ask the Dungeon Master)</label>' +
        select("u.die", u.die ? String(u.die) : "", DICE.map(function (n) { return { value: String(n), text: "d" + n }; }), { id: "fDie", blank: "Choose…" }) +
        '<p class="info">The rules list no hit die for the ' + esc(c.name) + ".</p></div><div></div></div>";
      if (!i.die) return dieSel;
      return dieSel + stepHpBody(i);
    }
    return stepHpBody(i);
  }
  function stepHpBody(i) {
    var u = S.u;
    var h = '<p class="help">Roll your d' + i.die + " once, or take the average (" + i.avg + "), and add your Constitution modifier (" + signed(i.conNew) + "); you gain at least 1. " +
      "The roll is kept and the Dungeon Master sees it.</p>";
    var rolled = u.hp.method === "roll" && u.hp.roll;
    h += '<div class="opts" role="radiogroup" aria-label="Hit points">' +
      radio("u.hp.method", "roll", u.hp.method, "Roll the d" + i.die, "hpR") + radio("u.hp.method", "average", u.hp.method, "Take the average (" + i.avg + ")", "hpA", rolled) + "</div>";
    if (u.hp.method === "roll") {
      h += '<div class="roll-box">' + (rolled
        ? '<span class="die" aria-label="The die shows ' + u.hp.roll + '">' + u.hp.roll + '</span><p class="info">Rolled ' + esc(fmtDateTime(u.hp.rolledAt)) + " on a d" + esc(u.hp.die || i.die) + ".</p>"
        : '<button type="button" class="btn" data-act="rollhp" data-f="rollhp">Roll the d' + i.die + "</button>") + "</div>";
    }
    if (u.hp.method && (u.hp.method === "average" || rolled)) {
      h += '<div class="derived"><div><b>Gained</b><span class="big">+' + i.hpGain + '</span><span class="tracker-note">' + i.hpBase + " " + signed(i.conNew) + (i.hpBase + i.conNew < 1 ? ", at least 1" : "") + ".</span></div>" +
        '<div><b>Hit point maximum</b><span class="big">' + i.hpMax + '</span><span class="tracker-note">Was ' + S.cur.hpMax + (i.hpRetro ? "; " + signed(i.hpRetro) + " for the higher Constitution (1 per level)" : "") + ".</span></div></div>";
    }
    return h;
  }

  /* 3. Class features */
  function stepFeatures(i) {
    var u = S.u, c = i.c, cur = S.cur, h = "";
    if (!c) return '<p class="empty-line">Choose a class first.</p>';
    if (!i.needSub && !i.mcSkill && !i.expertise) {
      return '<p class="help">Nothing to choose here at ' + esc(c.name) + " level " + i.classLevel + ": the class’s features for this level are on " + wiki(c.url, "the " + c.name + "’s page") + ". Go on to the next step.</p>";
    }
    h += '<p class="help">The choices that come with ' + esc(c.name) + " level " + i.classLevel + ". " + wiki(c.url, "The " + c.name + " on the wiki") + ".</p>";
    if (i.needSub) {
      var sub = findByName(c.subclasses, u.subclass);
      h += '<div class="grid2"><div><label class="lbl" for="fSub">' + esc(c.subclassLabel || "Subclass") + "</label>" +
        select("u.subclass", u.subclass, (c.subclasses || []).map(function (s) { return { value: s.name, text: s.name + (s.source ? " (" + s.source + ")" : "") }; }), { id: "fSub", blank: "Choose…" }) +
        (sub ? '<p class="info">' + wiki(sub.url, "About " + sub.name) + "</p>" : "") + "</div><div></div></div>";
    }
    if (i.mcSkill) {
      var from = (i.mcSkill === "any" ? SKEYS : skillFrom(c)).filter(function (k) { return !cur.skills[k] || k === u.mcSkill; });
      h += '<div class="grid2"><div><label class="lbl" for="fMcSkill">One skill from multiclassing into ' + esc(c.name) + "</label>" +
        select("u.mcSkill", u.mcSkill, from.map(function (k) { return { value: k, text: SNAME[k] }; }), { id: "fMcSkill", blank: "Choose…" }) + "</div><div></div></div>";
    }
    if (i.expertise) {
      var prof = SKEYS.filter(function (k) { return (cur.skills[k] === 1) || (k === u.mcSkill && i.skills[k] >= 1); });
      h += "<h3>Expertise " + counter(u.expertise.length, i.expertise) + '</h3><p class="help">Choose ' + plural(i.expertise, "skill") + " you are proficient in: your proficiency bonus doubles for them.</p>";
      h += tickList("u.expertise", prof.map(function (k) { return { value: k, text: SNAME[k] }; }), u.expertise, i.expertise);
    }
    return h;
  }

  /* 4. Scores or feat */
  function stepAsi(i) {
    var u = S.u, c = i.c, cur = S.cur;
    if (!c) return '<p class="empty-line">Choose a class first.</p>';
    if (!i.isAsi) return '<p class="help">' + esc(c.name) + " level " + i.classLevel + " brings no Ability Score Improvement (that comes at " + esc(c.name) + " level " +
      esc((c.asiLevels || []).join(", ")) + "). Go on to the next step.</p>";
    var a = u.asi, aOpts = AKEYS.map(function (k) { return { value: k, text: ANAME[k] + " (" + cur.abilities[k] + ")", disabled: cur.abilities[k] >= 20 }; });
    var h = '<p class="help">' + esc(c.name) + " level " + i.classLevel + " brings an Ability Score Improvement: raise one score by 2, or two scores by 1 (no higher than 20), " +
      "or take a feat instead. " + wiki(WIKI + "feats", "Feats on the wiki") + ".</p>";
    h += '<div class="opts" role="radiogroup" aria-label="Improvement or feat">' + radio("u.asi.mode", "asi", a.mode, "Raise ability scores", "asiA") + radio("u.asi.mode", "feat", a.mode, "Take a feat", "asiF") + "</div>";
    if (a.mode === "asi") {
      h += '<div class="opts" role="radiogroup" aria-label="How to raise">' + radio("u.asi.split", "2", a.split, "+2 to one score", "spl2") + radio("u.asi.split", "1-1", a.split, "+1 to two scores", "spl11") + "</div>";
      h += '<div class="grid2"><div><label class="lbl" for="asi0">' + (a.split === "2" ? "+2 to" : "+1 to") + "</label>" + select("u.asi.a.0", a.a[0], aOpts, { id: "asi0", blank: "Choose…" }) + "</div>" +
        (a.split === "1-1" ? '<div><label class="lbl" for="asi1">+1 to</label>' + select("u.asi.a.1", a.a[1], aOpts, { id: "asi1", blank: "Choose…" }) + "</div>" : "<div></div>") + "</div>";
      h += '<table class="grid-table ab-table" style="margin-top:.8rem"><thead><tr><th>Ability</th><th>Now</th><th>New</th><th>Mod.</th></tr></thead><tbody>' + AKEYS.map(function (k) {
        var n = i.abilities[k];
        return "<tr><td>" + esc(ANAME[k]) + "</td><td>" + cur.abilities[k] + "</td><td" + (n > 20 ? ' class="over"' : "") + "><strong>" + n + "</strong></td><td>" + signed(mod(n)) + "</td></tr>";
      }).join("") + "</tbody></table>";
    } else if (a.mode === "feat") {
      var ft = findByName(R.feats, a.feat);
      h += '<div class="grid2"><div><label class="lbl" for="fFeat">Feat</label>' + select("u.asi.feat", a.feat, R.feats.map(function (f) {
        var had = cur.feats.some(function (g) { return same(g.name, f.name); });
        return { value: f.name, text: f.name + (f.prerequisite ? " (needs: " + f.prerequisite + ")" : "") + (had ? " — you have it" : ""), disabled: had };
      }), { id: "fFeat", blank: "Choose…" }) +
        (ft ? '<p class="info">' + wiki(ft.url, "About " + ft.name) + (ft.prerequisite ? ". Prerequisite: " + esc(ft.prerequisite) + ": the Dungeon Master checks it" : "") + ".</p>" : "") + "</div><div></div></div>";
    }
    return h;
  }

  /* 5. Spells */
  function stepSpells(i) {
    var u = S.u, c = i.c;
    if (!c) return '<p class="empty-line">Choose a class first.</p>';
    var after = buildProposal(S.raw, S.cur, u).data, sl = slotsFor(normData(after).classes);
    var slotsLine = '<p class="info">Your spell slots at level ' + i.newLevel + ": " + esc(slotsText(sl)) + ".</p>";
    if (!i.sc) return '<p class="help">The ' + esc(c.name) + " casts no spells. Nothing to choose here: go on to the next step.</p>" + (sl.row.some(Boolean) || sl.pact ? slotsLine : "");
    var sc = i.sc, mineNames = i.mine.map(function (s) { return s.name; });
    var h = '<p class="help">' + esc(c.name) + " level " + i.classLevel + (i.cc.sub ? " (" + esc(i.cc.sub) + ")" : "") + ": " +
      (i.maxL ? "spells of up to " + ord(i.maxL) + " level from the " + esc(i.cc.name) + " list" + (i.cc.sub ? ", within the limits on " + wiki((findByName(c.subclasses, i.cc.sub) || {}).url, "its page") : "") + " (as for a " + esc(c.name) + " of that level alone, even if your other classes give higher slots)." : "no spells of 1st level or higher yet.") + "</p>" + slotsLine;
    var nothing = true;
    if (i.newCantrips) {
      nothing = false;
      h += "<h3>New cantrips " + counter(u.cantrips.length, i.newCantrips) + "</h3>" + tickList("u.cantrips", spellItems(classSpells(i.cc, 0, 0), mineNames), u.cantrips, i.newCantrips);
    }
    if (sc.type === "known") {
      if (i.newKnown) {
        nothing = false;
        h += "<h3>New spells known " + counter(u.spells.length, i.newKnown) + "</h3>" + tickList("u.spells", spellItems(classSpells(i.cc, 1, i.maxL), mineNames.concat(u.swapIn ? [u.swapIn] : [])), u.spells, i.newKnown);
      }
      if (i.canSwap) {
        nothing = false;
        var outs = i.mine.filter(function (s) { return s.level >= 1; }).map(function (s) { return { value: s.name, text: s.name + " (" + ord(s.level) + ")" }; });
        var ins = classSpells(i.cc, 1, i.maxL).filter(function (s) { return !mineNames.some(function (n) { return same(n, s.name); }) && !u.spells.some(function (n) { return same(n, s.name); }); })
          .map(function (s) { return { value: s.name, text: s.name + " (" + ord(s.level) + ")" }; });
        h += '<h3>Swap one spell (optional)</h3><p class="help">You may forget one ' + esc(c.name) + " spell you know and learn another in its place.</p>" +
          '<div class="grid2"><div><label class="lbl" for="swOut">Forget</label>' + select("u.swapOut", u.swapOut, outs, { id: "swOut", blank: "No swap" }) + "</div>" +
          '<div><label class="lbl" for="swIn">Learn instead</label>' + select("u.swapIn", u.swapIn, ins, { id: "swIn", blank: u.swapOut ? "Choose…" : "No swap" }) + "</div></div>";
      }
    } else if (sc.type === "spellbook") {
      if (i.newBook) {
        nothing = false;
        h += "<h3>Into your spellbook " + counter(u.book.length, i.newBook) + "</h3>" + tickList("u.book", spellItems(classSpells(i.cc, 1, i.maxL), mineNames), u.book, i.newBook);
      }
      if (i.prepCount) {
        nothing = false;
        var book = i.mine.filter(function (s) { return s.level >= 1; }).map(function (s) { return spellOf(s.name) || { name: s.name, level: s.level }; })
          .concat(u.book.map(spellOf).filter(Boolean));
        h += "<h3>Prepared " + counter(u.prepared.length, i.prepCount) + '</h3><p class="help">From your spellbook: ' + esc(prepFormula(i.cc)) + ".</p>" + tickList("u.prepared", spellItems(book), u.prepared, i.prepCount);
      }
    } else if (i.prepCount) {
      nothing = false;
      h += "<h3>Prepared spells " + counter(u.prepared.length, i.prepCount) + '</h3><p class="help">From the whole ' + esc(c.name) + " list: " + esc(prepFormula(i.cc)) + ".</p>" +
        tickList("u.prepared", spellItems(classSpells(i.cc, 1, i.maxL)), u.prepared, i.prepCount);
    }
    if (nothing) h += '<p class="help">No new spells to choose at this level. Go on to the next step.</p>';
    return h;
  }

  /* 6. Review */
  function stepReview(built, L) {
    var ok = L.every(function (x) { return x.ok; });
    var h = '<section class="create-panel" aria-labelledby="stepTitle"><h2 id="stepTitle">6. Review</h2>' +
      "<p>Your adventurer before and after this level. When every rule below is ticked, send it to the Dungeon Master, who approves it onto the sheet or sends it back with a note. " +
      "Notes marked ! are for the Dungeon Master to agree, and do not stop you.</p>" +
      hpLine(built.data._levelup) + diffTable(S.raw, built.data) + checklistHtml(L) +
      '<p style="margin-top:1rem"><button type="button" class="btn" data-act="submit" data-f="submit"' + (ok ? "" : " disabled") + ">Send to the Dungeon Master</button> " +
      (ok ? "" : '<span class="xp-hint">Fix the points marked ✗ first.</span>') + "</p></section>";
    return h;
  }

  // Rolls made for earlier requests at this level (withdrawn or sent back)
  // come back: choosing that class again brings its roll with it.
  function seedRolls(u) {
    var seen = {};
    S.reqs.forEach(function (r) {
      if (int(r.from_level, -1, -1, 99) !== S.cur.level || r.status === "pending" || r.status === "approved") return;
      var lu = obj(obj(r.data)._levelup), hp = obj(lu.hp), ch = obj(lu.choices);
      var rolls = (Array.isArray(ch.hpHistory) ? ch.hpHistory : []).slice(0, 12);
      if (hp.method === "roll" && hp.roll) rolls.push({ cls: lu.class, die: hp.die, roll: hp.roll, rolledAt: hp.rolledAt });
      rolls.forEach(function (x) {
        x = obj(x);
        var k = String(x.rolledAt) + "|" + x.roll;
        if (seen[k] || !x.roll) return;
        seen[k] = true;
        u.hpHistory.push({ cls: str(x.cls, 40), die: int(x.die, 8, 4, 12), roll: int(x.roll, 1, 1, 12), rolledAt: str(x.rolledAt, 40) });
      });
    });
  }

  /* ---------------------------------------------------- editing state */
  function getPath(path) {
    var parts = path.split("."), o = S;
    for (var i = 0; i < parts.length; i++) { if (o == null) return undefined; o = o[parts[i]]; }
    return o;
  }
  function setPath(path, value) {
    var parts = path.split("."), o = S;
    for (var i = 0; i < parts.length - 1; i++) { if (o[parts[i]] == null) return; o = o[parts[i]]; }
    o[parts[parts.length - 1]] = value;
  }
  function onChanged(path, old) {
    var u = S.u;
    if (path === "u.cls" && old !== u.cls) {
      u.subclass = ""; u.mcSkill = ""; u.expertise = []; u.die = 0; u.asi = { mode: "", split: "2", a: ["", ""], feat: "" };
      u.cantrips = []; u.spells = []; u.swapOut = ""; u.swapIn = ""; u.book = []; u.prepared = [];
      // a roll belongs to the class it was rolled for: set it aside, and bring back one made earlier for this class
      if (u.hp.method === "roll" && u.hp.roll) u.hpHistory.push({ cls: old || "", die: u.hp.die || 0, roll: u.hp.roll, rolledAt: u.hp.rolledAt });
      u.hp = { method: "", roll: null, die: null, rolledAt: "" };
      var back = u.hpHistory.filter(function (x) { return x.cls === u.cls; })[0];
      if (back) { u.hp = { method: "roll", roll: back.roll, die: back.die, rolledAt: back.rolledAt }; u.hpHistory = u.hpHistory.filter(function (x) { return x !== back; }); }
      // a prepared caster starts from what it prepares now
      var i = compute(S.cur, u);
      if (i.sc && i.sc.type !== "known") u.prepared = i.mine.filter(function (s) { return s.level >= 1 && s.prepared; }).map(function (s) { return s.name; }).slice(0, i.prepCount);
    }
    if (path === "u.subclass" && old !== u.subclass) { u.cantrips = []; u.spells = []; u.swapOut = ""; u.swapIn = ""; }
    if (path === "u.asi.mode") { u.asi.a = ["", ""]; u.asi.feat = ""; u.asi.split = "2"; }
    if (path === "u.asi.split") u.asi.a = ["", ""];
    if (path === "u.swapOut" && !u.swapOut) u.swapIn = "";
    if (path === "u.mcSkill") u.expertise = u.expertise.filter(function (k) { return k !== old; });
    if (path === "u.book") u.prepared = u.prepared.filter(function (n) {
      return S.cur.spells.some(function (s) { return s.class === u.cls && same(s.name, n); }) || u.book.some(function (b) { return same(b, n); });
    });
  }

  function goStep(n) {
    var u = S.u, L = checks(S.cur, u, { allowed: S.allowed }), from = u.step;
    n = Math.max(0, Math.min(REVIEW, n));
    if (n > from) {
      for (var k = from; k < n; k++) {
        if (problemsFor(L, k).length) {
          u.step = k; S.flash = true; render(); S.flash = false;
          var box = $("problems");
          if (box) box.scrollIntoView({ block: "center", behavior: "smooth" });
          toast("Not yet: " + problemsFor(L, k)[0].problem);
          return;
        }
      }
    }
    u.step = n;
    keep();
    render();
    var top = root().querySelector(".steps");
    if (top) top.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  function rollHp() {
    var u = S.u, c = classOf(u.cls);
    if (!c || (u.hp.method === "roll" && u.hp.roll)) return;
    var die = compute(S.cur, u).die;
    if (!die) return;
    u.hp = { method: "roll", roll: randInt(die), die: die, rolledAt: new Date().toISOString() };
    keep();
    render();
  }

  async function submit() {
    var u = S.u, L = checks(S.cur, u, { allowed: S.allowed });
    if (!L.every(function (x) { return x.ok; })) { toast("Some rules are not met yet."); return; }
    if (!window.confirm("Send this level-up to the Dungeon Master? While it waits, you can withdraw it.")) return;
    var built = buildProposal(S.raw, S.cur, u);
    built.data._levelup.requestedBy = S.email;
    built.data._levelup.requestedAt = new Date().toISOString();
    try {
      var r = await S.db.rpc("dnd_request_levelup", { p_slug: S.slug, p_data: built.data });
      if (r.error) throw r.error;
      forget();
      S.mode = "view"; S.u = null;
      toast("Sent to the Dungeon Master.");
      await load();
    } catch (e) {
      console.error(e);
      setStatus("Not sent: " + errText(e), true);
      window.alert("Not sent: " + errText(e));
    }
  }

  async function withdraw(id) {
    if (!window.confirm("Withdraw this level-up? You can make a new one afterwards.")) return;
    try {
      var r = await S.db.rpc("dnd_close_levelup", { p_id: +id, p_note: "" });
      if (r.error) throw r.error;
      toast("Withdrawn.");
    } catch (e) {
      console.error(e);
      window.alert("That did not work: " + errText(e));
    }
    load();
  }

  /* Dungeon Master: approve or send back */
  var deciding = null;
  function openDecide(kind, id) {
    deciding = +id;
    if (kind === "approve") {
      var p = pending();
      if (p) {
        var lu = obj(obj(p.data)._levelup), L = checks(S.cur, normU(lu.choices, S.cur.level), { stored: obj(p.data), raw: S.raw });
        var bad = L.filter(function (x) { return !x.ok; }).length + (int(p.from_level, -1, -1, 99) !== S.cur.level ? 1 : 0);
        if (bad && !window.confirm("This level-up breaks " + plural(bad, "rule") + " (listed in red). Approve it anyway?")) return;
      }
      $("lvApproveNote").value = ""; $("lvApproveMsg").textContent = ""; $("lvApproveSend").disabled = false;
      $("lvApproveDialog").showModal();
    } else {
      $("lvRejectNote").value = ""; $("lvRejectMsg").textContent = ""; $("lvRejectSend").disabled = false;
      $("lvRejectDialog").showModal();
      $("lvRejectNote").focus();
    }
  }
  $("lvApproveCancel").addEventListener("click", function () { $("lvApproveDialog").close(); });
  $("lvRejectCancel").addEventListener("click", function () { $("lvRejectDialog").close(); });
  $("lvApproveForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var msg = $("lvApproveMsg");
    $("lvApproveSend").disabled = true; msg.textContent = "Approving…";
    try {
      var r = await S.db.rpc("dnd_approve_levelup", { p_id: deciding, p_note: $("lvApproveNote").value.trim() });
      if (r.error) throw r.error;
      $("lvApproveDialog").close();
      toast("Approved: the sheet is at the new level.");
      load();
    } catch (err) {
      console.error(err);
      msg.textContent = "Not approved: " + errText(err);
      $("lvApproveSend").disabled = false;
    }
  });
  $("lvRejectForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var note = $("lvRejectNote").value.trim(), msg = $("lvRejectMsg");
    if (!note) { msg.textContent = "Write a note so the player knows what to change."; return; }
    $("lvRejectSend").disabled = true; msg.textContent = "Sending…";
    try {
      var r = await S.db.rpc("dnd_close_levelup", { p_id: deciding, p_note: note });
      if (r.error) throw r.error;
      $("lvRejectDialog").close();
      toast("Sent back to the player.");
      load();
    } catch (err) {
      console.error(err);
      msg.textContent = "Not sent: " + errText(err);
      $("lvRejectSend").disabled = false;
    }
  });

  /* ----------------------------------------------------------- events */
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]");
    if (!b || !root() || !root().contains(b)) return;
    var a = b.getAttribute("data-act");
    if (a === "withdraw") { withdraw(b.getAttribute("data-id")); return; }
    if (a === "approve" || a === "sendback") { openDecide(a, b.getAttribute("data-id")); return; }
    if (a === "start") {
      if (!canLevel()) return;
      var was = kept();
      S.u = normU(was || {}, S.cur.level); S.u.active = true;
      if (!was) seedRolls(S.u);
      S.mode = "wizard"; keep(); render();
      var t = root().querySelector(".steps");
      if (t) t.scrollIntoView({ block: "start", behavior: "smooth" });
      return;
    }
    if (S.mode !== "wizard") return;
    if (a === "cancel") {
      // the choices (and any roll) stay in this browser for when you carry on
      S.u.active = false; keep();
      S.mode = "view"; S.u = null;
      render();
      return;
    }
    if (a === "go") goStep(+b.getAttribute("data-step"));
    else if (a === "next") goStep(S.u.step + 1);
    else if (a === "back") goStep(S.u.step - 1);
    else if (a === "rollhp") rollHp();
    else if (a === "submit") submit();
  });

  // Narrow a long list without redrawing it (ticked items always stay visible).
  document.addEventListener("input", function (e) {
    var t = e.target;
    if (!t.matches || !t.matches("input[data-filter]") || !root() || !root().contains(t)) return;
    var path = t.getAttribute("data-filter"), f = trim(t.value).toLowerCase(), grid = t.nextElementSibling;
    S.filters[path] = t.value;
    if (!grid) return;
    grid.querySelectorAll(".tick").forEach(function (el) {
      el.classList.toggle("hide", !!f && !el.classList.contains("on") && (el.getAttribute("data-text") || "").indexOf(f) < 0);
    });
  });

  document.addEventListener("change", function (e) {
    var t = e.target;
    if (S.mode !== "wizard" || !root() || !root().contains(t)) return;
    if (t.matches("input[type=checkbox][data-toggle]")) {
      var path = t.getAttribute("data-toggle"), arr = getPath(path);
      if (!Array.isArray(arr)) return;
      var idx = -1;
      arr.forEach(function (x, j) { if (same(x, t.value)) idx = j; });
      if (t.checked && idx < 0) arr.push(t.value);
      if (!t.checked && idx >= 0) arr.splice(idx, 1);
      onChanged(path, null);
      keep(); render();
      return;
    }
    if (!t.matches("select[data-bind], input[type=radio][data-bind]")) return;
    var p = t.getAttribute("data-bind"), old = getPath(p);
    var am = p.match(/^u\.asi\.a\.(\d)$/);
    if (am) S.u.asi.a[+am[1]] = t.value;
    else if (p === "u.hp.method") {
      if (S.u.hp.method === "roll" && S.u.hp.roll) { render(); return; }   // rolled: it stays
      S.u.hp.method = t.value;
    } else if (p === "u.die") { if (S.u.hp.method === "roll" && S.u.hp.roll) { render(); return; } S.u.die = int(t.value, 0, 0, 20); }
    else setPath(p, t.value);
    onChanged(p, old);
    keep(); render();
  });
})();
