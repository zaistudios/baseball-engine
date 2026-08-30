/**
 * A CAUGHT FOUL, ALL THE WAY THROUGH — the half core/__tests__/foul.test.ts
 * cannot reach.
 *
 * ⚠️ WHY THIS IS ITS OWN FILE. `foul_out` is produced in core and then has to
 * survive four things that live in game/: applyAtBat(), which THROWS on an
 * outcome it has no case for; the fielding roll, which must not turn two on it;
 * the scorer, which must write a putout; and the play-by-play. A 2%-of-plate-
 * appearances event is not something to confirm by running the game and hoping
 * one turns up — every one of these is forced.
 */
import { describe, expect, it } from 'vitest';
import { newGame, recordPlay, currentBatter, fieldingAlignment } from '../game.ts';
import { fieldBall } from '../defense.ts';
import { withPlacement, scorecard, place } from '../placement.ts';
import { club } from '../teams.ts';
import { makeRng } from '../../core/rng.ts';
import { resolveSwing } from '../../core/hit.ts';
import type { AtBatResult } from '../../core/atBat.ts';
import type { HitResult } from '../../core/hit.ts';

/** The first foul_out the swing engine will give us. */
function aCaughtFoul(): HitResult {
  for (let seed = 1; seed < 20000; seed++) {
    const hit = resolveSwing({ offsetMs: 55, pitchType: 'fastball' }, makeRng(seed));
    if (hit.outcome === 'foul_out') return hit;
  }
  throw new Error('no foul_out in 20000 swings');
}

describe('a caught foul reaches the scoreboard', () => {
  const hit = aCaughtFoul();
  const result: AtBatResult = { kind: 'in_play', hit };

  it('records an out instead of throwing', () => {
    // ⚠️ THE ONE THAT WOULD HAVE CRASHED THE GAME. applyAtBat() ends with
    // `throw new Error('unreachable at-bat outcome')` for anything that is
    // neither an out nor a hit — which `foul` is — so a caught foul carrying
    // the foul outcome would have taken the game down the first time somebody
    // popped one up. That is the whole reason foul_out is its own outcome.
    const g = newGame(club('ALB'), club('DET'));
    const { game, log } = recordPlay(g, result);
    expect(game.outs).toBe(1);
    expect(log.runs).toBe(0);
    expect(game.bases).toEqual([null, null, null]);
  });

  it('leaves the runners exactly where they were', () => {
    // He never left the box, so nobody advances — not even from third.
    const g = newGame(club('ALB'), club('DET'));
    const runner = currentBatter(g);
    const loaded = { ...g, bases: [runner, runner, runner] as typeof g.bases };
    const { game } = recordPlay(loaded, result);
    expect(game.bases.filter(Boolean)).toHaveLength(3);
    expect(game.outs).toBe(1);
  });

  it('is never booted and never turns two', () => {
    // ⚠️ A DOUBLE PLAY ON A FOUL POP WOULD BE NONSENSE, and what stops it is
    // that foul_out is not in BOOTABLE. Rolled across many seeds because both
    // of these are random for the outcomes that DO allow them.
    const g = newGame(club('ALB'), club('DET'));
    for (let seed = 1; seed < 400; seed++) {
      const f = fieldBall(
        hit,
        fieldingAlignment(g),
        { batterSpeed: 1, forceAtFirst: true, outs: 0 },
        makeRng(seed),
      );
      expect(f.error, `seed ${seed}`).toBe(false);
      expect(f.doublePlay, `seed ${seed}`).toBe(false);
    }
  });

  it('is caught by the catcher or a corner, never by an outfielder', () => {
    // Nobody plays a position in foul ground — see foulCatcher() in placement.
    let seen = 0;
    for (let seed = 1; seed < 6000; seed++) {
      const h = resolveSwing({ offsetMs: 55, pitchType: 'fastball' }, makeRng(seed));
      if (h.outcome !== 'foul_out') continue;
      seen++;
      expect([2, 3, 5], `seed ${seed}`).toContain(place(h).fielderNum);
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('is scored as a putout, and says so', () => {
    const placed = withPlacement(result);
    const num = placed.placement!.fielderNum;
    expect(placed.text).toMatch(/fouled out to/);
    // ⚠️ IT FELL THROUGH TO AN EMPTY STRING ON THE FIRST PASS, which reads as
    // "nobody was retired" on a play where a man is out.
    expect(scorecard('foul_out', num)).toBe(`P${num}`);
  });

  it('an ordinary foul is scored as nothing at all', () => {
    // The at-bat is still going; there is nothing to write down yet.
    expect(scorecard('foul', 2)).toBe('');
  });

  it('puts the ball in foul ground, on the side he hit it', () => {
    const p = withPlacement(result).placement!;
    expect(Math.abs(p.dirDeg)).toBeGreaterThan(45);
    expect(p.zone).toBe('foul-ground');
    // The gap is meaningless out there and must not leak into the stretch.
    expect(p.inTheGap).toBe(false);
  });

  it('describes an uncaught foul by where it went', () => {
    for (let seed = 1; seed < 20000; seed++) {
      const h = resolveSwing({ offsetMs: 55, pitchType: 'fastball' }, makeRng(seed));
      if (h.outcome !== 'foul') continue;
      const text = withPlacement({ kind: 'in_play', hit: h }).text;
      expect(text).toMatch(/fouled it (straight back|off down the (first|third)-base side)/);
      return;
    }
    throw new Error('no foul produced');
  });
});
