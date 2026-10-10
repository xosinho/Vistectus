/* =====================================================================
   VAMPIRE: THE DARK AGES — roster renderer (The coterie and People)
   ---------------------------------------------------------------------
   Shared by every chronicle made with the Builder. The chronicle comes
   from <body data-chronicle="...">. The page hands over its list, or a
   Promise of it (ChronicleContent.merge), and the roster waits for it:

     Chronicle.renderRoster("npcs-roster",
       ChronicleContent.merge("npc", window.VAMPIRE_NPCS, chronicleId),
       "npc", { hide: "npcs" });

   Everything shown is escaped; links from the database must be web
   addresses or plain paths.
   ===================================================================== */
(function () {
  "use strict";

  /* -- tiny helper: escape text so names/descriptions can't break markup -- */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* -- turn a "background" value into HTML.
        - if it's an array, each item becomes a paragraph
        - if it's a string with blank lines, split into paragraphs
        - a string ending in .html/.txt is treated as a file to link to  -- */
  function bodyToHtml(bg) {
    if (!bg) return "<p><em>No background on file yet.</em></p>";
    if (Array.isArray(bg)) return bg.map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("");
    if (typeof bg === "string" && /\.(html?|txt|md)$/i.test(bg.trim()) && safeHref(bg)) {
      return '<p><a class="btn btn--ghost" href="' + esc(safeHref(bg)) +
             '" target="_blank" rel="noopener">Open full background &rsaquo;</a></p>';
    }
    return String(bg).split(/\n\s*\n/).map(function (p) {
      return "<p>" + esc(p.trim()) + "</p>";
    }).join("");
  }

  // The placeholder portrait sits beside this script's folder (vtda/assets/img/).
  var ME = document.currentScript;
  var PLACEHOLDER = (function () {
    try { return new URL("../img/placeholder.svg", ME && ME.src ? ME.src : window.location.href).href; }
    catch (e) { return "../../assets/img/placeholder.svg"; }
  })();

  /* Links and pictures from the database: only web addresses and plain
     paths, never javascript: or data: addresses. */
  function safeHref(u) {
    u = String(u == null ? "" : u).trim();
    if (!u) return "";
    if (/^[a-z][a-z0-9+.-]*:/i.test(u) && !/^https?:/i.test(u)) return "";
    return u;
  }

  /* --------------------------------------------------------- build a card */
  function cardHtml(entry, i) {
    var portrait = safeHref(entry.portrait) || PLACEHOLDER;
    return (
      '<button class="roster-card" data-index="' + i + '" aria-haspopup="dialog">' +
        '<span class="roster-card__hint">View</span>' +
        '<img class="roster-card__portrait" loading="lazy" ' +
             'src="' + esc(portrait) + '" alt="Portrait of ' + esc(entry.name) + '" ' +
             'onerror="this.onerror=null;this.src=\'' + PLACEHOLDER + '\'">' +
        '<span class="roster-card__body">' +
          '<span class="roster-card__name">' + esc(entry.name || "Unnamed") + '</span>' +
          (entry.tagline ? '<span class="roster-card__tagline">' + esc(entry.tagline) + '</span>' : '') +
        '</span>' +
      '</button>'
    );
  }

  /* ------------------------------------------------ build a stat block (NPCs) */
  function statblockHtml(stats, note) {
    if (!stats || !Object.keys(stats).length) return "";
    var rows = Object.keys(stats).map(function (k) {
      return '<div class="statline"><span class="k">' + esc(k) +
             '</span><span class="v">' + esc(stats[k]) + '</span></div>';
    }).join("");
    return '<div class="statblock">' + rows +
           (note ? '<div class="stat-note">' + esc(note) + '</div>' : '') + '</div>';
  }

  /* ------------------------------------------------ build the detail markup */
  function detailHtml(entry, opts) {
    var portrait = safeHref(entry.portrait) || PLACEHOLDER;
    var meta = (entry.meta || []).map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join("");
    // A real portrait opens full size when clicked; the placeholder does not.
    var zoomable = portrait !== PLACEHOLDER;

    var html =
      '<button class="detail__close" aria-label="Close">&times;</button>' +
      '<div class="detail__head">' +
        (zoomable ? '<button type="button" class="detail__zoom" data-full="' + esc(portrait) + '" ' +
                    'aria-label="Show the portrait of ' + esc(entry.name) + ' full size" title="Show full size">' : '') +
        '<img class="detail__portrait" src="' + esc(portrait) + '" alt="Portrait of ' + esc(entry.name) + '" ' +
             'onerror="this.onerror=null;this.src=\'' + PLACEHOLDER + '\'">' +
        (zoomable ? '</button>' : '') +
        '<div class="detail__titles">' +
          '<h2 class="detail__name" id="detail-title">' + esc(entry.name || "Unnamed") + '</h2>' +
          (entry.role ? '<p class="detail__role">' + esc(entry.role) + '</p>' : '') +
          (meta ? '<div class="detail__meta">' + meta + '</div>' : '') +
        '</div>' +
      '</div>' +
      '<div class="detail__body">';

    /* background / description */
    var bgLabel = opts.type === "player" ? "Background" : "Dossier";
    html += '<p class="detail__section-label">' + bgLabel + '</p>' +
            '<div class="detail__prose">' + bodyToHtml(entry.background || entry.description) + '</div>';

    /* NPC subject file, from the dossier */
    if (opts.type === "npc" && entry.file) {
      html += '<p class="detail__section-label">Subject file</p>' + statblockHtml(entry.file);
    }

    /* NPC stat block */
    if (opts.type === "npc" && entry.stats) {
      html += '<p class="detail__section-label">Stat block</p>' + statblockHtml(entry.stats, entry.statNote);
    }

    /* player character sheet: the online sheet page. An older entry with
       only a sheetPdf still gets its download. No sheet, no section. */
    if (opts.type === "player" && (entry.sheet || entry.sheetPdf)) {
      html += '<p class="detail__section-label">Character sheet</p>' +
              '<div class="detail__downloads">' +
                (entry.sheet
                  ? '<a class="btn" href="sheet.html?c=' + encodeURIComponent(entry.sheet) + '">Open character sheet</a>'
                  : '<a class="btn" href="' + esc(safeHref(entry.sheetPdf)) +
                    '" download target="_blank" rel="noopener">&#8681; PDF sheet</a>') +
              '</div>';
    }

    /* extra pages that belong to this character: boards and the like.
       links: [{ label: "Intrigue Board", href: "intrigue-board/index.html" }] */
    if (entry.links && entry.links.length) {
      html += '<p class="detail__section-label">Papers</p><div class="detail__downloads">';
      entry.links.forEach(function (l) {
        if (!l || !safeHref(l.href)) return;
        html += '<a class="btn" href="' + esc(safeHref(l.href)) + '">' + esc(l.label || "Open") + '</a>';
      });
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  /* ------------------------------------------- full-size portrait pop-up */
  var lightbox;
  function openLightbox(src, alt) {
    if (!lightbox) {
      lightbox = document.createElement("div");
      lightbox.className = "lightbox";
      lightbox.setAttribute("role", "dialog");
      lightbox.setAttribute("aria-modal", "true");
      lightbox.setAttribute("aria-label", "Portrait, full size");
      lightbox.innerHTML = '<button class="lightbox__close" aria-label="Close">&times;</button><img alt="">';
      // The layout that makes this a pop-up is set here as well as in
      // style.css, so a browser still holding an older style.css shows a
      // pop-up rather than an image at the foot of the page.
      lightbox.style.cssText = "position:fixed;inset:0;z-index:200;align-items:center;justify-content:center;" +
        "padding:1.5rem;background:rgba(4,3,8,.92);cursor:zoom-out;display:none;";
      lightbox.querySelector("img").style.cssText = "max-width:100%;max-height:calc(100vh - 3rem);object-fit:contain;cursor:default;";
      lightbox.querySelector(".lightbox__close").style.cssText =
        "position:absolute;top:.8rem;right:1rem;background:none;border:0;cursor:pointer;color:#fff;font-size:2rem;line-height:1;";
      document.body.appendChild(lightbox);
      lightbox.addEventListener("click", function (e) {
        if (e.target === lightbox || e.target.classList.contains("lightbox__close")) closeLightbox();
      });
    }
    var img = lightbox.querySelector("img");
    img.src = src;
    img.alt = alt || "";
    lightbox.classList.add("open");
    lightbox.style.display = "flex";
    lightbox.querySelector(".lightbox__close").focus();
  }
  // Returns whether there was a portrait open to close.
  function closeLightbox() {
    if (!lightbox || !lightbox.classList.contains("open")) return false;
    lightbox.classList.remove("open");
    lightbox.style.display = "none";
    var zoom = panel && panel.querySelector(".detail__zoom");
    if (zoom) zoom.focus();
    return true;
  }

  /* ------------------------------------------------------ modal machinery */
  var backdrop, panel, lastFocused;

  function ensureModal() {
    if (backdrop) return;
    backdrop = document.createElement("div");
    backdrop.className = "detail-backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-labelledby", "detail-title");
    panel = document.createElement("div");
    panel.className = "detail";
    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);

    backdrop.addEventListener("click", function (e) { if (e.target === backdrop) closeModal(); });
    // Escape closes the full-size portrait first, then the profile.
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (closeLightbox()) return;
      if (backdrop.classList.contains("open")) closeModal();
    });
  }

  function openModal(entry, opts) {
    ensureModal();
    lastFocused = document.activeElement;
    panel.innerHTML = detailHtml(entry, opts);
    panel.querySelector(".detail__close").addEventListener("click", closeModal);
    var zoom = panel.querySelector(".detail__zoom");
    if (zoom) zoom.addEventListener("click", function () {
      openLightbox(zoom.getAttribute("data-full"), "Portrait of " + (entry.name || ""));
    });
    backdrop.classList.add("open");
    document.body.style.overflow = "hidden";
    panel.querySelector(".detail__close").focus();
  }

  function closeModal() {
    if (!backdrop) return;
    closeLightbox();
    backdrop.classList.remove("open");
    document.body.style.overflow = "";
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  /* ------------------------------------------------------------ public API */
  /* ------------------------------------------ hidden by the Storyteller
     renderRoster(..., { hide: "npcs" }) lets a Storyteller hide entries.
     Which ones are hidden is kept in the archive_hidden table of the
     site's Supabase project, the same one Documents and Maps use
     (set up in admin/sql/access.sql). Players never see a
     hidden entry; a signed-in Storyteller sees all of them, hidden ones
     marked, with a button on each. If the list cannot be reached, no
     one is shown: the page says so and offers to try again, so a slow
     or blocked connection never reveals a hidden entry. Hiding takes
     the entry off the page; it does not remove it from the site's
     files. */
  var CHRONICLE = (document.body && document.body.getAttribute("data-chronicle")) || "";
  function hiddenStore(kind) {
    // Local direct-file browsing should still show roster entries immediately.
    // The hidden-item lookup depends on a remote Supabase session and is not
    // required just to read the page from disk.
    if (window.location && window.location.protocol === "file:") {
      return Promise.resolve({ db: null, kind: kind, hidden: {}, isST: false, signedIn: false });
    }

    // The members' gate's client (gate.js) when there is one: one sign-in.
    var cfg = window.BUILDERS_CONFIG || {};
    var db = (window.Gate && window.Gate.db) || ((cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase)
      ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null);
    var store = { db: db, kind: kind, hidden: {}, isST: false, signedIn: false, failed: false };
    if (!db) { store.failed = true; return Promise.resolve(store); }
    var timeout = new Promise(function (_, rej) { setTimeout(function () { rej(new Error("timeout")); }, 10000); });
    return Promise.race([
      (async function () {
        var r = await db.from("archive_hidden").select("item").eq("chronicle", CHRONICLE).eq("kind", kind);
        if (r.error) throw r.error;
        (r.data || []).forEach(function (row) { store.hidden[row.item] = true; });
        var session = (await db.auth.getSession()).data.session;
        store.signedIn = !!session;
        if (session) {
          var st = await db.rpc("is_chronicle_storyteller", { p_chronicle: CHRONICLE });
          store.isST = !st.error && st.data === true;
        }
        return store;
      })(),
      timeout
    ]).catch(function (e) {
      console.error("Hidden list unavailable; showing no one.", e);
      store.hidden = {}; store.isST = false; store.failed = true;
      return store;
    });
  }

  function renderRoster(containerId, data, type, opts) {
    var el = document.getElementById(containerId);
    if (!el) return;
    // A Promise of the list (the files plus the database): wait for it.
    if (data && typeof data.then === "function") {
      el.className = "";
      el.innerHTML = '<div class="empty">Opening the files…</div>';
      data.then(function (list) { renderRoster(containerId, list || [], type, opts); },
        function (e) { console.error(e); renderRoster(containerId, [], type, opts); });
      return;
    }
    if (opts && opts.hide && data && data.length) {
      el.className = "";
      el.innerHTML = '<div class="empty">Opening the files…</div>';
      hiddenStore(opts.hide).then(function (store) {
        if (store.failed) {
          // Could not tell what is hidden, so show nothing rather than everything.
          el.className = "";
          el.innerHTML = '<div class="empty">These files could not be opened just now.<br>' +
            '<button type="button" class="roster-toggle roster-retry" style="margin-top:1rem">Try again</button></div>';
          el.querySelector(".roster-retry").addEventListener("click", function () {
            renderRoster(containerId, data, type, opts);
          });
          return;
        }
        drawRoster(el, data, type, store);
      });
      return;
    }
    drawRoster(el, data, type, null);
  }

  function drawRoster(el, data, type, store) {
    var hidden = store ? store.hidden : {};
    var isST = !!(store && store.isST);
    var shown = (data || []).map(function (entry, i) { return { entry: entry, i: i }; })
      .filter(function (x) { return isST || !hidden[x.entry.name]; });

    // A quiet pointer to signing in, for the Storyteller.
    var hint = el.nextElementSibling && el.nextElementSibling.classList.contains("roster-signin") ? el.nextElementSibling : null;
    if (store && store.db && !store.signedIn && !hint) {
      hint = document.createElement("p");
      hint.className = "roster-signin";
      hint.innerHTML = 'Storyteller? <a href="storyteller.html">Sign in</a> to hide or show people, then come back to this page.';
      el.parentNode.insertBefore(hint, el.nextSibling);
    }

    if (data && data.length && !shown.length) {
      el.className = "";
      el.innerHTML = '<div class="empty">No one here yet.</div>';
      return;
    }
    if (!data || !data.length) {
      el.className = "";
      el.innerHTML =
        '<div class="empty">No ' + (type === "player" ? "characters" : "one") +
        ' added yet.<br>The Storyteller adds ' + (type === "player" ? "the coterie&rsquo;s cards" : "people") +
        ' in the workshop as the chronicle goes on.</div>';
      return;
    }
    el.className = "roster";
    el.innerHTML = shown.map(function (x) {
      var card = cardHtml(x.entry, x.i);
      if (!isST) return card;
      var isHidden = !!hidden[x.entry.name];
      return '<div class="roster-item' + (isHidden ? " is-hidden" : "") + '">' + card +
        (isHidden ? '<span class="roster-hidden">Hidden from players</span>' : "") +
        '<button type="button" class="roster-toggle" data-index="' + x.i + '">' +
          (isHidden ? "Show to players" : "Hide from players") + "</button></div>";
    }).join("");
    el.querySelectorAll(".roster-card").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openModal(data[+btn.getAttribute("data-index")], { type: type });
      });
    });
    el.querySelectorAll(".roster-toggle").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var name = data[+btn.getAttribute("data-index")].name;
        var hide = !hidden[name];
        btn.disabled = true;
        try {
          var r = hide
            ? await store.db.from("archive_hidden").insert({ chronicle: CHRONICLE, kind: store.kind, item: name })
            : await store.db.from("archive_hidden").delete().eq("chronicle", CHRONICLE).eq("kind", store.kind).eq("item", name);
          if (r.error) throw r.error;
          if (hide) hidden[name] = true; else delete hidden[name];
          drawRoster(el, data, type, store);
        } catch (e) {
          console.error(e);
          window.alert("Could not change that: " + ((e && e.message) || e));
          btn.disabled = false;
        }
      });
    });
  }

  window.Chronicle = { renderRoster: renderRoster };
})();
