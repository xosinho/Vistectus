/* =====================================================================
   THE DEAD HAND — Locations
   ---------------------------------------------------------------------
   A city map of pins, plus area maps and building plans with tokens.

   Everything lives in the site's Supabase project (setup: setup.sql
   beside this file, and the chronicle README). The database decides
   who sees what:
     - anyone sees the pins and maps a Storyteller has revealed, with
       the description written for players;
     - a signed-in Storyteller sees and changes everything, including
       private notes, factions and saved setups.
   This file holds no chronicle content of its own. Keep it that way:
   the page is public, and so is its code.
   ===================================================================== */
(function () {
  "use strict";

  var CHRONICLE = "dead-hand";
  var BUCKET = "location-maps";
  var PLAYER_PIN = "#c9a227";        // every pin, as players see them
  var CENTRE = [40.6805, -74.004];   // Carroll Gardens / Red Hook
  var TOKEN_COLORS = ["#a3202c", "#2f6f4f", "#2a5d8f", "#c9a227", "#5a3a7a", "#8a4a1a", "#3a3a3a", "#c96f9e"];

  // Real, public landmarks for lining pins up by eye. Storytellers only.
  var REFERENCE_LANDMARKS = [
    { id: "ref_defontes", name: "Defonte's (379 Columbia St.)", lat: 40.678986, lng: -74.005456,
      desc: "Real landmark on Columbia St., to check where the Columbia St. pins should fall." },
    { id: "ref_cruise", name: "Brooklyn Cruise Terminal (Pier 12)", lat: 40.682, lng: -74.01433,
      desc: "Real pier on the Atlantic Basin: the actual Red Hook waterfront. West of it is open water." }
  ];

  var cfg = window.BUILDERS_CONFIG || {};
  var db = (cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase)
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;

  var S = {
    st: false, session: null,
    pins: [], notes: {}, factions: {}, factionList: [], maps: [], urls: {}, setups: [],
    mode: "city", active: { area: null, building: null },
    zoom: 1, panX: 0, panY: 0,
    placingPin: false, placingId: null, pendingLatLng: null, editingId: null,
    tokenTemplate: null, selectedToken: null, tokenSaveTimer: null,
    paneCollapsed: window.matchMedia("(max-width:760px)").matches
  };
  var map = null, layer = null;

  /* ------------------------------------------------------------ helpers */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function errText(e) { return (e && e.message) ? e.message : String(e); }
  function uid(prefix) { return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(t._to);
    t._to = setTimeout(function () { t.classList.remove("show"); }, 2400);
  }
  function openModal(id) { $(id).classList.add("show"); }
  function closeModal(id) { $(id).classList.remove("show"); }
  async function run(q, what) {
    var r = await q;
    if (r && r.error) throw new Error((what ? what + ": " : "") + errText(r.error));
    return r ? r.data : null;
  }
  function fail(e) { console.error(e); window.alert(errText(e)); }

  function factionOf(p) { return (S.notes[p.id] && S.notes[p.id].faction) || "neutral"; }
  function colorOf(p) {
    if (!S.st) return PLAYER_PIN;
    var f = S.factions[factionOf(p)];
    return f ? f.color : PLAYER_PIN;
  }
  function onMap(p) { return p.lat != null && p.lng != null; }

  /* ------------------------------------------------------------ loading */
  async function load() {
    if (!db) {
      $("nav-body").innerHTML = '<div class="notice">The locations are not connected yet.</div>';
      switchMode("city");
      return;
    }
    try {
      S.session = (await db.auth.getSession()).data.session;
      S.st = false;
      if (S.session) {
        var r = await db.rpc("is_storyteller");
        S.st = !r.error && r.data === true;
      }
      var got = await Promise.all([
        run(db.from("location_pins").select("*").eq("chronicle", CHRONICLE).order("sort", { ascending: true }), "Pins"),
        run(db.from("location_maps").select("*").eq("chronicle", CHRONICLE).order("created_at", { ascending: true }), "Maps")
      ]);
      S.pins = got[0] || [];
      S.maps = got[1] || [];
      S.notes = {}; S.factions = {}; S.factionList = []; S.setups = [];
      if (S.st) {
        var st = await Promise.all([
          run(db.from("location_notes").select("*"), "Notes"),
          run(db.from("location_factions").select("*").order("sort", { ascending: true }), "Factions"),
          run(db.from("location_setups").select("*").eq("chronicle", CHRONICLE).order("saved_at", { ascending: false }), "Setups")
        ]);
        (st[0] || []).forEach(function (n) { S.notes[n.id] = n; });
        S.factionList = st[1] || [];
        S.factionList.forEach(function (f) { S.factions[f.key] = f; });
        S.setups = st[2] || [];
      }
      await signMapUrls();
    } catch (e) {
      console.error(e);
      $("nav-body").innerHTML = '<div class="notice">Could not reach the locations: ' + esc(errText(e)) + "</div>";
    }
    renderHeader();
    document.body.classList.toggle("viewer-only", !S.st);
    switchMode(S.mode);
  }

  // Map images sit in a private bucket: each needs a short-lived address.
  async function signMapUrls() {
    S.urls = {};
    if (!S.maps.length) return;
    var paths = S.maps.map(function (m) { return m.image_path; });
    var r = await db.storage.from(BUCKET).createSignedUrls(paths, 60 * 60 * 6);
    if (r.error) throw r.error;
    (r.data || []).forEach(function (x) { if (x.signedUrl) S.urls[x.path] = x.signedUrl; });
  }

  function renderHeader() {
    var who = $("who");
    if (!db) { who.innerHTML = ""; return; }
    who.innerHTML = S.st
      ? '<span>Storyteller</span><button class="pin-mini" id="signOutBtn">Sign out</button>'
      : (S.session
        ? '<span>Signed in</span><button class="pin-mini" id="signOutBtn">Sign out</button>'
        : '<span></span><button class="pin-mini" id="signInBtn">Storyteller sign in</button>');
    var out = $("signOutBtn"), inn = $("signInBtn");
    if (out) out.addEventListener("click", async function () { await db.auth.signOut(); S.st = false; load(); });
    if (inn) inn.addEventListener("click", function () {
      $("signin-msg").textContent = ""; $("signin-send").disabled = false;
      openModal("modal-signin"); $("signin-email").focus();
    });
  }

  /* ------------------------------------------------------ pane and modes */
  function applyPane() {
    $("nav").classList.toggle("collapsed", S.paneCollapsed);
    $("pane-toggle").textContent = S.paneCollapsed ? "‹ Panel" : "Panel ›";
  }
  $("pane-toggle").addEventListener("click", function () {
    S.paneCollapsed = !S.paneCollapsed;
    applyPane();
    setTimeout(function () { if (map && S.mode === "city") map.invalidateSize(); }, 60);
  });

  document.querySelectorAll(".mode-tab").forEach(function (t) {
    t.addEventListener("click", function () { switchMode(t.getAttribute("data-mode")); });
  });

  function switchMode(mode) {
    S.mode = mode;
    document.querySelectorAll(".mode-tab").forEach(function (t) { t.classList.toggle("active", t.getAttribute("data-mode") === mode); });
    $("city-view").style.display = mode === "city" ? "block" : "none";
    $("canvas-view").style.display = mode === "city" ? "none" : "block";
    cancelPinPlacement();
    cancelTokenPlacement();
    if (mode === "city") {
      $("empty-state").style.display = "none";
      $("zoom-readout").classList.remove("show");
      $("board-title").classList.remove("show");
      initCityMap();
      renderCityToolbar();
    } else {
      initCanvas();
    }
    renderNav();
  }

  /* ------------------------------------------------------------ city map */
  function initCityMap() {
    if (map) { map.invalidateSize(); renderPins(); return; }
    // Zoom buttons bottom right: the toolbar sits top left.
    map = L.map("city-view", { zoomControl: false }).setView(CENTRE, 14);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors", maxZoom: 19
    }).addTo(map);
    layer = L.layerGroup().addTo(map);
    map.on("click", function (e) {
      if (!S.placingPin) return;
      var placingId = S.placingId;
      cancelPinPlacement();
      if (placingId) { movePin(placingId, e.latlng.lat, e.latlng.lng); return; }
      S.pendingLatLng = e.latlng;
      openPinModal(null);
    });
    renderPins();
  }

  function icon(color, ref) {
    return ref
      ? L.divIcon({ className: "", html: '<div class="ref-icon"></div>', iconSize: [16, 16], iconAnchor: [8, 8], popupAnchor: [0, -10] })
      : L.divIcon({ className: "", html: '<div class="pin-icon" style="background:' + color + ';"></div>', iconSize: [22, 22], iconAnchor: [11, 20], popupAnchor: [0, -20] });
  }

  function popupHtml(p) {
    var h = "<h3>" + esc(p.name) + "</h3>" + (p.description ? "<p>" + esc(p.description) + "</p>" : "");
    if (!S.st) return h;
    var n = S.notes[p.id] || {}, f = S.factions[factionOf(p)];
    h += (p.revealed ? '<span class="shown-tag">Revealed</span>' : '<span class="hidden-tag">Hidden from players</span>');
    if (f) h += ' <span class="tag" style="background:' + esc(f.color) + ';color:#fff;">' + esc(f.label) + "</span>";
    if (n.notes) h += '<div class="st-notes"><b>Your notes</b>' + esc(n.notes) + "</div>";
    h += '<div class="drag-hint">✥ Drag to move</div>' +
      '<div class="popup-actions">' +
        '<button data-act="edit" data-id="' + esc(p.id) + '">Edit</button>' +
        '<button data-act="reveal" data-id="' + esc(p.id) + '">' + (p.revealed ? "Hide" : "Reveal") + "</button>" +
        '<button class="danger" data-act="delete" data-id="' + esc(p.id) + '">Delete</button>' +
      "</div>";
    return h;
  }

  function renderPins() {
    if (!layer) return;
    layer.clearLayers();
    if (S.st) {
      REFERENCE_LANDMARKS.forEach(function (p) {
        L.marker([p.lat, p.lng], { icon: icon(null, true) })
          .bindPopup("<h3>" + esc(p.name) + "</h3><p>" + esc(p.desc) + '</p><span class="tag" style="background:#6b6257;color:#fff;">Real reference · fixed</span>')
          .addTo(layer);
      });
    }
    S.pins.filter(onMap).forEach(function (p) {
      var m = L.marker([p.lat, p.lng], { icon: icon(colorOf(p)), draggable: S.st, autoPan: true, opacity: (S.st && !p.revealed) ? 0.6 : 1 });
      m.bindPopup(popupHtml(p));
      m._pinId = p.id;
      if (S.st) m.on("dragend", function (e) { var ll = e.target.getLatLng(); movePin(p.id, ll.lat, ll.lng); });
      m.addTo(layer);
    });
  }

  // Popup buttons are drawn as HTML, so they are handled here.
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]");
    if (!b) return;
    var id = b.getAttribute("data-id"), act = b.getAttribute("data-act");
    if (act === "fly") {                      // anyone: find it on the map
      var p = pinById(id);
      if (p && onMap(p) && map) {
        map.flyTo([p.lat, p.lng], 17, { duration: 0.8 });
        layer.eachLayer(function (m) { if (m._pinId === id) setTimeout(function () { m.openPopup(); }, 850); });
      }
      return;
    }
    if (!S.st) return;
    if (act === "edit") { if (map) map.closePopup(); openPinModal(id); }
    else if (act === "reveal") toggleReveal(id);
    else if (act === "delete") deletePin(id);
    else if (act === "place") armPlacement(id);
  });

  function pinById(id) { return S.pins.filter(function (p) { return p.id === id; })[0]; }

  function renderCityToolbar() {
    var tb = $("toolbar");
    if (!S.st) { tb.classList.remove("show"); tb.innerHTML = ""; return; }
    tb.classList.add("show");
    tb.innerHTML =
      '<button id="add-pin-btn"><span class="swatch" style="background:' + PLAYER_PIN + ';"></span> Add Location Pin</button>' +
      '<button id="save-setup-btn" title="Save every pin as it is now, under a name">Save Setup</button>' +
      '<button id="load-setup-btn" title="Load, export or import saved setups">Setups…</button>';
    $("add-pin-btn").addEventListener("click", function () {
      if (S.placingPin) cancelPinPlacement(); else armPlacement(null);
    });
    $("save-setup-btn").addEventListener("click", saveSetup);
    $("load-setup-btn").addEventListener("click", function () { renderSetups(); openModal("modal-configs"); });
  }
  function armPlacement(id) {
    if (S.mode !== "city") switchMode("city");
    S.placingPin = true; S.placingId = id;
    var b = $("add-pin-btn");
    if (b) { b.classList.add("active-token-btn"); b.textContent = id ? "Click the map to place it…" : "Click the map to drop pin…"; }
    $("city-view").style.cursor = "crosshair";
    if (map) map.closePopup();
  }
  function cancelPinPlacement() {
    S.placingPin = false; S.placingId = null;
    $("city-view").style.cursor = "";
    var b = $("add-pin-btn");
    if (b) { b.classList.remove("active-token-btn"); b.innerHTML = '<span class="swatch" style="background:' + PLAYER_PIN + ';"></span> Add Location Pin'; }
  }

  /* ---------------------------------------------------------- pin edits */
  function openPinModal(id) {
    S.editingId = id;
    var p = id ? pinById(id) : null, n = (id && S.notes[id]) || {};
    $("pin-modal-title").textContent = id ? "EDIT PIN" : "NEW LOCATION PIN";
    $("pin-name").value = p ? p.name : "";
    $("pin-desc").value = p ? p.description : "";
    $("pin-notes").value = n.notes || "";
    $("pin-faction").innerHTML = S.factionList.map(function (f) {
      return '<option value="' + esc(f.key) + '">' + esc(f.label) + "</option>";
    }).join("");
    $("pin-faction").value = (p ? factionOf(p) : "neutral");
    $("pin-revealed").checked = p ? !!p.revealed : false;
    $("pin-offmap-row").style.display = (p && onMap(p)) ? "" : "none";
    $("pin-offmap").checked = false;
    $("pin-save-btn").textContent = id ? "Save Changes" : "Place Pin";
    openModal("modal-pin");
  }

  $("pin-save-btn").addEventListener("click", async function () {
    var name = $("pin-name").value.trim();
    if (!name) { window.alert("Give the location a name."); return; }
    var fields = { name: name, description: $("pin-desc").value.trim(), revealed: $("pin-revealed").checked, updated_at: new Date().toISOString() };
    var note = { faction: $("pin-faction").value || "neutral", notes: $("pin-notes").value.trim() };
    var btn = this; btn.disabled = true;
    try {
      if (S.editingId) {
        if ($("pin-offmap").checked) { fields.lat = null; fields.lng = null; }
        await run(db.from("location_pins").update(fields).eq("id", S.editingId), "Saving the pin");
        await run(db.from("location_notes").upsert(Object.assign({ id: S.editingId }, note)), "Saving your notes");
      } else {
        var id = uid("pin");
        var sort = S.pins.reduce(function (m, p) { return Math.max(m, p.sort || 0); }, 0) + 1;
        var row = Object.assign({ id: id, chronicle: CHRONICLE, sort: sort }, fields);
        if (S.pendingLatLng) { row.lat = S.pendingLatLng.lat; row.lng = S.pendingLatLng.lng; }
        await run(db.from("location_pins").insert(row), "Adding the pin");
        await run(db.from("location_notes").insert(Object.assign({ id: id }, note)), "Saving your notes");
      }
      closeModal("modal-pin");
      S.pendingLatLng = null;
      toast(S.editingId ? "Pin updated" : "Pin added");
      await load();
    } catch (e) { fail(e); }
    btn.disabled = false;
  });

  async function movePin(id, lat, lng) {
    try {
      await run(db.from("location_pins").update({ lat: lat, lng: lng, updated_at: new Date().toISOString() }).eq("id", id), "Moving the pin");
      var p = pinById(id);
      if (p) { p.lat = lat; p.lng = lng; }
      renderPins(); renderNav();
      toast("Pin moved");
    } catch (e) { fail(e); load(); }
  }
  async function toggleReveal(id) {
    var p = pinById(id);
    if (!p) return;
    try {
      await run(db.from("location_pins").update({ revealed: !p.revealed }).eq("id", id), "Changing who can see it");
      toast(p.revealed ? "Hidden from players" : "Revealed to players");
      if (map) map.closePopup();
      await load();
    } catch (e) { fail(e); }
  }
  async function deletePin(id) {
    var p = pinById(id);
    if (!p || !window.confirm('Delete "' + p.name + '" and your notes on it? A saved setup can bring it back.')) return;
    try {
      await run(db.from("location_pins").delete().eq("id", id), "Deleting the pin");
      if (map) map.closePopup();
      toast("Pin deleted");
      await load();
    } catch (e) { fail(e); }
  }

  /* -------------------------------------------------------------- setups */
  async function saveSetup() {
    var name = window.prompt("Name this setup:", "Session " + (S.setups.length + 1));
    if (!name || !name.trim()) return;
    try {
      var snap = await run(db.rpc("location_snapshot", { p_chronicle: CHRONICLE }), "Reading the pins");
      await run(db.from("location_setups").insert({ chronicle: CHRONICLE, name: name.trim().slice(0, 60), snapshot: snap }), "Saving the setup");
      toast("Setup saved: " + name.trim());
      await load();
    } catch (e) { fail(e); }
  }
  function renderSetups() {
    var wrap = $("configs-list");
    if (!S.setups.length) {
      wrap.innerHTML = '<div class="empty-hint" style="padding-top:0;">No saved setups yet. Use Save Setup to keep every pin as it is now, or import one from a file below.</div>';
      return;
    }
    wrap.innerHTML = S.setups.map(function (c) {
      var n = (c.snapshot && c.snapshot.pins || []).length;
      return '<div class="cfg-row"><div><div class="cfg-name">' + esc(c.name) + '</div><div class="cfg-meta">' +
        esc(new Date(c.saved_at).toLocaleString()) + " · " + n + ' pins</div></div><div class="cfg-actions">' +
        '<button class="pin-mini" data-load="' + c.id + '">Load</button>' +
        '<button class="pin-mini danger" data-delcfg="' + c.id + '">Delete</button></div></div>';
    }).join("");
    wrap.querySelectorAll("[data-load]").forEach(function (b) {
      b.addEventListener("click", async function () {
        var c = S.setups.filter(function (x) { return String(x.id) === b.getAttribute("data-load"); })[0];
        if (!c || !window.confirm('Load "' + c.name + '"? Every pin goes back to how it was then, and pins added since are removed.')) return;
        try {
          await run(db.rpc("apply_location_snapshot", { p_chronicle: CHRONICLE, p_snapshot: c.snapshot }), "Loading the setup");
          closeModal("modal-configs"); toast("Loaded: " + c.name); await load();
        } catch (e) { fail(e); }
      });
    });
    wrap.querySelectorAll("[data-delcfg]").forEach(function (b) {
      b.addEventListener("click", async function () {
        if (!window.confirm("Delete this saved setup?")) return;
        try {
          await run(db.from("location_setups").delete().eq("id", +b.getAttribute("data-delcfg")), "Deleting the setup");
          await load(); renderSetups();
        } catch (e) { fail(e); }
      });
    });
  }
  $("cfg-export-btn").addEventListener("click", async function () {
    try {
      var snap = await run(db.rpc("location_snapshot", { p_chronicle: CHRONICLE }), "Reading the pins");
      var data = Object.assign({ _deadhand: "locations", exportedAt: new Date().toISOString() }, snap);
      var url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      var a = document.createElement("a");
      a.href = url; a.download = "dead-hand-locations.json";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      toast("Exported. The file holds your notes: keep it private.");
    } catch (e) { fail(e); }
  });
  $("cfg-import-btn").addEventListener("click", function () { $("cfg-import-input").click(); });
  $("cfg-import-input").addEventListener("change", function (e) {
    var f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    var reader = new FileReader();
    reader.onload = async function () {
      try {
        var data = JSON.parse(reader.result);
        if (!data || !Array.isArray(data.pins)) throw new Error("That file is not a locations setup exported from this page.");
        if (!window.confirm("Replace every pin with the " + data.pins.length + " in this file? It is also kept as a saved setup.")) return;
        var snap = { pins: data.pins };
        await run(db.rpc("apply_location_snapshot", { p_chronicle: CHRONICLE, p_snapshot: snap }), "Importing");
        await run(db.from("location_setups").insert({ chronicle: CHRONICLE, name: ("Imported " + new Date().toLocaleDateString()).slice(0, 60), snapshot: snap }), "Keeping it as a setup");
        closeModal("modal-configs"); toast("Imported"); await load();
      } catch (err) { fail(err); }
    };
    reader.readAsText(f);
  });

  /* ------------------------------------------------- area and building maps */
  function mapsOfMode() { return S.maps.filter(function (m) { return m.kind === S.mode; }); }
  function activeMap() {
    var list = mapsOfMode(), id = S.active[S.mode];
    return list.filter(function (m) { return m.id === id; })[0] || list[0] || null;
  }

  function initCanvas() {
    var m = activeMap();
    var tb = $("toolbar");
    if (!m) {
      $("canvas-view").style.display = "none";
      $("empty-state").style.display = "flex";
      $("empty-state").querySelector("h2").textContent = S.mode === "area" ? "NO AREA MAP YET" : "NO BUILDING PLAN YET";
      $("empty-state").querySelector("p").textContent = S.st
        ? "Add an image from the panel on the right to start placing tokens."
        : "Nothing to show here yet.";
      tb.classList.remove("show");
      $("zoom-readout").classList.remove("show");
      $("board-title").classList.remove("show");
      return;
    }
    S.active[S.mode] = m.id;
    $("empty-state").style.display = "none";
    $("canvas-view").style.display = "block";
    $("zoom-readout").classList.add("show");
    $("board-title").classList.add("show");
    $("board-title").textContent = m.name;
    if (S.st) {
      tb.classList.add("show");
      tb.innerHTML =
        '<button data-token="player"><span class="swatch" style="background:' + TOKEN_COLORS[3] + ';"></span> Player Token</button>' +
        '<button data-token="npc"><span class="swatch" style="background:' + TOKEN_COLORS[0] + ';"></span> NPC Token</button>' +
        '<button data-token="general"><span class="swatch" style="background:' + TOKEN_COLORS[6] + ';"></span> General Token</button>';
      tb.querySelectorAll("[data-token]").forEach(function (b) {
        b.addEventListener("click", function () { openTokenModal(b.getAttribute("data-token")); });
      });
    } else { tb.classList.remove("show"); tb.innerHTML = ""; }
    loadCanvasImage(m);
  }

  function loadCanvasImage(m) {
    var world = $("canvas-world");
    world.innerHTML = "";
    var src = S.urls[m.image_path];
    if (!src) { world.textContent = ""; return; }
    var img = document.createElement("img");
    img.alt = m.name;
    img.onload = function () {
      world.style.width = img.naturalWidth + "px";
      world.style.height = img.naturalHeight + "px";
      var vp = $("canvas-viewport");
      S.zoom = Math.min(vp.clientWidth / img.naturalWidth, vp.clientHeight / img.naturalHeight, 1) * 0.92;
      S.panX = (vp.clientWidth - img.naturalWidth * S.zoom) / 2;
      S.panY = (vp.clientHeight - img.naturalHeight * S.zoom) / 2;
      applyTransform();
      renderTokens();
    };
    img.src = src;
    world.appendChild(img);
  }
  function applyTransform() {
    $("canvas-world").style.transform = "translate(" + S.panX + "px," + S.panY + "px) scale(" + S.zoom + ")";
    $("zoom-readout").textContent = "ZOOM " + Math.round(S.zoom * 100) + "%";
  }

  (function panZoom() {
    var vp = $("canvas-viewport"), view = $("canvas-view"), pan = null;
    vp.addEventListener("wheel", function (e) {
      if (S.mode === "city" || !activeMap()) return;
      e.preventDefault();
      var r = vp.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      var wx = (mx - S.panX) / S.zoom, wy = (my - S.panY) / S.zoom;
      var z = Math.min(6, Math.max(0.1, S.zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
      S.panX = mx - wx * z; S.panY = my - wy * z; S.zoom = z;
      applyTransform();
    }, { passive: false });
    vp.addEventListener("pointerdown", function (e) {
      if (e.target.closest(".token") || view.classList.contains("placing")) return;
      pan = { x: e.clientX, y: e.clientY, px: S.panX, py: S.panY };
      view.classList.add("dragging");
    });
    window.addEventListener("pointermove", function (e) {
      if (!pan) return;
      S.panX = pan.px + (e.clientX - pan.x); S.panY = pan.py + (e.clientY - pan.y);
      applyTransform();
    });
    function endPan() { pan = null; view.classList.remove("dragging"); }
    window.addEventListener("pointerup", endPan);
    window.addEventListener("pointercancel", endPan);
    view.addEventListener("click", function (e) {
      if (!view.classList.contains("placing") || e.target.closest(".token")) return;
      var r = vp.getBoundingClientRect();
      placeToken((e.clientX - r.left - S.panX) / S.zoom, (e.clientY - r.top - S.panY) / S.zoom);
    });
  })();

  function tokensOf(m) { return Array.isArray(m.tokens) ? m.tokens : (m.tokens = []); }

  function renderTokens() {
    var world = $("canvas-world"), m = activeMap();
    world.querySelectorAll(".token, .token-label").forEach(function (n) { n.remove(); });
    if (!m) return;
    tokensOf(m).forEach(function (t) {
      var el = document.createElement("div");
      el.className = "token" + (S.selectedToken === t.id ? " selected" : "");
      el.style.left = t.x + "px"; el.style.top = t.y + "px";
      el.style.background = /^#[0-9a-f]{6}$/i.test(t.color) ? t.color : TOKEN_COLORS[6];
      el.textContent = t.kind === "player" ? "P" : (t.kind === "npc" ? "N" : "•");
      el.title = t.label || "";
      if (S.st) dragToken(el, t, m);
      world.appendChild(el);
      if (t.label) {
        var lbl = document.createElement("div");
        lbl.className = "token-label";
        lbl.style.left = t.x + "px"; lbl.style.top = (t.y + 16) + "px";
        lbl.textContent = t.label;
        world.appendChild(lbl);
      }
    });
  }

  function dragToken(el, t, m) {
    el.addEventListener("pointerdown", function (e) {
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      S.selectedToken = t.id;
      var sx = e.clientX, sy = e.clientY, ox = t.x, oy = t.y, moved = false;
      function move(ev) {
        t.x = ox + (ev.clientX - sx) / S.zoom; t.y = oy + (ev.clientY - sy) / S.zoom;
        el.style.left = t.x + "px"; el.style.top = t.y + "px";
        var lbl = el.nextSibling;
        if (lbl && lbl.classList && lbl.classList.contains("token-label")) { lbl.style.left = t.x + "px"; lbl.style.top = (t.y + 16) + "px"; }
        moved = true;
      }
      function up() {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
        if (moved) saveTokensSoon(m);
      }
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
    });
    el.addEventListener("dblclick", function (e) {
      e.stopPropagation();
      if (!window.confirm('Remove token "' + (t.label || t.kind) + '"?')) return;
      m.tokens = tokensOf(m).filter(function (x) { return x.id !== t.id; });
      renderTokens(); saveTokensSoon(m);
    });
  }

  function saveTokensSoon(m) {
    clearTimeout(S.tokenSaveTimer);
    S.tokenSaveTimer = setTimeout(async function () {
      try { await run(db.from("location_maps").update({ tokens: tokensOf(m) }).eq("id", m.id), "Saving the tokens"); }
      catch (e) { fail(e); }
    }, 500);
  }

  function openTokenModal(kind) {
    document.querySelectorAll(".kind-opt").forEach(function (k) { k.classList.toggle("picked", k.getAttribute("data-kind") === kind); });
    $("token-label").value = "";
    buildColorRow();
    openModal("modal-token");
  }
  function buildColorRow() {
    var row = $("token-colors");
    row.innerHTML = "";
    TOKEN_COLORS.forEach(function (c, i) {
      var o = document.createElement("div");
      o.className = "color-opt" + (i === 0 ? " picked" : "");
      o.style.background = c;
      o.setAttribute("data-color", c);
      o.addEventListener("click", function () {
        document.querySelectorAll(".color-opt").forEach(function (x) { x.classList.remove("picked"); });
        o.classList.add("picked");
      });
      row.appendChild(o);
    });
  }
  document.querySelectorAll(".kind-opt").forEach(function (o) {
    o.addEventListener("click", function () {
      document.querySelectorAll(".kind-opt").forEach(function (x) { x.classList.remove("picked"); });
      o.classList.add("picked");
    });
  });
  $("token-save-btn").addEventListener("click", function () {
    S.tokenTemplate = {
      kind: document.querySelector(".kind-opt.picked").getAttribute("data-kind"),
      label: $("token-label").value.trim().slice(0, 40),
      color: document.querySelector(".color-opt.picked").getAttribute("data-color")
    };
    closeModal("modal-token");
    $("canvas-view").classList.add("placing");
    toast("Click the map to place the token");
  });
  function placeToken(x, y) {
    var m = activeMap(), t = S.tokenTemplate;
    if (!m || !t) return;
    tokensOf(m).push({ id: uid("tok"), kind: t.kind, label: t.label, color: t.color, x: x, y: y });
    cancelTokenPlacement();
    renderTokens(); saveTokensSoon(m);
  }
  function cancelTokenPlacement() { S.tokenTemplate = null; $("canvas-view").classList.remove("placing"); }

  // Uploaded maps are scaled down and saved as JPEG, to keep them light.
  function compressImage(file, maxDim, quality) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = reject;
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error("That file is not an image this browser can read.")); };
        img.onload = function () {
          var w = img.naturalWidth, h = img.naturalHeight;
          if (w > maxDim || h > maxDim) { var s = maxDim / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
          var c = document.createElement("canvas");
          c.width = w; c.height = h;
          c.getContext("2d").drawImage(img, 0, 0, w, h);
          c.toBlob(function (b) { b ? resolve(b) : reject(new Error("Could not prepare the image.")); }, "image/jpeg", quality);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  $("map-save-btn").addEventListener("click", async function () {
    var name = $("map-name").value.trim(), f = $("map-file").files && $("map-file").files[0];
    if (!name) { window.alert("Give the map a name."); return; }
    if (!f) { window.alert("Choose an image file."); return; }
    var btn = this; btn.disabled = true; btn.textContent = "Uploading…";
    try {
      var blob = await compressImage(f, 2400, 0.85);
      var id = uid("map"), path = CHRONICLE + "/" + id + ".jpg";
      await run(db.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false }), "Uploading the image");
      await run(db.from("location_maps").insert({ id: id, chronicle: CHRONICLE, kind: S.mode, name: name, image_path: path, revealed: $("map-revealed").checked }), "Saving the map");
      S.active[S.mode] = id;
      closeModal("modal-map");
      toast("Map added");
      await load();
    } catch (e) { fail(e); }
    btn.disabled = false; btn.textContent = "Add Map";
  });

  /* ------------------------------------------------------------ the panel */
  function renderNav() {
    var body = $("nav-body");
    if (!db) return;
    if (S.mode === "city") renderCityNav(body); else renderMapNav(body);
  }

  function pinItem(p) {
    var f = S.factions[factionOf(p)];
    var dot = '<span class="faction-dot" style="background:' + esc(colorOf(p)) + '"></span>';
    var h = '<div class="list-item" data-act="fly" data-id="' + esc(p.id) + '"><div class="row"><span class="name">' + dot + esc(p.name) +
      (S.st ? (p.revealed ? '<span class="shown-tag">Revealed</span>' : '<span class="hidden-tag">Hidden</span>') : "") + "</span>";
    if (S.st) {
      h += '<span class="pin-actions">' +
        (onMap(p) ? "" : '<button class="pin-mini" data-act="place" data-id="' + esc(p.id) + '">Place</button>') +
        '<button class="pin-mini" data-act="edit" data-id="' + esc(p.id) + '">Edit</button></span>';
    }
    h += "</div>";
    if (p.description) h += '<div class="desc">' + esc(p.description) + "</div>";
    if (S.st && S.notes[p.id] && S.notes[p.id].notes) h += '<div class="desc" style="opacity:.75"><em>Notes:</em> ' + esc(S.notes[p.id].notes.slice(0, 160)) + (S.notes[p.id].notes.length > 160 ? "…" : "") + "</div>";
    if (S.st && f && f.key !== "neutral") h += '<div class="desc">' + esc(f.label) + "</div>";
    return h + "</div>";
  }

  function renderCityNav(body) {
    var placed = S.pins.filter(onMap), off = S.pins.filter(function (p) { return !onMap(p); });
    var h = "";
    if (!S.st) h += '<div class="notice">Places the cell knows of. Click one to find it on the map.</div>';
    h += '<div class="nav-section-title">LOCATIONS <span></span></div>';
    h += placed.length ? placed.map(pinItem).join("") : '<div class="empty-hint">No locations yet.</div>';
    if (off.length) {
      h += '<div class="nav-section-title" style="margin-top:22px;">NOT ON THE MAP <span></span></div>';
      h += off.map(pinItem).join("");
    }
    if (S.st) {
      h += '<div class="empty-hint">Pins start hidden. Reveal one from its pop-up or the Edit window, and players see its name and the description you wrote for them, never your notes or its faction.</div>';
      h += '<div class="nav-section-title" style="margin-top:22px;">REAL REFERENCE POINTS <span></span></div>';
      REFERENCE_LANDMARKS.forEach(function (o) {
        h += '<div class="list-item" data-ref="' + o.id + '"><div class="name"><span class="faction-dot" style="background:#6b6257"></span>' + esc(o.name) + '</div><div class="desc">' + esc(o.desc) + "</div></div>";
      });
    }
    body.innerHTML = h;
    body.querySelectorAll("[data-ref]").forEach(function (item) {
      item.addEventListener("click", function () {
        var o = REFERENCE_LANDMARKS.filter(function (x) { return x.id === item.getAttribute("data-ref"); })[0];
        if (o && map) map.flyTo([o.lat, o.lng], 17, { duration: 0.8 });
      });
    });
  }

  function renderMapNav(body) {
    var list = mapsOfMode(), active = activeMap();
    var label = S.mode === "area" ? "AREA MAPS" : "BUILDING PLANS";
    var h = '<div class="nav-section-title">' + label + (S.st ? ' <span class="add-link" id="add-map-link">+ Add Map</span>' : " <span></span>") + "</div>";
    if (!list.length) h += '<div class="empty-hint">' + (S.st ? "None yet. Add a block layout or floor plan to start placing tokens." : "None yet.") + "</div>";
    list.forEach(function (m) {
      var src = S.urls[m.image_path];
      h += '<div class="list-item' + (active && m.id === active.id ? " active" : "") + '" data-select="' + esc(m.id) + '">' +
        (src ? '<img class="thumb" src="' + esc(src) + '" alt="">' : "") +
        '<div class="row"><span class="name">' + esc(m.name) +
        (S.st ? (m.revealed ? '<span class="shown-tag">Revealed</span>' : '<span class="hidden-tag">Hidden</span>') : "") + "</span>" +
        (S.st ? '<span class="pin-actions"><button class="pin-mini" data-mreveal="' + esc(m.id) + '">' + (m.revealed ? "Hide" : "Reveal") + "</button>" +
                '<button class="pin-mini danger" data-mdelete="' + esc(m.id) + '">Remove</button></span>' : "") +
        "</div></div>";
    });
    if (S.st && list.length) h += '<div class="empty-hint">Double-click a token to remove it. Tokens save as you move them.</div>';
    body.innerHTML = h;

    var add = $("add-map-link");
    if (add) add.addEventListener("click", function () {
      $("modal-map-title").textContent = S.mode === "area" ? "ADD AREA MAP" : "ADD BUILDING PLAN";
      $("map-name").value = ""; $("map-file").value = ""; $("map-revealed").checked = false;
      openModal("modal-map");
    });
    body.querySelectorAll("[data-select]").forEach(function (item) {
      item.addEventListener("click", function (e) {
        if (e.target.closest("button")) return;
        S.active[S.mode] = item.getAttribute("data-select");
        initCanvas(); renderNav();
      });
    });
    body.querySelectorAll("[data-mreveal]").forEach(function (b) {
      b.addEventListener("click", async function () {
        var m = S.maps.filter(function (x) { return x.id === b.getAttribute("data-mreveal"); })[0];
        try {
          await run(db.from("location_maps").update({ revealed: !m.revealed }).eq("id", m.id), "Changing who can see it");
          toast(m.revealed ? "Hidden from players" : "Revealed to players");
          await load();
        } catch (e) { fail(e); }
      });
    });
    body.querySelectorAll("[data-mdelete]").forEach(function (b) {
      b.addEventListener("click", async function () {
        var m = S.maps.filter(function (x) { return x.id === b.getAttribute("data-mdelete"); })[0];
        if (!window.confirm('Remove "' + m.name + '" and its tokens? This cannot be undone.')) return;
        try {
          await run(db.from("location_maps").delete().eq("id", m.id), "Removing the map");
          await run(db.storage.from(BUCKET).remove([m.image_path]), "Removing the image");
          if (S.active[S.mode] === m.id) S.active[S.mode] = null;
          toast("Map removed");
          await load();
        } catch (e) { fail(e); }
      });
    });
  }

  /* -------------------------------------------------------------- sign in */
  $("signin-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var msg = $("signin-msg"), send = $("signin-send");
    send.disabled = true; msg.textContent = "Sending…";
    try {
      var r = await db.auth.signInWithOtp({
        email: $("signin-email").value.trim(),
        options: { shouldCreateUser: false, emailRedirectTo: window.location.href.split("#")[0] }
      });
      if (r.error) throw r.error;
      msg.textContent = "Link sent. Open it from your email and this page reopens, signed in.";
    } catch (err) {
      console.error(err);
      msg.textContent = /sign ?ups? not allowed|not found|invalid login/i.test(errText(err))
        ? "That address has no account." : "Could not send the link: " + errText(err);
      send.disabled = false;
    }
  });
  document.querySelectorAll("[data-close]").forEach(function (b) {
    b.addEventListener("click", function () { closeModal(b.getAttribute("data-close")); });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    document.querySelectorAll(".modal-overlay.show").forEach(function (m) { m.classList.remove("show"); });
    cancelPinPlacement(); cancelTokenPlacement();
  });

  if (db) {
    db.auth.onAuthStateChange(function (event, session) {
      var had = !!S.session;
      if ((event === "SIGNED_IN" && !had) || (event === "SIGNED_OUT" && had)) { S.session = session; load(); }
    });
  }

  applyPane();
  load();
})();
