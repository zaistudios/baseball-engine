/**
 * CHASING COSTS A NARROWER WINDOW.
 *
 * A ball off the plate is still hittable — it just has to be timed better, and
 * the further off it is the better. The whole feature is one continuous number
 * born at the pitch and multiplied into the contact stat at the swing, so this
 * file only has two things to prove: the number is a real range rather than a
 * constant in disguise, and it lands on the TIMING bands and nowhere else.
 */

import { describe, it, expect } from 'vitest';
import {
  throwPitch,
  pitchToSpot,
  pitcherFor,
  MISS_DISTANCE_MIN,
  MISS_DISTANCE_MAX,
  type Count,
  type Situation,
} from '../pitcher.ts';
import { makeRng } from '../rng.ts';

const NEUTRAL: Count = { balls: 0, strikes: 0 };
const NOWHERE: Situation = {};

/** Every miss distance the computer's arm produced over n pitches. */
function computerMisses(n = 1200, seed = 11): number[] {
  const rng = makeRng(seed);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = throwPitch(pitcherFor('splice', 4), NEUTRAL, NOWHERE, rng);
    if (!p.inZone) out.push(p.missDistance ?? -1);
  }
  return out;
}

/** The same, for the pitch you called yourself. */
function yourMisses(n = 1200, seed = 5): number[] {
  const rng = makeRng(seed);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = pitchToSpot(pitcherFor('holdouts', 1), 'fastball', 'low_outside', rng, {
      control: 0.5,
    });
    if (!p.inZone) out.push(p.missDistance ?? -1);
  }
  return out;
}

describe('the pitch carries how far off the plate it missed', () => {
  it('is zero on a strike, from both producers', () => {
    const rng = makeRng(31);
    let strikes = 0;
    for (let i = 0; i < 600; i++) {
      const a = throwPitch(pitcherFor('splice', 4), NEUTRAL, NOWHERE, rng);
      const b = pitchToSpot(pitcherFor('holdouts', 1), 'fastball', 'middle', rng);
      for (const p of [a, b]) {
        if (p.inZone) {
          strikes++;
          expect(p.missDistance).toBe(0);
        }
      }
    }
    // Guard against the assertion above never running.
    expect(strikes).toBeGreaterThan(200);
  });

  it('stays inside the stated range off the plate', () => {
    for (const misses of [computerMisses(), yourMisses()]) {
      expect(misses.length).toBeGreaterThan(100);
      for (const d of misses) {
        expect(d).toBeGreaterThanOrEqual(MISS_DISTANCE_MIN);
        expect(d).toBeLessThanOrEqual(MISS_DISTANCE_MAX);
      }
    }
  });

  /**
   * ⚠️ THE TEST THIS FILE EXISTS FOR. The renderer's old 0.78 was one constant
   * pretending to be a location, and a coarse three-bucket replacement would be
   * the same failure with more code. Both ends of the range have to be ORDINARY
   * — a pitch nicking the black and a pitch nobody could reach.
   */
  it('nicks the black often and misses badly often, from both producers', () => {
    for (const misses of [computerMisses(), yourMisses()]) {
      const near = misses.filter((d) => d < 0.3).length / misses.length;
      const wild = misses.filter((d) => d > 0.7).length / misses.length;
      expect(near).toBeGreaterThan(0.15);
      expect(wild).toBeGreaterThan(0.15);
      // ...and it is genuinely continuous, not three values wearing a range.
      expect(new Set(misses.map((d) => d.toFixed(3))).size).toBeGreaterThan(100);
    }
  });
});
