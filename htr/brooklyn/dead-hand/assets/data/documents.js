/* =====================================================================
   DOCUMENTS  —  handouts and papers the cell has found
   ---------------------------------------------------------------------
   Add an entry below and the Documents page lists it; clicking it opens
   the document in a pop-up over the page. Entries are grouped by
   `type`, in the order each type first appears here.

   WHERE TO PUT FILES
     assets/resources/Documents/      (.html, .pdf, .jpg, .png, .webp)

   This page is public. Only add what the players have actually been
   given.
   ===================================================================== */

window.DEAD_HAND_DOCUMENTS = [

  {
    title: "Registro delle Provenienze, f. 47 v.",
    type: "Documents",
    when: "",
    description: "A leaf from an archive ledger of provenances, marked riservato.",
    file: "assets/resources/Documents/Purity Ledger.html",
    pdf: "assets/resources/Documents/DeadHand_Purity_Ledger_f47v.pdf"
  },

  {
    title: "Register of Works",
    type: "Documents",
    when: "",
    description: "A register of works for the current cycle.",
    file: "assets/resources/Documents/Register_of_Works.html"
  },

  {
    title: "I. G. — Private Book",
    type: "Diaries",
    when: "",
    description: "A private notebook kept by Ilaria Grimani, recording her observations of the Brooklyn house and the Red Hook warehouse activity.",
    file: "assets/resources/Documents/DeadHand_Grimani_Diary.html"
  },

  {
    title: "Grimani — Letter to the Seat",
    type: "Letters",
    when: "",
    description: "A warning letter from Ilaria Grimani to the Venetian Seat, setting out her disturbing suspicions about the Brooklyn operation.",
    file: "assets/resources/Documents/DeadHand_Grimani_Letter.html"
  },

  {
    title: "E. Thorne — Observations",
    type: "Notes",
    when: "",
    description: "A notebook of Elias Thorne's observations from the Brooklyn basement, documenting the icy cold spot and the signs that something has been sleeping there.",
    file: "assets/resources/Documents/DeadHand_Thorne_Notes.html"
  }

];

/* ---------------------------------------------------------------------
   FIELD REFERENCE
     title        What the reader clicks
     type         Groups the list: "Ledgers and registers", "Letters",
                  "Reports", "Photographs", "Newspapers"... Use the same
                  spelling each time; a new spelling starts a new group.
     when         Optional: "Session 3", "Act 2"...
     description  One line on what it is
     file         The document itself, opened in the pop-up:
                  .html, .pdf or an image
     pdf          Optional printable copy, offered as a download
   Only title, type and file are required.
   --------------------------------------------------------------------- */
