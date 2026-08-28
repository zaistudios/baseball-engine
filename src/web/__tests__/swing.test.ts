import { describe, expect, it } from 'vitest';
import {
  poseAt,
  poseTimeMs,
  barrelOf,
  isSwinging,
  BAT_POSES,
  REST_POSE,
  CONTACT_POSE,
  BAT_LEN,
  BATTER_DX,
  ZONE_DY,
  ZONE_HALF_W,
  ZONE_HALF_H,
  SWING_TRAVEL_MS,
  FOLLOW_THROUGH_MS,
  travelMs,
  canCheck,
  CHECK_WINDOW,
  batSpeedLabel,
  MIN_TRAVEL_MS,
  MAX_TRAVEL_MS,
} from '../swing.ts';
import { computeOffsetMs, grade } from '../../core/timing.ts';

describe('the bat', () => {
  it('is on the shoulder until the press', () => {
    expect(poseAt(0)).toEqual(REST_POSE);
    expect(isSwinging(-1)).toBe(false);
  });

  it('comes back to rest once the follow-through is over', () => {
    expect(isSwinging(SWING_TRAVEL_MS + FOLLOW_THROUGH_MS - 1)).toBe(true);
    expect(isSwinging(SWING_TRAVEL_MS + FOLLOW_THROUGH_MS)).toBe(false);
  });
});

describe('pressing, now that the bat takes time to get there', () => {
  const arrival = 10_000;
  const at = (pressMs: number) => grade(computeOffsetMs(pressMs + SWING_TRAVEL_MS, arrival));

  it('rewards the press that starts a full swing before the ball lands', () => {
    expect(at(arrival - SWING_TRAVEL_MS)).toBe('perfect');
  });

  it('grades reacting to the ball already being there as hopelessly late', () => {
    expect(at(arrival)).toBe('miss');
  });

  it('still has an early side', () => {
    expect(at(arrival - SWING_TRAVEL_MS - 50)).toBe('early');
    expect(at(arrival - SWING_TRAVEL_MS + 50)).toBe('late');
  });
});

/**
 * THE INVARIANT THE WHOLE FILE EXISTS TO PROTECT.
 *
 * main.ts grades the swing at exactly SWING_TRAVEL_MS, and the pose held in
 * that frame is the one at `t === 1`. If its barrel is not drawn over the
 * strike zone, the picture and the verdict have come apart — FAULT 5 again,
 * one layer down. Everything else about the pose table is taste; this is not.
 */
describe('the barrel is over the plate at the frame that is graded', () => {
  it('holds the contact pose in the graded frame', () => {
    expect(poseAt(SWING_TRAVEL_MS)).toEqual(CONTACT_POSE);
  });

  it('puts the barrel inside the strike zone', () => {
    const { x, y } = barrelOf(CONTACT_POSE);
    expect(Math.abs(x)).toBeLessThan(ZONE_HALF_W);
    expect(Math.abs(y - ZONE_DY)).toBeLessThan(ZONE_HALF_H);
  });

  it('puts it near the middle, not clipping a corner', () => {
    const { x, y } = barrelOf(CONTACT_POSE);
    expect(Math.hypot(x, y - ZONE_DY)).toBeLessThan(24);
  });

  it('finds the contact pose by its time, not by an index', () => {
    // Inserting a pose ahead of it must not silently change which one is
    // graded. `t === 1` is the definition of contact.
    expect(CONTACT_POSE.t).toBe(1);
    expect(BAT_POSES.filter((p) => p.t === 1)).toHaveLength(1);
  });
});

/**
 * FAULTS 6 AND 7, AND THE MODEL THAT REPLACED THEM.
 *
 * The rotating-line swing was a vertical chop (6), rotating the wrong way (7),
 * and structurally unable to hold both a cocked load and a wrapped finish.
 * These assert the shape the pose table has to keep — each one fails on the
 * old model, and none of them can be satisfied by a single fixed-pivot
 * rotation, which is the point.
 */
describe('the swing is level, not a chop', () => {
  const barrels = BAT_POSES.map(barrelOf);

  it('travels further sideways than it does up and down', () => {
    // THE ORIGINAL COMPLAINT, as one number. The old swing swept 75px wide and
    // 183px tall — vertical travel was 2.4x horizontal, which is an axe.
    const xs = barrels.map((b) => b.x);
    const ys = barrels.map((b) => b.y);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    expect(width).toBeGreaterThan(height * 1.8);
  });

  it('keeps the swing itself level — coil, contact and through', () => {
    // The three poses that are the swing proper must sit at nearly one height.
    // The load and the finish are allowed to be high; the part that meets the
    // ball is not allowed to be a chop.
    const swing = ['coil', 'contact', 'through'].map(
      (n) => barrelOf(BAT_POSES.find((p) => p.name === n)!).y,
    );
    expect(Math.max(...swing) - Math.min(...swing)).toBeLessThan(20);
  });

  it('sweeps the barrel a long way across the plate while doing it', () => {
    const coil = barrelOf(BAT_POSES.find((p) => p.name === 'coil')!);
    const through = barrelOf(BAT_POSES.find((p) => p.name === 'through')!);
    expect(through.x - coil.x).toBeGreaterThan(150);
  });
});

describe('the poses a fixed pivot could never have held at once', () => {
  const pose = (name: string) => BAT_POSES.find((p) => p.name === name)!;

  /**
   * ⚠️ THE HANDS ARE IN FRONT OF HIM. Zane: "batters hold bat in front of them,
   * not behind them."
   *
   * The batter's torso runs from BATTER_DX (−96) to −70. Hands used to sit at
   * −84, which is inside that — he was holding the bat behind himself. Every
   * hand position has to be forward of his back edge now, and this is the test
   * that says so.
   */
  it('holds the bat in FRONT of the batter, never behind him', () => {
    for (const p of BAT_POSES) {
      expect(p.hx, `${p.name} hands`).toBeGreaterThan(BATTER_DX);
    }
  });

  it('cocks the bat HIGH at the load, above his head', () => {
    const b = barrelOf(pose('load'));
    expect(b.y).toBeLessThan(ZONE_DY - ZONE_HALF_H);
  });

  it('finishes HIGH and wrapped, not in the dirt', () => {
    // The pair that broke the rotating model: one rotation cannot reach a high
    // load AND a high finish. Both are high here because they were drawn, not
    // derived.
    expect(barrelOf(pose('finish')).y).toBeLessThan(ZONE_DY);
  });

  it('lets the BARREL lag behind him at the coil, which is unavoidable', () => {
    // The hands are in front; the barrel at the coil is not, and cannot be.
    // A level swing whose barrel is never behind the hitter is not a swing.
    // What makes this fine is that the bat is drawn OVER the body, so the
    // lagging barrel is visible rather than hidden inside him.
    expect(barrelOf(pose('coil')).x).toBeLessThan(BATTER_DX);
  });

  it('moves the hands through the swing instead of pivoting about one point', () => {
    // A fixed pivot is what forced every other compromise. If every pose shares
    // a hand position, the model has quietly reverted.
    const xs = new Set(BAT_POSES.map((p) => p.hx));
    expect(xs.size).toBeGreaterThan(2);
    expect(pose('through').hx - pose('load').hx).toBeGreaterThan(12);
  });

  it('opens the body up as the swing goes', () => {
    expect(pose('load').turn).toBe(0);
    expect(pose('contact').turn).toBeGreaterThan(0);
    expect(pose('finish').turn).toBeGreaterThan(pose('contact').turn);
  });

  it('foreshortens the bat per pose rather than drawing it one length', () => {
    // A bat pointing away from the camera is drawn short. One length for every
    // pose is what made the old version read as a flat propeller.
    const lens = new Set(BAT_POSES.map((p) => p.len));
    expect(lens.size).toBeGreaterThan(2);
    for (const p of BAT_POSES) expect(p.len).toBeLessThanOrEqual(BAT_LEN);
  });
});

/**
 * FLUIDITY. The poses used to SNAP, and Zane's note was "batting isn't fluid
 * like it should be" — five hard cuts across 340ms is a slideshow, not a swing.
 *
 * They are keyframes now and the bat moves continuously between them. What
 * these lock is that nothing jumps, and that interpolating did not cost the
 * one thing the pose model was for: hitting the contact pose exactly.
 */
describe('the swing is continuous — keyframes, not slides', () => {
  const barrelAtMs = (ms: number) => barrelOf(poseAt(ms));

  it('hits each keyframe exactly at its own time', () => {
    // Linear interpolation reaches its endpoints, so the authored poses are
    // still drawn as authored — the tween happens between them, not through
    // them.
    for (const pose of BAT_POSES) {
      expect(poseAt(poseTimeMs(pose.t))).toMatchObject({
        hx: pose.hx,
        hy: pose.hy,
        len: pose.len,
      });
    }
  });

  it('never jumps — the barrel moves smoothly the whole way', () => {
    // THE ASSERTION THAT WOULD HAVE CAUGHT THE CLUNK. With snapping, the step
    // between two keyframes was the whole distance between them in one frame:
    // over 90px in a single tick. Nothing may move more than a few px/ms now.
    let last = barrelAtMs(0);
    for (let ms = 1; ms <= SWING_TRAVEL_MS + FOLLOW_THROUGH_MS; ms++) {
      const now = barrelAtMs(ms);
      expect(Math.hypot(now.x - last.x, now.y - last.y), `at ${ms}ms`).toBeLessThan(12);
      last = now;
    }
  });

  it('moves the hands smoothly too', () => {
    let last = poseAt(0);
    for (let ms = 1; ms <= SWING_TRAVEL_MS + FOLLOW_THROUGH_MS; ms++) {
      const now = poseAt(ms);
      expect(Math.hypot(now.hx - last.hx, now.hy - last.hy), `at ${ms}ms`).toBeLessThan(4);
      last = now;
    }
  });

  it('takes the short way round the angle, not the long way', () => {
    // Load is -100 and coil is +170. Interpolated naively that is a 270 degree
    // trip forward through the plate — the bat swinging out and coming back.
    // The short way is 90 degrees backwards, which is the real motion.
    const load = BAT_POSES[0]!;
    const coil = BAT_POSES[1]!;
    const mid = poseAt((poseTimeMs(load.t) + poseTimeMs(coil.t)) / 2);
    // Going the long way would put the mid-point near 35 degrees, out over the
    // plate. The short way puts it back past -145.
    expect(mid.angle).toBeLessThan(load.angle);
  });

  it('accelerates into the ball through keyframe spacing, not easing', () => {
    // Easing inside a segment would stop the bat dead at every keyframe, which
    // is the stutter again. The speed-up comes from load->coil being 0.70 of
    // the swing and coil->contact only 0.30.
    const early = Math.hypot(
      barrelAtMs(20).x - barrelAtMs(10).x,
      barrelAtMs(20).y - barrelAtMs(10).y,
    );
    const late = Math.hypot(
      barrelAtMs(SWING_TRAVEL_MS).x - barrelAtMs(SWING_TRAVEL_MS - 10).x,
      barrelAtMs(SWING_TRAVEL_MS).y - barrelAtMs(SWING_TRAVEL_MS - 10).y,
    );
    expect(late).toBeGreaterThan(early * 2);
  });
});

/**
 * BAT SPEED — the cost of power.
 *
 * SWING_TRAVEL_MS was one constant for all fifteen players, so a 1.7-power
 * factory frame got around exactly as fast as a five-foot-four leadoff man.
 * It comes off the power stat now, which adds no new stat: after the
 * applyPower rewrite, power was pure upside everywhere.
 */
describe('bat speed comes off power, and costs information not precision', () => {
  it('makes a heavy hitter slower to get around than a light one', () => {
    expect(travelMs(1.7)).toBeGreaterThan(travelMs(0.65));
  });

  it('leaves a 1.0-power hitter on the base value', () => {
    expect(travelMs(1)).toBeCloseTo(SWING_TRAVEL_MS, 6);
  });

  it('rises smoothly rather than in bands', () => {
    let last = 0;
    for (let p = 0.7; p <= 1.7; p += 0.05) {
      const t = travelMs(p);
      expect(t).toBeGreaterThanOrEqual(last);
      last = t;
    }
  });

  it('spreads the roster by more than the good window is wide', () => {
    expect(travelMs(1.7) - travelMs(0.65)).toBeGreaterThan(35);
  });

  it('clamps, because chemistry and items push power past the roster', () => {
    expect(travelMs(99)).toBe(MAX_TRAVEL_MS);
    expect(travelMs(0)).toBe(MIN_TRAVEL_MS);
    expect(travelMs(-5)).toBe(MIN_TRAVEL_MS);
  });

  it('never asks for more time than the fastest pitch takes to arrive', () => {
    const flightMs = (55 / (100 * 1.467)) * 1000;
    expect(MAX_TRAVEL_MS).toBeLessThan(flightMs * 0.6);
  });

  it('names itself in words for the card', () => {
    expect(batSpeedLabel(0.65)).toBe('quick bat');
    expect(batSpeedLabel(1.7)).toBe('heavy bat');
    expect(batSpeedLabel(1.0)).toBe('average bat');
  });
});

describe('bat speed stretches the approach, not the follow-through', () => {
  it('holds the contact pose in the graded frame at every bat speed', () => {
    // The invariant, across the whole range rather than at the default. A
    // heavy hitter must not be graded on a pose that has not arrived yet.
    for (const power of [0.1, 0.65, 1.0, 1.3, 1.7, 2.5, 99]) {
      const travel = travelMs(power);
      expect(poseAt(travel, travel), `power ${power}`).toEqual(CONTACT_POSE);
    }
  });

  it('scales the poses before contact with the bat', () => {
    const quick = travelMs(0.65);
    const heavy = travelMs(1.7);
    const coil = BAT_POSES.find((p) => p.name === 'coil')!;
    expect(poseTimeMs(coil.t, heavy)).toBeGreaterThan(poseTimeMs(coil.t, quick));
  });

  it('does NOT stretch the follow-through', () => {
    // A slow bat takes longer to arrive; it does not finish in slow motion.
    // Scaling both would make heavy hitters look like they were underwater.
    const finish = BAT_POSES.find((p) => p.name === 'finish')!;
    const quick = travelMs(0.65);
    const heavy = travelMs(1.7);
    const afterContact = (travel: number) => poseTimeMs(finish.t, travel) - travel;
    expect(afterContact(quick)).toBeCloseTo(afterContact(heavy), 6);
  });
});

describe('the check swing — the window you can still take it back in', () => {
  it('opens at the press and closes before the barrel arrives', () => {
    const travel = 120;
    expect(canCheck(0, travel)).toBe(true);
    expect(canCheck(travel * CHECK_WINDOW - 1, travel)).toBe(true);
    expect(canCheck(travel * CHECK_WINDOW, travel)).toBe(false);
    expect(canCheck(travel, travel)).toBe(false);
  });

  it('never lets a check land after contact — that would un-hit a hit', () => {
    for (const power of [0.65, 1, 1.35, 1.7]) {
      const travel = travelMs(power);
      expect(canCheck(travel, travel)).toBe(false);
      expect(canCheck(travel + 50, travel)).toBe(false);
    }
  });

  it('gives the heavy bat longer to change its mind — the one thing slow buys', () => {
    const quick = travelMs(0.65) * CHECK_WINDOW;
    const heavy = travelMs(1.7) * CHECK_WINDOW;
    expect(heavy).toBeGreaterThan(quick);
    // Worth more than the ±12ms perfect window, or it is a decimal not a trade.
    expect(heavy - quick).toBeGreaterThan(12);
  });

  it('ignores a press that has not happened yet', () => {
    expect(canCheck(-1, 120)).toBe(false);
  });
});
