/**
 * Fatigue and the pen. The claims: an arm tires, a tired arm is worse in two
 * specific ways, the manager goes and gets him, and nobody pitches twice.
 */

import { describe, expect, it } from 'vitest';
import {
  armCondition,
  bringInRelief,
  fatigueOf,
  fatigue,
  fatiguedZoneRate,
  FRESH_UNTIL,
  GASSED_AT,
  hasRelief,
  limitOf,
  newStaff,
  recordBatter,
  recordPitch,
  shouldRelieve,
} from '../bullpen.ts';
import { PITCHERS, type ThrownPitch } from '../../core/pitcher.ts';
import { makeRng } from '../../core/rng.ts';
import { aiSwing, callPitch, newRead } from '../ai.ts';
import { HOME, AWAY } from '../teams.ts';
import { newGame, currentPitcher, countPitch, goToBullpen, fieldingStaff } from '../game.ts';
import { simulateGame } from '../sim.ts';

const rotation = [...HOME.rotation];
const staffOf = () => newStaff(rotation[0]!, HOME.bullpen);
const throwN = (n: number) => {
  let s = staffOf();
  for (let i = 0; i < n; i++) s = recordPitch(s);
  return s;
};

describe('the fatigue curve', () => {
  it('is flat while he is fresh', () => {
    expect(fatigueOf(0)).toBe(0);
    expect(fatigueOf(FRESH_UNTIL)).toBe(0);
  });

  it('ramps between fresh and gassed, then stops', () => {
    expect(fatigueOf(FRESH_UNTIL + 1)).toBeGreaterThan(0);
    expect(fatigueOf((FRESH_UNTIL + GASSED_AT) / 2)).toBeCloseTo(0.5, 5);
    expect(fatigueOf(GASSED_AT)).toBe(1);
    expect(fatigueOf(GASSED_AT + 80)).toBe(1);
  });

  it('costs him the plate as it climbs', () => {
    expect(fatiguedZoneRate(0.6, 0)).toBe(0.6);
    expect(fatiguedZoneRate(0.6, 1)).toBeLessThan(0.6);
  });

  it('names the condition for the UI', () => {
    // ⚠️ PROBED OFF HIS OWN RAMP, NOT OFF FRESH_UNTIL. The bands are fractions
    // of a fatigue curve that stamina stretches at both ends (see fatigueOf),
    // so a fixed pitch count only lands in the middle band for a 1.0-stamina
    // arm — this read `FRESH_UNTIL + 30` and quietly became a test of ALB's
    // starter's stamina rating rather than of the bands.
    const stamina = rotation[0]!.stamina ?? 1;
    const limit = limitOf(rotation[0]!);
    expect(armCondition(staffOf())).toBe('fresh');
    expect(armCondition(throwN(limit))).toBe('gassed');
    // Three quarters of the way from fresh to gassed: past the 0.45 that
    // separates working from tiring, and short of the 1 that ends it.
    expect(armCondition(throwN(Math.round((FRESH_UNTIL + 0.75 * (GASSED_AT - FRESH_UNTIL)) * stamina)))).toBe('tiring');
  });
});

describe('the staff', () => {
  it('starts the starter with the pen behind him', () => {
    const s = staffOf();
    expect(s.current.pitcher.name).toBe(rotation[0]!.name);
    // The pen is its own three now, not the leftovers of the rotation.
    expect(s.bullpen).toHaveLength(HOME.bullpen.length);
    expect(s.used).toHaveLength(0);
  });

  it('a relief appearance resets the pitch count and burns the old arm', () => {
    const tired = throwN(90);
    const fresh = bringInRelief(tired);
    expect(fresh.current.pitches).toBe(0);
    expect(fatigue(fresh)).toBe(0);
    expect(fresh.used.map((a) => a.pitcher.name)).toContain(rotation[0]!.name);
    expect(fresh.current.pitcher.name).toBe(HOME.bullpen[0]!.name);
  });

  it('nobody comes back once he is out', () => {
    let s = staffOf();
    const seen = new Set<string>([s.current.pitcher.name]);
    while (hasRelief(s)) {
      s = bringInRelief(s);
      expect(seen.has(s.current.pitcher.name)).toBe(false);
      seen.add(s.current.pitcher.name);
    }
  });

  it('running out of arms leaves the last man in rather than throwing', () => {
    let s = staffOf();
    while (hasRelief(s)) s = bringInRelief(s);
    const stuck = bringInRelief(s);
    expect(stuck.current.pitcher.name).toBe(s.current.pitcher.name);
  });
});

describe('the manager', () => {
  const ctx = { inning: 5, deficit: 0 };

  it('leaves a fresh, effective arm alone', () => {
    expect(shouldRelieve(throwN(40), ctx)).toBe(false);
  });

  it('always pulls a gassed one', () => {
    expect(shouldRelieve(throwN(limitOf(rotation[0]!)), ctx)).toBe(true);
  });

  it('pulls one who is getting hit, however fresh', () => {
    const shelled = recordBatter(recordBatter(recordBatter(recordBatter(staffOf(), 1), 1), 1), 1);
    expect(shelled.current.pitches).toBe(0);
    expect(shouldRelieve(shelled, ctx)).toBe(true);
  });

  it('pulls a tiring arm late in a close game, but not early', () => {
    const tiring = throwN(FRESH_UNTIL + 15);
    expect(shouldRelieve(tiring, { inning: 7, deficit: 1 })).toBe(true);
    expect(shouldRelieve(tiring, { inning: 3, deficit: 1 })).toBe(false);
  });

  it('never pulls anyone with an empty pen', () => {
    let s = staffOf();
    while (hasRelief(s)) s = bringInRelief(s);
    for (let i = 0; i < GASSED_AT + 20; i++) s = recordPitch(s);
    expect(shouldRelieve(s, ctx)).toBe(false);
  });
});

describe('fatigue reaches the pitch and the swing', () => {
  const arm = PITCHERS['holdouts']![1]!;
  const stats = { power: 1, contact: 1, vision: 1, clutch: 1, bunt: 1, speed: 1 };
  const p = (over: Partial<ThrownPitch> = {}): ThrownPitch => ({
    type: 'fastball', speedMph: 92, inZone: true, location: 'middle',
    hitBatter: false, tell: null, approach: 'setup', ...over,
  });

  it('a gassed arm throws fewer strikes', () => {
    const zone = (f: number) => {
      let inZone = 0;
      for (let i = 0; i < 600; i++) {
        if (callPitch(arm, { balls: 1, strikes: 1 }, {}, newRead(), makeRng(i), { fatigue: f }).inZone)
          inZone++;
      }
      return inZone;
    };
    expect(zone(1)).toBeLessThan(zone(0));
  });

  it('...but still has to throw one when the count demands it', () => {
    let inZone = 0;
    const N = 400;
    for (let i = 0; i < N; i++) {
      if (callPitch(arm, { balls: 3, strikes: 0 }, {}, newRead(), makeRng(i), { fatigue: 1 }).inZone)
        inZone++;
    }
    expect(inZone / N).toBeGreaterThan(0.8);
  });

  it('a gassed arm gets barrelled more often', () => {
    const squared = (f: number) => {
      let good = 0;
      for (let i = 0; i < 800; i++) {
        const d = aiSwing(p(), { count: { balls: 1, strikes: 1 }, stats, pitcherFatigue: f }, newRead(), makeRng(i));
        if (d.swing && Math.abs(d.offsetMs) <= 12) good++;
      }
      return good;
    };
    expect(squared(1)).toBeGreaterThan(squared(0));
  });

  it('fatigue applies even with adaptation off — it is the arm, not the book', () => {
    const zone = (f: number) => {
      let inZone = 0;
      for (let i = 0; i < 400; i++) {
        if (
          callPitch(arm, { balls: 1, strikes: 1 }, {}, newRead(), makeRng(i), {
            adapt: false,
            fatigue: f,
          }).inZone
        )
          inZone++;
      }
      return inZone;
    };
    expect(zone(1)).toBeLessThan(zone(0));
  });
});

describe('in a real game', () => {
  it('the mound is the fielding side\'s, and pitches charge to him', () => {
    let g = newGame(HOME, AWAY, 9);
    const starter = currentPitcher(g).name;
    g = countPitch(g);
    g = countPitch(g);
    expect(fieldingStaff(g).current.pitches).toBe(2);
    expect(currentPitcher(g).name).toBe(starter);
    // The other side's arm is untouched.
    expect(g.awayState.staff.current.pitches).toBe(0);
  });

  it('going to the pen changes who is throwing', () => {
    let g = newGame(HOME, AWAY, 9);
    const first = currentPitcher(g).name;
    g = goToBullpen(g);
    expect(currentPitcher(g).name).not.toBe(first);
    expect(fieldingStaff(g).current.pitches).toBe(0);
  });

  it('runs are charged to the man who allowed them', () => {
    const g = newGame(HOME, AWAY, 9);
    const staff = recordBatter(g.homeState.staff, 2);
    expect(staff.current.runsAllowed).toBe(2);
    expect(staff.current.battersFaced).toBe(1);
  });

  it('bullpens actually get used across a season of games', () => {
    let appearances = 0;
    const N = 40;
    for (let s = 0; s < N; s++) {
      const { game } = simulateGame(s * 7919 + 13);
      appearances += game.homeState.staff.used.length + game.awayState.staff.used.length;
    }
    // Real baseball is roughly three relief appearances a game.
    const perGame = appearances / N;
    expect(perGame).toBeGreaterThan(1);
    expect(perGame).toBeLessThan(5);
  });

  it('no arm throws an absurd number of pitches', () => {
    for (let s = 0; s < 60; s++) {
      const { game } = simulateGame(s * 131 + 7);
      for (const st of [game.homeState, game.awayState]) {
        // He can pass GASSED_AT inside one at-bat, but not by a lot — UNLESS
        // there is nobody left. A three-arm staff does not cover a
        // seventeen-inning game, and the last man out there wears it: one
        // marathon in these sixty ran a closer to 236 pitches. That is the
        // engine being honest about a short pen, not the manager asleep, so
        // the assertion is on the manager: he only leaves a man past gassed
        // when the pen is empty.
        if (st.staff.current.pitches >= GASSED_AT + 40) {
          expect(st.staff.bullpen, 'left a gassed arm in with relief warm').toHaveLength(0);
          expect(game.inning).toBeGreaterThan(9);
        }
      }
    }
  });
});
