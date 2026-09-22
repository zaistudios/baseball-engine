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
import { chaseContact, resolveSwingSeeded, DEFAULT_STATS } from '../hit.ts';
import { grade, bandsFor, type TimingGrade } from '../timing.ts';

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

/**
 * ⚠️ THE RULE THIS SECTION GUARDS. The miss distance is allowed to move a
 * window edge and nothing else. If one of these ever has to be relaxed because
 * an outcome table moved, the factor has been put somewhere it does not belong.
 *
 * Written against grade() and bandsFor() rather than against hard-coded words,
 * because CHASE_COST is a tuning knob: the SHAPE is the contract and the number
 * is scripts/balance.ts's business.
 */
describe('chasing narrows the window, and only the window', () => {
  /** How the same swing is TIMED, at a given distance off the plate. */
  const gradeAt = (offsetMs: number, missDistance: number, contact = 1.0): TimingGrade =>
    grade(offsetMs, contact * chaseContact(missDistance), DEFAULT_STATS.vision);

  /** Where the whiff edge actually is, in ms, for that bat at that distance. */
  const whiffEdge = (missDistance: number, contact = 1.0): number =>
    bandsFor(contact * chaseContact(missDistance), DEFAULT_STATS.vision).contact;

  /** Worse is a bigger number. early and late are the same swing mistimed. */
  const RANK: Record<TimingGrade, number> = {
    perfect: 0,
    good: 1,
    early: 2,
    late: 2,
    miss: 3,
  };

  /** Swings with something to lose. Dead-on is the exception two tests down. */
  const OFFSETS = [20, 30, 45, 70];

  it('costs nothing on a strike', () => {
    expect(chaseContact(0)).toBe(1);
    expect(chaseContact()).toBe(1);
  });

  it('degrades the same swing as the pitch gets further off the plate', () => {
    for (const offsetMs of OFFSETS) {
      expect(RANK[gradeAt(offsetMs, MISS_DISTANCE_MAX)]).toBeGreaterThan(
        RANK[gradeAt(offsetMs, 0)],
      );
      // ...and it never improves in between, anywhere in the range.
      let worst = -1;
      for (let d = 0; d <= MISS_DISTANCE_MAX; d += 0.05) {
        const r = RANK[gradeAt(offsetMs, d)];
        expect(r).toBeGreaterThanOrEqual(worst);
        worst = r;
      }
    }
  });

  /** ⚠️ ZANE'S REQUIREMENT, WRITTEN AS A TEST. */
  it('leaves the good bat a window out there when the bad bat has none', () => {
    for (let d = 0; d <= MISS_DISTANCE_MAX; d += 0.05) {
      expect(whiffEdge(d, 1.35)).toBeGreaterThan(whiffEdge(d, 0.85));
    }
    // At the far end of the range that gap is the difference between a swing
    // and nothing at all — and the contact stat is the only thing that buys it.
    const past = whiffEdge(MISS_DISTANCE_MAX, 0.85) + 1;
    expect(gradeAt(past, MISS_DISTANCE_MAX, 0.85)).toBe('miss');
    expect(gradeAt(past, MISS_DISTANCE_MAX, 1.35)).not.toBe('miss');
  });

  /**
   * ⚠️ DECISION 2, AND THE THING THE FEATURE MUST NOT BREAK. Time one
   * dead-on off the plate and it can still leave the yard. The window is tiny;
   * it is never shut.
   */
  it('still grades a dead-on swing off the plate as perfect, at any distance', () => {
    for (let d = 0; d <= MISS_DISTANCE_MAX; d += 0.05) {
      expect(gradeAt(0, d)).toBe('perfect');
    }
  });

  it('can still hit a home run on a ball in the other batter’s box', () => {
    const homers = Array.from({ length: 400 }, (_, seed) =>
      resolveSwingSeeded(
        {
          offsetMs: 0,
          pitchType: 'fastball',
          location: 'outside',
          missDistance: MISS_DISTANCE_MAX,
          stats: { power: 1.2 },
        },
        seed,
      ),
    ).filter((h) => h.outcome === 'home_run');
    expect(homers.length).toBeGreaterThan(0);
  });

  /**
   * The negative half of the rule: hold the timing dead-on and the outcomes off
   * the plate are the SAME distribution, roll for roll, as the outcomes over
   * it. Chasing costs you the window, never the table you roll on once you are
   * through it. This is the test that fails the day somebody multiplies
   * OUTCOME_TABLES by the distance.
   */
  it('does not reshape the outcome table', () => {
    const roll = (missDistance: number) =>
      Array.from({ length: 500 }, (_, seed) =>
        resolveSwingSeeded(
          { offsetMs: 0, pitchType: 'fastball', location: 'outside', missDistance },
          seed,
        ).outcome,
      );
    expect(roll(MISS_DISTANCE_MAX)).toEqual(roll(0));
  });
});
