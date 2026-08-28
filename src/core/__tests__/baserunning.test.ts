/**
 * Stealing — the foundation, and only the foundation. See baserunning.ts for
 * the eight systems deliberately not here.
 */

import { describe, it, expect } from 'vitest';
import { attemptSteal, stealChance, STEAL_BASE_RATE } from '../baserunning.ts';
import { makeRng } from '../rng.ts';
import {
  newMatch,
  recordAtBat,
  moveRunner,
  removeRunner,
  occupied,
  type Bases,
  type Runner,
} from '../inning.ts';
import { POOL } from '../roster.ts';

const burner: Runner = { name: 'Orbital Pete', speed: 1.5 };
const anchor: Runner = { name: 'The Gantry', speed: 0.6 };

describe('speed is what decides it', () => {
  it('makes a fast runner likelier than a slow one', () => {
    expect(stealChance(burner.speed, 1)).toBeGreaterThan(stealChance(anchor.speed, 1));
  });

  it('makes third harder than second for the same runner', () => {
    expect(stealChance(1.0, 2)).toBeLessThan(stealChance(1.0, 1));
  });

  it('is never a certainty and never hopeless', () => {
    for (const speed of [0, 0.1, 1, 3, 99]) {
      for (const base of [1, 2]) {
        expect(stealChance(speed, base)).toBeGreaterThanOrEqual(0.05);
        expect(stealChance(speed, base)).toBeLessThanOrEqual(0.95);
      }
    }
  });

  it('sits near the real stolen-base rate at average speed', () => {
    // Real MLB success is about 75% — often right, never safe.
    expect(stealChance(1.0, 1)).toBeCloseTo(STEAL_BASE_RATE, 5);
    expect(stealChance(1.0, 1)).toBeGreaterThan(0.6);
    expect(stealChance(1.0, 1)).toBeLessThan(0.85);
  });

  it('actually succeeds more often for the burner over many attempts', () => {
    const rate = (speed: number) => {
      const rng = makeRng(4);
      let safe = 0;
      for (let i = 0; i < 2000; i++) if (attemptSteal(speed, 1, rng).safe) safe++;
      return safe / 2000;
    };
    expect(rate(burner.speed)).toBeGreaterThan(rate(anchor.speed));
  });

  it('replays identically from the same seed', () => {
    const go = () => attemptSteal(1.1, 1, makeRng(88));
    expect(go()).toEqual(go());
  });
});

describe('moving runners on the bases', () => {
  const onFirst: Bases = [burner, null, null];

  it('takes the next bag and leaves the old one empty', () => {
    const after = moveRunner(onFirst, 0);
    expect(occupied(after)).toEqual([false, true, false]);
    expect(after[1]).toBe(burner);
  });

  it('erases the runner when caught', () => {
    expect(occupied(removeRunner(onFirst, 0))).toEqual([false, false, false]);
  });

  it('keeps the runner identity, which is the whole reason for the refactor', () => {
    const after = moveRunner([anchor, null, null], 0);
    expect(after[1]?.name).toBe('The Gantry');
    expect(after[1]?.speed).toBe(0.6);
  });
});

describe('runners reach base as themselves', () => {
  it('puts the batter on first by name, not as a boolean', () => {
    const m = recordAtBat(newMatch(1), { kind: 'walk' }, burner);
    expect(m.bases[0]?.name).toBe('Orbital Pete');
  });

  it('only forces the runners it has to on a walk', () => {
    // Man on second, first open: he does NOT move.
    const m = { ...newMatch(1), bases: [null, anchor, null] as Bases };
    const after = recordAtBat(m, { kind: 'walk' }, burner);
    expect(after.bases[0]?.name).toBe('Orbital Pete');
    expect(after.bases[1]?.name).toBe('The Gantry');
  });

  it('gives every player in the pool a speed to steal on', () => {
    for (const p of POOL) {
      expect(p.speed).toBeGreaterThan(0);
      expect(p.speed).toBeLessThan(2);
    }
    // And they are not all the same, or the stat would be decoration.
    expect(new Set(POOL.map((p) => p.speed)).size).toBeGreaterThan(4);
  });
});
