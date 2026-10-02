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
    role: "Retired U.S. Army Ranger",
    portrait: "assets/img/npcs/Elias Thorne.jpg",
    meta: ["Central figure"],
    description:
      "Retired U.S. Army veteran, 75th Ranger Regiment — logistics and " +
      "intelligence background. Maternal line traces to a Venetian family, " +
      "Tonello, recorded in American documents under the anglicised form " +
      "Tonnelli. Sole occupant of a private residence at 74 Degraw Street, " +
      "Carroll Gardens, inherited from a deceased relative. No immediate family " +
      "listed as next of kin on file. Recently deceased; the residence and the " +
      "circumstances surrounding his death are the subject of an active, " +
      "multi-party inquiry. Subject is a person of interest connecting several " +
      "currently unresolved threads.",
    file: {
      "File status": "Active / Under Investigation",
      "Age": "62",
      "Status": "Deceased — cause and circumstances pending final determination. Recent.",
      "Race": "White American",
      "Height": "5'11\"",
      "Weight": "~185 lbs",
      "Hair": "Grey, close-cropped, military-style cut",
      "Distinguishing marks": "Old shrapnel scarring, left forearm; faded 75th Ranger Regiment tab tattoo, right shoulder. Weathered, sun-worn complexion consistent with extensive overseas deployment history."
    }
  },

  {
    name: "Peggy Gable",
    tagline: "The mother Carol is looking for",
    role: "Missing person · Carol Simmons’s mother",
    portrait: "assets/img/npcs/Peggy Gable.jpg",
    meta: ["Central figure"],
    description:
      "Mother of Carol Simmons and a long-time Carroll Gardens resident. " +
      "Dropped out of sight in November. Her daughter has been unable to obtain " +
      "a clear account of her whereabouts through official channels and has " +
      "retained a private investigator.",
    file: {
      "File status": "Active / Missing Person",
      "Age": "71",
      "Status": "Missing since mid-November. Reported by family.",
      "Race": "White American (Italian-American, Ferraro family)",
      "Height": "5'3\"",
      "Weight": "~135 lbs",
      "Hair": "Silver, set in soft short curls",
      "Distinguishing marks": "Warm, lined face; reading glasses on a beaded chain. Wedding band worn on a chain around her neck since widowhood. A lifelong Carroll Gardens resident, recognisable at the parish and the local shops."
    }
  },

  {
    name: "Carol Simmons",
    tagline: "Wants to know what became of her mother",
    role: "Peggy Gable’s daughter",
    portrait: "assets/img/npcs/Carol Summers.jpg",
    meta: ["Central figure"],
    description:
      "Daughter of Margaret \"Peggy\" Gable, recently admitted to St. Jude's " +
      "Hospital. Has retained a private investigator regarding her mother's " +
      "whereabouts after failing to obtain answers through official channels.",
    file: {
      "File status": "Active / Complainant",
      "Age": "46",
      "Status": "Alive.",
      "Race": "Mixed heritage — Black American (father) and Italian-American (mother)",
      "Height": "5'5\"",
      "Weight": "~130 lbs",
      "Hair": "Dark, loosely curled, greying, worn short",
      "Distinguishing marks": "Slender build; her mother's features in the eyes and jaw. Visibly strained composure; dark circles consistent with prolonged stress."
    }
  },

  {
    name: "Gary Hollis",
    tagline: "Keeps the paperwork moving",
    role: "Ward Administrator · St. Jude’s",
    portrait: "assets/img/npcs/Gary Hollis.jpg",
    meta: ["St. Jude’s Hospital"],
    description:
      "Ward administrator, St. Jude's Hospital. Holds system access relevant to " +
      "patient records and transfer documentation. Has provided inconsistent " +
      "accounts regarding recent administrative irregularities. Subject is " +
      "considered a cooperative-under-pressure witness of uncertain " +
      "reliability.",
    file: {
      "File status": "Active / Under Investigation",
      "Age": "54",
      "Status": "Alive.",
      "Race": "Black American",
      "Height": "5'9\"",
      "Weight": "~200 lbs",
      "Hair": "Short, greying at the temples; neatly trimmed moustache",
      "Distinguishing marks": "Reading glasses, habitually removed to rub the bridge of his nose. Rumpled administrative attire; visible fatigue."
    }
  },

  {
    name: "Diane Patterson",
    tagline: "The first face through the doors",
    role: "Receiving Nurse · St. Jude’s",
    portrait: "assets/img/npcs/Diane Patterson.jpg",
    meta: ["St. Jude’s Hospital"],
    description:
      "Receiving nurse, St. Jude's Hospital. Peripheral witness to routine " +
      "hospital intake procedure during a recent incident. No further " +
      "involvement established.",
    file: {
      "File status": "Closed / Peripheral",
      "Age": "41",
      "Status": "Alive.",
      "Race": "White American",
      "Height": "5'6\"",
      "Weight": "~140 lbs",
      "Hair": "Brown, worn in a practical bun",
      "Distinguishing marks": "None noted. Typically in hospital scrubs with a lanyard ID."
    }
  },

  {
    name: "Dr. Jacob Miller",
    tagline: "Raven’s chief, and her quiet cover",
    role: "Chief of Emergency Medicine · St. Jude’s",
    portrait: "assets/img/npcs/Dr. Jacob Miller.jpg",
    meta: ["St. Jude’s Hospital"],
    description:
      "Chief of Emergency Medicine, St. Jude's Hospital. Professional mentor to " +
      "a member of the emergency nursing staff. Cooperative with official " +
      "inquiries; no direct involvement in open matters established.",
    file: {
      "File status": "Closed / Peripheral",
      "Age": "58",
      "Status": "Alive.",
      "Race": "White American",
      "Height": "6'0\"",
      "Weight": "~180 lbs",
      "Hair": "Silver-grey, kept short; clean-shaven",
      "Distinguishing marks": "Wire-rimmed glasses; deep-set lines around the eyes. Tall and slightly stooped, with the unhurried manner of a long-serving trauma physician. Usually in a white coat over scrubs."
    }
  },

  {
    name: "Guido Giovanni",
    tagline: "No photograph worth keeping",
    role: "Principal · Brooklyn holdings firm",
    portrait: "assets/img/npcs/Guido Giovanni.jpg",
    meta: ["The Family & its holdings"],
    description:
      "Reputed principal behind a Brooklyn holdings firm and an associated " +
      "network of Venetian-named shell entities. No criminal record. Named in " +
      "connection with an enterprise-level organized-crime inquiry; a direct " +
      "evidentiary link to his person has so far proven difficult to establish.",
    file: {
      "File status": "Active / Under Investigation — Priority",
      "Age": "Apparent mid-50s (documentary age unverified)",
      "Status": "Alive; whereabouts intermittently known.",
      "Race": "White (Italian national origin)",
      "Height": "5'10\"",
      "Weight": "~170 lbs",
      "Hair": "Dark, greying at the temples, neatly barbered",
      "Distinguishing marks": "Trim, composed build; understated bespoke tailoring. Consistently described as unusually calm. No known photographs of acceptable quality on file."
    }
  },

  {
    name: "Vincenzo Pellegrino",
    tagline: "Third generation of the family trade",
    role: "Owner · Pellegrino & Sons Funeral Home",
    portrait: "assets/img/npcs/Vicenzo Pellegrino.jpg",
    meta: ["The Family & its holdings"],
    description:
      "Third-generation owner-operator of Pellegrino & Sons Funeral Home, " +
      "Carroll Gardens (est. 1947). The premises were subsequently destroyed in " +
      "an explosion publicly attributed to a gas leak. The business's records " +
      "and associations are of significant investigative interest.",
    file: {
      "File status": "Active / Under Investigation",
      "Age": "59",
      "Status": "Deceased — circumstances under active investigation. Recent.",
      "Race": "White American (Italian-American)",
      "Height": "5'8\"",
      "Weight": "~160 lbs",
      "Hair": "Silver, immaculately combed",
      "Distinguishing marks": "Trim, composed bearing. Always in funeral-director black; soft-spoken; gold signet ring, right hand."
    }
  },

  {
    name: "Rico Moretti",
    tagline: "Walked free from Vivienne’s case",
    role: "Organized-crime associate",
    portrait: "assets/img/npcs/Rico Moretti.jpg",
    meta: ["The Family & its holdings"],
    description:
      "Known associate of a Brooklyn-based organized-crime concern. Former " +
      "defendant in an unsuccessful prosecution. Publicly identified as the " +
      "perpetrator of a recent hospital shooting and reported killed at the " +
      "scene; that account is contested. Subject's associations remain relevant " +
      "to several open matters.",
    file: {
      "File status": "Active / Under Investigation",
      "Age": "34",
      "Status": "Deceased — official account disputed by multiple witnesses. Recent.",
      "Race": "White American (Italian-American)",
      "Height": "6'1\"",
      "Weight": "~230 lbs",
      "Hair": "Dark, short; short full beard",
      "Distinguishing marks": "Old scar bisecting the left eyebrow. Heavyset, muscular build; witnesses consistently describe unusual physical resilience."
    }
  },

  {
    name: "Marco Moretti",
    tagline: "Not seen since the night of the 16th",
    role: "Organized-crime associate",
    portrait: "assets/img/npcs/Marco Moretti.jpg",
    meta: ["The Family & its holdings"],
    description:
      "Brother of Rico Moretti and known associate of the same organized-crime " +
      "concern. Last linked to a residential property on Columbia Street held " +
      "through a corporate shell; not seen since. No body has been recovered.",
    file: {
      "File status": "Active / Under Investigation",
      "Age": "29",
      "Status": "Missing since the night of 16–17 November. Presumed deceased.",
      "Race": "White American (Italian-American)",
      "Height": "5'10\"",
      "Weight": "~165 lbs",
      "Hair": "Dark, slicked back",
      "Distinguishing marks": "Lean, wiry build. Gunshot wound to the back of one knee, sustained 16 November. Witnesses describe exceptional speed of movement."
    }
  },

  {
    name: "Aldo & Ciro Moretti",
    tagline: "Uncle and nephew in the embalming suite",
    role: "Morticians · Pellegrino & Sons Funeral Home",
    portrait: "assets/img/npcs/Aldo and Ciro Moretti.jpg",
    meta: ["The Family & its holdings"],
    description:
      "Uncle and nephew, both employed as morticians at Pellegrino & Sons " +
      "Funeral Home. They are relatives of Rico and Marco Moretti and " +
      "associates of the same organized-crime concern. Aldo had worked the " +
      "embalming suite for decades; Ciro joined under his uncle. Both are " +
      "believed to have had direct knowledge of the funeral home's handling of " +
      "remains. Their deaths, together with that of the owner and the later " +
      "destruction of the premises, leave few living witnesses to its " +
      "operations.",
    file: {
      "File status": "Active / Under Investigation",
      "Age": "Aldo, 55 · Ciro, 28",
      "Status": "Both deceased. Gunshot wounds, sustained on the premises of Pellegrino & Sons Funeral Home during the execution of a search warrant on the night of 16–17 November. Circumstances under investigation.",
      "Aldo · Race": "White American (Italian-American)",
      "Aldo · Height": "5'8\"",
      "Aldo · Weight": "~185 lbs",
      "Aldo · Hair": "Grey, thinning, combed flat",
      "Aldo · Distinguishing marks": "Stooped, heavy-shouldered build. Deep-set, exhausted eyes. Chemical burns and discoloration on both hands from long work with embalming fluids. Usually in a stained work apron over shirtsleeves.",
      "Ciro · Race": "White American (Italian-American)",
      "Ciro · Height": "5'11\"",
      "Ciro · Weight": "~160 lbs",
      "Ciro · Hair": "Dark, kept short at the sides",
      "Ciro · Distinguishing marks": "Lean build, with a nervous habit of glancing toward doors. Small tattoo of a rosary bead strand on the left wrist. Carried a funeral-home staff ID."
    }
  },

  {
    name: "Cosimo Salerno",
    tagline: "Never lets anyone eat alone on a holiday",
    role: "Social-club regular · Carroll Gardens",
    portrait: "assets/img/npcs/Cosimo Salerno.jpg",
    meta: ["The Family & its holdings"],
    description:
      "Fixture of an old-guard Italian social club in Carroll Gardens for as " +
      "long as anyone there can remember. Beloved by the regulars. Known for " +
      "looking after the neighbourhood's widows and isolated elderly: he drives " +
      "them to appointments, calls on them at home, and never lets anyone eat " +
      "alone on a holiday.",
    file: {
      "File status": "Active / Under Investigation",
      "Age": "Apparent early 70s",
      "Status": "Whereabouts unknown. Sought for questioning in connection with a recent incident at his social club.",
      "Race": "White American (Italian-American)",
      "Height": "5'7\"",
      "Weight": "~170 lbs",
      "Hair": "White, thick, combed back; neat white moustache",
      "Distinguishing marks": "Barrel-chested and genial. Always in a pressed cardigan or three-piece suit, with a gold crucifix on a fine chain. Remembers every name, birthday and anniversary in the neighbourhood."
    }
  },

  {
    name: "Marisol Vega",
    tagline: "Builds structures for a discreet family office",
    role: "Director of Corporate Structuring",
    portrait: "assets/img/npcs/Marisol Vega.jpg",
    meta: ["The Family & its holdings"],
    description:
      "Director of Corporate Structuring at a Brooklyn holdings firm. Designs " +
      "the company structures that allow a discreet family office to hold " +
      "substantial assets without appearing to. Her work product is of " +
      "significant interest to an ongoing inquiry.",
    file: {
      "File status": "Active / Person of Interest",
      "Age": "41",
      "Status": "Alive; not seen publicly since 21 November.",
      "Race": "Latina American (Puerto Rican descent)",
      "Height": "5'5\"",
      "Weight": "~130 lbs",
      "Hair": "Dark brown, worn in a sleek low chignon",
      "Distinguishing marks": "Tailored corporate dress; tortoiseshell glasses. Precise, rapid speech. Visible tension in recent encounters, including a habit of checking her phone mid-sentence."
    }
  },

  {
    name: "Harold Voss",
    tagline: "Taught her the law was worth defending",
    role: "Kings County District Attorney’s Office",
    portrait: "assets/img/npcs/Harold Voss.jpg",
    meta: ["Law, justice & intelligence"],
    description:
      "Senior figure in the Kings County prosecutorial apparatus. Oversees a " +
      "number of sensitive, ongoing matters touching on organized crime in the " +
      "Brooklyn area. Longtime mentor to at least one Assistant District " +
      "Attorney with involvement in open files.",
    file: {
      "File status": "Restricted / Official",
      "Age": "61",
      "Status": "Alive.",
      "Race": "White American",
      "Height": "5'10\"",
      "Weight": "~220 lbs",
      "Hair": "White, close-cropped; heavy white eyebrows",
      "Distinguishing marks": "Broad, heavyset frame; ruddy complexion. Half-moon reading glasses worn low on the nose. Tie habitually loosened, sleeves rolled. Carries a battered leather briefcase decades older than his current office."
    }
  },

  {
    name: "Silas Reed",
    tagline: "Left a note, and a number of open files",
    role: "Captain · 76th Precinct, NYPD",
    portrait: "assets/img/npcs/Silas Reed.jpg",
    meta: ["Law, justice & intelligence"],
    description:
      "Commanding officer, 76th Precinct, with oversight of evidence handling, " +
      "property custody and scene logistics. His name appears in the records of " +
      "several matters in which evidence was compromised or chains of custody " +
      "broke down. The note recovered at his death confesses to coercion by a " +
      "rival crime family and to the framing of others; its contents have not " +
      "been verified. His death leaves a number of open files without their " +
      "central witness.",
    file: {
      "File status": "Closed / Internal Affairs Review Pending",
      "Age": "57",
      "Status": "Deceased — single gunshot wound beneath the jaw; ruled an apparent suicide. A handwritten note was recovered at the scene. Recent.",
      "Race": "White American (Irish-American)",
      "Height": "6'0\"",
      "Weight": "~215 lbs",
      "Hair": "Iron-grey, regulation crew cut; heavy grey moustache",
      "Distinguishing marks": "Broad-shouldered, thickening at the middle. Florid complexion. Class ring worn on the right hand. Kept a commanding officer's bearing through more than thirty years of service."
    }
  },

  {
    name: "Mara Reyes",
    tagline: "No relation",
    role: "Special Agent · FBI",
    portrait: "assets/img/npcs/Mara Reyes.jpg",
    meta: ["Law, justice & intelligence"],
    description:
      "Federal agent attached to a specialized FBI division. Deployed to the " +
      "Carroll Gardens area following a recent multiple-homicide incident. Has " +
      "established direct contact with several individuals connected to open " +
      "matters. No relation to R. Reyes.",
    file: {
      "File status": "Restricted / Federal",
      "Age": "44",
      "Status": "Alive, active.",
      "Race": "Latina American",
      "Height": "5'6\"",
      "Weight": "~135 lbs",
      "Hair": "Dark, pulled back tightly",
      "Distinguishing marks": "Athletic build. Direct manner; minimal patience for small talk. Standard federal field attire."
    }
  },

  {
    name: "Eleanor Marsh",
    tagline: "Building her case file by file",
    role: "Associate Deputy Director · CIA",
    portrait: "assets/img/npcs/Eleanor Marsh.jpg",
    meta: ["Law, justice & intelligence"],
    description:
      "Associate Deputy Director, Central Intelligence Agency. Building a " +
      "methodical case concerning Major R. I. Payne, whom she believes to have " +
      "gone rogue. Her inquiry advances slowly, file by file, but it has not " +
      "stalled.",
    file: {
      "File status": "Restricted / Federal",
      "Age": "53",
      "Status": "Alive, active.",
      "Race": "White American",
      "Height": "5'7\"",
      "Weight": "~140 lbs",
      "Hair": "Ash-blonde going grey, cut in a precise chin-length bob",
      "Distinguishing marks": "Rimless glasses; composed, watchful stillness. Dresses in understated charcoal and navy. Takes handwritten notes in a small leather-bound book rather than on a device."
    }
  },

  {
    name: "Rhys Calder",
    tagline: "The call Payne makes when it is bad",
    role: "Colour Sergeant · 22 SAS",
    portrait: "assets/img/npcs/Rhys Calder.jpg",
    meta: ["Law, justice & intelligence"],
    description:
      "Colour Sergeant, 22 SAS, with connections to British security services. " +
      "A long-standing associate of Major R. I. Payne from shared overseas " +
      "deployment. Maintains periodic contact with the subject; the nature of " +
      "that relationship is only partially documented.",
    file: {
      "File status": "Restricted / Foreign Liaison",
      "Age": "47",
      "Status": "Alive, active.",
      "Race": "White British",
      "Height": "6'0\"",
      "Weight": "~190 lbs",
      "Hair": "Grey, close-cropped",
      "Distinguishing marks": "Controlled, economical bearing consistent with special-forces service. Faint scarring across the knuckles of both hands. Clipped Welsh-inflected accent."
    }
  },

  {
    name: "Dr. Francisco Lehder",
    tagline: "Takes Adelina’s calls at any hour",
    role: "Senior Surgeon · Ferris-Whitlock Memorial",
    portrait: "assets/img/npcs/Dr. Francisco Ledher.jpg",
    meta: ["Cartel & street"],
    description:
      "Senior surgeon at Ferris-Whitlock Memorial, widely respected in his " +
      "field. Maintains a personal association with A. Morte, to whom he is " +
      "understood to be indebted. Known to extend discretion to those he " +
      "considers his own and to ask few questions of them.",
    file: {
      "File status": "Unclassified / Monitored",
      "Age": "51",
      "Status": "Alive.",
      "Race": "Hispanic (Mexican-born, of German descent)",
      "Height": "6'0\"",
      "Weight": "~175 lbs",
      "Hair": "Dark, swept back, silvering at the temples; neatly kept goatee",
      "Distinguishing marks": "Long, steady surgeon's hands; an expensive wristwatch worn under a starched cuff. Polished, courteous manner. Speaks English, Spanish and German."
    }
  },

  {
    name: "José Pérez",
    tagline: "Calm until the violence starts",
    role: "Suspected cartel operative",
    portrait: "assets/img/npcs/Jose Perez.jpg",
    meta: ["Cartel & street"],
    description:
      "Suspected operative of a Mexican trafficking organization. Believed to " +
      "have risen through its ranks from enforcement work on the strength of " +
      "his effectiveness and a marked readiness for violence. Currently thought " +
      "to coordinate the supply of product to New York street organizations. " +
      "Known associate of A. Morte. Linked by informant reporting to recent " +
      "moves toward the Red Hook waterfront, though no charges have been " +
      "brought.",
    file: {
      "File status": "Active / Under Investigation — Priority",
      "Age": "38",
      "Status": "Alive, active.",
      "Race": "Hispanic (Mexican national, Sinaloa-born)",
      "Height": "5'9\"",
      "Weight": "~180 lbs",
      "Hair": "Black, cropped short; thin moustache",
      "Distinguishing marks": "Old knife scar running from the left jaw to the collarbone. Santa Muerte tattoo on the inner right forearm. Dresses well in plain, expensive clothes. Witnesses consistently describe a flat, unhurried calm that sharpens abruptly when violence begins."
    }
  },

  {
    name: "Hector Cruz",
    tagline: "Never lets his people go",
    role: "Senior figure · Queens street organization",
    portrait: "assets/img/npcs/Hector Cruz.jpg",
    meta: ["Cartel & street"],
    description:
      "Senior figure in a Queens-based street organization, with a long record " +
      "of suspected involvement in extortion and narcotics distribution. Known " +
      "for keeping a firm hold on his people and for pursuing those who leave. " +
      "His crew's activity has recently extended into Red Hook and Carroll " +
      "Gardens, and intelligence suggests it has begun working for an outside " +
      "organization with interests along the Red Hook waterfront.",
    file: {
      "File status": "Active / Under Investigation",
      "Age": "44",
      "Status": "Alive, active.",
      "Race": "Hispanic American (Puerto Rican descent)",
      "Height": "5'10\"",
      "Weight": "~195 lbs",
      "Hair": "Black, close-faded; neatly edged beard",
      "Distinguishing marks": "Five-point crown tattoo on the back of the right hand. Gold rosary worn outside the shirt. Soft-spoken and unhurried, and never raises his voice."
    }
  },

  {
    name: "Marcus Webb",
    tagline: "A tether to the ordinary world",
    role: "College athlete · Jack’s teammate",
    portrait: "assets/img/npcs/Marcus Webb.jpg",
    meta: ["Associate"],
    description:
      "College athlete and teammate of J. Zeppelin. Civilian; no connection to " +
      "any open matter established.",
    file: {
      "File status": "Closed / Peripheral",
      "Age": "21",
      "Status": "Alive.",
      "Race": "Black American",
      "Height": "6'2\"",
      "Weight": "~210 lbs",
      "Hair": "Short",
      "Distinguishing marks": "Athletic build and bearing consistent with collegiate football."
    }
  },

  {
    name: "Matthew",
    tagline: "The coach who shaped him",
    role: "College athletics coach · Jack’s mentor",
    portrait: "assets/img/npcs/Mathew.jpg",
    meta: ["Associate"],
    description:
      "College athletics coach and former semi-professional athlete. Mentor " +
      "figure to J. Zeppelin, with an evident interest in the player's welfare " +
      "that extends beyond the field.",
    file: {
      "File status": "Closed / Peripheral",
      "Age": "56",
      "Status": "Alive.",
      "Race": "Native American (Lenape descent)",
      "Height": "5'11\"",
      "Weight": "~195 lbs",
      "Hair": "Black streaked with grey, worn long",
      "Distinguishing marks": "Weathered, solid build of a former athlete. Quiet, deliberate speech. Wrist bare where others might expect a watch or band."
    }
  },

  {
    name: "Gideon Crane",
    tagline: "Judges people as he judges objects",
    role: "Proprietor · Reliquary atelier, Cobble Hill",
    portrait: "assets/img/npcs/Gideon Crane.jpg",
    meta: ["Associate"],
    description:
      "Proprietor of a reliquary and liturgical-object restoration atelier in " +
      "Cobble Hill. Formerly a conservator for archdiocesan collections. " +
      "Affiliated with a Catholic lay organization. Recent contact with private " +
      "investigator E. Delacroix.",
    file: {
      "File status": "Unclassified / Monitored",
      "Age": "58",
      "Status": "Alive.",
      "Race": "White American",
      "Height": "6'1\"",
      "Weight": "~165 lbs",
      "Hair": "White, short; close-trimmed white beard",
      "Distinguishing marks": "Lean, ascetic frame; jeweller's loupe worn on a chain. Fine scarring and solvent-stained fingertips consistent with conservation work."
    }
  }

];

/* ---------------------------------------------------------------------
   FIELD REFERENCE
     name / tagline / role / portrait / meta / description
     file      OPTIONAL subject file from the NPC dossier: an object of
               label -> value ("File status", "Age", "Status", "Race",
               "Height", "Weight", "Hair", "Distinguishing marks"),
               shown as a table under the description.
     stats     OPTIONAL object of label -> value (renders a stat block).
               Left off here on purpose — this page is player-facing.
     statNote  OPTIONAL italic note under a stat block.
   --------------------------------------------------------------------- */
