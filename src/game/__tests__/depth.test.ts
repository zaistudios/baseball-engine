/**
 * THE 26-MAN ROSTER, and the three things about it that are easy to break.
 *
 *   1. NAMES. rotation.ts keys the whole season's rest ledger by name, because
 *      a Pitcher has no id. Two men sharing one share an arm.
 *   2. THE LADDER. teams.ts is balanced by measurement and value.ts turns it
 *      into a rank the pre-game card shows. Eight more men per club must not
 *      re-order that.
 *   3. THE TILT. A club's identity shapes its staff and is not allowed to
 *      change what the staff is WORTH — see identity.ts, which forbids it in
 *      as many words.
 */

import { describe, it, expect } from 'vitest';
import { LEAGUE, LEAGUE_AS_WRITTEN } from '../teams.ts';
import {
  fillRoster,
  rosterSize,
  ROSTER_SIZE,
  ROTATION_SIZE,
  BULLPEN_SIZE,
  BENCH_SIZE,
  LINEUP_SIZE,
} from '../depth.ts';
import { IDENTITIES } from '../identity.ts';
import { clubValue, stuffValue } from '../value.ts';
import { pickReliever } from '../rotation.ts';

/** The same club with the generated depth taken back off again. */
const thin = <T extends { rotation: readonly unknown[]; bullpen: readonly unknown[] }>(t: T) => ({
  ...t,
  rotation: t.rotation.slice(0, ROTATION_SIZE - 2),
  bullpen: t.bullpen.slice(0, BULLPEN_SIZE - 5),
  bench: ((t as { bench?: readonly unknown[] }).bench ?? []).slice(0, BENCH_SIZE - 1),
});

describe('every club dresses twenty-six', () => {
  it('is thirteen pitchers and thirteen position players', () => {
    expect(ROTATION_SIZE + BULLPEN_SIZE).toBe(13);
    expect(LINEUP_SIZE + BENCH_SIZE).toBe(13);
    expect(ROSTER_SIZE).toBe(26);
  });

  it('fills every club to the same number', () => {
    for (const t of LEAGUE) expect(rosterSize(t), t.abbr).toBe(ROSTER_SIZE);
  });

  it('names every man in the league exactly once', () => {
    const names = LEAGUE.flatMap((t) => [
      ...t.lineup.map((p) => p.name),
      ...(t.bench ?? []).map((p) => p.name),
      ...t.rotation.map((a) => a.name),
      ...t.bullpen.map((a) => a.name),
    ]);
    const seen = new Set<string>();
    const dupes = names.filter((n) => (seen.has(n) ? true : (seen.add(n), false)));
    expect(dupes).toEqual([]);
    expect(names).toHaveLength(LEAGUE.length * ROSTER_SIZE);
  });

  it('gives every generated arm a putaway he actually throws', () => {
    // The invariant core/__tests__/pitcher.test.ts holds the written nine to.
    // depthArm() copies the mix and the out pitch as a pair, which is the
    // reason it cannot come apart — this is the check on that reasoning.
    for (const t of LEAGUE) {
      for (const a of [...t.rotation, ...t.bullpen]) {
        expect(a.arsenal[a.putaway], `${a.name} putaway ${a.putaway}`).toBeDefined();
      }
    }
  });

  it('leaves every pen a left-hander to bring in', () => {
    for (const t of LEAGUE) {
      expect(t.bullpen.some((a) => a.throws === 'L'), t.abbr).toBe(true);
    }
  });
});

describe('filling is pure and idempotent', () => {
  it('hands back a club that is already full, untouched', () => {
    for (const t of LEAGUE_AS_WRITTEN) expect(fillRoster(t)).toBe(t);
  });

  it('produces the same men every time it is asked', () => {
    for (const t of LEAGUE_AS_WRITTEN) {
      const a = fillRoster(thin(t) as typeof t);
      const b = fillRoster(thin(t) as typeof t);
      expect(a).toEqual(b);
    }
  });

  it('only ever adds, never replaces what was written', () => {
    for (const t of LEAGUE_AS_WRITTEN) {
      const filled = fillRoster(thin(t) as typeof t);
      expect(filled.rotation.slice(0, ROTATION_SIZE - 2)).toEqual(thin(t).rotation);
      expect(filled.bullpen.slice(0, BULLPEN_SIZE - 5)).toEqual(thin(t).bullpen);
    }
  });
});

describe('a starter has starter legs and a reliever has short ones', () => {
  it('holds for every arm in the league, written or generated', () => {
    for (const t of LEAGUE) {
      for (const a of t.rotation) {
        expect(a.stamina ?? 1, `SP ${a.name}`).toBeGreaterThanOrEqual(0.87);
      }
      for (const a of t.bullpen) {
        expect(a.stamina ?? 1, `RP ${a.name}`).toBeLessThanOrEqual(0.95);
      }
    }
  });

  it('never puts a reliever ahead of an arm the club actually wrote as a starter', () => {
    // ⚠️ MEASURED AGAINST THE WRITTEN THREE, NOT ALL FIVE, AND THE DIFFERENCE
    // IS DENVER. The long man's stamina scales with the club's own pen, and
    // before the clamps it produced a RELIEVER AT 1.14 — longer than four of
    // the five starters ahead of him, which is a sixth starter with a
    // bullpen's name on him.
    //
    // What is still allowed, and should be, is a QUICK HOOK club's fifth
    // starter coming in under his own long man. Denver has the shortest ace in
    // the league and a manager who is on the phone in the fifth; a five-and-
    // dive man behind a reliever who goes three is what that club IS. The line
    // that must hold is against the arms teams.ts cast by hand.
    for (const t of LEAGUE) {
      const written = Math.min(...t.rotation.slice(0, ROTATION_SIZE - 2).map((a) => a.stamina ?? 1));
      const longestRP = Math.max(...t.bullpen.map((a) => a.stamina ?? 1));
      expect(longestRP, `${t.abbr} pen vs written rotation`).toBeLessThan(written);
    }
  });
});

describe('the depth does not touch the talent ladder', () => {
  it('moves no club up or down a rank', () => {
    const rank = (list: readonly { abbr: string }[], val: (t: never) => number) =>
      new Map(
        [...list]
          .sort((a, b) => val(b as never) - val(a as never))
          .map((t, i) => [t.abbr, i + 1]),
      );
    const before = rank(LEAGUE_AS_WRITTEN.map(thin) as never[], clubValue as never);
    const after = rank(LEAGUE_AS_WRITTEN, clubValue as never);
    for (const t of LEAGUE_AS_WRITTEN) {
      expect(after.get(t.abbr), `${t.abbr} rank`).toBe(before.get(t.abbr));
    }
  });

  it('leaves a club worth the same under all eight identities', () => {
    // ⚠️ THE TILT IS A TRANSFER. See TILT in depth.ts: whatever stamina the
    // quick-hook pen gains, the back of its rotation gives up. If this ever
    // fails, somebody turned one side of that trade without the other and a
    // behaviour knob has quietly become a rating bonus.
    const spread = Math.max(
      ...LEAGUE_AS_WRITTEN.map((t) => {
        const bare = thin(t) as typeof t;
        const vals = Object.values(IDENTITIES).map((identity) =>
          clubValue(fillRoster({ ...bare, identity })),
        );
        return Math.max(...vals) - Math.min(...vals);
      }),
    );
    // A hundredth of a point, against a league that spans about 1.4.
    expect(spread).toBeLessThan(0.01);
  });
});

describe('the depth never takes a job off a man teams.ts wrote', () => {
  it('out-pitches nobody in the group it joins', () => {
    // ⚠️ MEASURED ON STUFF, WITH THE INNINGS LEFT OUT — see stuffValue() in
    // value.ts. An IRON ARMS club's fourth starter genuinely IS worth more
    // than a quick-hook club's, because he goes deeper and armValue() prices
    // that; what he must not be is a better PITCHER than the ace.
    for (const t of LEAGUE) {
      const written = (xs: readonly typeof t.rotation[number][]) => Math.max(...xs.map(stuffValue));
      expect(
        Math.max(...t.rotation.slice(ROTATION_SIZE - 2).map(stuffValue)),
        `${t.abbr} rotation depth`,
      ).toBeLessThan(written(t.rotation.slice(0, ROTATION_SIZE - 2)));
      expect(
        Math.max(...t.bullpen.slice(BULLPEN_SIZE - 5).map(stuffValue)),
        `${t.abbr} pen depth`,
      ).toBeLessThan(written(t.bullpen.slice(0, BULLPEN_SIZE - 5)));
    }
  });

  it('never gets the ball in the ninth of a one-run game', () => {
    // ⚠️ THE BUG A SEASON PROBE FOUND AND THE RATINGS HID. pickReliever()
    // sends the best arm late and close; before the cap and before stuffValue
    // it was sending a GENERATED middle reliever on ten of the thirty clubs,
    // Chicago included — the club named for the man who comes in to put the
    // rally out was leaving him in the pen.
    for (const t of LEAGUE) {
      const at = pickReliever(t.bullpen, { inning: 9, deficit: 1 });
      expect(at, `${t.abbr} sends ${t.bullpen[at]!.name}`).toBeLessThan(BULLPEN_SIZE - 5);
    }
  });
});

describe('a club plays like itself all the way down', () => {
  const of = (abbr: string) => LEAGUE.find((t) => t.abbr === abbr)!;
  const staminaOf = (arms: readonly { stamina?: number }[]) =>
    arms.reduce((a, x) => a + (x.stamina ?? 1), 0) / arms.length;

  it('gives a quick hook a longer pen and a shorter rotation than an iron-arms club', () => {
    // CHF goes and gets him in the fifth; BUF rides him. Both are true of the
    // manager already — this is the staff he was given to do it with.
    const quick = of('CHF');
    const iron = of('BUF');
    expect(staminaOf(quick.bullpen)).toBeGreaterThan(staminaOf(iron.bullpen));
    expect(staminaOf(quick.rotation)).toBeLessThan(staminaOf(iron.rotation));
  });

  it('gives a running club legs on the last man off the bench', () => {
    const runners = of('LAC').bench!.at(-1)!;
    const sluggers = of('DET').bench!.at(-1)!;
    expect(runners.speed).toBeGreaterThan(sluggers.speed);
    expect(sluggers.power).toBeGreaterThan(runners.power);
  });
});
