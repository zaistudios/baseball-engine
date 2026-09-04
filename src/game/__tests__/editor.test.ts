/**
 * The club editor's setters.
 *
 * ⚠️ THE ONE THING WORTH TESTING HERE IS THAT AN EDIT STILL SAVES. The editor
 * does not validate — checkLeague() does, and it is the only thing that does —
 * so the failure this file exists to catch is the editor producing a club the
 * validator then refuses. Every test below ends by putting the edited league
 * through checkLeague(), because "it set the field" is not the property that
 * matters; "the game will still load it" is.
 */

import { describe, expect, it } from 'vitest';
import {
  ARM_FIELDS,
  ARSENAL_FIELDS,
  CLUB_FIELDS,
  GROUPS,
  HITTER_FIELDS,
  IDENTITY_FIELDS,
  addPerson,
  blankArm,
  blankHitter,
  coerce,
  freeId,
  groupOf,
  movePerson,
  removePerson,
  replaceClub,
  withArsenalShare,
  withClubField,
  withIdentityField,
  withPersonField,
  workingCopy,
} from '../editor.ts';
import { checkLeague } from '../league.ts';
import { LEAGUE_SOURCE } from '../teams.ts';
import type { Team } from '../teams.ts';

const league = () => workingCopy(LEAGUE_SOURCE);

/** Every test's last line. Says which club broke rather than just "false". */
const stillLoads = (l: readonly Team[]): void => {
  const check = checkLeague(l);
  expect(check.ok ? [] : check.problems).toEqual([]);
};

describe('the working copy', () => {
  it('is deep, so editing it cannot reach the clubs that shipped', () => {
    const l = league();
    const before = LEAGUE_SOURCE[0]!.lineup[0]!.power;
    (l[0]!.lineup[0] as { power: number }).power = 99;
    expect(LEAGUE_SOURCE[0]!.lineup[0]!.power).toBe(before);
  });

  it('starts out as something the game would load', () => {
    stillLoads(league());
  });
});

describe('editing a club', () => {
  it('renames it, and the league still loads', () => {
    let l = league();
    l = replaceClub(l, 3, withClubField(l[3]!, 'name', 'Sheffield Cutlers')) as Team[];
    l = replaceClub(l, 3, withClubField(l[3]!, 'abbr', 'SHF')) as Team[];
    expect(l[3]!.name).toBe('Sheffield Cutlers');
    expect(l[3]!.abbr).toBe('SHF');
    stillLoads(l);
  });

  /**
   * ⚠️ AN IDENTITY THAT EXISTS BUT IS EMPTY IS A VALIDATION ERROR, not an
   * absent one — checkIdentity() wants a name and a blurb the moment the key is
   * there at all. So clearing both fields has to take the whole block away, and
   * this is the test that says so.
   */
  it('drops the identity block when the last of it is cleared', () => {
    let club = league()[0]!;
    expect(club.identity).toBeDefined();
    club = withIdentityField(club, 'name', '');
    club = withIdentityField(club, 'blurb', '');
    expect(club.identity).toBeUndefined();
    stillLoads(replaceClub(league(), 0, club));
  });

  it('builds the identity block back up from nothing', () => {
    let club = withIdentityField(league()[0]!, 'name', '');
    club = withIdentityField(club, 'blurb', '');
    club = withIdentityField(club, 'name', 'GRINDERS');
    club = withIdentityField(club, 'blurb', 'They foul everything off.');
    expect(club.identity?.name).toBe('GRINDERS');
    stillLoads(replaceClub(league(), 0, club));
  });
});

describe('editing a person', () => {
  it('sets a rating and keeps the league loadable', () => {
    let l = league();
    l = replaceClub(l, 2, withPersonField(l[2]!, 'lineup', 4, 'power', 1.6)) as Team[];
    expect(l[2]!.lineup[4]!.power).toBe(1.6);
    stillLoads(l);
  });

  it('sets a share in an arm’s mix without touching the rest of it', () => {
    let l = league();
    const before = { ...l[1]!.rotation[0]!.arsenal };
    l = replaceClub(l, 1, withArsenalShare(l[1]!, 'rotation', 0, 'fastball', 7)) as Team[];
    const after = l[1]!.rotation[0]!.arsenal;
    expect(after.fastball).toBe(7);
    for (const k of Object.keys(before)) {
      if (k !== 'fastball') expect(after[k as keyof typeof after]).toBe(before[k as keyof typeof before]);
    }
    stillLoads(l);
  });
});

describe('adding and removing', () => {
  it('adds a legal man to every list, and the league still loads', () => {
    for (const g of GROUPS) {
      let l = league();
      const club = l[5]!;
      const n = (club[g.key] ?? []).length;
      // The lineup is full at nine, so it is the one that must refuse.
      const next = addPerson(l, 5, g.key);
      if (n >= g.max) {
        expect(next).toBe(l);
        continue;
      }
      l = next as Team[];
      expect((l[5]![g.key] ?? []).length).toBe(n + 1);
      stillLoads(l);
    }
  });

  it('refuses to take a list below what the engine needs', () => {
    const club = league()[0]!;
    // Nine hitters exactly — checkClub() says so, and eight makes assignPositions()
    // field a ghost at first base.
    expect(removePerson(club, 'lineup', 0)).toBe(club);
    // One arm minimum in each: zero starters is a game nobody can open.
    let thin = club;
    while ((thin.rotation ?? []).length > 1) thin = removePerson(thin, 'rotation', 0);
    expect(removePerson(thin, 'rotation', 0)).toBe(thin);
    stillLoads(replaceClub(league(), 0, thin));
  });

  it('writes an emptied bench as no bench at all', () => {
    let club = league().find((c) => (c.bench ?? []).length > 0)!;
    while ((club.bench ?? []).length > 0) club = removePerson(club, 'bench', 0);
    expect(club.bench).toBeUndefined();
    stillLoads(replaceClub(league(), 0, club));
  });

  /**
   * ⚠️ IDS ARE UNIQUE ACROSS THE WHOLE LEAGUE, not per club — checkUnique()
   * holds every player id to it. Adding two men to the same club is the obvious
   * way to collide, and freeId() walking past what is taken is the reason it
   * does not.
   */
  it('gives every added hitter an id nobody else has', () => {
    let l: readonly Team[] = league();
    l = addPerson(l, 7, 'bench');
    l = addPerson(l, 7, 'bench');
    l = addPerson(l, 7, 'bench');
    const club = l[7]!;
    const ids = [...club.lineup, ...(club.bench ?? [])].map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    stillLoads(l);
  });

  it('makes a fresh man the validator accepts on his own terms', () => {
    let l: readonly Team[] = league();
    l = addPerson(l, 0, 'bench');
    l = addPerson(l, 0, 'bullpen');
    stillLoads(l);
    // The two rules a blank arm is most likely to break.
    const arm = blankArm(l);
    expect(Object.values(arm.arsenal).some((s) => (s ?? 0) > 0)).toBe(true);
    expect((arm.arsenal as Record<string, number>)[arm.putaway]).toBeGreaterThan(0);
    expect(blankHitter(l, l[0]!).id).not.toBe('');
  });
});

describe('reordering', () => {
  it('moves a man up the batting order and leaves everyone else in place', () => {
    const club = league()[0]!;
    const names = club.lineup.map((p) => p.name);
    const moved = movePerson(club, 'lineup', 3, -1);
    expect(moved.lineup.map((p) => p.name)).toEqual([
      names[0]!, names[1]!, names[3]!, names[2]!, ...names.slice(4),
    ]);
    stillLoads(replaceClub(league(), 0, moved));
  });

  it('will not walk anybody off either end', () => {
    const club = league()[0]!;
    expect(movePerson(club, 'lineup', 0, -1)).toBe(club);
    expect(movePerson(club, 'lineup', club.lineup.length - 1, 1)).toBe(club);
  });
});

/**
 * ⚠️ THE FORM HANDS BACK STRINGS AND THE ENGINE WANTS NUMBERS, and the empty
 * string is where the two disagree in a way that matters. `stamina` left off
 * means league average; `stamina: 0` is an arm with nothing in the tank. A
 * number input hands back "" the moment it is cleared.
 */
describe('coercing what a control hands back', () => {
  const optional = ARM_FIELDS.find((f) => f.key === 'stamina')!;
  const required = ARM_FIELDS.find((f) => f.key === 'zoneRate')!;

  it('clears an optional rating to absent, not to zero', () => {
    expect(coerce(optional, '')).toBeUndefined();
    const club = withPersonField(league()[0]!, 'rotation', 0, 'stamina', coerce(optional, ''));
    expect('stamina' in (club.rotation[0] as object)).toBe(false);
    stillLoads(replaceClub(league(), 0, club));
  });

  it('reads a number, and falls back rather than writing NaN', () => {
    expect(coerce(required, '0.62')).toBe(0.62);
    expect(coerce(required, 'banana')).toBe(0);
    expect(coerce(required, '')).toBe(0);
  });
});

/**
 * The dropdowns are built from league.ts's own vocabularies, so this is really
 * a check that they were imported rather than retyped — a hand-copied list that
 * drifts is the failure that shows up as "the editor saved something the game
 * then refused to load".
 */
describe('every choice on offer is one the validator accepts', () => {
  it('holds for hitters, arms, the club and the identity', () => {
    const all = [...CLUB_FIELDS, ...IDENTITY_FIELDS, ...HITTER_FIELDS, ...ARM_FIELDS];
    for (const f of all.filter((x) => x.kind === 'choice')) {
      expect(f.choices?.length, f.key).toBeGreaterThan(0);
    }
    // Walk a real hitter through every build and trait the editor offers.
    for (const f of HITTER_FIELDS.filter((x) => x.kind === 'choice')) {
      for (const choice of f.choices!) {
        const club = withPersonField(league()[0]!, 'lineup', 0, f.key, choice);
        stillLoads(replaceClub(league(), 0, club));
      }
    }
  });

  it('offers a share for every pitch, and an out pitch from the same list', () => {
    const putaway = ARM_FIELDS.find((f) => f.key === 'putaway')!;
    expect(ARSENAL_FIELDS.map((f) => f.key).sort()).toEqual([...putaway.choices!].sort());
  });
});

describe('the group table', () => {
  it('knows what each list holds', () => {
    expect(groupOf('lineup').of).toBe('hitter');
    expect(groupOf('bench').of).toBe('hitter');
    expect(groupOf('rotation').of).toBe('arm');
    expect(groupOf('bullpen').of).toBe('arm');
  });

  it('scopes a fresh id to the club it is on', () => {
    const club = league()[0]!;
    expect(freeId(league(), club).startsWith(`${club.abbr.toLowerCase()}-new`)).toBe(true);
  });
});
