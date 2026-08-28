/**
 * The rotation: three starters, a rest rule, and a pen you pick from.
 *
 * ⚠️ THE TEST THAT MATTERS MOST IS 'a season turns its rotation over'. Every
 * other assertion here can pass while the feature is dead — the old bug was
 * not that the maths was wrong, it was that NOBODY EVER CALLED IT with
 * anything but index 0. So the integration tests play real seasons and count
 * distinct starters, which is the number that was 1 for fourteen games.
 */

import { describe, it, expect } from 'vitest';
import {
  REST_TO_FULL,
  SPENT,
  freshness,
  restedStamina,
  starterOptions,
  pickStarter,
  pickReliever,
  recordStart,
  recordRelief,
  reliefCost,
  penFreshness,
  penLegs,
  APPEARANCE_COST,
  RELIEF_REST_TO_FULL,
  type RestLog,
} from '../rotation.ts';
import { LEAGUE, club } from '../teams.ts';
import { newStaff, bringInRelief, fatigue, shouldRelieve, recordPitch, openedBy, GASSED_AT } from '../bullpen.ts';
import { newGame, goToBullpen, fieldingStaff } from '../game.ts';
import { simulateGame } from '../sim.ts';
import { newSeason, playDay, seasonOver, starterFor, armFor, restOf, penRestOf, yourGame, teamOf } from '../franchise.ts';
import { armValue } from '../value.ts';

const ALB = club('ALB');

describe('every club is three and three', () => {
  it('carries exactly three starters and three relievers', () => {
    for (const t of LEAGUE) {
      expect(t.rotation, `${t.abbr} rotation`).toHaveLength(3);
      expect(t.bullpen, `${t.abbr} bullpen`).toHaveLength(3);
    }
  });

  it('never names the same arm twice, anywhere in the league', () => {
    const names = LEAGUE.flatMap((t) => [...t.rotation, ...t.bullpen]).map((a) => a.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toHaveLength(LEAGUE.length * 6);
  });

  it('gives every arm a putaway it actually throws', () => {
    // The rule core/__tests__/pitcher.test.ts holds the original nine to. A
    // putaway missing from the mix silently falls back and the most legible
    // thing about a pitcher stops existing.
    for (const t of LEAGUE) {
      for (const a of [...t.rotation, ...t.bullpen]) {
        expect(a.arsenal[a.putaway], `${a.name} putaway ${a.putaway}`).toBeDefined();
      }
    }
  });

  it('gives starters starter legs and relievers short ones', () => {
    for (const t of LEAGUE) {
      for (const a of t.rotation) expect(a.stamina ?? 1, `SP ${a.name}`).toBeGreaterThanOrEqual(0.87);
      for (const a of t.bullpen) expect(a.stamina ?? 1, `RP ${a.name}`).toBeLessThanOrEqual(0.95);
    }
  });
});

describe('rest — a game and a half to whole', () => {
  // A man who started on day 10 with a whole unit to spend has nothing left.
  const log: RestLog = { ALB: { 'Ed Mancuso': { day: 10, left: 0 } } };

  it('is whole for a man who has never started', () => {
    expect(freshness({}, 'ALB', 'Ed Mancuso', 5)).toBe(1);
  });

  it('is nothing on the day he threw', () => {
    expect(freshness(log, 'ALB', 'Ed Mancuso', 10)).toBe(0);
  });

  it('is two thirds back the next day', () => {
    expect(freshness(log, 'ALB', 'Ed Mancuso', 11)).toBeCloseTo(1 / REST_TO_FULL, 10);
  });

  it('is whole again two days later, and stays whole', () => {
    expect(freshness(log, 'ALB', 'Ed Mancuso', 12)).toBe(1);
    expect(freshness(log, 'ALB', 'Ed Mancuso', 40)).toBe(1);
  });

  it('never goes negative if the clock somehow runs backwards', () => {
    expect(freshness(log, 'ALB', 'Ed Mancuso', 9)).toBe(0);
  });

  it('spends rest as stamina and nothing else', () => {
    const arm = ALB.rotation[0]!;
    expect(restedStamina(arm, 1)).toBeCloseTo(arm.stamina!, 10);
    expect(restedStamina(arm, 0)).toBeCloseTo(arm.stamina! * SPENT, 10);
    // ...and monotonically between.
    expect(restedStamina(arm, 0.5)).toBeGreaterThan(restedStamina(arm, 0));
    expect(restedStamina(arm, 0.5)).toBeLessThan(restedStamina(arm, 1));
  });

  it('recordStart does not mutate the log it was handed', () => {
    const before: RestLog = { ALB: { 'Ed Mancuso': { day: 3, left: 0 } } };
    const after = recordStart(before, 'ALB', 'Erie Canal Kowal', 4);
    expect(before['ALB']!['Erie Canal Kowal']).toBeUndefined();
    expect(after['ALB']!['Erie Canal Kowal']!.day).toBe(4);
    expect(after['ALB']!['Ed Mancuso']!.day).toBe(3);
  });

  it('names the condition the picker shows', () => {
    const spent: RestLog = { ALB: { [ALB.rotation[0]!.name]: { day: 7, left: 0 } } };
    const words = (day: number) =>
      starterOptions(ALB, spent, day).map((o) => o.condition);
    expect(words(7)[0]).toBe('SPENT');
    expect(words(8)[0]).toBe('WORKING');
    expect(words(9)[0]).toBe('RESTED');
    // Nobody else threw, so they are whole on every one of those days.
    expect(words(7)[1]).toBe('RESTED');
  });
});

describe('the computer picks a starter', () => {
  it('takes its ace when everybody is whole', () => {
    // The ace is rotation[0] by construction — best armValue on the staff.
    const best = ALB.rotation.reduce((a, b) => (armValue(b) > armValue(a) ? b : a));
    expect(ALB.rotation[pickStarter(ALB, {}, 0)]!.name).toBe(best.name);
  });

  it('will not send a spent ace out over a rested third starter', () => {
    const log = recordStart({}, 'ALB', ALB.rotation[0]!.name, 5);
    expect(pickStarter(ALB, log, 5)).not.toBe(0);
  });

  it('comes back to him once the other two have had their turn', () => {
    // Not "once he is whole" — that was the greedy rule, and it never got to
    // the third starter. The rotation is an order: he is up again when he is
    // the man who has waited longest.
    let log = recordStart({}, 'ALB', ALB.rotation[0]!.name, 5);
    log = recordStart(log, 'ALB', ALB.rotation[1]!.name, 6);
    log = recordStart(log, 'ALB', ALB.rotation[2]!.name, 7);
    expect(pickStarter(ALB, log, 8)).toBe(0);
  });

  it('settles into a three-man cycle and repeats it', () => {
    // ⚠️ NOT asserted as literally [0,1,2,...]. Opening day is a tie broken on
    // armValue, and rotation[0] is not guaranteed to be the best arm on every
    // staff — a club can carry its best value in the second slot. What has to
    // hold is that the three go round in a fixed order for ever, which is what
    // a rotation IS.
    let log: RestLog = {};
    const order: number[] = [];
    for (let day = 0; day < 9; day++) {
      const at = pickStarter(ALB, log, day);
      order.push(at);
      log = recordStart(log, 'ALB', ALB.rotation[at]!.name, day);
    }
    const cycle = order.slice(0, 3);
    expect(new Set(cycle).size).toBe(3);
    expect(order).toEqual([...cycle, ...cycle, ...cycle]);
    // ...and the first man out is the best arm on the staff.
    const best = ALB.rotation.reduce((a, b) => (armValue(b) > armValue(a) ? b : a));
    expect(ALB.rotation[cycle[0]!]!.name).toBe(best.name);
  });

  it('turns the whole staff over when it is used every day', () => {
    // Fourteen straight days, the computer choosing each time. Every arm has
    // to take the ball, or the rotation is a rotation in name only.
    let log: RestLog = {};
    const used = new Set<string>();
    for (let day = 0; day < 14; day++) {
      const at = pickStarter(ALB, log, day);
      const arm = ALB.rotation[at]!;
      used.add(arm.name);
      log = recordStart(log, 'ALB', arm.name, day);
    }
    expect(used.size).toBe(3);
  });

  it('never starts a man on zero rest while somebody else is available', () => {
    let log: RestLog = {};
    for (let day = 0; day < 14; day++) {
      const at = pickStarter(ALB, log, day);
      const arm = ALB.rotation[at]!;
      expect(freshness(log, 'ALB', arm.name, day), `day ${day} ${arm.name}`).toBeGreaterThan(0);
      log = recordStart(log, 'ALB', arm.name, day);
    }
  });
});

describe('the computer picks a reliever', () => {
  const pen = ALB.bullpen;

  it('sends its best arm late in a close game', () => {
    const best = pen.reduce((a, b, i) => (armValue(b) > armValue(pen[a]!) ? i : a), 0);
    expect(pickReliever(pen, { inning: 8, deficit: 1 })).toBe(best);
    expect(pickReliever(pen, { inning: 9, deficit: -2 })).toBe(best);
  });

  it('sends the longest arm early, or in a blowout', () => {
    const longest = pen.reduce((a, b, i) => ((b.stamina ?? 1) > (pen[a]!.stamina ?? 1) ? i : a), 0);
    expect(pickReliever(pen, { inning: 3, deficit: 0 })).toBe(longest);
    expect(pickReliever(pen, { inning: 8, deficit: 9 })).toBe(longest);
  });

  it('answers 0 for an empty pen rather than throwing', () => {
    expect(pickReliever([], { inning: 9, deficit: 0 })).toBe(0);
  });
});

describe('the pen is a list you pick from, not a queue', () => {
  it('brings in the arm you named and leaves the others', () => {
    const s = newStaff(ALB.rotation[0]!, ALB.bullpen);
    const picked = bringInRelief(s, 2);
    expect(picked.current.pitcher.name).toBe(ALB.bullpen[2]!.name);
    expect(picked.bullpen.map((a) => a.name)).toEqual([ALB.bullpen[0]!.name, ALB.bullpen[1]!.name]);
    expect(picked.used).toHaveLength(1);
  });

  it('falls back to the top of the list for an index that is not there', () => {
    const s = newStaff(ALB.rotation[0]!, ALB.bullpen);
    expect(bringInRelief(s, 99).current.pitcher.name).toBe(ALB.bullpen[0]!.name);
    expect(bringInRelief(s, -1).current.pitcher.name).toBe(ALB.bullpen[0]!.name);
  });

  it('can empty the whole pen without anyone coming back', () => {
    let s = newStaff(ALB.rotation[0]!, ALB.bullpen);
    const seen = new Set<string>();
    for (let i = 0; i < 3; i++) {
      s = bringInRelief(s, 0);
      seen.add(s.current.pitcher.name);
    }
    expect(seen.size).toBe(3);
    expect(s.bullpen).toHaveLength(0);
    // One more is a no-op, not a crash — a manager out of arms leaves him in.
    const stuck = bringInRelief(s, 0);
    expect(stuck.current.pitcher.name).toBe(s.current.pitcher.name);
  });

  it('goToBullpen passes the index through the game state', () => {
    const g = newGame(ALB, club('DET'), 9);
    // Top of the first: Albany is in the field, so it is Albany's pen.
    const after = goToBullpen(g, 2);
    expect(fieldingStaff(after).current.pitcher.name).toBe(ALB.bullpen[2]!.name);
  });
});

describe('rest reaches the ball game', () => {
  it('newStaff starts the man it was handed, not the ace', () => {
    const s = newStaff(ALB.rotation[2]!, ALB.bullpen);
    expect(s.current.pitcher.name).toBe(ALB.rotation[2]!.name);
  });

  it('a short-rest starter tires sooner than the same man rested', () => {
    const arm = ALB.rotation[0]!;
    const whole = newStaff(arm, ALB.bullpen, restedStamina(arm, 1));
    const short = newStaff(arm, ALB.bullpen, restedStamina(arm, 0));
    const throwN = (s: typeof whole, n: number) => {
      let x = s;
      for (let i = 0; i < n; i++) x = recordPitch(x);
      return x;
    };
    const at = 60;
    expect(fatigue(throwN(short, at))).toBeGreaterThan(fatigue(throwN(whole, at)));
  });

  it('...and gets pulled sooner, because the limit moves with his legs', () => {
    const arm = ALB.rotation[0]!;
    const short = newStaff(arm, ALB.bullpen, restedStamina(arm, 0));
    const whole = newStaff(arm, ALB.bullpen, restedStamina(arm, 1));
    const at = Math.ceil(GASSED_AT * restedStamina(arm, 0)) + 1;
    const worked = (s: typeof whole) => ({ ...s, current: { ...s.current, pitches: at } });
    expect(shouldRelieve(worked(short), { inning: 3, deficit: 0 })).toBe(true);
    expect(shouldRelieve(worked(whole), { inning: 3, deficit: 0 })).toBe(false);
  });

  it('a tired arm is the same arm — the Team is never edited', () => {
    const arm = ALB.rotation[0]!;
    const before = arm.stamina;
    newStaff(arm, ALB.bullpen, restedStamina(arm, 0));
    expect(arm.stamina).toBe(before);
    expect(club('ALB').rotation[0]!.stamina).toBe(before);
  });

  it('a short-rest starter is out of the game much sooner', () => {
    // The end-to-end proof that rest COSTS something. Same club, same seeds,
    // same opponent — the only difference is the legs the starter takes out.
    //
    // ⚠️ IT ASSERTS THE STARTER'S OWN WORKLOAD, NOT THE TEAM'S RUNS ALLOWED,
    // and the first version of this test asserted runs and FAILED — the spent
    // starter's club gave up slightly FEWER. That is not noise and it is worth
    // knowing: a starter who gets yanked in the fourth hands the game to three
    // relievers who are fresh, and the pen carries no cross-game cost at all.
    // So "get to the pen early" is close to free, and the thing rest actually
    // buys or spends is INNINGS FROM YOUR STARTER. Measure that.
    //
    // (The real missing constraint is rest on the PEN. Noted, not built — see
    // the note in bringInRelief().)
    const foe = club('TOR');
    let restedWork = 0;
    let spentWork = 0;
    for (let seed = 0; seed < 200; seed++) {
      const a = simulateGame(seed, 9, ALB, foe, { home: { index: 0, stamina: ALB.rotation[0]!.stamina } });
      const b = simulateGame(seed, 9, ALB, foe, {
        home: { index: 0, stamina: restedStamina(ALB.rotation[0]!, 0) },
      });
      restedWork += openedBy(a.game.homeState.staff).battersFaced;
      spentWork += openedBy(b.game.homeState.staff).battersFaced;
    }
    // Not a squeak — a man on nothing should be gone by the middle innings.
    expect(spentWork).toBeLessThan(restedWork * 0.75);
  });

  it('...and riding one man all season grinds him down game by game', () => {
    // The compounding stock, end to end. Start him every day and his legs go
    // 1.00, 0.67, 0.33, 0.00 and stay on the floor — which is the whole reason
    // rest is a stock and not a timer. See the header in rotation.ts.
    let log: RestLog = {};
    const legs: number[] = [];
    const ace = ALB.rotation[0]!;
    for (let day = 0; day < 5; day++) {
      legs.push(freshness(log, 'ALB', ace.name, day));
      log = recordStart(log, 'ALB', ace.name, day);
    }
    expect(legs[0]).toBe(1);
    expect(legs[1]).toBeCloseTo(2 / 3, 6);
    expect(legs[2]).toBeCloseTo(1 / 3, 6);
    expect(legs[3]).toBeCloseTo(0, 6);
    expect(legs[4]).toBe(0);
    // ...while turning the rotation over never costs anybody anything.
    let turning: RestLog = {};
    for (let day = 0; day < 12; day++) {
      const at = pickStarter(ALB, turning, day);
      expect(freshness(turning, 'ALB', ALB.rotation[at]!.name, day), `day ${day}`).toBe(1);
      turning = recordStart(turning, 'ALB', ALB.rotation[at]!.name, day);
    }
  });
});

describe('a season turns its rotation over', () => {
  /** Play a whole season with nobody human in it. */
  const playAll = (you: string, seed: number) => {
    let s = newSeason(you, seed);
    while (!seasonOver(s)) s = playDay(s);
    return s;
  };

  it('uses all three starters, for every club in the league', () => {
    const s = playAll('---', 4242);
    const byClub: Record<string, Set<string>> = {};
    for (const r of s.results) {
      if (r.hs) (byClub[r.home] ??= new Set()).add(r.hs);
      if (r.as) (byClub[r.away] ??= new Set()).add(r.as);
    }
    for (const t of LEAGUE) {
      expect(byClub[t.abbr]?.size, `${t.abbr} distinct starters`).toBe(3);
    }
  });

  it('records every arm that worked, starters and pen alike', () => {
    const s = playAll('---', 99);
    for (const t of LEAGUE) {
      const logged = Object.keys(s.rest?.[t.abbr] ?? {});
      const staff = [...t.rotation, ...t.bullpen].map((a) => a.name);
      // All three starters throw over fourteen games, and the pen is worked.
      expect(logged.length, t.abbr).toBeGreaterThanOrEqual(3);
      expect(logged.length, t.abbr).toBeLessThanOrEqual(6);
      for (const n of t.rotation.map((a) => a.name)) expect(logged, t.abbr).toContain(n);
      // Nothing in the ledger is a man who is not on the staff.
      for (const n of logged) expect(staff, t.abbr).toContain(n);
    }
  });

  it('never starts anybody on zero rest', () => {
    const s = playAll('---', 7);
    // Rebuild the ledger from the results and check each start against it.
    const seen: Record<string, Record<string, number>> = {};
    const byDay = [...s.results].sort((a, b) => a.day - b.day);
    for (const r of byDay) {
      for (const [abbr, name] of [[r.home, r.hs], [r.away, r.as]] as const) {
        if (!name) continue;
        const last = seen[abbr]?.[name];
        if (last !== undefined) expect(r.day, `${name} on day ${r.day}`).toBeGreaterThan(last);
        (seen[abbr] ??= {})[name] = r.day;
      }
    }
  });

  it('shows you the same starter the game then sends out', () => {
    // The pre-game card names an arm; the game has to agree. They are two
    // calls and a disagreement would be invisible until somebody read both.
    let s = newSeason('ALB', 31337);
    for (let i = 0; i < 6 && !seasonOver(s); i++) {
      const m = yourGame(s);
      if (!m) { s = playDay(s); continue; }
      const them = m.home === 'ALB' ? m.away : m.home;
      const shown = starterFor(s, them);
      const g = newGame(teamOf(s, m.home), teamOf(s, m.away), 9, {
        [m.home === them ? 'home' : 'away']: { index: shown.index, stamina: shown.stamina },
      });
      const staff = them === m.home ? g.homeState.staff : g.awayState.staff;
      expect(staff.current.pitcher.name).toBe(shown.name);
      const mine = armFor(s, 'ALB', 0);
      s = playDay(s, {
        ...m, day: s.day, hr: 3, ar: 2, hs: m.home === 'ALB' ? mine.name : shown.name,
        as: m.away === 'ALB' ? mine.name : shown.name,
      });
    }
  });

  it('rests YOUR arm when you keep starting him', () => {
    // Ride one man every game and the ledger has to say so.
    let s = newSeason('ALB', 5150);
    const ace = teamOf(s, 'ALB').rotation[0]!;
    const rests: number[] = [];
    for (let i = 0; i < 4; i++) {
      const m = yourGame(s)!;
      rests.push(restOf(s, 'ALB', ace.name));
      s = playDay(s, {
        ...m, day: s.day, hr: 1, ar: 0,
        hs: m.home === 'ALB' ? ace.name : undefined,
        as: m.away === 'ALB' ? ace.name : undefined,
      });
    }
    expect(rests[0]).toBe(1);
    // Every game after the first finds him short.
    for (const r of rests.slice(1)) expect(r).toBeLessThan(1);
  });

  it('a season save carries the ledger, and openedBy names the starter', () => {
    const s = playAll('---', 616);
    const r = s.results.find((x) => x.hs)!;
    expect(typeof r.hs).toBe('string');
    // openedBy is what main.ts reads to write that field.
    const g = simulateGame(1, 9, ALB, club('DET'));
    expect(openedBy(g.game.homeState.staff).pitcher.name).toBe(ALB.rotation[0]!.name);
  });
});

/**
 * PEN REST. The gap the rotation work left open: three whole relievers in every
 * game of the season, however hard they were worked yesterday, which made
 * "get to the pen early" close to free.
 */
describe('the pen gets tired too', () => {
  const pen = ALB.bullpen;
  const long = pen[0]!;

  it('charges an outing for the appearance AND the work', () => {
    // A man who never threw a pitch still got loose and came in.
    expect(reliefCost(long, 0)).toBeCloseTo(APPEARANCE_COST, 10);
    // ...and it scales with what he actually threw, against HIS own limit.
    const full = GASSED_AT * long.stamina!;
    expect(reliefCost(long, full)).toBeCloseTo(APPEARANCE_COST + 1, 6);
    expect(reliefCost(long, 20)).toBeGreaterThan(reliefCost(long, 10));
  });

  it('a short arm is not punished for being short', () => {
    // Twenty pitches out of a closer is a bigger share of him than out of a
    // long man, and the cost says so — that is the point of "his own limit".
    const closer = pen[2]!;
    expect(closer.stamina!).toBeLessThan(long.stamina!);
    expect(reliefCost(closer, 20)).toBeGreaterThan(reliefCost(long, 20));
  });

  it('recovers on a slower clock than a starter', () => {
    expect(RELIEF_REST_TO_FULL).toBeGreaterThan(REST_TO_FULL);
    const log = recordRelief({}, 'ALB', long, 25, 0);
    // Same ledger entry read two ways: the pen's clock is behind the rotation's.
    expect(penFreshness(log, 'ALB', long.name, 1))
      .toBeLessThan(freshness(log, 'ALB', long.name, 1));
  });

  it('is whole again after a night off', () => {
    const log = recordRelief({}, 'ALB', long, 22, 0);
    expect(penFreshness(log, 'ALB', long.name, 0)).toBeLessThan(1);
    expect(penFreshness(log, 'ALB', long.name, 2)).toBe(1);
  });

  it('grinds down over consecutive nights', () => {
    // ⚠️ THIRTY-TWO PITCHES, WHICH IS THE MEASURED MEAN RELIEF OUTING in this
    // engine — not a round number. The whole rest model balances on the cost
    // of a TYPICAL outing against the daily refill, so a test written against
    // an atypical one measures a case the season never produces.
    let log: RestLog = {};
    const nights: number[] = [];
    for (let day = 0; day < 6; day++) {
      nights.push(penFreshness(log, 'ALB', long.name, day));
      log = recordRelief(log, 'ALB', long, 32, day);
    }
    expect(nights[0]).toBe(1);
    for (let i = 1; i < nights.length; i++) {
      expect(nights[i], `night ${i}`).toBeLessThan(nights[i - 1]!);
    }
    // Six straight nights and there is not half of him left.
    expect(nights[5]).toBeLessThan(0.5);
  });

  it('...but never at all if you use him every other night', () => {
    let log: RestLog = {};
    for (let day = 0; day < 12; day += 2) {
      expect(penFreshness(log, 'ALB', long.name, day), `day ${day}`).toBe(1);
      log = recordRelief(log, 'ALB', long, 25, day);
    }
  });

  it('penLegs answers a whole man for anyone who has not worked', () => {
    const legs = penLegs(pen, {}, 'ALB', 3);
    for (const a of pen) expect(legs[a.name]).toBeCloseTo(a.stamina!, 10);
  });

  it('...and short legs for one who has', () => {
    let log: RestLog = {};
    for (let d = 0; d < 5; d++) log = recordRelief(log, 'ALB', long, 32, d);
    const legs = penLegs(pen, log, 'ALB', 5);
    expect(legs[long.name]!).toBeLessThan(long.stamina! * 0.8);
    // The other two never pitched and are untouched.
    expect(legs[pen[1]!.name]!).toBeCloseTo(pen[1]!.stamina!, 10);
  });
});

describe('tired legs reach the mound', () => {
  const pen = ALB.bullpen;

  it('a reliever comes in on the legs the season left him', () => {
    const legs = { [pen[0]!.name]: 0.3 };
    const staff = newStaff(ALB.rotation[0]!, pen, undefined, legs);
    const after = bringInRelief(staff, 0);
    expect(after.current.stamina).toBe(0.3);
    // ...and he is gassed far sooner than his card says.
    const worked = { ...after, current: { ...after.current, pitches: 40 } };
    expect(fatigue(worked)).toBe(1);
  });

  it('the legs map survives going to the pen twice', () => {
    const legs = { [pen[0]!.name]: 0.3, [pen[1]!.name]: 0.4, [pen[2]!.name]: 0.5 };
    const staff = newStaff(ALB.rotation[0]!, pen, undefined, legs);
    const one = bringInRelief(staff, 1);
    expect(one.current.stamina).toBe(0.4);
    // The list shrank; the map is keyed by name so it cannot slip.
    const two = bringInRelief(one, 1);
    expect(two.current.stamina).toBe(0.5);
  });

  it('the computer will not send a gassed closer out over a fresh setup man', () => {
    // Late and close is the closer's situation — unless there is nothing left
    // of him, which is exactly what pen rest is for.
    const late = { inning: 9, deficit: 0 };
    const whole = pickReliever(pen, late);
    const gassed = { ...Object.fromEntries(pen.map((a) => [a.name, a.stamina ?? 1])) };
    gassed[pen[whole]!.name] = (pen[whole]!.stamina ?? 1) * 0.15;
    expect(pickReliever(pen, late, gassed)).not.toBe(whole);
  });

  it('a whole man with no entry in the map is treated as whole', () => {
    // Exhibitions hand over nothing at all, and that must not read as gassed.
    expect(pickReliever(pen, { inning: 9, deficit: 0 }, {}))
      .toBe(pickReliever(pen, { inning: 9, deficit: 0 }));
  });
});

describe('a season rests its pen', () => {
  it('charges relief work from every game on the card', () => {
    let s = newSeason('---', 4242);
    for (let i = 0; i < 6; i++) s = playDay(s);
    // Somebody, somewhere, came out of a pen and is carrying it.
    const penNames = new Set(LEAGUE.flatMap((t) => t.bullpen.map((a) => a.name)));
    const logged = Object.entries(s.rest ?? {}).flatMap(([, arms]) => Object.keys(arms));
    expect(logged.some((n) => penNames.has(n))).toBe(true);
  });

  it('writes the pen work onto the result, so the ledger can be rebuilt', () => {
    let s = newSeason('---', 77);
    s = playDay(s);
    const withWork = s.results.filter((r) => (r.hb?.length ?? 0) + (r.ab?.length ?? 0) > 0);
    expect(withWork.length).toBeGreaterThan(0);
    for (const r of withWork) {
      for (const w of [...(r.hb ?? []), ...(r.ab ?? [])]) {
        expect(typeof w.n).toBe('string');
        expect(w.p).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('never charges a starter as a reliever', () => {
    let s = newSeason('---', 909);
    for (let i = 0; i < 5; i++) s = playDay(s);
    for (const r of s.results) {
      for (const [abbr, work] of [[r.home, r.hb], [r.away, r.ab]] as const) {
        const starters = teamOf(s, abbr).rotation.map((a) => a.name);
        for (const w of work ?? []) expect(starters, `${abbr} ${w.n}`).not.toContain(w.n);
      }
    }
  });

  it('a rested pen and a worked pen are not the same pen', () => {
    // End to end: play a week, then check that at least one club's pen is
    // measurably short. If nothing is ever tired the ledger is decorative.
    let s = newSeason('---', 31337);
    for (let i = 0; i < 7; i++) s = playDay(s);
    let tired = 0;
    for (const t of LEAGUE) {
      for (const a of t.bullpen) {
        if (penRestOf(s, t.abbr, a.name) < 0.9) tired++;
      }
    }
    expect(tired).toBeGreaterThan(0);
  });
});
