/* =====================================================================
   THE DEAD HAND — roster renderer
   ---------------------------------------------------------------------
   Drives BOTH the Players page and the NPC page from plain data files.
   You never edit this file to add a character — you edit the data files:
       assets/data/players.js
       assets/data/npcs.js
   ...and drop images / sheets into assets/img and assets/sheets.

   This file has no dependencies and loads via a plain <script> tag, so
   the whole site works even when opened directly from disk (file://),
   with no web server required.
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
    if (typeof bg === "string" && /\.(html?|txt|md)$/i.test(bg.trim())) {
      return '<p><a class="btn btn--ghost" href="' + esc(bg.trim()) +
             '" target="_blank" rel="noopener">Open full background &rsaquo;</a></p>';
    }
    return String(bg).split(/\n\s*\n/).map(function (p) {
      return "<p>" + esc(p.trim()) + "</p>";
    }).join("");
  }

  var PLACEHOLDER = "assets/img/placeholder.svg";

  /* --------------------------------------------------------- build a card */
  function cardHtml(entry, i) {
    var portrait = entry.portrait || PLACEHOLDER;
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
    var portrait = entry.portrait || PLACEHOLDER;
    var meta = (entry.meta || []).map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join("");

    var html =
      '<button class="detail__close" aria-label="Close">&times;</button>' +
      '<div class="detail__head">' +
        '<img class="detail__portrait" src="' + esc(portrait) + '" alt="Portrait of ' + esc(entry.name) + '" ' +
             'onerror="this.onerror=null;this.src=\'' + PLACEHOLDER + '\'">' +
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

    /* NPC stat block */
    if (opts.type === "npc" && entry.stats) {
      html += '<p class="detail__section-label">Stat block</p>' + statblockHtml(entry.stats, entry.statNote);
    }

    /* player character sheet. No sheetPdf on the entry, no section. */
    if (opts.type === "player" && entry.sheetPdf) {
      html += '<p class="detail__section-label">Character sheet</p>' +
              '<div class="detail__downloads">' +
                '<a class="btn" href="' + esc(entry.sheetPdf) +
                '" download target="_blank" rel="noopener">&#8681; PDF sheet</a>' +
              '</div>';
    }

    html += '</div>';
    return html;
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
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && backdrop.classList.contains("open")) closeModal();
    });
  }

  function openModal(entry, opts) {
    ensureModal();
    lastFocused = document.activeElement;
    panel.innerHTML = detailHtml(entry, opts);
    panel.querySelector(".detail__close").addEventListener("click", closeModal);
    backdrop.classList.add("open");
    document.body.style.overflow = "hidden";
    panel.querySelector(".detail__close").focus();
  }

  function closeModal() {
    if (!backdrop) return;
    backdrop.classList.remove("open");
    document.body.style.overflow = "";
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  /* ------------------------------------------------------------ public API */
  function renderRoster(containerId, data, type) {
    var el = document.getElementById(containerId);
    if (!el) return;
    if (!data || !data.length) {
      el.className = "";
      el.innerHTML =
        '<div class="empty">No ' + (type === "player" ? "characters" : "entries") +
        ' added yet.<br>Edit <code>assets/data/' +
        (type === "player" ? "players.js" : "npcs.js") + '</code> to add some.</div>';
      return;
    }
    el.className = "roster";
    el.innerHTML = data.map(cardHtml).join("");
    el.querySelectorAll(".roster-card").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openModal(data[+btn.getAttribute("data-index")], { type: type });
      });
    });
  }

  window.DeadHand = { renderRoster: renderRoster };
})();
