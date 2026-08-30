/**
 * THE RULES A FRANCHISE PLAYS UNDER. Two claims worth guarding: a setting
 * actually reaches the game (a knob that changes nothing is worse than no
 * knob), and a hand-edited save cannot produce a league that will not play.
 */
import { describe, expect, it } from 'vitest';
import {
  BRACKET, DEFAULT_RULES, LENGTHS, OFFENCE, PARITY, SERIES, STREAK,
  cleanRules, roundsIn, winsNeeded,
} from '../rules.ts';
import { leagueUnder, LEAGUE_AS_WRITTEN } from '../teams.ts';
import { newSeason, playDay, regularDays, rulesOf, standings, seasonEnd } from '../franchise.ts';

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const spread = (xs: readonly number[]): number => Math.max(...xs) - Math.min(...xs);
const power = (ts: readonly { lineup: readonly { power: number }[] }[]): number[] =>
  ts.map((t) => mean(t.lineup.map((p) => p.power)));

describe('cleaning a rules blob', () => {
  it('fills a blank one with the defaults', () => {
    expect(cleanRules(undefined)).toEqual(DEFAULT_RULES);
    expect(cleanRules({})).toEqual(DEFAULT_RULES);
    expect(cleanRules('nonsense')).toEqual(DEFAULT_RULES);
  });

  it('clamps a feel knob rather than throwing the save away', () => {
    // ⚠️ THE OPPOSITE OF loadSeason(). A silly parity is a season that plays a
    // bit differently; it is not a reason to delete somebody's franchise.
    expect(cleanRules({ parity: 99 }).parity).toBe(1);
    expect(cleanRules({ parity: -5 }).parity).toBe(0);
    expect(cleanRules({ offence: 100 }).offence).toBeLessThanOrEqual(1.4);
    expect(cleanRules({ streak: NaN }).streak).toBe(DEFAULT_RULES.streak);
  });

  it('refuses a bracket or a series that is not a shape the maths allows', () => {
    // ⚠️ CLAMPING IS WRONG FOR THESE TWO. A six-club bracket cannot halve and an
    // even series can end level — neither is "slightly off", both are a league
    // that will not play out, so they fall back rather than being squeezed.
    expect(cleanRules({ bracket: 6 }).bracket).toBe(DEFAULT_RULES.bracket);
    expect(cleanRules({ bracket: 3 }).bracket).toBe(DEFAULT_RULES.bracket);
    expect(cleanRules({ series: 4 }).series).toBe(DEFAULT_RULES.series);
    expect(cleanRules({ series: 0 }).series).toBe(DEFAULT_RULES.series);
    for (const c of BRACKET) expect(cleanRules({ bracket: c.value }).bracket).toBe(c.value);
    for (const c of SERIES) expect(cleanRules({ series: c.value }).series).toBe(c.value);
  });

  it('every offered choice survives cleaning', () => {
    for (const c of PARITY) expect(cleanRules({ parity: c.value }).parity).toBe(c.value);
    for (const c of STREAK) expect(cleanRules({ streak: c.value }).streak).toBe(c.value);
    for (const c of OFFENCE) expect(cleanRules({ offence: c.value }).offence).toBe(c.value);
    for (const l of LENGTHS) expect(cleanRules({ games: l.games }).games).toBe(l.games);
  });
});

describe('the bracket arithmetic', () => {
  it('halves down to one', () => {
    expect(roundsIn(2)).toBe(1);
    expect(roundsIn(4)).toBe(2);
    expect(roundsIn(8)).toBe(3);
  });
  it('needs a majority of an odd series', () => {
    expect(winsNeeded(1)).toBe(1);
    expect(winsNeeded(3)).toBe(2);
    expect(winsNeeded(5)).toBe(3);
    expect(winsNeeded(7)).toBe(4);
  });
});

describe('a setting reaches the league', () => {
  it('parity narrows the gap between clubs, and 1 leaves them as written', () => {
    const wide = power(leagueUnder(1, 1));
    const tight = power(leagueUnder(0.2, 1));
    expect(spread(tight)).toBeLessThan(spread(wide));
    expect(power(leagueUnder(1, 1))).toEqual(power(LEAGUE_AS_WRITTEN));
  });

  it('offence moves every bat by the same factor and re-ranks nobody', () => {
    const flat = leagueUnder(0.35, 1);
    const lively = leagueUnder(0.35, 1.1);
    flat.forEach((t, i) => {
      t.lineup.forEach((p, n) => {
        expect(lively[i]!.lineup[n]!.power).toBeCloseTo(p.power * 1.1);
        expect(lively[i]!.lineup[n]!.contact).toBeCloseTo(p.contact * 1.1);
      });
    });
    // ⚠️ THE ARMS DO NOT MOVE. A run-environment knob that weakened thirty
    // staffs would make every ERA in the record book a lie about the pitchers.
    flat.forEach((t, i) => {
      t.rotation.forEach((a, n) => {
        expect(lively[i]!.rotation[n]!.break ?? 1).toBe(a.break ?? 1);
      });
    });
  });

  it('a livelier ball actually scores more runs', () => {
    const runsUnder = (offence: number): number => {
      let s = newSeason('---', 99, 14, { ...DEFAULT_RULES, games: 14, offence, streak: 0 });
      while (s.day < regularDays(s)) s = playDay(s);
      const t = standings(s);
      return t.reduce((a, r) => a + r.rf, 0) / t.reduce((a, r) => a + r.w + r.l, 0);
    };
    expect(runsUnder(1.1)).toBeGreaterThan(runsUnder(0.9));
  });

  it('a season carries its own rules and its own calendar', () => {
    const s = newSeason('ALB', 1, 28, { ...DEFAULT_RULES, games: 28, bracket: 8, series: 5 });
    expect(rulesOf(s).bracket).toBe(8);
    expect(regularDays(s)).toBe(28);
    expect(seasonEnd(s)).toBe(28 + 3 * 5);
  });

  it('a season saved before rules existed plays under the defaults', () => {
    const old = { ...newSeason('ALB', 1, 14) } as Record<string, unknown>;
    delete old['rules'];
    expect(rulesOf(old as never)).toMatchObject({ parity: DEFAULT_RULES.parity });
    expect(regularDays(old as never)).toBe(14);
  });
});

describe('the defaults are the measured values', () => {
  it('parity and streak come from where they were tuned, not a second copy', async () => {
    // ⚠️ THE EXHIBITION AND THE SCRIPTS READ LEAGUE, which is built at
    // TALENT_SPREAD. A default franchise builds its own at DEFAULT_RULES.parity.
    // If those two ever differ, the game you tune and the game you ship are
    // different games and nothing else would say so.
    const { TALENT_SPREAD } = await import('../tuning.ts');
    const { FORM_SWING } = await import('../form.ts');
    expect(DEFAULT_RULES.parity).toBe(TALENT_SPREAD);
    expect(DEFAULT_RULES.streak).toBe(FORM_SWING);
    // ...and the REAL option on each row is that same value, so the lit button
    // on a fresh screen is the one the game was balanced at.
    expect(PARITY.find((c) => c.name === 'REAL')!.value).toBe(TALENT_SPREAD);
    expect(STREAK.find((c) => c.name === 'REAL')!.value).toBe(FORM_SWING);
  });

  it('a default franchise gets the same league the exhibition plays', async () => {
    const { LEAGUE } = await import('../teams.ts');
    const under = leagueUnder(DEFAULT_RULES.parity, DEFAULT_RULES.offence);
    expect(power(under)).toEqual(power(LEAGUE));
  });
});
