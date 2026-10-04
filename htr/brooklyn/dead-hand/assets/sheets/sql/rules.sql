-- =====================================================================
-- Hunter: The Reckoning rules reference: Creeds, Drives, Edges & Perks,
-- Advantages & Flaws. Feeds the dropdowns on the character sheets and
-- the Edge descriptions and dice pools shown on them.
-- ---------------------------------------------------------------------
-- Compiled from the Hunter: The Reckoning Wiki (htr.paradoxwikis.com),
-- licensed CC BY-SA 3.0. Names, dice pools, dots and sources are as given
-- there; descriptions are short summaries, each row linking to its page.
--
-- Run in Supabase: SQL Editor -> New query. Needs the character sheet
-- setup (setup.sql), which defines is_storyteller(). Safe to run again:
-- it replaces the reference data with this file's.
-- Anyone can read these tables; only Storytellers can change them.
-- =====================================================================

create table if not exists public.rules_creeds (
  key text primary key, name text not null, creed_field text not null default '', summary text not null default '',
  suggested_edges text[] not null default '{}', typical_drives text[] not null default '{}', url text, sort integer not null default 0);
create table if not exists public.rules_drives (
  key text primary key, name text not null, summary text not null default '', redemption text not null default '',
  url text, sort integer not null default 0);
create table if not exists public.rules_edges (
  key text primary key, name text not null, category text not null, dice_pool text not null default '',
  requirements text not null default '', summary text not null default '', source text not null default '',
  url text, variant_of text references public.rules_edges (key) on delete cascade, lineage text, sort integer not null default 0);
create table if not exists public.rules_perks (
  key text primary key, edge_key text not null references public.rules_edges (key) on delete cascade,
  name text not null, summary text not null default '', sort integer not null default 0);
create table if not exists public.rules_advantages (
  key text primary key, name text not null, type text not null check (type in ('Merit', 'Background', 'Flaw')),
  grp text not null default '', dots text not null default '', min_dots integer not null default 1,
  max_dots integer not null default 5, summary text not null default '', url text, sort integer not null default 0);

alter table public.rules_creeds enable row level security;
drop policy if exists "Anyone reads the rules" on public.rules_creeds;
drop policy if exists "Storytellers edit the rules" on public.rules_creeds;
create policy "Anyone reads the rules" on public.rules_creeds for select to anon, authenticated using (true);
create policy "Storytellers edit the rules" on public.rules_creeds for all to authenticated using (public.is_storyteller()) with check (public.is_storyteller());

alter table public.rules_drives enable row level security;
drop policy if exists "Anyone reads the rules" on public.rules_drives;
drop policy if exists "Storytellers edit the rules" on public.rules_drives;
create policy "Anyone reads the rules" on public.rules_drives for select to anon, authenticated using (true);
create policy "Storytellers edit the rules" on public.rules_drives for all to authenticated using (public.is_storyteller()) with check (public.is_storyteller());

alter table public.rules_edges enable row level security;
drop policy if exists "Anyone reads the rules" on public.rules_edges;
drop policy if exists "Storytellers edit the rules" on public.rules_edges;
create policy "Anyone reads the rules" on public.rules_edges for select to anon, authenticated using (true);
create policy "Storytellers edit the rules" on public.rules_edges for all to authenticated using (public.is_storyteller()) with check (public.is_storyteller());

alter table public.rules_perks enable row level security;
drop policy if exists "Anyone reads the rules" on public.rules_perks;
drop policy if exists "Storytellers edit the rules" on public.rules_perks;
create policy "Anyone reads the rules" on public.rules_perks for select to anon, authenticated using (true);
create policy "Storytellers edit the rules" on public.rules_perks for all to authenticated using (public.is_storyteller()) with check (public.is_storyteller());

alter table public.rules_advantages enable row level security;
drop policy if exists "Anyone reads the rules" on public.rules_advantages;
drop policy if exists "Storytellers edit the rules" on public.rules_advantages;
create policy "Anyone reads the rules" on public.rules_advantages for select to anon, authenticated using (true);
create policy "Storytellers edit the rules" on public.rules_advantages for all to authenticated using (public.is_storyteller()) with check (public.is_storyteller());

-- The data: replaced wholesale on every run.
delete from public.rules_perks;
delete from public.rules_edges where variant_of is not null;
delete from public.rules_edges;
delete from public.rules_creeds;
delete from public.rules_drives;
delete from public.rules_advantages;

insert into public.rules_creeds (key, name, creed_field, summary, suggested_edges, typical_drives, url, sort) values
  ('entrepreneurial', 'Entrepreneurial', 'While on the Hunt: developing, creating, enhancing or repairing.', 'Inventors and fixers who meet the quarry with bold, experimental solutions.', array['Fleet', 'Improvised Gear', 'Drone Jockey']::text[], array['Curiosity', 'Greed', 'Envy']::text[], 'https://htr.paradoxwikis.com/Entrepreneurial', 0),
  ('faithful', 'Faithful', 'Direct conflict with the supernatural, whether physical, social or mental.', 'Hunters who fight through belief in a higher power and the disciplines of faith.', array['Library', 'Endowments']::text[], array['Oath', 'Atonement', 'Vengeance']::text[], 'https://htr.paradoxwikis.com/Faithful', 1),
  ('inquisitive', 'Inquisitive', 'While on the Hunt: acquiring information by study, break-ins or interrogation.', 'Researchers who study the quarry, old methods and new, to find what will undo it.', array['Library', 'Global Access', 'Beast Whisperer', 'Sense the Unnatural']::text[], array['Curiosity', 'Pride', 'Greed']::text[], 'https://htr.paradoxwikis.com/Inquisitive', 2),
  ('martial', 'Martial', 'Any physical conflict, supernatural opponent or not.', 'Trained fighters who trust weapons and tactics to finish the threat.', array['Arsenal', 'Fleet', 'Ordnance', 'Artifact']::text[], array['Vengeance', 'Pride', 'Envy']::text[], 'https://htr.paradoxwikis.com/Martial', 3),
  ('underground', 'Underground', 'Stealth and subterfuge in service of the Hunt.', 'Operators who reach the quarry through guile, stealth and the right contacts.', array['Arsenal', 'Fleet', 'Improvised Gear', 'Thwart the Unnatural']::text[], array['Envy', 'Oath', 'Vengeance']::text[], 'https://htr.paradoxwikis.com/Underground', 4);

insert into public.rules_drives (key, name, summary, redemption, url, sort) values
  ('curiosity', 'Curiosity', 'Must uncover everything about the quarry.', 'The cell learns new information about the quarry.', 'https://htr.paradoxwikis.com/Drives', 0),
  ('vengeance', 'Vengeance', 'Wants to repay harm the supernatural did to them or theirs.', 'The cell harms the quarry or a creature like it, directly or indirectly.', 'https://htr.paradoxwikis.com/Drives', 1),
  ('oath', 'Oath', 'Bound by a personal pledge against the supernatural.', 'The cell helps the hunter uphold or advance the pledge.', 'https://htr.paradoxwikis.com/Drives', 2),
  ('greed', 'Greed', 'Wants the resources the monsters hold and do not deserve.', 'The cell takes resources from the quarry or a creature like it.', 'https://htr.paradoxwikis.com/Drives', 3),
  ('pride', 'Pride', 'Must prove humans can beat the supernatural.', 'The cell beats the quarry at some kind of challenge.', 'https://htr.paradoxwikis.com/Drives', 4),
  ('envy', 'Envy', 'Wants to become supernatural, or die trying.', 'The cell obtains a sample of the quarry''s power source or wins its favour.', 'https://htr.paradoxwikis.com/Drives', 5),
  ('atonement', 'Atonement', 'Seeks to make up for having helped monsters, knowingly or not.', 'The cell protects someone from the quarry by taking the danger on themselves, or helps another member atone.', 'https://htr.paradoxwikis.com/Drives', 6),
  ('duty', 'Duty', 'The Hunt is an obligation laid on them by an outside authority.', 'The hunter completes what their lineage, cell or authority expects of them.', 'https://htr.paradoxwikis.com/Drives', 7),
  ('guilt', 'Guilt', 'Cannot escape a debt to those who fell.', 'The hunter atones through contrition, repeating past success or keeping a promise; details set by player and Storyteller.', 'https://htr.paradoxwikis.com/Drives', 8);

insert into public.rules_edges (key, name, category, dice_pool, requirements, summary, source, url, variant_of, lineage, sort) values
  ('arsenal', 'Arsenal', 'Asset', 'Intelligence + Craft (self-maintained) or Manipulation + Streetwise (contacts)', '', 'At the start of a scene, win a Difficulty 4 test to obtain one mundane weapon for that scene.', 'Corebook p. 90', 'https://htr.paradoxwikis.com/Edges', null, null, 0),
  ('fleet', 'Fleet', 'Asset', 'Intelligence + Technology (self-maintained) or Manipulation + Persuasion (contacts)', '', 'At the start of a scene, win a Difficulty 4 test to obtain one vehicle of any common type, boats and aircraft included. It does not teach you to drive it.', 'Corebook p. 91', 'https://htr.paradoxwikis.com/Edges', null, null, 1),
  ('ordnance', 'Ordnance', 'Asset', 'Composure + Science (self-built) or Composure + Streetwise (contacts)', '', 'At the start of a scene, win a Difficulty 4 test to obtain one mine or explosive for that scene.', 'Corebook p. 92', 'https://htr.paradoxwikis.com/Edges', null, null, 2),
  ('library', 'Library', 'Asset', 'Resolve + Academics', 'One day of research before the test.', 'After a day of research, win a Difficulty 4 test to learn something useful about the quarry; a bigger margin gives a clearer answer.', 'Corebook p. 93', 'https://htr.paradoxwikis.com/Edges', null, null, 3),
  ('experimental-medicine', 'Experimental Medicine', 'Asset', 'Stamina + Medicine (Health) or Composure + Insight (Willpower)', 'The hunter must have Aggravated damage.', 'Undergo a procedure at Difficulty equal to half your Aggravated damage (rounded up): success heals it all; failure leaves you Impaired and adds 1 Danger.', 'Apostates p. 19', 'https://htr.paradoxwikis.com/Edges', null, null, 4),
  ('improvised-gear', 'Improvised Gear', 'Aptitude', 'Intelligence + Craft, Technology or Science (by the item)', 'Needs materials to hand; not under duress without Speed Crafting.', 'Win a Difficulty 4 test to build short-lived gear that adds 2 dice to one Skill or makes an impossible action possible. It lasts one scene.', 'Corebook p. 94', 'https://htr.paradoxwikis.com/Edges', null, null, 5),
  ('global-access', 'Global Access', 'Aptitude', 'Intelligence + Technology', 'One scene of work; physical access for offline systems unless Intranet Insertion.', 'After a scene of work, win a Difficulty 4 test to pull data from any database: surveillance, buried records and the like. It reads, it does not alter, without Perks.', 'Corebook p. 94', 'https://htr.paradoxwikis.com/Edges', null, null, 6),
  ('drone-jockey', 'Drone Jockey', 'Aptitude', 'Wits + Technology (flying) or Intelligence + Craft (repair)', 'Choose the drone and its two Skills when you take the Edge.', 'Your drone has two Skills; use Wits + Technology in place of the usual pool when it acts. It has 5 Health and can be repaired with Intelligence + Craft.', 'Corebook p. 95', 'https://htr.paradoxwikis.com/Edges', null, null, 7),
  ('beast-whisperer', 'Beast Whisperer', 'Aptitude', 'Charisma + Animal Ken (commands) or Composure + Animal Ken (training)', 'Choose one kind of animal when you take the Edge.', 'Animals of the chosen kind are completely loyal and follow the hunter anywhere.', 'Corebook p. 96', 'https://htr.paradoxwikis.com/Edges', null, null, 8),
  ('turncoat', 'Turncoat', 'Aptitude', 'Manipulation + Subterfuge', '', 'Win against half the target''s Intelligence + Wits and they believe you completely loyal to them.', 'Apostates p. 18', 'https://htr.paradoxwikis.com/Edges', null, null, 9),
  ('sense-the-unnatural', 'Sense the Unnatural', 'Endowment', 'Wits + Occult or Wits + Science (by its nature)', 'Hold the object of focus; use is deliberate and obvious.', 'Win a Difficulty 3-5 test to sense a supernatural presence nearby, without identifying it. The first use in a scene is free; each further use costs 1 Willpower.', 'Corebook p. 97', 'https://htr.paradoxwikis.com/Edges', null, null, 10),
  ('repel-the-unnatural', 'Repel the Unnatural', 'Endowment', 'Resolve + Occult or Resolve + Science (by its nature)', 'Hold the object of focus and stand still to keep it up.', 'Win against half the creature''s Composure + Resolve to hold it at bay: it cannot close or brawl with you, but can still defend and use powers. Moving means re-testing each turn.', 'Corebook p. 98', 'https://htr.paradoxwikis.com/Edges', null, null, 11),
  ('thwart-the-unnatural', 'Thwart the Unnatural', 'Endowment', 'Composure + Occult or Composure + Science (by its nature)', 'Hold the object of focus.', 'While holding the object, you are immune to supernatural powers that allow a resistance test, and may test to resist automatic ones. It guards the mind, not the body.', 'Corebook p. 98', 'https://htr.paradoxwikis.com/Edges', null, null, 12),
  ('artifact', 'Artifact', 'Endowment', 'Intelligence + Occult or Intelligence + Science (by its nature)', 'Losing it means a long ordeal to recover it.', 'A relic that adds 1 die to one associated Skill and can serve as an object of focus.', 'Corebook p. 99', 'https://htr.paradoxwikis.com/Edges', null, null, 13),
  ('cleanse-the-unnatural', 'Cleanse the Unnatural', 'Endowment', 'Charisma + Persuasion (exorcism), Resolve + Science (psychic) or Manipulation + Occult (faith)', '', 'Free someone from supernatural control: Difficulty rises with how long they have been under it, and the target takes Aggravated damage reduced by the margin.', 'Apostates p. 19', 'https://htr.paradoxwikis.com/Edges', null, null, 14),
  ('great-destiny', 'Great Destiny', 'Endowment', 'None: a pool of 2 bonus dice each session', 'Choose the hunter''s destiny.', 'Each session you hold 2 bonus dice to add to any pools that further your destiny.', 'Apostates p. 20', 'https://htr.paradoxwikis.com/Edges', null, null, 15),
  ('unnatural-changes', 'Unnatural Changes', 'Endowment', 'Stamina, Composure or Resolve + Insight (Attribute chosen when taken)', 'Choose the Attribute; needs an object of focus.', 'Win a Difficulty 4 test to add 2 dice to all rolls with the chosen Attribute for the scene; failure costs Aggravated damage equal to the margin.', 'Incognito Report p. 143', 'https://htr.paradoxwikis.com/Edges', null, null, 16);

insert into public.rules_edges (key, name, category, dice_pool, requirements, summary, source, url, variant_of, lineage, sort) values
  ('library-who-they-were', 'Library: Who They Were', 'Asset', 'Resolve + Academics', 'One day of research before the test.', 'Other Library Perks work as if the margin were 2 higher against quarry at least centuries old.', 'Cult of Isis lineage', 'https://htr.paradoxwikis.com/Edges', 'library', 'Cult of Isis', 100),
  ('sense-ekstasis', 'Sense the Unnatural: Ekstasis', 'Endowment', 'Wits + Occult or Wits + Science (by its nature)', 'Hold the object of focus; use is deliberate and obvious.', 'The object of focus can be any suitable pagan symbol.', 'Benandanti lineage', 'https://htr.paradoxwikis.com/Edges', 'sense-the-unnatural', 'Benandanti', 101),
  ('repel-blessed-ammunition', 'Repel the Unnatural: Rite of Blessed Ammunition', 'Endowment', 'Resolve + Occult or Resolve + Science (by its nature)', 'Hold the object of focus and stand still to keep it up.', 'Difficulty 4 to bless one round (+1 per margin) that deals Aggravated damage to unnatural beings.', 'Servants of Mercy lineage', 'https://htr.paradoxwikis.com/Edges', 'repel-the-unnatural', 'Servants of Mercy', 102),
  ('repel-under-the-radar', 'Repel the Unnatural: Under the Radar', 'Endowment', 'Resolve + Occult or Resolve + Science (by its nature)', 'Hold the object of focus and stand still to keep it up.', 'Use the Edge to keep one creature from seeing or sensing you.', 'Cult of Isis lineage', 'https://htr.paradoxwikis.com/Edges', 'repel-the-unnatural', 'Cult of Isis', 103),
  ('artifact-amulet-of-isis', 'Artifact: Amulet of Isis', 'Endowment', 'Intelligence + Occult or Intelligence + Science (by its nature)', 'Losing it means a long ordeal to recover it.', 'The object of focus can be any suitable symbol.', 'Cult of Isis lineage', 'https://htr.paradoxwikis.com/Edges', 'artifact', 'Cult of Isis', 104),
  ('artifact-fennel-sword', 'Artifact: Fennel Sword', 'Endowment', 'Intelligence + Occult or Intelligence + Science (by its nature)', 'Losing it means a long ordeal to recover it.', 'A heavy melee weapon of bound fennel sticks, +1 die to Melee.', 'Benandanti lineage', 'https://htr.paradoxwikis.com/Edges', 'artifact', 'Benandanti', 105),
  ('artifact-grimoire-app', 'Artifact: The Grimoire App', 'Endowment', 'Intelligence + Occult or Intelligence + Science (by its nature)', 'Losing it means a long ordeal to recover it.', '+1 die to Occult.', 'Enfants de la Sorbonne lineage', 'https://htr.paradoxwikis.com/Edges', 'artifact', 'Enfants de la Sorbonne', 106),
  ('artifact-mask-of-the-unnoticed', 'Artifact: Mask of the Unnoticed', 'Endowment', 'Intelligence + Occult or Intelligence + Science (by its nature)', 'Losing it means a long ordeal to recover it.', '+1 die to Stealth.', 'Lee & Co. lineage', 'https://htr.paradoxwikis.com/Edges', 'artifact', 'Lee & Co.', 107),
  ('artifact-sanguine-flask', 'Artifact: Sanguine Flask', 'Endowment', 'Intelligence + Occult or Intelligence + Science (by its nature)', 'Losing it means a long ordeal to recover it.', '+1 die to Survival.', 'Blood Hunters lineage', 'https://htr.paradoxwikis.com/Edges', 'artifact', 'Blood Hunters', 108),
  ('artifact-sympathetic-bindings', 'Artifact: Sympathetic Bindings', 'Endowment', 'Intelligence + Occult or Intelligence + Science (by its nature)', 'Losing it means a long ordeal to recover it.', '+1 die to Medicine.', 'Cult of Isis lineage', 'https://htr.paradoxwikis.com/Edges', 'artifact', 'Cult of Isis', 109);

insert into public.rules_perks (key, edge_key, name, summary, sort) values
  ('arsenal/team-requisition', 'arsenal', 'Team Requisition', 'Extra copies of the weapon, up to the margin.', 0),
  ('arsenal/special-features', 'arsenal', 'Special Features', 'The weapons come with special features, scaled by margin.', 1),
  ('arsenal/exotics', 'arsenal', 'Exotics', 'Rare or one-of-a-kind weapons; the very rare may raise Difficulty.', 2),
  ('arsenal/untraceable', 'arsenal', 'Untraceable', 'The weapons leave no trail back to the hunter.', 3),
  ('arsenal/backup-piece', 'arsenal', 'Backup Piece', 'Once per scene, reveal a hidden mundane weapon even on a failed test.', 4),
  ('fleet/armor', 'fleet', 'Armor', 'Vehicles shrug off small arms; flying ones add 2 dice to passengers'' defence against ranged attacks.', 0),
  ('fleet/performance', 'fleet', 'Performance', 'Bonus dice equal to margin (max 3) on pursuit Driving tests.', 1),
  ('fleet/surveillance', 'fleet', 'Surveillance', 'Built-in kit gives bonus dice equal to margin (max 3) on stakeouts.', 2),
  ('fleet/untraceable', 'fleet', 'Untraceable', 'The vehicles cannot be traced to the hunters.', 3),
  ('fleet/hidden-cache', 'fleet', 'Hidden Cache', 'A hidden compartment (+2 Difficulty to find) that protects Arsenal or Ordnance gear.', 4),
  ('fleet/wagon-train', 'fleet', 'Wagon Train', 'If the vehicle is lost, test again for a replacement that scene, one Perk short or at +1 Difficulty.', 5),
  ('ordnance/multiple-payloads', 'ordnance', 'Multiple Payloads', 'Extra explosives equal to the margin.', 0),
  ('ordnance/non-lethal-munitions', 'ordnance', 'Non-lethal Munitions', 'Flashbangs and tear gas; penalty up to the margin (max 3).', 1),
  ('ordnance/exotics', 'ordnance', 'Exotics', 'Custom substances that exploit a creature''s weaknesses; Storyteller sets Difficulty.', 2),
  ('ordnance/disguised-delivery', 'ordnance', 'Disguised Delivery', 'Explosives look like everyday objects; finding them is harder by the margin (max 3).', 3),
  ('library/where-they-hide', 'library', 'Where They Hide', 'Bonus equal to margin (max 3) to find the creature''s lair; used once.', 0),
  ('library/who-they-are', 'library', 'Who They Are', 'Bonus equal to margin (max 3) to identify the prey; used once.', 1),
  ('library/how-to-halt-them', 'library', 'How to Halt Them', 'Bonus equal to margin (max 3) to ward a place or person against the prey; used once.', 2),
  ('library/how-to-harm-them', 'library', 'How to Harm Them', 'Bonus equal to margin (max 3) to exploit the prey''s weaknesses; used once.', 3),
  ('library/binge', 'library', 'Binge', 'Research takes half the time.', 4),
  ('library/friendly-librarian', 'library', 'Friendly Librarian', 'Wait a day or two for one automatic success.', 5),
  ('library/group-study', 'library', 'Group Study', '+1 die for each cell member who helps, Edge or not.', 6),
  ('library/permanent-fixture', 'library', 'Permanent Fixture', 'Use a campus library as a safe house once per semester.', 7),
  ('library/how-to-silence-them', 'library', 'How to Silence Them', 'Bonus equal to margin (max 3) to social-combat damage against the target; used once.', 8),
  ('library/pattern-analysis', 'library', 'Pattern Analysis', 'Identify a monster''s habits and find living witnesses who know of it.', 9),
  ('library/where-they-go', 'library', 'Where They Go', 'Bonus equal to margin (max 3) to predict the prey''s hunting grounds or next victims; used once.', 10),
  ('experimental-medicine/improved-resilience', 'experimental-medicine', 'Improved Resilience', 'Armor 1 while unarmoured until the end of the next story.', 0),
  ('experimental-medicine/monstrous-enhancement', 'experimental-medicine', 'Monstrous Enhancement', '+2 to one Attribute (max 5) until the end of the next story, with a mundane weakness.', 1),
  ('experimental-medicine/phoenix-protocol', 'experimental-medicine', 'Phoenix Protocol', 'Heal twice as fast next story, but pay in Willpower damage afterwards.', 2),
  ('experimental-medicine/unstable-steroids', 'experimental-medicine', 'Unstable Steroids', '+1 to one Attribute until the end of the next story; 1 Aggravated if you Despair first.', 3),
  ('improvised-gear/frugal', 'improvised-gear', 'Frugal', 'Carry a kit, so the Edge works anywhere.', 0),
  ('improvised-gear/mass-production', 'improvised-gear', 'Mass Production', 'Extra identical items equal to the margin.', 1),
  ('improvised-gear/specialization', 'improvised-gear', 'Specialization', 'One chosen Skill gets 3 dice instead of 2 (repeatable per Skill).', 2),
  ('improvised-gear/speed-crafting', 'improvised-gear', 'Speed Crafting', 'Build under fire in 3 turns minus margin (min 1).', 3),
  ('improvised-gear/made-to-last', 'improvised-gear', 'Made to Last', 'Items last extra scenes equal to the margin.', 4),
  ('global-access/watching-big-brother', 'global-access', 'Watching Big Brother', 'Edit people into or out of digital surveillance footage.', 0),
  ('global-access/all-access-pass', 'global-access', 'All-Access Pass', 'Open electronic locks and disable alarms (Difficulty 3-5).', 1),
  ('global-access/money-trap', 'global-access', 'Money Trap', 'Cut a target''s Resources by 1 per margin for a month; using it for gain costs Danger.', 2),
  ('global-access/the-letter-of-the-law', 'global-access', 'The Letter of the Law', 'Alter criminal records (Difficulty 3-5 by scale).', 3),
  ('global-access/digital-cannon-fodder', 'global-access', 'Digital Cannon Fodder', 'Attempts to trace or surveil you digitally lose 2 successes.', 4),
  ('global-access/intranet-insertion', 'global-access', 'Intranet Insertion', 'Reach air-gapped systems remotely; noisy, and may raise Danger.', 5),
  ('global-access/spoof', 'global-access', 'Spoof', 'Pin the intrusion on someone else, real or fake (Difficulty 3-5).', 6),
  ('drone-jockey/autonomous', 'drone-jockey', 'Autonomous', 'The drone runs simple routines on its own with a flat 5-die pool.', 0),
  ('drone-jockey/variants', 'drone-jockey', 'Variants', 'Another drone with two different Skills (repeatable).', 1),
  ('drone-jockey/specialist-skill', 'drone-jockey', 'Specialist Skill', 'One drone gains another Skill (repeatable).', 2),
  ('drone-jockey/armaments', 'drone-jockey', 'Armaments', 'A built-in SMG or taser with a flat 5-die pool.', 3),
  ('drone-jockey/payload', 'drone-jockey', 'Payload', 'Carries more cargo than it looks like it could; slower and easier to spot.', 4),
  ('drone-jockey/electronic-shield', 'drone-jockey', 'Electronic Shield', 'Hard to jam or hack.', 5),
  ('beast-whisperer/incorruptible', 'beast-whisperer', 'Incorruptible', 'Your animals are immune to supernatural influence.', 0),
  ('beast-whisperer/menagerie', 'beast-whisperer', 'Menagerie', 'A second kind of animal.', 1),
  ('beast-whisperer/complex-commands', 'beast-whisperer', 'Complex Commands', 'Animals follow complex orders; Intelligence + Animal Ken to understand them.', 2),
  ('beast-whisperer/incognito', 'beast-whisperer', 'Incognito', 'Animals stay hidden or blend in nearby.', 3),
  ('beast-whisperer/supernatural-scent', 'beast-whisperer', 'Supernatural Scent', 'After training, track one kind of creature by scent up to 12 hours old (repeatable per kind).', 4),
  ('turncoat/deathbed-confession', 'turncoat', 'Deathbed Confession', 'Use Turncoat in combat as a full action.', 0),
  ('turncoat/poker-face', 'turncoat', 'Poker Face', '+2 dice to Turncoat tests when questioned.', 1),
  ('turncoat/stick-to-the-plan', 'turncoat', 'Stick to the Plan', 'The cell understands your intent without a word.', 2),
  ('turncoat/we-come-as-a-team', 'turncoat', 'We Come as a Team', 'Vouch cellmates in, up to the margin.', 3),
  ('sense-the-unnatural/creature-specialization', 'sense-the-unnatural', 'Creature Specialization', '+2 dice against one kind of creature (repeatable per kind).', 0),
  ('sense-the-unnatural/range', 'sense-the-unnatural', 'Range', 'Reach extends to a city block.', 1),
  ('sense-the-unnatural/precision', 'sense-the-unnatural', 'Precision', 'Tell which one in the room is supernatural.', 2),
  ('sense-the-unnatural/handsfree', 'sense-the-unnatural', 'Handsfree', 'No object of focus needed.', 3),
  ('sense-the-unnatural/horrid-detail', 'sense-the-unnatural', 'Horrid Detail', 'See through supernatural disguises to the true form.', 4),
  ('sense-the-unnatural/network', 'sense-the-unnatural', 'Network', 'Wits + Insight to tell who has been touched by the supernatural recently.', 5),
  ('repel-the-unnatural/ward', 'repel-the-unnatural', 'Ward', 'Covers about 2 m around you, +1 m per margin.', 0),
  ('repel-the-unnatural/damage', 'repel-the-unnatural', 'Damage', 'The object strikes as a +0 melee weapon dealing Aggravated to the repelled creature.', 1),
  ('repel-the-unnatural/creature-specialization', 'repel-the-unnatural', 'Creature Specialization', '+2 dice against one kind of creature (repeatable per kind).', 2),
  ('repel-the-unnatural/handsfree', 'repel-the-unnatural', 'Handsfree', 'No object of focus needed.', 3),
  ('thwart-the-unnatural/creature-specialization', 'thwart-the-unnatural', 'Creature Specialization', '+2 dice against one kind of creature (repeatable per kind).', 0),
  ('thwart-the-unnatural/ward', 'thwart-the-unnatural', 'Ward', 'Covers about 2 m around you, +1 m per margin; you resist on others'' behalf.', 1),
  ('thwart-the-unnatural/recognition', 'thwart-the-unnatural', 'Recognition', 'When you resist, you learn what the power was trying to do.', 2),
  ('thwart-the-unnatural/handsfree', 'thwart-the-unnatural', 'Handsfree', 'No object of focus needed.', 3),
  ('thwart-the-unnatural/redirection', 'thwart-the-unnatural', 'Redirection', 'On a successful resist, take 1 Superficial Willpower to turn the power back on its user.', 4),
  ('artifact/empower', 'artifact', 'Empower', 'Once per scene, Difficulty 4 test to raise the bonus to 3 dice; failure costs Willpower.', 0),
  ('artifact/attraction', 'artifact', 'Attraction', 'Others want it: +2 dice to ambush those who come for it.', 1),
  ('artifact/detection', 'artifact', 'Detection', 'Works as Sense the Unnatural.', 2),
  ('artifact/shield', 'artifact', 'Shield', 'Halves physical damage from supernatural sources while carried.', 3),
  ('artifact/feature-unlocked', 'artifact', 'Feature Unlocked', 'Once per story at Danger 5, spend Willpower to reroll any non-Desperation dice.', 4),
  ('cleanse-the-unnatural/bedside-manner', 'cleanse-the-unnatural', 'Bedside Manner', 'The damage is Superficial instead.', 0),
  ('cleanse-the-unnatural/inflict-stigmata', 'cleanse-the-unnatural', 'Inflict Stigmata', '+1 Aggravated to the target, -2 Difficulty; the marks are permanent.', 1),
  ('cleanse-the-unnatural/trace-the-threads', 'cleanse-the-unnatural', 'Trace the Threads', 'One question about the controller''s whereabouts per point of margin.', 2),
  ('cleanse-the-unnatural/psychic-backlash', 'cleanse-the-unnatural', 'Psychic Backlash', 'The controller takes 1 Aggravated per 2 points of margin.', 3),
  ('great-destiny/divine-protection', 'great-destiny', 'Divine Protection', 'Reduce Health damage taken in the destiny''s service by 2.', 0),
  ('great-destiny/heavenly-resolve', 'great-destiny', 'Heavenly Resolve', 'Recover 1 Aggravated Willpower when hurt defending or preaching your destiny.', 1),
  ('great-destiny/sacred-insight', 'great-destiny', 'Sacred Insight', 'Once per story, a voice or vision gives a destiny-related clue.', 2),
  ('great-destiny/influence-fate', 'great-destiny', 'Influence Fate', 'Once per session, Charisma + Occult vs Resolve + Occult to make someone take one action that serves your destiny.', 3),
  ('unnatural-changes/breadth', 'unnatural-changes', 'Breadth', 'A second Attribute, with +1 die to its pools.', 0),
  ('unnatural-changes/maximized-neuropathways', 'unnatural-changes', 'Maximized Neuropathways', 'Activating it takes no action.', 1),
  ('unnatural-changes/neuropathway-practice', 'unnatural-changes', 'Neuropathway Practice', 'Difficulty drops from 4 to 3.', 2),
  ('unnatural-changes/handsfree', 'unnatural-changes', 'Handsfree', 'No object of focus needed.', 3),
  ('sense-ekstasis/eyes-of-the-unhooded', 'sense-ekstasis', 'Eyes of the Unhooded', 'Difficulty 3 to see ghosts; -2 dice to notice the mortal world meanwhile.', 0),
  ('sense-ekstasis/spirit-walking', 'sense-ekstasis', 'Spirit Walking', 'Difficulty 4-5 to send your consciousness out of your body for a scene.', 1),
  ('artifact-amulet-of-isis/mothers-comfort', 'artifact-amulet-of-isis', 'Mother''s Comfort', 'Once per session, heal Superficial Willpower equal to the margin.', 0),
  ('artifact-amulet-of-isis/mothers-milk', 'artifact-amulet-of-isis', 'Mother''s Milk', 'Once per session, heal Superficial Health equal to the margin.', 1),
  ('artifact-fennel-sword/strike-the-shade', 'artifact-fennel-sword', 'Strike the Shade', 'Deals Aggravated damage to incorporeal beings.', 0),
  ('artifact-grimoire-app/temporary-access', 'artifact-grimoire-app', 'Temporary Access', 'Difficulty 4 to borrow an Edge or Perk you lack for rounds equal to the margin.', 0),
  ('artifact-mask-of-the-unnoticed/avert-the-evil-gaze', 'artifact-mask-of-the-unnoticed', 'Avert the Evil Gaze', 'Difficulty 3 to become invisible to the unnatural and their servants for a scene.', 0),
  ('artifact-sanguine-flask/sanguine-preservation', 'artifact-sanguine-flask', 'Sanguine Preservation', 'Difficulty 3 to keep vampire blood viable for the session, plus sessions equal to the margin.', 0),
  ('artifact-sympathetic-bindings/mothers-solace', 'artifact-sympathetic-bindings', 'Mother''s Solace', 'Once per session, Difficulty 4 to turn all Aggravated damage Superficial over the next scene.', 0);

insert into public.rules_advantages (key, name, type, grp, dots, min_dots, max_dots, summary, url, sort) values
  ('linguistics', 'Linguistics', 'Merit', 'Linguistics', '• per language', 1, 5, 'Each dot is another language you speak.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 0),
  ('dead-tongues', 'Dead Tongues', 'Merit', 'Linguistics', '••', 2, 2, '+2 dice translating extinct languages.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 1),
  ('illiterate', 'Illiterate', 'Flaw', 'Linguistics', '••', 2, 2, 'Cannot read or write; Academics and Science capped at 1.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 2),
  ('el-mala-educaci-n', 'El Mala Educación', 'Flaw', 'Linguistics', '••', 2, 2, 'Needs Dead Tongues; mistranslations raise Danger on failures.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 3),
  ('forbidden-texts', 'Forbidden Texts', 'Merit', 'Academia', '••', 2, 2, '+2 dice researching one kind of monster (they want the texts back).', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 4),
  ('thesis', 'Thesis', 'Merit', 'Academia', '••', 2, 2, 'An extra academic specialty usable in research tests.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 5),
  ('part-of-the-furniture', 'Part of the Furniture', 'Merit', 'Academia', '•••', 3, 3, 'Once per session, +2 dice dealing with campus staff.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 6),
  ('falling-grades', 'Falling Grades', 'Flaw', 'Academia', '•', 1, 1, '-2 dice to Social pools with campus staff.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 7),
  ('dangerous-knowledge', 'Dangerous Knowledge', 'Flaw', 'Academia', '••', 2, 2, 'Research on one monster type raises Danger on failures.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 8),
  ('beautiful', 'Beautiful', 'Merit', 'Looks', '••', 2, 2, '+1 die to relevant Social pools.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 9),
  ('stunning', 'Stunning', 'Merit', 'Looks', '••••', 4, 4, '+2 dice to relevant Social pools.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 10),
  ('ugly', 'Ugly', 'Flaw', 'Looks', '•', 1, 1, '-1 die to relevant Social pools.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 11),
  ('repulsive', 'Repulsive', 'Flaw', 'Looks', '••', 2, 2, '-2 dice to relevant Social pools.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 12),
  ('solo-cooking', 'Solo Cooking', 'Merit', 'Nutritionist', '•', 1, 1, 'Heal 1 extra Superficial Health at session start after a home-cooked meal.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 13),
  ('cell-chef', 'Cell Chef', 'Merit', 'Nutritionist', '••', 2, 2, 'The whole cell heals 1 extra Superficial Health at session start.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 14),
  ('malnourished', 'Malnourished', 'Flaw', 'Nutritionist', '••', 2, 2, 'Health is Stamina + 2 instead of + 3.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 15),
  ('always-prepared', 'Always Prepared', 'Merit', 'Mental Feats', '••', 2, 2, '+2 dice to Preparedness pools.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 16),
  ('eidetic-memory', 'Eidetic Memory', 'Merit', 'Mental Feats', '••', 2, 2, '+2 dice to recall codes, maps, faces and the like.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 17),
  ('disordered-sleep', 'Disordered Sleep', 'Flaw', 'Mental Feats', '••', 2, 2, 'May fall asleep while studying, waiting or on watch.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 18),
  ('living-on-the-edge', 'Living on the Edge', 'Flaw', 'Psychological', '••', 2, 2, '-2 dice to everything when tempted by a risky new thrill, until you indulge.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 19),
  ('weak-willed', 'Weak-Willed', 'Flaw', 'Psychological', '•••', 3, 3, 'Cannot actively resist being persuaded.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 20),
  ('addiction', 'Addiction', 'Flaw', 'Substance Abuse', '•', 1, 1, '-1 die to all pools if you have not indulged in the last scene.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 21),
  ('severe-addiction', 'Severe Addiction', 'Flaw', 'Substance Abuse', '••', 2, 2, '-2 dice to all pools if you have not indulged in the last scene.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 22),
  ('unseemly-aura', 'Unseemly Aura', 'Merit', 'Supernatural Situations', '••', 2, 2, 'Monsters may take you for one of their own, or something else unnatural.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 23),
  ('stigmata', 'Stigmata', 'Flaw', 'Supernatural Situations', '•• (can take twice)', 2, 4, 'You bleed from hands, feet and brow when taking Health or Willpower damage (choose).', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 24),
  ('crones-curse', 'Crone''s Curse', 'Flaw', 'Supernatural Situations', '•••', 3, 3, 'Look a decade older; one less Health box.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 25),
  ('allies', 'Allies', 'Background', 'Allies', '• to ••••••', 1, 6, 'A group that supports you; split dots between Effectiveness and Reliability.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 26),
  ('enemy', 'Enemy', 'Flaw', 'Allies', '• +', 1, 5, 'An adversary rated 2 dots below their effectiveness.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 27),
  ('contacts', 'Contacts', 'Background', 'Contacts', '• to •••', 1, 3, 'People who can get you information or items.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 28),
  ('fame', 'Fame', 'Background', 'Fame', '• to •••••', 1, 5, 'Public celebrity; helps with fans, hinders stealth.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 29),
  ('infamy', 'Infamy', 'Flaw', 'Fame', '••', 2, 2, 'Known for something atrocious.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 30),
  ('dark-secret', 'Dark Secret', 'Flaw', 'Fame', '•', 1, 1, 'A misdeed known to one or two motivated enemies.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 31),
  ('infamous-partner', 'Infamous Partner', 'Flaw', 'Fame', '•', 1, 1, 'Your partner''s infamy rubs off on you.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 32),
  ('influence', 'Influence', 'Background', 'Influence', '• to •••••', 1, 5, 'Sway over a community, group or region.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 33),
  ('disliked', 'Disliked', 'Flaw', 'Influence', '•', 1, 1, '-1 die to Social tests with groups outside your followers.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 34),
  ('despised', 'Despised', 'Flaw', 'Influence', '••', 2, 2, 'A group or region actively works against you.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 35),
  ('mask', 'Mask', 'Background', 'Mask', '• to ••', 1, 2, 'A false identity with documents.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 36),
  ('cobbler', 'Cobbler', 'Background', 'Mask', '•', 1, 1, 'You can make or source masks; needs Mask ••.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 37),
  ('faked-death', 'Faked Death', 'Background', 'Mask', '••', 2, 2, 'Your old life thinks you dead; needs Mask ••.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 38),
  ('zeroed', 'Zeroed', 'Merit', 'Mask', '•', 1, 1, 'Your past self is purged from all systems; needs Mask ••.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 39),
  ('serial-error', 'Serial Error', 'Flaw', 'Mask', '•', 1, 1, 'Databases show you dead, watch-listed or wanted.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 40),
  ('person-of-interest', 'Person of Interest', 'Flaw', 'Mask', '••', 2, 2, 'Logged as a potential terrorist, biometrics on file.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 41),
  ('mentor', 'Mentor', 'Background', 'Mentor', '• to •••••', 1, 5, 'Hunters who guide and help you.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 42),
  ('generous', 'Generous', 'Background', 'Mentor', '• to •••', 1, 3, 'Once per story, a big favour from your mentor; costs a dot each time.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 43),
  ('spirit-guide', 'Spirit Guide', 'Background', 'Mentor', '••', 2, 2, 'Your mentor is a ghost or spirit you can summon.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 44),
  ('adversary', 'Adversary', 'Flaw', 'Mentor', '• to •••', 1, 3, 'A rival hunter out to harm you or your cell.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 45),
  ('credit-hungry', 'Credit Hungry', 'Flaw', 'Mentor', '•', 1, 1, 'Your mentor takes the credit and none of the blame.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 46),
  ('resources', 'Resources', 'Background', 'Resources', '• to •••••', 1, 5, 'Income from a defined source.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 47),
  ('destitute', 'Destitute', 'Flaw', 'Resources', '•', 1, 1, 'No money and no home.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 48),
  ('retainers', 'Retainers', 'Background', 'Retainers', '• to •••', 1, 3, 'Loyal followers who carry out your requests.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 49),
  ('stalkers', 'Stalkers', 'Flaw', 'Retainers', '•', 1, 1, 'You attract the overly attached; lose one and another appears.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 50),
  ('safe-house', 'Safe House', 'Background', 'Safe House', '• to •••', 1, 3, 'Each dot makes your home harder to find, watch or breach, and helps you notice danger.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 51),
  ('hidden-armory', 'Hidden Armory', 'Background', 'Safe House', '• +', 1, 5, 'Each dot is a pistol and a long gun hidden at home.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 52),
  ('panic-room', 'Panic Room', 'Background', 'Safe House', '•• +', 2, 5, 'A secure room (breach Difficulty 5); more dots for space or strength.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 53),
  ('watchmen', 'Watchmen', 'Background', 'Safe House', '• +', 1, 5, 'Each dot is a team of mortals watching the house.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 54),
  ('laboratory', 'Laboratory', 'Background', 'Safe House', '•• +', 2, 5, 'Dice toward one Science or Technology specialty.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 55),
  ('luxury', 'Luxury', 'Background', 'Safe House', '•', 1, 1, '+2 dice to Social tests with mortals at home; needs Resources •••.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 56),
  ('postern', 'Postern', 'Background', 'Safe House', '• +', 1, 5, 'A secret exit: +1 die per dot to slip surveillance.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 57),
  ('security-system', 'Security System', 'Background', 'Safe House', '• +', 1, 5, '+1 die per dot to resist or detect intruders.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 58),
  ('surgery', 'Surgery', 'Background', 'Safe House', '•', 1, 1, '+2 dice to medical tests at the safe house.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 59),
  ('bolt-hole', 'Bolt Hole', 'Background', 'Safe House', '•', 1, 1, '+2 dice to hide or move unseen between safe places.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 60),
  ('no-safe-house', 'No Safe House', 'Flaw', 'Safe House', '•', 1, 1, 'Nowhere is safe.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 61),
  ('creepy', 'Creepy', 'Flaw', 'Safe House', '•', 1, 1, '-2 dice to Social pools with guests at home.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 62),
  ('haunted', 'Haunted', 'Flaw', 'Safe House', '• +', 1, 5, 'Something supernatural lingers; the Storyteller sets the effect.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 63),
  ('compromised', 'Compromised', 'Flaw', 'Safe House', '••', 2, 2, 'The house is watched or raided; +2 dice to anyone targeting it.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 64),
  ('interfering-roommate', 'Interfering Roommate', 'Flaw', 'Safe House', '•', 1, 1, 'Someone else lives there and reports what they see.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 65),
  ('status', 'Status', 'Background', 'Status', '• to •••••', 1, 5, 'Standing in the local hunter community.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 66),
  ('suspect', 'Suspect', 'Flaw', 'Status', '•', 1, 1, '-2 dice to Social tests with hunters you wronged.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 67),
  ('shunned', 'Shunned', 'Flaw', 'Status', '••', 2, 2, 'A hunter group actively opposes you.', 'https://htr.paradoxwikis.com/Advantages_and_Flaws', 68);
