/**
 * The camera has to fit the field on whatever canvas it is handed.
 *
 * This is the one thing in overhead.ts that a screen resize can silently
 * break: a ball to the wall drawn off the top or past the edge, which nobody
 * notices until a home run leaves the frame on the way UP. Everything else in
 * the module is choreography over plot.ts, and plot.ts has its own tests.
 */

import { describe, it, expect } from 'vitest';
import { makeCam, basePoint, basesFor, pathPoint } from '../overhead.ts';
import { overheadPoint, WALL_FT } from '../plot.ts';

/** Both screens, plus a deliberately awkward one. */
const CANVASES: [number, number][] = [
  [640, 480], // the roguelike
  [420, 340], // the full game
  [300, 300], // square, to catch a formula that assumes wide
];

describe('the overhead camera', () => {
  for (const [w, h] of CANVASES) {
    it(`fits the whole field on ${w}x${h}`, () => {
      const cam = makeCam(w, h);
      // Straightaway centre and both foul lines — the three extremes of the
      // wall arc. Nothing further out is reachable.
      for (const dir of [-45, 0, 45]) {
        const p = overheadPoint(WALL_FT, dir, cam.home, cam.pxPerFt);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(w);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(h);
      }
      // Home is on the canvas, and the diamond is in front of it.
      expect(cam.home.y).toBeLessThan(h);
      expect(cam.centre.y).toBeLessThan(cam.home.y);
    });
  }

  it('honours an explicit scale, so a screen can keep the look it had', () => {
    const cam = makeCam(640, 480, 0.92);
    expect(cam.pxPerFt).toBe(0.92);
    expect(cam.home).toEqual({ x: 320, y: 436 });
  });
});

/**
 * The batter's trip round the bases.
 *
 * ⚠️ THE REPLAY USED TO PARK HIM ON FIRST WHATEVER HAPPENED — drawRace() drew
 * one leg, home to first, on every ball in play. So the picture under a HOME
 * RUN banner was a man standing on first base. These two functions are the fix,
 * and this is the test that stops it coming back.
 */
describe('the batter runs as far as the scoreboard says', () => {
  const cam = makeCam(420, 340);
  const bag = (i: number) => basePoint(i, cam.centre.x, cam.centre.y, cam.baseR);
  const near = (
    a: { x: number; y: number },
    b: { x: number; y: number },
  ) => expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.001);

  it('counts the bags each hit is worth', () => {
    expect(basesFor('single')).toBe(1);
    expect(basesFor('double')).toBe(2);
    expect(basesFor('triple')).toBe(3);
    expect(basesFor('home_run')).toBe(4);
    // Everything that is not a hit is still a trip to first — he runs out a
    // ground ball, and an error is why that matters.
    expect(basesFor('ground_out')).toBe(1);
  });

  it('finishes on the bag, not somewhere near it', () => {
    near(pathPoint(cam, 0), bag(-1)); // the box
    near(pathPoint(cam, 1), bag(0));
    near(pathPoint(cam, 2), bag(1));
    near(pathPoint(cam, 3), bag(2));
    near(pathPoint(cam, 4), bag(-1)); // across the plate
  });

  /**
   * The corner is the whole reason pathPoint() walks legs instead of lerping.
   * A man going first to third who cut the corner would run through the mound.
   */
  it('follows the basepath rather than cutting across the diamond', () => {
    const halfway = pathPoint(cam, 1.5);
    const a = bag(0);
    const b = bag(1);
    near(halfway, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    // ...and that point is nowhere near the middle of the infield.
    expect(Math.hypot(halfway.x - cam.centre.x, halfway.y - cam.centre.y)).toBeGreaterThan(
      cam.baseR * 0.6,
    );
  });

  it('never leaves the basepath, however far past the end it is asked', () => {
    for (let b = -1; b <= 6; b += 0.25) {
      const p = pathPoint(cam, b);
      const onPath = [-1, 0, 1, 2].some((i) => {
        const s = bag(i);
        const e = bag(i === 2 ? -1 : i + 1);
        // Distance to the segment's two ends can never both exceed its length.
        return Math.hypot(p.x - s.x, p.y - s.y) + Math.hypot(p.x - e.x, p.y - e.y) <=
          Math.hypot(e.x - s.x, e.y - s.y) + 0.001;
      });
      expect(onPath, `bases=${b}`).toBe(true);
    }
  });
});
