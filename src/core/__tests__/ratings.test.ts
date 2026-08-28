/**
 * THE RATINGS HAVE TO MATTER. One test per rating, each one the smallest thing
 * that fails if that rating stops reaching the gameplay.
 *
 * The shape of every claim is the same: hold everything else fixed, move ONE
 * number, and demand the outcome move with it. A rating that passes its own
 * test and changes nothing on the field is the failure this file exists to
 * catch — see applyPower's header in hit.ts for the version of that bug that
 * shipped and sat there for months.
 */

import { describe, expect, it } from 'vitest';
import { makeRng } from '../rng.ts';
import { grade } from '../timing.ts';
import { resolveSwing, DEFAULT_STATS, type BatterStats, type SwingInput } from '../hit.ts';
import { newAtBat, swingAt } from '../atBat.ts';
import { applyAtBat, type Bases, type Runner } from '../inning.ts';
import { stuffFactor, type Pitcher } from '../pitcher.ts';
import { fatigueOf } from '../../game/bullpen.ts';
import { shouldBunt } from '../../game/ai.ts';

const stats = (over: Partial<BatterStats>): BatterStats => ({ ...DEFAULT_STATS, ...over });

/** Roll one swing n times and count how often each outcome came up. */
function tally(input: SwingInput, n = 4000, seed = 7): Record<string, number> {
  const rng = makeRng(seed);
  const out: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const r = resolveSwing(input, rng);
    out[r.outcome] = (out[r.outcome] ?? 0) + 1;
  }
  return out;
}

describe('vision — getting the bat on it', () => {
  // 90ms is past the 80ms contact window at vision 1.0 and inside it at 1.2.
  // That gap IS the rating: same swing, same contact, one of them is a whiff.
  it('turns a whiff into contact', () => {
    expect(grade(90, 1.0, 1.0)).toBe('miss');
    expect(grade(90, 1.0, 1.2)).toBe('late');
  });

  it('does NOT widen perfect or good — that is what contact is for', () => {
    expect(grade(20, 1.0, 2.0)).toBe('good');
    expect(grade(40, 1.0, 2.0)).toBe('late');
    // Contact, by contrast, moves all three.
    expect(grade(40, 1.3, 1.0)).toBe('good');
  });

  it('shows up as fewer strikeouts over a lot of swings', () => {
    const swing = (vision: number): SwingInput => ({
      offsetMs: 78,
      pitchType: 'fastball',
      stats: stats({ vision }),
    });
    const blind = tally(swing(0.8));
    const eyes = tally(swing(1.25));
    expect(eyes.strikeout ?? 0).toBeLessThan(blind.strikeout ?? 0);
  });
});

describe('bunt — laying one down', () => {
  const bunt = (over: Partial<BatterStats>): SwingInput => ({
    offsetMs: 0,
    pitchType: 'fastball',
    location: 'middle',
    isBunt: true,
    stats: stats(over),
  });

  it('never produces damage, whatever the rating', () => {
    const t = tally(bunt({ bunt: 1.4, power: 1.8, speed: 1.4 }));
    expect(t.home_run ?? 0).toBe(0);
    expect(t.double ?? 0).toBe(0);
    expect(t.triple ?? 0).toBe(0);
  });

  it('a good bunter pops it up less and keeps it fair more', () => {
    const bad = tally(bunt({ bunt: 0.3 }));
    const good = tally(bunt({ bunt: 1.35 }));
    expect(good.popup ?? 0).toBeLessThan(bad.popup ?? 0);
    expect(good.foul ?? 0).toBeLessThan(bad.foul ?? 0);
  });

  it('legs turn the sacrifice into a hit', () => {
    const slow = tally(bunt({ bunt: 1.2, speed: 0.6 }));
    const fast = tally(bunt({ bunt: 1.2, speed: 1.4 }));
    expect(fast.single ?? 0).toBeGreaterThan((slow.single ?? 0) * 1.5);
  });

  it('is placed, never timed — a wild offset bunts exactly the same', () => {
    const a = tally({ ...bunt({ bunt: 1 }), offsetMs: 0 });
    const b = tally({ ...bunt({ bunt: 1 }), offsetMs: 400 });
    expect(a).toEqual(b);
  });

  it('fouled off with two strikes is the third one', () => {
    let rung = 0;
    for (let seed = 0; seed < 200; seed++) {
      const after = swingAt({ balls: 0, strikes: 2 }, bunt({ bunt: 1 }), makeRng(seed));
      if (after.result?.kind === 'strikeout') rung++;
    }
    // About a third of bunts come back foul, and with two strikes every one of
    // them is an out. An ordinary foul at 2-2 is not, which is the rule this
    // one breaks and the reason bunting late is a decision.
    expect(rung).toBeGreaterThan(20);
  });

  it('a bunt scores the man from third; an ordinary ground out has to earn it', () => {
    const man = (name: string): Runner => ({ name, speed: 1 });
    // On THIRD, and nobody behind him — so he is not forced, and going is a
    // decision rather than an obligation. That is the whole difference left
    // between the two now that an ordinary grounder moves forced runners.
    const bases: Bases = [null, null, man('Ruiz')];
    const hit = { outcome: 'ground_out' as const, exitVelocity: 40 };

    const sac = applyAtBat({ outs: 0, bases }, {
      kind: 'in_play',
      hit: { ...hit, bunted: true } as never,
    });
    expect(sac.runs).toBe(1);
    expect(sac.outs).toBe(1);

    // No die rolled (CLEAN), so the unforced man holds.
    const held = applyAtBat({ outs: 0, bases }, {
      kind: 'in_play',
      hit: { ...hit, bunted: false } as never,
    });
    expect(held.runs).toBe(0);
    expect(held.bases[2]?.name).toBe('Ruiz');

    // Roll him a good one and he goes.
    const sent = applyAtBat(
      { outs: 0, bases },
      { kind: 'in_play', hit: { ...hit, bunted: false } as never },
      undefined,
      { error: false, doublePlay: false, advanceRolls: [0, 0, 0] },
    );
    expect(sent.runs).toBe(1);
  });

  it('the computer only bunts where a bench actually would', () => {
    const bunter = stats({ bunt: 1.2, power: 0.8 });
    const on = { count: newAtBat(), outs: 0, bases: [true, false, false], deficit: 0 };
    expect(shouldBunt(bunter, on)).toBe(true);
    // ...and every clause that calls it off.
    expect(shouldBunt(bunter, { ...on, count: { balls: 0, strikes: 2 } })).toBe(false);
    expect(shouldBunt(bunter, { ...on, outs: 2 })).toBe(false);
    expect(shouldBunt(bunter, { ...on, bases: [false, false, false] })).toBe(false);
    expect(shouldBunt(bunter, { ...on, deficit: -9 })).toBe(false);
    expect(shouldBunt(stats({ bunt: 1.2, power: 1.5 }), on)).toBe(false);
    expect(shouldBunt(stats({ bunt: 0.4, power: 0.8 }), on)).toBe(false);
  });
});

describe('the pitcher, rated', () => {
  const arm = (over: Partial<Pitcher>): Pitcher => ({
    name: 'Test',
    blurb: '',
    throws: 'R',
    signature: 'none',
    tellTiming: 'none',
    arsenal: { fastball: 0.5, slider: 0.5 },
    putaway: 'slider',
    zoneRate: 0.5,
    ...over,
  });

  it('break bites on the breaking ball and leaves the fastball alone', () => {
    const nasty = arm({ break: 1.3 });
    expect(stuffFactor(nasty, 'slider')).toBeLessThan(1);
    expect(stuffFactor(nasty, 'curveball')).toBeLessThan(1);
    // Velocity is the fastball's rating and it works through the clock.
    expect(stuffFactor(nasty, 'fastball')).toBe(1);
    // The knuckleball is already the pitch nobody times — see platoonContact.
    expect(stuffFactor(nasty, 'knuckleball')).toBe(1);
  });

  it('clutch only shows up with men in scoring position', () => {
    const closer = arm({ clutch: 1.2 });
    expect(stuffFactor(closer, 'fastball')).toBe(1);
    expect(stuffFactor(closer, 'fastball', { runnersInScoringPosition: true })).toBeLessThan(1);
  });

  it('is floored, so no pitch is unhittable by arithmetic', () => {
    const impossible = arm({ break: 5, clutch: 5 });
    expect(
      stuffFactor(impossible, 'slider', { runnersInScoringPosition: true }),
    ).toBeGreaterThanOrEqual(0.6);
  });

  it('stuff reaches the swing, not just the helper', () => {
    const swing = (stuff: number): SwingInput => ({
      offsetMs: 76,
      pitchType: 'slider',
      stats: stats({}),
      stuff,
    });
    const easy = tally(swing(1));
    const nasty = tally(swing(0.8));
    expect(nasty.strikeout ?? 0).toBeGreaterThan(easy.strikeout ?? 0);
  });

  it('stamina moves both ends of the fatigue ramp', () => {
    // A one-inning arm is already tiring where a workhorse is still fresh.
    expect(fatigueOf(60, 0.7)).toBeGreaterThan(0);
    expect(fatigueOf(60, 1.2)).toBe(0);
    expect(fatigueOf(90, 0.7)).toBe(1);
    expect(fatigueOf(90, 1.2)).toBeLessThan(1);
  });
});
