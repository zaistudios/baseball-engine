/**
 * Franchise moments: they fire once, they keep the rosters legal, and the
 * trades are as flat as the screen promises.
 *
 * ⚠️ THE FLATNESS TEST IS THE IMPORTANT ONE. "Trade-offs only" is the whole
 * design of moments.ts — every option is a sideways move — and it is a promise
 * that lives entirely in one matching rule inside bestTrade(). Nothing else in
 * the codebase would notice if that rule started handing out free value; the
 * standings would just quietly stop meaning anything.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { newSeason, regularDays, standings, teamOf, loadSeason, saveSeason, type Season } from '../franchise.ts';
import { momentOn, decide, valueShift, momentDays, FAIR } from '../moments.ts';
import { clubValue } from '../value.ts';
import { LEAGUE } from '../teams.ts';
import { simulateGame } from '../sim.ts';

const GAMES14 = regularDays(newSeason('ALB', 0));
const DAYS14 = momentDays(newSeason('ALB', 0));

const at = (you: string, day: number, seed = 12345): Season => ({
  ...newSeason(you, seed),
  day,
});

describe('when they fire', () => {
  it('gives exactly two moments, both inside the regular season', () => {
    expect(DAYS14).toHaveLength(2);
    for (const d of DAYS14) {
      expect(d).toBeGreaterThan(0);
      expect(d).toBeLessThan(GAMES14);
    }
  });

  it('has nothing to say on an ordinary day', () => {
    for (let d = 0; d < GAMES14; d++) {
      if (DAYS14.includes(d)) continue;
      expect(momentOn(at('ALB', d), d)).toBeNull();
    }
  });

  it('never fires in the bracket', () => {
    for (let d = GAMES14; d < GAMES14 + 3; d++) {
      expect(momentOn(at('ALB', d), d)).toBeNull();
    }
  });

  it('offers the deadline first and the bench second', () => {
    expect(momentOn(at('ALB', DAYS14[0]!))!.headline).toBe('THE DEADLINE');
    expect(momentOn(at('ALB', DAYS14[1]!))!.headline).toBe('THE BENCH');
  });

  it('is the same offer on a reload — it is drawn from the season seed', () => {
    const a = momentOn(at('MNE', DAYS14[0]!, 999));
    const b = momentOn(at('MNE', DAYS14[0]!, 999));
    expect(a!.choices.map((c) => c.label)).toEqual(b!.choices.map((c) => c.label));
  });

  it('...and a different one for a different seed', () => {
    // Not a guarantee for any single pair, so this asks across many seeds that
    // the offers are not simply constant. "Trades are random" is the ask.
    const seen = new Set<string>();
    for (let seed = 0; seed < 30; seed++) {
      const m = momentOn(at('MNE', DAYS14[0]!, seed));
      if (m) seen.add(m.choices.map((c) => c.label).join('|'));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('fires once — the day is marked decided and does not come back', () => {
    const day = DAYS14[0]!;
    const s = at('ALB', day);
    const m = momentOn(s)!;
    const after = decide(s, m, 0);
    expect(after.decided).toContain(day);
    expect(momentOn(after, day)).toBeNull();
  });

  it('does not advance the day — the game still has to be played', () => {
    const day = DAYS14[0]!;
    const s = at('ALB', day);
    expect(decide(s, momentOn(s)!, 0).day).toBe(day);
  });

  it('files a roster line on the wire for whatever you chose', () => {
    const s = at('ALB', DAYS14[0]!);
    const m = momentOn(s)!;
    for (let i = 0; i < m.choices.length; i++) {
      const after = decide(s, m, i);
      const last = after.news![after.news!.length - 1]!;
      expect(last.kind).toBe('roster');
      expect(last.day).toBe(m.day);
      expect(last.text.length).toBeGreaterThan(0);
    }
  });

  it('offers a real choice, never a single button', () => {
    for (const abbr of LEAGUE.map((t) => t.abbr)) {
      for (const day of DAYS14) {
        const m = momentOn(at(abbr, day));
        if (m) expect(m.choices.length, `${abbr} day ${day}`).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

describe('the deadline keeps the league legal and honest', () => {
  const day = DAYS14[0]!;

  it('leaves BOTH clubs with nine hitters and a full staff', () => {
    for (const abbr of LEAGUE.map((t) => t.abbr)) {
      const s = at(abbr, day, 4242);
      const m = momentOn(s);
      if (!m) continue;
      for (let i = 0; i < m.choices.length; i++) {
        const after = decide(s, m, i);
        for (const t of LEAGUE) {
          const club = teamOf(after, t.abbr);
          expect(club.lineup, `${abbr}/${i}/${t.abbr}`).toHaveLength(9);
          expect(club.rotation.length).toBe(t.rotation.length);
        }
      }
    }
  });

  it('never leaves the same man on two rosters, or on none', () => {
    for (const abbr of ['ALB', 'DET', 'MNE', 'NYE', 'OKC']) {
      const s = at(abbr, day, 777);
      const m = momentOn(s);
      if (!m) continue;
      for (let i = 0; i < m.choices.length; i++) {
        const after = decide(s, m, i);
        const ids = LEAGUE.flatMap((t) => teamOf(after, t.abbr).lineup.map((p) => p.id));
        expect(new Set(ids).size, `${abbr}/${i}`).toBe(ids.length);
        expect(ids.length).toBe(LEAGUE.length * 9);
      }
    }
  });

  it('moves your roster value by less than FAIR — the whole promise', () => {
    for (const abbr of LEAGUE.map((t) => t.abbr)) {
      const s = at(abbr, day, 31337);
      const m = momentOn(s);
      if (!m) continue;
      for (let i = 0; i < m.choices.length; i++) {
        expect(Math.abs(valueShift(s, decide(s, m, i))), `${abbr}/${i}`).toBeLessThanOrEqual(FAIR);
      }
    }
  });

  it('...and moves the OTHER club by the mirror of it, so the league is flat', () => {
    // The identity from moments.ts's header: with 9 and 3 on both sides the
    // two deltas are exact negatives. If this breaks, trading became a way to
    // farm the AI.
    const s = at('MNE', day, 8080);
    const m = momentOn(s)!;
    for (let i = 0; i < m.choices.length; i++) {
      const after = decide(s, m, i);
      const mine = valueShift(s, after);
      if (mine === 0) continue; // stand pat
      const partner = LEAGUE.map((t) => t.abbr).find(
        (a) => a !== 'MNE' && clubValue(teamOf(after, a)) !== clubValue(teamOf(s, a)),
      )!;
      const theirs = clubValue(teamOf(after, partner)) - clubValue(teamOf(s, partner));
      expect(theirs).toBeCloseTo(-mine, 10);
    }
  });

  it('actually changes the club — a trade is not a no-op dressed as one', () => {
    const s = at('ALB', day, 55);
    const m = momentOn(s)!;
    const trades = m.choices.filter((c) => c.label !== 'STAND PAT');
    expect(trades.length).toBeGreaterThan(0);
    for (const c of trades) {
      const before = teamOf(s, 'ALB').lineup.map((p) => p.id).join(',');
      const after = teamOf(c.apply(s), 'ALB').lineup.map((p) => p.id).join(',');
      expect(after).not.toBe(before);
    }
  });
});

describe('the bench changes how you play and nothing else', () => {
  const day = DAYS14[1]!;

  it('does not move a single rating', () => {
    const s = at('DET', day);
    const m = momentOn(s)!;
    for (let i = 0; i < m.choices.length; i++) {
      const after = decide(s, m, i);
      expect(valueShift(s, after)).toBe(0);
      expect(teamOf(after, 'DET').lineup).toEqual(teamOf(s, 'DET').lineup);
      expect(teamOf(after, 'DET').rotation).toEqual(teamOf(s, 'DET').rotation);
    }
  });

  it('never offers you the manager you already have', () => {
    for (const abbr of LEAGUE.map((t) => t.abbr)) {
      const s = at(abbr, day, 606);
      const m = momentOn(s);
      if (!m) continue;
      const current = teamOf(s, abbr).identity!.name;
      const hires = m.choices.filter((c) => c.label !== 'PROMOTE INSIDE');
      for (const c of hires) expect(c.label, abbr).not.toBe(current);
      expect(new Set(hires.map((c) => c.label)).size).toBe(hires.length);
    }
  });

  it('the hire is what the club plays as afterwards', () => {
    const s = at('DET', day);
    const m = momentOn(s)!;
    const after = decide(s, m, 0);
    expect(teamOf(after, 'DET').identity!.name).toBe(m.choices[0]!.label);
  });

  it('and the new bench reaches the ball game', () => {
    // End to end: hire a running man in Detroit and the games change.
    const s = at('DET', day, 2026);
    const m = momentOn(s)!;
    const after = decide(s, m, 0);
    let differed = 0;
    for (let seed = 0; seed < 40; seed++) {
      const a = simulateGame(seed, 9, teamOf(s, 'DET'), teamOf(s, 'TOR'));
      const b = simulateGame(seed, 9, teamOf(after, 'DET'), teamOf(after, 'TOR'));
      if (a.game.homeState.runs !== b.game.homeState.runs) differed++;
    }
    expect(differed).toBeGreaterThan(3);
  });
});

/**
 * localStorage does not exist in the test environment — the same stub
 * src/web/__tests__/save.test.ts installs, for the same reason. franchise.ts
 * only ever calls these three.
 */
function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    _raw: map,
  };
}

describe('a decided season survives a save', () => {
  let store: ReturnType<typeof fakeStorage>;
  beforeEach(() => {
    store = fakeStorage();
    vi.stubGlobal('localStorage', store);
  });

  it('round-trips `decided` through localStorage', () => {
    const s = at('MNE', DAYS14[0]!);
    const after = decide(s, momentOn(s)!, 0);
    saveSeason(after);
    const back = loadSeason()!;
    expect(back.decided).toEqual(after.decided);
    // ...and the traded roster came back with it, or the trade did not happen.
    expect(teamOf(back, 'MNE').lineup.map((p) => p.id))
      .toEqual(teamOf(after, 'MNE').lineup.map((p) => p.id));
    expect(momentOn(back, DAYS14[0]!)).toBeNull();
  });

  it('a season saved before moments existed loads as one that owes you both', () => {
    // The forward-compatibility case: no `decided` key at all.
    const s = at('MNE', DAYS14[0]!);
    const legacy = { ...s } as Partial<Season>;
    delete legacy.decided;
    store._raw.set('asb.season.v1', JSON.stringify({ ...legacy, v: 4 }));
    const back = loadSeason()!;
    expect(back.decided).toEqual([]);
    expect(momentOn(back, DAYS14[0]!)).not.toBeNull();
  });
});

describe('the standings still work after a trade', () => {
  it('re-ranks off the traded rosters, not the league file', () => {
    const s = at('OKC', DAYS14[0]!, 1234);
    const m = momentOn(s);
    if (!m) return;
    const after = decide(s, m, 0);
    const row = standings(after).find((r) => r.abbr === 'OKC')!;
    expect(row.value).toBeCloseTo(clubValue(teamOf(after, 'OKC')), 10);
  });
});
