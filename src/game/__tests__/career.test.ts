/**
 * THE RECORD BOOK. The two things worth locking are that a season is filed
 * once and only once, and that every derived number is a fold of the rows
 * rather than a stored total that can drift away from them.
 */

import { describe, expect, it } from 'vitest';
import {
  bestYear,
  file,
  newCareer,
  records,
  totals,
  winPct,
  type Career,
  type Year,
} from '../career.ts';
import { newSeason, playDay, seasonOver, standings, teamOf, yourGame } from '../franchise.ts';
import { simulateGame } from '../sim.ts';
import { boxScore } from '../game.ts';

/**
 * A season played all the way out, YOUR games included.
 *
 * ⚠️ playDay() DOES NOT PLAY YOUR CLUB'S GAME — the human is supposed to, and
 * main.ts's finalize() hands the finished one back in. A test that just loops
 * playDay() leaves your club 0-0 with nobody in the book, which is a season the
 * record book would happily file and nobody would ever see. So this simulates
 * your half too, exactly the way finalize() does.
 */
const finished = (you: string, seed: number) => {
  let s = newSeason(you, seed);
  let n = 0;
  while (!seasonOver(s)) {
    const m = yourGame(s);
    if (!m) {
      s = playDay(s);
      continue;
    }
    const { game } = simulateGame(seed + n++, 9, teamOf(s, m.home), teamOf(s, m.away));
    s = playDay(
      s,
      {
        ...m,
        day: s.day,
        hr: game.homeState.runs,
        ar: game.awayState.runs,
        hh: game.homeState.hits,
        ah: game.awayState.hits,
      },
      boxScore(game),
    );
  }
  return s;
};

describe('filing a season', () => {
  it('writes the record the standings actually show', () => {
    const s = finished('ALB', 31);
    const c = file(newCareer(), s);
    const row = standings(s).find((r) => r.abbr === 'ALB')!;

    expect(c.years).toHaveLength(1);
    const y = c.years[0]!;
    expect(y.club).toBe('ALB');
    expect(y.w).toBe(row.w);
    expect(y.l).toBe(row.l);
    expect(y.finish).toBeGreaterThan(0);
    expect(y.finish).toBeLessThanOrEqual(30);
  });

  it('files the same year once, however many times it is offered', () => {
    // ⚠️ THE GUARD THAT STOPS ONE CHAMPIONSHIP BECOMING THREE. A finished
    // season is reached from finalize(), from nextGame(), and again on a reload
    // of the finished save.
    const s = finished('DET', 44);
    let c = file(newCareer(), s);
    c = file(c, s);
    c = file(c, s);
    expect(c.years).toHaveLength(1);
  });

  it('tells two different seasons apart even under the same club', () => {
    let c = newCareer();
    c = file(c, finished('DET', 1));
    c = file(c, finished('DET', 2));
    expect(c.years).toHaveLength(2);
  });

  it('names a best bat and a best arm off the season book', () => {
    const s = finished('NYE', 12);
    const y = file(newCareer(), s).years[0]!;
    const club = s.rosters['NYE']!;
    expect(y.bat).toBeDefined();
    expect(y.arm).toBeDefined();
    // ...and they are HIS men, not the league's leaders.
    expect(club.lineup.map((p) => p.name)).toContain(y.bat!.name);
    expect([...club.rotation, ...club.bullpen].map((p) => p.name)).toContain(y.arm!.name);
    expect(y.bat!.avg).toBeGreaterThan(0);
  });

  it('files a season that never kept a book at all', () => {
    // A save from before stats.ts existed. The row is still worth having.
    const s = { ...finished('ALB', 5), stats: undefined };
    const y = file(newCareer(), s).years[0]!;
    expect(y.bat).toBeUndefined();
    expect(y.w + y.l).toBeGreaterThan(0);
  });
});

describe('what the book adds up to', () => {
  const y = (club: string, w: number, l: number, champion: string, seed: number): Year =>
    ({ club, w, l, finish: 1, champion, seed });

  const c: Career = {
    years: [
      y('ALB', 9, 5, 'ALB', 1),
      y('ALB', 4, 10, 'DET', 2),
      y('DET', 11, 3, 'NYE', 3),
    ],
  };

  it('folds the totals out of the rows', () => {
    const t = totals(c);
    expect(t.seasons).toBe(3);
    expect(t.w).toBe(24);
    expect(t.l).toBe(18);
    expect(t.titles).toBe(1);
    expect(t.clubs).toEqual(['ALB', 'DET']);
    expect(winPct(t)).toBeCloseTo(24 / 42);
  });

  it('has nothing to divide by on a fresh install', () => {
    expect(winPct(totals(newCareer()))).toBe(0);
    expect(bestYear(newCareer())).toBeUndefined();
    expect(records(newCareer())).toEqual([]);
  });

  it('puts the championship year first even when a better record lost', () => {
    // 11-3 is the better season; 9-5 won it. The banner outranks the record.
    expect(bestYear(c)).toMatchObject({ w: 9, l: 5, champion: 'ALB' });
  });
});

describe('single-season records', () => {
  const withMarks: Career = {
    years: [
      {
        club: 'ALB', w: 7, l: 7, finish: 5, champion: 'DET', seed: 1,
        bat: { name: 'Early Man', avg: 0.31, hr: 9, rbi: 20 },
        arm: { name: 'Slow Curve', w: 3, l: 1, era: 2.4, k: 30, outs: 100 },
      },
      {
        club: 'DET', w: 8, l: 6, finish: 3, champion: 'DET', seed: 2,
        bat: { name: 'Big Bat', avg: 0.28, hr: 14, rbi: 18 },
        arm: { name: 'Fireball', w: 4, l: 0, era: 3.1, k: 44, outs: 110 },
      },
    ],
  };

  it('picks each record on its own column, not on one best player', () => {
    const r = records(withMarks);
    const at = (label: string) => r.find((x) => x.label === label)!;
    expect(at('BATTING AVERAGE').name).toBe('Early Man');
    expect(at('HOME RUNS').name).toBe('Big Bat');
    expect(at('RUNS BATTED IN').name).toBe('Early Man');
    // ERA is the one that sorts the other way round.
    expect(at('EARNED RUN AVERAGE').name).toBe('Slow Curve');
    expect(at('STRIKEOUTS').name).toBe('Fireball');
  });

  it('writes an average the way a scoreboard does', () => {
    expect(records(withMarks).find((x) => x.label === 'BATTING AVERAGE')!.value).toBe('.310');
  });

  it('skips a record nobody has set yet', () => {
    const batsOnly: Career = { years: [{ ...withMarks.years[0]!, arm: undefined }] };
    const labels = records(batsOnly).map((r) => r.label);
    expect(labels).toContain('HOME RUNS');
    expect(labels).not.toContain('EARNED RUN AVERAGE');
  });
});
