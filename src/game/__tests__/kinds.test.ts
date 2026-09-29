/**
 * THE NEW SCENARIO KINDS, one block each: it fires on the shape it is meant to
 * notice, it does NOT fire on a sample too small to mean anything, and taking
 * it does what the button says. The sweep at the bottom plays real seasons
 * headlessly and holds every choice ever offered to the trade-off rule.
 *
 * Each kind is aimed at directly through offer() — momentOn() shuffles the
 * kinds that are true on the same day, so asking it for one specific kind is
 * asking the dice. See scenarios.test.ts for the ones that predate these.
 */

import { describe, expect, it } from 'vitest';
import {
  gamesOn,
  newSeason,
  playDay,
  regularDays,
  teamOf,
  yourGame,
  type Result,
  type Season,
} from '../franchise.ts';
import { momentOn, decide, offer, valueShift, FAIR } from '../moments.ts';
import { clubValue } from '../value.ts';
import { gloveOf } from '../defense.ts';
import { makeRng } from '../../core/rng.ts';
import { LEAGUE } from '../teams.ts';
import type { ArmLine, BatLine, FieldLine } from '../stats.ts';

const kind = (id: string | undefined): string | undefined => id?.split(':')[0];

/** A season to `days`, your results forced, everyone else simmed. */
function played(you: string, days: number, win: (d: number) => boolean, seed = 4242, games = 28): Season {
  let s = newSeason(you, seed, games);
  for (let d = 0; d < days; d++) {
    const m = yourGame(s)!;
    const home = m.home === you;
    const w = win(d);
    s = playDay(s, { ...m, day: d, hr: home === w ? 5 : 2, ar: home === w ? 2 : 5 });
  }
  return { ...s, day: days };
}

const bat = (o: Partial<BatLine>): BatLine => ({ pa: 0, ab: 0, h: 0, d: 0, t: 0, hr: 0, bb: 0, k: 0, rbi: 0, tm: 'ALB', ...o });
const arm = (o: Partial<ArmLine>): ArmLine => ({ outs: 0, h: 0, bb: 0, k: 0, r: 0, er: 0, w: 0, l: 0, tm: 'ALB', ...o });

function withBook(
  s: Season,
  b: Record<string, BatLine> = {},
  a: Record<string, ArmLine> = {},
  f: Record<string, FieldLine> = {},
): Season {
  return {
    ...s,
    stats: {
      bat: { ...(s.stats?.bat ?? {}), ...b },
      arm: { ...(s.stats?.arm ?? {}), ...a },
      field: { ...(s.stats?.field ?? {}), ...f },
    },
  };
}

/** Nine, a staff, nobody twice — for both clubs a trade touches. */
function legal(s: Season): void {
  for (const t of LEAGUE) {
    const c = teamOf(s, t.abbr);
    expect(c.lineup, t.abbr).toHaveLength(9);
    expect(c.rotation.length, t.abbr).toBe(t.rotation.length);
    expect(c.bullpen.length, t.abbr).toBe(t.bullpen.length);
  }
  const ids = LEAGUE.flatMap((t) => teamOf(s, t.abbr).lineup.map((p) => p.id));
  expect(new Set(ids).size).toBe(ids.length);
}

const WIN = (): boolean => true;
const LOSE = (): boolean => false;
const base = played('ALB', 12, WIN);
const you = teamOf(base, 'ALB');

describe('the hot bat', () => {
  const hot = you.lineup[6]!;
  const clean = you.lineup[3]!;
  const lines = (pa: number): Season =>
    withBook(base, {
      [hot.name]: bat({ pa, ab: pa - 6, h: Math.round(pa * 0.35), d: 3, hr: 4, bb: 6 }),
      [clean.name]: bat({ pa, ab: pa - 4, h: Math.round(pa * 0.18), bb: 4 }),
    });

  it('fires when the bottom of the order out-hits cleanup', () => {
    const m = offer('hot', lines(40))!;
    expect(m.id).toBe(`hot:${hot.name}`);
    const after = teamOf(decide(lines(40), m, 0), 'ALB');
    expect(after.lineup[3]!.id).toBe(hot.id);
    expect(after.lineup[6]!.id).toBe(clean.id);
  });

  it('does NOT fire on a week of at-bats', () => {
    expect(offer('hot', lines(10))).toBeNull();
  });
});

describe('the table-setter', () => {
  const lead = you.lineup[0]!;
  const eye = you.lineup[4]!;
  const lines = (pa: number): Season =>
    withBook(base, {
      [lead.name]: bat({ pa, ab: pa - 1, h: Math.round(pa * 0.18), bb: 1 }),
      [eye.name]: bat({ pa, ab: pa - 8, h: Math.round(pa * 0.3), bb: 8 }),
    });

  it('fires when the leadoff man is not getting on and somebody else is', () => {
    const m = offer('leadoff', lines(40))!;
    expect(m.id).toBe(`leadoff:${lead.name}`);
    expect(teamOf(decide(lines(40), m, 0), 'ALB').lineup[0]!.id).toBe(eye.id);
  });

  it('does NOT fire on a week of at-bats', () => {
    expect(offer('leadoff', lines(10))).toBeNull();
  });
});

describe('the glove', () => {
  const worst = [...you.lineup].sort((a, b) => gloveOf(a) - gloveOf(b))[0]!;
  const lines = (e: number): Season => withBook(base, {}, {}, { [worst.name]: { po: 20, a: 10, e, tm: 'ALB' } });

  it('fires on a regular who keeps kicking it, with a better glove sitting', () => {
    const m = offer('glove', lines(6))!;
    expect(m.id).toBe(`glove:${worst.name}`);
    const after = teamOf(decide(lines(6), m, 0), 'ALB');
    expect(after.lineup.map((p) => p.id)).not.toContain(worst.id);
    expect((after.bench ?? []).map((p) => p.id)).toContain(worst.id);
  });

  it('does NOT fire on one error', () => {
    expect(offer('glove', lines(1))).toBeNull();
  });
});

describe('the roles', () => {
  const sp = you.rotation[0]!;
  const rp = you.bullpen[0]!;
  const lines = (outs: number): Season =>
    withBook(base, {}, {
      [sp.name]: arm({ outs, er: Math.round(outs * 0.75) }),
      [rp.name]: arm({ outs: Math.round(outs / 2), er: 1 }),
    });

  it('swaps a shelled starter with a sharp reliever, and moves no value at all', () => {
    const s = lines(60);
    const m = offer('roles', s)!;
    expect(m.id).toBe(`roles:${sp.name}`);
    const after = decide(s, m, 0);
    const t = teamOf(after, 'ALB');
    expect(t.rotation.map((a) => a.name)).toContain(rp.name);
    expect(t.bullpen.map((a) => a.name)).toContain(sp.name);
    expect(clubValue(t)).toBeCloseTo(clubValue(you), 10);
  });

  it('does NOT fire on two bad innings', () => {
    expect(offer('roles', lines(6))).toBeNull();
  });
});

describe('the club-level ones', () => {
  it('the streak offers a fair swap, and fires only on a streak', () => {
    const m = offer('streak', base)!;
    expect(kind(m.id)).toBe('streak');
    for (let i = 0; i < m.choices.length; i++) {
      const after = decide(base, m, i);
      legal(after);
      expect(valueShift(base, after)).toBeLessThanOrEqual(FAIR);
    }
    expect(offer('streak', played('ALB', 12, (d) => d % 2 === 0))).toBeNull();
  });

  it('the skid is its own question now, not the bench with a new headline', () => {
    const s = played('ALB', 12, LOSE);
    const m = offer('skid', s)!;
    expect(m.choices.map((c) => c.label)).toContain('STAY THE COURSE');
    expect(m.choices.map((c) => c.label)).not.toContain('PROMOTE INSIDE');
    const hired = teamOf(decide(s, m, 0), 'ALB').identity!.name;
    expect(hired).not.toBe(you.identity!.name);
  });

  it('the white flag sells your best starter, only when you are out of it', () => {
    const s = played('ALB', 20, LOSE);
    const m = offer('sellers', s)!;
    expect(m.choices[0]!.label).toMatch(/^DEAL /);
    const after = decide(s, m, 0);
    legal(after);
    expect(valueShift(s, after)).toBeLessThanOrEqual(FAIR);
    expect(offer('sellers', played('ALB', 20, WIN))).toBeNull();
    // ...and not before the midpoint, however bad it is.
    expect(offer('sellers', played('ALB', 10, LOSE))).toBeNull();
  });

  it('the rival fires on a club that has beaten you four times, not twice', () => {
    const s0 = { ...newSeason('ALB', 4242, 28), day: 12 };
    const g = gamesOn(s0, 12).find((x) => x.home === 'ALB' || x.away === 'ALB')!;
    const opp = g.home === 'ALB' ? g.away : g.home;
    const losses = (n: number): Season => ({
      ...s0,
      results: Array.from({ length: n }, (_, d): Result => ({ home: opp, away: 'ALB', day: d, hr: 5, ar: 1 })),
    });
    expect(offer('rival', losses(4))?.id).toBe(`rival:${opp}`);
    expect(offer('rival', losses(2))).toBeNull();
  });
});

describe('the floor', () => {
  it('phone, pen and card each have something real to offer', () => {
    for (const k of ['phone', 'pen', 'card']) {
      const m = offer(k, base)!;
      expect(m, k).not.toBeNull();
      expect(m.choices.length, k).toBeGreaterThanOrEqual(2);
      for (let i = 0; i < m.choices.length; i++) {
        const after = decide(base, m, i);
        legal(after);
        expect(Math.abs(valueShift(base, after)), `${k}/${i}`).toBeLessThanOrEqual(FAIR);
      }
    }
  });

  it('a one-for-one leaves the other club inside FAIR too', () => {
    const m = offer('phone', base)!;
    const after = decide(base, m, 0);
    for (const t of LEAGUE) {
      if (t.abbr === 'ALB') continue;
      expect(Math.abs(clubValue(teamOf(after, t.abbr)) - clubValue(teamOf(base, t.abbr))), t.abbr)
        .toBeLessThanOrEqual(FAIR + 1e-9);
    }
  });
});

describe('real seasons, played headlessly', () => {
  /**
   * ⚠️ THE ONE THAT HOLDS THE WHOLE SET TO THE RULE. Every question a real
   * season asks, every button on it: never a gain beyond FAIR, never an
   * illegal roster. And across seasons, not the same questions in the same
   * order — which was the complaint that started this.
   */
  it('never hands value, never breaks a roster, and differs season to season', () => {
    const seqs = new Set<string>();
    const kinds = new Set<string>();
    for (let seed = 0; seed < 6; seed++) {
      const rng = makeRng(seed);
      let s = newSeason(LEAGUE[seed * 5]!.abbr, seed * 7919 + 1, 40);
      const seq: string[] = [];
      while (s.day < regularDays(s)) {
        const m = momentOn(s);
        if (m) {
          for (let i = 0; i < m.choices.length; i++) {
            expect(valueShift(s, decide(s, m, i)), `${m.id}/${i}`).toBeLessThanOrEqual(FAIR);
          }
          seq.push(kind(m.id)!);
          s = decide(s, m, rng.int(0, m.choices.length - 1));
          legal(s);
        }
        s = playDay(s);
      }
      seqs.add(seq.join('>'));
      for (const k of seq) kinds.add(k);
    }
    expect(seqs.size).toBe(6);
    expect(kinds.size).toBeGreaterThanOrEqual(8);
  }, 120000);
});
