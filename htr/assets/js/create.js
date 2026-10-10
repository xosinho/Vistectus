/* =====================================================================
   HUNTER CHRONICLES (made with the Builder) — Create Hunter
   ---------------------------------------------------------------------
   One copy for every Builder-made Hunter chronicle: the chronicle is
   <body data-chronicle="..." data-chronicle-name="...">, its world
   <body data-world="...">. A world that names its Creeds (worlds.options
   {"creeds": [...]}, read through /content.js) offers only those.

   create.html                 your characters (and, for the Storyteller,
                               the ones waiting for approval)
   create.html?new             a new hunter, step by step
   create.html?edit=<id>       carry on with a draft
   create.html?review=<id>     a draft read-only, with every rule checked;
                               the Storyteller approves or sends it back

   The steps follow the character creation rules of Hunter: The
   Reckoning 5th edition. Each step counts what is left and will not let
   the player move on while a rule is broken. The same checks run again
   when the Storyteller opens a draft, because a player could save a
   draft without this page.

   Drafts live in character_drafts and change only through its
   functions (save_draft, submit_draft, withdraw_draft, delete_draft,
   approve_draft, reject_draft: admin/sql/access.sql). The draft's data
   is a complete character sheet in the shape sheet.js reads, plus a
   "_creation" key holding the wizard's own state; approving the draft
   copies it to a sheet without that key.

   Starts only once the members' gate (/gate.js) has let the visitor in.
   ===================================================================== */
(function () {
  "use strict";

  var BODY = document.body;
  var CHRONICLE = BODY.getAttribute("data-chronicle") || "";
  var CELL = BODY.getAttribute("data-chronicle-name") || CHRONICLE;   // the sheet's Cell field
  var WORLD = BODY.getAttribute("data-world") || "";

  var ATTRS = [
    ["Physical", ["strength", "dexterity", "stamina"]],
    ["Social",   ["charisma", "manipulation", "composure"]],
    ["Mental",   ["intelligence", "wits", "resolve"]]
  ];
  var ATTR_KEYS = [].concat.apply([], ATTRS.map(function (g) { return g[1]; }));
  var SKILLS = [
    ["athletics", "brawl", "craft", "drive", "firearms", "larceny", "melee", "stealth", "survival"],
    ["animalken", "etiquette", "insight", "intimidation", "leadership", "performance", "persuasion", "streetwise", "subterfuge"],
    ["academics", "awareness", "finance", "investigation", "medicine", "occult", "politics", "science", "technology"]
  ];
  var SKILL_GROUPS = ["Physical", "Social", "Mental"];
  var ALL_SKILLS = [].concat.apply([], SKILLS);
  var LABELS = { animalken: "Animal Ken", drive: "Driving" };

  // The rules being enforced.
  var ATTR_NEED = { 4: 1, 3: 3, 2: 4, 1: 1 };
  var DISTS = [
    { key: "jack",       name: "Jack of All Trades", need: { 3: 1, 2: 8, 1: 10 },       text: "One Skill at 3, eight at 2, ten at 1." },
    { key: "balanced",   name: "Balanced",           need: { 3: 3, 2: 5, 1: 7 },        text: "Three Skills at 3, five at 2, seven at 1." },
    { key: "specialist", name: "Specialist",         need: { 4: 1, 3: 3, 2: 3, 1: 3 }, text: "One Skill at 4, three at 3, three at 2, three at 1." }
  ];
  var NEEDS_SPECIALTY = ["academics", "craft", "performance", "science"];
  var ADV_DOTS = 7, FLAW_DOTS = 2, MAX_TOUCHSTONES = 3, MAX_UNFINISHED = 5;

  var STEPS = [
    { key: "concept",     title: "Concept" },
    { key: "attributes",  title: "Attributes" },
    { key: "skills",      title: "Skills" },
    { key: "specialties", title: "Specialties" },
    { key: "edges",       title: "Edges and Perks" },
    { key: "advantages",  title: "Advantages and Flaws" },
    { key: "details",     title: "Touchstones and details" },
    { key: "review",      title: "Review" }
  ];

  var db = null;
  var S = {
    me: "", role: "player",
    mode: "list",          // list | wizard | review
    drafts: [],
    row: null,             // the draft row being edited or reviewed
    D: null,               // {data, play}
    step: 0,
    dirty: false,
    saveChain: Promise.resolve(),
    busy: false,
    approved: null         // slug just approved, to show the link
  };

  /* ------------------------------------------------------------ helpers */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function label(k) { return LABELS[k] || (k.charAt(0).toUpperCase() + k.slice(1)); }
  function num(v, max) { v = parseInt(v, 10); return isNaN(v) ? 0 : Math.max(0, Math.min(max, v)); }
  function errText(e) { return (e && e.message) ? e.message : String(e); }
  function str(v) { return String(v == null ? "" : v); }
  function fmtDate(iso) {
    var d = new Date(iso);
    return !iso || isNaN(d) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }
  var WORDS = ["none", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  function nw(n) { return WORDS[n] || String(n); }
  function listNames(a) {
    if (a.length < 2) return a.join("");
    return a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
  }
  function q(s) { return "“" + s + "”"; }
  function toast(msg) {
    var t = $("createToast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { t.hidden = true; }, 3600);
  }
  function setStatus(msg, isError) {
    var el = $("wzStatus");
    if (!el) return;
    el.textContent = msg || "";
    el.classList.toggle("is-error", !!isError);
  }
  function go(qs) { window.location.href = window.location.pathname + (qs || ""); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* -------------------------------------------------------- rules data
     The rules_* tables (assets/sheets/sql/rules.sql). Without them the
     page still works, with plain text boxes instead of lists. */
  var R = { loaded: false, creeds: [], drives: [], edges: [], perks: {}, advantages: [] };

  async function loadRules() {
    try {
      var got = await Promise.all(["rules_creeds", "rules_drives", "rules_edges", "rules_perks", "rules_advantages"].map(function (t) {
        return db.from(t).select("*").order("sort", { ascending: true });
      }));
      got.forEach(function (x) { if (x.error) throw x.error; });
      R.creeds = got[0].data || []; R.drives = got[1].data || []; R.edges = got[2].data || [];
      R.advantages = got[4].data || [];
      R.perks = {};
      (got[3].data || []).forEach(function (p) { (R.perks[p.edge_key] = R.perks[p.edge_key] || []).push(p); });
      R.loaded = R.creeds.length > 0 && R.drives.length > 0 && R.edges.length > 0 && R.advantages.length > 0;
    } catch (e) { console.error("Rules unavailable; plain text boxes instead.", e); R.loaded = false; }
    await worldCreeds();
  }

  /* The world may allow only some Creeds (the Builder's player options).
     A missing or empty list means all of them. */
  async function worldCreeds() {
    if (!R.loaded || !WORLD || !window.ChronicleContent) return;
    try {
      var w = await window.ChronicleContent.world(WORLD);
      var allowed = w && w.options && Array.isArray(w.options.creeds) ? w.options.creeds : [];
      if (!allowed.length) return;
      var ok = {};
      allowed.forEach(function (c) { ok[normName(c)] = true; });
      var kept = R.creeds.filter(function (c) { return ok[normName(c.name)] || ok[normName(c.key)]; });
      if (kept.length) R.creeds = kept;
    } catch (e) { console.warn("The world's Creeds could not be read; offering all of them.", e); }
  }
  function creedsWord() { return nw(R.creeds.length); }

  function normName(s) {
    return String(s || "").toLowerCase().replace(/artefact/g, "artifact").replace(/[’']/g, "")
      .replace(/[^a-z0-9]+/g, " ").replace(/^the /, "").trim();
  }
  function baseName(s) {
    return normName(String(s || "").replace(/\(.*?\)/g, " ").split(/\s+[-–—]\s+|:/)[0]);
  }
  function findCreed(name) {
    var n = normName(name);
    return n ? R.creeds.filter(function (c) { return normName(c.name) === n; })[0] || null : null;
  }
  function findDrive(name) {
    var n = normName(name);
    return n ? R.drives.filter(function (c) { return normName(c.name) === n; })[0] || null : null;
  }
  function edgeByKey(k) { return R.edges.filter(function (e) { return e.key === k; })[0] || null; }
  function findEdge(row) {
    if (!R.loaded || !row) return null;
    var full = normName(String(row.name || "").replace(/\(.*?\)/g, " ")), base = baseName(row.name);
    return R.edges.filter(function (e) { return row.key && e.key === row.key; })[0] ||
      R.edges.filter(function (e) { return normName(e.name) === full; })[0] ||
      R.edges.filter(function (e) { return !e.variant_of && normName(e.name) === base; })[0] || null;
  }
  // A variant has its own Perks and its base Edge's.
  function perksOf(rule) {
    if (!rule) return [];
    return (R.perks[rule.key] || []).concat(rule.variant_of ? (R.perks[rule.variant_of] || []) : []);
  }
  function findPerk(rule, text) {
    var t = baseName(text);
    return perksOf(rule).filter(function (p) {
      var n = normName(p.name);
      return n === t || t.indexOf(n + " ") === 0;
    })[0] || null;
  }
  function advByKey(k) { return R.advantages.filter(function (a) { return a.key === k; })[0] || null; }
  function findAdvantage(name) {
    var b = baseName(String(name || "").replace(/\(flaw\)/i, ""));
    return R.advantages.filter(function (a) { return normName(a.name) === b; })[0] || null;
  }
  // The sheet holds at most five dots of anything.
  function advMax(rule) { return Math.min(5, rule.max_dots || 5); }
  function advMin(rule) { return Math.max(1, rule.min_dots || 1); }
  function dotRange(rule) {
    var lo = advMin(rule), hi = advMax(rule);
    return lo === hi ? "exactly " + nw(lo) + (lo === 1 ? " dot" : " dots") : lo + " to " + hi + " dots";
  }

  function edgeOptions(exclude) {
    return ["Asset", "Aptitude", "Endowment"].map(function (c) {
      var opts = R.edges.filter(function (e) { return e.category === c && !(exclude && exclude[e.key]); });
      if (!opts.length) return "";
      return '<optgroup label="' + c + 's">' + opts.map(function (e) {
        return '<option value="' + esc(e.key) + '">' + esc(e.name) + (e.lineage ? " (" + esc(e.lineage) + ")" : "") + "</option>";
      }).join("") + "</optgroup>";
    }).join("");
  }
  function advantageOptions(types) {
    return types.map(function (t) {
      var opts = R.advantages.filter(function (a) { return a.type === t; });
      return '<optgroup label="' + t + 's">' + opts.map(function (a) {
        return '<option value="' + esc(a.key) + '" title="' + esc(a.summary) + '">' + esc(a.name) + " " + esc(a.dots) + "</option>";
      }).join("") + "</optgroup>";
    }).join("");
  }

  /* ------------------------------------------------------ the draft data */
  function ten(a, n) { a = Array.isArray(a) ? a.slice(0, n) : []; while (a.length < n) a.push(""); return a; }

  // A complete sheet in the shape sheet.js reads, plus _creation.
  function shape(data, play) {
    var d = clone(data || {}), p = clone(play || {});
    var a = d.attributes || {}, s = d.skills || {};
    d.attributes = {}; d.skills = {};
    ATTR_KEYS.forEach(function (k) { d.attributes[k] = a[k] == null ? 1 : num(a[k], 5); });
    ALL_SKILLS.forEach(function (k) { d.skills[k] = num(s[k], 5); });
    ["name", "concept", "creed", "cell", "drive", "redemption", "tenets", "creedFields"].forEach(function (k) { d[k] = str(d[k]); });
    d.specialties = (Array.isArray(d.specialties) ? d.specialties : []).filter(function (x) { return x && typeof x === "object"; })
      .map(function (x) { return { skill: str(x.skill), name: str(x.name) }; });
    d.edges = (Array.isArray(d.edges) ? d.edges : []).filter(function (x) { return x && typeof x === "object"; }).map(function (e) {
      var row = { name: str(e.name), perks: Array.isArray(e.perks) ? e.perks.map(str) : [], notes: str(e.notes) };
      if (e.key) row.key = str(e.key);
      return row;
    });
    d.advantages = (Array.isArray(d.advantages) ? d.advantages : []).filter(function (x) { return x && typeof x === "object"; })
      .map(function (x) { return { name: str(x.name), dots: num(x.dots, 5) }; });
    d.healthMax = d.healthMax == null ? "" : d.healthMax;
    d.willpowerMax = d.willpowerMax == null ? "" : d.willpowerMax;

    ["ambition", "desire", "touchstones", "notes", "age", "dob", "appearance", "features", "history"].forEach(function (k) { p[k] = str(p[k]); });
    p.health = ten(p.health, 10); p.willpower = ten(p.willpower, 10); p.equipment = ten(p.equipment, 14);
    p.despair = num(p.despair, 5);

    var had = d._creation && typeof d._creation === "object";
    var c = had ? d._creation : {};
    c.step = num(c.step, STEPS.length - 1);
    c.skillDist = str(c.skillDist);
    c.creedNotes = str(c.creedNotes);
    c.spec = c.spec && typeof c.spec === "object" ? c.spec : {};
    c.spec.req = c.spec.req && typeof c.spec.req === "object" ? c.spec.req : {};
    c.spec.free = c.spec.free && typeof c.spec.free === "object" ? c.spec.free : {};
    c.spec.free = { skill: str(c.spec.free.skill), name: str(c.spec.free.name) };
    NEEDS_SPECIALTY.forEach(function (k) { c.spec.req[k] = str(c.spec.req[k]); });
    c.advs = (Array.isArray(c.advs) ? c.advs : []).map(function (x) {
      return { key: str(x.key), name: str(x.name), flaw: !!x.flaw, detail: str(x.detail), dots: num(x.dots, 5) };
    });
    c.touchstones = (Array.isArray(c.touchstones) ? c.touchstones : []).map(function (t) { return { name: str(t.name), who: str(t.who) }; });
    d._creation = c;
    if (!had) rebuildCreation(d, p);
    if (!c.touchstones.length) c.touchstones.push({ name: "", who: "" });
    return { data: d, play: p };
  }

  // A draft saved without this page's own notes: work them out from the sheet.
  function rebuildCreation(d, p) {
    var c = d._creation;
    var used = {};
    d.specialties.forEach(function (s, i) {
      if (NEEDS_SPECIALTY.indexOf(s.skill) >= 0 && !c.spec.req[s.skill]) { c.spec.req[s.skill] = s.name; used[i] = true; }
    });
    d.specialties.forEach(function (s, i) {
      if (!used[i] && !c.spec.free.skill) c.spec.free = { skill: s.skill, name: s.name };
    });
    c.advs = d.advantages.map(function (a) {
      var flaw = /\(flaw\)/i.test(a.name);
      var plain = a.name.replace(/\s*\(flaw\)\s*/i, " ").trim();
      var parts = plain.split(/\s+[-–—]\s+/);
      var rule = R.loaded ? findAdvantage(a.name) : null;
      return { key: rule ? rule.key : "", name: rule ? "" : parts[0], flaw: rule ? rule.type === "Flaw" : flaw,
               detail: parts.slice(1).join(" - "), dots: a.dots };
    });
    c.touchstones = parseTouchstones(p.touchstones).map(function (t) { return { name: t.name, who: t.who }; });
    var cr = findCreed(d.creed);
    if (cr && d.creedFields.indexOf(cr.creed_field) === 0) c.creedNotes = d.creedFields.slice(cr.creed_field.length).trim();
    else c.creedNotes = d.creedFields;
    var dist = DISTS.filter(function (x) { return skillsMatch(d.skills, x); })[0];
    if (dist) c.skillDist = dist.key;
  }

  function blank() {
    return shape({ cell: CELL, _creation: { step: 0, touchstones: [{ name: "", who: "" }] } }, {});
  }

  function advName(a) {
    var rule = a.key ? advByKey(a.key) : null;
    var base = rule ? rule.name : a.name.trim();
    var flaw = rule ? rule.type === "Flaw" : a.flaw;
    var detail = a.detail.trim();
    return base + (detail ? " - " + detail : "") + (flaw ? " (Flaw)" : "");
  }
  function tsLine(t) {
    var n = t.name.trim(), w = t.who.trim();
    if (!n && !w) return "";
    return w ? n + " — " + w : n;
  }
  function parseTouchstones(text) {
    return str(text).split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
      var m = l.match(/^(.*?)\s*[—–]\s*(.*)$/) || l.match(/^(.*?)\s+-\s+(.*)$/);
      return m ? { line: l, name: m[1].trim(), who: m[2].trim() } : { line: l, name: l, who: "" };
    });
  }

  // Rebuild the sheet's own fields from what the steps hold.
  function sync() {
    var d = S.D.data, p = S.D.play, c = d._creation;
    d.cell = CELL; d.tenets = ""; d.healthMax = ""; d.willpowerMax = "";
    var cr = findCreed(d.creed);
    d.creedFields = [cr ? cr.creed_field : "", c.creedNotes.trim()].filter(Boolean).join("\n\n");
    d.specialties = [];
    NEEDS_SPECIALTY.forEach(function (k) {
      var n = c.spec.req[k].trim();
      if (d.skills[k] > 0 && n) d.specialties.push({ skill: k, name: n });
    });
    if (c.spec.free.skill && c.spec.free.name.trim()) d.specialties.push({ skill: c.spec.free.skill, name: c.spec.free.name.trim() });
    d.advantages = c.advs.map(function (a) { return { name: advName(a), dots: a.dots }; });
    p.touchstones = c.touchstones.map(tsLine).filter(Boolean).join("\n");
    c.step = S.step;
  }

  /* ------------------------------------------------------------ the rules
     validate() checks a draft's sheet against every rule. The wizard
     uses it step by step; the Storyteller's review uses it whole. */
  function levels(obj, keys) {
    var by = {};
    keys.forEach(function (k) { (by[obj[k]] = by[obj[k]] || []).push(label(k)); });
    return by;
  }
  function skillsMatch(skills, dist) {
    var by = levels(skills, ALL_SKILLS);
    for (var L = 1; L <= 5; L++) if ((by[L] || []).length !== (dist.need[L] || 0)) return false;
    return true;
  }
  function levelMsg(what, L, names, need, who) {
    var have = names.length;
    var s = what + " at " + L + ": you have " + nw(have) + (have && have <= 4 ? " (" + listNames(names) + ")" : "") + "; ";
    if (!need) return s + (who ? who + " allows none." : "none are allowed.");
    return s + (who ? who + " needs " : "you need ") + nw(need) + ", so " +
      (have < need ? nw(need - have) + " more." : nw(have - need) + " fewer.");
  }

  function validate(d, p, opts) {
    opts = opts || {};
    var c = d._creation || {};
    var checks = [];
    function check(step, id, lbl, problems, note) {
      checks.push({ step: step, id: id, label: lbl, ok: !problems.length, problems: problems, note: note || "" });
    }

    // 1. Concept
    var pr = [];
    if (!d.name.trim()) pr.push("Give your hunter a name.");
    if (!d.concept.trim()) pr.push("Write a short concept, such as " + q("Disgraced paramedic") + ".");
    check(0, "identity", "A name and a concept", pr);

    pr = [];
    if (!d.creed.trim()) pr.push("Choose a Creed.");
    else if (R.loaded && !findCreed(d.creed)) pr.push(q(d.creed) + " is not one of the " + creedsWord() + " Creeds open in this chronicle.");
    check(0, "creed", "A Creed: one of the " + creedsWord(), pr);

    pr = [];
    var drv = findDrive(d.drive);
    if (!d.drive.trim()) pr.push("Choose a Drive.");
    else if (R.loaded && !drv) pr.push(q(d.drive) + " is not one of the Drives.");
    if (!d.redemption.trim()) pr.push("Write the Redemption for the Drive (choosing the Drive fills it in; you may reword it).");
    check(0, "drive", "A Drive and its Redemption", pr);

    pr = [];
    if (!p.ambition.trim()) pr.push("Write an Ambition: the long-term goal your hunter works towards.");
    if (!p.desire.trim()) pr.push("Write a Desire: something your hunter wants soon.");
    check(0, "ambition", "An Ambition and a Desire", pr);

    // 2. Attributes
    pr = [];
    var al = levels(d.attributes, ATTR_KEYS);
    if ((al[0] || []).length) pr.push("Every Attribute needs at least one dot: " + listNames(al[0]) + ".");
    if ((al[5] || []).length) pr.push("No Attribute may start at 5: " + listNames(al[5]) + ".");
    [4, 3, 2, 1].forEach(function (L) {
      var names = al[L] || [];
      if (names.length !== ATTR_NEED[L]) pr.push(levelMsg("Attributes", L, names, ATTR_NEED[L]));
    });
    check(1, "attributes", "Attributes: one at 4, three at 3, four at 2 and one at 1", pr);

    // 3. Skills
    pr = [];
    var note = "";
    var chosen = DISTS.filter(function (x) { return x.key === c.skillDist; })[0] || null;
    var matching = DISTS.filter(function (x) { return skillsMatch(d.skills, x); })[0] || null;
    var sl = levels(d.skills, ALL_SKILLS);
    if (matching && (!chosen || chosen === matching || opts.review)) {
      note = "The Skills match " + matching.name + ": " + matching.text.charAt(0).toLowerCase() + matching.text.slice(1);
    } else if (!chosen) {
      pr.push(opts.review ? "The Skills match none of the three ways of spreading them (Jack of All Trades, Balanced, Specialist)."
                          : "Choose one of the three ways to spread your Skills.");
      if (opts.review) {
        var seen = [];
        for (var L0 = 5; L0 >= 1; L0--) if ((sl[L0] || []).length) seen.push(nw((sl[L0] || []).length) + " at " + L0);
        pr.push("As saved: " + (seen.length ? listNames(seen) : "no Skills at all") + ".");
      }
    } else {
      for (var L = 5; L >= 1; L--) {
        var names = sl[L] || [], need = chosen.need[L] || 0;
        if (names.length !== need) pr.push(levelMsg("Skills", L, names, need, chosen.name));
      }
      if (matching) pr.push("These Skills match " + matching.name + " instead: choose " + matching.name + " above, or change the dots.");
    }
    check(2, "skills", "Skills: one of the three ways of spreading them, exactly", pr, note);

    // 4. Specialties
    pr = [];
    var withDots = NEEDS_SPECIALTY.filter(function (k) { return d.skills[k] > 0; });
    var expected = withDots.length + 1;
    var has = {}, seenSpec = {};
    d.specialties.forEach(function (s) {
      var nm = s.name.trim();
      if (ALL_SKILLS.indexOf(s.skill) < 0) { pr.push(q(s.skill) + " is not a Skill, so the Specialty " + q(nm) + " cannot be in it."); return; }
      if (!nm) pr.push("A Specialty in " + label(s.skill) + " has no name.");
      else if (!d.skills[s.skill]) pr.push("The Specialty " + q(nm) + " is in " + label(s.skill) + ", which has no dots. Specialties go in Skills with dots.");
      var key = s.skill + "|" + nm.toLowerCase();
      if (nm && seenSpec[key]) pr.push("The Specialty " + q(nm) + " in " + label(s.skill) + " is listed twice.");
      seenSpec[key] = true;
      has[s.skill] = (has[s.skill] || 0) + 1;
    });
    withDots.forEach(function (k) {
      if (!has[k]) pr.push(label(k) + " has dots, so it needs a Specialty of its own. Name one.");
    });
    if (d.specialties.length > expected) {
      pr.push("You have " + nw(d.specialties.length) + " Specialties; with these Skills you get " + nw(expected) +
        (withDots.length ? " (one each for " + listNames(withDots.map(label)) + ", and one more of your choice)." : " (one of your choice)."));
    } else if (d.specialties.length < expected && withDots.every(function (k) { return has[k]; })) {
      pr.push("Choose your one free Specialty, in any Skill with dots, and give it a name.");
    }
    check(3, "specialties", "Specialties: one in each of Academics, Craft, Performance and Science that has dots, and one more of your choice", pr);

    // 5. Edges and Perks
    pr = [];
    var nE = d.edges.length, nP = 0, seenEdge = {};
    d.edges.forEach(function (e) {
      nP += e.perks.length;
      var en = e.name.trim();
      if (!en) { pr.push("An Edge has no name."); return; }
      var rule = findEdge(e);
      if (R.loaded && !rule) pr.push(q(en) + " is not one of the Edges in the list.");
      var ek = rule ? rule.key : normName(en);
      if (seenEdge[ek]) pr.push(en + " is chosen twice.");
      seenEdge[ek] = true;
      var seenPerk = {};
      e.perks.forEach(function (x) {
        var pk = findPerk(rule, x);
        if (!x.trim()) pr.push("A Perk of " + en + " has no name.");
        else if (R.loaded && rule && !pk) pr.push(q(x) + " is not one of the Perks of " + en + ".");
        var k = pk ? pk.key : normName(x);
        if (seenPerk[k]) pr.push("The Perk " + q(x) + " is chosen twice.");
        seenPerk[k] = true;
      });
    });
    if (!nE) {
      pr.unshift("Choose an Edge: one Edge comes with two Perks, two Edges with one Perk.");
    } else if (nE > 2) {
      pr.unshift("You have " + nw(nE) + " Edges; the most is two.");
    } else if (nE === 1 && nP !== 2) {
      pr.unshift(nP < 2
        ? "One Edge comes with two Perks, and you have ticked " + nw(nP) + ". Tick " + nw(2 - nP) + " more, or add a second Edge (two Edges come with one Perk)."
        : "One Edge comes with two Perks, and you have ticked " + nw(nP) + ". Untick " + nw(nP - 2) + ".");
    } else if (nE === 2 && nP !== 1) {
      pr.unshift(nP < 1
        ? "Two Edges come with one Perk. Tick one."
        : "Two Edges come with one Perk, and you have ticked " + nw(nP) + ". Untick " + nw(nP - 1) + ", or remove an Edge to keep two Perks.");
    }
    check(4, "edges", "Edges and Perks: two Edges and one Perk, or one Edge and two Perks", pr);

    // 6. Advantages and Flaws
    var mPr = [], fPr = [], mDots = 0, fDots = 0;
    d.advantages.forEach(function (a) {
      var rule = R.loaded ? findAdvantage(a.name) : null;
      var marked = /\(flaw\)/i.test(a.name);
      var flaw = rule ? rule.type === "Flaw" : marked;
      var bucket = flaw ? fPr : mPr;
      var nm = a.name.trim();
      if (!nm || nm === "(Flaw)") bucket.push((flaw ? "A Flaw" : "An Advantage") + " has no name.");
      else if (R.loaded && !rule) bucket.push(q(nm) + " is not in the list of Merits, Backgrounds and Flaws.");
      else if (rule && marked !== flaw) bucket.push(q(nm) + (marked ? " is marked as a Flaw, but " + rule.name + " is a " + rule.type + "."
                                                                   : " is a Flaw, so its name should end in (Flaw)."));
      if (a.dots < 1) bucket.push((nm || "An Advantage") + " has no dots.");
      else if (rule && (a.dots < advMin(rule) || a.dots > advMax(rule))) {
        bucket.push(rule.name + " takes " + dotRange(rule) + "; it has " + nw(a.dots) + ".");
      }
      if (flaw) fDots += a.dots; else mDots += a.dots;
    });
    if (mDots !== ADV_DOTS) mPr.unshift("You have placed " + nw(mDots) + " of the " + nw(ADV_DOTS) + " dots for Merits and Backgrounds, so " +
      (mDots < ADV_DOTS ? nw(ADV_DOTS - mDots) + " still to place." : nw(mDots - ADV_DOTS) + " too many."));
    if (fDots !== FLAW_DOTS) fPr.unshift("You have taken " + nw(fDots) + " of the " + nw(FLAW_DOTS) + " dots of Flaws, so " +
      (fDots < FLAW_DOTS ? nw(FLAW_DOTS - fDots) + " still to take." : nw(fDots - FLAW_DOTS) + " too many."));
    check(5, "merits", "Merits and Backgrounds: exactly seven dots", mPr);
    check(5, "flaws", "Flaws: exactly two dots", fPr);

    // 7. Touchstones
    pr = [];
    var ts = parseTouchstones(p.touchstones);
    if (!ts.length) pr.push("Add at least one Touchstone: a person your hunter holds on to.");
    if (ts.length > MAX_TOUCHSTONES) pr.push("You have " + nw(ts.length) + " Touchstones; the most is three.");
    ts.forEach(function (t) {
      if (!t.name) pr.push("A Touchstone has no name (" + q(t.who) + ").");
      else if (!t.who) pr.push("Say in a line who " + t.name + " is.");
    });
    check(6, "touchstones", "Touchstones: one to three, each with a line on who they are", pr);

    // Worked out, not chosen.
    pr = [];
    var A = d.attributes;
    if (d.healthMax !== "" && d.healthMax != null) pr.push("Health is set by hand to " + d.healthMax + "; at creation it is Stamina + 3.");
    if (d.willpowerMax !== "" && d.willpowerMax != null) pr.push("Willpower is set by hand to " + d.willpowerMax + "; at creation it is Composure + Resolve.");
    check(1, "derived", "Health and Willpower come from the Attributes", pr,
      "Health " + Math.min(10, A.stamina + 3) + " (Stamina " + A.stamina + " + 3); Willpower " + Math.min(10, A.composure + A.resolve) +
      " (Composure " + A.composure + " + Resolve " + A.resolve + ").");

    return checks;
  }
  function stepProblems(checks, i) {
    var out = [];
    checks.forEach(function (c) { if (c.step === i && !c.ok) out = out.concat(c.problems); });
    return out;
  }
  function firstBadStep(checks) {
    for (var i = 0; i < STEPS.length - 1; i++) if (stepProblems(checks, i).length) return i;
    return STEPS.length - 1;
  }

  /* --------------------------------------------------- sheet pieces */
  function dotsHtml(level, act) {
    var h = '<span class="dots"' + (act ? ' role="group"' : ' role="img"') + ' aria-label="' + (act ? esc(act.label) + ", " : "") + level + ' of 5">';
    for (var i = 1; i <= 5; i++) {
      var cls = i <= level ? "dot on" : "dot";
      h += act
        ? '<button type="button" class="' + cls + '" data-act="' + act.act + '" ' + act.attrs + ' data-n="' + i + '" aria-label="' +
          esc(act.label) + ": set to " + (i === level ? i - 1 : i) + '"' + (i === level && act.min >= i ? " disabled" : "") + "></button>"
        : '<span class="' + cls + '"></span>';
    }
    return h + "</span>";
  }
  function traitHtml(name, sub, level, act) {
    return '<div class="trait"><span class="trait-name">' + esc(name) + (sub ? "<small>" + esc(sub) + "</small>" : "") +
      '</span><span class="trait-end">' + dotsHtml(level, act) + "</span></div>";
  }
  function roField(name, v, cls) {
    return '<div class="field ' + (cls || "") + '"><b>' + esc(name) + '</b><span class="val">' + esc(v) + "</span></div>";
  }
  function edgeRulesHtml(rule) {
    if (!rule) return "";
    return '<div class="edge-pool">Dice pool: ' + esc(rule.dice_pool || "—") + "</div>" +
      (rule.requirements ? '<div class="edge-req">Needs: ' + esc(rule.requirements) + "</div>" : "") +
      '<div class="edge-desc">' + esc(rule.summary) + "</div>";
  }
  function trackerBoxes(max) {
    var h = '<span class="boxes">';
    for (var i = 0; i < 10; i++) {
      if (i === 5) h += '<span class="gap"></span>';
      h += i >= max ? '<span class="box off"></span>' : '<span class="box"></span>';
    }
    return h + "</span>";
  }

  // The whole sheet, read-only: the two pages of sheet.html.
  function sheetHtml(d, p) {
    var A = d.attributes;
    var h = '<section class="page" aria-label="Character sheet, page one">';
    h += '<div class="sheet-head"><div class="sheet-band"><strong>Hunter</strong><span>The Reckoning</span></div><div class="sheet-ident">' +
      roField("Name", d.name) + roField("Concept", d.concept) + roField("Creed", d.creed) +
      roField("Cell", d.cell) + roField("Drive", d.drive) + roField("Redemption", d.redemption) +
      roField("Ambition", p.ambition, "full") + roField("Desire", p.desire, "full") + "</div></div>";
    h += '<h3>Attributes</h3><div class="cols3">';
    ATTRS.forEach(function (g) {
      h += "<div><h4>" + g[0] + "</h4>";
      g[1].forEach(function (k) { h += traitHtml(label(k), "", A[k]); });
      h += "</div>";
    });
    h += "</div>";
    var hMax = Math.min(10, A.stamina + 3), wMax = Math.min(10, A.composure + A.resolve);
    h += '<div class="trackers"><div class="tracker"><h4>Health</h4>' + trackerBoxes(hMax) + '<span class="tracker-note">Stamina + 3 = ' + hMax + "</span></div>" +
      '<div class="tracker"><h4>Willpower</h4>' + trackerBoxes(wMax) + '<span class="tracker-note">Composure + Resolve = ' + wMax + "</span></div></div>";
    h += '<h3>Skills</h3><div class="cols3 skills">';
    SKILLS.forEach(function (col) {
      h += "<div>";
      col.forEach(function (k) {
        var specs = d.specialties.filter(function (s) { return s.skill === k; }).map(function (s) { return s.name; }).join(", ");
        h += traitHtml(label(k), specs, d.skills[k]);
      });
      h += "</div>";
    });
    h += "</div>";
    var rows = d.specialties.map(function (s) {
      return "<li><b>" + esc(ALL_SKILLS.indexOf(s.skill) >= 0 ? label(s.skill) : s.skill) + ":</b> " + esc(s.name) + "</li>";
    });
    h += '<div class="spec-box"><h4>Specialties</h4>' + (rows.length ? '<ul class="spec-list">' + rows.join("") + "</ul>" : '<p class="spec-none">None.</p>') + "</div>";
    h += '<h3>Edges and Perks</h3><table class="grid-table"><tr><th style="width:45%">Edge</th><th>Perks</th></tr>';
    if (!d.edges.length) h += '<tr><td class="empty" colspan="2">No Edges.</td></tr>';
    d.edges.forEach(function (e) {
      var rule = findEdge(e);
      h += "<tr><td><b>" + esc(e.name) + "</b>" + edgeRulesHtml(rule) + "</td><td>" +
        (e.perks.length ? "<ul>" + e.perks.map(function (x) {
          var pk = findPerk(rule, x);
          return "<li>" + esc(x) + (pk ? '<small class="perk-sum">' + esc(pk.summary) + "</small>" : "") + "</li>";
        }).join("") + "</ul>" : "") + "</td></tr>";
    });
    h += "</table></section>";

    h += '<section class="page" aria-label="Character sheet, page two">';
    h += '<div class="page2-top"><strong style="font-family:var(--sheet-head);font-size:1.3rem">' + esc(d.name) + "</strong></div>";
    h += '<div class="boxes3"><div><h4>Chronicle Tenets</h4><div class="prose-box">' + esc(d.tenets) + "</div></div>" +
      '<div><h4>Touchstones</h4><div class="prose-box">' + esc(p.touchstones) + "</div></div>" +
      '<div><h4>Creed Fields</h4><div class="prose-box">' + esc(d.creedFields) + "</div></div></div>";
    h += '<div class="split"><div><h3>Advantages &amp; Flaws</h3><div>';
    if (!d.advantages.length) h += '<div class="adv-row"><span class="empty-line">None.</span></div>';
    d.advantages.forEach(function (a) {
      var rule = R.loaded ? findAdvantage(a.name) : null;
      h += '<div class="adv-row"' + (rule ? ' title="' + esc(rule.type + " · " + rule.dots + " · " + rule.summary) + '"' : "") +
        '><span class="trait-name">' + esc(a.name) + '</span><span class="trait-end">' + dotsHtml(a.dots) + "</span></div>";
    });
    h += "</div></div><div><h3>Details</h3>" +
      '<div class="labelled"><b>Age</b><span>' + esc(p.age) + "</span></div>" +
      '<div class="labelled"><b>Date of birth</b><span>' + esc(p.dob) + "</span></div>" +
      '<div class="labelled"><b>Appearance</b><div class="prose-box">' + esc(p.appearance) + "</div></div>" +
      '<div class="labelled"><b>Distinguishing features</b><div class="prose-box">' + esc(p.features) + "</div></div>" +
      '<div class="labelled"><b>History</b><div class="prose-box">' + esc(p.history) + "</div></div>" +
      "</div></div></section>";
    return h;
  }

  function checklistHtml(checks) {
    return '<ul class="checklist">' + checks.map(function (c) {
      return '<li class="' + (c.ok ? "ok" : "bad") + '"><span class="mark" aria-hidden="true">' + (c.ok ? "✓" : "✗") + "</span>" +
        '<div><b>' + esc(c.label) + '</b><span class="visually-hidden" style="position:absolute;left:-9999px"> ' + (c.ok ? "(met)" : "(not met)") + "</span>" +
        (c.note && c.ok ? "<small>" + esc(c.note) + "</small>" : "") +
        (c.ok ? "" : "<ul>" + c.problems.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>") +
        "</div></li>";
    }).join("") + "</ul>";
  }

  /* --------------------------------------------------------- the list */
  var STATUS_TEXT = { draft: "Draft", submitted: "Waiting for the Storyteller", rejected: "Sent back", approved: "Approved" };
  function pill(st) { return '<span class="pill pill-' + esc(st) + '">' + esc(STATUS_TEXT[st] || st) + "</span>"; }
  function mine(r) { return String(r.email || "").toLowerCase() === S.me; }

  async function loadDrafts() {
    var r = await db.from("character_drafts")
      .select("id,chronicle,email,name,status,note,sheet_slug,created_at,updated_at,submitted_at,decided_at")
      .eq("chronicle", CHRONICLE).order("updated_at", { ascending: false });
    if (r.error) throw r.error;
    S.drafts = r.data || [];
  }

  function unfinished() { return S.drafts.filter(function (r) { return mine(r) && r.status !== "approved"; }).length; }

  function renderList() {
    var own = S.drafts.filter(mine);
    var h = "";
    if (!R.loaded) h += rulesNotice();
    h += '<section class="xp-panel" aria-labelledby="ownTitle"><h2 id="ownTitle">Your characters</h2>';
    if (!own.length) h += '<p class="xp-hint">You have not started a hunter here yet.</p>';
    else {
      h += '<ul class="draft-list">' + own.map(function (r) {
        var acts = [];
        if (r.status === "draft" || r.status === "rejected") acts.push('<a class="btn" href="?edit=' + r.id + '">Continue</a>');
        if (r.status === "submitted") {
          acts.push('<a class="btn btn--ghost" href="?review=' + r.id + '">View</a>');
          acts.push('<button type="button" class="btn btn--ghost" data-act="withdraw" data-id="' + r.id + '">Withdraw</button>');
        }
        if (r.status === "approved" && r.sheet_slug) acts.push('<a class="btn" href="sheet.html?c=' + encodeURIComponent(r.sheet_slug) + '">Open the sheet</a>');
        if (r.status !== "approved") acts.push('<button type="button" class="btn btn--ghost" data-act="delete" data-id="' + r.id + '">Delete</button>');
        var meta = r.status === "submitted" ? "Sent " + fmtDate(r.submitted_at)
          : r.status === "approved" ? "Approved " + fmtDate(r.decided_at)
          : r.status === "rejected" ? "Sent back " + fmtDate(r.decided_at)
          : "Last saved " + fmtDate(r.updated_at);
        var note = "";
        if (r.note && (r.status === "rejected" || r.status === "approved")) {
          note = '<p class="draft-note"><b>The Storyteller:</b> ' + esc(r.note) + "</p>";
        } else if (r.note && r.status === "draft" && r.decided_at) {
          note = '<p class="draft-note"><b>The Storyteller&rsquo;s earlier note:</b> ' + esc(r.note) + "</p>";
        }
        return '<li><div class="draft-main"><b>' + esc(r.name || "Unnamed hunter") + "</b>" + pill(r.status) +
          '<div class="draft-meta">' + esc(meta) + "</div>" + note + '</div><div class="draft-acts">' + acts.join("") + "</div></li>";
      }).join("") + "</ul>";
    }
    var n = unfinished();
    if (n >= MAX_UNFINISHED) {
      h += '<p class="xp-hint">You have five characters in progress, which is the most at one time. Finish or delete one to start another.</p>' +
        '<button type="button" class="btn" disabled>Create a new hunter</button>';
    } else {
      h += '<a class="btn" href="?new">Create a new hunter</a>';
    }
    h += "</section>";

    if (S.role === "storyteller") {
      var others = S.drafts.filter(function (r) { return !mine(r); });
      var waiting = S.drafts.filter(function (r) { return r.status === "submitted"; })
        .sort(function (a, b) { return String(a.submitted_at).localeCompare(String(b.submitted_at)); });
      h += '<section class="xp-panel" aria-labelledby="waitTitle"><h2 id="waitTitle">Waiting for your approval</h2>';
      if (!waiting.length) h += '<p class="xp-hint">Nothing is waiting for you.</p>';
      else h += '<ul class="draft-list">' + waiting.map(function (r) {
        return '<li><div class="draft-main"><b>' + esc(r.name || "Unnamed hunter") + "</b>" +
          '<div class="draft-meta">' + esc(r.email) + " · sent " + esc(fmtDate(r.submitted_at)) + "</div></div>" +
          '<div class="draft-acts"><a class="btn" href="?review=' + r.id + '">Review</a></div></li>';
      }).join("") + "</ul>";
      var progress = others.filter(function (r) { return r.status === "draft" || r.status === "rejected"; });
      h += '<h3>Being made by others</h3>';
      if (!progress.length) h += '<p class="xp-hint">No one else has a hunter in progress.</p>';
      else h += '<ul class="draft-list">' + progress.map(function (r) {
        return '<li><div class="draft-main"><b>' + esc(r.name || "Unnamed hunter") + "</b>" + pill(r.status) +
          '<div class="draft-meta">' + esc(r.email) + " · last saved " + esc(fmtDate(r.updated_at)) + "</div></div>" +
          '<div class="draft-acts"><a class="btn btn--ghost" href="?review=' + r.id + '">View</a></div></li>';
      }).join("") + "</ul>";
      h += '<p class="xp-hint">Drafts still being made are read-only for you; the player sends them when they are ready.</p></section>';
    }
    $("create").innerHTML = h;
  }

  function rulesNotice() {
    return '<div class="sheet-notice">The rules lists (Creeds, Drives, Edges, Advantages) could not be loaded just now, so those are typed by hand. ' +
      "The counts are still checked; the Storyteller checks the names.</div>";
  }

  /* --------------------------------------------------------- the wizard */
  function startWizard(row) {
    S.mode = "wizard";
    S.row = row;
    S.D = row.id ? shape(row.data, row.play) : blank();
    S.step = Math.min(S.D.data._creation.step || 0, STEPS.length - 1);
    var bad = firstBadStep(validate(S.D.data, S.D.play));
    if (S.step > bad) S.step = bad;
    sync();
    renderWizard();
  }

  function renderWizard() {
    var d = S.D.data, row = S.row;
    var h = '<div class="sheet-bar"><a class="btn btn--ghost" href="' + esc(window.location.pathname) + '">&larr; Your characters</a>' +
      '<span class="sheet-status" id="wzStatus" role="status" aria-live="polite"></span><span class="spacer"></span>' +
      '<button type="button" class="btn btn--ghost" data-act="save">Save draft</button></div>';
    if (row.status === "rejected" && row.note) {
      h += '<div class="sheet-notice"><b>The Storyteller sent this hunter back:</b> <span style="white-space:pre-wrap">' + esc(row.note) +
        "</span><br>Change what is needed and send it again from the Review step.</div>";
    }
    if (!R.loaded) h += rulesNotice();
    h += '<ol class="wz-steps" id="wzSteps" aria-label="Steps"></ol>';
    h += '<div id="wzStep">' + stepHtml(STEPS[S.step].key, d, S.D.play) + "</div>";
    h += '<div class="wz-todo" id="wzTodo" role="status" aria-live="polite"></div>';
    h += '<div class="wz-nav" id="wzNav"></div>';
    $("create").innerHTML = h;
    refresh();
  }

  // The parts that change as the player types: counts, to-do, buttons.
  function refresh() {
    var d = S.D.data, p = S.D.play;
    var checks = validate(d, p);
    var bad = firstBadStep(checks);
    var last = STEPS.length - 1;

    $("wzSteps").innerHTML = STEPS.map(function (s, i) {
      var ok = i < last ? !stepProblems(checks, i).length : checks.every(function (c) { return c.ok; });
      var reach = i <= S.step || i <= bad;
      return '<li><button type="button" data-act="goto" data-i="' + i + '"' + (i === S.step ? ' aria-current="step"' : "") +
        (reach ? "" : " disabled") + ">" + (i + 1) + ' <span class="lbl">' + esc(s.title) + "</span>" +
        (ok && i < last ? '<span class="tick" aria-label="(complete)">✓</span>' : "") + "</button></li>";
    }).join("");

    var tally = $("wzTally");
    if (tally) tally.innerHTML = tallyHtml(STEPS[S.step].key, d, p, checks);

    var probs = S.step === last
      ? [].concat.apply([], checks.filter(function (c) { return !c.ok; }).map(function (c) { return c.problems; }))
      : stepProblems(checks, S.step);
    var todo = $("wzTodo");
    todo.classList.toggle("is-ok", !probs.length);
    todo.innerHTML = probs.length
      ? "<h3>Still to do" + (S.step === last ? "" : " in this step") + "</h3><ul>" + probs.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>"
      : "<p>" + (S.step === last ? "Every rule is met. You can send your hunter to the Storyteller." : "This step is complete.") + "</p>";

    var nav = (S.step > 0 ? '<button type="button" class="btn btn--ghost" data-act="back">&larr; Back</button>' : "") + '<span class="spacer"></span>';
    if (S.step < last) {
      nav += '<button type="button" class="btn" data-act="next" aria-describedby="wzTodo"' + (probs.length ? " disabled" : "") + ">Next: " +
        esc(STEPS[S.step + 1].title) + " &rarr;</button>";
    } else {
      nav += '<button type="button" class="btn" data-act="send" aria-describedby="wzTodo"' + (probs.length || S.busy ? " disabled" : "") +
        ">Send to the Storyteller</button>";
    }
    $("wzNav").innerHTML = nav;

    if (S.step === last) {
      var cl = $("wzChecklist");
      if (cl) cl.innerHTML = checklistHtml(checks);
    }
  }

  function cell(cls, html) { return '<span class="tally-cell ' + cls + '">' + html + "</span>"; }
  function countCell(lbl, have, need) {
    return cell(have === need ? "ok" : have < need ? "short" : "over", esc(lbl) + " <b>" + have + "</b> of " + need);
  }

  function tallyHtml(key, d, p, checks) {
    var h = "";
    if (key === "attributes") {
      var al = levels(d.attributes, ATTR_KEYS);
      [4, 3, 2, 1].forEach(function (L) { h += countCell("At " + L + ":", (al[L] || []).length, ATTR_NEED[L]); });
      if ((al[5] || []).length) h += cell("over", "At 5: <b>" + al[5].length + "</b> (none allowed)");
      h += cell("info", "Health " + Math.min(10, d.attributes.stamina + 3) + " · Willpower " + Math.min(10, d.attributes.composure + d.attributes.resolve));
    } else if (key === "skills") {
      var dist = DISTS.filter(function (x) { return x.key === d._creation.skillDist; })[0];
      var sl = levels(d.skills, ALL_SKILLS);
      if (!dist) return cell("short", "Choose a distribution first");
      for (var L = 5; L >= 1; L--) {
        var have = (sl[L] || []).length, need = dist.need[L] || 0;
        if (need || have) h += countCell("At " + L + ":", have, need);
      }
      h += cell("info", "At 0: <b>" + (sl[0] || []).length + "</b>");
    } else if (key === "specialties") {
      var expected = NEEDS_SPECIALTY.filter(function (k) { return d.skills[k] > 0; }).length + 1;
      h += countCell("Specialties:", d.specialties.length, expected);
    } else if (key === "edges") {
      var nE = d.edges.length, nP = d.edges.reduce(function (t, e) { return t + e.perks.length; }, 0);
      var ok = (nE === 1 && nP === 2) || (nE === 2 && nP === 1);
      h += cell(ok ? "ok" : nE > 2 ? "over" : "short", "Edges <b>" + nE + "</b>");
      h += cell(ok ? "ok" : (nE && nP > 3 - nE) ? "over" : "short", "Perks <b>" + nP + "</b>" + (nE === 1 || nE === 2 ? " of " + (3 - nE) : ""));
    } else if (key === "advantages") {
      var m = 0, f = 0;
      d.advantages.forEach(function (a) {
        var rule = R.loaded ? findAdvantage(a.name) : null;
        if (rule ? rule.type === "Flaw" : /\(flaw\)/i.test(a.name)) f += a.dots; else m += a.dots;
      });
      h += countCell("Merits and Backgrounds:", m, ADV_DOTS) + countCell("Flaws:", f, FLAW_DOTS);
    } else if (key === "details") {
      var n = parseTouchstones(p.touchstones).length;
      h += cell(n >= 1 && n <= MAX_TOUCHSTONES ? "ok" : n ? "over" : "short", "Touchstones <b>" + n + "</b> (one to three)");
    } else if (key === "review") {
      var met = checks.filter(function (c) { return c.ok; }).length;
      h += cell(met === checks.length ? "ok" : "short", "Rules met <b>" + met + "</b> of " + checks.length);
    }
    return h;
  }

  function stepHead(i, intro) {
    return '<h2 class="wz-title"><small>Step ' + (i + 1) + " of " + STEPS.length + "</small>" + esc(STEPS[i].title) + "</h2>" +
      (intro ? '<p class="wz-intro">' + intro + "</p>" : "") + '<div class="tally" id="wzTally" role="status" aria-live="polite"></div>';
  }
  function input(bind, value, lbl, extra) {
    return '<input data-bind="' + bind + '" value="' + esc(value) + '" aria-label="' + esc(lbl) + '"' + (extra || "") + ">";
  }
  function editField(name, bind, value, cls, extra) {
    return '<div class="field ' + (cls || "") + '"><b>' + esc(name) + "</b>" + input(bind, value, name, extra) + "</div>";
  }
  function selectField(name, bind, value, options) {
    var known = options.some(function (o) { return o === value; });
    return '<div class="field"><b>' + esc(name) + '</b><select data-bind="' + bind + '" aria-label="' + esc(name) + '">' +
      '<option value=""' + (value ? "" : " selected") + ">Choose…</option>" +
      (value && !known ? '<option selected value="' + esc(value) + '">' + esc(value) + "</option>" : "") +
      options.map(function (o) { return "<option" + (o === value ? " selected" : "") + ' value="' + esc(o) + '">' + esc(o) + "</option>"; }).join("") +
      "</select></div>";
  }

  function stepHtml(key, d, p) {
    var c = d._creation, i = S.step, h = "";
    if (key === "concept") {
      h += '<section class="page">' + stepHead(i, "Who is your hunter? Choose a Creed (how they hunt) and a Drive (why they hunt). Choosing a Drive fills in its Redemption; you may put it in your own words.");
      h += '<div class="sheet-head"><div class="sheet-band"><strong>Hunter</strong><span>The Reckoning</span></div><div class="sheet-ident">' +
        editField("Name", "data.name", d.name, "", ' maxlength="120" autocomplete="off"') +
        editField("Concept", "data.concept", d.concept, "", ' maxlength="120" placeholder="e.g. Disgraced paramedic"') +
        (R.loaded ? selectField("Creed", "data.creed", d.creed, R.creeds.map(function (x) { return x.name; }))
                  : editField("Creed", "data.creed", d.creed)) +
        roField("Cell", CELL) +
        (R.loaded ? selectField("Drive", "data.drive", d.drive, R.drives.map(function (x) { return x.name; }))
                  : editField("Drive", "data.drive", d.drive)) +
        editField("Redemption", "data.redemption", d.redemption, "full") +
        editField("Ambition", "play.ambition", p.ambition, "full", ' placeholder="The long-term goal"') +
        editField("Desire", "play.desire", p.desire, "full", ' placeholder="Something wanted soon"') +
        "</div></div>";
      var cr = findCreed(d.creed), dr = findDrive(d.drive);
      if (R.loaded) {
        h += '<div class="wz-grid2"><div class="wz-help"><h4>Creed' + (cr ? ": " + esc(cr.name) : "") + "</h4>" +
          (cr ? "<p>" + esc(cr.summary) + "</p><p><b>Creed field:</b> " + esc(cr.creed_field) + "</p>" +
                "<p><b>Suggested Edges:</b> " + esc((cr.suggested_edges || []).join(", ") || "—") + "</p>" +
                "<p><b>Typical Drives:</b> " + esc((cr.typical_drives || []).join(", ") || "—") + "</p>"
              : '<p class="muted">The ' + creedsWord() + ' Creeds: ' + esc(listNames(R.creeds.map(function (x) { return x.name; }))) + ". Choose one to read about it.</p>") +
          "</div>";
        h += '<div class="wz-help"><h4>Drive' + (dr ? ": " + esc(dr.name) : "") + "</h4>" +
          (dr ? "<p>" + esc(dr.summary) + "</p><p><b>Redemption:</b> " + esc(dr.redemption) + "</p>"
              : '<p class="muted">Choose a Drive to read about it.' + (cr && (cr.typical_drives || []).length ? " " + esc(cr.name) + " hunters often have " + esc(listNames(cr.typical_drives)) + "." : "") + "</p>") +
          "</div></div>";
      }
      h += '<label class="wz-label" for="creedNotes">Creed field notes <small>(optional: how the Creed shows in your hunter)</small></label>' +
        '<textarea id="creedNotes" data-bind="c.creedNotes" rows="3">' + esc(c.creedNotes) + "</textarea></section>";
    }

    else if (key === "attributes") {
      h += '<section class="page">' + stepHead(i, "Put one Attribute at 4, three at 3, four at 2 and one at 1. Click a dot to set the level; click the last filled dot to take one off. Health and Willpower follow from them.");
      h += '<div class="cols3">';
      ATTRS.forEach(function (g) {
        h += "<div><h4>" + g[0] + "</h4>";
        g[1].forEach(function (k) {
          h += traitHtml(label(k), "", d.attributes[k], { act: "dot", attrs: 'data-grp="attributes" data-key="' + k + '"', label: label(k), min: 1 });
        });
        h += "</div>";
      });
      h += "</div></section>";
    }

    else if (key === "skills") {
      h += '<section class="page">' + stepHead(i, "First choose how to spread your Skills, then give them dots to match exactly. Every other Skill stays at 0.");
      h += '<div class="dist-pick" role="radiogroup" aria-label="Skill distribution">' + DISTS.map(function (x) {
        var on = c.skillDist === x.key;
        return '<label class="' + (on ? "on" : "") + '"><input type="radio" name="dist" value="' + x.key + '"' + (on ? " checked" : "") +
          "><b>" + esc(x.name) + "</b><small>" + esc(x.text) + "</small></label>";
      }).join("") + "</div>";
      h += '<div class="cols3 skills">';
      SKILLS.forEach(function (col, gi) {
        h += "<div><h4>" + SKILL_GROUPS[gi] + "</h4>";
        col.forEach(function (k) {
          h += traitHtml(label(k), NEEDS_SPECIALTY.indexOf(k) >= 0 ? "Needs a Specialty if it has dots" : "", d.skills[k],
            { act: "dot", attrs: 'data-grp="skills" data-key="' + k + '"', label: label(k), min: 0 });
        });
        h += "</div>";
      });
      h += "</div></section>";
    }

    else if (key === "specialties") {
      var withDots = NEEDS_SPECIALTY.filter(function (k) { return d.skills[k] > 0; });
      var dotted = ALL_SKILLS.filter(function (k) { return d.skills[k] > 0; });
      h += '<section class="page">' + stepHead(i, "A Specialty narrows a Skill to something your hunter is especially good at, such as Firearms (Shotguns). " +
        (withDots.length ? esc(listNames(withDots.map(label))) + (withDots.length === 1 ? " has" : " have") +
          " dots, so " + (withDots.length === 1 ? "it gets" : "each gets") + " a free Specialty of its own. " : "") +
        "You also get one more free Specialty in any Skill with dots.");
      h += '<div class="spec-rows">';
      withDots.forEach(function (k) {
        h += '<div class="spec-row"><b>' + esc(label(k)) + " " + d.skills[k] + "<small>Required for this Skill</small></b>" +
          '<input data-spec="req" data-key="' + k + '" value="' + esc(c.spec.req[k]) + '" maxlength="80" aria-label="Specialty in ' + esc(label(k)) + '" placeholder="e.g. ' +
          esc({ academics: "History", craft: "Carpentry", performance: "Singing", science: "Chemistry" }[k]) + '"></div>';
      });
      h += '<div class="spec-row"><b>Your free choice<small>Any Skill with dots</small></b><div class="wz-grid2">' +
        '<select data-spec="free-skill" aria-label="Skill for your free Specialty"><option value="">Choose a Skill…</option>' +
        (c.spec.free.skill && dotted.indexOf(c.spec.free.skill) < 0 && ALL_SKILLS.indexOf(c.spec.free.skill) >= 0
          ? '<option selected value="' + esc(c.spec.free.skill) + '">' + esc(label(c.spec.free.skill)) + " (no dots)</option>" : "") +
        dotted.map(function (k) {
          return '<option value="' + k + '"' + (k === c.spec.free.skill ? " selected" : "") + ">" + esc(label(k)) + " " + d.skills[k] + "</option>";
        }).join("") + "</select>" +
        '<input data-spec="free-name" value="' + esc(c.spec.free.name) + '" maxlength="80" aria-label="Name of your free Specialty" placeholder="e.g. Shotguns"></div></div>';
      h += "</div></section>";
    }

    else if (key === "edges") {
      var cr2 = findCreed(d.creed);
      h += '<section class="page">' + stepHead(i, "Edges are what your hunter brings to the Hunt: gear, knacks or something stranger. Take one Edge with two Perks, or two Edges with one Perk. Perks belong to an Edge you have.");
      if (cr2 && (cr2.suggested_edges || []).length) {
        h += '<p class="wz-muted" style="margin-top:0">Suggested for the ' + esc(cr2.name) + " Creed: " + esc(listNames(cr2.suggested_edges)) + ".</p>";
      }
      if (R.loaded) {
        d.edges.forEach(function (e, ei) {
          var rule = findEdge(e);
          h += '<div class="pick-card"><div class="pick-card-top"><b>' + esc(e.name) + "</b>" +
            '<span><span class="tag">' + esc(rule ? rule.category + (rule.lineage ? " · " + rule.lineage : "") : "Not in the list") + "</span> " +
            '<button type="button" class="mini" data-act="del-edge" data-i="' + ei + '">Remove</button></span></div>' + edgeRulesHtml(rule);
          var perks = perksOf(rule);
          if (perks.length) {
            h += '<div class="perk-checks" role="group" aria-label="Perks of ' + esc(e.name) + '">' + perks.map(function (pk) {
              var on = e.perks.some(function (x) { var m = findPerk(rule, x); return m && m.key === pk.key; });
              return '<label><input type="checkbox" data-perk data-i="' + ei + '" value="' + esc(pk.key) + '"' + (on ? " checked" : "") +
                "><span>" + esc(pk.name) + "<small>" + esc(pk.summary) + "</small></span></label>";
            }).join("") + "</div>";
          }
          h += "</div>";
        });
        if (d.edges.length < 2) {
          var owned = {};
          d.edges.forEach(function (e) { var r = findEdge(e); if (r) owned[r.key] = true; });
          h += '<div class="add-row"><select data-add-edge aria-label="Add an Edge"><option value="">' +
            (d.edges.length ? "Add a second Edge…" : "Choose an Edge…") + "</option>" + edgeOptions(owned) + "</select></div>";
        } else {
          h += '<p class="wz-muted">Two Edges is the most at creation. Remove one to choose another.</p>';
        }
      } else {
        h += '<table class="grid-table"><tr><th style="width:45%">Edge</th><th>Perks <small>(separated by semicolons)</small></th><th></th></tr>';
        d.edges.forEach(function (e, ei) {
          h += '<tr><td><input data-edge-f="name" data-i="' + ei + '" value="' + esc(e.name) + '" aria-label="Edge"></td>' +
            '<td><input data-edge-f="perks" data-i="' + ei + '" value="' + esc(e.perks.join("; ")) + '" aria-label="Perks, separated by semicolons"></td>' +
            '<td><button type="button" class="mini" data-act="del-edge" data-i="' + ei + '">Remove</button></td></tr>';
        });
        h += "</table>" + (d.edges.length < 2 ? '<p><button type="button" class="mini" data-act="add-edge-row">+ Edge</button></p>' : "");
      }
      h += "</section>";
    }

    else if (key === "advantages") {
      h += '<section class="page">' + stepHead(i, "Spend exactly seven dots on Merits and Backgrounds, and take exactly two dots of Flaws. Some can be taken more than once; add a detail to tell them apart (Allies - a court clerk).");
      h += '<h3>Merits and Backgrounds</h3>' + advRows(c, false);
      h += '<h3>Flaws</h3>' + advRows(c, true);
      h += "</section>";
    }

    else if (key === "details") {
      h += '<section class="page">' + stepHead(i, "Touchstones are the people your hunter holds on to and fights for: one to three of them, each with a line on who they are. The rest is optional.");
      h += "<h3>Touchstones</h3>";
      c.touchstones.forEach(function (t, ti) {
        h += '<div class="ts-row"><input data-ts="name" data-i="' + ti + '" value="' + esc(t.name) + '" maxlength="80" aria-label="Touchstone ' + (ti + 1) + ': name" placeholder="Name">' +
          '<input data-ts="who" data-i="' + ti + '" value="' + esc(t.who) + '" maxlength="200" aria-label="Touchstone ' + (ti + 1) + ': who they are" placeholder="Who they are, e.g. my younger sister, a nurse at Kings County">' +
          (c.touchstones.length > 1 ? '<button type="button" class="mini" data-act="del-ts" data-i="' + ti + '">Remove</button>' : "<span></span>") + "</div>";
      });
      if (c.touchstones.length < MAX_TOUCHSTONES) h += '<p><button type="button" class="mini" data-act="add-ts">+ Touchstone</button></p>';
      h += '<h3>Details <small class="wz-muted" style="font-size:.8rem;text-transform:none">optional</small></h3>' +
        '<div class="wz-grid2"><div><label class="wz-label" for="dAge">Age</label><input id="dAge" data-bind="play.age" value="' + esc(p.age) + '" maxlength="40"></div>' +
        '<div><label class="wz-label" for="dDob">Date of birth</label><input id="dDob" data-bind="play.dob" value="' + esc(p.dob) + '" maxlength="40"></div></div>' +
        '<label class="wz-label" for="dApp">Appearance</label><textarea id="dApp" data-bind="play.appearance" rows="3">' + esc(p.appearance) + "</textarea>" +
        '<label class="wz-label" for="dFeat">Distinguishing features</label><textarea id="dFeat" data-bind="play.features" rows="2">' + esc(p.features) + "</textarea>" +
        '<label class="wz-label" for="dHist">History</label><textarea id="dHist" data-bind="play.history" rows="7">' + esc(p.history) + "</textarea>";
      h += "</section>";
    }

    else if (key === "review") {
      h += '<section class="page">' + stepHead(i, "This is your hunter as the Storyteller will see it. Go back to any step to change something. When every rule below is ticked, send it.") + "</section>";
      h += sheetHtml(d, p);
      h += '<section class="xp-panel" aria-labelledby="clTitle"><h2 id="clTitle">The rules</h2><div id="wzChecklist"></div></section>';
    }
    return h;
  }

  function advRows(c, flaws) {
    var h = "";
    c.advs.forEach(function (a, ai) {
      var rule = a.key ? advByKey(a.key) : null;
      var isFlaw = rule ? rule.type === "Flaw" : a.flaw;
      if (isFlaw !== flaws) return;
      var title = rule ? rule.name : "";
      h += '<div class="pick-card"><div class="pick-card-top">' +
        (rule ? "<b>" + esc(title) + '</b><span><span class="tag">' + esc(rule.type + " · " + rule.dots) + "</span> "
              : '<input data-adv-f="name" data-i="' + ai + '" value="' + esc(a.name) + '" aria-label="Name" placeholder="Name" style="flex:1"><span>') +
        '<button type="button" class="mini" data-act="del-adv" data-i="' + ai + '">Remove</button></span></div>' +
        '<div class="adv-line"><input data-adv-f="detail" data-i="' + ai + '" value="' + esc(a.detail) + '" maxlength="60" aria-label="Detail (optional)" placeholder="Detail (optional)">' +
        dotsHtml(a.dots, { act: "adv-dot", attrs: 'data-i="' + ai + '"', label: (title || a.name || "Advantage"), min: 0 }) + "</div>" +
        (rule ? '<div class="adv-sum">' + esc(rule.summary) + (rule.grp && rule.grp !== rule.name ? " <i>(" + esc(rule.grp) + ")</i>" : "") + "</div>" : "") +
        "</div>";
    });
    if (R.loaded) {
      h += '<div class="add-row"><select data-add-adv="' + (flaws ? "flaw" : "merit") + '" aria-label="' + (flaws ? "Add a Flaw" : "Add a Merit or Background") + '">' +
        '<option value="">' + (flaws ? "Add a Flaw…" : "Add a Merit or Background…") + "</option>" +
        advantageOptions(flaws ? ["Flaw"] : ["Merit", "Background"]) + "</select></div>";
    } else {
      h += '<p><button type="button" class="mini" data-act="add-adv-row" data-flaw="' + (flaws ? "1" : "") + '">+ ' + (flaws ? "Flaw" : "Merit or Background") + "</button></p>";
    }
    return h;
  }

  function rerender() {
    var y = window.scrollY;
    $("wzStep").innerHTML = stepHtml(STEPS[S.step].key, S.D.data, S.D.play);
    refresh();
    window.scrollTo(0, y);
  }
  function changed(full) {
    sync();
    S.dirty = true;
    if (full) rerender(); else refresh();
  }

  function moveTo(i) {
    if (i === S.step) return;
    var checks = validate(S.D.data, S.D.play);
    if (i > S.step && i > firstBadStep(checks)) return;
    S.step = i;
    sync();
    renderWizard();
    var top = $("wzSteps");
    if (top) top.scrollIntoView({ block: "start" });
    save();
  }

  /* -------------------------------------------------------------- saving */
  function save() {
    S.saveChain = S.saveChain.then(doSave, doSave);
    return S.saveChain;
  }
  async function doSave() {
    if (S.mode !== "wizard") return false;
    sync();
    var d = S.D.data;
    setStatus("Saving…");
    try {
      var r = await db.rpc("save_draft", {
        p_id: S.row.id || null, p_chronicle: CHRONICLE, p_name: d.name.trim(),
        p_data: clone(d), p_play: clone(S.D.play)
      });
      if (r.error) throw r.error;
      if (!S.row.id && r.data) {
        S.row.id = r.data;
        try { window.history.replaceState(null, "", window.location.pathname + "?edit=" + r.data); } catch (e) { /* ignore */ }
      }
      S.row.status = "draft";
      S.dirty = false;
      setStatus("Saved.");
      return true;
    } catch (e) {
      console.error(e);
      setStatus("Not saved: " + errText(e), true);
      toast("Not saved: " + errText(e));
      return false;
    }
  }

  async function send() {
    var checks = validate(S.D.data, S.D.play);
    if (!checks.every(function (c) { return c.ok; })) { refresh(); return; }
    if (!window.confirm("Send " + (S.D.data.name.trim() || "this hunter") + " to the Storyteller? You cannot change it while it waits, unless you withdraw it.")) return;
    S.busy = true; refresh();
    var ok = await save();
    if (!ok) { S.busy = false; refresh(); return; }
    try {
      var r = await db.rpc("submit_draft", { p_id: S.row.id });
      if (r.error) throw r.error;
      S.dirty = false;
      toast("Sent. The Storyteller will look at it.");
      go("?sent=" + S.row.id);
    } catch (e) {
      console.error(e);
      setStatus("Not sent: " + errText(e), true);
      S.busy = false; refresh();
    }
  }

  /* ------------------------------------------------------------- review */
  function startReview(row) {
    S.mode = "review";
    S.row = row;
    S.D = shape(row.data, row.play);
    renderReview();
  }

  function suggestSlug(name) {
    var base = String(name || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    var first = base.split(/\s+/).filter(Boolean)[0] || "";
    var clean = function (s) { return s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, ""); };
    return { first: clean(first) || "hunter", full: clean(base) || "hunter" };
  }
  async function freeSlug(name) {
    var s = suggestSlug(name), taken = {};
    try {
      var r = await db.from("character_sheets").select("slug");
      if (!r.error) (r.data || []).forEach(function (x) { taken[x.slug] = true; });
    } catch (e) { /* the Storyteller can still type one */ }
    if (!taken[s.first]) return s.first;
    if (!taken[s.full]) return s.full;
    for (var n = 2; n < 100; n++) { var t = (s.first.slice(0, 36) + "-" + n); if (!taken[t]) return t; }
    return s.full;
  }

  function renderReview() {
    var row = S.row, d = S.D.data, p = S.D.play;
    var checks = validate(d, p, { review: true });
    var broken = checks.filter(function (c) { return !c.ok; }).length;
    var own = mine(row), st = S.role === "storyteller";
    var h = '<div class="sheet-bar"><a class="btn btn--ghost" href="' + esc(window.location.pathname) + '">&larr; ' + (st ? "Characters" : "Your characters") + "</a>" +
      '<span class="sheet-status" id="wzStatus" role="status" aria-live="polite"></span><span class="spacer"></span>';
    if (own && (row.status === "draft" || row.status === "rejected")) h += '<a class="btn" href="?edit=' + row.id + '">Continue</a>';
    if (own && row.status === "submitted") h += '<button type="button" class="btn btn--ghost" data-act="withdraw" data-id="' + row.id + '">Withdraw to change it</button>';
    h += "</div>";

    h += '<section class="xp-panel review-head" aria-labelledby="rvTitle"><h2 id="rvTitle">' + esc(d.name || row.name || "Unnamed hunter") + pill(row.status) + "</h2><dl>" +
      "<dt>Made by</dt><dd>" + esc(row.email) + (own ? " (you)" : "") + "</dd>" +
      "<dt>Started</dt><dd>" + esc(fmtDate(row.created_at)) + "</dd>" +
      "<dt>Last saved</dt><dd>" + esc(fmtDate(row.updated_at)) + "</dd>" +
      (row.submitted_at ? "<dt>Sent</dt><dd>" + esc(fmtDate(row.submitted_at)) + "</dd>" : "") +
      (row.decided_at ? "<dt>Decided</dt><dd>" + esc(fmtDate(row.decided_at)) + "</dd>" : "") +
      (row.note ? "<dt>Storyteller&rsquo;s note</dt><dd style=\"white-space:pre-wrap\">" + esc(row.note) + "</dd>" : "") +
      "</dl>";
    if (row.status === "approved" && row.sheet_slug) {
      h += '<div class="done-box">Approved. The character sheet is at <a href="sheet.html?c=' + encodeURIComponent(row.sheet_slug) + '">sheet.html?c=' +
        esc(row.sheet_slug) + "</a>.</div>";
    } else if (row.status === "submitted" && !st) {
      h += '<p class="xp-hint">This hunter is waiting for the Storyteller. To change it, withdraw it first.</p>';
    } else if ((row.status === "draft" || row.status === "rejected") && !own) {
      h += '<p class="xp-hint">Still being made by the player: read-only.</p>';
    }
    h += "</section>";

    h += '<section class="xp-panel" aria-labelledby="clTitle"><h2 id="clTitle">The rules' +
      (broken ? ' <span class="pill pill-rejected">' + nw(broken) + (broken === 1 ? " broken" : " broken") + "</span>" : ' <span class="pill pill-approved">all met</span>') +
      "</h2>" + (st ? '<p class="xp-hint">Checked again here from the saved sheet, whatever the player&rsquo;s page said.</p>' : "") +
      checklistHtml(checks) + "</section>";

    if (st && row.status === "submitted") {
      h += '<section class="xp-panel" aria-labelledby="decTitle"><h2 id="decTitle">Your decision</h2>' +
        "<h3>Approve</h3><p class=\"xp-hint\">Approving creates the character sheet, owned by " + esc(row.email) +
        ". Choose its short name: it becomes the sheet&rsquo;s address, sheet.html?c=<i>short-name</i> (a&ndash;z, 0&ndash;9 and dashes, up to 40).</p>" +
        '<form class="xp-form" id="approveForm"><label>Short name<input name="slug" id="approveSlug" required maxlength="40" pattern="[a-z0-9\\-]{1,40}" autocomplete="off"></label>' +
        '<label class="grow">Note for the player (optional)<input name="note" maxlength="1000"></label>' +
        '<button class="btn" type="submit">Approve and create the sheet</button></form>' +
        "<h3>Send back</h3><p class=\"xp-hint\">The player sees your note, changes the hunter and sends it again.</p>" +
        '<form class="xp-form" id="rejectForm"><label class="grow">What needs changing<textarea name="note" required maxlength="1000"></textarea></label>' +
        '<button class="btn btn--ghost" type="submit">Send back</button></form></section>';
    }

    h += sheetHtml(d, p);
    $("create").innerHTML = h;

    if (st && row.status === "submitted") {
      freeSlug(d.name || row.name).then(function (s) { var el = $("approveSlug"); if (el && !el.value) el.value = s; });
    }
  }

  async function approve(form) {
    var slug = form.slug.value.trim().toLowerCase();
    if (!/^[a-z0-9-]{1,40}$/.test(slug)) { setStatus("The short name may use a–z, 0–9 and dashes only, up to 40.", true); return; }
    var broken = validate(S.D.data, S.D.play, { review: true }).filter(function (c) { return !c.ok; }).length;
    var msg = broken
      ? "This hunter breaks " + nw(broken) + (broken === 1 ? " rule" : " rules") + " (shown in red). Approve it anyway, as sheet.html?c=" + slug + "?"
      : "Approve " + (S.row.name || "this hunter") + " and create the sheet sheet.html?c=" + slug + "?";
    if (!window.confirm(msg)) return;
    await act("approve_draft", { p_id: S.row.id, p_slug: slug, p_note: form.note.value.trim() }, "Approved. The sheet is ready.");
  }
  async function reject(form) {
    var note = form.note.value.trim();
    if (!note) { setStatus("Write a note so the player knows what to change.", true); return; }
    await act("reject_draft", { p_id: S.row.id, p_note: note }, "Sent back to the player with your note.");
  }

  async function act(fn, args, done) {
    if (S.busy) return;
    S.busy = true;
    setStatus("Working…");
    try {
      var r = await db.rpc(fn, args);
      if (r.error) throw r.error;
      toast(done);
      S.busy = false;
      await route();
    } catch (e) {
      console.error(e);
      S.busy = false;
      setStatus(errText(e), true);
      window.alert(errText(e));
    }
  }

  async function listAct(kind, id) {
    var row = S.drafts.filter(function (r) { return String(r.id) === String(id); })[0] || S.row;
    var name = (row && row.name) || "this hunter";
    if (kind === "delete" && !window.confirm("Delete " + name + "? This cannot be undone.")) return;
    if (kind === "withdraw" && !window.confirm("Withdraw " + name + " from the Storyteller so you can change it?")) return;
    try {
      var r = await db.rpc(kind === "delete" ? "delete_draft" : "withdraw_draft", { p_id: +id });
      if (r.error) throw r.error;
      toast(kind === "delete" ? "Deleted." : "Withdrawn. You can change it now.");
      if (kind === "withdraw" && S.mode === "review") { go("?edit=" + id); return; }
      if (S.mode !== "list") { go(""); return; }
      await loadDrafts();
      renderList();
    } catch (e) {
      console.error(e);
      window.alert(errText(e));
    }
  }

  /* -------------------------------------------------------------- events */
  function setPath(path, value) {
    var parts = path.split("."), obj = parts[0] === "c" ? S.D.data._creation : S.D[parts[0]];
    obj[parts[1]] = value;
  }

  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]");
    if (!b || !$("create").contains(b) || b.disabled) return;
    var a = b.getAttribute("data-act");
    if (a === "withdraw" || a === "delete") { listAct(a, b.getAttribute("data-id")); return; }
    if (S.mode !== "wizard") return;
    var d = S.D.data, c = d._creation, i = +b.getAttribute("data-i");

    if (a === "dot") {
      var grp = d[b.getAttribute("data-grp")], key = b.getAttribute("data-key"), n = +b.getAttribute("data-n");
      var min = b.getAttribute("data-grp") === "attributes" ? 1 : 0;
      grp[key] = Math.max(min, grp[key] === n ? n - 1 : n);
      changed(true);
    } else if (a === "adv-dot") {
      var adv = c.advs[i], m = +b.getAttribute("data-n");
      adv.dots = adv.dots === m ? m - 1 : m;
      changed(true);
    } else if (a === "del-edge") {
      d.edges.splice(i, 1); changed(true);
    } else if (a === "add-edge-row") {
      d.edges.push({ name: "", perks: [], notes: "" }); changed(true);
    } else if (a === "del-adv") {
      c.advs.splice(i, 1); changed(true);
    } else if (a === "add-adv-row") {
      c.advs.push({ key: "", name: "", flaw: !!b.getAttribute("data-flaw"), detail: "", dots: 1 }); changed(true);
    } else if (a === "add-ts") {
      if (c.touchstones.length < MAX_TOUCHSTONES) c.touchstones.push({ name: "", who: "" });
      changed(true);
    } else if (a === "del-ts") {
      c.touchstones.splice(i, 1);
      if (!c.touchstones.length) c.touchstones.push({ name: "", who: "" });
      changed(true);
    } else if (a === "next") {
      moveTo(S.step + 1);
    } else if (a === "back") {
      moveTo(S.step - 1);
    } else if (a === "goto") {
      moveTo(i);
    } else if (a === "save") {
      save().then(function (ok) { if (ok) toast("Draft saved."); });
    } else if (a === "send") {
      send();
    }
  });

  document.addEventListener("input", function (e) {
    var t = e.target;
    if (S.mode !== "wizard" || !$("create").contains(t)) return;
    var d = S.D.data, c = d._creation, i = +t.getAttribute("data-i");
    if (t.matches("input[data-bind], textarea[data-bind]")) setPath(t.getAttribute("data-bind"), t.value);
    else if (t.matches("input[data-spec='req']")) c.spec.req[t.getAttribute("data-key")] = t.value;
    else if (t.matches("input[data-spec='free-name']")) c.spec.free.name = t.value;
    else if (t.matches("input[data-ts]")) c.touchstones[i][t.getAttribute("data-ts")] = t.value;
    else if (t.matches("input[data-adv-f]")) c.advs[i][t.getAttribute("data-adv-f")] = t.value;
    else if (t.matches("input[data-edge-f]")) {
      if (t.getAttribute("data-edge-f") === "perks") d.edges[i].perks = t.value.split(/\s*;\s*/).filter(Boolean);
      else { d.edges[i].name = t.value; delete d.edges[i].key; }
    } else return;
    changed(false);
  });

  document.addEventListener("change", function (e) {
    var t = e.target;
    if (S.mode !== "wizard" || !$("create").contains(t)) return;
    var d = S.D.data, c = d._creation, i = +t.getAttribute("data-i");
    if (t.matches("select[data-bind]")) {
      var path = t.getAttribute("data-bind");
      if (path === "data.drive") {
        // Fill in the Redemption, unless the player has written their own.
        var before = findDrive(d.drive), after = findDrive(t.value);
        if (after && (!d.redemption.trim() || (before && d.redemption.trim() === before.redemption))) d.redemption = after.redemption;
      }
      setPath(path, t.value);
      changed(true);
    } else if (t.matches("input[name='dist']")) {
      c.skillDist = t.value; changed(true);
    } else if (t.matches("select[data-spec='free-skill']")) {
      c.spec.free.skill = t.value; changed(false);
    } else if (t.matches("select[data-add-edge]")) {
      var rule = edgeByKey(t.value);
      if (rule && d.edges.length < 2) d.edges.push({ name: rule.name, key: rule.key, perks: [], notes: "" });
      changed(true);
    } else if (t.matches("input[data-perk]")) {
      var row = d.edges[i], er = findEdge(row);
      var perk = perksOf(er).filter(function (pk) { return pk.key === t.value; })[0];
      if (!perk) return;
      if (t.checked) row.perks.push(perk.name);
      else row.perks = row.perks.filter(function (x) { var m = findPerk(er, x); return !(m && m.key === perk.key); });
      changed(false);
    } else if (t.matches("select[data-add-adv]")) {
      var ar = advByKey(t.value);
      if (ar) c.advs.push({ key: ar.key, name: "", flaw: ar.type === "Flaw", detail: "", dots: advMin(ar) });
      changed(true);
    }
  });

  document.addEventListener("submit", function (e) {
    if (e.target.id === "approveForm") { e.preventDefault(); approve(e.target); }
    else if (e.target.id === "rejectForm") { e.preventDefault(); reject(e.target); }
  });

  window.addEventListener("beforeunload", function (e) {
    if (S.mode === "wizard" && S.dirty) { e.preventDefault(); e.returnValue = ""; }
  });

  /* ------------------------------------------------------------- routing */
  async function loadRow(id) {
    var r = await db.from("character_drafts").select("*").eq("id", id).maybeSingle();
    if (r.error) throw r.error;
    return r.data;
  }

  function notFound(msg) {
    S.mode = "list";
    $("create").innerHTML = '<div class="sheet-notice">' + esc(msg) + ' <a href="' + esc(window.location.pathname) + '">Back to your characters</a>.</div>';
  }

  async function route() {
    var params = new URLSearchParams(window.location.search);
    var editId = params.get("edit"), reviewId = params.get("review");
    S.approved = null;
    try {
      if (params.has("new")) {
        await loadDrafts();
        if (unfinished() >= MAX_UNFINISHED) { S.mode = "list"; renderList(); toast("You already have five characters in progress. Finish or delete one first."); return; }
        startWizard({ id: null, status: "draft", email: S.me, note: "" });
      } else if (editId || reviewId) {
        var id = editId || reviewId;
        if (!/^\d+$/.test(id)) return notFound("There is no character at this address.");
        var row = await loadRow(+id);
        if (!row) return notFound("There is no character at this address, or it is not yours to see.");
        if (editId && mine(row) && (row.status === "draft" || row.status === "rejected")) startWizard(row);
        else startReview(row);
      } else {
        S.mode = "list";
        await loadDrafts();
        renderList();
        if (params.has("sent")) {
          toast("Sent. The Storyteller will look at it.");
          try { window.history.replaceState(null, "", window.location.pathname); } catch (e) { /* ignore */ }
        }
      }
    } catch (e) {
      console.error(e);
      $("create").innerHTML = '<div class="sheet-notice">Your characters could not be loaded just now (' + esc(errText(e)) + "). Try again in a moment.</div>";
    }
  }

  async function start(g) {
    db = g.db;
    S.me = String(g.email || "").toLowerCase();
    S.role = g.role === "storyteller" ? "storyteller" : "player";
    await loadRules();
    await route();
  }

  if (!window.Gate || !window.Gate.ready) {
    var box = $("create");
    if (box) box.innerHTML = '<div class="sheet-notice">Signing in is not available just now. Try again later.</div>';
    return;
  }
  window.Gate.ready.then(start);
})();
