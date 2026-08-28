/**
 * Stealing. The foundation only — one decision, one stat, one resolution.
 *
 * THE SCOPE LINE, stated here so the next session inherits it: the vault's
 * pitch-and-at-bat spec §6 rules baserunning out for the batter-only design,
 * warning that it "reads as an obvious next feature and it is nine systems
 * wearing one name." Those nine systems are the hit-and-run, the slide
 * taxonomy, sign systems, leads, pickoffs, delayed steals, the squeeze, tag-
 * ups and the third-base coach.
 *
 * NONE OF THOSE ARE HERE, deliberately. What is here is the one that fits a
 * player-manager who "plays the clutch and sims the rest": send the runner,
 * or don't. If a later session starts adding the other eight, that is the
 * drift the spec was warning about.
 */

import type { Rng } from './rng.ts';

/**
 * Chance of stealing second at speed 1.0.
 *
 * Real MLB stolen-base success runs about 75%, which is the number that makes
 * the decision genuinely tense — often right, never safe.
 */
export const STEAL_BASE_RATE = 0.72;

/** Third is harder than second: shorter lead, better throw. */
export const THIRD_BASE_PENALTY = 0.15;

export interface StealResult {
  safe: boolean;
  /** 0-indexed base being taken: 1 = second, 2 = third. */
  to: number;
  chance: number;
}

/**
 * Odds of a runner taking the next base.
 *
 * `speed` is a multiplier around 1.0, the same shape as power/contact/clutch,
 * so a 1.4-speed burner is genuinely worth sending and a 0.7 catcher is not.
 */
export function stealChance(speed: number, toBase: number, catcherArm = 1): number {
  const penalty = toBase >= 2 ? THIRD_BASE_PENALTY : 0;
  const chance = (STEAL_BASE_RATE * speed - penalty) / Math.max(0.1, catcherArm);
  // Never a certainty and never hopeless — a coin that always lands the same
  // way is not a decision.
  return Math.max(0.05, Math.min(0.95, chance));
}

/**
 * Roll it. Caught stealing is an out, which the inning layer applies.
 *
 * `catcherArm` defaults to 1, which is exactly the old behaviour — the
 * roguelike has no catcher to be worse or better than average. The two-sided
 * game does; see game/defense.ts.
 */
export function attemptSteal(
  speed: number,
  toBase: number,
  rng: Rng,
  catcherArm = 1,
): StealResult {
  const chance = stealChance(speed, toBase, catcherArm);
  return { safe: rng.next() < chance, to: toBase, chance };
}
