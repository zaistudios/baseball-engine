/**
 * The strike zone as a 3x3 grid, and the sixth pitch.
 *
 * The one thing these tests exist to protect: the grid grew from five spots to
 * nine by ADDING corners, and the five that were already there must behave
 * EXACTLY as they did before. If that ever stops being true, every balance
 * number in scripts/balance.ts was measured against a different game.
 */

import { describe, expect, it } from 'vitest';
import { applyLocation, locationOffset, ALL_LOCATIONS, type PitchLocation } from '../hit.ts';
import { OUTCOME_TABLES, ALL_PITCH_TYPES, type Outcome, type OutcomeTable } from '../hitTables.ts';

/** A flat table, so a multiplier shows up as a plain ratio. */
const flat = (): OutcomeTable => ({
  strikeout: 1 / 9,
  popup: 1 / 9,
  ground_out: 1 / 9,
  line_out: 1 / 9,
  foul: 1 / 9,
  single: 1 / 9,
  double: 1 / 9,
  triple: 1 / 9,
  home_run: 1 / 9,
});

const sum = (t: OutcomeTable): number =>
  (Object.values(t) as number[]).reduce((a, b) => a + b, 0);

describe('the nine spots', () => {
  it('has nine, in reading order', () => {
    expect(ALL_LOCATIONS).toHaveLength(9);
    expect(ALL_LOCATIONS[0]).toBe('high_inside');
    expect(ALL_LOCATIONS[4]).toBe('middle');
    expect(ALL_LOCATIONS[8]).toBe('low_outside');
  });

  it('maps every spot to a distinct cell of the grid', () => {
    const cells = ALL_LOCATIONS.map((l) => {
      const { dx, dy } = locationOffset(l);
      return `${dx},${dy}`;
    });
    expect(new Set(cells).size).toBe(9);
  });

  it('puts middle dead centre and the corners on the diagonals', () => {
    expect(locationOffset('middle')).toEqual({ dx: 0, dy: 0 });
    expect(locationOffset('high_inside')).toEqual({ dx: -1, dy: -1 });
    expect(locationOffset('low_outside')).toEqual({ dx: 1, dy: 1 });
  });

  it('leaves a table alone in the middle', () => {
    const t = flat();
    expect(applyLocation(t, 'middle')).toBe(t);
  });

  // ⚠️ The golden test. These four ratios are the old switch statement, and
  // they are what every balance run was measured against.
  it('reproduces the original five exactly', () => {
    // Measured against `single`, which NO axis multiplies. Both start equal in
    // a flat table, so their ratio afterwards is the raw multiplier — and a
    // ratio is immune to the renormalise, which a bare value is not.
    const ratio = (l: PitchLocation, o: Outcome): number => {
      const after = applyLocation(flat(), l);
      return after[o] / after.single;
    };
    expect(ratio('high', 'home_run')).toBeCloseTo(1.4, 6);
    expect(ratio('high', 'ground_out')).toBeCloseTo(0.6, 6);
    expect(ratio('low', 'ground_out')).toBeCloseTo(1.4, 6);
    expect(ratio('low', 'home_run')).toBeCloseTo(0.3, 6);
    expect(ratio('inside', 'home_run')).toBeCloseTo(1.2, 6);
    expect(ratio('outside', 'home_run')).toBeCloseTo(0.8, 6);
    expect(ratio('outside', 'ground_out')).toBeCloseTo(1.1, 6);
  });

  it('composes the corners from the two axes', () => {
    const hr = (l: PitchLocation) => applyLocation(flat(), l).home_run;
    // Up and in is the pitch that gets hit out; down and away is the one that
    // gets beaten into the ground. Neither was expressible before.
    expect(hr('high_inside')).toBeGreaterThan(hr('high'));
    expect(hr('high')).toBeGreaterThan(hr('middle'));
    expect(hr('low_outside')).toBeLessThan(hr('low'));
    expect(applyLocation(flat(), 'low_outside').ground_out).toBeGreaterThan(
      applyLocation(flat(), 'low').ground_out,
    );
  });

  it('always hands back a normalised table', () => {
    for (const l of ALL_LOCATIONS) {
      expect(sum(applyLocation(flat(), l))).toBeCloseTo(1, 10);
    }
  });
});

describe('the sixth pitch', () => {
  it('is in the list exactly once', () => {
    expect(ALL_PITCH_TYPES).toHaveLength(6);
    expect(ALL_PITCH_TYPES.filter((t) => t === 'sinker')).toHaveLength(1);
  });

  /**
   * ⚠️ rollOutcome() treats missing mass as a SILENT fall-through to
   * ground_out, so a row summing to 0.999 quietly biases the game rather than
   * failing. This has already bitten once — see the note on OUTCOME_TABLES.
   */
  it('leaves every row in every table summing to exactly 1', () => {
    for (const [grade, byType] of Object.entries(OUTCOME_TABLES)) {
      for (const type of ALL_PITCH_TYPES) {
        expect(sum(byType[type]), `${grade}.${type}`).toBeCloseTo(1, 9);
      }
    }
  });

  it('is a ground-ball pitch — that is its whole identity', () => {
    const sinker = OUTCOME_TABLES.perfect.sinker;
    const fastball = OUTCOME_TABLES.perfect.fastball;
    expect(sinker.ground_out).toBeGreaterThan(fastball.ground_out);
    expect(sinker.home_run).toBeLessThan(fastball.home_run);
  });

  it('still rewards squaring one up, or nailing the timing would mean nothing', () => {
    expect(OUTCOME_TABLES.perfect.sinker.home_run).toBeGreaterThan(
      OUTCOME_TABLES.good.sinker.home_run,
    );
  });
});
