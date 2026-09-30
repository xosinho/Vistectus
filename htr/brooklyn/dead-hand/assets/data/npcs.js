/* =====================================================================
   NPCs  —  the people around the cell  (player-safe)
   ---------------------------------------------------------------------
   Every entry describes the person as they stood BEFORE play began:
   their place in the world, and nothing that has happened at the table.
   ST-confidential material (true natures, the Giovanni / Cenotaph plot,
   faction secrets) is left OUT. No stat blocks on this page — those
   are ST-only.

   Edit an object below and the NPC page updates itself.
   Portraits -> assets/img/npcs/<file>.  (Add a "stats" object later
   only if you want an ST/stat view — omit it for player-facing.)
   ===================================================================== */

window.DEAD_HAND_NPCS = [

  {
    name: "Elias Thorne",
    tagline: "The friend who called one last time",
    role: "Veteran · Payne’s old comrade",
    portrait: "assets/img/npcs/Elias Thorne.jpg",
    meta: ["Payne’s circle"],
    description:
      "A veteran who served fourteen months in Afghanistan alongside Payne, " +
      "remembered for greeting every on-time resupply with “the trains are " +
      "always on time.” Back in civilian life he lived quietly in Brooklyn, kept " +
      "to himself, and stayed in loose touch with the men he had served with.\n\n" +
      "In the months before the chronicle opens he tried to reach Payne more " +
      "than once. His death is where the story begins."
  },

  {
    name: "Gary Hollis",
    tagline: "Keeps the paperwork moving",
    role: "Ward Administrator · St. Jude’s",
    portrait: "assets/img/npcs/Gary Hollis.jpg",
    meta: ["St. Jude’s Memorial Hospital"],
    description:
      "The ward administrator at St. Jude’s Memorial Hospital, responsible for " +
      "admissions, transfers and the paperwork that follows patients in and out " +
      "of the building. He has held the post for about a year and a half.\n\n" +
      "To the staff he is a mid-level manager like any other: rarely seen on the " +
      "floor, particular about procedure, and always reachable by memo."
  },

  {
    name: "Diane Patterson",
    tagline: "The first face through the doors",
    role: "Receiving Nurse · St. Jude’s",
    portrait: "assets/img/npcs/Diane Patterson.jpg",
    meta: ["St. Jude’s Memorial Hospital"],
    description:
      "A receiving nurse at St. Jude’s who runs the intake desk, the first face " +
      "anyone sees when they come through the doors at night. Experienced, " +
      "unflappable and always busy, she processes what arrives and moves on to " +
      "the next chart.\n\n" +
      "She works alongside Raven, though their jobs differ: Patterson takes " +
      "people in, and Raven works to keep them alive."
  },

  {
    name: "Rico Moretti",
    tagline: "Walked free from Vivienne’s case",
    role: "Enforcer · Brooklyn waterfront",
    portrait: "assets/img/npcs/Rico Moretti.jpg",
    meta: ["Waterfront muscle"],
    description:
      "A known enforcer on the Carroll Gardens and Red Hook waterfront, heavily " +
      "built and quick to violence, who works alongside his brother Marco. " +
      "Vivienne prosecuted him and lost when the case against him fell apart; " +
      "he walked out of court and went back to work.\n\n" +
      "People in the neighbourhood lower their voices when the Moretti brothers " +
      "pass, and take care never to give them a reason to stop."
  },

  {
    name: "Marco Moretti",
    tagline: "The brother people do not see coming",
    role: "Enforcer · Brooklyn waterfront",
    portrait: "assets/img/npcs/Marco Moretti.jpg",
    meta: ["Waterfront muscle"],
    description:
      "Rico’s brother and partner, the quicker and quieter of the two. Where " +
      "Rico is the muscle people see coming, Marco is the one they do not.\n\n" +
      "The brothers have worked as a pair for years, and their reputation on " +
      "the waterfront has been earned together."
  },

  {
    name: "Aldo & Ciro Moretti",
    tagline: "More of the Moretti family",
    role: "Moretti family · Carroll Gardens",
    portrait: "assets/img/npcs/Aldo and Ciro Moretti.jpg",
    meta: ["Waterfront muscle"],
    description:
      "Two more members of the Moretti family, seen with Rico and Marco on the " +
      "waterfront and around Carroll Gardens. Neither has Rico’s reputation, " +
      "and neither seems to want one.\n\n" +
      "The Morettis keep their business, whatever it is, among their own, and " +
      "Aldo and Ciro are part of it."
  },

  {
    name: "Rhys Calder",
    tagline: "The call Payne makes when it is bad",
    role: "Colour Sergeant, SAS · Payne’s friend",
    portrait: "assets/img/npcs/Rhys Calder.jpg",
    meta: ["Payne’s circle", "Ally"],
    description:
      "Colour Sergeant Rhys Calder of the SAS, Payne’s friend from harder years " +
      "and the man who brought him the freelance work he now does for a British " +
      "unit that does not appear in official reports.\n\n" +
      "Steady, discreet and loyal, he is the voice Payne reaches for when a " +
      "situation outgrows what one man can handle, and a bridge to resources " +
      "that do not officially exist."
  },

  {
    name: "Eleanor Marsh",
    tagline: "Has decided Payne is a problem",
    role: "Associate Deputy Director · CIA",
    portrait: "assets/img/npcs/Eleanor Marsh.jpg",
    meta: ["Payne’s circle", "Enemy"],
    description:
      "An Associate Deputy Director at the CIA, and a careful reader of files. " +
      "She has read Payne’s, and concluded that a decorated American officer " +
      "now working for a British unit on American soil has gone rogue.\n\n" +
      "Marsh is patient, well connected and in no hurry. She is building a " +
      "dossier, and means it to be complete before she acts on it."
  },

  {
    name: "Dr. Francisco Ledher",
    tagline: "Takes Adelina’s calls at any hour",
    role: "Surgeon · Ferris-Whitlock Memorial",
    portrait: "assets/img/npcs/Dr. Francisco Ledher.jpg",
    meta: ["Adelina’s circle", "Ally"],
    description:
      "One of the most respected surgeons at Ferris-Whitlock Memorial, with the " +
      "steady hands, long hours and quiet authority that such a reputation " +
      "demands.\n\n" +
      "He is also Adelina’s ally: a man who owes her, keeps her confidences and " +
      "asks few questions in return. What binds them is business, and they " +
      "keep it that way."
  },

  {
    name: "Dr. Jacob Miller",
    tagline: "Raven’s chief, and her quiet cover",
    role: "Chief of ER · St. Jude’s",
    portrait: "assets/img/placeholder.svg",
    meta: ["St. Jude’s Memorial Hospital", "Raven’s circle"],
    description:
      "Chief of the Emergency Room at St. Jude’s, and the closest thing Raven " +
      "has to a guardian on the inside. He covers for her, signs off on shifts " +
      "and absences that do not quite line up, and asks fewer questions than he " +
      "could.\n\n" +
      "Whether that is trust, exhaustion or something he has chosen not to look " +
      "at too closely, Miller is a good man in a hard job."
  },

  {
    name: "Harold Voss",
    tagline: "Taught her the law was worth defending",
    role: "District Attorney · Vivienne’s mentor",
    portrait: "assets/img/npcs/Harold Voss.jpg",
    meta: ["Vivienne’s circle", "Ally"],
    description:
      "The District Attorney, and Vivienne’s boss, mentor and moral compass. He " +
      "taught her that the law is only as good as the people willing to defend " +
      "it when doing so is inconvenient, and he still believes it, which in this " +
      "city is either courage or a liability.\n\n" +
      "He is an ally and a steady hand, and one of the few people Vivienne " +
      "trusts without reservation."
  },

  {
    name: "Vicenzo Pellegrino",
    tagline: "The neighbourhood trusts him with its dead",
    role: "Funeral Director · Pellegrino’s Funeral Home",
    portrait: "assets/img/npcs/Vicenzo Pellegrino.jpg",
    meta: ["Court Street, Carroll Gardens"],
    description:
      "The proprietor of Pellegrino’s Funeral Home, a neo-Gothic brownstone on " +
      "the Court Street corridor and one of the old Italian undertakers of " +
      "Carroll Gardens. Families have trusted the Pellegrinos with their dead " +
      "for generations, and Vincenzo carries the office with courtly, unhurried " +
      "dignity.\n\n" +
      "In a neighbourhood where the funeral trade has long kept company with " +
      "other kinds of business, he is discreet about his clients, and about " +
      "everyone else’s."
  },

  {
    name: "Cosimo Salerno",
    tagline: "Everyone’s favourite at the social club",
    role: "Old-guard regular · Carroll Gardens",
    portrait: "assets/img/npcs/Cosimo Salerno.jpg",
    meta: ["Carroll Gardens"],
    description:
      "A fixture of the neighbourhood’s old-guard social club: courtly, " +
      "generous with his time, and at home among the card tables and the bingo " +
      "nights. He knows everyone’s grandparents and remembers every name.\n\n" +
      "The regulars adore him. He is the one who checks on the widows, sits " +
      "with the lonely, and makes sure no one at the club is forgotten."
  },

  {
    name: "Guido Giovanni",
    tagline: "A name on every board that matters",
    role: "Businessman · The Giovanni family",
    portrait: "assets/img/npcs/Guido Giovanni.jpg",
    meta: ["The Giovanni family"],
    description:
      "A member of the old Giovanni family, whose name appears on property, " +
      "holdings and charitable boards across this part of Brooklyn. He is " +
      "seldom seen in public, and then only at the kind of dinner where money " +
      "is raised politely: clean tailoring, perfect posture, and a calm that " +
      "makes every room feel it has already lost the argument.\n\n" +
      "Those who deal with him describe a patient administrator, courteous and " +
      "precise, who never raises his voice and never seems to need to."
  },

  {
    name: "Marisol Vega",
    tagline: "Builds structures for a discreet family office",
    role: "Director of Corporate Structuring · Hecate Holdings",
    portrait: "assets/img/npcs/Marisol Vega.jpg",
    meta: ["Hecate Holdings"],
    description:
      "Director of Corporate Structuring at Hecate Holdings, a privately held " +
      "property and investment firm. Her work is the architecture of " +
      "companies: holding entities, trusts and the arrangements that let a " +
      "discreet family office own a great deal without appearing to own " +
      "anything.\n\n" +
      "She is meticulous, well paid and proud of the elegance of what she " +
      "builds. She reads every page, and has never needed to ask whose money " +
      "it is."
  },

  {
    name: "Mara Reyes",
    tagline: "No relation",
    role: "Special Agent · FBI",
    portrait: "assets/img/npcs/Mara Reyes.jpg",
    meta: ["Federal"],
    description:
      "A Special Agent with the FBI in New York. Her cases rarely make the " +
      "news, and her reports seem to travel further up the chain than her rank " +
      "would suggest.\n\n" +
      "She shares a surname with Raven, and nothing else."
  },

  {
    name: "Silas Reed",
    tagline: "Runs a quiet house",
    role: "Captain · 76th Precinct, NYPD",
    portrait: "assets/img/placeholder.svg",
    meta: ["NYPD"],
    description:
      "Captain of the NYPD’s 76th Precinct on Union Street, which covers " +
      "Carroll Gardens, Red Hook, Cobble Hill and the Columbia Street " +
      "Waterfront.\n\n" +
      "A long-serving commander with a reputation for running a quiet house: " +
      "crime figures that behave, evidence rooms that balance, and paperwork " +
      "that is always in order."
  },

  {
    name: "Gideon Crane",
    tagline: "Judges people as he judges objects",
    role: "Restorer of Liturgical Objects · Cobble Hill",
    portrait: "assets/img/npcs/Gideon Crane.jpg",
    meta: ["Cobble Hill"],
    description:
      "The owner of a small reliquary atelier in Cobble Hill that restores " +
      "liturgical objects, reliquaries and church silver for parishes and " +
      "private collectors across the North-East. Exacting, courteous and " +
      "quietly formidable, he is well known to the clergy of Brooklyn and to " +
      "few people outside it.\n\n" +
      "He assesses people much as he assesses objects: by where they came from, " +
      "and by what they can bear."
  },

  {
    name: "Carol Summers",
    tagline: "Wants to know what became of her mother",
    role: "Ezekiel’s client",
    portrait: "assets/img/npcs/Carol Summers.jpg",
    meta: ["Ezekiel’s circle", "Civilian"],
    description:
      "Her mother, Peggy Gable, has gone missing, and the official answers do " +
      "not add up. When the calls stopped being returned, Carol hired Ezekiel " +
      "to find her.\n\n" +
      "She is worried, persistent and entirely ordinary, and she wants one " +
      "thing: to know what happened to her mother."
  },

  {
    name: "Peggy Gable",
    tagline: "The mother Carol is looking for",
    role: "Carol Simmons’s mother",
    portrait: "assets/img/npcs/Peggy Gable.jpg",
    meta: ["Ezekiel’s case", "Civilian"],
    description:
      "Margaret Gable, known to everyone as Peggy: Carol Simmons’s mother, and " +
      "a Brooklyn woman of the kind every block has, with family roots in the " +
      "borough going back generations.\n\n" +
      "In November she dropped out of sight, and nothing her daughter has been " +
      "told about where she went holds together."
  },

  {
    name: "Marcus Webb",
    tagline: "A tether to the ordinary world",
    role: "Jack’s teammate",
    portrait: "assets/img/placeholder.svg",
    meta: ["Jack’s circle", "Civilian"],
    description:
      "Jack’s teammate and closest friend on the squad: an ordinary young man " +
      "with an ordinary life.\n\n" +
      "Marcus is a reminder of everything Jack wants to protect: normal, " +
      "uncomplicated, and worth keeping that way."
  },

  {
    name: "Mathew",
    tagline: "The coach who shaped him",
    role: "College football coach · Jack’s mentor",
    portrait: "assets/img/npcs/Mathew.jpg",
    meta: ["Jack’s circle", "Touchstone"],
    description:
      "Jack’s college football coach: the man who recruited him and the mentor " +
      "who shaped him, on the field and off it. Matthew scouts players the way " +
      "he coaches them, for character first.\n\n" +
      "He gave Jack the bracelet Jack never takes off, and he is the person " +
      "Jack calls when he does not know what to do next."
  }

];

/* ---------------------------------------------------------------------
   FIELD REFERENCE
     name / tagline / role / portrait / meta / description
     stats     OPTIONAL object of label -> value (renders a stat block).
               Left off here on purpose — this page is player-facing.
     statNote  OPTIONAL italic note under a stat block.
   --------------------------------------------------------------------- */
