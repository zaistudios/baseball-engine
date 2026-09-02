/**
 * A league you can hand somebody else.
 *
 * Three things are worth testing here and the third is the one that would rot
 * silently:
 *
 *  1. every rule refuses the thing it exists to refuse, and — more easily
 *     forgotten — ACCEPTS everything it has no business refusing;
 *  2. the document round-trips, so editing one player cannot shrink a league;
 *  3. the bounds a validator enforces are the bounds the ENGINE actually has,
 *     asserted against the engine rather than restated.
 */
import { describe, it, expect } from 'vitest';
import { checkLeague, serialiseLeague, MAX_PROBLEMS } from '../league.ts';
import { LEAGUE_AS_WRITTEN, type Team } from '../teams.ts';
import { bracketFor, BRACKET } from '../rules.ts';
import { assignPositions } from '../defense.ts';
import { arsenalOf } from '../../core/pitcher.ts';

/** A deep copy, so a test that mutates one club cannot poison the next. */
const copy = (): Team[] => JSON.parse(serialiseLeague(LEAGUE_AS_WRITTEN)) as Team[];

const problemsOf = (clubs: unknown): readonly string[] => {
  const check = checkLeague(clubs);
  return check.ok ? [] : check.problems;
};

/** Every complaint as one string, for asserting that the right one was made. */
const said = (clubs: unknown): string => problemsOf(clubs).join('\n');

describe('the document', () => {
  it('round-trips the shipped clubs exactly', () => {
    // ⚠️ THE INVARIANT THE WHOLE FEATURE RESTS ON. The league screen exports
    // LEAGUE_AS_WRITTEN, and teams.ts feeds an imported document back in where
    // WRITTEN went in — so temper() is applied to it exactly once. If the text
    // that comes out is not the object that goes back in, then exporting,
    // changing one bio and re-importing would move numbers nobody touched.
    const there = serialiseLeague(LEAGUE_AS_WRITTEN);
    const back = JSON.parse(there) as unknown;
    expect(back).toEqual(LEAGUE_AS_WRITTEN);
    expect(serialiseLeague(back as Team[])).toBe(there);
  });

  it('accepts what it round-trips', () => {
    expect(problemsOf(copy())).toEqual([]);
  });

  it('refuses anything that is not a list of clubs', () => {
    for (const junk of [null, undefined, 42, 'a league', {}, { clubs: [] }]) {
      expect(checkLeague(junk).ok, String(junk)).toBe(false);
    }
  });
});

describe('how many clubs', () => {
  it('needs at least two', () => {
    expect(said(copy().slice(0, 1))).toMatch(/at least two clubs/);
    expect(said([])).toMatch(/at least two clubs/);
  });

  it('refuses an odd number, because the schedule would pair a club with itself', () => {
    expect(said(copy().slice(0, 5))).toMatch(/even number/);
    expect(problemsOf(copy().slice(0, 6))).toEqual([]);
    expect(problemsOf(copy().slice(0, 2))).toEqual([]);
  });
});

describe('a club', () => {
  it('needs exactly nine hitters, because the field is filled from the order', () => {
    // ⚠️ ASSERTED AGAINST defense.ts, NOT AGAINST THE NUMBER NINE. This is why
    // nine is a rule: assignPositions() fills eight fielding positions and a DH
    // off the batting order, so a short lineup leaves somebody's position empty
    // and the club fields a ghost with league-average hands.
    const short = copy();
    short[0]!.lineup = short[0]!.lineup.slice(0, 8);
    const holes = Object.values(assignPositions(short[0]!.lineup)).filter((p) => p === null);
    expect(holes.length).toBeGreaterThan(1);
    expect(said(short)).toMatch(/exactly 9 hitters/);

    const long = copy();
    long[0]!.lineup = [...long[0]!.lineup, long[1]!.lineup[0]!];
    expect(said(long)).toMatch(/exactly 9 hitters/);
  });

  it('needs an arm in the rotation and one in the pen, but not three', () => {
    const thin = copy();
    thin[0]!.rotation = thin[0]!.rotation.slice(0, 1);
    thin[0]!.bullpen = thin[0]!.bullpen.slice(0, 1);
    expect(problemsOf(thin)).toEqual([]);

    const none = copy();
    none[0]!.rotation = [];
    expect(said(none)).toMatch(/at least one arm in the rotation/);
  });

  it('takes a bench of any size, or none at all', () => {
    const bare = copy();
    for (const t of bare) delete (t as Partial<Team>).bench;
    expect(problemsOf(bare)).toEqual([]);

    const deep = copy();
    deep[0]!.bench = [...(deep[0]!.bench ?? []), ...(deep[1]!.bench ?? [])];
    // The borrowed men are on two clubs now, so this must complain about the
    // duplicates and NOT about the length.
    expect(said(deep)).not.toMatch(/bench must be a list/);
  });

  it('takes a club with no identity', () => {
    const plain = copy();
    for (const t of plain) delete (t as Partial<Team>).identity;
    expect(problemsOf(plain)).toEqual([]);
  });
});

describe('a rating', () => {
  it('refuses the two values that poison the engine', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      const clubs = copy();
      clubs[0]!.lineup[0]!.power = bad;
      expect(said(clubs), String(bad)).toMatch(/power must be a number/);
    }
  });

  it('allows a silly one, because a silly league is not a broken one', () => {
    const clubs = copy();
    clubs[0]!.lineup[0]!.power = 9;
    clubs[0]!.lineup[1]!.contact = 0;
    expect(problemsOf(clubs)).toEqual([]);
  });

  it('lets an arm leave off the ratings that default to one', () => {
    const clubs = copy();
    const arm = clubs[0]!.rotation[0]!;
    delete arm.break;
    delete arm.clutch;
    delete arm.stamina;
    delete arm.speedBonus;
    expect(problemsOf(clubs)).toEqual([]);
  });
});

describe('an arm', () => {
  it('has to actually throw something', () => {
    // arsenalOf() filters to positive shares, and main.ts opens the pitch
    // picker with the first of them — so an empty mix is an undefined pitch
    // type reaching the outcome tables, not a bad pitcher.
    const clubs = copy();
    const arm = clubs[0]!.rotation[0]!;
    arm.arsenal = { fastball: 0, slider: 0 };
    expect(arsenalOf(arm)).toHaveLength(0);
    expect(said(clubs)).toMatch(/actually throw something/);
  });

  it('cannot put a hitter away with a pitch he does not throw', () => {
    const clubs = copy();
    clubs[0]!.rotation[0]!.arsenal = { fastball: 1 };
    clubs[0]!.rotation[0]!.putaway = 'knuckleball';
    expect(said(clubs)).toMatch(/never throws/);
  });

  it('refuses a pitch type nobody has tables for', () => {
    const clubs = copy();
    (clubs[0]!.rotation[0]!.arsenal as Record<string, number>)['eephus'] = 1;
    expect(said(clubs)).toMatch(/does not know the pitch "eephus"/);
  });
});

describe('names are keys', () => {
  it('refuses two clubs sharing an abbreviation', () => {
    const clubs = copy();
    clubs[1]!.abbr = clubs[0]!.abbr;
    expect(said(clubs)).toMatch(/abbr .* is already on/);
  });

  it('refuses two hitters sharing a name, because the batting line is keyed by it', () => {
    const clubs = copy();
    clubs[1]!.lineup[0]!.name = clubs[0]!.lineup[0]!.name;
    expect(said(clubs)).toMatch(/hitter .* is already on/);
  });

  it('refuses two arms sharing a name, because rest is keyed by it too', () => {
    const clubs = copy();
    clubs[1]!.bullpen[0]!.name = clubs[0]!.rotation[0]!.name;
    expect(said(clubs)).toMatch(/pitcher .* is already on/);
  });

  it('lets a hitter and a pitcher share a name — the book keeps them apart', () => {
    const clubs = copy();
    clubs[0]!.rotation[0]!.name = clubs[1]!.lineup[0]!.name;
    expect(problemsOf(clubs)).toEqual([]);
  });

  it('refuses two players sharing an id', () => {
    const clubs = copy();
    clubs[1]!.lineup[0]!.id = clubs[0]!.lineup[0]!.id;
    expect(said(clubs)).toMatch(/player id .* is already on/);
  });
});

describe('the report', () => {
  it('stops before it writes a novel', () => {
    // Every club wrong in the same way: the list has to stay readable.
    const clubs = copy().map((t) => ({ ...t, lineup: [] }));
    const problems = problemsOf(clubs);
    expect(problems.length).toBeLessThanOrEqual(MAX_PROBLEMS + 1);
    expect(problems.at(-1)).toMatch(/and \d+ more/);
  });

  it('names the club the problem is in', () => {
    const clubs = copy();
    clubs[3]!.lineup[0]!.bats = 'S' as 'L';
    expect(said(clubs)).toContain(clubs[3]!.abbr);
  });
});

describe('the bracket fits the league', () => {
  it('never asks for more clubs than there are', () => {
    for (const clubs of [2, 4, 6, 8, 12, 30]) {
      for (const choice of BRACKET) {
        const fitted = bracketFor(choice.value, clubs);
        expect(fitted).toBeLessThanOrEqual(clubs);
        expect(fitted).toBeLessThanOrEqual(choice.value);
        // A power of two, or a round cannot halve.
        expect(Number.isInteger(Math.log2(fitted))).toBe(true);
        expect(fitted).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('leaves every shipped choice alone at thirty clubs', () => {
    for (const choice of BRACKET) expect(bracketFor(choice.value, 30)).toBe(choice.value);
  });
});
