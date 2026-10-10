/* =====================================================================
   VAMPIRE: THE DARK AGES — Create Kindred (V20), shared by every
   chronicle made with the Builder (<body data-chronicle="...">)
   ---------------------------------------------------------------------
   create.html walks a player through character creation, step by step,
   on the parchment of the character sheet (sheet.css), and keeps the
   result as a draft in the character_drafts table:

     create.html               your drafts (and, for the Storyteller,
                               the drafts waiting for approval)
     create.html?new=1         a new Cainite
     create.html?draft=<id>    carry on with a draft
     create.html?review=<id>   a draft read-only, with every rule checked
                               again here; the Storyteller approves it
                               or sends it back from this view

   The draft's data is a complete character sheet in the shape sheet.js
   reads (normalise()), plus data._creation: the wizard's own record of
   the choices (priorities, the dots placed before freebie points, what
   the freebie points bought, the blood roll). Everything on the sheet
   is rebuilt from that record, so the Storyteller's review can check
   that the two still agree.

   The database decides who may write what; drafts are only written
   through its functions (save_draft, submit_draft, withdraw_draft,
   delete_draft, approve_draft, reject_draft). This page waits for the
   members' gate (gate.js) and uses its Supabase client.

   Names, costs and table figures come from vtda/assets/data/rules-data.js
   (window.VAMPIRE_RULES); the rules themselves are in the world's
   members-only rules pages (../rules.html?p=<page>), which this page
   links to. A world whose options name its clans ({"clans": [...]},
   set in the Builder) offers only those clans.
   ===================================================================== */
(function () {
  "use strict";

  if (!window.Gate) return;

  var CHRONICLE = document.body.getAttribute("data-chronicle") || "";
  var WORLD = document.body.getAttribute("data-world") || "";
  var ALLOWED_CLANS = null;   // null: every clan; else { "lower-case name": true }
  var RULES = window.VAMPIRE_RULES || { abilities: {}, clans: [], disciplines: [], paths: [], roads: [], archetypes: [],
    backgrounds: [], merits: [], generations: [], health: [], expertise: [] };
  var RULES_URL = "../rules.html?p=";
  var PAGE = (window.location.pathname.split("/").pop() || "create.html");

  var FREEBIES = 15, MAX_MERITS = 7, MAX_FLAWS = 7;
  var COST = { attribute: 5, ability: 2, discipline: 7, path: 4, background: 1, virtue: 2, road: 2, willpower: 1 };
  var RANKS = ["primary", "secondary", "tertiary"];
  var ATTR_DOTS = [7, 5, 3], ABIL_DOTS = [13, 9, 5];
  var DISC_DOTS = 4, BG_DOTS = 5, VIRTUE_DOTS = 7;
  var SORCERIES = ["Thaumaturgy", "Necromancy"];

  var ATTRS = [
    ["Physical", ["strength", "dexterity", "stamina"]],
    ["Social",   ["charisma", "manipulation", "appearance"]],
    ["Mental",   ["perception", "intelligence", "wits"]]
  ];
  var ALL_ATTRS = [].concat.apply([], ATTRS.map(function (g) { return g[1]; }));
  function key(name) { return String(name).toLowerCase().replace(/[^a-z]/g, ""); }
  var ABILITIES = ["Talents", "Skills", "Knowledges"].map(function (g) {
    return [g, (RULES.abilities[g] || []).map(function (n) { return [key(n), n]; })];
  });
  var ALL_ABILITIES = [].concat.apply([], ABILITIES.map(function (g) { return g[1]; }));
  var ABILITY_NAME = {};
  ALL_ABILITIES.forEach(function (a) { ABILITY_NAME[a[0]] = a[1]; });
  var EXPERTISE = (RULES.expertise || []).map(key);
  var EXPERTISE_EG = { academics: "canon law", commerce: "the wool trade", crafts: "smithing", performance: "the lute" };
  var VIRTUES = { conscience: "Conscience", conviction: "Conviction", selfcontrol: "Self-Control", instinct: "Instinct", courage: "Courage" };
  var VKEYS = Object.keys(VIRTUES);
  var HEALTH = RULES.health && RULES.health.length ? RULES.health
    : [["Bruised", 0], ["Hurt", -1], ["Injured", -1], ["Wounded", -2], ["Mauled", -2], ["Crippled", -5], ["Incapacitated", null]];
  var GEN_NAMES = ["Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth", "Eleventh", "Twelfth", "Thirteenth"];

  var STEPS = ["Concept", "Attributes", "Abilities", "Advantages", "Finishing touches", "Freebie points", "Blood", "Details", "Review"];
  var REVIEW = STEPS.length - 1;
  var STATUS = { draft: "Draft", submitted: "Waiting for the Storyteller", rejected: "Sent back", approved: "Approved" };

  var S = {
    db: null, role: "player", email: "",
    mode: "list", row: null, id: null, status: "draft",
    d: null, p: null, w: null,
    saveChain: Promise.resolve(true), saving: false, dirty: false, flash: false
  };

  /* ------------------------------------------------------------ helpers */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function int(v, def, min, max) {
    v = parseInt(v, 10);
    if (isNaN(v)) v = def;
    return Math.max(min, Math.min(max, v));
  }
  function str(v, max) { return typeof v === "string" ? v.slice(0, max || 200) : ""; }
  function trim(v) { return String(v == null ? "" : v).trim(); }
  function same(a, b) { return trim(a).toLowerCase() === trim(b).toLowerCase(); }
  function errText(e) { return (e && e.message) ? e.message : String(e); }
  function sum(o) { return Object.keys(o).reduce(function (t, k) { return t + (o[k] || 0); }, 0); }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); }
  function list(names) {
    if (names.length < 2) return names.join("");
    return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
  }
  function cap(k) { return k.charAt(0).toUpperCase() + k.slice(1); }
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
  function rulesLink(page, text) {
    return page ? '<a href="' + RULES_URL + encodeURIComponent(page).replace(/%2F/g, "/") + '" target="_blank" rel="noopener" title="Open the rules (members only)">' + esc(text) + "</a>" : esc(text);
  }
  function findByName(arr, name) { return (arr || []).filter(function (x) { return same(x.name, name); })[0] || null; }
  function inList(arr, name) { return (arr || []).some(function (x) { return same(x, name); }); }
  function canon(v) {
    if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
    if (v && typeof v === "object") return "{" + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ":" + canon(v[k]); }).join(",") + "}";
    return JSON.stringify(v === undefined ? null : v);
  }

  /* ------------------------------------------------------- rules data */
  function clanOf(d) { return findByName(RULES.clans, d.clan); }
  function roadOf(d) { return findByName(RULES.roads, d.road); }
  function isCaitiff(c) { return !!c && (c.kind === "Clanless" || same(c.name, "Caitiff")); }
  function takesPicks(c) { return !!c && /plus two disciplines/i.test(c.note || ""); }
  function pickSlots(c) { return isCaitiff(c) ? 3 : takesPicks(c) ? 2 : 0; }
  function isNosferatu(d) { return same(d.clan, "Nosferatu"); }
  function clanDiscs(d, w) {
    var c = clanOf(d);
    if (!c) return [];
    var out = isCaitiff(c) ? [] : c.disciplines.slice();
    w.picks.slice(0, pickSlots(c)).forEach(function (p) { if (p && !inList(out, p)) out.push(p); });
    return out;
  }
  function virtuePair(d) {
    var r = roadOf(d);
    var v = r ? r.virtues : ["Conscience", "Self-Control"];
    return [key(v[0]), key(v[1]), "courage"];
  }
  function genRow(gen) { return (RULES.generations || [])[Math.min(10, Math.max(0, gen - 3))] || { name: "", maxTrait: 5, pool: 10, perTurn: 1 }; }
  function genName(gen) { return (GEN_NAMES[gen - 3] || "") + " Generation"; }
  function pathRule(name) { return findByName(RULES.paths, name); }
  function auraNote(rating) {
    if (rating >= 10) return "Aura: −2 difficulty";
    if (rating >= 8) return "Aura: −1 difficulty";
    if (rating >= 4) return "Aura: no modifier";
    if (rating >= 2) return "Aura: +1 difficulty";
    return "Aura: +2 difficulty";
  }
  // "2 or 3" -> [2, 3]; "1–5" -> [1..5]; "2 (+1 per extra language)" -> [2..7]
  function costOptions(cost) {
    var raw = String(cost || ""), s = raw.replace(/\(.*?\)/g, "").trim(), out = [];
    var range = s.match(/^(\d+)\s*[–—-]\s*(\d+)$/);
    if (range) { for (var i = +range[1]; i <= +range[2]; i++) out.push(i); return out; }
    (s.match(/\d+/g) || []).forEach(function (n) { if (out.indexOf(+n) < 0) out.push(+n); });
    if (/\+\s*1 per/i.test(raw) && out.length === 1) { for (var j = out[0] + 1; j <= 7; j++) out.push(j); }
    return out.length ? out : [1];
  }
  function costNote(cost) { var m = String(cost || "").match(/\((.*?)\)/); return m ? m[1] : ""; }

  /* -------------------------------------------- the wizard's record */
  function blankWizard() { return normW({}); }

  // Coerce a saved record into a safe shape: never trust it, it may
  // have been written by something other than this page.
  function normW(raw) {
    var w = (raw && typeof raw === "object" && !Array.isArray(raw)) ? raw : {};
    var b = obj(w.base), f = obj(w.free);
    var o = {
      version: 1,
      step: int(w.step, 0, 0, REVIEW),
      attrPri: pri(w.attrPri, ["Physical", "Social", "Mental"]),
      abilPri: pri(w.abilPri, ["Talents", "Skills", "Knowledges"]),
      picks: (Array.isArray(w.picks) ? w.picks : []).slice(0, 3).map(function (x) { return str(x, 60); }),
      sorcery: {},
      expertise: {},
      merits: (Array.isArray(w.merits) ? w.merits : []).slice(0, 30).map(function (x) {
        x = obj(x);
        return { name: str(x.name, 80), points: int(x.points, 1, 0, 10), kind: x.kind === "Flaw" ? "Flaw" : "Merit" };
      }),
      blood: null,
      base: { attributes: {}, abilities: {}, disciplines: counts(b.disciplines), backgrounds: counts(b.backgrounds), virtues: {}, rituals: rituals(b.rituals) },
      free: { attributes: {}, abilities: {}, disciplines: counts(f.disciplines), backgrounds: counts(f.backgrounds), virtues: {},
        road: int(f.road, 0, 0, 10), willpower: int(f.willpower, 0, 0, 10),
        paths: (Array.isArray(f.paths) ? f.paths : []).slice(0, 12).map(function (x) {
          x = obj(x);
          return { name: str(x.name, 80), dots: int(x.dots, 1, 0, 10), sorcery: x.sorcery === "Necromancy" ? "Necromancy" : "Thaumaturgy" };
        }),
        rituals: rituals(f.rituals) }
    };
    while (o.picks.length < 3) o.picks.push("");
    var ba = obj(b.attributes), bb = obj(b.abilities), bv = obj(b.virtues), fa = obj(f.attributes), fb = obj(f.abilities), fv = obj(f.virtues);
    ALL_ATTRS.forEach(function (k) { o.base.attributes[k] = int(ba[k], 1, 0, 10); o.free.attributes[k] = int(fa[k], 0, 0, 10); });
    ALL_ABILITIES.forEach(function (a) { o.base.abilities[a[0]] = int(bb[a[0]], 0, 0, 10); o.free.abilities[a[0]] = int(fb[a[0]], 0, 0, 10); });
    VKEYS.forEach(function (k) { o.base.virtues[k] = int(bv[k], 1, 0, 10); o.free.virtues[k] = int(fv[k], 0, 0, 10); });
    var so = obj(w.sorcery), ex = obj(w.expertise);
    SORCERIES.forEach(function (s) { o.sorcery[s] = str(so[s], 80); });
    EXPERTISE.forEach(function (k) { o.expertise[k] = str(ex[k], 80); });
    if (w.blood && typeof w.blood === "object" && w.blood.die != null) {
      o.blood = { die: int(w.blood.die, 1, 1, 10), rolledAt: str(w.blood.rolledAt, 40) };
    }
    return o;
  }
  function obj(v) { return (v && typeof v === "object" && !Array.isArray(v)) ? v : {}; }
  function pri(v, names) {
    v = Array.isArray(v) ? v : [];
    return [0, 1, 2].map(function (i) { return inList(names, v[i]) ? names.filter(function (n) { return same(n, v[i]); })[0] : ""; });
  }
  function counts(v) {
    var o = {};
    Object.keys(obj(v)).slice(0, 40).forEach(function (k) { var n = int(v[k], 0, 0, 10); if (n > 0) o[str(k, 60)] = n; });
    return o;
  }
  function rituals(v) {
    return (Array.isArray(v) ? v : []).slice(0, 30).map(function (x) {
      x = obj(x);
      return { name: str(x.name, 80), level: int(x.level, 1, 1, 10), sorcery: x.sorcery === "Necromancy" ? "Necromancy" : "Thaumaturgy" };
    });
  }

  /* ---------------------------------------------- derived figures */
  function compute(d, w) {
    var t = { attributes: {}, abilities: {}, disciplines: {}, backgrounds: {}, virtues: {} };
    var pair = virtuePair(d), info = { t: t, pair: pair, clanDiscs: clanDiscs(d, w) };
    ALL_ATTRS.forEach(function (k) { t.attributes[k] = w.base.attributes[k] + w.free.attributes[k]; });
    ALL_ABILITIES.forEach(function (a) { t.abilities[a[0]] = w.base.abilities[a[0]] + w.free.abilities[a[0]]; });
    ["disciplines", "backgrounds"].forEach(function (kind) {
      var all = {};
      [w.base[kind], w.free[kind]].forEach(function (src) { Object.keys(src).forEach(function (n) { all[n] = (all[n] || 0) + src[n]; }); });
      Object.keys(all).forEach(function (n) { if (all[n] > 0) t[kind][n] = all[n]; });
    });
    VKEYS.forEach(function (k) { t.virtues[k] = pair.indexOf(k) >= 0 ? w.base.virtues[k] + w.free.virtues[k] : 1; });

    // The Thirteenth Generation Flaw puts the Cainite a step further from
    // Caine than the default; the Sturdy Merit adds a Bruised health level.
    info.thirteenth = w.merits.some(function (m) { return m.kind === "Flaw" && same(m.name, "Thirteenth Generation"); });
    info.extraHealth = w.merits.some(function (m) { return m.kind === "Merit" && same(m.name, "Sturdy"); }) ? 1 : 0;
    info.genDots = t.backgrounds.Generation || 0;
    info.generation = info.thirteenth ? 13 : Math.max(7, 12 - info.genDots);
    var g = genRow(info.generation);
    info.traitMax = Math.max(5, g.maxTrait || 5);
    info.pool = g.pool || 10;
    info.perTurn = g.perTurn || 1;

    info.roadBase = t.virtues[pair[0]] + t.virtues[pair[1]];
    info.roadRating = info.roadBase + w.free.road;
    info.willBase = t.virtues.courage;
    info.willpower = info.willBase + w.free.willpower;

    info.rating = {}; info.baseRating = {}; info.granted = {};
    SORCERIES.forEach(function (s) {
      info.rating[s] = t.disciplines[s] || 0;
      info.baseRating[s] = w.base.disciplines[s] || 0;
      info.granted[s] = Math.max(0, info.rating[s] - info.baseRating[s]);
    });

    // Rituals bought in the freebie step: one comes free with each
    // Discipline dot bought there; the rest cost their level. The free
    // ones are the highest levels, which is the cheapest reading.
    var ritualCost = 0;
    SORCERIES.forEach(function (s) {
      var lv = w.free.rituals.filter(function (r) { return r.sorcery === s; }).map(function (r) { return r.level; }).sort(function (a, b) { return b - a; });
      lv.slice(info.granted[s]).forEach(function (l) { ritualCost += l; });
    });
    info.spent = {
      attributes: COST.attribute * sum(w.free.attributes),
      abilities: COST.ability * sum(w.free.abilities),
      disciplines: COST.discipline * sum(w.free.disciplines),
      paths: COST.path * w.free.paths.reduce(function (n, p) { return n + p.dots; }, 0),
      rituals: ritualCost,
      backgrounds: COST.background * sum(w.free.backgrounds),
      virtues: COST.virtue * pair.reduce(function (n, k) { return n + w.free.virtues[k]; }, 0),
      road: COST.road * w.free.road,
      willpower: COST.willpower * w.free.willpower
    };
    info.traitsSpent = sum(info.spent);
    info.merits = 0; info.flaws = 0;
    w.merits.forEach(function (m) { if (m.kind === "Flaw") info.flaws += m.points; else info.merits += m.points; });
    info.left = FREEBIES + info.flaws - info.traitsSpent - info.merits;
    info.arith = FREEBIES + " + " + info.flaws + " from Flaws − " + info.traitsSpent + " on traits − " + info.merits + " on Merits = " + (info.left < 0 ? "−" + (-info.left) : info.left);

    if (w.blood) {
      var dom = t.backgrounds.Domain || 0, herd = t.backgrounds.Herd || 0, raw = w.blood.die + dom + herd;
      info.blood = { die: w.blood.die, domain: dom, herd: herd, raw: raw, cap: info.pool, result: Math.min(raw, info.pool), rolledAt: w.blood.rolledAt };
    } else info.blood = null;
    return info;
  }

  // The sheet itself, in the shape sheet.js reads, rebuilt from the record.
  function buildSheet(d, p, w) {
    var info = compute(d, w), t = info.t;
    var cd = info.clanDiscs;
    var discNames = Object.keys(t.disciplines);
    var ordered = cd.filter(function (n) { return discNames.some(function (x) { return same(x, n); }); })
      .map(function (n) { return discNames.filter(function (x) { return same(x, n); })[0]; });
    discNames.filter(function (n) { return ordered.indexOf(n) < 0; }).sort().forEach(function (n) { ordered.push(n); });

    var paths = [];
    SORCERIES.forEach(function (s) {
      if (info.rating[s] > 0 && w.sorcery[s]) paths.push({ name: w.sorcery[s], dots: Math.min(5, info.rating[s]), sorcery: s, primary: true });
    });
    w.free.paths.forEach(function (x) {
      var r = pathRule(x.name);
      if (trim(x.name) && x.dots > 0) paths.push({ name: trim(x.name), dots: Math.min(5, x.dots), sorcery: r ? r.sorcery : x.sorcery, primary: false });
    });

    var bgs = [], bgNames = Object.keys(t.backgrounds);
    (RULES.backgrounds || []).forEach(function (n) { if (t.backgrounds[n]) bgs.push({ name: n, dots: t.backgrounds[n] }); });
    bgNames.filter(function (n) { return !inList(RULES.backgrounds, n); }).forEach(function (n) { bgs.push({ name: n, dots: t.backgrounds[n] }); });

    var abilities = {};
    ALL_ABILITIES.forEach(function (a) { abilities[a[0]] = t.abilities[a[0]]; });

    var data = {
      name: trim(d.name), nature: trim(d.nature), demeanor: trim(d.demeanor), concept: trim(d.concept), clan: trim(d.clan),
      generation: info.generation, sire: trim(d.sire), road: trim(d.road),
      haven: "", domain: "", weakness: "", derangements: "",
      roadRating: info.roadRating, willpower: info.willpower,
      attributes: JSON.parse(JSON.stringify(t.attributes)),
      abilities: abilities,
      virtues: JSON.parse(JSON.stringify(t.virtues)),
      disciplines: ordered.map(function (n) { return { name: n, dots: t.disciplines[n], clan: inList(cd, n) }; }),
      paths: paths,
      rituals: w.base.rituals.concat(w.free.rituals).filter(function (r) { return trim(r.name); })
        .map(function (r) { return { name: trim(r.name), level: r.level }; }),
      backgrounds: bgs,
      expertise: EXPERTISE.filter(function (k) { return t.abilities[k] > 0 && trim(w.expertise[k]); })
        .map(function (k) { return { ability: k, name: trim(w.expertise[k]) }; }),
      meritsFlaws: w.merits.filter(function (m) { return trim(m.name); }).map(function (m) { return { name: trim(m.name), points: m.points, kind: m.kind }; }),
      extraHealth: info.extraHealth,
      _creation: w
    };
    var play = {
      blood: info.blood ? info.blood.result : 0,
      health: [], willpower: [], equipment: [],
      apparentAge: trim(p.apparentAge), embraced: trim(p.embraced), appearance: trim(p.appearance),
      history: trim(p.history), notes: "", goals: trim(p.goals)
    };
    return { data: data, play: play, info: info };
  }

  /* --------------------------------------------------------- the rules */
  // Every rule, as a list of checks. step: where it is fixed. flag: a
  // note for the Storyteller rather than a fault.
  function checks(d, p, w, stored) {
    var L = [], c = clanOf(d), info = compute(d, w), t = info.t, cd = info.clanDiscs;
    var maxName = genName(info.generation);
    function add(step, label, problem) { L.push({ step: step, label: label, problem: problem || "", ok: !problem, flag: false }); }
    function note(step, label) { L.push({ step: step, label: label, problem: "", ok: true, flag: true }); }

    /* 1. Concept */
    add(0, "A name", !trim(d.name) && "Give your Cainite a name.");
    add(0, "A concept", !trim(d.concept) && "Write a short concept, such as “exiled monk” or “horse trader”.");
    add(0, "A clan or bloodline", !trim(d.clan) ? "Choose a clan, a bloodline or Caitiff."
      : !c ? "“" + d.clan + "” is not a clan or bloodline in these rules: choose one from the list." : "");
    add(0, "A Road", !trim(d.road) ? "Choose a Road." : !roadOf(d) ? "“" + d.road + "” is not a Road in these rules: choose one from the list." : "");
    add(0, "A Nature", !trim(d.nature) ? "Choose a Nature." : !inList(RULES.archetypes, d.nature) ? "“" + d.nature + "” is not an Archetype in the list." : "");
    add(0, "A Demeanor", !trim(d.demeanor) ? "Choose a Demeanor." : !inList(RULES.archetypes, d.demeanor) ? "“" + d.demeanor + "” is not an Archetype in the list." : "");
    if (isCaitiff(c)) note(0, "Caitiff: a clanless Cainite needs the Storyteller’s agreement.");

    /* 2. Attributes */
    var nos = isNosferatu(d);
    function startDot(k) { return nos && k === "appearance" ? 0 : 1; }
    var attrPriOk = w.attrPri.every(function (x) { return x; }) && new Set(w.attrPri).size === 3;
    add(1, "Physical, Social and Mental ranked", !attrPriOk && "Rank the three categories: Physical, Social and Mental must each be primary, secondary or tertiary, once.");
    ATTRS.forEach(function (g) {
      var i = w.attrPri.indexOf(g[0]);
      if (!attrPriOk || i < 0) return;
      var allow = ATTR_DOTS[i], placed = 0;
      g[1].forEach(function (k) { placed += w.base.attributes[k] - startDot(k); });
      add(1, g[0] + " (" + RANKS[i] + "): " + allow + " dots", placed !== allow && (placed < allow
        ? g[0] + " is your " + RANKS[i] + " category: place " + allow + " dots there. " + placed + " placed, " + (allow - placed) + " to go."
        : g[0] + " is your " + RANKS[i] + " category, with " + allow + " dots to place, but " + placed + " are placed: take " + (placed - allow) + " off."));
    });
    var low = ALL_ATTRS.filter(function (k) { return w.base.attributes[k] < startDot(k); });
    add(1, "Every Attribute keeps its free dot", low.length && list(low.map(cap)) + " must keep at least 1 dot.");
    var high = ALL_ATTRS.filter(function (k) { return w.base.attributes[k] > 5; });
    add(1, "No Attribute above 5", high.length && list(high.map(cap)) + " cannot go above 5.");
    if (nos) {
      var nb = w.base.attributes.appearance, nf = w.free.attributes.appearance;
      add(nb > 0 || !nf ? 1 : 5, "Nosferatu Appearance stays at 0", (nb > 0 || nf > 0) &&
        "Nosferatu have Appearance 0 and can never raise it: take the " + plural(nb + nf, "dot") + " off Appearance.");
    }

    /* 3. Abilities */
    var abilPriOk = w.abilPri.every(function (x) { return x; }) && new Set(w.abilPri).size === 3;
    add(2, "Talents, Skills and Knowledges ranked", !abilPriOk && "Rank the three categories: Talents, Skills and Knowledges must each be primary, secondary or tertiary, once.");
    ABILITIES.forEach(function (g) {
      var i = w.abilPri.indexOf(g[0]);
      if (!abilPriOk || i < 0) return;
      var allow = ABIL_DOTS[i], placed = 0;
      g[1].forEach(function (a) { placed += w.base.abilities[a[0]]; });
      add(2, g[0] + " (" + RANKS[i] + "): " + allow + " dots", placed !== allow && (placed < allow
        ? g[0] + " are your " + RANKS[i] + " category: place " + allow + " dots there. " + placed + " placed, " + (allow - placed) + " to go."
        : g[0] + " are your " + RANKS[i] + " category, with " + allow + " dots to place, but " + placed + " are placed: take " + (placed - allow) + " off."));
    });
    var over3 = ALL_ABILITIES.filter(function (a) { return w.base.abilities[a[0]] > 3; });
    add(2, "No Ability above 3 before freebie points", over3.length &&
      list(over3.map(function (a) { return a[1] + " has " + w.base.abilities[a[0]] + " dots"; })) +
      ". No Ability may have more than 3 dots at this stage: take the extra off. You can buy them back with freebie points in step 6.");
    var exBase = [], exFree = [];
    EXPERTISE.forEach(function (k) {
      if (t.abilities[k] > 0 && !trim(w.expertise[k])) (w.base.abilities[k] > 0 ? exBase : exFree).push(k);
    });
    function exMsg(keys) {
      return keys.map(function (k) { return "Name a field of expertise for " + ABILITY_NAME[k] + " (for example " + EXPERTISE_EG[k] + ")."; }).join(" ");
    }
    add(2, "A field of expertise for Academics, Commerce, Crafts and Performance", exBase.length && exMsg(exBase));
    if (exFree.length) add(5, "A field of expertise for Abilities bought with freebie points", exMsg(exFree));

    /* 4. Advantages */
    var bd = w.base.disciplines, bdNames = Object.keys(bd).filter(function (n) { return bd[n] > 0; }), bdTotal = sum(bd);
    var notClan = bdNames.filter(function (n) { return !inList(cd, n); });
    add(3, "Disciplines: " + DISC_DOTS + " dots among the clan’s Disciplines", bdTotal !== DISC_DOTS && (bdTotal < DISC_DOTS
      ? "Place " + DISC_DOTS + " dots among your clan’s Disciplines: " + bdTotal + " placed, " + (DISC_DOTS - bdTotal) + " to go."
      : "Only " + DISC_DOTS + " dots go to Disciplines at this stage, but " + bdTotal + " are placed: take " + (bdTotal - DISC_DOTS) + " off."));
    add(3, "Only clan Disciplines before freebie points", notClan.length && list(notClan) + (notClan.length === 1 ? " is not" : " are not") +
      " among your clan’s Disciplines here: take the dots off. Other Disciplines can be bought with freebie points in step 6.");
    var slots = pickSlots(c);
    if (slots) {
      var picks = w.picks.slice(0, slots).filter(Boolean), bad = [];
      picks.forEach(function (n, i) {
        if (!findByName(RULES.disciplines, n)) bad.push("“" + n + "” is not a Discipline in these rules.");
        else if (picks.slice(0, i).some(function (x) { return same(x, n); }) || (!isCaitiff(c) && inList(c.disciplines, n))) bad.push(n + " is chosen twice.");
      });
      add(3, isCaitiff(c) ? "Caitiff Disciplines chosen from the list" : "Disciplines of the original clan chosen from the list", bad.join(" "));
      if (picks.length && isCaitiff(c)) note(3, "Caitiff Disciplines (" + list(picks) + "): the Storyteller must agree.");
      else if (picks.length) note(3, c.name + ": the Storyteller confirms " + list(picks) + " as " + (picks.length === 1 ? "a Discipline" : "Disciplines") + " of the original clan.");
      else if (isCaitiff(c)) note(3, "Caitiff: choose up to three Disciplines, which the Storyteller must agree.");
    }

    var bb = w.base.backgrounds, bbTotal = sum(bb);
    add(3, "Backgrounds: " + BG_DOTS + " dots", bbTotal !== BG_DOTS && (bbTotal < BG_DOTS
      ? "Place " + BG_DOTS + " dots among the Backgrounds: " + bbTotal + " placed, " + (BG_DOTS - bbTotal) + " to go."
      : "Only " + BG_DOTS + " dots go to Backgrounds at this stage, but " + bbTotal + " are placed: take " + (bbTotal - BG_DOTS) + " off."));
    var unknownBg = Object.keys(t.backgrounds).filter(function (n) { return !inList(RULES.backgrounds, n); });
    if (unknownBg.length) add(3, "Backgrounds from the list", list(unknownBg) + " is not a Background in these rules.");
    if (isCaitiff(c)) {
      var st = (bb.Status || 0), sf = (w.free.backgrounds.Status || 0);
      add(st || !sf ? 3 : 5, "No Status for a Caitiff", (st || sf) && "Caitiff may not take Status at character creation: take the dots off Status.");
    }
    var bgHigh = Object.keys(t.backgrounds).filter(function (n) { return t.backgrounds[n] > 5; });
    add(bgHigh.some(function (n) { return bb[n] > 5; }) ? 3 : 5, "No Background above 5 (Generation 5 dots at most: Seventh Generation)",
      bgHigh.length && list(bgHigh) + " cannot have more than 5 dots.");

    var pair = info.pair, vExtra = 0;
    pair.forEach(function (k) { vExtra += w.base.virtues[k] - 1; });
    var pairNames = list(pair.map(function (k) { return VIRTUES[k]; }));
    add(3, "Virtues: " + VIRTUE_DOTS + " dots among " + pairNames, vExtra !== VIRTUE_DOTS && (vExtra < VIRTUE_DOTS
      ? "Place " + VIRTUE_DOTS + " dots among " + pairNames + ", on top of the free dot each has: " + vExtra + " placed, " + (VIRTUE_DOTS - vExtra) + " to go."
      : "Only " + VIRTUE_DOTS + " dots go to the Virtues, but " + vExtra + " are placed: take " + (vExtra - VIRTUE_DOTS) + " off."));
    var vBad = pair.filter(function (k) { return w.base.virtues[k] < 1 || w.base.virtues[k] > 5; });
    add(3, "Every Virtue from 1 to 5", vBad.length && list(vBad.map(function (k) { return VIRTUES[k]; })) + " must stay between 1 and 5.");

    SORCERIES.forEach(function (s) {
      var br = info.baseRating[s], rits = w.base.rituals.filter(function (r) { return r.sorcery === s; });
      if (!br && !rits.length) return;
      if (br) add(3, "A primary Path of " + s, pathProblem(w.sorcery[s], s));
      var probs = [];
      if (rits.length !== br) {
        probs.push(!br ? "Rituals of " + s + " need dots in " + s + ": remove them."
          : rits.length < br ? "Choose " + plural(br, "ritual") + " of " + s + ", one for each dot: " + rits.length + " chosen."
          : "One ritual per dot of " + s + ": you have " + plural(rits.length, "ritual") + " for " + plural(br, "dot") + ", so remove " + (rits.length - br) + ".");
      }
      probs = probs.concat(ritualProblems(rits, br, s));
      add(3, "Rituals of " + s + ": one per dot, each of level " + (br || 1) + " or lower", probs.join(" "));
    });

    /* 6. Freebie points */
    add(5, "Every freebie point spent", info.left !== 0 && (info.left > 0
      ? "You have " + plural(info.left, "freebie point") + " left to spend (" + info.arith + ")."
      : "You have spent " + plural(-info.left, "freebie point") + " more than you have (" + info.arith + "): take something off."));
    add(5, "Merits: at most " + MAX_MERITS + " points", info.merits > MAX_MERITS && "Your Merits come to " + info.merits + " points; the most allowed is " + MAX_MERITS + ".");
    add(5, "Flaws: at most " + MAX_FLAWS + " points", info.flaws > MAX_FLAWS && "Your Flaws come to " + info.flaws + " points; the most allowed is " + MAX_FLAWS + ".");
    var mfBad = [], seen = {};
    w.merits.forEach(function (m) {
      var r = findByName(RULES.merits, m.name);
      if (!r) { mfBad.push("“" + m.name + "” is not a Merit or Flaw in these rules."); return; }
      if (r.type !== m.kind) mfBad.push(m.name + " is a " + r.type + ", not a " + m.kind + ".");
      if (costOptions(r.cost).indexOf(m.points) < 0) mfBad.push(m.name + " is worth " + r.cost + " points, not " + m.points + ".");
      if (seen[key(m.name)]) mfBad.push(m.name + " is taken twice.");
      seen[key(m.name)] = true;
    });
    add(5, "Merits and Flaws from the list, at a value they allow", mfBad.join(" "));
    if (info.thirteenth) add(5, "Thirteenth Generation without the Generation Background", info.genDots > 0 &&
      "The Thirteenth Generation Flaw cannot go with dots in the Generation Background: drop one or the other.");

    var tooHigh = [];
    ALL_ATTRS.forEach(function (k) { if (t.attributes[k] > info.traitMax) tooHigh.push(cap(k) + " " + t.attributes[k]); });
    ALL_ABILITIES.forEach(function (a) { if (t.abilities[a[0]] > info.traitMax) tooHigh.push(a[1] + " " + t.abilities[a[0]]); });
    Object.keys(t.disciplines).forEach(function (n) { if (t.disciplines[n] > info.traitMax) tooHigh.push(n + " " + t.disciplines[n]); });
    pair.forEach(function (k) { if (t.virtues[k] > 5) tooHigh.push(VIRTUES[k] + " " + t.virtues[k] + " (Virtues stop at 5)"); });
    if (info.roadRating > 10) tooHigh.push("Road " + info.roadRating + " (the Road stops at 10)");
    if (info.willpower > 10) tooHigh.push("Willpower " + info.willpower + " (Willpower stops at 10)");
    add(5, "Nothing above its maximum (" + info.traitMax + " at " + maxName + ")", tooHigh.length &&
      "Too high: " + tooHigh.join(", ") + ". At " + maxName + " no Attribute, Ability or Discipline goes above " + info.traitMax + ".");

    var unknownD = Object.keys(t.disciplines).filter(function (n) { return !findByName(RULES.disciplines, n); });
    if (unknownD.length) add(5, "Disciplines from the list", list(unknownD) + " is not a Discipline in these rules.");
    SORCERIES.forEach(function (s) {
      var r = info.rating[s], br = info.baseRating[s], g = info.granted[s];
      if (r > 0 && !br) add(5, "A primary Path of " + s, pathProblem(w.sorcery[s], s));
      var rits = w.free.rituals.filter(function (x) { return x.sorcery === s; });
      if (!g && !rits.length) return;
      var probs = [];
      if (!r) probs.push("Rituals of " + s + " need dots in " + s + ": remove them.");
      else if (rits.length < g) probs.push("The " + plural(g, "dot") + " of " + s + " bought with freebie points " + (g === 1 ? "brings " : "bring ") + plural(g, "more ritual") +
        ": add " + (g - rits.length) + " under Rituals.");
      probs = probs.concat(ritualProblems(rits, r, s));
      add(5, "Rituals of " + s + " gained or bought with freebie points", probs.join(" "));
    });
    if (w.free.paths.length) {
      var pp = [], seenP = {};
      w.free.paths.forEach(function (x) {
        var rule = pathRule(x.name);
        if (!trim(x.name)) { pp.push("Choose a Path for each secondary Path row, or remove it."); return; }
        if (!rule) { pp.push("“" + x.name + "” is not a Path in these rules."); return; }
        var r = info.rating[rule.sorcery];
        if (!r) pp.push(rule.name + " needs dots in " + rule.sorcery + ".");
        else if (same(w.sorcery[rule.sorcery], rule.name)) pp.push(rule.name + " is already your primary Path.");
        else if (x.dots > r) pp.push(rule.name + " has " + x.dots + " dots, above your " + rule.sorcery + " of " + r + ": a secondary Path never passes the primary.");
        if (x.dots < 1) pp.push(rule.name + " needs at least 1 dot, or remove it.");
        if (seenP[key(rule.name)]) pp.push(rule.name + " is taken twice.");
        seenP[key(rule.name)] = true;
      });
      add(5, "Secondary Paths: no higher than the primary Path", pp.join(" "));
    }
    Object.keys(t.disciplines).forEach(function (n) {
      if (!inList(cd, n)) note(5, n + " is not a Discipline of your clan: the Storyteller must agree (it usually needs a teacher).");
    });
    if (w.merits.length) note(5, "Merits and Flaws are taken at the Storyteller’s discretion.");

    /* 7. Blood */
    add(6, "Starting blood rolled", !w.blood && "Roll your starting blood.");

    /* The saved sheet against its record (the Storyteller's review). */
    if (stored) {
      add(REVIEW, "The creation record is kept with the draft", !(stored.data && stored.data._creation) &&
        "This draft has no creation record, so its choices cannot be checked here.");
      var diffs = sheetDiffs(stored, buildSheet(d, p, w));
      add(REVIEW, "The sheet matches the choices recorded step by step", diffs.length &&
        "The saved sheet differs from its creation record in: " + diffs.join(", ") + ". It may have been changed outside this page.");
    }
    return L;
  }

  function pathProblem(name, s) {
    if (!trim(name)) return "Choose a primary Path of " + s + ".";
    var r = pathRule(name);
    if (!r) return "“" + name + "” is not a Path in these rules.";
    if (r.sorcery !== s) return r.name + " is a Path of " + r.sorcery + ", not of " + s + ".";
    return "";
  }
  function ritualProblems(rits, rating, s) {
    var out = [];
    if (rits.some(function (r) { return !trim(r.name); })) out.push("Give every ritual of " + s + " a name.");
    rits.forEach(function (r) {
      if (trim(r.name) && rating && r.level > rating) out.push("“" + trim(r.name) + "” is level " + r.level + ", above your " + s + " of " + rating + ".");
    });
    return out;
  }
  var COMPARE = ["name", "nature", "demeanor", "concept", "clan", "generation", "sire", "road", "roadRating", "willpower",
    "attributes", "abilities", "virtues", "disciplines", "paths", "rituals", "backgrounds", "expertise", "meritsFlaws", "extraHealth"];
  var DIFF_NAMES = { roadRating: "Road rating", meritsFlaws: "Merits and Flaws", extraHealth: "extra health levels", expertise: "fields of expertise" };
  function sheetDiffs(stored, built) {
    var sd = stored.data || {}, out = [];
    COMPARE.forEach(function (k) {
      var a = sd[k], b = built.data[k];
      if (typeof b === "string") { a = trim(a); }
      if (canon(a) !== canon(b)) out.push(DIFF_NAMES[k] || k);
    });
    if (int((stored.play || {}).blood, -1, -1, 99) !== built.play.blood) out.push("starting blood");
    return out;
  }

  function problemsFor(L, step) { return L.filter(function (x) { return x.step === step && !x.ok; }); }
  function firstBadStep(L) {
    for (var i = 0; i < REVIEW; i++) if (problemsFor(L, i).length) return i;
    return REVIEW;
  }

  /* ------------------------------------------------------------ boot */
  // The world's options may limit the clans ({"clans": [...]}); a world
  // that cannot be read, or names none, allows every clan.
  async function loadWorldOptions() {
    try {
      if (!WORLD || !window.ChronicleContent) return;
      var w = await window.ChronicleContent.world(WORLD);
      var list = w && w.options && w.options.clans;
      if (Array.isArray(list) && list.length) {
        ALLOWED_CLANS = {};
        list.forEach(function (n) { ALLOWED_CLANS[String(n).toLowerCase()] = true; });
      }
    } catch (e) { console.warn("The world's options could not be read; offering every clan.", e); }
  }

  window.Gate.ready.then(async function (g) {
    S.db = g.db; S.role = g.role; S.email = String(g.email || "").toLowerCase();
    await loadWorldOptions();
    var q = new URLSearchParams(window.location.search);
    if (q.get("review")) return openReview(q.get("review"));
    if (q.get("draft")) return openDraft(q.get("draft"));
    if (q.has("new")) return openNew();
    return showList();
  });

  function root() { return $("create"); }
  function isST() { return S.role === "storyteller"; }
  function mine(row) { return String(row.email || "").toLowerCase() === S.email; }
  function link(q) { return PAGE + (q ? "?" + q : ""); }

  /* ------------------------------------------------------- the list */
  async function showList() {
    S.mode = "list";
    setStatus("Opening your drafts…");
    var rows;
    try {
      var r = await S.db.from("character_drafts")
        .select("id,chronicle,email,name,status,note,sheet_slug,created_at,updated_at,submitted_at,decided_at")
        .eq("chronicle", CHRONICLE).order("updated_at", { ascending: false });
      if (r.error) throw r.error;
      rows = r.data || [];
    } catch (e) {
      console.error(e);
      setStatus("");
      root().innerHTML = '<div class="sheet-notice">Your drafts could not be reached just now (' + esc(errText(e)) + "). Try again in a moment.</div>";
      return;
    }
    setStatus(isST() ? "Storyteller: you see every draft in the chronicle." : "");
    var own = rows.filter(mine), others = rows.filter(function (x) { return !mine(x); });
    var h = '<section class="create-panel" aria-labelledby="ownTitle"><h2 id="ownTitle">Your characters</h2>' +
      "<p>Each Cainite is built in nine short steps and saved as a draft as you go. When every rule is met, send it to the Storyteller, who approves it (it then becomes your character sheet) or sends it back with a note. " +
      rulesLink("concepts/character-creation", "The rules for character creation") + " are in the members’ rules.</p>";
    if (!own.length) h += '<p class="empty-line">No characters yet.</p>';
    else h += '<ul class="draft-list">' + own.map(function (x) { return draftItem(x, true); }).join("") + "</ul>";
    h += '<p style="margin-top:1rem"><a class="btn" href="' + esc(link("new=1")) + '">Create a new Cainite</a></p></section>';

    if (isST()) {
      var waiting = others.filter(function (x) { return x.status === "submitted"; });
      var own2 = own.filter(function (x) { return x.status === "submitted"; });
      var queue = waiting.concat(own2);
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
    if (st === "approved" && x.sheet_slug) acts += '<a class="btn" href="sheet.html?c=' + esc(encodeURIComponent(x.sheet_slug)) + '">Open the sheet</a>';
    if (st !== "approved" && own) acts += '<button type="button" class="btn btn--ghost" data-act="delete" data-id="' + esc(x.id) + '">Delete</button>';
    var when = st === "submitted" ? "sent " + fmtDate(x.submitted_at || x.updated_at)
      : st === "approved" || st === "rejected" ? fmtDate(x.decided_at || x.updated_at) : "updated " + fmtDate(x.updated_at);
    return '<li><div class="who"><b>' + esc(x.name || "Unnamed") + '</b><span><span class="status status-' + esc(st) + '">' + esc(STATUS[st] || st) + "</span> · " + esc(when) + "</span>" +
      (x.note && (st === "rejected" || st === "approved") ? '<span class="note">' + (st === "rejected" ? "The Storyteller: " : "") + esc(x.note) + "</span>" : "") +
      '</div><div class="acts">' + acts + "</div></li>";
  }

  async function listAction(act, id) {
    var fn = act === "withdraw" ? "withdraw_draft" : "delete_draft";
    var ask = act === "withdraw"
      ? "Withdraw this character from the Storyteller? It goes back to being a draft you can change."
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
  function openNew() {
    S.mode = "edit"; S.row = null; S.id = null; S.status = "draft";
    S.d = { name: "", nature: "", demeanor: "", concept: "", clan: "", sire: "", road: "" };
    S.p = { apparentAge: "", embraced: "", appearance: "", history: "", goals: "" };
    S.w = blankWizard();
    setStatus("A new Cainite: nothing is saved until you move to the next step or press Save.");
    render();
  }

  async function fetchRow(id) {
    if (!/^\d{1,18}$/.test(String(id))) return null;
    var r = await S.db.from("character_drafts").select("*").eq("id", +id).maybeSingle();
    if (r.error) throw r.error;
    return r.data && r.data.chronicle === CHRONICLE ? r.data : null;
  }

  function loadRow(row) {
    var data = obj(row.data), play = obj(row.play);
    S.row = row; S.id = row.id; S.status = row.status;
    S.d = {};
    ["name", "nature", "demeanor", "concept", "clan", "sire", "road"].forEach(function (k) { S.d[k] = str(data[k], 200); });
    if (!S.d.name) S.d.name = str(row.name, 200);
    S.p = {};
    ["apparentAge", "embraced", "appearance", "history", "goals"].forEach(function (k) { S.p[k] = str(play[k], 20000); });
    S.w = normW(data._creation);
  }

  async function openDraft(id) {
    setStatus("Opening the draft…");
    var row;
    try { row = await fetchRow(id); }
    catch (e) { console.error(e); setStatus(""); root().innerHTML = '<div class="sheet-notice">The draft could not be reached just now (' + esc(errText(e)) + ").</div>"; return; }
    if (!row) { setStatus(""); root().innerHTML = '<div class="sheet-notice">There is no draft at this address. <a href="' + esc(link("")) + '">Back to your characters</a>.</div>'; return; }
    if (!mine(row) || (row.status !== "draft" && row.status !== "rejected")) { window.location.replace(link("review=" + encodeURIComponent(row.id))); return; }
    loadRow(row);
    S.mode = "edit";
    setStatus(row.status === "rejected" ? "Sent back by the Storyteller: change what the note asks, then send it again." : "Saved drafts carry on where you left off.");
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
    setStatus(isST() ? "Storyteller review: every rule is checked again here." : "Read only.");
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
    var built = buildSheet(S.d, S.p, S.w);
    try {
      var r = await S.db.rpc("save_draft", {
        p_id: S.id, p_chronicle: CHRONICLE, p_name: built.data.name || "Unnamed Cainite",
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
    var built = buildSheet(S.d, S.p, S.w), L = checks(S.d, S.p, S.w), w = S.w, step = w.step;
    var reach = firstBadStep(L);
    var h = '<div class="sheet-bar"><a class="btn btn--ghost" href="' + esc(link("")) + '" data-act="leave">&larr; Your characters</a><span class="spacer"></span>' +
      '<button type="button" class="btn" data-act="save" data-f="save">Save</button></div>';
    if (S.status === "rejected" && S.row && S.row.note) {
      h += '<div class="sheet-notice rejected-note"><strong>Sent back by the Storyteller:</strong> ' + esc(S.row.note) + "</div>";
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
    var L = checks(S.d, S.p, S.w), probs = problemsFor(L, S.w.step), reach = firstBadStep(L);
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

  /* dots: set mode (the value itself) or freebie mode (dots above the base) */
  function dots(path, value, max, opt) {
    opt = opt || {};
    var base = opt.base, label = opt.label || "";
    var h = '<span class="dots' + (max > 5 ? " ten" : "") + '" role="group" aria-label="' + esc(label + ": " + value + " of " + max) + '">';
    for (var i = 1; i <= max; i++) {
      var cls = "dot" + (i <= value ? " on" : "") + (base != null && i <= value && i > base ? " fb" : "");
      var clickable = !opt.readonly && (base == null || i > base);
      h += clickable
        ? '<button type="button" class="' + cls + '" data-act="dot" data-path="' + esc(path) + '" data-n="' + i + '" data-val="' + value + '"' +
          (base != null ? ' data-base="' + base + '"' : "") + ' data-floor="' + (opt.floor || 0) + '" data-f="' + esc("dot:" + path + ":" + i) +
          '" aria-label="' + esc(label + " " + i) + '"></button>'
        : '<span class="' + cls + '"></span>';
    }
    return h + "</span>";
  }
  function traitRow(nameHtml, sub, dotsHtml) {
    return '<div class="trait"><span class="trait-name">' + nameHtml + (sub ? "<small>" + sub + "</small>" : "") +
      '</span><span class="trait-end">' + dotsHtml + "</span></div>";
  }
  function select(path, value, options, opt) {
    opt = opt || {};
    var known = options.some(function (o) { return (o.value != null ? o.value : o) === value; });
    var h = '<select data-bind="' + esc(path) + '" data-f="' + esc("sel:" + path) + '"' + (opt.id ? ' id="' + esc(opt.id) + '"' : "") +
      (opt.label ? ' aria-label="' + esc(opt.label) + '"' : "") + ">" +
      '<option value="">' + esc(opt.blank || "—") + "</option>";
    if (value && !known) h += '<option selected value="' + esc(value) + '">' + esc(value) + "</option>";
    var group = null;
    options.forEach(function (o) {
      var v = o.value != null ? o.value : o, t = o.text != null ? o.text : v;
      if (o.group && o.group !== group) { h += (group ? "</optgroup>" : "") + '<optgroup label="' + esc(o.group) + '">'; group = o.group; }
      h += "<option" + (v === value ? " selected" : "") + (o.disabled ? " disabled" : "") + ' value="' + esc(v) + '">' + esc(t) + "</option>";
    });
    return h + (group ? "</optgroup>" : "") + "</select>";
  }
  function input(path, value, opt) {
    opt = opt || {};
    return '<input data-bind="' + esc(path) + '" data-f="' + esc("in:" + path) + '" value="' + esc(value) + '"' +
      (opt.id ? ' id="' + esc(opt.id) + '"' : "") + (opt.label ? ' aria-label="' + esc(opt.label) + '"' : "") +
      ' maxlength="' + (opt.max || 80) + '"' + (opt.placeholder ? ' placeholder="' + esc(opt.placeholder) + '"' : "") + ">";
  }
  function textarea(path, value, rows, id, max) {
    return '<textarea data-bind="' + esc(path) + '" data-f="' + esc("ta:" + path) + '" id="' + esc(id) + '" rows="' + rows + '" maxlength="' + (max || 8000) + '">' + esc(value) + "</textarea>";
  }
  function counter(placed, allow, what) {
    var left = allow - placed;
    return '<small class="' + (left < 0 ? "over" : "") + '">' + (left === 0 ? "all " + allow + " placed" : left > 0 ? left + " of " + allow + " left" : (-left) + " too many") + (what ? " · " + what : "") + "</small>";
  }

  function stepBody(step, built, L) {
    var b = '<section class="page" aria-labelledby="stepTitle">' + '<h3 id="stepTitle" style="margin-top:0">' + (step + 1) + ". " + esc(STEPS[step]) + "</h3>";
    switch (step) {
      case 0: b += stepConcept(built); break;
      case 1: b += stepAttributes(built); break;
      case 2: b += stepAbilities(built); break;
      case 3: b += stepAdvantages(built); break;
      case 4: b += stepFinishing(built); break;
      case 5: b += stepFreebies(built); break;
      case 6: b += stepBlood(built); break;
      case 7: b += stepDetails(built); break;
      default: b = stepReview(built, L); return b;
    }
    return b + "</section>";
  }

  /* 1. Concept */
  function stepConcept(built) {
    var d = S.d, c = clanOf(d), road = roadOf(d);
    var clans = [];
    [["Clan", "Clans"], ["Bloodline", "Bloodlines"], ["Clanless", "Clanless"]].forEach(function (k) {
      RULES.clans.filter(function (x) {
        return x.kind === k[0] && (!ALLOWED_CLANS || ALLOWED_CLANS[String(x.name).toLowerCase()] || x.name === d.clan);
      }).forEach(function (x) { clans.push({ value: x.name, text: x.name, group: k[1] }); });
    });
    var arche = RULES.archetypes.map(function (a) { return { value: a, text: a }; });
    var h = '<p class="help">Start with a person: who they were in life, why their sire chose them, and how they spend their nights now. ' +
      "Then the clan, the Road they follow, and their Nature (who they truly are) and Demeanor (the face they show). " +
      rulesLink("concepts/character-creation", "Character creation in the rules") + ".</p>";
    h += '<div class="grid2">' +
      '<div><label class="lbl" for="fName">Name</label>' + input("d.name", d.name, { id: "fName", max: 80, placeholder: "e.g. Ilona the Grey" }) + "</div>" +
      '<div><label class="lbl" for="fConcept">Concept</label>' + input("d.concept", d.concept, { id: "fConcept", max: 120, placeholder: "e.g. exiled monk" }) + "</div>" +
      '<div><label class="lbl" for="fClan">Clan or bloodline</label>' + select("d.clan", d.clan, clans, { id: "fClan", blank: "Choose…" }) +
      (c ? '<p class="info">' + rulesLink(c.page, c.name) + " · " + esc(c.kind) + ". Disciplines: " +
        (isCaitiff(c) ? "any three, chosen with the Storyteller" : esc(c.disciplines.join(", ")) + (c.note ? ", " + esc(c.note) : "")) + ".</p>" : "") +
      (isCaitiff(c) ? '<p class="info"><strong>Caitiff need the Storyteller’s agreement.</strong></p>' : "") +
      (isNosferatu(d) ? '<p class="info">Nosferatu have Appearance 0, and can never raise it.</p>' : "") + "</div>" +
      '<div><label class="lbl" for="fRoad">Road</label>' + select("d.road", d.road, RULES.roads.map(function (r) { return { value: r.name, text: r.name }; }), { id: "fRoad", blank: "Choose…" }) +
      (road ? '<p class="info">' + rulesLink(road.page, road.name) + ": uses " + esc(road.virtues.join(" and ")) + ", with Courage. " +
        rulesLink("concepts/the-roads", "All the Roads") + ".</p>" : '<p class="info">' + rulesLink("concepts/the-roads", "Read about the Roads") + ".</p>") + "</div>" +
      '<div><label class="lbl" for="fNature">Nature</label>' + select("d.nature", d.nature, arche, { id: "fNature", blank: "Choose…" }) +
      '<p class="info">Acting on it regains Willpower. ' + rulesLink("concepts/archetypes", "The Archetypes") + ".</p></div>" +
      '<div><label class="lbl" for="fDemeanor">Demeanor</label>' + select("d.demeanor", d.demeanor, arche, { id: "fDemeanor", blank: "Choose…" }) + "</div>" +
      '<div><label class="lbl" for="fSire">Sire (optional)</label>' + input("d.sire", d.sire, { id: "fSire", max: 80 }) + "</div>" +
      '<div><span class="lbl">Generation</span><p class="info" style="margin-top:0">' + esc(genName(built.info.generation)) +
      ". Every Cainite starts at the Twelfth unless they take the Generation Background in step 4. " + rulesLink("concepts/generation", "Generation") + ".</p></div>" +
      "</div>";
    return h;
  }

  function priPickers(path, pri, names, dots, label) {
    var h = '<div class="pick">';
    RANKS.forEach(function (r, i) {
      h += '<div><label class="lbl" for="' + esc(path + i) + '">' + cap(r) + " (" + dots[i] + " dots)</label>" +
        select(path + "." + i, pri[i], names.map(function (n) { return { value: n, text: n }; }), { id: path + i, blank: "Choose…", label: label + " " + r }) + "</div>";
    });
    return h + "</div>";
  }

  /* 2. Attributes */
  function stepAttributes(built) {
    var w = S.w, nos = isNosferatu(S.d);
    var h = '<p class="help">Every Attribute has one dot to begin with. Rank Physical, Social and Mental, then place 7 more dots in the first, 5 in the second and 3 in the third. ' +
      "No Attribute goes above 5. " + rulesLink("concepts/attributes", "The Attributes") + ".</p>";
    h += priPickers("w.attrPri", w.attrPri, ["Physical", "Social", "Mental"], ATTR_DOTS, "Attributes");
    h += '<div class="cols3">';
    ATTRS.forEach(function (g) {
      var i = w.attrPri.indexOf(g[0]), placed = 0;
      g[1].forEach(function (k) { placed += w.base.attributes[k] - (nos && k === "appearance" ? 0 : 1); });
      h += "<div><h4>" + g[0] + (i >= 0 ? counter(placed, ATTR_DOTS[i], RANKS[i]) : "<small>rank it above</small>") + "</h4>";
      g[1].forEach(function (k) {
        var floor = nos && k === "appearance" ? 0 : 1;
        h += traitRow(esc(cap(k)), floor === 0 ? "Nosferatu: stays at 0" : "", dots("w.base.attributes." + k, w.base.attributes[k], 5, { floor: floor, label: cap(k) }));
      });
      h += "</div>";
    });
    return h + "</div>";
  }

  /* 3. Abilities */
  function stepAbilities(built) {
    var w = S.w;
    var h = '<p class="help">Rank Talents, Skills and Knowledges, then place 13 dots in the first, 9 in the second and 5 in the third. ' +
      "No Ability may have more than 3 dots at this stage; freebie points can raise it later. " +
      "Academics, Commerce, Crafts and Performance each need a field of expertise, such as Crafts (smithing). " + rulesLink("concepts/abilities", "The Abilities") + ".</p>";
    h += priPickers("w.abilPri", w.abilPri, ["Talents", "Skills", "Knowledges"], ABIL_DOTS, "Abilities");
    h += '<div class="cols3">';
    ABILITIES.forEach(function (g) {
      var i = w.abilPri.indexOf(g[0]), placed = 0;
      g[1].forEach(function (a) { placed += w.base.abilities[a[0]]; });
      h += "<div><h4>" + g[0] + (i >= 0 ? counter(placed, ABIL_DOTS[i], RANKS[i]) : "<small>rank it above</small>") + "</h4>";
      g[1].forEach(function (a) {
        var v = w.base.abilities[a[0]];
        h += traitRow(esc(a[1]), v > 3 ? '<span style="color:var(--hunter)">more than 3</span>' : "", dots("w.base.abilities." + a[0], v, 5, { label: a[1] }));
        if (EXPERTISE.indexOf(a[0]) >= 0 && built.info.t.abilities[a[0]] > 0) {
          h += '<div style="margin:0 0 .4rem 1rem">' + input("w.expertise." + a[0], w.expertise[a[0]], { label: "Field of expertise for " + a[1], max: 60, placeholder: "Field, e.g. " + EXPERTISE_EG[a[0]] }) + "</div>";
        }
      });
      h += "</div>";
    });
    return h + "</div>";
  }

  /* 4. Advantages */
  function stepAdvantages(built) {
    var w = S.w, d = S.d, c = clanOf(d), info = built.info, cd = info.clanDiscs;
    var h = '<p class="help">Place 4 dots among your clan’s three Disciplines, 5 dots among the Backgrounds, and 7 dots among your Road’s two Virtues and Courage (each Virtue starts with 1). ' +
      "Each dot of Generation takes you one step closer to Caine, from the Twelfth. " +
      rulesLink("concepts/disciplines", "Disciplines") + " · " + rulesLink("concepts/backgrounds", "Backgrounds") + " · " + rulesLink("concepts/virtues-and-willpower", "Virtues") + ".</p>";
    h += '<div class="adv3">';

    /* Disciplines */
    var bdTotal = sum(w.base.disciplines);
    h += "<div><h4>Disciplines" + counter(bdTotal, DISC_DOTS) + "</h4>";
    var slots = pickSlots(c), fixed = c && !isCaitiff(c) ? c.disciplines : [];
    fixed.forEach(function (n) { h += discRow(n, true); });
    for (var i = 0; i < slots; i++) {
      var pick = w.picks[i];
      var opts = RULES.disciplines.filter(function (x) {
        return (!inList(fixed, x.name) && !w.picks.slice(0, slots).some(function (p, j) { return j !== i && same(p, x.name); })) || same(x.name, pick);
      }).map(function (x) { return { value: x.name, text: x.name }; });
      h += '<div style="margin:.2rem 0">' + select("w.picks." + i, pick, opts, { blank: isCaitiff(c) ? "Choose a Discipline…" : "Original clan’s Discipline…", label: "Chosen Discipline " + (i + 1) }) + "</div>";
      if (pick) h += discRow(pick, true);
    }
    if (slots) h += '<p class="tracker-note">' + (isCaitiff(c) ? "Caitiff choose up to three Disciplines, with the Storyteller’s agreement." : esc(c.name) + " name up to two Disciplines of their original clan; the Storyteller confirms them.") + "</p>";
    Object.keys(w.base.disciplines).filter(function (n) { return !inList(cd, n); }).forEach(function (n) { h += discRow(n, false); });
    if (!c) h += '<p class="empty-line">Choose a clan in step 1.</p>';
    h += "</div>";

    /* Backgrounds */
    var bbTotal = sum(w.base.backgrounds);
    h += "<div><h4>Backgrounds" + counter(bbTotal, BG_DOTS) + "</h4>";
    RULES.backgrounds.forEach(function (n) {
      var v = w.base.backgrounds[n] || 0, sub = "";
      if (n === "Generation") sub = esc(genName(info.generation));
      if (n === "Status" && isCaitiff(c)) sub = "not for Caitiff";
      h += traitRow(esc(n), sub, dots("w.base.backgrounds." + n, v, 5, { label: n }));
    });
    h += "</div>";

    /* Virtues */
    var pair = info.pair, vExtra = 0;
    pair.forEach(function (k) { vExtra += w.base.virtues[k] - 1; });
    h += "<div><h4>Virtues" + counter(vExtra, VIRTUE_DOTS) + "</h4>";
    pair.forEach(function (k) { h += traitRow(esc(VIRTUES[k]), "", dots("w.base.virtues." + k, w.base.virtues[k], 5, { floor: 1, label: VIRTUES[k] })); });
    h += '<p class="tracker-note">Set by the ' + esc(roadOf(d) ? roadOf(d).name : "Road") + ". Road " + info.roadBase + ", Willpower " + info.willBase + ".</p></div>";
    h += "</div>";

    /* Blood sorcery */
    SORCERIES.forEach(function (s) {
      var br = info.baseRating[s], rits = w.base.rituals;
      var mineR = rits.map(function (r, i) { return [r, i]; }).filter(function (x) { return x[0].sorcery === s; });
      if (!br && !mineR.length) return;
      h += "<h3>" + esc(s) + "</h3><p class=\"help\">Your " + esc(s) + " of " + br + " gives you a primary Path at the same rating and " +
        plural(br, "ritual") + " of level " + br + " or lower, one per dot. Type the ritual’s name as the rules give it. " +
        rulesLink("disciplines/" + s.toLowerCase(), s + " in the rules") + ".</p>";
      if (br) {
        h += '<div class="grid2"><div><label class="lbl" for="prim' + s + '">Primary Path (rating ' + br + ")</label>" +
          select("w.sorcery." + s, w.sorcery[s], RULES.paths.filter(function (p) { return p.sorcery === s; }).map(function (p) { return { value: p.name, text: p.name }; }), { id: "prim" + s, blank: "Choose a Path…" }) +
          (pathRule(w.sorcery[s]) ? '<p class="info">' + rulesLink(pathRule(w.sorcery[s]).page, "About " + w.sorcery[s]) + "</p>" : "") + "</div><div></div></div>";
      }
      h += '<h4 style="text-align:left;margin-top:.8rem">Rituals <small style="display:inline">' + mineR.length + " of " + br + "</small></h4>";
      h += ritualRows("base", mineR, Math.max(br, 1));
      if (mineR.length < br) h += '<p><button type="button" class="mini" data-act="add-ritual" data-list="base" data-sorcery="' + esc(s) + '" data-f="addrit-base-' + esc(s) + '">+ Ritual</button></p>';
    });
    return h;
  }
  function discRow(n, isClan) {
    var w = S.w, rule = findByName(RULES.disciplines, n), v = w.base.disciplines[n] || 0;
    return traitRow((rule ? rulesLink(rule.page, n) : esc(n)) + (isClan ? '<span class="clan-mark" title="Clan Discipline">◆</span>' : ""),
      isClan ? "" : '<span style="color:var(--hunter)">not of your clan</span>', dots("w.base.disciplines." + n, v, 5, { label: n }));
  }
  function ritualRows(listName, items, maxLevel) {
    var h = '<div class="edit-list">';
    items.forEach(function (x) {
      var r = x[0], i = x[1], path = "w." + listName + ".rituals." + i;
      var levels = [];
      for (var l = 1; l <= Math.max(maxLevel, r.level); l++) levels.push({ value: String(l), text: "Level " + l });
      h += '<div class="row">' + input(path + ".name", r.name, { label: "Ritual name", max: 80, placeholder: "Ritual name" }) +
        '<select data-bind="' + esc(path + ".level") + '" data-num data-f="' + esc("sel:" + path + ".level") + '" aria-label="Ritual level" style="flex:0 0 6.5rem">' +
        levels.map(function (o) { return "<option" + (+o.value === r.level ? " selected" : "") + ' value="' + o.value + '">' + o.text + "</option>"; }).join("") + "</select>" +
        '<button type="button" class="mini" data-act="del-row" data-list="' + esc("w." + listName + ".rituals") + '" data-i="' + i + '" aria-label="Remove this ritual">✕</button></div>';
    });
    return h + "</div>";
  }

  /* 5. Finishing touches */
  function stepFinishing(built) {
    var info = built.info, d = S.d, pair = info.pair, t = info.t;
    var road = roadOf(d);
    var h = '<p class="help">These follow from what you have chosen, and change by themselves if you go back. ' +
      "Freebie points in the next step can raise the Virtues (which raises the Road or Willpower with them), or the Road and Willpower directly. " +
      rulesLink("concepts/blood-pool-and-health", "Blood pool and health") + ".</p>";
    h += '<div class="derived">' +
      "<div><b>" + (road ? rulesLink(road.page, road.name) : "Road") + '</b><span class="big">' + info.roadBase + "</span>" +
      '<span class="tracker-note">' + esc(VIRTUES[pair[0]]) + " " + t.virtues[pair[0]] + " + " + esc(VIRTUES[pair[1]]) + " " + t.virtues[pair[1]] + " = " + info.roadBase + ". " + auraNote(info.roadBase) + ".</span></div>" +
      '<div><b>Willpower</b><span class="big">' + info.willBase + '</span><span class="tracker-note">Equal to Courage (' + t.virtues.courage + ").</span></div>" +
      "<div><b>" + rulesLink("concepts/generation", "Generation") + '</b><span class="big">' + esc(GEN_NAMES[info.generation - 3]) + "</span>" +
      '<span class="tracker-note">' + (info.thirteenth ? "The Thirteenth Generation Flaw" : info.genDots ? plural(info.genDots, "dot") + " of the Generation Background" : "No Generation Background") +
      ". Traits can reach " + info.traitMax + ".</span></div>" +
      '<div><b>Blood pool</b><span class="big">' + info.pool + '</span><span class="tracker-note">At most ' + info.pool + " blood, " + info.perTurn + " a turn. Your starting blood is rolled in step 7.</span></div>" +
      "</div>";
    return h;
  }

  /* 6. Freebie points */
  function stepFreebies(built) {
    var w = S.w, info = built.info, t = info.t, max = info.traitMax, c = clanOf(S.d), nos = isNosferatu(S.d);
    var h = '<p class="help">You have 15 freebie points. A dot costs: Attribute 5, Ability 2, Discipline 7, secondary Path 4, Background 1, Virtue 2, Road 2, Willpower 1; a Ritual costs its level. ' +
      "Merits cost their points; Flaws give their points back as extra freebie points (at most 7 points of each). " +
      "The red dots are the ones bought here; click the last red dot to give it back. Spend every point before moving on. " +
      rulesLink("concepts/character-creation", "Freebie points") + " · " + rulesLink("concepts/merits-and-flaws", "Merits and Flaws") + ".</p>";
    h += '<div class="freebie-sum' + (info.left < 0 ? " over" : "") + '" aria-live="polite"><span class="left">' +
      (info.left === 0 ? "All freebie points spent" : info.left > 0 ? plural(info.left, "freebie point") + " left" : plural(-info.left, "point") + " overspent") +
      "</span><small>" + esc(info.arith) + "</small></div>";

    function sub(n, cost) { return n ? "+" + n + " · " + (n * cost) + " pts" : ""; }

    h += "<h3>Attributes <small style=\"font-size:.8rem;text-transform:none\">5 per dot</small></h3><div class=\"cols3\">";
    ATTRS.forEach(function (g) {
      h += "<div><h4>" + g[0] + "</h4>";
      g[1].forEach(function (k) {
        var b = w.base.attributes[k], fr = w.free.attributes[k];
        var ro = nos && k === "appearance";
        h += traitRow(esc(cap(k)), ro ? "Nosferatu: stays at 0" : sub(fr, COST.attribute), dots("w.free.attributes." + k, b + fr, max, { base: b, label: cap(k), readonly: ro && !fr }));
      });
      h += "</div>";
    });
    h += "</div>";

    h += "<h3>Abilities <small style=\"font-size:.8rem;text-transform:none\">2 per dot</small></h3><div class=\"cols3\">";
    ABILITIES.forEach(function (g) {
      h += "<div><h4>" + g[0] + "</h4>";
      g[1].forEach(function (a) {
        var b = w.base.abilities[a[0]], fr = w.free.abilities[a[0]];
        h += traitRow(esc(a[1]), sub(fr, COST.ability), dots("w.free.abilities." + a[0], b + fr, max, { base: b, label: a[1] }));
        if (EXPERTISE.indexOf(a[0]) >= 0 && t.abilities[a[0]] > 0 && !b) {
          h += '<div style="margin:0 0 .4rem 1rem">' + input("w.expertise." + a[0], w.expertise[a[0]], { label: "Field of expertise for " + a[1], max: 60, placeholder: "Field, e.g. " + EXPERTISE_EG[a[0]] }) + "</div>";
        }
      });
      h += "</div>";
    });
    h += "</div>";

    h += '<h3>Advantages</h3><div class="adv3">';
    h += "<div><h4>Disciplines<small>7 per dot</small></h4>";
    var cd = info.clanDiscs, shown = [];
    cd.forEach(function (n) { shown.push(n); });
    Object.keys(w.free.disciplines).concat(Object.keys(w.base.disciplines)).forEach(function (n) { if (!inList(shown, n)) shown.push(n); });
    shown.forEach(function (n) {
      var b = w.base.disciplines[n] || 0, fr = w.free.disciplines[n] || 0, rule = findByName(RULES.disciplines, n), isClan = inList(cd, n);
      h += traitRow((rule ? rulesLink(rule.page, n) : esc(n)) + (isClan ? '<span class="clan-mark" title="Clan Discipline">◆</span>' : ""),
        (isClan ? "" : "not of your clan; with the Storyteller" + (fr ? " · " : "")) + sub(fr, COST.discipline),
        dots("w.free.disciplines." + n, b + fr, max, { base: b, label: n }));
    });
    var others = RULES.disciplines.filter(function (x) { return !inList(shown, x.name); }).map(function (x) { return { value: x.name, text: x.name }; });
    h += '<div style="margin-top:.4rem"><label class="lbl" for="addDisc" style="font-size:.78rem">Another Discipline (7 points, with the Storyteller)</label>' +
      '<select id="addDisc" data-act-change="add-disc" data-f="addDisc"><option value="">Add one…</option>' +
      others.map(function (o) { return '<option value="' + esc(o.value) + '">' + esc(o.text) + "</option>"; }).join("") + "</select></div>";
    h += "</div>";

    h += "<div><h4>Backgrounds<small>1 per dot</small></h4>";
    RULES.backgrounds.forEach(function (n) {
      var b = w.base.backgrounds[n] || 0, fr = w.free.backgrounds[n] || 0;
      var note = n === "Generation" ? esc(genName(info.generation)) + (fr ? " · " : "") : n === "Status" && isCaitiff(c) ? "not for Caitiff" : "";
      h += traitRow(esc(n), note + sub(fr, COST.background), dots("w.free.backgrounds." + n, b + fr, 5, { base: b, label: n }));
    });
    h += "</div>";

    h += "<div><h4>Virtues<small>2 per dot</small></h4>";
    info.pair.forEach(function (k) {
      var b = w.base.virtues[k], fr = w.free.virtues[k];
      h += traitRow(esc(VIRTUES[k]), sub(fr, COST.virtue), dots("w.free.virtues." + k, b + fr, 5, { base: b, label: VIRTUES[k] }));
    });
    h += '<p class="tracker-note">At creation, a Virtue bought here raises the Road or Willpower with it.</p>';
    h += '<div class="block" style="margin-top:.8rem"><h4>Road<small>2 per dot · ' + info.roadBase + " from the Virtues</small></h4>" +
      dots("w.free.road", info.roadRating, 10, { base: info.roadBase, label: "Road" }) +
      (w.free.road ? '<span class="tracker-note">' + sub(w.free.road, COST.road) + "</span>" : "") + "</div>";
    h += '<div class="block" style="margin-top:.6rem"><h4>Willpower<small>1 per dot · ' + info.willBase + " from Courage</small></h4>" +
      dots("w.free.willpower", info.willpower, 10, { base: info.willBase, label: "Willpower" }) +
      (w.free.willpower ? '<span class="tracker-note">' + sub(w.free.willpower, COST.willpower) + "</span>" : "") + "</div>";
    h += "</div></div>";

    /* Blood sorcery bought with freebies */
    SORCERIES.forEach(function (s) {
      var r = info.rating[s], br = info.baseRating[s], g = info.granted[s];
      var rits = w.free.rituals.map(function (x, i) { return [x, i]; }).filter(function (x) { return x[0].sorcery === s; });
      var paths = w.free.paths.map(function (x, i) { return [x, i]; }).filter(function (x) { var pr = pathRule(x[0].name); return (pr ? pr.sorcery : x[0].sorcery) === s; });
      if (!r && !rits.length && !paths.length) return;
      h += "<h3>" + esc(s) + " <small style=\"font-size:.8rem;text-transform:none\">rating " + r + "</small></h3>";
      if (r && !br) {
        h += '<div class="grid2"><div><label class="lbl" for="primF' + s + '">Primary Path (rating ' + r + ")</label>" +
          select("w.sorcery." + s, w.sorcery[s], RULES.paths.filter(function (p) { return p.sorcery === s; }).map(function (p) { return { value: p.name, text: p.name }; }), { id: "primF" + s, blank: "Choose a Path…" }) + "</div><div></div></div>";
      } else if (r) {
        h += '<p class="help">Primary Path: ' + esc(w.sorcery[s] || "not chosen yet (step 4)") + ", rating " + r + ". It rises with the Discipline at no extra cost.</p>";
      }
      h += '<h4 style="text-align:left">Secondary Paths <small style="display:inline">4 per dot, never above ' + r + "</small></h4>";
      h += '<div class="edit-list">';
      paths.forEach(function (x) {
        var p = x[0], i = x[1];
        var opts = RULES.paths.filter(function (pp) { return pp.sorcery === s && !same(pp.name, w.sorcery[s]); }).map(function (pp) { return { value: pp.name, text: pp.name }; });
        h += '<div class="row">' + select("w.free.paths." + i + ".name", p.name, opts, { label: "Secondary Path", blank: "Choose a Path…" }) +
          dots("w.free.paths." + i + ".dots", p.dots, Math.max(r, p.dots, 1), { floor: 1, label: "Secondary Path" }) +
          '<span class="tracker-note" style="margin:0">' + (p.dots * COST.path) + " pts</span>" +
          '<button type="button" class="mini" data-act="del-row" data-list="w.free.paths" data-i="' + i + '" aria-label="Remove this Path">✕</button></div>';
      });
      h += "</div>";
      if (r) h += '<p><button type="button" class="mini" data-act="add-path" data-sorcery="' + esc(s) + '" data-f="addpath-' + esc(s) + '">+ Secondary Path</button></p>';
      h += '<h4 style="text-align:left">More rituals <small style="display:inline">' +
        (g ? plural(g, "ritual") + " free with the " + plural(g, "dot") + " bought here; others cost their level" : "each costs its level") + "</small></h4>";
      h += ritualRows("free", rits, Math.max(r, 1));
      if (r) h += '<p><button type="button" class="mini" data-act="add-ritual" data-list="free" data-sorcery="' + esc(s) + '" data-f="addrit-free-' + esc(s) + '">+ Ritual</button></p>';
    });

    /* Merits and Flaws */
    h += "<h3>Merits and Flaws <small style=\"font-size:.8rem;text-transform:none\">optional · Merits " + info.merits + " of 7 · Flaws " + info.flaws + " of 7</small></h3>";
    h += '<div class="edit-list">';
    w.merits.forEach(function (m, i) {
      var r = findByName(RULES.merits, m.name), opts = costOptions(r ? r.cost : m.points), cn = r ? costNote(r.cost) : "";
      h += '<div class="row"><span style="flex:1;min-width:9rem">' + rulesLink("concepts/merits-and-flaws", m.name) +
        ' <small style="color:var(--paper-soft)">' + esc(m.kind + (r ? " · " + r.group : "") + (cn ? " · " + cn : "")) + "</small></span>" +
        (opts.length > 1
          ? '<select data-bind="w.merits.' + i + '.points" data-num data-f="sel:w.merits.' + i + '.points" aria-label="Points" style="flex:0 0 6rem">' +
            opts.map(function (o) { return "<option" + (o === m.points ? " selected" : "") + ' value="' + o + '">' + plural(o, "point") + "</option>"; }).join("") + "</select>"
          : '<span class="pts" style="font-family:var(--sheet-head)">' + plural(m.points, "point") + "</span>") +
        '<button type="button" class="mini" data-act="del-row" data-list="w.merits" data-i="' + i + '" aria-label="Remove ' + esc(m.name) + '">✕</button></div>';
    });
    h += "</div>";
    var groups = [];
    ["Merit", "Flaw"].forEach(function (type) {
      ["Physical", "Mental", "Social", "Aura", "Supernatural"].forEach(function (grp) {
        RULES.merits.filter(function (m) { return m.type === type && m.group === grp; }).forEach(function (m) {
          groups.push({ value: m.name, text: m.name + " (" + m.cost + ")", group: type + "s · " + grp, disabled: w.merits.some(function (x) { return same(x.name, m.name); }) });
        });
      });
    });
    var group = null, sel = '<select id="addMerit" data-act-change="add-merit" data-f="addMerit"><option value="">Add a Merit or Flaw…</option>';
    groups.forEach(function (o) {
      if (o.group !== group) { sel += (group ? "</optgroup>" : "") + '<optgroup label="' + esc(o.group) + '">'; group = o.group; }
      sel += "<option" + (o.disabled ? " disabled" : "") + ' value="' + esc(o.value) + '">' + esc(o.text) + "</option>";
    });
    sel += (group ? "</optgroup>" : "") + "</select>";
    h += '<div style="max-width:28rem"><label class="lbl" for="addMerit">Add a Merit or Flaw</label>' + sel + "</div>";
    return h;
  }

  /* 7. Blood */
  function stepBlood(built) {
    var info = built.info, t = info.t, b = info.blood;
    var dom = t.backgrounds.Domain || 0, herd = t.backgrounds.Herd || 0;
    var h = '<p class="help">Your starting blood is rolled: one ten-sided die, plus your dots of Domain and Herd, and never more than your blood pool of ' + info.pool + ". " +
      "You roll once; the Storyteller sees the roll. " + rulesLink("concepts/blood-pool-and-health", "Blood pool") + ".</p>";
    h += '<div class="roll-box">';
    if (!b) {
      h += "<p>One die + Domain " + dom + " + Herd " + herd + ", at most " + info.pool + ".</p>" +
        '<button type="button" class="btn" data-act="roll" data-f="roll">Roll starting blood</button>';
    } else {
      h += '<span class="die" aria-label="The die shows ' + b.die + '">' + b.die + "</span>" +
        "<p>Die " + b.die + " + Domain " + b.domain + " + Herd " + b.herd + " = " + b.raw + (b.raw > b.cap ? ", capped at " + b.cap : "") +
        ": <strong>" + plural(b.result, "blood point") + "</strong> to begin with.</p>" +
        '<p class="info">Rolled ' + esc(fmtDateTime(b.rolledAt)) + ". If you change Domain or Herd, the result follows; the die stays.</p>" +
        bloodBoxes(info.pool, b.result);
    }
    return h + "</div>";
  }

  /* 8. Details */
  function stepDetails(built) {
    var p = S.p;
    return '<p class="help">All optional, and all can be changed on the sheet later: how old they look, when they were Embraced, what people see, the story so far, and what they want.</p>' +
      '<div class="grid2"><div><label class="lbl" for="fAge">Apparent age</label>' + input("p.apparentAge", p.apparentAge, { id: "fAge", max: 40, placeholder: "e.g. about thirty" }) + "</div>" +
      '<div><label class="lbl" for="fEmb">Embraced</label>' + input("p.embraced", p.embraced, { id: "fEmb", max: 60, placeholder: "e.g. 1214, at Pannonhalma" }) + "</div></div>" +
      '<label class="lbl" for="fApp" style="margin-top:.8rem">Appearance</label>' + textarea("p.appearance", p.appearance, 4, "fApp", 4000) +
      '<label class="lbl" for="fHist" style="margin-top:.8rem">History</label>' + textarea("p.history", p.history, 8, "fHist", 20000) +
      '<label class="lbl" for="fGoals" style="margin-top:.8rem">Goals</label>' + textarea("p.goals", p.goals, 4, "fGoals", 4000);
  }

  /* 9. Review (in the editor) */
  function stepReview(built, L) {
    var ok = L.every(function (x) { return x.ok; });
    var h = '<section class="create-panel" aria-labelledby="stepTitle"><h2 id="stepTitle">9. Review</h2>' +
      "<p>This is the sheet as it will be. Every rule is listed below; when all are ticked, send it to the Storyteller. " +
      "Notes marked ! are for the Storyteller to agree, and do not stop you.</p>" +
      checklistHtml(L) + freebieTable(built.info, S.w) +
      '<p style="margin-top:1rem"><button type="button" class="btn" data-act="submit" data-f="submit"' + (ok ? "" : " disabled") + ">Send to the Storyteller</button> " +
      (ok ? "" : '<span class="xp-hint">Fix the points marked ✗ first.</span>') + "</p></section>";
    h += sheetPage1(built.data, built.play) + sheetPage2(built.data, built.play);
    return h;
  }

  function checklistHtml(L) {
    var h = "";
    STEPS.forEach(function (name, i) {
      var items = L.filter(function (x) { return x.step === i; });
      if (!items.length) return;
      h += "<h3>" + (i + 1) + ". " + esc(name) + '</h3><ul class="checklist">' + items.map(function (x) {
        return '<li class="' + (x.flag ? "flag" : x.ok ? "ok" : "bad") + '">' + (x.flag ? "<em>Note for the Storyteller:</em> " : "") + esc(x.label) +
          (x.problem ? '<span class="why">' + esc(x.problem) + "</span>" : "") + "</li>";
      }).join("") + "</ul>";
    });
    return h;
  }

  function freebieTable(info, w) {
    var rows = [];
    function add(what, n, cost) { if (n) rows.push([what + " +" + n, n * cost]); }
    ALL_ATTRS.forEach(function (k) { add(cap(k), w.free.attributes[k], COST.attribute); });
    ALL_ABILITIES.forEach(function (a) { add(a[1], w.free.abilities[a[0]], COST.ability); });
    Object.keys(w.free.disciplines).forEach(function (n) { add(n, w.free.disciplines[n], COST.discipline); });
    w.free.paths.forEach(function (p) { add((p.name || "Path") + " (secondary Path)", p.dots, COST.path); });
    Object.keys(w.free.backgrounds).forEach(function (n) { add(n, w.free.backgrounds[n], COST.background); });
    info.pair.forEach(function (k) { add(VIRTUES[k], w.free.virtues[k], COST.virtue); });
    add("Road", w.free.road, COST.road);
    add("Willpower", w.free.willpower, COST.willpower);
    if (info.spent.rituals || w.free.rituals.length) rows.push(["Rituals: " + w.free.rituals.map(function (r) { return (r.name || "unnamed") + " (" + r.level + ")"; }).join(", "), info.spent.rituals]);
    w.merits.forEach(function (m) { rows.push([m.kind + ": " + m.name, m.kind === "Flaw" ? -m.points : m.points]); });
    var h = '<h3 style="font-family:var(--font-display);font-size:.85rem;letter-spacing:.08em;margin:1.2rem 0 .3rem;color:var(--ink-soft)">Freebie points</h3>';
    if (!rows.length) return h + '<p class="empty-line">Nothing bought with freebie points.</p>';
    return h + '<table class="xp-table buy-table"><tr><th>Bought</th><th>Points</th></tr>' +
      rows.map(function (r) { return "<tr><td>" + esc(r[0]) + "</td><td>" + (r[1] < 0 ? "−" + (-r[1]) + " (Flaw)" : r[1]) + "</td></tr>"; }).join("") +
      "<tr><td><strong>Left</strong> (" + esc(info.arith) + ")</td><td><strong>" + info.left + "</strong></td></tr></table>";
  }

  /* ------------------------------------------- the sheet, read only */
  function rdots(level, max) {
    var h = '<span class="dots' + (max > 5 ? " ten" : "") + '" role="img" aria-label="' + level + " of " + max + '">';
    for (var i = 1; i <= max; i++) h += '<span class="dot' + (i <= level ? " on" : "") + '"></span>';
    return h + "</span>";
  }
  function rtrait(nameHtml, sub, level, max) {
    return '<div class="trait"><span class="trait-name">' + nameHtml + (sub ? "<small>" + esc(sub) + "</small>" : "") + '</span><span class="trait-end">' + rdots(level, max) + "</span></div>";
  }
  function rfield(name, v, page) { return '<div class="field"><b>' + esc(name) + '</b><span class="val">' + (page ? rulesLink(page, v) : esc(v)) + "</span></div>"; }

  function sheetPage1(d, p) {
    d = obj(d); p = obj(p);
    var attrs = obj(d.attributes), abil = obj(d.abilities), virt = obj(d.virtues);
    var gen = int(d.generation, 12, 3, 13), g = genRow(gen), max = Math.max(5, g.maxTrait || 5);
    var clan = findByName(RULES.clans, d.clan), road = findByName(RULES.roads, d.road);
    var h = '<section class="page" aria-label="Character sheet, page one">';
    h += '<div class="sheet-head"><div class="sheet-band"><strong>Vampire</strong><span>The Dark Ages</span></div><div class="sheet-ident">' +
      rfield("Name", d.name) + rfield("Nature", d.nature) + rfield("Clan", d.clan, clan && clan.page) +
      rfield("Concept", d.concept) + rfield("Demeanor", d.demeanor) + rfield("Generation", genName(gen), "concepts/generation") +
      rfield("Sire", d.sire) + rfield("Road", d.road, road && road.page) + rfield("Haven", d.haven) + "</div></div>";
    h += '<h3>Attributes</h3><div class="cols3">';
    ATTRS.forEach(function (gr) {
      h += "<div><h4>" + gr[0] + "</h4>";
      gr[1].forEach(function (k) { h += rtrait(esc(cap(k)), "", int(attrs[k], 0, 0, 10), max); });
      h += "</div>";
    });
    h += '</div><h3>Abilities</h3><div class="cols3">';
    var ex = Array.isArray(d.expertise) ? d.expertise : [];
    ABILITIES.forEach(function (gr) {
      h += "<div><h4>" + gr[0] + "</h4>";
      gr[1].forEach(function (a) {
        var fields = ex.filter(function (x) { return x && x.ability === a[0]; }).map(function (x) { return str(x.name, 80); });
        var lv = int(abil[a[0]], 0, 0, 10);
        h += rtrait(esc(a[1]), fields.join(", ") || (EXPERTISE.indexOf(a[0]) >= 0 && lv > 0 ? "field to be chosen" : ""), lv, max);
      });
      h += "</div>";
    });
    h += "</div>";
    var discs = Array.isArray(d.disciplines) ? d.disciplines : [], bgs = Array.isArray(d.backgrounds) ? d.backgrounds : [];
    h += '<h3>Advantages</h3><div class="adv3"><div><h4>Disciplines</h4>';
    if (!discs.length) h += '<p class="empty-line">None.</p>';
    discs.forEach(function (x) {
      x = obj(x);
      var rule = findByName(RULES.disciplines, x.name);
      h += rtrait((rule ? rulesLink(rule.page, x.name) : esc(x.name)) + (x.clan ? '<span class="clan-mark" title="Clan Discipline">◆</span>' : ""), "", int(x.dots, 0, 0, 10), max);
    });
    h += "</div><div><h4>Backgrounds</h4>";
    if (!bgs.length) h += '<p class="empty-line">None.</p>';
    bgs.forEach(function (x) { x = obj(x); h += rtrait(rulesLink("concepts/backgrounds", str(x.name, 60)), "", int(x.dots, 0, 0, 10), 5); });
    h += "</div><div><h4>Virtues</h4>";
    var pair = virtuePair(d);
    pair.forEach(function (k) { h += rtrait(rulesLink("concepts/virtues-and-willpower", VIRTUES[k]), "", int(virt[k], 1, 0, 10), 5); });
    h += "</div></div>";
    var paths = Array.isArray(d.paths) ? d.paths : [], rits = Array.isArray(d.rituals) ? d.rituals : [];
    if (paths.length || rits.length) {
      h += '<h3>Paths and Rituals</h3><div class="split"><div><h4>Paths</h4>';
      if (!paths.length) h += '<p class="empty-line">None.</p>';
      paths.forEach(function (x) {
        x = obj(x);
        var rule = pathRule(x.name);
        h += rtrait(rule ? rulesLink(rule.page, x.name) : esc(x.name), str(x.sorcery, 20) + (x.primary ? ", primary" : ""), int(x.dots, 0, 0, 10), 5);
      });
      h += "</div><div><h4>Rituals</h4>";
      if (!rits.length) h += '<p class="empty-line">None.</p>';
      rits.forEach(function (x) { x = obj(x); h += '<div class="merit-row"><span>' + esc(x.name) + '</span><span class="pts">Level ' + int(x.level, 1, 1, 10) + "</span></div>"; });
      h += "</div></div>";
    }
    var mf = Array.isArray(d.meritsFlaws) ? d.meritsFlaws : [];
    var rr = int(d.roadRating, 0, 0, 10), wp = int(d.willpower, 0, 0, 10), blood = int(p.blood, 0, 0, 60);
    h += '<h3>Road, Willpower, Blood and Health</h3><div class="lower"><div><div class="block"><h4>Merits &amp; Flaws</h4>';
    if (!mf.length) h += '<p class="empty-line">None.</p>';
    mf.forEach(function (x) { x = obj(x); h += '<div class="merit-row"><span>' + rulesLink("concepts/merits-and-flaws", str(x.name, 80)) + '</span><span class="pts">' + esc(x.kind) + " " + int(x.points, 0, 0, 10) + "</span></div>"; });
    h += "</div></div>";
    h += '<div><div class="block"><h4>' + (road ? rulesLink(road.page, road.name) : "Road") + "</h4>" + rdots(rr, 10) + '<span class="tracker-note">' + auraNote(rr) + "</span></div>";
    h += '<div class="block"><h4>Willpower</h4>' + rdots(wp, 10) + "</div>";
    h += '<div class="block"><h4>Blood Pool</h4>' + bloodBoxes(g.pool || 10, blood) + "</div></div>";
    var hrows = [];
    for (var e = 0; e < int(d.extraHealth, 0, 0, 3); e++) hrows.push(["Bruised", 0]);
    h += '<div><div class="block"><h4>Health</h4><table class="health-table">' + hrows.concat(HEALTH).map(function (r) {
      return "<tr><td>" + esc(r[0]) + '</td><td class="pen">' + (r[1] ? "−" + Math.abs(r[1]) : "") + '</td><td class="mark"><span class="box"></span></td></tr>';
    }).join("") + '</table></div><div class="block"><h4>Weakness</h4><div class="weakness">' + esc(d.weakness) + "</div></div></div></div>";
    return h + "</section>";
  }
  function bloodBoxes(pool, cur) {
    var h = '<span class="boxes wrap" role="img" aria-label="Blood, ' + cur + " of " + pool + '">';
    for (var i = 1; i <= pool; i++) h += '<span class="box blood' + (i <= cur ? " on" : "") + '"></span>';
    return h + '</span><span class="tracker-note">' + cur + " of " + pool + "</span>";
  }
  function sheetPage2(d, p) {
    d = obj(d); p = obj(p);
    function box(label, v) { return '<div class="labelled"><b>' + esc(label) + '</b><div class="prose-box">' + esc(v) + "</div></div>"; }
    return '<section class="page" aria-label="Character sheet, page two"><div class="page2-top"><strong style="font-family:var(--sheet-head);font-size:1.3rem">' + esc(d.name) + "</strong></div>" +
      '<div style="margin-top:1rem">' + box("Apparent age", p.apparentAge) + box("Embraced", p.embraced) + box("Appearance", p.appearance) + "</div>" +
      '<h3>Goals</h3><div class="labelled" style="border-top:1px solid var(--paper-ink)"><div class="prose-box">' + esc(p.goals) + "</div></div>" +
      '<h3>History</h3><div class="labelled" style="border-top:1px solid var(--paper-ink)"><div class="prose-box">' + esc(p.history) + "</div></div></section>";
  }

  /* ------------------------------------------------- the review view */
  function renderReview() {
    var row = S.row, data = obj(row.data), play = obj(row.play);
    var stored = { data: data, play: play };
    var L = checks(S.d, S.p, S.w, stored);
    var bad = L.filter(function (x) { return !x.ok; }), flags = L.filter(function (x) { return x.flag; });
    var info = compute(S.d, S.w);
    var h = '<div class="sheet-bar"><a class="btn btn--ghost" href="' + esc(link("")) + '">&larr; ' + (isST() ? "All drafts" : "Your characters") + "</a></div>";
    h += '<section class="create-panel" aria-labelledby="revTitle"><h2 id="revTitle">' + esc(row.name || "Unnamed") + "</h2>" +
      "<p><strong>" + esc(STATUS[row.status] || row.status) + "</strong> · by " + esc(row.email) +
      " · started " + esc(fmtDate(row.created_at)) + (row.submitted_at ? " · sent " + esc(fmtDateTime(row.submitted_at)) : "") +
      (row.decided_at ? " · decided " + esc(fmtDate(row.decided_at)) : "") + "</p>";
    if (row.note) h += '<div class="sheet-notice rejected-note"><strong>Storyteller’s note:</strong> ' + esc(row.note) + "</div>";
    if (row.status === "approved" && row.sheet_slug) h += '<p><a class="btn" href="sheet.html?c=' + esc(encodeURIComponent(row.sheet_slug)) + '">Open the character sheet</a></p>';
    h += bad.length
      ? '<div class="problems" role="alert"><h3>' + plural(bad.length, "rule") + " not met</h3><ul>" + bad.map(function (x) { return "<li>" + esc(x.problem) + "</li>"; }).join("") + "</ul></div>"
      : '<p class="step-ok">Every rule is met.' + (flags.length ? " " + plural(flags.length, "note") + " for the Storyteller below." : "") + "</p>";

    if (isST() && row.status === "submitted") {
      h += '<p class="step-nav" style="margin:.6rem 0"><button type="button" class="btn" data-act="approve" data-f="approve">Approve</button>' +
        '<button type="button" class="btn btn--ghost" data-act="sendback" data-f="sendback">Send back</button></p>';
    } else if (mine(row) && row.status === "submitted") {
      h += '<p class="step-nav" style="margin:.6rem 0"><button type="button" class="btn btn--ghost" data-act="withdraw" data-id="' + esc(row.id) + '">Withdraw</button></p>';
    } else if (mine(row) && (row.status === "draft" || row.status === "rejected")) {
      h += '<p><a class="btn" href="' + esc(link("draft=" + encodeURIComponent(row.id))) + '">Continue</a></p>';
    }
    h += "<h3 style=\"font-family:var(--font-display);font-size:.85rem;letter-spacing:.08em;margin:1.2rem 0 .3rem;color:var(--ink-soft)\">Starting blood</h3>" +
      (info.blood ? "<p>Die " + info.blood.die + " + Domain " + info.blood.domain + " + Herd " + info.blood.herd + " = " + info.blood.raw +
        (info.blood.raw > info.blood.cap ? ", capped at " + info.blood.cap : "") + ": " + plural(info.blood.result, "blood point") + ". Rolled " + esc(fmtDateTime(info.blood.rolledAt)) + ".</p>"
        : '<p class="empty-line">Not rolled.</p>');
    h += freebieTable(info, S.w);
    h += checklistHtml(L) + "</section>";
    h += sheetPage1(data, play) + sheetPage2(data, play);
    root().innerHTML = h;
  }

  /* --------------------------------------------- Storyteller actions */
  function slugify(name) {
    var s = String(name || "").normalize ? String(name || "").normalize("NFD").replace(/[̀-ͯ]/g, "") : String(name || "");
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "") || "cainite";
  }
  function openApprove() {
    var bad = checks(S.d, S.p, S.w, { data: obj(S.row.data), play: obj(S.row.play) }).filter(function (x) { return !x.ok; });
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
    if (/^w\.(base|free)\.(disciplines|backgrounds)\./.test(path) && !value) delete o[last];
    else o[last] = value;
  }

  function onClanChange(oldName) {
    var d = S.d, w = S.w, c = clanOf(d);
    if (isNosferatu(d) && w.base.attributes.appearance === 1 && !w.free.attributes.appearance) w.base.attributes.appearance = 0;
    if (!isNosferatu(d) && w.base.attributes.appearance === 0) w.base.attributes.appearance = 1;
    var dropped = [];
    if (!same(oldName, d.clan)) {
      w.picks = ["", "", ""];
      var cd = clanDiscs(d, w);
      Object.keys(w.base.disciplines).forEach(function (n) { if (!inList(cd, n)) { dropped.push(n); delete w.base.disciplines[n]; } });
    }
    if (dropped.length) toast("Dots in " + list(dropped) + " were taken off: they are not " + (c ? c.name : "clan") + " Disciplines.");
  }
  function onRoadChange() {
    var pair = virtuePair(S.d), w = S.w;
    VKEYS.forEach(function (k) { if (pair.indexOf(k) < 0) { w.base.virtues[k] = 1; w.free.virtues[k] = 0; } });
  }
  function onPickChange(i, oldVal) {
    var w = S.w;
    if (oldVal && w.base.disciplines[oldVal] && !inList(clanDiscs(S.d, w), oldVal)) delete w.base.disciplines[oldVal];
  }

  function goStep(n) {
    var L = checks(S.d, S.p, S.w), from = S.w.step;
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

  async function rollBlood() {
    if (S.w.blood) return;
    var die = 1 + Math.floor(crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296 * 10);
    S.w.blood = { die: die, rolledAt: new Date().toISOString() };
    render();
    await save(true);
  }

  async function submit() {
    var L = checks(S.d, S.p, S.w);
    if (!L.every(function (x) { return x.ok; })) { toast("Some rules are not met yet."); return; }
    if (!window.confirm("Send " + (trim(S.d.name) || "this Cainite") + " to the Storyteller? You cannot change it while it waits, but you can withdraw it.")) return;
    var ok = await save(true);
    if (!ok) return;
    try {
      var r = await S.db.rpc("submit_draft", { p_id: +S.id });
      if (r.error) throw r.error;
      toast("Sent to the Storyteller.");
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
    if (!b || !root().contains(b) && !b.closest("#create")) return;
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
    if (a === "dot") {
      var path = b.getAttribute("data-path"), n = +b.getAttribute("data-n"), val = +b.getAttribute("data-val"), floor = +b.getAttribute("data-floor") || 0;
      if (b.hasAttribute("data-base")) {
        var base = +b.getAttribute("data-base");
        setPath(path, Math.max(0, (n === val ? n - 1 : n) - base));
      } else {
        setPath(path, Math.max(floor, n === val ? n - 1 : n));
      }
      S.dirty = true;
      render();
    } else if (a === "go") goStep(+b.getAttribute("data-step"));
    else if (a === "next") goStep(w.step + 1);
    else if (a === "back") goStep(w.step - 1);
    else if (a === "save") save(false);
    else if (a === "add-ritual") {
      var lst = b.getAttribute("data-list") === "free" ? w.free.rituals : w.base.rituals;
      lst.push({ name: "", level: 1, sorcery: b.getAttribute("data-sorcery") === "Necromancy" ? "Necromancy" : "Thaumaturgy" });
      render();
      var inputs = root().querySelectorAll('input[data-bind$=".name"][data-bind^="w.' + (lst === w.free.rituals ? "free" : "base") + '.rituals."]');
      if (inputs.length) inputs[inputs.length - 1].focus();
    } else if (a === "add-path") {
      w.free.paths.push({ name: "", dots: 1, sorcery: b.getAttribute("data-sorcery") === "Necromancy" ? "Necromancy" : "Thaumaturgy" });
      render();
    } else if (a === "del-row") {
      var arr = getPath(b.getAttribute("data-list"));
      if (Array.isArray(arr)) arr.splice(+b.getAttribute("data-i"), 1);
      render();
    } else if (a === "roll") rollBlood();
    else if (a === "submit") submit();
  });

  document.addEventListener("input", function (e) {
    var t = e.target;
    if (S.mode !== "edit" || !t.matches("input[data-bind], textarea[data-bind]")) return;
    setPath(t.getAttribute("data-bind"), t.value);
    softRefresh();
  });

  document.addEventListener("change", function (e) {
    var t = e.target;
    if (S.mode !== "edit") return;
    var w = S.w;
    if (t.getAttribute("data-act-change") === "add-disc") {
      if (t.value) w.free.disciplines[t.value] = (w.free.disciplines[t.value] || 0) + 1;
      render(); return;
    }
    if (t.getAttribute("data-act-change") === "add-merit") {
      var m = findByName(RULES.merits, t.value);
      if (m && !w.merits.some(function (x) { return same(x.name, m.name); })) w.merits.push({ name: m.name, points: costOptions(m.cost)[0], kind: m.type === "Flaw" ? "Flaw" : "Merit" });
      render(); return;
    }
    if (!t.matches("select[data-bind]")) return;
    var path = t.getAttribute("data-bind"), old = getPath(path);
    var val = t.hasAttribute("data-num") ? int(t.value, 1, 0, 10) : t.value;
    var pm = path.match(/^w\.(attrPri|abilPri)\.(\d)$/);
    if (pm && val) {
      var arr = w[pm[1]], other = arr.indexOf(val);
      if (other >= 0 && other !== +pm[2]) arr[other] = old || "";
    }
    setPath(path, val);
    if (path === "d.clan") onClanChange(old);
    if (path === "d.road") onRoadChange();
    var pk = path.match(/^w\.picks\.(\d)$/);
    if (pk) onPickChange(+pk[1], old);
    S.dirty = true;
    render();
  });

  window.addEventListener("beforeunload", function (e) {
    if (S.mode === "edit" && (S.dirty || S.saving)) { e.preventDefault(); e.returnValue = ""; }
  });
})();
