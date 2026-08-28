import { describe, it, expect } from 'vitest';
import { simHalfInning, simOpponent, OPPONENT_NAME } from '../opponent.ts';
import { makeRng } from '../rng.ts';
import { newMatch, opponentRuns, playerWon, recordAtBat } from '../inning.ts';
import { LEAGUE_ORDER } from '../run.ts';

const mean = (league: 'holdouts' | 'splice' | 'foundry', n = 4000) => {
  const rng = makeRng(13);
  let total = 0;
  for (let i = 0; i < n; i++) total += simHalfInning(league, rng);
  return total / n;
};

describe('the opposing offence', () => {
  it('is scoreless more often than not, like real baseball', () => {
    const rng = makeRng(5);
    let zeroes = 0;
    for (let i = 0; i < 2000; i++) if (simHalfInning('holdouts', rng) === 0) zeroes++;
    expect(zeroes / 2000).toBeGreaterThan(0.5);
  });

  it('gets harder up the league ladder', () => {
    expect(mean('holdouts')).toBeLessThan(mean('splice'));
    expect(mean('splice')).toBeLessThan(mean('foundry'));
  });

  it('stays in a plausible range rather than football scores', () => {
    expect(mean('holdouts')).toBeGreaterThan(0.2);
    expect(mean('foundry')).toBeLessThan(2);
  });

  it('gives every league an opponent name', () => {
    for (const id of LEAGUE_ORDER) expect(OPPONENT_NAME(id)).toBeTruthy();
  });

  it('replays identically from the same seed', () => {
    const go = () => simOpponent('splice', 9, makeRng(808));
    expect(go()).toEqual(go());
  });

  it('returns one entry per inning', () => {
    expect(simOpponent('foundry', 3, makeRng(1))).toHaveLength(3);
  });
});

describe('the scoreboard', () => {
  it('defaults to a shutout when no opponent is supplied', () => {
    expect(opponentRuns(newMatch(1))).toBe(0);
  });

  it('needs more runs than them, not merely some', () => {
    const tied = { ...newMatch(1, [2]), runs: 2 };
    const ahead = { ...newMatch(1, [2]), runs: 3 };
    expect(playerWon(tied)).toBe(false);
    expect(playerWon(ahead)).toBe(true);
  });

  it('posts your half to the line score when the inning closes', () => {
    let m = newMatch(2, [1, 0]);
    m = recordAtBat(m, { kind: 'in_play', hit: hr() });
    expect(m.byInning).toEqual([]); // still batting

    m = recordAtBat(m, K);
    m = recordAtBat(m, K);
    m = recordAtBat(m, K);
    expect(m.byInning).toEqual([1]); // one run, inning in the books
    expect(m.inning).toBe(2);
  });
});

const K = { kind: 'strikeout' } as const;
const hr = () => ({
  outcome: 'home_run' as const,
  timing: 'perfect' as const,
  pitchType: 'fastball' as const,
  isOut: false,
  isHit: true,
  exitVelocity: 110,
  launchAngle: 30,
  direction: 0,
  clutchApplied: false,
  platoon: 1,
  stance: 'normal' as const,
});
