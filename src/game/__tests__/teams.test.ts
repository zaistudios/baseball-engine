/**
 * The league is data, so these are the invariants a typo breaks and the type
 * checker does not: a club short a hitter, two players sharing an id, an out
 * pitch a man does not throw.
 *
 * ponytail: no balance assertions here. Win rate is measured in
 * scripts/league.ts over thousands of games — putting a number that noisy in
 * a unit test buys a flaky suite and nothing else.
 */
import { describe, it, expect } from 'vitest';
import { LEAGUE, HOME, AWAY, starterOf } from '../teams.ts';

describe('the league', () => {
  it('is thirty clubs with unique names and abbreviations', () => {
    // Thirty is a real number and not an accident of how many got written: the
    // schedule, the standings table and the pre-game rank all read LEAGUE.length,
    // so a club added or cut here is the only edit that change takes.
    expect(LEAGUE).toHaveLength(30);
    expect(new Set(LEAGUE.map((t) => t.abbr)).size).toBe(LEAGUE.length);
    expect(new Set(LEAGUE.map((t) => t.name)).size).toBe(LEAGUE.length);
  });

  it('puts two clubs in each of the three big markets', () => {
    // The fiction the ladder is built on — see the expansion note in teams.ts.
    for (const town of ['New York', 'Los Angeles', 'Chicago']) {
      expect(LEAGUE.filter((t) => t.name.startsWith(town)), town).toHaveLength(2);
    }
  });

  it('gives every club nine hitters and three arms', () => {
    for (const t of LEAGUE) {
      expect(t.lineup, t.abbr).toHaveLength(9);
      expect(t.rotation, t.abbr).toHaveLength(3);
      expect(starterOf(t)).toBe(t.rotation[0]);
    }
  });

  it('never puts one player on two clubs', () => {
    const ids = LEAGUE.flatMap((t) => t.lineup.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never puts one arm on two staffs', () => {
    const names = LEAGUE.flatMap((t) => t.rotation.map((p) => p.name));
    expect(new Set(names).size).toBe(names.length);
  });

  it('only lets a pitcher put you away with something he throws', () => {
    for (const t of LEAGUE) {
      for (const p of t.rotation) {
        expect(p.arsenal[p.putaway], `${t.abbr} ${p.name}`).toBeGreaterThan(0);
      }
    }
  });

  it('points the headless sim at two clubs that exist', () => {
    expect(LEAGUE).toContain(HOME);
    expect(LEAGUE).toContain(AWAY);
    expect(HOME).not.toBe(AWAY);
  });
});
