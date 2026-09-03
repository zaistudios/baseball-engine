/**
 * SCENARIOS — the moments the season EARNS rather than the ones the calendar
 * hands out. Each one reads what actually happened and asks about it.
 *
 * ⚠️ THE NOISE TESTS ARE THE IMPORTANT ONES HERE, the way the flatness test is
 * the important one in moments.test.ts. A trigger that fires on four at-bats is
 * not reading the season, it is reading the dice — and it would LOOK like it
 * was working, because the headline would still name a real player and quote a
 * real number. Nothing else in the codebase would notice.
 */

import { describe, expect, it } from 'vitest';
import {
  newSeason,
  playDay,
  regularDays,
  teamOf,
  yourGame,
  type Result,
  type Season,
} from '../franchise.ts';
import { momentOn, decide, momentDays } from '../moments.ts';

import { clubValue } from '../value.ts';
import type { BatLine, ArmLine } from '../stats.ts';

/**
 * ⚠️ AN ID NAMES ITS SUBJECT — `slump:Ed Mancuso`, not `slump` — so that a
 * different man going cold later in the year is a different question. Tests ask
 * about the KIND of scenario; the subject is the half that varies.
 */
const kind = (id: string | undefined): string | undefined => id?.split(':')[0];


/** A season played out headlessly to a given day, with real stats in it. */
function played(you: string, days: number, seed = 4242, games = 28): Season {
  let s = newSeason(you, seed, games);
  for (let d = 0; d < days; d++) {
    const m = yourGame(s);
    if (!m) {
      s = playDay(s);
      continue;
    }
    // Hand your own result in, the way main.ts does.
    const home = m.home === you;
    const r: Result = { ...m, day: d, hr: home ? 5 : 2, ar: home ? 2 : 5 };
    s = playDay(s, r);
  }
  return s;
}

const bat = (over: Partial<BatLine>): BatLine => ({
  pa: 0, ab: 0, h: 0, d: 0, t: 0, hr: 0, bb: 0, k: 0, rbi: 0, tm: 'ALB', ...over,
});
const arm = (over: Partial<ArmLine>): ArmLine => ({
  outs: 0, h: 0, bb: 0, k: 0, r: 0, er: 0, w: 0, l: 0, tm: 'ALB', ...over,
});

/** Force the exact shape a scenario is meant to notice. */
function withLines(s: Season, lines: Record<string, BatLine | ArmLine>): Season {
  const b = { ...(s.stats?.bat ?? {}) };
  const a = { ...(s.stats?.arm ?? {}) };
  for (const [name, l] of Object.entries(lines)) {
    if ('pa' in l) b[name] = l;
    else a[name] = l;
  }
  return { ...s, stats: { bat: b, arm: a } };
}

const legal = (s: Season, abbr: string): void => {
  const t = teamOf(s, abbr);
  expect(t.lineup).toHaveLength(9);
  expect(t.rotation.length).toBeGreaterThan(0);
  expect(t.bullpen.length).toBeGreaterThan(0);
  const names = [...t.lineup, ...(t.bench ?? [])].map((p) => p.name);
  expect(new Set(names).size, 'a man in two places at once').toBe(names.length);
};

describe('the slump', () => {
  /** A cold regular and a hot bench man, on samples that clear the floor. */
  const slumping = (day = 12): Season => {
    const s = played('ALB', day);
    const you = teamOf(s, 'ALB');
    const reg = you.lineup[3]!;
    const sub = (you.bench ?? [])[0]!;
    return withLines({ ...s, day }, {
      [reg.name]: bat({ pa: 60, ab: 55, h: 9, hr: 1, rbi: 5 }), // .164
      [sub.name]: bat({ pa: 22, ab: 20, h: 8, hr: 2, rbi: 6 }), // .400
    });
  };

  it('fires when a regular is cold and somebody better is sitting', () => {
    const m = momentOn(slumping());
    expect(kind(m?.id)).toBe('slump');
    expect(m!.headline).toBe('THE SLUMP');
    expect(m!.choices.length).toBeGreaterThanOrEqual(2);
  });

  it('does NOT fire on a tiny sample, however bad the average looks', () => {
    // ⚠️ THE WHOLE POINT. One-for-nine is a bad week, not a slump, and a system
    // that cannot tell them apart is a random moment generator with statistics
    // printed on it.
    const s = played('ALB', 12);
    const you = teamOf(s, 'ALB');
    const cold = withLines({ ...s, day: 12 }, {
      [you.lineup[3]!.name]: bat({ pa: 9, ab: 9, h: 1 }), // .111 on nothing
      [(you.bench ?? [])[0]!.name]: bat({ pa: 6, ab: 6, h: 4 }), // .667 on less
    });
    expect(kind(momentOn(cold)?.id)).not.toBe('slump');
  });

  it('does NOT fire when there is nobody better to play', () => {
    // Half the trigger is the alternative. A bad seven-hitter with no answer
    // behind him is a fact about your roster, not a decision.
    const s = played('ALB', 12);
    const you = teamOf(s, 'ALB');
    const noAnswer = withLines({ ...s, day: 12 }, {
      [you.lineup[3]!.name]: bat({ pa: 60, ab: 55, h: 9 }),
      [(you.bench ?? [])[0]!.name]: bat({ pa: 22, ab: 20, h: 3 }), // .150, worse
    });
    expect(kind(momentOn(noAnswer)?.id)).not.toBe('slump');
  });

  it('actually swaps the two men and leaves the roster legal', () => {
    const s = slumping();
    const m = momentOn(s)!;
    const before = teamOf(s, 'ALB');
    const cold = before.lineup[3]!;
    const after = decide(s, m, 0);
    const now = teamOf(after, 'ALB');

    expect(now.lineup.map((p) => p.id)).not.toContain(cold.id);
    expect((now.bench ?? []).map((p) => p.id)).toContain(cold.id);
    legal(after, 'ALB');
  });

  it('riding it out changes nothing but the wire', () => {
    const s = slumping();
    const m = momentOn(s)!;
    const after = decide(s, m, m.choices.length - 1);
    expect(teamOf(after, 'ALB').lineup.map((p) => p.id)).toEqual(
      teamOf(s, 'ALB').lineup.map((p) => p.id),
    );
    expect(after.news!.at(-1)!.kind).toBe('roster');
  });
});

describe('the rotation', () => {
  const muddled = (day = 12): Season => {
    const s = played('ALB', day);
    const you = teamOf(s, 'ALB');
    return withLines({ ...s, day }, {
      [you.rotation[0]!.name]: arm({ outs: 120, r: 40, er: 38, w: 2, l: 6 }), // ~8.55
      [you.rotation[1]!.name]: arm({ outs: 120, r: 12, er: 10, w: 6, l: 1 }), // ~2.25
    });
  };

  it('fires when the best arm is not the one starting the openers', () => {
    expect(kind(momentOn(muddled())?.id)).toBe('rotation');
  });

  it('does NOT fire on two innings of work', () => {
    const s = played('ALB', 12);
    const you = teamOf(s, 'ALB');
    const thin = withLines({ ...s, day: 12 }, {
      [you.rotation[0]!.name]: arm({ outs: 6, r: 8, er: 8 }),
      [you.rotation[1]!.name]: arm({ outs: 6, r: 0, er: 0 }),
    });
    expect(kind(momentOn(thin)?.id)).not.toBe('rotation');
  });

  it('does NOT fire when the ace already IS the best arm', () => {
    const s = played('ALB', 12);
    const you = teamOf(s, 'ALB');
    const fine = withLines({ ...s, day: 12 }, {
      [you.rotation[0]!.name]: arm({ outs: 120, r: 12, er: 10 }),
      [you.rotation[1]!.name]: arm({ outs: 120, r: 40, er: 38 }),
    });
    expect(kind(momentOn(fine)?.id)).not.toBe('rotation');
  });

  it('promotes him to the front, keeping the same three arms', () => {
    const s = muddled();
    const m = momentOn(s)!;
    const before = teamOf(s, 'ALB').rotation;
    const done = decide(s, m, 0);
    const after = teamOf(done, 'ALB').rotation;
    expect(after[0]!.name).toBe(before[1]!.name);
    expect(after.map((a) => a.name).sort()).toEqual([...before].map((a) => a.name).sort());
    legal(done, 'ALB');
  });
});

describe('asking once, and not every morning', () => {
  const cold = (day = 12): Season => {
    const s = played('ALB', day);
    const you = teamOf(s, 'ALB');
    return withLines({ ...s, day }, {
      [you.lineup[3]!.name]: bat({ pa: 60, ab: 55, h: 9 }),
      [(you.bench ?? [])[0]!.name]: bat({ pa: 22, ab: 20, h: 8 }),
    });
  };

  it('a scenario that stays true does not ask twice', () => {
    // ⚠️ THIS IS WHY Season.seen EXISTS. `decided` records the DAY; a trigger
    // records nothing, and a slump is still a slump tomorrow.
    const s = cold();
    const m = momentOn(s)!;
    expect(kind(m.id)).toBe('slump');
    const after = decide(s, m, m.choices.length - 1); // ride it out: still cold
    expect(after.seen).toContain(m.id);
    for (let d = 13; d < regularDays(after); d++) {
      // The SAME man must not come back. A different one may.
      expect(momentOn({ ...after, day: d }, d)?.id, `day ${d}`).not.toBe(m.id);
    }
  });

  it('leaves a stretch of baseball between questions', () => {
    // Asked yesterday, so today is quiet however loud the trigger is.
    expect(momentOn({ ...cold(), decided: [11] })).toBeNull();
  });

  it('gives the dated pair their day however loud the season is', () => {
    // ⚠️ THE DEADLINE HAS ONE DAY A YEAR AND IT KEPT LOSING IT. The scheduled
    // two used to be the last rows of one list, so a man hitting .164 on the
    // deadline itself took the day and the trade never happened — measured at
    // 18 seasons in 40. They are checked first on their own day now, and ahead
    // of the rest gate, so an earned moment three days earlier cannot eat it
    // either.
    for (const [i, day] of momentDays(newSeason('ALB', 7, 28)).entries()) {
      const s = played('ALB', 12);
      const you = teamOf(s, 'ALB');
      // ...and asked yesterday, so the rest gate is against it as well.
      const loud = withLines({ ...s, day, decided: [day - 1] }, {
        [you.lineup[3]!.name]: bat({ pa: 60, ab: 55, h: 9 }), // .164, slumping
        [(you.bench ?? [])[0]!.name]: bat({ pa: 22, ab: 20, h: 8 }), // .400, sitting
      });
      expect(kind(momentOn(loud)?.id), `day ${day}`).toBe(['deadline', 'bench'][i]);
    }
  });

  it('says nothing earned on a season with no games in it', () => {
    for (let d = 0; d < 14; d++) {
      const fresh = { ...newSeason('ALB', 7, 28), day: d };
      const m = momentOn(fresh, d);
      // The scheduled two still fire on their days; nothing else may.
      if (m) expect(['deadline', 'bench']).toContain(m.id);
    }
  });
});

describe('a scenario never hands you value', () => {
  it('no choice moves your roster more than a deadline trade would', () => {
    // ⚠️ THE RULE moments.ts WAS BUILT ON, re-asserted for the earned moments.
    // A scenario that pays you for a good season compounds — the club in front
    // gets the reward — and the standings stop meaning anything. If that rule
    // is ever changed it should change here, loudly.
    const s = played('ALB', 12);
    const you = teamOf(s, 'ALB');
    const rich = withLines({ ...s, day: 12 }, {
      [you.lineup[3]!.name]: bat({ pa: 60, ab: 55, h: 9 }),
      [(you.bench ?? [])[0]!.name]: bat({ pa: 22, ab: 20, h: 8 }),
      [you.rotation[0]!.name]: arm({ outs: 120, r: 40, er: 38 }),
      [you.rotation[1]!.name]: arm({ outs: 120, r: 12, er: 10 }),
    });
    const m = momentOn(rich)!;
    const before = clubValue(teamOf(rich, 'ALB'));
    for (let i = 0; i < m.choices.length; i++) {
      const after = clubValue(teamOf(decide(rich, m, i), 'ALB'));
      expect(Math.abs(after - before), `${m.id} choice ${i}`).toBeLessThan(0.25);
    }
  });
});

describe('determinism', () => {
  it('asks the same question of the same season twice', () => {
    const s = played('ALB', 12);
    const you = teamOf(s, 'ALB');
    const fixed = withLines({ ...s, day: 12 }, {
      [you.lineup[3]!.name]: bat({ pa: 60, ab: 55, h: 9 }),
      [(you.bench ?? [])[0]!.name]: bat({ pa: 22, ab: 20, h: 8 }),
    });
    const a = momentOn(fixed)!;
    const b = momentOn(fixed)!;
    expect(a.id).toBe(b.id);
    expect(a.body).toBe(b.body);
    expect(a.choices.map((c) => c.label)).toEqual(b.choices.map((c) => c.label));
  });
});
