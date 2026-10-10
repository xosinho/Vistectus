/* =====================================================================
   Builders — the content editors (factions, NPCs, adventurers' cards,
   handouts, maps, reference links, places)
   ---------------------------------------------------------------------
   Used by the wizard (build.html) and the workshop (workshop.html).
   Load after builders.js, ../content.js and ../cropper.js.

     BuilderEditors.mount(element, {
       kind: "faction" | "npc" | "player" | "document" | "map" | "resource" | "place",
       world: { id, game, ... },            // the worlds row
       chronicle: { id, ... },              // for everything but factions
       onChange: function (count) {}        // after a save, delete or move
     })  -> { reload(), count() }

   Each list saves straight into the database as the person works:
     factions                 -> world_factions          (world's editor)
     NPCs, cards, handouts,
     maps, reference links    -> chronicle_items         (Storyteller/DM)
     places                   -> location_pins           (Storyteller/DM)
     "hidden from players"    -> archive_hidden          (Storyteller/DM)
   The database decides who may; this file draws the forms.
   ===================================================================== */
(function () {
  "use strict";

  var B = window.Builders;
  var esc = B.esc;

  /* ---- what each kind holds --------------------------------------- */
  var KINDS = {
    faction: {
      table: "world_factions", one: "faction", many: "factions", folder: "factions",
      media: "image", mediaMode: "portrait", titleField: "name", subField: "chip",
      fields: [
        { k: "name", label: "Name", type: "text", max: 120, required: true, hint: "What the faction is called: “The Salt Guild”." },
        { k: "chip", label: "In a few words", type: "text", max: 80, hint: "A short label shown above the name: “The patient rival”, “The ancient claim”." },
        { k: "epithet", label: "Epithet", type: "textarea", rows: 2, max: 600, oneLine: true, hint: "One sentence that sums them up: who they are and what they want." },
        { k: "goals", label: "Goals", type: "lines", max: 600, hint: "One goal per line. What are they working towards?" },
        { k: "figures", label: "Key figures", type: "figures", hint: "The people who matter in it: a name and a short note on each." },
        { k: "prose", label: "Description", type: "textarea", rows: 8, max: 12000, hint: "A few paragraphs: their history, how they work, what makes them dangerous or useful. Leave a blank line between paragraphs." },
        { k: "image", label: "Picture (3:4 portrait)", type: "media", mode: "portrait", hint: "A tall picture: a leader, a banner, a place. Faction pictures are 3:4 portraits; you choose what to keep after picking the file." }
      ]
    },
    npc: {
      table: "chronicle_items", itemKind: "npc", one: "NPC", many: "NPCs", folder: "npcs",
      media: "portrait", mediaMode: "portrait", titleField: "name", subField: "tagline",
      hideKind: "npcs", hideKey: function (d) { return d.name; },
      fields: [
        { k: "name", label: "Name", type: "text", max: 120, required: true },
        { k: "tagline", label: "Tagline", type: "text", max: 200, hint: "One line shown on the card: “The friend who called one last time”." },
        { k: "role", label: "Role", type: "text", max: 200, hint: "What they are or do: “Harbour master”, “Retired soldier”." },
        { k: "description", label: "Description", type: "textarea", rows: 6, max: 8000, hint: "What the players know about them. Keep secrets out: everyone in the {unit} can read this." },
        { k: "portrait", label: "Portrait (3:4)", type: "media", mode: "portrait", hint: "NPC and character portraits are 3:4 (tall); card pictures are 16:9 (wide). You choose what to keep after picking the file." },
        { k: "_hidden", label: "Hidden from players until revealed", type: "hidden", hint: "Ticked: only you see this NPC until you show it (here, or on the People page)." }
      ]
    },
    player: {
      table: "chronicle_items", itemKind: "player", one: "adventurer's card", many: "adventurers' cards", folder: "players",
      media: "portrait", mediaMode: "portrait", titleField: "name", subField: "tagline",
      fields: [
        { k: "name", label: "Character's name", type: "text", max: 120, required: true },
        { k: "tagline", label: "Tagline", type: "text", max: 200, hint: "One line shown on the card." },
        { k: "role", label: "Role", type: "text", max: 200, hint: "What they are: “Ex-soldier · Private contractor”, “Half-elf bard”." },
        { k: "background", label: "Background", type: "textarea", rows: 6, max: 8000, hint: "Who they were before play began. Everyone in the {unit} can read this." },
        { k: "portrait", label: "Portrait (3:4)", type: "media", mode: "portrait", hint: "Character portraits are 3:4 (tall)." },
        { k: "sheet", label: "Sheet short name", type: "text", max: 60, pattern: /^[a-z0-9][a-z0-9-]*$/, patternHint: "The sheet short name may use only small letters a-z, numbers and dashes.", hint: "Optional: the short name of the character's sheet (as in sheet.html?c=payne), so the card links to it." }
      ]
    },
    document: {
      table: "chronicle_items", itemKind: "document", one: "handout", many: "handouts", folder: "handouts",
      media: "file", mediaMode: "file", titleField: "title", subField: "type",
      hideKind: "documents", hideKey: function (d) { return d.file ? B.mediaUrl(d.file) : ""; },
      fields: [
        { k: "title", label: "Title", type: "text", max: 200, required: true },
        { k: "type", label: "Type", type: "text", max: 60, list: ["Documents", "Letters", "Diaries", "Reports", "Notes", "Pictures"], hint: "Groups the handouts: “Letters”, “Diaries”, “Reports”…" },
        { k: "when", label: "When", type: "text", max: 80, hint: "Optional: “Session 3”, “Act 2”, “November 1998”." },
        { k: "description", label: "Description", type: "textarea", rows: 3, max: 2000 },
        { k: "file", label: "File", type: "media", mode: "file", required: true, hint: "A PDF, a picture or a plain text file, uploaded as it is (no cropping). Up to 10 MB." },
        { k: "_hidden", label: "Hidden from players until revealed", type: "hidden" }
      ]
    },
    map: {
      table: "chronicle_items", itemKind: "map", one: "map", many: "maps", folder: "maps",
      media: "image", mediaMode: "image", titleField: "title", subField: "when",
      hideKind: "maps", hideKey: function (d) { return d.image ? B.mediaUrl(d.image) : ""; },
      fields: [
        { k: "title", label: "Title", type: "text", max: 200, required: true },
        { k: "when", label: "When", type: "text", max: 80, hint: "Optional." },
        { k: "description", label: "Description", type: "textarea", rows: 3, max: 2000 },
        { k: "image", label: "Map picture", type: "media", mode: "image", required: true, hint: "Uploaded as it is (maps are not cropped). JPEG, PNG, WebP or GIF, up to 10 MB." },
        { k: "_hidden", label: "Hidden from players until revealed", type: "hidden" }
      ]
    },
    resource: {
      table: "chronicle_items", itemKind: "resource", one: "reference link", many: "reference links", folder: "resources",
      titleField: "title", subField: "category",
      fields: [
        { k: "title", label: "Title", type: "text", max: 200, required: true },
        { k: "href", label: "Address (link)", type: "url", max: 1000, required: true, hint: "The full address, starting with https://" },
        { k: "category", label: "Group", type: "text", max: 60, list: ["Reference", "Rules", "Inspiration", "Session documents"], hint: "Groups the links on the Resources page. Use the same spelling each time." },
        { k: "kind", label: "Label", type: "text", max: 30, list: ["Link", "PDF", "Video", "Music", "Wiki"], hint: "A small label: Link, PDF, Video…" },
        { k: "description", label: "Description", type: "textarea", rows: 3, max: 2000 }
      ]
    },
    place: {
      table: "location_pins", one: "place", many: "places",
      titleField: "name", subField: "description",
      fields: [
        { k: "name", label: "Name", type: "text", max: 120, required: true },
        { k: "description", label: "Description", type: "textarea", rows: 4, max: 4000, hint: "What the players know about the place." },
        { k: "revealed", label: "Revealed to the players", type: "check", hint: "Not ticked: only you see it in Locations until you reveal it." }
      ]
    }
  };

  var uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); };
  function textOf(v) { return String(v == null ? "" : v); }
  function db() { return B.client; }
  function email() { return (window.Gate && window.Gate.email) || ""; }

  /* ---- reading and writing ---------------------------------------- */
  function adapter(spec, o) {
    var world = o.world, chron = o.chronicle;
    if (spec.table === "world_factions") return {
      load: async function () {
        var rows = await B.q(db().from("world_factions").select("*").eq("world", world.id)
          .order("sort", { ascending: true }).order("created_at", { ascending: true }));
        return (rows || []).map(function (r) {
          return { id: r.id, sort: r.sort || 0, data: { name: r.name, chip: r.chip, epithet: r.epithet, goals: r.goals || [], figures: r.figures || [], prose: r.prose, image: r.image } };
        });
      },
      insert: function (d, sort) {
        return B.q(db().from("world_factions").insert({ world: world.id, name: d.name, chip: d.chip, epithet: d.epithet, goals: d.goals,
          figures: d.figures, prose: d.prose, image: d.image, sort: sort, created_by: email() }));
      },
      update: function (id, d) {
        return B.q(db().from("world_factions").update({ name: d.name, chip: d.chip, epithet: d.epithet, goals: d.goals, figures: d.figures,
          prose: d.prose, image: d.image, updated_at: new Date().toISOString() }).eq("id", id));
      },
      sort: function (id, n) { return B.q(db().from("world_factions").update({ sort: n }).eq("id", id)); },
      remove: function (id) { return B.q(db().from("world_factions").delete().eq("id", id)); },
      where: [world.id]
    };
    if (spec.table === "location_pins") return {
      load: async function () {
        var rows = await B.q(db().from("location_pins").select("id,chronicle,name,description,revealed,lat,lng,sort").eq("chronicle", chron.id)
          .order("sort", { ascending: true }).order("name", { ascending: true }));
        return (rows || []).map(function (r) { return { id: r.id, sort: r.sort || 0, data: { name: r.name, description: r.description, revealed: !!r.revealed }, placed: r.lat != null }; });
      },
      insert: function (d, sort) {
        var id = (chron.id + "-" + B.shortName(d.name).slice(0, 40) + "-" + uid()).replace(/-+/g, "-");
        return B.q(db().from("location_pins").insert({ id: id, chronicle: chron.id, name: d.name, description: d.description,
          revealed: !!d.revealed, lat: null, lng: null, sort: sort }));
      },
      update: function (id, d) {
        return B.q(db().from("location_pins").update({ name: d.name, description: d.description, revealed: !!d.revealed, updated_at: new Date().toISOString() }).eq("id", id));
      },
      sort: function (id, n) { return B.q(db().from("location_pins").update({ sort: n }).eq("id", id)); },
      remove: function (id) { return B.q(db().from("location_pins").delete().eq("id", id)); },
      where: [world.id, chron.id]
    };
    return {
      load: async function () {
        var rows = await B.q(db().from("chronicle_items").select("id,kind,data,sort,created_at").eq("chronicle", chron.id).eq("kind", spec.itemKind)
          .order("sort", { ascending: true }).order("created_at", { ascending: true }));
        return (rows || []).map(function (r) { return { id: r.id, sort: r.sort || 0, data: r.data || {} }; });
      },
      insert: function (d, sort) {
        return B.q(db().from("chronicle_items").insert({ chronicle: chron.id, kind: spec.itemKind, data: d, sort: sort, created_by: email() }));
      },
      update: function (id, d) {
        return B.q(db().from("chronicle_items").update({ data: d, updated_at: new Date().toISOString() }).eq("id", id));
      },
      sort: function (id, n) { return B.q(db().from("chronicle_items").update({ sort: n }).eq("id", id)); },
      remove: function (id) { return B.q(db().from("chronicle_items").delete().eq("id", id)); },
      where: [world.id, chron.id]
    };
  }

  /* ---- one list --------------------------------------------------- */
  function mount(el, o) {
    var spec = KINDS[o.kind];
    if (!spec) throw new Error("Unknown kind " + o.kind);
    var g = B.game(o.world.game);
    var store = adapter(spec, o);
    var rows = [], hidden = {}, open = null; // open: { id|null, fields }
    var busy = false;

    el.classList.add("wb-list");
    el.innerHTML =
      '<p class="form-status wb-list__msg" role="status" hidden></p>' +
      '<ul class="wb-items" aria-live="polite"></ul>' +
      '<div class="wb-editor" hidden></div>' +
      '<div class="wb-list__foot"><button type="button" class="btn btn--ghost" data-a="add">Add ' + (/^([aeiou]|NPC)/i.test(spec.one) ? "an " : "a ") + esc(spec.one) + "</button></div>";
    var msg = el.querySelector(".wb-list__msg"), ul = el.querySelector(".wb-items"), ed = el.querySelector(".wb-editor");
    var addBtn = el.querySelector('[data-a="add"]');
    addBtn.addEventListener("click", function () { edit(null); });

    function word(s) { return String(s || "").replace(/\{unit\}/g, g.unit).replace(/\{st\}/g, g.st); }

    async function load() {
      try {
        rows = await store.load();
        hidden = {};
        if (spec.hideKind) {
          var h = await B.q(db().from("archive_hidden").select("item").eq("chronicle", o.chronicle.id).eq("kind", spec.hideKind));
          (h || []).forEach(function (r) { hidden[r.item] = true; });
        }
        draw();
      } catch (e) {
        console.error(e);
        B.say(msg, "error", "The " + spec.many + " could not be read: " + B.errText(e));
      }
    }

    function isHidden(d) { return spec.hideKind ? !!hidden[spec.hideKey(d)] : false; }

    function draw() {
      if (!rows.length) {
        ul.innerHTML = '<li class="wb-items__empty">No ' + esc(spec.many) + " yet.</li>";
      } else {
        ul.innerHTML = rows.map(function (r, i) {
          var d = r.data, title = d[spec.titleField] || "(untitled)", sub = textOf(d[spec.subField]);
          if (sub.length > 140) sub = sub.slice(0, 137) + "…";
          var thumb = "";
          if (spec.media && spec.mediaMode !== "file" && d[spec.media]) {
            thumb = '<span class="wb-thumb wb-thumb--' + spec.mediaMode + '"><img src="' + esc(B.mediaUrl(d[spec.media])) + '" alt="" loading="lazy"></span>';
          } else if (spec.media) {
            thumb = '<span class="wb-thumb wb-thumb--' + (spec.mediaMode || "card") + ' is-empty"></span>';
          }
          var tags = [];
          if (spec.hideKind) tags.push(isHidden(d) ? '<span class="wb-tag wb-tag--hidden">Hidden from players</span>' : '<span class="wb-tag">Players see it</span>');
          if (o.kind === "place") {
            tags.push(d.revealed ? '<span class="wb-tag">Revealed</span>' : '<span class="wb-tag wb-tag--hidden">Not revealed</span>');
            tags.push(r.placed ? '<span class="wb-tag">On the map</span>' : '<span class="wb-tag wb-tag--todo">Not on the map yet</span>');
          }
          if (o.kind === "document" && d.file) tags.push('<a class="wb-tag" href="' + esc(B.mediaUrl(d.file)) + '" target="_blank" rel="noopener">Open file</a>');
          if (o.kind === "resource" && d.href) tags.push('<a class="wb-tag" href="' + esc(d.href) + '" target="_blank" rel="noopener noreferrer">Open link</a>');
          return '<li class="wb-item' + (isHidden(d) ? " is-hidden" : "") + '" data-i="' + i + '">' + thumb +
            '<div class="wb-item__body"><strong>' + esc(title) + "</strong>" + (sub ? '<span class="hint">' + esc(sub) + "</span>" : "") +
            (tags.length ? '<span class="wb-tags">' + tags.join("") + "</span>" : "") + "</div>" +
            '<div class="wb-item__acts">' +
              '<button type="button" class="linkbtn" data-a="up" aria-label="Move ' + esc(title) + ' up"' + (i === 0 ? " disabled" : "") + ">↑</button>" +
              '<button type="button" class="linkbtn" data-a="down" aria-label="Move ' + esc(title) + ' down"' + (i === rows.length - 1 ? " disabled" : "") + ">↓</button>" +
              (spec.hideKind ? '<button type="button" class="linkbtn" data-a="hide">' + (isHidden(d) ? "Show to players" : "Hide from players") + "</button>" : "") +
              '<button type="button" class="linkbtn" data-a="edit">Edit</button>' +
              '<button type="button" class="linkbtn wb-danger" data-a="del">Delete</button>' +
            "</div></li>";
        }).join("");
        ul.querySelectorAll("[data-a]").forEach(function (b) {
          b.addEventListener("click", function () {
            var i = +b.closest("[data-i]").getAttribute("data-i"), a = b.getAttribute("data-a");
            if (a === "edit") edit(rows[i]);
            else if (a === "del") del(rows[i]);
            else if (a === "up") move(i, -1);
            else if (a === "down") move(i, 1);
            else if (a === "hide") toggleHide(rows[i]);
          });
        });
      }
      if (o.onChange) o.onChange(rows.length, rows);
    }

    /* ---- the form ---- */
    function edit(row) {
      if (open && open.fields) closeEditor(true);
      var d = row ? row.data : {};
      open = { row: row, inputs: {}, media: null };
      var h = '<h3 class="wb-editor__title">' + (row ? "Edit " + esc(spec.one) : "New " + esc(spec.one)) + "</h3>" +
        '<div class="wb-editor__form form">';
      spec.fields.forEach(function (f) {
        var fid = "f" + uid(), hint = f.hint ? '<p class="hint">' + esc(word(f.hint)) + "</p>" : "";
        var req = f.required ? "" : ' <span class="wb-opt">(optional)</span>';
        if (f.type === "text" || f.type === "url") {
          var lid = f.list ? fid + "-list" : "";
          h += '<div class="field"><label for="' + fid + '">' + esc(f.label) + (f.required ? "" : req) + '</label><input id="' + fid + '" data-k="' + f.k + '" type="' + (f.type === "url" ? "url" : "text") +
            '" maxlength="' + f.max + '" value="' + esc(d[f.k]) + '"' + (lid ? ' list="' + lid + '"' : "") + ">" + hint +
            (lid ? '<datalist id="' + lid + '">' + f.list.map(function (x) { return '<option value="' + esc(x) + '">'; }).join("") + "</datalist>" : "") + "</div>";
        } else if (f.type === "textarea") {
          h += '<div class="field"><label for="' + fid + '">' + esc(f.label) + req + '</label><textarea id="' + fid + '" data-k="' + f.k + '" rows="' + (f.rows || 4) +
            '" maxlength="' + f.max + '" class="wb-rows-' + (f.rows || 4) + '">' + esc(d[f.k]) + "</textarea>" + hint + "</div>";
        } else if (f.type === "lines") {
          h += '<div class="field"><label for="' + fid + '">' + esc(f.label) + req + '</label><textarea id="' + fid + '" data-k="' + f.k + '" rows="4" class="wb-rows-4">' +
            esc((d[f.k] || []).join("\n")) + "</textarea>" + hint + "</div>";
        } else if (f.type === "figures") {
          h += '<div class="field"><span class="wb-media__label">' + esc(f.label) + req + "</span>" + hint + '<div class="wb-figures" data-k="' + f.k + '"></div>' +
            '<div><button type="button" class="linkbtn" data-a="fig-add">+ Add a key figure</button></div></div>';
        } else if (f.type === "media") {
          h += '<div class="field" data-media="' + f.k + '"></div>';
        } else if (f.type === "hidden" || f.type === "check") {
          var on = f.type === "hidden" ? (row ? isHidden(d) : false) : !!d[f.k];
          h += '<div class="field wb-check"><label class="wb-check__label"><input type="checkbox" data-k="' + f.k + '"' + (on ? " checked" : "") + "> " + esc(f.label) + "</label>" + hint + "</div>";
        }
      });
      if (o.kind === "place") h += '<p class="hint">You place it on the uploaded map later, in Locations (from your ' + esc(g.stPageLabel) + "). Upload the map itself there too.</p>";
      h += '<p class="form-status wb-editor__msg" role="status" hidden></p>' +
        '<div class="wb-editor__acts"><button type="button" class="btn" data-a="save">' + (row ? "Save changes" : "Add " + esc(spec.one)) + '</button>' +
        '<button type="button" class="btn btn--ghost" data-a="cancel">Cancel</button></div></div>';
      ed.innerHTML = h;
      ed.hidden = false;
      addBtn.hidden = true;
      open.fields = true;

      spec.fields.forEach(function (f) {
        if (f.type === "media") {
          open.media = B.mediaField(ed.querySelector('[data-media="' + f.k + '"]'), {
            mode: f.mode, label: f.label, hint: word(f.hint), value: d[f.k] || "", required: f.required, folder: spec.folder
          });
          open.mediaKey = f.k;
        } else if (f.type === "figures") {
          var box = ed.querySelector(".wb-figures");
          var figs = (d.figures || []).slice();
          if (!figs.length) figs = [{ name: "", note: "" }];
          figs.forEach(function (x) { addFigure(box, x); });
          ed.querySelector('[data-a="fig-add"]').addEventListener("click", function () { addFigure(box, { name: "", note: "" }).querySelector("input").focus(); });
        }
      });
      ed.querySelector('[data-a="save"]').addEventListener("click", save);
      ed.querySelector('[data-a="cancel"]').addEventListener("click", function () { closeEditor(true); });
      var first = ed.querySelector("input[type=text],input[type=url]");
      if (first) first.focus();
      try { ed.scrollIntoView({ block: "start", behavior: "smooth" }); } catch (e) { /* ignore */ }
    }

    function addFigure(box, x) {
      var row = document.createElement("div");
      row.className = "wb-figure";
      row.innerHTML = '<input type="text" maxlength="120" placeholder="Name" aria-label="Key figure\'s name" class="wb-figure__name" value="' + esc(x.name) + '">' +
        '<input type="text" maxlength="400" placeholder="A short note: who they are, what they want" aria-label="Note on the key figure" class="wb-figure__note" value="' + esc(x.note) + '">' +
        '<button type="button" class="linkbtn" aria-label="Remove this key figure">Remove</button>';
      row.querySelector("button").addEventListener("click", function () { row.remove(); });
      box.appendChild(row);
      return row;
    }

    function closeEditor(discard) {
      if (discard && open && open.media) open.media.discard();
      ed.hidden = true; ed.innerHTML = ""; addBtn.hidden = false; open = null;
    }

    function collect() {
      var d = {}, probs = [];
      var wantHidden = false;
      spec.fields.forEach(function (f) {
        if (f.type === "media") return;
        if (f.type === "figures") {
          d.figures = [];
          ed.querySelectorAll(".wb-figure").forEach(function (r) {
            var n = r.querySelector(".wb-figure__name").value.trim(), t = r.querySelector(".wb-figure__note").value.trim();
            if (n || t) {
              if (!n) probs.push("Give each key figure a name (one has only a note).");
              d.figures.push({ name: n, note: t });
            }
          });
          return;
        }
        var inp = ed.querySelector('[data-k="' + f.k + '"]');
        if (f.type === "hidden") { wantHidden = inp.checked; return; }
        if (f.type === "check") { d[f.k] = inp.checked; return; }
        var v = inp.value;
        if (f.type === "lines") {
          d[f.k] = v.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
          return;
        }
        v = f.type === "textarea" && !f.oneLine ? v.replace(/\r/g, "").trim() : v.replace(/\s+/g, " ").trim();
        if (f.required && !v) probs.push(f.label + ": this is needed.");
        if (v.length > f.max) probs.push(f.label + ": at most " + f.max + " characters (now " + v.length + ").");
        if (v && f.pattern && !f.pattern.test(v)) probs.push(f.patternHint);
        if (v && f.type === "url") {
          var ok = false;
          try { var u = new URL(v); ok = u.protocol === "https:" || u.protocol === "http:"; } catch (e) { ok = false; }
          if (!ok) probs.push("The address must be a full web link starting with https:// (or http://).");
        }
        d[f.k] = v;
      });
      if (open.media) {
        var mf = spec.fields.filter(function (f) { return f.type === "media"; })[0];
        if (mf.required && !open.media.hasValue()) probs.push(mf.label + ": choose a file.");
      }
      if (o.kind === "resource" && d.href) d.external = /^https?:\/\//i.test(d.href);
      if (spec.titleField && d[spec.titleField]) {
        var same = rows.filter(function (r) { return (!open.row || r.id !== open.row.id) && String(r.data[spec.titleField] || "").toLowerCase() === d[spec.titleField].toLowerCase(); });
        if (same.length && spec.hideKind === "npcs") probs.push("There is already an NPC called “" + d.name + "”. Give each NPC its own name (hiding works by name).");
      }
      if (JSON.stringify(d).length > 90000) probs.push("This is too long to save in one go. Shorten the text.");
      return { d: d, probs: probs, wantHidden: wantHidden };
    }

    async function setHidden(key, hide) {
      if (!key) return;
      if (hide) {
        if (hidden[key]) return;
        await B.q(db().from("archive_hidden").insert({ chronicle: o.chronicle.id, kind: spec.hideKind, item: key }));
        hidden[key] = true;
      } else {
        if (!hidden[key]) return;
        await B.q(db().from("archive_hidden").delete().eq("chronicle", o.chronicle.id).eq("kind", spec.hideKind).eq("item", key));
        delete hidden[key];
      }
    }

    async function save() {
      if (busy) return;
      var emsg = ed.querySelector(".wb-editor__msg"), btn = ed.querySelector('[data-a="save"]');
      var c = collect();
      if (c.probs.length) { B.problems(emsg, c.probs); return; }
      busy = true; btn.disabled = true;
      B.say(emsg, "ok", "Saving…");
      var row = open.row, d = c.d;
      try {
        // Keep anything this editor does not show (e.g. fields added on the
        // page by other tools) when changing an item.
        if (row && spec.table === "chronicle_items") d = Object.assign({}, row.data, d);
        if (open.media) d[open.mediaKey] = await open.media.save(store.where);
        var oldKey = row && spec.hideKind ? spec.hideKey(row.data) : "";
        if (row) await store.update(row.id, d);
        else await store.insert(d, rows.length ? Math.max.apply(null, rows.map(function (r) { return r.sort; })) + 10 : 10);
        if (open.media) open.media.commit();
        if (spec.hideKind) {
          var newKey = spec.hideKey(d);
          var wasHidden = !!(oldKey && hidden[oldKey]);
          if (oldKey && oldKey !== newKey && wasHidden) await setHidden(oldKey, false);
          await setHidden(newKey, c.wantHidden);
        }
        closeEditor(false);
        await load();
        B.say(msg, "ok", (row ? "Saved: " : "Added: ") + (d[spec.titleField] || spec.one) + ".");
      } catch (e) {
        console.error(e);
        if (open && open.media) open.media.discard();
        B.say(emsg, "error", "Not saved: " + B.errText(e));
      } finally {
        busy = false;
        if (btn.isConnected) btn.disabled = false;
      }
    }

    async function del(row) {
      var name = row.data[spec.titleField] || spec.one;
      if (!window.confirm("Delete “" + name + "”? This cannot be undone." + (spec.media && row.data[spec.media] ? " Its uploaded " + (spec.mediaMode === "file" ? "file" : "picture") + " is deleted too." : ""))) return;
      try {
        await store.remove(row.id);
        if (spec.hideKind) { try { await setHidden(spec.hideKey(row.data), false); } catch (e) { console.warn(e); } }
        if (spec.media && row.data[spec.media]) await B.removeMedia(row.data[spec.media]);
        if (open && open.row && open.row.id === row.id) closeEditor(false);
        await load();
        B.say(msg, "ok", "Deleted: " + name + ".");
      } catch (e) {
        console.error(e);
        B.say(msg, "error", "Not deleted: " + B.errText(e));
      }
    }

    async function move(i, step) {
      var j = i + step;
      if (busy || j < 0 || j >= rows.length) return;
      busy = true;
      var list = rows.slice();
      var t = list[i]; list[i] = list[j]; list[j] = t;
      try {
        for (var k = 0; k < list.length; k++) {
          var n = (k + 1) * 10;
          if (list[k].sort !== n) { await store.sort(list[k].id, n); list[k].sort = n; }
        }
        rows = list;
        draw();
        var b = ul.querySelector('[data-i="' + j + '"] [data-a="' + (step < 0 ? "up" : "down") + '"]');
        if (b && !b.disabled) b.focus();
      } catch (e) {
        console.error(e);
        B.say(msg, "error", "The order could not be changed: " + B.errText(e));
        await load();
      } finally { busy = false; }
    }

    async function toggleHide(row) {
      var key = spec.hideKey(row.data);
      try {
        await setHidden(key, !hidden[key]);
        draw();
      } catch (e) {
        console.error(e);
        B.say(msg, "error", "Could not change that: " + B.errText(e));
      }
    }

    load();
    return { reload: load, count: function () { return rows.length; }, rows: function () { return rows; } };
  }

  /* A short example of a well-written faction (for the wizard). */
  var EXAMPLE = {
    chip: "The patient rival",
    name: "The Salt Guild",
    epithet: "They own every scale in the harbour, and would rather weigh a city than rule it.",
    goals: ["Keep the river toll in Guild hands.", "Marry a daughter of the Guild into the Count's house.", "Find out who has been buying the old lighthouse."],
    figures: [{ name: "Mother Ysolde", note: "the Guild's mistress. Never raises her voice; never needs to." },
              { name: "Brother Anselm", note: "keeps the ledgers, and remembers every debt in them." }],
    prose: "The Guild began as six families who salted fish for the winter fleet. Three centuries later they set the price of salt, bread and silence, and the Count borrows from them every spring.\n\nThey are not cruel, only exact. Anyone can deal with the Guild once; nobody deals with it twice on better terms."
  };
  function exampleHtml() {
    var e = EXAMPLE;
    return '<div class="wb-example">' +
      '<p class="wb-chip">' + esc(e.chip) + "</p>" +
      "<h4>" + esc(e.name) + "</h4>" +
      '<p class="wb-epithet">' + esc(e.epithet) + "</p>" +
      '<div class="wb-example__cols"><div><div class="wb-stat"><h5>Goals</h5><ul>' + e.goals.map(function (g) { return "<li>" + esc(g) + "</li>"; }).join("") + "</ul></div>" +
      '<div class="wb-stat"><h5>Key figures</h5><ul>' + e.figures.map(function (f) { return '<li><span class="who">' + esc(f.name) + '</span><span class="sep">·</span>' + esc(f.note) + "</li>"; }).join("") + "</ul></div></div>" +
      '<div class="wb-example__prose">' + B.paras(e.prose) + "</div></div></div>";
  }

  window.BuilderEditors = { KINDS: KINDS, mount: mount, exampleHtml: exampleHtml };
})();
