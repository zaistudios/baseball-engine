/**
 * The pause bug: the wall clock kept running behind the pause menu, so the
 * result screen expired, the next pitch was thrown, and take() charged a
 * strike while the player was looking at a menu.
 *
 * These read the clock the way frame() does — tick first, then read — since
 * that is the only ordering the game ever uses.
 */
import { describe, it, expect } from 'vitest';

import { gameNow, tickClock, toGameTime } from '../clock.ts';

/** Burn real wall time. The clock reads performance.now(), so it has to pass. */
function spin(ms: number): void {
  const until = performance.now() + ms;
  while (performance.now() < until) {
    /* empty */
  }
}

const tickAndRead = (frozen: boolean): number => {
  tickClock(frozen);
  return gameNow();
};

describe('the game clock stops behind a menu', () => {
  it('does not advance while frozen, however long the menu is open', () => {
    tickAndRead(false);
    const before = tickAndRead(true);

    for (let i = 0; i < 5; i++) {
      spin(4);
      tickClock(true);
    }
    const after = gameNow();

    // >20ms of wall time passed. The game saw ~none of it.
    expect(after - before).toBeLessThan(2);
  });

  it('starts moving again on unfreeze, without replaying the paused time', () => {
    const paused = tickAndRead(true);
    spin(15);
    const resumed = tickAndRead(false);

    // The 15ms behind the menu is gone, not banked up and spent at once.
    expect(resumed - paused).toBeLessThan(2);

    spin(10);
    expect(tickAndRead(false) - resumed).toBeGreaterThan(8);
  });

  it('shifts input timestamps by the same amount it shifts the ball', () => {
    tickClock(false);
    // A swing stamped on the wall clock, converted, has to land on the same
    // clock the ball's arrival is on — otherwise every swing after the first
    // pause grades against a ball that is somewhere else.
    const wall = performance.now();
    tickClock(false);
    expect(Math.abs(toGameTime(wall) - gameNow())).toBeLessThan(2);
  });
});
