/* =====================================================================
   D&D — Locations (one copy for every campaign)
   ---------------------------------------------------------------------
   The world map with pins, plus area maps and building plans with
   tokens. The same app as the Vampire and Hunter Locations boards
   (vtda/hungary-1242/crown-of-ice-and-bone/locations), for invented
   worlds: instead of a real-world street map, the Dungeon Master
   uploads a picture of the world and the pins sit on that.

   The page is a thin shell: it sets
     <body data-campaign="shrouded-campaign-one"
           data-campaign-name="Shrouded — Campaign One">
   holds the breadcrumb (<nav class="crumbs" id="crumbs">), and loads
   world.css, supabase-js, builders/config.js, gate.js and this file
   (with locations.css). Everything else is drawn here.

   The data lives in the site's Supabase project, in the shared tables
   (htr/brooklyn/dead-hand/locations/setup.sql, rules in
   admin/sql/access.sql, the 'world' kind allowed by dnd/sql/setup.sql).
   Every row carries chronicle = the campaign id:
     location_pins      the pins; lat/lng are world-map coordinates
     location_notes     the DM's notes and faction per pin
     location_maps      kind 'world' (one per campaign), 'area', 'building'
     location_setups    saved layouts of every pin
   Images go in the private 'location-maps' bucket under
   '<campaign id>/<file>' and are read back with signed addresses.
   The database decides who sees what: members see what the DM has
   revealed; the campaign's DM sees and changes everything.

   THE WORLD MAP
   Leaflet with CRS.Simple, the image laid over fixed bounds. The table
   only takes lat between -90 and 90 and lng between -180 and 180, so
   an image of W x H pixels is scaled by
       s = min(340 / W, 170 / H)
   and centred on 0,0: it spans lng -W*s/2 .. W*s/2 and
   lat -H*s/2 .. H*s/2 (north up). A pixel (x, y), measured from the
   top left, is at
       lat = H*s/2 - y*s,   lng = x*s - W*s/2
   and back
       x = (lng + W*s/2) / s,   y = (H*s/2 - lat) / s.
   A wide map spans 340 units across, a tall one 170 units high. Pins
   keep their coordinates when the DM replaces the image, so a new map
   of the same shape keeps every pin where it was.

   This file holds no campaign content. Keep it that way: its code is
   public.
   ===================================================================== */
(function () {
  "use strict";

  var body = document.body;
  var CAMPAIGN = body.getAttribute("data-campaign") || "";
  var CAMPAIGN_NAME = body.getAttribute("data-campaign-name") || CAMPAIGN;
  var BUCKET = "location-maps";
  var PLAYER_PIN = "#c9a227";        // every pin, as players see them
  var SPAN_W = 340, SPAN_H = 170;    // the world map's largest extent, in map units
  var WORLD_MAX = 4096;              // world map: longest side, in pixels
  var PLAN_MAX = 2400;               // area maps and building plans
  var MAX_BYTES = 4.8 * 1024 * 1024; // the bucket takes 5 MB per file
  var TOKEN_COLORS = ["#a3202c", "#2f6f4f", "#2a5d8f", "#c9a227", "#5a3a7a", "#8a4a1a", "#3a3a3a", "#c96f9e"];

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
  function checkRow(id, text, checked) {
    return '<div class="check-row"><input type="checkbox" id="' + id + '"' + (checked ? " checked" : "") +
      '><label for="' + id + '">' + text + "</label></div>";
  }

  /* ----------------------------------------------------------- the page */
  var CAMP = esc(CAMPAIGN_NAME);
  body.insertAdjacentHTML("afterbegin", [
    '<div id="app">',
    '  <div id="board">',
    '    <div id="world-view"></div>',
    '    <div id="canvas-view"><div id="canvas-viewport"><div id="canvas-world"></div></div></div>',
    '    <div id="empty-state" class="empty-board" style="display:none"></div>',
    '    <div id="toolbar"></div>',
    '    <div id="zoom-readout"></div>',
    '    <div id="board-title"></div>',
    '    <button id="pane-toggle" type="button">Panel ›</button>',
    "  </div>",
    '  <div id="nav">',
    '    <div id="nav-header">',
    '      <div class="eyebrow">DUNGEONS &amp; DRAGONS</div>',
    "      <h1>LOCATIONS</h1>",
    '      <div class="sub">' + CAMP + "</div>",
    '      <div class="who" id="who"></div>',
    "    </div>",
    '    <div id="mode-tabs">',
    '      <div class="mode-tab active" data-mode="world" role="button" tabindex="0">World map</div>',
    '      <div class="mode-tab" data-mode="area" role="button" tabindex="0">Area Map</div>',
    '      <div class="mode-tab" data-mode="building" role="button" tabindex="0">Building</div>',
    "    </div>",
    '    <div id="nav-body"><div class="empty-hint">Opening the map…</div></div>',
    "  </div>",
    "</div>",

    // DM: add / edit a pin
    '<div class="modal-overlay" id="modal-pin"><div class="modal wide">',
    '  <h3 id="pin-modal-title">NEW LOCATION PIN</h3>',
    '  <label for="pin-name">Name (players see this once revealed)</label>',
    '  <input type="text" id="pin-name" maxlength="120">',
    '  <label for="pin-desc">Description for players</label>',
    '  <textarea id="pin-desc" maxlength="4000" placeholder="What the party knows of this place."></textarea>',
    '  <label for="pin-notes">Your notes (only you see these)</label>',
    '  <textarea id="pin-notes" maxlength="8000" placeholder="What is really going on here."></textarea>',
    '  <label for="pin-faction">Faction (only you see this)</label>',
    '  <select id="pin-faction"></select>',
    "  " + checkRow("pin-revealed", "Revealed to players", false),
    '  <div id="pin-offmap-row">' + checkRow("pin-offmap", "Take it off the map (keep it in the list)", false) + "</div>",
    '  <div class="modal-actions">',
    '    <button class="btn-secondary" type="button" data-close="modal-pin">Cancel</button>',
    '    <button class="btn-primary" type="button" id="pin-save-btn">Place Pin</button>',
    "  </div>",
    "</div></div>",

    // DM: saved setups
    '<div class="modal-overlay" id="modal-configs"><div class="modal wide">',
    "  <h3>SAVED SETUPS</h3>",
    '  <div id="configs-list"></div>',
    '  <div class="divider-or">OR</div>',
    '  <div style="display:flex;gap:10px;flex-wrap:wrap;">',
    '    <button class="btn-secondary" type="button" id="cfg-export-btn">Export to file</button>',
    '    <button class="btn-secondary" type="button" id="cfg-import-btn">Import from file</button>',
    '    <input type="file" id="cfg-import-input" accept="application/json" style="display:none;">',
    "  </div>",
    '  <div class="modal-hint">A setup keeps every pin as it was: position, text, notes and whether it was revealed. Setups are saved online and only you can see them. An exported file holds your notes, so keep it private.</div>',
    '  <div class="modal-actions"><button class="btn-secondary" type="button" data-close="modal-configs">Close</button></div>',
    "</div></div>",

    // DM: add an area map / building plan, or replace the world map
    '<div class="modal-overlay" id="modal-map"><div class="modal">',
    '  <h3 id="modal-map-title">ADD MAP</h3>',
    '  <label for="map-name">Name</label>',
    '  <input type="text" id="map-name" maxlength="120">',
    '  <label for="map-file">Image</label>',
    '  <input type="file" id="map-file" accept="image/*">',
    "  " + checkRow("map-revealed", "Revealed to players", false),
    '  <div class="modal-hint" id="map-hint"></div>',
    '  <div class="modal-actions">',
    '    <button class="btn-secondary" type="button" data-close="modal-map">Cancel</button>',
    '    <button class="btn-primary" type="button" id="map-save-btn">Add Map</button>',
    "  </div>",
    "</div></div>",

    // DM: add a token
    '<div class="modal-overlay" id="modal-token"><div class="modal">',
    "  <h3>NEW TOKEN</h3>",
    "  <label>Type</label>",
    '  <div class="kind-row">',
    '    <div class="kind-opt picked" data-kind="player">Player</div>',
    '    <div class="kind-opt" data-kind="npc">NPC</div>',
    '    <div class="kind-opt" data-kind="general">General</div>',
    "  </div>",
    '  <label for="token-label">Label</label>',
    '  <input type="text" id="token-label" maxlength="40" placeholder="e.g. Goblin, Relic">',
    "  <label>Colour</label>",
    '  <div class="color-row" id="token-colors"></div>',
    '  <div class="modal-hint">After saving, click the map to drop the token. Drag it to move it; double-click to remove it.</div>',
    '  <div class="modal-actions">',
    '    <button class="btn-secondary" type="button" data-close="modal-token">Cancel</button>',
    '    <button class="btn-primary" type="button" id="token-save-btn">Place Token</button>',
    "  </div>",
    "</div></div>",

    '<div id="toast" role="status" aria-live="polite"></div>'
  ].join("\n"));

  // The breadcrumb is written in the page; it goes at the top of the panel.
  var crumbs = $("crumbs");
  if (crumbs) $("nav-header").insertBefore(crumbs, $("nav-header").firstChild);

  /* -------------------------------------------------------------- state */
  var db = null;
  var S = {
    st: false, session: null,
    pins: [], notes: {}, factions: {}, factionList: [], maps: [], urls: {}, setups: [],
    mode: "world", active: { area: null, building: null },
    zoom: 1, panX: 0, panY: 0,
    placingPin: false, placingId: null, pendingLatLng: null, editingId: null,
    tokenTemplate: null, selectedToken: null, tokenSaveTimer: null,
    mapModalKind: null,
    world: { path: null, w: 0, h: 0, scale: 1, bounds: null, fit: 0, loading: 0 },
    paneCollapsed: window.matchMedia("(max-width:760px)").matches
  };
  var map = null, layer = null, overlay = null;

  function factionOf(p) { return (S.notes[p.id] && S.notes[p.id].faction) || "neutral"; }
  function colorOf(p) {
    if (!S.st) return PLAYER_PIN;
    var f = S.factions[factionOf(p)];
    return f && /^#[0-9a-f]{6}$/i.test(f.color) ? f.color : PLAYER_PIN;
  }
  function onMap(p) { return p.lat != null && p.lng != null; }
  function worldMap() { return S.maps.filter(function (m) { return m.kind === "world"; })[0] || null; }
  function worldShown() { return !!(S.world.bounds && map && S.mode === "world" && $("world-view").style.display === "block"); }

  /* -------------------------------------------- world-map coordinates */
  function worldFrame(w, h) {
    var s = Math.min(SPAN_W / w, SPAN_H / h);
    var hw = w * s / 2, hh = h * s / 2;
    return { scale: s, bounds: L.latLngBounds([-hh, -hw], [hh, hw]) };
  }
  function pixelToMap(x, y) {
    var W = S.world, s = W.scale;
    return { lat: W.h * s / 2 - y * s, lng: x * s - W.w * s / 2 };
  }
  function mapToPixel(lat, lng) {
    var W = S.world, s = W.scale;
    return { x: (lng + W.w * s / 2) / s, y: (W.h * s / 2 - lat) / s };
  }
  function round5(n) { return Math.round(n * 1e5) / 1e5; }
  // Keep a position on the image (a pin dragged past its edge stops there).
  function clampToMap(lat, lng) {
    var p = mapToPixel(lat, lng);
    var m = pixelToMap(Math.min(S.world.w, Math.max(0, p.x)), Math.min(S.world.h, Math.max(0, p.y)));
    return { lat: round5(m.lat), lng: round5(m.lng) };
  }

  /* ------------------------------------------------------------ loading */
  async function load() {
    if (!db) {
      $("nav-body").innerHTML = '<div class="notice">The locations are not connected yet.</div>';
      switchMode("world");
      return;
    }
    try {
      S.session = (await db.auth.getSession()).data.session;
      S.st = false;
      if (S.session) {
        var r = await db.rpc("is_chronicle_storyteller", { p_chronicle: CAMPAIGN });
        S.st = !r.error && r.data === true;
      }
      var got = await Promise.all([
        run(db.from("location_pins").select("*").eq("chronicle", CAMPAIGN).order("sort", { ascending: true }), "Pins"),
        run(db.from("location_maps").select("*").eq("chronicle", CAMPAIGN).order("created_at", { ascending: true }), "Maps")
      ]);
      S.pins = got[0] || [];
      S.maps = got[1] || [];
      S.notes = {}; S.factions = {}; S.factionList = []; S.setups = [];
      if (S.st) {
        // Notes have no campaign column: ask only for this campaign's pins.
        var pinIds = S.pins.map(function (p) { return p.id; });
        var st = await Promise.all([
          pinIds.length ? run(db.from("location_notes").select("*").in("id", pinIds), "Notes") : Promise.resolve([]),
          run(db.from("location_factions").select("*").order("sort", { ascending: true }), "Factions"),
          run(db.from("location_setups").select("*").eq("chronicle", CAMPAIGN).order("saved_at", { ascending: false }), "Setups")
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
    body.classList.toggle("viewer-only", !S.st);
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
    if (!db || !S.session) { who.innerHTML = ""; return; }
    who.innerHTML = '<span>' + (S.st ? "Dungeon Master" : "Adventurer") + "</span>" +
      '<button class="pin-mini" type="button" id="signOutBtn">Sign out</button>';
    $("signOutBtn").addEventListener("click", async function () {
      try { await db.auth.signOut(); } catch (e) { console.error(e); }
      window.location.reload();
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
    setTimeout(function () { if (map && S.mode === "world") map.invalidateSize(); }, 60);
  });

  document.querySelectorAll(".mode-tab").forEach(function (t) {
    t.addEventListener("click", function () { switchMode(t.getAttribute("data-mode")); });
    t.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); switchMode(t.getAttribute("data-mode")); }
    });
  });

  function switchMode(mode) {
    S.mode = mode;
    document.querySelectorAll(".mode-tab").forEach(function (t) { t.classList.toggle("active", t.getAttribute("data-mode") === mode); });
    cancelPinPlacement();
    cancelTokenPlacement();
    $("world-view").style.display = "none";
    $("canvas-view").style.display = "none";
    $("empty-state").style.display = "none";
    if (mode === "world") {
      $("zoom-readout").classList.remove("show");
      $("board-title").classList.remove("show");
      initWorld();
    } else {
      initCanvas();
    }
    renderNav();
  }

  /* ----------------------------------------------------------- world map */
  function showEmpty(eyebrow, title, text, extra) {
    var e = $("empty-state");
    e.innerHTML = '<span class="eyebrow">' + esc(eyebrow) + "</span><h2>" + esc(title) + "</h2>" +
      (text ? "<p>" + esc(text) + "</p>" : "") + (extra || "");
    e.style.display = "flex";
  }

  function initWorld() {
    var wm = worldMap(), src = wm && S.urls[wm.image_path];
    renderWorldToolbar(!!src);
    if (!wm || !src) { showWorldEmpty(wm); return; }
    $("world-view").style.display = "block";
    ensureLeaflet();
    map.invalidateSize();
    if (S.world.path === wm.image_path && S.world.bounds) { renderPins(); return; }
    var ticket = ++S.world.loading;
    var img = new Image();
    img.onload = function () {
      if (ticket !== S.world.loading) return;
      setWorldImage(wm, src, img.naturalWidth, img.naturalHeight);
    };
    img.onerror = function () {
      if (ticket !== S.world.loading) return;
      $("world-view").style.display = "none";
      showWorldEmpty(wm, true);
    };
    img.src = src;
  }

  function showWorldEmpty(wm, broken) {
    var eyebrow = CAMPAIGN_NAME + " — the world";
    if (broken || (wm && !S.st)) {
      showEmpty(eyebrow, "THE WORLD MAP DID NOT LOAD", S.st
        ? "Reload the page, or replace the image from the panel."
        : "Reload the page to try again.");
      return;
    }
    if (!S.st) {
      showEmpty(eyebrow, "NO WORLD MAP YET", "The Dungeon Master has not shared a world map yet.");
      return;
    }
    if (!db) { showEmpty(eyebrow, "NO WORLD MAP YET", "The locations are not connected yet."); return; }
    showEmpty(eyebrow, "NO WORLD MAP YET",
      "Upload a map of your world. You place pins on it; players see only the pins you reveal.",
      '<form class="upload-form" id="world-upload-form">' +
        '<label for="world-name">Name</label>' +
        '<input type="text" id="world-name" maxlength="120" value="World map">' +
        '<label for="world-file">Image</label>' +
        '<input type="file" id="world-file" accept="image/*">' +
        checkRow("world-revealed", "Shared with players", true) +
        '<div class="modal-hint">JPEG, PNG or WebP. Large images are scaled down to ' + WORLD_MAX + " pixels on the longer side. You can replace it later; the pins stay where they are.</div>" +
        '<div class="modal-actions"><button type="submit" class="btn-primary" id="world-upload-btn">Upload the world map</button></div>' +
      "</form>");
    $("world-upload-form").addEventListener("submit", async function (e) {
      e.preventDefault();
      var name = $("world-name").value.trim(), f = $("world-file").files && $("world-file").files[0];
      if (!name) { window.alert("Give the map a name."); return; }
      if (!f) { window.alert("Choose an image file."); return; }
      var btn = $("world-upload-btn"); btn.disabled = true; btn.textContent = "Uploading…";
      try {
        await uploadWorld(name, f, $("world-revealed").checked);
        toast("World map uploaded");
        await load();
      } catch (err) {
        fail(err);
        btn.disabled = false; btn.textContent = "Upload the world map";
      }
    });
  }

  function ensureLeaflet() {
    if (map) return;
    // Zoom buttons bottom right: the toolbar sits top left.
    map = L.map("world-view", {
      crs: L.CRS.Simple, zoomControl: false, attributionControl: false,
      minZoom: -4, maxZoom: 6, zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 120,
      maxBoundsViscosity: 0.8
    });
    L.control.zoom({ position: "bottomright" }).addTo(map);
    layer = L.layerGroup().addTo(map);
    map.on("click", function (e) {
      if (!S.placingPin || !S.world.bounds) return;
      if (!S.world.bounds.contains(e.latlng)) { toast("Click on the map itself."); return; }
      var placingId = S.placingId, ll = clampToMap(e.latlng.lat, e.latlng.lng);
      cancelPinPlacement();
      if (placingId) { movePin(placingId, ll.lat, ll.lng); return; }
      S.pendingLatLng = ll;
      openPinModal(null);
    });
  }

  function setWorldImage(wm, src, w, h) {
    var f = worldFrame(w, h);
    S.world.path = wm.image_path; S.world.w = w; S.world.h = h;
    S.world.scale = f.scale; S.world.bounds = f.bounds;
    if (overlay) { overlay.setUrl(src); overlay.setBounds(f.bounds); }
    else overlay = L.imageOverlay(src, f.bounds, { alt: wm.name || "World map" }).addTo(map);
    map.invalidateSize();
    map.setMaxBounds(null);
    var fit = map.getBoundsZoom(f.bounds);
    // Up to twice the image's own resolution.
    var native = Math.log(1 / f.scale) / Math.LN2;
    map.setMinZoom(fit - 1);
    map.setMaxZoom(Math.max(fit + 3, Math.ceil(native) + 1));
    map.fitBounds(f.bounds);
    // Room to pan a little past the edge, and to any pin left outside the
    // image by a replaced map of another shape.
    var room = L.latLngBounds(f.bounds.getSouthWest(), f.bounds.getNorthEast());
    S.pins.filter(onMap).forEach(function (p) { room.extend([p.lat, p.lng]); });
    map.setMaxBounds(room.pad(0.3));
    S.world.fit = fit;
    renderPins();
  }

  async function uploadWorld(name, file, revealed) {
    var old = worldMap();
    var blob = await compressImage(file, WORLD_MAX, 0.85);
    if (blob.size > MAX_BYTES) blob = await compressImage(file, 3000, 0.75);
    if (blob.size > MAX_BYTES) throw new Error("That image is too large, even scaled down. Try a smaller file.");
    var path = CAMPAIGN + "/" + uid("world") + ".jpg";
    await run(db.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false }), "Uploading the image");
    try {
      if (old) {
        await run(db.from("location_maps").update({ name: name, image_path: path, revealed: revealed }).eq("id", old.id), "Saving the world map");
      } else {
        await run(db.from("location_maps").insert({ id: uid("world"), chronicle: CAMPAIGN, kind: "world", name: name, image_path: path, revealed: revealed }), "Saving the world map");
      }
    } catch (e) {
      try { await db.storage.from(BUCKET).remove([path]); } catch (x) { console.error(x); }
      throw e;
    }
    if (old) {
      // The old image is no longer used by anything.
      try {
        var r = await db.storage.from(BUCKET).remove([old.image_path]);
        if (r && r.error) console.warn("The old world map image was not removed:", errText(r.error));
      } catch (x) { console.warn(x); }
    }
  }

  function icon(color) {
    return L.divIcon({ className: "", html: '<div class="pin-icon" style="background:' + esc(color) + ';"></div>', iconSize: [22, 22], iconAnchor: [11, 20], popupAnchor: [0, -20] });
  }

  function popupHtml(p) {
    var h = "<h3>" + esc(p.name) + "</h3>" + (p.description ? "<p>" + esc(p.description) + "</p>" : "");
    if (!S.st) return h;
    var n = S.notes[p.id] || {}, f = S.factions[factionOf(p)];
    h += (p.revealed ? '<span class="shown-tag">Revealed</span>' : '<span class="hidden-tag">Hidden from players</span>');
    if (f) h += ' <span class="tag" style="background:' + esc(colorOf(p)) + ';color:#fff;">' + esc(f.label) + "</span>";
    if (n.notes) h += '<div class="st-notes"><b>Your notes</b>' + esc(n.notes) + "</div>";
    h += '<div class="drag-hint">✥ Drag to move</div>' +
      '<div class="popup-actions">' +
        '<button type="button" data-act="edit" data-id="' + esc(p.id) + '">Edit</button>' +
        '<button type="button" data-act="reveal" data-id="' + esc(p.id) + '">' + (p.revealed ? "Hide" : "Reveal") + "</button>" +
        '<button type="button" class="danger" data-act="delete" data-id="' + esc(p.id) + '">Delete</button>' +
      "</div>";
    return h;
  }

  function renderPins() {
    if (!layer) return;
    layer.clearLayers();
    if (!S.world.bounds) return;
    S.pins.filter(onMap).forEach(function (p) {
      var m = L.marker([p.lat, p.lng], { icon: icon(colorOf(p)), draggable: S.st, autoPan: true, opacity: (S.st && !p.revealed) ? 0.6 : 1, title: p.name });
      m.bindPopup(popupHtml(p));
      m._pinId = p.id;
      if (S.st) m.on("dragend", function (e) {
        var ll = e.target.getLatLng(), c = clampToMap(ll.lat, ll.lng);
        movePin(p.id, c.lat, c.lng);
      });
      m.addTo(layer);
    });
  }

  // Popup and list buttons are drawn as HTML, so they are handled here.
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]");
    if (!b) return;
    var id = b.getAttribute("data-id"), act = b.getAttribute("data-act");
    if (act === "fly") {                      // anyone: find it on the map
      var p = pinById(id);
      if (p && onMap(p) && worldShown()) {
        map.flyTo([p.lat, p.lng], Math.min(map.getMaxZoom(), S.world.fit + 2), { duration: 0.8 });
        layer.eachLayer(function (m) { if (m._pinId === id) setTimeout(function () { m.openPopup(); }, 850); });
        if (window.matchMedia("(max-width:760px)").matches) { S.paneCollapsed = true; applyPane(); }
      }
      return;
    }
    if (!S.st) return;
    e.stopPropagation();
    if (act === "edit") { if (map) map.closePopup(); openPinModal(id); }
    else if (act === "reveal") toggleReveal(id);
    else if (act === "delete") deletePin(id);
    else if (act === "place") armPlacement(id);
  });

  function pinById(id) { return S.pins.filter(function (p) { return p.id === id; })[0]; }

  function renderWorldToolbar(hasMap) {
    var tb = $("toolbar");
    if (!S.st || !db) { tb.classList.remove("show"); tb.innerHTML = ""; return; }
    tb.classList.add("show");
    tb.innerHTML =
      (hasMap ? '<button type="button" id="add-pin-btn"><span class="swatch" style="background:' + PLAYER_PIN + ';"></span> Add Location Pin</button>' : "") +
      '<button type="button" id="save-setup-btn" title="Save every pin as it is now, under a name">Save Setup</button>' +
      '<button type="button" id="load-setup-btn" title="Load, export or import saved setups">Setups…</button>';
    if (hasMap) $("add-pin-btn").addEventListener("click", function () {
      if (S.placingPin) cancelPinPlacement(); else armPlacement(null);
    });
    $("save-setup-btn").addEventListener("click", saveSetup);
    $("load-setup-btn").addEventListener("click", function () { renderSetups(); openModal("modal-configs"); });
  }
  function armPlacement(id) {
    if (S.mode !== "world") switchMode("world");
    if (!worldShown()) { toast("Upload the world map first."); return; }
    S.placingPin = true; S.placingId = id;
    var b = $("add-pin-btn");
    if (b) { b.classList.add("active-token-btn"); b.textContent = id ? "Click the map to place it…" : "Click the map to drop pin…"; }
    $("world-view").classList.add("placing");
    if (map) map.closePopup();
    if (window.matchMedia("(max-width:760px)").matches) { S.paneCollapsed = true; applyPane(); }
  }
  function cancelPinPlacement() {
    S.placingPin = false; S.placingId = null;
    $("world-view").classList.remove("placing");
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
    var opts = S.factionList.length ? S.factionList : [{ key: "neutral", label: "Neutral" }];
    $("pin-faction").innerHTML = opts.map(function (f) {
      return '<option value="' + esc(f.key) + '">' + esc(f.label) + "</option>";
    }).join("");
    $("pin-faction").value = (p ? factionOf(p) : "neutral");
    $("pin-revealed").checked = p ? !!p.revealed : false;
    $("pin-offmap-row").style.display = (p && onMap(p)) ? "" : "none";
    $("pin-offmap").checked = false;
    $("pin-save-btn").textContent = id ? "Save Changes" : "Place Pin";
    openModal("modal-pin");
    $("pin-name").focus();
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
        var row = Object.assign({ id: id, chronicle: CAMPAIGN, sort: sort }, fields);
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
      var snap = await run(db.rpc("location_snapshot", { p_chronicle: CAMPAIGN }), "Reading the pins");
      await run(db.from("location_setups").insert({ chronicle: CAMPAIGN, name: name.trim().slice(0, 60), snapshot: snap }), "Saving the setup");
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
        '<button class="pin-mini" type="button" data-load="' + esc(c.id) + '">Load</button>' +
        '<button class="pin-mini danger" type="button" data-delcfg="' + esc(c.id) + '">Delete</button></div></div>';
    }).join("");
    wrap.querySelectorAll("[data-load]").forEach(function (b) {
      b.addEventListener("click", async function () {
        var c = S.setups.filter(function (x) { return String(x.id) === b.getAttribute("data-load"); })[0];
        if (!c || !window.confirm('Load "' + c.name + '"? Every pin goes back to how it was then, and pins added since are removed.')) return;
        try {
          await run(db.rpc("apply_location_snapshot", { p_chronicle: CAMPAIGN, p_snapshot: c.snapshot }), "Loading the setup");
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
      var snap = await run(db.rpc("location_snapshot", { p_chronicle: CAMPAIGN }), "Reading the pins");
      var data = Object.assign({ _vistectus: "locations", chronicle: CAMPAIGN, exportedAt: new Date().toISOString() }, snap);
      var url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      var a = document.createElement("a");
      a.href = url; a.download = CAMPAIGN + "-locations.json";
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
        // Pin ids are shared across campaigns and chronicles: never load
        // another one's export (a Dead Hand file, or one marked for another).
        if (data._deadhand || (data.chronicle != null && data.chronicle !== CAMPAIGN)) {
          throw new Error("That file belongs to another campaign's locations, not " + CAMPAIGN_NAME + ".");
        }
        if (!window.confirm("Replace every pin with the " + data.pins.length + " in this file? It is also kept as a saved setup.")) return;
        var snap = { pins: data.pins };
        await run(db.rpc("apply_location_snapshot", { p_chronicle: CAMPAIGN, p_snapshot: snap }), "Importing");
        await run(db.from("location_setups").insert({ chronicle: CAMPAIGN, name: ("Imported " + new Date().toLocaleDateString()).slice(0, 60), snapshot: snap }), "Keeping it as a setup");
        closeModal("modal-configs"); toast("Imported"); await load();
      } catch (err) { fail(err); }
    };
    reader.readAsText(f);
  });

  /* ------------------------------------------------- area and building maps */
  function mapsOfMode() { return S.maps.filter(function (m) { return m.kind === S.mode; }); }
  function activeMap() {
    if (S.mode === "world") return null;
    var list = mapsOfMode(), id = S.active[S.mode];
    return list.filter(function (m) { return m.id === id; })[0] || list[0] || null;
  }

  function initCanvas() {
    var m = activeMap();
    var tb = $("toolbar");
    if (!m) {
      $("canvas-view").style.display = "none";
      showEmpty(CAMPAIGN_NAME, S.mode === "area" ? "NO AREA MAP YET" : "NO BUILDING PLAN YET",
        S.st ? "Add an image from the panel to start placing tokens." : "Nothing to show here yet.");
      tb.classList.remove("show"); tb.innerHTML = "";
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
        '<button type="button" data-token="player"><span class="swatch" style="background:' + TOKEN_COLORS[3] + ';"></span> Player Token</button>' +
        '<button type="button" data-token="npc"><span class="swatch" style="background:' + TOKEN_COLORS[0] + ';"></span> NPC Token</button>' +
        '<button type="button" data-token="general"><span class="swatch" style="background:' + TOKEN_COLORS[6] + ';"></span> General Token</button>';
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
      if (S.mode === "world" || !activeMap()) return;
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

  function openMapModal(kind) {
    var wm = kind === "world" ? worldMap() : null;
    S.mapModalKind = kind;
    $("modal-map-title").textContent = kind === "world" ? (wm ? "REPLACE THE WORLD MAP" : "UPLOAD THE WORLD MAP")
      : (kind === "area" ? "ADD AREA MAP" : "ADD BUILDING PLAN");
    $("map-name").value = wm ? wm.name : (kind === "world" ? "World map" : "");
    $("map-file").value = "";
    $("map-revealed").checked = kind === "world" ? (wm ? !!wm.revealed : true) : false;
    $("map-hint").textContent = kind === "world"
      ? "The new image takes the old one's place. Pins keep their map positions, so a new map of the same shape keeps every pin where it was. Large images are scaled down to " + WORLD_MAX + " pixels."
      : "Town layouts, dungeon plans or reference drawings. Large images are scaled down to " + PLAN_MAX + " pixels.";
    $("map-save-btn").textContent = kind === "world" ? (wm ? "Replace" : "Upload") : "Add Map";
    openModal("modal-map");
  }

  $("map-save-btn").addEventListener("click", async function () {
    var kind = S.mapModalKind;
    var name = $("map-name").value.trim(), f = $("map-file").files && $("map-file").files[0];
    if (!name) { window.alert("Give the map a name."); return; }
    if (!f) { window.alert("Choose an image file."); return; }
    var btn = this, label = btn.textContent; btn.disabled = true; btn.textContent = "Uploading…";
    try {
      if (kind === "world") {
        var had = !!worldMap();
        await uploadWorld(name, f, $("map-revealed").checked);
        closeModal("modal-map");
        toast(had ? "World map replaced" : "World map uploaded");
      } else {
        var blob = await compressImage(f, PLAN_MAX, 0.85);
        var id = uid("map"), path = CAMPAIGN + "/" + id + ".jpg";
        await run(db.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false }), "Uploading the image");
        await run(db.from("location_maps").insert({ id: id, chronicle: CAMPAIGN, kind: kind, name: name, image_path: path, revealed: $("map-revealed").checked }), "Saving the map");
        S.active[kind] = id;
        closeModal("modal-map");
        toast("Map added");
      }
      await load();
    } catch (e) { fail(e); }
    btn.disabled = false; btn.textContent = label;
  });

  /* ------------------------------------------------------------ the panel */
  function renderNav() {
    var nb = $("nav-body");
    if (!db) return;
    if (S.mode === "world") renderWorldNav(nb); else renderMapNav(nb);
  }

  function pinItem(p) {
    var f = S.factions[factionOf(p)];
    var dot = '<span class="faction-dot" style="background:' + esc(colorOf(p)) + '"></span>';
    var h = '<div class="list-item" data-act="fly" data-id="' + esc(p.id) + '"><div class="row"><span class="name">' + dot + esc(p.name) +
      (S.st ? (p.revealed ? '<span class="shown-tag">Revealed</span>' : '<span class="hidden-tag">Hidden</span>') : "") + "</span>";
    if (S.st) {
      h += '<span class="pin-actions">' +
        (onMap(p) || !worldMap() ? "" : '<button class="pin-mini" type="button" data-act="place" data-id="' + esc(p.id) + '">Place</button>') +
        '<button class="pin-mini" type="button" data-act="edit" data-id="' + esc(p.id) + '">Edit</button></span>';
    }
    h += "</div>";
    if (p.description) h += '<div class="desc">' + esc(p.description) + "</div>";
    if (S.st && S.notes[p.id] && S.notes[p.id].notes) h += '<div class="desc" style="opacity:.75"><em>Notes:</em> ' + esc(S.notes[p.id].notes.slice(0, 160)) + (S.notes[p.id].notes.length > 160 ? "…" : "") + "</div>";
    if (S.st && f && f.key !== "neutral") h += '<div class="desc">' + esc(f.label) + "</div>";
    return h + "</div>";
  }

  function renderWorldNav(nb) {
    var wm = worldMap();
    var placed = S.pins.filter(onMap), off = S.pins.filter(function (p) { return !onMap(p); });
    var h = "";
    if (S.st) {
      h += '<div class="nav-section-title">WORLD MAP ' + (wm ? "<span></span>" : '<span class="add-link" id="world-add-link">+ Upload</span>') + "</div>";
      if (wm) {
        var src = S.urls[wm.image_path];
        h += '<div class="list-item static">' + (src ? '<img class="thumb" src="' + esc(src) + '" alt="">' : "") +
          '<div class="row"><span class="name">' + esc(wm.name) +
          (wm.revealed ? '<span class="shown-tag">Shared</span>' : '<span class="hidden-tag">Hidden</span>') + "</span>" +
          '<span class="pin-actions"><button class="pin-mini" type="button" id="world-replace">Replace</button>' +
          '<button class="pin-mini" type="button" id="world-reveal">' + (wm.revealed ? "Hide" : "Share") + "</button>" +
          '<button class="pin-mini danger" type="button" id="world-remove">Remove</button></span></div></div>';
        if (!wm.revealed) h += '<div class="empty-hint" style="padding-top:0">Players do not see the world map until you share it. Revealed pins still show in their list.</div>';
      } else {
        h += '<div class="empty-hint" style="padding-top:0">No world map yet. Upload one to start placing pins.</div>';
      }
      h += '<div style="height:12px"></div>';
    } else {
      h += '<div class="notice">Places the party knows of.' + (worldShown() || (wm && S.urls[wm.image_path]) ? " Click one to find it on the map." : "") + "</div>";
    }
    h += '<div class="nav-section-title">LOCATIONS <span></span></div>';
    h += placed.length ? placed.map(pinItem).join("") : '<div class="empty-hint">No locations yet.</div>';
    if (off.length) {
      h += '<div class="nav-section-title" style="margin-top:22px;">NOT ON THE MAP <span></span></div>';
      h += off.map(pinItem).join("");
    }
    if (S.st) {
      h += '<div class="empty-hint">Pins start hidden. Reveal one from its pop-up or the Edit window, and players see its name and the description you wrote for them, never your notes or its faction.</div>';
    }
    nb.innerHTML = h;

    var add = $("world-add-link"), rep = $("world-replace"), rev = $("world-reveal"), rem = $("world-remove");
    if (add) add.addEventListener("click", function () { openMapModal("world"); });
    if (rep) rep.addEventListener("click", function () { openMapModal("world"); });
    if (rev) rev.addEventListener("click", async function () {
      try {
        await run(db.from("location_maps").update({ revealed: !wm.revealed }).eq("id", wm.id), "Changing who can see it");
        toast(wm.revealed ? "World map hidden from players" : "World map shared with players");
        await load();
      } catch (e) { fail(e); }
    });
    if (rem) rem.addEventListener("click", async function () {
      if (!window.confirm('Remove the world map "' + wm.name + '"? Pins keep their positions and show again on the next map you upload.')) return;
      try {
        await run(db.from("location_maps").delete().eq("id", wm.id), "Removing the map");
        await run(db.storage.from(BUCKET).remove([wm.image_path]), "Removing the image");
        S.world.path = null; S.world.bounds = null;
        toast("World map removed");
        await load();
      } catch (e) { fail(e); }
    });
  }

  function renderMapNav(nb) {
    var list = mapsOfMode(), active = activeMap();
    var label = S.mode === "area" ? "AREA MAPS" : "BUILDING PLANS";
    var h = '<div class="nav-section-title">' + label + (S.st ? ' <span class="add-link" id="add-map-link">+ Add Map</span>' : " <span></span>") + "</div>";
    if (!list.length) h += '<div class="empty-hint">' + (S.st ? "None yet. Add a town layout or dungeon plan to start placing tokens." : "None yet.") + "</div>";
    list.forEach(function (m) {
      var src = S.urls[m.image_path];
      h += '<div class="list-item' + (active && m.id === active.id ? " active" : "") + '" data-select="' + esc(m.id) + '">' +
        (src ? '<img class="thumb" src="' + esc(src) + '" alt="">' : "") +
        '<div class="row"><span class="name">' + esc(m.name) +
        (S.st ? (m.revealed ? '<span class="shown-tag">Revealed</span>' : '<span class="hidden-tag">Hidden</span>') : "") + "</span>" +
        (S.st ? '<span class="pin-actions"><button class="pin-mini" type="button" data-mreveal="' + esc(m.id) + '">' + (m.revealed ? "Hide" : "Reveal") + "</button>" +
                '<button class="pin-mini danger" type="button" data-mdelete="' + esc(m.id) + '">Remove</button></span>' : "") +
        "</div></div>";
    });
    if (S.st && list.length) h += '<div class="empty-hint">Double-click a token to remove it. Tokens save as you move them.</div>';
    nb.innerHTML = h;

    var add = $("add-map-link");
    if (add) add.addEventListener("click", function () { openMapModal(S.mode); });
    nb.querySelectorAll("[data-select]").forEach(function (item) {
      item.addEventListener("click", function (e) {
        if (e.target.closest("button")) return;
        S.active[S.mode] = item.getAttribute("data-select");
        initCanvas(); renderNav();
      });
    });
    nb.querySelectorAll("[data-mreveal]").forEach(function (b) {
      b.addEventListener("click", async function () {
        var m = S.maps.filter(function (x) { return x.id === b.getAttribute("data-mreveal"); })[0];
        try {
          await run(db.from("location_maps").update({ revealed: !m.revealed }).eq("id", m.id), "Changing who can see it");
          toast(m.revealed ? "Hidden from players" : "Revealed to players");
          await load();
        } catch (e) { fail(e); }
      });
    });
    nb.querySelectorAll("[data-mdelete]").forEach(function (b) {
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

  /* -------------------------------------------------------------- closing */
  document.querySelectorAll("[data-close]").forEach(function (b) {
    b.addEventListener("click", function () { closeModal(b.getAttribute("data-close")); });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    document.querySelectorAll(".modal-overlay.show").forEach(function (m) { m.classList.remove("show"); });
    cancelPinPlacement(); cancelTokenPlacement();
  });

  /* ---------------------------------------------------------------- start */
  function makeClient() {
    var cfg = window.BUILDERS_CONFIG || {};
    return (cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase)
      ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;
  }

  applyPane();
  if (!CAMPAIGN) {
    $("nav-body").innerHTML = '<div class="notice">This page does not say which campaign it belongs to.</div>';
    return;
  }
  if (!window.L) {
    $("nav-body").innerHTML = '<div class="notice">The map library did not load. Reload the page to try again.</div>';
    return;
  }
  // The gate (gate.js) checks membership first; nothing is read before
  // it lets this account in. It hands over its own client, so the page
  // keeps one sign-in.
  if (window.Gate && window.Gate.ready) {
    window.Gate.ready.then(function (g) { db = (g && g.db) || makeClient(); load(); });
  } else {
    db = makeClient();
    load();
  }
})();
