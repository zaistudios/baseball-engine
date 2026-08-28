/**
 * The first two blocks lock the vault's pitch-config corrections. They are
 * regression tests against the prototype's numbers, same as the timing suite.
 */

import { describe, it, expect } from 'vitest';
import {
  throwPitch,
  movementOf,
  pitchToSpot,
  chooseApproach,
  scoutingReport,
  PITCH_SPEED_MPH,
  PITCHERS,
  pitcherFor,
  DANGEROUS_POWER,
  ATTACK_ZONE_FLOOR,
  type Count,
  type Situation,
  type Pitcher,
} from '../pitcher.ts';
import { makeRng } from '../rng.ts';
import { resolveSwingSeeded } from '../hit.ts';
import { ballArrivalMs } from '../timing.ts';
import { ALL_PITCH_TYPES, type PitchType } from '../hitTables.ts';
import type { PitchLocation } from '../hit.ts';

const NEUTRAL: Count = { balls: 0, strikes: 0 };
const NOWHERE: Situation = {};

/** Throw n pitches at a fixed count and situation, and tally the types. */
function sample(
  pitcher = pitcherFor('splice', 1),
  count = NEUTRAL,
  sit: Situation = NOWHERE,
  n = 400,
  seed = 42,
) {
  const rng = makeRng(seed);
  const types: Record<string, number> = {};
  let inZone = 0;
  for (let i = 0; i < n; i++) {
    const p = throwPitch(pitcher, count, sit, rng);
    types[p.type] = (types[p.type] ?? 0) + 1;
    if (p.inZone) inZone++;
  }
  return { types, inZoneRate: inZone / n };
}

const ALL_PITCHERS = Object.values(PITCHERS).flat();

describe('the changeup is not a slow fastball', () => {
  it('sits within 10-15% of the fastball, not the prototype 40% below', () => {
    const drop = 1 - PITCH_SPEED_MPH.changeup / PITCH_SPEED_MPH.fastball;
    expect(drop).toBeGreaterThanOrEqual(0.1);
    expect(drop).toBeLessThanOrEqual(0.15);

    // The prototype's 250 -> 150 was a 40% cut, readable at release.
    expect(drop).toBeLessThan(0.4);
  });

  it('cannot be separated from the curve by speed alone', () => {
    // If it could, the tell system would have nothing to do.
    expect(Math.abs(PITCH_SPEED_MPH.changeup - PITCH_SPEED_MPH.curveball)).toBeLessThan(5);
  });
});

describe('the curve is 10-20 mph slower than the fastball', () => {
  it('holds the real gap', () => {
    const gap = PITCH_SPEED_MPH.fastball - PITCH_SPEED_MPH.curveball;
    expect(gap).toBeGreaterThanOrEqual(10);
    expect(gap).toBeLessThanOrEqual(20);
  });

  it('arrives measurably later than a fastball on the same clock', () => {
    const fast = ballArrivalMs(0, PITCH_SPEED_MPH.fastball);
    const curve = ballArrivalMs(0, PITCH_SPEED_MPH.curveball);
    // ~60ms of extra flight - inside the contact window, so it matters.
    expect(curve - fast).toBeGreaterThan(40);
  });
});

describe('the tell ladder is the difficulty curve', () => {
  it('tips the rookie before the windup', () => {
    const p = throwPitch(pitcherFor('holdouts', 1), NEUTRAL, NOWHERE, makeRng(1));
    expect(p.tell).toEqual({ pitch: p.type, timing: 'pre_pitch' });
  });

  it('leaks the veteran at release', () => {
    const p = throwPitch(pitcherFor('splice', 1), NEUTRAL, NOWHERE, makeRng(1));
    expect(p.tell?.timing).toBe('release');
  });

  it('gives nothing away on the ace', () => {
    const p = throwPitch(pitcherFor('foundry', 3), NEUTRAL, NOWHERE, makeRng(1));
    expect(p.tell).toBeNull();
  });

  it('never lies when it does tell', () => {
    const rng = makeRng(9);
    for (let i = 0; i < 50; i++) {
      const p = throwPitch(pitcherFor('splice', 1), NEUTRAL, NOWHERE, rng);
      expect(p.tell?.pitch).toBe(p.type);
    }
  });
});

/**
 * THE PLAN. This block replaced "patterns cycle, and the ace decoy is data not
 * chance", which locked in the fixed `pattern[n % len]` cycle the rework
 * deleted. What is being asserted now is that the pitcher pitches to the
 * situation, which is both the new skill expression and the whole point.
 */
describe('the pitcher pitches to a plan, not to an index', () => {
  it('leads off an at-bat trying to get ahead', () => {
    expect(chooseApproach({ balls: 0, strikes: 0 })).toBe('establish');
  });

  it('has to throw a strike when he is behind', () => {
    expect(chooseApproach({ balls: 2, strikes: 0 })).toBe('attack');
    expect(chooseApproach({ balls: 3, strikes: 1 })).toBe('attack');
  });

  it('wastes 0-2 and puts you away at every other two-strike count', () => {
    expect(chooseApproach({ balls: 0, strikes: 2 })).toBe('waste');
    expect(chooseApproach({ balls: 1, strikes: 2 })).toBe('putaway');
    expect(chooseApproach({ balls: 2, strikes: 2 })).toBe('putaway');
  });

  it('throws a strike on a full count — a putaway pitch at 3-2 is just a walk', () => {
    expect(chooseApproach({ balls: 3, strikes: 2 })).toBe('attack');
  });

  it('mixes in the middle of an at-bat', () => {
    expect(chooseApproach({ balls: 1, strikes: 1 })).toBe('setup');
    expect(chooseApproach({ balls: 0, strikes: 1 })).toBe('setup');
  });

  it('is a pure decision, so reading the count is right every time', () => {
    // No rng argument at all — that is the assertion. A player who knows the
    // count knows the intent; what they do not know is the pitch and the spot.
    const twice = [chooseApproach({ balls: 1, strikes: 2 }), chooseApproach({ balls: 1, strikes: 2 })];
    expect(twice[0]).toBe(twice[1]);
  });

  it('reports the approach it chose, so the decision is visible', () => {
    const p = throwPitch(pitcherFor('splice', 1), { balls: 0, strikes: 2 }, NOWHERE, makeRng(2));
    expect(p.approach).toBe('waste');
  });
});

describe('the out pitch is the thing worth learning', () => {
  it('goes to it with two strikes', () => {
    // Not every time — he will not show it twice in a row — but it has to be
    // the pitch he reaches for, or "out pitch" means nothing.
    const surgeon = pitcherFor('splice', 3);
    const { types } = sample(surgeon, { balls: 1, strikes: 2 }, NOWHERE);
    const putaways = types[surgeon.putaway] ?? 0;
    expect(putaways / 400).toBeGreaterThan(0.5);
  });

  it('will not show it twice in a row', () => {
    // Having just seen it, the same pitch again is damped hard. If it were
    // removed outright "he never repeats" would be the new exploitable rule.
    const ruiz = pitcherFor('splice', 1);
    const { types } = sample(ruiz, { balls: 1, strikes: 2 }, { previous: [ruiz.putaway] });
    const repeats = (types[ruiz.putaway] ?? 0) / 400;
    expect(repeats).toBeGreaterThan(0);
    expect(repeats).toBeLessThan(0.5);
  });

  it('is always a pitch he actually throws', () => {
    for (const p of ALL_PITCHERS) expect(p.arsenal[p.putaway] ?? 0).toBeGreaterThan(0);
  });

  it('is named in the scouting report, ace included', () => {
    for (const p of ALL_PITCHERS) expect(scoutingReport(p)).toContain(p.putaway);
  });
});

describe('sequencing — he does not throw the same pitch on a loop', () => {
  it('damps whatever he just threw', () => {
    const ruiz = pitcherFor('splice', 1);
    const fresh = sample(ruiz, { balls: 1, strikes: 1 }, NOWHERE);
    const after = sample(ruiz, { balls: 1, strikes: 1 }, { previous: ['fastball'] });
    expect(after.types.fastball ?? 0).toBeLessThan(fresh.types.fastball ?? 0);
  });

  it('still throws it sometimes, so back-to-back is possible', () => {
    const ruiz = pitcherFor('splice', 1);
    const { types } = sample(ruiz, { balls: 1, strikes: 1 }, { previous: ['fastball'] });
    expect(types.fastball ?? 0).toBeGreaterThan(0);
  });

  it('only ever throws what is in the arsenal', () => {
    for (const pitcher of ALL_PITCHERS) {
      // The junkballer swaps a fastball for a breaking ball, so his signature
      // can reach a pitch the mix does not list — that is the signature doing
      // its job. Everyone else is held to the table.
      if (pitcher.signature === 'junk' || pitcher.signature === 'knuckler') continue;
      const rng = makeRng(88);
      for (let i = 0; i < 200; i++) {
        const count = { balls: i % 4, strikes: i % 3 };
        const p = throwPitch(pitcher, count, NOWHERE, rng);
        expect(pitcher.arsenal[p.type] ?? 0).toBeGreaterThan(0);
      }
    }
  });
});

describe('he pitches around the man who can hurt him', () => {
  const slugger: Situation = { firstBaseOpen: true, batterPower: DANGEROUS_POWER, outs: 0 };

  it('will not give a dangerous hitter anything with first base open', () => {
    expect(chooseApproach({ balls: 1, strikes: 1 }, slugger)).toBe('around');
    const { inZoneRate } = sample(pitcherFor('splice', 1), { balls: 1, strikes: 1 }, slugger);
    expect(inZoneRate).toBeLessThan(0.3);
  });

  it('outranks being behind — he finishes the walk rather than groove one', () => {
    // The one rule that can take the patience payoff away, and it should: the
    // price of a lineup that scares people is that they stop pitching to it.
    expect(chooseApproach({ balls: 3, strikes: 0 }, slugger)).toBe('around');
  });

  it('does not outrank a full count', () => {
    expect(chooseApproach({ balls: 3, strikes: 2 }, slugger)).toBe('attack');
  });

  it('challenges him with two outs, when the walk buys nothing', () => {
    expect(chooseApproach({ balls: 1, strikes: 1 }, { ...slugger, outs: 2 })).toBe('setup');
  });

  it('challenges him with a man on first, because the walk is not free', () => {
    expect(chooseApproach({ balls: 1, strikes: 1 }, { ...slugger, firstBaseOpen: false })).toBe(
      'setup',
    );
  });

  it('challenges an ordinary hitter in the same spot', () => {
    expect(chooseApproach({ balls: 1, strikes: 1 }, { ...slugger, batterPower: 0.9 })).toBe('setup');
  });
});

describe('location — without it, a ball looks like a strike', () => {
  it('never misses the zone down the middle', () => {
    const rng = makeRng(21);
    let outOfZone = 0;
    for (let i = 0; i < 400; i++) {
      const p = throwPitch(pitcherFor('splice', 1), NEUTRAL, NOWHERE, rng);
      if (!p.inZone) {
        outOfZone++;
        expect(p.location).not.toBe('middle');
      }
    }
    expect(outOfZone).toBeGreaterThan(50);
  });

  it('actually varies, so at-bats are not all the same pitch', () => {
    const rng = makeRng(4);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++)
      seen.add(throwPitch(pitcherFor('splice', 1), NEUTRAL, NOWHERE, rng).location);
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });

  it('sends the curve low or away, and lets the fastball get elevated', () => {
    const rng = makeRng(6);
    const curves = new Set<string>();
    const fastballs = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const p = throwPitch(pitcherFor('splice', 1), NEUTRAL, NOWHERE, rng);
      (p.type === 'curveball' ? curves : p.type === 'fastball' ? fastballs : new Set()).add(p.location);
    }
    expect(curves.has('high')).toBe(false);
    expect(fastballs.has('high')).toBe(true);
  });

  it('climbs the ladder with the 0-2 fastball and buries everything else', () => {
    // The waste pitch's location is fixed rather than rolled. A waste pitch
    // that lands somewhere hittable is not a waste pitch.
    const rng = makeRng(19);
    for (let i = 0; i < 200; i++) {
      const p = throwPitch(pitcherFor('foundry', 1), { balls: 0, strikes: 2 }, NOWHERE, rng);
      expect(p.approach).toBe('waste');
      expect(p.location).toBe(p.type === 'fastball' ? 'high' : 'low');
    }
  });

  it('reaches the hit engine instead of being hardcoded middle', () => {
    // applyLocation() was dead code until the pitcher started setting this.
    const p = throwPitch(pitcherFor('holdouts', 1), NEUTRAL, NOWHERE, makeRng(3));
    expect(['high', 'low', 'inside', 'outside', 'middle']).toContain(p.location);
  });
});

describe('hit by pitch', () => {
  it('only ever comes on a pitch that is inside AND out of the zone', () => {
    const rng = makeRng(31);
    let plunks = 0;
    for (let i = 0; i < 5000; i++) {
      const p = throwPitch(pitcherFor('splice', 1), NEUTRAL, NOWHERE, rng);
      if (p.hitBatter) {
        plunks++;
        expect(p.inZone).toBe(false);
        expect(p.location).toBe('inside');
      }
    }
    expect(plunks).toBeGreaterThan(0);
  });

  it('stays rare enough to be an event rather than a mechanic', () => {
    const rng = makeRng(77);
    let plunks = 0;
    const n = 5000;
    for (let i = 0; i < n; i++)
      if (throwPitch(pitcherFor('splice', 1), NEUTRAL, NOWHERE, rng).hitBatter) plunks++;
    expect(plunks / n).toBeLessThan(0.05);
  });
});

describe('count leverage', () => {
  it('goes to the fastball, over the plate, when the hitter is up 2-0', () => {
    // Was "always, every time". It is now ATTACK_ZONE_FLOOR, deliberately —
    // a guaranteed strike at 2-0 is a solved puzzle rather than a payoff, and
    // a pitcher who has to throw one can still miss. The pitch is still
    // certain; only the location rolls.
    const rng = makeRng(5);
    let inZone = 0;
    const n = 200;
    for (let i = 0; i < n; i++) {
      const p = throwPitch(pitcherFor('foundry', 3), { balls: 2, strikes: 0 }, NOWHERE, rng);
      expect(p.type).toBe('fastball');
      if (p.inZone) inZone++;
    }
    expect(inZone / n).toBeGreaterThanOrEqual(ATTACK_ZONE_FLOOR - 0.06);
  });

  it('expands off the plate at 0-2, mostly with something breaking', () => {
    // ⚠️ CHANGED with the rework, and the old assertion was the wrong baseball.
    // It demanded `fastball === 0` — a hard ban, inherited from the tape-loop
    // version's `rng.pick(BREAKING)`. But the elevated 0-2 fastball above the
    // letters is one of the most canonical waste pitches there is, and the
    // location rule in throwPitch() exists specifically to throw it. So the
    // fastball is DAMPED here, not banned: a minority of 0-2 pitches, and
    // unhittable when it does come.
    const ruiz = pitcherFor('splice', 1);
    const { types, inZoneRate } = sample(ruiz, { balls: 0, strikes: 2 });
    const fastballs = (types.fastball ?? 0) / 400;
    expect(fastballs).toBeGreaterThan(0);
    // He throws 50% fastballs at a neutral count; here it must be well under half.
    expect(fastballs).toBeLessThan(ruiz.arsenal.fastball! * 0.8);
    expect(inZoneRate).toBeLessThan(0.3);
  });

  it('rewards taking pitches with predictability', () => {
    // The whole point of the system: a patient hitter faces a readable pitcher.
    const patient = sample(pitcherFor('splice', 1), { balls: 2, strikes: 1 });
    const behind = sample(pitcherFor('splice', 1), { balls: 0, strikes: 2 });
    expect(patient.inZoneRate).toBeGreaterThan(behind.inZoneRate);
  });

  it('leaves a neutral count on the mix', () => {
    const { types } = sample(pitcherFor('splice', 1), { balls: 1, strikes: 1 });
    expect(types.fastball).toBeGreaterThan(0);
    expect(types.slider).toBeGreaterThan(0);
  });
});

describe('determinism', () => {
  it('replays identically from the same seed', () => {
    const run = () => {
      const rng = makeRng(1234);
      return Array.from({ length: 20 }, () =>
        throwPitch(pitcherFor('foundry', 3), { balls: 0, strikes: 2 }, NOWHERE, rng),
      );
    };
    expect(run()).toEqual(run());
  });

  it('does not depend on the key order of an arsenal literal', () => {
    // The picker walks ALL_PITCH_TYPES, not Object.keys, so reformatting a
    // pitcher's mix cannot silently reroll every seeded run in the dataset.
    const ruiz = pitcherFor('splice', 1);
    const reordered = {
      ...ruiz,
      arsenal: Object.fromEntries(
        [...ALL_PITCH_TYPES].reverse().flatMap((t) => (ruiz.arsenal[t] ? [[t, ruiz.arsenal[t]]] : [])),
      ),
    };
    const throwTen = (p: typeof ruiz) => {
      const rng = makeRng(404);
      return Array.from({ length: 10 }, () => throwPitch(p, { balls: 1, strikes: 1 }, NOWHERE, rng));
    };
    expect(throwTen(reordered)).toEqual(throwTen(ruiz));
  });
});

describe('nine pitchers, one per encounter', () => {
  const all = ['holdouts', 'splice', 'foundry'].flatMap((d) =>
    [1, 2, 3].map((m) => pitcherFor(d, m)),
  );

  it('gives every encounter its own arm', () => {
    expect(all).toHaveLength(9);
    expect(new Set(all.map((p) => p.name)).size).toBe(9);
  });

  it('gives every team a signature and a blurb', () => {
    for (const p of all) {
      expect(p.blurb.length).toBeGreaterThan(10);
      expect(p.signature).toBeTruthy();
    }
  });

  it('ramps: the tell disappears and the arsenal grows', () => {
    expect(pitcherFor('holdouts', 1).tellTiming).toBe('pre_pitch');
    expect(pitcherFor('splice', 1).tellTiming).toBe('release');
    expect(pitcherFor('foundry', 1).tellTiming).toBe('none');

    const size = (p: ReturnType<typeof pitcherFor>) => Object.keys(p.arsenal).length;
    expect(size(pitcherFor('holdouts', 1))).toBeLessThan(size(pitcherFor('foundry', 3)));
  });

  it('gives everyone a mix that adds up to something', () => {
    for (const p of ALL_PITCHERS) {
      const total = ALL_PITCH_TYPES.reduce((a, t) => a + (p.arsenal[t] ?? 0), 0);
      expect(total).toBeGreaterThan(0);
    }
  });

  it('tightens the zone as the league automates', () => {
    expect(pitcherFor('holdouts', 1).zoneRate).toBeGreaterThan(pitcherFor('foundry', 3).zoneRate);
  });

  it('clamps a match number past the end of a staff', () => {
    expect(pitcherFor('foundry', 99).name).toBe(pitcherFor('foundry', 3).name);
    expect(pitcherFor('nonsense', 1).name).toBe(pitcherFor('holdouts', 1).name);
  });
});

describe('signatures', () => {
  it('makes the knuckleballer throw mostly knuckleballs, and tip nothing', () => {
    const rng = makeRng(12);
    const p = pitcherFor('holdouts', 3);
    let knucks = 0;
    for (let i = 0; i < 300; i++) {
      const pitch = throwPitch(p, NEUTRAL, NOWHERE, rng);
      if (pitch.type === 'knuckleball') knucks++;
      expect(pitch.tell).toBeNull();
    }
    expect(knucks / 300).toBeGreaterThan(0.6);
  });

  it('rewards taking against the knuckleballer — it cannot be squared up', () => {
    // The counterplay the vault says the rest of the game never asks for.
    // Even dead-on, a knuckleball produces fewer hits than a fastball.
    const hits = (pitchType: 'knuckleball' | 'fastball') => {
      let n = 0;
      for (let seed = 1; seed <= 2000; seed++) {
        if (resolveSwingSeeded({ offsetMs: 0, pitchType }, seed).isHit) n++;
      }
      return n;
    };
    expect(hits('knuckleball')).toBeLessThan(hits('fastball'));
  });

  it('never lets a fireballer throw slower than the same pitch elsewhere', () => {
    const rng = makeRng(9);
    const boss = throwPitch(pitcherFor('foundry', 3), NEUTRAL, NOWHERE, rng);
    expect(boss.speedMph).toBeGreaterThan(PITCH_SPEED_MPH[boss.type]);
  });

  it('keeps a painter off the middle of the plate', () => {
    const rng = makeRng(15);
    const p = pitcherFor('splice', 2);
    for (let i = 0; i < 300; i++) {
      expect(throwPitch(p, NEUTRAL, NOWHERE, rng).location).not.toBe('middle');
    }
  });

  it('lets the junkballer be forced into a fastball at 2-0', () => {
    const rng = makeRng(17);
    const p = pitcherFor('holdouts', 2);
    for (let i = 0; i < 20; i++) {
      expect(throwPitch(p, { balls: 2, strikes: 0 }, NOWHERE, rng).type).toBe('fastball');
    }
  });

  it('will not let a signature override having to throw a strike', () => {
    // The junkballer and the knuckleballer both bend what gets thrown, and
    // neither may bend it at 3-1 — that rule is what makes patience pay.
    const rng = makeRng(23);
    for (const p of [pitcherFor('holdouts', 2), pitcherFor('holdouts', 3)]) {
      for (let i = 0; i < 30; i++) {
        expect(throwPitch(p, { balls: 3, strikes: 1 }, NOWHERE, rng).type).toBe('fastball');
      }
    }
  });
});

/**
 * THE PITCH YOU CALLED. The half of the mound the player owns.
 *
 * Every one of these fails if the call stops being honoured, if the arm's
 * control rating stops mattering, or if a missed pitch is drawn somewhere it
 * could not have gone.
 */
describe('pitchToSpot', () => {
  /** The same arm with a different trick. Command comes off the signature. */
  const arm = (signature: Pitcher['signature']): Pitcher => ({
    ...pitcherFor('holdouts', 1),
    signature,
  });

  /** Throw one call n times and tally where the ball actually turned up. */
  function spots(pitcher: Pitcher, spot: PitchLocation, n = 800, control = 1, seed = 7) {
    const rng = makeRng(seed);
    let onSpot = 0;
    let middle = 0;
    for (let i = 0; i < n; i++) {
      const p = pitchToSpot(pitcher, 'fastball', spot, rng, { control });
      if (p.location === spot && p.inZone) onSpot++;
      if (p.location === 'middle' && spot !== 'middle') middle++;
    }
    return { onSpot: onSpot / n, middle: middle / n };
  }

  it('throws the type you called, always', () => {
    const rng = makeRng(3);
    for (const t of ALL_PITCH_TYPES) {
      for (let i = 0; i < 20; i++) {
        expect(pitchToSpot(arm('none'), t, 'low_outside', rng).type).toBe(t);
      }
    }
  });

  it('gives the painter the corner and the fireballer the miss', () => {
    // The one trait defined as living on the black must out-command the one
    // defined as throwing it as hard as he can, or the signature is flavour.
    expect(spots(arm('painter'), 'low_outside').onSpot).toBeGreaterThan(
      spots(arm('fireball'), 'low_outside').onSpot + 0.1,
    );
  });

  it('makes a tired arm miss the spot more often', () => {
    expect(spots(arm('none'), 'low_outside', 800, 0.75).onSpot).toBeLessThan(
      spots(arm('none'), 'low_outside').onSpot - 0.05,
    );
  });

  it('hits the middle more often than a corner', () => {
    expect(spots(arm('none'), 'middle').onSpot).toBeGreaterThan(
      spots(arm('none'), 'low_outside').onSpot + 0.1,
    );
  });

  it('never leaves a missed middle call sitting on the middle', () => {
    // "Middle, off the plate" is not a place the renderer can draw — and a
    // middle call that leaked back over the heart did not miss at all.
    const rng = makeRng(11);
    for (let i = 0; i < 400; i++) {
      const p = pitchToSpot(arm('knuckler'), 'fastball', 'middle', rng, { control: 0.4 });
      if (p.inZone) expect(p.location).toBe('middle');
      else expect(p.location).not.toBe('middle');
    }
  });

  it('leaks some corner calls back over the heart of the plate', () => {
    // The mistake pitch. If every miss were a ball, wildness would be free.
    expect(spots(arm('none'), 'low_outside', 800, 0.6).middle).toBeGreaterThan(0.05);
  });

  it('tips nothing, because you know what you threw', () => {
    const rng = makeRng(5);
    for (let i = 0; i < 50; i++) {
      expect(pitchToSpot(arm('none'), 'curveball', 'high', rng).tell).toBeNull();
    }
  });
});

/**
 * THE BREAK, and the two properties that keep it honest.
 *
 * Everything here is about the PICTURE — movementOf cannot reach an outcome,
 * because grade() reads a time and applyLocation() reads a word. What it can do
 * is draw the ball somewhere the strike zone disagrees with, which is what the
 * old private copy in the roguelike screen was doing, and that is what these
 * tests exist to stop happening again.
 */
describe('movementOf', () => {
  it('leaves his hand on the line and arrives on the spot', () => {
    // ⚠️ THE LOAD-BEARING TEST. t=1 is the frame the engine already scored at
    // `pitch.location`; any deviation left over there is the ball crossing
    // somewhere the zone says it did not.
    for (const type of ALL_PITCH_TYPES) {
      for (const t of [0, 1]) {
        const m = movementOf(type, t, { break: 1.5, throws: 'L', seed: 12345 });
        expect(m.dx, `${type} at t=${t}`).toBeCloseTo(0, 6);
        expect(m.dy, `${type} at t=${t}`).toBeCloseTo(0, 6);
      }
    }
  });

  it('actually moves every pitch in the middle of the flight', () => {
    // The original complaint: six pitch types drawn as one straight line.
    for (const type of ALL_PITCH_TYPES) {
      const m = movementOf(type, 0.5, { seed: 7 });
      expect(Math.abs(m.dx) + Math.abs(m.dy), type).toBeGreaterThan(0.05);
    }
  });

  it('gives each pitch a different shape, not a different size', () => {
    const at = (type: PitchType) => movementOf(type, 0.5, { seed: 7 });
    // The curve is the vertical one and the slider is the horizontal one. If
    // these ever swap, the two pitches have stopped being distinguishable by
    // eye, which is the only way this file matters.
    expect(Math.abs(at('curveball').dy)).toBeGreaterThan(Math.abs(at('curveball').dx));
    expect(Math.abs(at('slider').dx)).toBeGreaterThan(Math.abs(at('slider').dy));
    expect(Math.abs(at('fastball').dy)).toBeLessThan(Math.abs(at('curveball').dy));
  });

  it('breaks later for a slider than for a curveball', () => {
    // Same claim as the table: the slider holds its line and leaves in a hurry.
    const early = 0.35;
    const sl = Math.abs(movementOf('slider', early).dx) / Math.abs(movementOf('slider', 0.8).dx);
    const cu = Math.abs(movementOf('curveball', early).dy) / Math.abs(movementOf('curveball', 0.8).dy);
    expect(sl).toBeLessThan(cu);
  });

  it('puts the arm behind the break', () => {
    // A better break rating is a bigger pitch on screen, or the rating is a
    // number on a card that nothing in the game can see.
    const weak = Math.abs(movementOf('curveball', 0.5, { break: 0.8 }).dy);
    const nasty = Math.abs(movementOf('curveball', 0.5, { break: 1.4 }).dy);
    expect(nasty).toBeGreaterThan(weak);
    // ...and the fastball is exempt, exactly as stuffFactor() has it.
    expect(movementOf('fastball', 0.5, { break: 1.4 }).dy).toBeCloseTo(
      movementOf('fastball', 0.5, { break: 0.8 }).dy,
      6,
    );
  });

  it('mirrors the sweep for a left-hander', () => {
    const r = movementOf('slider', 0.5, { throws: 'R' });
    const l = movementOf('slider', 0.5, { throws: 'L' });
    expect(l.dx).toBeCloseTo(-r.dx, 6);
    expect(l.dy).toBeCloseTo(r.dy, 6);
  });

  it('never sends the knuckleball to the same place twice', () => {
    const a = movementOf('knuckleball', 0.5, { seed: 11 });
    const b = movementOf('knuckleball', 0.5, { seed: 4242 });
    expect(a.dx).not.toBeCloseTo(b.dx, 3);
  });

  it('keeps every pitch inside a zone and a half of the line', () => {
    // The ball has to stay on the canvas and stay legible. This is the only
    // real constraint on the numbers in MOVEMENT — see the note on the ceiling.
    for (const type of ALL_PITCH_TYPES) {
      for (let t = 0; t <= 1; t += 0.02) {
        const m = movementOf(type, t, { break: 2, seed: 999 });
        expect(Math.abs(m.dx), `${type} dx at ${t.toFixed(2)}`).toBeLessThan(1.5);
        expect(Math.abs(m.dy), `${type} dy at ${t.toFixed(2)}`).toBeLessThan(1.5);
      }
    }
  });
});
