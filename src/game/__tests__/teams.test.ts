/**
 * The league is data, so these are the invariants a typo breaks and the type
 * checker does not: a club short a hitter, two players sharing an id, an out
 * pitch a man does not throw.
 *
 * ⚠️ MOST OF THEM ARE NO LONGER WRITTEN HERE. They are checkLeague() in
 * league.ts, and this file asserts that the thirty pass it. That is not a
 * tidy-up: a league can now be IMPORTED, so those rules had to become code that
 * runs against a stranger's document, and a second copy of them in a test would
 * be a second opinion about what a legal club is. The one that drifted would be
 * whichever nobody was looking at.
 *
 * What stays here is what is true of THE SHIPPED THIRTY specifically, which a
 * validator has no business demanding of anybody else's league: how many clubs
 * there are, the market fiction the ladder is built on, and a rotation of
 * exactly three.
 *
 * ponytail: no balance assertions here. Win rate is measured in
 * scripts/league.ts over thousands of games — putting a number that noisy in
 * a unit test buys a flaky suite and nothing else.
 */
import { describe, it, expect } from 'vitest';
import { LEAGUE, LEAGUE_AS_WRITTEN, HOME, AWAY, starterOf } from '../teams.ts';
import { checkLeague } from '../league.ts';

describe('the league', () => {
  it('is a legal league by the same rules an imported one is held to', () => {
    // Both forms: the clubs as written, which is what the league screen
    // exports and what a custom document is pasted in beside, and the
    // compressed ones the game actually plays. temper() must not be able to
    // turn a legal club into an illegal one.
    for (const [what, clubs] of [
      ['as written', LEAGUE_AS_WRITTEN],
      ['as played', LEAGUE],
    ] as const) {
      const check = checkLeague(clubs);
      // Printed rather than summarised — a failure here should say which club.
      expect(check.ok ? [] : check.problems, what).toEqual([]);
    }
  });

  it('is thirty clubs', () => {
    // Thirty is a real number and not an accident of how many got written: the
    // schedule, the standings table and the pre-game rank all read LEAGUE.length,
    // so a club added or cut here is the only edit that change takes.
    //
    // It is asserted on the clubs AS WRITTEN. LEAGUE is whatever has been
    // imported over them, and a custom league of twelve is not a failure of
    // teams.ts.
    expect(LEAGUE_AS_WRITTEN).toHaveLength(30);
  });

  it('puts two clubs in each of the three big markets', () => {
    // The fiction the ladder is built on — see the expansion note in teams.ts.
    for (const town of ['New York', 'Los Angeles', 'Chicago']) {
      expect(LEAGUE_AS_WRITTEN.filter((t) => t.name.startsWith(town)), town).toHaveLength(2);
    }
  });

  it('gives every club a rotation of exactly three', () => {
    // checkLeague only asks for one, because an imported club may carry any
    // number and rotation.ts indexes modulo the array. Three is what the
    // shipped clubs are balanced around — see the arms section in teams.ts.
    for (const t of LEAGUE_AS_WRITTEN) {
      expect(t.rotation, t.abbr).toHaveLength(3);
      expect(starterOf(t)).toBe(t.rotation[0]);
    }
  });

  it('points the headless sim at two clubs that exist', () => {
    expect(LEAGUE).toContain(HOME);
    expect(LEAGUE).toContain(AWAY);
    expect(HOME).not.toBe(AWAY);
  });
});
