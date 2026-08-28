/**
 * Hub first-move #6, the QA agent's opening ticket:
 * "feed known swing offsets to grade() and assert the returned label."
 *
 * Each of the first three blocks is a regression test against a specific,
 * documented fault in the Godot prototype. A pass here is a measurable data
 * point for the experiment, not just a green tick - it is the
 * caught-the-old-bug result.
 */

import { describe, it, expect } from 'vitest';
import {
  grade,
  computeOffsetMs,
  isContact,
  medianOffset,
  MAX_CALIBRATION_MS,
  TIMING_WINDOWS_MS,
} from '../timing.ts';
import { OUTCOME_TABLES, ALL_PITCH_TYPES, ALL_OUTCOMES } from '../hitTables.ts';
import { resolveSwing, resolveSwingSeeded } from '../hit.ts';
import { makeRng, seedFromString } from '../rng.ts';

describe('FAULT 1 - early and late were inverted', () => {
  it('labels a negative offset early', () => {
    expect(grade(-50)).toBe('early');
  });

  it('labels a positive offset late', () => {
    expect(grade(50)).toBe('late');
  });

  it('never returns the same label for equal-and-opposite offsets in the early/late band', () => {
    // Only the outer band is directional. Offsets inside the good window are
    // symmetric by design - being 20ms off is the same swing either way.
    for (const ms of [36, 50, 79]) {
      expect(grade(-ms)).toBe('early');
      expect(grade(ms)).toBe('late');
      expect(grade(-ms)).not.toBe(grade(ms));
    }
  });

  it('keeps the inner windows symmetric', () => {
    for (const ms of [0, 5, 12, 20, 35]) {
      expect(grade(-ms)).toBe(grade(ms));
    }
  });

  it('reproduces the prototype bug when the old formula is used, and not otherwise', () => {
    // playercontroller.gd: timing_difference = swing_duration - 0.2
    // Swinging early makes the ball arrive later in the swing window, so
    // swing_duration GROWS and the value goes positive.
    const earlySwingDurationMs = 250; // ball met the bat late in the window
    const brokenOffset = earlySwingDurationMs - 200; // = +50 -> graded "late"
    expect(grade(brokenOffset)).toBe('late'); // the bug, preserved as evidence

    // The fix measures against ball arrival directly.
    const correctOffset = computeOffsetMs(1_000, 1_050); // swung 50ms before arrival
    expect(correctOffset).toBe(-50);
    expect(grade(correctOffset)).toBe('early');
  });
});

describe('FAULT 2 - the perfect window was narrower than the instrument', () => {
  it('has a perfect window wider than one 60Hz physics tick', () => {
    const tickMs = 1000 / 60; // 16.67ms - what the prototype sampled on
    expect(TIMING_WINDOWS_MS.perfect).toBeGreaterThan(tickMs / 2);
    // The old +/-5ms window was smaller than half a tick, so a swing could
    // land inside it and still be sampled outside it.
    expect(TIMING_WINDOWS_MS.perfect).toBeGreaterThan(5);
  });

  it('grades perfect across the full declared window', () => {
    for (const ms of [0, -12, 12, -11.9, 11.9]) {
      expect(grade(ms)).toBe('perfect');
    }
  });

  it('is reachable at realistic human precision', () => {
    // A player consistently within 10ms should be getting perfects.
    expect(grade(10)).toBe('perfect');
    expect(grade(-10)).toBe('perfect');
  });
});

describe('FAULT 3 - a miss grade with no outcome table behind it', () => {
  it('returns miss beyond the contact window instead of crashing', () => {
    expect(grade(200)).toBe('miss');
    expect(grade(-200)).toBe('miss');
    expect(grade(NaN)).toBe('miss');
  });

  it('has an outcome table for EVERY grade the grader can return', () => {
    // This is the assertion the GDScript could not make. hit_outcome_tables
    // had no "miss" key, so calculate_hit() did an invalid index the moment
    // the grader returned one.
    for (const ms of [0, -12, 12, -50, 50, -500, 500]) {
      const g = grade(ms);
      expect(OUTCOME_TABLES[g]).toBeDefined();
      for (const pitch of ALL_PITCH_TYPES) {
        expect(OUTCOME_TABLES[g][pitch]).toBeDefined();
      }
    }
  });

  it('resolves the whole late contact window without throwing', () => {
    // Prototype: bat hitbox live 0.15s-0.35s against a 0.2s target, so any
    // contact after 0.26s crashed - roughly 45% of the window.
    const rng = makeRng(1);
    for (let ms = -50; ms <= 150; ms += 1) {
      expect(() =>
        resolveSwing({ offsetMs: ms, pitchType: 'fastball' }, rng),
      ).not.toThrow();
    }
  });

  it('always strikes out on a miss', () => {
    const rng = makeRng(99);
    for (const pitch of ALL_PITCH_TYPES) {
      for (let i = 0; i < 50; i++) {
        const r = resolveSwing({ offsetMs: 500, pitchType: pitch }, rng);
        expect(r.timing).toBe('miss');
        expect(r.outcome).toBe('strikeout');
        expect(r.isHit).toBe(false);
      }
    }
  });
});

describe('contact stat widens the windows', () => {
  it('turns a good swing into a perfect one at high contact', () => {
    expect(grade(20)).toBe('good');
    expect(grade(20, 2.0)).toBe('perfect');
  });

  it('rescues a miss into contact', () => {
    expect(grade(100)).toBe('miss');
    expect(isContact(grade(100, 1.5))).toBe(true);
  });
});

describe('FAULT 4 - display latency biased every swing late', () => {
  it('is zero with nothing to go on', () => {
    expect(medianOffset([])).toBe(0);
    expect(medianOffset([NaN, Infinity])).toBe(0);
  });

  it('takes the median, not the mean, so one wild swing cannot move it', () => {
    const swings = [40, 42, 45, 44, 43, 41, 44, 300];
    const mean = swings.reduce((a, b) => a + b, 0) / swings.length;

    expect(mean).toBeGreaterThan(70); // what a mean would have believed
    expect(medianOffset(swings)).toBe(43.5);
  });

  it('clamps, so a garbage sample set cannot make the game unplayable', () => {
    expect(medianOffset([5000, 5000, 5000])).toBe(MAX_CALIBRATION_MS);
    expect(medianOffset([-5000, -5000, -5000])).toBe(-MAX_CALIBRATION_MS);
  });

  it('cancels a constant latency: swings graded late become good or better', () => {
    const LATENCY = 50;
    const arrival = 10_000;

    // A player swinging honestly, within +/-8ms of what they SAW, on a display
    // that is 50ms behind the clock the game grades against.
    const humanError = [0, 6, -5, 3, -7, 2, 8, -3, 4, -6];
    const swings = humanError.map((e) => arrival + LATENCY + e);

    // Before: every one of them reads late, and some miss outright.
    for (const at of swings) {
      expect(grade(computeOffsetMs(at, arrival))).toBe('late');
    }

    // After: grade against arrival as the player's eyes saw it.
    const correction = medianOffset(swings.map((at) => computeOffsetMs(at, arrival)));
    // Recovers the latency to within the player's own jitter, which is the
    // most any estimate built from human swings can promise.
    expect(Math.abs(correction - LATENCY)).toBeLessThan(5);

    for (const at of swings) {
      expect(isContact(grade(computeOffsetMs(at, arrival + correction)))).toBe(true);
      expect(grade(computeOffsetMs(at, arrival + correction))).not.toBe('late');
    }
  });
});

describe('outcome tables are well formed', () => {
  it('every table sums to 1.0', () => {
    for (const g of Object.keys(OUTCOME_TABLES) as (keyof typeof OUTCOME_TABLES)[]) {
      for (const pitch of ALL_PITCH_TYPES) {
        const total = Object.values(OUTCOME_TABLES[g][pitch]).reduce((a, b) => a + b, 0);
        expect(total).toBeCloseTo(1.0, 6);
      }
    }
  });

  it('every table lists all nine outcomes explicitly', () => {
    for (const g of Object.keys(OUTCOME_TABLES) as (keyof typeof OUTCOME_TABLES)[]) {
      for (const pitch of ALL_PITCH_TYPES) {
        expect(Object.keys(OUTCOME_TABLES[g][pitch]).sort()).toEqual([...ALL_OUTCOMES].sort());
      }
    }
  });

  it('keeps the honest baseball number: perfect timing still gets caught', () => {
    // The design line worth protecting - perfect contact on a fastball is
    // out ~20% of the time. If this ever reads 0, the game got arcade-y by
    // accident rather than by decision.
    const p = OUTCOME_TABLES.perfect.fastball;
    expect(p.popup + p.ground_out + p.line_out).toBeCloseTo(0.2, 6);
    expect(p.strikeout).toBe(0);
  });
});

describe('seeded RNG - the experiment depends on this', () => {
  it('same seed gives the same sequence', () => {
    const a = makeRng(12345);
    const b = makeRng(12345);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('different seeds diverge', () => {
    expect(makeRng(1).next()).not.toBe(makeRng(2).next());
  });

  it('stays in [0, 1)', () => {
    const rng = makeRng(7);
    for (let i = 0; i < 10_000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('makes a whole at-bat reproducible', () => {
    const input = { offsetMs: -8, pitchType: 'curveball' as const, isPowerSwing: true };
    expect(resolveSwingSeeded(input, 4242)).toEqual(resolveSwingSeeded(input, 4242));
  });

  it('derives a stable seed from a run string', () => {
    expect(seedFromString('rookie-randy-run-1')).toBe(seedFromString('rookie-randy-run-1'));
    expect(seedFromString('a')).not.toBe(seedFromString('b'));
  });

  describe('restoring mid-stream — what a save file rests on', () => {
    it('picks up exactly where the saved generator left off', () => {
      // THE claim behind save/resume: a resumed run rolls the numbers the
      // unsaved run would have rolled. If this ever fails, reloading silently
      // rerolls the season and the save is a lie.
      const live = makeRng(999);
      for (let i = 0; i < 37; i++) live.next();
      const saved = live.state();

      const resumed = makeRng(0, saved);
      const a = Array.from({ length: 50 }, () => live.next());
      const b = Array.from({ length: 50 }, () => resumed.next());
      expect(b).toEqual(a);
    });

    it('ignores the seed entirely when a state is given', () => {
      // resumeRun() passes makeRng(0, state) — the original seed is not stored
      // and must not be needed.
      const src = makeRng(4242);
      src.next();
      const s = src.state();
      expect(makeRng(0, s).next()).toBe(makeRng(123456, s).next());
    });

    it('still starts from the seed when no state is given', () => {
      expect(makeRng(77).next()).toBe(makeRng(77, undefined).next());
    });

    it('survives a state round-tripped through JSON', () => {
      // The save file is JSON in localStorage, so the state has to come back
      // as the same 32-bit word it went in as.
      const src = makeRng(31337);
      for (let i = 0; i < 12; i++) src.next();
      const json = JSON.parse(JSON.stringify({ rng: src.state() })) as { rng: number };
      expect(makeRng(0, json.rng).next()).toBe(makeRng(0, src.state()).next());
    });
  });
});

describe('resolveSwing distribution sanity', () => {
  it('perfect timing beats late timing over a large sample', () => {
    const rng = makeRng(2026);
    let perfectHits = 0;
    let lateHits = 0;
    const N = 20_000;
    for (let i = 0; i < N; i++) {
      if (resolveSwing({ offsetMs: 0, pitchType: 'fastball' }, rng).isHit) perfectHits++;
      if (resolveSwing({ offsetMs: 50, pitchType: 'fastball' }, rng).isHit) lateHits++;
    }
    expect(perfectHits / N).toBeGreaterThan(0.6);
    expect(lateHits / N).toBeLessThan(0.2);
  });

  it('power swing raises home run rate and strikeout rate together', () => {
    const rng = makeRng(31337);
    const N = 20_000;
    let normalHr = 0;
    let powerHr = 0;
    let normalK = 0;
    let powerK = 0;
    for (let i = 0; i < N; i++) {
      const n = resolveSwing({ offsetMs: 0, pitchType: 'fastball' }, rng);
      const p = resolveSwing({ offsetMs: 0, pitchType: 'fastball', isPowerSwing: true }, rng);
      if (n.outcome === 'home_run') normalHr++;
      if (p.outcome === 'home_run') powerHr++;
      if (n.outcome === 'strikeout') normalK++;
      if (p.outcome === 'strikeout') powerK++;
    }
    expect(powerHr).toBeGreaterThan(normalHr);
    expect(powerK).toBeGreaterThanOrEqual(normalK);
  });
});
