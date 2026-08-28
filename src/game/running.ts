/**
 * The running game, connected to an actual game for the first time.
 *
 * ⚠️ core/baserunning.ts has existed since the first build and NOTHING HAS
 * EVER CALLED IT. `attemptSteal()` was written, tested and wired to nothing —
 * the roguelike's at-bat screen never sent a runner. This file is the missing
 * half: who is allowed to go, whether the computer sends him, and what it does
 * to the game state when he goes.
 *
 * The scope line from core/baserunning.ts still holds and is worth repeating,
 * because this is exactly where it would erode: no hit-and-run, no leads, no
 * pickoffs, no delayed steals, no squeeze, no slide taxonomy. **Send the
 * runner, or don't.** One decision.
 *
 * What IS new here is that the catcher matters. Stealing is a race against a
 * throw, and there is finally somebody making the throw — see defense.ts.
 */

import { attemptSteal, stealChance } from '../core/baserunning.ts';
import { moveRunner, removeRunner, type Bases, type Runner } from '../core/inning.ts';
import type { Rng } from '../core/rng.ts';
import { fatigue } from './bullpen.ts';
import { catcherArm, gloveOf, type Alignment } from './defense.ts';
import {
  creditRuns,
  recordOut,
  withBases,
  battingSide,
  fieldingSide,
  stateOf,
  type GameState,
} from './game.ts';

/** A runner who could go, and the bag he would be going to. */
export interface StealOpportunity {
  /** 0-indexed base he is standing on. */
  from: number;
  /** ...and the one he would take. */
  to: number;
  runner: Runner;
}

/**
 * Who can go right now.
 *
 * The lead runner only, and only into an empty bag. Nobody steals home, and
 * two men do not go at once — that is the double steal, which is one of the
 * nine systems the scope line rules out.
 *
 * Third is offered but is a genuinely worse idea, which core/baserunning.ts
 * prices in with THIRD_BASE_PENALTY.
 */
export function stealOpportunity(g: GameState): StealOpportunity | null {
  const [first, second, third] = g.bases;
  if (second && !third) return { from: 1, to: 2, runner: second };
  if (first && !second) return { from: 0, to: 1, runner: first };
  return null;
}

/** The odds, with the man behind the plate taken into account. */
export const chanceFor = (
  _g: GameState,
  op: StealOpportunity,
  alignment: Alignment,
): number => stealChance(op.runner.speed, op.to, catcherArm(alignment));

export interface StealOutcome {
  game: GameState;
  safe: boolean;
  runner: Runner;
  to: number;
  chance: number;
}

/**
 * Send him.
 *
 * Safe moves him up; caught erases him AND costs an out, which can end the
 * half — and recordOut() already knows how to close one, so a caught stealing
 * posts the line score exactly like a strikeout does.
 */
export function sendRunner(
  g: GameState,
  alignment: Alignment,
  rng: Rng,
): StealOutcome | null {
  const op = stealOpportunity(g);
  if (!op || g.over) return null;

  const { safe, chance } = attemptSteal(op.runner.speed, op.to, rng, catcherArm(alignment));

  if (safe) {
    return {
      game: withBases(g, moveRunner(g.bases, op.from)),
      safe: true,
      runner: op.runner,
      to: op.to,
      chance,
    };
  }

  return {
    game: recordOut(g, removeRunner(g.bases, op.from)),
    safe: false,
    runner: op.runner,
    to: op.to,
    chance,
  };
}


// ------------------------------------------------------------- the wild one

/**
 * Chance per plate appearance, WITH SOMEBODY ON, that the ball gets away.
 *
 * Wild pitches and passed balls are one event here, because the difference
 * between them is the official scorer's opinion about whose fault it was and
 * the runners advance identically either way. Real baseball runs about 0.40
 * WP + 0.06 PB per team per game; roughly half of all plate appearances have a
 * runner on, so the per-opportunity rate is a shade over 2%.
 *
 * ⚠️ Rolled ONCE PER PLATE APPEARANCE, not per pitch — the same simplification
 * the steal makes, and for the same reason: base state changes between batters
 * in this engine, never inside an at-bat. A per-pitch version would have to
 * thread GameState through the at-bat loop in BOTH sim.ts and main.ts, and the
 * two halves drifting is the failure this codebase is most exposed to.
 */
export const WILD_PITCH_RATE = 0.025;

/** How much a gassed arm bounces one. A tiring pitcher loses the plate. */
export const WILD_FATIGUE_MULT = 1.6;

/**
 * The pitcher's control, as a multiplier on that rate.
 *
 * zoneRate is the control stat the whole engine already uses, and 0.5 is about
 * league average for it. A wild man is wilder here too, which is the point —
 * it makes going to the pen for a strike-thrower mean something beyond walks.
 */
const wildness = (zoneRate: number): number => Math.max(0.4, Math.min(2.2, 0.5 / zoneRate));

export interface WildPitch {
  game: GameState;
  /** Runners who moved up, by the base they left. For the play-by-play. */
  advanced: Runner[];
  runs: number;
}

/**
 * Roll for one getting away, and move everybody up if it does.
 *
 * Nobody on means no roll at all: a wild pitch with empty bases is a ball, and
 * a ball is already modelled. The catcher BLOCKS it — his glove is the same
 * number that throws out the runner in sendRunner(), so a bat hidden behind
 * the plate now leaks bases two different ways.
 */
export function rollWildPitch(g: GameState, alignment: Alignment, rng: Rng): WildPitch | null {
  if (g.over) return null;
  const [first, second, third] = g.bases;
  if (!first && !second && !third) return null;

  const zoneRate = stateOf(g, fieldingSide(g)).staff.current.pitcher.zoneRate;
  const tired = fatigue(stateOf(g, fieldingSide(g)).staff);
  const block = alignment.C ? gloveOf(alignment.C) : 1;

  const chance = WILD_PITCH_RATE * wildness(zoneRate) * (1 + tired * (WILD_FATIGUE_MULT - 1)) / block;
  if (rng.next() >= chance) return null;

  // Everybody up one. The man on third scores; nobody is ever thrown out
  // going, because on a ball to the backstop the throw is to the plate and
  // this engine does not model the tag.
  const advanced = [first, second, third].filter((r): r is Runner => r !== null);
  const runs = third ? 1 : 0;
  const bases: Bases = [null, first, second];

  return { game: creditRuns(g, bases, runs), advanced, runs };
}

// ------------------------------------------------------- the computer's call

/**
 * Break-even is about 70%: a steal that fails costs an out AND a baserunner,
 * so the odds have to be well better than a coin before it is worth doing.
 * Real analytics put the line near 75%; this is a shade under, because a game
 * where nobody ever runs is duller than one where somebody occasionally gets
 * thrown out.
 */
export const SEND_THRESHOLD = 0.62;

/**
 * ⚠️ THE ODDS ARE NOT THE WHOLE DECISION, and leaving them as the whole
 * decision produced **9.2 steal attempts a game** against a real ~1.8.
 *
 * The reason is structural and worth understanding before touching this: a
 * chance to steal exists on most plate appearances — a man on first with
 * second open is the ordinary state of a baseball game — and it gets checked
 * every single time. So a pure odds test fires on every opportunity a fast
 * runner ever gets, and the roster has plenty of fast runners. Real clubs
 * attempt on well under a tenth of their opportunities.
 *
 * This is the manager deciding not to, for all the reasons a model does not
 * hold: the hitter is dangerous, the runner has a tight hamstring, they ran
 * last inning. Tuned against scripts/field.ts.
 */
export const ATTEMPT_RATE = 0.12;

/**
 * Should the computer send the runner?
 *
 * Three real considerations, and no more:
 *  - the odds, against the man behind the plate
 *  - the OUTS. Making the first out at second is bad; making the THIRD out on
 *    the bases is the worst play in baseball, so it never runs with two down
 *    unless the odds are excellent.
 *  - the SCORE. A team down late needs a baserunner in scoring position and
 *    can afford the gamble; a team well ahead has nothing to gain.
 */
export function aiShouldSend(
  g: GameState,
  alignment: Alignment,
  rng?: Rng,
  /**
   * The batting club's running knob — see identity.ts. It scales HOW OFTEN the
   * manager asks, and deliberately not the bar he answers against: a TRACK
   * TEAM asks six times as often as BIG INNING does and still gets the same
   * "no" when the odds are bad. Turning the bar instead would have a club with
   * no legs running into a good catcher because of a personality tag, which is
   * the version of this that reads as the game cheating.
   */
  running = 1,
): boolean {
  const op = stealOpportunity(g);
  if (!op) return false;

  // The manager mostly does not run. See ATTEMPT_RATE. `rng` is optional so a
  // test can ask the pure odds question without the gate in the way.
  if (rng && rng.next() >= Math.min(1, ATTEMPT_RATE * running)) return false;

  const chance = chanceFor(g, op, alignment);
  const us = stateOf(g, battingSide(g)).runs;
  const them = stateOf(g, fieldingSide(g)).runs;
  const behind = them - us;

  let bar = SEND_THRESHOLD;
  if (g.outs === 2) bar += 0.12; // the third out on the bases is the worst out
  if (behind > 0 && g.inning >= 7) bar -= 0.06; // needs the run
  if (behind < -4) bar += 0.15; // up big: nothing to gain, do not risk it
  // Third is a longer trip and takes you out of a force — hold unless it is free.
  if (op.to === 2) bar += 0.08;

  return chance >= bar;
}
