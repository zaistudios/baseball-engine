/**
 * THE HITTER'S APPROACH — the other half of the pitcher's plan.
 *
 * `isPowerSwing` was implemented, tested and reachable by no input path in the
 * game for months; the README carried it as an open question. Wiring it needed
 * a counterpart, because a free damage toggle is not a decision — the
 * counterpart is what a real hitter does with two strikes.
 *
 * What these lock is the SHAPE: sitting on it trades contact for damage,
 * protecting trades damage for survival, they are mutually exclusive, and the
 * choice at two strikes is a real one in both directions.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveSwing,
  SIT_ON_IT_CONTACT,
  PROTECT_CONTACT,
  type SwingInput,
} from '../hit.ts';
import { makeRng } from '../rng.ts';
import { isHit } from '../hitTables.ts';

/**
 * TWO SAMPLE POINTS, because no single row can answer both questions.
 *
 * The outcome tables are sparse by design: the `perfect` row has a home run
 * probability and NO strikeout probability, and the `good` row is the exact
 * reverse. So a damage comparison has to be taken dead-on and a whiff
 * comparison has to be taken off it, or one side of every assertion is zero
 * against zero.
 *
 * DEAD_ON is 0; OFF_IT is +20ms, which is 'good' under all three stances —
 * 35 base, 30.8 sitting, 41.3 protecting — so the comparison is between
 * multipliers on ONE row rather than between different rows. Changing it to a
 * number that straddles a window edge would silently start measuring the
 * window instead of the table.
 */
const DEAD_ON = 0;
const OFF_IT = 20;

/**
 * Roll the same swing many times and report the outcome shares. The engine is
 * a probability table, so a distribution is the only honest assertion — a
 * single seeded roll would lock in a coincidence.
 */
function distribution(over: Partial<SwingInput>, offsetMs = DEAD_ON, n = 4000) {
  const counts: Record<string, number> = {};
  for (let seed = 1; seed <= n; seed++) {
    const r = resolveSwing({ offsetMs, pitchType: 'fastball', ...over }, makeRng(seed));
    counts[r.outcome] = (counts[r.outcome] ?? 0) + 1;
  }
  const share = (k: string) => (counts[k] ?? 0) / n;
  return {
    share,
    hits: Object.entries(counts).reduce(
      (a, [k, v]) => a + (isHit(k as never) ? v : 0),
      0,
    ) / n,
  };
}

describe('sitting on it — the risk-reward swing finally has an input', () => {
  it('trades contact for damage', () => {
    expect(distribution({ isPowerSwing: true }).share('home_run')).toBeGreaterThan(
      distribution({}).share('home_run'),
    );
    expect(distribution({ isPowerSwing: true }, OFF_IT).share('strikeout')).toBeGreaterThan(
      distribution({}, OFF_IT).share('strikeout'),
    );
  });

  it('narrows the timing window, so it is not free on a pitch you timed', () => {
    // Without this the toggle was pure upside for anyone who could already
    // time the pitch, which is not a decision.
    expect(SIT_ON_IT_CONTACT).toBeLessThan(1);
    const late = { offsetMs: 34, pitchType: 'fastball' } as const;
    expect(resolveSwing(late, makeRng(1)).timing).toBe('good');
    expect(resolveSwing({ ...late, isPowerSwing: true }, makeRng(1)).timing).toBe('late');
  });

  it('reports itself', () => {
    expect(resolveSwing({ offsetMs: 0, pitchType: 'fastball', isPowerSwing: true }, makeRng(1)).stance).toBe(
      'sitting',
    );
  });
});

describe('protecting — what two strikes now means', () => {
  it('widens the timing window', () => {
    expect(PROTECT_CONTACT).toBeGreaterThan(1);
    const late = { offsetMs: 38, pitchType: 'fastball' } as const;
    expect(resolveSwing(late, makeRng(1)).timing).toBe('late');
    expect(resolveSwing({ ...late, twoStrikes: true }, makeRng(1)).timing).toBe('good');
  });

  it('fouls far more pitches off, which is the survival', () => {
    // And it is genuinely free survival, because atBat.ts already knows a foul
    // with two strikes is not the third one. That is why the damage has to go.
    const normal = distribution({}, OFF_IT);
    const protecting = distribution({ twoStrikes: true }, OFF_IT);
    expect(protecting.share('foul')).toBeGreaterThan(normal.share('foul'));
    expect(protecting.share('strikeout')).toBeLessThan(normal.share('strikeout'));
  });

  it('gives up the damage in exchange', () => {
    expect(distribution({ twoStrikes: true }).share('home_run')).toBeLessThan(
      distribution({}).share('home_run'),
    );
  });

  it('reports itself', () => {
    expect(resolveSwing({ offsetMs: 0, pitchType: 'fastball', twoStrikes: true }, makeRng(1)).stance).toBe(
      'protecting',
    );
  });
});

describe('the two are exclusive, and that exclusivity IS the decision', () => {
  it('lets sitting on it override protecting at two strikes', () => {
    const r = resolveSwing(
      { offsetMs: 0, pitchType: 'fastball', twoStrikes: true, isPowerSwing: true },
      makeRng(1),
    );
    expect(r.stance).toBe('sitting');
  });

  it('makes two strikes a real fork rather than a countdown', () => {
    // Protect and you survive but cannot do damage; sit on it and you can end
    // the game or the at-bat. Both have to be live or there is no choice.
    expect(distribution({ twoStrikes: true, isPowerSwing: true }).share('home_run')).toBeGreaterThan(
      distribution({ twoStrikes: true }).share('home_run') * 2,
    );
    expect(distribution({ twoStrikes: true }, OFF_IT).share('strikeout')).toBeLessThan(
      distribution({ twoStrikes: true, isPowerSwing: true }, OFF_IT).share('strikeout'),
    );
  });

  it('leaves an ordinary swing alone', () => {
    expect(resolveSwing({ offsetMs: 0, pitchType: 'fastball' }, makeRng(1)).stance).toBe('normal');
  });
});

describe('it stacks with everything else the swing already knew', () => {
  it('compounds with the platoon split rather than replacing it', () => {
    // Sitting on a same-handed slider is the worst window in the game, which
    // is exactly the trap it should be.
    const r = resolveSwing(
      {
        offsetMs: 0,
        pitchType: 'slider',
        batterHand: 'R',
        pitcherHand: 'R',
        isPowerSwing: true,
      },
      makeRng(1),
    );
    expect(r.platoon).toBeLessThan(1);
    expect(r.stance).toBe('sitting');
  });

  it('never turns a whiff into contact', () => {
    // No modifier may reach past a miss. Rule 4's shape, restated for stances.
    const miss = { offsetMs: 500, pitchType: 'fastball' } as const;
    for (const over of [{}, { twoStrikes: true }, { isPowerSwing: true }]) {
      const r = resolveSwing({ ...miss, ...over }, makeRng(3));
      expect(r.timing).toBe('miss');
      expect(r.outcome).toBe('strikeout');
    }
  });
});
