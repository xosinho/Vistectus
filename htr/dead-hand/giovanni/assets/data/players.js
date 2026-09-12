/* =====================================================================
   PLAYERS  —  the cell of "The Dead Hand"  (from DeadHand_Canon.md §2)
   ---------------------------------------------------------------------
   Backgrounds here are PLAYER-SAFE: each character's own known history,
   people, creed and drive. ST-confidential material (secret Adversaries,
   the Giovanni / Cenotaph plot, Kassim / Rodrigo, cross-character
   reveals) is deliberately left OUT so this page is safe to share with
   the whole table.

   Edit an object below and the Players page updates itself.
   Fields: name / tagline / role / portrait / meta / background /
           sheetJson / sheetPdf   (full reference at the end of the file).

   WHERE TO PUT FILES (filenames must match the paths below):
     Portraits ...... assets/img/players/       (jpg / png / webp)
     JSON sheets .... assets/sheets/json/        (.json)
     PDF sheets ..... assets/sheets/pdf/         (.pdf)
   ===================================================================== */

window.DEAD_HAND_PLAYERS = [

  {
    name: "Major Payne",
    tagline: "Already knew the dark was real",
    role: "Ex-Delta Force · Contractor",
    portrait: "assets/img/players/payne.jpg",
    meta: ["Creed: Martial", "Drive: Atonement", "Touchstone: Nadia"],
    background:
      "Ex-Delta Force — “Major” is the rank he actually held. These days he " +
      "works freelance for a British unit that handles the things official " +
      "reports never mention, brought in through his old SAS friend Colour " +
      "Sergeant Rhys Calder. He served fourteen months in Afghanistan beside " +
      "Elias Thorne, who used to grin and say “the trains are always on time” " +
      "every time resupply landed on schedule.\n\n" +
      "Elias called him three days before everything started. Payne didn’t pick " +
      "up. There was no voicemail, and there won’t be another call — and that " +
      "silence is the weight he carries. He met Noor Haddad overseas; her " +
      "daughter Nadia is the person he’d burn the world to protect, and her " +
      "sister Yasmin is a grief he’s never made peace with. Of everyone in the " +
      "cell, Payne is the one who already knew the dark was real. He has his own " +
      "word for what’s out there, and it isn’t “vampire.”",
    sheetJson: "assets/sheets/json/payne.json",
    sheetPdf:  "assets/sheets/pdf/payne.pdf"
  },

  {
    name: "Dorian DeLisle",
    tagline: "Two years chasing a job he can’t take back",
    role: "Hacker · Former Dark-Web Operator",
    portrait: "assets/img/players/dorian.jpg",
    meta: ["Creed: Underground", "Drive: Atonement"],
    background:
      "A hacker and former dark-web operator who has spent two years trying to " +
      "undo something he can’t take back. A job he took as a faceless cutout — " +
      "one he had no reason to think twice about — disabled the monitoring on a " +
      "hospital ward during the hours people died in it. He didn’t know. That " +
      "has never once made it easier.\n\n" +
      "Since then he’s been quietly trying to trace the job back to whoever " +
      "really commissioned it, and every time he gets close the trail dissolves: " +
      "records that vanish, leads that die, paperwork that was never filed. " +
      "Someone is very good at keeping the ghost behind that breach a ghost. " +
      "Dorian intends to find out who.",
    sheetJson: "assets/sheets/json/dorian.json",
    sheetPdf:  "assets/sheets/pdf/dorian.pdf"
  },

  {
    name: "Jack Zeppelin",
    tagline: "Believes no one is beyond saving",
    role: "College Athlete",
    portrait: "assets/img/players/jack.jpg",
    meta: ["Creed: Martial", "Drive: Envy", "Touchstone: Matthew"],
    background:
      "A college athlete who genuinely believes what most people only say — " +
      "that anyone can be saved with the right help. His mother Marrionet and " +
      "his brother James are home to him; his coach and mentor Matthew is the " +
      "man who shaped him, and who handed him a bracelet that has lately started " +
      "doing things a bracelet shouldn’t.\n\n" +
      "His grandmother Lucia was taken and killed just days before the cell came " +
      "together — a loss that’s still raw and far from explained. His father, " +
      "loud and hard-drinking and unconvincingly “sober,” is someone Jack keeps " +
      "at arm’s length, unsure the old man belongs in the same category as the " +
      "people he’d protect.",
    sheetJson: "assets/sheets/json/jack.json",
    sheetPdf:  "assets/sheets/pdf/jack.pdf"
  },

  {
    name: "Ezekiel Delacroix",
    tagline: "The case that followed him from New Orleans",
    role: "Ex-NOPD Detective · Brooklyn PI",
    portrait: "assets/img/players/ezekiel.jpg",
    meta: ["Creed: Inquisitive", "Drive: Oath", "Touchstone: Dara"],
    background:
      "Fourteen years a homicide detective with the New Orleans PD, now a " +
      "private investigator in Brooklyn. He came north carrying a case that was " +
      "never officially a case: his partner Cormac Roux died in an “accident” " +
      "Ezekiel never believed, and the thread he keeps pulling leads back to a " +
      "figure from home known only as the Baron.\n\n" +
      "He works the way he always has — patient, methodical, allergic to the " +
      "easy answer. His circle is small and hard-earned: Dara Silva, whose " +
      "sister he couldn’t save; Bishop, a dog that notices what people miss; " +
      "and Priya Chen, the friend he calls when a trail goes digital. An oath he " +
      "made keeps him moving when sense says stop.",
    sheetJson: "assets/sheets/json/ezekiel.json",
    sheetPdf:  "assets/sheets/pdf/ezekiel.pdf"
  },

  {
    name: "Adelina Morte",
    tagline: "A chosen name for a burned life",
    role: "Ex-Intelligence Officer",
    portrait: "assets/img/players/adelina.jpg",
    meta: ["Creed: Underground", "Drive: Rage", "Touchstone: Francesca"],
    background:
      "Once an officer of Italian intelligence, she spent years buried deep " +
      "undercover inside a criminal network in New York — until her handler was " +
      "caught and her cover collapsed. What they did to her afterward she " +
      "survived by making sure the man who did it did not. “Morte” is a name she " +
      "chose; the one she was born with belongs to a life she can’t go back to.\n\n" +
      "Everything she does now runs on a cold, patient rage, pointed squarely at " +
      "the organization that broke her. The one bright thread she still holds is " +
      "her sister Francesca — the reason she’s careful, and the reason she " +
      "hasn’t burned all the way down. Yet.",
    sheetJson: "assets/sheets/json/adelina.json",
    sheetPdf:  "assets/sheets/pdf/adelina.pdf"
  },

  {
    name: "Vivienne Okafor",
    tagline: "Lost the case she should have won",
    role: "Assistant District Attorney",
    portrait: "assets/img/players/vivienne.jpg",
    meta: ["Creed: Inquisitive", "Drive: Atonement", "Touchstone: Harold Voss"],
    background:
      "Seven years an Assistant District Attorney, and the kind who still " +
      "believes the law is supposed to mean something. She prosecuted a case she " +
      "should have won and watched it come apart around her — evidence " +
      "compromised, testimony gone soft, the whole thing quietly gutted from " +
      "somewhere inside the system she serves.\n\n" +
      "What turned suspicion into something colder was a detail no one else " +
      "flagged: a suspect’s injuries that had healed wrong between the booking " +
      "photo and the arraignment, and a records request that came back " +
      "mysteriously incomplete. She’s building a case now not against one man " +
      "but against the rot itself. Her mentor Harold Voss and her old " +
      "evidence-law professor Rosalind Kane keep her honest; her father’s " +
      "fountain pen keeps her steady.",
    sheetJson: "assets/sheets/json/vivienne.json",
    sheetPdf:  "assets/sheets/pdf/vivienne.pdf"
  },

  {
    name: "Raven Reyes",
    tagline: "Every life is worth saving",
    role: "ER Nurse · Former Latino Kings",
    portrait: "assets/img/players/raven.jpg",
    meta: ["Creed: Underground", "Drive: Oath", "Touchstone: Lina"],
    background:
      "She grew up fast in Queens: her mother died bringing her sister Lina into " +
      "the world, her father died leaving debt, and at fourteen Raven became the " +
      "only thing standing between Lina and the street. That’s the lever Hector " +
      "Cruz and the Latino Kings used to pull her in, and for years she ran with " +
      "them — until a job went wrong and someone who shouldn’t have gotten hurt " +
      "did. She got herself and Lina out and never looked back.\n\n" +
      "Lina’s safe now, out of the city with a family friend and reachable only " +
      "by a landline — Raven takes no chances that Hector could find her. In the " +
      "years since, she poured herself into medicine with something close to " +
      "obsession, and today she’s an ER nurse happiest with her hands doing the " +
      "saving. She keeps a quiet private list of things she’s seen on shift that " +
      "medicine can’t explain. Her creed is simple: every life is worth saving, " +
      "and no one is beyond redemption.",
    sheetJson: "assets/sheets/json/raven.json",
    sheetPdf:  "assets/sheets/pdf/raven.pdf"
  },


];

/* ---------------------------------------------------------------------
   FIELD REFERENCE
     name        Character name (card + popup heading)
     tagline     One short line under the name on the card
     role        Small label under the name in the popup
     portrait    Path to portrait image  -> assets/img/players/<file>
     meta        Array of little tags (creed, drive, touchstone, ...)
     background  String (blank lines = paragraphs), array of paragraphs,
                 or a path to an .html/.txt file to link out to
     sheetJson   Path to the character-sheet JSON -> assets/sheets/json/<file>
     sheetPdf    Path to the character-sheet PDF  -> assets/sheets/pdf/<file>
   Any field except name can be omitted; missing portrait/sheets degrade
   gracefully (placeholder art / hidden download button).
   --------------------------------------------------------------------- */
