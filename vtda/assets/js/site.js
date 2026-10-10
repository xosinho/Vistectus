/* =====================================================================
   VAMPIRE: THE DARK AGES — page title (shared by every chronicle made
   with the Builder)
   ---------------------------------------------------------------------
   The page title, assembled from attributes on <body>:

       <body data-title="The coterie" data-chronicle-name="..." data-world-name="...">
       -> "The coterie · <chronicle> · VisTectus"

   A page without a chronicle (the world's rules) uses the world's name.
   The templates also carry a plain <title>, so this only tidies it.
   ===================================================================== */
(function () {
  "use strict";

  var SITE = "VisTectus";

  function setTitle() {
    var b = document.body;
    var page = b.getAttribute("data-title");
    var where = b.getAttribute("data-chronicle-name") || b.getAttribute("data-world-name") || "";
    document.title = [page, where, SITE].filter(Boolean).join(" · ");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setTitle);
  } else {
    setTitle();
  }
})();
