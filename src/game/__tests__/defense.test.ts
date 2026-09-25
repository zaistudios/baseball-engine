/**
 * Positional defence and the running game.
 *
 * The two claims worth holding: WHERE a ball is hit changes what happens to
 * it, and a caught stealing behaves exactly like any other out.
 */

import { describe, expect, it } from 'vitest';
import {
  assignPositions,
  catcherArm,
  fielderFor,
  fieldBall,
  gloveOf,
  groundRace,
  airRace,
  pivotReadyMs,
  POSITION_DIFFICULTY,
  type Position,
} from '../defense.ts';
import { withPlacement, type Placement } from '../placement.ts';
import type { Bases } from '../../core/inning.ts';
import {
  aiShouldSend,
  chanceFor,
  sendRunner,
  stealOpportunity,
  SEND_THRESHOLD,
} from '../running.ts';
import { HOME, AWAY } from '../teams.ts';
import { newGame, recordPlay, currentPitcher, fieldingSide, battingSide, fieldingStaff, type GameState } from '../game.ts';
import { playAiAtBat, autoCaller } from '../sim.ts';
import { newRead } from '../ai.ts';
import { fatigue } from '../bullpen.ts';
import { makeRng } from '../../core/rng.ts';
import type { HitResult } from '../../core/hit.ts';
import { runToFirstMs } from '../plot.ts';
import type { Player } from '../../core/roster.ts';

const hit = (over: Partial<HitResult> = {}): HitResult => ({
  outcome: 'ground_out',
  timing: 'good',
  pitchType: 'fastball',
  isOut: true,
  isHit: false,
  platoon: 1,
  stance: 'normal',
  exitVelocity: 85,
  launchAngle: -2,
  direction: 0,
  clutchApplied: false,
  ...over,
});

const alignment = assignPositions(HOME.lineup);

describe('the alignment', () => {
  it('fills eight positions plus a DH from nine batters', () => {
    const filled = (['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'] as Position[]).filter(
      (p) => alignment[p] !== null,
    );
    expect(filled).toHaveLength(9);
    // The pitcher is NOT in the batting order — this is a DH league.
    expect(alignment.P).toBeNull();
  });

  it('uses each player exactly once', () => {
    const names = (['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'] as Position[])
      .map((p) => alignment[p]!.name);
    expect(new Set(names).size).toBe(9);
  });

  it('puts the best glove at the hardest position', () => {
    const ss = gloveOf(alignment.SS!);
    const first = gloveOf(alignment['1B']!);
    expect(ss).toBeGreaterThan(first);
  });

  it('is deterministic', () => {
    expect(assignPositions(HOME.lineup).SS!.id).toBe(assignPositions(HOME.lineup).SS!.id);
  });

  it('rates a fast machine above a slow augmented slugger', () => {
    const fast = HOME.lineup.concat(AWAY.lineup).find((p) => p.build === 'machine' && p.speed > 1.2);
    const slow = HOME.lineup.concat(AWAY.lineup).find((p) => p.build === 'augmented' && p.speed < 0.8);
    if (fast && slow) expect(gloveOf(fast)).toBeGreaterThan(gloveOf(slow));
  });

  /**
   * ⚠️ THE PROMISE `glove?` MAKES: adding the field changed nobody. Nothing in
   * the shipped league authors one, so every man still gets the number the old
   * derivation gave him — which is what makes this an additive stat rather than
   * a re-rating of four hundred players and every league on somebody's disk.
   */
  it('leaves every authored man exactly where he was', () => {
    const derived = (p: Player): number =>
      (0.7 + p.speed * 0.3) * (p.build === 'machine' ? 1.12 : p.build === 'augmented' ? 0.92 : 1);
    for (const p of HOME.lineup.concat(AWAY.lineup)) {
      expect(p.glove, `${p.name} authors a glove`).toBeUndefined();
      expect(gloveOf(p), p.name).toBeCloseTo(derived(p), 10);
    }
  });

  /**
   * ⚠️ AND THE POINT OF HAVING IT. A glove is a rating, not a look: it has to
   * reach the sim, and the visible end of that is who stands at shortstop.
   * Handing the worst pair of legs in the order the best glove has to move him
   * there, or the field is decorative.
   */
  it('puts an authored glove at short, over the legs that used to decide it', () => {
    const plain = assignPositions(HOME.lineup);
    const slowest = [...HOME.lineup].sort((a, b) => a.speed - b.speed)[0]!;
    expect(plain.SS!.id, 'the slowest man already plays short').not.toBe(slowest.id);

    const withGlove = HOME.lineup.map((p) => (p.id === slowest.id ? { ...p, glove: 3 } : p));
    expect(assignPositions(withGlove).SS!.id).toBe(slowest.id);
    expect(gloveOf({ ...slowest, glove: 3 })).toBe(3);
  });
});

describe('who the ball goes to', () => {
  it('a pulled ground ball goes to the left side', () => {
    const pos = fielderFor(hit({ direction: -35, launchAngle: -3, exitVelocity: 80 }));
    expect(['3B', 'SS', 'LF']).toContain(pos);
  });

  it('an opposite-field ground ball goes to the right side', () => {
    const pos = fielderFor(hit({ direction: 35, launchAngle: -3, exitVelocity: 80 }));
    expect(['1B', '2B', 'RF']).toContain(pos);
  });

  it('a deep fly goes to an outfielder', () => {
    const pos = fielderFor(
      hit({ outcome: 'line_out', direction: 0, launchAngle: 28, exitVelocity: 100 }),
    );
    expect(['LF', 'CF', 'RF']).toContain(pos);
  });

  it('a lazy popup stays in the infield', () => {
    const pos = fielderFor(
      hit({ outcome: 'popup', direction: 5, launchAngle: 65, exitVelocity: 55 }),
    );
    expect(['P', 'C', '1B', '2B', '3B', 'SS']).toContain(pos);
  });
});

describe('the position changes the play', () => {
  const rate = (a: ReturnType<typeof assignPositions>, direction: number) => {
    let errors = 0;
    const N = 3000;
    for (let i = 0; i < N; i++) {
      const r = fieldBall(
        hit({ direction, exitVelocity: 82, launchAngle: -2 }),
        a,
        { batterSpeed: 1, forceAtFirst: false, outs: 0 },
        makeRng(i),
      );
      if (r.error) errors++;
    }
    return errors / N;
  };

  it('a ball at the shortstop is booted more often than one at first', () => {
    // Same alignment, different place on the field.
    const toShort = rate(alignment, -18);
    const toFirst = rate(alignment, 38);
    expect(toShort).toBeGreaterThan(toFirst);
  });

  it('the hardest positions carry the highest difficulty', () => {
    expect(POSITION_DIFFICULTY.SS).toBeGreaterThan(POSITION_DIFFICULTY['1B']);
    expect(POSITION_DIFFICULTY['3B']).toBeGreaterThan(POSITION_DIFFICULTY.LF);
  });

  it('names who handled it', () => {
    const r = fieldBall(
      hit({ direction: -20 }),
      alignment,
      { batterSpeed: 1, forceAtFirst: false, outs: 0 },
      makeRng(4),
    );
    expect(r.by).toBeTruthy();
    expect(r.fielder).not.toBeNull();
  });

  it('a strikeout is never a fielding play', () => {
    const r = fieldBall(
      hit({ outcome: 'strikeout', isOut: true }),
      alignment,
      { batterSpeed: 1, forceAtFirst: true, outs: 0 },
      makeRng(1),
    );
    expect(r.error).toBe(false);
    expect(r.doublePlay).toBe(false);
  });
});

// ------------------------------------------------------------ the bases

const onFirst = (g: GameState): GameState =>
  recordPlay(g, { kind: 'walk' }).game;

describe('who can run', () => {
  it('nobody, with the bases empty', () => {
    expect(stealOpportunity(newGame(HOME, AWAY, 9))).toBeNull();
  });

  it('the man on first, into an empty second', () => {
    const g = onFirst(newGame(HOME, AWAY, 9));
    const op = stealOpportunity(g);
    expect(op?.from).toBe(0);
    expect(op?.to).toBe(1);
  });

  it('nobody, when the bag ahead is occupied', () => {
    let g = onFirst(newGame(HOME, AWAY, 9));
    g = onFirst(g); // first and second
    const op = stealOpportunity(g);
    // The LEAD runner is on second and third is open, so he is the candidate.
    expect(op?.from).toBe(1);
  });

  it('the lead runner is the one who goes', () => {
    let g = onFirst(newGame(HOME, AWAY, 9));
    g = onFirst(g);
    expect(stealOpportunity(g)?.to).toBe(2);
  });
});

describe('sending him', () => {
  it('safe moves him up and costs nothing', () => {
    const g = onFirst(newGame(HOME, AWAY, 9));
    // Find a seed where he makes it.
    for (let i = 0; i < 200; i++) {
      const out = sendRunner(g, alignment, makeRng(i));
      if (out?.safe) {
        expect(out.game.bases[1]).not.toBeNull();
        expect(out.game.bases[0]).toBeNull();
        expect(out.game.outs).toBe(0);
        return;
      }
    }
    throw new Error('never safe in 200 seeds');
  });

  it('caught erases him AND costs an out', () => {
    const g = onFirst(newGame(HOME, AWAY, 9));
    for (let i = 0; i < 400; i++) {
      const out = sendRunner(g, alignment, makeRng(i));
      if (out && !out.safe) {
        expect(out.game.bases[0]).toBeNull();
        expect(out.game.bases[1]).toBeNull();
        expect(out.game.outs).toBe(1);
        return;
      }
    }
    throw new Error('never caught in 400 seeds');
  });

  it('a caught stealing for the third out closes the half', () => {
    let g = onFirst(newGame(HOME, AWAY, 9));
    g = recordPlay(g, { kind: 'strikeout' }).game;
    g = recordPlay(g, { kind: 'strikeout' }).game;
    expect(g.outs).toBe(2);
    for (let i = 0; i < 400; i++) {
      const out = sendRunner(g, alignment, makeRng(i));
      if (out && !out.safe) {
        expect(out.game.half).toBe('bottom');
        expect(out.game.outs).toBe(0);
        expect(out.game.awayState.byInning).toEqual([0]);
        return;
      }
    }
    throw new Error('never caught in 400 seeds');
  });

  it('returns null with nobody on', () => {
    expect(sendRunner(newGame(HOME, AWAY, 9), alignment, makeRng(1))).toBeNull();
  });
});

describe('the catcher matters', () => {
  it('a better arm throws more of them out', () => {
    const g = onFirst(newGame(HOME, AWAY, 9));
    const op = stealOpportunity(g)!;
    const weak = { ...alignment, C: { ...alignment.C!, speed: 0.5, build: 'augmented' } as Player };
    const strong = { ...alignment, C: { ...alignment.C!, speed: 1.5, build: 'machine' } as Player };
    expect(catcherArm(strong)).toBeGreaterThan(catcherArm(weak));
    expect(chanceFor(g, op, strong)).toBeLessThan(chanceFor(g, op, weak));
  });
});

describe('the computer deciding to run', () => {
  it('will not send a slow man', () => {
    const g = onFirst(newGame(HOME, AWAY, 9));
    const slow: GameState = { ...g, bases: [{ name: 'Boxcar', speed: 0.5 }, null, null] };
    expect(aiShouldSend(slow, alignment)).toBe(false);
  });

  it('will send a burner', () => {
    const g = onFirst(newGame(HOME, AWAY, 9));
    const fast: GameState = { ...g, bases: [{ name: 'Wheels', speed: 1.6 }, null, null] };
    expect(aiShouldSend(fast, alignment)).toBe(true);
  });

  it('is more reluctant with two outs', () => {
    const g = onFirst(newGame(HOME, AWAY, 9));
    // A runner right at the line: fine with none out, not worth it with two.
    // Speed derived from the ACTUAL catcher behind the plate — assuming an
    // average 1.0 arm here put the runner under the bar and failed the test.
    const marginal = SEND_THRESHOLD + 0.02;
    const speed = (marginal * catcherArm(alignment)) / 0.72;
    const base: GameState = { ...g, bases: [{ name: 'Edge', speed }, null, null] };
    const twoOut: GameState = { ...base, outs: 2 };
    expect(aiShouldSend(base, alignment)).toBe(true);
    expect(aiShouldSend(twoOut, alignment)).toBe(false);
  });

  it('never sends with nobody on', () => {
    expect(aiShouldSend(newGame(HOME, AWAY, 9), alignment)).toBe(false);
  });
});

describe('a fielded grounder is a race (ZAIS-21)', () => {
  const runner = (speed: number) => ({ name: 'R', speed });
  /** A routine two-hopper to short, fielded by him. */
  const toShort = () => {
    const hit = {
      outcome: 'ground_out', isHit: false, isOut: true,
      exitVelocity: 85, launchAngle: 2, direction: -19,
    } as HitResult;
    const p = withPlacement({ kind: 'in_play', hit }).placement!;
    expect(p.cutOff?.fielded).toBe(true);
    expect(p.cutOff?.num).toBe(6);
    return p;
  };
  const race = (o: { batter: number; arm?: number; bases: Bases; outs?: number; p?: Placement }) => {
    const p = o.p ?? toShort();
    return groundRace({
      cut: p.cutOff!, dirDeg: p.dirDeg, arm: o.arm ?? 1, armAt: () => o.arm ?? 1, reachAt: () => o.arm ?? 1,
      batterSpeed: o.batter, bases: o.bases, outs: o.outs ?? 0,
    });
  };

  it('man on first, nobody out: the slow batter is doubled up, the fast one beats the relay', () => {
    const bases: Bases = [runner(1), null, null];
    const slow = race({ batter: 0.7, bases });
    expect(slow.doublePlay).toBe(true);
    expect(slow.forceAt).toBe(2);
    const fast = race({ batter: 1.4, bases });
    expect(fast.doublePlay).toBe(false);
    expect(fast.forceAt).toBe(2); // the lead man is still out: a fielder's choice
    expect(fast.clock.firstMs!).toBeGreaterThanOrEqual(fast.clock.batterMs);
  });

  it('every call is the clocks: an out means the ball got there first', () => {
    const r = race({ batter: 1, bases: [runner(1), null, null] });
    expect(r.clock.leadMs!).toBeLessThan(r.clock.runnerMs!);
    if (r.doublePlay) expect(r.clock.firstMs!).toBeLessThan(r.clock.batterMs);
  });

  it('the ball is not at second until the man covering it is', () => {
    // To short, so the second baseman covers. However quick the throw, the
    // force waits on his feet — the lever that brought double plays down.
    const p = toShort();
    const r = groundRace({
      cut: p.cutOff!, dirDeg: p.dirDeg, arm: 5, armAt: () => 5, reachAt: () => 0.8,
      batterSpeed: 1, bases: [runner(0.5), null, null], outs: 0,
    });
    expect(r.forceAt).toBe(2);
    expect(r.clock.leadMs!).toBe(pivotReadyMs(2, 4, 0.8));
    expect(pivotReadyMs(2, 4, 0.8)).toBeGreaterThan(pivotReadyMs(2, 4, 1.2));
  });

  it('with two out the force ends it and nothing is thrown on to first', () => {
    const r = race({ batter: 0.7, bases: [runner(1), null, null], outs: 2 });
    expect(r.forceAt).toBe(2);
    expect(r.doublePlay).toBe(false);
    expect(r.clock.firstMs).toBeNull();
  });

  it('raising the glove never turns an out into a safe', () => {
    const outsOf = (r: ReturnType<typeof groundRace>) => (r.doublePlay ? 2 : r.beatOut ? 0 : 1);
    const states: Bases[] = [
      [null, null, null],
      [runner(1), null, null],
      [runner(1.3), runner(0.8), null],
      [runner(1), runner(1), runner(1)],
      [null, runner(1), null],
    ];
    let checked = 0;
    for (let dir = -40; dir <= 40; dir += 4) {
      for (const ev of [60, 75, 90, 105]) {
        const hit = { outcome: 'ground_out', isHit: false, isOut: true, exitVelocity: ev, launchAngle: 2, direction: dir } as HitResult;
        const p = withPlacement({ kind: 'in_play', hit }).placement!;
        if (!p.cutOff?.fielded) continue;
        for (const bases of states) {
          for (const batter of [0.7, 1, 1.4]) {
            for (const outs of [0, 1, 2]) {
              let prev = -1;
              for (let arm = 0.5; arm <= 1.6; arm += 0.1) {
                const now = outsOf(race({ batter, arm, bases, outs, p }));
                expect(now).toBeGreaterThanOrEqual(prev);
                prev = now;
                checked++;
              }
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it('fieldBall hands the clock over, and without bases it keeps the dice', () => {
    const p = toShort();
    const hit = { outcome: 'ground_out', isHit: false, isOut: true, exitVelocity: 85, launchAngle: 2, direction: -19 } as HitResult;
    const a = assignPositions(HOME.lineup);
    // A seed whose error die does not fire, so the race is what decides.
    const opts = { batterSpeed: 0.7, forceAtFirst: true, outs: 0, forcedRunners: 1, placement: p };
    const raced = fieldBall(hit, a, { ...opts, bases: [runner(1), null, null] }, makeRng(3));
    expect(raced.error).toBe(false);
    expect(raced.clock).toBeDefined();
    expect(raced.forceAt).toBe(2);
    expect(fieldBall(hit, a, opts, makeRng(3)).clock).toBeUndefined();
  });
});

describe('the throw after a catch is a race (ZAIS-24)', () => {
  const runner = (speed: number) => ({ name: 'R', speed });
  /** Every caught deep fly the placement model will make, to every part of the outfield. */
  const flies = (() => {
    const out: Placement[] = [];
    const hits: HitResult[] = [];
    for (let dir = -40; dir <= 40; dir += 5) {
      for (const ev of [80, 90, 100]) {
        for (const la of [24, 30, 36]) {
          const hit = { outcome: 'line_out', isHit: false, isOut: true, exitVelocity: ev, launchAngle: la, direction: dir } as HitResult;
          const p = withPlacement({ kind: 'in_play', hit });
          if (p.result.kind !== 'in_play' || p.result.hit.outcome !== 'line_out' || !p.placement?.airCatch?.caught) continue;
          out.push(p.placement);
          hits.push(hit);
        }
      }
    }
    return out.map((p, i) => ({ p, hit: hits[i]! }));
  })();
  const tag = (f: (typeof flies)[number], speed: number, arm = 1, outs = 0) =>
    airRace({ hit: f.hit, placement: f.p, bases: [null, null, runner(speed)], outs, arm });

  it('the same fly cuts down a 0.7 runner that a 1.4 runner beats', () => {
    expect(flies.length).toBeGreaterThan(20);
    const split = flies.filter((f) => tag(f, 0.7)!.out && !tag(f, 1.4)!.out);
    expect(split.length).toBeGreaterThan(0);
    // ...and never the other way round.
    expect(flies.filter((f) => !tag(f, 0.7)!.out && tag(f, 1.4)!.out)).toEqual([]);
  });

  it('he leaves at the catch from a standing start, and an out means the ball got there first', () => {
    for (const f of flies) {
      const r = tag(f, 1)!;
      expect(r.clock.at).toBe(4);
      expect(r.clock.runnerMs - r.clock.caughtMs).toBeCloseTo(runToFirstMs(1), 6);
      expect(r.out).toBe(r.clock.throwMs < r.clock.runnerMs);
    }
  });

  it('raising the glove never turns an out into a safe', () => {
    for (const f of flies) {
      for (const speed of [0.7, 1, 1.4]) {
        let wasOut = false;
        for (let arm = 0.5; arm <= 1.6; arm += 0.1) {
          const out = tag(f, speed, arm)!.out;
          if (wasOut) expect(out).toBe(true);
          wasOut = out;
        }
      }
    }
  });

  it('no play without a man on third, a deep fly and an out to spare', () => {
    const f = flies[0]!;
    expect(airRace({ hit: f.hit, placement: f.p, bases: [runner(1), null, null], outs: 0, arm: 1 })).toBeUndefined();
    expect(tag(f, 1, 1, 2)).toBeUndefined();
  });

  it('fieldBall hands tagOut to the book; without bases it keeps the die', () => {
    const f = flies[0]!;
    const a = assignPositions(HOME.lineup);
    const opts = { batterSpeed: 1, forceAtFirst: false, outs: 0, placement: f.p };
    const raced = fieldBall(f.hit, a, { ...opts, bases: [null, null, runner(1)] }, makeRng(3));
    expect(raced.error).toBe(false);
    expect(raced.tagOut).toBe(raced.airClock!.throwMs < raced.airClock!.runnerMs);
    const rolled = fieldBall(f.hit, a, opts, makeRng(3));
    expect(rolled.tagOut).toBeUndefined();
    expect(rolled.airClock).toBeUndefined();
  });
});

/**
 * THE PLAYTEST, TWICE: a man scoring from second on a groundout. A retired
 * batter on a ground ball can only ever bring in the man from third — nobody
 * sends a runner home from second on an infield out. Run over a seeded
 * season of real at-bats so the whole path is in it: placement, the race,
 * the error roll, groundOut()'s sends and the book. ZAIS-21 step 6.
 */
describe('nobody scores from second on a groundout', () => {
  it('holds over a seeded season', () => {
    let groundOuts = 0;
    let withTwo = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const rng = makeRng(seed);
      let g = newGame(seed % 2 ? HOME : AWAY, seed % 2 ? AWAY : HOME, 9);
      const books = { home: newRead(), away: newRead() };
      for (let n = 0; !g.over && n < 200; n++) {
        const caller = autoCaller(currentPitcher(g), books[fieldingSide(g)], rng, fatigue(fieldingStaff(g)));
        const out = playAiAtBat(g, caller, books[battingSide(g)], rng);
        g = out.game;
        const { log, atBat } = out;
        const retired = !log.after.some((b) => b?.name === log.batter.name);
        if (atBat.outcome !== 'ground_out' || atBat.error || !retired) continue;
        groundOuts++;
        if (log.before[1]) withTwo++;
        expect(log.runs, `seed ${seed}`).toBeLessThanOrEqual(log.before[2] ? 1 : 0);
      }
    }
    // It has to have seen the play it is about.
    expect(groundOuts).toBeGreaterThan(1000);
    expect(withTwo).toBeGreaterThan(100);
  });
});
