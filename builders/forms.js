/* =====================================================================
   Builders — the world form and the chronicle (campaign) form
   ---------------------------------------------------------------------
   Shared by the wizard (build.html) and the workshop (workshop.html).
   Load after builders.js, ../content.js and ../cropper.js.

     var f = BuilderForms.world(el, { world: row|null, game: "hunter" });
     f.problems()  -> [plain-words problems]
     await f.save() -> the saved worlds row   (builder_save_world)

     var c = BuilderForms.chronicle(el, { world: row, chronicle: row|null });
     await c.save() -> the saved chronicles row (builder_save_chronicle)
   ===================================================================== */
(function () {
  "use strict";

  var B = window.Builders;
  var esc = B.esc;
  var n = 0;
  function fid() { return "wbf" + (++n); }
  function oneLine(s) { return String(s || "").replace(/\s+/g, " ").trim(); }
  function block(s) { return String(s || "").replace(/\r/g, "").trim(); }

  // A short name that follows its name until the person edits it.
  function linkShortName(nameEl, idEl) {
    var touched = !!idEl.value;
    idEl.addEventListener("input", function () {
      touched = true;
      var v = idEl.value.toLowerCase().replace(/[^a-z0-9-]/g, "-");
      if (v !== idEl.value) idEl.value = v;
    });
    nameEl.addEventListener("input", function () { if (!touched && !idEl.readOnly) idEl.value = B.shortName(nameEl.value); });
  }

  function textField(id, label, value, o) {
    o = o || {};
    return '<div class="field"><label for="' + id + '">' + esc(label) + (o.optional ? ' <span class="wb-opt">(optional)</span>' : "") + "</label>" +
      (o.area
        ? '<textarea id="' + id + '" maxlength="' + o.max + '" rows="' + (o.rows || 8) + '">' + esc(value) + "</textarea>"
        : '<input id="' + id + '" type="text" maxlength="' + o.max + '" value="' + esc(value) + '"' + (o.readonly ? " readonly" : "") +
          (o.mono ? ' spellcheck="false" autocapitalize="off" autocomplete="off"' : "") + ">") +
      (o.hint ? '<p class="hint">' + o.hint + "</p>" : "") + "</div>";
  }

  /* ---- the world ---------------------------------------------------- */
  function world(el, o) {
    var w = o.world || null, game = (w && w.game) || o.game, g = B.game(game);
    var ids = { name: fid(), id: fid(), tag: fid(), ov: fid() };
    el.innerHTML =
      '<div class="form wb-form">' +
      textField(ids.name, "Name of the world", w ? w.name : "", { max: 120, hint: "As it appears on the site: “Hungary 1242”, “The Last Garden”." }) +
      textField(ids.id, "Short name (its address)", w ? w.id : "", { max: 60, mono: true, readonly: !!w,
        hint: w ? "The world’s address on the site: <code>/" + esc(g.path) + "/" + esc(w.id) + "/</code>. It cannot change once the world is saved."
                : "Used in the world’s address: <code>/" + esc(g.path) + "/<em>short-name</em>/</code>. Small letters a-z, numbers and dashes; suggested from the name. It cannot change later." }) +
      textField(ids.tag, "Tagline", w ? w.tagline : "", { max: 300, hint: "One line that sells the world, shown on its card." }) +
      textField(ids.ov, "Overview", w ? w.overview : "", { max: 20000, area: true, rows: 10,
        hint: "A few paragraphs: the pitch for the world as a whole (its place and time, its mood, what is at stake), not the story of one " + esc(g.unit) + ". Leave a blank line between paragraphs." }) +
      '<div class="field" data-pic="card"></div>' +
      '<div class="field" data-pic="hero"></div>' +
      "</div>";
    var $ = function (id) { return el.querySelector("#" + id); };
    linkShortName($(ids.name), $(ids.id));
    var card = B.mediaField(el.querySelector('[data-pic="card"]'), { mode: "card", label: "Card picture (16:9)", value: w ? w.card_image : "", folder: "art",
      hint: "Shown on the world’s card. Card pictures are 16:9 (wide); portraits of characters and NPCs are 3:4 (tall). After choosing the file you pick what to keep." });
    var hero = B.mediaField(el.querySelector('[data-pic="hero"]'), { mode: "card", label: "Banner picture (16:9)", value: w ? w.hero_image : "", folder: "art",
      hint: "Shown behind the title at the top of the world’s page. If you leave it out, the card picture is used." });

    function values() {
      return { id: $(ids.id).value.trim().toLowerCase(), name: oneLine($(ids.name).value), tagline: oneLine($(ids.tag).value), overview: block($(ids.ov).value) };
    }
    function problems() {
      var v = values(), p = [];
      if (!v.name) p.push("Give the world a name.");
      if (v.name.length > 120) p.push("The name can have at most 120 characters.");
      if (!w) { var ip = B.idProblem(v.id, "world"); if (ip) p.push(ip); }
      if (v.tagline.length > 300) p.push("The tagline can have at most 300 characters.");
      if (v.overview.length > 20000) p.push("The overview can have at most 20,000 characters.");
      return p;
    }
    async function save() {
      var v = values();
      var id = w ? w.id : v.id;
      var opts = (w && w.options) || {};
      var args = function (c, h) {
        return { p_id: id, p_game: game, p_name: v.name, p_tagline: v.tagline, p_overview: v.overview, p_card_image: c, p_hero_image: h, p_options: opts };
      };
      if (!w) {
        // Create it first: pictures can only be stored under a world that exists.
        await B.rpc("builder_save_world", args("", ""));
      }
      try {
        var c = await card.save([id]), h = await hero.save([id]);
        if (w || c || h) await B.rpc("builder_save_world", args(c, h));
      } catch (e) { card.discard(); hero.discard(); throw e; }
      card.commit(); hero.commit();
      w = await B.q(B.client.from("worlds").select("*").eq("id", id).maybeSingle());
      if (!w) throw new Error("The world was saved, but could not be read back. Reload the page.");
      // From now on the short name is fixed.
      $(ids.id).readOnly = true;
      return w;
    }
    function dirty() {
      var v = values();
      if (!w) return !!(v.name || v.tagline || v.overview || card.hasValue() || hero.hasValue());
      return v.name !== w.name || v.tagline !== (w.tagline || "") || v.overview !== (w.overview || "") || card.dirty() || hero.dirty();
    }
    return { problems: problems, save: save, dirty: dirty, values: values };
  }

  /* ---- a chronicle / campaign ---------------------------------------- */
  function chronicle(el, o) {
    var wr = o.world, c = o.chronicle || null, g = B.game(wr.game);
    var u = g.unit;
    var ids = { name: fid(), id: fid(), tag: fid(), pre: fid() };
    el.innerHTML =
      '<div class="form wb-form">' +
      textField(ids.name, "Name of the " + u, c ? c.name : "", { max: 120, hint: "As it appears on the site: “Dead Hand”, “A Crown of Ice and Bone”." }) +
      textField(ids.id, "Short name (its address)", c ? c.id : "", { max: 60, mono: true, readonly: !!c,
        hint: c ? "The " + u + "’s address: <code>/" + esc(g.path) + "/" + esc(wr.id) + "/" + esc(c.id) + "/</code>. It cannot change."
                : "Used in the address: <code>/" + esc(g.path) + "/" + esc(wr.id) + "/<em>short-name</em>/</code>. Small letters a-z, numbers and dashes. It must not be used by any other " + u + " on the site." }) +
      textField(ids.tag, "Tagline", c ? c.tagline : "", { max: 300, hint: "One line, shown on the " + u + "’s card." }) +
      textField(ids.pre, "Premise", c ? c.premise : "", { max: 20000, area: true, rows: 8,
        hint: "Where the " + u + " starts and what it is about: the situation the " + esc(g.crew) + " walks into. What the players may know before the first session. Leave a blank line between paragraphs." }) +
      '<div class="field" data-pic="card"></div>' +
      "</div>";
    var $ = function (id) { return el.querySelector("#" + id); };
    linkShortName($(ids.name), $(ids.id));
    var card = B.mediaField(el.querySelector('[data-pic="card"]'), { mode: "card", label: "Card picture (16:9)", value: c ? c.card_image : "", folder: "art",
      hint: "Shown on the " + u + "’s card. Card pictures are 16:9; portraits of characters and NPCs are 3:4." });

    function values() {
      return { id: $(ids.id).value.trim().toLowerCase(), name: oneLine($(ids.name).value), tagline: oneLine($(ids.tag).value), premise: block($(ids.pre).value) };
    }
    function problems() {
      var v = values(), p = [];
      if (!v.name) p.push("Give the " + u + " a name.");
      if (v.name.length > 120) p.push("The name can have at most 120 characters.");
      if (!c) { var ip = B.idProblem(v.id, "chronicle"); if (ip) p.push(ip); }
      if (v.tagline.length > 300) p.push("The tagline can have at most 300 characters.");
      if (v.premise.length > 20000) p.push("The premise can have at most 20,000 characters.");
      return p;
    }
    async function save() {
      var v = values(), id = c ? c.id : v.id;
      var pic;
      try {
        pic = await card.save([wr.id, id]);
        await B.rpc("builder_save_chronicle", { p_world: wr.id, p_id: id, p_name: v.name, p_tagline: v.tagline, p_premise: v.premise, p_card_image: pic });
      } catch (e) { card.discard(); throw e; }
      card.commit();
      c = await B.q(B.client.from("chronicles").select("*").eq("id", id).maybeSingle());
      if (!c) throw new Error("The " + u + " was saved, but could not be read back. Reload the page.");
      $(ids.id).readOnly = true;
      return c;
    }
    function dirty() {
      var v = values();
      if (!c) return !!(v.name || v.tagline || v.premise || card.hasValue());
      return v.name !== c.name || v.tagline !== (c.tagline || "") || v.premise !== (c.premise || "") || card.dirty();
    }
    return { problems: problems, save: save, dirty: dirty, values: values };
  }

  window.BuilderForms = { world: world, chronicle: chronicle };
})();
