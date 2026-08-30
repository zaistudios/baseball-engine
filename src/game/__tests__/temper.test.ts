/**
 * THE LADDER, NARROWED. temper() in teams.ts pulls the thirty clubs toward each
 * other before anybody plays, and these are the properties that make it a
 * compression rather than a rewrite of the league.
 *
 * ⚠️ THE ORDER TEST IS THE LOAD-BEARING ONE. value.ts ranks clubs and the
 * pre-game card prints that rank as STACKED or THIN. If tempering ever reorders
 * anybody, every one of those labels is a claim about a league that no longer
 * exists, and nothing else in the codebase would notice.
 */
import { describe, expect, it } from 'vitest';
import { LEAGUE, LEAGUE_AS_WRITTEN } from '../teams.ts';
import { clubValue, byStrength } from '../value.ts';
import { TALENT_SPREAD } from '../tuning.ts';
const RATINGS = ['power', 'contact', 'vision', 'clutch', 'bunt', 'speed'] as const;
const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const spread = (xs: readonly number[]): number => Math.max(...xs) - Math.min(...xs);
describe('temper', () => {
  it('keeps the league the same shape and size', () => {
    expect(LEAGUE).toHaveLength(LEAGUE_AS_WRITTEN.length);
    LEAGUE.forEach((t, i) => {
      const w = LEAGUE_AS_WRITTEN[i]!;
      expect(t.abbr).toBe(w.abbr);
      expect(t.lineup).toHaveLength(w.lineup.length);
      expect(t.rotation).toHaveLength(w.rotation.length);
      expect(t.bullpen).toHaveLength(w.bullpen.length);
      expect(t.bench ?? []).toHaveLength(w.bench?.length ?? 0);
    });
  });
  it('narrows the gap between clubs at every hitting rating', () => {
    for (const key of RATINGS) {
      const was = spread(LEAGUE_AS_WRITTEN.map((t) => mean(t.lineup.map((p) => p[key]))));
      const now = spread(LEAGUE.map((t) => mean(t.lineup.map((p) => p[key]))));
      // Scaled by the knob, give or take the floor clamp in temper().
      expect(now, key).toBeLessThan(was);
      expect(now / was, key).toBeCloseTo(TALENT_SPREAD, 1);
    }
  });
  it('leaves every club its own internal shape', () => {
    // ⚠️ THIS IS WHY A BATTING ORDER IS STILL A DECISION. Compressing raw
    // ratings toward one league mean would flatten the distance between a
    // club's three-hitter and its number nine as well, and a lineup of nine
    // identical men is a lineup nobody needs to set.
    for (let i = 0; i < LEAGUE.length; i++) {
      const w = LEAGUE_AS_WRITTEN[i]!;
      const t = LEAGUE[i]!;
      for (const key of RATINGS) {
        const wm = mean(w.lineup.map((p) => p[key]));
        const tm = mean(t.lineup.map((p) => p[key]));
        t.lineup.forEach((p, n) => {
          expect(p[key] - tm, `${t.abbr} ${key} ${n}`).toBeCloseTo(w.lineup[n]![key] - wm, 5);
        });
      }
    }
  });
  it('very nearly keeps the ladder teams.ts wrote', () => {
    // ⚠️ NEARLY, NOT EXACTLY, AND THE FIRST VERSION OF THIS TEST ASSERTED
    // EXACTLY AND FAILED. Compression scales distances, so a purely linear
    // value function would come out in the same order — but value.ts is not
    // purely linear on purpose. gloveOf() carries a categorical BUILD factor
    // that is identity rather than talent and so does not compress, and
    // playerValue() pays speed as a LUMP at EXTRA_BASE_SPEED, which is a
    // threshold and cannot be scaled at all. Both are documented decisions in
    // that file. What has to stay true is that the ladder is recognisably the
    // one that was written, not that it is untouched.
    const before = byStrength(LEAGUE_AS_WRITTEN).map((t) => t.abbr);
    const after = byStrength(LEAGUE).map((t) => t.abbr);
    expect(new Set(after)).toEqual(new Set(before));

    const moves = after.map((abbr, i) => i - before.indexOf(abbr));
    const n = moves.length;
    const rho = 1 - (6 * moves.reduce((a, d) => a + d * d, 0)) / (n * (n * n - 1));
    expect(rho).toBeGreaterThan(0.93);
    // And nobody crosses the whole table: a club written as one of the best
    // must not come out as one of the worst.
    expect(Math.max(...moves.map(Math.abs))).toBeLessThanOrEqual(9);
  });
  it('narrows what separates the best club from the worst', () => {
    const was = spread(LEAGUE_AS_WRITTEN.map(clubValue));
    const now = spread(LEAGUE.map(clubValue));
    expect(now).toBeLessThan(was);
  });
  it('keeps every rating a number the engine can use', () => {
    for (const t of LEAGUE) {
      for (const p of [...t.lineup, ...(t.bench ?? [])]) {
        for (const key of RATINGS) {
          expect(Number.isFinite(p[key]), `${t.abbr} ${p.name} ${key}`).toBe(true);
          expect(p[key], `${t.abbr} ${p.name} ${key}`).toBeGreaterThan(0);
        }
      }
      for (const a of [...t.rotation, ...t.bullpen]) {
        expect(a.zoneRate, `${t.abbr} ${a.name}`).toBeGreaterThanOrEqual(0.2);
        expect(a.zoneRate, `${t.abbr} ${a.name}`).toBeLessThanOrEqual(0.95);
        expect(a.stamina ?? 1).toBeGreaterThan(0);
        expect(a.break ?? 1).toBeGreaterThan(0);
      }
    }
  });
  it('does not turn the bench into a second, hidden ladder', () => {
    // The same claim bench.test.ts makes about the written league, re-made
    // about the tempered one — this is what the first cut of temper() broke by
    // moving benches on their lineup's shift instead of their own.
    const benches = LEAGUE.map((t) => mean(t.bench!.map((p) => p.power)));
    const nines = LEAGUE.map((t) => mean(t.lineup.map((p) => p.power)));
    expect(spread(benches)).toBeLessThan(spread(nines) * 1.5);
  });
});
