/* =====================================================================
   DEAD HAND CHRONICLE — page title
   ---------------------------------------------------------------------
   The top bar and footer used to be built here and injected into each
   page. They are now plain HTML in the pages themselves, so navigation
   works with JavaScript switched off, blocked, or merely slow. Adding a
   page to the menu means adding one link to each of the four pages.

   All that is left here is the document title, assembled from the
   data-title attribute on <body>:

       <body data-page="players" data-title="The cell">
       -> "The cell · Dead Hand Chronicle · Vistectus"

   A <title> element in each page would do this without JavaScript, and
   would also be what a search engine reads. Worth doing.
   ===================================================================== */
(function () {
  "use strict";

  var CHRONICLE = "Dead Hand Chronicle";
  var SITE = "Vistectus";

  function setTitle() {
    var page = document.body.getAttribute("data-title");
    document.title = (page ? page + " · " : "") + CHRONICLE + " · " + SITE;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setTitle);
  } else {
    setTitle();
  }
})();
