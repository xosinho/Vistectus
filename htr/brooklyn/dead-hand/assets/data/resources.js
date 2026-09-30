/* =====================================================================
   RESOURCES  —  documents produced over the course of the chronicle
   ---------------------------------------------------------------------
   Reference material listed under the Documents, Maps and Locations
   cards on the Resources page. Handouts go in assets/data/documents.js
   and maps in assets/data/maps.js instead: those open in pop-ups on
   their own pages. Add an entry below and the Resources page lists it. Newest first within each category reads
   best, so add new entries at the top of their group.

   Fields (full reference at the end of the file):
     title / category / kind / when / description / href / external

   WHERE TO PUT FILES
     Documents and PDFs ... assets/resources/        (any file type)
     Or link anywhere on the web with external: true.
   ===================================================================== */

window.DEAD_HAND_RESOURCES = [

  {
    title: "Blank character sheet",
    category: "Reference",
    kind: "PDF",
    when: "",
    description: "The fillable Hunter: the Reckoning 5th Edition sheet the cell's own sheets are built on.",
    href: "assets/sheets/pdf/blank-character-sheet.pdf"
  }

];

/* ---------------------------------------------------------------------
   FIELD REFERENCE
     title        What the reader clicks
     category     Groups the list. Use the same spelling each time; a
                  new spelling starts a new group. The page shows these
                  in the order they first appear in this file.
                  Suggested: "Handouts", "Session documents", "Maps",
                  "Reference"
     kind         Small label: "PDF", "Map", "Image", "Document", "Link"
     when         Optional: "Session 3", "Act 2", "November 1998"...
     description  One or two lines on what it is
     href         Path to the file (from this chronicle's folder), or
                  a full web address
     external     true for links off the site; opens in a new tab
   Only title and href are required.
   --------------------------------------------------------------------- */
