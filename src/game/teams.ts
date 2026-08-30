/**
 * THE LEAGUE. Thirty ball clubs, nine hitters and three arms apiece.
 *
 * ⚠️ IT WAS EIGHT UNTIL 2026-08-25, and everything written below about how the
 * EIGHT stay balanced is the history of those eight, not a rule for the thirty.
 * The other twenty-two are further down under their own heading, with their own
 * warning, and they are built on the opposite principle — see it before you
 * assume a club sitting at 40% is a bug.
 *
 * ⚠️ EDIT HERE FIRST. This is the file to open when you want different
 * players, different names, a different batting order, or a different staff.
 * Nothing below it in the engine cares what these values are — the lineups are
 * plain arrays and the stats are plain numbers.
 *
 * ⚠️ THE LEAGUE OWNS ITS OWN PLAYERS. It does not borrow from POOL in
 * roster.ts, and that is deliberate: POOL is the ROGUELIKE's draft pool and is
 * balanced for a three-man lineup that grows. The first cut of this file did
 * borrow, and balancing a club then meant editing a player the other game
 * drafts. Two games, two rosters, no shared state to break.
 *
 * HOW THE EIGHT STAY BALANCED, because this is the thing not to break:
 *
 *  1. THEY WERE BALANCED BY MEASUREMENT, NOT BY A FORMULA. The first cut
 *     matched all eight on the old `value()` score — contact, power, speed,
 *     clutch, glove, one number — and over 2,240 games the spread was still
 *     FORTY points of win rate, 26% to 70%. A stat line that scores equal does
 *     not play equal. What it tracked was POWER, at roughly 8 points of win
 *     rate per 0.1 of club average, with clutch worth about 3. Those two are
 *     the coarse knobs; contact and speed are the fine ones.
 *  2. SO THE SHAPES ARE THE FLAVOUR AND THE RECORD IS THE CHECK. Texas
 *     out-slugs Albany by 0.13 of average power and gives it back in the
 *     ninth (0.95 clutch against 1.28). Detroit has the most power in the
 *     league and the worst legs, so the gloves cost it what the bats win.
 *     Measured over 3,360 games the eight land between 46% and 55%, scoring
 *     4.2 to 4.8 a game and allowing 4.3 to 4.6.
 *  3. THE STAFFS ARE REAL AND THEY ARE THE OTHER HALF OF THE CLUB. They were
 *     one shared set of three profiles for exactly one build; giving each club
 *     its own arms blew the spread back out to twenty points on its own. See
 *     the arms section for what each knob does and what it cost to find out.
 *
 * ⚠️ RE-CAST A CLUB AND THEN RUN `node scripts/league.ts` — it plays all
 * twenty-eight matchups and prints every club's record. A club outside roughly
 * 45-55% is a club whose numbers moved too far. Nudge in steps of 0.03 and
 * re-measure; anything finer than that is inside the noise, and chasing noise
 * is how the old two-club file overfit itself twice.
 */

import type { Player } from '../core/roster.ts';
import type { Pitcher } from '../core/pitcher.ts';
import type { BatterStats } from '../core/hit.ts';
import { IDENTITIES, type Identity } from './identity.ts';
import { TALENT_SPREAD } from './tuning.ts';

// ------------------------------------------------------------- the hitters

/**
 * Every roster below is written IN BATTING ORDER — legs and contact at the
 * top, the two biggest bats third and fourth, the weakest contact buried at
 * the bottom where it comes up least often.
 */

/**
 * MAINE — contact and legs and almost no power outside the three hole. They
 * single you to death and steal the base they need.
 */
const MNE: readonly Player[] = [
  { id: 'mne1', name: 'Chowder Pelletier', build: 'human', trait: 'grit', power: 0.729, contact: 1.35, vision: 1.32, clutch: 1.269, bunt: 1.34, speed: 1.4, bats: 'L',
    bio: 'Eats before every game and tells you about it during.' },
  { id: 'mne2', name: 'Buoy Callahan', build: 'human', trait: 'reader', power: 0.835, contact: 1.3, vision: 1.27, clutch: 1.321, bunt: 1.07, speed: 1.2, bats: 'R',
    bio: 'Bobs around out there all night. Has never once gone under.' },
  { id: 'mne3', name: 'Claw Robichaud', build: 'machine', trait: 'slugger', power: 1.839, contact: 1.0, vision: 0.88, clutch: 1.269, bunt: 0.15, speed: 0.7, bats: 'R',
    bio: 'Pincer grip rated for shellfish. Goes through two bats a week.' },
  { id: 'mne4', name: 'Hardshell Ouellette', build: 'machine', trait: 'slugger', power: 1.734, contact: 0.85, vision: 0.81, clutch: 1.216, bunt: 0.2, speed: 0.6, bats: 'R',
    bio: 'Nothing gets through him. Nothing gets out of him either.' },
  { id: 'mne5', name: 'Bib Thibodeau', build: 'human', trait: 'showman', power: 1.152, contact: 1.2, vision: 1.05, clutch: 1.427, bunt: 0.81, speed: 1.0, bats: 'L',
    bio: 'Tucks a napkin into his jersey for big at-bats. It works, so nobody brings it up.' },
  { id: 'mne6', name: 'Steamer Doucette', build: 'augmented', trait: 'precision', power: 1.152, contact: 1.1, vision: 1.12, clutch: 1.11, bunt: 0.85, speed: 1.05, bats: 'L',
    bio: 'Runs hot. Vents between innings and apologises for the smell.' },
  { id: 'mne7', name: 'Trap Levesque', build: 'human', trait: 'reader', power: 0.941, contact: 1.25, vision: 1.26, clutch: 1.216, bunt: 0.95, speed: 0.95, bats: 'R',
    bio: 'Sets it early, waits all night, hauls it in full.' },
  { id: 'mne8', name: 'Knuckles Pomerleau', build: 'human', trait: 'grit', power: 0.888, contact: 1.2, vision: 1.19, clutch: 1.374, bunt: 1.06, speed: 0.85, bats: 'R',
    bio: 'Broke both hands twice. Hits .300 in a mitten, which he has had to prove.' },
  { id: 'mne9', name: 'Butter Gagnon', build: 'augmented', trait: 'showman', power: 1.417, contact: 1.0, vision: 1.01, clutch: 1.427, bunt: 0.71, speed: 0.9, bats: 'L',
    bio: 'Everything goes down easier with him up.' },
];

/**
 * NEW YORK — bought, polished and unbothered. The most complete club in the
 * league, and the one that most enjoys being watched.
 */
const NYE: readonly Player[] = [
  { id: 'nye1', name: 'Sonny Vitale', build: 'human', trait: 'showman', power: 1.049, contact: 1.45, vision: 1.14, clutch: 1.231, bunt: 0.94, speed: 1.2, bats: 'L',
    bio: 'Signs autographs from the on-deck circle. Has never declined a curtain call.' },
  { id: 'nye2', name: 'Duke Ferraro', build: 'augmented', trait: 'reader', power: 1.097, contact: 1.4, vision: 1.28, clutch: 1.182, bunt: 1.03, speed: 1.15, bats: 'R',
    bio: 'Reads the pitcher, the catcher, and the room.' },
  { id: 'nye3', name: 'Cash Delacroix', build: 'machine', trait: 'slugger', power: 1.725, contact: 1.1, vision: 0.89, clutch: 1.134, bunt: 0.21, speed: 0.75, bats: 'R',
    bio: 'Paid by the foot. Collects.' },
  { id: 'nye4', name: 'Broadway Lombardi', build: 'human', trait: 'slugger', power: 1.58, contact: 1.15, vision: 1, clutch: 1.182, bunt: 0.28, speed: 0.8, bats: 'L',
    bio: 'Two hits and a standing ovation, or an 0-for-4 and a statement to the press.' },
  { id: 'nye5', name: 'Vinny Two-Strikes', build: 'human', trait: 'grit', power: 0.953, contact: 1.35, vision: 1.23, clutch: 1.375, bunt: 1.24, speed: 0.95, bats: 'R',
    bio: 'Will not swing until he has to. Nobody has explained why it keeps working.' },
  { id: 'nye6', name: 'Marquee Malone', build: 'augmented', trait: 'precision', power: 1.242, contact: 1.25, vision: 1.09, clutch: 1.134, bunt: 0.75, speed: 1.0, bats: 'L',
    bio: 'Name in lights, swing on rails.' },
  { id: 'nye7', name: 'The Comptroller', build: 'machine', trait: 'precision', power: 1.291, contact: 1.2, vision: 1.07, clutch: 1.037, bunt: 0.71, speed: 0.9, bats: 'R',
    bio: 'Files a written report on every at-bat. Will read it to you.' },
  { id: 'nye8', name: 'Turnstile Ng', build: 'human', trait: 'grit', power: 0.904, contact: 1.3, vision: 1.24, clutch: 1.182, bunt: 1.25, speed: 1.1, bats: 'R',
    bio: 'In and out all night. You barely see him do it.' },
  { id: 'nye9', name: 'Penthouse Pinsky', build: 'augmented', trait: 'slugger', power: 1.629, contact: 1, vision: 0.91, clutch: 1.086, bunt: 0.34, speed: 0.8, bats: 'R',
    bio: 'Only interested in the top floor.' },
];

/**
 * DETROIT — the machine club, and the reason the league integrated. Enormous
 * power, hands like vices, nobody can run, and not one of them has ever
 * enjoyed a close game.
 */
const DET: readonly Player[] = [
  { id: 'det1', name: 'Rustbelt Rhonda', build: 'machine', trait: 'grit', power: 0.828, contact: 1.25, vision: 1.18, clutch: 0.966, bunt: 1.05, speed: 0.85, bats: 'L',
    bio: 'Forty years on the line. Oxidised, recertified, still here.' },
  { id: 'det2', name: 'Coney Dog Kovacs', build: 'machine', trait: 'grit', power: 0.874, contact: 1.2, vision: 1.23, clutch: 1.012, bunt: 1.08, speed: 0.95, bats: 'R',
    bio: 'Built for the concession stand. Reassigned after an incident with the chili.' },
  { id: 'det3', name: 'CRANKSHAFT', build: 'machine', trait: 'slugger', power: 1.38, contact: 0.95, vision: 0.84, clutch: 0.92, bunt: 0.15, speed: 0.6, bats: 'R',
    bio: 'Converts everything to rotation. Has no other setting.' },
  { id: 'det4', name: 'Boxcar', build: 'machine', trait: 'slugger', power: 1.426, contact: 0.85, vision: 0.88, clutch: 0.92, bunt: 0.18, speed: 0.55, bats: 'R',
    bio: 'Freight-loading chassis with a bat bolted on. Two speeds: nothing, and the parking lot.' },
  { id: 'det5', name: 'FORGE-9 "Doris"', build: 'machine', trait: 'slugger', power: 1.38, contact: 0.85, vision: 0.86, clutch: 0.828, bunt: 0.25, speed: 0.65, bats: 'R',
    bio: 'Pours at two thousand degrees. Has been asked not to celebrate indoors.' },
  { id: 'det6', name: 'CRANE-4', build: 'machine', trait: 'slugger', power: 1.288, contact: 0.9, vision: 0.84, clutch: 0.874, bunt: 0.22, speed: 0.6, bats: 'R',
    bio: 'Lifts the ball because lifting is the only verb it has.' },
  { id: 'det7', name: 'PISTON-8 "Petey"', build: 'machine', trait: 'precision', power: 1.058, contact: 1.1, vision: 1.12, clutch: 0.874, bunt: 0.66, speed: 0.8, bats: 'R',
    bio: 'Up, down, up, down. Two hundred games a year, the same swing every time.' },
  { id: 'det8', name: 'UNIT 313', build: 'machine', trait: 'reader', power: 1.012, contact: 1.1, vision: 1.14, clutch: 0.92, bunt: 0.87, speed: 0.85, bats: 'R',
    bio: 'Knows what is coming. Has never once told a teammate.' },
  { id: 'det9', name: 'Assembly Ann', build: 'machine', trait: 'precision', power: 0.92, contact: 1.2, vision: 1.11, clutch: 0.966, bunt: 0.67, speed: 0.9, bats: 'L',
    bio: 'Same swing, ninety times an hour, for as long as you keep the line moving.' },
];

/**
 * LOS ANGELES COMETS — ⚠️ EVERYBODY LEFT. This was the club that won things.
 * One winter the money went across town and then out of the state, and the nine
 * men here are the ones nobody made an offer for.
 *
 * What is left is LEGS, and that is not an accident of the roster — speed is
 * the last thing a club keeps when the bats go, because it is the one thing
 * nobody bids for. Fastest club in the league, least interested in the moment,
 * still the biggest crowd in the state. They will lose 9-8 and none of them
 * will remember it.
 */
const LAC: readonly Player[] = [
  { id: 'lac1', name: 'Sunset Delgado', build: 'human', trait: 'showman', power: 0.801, contact: 1.3, vision: 1.13, clutch: 0.939, bunt: 1.12, speed: 1.35, bats: 'L',
    bio: 'Plays the whole game like it is being filmed, which it usually is.' },
  { id: 'lac2', name: 'Freeway Fujimoto', build: 'augmented', trait: 'reader', power: 0.85, contact: 1.25, vision: 1.22, clutch: 0.89, bunt: 1.09, speed: 1.3, bats: 'R',
    bio: 'Merges without looking. Has never been thrown out doing it.' },
  { id: 'lac3', name: 'Nova Trujillo', build: 'machine', trait: 'slugger', power: 1.69, contact: 0.9, vision: 0.84, clutch: 0.939, bunt: 0.2, speed: 0.8, bats: 'R',
    bio: 'Brief, extremely bright, gone.' },
  { id: 'lac4', name: 'Chad Aurelius', build: 'augmented', trait: 'slugger', power: 1.542, contact: 0.95, vision: 0.86, clutch: 0.84, bunt: 0.32, speed: 0.95, bats: 'R',
    bio: 'Upgraded everything except the part that handles pressure.' },
  { id: 'lac5', name: 'Zip Kanaloa', build: 'human', trait: 'grit', power: 0.652, contact: 1.25, vision: 1.24, clutch: 0.989, bunt: 1.36, speed: 1.3, bats: 'L',
    bio: 'Beats out the throw, then asks the first baseman about his weekend.' },
  { id: 'lac6', name: 'Stunt Double Silva', build: 'machine', trait: 'precision', power: 1.196, contact: 1.05, vision: 1.13, clutch: 0.89, bunt: 0.74, speed: 1.0, bats: 'L',
    bio: 'Takes the hit-by-pitch nobody else wants. Union scale, plus the bruise.' },
  { id: 'lac7', name: 'Valet Vasquez', build: 'human', trait: 'reader', power: 0.751, contact: 1.15, vision: 1.27, clutch: 1.038, bunt: 1.17, speed: 1.1, bats: 'R',
    bio: 'Brings it around fast and leaves it running.' },
  { id: 'lac8', name: 'Tanner Beachwood', build: 'human', trait: 'showman', power: 1.147, contact: 1.0, vision: 0.99, clutch: 1.087, bunt: 0.9, speed: 1.0, bats: 'R',
    bio: 'Third generation. Insists he earned it, and honestly might have.' },
  { id: 'lac9', name: 'Meteor Mendez', build: 'augmented', trait: 'slugger', power: 1.493, contact: 0.85, vision: 0.86, clutch: 0.89, bunt: 0.4, speed: 1.0, bats: 'L',
    bio: 'Arrives without warning. Leaves a mark either way.' },
];

/**
 * NEW ENGLAND — no speed, no flash, and the best club in the league with two
 * outs. They foul off eleven pitches and then beat you with a single.
 */
const NEM: readonly Player[] = [
  { id: 'nem1', name: 'Bunt Sheehan', build: 'human', trait: 'grit', power: 0.668, contact: 1.35, vision: 1.23, clutch: 1.163, bunt: 1.34, speed: 1.25, bats: 'L',
    bio: 'Named for the thing he does. Does it anyway, every time, and it works.' },
  { id: 'nem2', name: 'Dunkin Muldoon', build: 'human', trait: 'grit', power: 0.87, contact: 1.3, vision: 1.24, clutch: 1.214, bunt: 1.3, speed: 1.15, bats: 'R',
    bio: 'Large regular between innings. Has been asked to stop and has not.' },
  { id: 'nem3', name: "Nor'easter Nolan", build: 'human', trait: 'slugger', power: 1.628, contact: 0.95, vision: 0.9, clutch: 1.264, bunt: 0.29, speed: 0.75, bats: 'R',
    bio: 'Quiet for six innings. Then the whole thing arrives at once.' },
  { id: 'nem4', name: 'BUNKER HILL-6 "Sully"', build: 'machine', trait: 'slugger', power: 1.628, contact: 0.9, vision: 0.82, clutch: 1.163, bunt: 0.19, speed: 0.7, bats: 'R',
    bio: 'Built as a monument. Repurposed when the monument budget was cut.' },
  { id: 'nem5', name: 'Flats Kelleher', build: 'human', trait: 'showman', power: 1.123, contact: 1.1, vision: 1.02, clutch: 1.264, bunt: 0.77, speed: 0.9, bats: 'L',
    bio: 'Digs in like the tide is coming and he has one more bucket to fill.' },
  { id: 'nem6', name: "Rotary O'Doul", build: 'human', trait: 'reader', power: 0.971, contact: 1.2, vision: 1.23, clutch: 1.113, bunt: 0.99, speed: 0.95, bats: 'R',
    bio: 'Enters without yielding. Somehow it always works out.' },
  { id: 'nem7', name: 'Third-Shift Dziedzic', build: 'augmented', trait: 'precision', power: 1.224, contact: 1.05, vision: 1.13, clutch: 1.011, bunt: 0.72, speed: 0.95, bats: 'L',
    bio: 'Better after midnight, which in a night game is most of it.' },
  { id: 'nem8', name: 'Wicked Fahey', build: 'human', trait: 'grit', power: 0.92, contact: 1.15, vision: 1.2, clutch: 1.315, bunt: 1.16, speed: 0.9, bats: 'R',
    bio: 'The adverb is the whole scouting report.' },
  { id: 'nem9', name: 'Musket Brolin', build: 'augmented', trait: 'slugger', power: 1.527, contact: 0.9, vision: 0.85, clutch: 1.011, bunt: 0.29, speed: 0.85, bats: 'R',
    bio: 'One shot, long reload, and you hear about it for a week.' },
];

/**
 * FLORIDA — the splice club. Every one of them is modified and none of them
 * will say by whom. Fast, strange, and up for anything.
 */
const FLA: readonly Player[] = [
  { id: 'fla1', name: 'Early Bird Klimczak', build: 'augmented', trait: 'grit', power: 0.889, contact: 1.35, vision: 1.27, clutch: 1.138, bunt: 1.32, speed: 1.2, bats: 'L',
    bio: 'First to the park, first to the buffet, first out of the parking lot.' },
  { id: 'fla2', name: 'Humidity Hodges', build: 'augmented', trait: 'reader', power: 1.096, contact: 1.25, vision: 1.24, clutch: 1.086, bunt: 0.96, speed: 1.1, bats: 'R',
    bio: 'Wears you down by the fourth. Nobody can prove he is doing it on purpose.' },
  { id: 'fla3', name: 'Airboat Boudreaux', build: 'augmented', trait: 'slugger', power: 1.562, contact: 0.85, vision: 0.86, clutch: 1.086, bunt: 0.34, speed: 1.0, bats: 'R',
    bio: 'Loud, flat out, and impossible to sneak up on.' },
  { id: 'fla4', name: 'Snowbird Vasseur', build: 'augmented', trait: 'slugger', power: 1.51, contact: 0.9, vision: 0.79, clutch: 1.034, bunt: 0.34, speed: 0.95, bats: 'L',
    bio: 'Here from November to April. Nobody has asked where he goes.' },
  { id: 'fla5', name: 'Gator Bait Bellamy', build: 'augmented', trait: 'showman', power: 1.303, contact: 1.2, vision: 1.08, clutch: 1.138, bunt: 0.85, speed: 1.05, bats: 'R',
    bio: 'Dives into every bag headfirst. Has been warned about the canal.' },
  { id: 'fla6', name: 'Nadia Frost', build: 'augmented', trait: 'precision', power: 1.251, contact: 1.1, vision: 1.08, clutch: 0.983, bunt: 0.84, speed: 0.9, bats: 'R',
    bio: 'Calibrated wrists, unmodified nerve. Insists the second half is what counts.' },
  { id: 'fla7', name: 'Sinkhole Sorrentino', build: 'augmented', trait: 'grit', power: 0.993, contact: 1.2, vision: 1.25, clutch: 1.189, bunt: 1.22, speed: 1.1, bats: 'R',
    bio: 'Everything around him goes under eventually. He is always fine.' },
  { id: 'fla8', name: 'Cousin Wade Pritchett', build: 'augmented', trait: 'reader', power: 1.148, contact: 1.15, vision: 1.28, clutch: 1.034, bunt: 0.91, speed: 1.05, bats: 'L',
    bio: 'Somebody on every club claims to be related to him. Nobody has checked.' },
  { id: 'fla9', name: 'Sunblock Ramirez', build: 'augmented', trait: 'showman', power: 1.045, contact: 1.1, vision: 1.07, clutch: 1.086, bunt: 1.02, speed: 1.15, bats: 'R',
    bio: 'Reapplies between innings. Has outlasted four managers doing it.' },
];

/**
 * TEXAS — the biggest bats in the league and the worst two-strike approach in
 * it. When they connect it leaves the county. Late and close, they are done.
 */
const TEX: readonly Player[] = [
  { id: 'tex1', name: 'Panhandle Pruitt', build: 'human', trait: 'grit', power: 0.783, contact: 1.35, vision: 1.25, clutch: 0.849, bunt: 1.21, speed: 1.2, bats: 'L',
    bio: 'Flat, dry and goes on forever. Wears an arm out by the third time through.' },
  { id: 'tex2', name: 'Barbed Wire Barrera', build: 'human', trait: 'reader', power: 0.877, contact: 1.3, vision: 1.32, clutch: 0.896, bunt: 1.08, speed: 1.1, bats: 'R',
    bio: 'Crowds the plate. You may have the inside corner if you can pay for it.' },
  { id: 'tex3', name: 'Two-Ton Tolliver', build: 'machine', trait: 'slugger', power: 1.537, contact: 0.85, vision: 0.8, clutch: 0.849, bunt: 0.18, speed: 0.6, bats: 'R',
    bio: 'Weighed at the gate. Charged as freight.' },
  { id: 'tex4', name: 'Gusher Gonzalez', build: 'human', trait: 'slugger', power: 1.443, contact: 0.95, vision: 0.9, clutch: 0.943, bunt: 0.25, speed: 0.85, bats: 'L',
    bio: 'Nothing for a month, then everything at once and all over the outfield.' },
  { id: 'tex5', name: 'Derrick Boone', build: 'human', trait: 'slugger', power: 1.348, contact: 1, vision: 0.94, clutch: 0.849, bunt: 0.4, speed: 0.85, bats: 'R',
    bio: 'Same swing every time, straight down. Sooner or later it hits something.' },
  { id: 'tex6', name: 'Crude Hensley', build: 'machine', trait: 'precision', power: 1.207, contact: 1.05, vision: 1.11, clutch: 0.801, bunt: 0.68, speed: 0.8, bats: 'R',
    bio: 'Unrefined, and the club has decided that is a style.' },
  { id: 'tex7', name: 'Brisket Mahoney', build: 'augmented', trait: 'showman', power: 1.065, contact: 1.1, vision: 1.05, clutch: 0.99, bunt: 0.78, speed: 0.9, bats: 'L',
    bio: 'Fourteen hours, low and slow, worth the wait. Talks the same way.' },
  { id: 'tex8', name: 'Roughneck Ruttledge', build: 'augmented', trait: 'slugger', power: 1.301, contact: 0.9, vision: 0.83, clutch: 0.849, bunt: 0.33, speed: 0.9, bats: 'R',
    bio: 'Came up off a rig and swings like the shift is ending.' },
  { id: 'tex9', name: 'Wildcat Yarborough', build: 'human', trait: 'grit', power: 0.83, contact: 1.2, vision: 1.21, clutch: 1.037, bunt: 1.24, speed: 1.0, bats: 'R',
    bio: 'Drills where nobody said there was anything. Hits often enough to keep drilling.' },
];

/**
 * ALBANY — the last all-human club, and they will tell you about it. No power
 * anywhere in the order and the best late innings in the league.
 */
const ALB: readonly Player[] = [
  { id: 'alb1', name: 'Nipper Krause', build: 'human', trait: 'reader', power: 0.832, contact: 1.3, vision: 1.32, clutch: 1.404, bunt: 1.11, speed: 1.15, bats: 'R',
    bio: 'Stands at the plate with his head tipped, listening for something.' },
  { id: 'alb2', name: 'Pothole Petrosky', build: 'human', trait: 'grit', power: 0.886, contact: 1.25, vision: 1.18, clutch: 1.35, bunt: 1.23, speed: 1.1, bats: 'L',
    bio: 'Been there for years. Everyone has agreed to steer around him.' },
  { id: 'alb3', name: 'Preacher Vandenburg', build: 'human', trait: 'slugger', power: 1.534, contact: 0.95, vision: 0.85, clutch: 1.458, bunt: 0.28, speed: 0.75, bats: 'R',
    bio: 'Calls his shots in the third person and has yet to apologise for it.' },
  { id: 'alb4', name: 'Sal "The Mayor" Bevilacqua', build: 'human', trait: 'showman', power: 1.426, contact: 1.05, vision: 0.97, clutch: 1.566, bunt: 0.82, speed: 0.8, bats: 'R',
    bio: 'Knows everyone in the park by name and expects the same in return.' },
  { id: 'alb5', name: 'Early Kirkwood', build: 'human', trait: 'grit', power: 0.94, contact: 1.25, vision: 1.19, clutch: 1.404, bunt: 1.21, speed: 1.05, bats: 'L',
    bio: 'Fouls off everything until the pitcher runs out of ideas. Has never been described as exciting.' },
  { id: 'alb6', name: 'Tugboat Prendergast', build: 'human', trait: 'slugger', power: 1.48, contact: 0.95, vision: 0.87, clutch: 1.35, bunt: 0.33, speed: 0.7, bats: 'R',
    bio: 'Slow, low in the water, and moves things far heavier than himself.' },
  { id: 'alb7', name: 'Bea "Two Bags" Slocum', build: 'human', trait: 'reader', power: 0.994, contact: 1.25, vision: 1.29, clutch: 1.296, bunt: 1.06, speed: 1.15, bats: 'L',
    bio: 'Never stops at first. Has been out at second more than anyone alive.' },
  { id: 'alb8', name: 'Cropsey Dunham', build: 'human', trait: 'grit', power: 0.886, contact: 1.2, vision: 1.17, clutch: 1.35, bunt: 1.1, speed: 0.95, bats: 'R',
    bio: 'The visiting clubs tell stories about him. He does nothing to correct them.' },
  { id: 'alb9', name: 'Uncle Milt Gorczyca', build: 'human', trait: 'precision', power: 1.048, contact: 1.15, vision: 1.15, clutch: 1.242, bunt: 0.79, speed: 0.85, bats: 'R',
    bio: 'Everyone calls him uncle. Nobody can establish whose uncle he is.' },
];

// --------------------------------------------------------------- the arms

/**
 * EIGHT STAFFS, EIGHT WAYS TO GET YOU OUT.
 *
 * These used to be one set of three profiles wearing twenty-four different
 * names — same `zoneRate`, same `signature`, arsenal as the only difference —
 * because eight clubs is twenty-eight matchups and matching a staff pairing by
 * search costs a sim run each. Identical profiles made the pitching matchup
 * neutral by construction, and it was a skin.
 *
 * They are real now, and the balance comes from where the hitting balance
 * comes from: `node scripts/league.ts`, which prints runs ALLOWED next to runs
 * scored, so a staff that is quietly the best in the league shows up in a
 * column instead of in a losing streak. What the knobs do, so a re-cast is not
 * a guess:
 *
 *   zoneRate    strikes thrown when he is neither ahead nor behind. The single
 *               biggest lever here. Low is walks; high is contact.
 *   signature   junk turns his fastballs into breaking balls; painter multiplies
 *               his zone rate by 1.25 and never lets him near the middle;
 *               fireball is velocity and nothing else; knuckler throws the
 *               knuckleball 70% of the time.
 *   speedBonus  mph on everything, which is reaction time off the hitter.
 *   tellTiming  when the hitter sees what is coming: pre_pitch is a man who
 *               tips, release is a short read, none is nothing at all. ⚠️ FREE
 *               in the sim and expensive for the HUMAN — the AI hitter does not
 *               read tells, you do. It is the difficulty knob, not a balance
 *               knob, so spend it on flavour.
 *
 * WHAT FOUR ROUNDS OF MEASUREMENT ACTUALLY SAID, because none of it was the
 * obvious answer and all of it cost a sim run:
 *
 *  · ARSENAL BEATS VELOCITY. A fastball-heavy staff is a hittable staff no
 *    matter how hard it throws. Detroit and Texas were the two worst clubs in
 *    the league at 44% and 42% while throwing the hardest; making the same
 *    arms sinker- and slider-first, one line each, moved them to 48% and 51%
 *    without touching a single mph.
 *  · `junk` IS THE STRONGEST SIGNATURE, because turning every fastball into a
 *    breaking ball is the same trick by another route. Albany had two junk
 *    arms and allowed 3.6 runs a game in a 4.6-run league; taking the
 *    signature off one man cost them seven points of win rate.
 *  · A HIGH ZONE RATE IS GOOD, WHICH IS BACKWARDS FROM THE OLD FILE. Walks
 *    cost more than the extra contact does — New England leads the league in
 *    strikes thrown and is second in runs allowed.
 *
 * ⚠️ THE ONE LANDMINE IS THE KNUCKLEBALLER. The penalty in ai.ts hits every AI
 * hitter at once, and Old Man Prewitt STARTING cut the other side's scoring
 * from 4.8 to 2.7 by himself. Erie Canal Kowal carried `signature: 'knuckler'`
 * for one measurement and Albany won 60% of everything. He throws the pitch a
 * quarter of the time now and the signature is gone. Keep it that way.
 */

/** MAINE — junk, guile and nothing over 90. They pitch backwards all night. */
const MNE_ARMS: readonly Pitcher[] = [
  {
    name: 'Splash Bergeron', throws: 'L', signature: 'junk', tellTiming: 'release', zoneRate: 0.55,
    blurb: 'Pitches like the tide. Same thing all night, and it gets you.',
    arsenal: { fastball: 0.4, curveball: 0.35, changeup: 0.25 }, putaway: 'curveball', break: 0.97, clutch: 1.02, stamina: 1.29,
  },
  {
    name: 'Sternman Doyle', throws: 'L', signature: 'none', tellTiming: 'release', zoneRate: 0.5, speedBonus: 2,
    blurb: 'Hauls up whatever the starter left in the water.',
    arsenal: { fastball: 0.25, slider: 0.75 }, putaway: 'slider', break: 1.002, clutch: 1.03, stamina: 1.06,
  },
  {
    name: 'Trap Line Poulin', throws: 'R', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.5,
    blurb: 'Four hundred of them and he can find every one in fog.',
    arsenal: { sinker: 0.45, curveball: 0.32, changeup: 0.23 }, putaway: 'curveball', break: 0.987, clutch: 1.045, stamina: 1.08,
  },
];

/** ...and the three who finish it. */
const MNE_PEN: readonly Pitcher[] = [
  {
    name: 'The Lighthouse', throws: 'R', signature: 'painter', tellTiming: 'none', zoneRate: 0.45,
    blurb: 'Stands out there blinking at you. You hit the rocks anyway.',
    arsenal: { fastball: 0.35, slider: 0.35, changeup: 0.3 }, putaway: 'slider', break: 0.97, clutch: 1.15, stamina: 0.76,
  },
  {
    name: 'Bait Barrel Michaud', throws: 'L', signature: 'junk', tellTiming: 'pre_pitch', zoneRate: 0.49,
    blurb: 'You smell him before the bullpen gate opens. It is a tactic.',
    arsenal: { changeup: 0.6, slider: 0.4 }, putaway: 'changeup', break: 0.958, clutch: 1.024, stamina: 0.82,
  },
  {
    name: 'Sternman Fortin', throws: 'R', signature: 'none', tellTiming: 'release', zoneRate: 0.48,
    blurb: 'Hauls the last forty traps of the day without saying a word.',
    arsenal: { fastball: 0.6, sinker: 0.4 }, putaway: 'sinker', break: 1.019, clutch: 1.088, stamina: 0.7,
  },
];

/** NEW YORK — bought an arm for every situation, and they all show up. */
const NYE_ARMS: readonly Pitcher[] = [
  {
    name: 'Whitey Pastore', throws: 'R', signature: 'junk', tellTiming: 'release', zoneRate: 0.55,
    blurb: 'Fourteen years, four clubs, one suit.',
    arsenal: { fastball: 0.45, slider: 0.3, curveball: 0.25 }, putaway: 'slider', break: 1.11, clutch: 1, stamina: 1.26,
  },
  {
    name: 'Bridge Toll Bianchi', throws: 'L', signature: 'fireball', tellTiming: 'none', zoneRate: 0.5, speedBonus: 4,
    blurb: 'You may come through. It will cost you.',
    arsenal: { fastball: 0.25, curveball: 0.75 }, putaway: 'curveball', break: 1.147, clutch: 1.03, stamina: 1.1,
  },
  {
    name: 'Contract Year Marchetti', throws: 'R', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.52,
    blurb: 'Has had one every year since he signed. Nobody has explained the mechanism.',
    arsenal: { fastball: 0.45, slider: 0.32, changeup: 0.23 }, putaway: 'slider', break: 1.13, clutch: 1.071, stamina: 1.08,
  },
];

/** ...and the three who finish it. */
const NYE_PEN: readonly Pitcher[] = [
  {
    name: 'Last Call Ippolito', throws: 'R', signature: 'painter', tellTiming: 'none', zoneRate: 0.5,
    blurb: 'Ninth inning, lights down, nobody leaves.',
    arsenal: { fastball: 0.4, slider: 0.4, changeup: 0.2 }, putaway: 'slider', break: 1.11, clutch: 1.25, stamina: 0.9,
  },
  {
    name: 'Bridge And Tunnel Sabatini', throws: 'L', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.51,
    blurb: 'Commutes in from the other side and is reminded of it nightly.',
    arsenal: { sinker: 0.6, slider: 0.4 }, putaway: 'slider', break: 1.095, clutch: 1.049, stamina: 0.82,
  },
  {
    name: 'The Luxury Tax', throws: 'R', signature: 'fireball', tellTiming: 'release', zoneRate: 0.5, speedBonus: 7,
    blurb: 'Costs more than the rest of the pen together and closes the door anyway.',
    arsenal: { fastball: 0.6, slider: 0.4 }, putaway: 'fastball', break: 1.166, clutch: 1.115, stamina: 0.7,
  },
];

/** DETROIT — velocity, no tells, and perfectly happy to throw it over. */
const DET_ARMS: readonly Pitcher[] = [
  {
    name: 'FURNACE-3', throws: 'R', signature: 'fireball', tellTiming: 'none', zoneRate: 0.55, speedBonus: 5,
    blurb: 'Runs at temperature for six innings, then stops without warning.',
    arsenal: { sinker: 0.45, slider: 0.3, fastball: 0.25 }, putaway: 'sinker', break: 0.97, clutch: 0.9, stamina: 1.16,
  },
  {
    name: 'SECOND SHIFT', throws: 'L', signature: 'fireball', tellTiming: 'none', zoneRate: 0.55, speedBonus: 6,
    blurb: 'Clocks in at the seventh. Does not converse.',
    arsenal: { fastball: 0.25, slider: 0.75 }, putaway: 'slider', break: 1.002, clutch: 1.09, stamina: 1.06,
  },
  {
    name: 'NIGHT SHIFT', throws: 'R', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.53,
    blurb: 'Runs from eleven to seven and has never seen the day crew.',
    arsenal: { sinker: 0.45, slider: 0.32, fastball: 0.23 }, putaway: 'slider', break: 0.987, clutch: 1.009, stamina: 1.08,
  },
];

/** ...and the three who finish it. */
const DET_PEN: readonly Pitcher[] = [
  {
    name: 'Tool & Die Tarnowski', throws: 'R', signature: 'painter', tellTiming: 'none', zoneRate: 0.5,
    blurb: 'Machines the corner to a thousandth and hands you the part.',
    arsenal: { fastball: 0.3, slider: 0.35, curveball: 0.35 }, putaway: 'curveball', break: 0.97, clutch: 1.1, stamina: 0.76,
  },
  {
    name: 'SLAG-6', throws: 'L', signature: 'junk', tellTiming: 'pre_pitch', zoneRate: 0.52,
    blurb: 'What is left over, repurposed. Works better than it has any right to.',
    arsenal: { changeup: 0.6, curveball: 0.4 }, putaway: 'changeup', break: 0.958, clutch: 0.989, stamina: 0.82,
  },
  {
    name: 'QUENCH TANK', throws: 'R', signature: 'fireball', tellTiming: 'release', zoneRate: 0.51, speedBonus: 7,
    blurb: 'Whatever comes out of the furnace goes in here and stops moving.',
    arsenal: { fastball: 0.6, sinker: 0.4 }, putaway: 'fastball', break: 1.019, clutch: 1.051, stamina: 0.7,
  },
];

/** LOS ANGELES COMETS — arms that were signed to be somebody else's bridge. */
const LAC_ARMS: readonly Pitcher[] = [
  {
    name: 'Rex Pomeroy', throws: 'R', signature: 'junk', tellTiming: 'release', zoneRate: 0.55, speedBonus: 3,
    blurb: 'Has an agent, a podcast and a changeup.',
    arsenal: { fastball: 0.45, changeup: 0.35, curveball: 0.2 }, putaway: 'changeup', break: 0.97, clutch: 0.9, stamina: 1.16,
  },
  {
    name: 'Bel Air Bracco', throws: 'L', signature: 'fireball', tellTiming: 'release', zoneRate: 0.55, speedBonus: 7,
    blurb: 'Throws very hard and is extremely pleased about it.',
    arsenal: { fastball: 0.25, slider: 0.75 }, putaway: 'slider', break: 1.002, clutch: 0.96, stamina: 0.97,
  },
  {
    name: 'Waiver Wire Pham', throws: 'L', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.53,
    blurb: 'Claimed on a Tuesday. Started on the Thursday. Still here.',
    arsenal: { fastball: 0.45, changeup: 0.32, curveball: 0.23 }, putaway: 'changeup', break: 0.987, clutch: 0.951, stamina: 1.08,
  },
];

/** ...and the three who finish it. */
const LAC_PEN: readonly Pitcher[] = [
  {
    name: 'The Understudy', throws: 'R', signature: 'painter', tellTiming: 'none', zoneRate: 0.5, speedBonus: 5,
    blurb: 'Waits in the pen for eight innings hoping something goes wrong.',
    arsenal: { slider: 0.4, fastball: 0.35, changeup: 0.25 }, putaway: 'slider', break: 0.97, clutch: 1.05, stamina: 0.73,
  },
  {
    name: 'Deferred Money Ruiz', throws: 'R', signature: 'junk', tellTiming: 'pre_pitch', zoneRate: 0.52,
    blurb: 'Gets paid in 2041 and pitches like it.',
    arsenal: { slider: 0.6, changeup: 0.4 }, putaway: 'slider', break: 0.958, clutch: 0.931, stamina: 0.82,
  },
  {
    name: 'The Last Holdout', throws: 'R', signature: 'fireball', tellTiming: 'release', zoneRate: 0.51, speedBonus: 7,
    blurb: 'Everybody else took the money. He took the ball.',
    arsenal: { fastball: 0.6, slider: 0.4 }, putaway: 'fastball', break: 1.019, clutch: 0.99, stamina: 0.7,
  },
];

/** NEW ENGLAND — sinkers, strikes, and every one of them tips it. */
const NEM_ARMS: readonly Pitcher[] = [
  {
    name: 'Cobblestone Coyne', throws: 'R', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.55,
    blurb: 'Nothing about him is straight and none of it is an accident.',
    arsenal: { sinker: 0.4, fastball: 0.35, curveball: 0.25 }, putaway: 'sinker', break: 0.97, clutch: 0.9, stamina: 1.16,
  },
  {
    name: 'Plow Guy Kowalczyk', throws: 'L', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.55,
    blurb: 'Comes through at three in the morning whether you asked or not.',
    arsenal: { fastball: 0.25, slider: 0.45, curveball: 0.3 }, putaway: 'slider', break: 1.002, clutch: 1.051, stamina: 1.04,
  },
  {
    name: 'Powder Horn Whitcomb', throws: 'R', signature: 'painter', tellTiming: 'pre_pitch', zoneRate: 0.52,
    blurb: 'Carries exactly enough and does not waste a grain of it.',
    arsenal: { curveball: 0.45, slider: 0.32, changeup: 0.23 }, putaway: 'slider', break: 0.987, clutch: 1.036, stamina: 1.08,
  },
];

/** ...and the three who finish it. */
const NEM_PEN: readonly Pitcher[] = [
  {
    name: 'Deacon Tremblay', throws: 'R', signature: 'painter', tellTiming: 'release', zoneRate: 0.45,
    blurb: 'Paints the black, then looks at you until you accept it.',
    arsenal: { fastball: 0.35, curveball: 0.35, changeup: 0.3 }, putaway: 'curveball', break: 0.97, clutch: 1.22, stamina: 0.81,
  },
  {
    name: 'Stone Wall Amory', throws: 'L', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.51,
    blurb: 'Nobody mortared it and nobody has moved it in two hundred years.',
    arsenal: { sinker: 0.6, curveball: 0.4 }, putaway: 'curveball', break: 0.958, clutch: 1.014, stamina: 0.82,
  },
  {
    name: 'Old North Pike', throws: 'R', signature: 'none', tellTiming: 'release', zoneRate: 0.5,
    blurb: 'Two lanterns and everybody in the county is already awake.',
    arsenal: { fastball: 0.6, slider: 0.4 }, putaway: 'slider', break: 1.019, clutch: 1.078, stamina: 0.7,
  },
];

/** FLORIDA — nobody, Florida included, knows what is coming. */
const FLA_ARMS: readonly Pitcher[] = [
  {
    name: 'Mango Cruz', throws: 'R', signature: 'junk', tellTiming: 'release', zoneRate: 0.5,
    blurb: 'Sweet, unpredictable, occasionally hits somebody.',
    arsenal: { fastball: 0.45, sinker: 0.3, changeup: 0.25 }, putaway: 'changeup', break: 0.97, clutch: 1.1, stamina: 1.29,
  },
  {
    name: 'Category Four Ortiz', throws: 'L', signature: 'fireball', tellTiming: 'none', zoneRate: 0.4, speedBonus: 8,
    blurb: 'Everything at once, from a direction you were not expecting.',
    arsenal: { fastball: 0.25, curveball: 0.75 }, putaway: 'curveball', break: 1.002, clutch: 0.89, stamina: 1.1,
  },
  {
    name: 'Barrier Island Sosa', throws: 'L', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.48,
    blurb: 'Takes the whole storm so the mainland does not have to.',
    arsenal: { fastball: 0.45, curveball: 0.32, changeup: 0.23 }, putaway: 'curveball', break: 0.987, clutch: 1.013, stamina: 1.08,
  },
];

/** ...and the three who finish it. */
const FLA_PEN: readonly Pitcher[] = [
  {
    name: 'Retiree Delgado', throws: 'R', signature: 'junk', tellTiming: 'pre_pitch', zoneRate: 0.55,
    blurb: 'Came out of retirement for the ninth. Has now done this eleven times.',
    arsenal: { slider: 0.4, fastball: 0.3, changeup: 0.3 }, putaway: 'slider', break: 0.97, clutch: 1.11, stamina: 0.73,
  },
  {
    name: 'Red Tide Verano', throws: 'R', signature: 'junk', tellTiming: 'pre_pitch', zoneRate: 0.47,
    blurb: 'Arrives quietly, clears the beach, nobody can say when it will go.',
    arsenal: { slider: 0.6, changeup: 0.4 }, putaway: 'slider', break: 0.958, clutch: 0.992, stamina: 0.82,
  },
  {
    name: 'Storm Surge Okafor', throws: 'R', signature: 'fireball', tellTiming: 'release', zoneRate: 0.46, speedBonus: 7,
    blurb: 'It is never the wind that gets you. It is the water behind it.',
    arsenal: { fastball: 0.6, sinker: 0.4 }, putaway: 'fastball', break: 1.019, clutch: 1.054, stamina: 0.7,
  },
];

/** TEXAS — hard, heavy, and generous with the free pass. */
const TEX_ARMS: readonly Pitcher[] = [
  {
    name: 'Buck Rowden', throws: 'R', signature: 'none', tellTiming: 'release', zoneRate: 0.55, speedBonus: 2,
    blurb: 'Throws it, spits, throws it again. Four hours of that.',
    arsenal: { sinker: 0.45, slider: 0.3, fastball: 0.25 }, putaway: 'sinker', break: 0.97, clutch: 1.11, stamina: 1.27,
  },
  {
    name: 'Flare Stack Fenn', throws: 'L', signature: 'fireball', tellTiming: 'release', zoneRate: 0.55, speedBonus: 6,
    blurb: 'Burns off whatever is left of the seventh.',
    arsenal: { slider: 0.75, fastball: 0.25 }, putaway: 'slider', break: 1.002, clutch: 0.94, stamina: 0.99,
  },
  {
    name: 'Gusher Tolliver', throws: 'R', signature: 'fireball', tellTiming: 'pre_pitch', zoneRate: 0.55, speedBonus: 5,
    blurb: 'Nothing for six innings and then it is in the next county.',
    arsenal: { fastball: 0.45, slider: 0.32, sinker: 0.23 }, putaway: 'fastball', break: 0.987, clutch: 1.045, stamina: 1.08,
  },
];

/** ...and the three who finish it. */
const TEX_PEN: readonly Pitcher[] = [
  {
    name: 'Sidewinder Sikes', throws: 'R', signature: 'painter', tellTiming: 'none', zoneRate: 0.55, speedBonus: 3,
    blurb: 'Comes at you sideways and low, and does not rattle first.',
    arsenal: { slider: 0.45, fastball: 0.3, curveball: 0.25 }, putaway: 'slider', break: 0.97, clutch: 1.15, stamina: 0.8,
  },
  {
    name: 'Roughneck Cade', throws: 'L', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.54,
    blurb: 'Two weeks on, two off, and he is unpleasant for all four.',
    arsenal: { sinker: 0.6, slider: 0.4 }, putaway: 'slider', break: 0.958, clutch: 1.024, stamina: 0.82,
  },
  {
    name: 'Blowout Preventer Hobbs', throws: 'R', signature: 'none', tellTiming: 'release', zoneRate: 0.53,
    blurb: 'The only thing on the whole rig that has to work.',
    arsenal: { fastball: 0.6, sinker: 0.4 }, putaway: 'sinker', break: 1.019, clutch: 1.088, stamina: 0.7,
  },
];

/** ALBANY — two old men who tip everything, and the last knuckleball alive. */
const ALB_ARMS: readonly Pitcher[] = [
  {
    name: 'Ed Mancuso', throws: 'R', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.6,
    blurb: 'Thirty-nine years old and gets by on knowing things.',
    arsenal: { fastball: 0.45, curveball: 0.35, changeup: 0.2 }, putaway: 'curveball', break: 0.97, clutch: 0.91, stamina: 1.17,
  },
  {
    name: 'Erie Canal Kowal', throws: 'L', signature: 'junk', tellTiming: 'pre_pitch', zoneRate: 0.5,
    blurb: 'Slow to get going. Moves everything once he does, mostly sideways.',
    // ⚠️ A QUARTER KNUCKLEBALLS, NOT A SIGNATURE. He carried `signature:
    // 'knuckler'` for one measurement — 70% knucklers — and Albany allowed
    // 3.61 runs a game in a 4.6 league and won 60% of everything. The pitch is
    // the identity; the signature was a wall.
    arsenal: { fastball: 0.25, curveball: 0.41, knuckleball: 0.34 }, putaway: 'knuckleball', break: 1.002, clutch: 1.021, stamina: 1.02,
  },
  {
    name: 'Lock Seven Brennan', throws: 'L', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.52,
    blurb: 'Raises you up, lowers you down, and you are no further along.',
    arsenal: { sinker: 0.45, curveball: 0.32, changeup: 0.23 }, putaway: 'curveball', break: 0.987, clutch: 0.98, stamina: 1.08,
  },
];

/** ...and the three who finish it. */
const ALB_PEN: readonly Pitcher[] = [
  {
    name: 'Miss Ada Quill', throws: 'R', signature: 'painter', tellTiming: 'release', zoneRate: 0.45,
    blurb: 'Corner, corner, corner. Ninety-one pitches and no walks.',
    arsenal: { fastball: 0.35, slider: 0.35, changeup: 0.3 }, putaway: 'slider', break: 0.97, clutch: 1.07, stamina: 0.74,
  },
  {
    name: 'Towpath Delaney', throws: 'R', signature: 'junk', tellTiming: 'pre_pitch', zoneRate: 0.51,
    blurb: 'Walks the same four miles every night at the same speed.',
    arsenal: { changeup: 0.6, curveball: 0.4 }, putaway: 'changeup', break: 0.958, clutch: 0.96, stamina: 0.82,
  },
  {
    name: 'Capitol Dome Ferraro', throws: 'R', signature: 'painter', tellTiming: 'release', zoneRate: 0.5,
    blurb: 'Took eleven years and went wildly over budget. Worth it.',
    arsenal: { fastball: 0.6, slider: 0.4 }, putaway: 'slider', break: 1.019, clutch: 1.02, stamina: 0.7,
  },
];


// ------------------------------------------------------ the other twenty-two
//
// THE EXPANSION. Twenty-two clubs, and the league stops pretending to be flat.
//
// ⚠️ READ THIS BEFORE MOVING A NUMBER BELOW. The original eight were written to
// land inside a fifty-point band, because the exhibition picks both clubs and a
// coin flip is the point of it. These are not. value.ts made the franchise's
// rule the opposite one — the good clubs win, the thin ones lose, or no trade,
// signing or development step can ever matter — and thirty clubs is where that
// rule finally has room to say something. The ladder here runs from roughly 5.7
// to 7.3 of clubValue, top to bottom, and it is MEANT to.
//
// WHAT DECIDES WHERE A CLUB SITS: its market. Three towns carry two clubs each
// — New York, Los Angeles, Chicago — and money is the whole reason they can.
// The other twenty-four are one-club towns playing the same fourteen games with
// whoever the town produced. That is the fiction, and it is also the difficulty
// select: picking Oklahoma City is picking hard mode, and the pre-game card
// says so out loud before the first pitch (see strengthLabel in value.ts).
//
// ⚠️ THE SHAPES ARE STILL THE FLAVOUR. A tier is a budget, not a build. Two
// clubs worth the same 6.4 should get there differently — one on power with no
// legs, one on contact and nerve — or the ladder becomes the only thing anybody
// can tell about a club, and thirty of those is a spreadsheet, not a league.
//
// ⚠️ RE-CAST ANY OF THEM AND RUN `node scripts/season.ts`. It asks the only
// question this file can now get wrong: does the better roster actually finish
// higher? league.ts still prints the round robin, but a SPREAD is no longer a
// fault there, so what it catches is a club whose record and whose roster value
// disagree — one that has fallen off the ladder rather than sat where it was put.

/**
 * LOS ANGELES AQUEDUCTS — the water still runs and the money stopped. They
 * have the best single ballplayer alive and eight men who were available, and
 * they have not finished above .500 in the time anybody can remember.
 *
 * ⚠️ THE ONE-STAR CLUB, and it is the only roster in the league built this way
 * on purpose. Mulholland alone is worth more than any two men on this list put
 * together; take him off and the club is Oklahoma City with a nicer park. That
 * shape is the whole point — a lineup where one at-bat in nine is terrifying
 * and the other eight are an opportunity.
 */
const LAA: readonly Player[] = [
  { id: 'laa1', name: 'Sluice Okonkwo', build: 'human', trait: 'reader', power: 0.9, contact: 1.16, vision: 1.14, clutch: 1.02, bunt: 1.22, speed: 1.24, bats: 'L',
    bio: 'Reads a pitcher the way the district reads a water bill. Never pays it.' },
  { id: 'laa2', name: 'Valencia Reyes', build: 'human', trait: 'grit', power: 0.94, contact: 1.14, vision: 1.12, clutch: 1.06, bunt: 1.18, speed: 1.12, bats: 'R',
    bio: 'Grew up on the orchard the aqueduct dried out. Mentions it on camera.' },
  { id: 'laa3', name: 'Mulholland', build: 'machine', trait: 'slugger', power: 1.88, contact: 1.22, vision: 1.24, clutch: 1.46, bunt: 0.16, speed: 1.18, bats: 'R',
    bio: 'Named for the man who took the river. The best there is, on a club going nowhere.' },
  { id: 'laa4', name: 'Kingsley Ash', build: 'machine', trait: 'slugger', power: 1.36, contact: 0.92, vision: 0.88, clutch: 0.98, bunt: 0.19, speed: 0.72, bats: 'L',
    bio: 'Bought in the winter on the strength of one good August.' },
  { id: 'laa5', name: 'Delta Fontaine', build: 'human', trait: 'showman', power: 1.12, contact: 1.02, vision: 0.96, clutch: 1.04, bunt: 0.78, speed: 0.98, bats: 'L',
    bio: 'Arrives late, leaves early, and is photographed doing both.' },
  { id: 'laa6', name: 'Standpipe Nakamura', build: 'machine', trait: 'precision', power: 1.04, contact: 1.06, vision: 1.02, clutch: 0.96, bunt: 0.88, speed: 0.9, bats: 'R',
    bio: 'Pressure-rated, and it has never once come up.' },
  { id: 'laa7', name: 'Owens Vale', build: 'human', trait: 'reader', power: 0.96, contact: 1.12, vision: 1.16, clutch: 1.0, bunt: 1.02, speed: 1.02, bats: 'R',
    bio: 'Took the buyout, took the job, and is still waiting on the ring.' },
  { id: 'laa8', name: 'Cement Channel Ruiz', build: 'machine', trait: 'grit', power: 1.0, contact: 1.08, vision: 1.06, clutch: 1.02, bunt: 1.05, speed: 0.85, bats: 'R',
    bio: 'Straight, grey and going exactly where it went last year.' },
  { id: 'laa9', name: 'Perpetual Flow', build: 'machine', trait: 'slugger', power: 1.3, contact: 0.9, vision: 0.86, clutch: 0.94, bunt: 0.22, speed: 0.78, bats: 'L',
    bio: 'Does not stop. Was not manufactured with the part that improves, either.' },
];

const LAA_ARMS: readonly Pitcher[] = [
  {
    name: 'Headgate Salcedo', throws: 'R', signature: 'painter', tellTiming: 'release', zoneRate: 0.5, speedBonus: 3,
    blurb: 'Opens it exactly as far as he means to, which is not far enough any more.',
    arsenal: { fastball: 0.3, slider: 0.35, changeup: 0.2, curveball: 0.15 }, putaway: 'slider', break: 0.96, clutch: 0.94, stamina: 1.02,
  },
  {
    name: 'The Siphon', throws: 'L', signature: 'junk', tellTiming: 'release', zoneRate: 0.53,
    blurb: 'Takes what it wants and leaves the level looking untouched.',
    arsenal: { curveball: 0.4, changeup: 0.35, slider: 0.25 }, putaway: 'curveball', break: 0.971, clutch: 0.96, stamina: 1.01,
  },
  {
    name: 'Spillway Okonkwo', throws: 'R', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.53,
    blurb: 'Everything over the top eventually, and never in a hurry.',
    arsenal: { sinker: 0.45, curveball: 0.32, changeup: 0.23 }, putaway: 'curveball', break: 0.936, clutch: 0.915, stamina: 1.08,
  },
];

/** ...and the three who finish it. */
const LAA_PEN: readonly Pitcher[] = [
  {
    name: 'Cistern Bly', throws: 'R', signature: 'none', tellTiming: 'release', zoneRate: 0.56, speedBonus: 5,
    blurb: 'Holds everything. Gives most of it back in the eighth.',
    arsenal: { fastball: 0.55, sinker: 0.25, slider: 0.2 }, putaway: 'slider', break: 0.86, clutch: 0.9, stamina: 0.78,
  },
  {
    name: 'Drip Line Vasquez', throws: 'L', signature: 'painter', tellTiming: 'pre_pitch', zoneRate: 0.52,
    blurb: 'A little at a time, exactly where it is needed.',
    arsenal: { changeup: 0.6, slider: 0.4 }, putaway: 'changeup', break: 0.908, clutch: 0.896, stamina: 0.82,
  },
  {
    name: 'Shutoff Valve Reyes', throws: 'R', signature: 'none', tellTiming: 'release', zoneRate: 0.51,
    blurb: 'One turn and the whole thing stops.',
    arsenal: { fastball: 0.6, sinker: 0.4 }, putaway: 'sinker', break: 0.966, clutch: 0.952, stamina: 0.7,
  },
];

/**
 * CHICAGO FIREMEN — the south side, named twice over: the city that burned
 * down and rebuilt on top of itself, and the ball term for the man who comes
 * in to put the rally out. THE DEEPEST PEN IN THE LEAGUE, and the only club
 * that can genuinely shorten a game on you.
 */
const CHF: readonly Player[] = [
  { id: 'chf1', name: 'Hook And Ladder Nowak', build: 'machine', trait: 'grit', power: 0.99, contact: 1.22, vision: 1.22, clutch: 1.18, bunt: 1.12, speed: 1.08, bats: 'L',
    bio: 'First one on the scene and the last one to leave it.' },
  { id: 'chf2', name: 'Halsted Byrne', build: 'human', trait: 'reader', power: 1.03, contact: 1.24, vision: 1.26, clutch: 1.2, bunt: 1.14, speed: 1.16, bats: 'R',
    bio: 'Counts pitches out loud from the box. Nobody has asked him to stop.' },
  { id: 'chf3', name: 'BACKDRAFT', build: 'machine', trait: 'slugger', power: 1.75, contact: 0.92, vision: 0.88, clutch: 1.16, bunt: 0.12, speed: 0.7, bats: 'R',
    bio: 'Quiet for eight innings and then the whole room goes up at once.' },
  { id: 'chf4', name: 'The Water Tower', build: 'machine', trait: 'slugger', power: 1.63, contact: 0.92, vision: 0.9, clutch: 1.24, bunt: 0.15, speed: 0.72, bats: 'L',
    bio: 'The one thing on this block the fire did not take. Still standing, still working.' },
  { id: 'chf5', name: "Mrs. O'Leary", build: 'human', trait: 'showman', power: 1.43, contact: 1, vision: 0.98, clutch: 1.3, bunt: 0.3, speed: 0.85, bats: 'L',
    bio: 'Blamed for the whole thing on no evidence and has stopped correcting people.' },
  { id: 'chf6', name: 'Jackscrew Sobczak', build: 'human', trait: 'precision', power: 1.15, contact: 1.14, vision: 1.16, clutch: 1.12, bunt: 0.86, speed: 0.95, bats: 'L',
    bio: 'They lifted the entire city out of the mud on screws. His people turned them.' },
  { id: 'chf7', name: 'Ashland Vukovich', build: 'human', trait: 'grit', power: 1.09, contact: 1.18, vision: 1.2, clutch: 1.24, bunt: 1.08, speed: 1.02, bats: 'R',
    bio: 'Third generation on the same block, which has burned twice.' },
  { id: 'chf8', name: 'Standpipe Kowalik', build: 'augmented', trait: 'grit', power: 1.23, contact: 1.06, vision: 1.04, clutch: 1.2, bunt: 0.72, speed: 0.88, bats: 'R',
    bio: 'Holds pressure all night whether or not anybody opens him.' },
  { id: 'chf9', name: 'Third Alarm Prazak', build: 'machine', trait: 'showman', power: 1.41, contact: 1, vision: 0.96, clutch: 1.36, bunt: 0.28, speed: 0.92, bats: 'L',
    bio: 'By the time they call for him it is already bad, which is when he is best.' },
];

const CHF_ARMS: readonly Pitcher[] = [
  {
    name: 'Engine Company Janiak', throws: 'R', signature: 'junk', tellTiming: 'none', zoneRate: 0.56, speedBonus: 2,
    blurb: 'Goes eight and hands over a building that is still standing.',
    arsenal: { sinker: 0.4, slider: 0.3, changeup: 0.3 }, putaway: 'sinker', break: 1, clutch: 1, stamina: 1.18,
  },
  {
    name: 'Smoke Eater Wilk', throws: 'L', signature: 'painter', tellTiming: 'none', zoneRate: 0.5,
    blurb: 'Walks into the inning nobody else will take.',
    arsenal: { slider: 0.45, curveball: 0.3, fastball: 0.25 }, putaway: 'slider', break: 1.053, clutch: 1.121, stamina: 1.08,
  },
  {
    name: 'Second Alarm Duda', throws: 'L', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.54,
    blurb: 'They only call him when the first crew is already inside.',
    arsenal: { fastball: 0.45, curveball: 0.32, changeup: 0.23 }, putaway: 'curveball', break: 0.997, clutch: 1.091, stamina: 1.08,
  },
];

/** ...and the three who finish it. */
const CHF_PEN: readonly Pitcher[] = [
  {
    name: 'THE EXTINGUISHER', throws: 'R', signature: 'fireball', tellTiming: 'none', zoneRate: 0.56, speedBonus: 9,
    blurb: 'Bases loaded, nobody out, and it is over in eleven pitches.',
    arsenal: { fastball: 0.7, slider: 0.3 }, putaway: 'fastball', break: 0.92, clutch: 1.22, stamina: 0.88,
  },
  {
    name: 'Ladder Truck Novak', throws: 'R', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.53,
    blurb: 'Slow to arrive and then it is over very quickly.',
    arsenal: { sinker: 0.6, slider: 0.4 }, putaway: 'slider', break: 0.967, clutch: 1.069, stamina: 0.82,
  },
  {
    name: 'THE HYDRANT', throws: 'R', signature: 'fireball', tellTiming: 'release', zoneRate: 0.52, speedBonus: 7,
    blurb: 'Squat, painted red, and there is no arguing with the pressure.',
    arsenal: { fastball: 0.6, sinker: 0.4 }, putaway: 'fastball', break: 1.029, clutch: 1.136, stamina: 0.7,
  },
];

/**
 * CHICAGO IVY — the oldest club in the league, and the only one whose outfield
 * wall is alive. Quick, loud, patient, and entirely unbothered by the fact that
 * it has not won anything since before anybody working there was born.
 *
 * ⚠️ THE OTHER HALF OF THE OLDEST ARGUMENT IS CINCINNATI, on purpose. They were
 * FIRST — the first club anybody ever paid — and Chicago has simply never
 * stopped. Both claims are true, neither club accepts the other one, and the
 * two of them meeting is the only fixture in the league with a grievance in it.
 */
const CHI: readonly Player[] = [
  { id: 'che1', name: 'Marquee Costanza', build: 'human', trait: 'showman', power: 1.028, contact: 1.227, vision: 1.165, clutch: 1.144, bunt: 1.26, speed: 1.38, bats: 'L',
    bio: 'Up in lights on the corner since before the lights worked.' },
  { id: 'che2', name: 'Addison Pruitt', build: 'human', trait: 'reader', power: 1.072, contact: 1.205, vision: 1.188, clutch: 1.111, bunt: 1.16, speed: 1.24, bats: 'R',
    bio: 'Knows every stop on the line and every pitcher on the circuit.' },
  { id: 'che3', name: 'Brick Wall Dombrowski', build: 'augmented', trait: 'slugger', power: 1.446, contact: 1.034, vision: 0.968, clutch: 1.155, bunt: 0.18, speed: 0.9, bats: 'R',
    bio: 'Ninety years of it, under the vine, and it has not moved an inch.' },
  { id: 'che4', name: 'Wrigley Nine-Ten', build: 'machine', trait: 'slugger', power: 1.391, contact: 1.056, vision: 0.995, clutch: 1.188, bunt: 0.24, speed: 0.85, bats: 'L',
    bio: 'Older than the scoreboard and cheaper to maintain.' },
  { id: 'che5', name: 'Rooftop Marchetti', build: 'human', trait: 'showman', power: 1.27, contact: 1.122, vision: 1.044, clutch: 1.21, bunt: 0.74, speed: 1.05, bats: 'L',
    bio: 'Plays to the buildings across the street. They pay for the privilege.' },
  { id: 'che6', name: 'Hand-Turned Ochoa', build: 'human', trait: 'grit', power: 1.05, contact: 1.188, vision: 1.143, clutch: 1.166, bunt: 1.3, speed: 1.2, bats: 'R',
    bio: 'Somebody still turns that scoreboard by hand. It is him, between innings.' },
  { id: 'che7', name: 'Groundskeeper Ivers', build: 'augmented', trait: 'precision', power: 1.171, contact: 1.133, vision: 1.089, clutch: 1.089, bunt: 0.8, speed: 1.16, bats: 'R',
    bio: 'Tends the wall. Will tell you which parts of it are older than the club.' },
  { id: 'che8', name: 'Gale Off The Lake', build: 'machine', trait: 'reader', power: 1.226, contact: 1.111, vision: 1.121, clutch: 1.122, bunt: 0.7, speed: 1.0, bats: 'L',
    bio: 'Arrives without warning and rearranges the outfield.' },
  { id: 'che9', name: 'Ivy Kowalczyk', build: 'human', trait: 'grit', power: 1.105, contact: 1.155, vision: 1.127, clutch: 1.243, bunt: 1.12, speed: 1.02, bats: 'R',
    bio: 'Grows on the wall. Has swallowed two live balls and one glove.' },
];

const CHI_ARMS: readonly Pitcher[] = [
  {
    name: 'Clark Street Fennimore', throws: 'L', signature: 'junk', tellTiming: 'release', zoneRate: 0.55,
    blurb: 'Twelve pitches, none of them fast, all of them somewhere else.',
    arsenal: { curveball: 0.35, changeup: 0.35, slider: 0.3 }, putaway: 'changeup', break: 1.11, clutch: 1.05, stamina: 1.11,
  },
  {
    name: 'Daylight Nunziato', throws: 'R', signature: 'none', tellTiming: 'none', zoneRate: 0.58, speedBonus: 4,
    blurb: 'Sixty years of afternoons. Has never once pitched under a light.',
    arsenal: { fastball: 0.25, sinker: 0.41, curveball: 0.34 }, putaway: 'curveball', break: 1.094, clutch: 1.08, stamina: 1.12,
  },
  {
    name: 'Bleacher Wind Aldridge', throws: 'R', signature: 'painter', tellTiming: 'pre_pitch', zoneRate: 0.54,
    blurb: 'Pitches to the flags. On a day they blow in he is unhittable.',
    arsenal: { curveball: 0.45, slider: 0.32, changeup: 0.23 }, putaway: 'slider', break: 1.106, clutch: 1.062, stamina: 1.08,
  },
];

/** ...and the three who finish it. */
const CHI_PEN: readonly Pitcher[] = [
  {
    name: 'Sundown Bhatt', throws: 'R', signature: 'painter', tellTiming: 'none', zoneRate: 0.5, speedBonus: 4,
    blurb: 'When the sun goes, the game goes. He is what happens first.',
    arsenal: { slider: 0.4, fastball: 0.35, changeup: 0.25 }, putaway: 'slider', break: 1.09, clutch: 1.12, stamina: 0.94,
  },
  {
    name: 'Ivy Vine Kaminski', throws: 'L', signature: 'junk', tellTiming: 'pre_pitch', zoneRate: 0.53,
    blurb: 'Gets into everything and takes a hundred years to get out.',
    arsenal: { curveball: 0.6, changeup: 0.4 }, putaway: 'curveball', break: 1.072, clutch: 1.04, stamina: 0.82,
  },
  {
    name: 'Seventh Inning Braun', throws: 'R', signature: 'none', tellTiming: 'release', zoneRate: 0.52,
    blurb: 'Comes in to singing and does not appear to notice it.',
    arsenal: { fastball: 0.6, slider: 0.4 }, putaway: 'slider', break: 1.14, clutch: 1.105, stamina: 0.7,
  },
];

/**
 * NEW YORK VETS — the other New York, and the one that signs everybody else's
 * thirty-six-year-olds. The best eyes and the coldest nerve in the league on
 * nine men who cannot run, cannot stay healthy, and have all been let go once.
 */
const NYV: readonly Player[] = [
  { id: 'nyv1', name: 'Marv "Two Knees" Gagliardo', build: 'human', trait: 'reader', power: 0.82, contact: 1.18, vision: 1.24, clutch: 1.27, bunt: 1.3, speed: 0.88, bats: 'L',
    bio: 'Nineteenth season. Walks to first like the distance is negotiable.' },
  { id: 'nyv2', name: 'The Perfessor', build: 'human', trait: 'reader', power: 0.86, contact: 1.16, vision: 1.26, clutch: 1.19, bunt: 1.24, speed: 0.82, bats: 'R',
    bio: 'Talks the entire at-bat. Some of it is to the pitcher, some to nobody.' },
  { id: 'nyv3', name: 'Big Sal Dandridge', build: 'human', trait: 'slugger', power: 1.38, contact: 0.94, vision: 0.96, clutch: 1.25, bunt: 0.38, speed: 0.7, bats: 'R',
    bio: 'Led a league in home runs once. Will not say which league or when.' },
  { id: 'nyv4', name: 'Cortisone Pete', build: 'augmented', trait: 'slugger', power: 1.32, contact: 0.9, vision: 0.92, clutch: 1.21, bunt: 0.34, speed: 0.66, bats: 'L',
    bio: 'Held together chemically and available every single day regardless.' },
  { id: 'nyv5', name: 'Shea Kowalski', build: 'human', trait: 'grit', power: 0.96, contact: 1.1, vision: 1.16, clutch: 1.29, bunt: 1.12, speed: 0.8, bats: 'R',
    bio: 'Grew up in the parking lot of a stadium they knocked down.' },
  { id: 'nyv6', name: 'Flushing Ray Mundy', build: 'human', trait: 'precision', power: 0.9, contact: 1.12, vision: 1.2, clutch: 1.15, bunt: 1.18, speed: 0.85, bats: 'L',
    bio: 'Out by the bay, under the flight path, and never once distracted.' },
  { id: 'nyv7', name: 'Last Contract Lomax', build: 'human', trait: 'grit', power: 1.04, contact: 1.04, vision: 1.1, clutch: 1.23, bunt: 0.96, speed: 0.75, bats: 'R',
    bio: 'Playing it out. Everybody knows, including him, and it has helped.' },
  { id: 'nyv8', name: 'Waiver Wire Ferraro', build: 'human', trait: 'reader', power: 0.88, contact: 1.06, vision: 1.18, clutch: 1.11, bunt: 1.1, speed: 0.9, bats: 'R',
    bio: 'Four clubs in five years and hitting better at every stop.' },
  { id: 'nyv9', name: 'Amazin Grace Petrosino', build: 'augmented', trait: 'showman', power: 1.2, contact: 0.96, vision: 0.98, clutch: 1.33, bunt: 0.42, speed: 0.78, bats: 'L',
    bio: 'One October, a long time ago, she was the best player alive.' },
];

const NYV_ARMS: readonly Pitcher[] = [
  {
    name: 'Doc Renner', throws: 'R', signature: 'junk', tellTiming: 'release', zoneRate: 0.57,
    blurb: 'Nothing left but the plan, and the plan is usually enough.',
    arsenal: { changeup: 0.38, curveball: 0.34, sinker: 0.28 }, putaway: 'changeup', break: 1, clutch: 1.08, stamina: 1.12,
  },
  {
    name: 'One More Year Vitali', throws: 'L', signature: 'none', tellTiming: 'release', zoneRate: 0.54,
    blurb: 'Retires every winter and unretires by February.',
    arsenal: { curveball: 0.44, fastball: 0.25, changeup: 0.31 }, putaway: 'curveball', break: 0.949, clutch: 1.021, stamina: 1.05,
  },
  {
    name: 'Comeback Attempt Dolan', throws: 'R', signature: 'painter', tellTiming: 'pre_pitch', zoneRate: 0.53,
    blurb: 'Third one. The first two went fine, which is the problem.',
    arsenal: { curveball: 0.45, changeup: 0.32, sinker: 0.23 }, putaway: 'curveball', break: 0.984, clutch: 1.052, stamina: 1.08,
  },
];

/** ...and the three who finish it. */
const NYV_PEN: readonly Pitcher[] = [
  {
    name: 'Old Man Bracco', throws: 'R', signature: 'painter', tellTiming: 'release', zoneRate: 0.48,
    blurb: 'Eighty-three on the gun and nobody squares him up anyway.',
    arsenal: { slider: 0.42, changeup: 0.33, curveball: 0.25 }, putaway: 'slider', break: 0.98, clutch: 1.12, stamina: 0.8,
  },
  {
    name: 'Pension Plan Wysocki', throws: 'L', signature: 'junk', tellTiming: 'pre_pitch', zoneRate: 0.52,
    blurb: 'Twelve more appearances and it vests. He is counting out loud.',
    arsenal: { changeup: 0.6, curveball: 0.4 }, putaway: 'changeup', break: 0.954, clutch: 1.031, stamina: 0.82,
  },
  {
    name: 'One Last Save Ruggiero', throws: 'R', signature: 'none', tellTiming: 'release', zoneRate: 0.51,
    blurb: 'Has retired four times. The club keeps the locker made up.',
    arsenal: { fastball: 0.6, slider: 0.4 }, putaway: 'slider', break: 1.015, clutch: 1.095, stamina: 0.7,
  },
];


/**
 * PHILADELPHIA IRONSIDES — plate armour and a grudge. The heaviest bats outside
 * Chicago and not one man on the roster who can run.
 */
const PHI: readonly Player[] = [
  { id: 'phi1', name: 'Cobbled Street Boyle', build: 'human', trait: 'grit', power: 1.039, contact: 1.188, vision: 1.143, clutch: 1.155, bunt: 1.2, speed: 1.02, bats: 'L',
    bio: 'Boos his own club from the on-deck circle. They consider it support.' },
  { id: 'phi2', name: 'Rittenhouse Ferro', build: 'human', trait: 'reader', power: 1.094, contact: 1.177, vision: 1.165, clutch: 1.111, bunt: 1.08, speed: 0.95, bats: 'R',
    bio: 'Studied the game properly. Nobody in the park lets him forget it.' },
  { id: 'phi3', name: 'BROADSIDE', build: 'machine', trait: 'slugger', power: 1.512, contact: 1.001, vision: 0.946, clutch: 1.144, bunt: 0.12, speed: 0.6, bats: 'R',
    bio: 'Fires everything at once or not at all.' },
  { id: 'phi4', name: 'Casemate Dziedzic', build: 'machine', trait: 'slugger', power: 1.435, contact: 1.012, vision: 0.968, clutch: 1.177, bunt: 0.16, speed: 0.62, bats: 'L',
    bio: 'Two inches of face plate and a very small window to hit through.' },
  { id: 'phi5', name: 'Frankford Nunn', build: 'human', trait: 'slugger', power: 1.303, contact: 1.078, vision: 1.012, clutch: 1.199, bunt: 0.4, speed: 0.78, bats: 'R',
    bio: 'Takes the long way around the bases and takes his time doing it.' },
  { id: 'phi6', name: 'Rivet Line Sczepanski', build: 'machine', trait: 'precision', power: 1.182, contact: 1.133, vision: 1.099, clutch: 1.1, bunt: 0.76, speed: 0.8, bats: 'R',
    bio: 'Same swing, ten thousand times, no complaint on record.' },
  { id: 'phi7', name: 'Shipyard Colavito', build: 'augmented', trait: 'grit', power: 1.226, contact: 1.1, vision: 1.044, clutch: 1.166, bunt: 0.68, speed: 0.85, bats: 'R',
    bio: 'Welded back together twice and hits better after each one.' },
  { id: 'phi8', name: 'Delaware Grey', build: 'human', trait: 'grit', power: 1.072, contact: 1.144, vision: 1.111, clutch: 1.21, bunt: 1.14, speed: 0.9, bats: 'L',
    bio: 'Cold, brown and moving faster than it looks.' },
  { id: 'phi9', name: 'Powder Room Kelleher', build: 'augmented', trait: 'showman', power: 1.336, contact: 1.023, vision: 0.979, clutch: 1.133, bunt: 0.3, speed: 0.75, bats: 'R',
    bio: 'Everything he does is loud and most of it lands short.' },
];

const PHI_ARMS: readonly Pitcher[] = [
  {
    name: 'Ordnance Mahaffey', throws: 'R', signature: 'painter', tellTiming: 'release', zoneRate: 0.5, speedBonus: 2,
    blurb: 'Sights it, ranges it, and puts it exactly on the corner.',
    arsenal: { fastball: 0.35, slider: 0.35, changeup: 0.3 }, putaway: 'slider', break: 1.11, clutch: 1.06, stamina: 1.12,
  },
  {
    name: 'Boiler Plate Sullivan', throws: 'L', signature: 'junk', tellTiming: 'release', zoneRate: 0.55,
    blurb: 'Nothing over eighty-four and nothing hit hard either.',
    arsenal: { changeup: 0.4, curveball: 0.35, fastball: 0.25 }, putaway: 'changeup', break: 1.116, clutch: 1.04, stamina: 1.13,
  },
  {
    name: 'Rivet Gun Mazzeo', throws: 'R', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.52,
    blurb: 'Ninety a minute and your teeth are still going at midnight.',
    arsenal: { fastball: 0.45, sinker: 0.32, slider: 0.23 }, putaway: 'sinker', break: 1.092, clutch: 1.036, stamina: 1.08,
  },
];

/** ...and the three who finish it. */
const PHI_PEN: readonly Pitcher[] = [
  {
    name: 'Keel Haul Novotny', throws: 'R', signature: 'none', tellTiming: 'none', zoneRate: 0.52, speedBonus: 6,
    blurb: 'Drags you the length of the at-bat and lets go at the end.',
    arsenal: { fastball: 0.5, slider: 0.3, sinker: 0.2 }, putaway: 'slider', break: 1.03, clutch: 1.07, stamina: 0.92,
  },
  {
    name: 'Casemate Brogan', throws: 'L', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.51,
    blurb: 'Fires through a slot in four feet of iron. Good luck.',
    arsenal: { curveball: 0.6, changeup: 0.4 }, putaway: 'curveball', break: 1.059, clutch: 1.014, stamina: 0.82,
  },
  {
    name: 'Broadside Kilcoyne', throws: 'R', signature: 'fireball', tellTiming: 'release', zoneRate: 0.5, speedBonus: 7,
    blurb: 'Everything at once, one time, and then it is quiet.',
    arsenal: { fastball: 0.6, slider: 0.4 }, putaway: 'fastball', break: 1.127, clutch: 1.078, stamina: 0.7,
  },
];

/**
 * SAN FRANCISCO FOGHORNS — you hear them long before you see anything. The best
 * staff in the league and a lineup that scratches out three and holds on.
 */
const SFO: readonly Player[] = [
  { id: 'sfo1', name: 'Bayside Ocampo', build: 'human', trait: 'reader', power: 0.962, contact: 1.232, vision: 1.199, clutch: 1.166, bunt: 1.3, speed: 1.3, bats: 'L',
    bio: 'Sees the pitch a half-second before the fog does.' },
  { id: 'sfo2', name: 'Marine Layer Quan', build: 'human', trait: 'grit', power: 0.995, contact: 1.21, vision: 1.177, clutch: 1.177, bunt: 1.26, speed: 1.2, bats: 'R',
    bio: 'Rolls in low, sits all night, burns off around the seventh.' },
  { id: 'sfo3', name: 'Cable Car Ferreira', build: 'human', trait: 'slugger', power: 1.314, contact: 1.078, vision: 1.012, clutch: 1.188, bunt: 0.42, speed: 0.9, bats: 'R',
    bio: 'Grinds uphill all game and comes down on you in the ninth.' },
  { id: 'sfo4', name: 'Dogwatch Ibarra', build: 'augmented', trait: 'slugger', power: 1.347, contact: 1.034, vision: 0.989, clutch: 1.144, bunt: 0.26, speed: 0.85, bats: 'L',
    bio: 'Works the hours nobody wants and hits like it is nine in the morning.' },
  { id: 'sfo5', name: 'Presidio Stackhouse', build: 'human', trait: 'precision', power: 1.116, contact: 1.166, vision: 1.133, clutch: 1.133, bunt: 0.9, speed: 1.05, bats: 'L',
    bio: 'Old garrison, still standing, entirely ceremonial until it is not.' },
  { id: 'sfo6', name: 'Gull', build: 'machine', trait: 'showman', power: 1.16, contact: 1.122, vision: 1.078, clutch: 1.199, bunt: 0.72, speed: 1.24, bats: 'R',
    bio: 'Takes what is left on the seats and dares anybody to say anything.' },
  { id: 'sfo7', name: 'Tule Fog Barrientos', build: 'human', trait: 'reader', power: 1.028, contact: 1.188, vision: 1.188, clutch: 1.122, bunt: 1.16, speed: 1.08, bats: 'R',
    bio: 'You lose sight of him for an inning and he is on third.' },
  { id: 'sfo8', name: 'Sourdough Pell', build: 'human', trait: 'grit', power: 1.006, contact: 1.155, vision: 1.121, clutch: 1.221, bunt: 1.22, speed: 0.95, bats: 'L',
    bio: 'Started in a kitchen. Still shows up covered in flour.' },
  { id: 'sfo9', name: 'Foghorn Amadi', build: 'machine', trait: 'slugger', power: 1.292, contact: 1.045, vision: 0.989, clutch: 1.155, bunt: 0.3, speed: 0.88, bats: 'R',
    bio: 'One note, twice a minute, and you feel it in the seats.' },
];

const SFO_ARMS: readonly Pitcher[] = [
  {
    name: 'Golden Gate Achebe', throws: 'L', signature: 'painter', tellTiming: 'none', zoneRate: 0.5, speedBonus: 2,
    blurb: 'Long, orange and nobody gets across without paying.',
    arsenal: { slider: 0.35, curveball: 0.3, changeup: 0.2, fastball: 0.15 }, putaway: 'curveball', break: 1.17, clutch: 1.09, stamina: 1.14,
  },
  {
    name: 'Harbor Pilot Osei', throws: 'R', signature: 'junk', tellTiming: 'none', zoneRate: 0.54,
    blurb: 'Steers the whole night from the mound and never touches the wheel twice.',
    arsenal: { changeup: 0.4, slider: 0.35, sinker: 0.25 }, putaway: 'changeup', break: 1.156, clutch: 1.07, stamina: 1.14,
  },
  {
    name: 'Cable Car Quintero', throws: 'R', signature: 'painter', tellTiming: 'pre_pitch', zoneRate: 0.53,
    blurb: 'Slow, loud, and hauled up the hill by something you cannot see.',
    arsenal: { curveball: 0.45, changeup: 0.32, slider: 0.23 }, putaway: 'curveball', break: 1.143, clutch: 1.068, stamina: 1.08,
  },
];

/** ...and the three who finish it. */
const SFO_PEN: readonly Pitcher[] = [
  {
    name: 'Bar Pilot Nyland', throws: 'R', signature: 'none', tellTiming: 'none', zoneRate: 0.56, speedBonus: 5,
    blurb: 'Comes on for the last mile, which is the only dangerous one.',
    arsenal: { fastball: 0.5, slider: 0.35, curveball: 0.15 }, putaway: 'slider', break: 1.08, clutch: 1.11, stamina: 0.93,
  },
  {
    name: 'Sea Lion Marsh', throws: 'L', signature: 'junk', tellTiming: 'pre_pitch', zoneRate: 0.52,
    blurb: 'Took the pier in 1989 and has never given it back.',
    arsenal: { slider: 0.6, changeup: 0.4 }, putaway: 'slider', break: 1.109, clutch: 1.046, stamina: 0.82,
  },
  {
    name: 'Point Bonita Ferreira', throws: 'R', signature: 'none', tellTiming: 'release', zoneRate: 0.51,
    blurb: 'Last light before the open ocean. Miss it and you are gone.',
    arsenal: { fastball: 0.6, slider: 0.4 }, putaway: 'slider', break: 1.179, clutch: 1.112, stamina: 0.7,
  },
];

/**
 * ST. LOUIS FERRYMEN — everybody crosses eventually and they set the fare. The
 * most patient club in the league and the least interested in your hurry.
 */
const STL: readonly Player[] = [
  { id: 'stl1', name: 'Levee Boudreaux', build: 'human', trait: 'grit', power: 1.017, contact: 1.21, vision: 1.165, clutch: 1.177, bunt: 1.28, speed: 1.18, bats: 'L',
    bio: 'Holds the water back all season and nobody sends him a thank-you.' },
  { id: 'stl2', name: 'Eads Kaminski', build: 'human', trait: 'reader', power: 1.061, contact: 1.194, vision: 1.182, clutch: 1.133, bunt: 1.12, speed: 1.1, bats: 'R',
    bio: 'Built the crossing everyone said would fall down. It did not.' },
  { id: 'stl3', name: 'Deckhand Poteet', build: 'machine', trait: 'slugger', power: 1.413, contact: 1.023, vision: 0.957, clutch: 1.166, bunt: 0.16, speed: 0.72, bats: 'R',
    bio: 'Lifts what four men would rather not.' },
  { id: 'stl4', name: 'Slackwater Cruz', build: 'augmented', trait: 'slugger', power: 1.358, contact: 1.034, vision: 0.979, clutch: 1.155, bunt: 0.24, speed: 0.8, bats: 'L',
    bio: 'Still, wide and deeper than the crew tells passengers.' },
  { id: 'stl5', name: 'Toll Booth Rachford', build: 'human', trait: 'precision', power: 1.149, contact: 1.155, vision: 1.121, clutch: 1.144, bunt: 0.88, speed: 0.95, bats: 'R',
    bio: 'Everybody pays. Nobody enjoys the transaction.' },
  { id: 'stl6', name: 'Chouteau Vance', build: 'human', trait: 'showman', power: 1.204, contact: 1.122, vision: 1.056, clutch: 1.21, bunt: 0.66, speed: 1.0, bats: 'L',
    bio: 'Old fur money, new batting gloves, same opinion of himself.' },
  { id: 'stl7', name: 'Mud Island Fesler', build: 'human', trait: 'grit', power: 1.072, contact: 1.166, vision: 1.133, clutch: 1.188, bunt: 1.1, speed: 1.02, bats: 'R',
    bio: 'Comes and goes with the river and hits the same either way.' },
  { id: 'stl8', name: 'Sternwheel Ojeda', build: 'machine', trait: 'grit', power: 1.127, contact: 1.133, vision: 1.099, clutch: 1.122, bunt: 0.94, speed: 0.86, bats: 'R',
    bio: 'Slow to start, impossible to stop, loud the entire way.' },
  { id: 'stl9', name: 'Undertow Salas', build: 'augmented', trait: 'slugger', power: 1.281, contact: 1.045, vision: 0.989, clutch: 1.111, bunt: 0.34, speed: 0.82, bats: 'L',
    bio: 'Nothing on the surface and everything underneath it.' },
];

const STL_ARMS: readonly Pitcher[] = [
  {
    name: 'Slow Ferry Dabrowski', throws: 'L', signature: 'junk', tellTiming: 'release', zoneRate: 0.56,
    blurb: 'You will get there. You will not enjoy the trip.',
    arsenal: { changeup: 0.4, curveball: 0.32, sinker: 0.28 }, putaway: 'changeup', break: 1.07, clutch: 1.05, stamina: 1.1,
  },
  {
    name: 'Ice Jam Prewett', throws: 'R', signature: 'none', tellTiming: 'release', zoneRate: 0.55, speedBonus: 3,
    blurb: 'Backs up the whole river for an inning at a time.',
    arsenal: { sinker: 0.45, slider: 0.3, fastball: 0.25 }, putaway: 'sinker', break: 1.074, clutch: 1.03, stamina: 1.12,
  },
  {
    name: 'Slack Water Kovacic', throws: 'L', signature: 'painter', tellTiming: 'pre_pitch', zoneRate: 0.53,
    blurb: 'The hour the river forgets which way it is going.',
    arsenal: { sinker: 0.45, changeup: 0.32, curveball: 0.23 }, putaway: 'changeup', break: 1.075, clutch: 1.039, stamina: 1.08,
  },
];

/** ...and the three who finish it. */
const STL_PEN: readonly Pitcher[] = [
  {
    name: 'Last Boat Gennaro', throws: 'R', signature: 'painter', tellTiming: 'none', zoneRate: 0.48, speedBonus: 4,
    blurb: 'One crossing left and he is not waiting for you.',
    arsenal: { slider: 0.4, fastball: 0.35, changeup: 0.25 }, putaway: 'slider', break: 1.06, clutch: 1.1, stamina: 0.91,
  },
  {
    name: 'Toll Taker Rhys', throws: 'R', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.52,
    blurb: 'Sets the fare, takes the fare, does not discuss the fare.',
    arsenal: { curveball: 0.6, slider: 0.4 }, putaway: 'curveball', break: 1.043, clutch: 1.017, stamina: 0.82,
  },
  {
    name: 'Far Bank Sopko', throws: 'R', signature: 'none', tellTiming: 'release', zoneRate: 0.51,
    blurb: 'You can see it the whole way across. Getting there is the trouble.',
    arsenal: { fastball: 0.6, sinker: 0.4 }, putaway: 'sinker', break: 1.11, clutch: 1.081, stamina: 0.7,
  },
];

/**
 * CLEVELAND RIVETS — the club that never converted. Nine machines off the same
 * line, no legs anywhere, and a mistake pitch leaves the county.
 */
const CLE: readonly Player[] = [
  { id: 'cle1', name: 'Flats Wojcik', build: 'machine', trait: 'grit', power: 1.05, contact: 1.166, vision: 1.121, clutch: 1.089, bunt: 1.06, speed: 0.92, bats: 'L',
    bio: 'Built where the river caught fire. Unbothered by that fact.' },
  { id: 'cle2', name: 'Hot Rivet Palladino', build: 'machine', trait: 'grit', power: 1.105, contact: 1.155, vision: 1.111, clutch: 1.122, bunt: 1.0, speed: 0.88, bats: 'R',
    bio: 'Thrown, caught and driven home, four times a minute, forty years.' },
  { id: 'cle3', name: 'OPEN HEARTH', build: 'machine', trait: 'slugger', power: 1.479, contact: 0.99, vision: 0.934, clutch: 1.1, bunt: 0.14, speed: 0.6, bats: 'R',
    bio: 'Runs at two thousand degrees and has never been allowed indoors.' },
  { id: 'cle4', name: 'Slag Heap Yurchenko', build: 'machine', trait: 'slugger', power: 1.402, contact: 0.979, vision: 0.946, clutch: 1.067, bunt: 0.18, speed: 0.58, bats: 'L',
    bio: 'What is left over, stacked forty feet high and still dangerous.' },
  { id: 'cle5', name: 'Terminal Tower', build: 'machine', trait: 'slugger', power: 1.358, contact: 1.012, vision: 0.968, clutch: 1.111, bunt: 0.2, speed: 0.65, bats: 'R',
    bio: 'Tallest thing for four hundred miles and knows it.' },
  { id: 'cle6', name: 'Pig Iron Skala', build: 'machine', trait: 'precision', power: 1.237, contact: 1.078, vision: 1.034, clutch: 1.045, bunt: 0.6, speed: 0.75, bats: 'R',
    bio: 'Crude, cheap and in absolutely everything the league is built from.' },
  { id: 'cle7', name: 'Bessemer Nixon', build: 'machine', trait: 'grit', power: 1.171, contact: 1.111, vision: 1.078, clutch: 1.133, bunt: 0.88, speed: 0.8, bats: 'L',
    bio: 'Blows the impurities out in one loud, terrifying pass.' },
  { id: 'cle8', name: 'Erie Fog Bank', build: 'augmented', trait: 'reader', power: 1.094, contact: 1.122, vision: 1.133, clutch: 1.078, bunt: 0.82, speed: 0.9, bats: 'R',
    bio: 'Comes off the water in November and ruins three straight games.' },
  { id: 'cle9', name: 'Drop Forge Kucera', build: 'machine', trait: 'slugger', power: 1.314, contact: 1.001, vision: 0.957, clutch: 1.056, bunt: 0.22, speed: 0.62, bats: 'R',
    bio: 'One swing per plate appearance. It is all he was rated for.' },
];

const CLE_ARMS: readonly Pitcher[] = [
  {
    name: 'Coke Oven Bialas', throws: 'R', signature: 'junk', tellTiming: 'release', zoneRate: 0.54, speedBonus: 2,
    blurb: 'Burns for eighteen hours and finishes filthy.',
    arsenal: { sinker: 0.4, slider: 0.35, changeup: 0.25 }, putaway: 'slider', break: 1.07, clutch: 1, stamina: 1.09,
  },
  {
    name: 'Cuyahoga Voss', throws: 'L', signature: 'none', tellTiming: 'release', zoneRate: 0.52, speedBonus: 3,
    blurb: 'Bends six times before it gets anywhere near the lake.',
    arsenal: { curveball: 0.46, fastball: 0.25, changeup: 0.29 }, putaway: 'curveball', break: 1.085, clutch: 1.021, stamina: 1.1,
  },
  {
    name: 'Hot Rivet Marek', throws: 'R', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.52,
    blurb: 'Thrown glowing across a gap and caught in a bucket. Every time.',
    arsenal: { fastball: 0.45, slider: 0.32, sinker: 0.23 }, putaway: 'slider', break: 1.062, clutch: 1.006, stamina: 1.08,
  },
];

/** ...and the three who finish it. */
const CLE_PEN: readonly Pitcher[] = [
  {
    name: 'Night Pour Radich', throws: 'R', signature: 'fireball', tellTiming: 'none', zoneRate: 0.5, speedBonus: 7,
    blurb: 'The whole sky goes orange and then the inning is over.',
    arsenal: { fastball: 0.68, slider: 0.32 }, putaway: 'fastball', break: 1.01, clutch: 1.06, stamina: 0.9,
  },
  {
    name: 'Bucket Boy Sladek', throws: 'L', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.51,
    blurb: 'Catches what the last man threw and never drops one.',
    arsenal: { curveball: 0.6, changeup: 0.4 }, putaway: 'curveball', break: 1.03, clutch: 0.985, stamina: 0.82,
  },
  {
    name: 'COLD SHUT', throws: 'R', signature: 'fireball', tellTiming: 'release', zoneRate: 0.5, speedBonus: 7,
    blurb: 'A seam where two pours did not take. Nothing gets through it.',
    arsenal: { fastball: 0.6, slider: 0.4 }, putaway: 'fastball', break: 1.095, clutch: 1.047, stamina: 0.7,
  },
];

/**
 * MINNEAPOLIS MILLERS — flour, ice and patience. Nine men who foul off
 * everything until somebody makes a mistake, and no power to punish it with.
 */
const MIN: readonly Player[] = [
  { id: 'min1', name: 'Washburn Aho', build: 'human', trait: 'grit', power: 0.973, contact: 1.221, vision: 1.177, clutch: 1.155, bunt: 1.32, speed: 1.24, bats: 'L',
    bio: 'Grinds it fine. Takes all night and gets there.' },
  { id: 'min2', name: 'St. Anthony Lindqvist', build: 'human', trait: 'reader', power: 1.006, contact: 1.21, vision: 1.188, clutch: 1.122, bunt: 1.24, speed: 1.16, bats: 'R',
    bio: 'Named for the falls that ran the whole city. Runs the whole lineup.' },
  { id: 'min3', name: 'Grain Elevator Sorenson', build: 'machine', trait: 'slugger', power: 1.38, contact: 1.023, vision: 0.968, clutch: 1.1, bunt: 0.18, speed: 0.68, bats: 'R',
    bio: 'Takes it up and holds it there until somebody asks for it.' },
  { id: 'min4', name: 'Bran Halvorsen', build: 'human', trait: 'slugger', power: 1.259, contact: 1.067, vision: 1, clutch: 1.133, bunt: 0.44, speed: 0.85, bats: 'L',
    bio: 'Good for you and nobody is happy about it.' },
  { id: 'min5', name: 'Hard Freeze Ndiaye', build: 'human', trait: 'grit', power: 1.072, contact: 1.177, vision: 1.143, clutch: 1.188, bunt: 1.14, speed: 1.05, bats: 'R',
    bio: 'Plays six months a year in weather nobody else will stand in.' },
  { id: 'min6', name: 'Millrace Tvedt', build: 'human', trait: 'precision', power: 1.039, contact: 1.188, vision: 1.155, clutch: 1.111, bunt: 1.06, speed: 1.0, bats: 'L',
    bio: 'Same channel, same speed, every single night of the year.' },
  { id: 'min7', name: 'Nokomis Fairbanks', build: 'augmented', trait: 'reader', power: 1.127, contact: 1.133, vision: 1.133, clutch: 1.089, bunt: 0.84, speed: 1.12, bats: 'R',
    bio: 'Quiet, frozen half the year, and deeper than the map says.' },
  { id: 'min8', name: 'Dust Explosion Kirk', build: 'augmented', trait: 'slugger', power: 1.303, contact: 1.012, vision: 0.968, clutch: 1.067, bunt: 0.3, speed: 0.82, bats: 'R',
    bio: 'Nothing for an hour, and then the roof is somewhere else.' },
  { id: 'min9', name: 'Sifter Bergstrom', build: 'human', trait: 'grit', power: 1.017, contact: 1.155, vision: 1.121, clutch: 1.166, bunt: 1.2, speed: 0.95, bats: 'L',
    bio: 'Everything goes through him twice before anybody is satisfied.' },
];

const MIN_ARMS: readonly Pitcher[] = [
  {
    name: 'Whiteout Lundeen', throws: 'R', signature: 'junk', tellTiming: 'release', zoneRate: 0.55,
    blurb: 'You know it is coming. You cannot see any of it.',
    arsenal: { curveball: 0.38, changeup: 0.34, sinker: 0.28 }, putaway: 'curveball', break: 1.06, clutch: 1.02, stamina: 1.08,
  },
  {
    name: 'Millstone Ryba', throws: 'R', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.58,
    blurb: 'Turns all night at exactly one speed.',
    arsenal: { sinker: 0.48, fastball: 0.25, slider: 0.27 }, putaway: 'sinker', break: 1.032, clutch: 1.01, stamina: 1.18,
  },
  {
    name: 'Flour Dust Lindgren', throws: 'R', signature: 'painter', tellTiming: 'pre_pitch', zoneRate: 0.54,
    blurb: 'Hangs in the air all night. One spark and the mill is gone.',
    arsenal: { curveball: 0.45, changeup: 0.32, sinker: 0.23 }, putaway: 'curveball', break: 1.052, clutch: 1.013, stamina: 1.08,
  },
];

/** ...and the three who finish it. */
const MIN_PEN: readonly Pitcher[] = [
  {
    name: 'Ten Below Vasquez', throws: 'L', signature: 'painter', tellTiming: 'release', zoneRate: 0.48, speedBonus: 3,
    blurb: 'Nothing over the plate and nobody wants to be out there anyway.',
    arsenal: { slider: 0.42, changeup: 0.33, fastball: 0.25 }, putaway: 'slider', break: 1.04, clutch: 1.07, stamina: 0.92,
  },
  {
    name: 'Ice House Anders', throws: 'L', signature: 'junk', tellTiming: 'pre_pitch', zoneRate: 0.53,
    blurb: 'Cut it in January, sell it in July, tell nobody how.',
    arsenal: { changeup: 0.6, curveball: 0.4 }, putaway: 'changeup', break: 1.02, clutch: 0.992, stamina: 0.82,
  },
  {
    name: 'Twenty Below Halvorsen', throws: 'R', signature: 'none', tellTiming: 'release', zoneRate: 0.52,
    blurb: 'Considers it bracing. Has said so to reporters, in it, in shirtsleeves.',
    arsenal: { fastball: 0.6, slider: 0.4 }, putaway: 'slider', break: 1.085, clutch: 1.054, stamina: 0.7,
  },
];

/**
 * BALTIMORE CRABBERS — the club nobody wants on the schedule. All legs, all
 * nerve, the smallest bats in the league, and a way of playing that is entirely
 * within the rules and makes everybody furious: foul off nine pitches, bunt for
 * a hit, take the extra base, win 3-2 in front of nobody.
 */
const BAL: readonly Player[] = [
  { id: 'bal1', name: 'Sook Delaney', build: 'human', trait: 'showman', power: 0.918, contact: 1.221, vision: 1.177, clutch: 1.188, bunt: 1.34, speed: 1.42, bats: 'L',
    bio: 'Sideways, fast, and impossible to get hold of.' },
  { id: 'bal2', name: 'Trotline Feeny', build: 'human', trait: 'reader', power: 0.962, contact: 1.199, vision: 1.188, clutch: 1.144, bunt: 1.28, speed: 1.3, bats: 'R',
    bio: 'Sets it at four in the morning and hauls it in all day.' },
  { id: 'bal3', name: 'Jimmy Crab Pusateri', build: 'human', trait: 'slugger', power: 1.27, contact: 1.089, vision: 1.022, clutch: 1.166, bunt: 0.5, speed: 1.05, bats: 'R',
    bio: 'The big one at the bottom of the bushel. Still fighting.' },
  { id: 'bal4', name: 'Chesapeake Lorne', build: 'augmented', trait: 'slugger', power: 1.292, contact: 1.045, vision: 0.989, clutch: 1.122, bunt: 0.34, speed: 0.95, bats: 'L',
    bio: 'Wide, shallow and full of things that will hurt you.' },
  { id: 'bal5', name: 'Old Bay Sczerbiak', build: 'human', trait: 'grit', power: 1.039, contact: 1.177, vision: 1.133, clutch: 1.21, bunt: 1.16, speed: 1.15, bats: 'R',
    bio: 'On everything, whether anybody asked for it or not.' },
  { id: 'bal6', name: 'Skipjack Moten', build: 'human', trait: 'precision', power: 1.006, contact: 1.188, vision: 1.143, clutch: 1.111, bunt: 1.1, speed: 1.22, bats: 'L',
    bio: 'Last of the sailing fleet. Refuses an engine on principle.' },
  { id: 'bal7', name: 'Fells Point Amara', build: 'human', trait: 'reader', power: 1.05, contact: 1.166, vision: 1.165, clutch: 1.133, bunt: 1.08, speed: 1.18, bats: 'R',
    bio: 'Knows every dock, every bar and every umpire on the eastern seaboard.' },
  { id: 'bal8', name: 'Molting Season Pratt', build: 'human', trait: 'grit', power: 0.984, contact: 1.144, vision: 1.111, clutch: 1.199, bunt: 1.24, speed: 1.1, bats: 'L',
    bio: 'Soft for two weeks a year and hides the whole time.' },
  { id: 'bal9', name: 'Dredge Boat Kilcoyne', build: 'machine', trait: 'slugger', power: 1.237, contact: 1.056, vision: 1, clutch: 1.089, bunt: 0.38, speed: 0.9, bats: 'R',
    bio: 'Scrapes the bottom and comes up with something every time.' },
];

const BAL_ARMS: readonly Pitcher[] = [
  {
    name: 'Bay Squall Iyer', throws: 'L', signature: 'junk', tellTiming: 'release', zoneRate: 0.52,
    blurb: 'Twenty minutes of chaos and then it is over.',
    arsenal: { curveball: 0.4, changeup: 0.3, slider: 0.3 }, putaway: 'curveball', break: 1.05, clutch: 1.03, stamina: 1.05,
  },
  {
    name: 'Crab Pot Rickerts', throws: 'R', signature: 'none', tellTiming: 'release', zoneRate: 0.56,
    blurb: 'Easy to get into. That was never the hard part.',
    arsenal: { sinker: 0.47, fastball: 0.25, changeup: 0.28 }, putaway: 'sinker', break: 1.043, clutch: 1, stamina: 1.14,
  },
  {
    name: 'Steamed Hard Volkov', throws: 'R', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.53,
    blurb: 'Twenty minutes under the lid and everything comes apart clean.',
    arsenal: { fastball: 0.45, sinker: 0.32, slider: 0.23 }, putaway: 'sinker', break: 1.035, clutch: 1.006, stamina: 1.08,
  },
];

/** ...and the three who finish it. */
const BAL_PEN: readonly Pitcher[] = [
  {
    name: 'Nor easter Fawcett', throws: 'R', signature: 'fireball', tellTiming: 'release', zoneRate: 0.5, speedBonus: 6,
    blurb: 'Three days of warning and it still takes the roof off.',
    arsenal: { fastball: 0.66, slider: 0.34 }, putaway: 'fastball', break: 0.99, clutch: 1.05, stamina: 0.91,
  },
  {
    name: 'Bushel Basket Pryor', throws: 'L', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.52,
    blurb: 'Holds a great deal more than it looks like it should.',
    arsenal: { curveball: 0.6, changeup: 0.4 }, putaway: 'curveball', break: 1.004, clutch: 0.985, stamina: 0.82,
  },
  {
    name: 'Mallet Man Petrosian', throws: 'R', signature: 'fireball', tellTiming: 'release', zoneRate: 0.51, speedBonus: 7,
    blurb: 'One tool, one motion, and he has never needed a second.',
    arsenal: { fastball: 0.6, slider: 0.4 }, putaway: 'fastball', break: 1.068, clutch: 1.047, stamina: 0.7,
  },
];

/**
 * PITTSBURGH PUDDLERS — the men who stirred molten iron by hand until the mills
 * automated them out. Heavy, slow, and playing like they have something to
 * settle with everybody who replaced them.
 */
const PIT: readonly Player[] = [
  { id: 'pit1', name: 'Hunky Zawadzki', build: 'human', trait: 'grit', power: 1.028, contact: 1.188, vision: 1.143, clutch: 1.199, bunt: 1.24, speed: 1.0, bats: 'L',
    bio: 'Twelve-hour turn, seven days, and then a doubleheader.' },
  { id: 'pit2', name: 'Incline Bevacqua', build: 'human', trait: 'reader', power: 1.061, contact: 1.177, vision: 1.165, clutch: 1.155, bunt: 1.14, speed: 1.08, bats: 'R',
    bio: 'Goes up the hill and comes back down on somebody.' },
  { id: 'pit3', name: 'Puddling Bar Mazur', build: 'human', trait: 'slugger', power: 1.347, contact: 1.045, vision: 0.989, clutch: 1.177, bunt: 0.3, speed: 0.75, bats: 'R',
    bio: 'Stirred iron by hand for nine years. His wrists are the story.' },
  { id: 'pit4', name: 'Homestead Krall', build: 'machine', trait: 'slugger', power: 1.391, contact: 1.012, vision: 0.957, clutch: 1.144, bunt: 0.16, speed: 0.66, bats: 'L',
    bio: 'Remembers the strike. Was on the wrong side of it and says so.' },
  { id: 'pit5', name: 'Three Rivers Osifo', build: 'human', trait: 'precision', power: 1.127, contact: 1.144, vision: 1.111, clutch: 1.122, bunt: 0.9, speed: 0.98, bats: 'R',
    bio: 'Everything meets at him and leaves in one direction.' },
  { id: 'pit6', name: 'Coal Barge Tutko', build: 'machine', trait: 'grit', power: 1.204, contact: 1.089, vision: 1.056, clutch: 1.111, bunt: 0.86, speed: 0.7, bats: 'R',
    bio: 'Loaded to the waterline and never once late.' },
  { id: 'pit7', name: 'Bloomery Nance', build: 'augmented', trait: 'slugger', power: 1.259, contact: 1.034, vision: 0.989, clutch: 1.1, bunt: 0.34, speed: 0.8, bats: 'L',
    bio: 'Old process, obsolete on paper, still turns out iron.' },
  { id: 'pit8', name: 'Smoke Ordinance Duda', build: 'human', trait: 'grit', power: 1.05, contact: 1.155, vision: 1.121, clutch: 1.21, bunt: 1.12, speed: 0.92, bats: 'R',
    bio: 'They passed a law about him. He got worse.' },
  { id: 'pit9', name: 'Slag Ladle Prokop', build: 'machine', trait: 'slugger', power: 1.303, contact: 1.001, vision: 0.968, clutch: 1.078, bunt: 0.2, speed: 0.64, bats: 'R',
    bio: 'Tips once a shift. Everybody stands well back when he does.' },
];

const PIT_ARMS: readonly Pitcher[] = [
  {
    name: 'Blast Furnace Kobylka', throws: 'R', signature: 'none', tellTiming: 'release', zoneRate: 0.56, speedBonus: 5,
    blurb: 'Runs hot for eight innings and does not cool between them.',
    arsenal: { fastball: 0.45, sinker: 0.3, slider: 0.25 }, putaway: 'sinker', break: 1.03, clutch: 1.02, stamina: 1.11,
  },
  {
    name: 'Mon Wharf Cerny', throws: 'L', signature: 'junk', tellTiming: 'pre_pitch', zoneRate: 0.54,
    blurb: 'Floods twice a year and pitches through both.',
    arsenal: { changeup: 0.4, curveball: 0.35, fastball: 0.25 }, putaway: 'changeup', break: 1.053, clutch: 1, stamina: 1.12,
  },
  {
    name: 'Open Hearth Sokolowski', throws: 'R', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.53,
    blurb: 'Twelve hours in front of it and he says the winters are worse.',
    arsenal: { sinker: 0.45, slider: 0.32, fastball: 0.23 }, putaway: 'slider', break: 1.052, clutch: 1.013, stamina: 1.08,
  },
];

/** ...and the three who finish it. */
const PIT_PEN: readonly Pitcher[] = [
  {
    name: 'Tapper Yablonski', throws: 'R', signature: 'painter', tellTiming: 'release', zoneRate: 0.5, speedBonus: 3,
    blurb: 'Opens the hole, lets it run, closes it again. Ninth inning only.',
    arsenal: { slider: 0.4, sinker: 0.35, fastball: 0.25 }, putaway: 'slider', break: 1.05, clutch: 1.08, stamina: 0.89,
  },
  {
    name: 'Scrap Ladle Mihalik', throws: 'L', signature: 'junk', tellTiming: 'pre_pitch', zoneRate: 0.52,
    blurb: 'Whatever is left in the bottom, poured out on somebody.',
    arsenal: { changeup: 0.6, curveball: 0.4 }, putaway: 'changeup', break: 1.02, clutch: 0.992, stamina: 0.82,
  },
  {
    name: 'Last Pour Wysocki', throws: 'R', signature: 'none', tellTiming: 'release', zoneRate: 0.51,
    blurb: 'The heat goes off after this one. Make it count or do not.',
    arsenal: { fastball: 0.6, sinker: 0.4 }, putaway: 'fastball', break: 1.085, clutch: 1.054, stamina: 0.7,
  },
];


/**
 * MILWAUKEE COOPERS — barrel makers, and every one of them built like one. All
 * the power the tier allows and nothing else at all.
 */
const MIL: readonly Player[] = [
  { id: 'mil1', name: 'Stave Bender Reuss', build: 'human', trait: 'grit', power: 1.039, contact: 1.144, vision: 1.099, clutch: 1.078, bunt: 1.1, speed: 0.98, bats: 'L',
    bio: 'Bends oak for a living and considers a bat a small job.' },
  { id: 'mil2', name: 'Hoop Driver Falkner', build: 'human', trait: 'reader', power: 1.072, contact: 1.133, vision: 1.121, clutch: 1.056, bunt: 1.04, speed: 1.02, bats: 'R',
    bio: 'Six hits with a hammer and the whole thing holds for thirty years.' },
  { id: 'mil3', name: 'Bung Hole Vogel', build: 'machine', trait: 'slugger', power: 1.435, contact: 0.99, vision: 0.934, clutch: 1.045, bunt: 0.14, speed: 0.62, bats: 'R',
    bio: 'One small opening and everything comes out of it.' },
  { id: 'mil4', name: 'Sixty Gallon Grohl', build: 'machine', trait: 'slugger', power: 1.457, contact: 0.968, vision: 0.923, clutch: 1.012, bunt: 0.12, speed: 0.58, bats: 'L',
    bio: 'Full, and nobody has any idea how they get him on the bus.' },
  { id: 'mil5', name: 'Menomonee Strack', build: 'human', trait: 'slugger', power: 1.237, contact: 1.056, vision: 1, clutch: 1.089, bunt: 0.42, speed: 0.8, bats: 'R',
    bio: 'Valley kid. Still lives four blocks from where the river bends.' },
  { id: 'mil6', name: 'Cold Cellar Behnke', build: 'human', trait: 'precision', power: 1.105, contact: 1.122, vision: 1.089, clutch: 1.034, bunt: 0.86, speed: 0.9, bats: 'L',
    bio: 'Kept underground for six months and improved by it.' },
  { id: 'mil7', name: 'Char Level Three', build: 'machine', trait: 'grit', power: 1.193, contact: 1.067, vision: 1.034, clutch: 1.067, bunt: 0.7, speed: 0.72, bats: 'R',
    bio: 'Burnt on the inside on purpose. Says it improves the finish.' },
  { id: 'mil8', name: 'Draymen Kowalczyk', build: 'augmented', trait: 'grit', power: 1.149, contact: 1.089, vision: 1.044, clutch: 1.1, bunt: 0.8, speed: 0.85, bats: 'R',
    bio: 'Hauls it, stacks it, and then plays nine.' },
  { id: 'mil9', name: 'Tap Room Piotrowski', build: 'human', trait: 'showman', power: 1.215, contact: 1.034, vision: 0.989, clutch: 1.111, bunt: 0.44, speed: 0.88, bats: 'L',
    bio: 'Best in the league from the sixth inning on, in his own estimation.' },
];

const MIL_ARMS: readonly Pitcher[] = [
  {
    name: 'Cooperage Selig', throws: 'R', signature: 'junk', tellTiming: 'pre_pitch', zoneRate: 0.56,
    blurb: 'Round, slow and holds together far longer than it should.',
    arsenal: { sinker: 0.4, changeup: 0.35, curveball: 0.25 }, putaway: 'changeup', break: 1, clutch: 0.99, stamina: 1.07,
  },
  {
    name: 'Lager Cave Umbach', throws: 'L', signature: 'none', tellTiming: 'release', zoneRate: 0.54,
    blurb: 'Takes his time. Everything about him takes its time.',
    arsenal: { curveball: 0.46, fastball: 0.25, changeup: 0.29 }, putaway: 'curveball', break: 1.002, clutch: 0.98, stamina: 1.11,
  },
  {
    name: 'Stave Mill Gerhardt', throws: 'L', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.53,
    blurb: 'Cuts them all to the same curve without measuring once.',
    arsenal: { sinker: 0.45, slider: 0.32, changeup: 0.23 }, putaway: 'slider', break: 0.99, clutch: 0.977, stamina: 1.08,
  },
];

/** ...and the three who finish it. */
const MIL_PEN: readonly Pitcher[] = [
  {
    name: 'Last Call Wenzel', throws: 'R', signature: 'fireball', tellTiming: 'release', zoneRate: 0.5, speedBonus: 5,
    blurb: 'Everybody out, and quickly.',
    arsenal: { fastball: 0.68, slider: 0.32 }, putaway: 'fastball', break: 0.95, clutch: 1.02, stamina: 0.88,
  },
  {
    name: 'Hoop Iron Brauer', throws: 'R', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.52,
    blurb: 'Holds the whole barrel together and is the cheapest part of it.',
    arsenal: { fastball: 0.6, curveball: 0.4 }, putaway: 'curveball', break: 0.961, clutch: 0.957, stamina: 0.82,
  },
  {
    name: 'Bung Hammer Dietz', throws: 'R', signature: 'fireball', tellTiming: 'release', zoneRate: 0.51, speedBonus: 7,
    blurb: 'One swing, the barrel is sealed, and everybody goes home.',
    arsenal: { fastball: 0.6, sinker: 0.4 }, putaway: 'fastball', break: 1.022, clutch: 1.017, stamina: 0.7,
  },
];

/**
 * SEATTLE RAINMAKERS — the wettest park in the league and a club that has made
 * peace with it. Good gloves, patient bats, and no way to score in a hurry.
 */
const SEA: readonly Player[] = [
  { id: 'sea1', name: 'Sluiceway Tan', build: 'human', trait: 'reader', power: 0.951, contact: 1.188, vision: 1.165, clutch: 1.089, bunt: 1.26, speed: 1.26, bats: 'L',
    bio: 'Waits out the delay better than anybody in the sport.' },
  { id: 'sea2', name: 'Ballard Locks Ivey', build: 'machine', trait: 'grit', power: 1.017, contact: 1.155, vision: 1.111, clutch: 1.056, bunt: 1.12, speed: 1.04, bats: 'R',
    bio: 'One at a time, both directions, no exceptions made.' },
  { id: 'sea3', name: 'Timber Fall Mahoney', build: 'human', trait: 'slugger', power: 1.303, contact: 1.034, vision: 0.968, clutch: 1.078, bunt: 0.3, speed: 0.82, bats: 'R',
    bio: 'Shouts before he swings. Nobody has told him he does it.' },
  { id: 'sea4', name: 'Cascade Fog Ozuna', build: 'augmented', trait: 'slugger', power: 1.27, contact: 1.023, vision: 0.979, clutch: 1.034, bunt: 0.28, speed: 0.9, bats: 'L',
    bio: 'Sits in the valley all week and lifts on a Sunday.' },
  { id: 'sea5', name: 'Puget Kestrel', build: 'machine', trait: 'precision', power: 1.094, contact: 1.122, vision: 1.099, clutch: 1.045, bunt: 0.84, speed: 1.18, bats: 'R',
    bio: 'Covers more ground than the outfield fence does.' },
  { id: 'sea6', name: 'Drizzle Bhatia', build: 'human', trait: 'grit', power: 0.984, contact: 1.166, vision: 1.133, clutch: 1.111, bunt: 1.2, speed: 1.1, bats: 'L',
    bio: 'Not a downpour. Just never, ever stops.' },
  { id: 'sea7', name: 'Cannery Row Feodorov', build: 'human', trait: 'grit', power: 1.061, contact: 1.122, vision: 1.078, clutch: 1.078, bunt: 1.0, speed: 0.95, bats: 'R',
    bio: 'Twelve-hour line shift, then the bus, then batting practice.' },
  { id: 'sea8', name: 'Rain Delay Osgood', build: 'human', trait: 'showman', power: 1.127, contact: 1.078, vision: 1.034, clutch: 1.122, bunt: 0.62, speed: 0.98, bats: 'L',
    bio: 'Has an entire tarpaulin routine and does it whether it rains or not.' },
  { id: 'sea9', name: 'Old Growth Larsen', build: 'machine', trait: 'slugger', power: 1.336, contact: 0.99, vision: 0.946, clutch: 1.023, bunt: 0.18, speed: 0.6, bats: 'R',
    bio: 'Four hundred years to grow and one swing to explain it.' },
];

const SEA_ARMS: readonly Pitcher[] = [
  {
    name: 'Sound Fog Aoki', throws: 'L', signature: 'junk', tellTiming: 'release', zoneRate: 0.53,
    blurb: 'You can hear it fine. Seeing it is the problem.',
    arsenal: { changeup: 0.4, curveball: 0.35, slider: 0.25 }, putaway: 'changeup', break: 1.03, clutch: 1, stamina: 1.04,
  },
  {
    name: 'Mudslide Pettersen', throws: 'R', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.55, speedBonus: 2,
    blurb: 'Comes down all at once and takes the road with it.',
    arsenal: { sinker: 0.5, slider: 0.3, fastball: 0.2 }, putaway: 'sinker', break: 1.022, clutch: 0.97, stamina: 1.12,
  },
  {
    name: 'Drizzle Nakamura', throws: 'L', signature: 'painter', tellTiming: 'pre_pitch', zoneRate: 0.51,
    blurb: 'Never hard enough to stop play and never quite stops.',
    arsenal: { changeup: 0.45, curveball: 0.32, sinker: 0.23 }, putaway: 'changeup', break: 1.024, clutch: 0.983, stamina: 1.08,
  },
];

/** ...and the three who finish it. */
const SEA_PEN: readonly Pitcher[] = [
  {
    name: 'Harbor Bell Kuo', throws: 'R', signature: 'painter', tellTiming: 'release', zoneRate: 0.46, speedBonus: 3,
    blurb: 'Rings once an inning and then you are done.',
    arsenal: { slider: 0.42, curveball: 0.33, fastball: 0.25 }, putaway: 'slider', break: 1, clutch: 1.04, stamina: 0.9,
  },
  {
    name: 'Ferry Horn Bergstrom', throws: 'R', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.5,
    blurb: 'One note, no warning, and everybody on the water knows where he is.',
    arsenal: { fastball: 0.6, slider: 0.4 }, putaway: 'slider', break: 0.993, clutch: 0.963, stamina: 0.82,
  },
  {
    name: 'Cloudburst Tanaka', throws: 'R', signature: 'fireball', tellTiming: 'release', zoneRate: 0.49, speedBonus: 7,
    blurb: 'A whole month of it in nine minutes.',
    arsenal: { fastball: 0.6, sinker: 0.4 }, putaway: 'fastball', break: 1.056, clutch: 1.023, stamina: 0.7,
  },
];

/**
 * DENVER PROSPECTORS — a mile up, where the ball carries and nobody has learned
 * to pitch. Real power, no staff, and every game finishes 9-8.
 */
const DEN: readonly Player[] = [
  { id: 'den1', name: 'Placer Vance', build: 'human', trait: 'showman', power: 1.05, contact: 1.155, vision: 1.099, clutch: 1.045, bunt: 1.08, speed: 1.24, bats: 'L',
    bio: 'Pans the same creek every winter and finds enough to come back.' },
  { id: 'den2', name: 'Assay Office Nunn', build: 'human', trait: 'reader', power: 1.083, contact: 1.144, vision: 1.133, clutch: 1.034, bunt: 1.02, speed: 1.12, bats: 'R',
    bio: 'Tells you what it is worth and is never wrong and never popular.' },
  { id: 'den3', name: 'Mile High Ostrowski', build: 'machine', trait: 'slugger', power: 1.49, contact: 0.979, vision: 0.923, clutch: 1.045, bunt: 0.12, speed: 0.7, bats: 'R',
    bio: 'Hits it a mile because the air lets him and takes full credit anyway.' },
  { id: 'den4', name: 'Tailings Pond Grieve', build: 'augmented', trait: 'slugger', power: 1.369, contact: 0.99, vision: 0.946, clutch: 1.001, bunt: 0.2, speed: 0.78, bats: 'L',
    bio: 'Everything the mountain did not want, in one place, glowing faintly.' },
  { id: 'den5', name: 'Front Range Yazzie', build: 'human', trait: 'grit', power: 1.138, contact: 1.111, vision: 1.078, clutch: 1.1, bunt: 0.94, speed: 1.06, bats: 'R',
    bio: 'Runs the fence line all game at altitude and never gets tired.' },
  { id: 'den6', name: 'Dynamite Shack Bell', build: 'human', trait: 'slugger', power: 1.314, contact: 1.012, vision: 0.968, clutch: 1.012, bunt: 0.26, speed: 0.85, bats: 'R',
    bio: 'Kept well away from the dugout for reasons never written down.' },
  { id: 'den7', name: 'Silver Plume Ockerman', build: 'human', trait: 'precision', power: 1.105, contact: 1.122, vision: 1.089, clutch: 1.056, bunt: 0.88, speed: 0.95, bats: 'L',
    bio: 'The town is gone. He still gives it as his address.' },
  { id: 'den8', name: 'Thin Air Dubois', build: 'augmented', trait: 'reader', power: 1.171, contact: 1.067, vision: 1.067, clutch: 0.99, bunt: 0.64, speed: 1.0, bats: 'R',
    bio: 'Plays the whole season at home and cannot breathe anywhere else.' },
  { id: 'den9', name: 'Ore Cart Pankowski', build: 'machine', trait: 'grit', power: 1.248, contact: 1.034, vision: 0.989, clutch: 1.023, bunt: 0.4, speed: 0.68, bats: 'L',
    bio: 'Downhill only, and nothing gets in the way of it.' },
];

const DEN_ARMS: readonly Pitcher[] = [
  {
    name: 'Altitude Sickness Rowe', throws: 'R', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.58, speedBonus: 4,
    blurb: 'Great for four innings. Nobody has seen his fifth.',
    arsenal: { fastball: 0.5, sinker: 0.3, slider: 0.2 }, putaway: 'fastball', break: 0.93, clutch: 0.95, stamina: 0.95,
  },
  {
    name: 'Flat Curve Dunmire', throws: 'L', signature: 'junk', tellTiming: 'pre_pitch', zoneRate: 0.52,
    blurb: 'It breaks at sea level. He has never pitched at sea level.',
    arsenal: { curveball: 0.45, changeup: 0.3, fastball: 0.25 }, putaway: 'curveball', break: 0.94, clutch: 0.97, stamina: 1.1,
  },
  {
    name: 'Thin Air Ostrander', throws: 'R', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.53,
    blurb: 'Nothing breaks up here and he has stopped pretending otherwise.',
    arsenal: { fastball: 0.45, changeup: 0.32, slider: 0.23 }, putaway: 'changeup', break: 0.956, clutch: 0.957, stamina: 1.08,
  },
];

/** ...and the three who finish it. */
const DEN_PEN: readonly Pitcher[] = [
  {
    name: 'Timberline Krupa', throws: 'R', signature: 'painter', tellTiming: 'release', zoneRate: 0.48, speedBonus: 2,
    blurb: 'Above this line nothing grows and nothing scores.',
    arsenal: { slider: 0.4, sinker: 0.35, changeup: 0.25 }, putaway: 'slider', break: 0.98, clutch: 1.01, stamina: 0.87,
  },
  {
    name: 'Switchback Neary', throws: 'L', signature: 'junk', tellTiming: 'pre_pitch', zoneRate: 0.52,
    blurb: 'Gets there eventually and you see the same view four times.',
    arsenal: { curveball: 0.6, changeup: 0.4 }, putaway: 'curveball', break: 0.927, clutch: 0.938, stamina: 0.82,
  },
  {
    name: 'Continental Divide Roan', throws: 'R', signature: 'none', tellTiming: 'release', zoneRate: 0.51,
    blurb: 'Everything goes one way or the other and none of it comes back.',
    arsenal: { fastball: 0.6, sinker: 0.4 }, putaway: 'sinker', break: 0.987, clutch: 0.996, stamina: 0.7,
  },
];

/**
 * MEMPHIS RIVERBOATS — everything on the card and everything on the table. Two
 * enormous bats, seven ordinary ones, and a staff that gambles every pitch.
 */
const MEM: readonly Player[] = [
  { id: 'mem1', name: 'Beale Street Ottley', build: 'human', trait: 'showman', power: 1.006, contact: 1.166, vision: 1.111, clutch: 1.111, bunt: 1.14, speed: 1.28, bats: 'L',
    bio: 'Plays four bars of something on the way to the box every time.' },
  { id: 'mem2', name: 'Paddle Wheel Ruffin', build: 'human', trait: 'grit', power: 1.039, contact: 1.144, vision: 1.099, clutch: 1.078, bunt: 1.1, speed: 1.06, bats: 'R',
    bio: 'Same rhythm all night, and it gets faster when he is behind.' },
  { id: 'mem3', name: 'High Card Delacroix', build: 'machine', trait: 'slugger', power: 1.468, contact: 0.99, vision: 0.946, clutch: 1.1, bunt: 0.12, speed: 0.68, bats: 'R',
    bio: 'One hand, all in, twice a game.' },
  { id: 'mem4', name: 'Cotton Exchange Hobbs', build: 'machine', trait: 'slugger', power: 1.402, contact: 0.979, vision: 0.934, clutch: 1.056, bunt: 0.16, speed: 0.64, bats: 'L',
    bio: 'Sets the price and then hits the price.' },
  { id: 'mem5', name: 'Steamboat Gambler Voss', build: 'human', trait: 'showman', power: 1.16, contact: 1.078, vision: 1.022, clutch: 1.144, bunt: 0.56, speed: 0.98, bats: 'R',
    bio: 'Swings at 3-0 on principle. Has explained the principle at length.' },
  { id: 'mem6', name: 'Mud Bar Cheatham', build: 'human', trait: 'grit', power: 1.028, contact: 1.133, vision: 1.089, clutch: 1.089, bunt: 1.06, speed: 0.92, bats: 'L',
    bio: 'Shows up where the channel used to be and ruins somebody evening.' },
  { id: 'mem7', name: 'Boiler Deck Prue', build: 'augmented', trait: 'grit', power: 1.149, contact: 1.067, vision: 1.022, clutch: 1.045, bunt: 0.7, speed: 0.86, bats: 'R',
    bio: 'Hottest place on the boat and the cheapest ticket.' },
  { id: 'mem8', name: 'Levee Camp Sisson', build: 'human', trait: 'reader', power: 1.017, contact: 1.122, vision: 1.121, clutch: 1.067, bunt: 1.02, speed: 1.0, bats: 'R',
    bio: 'Built the wall that keeps the river out of the ballpark.' },
  { id: 'mem9', name: 'Calliope Nance', build: 'machine', trait: 'showman', power: 1.226, contact: 1.023, vision: 0.979, clutch: 1.122, bunt: 0.36, speed: 0.8, bats: 'L',
    bio: 'Audible from two miles and in tune from none.' },
];

const MEM_ARMS: readonly Pitcher[] = [
  {
    name: 'Riverboat Rell', throws: 'R', signature: 'junk', tellTiming: 'release', zoneRate: 0.5,
    blurb: 'Never throws the same thing twice and could not tell you why.',
    arsenal: { changeup: 0.35, curveball: 0.3, slider: 0.2, sinker: 0.15 }, putaway: 'changeup', break: 1.02, clutch: 0.99, stamina: 1.03,
  },
  {
    name: 'Snag Boat Trueblood', throws: 'L', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.54, speedBonus: 3,
    blurb: 'Pulls whatever is under the surface out of the way. Slowly.',
    arsenal: { sinker: 0.48, fastball: 0.25, curveball: 0.27 }, putaway: 'sinker', break: 0.981, clutch: 0.96, stamina: 1.09,
  },
  {
    name: 'Paddlewheel Mack', throws: 'R', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.51,
    blurb: 'Same revolution all night and it moves a great deal of water.',
    arsenal: { fastball: 0.45, slider: 0.32, changeup: 0.23 }, putaway: 'slider', break: 0.987, clutch: 0.964, stamina: 1.08,
  },
];

/** ...and the three who finish it. */
const MEM_PEN: readonly Pitcher[] = [
  {
    name: 'Bluff City Odum', throws: 'R', signature: 'fireball', tellTiming: 'release', zoneRate: 0.48, speedBonus: 7,
    blurb: 'All of it, every pitch, and no plan for the second time through.',
    arsenal: { fastball: 0.72, slider: 0.28 }, putaway: 'fastball', break: 0.94, clutch: 1, stamina: 0.86,
  },
  {
    name: 'Card Sharp Ledoux', throws: 'L', signature: 'painter', tellTiming: 'pre_pitch', zoneRate: 0.5,
    blurb: 'Deals himself the same hand every time and nobody can prove it.',
    arsenal: { curveball: 0.6, changeup: 0.4 }, putaway: 'changeup', break: 0.958, clutch: 0.944, stamina: 0.82,
  },
  {
    name: 'All In Bonnaire', throws: 'R', signature: 'fireball', tellTiming: 'release', zoneRate: 0.49, speedBonus: 7,
    blurb: 'Pushes the whole stack in on every pitch. It has mostly worked.',
    arsenal: { fastball: 0.6, slider: 0.4 }, putaway: 'fastball', break: 1.019, clutch: 1.003, stamina: 0.7,
  },
];

/**
 * CINCINNATI PIGS — they were FIRST. The first club anybody ever paid to play,
 * out of the first town that ever called itself the pork capital, and they have
 * spent every year since watching bigger cities take both titles off them and
 * get famous for it. Slow, heavy, funny about it, and still here.
 */
const CIN: readonly Player[] = [
  { id: 'cin1', name: 'Over The Rhine Bruhn', build: 'human', trait: 'grit', power: 0.995, contact: 1.155, vision: 1.111, clutch: 1.1, bunt: 1.18, speed: 1.0, bats: 'L',
    bio: 'Walks to the park from the same house his grandfather did.' },
  { id: 'cin2', name: 'Findlay Market Ross', build: 'human', trait: 'reader', power: 1.028, contact: 1.144, vision: 1.133, clutch: 1.067, bunt: 1.12, speed: 1.04, bats: 'R',
    bio: 'Opening day parade marshal, and will remind you every May.' },
  { id: 'cin3', name: 'Smoke House Pfaff', build: 'machine', trait: 'slugger', power: 1.391, contact: 0.99, vision: 0.934, clutch: 1.045, bunt: 0.14, speed: 0.6, bats: 'R',
    bio: 'Cured for eleven months and worth every day of it.' },
  { id: 'cin4', name: 'Packer Vollmer', build: 'machine', trait: 'slugger', power: 1.325, contact: 0.99, vision: 0.946, clutch: 1.023, bunt: 0.18, speed: 0.58, bats: 'L',
    bio: 'Nothing wasted, nothing hurried, nothing pretty.' },
  { id: 'cin5', name: 'Mount Adams Kruse', build: 'human', trait: 'precision', power: 1.083, contact: 1.122, vision: 1.089, clutch: 1.056, bunt: 0.88, speed: 0.9, bats: 'R',
    bio: 'Looks down on the whole river and mentions it constantly.' },
  { id: 'cin6', name: 'Queen City Ledbetter', build: 'human', trait: 'showman', power: 1.138, contact: 1.089, vision: 1.034, clutch: 1.111, bunt: 0.6, speed: 0.94, bats: 'L',
    bio: 'Insists on the full title. Never accepts the short one.' },
  { id: 'cin7', name: 'Canal Lock Duffey', build: 'augmented', trait: 'grit', power: 1.116, contact: 1.078, vision: 1.044, clutch: 1.045, bunt: 0.78, speed: 0.85, bats: 'R',
    bio: 'The canal was filled in sixty years ago. Nobody told him.' },
  { id: 'cin8', name: 'Hog Drover Tillery', build: 'human', trait: 'grit', power: 1.061, contact: 1.1, vision: 1.056, clutch: 1.078, bunt: 0.98, speed: 0.88, bats: 'R',
    bio: 'Moved four hundred head down Main Street once and never got over it.' },
  { id: 'cin9', name: 'Rhinegeist Obermeyer', build: 'machine', trait: 'slugger', power: 1.259, contact: 1.012, vision: 0.968, clutch: 1.012, bunt: 0.24, speed: 0.62, bats: 'L',
    bio: 'Ghost of the brewery district, still on the payroll.' },
];

const CIN_ARMS: readonly Pitcher[] = [
  {
    name: 'Old Cossett', throws: 'R', signature: 'junk', tellTiming: 'pre_pitch', zoneRate: 0.58,
    blurb: 'Forty-one years old and pitching entirely from memory.',
    arsenal: { changeup: 0.4, curveball: 0.35, sinker: 0.25 }, putaway: 'curveball', break: 0.99, clutch: 0.98, stamina: 1.06,
  },
  {
    name: 'Ludlow Viaduct Beem', throws: 'L', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.55,
    blurb: 'Structurally unsound and load-bearing anyway.',
    arsenal: { fastball: 0.25, curveball: 0.41, changeup: 0.34 }, putaway: 'curveball', break: 0.971, clutch: 0.96, stamina: 1.09,
  },
  {
    name: 'Porkopolis Stemler', throws: 'L', signature: 'painter', tellTiming: 'pre_pitch', zoneRate: 0.54,
    blurb: 'The town was called that first and he will tell you why.',
    arsenal: { sinker: 0.45, changeup: 0.32, slider: 0.23 }, putaway: 'changeup', break: 0.984, clutch: 0.967, stamina: 1.08,
  },
];

/** ...and the three who finish it. */
const CIN_PEN: readonly Pitcher[] = [
  {
    name: 'River Fog Kappel', throws: 'R', signature: 'painter', tellTiming: 'release', zoneRate: 0.5, speedBonus: 2,
    blurb: 'Sits on the water and takes the last two innings with it.',
    arsenal: { slider: 0.4, changeup: 0.35, sinker: 0.25 }, putaway: 'slider', break: 0.97, clutch: 1.02, stamina: 0.89,
  },
  {
    name: 'Rhineland Vogt', throws: 'R', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.53,
    blurb: 'Over the river, up the steps, and back down for the ninth.',
    arsenal: { fastball: 0.6, curveball: 0.4 }, putaway: 'curveball', break: 0.954, clutch: 0.947, stamina: 0.82,
  },
  {
    name: 'Slaughterhouse Nine', throws: 'R', signature: 'fireball', tellTiming: 'release', zoneRate: 0.52, speedBonus: 7,
    blurb: 'Ninth of nine off the same line. The other eight are still working.',
    arsenal: { fastball: 0.6, sinker: 0.4 }, putaway: 'fastball', break: 1.015, clutch: 1.006, stamina: 0.7,
  },
];

/**
 * NEW ORLEANS SPIRIT — they were the best club in this league once, and the
 * town has never once let it go. The parade still goes out after every game,
 * won or lost, which is the joke and also the point: a second line is a funeral
 * that decided to be a party. Enormous fun, and not enough left to finish a
 * season with.
 */
const NOL: readonly Player[] = [
  { id: 'nol1', name: 'Tremé Boudreaux', build: 'human', trait: 'showman', power: 0.973, contact: 1.177, vision: 1.121, clutch: 1.133, bunt: 1.22, speed: 1.32, bats: 'L',
    bio: 'Dances the whole way to first and beats the throw doing it.' },
  { id: 'nol2', name: 'Grand Marshal Fontenot', build: 'human', trait: 'showman', power: 1.017, contact: 1.155, vision: 1.099, clutch: 1.155, bunt: 1.16, speed: 1.2, bats: 'R',
    bio: 'Leads it, and the club follows him whether or not it should.' },
  { id: 'nol3', name: 'Sousaphone Ancelet', build: 'machine', trait: 'slugger', power: 1.413, contact: 0.979, vision: 0.923, clutch: 1.078, bunt: 0.14, speed: 0.66, bats: 'R',
    bio: 'Carries the whole bottom end and weighs as much as the bench.' },
  { id: 'nol4', name: 'Pumping Station Six', build: 'machine', trait: 'slugger', power: 1.336, contact: 0.99, vision: 0.946, clutch: 1.045, bunt: 0.18, speed: 0.62, bats: 'L',
    bio: 'Holds the whole city up in a storm and never gets a parade.' },
  { id: 'nol5', name: 'Vieux Carré Thibault', build: 'human', trait: 'grit', power: 1.072, contact: 1.111, vision: 1.078, clutch: 1.144, bunt: 1.0, speed: 1.0, bats: 'R',
    bio: 'Two hundred years old, structurally, and still open all night.' },
  { id: 'nol6', name: 'Snare Beaudry', build: 'human', trait: 'precision', power: 1.039, contact: 1.133, vision: 1.099, clutch: 1.1, bunt: 0.96, speed: 1.08, bats: 'L',
    bio: 'Keeps time for everybody. Nobody keeps it for him.' },
  { id: 'nol7', name: 'Crawfish Boil Pitre', build: 'human', trait: 'grit', power: 1.105, contact: 1.089, vision: 1.044, clutch: 1.111, bunt: 0.86, speed: 0.9, bats: 'R',
    bio: 'Three hours, one table, everybody invited, nothing left.' },
  { id: 'nol8', name: 'Levee Break Gaudet', build: 'augmented', trait: 'slugger', power: 1.237, contact: 1.012, vision: 0.968, clutch: 1.034, bunt: 0.3, speed: 0.82, bats: 'R',
    bio: 'Fine, fine, fine, and then not fine at all.' },
  { id: 'nol9', name: 'Storyville Marchand', build: 'human', trait: 'showman', power: 1.171, contact: 1.045, vision: 1, clutch: 1.122, bunt: 0.5, speed: 0.95, bats: 'L',
    bio: 'Every story he tells is about himself and about half of them happened.' },
];

const NOL_ARMS: readonly Pitcher[] = [
  {
    name: 'Second Line Rousseau', throws: 'L', signature: 'junk', tellTiming: 'release', zoneRate: 0.5,
    blurb: 'No two innings in the same tempo and he insists that is the plan.',
    arsenal: { changeup: 0.38, curveball: 0.32, slider: 0.3 }, putaway: 'changeup', break: 1.01, clutch: 1.02, stamina: 1,
  },
  {
    name: 'Bayou Fever Landry', throws: 'R', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.52, speedBonus: 3,
    blurb: 'Sweats through three jerseys and gets worse in the eighth.',
    arsenal: { sinker: 0.47, fastball: 0.25, changeup: 0.28 }, putaway: 'sinker', break: 0.981, clutch: 0.95, stamina: 1.04,
  },
  {
    name: 'Brass Band Fontenot', throws: 'L', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.5,
    blurb: 'Never plays the same tune twice and never plays it quietly.',
    arsenal: { fastball: 0.45, changeup: 0.32, curveball: 0.23 }, putaway: 'changeup', break: 0.99, clutch: 0.98, stamina: 1.08,
  },
];

/** ...and the three who finish it. */
const NOL_PEN: readonly Pitcher[] = [
  {
    name: 'Ninth Ward Baptiste', throws: 'R', signature: 'fireball', tellTiming: 'release', zoneRate: 0.48, speedBonus: 6,
    blurb: 'Comes on in the ninth because there was never a plan for the eighth.',
    arsenal: { fastball: 0.7, curveball: 0.3 }, putaway: 'fastball', break: 0.96, clutch: 1.03, stamina: 0.86,
  },
  {
    name: 'Cemetery Row Guidry', throws: 'R', signature: 'junk', tellTiming: 'pre_pitch', zoneRate: 0.49,
    blurb: 'Everything above ground here, including whatever he throws.',
    arsenal: { curveball: 0.6, slider: 0.4 }, putaway: 'curveball', break: 0.961, clutch: 0.96, stamina: 0.82,
  },
  {
    name: 'Last Parade Thibault', throws: 'R', signature: 'fireball', tellTiming: 'release', zoneRate: 0.48, speedBonus: 7,
    blurb: 'Comes out at the end whether you won or not. That is the point.',
    arsenal: { fastball: 0.6, sinker: 0.4 }, putaway: 'fastball', break: 1.022, clutch: 1.02, stamina: 0.7,
  },
];

/**
 * TORONTO TRAVELERS — the only club outside the country, which is the whole
 * joke in the name: nobody flies like they do. Nine men from nine places,
 * none of whom were drafted here, playing what amounts to a road season.
 */
const TOR: readonly Player[] = [
  { id: 'tor1', name: 'Red Eye Nakashima', build: 'human', trait: 'grit', power: 0.86, contact: 1.2, vision: 1.18, clutch: 1.12, bunt: 1.2, speed: 1.22, bats: 'L',
    bio: 'Sleeps on the plane, wakes up in a city, hits .290 in all of them.' },
  { id: 'tor2', name: 'Customs Line Beaulieu', build: 'human', trait: 'reader', power: 0.92, contact: 1.18, vision: 1.22, clutch: 1.04, bunt: 1.14, speed: 1.1, bats: 'R',
    bio: 'Declares everything. It takes an hour and he has never been fined.' },
  { id: 'tor3', name: 'THE CN', build: 'machine', trait: 'slugger', power: 1.7, contact: 0.9, vision: 0.84, clutch: 1.08, bunt: 0.12, speed: 0.6, bats: 'R',
    bio: 'Eighteen hundred feet of it, visible from the next province.' },
  { id: 'tor4', name: 'Hogtown Vasilev', build: 'machine', trait: 'slugger', power: 1.52, contact: 0.9, vision: 0.86, clutch: 1.0, bunt: 0.16, speed: 0.64, bats: 'L',
    bio: 'This town was a pork town too. Nobody down south believes it.' },
  { id: 'tor5', name: 'Yonge Street Achterberg', build: 'human', trait: 'grit', power: 1.0, contact: 1.14, vision: 1.1, clutch: 1.1, bunt: 1.0, speed: 0.95, bats: 'R',
    bio: 'Named for a road that goes on for a thousand miles and never turns.' },
  { id: 'tor6', name: 'Layover Ibarra', build: 'human', trait: 'precision', power: 0.94, contact: 1.16, vision: 1.14, clutch: 1.0, bunt: 0.92, speed: 1.05, bats: 'L',
    bio: 'Has been through every airport in the league and slept in most of them.' },
  { id: 'tor7', name: 'Don Valley Okonjo', build: 'augmented', trait: 'reader', power: 1.14, contact: 1.06, vision: 1.12, clutch: 0.96, bunt: 0.74, speed: 0.98, bats: 'R',
    bio: 'Comes up out of the ravine that runs under the whole city.' },
  { id: 'tor8', name: 'Lakeshore Tremblay', build: 'human', trait: 'grit', power: 0.98, contact: 1.1, vision: 1.08, clutch: 1.14, bunt: 1.02, speed: 0.9, bats: 'R',
    bio: 'Plays the whole year in a wind coming off a lake the size of a sea.' },
  { id: 'tor9', name: 'Passport Kaur', build: 'human', trait: 'showman', power: 1.16, contact: 1.0, vision: 0.98, clutch: 1.18, bunt: 0.48, speed: 1.0, bats: 'L',
    bio: 'Four countries on the cover and a nickname in each one.' },
];

const TOR_ARMS: readonly Pitcher[] = [
  {
    name: 'Time Zone Fyodorov', throws: 'R', signature: 'junk', tellTiming: 'release', zoneRate: 0.54,
    blurb: 'Nothing arrives when you expect it. He blames the schedule.',
    arsenal: { changeup: 0.4, curveball: 0.32, sinker: 0.28 }, putaway: 'changeup', break: 1.02, clutch: 0.98, stamina: 1.08,
  },
  {
    name: 'Border Crossing Mensah', throws: 'L', signature: 'none', tellTiming: 'release', zoneRate: 0.55, speedBonus: 3,
    blurb: 'Slow going in, quick coming back.',
    arsenal: { fastball: 0.25, sinker: 0.41, slider: 0.34 }, putaway: 'sinker', break: 0.971, clutch: 0.96, stamina: 1.1,
  },
  {
    name: 'Red Eye Lachance', throws: 'R', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.53,
    blurb: 'Lands at six, pitches at seven, and does not believe in hotels.',
    arsenal: { fastball: 0.45, curveball: 0.32, changeup: 0.23 }, putaway: 'curveball', break: 1.004, clutch: 0.987, stamina: 1.08,
  },
];

/** ...and the three who finish it. */
const TOR_PEN: readonly Pitcher[] = [
  {
    name: 'Last Flight Doucet', throws: 'R', signature: 'painter', tellTiming: 'release', zoneRate: 0.5, speedBonus: 4,
    blurb: 'Gets it done and gets on the plane. Has never seen a hotel bar.',
    arsenal: { slider: 0.4, fastball: 0.34, changeup: 0.26 }, putaway: 'slider', break: 1.0, clutch: 1.08, stamina: 0.8,
  },
  {
    name: 'Customs Line Adeyemi', throws: 'L', signature: 'junk', tellTiming: 'pre_pitch', zoneRate: 0.52,
    blurb: 'Takes as long as it takes and there is no other line.',
    arsenal: { changeup: 0.6, curveball: 0.4 }, putaway: 'changeup', break: 0.973, clutch: 0.967, stamina: 0.82,
  },
  {
    name: 'Final Call Bouchard', throws: 'R', signature: 'none', tellTiming: 'release', zoneRate: 0.51,
    blurb: 'Last boarding announcement of the night, in two languages.',
    arsenal: { fastball: 0.6, slider: 0.4 }, putaway: 'slider', break: 1.035, clutch: 1.027, stamina: 0.7,
  },
];

/**
 * KANSAS CITY FREIGHT — a yard, a schedule and nine men who were passing
 * through. Nothing on this roster was drafted; all of it was picked up cheap.
 */
const KCF: readonly Player[] = [
  { id: 'kcf1', name: 'Hump Yard Delacruz', build: 'human', trait: 'grit', power: 0.962, contact: 1.133, vision: 1.089, clutch: 1.045, bunt: 1.18, speed: 1.2, bats: 'L',
    bio: 'Pushed over the crest and left to find his own track.' },
  { id: 'kcf2', name: 'Waybill Osment', build: 'human', trait: 'reader', power: 0.984, contact: 1.122, vision: 1.111, clutch: 1.012, bunt: 1.1, speed: 1.08, bats: 'R',
    bio: 'Knows where everything is going and has never gone anywhere.' },
  { id: 'kcf3', name: 'Hopper Car Wren', build: 'machine', trait: 'slugger', power: 1.369, contact: 0.968, vision: 0.913, clutch: 0.99, bunt: 0.14, speed: 0.6, bats: 'R',
    bio: 'Full or empty, and no way to tell from the outside.' },
  { id: 'kcf4', name: 'Reefer Unit Nine', build: 'machine', trait: 'slugger', power: 1.292, contact: 0.968, vision: 0.923, clutch: 0.968, bunt: 0.16, speed: 0.58, bats: 'L',
    bio: 'Runs cold all season. Cost more to keep than to replace.' },
  { id: 'kcf5', name: 'Stockyard Bridge Aubry', build: 'human', trait: 'grit', power: 1.061, contact: 1.089, vision: 1.044, clutch: 1.056, bunt: 0.94, speed: 0.9, bats: 'R',
    bio: 'Everything crosses him and nobody stops.' },
  { id: 'kcf6', name: 'Boxcar Willie Nunn', build: 'human', trait: 'showman', power: 1.094, contact: 1.056, vision: 1.012, clutch: 1.078, bunt: 0.6, speed: 0.95, bats: 'L',
    bio: 'Rode in on one and tells the story before anybody asks.' },
  { id: 'kcf7', name: 'Switch Frog Halima', build: 'augmented', trait: 'precision', power: 1.072, contact: 1.078, vision: 1.034, clutch: 1.001, bunt: 0.8, speed: 0.98, bats: 'R',
    bio: 'One small part, and if it fails everything behind it is on the ground.' },
  { id: 'kcf8', name: 'Caboose Rennick', build: 'human', trait: 'grit', power: 1.006, contact: 1.078, vision: 1.034, clutch: 1.045, bunt: 1.0, speed: 0.85, bats: 'R',
    bio: 'Last man on the train and the last one anybody thinks about.' },
  { id: 'kcf9', name: 'Air Brake Sowell', build: 'machine', trait: 'slugger', power: 1.204, contact: 1.001, vision: 0.957, clutch: 0.979, bunt: 0.3, speed: 0.64, bats: 'L',
    bio: 'Stops everything, eventually, and nobody enjoys the sound.' },
];

const KCF_ARMS: readonly Pitcher[] = [
  {
    name: 'Slow Order Vaught', throws: 'R', signature: 'junk', tellTiming: 'pre_pitch', zoneRate: 0.54,
    blurb: 'Ten miles an hour through the whole yard by regulation.',
    arsenal: { sinker: 0.4, changeup: 0.35, curveball: 0.25 }, putaway: 'changeup', break: 0.95, clutch: 0.95, stamina: 1.02,
  },
  {
    name: 'Dead Head Pruitt', throws: 'L', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.52,
    blurb: 'Rides all the way out and does no work when he gets there.',
    arsenal: { fastball: 0.25, curveball: 0.45, changeup: 0.3 }, putaway: 'curveball', break: 0.949, clutch: 0.93, stamina: 1.06,
  },
  {
    name: 'Empty Boxcar Whitlow', throws: 'R', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.51,
    blurb: 'Rides out full and comes back with nothing in him. Every trip.',
    arsenal: { sinker: 0.45, curveball: 0.32, changeup: 0.23 }, putaway: 'curveball', break: 0.939, clutch: 0.921, stamina: 1.08,
  },
];

/** ...and the three who finish it. */
const KCF_PEN: readonly Pitcher[] = [
  {
    name: 'Hot Box Ferrier', throws: 'R', signature: 'fireball', tellTiming: 'pre_pitch', zoneRate: 0.46, speedBonus: 5,
    blurb: 'Runs hot, catches fire, and stops the whole line.',
    arsenal: { fastball: 0.72, slider: 0.28 }, putaway: 'fastball', break: 0.9, clutch: 0.94, stamina: 0.85,
  },
  {
    name: 'Coupler Pin Stroud', throws: 'L', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.5,
    blurb: 'One piece of steel between the whole train and a very bad day.',
    arsenal: { fastball: 0.6, slider: 0.4 }, putaway: 'slider', break: 0.911, clutch: 0.903, stamina: 0.82,
  },
  {
    name: 'Last Car Hennigan', throws: 'R', signature: 'none', tellTiming: 'release', zoneRate: 0.49,
    blurb: 'You know the thing is over when you see him go past.',
    arsenal: { fastball: 0.6, sinker: 0.4 }, putaway: 'fastball', break: 0.969, clutch: 0.959, stamina: 0.7,
  },
];

/**
 * BUFFALO SNOWPLOWS — six feet of it, twice a winter, and a club that has never
 * been given a reason to expect anything better.
 */
const BUF: readonly Player[] = [
  { id: 'buf1', name: 'Lake Effect Zdrojewski', build: 'human', trait: 'grit', power: 0.951, contact: 1.144, vision: 1.099, clutch: 1.078, bunt: 1.22, speed: 1.16, bats: 'L',
    bio: 'Arrives all at once and stays until March.' },
  { id: 'buf2', name: 'Thruway Coyne', build: 'human', trait: 'reader', power: 0.973, contact: 1.122, vision: 1.111, clutch: 1.034, bunt: 1.12, speed: 1.06, bats: 'R',
    bio: 'Closed four times this year and still made every game.' },
  { id: 'buf3', name: 'Grain Scoop Piasecki', build: 'machine', trait: 'slugger', power: 1.347, contact: 0.968, vision: 0.913, clutch: 1.001, bunt: 0.14, speed: 0.6, bats: 'R',
    bio: 'Invented here, and the only thing the city still exports.' },
  { id: 'buf4', name: 'Wing Night Ferraro', build: 'human', trait: 'slugger', power: 1.237, contact: 1.001, vision: 0.946, clutch: 1.023, bunt: 0.3, speed: 0.72, bats: 'L',
    bio: 'Twenty-five cents each, Tuesdays, and he has never missed one.' },
  { id: 'buf5', name: 'Snow Fence Duschene', build: 'human', trait: 'grit', power: 1.028, contact: 1.1, vision: 1.056, clutch: 1.067, bunt: 1.0, speed: 0.95, bats: 'R',
    bio: 'Slows it down. Does not stop it. Nobody claimed it would.' },
  { id: 'buf6', name: 'Salt Truck Obiora', build: 'machine', trait: 'grit', power: 1.138, contact: 1.045, vision: 1, clutch: 1.012, bunt: 0.7, speed: 0.66, bats: 'R',
    bio: 'Out before anybody else and rusting faster than the rest of the club.' },
  { id: 'buf7', name: 'Blizzard Of Sixteen', build: 'machine', trait: 'slugger', power: 1.259, contact: 0.99, vision: 0.934, clutch: 0.979, bunt: 0.2, speed: 0.62, bats: 'L',
    bio: 'They still talk about him. He has done nothing since.' },
  { id: 'buf8', name: 'Broadway Market Nowicki', build: 'human', trait: 'precision', power: 1.017, contact: 1.089, vision: 1.056, clutch: 1.034, bunt: 0.88, speed: 0.88, bats: 'R',
    bio: 'Busy one week in April, shuttered the rest of the year.' },
  { id: 'buf9', name: 'Wide Right Kulesza', build: 'human', trait: 'showman', power: 1.072, contact: 1.023, vision: 0.979, clutch: 0.957, bunt: 0.54, speed: 0.9, bats: 'L',
    bio: 'Nobody in this town will say the nickname out loud. It is on his jersey.' },
];

const BUF_ARMS: readonly Pitcher[] = [
  {
    name: 'Whiteout Gorski', throws: 'R', signature: 'junk', tellTiming: 'pre_pitch', zoneRate: 0.52,
    blurb: 'Nothing visible and nothing especially good either.',
    arsenal: { curveball: 0.4, changeup: 0.35, sinker: 0.25 }, putaway: 'curveball', break: 0.96, clutch: 0.94, stamina: 1.01,
  },
  {
    name: 'Plow Blade Cwiklinski', throws: 'L', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.55, speedBonus: 2,
    blurb: 'Straight, heavy and the same every night of the winter.',
    arsenal: { fastball: 0.25, sinker: 0.5, slider: 0.25 }, putaway: 'fastball', break: 0.94, clutch: 0.95, stamina: 1.1,
  },
  {
    name: 'Lake Effect Zielinski', throws: 'R', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.52,
    blurb: 'Comes off the water without warning and buries the whole county.',
    arsenal: { fastball: 0.45, curveball: 0.32, sinker: 0.23 }, putaway: 'curveball', break: 0.95, clutch: 0.931, stamina: 1.08,
  },
];

/** ...and the three who finish it. */
const BUF_PEN: readonly Pitcher[] = [
  {
    name: 'Ice Boom Marlette', throws: 'R', signature: 'none', tellTiming: 'release', zoneRate: 0.48, speedBonus: 4,
    blurb: 'Holds it back for one inning. That is the whole design spec.',
    arsenal: { fastball: 0.6, slider: 0.4 }, putaway: 'slider', break: 0.93, clutch: 0.96, stamina: 0.85,
  },
  {
    name: 'Salt Truck Barone', throws: 'L', signature: 'junk', tellTiming: 'pre_pitch', zoneRate: 0.51,
    blurb: 'Out before anybody else and nobody thanks him for it.',
    arsenal: { sinker: 0.6, changeup: 0.4 }, putaway: 'changeup', break: 0.921, clutch: 0.912, stamina: 0.82,
  },
  {
    name: 'Six Feet Dombrowski', throws: 'R', signature: 'none', tellTiming: 'release', zoneRate: 0.5,
    blurb: 'That is not a forecast, it is a measurement. Twice a winter.',
    arsenal: { fastball: 0.6, slider: 0.4 }, putaway: 'slider', break: 0.98, clutch: 0.969, stamina: 0.7,
  },
];

/**
 * PHOENIX FLAMES — THE FASTEST STAFF IN THE LEAGUE, and nothing else. Three
 * arms who throw as hard as anybody alive, in a hundred and ten degrees, for a
 * club that cannot hit, cannot field, and will not be over .500 this year.
 *
 * ⚠️ THIS CLUB IS WORTH MORE TO A PERSON THAN TO THE SIM, written down here so
 * nobody "fixes" it later. Velocity is worth EXACTLY ZERO in a simulated game —
 * the AI hitter draws its timing offset from a table and never reads how fast
 * the pitch is coming, which is why armValue in value.ts does not price it at
 * all. Against a HUMAN it is the most real thing on the card: speedBonus feeds
 * ballArrivalMs, the ball arrives sooner, and you have to start the bat earlier
 * than you do against anybody else in the league. So Phoenix finishes low in
 * every standings table the engine generates and is still the hardest club in
 * it for YOU to get a hit off. Both of those are correct.
 */
const PHX: readonly Player[] = [
  { id: 'phx1', name: 'Dry Heat Villalobos', build: 'human', trait: 'showman', power: 0.94, contact: 1.133, vision: 1.078, clutch: 1.034, bunt: 1.12, speed: 1.28, bats: 'L',
    bio: 'Insists it is different from the other kind. It is not.' },
  { id: 'phx2', name: 'Canal Bank Estrada', build: 'human', trait: 'reader', power: 0.973, contact: 1.111, vision: 1.099, clutch: 1.001, bunt: 1.06, speed: 1.14, bats: 'R',
    bio: 'The canals were here a thousand years before the club was.' },
  { id: 'phx3', name: 'Saguaro', build: 'machine', trait: 'slugger', power: 1.38, contact: 0.957, vision: 0.901, clutch: 0.99, bunt: 0.1, speed: 0.56, bats: 'R',
    bio: 'Takes sixty years to grow an arm and uses it exactly once.' },
  { id: 'phx4', name: 'Haboob Nakai', build: 'augmented', trait: 'slugger', power: 1.281, contact: 0.979, vision: 0.934, clutch: 0.968, bunt: 0.2, speed: 0.8, bats: 'L',
    bio: 'Visible from forty miles and over in ten minutes.' },
  { id: 'phx5', name: 'Copper Queen Amado', build: 'human', trait: 'grit', power: 1.039, contact: 1.089, vision: 1.044, clutch: 1.045, bunt: 0.96, speed: 1.0, bats: 'R',
    bio: 'The mine closed. The nickname stayed and so did she.' },
  { id: 'phx6', name: 'Swamp Cooler Prieto', build: 'machine', trait: 'precision', power: 1.083, contact: 1.067, vision: 1.022, clutch: 0.99, bunt: 0.76, speed: 0.85, bats: 'L',
    bio: 'Works fine until the humidity. Then he is furniture.' },
  { id: 'phx7', name: 'Sun Devil Rooker', build: 'human', trait: 'grit', power: 1.105, contact: 1.045, vision: 1.012, clutch: 1.023, bunt: 0.72, speed: 0.95, bats: 'R',
    bio: 'Local product, local legend, and league average at everything.' },
  { id: 'phx8', name: 'Ash Layer Tobin', build: 'augmented', trait: 'slugger', power: 1.226, contact: 0.99, vision: 0.946, clutch: 0.957, bunt: 0.26, speed: 0.78, bats: 'R',
    bio: 'Grey the whole way down and nothing grows in him.' },
  { id: 'phx9', name: 'Rookie Card Ybarra', build: 'human', trait: 'showman', power: 1.061, contact: 1.012, vision: 0.989, clutch: 0.99, bunt: 0.6, speed: 1.05, bats: 'L',
    bio: 'Twenty years old and already the best story this club has.' },
];

const PHX_ARMS: readonly Pitcher[] = [
  {
    name: 'Hundred And Ten Chee', throws: 'R', signature: 'fireball', tellTiming: 'pre_pitch', zoneRate: 0.5, speedBonus: 8,
    blurb: 'Same number as the afternoon and about as pleasant.',
    arsenal: { fastball: 0.45, sinker: 0.3, slider: 0.25 }, putaway: 'fastball', break: 1.2, clutch: 0.93, stamina: 0.96,
  },
  {
    name: 'Two Hundred Innings Bly', throws: 'L', signature: 'fireball', tellTiming: 'pre_pitch', zoneRate: 0.54, speedBonus: 7,
    blurb: 'Throws every one of them as hard as the first. Nobody has explained why.',
    arsenal: { fastball: 0.25, sinker: 0.48, changeup: 0.27 }, putaway: 'fastball', break: 1.178, clutch: 0.921, stamina: 1.18,
  },
  {
    name: 'Monsoon Season Tso', throws: 'L', signature: 'fireball', tellTiming: 'pre_pitch', zoneRate: 0.5, speedBonus: 5,
    blurb: 'Six weeks a year he is the best arm alive. The rest is desert.',
    arsenal: { fastball: 0.45, sinker: 0.32, slider: 0.23 }, putaway: 'sinker', break: 1.187, clutch: 0.911, stamina: 1.08,
  },
];

/** ...and the three who finish it. */
const PHX_PEN: readonly Pitcher[] = [
  {
    name: 'Night Game Wickenburg', throws: 'R', signature: 'fireball', tellTiming: 'release', zoneRate: 0.46, speedBonus: 11,
    blurb: 'Cannot pitch before eight in the evening and does not need to.',
    arsenal: { fastball: 0.58, slider: 0.42 }, putaway: 'fastball', break: 1.16, clutch: 0.94, stamina: 0.84,
  },
  {
    name: 'Asphalt Shimmer Begay', throws: 'R', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.49,
    blurb: 'You can see it moving and there is nothing there.',
    arsenal: { fastball: 0.6, changeup: 0.4 }, putaway: 'changeup', break: 1.152, clutch: 0.893, stamina: 0.82,
  },
  {
    name: 'Hundred And Fifteen Yazzie', throws: 'R', signature: 'fireball', tellTiming: 'release', zoneRate: 0.48, speedBonus: 7,
    blurb: 'Five hotter than Chee and he has never let anybody forget it.',
    arsenal: { fastball: 0.6, slider: 0.4 }, putaway: 'fastball', break: 1.225, clutch: 0.949, stamina: 0.7,
  },
];

/**
 * OKLAHOMA CITY DUSTBOWL — the bottom of the league and the best story in it.
 * Nine men, no money, no staff, and a town that turns out for every game.
 */
const OKC: readonly Player[] = [
  { id: 'okc1', name: 'Black Sunday Purl', build: 'human', trait: 'grit', power: 0.929, contact: 1.122, vision: 1.078, clutch: 1.067, bunt: 1.2, speed: 1.14, bats: 'L',
    bio: 'Named for the worst day the county ever had. Wears it well.' },
  { id: 'okc2', name: 'Section Line Choate', build: 'human', trait: 'reader', power: 0.951, contact: 1.111, vision: 1.099, clutch: 1.023, bunt: 1.1, speed: 1.08, bats: 'R',
    bio: 'Straight for a mile in every direction and never in a hurry.' },
  { id: 'okc3', name: 'Pump Jack Ottoway', build: 'machine', trait: 'slugger', power: 1.336, contact: 0.957, vision: 0.901, clutch: 0.979, bunt: 0.12, speed: 0.58, bats: 'R',
    bio: 'Up, down, up, down, all day, for a barrel and a half.' },
  { id: 'okc4', name: 'Red Dirt Hackler', build: 'human', trait: 'slugger', power: 1.204, contact: 0.99, vision: 0.946, clutch: 1.012, bunt: 0.34, speed: 0.75, bats: 'L',
    bio: 'It gets into everything and it never washes out.' },
  { id: 'okc5', name: 'Land Run Sedberry', build: 'human', trait: 'grit', power: 1.006, contact: 1.078, vision: 1.034, clutch: 1.056, bunt: 0.98, speed: 1.1, bats: 'R',
    bio: 'His people were on the line at noon. Some of them jumped it.' },
  { id: 'okc6', name: 'Grain Co-op Wenzel', build: 'human', trait: 'precision', power: 1.017, contact: 1.078, vision: 1.044, clutch: 1.001, bunt: 0.88, speed: 0.9, bats: 'L',
    bio: 'Everybody owns a piece and nobody makes a dollar.' },
  { id: 'okc7', name: 'Twister Season Deel', build: 'augmented', trait: 'showman', power: 1.16, contact: 1.012, vision: 0.968, clutch: 0.968, bunt: 0.48, speed: 0.92, bats: 'R',
    bio: 'Chases them for fun in the off-season. Has caught two.' },
  { id: 'okc8', name: 'Dry Well Kanady', build: 'human', trait: 'grit', power: 0.984, contact: 1.056, vision: 1.012, clutch: 1.034, bunt: 0.94, speed: 0.85, bats: 'R',
    bio: 'Drilled eleven and hit nothing. Still drilling.' },
  { id: 'okc9', name: 'Tent Revival Pinkston', build: 'machine', trait: 'slugger', power: 1.182, contact: 0.979, vision: 0.934, clutch: 1.001, bunt: 0.28, speed: 0.6, bats: 'L',
    bio: 'Comes through once a summer and everybody shows up for it.' },
];

const OKC_ARMS: readonly Pitcher[] = [
  {
    name: 'Dust Devil Kanady', throws: 'R', signature: 'junk', tellTiming: 'pre_pitch', zoneRate: 0.5,
    blurb: 'Spins up out of nothing and is gone before it does any damage.',
    arsenal: { curveball: 0.4, changeup: 0.35, sinker: 0.25 }, putaway: 'curveball', break: 0.94, clutch: 0.92, stamina: 0.98,
  },
  {
    name: 'Sooner Hyde', throws: 'L', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.52,
    blurb: 'Starts before the signal. Has done it his whole life.',
    arsenal: { fastball: 0.25, curveball: 0.45, changeup: 0.3 }, putaway: 'curveball', break: 0.929, clutch: 0.91, stamina: 1.06,
  },
  {
    name: 'Windbreak Coldiron', throws: 'R', signature: 'none', tellTiming: 'pre_pitch', zoneRate: 0.49,
    blurb: 'Somebody planted him in a line in 1936 and he is still standing.',
    arsenal: { sinker: 0.45, curveball: 0.32, changeup: 0.23 }, putaway: 'curveball', break: 0.922, clutch: 0.902, stamina: 1.08,
  },
];

/** ...and the three who finish it. */
const OKC_PEN: readonly Pitcher[] = [
  {
    name: 'Cimarron Rooks', throws: 'R', signature: 'none', tellTiming: 'release', zoneRate: 0.46, speedBonus: 4,
    blurb: 'One good inning in him and nobody knows which one it is.',
    arsenal: { fastball: 0.62, slider: 0.38 }, putaway: 'slider', break: 0.88, clutch: 0.93, stamina: 0.83,
  },
  {
    name: 'Grain Dust Stovall', throws: 'L', signature: 'junk', tellTiming: 'pre_pitch', zoneRate: 0.48,
    blurb: 'Gets in your eyes and there is nothing you can do about it.',
    arsenal: { changeup: 0.6, curveball: 0.4 }, putaway: 'changeup', break: 0.895, clutch: 0.883, stamina: 0.82,
  },
  {
    name: 'Last Rain Amos', throws: 'R', signature: 'none', tellTiming: 'release', zoneRate: 0.47,
    blurb: 'Everybody remembers exactly when. Nobody expects another.',
    arsenal: { fastball: 0.6, sinker: 0.4 }, putaway: 'sinker', break: 0.951, clutch: 0.938, stamina: 0.7,
  },
];

// ------------------------------------------------------------- the benches

/**
 * THE BENCH. Three men per club who do not start, and the reason the ninth
 * inning has a decision in it.
 *
 * ⚠️ WHY IT EXISTS. Every club in this league was exactly nine hitters, so the
 * man the schedule sent to the plate was the only man who could go — a .097
 * hitter with two on in the eighth was a fact you watched rather than a
 * decision you made, and "pinch hitter" was a phrase the engine could not say.
 * A lineup with nobody behind it is a batting order, not a roster.
 *
 * ⚠️ THREE ARCHETYPES, AND THEY ARE THE SAME THREE ON EVERY CLUB. In order:
 *
 *   THE BAT    Power up, contact and eye down. The man you send when you need
 *              one swing and an out costs you nothing you were going to keep.
 *   THE GLOVE  Legs and hands, no bat to speak of. He is also the fastest way
 *              to fix a defence, because assignPositions() sorts by glove and
 *              gloveOf() reads speed — putting him in moves the whole infield.
 *   THE HAND   The platoon bat, and on most clubs he hits the other way round
 *              from the men around him. platoonContact() in hit.ts is worth
 *              about eight points of contact against a breaking ball, which is
 *              the whole reason a manager carries one.
 *
 * Same three everywhere ON PURPOSE. A bench is a menu, and a menu you have to
 * re-read for every club is a menu nobody uses — you should be able to open the
 * panel in the eighth inning and know what the three buttons do before you read
 * the names. What differs between clubs is how GOOD each of the three is, not
 * what he is for.
 *
 * ⚠️ THE BENCH IS NOT PRICED INTO clubValue(), AND MUST NOT BE. Same rule as
 * identity.ts, and for a stronger reason here: the pre-game card ranks what a
 * club is worth, that ranking is calibrated, and the whole talent ladder — 73%
 * down to 29% — was measured against nine men. Adding three more to the sum
 * would silently re-rank all thirty clubs and invalidate every separation
 * number in this project's notes. The bench is depth, and depth is worth
 * nothing at all until something happens.
 *
 * So the benches are deliberately LEVEL across the league. A thin club has the
 * same three roles available as a strong one, and picking a club is still
 * picking a difficulty by the nine who start.
 *
 * ponytail: three men, not five, and no bench arms. Three covers a pinch hit, a
 * defensive change and a platoon, which is every decision a bench exists to
 * offer; a fourth would be a second version of one of them. Relief pitching is
 * already its own three-man list with its own panel and its own rest ledger —
 * see bullpen.ts and rotation.ts — and nothing here touches it.
 */

const NYE_BENCH: readonly Player[] = [
  { id: 'nyeB1', name: 'Uptown Jack Ferraro', build: 'human', trait: 'slugger', power: 1.49, contact: 0.86, vision: 0.74, clutch: 1.33, bunt: 0.3, speed: 0.72, bats: 'R',
    bio: 'Twelve years in the organisation and still dresses like a rookie with money.' },
  { id: 'nyeB2', name: 'Turnstile Ruiz', build: 'human', trait: 'precision', power: 0.74, contact: 1.06, vision: 1.08, clutch: 1.2, bunt: 1.16, speed: 1.37, bats: 'R',
    bio: 'Goes in for the ninth and the whole infield shifts a step shallower.' },
  { id: 'nyeB3', name: 'Lefty Vermilyea', build: 'human', trait: 'reader', power: 1.02, contact: 1.21, vision: 1.14, clutch: 1.26, bunt: 1.0, speed: 1.0, bats: 'L',
    bio: 'Kept around for one at-bat a week and has never once looked surprised to get it.' },
];

const NYV_BENCH: readonly Player[] = [
  { id: 'nyvB1', name: 'Pension Day Kowalczyk', build: 'human', trait: 'slugger', power: 1.44, contact: 0.88, vision: 0.76, clutch: 1.36, bunt: 0.31, speed: 0.7, bats: 'R',
    bio: 'Swings like a man settling an old argument with somebody who has left.' },
  { id: 'nyvB2', name: 'Whistle Stop Dolan', build: 'human', trait: 'grit', power: 0.76, contact: 1.04, vision: 1.09, clutch: 1.22, bunt: 1.18, speed: 1.35, bats: 'R',
    bio: 'Ran out a walk once. Nobody has been able to talk him out of it since.' },
  { id: 'nyvB3', name: 'Southpaw Nardozzi', build: 'human', trait: 'reader', power: 0.99, contact: 1.22, vision: 1.16, clutch: 1.24, bunt: 1.02, speed: 0.98, bats: 'L',
    bio: 'Waits on the slider like a man who has been told it is coming.' },
];

const LAC_BENCH: readonly Player[] = [
  { id: 'lacB1', name: 'Second Unit Bishop', build: 'augmented', trait: 'slugger', power: 1.52, contact: 0.82, vision: 0.72, clutch: 1.31, bunt: 0.28, speed: 0.76, bats: 'R',
    bio: 'Does the swing nobody films and takes none of the credit for the highlight.' },
  { id: 'lacB2', name: 'Sunset Bracamonte', build: 'human', trait: 'precision', power: 0.72, contact: 1.05, vision: 1.07, clutch: 1.18, bunt: 1.14, speed: 1.41, bats: 'L',
    bio: 'Comes in when the shadows reach the mound and is gone before they leave.' },
  { id: 'lacB3', name: 'Reseda Ottway', build: 'human', trait: 'reader', power: 1.04, contact: 1.19, vision: 1.13, clutch: 1.25, bunt: 0.98, speed: 1.02, bats: 'L',
    bio: 'From the valley, and mentions it roughly once an inning.' },
];

const LAA_BENCH: readonly Player[] = [
  { id: 'laaB1', name: 'Owens Valley Pike', build: 'human', trait: 'slugger', power: 1.46, contact: 0.85, vision: 0.75, clutch: 1.34, bunt: 0.32, speed: 0.71, bats: 'R',
    bio: 'Took everything he has from somewhere upstream and will not discuss it.' },
  { id: 'laaB2', name: 'Standpipe Aguilar', build: 'human', trait: 'grit', power: 0.75, contact: 1.07, vision: 1.1, clutch: 1.21, bunt: 1.2, speed: 1.36, bats: 'R',
    bio: 'Holds the pressure all game and lets it out in one bag at a time.' },
  { id: 'laaB3', name: 'Culvert Mendonca', build: 'human', trait: 'precision', power: 0.97, contact: 1.24, vision: 1.15, clutch: 1.23, bunt: 1.06, speed: 1.0, bats: 'L',
    bio: 'Goes under everything. Comes out the other side dry and on second.' },
];

const CHF_BENCH: readonly Player[] = [
  { id: 'chfB1', name: 'Backdraft Sowinski', build: 'human', trait: 'slugger', power: 1.5, contact: 0.84, vision: 0.73, clutch: 1.35, bunt: 0.29, speed: 0.73, bats: 'R',
    bio: 'Quiet for eight innings and then takes the roof off the place.' },
  { id: 'chfB2', name: 'Ladder Company Nash', build: 'human', trait: 'precision', power: 0.73, contact: 1.05, vision: 1.09, clutch: 1.19, bunt: 1.15, speed: 1.38, bats: 'R',
    bio: 'First man up and first man back down. Never in the picture afterwards.' },
  { id: 'chfB3', name: 'Hook And Line Petrakis', build: 'human', trait: 'reader', power: 1.0, contact: 1.2, vision: 1.17, clutch: 1.27, bunt: 1.01, speed: 0.99, bats: 'L',
    bio: 'Gets his bat on things that were already past him.' },
];

const CHI_BENCH: readonly Player[] = [
  { id: 'chiB1', name: 'Bleacher Seat Duffy', build: 'human', trait: 'slugger', power: 1.47, contact: 0.87, vision: 0.74, clutch: 1.3, bunt: 0.3, speed: 0.7, bats: 'R',
    bio: 'Hits them where he used to sit and points at the row every time.' },
  { id: 'chiB2', name: 'Ivy Wall Coyne', build: 'human', trait: 'grit', power: 0.77, contact: 1.03, vision: 1.11, clutch: 1.23, bunt: 1.17, speed: 1.34, bats: 'R',
    bio: 'Knows exactly where the ball disappears and exactly where it comes back.' },
  { id: 'chiB3', name: 'Wrigleyville Sandoval', build: 'human', trait: 'reader', power: 1.01, contact: 1.23, vision: 1.14, clutch: 1.22, bunt: 1.03, speed: 1.01, bats: 'L',
    bio: 'Plays the whole game like the wind is about to change, because it is.' },
];

const ALB_BENCH: readonly Player[] = [
  { id: 'albB1', name: 'Session Day Muldoon', build: 'human', trait: 'slugger', power: 1.45, contact: 0.86, vision: 0.75, clutch: 1.37, bunt: 0.31, speed: 0.72, bats: 'R',
    bio: 'Shows up when there is something to be decided and not one minute earlier.' },
  { id: 'albB2', name: 'Erie Lock Tyminski', build: 'human', trait: 'grit', power: 0.76, contact: 1.06, vision: 1.08, clutch: 1.2, bunt: 1.19, speed: 1.35, bats: 'R',
    bio: 'Moves men up one level at a time and never spills a drop.' },
  { id: 'albB3', name: 'Hudson Ice Baranowski', build: 'human', trait: 'precision', power: 0.98, contact: 1.22, vision: 1.16, clutch: 1.24, bunt: 1.04, speed: 0.97, bats: 'L',
    bio: 'Cold, thick and cut into blocks. Keeps until you need him in July.' },
];

const BAL_BENCH: readonly Player[] = [
  { id: 'balB1', name: 'Steamed Hardesty', build: 'human', trait: 'slugger', power: 1.43, contact: 0.88, vision: 0.76, clutch: 1.32, bunt: 0.33, speed: 0.74, bats: 'R',
    bio: 'Comes out red and loud and there is not much of him left afterwards.' },
  { id: 'balB2', name: 'Soft Shell Kirwan', build: 'human', trait: 'precision', power: 0.74, contact: 1.08, vision: 1.1, clutch: 1.21, bunt: 1.24, speed: 1.36, bats: 'L',
    bio: 'Drops one down the line about as often as he is asked to and no less.' },
  { id: 'balB3', name: 'Fells Point Ozturk', build: 'human', trait: 'reader', power: 1.0, contact: 1.21, vision: 1.15, clutch: 1.25, bunt: 1.07, speed: 1.0, bats: 'L',
    bio: 'Works the corner nobody wants and has never asked to be moved off it.' },
];

const BUF_BENCH: readonly Player[] = [
  { id: 'bufB1', name: 'Lake Effect Zagorski', build: 'human', trait: 'slugger', power: 1.48, contact: 0.85, vision: 0.73, clutch: 1.33, bunt: 0.29, speed: 0.71, bats: 'R',
    bio: 'Arrives sideways, all at once, and buries whatever was in the way.' },
  { id: 'bufB2', name: 'Salt Truck Nowak', build: 'human', trait: 'grit', power: 0.75, contact: 1.04, vision: 1.09, clutch: 1.22, bunt: 1.18, speed: 1.33, bats: 'R',
    bio: 'Out before anybody else and the reason the rest of them get anywhere.' },
  { id: 'bufB3', name: 'Skyway Pelkey', build: 'human', trait: 'precision', power: 1.02, contact: 1.2, vision: 1.13, clutch: 1.23, bunt: 1.0, speed: 1.02, bats: 'L',
    bio: 'Goes up and over the whole argument and lands on the other side of it.' },
];

const CIN_BENCH: readonly Player[] = [
  { id: 'cinB1', name: 'Smokehouse Bracken', build: 'human', trait: 'slugger', power: 1.51, contact: 0.83, vision: 0.72, clutch: 1.34, bunt: 0.28, speed: 0.7, bats: 'R',
    bio: 'Low and slow all week for about four seconds of everybody paying attention.' },
  { id: 'cinB2', name: 'Riverfront Delahoy', build: 'human', trait: 'precision', power: 0.73, contact: 1.05, vision: 1.07, clutch: 1.18, bunt: 1.15, speed: 1.39, bats: 'R',
    bio: 'Turns first the way water turns a bend, which is to say without slowing down.' },
  { id: 'cinB3', name: 'Over-The-Rhine Kessel', build: 'human', trait: 'reader', power: 0.99, contact: 1.23, vision: 1.16, clutch: 1.26, bunt: 1.02, speed: 0.99, bats: 'L',
    bio: 'Old neighbourhood, old approach, and neither one is going anywhere.' },
];

const CLE_BENCH: readonly Player[] = [
  { id: 'cleB1', name: 'Hot Rivet Sczepanski', build: 'augmented', trait: 'slugger', power: 1.53, contact: 0.81, vision: 0.71, clutch: 1.32, bunt: 0.27, speed: 0.73, bats: 'R',
    bio: 'Thrown across the gap glowing and caught in a bucket. Usually.' },
  { id: 'cleB2', name: 'Flats Lonardo', build: 'human', trait: 'grit', power: 0.76, contact: 1.06, vision: 1.1, clutch: 1.2, bunt: 1.17, speed: 1.34, bats: 'R',
    bio: 'Everything down there is flat and he still finds a way to go downhill.' },
  { id: 'cleB3', name: 'Lift Bridge Mancini', build: 'human', trait: 'precision', power: 1.03, contact: 1.19, vision: 1.14, clutch: 1.24, bunt: 1.01, speed: 1.0, bats: 'L',
    bio: 'Stops everything for as long as he needs and nobody may complain.' },
];

const DEN_BENCH: readonly Player[] = [
  { id: 'denB1', name: 'Thin Air Ballantyne', build: 'human', trait: 'slugger', power: 1.55, contact: 0.8, vision: 0.7, clutch: 1.3, bunt: 0.26, speed: 0.75, bats: 'R',
    bio: 'Everything he hits goes further than it deserves and he takes the credit.' },
  { id: 'denB2', name: 'Switchback Ferrer', build: 'human', trait: 'precision', power: 0.71, contact: 1.07, vision: 1.09, clutch: 1.19, bunt: 1.16, speed: 1.4, bats: 'R',
    bio: 'Never runs in a straight line and gets there first anyway.' },
  { id: 'denB3', name: 'Timberline Vachon', build: 'human', trait: 'reader', power: 1.0, contact: 1.21, vision: 1.15, clutch: 1.22, bunt: 1.03, speed: 1.01, bats: 'L',
    bio: 'Stops exactly where the growing stops and does not try for one foot more.' },
];

const DET_BENCH: readonly Player[] = [
  { id: 'detB1', name: 'Second Shift Kaczmarek', build: 'augmented', trait: 'slugger', power: 1.5, contact: 0.83, vision: 0.72, clutch: 1.35, bunt: 0.28, speed: 0.71, bats: 'R',
    bio: 'Clocks in at eight in the evening and the line does not slow down.' },
  { id: 'detB2', name: 'Cass Corridor Whitfield', build: 'human', trait: 'grit', power: 0.74, contact: 1.05, vision: 1.08, clutch: 1.21, bunt: 1.15, speed: 1.37, bats: 'R',
    bio: 'Grew up where you had to be quick and never worked out how to switch it off.' },
  { id: 'detB3', name: 'Piquette Ave Sobieski', build: 'human', trait: 'precision', power: 1.01, contact: 1.2, vision: 1.13, clutch: 1.23, bunt: 1.0, speed: 0.98, bats: 'L',
    bio: 'From the first plant anybody built, and mentions that it was the first.' },
];

const FLA_BENCH: readonly Player[] = [
  { id: 'flaB1', name: 'Storm Surge Okonkwo', build: 'human', trait: 'slugger', power: 1.47, contact: 0.86, vision: 0.74, clutch: 1.33, bunt: 0.3, speed: 0.78, bats: 'R',
    bio: 'Arrives after the wind has already gone and does the actual damage.' },
  { id: 'flaB2', name: 'Sawgrass Peralta', build: 'human', trait: 'precision', power: 0.72, contact: 1.06, vision: 1.08, clutch: 1.18, bunt: 1.14, speed: 1.43, bats: 'R',
    bio: 'Runs through things that would cut anybody else to ribbons.' },
  { id: 'flaB3', name: 'Overseas Highway Bonilla', build: 'human', trait: 'reader', power: 0.98, contact: 1.22, vision: 1.16, clutch: 1.24, bunt: 1.02, speed: 1.04, bats: 'L',
    bio: 'A very long way with water on both sides and no reasonable place to stop.' },
];

const KCF_BENCH: readonly Player[] = [
  { id: 'kcfB1', name: 'Hump Yard Delacroix', build: 'human', trait: 'slugger', power: 1.46, contact: 0.87, vision: 0.75, clutch: 1.34, bunt: 0.31, speed: 0.7, bats: 'R',
    bio: 'Gives it one shove at the top and lets gravity sort out the rest.' },
  { id: 'kcfB2', name: 'Caboose Mikulski', build: 'human', trait: 'grit', power: 0.75, contact: 1.04, vision: 1.09, clutch: 1.2, bunt: 1.18, speed: 1.35, bats: 'R',
    bio: 'Last man on and the only one who can see what is coming up behind.' },
  { id: 'kcfB3', name: 'Burnt Ends Halloran', build: 'human', trait: 'precision', power: 1.02, contact: 1.21, vision: 1.14, clutch: 1.25, bunt: 1.01, speed: 0.99, bats: 'L',
    bio: 'The part everybody else threw out, and now they queue for him.' },
];

const MEM_BENCH: readonly Player[] = [
  { id: 'memB1', name: 'Paddlewheel Ligon', build: 'human', trait: 'slugger', power: 1.49, contact: 0.84, vision: 0.73, clutch: 1.36, bunt: 0.29, speed: 0.72, bats: 'R',
    bio: 'Slow, loud, and moves an enormous amount of water when he finally goes.' },
  { id: 'memB2', name: 'Beale Street Fontenot', build: 'human', trait: 'precision', power: 0.73, contact: 1.07, vision: 1.1, clutch: 1.19, bunt: 1.16, speed: 1.38, bats: 'R',
    bio: 'Never plays the same bag the same way twice and it always works.' },
  { id: 'memB3', name: 'Cotton Row Aiken', build: 'human', trait: 'reader', power: 1.0, contact: 1.23, vision: 1.15, clutch: 1.23, bunt: 1.04, speed: 1.0, bats: 'L',
    bio: 'Judges everything by feel, in about a second, and is right.' },
];

const MIL_BENCH: readonly Player[] = [
  { id: 'milB1', name: 'Barrel Head Stankiewicz', build: 'human', trait: 'slugger', power: 1.48, contact: 0.85, vision: 0.74, clutch: 1.33, bunt: 0.3, speed: 0.7, bats: 'R',
    bio: 'Built round and thick and takes an enormous amount of pressure without a leak.' },
  { id: 'milB2', name: 'Stave Mill Brubaker', build: 'human', trait: 'grit', power: 0.76, contact: 1.05, vision: 1.09, clutch: 1.21, bunt: 1.17, speed: 1.34, bats: 'R',
    bio: 'Cuts everything to length and never once measures twice.' },
  { id: 'milB3', name: 'Third Ward Novotny', build: 'human', trait: 'precision', power: 0.99, contact: 1.22, vision: 1.14, clutch: 1.24, bunt: 1.02, speed: 1.01, bats: 'L',
    bio: 'Old warehouse district, old swing, and both have been quietly renovated.' },
];

const MIN_BENCH: readonly Player[] = [
  { id: 'minB1', name: 'Stone Arch Halvorsen', build: 'human', trait: 'slugger', power: 1.44, contact: 0.88, vision: 0.76, clutch: 1.35, bunt: 0.32, speed: 0.71, bats: 'R',
    bio: 'Been there a hundred years and nobody has found a reason to take him down.' },
  { id: 'minB2', name: 'Skyway Lindquist', build: 'human', trait: 'grit', power: 0.75, contact: 1.06, vision: 1.11, clutch: 1.22, bunt: 1.19, speed: 1.33, bats: 'R',
    bio: 'Gets across the whole thing without ever once going outside.' },
  { id: 'minB3', name: 'Mill City Aaberg', build: 'human', trait: 'precision', power: 1.01, contact: 1.24, vision: 1.16, clutch: 1.23, bunt: 1.05, speed: 0.98, bats: 'L',
    bio: 'Grinds it fine and does not stop until the whole load is through.' },
];

const MNE_BENCH: readonly Player[] = [
  { id: 'mneB1', name: 'Bait Barrel Thibodeau', build: 'human', trait: 'slugger', power: 1.45, contact: 0.86, vision: 0.75, clutch: 1.34, bunt: 0.31, speed: 0.73, bats: 'R',
    bio: 'Nobody wants to sit near him and everybody wants him on the boat.' },
  { id: 'mneB2', name: 'Nor’easter Pelletier', build: 'human', trait: 'precision', power: 0.74, contact: 1.07, vision: 1.09, clutch: 1.2, bunt: 1.21, speed: 1.36, bats: 'R',
    bio: 'Comes up the coast without warning and rearranges the whole harbour.' },
  { id: 'mneB3', name: 'Trap Line Ouellet', build: 'human', trait: 'reader', power: 0.98, contact: 1.23, vision: 1.15, clutch: 1.25, bunt: 1.08, speed: 1.0, bats: 'L',
    bio: 'Works the same water every day and knows every rock under it.' },
];

const NEM_BENCH: readonly Player[] = [
  { id: 'nemB1', name: 'Powder Horn Stapleton', build: 'human', trait: 'slugger', power: 1.46, contact: 0.87, vision: 0.74, clutch: 1.38, bunt: 0.3, speed: 0.71, bats: 'R',
    bio: 'Carries one shot and has never wasted it on anything ordinary.' },
  { id: 'nemB2', name: 'Bell Tower Cabral', build: 'human', trait: 'grit', power: 0.76, contact: 1.05, vision: 1.1, clutch: 1.21, bunt: 1.18, speed: 1.35, bats: 'R',
    bio: 'One if by land. He is already halfway to second by two.' },
  { id: 'nemB3', name: 'Stone Wall Prouty', build: 'human', trait: 'precision', power: 1.0, contact: 1.22, vision: 1.16, clutch: 1.24, bunt: 1.03, speed: 0.99, bats: 'L',
    bio: 'Built out of whatever the field gave up that year and has not moved since.' },
];

const NOL_BENCH: readonly Player[] = [
  { id: 'nolB1', name: 'Second Line Boudreaux', build: 'human', trait: 'slugger', power: 1.5, contact: 0.84, vision: 0.72, clutch: 1.36, bunt: 0.28, speed: 0.74, bats: 'R',
    bio: 'Turns up behind the parade and somehow ends up leading it.' },
  { id: 'nolB2', name: 'Bayou Runner Chauvin', build: 'human', trait: 'precision', power: 0.72, contact: 1.06, vision: 1.08, clutch: 1.18, bunt: 1.15, speed: 1.42, bats: 'R',
    bio: 'Knows every channel through it and has never told anybody which one.' },
  { id: 'nolB3', name: 'Gaslamp Thibault', build: 'human', trait: 'reader', power: 0.99, contact: 1.23, vision: 1.17, clutch: 1.26, bunt: 1.02, speed: 1.02, bats: 'L',
    bio: 'Only really visible after dark, which is when they need him anyway.' },
];

const OKC_BENCH: readonly Player[] = [
  { id: 'okcB1', name: 'Section Line Yeager', build: 'human', trait: 'slugger', power: 1.47, contact: 0.85, vision: 0.73, clutch: 1.32, bunt: 0.3, speed: 0.72, bats: 'R',
    bio: 'Draws a straight line across everything and dares the weather to argue.' },
  { id: 'okcB2', name: 'Sooner Gap Mullen', build: 'human', trait: 'grit', power: 0.75, contact: 1.04, vision: 1.08, clutch: 1.2, bunt: 1.17, speed: 1.39, bats: 'R',
    bio: 'Left before the gun and has been apologising for it for two generations.' },
  { id: 'okcB3', name: 'Red Bed Chalfant', build: 'human', trait: 'precision', power: 1.01, contact: 1.2, vision: 1.13, clutch: 1.22, bunt: 1.01, speed: 1.0, bats: 'L',
    bio: 'The dirt out there stains everything and he has stopped washing it out.' },
];

const PHI_BENCH: readonly Player[] = [
  { id: 'phiB1', name: 'Broad Street Kolodziej', build: 'augmented', trait: 'slugger', power: 1.52, contact: 0.82, vision: 0.71, clutch: 1.33, bunt: 0.27, speed: 0.72, bats: 'R',
    bio: 'Booed on the way to the plate and booed on the way back, both times loudly.' },
  { id: 'phiB2', name: 'Navy Yard Tiernan', build: 'human', trait: 'grit', power: 0.74, contact: 1.05, vision: 1.09, clutch: 1.21, bunt: 1.16, speed: 1.34, bats: 'R',
    bio: 'Everything down there is riveted and so is he.' },
  { id: 'phiB3', name: 'Fishtown Rzepka', build: 'human', trait: 'precision', power: 1.02, contact: 1.21, vision: 1.14, clutch: 1.24, bunt: 1.0, speed: 0.98, bats: 'L',
    bio: 'Has an opinion about the swing you just took and you are going to hear it.' },
];

const PHX_BENCH: readonly Player[] = [
  { id: 'phxB1', name: 'Dry Heat Villaseñor', build: 'human', trait: 'slugger', power: 1.48, contact: 0.85, vision: 0.73, clutch: 1.31, bunt: 0.29, speed: 0.73, bats: 'R',
    bio: 'It is not so bad, he says, right up until it takes everything you had.' },
  { id: 'phxB2', name: 'Saguaro Ibarra', build: 'human', trait: 'precision', power: 0.72, contact: 1.06, vision: 1.07, clutch: 1.19, bunt: 1.14, speed: 1.4, bats: 'R',
    bio: 'Stands very still for a very long time and then takes an enormous stride.' },
  { id: 'phxB3', name: 'Monsoon Aguirre', build: 'human', trait: 'reader', power: 1.0, contact: 1.22, vision: 1.15, clutch: 1.23, bunt: 1.02, speed: 1.01, bats: 'L',
    bio: 'Nothing all year and then the whole year in twenty minutes.' },
];

const PIT_BENCH: readonly Player[] = [
  { id: 'pitB1', name: 'Slag Heap Yancovic', build: 'human', trait: 'slugger', power: 1.49, contact: 0.84, vision: 0.72, clutch: 1.35, bunt: 0.28, speed: 0.7, bats: 'R',
    bio: 'What is left over after the useful part, and it is still hot enough to matter.' },
  { id: 'pitB2', name: 'Incline Vukovich', build: 'human', trait: 'grit', power: 0.76, contact: 1.04, vision: 1.1, clutch: 1.22, bunt: 1.18, speed: 1.33, bats: 'R',
    bio: 'Goes up the side of the hill at a fixed speed and never once slips.' },
  { id: 'pitB3', name: 'Three Rivers Kubiak', build: 'human', trait: 'precision', power: 1.01, contact: 1.2, vision: 1.14, clutch: 1.23, bunt: 1.02, speed: 1.0, bats: 'L',
    bio: 'Two go in and one comes out, and he has never explained the arithmetic.' },
];

const SEA_BENCH: readonly Player[] = [
  { id: 'seaB1', name: 'Drydock Halvorson', build: 'human', trait: 'slugger', power: 1.45, contact: 0.87, vision: 0.75, clutch: 1.34, bunt: 0.31, speed: 0.71, bats: 'R',
    bio: 'Everything gets pulled out of the water and looked at properly before he swings.' },
  { id: 'seaB2', name: 'Pike Place Okada', build: 'human', trait: 'precision', power: 0.74, contact: 1.07, vision: 1.11, clutch: 1.2, bunt: 1.19, speed: 1.37, bats: 'R',
    bio: 'Catches everything thrown at him, from any angle, without looking twice.' },
  { id: 'seaB3', name: 'Low Cloud Bergstrom', build: 'human', trait: 'reader', power: 0.98, contact: 1.24, vision: 1.17, clutch: 1.25, bunt: 1.04, speed: 0.99, bats: 'L',
    bio: 'Sits on everything all day and lifts for about an hour in the evening.' },
];

const SFO_BENCH: readonly Player[] = [
  { id: 'sfoB1', name: 'Cable Car Mazzola', build: 'human', trait: 'slugger', power: 1.44, contact: 0.88, vision: 0.76, clutch: 1.33, bunt: 0.32, speed: 0.74, bats: 'R',
    bio: 'Grabs hold of the thing under the street and lets it drag him up the hill.' },
  { id: 'sfoB2', name: 'Karl The Fog Quan', build: 'human', trait: 'precision', power: 0.73, contact: 1.06, vision: 1.09, clutch: 1.18, bunt: 1.2, speed: 1.38, bats: 'R',
    bio: 'Rolls in over the wall and nobody can see the ball for an inning and a half.' },
  { id: 'sfoB3', name: 'Barbary Coast Doyle', build: 'human', trait: 'reader', power: 1.0, contact: 1.23, vision: 1.16, clutch: 1.24, bunt: 1.06, speed: 1.01, bats: 'L',
    bio: 'Woke up on a different club twice and does not talk about either time.' },
];

const STL_BENCH: readonly Player[] = [
  { id: 'stlB1', name: 'Levee Board Krumholz', build: 'human', trait: 'slugger', power: 1.46, contact: 0.86, vision: 0.74, clutch: 1.36, bunt: 0.3, speed: 0.71, bats: 'R',
    bio: 'Decides where the water goes and has never once been thanked for it.' },
  { id: 'stlB2', name: 'Towboat Escalante', build: 'human', trait: 'grit', power: 0.75, contact: 1.05, vision: 1.09, clutch: 1.21, bunt: 1.17, speed: 1.36, bats: 'R',
    bio: 'Pushes a great deal more than himself and never appears to be trying.' },
  { id: 'stlB3', name: 'Soulard Wysocki', build: 'human', trait: 'precision', power: 1.02, contact: 1.21, vision: 1.15, clutch: 1.23, bunt: 1.03, speed: 0.98, bats: 'L',
    bio: 'Been at the same market stall since before the club and outlasts managers.' },
];

const TEX_BENCH: readonly Player[] = [
  { id: 'texB1', name: 'Caliche Road Duplantis', build: 'human', trait: 'slugger', power: 1.51, contact: 0.83, vision: 0.71, clutch: 1.32, bunt: 0.27, speed: 0.73, bats: 'R',
    bio: 'Hard, white, and rattles everything that goes across him at speed.' },
  { id: 'texB2', name: 'Pumpjack Salinas', build: 'human', trait: 'precision', power: 0.72, contact: 1.05, vision: 1.07, clutch: 1.19, bunt: 1.14, speed: 1.41, bats: 'R',
    bio: 'Same motion, all day, all night, and it never once gets tired of itself.' },
  { id: 'texB3', name: 'Stockyard Renteria', build: 'human', trait: 'reader', power: 0.99, contact: 1.22, vision: 1.14, clutch: 1.25, bunt: 1.01, speed: 1.02, bats: 'L',
    bio: 'Moves an awful lot of something through a very narrow gate without a fuss.' },
];

const TOR_BENCH: readonly Player[] = [
  { id: 'torB1', name: 'Red Eye Fitzgibbon', build: 'human', trait: 'slugger', power: 1.47, contact: 0.85, vision: 0.74, clutch: 1.34, bunt: 0.29, speed: 0.72, bats: 'R',
    bio: 'Lands at six, sleeps until four, and hits one out at nine.' },
  { id: 'torB2', name: 'Layover Sivakumar', build: 'human', trait: 'grit', power: 0.75, contact: 1.06, vision: 1.1, clutch: 1.2, bunt: 1.18, speed: 1.36, bats: 'R',
    bio: 'Has been through more airports than parks and prefers it that way.' },
  { id: 'torB3', name: 'Customs Line Beauchamp', build: 'human', trait: 'precision', power: 1.0, contact: 1.23, vision: 1.16, clutch: 1.24, bunt: 1.02, speed: 1.0, bats: 'L',
    bio: 'Nothing gets past him and everybody resents how long it takes.' },
];

// -------------------------------------------------------------- the clubs

export interface Team {
  name: string;
  /** Three letters for the scoreboard. */
  abbr: string;
  /** Nine players, in batting order. Slot 0 leads off. */
  lineup: readonly Player[];
  /**
   * THE THREE STARTERS, ace first.
   *
   * ⚠️ IT USED TO BE THE WHOLE STAFF — one starter and two relievers in one
   * array — and that is why every club started the same man all fourteen games
   * of a season. `newStaff()` opened with `rotation[0]` and nothing ever chose
   * anybody else. Splitting the array is what makes a rotation possible at all.
   *
   * ⚠️ The live arm is NOT here. A Team is static configuration; who is
   * currently on the mound is game STATE and lives in TeamState.staff.
   */
  rotation: readonly Pitcher[];
  /**
   * THE THREE RELIEVERS, in the order a manager would ordinarily reach for
   * them — long man, setup, closer.
   *
   * ⚠️ THE ORDER IS A DEFAULT, NOT A RULE. goToBullpen() takes an index, so
   * both you and the computer pick which arm comes in; this order is only what
   * the list is drawn in and who the computer falls back to.
   */
  bullpen: readonly Pitcher[];
  /**
   * HOW THIS CLUB PLAYS — see identity.ts.
   *
   * ⚠️ OPTIONAL, AND IT HAS TO STAY OPTIONAL. A Season stores its rosters
   * WHOLE, so a franchise saved before identities existed contains thirty
   * clubs with no `identity` on them and has to keep loading. Every knob
   * defaults to 1.0 through knob(), which is exactly the engine that measured
   * 39.2 points of spread before this field was added.
   *
   * ⚠️ IT IS NOT PART OF WHAT A CLUB IS WORTH. value.ts does not read it and
   * must not start — the rank on the pre-game card is what the PLAYERS are
   * worth, and the identity is what the manager does with them. See the header
   * in identity.ts for why.
   */
  identity?: Identity;
  /**
   * THE THREE WHO DO NOT START — see the bench section above for what each of
   * them is for.
   *
   * ⚠️ OPTIONAL, AND IT HAS TO STAY OPTIONAL, for the same reason `identity`
   * does: a Season stores its rosters WHOLE, so a franchise saved before
   * benches existed holds thirty clubs with no bench on them and has to keep
   * loading. Everything that reads this reads `bench ?? []`, and a club with an
   * empty bench is simply a club with nobody to send up — which is exactly the
   * game as it was.
   *
   * ⚠️ IT IS NOT PART OF WHAT A CLUB IS WORTH. value.ts does not read it and
   * must not start. See the bench section header: the ladder was measured
   * against nine men, and adding three more to the sum would re-rank all thirty
   * clubs without anybody deciding to.
   *
   * ⚠️ THE LINEUP IS THE RECORD OF WHO HAS COME IN. A pinch hitter is written
   * into `lineup` in the GAME's copy of the club and the man he hit for is
   * written out, so "who is left on the bench" is `bench` minus whoever is
   * already in the lineup. There is no separate used-list to keep in step —
   * see pinchHit() in game.ts.
   */
  bench?: readonly Player[];
}

/** The starter, for callers that only want to name him. */
export const starterOf = (t: Team): Pitcher => t.rotation[0]!;

/**
 * THE THIRTY, in the order the start screen deals them out — the three
 * two-club towns first, then everybody else alphabetically by abbreviation.
 *
 * ⚠️ THIS ARRAY IS THE LEAGUE. Nothing else in the engine counts clubs: the
 * schedule reads its length, the standings table is one row per entry, and the
 * pre-game card ranks a club against exactly what is in here. Cutting a club is
 * deleting a line, which is the shape the customisation screen will write to.
 */
/**
 * ⚠️ THE IDENTITY ON EACH ROW IS READ OFF THE PROSE ABOVE THAT CLUB, NOT
 * CHOSEN TO BALANCE ANYTHING. Every club in this file already had a paragraph
 * saying how it plays — Baltimore bunts for a hit, Phoenix has three arms and
 * no fourth, Chicago's south side is named for the man who comes in to put the
 * rally out. All of that was flavour text the engine could not read. These
 * eight tags are the same sentences, in a form the manager can act on.
 *
 * So if a tag ever looks wrong, the fix is to re-read the club's own header
 * before touching the numbers in identity.ts. A tag that disagrees with the
 * paragraph above it is the bug.
 */
const WRITTEN: readonly Team[] = [
  // The big markets. Two clubs each, and the money is the reason they can —
  // though only one of the six is actually spending it. See LAA and LAC.
  { name: 'New York City Empire', abbr: 'NYE', lineup: NYE, rotation: NYE_ARMS, bullpen: NYE_PEN, bench: NYE_BENCH, identity: IDENTITIES.BIG_INNING },
  { name: 'New York Vets', abbr: 'NYV', lineup: NYV, rotation: NYV_ARMS, bullpen: NYV_PEN, bench: NYV_BENCH, identity: IDENTITIES.GRINDERS },
  { name: 'Los Angeles Comets', abbr: 'LAC', lineup: LAC, rotation: LAC_ARMS, bullpen: LAC_PEN, bench: LAC_BENCH, identity: IDENTITIES.TRACK_TEAM },
  { name: 'Los Angeles Aqueducts', abbr: 'LAA', lineup: LAA, rotation: LAA_ARMS, bullpen: LAA_PEN, bench: LAA_BENCH, identity: IDENTITIES.SMALL_BALL },
  { name: 'Chicago Firemen', abbr: 'CHF', lineup: CHF, rotation: CHF_ARMS, bullpen: CHF_PEN, bench: CHF_BENCH, identity: IDENTITIES.QUICK_HOOK },
  { name: 'Chicago Ivy', abbr: 'CHI', lineup: CHI, rotation: CHI_ARMS, bullpen: CHI_PEN, bench: CHI_BENCH, identity: IDENTITIES.GRINDERS },

  // One-club towns. Toronto is the only one outside the country, which is the
  // whole joke in its name — nobody travels like they do.
  { name: 'Albany Holdouts', abbr: 'ALB', lineup: ALB, rotation: ALB_ARMS, bullpen: ALB_PEN, bench: ALB_BENCH, identity: IDENTITIES.GRINDERS },
  { name: 'Baltimore Crabbers', abbr: 'BAL', lineup: BAL, rotation: BAL_ARMS, bullpen: BAL_PEN, bench: BAL_BENCH, identity: IDENTITIES.SMALL_BALL },
  { name: 'Buffalo Snowplows', abbr: 'BUF', lineup: BUF, rotation: BUF_ARMS, bullpen: BUF_PEN, bench: BUF_BENCH, identity: IDENTITIES.IRON_ARMS },
  { name: 'Cincinnati Pigs', abbr: 'CIN', lineup: CIN, rotation: CIN_ARMS, bullpen: CIN_PEN, bench: CIN_BENCH, identity: IDENTITIES.HACKERS },
  { name: 'Cleveland Rivets', abbr: 'CLE', lineup: CLE, rotation: CLE_ARMS, bullpen: CLE_PEN, bench: CLE_BENCH, identity: IDENTITIES.BIG_INNING },
  { name: 'Denver Void', abbr: 'DEN', lineup: DEN, rotation: DEN_ARMS, bullpen: DEN_PEN, bench: DEN_BENCH, identity: IDENTITIES.QUICK_HOOK },
  { name: 'Detroit Foundry', abbr: 'DET', lineup: DET, rotation: DET_ARMS, bullpen: DET_PEN, bench: DET_BENCH, identity: IDENTITIES.BIG_INNING },
  { name: 'Florida Stingrays', abbr: 'FLA', lineup: FLA, rotation: FLA_ARMS, bullpen: FLA_PEN, bench: FLA_BENCH, identity: IDENTITIES.TRACK_TEAM },
  { name: 'Kansas City Freight', abbr: 'KCF', lineup: KCF, rotation: KCF_ARMS, bullpen: KCF_PEN, bench: KCF_BENCH, identity: IDENTITIES.HACKERS },
  { name: 'Memphis Riverboats', abbr: 'MEM', lineup: MEM, rotation: MEM_ARMS, bullpen: MEM_PEN, bench: MEM_BENCH, identity: IDENTITIES.IRON_ARMS },
  { name: 'Milwaukee Coopers', abbr: 'MIL', lineup: MIL, rotation: MIL_ARMS, bullpen: MIL_PEN, bench: MIL_BENCH, identity: IDENTITIES.BIG_INNING },
  { name: 'Minneapolis Millers', abbr: 'MIN', lineup: MIN, rotation: MIN_ARMS, bullpen: MIN_PEN, bench: MIN_BENCH, identity: IDENTITIES.GRINDERS },
  { name: 'Maine Lobsters', abbr: 'MNE', lineup: MNE, rotation: MNE_ARMS, bullpen: MNE_PEN, bench: MNE_BENCH, identity: IDENTITIES.SMALL_BALL },
  { name: 'New England Minutemen', abbr: 'NEM', lineup: NEM, rotation: NEM_ARMS, bullpen: NEM_PEN, bench: NEM_BENCH, identity: IDENTITIES.GRINDERS },
  { name: 'New Orleans Spirit', abbr: 'NOL', lineup: NOL, rotation: NOL_ARMS, bullpen: NOL_PEN, bench: NOL_BENCH, identity: IDENTITIES.HACKERS },
  { name: 'Oklahoma City Dustbowl', abbr: 'OKC', lineup: OKC, rotation: OKC_ARMS, bullpen: OKC_PEN, bench: OKC_BENCH, identity: IDENTITIES.IRON_ARMS },
  { name: 'Philadelphia Ironsides', abbr: 'PHI', lineup: PHI, rotation: PHI_ARMS, bullpen: PHI_PEN, bench: PHI_BENCH, identity: IDENTITIES.BIG_INNING },
  // ⚠️ PHOENIX IS STEADY AND IT LOOKS LIKE A MISTAKE. "Two Hundred Innings
  // Bly" reads as IRON ARMS and it was, for one measurement: it cost them five
  // points of win rate, because `hook` multiplies limitOf(), limitOf() already
  // scales by stamina, and this staff runs 0.84-1.05. Riding a low-stamina arm
  // 28% past a limit that is already short is not a philosophy, it is abuse.
  // Their identity is the one thing no simulated game can price — see the
  // club's own header. Against a person they are the hardest club in the
  // league, and the tag for that is honesty about the sim.
  { name: 'Phoenix Flames', abbr: 'PHX', lineup: PHX, rotation: PHX_ARMS, bullpen: PHX_PEN, bench: PHX_BENCH, identity: IDENTITIES.STEADY },
  { name: 'Pittsburgh Puddlers', abbr: 'PIT', lineup: PIT, rotation: PIT_ARMS, bullpen: PIT_PEN, bench: PIT_BENCH, identity: IDENTITIES.HACKERS },
  { name: 'Seattle Rain-Men', abbr: 'SEA', lineup: SEA, rotation: SEA_ARMS, bullpen: SEA_PEN, bench: SEA_BENCH, identity: IDENTITIES.GRINDERS },
  { name: 'San Francisco Foghorns', abbr: 'SFO', lineup: SFO, rotation: SFO_ARMS, bullpen: SFO_PEN, bench: SFO_BENCH, identity: IDENTITIES.SMALL_BALL },
  { name: 'St. Louis Ferryman', abbr: 'STL', lineup: STL, rotation: STL_ARMS, bullpen: STL_PEN, bench: STL_BENCH, identity: IDENTITIES.GRINDERS },
  { name: 'Texas Wildcats', abbr: 'TEX', lineup: TEX, rotation: TEX_ARMS, bullpen: TEX_PEN, bench: TEX_BENCH, identity: IDENTITIES.HACKERS },
  { name: 'Toronto Travelers', abbr: 'TOR', lineup: TOR, rotation: TOR_ARMS, bullpen: TOR_PEN, bench: TOR_BENCH, identity: IDENTITIES.STEADY },
];

// ------------------------------------------------- how far apart they are

/**
 * THE LADDER, NARROWED. Every club above is written as itself; this pulls the
 * thirty of them toward each other before anybody plays a game.
 *
 * ⚠️ READ THE NOTE ON TALENT_SPREAD IN tuning.ts FIRST — it is where the
 * measurement lives and where the knob is. The short version: as written, the
 * ladder ran 72.4% to 30.3%, which is twice and a half real baseball's spread,
 * and over a full season it produced a champion better than any club that has
 * ever existed.
 *
 * ⚠️ THE CLUB'S MEAN MOVES; THE MAN'S DISTANCE FROM IT DOES NOT. For each
 * rating, a club's average is pulled toward the league's average, and every
 * player is then placed at exactly the offset from his own club's average that
 * teams.ts gave him. Two consequences, and both are the point:
 *
 *   1. A lineup still has a three-hitter and a hole at the bottom. Compressing
 *      raw ratings toward one league mean would have flattened THAT too, and
 *      the batting order is a decision precisely because the nine men are not
 *      the same.
 *   2. The ladder is very nearly preserved — Spearman 0.97 against the league
 *      as written — but it is NOT preserved exactly, and an earlier draft of
 *      this comment claimed it was. temper.test.ts caught the claim. Two real
 *      reasons, both of them things value.ts is deliberately doing:
 *
 *        - gloveOf() multiplies range by a BUILD factor, and a machine being
 *          surer-handed than a human is an identity, not a rung of the talent
 *          ladder. It does not compress, so a club whose edge is mostly leather
 *          keeps more of it than one whose edge is mostly bats.
 *        - playerValue() pays a LUMP at EXTRA_BASE_SPEED rather than a slope,
 *          so pulling a lineup's legs toward the league average carries some
 *          men across that line and not others. A threshold cannot be scaled.
 *
 *      The two clubs that move furthest are both the fast ones, which is the
 *      threshold showing its work. Everything the rank is FOR still holds: it
 *      is computed on the tempered clubs, which are the clubs that play, so the
 *      card never disagrees with the season.
 *
 * ⚠️ IT IS APPLIED ONCE, HERE, AT THE ONE PLACE CLUBS ARE BORN. Everything
 * downstream — the engine, value.ts, the ratings on the namecard — reads the
 * tempered club and nothing has to know this happened. Doing it at read time
 * instead would mean the card and the at-bat could disagree about a man.
 *
 * ponytail: a flat scale, not a curve. There is no reason to believe the
 * distance between the first and second club should compress differently from
 * the distance between the ninth and tenth, and inventing a curve to say so
 * would be a shape nobody measured.
 */
const BAT_KEYS = ['power', 'contact', 'vision', 'clutch', 'bunt', 'speed'] as const;

/**
 * The arm ratings that are worth something and their defaults.
 *
 * ⚠️ THE DEFAULTS ARE THE ONES THE ENGINE ALREADY USES. Every read site of
 * these is written `a.break ?? 1` or `a.speedBonus ?? 0`, so an arm with the
 * field missing IS an arm at the default — tempering writes that value out
 * explicitly rather than skipping him, or a club of undefineds would be immune
 * to the compression its rivals got.
 */
const ARM_KEYS = {
  zoneRate: 0.55,
  break: 1,
  clutch: 1,
  stamina: 1,
  speedBonus: 0,
} as const;

type ArmKey = keyof typeof ARM_KEYS;

const mean = (xs: readonly number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

const armOf = (a: Pitcher, k: ArmKey): number => (a[k] ?? ARM_KEYS[k]) as number;

function temper(written: readonly Team[], k: number): readonly Team[] {
  if (k === 1) return written;

  // Each club's average at each rating, then the league's average of those.
  // ⚠️ AVERAGED OVER CLUBS, NOT OVER PLAYERS. A club is one rung of the ladder
  // however many men it dresses, and a per-player mean would quietly weight a
  // club with a deeper bench more heavily than one without.
  const batMid: Record<string, number> = {};
  for (const key of BAT_KEYS) {
    batMid[key] = mean(written.map((t) => mean(t.lineup.map((p) => p[key]))));
  }
  // ⚠️ THE BENCH IS ITS OWN POPULATION WITH ITS OWN CENTRE, and the first cut
  // of this got it wrong in a way bench.test.ts caught. That version moved a
  // club's three reserves by the shift its LINEUP got, reasoning that a pinch
  // hitter is measured against the man he replaces. What it actually did was
  // OVERSHOOT: benches vary far less between clubs than nines do, so
  // subtracting six tenths of a lineup's deviation pushed each bench past the
  // league average and out the other side, and the spread across the thirty
  // benches came out WIDER than before compression — and wider than the
  // compressed lineups, which is the second, hidden talent ladder that test
  // exists to forbid. Centring the bench on the bench average scales it by the
  // same k as everything else, which is all that was ever wanted.
  const benchMid: Record<string, number> = {};
  for (const key of BAT_KEYS) {
    const withBench = written.filter((t) => t.bench && t.bench.length > 0);
    benchMid[key] = mean(withBench.map((t) => mean(t.bench!.map((p) => p[key]))));
  }
  const armMid: Record<string, number> = {};
  for (const key of Object.keys(ARM_KEYS) as ArmKey[]) {
    armMid[key] = mean(
      written.map((t) => mean([...t.rotation, ...t.bullpen].map((a) => armOf(a, key)))),
    );
  }

  /** Where a club's average sits after the pull, per rating. */
  const shifted = (clubMean: number, leagueMean: number): number =>
    leagueMean + (clubMean - leagueMean) * k;

  return written.map((t): Team => {
    const staff = [...t.rotation, ...t.bullpen];

    const batShift: Record<string, number> = {};
    for (const key of BAT_KEYS) {
      const was = mean(t.lineup.map((p) => p[key]));
      batShift[key] = shifted(was, batMid[key]!) - was;
    }
    const armShift: Record<string, number> = {};
    for (const key of Object.keys(ARM_KEYS) as ArmKey[]) {
      const was = mean(staff.map((a) => armOf(a, key)));
      armShift[key] = shifted(was, armMid[key]!) - was;
    }

    const benchShift: Record<string, number> = {};
    if (t.bench && t.bench.length > 0) {
      for (const key of BAT_KEYS) {
        const was = mean(t.bench.map((p) => p[key]));
        benchShift[key] = shifted(was, benchMid[key]!) - was;
      }
    }

    /** One hitter, moved by whichever group's shift he belongs to. */
    const bat = (shift: Record<string, number>) => (p: Player): Player => {
      const out = { ...p };
      for (const key of BAT_KEYS) out[key] = Math.max(0.05, p[key] + (shift[key] ?? 0));
      return out;
    };

    const arm = (a: Pitcher): Pitcher => {
      const out = { ...a };
      for (const key of Object.keys(ARM_KEYS) as ArmKey[]) {
        const v = armOf(a, key) + armShift[key]!;
        // zoneRate is a share of pitches and the rest are multipliers; both
        // want a floor, and the share wants a ceiling it already has elsewhere.
        out[key] = key === 'zoneRate' ? Math.max(0.2, Math.min(0.95, v)) : Math.max(0.05, v);
      }
      return out;
    };

    return {
      ...t,
      lineup: t.lineup.map(bat(batShift)),
      rotation: t.rotation.map(arm),
      bullpen: t.bullpen.map(arm),
      ...(t.bench ? { bench: t.bench.map(bat(benchShift)) } : {}),
    };
  });
}

/**
 * THE LEAGUE A FRANCHISE PLAYS IN, under its own rules. See rules.ts.
 *
 * ⚠️ BOTH SETTINGS ARE ROSTER TRANSFORMATIONS, WHICH IS WHY THEY LIVE HERE AND
 * HAPPEN ONCE. `parity` is temper() above. `offence` is the run environment,
 * and it is a flat multiplier on every hitter in the league — nobody gains an
 * edge, the whole scoreboard moves. Doing either per-game would be the same
 * arithmetic thirty thousand times to answer a question a season answers once,
 * and would put a knob in the at-bat loop that the pre-game card could not see.
 *
 * ⚠️ OFFENCE MOVES THE BATS, NOT THE ARMS, and that is the honest direction for
 * a knob labelled "run environment". Weakening thirty staffs to raise scoring
 * would make every ERA in the record book a lie about the pitchers; making the
 * hitters better says what actually happened in a lively year.
 *
 * ⚠️ IT DOES NOT COMPOUND WITH temper(). Compression moves each club's distance
 * from the league mean; offence scales everybody by the same factor afterwards.
 * A club that was average stays average, so the ladder is untouched by it.
 */
export function leagueUnder(parity: number, offence: number): readonly Team[] {
  const base = temper(WRITTEN, parity);
  if (offence === 1) return base;
  const hit = (p: Player): Player => ({
    ...p,
    power: p.power * offence,
    contact: p.contact * offence,
  });
  return base.map((t) => ({
    ...t,
    lineup: t.lineup.map(hit),
    ...(t.bench ? { bench: t.bench.map(hit) } : {}),
  }));
}

/**
 * The thirty clubs at the shipped defaults — what an EXHIBITION plays and what
 * every instrument in scripts/ measures. A franchise builds its own through
 * leagueUnder() at kickoff and stores it in Season.rosters; nothing in a
 * running season reads this.
 */
export const LEAGUE: readonly Team[] = temper(WRITTEN, TALENT_SPREAD);

/**
 * The clubs exactly as teams.ts writes them, compression not applied.
 *
 * Exported for scripts/sensitivity.ts and the tests that check tempering did
 * what it says. Nothing that PLAYS should read this — see temper().
 */
export const LEAGUE_AS_WRITTEN = WRITTEN;

/** A club by its three letters. */
export const club = (abbr: string): Team => LEAGUE.find((t) => t.abbr === abbr)!;

/**
 * The default pairing, for everything headless — sim.ts, scripts/balance.ts.
 * The all-human club at home against the all-machine one.
 */
export const HOME: Team = club('ALB');
export const AWAY: Team = club('DET');

/**
 * A player's batting stats, with no chemistry applied.
 *
 * The roguelike's resolveLineup() folds in chemistry, items and power-ups. A
 * plain exhibition game has none of those, and reaching into that machinery to
 * get three numbers out would drag the whole shop layer along with it.
 */
export const statsOf = (p: Player): BatterStats => ({
  power: p.power,
  contact: p.contact,
  vision: p.vision,
  clutch: p.clutch,
  bunt: p.bunt,
  speed: p.speed,
});
