/* =====================================================================
   HUNTER CHRONICLES (made with the Builder) — page title
   ---------------------------------------------------------------------
   One copy for every Builder-made Hunter chronicle. The title is put
   together from <body>:

       <body data-title="The cell" data-chronicle-name="Night Shift">
       -> "The cell · Night Shift · VisTectus"

   The templates also carry a plain <title>, so this only keeps the two
   in step (and covers pages whose title changes as they are used).
   ===================================================================== */
(function () {
  "use strict";

  var SITE = "VisTectus";

  function setTitle() {
    var b = document.body;
    var page = b.getAttribute("data-title");
    var chron = b.getAttribute("data-chronicle-name");
    if (!chron) return;
    document.title = (page ? page + " · " : "") + chron + " · " + SITE;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setTitle);
  else setTitle();
})();
