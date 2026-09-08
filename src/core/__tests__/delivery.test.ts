/**
 * The mound's half of the timing model. Three things are worth a test here and
 * the third is the one that would go wrong silently:
 *
 *  1. the boundaries and the sign, exactly as timing.test.ts guards the swing's
 *  2. the multipliers actually widening the windows they claim to
 *  3. the two INVARIANTS the design rests on — `good` being exactly the
 *     league's control, and the sweep outlasting the widest press that still
 *     grades. Both are one-line facts that nothing else in the codebase would
 *     notice breaking.
 */

import { describe, it, expect } from 'vitest';
import {
  ARM_MS,
  DELIVERIES,
  RELEASE_CONTROL,
  RELEASE_LABEL,
  RELEASE_SHORT,
  RELEASE_WINDOWS_MS,
  controlOf,
  gradeRelease,
  releaseWindowMs,
  type ReleaseGrade,
} from '../delivery.ts';
import { COMMAND } from '../pitcher.ts';
import { LEVELS } from '../../game/difficulty.ts';

const GRADES: ReleaseGrade[] = ['perfect', 'good', 'early', 'late', 'wild'];

describe('the boundaries, and which side of them counts', () => {
  it('grades a dead-on release perfect', () => {
    expect(gradeRelease(0)).toBe('perfect');
  });

  it('includes the edge of each window rather than excluding it', () => {
    expect(gradeRelease(RELEASE_WINDOWS_MS.perfect)).toBe('perfect');
    expect(gradeRelease(RELEASE_WINDOWS_MS.good)).toBe('good');
    expect(gradeRelease(RELEASE_WINDOWS_MS.loose)).toBe('late');
  });

  it('drops a grade one millisecond past each edge', () => {
    expect(gradeRelease(RELEASE_WINDOWS_MS.perfect + 1)).toBe('good');
    expect(gradeRelease(RELEASE_WINDOWS_MS.good + 1)).toBe('late');
    expect(gradeRelease(RELEASE_WINDOWS_MS.loose + 1)).toBe('wild');
  });

  it('reads negative as early and positive as late, in the outer band only', () => {
    const inner = RELEASE_WINDOWS_MS.good - 1;
    const outer = RELEASE_WINDOWS_MS.good + 1;
    // Symmetric inside: being 60ms off is the same release either way.
    expect(gradeRelease(-inner)).toBe(gradeRelease(inner));
    expect(gradeRelease(-outer)).toBe('early');
    expect(gradeRelease(outer)).toBe('late');
  });

  it('cannot be graded off a broken clock', () => {
    expect(gradeRelease(Number.NaN)).toBe('wild');
    expect(gradeRelease(Number.POSITIVE_INFINITY)).toBe('wild');
  });
});

describe('what widens the window', () => {
  it("widens with the arm's command", () => {
    const past = RELEASE_WINDOWS_MS.perfect + 2;
    expect(gradeRelease(past, 1)).toBe('good');
    expect(gradeRelease(past, COMMAND.painter)).toBe('perfect');
    // ...and narrows for the two arms the fiction says cannot aim.
    expect(gradeRelease(RELEASE_WINDOWS_MS.perfect, COMMAND.knuckler)).toBe('good');
  });

  it('widens with the difficulty assist', () => {
    const past = RELEASE_WINDOWS_MS.good + 20;
    expect(gradeRelease(past, 1, 1)).toBe('late');
    expect(gradeRelease(past, 1, 1.6)).toBe('good');
  });

  it('refuses a multiplier that would collapse or poison a window', () => {
    for (const bad of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(releaseWindowMs('good', bad, 1)).toBe(RELEASE_WINDOWS_MS.good);
      expect(releaseWindowMs('good', 1, bad)).toBe(RELEASE_WINDOWS_MS.good);
    }
  });

  it('keeps the three windows in order however they are scaled', () => {
    for (const command of [0.8, 1, 1.15]) {
      for (const assist of [0.75, 1, 1.6]) {
        const p = releaseWindowMs('perfect', command, assist);
        const g = releaseWindowMs('good', command, assist);
        const l = releaseWindowMs('loose', command, assist);
        expect(p).toBeLessThan(g);
        expect(g).toBeLessThan(l);
      }
    }
  });
});

describe('the invariants the design rests on', () => {
  /**
   * ⚠️ THE ONE THAT MATTERS. Every arm in sim.ts throws at control = 1. If a
   * competent release is worth anything other than exactly that, the human's
   * copy of an arm is a different arm from the league's, and scripts/balance.ts
   * is measuring a game nobody plays.
   */
  it('prices a good release at exactly the league', () => {
    expect(controlOf('good')).toBe(1);
  });

  it('rewards perfect and costs everything else', () => {
    expect(controlOf('perfect')).toBeGreaterThan(1);
    expect(controlOf('early')).toBeLessThan(1);
    expect(controlOf('late')).toBe(controlOf('early'));
    expect(controlOf('wild')).toBeLessThan(controlOf('early'));
  });

  /**
   * ⚠️ THE SWEEP MUST OUTLAST THE WIDEST GRADABLE LATE PRESS. main.ts forces a
   * 'wild' release at DELIVERY_MS; if that arrived before gradeRelease()'s own
   * outer window closed, a press this file calls 'late' would be cut off and
   * called 'wild' — the meter disagreeing with the grade it draws. This fails
   * the day somebody widens a window or adds an easier level, which is exactly
   * when DELIVERY_MS needs looking at.
   */
  it('leaves room for the latest release any arm on any level can still get graded', () => {
    const command = Math.max(...Object.values(COMMAND));
    const assist = Math.max(...LEVELS.map((l) => l.assist));
    // ⚠️ EVERY PITCH, NOT THE OLD PAIR OF CONSTANTS. Each of the six has its own
    // sweep and release point now — see DELIVERIES — so the invariant is six
    // inequalities and a slow new pitch has to clear it too.
    for (const [type, d] of Object.entries(DELIVERIES)) {
      expect(
        d.releaseAtMs + releaseWindowMs('loose', command, assist, d.scale),
        `${type} sweep is too short for its own latest gradable release`,
      ).toBeLessThanOrEqual(d.sweepMs);
    }
  });

  /**
   * ⚠️ THE DEAD REGION MUST STAY INSIDE 'wild'. main.ts drops a press before
   * ARM_MS on the floor, so if the widest early window ever reached back past
   * it, the guard would start eating releases a player meant — and eating them
   * silently, which is the worst way for a control to fail. Widening a window
   * or adding an easier level fails this rather than shipping that.
   */
  it('swallows only presses that could not have graded as anything but wild', () => {
    const command = Math.max(...Object.values(COMMAND));
    const assist = Math.max(...LEVELS.map((l) => l.assist));
    for (const [type, d] of Object.entries(DELIVERIES)) {
      const earliestGradable = d.releaseAtMs - releaseWindowMs('loose', command, assist, d.scale);
      expect(ARM_MS, `${type} lets the dead region eat a gradable press`).toBeLessThan(
        earliestGradable,
      );
      // Said the other way, off the function itself: a press at the very end of
      // the dead region is wild for every arm on every level.
      expect(gradeRelease(ARM_MS - d.releaseAtMs, command, assist, d.scale)).toBe('wild');
    }
  });

  /**
   * ⚠️ THE POINT OF THE WHOLE TABLE. If two pitches ask for the same press at
   * the same moment they are the same pitch to throw, and the repetition this
   * was built to fix is back. Release points have to be genuinely apart.
   */
  it('gives the six pitches genuinely different deliveries', () => {
    const releases = Object.values(DELIVERIES).map((d) => d.releaseAtMs);
    expect(new Set(releases).size).toBe(releases.length);
    // The fastball and the changeup are the pair the deception rests on, and
    // the gap between them has to be big enough to actually mis-time.
    expect(DELIVERIES.changeup.releaseAtMs - DELIVERIES.fastball.releaseAtMs).toBeGreaterThan(200);
    // Nobody is quicker than the fastball or slower than the curveball.
    expect(Math.min(...releases)).toBe(DELIVERIES.fastball.releaseAtMs);
    expect(Math.max(...releases)).toBe(DELIVERIES.curveball.releaseAtMs);
  });

  it('never widens a window past the default — a pitch is a cost, not a buff', () => {
    // ⚠️ ONLY THE FASTBALL AND THE SINKER ARE ALLOWED ABOVE 1, and only just.
    // A scale well over 1 would make calling one pitch a free accuracy upgrade
    // rather than a rhythm you have to hold.
    for (const [type, d] of Object.entries(DELIVERIES)) {
      expect(d.scale, `${type} scale`).toBeGreaterThan(0.5);
      expect(d.scale, `${type} scale`).toBeLessThanOrEqual(1.1);
    }
    expect(DELIVERIES.knuckleball.scale).toBeLessThan(DELIVERIES.fastball.scale);
  });

  it('has a price and both labels for every grade', () => {
    for (const g of GRADES) {
      expect(RELEASE_CONTROL[g]).toBeGreaterThan(0);
      expect(RELEASE_LABEL[g]).toBeTruthy();
      expect(RELEASE_SHORT[g]).toBeTruthy();
    }
  });
});

describe('the release line has to visibly move between pitches', () => {
  /**
   * ⚠️ THE REGRESSION THIS EXISTS TO CATCH, and it shipped once already.
   *
   * The bar is one fixed width, so the release line is drawn at
   * release/sweep across it. The first table picked sweeps and releases that
   * scaled together — every ratio landed between 63.6% and 73.6%, which on a
   * 252px bar is 25px, and on the real screen the line looked like it was in
   * the same place on all six pitches. The tempo was felt and not seen.
   *
   * Both bounds tests above still passed with that table, because neither of
   * them is about where the line is DRAWN. This one is.
   */
  it('spreads the release ratios across a quarter of the bar', () => {
    const ratios = Object.values(DELIVERIES).map((d) => d.releaseAtMs / d.sweepMs);
    expect(Math.max(...ratios) - Math.min(...ratios)).toBeGreaterThan(0.2);
  });

  it('walks the line rightward as the pitch gets slower', () => {
    // The ordering is the mechanic: a slower pitch is held longer AND its line
    // sits further right, so the two cues agree instead of fighting.
    const byRelease = Object.values(DELIVERIES).sort((a, b) => a.releaseAtMs - b.releaseAtMs);
    const ratios = byRelease.map((d) => d.releaseAtMs / d.sweepMs);
    for (let i = 1; i < ratios.length; i++) {
      expect(ratios[i]!).toBeGreaterThan(ratios[i - 1]!);
    }
  });
});
