/**
 * THE BOOK. What is asserted here is not that anybody hits .300 — that is
 * balance work, and scripts/league.ts measures it. It is that the box score
 * AGREES WITH THE GAME IT CAME OUT OF.
 *
 * A stat line nobody checks against the scoreboard is decoration: the danger is
 * not that the numbers are ugly, it is that they are quietly a different game
 * from the one on the screen. So every claim below ties a column in the book to
 * something the engine already tracked before the book existed — team hits,
 * team runs, outs recorded, who won.
 */

import { describe, expect, it } from 'vitest';
import { simulateGame } from '../sim.ts';
import { boxScore, newGame, recordPlay } from '../game.ts';
import { club } from '../teams.ts';
import { newSeason, playDay, REGULAR_DAYS } from '../franchise.ts';
import {
  EMPTY_BOOK,
  avg,
  era,
  ip,
  leaders,
  merge,
  obp,
  ops,
  rate,
  recordAtBat,
  slg,
  type ArmLine,
  type BatLine,
  type StatBook,
} from '../stats.ts';

const HOME = club('ALB');
const AWAY = club('DET');

/** Everyone in the book who plays for this club. */
const forClub = <T extends { tm: string }>(
  lines: Readonly<Record<string, T>>,
  abbr: string,
): T[] => Object.values(lines).filter((l) => l.tm === abbr);

const sum = (ns: number[]): number => ns.reduce((a, b) => a + b, 0);

describe('the box score agrees with the scoreboard', () => {
  // Ten different games rather than one: a single seed can be right by luck,
  // and the accounting has to hold in extras, in a shutout and in a blowout.
  const games = Array.from({ length: 10 }, (_, i) => simulateGame(4000 + i, 9, HOME, AWAY));

  it('credits every club exactly the hits the line score says it got', () => {
    for (const { game } of games) {
      const book = boxScore(game);
      expect(sum(forClub(book.bat, 'ALB').map((l) => l.h))).toBe(game.homeState.hits);
      expect(sum(forClub(book.bat, 'DET').map((l) => l.h))).toBe(game.awayState.hits);
    }
  });

  it('charges every run to somebody on the other side', () => {
    for (const { game } of games) {
      const book = boxScore(game);
      // Home runs scored are runs the visiting staff allowed, and the other way
      // round. This is the claim that catches a run scoring on a wild pitch and
      // never reaching a pitcher's line.
      expect(sum(forClub(book.arm, 'DET').map((l) => l.r))).toBe(game.homeState.runs);
      expect(sum(forClub(book.arm, 'ALB').map((l) => l.r))).toBe(game.awayState.runs);
    }
  });

  it('records three outs per half-inning and no more', () => {
    for (const { game } of games) {
      const book = boxScore(game);
      // The staff that finished the game has recorded three outs for every half
      // its opponent batted. Innings pitched cannot run ahead of innings played.
      const halves = game.homeState.byInning.length + game.awayState.byInning.length;
      const outs = sum(Object.values(book.arm).map((l) => l.outs));
      expect(outs).toBeLessThanOrEqual(halves * 3);
      // A walk-off leaves a half unfinished; nothing else should lose outs.
      expect(outs).toBeGreaterThanOrEqual(halves * 3 - 3);
    }
  });

  it('balances plate appearances against at-bats and walks', () => {
    for (const { game } of games) {
      for (const l of Object.values(boxScore(game).bat)) {
        // Every trip to the plate ends in an at-bat or a free base. There is no
        // third kind — this engine has no sacrifices. See BatLine.
        expect(l.ab + l.bb).toBe(l.pa);
        expect(l.d + l.t + l.hr).toBeLessThanOrEqual(l.h);
      }
    }
  });

  it('gives out exactly one win and one loss, to the right two men', () => {
    for (const { game } of games) {
      const book = boxScore(game);
      const arms = Object.values(book.arm);
      expect(sum(arms.map((l) => l.w))).toBe(1);
      expect(sum(arms.map((l) => l.l))).toBe(1);

      const winner = game.winner === 'home' ? 'ALB' : 'DET';
      const loser = game.winner === 'home' ? 'DET' : 'ALB';
      // The win belongs to the winning club and the loss to the losing one. A
      // lead-change rule that reads the wrong side gets this backwards.
      expect(forClub(book.arm, winner).find((l) => l.w === 1)).toBeDefined();
      expect(forClub(book.arm, loser).find((l) => l.l === 1)).toBeDefined();
    }
  });

  it('hangs the decision on the lead change, not on the starter', () => {
    // ⚠️ THE CASE THIS EXISTS FOR is a reliever who gives up the lead without
    // recording an out. He takes the loss — that is the real rule, and it is
    // why the decision cannot be "whoever started" or "whoever threw the most".
    const homer = { kind: 'in_play' as const, hit: { outcome: 'home_run', isHit: true } as never };
    let g = newGame(HOME, AWAY);
    const albStarter = HOME.rotation[0]!.name;
    const detStarter = AWAY.rotation[0]!.name;

    // Nobody is ahead yet, so nobody is on the hook.
    expect(g.record).toBeUndefined();

    // Top of the first: the visitors go up. Their man is in line for the win.
    g = recordPlay(g, homer).game;
    expect(g.record).toEqual({ win: detStarter, lose: albStarter });

    // Bottom of the first: the home club takes it back, and so does the lead.
    g = { ...g, half: 'bottom', outs: 0 };
    g = recordPlay(g, homer).game;
    g = recordPlay(g, homer).game;
    expect(g.record).toEqual({ win: albStarter, lose: detStarter });
  });

  it('keeps the running book clean of decisions until the game is over', () => {
    const g = newGame(HOME, AWAY);
    expect(Object.values(g.stats.arm)).toHaveLength(0);
    // A game in progress has a pitcher of record but nobody has been credited.
    const { game } = recordPlay(g, { kind: 'walk' });
    expect(Object.values(game.stats.arm).every((l) => l.w === 0 && l.l === 0)).toBe(true);
  });
});

describe('one at-bat at a time', () => {
  const facts = {
    batter: 'A', batterTeam: 'ALB', pitcher: 'P', pitcherTeam: 'DET',
    error: false, runs: 0, outs: 0,
  };

  it('does not charge a walk as an at-bat', () => {
    const b = recordAtBat(EMPTY_BOOK, { ...facts, result: { kind: 'walk' } });
    expect(b.bat['A']).toMatchObject({ pa: 1, ab: 0, bb: 1, h: 0 });
    expect(b.arm['P']).toMatchObject({ bb: 1, outs: 0 });
  });

  it('counts a plunking as a walk, because it is the same free base', () => {
    const b = recordAtBat(EMPTY_BOOK, { ...facts, result: { kind: 'hit_by_pitch' } });
    expect(b.bat['A']).toMatchObject({ pa: 1, ab: 0, bb: 1 });
  });

  it('counts the strikeout on both lines at once', () => {
    const b = recordAtBat(EMPTY_BOOK, { ...facts, result: { kind: 'strikeout' }, outs: 1 });
    expect(b.bat['A']).toMatchObject({ ab: 1, k: 1, h: 0 });
    expect(b.arm['P']).toMatchObject({ k: 1, outs: 1 });
  });

  it('files a home run under hits AND under home runs', () => {
    const hit = { outcome: 'home_run' as const, isHit: true } as never;
    const b = recordAtBat(EMPTY_BOOK, {
      ...facts, result: { kind: 'in_play', hit }, runs: 2,
    });
    expect(b.bat['A']).toMatchObject({ ab: 1, h: 1, hr: 1, rbi: 2 });
    expect(b.arm['P']).toMatchObject({ h: 1, r: 2, er: 2 });
  });

  it('gives no RBI and no earned run for a run the defence let in', () => {
    const hit = { outcome: 'ground_out' as const, isHit: false } as never;
    const b = recordAtBat(EMPTY_BOOK, {
      ...facts, result: { kind: 'in_play', hit }, error: true, runs: 1,
    });
    expect(b.bat['A']).toMatchObject({ ab: 1, h: 0, rbi: 0 });
    // The run is on the scoreboard, so it is on his line — but not his ERA.
    expect(b.arm['P']).toMatchObject({ r: 1, er: 0 });
  });

  it('moves a man’s club with him when he is traded', () => {
    const one = recordAtBat(EMPTY_BOOK, { ...facts, result: { kind: 'walk' } });
    const two = recordAtBat(one, { ...facts, batterTeam: 'DET', result: { kind: 'walk' } });
    expect(two.bat['A']!.tm).toBe('DET');
    expect(two.bat['A']!.pa).toBe(2);
  });
});

describe('rates', () => {
  const l: BatLine = { pa: 10, ab: 8, h: 4, d: 1, t: 0, hr: 1, bb: 2, k: 2, rbi: 3, tm: 'ALB' };

  it('reads the four hitting rates the way a scoreboard does', () => {
    expect(avg(l)).toBeCloseTo(0.5);
    expect(obp(l)).toBeCloseTo(0.6);
    // 4 hits, one of them a double and one a homer: 4 + 1 + 3 = 8 bases on 8 AB.
    expect(slg(l)).toBeCloseTo(1.0);
    expect(ops(l)).toBeCloseTo(1.6);
    expect(rate(avg(l))).toBe('.500');
  });

  it('never divides by an empty line', () => {
    const empty: BatLine = { pa: 0, ab: 0, h: 0, d: 0, t: 0, hr: 0, bb: 0, k: 0, rbi: 0, tm: '' };
    expect(avg(empty)).toBe(0);
    expect(obp(empty)).toBe(0);
    expect(slg(empty)).toBe(0);
    expect(era({ outs: 0, h: 0, bb: 0, k: 0, r: 4, er: 4, w: 0, l: 0, tm: '' })).toBe(0);
  });

  it('writes innings in thirds, not in decimals', () => {
    expect(ip(20)).toBe('6.2');
    expect(ip(21)).toBe('7.0');
    expect(ip(0)).toBe('0.0');
  });

  it('reads ERA off earned runs over nine innings', () => {
    // Three earned in nine innings is a 3.00.
    expect(era({ outs: 27, h: 6, bb: 1, k: 8, r: 5, er: 3, w: 1, l: 0, tm: '' })).toBeCloseTo(3);
  });
});

describe('leaders', () => {
  const line = (pa: number, h: number): BatLine =>
    ({ pa, ab: pa, h, d: 0, t: 0, hr: 0, bb: 0, k: 0, rbi: 0, tm: 'ALB' });

  it('keeps a one-for-one September call-up off the batting title', () => {
    const board = leaders(
      { regular: line(100, 30), cameo: line(1, 1) },
      avg,
      (l) => l.pa,
    );
    expect(board.map((r) => r.name)).toEqual(['regular']);
  });

  it('sorts the wrong way round on request, for ERA', () => {
    const arm = (outs: number, er: number): ArmLine =>
      ({ outs, h: 0, bb: 0, k: 0, r: er, er, w: 0, l: 0, tm: 'ALB' });
    const board = leaders({ good: arm(90, 10), bad: arm(90, 40) }, era, (l) => l.outs, 5, true);
    expect(board[0]!.name).toBe('good');
  });

  it('has nothing to say about a season nobody has played', () => {
    expect(leaders(EMPTY_BOOK.bat, avg, (l) => l.pa)).toEqual([]);
  });
});

describe('merging', () => {
  it('adds two books without losing anybody', () => {
    const a: StatBook = recordAtBat(EMPTY_BOOK, {
      batter: 'A', batterTeam: 'ALB', pitcher: 'P', pitcherTeam: 'DET',
      result: { kind: 'walk' }, error: false, runs: 0, outs: 0,
    });
    const b: StatBook = recordAtBat(EMPTY_BOOK, {
      batter: 'B', batterTeam: 'ALB', pitcher: 'P', pitcherTeam: 'DET',
      result: { kind: 'strikeout' }, error: false, runs: 0, outs: 1,
    });
    const both = merge(a, b);
    expect(Object.keys(both.bat).sort()).toEqual(['A', 'B']);
    expect(both.arm['P']).toMatchObject({ bb: 1, k: 1, outs: 1 });
    // And the sources are untouched — everything in this engine is a new object.
    expect(a.bat['B']).toBeUndefined();
  });
});

describe('a season keeps its own book', () => {
  it('is empty before anything is played and full after a schedule', () => {
    // Nobody's club, so playDay() simulates the whole card every day.
    let s = newSeason('---', 77);
    expect(s.stats).toBeUndefined();
    for (let d = 0; d < REGULAR_DAYS; d++) s = playDay(s);

    const book = s.stats!;
    // Fourteen days of a thirty-club league is a lot of baseball, and every
    // club in it has to have somebody with a line.
    expect(Object.keys(book.bat).length).toBeGreaterThan(200);
    const decisions = sum(Object.values(book.arm).map((l) => l.w + l.l));
    // One win and one loss for every game played all year.
    expect(decisions).toBe(s.results.length * 2);
  });

  it('folds in the game YOU played, which is the one playDay did not run', () => {
    // ⚠️ THIS IS main.ts's finalize() PATH. Your game is handed to playDay as a
    // finished Result plus its book, because it is the only game on the card
    // this function did not simulate and so cannot read a GameState for. Get it
    // wrong and the whole league keeps stats except the club you manage.
    let s = newSeason('ALB', 55);
    const { game } = simulateGame(3, 9, HOME, AWAY);
    s = playDay(
      s,
      { home: 'ALB', away: 'DET', day: 0, hr: game.homeState.runs, ar: game.awayState.runs },
      boxScore(game),
    );

    const yours = forClub(s.stats!.bat, 'ALB');
    // Nine, or more if somebody came off the bench — a pinch hitter gets a line
    // like anybody else, and the club's hits still have to add up across all of
    // them. See benchOf() in game.ts.
    expect(yours.length).toBeGreaterThanOrEqual(9);
    expect(yours.length).toBeLessThanOrEqual(12);
    expect(sum(yours.map((l) => l.h))).toBe(game.homeState.hits);
    // ...and the twenty-eight other clubs' afternoon went in beside it.
    expect(Object.keys(s.stats!.bat).length).toBeGreaterThan(9);
  });

  it('keeps counting on a season saved before the book existed', () => {
    // The `stats` field is optional exactly so this loads. A season that has
    // been playing for a week starts its book on the next game, not never.
    let s = newSeason('---', 91);
    s = playDay(s);
    const old = { ...s, stats: undefined };
    const next = playDay(old);
    expect(Object.keys(next.stats!.bat).length).toBeGreaterThan(0);
  });
});
