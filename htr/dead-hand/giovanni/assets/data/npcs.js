/* =====================================================================
   NPCs  —  people the cell has MET so far  (player-safe)
   ---------------------------------------------------------------------
   Only characters the players have actually encountered are listed here,
   and every entry is written PLAYER-SAFE: what the cell has observed,
   with ST-confidential material (true natures, the Giovanni / Cenotaph
   plot, faction secrets) left OUT. No stat blocks on this page — those
   are ST-only.

   NOT included yet (players have not met them): Vincenzo Pellegrino,
   Aldo Moretti, Ciro Moretti, Guido Giovanni. Add them here only once
   the cell actually meets them.

   Edit an object below and the NPC page updates itself.
   Portraits -> assets/img/npcs/<file>.  (Add a "stats" object later
   only if you want an ST/stat view — omit it for player-facing.)
   ===================================================================== */

window.DEAD_HAND_NPCS = [

  {
    name: "Elias Thorne",
    tagline: "They met him too late to help",
    role: "The dead man · Payne’s old comrade",
    portrait: "assets/img/npcs/thorne.jpg",
    meta: ["Session 1 · St. Jude’s", "Deceased"],
    description:
      "A veteran — once, long ago, one of Payne’s brothers-in-arms, back when a " +
      "good resupply meant Elias grinning that “the trains are always on time.” " +
      "The cell never knew him in life. They met him as a body on a gurney at " +
      "St. Jude’s, brought in from an apartment colder than the winter outside.\n\n" +
      "He did not stay quiet. Cold to the touch and hours dead, his hand closed " +
      "on a wrist and his mouth shaped a single word — “Pellegrino” — before he " +
      "was still again. Whatever was done to Elias Thorne, his death is the " +
      "thread that pulled all of them into the same room."
  },

  {
    name: "Gary Hollis",
    tagline: "Gave the official story, and not much else",
    role: "Ward Administrator · St. Jude’s",
    portrait: "assets/img/npcs/hollis.jpg",
    meta: ["St. Jude’s Hospital", "Disposition: Evasive"],
    description:
      "The ward administrator on duty at St. Jude’s the night the body came in. " +
      "Pressed hard enough, he produced an official account of Elias Thorne’s " +
      "transfer — clean, tidy, and clearly not the whole truth. He has the look " +
      "of a man reciting lines someone else wrote, and the fear of a man who " +
      "knows what happens if he improvises.\n\n" +
      "His name and credentials turned up on the paperwork that moved Thorne’s " +
      "body. Whether he signed willingly or was simply the most convenient " +
      "signature to borrow is a question he very much does not want asked."
  },

  {
    name: "Nurse Patterson",
    tagline: "The intake desk on a bad night",
    role: "Receiving Nurse · St. Jude’s",
    portrait: "assets/img/npcs/patterson.jpg",
    meta: ["St. Jude’s Hospital"],
    description:
      "A receiving nurse at St. Jude’s who works the intake desk — distinct from " +
      "Raven on the ER floor. Diane Patterson processes what comes through the " +
      "doors and moves on to the next chart.\n\n" +
      "She was on shift the night the cell came together: a familiar, ordinary " +
      "face in a place that stopped feeling ordinary very quickly."
  },

  {
    name: "Rico Moretti",
    tagline: "Came for the body — didn’t leave on his feet",
    role: "Enforcer",
    portrait: "assets/img/npcs/rico.jpg",
    meta: ["Session 1 · St. Jude’s", "Threat: Violent"],
    description:
      "One of two men who arrived at St. Jude’s in ill-fitting scrubs to collect " +
      "Elias Thorne’s body, carrying paperwork that didn’t hold up. Strong in a " +
      "way that doesn’t match his frame, and cold — the air itself seemed to " +
      "drop around him.\n\n" +
      "The night ended badly for Rico. Left wounded, he begged to be put down " +
      "rather than face whatever waited for him, and was taken away instead. " +
      "Whatever he is, he bleeds — and whatever he was afraid of, it wasn’t the " +
      "cell."
  },

  {
    name: "Marco Moretti",
    tagline: "Rico’s brother — faster than anything should be",
    role: "Enforcer",
    portrait: "assets/img/npcs/marco.jpg",
    meta: ["Session 1 · St. Jude’s", "Threat: Violent"],
    description:
      "Rico’s brother, and the faster of the two. When he lunged he moved wrong " +
      "— quicker than the eye wants to allow — and only Jack’s bracelet, snapping " +
      "up between them, turned the strike aside. That moment told the cell more " +
      "than any paperwork could: whatever the Morettis are, the ordinary rules " +
      "don’t fully apply to them.\n\n" +
      "Marco slipped away before the night was over. He is still out there, and " +
      "unlikely to have forgotten the people who put his brother on a gurney."
  },

  {
    name: "Rhys Calder",
    tagline: "The call Payne makes when it’s bad",
    role: "Colour Sergeant, SAS · Payne’s contact",
    portrait: "assets/img/npcs/calder.jpg",
    meta: ["Payne’s circle", "Ally"],
    description:
      "Colour Sergeant Rhys Calder, SAS — Payne’s friend from a harder chapter " +
      "of his life, and the man he reaches for when a situation outgrows what " +
      "one person can handle. Where Payne goes quiet, Rhys is the steady voice " +
      "on the other end of the line, and the bridge to resources that don’t " +
      "officially exist.\n\n" +
      "He’s a lifeline — the kind of ally you’re glad to have, and careful never " +
      "to take for granted."
  },

  {
    name: "Dr. Jacob Miller",
    tagline: "Raven’s boss, and quiet cover",
    role: "Chief of ER · St. Jude’s",
    portrait: "assets/img/npcs/miller.jpg",
    meta: ["St. Jude’s Hospital", "Ally"],
    description:
      "Chief of the Emergency Room at St. Jude’s, and the closest thing Raven " +
      "has to a guardian angel on the inside. He covers for her, signs off on " +
      "the shifts and absences that don’t quite line up, and asks fewer " +
      "questions than he could.\n\n" +
      "Whether that’s trust, exhaustion, or something he’s chosen not to look at " +
      "too closely, Miller is a door that stays open when the cell needs one — " +
      "and a good man to keep on side."
  },

  {
    name: "Harold Voss",
    tagline: "Taught her the law was worth defending",
    role: "District Attorney · Vivienne’s mentor",
    portrait: "assets/img/npcs/voss.jpg",
    meta: ["Vivienne’s circle", "Ally"],
    description:
      "The District Attorney, and Vivienne’s boss, mentor, and moral compass. " +
      "He’s the one who taught her that the law is only as good as the people " +
      "willing to defend it when it’s inconvenient — and he still believes it, " +
      "which in this city is either courage or a liability.\n\n" +
      "For now he’s an ally and a steady hand. How much of what Vivienne is " +
      "uncovering she can bring to his desk without endangering him is a " +
      "question she hasn’t wanted to answer."
  },

  {
    name: "Carol Simmons",
    tagline: "Looking for a mother who vanished",
    role: "Ezekiel’s client",
    portrait: "assets/img/npcs/simmons.jpg",
    meta: ["Ezekiel’s case", "Civilian"],
    description:
      "The woman who hired Ezekiel to find out what happened to her mother, who " +
      "slipped out of the hospital’s care and out of every record that should " +
      "have tracked her. Carol is worried, persistent, and unaware of how deep " +
      "the hole she’s asked him to look into really goes.\n\n" +
      "She doesn’t know the worst of it. Keeping it that way — or deciding when " +
      "she deserves the truth — is a weight Ezekiel now carries on her behalf."
  },

  {
    name: "Marcus Webb",
    tagline: "A tether to the ordinary world",
    role: "Jack’s teammate",
    portrait: "assets/img/npcs/webb.jpg",
    meta: ["Jack’s circle", "Civilian"],
    description:
      "Jack’s teammate and friend — an ordinary guy with an ordinary life, no " +
      "idea that Jack’s bracelet is anything more than a good-luck charm, and no " +
      "notion of what his friend has walked into.\n\n" +
      "Marcus is a reminder of the life Jack is trying to protect: normal, " +
      "uncomplicated, and worth keeping that way. Which is exactly why Jack will " +
      "do almost anything to keep him clear of it."
  }

];

/* ---------------------------------------------------------------------
   FIELD REFERENCE
     name / tagline / role / portrait / meta / description
     stats     OPTIONAL object of label -> value (renders a stat block).
               Left off here on purpose — this page is player-facing.
     statNote  OPTIONAL italic note under a stat block.
   --------------------------------------------------------------------- */
