/**
 * The streak. Four claims, and the third one is the whole design: laying off a
 * pitch must never cost you anything.
 */

import { describe, expect, it } from 'vitest';
import { extend, newStreak, type Streak } from '../streak.ts';
import type { TimingGrade } from '../../core/timing.ts';

/** Run a list of swings through it, most recent last. */
const run = (grades: readonly TimingGrade[]): Streak =>
  grades.reduce((s, g) => extend(s, g).streak, newStreak());

describe('the barrel streak', () => {
  it('counts squared-up swings in a row', () => {
    expect(run(['perfect', 'good', 'perfect']).current).toBe(3);
  });

  it('breaks on contact that was not the good kind', () => {
    expect(run(['perfect', 'good', 'late']).current).toBe(0);
    expect(run(['perfect', 'good', 'early']).current).toBe(0);
    expect(run(['perfect', 'good', 'miss']).current).toBe(0);
  });

  it('remembers the best after it breaks', () => {
    const s = run(['good', 'good', 'good', 'miss']);
    expect(s.current).toBe(0);
    expect(s.best).toBe(3);
  });

  it('only calls it a record when the record actually moved', () => {
    const at3 = run(['good', 'good', 'good', 'miss']);
    // Back up to three ties the best; it does not beat it.
    const tie = ['good', 'good', 'good'].reduce(
      (acc, g) => extend(acc.streak, g as TimingGrade),
      { streak: at3, record: false },
    );
    expect(tie.record).toBe(false);
    expect(extend(tie.streak, 'good').record).toBe(true);
  });

  it('never lets the best go backwards', () => {
    const s = run(['good', 'good', 'good', 'good', 'miss', 'good']);
    expect(s.current).toBe(1);
    expect(s.best).toBe(4);
  });
});
