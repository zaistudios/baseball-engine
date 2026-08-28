/**
 * The computer adapting. The claim under test is narrow and important:
 * it changes what it does BECAUSE of what the human did, and it does not
 * change anything until it has seen enough to justify it.
 */

import { describe, expect, it } from 'vitest';
import { makeRng } from '../../core/rng.ts';
import { PITCHERS, type ThrownPitch } from '../../core/pitcher.ts';
import {
  aiSwing,
  callPitch,
  chaseRate,
  MIN_SAMPLE,
  newRead,
  observeCall,
  observePitch,
  predictedCall,
  swingRate,
  timingBias,
  weakestPitch,
  type Read,
} from '../ai.ts';

const arm = PITCHERS['holdouts']![1]!;
const pitch = (over: Partial<ThrownPitch> = {}): ThrownPitch => ({
  type: 'fastball',
  speedMph: 92,
  inZone: true,
  location: 'middle',
  hitBatter: false,
  tell: null,
  approach: 'setup',
  ...over,
});

const stats = { power: 1, contact: 1, vision: 1, clutch: 1, bunt: 1, speed: 1 };

describe('the book', () => {
  it('starts empty and claims nothing', () => {
    const r = newRead();
    expect(chaseRate(r)).toBe(0);
    expect(swingRate(r)).toBe(0);
    expect(timingBias(r)).toBe(0);
    expect(weakestPitch(r)).toBeNull();
    expect(predictedCall(r, false)).toBeNull();
  });

  it('counts a chase only on a pitch out of the zone', () => {
    const r = newRead();
    observePitch(r, pitch({ inZone: false }), true, 10);
    observePitch(r, pitch({ inZone: true }), true, 10);
    expect(r.ballsSeen).toBe(1);
    expect(r.chases).toBe(1);
    expect(chaseRate(r)).toBe(1);
  });

  it('reads a consistently early hitter as early', () => {
    const r = newRead();
    for (let i = 0; i < 20; i++) observePitch(r, pitch(), true, -30);
    expect(timingBias(r)).toBeLessThan(-25);
  });

  it('forgets old swings past MEMORY, so a hitter can adjust', () => {
    const r = newRead();
    for (let i = 0; i < 40; i++) observePitch(r, pitch(), true, -60);
    expect(timingBias(r)).toBeLessThan(-50);
    for (let i = 0; i < 40; i++) observePitch(r, pitch(), true, +60);
    expect(timingBias(r)).toBeGreaterThan(50);
  });

  it('names a weakness only for a pitch actually swung at and missed', () => {
    const r = newRead();
    // Ten sliders, eight whiffs.
    for (let i = 0; i < 10; i++) {
      observePitch(r, pitch({ type: 'slider' }), true, 0, i < 8);
    }
    expect(weakestPitch(r)).toBe('slider');
  });

  it('does not call a pitch a weakness when he lays off it', () => {
    const r = newRead();
    for (let i = 0; i < 20; i++) observePitch(r, pitch({ type: 'curveball' }), false);
    expect(weakestPitch(r)).toBeNull();
  });
});

describe('predicting what the human calls', () => {
  it('says nothing until there is a sample', () => {
    const r = newRead();
    for (let i = 0; i < MIN_SAMPLE - 1; i++) observeCall(r, 'fastball', false);
    expect(predictedCall(r, false)).toBeNull();
  });

  it('picks up a one-pitch habit', () => {
    const r = newRead();
    for (let i = 0; i < 20; i++) observeCall(r, 'fastball', false);
    expect(predictedCall(r, false)).toBe('fastball');
  });

  it('an even mix is not a tendency', () => {
    const r = newRead();
    const mix = ['fastball', 'curveball', 'changeup', 'slider', 'knuckleball'] as const;
    for (let i = 0; i < 30; i++) observeCall(r, mix[i % 5]!, false);
    expect(predictedCall(r, false)).toBeNull();
  });

  it('keeps a separate book for two strikes', () => {
    const r = newRead();
    for (let i = 0; i < 20; i++) observeCall(r, 'fastball', false);
    for (let i = 0; i < 10; i++) observeCall(r, 'slider', true);
    expect(predictedCall(r, false)).toBe('fastball');
    expect(predictedCall(r, true)).toBe('slider');
  });
});

describe('the computer pitching', () => {
  const chaser = (): Read => {
    const r = newRead();
    for (let i = 0; i < 40; i++) observePitch(r, pitch({ inZone: false }), true, 0, true);
    return r;
  };

  it('does not adapt before it has seen enough', () => {
    const r = newRead();
    observePitch(r, pitch({ inZone: false }), true, 0, true);
    const rng = makeRng(1);
    const a = callPitch(arm, { balls: 0, strikes: 2 }, {}, r, rng);
    const b = callPitch(arm, { balls: 0, strikes: 2 }, {}, newRead(), makeRng(1));
    expect(a).toEqual(b);
  });

  it('gets a free swinger to chase with two strikes', () => {
    const r = chaser();
    let offPlate = 0;
    for (let i = 0; i < 300; i++) {
      const p = callPitch(arm, { balls: 1, strikes: 2 }, {}, r, makeRng(i));
      if (!p.inZone) offPlate++;
    }
    let baseline = 0;
    for (let i = 0; i < 300; i++) {
      const p = callPitch(arm, { balls: 1, strikes: 2 }, {}, newRead(), makeRng(i));
      if (!p.inZone) baseline++;
    }
    expect(offPlate).toBeGreaterThan(baseline);
  });

  it('still has to throw a strike when the count says so', () => {
    const r = chaser();
    let inZone = 0;
    const N = 400;
    for (let i = 0; i < N; i++) {
      // 3-0: the pitcher must come in, book or no book.
      const p = callPitch(arm, { balls: 3, strikes: 0 }, {}, r, makeRng(i));
      if (p.inZone) inZone++;
    }
    expect(inZone / N).toBeGreaterThan(0.8);
  });

  it('stops throwing fastballs to a hitter who is early', () => {
    const early = newRead();
    for (let i = 0; i < 40; i++) observePitch(early, pitch(), true, -40);
    const late = newRead();
    for (let i = 0; i < 40; i++) observePitch(late, pitch(), true, +45);

    const share = (r: Read) => {
      let fb = 0;
      for (let i = 0; i < 400; i++) {
        if (callPitch(arm, { balls: 1, strikes: 1 }, {}, r, makeRng(i)).type === 'fastball') fb++;
      }
      return fb / 400;
    };
    expect(share(early)).toBeLessThan(share(late));
  });

  it('never leaves a hit-by-pitch on a ball it forced into the zone', () => {
    const patient = newRead();
    for (let i = 0; i < 60; i++) observePitch(patient, pitch({ inZone: false }), false);
    for (let i = 0; i < 500; i++) {
      const p = callPitch(arm, { balls: 1, strikes: 0 }, {}, patient, makeRng(i));
      if (p.inZone) expect(p.hitBatter).toBe(false);
    }
  });

  it('a tipped pitch is tipped as the pitch it actually became', () => {
    const early = newRead();
    for (let i = 0; i < 40; i++) observePitch(early, pitch(), true, -40);
    const tipper = PITCHERS['holdouts']![0]!; // pre_pitch tell
    for (let i = 0; i < 200; i++) {
      const p = callPitch(tipper, { balls: 1, strikes: 1 }, {}, early, makeRng(i));
      if (p.tell) expect(p.tell.pitch).toBe(p.type);
    }
  });

  it('adapt:false is the honest baseline', () => {
    const r = chaser();
    for (let i = 0; i < 50; i++) {
      const a = callPitch(arm, { balls: 0, strikes: 2 }, {}, r, makeRng(i), { adapt: false });
      const b = callPitch(arm, { balls: 0, strikes: 2 }, {}, newRead(), makeRng(i));
      expect(a).toEqual(b);
    }
  });
});

describe('the computer hitting', () => {
  it('lays off a ball more often than it swings at a strike', () => {
    const r = newRead();
    const rate = (inZone: boolean) => {
      let swings = 0;
      for (let i = 0; i < 400; i++) {
        if (aiSwing(pitch({ inZone }), { count: { balls: 1, strikes: 1 }, stats }, r, makeRng(i)).swing)
          swings++;
      }
      return swings / 400;
    };
    expect(rate(false)).toBeLessThan(rate(true));
  });

  it('protects with two strikes', () => {
    const r = newRead();
    const rate = (strikes: number) => {
      let swings = 0;
      for (let i = 0; i < 400; i++) {
        if (
          aiSwing(pitch({ inZone: false }), { count: { balls: 1, strikes }, stats }, r, makeRng(i))
            .swing
        )
          swings++;
      }
      return swings / 400;
    };
    expect(rate(2)).toBeGreaterThan(rate(0));
  });

  it('sits on a pitch the human keeps calling, and hits it better', () => {
    const booked = newRead();
    for (let i = 0; i < 30; i++) observeCall(booked, 'fastball', false);

    const squared = (r: Read) => {
      let good = 0;
      const N = 600;
      for (let i = 0; i < N; i++) {
        const d = aiSwing(pitch(), { count: { balls: 1, strikes: 1 }, stats }, r, makeRng(i));
        if (d.swing && Math.abs(d.offsetMs) <= 35) good++;
      }
      return good / N;
    };
    expect(squared(booked)).toBeGreaterThan(squared(newRead()));
  });

  it('punishes a guess that was wrong', () => {
    const booked = newRead();
    for (let i = 0; i < 30; i++) observeCall(booked, 'fastball', false);
    // It is sitting fastball; throw the curve instead.
    let misses = 0;
    const N = 600;
    for (let i = 0; i < N; i++) {
      const d = aiSwing(
        pitch({ type: 'curveball' }),
        { count: { balls: 1, strikes: 1 }, stats },
        booked,
        makeRng(i),
      );
      if (d.swing && Math.abs(d.offsetMs) > 80) misses++;
    }
    let baseline = 0;
    for (let i = 0; i < N; i++) {
      const d = aiSwing(
        pitch({ type: 'curveball' }),
        { count: { balls: 1, strikes: 1 }, stats },
        newRead(),
        makeRng(i),
      );
      if (d.swing && Math.abs(d.offsetMs) > 80) baseline++;
    }
    expect(misses).toBeGreaterThan(baseline);
  });

  it('reports what it was sitting on', () => {
    const booked = newRead();
    for (let i = 0; i < 30; i++) observeCall(booked, 'slider', false);
    const d = aiSwing(pitch(), { count: { balls: 0, strikes: 0 }, stats }, booked, makeRng(5));
    expect(d.guess).toBe('slider');
  });
});

/**
 * THE FREEZE — 2026-08-25.
 *
 * callPitch() picked an offspeed pitch off a filtered arsenal and rng.pick
 * THROWS on an empty array — it does not return undefined. So the 26 arms in
 * the league who throw nothing soft killed the frame loop the first time the
 * book read a hitter as early against one of them.
 */
describe('an arm with nothing soft to throw', () => {
  const heat = { ...arm, arsenal: { fastball: arm.arsenal.fastball, slider: 1 } } as typeof arm;

  it('keeps its pitch instead of throwing, when the book wants an offspeed', () => {
    // Badly early, enough times to clear MIN_SAMPLE and the timing read.
    const early = newRead();
    for (let i = 0; i < 40; i++) observePitch(early, pitch(), true, -120);

    // Every seed, because the rule sits behind two coin flips — one of them
    // lands eventually, and that pitch is the one that used to freeze the game.
    for (let seed = 0; seed < 300; seed++) {
      const call = () => callPitch(heat, { balls: 1, strikes: 1 }, {}, early, makeRng(seed));
      expect(call).not.toThrow();
    }
  });
});
