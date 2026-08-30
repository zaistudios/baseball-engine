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
  /**
   * WHAT THE LAST SWING DID, whether or not it ended the at-bat.
   *
   * ⚠️ THIS EXISTS SO A FOUL CAN BE DRAWN. Before it, swingAt() resolved the
   * swing, saw a foul, added a strike and threw the HitResult away — so the
   * screen knew a foul had happened and could not know where it went, how hard
   * it was hit or how high. The ball simply vanished. Every other batted ball
   * reaches the replay through `result.hit`; a foul has no result, so it needs
   * somewhere else to be.
   *
   * Set on every swing including the whiff, so "what happened on that pitch" is
   * answerable from the count alone. Undefined before the first swing and after
   * a take, which is exactly the case where there is nothing to draw.
   */
  lastSwing?: HitResult;
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
  // Carried on every path below, including the ones that do not end the at-bat.
  // See AtBatState.lastSwing — it is what lets a foul be drawn.
  const swung = { ...state, lastSwing: hit };

  if (hit.outcome === 'strikeout') return addStrike(swung);
  if (hit.outcome === 'foul') {
    // The bunt exception. A foul bunt with two strikes rings him up, and
    // addStrike() already knows what a third strike is.
    //
    // ⚠️ NOTE WHAT IS RETURNED WHEN THE FOUL IS FREE: `swung`, not `state`. The
    // count is unchanged either way, but the swing has to survive or the screen
    // cannot draw the ball. main.ts tests for a free foul by comparing the
    // COUNT, not the object — see the note there.
    if (state.strikes >= 2 && !hit.bunted) return swung;
    return addStrike(swung);
  }
  // ⚠️ A CAUGHT FOUL ARRIVES HERE, and that is the whole reason foul_out is a
  // separate outcome. It is an out like any other from this point on: it ends
  // the at-bat, applyAtBat() records it, and nothing downstream needs a special
  // case. A `foul` reaching applyAtBat() throws — see the note in inning.ts.
  return { ...swung, result: { kind: 'in_play', hit } };
}
