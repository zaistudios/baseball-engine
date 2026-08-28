/**
 * The franchise's new half: what a club is worth, and whether the season keeps
 * a record of itself.
 *
 * The claim under all of it is the one that makes roster features possible at
 * all — a better roster finishes higher. That is measured properly by
 * scripts/season.ts over forty seasons; what is asserted here is the part that
 * must be true every time, not on average.
 */

import { describe, expect, it } from 'vitest';
import { LEAGUE, club } from '../teams.ts';
import { armValue, byStrength, clubValue, playerValue, showScale, strengthLabel, strengthRank } from '../value.ts';
import { newSeason, playDay, standings, REGULAR_DAYS, BLOWOUT } from '../franchise.ts';

/** Nobody's club, so playDay() simulates all four games instead of skipping one. */
const NOBODY = '---';

describe('what a club is worth', () => {
  it('rewards every hitting rating', () => {
    const base = club('ALB').lineup[0]!;
    const better = { ...base, power: base.power + 0.2 };
    expect(playerValue(better)).toBeGreaterThan(playerValue(base));
    expect(playerValue({ ...base, vision: base.vision + 0.2 })).toBeGreaterThan(playerValue(base));
    expect(playerValue({ ...base, contact: base.contact + 0.2 })).toBeGreaterThan(playerValue(base));
  });

  it('rewards every pitching rating', () => {
    const base = club('ALB').rotation[0]!;
    expect(armValue({ ...base, break: (base.break ?? 1) + 0.2 })).toBeGreaterThan(armValue(base));
    expect(armValue({ ...base, zoneRate: base.zoneRate + 0.1 })).toBeGreaterThan(armValue(base));
    expect(armValue({ ...base, stamina: (base.stamina ?? 1) + 0.2 })).toBeGreaterThan(armValue(base));
  });

  it('ranks the eight without a tie at the top', () => {
    const order = byStrength(LEAGUE);
    expect(order).toHaveLength(LEAGUE.length);
    expect(clubValue(order[0]!)).toBeGreaterThan(clubValue(order.at(-1)!));
    expect(strengthRank(order[0]!, LEAGUE)).toBe(1);
    expect(strengthRank(order.at(-1)!, LEAGUE)).toBe(LEAGUE.length);
  });

  it('the league is DELIBERATELY unequal — this is the franchise premise', () => {
    // ⚠️ If this ever collapses toward zero, teams.ts has been re-balanced and
    // no trade, signing or development step can ever be felt again. See
    // value.ts, and re-measure with scripts/season.ts.
    const vals = LEAGUE.map(clubValue);
    const spread = (Math.max(...vals) - Math.min(...vals)) / Math.min(...vals);
    expect(spread).toBeGreaterThan(0.05);
  });

  it('labels a rank without inventing a scale', () => {
    expect(strengthLabel(1, 8)).toBe('STACKED');
    expect(strengthLabel(8, 8)).toBe('THIN');
    expect(strengthLabel(1, 1)).toBe('THE LEAGUE');
  });

  it('shows a 1.0 rating as an average major leaguer', () => {
    expect(showScale(1)).toBe(50);
    expect(showScale(0)).toBe(20); // floored, never negative
    expect(showScale(9)).toBe(99); // capped
  });
});

describe('a season keeps its own record', () => {
  const play = (days: number) => {
    let s = newSeason(NOBODY, 4242);
    for (let i = 0; i < days; i++) s = playDay(s);
    return s;
  };

  it('stores hits alongside runs, and the table folds them', () => {
    const s = play(3);
    expect(s.results.every((r) => typeof r.hh === 'number' && typeof r.ah === 'number')).toBe(true);
    expect(standings(s).reduce((a, r) => a + r.hf, 0)).toBeGreaterThan(0);
  });

  it('carries roster value into the standings, so the table can show it', () => {
    for (const row of standings(play(1))) expect(row.value).toBeGreaterThan(0);
  });

  it('writes a wire, and never more than a few lines a day', () => {
    const s = play(5);
    expect(s.news!.length).toBeGreaterThan(0);
    for (let d = 0; d < 5; d++) {
      expect(s.news!.filter((n) => n.day === d).length).toBeLessThanOrEqual(3);
    }
  });

  it('only calls a game a rout when it was one', () => {
    const s = play(REGULAR_DAYS);
    for (const item of s.news!.filter((n) => n.kind === 'game')) {
      expect(item.text).toMatch(/rout|shut out/);
      // A shutout qualifies on its own; a rout has to clear the margin.
      if (item.text.includes('shut out')) continue;
      const [, w, l] = item.text.match(/(\d+)-(\d+)/)!;
      expect(Math.abs(Number(w) - Number(l))).toBeGreaterThanOrEqual(BLOWOUT);
    }
  });

  it('announces the bracket exactly once, on the day it exists', () => {
    const s = play(REGULAR_DAYS);
    const set = s.news!.filter((n) => n.text.startsWith('Playoffs set'));
    expect(set).toHaveLength(1);
    expect(set[0]!.day).toBe(REGULAR_DAYS - 1);
  });

  it('an old save with no wire and no hits still folds', () => {
    // Exactly the shape a v2 season written before any of this had.
    const old = { ...newSeason(NOBODY, 1), news: undefined, results: [
      { home: 'ALB', away: 'DET', day: 0, hr: 5, ar: 2 },
    ] };
    const table = standings(old);
    expect(table.find((r) => r.abbr === 'ALB')!.w).toBe(1);
    expect(table.find((r) => r.abbr === 'ALB')!.hf).toBe(0);
    expect(() => playDay(old)).not.toThrow();
  });
});
