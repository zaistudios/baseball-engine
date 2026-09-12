import { describe, it, expect } from 'vitest';
import {
  rollFielding,
  doublePlayChance,
  CLEAN,
  DOUBLE_PLAY_RATE,
  ERROR_RATE,
  CLEAN_THROW,
  THROW_EFFECT,
  isClosePlay,
} from '../fielding.ts';
import { makeRng } from '../rng.ts';
import { recordAtBat, newMatch, EMPTY_BASES, type Bases, type Runner } from '../inning.ts';
import type { AtBatResult } from '../atBat.ts';

/** An rng that returns exactly what the test tells it to, in order. */
const scripted = (rolls: number[]) => {
  let i = 0;
  return {
    next: () => rolls[i++] ?? 0.999,
    int: () => 0,
    range: () => 0,
    pick: <T,>(xs: readonly T[]) => xs[0]!,
    state: () => 0,
  };
};

const RUNNER: Runner = { name: 'runner', speed: 1 };
const BATTER: Runner = { name: 'batter', speed: 1 };

const grounder = (): AtBatResult => ({
  kind: 'in_play',
  hit: { outcome: 'ground_out', isHit: false } as never,
});

describe('rollFielding', () => {
  it('leaves strikeouts and popups alone — no fielder to blame', () => {
    // toMatchObject, not toEqual: the result also carries the pre-rolled throw
    // to the extra base now (see FieldingResult.extraBase), and what this test
    // is about is that nobody is charged with anything.
    const always = scripted([0, 0]);
    expect(rollFielding('strikeout', { speed: 1, forceAtFirst: true, outs: 0 }, always)).toMatchObject(CLEAN);
    expect(rollFielding('popup', { speed: 1, forceAtFirst: true, outs: 0 }, always)).toMatchObject(CLEAN);
  });

  it('boots the ball when the first roll comes in under the error rate', () => {
    const r = rollFielding(
      'ground_out',
      { speed: 1, forceAtFirst: true, outs: 0 },
      scripted([ERROR_RATE - 0.001]),
    );
    expect(r).toMatchObject({ error: true, doublePlay: false });
  });

  it('never turns two on a ball it also booted', () => {
    // Both rolls are low. The error must win, or the fielder drops a ball he
    // is simultaneously relaying for two.
    const r = rollFielding('ground_out', { speed: 1, forceAtFirst: true, outs: 0 }, scripted([0, 0]));
    expect(r.error).toBe(true);
    expect(r.doublePlay).toBe(false);
  });

  it('needs a force at first, a ground ball, and fewer than two outs', () => {
    const clean = [0.99, 0]; // no error, then a certain double play
    expect(
      rollFielding('ground_out', { speed: 1, forceAtFirst: false, outs: 0 }, scripted(clean)).doublePlay,
    ).toBe(false);
    expect(
      rollFielding('line_out', { speed: 1, forceAtFirst: true, outs: 0 }, scripted(clean)).doublePlay,
    ).toBe(false);
    expect(
      rollFielding('ground_out', { speed: 1, forceAtFirst: true, outs: 2 }, scripted(clean)).doublePlay,
    ).toBe(false);
    expect(
      rollFielding('ground_out', { speed: 1, forceAtFirst: true, outs: 1 }, scripted(clean)).doublePlay,
    ).toBe(true);
  });

  it('lets fast men out of the double play and buries slow ones', () => {
    expect(doublePlayChance(1)).toBeCloseTo(DOUBLE_PLAY_RATE, 5);
    expect(doublePlayChance(1.4)).toBeLessThan(doublePlayChance(1));
    expect(doublePlayChance(0.7)).toBeGreaterThan(doublePlayChance(1));
  });

  it('stays inside [0.05, 0.9] at absurd speeds', () => {
    expect(doublePlayChance(99)).toBeGreaterThanOrEqual(0.05);
    expect(doublePlayChance(0.001)).toBeLessThanOrEqual(0.9);
  });
});

describe('recordAtBat applying the defence', () => {
  const onFirst: Bases = [RUNNER, null, null];

  it('defaults to a clean play — one out, and the forced man takes second', () => {
    const before = { ...newMatch(3), bases: onFirst };
    const after = recordAtBat(before, grounder(), BATTER);
    expect(after.outs).toBe(1);
    // He was forced. The batter is out at first and there is nowhere to go
    // back to, which is true with or without a die rolled for him.
    expect(after.bases).toEqual([null, RUNNER, null]);
  });

  it('double play costs two outs and erases the man on first', () => {
    const before = { ...newMatch(3), bases: onFirst };
    const after = recordAtBat(before, grounder(), BATTER, { error: false, doublePlay: true });
    expect(after.outs).toBe(2);
    expect(after.bases).toEqual(EMPTY_BASES);
  });

  it('a double play with one out ends the inning', () => {
    const before = { ...newMatch(3), outs: 1, bases: onFirst };
    const after = recordAtBat(before, grounder(), BATTER, { error: false, doublePlay: true });
    expect(after.outs).toBe(0);
    expect(after.inning).toBe(2);
    expect(after.bases).toEqual(EMPTY_BASES);
  });

  it('an error puts the batter on and costs nobody', () => {
    const before = { ...newMatch(3), bases: onFirst };
    const after = recordAtBat(before, grounder(), BATTER, { error: true, doublePlay: false });
    expect(after.outs).toBe(0);
    expect(after.bases[0]).toEqual(BATTER);
    expect(after.bases[1]).toEqual(RUNNER);
  });

  it('an error with the bases loaded scores one, same as a single', () => {
    const loaded: Bases = [RUNNER, RUNNER, RUNNER];
    const before = { ...newMatch(3), bases: loaded };
    const after = recordAtBat(before, grounder(), BATTER, { error: true, doublePlay: false });
    expect(after.runs).toBe(1);
    expect(after.outs).toBe(0);
  });

  it('is deterministic under a seeded rng — the run stays reproducible', () => {
    const roll = () =>
      rollFielding('ground_out', { speed: 1, forceAtFirst: true, outs: 0 }, makeRng(12345));
    expect(roll()).toEqual(roll());
  });
});

/**
 * THE THROW — the third graded press in the game. See THROW_EFFECT.
 *
 * The two things worth guarding are the two that would break silently: the
 * league not moving when nobody presses, and the press being able to reach
 * something it must not.
 */
describe('the graded throw', () => {
  /** Every roll in the middle, so only the thresholds decide anything. */
  const mid = () => scripted([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
  const opts = { speed: 1, forceAtFirst: true, outs: 0 };

  /**
   * ⚠️ THE INVARIANT THE WHOLE FEATURE RESTS ON, and the one delivery.ts states
   * for `good` on the mound. Every play in the headless sim resolves without a
   * press, so a competent throw has to land on exactly the league's own rates —
   * otherwise your copy of a defence is a different defence from the one
   * scripts/balance.ts measured.
   */
  it('makes a good throw exactly the league, on both numbers', () => {
    expect(THROW_EFFECT.good).toEqual({ dp: 1, error: 1 });
    expect(CLEAN_THROW).toBe(THROW_EFFECT.good);
  });

  it('resolves a play with no press exactly as it did before the press existed', () => {
    const without = rollFielding('ground_out', opts, mid());
    const good = rollFielding('ground_out', { ...opts, throwEffect: CLEAN_THROW }, mid());
    expect(good).toEqual(without);
  });

  it('turns more of them on a perfect throw and fewer on a wild one', () => {
    // A roll sitting just above the league double-play chance: the perfect
    // throw has to reach it and the wild one must not.
    const dp = doublePlayChance(1);
    const rolls = (r: number) => scripted([0.99, r]);
    expect(
      rollFielding('ground_out', { ...opts, throwEffect: THROW_EFFECT.perfect }, rolls(dp * 1.2))
        .doublePlay,
    ).toBe(true);
    expect(
      rollFielding('ground_out', { ...opts, throwEffect: THROW_EFFECT.good }, rolls(dp * 1.2))
        .doublePlay,
    ).toBe(false);
    expect(
      rollFielding('ground_out', { ...opts, throwEffect: THROW_EFFECT.wild }, rolls(dp * 0.9))
        .doublePlay,
    ).toBe(false);
  });

  it('boots a wild throw that a good one would have handled', () => {
    // The error is the FIRST roll — see the order note in rollOuts().
    const justOverTheLeague = scripted([ERROR_RATE * 1.5]);
    expect(
      rollFielding('ground_out', { ...opts, throwEffect: THROW_EFFECT.wild }, justOverTheLeague)
        .error,
    ).toBe(true);
    expect(
      rollFielding(
        'ground_out',
        { ...opts, throwEffect: THROW_EFFECT.good },
        scripted([ERROR_RATE * 1.5]),
      ).error,
    ).toBe(false);
  });

  /**
   * ⚠️ THE PACING BOUND. A press on every ball fielded is five or six
   * interruptions a game and the mode's premise is that a season fits in an
   * afternoon. It is exactly the double-play ball and nothing else.
   */
  it('only stops the game for the double-play ball', () => {
    expect(isClosePlay('ground_out', { forceAtFirst: true, outs: 0 })).toBe(true);
    expect(isClosePlay('ground_out', { forceAtFirst: true, outs: 1 })).toBe(true);
    // Nothing to turn: two down, nobody forced, or a ball in the air.
    expect(isClosePlay('ground_out', { forceAtFirst: true, outs: 2 })).toBe(false);
    expect(isClosePlay('ground_out', { forceAtFirst: false, outs: 0 })).toBe(false);
    for (const o of ['line_out', 'popup', 'single', 'home_run', 'foul_out'] as const) {
      expect(isClosePlay(o, { forceAtFirst: true, outs: 0 }), o).toBe(false);
    }
  });
});
