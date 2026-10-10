/* =====================================================================
   The Last Garden — which species and classes this world allows
   ---------------------------------------------------------------------
   null means "everything on the wiki". To narrow it down, list names
   exactly as the wiki has them, e.g.
     species: ["Human", "Elf", "Dwarf", "Halfling", "Tiefling"],
     classes: ["Fighter", "Rogue", "Wizard", "Cleric"],
   `note` is shown at the top of the page (optional).
   The Create a Character wizard does not read this yet: the Dungeon
   Master checks the choice when approving a character.
   ===================================================================== */
window.WORLD_AVAILABLE = {
  species: null,
  classes: null,
  note: ""
};
