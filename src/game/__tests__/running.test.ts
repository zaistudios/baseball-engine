/**
 * The running game's clocks: the die decides, the clock has to agree with it.
 */

import { describe, expect, it } from 'vitest';
import { makeRng } from '../../core/rng.ts';
import { newGame, recordPlay, fieldingAlignment, type GameState } from '../game.ts';
import { HOME, AWAY } from '../teams.ts';
import { playGap, sendRunner, sendThrow, stealClock } from '../running.ts';

const onFirst = (g: GameState): GameState => recordPlay(g, { kind: 'walk' }).game;

describe('the steal clock', () => {
  it('lands the runner first when safe and the ball first when out, at every speed', () => {
    for (const speed of [0.6, 1, 1.5]) {
      for (const to of [2, 3]) {
        for (const gap of [playGap(0.7, 0.69), playGap(0.7, 0.05)]) {
          const safe = stealClock(speed, to - 1, to, 1, 'normal', true, gap);
          expect(safe.runnerMs).toBeLessThan(safe.throwMs);
          const out = stealClock(speed, to - 1, to, 1.25, 'normal', false, gap);
          expect(out.throwMs).toBeLessThan(out.runnerMs);
          // The catcher cannot throw a ball he has not caught.
          expect(out.releaseMs).toBeGreaterThan(out.catchMs);
          expect(out.breakMs).toBeGreaterThan(out.pitchMs);
        }
      }
    }
  });

  it('draws a close call closer than an easy one', () => {
    expect(playGap(0.7, 0.69)).toBeLessThan(playGap(0.7, 0.05));
  });

  it('runs on the live game, the call matching the bases', () => {
    const g = onFirst(newGame(HOME, AWAY, 9));
    for (let i = 0; i < 40; i++) {
      const out = sendRunner(g, fieldingAlignment(g), makeRng(i))!;
      expect(out.safe).toBe(out.clock.runnerMs < out.clock.throwMs);
      expect(out.game.bases[1] !== null).toBe(out.safe);
    }
  });
});

describe('the throw-over', () => {
  it('picked off is an out and an empty bag; otherwise nothing moves', () => {
    const g = onFirst(newGame(HOME, AWAY, 9));
    let seen = 0;
    for (let i = 0; i < 400 && seen < 3; i++) {
      const out = sendThrow(g, fieldingAlignment(g), makeRng(i), 'big')!;
      expect(out.out).toBe(out.clock.throwMs < out.clock.runnerMs);
      if (out.out) {
        expect(out.game.outs).toBe(g.outs + 1);
        expect(out.game.bases[0]).toBeNull();
        seen |= 1;
      } else {
        expect(out.game).toBe(g);
        seen |= 2;
      }
    }
    expect(seen).toBe(3);
  });

  it('is not thrown with nobody to hold', () => {
    const g = newGame(HOME, AWAY, 9);
    expect(sendThrow(g, fieldingAlignment(g), makeRng(1))).toBeNull();
  });
});
