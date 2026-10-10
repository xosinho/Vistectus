/* =====================================================================
   Builders — the player options a world allows
   ---------------------------------------------------------------------
     BuilderOptions.mount(element, { game, worldId, options })
       -> Promise of { get(), summary() }

   Hunter    Creeds                 from the rules_creeds table
   Vampire   Clans and Bloodlines   from the Dark Ages rules data
   D&D       species and classes    from dnd/assets/data/rules-5e.js

   Everything is ticked to begin with. get() returns the value for
   worlds.options: {"creeds": [...]}, {"clans": [...]},
   {"species": [...], "classes": [...]}, leaving out a key whose list is
   all ticked (a missing key means "everything").
   ===================================================================== */
(function () {
  "use strict";

  var B = window.Builders;
  var esc = B.esc;
  var VAMPIRE_DATA = "../vtda/assets/data/rules-data.js?v=20261015";          // window.VAMPIRE_RULES
  var VAMPIRE_DATA_OLD = "../vtda/hungary-1242/crown-of-ice-and-bone/assets/data/rules-data.js";  // window.CROWN_RULES
  var DND_DATA = "../dnd/assets/data/rules-5e.js";
  var PHB = "Player's Handbook";

  function groupBySource(list) {
    var groups = {};
    list.forEach(function (x) {
      var src = String(x.source || "Other");
      if (/^Unearthed Arcana/i.test(src)) src = "Unearthed Arcana (playtest material)";
      (groups[src] = groups[src] || []).push(x);
    });
    return Object.keys(groups).sort(function (a, b) {
      if (a === PHB) return -1;
      if (b === PHB) return 1;
      var ua = /^Unearthed/.test(a), ub = /^Unearthed/.test(b);
      if (ua !== ub) return ua ? 1 : -1;
      return a.localeCompare(b);
    }).map(function (k) { return { title: k, items: groups[k] }; });
  }

  async function sectionsFor(game) {
    if (game === "hunter") {
      var rows = await B.q(B.client.from("rules_creeds").select("name,summary,url,sort").order("sort", { ascending: true }).order("name", { ascending: true }));
      if (!rows || !rows.length) throw new Error("The list of Creeds is empty in the database.");
      return [{ key: "creeds", title: "Creeds", one: "Creed",
        groups: [{ title: "Creeds", items: rows.map(function (r) { return { name: r.name, sub: r.summary, url: r.url }; }) }] }];
    }
    if (game === "vampire") {
      await B.loadScript(VAMPIRE_DATA).catch(function () { return B.loadScript(VAMPIRE_DATA_OLD); });
      var R = window.VAMPIRE_RULES || window.CROWN_RULES;
      var clans = (R && R.clans) || [];
      if (!clans.length) throw new Error("The list of clans could not be read.");
      var kinds = [["Clan", "Clans"], ["Bloodline", "Bloodlines"], ["Clanless", "Clanless"]];
      return [{ key: "clans", title: "Clans and Bloodlines", one: "clan",
        groups: kinds.map(function (k) {
          return { title: k[1], note: k[0] === "Clanless" ? "Caitiff are the clanless: Kindred whose blood shows no clan at all. Untick them to keep every character in a clan or bloodline." : "",
            items: clans.filter(function (c) { return c.kind === k[0]; }).map(function (c) {
              return { name: c.name, sub: (c.disciplines || []).length ? "Disciplines: " + c.disciplines.join(", ") : "" };
            }) };
        }).filter(function (g) { return g.items.length; }) }];
    }
    await B.loadScript(DND_DATA);
    var R = window.DND_RULES || {};
    if (!R.species || !R.classes) throw new Error("The D&D rules data could not be read.");
    return [
      { key: "species", title: "Species", one: "species", filter: true,
        groups: groupBySource(R.species.map(function (s) { return { name: s.name, url: s.url, source: s.source }; })) },
      { key: "classes", title: "Classes", one: "class", filter: true,
        groups: groupBySource(R.classes.map(function (c) { return { name: c.name, url: c.url, source: c.source, sub: c.hitDie ? "Hit die d" + c.hitDie : "" }; })) }
    ];
  }

  async function mount(el, o) {
    var game = o.game, opts = o.options || {};
    var g = B.game(game);
    var wiki = B.wikiFor(game, o.worldId);
    el.innerHTML = '<p class="hint">Loading the list…</p>';
    var sections;
    try { sections = await sectionsFor(game); }
    catch (e) {
      console.error(e);
      el.innerHTML = '<p class="form-status" data-kind="error">The list could not be loaded: ' + esc(B.errText(e)) +
        ". You can go on: the world then allows everything, and you can choose later in the workshop.</p>";
      return { get: function () { return opts; }, summary: function () { return "Everything (the list could not be loaded)."; }, failed: true };
    }

    var head = '<p class="wb-wiki">Rules: ' +
      (game === "vampire"
        ? '<a href="' + esc(wiki) + '" target="_blank" rel="noopener">the world’s own rules page</a> (members only, filled from the Storyteller’s notes once the world is on the site).'
        : '<a href="' + esc(wiki) + '" target="_blank" rel="noopener noreferrer">' + esc(g.wikiLabel) + "</a>. Each name below links to its page there.") + "</p>";
    var h = head;
    sections.forEach(function (s, si) {
      var chosen = Array.isArray(opts[s.key]) ? opts[s.key] : null;
      h += '<fieldset class="wb-opts" data-s="' + si + '"><legend>' + esc(s.title) + "</legend>" +
        '<div class="wb-opts__bar">' +
          (s.filter ? '<input type="search" class="wb-opts__filter" placeholder="Filter by name or book" aria-label="Filter the ' + esc(s.title.toLowerCase()) + '">' : "") +
          '<button type="button" class="linkbtn" data-o="all">Tick all</button>' +
          '<button type="button" class="linkbtn" data-o="none">Untick all</button>' +
          '<span class="wb-opts__count hint" aria-live="polite"></span>' +
        "</div>";
      s.groups.forEach(function (gr, gi) {
        h += '<div class="wb-opts__group" data-g="' + gi + '"><label class="wb-opts__gh"><input type="checkbox" data-o="group"> <strong>' + esc(gr.title) + "</strong> <span class=\"hint\">(" + gr.items.length + ")</span></label>" +
          (gr.note ? '<p class="hint wb-opts__note">' + esc(gr.note) + "</p>" : "") + '<ul class="wb-opts__list">';
        gr.items.forEach(function (it) {
          var on = chosen ? chosen.indexOf(it.name) !== -1 : true;
          var hay = (it.name + " " + (it.source || "") + " " + gr.title).toLowerCase();
          h += '<li data-hay="' + esc(hay) + '"><label><input type="checkbox" data-o="item" value="' + esc(it.name) + '"' + (on ? " checked" : "") + "> " + esc(it.name) + "</label>" +
            (it.url ? ' <a class="wb-opts__wiki" href="' + esc(it.url) + '" target="_blank" rel="noopener noreferrer" aria-label="' + esc(it.name) + ' on the wiki">wiki</a>' : "") +
            (it.sub ? '<span class="hint">' + esc(it.sub) + "</span>" : "") + "</li>";
        });
        h += "</ul></div>";
      });
      h += "</fieldset>";
    });
    el.innerHTML = h;

    function refresh(fs) {
      var all = fs.querySelectorAll('[data-o="item"]'), on = fs.querySelectorAll('[data-o="item"]:checked');
      fs.querySelector(".wb-opts__count").textContent = on.length === all.length ? "All " + all.length + " allowed" : on.length + " of " + all.length + " allowed";
      fs.querySelectorAll(".wb-opts__group").forEach(function (gr) {
        var items = gr.querySelectorAll('[data-o="item"]'), c = gr.querySelectorAll('[data-o="item"]:checked').length;
        var gh = gr.querySelector('[data-o="group"]');
        gh.checked = c === items.length; gh.indeterminate = c > 0 && c < items.length;
      });
    }
    el.querySelectorAll(".wb-opts").forEach(function (fs) {
      fs.addEventListener("change", function (e) {
        var t = e.target;
        if (t.getAttribute("data-o") === "group") {
          t.closest(".wb-opts__group").querySelectorAll('[data-o="item"]').forEach(function (c) { c.checked = t.checked; });
        }
        refresh(fs);
      });
      fs.querySelectorAll("[data-o=all],[data-o=none]").forEach(function (b) {
        b.addEventListener("click", function () {
          var on = b.getAttribute("data-o") === "all";
          fs.querySelectorAll("li").forEach(function (li) { if (!li.hidden) li.querySelector("input").checked = on; });
          refresh(fs);
        });
      });
      var f = fs.querySelector(".wb-opts__filter");
      if (f) f.addEventListener("input", function () {
        var v = f.value.trim().toLowerCase();
        fs.querySelectorAll("li").forEach(function (li) { li.hidden = !!v && li.getAttribute("data-hay").indexOf(v) === -1; });
        fs.querySelectorAll(".wb-opts__group").forEach(function (gr) { gr.hidden = !gr.querySelector("li:not([hidden])"); });
      });
      refresh(fs);
    });

    function get() {
      var out = {};
      sections.forEach(function (s, si) {
        var fs = el.querySelector('[data-s="' + si + '"]');
        var all = fs.querySelectorAll('[data-o="item"]'), on = Array.prototype.map.call(fs.querySelectorAll('[data-o="item"]:checked'), function (c) { return c.value; });
        if (on.length !== all.length) out[s.key] = on;
      });
      // Keep any other keys the world already had.
      Object.keys(opts).forEach(function (k) { if (!sections.some(function (s) { return s.key === k; })) out[k] = opts[k]; });
      return out;
    }
    function problems() {
      var p = [];
      sections.forEach(function (s, si) {
        var fs = el.querySelector('[data-s="' + si + '"]');
        if (!fs.querySelector('[data-o="item"]:checked')) p.push("Tick at least one " + s.one + ": players need something to choose from.");
      });
      return p;
    }
    function summary() {
      var v = get();
      return sections.map(function (s) {
        return s.title + ": " + (v[s.key] ? v[s.key].length + " chosen" : "all");
      }).join(" · ");
    }
    return { get: get, summary: summary, problems: problems };
  }

  // A short summary from a stored options value, without loading lists.
  function describe(game, opts) {
    opts = opts || {};
    var keys = game === "hunter" ? [["creeds", "Creeds"]] : game === "vampire" ? [["clans", "Clans and Bloodlines"]] : [["species", "Species"], ["classes", "Classes"]];
    return keys.map(function (k) { return k[1] + ": " + (Array.isArray(opts[k[0]]) ? opts[k[0]].length + " chosen" : "all"); }).join(" · ");
  }

  window.BuilderOptions = { mount: mount, describe: describe };
})();
