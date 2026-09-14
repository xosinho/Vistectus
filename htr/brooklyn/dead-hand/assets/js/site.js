/* =====================================================================
   DEAD HAND CHRONICLE — shared top bar and footer
   ---------------------------------------------------------------------
   The chronicle has several pages that all carry the same bar. It is
   defined ONCE here and injected into each page, so adding a page means
   adding one line to NAV below, not editing four files.

   Each page sets  <body data-page="players">  so the current tab can be
   marked. The hero and its crumb trail stay in the page itself.

   This is the only part of the site that builds chrome with JavaScript;
   it exists because the chronicle pages are a set. Pages higher up the
   hierarchy write their bar in plain HTML.
   ===================================================================== */
(function () {
  "use strict";

  /* ---- where this chronicle sits, and what it is called ---- */
  var SITE = {
    chronicle: "Dead Hand Chronicle",
    world:     "Brooklyn Chronicles",
    hub:       "../../../index.html",   /* Vistectus            */
    worldHref: "../index.html",         /* Brooklyn Chronicles  */
    logoAlt:   "Vistectus"
  };

  /* ---- menu — add, reorder or rename pages here ---- */
  var NAV = [
    { id: "home",       label: "Chronicle", href: "index.html" },
    { id: "players",    label: "The cell",  href: "players.html" },
    { id: "npcs",       label: "People",    href: "npcs.html" },
    { id: "compendium", label: "Compendium", href: "compendium.html" }
  ];

  function current() { return document.body.getAttribute("data-page") || "home"; }

  function headerHtml() {
    var here = current();
    var links = NAV.map(function (n) {
      return '<a href="' + n.href + '"' +
             (n.id === here ? ' aria-current="page"' : "") + ">" + n.label + "</a>";
    }).join("");

    return '<a class="skip" href="#main">Skip to content</a>' +
           '<header class="topbar">' +
             '<a class="brand" href="' + SITE.hub + '">' +
               '<span class="brand-mark" aria-hidden="true"></span> Vistectus</a>' +
             '<nav class="topnav">' + links + "</nav>" +
           "</header>";
  }

  function footerHtml() {
    return '<footer><div class="footer-inner">' +
             "<p>&copy; 2026 Vistectus</p>" +
             '<p class="links">' +
               '<a href="' + SITE.worldHref + '">' + SITE.world + "</a>" +
               '<a href="' + SITE.hub + '">Back to the hub</a>' +
             "</p>" +
           "</div></footer>";
  }

  function inject() {
    document.body.insertAdjacentHTML("afterbegin", headerHtml());
    document.body.insertAdjacentHTML("beforeend", footerHtml());
    var page = document.body.getAttribute("data-title");
    document.title = (page ? page + " \u00b7 " : "") + SITE.chronicle + " \u00b7 Vistectus";
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inject);
  } else {
    inject();
  }
})();
