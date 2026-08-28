import { describe, it, expect } from 'vitest';
import {
  rollFielding,
  doublePlayChance,
  CLEAN,
  DOUBLE_PLAY_RATE,
  ERROR_RATE,
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
