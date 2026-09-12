/**
 * THE SWING WINDOW, AND THE CLOCK IT IS MEASURED AGAINST.
 *
 * Two claims are worth locking here and the second one is the important one:
 * that the assist changes which grade a swing earns and NOTHING else, and that
 * the calibration cancels a bias instead of chasing it. Both are the kind of
 * thing that looks right in a screenshot and is wrong over a season.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { grade, medianOffset, MAX_CALIBRATION_MS, TIMING_WINDOWS_MS } from '../../core/timing.ts';
import { resolveSwing, type SwingInput } from '../../core/hit.ts';
import { makeRng } from '../../core/rng.ts';
import {
  LEVELS,
  MIN_SAMPLES,
  PITCH_SPEEDS,
  SLOWEST_PITCH,
  WINDOW,
  calibrationLabel,
  defaults,
  levelOf,
  loadSettings,
  newCalibration,
  observe,
  pitchSpeedOf,
  SANE_SAMPLE_MS,
  saveSettings,
} from '../difficulty.ts';

describe('the three levels', () => {
  it('leaves VETERAN at exactly the game that was balanced', () => {
    // ⚠️ If this ever moves, every measured number in this project's notes —
    // separation, win-rate spread, runs per game — was taken against a
    // different game than the one shipping.
    expect(levelOf('veteran').assist).toBe(1);
  });

  it('runs easy to hard and answers to an unknown key with the middle one', () => {
    expect(levelOf('rookie').assist).toBeGreaterThan(1);
    expect(levelOf('allstar').assist).toBeLessThan(1);
    expect(levelOf('nonsense')).toBe(levelOf('veteran'));
    expect(LEVELS.map((l) => l.key)).toEqual(['rookie', 'veteran', 'allstar']);
  });

  it('widens the window it claims to widen', () => {
    // A swing 50ms late: past VETERAN's 35ms 'good', inside ROOKIE's 56.
    const late = 50;
    expect(grade(late, levelOf('veteran').assist)).toBe('late');
    expect(grade(late, levelOf('rookie').assist)).toBe('good');
    // And a swing 30ms out is 'good' at VETERAN but not at ALL-STAR.
    expect(grade(30, levelOf('veteran').assist)).toBe('good');
    expect(grade(30, levelOf('allstar').assist)).toBe('late');
  });
});

describe('the assist reaches the outcome, not just the word on screen', () => {
  const swing = (assist: number | undefined, offsetMs: number): SwingInput => ({
    offsetMs,
    pitchType: 'fastball',
    stats: { power: 1, contact: 1, vision: 1, clutch: 1, bunt: 1, speed: 1 },
    ...(assist === undefined ? {} : { assist }),
  });

  it('turns a swing that was a miss into contact', () => {
    // 100ms out is past the 80ms contact boundary at VETERAN and inside it at
    // ROOKIE. The at-bat, not just the label, has to agree.
    const hard = resolveSwing(swing(1, 100), makeRng(1));
    const easy = resolveSwing(swing(1.6, 100), makeRng(1));
    expect(hard.timing).toBe('miss');
    expect(easy.timing).not.toBe('miss');
  });

  it('is one when nobody passes it, which is every computer swing', () => {
    // sim.ts never sets it. A missing assist must be the balanced game, or the
    // opposition quietly inherits the player's difficulty setting.
    const withOut = resolveSwing(swing(undefined, 100), makeRng(2));
    const explicit = resolveSwing(swing(1, 100), makeRng(2));
    expect(withOut.timing).toBe(explicit.timing);
    expect(withOut.outcome).toBe(explicit.outcome);
  });

  it('does not make the bat better, only the window wider', () => {
    // ⚠️ THE CLAIM THE WHOLE DESIGN RESTS ON. A dead-on swing is already
    // 'perfect' at every level, so the assist has nothing to widen — and if it
    // leaked into power or the outcome tables, these two would differ.
    const a = resolveSwing(swing(1, 0), makeRng(7));
    const b = resolveSwing(swing(1.6, 0), makeRng(7));
    expect(a.timing).toBe('perfect');
    expect(b.timing).toBe('perfect');
    expect(a.outcome).toBe(b.outcome);
    expect(a.exitVelocity).toBeCloseTo(b.exitVelocity);
  });
});

describe('calibration', () => {
  it('applies nothing until it has seen enough swings', () => {
    let c = newCalibration();
    for (let i = 0; i < MIN_SAMPLES - 1; i++) c = observe(c, 60);
    // Eleven swings all 60ms late and the correction is still zero: a median
    // that lurched after three samples would be a moving target to learn.
    expect(c.shift).toBe(0);
    expect(calibrationLabel(c)).toContain(`${MIN_SAMPLES - 1}/${MIN_SAMPLES}`);

    c = observe(c, 60);
    expect(c.shift).toBe(60);
    expect(calibrationLabel(c)).toBe('calibrated +60ms');
  });

  it('cancels the bias rather than chasing it', () => {
    // ⚠️ THE FAILURE MODE THIS EXISTS TO PREVENT. A player whose display is
    // 50ms behind swings "perfectly" and is measured 50ms late every time. The
    // correction has to land at 50 and STAY there — which it only does because
    // the samples are raw. Feed it corrected offsets and it walks to zero and
    // hands the player his lag back.
    let c = newCalibration();
    const arrival = 1000;
    for (let i = 0; i < 30; i++) {
      const swungAt = arrival + 50; // he is late by exactly the display lag
      c = observe(c, swungAt - arrival);
      // What the at-bat is actually graded on, with the correction applied:
      expect(grade(swungAt - (arrival + c.shift))).toBe(
        c.shift === 0 ? 'late' : 'perfect',
      );
    }
    expect(c.shift).toBe(50);
  });

  it('is not moved by one wild hack at a pitch already given up on', () => {
    let c = newCalibration();
    for (let i = 0; i < 20; i++) c = observe(c, 40);
    c = observe(c, 400);
    // A mean would be dragged 17ms by that one swing. A median does not move.
    expect(c.shift).toBe(40);
  });

  it('forgets old monitors', () => {
    let c = newCalibration();
    for (let i = 0; i < WINDOW; i++) c = observe(c, 80);
    expect(c.shift).toBe(80);
    for (let i = 0; i < WINDOW; i++) c = observe(c, 0);
    expect(c.samples).toHaveLength(WINDOW);
    expect(c.shift).toBe(0);
  });

  it('throws away a swing that was not a swing at a pitch', () => {
    // ⚠️ THE REAL CASE, and it was caught by hitting it: a background tab stops
    // getting animation frames, the ball's arrival goes by while the loop is
    // asleep, and the next click reports a five-second offset. One of those
    // cannot move a median — twenty of them can, and this game is meant to be
    // played in a tab somebody keeps switching away from.
    let c = newCalibration();
    for (let i = 0; i < MIN_SAMPLES * 2; i++) c = observe(c, 4834.33);
    expect(c.samples).toHaveLength(0);
    expect(c.shift).toBe(0);

    // A real late hack still counts. The bar is well outside human range.
    expect(observe(newCalibration(), 300).samples).toHaveLength(1);
    expect(observe(newCalibration(), -SANE_SAMPLE_MS).samples).toHaveLength(1);
    expect(observe(newCalibration(), SANE_SAMPLE_MS + 1).samples).toHaveLength(0);
  });

  it('cannot be handed a number that makes the game unplayable', () => {
    let c = newCalibration();
    for (let i = 0; i < MIN_SAMPLES; i++) c = observe(c, MAX_CALIBRATION_MS * 3);
    expect(Math.abs(c.shift)).toBeLessThanOrEqual(MAX_CALIBRATION_MS);
    // ...and garbage never enters the record at all.
    const before = c.samples.length;
    expect(observe(c, NaN).samples).toHaveLength(before);
  });

  it('says nothing loud when there is nothing to correct', () => {
    let c = newCalibration();
    for (let i = 0; i < MIN_SAMPLES; i++) c = observe(c, 1);
    expect(calibrationLabel(c)).toBe('calibrated · no lag');
  });
});

describe('the windows themselves are untouched', () => {
  it('still reads 12 / 35 / 80, because the levels scale them rather than replace them', () => {
    // The assist multiplies; it does not rewrite. If somebody ever "fixes"
    // difficulty by editing these three numbers, VETERAN stops being the
    // balanced game and this says so.
    expect(TIMING_WINDOWS_MS).toEqual({ perfect: 12, good: 35, contact: 80 });
    expect(medianOffset([])).toBe(0);
  });
});

/**
 * THE PRACTICE SPEED, and the one thing it must not quietly be.
 *
 * Slowing the ball down buys a hitter READING time. It must not buy him a
 * wider window — that is what the assist is for, they are separate knobs, and
 * a "slow" setting that also forgave a bad swing would make every balance
 * number in this project's notes a number about a different game.
 */
describe('the pitch speed', () => {
  it('starts at the game that was balanced, and only ever goes slower', () => {
    expect(PITCH_SPEEDS[0]!.value).toBe(1);
    expect(defaults().pitchSpeed).toBe(1);
    for (const s of PITCH_SPEEDS) {
      expect(s.value).toBeGreaterThanOrEqual(SLOWEST_PITCH);
      expect(s.value).toBeLessThanOrEqual(1);
    }
    // Strictly descending, so the P key walks one direction and the label
    // never says SLOW for something faster than EASED.
    const values = PITCH_SPEEDS.map((s) => s.value);
    expect([...values].sort((a, b) => b - a)).toEqual(values);
  });

  it('carries nothing that could reach grade()', () => {
    // ⚠️ THE CLAIM, ENFORCED STRUCTURALLY RATHER THAN BY CARE. A Level carries
    // `assist` and that multiplier lands in grade(); a PitchSpeed carries a
    // number that lands in ball FLIGHT and must never land anywhere else. The
    // failure this guards is somebody "fixing" a too-hard cage by giving
    // PitchSpeed an assist of its own — at which point SLOW would quietly be a
    // difficulty and every balance number in this project's notes would be a
    // number about a different game.
    for (const s of PITCH_SPEEDS) {
      expect(Object.keys(s).sort()).toEqual(['blurb', 'name', 'value']);
    }
    expect(LEVELS.some((l) => 'assist' in l)).toBe(true);
    expect(TIMING_WINDOWS_MS).toEqual({ perfect: 12, good: 35, contact: 80 });
  });

  it('answers to a value that is not on the menu with the one that is', () => {
    expect(pitchSpeedOf(1).name).toBe('FULL');
    expect(pitchSpeedOf(0.62)).toBe(PITCH_SPEEDS[0]);
  });
});

describe('holding the calibration still', () => {
  it('says so out loud, and only once there is something to hold', () => {
    let c = newCalibration();
    // ⚠️ PAUSED, NOT SILENT. Holding before the twelfth swing stops the tally
    // where it stands, and an unlabelled frozen counter is a progress bar that
    // quietly gave up — a player waits for a number that will never move.
    expect(calibrationLabel(c, false)).toBe(`calibrating 0/${MIN_SAMPLES}`);
    expect(calibrationLabel(c, true)).toBe(`calibrating 0/${MIN_SAMPLES} · paused`);

    for (let i = 0; i < MIN_SAMPLES; i++) c = observe(c, 40);
    expect(calibrationLabel(c, false)).toBe('calibrated +40ms');
    expect(calibrationLabel(c, true)).toBe('calibrated +40ms · held');

    let quiet = newCalibration();
    for (let i = 0; i < MIN_SAMPLES; i++) quiet = observe(quiet, 1);
    expect(calibrationLabel(quiet, true)).toBe('calibrated · no lag · held');
  });

  it('is off by default, so a first-time player gets the fix without finding it', () => {
    expect(defaults().holdCalibration).toBe(false);
  });
});

/**
 * OFF DISK. loadSettings() is the only thing standing between a hand-edited
 * file and an unplayable game, and it grew three fields it did not have.
 */
describe('what survives a round trip', () => {
  function fakeStorage() {
    const map = new Map<string, string>();
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
      get length() {
        return map.size;
      },
      key: (i: number) => [...map.keys()][i] ?? null,
      clear: () => map.clear(),
    };
  }

  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeStorage());
  });

  it('hands back exactly what was filed', () => {
    let c = newCalibration();
    for (let i = 0; i < MIN_SAMPLES; i++) c = observe(c, 25);
    const written = {
      level: 'allstar',
      calibration: c,
      pitchSpeed: 0.7,
      holdCalibration: true,
    };
    saveSettings(written);
    const read = loadSettings();
    expect(read.level).toBe('allstar');
    expect(read.pitchSpeed).toBe(0.7);
    expect(read.holdCalibration).toBe(true);
    expect(read.calibration.shift).toBe(25);
  });

  it('gives a file written before any of this existed the defaults', () => {
    // ⚠️ THE UPGRADE PATH, and it is the one anybody with a saved game is on.
    // An old blob has a level and a calibration and nothing else; the three new
    // fields have to arrive at their defaults rather than as undefined, or the
    // ball arrives at `flight / NaN` and never gets to the plate.
    localStorage.setItem('asb-timing', JSON.stringify({ level: 'rookie' }));
    const read = loadSettings();
    expect(read.level).toBe('rookie');
    expect(read.pitchSpeed).toBe(1);
    expect(read.holdCalibration).toBe(false);
  });

  it('refuses a speed that would stop the ball arriving at all', () => {
    // Every one of these is a real shape a hand-edited or corrupted file takes,
    // and each of them divides the flight into something unplayable.
    for (const bad of [0, -1, NaN, Infinity, 'slow', null, undefined]) {
      localStorage.setItem('asb-timing', JSON.stringify({ pitchSpeed: bad }));
      expect(loadSettings().pitchSpeed).toBe(1);
    }
    // Out of range in the playable direction is clamped, not discarded — 0.62
    // is a perfectly good game and there is no reason to throw it away.
    localStorage.setItem('asb-timing', JSON.stringify({ pitchSpeed: 0.62 }));
    expect(loadSettings().pitchSpeed).toBe(0.62);
    localStorage.setItem('asb-timing', JSON.stringify({ pitchSpeed: 0.01 }));
    expect(loadSettings().pitchSpeed).toBe(SLOWEST_PITCH);
    // Nothing may make the ball arrive FASTER than the balanced game.
    localStorage.setItem('asb-timing', JSON.stringify({ pitchSpeed: 4 }));
    expect(loadSettings().pitchSpeed).toBe(1);
  });

  it('reads a garbage file as a fresh one', () => {
    localStorage.setItem('asb-timing', 'not json {');
    expect(loadSettings()).toEqual(defaults());
  });
});
