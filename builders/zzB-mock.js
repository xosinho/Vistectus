/* TEMPORARY TEST STAND-IN for supabase-js (window.supabase). Deleted after testing. */
(function () {
  "use strict";
  var KEY = "zzb-db";
  function me() { try { return localStorage.getItem("zzb-email") || "builder@example.com"; } catch (e) { return "builder@example.com"; } }
  function signedIn() { try { return localStorage.getItem("zzb-out") !== "1"; } catch (e) { return true; } }
  var now = function () { return new Date().toISOString(); };
  function seed() {
    var t = "2026-01-01T00:00:00Z";
    return {
      builders: [{ email: "builder@example.com" }],
      site_admins: [],
      worlds: [
        { id: "brooklyn", game: "hunter", name: "Brooklyn Chronicles", tagline: "", overview: "", card_image: "", hero_image: "", options: {}, status: "approved", review_note: "", static_path: "htr/brooklyn/", created_by: "", created_at: t, updated_at: t },
        { id: "hungary-1242", game: "vampire", name: "Hungary 1242", tagline: "", overview: "", card_image: "", hero_image: "", options: {}, status: "approved", review_note: "", static_path: "vtda/hungary-1242/", created_by: "", created_at: t, updated_at: t },
        { id: "ashen-coast", game: "dnd", name: "The Ashen Coast", tagline: "Salt, smoke and old gods.", overview: "A coast of burned harbours.", card_image: "", hero_image: "", options: {}, status: "approved", review_note: "", static_path: null, created_by: "builder@example.com", created_at: t, updated_at: t },
        { id: "salt-marsh", game: "vampire", name: "Salt Marsh", tagline: "A drowned diocese.", overview: "Fens.", card_image: "", hero_image: "", options: { clans: ["Brujah"] }, status: "rejected", review_note: "Please add <b>factions</b> & a card picture.", static_path: null, created_by: "builder@example.com", created_at: t, updated_at: t },
        { id: "someone-else", game: "hunter", name: "Someone Else's Draft", tagline: "", overview: "", card_image: "", hero_image: "", options: {}, status: "draft", review_note: "", static_path: null, created_by: "other@example.com", created_at: t, updated_at: t }
      ],
      chronicles: [
        { id: "dead-hand", name: "Dead Hand", game: "hunter", world: "brooklyn", path: "htr/brooklyn/dead-hand/", status: "approved", tagline: "", premise: "", card_image: "", created_by: "", created_at: t },
        { id: "first-tide", name: "The First Tide", game: "dnd", world: "ashen-coast", path: "dnd/ashen-coast/first-tide/", status: "approved", tagline: "The fleet burns.", premise: "x", card_image: "", created_by: "builder@example.com", created_at: t },
        { id: "other-draft", name: "Other draft", game: "hunter", world: "someone-else", path: "htr/someone-else/other-draft/", status: "draft", tagline: "", premise: "", card_image: "", created_by: "other@example.com", created_at: t }
      ],
      chronicle_members: [
        { chronicle: "dead-hand", email: "builder@example.com", role: "player" },
        { chronicle: "first-tide", email: "builder@example.com", role: "storyteller" },
        { chronicle: "other-draft", email: "other@example.com", role: "storyteller" },
        { chronicle: "dead-hand", email: "st@example.com", role: "storyteller" }
      ],
      world_factions: [], chronicle_items: [], archive_hidden: [], location_pins: [], builder_uploads: [], campaign_settings: [],
      rules_creeds: [
        { key: "entrepreneurial", name: "Entrepreneurial", summary: "Builders, inventors and fixers.", url: "https://htr.paradoxwikis.com/Creeds", sort: 1 },
        { key: "faithful", name: "Faithful", summary: "Hunters of faith.", url: "https://htr.paradoxwikis.com/Creeds", sort: 2 },
        { key: "inquisitive", name: "Inquisitive", summary: "Researchers and investigators.", url: "https://htr.paradoxwikis.com/Creeds", sort: 3 },
        { key: "martial", name: "Martial", summary: "Soldiers and fighters.", url: "https://htr.paradoxwikis.com/Creeds", sort: 4 },
        { key: "underground", name: "Underground", summary: "Criminals and street people.", url: "https://htr.paradoxwikis.com/Creeds", sort: 5 }
      ],
      storage: {}
    };
  }
  function load() { try { var s = localStorage.getItem(KEY); if (s) return JSON.parse(s); } catch (e) { /* */ } var d = seed(); store(d); return d; }
  function store(d) { localStorage.setItem(KEY, JSON.stringify(d)); }
  window.zzbReset = function () { localStorage.removeItem(KEY); };
  window.zzbDB = function () { return load(); };
  window.zzbLog = window.zzbLog || [];

  function err(m) { return { data: null, error: { message: m } }; }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  function isAdmin(d) { return d.site_admins.some(function (a) { return a.email === me(); }); }
  function role(d, c) {
    if (isAdmin(d) && d.chronicles.some(function (x) { return x.id === c; })) return "storyteller";
    var m = d.chronicle_members.filter(function (x) { return x.chronicle === c && x.email === me(); })[0];
    return m ? m.role : null;
  }
  function isST(d, c) { return role(d, c) === "storyteller"; }
  function worldST(d, w) { return isAdmin(d) || d.chronicle_members.some(function (m) { var c = d.chronicles.filter(function (x) { return x.id === m.chronicle; })[0]; return c && c.world === w && m.role === "storyteller" && m.email === me(); }); }
  function editor(d, w) { return isAdmin(d) || d.worlds.some(function (x) { return x.id === w && x.created_by === me(); }) || worldST(d, w); }
  function isBuilder(d) { return isAdmin(d) || d.builders.some(function (b) { return b.email === me(); }); }
  var RE = /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/;

  var RPC = {
    is_builder: function (d) { return isBuilder(d); },
    is_admin: function (d) { return isAdmin(d); },
    my_chronicles: function (d) { return d.chronicles.filter(function (c) { return role(d, c.id); }).map(function (c) { return { chronicle: c.id, name: c.name, game: c.game, world: c.world, role: role(d, c.id) }; }); },
    chronicle_role: function (d, a) { return role(d, a.p_chronicle); },
    is_chronicle_storyteller: function (d, a) { return isST(d, a.p_chronicle); },
    is_world_editor: function (d, a) { return editor(d, a.p_world); },
    builder_save_world: function (d, a) {
      var id = String(a.p_id || "").trim().toLowerCase();
      var w = d.worlds.filter(function (x) { return x.id === id; })[0];
      if (!w) {
        if (!isBuilder(d)) throw "Only invited builders can start a world. Ask the site's admin.";
        if (!RE.test(id)) throw "The short name may use a-z, 0-9 and dashes (3 to 60 characters).";
        if (["assets", "art", "admin", "builders", "index", "world", "worlds", "template", "rules", "factions", "options"].indexOf(id) !== -1 || id[0] === "_") throw "That short name is reserved; choose another.";
        if (["hunter", "vampire", "dnd"].indexOf(a.p_game) === -1) throw "Choose Hunter, Vampire or D&D.";
        if (d.worlds.filter(function (x) { return x.created_by === me() && x.status !== "approved"; }).length >= 5 && !isAdmin(d)) throw "You already have five worlds in the making. Finish or delete one first.";
        d.worlds.push({ id: id, game: a.p_game, name: String(a.p_name || "").trim().slice(0, 120), tagline: a.p_tagline || "", overview: a.p_overview || "", card_image: a.p_card_image || "", hero_image: a.p_hero_image || "",
          options: a.p_options || {}, status: "draft", review_note: "", static_path: null, created_by: me(), created_at: now(), updated_at: now() });
        return null;
      }
      if (!editor(d, id)) throw "That short name is taken; choose another.";
      w.name = String(a.p_name || "").trim() || w.name; w.tagline = a.p_tagline || ""; w.overview = a.p_overview || "";
      w.card_image = a.p_card_image || ""; w.hero_image = a.p_hero_image || ""; w.options = a.p_options || {}; w.updated_at = now();
      if (w.status === "rejected") w.status = "draft";
      return null;
    },
    builder_save_chronicle: function (d, a) {
      var w = d.worlds.filter(function (x) { return x.id === a.p_world; })[0];
      if (!w) throw "There is no such world.";
      if (!editor(d, a.p_world)) throw "You cannot add chronicles to this world.";
      var id = String(a.p_id || "").trim().toLowerCase();
      var c = d.chronicles.filter(function (x) { return x.id === id; })[0];
      if (!c) {
        if (!RE.test(id)) throw "The short name may use a-z, 0-9 and dashes (3 to 60 characters).";
        if (["assets", "art", "factions", "options", "rules", "index", "locations"].indexOf(id) !== -1) throw "That short name is reserved.";
        var path = { hunter: "htr", vampire: "vtda", dnd: "dnd" }[w.game] + "/" + w.id + "/" + id + "/";
        d.chronicles.push({ id: id, name: String(a.p_name || "").trim(), game: w.game, world: w.id, path: path, status: isAdmin(d) && w.status === "approved" ? "approved" : "draft",
          tagline: a.p_tagline || "", premise: a.p_premise || "", card_image: a.p_card_image || "", created_by: me(), created_at: now() });
        d.chronicle_members = d.chronicle_members.filter(function (m) { return !(m.chronicle === id && m.email === me()); });
        d.chronicle_members.push({ chronicle: id, email: me(), role: "storyteller" });
        return null;
      }
      if (c.world !== a.p_world) throw "That short name is taken; choose another.";
      if (!isST(d, id)) throw "Only the chronicle's Storyteller can change it.";
      c.name = String(a.p_name || "").trim() || c.name; c.tagline = a.p_tagline || ""; c.premise = a.p_premise || ""; c.card_image = a.p_card_image || "";
      if (c.status === "rejected") c.status = "draft";
      return null;
    },
    builder_submit: function (d, a) {
      if (!editor(d, a.p_world)) throw "That is not your world.";
      if (a.p_chronicle == null) {
        d.worlds.forEach(function (w) { if (w.id === a.p_world && (w.status === "draft" || w.status === "rejected")) w.status = "pending"; });
        d.chronicles.forEach(function (c) { if (c.world === a.p_world && (c.status === "draft" || c.status === "rejected")) c.status = "pending"; });
      } else {
        if (!isST(d, a.p_chronicle)) throw "That is not your chronicle.";
        d.chronicles.forEach(function (c) { if (c.id === a.p_chronicle && c.world === a.p_world && (c.status === "draft" || c.status === "rejected")) c.status = "pending"; });
      }
      return null;
    },
    builder_delete_world: function (d, a) {
      var w = d.worlds.filter(function (x) { return x.id === a.p_world; })[0];
      if (!w) throw "There is no such world.";
      if (w.static_path) throw "This world is part of the site's files; it cannot be deleted here.";
      if (!(isAdmin(d) || (w.created_by === me() && w.status !== "approved"))) throw "Only a site admin can delete an approved world.";
      var gone = d.chronicles.filter(function (c) { return c.world === a.p_world; }).map(function (c) { return c.id; });
      d.chronicles = d.chronicles.filter(function (c) { return c.world !== a.p_world; });
      d.chronicle_items = d.chronicle_items.filter(function (i) { return gone.indexOf(i.chronicle) === -1; });
      d.chronicle_members = d.chronicle_members.filter(function (i) { return gone.indexOf(i.chronicle) === -1; });
      d.world_factions = d.world_factions.filter(function (f) { return f.world !== a.p_world; });
      d.worlds = d.worlds.filter(function (x) { return x.id !== a.p_world; });
      return null;
    }
  };

  // Row rules, roughly as the database has them.
  var READ = {
    worlds: function (d, r) { return r.status === "approved" || editor(d, r.id); },
    world_factions: function (d, r) { return d.worlds.some(function (w) { return w.id === r.world && (w.status === "approved" || editor(d, w.id)); }); },
    chronicles: function (d, r) { return r.status === "approved" || isAdmin(d) || r.created_by === me() || !!role(d, r.id); },
    chronicle_items: function (d, r) { return !!role(d, r.chronicle); },
    archive_hidden: function (d, r) { return !!role(d, r.chronicle); },
    location_pins: function (d, r) { return isST(d, r.chronicle) || (r.revealed && !!role(d, r.chronicle)); },
    rules_creeds: function () { return true; },
    builder_uploads: function (d, r) { return r.user_email === me(); }
  };
  var WRITE = {
    world_factions: function (d, r) { return editor(d, r.world); },
    chronicle_items: function (d, r) { return isST(d, r.chronicle); },
    archive_hidden: function (d, r) { return isST(d, r.chronicle); },
    location_pins: function (d, r) { return isST(d, r.chronicle); },
    builder_uploads: function () { return true; }
  };
  function uuid() { return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); }); }

  function Query(table) {
    this.t = table; this.f = []; this.o = []; this.op = "select"; this.payload = null; this.lim = null; this.one = null;
  }
  Query.prototype.select = function () { if (this.op === "select") this.op = "select"; return this; };
  Query.prototype.eq = function (k, v) { this.f.push(function (r) { return r[k] === v; }); return this; };
  Query.prototype.neq = function (k, v) { this.f.push(function (r) { return r[k] !== v; }); return this; };
  Query.prototype.in = function (k, v) { this.f.push(function (r) { return v.indexOf(r[k]) !== -1; }); return this; };
  Query.prototype.order = function (k, o) { this.o.push([k, !o || o.ascending !== false]); return this; };
  Query.prototype.limit = function (n) { this.lim = n; return this; };
  Query.prototype.maybeSingle = function () { this.one = "maybe"; return this; };
  Query.prototype.single = function () { this.one = "single"; return this; };
  Query.prototype.insert = function (p) { this.op = "insert"; this.payload = p; return this; };
  Query.prototype.update = function (p) { this.op = "update"; this.payload = p; return this; };
  Query.prototype.delete = function () { this.op = "delete"; return this; };
  Query.prototype.then = function (res, rej) {
    var self = this;
    return new Promise(function (r) { setTimeout(function () { r(self.run()); }, 25); }).then(res, rej);
  };
  Query.prototype.run = function () {
    var d = load(), t = this.t, rows = d[t];
    window.zzbLog.push(this.op + " " + t);
    if (!rows) return err('relation "public.' + t + '" does not exist');
    var self = this;
    var match = function (r) { return self.f.every(function (f) { return f(r); }); };
    var canRead = READ[t] || function () { return true; };
    if (this.op === "select") {
      var out = rows.filter(function (r) { return canRead(d, r) && match(r); });
      this.o.slice().reverse().forEach(function (o) {
        out.sort(function (a, b) { var x = a[o[0]], y = b[o[0]]; if (x === y) return 0; if (x == null) return 1; if (y == null) return -1; return (x < y ? -1 : 1) * (o[1] ? 1 : -1); });
      });
      if (this.lim) out = out.slice(0, this.lim);
      out = clone(out);
      if (this.one) {
        if (out.length > 1) return err("JSON object requested, multiple (or no) rows returned");
        if (this.one === "single" && !out.length) return err("JSON object requested, multiple (or no) rows returned");
        return { data: out[0] || null, error: null };
      }
      return { data: out, error: null };
    }
    var can = WRITE[t];
    if (!can) return err('permission denied for table ' + t);
    if (this.op === "insert") {
      var list = Array.isArray(this.payload) ? this.payload : [this.payload];
      for (var i = 0; i < list.length; i++) {
        var row = clone(list[i]);
        if (!can(d, row)) return err('new row violates row-level security policy for table "' + t + '"');
        if (t === "archive_hidden" && rows.some(function (r) { return r.chronicle === row.chronicle && r.kind === row.kind && r.item === row.item; })) return err('duplicate key value violates unique constraint "archive_hidden_pkey"');
        if (t === "archive_hidden" && ["documents", "maps", "npcs"].indexOf(row.kind) === -1) return err("bad kind");
        if (t === "chronicle_items" && JSON.stringify(row.data).length > 100000) return err("data too big");
        if (t === "location_pins" && rows.some(function (r) { return r.id === row.id; })) return err("duplicate key value violates unique constraint");
        if (t === "world_factions" || t === "chronicle_items" || t === "builder_uploads") row.id = row.id || uuid();
        if (t === "builder_uploads") row.user_email = me();
        row.created_at = row.created_at || now(); row.updated_at = now();
        rows.push(row);
      }
      store(d);
      return { data: null, error: null };
    }
    var hit = rows.filter(function (r) { return canRead(d, r) && match(r) && can(d, r); });
    if (this.op === "update") {
      var p = this.payload;
      hit.forEach(function (r) { Object.keys(p).forEach(function (k) { r[k] = clone(p[k]); }); });
      store(d);
      return { data: null, error: null };
    }
    if (this.op === "delete") {
      d[t] = rows.filter(function (r) { return hit.indexOf(r) === -1; });
      store(d);
      return { data: null, error: null };
    }
  };

  function client() {
    return {
      auth: {
        getSession: function () {
          return Promise.resolve({ data: { session: signedIn() ? { user: { id: "u-" + me(), email: me() }, access_token: "x" } : null }, error: null });
        },
        signInWithOtp: function (o) {
          var d = load(), e = String(o.email || "").toLowerCase();
          window.zzbLastOtp = o;
          var ok = d.builders.some(function (b) { return b.email === e; }) || d.chronicle_members.some(function (m) { return m.email === e; }) || d.site_admins.some(function (a) { return a.email === e; });
          return Promise.resolve(ok ? { data: {}, error: null } : { data: null, error: { message: "This email has not been invited to a chronicle. Ask your Storyteller." } });
        },
        signOut: function () { localStorage.setItem("zzb-out", "1"); return Promise.resolve({ error: null }); },
        onAuthStateChange: function () { return { data: { subscription: { unsubscribe: function () {} } } }; }
      },
      rpc: function (name, args) {
        return new Promise(function (r) {
          setTimeout(function () {
            var d = load(), f = RPC[name];
            window.zzbLog.push("rpc " + name + " " + JSON.stringify(args || {}));
            if (!f) return r(err("Could not find the function public." + name));
            try { var out = f(d, args || {}); store(d); r({ data: out, error: null }); }
            catch (e) { r(err(String(e))); }
          }, 25);
        });
      },
      from: function (t) { return new Query(t); },
      storage: {
        from: function (bucket) {
          return {
            upload: function (path, blob, opts) {
              return new Promise(function (resolve) {
                var d = load();
                window.zzbLog.push("upload " + bucket + " " + path);
                if (bucket === "world-media" && !editor(d, path.split("/")[0])) return resolve(err("new row violates row-level security policy"));
                var done = function (w, h) {
                  var dd = load();
                  dd.storage[bucket + "/" + path] = { type: (opts && opts.contentType) || blob.type, size: blob.size, w: w, h: h };
                  store(dd);
                  resolve({ data: { path: path }, error: null });
                };
                if (/^image\//.test(blob.type) && window.createImageBitmap) {
                  createImageBitmap(blob).then(function (b) { done(b.width, b.height); }, function () { done(0, 0); });
                } else done(0, 0);
              });
            },
            remove: function (paths) {
              var d = load();
              paths.forEach(function (p) { window.zzbLog.push("remove " + bucket + " " + p); delete d.storage[bucket + "/" + p]; });
              store(d);
              return Promise.resolve({ data: [], error: null });
            },
            createSignedUrl: function (p) { return Promise.resolve({ data: { signedUrl: "data:text/plain,signed " + encodeURIComponent(p) }, error: null }); }
          };
        }
      }
    };
  }
  window.supabase = { createClient: function () { return client(); } };

  // Pictures: a placeholder showing the stored path and its size, so
  // nothing is fetched from the live storage.
  function patchMedia() {
    if (!window.ChronicleContent || window.ChronicleContent.__zzb) return;
    window.ChronicleContent.mediaUrl = function (path) {
      if (!path) return "";
      if (/^https?:|^data:|^blob:/.test(path)) return path;
      var m = load().storage["world-media/" + path];
      var w = m && m.w ? m.w : 400, h = m && m.h ? m.h : 300;
      var label = (m ? (m.w ? m.w + "x" + m.h : m.type) : "MISSING") + " " + path.split("/").pop();
      return "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '"><rect width="100%" height="100%" fill="#2a2545"/><text x="10" y="' + (h / 2) + '" font-size="' + Math.max(18, w / 22) + '" fill="#fff">' + label.replace(/[<&]/g, "") + "</text></svg>");
    };
    window.ChronicleContent.__zzb = true;
  }
  document.addEventListener("DOMContentLoaded", patchMedia);
  setTimeout(patchMedia, 0);

  // Test files: the next file chooser gets this file.
  window.zzbMakeImage = function (w, h, name) {
    return new Promise(function (resolve) {
      var c = document.createElement("canvas"); c.width = w; c.height = h;
      var x = c.getContext("2d"); var gr = x.createLinearGradient(0, 0, w, h); gr.addColorStop(0, "#c33"); gr.addColorStop(1, "#33c");
      x.fillStyle = gr; x.fillRect(0, 0, w, h); x.fillStyle = "#fff"; x.font = "40px sans-serif"; x.fillText(name || "test", 20, 60);
      c.toBlob(function (b) { resolve(new File([b], name || "test.png", { type: "image/png" })); }, "image/png");
    });
  };
  window.zzbNext = null;
  var click = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function () {
    if (this.type === "file" && window.zzbNext) {
      var f = window.zzbNext, inp = this; window.zzbNext = null;
      var dt = new DataTransfer(); dt.items.add(f); inp.files = dt.files;
      setTimeout(function () { inp.dispatchEvent(new Event("change")); }, 0);
      return;
    }
    return click.apply(this, arguments);
  };
})();
