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
  POSITION_DIFFICULTY,
  type Position,
} from '../defense.ts';
import {
  aiShouldSend,
  chanceFor,
  sendRunner,
  stealOpportunity,
  SEND_THRESHOLD,
} from '../running.ts';
import { HOME, AWAY } from '../teams.ts';
import { newGame, recordPlay, type GameState } from '../game.ts';
import { makeRng } from '../../core/rng.ts';
import type { HitResult } from '../../core/hit.ts';
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
