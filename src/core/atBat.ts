/**
 * The count. One at-bat, pitch by pitch.
 *
 * resolveSwing() answers "what happened to that swing"; it does not answer
 * "is the at-bat over". Those are different questions and the second one is
 * where the baseball rules live:
 *
 *  - A BUNT fouled off with two strikes IS the third strike. The one place
 *    baseball breaks its own foul rule, and the reason bunting with two
 *    strikes is a decision instead of a free take.
 *  - A whiff is a STRIKE, not a strikeout. The miss table returns 'strikeout'
 *    because it has no other outcome to name, and the contact tables carry a
 *    strikeout probability too (0.05 good, 0.15 early, 0.20 late). Either way
 *    the count decides, not the table.
 *  - A foul with two strikes is not the third one.
 *
 * State is a plain object and every function returns a new one, so an at-bat
 * replays exactly from a seed - same requirement as rng.ts, same reason.
 */

import type { Rng } from './rng.ts';
import { resolveSwing, type HitResult, type SwingInput } from './hit.ts';

export type AtBatResult =
  | { kind: 'walk' }
  | { kind: 'hit_by_pitch' }
  | { kind: 'strikeout' }
  | { kind: 'in_play'; hit: HitResult };

export interface AtBatState {
  balls: number;
  strikes: number;
  /** Set exactly once, when the at-bat ends. */
  result?: AtBatResult;
}

export const newAtBat = (): AtBatState => ({ balls: 0, strikes: 0 });

export const isOver = (state: AtBatState): boolean => state.result !== undefined;

function assertLive(state: AtBatState): void {
  if (state.result) throw new Error(`at-bat already ended: ${state.result.kind}`);
}

function addStrike(state: AtBatState): AtBatState {
  const strikes = state.strikes + 1;
  return strikes >= 3
    ? { ...state, strikes, result: { kind: 'strikeout' } }
    : { ...state, strikes };
}

function addBall(state: AtBatState): AtBatState {
  const balls = state.balls + 1;
  return balls >= 4 ? { ...state, balls, result: { kind: 'walk' } } : { ...state, balls };
}

/**
 * Batter kept the bat on their shoulder.
 *
 * `hitBatter` ends the at-bat immediately at any count — a plunking is not a
 * ball, it is first base. Passing it while `inZone` is true is a contradiction
 * the caller should not be able to make, so the pitcher decides both together.
 */
export function takePitch(state: AtBatState, inZone: boolean, hitBatter = false): AtBatState {
  assertLive(state);
  if (hitBatter) return { ...state, result: { kind: 'hit_by_pitch' } };
  return inZone ? addStrike(state) : addBall(state);
}

/**
 * Batter swung. A pitch out of the zone is still swung at the same way - the
 * penalty for chasing is that the outcome tables punish bad timing, and a
 * swing can never be called a ball.
 */
export function swingAt(state: AtBatState, input: SwingInput, rng: Rng): AtBatState {
  assertLive(state);
  const hit = resolveSwing(input, rng);

  if (hit.outcome === 'strikeout') return addStrike(state);
  if (hit.outcome === 'foul') {
    // The bunt exception. A foul bunt with two strikes rings him up, and
    // addStrike() already knows what a third strike is.
    if (state.strikes >= 2 && !hit.bunted) return state;
    return addStrike(state);
  }
  return { ...state, result: { kind: 'in_play', hit } };
}
