/**
 * Launch angle and direction — the two numbers that make contact LOOK
 * different without anyone animating nine outcomes by hand.
 *
 * Both were ported from HitCalculator after the fact. The angle table came
 * across verbatim; the direction scale did not, and the third test explains
 * why.
 */

import { describe, it, expect } from 'vitest';
import { resolveSwingSeeded, DIRECTION_DEG_PER_MS, type PitchLocation } from '../hit.ts';
import { ALL_OUTCOMES, type Outcome } from '../hitTables.ts';

/** Roll seeds until the wanted outcome shows up. Real rolls, not stubs. */
function find(want: Outcome, offsetMs = 30) {
  for (let seed = 1; seed < 6000; seed++) {
    const r = resolveSwingSeeded({ offsetMs, pitchType: 'curveball' }, seed);
    if (r.outcome === want) return r;
  }
  throw new Error(`no seed produced ${want}`);
}

describe('launch angle', () => {
  it('sends a popup steeply up and a chopper into the dirt', () => {
    expect(find('popup').launchAngle).toBeGreaterThan(40);
    expect(find('ground_out').launchAngle).toBeLessThan(6);
  });

  it('gives a home run the carry a home run needs', () => {
    const hr = find('home_run', 0);
    expect(hr.launchAngle).toBeGreaterThanOrEqual(25);
    expect(hr.launchAngle).toBeLessThanOrEqual(35);
    expect(hr.exitVelocity).toBeGreaterThan(find('popup').exitVelocity);
  });

  it('leaves a whiff with no flight at all', () => {
    const miss = resolveSwingSeeded({ offsetMs: 500, pitchType: 'fastball' }, 1);
    expect(miss.outcome).toBe('strikeout');
    expect(miss.exitVelocity).toBe(0);
  });
});

describe('direction', () => {
  it('pulls when early and goes the other way when late', () => {
    expect(resolveSwingSeeded({ offsetMs: -60, pitchType: 'fastball' }, 3).direction).toBeLessThan(0);
    expect(resolveSwingSeeded({ offsetMs: 60, pitchType: 'fastball' }, 3).direction).toBeGreaterThan(0);
  });

  it('goes up the middle when the timing is dead on', () => {
    expect(resolveSwingSeeded({ offsetMs: 0, pitchType: 'fastball' }, 3).direction).toBe(0);
  });

  it('spreads the contact window across the whole field', () => {
    // The prototype multiplied a value in SECONDS by 40, so its entire
    // +/-0.06s window mapped to +/-2.4 degrees and every ball went up the
    // middle. Nobody ever saw it, because calculate_hit() never ran.
    expect(0.06 * 40).toBeLessThan(3);
    expect(80 * DIRECTION_DEG_PER_MS).toBe(45);
  });

  it('never points off the field, however wild the swing', () => {
    for (const ms of [-5000, -81, 0, 81, 5000]) {
      const r = resolveSwingSeeded({ offsetMs: ms, pitchType: 'fastball' }, 5);
      expect(Math.abs(r.direction)).toBeLessThanOrEqual(45);
    }
  });
});

/**
 * Pitch location. Coverage found these: `pitcher.ts` assigns a location to
 * every pitch and `main.ts` passes it through, but no test had ever supplied
 * one — so four of `applyLocation`'s five arms had never executed, and they
 * move the home run rate by up to 1.4x either way.
 */
describe('where the pitch was, and what it does to the ball', () => {
  /** Outcome shares over many swings at one location, at fixed timing. */
  function shares(location: PitchLocation, offsetMs = 0) {
    const counts = new Map<Outcome, number>();
    const n = 4000;
    for (let seed = 1; seed <= n; seed++) {
      const r = resolveSwingSeeded({ offsetMs, pitchType: 'fastball', location }, seed);
      counts.set(r.outcome, (counts.get(r.outcome) ?? 0) + 1);
    }
    return (o: Outcome) => (counts.get(o) ?? 0) / n;
  }

  it('turns a high pitch into fly balls and a low one into grounders', () => {
    const high = shares('high');
    const low = shares('low');
    expect(high('home_run')).toBeGreaterThan(low('home_run'));
    expect(low('ground_out')).toBeGreaterThan(high('ground_out'));
  });

  it('keeps the ball down on a low pitch, however well timed', () => {
    // home_run *= 0.3 is the strongest single modifier in the table. If this
    // ever stops holding, someone has reordered the multipliers.
    expect(shares('low')('home_run')).toBeLessThan(shares('middle')('home_run'));
  });

  it('pays a little for inside and charges a little for outside', () => {
    expect(shares('inside')('home_run')).toBeGreaterThan(shares('middle')('home_run'));
    expect(shares('outside')('home_run')).toBeLessThan(shares('middle')('home_run'));
  });

  it('leaves a middle pitch exactly as the table wrote it', () => {
    // 'middle' returns the probs object untouched rather than normalising a
    // copy, so it is the one arm that must be bit-identical to no location.
    for (let seed = 1; seed <= 200; seed++) {
      const withLoc = resolveSwingSeeded({ offsetMs: 12, pitchType: 'curveball', location: 'middle' }, seed);
      const without = resolveSwingSeeded({ offsetMs: 12, pitchType: 'curveball' }, seed);
      expect(withLoc.outcome).toBe(without.outcome);
    }
  });

  it('still totals one after every location is applied', () => {
    // applyLocation normalises. A location that dropped probability mass would
    // bias rollOutcome toward its post-loop ground_out fallback and never say so.
    for (const loc of ['high', 'low', 'inside', 'outside', 'middle'] as const) {
      const s = shares(loc);
      // ⚠️ ALL_OUTCOMES, NOT A HAND-LISTED NINE. These are MEASURED shares, so
      // the day a tenth outcome arrived the nine stopped summing to one — by
      // exactly the new one's rate — and the failure read as lost probability
      // mass rather than as a stale list. Third hardcoded copy of this
      // vocabulary to break the same way.
      const total = ALL_OUTCOMES.reduce((sum, o) => sum + s(o), 0);
      expect(total).toBeCloseTo(1, 5);
    }
  });
});

/**
 * The power stat. Coverage found this one too: `applyPower` returns early at
 * power <= 1.0, and the whole starting Holdouts lineup runs 0.65-0.80 — so
 * every test that used default or early-game stats took the early return and
 * the body had never executed. It fires constantly once machines and items are
 * in the run, and it DOUBLES home run probability.
 */
describe('power, once a hitter has any', () => {
  function shares(power: number, offsetMs = 0) {
    const counts = new Map<Outcome, number>();
    const n = 4000;
    for (let seed = 1; seed <= n; seed++) {
      const r = resolveSwingSeeded({ offsetMs, pitchType: 'fastball', stats: { power } }, seed);
      counts.set(r.outcome, (counts.get(r.outcome) ?? 0) + 1);
    }
    return (o: Outcome) => (counts.get(o) ?? 0) / n;
  }

  it('punishes a weak hitter, not just rewards a strong one', () => {
    // The half that used to be missing. applyPower returned early at <= 1.0,
    // so every Holdout — the whole starting lineup, 0.65 to 0.80 — hit exactly
    // like a 1.0 and the stat on their namecard changed nothing.
    const weak = shares(0.7);
    const flat = shares(1.0);
    expect(weak('home_run')).toBeLessThan(flat('home_run'));
    expect(weak('ground_out')).toBeGreaterThan(flat('ground_out'));
  });

  it('has no cliff at 1.0', () => {
    // The bug underneath the missing half: 1.00 was neutral and 1.001
    // multiplied home runs by 2.002, so the first sliver of power was worth
    // more than everything after it.
    //
    // ⚠️ MEASURED AGAINST A CONTROL STEP, NOT AN ABSOLUTE THRESHOLD. This used
    // to assert the gap across the seam was under 0.01, which quietly depended
    // on the home run base rate being 4%. When that was raised to the design
    // doc's 19% (2026-08-20) the same perfectly continuous curve produced a
    // proportionally bigger absolute step and the test failed on a change that
    // was not a regression. A cliff is a step that is bigger THAN ITS
    // NEIGHBOURS, so compare it to one of the same width away from the seam.
    const step = (a: number, b: number) => Math.abs(shares(b)('home_run') - shares(a)('home_run'));

    const acrossSeam = step(0.98, 1.02);
    const control = step(1.02, 1.06);

    // Allow real slack: these are sampled, and the curve is genuinely steeper
    // as power climbs. A true cliff was a 2x multiplier applied at one point.
    expect(acrossSeam).toBeLessThan(control * 2.5 + 0.005);
  });

  it('rises monotonically across the whole stat range', () => {
    let last = -1;
    for (const power of [0.6, 0.8, 1.0, 1.2, 1.5, 1.8]) {
      const hr = shares(power)('home_run');
      expect(hr).toBeGreaterThan(last);
      last = hr;
    }
  });

  it('turns power into extra bases', () => {
    const strong = shares(1.5);
    const flat = shares(1.0);
    expect(strong('home_run')).toBeGreaterThan(flat('home_run'));
    expect(strong('single')).toBeLessThan(flat('single'));
  });

  it('gets the ball airborne past 1.3, and not before', () => {
    // The nested threshold — ground_out *= 0.8 only above 1.3. Two hitters
    // either side of it should differ on grounders specifically.
    expect(shares(1.5)('ground_out')).toBeLessThan(shares(1.2)('ground_out'));
  });

  it('still totals one at every power level', () => {
    // Same hand-listed vocabulary, same reason it must not be. See above.
    const all: readonly Outcome[] = ALL_OUTCOMES;
    for (const power of [0.7, 1.0, 1.2, 1.35, 1.8]) {
      const s = shares(power);
      expect(all.reduce((sum, o) => sum + s(o), 0)).toBeCloseTo(1, 5);
    }
  });
});
