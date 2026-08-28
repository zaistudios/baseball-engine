/**
 * The pitcher: what gets thrown, how fast, and what the player can read.
 *
 * Built from the vault's pitch-and-at-bat spec, which converted the baseball
 * shelf into build rules. Three of those rules are load-bearing here:
 *
 *  1. THE CHANGEUP IS NOT A SLOW FASTBALL.
 *     The Godot prototype dropped 250 -> 150, a 40% speed cut the eye reads at
 *     release. A change-up's whole identity is the same arm speed with a grip
 *     that steals about 10 mph. It sits within 10-15% of the fastball here, and
 *     the tell has to come from somewhere other than velocity.
 *
 *  2. THE CURVE BREAKS ONCE, LATE.
 *     The prototype's sin(time*3) wobble was cosmetic and gave the player
 *     nothing to time against. A single late break is both truer and more
 *     learnable. Only the speed lives here; the break is the renderer's job.
 *
 *  3. THE TELL LADDER IS THE DIFFICULTY CURVE.
 *     Rookie tips the pitch before the windup, Veteran leaks it at release,
 *     the Ace gives nothing per-pitch and can only be beaten by the plan.
 *
 * ⚠️ REWRITTEN 2026-08-16 — THE PITCHER NO LONGER RUNS A TAPE LOOP.
 *
 * He used to pick with `pattern[pitchNumber % pattern.length]`, where
 * pitchNumber counted across the whole match. So the arm on the mound ignored
 * what it had just thrown, who was batting, who was on base, how many outs
 * there were and what the score was; the only situational logic in the file
 * was two hard branches at |strikes − balls| >= 2. Nothing about that is how a
 * pitcher thinks, and "make it play more like baseball" starts here, because
 * the pitcher is the thing the player interacts with on every single pitch.
 *
 * What replaces it is a PLAN. Every pitch now picks an `Approach` first — what
 * he is trying to do — and the pitch, the location and the zone rate all fall
 * out of that. A real pitcher establishes something, sets you up with it, and
 * puts you away with something else, and that sequence is what an at-bat is.
 *
 * THE READABILITY IS NOT LOST, IT MOVED. The old design's skill expression was
 * memorising an index — "his fourth pitch is a slider". The new one is reading
 * an intent — "he goes to the slider away with two strikes". That is a harder
 * thing to write and an easier thing to learn, it transfers between pitchers
 * instead of being thrown away with each one, and it is the actual skill real
 * hitters have. The Ace's decoy pattern is gone with the cycle it lived in;
 * what makes him an Ace now is that he is the only one who tips no intent.
 */

import type { Rng } from './rng.ts';
import { ALL_PITCH_TYPES, type PitchType } from './hitTables.ts';
import { ALL_LOCATIONS, type Hand, type PitchLocation } from './hit.ts';

/**
 * When the pitch becomes readable. This is the league ladder.
 *
 *  pre_pitch - visible before the windup. Long read. Rookie.
 *  release   - leaks in the first fraction of flight. Short read. Veteran.
 *  none      - nothing per-pitch. The plan is the only read. Ace.
 */
export type TellTiming = 'pre_pitch' | 'release' | 'none';

/**
 * Speeds in mph, feeding ballArrivalMs() in timing.ts.
 *
 * The gaps are the spec, not flavour: the change is 12% under the fastball
 * (inside the 10-15% band) and the curve is 14 mph slower (inside 10-20).
 * Change and curve land within 3 mph of each other on purpose — if speed alone
 * separated them, the tell system would have nothing left to do.
 */
export const PITCH_SPEED_MPH: Record<PitchType, number> = {
  fastball: 92,
  // A fastball that dies. Barely slower than one, which is the point — it is
  // not meant to be picked up out of the hand.
  sinker: 90,
  slider: 86,
  changeup: 81,
  curveball: 78,
  // The knuckleball is the outlier on purpose. 50-70mph, no spin, and the
  // vault calls it the best single idea the baseball shelf hands this
  // project: a pitch whose counterplay is the one thing the rest of the game
  // never asks for — DON'T SWING.
  knuckleball: 62,
};

export interface Tell {
  pitch: PitchType;
  timing: Exclude<TellTiming, 'none'>;
}

/**
 * WHAT HE IS TRYING TO DO WITH THIS PITCH. The centre of the rework.
 *
 * Each one is a real, named thing a pitcher does, and each one produces a
 * different pitch AND a different amount of plate. Read down the list and it
 * is the shape of an at-bat:
 *
 *  establish  0-0. Get ahead. His best pitch, in the zone. Hittable on purpose
 *             — a first-pitch fastball is a gift and taking it is a choice.
 *  attack     He has to throw a strike: behind in the count, or full. The
 *             fastball, over the plate. This is the patient hitter's payday.
 *  setup      Even, or ahead by one. Mix, work the edges, show you something
 *             he intends to come back to.
 *  putaway    Two strikes and room to miss. His OUT PITCH, off the plate,
 *             daring you to chase it.
 *  waste      0-2 exactly. The one count where a strike is worth nothing to
 *             him. Elevated fastball or a buried breaking ball — unhittable,
 *             and meant to be.
 *  around     First base is open and the man at the plate can hurt him. He is
 *             not throwing you anything good and he does not mind walking you.
 */
export type Approach = 'establish' | 'attack' | 'setup' | 'putaway' | 'waste' | 'around';

/**
 * A pitcher's ONE trick — the thing that makes facing them different from
 * facing the last one.
 *
 * ponytail: five signatures, each a couple of lines in throwPitch(). Zane is
 * writing design notes on what he wants these to be, so this is deliberately
 * a small, obvious slot to drop new ones into rather than a framework. Adding
 * one is: a name in this union, a case in throwPitch, done.
 *
 *  none      straight arsenal, nothing special. Someone has to be the tutorial.
 *  knuckler  throws the knuckleball most of the time and tips nothing.
 *  fireball  everything comes in hotter.
 *  painter   lives on the corners; never gives you one down the middle.
 *  junk      refuses to throw a fastball unless the count forces it.
 */
export type Signature = 'none' | 'knuckler' | 'fireball' | 'painter' | 'junk';

/**
 * A pitch mix: type -> share of pitches thrown. Shares are relative, so they
 * do not have to add to 1 — the picker normalises. Omitting a pitch means he
 * does not throw it, which is what makes an arsenal an arsenal.
 */
export type Arsenal = Partial<Record<PitchType, number>>;

export interface Pitcher {
  name: string;
  /** One line of flavour, shown when they take the mound. */
  blurb: string;
  /**
   * Which arm. Feeds platoonContact() in hit.ts, where a same-handed breaking
   * ball is the hardest thing in the at-bat to pick up.
   *
   * Three of the nine are left-handed, which is about double the real share —
   * on purpose. With a nine-man lineup and only nine encounters, a truer 1-in-4
   * would leave most runs never facing a lefty at all, and a platoon system
   * nobody meets is a system that does not exist.
   */
  throws: Hand;
  signature: Signature;
  /** Added to every pitch's speed. The fireballers. */
  speedBonus?: number;
  tellTiming: TellTiming;
  /**
   * What he throws and how often. Replaced `pattern`, which was a fixed cycle
   * that made him a tape loop — see the header.
   */
  arsenal: Arsenal;
  /**
   * THE OUT PITCH. What he goes to with two strikes.
   *
   * This is the single most learnable fact about a pitcher and it is the thing
   * the old fixed pattern was standing in for. It must be a pitch he actually
   * throws — pitcher.test.ts holds every one of the nine to that, because a
   * putaway missing from the mix would silently fall back to it and the
   * pitcher's most legible trait would quietly stop existing.
   */
  putaway: PitchType;
  /**
   * CONTROL, under its original name.
   *
   * ⚠️ THIS IS THE CONTROL RATING and it deliberately did not get a second
   * field next to it. In The Show, control is how close to the intended spot
   * the ball ends up; this pitcher does not aim at a spot, he decides whether
   * to give you the plate, so "share of pitches in the zone" IS his control and
   * a separate `control` multiplier on top would be two knobs turning one
   * thing. The UI labels it Control. See ratingsOf().
   *
   * Share of pitches thrown in the zone when he is neither ahead nor behind.
   */
  zoneRate: number;
  /**
   * BREAK. How much his off-speed stuff moves, as a divisor on the hitter's
   * effective contact — see stuffFactor(). 1.0 is league average, 1.25 is a
   * slider nobody squares up.
   *
   * ⚠️ IT DOES NOT TOUCH THE FASTBALL, and that is the point of having both
   * this and `speedBonus`. Velocity buys the fastball its outs by arriving
   * sooner (PITCH_SPEED_MPH feeds ballArrivalMs and the whole clock follows);
   * break buys the breaking ball its outs by being hard to time once it gets
   * there. Two ratings, two pitches, no overlap. The knuckleball is exempt for
   * the same reason it is exempt from the platoon split — it is already the
   * pitch nobody times, and stacking break on it would say that twice.
   *
   * Optional, defaulting to 1.0, so an arm written before this existed still
   * compiles and still pitches exactly as it did.
   */
  break?: number;
  /**
   * CLUTCH. With men in scoring position he reaches back for something extra —
   * the mirror of the hitter's clutch, applied the same way, on the same dial.
   * Below 1.0 is an arm that comes apart with runners on, which is a real and
   * useful thing for a club to have somewhere in its pen.
   */
  clutch?: number;
  /**
   * STAMINA, as a multiplier on FRESH_UNTIL and GASSED_AT in bullpen.ts.
   *
   * 1.0 is the old fixed 70/110 workhorse. A 1.2 starter goes deeper into the
   * game before he loses the plate; a 0.7 one-inning reliever is done at 77
   * pitches, which is why you do not bring him in during the fourth.
   */
  stamina?: number;
}

export interface ThrownPitch {
  type: PitchType;
  speedMph: number;
  inZone: boolean;
  /**
   * Where it crosses. Feeds applyLocation() in the hit engine — high lifts
   * home runs and kills grounders, low does the reverse — and feeds the
   * renderer, so a ball off the plate LOOKS off the plate. Without this the
   * player cannot tell a ball from a strike, and count leverage is a coin
   * flip rather than a decision.
   */
  location: PitchLocation;
  /**
   * The knockdown. Only ever true on a pitch that is inside AND out of the
   * zone, so it can never contradict a called strike. If the batter swings it
   * is a normal swing — you cannot be hit by a pitch you went after.
   */
  hitBatter: boolean;
  /** What the batter gets to see, and when. Null on an Ace. */
  tell: Tell | null;
  /**
   * What he was trying to do. Exposed because a decision the player cannot
   * see is a decision that did not happen — the UI reads this, and so does
   * every test in this file that would otherwise have to infer intent from a
   * pitch type and get it wrong.
   */
  approach: Approach;
}

/**
 * Share of inside-and-wild pitches that actually plunk the batter.
 *
 * Real HBP is roughly 1% of plate appearances. This gate only fires on the
 * narrow slice of pitches that are both inside and off the plate, so the rate
 * lands near that without a separate roll against every pitch.
 *
 * ⚠️ WAS 0.12, CUT TO 0.045 ON 2026-08-16 — and the reason is a coupling worth
 * not re-learning. 0.12 was calibrated against the OLD pitcher, who missed the
 * zone at roughly his flat `zoneRate`. The pitching plan deliberately misses it
 * far more often — `putaway` gives 55% of his usual plate, `around` 35%, and
 * `waste` 15% — so the population this gate rolls against roughly tripled and
 * the rate went with it. Headless simulation put HBP at 1.8-3.1% of plate
 * appearances across the nine arms, against a real 1%, and that was measured
 * on a bot that ends at-bats in 2.2 pitches; a human seeing 4 would be plunked
 * more still.
 *
 * The lesson for anyone adding another off-the-plate approach: this number is
 * a rate PER WILD PITCH INSIDE, not per plate appearance, so widening the
 * pitcher's willingness to miss silently raises it. Re-measure, do not assume.
 */
export const HBP_CHANCE = 0.045;

export interface Count {
  balls: number;
  strikes: number;
}

/**
 * Everything outside the count that a pitcher actually pitches to.
 *
 * All optional, and every field defaults to the harmless value, so a caller
 * that has no base state — the CLI, a unit test — passes `{}` and gets the
 * old count-only behaviour rather than a compile error or a wrong assumption.
 */
export interface Situation {
  /**
   * Pitch types already thrown IN THIS AT-BAT, oldest first. The sequencing
   * rules read only the last one; the rest is here because "what has he shown
   * me" is the next thing anyone will want and threading it later is worse
   * than carrying it now.
   */
  previous?: readonly PitchType[];
  /** True when first base is empty, so a walk costs him almost nothing. */
  firstBaseOpen?: boolean;
  /** The man at the plate's power stat. Above DANGEROUS_POWER he gets careful. */
  batterPower?: number;
  /** Outs in the inning. */
  outs?: number;
}

/**
 * The power stat at which a pitcher stops challenging you.
 *
 * 1.2 is chosen against the roster: every Holdout is 0.65-1.05 and gets pitched
 * to, the augmented sluggers (1.45, 1.55) and most machines clear it. So the
 * player earns the fear by building a lineup that deserves it, which makes
 * "they won't pitch to me any more" a consequence of the build rather than a
 * difficulty setting.
 */
export const DANGEROUS_POWER = 1.2;

/**
 * The lowest share of the plate a pitcher who MUST throw a strike will give.
 *
 * Not 1.0, deliberately. A guaranteed strike at 3-0 means a hitter who takes
 * until 3-0 knows with certainty what is coming and where — that is a solved
 * puzzle, not a payoff. At 0.92 the reward for patience is overwhelmingly
 * intact and the pitcher can still miss, which is what pitchers do.
 */
export const ATTACK_ZONE_FLOOR = 0.92;

/**
 * How much of the plate each approach gives you, as a multiplier on the
 * pitcher's own zone rate. `attack` scales like the rest and is then lifted to
 * the floor above, so a wild pitcher who has to throw a strike still throws
 * one.
 */
const ZONE_MULT: Record<Approach, number> = {
  establish: 1.15,
  attack: 1.0,
  setup: 1.0,
  putaway: 0.55,
  waste: 0.15,
  around: 0.35,
};

const BREAKING: readonly PitchType[] = ['curveball', 'changeup'];

/**
 * Where each pitch wants to live. Real tendencies, cheaply: the curve is the
 * low-and-away pitch, the change dies low, the fastball is the one that gets
 * elevated. 'middle' is in each list because a pitch left over the plate is
 * how a batting game gives you something to hit.
 */
/**
 * ⚠️ THESE LISTS DELIBERATELY DO NOT USE THE FOUR CORNERS, and that is not an
 * oversight to tidy up. The grid grew to nine spots on 2026-08-20 for the
 * PLAYER, who aims by hand. Widening the computer's lists at the same time
 * moved home-field advantage from 54.8% to 58.6% over 1000 games, because the
 * two staffs were matched to each other by scripts/findpens.ts and changing
 * what they throw breaks that match asymmetrically.
 *
 * Corners for the computer are a real idea. They are also a re-run of the pen
 * search, not an edit to this table. Measure with scripts/balance.ts first.
 */
const LOCATIONS: Record<PitchType, readonly PitchLocation[]> = {
  fastball: ['high', 'inside', 'middle', 'outside'],
  curveball: ['low', 'outside', 'low', 'middle'],
  changeup: ['low', 'outside', 'middle', 'low'],
  // The slider is the back-foot pitch: away from a righty, or in on the hands.
  slider: ['outside', 'inside', 'low', 'middle'],
  // Nobody aims a knuckleball, including the pitcher. All five, evenly.
  knuckleball: ['high', 'low', 'inside', 'outside', 'middle'],
  // The sinker lives at the knees or it does not work at all.
  sinker: ['low', 'low_inside', 'low_outside', 'low'],
};

/**
 * WHAT HE IS TRYING TO DO. Pure function of the count and the situation — no
 * RNG, so an approach is a decision rather than a roll, and a player who reads
 * the count correctly is right every time rather than usually.
 *
 * ORDER IS THE DESIGN, and two orderings here are worth stating:
 *
 *  - THE FULL COUNT OUTRANKS EVERYTHING. 3-2 has two strikes on it, but a
 *    putaway pitch off the plate at 3-2 is just a walk with extra steps. He
 *    throws a strike, and that is real: the full count is the one place the
 *    hitter is guaranteed something to hit.
 *  - `around` OUTRANKS BEING BEHIND. A pitcher 3-0 to a slugger with first
 *    base open does not groove one, he finishes the walk. This is the one
 *    rule that can take the patience payoff away, and it should: the price of
 *    building a lineup that scares people is that they stop pitching to you.
 *    Bat your slugger where first base is occupied and it does not fire.
 */
export function chooseApproach(count: Count, sit: Situation = {}): Approach {
  const { balls, strikes } = count;

  if (balls === 3 && strikes === 2) return 'attack';

  if (
    sit.firstBaseOpen &&
    (sit.batterPower ?? 1) >= DANGEROUS_POWER &&
    // With two outs the walk just brings up the next hitter with the inning
    // still alive, so nobody bothers. Two outs is when you challenge him.
    (sit.outs ?? 0) < 2
  ) {
    return 'around';
  }

  // Two more balls than strikes: he cannot afford another one.
  if (balls - strikes >= 2) return 'attack';

  if (strikes === 2) return balls === 0 ? 'waste' : 'putaway';
  if (balls === 0 && strikes === 0) return 'establish';
  return 'setup';
}

/** His most-thrown pitch — what "his best" means without another data field. */
function bestPitch(arsenal: Arsenal): PitchType {
  let best: PitchType = 'fastball';
  let top = -1;
  for (const t of ALL_PITCH_TYPES) {
    const w = arsenal[t] ?? 0;
    if (w > top) {
      top = w;
      best = t;
    }
  }
  return best;
}

/**
 * Weighted pick from a pitch mix, with the two sequencing knobs.
 *
 * `avoid` is DAMPED, NOT REMOVED. A pitcher can double up — back-to-back
 * sliders is a real sequence — he just usually does not. Removing the pitch
 * outright would make "he never repeats" an exploitable rule, which is the
 * same failure the fixed pattern had, one layer down.
 *
 * Iterates ALL_PITCH_TYPES rather than Object.keys so the order is fixed by
 * the type, not by insertion order in a data literal. Determinism is a hard
 * requirement and key order is exactly the kind of thing that silently
 * changes when someone reformats a table.
 */
function pickPitch(
  arsenal: Arsenal,
  rng: Rng,
  opts: { avoid?: PitchType; favour?: PitchType } = {},
): PitchType {
  const weights = ALL_PITCH_TYPES.map((t) => {
    let w = arsenal[t] ?? 0;
    if (t === opts.avoid) w *= 0.4;
    if (t === opts.favour) w *= 2.5;
    return w;
  });

  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return bestPitch(arsenal);

  let roll = rng.next() * total;
  for (let i = 0; i < ALL_PITCH_TYPES.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return ALL_PITCH_TYPES[i]!;
  }
  return ALL_PITCH_TYPES[ALL_PITCH_TYPES.length - 1]!;
}

/** The pitch the plan calls for, before the signature bends it. */
function selectPitch(
  pitcher: Pitcher,
  approach: Approach,
  last: PitchType | undefined,
  rng: Rng,
): PitchType {
  switch (approach) {
    case 'attack':
      // He has to throw a strike, so he throws the one he can locate. A
      // pitcher with no fastball goes to whatever he throws most.
      return (pitcher.arsenal.fastball ?? 0) > 0 ? 'fastball' : bestPitch(pitcher.arsenal);

    case 'establish':
      // Get ahead with his best, but not every time — a hitter who could
      // assume the first pitch would not have a decision to make.
      return pickPitch(pitcher.arsenal, rng, { favour: bestPitch(pitcher.arsenal) });

    case 'putaway':
      // THE OUT PITCH. Unless he just threw it, in which case showing it twice
      // in a row is how it stops working.
      return pitcher.putaway !== last
        ? pitcher.putaway
        : pickPitch(pitcher.arsenal, rng, { avoid: last });

    case 'waste':
      // 0-2. A strike is worth nothing to him here, so he throws the pitch
      // furthest from hittable rather than the pitch most likely to be a
      // strike — which is a different choice, and the reason waste exists.
      return pickPitch(pitcher.arsenal, rng, { avoid: 'fastball' });

    case 'around':
    case 'setup':
      return pickPitch(pitcher.arsenal, rng, { avoid: last });
  }
}

/**
 * Pick and throw the next pitch.
 *
 * @param count  the count as it stands BEFORE this pitch
 * @param sit    everything else he pitches to. `{}` is valid and means "count
 *               only", which is what the CLI and most unit tests want.
 */
export function throwPitch(
  pitcher: Pitcher,
  count: Count,
  sit: Situation,
  rng: Rng,
): ThrownPitch {
  const approach = chooseApproach(count, sit);
  const previous = sit.previous ?? [];
  const last = previous[previous.length - 1];

  let type = selectPitch(pitcher, approach, last, rng);
  let zoneRate = Math.min(1, pitcher.zoneRate * ZONE_MULT[approach]);
  if (approach === 'attack') zoneRate = Math.max(zoneRate, ATTACK_ZONE_FLOOR);

  // The signature, applied after the plan — a pitcher's trick bends what he
  // throws, but never overrides him having to throw a strike, because that
  // rule is what makes taking pitches mean anything.
  const forced = approach === 'attack';
  switch (pitcher.signature) {
    case 'knuckler':
      // Thrown most of the time, the way real knuckleballers do.
      if (!forced && rng.next() < 0.7) type = 'knuckleball';
      break;
    case 'junk': {
      // ⚠️ THIS USED TO PICK OFF BREAKING WHOLESALE, so a junk-baller with a
      // curveball and no changeup got called for a changeup — about 1% of every
      // pitch thrown in the league was one the man on the mound does not throw.
      // A signature bends what he picks; it cannot hand him a pitch he never
      // learned. Same shape as the fix in game/ai.ts.
      const his = BREAKING.filter((t) => pitcher.arsenal[t] !== undefined);
      if (!forced && type === 'fastball' && his.length) type = rng.pick(his);
      break;
    }
    case 'painter':
      zoneRate = Math.min(1, zoneRate * 1.25);
      break;
    case 'fireball':
    case 'none':
      break;
  }

  const inZone = rng.next() < zoneRate;

  // A pitch that misses the zone never misses it down the middle, and a
  // painter never gives you one down the middle at all.
  const spots =
    inZone && pitcher.signature !== 'painter'
      ? LOCATIONS[type]
      : LOCATIONS[type].filter((l) => l !== 'middle');
  let location = rng.pick(spots.length ? spots : LOCATIONS[type]);

  // The classic 0-2: climb the ladder with the fastball, bury everything else.
  // Both are pitches nobody can do anything with, which is the entire point of
  // the count. Fixed rather than rolled — a waste pitch that lands somewhere
  // hittable is not a waste pitch.
  if (approach === 'waste') location = type === 'fastball' ? 'high' : 'low';

  // Inside and off the plate is the only pitch that can hit you.
  const hitBatter = !inZone && location === 'inside' && rng.next() < HBP_CHANCE;

  return {
    type,
    speedMph: PITCH_SPEED_MPH[type] + (pitcher.speedBonus ?? 0),
    inZone,
    location,
    hitBatter,
    approach,
    // A knuckleballer tips nothing, whatever tier they are — nobody can read
    // a pitch that the pitcher cannot predict either.
    tell:
      pitcher.tellTiming === 'none' || pitcher.signature === 'knuckler'
        ? null
        : { pitch: type, timing: pitcher.tellTiming },
  };
}

/**
 * NINE PITCHERS, ONE PER ENCOUNTER. Every team gets its own arm.
 *
 * The ramp runs on four dials at once, so the ninth is a different sport from
 * the first: the tell gets later and then disappears, the arsenal grows from
 * two pitches to five, the zone tightens, and the out pitch gets nastier.
 *
 * READ THE ARSENALS AS SHARES, not probabilities — they are normalised at the
 * pick, so a mix that adds to 0.9 or 1.1 is not a bug. They are written to add
 * to 1 anyway, because a table you can eyeball is worth the arithmetic.
 *
 * ponytail: pure data. Zane is writing design notes on what he wants these
 * pitchers to be, so this is a table to overwrite, not an architecture to
 * argue with. Names, blurbs, mixes and out pitches are all one edit each.
 */
export const PITCHERS: Record<string, readonly Pitcher[]> = {
  // DIV I — human holdouts. Slow, readable, and they tip everything.
  holdouts: [
    {
      name: 'Hank Sowell',
      throws: 'R',
      blurb: 'Forty-one years old. Tips every pitch and knows it.',
      signature: 'none',
      tellTiming: 'pre_pitch',
      arsenal: { fastball: 0.6, curveball: 0.4 },
      putaway: 'curveball',
      break: 0.95, clutch: 0.92, stamina: 0.95,
      zoneRate: 0.65,
    },
    {
      name: 'Birdie Lomax',
      throws: 'L',
      blurb: 'Never met a strike she liked. Nibbles all night.',
      signature: 'junk',
      tellTiming: 'pre_pitch',
      arsenal: { fastball: 0.3, changeup: 0.35, curveball: 0.35 },
      putaway: 'changeup',
      break: 1.01, clutch: 0.96, stamina: 1,
      zoneRate: 0.6,
    },
    {
      // The knuckleballer belongs in the HUMAN league — the real reason
      // knuckleballers exist is not having the arm for anything else. Puts
      // the "stop swinging" lesson early, where a run can survive learning it.
      name: 'Old Man Prewitt',
      throws: 'R',
      blurb: 'No velocity left, so he throws the one nobody can hit. Or read.',
      signature: 'knuckler',
      tellTiming: 'release',
      arsenal: { knuckleball: 0.7, fastball: 0.3 },
      putaway: 'knuckleball',
      break: 1, clutch: 1, stamina: 1.05,
      zoneRate: 0.55,
    },
  ],

  // DIV II — augmented. The read moves to release and the slider arrives.
  splice: [
    {
      name: 'Vector Ruiz',
      throws: 'R',
      blurb: 'Grafted elbow, factory slider. Leaks it at release.',
      signature: 'none',
      tellTiming: 'release',
      arsenal: { fastball: 0.5, slider: 0.35, curveball: 0.15 },
      putaway: 'slider',
      break: 1.05, clutch: 1, stamina: 1.05,
      zoneRate: 0.55,
    },
    {
      name: 'Delta Nakamura',
      throws: 'L',
      blurb: 'Calibrated eyes. Paints corners and never gives you the middle.',
      signature: 'painter',
      tellTiming: 'release',
      arsenal: { slider: 0.4, fastball: 0.25, changeup: 0.25, curveball: 0.1 },
      putaway: 'slider',
      break: 1.15, clutch: 1.05, stamina: 1.1,
      zoneRate: 0.5,
    },
    {
      name: 'The Surgeon',
      throws: 'R',
      blurb: 'Five pitches, none of them straight.',
      signature: 'junk',
      tellTiming: 'release',
      arsenal: { curveball: 0.3, slider: 0.25, changeup: 0.25, fastball: 0.15, knuckleball: 0.05 },
      putaway: 'curveball',
      break: 1.11, clutch: 1.1, stamina: 1.15,
      zoneRate: 0.5,
    },
  ],

  // DIV III — machines. No tells at all. The plan is the only read left.
  foundry: [
    {
      name: 'MODEL-9',
      throws: 'R',
      blurb: 'Tips nothing. Throws harder than anything with a pulse.',
      signature: 'fireball',
      speedBonus: 5,
      tellTiming: 'none',
      arsenal: { fastball: 0.6, slider: 0.25, curveball: 0.15 },
      putaway: 'slider',
      break: 1.11, clutch: 1.1, stamina: 1.15,
      zoneRate: 0.5,
    },
    {
      name: 'VULCAN-II',
      throws: 'L',
      blurb: 'Machined to hit a corner from sixty feet. Every time.',
      signature: 'painter',
      tellTiming: 'none',
      arsenal: { slider: 0.45, curveball: 0.25, changeup: 0.2, fastball: 0.1 },
      putaway: 'slider',
      break: 1.25, clutch: 1.15, stamina: 1.2,
      zoneRate: 0.45,
    },
    {
      // The finale, and the one pitcher whose out pitch is the knuckleball.
      // With two strikes he throws you the one pitch in the game whose
      // counterplay is DON'T SWING — at the exact count where not swinging
      // is the hardest thing in the world to do.
      name: 'THE ARCHITECT',
      throws: 'R',
      blurb: 'It designed the league. You are a rounding error.',
      signature: 'fireball',
      speedBonus: 8,
      tellTiming: 'none',
      arsenal: { fastball: 0.4, slider: 0.25, curveball: 0.15, changeup: 0.1, knuckleball: 0.1 },
      putaway: 'knuckleball',
      break: 1.11, clutch: 1.25, stamina: 1.3,
      zoneRate: 0.45,
    },
  ],
};

/** The arm you face at a given encounter. `match` is 1-based. */
export function pitcherFor(division: string, match: number): Pitcher {
  const staff = PITCHERS[division] ?? PITCHERS.holdouts!;
  return staff[Math.min(match - 1, staff.length - 1)] ?? staff[0]!;
}

/**
 * THE SCOUTING REPORT. What a hitter would know walking to the plate.
 *
 * The plan is only a skill if it is legible, and a mix buried in a data table
 * is not legible. This is the one line that makes "he goes to the slider with
 * two strikes" something the player can learn on encounter one instead of
 * inferring over nine.
 *
 * The out pitch is named for every pitcher INCLUDING the Ace. He tips no
 * intent per-pitch, which is what makes him an Ace; knowing what is coming
 * when he gets to two strikes does not tell you when, where, or whether it
 * will be a strike, and those are the three questions that beat you.
 */
/**
 * HIS STUFF, as a multiplier on the hitter's effective contact.
 *
 * One function, one dial. Break and clutch both answer the same question the
 * platoon split and the hitter's own contact answer — "how long did he have to
 * decide" — so they land on the same number rather than growing a second
 * mechanism each. Below 1 is harder to hit.
 *
 * Floored at 0.6: a hitter must never be facing a pitch that is unhittable by
 * arithmetic. The knuckleball is the one pitch allowed to feel that way, and it
 * gets there through the outcome tables, where a swing is still possible.
 */
export const MIN_STUFF = 0.6;

export function stuffFactor(
  p: Pitcher,
  pitch: PitchType,
  opts: { runnersInScoringPosition?: boolean } = {},
): number {
  let f = 1;

  // Velocity already has its own effect — it arrives sooner. Break is what the
  // off-speed pitches have instead.
  if (pitch !== 'fastball' && pitch !== 'knuckleball') f /= Math.max(0.1, p.break ?? 1);

  // Same shape as the hitter's clutch in hit.ts: it only ever helps, and only
  // when it matters. An arm rated under 1.0 gives the runs back.
  if (opts.runnersInScoringPosition) f /= Math.max(0.1, p.clutch ?? 1);

  return Math.max(MIN_STUFF, f);
}

/**
 * HOW THE PITCH MOVES ON ITS WAY IN.
 *
 * ⚠️ WHY THIS IS IN core AND NOT IN A RENDERER. It was in a renderer — both of
 * them, differently. The engine screen drew every pitch as a STRAIGHT LINE from
 * the mound to the spot, so the curveball did not curve and six pitch types
 * were one pitch type wearing six colours. The roguelike screen had a private
 * `breakOffset()` that moved three of the six, ignored the pitcher's ratings,
 * and left the ball short of the plate at t=1. Two answers to one question is
 * exactly what locationOffset() exists to prevent, so this is the one answer.
 *
 * ------------------------------------------------------------------- the model
 *
 * The ball leaves the hand tracking one point and crosses at ANOTHER, and the
 * distance between those two is the break. Written as a deviation from the
 * straight line, that is:
 *
 *     deviation(t) = -move * shape(t)
 *
 * with `shape` zero at both ends. ZERO AT BOTH ENDS IS THE LOAD-BEARING PART:
 *
 *   at t = 0  the ball is in his hand, and a ball that is already off the line
 *             at release has been thrown from somewhere he is not standing.
 *   at t = 1  the ball is AT `pitch.location`, which is the spot the engine
 *             already scored it at — applyLocation() reads the word, not the
 *             pixels. A break that left the ball short of its own spot would
 *             put the picture and the verdict in different places, which is
 *             FAULT 5 wearing a new hat, and it is what the roguelike's version
 *             was quietly doing.
 *
 * The sign is inverted (`-move`) because a pitch that finishes DOWN spends the
 * flight looking HIGH. That is the whole illusion: the hitter reads a line, the
 * line was never true, and the ball arrives somewhere he already ruled out.
 *
 * ---------------------------------------------------------------- the lateness
 *
 * shape(t) = (t - t^late) normalised to peak at 1. Raising `late` moves the
 * peak later and makes the return sharper — a slider holds its line longer than
 * a curveball and then leaves in a hurry. This is the "ONE LATE BREAK, NOT A
 * WOBBLE" rule from the pitch spec, restated as a number you can turn: the
 * prototype's sin(time*3) gave the hitter an oscillation, which is unlearnable
 * because it never commits to anything.
 *
 * ------------------------------------------------------------ what it cannot do
 *
 * ⚠️ MOVEMENT CANNOT CHANGE AN OUTCOME, BY CONSTRUCTION, and that is the answer
 * to "is it still hittable". grade() is a pure function of a TIME offset and
 * applyLocation() is a pure function of a location WORD. Neither of them has
 * ever seen a pixel. So no number in this file can make a pitch unhittable,
 * unfair, or easier — it can only change what the flight looks like on the way,
 * and therefore what the hitter is able to read. The one real constraint is
 * that the ball has to stay on the canvas and stay legible; that is a renderer's
 * job, and both of them clamp.
 */
export interface Movement {
  /** Peak break toward the pitcher's ARM side (+) or glove side (-), in zone widths. */
  dx: number;
  /** Peak break DOWN (+) or up (-), in zone heights. */
  dy: number;
  /** How late it goes. 2 is a lazy arc, 5 is a trapdoor. */
  late: number;
}

/**
 * THE SIX, and every row is a decision rather than a tuning.
 *
 *   fastball     Barely moves, and the small UP is the four-seam illusion: it
 *                does not rise, it falls less than the eye predicts. Being the
 *                straight one is the fastball's whole identity, and it is the
 *                line every other pitch here is a lie about.
 *   sinker       Arm-side run and a late dive. It is a fastball that quits, so
 *                it holds the fastball's line and then does not.
 *   slider       THE LATEST BREAK IN THE GAME (late: 4.5) and the flattest.
 *                Sideways and gone. Almost no drop, which is what separates it
 *                from the curve on screen rather than in a stat line.
 *   changeup     Arm-side fade and a die. Same arm speed as the fastball — the
 *                tell has to come from the movement, because it cannot come
 *                from the velocity (see the note at the top of this file).
 *   curveball    The big one, over the top, and the only pitch whose break is
 *                mostly VERTICAL. Breaks once, and earlier than the slider —
 *                you get a longer look and a bigger drop.
 *   knuckleball  No table row can describe it; see knuckle() below.
 */
export const MOVEMENT: Record<PitchType, Movement> = {
  fastball: { dx: 0.05, dy: -0.14, late: 2 },
  sinker: { dx: 0.26, dy: 0.34, late: 3.2 },
  slider: { dx: -0.5, dy: 0.12, late: 4.5 },
  changeup: { dx: 0.3, dy: 0.3, late: 3 },
  // 0.45 and not 0.6, and the ceiling is the reason: at BREAK_CEILING a 0.6
  // curve called upstairs tops out ABOVE the release point and clips the top of
  // the canvas. A ball that goes higher than the hand it left is not a curve
  // anybody has seen, and one that leaves the frame is unhittable for a reason
  // that has nothing to do with pitching.
  curveball: { dx: -0.2, dy: 0.45, late: 2.8 },
  knuckleball: { dx: 0, dy: 0, late: 3 },
};

/**
 * ⚠️ HOW MUCH OF THE CARD REACHES THE PICTURE. `break` is a divisor on the
 * hitter's contact in stuffFactor(); here it is a multiplier on how far the
 * ball actually moves, so the rating means the same thing in the outcome and in
 * the picture. A 1.3-break slider is visibly a different pitch from a 0.8-break
 * one, which is the answer to "every pitcher is relatively the same".
 *
 * Clamped because the two ends of it are different failures: below the floor
 * nothing moves and the complaint comes back, above the ceiling the ball leaves
 * the canvas and the hitter is reading empty space.
 */
export const BREAK_FLOOR = 0.55;
export const BREAK_CEILING = 1.6;

/**
 * ⚠️ THE PICTURE EXAGGERATES THE RATING, ON PURPOSE, and this is the number
 * that does it.
 *
 * Ninety arms in the league span 0.86 to 1.20 of break — a deliberately tight
 * band, because break is the heaviest weight in armValue() and widening it for
 * real would move the whole talent ladder. Rendered honestly, that band is a
 * 42px slider against a 59px one, and forty percent of a sweep is not something
 * anybody notices at a hundred and twenty milliseconds. The complaint that
 * started this file was "every pitcher is relatively the same", and shipping a
 * difference nobody can see would have answered it on paper only.
 *
 * So the deviation is scaled about 1.0 before it is drawn: the same band becomes
 * 0.69 to 1.44, which is a 34px sweep against a 70px one, and that you can see.
 *
 * ⚠️ IT LIES ABOUT NOTHING. How far the ball visibly moves is not an input to
 * any outcome — stuffFactor() reads the raw rating, grade() reads a time,
 * applyLocation() reads a word, and the ball still crosses at the location the
 * engine already scored it at, whatever this number is. Same standing as
 * showScale() in value.ts: the engine keeps the multiplier, the human gets the
 * version they can actually read. Turn it up if the pitches still look alike;
 * turn it down if they start looking like cartoons.
 */
export const BREAK_GAIN = 2.2;

/** Normalised so `dx`/`dy` are the peak break and not a number times a shape. */
function shape(t: number, late: number): number {
  if (t <= 0 || t >= 1) return 0;
  const peakT = Math.pow(1 / late, 1 / (late - 1));
  const peak = peakT - Math.pow(peakT, late);
  return (t - Math.pow(t, late)) / peak;
}

/**
 * THE KNUCKLEBALL, which is the one pitch that must not be learnable.
 *
 * Two sine waves at frequencies that do not divide into each other, offset by a
 * per-pitch seed, so no two of them wander the same way and none of them
 * repeats. The envelope is the same shape as everything else — it still leaves
 * his hand on the line and it still arrives at the spot, because the engine
 * scored it at that spot. What is unpredictable is the route.
 *
 * ponytail: sine waves and a seed, not a physics sim. The pitch has one job —
 * be unreadable — and two incommensurate frequencies do that job. A spin model
 * would be a weekend and would look identical.
 */
function knuckle(t: number, seed: number): { dx: number; dy: number } {
  const env = shape(t, 2);
  const a = (seed % 97) / 97 * Math.PI * 2;
  const b = (seed % 61) / 61 * Math.PI * 2;
  return {
    dx: env * 0.42 * Math.sin(t * 9.4 + a),
    dy: env * 0.34 * Math.sin(t * 7.1 + b),
  };
}

/**
 * Where the ball is, relative to the straight line, `t` of the way in.
 *
 * Returned in ZONE UNITS — dx in strike-zone widths, dy in heights — so a
 * renderer multiplies by its own zone and the two screens cannot drift apart on
 * how big a curveball is. Same contract as locationOffset().
 *
 * `throws` mirrors the arm side: a right-hander's slider sweeps toward third,
 * a left-hander's sweeps the other way, and a same-handed breaking ball is the
 * pitch that starts at the hitter and leaves him — which is half of what the
 * platoon split in hit.ts is already claiming happens.
 */
export function movementOf(
  type: PitchType,
  t: number,
  opts: { break?: number; throws?: Hand; seed?: number } = {},
): { dx: number; dy: number } {
  const clamped = Math.max(0, Math.min(1, t));
  const arm = opts.throws === 'L' ? -1 : 1;

  // ⚠️ THE FASTBALL IGNORES `break`, exactly as stuffFactor() does. Velocity is
  // what buys the fastball its outs; break is what buys the breaking ball its
  // outs. One rating, one pitch, and the two must not be able to stack.
  const rated =
    type === 'fastball'
      ? 1
      : Math.max(
          BREAK_FLOOR,
          Math.min(BREAK_CEILING, 1 + ((opts.break ?? 1) - 1) * BREAK_GAIN),
        );

  if (type === 'knuckleball') {
    const k = knuckle(clamped, opts.seed ?? 0);
    return { dx: -k.dx * rated * arm, dy: -k.dy * rated };
  }

  const m = MOVEMENT[type];
  const s = shape(clamped, m.late) * rated;
  // Negative: a pitch that finishes low spends the flight looking high.
  return { dx: -m.dx * s * arm, dy: -m.dy * s };
}

/**
 * THE LEAGUE'S ZONE RATE. What an average arm throws for a strike, and the
 * divisor that turns `zoneRate` into the 1.0-centred Control the UI shows.
 */
export const LEAGUE_ZONE_RATE = 0.55;

/**
 * HITTING THE SPOT — how often a league-average arm puts the ball where it was
 * asked to. A corner is a finer target than the middle, and the gap between
 * these two numbers is why "paint the black every pitch" is not a plan.
 */
export const SPOT_HIT = 0.72;
export const MIDDLE_HIT = 0.92;

/**
 * Of the pitches that miss the call, how many miss OFF THE PLATE rather than
 * leaking back over the heart. The other third are the ones that get hit, and
 * they are the whole cost of a low Control rating or a tired arm — a miss that
 * was always a ball would make wildness free.
 */
export const MISS_OFF_PLATE = 0.65;

/** Every spot that is not the middle — where a missed middle call ends up. */
const OFF_MIDDLE = ALL_LOCATIONS.filter((l) => l !== 'middle');

/**
 * COMMAND — how often the ball reaches the spot it was called to.
 *
 * ⚠️ THIS IS NOT zoneRate, AND THAT IS THE DESIGN DECISION IN THIS FILE.
 * zoneRate is WILLINGNESS: the share of the plate a pitcher gives you when HE
 * is choosing, and read down the staffs it runs the wrong way for command —
 * the division-one rookie sits at 0.65 and the ace at 0.45, because an ace's
 * whole method is making you chase. Reading that as precision would hand the
 * worst command in the league to your best arm: going to the closer would make
 * your pitches wilder, and nobody would ever go to the pen again.
 *
 * What is left on the card that does mean precision is the SIGNATURE, and one
 * of them is defined as it — a painter "lives on the corners". The fireballer
 * and the knuckleballer are the two the fiction says cannot aim, one because
 * he is throwing it as hard as he can and the other because the pitch does not
 * take instructions.
 *
 * ponytail: derived from the signature rather than a new `command?: number` on
 * every arm. Twenty-six staff arms and nine roguelike ones would all default to
 * 1.0 and differentiate nothing until somebody hand-tuned thirty-five numbers.
 * Add the field when scripts/sensitivity.ts can say what a point of it buys —
 * the shape of this function does not change when you do.
 */
export const COMMAND: Record<Signature, number> = {
  painter: 1.15,
  none: 1,
  junk: 1,
  fireball: 0.88,
  knuckler: 0.8,
};

/** What he actually throws. An arsenal is the first rating a pitcher has. */
export const arsenalOf = (p: Pitcher): PitchType[] =>
  ALL_PITCH_TYPES.filter((t) => (p.arsenal[t] ?? 0) > 0);

/**
 * THE PITCH YOU CALLED, thrown by the arm you actually have.
 *
 * ⚠️ THE MIRROR OF throwPitch(), AND THE DIVISION OF LABOUR IS THE POINT. When
 * the computer pitches it decides everything; when you pitch, YOU decide the
 * type and the spot — that is the skill, and no roll takes it back. What the
 * ARM decides is whether the ball gets there. So a call is never overridden,
 * only MISSED, and how often it is missed is his COMMAND — see the table above
 * for why that is the signature and pointedly not zoneRate.
 *
 * ⚠️ WHAT THIS REPLACED. main.ts rolled a flat 0.72 for every arm in the game
 * and left `location` on the called spot whatever the roll said — so the ace
 * and the mop-up man had identical command, nothing on the card touched a pitch
 * you threw, and a missed pitch was drawn sitting on the spot it had just
 * failed to reach.
 *
 * `control` is the caller's own multiplier, applied on top. main.ts passes
 * fatigue through it, because a tiring arm is a losing arm's command and
 * nothing else — see ZONE_FATIGUE_PENALTY, which lives a layer up.
 */
export function pitchToSpot(
  pitcher: Pitcher,
  type: PitchType,
  spot: PitchLocation,
  rng: Rng,
  opts: { control?: number } = {},
): ThrownPitch {
  const command =
    (spot === 'middle' ? MIDDLE_HIT : SPOT_HIT) * COMMAND[pitcher.signature] * (opts.control ?? 1);

  let location = spot;
  let inZone = true;

  // Capped short of 1: nobody's command is perfect, and an arm that never
  // missed would make the count something only the hitter could lose.
  if (rng.next() >= Math.min(0.97, command)) {
    if (spot === 'middle') {
      // A middle call can only miss off the plate. You cannot leak one back to
      // where you were already aiming, and "middle, off the plate" is not a
      // place the renderer can draw.
      location = rng.pick(OFF_MIDDLE);
      inZone = false;
    } else if (rng.next() < MISS_OFF_PLATE) {
      // Off the plate. The cheap miss: it costs a ball and nothing else.
      inZone = false;
    } else {
      // THE MISTAKE PITCH. He aimed at the corner and got the heart of the
      // plate. This is the expensive miss and the reason control is a rating.
      location = 'middle';
    }
  }

  return {
    type,
    speedMph: PITCH_SPEED_MPH[type] + (pitcher.speedBonus ?? 0),
    inZone,
    location,
    // ponytail: your wild ones cannot hit anybody, though his can — see
    // HBP_CHANCE in throwPitch(). Wire it here when a plunking is a thing the
    // game wants you to be able to do on purpose.
    hitBatter: false,
    // You know what you threw, so there is nothing to tip, and `setup` is the
    // neutral intent — the hitter reads the count, not your mind.
    tell: null,
    approach: 'setup',
  };
}

/**
 * THE RATING CARD, for the UI. Mirrors the hitter's, so a namecard on either
 * side of the ball reads the same way.
 *
 * Control and Velo are the fields that were already here under working names —
 * see zoneRate and speedBonus. Naming them here rather than renaming the fields
 * keeps eight staffs, nine roguelike arms and every balance script compiling.
 */
export function ratingsOf(p: Pitcher): Record<string, number> {
  return {
    // Zone rate runs about 0.45-0.65, so this lands on the same 1.0-centred
    // scale the hitters use rather than making the player read two scales.
    control: Number((p.zoneRate / LEAGUE_ZONE_RATE).toFixed(2)),
    velo: Number((1 + (p.speedBonus ?? 0) / 20).toFixed(2)),
    break: p.break ?? 1,
    clutch: p.clutch ?? 1,
    stamina: p.stamina ?? 1,
  };
}

export function scoutingReport(p: Pitcher): string {
  const mix = arsenalOf(p)
    .sort((a, b) => (p.arsenal[b] ?? 0) - (p.arsenal[a] ?? 0))
    .join(', ');
  const arm = p.throws === 'L' ? 'LHP' : 'RHP';
  return `${arm} · throws ${mix} · out pitch: ${p.putaway}`;
}
