/* =====================================================================
   NPCs  —  the people around the coterie  (player-safe)
   ---------------------------------------------------------------------
   This page is public. Describe each person as the coterie knows them;
   true natures, secret allegiances and anything else the Storyteller
   is keeping back stay OUT. Stat sheets are separate and Storyteller
   only (the Storyteller page).

   The Storyteller can hide any entry from players on the People page
   (sign in, then "Hide from players"), so an entry can be added ahead
   of time and shown when the coterie meets them.

   Portraits -> assets/img/npcs/<file>  (jpg / png / webp)
   ===================================================================== */

window.CROWN_NPCS = [

  /* Example — copy, fill in, and remove the comment marks:
  {
    name: "Bishop Konrad",
    tagline: "One line under the name on the card",
    role: "Bishop of Vác",
    portrait: "assets/img/npcs/Bishop Konrad.jpg",
    meta: ["Church"],
    description:
      "What the coterie knows of him.\n\n" +
      "A second paragraph.",
    file: {
      "Seen at": "The cathedral of Vác",
      "Allegiance": "Unknown"
    }
  },
  */

];

/* ---------------------------------------------------------------------
   FIELD REFERENCE
     name         Shown on the card and the pop-up (and used to hide it)
     tagline      One line under the name on the card
     role         One line under the name in the pop-up
     portrait     Path to the image; leave out for the placeholder
     meta         Small tags in the pop-up
     description  Paragraphs separated by \n\n
     file         Optional "Subject file" table: { "Label": "Value" }
   --------------------------------------------------------------------- */
