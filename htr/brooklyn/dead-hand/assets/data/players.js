/* =====================================================================
   PLAYERS  —  the cell of "The Dead Hand"  (from DeadHand_Canon.md §2)
   ---------------------------------------------------------------------
   Backgrounds here are PLAYER-SAFE and describe each hunter as they
   stood BEFORE play began: their history, people, creed and drive,
   and nothing that has happened at the table since. ST-confidential material (secret Adversaries,
   the Giovanni / Cenotaph plot, Kassim / Rodrigo, cross-character
   reveals) is deliberately left OUT so this page is safe to share with
   the whole table.

   Edit an object below and the Players page updates itself.
   Fields: name / tagline / role / portrait / meta / background /
           sheet      (full reference at the end of the file).

   WHERE TO PUT FILES (filenames must match the paths below):
     Portraits ...... assets/img/players/       (jpg / png / webp)
     Sheets ......... online; first published in assets/sheets/data/
   ===================================================================== */

window.DEAD_HAND_PLAYERS = [

  {
    name: "Major Payne",
    tagline: "Knew what was out there before the others",
    role: "Ex-Delta Force · Private contractor",
    portrait: "assets/img/players/payne.jpg",
    meta: ["Creed: Martial", "Drive: Atonement", "Touchstone: Nadia"],
    background:
      "Remington Ian Payne served with Delta Force, and “Major” is the rank he " +
      "actually held. He now works freelance for a British unit that handles " +
      "matters official reports never mention, work that came to him through an " +
      "old SAS friend, Colour Sergeant Rhys Calder. In Afghanistan he spent " +
      "fourteen months beside Elias Thorne, who liked to say “the trains are " +
      "always on time” whenever resupply landed on schedule.\n\n" +
      "He met Noor Haddad in the Middle East, and they had twin daughters. " +
      "Yasmin was taken one night and never came home; the account Noor was " +
      "given is not the truth, and Payne has never corrected it. Nadia, the " +
      "surviving twin, is the person he would do anything to protect. At the " +
      "CIA, an Associate Deputy Director named Eleanor Marsh has decided he is " +
      "a foreign asset operating where he should not be.\n\n" +
      "Long before the others, Payne knew that the dark has things living in " +
      "it. He has his own word for them, and it is not “vampire.” Three days " +
      "before the chronicle opens, Elias Thorne called him. Payne did not pick up.",
    sheet: "payne"
  },

  {
    name: "Dorian DeLisle",
    tagline: "One job he cannot take back",
    role: "Hacker · Former dark-web operator",
    portrait: "assets/img/players/dorian.jpg",
    meta: ["Creed: Underground", "Drive: Atonement"],
    background:
      "A hacker from the South who for years made his living as a faceless " +
      "operator on the dark web, taking work through cutouts and never asking " +
      "who was paying. Two years ago one of those jobs disabled the patient " +
      "monitoring on a hospital ward during the very hours people died on it. " +
      "He did not know what the job was for. That has never made it easier.\n\n" +
      "Since then he has been trying to trace it back to whoever commissioned " +
      "it, and every time he comes close the trail dissolves: records vanish, " +
      "contacts go quiet, paperwork turns out never to have been filed. He grew " +
      "up on his mother’s stories of spirits and old powers, and carries a charm " +
      "he half believes in. Dorian means to find the person behind that breach, " +
      "whatever it costs him.",
    sheet: "dorian"
  },

  {
    name: "Jack Zeppelin",
    tagline: "Believes anyone can be saved",
    role: "College athlete",
    portrait: "assets/img/players/jack.jpg",
    meta: ["Creed: Martial", "Drive: Envy", "Touchstone: Matthew"],
    background:
      "A college football player who believes what most people only say: that " +
      "anyone can be redeemed with the right help. His mother Marrionet and his " +
      "brother James are home to him. His coach, Matthew, is the man who shaped " +
      "him on the field and off it, and the one who gave him the bracelet he " +
      "never takes off.\n\n" +
      "His father, president of the football association and a hard drinker " +
      "making an unconvincing attempt at sobriety, is another matter. Jack keeps " +
      "him at arm’s length and is not sure the old man belongs among the people " +
      "he would protect. When the chronicle opens, Jack is also grieving his " +
      "grandmother Lucia, who died only days before.",
    sheet: "jack"
  },

  {
    name: "Ezekiel Delacroix",
    tagline: "Brought one case north from New Orleans",
    role: "Ex-NOPD detective · Brooklyn PI",
    portrait: "assets/img/players/ezekiel.jpg",
    meta: ["Creed: Inquisitive", "Drive: Oath", "Touchstone: Dara"],
    background:
      "Fourteen years a homicide detective with the New Orleans Police " +
      "Department, now a private investigator in Brooklyn. He came north with a " +
      "case that was never officially a case. His partner, Cormac Roux, died in " +
      "an accident Ezekiel has never accepted, and every thread he pulls leads " +
      "back to a figure from home known only as the Baron. An oath keeps him on " +
      "it when sense says stop.\n\n" +
      "He works as he always has: patiently, methodically, distrustful of easy " +
      "answers. His circle is small and hard-won. Dara Silva lost her sister " +
      "Rosa, a K9 handler who worked beside him, to a heart attack no one could " +
      "explain; Bishop, Rosa’s dog, now stays with him and notices what people " +
      "miss. Priya Chen is the friend he calls when a trail goes digital. In " +
      "Brooklyn his current client is Carol Simmons, who wants to know what has " +
      "become of her mother, and he knows Vivienne Okafor from the courts.",
    sheet: "ezekiel"
  },

  {
    name: "Adelina Morte",
    tagline: "A chosen name for a burned life",
    role: "Former intelligence officer",
    portrait: "assets/img/players/adelina.jpg",
    meta: ["Creed: Underground", "Drive: Rage", "Touchstone: Francesca"],
    background:
      "She was an officer of AISE, Italy’s foreign intelligence service, and " +
      "spent years undercover inside the Family’s operations in New York. When " +
      "her handler, Paolo Bertuzzi, was caught and killed, her cover went with " +
      "him. She was taken and tortured, and escaped by killing the man doing " +
      "it. “Morte” is a name she chose; the one she was born with belongs to a " +
      "life she cannot return to.\n\n" +
      "Everything she does now runs on a cold, patient rage aimed at the " +
      "organisation that broke her, and at whoever truly sits at its head. She " +
      "keeps one professional ally: Dr. Francisco Lehder, a leading surgeon at " +
      "Ferris-Whitlock Memorial, who owes her and asks few questions. The one " +
      "bright thread she still holds is her sister Francesca, the reason she " +
      "remains careful.",
    sheet: "adelina"
  },

  {
    name: "Vivienne Okafor",
    tagline: "Lost the case she should have won",
    role: "Assistant District Attorney",
    portrait: "assets/img/players/vivienne.jpg",
    meta: ["Creed: Inquisitive", "Drive: Atonement", "Touchstone: Harold Voss"],
    background:
      "Seven years an Assistant District Attorney, and still the kind who " +
      "believes the law is supposed to mean something. She prosecuted Rico " +
      "Moretti and lost: evidence was compromised, testimony softened, and the " +
      "case came apart from somewhere inside the system she serves.\n\n" +
      "What turned suspicion into something colder were details no one else " +
      "flagged: injuries that had healed impossibly between a suspect’s booking " +
      "photograph and his arraignment, and a records request that came back " +
      "mysteriously incomplete. She is now building a case against the rot " +
      "itself rather than any one man. Her mentor, District Attorney Harold " +
      "Voss, and her old evidence-law professor, Rosalind Kane, keep her honest; " +
      "her late father’s fountain pen keeps her steady.",
    sheet: "vivienne",
    links: [{ label: "RICO Case", href: "rico-case/index.html" }]
  },

  {
    name: "Raven Reyes",
    tagline: "Every life is worth saving",
    role: "ER Nurse · Former Latino Kings",
    portrait: "assets/img/players/raven.jpg",
    meta: ["Creed: Underground", "Drive: Oath", "Touchstone: Lina"],
    background:
      "She grew up fast in Queens. Her mother died bringing her sister Lina " +
      "into the world, her father died leaving debt, and at fourteen Raven " +
      "became the only thing standing between Lina and the street. That was the " +
      "lever Hector Cruz used to pull her into the Latino Kings, and for years " +
      "she ran with them, until a job went wrong and a bystander who should " +
      "never have been hurt was. She walked away, and Hector has never accepted " +
      "it.\n\n" +
      "Lina is safe now, living out of state with a family friend and reachable " +
      "only by landline; Raven takes no chances that Hector could find her. In " +
      "the years since, Raven has poured herself into medicine with something " +
      "close to obsession. She is an ER nurse at St. Jude’s Memorial, happiest " +
      "with her hands doing the saving, and the Chief of ER, Dr. Jacob Miller, " +
      "covers for her more than he has to. She keeps a private list of things " +
      "she has seen on shift that medicine cannot explain. Her creed is simple: " +
      "every life is worth saving, and no one is beyond redemption.",
    sheet: "raven"
  }

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
     sheet       The character sheet's name, e.g. "vivienne": opens
                 sheet.html?c=vivienne. The sheet itself is online (see
                 the README); assets/sheets/data/<name>.json is the copy
                 shown when the online one cannot be reached.
     links       Extra pages shown as buttons under "Case files", e.g.
                 [{ label: "RICO Case", href: "rico-case/index.html" }]
   Any field except name can be omitted; missing portrait/sheets degrade
   gracefully (placeholder art / hidden download button).
   --------------------------------------------------------------------- */
