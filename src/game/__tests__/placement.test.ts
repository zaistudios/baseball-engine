/**
 * Ball placement, the handedness of a pulled ball, and the foul-ball knob.
 */

import { describe, expect, it } from 'vitest';
import {
  place,
  stretch,
  withPlacement,
  describePlay,
  GAP_FT,
  AT_HIM_FT,
  TRIPLE_GAP_FT,
} from '../placement.ts';
import { directionFor, applyFoul, resolveSwing, type SwingInput } from '../../core/hit.ts';
import { OUTCOME_TABLES, isHit, type Outcome } from '../../core/hitTables.ts';
import { makeRng } from '../../core/rng.ts';
import type { HitResult } from '../../core/hit.ts';
import { FOUL_BOOST } from '../tuning.ts';

const hit = (over: Partial<HitResult> = {}): HitResult => ({
  outcome: 'single',
  timing: 'good',
  pitchType: 'fastball',
  isOut: false,
  isHit: true,
  platoon: 1,
  stance: 'normal',
  exitVelocity: 90,
  launchAngle: 15,
  direction: 0,
  clutchApplied: false,
  ...over,
});

describe('which way a pulled ball goes', () => {
  it('a right-hander who is EARLY pulls to left (negative)', () => {
    expect(directionFor(-60, 'R')).toBeLessThan(0);
  });

  it('a right-hander who is LATE goes the other way', () => {
    expect(directionFor(60, 'R')).toBeGreaterThan(0);
  });

  it('⚠️ a LEFT-hander who is early pulls to RIGHT — the bug that was fixed', () => {
    expect(directionFor(-60, 'L')).toBeGreaterThan(0);
  });

  it('the two hands are mirror images', () => {
    for (const off of [-70, -20, 0, 25, 65]) {
      expect(directionFor(off, 'L')).toBeCloseTo(-directionFor(off, 'R'), 6);
    }
  });

  it('stays inside the foul lines', () => {
    for (const off of [-500, -90, 90, 500]) {
      for (const hand of ['L', 'R'] as const) {
        expect(Math.abs(directionFor(off, hand))).toBeLessThanOrEqual(45);
      }
    }
  });

  it('defaults to a right-hander when nobody says', () => {
    expect(directionFor(-40)).toBe(directionFor(-40, 'R'));
  });

  it('reaches resolveSwing, so a lefty really does spray the other way', () => {
    const base: SwingInput = { offsetMs: -55, pitchType: 'fastball', stats: { power: 1, contact: 1, clutch: 1 } };
    const r = resolveSwing({ ...base, batterHand: 'R' }, makeRng(3));
    const l = resolveSwing({ ...base, batterHand: 'L' }, makeRng(3));
    expect(Math.sign(r.direction)).toBe(-Math.sign(l.direction));
  });
});

describe('the foul knob', () => {
  const table = OUTCOME_TABLES.good.fastball;

  it('a boost of 1 changes nothing at all', () => {
    expect(applyFoul(table, 1)).toBe(table);
  });

  it('raises the foul share', () => {
    expect(applyFoul(table, 2.3).foul).toBeGreaterThan(table.foul);
  });

  it('still sums to one, so rollOutcome cannot fall through', () => {
    for (const boost of [1.5, 2.3, 4]) {
      const out = applyFoul(table, boost);
      const total = Object.values(out).reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(1, 6);
    }
  });

  it('leaves the RELATIVE mix of everything else untouched', () => {
    const out = applyFoul(table, 2.3);
    // single:double before and after must be the same ratio.
    expect(out.single / out.double).toBeCloseTo(table.single / table.double, 6);
    expect(out.strikeout / out.ground_out).toBeCloseTo(table.strikeout / table.ground_out, 6);
  });

  it('never runs the foul share past the cap', () => {
    expect(applyFoul(table, 999).foul).toBeLessThanOrEqual(0.92);
  });

  it('produces a foul rate near real baseball at the tuned value', () => {
    const rng = makeRng(11);
    let fouls = 0;
    let swings = 0;
    for (let i = 0; i < 20000; i++) {
      const r = resolveSwing(
        {
          offsetMs: rng.range(-85, 85),
          pitchType: 'fastball',
          stats: { power: 1, contact: 1, clutch: 1 },
          foulBoost: FOUL_BOOST,
        },
        rng,
      );
      swings++;
      if (r.outcome === 'foul') fouls++;
    }
    const rate = fouls / swings;
    // Real baseball fouls off roughly a third of swings.
    expect(rate).toBeGreaterThan(0.24);
    expect(rate).toBeLessThan(0.45);
  });
});

describe('placing the ball', () => {
  it('a pulled ball lands on the pull side', () => {
    expect(place(hit({ direction: -38, exitVelocity: 95, launchAngle: 20 })).dirDeg).toBeLessThan(0);
  });

  it('a deep fly is further out than a chopper', () => {
    const deep = place(hit({ outcome: 'home_run', exitVelocity: 105, launchAngle: 28 }));
    const chop = place(hit({ outcome: 'ground_out', exitVelocity: 70, launchAngle: -6 }));
    expect(deep.distFt).toBeGreaterThan(chop.distFt);
  });

  it('names a fielder and a zone for every ball', () => {
    const rng = makeRng(5);
    for (let i = 0; i < 300; i++) {
      const p = place(
        hit({
          exitVelocity: rng.range(55, 110),
          launchAngle: rng.range(-10, 70),
          direction: rng.range(-44, 44),
        }),
      );
      expect(p.fielderNum).toBeGreaterThanOrEqual(1);
      expect(p.fielderNum).toBeLessThanOrEqual(9);
      expect(p.zone).toBeTruthy();
      expect(p.gapFt).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('the stretch', () => {
  const inSpace = { gapFt: GAP_FT + 10, inTheGap: true, distFt: 340, dirDeg: -10, zone: 'left-center' as const, fielderNum: 7 };
  const atHim = { gapFt: 5, inTheGap: false, distFt: 250, dirDeg: -10, zone: 'left' as const, fielderNum: 7 };

  it('a deep single in space becomes a double', () => {
    expect(stretch('single', inSpace)).toBe('double');
  });

  it('a single hit right at somebody stays a single', () => {
    expect(stretch('single', atHim)).toBe('single');
  });

  it('a double hit right at somebody is held to a single', () => {
    expect(stretch('double', atHim)).toBe('single');
  });

  it('⚠️ geometry NEVER awards a triple', () => {
    for (const dist of [200, 340, 420]) {
      for (const gap of [0, 80, 150, 300]) {
        const p = { ...inSpace, distFt: dist, gapFt: gap, inTheGap: gap >= GAP_FT };
        expect(stretch('double', p)).not.toBe('triple');
        expect(stretch('single', p)).not.toBe('triple');
      }
    }
  });

  it('a triple is held to a double unless it is genuinely in space', () => {
    expect(stretch('triple', { ...inSpace, gapFt: TRIPLE_GAP_FT - 1, inTheGap: false })).toBe('double');
    expect(stretch('triple', inSpace)).toBe('triple');
  });

  /**
   * ⚠️ THE REGRESSION THIS FILE DID NOT HAVE, and the reason the game had no
   * triples at all for weeks. Every test above builds a Placement by hand, so
   * all of them passed while the bar sat at a gap distance no real batted ball
   * could reach: the triple branch asked for 128ft and the balls the table
   * calls a triple top out at 128.3ft, so three in 4,706 survived.
   *
   * The fix is not a number, it is testing the two halves TOGETHER. Nothing
   * that hand-builds a Placement can catch a bar the geometry cannot clear.
   */
  it('⚠️ triples SURVIVE the geometry — the bar has to be reachable', () => {
    const rng = makeRng(20260828);
    const stats = { power: 1.0, contact: 1.0, vision: 1.0, clutch: 1.0, bunt: 1.0, speed: 1.0 };
    let hits = 0;
    let triples = 0;
    for (let i = 0; i < 30000; i++) {
      const res = resolveSwing(
        {
          offsetMs: rng.range(-60, 60),
          pitchType: 'fastball',
          stats,
        } as SwingInput,
        rng,
      );
      if (!res.isHit) continue;
      hits++;
      if (stretch(res.outcome, place(res)) === 'triple') triples++;
    }
    // A triple is ~1.7% of hits in real baseball. The point of the assertion is
    // the lower bound: it must not be zero.
    expect(triples).toBeGreaterThan(0);
    expect(triples / hits).toBeGreaterThan(0.005);
    expect(triples / hits).toBeLessThan(0.04);
  });

  it('never touches a home run or an out', () => {
    for (const o of ['home_run', 'ground_out', 'popup', 'line_out', 'strikeout', 'foul'] as Outcome[]) {
      expect(stretch(o, inSpace)).toBe(o);
      expect(stretch(o, atHim)).toBe(o);
    }
  });

  it('AT_HIM_FT sits below GAP_FT, or the two rules would contradict', () => {
    expect(AT_HIM_FT).toBeLessThan(GAP_FT);
  });
});

/**
 * ⚠️ THIS BLOCK USED TO ASSERT THE OPPOSITE — "a hit stays a hit and an out
 * stays an out" — and that assertion was the design being tested, not a safety
 * net around it. contest() deliberately breaks it. What has to hold now is the
 * weaker and more useful thing: the flip happens in BOTH directions, the two
 * directions cancel, and nothing downstream is left holding a stale flag.
 */
describe('the contest lets geometry decide, without moving the run environment', () => {
  /** One shared sample, so the three assertions below describe the same runs. */
  const sample = () => {
    const rng = makeRng(21);
    let robbed = 0;
    let dropped = 0;
    let checked = 0;
    const badFlag: string[] = [];
    const robbedExtraBase: string[] = [];

    for (let i = 0; i < 8000; i++) {
      const h = resolveSwing(
        {
          offsetMs: rng.range(-85, 85),
          pitchType: 'fastball',
          stats: { power: 0.8 + rng.next() * 0.8, contact: 1, clutch: 1 },
          foulBoost: FOUL_BOOST,
        },
        rng,
      );
      if (h.outcome === 'foul' || h.outcome === 'foul_out') continue;
      checked++;

      const out = withPlacement({ kind: 'in_play', hit: h });
      if (out.result.kind !== 'in_play') throw new Error('kind changed');
      const after = out.result.hit;

      // The flag and the outcome must never disagree. Getting this wrong puts
      // a man on first on a ball the scorer just called a line out — it was the
      // live bug in the first draft of contest(), because the old body carried
      // `isHit` across unchanged and was RIGHT to while every flip was hit-to-hit.
      if (after.isHit !== isHit(after.outcome)) badFlag.push(`${h.outcome}->${after.outcome}`);

      if (out.verdict === 'robbed') {
        robbed++;
        // Only a single is robbable. A double or a triple got past everybody by
        // definition and a home run is not on the field to be caught.
        if (h.outcome !== 'single') robbedExtraBase.push(h.outcome);
      }
      if (out.verdict === 'dropped') dropped++;
    }
    return { robbed, dropped, checked, badFlag, robbedExtraBase };
  };

  it('flips balls both ways, and never leaves isHit disagreeing with the outcome', () => {
    const s = sample();
    expect(s.badFlag).toEqual([]);
    expect(s.robbed).toBeGreaterThan(0);
    expect(s.dropped).toBeGreaterThan(0);
  });

  it('only ever takes a SINGLE away — never a double, triple or home run', () => {
    expect(sample().robbedExtraBase).toEqual([]);
  });

  /**
   * The whole safety argument for allowing the flip at all. The two flows are
   * matched by construction (see ROBBED_FT and HOLE_FT, both measured against
   * their own populations), so the hit column comes out where it went in.
   *
   * The tolerance is deliberately loose — this is a guard against one side
   * being switched off or retuned into the weeds, not a re-derivation of the
   * calibration. scripts/balance.ts is what actually holds the run environment.
   */
  it('takes away about as many hits as it gives', () => {
    const { robbed, dropped, checked } = sample();
    expect(Math.abs(robbed - dropped) / checked).toBeLessThan(0.015);
  });

  it('passes non-contact results straight through', () => {
    for (const r of [{ kind: 'walk' }, { kind: 'strikeout' }, { kind: 'hit_by_pitch' }] as const) {
      const out = withPlacement(r);
      expect(out.result).toBe(r);
      expect(out.placement).toBeNull();
      expect(out.text).toBeTruthy();
    }
  });
});

describe('the scorer says where it went', () => {
  it('describes every outcome without falling over', () => {
    const rng = makeRng(31);
    for (let i = 0; i < 400; i++) {
      const h = hit({
        exitVelocity: rng.range(55, 110),
        launchAngle: rng.range(-10, 70),
        direction: rng.range(-44, 44),
      });
      for (const o of ['single', 'double', 'triple', 'home_run', 'ground_out', 'popup', 'line_out'] as Outcome[]) {
        const text = describePlay(o, h, place(h));
        expect(text.length).toBeGreaterThan(3);
      }
    }
  });

  it('says "gap" on a ball into one', () => {
    const p = { gapFt: 200, inTheGap: true, distFt: 360, dirDeg: -14, zone: 'left-center' as const, fielderNum: 7 };
    expect(describePlay('double', hit(), p)).toContain('gap');
  });

  it('names the fielder on a ground out', () => {
    const p = { gapFt: 4, inTheGap: false, distFt: 120, dirDeg: -20, zone: 'infield' as const, fielderNum: 6 };
    expect(describePlay('ground_out', hit(), p)).toContain('short');
  });

  it('puts the distance on a home run', () => {
    const p = { gapFt: 90, inTheGap: false, distFt: 415, dirDeg: 5, zone: 'wall' as const, fielderNum: 8 };
    expect(describePlay('home_run', hit(), p)).toMatch(/41\d feet/);
  });
});

describe('the home run rate is the design doc\'s number', () => {
  it('a perfectly-timed fastball at power 1.0 lands in the 15-20% band', () => {
    const rng = makeRng(4242);
    let hr = 0;
    const N = 30000;
    for (let i = 0; i < N; i++) {
      const r = resolveSwing(
        { offsetMs: 0, pitchType: 'fastball', stats: { power: 1, contact: 1, clutch: 1 } },
        rng,
      );
      if (r.outcome === 'home_run') hr++;
    }
    const rate = hr / N;
    expect(rate).toBeGreaterThanOrEqual(0.15);
    expect(rate).toBeLessThanOrEqual(0.2);
  });

  it('still reads off the power curve, so it is a range not a number', () => {
    const rate = (power: number) => {
      const rng = makeRng(77);
      let hr = 0;
      for (let i = 0; i < 12000; i++) {
        const r = resolveSwing(
          { offsetMs: 0, pitchType: 'fastball', stats: { power, contact: 1, clutch: 1 } },
          rng,
        );
        if (r.outcome === 'home_run') hr++;
      }
      return hr / 12000;
    };
    expect(rate(0.65)).toBeLessThan(rate(1.0));
    expect(rate(1.0)).toBeLessThan(rate(1.5));
  });

  it('⚠️ every row still sums to 1, or rollOutcome silently biases ground outs', () => {
    for (const grade of Object.keys(OUTCOME_TABLES) as (keyof typeof OUTCOME_TABLES)[]) {
      for (const pitch of Object.keys(OUTCOME_TABLES[grade]) as (keyof typeof OUTCOME_TABLES[typeof grade])[]) {
        const total = Object.values(OUTCOME_TABLES[grade][pitch]).reduce((a, b) => a + b, 0);
        expect(total).toBeCloseTo(1, 9);
      }
    }
  });

  it('the out rate did NOT move — only the shape of the hits did', () => {
    // The increase was taken from singles/doubles/triples, never from the outs.
    const t = OUTCOME_TABLES.perfect.fastball;
    const outs = t.strikeout + t.popup + t.ground_out + t.line_out;
    expect(outs).toBeCloseTo(0.2, 6);
    expect(t.foul).toBeCloseTo(0.05, 6);
  });
});
