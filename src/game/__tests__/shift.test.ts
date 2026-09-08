import { describe, expect, it } from 'vitest';
import { FIELDERS, nearestFielder } from '../../web/plot.ts';
import { SHIFTS, SHIFT_ON, fieldersFor, pickShift, pullScore } from '../shift.ts';
import { LEAGUE } from '../teams.ts';
import type { Player } from '../../core/roster.ts';

const at = (fs: readonly { num: number; distFt: number; dirDeg: number }[], num: number) =>
  fs.find((f) => f.num === num)!;

/** A hitter with only the fields the shift reads. */
const hitter = (bats: 'L' | 'R', power: number, contact: number): Player =>
  ({ name: 'test', bats, power, contact } as Player);

describe('where the nine stand', () => {
  it('leaves standard depth completely alone', () => {
    // Identity, not deep equality: the default path must not allocate, and
    // "did anything move" is a === away for every caller.
    expect(fieldersFor('straight')).toBe(FIELDERS);
  });

  it('never moves the pitcher or the catcher', () => {
    for (const shift of SHIFTS) {
      const f = fieldersFor(shift);
      expect(at(f, 1)).toEqual(at(FIELDERS, 1));
      expect(at(f, 2)).toEqual(at(FIELDERS, 2));
    }
  });

  it('keeps all nine, once each, in every alignment', () => {
    for (const shift of SHIFTS) {
      const nums = fieldersFor(shift).map((f) => f.num);
      expect([...nums].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    }
  });

  it('leans the infield toward the field the hitter pulls to', () => {
    // ⚠️ A LEAN, NOT A STACK, AND THE MEASUREMENT IS WHY. The stacked version —
    // three men on one side of second — put runs per team at 4.53 against a
    // 4.41 baseline, because the side it vacated was worth more than the side
    // it covered. See the balance note at the top of shift.ts.
    //
    // So the invariant is the CENTRE OF MASS of the four infielders, not a
    // count of who is on which side of the bag.
    const centre = (shift: Parameters<typeof fieldersFor>[0]) => {
      const inf = fieldersFor(shift).filter((f) => f.num >= 3 && f.num <= 6);
      return inf.reduce((a, f) => a + f.dirDeg, 0) / inf.length;
    };
    // Negative is left field, positive is right — see core/hit.ts.
    expect(centre('left')).toBeLessThan(centre('straight'));
    expect(centre('right')).toBeGreaterThan(centre('straight'));
  });

  it('never moves anybody further than the balance measurement allows', () => {
    // ⚠️ THE CAP IS THE FINDING, not a style rule. Every degree past this and
    // the hole opened is bigger than the hole closed, which is how both earlier
    // versions of these tables handed the offence a quarter of a run a game.
    // If this fails, re-run scripts/balance.ts before raising it.
    for (const shift of SHIFTS) {
      for (const f of fieldersFor(shift)) {
        const was = at(FIELDERS, f.num);
        if (shift === 'in' && f.num >= 3 && f.num <= 6) continue; // depth, not spray
        expect(Math.abs(f.dirDeg - was.dirDeg)).toBeLessThanOrEqual(15);
      }
    }
  });

  it('always leaves somebody near first base to take the throw', () => {
    // ⚠️ THE REASON THE TABLES ARE ASYMMETRIC. A mirrored shift moves the
    // first baseman off the bag and there is nobody to throw to.
    for (const shift of SHIFTS) {
      const first = at(fieldersFor(shift), 3);
      expect(first.dirDeg).toBeGreaterThan(20);
    }
  });

  it('brings every infielder in, and nobody else, on the infield-in call', () => {
    const inf = fieldersFor('in');
    for (const num of [3, 4, 5, 6]) {
      expect(at(inf, num).distFt).toBeLessThan(at(FIELDERS, num).distFt);
    }
    for (const num of [7, 8, 9]) {
      expect(at(inf, num)).toEqual(at(FIELDERS, num));
    }
  });
});

describe('what the shift actually costs the hitter', () => {
  const rad = (d: number) => (d * Math.PI) / 180;
  /** Feet from a ball to the nearest man — contest()'s only input. */
  const gapTo = (
    fs: readonly { num: number; distFt: number; dirDeg: number }[],
    distFt: number,
    dirDeg: number,
  ) => {
    const f = nearestFielder(distFt, dirDeg, fs);
    const bx = Math.sin(rad(dirDeg)) * distFt;
    const by = Math.cos(rad(dirDeg)) * distFt;
    const fx = Math.sin(rad(f.dirDeg)) * f.distFt;
    const fy = Math.cos(rad(f.dirDeg)) * f.distFt;
    return Math.hypot(bx - fx, by - fy);
  };

  // The whole feature in one assertion: a ball pulled into the shift has to
  // find somebody CLOSER than it would have. Gap distance is what contest()
  // turns into an out, so this is the mechanism and not a proxy for it.
  it('closes the ground the hitter pulls it into', () => {
    // A grounder to the right side, which is where a lefty pulls it.
    expect(gapTo(fieldersFor('right'), 120, 25)).toBeLessThan(
      gapTo(fieldersFor('straight'), 120, 25),
    );
    // And the mirror, for a righty.
    expect(gapTo(fieldersFor('left'), 120, -25)).toBeLessThan(
      gapTo(fieldersFor('straight'), 120, -25),
    );
  });

  it('does not abandon the other side to do it', () => {
    // ⚠️ THE CONSTRAINT THE BALANCE RUNS IMPOSED. A shift that vacates the
    // opposite field measures as a GIFT to the hitter — both earlier versions
    // did exactly that. The opened hole is allowed to grow, but only a little.
    for (const [shift, dir] of [['right', -25] as const, ['left', 25] as const]) {
      const opened = gapTo(fieldersFor(shift), 120, dir);
      const was = gapTo(fieldersFor('straight'), 120, dir);
      expect(opened - was).toBeLessThan(20);
    }
  });
});

describe('what the computer calls', () => {
  it('shifts a pull hitter toward the field he pulls to', () => {
    const situation = { outs: 0, runnerOnThird: false, late: false };
    // A righty pulls to left (negative degrees), a lefty to right. The one
    // convention this file is allowed to restate is in core/hit.ts.
    expect(pickShift(hitter('R', 1.55, 0.7), situation)).toBe('left');
    expect(pickShift(hitter('L', 1.55, 0.7), situation)).toBe('right');
  });

  it('plays a contact hitter honest', () => {
    expect(pickShift(hitter('R', 0.7, 1.3), { outs: 0, runnerOnThird: false, late: false })).toBe(
      'straight',
    );
  });

  it('takes the run away instead, late, with a man ninety feet from home', () => {
    // Infield in outranks the shift even on a man worth shifting on.
    expect(pickShift(hitter('R', 1.55, 0.7), { outs: 1, runnerOnThird: true, late: true })).toBe(
      'in',
    );
    // ...but not with two down, when the out ends the inning anyway.
    expect(pickShift(hitter('R', 1.55, 0.7), { outs: 2, runnerOnThird: true, late: true })).not.toBe(
      'in',
    );
  });

  it('is a threshold the real league actually straddles', () => {
    // ⚠️ THE ASSERTION THAT KEEPS THIS HONEST. A threshold nothing crosses is
    // not a threshold — the same mistake TRIPLE_GAP_FT shipped with. Some of
    // the thirty clubs' hitters must earn a shift and most must not.
    const bats = LEAGUE.flatMap((c) => c.lineup);
    const shifted = bats.filter((b) => pullScore(b) >= SHIFT_ON).length;
    expect(shifted).toBeGreaterThan(0);
    expect(shifted).toBeLessThan(bats.length / 2);
  });
});
