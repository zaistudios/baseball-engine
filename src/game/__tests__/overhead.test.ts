/**
 * The camera has to fit the field on whatever canvas it is handed.
 *
 * This is the one thing in overhead.ts that a screen resize can silently
 * break: a ball to the wall drawn off the top or past the edge, which nobody
 * notices until a home run leaves the frame on the way UP. Everything else in
 * the module is choreography over plot.ts, and plot.ts has its own tests.
 */

import { describe, it, expect } from 'vitest';
import { makeCam, basePoint, basesFor, pathPoint, runnerPoint, newReplay, drawOverhead, ballShare, raceFor, tripFor, REPLAY_CUT_MS, type Replay } from '../overhead.ts';
import { withPlacement } from '../placement.ts';
import { overheadPoint, groundBallMs, runnerMs, runToFirstMs, WALL_FT, FIELDERS, type Fielder } from '../plot.ts';
import { manned, assignPositions } from '../defense.ts';
import { HOME } from '../teams.ts';

/** Both screens, plus a deliberately awkward one. */
const CANVASES: [number, number][] = [
  [640, 480], // a wider canvas than the game uses, to catch a fitted formula
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

/**
 * THE BUG THIS ANSWERS: a man scoring from first was lerped straight to the
 * plate, so he ran a diagonal through the mound and touched neither second nor
 * third. Everything here is a statement about the SHAPE of a trip — never
 * about who was safe, which is the scoreboard's business and not this file's.
 */
describe('a runner runs the bases', () => {
  const cam = makeCam(420, 340);
  const bag = (i: number) => basePoint(i, cam.centre.x, cam.centre.y, cam.baseR);
  const fromCentre = (p: { x: number; y: number }) =>
    Math.hypot(p.x - cam.centre.x, p.y - cam.centre.y);

  it('starts on the bag he left and ends on the bag he reached', () => {
    for (const [from, to] of [
      [1, 2],
      [1, 4],
      [0, 2],
      [3, 4],
    ] as const) {
      const start = runnerPoint(cam, from, to, 0);
      const end = runnerPoint(cam, from, to, 1);
      expect(Math.hypot(start.x - bag(from - 1).x, start.y - bag(from - 1).y)).toBeLessThan(0.001);
      const last = to > 2 ? -1 : to - 1;
      expect(Math.hypot(end.x - bag(last).x, end.y - bag(last).y)).toBeLessThan(0.001);
    }
  });

  it('never crosses the middle of the diamond, however far he is going', () => {
    // A man scoring from first covers three bags. Every sample of that trip
    // has to stay out by the basepath — the mound is the thing he must not
    // run over, and the old straight lerp ran him right across it.
    for (let k = 0; k <= 1.0001; k += 0.02) {
      expect(fromCentre(runnerPoint(cam, 1, 4, k)), `k=${k}`).toBeGreaterThan(cam.baseR * 0.6);
    }
  });

  it('rounds a bag he is passing and squares up on the one he stops at', () => {
    // Outside the corner at second on his way to third...
    const rounding = runnerPoint(cam, 1, 3, 0.5);
    expect(fromCentre(rounding)).toBeGreaterThan(cam.baseR + 1);
    // ...and dead on it when second is where the trip ends.
    const arriving = runnerPoint(cam, 1, 2, 1);
    expect(fromCentre(arriving)).toBeCloseTo(cam.baseR, 5);
  });

  it('keeps the arc small enough to still read as the basepath', () => {
    let widest = 0;
    for (let k = 0; k <= 1.0001; k += 0.01) {
      widest = Math.max(widest, fromCentre(runnerPoint(cam, 0, 4, k)) - cam.baseR);
    }
    expect(widest).toBeGreaterThan(cam.baseR * 0.05);
    expect(widest).toBeLessThan(cam.baseR * 0.2);
  });

  it('is a single straight leg when there is no bag to round', () => {
    const mid = runnerPoint(cam, 0, 1, 0.5);
    const a = bag(-1);
    const b = bag(0);
    expect(Math.hypot(mid.x - (a.x + b.x) / 2, mid.y - (a.y + b.y) / 2)).toBeLessThan(0.001);
  });
});

/**
 * WHO IS ON THE FIELD, and the one seam the art pipeline plugs into.
 *
 * Every man on the field reaches the screen through one callback, so this is
 * where "there are people out there at all" gets pinned. It is an easy thing to
 * lose quietly: a replay with an empty field still animates, still calls the
 * play and still looks like something — just a ball moving over grass.
 */
describe('the men in the replay', () => {
  /** Records the calls, and survives everything drawOverhead does to a context. */
  const stub = (): { ctx: CanvasRenderingContext2D; calls: string[] } => {
    const calls: string[] = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (_t, k: string) => {
        if (['fillStyle', 'strokeStyle', 'font', 'textAlign', 'textBaseline'].includes(k)) return '';
        if (k === 'createLinearGradient') return () => ({ addColorStop: () => undefined });
        return (...a: unknown[]) => {
          calls.push(`${k}(${a.join(',')})`);
        };
      },
      set: () => true,
    }) as unknown as CanvasRenderingContext2D;
    return { ctx, calls };
  };

  const play = (fielders?: readonly Fielder[]): Replay =>
    newReplay({
      now: 0,
      outcome: 'single',
      exitVelocity: 92,
      launchAngle: 8,
      direction: -18,
      speed: 1,
      safe: true,
      held: [1],
      ...(fielders ? { fielders } : {}),
    });

  const PALETTE = { field: '#2d3b2c', dirt: '#5c4030' };

  it('hands every man to the caller that brought one, nine plus the runners', () => {
    const { ctx } = stub();
    const seen: { side: string; num?: number }[] = [];
    drawOverhead(ctx, makeCam(420, 340), play(), 1500, {
      ...PALETTE,
      figure: (_c, o) => seen.push({ side: o.side }),
    });
    expect(seen.filter((s) => s.side === 'fielding')).toHaveLength(9);
    // A held runner and the batter racing to first — both wear the other kit,
    // which is the only thing that tells them from the defence.
    expect(seen.filter((s) => s.side === 'batting').length).toBeGreaterThanOrEqual(2);
  });

  /**
   * ⚠️ THE GLIDE, AND WHAT KILLED IT. Every one of the nine and every runner
   * used to be handed to the caller with nothing but an x and a y, so they slid
   * across the grass in one frozen stance — the single biggest piece of
   * "scripted, not fluid". `phase` is how far through his stride a man is, and
   * it is keyed on GROUND COVERED, so it cannot be right by accident: a man who
   * has not left his post has to come through at exactly 0.
   */
  describe('the stride', () => {
    const phases = (now: number): { side: string; phase: number }[] => {
      const { ctx } = stub();
      const seen: { side: string; phase: number }[] = [];
      drawOverhead(ctx, makeCam(420, 340), play(), now, {
        ...PALETTE,
        figure: (_c, o) => seen.push({ side: o.side, phase: o.phase ?? -1 }),
      });
      return seen;
    };

    it('leaves everybody standing still on the first frame', () => {
      // Before the cut nobody has taken a step, and a run cycle at 0 is the
      // standing figure exactly.
      for (const m of phases(0)) expect(m.phase, m.side).toBe(0);
    });

    it('has men running once the play is on', () => {
      const moving = phases(1500).filter((m) => m.phase !== 0);
      expect(moving.length).toBeGreaterThan(0);
      expect(moving.some((m) => m.side === 'batting')).toBe(true);
      expect(moving.some((m) => m.side === 'fielding')).toBe(true);
    });

    it('hands every figure a phase, never undefined', () => {
      for (const m of phases(1500)) expect(m.phase).toBeGreaterThanOrEqual(0);
    });
  });

  /**
   * ⚠️ THE PIPELINE'S HALF OF IT. `manned()` puts a Player on each spot so the
   * asset layer can ask for HIS drawing; if the figure callback does not receive
   * him, per-player art is unreachable and every club fields nine of the same
   * nine sprites.
   */
  it('passes the man standing there through to the drawing', () => {
    const { ctx } = stub();
    const nine = manned(FIELDERS, assignPositions(HOME.lineup));
    const named: string[] = [];
    drawOverhead(ctx, makeCam(420, 340), play(nine), 1500, {
      ...PALETTE,
      figure: (_c, o) => {
        if (o.man) named.push(o.man.name);
      },
    });
    // Eight of the nine: the pitcher is not in a DH league's order.
    expect(new Set(named).size).toBe(8);
    expect(named).toContain(assignPositions(HOME.lineup).SS!.name);
  });
});

/**
 * ONE CLOCK FOR THE GROUNDER. placement.ts decides who cut a ground ball off
 * with groundBallMs(); the overhead draws the ball with ballShare(). If they
 * drift, the replay puts the ball somewhere other than the glove that fielded it.
 */
describe("the grounder's clock", () => {
  it('the ball is drawn at d feet at exactly the ms the engine says it gets there', () => {
    for (const ev of [60, 85, 100, 118]) {
      const r = newReplay({
        now: 0, outcome: 'ground_out', exitVelocity: ev, launchAngle: 2,
        direction: -12, speed: 1, safe: false,
      });
      for (const share of [0, 0.1, 0.35, 0.6, 0.9, 1]) {
        const d = r.plot.distFt * share;
        const drawn = ballShare(r, groundBallMs(r.plot, d)) * r.plot.distFt;
        expect(drawn, `${ev}mph at ${d.toFixed(0)}ft`).toBeCloseTo(d, 6);
      }
    }
  });
});

/**
 * THE PICTURE DRAWS THE ENGINE'S GROUND BALL (ZAIS-17). The man who cut it off
 * is the chaser, the ball stops in his glove at his spot, and he fields it at
 * the engine's time. A ball through the infield goes to an outfielder, who has
 * no play at first.
 */
describe('a grounder is drawn where the engine played it', () => {
  const grounder = (direction: number) => {
    const hit = {
      outcome: 'ground_out', isOut: true, isHit: false, exitVelocity: 100, launchAngle: 2,
      direction, timing: 'good', pitchType: 'fastball', platoon: 1, stance: 'normal', clutchApplied: false,
    } as const;
    const placed = withPlacement({ kind: 'in_play', hit });
    const p = placed.placement!;
    const out = placed.result.kind === 'in_play' ? placed.result.hit.outcome : 'ground_out';
    return {
      p,
      r: newReplay({
        now: 0, outcome: out, exitVelocity: 100, launchAngle: 2, direction,
        speed: 1, safe: out !== 'ground_out', chaserNum: p.fielderNum, cutOff: p.cutOff!,
      }),
    };
  };

  it('fielded: in his glove, at his spot, at the engine’s time', () => {
    const { p, r } = grounder(-19);
    const race = raceFor(r);
    expect(race.chaser.num).toBe(6);
    expect(race.fieldedAt).toBe(REPLAY_CUT_MS + p.cutOff!.ms);
    // Long after, the ball is still where he caught it, not where it would
    // have rolled to.
    expect(ballShare(r, 5000) * r.plot.distFt).toBeCloseTo(p.cutOff!.alongFt, 6);
    expect(race.throwMs).not.toBeNull();
  });

  it('through: an outfielder picks it up and nobody throws to first', () => {
    // Find a 100mph ball that got through; the tuning decides which angle.
    let found = false;
    for (let d = -40; d <= 40 && !found; d += 1) {
      const { p, r } = grounder(d);
      if (!p.cutOff!.past) continue;
      found = true;
      const race = raceFor(r);
      expect(race.chaser.num).toBeGreaterThanOrEqual(7);
      expect(race.throwMs).toBeNull();
      expect(p.cutOff!.reach).toBeLessThan(1);
    }
    expect(found).toBe(true);
  });
});

describe('a runner has one clock', () => {
  // The engine decides forces from runnerMs(); the replay draws the man with
  // tripFor(). If they drift, a runner is drawn beating a throw the book says
  // beat him. ZAIS-21 step 1.
  const r = newReplay({
    now: 0, outcome: 'ground_out', exitVelocity: 90, launchAngle: 2, direction: -19,
    speed: 1, safe: false,
  });
  for (const speed of [0.7, 1, 1.4]) {
    it(`the overhead draws a man at ${speed} on the engine's clock`, () => {
      for (const [from, to] of [[1, 2], [2, 3], [3, 4]] as const) {
        expect(tripFor(r, speed, from, to)).toBe(runnerMs(speed, from, to));
      }
    });
  }
  it('a man on base has a running start; the batter does not', () => {
    expect(runnerMs(1, 0, 1)).toBe(runToFirstMs(1));
    expect(runnerMs(1, 1, 2)).toBeLessThan(runToFirstMs(1));
  });
});
