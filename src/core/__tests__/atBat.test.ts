/**
 * The count rules. The one that matters is the whiff/strikeout split - the
 * outcome tables say 'strikeout' in four different places and only one of
 * them ends the at-bat.
 */

import { describe, it, expect } from 'vitest';
import { newAtBat, takePitch, swingAt, isOver, type AtBatState } from '../atBat.ts';
import { makeRng } from '../rng.ts';
import { ballArrivalMs, computeOffsetMs, grade } from '../timing.ts';

/** A swing that whiffs: the miss table is strikeout 1.0 on every pitch type. */
const whiff = { offsetMs: 500, pitchType: 'fastball' } as const;
/** Dead-on fastball, middle-middle - the perfect table cannot return a K. */
const crushed = { offsetMs: 0, pitchType: 'fastball' } as const;

const takeAll = (n: number, inZone: boolean): AtBatState => {
  let s = newAtBat();
  for (let i = 0; i < n; i++) s = takePitch(s, inZone);
  return s;
};

describe('taking pitches', () => {
  it('walks on four balls', () => {
    const s = takeAll(4, false);
    expect(s.result).toEqual({ kind: 'walk' });
  });

  it('does not walk on three', () => {
    expect(isOver(takeAll(3, false))).toBe(false);
  });

  it('strikes out looking on three strikes', () => {
    expect(takeAll(3, true).result).toEqual({ kind: 'strikeout' });
  });
});

describe('a whiff is a strike, not a strikeout', () => {
  it('leaves the at-bat live on the first two whiffs', () => {
    const rng = makeRng(1);
    let s = swingAt(newAtBat(), whiff, rng);
    expect(s.strikes).toBe(1);
    expect(isOver(s)).toBe(false);

    s = swingAt(s, whiff, rng);
    expect(s.strikes).toBe(2);
    expect(isOver(s)).toBe(false);
  });

  it('ends it on the third', () => {
    const rng = makeRng(1);
    let s = newAtBat();
    for (let i = 0; i < 3; i++) s = swingAt(s, whiff, rng);
    expect(s.result).toEqual({ kind: 'strikeout' });
  });

  it('refuses to accept a pitch after the at-bat ended', () => {
    const s = takeAll(3, true);
    expect(() => takePitch(s, true)).toThrow(/already ended/);
  });
});

describe('hit by pitch', () => {
  it('ends the at-bat at any count, not just a full one', () => {
    for (const [balls, strikes] of [[0, 0], [3, 2], [0, 2]] as const) {
      const s = takePitch({ balls, strikes }, false, true);
      expect(s.result).toEqual({ kind: 'hit_by_pitch' });
    }
  });

  it('is not a ball — the count does not move', () => {
    const s = takePitch({ balls: 1, strikes: 1 }, false, true);
    expect(s.balls).toBe(1);
    expect(s.strikes).toBe(1);
  });

  it('leaves an ordinary take alone', () => {
    expect(takePitch(newAtBat(), false).result).toBeUndefined();
    expect(takePitch(newAtBat(), false, false).balls).toBe(1);
  });
});

describe('fouls', () => {
  it('adds a strike below two, and never becomes the third', () => {
    // Search seeds for a foul rather than stubbing the tables - the point is
    // that a real roll routes correctly.
    const foulSeed = findSeed('foul');
    let s = swingAt(newAtBat(), { offsetMs: 40, pitchType: 'fastball' }, makeRng(foulSeed));
    expect(s.strikes).toBe(1);

    s = { balls: 0, strikes: 2 };
    s = swingAt(s, { offsetMs: 40, pitchType: 'fastball' }, makeRng(foulSeed));
    expect(s.strikes).toBe(2);
    expect(isOver(s)).toBe(false);
  });
});

describe('balls in play', () => {
  it('ends the at-bat and carries the hit through', () => {
    const s = swingAt(newAtBat(), crushed, makeRng(7));
    expect(s.result?.kind).toBe('in_play');
    if (s.result?.kind === 'in_play') {
      expect(s.result.hit.timing).toBe('perfect');
    }
  });
});

describe('ballArrivalMs closes the clock loop', () => {
  it('grades a swing timed off a real pitch launch', () => {
    const launch = 10_000;
    const arrival = ballArrivalMs(launch, 95);
    // ~55ft at 95mph is a shade under 400ms of flight.
    expect(arrival - launch).toBeGreaterThan(350);
    expect(arrival - launch).toBeLessThan(450);
    expect(grade(computeOffsetMs(arrival + 5, arrival))).toBe('perfect');
    expect(grade(computeOffsetMs(arrival - 50, arrival))).toBe('early');
  });

  it('makes a slower pitch arrive later', () => {
    expect(ballArrivalMs(0, 75)).toBeGreaterThan(ballArrivalMs(0, 95));
  });
});

function findSeed(want: string): number {
  for (let seed = 1; seed < 500; seed++) {
    const s = swingAt(newAtBat(), { offsetMs: 40, pitchType: 'fastball' }, makeRng(seed));
    if (s.strikes === 1 && !isOver(s)) {
      // strikes===1 with a live at-bat is either a whiff or a foul; separate
      // them by re-rolling the same seed through the resolver.
      const again = swingAt({ balls: 0, strikes: 2 }, { offsetMs: 40, pitchType: 'fastball' }, makeRng(seed));
      const wasFoul = again.strikes === 2 && !isOver(again);
      if ((want === 'foul') === wasFoul) return seed;
    }
  }
  throw new Error(`no seed produced a ${want}`);
}
