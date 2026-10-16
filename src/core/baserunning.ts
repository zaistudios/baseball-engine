/**
 * Stealing, the lead that prices it, and the pickoff that is the lead's cost.
 *
 * THE SCOPE LINE, stated here so the next session inherits it: the vault's
 * pitch-and-at-bat spec §6 rules baserunning out for the batter-only design,
 * warning that it "reads as an obvious next feature and it is nine systems
 * wearing one name." Those nine systems are the hit-and-run, the slide
 * taxonomy, sign systems, leads, pickoffs, delayed steals, the squeeze, tag-
 * ups and the third-base coach.
 *
 * WHAT IS HERE NOW (2026-10-15, Zane: "baserunning isn't interactive and is
 * too fast"): the steal, LEADS and PICKOFFS. Those two are one system — a lead
 * without a throw-over is a free bonus, and a throw-over without a lead is a
 * lottery ticket. Tag-ups live in inning.ts and defense.ts.
 *
 * STILL NOT HERE: hit-and-run, squeeze, delayed steal, steal of home, double
 * steal, slide taxonomy, signs. Each would take the shape below — a pure
 * `attemptX(…, rng)` returning `{ safe|out, chance, roll }`, gated by a
 * situation function in game/running.ts — but every one of them is a play the
 * at-bat engine has to know about mid-pitch, and that is the real work.
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

/**
 * HOW FAR OFF THE BAG HE IS. A short lead is a man the pitcher has just thrown
 * over on; a big one is the player asking for it.
 *
 * `steal` is added to the odds, `pickoff` is what a throw-over gets him at
 * speed 1.0, and `ft` is the lead the replay draws as a fraction of the leg.
 */
export type Lead = 'short' | 'normal' | 'big';
export const LEADS: Record<Lead, { steal: number; pickoff: number; ft: number }> = {
  short: { steal: -0.06, pickoff: 0.005, ft: 0.08 },
  normal: { steal: 0, pickoff: 0.015, ft: 0.12 },
  big: { steal: 0.08, pickoff: 0.15, ft: 0.19 },
};

export interface StealResult {
  safe: boolean;
  /** 0-indexed base being taken: 1 = second, 2 = third. */
  to: number;
  chance: number;
  /**
   * The die itself. How far it landed from `chance` is how close the play
   * was, and the replay draws that margin — see game/running.ts:stealClock().
   */
  roll: number;
}

/**
 * Odds of a runner taking the next base.
 *
 * `speed` is a multiplier around 1.0, the same shape as power/contact/clutch,
 * so a 1.4-speed burner is genuinely worth sending and a 0.7 catcher is not.
 */
export function stealChance(
  speed: number,
  toBase: number,
  catcherArm = 1,
  lead: Lead = 'normal',
): number {
  const penalty = toBase >= 2 ? THIRD_BASE_PENALTY : 0;
  const chance = (STEAL_BASE_RATE * speed - penalty) / Math.max(0.1, catcherArm) + LEADS[lead].steal;
  // Never a certainty and never hopeless — a coin that always lands the same
  // way is not a decision.
  return Math.max(0.05, Math.min(0.95, chance));
}

/**
 * Roll it. Caught stealing is an out, which the inning layer applies.
 *
 * `catcherArm` defaults to 1, which is exactly the old behaviour — the
 * caller with no catcher gets an average one. The real game has one; see game/defense.ts.
 */
export function attemptSteal(
  speed: number,
  toBase: number,
  rng: Rng,
  catcherArm = 1,
  lead: Lead = 'normal',
): StealResult {
  const chance = stealChance(speed, toBase, catcherArm, lead);
  const roll = rng.next();
  return { safe: roll < chance, to: toBase, chance, roll };
}

export interface PickoffResult {
  /** Picked off: an out, and the runner is gone. */
  out: boolean;
  chance: number;
  roll: number;
}

/**
 * Odds a throw-over gets him. The lead is most of it; a quick man gets back a
 * little better, and a good arm on the defence (catcherArm()) a little worse.
 */
export function pickoffChance(speed: number, lead: Lead, arm = 1): number {
  const chance = (LEADS[lead].pickoff * Math.max(0.1, arm)) / Math.max(0.3, speed);
  return Math.max(0.002, Math.min(0.5, chance));
}

/** Throw over. One die, the same shape as attemptSteal(). */
export function attemptPickoff(speed: number, lead: Lead, rng: Rng, arm = 1): PickoffResult {
  const chance = pickoffChance(speed, lead, arm);
  const roll = rng.next();
  return { out: roll < chance, chance, roll };
}
