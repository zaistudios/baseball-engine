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
  DELIVERY_MS,
  RELEASE_AT_MS,
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
    expect(RELEASE_AT_MS + releaseWindowMs('loose', command, assist)).toBeLessThanOrEqual(
      DELIVERY_MS,
    );
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
    const earliestGradable = RELEASE_AT_MS - releaseWindowMs('loose', command, assist);
    expect(ARM_MS).toBeLessThan(earliestGradable);
    // Said the other way, off the function itself: a press at the very end of
    // the dead region is wild for every arm on every level.
    expect(gradeRelease(ARM_MS - RELEASE_AT_MS, command, assist)).toBe('wild');
  });

  it('has a price and both labels for every grade', () => {
    for (const g of GRADES) {
      expect(RELEASE_CONTROL[g]).toBeGreaterThan(0);
      expect(RELEASE_LABEL[g]).toBeTruthy();
      expect(RELEASE_SHORT[g]).toBeTruthy();
    }
  });
});
