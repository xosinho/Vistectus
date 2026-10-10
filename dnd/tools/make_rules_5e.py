#!/usr/bin/env python3
"""
make_rules_5e.py - build dnd/assets/data/rules-5e.js (window.DND_RULES)
from the D&D 5e community wiki, https://dnd5e.wikidot.com/.

The output holds NAMES, SOURCES, URLS and MECHANICAL FACTS only (numbers,
skill/ability keys, levels, flags, short proficiency phrases). No
descriptive, flavour, feature or spell text is ever copied: every entry
carries `url`, and the description lives on the wiki.

What is fetched (single thread, ~0.75 s between requests, descriptive
User-Agent; raw HTML cached under <system temp>/dnd5e_wikidot_cache so a
re-run is cheap - delete that folder to refresh):
  /                      index: discovers backgrounds, feats, class pages,
                         homebrew / archived-UA subclasses, spell lists
  /lineage               every species/lineage, then each /lineage:<x> page
  /background:<x>        each background (skills, tools, languages, source)
  /feat:<x>              each feat (source, prerequisite phrase)
  /<class>               each class page (proficiency lines, class table,
                         subclass table with sources)
  /<class>:<subclass>    only for subclasses whose source is not in the
                         class page's subclass table
  /spells                every spell (level, school, ritual, concentration)
  /spell:<x>             each spell (source; ritual/class fallback)
  /spells:<class>        class spell lists

Usage:
  python dnd/tools/make_rules_5e.py            build the file
  python dnd/tools/make_rules_5e.py --out PATH write somewhere else
"""
import os, re, sys, time, html, json, math, tempfile, urllib.request, urllib.error

BASE = "https://dnd5e.wikidot.com"
WIKI = BASE + "/"
UA = ("VistectusRulesBuilder/1.0 (personal D&D campaign website; builds a "
      "names/numbers/links index; single-threaded, cached, <=1 request/second)")
CACHE = os.path.join(tempfile.gettempdir(), "dnd5e_wikidot_cache")
HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_OUT = os.path.normpath(os.path.join(HERE, "..", "assets", "data", "rules-5e.js"))
PAUSE = 0.75

_last = [0.0]
_stats = {"net": 0, "cache": 0}
PROBLEMS = []          # things the report should mention
NO_CLASS_LIST = set()  # spells the wiki says are on no class's list


# Species whose players must choose one of their kinds (subraces).
SUBRACE_REQUIRED = {"Dwarf", "Elf", "Gnome", "Halfling", "Shifter"}

def problem(msg):
    PROBLEMS.append(msg)


# --------------------------------------------------------------------------
# fetching
# --------------------------------------------------------------------------
def fetch(path):
    """GET BASE+path, cached. Returns the HTML text, or None for a 404."""
    path = path if path.startswith("/") else "/" + path
    path = path.split("#")[0]
    os.makedirs(CACHE, exist_ok=True)
    fn = os.path.join(CACHE, (re.sub(r"[^A-Za-z0-9_.-]", "_", path.strip("/")) or "_index") + ".html")
    if os.path.exists(fn):
        _stats["cache"] += 1
        with open(fn, encoding="utf-8") as f:
            data = f.read()
        return None if data == "__404__" else data
    data = None
    for attempt in range(4):
        wait = PAUSE - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        req = urllib.request.Request(BASE + path, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                data = r.read().decode("utf-8", "replace")
            break
        except urllib.error.HTTPError as e:
            if e.code == 404:
                data = "__404__"
                break
            time.sleep(4 * (attempt + 1))
        except Exception:
            time.sleep(4 * (attempt + 1))
        finally:
            _last[0] = time.time()
            _stats["net"] += 1
    if data is None:
        raise RuntimeError("could not fetch " + path)
    with open(fn, "w", encoding="utf-8") as f:
        f.write(data)
    if _stats["net"] % 50 == 0:
        print("  ... %d pages fetched" % _stats["net"], flush=True)
    return None if data == "__404__" else data


# --------------------------------------------------------------------------
# HTML helpers
# --------------------------------------------------------------------------
def content(page):
    """The wiki page body (#page-content), without the side bars."""
    if not page:
        return ""
    i = page.find('<div id="page-content">')
    if i < 0:
        return ""
    j = page.find('<div class="page-tags"', i)
    if j < 0:
        j = page.find('id="page-info-break"', i)
    return page[i:j if j > 0 else len(page)]


def strip_tags(s):
    s = re.sub(r"<sup[^>]*>.*?</sup>", "", s, flags=re.S)
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s).replace("\xa0", " ")
    s = s.replace("’", "'").replace("‘", "'").replace("–", "-").replace("—", "-")
    return re.sub(r"\s+", " ", s).strip()


def to_lines(c):
    """Content -> plain text lines (cells separated by ' | ')."""
    t = re.sub(r"<br\s*/?>|</p>|</li>|</tr>|</h\d>|</div>", "\n", c)
    t = re.sub(r"</t[dh]>", " | ", t)
    t = re.sub(r"<[^>]+>", "", t)
    t = html.unescape(t).replace("\xa0", " ")
    t = t.replace("’", "'").replace("‘", "'").replace("–", "-").replace("—", "-")
    return [re.sub(r"[ \t]+", " ", l).strip() for l in t.split("\n") if l.strip()]


def norm_href(h):
    h = html.unescape(h)
    h = re.sub(r"^https?://dnd5e\.wikidot\.com", "", h)
    return h


def url_of(path):
    return BASE + path


def tokens(c):
    """Headings and links of a content block, in document order.
    -> list of dicts {kind:'h', level, text, id, pos} / {kind:'a', href, text, pos, in_h}"""
    out = []
    heads = []
    for m in re.finditer(r"<h([1-6])([^>]*)>(.*?)</h\1>", c, re.S):
        idm = re.search(r'id="([^"]+)"', m.group(2))
        out.append({"kind": "h", "level": int(m.group(1)), "text": strip_tags(m.group(3)),
                    "id": idm.group(1) if idm else "", "pos": m.start()})
        heads.append((m.start(), m.end()))
    for m in re.finditer(r'<a\s+href="([^"]*)"[^>]*>(.*?)</a>', c, re.S):
        in_h = any(a <= m.start() < b for a, b in heads)
        out.append({"kind": "a", "href": norm_href(m.group(1)), "text": strip_tags(m.group(2)),
                    "pos": m.start(), "in_h": in_h})
    out.sort(key=lambda t: t["pos"])
    return out


def source_line(c):
    m = re.search(r"<p>\s*(?:<(?:em|strong|span)[^>]*>\s*)*Sour?ce:\s*(.*?)</p>", c, re.S)   # "Souce:" typo on some pages
    if not m:
        return ""
    return clean_source(strip_tags(re.sub(r"<br\s*/?>", "; ", m.group(1))))


def clean_source(s):
    s = re.sub(r"\s*;\s*", "; ", s).strip(" ;,")
    s = re.sub(r"^Source:\s*", "", s)
    if s.endswith(".") and not re.search(r"\b(?:Inc|Co|Ltd|Vol)\.$", s):
        s = s[:-1]
    return s


# --------------------------------------------------------------------------
# constants (standard 5e numbers)
# --------------------------------------------------------------------------
ABILITIES = [["str", "Strength"], ["dex", "Dexterity"], ["con", "Constitution"],
             ["int", "Intelligence"], ["wis", "Wisdom"], ["cha", "Charisma"]]
AB_BY_NAME = {n.lower(): k for k, n in ABILITIES}

SKILLS = [
    ("acrobatics", "Acrobatics", "dex"), ("animalhandling", "Animal Handling", "wis"),
    ("arcana", "Arcana", "int"), ("athletics", "Athletics", "str"),
    ("deception", "Deception", "cha"), ("history", "History", "int"),
    ("insight", "Insight", "wis"), ("intimidation", "Intimidation", "cha"),
    ("investigation", "Investigation", "int"), ("medicine", "Medicine", "wis"),
    ("nature", "Nature", "int"), ("perception", "Perception", "wis"),
    ("performance", "Performance", "cha"), ("persuasion", "Persuasion", "cha"),
    ("religion", "Religion", "int"), ("sleightofhand", "Sleight of Hand", "dex"),
    ("stealth", "Stealth", "dex"), ("survival", "Survival", "wis"),
]
SKILL_KEYS = {k for k, _, _ in SKILLS}

ALIGNMENTS = ["Lawful Good", "Neutral Good", "Chaotic Good",
              "Lawful Neutral", "True Neutral", "Chaotic Neutral",
              "Lawful Evil", "Neutral Evil", "Chaotic Evil"]

XP = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
      85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000]
PROF = [2] * 4 + [3] * 4 + [4] * 4 + [5] * 4 + [6] * 4
POINT_BUY = {"budget": 27, "min": 8, "max": 15,
             "cost": {"8": 0, "9": 1, "10": 2, "11": 3, "12": 4, "13": 5, "14": 7, "15": 9}}

FULL = [
    [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2],
    [4, 3, 3, 3, 1], [4, 3, 3, 3, 2], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1],
    [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
    [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1],
    [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1],
]


def pad9(r):
    return (list(r) + [0] * 9)[:9]


def build_slots():
    full = [pad9(r) for r in FULL]
    zero = [0] * 9
    half = [zero[:] if lv < 2 else full[math.ceil(lv / 2) - 1][:] for lv in range(1, 21)]
    third = [zero[:] if lv < 3 else full[math.ceil(lv / 3) - 1][:] for lv in range(1, 21)]
    artificer = [full[math.ceil(lv / 2) - 1][:] for lv in range(1, 21)]
    pact_slots = [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4]
    pact_level = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]
    pact = [{"slots": s, "level": l} for s, l in zip(pact_slots, pact_level)]
    return {"full": full, "half": half, "third": third, "artificer": artificer, "pact": pact}


def steps(*pairs):
    """steps((from_level, value), ...) -> 20 values."""
    out = []
    for lv in range(1, 21):
        v = 0
        for start, val in pairs:
            if lv >= start:
                v = val
        out.append(v)
    return out


ASI_STD = [4, 8, 12, 16, 19]
# Standard classes: mechanics written from the 5e rules, checked against each page.
STANDARD = {
    "artificer": dict(name="Artificer", source="Tasha's Cauldron of Everything", hitDie=8,
                      saves=["con", "int"],
                      skillChoices={"count": 2, "from": ["arcana", "history", "investigation", "medicine", "nature", "perception", "sleightofhand"]},
                      subclassLevel=3, subclassLabel="Artificer Specialist", asiLevels=ASI_STD,
                      multiclass={"requires": {"int": 13}, "any": False},
                      spellcasting={"ability": "int", "progression": "artificer", "type": "prepared",
                                    "cantrips": steps((1, 2), (10, 3), (14, 4)), "known": None,
                                    "prepared": "ability+half"}),
    "barbarian": dict(name="Barbarian", source="Player's Handbook", hitDie=12, saves=["str", "con"],
                      skillChoices={"count": 2, "from": ["animalhandling", "athletics", "intimidation", "nature", "perception", "survival"]},
                      subclassLevel=3, subclassLabel="Primal Path", asiLevels=ASI_STD,
                      multiclass={"requires": {"str": 13}, "any": False}, spellcasting=None),
    "bard": dict(name="Bard", source="Player's Handbook", hitDie=8, saves=["dex", "cha"],
                 skillChoices={"count": 3, "from": "any"},
                 subclassLevel=3, subclassLabel="Bard College", asiLevels=ASI_STD,
                 multiclass={"requires": {"cha": 13}, "any": False},
                 spellcasting={"ability": "cha", "progression": "full", "type": "known",
                               "cantrips": steps((1, 2), (4, 3), (10, 4)),
                               "known": [4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 15, 16, 18, 19, 19, 20, 22, 22, 22],
                               "prepared": None}),
    "cleric": dict(name="Cleric", source="Player's Handbook", hitDie=8, saves=["wis", "cha"],
                   skillChoices={"count": 2, "from": ["history", "insight", "medicine", "persuasion", "religion"]},
                   subclassLevel=1, subclassLabel="Divine Domain", asiLevels=ASI_STD,
                   multiclass={"requires": {"wis": 13}, "any": False},
                   spellcasting={"ability": "wis", "progression": "full", "type": "prepared",
                                 "cantrips": steps((1, 3), (4, 4), (10, 5)), "known": None,
                                 "prepared": "ability+level"}),
    "druid": dict(name="Druid", source="Player's Handbook", hitDie=8, saves=["int", "wis"],
                  skillChoices={"count": 2, "from": ["arcana", "animalhandling", "insight", "medicine", "nature", "perception", "religion", "survival"]},
                  subclassLevel=2, subclassLabel="Druid Circle", asiLevels=ASI_STD,
                  multiclass={"requires": {"wis": 13}, "any": False},
                  spellcasting={"ability": "wis", "progression": "full", "type": "prepared",
                                "cantrips": steps((1, 2), (4, 3), (10, 4)), "known": None,
                                "prepared": "ability+level"}),
    "fighter": dict(name="Fighter", source="Player's Handbook", hitDie=10, saves=["str", "con"],
                    skillChoices={"count": 2, "from": ["acrobatics", "animalhandling", "athletics", "history", "insight", "intimidation", "perception", "survival"]},
                    subclassLevel=3, subclassLabel="Martial Archetype", asiLevels=[4, 6, 8, 12, 14, 16, 19],
                    multiclass={"requires": {"str": 13, "dex": 13}, "any": True}, spellcasting=None),
    "monk": dict(name="Monk", source="Player's Handbook", hitDie=8, saves=["str", "dex"],
                 skillChoices={"count": 2, "from": ["acrobatics", "athletics", "history", "insight", "religion", "stealth"]},
                 subclassLevel=3, subclassLabel="Monastic Tradition", asiLevels=ASI_STD,
                 multiclass={"requires": {"dex": 13, "wis": 13}, "any": False}, spellcasting=None),
    "paladin": dict(name="Paladin", source="Player's Handbook", hitDie=10, saves=["wis", "cha"],
                    skillChoices={"count": 2, "from": ["athletics", "insight", "intimidation", "medicine", "persuasion", "religion"]},
                    subclassLevel=3, subclassLabel="Sacred Oath", asiLevels=ASI_STD,
                    multiclass={"requires": {"str": 13, "cha": 13}, "any": False},
                    spellcasting={"ability": "cha", "progression": "half", "type": "prepared",
                                  "cantrips": [0] * 20, "known": None, "prepared": "ability+half"}),
    "ranger": dict(name="Ranger", source="Player's Handbook", hitDie=10, saves=["str", "dex"],
                   skillChoices={"count": 3, "from": ["animalhandling", "athletics", "insight", "investigation", "nature", "perception", "stealth", "survival"]},
                   subclassLevel=3, subclassLabel="Ranger Archetype", asiLevels=ASI_STD,
                   multiclass={"requires": {"dex": 13, "wis": 13}, "any": False},
                   spellcasting={"ability": "wis", "progression": "half", "type": "known",
                                 "cantrips": [0] * 20,
                                 "known": [0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11],
                                 "prepared": None}),
    "rogue": dict(name="Rogue", source="Player's Handbook", hitDie=8, saves=["dex", "int"],
                  skillChoices={"count": 4, "from": ["acrobatics", "athletics", "deception", "insight", "intimidation", "investigation", "perception", "performance", "persuasion", "sleightofhand", "stealth"]},
                  subclassLevel=3, subclassLabel="Roguish Archetype", asiLevels=[4, 8, 10, 12, 16, 19],
                  multiclass={"requires": {"dex": 13}, "any": False}, spellcasting=None),
    "sorcerer": dict(name="Sorcerer", source="Player's Handbook", hitDie=6, saves=["con", "cha"],
                     skillChoices={"count": 2, "from": ["arcana", "deception", "insight", "intimidation", "persuasion", "religion"]},
                     subclassLevel=1, subclassLabel="Sorcerous Origin", asiLevels=ASI_STD,
                     multiclass={"requires": {"cha": 13}, "any": False},
                     spellcasting={"ability": "cha", "progression": "full", "type": "known",
                                   "cantrips": steps((1, 4), (4, 5), (10, 6)),
                                   "known": [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12, 13, 13, 14, 14, 15, 15, 15, 15],
                                   "prepared": None}),
    "warlock": dict(name="Warlock", source="Player's Handbook", hitDie=8, saves=["wis", "cha"],
                    skillChoices={"count": 2, "from": ["arcana", "deception", "history", "intimidation", "investigation", "nature", "religion"]},
                    subclassLevel=1, subclassLabel="Otherworldly Patron", asiLevels=ASI_STD,
                    multiclass={"requires": {"cha": 13}, "any": False},
                    spellcasting={"ability": "cha", "progression": "pact", "type": "known",
                                  "cantrips": steps((1, 2), (4, 3), (10, 4)),
                                  "known": [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15],
                                  "prepared": None}),
    "wizard": dict(name="Wizard", source="Player's Handbook", hitDie=6, saves=["int", "wis"],
                   skillChoices={"count": 2, "from": ["arcana", "history", "insight", "investigation", "medicine", "religion"]},
                   subclassLevel=2, subclassLabel="Arcane Tradition", asiLevels=ASI_STD,
                   multiclass={"requires": {"int": 13}, "any": False},
                   spellcasting={"ability": "int", "progression": "full", "type": "spellbook",
                                 "cantrips": steps((1, 3), (4, 4), (10, 5)), "known": None,
                                 "prepared": "ability+level"}),
}
THIRD_KNOWN = [0, 0, 3, 4, 4, 4, 5, 6, 6, 7, 8, 8, 9, 10, 10, 11, 11, 11, 12, 13]
SUBCLASS_CASTING = {
    "/fighter:eldritch-knight": {"ability": "int", "progression": "third", "type": "known",
                                 "cantrips": steps((3, 2), (10, 3)), "known": THIRD_KNOWN, "prepared": None},
    "/rogue:arcane-trickster": {"ability": "int", "progression": "third", "type": "known",
                                "cantrips": steps((3, 3), (10, 4)), "known": THIRD_KNOWN, "prepared": None},
}

NUMBER_WORDS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "a": 1, "an": 1}


# --------------------------------------------------------------------------
# parsing helpers
# --------------------------------------------------------------------------
SKILL_RX = [(k, re.compile(r"\b" + re.escape(n).replace(r"\ ", r"\s+") + r"\b", re.I)) for k, n, _ in SKILLS]


def find_skills(text):
    """Skill keys named in text, in text order."""
    hits = []
    for k, rx in SKILL_RX:
        m = rx.search(text)
        if m:
            hits.append((m.start(), k))
    return [k for _, k in sorted(hits)]


def parse_skill_phrase(t):
    """'Insight, Religion' / 'Two of the following: ...' / 'History, plus one of ...'
    -> (fixed_keys, choice or None)"""
    t = t.strip().rstrip(".")
    if not t or re.fullmatch(r"(?i)none\.?", t):
        return [], None
    m = re.search(r"(?i)\b(one|two|three|four|any|choice of)\b", t)
    if m:
        fixed_part, choice_part = t[:m.start()], t[m.start():]
        word = m.group(1).lower()
        count = NUMBER_WORDS.get(word, 1)
        if word == "any":
            m2 = re.search(r"(?i)\bany\s+(one|two|three|four)\b", t)
            count = NUMBER_WORDS[m2.group(1).lower()] if m2 else 1
        frm = find_skills(choice_part)
        if not frm:
            frm = "any"
        return find_skills(fixed_part), {"count": count, "from": frm}
    return find_skills(t), None


def count_languages(t):
    t = t.strip().rstrip(".")
    if not t or re.match(r"(?i)none\b", t):
        return 0
    nums = [NUMBER_WORDS[w.lower()] for w in re.findall(r"(?i)\b(one|two|three|four)\b", t)]
    if nums:
        if re.search(r"(?i)\bor\b", t):
            return max(nums)
        return sum(nums)
    if re.search(r"(?i)\bor\b", t):
        return 1
    parts = [p for p in re.split(r"(?i),|\band\b", t) if p.strip()]
    return len(parts)


def short_phrase(t, limit=140):
    t = re.sub(r"\s*\([^)]{26,}\)", "", t).strip().rstrip(".")
    if re.fullmatch(r"(?i)none|-|—", t):
        return ""
    if len(t) > limit:
        t = t[:limit].rsplit(" ", 1)[0] + "..."
    return t


def labelled(lines, label):
    """Value after 'Label:' on the first matching line."""
    rx = re.compile(r"^\s*" + label + r"\s*[:.]\s*(.*)$", re.I)
    for l in lines:
        m = rx.match(l)
        if m:
            return m.group(1).strip()
    return None


def section_after(c, anchor_id):
    """HTML from heading id=anchor_id up to the next heading of the same or higher rank."""
    m = re.search(r'<h([1-6])[^>]*id="' + re.escape(anchor_id) + r'"', c)
    if not m:
        return ""
    lvl = int(m.group(1))
    nxt = re.compile(r"<h([1-%d])[\s>]" % lvl)
    m2 = nxt.search(c, m.end())
    return c[m.start(): m2.start() if m2 else len(c)]


# --------------------------------------------------------------------------
# index
# --------------------------------------------------------------------------
def read_index():
    c = content(fetch("/"))
    toks = tokens(c)
    h1 = h_sub = ""
    links = []
    for t in toks:
        if t["kind"] == "h":
            if t["level"] == 1:
                h1, h_sub = t["text"], ""
            elif t["level"] >= 4:
                h_sub = t["text"]
            continue
        href = t["href"]
        if not href.startswith("/") or href == "/":
            continue
        links.append({"href": href, "text": t["text"], "h1": h1, "sub": h_sub, "in_h": t["in_h"]})
    return links


# --------------------------------------------------------------------------
# species
# --------------------------------------------------------------------------
SIZE_WORDS = ["Tiny", "Small", "Medium", "Large"]
NOT_SUBRACE = re.compile(r"(?i)\b(features|traits|feats?|spells|names?|personality|appearance|"
                         r"description|culture|history|society|optional rule|subraces?|variants?\s*$)\b")


def parse_size(line):
    if line is None:
        return ""
    m = re.search(r"(?i)(?:size is|you are)\s+([^.]*)", line)
    seg = m.group(1) if m else line
    found = [w for w in SIZE_WORDS if re.search(r"(?i)\b" + w + r"\b", seg)]
    if not found:
        found = [w for w in SIZE_WORDS if re.search(r"(?i)\b" + w + r"\b", line)]
    return " or ".join(found)


def parse_speed(line):
    if line is None:
        return None
    m = re.search(r"(?i)walking speed (?:is|of)\s*(\d+)\s*feet", line) or re.search(r"(\d+)\s*feet", line)
    return int(m.group(1)) if m else None


def build_species():
    lc = content(fetch("/lineage"))
    entries = []
    seen = set()
    cat = ""
    for t in tokens(lc):
        if t["kind"] == "h":
            cat = t["text"]
            continue
        h = t["href"]
        if not h.startswith("/lineage:") or h in seen:
            continue
        seen.add(h)
        entries.append((h, t["text"], cat))
    species = []
    for href, name, cat in entries:
        c = content(fetch(href))
        if not c:
            problem("species page missing: " + href)
            continue
        heads = [t for t in tokens(c) if t["kind"] == "h" and t["level"] <= 3 and t["id"].startswith("toc")]
        h1s = [t for t in heads if t["level"] == 1]
        first_cut = h1s[1]["pos"] if len(h1s) > 1 else len(c)
        src = source_line(c[:first_cut])
        if not src:
            book = next((t for t in h1s if not NOT_SUBRACE.search(t["text"])), None)
            if book:
                src = book["text"]
        if not src:
            src = source_line(c) or ("Unearthed Arcana" if "Unearthed" in cat else "")
        if not src:
            problem("species without source: " + href)
        lines = to_lines(c)
        size = parse_size(labelled(lines, "Size"))
        speed = parse_speed(labelled(lines, "Speed"))
        if speed is None:
            speed = 30
            problem("species speed not stated plainly, used 30: " + href)
        if not size:
            problem("species size not stated plainly: " + href)
        # subraces / variants
        subs = []
        cur_h1 = None
        h1_children = {}
        for t in heads:
            if t["level"] == 1:
                cur_h1 = t
                h1_children[t["id"]] = 0
                continue
            if t["level"] == 2:
                if cur_h1 is not None:
                    h1_children[cur_h1["id"]] += 1
                if NOT_SUBRACE.search(t["text"]) and not re.search(r"(?i)^variant", t["text"]):
                    continue
                sub = {"name": t["text"], "url": url_of(href) + "#" + t["id"]}
                if cur_h1 is not None:
                    sub["source"] = cur_h1["text"]
                subs.append(sub)
        # other book versions on the same page (an h1 after the first with no h2 under it)
        for t in h1s[1:]:
            if h1_children.get(t["id"]) == 0 and not NOT_SUBRACE.search(t["text"]):
                subs.append({"name": "%s (%s)" % (name, t["text"]), "url": url_of(href) + "#" + t["id"],
                             "source": t["text"]})
        seen_n = {}
        for x in subs:
            seen_n[x["name"].lower()] = seen_n.get(x["name"].lower(), 0) + 1
        for x in subs:
            if seen_n[x["name"].lower()] > 1 and x.get("source"):
                x["name"] = "%s (%s)" % (x["name"], x["source"])
        # Most "subraces" on the wiki are older book versions or optional
        # variants (Variant Human, Tiefling bloodlines): a plain choice is
        # fine. These species must pick one of their kinds.
        species.append({"name": name, "source": src, "url": url_of(href), "size": size,
                        "speed": speed, "subraces": subs, "subraceRequired": name in SUBRACE_REQUIRED and bool(subs), "_cat": cat})
    return species


# --------------------------------------------------------------------------
# backgrounds
# --------------------------------------------------------------------------
# pages that carry no "Source:" line (checked by hand)
SOURCE_OVERRIDES = {"/background:marine": "Ghosts of Saltmarsh"}
NOT_BACKGROUND = {"/background:optional-features", "/background:wildemount-heroic-chronicle",
                  "/background:sword-coast-heroic-chronicle"}


def background_facts(c):
    lines = to_lines(c)
    sk = labelled(lines, r"Skill Proficienc(?:y|ies)")
    tl = labelled(lines, r"Tool Proficienc(?:y|ies)")
    lg = labelled(lines, r"Languages?")
    return sk, tl, lg, source_line(c)


def build_backgrounds(index):
    out = []
    seen = set()
    for l in index:
        h = l["href"]
        if not h.startswith("/background:") or h.split("#")[0] in NOT_BACKGROUND or h in seen:
            continue
        if "Heroic Chronicle" in l["h1"]:
            continue
        seen.add(h)
        page, _, anchor = h.partition("#")
        c = content(fetch(page))
        if not c:
            problem("background page missing: " + h)
            continue
        sk, tl, lg, src = background_facts(c)
        if anchor:
            sec = section_after(c, anchor)
            s2, t2, g2, src2 = background_facts(sec)
            sk = s2 if s2 is not None else sk
            tl = t2 if t2 is not None else tl
            lg = g2 if g2 is not None else lg
            src = src2 or src
        if not src and page in SOURCE_OVERRIDES:
            src = SOURCE_OVERRIDES[page]
            problem("background %s: no Source line on the page; source set by hand to %r" % (h, src))
        if not src:
            src = "Unearthed Arcana" if page.endswith("-ua") else (l["sub"] or "")
            problem("background without a Source line (used index heading %r): %s" % (src, h))
        entry = {"name": l["text"], "source": src, "url": url_of(h), "skills": [], "tools": "", "languages": 0}
        if sk is None:
            problem("background: no Skill Proficiencies line: " + h)
        else:
            fixed, choice = parse_skill_phrase(sk)
            entry["skills"] = fixed
            if choice:
                entry["skillChoice"] = choice
            if not fixed and not choice:
                problem("background: skills line not understood (%r): %s" % (sk, h))
            elif choice and fixed:
                problem("background has fixed skills plus a choice (%r): %s" % (sk, h))
        entry["tools"] = short_phrase(tl or "")
        entry["languages"] = count_languages(lg or "")
        out.append(entry)
    return out


# --------------------------------------------------------------------------
# feats
# --------------------------------------------------------------------------
def build_feats(index):
    out = []
    seen = set()
    for l in index:
        h = l["href"].split("#")[0]
        if not h.startswith("/feat:") or h in seen:
            continue
        seen.add(h)
        c = content(fetch(h))
        if not c:
            problem("feat page missing: " + h)
            continue
        src = source_line(c)
        if not src:
            src = "Unearthed Arcana" if h.endswith("-ua") else l["sub"]
            problem("feat without a Source line (used %r): %s" % (src, h))
        pre = ""
        m = re.search(r"<p>\s*(?:<em>)?\s*(?:<strong>)?\s*Prerequisites?\s*:?\s*(?:</strong>)?(.*?)</p>", c, re.S | re.I)
        if m:
            # only the prerequisite phrase: stop at the first line break / end of the emphasis,
            # so none of the feat's own text comes along
            phrase = re.split(r"<br\s*/?>|</em>|\n", m.group(1), maxsplit=1)[0]
            pre = strip_tags(phrase).strip(" :.")
            if len(pre) > 160:
                problem("feat prerequisite truncated: " + h)
                pre = pre[:160].rsplit(" ", 1)[0] + "..."
        out.append({"name": l["text"], "source": src, "url": url_of(h), "prerequisite": pre})
    return out


# --------------------------------------------------------------------------
# classes and subclasses
# --------------------------------------------------------------------------
def parse_saves(t):
    if not t or re.match(r"(?i)none", t):
        return []
    return [AB_BY_NAME[w.lower()] for w in re.findall(r"(?i)strength|dexterity|constitution|intelligence|wisdom|charisma", t)]


def parse_class_skills(t):
    if not t or re.match(r"(?i)none", t):
        return {"count": 0, "from": []}
    m = re.search(r"(?i)\b(one|two|three|four)\b", t)
    count = NUMBER_WORDS[m.group(1).lower()] if m else None
    frm = find_skills(t)
    if re.search(r"(?i)\bany\b", t) and not frm:
        frm = "any"
    return {"count": count, "from": frm}


def parse_multiclass(text):
    m = re.search(r"(?i)You must have ([^.]*?) in order to multiclass", text)
    if not m:
        return None
    s = re.sub(r"(?i)\b\d+\s+or\s+higher\b", "", m.group(1))
    abil =[AB_BY_NAME[w.lower()] for w in re.findall(r"(?i)strength|dexterity|constitution|intelligence|wisdom|charisma", s)]
    if not abil:
        return None
    has_or = re.search(r"(?i)\bor\b", s) is not None
    has_and = re.search(r"(?i)\band\b", s) is not None
    if has_or and has_and:
        return "complex"
    req = {}
    for a in abil:
        req[a] = 13
    return {"requires": req, "any": bool(has_or)}


def class_table(c):
    """The level table: list of row dicts keyed by header text."""
    for m in re.finditer(r'<table class="wiki-content-table">(.*?)</table>', c, re.S):
        tb = m.group(1)
        rows = re.findall(r"<tr>(.*?)</tr>", tb, re.S)
        hdr = None
        out = []
        for r in rows:
            ths = re.findall(r"<th[^>]*>(.*?)</th>", r, re.S)
            tds = re.findall(r"<td[^>]*>(.*?)</td>", r, re.S)
            if ths and not tds:
                cand = [strip_tags(x) for x in ths]
                if "Level" in cand:
                    hdr = cand
                continue
            if hdr and tds and len(tds) == len(hdr):
                out.append(dict(zip(hdr, [strip_tags(x) for x in tds])))
        if hdr and len(out) >= 20 and any("Proficiency" in h for h in hdr):
            return out[:20]
    return None


def num(s):
    m = re.search(r"\d+", s or "")
    return int(m.group(0)) if m else 0


def subclass_table(c):
    """Rows of the subclass table: (href, name, source, group header) and the
    heading text + level sentence before it."""
    for m in re.finditer(r'<table class="wiki-content-table">(.*?)</table>', c, re.S):
        tb = m.group(1)
        rows = re.findall(r"<tr>(.*?)</tr>", tb, re.S)
        if not rows:
            continue
        first = [strip_tags(x) for x in re.findall(r"<th[^>]*>(.*?)</th>", rows[0], re.S)]
        if len(first) != 2 or first[1] != "Source":
            continue
        out = []
        group = ""
        for r in rows[1:]:
            ths = re.findall(r"<th[^>]*>(.*?)</th>", r, re.S)
            tds = re.findall(r"<td[^>]*>(.*?)</td>", r, re.S)
            if ths and not tds:
                group = strip_tags(ths[0])
                continue
            if len(tds) < 2:
                continue
            a = re.search(r'<a\s+href="([^"]*)"[^>]*>(.*?)</a>', tds[0], re.S)
            if not a:
                continue
            src = clean_source(strip_tags(re.sub(r"<br\s*/?>", "; ", tds[1])))
            out.append((norm_href(a.group(1)), strip_tags(a.group(2)), src, group))
        before = c[:m.start()]
        hs = list(re.finditer(r"<h[2-4][^>]*>(.*?)</h[2-4]>", before, re.S))
        label = strip_tags(hs[-1].group(1)) if hs else first[0]
        tail = strip_tags(before[hs[-1].end():]) if hs else ""
        lm = re.search(r"(?i)\b(?:at|when you reach|starting at|beginning at)\s+(\d+)(?:st|nd|rd|th)\s+level", tail)
        return out, label, int(lm.group(1)) if lm else None, first[0]
    return [], None, None, None


def build_classes(index):
    # class pages: every single-segment page linked from the index whose page has a class's
    # Hit Dice / Saving Throws lines
    cand = []
    for l in index:
        h = l["href"].split("#")[0]
        if re.fullmatch(r"/[a-z0-9-]+", h) and h not in cand:
            cand.append(h)
    classes = []
    for h in cand:
        c = content(fetch(h))
        lines = to_lines(c)
        if not (labelled(lines, "Hit Dice") and labelled(lines, "Saving Throws")):
            continue
        key = h[1:]
        idx_name = next((l["text"] for l in index if l["href"] == h and l["text"]), key)
        name = re.sub(r"\s*\((?:Homebrew|UA)\)\s*$", "", idx_name).strip()
        idx_sec = next((l for l in index if l["href"] == h), None)
        text = " ".join(lines)
        hd_t = labelled(lines, "Hit Dice") or ""
        hdm = re.match(r"\s*(\d+)d(\d+)", hd_t)
        hit_die = int(hdm.group(2)) if hdm and hdm.group(1) == "1" else None
        if hdm and hdm.group(1) != "1":
            problem("class %s: hit dice are %sd%s per level - hitDie left null" % (key, hdm.group(1), hdm.group(2)))
        saves = parse_saves(labelled(lines, "Saving Throws"))
        skills = parse_class_skills(labelled(lines, "Skills"))
        armor = short_phrase(labelled(lines, "Armor") or "")
        weapons = short_phrase(labelled(lines, "Weapons") or "")
        tools = short_phrase(labelled(lines, "Tools") or "")
        mc = parse_multiclass(text)
        if mc == "complex":
            problem("class %s: multiclass requirement mixes 'and'/'or' - multiclass left null" % key)
            mc = None
        table = class_table(c)
        asi = [i + 1 for i, r in enumerate(table or []) if re.search(r"Ability Score Improve", r.get("Features", ""))]
        subrows, sub_label, sub_level, _ = subclass_table(c)

        entry = {"key": key, "name": name, "source": "", "url": url_of(h), "hitDie": hit_die,
                 "saves": saves, "skillChoices": skills, "armor": armor, "weapons": weapons, "tools": tools,
                 "subclassLevel": sub_level, "subclassLabel": sub_label, "asiLevels": asi or None,
                 "multiclass": mc, "spellcasting": None, "subclasses": []}

        if key in STANDARD:
            std = STANDARD[key]
            # check the hand-written mechanics against the page
            checks = [("hitDie", hit_die, std["hitDie"]), ("saves", sorted(saves), sorted(std["saves"])),
                      ("skill count", skills["count"], std["skillChoices"]["count"]),
                      ("skill list", sorted(skills["from"]) if isinstance(skills["from"], list) else skills["from"],
                       sorted(std["skillChoices"]["from"]) if isinstance(std["skillChoices"]["from"], list) else std["skillChoices"]["from"]),
                      ("asiLevels", asi, std["asiLevels"]),
                      ("multiclass", mc, std["multiclass"])]
            if sub_level is not None:
                checks.append(("subclassLevel", sub_level, std["subclassLevel"]))
            sc = std["spellcasting"]
            if sc and table:
                hdr = table[0].keys()
                ck = next((x for x in hdr if x.startswith("Cantrips")), None)
                kn = next((x for x in hdr if x.startswith("Spells Known")), None)
                if ck:
                    checks.append(("cantrips", [num(r[ck]) for r in table], sc["cantrips"]))
                if kn:
                    checks.append(("spells known", [num(r[kn]) for r in table], sc["known"]))
                slots = build_slots()
                cols = [x for x in ("1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th") if x in hdr]
                if cols and sc["progression"] != "pact":
                    page_slots = [pad9([num(r[x]) for x in cols]) for r in table]
                    checks.append(("spell slots", page_slots, slots[sc["progression"]]))
                if "Spell Slots" in hdr and "Slot Level" in hdr:
                    checks.append(("pact slots", [{"slots": num(r["Spell Slots"]), "level": num(r["Slot Level"])} for r in table],
                                   slots["pact"]))
            for what, page_v, std_v in checks:
                if page_v != std_v:
                    print("  note: %s %s - page says %r, rules data uses %r" % (key, what, page_v, std_v))
            entry.update({k: std[k] for k in ("name", "source", "hitDie", "saves", "skillChoices",
                                              "subclassLevel", "subclassLabel", "asiLevels", "multiclass",
                                              "spellcasting")})
        else:
            src = source_line(c)
            if not src and idx_sec:
                if "Unearthed" in idx_sec["h1"] or key.endswith("-ua"):
                    src = "Unearthed Arcana"
                if "Homebrew" in idx_name:
                    src = src or "Homebrew"
            if not src:
                src = "Unearthed Arcana" if idx_sec and "Unearthed" in idx_sec["h1"] else ""
                problem("class %s: no Source line on the page; used %r" % (key, src))
            entry["source"] = src
            if skills["count"] is None:
                entry["skillChoices"] = None
            if not table:
                problem("class %s: level table not parsed - asiLevels left null" % key)
        # subclasses: the class page's table, plus index links under this class (homebrew etc.)
        subs = []
        seen = set()
        idx_names = {}
        for l in index:
            idx_names.setdefault(l["href"], l["text"])
        for href, sname, src, group in subrows:
            if href in seen or ":" not in href:      # e.g. the ranger table links the Revised Ranger class
                continue
            seen.add(href)
            subs.append({"href": href, "name": sname, "source": src, "group": group})
        for l in index:
            hh = l["href"].split("#")[0]
            if hh in seen or l["sub"] == "Quick Links" or hh.count(":") != 1:
                continue
            if hh.startswith(h + ":"):
                seen.add(hh)
                subs.append({"href": hh, "name": l["text"], "source": "", "group": l["h1"] + " / " + l["sub"]})
        for s in subs:
            nm = idx_names.get(s["href"])
            if nm and len(nm) >= len(s["name"]) and s["name"].split(" (")[0].lower() in nm.lower():
                s["name"] = nm                     # the index's full name, e.g. "Path of the Beast"
            if not s["source"]:
                sc_ = content(fetch(s["href"]))
                s["source"] = source_line(sc_) if sc_ else ""
                if not sc_:
                    problem("subclass page missing: " + s["href"])
                if not s["source"]:
                    s["source"] = "Homebrew" if "Homebrew" in s["group"] else (
                        "Unearthed Arcana" if "Unearthed" in s["group"] or s["href"].endswith("-ua") else "")
                    problem("subclass %s: no Source line; used %r" % (s["href"], s["source"]))
        # disambiguate duplicate names within the class
        counts = {}
        for s in subs:
            counts[s["name"].lower()] = counts.get(s["name"].lower(), 0) + 1
        for s in subs:
            if counts[s["name"].lower()] > 1 and (s["href"].endswith("-ua") or s["source"].startswith("Unearthed")):
                s["name"] += " (UA)"
        out_subs = []
        for s in subs:
            e = {"name": s["name"], "source": s["source"], "url": url_of(s["href"])}
            if s["href"] in SUBCLASS_CASTING:
                e["spellcasting"] = SUBCLASS_CASTING[s["href"]]
            out_subs.append(e)
        entry["subclasses"] = out_subs
        if entry["source"] == "Unearthed Arcana" and out_subs:
            # a UA class page without its own Source line: use the UA document its subclasses cite most
            ua = [s["source"] for s in out_subs if s["source"].startswith("Unearthed Arcana ")]
            if ua:
                best = max(set(ua), key=ua.count)
                problem("class %s: source taken from its subclass table: %r" % (key, best))
                entry["source"] = best
        classes.append(entry)
    return classes


# --------------------------------------------------------------------------
# spells
# --------------------------------------------------------------------------
SCHOOLS = ["Abjuration", "Conjuration", "Divination", "Enchantment", "Evocation",
           "Illusion", "Necromancy", "Transmutation"]


def build_spells(index, class_keys):
    c = content(fetch("/spells"))
    parts = re.split(r'<div id="wiki-tab-0-(\d+)"', c)
    spells = []
    by_href = {}
    for i in range(1, len(parts), 2):
        level = int(parts[i])
        for r in re.findall(r"<tr>(.*?)</tr>", parts[i + 1], re.S):
            tds = re.findall(r"<td[^>]*>(.*?)</td>", r, re.S)
            if len(tds) < 5:
                continue
            a = re.search(r'<a\s+href="([^"]*)"[^>]*>(.*?)</a>', tds[0], re.S)
            if not a:
                continue
            href = norm_href(a.group(1))
            if href in by_href:
                continue
            school = strip_tags(tds[1])
            school = next((s for s in SCHOOLS if s.lower() in school.lower()), school)
            ritual = bool(re.search(r"<sup>\s*R\s*</sup>", tds[2]))
            conc = strip_tags(tds[4]).lower().startswith("concentration")
            sp = {"name": strip_tags(a.group(2)), "level": level, "school": school, "classes": [],
                  "ritual": ritual, "concentration": conc, "source": "", "url": url_of(href), "_href": href}
            by_href[href] = sp
            spells.append(sp)
    # class lists
    list_keys = []
    for l in index:
        m = re.fullmatch(r"/spells:([a-z0-9-]+)", l["href"])
        if m and m.group(1) in class_keys and m.group(1) not in list_keys:
            list_keys.append(m.group(1))
    unknown_on_lists = set()
    for k in list_keys:
        lc = content(fetch("/spells:" + k))
        for a in re.finditer(r'<a\s+href="([^"]*)"', lc):
            href = norm_href(a.group(1))
            if not href.startswith("/spell:"):
                continue
            sp = by_href.get(href)
            if sp is None:
                unknown_on_lists.add(href)
                continue
            if k not in sp["classes"]:
                sp["classes"].append(k)
    for href in sorted(unknown_on_lists):
        problem("spell on a class list but not on /spells (left out): " + href)
    # each spell page: source, ritual check, class fallback
    for sp in spells:
        pc = content(fetch(sp["_href"]))
        if not pc:
            problem("spell page missing: " + sp["_href"])
            continue
        sp["source"] = source_line(pc)
        if not sp["source"]:
            sp["source"] = "Unearthed Arcana" if "(UA)" in sp["name"] else ("Homebrew" if "(HB)" in sp["name"] else "")
            problem("spell without a Source line (used %r): %s" % (sp["source"], sp["_href"]))
        lv = re.search(r"<p>\s*<em>([^<]*(?:cantrip|level)[^<]*)</em>", pc)
        if lv and "ritual" in lv.group(1).lower() and not sp["ritual"]:
            sp["ritual"] = True
        if not sp["classes"]:
            m = re.search(r"Spell Lists?\s*[.:]\s*(?:</em>)?\s*(?:</strong>)?(.*?)</p>", pc, re.S)
            if m:
                for a in re.finditer(r'href="[^"]*/spells:([a-z0-9-]+)"', m.group(1)):
                    if a.group(1) in class_keys and a.group(1) not in sp["classes"]:
                        sp["classes"].append(a.group(1))
                if not sp["classes"]:
                    names = strip_tags(m.group(1))
                    for k in class_keys:
                        if re.search(r"(?i)\b" + k.replace("-", " ") + r"\b", names):
                            sp["classes"].append(k)
            if sp["classes"]:
                problem("spell not on any /spells:<class> page; classes from its own page's Spell Lists line: %s -> %s"
                        % (sp["name"], ", ".join(sp["classes"])))
            elif m and re.fullmatch(r"(?i)\s*none\.?\s*", strip_tags(m.group(1))):
                # the wiki itself says the spell is on no class list (e.g. granted by a background)
                NO_CLASS_LIST.add(sp["name"])
                problem("spell on no class list (its page says 'Spell Lists. None'), classes left []: " + sp["name"])
    order = {k: i for i, k in enumerate(class_keys)}
    for sp in spells:
        sp["classes"].sort(key=lambda k: order.get(k, 99))
        del sp["_href"]
    return spells


# --------------------------------------------------------------------------
# validation and output
# --------------------------------------------------------------------------
def dedupe_names(items, what):
    """Disambiguate same-name entries (UA copies get ' (UA)'; others get their source)."""
    groups = {}
    for it in items:
        groups.setdefault(it["name"].lower(), []).append(it)
    for name, its in groups.items():
        if len(its) < 2:
            continue
        for it in its:
            if it["url"].endswith("-ua") or it["source"].startswith("Unearthed Arcana"):
                it["name"] += " (UA)"
        rest = {}
        for it in its:
            rest.setdefault(it["name"].lower(), []).append(it)
        for nm, group in rest.items():
            if len(group) > 1:
                for it in group[1:]:
                    it["name"] = "%s (%s)" % (it["name"], it["source"] or it["url"].rsplit(":", 1)[-1])


def validate(R):
    errs = []
    sk = {s["key"] for s in R["skills"]}

    def chk_skills(where, lst):
        if lst == "any":
            return
        for k in lst:
            if k not in sk:
                errs.append("%s: unknown skill key %r" % (where, k))

    for cat in ("species", "backgrounds", "feats", "classes", "spells"):
        names = {}
        for e in R[cat]:
            names[e["name"]] = names.get(e["name"], 0) + 1
            if not e.get("url"):
                errs.append("%s %s: no url" % (cat, e["name"]))
        for n, k in names.items():
            if k > 1:
                errs.append("%s: duplicate name %r x%d" % (cat, n, k))
    for b in R["backgrounds"]:
        chk_skills("background " + b["name"], b["skills"])
        if "skillChoice" in b:
            chk_skills("background " + b["name"], b["skillChoice"]["from"])
    for c in R["classes"]:
        if c["skillChoices"]:
            chk_skills("class " + c["key"], c["skillChoices"]["from"])
        if c["key"] in STANDARD and not c["hitDie"]:
            errs.append("class %s: no hitDie" % c["key"])
        if not c["subclasses"] and c["key"] in STANDARD:
            errs.append("class %s: no subclasses" % c["key"])
        elif not c["subclasses"]:
            problem("class %s has no subclasses on the wiki" % c["key"])
        sn = {}
        for s in c["subclasses"]:
            sn[s["name"]] = sn.get(s["name"], 0) + 1
            if not s["source"]:
                errs.append("subclass %s / %s: no source" % (c["key"], s["name"]))
        for n, k in sn.items():
            if k > 1:
                errs.append("class %s: duplicate subclass name %r" % (c["key"], n))
    ck = {c["key"] for c in R["classes"]}
    for s in R["spells"]:
        if not s["classes"]:
            if s["name"] not in NO_CLASS_LIST:
                errs.append("spell %s: no class" % s["name"])
        for k in s["classes"]:
            if k not in ck:
                errs.append("spell %s: unknown class %r" % (s["name"], k))
        if not s["source"]:
            errs.append("spell %s: no source" % s["name"])
    for k in ("full", "half", "third", "artificer"):
        assert len(R["slots"][k]) == 20 and all(len(r) == 9 for r in R["slots"][k])
    assert len(R["slots"]["pact"]) == 20 and len(R["xpThresholds"]) == 20 and len(R["proficiencyBonus"]) == 20
    return errs


def js_dump(R):
    """Readable JS: one entry per line inside the long lists."""
    def j(v):
        return json.dumps(v, ensure_ascii=False, separators=(",", ":"))
    out = ["window.DND_RULES = {"]
    keys = list(R.keys())
    for i, k in enumerate(keys):
        v = R[k]
        comma = "," if i < len(keys) - 1 else ""
        if isinstance(v, list) and v and isinstance(v[0], (dict, list)) and k not in ("abilities",):
            out.append("  %s: [" % j(k))
            for n, e in enumerate(v):
                out.append("    " + j(e) + ("," if n < len(v) - 1 else ""))
            out.append("  ]" + comma)
        elif isinstance(v, dict) and k == "slots":
            out.append("  %s: {" % j(k))
            sk = list(v.keys())
            for n, s in enumerate(sk):
                out.append("    %s: %s%s" % (j(s), j(v[s]), "," if n < len(sk) - 1 else ""))
            out.append("  }" + comma)
        else:
            out.append("  %s: %s%s" % (j(k), j(v), comma))
    out.append("};")
    return "\n".join(out) + "\n"


HEADER = """/*
 * rules-5e.js - D&D 5th edition rules data for the D&D section (window.DND_RULES).
 *
 * GENERATED from https://dnd5e.wikidot.com/ by dnd/tools/make_rules_5e.py - do not
 * edit by hand; re-run the generator instead (schema: dnd/README.md, "Rules data").
 *
 * This file holds names, sources, links and numbers only (levels, dice, skill and
 * ability keys, flags, short proficiency phrases). No descriptions are copied:
 * every entry has a `url`, and the full text of each species, background, feat,
 * class, subclass and spell lives on the wiki.
 *
 * `source` tells the DM where an entry comes from (a book, "Unearthed Arcana ...",
 * or a homebrew/third-party name) so non-official options can be allowed or not.
 * Generated: %s
 */
"""


def main():
    out_path = DEFAULT_OUT
    if "--out" in sys.argv:
        out_path = sys.argv[sys.argv.index("--out") + 1]
    print("cache:", CACHE)
    index = read_index()
    print("index: %d links" % len(index))

    print("classes ...", flush=True)
    classes = build_classes(index)
    class_keys = [c["key"] for c in classes]
    print("species ...", flush=True)
    species = build_species()
    print("backgrounds ...", flush=True)
    backgrounds = build_backgrounds(index)
    print("feats ...", flush=True)
    feats = build_feats(index)
    print("spells ...", flush=True)
    spells = build_spells(index, class_keys)

    dedupe_names(species, "species")
    dedupe_names(backgrounds, "backgrounds")
    dedupe_names(feats, "feats")
    dedupe_names(spells, "spells")
    for s in species:
        s.pop("_cat", None)

    std_first = [c for c in classes if c["key"] in STANDARD]
    std_first.sort(key=lambda c: c["key"])
    others = [c for c in classes if c["key"] not in STANDARD]
    classes = std_first + others

    R = {
        "wiki": WIKI,
        "abilities": ABILITIES,
        "skills": [{"key": k, "name": n, "ability": a} for k, n, a in SKILLS],
        "alignments": ALIGNMENTS,
        "xpThresholds": XP,
        "proficiencyBonus": PROF,
        "pointBuy": POINT_BUY,
        "species": sorted(species, key=lambda e: e["name"].lower()),
        "backgrounds": sorted(backgrounds, key=lambda e: e["name"].lower()),
        "feats": sorted(feats, key=lambda e: e["name"].lower()),
        "classes": classes,
        "spells": sorted(spells, key=lambda e: (e["level"], e["name"].lower())),
        "slots": build_slots(),
    }
    errs = validate(R)

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    body = HEADER % time.strftime("%Y-%m-%d") + js_dump(R)
    with open(out_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(body)

    print()
    print("pages: %d fetched, %d from cache" % (_stats["net"], _stats["cache"]))
    print("species: %d (subraces/variants %d)" % (len(R["species"]), sum(len(s["subraces"]) for s in R["species"])))
    print("backgrounds: %d" % len(R["backgrounds"]))
    print("feats: %d" % len(R["feats"]))
    print("classes: %d (subclasses %d)" % (len(R["classes"]), sum(len(c["subclasses"]) for c in R["classes"])))
    for c in R["classes"]:
        print("   %-20s %-45s d%-4s %2d subclasses" % (c["key"], c["source"][:45], c["hitDie"], len(c["subclasses"])))
    print("spells: %d" % len(R["spells"]))
    print("written: %s (%d bytes)" % (out_path, len(body.encode("utf-8"))))
    if PROBLEMS:
        print("\nnotes (%d):" % len(PROBLEMS))
        for p in PROBLEMS:
            print("  - " + p)
    if errs:
        print("\nVALIDATION ERRORS (%d):" % len(errs))
        for e in errs:
            print("  ! " + e)
        sys.exit(1)
    print("\nvalidation: OK")


if __name__ == "__main__":
    main()
