/**
 * The at-bat resolver. Port of HitCalculator.calculate_hit().
 *
 * Two deliberate departures from the GDScript, both to kill the engine seam:
 *
 *  - It takes a signed offsetMs, not a Vector2 pair and a scene-derived
 *    duration. Grading happens in timing.ts and nothing here re-derives it.
 *  - It takes an Rng, not global randf(). Same inputs plus same seed always
 *    give the same at-bat, which is what makes an agent's test assertable and
 *    what the experiment's dataset needs.
 */

import { makeRng, type Rng } from './rng.ts';
import { grade, type TimingGrade } from './timing.ts';
import {
  OUTCOME_TABLES,
  isHit,
  isOut,
  type Outcome,
  type OutcomeTable,
  type PitchType,
} from './hitTables.ts';

/**
 * WHERE IT CROSSES, as a 3x3 grid over the plate.
 *
 * ⚠️ THE FIVE ORIGINAL NAMES ARE UNCHANGED ON PURPOSE. This grew from five
 * spots to nine by ADDING the four corners, not by renaming anything, so every
 * existing caller, table and test still means exactly what it meant before.
 * 'high' is high-and-centred, 'inside' is inside at belt height, 'middle' is
 * the middle. The corners are the four that were missing.
 *
 * Inside and outside are ABSOLUTE, not relative to the batter's handedness.
 * Making them relative is a real feature and a much larger one — it would have
 * to reach the renderer, the AI's location preferences and the platoon table
 * all at once.
 */
export type PitchLocation =
  | 'high_inside'
  | 'high'
  | 'high_outside'
  | 'inside'
  | 'middle'
  | 'outside'
  | 'low_inside'
  | 'low'
  | 'low_outside';

/** Every spot, in reading order — the same order the on-screen grid draws. */
export const ALL_LOCATIONS: readonly PitchLocation[] = [
  'high_inside',
  'high',
  'high_outside',
  'inside',
  'middle',
  'outside',
  'low_inside',
  'low',
  'low_outside',
];

/** Which side of the plate. Batters bat it, pitchers throw it. */
export type Hand = 'L' | 'R';

/**
 * THE RATING CARD. One bag of numbers per hitter, all centred on 1.0.
 *
 * Mirrors MLB The Show's hitting attributes, minus the ones this engine has
 * no surface for. Every one of them is read somewhere in this file or the two
 * next to it — a rating with no read site is a number on a namecard, which is
 * what power used to be (see applyPower).
 *
 *   power    damage. Curve through the outcome table. applyPower().
 *   contact  how well you square it up. Scales ALL timing windows. grade().
 *   vision   how often you get the bat on it. Scales the WHIFF window only.
 *   clutch   with men in scoring position, contact goes up. resolveSwing().
 *   bunt     laying one down. resolveBunt().
 *   speed    legs. Steals, the extra base, beating out a bunt, the double play.
 */
export interface BatterStats {
  power: number;
  contact: number;
  /** Plate vision. Widens only the whiff boundary — see grade() in timing.ts. */
  vision: number;
  clutch: number;
  /** Bunting. Fewer popped-up bunts, more fouls kept fair, more drag hits. */
  bunt: number;
  /**
   * Legs. Was read by baserunning.ts only; the drag bunt is the first thing in
   * the HIT engine that needs it, so it moved into the card with the rest.
   */
  speed: number;
}

export const DEFAULT_STATS: BatterStats = {
  power: 1.0,
  contact: 1.0,
  vision: 1.0,
  clutch: 1.0,
  bunt: 1.0,
  speed: 1.0,
};

/**
 * THE PLATOON SPLIT, as a multiplier on the contact stat.
 *
 * The single most legible fact in baseball that this game did not have: a
 * right-handed hitter would rather face a lefty, and everybody knows it. It
 * lands on CONTACT rather than on the outcome table on purpose — contact
 * scales the timing windows inside grade(), and "seeing the ball well" is
 * exactly a question of how much time you have to decide. A same-handed
 * slider is hard to hit because you pick it up late, not because the bat
 * behaves differently when it gets there.
 *
 * THE BREAKING BALL CARRIES THE SPLIT. A same-side slider starts at your hip
 * and finishes off the plate, which is why the real platoon advantage is
 * mostly a breaking-ball effect and why relief pitchers are matched up an
 * inning at a time. A fastball is a fastball from either side, so its split is
 * small.
 *
 * THE KNUCKLEBALL IS EXEMPT, and that is real too: it has no spin, so there is
 * no arm-side movement for the handedness to be relative to. Nobody sees it
 * from either box. Returning 1.0 also keeps the pitch's identity intact — its
 * counterplay is DON'T SWING, and a platoon edge on it would muddy that.
 *
 * ponytail: four numbers and a branch, not a matchup matrix. Real splits vary
 * by pitcher; when one needs its own, give Pitcher a `platoon` scalar and
 * multiply it in here.
 */
export function platoonContact(batter: Hand, pitcher: Hand, pitch: PitchType): number {
  if (pitch === 'knuckleball') return 1.0;
  const breaking = pitch === 'slider' || pitch === 'curveball';
  return batter === pitcher ? (breaking ? 0.82 : 0.93) : breaking ? 1.08 : 1.04;
}

export interface SwingInput {
  /** Signed ms: negative early, positive late. See timing.ts. */
  offsetMs: number;
  pitchType: PitchType;
  location?: PitchLocation;
  isPowerSwing?: boolean;
  stats?: Partial<BatterStats>;
  runnersInScoringPosition?: boolean;
  /**
   * Who is standing where. Omitted means no split is applied at all, which is
   * what the CLI and most unit tests want — passing one hand without the other
   * would be a matchup with half of itself missing.
   */
  batterHand?: Hand;
  pitcherHand?: Hand;
  /**
   * Two strikes on the hitter. Triggers the protective swing — UNLESS he is
   * sitting on the pitch, because a man who has decided to go get it is not
   * also shortening up. See applyProtect().
   */
  twoStrikes?: boolean;
  /**
   * Division rules, multiplied into the table before the roll. The human
   * holdouts crush home_run to 0.12; the machine division multiplies it by
   * 2.4. Multiplied rather than
   * replaced so the Strat-O-Matic spine underneath stays untouched — the
   * vault is explicit that the hit engine is not the thing to redesign.
   */
  divisionRules?: Partial<Record<Outcome, number>>;
  /**
   * Multiplier on the foul-ball share. 1 (the default) is the ported tables
   * exactly, which is what the roguelike wants. See applyFoul().
   */
  foulBoost?: number;
  /**
   * THE PITCHER'S STUFF, as a multiplier on the hitter's effective contact.
   * Below 1 is a pitch that is hard to time. Computed by stuffFactor() in
   * pitcher.ts from his break and his clutch, so those two ratings land on the
   * same dial the platoon split and the hitter's own contact already turn —
   * "how long did he have to decide" is one question with one answer.
   */
  stuff?: number;
  /**
   * He squared to bunt. Skips the swing entirely: the outcome tables describe
   * a SWING and a bunt is not one. See resolveBunt().
   */
  isBunt?: boolean;
  /**
   * THE DIFFICULTY SETTING, as a multiplier on the timing windows. Above one
   * is wider and easier. See difficulty.ts.
   *
   * ⚠️ IT RIDES ON CONTACT AND ONLY ON CONTACT, so it moves which grade the
   * swing earns and nothing else — not the power tables, not the location
   * shaping, not the foul share. That is the whole intent: a wider window is
   * more time to be right, not a better hitter.
   *
   * ⚠️ OPTIONAL, AND ONLY THE HUMAN PATH FILLS IT IN. sim.ts builds the
   * computer's SwingInput and leaves this out, so the assist can never end up
   * helping the opposition hit. A missing value is 1 — the game as balanced.
   */
  assist?: number;
}

export interface HitResult {
  outcome: Outcome;
  timing: TimingGrade;
  pitchType: PitchType;
  isOut: boolean;
  isHit: boolean;
  /**
   * The platoon multiplier that was applied. 1.0 means no matchup was supplied
   * or the pitch was a knuckleball. Reported so the UI can say "he had him
   * matched up" rather than the player wondering why that slider was invisible.
   */
  platoon: number;
  /**
   * Which approach the swing was taken with. Named `stance` rather than
   * `approach` on purpose — the pitcher has an `Approach` too, and these are
   * the two halves of the same duel; a shared name would read as a shared type.
   */
  stance: 'sitting' | 'protecting' | 'normal';
  exitVelocity: number;
  /** Degrees off the ground. Negative is a chopper into the dirt. */
  launchAngle: number;
  /** Degrees: negative pulls, positive goes the other way. See DIRECTION_DEG_PER_MS. */
  direction: number;
  clutchApplied: boolean;
  /**
   * He bunted. Two downstream rules need to know, and neither can infer it
   * from the outcome: a bunt fouled off with two strikes is a STRIKEOUT
   * (atBat.ts), and a bunt ground out MOVES THE RUNNERS (inning.ts).
   *
   * Optional so the fixtures that hand-build a HitResult stay short — absent
   * means "not a bunt", which is what a hand-built swing always is.
   */
  bunted?: boolean;
}

/**
 * Launch angle ranges, ported verbatim from HitCalculator.calculate_launch_angle().
 * These are what make a popup look like a popup without anyone animating one.
 */
const LAUNCH_ANGLE: Record<Outcome, readonly [number, number]> = {
  strikeout: [0, 0],
  ground_out: [-10, 5],
  line_out: [10, 20],
  popup: [45, 80],
  foul: [-45, 45],
  single: [5, 25],
  double: [15, 30],
  triple: [8, 18],
  home_run: [25, 35],
};

/**
 * Early pulls, late goes the other way — the prototype's rule, kept.
 *
 * Its SCALE was not kept. calculate_hit_direction() used
 * `-swing_timing * 40.0` on a value in SECONDS, so the whole +/-0.06s contact
 * window mapped to +/-2.4 degrees — every ball went essentially straight up
 * the middle. Like the outcome tables it sat behind, that formula never once
 * ran in the shipped build, so nobody saw it. This scale spreads the real
 * +/-80ms contact window across the full +/-45 degrees.
 */
export const DIRECTION_DEG_PER_MS = 45 / 80;

/**
 * ⚠️ WHICH WAY IS "PULLED" DEPENDS ON WHICH SIDE HE HITS FROM.
 *
 * Fixed 2026-08-20. `direction` was `offsetMs * DIRECTION_DEG_PER_MS` with no
 * reference to the batter at all, and negative degrees is left field (see
 * web/plot.ts). That is right for a RIGHT-handed hitter — early, out in front,
 * pulled to left — and exactly backwards for a left-handed one, who pulls to
 * RIGHT field. Six of the fifteen in POOL bat left, so a third of the roster
 * was spraying every mistimed ball to the wrong side of the diamond.
 *
 * It went unnoticed because nothing downstream read `direction` until the
 * overhead replay, and nothing read it for RESULTS until defense.ts started
 * deciding who fields the ball.
 */
export function directionFor(offsetMs: number, batterHand: Hand = 'R'): number {
  const pulled = offsetMs * DIRECTION_DEG_PER_MS;
  const signed = batterHand === 'L' ? -pulled : pulled;
  return Math.max(-45, Math.min(signed, 45));
}

/**
 * How much more often a swing is fouled off than the ported tables say.
 *
 * 1 is the prototype's own numbers, which is what the roguelike still passes
 * (by passing nothing). The two-sided game passes a real value — see
 * game/sim.ts — because those tables produce far too few foul balls for a
 * nine-inning game: at-bats end too quickly and the pitch count lands near 240
 * against a real ~290.
 *
 * Applied as a multiplier and then renormalised, so the RELATIVE mix of every
 * other outcome is untouched. Hand-editing forty-five table entries to make
 * room would have changed the balance of the hit engine as a side effect.
 */
export function applyFoul(probs: OutcomeTable, boost: number): OutcomeTable {
  if (boost === 1) return probs;
  const foul = Math.min(0.92, probs.foul * boost);
  const rest = 1 - probs.foul;
  if (rest <= 0) return probs;
  const scale = (1 - foul) / rest;

  const out = { ...probs };
  for (const k of Object.keys(out) as Outcome[]) {
    out[k] = k === 'foul' ? foul : out[k] * scale;
  }
  return out;
}

function normalize(probs: OutcomeTable): OutcomeTable {
  const total = Object.values(probs).reduce((a, b) => a + b, 0);
  if (total <= 0) return probs;
  const out = { ...probs };
  for (const k of Object.keys(out) as Outcome[]) out[k] /= total;
  return out;
}

/**
 * Power, applied as a curve through 1.0 rather than a switch above it.
 *
 * ⚠️ REWRITTEN. The old version did nothing at all at `power <= 1.0` and then
 * multiplied home runs by `power * 2.0` above it — so 1.00 was neutral and
 * 1.001 doubled the home run rate, a cliff at exactly the value most of the
 * roster sits under. Two consequences, both bad:
 *
 * 1. Power did not influence hitting AT ALL for most of a run. Every Holdout
 *    is 0.65-0.80 and every one of them hit like a 1.0, so the whole first
 *    league had a stat on the namecard that changed nothing.
 * 2. The first +0.05 item was worth more than every one after it.
 *
 * Every exponent below is 1.0 at `power === 1.0`, so the curve is continuous
 * and the stat reads all the way down. Above 1.0 it lands close to where the
 * old numbers did at 1.5 (home run x3.4 against the old x3.0, triple x2.25
 * against x2.25), so the top end is not being retuned here — only the half
 * that was missing.
 *
 * ponytail: exponents, not a lookup table. Five numbers describe the whole
 * range and there is no band edge for a hitter to sit awkwardly on.
 */
function applyPower(probs: OutcomeTable, power: number): OutcomeTable {
  if (power === 1.0) return probs;
  // Negative exponents below, so a zeroed stat must not reach them.
  const q = Math.max(0.1, power);
  const p = { ...probs };
  p.home_run *= q ** 3;
  p.triple *= q ** 2;
  p.double *= q ** 1.5;
  // Weak contact stays on the ground and under the ball. NOTE: the old code
  // raised popups for BIG power instead (the uppercut read) and only above
  // 1.3. This runs the other way — a 0.65 Holdout popping up is the more
  // useful half of the effect, and it is one sign flip if that is wrong.
  p.ground_out *= q ** -0.7;
  p.popup *= q ** -0.4;
  return normalize(p);
}

/** The risk-reward dial: more damage, less contact. */
function applyPowerSwing(probs: OutcomeTable): OutcomeTable {
  const p = { ...probs };
  p.strikeout *= 1.4;
  p.popup *= 1.3;
  p.home_run *= 3.0;
  p.double *= 1.5;
  p.single *= 0.7;
  p.ground_out *= 0.8;
  return normalize(p);
}

/**
 * THE HITTER'S TWO APPROACHES, as multipliers on the contact stat.
 *
 * The engine has carried a risk-reward power swing since the port and it was
 * wired to NO INPUT — the README carried it as an open question for months.
 * Wiring it needed a second half to be a decision rather than a free bonus,
 * and the second half is what a hitter actually does with two strikes.
 *
 * SITTING ON IT costs contact as well as raising strikeouts. Without the
 * window penalty the power swing was pure upside on any pitch you had already
 * timed, which is not a choice.
 *
 * PROTECTING widens it. This is the counterpart the game was missing: two
 * strikes used to mean nothing except that the next whiff ended you. Now it is
 * a stance — you see the ball a little longer, you give up the damage, and you
 * fight pitches off. The foul multiplier below is the good part, and it works
 * because atBat.ts already knows a foul with two strikes is not the third one.
 */
export const SIT_ON_IT_CONTACT = 0.88;
export const PROTECT_CONTACT = 1.18;

/**
 * Shortened up. Less damage, more balls in play, and far more foul balls.
 *
 * ponytail: no separate two-strike outcome table. Six multiplies over the
 * existing row say the same thing and cannot fall out of step with it when
 * somebody retunes the tables.
 */
function applyProtect(probs: OutcomeTable): OutcomeTable {
  const p = { ...probs };
  // Fighting it off is the whole point of the stance, and it is free survival
  // by the count's own rules — which is exactly why the damage has to go.
  p.foul *= 1.5;
  p.strikeout *= 0.85;
  p.home_run *= 0.6;
  p.triple *= 0.7;
  p.double *= 0.8;
  p.single *= 1.05;
  return normalize(p);
}

/**
 * Two axes, composed — not nine hand-written cases.
 *
 * ⚠️ THE FIVE ORIGINAL SPOTS COME OUT BIT-FOR-BIT UNCHANGED, and that is the
 * property that let the grid grow from five to nine without re-balancing
 * anything. 'high' is UP composed with the identity column, 'inside' is the
 * identity row composed with IN, 'middle' is identity twice. Only the four
 * corners are new behaviour, and they are the products the switch could never
 * express: up-and-in is the pitch that gets hit out, down-and-away is the one
 * that gets beaten into the ground.
 */
type Vertical = 'up' | 'level' | 'down';
type Horizontal = 'in' | 'centre' | 'away';

const UP_DOWN: Record<Vertical, Partial<OutcomeTable>> = {
  up: { home_run: 1.4, popup: 1.2, ground_out: 0.6 },
  level: {},
  down: { ground_out: 1.4, home_run: 0.3, popup: 0.7 },
};

const IN_OUT: Record<Horizontal, Partial<OutcomeTable>> = {
  in: { home_run: 1.2 },
  centre: {},
  away: { home_run: 0.8, ground_out: 1.1 },
};

const AXES: Record<PitchLocation, readonly [Vertical, Horizontal]> = {
  high_inside: ['up', 'in'],
  high: ['up', 'centre'],
  high_outside: ['up', 'away'],
  inside: ['level', 'in'],
  middle: ['level', 'centre'],
  outside: ['level', 'away'],
  low_inside: ['down', 'in'],
  low: ['down', 'centre'],
  low_outside: ['down', 'away'],
};

/**
 * The cell as unit offsets: dx is -1 inside / +1 outside, dy is -1 high /
 * +1 low. Exported because BOTH renderers need to place the ball and there
 * must be exactly one answer to where a spot is — the engine renderer and
 * the roguelike renderer drifting apart on that is a bug you can see.
 */
export const locationOffset = (l: PitchLocation): { dx: number; dy: number } => {
  const [v, h] = AXES[l];
  return {
    dx: h === 'in' ? -1 : h === 'away' ? 1 : 0,
    dy: v === 'up' ? -1 : v === 'down' ? 1 : 0,
  };
};

export function applyLocation(probs: OutcomeTable, location: PitchLocation): OutcomeTable {
  const [v, h] = AXES[location];
  const mults = { ...UP_DOWN[v] } as Partial<OutcomeTable>;
  for (const [k, m] of Object.entries(IN_OUT[h]) as [Outcome, number][]) {
    mults[k] = (mults[k] ?? 1) * m;
  }
  // Dead centre changes nothing, so hand back the table it was given rather
  // than a normalised copy of itself.
  const keys = Object.keys(mults) as Outcome[];
  if (keys.length === 0) return probs;

  const p = { ...probs };
  for (const k of keys) p[k] *= mults[k]!;
  return normalize(p);
}
const EXIT_VELOCITY: Record<Outcome, number> = {
  strikeout: 0,
  popup: 65,
  ground_out: 75,
  line_out: 95,
  foul: 70,
  single: 85,
  double: 95,
  triple: 100,
  home_run: 110,
};

/**
 * The hardest anyone hits a baseball. The real record is 122.
 *
 * ⚠️ WITHOUT THIS THE TWO MULTIPLIERS BELOW COMPOUND PAST PHYSICS. A slugger
 * with 1.8 power on perfect timing was producing 145 mph off the bat, which
 * plot.ts then turned into a 460-foot line out. Both multipliers are correct
 * on their own; nothing was capping the product.
 */
const MAX_EXIT_VELOCITY = 122;

const VELOCITY_BY_TIMING: Record<TimingGrade, number> = {
  perfect: 1.1,
  good: 0.95,
  early: 0.85,
  late: 0.8,
  miss: 0,
};

function rollOutcome(probs: OutcomeTable, rng: Rng): Outcome {
  const roll = rng.next();
  let cumulative = 0;
  for (const key of Object.keys(probs) as Outcome[]) {
    cumulative += probs[key];
    if (roll <= cumulative) return key;
  }
  return 'ground_out';
}

/**
 * BUNTING. A separate resolution, because a bunt is not a swing.
 *
 * ⚠️ IT DELIBERATELY DOES NOT TOUCH OUTCOME_TABLES. Those tables are a reward
 * curve for TIMING — perfect is a hit 75% of the time — and a bunt has no
 * timing in it at all. Running one through them would make a well-timed bunt a
 * home run, which is the kind of thing that only looks wrong once it ships.
 * Four probabilities, rolled in order, and the bunt rating moves all four.
 *
 * WHAT THE RATING BUYS, in the order a bunter cares about it:
 *
 *   1. NOT POPPING IT UP. The bunt that gets you benched. Bad bunters do it
 *      four times as often as good ones, and a high pitch doubles it for
 *      everybody — you bunt DOWN at the ball, and you cannot get on top of one
 *      at the letters.
 *   2. KEEPING IT FAIR. A foul is a strike, and with two strikes it is the
 *      third one (see atBat.ts). That rule is what makes bunting a decision
 *      rather than a free take.
 *   3. BEATING IT OUT. Bunt AND legs, multiplied — this is the drag bunt, and
 *      it is the one place a 1.4-speed leadoff man turns a sacrifice into a
 *      hit. A slugger with 0.6 legs and a 0.3 bunt will never once get one.
 *
 * Everything left over is the ground out that MOVES THE RUNNERS, which is the
 * point of laying one down in the first place. inning.ts reads `bunted` for it.
 *
 * ponytail: no bunt placement, no squeeze, no fielder's choice at third, no
 * bunting the runner into a force at second. One roll, four outcomes. The
 * squeeze is the obvious next one and it needs a runner-on-third branch here
 * plus a call in the UI.
 */
export const BUNT_POP_UP = 0.07;
export const BUNT_FOUL = 0.33;
export const BUNT_HIT = 0.11;

/** Up in the zone is the pitch you cannot bunt. */
const HIGH_PITCHES: ReadonlySet<PitchLocation> = new Set<PitchLocation>([
  'high_inside',
  'high',
  'high_outside',
]);

function resolveBunt(input: SwingInput, stats: BatterStats, rng: Rng): Outcome {
  const skill = Math.max(0.1, stats.bunt);
  const location = input.location ?? 'middle';

  const pop = Math.min(0.4, (BUNT_POP_UP / skill) * (HIGH_PITCHES.has(location) ? 2 : 1));
  if (rng.next() < pop) return 'popup';

  const foul = Math.max(0.08, BUNT_FOUL - 0.12 * (skill - 1));
  if (rng.next() < foul) return 'foul';

  // Down and away is the ball you drag past the pitcher; up and in you are
  // fielding it off your own hands.
  const spot = HIGH_PITCHES.has(location) ? 0.6 : 1;
  const hit = Math.min(0.6, BUNT_HIT * skill * Math.max(0.1, stats.speed) * spot);
  return rng.next() < hit ? 'single' : 'ground_out';
}

/** A bunt leaves the bat at a walking pace, and it never leaves the infield. */
const BUNT_EXIT_VELOCITY = 42;

export function resolveSwing(input: SwingInput, rng: Rng): HitResult {
  const stats: BatterStats = { ...DEFAULT_STATS, ...input.stats };
  const location = input.location ?? 'middle';

  // The bunt is its own resolution and shares nothing below but the shape of
  // the return. Taken first so no swing modifier can reach it.
  if (input.isBunt) {
    const outcome = resolveBunt(input, stats, rng);
    return {
      outcome,
      timing: 'good',
      pitchType: input.pitchType,
      isOut: isOut(outcome),
      isHit: isHit(outcome),
      platoon: 1,
      stance: 'normal',
      exitVelocity: BUNT_EXIT_VELOCITY,
      // Popped-up bunts go straight up; everything else dribbles.
      launchAngle: outcome === 'popup' ? rng.range(50, 75) : rng.range(-5, 5),
      // Down a line, not sprayed — a bunt is aimed, not mistimed.
      direction: rng.range(-30, 30),
      clutchApplied: false,
      bunted: true,
    };
  }

  // Clutch widens the timing windows, so it has to apply before grading.
  const inScoringPosition = input.runnersInScoringPosition ?? false;
  const clutchApplied = inScoringPosition && stats.clutch > 1.0;

  // The matchup narrows or widens them the same way, and for the same reason —
  // both are answers to "how long did he have to decide". Needs BOTH hands;
  // one on its own is not a matchup.
  const platoon =
    input.batterHand && input.pitcherHand
      ? platoonContact(input.batterHand, input.pitcherHand, input.pitchType)
      : 1.0;

  // THE APPROACH. Sitting on a pitch and shortening up are the same kind of
  // decision pointed in opposite directions, and they are mutually exclusive:
  // a hitter who has committed to going and getting it is not also protecting.
  // That exclusivity is the decision — at two strikes, normal means survive
  // and power means all or nothing.
  const protecting = (input.twoStrikes ?? false) && !input.isPowerSwing;
  const approachContact = input.isPowerSwing
    ? SIT_ON_IT_CONTACT
    : protecting
      ? PROTECT_CONTACT
      : 1;

  const effectiveContact =
    (clutchApplied ? stats.contact * stats.clutch : stats.contact) *
    platoon *
    approachContact *
    // The arm's break and his own clutch, from stuffFactor() in pitcher.ts.
    (input.stuff ?? 1);

  // ⚠️ THE ASSIST GOES IN HERE AND NOWHERE ELSE. effectiveContact is read by
  // exactly one thing — grade() — so multiplying it here widens the windows and
  // leaves every probability below untouched. See SwingInput.assist.
  const timing = grade(input.offsetMs, effectiveContact * (input.assist ?? 1), stats.vision);

  let probs = OUTCOME_TABLES[timing][input.pitchType];

  // A whiff is a whiff - no modifier turns a miss into contact.
  if (timing !== 'miss') {
    if (input.divisionRules) {
      const p = { ...probs };
      for (const [outcome, mult] of Object.entries(input.divisionRules)) {
        p[outcome as Outcome] *= mult;
      }
      probs = normalize(p);
    }
    probs = applyPower(probs, stats.power);
    if (input.isPowerSwing) probs = applyPowerSwing(probs);
    else if (protecting) probs = applyProtect(probs);
    probs = applyLocation(probs, location);
    // Last, so the foul share is taken out of the finished distribution rather
    // than being reshaped by power and location afterwards.
    probs = applyFoul(probs, input.foulBoost ?? 1);
  }

  const outcome = rollOutcome(probs, rng);
  const [loAngle, hiAngle] = LAUNCH_ANGLE[outcome];

  return {
    outcome,
    timing,
    pitchType: input.pitchType,
    isOut: isOut(outcome),
    isHit: isHit(outcome),
    exitVelocity: Math.min(
      MAX_EXIT_VELOCITY,
      EXIT_VELOCITY[outcome] * VELOCITY_BY_TIMING[timing] * (0.8 + stats.power * 0.4),
    ),
    launchAngle: loAngle === hiAngle ? loAngle : rng.range(loAngle, hiAngle),
    direction: directionFor(input.offsetMs, input.batterHand),
    clutchApplied,
    platoon,
    stance: input.isPowerSwing ? 'sitting' : protecting ? 'protecting' : 'normal',
    bunted: false,
  };
}

/** Convenience for one-off scripts and tests. Prefer passing a shared Rng. */
export function resolveSwingSeeded(input: SwingInput, seed: number): HitResult {
  return resolveSwing(input, makeRng(seed));
}
