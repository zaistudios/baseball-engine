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
// Type-only, so it erases and there is no cycle with look.ts's `import type
// { Team }` going the other way.
import type { Uniform } from './look.ts';
import { loadCustomLeague } from './league.ts';
import { TALENT_SPREAD } from './tuning.ts';
import { fillRoster } from './depth.ts';
import type { Position } from '../core/roster.ts';
import type { BatSide, Hand } from '../core/hit.ts';
import type { Signature, TellTiming } from '../core/pitcher.ts';
import type { PitchType } from '../core/hitTables.ts';


// ------------------------------------------------------------- compact builders
// Compact player & pitcher builders: eliminates ~45kB of repeated property keys
const h = (
  id: string,
  name: string,
  build: Player['build'],
  trait: Player['trait'],
  power: number,
  contact: number,
  vision: number,
  clutch: number,
  bunt: number,
  speed: number,
  bats: BatSide,
  pos: Position,
  bio: string,
  secondaryPos?: readonly Position[],
): Player => ({
  id, name, build, trait, power, contact, vision, clutch, bunt, speed, bats, pos, bio,
  ...(secondaryPos ? { secondaryPos } : {}),
});

const a = (
  name: string,
  throws: Hand,
  signature: Signature,
  tellTiming: TellTiming,
  zoneRate: number,
  blurb: string,
  arsenal: Partial<Record<PitchType, number>>,
  putaway: PitchType,
  brk: number,
  clutch: number,
  stamina: number,
  speedBonus?: number,
): Pitcher => ({
  name, throws, signature, tellTiming, zoneRate, blurb, arsenal, putaway, break: brk, clutch, stamina,
  ...(speedBonus !== undefined ? { speedBonus } : {}),
});


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
  h("mne1", "Chowder Pelletier", "human", "grit", 0.729, 1.35, 1.32, 1.269, 1.34, 1.4, "S", "LF", "Eats before every game and tells you about it during."),
  h("mne2", "Buoy Callahan", "human", "reader", 0.835, 1.3, 1.27, 1.321, 1.07, 1.2, "S", "CF", "Bobs around out there all night. Has never once gone under."),
  h("mne3", "Claw Robichaud", "machine", "slugger", 1.839, 1, 0.88, 1.269, 0.15, 0.7, "R", "RF", "Pincer grip rated for shellfish. Goes through two bats a week."),
  h("mne4", "Hardshell Ouellette", "machine", "slugger", 1.734, 0.85, 0.81, 1.216, 0.2, 0.6, "R", "1B", "Nothing gets through him. Nothing gets out of him either."),
  h("mne5", "Bib Thibodeau", "human", "utility", 1.152, 1.2, 1.05, 1.427, 0.81, 1, "L", "3B", "Tucks a napkin into his jersey for big at-bats. It works, so nobody brings it up.", ["2B","SS"]),
  h("mne6", "Steamer Doucette", "augmented", "utility", 1.152, 1.1, 1.12, 1.11, 0.85, 1.05, "L", "2B", "Runs hot. Vents between innings and apologises for the smell.", ["3B","SS"]),
  h("mne7", "Trap Levesque", "human", "cannon", 0.941, 1.25, 1.26, 1.216, 0.95, 0.95, "R", "C", "Sets it early, waits all night, hauls it in full."),
  h("mne8", "Knuckles Pomerleau", "human", "grit", 0.888, 1.2, 1.19, 1.374, 1.06, 0.85, "R", "SS", "Broke both hands twice. Hits .300 in a mitten, which he has had to prove."),
  h("mne9", "Butter Gagnon", "augmented", "showman", 1.417, 1, 1.01, 1.427, 0.71, 0.9, "L", "DH", "Everything goes down easier with him up."),
];

/**
 * NEW YORK — bought, polished and unbothered. The most complete club in the
 * league, and the one that most enjoys being watched.
 */
const NYE: readonly Player[] = [
  h("nye1", "Sonny Vitale", "human", "showman", 1.049, 1.45, 1.14, 1.231, 0.94, 1.2, "L", "LF", "Signs autographs from the on-deck circle. Has never declined a curtain call."),
  h("nye2", "Duke Ferraro", "augmented", "reader", 1.097, 1.4, 1.28, 1.182, 1.03, 1.15, "R", "3B", "Reads the pitcher, the catcher, and the room."),
  h("nye3", "Cash Delacroix", "machine", "slugger", 1.725, 1.1, 0.89, 1.134, 0.21, 0.75, "R", "1B", "Paid by the foot. Collects."),
  h("nye4", "Broadway Lombardi", "human", "slugger", 1.58, 1.15, 1, 1.182, 0.28, 0.8, "L", "DH", "Two hits and a standing ovation, or an 0-for-4 and a statement to the press."),
  h("nye5", "Vinny Two-Strikes", "human", "ironman", 0.953, 1.35, 1.23, 1.375, 1.24, 0.95, "R", "RF", "Will not swing until he has to. Nobody has explained why it keeps working."),
  h("nye6", "Marquee Malone", "augmented", "precision", 1.242, 1.25, 1.09, 1.134, 0.75, 1, "L", "2B", "Name in lights, swing on rails."),
  h("nye7", "The Comptroller", "machine", "precision", 1.291, 1.2, 1.07, 1.037, 0.71, 0.9, "R", "C", "Files a written report on every at-bat. Will read it to you."),
  h("nye8", "Turnstile Ng", "human", "grit", 0.904, 1.3, 1.24, 1.182, 1.25, 1.1, "R", "CF", "In and out all night. You barely see him do it."),
  h("nye9", "Penthouse Pinsky", "augmented", "slugger", 1.629, 1, 0.91, 1.086, 0.34, 0.8, "R", "SS", "Only interested in the top floor."),
];

/**
 * DETROIT — the machine club, and the reason the league integrated. Enormous
 * power, hands like vices, nobody can run, and not one of them has ever
 * enjoyed a close game.
 */
const DET: readonly Player[] = [
  h("det1", "Rustbelt Rhonda", "machine", "grit", 0.828, 1.25, 1.18, 0.966, 1.05, 0.85, "L", "LF", "Forty years on the line. Oxidised, recertified, still here."),
  h("det2", "Coney Dog Kovacs", "machine", "grit", 0.874, 1.2, 1.23, 1.012, 1.08, 0.95, "R", "3B", "Built for the concession stand. Reassigned after an incident with the chili."),
  h("det3", "CRANKSHAFT", "machine", "slugger", 1.38, 0.95, 0.84, 0.92, 0.15, 0.6, "R", "1B", "Converts everything to rotation. Has no other setting."),
  h("det4", "Boxcar", "machine", "slugger", 1.426, 0.85, 0.88, 0.92, 0.18, 0.55, "R", "DH", "Freight-loading chassis with a bat bolted on. Two speeds: nothing, and the parking lot."),
  h("det5", "FORGE-9 \"Doris\"", "machine", "ironman", 1.38, 0.85, 0.86, 0.828, 0.25, 0.65, "R", "RF", "Pours at two thousand degrees. Has been asked not to celebrate indoors."),
  h("det6", "CRANE-4", "machine", "slugger", 1.288, 0.9, 0.84, 0.874, 0.22, 0.6, "R", "2B", "Lifts the ball because lifting is the only verb it has."),
  h("det7", "PISTON-8 \"Petey\"", "machine", "precision", 1.058, 1.1, 1.12, 0.874, 0.66, 0.8, "R", "C", "Up, down, up, down. Two hundred games a year, the same swing every time."),
  h("det8", "UNIT 313", "machine", "reader", 1.012, 1.1, 1.14, 0.92, 0.87, 0.85, "R", "CF", "Knows what is coming. Has never once told a teammate."),
  h("det9", "Assembly Ann", "machine", "precision", 0.92, 1.2, 1.11, 0.966, 0.67, 0.9, "L", "SS", "Same swing, ninety times an hour, for as long as you keep the line moving."),
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
  h("lac1", "Sunset Delgado", "human", "speedster", 0.801, 1.3, 1.13, 0.939, 1.12, 1.35, "S", "CF", "Plays the whole game like it is being filmed, which it usually is."),
  h("lac2", "Freeway Fujimoto", "augmented", "speedster", 0.85, 1.25, 1.22, 0.89, 1.09, 1.3, "S", "SS", "Merges without looking. Has never been thrown out doing it."),
  h("lac3", "Nova Trujillo", "machine", "slugger", 1.69, 0.9, 0.84, 0.939, 0.2, 0.8, "R", "2B", "Brief, extremely bright, gone."),
  h("lac4", "Chad Aurelius", "augmented", "slugger", 1.542, 0.95, 0.86, 0.84, 0.32, 0.95, "R", "RF", "Upgraded everything except the part that handles pressure."),
  h("lac5", "Zip Kanaloa", "human", "grit", 0.652, 1.25, 1.24, 0.989, 1.36, 1.3, "L", "3B", "Beats out the throw, then asks the first baseman about his weekend."),
  h("lac6", "Stunt Double Silva", "machine", "precision", 1.196, 1.05, 1.13, 0.89, 0.74, 1, "L", "LF", "Takes the hit-by-pitch nobody else wants. Union scale, plus the bruise."),
  h("lac7", "Valet Vasquez", "human", "reader", 0.751, 1.15, 1.27, 1.038, 1.17, 1.1, "R", "1B", "Brings it around fast and leaves it running."),
  h("lac8", "Tanner Beachwood", "human", "showman", 1.147, 1, 0.99, 1.087, 0.9, 1, "R", "C", "Third generation. Insists he earned it, and honestly might have."),
  h("lac9", "Meteor Mendez", "augmented", "slugger", 1.493, 0.85, 0.86, 0.89, 0.4, 1, "L", "DH", "Arrives without warning. Leaves a mark either way."),
];

/**
 * NEW ENGLAND — no speed, no flash, and the best club in the league with two
 * outs. They foul off eleven pitches and then beat you with a single.
 */
const NEM: readonly Player[] = [
  h("nem1", "Bunt Sheehan", "human", "reader", 0.668, 1.35, 1.23, 1.163, 1.34, 1.25, "L", "CF", "Named for the thing he does. Does it anyway, every time, and it works."),
  h("nem2", "Dunkin Muldoon", "human", "reader", 0.87, 1.3, 1.24, 1.214, 1.3, 1.15, "R", "2B", "Large regular between innings. Has been asked to stop and has not."),
  h("nem3", "Nor'easter Nolan", "human", "slugger", 1.628, 0.95, 0.9, 1.264, 0.29, 0.75, "R", "3B", "Quiet for six innings. Then the whole thing arrives at once."),
  h("nem4", "BUNKER HILL-6 \"Sully\"", "machine", "ironman", 1.628, 0.9, 0.82, 1.163, 0.19, 0.7, "R", "1B", "Built as a monument. Repurposed when the monument budget was cut."),
  h("nem5", "Flats Kelleher", "human", "grit", 1.123, 1.1, 1.02, 1.264, 0.77, 0.9, "L", "LF", "Digs in like the tide is coming and he has one more bucket to fill."),
  h("nem6", "Rotary O'Doul", "human", "reader", 0.971, 1.2, 1.23, 1.113, 0.99, 0.95, "R", "RF", "Enters without yielding. Somehow it always works out."),
  h("nem7", "Third-Shift Dziedzic", "augmented", "grit", 1.224, 1.05, 1.13, 1.011, 0.72, 0.95, "L", "C", "Better after midnight, which in a night game is most of it."),
  h("nem8", "Wicked Fahey", "human", "grit", 0.92, 1.15, 1.2, 1.315, 1.16, 0.9, "R", "SS", "The adverb is the whole scouting report."),
  h("nem9", "Musket Brolin", "augmented", "slugger", 1.527, 0.9, 0.85, 1.011, 0.29, 0.85, "R", "DH", "One shot, long reload, and you hear about it for a week."),
];

/**
 * FLORIDA — the splice club. Every one of them is modified and none of them
 * will say by whom. Fast, strange, and up for anything.
 */
const FLA: readonly Player[] = [
  h("fla1", "Early Bird Klimczak", "augmented", "speedster", 0.889, 1.35, 1.27, 1.138, 1.32, 1.2, "S", "CF", "First to the park, first to the buffet, first out of the parking lot."),
  h("fla2", "Humidity Hodges", "augmented", "speedster", 1.096, 1.25, 1.24, 1.086, 0.96, 1.1, "S", "SS", "Wears you down by the fourth. Nobody can prove he is doing it on purpose."),
  h("fla3", "Airboat Boudreaux", "augmented", "slugger", 1.562, 0.85, 0.86, 1.086, 0.34, 1, "R", "2B", "Loud, flat out, and impossible to sneak up on."),
  h("fla4", "Snowbird Vasseur", "augmented", "slugger", 1.51, 0.9, 0.79, 1.034, 0.34, 0.95, "L", "RF", "Here from November to April. Nobody has asked where he goes."),
  h("fla5", "Gator Bait Bellamy", "augmented", "showman", 1.303, 1.2, 1.08, 1.138, 0.85, 1.05, "R", "3B", "Dives into every bag headfirst. Has been warned about the canal."),
  h("fla6", "Nadia Frost", "augmented", "precision", 1.251, 1.1, 1.08, 0.983, 0.84, 0.9, "R", "LF", "Calibrated wrists, unmodified nerve. Insists the second half is what counts."),
  h("fla7", "Sinkhole Sorrentino", "augmented", "grit", 0.993, 1.2, 1.25, 1.189, 1.22, 1.1, "R", "1B", "Everything around him goes under eventually. He is always fine."),
  h("fla8", "Cousin Wade Pritchett", "augmented", "reader", 1.148, 1.15, 1.28, 1.034, 0.91, 1.05, "L", "C", "Somebody on every club claims to be related to him. Nobody has checked."),
  h("fla9", "Sunblock Ramirez", "augmented", "showman", 1.045, 1.1, 1.07, 1.086, 1.02, 1.15, "R", "DH", "Reapplies between innings. Has outlasted four managers doing it."),
];

/**
 * TEXAS — the biggest bats in the league and the worst two-strike approach in
 * it. When they connect it leaves the county. Late and close, they are done.
 */
const TEX: readonly Player[] = [
  h("tex1", "Panhandle Pruitt", "human", "grit", 0.783, 1.35, 1.25, 0.849, 1.21, 1.2, "L", "RF", "Flat, dry and goes on forever. Wears an arm out by the third time through."),
  h("tex2", "Barbed Wire Barrera", "human", "reader", 0.877, 1.3, 1.32, 0.896, 1.08, 1.1, "R", "LF", "Crowds the plate. You may have the inside corner if you can pay for it."),
  h("tex3", "Two-Ton Tolliver", "machine", "showman", 1.537, 0.85, 0.8, 0.849, 0.18, 0.6, "R", "3B", "Weighed at the gate. Charged as freight."),
  h("tex4", "Gusher Gonzalez", "human", "slugger", 1.443, 0.95, 0.9, 0.943, 0.25, 0.85, "L", "1B", "Nothing for a month, then everything at once and all over the outfield."),
  h("tex5", "Derrick Boone", "human", "showman", 1.348, 1, 0.94, 0.849, 0.4, 0.85, "R", "DH", "Same swing every time, straight down. Sooner or later it hits something."),
  h("tex6", "Crude Hensley", "machine", "precision", 1.207, 1.05, 1.11, 0.801, 0.68, 0.8, "R", "CF", "Unrefined, and the club has decided that is a style."),
  h("tex7", "Brisket Mahoney", "augmented", "showman", 1.065, 1.1, 1.05, 0.99, 0.78, 0.9, "L", "2B", "Fourteen hours, low and slow, worth the wait. Talks the same way."),
  h("tex8", "Roughneck Ruttledge", "augmented", "slugger", 1.301, 0.9, 0.83, 0.849, 0.33, 0.9, "R", "C", "Came up off a rig and swings like the shift is ending."),
  h("tex9", "Wildcat Yarborough", "human", "grit", 0.83, 1.2, 1.21, 1.037, 1.24, 1, "R", "SS", "Drills where nobody said there was anything. Hits often enough to keep drilling."),
];

/**
 * ALBANY — the last all-human club, and they will tell you about it. No power
 * anywhere in the order and the best late innings in the league.
 */
const ALB: readonly Player[] = [
  h("alb1", "Nipper Krause", "human", "reader", 0.832, 1.3, 1.32, 1.404, 1.11, 1.15, "R", "CF", "Stands at the plate with his head tipped, listening for something."),
  h("alb2", "Pothole Petrosky", "human", "reader", 0.886, 1.25, 1.18, 1.35, 1.23, 1.1, "L", "2B", "Been there for years. Everyone has agreed to steer around him."),
  h("alb3", "Preacher Vandenburg", "human", "slugger", 1.534, 0.95, 0.85, 1.458, 0.28, 0.75, "R", "3B", "Calls his shots in the third person and has yet to apologise for it."),
  h("alb4", "Sal \"The Mayor\" Bevilacqua", "human", "ironman", 1.426, 1.05, 0.97, 1.566, 0.82, 0.8, "R", "1B", "Knows everyone in the park by name and expects the same in return."),
  h("alb5", "Early Kirkwood", "human", "grit", 0.94, 1.25, 1.19, 1.404, 1.21, 1.05, "L", "LF", "Fouls off everything until the pitcher runs out of ideas. Has never been described as exciting."),
  h("alb6", "Tugboat Prendergast", "human", "slugger", 1.48, 0.95, 0.87, 1.35, 0.33, 0.7, "R", "RF", "Slow, low in the water, and moves things far heavier than himself."),
  h("alb7", "Bea \"Two Bags\" Slocum", "human", "grit", 0.994, 1.25, 1.29, 1.296, 1.06, 1.15, "L", "C", "Never stops at first. Has been out at second more than anyone alive."),
  h("alb8", "Cropsey Dunham", "human", "grit", 0.886, 1.2, 1.17, 1.35, 1.1, 0.95, "R", "SS", "The visiting clubs tell stories about him. He does nothing to correct them."),
  h("alb9", "Uncle Milt Gorczyca", "human", "precision", 1.048, 1.15, 1.15, 1.242, 0.79, 0.85, "R", "DH", "Everyone calls him uncle. Nobody can establish whose uncle he is."),
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
  a("Splash Bergeron", "L", "junk", "release", 0.55, "Pitches like the tide. Same thing all night, and it gets you.", {"fastball":0.4,"curveball":0.35,"changeup":0.25}, "curveball", 0.97, 1.02, 1.29),
  a("Sternman Doyle", "L", "none", "release", 0.5, "Hauls up whatever the starter left in the water.", {"fastball":0.25,"slider":0.75}, "slider", 1.002, 1.03, 1.06, 2),
  a("Trap Line Poulin", "R", "none", "pre_pitch", 0.5, "Four hundred of them and he can find every one in fog.", {"sinker":0.45,"curveball":0.32,"changeup":0.23}, "curveball", 0.987, 1.045, 1.08),
];

/** ...and the three who finish it. */
const MNE_PEN: readonly Pitcher[] = [
  a("The Lighthouse", "R", "painter", "none", 0.45, "Stands out there blinking at you. You hit the rocks anyway.", {"fastball":0.35,"slider":0.35,"changeup":0.3}, "slider", 0.97, 1.15, 0.76),
  a("Bait Barrel Michaud", "L", "junk", "pre_pitch", 0.49, "You smell him before the bullpen gate opens. It is a tactic.", {"changeup":0.6,"slider":0.4}, "changeup", 0.958, 1.024, 0.82),
  a("Sternman Fortin", "R", "none", "release", 0.48, "Hauls the last forty traps of the day without saying a word.", {"fastball":0.6,"sinker":0.4}, "sinker", 1.019, 1.088, 0.7),
];

/** NEW YORK — bought an arm for every situation, and they all show up. */
const NYE_ARMS: readonly Pitcher[] = [
  a("Whitey Pastore", "R", "junk", "release", 0.55, "Fourteen years, four clubs, one suit.", {"fastball":0.45,"slider":0.3,"curveball":0.25}, "slider", 1.11, 1, 1.26),
  a("Bridge Toll Bianchi", "L", "fireball", "none", 0.5, "You may come through. It will cost you.", {"fastball":0.25,"curveball":0.75}, "curveball", 1.147, 1.03, 1.1, 4),
  a("Contract Year Marchetti", "R", "none", "pre_pitch", 0.52, "Has had one every year since he signed. Nobody has explained the mechanism.", {"fastball":0.45,"slider":0.32,"changeup":0.23}, "slider", 1.13, 1.071, 1.08),
];

/** ...and the three who finish it. */
const NYE_PEN: readonly Pitcher[] = [
  a("Last Call Ippolito", "R", "painter", "none", 0.5, "Ninth inning, lights down, nobody leaves.", {"fastball":0.4,"slider":0.4,"changeup":0.2}, "slider", 1.11, 1.25, 0.9),
  a("Bridge And Tunnel Sabatini", "L", "none", "pre_pitch", 0.51, "Commutes in from the other side and is reminded of it nightly.", {"sinker":0.6,"slider":0.4}, "slider", 1.095, 1.049, 0.82),
  a("The Luxury Tax", "R", "fireball", "release", 0.5, "Costs more than the rest of the pen together and closes the door anyway.", {"fastball":0.6,"slider":0.4}, "fastball", 1.166, 1.115, 0.7, 7),
];

/** DETROIT — velocity, no tells, and perfectly happy to throw it over. */
const DET_ARMS: readonly Pitcher[] = [
  a("FURNACE-3", "R", "fireball", "none", 0.55, "Runs at temperature for six innings, then stops without warning.", {"sinker":0.45,"slider":0.3,"fastball":0.25}, "sinker", 0.97, 0.9, 1.16, 5),
  a("SECOND SHIFT", "L", "fireball", "none", 0.55, "Clocks in at the seventh. Does not converse.", {"fastball":0.25,"slider":0.75}, "slider", 1.002, 1.09, 1.06, 6),
  a("NIGHT SHIFT", "R", "none", "pre_pitch", 0.53, "Runs from eleven to seven and has never seen the day crew.", {"sinker":0.45,"slider":0.32,"fastball":0.23}, "slider", 0.987, 1.009, 1.08),
];

/** ...and the three who finish it. */
const DET_PEN: readonly Pitcher[] = [
  a("Tool & Die Tarnowski", "R", "painter", "none", 0.5, "Machines the corner to a thousandth and hands you the part.", {"fastball":0.3,"slider":0.35,"curveball":0.35}, "curveball", 0.97, 1.1, 0.76),
  a("SLAG-6", "L", "junk", "pre_pitch", 0.52, "What is left over, repurposed. Works better than it has any right to.", {"changeup":0.6,"curveball":0.4}, "changeup", 0.958, 0.989, 0.82),
  a("QUENCH TANK", "R", "fireball", "release", 0.51, "Whatever comes out of the furnace goes in here and stops moving.", {"fastball":0.6,"sinker":0.4}, "fastball", 1.019, 1.051, 0.7, 7),
];

/** LOS ANGELES COMETS — arms that were signed to be somebody else's bridge. */
const LAC_ARMS: readonly Pitcher[] = [
  a("Rex Pomeroy", "R", "junk", "release", 0.55, "Has an agent, a podcast and a changeup.", {"fastball":0.45,"changeup":0.35,"curveball":0.2}, "changeup", 0.97, 0.9, 1.16, 3),
  a("Bel Air Bracco", "L", "fireball", "release", 0.55, "Throws very hard and is extremely pleased about it.", {"fastball":0.25,"slider":0.75}, "slider", 1.002, 0.96, 0.97, 7),
  a("Waiver Wire Pham", "L", "none", "pre_pitch", 0.53, "Claimed on a Tuesday. Started on the Thursday. Still here.", {"fastball":0.45,"changeup":0.32,"curveball":0.23}, "changeup", 0.987, 0.951, 1.08),
];

/** ...and the three who finish it. */
const LAC_PEN: readonly Pitcher[] = [
  a("The Understudy", "R", "painter", "none", 0.5, "Waits in the pen for eight innings hoping something goes wrong.", {"slider":0.4,"fastball":0.35,"changeup":0.25}, "slider", 0.97, 1.05, 0.73, 5),
  a("Deferred Money Ruiz", "R", "junk", "pre_pitch", 0.52, "Gets paid in 2041 and pitches like it.", {"slider":0.6,"changeup":0.4}, "slider", 0.958, 0.931, 0.82),
  a("The Last Holdout", "R", "fireball", "release", 0.51, "Everybody else took the money. He took the ball.", {"fastball":0.6,"slider":0.4}, "fastball", 1.019, 0.99, 0.7, 7),
];

/** NEW ENGLAND — sinkers, strikes, and every one of them tips it. */
const NEM_ARMS: readonly Pitcher[] = [
  a("Cobblestone Coyne", "R", "none", "pre_pitch", 0.55, "Nothing about him is straight and none of it is an accident.", {"sinker":0.4,"fastball":0.35,"curveball":0.25}, "sinker", 0.97, 0.9, 1.16),
  a("Plow Guy Kowalczyk", "L", "none", "pre_pitch", 0.55, "Comes through at three in the morning whether you asked or not.", {"fastball":0.25,"slider":0.45,"curveball":0.3}, "slider", 1.002, 1.051, 1.04),
  a("Powder Horn Whitcomb", "R", "painter", "pre_pitch", 0.52, "Carries exactly enough and does not waste a grain of it.", {"curveball":0.45,"slider":0.32,"changeup":0.23}, "slider", 0.987, 1.036, 1.08),
];

/** ...and the three who finish it. */
const NEM_PEN: readonly Pitcher[] = [
  a("Deacon Tremblay", "R", "painter", "release", 0.45, "Paints the black, then looks at you until you accept it.", {"fastball":0.35,"curveball":0.35,"changeup":0.3}, "curveball", 0.97, 1.22, 0.81),
  a("Stone Wall Amory", "L", "none", "pre_pitch", 0.51, "Nobody mortared it and nobody has moved it in two hundred years.", {"sinker":0.6,"curveball":0.4}, "curveball", 0.958, 1.014, 0.82),
  a("Old North Pike", "R", "none", "release", 0.5, "Two lanterns and everybody in the county is already awake.", {"fastball":0.6,"slider":0.4}, "slider", 1.019, 1.078, 0.7),
];

/** FLORIDA — nobody, Florida included, knows what is coming. */
const FLA_ARMS: readonly Pitcher[] = [
  a("Mango Cruz", "R", "junk", "release", 0.5, "Sweet, unpredictable, occasionally hits somebody.", {"fastball":0.45,"sinker":0.3,"changeup":0.25}, "changeup", 0.97, 1.1, 1.29),
  a("Category Four Ortiz", "L", "fireball", "none", 0.4, "Everything at once, from a direction you were not expecting.", {"fastball":0.25,"curveball":0.75}, "curveball", 1.002, 0.89, 1.1, 8),
  a("Barrier Island Sosa", "L", "none", "pre_pitch", 0.48, "Takes the whole storm so the mainland does not have to.", {"fastball":0.45,"curveball":0.32,"changeup":0.23}, "curveball", 0.987, 1.013, 1.08),
];

/** ...and the three who finish it. */
const FLA_PEN: readonly Pitcher[] = [
  a("Retiree Delgado", "R", "junk", "pre_pitch", 0.55, "Came out of retirement for the ninth. Has now done this eleven times.", {"slider":0.4,"fastball":0.3,"changeup":0.3}, "slider", 0.97, 1.11, 0.73),
  a("Red Tide Verano", "R", "junk", "pre_pitch", 0.47, "Arrives quietly, clears the beach, nobody can say when it will go.", {"slider":0.6,"changeup":0.4}, "slider", 0.958, 0.992, 0.82),
  a("Storm Surge Okafor", "R", "fireball", "release", 0.46, "It is never the wind that gets you. It is the water behind it.", {"fastball":0.6,"sinker":0.4}, "fastball", 1.019, 1.054, 0.7, 7),
];

/** TEXAS — hard, heavy, and generous with the free pass. */
const TEX_ARMS: readonly Pitcher[] = [
  a("Buck Rowden", "R", "none", "release", 0.55, "Throws it, spits, throws it again. Four hours of that.", {"sinker":0.45,"slider":0.3,"fastball":0.25}, "sinker", 0.97, 1.11, 1.27, 2),
  a("Flare Stack Fenn", "L", "fireball", "release", 0.55, "Burns off whatever is left of the seventh.", {"slider":0.75,"fastball":0.25}, "slider", 1.002, 0.94, 0.99, 6),
  a("Gusher Tolliver", "R", "fireball", "pre_pitch", 0.55, "Nothing for six innings and then it is in the next county.", {"fastball":0.45,"slider":0.32,"sinker":0.23}, "fastball", 0.987, 1.045, 1.08, 5),
];

/** ...and the three who finish it. */
const TEX_PEN: readonly Pitcher[] = [
  a("Sidewinder Sikes", "R", "painter", "none", 0.55, "Comes at you sideways and low, and does not rattle first.", {"slider":0.45,"fastball":0.3,"curveball":0.25}, "slider", 0.97, 1.15, 0.8, 3),
  a("Roughneck Cade", "L", "none", "pre_pitch", 0.54, "Two weeks on, two off, and he is unpleasant for all four.", {"sinker":0.6,"slider":0.4}, "slider", 0.958, 1.024, 0.82),
  a("Blowout Preventer Hobbs", "R", "none", "release", 0.53, "The only thing on the whole rig that has to work.", {"fastball":0.6,"sinker":0.4}, "sinker", 1.019, 1.088, 0.7),
];

/** ALBANY — two old men who tip everything, and the last knuckleball alive. */
const ALB_ARMS: readonly Pitcher[] = [
  a("Ed Mancuso", "R", "none", "pre_pitch", 0.6, "Thirty-nine years old and gets by on knowing things.", {"fastball":0.45,"curveball":0.35,"changeup":0.2}, "curveball", 0.97, 0.91, 1.17),
  a("Erie Canal Kowal", "L", "junk", "pre_pitch", 0.5, "Slow to get going. Moves everything once he does, mostly sideways.", {"fastball":0.25,"curveball":0.41,"knuckleball":0.34}, "knuckleball", 1.002, 1.021, 1.02),
  a("Lock Seven Brennan", "L", "none", "pre_pitch", 0.52, "Raises you up, lowers you down, and you are no further along.", {"sinker":0.45,"curveball":0.32,"changeup":0.23}, "curveball", 0.987, 0.98, 1.08),
];

/** ...and the three who finish it. */
const ALB_PEN: readonly Pitcher[] = [
  a("Miss Ada Quill", "R", "painter", "release", 0.45, "Corner, corner, corner. Ninety-one pitches and no walks.", {"fastball":0.35,"slider":0.35,"changeup":0.3}, "slider", 0.97, 1.07, 0.74),
  a("Towpath Delaney", "R", "junk", "pre_pitch", 0.51, "Walks the same four miles every night at the same speed.", {"changeup":0.6,"curveball":0.4}, "changeup", 0.958, 0.96, 0.82),
  a("Capitol Dome Ferraro", "R", "painter", "release", 0.5, "Took eleven years and went wildly over budget. Worth it.", {"fastball":0.6,"slider":0.4}, "slider", 1.019, 1.02, 0.7),
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
  h("laa1", "Sluice Okonkwo", "human", "reader", 0.9, 1.16, 1.14, 1.02, 1.22, 1.24, "S", "LF", "Reads a pitcher the way the district reads a water bill. Never pays it."),
  h("laa2", "Valencia Reyes", "human", "grit", 0.94, 1.14, 1.12, 1.06, 1.18, 1.12, "S", "CF", "Grew up on the orchard the aqueduct dried out. Mentions it on camera."),
  h("laa3", "Mulholland", "machine", "slugger", 1.88, 1.22, 1.24, 1.46, 0.16, 1.18, "R", "RF", "Named for the man who took the river. The best there is, on a club going nowhere."),
  h("laa4", "Kingsley Ash", "machine", "slugger", 1.36, 0.92, 0.88, 0.98, 0.19, 0.72, "L", "1B", "Bought in the winter on the strength of one good August."),
  h("laa5", "Delta Fontaine", "human", "utility", 1.12, 1.02, 0.96, 1.04, 0.78, 0.98, "L", "3B", "Arrives late, leaves early, and is photographed doing both.", ["2B","SS"]),
  h("laa6", "Standpipe Nakamura", "machine", "utility", 1.04, 1.06, 1.02, 0.96, 0.88, 0.9, "R", "2B", "Pressure-rated, and it has never once come up.", ["3B","SS"]),
  h("laa7", "Owens Vale", "human", "cannon", 0.96, 1.12, 1.16, 1, 1.02, 1.02, "R", "C", "Took the buyout, took the job, and is still waiting on the ring."),
  h("laa8", "Cement Channel Ruiz", "machine", "grit", 1, 1.08, 1.06, 1.02, 1.05, 0.85, "R", "SS", "Straight, grey and going exactly where it went last year."),
  h("laa9", "Perpetual Flow", "machine", "slugger", 1.3, 0.9, 0.86, 0.94, 0.22, 0.78, "L", "DH", "Does not stop. Was not manufactured with the part that improves, either."),
];

const LAA_ARMS: readonly Pitcher[] = [
  a("Headgate Salcedo", "R", "painter", "release", 0.5, "Opens it exactly as far as he means to, which is not far enough any more.", {"fastball":0.3,"slider":0.35,"changeup":0.2,"curveball":0.15}, "slider", 0.96, 0.94, 1.02, 3),
  a("The Siphon", "L", "junk", "release", 0.53, "Takes what it wants and leaves the level looking untouched.", {"curveball":0.4,"changeup":0.35,"slider":0.25}, "curveball", 0.971, 0.96, 1.01),
  a("Spillway Okonkwo", "R", "none", "pre_pitch", 0.53, "Everything over the top eventually, and never in a hurry.", {"sinker":0.45,"curveball":0.32,"changeup":0.23}, "curveball", 0.936, 0.915, 1.08),
];

/** ...and the three who finish it. */
const LAA_PEN: readonly Pitcher[] = [
  a("Cistern Bly", "R", "none", "release", 0.56, "Holds everything. Gives most of it back in the eighth.", {"fastball":0.55,"sinker":0.25,"slider":0.2}, "slider", 0.86, 0.9, 0.78, 5),
  a("Drip Line Vasquez", "L", "painter", "pre_pitch", 0.52, "A little at a time, exactly where it is needed.", {"changeup":0.6,"slider":0.4}, "changeup", 0.908, 0.896, 0.82),
  a("Shutoff Valve Reyes", "R", "none", "release", 0.51, "One turn and the whole thing stops.", {"fastball":0.6,"sinker":0.4}, "sinker", 0.966, 0.952, 0.7),
];

/**
 * CHICAGO FIREMEN — the south side, named twice over: the city that burned
 * down and rebuilt on top of itself, and the ball term for the man who comes
 * in to put the rally out. THE DEEPEST PEN IN THE LEAGUE, and the only club
 * that can genuinely shorten a game on you.
 */
const CHF: readonly Player[] = [
  h("chf1", "Hook And Ladder Nowak", "machine", "speedster", 0.99, 1.22, 1.22, 1.18, 1.12, 1.08, "L", "CF", "First one on the scene and the last one to leave it."),
  h("chf2", "Halsted Byrne", "human", "utility", 1.03, 1.24, 1.26, 1.2, 1.14, 1.16, "R", "2B", "Counts pitches out loud from the box. Nobody has asked him to stop.", ["3B","SS"]),
  h("chf3", "BACKDRAFT", "machine", "slugger", 1.75, 0.92, 0.88, 1.16, 0.12, 0.7, "R", "LF", "Quiet for eight innings and then the whole room goes up at once."),
  h("chf4", "The Water Tower", "machine", "slugger", 1.63, 0.92, 0.9, 1.24, 0.15, 0.72, "L", "1B", "The one thing on this block the fire did not take. Still standing, still working."),
  h("chf5", "Mrs. O'Leary", "human", "showman", 1.43, 1, 0.98, 1.3, 0.3, 0.85, "L", "3B", "Blamed for the whole thing on no evidence and has stopped correcting people."),
  h("chf6", "Jackscrew Sobczak", "human", "precision", 1.15, 1.14, 1.16, 1.12, 0.86, 0.95, "L", "RF", "They lifted the entire city out of the mud on screws. His people turned them."),
  h("chf7", "Ashland Vukovich", "human", "utility", 1.09, 1.18, 1.2, 1.24, 1.08, 1.02, "R", "SS", "Third generation on the same block, which has burned twice.", ["2B","3B"]),
  h("chf8", "Standpipe Kowalik", "augmented", "grit", 1.23, 1.06, 1.04, 1.2, 0.72, 0.88, "R", "C", "Holds pressure all night whether or not anybody opens him."),
  h("chf9", "Third Alarm Prazak", "machine", "showman", 1.41, 1, 0.96, 1.36, 0.28, 0.92, "L", "DH", "By the time they call for him it is already bad, which is when he is best."),
];

const CHF_ARMS: readonly Pitcher[] = [
  a("Engine Company Janiak", "R", "junk", "none", 0.56, "Goes eight and hands over a building that is still standing.", {"sinker":0.4,"slider":0.3,"changeup":0.3}, "sinker", 1, 1, 1.18, 2),
  a("Smoke Eater Wilk", "L", "painter", "none", 0.5, "Walks into the inning nobody else will take.", {"slider":0.45,"curveball":0.3,"fastball":0.25}, "slider", 1.053, 1.121, 1.08),
  a("Second Alarm Duda", "L", "none", "pre_pitch", 0.54, "They only call him when the first crew is already inside.", {"fastball":0.45,"curveball":0.32,"changeup":0.23}, "curveball", 0.997, 1.091, 1.08),
];

/** ...and the three who finish it. */
const CHF_PEN: readonly Pitcher[] = [
  a("THE EXTINGUISHER", "R", "fireball", "none", 0.56, "Bases loaded, nobody out, and it is over in eleven pitches.", {"fastball":0.7,"slider":0.3}, "fastball", 0.92, 1.22, 0.88, 9),
  a("Ladder Truck Novak", "R", "none", "pre_pitch", 0.53, "Slow to arrive and then it is over very quickly.", {"sinker":0.6,"slider":0.4}, "slider", 0.967, 1.069, 0.82),
  a("THE HYDRANT", "R", "fireball", "release", 0.52, "Squat, painted red, and there is no arguing with the pressure.", {"fastball":0.6,"sinker":0.4}, "fastball", 1.029, 1.136, 0.7, 7),
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
  h("che1", "Marquee Costanza", "human", "reader", 1.028, 1.227, 1.165, 1.144, 1.26, 1.38, "L", "CF", "Up in lights on the corner since before the lights worked."),
  h("che2", "Addison Pruitt", "human", "reader", 1.072, 1.205, 1.188, 1.111, 1.16, 1.24, "R", "2B", "Knows every stop on the line and every pitcher on the circuit."),
  h("che3", "Brick Wall Dombrowski", "augmented", "slugger", 1.446, 1.034, 0.968, 1.155, 0.18, 0.9, "R", "3B", "Ninety years of it, under the vine, and it has not moved an inch."),
  h("che4", "Wrigley Nine-Ten", "machine", "ironman", 1.391, 1.056, 0.995, 1.188, 0.24, 0.85, "L", "1B", "Older than the scoreboard and cheaper to maintain."),
  h("che5", "Rooftop Marchetti", "human", "grit", 1.27, 1.122, 1.044, 1.21, 0.74, 1.05, "L", "LF", "Plays to the buildings across the street. They pay for the privilege."),
  h("che6", "Hand-Turned Ochoa", "human", "grit", 1.05, 1.188, 1.143, 1.166, 1.3, 1.2, "R", "RF", "Somebody still turns that scoreboard by hand. It is him, between innings."),
  h("che7", "Groundskeeper Ivers", "augmented", "grit", 1.171, 1.133, 1.089, 1.089, 0.8, 1.16, "R", "C", "Tends the wall. Will tell you which parts of it are older than the club."),
  h("che8", "Gale Off The Lake", "machine", "reader", 1.226, 1.111, 1.121, 1.122, 0.7, 1, "L", "SS", "Arrives without warning and rearranges the outfield."),
  h("che9", "Ivy Kowalczyk", "human", "grit", 1.105, 1.155, 1.127, 1.243, 1.12, 1.02, "R", "DH", "Grows on the wall. Has swallowed two live balls and one glove."),
];

const CHI_ARMS: readonly Pitcher[] = [
  a("Clark Street Fennimore", "L", "junk", "release", 0.55, "Twelve pitches, none of them fast, all of them somewhere else.", {"curveball":0.35,"changeup":0.35,"slider":0.3}, "changeup", 1.11, 1.05, 1.11),
  a("Daylight Nunziato", "R", "none", "none", 0.58, "Sixty years of afternoons. Has never once pitched under a light.", {"fastball":0.25,"sinker":0.41,"curveball":0.34}, "curveball", 1.094, 1.08, 1.12, 4),
  a("Bleacher Wind Aldridge", "R", "painter", "pre_pitch", 0.54, "Pitches to the flags. On a day they blow in he is unhittable.", {"curveball":0.45,"slider":0.32,"changeup":0.23}, "slider", 1.106, 1.062, 1.08),
];

/** ...and the three who finish it. */
const CHI_PEN: readonly Pitcher[] = [
  a("Sundown Bhatt", "R", "painter", "none", 0.5, "When the sun goes, the game goes. He is what happens first.", {"slider":0.4,"fastball":0.35,"changeup":0.25}, "slider", 1.09, 1.12, 0.94, 4),
  a("Ivy Vine Kaminski", "L", "junk", "pre_pitch", 0.53, "Gets into everything and takes a hundred years to get out.", {"curveball":0.6,"changeup":0.4}, "curveball", 1.072, 1.04, 0.82),
  a("Seventh Inning Braun", "R", "none", "release", 0.52, "Comes in to singing and does not appear to notice it.", {"fastball":0.6,"slider":0.4}, "slider", 1.14, 1.105, 0.7),
];

/**
 * NEW YORK VETS — the other New York, and the one that signs everybody else's
 * thirty-six-year-olds. The best eyes and the coldest nerve in the league on
 * nine men who cannot run, cannot stay healthy, and have all been let go once.
 */
const NYV: readonly Player[] = [
  h("nyv1", "Marv \"Two Knees\" Gagliardo", "human", "reader", 0.82, 1.18, 1.24, 1.27, 1.3, 0.88, "L", "CF", "Nineteenth season. Walks to first like the distance is negotiable."),
  h("nyv2", "The Perfessor", "human", "reader", 0.86, 1.16, 1.26, 1.19, 1.24, 0.82, "R", "2B", "Talks the entire at-bat. Some of it is to the pitcher, some to nobody."),
  h("nyv3", "Big Sal Dandridge", "human", "slugger", 1.38, 0.94, 0.96, 1.25, 0.38, 0.7, "R", "3B", "Led a league in home runs once. Will not say which league or when."),
  h("nyv4", "Cortisone Pete", "augmented", "ironman", 1.32, 0.9, 0.92, 1.21, 0.34, 0.66, "L", "1B", "Held together chemically and available every single day regardless."),
  h("nyv5", "Shea Kowalski", "human", "grit", 0.96, 1.1, 1.16, 1.29, 1.12, 0.8, "R", "LF", "Grew up in the parking lot of a stadium they knocked down."),
  h("nyv6", "Flushing Ray Mundy", "human", "precision", 0.9, 1.12, 1.2, 1.15, 1.18, 0.85, "L", "RF", "Out by the bay, under the flight path, and never once distracted."),
  h("nyv7", "Last Contract Lomax", "human", "grit", 1.04, 1.04, 1.1, 1.23, 0.96, 0.75, "R", "C", "Playing it out. Everybody knows, including him, and it has helped."),
  h("nyv8", "Waiver Wire Ferraro", "human", "reader", 0.88, 1.06, 1.18, 1.11, 1.1, 0.9, "R", "SS", "Four clubs in five years and hitting better at every stop."),
  h("nyv9", "Amazin Grace Petrosino", "augmented", "showman", 1.2, 0.96, 0.98, 1.33, 0.42, 0.78, "L", "DH", "One October, a long time ago, she was the best player alive."),
];

const NYV_ARMS: readonly Pitcher[] = [
  a("Doc Renner", "R", "junk", "release", 0.57, "Nothing left but the plan, and the plan is usually enough.", {"changeup":0.38,"curveball":0.34,"sinker":0.28}, "changeup", 1, 1.08, 1.12),
  a("One More Year Vitali", "L", "none", "release", 0.54, "Retires every winter and unretires by February.", {"curveball":0.44,"fastball":0.25,"changeup":0.31}, "curveball", 0.949, 1.021, 1.05),
  a("Comeback Attempt Dolan", "R", "painter", "pre_pitch", 0.53, "Third one. The first two went fine, which is the problem.", {"curveball":0.45,"changeup":0.32,"sinker":0.23}, "curveball", 0.984, 1.052, 1.08),
];

/** ...and the three who finish it. */
const NYV_PEN: readonly Pitcher[] = [
  a("Old Man Bracco", "R", "painter", "release", 0.48, "Eighty-three on the gun and nobody squares him up anyway.", {"slider":0.42,"changeup":0.33,"curveball":0.25}, "slider", 0.98, 1.12, 0.8),
  a("Pension Plan Wysocki", "L", "junk", "pre_pitch", 0.52, "Twelve more appearances and it vests. He is counting out loud.", {"changeup":0.6,"curveball":0.4}, "changeup", 0.954, 1.031, 0.82),
  a("One Last Save Ruggiero", "R", "none", "release", 0.51, "Has retired four times. The club keeps the locker made up.", {"fastball":0.6,"slider":0.4}, "slider", 1.015, 1.095, 0.7),
];


/**
 * PHILADELPHIA IRONSIDES — plate armour and a grudge. The heaviest bats outside
 * Chicago and not one man on the roster who can run.
 */
const PHI: readonly Player[] = [
  h("phi1", "Cobbled Street Boyle", "human", "grit", 1.039, 1.188, 1.143, 1.155, 1.2, 1.02, "L", "LF", "Boos his own club from the on-deck circle. They consider it support."),
  h("phi2", "Rittenhouse Ferro", "human", "reader", 1.094, 1.177, 1.165, 1.111, 1.08, 0.95, "R", "3B", "Studied the game properly. Nobody in the park lets him forget it."),
  h("phi3", "BROADSIDE", "machine", "slugger", 1.512, 1.001, 0.946, 1.144, 0.12, 0.6, "R", "1B", "Fires everything at once or not at all."),
  h("phi4", "Casemate Dziedzic", "machine", "slugger", 1.435, 1.012, 0.968, 1.177, 0.16, 0.62, "L", "DH", "Two inches of face plate and a very small window to hit through."),
  h("phi5", "Frankford Nunn", "human", "ironman", 1.303, 1.078, 1.012, 1.199, 0.4, 0.78, "R", "RF", "Takes the long way around the bases and takes his time doing it."),
  h("phi6", "Rivet Line Sczepanski", "machine", "precision", 1.182, 1.133, 1.099, 1.1, 0.76, 0.8, "R", "2B", "Same swing, ten thousand times, no complaint on record."),
  h("phi7", "Shipyard Colavito", "augmented", "grit", 1.226, 1.1, 1.044, 1.166, 0.68, 0.85, "R", "C", "Welded back together twice and hits better after each one."),
  h("phi8", "Delaware Grey", "human", "grit", 1.072, 1.144, 1.111, 1.21, 1.14, 0.9, "L", "CF", "Cold, brown and moving faster than it looks."),
  h("phi9", "Powder Room Kelleher", "augmented", "showman", 1.336, 1.023, 0.979, 1.133, 0.3, 0.75, "R", "SS", "Everything he does is loud and most of it lands short."),
];

const PHI_ARMS: readonly Pitcher[] = [
  a("Ordnance Mahaffey", "R", "painter", "release", 0.5, "Sights it, ranges it, and puts it exactly on the corner.", {"fastball":0.35,"slider":0.35,"changeup":0.3}, "slider", 1.11, 1.06, 1.12, 2),
  a("Boiler Plate Sullivan", "L", "junk", "release", 0.55, "Nothing over eighty-four and nothing hit hard either.", {"changeup":0.4,"curveball":0.35,"fastball":0.25}, "changeup", 1.116, 1.04, 1.13),
  a("Rivet Gun Mazzeo", "R", "none", "pre_pitch", 0.52, "Ninety a minute and your teeth are still going at midnight.", {"fastball":0.45,"sinker":0.32,"slider":0.23}, "sinker", 1.092, 1.036, 1.08),
];

/** ...and the three who finish it. */
const PHI_PEN: readonly Pitcher[] = [
  a("Keel Haul Novotny", "R", "none", "none", 0.52, "Drags you the length of the at-bat and lets go at the end.", {"fastball":0.5,"slider":0.3,"sinker":0.2}, "slider", 1.03, 1.07, 0.92, 6),
  a("Casemate Brogan", "L", "none", "pre_pitch", 0.51, "Fires through a slot in four feet of iron. Good luck.", {"curveball":0.6,"changeup":0.4}, "curveball", 1.059, 1.014, 0.82),
  a("Broadside Kilcoyne", "R", "fireball", "release", 0.5, "Everything at once, one time, and then it is quiet.", {"fastball":0.6,"slider":0.4}, "fastball", 1.127, 1.078, 0.7, 7),
];

/**
 * SAN FRANCISCO FOGHORNS — you hear them long before you see anything. The best
 * staff in the league and a lineup that scratches out three and holds on.
 */
const SFO: readonly Player[] = [
  h("sfo1", "Bayside Ocampo", "human", "reader", 0.962, 1.232, 1.199, 1.166, 1.3, 1.3, "S", "LF", "Sees the pitch a half-second before the fog does."),
  h("sfo2", "Marine Layer Quan", "human", "grit", 0.995, 1.21, 1.177, 1.177, 1.26, 1.2, "S", "CF", "Rolls in low, sits all night, burns off around the seventh."),
  h("sfo3", "Cable Car Ferreira", "human", "slugger", 1.314, 1.078, 1.012, 1.188, 0.42, 0.9, "R", "RF", "Grinds uphill all game and comes down on you in the ninth."),
  h("sfo4", "Dogwatch Ibarra", "augmented", "slugger", 1.347, 1.034, 0.989, 1.144, 0.26, 0.85, "L", "1B", "Works the hours nobody wants and hits like it is nine in the morning."),
  h("sfo5", "Presidio Stackhouse", "human", "utility", 1.116, 1.166, 1.133, 1.133, 0.9, 1.05, "L", "3B", "Old garrison, still standing, entirely ceremonial until it is not.", ["2B","SS"]),
  h("sfo6", "Gull", "machine", "utility", 1.16, 1.122, 1.078, 1.199, 0.72, 1.24, "R", "2B", "Takes what is left on the seats and dares anybody to say anything.", ["3B","SS"]),
  h("sfo7", "Tule Fog Barrientos", "human", "cannon", 1.028, 1.188, 1.188, 1.122, 1.16, 1.08, "R", "C", "You lose sight of him for an inning and he is on third."),
  h("sfo8", "Sourdough Pell", "human", "grit", 1.006, 1.155, 1.121, 1.221, 1.22, 0.95, "L", "SS", "Started in a kitchen. Still shows up covered in flour."),
  h("sfo9", "Foghorn Amadi", "machine", "slugger", 1.292, 1.045, 0.989, 1.155, 0.3, 0.88, "R", "DH", "One note, twice a minute, and you feel it in the seats."),
];

const SFO_ARMS: readonly Pitcher[] = [
  a("Golden Gate Achebe", "L", "painter", "none", 0.5, "Long, orange and nobody gets across without paying.", {"slider":0.35,"curveball":0.3,"changeup":0.2,"fastball":0.15}, "curveball", 1.17, 1.09, 1.14, 2),
  a("Harbor Pilot Osei", "R", "junk", "none", 0.54, "Steers the whole night from the mound and never touches the wheel twice.", {"changeup":0.4,"slider":0.35,"sinker":0.25}, "changeup", 1.156, 1.07, 1.14),
  a("Cable Car Quintero", "R", "painter", "pre_pitch", 0.53, "Slow, loud, and hauled up the hill by something you cannot see.", {"curveball":0.45,"changeup":0.32,"slider":0.23}, "curveball", 1.143, 1.068, 1.08),
];

/** ...and the three who finish it. */
const SFO_PEN: readonly Pitcher[] = [
  a("Bar Pilot Nyland", "R", "none", "none", 0.56, "Comes on for the last mile, which is the only dangerous one.", {"fastball":0.5,"slider":0.35,"curveball":0.15}, "slider", 1.08, 1.11, 0.93, 5),
  a("Sea Lion Marsh", "L", "junk", "pre_pitch", 0.52, "Took the pier in 1989 and has never given it back.", {"slider":0.6,"changeup":0.4}, "slider", 1.109, 1.046, 0.82),
  a("Point Bonita Ferreira", "R", "none", "release", 0.51, "Last light before the open ocean. Miss it and you are gone.", {"fastball":0.6,"slider":0.4}, "slider", 1.179, 1.112, 0.7),
];

/**
 * ST. LOUIS FERRYMEN — everybody crosses eventually and they set the fare. The
 * most patient club in the league and the least interested in your hurry.
 */
const STL: readonly Player[] = [
  h("stl1", "Levee Boudreaux", "human", "reader", 1.017, 1.21, 1.165, 1.177, 1.28, 1.18, "L", "CF", "Holds the water back all season and nobody sends him a thank-you."),
  h("stl2", "Eads Kaminski", "human", "reader", 1.061, 1.194, 1.182, 1.133, 1.12, 1.1, "R", "2B", "Built the crossing everyone said would fall down. It did not."),
  h("stl3", "Deckhand Poteet", "machine", "slugger", 1.413, 1.023, 0.957, 1.166, 0.16, 0.72, "R", "3B", "Lifts what four men would rather not."),
  h("stl4", "Slackwater Cruz", "augmented", "ironman", 1.358, 1.034, 0.979, 1.155, 0.24, 0.8, "L", "1B", "Still, wide and deeper than the crew tells passengers."),
  h("stl5", "Toll Booth Rachford", "human", "grit", 1.149, 1.155, 1.121, 1.144, 0.88, 0.95, "R", "LF", "Everybody pays. Nobody enjoys the transaction."),
  h("stl6", "Chouteau Vance", "human", "showman", 1.204, 1.122, 1.056, 1.21, 0.66, 1, "L", "RF", "Old fur money, new batting gloves, same opinion of himself."),
  h("stl7", "Mud Island Fesler", "human", "grit", 1.072, 1.166, 1.133, 1.188, 1.1, 1.02, "R", "C", "Comes and goes with the river and hits the same either way."),
  h("stl8", "Sternwheel Ojeda", "machine", "grit", 1.127, 1.133, 1.099, 1.122, 0.94, 0.86, "R", "SS", "Slow to start, impossible to stop, loud the entire way."),
  h("stl9", "Undertow Salas", "augmented", "slugger", 1.281, 1.045, 0.989, 1.111, 0.34, 0.82, "L", "DH", "Nothing on the surface and everything underneath it."),
];

const STL_ARMS: readonly Pitcher[] = [
  a("Slow Ferry Dabrowski", "L", "junk", "release", 0.56, "You will get there. You will not enjoy the trip.", {"changeup":0.4,"curveball":0.32,"sinker":0.28}, "changeup", 1.07, 1.05, 1.1),
  a("Ice Jam Prewett", "R", "none", "release", 0.55, "Backs up the whole river for an inning at a time.", {"sinker":0.45,"slider":0.3,"fastball":0.25}, "sinker", 1.074, 1.03, 1.12, 3),
  a("Slack Water Kovacic", "L", "painter", "pre_pitch", 0.53, "The hour the river forgets which way it is going.", {"sinker":0.45,"changeup":0.32,"curveball":0.23}, "changeup", 1.075, 1.039, 1.08),
];

/** ...and the three who finish it. */
const STL_PEN: readonly Pitcher[] = [
  a("Last Boat Gennaro", "R", "painter", "none", 0.48, "One crossing left and he is not waiting for you.", {"slider":0.4,"fastball":0.35,"changeup":0.25}, "slider", 1.06, 1.1, 0.91, 4),
  a("Toll Taker Rhys", "R", "none", "pre_pitch", 0.52, "Sets the fare, takes the fare, does not discuss the fare.", {"curveball":0.6,"slider":0.4}, "curveball", 1.043, 1.017, 0.82),
  a("Far Bank Sopko", "R", "none", "release", 0.51, "You can see it the whole way across. Getting there is the trouble.", {"fastball":0.6,"sinker":0.4}, "sinker", 1.11, 1.081, 0.7),
];

/**
 * CLEVELAND RIVETS — the club that never converted. Nine machines off the same
 * line, no legs anywhere, and a mistake pitch leaves the county.
 */
const CLE: readonly Player[] = [
  h("cle1", "Flats Wojcik", "machine", "grit", 1.05, 1.166, 1.121, 1.089, 1.06, 0.92, "L", "LF", "Built where the river caught fire. Unbothered by that fact."),
  h("cle2", "Hot Rivet Palladino", "machine", "grit", 1.105, 1.155, 1.111, 1.122, 1, 0.88, "R", "3B", "Thrown, caught and driven home, four times a minute, forty years."),
  h("cle3", "OPEN HEARTH", "machine", "slugger", 1.479, 0.99, 0.934, 1.1, 0.14, 0.6, "R", "1B", "Runs at two thousand degrees and has never been allowed indoors."),
  h("cle4", "Slag Heap Yurchenko", "machine", "slugger", 1.402, 0.979, 0.946, 1.067, 0.18, 0.58, "L", "DH", "What is left over, stacked forty feet high and still dangerous."),
  h("cle5", "Terminal Tower", "machine", "ironman", 1.358, 1.012, 0.968, 1.111, 0.2, 0.65, "R", "RF", "Tallest thing for four hundred miles and knows it."),
  h("cle6", "Pig Iron Skala", "machine", "precision", 1.237, 1.078, 1.034, 1.045, 0.6, 0.75, "R", "2B", "Crude, cheap and in absolutely everything the league is built from."),
  h("cle7", "Bessemer Nixon", "machine", "grit", 1.171, 1.111, 1.078, 1.133, 0.88, 0.8, "L", "C", "Blows the impurities out in one loud, terrifying pass."),
  h("cle8", "Erie Fog Bank", "augmented", "reader", 1.094, 1.122, 1.133, 1.078, 0.82, 0.9, "R", "CF", "Comes off the water in November and ruins three straight games."),
  h("cle9", "Drop Forge Kucera", "machine", "slugger", 1.314, 1.001, 0.957, 1.056, 0.22, 0.62, "R", "SS", "One swing per plate appearance. It is all he was rated for."),
];

const CLE_ARMS: readonly Pitcher[] = [
  a("Coke Oven Bialas", "R", "junk", "release", 0.54, "Burns for eighteen hours and finishes filthy.", {"sinker":0.4,"slider":0.35,"changeup":0.25}, "slider", 1.07, 1, 1.09, 2),
  a("Cuyahoga Voss", "L", "none", "release", 0.52, "Bends six times before it gets anywhere near the lake.", {"curveball":0.46,"fastball":0.25,"changeup":0.29}, "curveball", 1.085, 1.021, 1.1, 3),
  a("Hot Rivet Marek", "R", "none", "pre_pitch", 0.52, "Thrown glowing across a gap and caught in a bucket. Every time.", {"fastball":0.45,"slider":0.32,"sinker":0.23}, "slider", 1.062, 1.006, 1.08),
];

/** ...and the three who finish it. */
const CLE_PEN: readonly Pitcher[] = [
  a("Night Pour Radich", "R", "fireball", "none", 0.5, "The whole sky goes orange and then the inning is over.", {"fastball":0.68,"slider":0.32}, "fastball", 1.01, 1.06, 0.9, 7),
  a("Bucket Boy Sladek", "L", "none", "pre_pitch", 0.51, "Catches what the last man threw and never drops one.", {"curveball":0.6,"changeup":0.4}, "curveball", 1.03, 0.985, 0.82),
  a("COLD SHUT", "R", "fireball", "release", 0.5, "A seam where two pours did not take. Nothing gets through it.", {"fastball":0.6,"slider":0.4}, "fastball", 1.095, 1.047, 0.7, 7),
];

/**
 * MINNEAPOLIS MILLERS — flour, ice and patience. Nine men who foul off
 * everything until somebody makes a mistake, and no power to punish it with.
 */
const MIN: readonly Player[] = [
  h("min1", "Washburn Aho", "human", "reader", 0.973, 1.221, 1.177, 1.155, 1.32, 1.24, "L", "CF", "Grinds it fine. Takes all night and gets there."),
  h("min2", "St. Anthony Lindqvist", "human", "reader", 1.006, 1.21, 1.188, 1.122, 1.24, 1.16, "R", "2B", "Named for the falls that ran the whole city. Runs the whole lineup."),
  h("min3", "Grain Elevator Sorenson", "machine", "slugger", 1.38, 1.023, 0.968, 1.1, 0.18, 0.68, "R", "3B", "Takes it up and holds it there until somebody asks for it."),
  h("min4", "Bran Halvorsen", "human", "ironman", 1.259, 1.067, 1, 1.133, 0.44, 0.85, "L", "1B", "Good for you and nobody is happy about it."),
  h("min5", "Hard Freeze Ndiaye", "human", "grit", 1.072, 1.177, 1.143, 1.188, 1.14, 1.05, "R", "LF", "Plays six months a year in weather nobody else will stand in."),
  h("min6", "Millrace Tvedt", "human", "precision", 1.039, 1.188, 1.155, 1.111, 1.06, 1, "L", "RF", "Same channel, same speed, every single night of the year."),
  h("min7", "Nokomis Fairbanks", "augmented", "grit", 1.127, 1.133, 1.133, 1.089, 0.84, 1.12, "R", "C", "Quiet, frozen half the year, and deeper than the map says."),
  h("min8", "Dust Explosion Kirk", "augmented", "slugger", 1.303, 1.012, 0.968, 1.067, 0.3, 0.82, "R", "SS", "Nothing for an hour, and then the roof is somewhere else."),
  h("min9", "Sifter Bergstrom", "human", "grit", 1.017, 1.155, 1.121, 1.166, 1.2, 0.95, "L", "DH", "Everything goes through him twice before anybody is satisfied."),
];

const MIN_ARMS: readonly Pitcher[] = [
  a("Whiteout Lundeen", "R", "junk", "release", 0.55, "You know it is coming. You cannot see any of it.", {"curveball":0.38,"changeup":0.34,"sinker":0.28}, "curveball", 1.06, 1.02, 1.08),
  a("Millstone Ryba", "R", "none", "pre_pitch", 0.58, "Turns all night at exactly one speed.", {"sinker":0.48,"fastball":0.25,"slider":0.27}, "sinker", 1.032, 1.01, 1.18),
  a("Flour Dust Lindgren", "R", "painter", "pre_pitch", 0.54, "Hangs in the air all night. One spark and the mill is gone.", {"curveball":0.45,"changeup":0.32,"sinker":0.23}, "curveball", 1.052, 1.013, 1.08),
];

/** ...and the three who finish it. */
const MIN_PEN: readonly Pitcher[] = [
  a("Ten Below Vasquez", "L", "painter", "release", 0.48, "Nothing over the plate and nobody wants to be out there anyway.", {"slider":0.42,"changeup":0.33,"fastball":0.25}, "slider", 1.04, 1.07, 0.92, 3),
  a("Ice House Anders", "L", "junk", "pre_pitch", 0.53, "Cut it in January, sell it in July, tell nobody how.", {"changeup":0.6,"curveball":0.4}, "changeup", 1.02, 0.992, 0.82),
  a("Twenty Below Halvorsen", "R", "none", "release", 0.52, "Considers it bracing. Has said so to reporters, in it, in shirtsleeves.", {"fastball":0.6,"slider":0.4}, "slider", 1.085, 1.054, 0.7),
];

/**
 * BALTIMORE CRABBERS — the club nobody wants on the schedule. All legs, all
 * nerve, the smallest bats in the league, and a way of playing that is entirely
 * within the rules and makes everybody furious: foul off nine pitches, bunt for
 * a hit, take the extra base, win 3-2 in front of nobody.
 */
const BAL: readonly Player[] = [
  h("bal1", "Sook Delaney", "human", "showman", 0.918, 1.221, 1.177, 1.188, 1.34, 1.42, "S", "LF", "Sideways, fast, and impossible to get hold of."),
  h("bal2", "Trotline Feeny", "human", "reader", 0.962, 1.199, 1.188, 1.144, 1.28, 1.3, "S", "CF", "Sets it at four in the morning and hauls it in all day."),
  h("bal3", "Jimmy Crab Pusateri", "human", "slugger", 1.27, 1.089, 1.022, 1.166, 0.5, 1.05, "R", "RF", "The big one at the bottom of the bushel. Still fighting."),
  h("bal4", "Chesapeake Lorne", "augmented", "slugger", 1.292, 1.045, 0.989, 1.122, 0.34, 0.95, "L", "1B", "Wide, shallow and full of things that will hurt you."),
  h("bal5", "Old Bay Sczerbiak", "human", "utility", 1.039, 1.177, 1.133, 1.21, 1.16, 1.15, "R", "3B", "On everything, whether anybody asked for it or not.", ["2B","SS"]),
  h("bal6", "Skipjack Moten", "human", "utility", 1.006, 1.188, 1.143, 1.111, 1.1, 1.22, "L", "2B", "Last of the sailing fleet. Refuses an engine on principle.", ["3B","SS"]),
  h("bal7", "Fells Point Amara", "human", "cannon", 1.05, 1.166, 1.165, 1.133, 1.08, 1.18, "R", "C", "Knows every dock, every bar and every umpire on the eastern seaboard."),
  h("bal8", "Molting Season Pratt", "human", "grit", 0.984, 1.144, 1.111, 1.199, 1.24, 1.1, "L", "SS", "Soft for two weeks a year and hides the whole time."),
  h("bal9", "Dredge Boat Kilcoyne", "machine", "slugger", 1.237, 1.056, 1, 1.089, 0.38, 0.9, "R", "DH", "Scrapes the bottom and comes up with something every time."),
];

const BAL_ARMS: readonly Pitcher[] = [
  a("Bay Squall Iyer", "L", "junk", "release", 0.52, "Twenty minutes of chaos and then it is over.", {"curveball":0.4,"changeup":0.3,"slider":0.3}, "curveball", 1.05, 1.03, 1.05),
  a("Crab Pot Rickerts", "R", "none", "release", 0.56, "Easy to get into. That was never the hard part.", {"sinker":0.47,"fastball":0.25,"changeup":0.28}, "sinker", 1.043, 1, 1.14),
  a("Steamed Hard Volkov", "R", "none", "pre_pitch", 0.53, "Twenty minutes under the lid and everything comes apart clean.", {"fastball":0.45,"sinker":0.32,"slider":0.23}, "sinker", 1.035, 1.006, 1.08),
];

/** ...and the three who finish it. */
const BAL_PEN: readonly Pitcher[] = [
  a("Nor easter Fawcett", "R", "fireball", "release", 0.5, "Three days of warning and it still takes the roof off.", {"fastball":0.66,"slider":0.34}, "fastball", 0.99, 1.05, 0.91, 6),
  a("Bushel Basket Pryor", "L", "none", "pre_pitch", 0.52, "Holds a great deal more than it looks like it should.", {"curveball":0.6,"changeup":0.4}, "curveball", 1.004, 0.985, 0.82),
  a("Mallet Man Petrosian", "R", "fireball", "release", 0.51, "One tool, one motion, and he has never needed a second.", {"fastball":0.6,"slider":0.4}, "fastball", 1.068, 1.047, 0.7, 7),
];

/**
 * PITTSBURGH PUDDLERS — the men who stirred molten iron by hand until the mills
 * automated them out. Heavy, slow, and playing like they have something to
 * settle with everybody who replaced them.
 */
const PIT: readonly Player[] = [
  h("pit1", "Hunky Zawadzki", "human", "grit", 1.028, 1.188, 1.143, 1.199, 1.24, 1, "L", "RF", "Twelve-hour turn, seven days, and then a doubleheader."),
  h("pit2", "Incline Bevacqua", "human", "reader", 1.061, 1.177, 1.165, 1.155, 1.14, 1.08, "R", "LF", "Goes up the hill and comes back down on somebody."),
  h("pit3", "Puddling Bar Mazur", "human", "showman", 1.347, 1.045, 0.989, 1.177, 0.3, 0.75, "R", "3B", "Stirred iron by hand for nine years. His wrists are the story."),
  h("pit4", "Homestead Krall", "machine", "slugger", 1.391, 1.012, 0.957, 1.144, 0.16, 0.66, "L", "1B", "Remembers the strike. Was on the wrong side of it and says so."),
  h("pit5", "Three Rivers Osifo", "human", "showman", 1.127, 1.144, 1.111, 1.122, 0.9, 0.98, "R", "DH", "Everything meets at him and leaves in one direction."),
  h("pit6", "Coal Barge Tutko", "machine", "grit", 1.204, 1.089, 1.056, 1.111, 0.86, 0.7, "R", "CF", "Loaded to the waterline and never once late."),
  h("pit7", "Bloomery Nance", "augmented", "slugger", 1.259, 1.034, 0.989, 1.1, 0.34, 0.8, "L", "2B", "Old process, obsolete on paper, still turns out iron."),
  h("pit8", "Smoke Ordinance Duda", "human", "grit", 1.05, 1.155, 1.121, 1.21, 1.12, 0.92, "R", "C", "They passed a law about him. He got worse."),
  h("pit9", "Slag Ladle Prokop", "machine", "slugger", 1.303, 1.001, 0.968, 1.078, 0.2, 0.64, "R", "SS", "Tips once a shift. Everybody stands well back when he does."),
];

const PIT_ARMS: readonly Pitcher[] = [
  a("Blast Furnace Kobylka", "R", "none", "release", 0.56, "Runs hot for eight innings and does not cool between them.", {"fastball":0.45,"sinker":0.3,"slider":0.25}, "sinker", 1.03, 1.02, 1.11, 5),
  a("Mon Wharf Cerny", "L", "junk", "pre_pitch", 0.54, "Floods twice a year and pitches through both.", {"changeup":0.4,"curveball":0.35,"fastball":0.25}, "changeup", 1.053, 1, 1.12),
  a("Open Hearth Sokolowski", "R", "none", "pre_pitch", 0.53, "Twelve hours in front of it and he says the winters are worse.", {"sinker":0.45,"slider":0.32,"fastball":0.23}, "slider", 1.052, 1.013, 1.08),
];

/** ...and the three who finish it. */
const PIT_PEN: readonly Pitcher[] = [
  a("Tapper Yablonski", "R", "painter", "release", 0.5, "Opens the hole, lets it run, closes it again. Ninth inning only.", {"slider":0.4,"sinker":0.35,"fastball":0.25}, "slider", 1.05, 1.08, 0.89, 3),
  a("Scrap Ladle Mihalik", "L", "junk", "pre_pitch", 0.52, "Whatever is left in the bottom, poured out on somebody.", {"changeup":0.6,"curveball":0.4}, "changeup", 1.02, 0.992, 0.82),
  a("Last Pour Wysocki", "R", "none", "release", 0.51, "The heat goes off after this one. Make it count or do not.", {"fastball":0.6,"sinker":0.4}, "fastball", 1.085, 1.054, 0.7),
];


/**
 * MILWAUKEE COOPERS — barrel makers, and every one of them built like one. All
 * the power the tier allows and nothing else at all.
 */
const MIL: readonly Player[] = [
  h("mil1", "Stave Bender Reuss", "human", "grit", 1.039, 1.144, 1.099, 1.078, 1.1, 0.98, "L", "LF", "Bends oak for a living and considers a bat a small job."),
  h("mil2", "Hoop Driver Falkner", "human", "reader", 1.072, 1.133, 1.121, 1.056, 1.04, 1.02, "R", "3B", "Six hits with a hammer and the whole thing holds for thirty years."),
  h("mil3", "Bung Hole Vogel", "machine", "slugger", 1.435, 0.99, 0.934, 1.045, 0.14, 0.62, "R", "1B", "One small opening and everything comes out of it."),
  h("mil4", "Sixty Gallon Grohl", "machine", "slugger", 1.457, 0.968, 0.923, 1.012, 0.12, 0.58, "L", "DH", "Full, and nobody has any idea how they get him on the bus."),
  h("mil5", "Menomonee Strack", "human", "ironman", 1.237, 1.056, 1, 1.089, 0.42, 0.8, "R", "RF", "Valley kid. Still lives four blocks from where the river bends."),
  h("mil6", "Cold Cellar Behnke", "human", "precision", 1.105, 1.122, 1.089, 1.034, 0.86, 0.9, "L", "2B", "Kept underground for six months and improved by it."),
  h("mil7", "Char Level Three", "machine", "grit", 1.193, 1.067, 1.034, 1.067, 0.7, 0.72, "R", "C", "Burnt on the inside on purpose. Says it improves the finish."),
  h("mil8", "Draymen Kowalczyk", "augmented", "grit", 1.149, 1.089, 1.044, 1.1, 0.8, 0.85, "R", "CF", "Hauls it, stacks it, and then plays nine."),
  h("mil9", "Tap Room Piotrowski", "human", "showman", 1.215, 1.034, 0.989, 1.111, 0.44, 0.88, "L", "SS", "Best in the league from the sixth inning on, in his own estimation."),
];

const MIL_ARMS: readonly Pitcher[] = [
  a("Cooperage Selig", "R", "junk", "pre_pitch", 0.56, "Round, slow and holds together far longer than it should.", {"sinker":0.4,"changeup":0.35,"curveball":0.25}, "changeup", 1, 0.99, 1.07),
  a("Lager Cave Umbach", "L", "none", "release", 0.54, "Takes his time. Everything about him takes its time.", {"curveball":0.46,"fastball":0.25,"changeup":0.29}, "curveball", 1.002, 0.98, 1.11),
  a("Stave Mill Gerhardt", "L", "none", "pre_pitch", 0.53, "Cuts them all to the same curve without measuring once.", {"sinker":0.45,"slider":0.32,"changeup":0.23}, "slider", 0.99, 0.977, 1.08),
];

/** ...and the three who finish it. */
const MIL_PEN: readonly Pitcher[] = [
  a("Last Call Wenzel", "R", "fireball", "release", 0.5, "Everybody out, and quickly.", {"fastball":0.68,"slider":0.32}, "fastball", 0.95, 1.02, 0.88, 5),
  a("Hoop Iron Brauer", "R", "none", "pre_pitch", 0.52, "Holds the whole barrel together and is the cheapest part of it.", {"fastball":0.6,"curveball":0.4}, "curveball", 0.961, 0.957, 0.82),
  a("Bung Hammer Dietz", "R", "fireball", "release", 0.51, "One swing, the barrel is sealed, and everybody goes home.", {"fastball":0.6,"sinker":0.4}, "fastball", 1.022, 1.017, 0.7, 7),
];

/**
 * SEATTLE RAINMAKERS — the wettest park in the league and a club that has made
 * peace with it. Good gloves, patient bats, and no way to score in a hurry.
 */
const SEA: readonly Player[] = [
  h("sea1", "Sluiceway Tan", "human", "reader", 0.951, 1.188, 1.165, 1.089, 1.26, 1.26, "L", "CF", "Waits out the delay better than anybody in the sport."),
  h("sea2", "Ballard Locks Ivey", "machine", "reader", 1.017, 1.155, 1.111, 1.056, 1.12, 1.04, "R", "2B", "One at a time, both directions, no exceptions made."),
  h("sea3", "Timber Fall Mahoney", "human", "slugger", 1.303, 1.034, 0.968, 1.078, 0.3, 0.82, "R", "3B", "Shouts before he swings. Nobody has told him he does it."),
  h("sea4", "Cascade Fog Ozuna", "augmented", "ironman", 1.27, 1.023, 0.979, 1.034, 0.28, 0.9, "L", "1B", "Sits in the valley all week and lifts on a Sunday."),
  h("sea5", "Puget Kestrel", "machine", "grit", 1.094, 1.122, 1.099, 1.045, 0.84, 1.18, "R", "LF", "Covers more ground than the outfield fence does."),
  h("sea6", "Drizzle Bhatia", "human", "grit", 0.984, 1.166, 1.133, 1.111, 1.2, 1.1, "L", "RF", "Not a downpour. Just never, ever stops."),
  h("sea7", "Cannery Row Feodorov", "human", "grit", 1.061, 1.122, 1.078, 1.078, 1, 0.95, "R", "C", "Twelve-hour line shift, then the bus, then batting practice."),
  h("sea8", "Rain Delay Osgood", "human", "showman", 1.127, 1.078, 1.034, 1.122, 0.62, 0.98, "L", "SS", "Has an entire tarpaulin routine and does it whether it rains or not."),
  h("sea9", "Old Growth Larsen", "machine", "slugger", 1.336, 0.99, 0.946, 1.023, 0.18, 0.6, "R", "DH", "Four hundred years to grow and one swing to explain it."),
];

const SEA_ARMS: readonly Pitcher[] = [
  a("Sound Fog Aoki", "L", "junk", "release", 0.53, "You can hear it fine. Seeing it is the problem.", {"changeup":0.4,"curveball":0.35,"slider":0.25}, "changeup", 1.03, 1, 1.04),
  a("Mudslide Pettersen", "R", "none", "pre_pitch", 0.55, "Comes down all at once and takes the road with it.", {"sinker":0.5,"slider":0.3,"fastball":0.2}, "sinker", 1.022, 0.97, 1.12, 2),
  a("Drizzle Nakamura", "L", "painter", "pre_pitch", 0.51, "Never hard enough to stop play and never quite stops.", {"changeup":0.45,"curveball":0.32,"sinker":0.23}, "changeup", 1.024, 0.983, 1.08),
];

/** ...and the three who finish it. */
const SEA_PEN: readonly Pitcher[] = [
  a("Harbor Bell Kuo", "R", "painter", "release", 0.46, "Rings once an inning and then you are done.", {"slider":0.42,"curveball":0.33,"fastball":0.25}, "slider", 1, 1.04, 0.9, 3),
  a("Ferry Horn Bergstrom", "R", "none", "pre_pitch", 0.5, "One note, no warning, and everybody on the water knows where he is.", {"fastball":0.6,"slider":0.4}, "slider", 0.993, 0.963, 0.82),
  a("Cloudburst Tanaka", "R", "fireball", "release", 0.49, "A whole month of it in nine minutes.", {"fastball":0.6,"sinker":0.4}, "fastball", 1.056, 1.023, 0.7, 7),
];

/**
 * DENVER PROSPECTORS — a mile up, where the ball carries and nobody has learned
 * to pitch. Real power, no staff, and every game finishes 9-8.
 */
const DEN: readonly Player[] = [
  h("den1", "Placer Vance", "human", "speedster", 1.05, 1.155, 1.099, 1.045, 1.08, 1.24, "L", "CF", "Pans the same creek every winter and finds enough to come back."),
  h("den2", "Assay Office Nunn", "human", "utility", 1.083, 1.144, 1.133, 1.034, 1.02, 1.12, "R", "2B", "Tells you what it is worth and is never wrong and never popular.", ["3B","SS"]),
  h("den3", "Mile High Ostrowski", "machine", "slugger", 1.49, 0.979, 0.923, 1.045, 0.12, 0.7, "R", "LF", "Hits it a mile because the air lets him and takes full credit anyway."),
  h("den4", "Tailings Pond Grieve", "augmented", "slugger", 1.369, 0.99, 0.946, 1.001, 0.2, 0.78, "L", "1B", "Everything the mountain did not want, in one place, glowing faintly."),
  h("den5", "Front Range Yazzie", "human", "grit", 1.138, 1.111, 1.078, 1.1, 0.94, 1.06, "R", "3B", "Runs the fence line all game at altitude and never gets tired."),
  h("den6", "Dynamite Shack Bell", "human", "slugger", 1.314, 1.012, 0.968, 1.012, 0.26, 0.85, "R", "RF", "Kept well away from the dugout for reasons never written down."),
  h("den7", "Silver Plume Ockerman", "human", "utility", 1.105, 1.122, 1.089, 1.056, 0.88, 0.95, "L", "SS", "The town is gone. He still gives it as his address.", ["2B","3B"]),
  h("den8", "Thin Air Dubois", "augmented", "reader", 1.171, 1.067, 1.067, 0.99, 0.64, 1, "R", "C", "Plays the whole season at home and cannot breathe anywhere else."),
  h("den9", "Ore Cart Pankowski", "machine", "grit", 1.248, 1.034, 0.989, 1.023, 0.4, 0.68, "L", "DH", "Downhill only, and nothing gets in the way of it."),
];

const DEN_ARMS: readonly Pitcher[] = [
  a("Altitude Sickness Rowe", "R", "none", "pre_pitch", 0.58, "Great for four innings. Nobody has seen his fifth.", {"fastball":0.5,"sinker":0.3,"slider":0.2}, "fastball", 0.93, 0.95, 0.95, 4),
  a("Flat Curve Dunmire", "L", "junk", "pre_pitch", 0.52, "It breaks at sea level. He has never pitched at sea level.", {"curveball":0.45,"changeup":0.3,"fastball":0.25}, "curveball", 0.94, 0.97, 1.1),
  a("Thin Air Ostrander", "R", "none", "pre_pitch", 0.53, "Nothing breaks up here and he has stopped pretending otherwise.", {"fastball":0.45,"changeup":0.32,"slider":0.23}, "changeup", 0.956, 0.957, 1.08),
];

/** ...and the three who finish it. */
const DEN_PEN: readonly Pitcher[] = [
  a("Timberline Krupa", "R", "painter", "release", 0.48, "Above this line nothing grows and nothing scores.", {"slider":0.4,"sinker":0.35,"changeup":0.25}, "slider", 0.98, 1.01, 0.87, 2),
  a("Switchback Neary", "L", "junk", "pre_pitch", 0.52, "Gets there eventually and you see the same view four times.", {"curveball":0.6,"changeup":0.4}, "curveball", 0.927, 0.938, 0.82),
  a("Continental Divide Roan", "R", "none", "release", 0.51, "Everything goes one way or the other and none of it comes back.", {"fastball":0.6,"sinker":0.4}, "sinker", 0.987, 0.996, 0.7),
];

/**
 * MEMPHIS RIVERBOATS — everything on the card and everything on the table. Two
 * enormous bats, seven ordinary ones, and a staff that gambles every pitch.
 */
const MEM: readonly Player[] = [
  h("mem1", "Beale Street Ottley", "human", "showman", 1.006, 1.166, 1.111, 1.111, 1.14, 1.28, "L", "CF", "Plays four bars of something on the way to the box every time."),
  h("mem2", "Paddle Wheel Ruffin", "human", "grit", 1.039, 1.144, 1.099, 1.078, 1.1, 1.06, "R", "SS", "Same rhythm all night, and it gets faster when he is behind."),
  h("mem3", "High Card Delacroix", "machine", "slugger", 1.468, 0.99, 0.946, 1.1, 0.12, 0.68, "R", "LF", "One hand, all in, twice a game."),
  h("mem4", "Cotton Exchange Hobbs", "machine", "slugger", 1.402, 0.979, 0.934, 1.056, 0.16, 0.64, "L", "1B", "Sets the price and then hits the price."),
  h("mem5", "Steamboat Gambler Voss", "human", "ironman", 1.16, 1.078, 1.022, 1.144, 0.56, 0.98, "R", "RF", "Swings at 3-0 on principle. Has explained the principle at length."),
  h("mem6", "Mud Bar Cheatham", "human", "grit", 1.028, 1.133, 1.089, 1.089, 1.06, 0.92, "L", "3B", "Shows up where the channel used to be and ruins somebody evening."),
  h("mem7", "Boiler Deck Prue", "augmented", "cannon", 1.149, 1.067, 1.022, 1.045, 0.7, 0.86, "R", "C", "Hottest place on the boat and the cheapest ticket."),
  h("mem8", "Levee Camp Sisson", "human", "reader", 1.017, 1.122, 1.121, 1.067, 1.02, 1, "R", "2B", "Built the wall that keeps the river out of the ballpark."),
  h("mem9", "Calliope Nance", "machine", "showman", 1.226, 1.023, 0.979, 1.122, 0.36, 0.8, "L", "DH", "Audible from two miles and in tune from none."),
];

const MEM_ARMS: readonly Pitcher[] = [
  a("Riverboat Rell", "R", "junk", "release", 0.5, "Never throws the same thing twice and could not tell you why.", {"changeup":0.35,"curveball":0.3,"slider":0.2,"sinker":0.15}, "changeup", 1.02, 0.99, 1.03),
  a("Snag Boat Trueblood", "L", "none", "pre_pitch", 0.54, "Pulls whatever is under the surface out of the way. Slowly.", {"sinker":0.48,"fastball":0.25,"curveball":0.27}, "sinker", 0.981, 0.96, 1.09, 3),
  a("Paddlewheel Mack", "R", "none", "pre_pitch", 0.51, "Same revolution all night and it moves a great deal of water.", {"fastball":0.45,"slider":0.32,"changeup":0.23}, "slider", 0.987, 0.964, 1.08),
];

/** ...and the three who finish it. */
const MEM_PEN: readonly Pitcher[] = [
  a("Bluff City Odum", "R", "fireball", "release", 0.48, "All of it, every pitch, and no plan for the second time through.", {"fastball":0.72,"slider":0.28}, "fastball", 0.94, 1, 0.86, 7),
  a("Card Sharp Ledoux", "L", "painter", "pre_pitch", 0.5, "Deals himself the same hand every time and nobody can prove it.", {"curveball":0.6,"changeup":0.4}, "changeup", 0.958, 0.944, 0.82),
  a("All In Bonnaire", "R", "fireball", "release", 0.49, "Pushes the whole stack in on every pitch. It has mostly worked.", {"fastball":0.6,"slider":0.4}, "fastball", 1.019, 1.003, 0.7, 7),
];

/**
 * CINCINNATI PIGS — they were FIRST. The first club anybody ever paid to play,
 * out of the first town that ever called itself the pork capital, and they have
 * spent every year since watching bigger cities take both titles off them and
 * get famous for it. Slow, heavy, funny about it, and still here.
 */
const CIN: readonly Player[] = [
  h("cin1", "Over The Rhine Bruhn", "human", "grit", 0.995, 1.155, 1.111, 1.1, 1.18, 1, "L", "RF", "Walks to the park from the same house his grandfather did."),
  h("cin2", "Findlay Market Ross", "human", "reader", 1.028, 1.144, 1.133, 1.067, 1.12, 1.04, "R", "LF", "Opening day parade marshal, and will remind you every May."),
  h("cin3", "Smoke House Pfaff", "machine", "showman", 1.391, 0.99, 0.934, 1.045, 0.14, 0.6, "R", "3B", "Cured for eleven months and worth every day of it."),
  h("cin4", "Packer Vollmer", "machine", "slugger", 1.325, 0.99, 0.946, 1.023, 0.18, 0.58, "L", "1B", "Nothing wasted, nothing hurried, nothing pretty."),
  h("cin5", "Mount Adams Kruse", "human", "showman", 1.083, 1.122, 1.089, 1.056, 0.88, 0.9, "R", "DH", "Looks down on the whole river and mentions it constantly."),
  h("cin6", "Queen City Ledbetter", "human", "showman", 1.138, 1.089, 1.034, 1.111, 0.6, 0.94, "L", "CF", "Insists on the full title. Never accepts the short one."),
  h("cin7", "Canal Lock Duffey", "augmented", "grit", 1.116, 1.078, 1.044, 1.045, 0.78, 0.85, "R", "2B", "The canal was filled in sixty years ago. Nobody told him."),
  h("cin8", "Hog Drover Tillery", "human", "grit", 1.061, 1.1, 1.056, 1.078, 0.98, 0.88, "R", "C", "Moved four hundred head down Main Street once and never got over it."),
  h("cin9", "Rhinegeist Obermeyer", "machine", "slugger", 1.259, 1.012, 0.968, 1.012, 0.24, 0.62, "L", "SS", "Ghost of the brewery district, still on the payroll."),
];

const CIN_ARMS: readonly Pitcher[] = [
  a("Old Cossett", "R", "junk", "pre_pitch", 0.58, "Forty-one years old and pitching entirely from memory.", {"changeup":0.4,"curveball":0.35,"sinker":0.25}, "curveball", 0.99, 0.98, 1.06),
  a("Ludlow Viaduct Beem", "L", "none", "pre_pitch", 0.55, "Structurally unsound and load-bearing anyway.", {"fastball":0.25,"curveball":0.41,"changeup":0.34}, "curveball", 0.971, 0.96, 1.09),
  a("Porkopolis Stemler", "L", "painter", "pre_pitch", 0.54, "The town was called that first and he will tell you why.", {"sinker":0.45,"changeup":0.32,"slider":0.23}, "changeup", 0.984, 0.967, 1.08),
];

/** ...and the three who finish it. */
const CIN_PEN: readonly Pitcher[] = [
  a("River Fog Kappel", "R", "painter", "release", 0.5, "Sits on the water and takes the last two innings with it.", {"slider":0.4,"changeup":0.35,"sinker":0.25}, "slider", 0.97, 1.02, 0.89, 2),
  a("Rhineland Vogt", "R", "none", "pre_pitch", 0.53, "Over the river, up the steps, and back down for the ninth.", {"fastball":0.6,"curveball":0.4}, "curveball", 0.954, 0.947, 0.82),
  a("Slaughterhouse Nine", "R", "fireball", "release", 0.52, "Ninth of nine off the same line. The other eight are still working.", {"fastball":0.6,"sinker":0.4}, "fastball", 1.015, 1.006, 0.7, 7),
];

/**
 * NEW ORLEANS SPIRIT — they were the best club in this league once, and the
 * town has never once let it go. The parade still goes out after every game,
 * won or lost, which is the joke and also the point: a second line is a funeral
 * that decided to be a party. Enormous fun, and not enough left to finish a
 * season with.
 */
const NOL: readonly Player[] = [
  h("nol1", "Tremé Boudreaux", "human", "showman", 0.973, 1.177, 1.121, 1.133, 1.22, 1.32, "L", "RF", "Dances the whole way to first and beats the throw doing it."),
  h("nol2", "Grand Marshal Fontenot", "human", "showman", 1.017, 1.155, 1.099, 1.155, 1.16, 1.2, "R", "LF", "Leads it, and the club follows him whether or not it should."),
  h("nol3", "Sousaphone Ancelet", "machine", "showman", 1.413, 0.979, 0.923, 1.078, 0.14, 0.66, "R", "3B", "Carries the whole bottom end and weighs as much as the bench."),
  h("nol4", "Pumping Station Six", "machine", "slugger", 1.336, 0.99, 0.946, 1.045, 0.18, 0.62, "L", "1B", "Holds the whole city up in a storm and never gets a parade."),
  h("nol5", "Vieux Carré Thibault", "human", "showman", 1.072, 1.111, 1.078, 1.144, 1, 1, "R", "DH", "Two hundred years old, structurally, and still open all night."),
  h("nol6", "Snare Beaudry", "human", "precision", 1.039, 1.133, 1.099, 1.1, 0.96, 1.08, "L", "CF", "Keeps time for everybody. Nobody keeps it for him."),
  h("nol7", "Crawfish Boil Pitre", "human", "grit", 1.105, 1.089, 1.044, 1.111, 0.86, 0.9, "R", "2B", "Three hours, one table, everybody invited, nothing left."),
  h("nol8", "Levee Break Gaudet", "augmented", "slugger", 1.237, 1.012, 0.968, 1.034, 0.3, 0.82, "R", "C", "Fine, fine, fine, and then not fine at all."),
  h("nol9", "Storyville Marchand", "human", "showman", 1.171, 1.045, 1, 1.122, 0.5, 0.95, "L", "SS", "Every story he tells is about himself and about half of them happened."),
];

const NOL_ARMS: readonly Pitcher[] = [
  a("Second Line Rousseau", "L", "junk", "release", 0.5, "No two innings in the same tempo and he insists that is the plan.", {"changeup":0.38,"curveball":0.32,"slider":0.3}, "changeup", 1.01, 1.02, 1),
  a("Bayou Fever Landry", "R", "none", "pre_pitch", 0.52, "Sweats through three jerseys and gets worse in the eighth.", {"sinker":0.47,"fastball":0.25,"changeup":0.28}, "sinker", 0.981, 0.95, 1.04, 3),
  a("Brass Band Fontenot", "L", "none", "pre_pitch", 0.5, "Never plays the same tune twice and never plays it quietly.", {"fastball":0.45,"changeup":0.32,"curveball":0.23}, "changeup", 0.99, 0.98, 1.08),
];

/** ...and the three who finish it. */
const NOL_PEN: readonly Pitcher[] = [
  a("Ninth Ward Baptiste", "R", "fireball", "release", 0.48, "Comes on in the ninth because there was never a plan for the eighth.", {"fastball":0.7,"curveball":0.3}, "fastball", 0.96, 1.03, 0.86, 6),
  a("Cemetery Row Guidry", "R", "junk", "pre_pitch", 0.49, "Everything above ground here, including whatever he throws.", {"curveball":0.6,"slider":0.4}, "curveball", 0.961, 0.96, 0.82),
  a("Last Parade Thibault", "R", "fireball", "release", 0.48, "Comes out at the end whether you won or not. That is the point.", {"fastball":0.6,"sinker":0.4}, "fastball", 1.022, 1.02, 0.7, 7),
];

/**
 * TORONTO TRAVELERS — the only club outside the country, which is the whole
 * joke in the name: nobody flies like they do. Nine men from nine places,
 * none of whom were drafted here, playing what amounts to a road season.
 */
const TOR: readonly Player[] = [
  h("tor1", "Red Eye Nakashima", "human", "grit", 0.86, 1.2, 1.18, 1.12, 1.2, 1.22, "L", "CF", "Sleeps on the plane, wakes up in a city, hits .290 in all of them."),
  h("tor2", "Customs Line Beaulieu", "human", "reader", 0.92, 1.18, 1.22, 1.04, 1.14, 1.1, "R", "2B", "Declares everything. It takes an hour and he has never been fined."),
  h("tor3", "THE CN", "machine", "slugger", 1.7, 0.9, 0.84, 1.08, 0.12, 0.6, "R", "RF", "Eighteen hundred feet of it, visible from the next province."),
  h("tor4", "Hogtown Vasilev", "machine", "slugger", 1.52, 0.9, 0.86, 1, 0.16, 0.64, "L", "1B", "This town was a pork town too. Nobody down south believes it."),
  h("tor5", "Yonge Street Achterberg", "human", "grit", 1, 1.14, 1.1, 1.1, 1, 0.95, "R", "3B", "Named for a road that goes on for a thousand miles and never turns."),
  h("tor6", "Layover Ibarra", "human", "precision", 0.94, 1.16, 1.14, 1, 0.92, 1.05, "L", "LF", "Has been through every airport in the league and slept in most of them."),
  h("tor7", "Don Valley Okonjo", "augmented", "reader", 1.14, 1.06, 1.12, 0.96, 0.74, 0.98, "R", "DH", "Comes up out of the ravine that runs under the whole city."),
  h("tor8", "Lakeshore Tremblay", "human", "grit", 0.98, 1.1, 1.08, 1.14, 1.02, 0.9, "R", "C", "Plays the whole year in a wind coming off a lake the size of a sea."),
  h("tor9", "Passport Kaur", "human", "showman", 1.16, 1, 0.98, 1.18, 0.48, 1, "L", "SS", "Four countries on the cover and a nickname in each one."),
];

const TOR_ARMS: readonly Pitcher[] = [
  a("Time Zone Fyodorov", "R", "junk", "release", 0.54, "Nothing arrives when you expect it. He blames the schedule.", {"changeup":0.4,"curveball":0.32,"sinker":0.28}, "changeup", 1.02, 0.98, 1.08),
  a("Border Crossing Mensah", "L", "none", "release", 0.55, "Slow going in, quick coming back.", {"fastball":0.25,"sinker":0.41,"slider":0.34}, "sinker", 0.971, 0.96, 1.1, 3),
  a("Red Eye Lachance", "R", "none", "pre_pitch", 0.53, "Lands at six, pitches at seven, and does not believe in hotels.", {"fastball":0.45,"curveball":0.32,"changeup":0.23}, "curveball", 1.004, 0.987, 1.08),
];

/** ...and the three who finish it. */
const TOR_PEN: readonly Pitcher[] = [
  a("Last Flight Doucet", "R", "painter", "release", 0.5, "Gets it done and gets on the plane. Has never seen a hotel bar.", {"slider":0.4,"fastball":0.34,"changeup":0.26}, "slider", 1, 1.08, 0.8, 4),
  a("Customs Line Adeyemi", "L", "junk", "pre_pitch", 0.52, "Takes as long as it takes and there is no other line.", {"changeup":0.6,"curveball":0.4}, "changeup", 0.973, 0.967, 0.82),
  a("Final Call Bouchard", "R", "none", "release", 0.51, "Last boarding announcement of the night, in two languages.", {"fastball":0.6,"slider":0.4}, "slider", 1.035, 1.027, 0.7),
];

/**
 * KANSAS CITY FREIGHT — a yard, a schedule and nine men who were passing
 * through. Nothing on this roster was drafted; all of it was picked up cheap.
 */
const KCF: readonly Player[] = [
  h("kcf1", "Hump Yard Delacruz", "human", "grit", 0.962, 1.133, 1.089, 1.045, 1.18, 1.2, "L", "RF", "Pushed over the crest and left to find his own track."),
  h("kcf2", "Waybill Osment", "human", "reader", 0.984, 1.122, 1.111, 1.012, 1.1, 1.08, "R", "LF", "Knows where everything is going and has never gone anywhere."),
  h("kcf3", "Hopper Car Wren", "machine", "showman", 1.369, 0.968, 0.913, 0.99, 0.14, 0.6, "R", "3B", "Full or empty, and no way to tell from the outside."),
  h("kcf4", "Reefer Unit Nine", "machine", "slugger", 1.292, 0.968, 0.923, 0.968, 0.16, 0.58, "L", "1B", "Runs cold all season. Cost more to keep than to replace."),
  h("kcf5", "Stockyard Bridge Aubry", "human", "showman", 1.061, 1.089, 1.044, 1.056, 0.94, 0.9, "R", "DH", "Everything crosses him and nobody stops."),
  h("kcf6", "Boxcar Willie Nunn", "human", "showman", 1.094, 1.056, 1.012, 1.078, 0.6, 0.95, "L", "CF", "Rode in on one and tells the story before anybody asks."),
  h("kcf7", "Switch Frog Halima", "augmented", "precision", 1.072, 1.078, 1.034, 1.001, 0.8, 0.98, "R", "2B", "One small part, and if it fails everything behind it is on the ground."),
  h("kcf8", "Caboose Rennick", "human", "grit", 1.006, 1.078, 1.034, 1.045, 1, 0.85, "R", "C", "Last man on the train and the last one anybody thinks about."),
  h("kcf9", "Air Brake Sowell", "machine", "slugger", 1.204, 1.001, 0.957, 0.979, 0.3, 0.64, "L", "SS", "Stops everything, eventually, and nobody enjoys the sound."),
];

const KCF_ARMS: readonly Pitcher[] = [
  a("Slow Order Vaught", "R", "junk", "pre_pitch", 0.54, "Ten miles an hour through the whole yard by regulation.", {"sinker":0.4,"changeup":0.35,"curveball":0.25}, "changeup", 0.95, 0.95, 1.02),
  a("Dead Head Pruitt", "L", "none", "pre_pitch", 0.52, "Rides all the way out and does no work when he gets there.", {"fastball":0.25,"curveball":0.45,"changeup":0.3}, "curveball", 0.949, 0.93, 1.06),
  a("Empty Boxcar Whitlow", "R", "none", "pre_pitch", 0.51, "Rides out full and comes back with nothing in him. Every trip.", {"sinker":0.45,"curveball":0.32,"changeup":0.23}, "curveball", 0.939, 0.921, 1.08),
];

/** ...and the three who finish it. */
const KCF_PEN: readonly Pitcher[] = [
  a("Hot Box Ferrier", "R", "fireball", "pre_pitch", 0.46, "Runs hot, catches fire, and stops the whole line.", {"fastball":0.72,"slider":0.28}, "fastball", 0.9, 0.94, 0.85, 5),
  a("Coupler Pin Stroud", "L", "none", "pre_pitch", 0.5, "One piece of steel between the whole train and a very bad day.", {"fastball":0.6,"slider":0.4}, "slider", 0.911, 0.903, 0.82),
  a("Last Car Hennigan", "R", "none", "release", 0.49, "You know the thing is over when you see him go past.", {"fastball":0.6,"sinker":0.4}, "fastball", 0.969, 0.959, 0.7),
];

/**
 * BUFFALO SNOWPLOWS — six feet of it, twice a winter, and a club that has never
 * been given a reason to expect anything better.
 */
const BUF: readonly Player[] = [
  h("buf1", "Lake Effect Zdrojewski", "human", "grit", 0.951, 1.144, 1.099, 1.078, 1.22, 1.16, "L", "CF", "Arrives all at once and stays until March."),
  h("buf2", "Thruway Coyne", "human", "reader", 0.973, 1.122, 1.111, 1.034, 1.12, 1.06, "R", "SS", "Closed four times this year and still made every game."),
  h("buf3", "Grain Scoop Piasecki", "machine", "slugger", 1.347, 0.968, 0.913, 1.001, 0.14, 0.6, "R", "LF", "Invented here, and the only thing the city still exports."),
  h("buf4", "Wing Night Ferraro", "human", "slugger", 1.237, 1.001, 0.946, 1.023, 0.3, 0.72, "L", "1B", "Twenty-five cents each, Tuesdays, and he has never missed one."),
  h("buf5", "Snow Fence Duschene", "human", "ironman", 1.028, 1.1, 1.056, 1.067, 1, 0.95, "R", "RF", "Slows it down. Does not stop it. Nobody claimed it would."),
  h("buf6", "Salt Truck Obiora", "machine", "grit", 1.138, 1.045, 1, 1.012, 0.7, 0.66, "R", "3B", "Out before anybody else and rusting faster than the rest of the club."),
  h("buf7", "Blizzard Of Sixteen", "machine", "cannon", 1.259, 0.99, 0.934, 0.979, 0.2, 0.62, "L", "C", "They still talk about him. He has done nothing since."),
  h("buf8", "Broadway Market Nowicki", "human", "precision", 1.017, 1.089, 1.056, 1.034, 0.88, 0.88, "R", "2B", "Busy one week in April, shuttered the rest of the year."),
  h("buf9", "Wide Right Kulesza", "human", "showman", 1.072, 1.023, 0.979, 0.957, 0.54, 0.9, "L", "DH", "Nobody in this town will say the nickname out loud. It is on his jersey."),
];

const BUF_ARMS: readonly Pitcher[] = [
  a("Whiteout Gorski", "R", "junk", "pre_pitch", 0.52, "Nothing visible and nothing especially good either.", {"curveball":0.4,"changeup":0.35,"sinker":0.25}, "curveball", 0.96, 0.94, 1.01),
  a("Plow Blade Cwiklinski", "L", "none", "pre_pitch", 0.55, "Straight, heavy and the same every night of the winter.", {"fastball":0.25,"sinker":0.5,"slider":0.25}, "fastball", 0.94, 0.95, 1.1, 2),
  a("Lake Effect Zielinski", "R", "none", "pre_pitch", 0.52, "Comes off the water without warning and buries the whole county.", {"fastball":0.45,"curveball":0.32,"sinker":0.23}, "curveball", 0.95, 0.931, 1.08),
];

/** ...and the three who finish it. */
const BUF_PEN: readonly Pitcher[] = [
  a("Ice Boom Marlette", "R", "none", "release", 0.48, "Holds it back for one inning. That is the whole design spec.", {"fastball":0.6,"slider":0.4}, "slider", 0.93, 0.96, 0.85, 4),
  a("Salt Truck Barone", "L", "junk", "pre_pitch", 0.51, "Out before anybody else and nobody thanks him for it.", {"sinker":0.6,"changeup":0.4}, "changeup", 0.921, 0.912, 0.82),
  a("Six Feet Dombrowski", "R", "none", "release", 0.5, "That is not a forecast, it is a measurement. Twice a winter.", {"fastball":0.6,"slider":0.4}, "slider", 0.98, 0.969, 0.7),
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
  h("phx1", "Dry Heat Villalobos", "human", "showman", 0.94, 1.133, 1.078, 1.034, 1.12, 1.28, "L", "CF", "Insists it is different from the other kind. It is not."),
  h("phx2", "Canal Bank Estrada", "human", "reader", 0.973, 1.111, 1.099, 1.001, 1.06, 1.14, "R", "2B", "The canals were here a thousand years before the club was."),
  h("phx3", "Saguaro", "machine", "slugger", 1.38, 0.957, 0.901, 0.99, 0.1, 0.56, "R", "RF", "Takes sixty years to grow an arm and uses it exactly once."),
  h("phx4", "Haboob Nakai", "augmented", "slugger", 1.281, 0.979, 0.934, 0.968, 0.2, 0.8, "L", "1B", "Visible from forty miles and over in ten minutes."),
  h("phx5", "Copper Queen Amado", "human", "grit", 1.039, 1.089, 1.044, 1.045, 0.96, 1, "R", "3B", "The mine closed. The nickname stayed and so did she."),
  h("phx6", "Swamp Cooler Prieto", "machine", "precision", 1.083, 1.067, 1.022, 0.99, 0.76, 0.85, "L", "LF", "Works fine until the humidity. Then he is furniture."),
  h("phx7", "Sun Devil Rooker", "human", "grit", 1.105, 1.045, 1.012, 1.023, 0.72, 0.95, "R", "DH", "Local product, local legend, and league average at everything."),
  h("phx8", "Ash Layer Tobin", "augmented", "slugger", 1.226, 0.99, 0.946, 0.957, 0.26, 0.78, "R", "C", "Grey the whole way down and nothing grows in him."),
  h("phx9", "Rookie Card Ybarra", "human", "showman", 1.061, 1.012, 0.989, 0.99, 0.6, 1.05, "L", "SS", "Twenty years old and already the best story this club has."),
];

const PHX_ARMS: readonly Pitcher[] = [
  a("Hundred And Ten Chee", "R", "fireball", "pre_pitch", 0.5, "Same number as the afternoon and about as pleasant.", {"fastball":0.45,"sinker":0.3,"slider":0.25}, "fastball", 1.2, 0.93, 0.96, 8),
  a("Two Hundred Innings Bly", "L", "fireball", "pre_pitch", 0.54, "Throws every one of them as hard as the first. Nobody has explained why.", {"fastball":0.25,"sinker":0.48,"changeup":0.27}, "fastball", 1.178, 0.921, 1.18, 7),
  a("Monsoon Season Tso", "L", "fireball", "pre_pitch", 0.5, "Six weeks a year he is the best arm alive. The rest is desert.", {"fastball":0.45,"sinker":0.32,"slider":0.23}, "sinker", 1.187, 0.911, 1.08, 5),
];

/** ...and the three who finish it. */
const PHX_PEN: readonly Pitcher[] = [
  a("Night Game Wickenburg", "R", "fireball", "release", 0.46, "Cannot pitch before eight in the evening and does not need to.", {"fastball":0.58,"slider":0.42}, "fastball", 1.16, 0.94, 0.84, 11),
  a("Asphalt Shimmer Begay", "R", "none", "pre_pitch", 0.49, "You can see it moving and there is nothing there.", {"fastball":0.6,"changeup":0.4}, "changeup", 1.152, 0.893, 0.82),
  a("Hundred And Fifteen Yazzie", "R", "fireball", "release", 0.48, "Five hotter than Chee and he has never let anybody forget it.", {"fastball":0.6,"slider":0.4}, "fastball", 1.225, 0.949, 0.7, 7),
];

/**
 * OKLAHOMA CITY DUSTBOWL — the bottom of the league and the best story in it.
 * Nine men, no money, no staff, and a town that turns out for every game.
 */
const OKC: readonly Player[] = [
  h("okc1", "Black Sunday Purl", "human", "grit", 0.929, 1.122, 1.078, 1.067, 1.2, 1.14, "L", "CF", "Named for the worst day the county ever had. Wears it well."),
  h("okc2", "Section Line Choate", "human", "reader", 0.951, 1.111, 1.099, 1.023, 1.1, 1.08, "R", "SS", "Straight for a mile in every direction and never in a hurry."),
  h("okc3", "Pump Jack Ottoway", "machine", "slugger", 1.336, 0.957, 0.901, 0.979, 0.12, 0.58, "R", "LF", "Up, down, up, down, all day, for a barrel and a half."),
  h("okc4", "Red Dirt Hackler", "human", "slugger", 1.204, 0.99, 0.946, 1.012, 0.34, 0.75, "L", "1B", "It gets into everything and it never washes out."),
  h("okc5", "Land Run Sedberry", "human", "ironman", 1.006, 1.078, 1.034, 1.056, 0.98, 1.1, "R", "RF", "His people were on the line at noon. Some of them jumped it."),
  h("okc6", "Grain Co-op Wenzel", "human", "precision", 1.017, 1.078, 1.044, 1.001, 0.88, 0.9, "L", "3B", "Everybody owns a piece and nobody makes a dollar."),
  h("okc7", "Twister Season Deel", "augmented", "cannon", 1.16, 1.012, 0.968, 0.968, 0.48, 0.92, "R", "C", "Chases them for fun in the off-season. Has caught two."),
  h("okc8", "Dry Well Kanady", "human", "grit", 0.984, 1.056, 1.012, 1.034, 0.94, 0.85, "R", "2B", "Drilled eleven and hit nothing. Still drilling."),
  h("okc9", "Tent Revival Pinkston", "machine", "slugger", 1.182, 0.979, 0.934, 1.001, 0.28, 0.6, "L", "DH", "Comes through once a summer and everybody shows up for it."),
];

const OKC_ARMS: readonly Pitcher[] = [
  a("Dust Devil Kanady", "R", "junk", "pre_pitch", 0.5, "Spins up out of nothing and is gone before it does any damage.", {"curveball":0.4,"changeup":0.35,"sinker":0.25}, "curveball", 0.94, 0.92, 0.98),
  a("Sooner Hyde", "L", "none", "pre_pitch", 0.52, "Starts before the signal. Has done it his whole life.", {"fastball":0.25,"curveball":0.45,"changeup":0.3}, "curveball", 0.929, 0.91, 1.06),
  a("Windbreak Coldiron", "R", "none", "pre_pitch", 0.49, "Somebody planted him in a line in 1936 and he is still standing.", {"sinker":0.45,"curveball":0.32,"changeup":0.23}, "curveball", 0.922, 0.902, 1.08),
];

/** ...and the three who finish it. */
const OKC_PEN: readonly Pitcher[] = [
  a("Cimarron Rooks", "R", "none", "release", 0.46, "One good inning in him and nobody knows which one it is.", {"fastball":0.62,"slider":0.38}, "slider", 0.88, 0.93, 0.83, 4),
  a("Grain Dust Stovall", "L", "junk", "pre_pitch", 0.48, "Gets in your eyes and there is nothing you can do about it.", {"changeup":0.6,"curveball":0.4}, "changeup", 0.895, 0.883, 0.82),
  a("Last Rain Amos", "R", "none", "release", 0.47, "Everybody remembers exactly when. Nobody expects another.", {"fastball":0.6,"sinker":0.4}, "sinker", 0.951, 0.938, 0.7),
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
  h("nyeB1", "Uptown Jack Ferraro", "human", "grit", 1.49, 0.86, 0.74, 1.33, 0.3, 0.72, "R", "C", "Twelve years in the organisation and still dresses like a rookie with money.", ["1B"]),
  h("nyeB2", "Turnstile Ruiz", "human", "utility", 0.74, 1.06, 1.08, 1.2, 1.16, 1.37, "R", "2B", "Goes in for the ninth and the whole infield shifts a step shallower.", ["3B","SS"]),
  h("nyeB3", "Lefty Vermilyea", "human", "speedster", 1.02, 1.21, 1.14, 1.26, 1, 1, "L", "CF", "Kept around for one at-bat a week and has never once looked surprised to get it.", ["LF","RF"]),
];

const NYV_BENCH: readonly Player[] = [
  h("nyvB1", "Pension Day Kowalczyk", "human", "grit", 1.44, 0.88, 0.76, 1.36, 0.31, 0.7, "R", "C", "Swings like a man settling an old argument with somebody who has left.", ["1B"]),
  h("nyvB2", "Whistle Stop Dolan", "human", "utility", 0.76, 1.04, 1.09, 1.22, 1.18, 1.35, "R", "2B", "Ran out a walk once. Nobody has been able to talk him out of it since.", ["3B","SS"]),
  h("nyvB3", "Southpaw Nardozzi", "human", "speedster", 0.99, 1.22, 1.16, 1.24, 1.02, 0.98, "L", "CF", "Waits on the slider like a man who has been told it is coming.", ["LF","RF"]),
];

const LAC_BENCH: readonly Player[] = [
  h("lacB1", "Second Unit Bishop", "augmented", "grit", 1.52, 0.82, 0.72, 1.31, 0.28, 0.76, "R", "C", "Does the swing nobody films and takes none of the credit for the highlight.", ["1B"]),
  h("lacB2", "Sunset Bracamonte", "human", "utility", 0.72, 1.05, 1.07, 1.18, 1.14, 1.41, "L", "2B", "Comes in when the shadows reach the mound and is gone before they leave.", ["3B","SS"]),
  h("lacB3", "Reseda Ottway", "human", "speedster", 1.04, 1.19, 1.13, 1.25, 0.98, 1.02, "L", "CF", "From the valley, and mentions it roughly once an inning.", ["LF","RF"]),
];

const LAA_BENCH: readonly Player[] = [
  h("laaB1", "Owens Valley Pike", "human", "grit", 1.46, 0.85, 0.75, 1.34, 0.32, 0.71, "R", "C", "Took everything he has from somewhere upstream and will not discuss it.", ["1B"]),
  h("laaB2", "Standpipe Aguilar", "human", "utility", 0.75, 1.07, 1.1, 1.21, 1.2, 1.36, "R", "2B", "Holds the pressure all game and lets it out in one bag at a time.", ["3B","SS"]),
  h("laaB3", "Culvert Mendonca", "human", "speedster", 0.97, 1.24, 1.15, 1.23, 1.06, 1, "L", "CF", "Goes under everything. Comes out the other side dry and on second.", ["LF","RF"]),
];

const CHF_BENCH: readonly Player[] = [
  h("chfB1", "Backdraft Sowinski", "human", "grit", 1.5, 0.84, 0.73, 1.35, 0.29, 0.73, "R", "C", "Quiet for eight innings and then takes the roof off the place.", ["1B"]),
  h("chfB2", "Ladder Company Nash", "human", "utility", 0.73, 1.05, 1.09, 1.19, 1.15, 1.38, "R", "2B", "First man up and first man back down. Never in the picture afterwards.", ["3B","SS"]),
  h("chfB3", "Hook And Line Petrakis", "human", "speedster", 1, 1.2, 1.17, 1.27, 1.01, 0.99, "L", "CF", "Gets his bat on things that were already past him.", ["LF","RF"]),
];

const CHI_BENCH: readonly Player[] = [
  h("chiB1", "Bleacher Seat Duffy", "human", "grit", 1.47, 0.87, 0.74, 1.3, 0.3, 0.7, "R", "C", "Hits them where he used to sit and points at the row every time.", ["1B"]),
  h("chiB2", "Ivy Wall Coyne", "human", "utility", 0.77, 1.03, 1.11, 1.23, 1.17, 1.34, "R", "2B", "Knows exactly where the ball disappears and exactly where it comes back.", ["3B","SS"]),
  h("chiB3", "Wrigleyville Sandoval", "human", "speedster", 1.01, 1.23, 1.14, 1.22, 1.03, 1.01, "L", "CF", "Plays the whole game like the wind is about to change, because it is.", ["LF","RF"]),
];

const ALB_BENCH: readonly Player[] = [
  h("albB1", "Session Day Muldoon", "human", "grit", 1.45, 0.86, 0.75, 1.37, 0.31, 0.72, "R", "C", "Shows up when there is something to be decided and not one minute earlier.", ["1B"]),
  h("albB2", "Erie Lock Tyminski", "human", "utility", 0.76, 1.06, 1.08, 1.2, 1.19, 1.35, "R", "2B", "Moves men up one level at a time and never spills a drop.", ["3B","SS"]),
  h("albB3", "Hudson Ice Baranowski", "human", "speedster", 0.98, 1.22, 1.16, 1.24, 1.04, 0.97, "L", "CF", "Cold, thick and cut into blocks. Keeps until you need him in July.", ["LF","RF"]),
];

const BAL_BENCH: readonly Player[] = [
  h("balB1", "Steamed Hardesty", "human", "grit", 1.43, 0.88, 0.76, 1.32, 0.33, 0.74, "R", "C", "Comes out red and loud and there is not much of him left afterwards.", ["1B"]),
  h("balB2", "Soft Shell Kirwan", "human", "utility", 0.74, 1.08, 1.1, 1.21, 1.24, 1.36, "L", "2B", "Drops one down the line about as often as he is asked to and no less.", ["3B","SS"]),
  h("balB3", "Fells Point Ozturk", "human", "speedster", 1, 1.21, 1.15, 1.25, 1.07, 1, "L", "CF", "Works the corner nobody wants and has never asked to be moved off it.", ["LF","RF"]),
];

const BUF_BENCH: readonly Player[] = [
  h("bufB1", "Lake Effect Zagorski", "human", "grit", 1.48, 0.85, 0.73, 1.33, 0.29, 0.71, "R", "C", "Arrives sideways, all at once, and buries whatever was in the way.", ["1B"]),
  h("bufB2", "Salt Truck Nowak", "human", "utility", 0.75, 1.04, 1.09, 1.22, 1.18, 1.33, "R", "2B", "Out before anybody else and the reason the rest of them get anywhere.", ["3B","SS"]),
  h("bufB3", "Skyway Pelkey", "human", "speedster", 1.02, 1.2, 1.13, 1.23, 1, 1.02, "L", "CF", "Goes up and over the whole argument and lands on the other side of it.", ["LF","RF"]),
];

const CIN_BENCH: readonly Player[] = [
  h("cinB1", "Smokehouse Bracken", "human", "grit", 1.51, 0.83, 0.72, 1.34, 0.28, 0.7, "R", "C", "Low and slow all week for about four seconds of everybody paying attention.", ["1B"]),
  h("cinB2", "Riverfront Delahoy", "human", "utility", 0.73, 1.05, 1.07, 1.18, 1.15, 1.39, "R", "2B", "Turns first the way water turns a bend, which is to say without slowing down.", ["3B","SS"]),
  h("cinB3", "Over-The-Rhine Kessel", "human", "speedster", 0.99, 1.23, 1.16, 1.26, 1.02, 0.99, "L", "CF", "Old neighbourhood, old approach, and neither one is going anywhere.", ["LF","RF"]),
];

const CLE_BENCH: readonly Player[] = [
  h("cleB1", "Hot Rivet Sczepanski", "augmented", "grit", 1.53, 0.81, 0.71, 1.32, 0.27, 0.73, "R", "C", "Thrown across the gap glowing and caught in a bucket. Usually.", ["1B"]),
  h("cleB2", "Flats Lonardo", "human", "utility", 0.76, 1.06, 1.1, 1.2, 1.17, 1.34, "R", "2B", "Everything down there is flat and he still finds a way to go downhill.", ["3B","SS"]),
  h("cleB3", "Lift Bridge Mancini", "human", "speedster", 1.03, 1.19, 1.14, 1.24, 1.01, 1, "L", "CF", "Stops everything for as long as he needs and nobody may complain.", ["LF","RF"]),
];

const DEN_BENCH: readonly Player[] = [
  h("denB1", "Thin Air Ballantyne", "human", "grit", 1.55, 0.8, 0.7, 1.3, 0.26, 0.75, "R", "C", "Everything he hits goes further than it deserves and he takes the credit.", ["1B"]),
  h("denB2", "Switchback Ferrer", "human", "utility", 0.71, 1.07, 1.09, 1.19, 1.16, 1.4, "R", "2B", "Never runs in a straight line and gets there first anyway.", ["3B","SS"]),
  h("denB3", "Timberline Vachon", "human", "speedster", 1, 1.21, 1.15, 1.22, 1.03, 1.01, "L", "CF", "Stops exactly where the growing stops and does not try for one foot more.", ["LF","RF"]),
];

const DET_BENCH: readonly Player[] = [
  h("detB1", "Second Shift Kaczmarek", "augmented", "grit", 1.5, 0.83, 0.72, 1.35, 0.28, 0.71, "R", "C", "Clocks in at eight in the evening and the line does not slow down.", ["1B"]),
  h("detB2", "Cass Corridor Whitfield", "human", "utility", 0.74, 1.05, 1.08, 1.21, 1.15, 1.37, "R", "2B", "Grew up where you had to be quick and never worked out how to switch it off.", ["3B","SS"]),
  h("detB3", "Piquette Ave Sobieski", "human", "speedster", 1.01, 1.2, 1.13, 1.23, 1, 0.98, "L", "CF", "From the first plant anybody built, and mentions that it was the first.", ["LF","RF"]),
];

const FLA_BENCH: readonly Player[] = [
  h("flaB1", "Storm Surge Okonkwo", "human", "grit", 1.47, 0.86, 0.74, 1.33, 0.3, 0.78, "R", "C", "Arrives after the wind has already gone and does the actual damage.", ["1B"]),
  h("flaB2", "Sawgrass Peralta", "human", "utility", 0.72, 1.06, 1.08, 1.18, 1.14, 1.43, "R", "2B", "Runs through things that would cut anybody else to ribbons.", ["3B","SS"]),
  h("flaB3", "Overseas Highway Bonilla", "human", "speedster", 0.98, 1.22, 1.16, 1.24, 1.02, 1.04, "L", "CF", "A very long way with water on both sides and no reasonable place to stop.", ["LF","RF"]),
];

const KCF_BENCH: readonly Player[] = [
  h("kcfB1", "Hump Yard Yarbrough", "human", "grit", 1.46, 0.87, 0.75, 1.34, 0.31, 0.7, "R", "C", "Gives it one shove at the top and lets gravity sort out the rest.", ["1B"]),
  h("kcfB2", "Caboose Mikulski", "human", "utility", 0.75, 1.04, 1.09, 1.2, 1.18, 1.35, "R", "2B", "Last man on and the only one who can see what is coming up behind.", ["3B","SS"]),
  h("kcfB3", "Burnt Ends Halloran", "human", "speedster", 1.02, 1.21, 1.14, 1.25, 1.01, 0.99, "L", "CF", "The part everybody else threw out, and now they queue for him.", ["LF","RF"]),
];

const MEM_BENCH: readonly Player[] = [
  h("memB1", "Paddlewheel Ligon", "human", "grit", 1.49, 0.84, 0.73, 1.36, 0.29, 0.72, "R", "C", "Slow, loud, and moves an enormous amount of water when he finally goes.", ["1B"]),
  h("memB2", "Beale Street Fontenot", "human", "utility", 0.73, 1.07, 1.1, 1.19, 1.16, 1.38, "R", "2B", "Never plays the same bag the same way twice and it always works.", ["3B","SS"]),
  h("memB3", "Cotton Row Aiken", "human", "speedster", 1, 1.23, 1.15, 1.23, 1.04, 1, "L", "CF", "Judges everything by feel, in about a second, and is right.", ["LF","RF"]),
];

const MIL_BENCH: readonly Player[] = [
  h("milB1", "Barrel Head Stankiewicz", "human", "grit", 1.48, 0.85, 0.74, 1.33, 0.3, 0.7, "R", "C", "Built round and thick and takes an enormous amount of pressure without a leak.", ["1B"]),
  h("milB2", "Stave Mill Brubaker", "human", "utility", 0.76, 1.05, 1.09, 1.21, 1.17, 1.34, "R", "2B", "Cuts everything to length and never once measures twice.", ["3B","SS"]),
  h("milB3", "Third Ward Novotny", "human", "speedster", 0.99, 1.22, 1.14, 1.24, 1.02, 1.01, "L", "CF", "Old warehouse district, old swing, and both have been quietly renovated.", ["LF","RF"]),
];

const MIN_BENCH: readonly Player[] = [
  h("minB1", "Stone Arch Halvorsen", "human", "grit", 1.44, 0.88, 0.76, 1.35, 0.32, 0.71, "R", "C", "Been there a hundred years and nobody has found a reason to take him down.", ["1B"]),
  h("minB2", "Skyway Lindquist", "human", "utility", 0.75, 1.06, 1.11, 1.22, 1.19, 1.33, "R", "2B", "Gets across the whole thing without ever once going outside.", ["3B","SS"]),
  h("minB3", "Mill City Aaberg", "human", "speedster", 1.01, 1.24, 1.16, 1.23, 1.05, 0.98, "L", "CF", "Grinds it fine and does not stop until the whole load is through.", ["LF","RF"]),
];

const MNE_BENCH: readonly Player[] = [
  h("mneB1", "Bait Barrel Thibodeau", "human", "grit", 1.45, 0.86, 0.75, 1.34, 0.31, 0.73, "R", "C", "Nobody wants to sit near him and everybody wants him on the boat.", ["1B"]),
  h("mneB2", "Nor’easter Pelletier", "human", "utility", 0.74, 1.07, 1.09, 1.2, 1.21, 1.36, "R", "2B", "Comes up the coast without warning and rearranges the whole harbour.", ["3B","SS"]),
  h("mneB3", "Trap Line Ouellet", "human", "speedster", 0.98, 1.23, 1.15, 1.25, 1.08, 1, "L", "CF", "Works the same water every day and knows every rock under it.", ["LF","RF"]),
];

const NEM_BENCH: readonly Player[] = [
  h("nemB1", "Powder Horn Stapleton", "human", "grit", 1.46, 0.87, 0.74, 1.38, 0.3, 0.71, "R", "C", "Carries one shot and has never wasted it on anything ordinary.", ["1B"]),
  h("nemB2", "Bell Tower Cabral", "human", "utility", 0.76, 1.05, 1.1, 1.21, 1.18, 1.35, "R", "2B", "One if by land. He is already halfway to second by two.", ["3B","SS"]),
  h("nemB3", "Stone Wall Prouty", "human", "speedster", 1, 1.22, 1.16, 1.24, 1.03, 0.99, "L", "CF", "Built out of whatever the field gave up that year and has not moved since.", ["LF","RF"]),
];

const NOL_BENCH: readonly Player[] = [
  h("nolB1", "Second Line Boudreaux", "human", "grit", 1.5, 0.84, 0.72, 1.36, 0.28, 0.74, "R", "C", "Turns up behind the parade and somehow ends up leading it.", ["1B"]),
  h("nolB2", "Bayou Runner Chauvin", "human", "utility", 0.72, 1.06, 1.08, 1.18, 1.15, 1.42, "R", "2B", "Knows every channel through it and has never told anybody which one.", ["3B","SS"]),
  h("nolB3", "Gaslamp Thibault", "human", "speedster", 0.99, 1.23, 1.17, 1.26, 1.02, 1.02, "L", "CF", "Only really visible after dark, which is when they need him anyway.", ["LF","RF"]),
];

const OKC_BENCH: readonly Player[] = [
  h("okcB1", "Section Line Yeager", "human", "grit", 1.47, 0.85, 0.73, 1.32, 0.3, 0.72, "R", "C", "Draws a straight line across everything and dares the weather to argue.", ["1B"]),
  h("okcB2", "Sooner Gap Mullen", "human", "utility", 0.75, 1.04, 1.08, 1.2, 1.17, 1.39, "R", "2B", "Left before the gun and has been apologising for it for two generations.", ["3B","SS"]),
  h("okcB3", "Red Bed Chalfant", "human", "speedster", 1.01, 1.2, 1.13, 1.22, 1.01, 1, "L", "CF", "The dirt out there stains everything and he has stopped washing it out.", ["LF","RF"]),
];

const PHI_BENCH: readonly Player[] = [
  h("phiB1", "Broad Street Kolodziej", "augmented", "grit", 1.52, 0.82, 0.71, 1.33, 0.27, 0.72, "R", "C", "Booed on the way to the plate and booed on the way back, both times loudly.", ["1B"]),
  h("phiB2", "Navy Yard Tiernan", "human", "utility", 0.74, 1.05, 1.09, 1.21, 1.16, 1.34, "R", "2B", "Everything down there is riveted and so is he.", ["3B","SS"]),
  h("phiB3", "Fishtown Rzepka", "human", "speedster", 1.02, 1.21, 1.14, 1.24, 1, 0.98, "L", "CF", "Has an opinion about the swing you just took and you are going to hear it.", ["LF","RF"]),
];

const PHX_BENCH: readonly Player[] = [
  h("phxB1", "Dry Heat Todacheene", "human", "grit", 1.48, 0.85, 0.73, 1.31, 0.29, 0.73, "R", "C", "It is not so bad, he says, right up until it takes everything you had.", ["1B"]),
  h("phxB2", "Saguaro Ibarra", "human", "utility", 0.72, 1.06, 1.07, 1.19, 1.14, 1.4, "R", "2B", "Stands very still for a very long time and then takes an enormous stride.", ["3B","SS"]),
  h("phxB3", "Monsoon Aguirre", "human", "speedster", 1, 1.22, 1.15, 1.23, 1.02, 1.01, "L", "CF", "Nothing all year and then the whole year in twenty minutes.", ["LF","RF"]),
];

const PIT_BENCH: readonly Player[] = [
  h("pitB1", "Slag Heap Yancovic", "human", "grit", 1.49, 0.84, 0.72, 1.35, 0.28, 0.7, "R", "C", "What is left over after the useful part, and it is still hot enough to matter.", ["1B"]),
  h("pitB2", "Incline Vukovich", "human", "utility", 0.76, 1.04, 1.1, 1.22, 1.18, 1.33, "R", "2B", "Goes up the side of the hill at a fixed speed and never once slips.", ["3B","SS"]),
  h("pitB3", "Three Rivers Kubiak", "human", "speedster", 1.01, 1.2, 1.14, 1.23, 1.02, 1, "L", "CF", "Two go in and one comes out, and he has never explained the arithmetic.", ["LF","RF"]),
];

const SEA_BENCH: readonly Player[] = [
  h("seaB1", "Drydock Halvorson", "human", "grit", 1.45, 0.87, 0.75, 1.34, 0.31, 0.71, "R", "C", "Everything gets pulled out of the water and looked at properly before he swings.", ["1B"]),
  h("seaB2", "Pike Place Okada", "human", "utility", 0.74, 1.07, 1.11, 1.2, 1.19, 1.37, "R", "2B", "Catches everything thrown at him, from any angle, without looking twice.", ["3B","SS"]),
  h("seaB3", "Low Cloud Bergstrom", "human", "speedster", 0.98, 1.24, 1.17, 1.25, 1.04, 0.99, "L", "CF", "Sits on everything all day and lifts for about an hour in the evening.", ["LF","RF"]),
];

const SFO_BENCH: readonly Player[] = [
  h("sfoB1", "Cable Car Mazzola", "human", "grit", 1.44, 0.88, 0.76, 1.33, 0.32, 0.74, "R", "C", "Grabs hold of the thing under the street and lets it drag him up the hill.", ["1B"]),
  h("sfoB2", "Karl The Fog Quan", "human", "utility", 0.73, 1.06, 1.09, 1.18, 1.2, 1.38, "R", "2B", "Rolls in over the wall and nobody can see the ball for an inning and a half.", ["3B","SS"]),
  h("sfoB3", "Barbary Coast Doyle", "human", "speedster", 1, 1.23, 1.16, 1.24, 1.06, 1.01, "L", "CF", "Woke up on a different club twice and does not talk about either time.", ["LF","RF"]),
];

const STL_BENCH: readonly Player[] = [
  h("stlB1", "Levee Board Krumholz", "human", "grit", 1.46, 0.86, 0.74, 1.36, 0.3, 0.71, "R", "C", "Decides where the water goes and has never once been thanked for it.", ["1B"]),
  h("stlB2", "Towboat Escalante", "human", "utility", 0.75, 1.05, 1.09, 1.21, 1.17, 1.36, "R", "2B", "Pushes a great deal more than himself and never appears to be trying.", ["3B","SS"]),
  h("stlB3", "Soulard Wysocki", "human", "speedster", 1.02, 1.21, 1.15, 1.23, 1.03, 0.98, "L", "CF", "Been at the same market stall since before the club and outlasts managers.", ["LF","RF"]),
];

const TEX_BENCH: readonly Player[] = [
  h("texB1", "Caliche Road Duplantis", "human", "grit", 1.51, 0.83, 0.71, 1.32, 0.27, 0.73, "R", "C", "Hard, white, and rattles everything that goes across him at speed.", ["1B"]),
  h("texB2", "Pumpjack Salinas", "human", "utility", 0.72, 1.05, 1.07, 1.19, 1.14, 1.41, "R", "2B", "Same motion, all day, all night, and it never once gets tired of itself.", ["3B","SS"]),
  h("texB3", "Stockyard Renteria", "human", "speedster", 0.99, 1.22, 1.14, 1.25, 1.01, 1.02, "L", "CF", "Moves an awful lot of something through a very narrow gate without a fuss.", ["LF","RF"]),
];

const TOR_BENCH: readonly Player[] = [
  h("torB1", "Red Eye Fitzgibbon", "human", "grit", 1.47, 0.85, 0.74, 1.34, 0.29, 0.72, "R", "C", "Lands at six, sleeps until four, and hits one out at nine.", ["1B"]),
  h("torB2", "Layover Sivakumar", "human", "utility", 0.75, 1.06, 1.1, 1.2, 1.18, 1.36, "R", "2B", "Has been through more airports than parks and prefers it that way.", ["3B","SS"]),
  h("torB3", "Customs Line Charbonneau", "human", "speedster", 1, 1.23, 1.16, 1.24, 1.02, 1, "L", "CF", "Nothing gets past him and everybody resents how long it takes.", ["LF","RF"]),
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
  /**
   * THE BUILDING THIS CLUB PLAYS IN — see Park below and atPark().
   *
   * ⚠️ OPTIONAL, AND IT HAS TO STAY OPTIONAL, for the same reason `identity`
   * and `bench` are: a Season stores its rosters WHOLE, so a franchise saved
   * before parks existed holds clubs with no park on them and has to keep
   * loading. A club with no park plays in a neutral one.
   *
   * ⚠️ IT IS NOT PART OF WHAT A CLUB IS WORTH. value.ts does not read it and
   * must not start — the rank on the pre-game card is what a club's PLAYERS
   * are worth, and a park is a building both clubs hit in. Folding it in would
   * rank a club by the fences it happens to own.
   */
  park?: Park;
  /**
   * WHAT THE CLUB WEARS — see look.ts.
   *
   * ⚠️ OPTIONAL, AND ABSENT IS THE ORDINARY CASE. `uniformFor()` hands a club
   * with no kit one of sixteen by hash of its abbr, so all thirty are dressed
   * distinctly before anybody authors one and a franchise saved before this
   * existed keeps loading — the same rule `identity` and `park` follow.
   *
   * ⚠️ THE CLUB OWNS THE KIT AND THE PLAYER OWNS ONLY HOW HE DIFFERS. Thirty
   * uniforms clothe 780 men; putting colours on the player would mean editing
   * 780 records to change a jersey.
   */
  uniform?: Uniform;
}

/**
 * A BALLPARK, as two multipliers and a name.
 *
 * ⚠️ THIS IS THE OTHER HALF OF identity.ts, AND THE HALF THAT WAS MISSING. An
 * identity changes what the MANAGER does with the ratings a club has — swing
 * more, run more, a shorter leash. Nothing in the engine changed what the
 * ratings are WORTH, so every club played in the same building and the same
 * 1.8-power hitter was the same hitter everywhere in the league. A park is
 * that missing knob: the world's opinion of what it rewards, rather than the
 * bench's opinion of what to try.
 *
 * ⚠️ IT DOES NOT LIVE IN plot.ts, AND WALL_FT IS THE TRAP. `WALL_FT = 400`
 * looks like where a park belongs and is exactly the wrong place: plotBatted()
 * is a PICTURE RECONCILED TO A VERDICT ALREADY IN THE BOOK — the outcome table
 * calls `home_run` first and justOut() then shoves the flight over whatever
 * fence is there. A per-park wall would change the replay and not one result.
 * A park has to move the bats, the way `offence` does, or it is scenery.
 *
 * ⚠️ AND GEOMETRY CANNOT BE ALLOWED TO DECIDE A HOME RUN, WHICH WAS MEASURED
 * RATHER THAN ASSUMED. placement.ts lets geometry vote on HIT OR OUT, and the
 * obvious next step is to let it vote on home runs the same way: demote a
 * table-homer whose flight never reached the fence, promote a double that
 * cleared it, matched so the rate holds. Counted over 52,417 balls in play
 * against the neutral 400-foot bowl:
 *
 *     table home runs            11,316
 *     flight never reached 400    6,683   (59% of them)
 *     doubles that cleared 400       154
 *
 * The flight model and the outcome table are not on the same scale for home
 * runs and never were — plot.ts's own note on justOut() says so ("a 105mph ball
 * at the flat end of the launch band computes 377 feet"), and 59% is what
 * "sometimes" turns out to mean. A matched swap would delete three fifths of
 * the home runs in the game and hand back two hundred. So the fence decides
 * where a home run is DRAWN and the park decides how OFTEN one is hit, and
 * those are two different mechanisms on purpose. scripts/hrswap.ts is the probe;
 * re-run it before anybody tries this again.
 */
/**
 * A BALLPARK, AS A LAYOUT — three fences and how much room there is in foul
 * ground. Everything the engine does with a park is DERIVED from these four
 * numbers; there is no second set of knobs to disagree with them.
 *
 * ⚠️ THE DIMENSIONS ARE THE TRUTH AND THE FACTORS ARE DERIVED, which is the
 * whole reason this is a layout rather than a pair of multipliers. The first
 * cut of this feature was `power` and `contact` written by hand, and it had the
 * failure this file already warns about in another voice — see the note on
 * zoneRate in pitcher.ts, "a separate control multiplier on top would be two
 * knobs turning one thing". A 310-foot fence and a 0.95 power factor on the
 * same club is a park that says two different things about itself. Move a
 * fence and the factor follows; that is the contract.
 *
 * ⚠️ WHAT EACH NUMBER ACTUALLY REACHES:
 *
 *   left / center / right  →  parkPower(), the multiplier on every hitter's
 *                             power in this building. See atPark().
 *                         →  wallAt(), the fence the replay draws and the
 *                             distance a home run is reported at.
 *   foul                   →  parkFoulAngle(), how much of the foul population
 *                             somebody can get under. See caughtFoul() in hit.ts.
 *
 * ⚠️ THERE IS NO WALL HEIGHT AND NO ALTITUDE. A thirty-seven-foot wall in left
 * is expressed as the distance that makes it play the way it plays, which is
 * what NEM's 310 is doing; a mile of thin air is expressed as fences. Both
 * would be a second knob turning the same thing, and neither has a read site
 * the engine could give it that these four do not already cover.
 */
export interface Park {
  /** What it is called. Shown on the pre-game card; the engine never reads it. */
  name: string;
  /** Feet down the left-field line. */
  left: number;
  /** Feet to straightaway centre — the deepest point, and the gaps with it. */
  center: number;
  /** Feet down the right-field line. */
  right: number;
  /**
   * HOW MUCH ROOM THERE IS IN FOUL GROUND, as a multiplier. 1 is ordinary,
   * above 1 is acreage a catcher can run in, below 1 is the seats right on top
   * of the line. It moves foul POPS somebody catches and nothing else — see
   * parkFoulAngle().
   */
  foul: number;
}

/**
 * ONE NUMBER FOR HOW BIG A PARK IS, in feet.
 *
 * ⚠️ CENTRE CARRIES THE MOST WEIGHT AND IT IS NOT BECAUSE OF CENTRE FIELD. The
 * engine has three fences and a real park has a whole arc; the deepest point
 * stands in for the two GAPS either side of it, which is where the ball that
 * would have been a home run somewhere else actually dies. The lines take the
 * rest between them because that is where pull power goes.
 *
 * ponytail: a weighted mean of the three numbers there are. Not an integral
 * around an interpolated fence, not an area. Those would be arithmetic with a
 * decimal point of extra precision on top of three hand-written numbers.
 */
export const parkSize = (p: Park): number => 0.3 * p.left + 0.4 * p.center + 0.3 * p.right;

/**
 * THE SIZE THAT PLAYS NEUTRAL, and it is the thirty's own mean rather than a
 * round number somebody liked.
 *
 * ⚠️ IT IS WHAT KEEPS THE LEAGUE'S SCORING WHERE IT WAS. Every park below is
 * measured against this, so the thirty average to a multiplier of 1 and the
 * run environment the whole engine was tuned around does not move when parks
 * are switched on. Add a club or re-cut a fence and this is the number to
 * re-derive — `node scripts/parks.ts` prints it.
 *
 * ⚠️ AND IT IS NOT 400, WHICH IS WHAT plot.ts's WALL_FT STILL IS. That constant
 * is the fallback fence for anything with no park — the roguelike, an
 * exhibition between two clubs nobody gave a building to, every test written
 * before this existed. A park-less game is played in a 400-foot bowl, exactly
 * as it always was.
 */
export const NEUTRAL_SIZE = 362;

/**
 * HOW MUCH A FOOT OF FENCE IS WORTH, and it was measured rather than chosen.
 *
 * A factor multiplies NINE hitters at once on BOTH clubs, so it compounds where
 * one man's rating does not. Measured over 500 games of ALB at DET, runs per
 * club per game against the multiplier:
 *
 *     0.92 → 4.00      1.00 → 5.30      1.05 → 5.76
 *     0.95 → 4.49      1.03 → 5.49      1.08 → 6.18
 *
 * ⚠️ THE CURVE IS NOT SYMMETRIC — half a run gained at 1.05 against four fifths
 * of a run lost at 0.95 — so a symmetric spread of park SIZES does not produce
 * a symmetric spread of runs, and the league would quietly lose offence if
 * NEUTRAL_SIZE were set to the bare arithmetic mean of the fences. It is set to
 * where the RUNS come out level, which is a slightly smaller park than the
 * average one. scripts/parks.ts is what says where that is.
 *
 * At this slope the league's smallest park (NEM, 340ft) plays at 1.064 and its
 * largest (DEN, 379ft) at 0.950 — about a run and a half a game between the two
 * extremes, which is roughly the spread real park factors have.
 */
export const PARK_SLOPE = 0.0029;

/** The multiplier a park puts on every hitter in it. 1 for a club with none. */
export const parkPower = (p: Park | undefined): number =>
  p === undefined ? 1 : 1 + (NEUTRAL_SIZE - parkSize(p)) * PARK_SLOPE;

/**
 * THE FENCE IN A GIVEN DIRECTION, in feet — the layout as the replay sees it.
 *
 * `dirDeg` is the engine's batted-ball direction: -45 is the left-field line,
 * 0 is straightaway centre, +45 is the right-field line. The fence is
 * interpolated between the three numbers a park carries.
 *
 * ⚠️ THE CURVE IS QUADRATIC, NOT LINEAR, AND A STRAIGHT LINE LOOKED WRONG. A
 * real outfield wall bulges out toward the GAPS and then falls away hard into
 * the corner. Interpolating straight from the line to centre instead drains
 * the alley — the part of the park that decides more balls than any other —
 * down to the average of the two things either side of it. Squaring keeps the
 * gap out near centre's depth and spends the whole difference in the last
 * fifteen degrees, which is what a ballpark looks like from above.
 *
 * The Common (310/390/302) across left field, to see the shape:
 *
 *     0°  390    -11°  385    -22°  371    -34°  344    -45°  310
 *
 * ⚠️ IT IS CLAMPED TO THE LINES. A foul ball's direction runs past ±45 all the
 * way to ±128 (see FOUL_MAX_DEG in hit.ts) and there is no outfield fence out
 * there at all. Nothing asks this about a foul — plotBatted() takes the foul
 * branch first — but a caller that did would otherwise get an extrapolated
 * fence behind home plate.
 */
export function wallAt(dirDeg: number, park: Park | undefined): number {
  if (park === undefined) return NEUTRAL_WALL_FT;
  const d = Math.max(-45, Math.min(45, dirDeg));
  const line = d < 0 ? park.left : park.right;
  // 0 at centre, 1 at the line, squared so the gaps stay deep.
  const t = (Math.abs(d) / 45) ** 2;
  return park.center + (line - park.center) * t;
}

/**
 * The fence a game with no park is played in front of.
 *
 * ⚠️ IT MUST STAY EQUAL TO WALL_FT IN plot.ts, and it is written here rather
 * than imported to keep the league out of the geometry's import graph — plot.ts
 * is a leaf and teams.ts is not. park.test.ts asserts the two agree, which is
 * the cheap half of the alternative.
 */
export const NEUTRAL_WALL_FT = 400;

/**
 * HOW HIGH A FOUL HAS TO BE HIT FOR SOMEBODY TO GET UNDER IT, in this park.
 *
 * ⚠️ THE BAND IS TINY AND THE NOTE ON FOUL_POP_ANGLE IN hit.ts SAYS WHY. The
 * bar cuts the top of a foul population that runs to 78°, so at the shipped 75
 * it takes the top three degrees. One degree either way is a third of the
 * effect, and hit.ts measured that past about 4% of plate appearances a foul
 * out starts eating strikeouts that should have happened, and a tenth of a run
 * a side with them. So the whole league lives inside 73.5° and 76.5° — a foul
 * multiplier of 1.5 is Oakland's acreage and 0.7 is the seats on the line, and
 * neither leaves that window.
 */
export const parkFoulAngle = (park: Park | undefined): number =>
  park === undefined ? BASE_FOUL_POP_ANGLE : BASE_FOUL_POP_ANGLE - (park.foul - 1) * 3;

/** Kept in step with FOUL_POP_ANGLE in hit.ts — park.test.ts asserts it. */
const BASE_FOUL_POP_ANGLE = 75;


/**
 * The two clubs as they hit in one building.
 *
 * ⚠️ IT APPLIES TO BOTH CLUBS, AND THAT IS THE HONEST MODEL. A hitter's park
 * does not follow him on the road and the home club does not get an edge out
 * of its own fences — both lineups hit in the same place on the same night.
 * Applying it to the home club only would be a home-field advantage wearing a
 * park's name, and it would re-rank all thirty clubs on a ladder value.ts
 * computes without ever reading this field.
 *
 * ⚠️ IT MOVES THE BATS, NOT THE ARMS, which is leagueUnder()'s rule above and
 * is right here for the same reason: weakening a staff to raise scoring in a
 * bandbox would make every ERA in the record book a lie about the pitchers.
 * A lively park says the HITTERS did more, which is what actually happened.
 *
 * ⚠️ AND IT IS APPLIED PER GAME, NOT STORED. newGame() calls this on its way
 * in and the result lives only in that GameState — nothing writes a parked
 * roster back to Season.rosters, so a long season cannot compound the same
 * park thirty times into a club that hits like a machine shop.
 */
export function atPark(club: Team, park: Park | undefined): Team {
  const power = parkPower(park);
  if (power === 1) return club;
  /**
   * ⚠️ POWER ONLY, AND CONTACT WAS DELIBERATELY LEFT ALONE. A fence changes
   * what a fly ball is WORTH; it does not change whether a hitter squares one
   * up. Scaling contact as well would be the park reaching into the part of an
   * at-bat it has no business in — and it would double-count, because a
   * shorter fence already turns fly balls into home runs through the power
   * curve. The room a big outfield gives a single to drop in is real and is
   * the one thing this model does not have; it is small, and it is not worth a
   * second number that would then have to be kept in step with the first.
   */
  const hit = (p: Player): Player => ({ ...p, power: p.power * power });
  return {
    ...club,
    lineup: club.lineup.map(hit),
    // The bench hits here too — pinchHit() writes a bench man into the lineup
    // mid-game, and a pinch hitter who ignored the park would be the one man
    // in the building playing a different game.
    ...(club.bench ? { bench: club.bench.map(hit) } : {}),
  };
}

/** The starter, for callers that only want to name him. */
export const starterOf = (t: Team): Pitcher => t.rotation[0]!;

// -------------------------------------------------------------- the parks

/**
 * THIRTY BUILDINGS, one per club.
 *
 * ⚠️ THE PARK IS READ OFF THE CLUB, NOT CHOSEN TO BALANCE ANYTHING — the same
 * rule the identity tags follow, and for the same reason. New England is a
 * three-hundred-and-ten-foot wall in left because that is what the Minutemen
 * are; Denver is the deepest outfield in the league because the club is called
 * the Void and a fly ball that dies on the track is what a void does. A fence
 * cut to move a win rate is a fence that will not survive the next re-cast of
 * the roster behind it.
 *
 * ⚠️ AND THE THIRTY AVERAGE TO NEUTRAL, WHICH IS THE PART THAT IS ARITHMETIC.
 * NEUTRAL_SIZE is set where the league's RUNS come out level, so switching
 * parks on redistributes offence between clubs without moving the run
 * environment the whole engine was tuned around. `node scripts/parks.ts`
 * prints every park's size and factor and the league's mean; run it after
 * touching any fence below.
 *
 * ⚠️ A PARK IS NOT A HOME-FIELD ADVANTAGE. atPark() gives it to BOTH lineups,
 * and a club plays half its schedule away, so a bandbox is a scoreboard rather
 * than an edge. What it DOES do is reward a roster that fits it — Detroit's
 * enormous power in a park with a 420-foot centre is the league's oldest joke
 * about itself, and it is meant to cost them.
 *
 * The lines run 302–355 and centre 390–420, which is roughly the real spread.
 * `foul` is acreage: 0.70 is the seats on top of the line, 1.25 is a catcher
 * with room to run.
 */
export const PARKS = {
  // ---- the three two-club towns

  /** Short porch in right, bought and paid for. The BIG_INNING club's building. */
  NYE: { name: 'The Cathedral', left: 318, center: 408, right: 314, foul: 0.85 },
  /** Across the river and twenty feet deeper everywhere that matters. */
  NYV: { name: 'Ironworks Park', left: 335, center: 408, right: 330, foul: 1.0 },
  /** Symmetric, warm, and more foul ground than anywhere but the plains. */
  LAC: { name: 'The Basin', left: 330, center: 395, right: 330, foul: 1.25 },
  /** The aqueduct runs behind the bleachers. Ordinary in every dimension. */
  LAA: { name: 'Cistern Field', left: 330, center: 400, right: 330, foul: 1.0 },
  /** South side. Wide open, and the phone in the pen never stops. */
  CHF: { name: 'Engine House', left: 330, center: 400, right: 335, foul: 1.05 },
  /** The ivy, and no foul ground at all — the seats are on the field. */
  CHI: { name: 'The Trellis', left: 355, center: 400, right: 353, foul: 0.75 },

  // ---- and the rest, alphabetically

  /** An old yard nobody has been allowed to modernise. Deep and awkward. */
  ALB: { name: 'The Grange', left: 348, center: 410, right: 340, foul: 1.1 },
  /** The warehouse in right is close enough to hit. */
  BAL: { name: 'The Wharf', left: 333, center: 400, right: 318, foul: 0.9 },
  /** Cold off the lake, deep to centre, and the wind is never behind you. */
  BUF: { name: 'The Drift', left: 345, center: 412, right: 345, foul: 1.2 },
  /** A bandbox on the river. Nobody here has ever walked on purpose either. */
  CIN: { name: 'The Sty', left: 328, center: 404, right: 325, foul: 0.85 },
  /** High wall in left, and a long way to everywhere else. */
  CLE: { name: 'The Rivetworks', left: 325, center: 405, right: 325, foul: 1.0 },
  /**
   * THE BIGGEST OUTFIELD IN THE LEAGUE, and the club is named for it. A fly
   * ball hit here does not get robbed, it simply stops existing.
   */
  DEN: { name: 'The Void', left: 352, center: 420, right: 352, foul: 1.05 },
  /**
   * ⚠️ THE LEAGUE'S MOST POWER, IN ITS SECOND-DEEPEST PARK, AND THAT IS THE
   * POINT. Detroit is written as enormous bats and no legs; putting them in a
   * 420-foot centre field is the building disagreeing with the roster, which
   * is the most interesting thing a park can do to a club.
   */
  DET: { name: 'The Foundry Yard', left: 342, center: 420, right: 330, foul: 1.1 },
  /** Domed, quirky, and the turf lets everything through. */
  FLA: { name: 'The Tank', left: 335, center: 404, right: 335, foul: 1.0 },
  /** Enormous alleys. Balls land in them and men keep running. */
  KCF: { name: 'The Yardworks', left: 330, center: 410, right: 330, foul: 1.0 },
  /** Deep, still, and hot. Get to their starter early or not at all. */
  MEM: { name: 'The Landing', left: 340, center: 408, right: 336, foul: 1.1 },
  /** Short and loud, with a roof to keep the weather off the fireworks. */
  MIL: { name: 'The Cooperage', left: 335, center: 396, right: 335, foul: 0.85 },
  /** Limestone, and a centre field that goes on a while. */
  MIN: { name: 'The Mill', left: 339, center: 404, right: 328, foul: 1.0 },
  /**
   * ⚠️ THE SMALLEST-POWER CLUB IN THE LEAGUE, IN ONE OF ITS LARGEST PARKS,
   * which is the same joke as Detroit told the other way round. Maine singles
   * you to death and steals the base it needs, and the park is built for
   * exactly that: no home runs, and room for a ball to land in.
   */
  MNE: { name: 'The Pound', left: 350, center: 415, right: 338, foul: 1.2 },
  /**
   * ⚠️ THE SMALLEST PARK IN THE LEAGUE. Three hundred and two feet down the
   * line in right and the crowd is standing on the foul line. It plays at 1.064
   * — the strongest park factor there is — and the Minutemen grind out long
   * counts in front of it all summer.
   */
  NEM: { name: 'The Common', left: 310, center: 390, right: 302, foul: 0.7 },
  /** Heavy, wet air. The ball goes where it is hit and no further. */
  NOL: { name: 'The Quarter', left: 332, center: 402, right: 332, foul: 1.0 },
  /** Wind, dust, and the most foul ground anybody plays in. */
  OKC: { name: 'The Section', left: 345, center: 408, right: 345, foul: 1.25 },
  /** A brick bandbox. Quiet for six innings and then it is 6-0. */
  PHI: { name: 'The Navy Yard', left: 329, center: 401, right: 330, foul: 0.85 },
  /** Dry desert air, and a centre field nobody has reached on the fly. */
  PHX: { name: 'The Kiln', left: 330, center: 407, right: 335, foul: 0.95 },
  /** Short down the right-field line, and a long walk to the left one. */
  PIT: { name: 'The Puddle', left: 325, center: 399, right: 320, foul: 0.9 },
  /** Marine air off the sound. Everything dies about ten feet short. */
  SEA: { name: 'The Cloudbank', left: 340, center: 412, right: 336, foul: 1.2 },
  /** The wind comes off the water in right and hands it back to you. */
  SFO: { name: 'The Horn', left: 339, center: 404, right: 350, foul: 1.05 },
  /** The one genuinely ordinary building in the league. */
  STL: { name: 'The Crossing', left: 336, center: 400, right: 335, foul: 1.0 },
  /** Heat, and a ball that carries. They out-slug you and they know it. */
  TEX: { name: 'The Skillet', left: 326, center: 398, right: 322, foul: 0.85 },
  /** Symmetric turf under a lid. Nothing to say about it, which is itself news. */
  TOR: { name: 'The Terminal', left: 328, center: 400, right: 328, foul: 1.0 },
} as const satisfies Record<string, Park>;

/**
 * THE DEEPEST FENCE IN THE LEAGUE, in feet — what the overhead camera is scaled
 * to fit.
 *
 * ⚠️ IT IS THE DEEPEST PARK, NOT THE FURTHEST BALL, and the difference was a
 * failing test. Sizing it to hold the hardest shot anybody hits means 505 feet
 * (MAX_CARRY_FT in plot.ts), which would draw every building in the league a
 * fifth smaller so that the rare 500-foot home run could stay on the canvas.
 * The camera's job is to frame the PARK. A monster shot has always sailed past
 * the top of the frame — the old camera was scaled to WALL_FT at 400 while
 * balls could already carry 505 — and it should keep doing so.
 *
 * ⚠️ IT IS DERIVED, NOT TYPED, so cutting DEN's centre field or adding a
 * thirty-first club with a deeper one cannot leave the camera scaled for a park
 * that no longer exists. The camera is fixed at this one scale for every
 * building — see makeCam(), which explains why that is the point rather than a
 * shortcut.
 */
export const DEEPEST_REACH_FT = Math.max(
  ...Object.values(PARKS).map((p) => Math.max(p.left, p.center, p.right)),
);

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
  { name: 'New York City Empire', abbr: 'NYE', lineup: NYE, rotation: NYE_ARMS, bullpen: NYE_PEN, bench: NYE_BENCH, identity: IDENTITIES.BIG_INNING, park: PARKS.NYE },
  { name: 'New York Vets', abbr: 'NYV', lineup: NYV, rotation: NYV_ARMS, bullpen: NYV_PEN, bench: NYV_BENCH, identity: IDENTITIES.GRINDERS, park: PARKS.NYV },
  { name: 'Los Angeles Comets', abbr: 'LAC', lineup: LAC, rotation: LAC_ARMS, bullpen: LAC_PEN, bench: LAC_BENCH, identity: IDENTITIES.TRACK_TEAM, park: PARKS.LAC },
  { name: 'Los Angeles Aqueducts', abbr: 'LAA', lineup: LAA, rotation: LAA_ARMS, bullpen: LAA_PEN, bench: LAA_BENCH, identity: IDENTITIES.SMALL_BALL, park: PARKS.LAA },
  { name: 'Chicago Firemen', abbr: 'CHF', lineup: CHF, rotation: CHF_ARMS, bullpen: CHF_PEN, bench: CHF_BENCH, identity: IDENTITIES.QUICK_HOOK, park: PARKS.CHF },
  { name: 'Chicago Ivy', abbr: 'CHI', lineup: CHI, rotation: CHI_ARMS, bullpen: CHI_PEN, bench: CHI_BENCH, identity: IDENTITIES.GRINDERS, park: PARKS.CHI },

  // One-club towns. Toronto is the only one outside the country, which is the
  // whole joke in its name — nobody travels like they do.
  { name: 'Albany Holdouts', abbr: 'ALB', lineup: ALB, rotation: ALB_ARMS, bullpen: ALB_PEN, bench: ALB_BENCH, identity: IDENTITIES.GRINDERS, park: PARKS.ALB },
  { name: 'Baltimore Crabbers', abbr: 'BAL', lineup: BAL, rotation: BAL_ARMS, bullpen: BAL_PEN, bench: BAL_BENCH, identity: IDENTITIES.SMALL_BALL, park: PARKS.BAL },
  { name: 'Buffalo Snowplows', abbr: 'BUF', lineup: BUF, rotation: BUF_ARMS, bullpen: BUF_PEN, bench: BUF_BENCH, identity: IDENTITIES.IRON_ARMS, park: PARKS.BUF },
  { name: 'Cincinnati Pigs', abbr: 'CIN', lineup: CIN, rotation: CIN_ARMS, bullpen: CIN_PEN, bench: CIN_BENCH, identity: IDENTITIES.HACKERS, park: PARKS.CIN },
  { name: 'Cleveland Rivets', abbr: 'CLE', lineup: CLE, rotation: CLE_ARMS, bullpen: CLE_PEN, bench: CLE_BENCH, identity: IDENTITIES.BIG_INNING, park: PARKS.CLE },
  { name: 'Denver Void', abbr: 'DEN', lineup: DEN, rotation: DEN_ARMS, bullpen: DEN_PEN, bench: DEN_BENCH, identity: IDENTITIES.QUICK_HOOK, park: PARKS.DEN },
  { name: 'Detroit Foundry', abbr: 'DET', lineup: DET, rotation: DET_ARMS, bullpen: DET_PEN, bench: DET_BENCH, identity: IDENTITIES.BIG_INNING, park: PARKS.DET },
  { name: 'Florida Stingrays', abbr: 'FLA', lineup: FLA, rotation: FLA_ARMS, bullpen: FLA_PEN, bench: FLA_BENCH, identity: IDENTITIES.TRACK_TEAM, park: PARKS.FLA },
  { name: 'Kansas City Freight', abbr: 'KCF', lineup: KCF, rotation: KCF_ARMS, bullpen: KCF_PEN, bench: KCF_BENCH, identity: IDENTITIES.HACKERS, park: PARKS.KCF },
  { name: 'Memphis Riverboats', abbr: 'MEM', lineup: MEM, rotation: MEM_ARMS, bullpen: MEM_PEN, bench: MEM_BENCH, identity: IDENTITIES.IRON_ARMS, park: PARKS.MEM },
  { name: 'Milwaukee Coopers', abbr: 'MIL', lineup: MIL, rotation: MIL_ARMS, bullpen: MIL_PEN, bench: MIL_BENCH, identity: IDENTITIES.BIG_INNING, park: PARKS.MIL },
  { name: 'Minneapolis Millers', abbr: 'MIN', lineup: MIN, rotation: MIN_ARMS, bullpen: MIN_PEN, bench: MIN_BENCH, identity: IDENTITIES.GRINDERS, park: PARKS.MIN },
  { name: 'Maine Lobsters', abbr: 'MNE', lineup: MNE, rotation: MNE_ARMS, bullpen: MNE_PEN, bench: MNE_BENCH, identity: IDENTITIES.SMALL_BALL, park: PARKS.MNE },
  { name: 'New England Minutemen', abbr: 'NEM', lineup: NEM, rotation: NEM_ARMS, bullpen: NEM_PEN, bench: NEM_BENCH, identity: IDENTITIES.GRINDERS, park: PARKS.NEM },
  { name: 'New Orleans Spirit', abbr: 'NOL', lineup: NOL, rotation: NOL_ARMS, bullpen: NOL_PEN, bench: NOL_BENCH, identity: IDENTITIES.HACKERS, park: PARKS.NOL },
  { name: 'Oklahoma City Dustbowl', abbr: 'OKC', lineup: OKC, rotation: OKC_ARMS, bullpen: OKC_PEN, bench: OKC_BENCH, identity: IDENTITIES.IRON_ARMS, park: PARKS.OKC },
  { name: 'Philadelphia Ironsides', abbr: 'PHI', lineup: PHI, rotation: PHI_ARMS, bullpen: PHI_PEN, bench: PHI_BENCH, identity: IDENTITIES.BIG_INNING, park: PARKS.PHI },
  // ⚠️ PHOENIX IS STEADY AND IT LOOKS LIKE A MISTAKE. "Two Hundred Innings
  // Bly" reads as IRON ARMS and it was, for one measurement: it cost them five
  // points of win rate, because `hook` multiplies limitOf(), limitOf() already
  // scales by stamina, and this staff runs 0.84-1.05. Riding a low-stamina arm
  // 28% past a limit that is already short is not a philosophy, it is abuse.
  // Their identity is the one thing no simulated game can price — see the
  // club's own header. Against a person they are the hardest club in the
  // league, and the tag for that is honesty about the sim.
  { name: 'Phoenix Flames', abbr: 'PHX', lineup: PHX, rotation: PHX_ARMS, bullpen: PHX_PEN, bench: PHX_BENCH, identity: IDENTITIES.STEADY, park: PARKS.PHX },
  { name: 'Pittsburgh Puddlers', abbr: 'PIT', lineup: PIT, rotation: PIT_ARMS, bullpen: PIT_PEN, bench: PIT_BENCH, identity: IDENTITIES.HACKERS, park: PARKS.PIT },
  { name: 'Seattle Rain-Men', abbr: 'SEA', lineup: SEA, rotation: SEA_ARMS, bullpen: SEA_PEN, bench: SEA_BENCH, identity: IDENTITIES.GRINDERS, park: PARKS.SEA },
  { name: 'San Francisco Foghorns', abbr: 'SFO', lineup: SFO, rotation: SFO_ARMS, bullpen: SFO_PEN, bench: SFO_BENCH, identity: IDENTITIES.SMALL_BALL, park: PARKS.SFO },
  { name: 'St. Louis Ferryman', abbr: 'STL', lineup: STL, rotation: STL_ARMS, bullpen: STL_PEN, bench: STL_BENCH, identity: IDENTITIES.GRINDERS, park: PARKS.STL },
  { name: 'Texas Wildcats', abbr: 'TEX', lineup: TEX, rotation: TEX_ARMS, bullpen: TEX_PEN, bench: TEX_BENCH, identity: IDENTITIES.HACKERS, park: PARKS.TEX },
  { name: 'Toronto Travelers', abbr: 'TOR', lineup: TOR, rotation: TOR_ARMS, bullpen: TOR_PEN, bench: TOR_BENCH, identity: IDENTITIES.STEADY, park: PARKS.TOR },
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
  const base = temper(SOURCE, parity);
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
 * THE CLUBS THIS COPY OF THE GAME PLAYS WITH — yours if you have imported a
 * league, the thirty written above if you have not.
 *
 * ⚠️ IT SITS WHERE `WRITTEN` USED TO, AND BOTH READERS HAD TO MOVE. LEAGUE is
 * built from it, and so is leagueUnder(), which is what a FRANCHISE seeds
 * Season.rosters from. Changing only the first would have given you a custom
 * league on the club picker and the shipped thirty inside the season you then
 * played — the same clubs on the standings table and different men inside them.
 *
 * ⚠️ THE CUSTOM DOCUMENT IS TREATED AS WRITTEN, NOT AS FINISHED. It goes in
 * exactly where WRITTEN went in, so temper() applies parity to it once, at the
 * strength the season chose. That is also the answer to "will you mangle my
 * numbers": BRUTAL is a parity of 1, and temper() returns what it was given
 * untouched at 1. See the header of league.ts.
 *
 * ⚠️ AN UNREADABLE STORED LEAGUE FALLS BACK RATHER THAN THROWING. This is
 * module-evaluation time on the title screen — there is no UI yet to report to
 * and nothing to catch a throw — so loadCustomLeague() hands back null for
 * anything it cannot vouch for and the league screen explains it later.
 */
const SOURCE: readonly Team[] = (loadCustomLeague() ?? WRITTEN).map(fillRoster);

/**
 * The clubs at the shipped defaults — what an EXHIBITION plays and what every
 * instrument in scripts/ measures. A franchise builds its own through
 * leagueUnder() at kickoff and stores it in Season.rosters; nothing in a
 * running season reads this.
 */
export const LEAGUE: readonly Team[] = temper(SOURCE, TALENT_SPREAD);

/**
 * The clubs as the SOURCE writes them, compression not applied — the document
 * the league screen exports for editing.
 *
 * ⚠️ THIS AND NOT `LEAGUE` IS WHAT ROUND-TRIPS. Exporting the compressed clubs
 * and importing them back would apply temper() to numbers it had already moved,
 * and a league would shrink toward its own mean a little more every time
 * somebody edited one player in it.
 */
export const LEAGUE_SOURCE: readonly Team[] = SOURCE;

/**
 * The clubs exactly as teams.ts writes them, whatever has been imported over
 * them. The way back to the shipped league, and the fixed point the tests that
 * check tempering did what it says are measured against.
 */
export const LEAGUE_AS_WRITTEN = WRITTEN.map(fillRoster);

/** A club by its three letters. */
export const club = (abbr: string): Team => LEAGUE.find((t) => t.abbr === abbr)!;

/**
 * The default pairing, for everything headless — sim.ts, scripts/balance.ts.
 * The all-human club at home against the all-machine one.
 *
 * ⚠️ THEY FALL BACK TO THE FIRST TWO CLUBS, because a custom league has no
 * reason to contain an ALB or a DET. These are module constants read at import
 * by sim.ts and by main.ts's opening `newGame`, so an undefined here is a black
 * screen before anything has had a chance to say why. checkLeague() guarantees
 * at least two clubs, which is what makes the index safe.
 */
const defaultClub = (abbr: string, fallback: number): Team =>
  LEAGUE.find((t) => t.abbr === abbr) ?? LEAGUE[fallback]!;
export const HOME: Team = defaultClub('ALB', 0);
export const AWAY: Team = defaultClub('DET', 1);

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
