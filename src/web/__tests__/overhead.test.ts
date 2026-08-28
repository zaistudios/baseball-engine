/**
 * The camera has to fit the field on whatever canvas it is handed.
 *
 * This is the one thing in overhead.ts that a screen resize can silently
 * break: a ball to the wall drawn off the top or past the edge, which nobody
 * notices until a home run leaves the frame on the way UP. Everything else in
 * the module is choreography over plot.ts, and plot.ts has its own tests.
 */

import { describe, it, expect } from 'vitest';
import { makeCam } from '../overhead.ts';
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
