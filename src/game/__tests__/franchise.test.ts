/**
 * The schedule is generated and the bracket is derived, so these are the
 * invariants that go wrong when they go wrong: a club playing twice in a day,
 * a club idle, an unbalanced home slate, a bracket that re-seeds itself once
 * the playoff results land, a season that never ends.
 */
import { describe, it, expect } from 'vitest';
import {
  DAYS,
  FINAL,
  OPPONENTS,
  REGULAR_DAYS,
  SEASON_END,
  SEMIS,
  champion,
  dayLabel,
  gamesOn,
  newSeason,
  playDay,
  resultsOn,
  seasonOver,
  seeds,
  standings,
  teamOf,
  yourGame,
  type Result,
  type Season,
} from '../franchise.ts';
import { LEAGUE } from '../teams.ts';

const ABBRS = LEAGUE.map((t) => t.abbr);

/** Play a season out, winning or losing every game of yours as told. */
function run(s: Season, youWin: (day: number) => boolean): Season {
  while (!seasonOver(s)) {
    const mine = yourGame(s);
    if (!mine) {
      s = playDay(s);
      continue;
    }
    const win = youWin(s.day);
    const youAreHome = mine.home === s.you;
    s = playDay(s, {
      ...mine,
      day: s.day,
      hr: youAreHome === win ? 9 : 1,
      ar: youAreHome === win ? 1 : 9,
    });
  }
  return s;
}

describe('the schedule', () => {
  it('is fourteen days with nobody idle and nobody doubled', () => {
    // ⚠️ COUNTED OFF THE LEAGUE, NOT OFF A LITERAL. These read 14 days of 4
    // games and 8 clubs, which was three ways of writing down that the league
    // had eight teams in it — and all three had to be edited by hand the day it
    // had thirty. What is actually being asserted is that every club plays
    // exactly once a day, whatever the league is.
    expect(DAYS).toHaveLength(14);
    for (const [i, day] of DAYS.entries()) {
      expect(day, `day ${i}`).toHaveLength(ABBRS.length / 2);
      expect(new Set(day.flatMap((g) => [g.home, g.away])).size, `day ${i}`).toBe(ABBRS.length);
    }
  });

  it('gives every club fourteen games, seven of them at home', () => {
    for (const abbr of ABBRS) {
      const games = DAYS.flat().filter((g) => g.home === abbr || g.away === abbr);
      expect(games, abbr).toHaveLength(14);
      expect(games.filter((g) => g.home === abbr), abbr).toHaveLength(7);
    }
  });

  it('gives every club seven opponents, each of them home and away', () => {
    // ⚠️ SEVEN OPPONENTS, NOT EVERY CLUB. At eight clubs those were the same
    // sentence; at thirty they are not, and OPPONENTS is the number that keeps
    // a thirty-club league a half-hour game. See the note on it in franchise.ts.
    for (const a of ABBRS) {
      const foes = new Set(
        DAYS.flat().filter((g) => g.home === a || g.away === a).map((g) => (g.home === a ? g.away : g.home)),
      );
      expect(foes.size, a).toBe(OPPONENTS);
      for (const b of foes) {
        expect(DAYS.flat().filter((g) => g.home === a && g.away === b), `${a} at home v ${b}`).toHaveLength(1);
        expect(DAYS.flat().filter((g) => g.home === b && g.away === a), `${a} away at ${b}`).toHaveLength(1);
      }
    }
  });
});

describe('the regular season', () => {
  it('always has a game for you, right up to the last day of the schedule', () => {
    let s = newSeason('ALB', 7);
    for (let d = 0; d < REGULAR_DAYS; d++) {
      const mine = yourGame(s)!;
      expect(mine, `day ${d}`).toBeTruthy();
      expect(mine.home === 'ALB' || mine.away === 'ALB').toBe(true);
      s = playDay(s, { ...mine, day: d, hr: 3, ar: 2 });
    }
    expect(s.results.filter((r) => r.day < REGULAR_DAYS)).toHaveLength(REGULAR_DAYS * (ABBRS.length / 2));
    expect(seasonOver(s)).toBe(false); // the bracket is still to come
  });

  it('folds results into a table where the wins and losses balance', () => {
    let s = newSeason('DET', 99);
    for (let d = 0; d < 5; d++) {
      const mine = yourGame(s)!;
      // You win them all, at home and on the road both.
      s = playDay(s, mine.home === 'DET'
        ? { ...mine, day: d, hr: 5, ar: 1 }
        : { ...mine, day: d, hr: 1, ar: 5 });
    }
    const table = standings(s);
    expect(table).toHaveLength(ABBRS.length);
    // One winner and one loser per game, five days of them.
    expect(table.reduce((n, r) => n + r.w, 0)).toBe((ABBRS.length / 2) * 5);
    expect(table.reduce((n, r) => n + r.w + r.l, 0)).toBe(ABBRS.length * 5);
    // ⚠️ NOT table[0]. At eight clubs, winning your first five put you alone at
    // the top; at thirty, somebody else can be 5-0 too and the tiebreak decides
    // which name is on row one. What is actually true is that nobody is AHEAD
    // of a club that has won them all.
    expect(table.find((r) => r.abbr === 'DET')).toMatchObject({ w: 5, l: 0, gb: 0 });
    expect(Math.max(...table.map((r) => r.w))).toBe(5);
  });

  it('re-simulates the same day the same way', () => {
    const s = newSeason('TEX', 12345);
    const mine = yourGame(s)!;
    const yours: Result = { ...mine, day: 0, hr: 4, ar: 3 };
    expect(playDay(s, yours).results).toEqual(playDay(s, yours).results);
  });
});

describe('the playoffs', () => {
  it('seeds one-four and two-three, with the better seed at home', () => {
    const s = run(newSeason('TEX', 4), () => true);
    // Rewound to the semifinal, the bracket is the top four of the table.
    const atSemis: Season = { ...s, day: SEMIS, results: s.results.filter((r) => r.day < SEMIS) };
    const four = seeds(atSemis);
    expect(four).toHaveLength(4);
    expect(gamesOn(atSemis)).toEqual([
      { home: four[0], away: four[3] },
      { home: four[1], away: four[2] },
    ]);
  });

  it('sends the two semifinal winners to the final, better seed hosting', () => {
    const s = run(newSeason('TEX', 4), () => true);
    const four = seeds(s);
    const semis = resultsOn(s, SEMIS);
    expect(semis).toHaveLength(2);

    const survivors = semis.map((r) => (r.hr > r.ar ? r.home : r.away));
    const decider = resultsOn(s, FINAL);
    expect(decider).toHaveLength(1);
    expect(new Set([decider[0]!.home, decider[0]!.away])).toEqual(new Set(survivors));
    expect(four.indexOf(decider[0]!.home)).toBeLessThan(four.indexOf(decider[0]!.away));
  });

  it('keeps playoff games out of the record, so the bracket cannot re-seed', () => {
    const s = run(newSeason('MNE', 21), () => true);
    const table = standings(s);
    expect(table.reduce((n, r) => n + r.w + r.l, 0)).toBe(REGULAR_DAYS * ABBRS.length);
    // Seeding is the same before and after the bracket was played.
    const before: Season = { ...s, results: s.results.filter((r) => r.day < SEMIS) };
    expect(seeds(s)).toEqual(seeds(before));
  });

  it('crowns exactly one champion and then stops', () => {
    const s = run(newSeason('NYE', 33), () => true);
    expect(seasonOver(s)).toBe(true);
    expect(s.day).toBe(SEASON_END);
    expect(champion(s)).toBeTruthy();
    expect(seeds(s)).toContain(champion(s));
    expect(yourGame(s)).toBeNull();
    expect(gamesOn(s)).toEqual([]);
    expect(dayLabel(s)).toBe('SEASON OVER');
  });

  it('still reaches a champion when you lose every game and miss the bracket', () => {
    const s = run(newSeason('LAC', 8), () => false);
    expect(seasonOver(s)).toBe(true);
    expect(seeds(s)).not.toContain('LAC');
    // You played fourteen and no more; the bracket went on without you.
    expect(s.results.filter((r) => r.home === 'LAC' || r.away === 'LAC')).toHaveLength(REGULAR_DAYS);
    expect(champion(s)).toBeTruthy();
    expect(champion(s)).not.toBe('LAC');
  });
});

describe('rosters as state', () => {
  it('seeds every club from the league and hands them back through teamOf', () => {
    const s = newSeason('FLA', 1);
    for (const t of LEAGUE) {
      expect(teamOf(s, t.abbr).abbr).toBe(t.abbr);
      expect(teamOf(s, t.abbr).lineup).toHaveLength(9);
    }
  });

  it('plays the season off its own rosters, not off the league', () => {
    // A club nerfed inside the season loses more than the same club untouched:
    // proof the sim reads Season.rosters and nothing reaches past it to LEAGUE.
    const base = newSeason('ALB', 555);
    const det = teamOf(base, 'DET');
    const gutted: Season = {
      ...base,
      rosters: {
        ...base.rosters,
        DET: { ...det, lineup: det.lineup.map((p) => ({ ...p, power: 0.1, contact: 0.1 })) },
      },
    };

    const record = (s: Season): number =>
      standings(run(s, () => true)).find((r) => r.abbr === 'DET')!.w;

    expect(record(gutted)).toBeLessThan(record(base));
    // ...and the league itself is untouched by any of it.
    expect(LEAGUE.find((t) => t.abbr === 'DET')!.lineup[0]!.power).toBeGreaterThan(0.5);
  });
});
