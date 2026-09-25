/**
 * Nine men standing somewhere, and what happens when the ball reaches them.
 *
 * ⚠️ WHAT WAS WRONG BEFORE. core/fielding.ts rolled a FLAT 5% error on every
 * bootable ball, whoever hit it and wherever it went. So a scorching grounder
 * to a slow first baseman and a routine one to a gold-glove shortstop were
 * literally the same event, and a team's defence had no identity at all —
 * nine players' worth of `speed` stat did nothing on the field.
 *
 * WHAT THIS ADDS, and the ladder rung it sits on: almost none of the geometry
 * is new. `plotBatted()` already turns exit velocity and launch angle into a
 * landing spot, and `nearestFielder()` already answers who is closest to it —
 * both written for the overhead replay, both already tested. This file assigns
 * REAL PLAYERS to those nine slots and lets their stats decide whether the play
 * gets made.
 *
 * ponytail, on the layering: this imports from `plot.ts`, which is a
 * presentation module, and that is the wrong direction on paper. The functions
 * taken are pure geometry with no DOM in them, and moving them to core/ would
 * touch every caller for no behavioural gain. If core/ ever needs them too,
 * move them then.
 *
 * A PARTIAL FIELDING SIMULATION NOW: a fielded grounder is raced on the clocks
 * (groundRace(), ZAIS-21). Everything else is still one alignment, one chaser
 * and one roll: no cutoff men, no assists, no scorer deciding hit-or-error.
 */

import type { Player } from '../core/roster.ts';
import type { HitResult } from '../core/hit.ts';
import {
  rollFielding,
  stretchChance,
  STRETCH_THROW,
  TRIPLE_PLAY,
  CLEAN_THROW,
  type FieldingResult,
  type ForceBag,
  type ThrowEffect,
} from '../core/fielding.ts';
import { isHit } from '../core/hitTables.ts';
import { SAC_FLY_MIN_ANGLE, forcedRunners, isDeepFly, type Bases } from '../core/inning.ts';
import type { CutOff, Placement } from './placement.ts';
import type { Rng } from '../core/rng.ts';
import {
  plotBatted,
  nearestFielder,
  coverFor,
  feetXY,
  bagFeet,
  throwArrivalMs,
  longThrowMs,
  runToFirstMs,
  runnerMs,
  REPLAY_CUT_MS,
  REACTION_MS,
  INFIELD_RANGE,
  FIELDERS,
  type Fielder,
} from './plot.ts';

export type Position = 'P' | 'C' | '1B' | '2B' | '3B' | 'SS' | 'LF' | 'CF' | 'RF' | 'DH';

/** The scorer's numbering, which is what plot.ts's FIELDERS carry. */
export const POSITION_BY_NUMBER: Record<number, Position> = {
  1: 'P',
  2: 'C',
  3: '1B',
  4: '2B',
  5: '3B',
  6: 'SS',
  7: 'LF',
  8: 'CF',
  9: 'RF',
};

/** The same table read backwards, for a scorer that has a position and wants a number. */
export const NUMBER_BY_POSITION: Record<Position, number> = {
  P: 1, C: 2, '1B': 3, '2B': 4, '3B': 5, SS: 6, LF: 7, CF: 8, RF: 9,
  // He never fields. Scored as the pitcher so the lookup is total rather than
  // partial; nothing can reach it, because fielderFor() never returns DH.
  DH: 1,
};

/**
 * How hard each spot is to play, as a multiplier on the error rate.
 *
 * The shape is the real defensive spectrum: up the middle is hard, the corners
 * are where you hide a bat. First base is the easiest job on the field and
 * shortstop is the hardest, which is why lineups are built the way assign()
 * builds them below.
 */
export const POSITION_DIFFICULTY: Record<Position, number> = {
  P: 1.0,
  C: 1.1,
  '1B': 0.7,
  '2B': 1.25,
  '3B': 1.35,
  SS: 1.45,
  LF: 0.85,
  CF: 1.05,
  RF: 0.9,
  DH: 1.0, // never fields; here so the record is total
};

/**
 * The order the manager fills the field in, hardest job first.
 *
 * A nine-man lineup covers eight positions plus a DH — the pitcher comes off
 * the staff, not the batting order, which makes this a designated-hitter
 * league by construction rather than by decision.
 */
const FILL_ORDER: readonly Position[] = ['SS', 'CF', '2B', '3B', 'C', 'RF', 'LF', '1B', 'DH'];


export type Alignment = Readonly<Record<Position, Player | null>>;

/**
 * A player's glove: his own if he has been given one, otherwise derived.
 *
 * ⚠️ THE FUNCTION SURVIVED THE STAT, and that is deliberate. The note this
 * replaces said "add it to Player and delete this function" — but deleting it
 * would make `glove` REQUIRED, and required means editing four hundred authored
 * literals in teams.ts and refusing every league anybody has already exported.
 * Keeping the derivation as the default costs one `??` and buys a field that is
 * free to leave off, which is what makes the stat additive instead of a
 * migration.
 *
 * ⚠️ SO ABSENT IS NOT "NO GLOVE", IT IS "THE OLD ANSWER". Nothing in the shipped
 * league carries one yet, so this commit changes no game that has been played.
 * The first authored glove is the first behaviour change, and it will be
 * somebody typing it.
 *
 * The derivation itself is unchanged: legs are most of range, and the build says
 * something honest about hands — the machines were manufactured to be
 * consistent, the augmented traded control for power.
 */
export function gloveOf(p: Player): number {
  if (p.glove !== undefined) return p.glove;
  const range = 0.7 + p.speed * 0.3;
  const hands = p.build === 'machine' ? 1.12 : p.build === 'augmented' ? 0.92 : 1.0;
  return range * hands;
}

/**
 * Put the man who is actually playing each position onto the nine spots.
 *
 * ⚠️ THIS IS WHAT LETS THE OVERHEAD REPLAY DRAW PEOPLE. `fieldersFor()` answers
 * with positions — a number, a distance and a bearing — which is all placement
 * needs and not enough to draw anybody. Attaching the roster here is what turns
 * nine identical dots into a club in its own kit, and what lets the asset layer
 * look for THIS man's drawing before the position's.
 *
 * ⚠️ IT IS CALLED AT CONTACT, NOT AT DRAW TIME, and that matters for the same
 * reason Replay.fielders holds the shift rather than looking one up: the replay
 * has to show the defence that decided the play. A substitution between innings
 * must not retro-fit itself onto the play before it.
 *
 * The pitcher keeps no man. He is not in a DH league's batting order, so the
 * alignment has no P — and the overhead falls back to a rolled look for him.
 */
export function manned(fielders: readonly Fielder[], a: Alignment): readonly Fielder[] {
  return fielders.map((f) => {
    const at = POSITION_BY_NUMBER[f.num];
    const man = at ? a[at] : null;
    return man ? { ...f, man } : f;
  });
}

/**
 * Put the nine somewhere sensible: best gloves at the hardest positions.
 *
 * Deterministic — same lineup in, same alignment out — so a game replays from
 * its seed and so the player can learn where his own people are.
 */
export function assignPositions(lineup: readonly Player[]): Alignment {
  const ranked = [...lineup].sort((a, b) => gloveOf(b) - gloveOf(a));
  const out: Record<Position, Player | null> = {
    P: null, C: null, '1B': null, '2B': null, '3B': null,
    SS: null, LF: null, CF: null, RF: null, DH: null,
  };
  FILL_ORDER.forEach((pos, i) => {
    out[pos] = ranked[i] ?? null;
  });
  return out;
}

/** Which position handles this batted ball. Geometry, not opinion. */
export function fielderFor(hit: HitResult): Position {
  const plot = plotBatted(hit.outcome, hit.exitVelocity, hit.launchAngle);
  const f = nearestFielder(plot.distFt, hit.direction);
  return POSITION_BY_NUMBER[f.num] ?? 'P';
}

/** The middle infield turns the double play — average their gloves. */
function relayQuality(a: Alignment): number {
  const ss = a.SS ? gloveOf(a.SS) : 1;
  const second = a['2B'] ? gloveOf(a['2B']) : 1;
  return (ss + second) / 2;
}

/**
 * HOW MUCH OF A DOUBLE-PLAY BALL THIS IS, by who fielded it.
 *
 * ⚠️ WHERE THE BALL WENT DID NOT REACH THE RELAY, and it is the first thing a
 * person watching thinks about. core/fielding.ts rolls one flat DOUBLE_PLAY_RATE
 * on every ground out with a force, so a two-hopper straight at the second
 * baseman — which is the double-play ball, the single most recognisable shape in
 * the sport — and a swinging bunt the pitcher had to come off the mound for were
 * the same 35% coin. Zane, watching the first of those: "grounder to second
 * baseman and doesn't turn double play."
 *
 * The spread is the real one. The two men who make the pivot start the play
 * already standing where the play goes; the corners have a long throw and the
 * pitcher is falling off the mound. Nobody has ever turned two from the
 * outfield, which is the zero.
 *
 * ⚠️ IT MULTIPLIES, IT DOES NOT REPLACE. DOUBLE_PLAY_RATE is still the league
 * number and still the only place to tune the overall frequency — this decides
 * which balls get to be above it. Measured with scripts/balance.ts.
 */
export const DP_BY_POSITION: Readonly<Record<Position, number>> = {
  SS: 1.3,
  '2B': 1.3,
  '3B': 1.0,
  '1B': 0.8,
  P: 0.7,
  C: 0.4,
  LF: 0,
  CF: 0,
  RF: 0,
  DH: 0,
};

export interface DefensivePlay extends FieldingResult {
  /** Who it was hit at. Shown in the play-by-play — "6-4-3" needs a 6. */
  by: Position;
  /** The glove that had to make it, for a UI that wants to explain an error. */
  fielder: Player | null;
  /** The arrival times a clocked grounder was decided on. See groundRace(). */
  clock?: GroundClock;
  /** The arrival times a throw after a catch was decided on. See airRace(). */
  airClock?: AirClock;
}

/**
 * THE THROW AFTER A CATCH, in ms from contact on the replay's clock — what
 * airRace() decided the play on, handed to the picture so it draws them.
 */
export interface AirClock {
  /** The ball is in his glove: the man tagging leaves, the man off first turns back. */
  caughtMs: number;
  /** Where the throw went: the plate on a tag-up, first on a double-off. */
  at: 1 | 4;
  /** The ball reaches that bag. */
  throwMs: number;
  /** The runner reaches it. */
  runnerMs: number;
}

/**
 * EVERY ARRIVAL ON A FIELDED GROUNDER, in ms from contact on the replay's clock
 * — the numbers the play was decided on, handed to the picture so it draws
 * them rather than working them out again. See groundRace().
 */
export interface GroundClock {
  /** The ball is in his glove. */
  fieldedMs: number;
  /** The batter reaches first. */
  batterMs: number;
  /** The ball reaches the bag a force was taken at. Null when none was. */
  leadMs: number | null;
  /** The forced man reaches that bag. Null when no force. */
  runnerMs: number | null;
  /** The ball reaches first. Null when it never went there — a force with two out. */
  firstMs: number | null;
}

/**
 * Who takes the throw at a force bag and turns it: the pivot. Second is
 * coverFor()'s answer, the man the replay draws running there, so the one
 * the engine times and the one on screen are the same man.
 */
const pivotAt = (bag: ForceBag, fielderNum: number): number =>
  bag === 2 ? coverFor(1, { num: fielderNum, distFt: 0, dirDeg: 0 }) : bag === 3 ? 5 : 2;

/**
 * THE PIVOT'S CLOCK — ms from contact, on the race's clock, until the man
 * covering `bag` is standing on it. He breaks at contact from where he stands
 * and runs at INFIELD_RANGE × his glove, the same clock cutOff() runs a fielder
 * on, pointed at a bag instead of the ball's line. No new constant.
 *
 * Before it the lead force cost the fielder's transfer and nothing else, and
 * with a man on first nearly every fielded grounder got him: 1.08 DP and 2.14
 * force outs a team, against 0.67 and 1.64 on the dice (ZAIS-21).
 *
 * ponytail: standard depth, not the shifted table — fieldBall() is not handed
 * the shift. Pass the alignment through when a shift should slow a pivot.
 */
export function pivotReadyMs(bag: ForceBag, pivotNum: number, glove: number): number {
  const spot = FIELDERS.find((f) => f.num === pivotNum)!;
  return REPLAY_CUT_MS + REACTION_MS + feetBetween(feetXY(spot.distFt, spot.dirDeg), bagFeet(bag)) / (INFIELD_RANGE * Math.max(0.1, glove));
}

const feetBetween = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

/**
 * STEP (b) FOR GROUND BALLS: the throws, raced against the runners.
 *
 * The ball is in his glove at `REPLAY_CUT_MS + cut.ms` — the overhead's own
 * clock, on which the batter has been running since contact. Every play he
 * could make is timed: a throw to each force bag against the man running to
 * it, the relay on to first against the batter, and the plain throw to first.
 * He makes the one that gets the most outs, and between equals the one furthest
 * forward. That is "go for two" and "take the lead man", and it is why a better
 * arm can only ever add an out: every option gets quicker and none goes away.
 *
 * Nothing here rolls. The triple play is the one die, and only on a double play
 * the clocks already turned — see fieldBall().
 *
 * ponytail: the pivot's arm is his glove, same as the fielder's. He has to get
 * to the bag (pivotReadyMs()), and once there it is the transfer and nothing
 * more. No bobbled exchange, no runner taking him out. Add them when a double
 * play looks too clean.
 */
export function groundRace(o: {
  cut: CutOff;
  dirDeg: number;
  /** The fielder's arm. */
  arm: number;
  /** The arm at each scorer's number, for the pivot. */
  armAt: (fielderNum: number) => number;
  /** The feet at each scorer's number — his glove, no throw press. See pivotReadyMs(). */
  reachAt: (fielderNum: number) => number;
  batterSpeed: number;
  bases: Bases;
  outs: number;
}): { forceAt?: ForceBag; doublePlay: boolean; beatOut: boolean; clock: GroundClock } {
  // Ball and runners all leave at the cut. See the note on REPLAY_CUT_MS.
  const fieldedMs = REPLAY_CUT_MS + o.cut.ms;
  const from = feetXY(o.cut.alongFt, o.dirDeg);
  const batterMs = REPLAY_CUT_MS + runToFirstMs(o.batterSpeed);

  type Play = { forceAt?: ForceBag; outs: number; clock: GroundClock };
  const plays: Play[] = [];
  for (let bag = forcedRunners(o.bases) + 1; bag >= 2; bag--) {
    const at = bag as ForceBag;
    const pivot = pivotAt(at, o.cut.num);
    // The ball is at the bag once it has got there AND somebody is on the bag
    // to take it. A man who covers it himself runs it there instead.
    const leadMs =
      pivot === o.cut.num
        ? fieldedMs + feetBetween(from, bagFeet(at)) / (INFIELD_RANGE * Math.max(0.1, o.reachAt(pivot)))
        : Math.max(fieldedMs + throwArrivalMs(from, at, o.arm), pivotReadyMs(at, pivot, o.reachAt(pivot)));
    const runner = REPLAY_CUT_MS + runnerMs(o.bases[at - 2]!.speed, at - 1, at);
    if (leadMs >= runner) continue; // a tie goes to the runner
    // With two out the force is the third, and nobody throws on to first.
    const firstMs =
      o.outs < 2 ? leadMs + throwArrivalMs(bagFeet(at), 1, o.armAt(pivot)) : null;
    plays.push({
      forceAt: at,
      outs: firstMs !== null && firstMs < batterMs ? 2 : 1,
      clock: { fieldedMs, batterMs, leadMs, runnerMs: runner, firstMs },
    });
  }
  const firstMs = fieldedMs + throwArrivalMs(from, 1, o.arm);
  plays.push({
    outs: firstMs < batterMs ? 1 : 0,
    clock: { fieldedMs, batterMs, leadMs: null, runnerMs: null, firstMs },
  });

  // Most outs; among equals the first in the list, which is the lead bag.
  const best = plays.reduce((a, b) => (b.outs > a.outs ? b : a));
  return {
    ...(best.forceAt ? { forceAt: best.forceAt } : {}),
    doublePlay: best.outs === 2,
    beatOut: best.outs === 0,
    clock: best.clock,
  };
}

/**
 * STEP (b) FOR BALLS IN THE AIR: the one throw after a catch, raced.
 *
 * The ball comes down at the fly's hang — the moment the replay draws it in
 * his glove — and the throw leaves from where it came down, at longThrowMs().
 * On a deep fly with a man on third he tags: he leaves at the catch from a
 * standing start, a full runToFirstMs() for the ninety feet. The throw beats
 * him or it does not; a tie goes to the runner.
 *
 * WHO GOES is not decided here. The man on third always goes on isDeepFly(),
 * as he always has; this only answers whether he gets there.
 *
 * Nothing here rolls. Undefined when there is no such play.
 */
export function airRace(o: {
  hit: HitResult;
  placement: Placement;
  bases: Bases;
  outs: number;
  arm: number;
}): { out: boolean; clock: AirClock } | undefined {
  const { hit, placement: p } = o;
  if (hit.outcome !== 'line_out' || !p.airCatch?.caught) return undefined;
  const third = o.bases[2];
  if (!third || !isDeepFly(hit.outcome, hit.exitVelocity, o.outs, hit.launchAngle)) return undefined;
  const caughtMs =
    REPLAY_CUT_MS +
    plotBatted(hit.outcome, hit.exitVelocity, hit.launchAngle, hit.direction, p.wallFt).hangMs;
  const spot = feetXY(p.distFt, p.dirDeg);
  const throwMs = caughtMs + longThrowMs(spot, 4, o.arm);
  const runnerMs = caughtMs + runToFirstMs(third.speed);
  return { out: throwMs < runnerMs, clock: { caughtMs, at: 4, throwMs, runnerMs } };
}

/**
 * Roll the defence on a ball in play, with a real fielder attached.
 *
 * The error chance is the league rate, made harder by the POSITION and easier
 * by the GLOVE standing there. A machine shortstop is close to the flat old
 * number; an augmented slugger hidden at third is meaningfully worse, which is
 * the whole point — where you put people now matters.
 */
export function fieldBall(
  hit: HitResult,
  alignment: Alignment,
  opts: {
    batterSpeed: number;
    forceAtFirst: boolean;
    outs: number;
    /** The unbroken run of occupied bases from first. See LEAD_FORCE. */
    forcedRunners?: number;
    /** They are playing for the out at the plate. See LEAD_FORCE_INFIELD_IN. */
    infieldIn?: boolean;
    /** What the player's throw was worth, if he made one. See THROW_EFFECT. */
    throwEffect?: ThrowEffect;
    /**
     * WHERE THE BALL ACTUALLY FINISHED, from placement.ts, and the caller has
     * it already.
     *
     * ⚠️ IT SETTLES AN ARGUMENT THE CODEBASE WAS HAVING WITH ITSELF. fielderFor()
     * below re-derives who fielded the ball from a bare plotBatted() — no park,
     * no SHIFT — while withPlacement() derives it against the alignment the
     * defence is actually standing in. Measured over 22,000 balls in play they
     * agree 100% of the time straight up and **84.5%** under a shift, so on one
     * shifted ball in six the play-by-play named one man and the error was
     * rolled against a different man's glove. Handing the answer over is both
     * the fix and the thing stretchChance() needs.
     */
    placement?: Placement | null;
    /**
     * WHO IS ON BASE, for the race. With a placement whose grounder was
     * fielded, this is what turns the play from dice into clocks — see
     * groundRace(). Omitted keeps the dice, which is every caller before it.
     */
    bases?: Bases;
  },
  rng: Rng,
): DefensivePlay {
  // ⚠️ THE PLACEMENT'S ANSWER WINS when the caller has one — see the note on
  // the option. fielderFor() is the fallback for a caller with no placement,
  // which is the CLI and every test written before this.
  const by = opts.placement
    ? (POSITION_BY_NUMBER[opts.placement.fielderNum] ?? 'P')
    : fielderFor(hit);
  const fielder = alignment[by];
  const glove = fielder ? gloveOf(fielder) : 1;

  // ⚠️ A FIELDED GROUNDER IS RACED, NOT ROLLED. The bunt keeps the dice: it is
  // a sacrifice in inning.ts whatever the defence does, and a race that turned
  // two on it would draw a play the book never scores.
  const cut = opts.placement?.cutOff;
  const bases = opts.bases;
  let clock: GroundClock | undefined;
  const race =
    cut?.fielded && bases && opts.placement && hit.outcome === 'ground_out' && !hit.bunted
      ? (r: Rng): FieldingResult => {
          // The player's throw press is worth what it always was: a better
          // throw is a quicker one. `good` is exactly 1.
          const quick = (opts.throwEffect ?? CLEAN_THROW).dp;
          const play = groundRace({
            cut,
            dirDeg: opts.placement!.dirDeg,
            arm: glove * quick,
            armAt: (num) => reachOf(alignment)(num) * quick,
            reachAt: reachOf(alignment),
            batterSpeed: opts.batterSpeed,
            bases,
            outs: opts.outs,
          });
          clock = play.clock;
          if (
            play.doublePlay &&
            opts.outs === 0 &&
            forcedRunners(bases) >= 2 &&
            r.next() < TRIPLE_PLAY
          ) {
            return { error: false, doublePlay: false, triplePlay: true, forceAt: 2 };
          }
          return {
            error: false,
            doublePlay: play.doublePlay,
            ...(play.forceAt ? { forceAt: play.forceAt } : {}),
            ...(play.beatOut ? { beatOut: true } : {}),
          };
        }
      : undefined;

  // A caught ball with a throw after it is raced too. See airRace().
  const air =
    opts.placement && bases
      ? airRace({ hit, placement: opts.placement, bases, outs: opts.outs, arm: glove })
      : undefined;

  const result = rollFielding(
    hit.outcome,
    {
      speed: opts.batterSpeed,
      forceAtFirst: opts.forceAtFirst,
      outs: opts.outs,
      // Which bag the force is at is a question about the BASE STATE, which
      // core/fielding.ts deliberately cannot see. Both halves hand it over.
      forcedRunners: opts.forcedRunners,
      infieldIn: opts.infieldIn,
      throwEffect: opts.throwEffect,
      errorMult: POSITION_DIFFICULTY[by] / glove,
      // The gloves that turn it, and whether this was a ball to turn it on.
      dpMult: relayQuality(alignment) * DP_BY_POSITION[by],
      // ⚠️ THE ARM IS THE GLOVE, and that is a deliberate simplification. A
      // real outfielder's arm and his range are different scouting numbers;
      // here gloveOf() is one number off build and legs, and inventing a
      // second rating for thirty clubs would be thirty-five numbers nobody has
      // measured. What it gets right is the part that matters: the man out
      // there is a fielder with a rating, and running on him is now a bet.
      //
      // ponytail: split arm from glove when a club is built around one rifle
      // in right and the shared number stops telling that story.
      arm: glove,
      // ⚠️ WAS IT HIT ON A LINE. One `line_out` outcome covers everything from
      // 10° to 38° now, and the two ends of that band are completely different
      // plays: a rope caught on the line can double a man off first, a fly ball
      // he stood and watched cannot. SAC_FLY_MIN_ANGLE is the same line
      // inning.ts uses to decide who can TAG on it, which is what stops one ball
      // from being both. See DOUBLE_OFF in core/fielding.ts, including why this
      // does not also ask whether an infielder caught it.
      lineDrive: hit.launchAngle < SAC_FLY_MIN_ANGLE,
      ...(race ? { race } : {}),
    },
    rng,
  );

  // ⚠️ ROLLED LAST, AFTER everything rollFielding() drew, for the reason that
  // file states out loud: a die taken earlier shifts every draw behind it and
  // quietly re-rolls a seeded season.
  //
  // Only a HIT can be stretched — there is no extra bag past an out — and only
  // one that got a long way from anybody. stretchChance() returns 0 otherwise
  // and inning.ts never looks at the roll.
  // ⚠️ THE DIE IS ONLY THROWN WHEN IT CAN DECIDE SOMETHING, and throwing it
  // unconditionally was a real cost rather than tidiness. Every draw shifts the
  // whole stream behind it, so burning one on all 40-odd balls in play a game
  // re-randomised every season in the project — and left a measurable-looking
  // wobble in the balance numbers that had nothing to do with the feature being
  // measured. This fires on the tenth or so of balls that actually land in
  // space, and leaves the rest of the stream exactly where it was.
  const odds =
    isHit(hit.outcome) && opts.placement
      ? stretchChance(opts.batterSpeed, opts.placement.gapFt)
      : 0;
  const stretch =
    odds > 0
      ? // The same arm, at the batter's own rate — see STRETCH_THROW.
        { odds, roll: rng.next(), armOdds: STRETCH_THROW * glove }
      : undefined;

  // A booted ball has no catch to throw after.
  const thrown = air && !result.error ? air : undefined;
  return {
    ...result,
    ...(thrown?.clock.at === 4 ? { tagOut: thrown.out } : {}),
    ...(stretch ? { stretch } : {}),
    ...(clock ? { clock } : {}),
    ...(thrown ? { airClock: thrown.clock } : {}),
    by,
    fielder,
  };
}

/**
 * The glove standing at a scorer's number, for placement.ts's races — cutOff() and catchFly().
 *
 * ⚠️ IT IS A CLOSURE RATHER THAN AN IMPORT, and that is a layering decision.
 * placement.ts is geometry and knows nothing about rosters; teaching it about
 * Alignment and gloveOf would drag the whole roster model into a file whose job
 * is measuring distances. So it asks a question — "how much ground does number
 * 6 cover" — and this answers it.
 *
 * The fallback of 1 is league average, which is what an eight-man club or a
 * test with no alignment should get.
 */
export const reachOf =
  (a: Alignment) =>
  (fielderNum: number): number => {
    const p = a[POSITION_BY_NUMBER[fielderNum] ?? 'P'];
    return p ? gloveOf(p) : 1;
  };

/**
 * The catcher's arm, for the running game.
 *
 * Exported here rather than in baserunning because it is a DEFENSIVE property —
 * and because it is the one link that makes putting a bad glove behind the
 * plate cost you something you can see.
 */
export const catcherArm = (a: Alignment): number => (a.C ? gloveOf(a.C) : 1);

/** For the UI: "SS" and the name standing there. */
export const describeAlignment = (a: Alignment): string =>
  FILL_ORDER.filter((p) => p !== 'DH')
    .map((p) => `${p} ${a[p]?.name ?? '—'}`)
    .join(' · ');
