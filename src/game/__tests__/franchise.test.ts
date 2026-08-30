/**
 * The schedule is generated and the bracket is derived, so these are the
 * invariants that go wrong when they go wrong: a club playing twice in a day,
 * a club idle, an unbalanced home slate, a bracket that re-seeds itself once
 * the playoff results land, a season that never ends.
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_GAMES,
  DEFAULT_RULES,
  LENGTHS,
  MAX_GAMES,
  champion,
  dayLabel,
  matchupsInRound,
  gamesOn,
  newSeason,
  playDay,
  regularDays,
  resultsOn,
  schedule,
  seasonEnd,
  seasonOver,
  seeds,
  roundName,
  roundsOf,
  stillIn,
  simTo,
  standings,
  teamOf,
  yourGame,
  type Matchup,
  type Result,
  type Season,
} from '../franchise.ts';
import { LEAGUE } from '../teams.ts';

const ABBRS = LEAGUE.map((t) => t.abbr);
const DAYS = schedule(DEFAULT_GAMES);
const flat = (d: readonly (readonly Matchup[])[]): Matchup[] => d.flatMap((x) => [...x]);

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
      const games = flat(DAYS).filter((g) => g.home === abbr || g.away === abbr);
      expect(games, abbr).toHaveLength(14);
      expect(games.filter((g) => g.home === abbr), abbr).toHaveLength(7);
    }
  });

  it('gives every club seven opponents, each of them home and away', () => {
    // ⚠️ SEVEN OPPONENTS, NOT EVERY CLUB. At eight clubs those were the same
    // sentence; at thirty they are not, and cutting the rotation short is what
    // keeps a thirty-club league a half-hour game. See schedule() in
    // franchise.ts — a fourteen-game year is seven rounds, home and away.
    for (const a of ABBRS) {
      const foes = new Set(
        flat(DAYS).filter((g) => g.home === a || g.away === a).map((g) => (g.home === a ? g.away : g.home)),
      );
      expect(foes.size, a).toBe(7);
      for (const b of foes) {
        expect(flat(DAYS).filter((g) => g.home === a && g.away === b), `${a} at home v ${b}`).toHaveLength(1);
        expect(flat(DAYS).filter((g) => g.home === b && g.away === a), `${a} away at ${b}`).toHaveLength(1);
      }
    }
  });

  /**
   * ⚠️ THE SAME INVARIANTS AT EVERY LENGTH THE PICKER OFFERS, up to the full
   * slate. The builder wraps its rotation past fifty-eight games and slices at
   * the end, and both of those are places a club can quietly go idle, get
   * doubled up, or end the year with more home games than road ones.
   */
  it.each(LENGTHS.map((o) => o.games))('is a whole, balanced schedule at %i games', (n) => {
    const days = schedule(n);
    expect(days).toHaveLength(n);
    for (const [i, day] of days.entries()) {
      expect(day, `day ${i}`).toHaveLength(ABBRS.length / 2);
      expect(new Set(day.flatMap((g) => [g.home, g.away])).size, `day ${i}`).toBe(ABBRS.length);
    }
    for (const abbr of ABBRS) {
      const games = flat(days).filter((g) => g.home === abbr || g.away === abbr);
      expect(games, abbr).toHaveLength(n);
      // Even lengths are dealt as whole home-and-away pairs, so the split is
      // exact — see LENGTHS on why every option is even.
      expect(games.filter((g) => g.home === abbr).length, abbr).toBe(n / 2);
    }
  });

  it('never asks a club to face itself, even past the rotation wrap', () => {
    for (const g of flat(schedule(MAX_GAMES))) expect(g.home).not.toBe(g.away);
  });
});

describe('the regular season', () => {
  it('always has a game for you, right up to the last day of the schedule', () => {
    let s = newSeason('ALB', 7);
    for (let d = 0; d < regularDays(s); d++) {
      const mine = yourGame(s)!;
      expect(mine, `day ${d}`).toBeTruthy();
      expect(mine.home === 'ALB' || mine.away === 'ALB').toBe(true);
      s = playDay(s, { ...mine, day: d, hr: 3, ar: 2 });
    }
    expect(s.results.filter((r) => r.day < regularDays(s))).toHaveLength(regularDays(s) * (ABBRS.length / 2));
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
    const atSemis: Season = { ...s, day: regularDays(s), results: s.results.filter((r) => r.day < regularDays(s)) };
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
    const semis = resultsOn(s, regularDays(s));
    expect(semis).toHaveLength(2);

    const survivors = semis.map((r) => (r.hr > r.ar ? r.home : r.away));
    const decider = resultsOn(s, (regularDays(s) + 1));
    expect(decider).toHaveLength(1);
    expect(new Set([decider[0]!.home, decider[0]!.away])).toEqual(new Set(survivors));
    expect(four.indexOf(decider[0]!.home)).toBeLessThan(four.indexOf(decider[0]!.away));
  });

  it('keeps playoff games out of the record, so the bracket cannot re-seed', () => {
    const s = run(newSeason('MNE', 21), () => true);
    const table = standings(s);
    expect(table.reduce((n, r) => n + r.w + r.l, 0)).toBe(regularDays(s) * ABBRS.length);
    // Seeding is the same before and after the bracket was played.
    const before: Season = { ...s, results: s.results.filter((r) => r.day < regularDays(s)) };
    expect(seeds(s)).toEqual(seeds(before));
  });

  it('crowns exactly one champion and then stops', () => {
    const s = run(newSeason('NYE', 33), () => true);
    expect(seasonOver(s)).toBe(true);
    expect(s.day).toBe(seasonEnd(s));
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
    expect(s.results.filter((r) => r.home === 'LAC' || r.away === 'LAC')).toHaveLength(regularDays(s));
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

/**
 * THE SEASON'S LENGTH IS STATE NOW, and the calendar is what makes the long
 * ones playable. These are the two halves of that: a year of any length runs to
 * exactly one champion, and a jump forward leaves nobody a game short.
 */
describe('a season of your own length', () => {
  it('defaults to fourteen, and an old save with no length loads as fourteen', () => {
    expect(regularDays(newSeason('ALB', 1))).toBe(DEFAULT_GAMES);
    // The shape a version-4 blob has: no `games` key at all.
    const old = { ...newSeason('ALB', 1) } as Partial<Season>;
    delete old.games;
    expect(regularDays(old as Season)).toBe(DEFAULT_GAMES);
  });

  it.each(LENGTHS.map((o) => o.games))('runs a %i-game year out to one champion', (n) => {
    const s = run(newSeason('ALB', 4242, n), (d) => d % 3 !== 0);
    expect(regularDays(s)).toBe(n);
    expect(seasonOver(s)).toBe(true);
    expect(s.day).toBe(n + 2);
    expect(champion(s)).toBeTruthy();
    expect(seeds(s)).toContain(champion(s));
    // Every club played the whole schedule and nobody played more.
    const table = standings(s);
    for (const r of table) expect(r.w + r.l, r.abbr).toBe(n);
  });

  it('labels the days off the season it is given, not off a constant', () => {
    const s = newSeason('ALB', 1, 162);
    expect(dayLabel(s, 0)).toBe('GAME 1 OF 162');
    expect(dayLabel(s, 161)).toBe('GAME 162 OF 162');
    expect(dayLabel(s, 162)).toBe('SEMIFINAL');
    expect(dayLabel(s, 163)).toBe('CHAMPIONSHIP');
    expect(dayLabel(s, 164)).toBe('SEASON OVER');
  });
});

describe('skipping ahead', () => {
  /**
   * ⚠️ THE REGRESSION THIS EXISTS FOR. playDay() used to drop YOUR club's game
   * off the card whenever no result was handed in, which was invisible while
   * the only caller that did that was the eliminated-in-the-playoffs case.
   * Simming past a day you are on the card for is exactly that call, and
   * without the fix your club finishes the year with fewer games than the other
   * twenty-nine and a free ride up the standings.
   */
  it('plays your club too on a day you sim past', () => {
    const s = simTo(newSeason('ALB', 77, 28), 10);
    expect(s.day).toBe(10);
    for (const r of standings(s)) expect(r.w + r.l, r.abbr).toBe(10);
    expect(s.results.filter((r) => r.home === 'ALB' || r.away === 'ALB')).toHaveLength(10);
  });

  it('halts on a day the stop predicate claims, without playing it', () => {
    const s = simTo(newSeason('ALB', 5, 56), 40, (at) => at.day === 9);
    expect(s.day).toBe(9);
    // Day nine is NOT in the book — the caller gets to ask its question first.
    expect(resultsOn(s, 9)).toEqual([]);
    expect(resultsOn(s, 8)).not.toEqual([]);
  });

  it('stops at the end of the year rather than running past it', () => {
    const s = simTo(newSeason('ALB', 6, 14), 9999);
    expect(seasonOver(s)).toBe(true);
    expect(s.day).toBe(seasonEnd(s));
    expect(champion(s)).toBeTruthy();
  });

  it('does nothing at all when the target is behind you', () => {
    const s = simTo(newSeason('ALB', 6, 14), 5);
    expect(simTo(s, 2)).toBe(s);
  });
});

/**
 * ⚠️ THE BRACKET DOES NOT EXIST UNTIL THE SCHEDULE IS PLAYED OUT. seeds() will
 * fold a table that is all zeroes and hand back a top four off the abbr
 * tiebreak, so asking gamesOn() about a playoff day in March used to get a
 * confident, alphabetical, entirely fictional semifinal. Nothing noticed while
 * the only caller asked about today; the calendar asks about days that have not
 * happened, and drew "SEMIFINAL — vs CHF" beside game one.
 */
describe('the bracket before there is one', () => {
  it('has nothing to say about the playoffs mid-season', () => {
    const s = simTo(newSeason('ALB', 3, 14), 5);
    expect(gamesOn(s, regularDays(s))).toEqual([]);
    expect(gamesOn(s, (regularDays(s) + 1))).toEqual([]);
  });

  it('...and produces one the moment the last day is played', () => {
    const s = simTo(newSeason('ALB', 3, 14), 14);
    expect(s.day).toBe(14);
    expect(gamesOn(s, regularDays(s))).toHaveLength(2);
    // And it is the real top four, not the alphabet.
    expect(gamesOn(s, regularDays(s)).flatMap((g) => [g.home, g.away]).sort())
      .toEqual([...seeds(s)].sort());
  });
});

/**
 * THE BRACKET IS A SETTING NOW — any power-of-two field, any odd series length.
 * These are the invariants that a fixed two-round, one-game-each bracket got
 * for free and a general one does not: that a round halves, that a series ends
 * when somebody has enough wins and not before, that the days a round owns are
 * not played once it is decided, and that exactly one club is left at the end.
 */
describe('brackets of any shape', () => {
  const shapes: { bracket: number; series: number }[] = [
    { bracket: 2, series: 1 },
    { bracket: 4, series: 1 },
    { bracket: 4, series: 7 },
    { bracket: 8, series: 3 },
    { bracket: 8, series: 7 },
  ];

  const under = (bracket: number, series: number, seed = 4242): Season =>
    newSeason('ALB', seed, 14, { ...DEFAULT_RULES, games: 14, bracket, series });

  it.each(shapes)('crowns exactly one champion at bracket %o', ({ bracket, series }) => {
    const s = run(under(bracket, series), (d) => d % 3 !== 0);
    expect(seasonOver(s)).toBe(true);
    expect(roundsOf(s)).toBe(Math.log2(bracket));
    expect(s.day).toBe(14 + Math.log2(bracket) * series);
    const champ = champion(s);
    expect(champ).toBeTruthy();
    // The winner has to be one of the clubs that qualified.
    expect(seeds(s)).toContain(champ);
    expect(seeds(s)).toHaveLength(bracket);
  });

  it.each(shapes)('never plays a series past the clinch at %o', ({ bracket, series }) => {
    const s = run(under(bracket, series, 777), () => true);
    const need = Math.floor(series / 2) + 1;
    for (let r = 0; r < roundsOf(s); r++) {
      for (const line of matchupsInRound(s, r)) {
        // ⚠️ NOBODY WINS MORE THAN THEY NEEDED TO. A sweep in four must leave
        // games five, six and seven unplayed — that is what makes a round's
        // fixed block of days honest rather than a lie about the calendar.
        expect(Math.max(line.homeWins, line.awayWins), `round ${r}`).toBe(need);
        expect(line.homeWins + line.awayWins, `round ${r}`).toBeLessThanOrEqual(series);
        expect(line.winner).toBeTruthy();
      }
    }
  });

  it('halves the field every round, in seed order', () => {
    const s = run(under(8, 3), (d) => d % 2 === 0);
    expect(matchupsInRound(s, 0)).toHaveLength(4);
    expect(matchupsInRound(s, 1)).toHaveLength(2);
    expect(matchupsInRound(s, 2)).toHaveLength(1);
    // Round one is 1v8, 2v7, 3v6, 4v5 off the table.
    const four = seeds(s);
    expect(matchupsInRound(s, 0).map((m) => [m.home, m.away])).toEqual([
      [four[0], four[7]], [four[1], four[6]], [four[2], four[5]], [four[3], four[4]],
    ]);
    // ...and everybody in a later round won an earlier one.
    for (const m of matchupsInRound(s, 1)) {
      expect(matchupsInRound(s, 0).map((x) => x.winner)).toContain(m.home);
    }
  });

  it('alternates the host and gives the higher seed the odd games', () => {
    const s = run(under(2, 7), () => true);
    const [a, b] = seeds(s) as [string, string];
    const days = Array.from({ length: 7 }, (_, i) => 14 + i);
    const played = days.map((d) => resultsOn(s, d)[0]).filter(Boolean);
    played.forEach((r, i) => {
      expect(r!.home, `game ${i + 1}`).toBe(i % 2 === 0 ? a : b);
    });
  });

  it('names the rounds from the end backwards', () => {
    const eight = under(8, 1);
    expect(roundName(eight, 0)).toBe('ROUND OF 8');
    expect(roundName(eight, 1)).toBe('SEMIFINAL');
    expect(roundName(eight, 2)).toBe('CHAMPIONSHIP');
    // A two-club bracket is a championship and nothing else.
    expect(roundName(under(2, 1), 0)).toBe('CHAMPIONSHIP');
  });

  it('knows who is still alive', () => {
    const s = run(under(8, 3), () => true);
    const champ = champion(s)!;
    expect(stillIn(s, champ)).toBe(true);
    // Everybody who missed the bracket is out the moment it starts.
    const missed = standings(s).slice(8).map((r) => r.abbr);
    for (const abbr of missed.slice(0, 3)) expect(stillIn(s, abbr)).toBe(false);
  });

  it('re-seeds nothing: the bracket is fixed once the schedule is done', () => {
    const s = run(under(8, 3), () => true);
    const before: Season = { ...s, results: s.results.filter((r) => r.day < 14) };
    expect(seeds(s)).toEqual(seeds(before));
  });
});
