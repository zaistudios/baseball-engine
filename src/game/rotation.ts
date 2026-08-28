/**
 * THE ROTATION — who starts, and what the last start cost him.
 *
 * ⚠️ WHY THIS EXISTS. Before it, every club started `rotation[0]` in every game
 * it ever played. Measured over a fourteen-game franchise: Ed Mancuso started
 * all fourteen for Albany, you faced exactly SEVEN different starting pitchers
 * all season (seven opponents, twice each, the same arm both times) while the
 * computer's scouting book on you carried over all year, and two-thirds of
 * every staff never threw a pitch. It was the largest single hole in franchise
 * mode.
 *
 * TWO RULES, AND THEY ARE THE WHOLE FILE:
 *
 *   1. YOU PICK THE STARTER. Three of them, and the choice is yours before
 *      every game. The computer picks too — see pickStarter().
 *   2. A START COSTS HIM HIS LEGS FOR A GAME AND A HALF. REST_TO_FULL is 1.5,
 *      so a man who threw yesterday is at two thirds of his recovery today and
 *      whole the day after that.
 *
 * ⚠️ REST IS SPENT AS STAMINA, WHICH IS ALREADY THE CONTROL RATING'S CLOCK.
 * There is no new mechanic underneath this. `stamina` scales FRESH_UNTIL and
 * GASSED_AT in bullpen.ts; fatigue past FRESH_UNTIL takes the plate away
 * through ZONE_FATIGUE_PENALTY and gets him barrelled through
 * FATIGUE_BARREL_BONUS. So a tired starter loses his command EXACTLY the way a
 * starter deep into a game loses it, because it is the same curve read from a
 * lower starting point. That is the "stamina affects control as they pitch"
 * requirement, and it needed no second system to say it.
 *
 * ⚠️ THREE STARTERS AND A 1.5-GAME RECOVERY IS A DELIBERATE PAIRING. Turn the
 * rotation over in order and every man is always whole — gap of three against
 * a recovery of one and a half. The cost only exists if you REACH for
 * somebody, and that is the point: the ace on short rest in a game you have to
 * have is a decision, and a rotation nobody ever has to think about is a
 * calendar.
 *
 * ⚠️ REST IS A STOCK, NOT A TIMER, AND THAT IS WHAT MAKES IT A CONSTRAINT.
 * The first version kept only the DAY a man last started and read his recovery
 * off the gap. Simpler, and it did not bite: measured over 120 seasons a club
 * could start its ace in all fourteen games and finish BETTER than one that
 * turned its rotation over — New York +0.7 wins, Oklahoma City +0.5 — because
 * one day's rest always returned him to the same two-thirds no matter how many
 * times you had already done it to him. A rule that cannot compound is a rule
 * you can ignore forever.
 *
 * So each arm carries what he has LEFT. A start spends a whole unit; every day
 * refills 1/REST_TO_FULL of one. Turn the rotation over and the refill outruns
 * the spend and everybody is permanently whole. Ride one man and he goes
 * 1.00, 0.67, 0.33, 0.00 and stays on the floor — which is the arm you are
 * actually asking for when you keep sending him out.
 *
 * ponytail: still ONE number per arm plus the day it was written, and still no
 * innings count and no pitch ledger. The stock is only ever read forward from
 * the last start, so it cannot drift out of step with a schedule the way a
 * value updated every day for every arm would.
 */

import type { Pitcher } from '../core/pitcher.ts';
import type { Team } from './teams.ts';
import { armValue } from './value.ts';
import { GASSED_AT } from './bullpen.ts';

/**
 * How many games of rest a starter needs to be whole again.
 *
 * ⚠️ 1.5, NOT 2, AND THE HALF IS LOAD-BEARING. At 2 the rule is a step —
 * yesterday is broken, the day before is fine — and every rotation question
 * has one obviously correct answer. At 1.5 a man on one day's rest is at
 * two-thirds and genuinely usable, which is the only version where "start the
 * ace early" is a judgement rather than a mistake.
 */
export const REST_TO_FULL = 1.5;

/**
 * What a starter has left on ZERO rest — same day, back to back.
 *
 * Not zero, because an arm at zero stamina cannot take the ball at all and the
 * screen would be offering you a man you must never pick. Half is a man who
 * will give you three innings and then start walking people.
 */
export const SPENT = 0.3;

/**
 * HOW MANY GAMES IT TAKES A RELIEVER TO REFILL ONE WHOLE UNIT.
 *
 * ⚠️ SLOWER THAN A STARTER'S 1.5, WHICH LOOKS BACKWARDS AND IS NOT. A start
 * spends a whole unit; a relief outing spends a FRACTION of one — see
 * reliefCost(). Twenty-five pitches costs about half a unit, so 2.5 games to
 * refill means a man used every other day is permanently whole and a man used
 * three days running is finished on the fourth. That is the shape a real pen
 * has, and it is the reason the number is not simply "faster because he threw
 * less".
 */
export const RELIEF_REST_TO_FULL = 1.9;

/**
 * WHAT AN APPEARANCE COSTS BEFORE HE HAS THROWN A PITCH THAT COUNTS.
 *
 * ⚠️ WITHOUT THIS, PEN REST DOES NOTHING, and the first cut proved it. Cost
 * measured purely as `pitches / his limit` makes an ordinary one-inning outing
 * worth about a third of a unit against a refill of 0.4 a day — so a reliever
 * used EVERY SINGLE DAY still gained ground, and the ledger existed without
 * ever constraining anybody. Getting loose, getting up twice, and the innings
 * he does throw are not free, and this is the part of an outing that does not
 * scale with the box score.
 */
export const APPEARANCE_COST = 0.25;

/**
 * What one relief outing takes out of him, in units.
 *
 * Against HIS OWN limit, so a short arm is not punished for being short: a
 * closer built for twenty pitches pays a full tank for twenty, and a long man
 * pays the same for forty.
 */
export const reliefCost = (arm: Pitcher, pitches: number): number =>
  APPEARANCE_COST + pitches / Math.max(1, GASSED_AT * Math.max(0.2, arm.stamina ?? 1));

/**
 * WHEN EACH ARM LAST WORKED AND WHAT IT LEFT HIM, by club and by name.
 *
 * ⚠️ IT COVERS THE WHOLE STAFF, not just the rotation — it was `StartLog` and
 * held starters only, which is why "get to the pen early" measured as close to
 * free: three relievers were fresh in every game of the season no matter how
 * hard they had been worked yesterday.
 *
 * ⚠️ KEYED BY NAME because a Pitcher has no id — the same reason moments.ts
 * swaps arms by index. Names are unique across the league and rotation.test.ts
 * holds them to it.
 */
export interface ArmRest {
  /** The day he last started. */
  day: number;
  /**
   * What he had left the moment that start ended — one whole unit spent.
   *
   * Can be NEGATIVE, down to -1: that is a man who was already short when you
   * sent him out again, and it is the hole he now has to climb out of.
   */
  left: number;
}

export type RestLog = Readonly<Record<string, Readonly<Record<string, ArmRest>>>>;

/** How deep a hole one arm can be dug into, however often he is ridden. */
const FLOOR = -1;

/**
 * 0 for a man with nothing left, 1 for a man who is whole.
 *
 * `perGame` is his refill rate — REST_TO_FULL for a starter, the slower
 * RELIEF_REST_TO_FULL for a reliever. It is an argument rather than something
 * read off the arm because the same Pitcher can be either: moments.ts trades
 * arms between clubs, and nothing stops a man being a starter for one and
 * sitting in the pen for another.
 */
export function freshness(
  log: RestLog,
  abbr: string,
  arm: string,
  day: number,
  perGame: number = REST_TO_FULL,
): number {
  const r = log[abbr]?.[arm];
  // Never worked: whole. This is opening day, and it is also every exhibition.
  if (!r) return 1;
  return Math.max(0, Math.min(1, r.left + (day - r.day) / perGame));
}

/** How rested one RELIEVER is — the same fold, on the pen's slower clock. */
export const penFreshness = (log: RestLog, abbr: string, arm: string, day: number): number =>
  freshness(log, abbr, arm, day, RELIEF_REST_TO_FULL);

/**
 * Every reliever's legs for tonight, by name. This is what a Staff carries.
 *
 * ⚠️ A MAP AND NOT AN ARRAY PARALLEL TO `bullpen`. bringInRelief() removes the
 * man it picked, so any index-aligned second array would be one filter away
 * from pointing at the wrong arm. A name is stable through that.
 */
export function penLegs(
  pen: readonly Pitcher[],
  log: RestLog,
  abbr: string,
  day: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of pen) out[a.name] = restedStamina(a, penFreshness(log, abbr, a.name, day));
  return out;
}

/**
 * His legs for TODAY: his rating, scaled by how much of him has come back.
 *
 * This is the number that goes on ArmState and that fatigue() reads. The
 * Pitcher's own `stamina` is never modified — a Team is configuration and a
 * tired man is state.
 */
export const restedStamina = (arm: Pitcher, fresh: number): number =>
  (arm.stamina ?? 1) * (SPENT + (1 - SPENT) * fresh);

/** Everything the screen needs to draw one row of the starter picker. */
export interface StarterOption {
  index: number;
  arm: Pitcher;
  /** 0..1. */
  fresh: number;
  /** His legs today, after rest. */
  stamina: number;
  /** A word for the row: RESTED / WORKING / SHORT REST / SPENT. */
  condition: string;
}

export function starterOptions(t: Team, log: RestLog, day: number): StarterOption[] {
  return t.rotation.map((arm, index) => {
    const fresh = freshness(log, t.abbr, arm.name, day);
    return {
      index,
      arm,
      fresh,
      stamina: restedStamina(arm, fresh),
      condition:
        fresh >= 1 ? 'RESTED' : fresh >= 0.66 ? 'WORKING' : fresh > 0 ? 'SHORT REST' : 'SPENT',
    };
  });
}

/**
 * THE COMPUTER'S PICK: whoever has waited longest, ties to the better arm.
 *
 * ⚠️ THE FIRST VERSION SCORED REST AND QUALITY TOGETHER — `armValue * (0.35 +
 * 0.65 * fresh)` — and a test caught it starting only TWO of the three all
 * season. The arithmetic is worth keeping written down, because the mistake is
 * an easy one to make twice:
 *
 *   day 0  everybody whole, so it takes the ace
 *   day 1  the ace is spent, so it takes the second-best
 *   day 2  the ace is whole again after 1.5 — so it takes the ace
 *   day 3  the second-best is whole — so it takes him
 *
 * ...and the third starter never throws a pitch. A recovery of a game and a
 * half means TWO arms can cover every day of the schedule, so a manager who
 * only ever reaches for the best available man never needs a third. The rest
 * rule was right and the greedy pick was wrong.
 *
 * ⚠️ SO IT IS AN ORDER, WHICH IS WHAT A ROTATION ACTUALLY IS. Longest since
 * his last start wins, which cycles 1-2-3-1-2-3 on its own and hands every man
 * two days off — comfortably past the game and a half he needs. Quality only
 * breaks ties, which happens on opening day and sets the order ace-first.
 *
 * ⚠️ THE COMPUTER DOES NOT LINE ITS ACE UP FOR THE SEMIFINAL, and you do. That
 * asymmetry is the whole player-facing decision: the bench follows its
 * rotation, and the one thing you can do that it cannot is break yours on
 * purpose for a game you have to have. See rotationPanel() in main.ts.
 */
export function pickStarter(t: Team, log: RestLog, day: number): number {
  let best = 0;
  let waited = -Infinity;
  let quality = -Infinity;
  t.rotation.forEach((arm, index) => {
    const r = log[t.abbr]?.[arm.name];
    // Never started is the longest wait there is, so opening day is a clean
    // tie and the ace takes the ball.
    const since = r === undefined ? Infinity : day - r.day;
    const v = armValue(arm);
    if (since > waited || (since === waited && v > quality)) {
      waited = since;
      quality = v;
      best = index;
    }
  });
  return best;
}

/**
 * Write today's start into the log. Returns a new log; nothing is mutated.
 *
 * He is charged one whole unit against whatever he had when he took the ball,
 * so a man who was already short goes into deficit and needs longer than a
 * game and a half to climb back. FLOOR stops that from running away.
 */
export function recordStart(log: RestLog, abbr: string, arm: string, day: number): RestLog {
  const left = Math.max(FLOOR, freshness(log, abbr, arm, day) - 1);
  return { ...log, [abbr]: { ...(log[abbr] ?? {}), [arm]: { day, left } } };
}

/**
 * ...and one relief outing, charged for what it actually was.
 *
 * A no-pitch appearance still costs APPEARANCE_COST — he got loose and he came
 * in. Zero-length outings do not exist in this engine anyway; the guard is for
 * a caller handing over an arm that never threw.
 */
export function recordRelief(
  log: RestLog,
  abbr: string,
  arm: Pitcher,
  pitches: number,
  day: number,
): RestLog {
  const left = Math.max(
    FLOOR,
    penFreshness(log, abbr, arm.name, day) - reliefCost(arm, pitches),
  );
  return { ...log, [abbr]: { ...(log[abbr] ?? {}), [arm.name]: { day, left } } };
}

// ------------------------------------------------------------------ the pen

/** What the manager knows when the phone rings. */
export interface ReliefSituation {
  inning: number;
  /** Runs the PITCHING side is behind by. Negative means they lead. */
  deficit: number;
}

/**
 * WHICH ARM THE COMPUTER BRINGS IN — an index into what is left in the pen.
 *
 * ⚠️ IT USED TO BE `bullpen[0]`, ALWAYS, which made a three-man pen a queue
 * rather than a decision and meant the best arm on the staff was whoever
 * happened to be listed last. Now both sides choose: you from the pen panel,
 * the computer from here.
 *
 * The rule is the one a real bench uses and it is two lines. LATE AND CLOSE,
 * send the best arm you have — that is what a closer is for, and holding him
 * back for a save that never comes is how you lose the game in the seventh.
 * ANY OTHER TIME, send the longest arm, because the innings still have to come
 * from somewhere and burning your best man in a blowout leaves you nothing.
 *
 * ⚠️ AND BOTH ARE NOW SCALED BY HOW MUCH OF HIM IS LEFT. A closer on his fourth
 * straight day is not the best arm you have, whatever the card says — sending
 * him because of the rating on the card is the pen's version of starting a
 * spent ace. `legs` is a name-to-stamina map; a missing name is a whole man,
 * which is what an exhibition hands over.
 *
 * ponytail: no warming up, no handedness matchup, no save situation proper, no
 * holding a man back for tomorrow. Two branches and a rest multiplier. The
 * lefty specialist is a real thing and it is also a fourth arm, a platoon read
 * and a UI, none of which anybody has asked for.
 */
export function pickReliever(
  pen: readonly Pitcher[],
  sit: ReliefSituation,
  legs: Readonly<Record<string, number>> = {},
): number {
  if (pen.length === 0) return 0;
  const lateAndClose = sit.inning >= 7 && Math.abs(sit.deficit) <= 3;
  let best = 0;
  let score = -Infinity;
  pen.forEach((arm, i) => {
    const rated = arm.stamina ?? 1;
    // How much of him is here tonight, 0..1 against his own rating.
    const share = Math.min(1, (legs[arm.name] ?? rated) / Math.max(0.01, rated));
    const s = (lateAndClose ? armValue(arm) : rated) * share;
    if (s > score) {
      score = s;
      best = i;
    }
  });
  return best;
}
