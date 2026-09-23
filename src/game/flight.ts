/**
 * THE BALL, DRAWN FROM THE VERDICT — the at-bat view's one perspective.
 *
 * ⚠️ EVERYTHING HERE IS DERIVED FROM NUMBERS THAT ALREADY EXIST. `atBat.
 * lastSwing` carries `exitVelocity`, `launchAngle` and `direction` the moment
 * swingAt() returns, before a pixel is drawn, and the box score is written from
 * them. This file turns those three numbers into a point. It decides NOTHING:
 * there is no roll in it, no hit detection, no reading of where the bat happens
 * to have been drawn. A second model that decided an outcome from a picture is
 * two systems that can disagree, and the record book is written from the other
 * one.
 *
 * ⚠️ AND IT LIVES OUTSIDE main.ts FOR THE REASON THE ZONE CONSTANTS DO. Nothing
 * in main.ts can be reached without a canvas, which is how two strike zones sat
 * thirty pixels apart under 1,239 green tests. The sign convention below is the
 * single thing most likely to be wrong and least likely to be noticed — a ball
 * that leaves toward left field and lands in right is worse than no ball at all
 * — so it is expressed as data a test can read.
 *
 * ------------------------------------------------------------- the projection
 *
 * The camera is behind the catcher. Everything converges on the release point
 * above the mound, which is where the pitch comes OUT of and where a batted
 * ball goes back TOWARD. One number does all of it: `k`, how near the ball is,
 * 1 at the plate and 0 at the release point. drawBall()'s pitch has always used
 * exactly this — its `t` IS this `k` — so the ball is the same size and in the
 * same place the frame after it is hit as the frame before.
 *
 * ---------------------------------------------------------------- the scale
 *
 * ⚠️ NOT PHYSICS, AND IT CANNOT BE. This canvas is 420px wide and the frame
 * holds about nine feet across the plate; a real 100mph ball clears that in
 * twelve milliseconds and the camera cuts three hundred later. Real scale draws
 * one frame of a ball and then an empty screen.
 *
 * So there is ONE tuning constant for speed, and its job is stated rather than
 * derived: the hardest ball this game produces covers most of the canvas in the
 * beat before the cut, and a 60mph one covers a visibly smaller part of it.
 * Everything else — the vertical, the horizontal, the recession — comes off the
 * verdict's own three numbers through that one dial.
 */

/** The three numbers off the bat. `HitResult` satisfies this; nothing else does. */
export interface Batted {
  /** mph. 0 is a whiff's dummy record — it must draw nothing, not divide. */
  exitVelocity: number;
  /** Degrees off the ground. Negative is a chopper into the dirt. */
  launchAngle: number;
  /**
   * FIELD degrees, and ALREADY HANDEDNESS-CORRECTED — sprayDirection() in
   * hit.ts signs it for the batter's hand before it ever gets here. Negative is
   * toward left field. Past ±45 it is foul; past ±90 it is back over the
   * catcher.
   *
   * ⚠️ DO NOT APPLY A HAND HERE. Doing it twice is the defect that looks right
   * for right-handers and mirrors every left-hander's hit.
   */
  direction: number;
}

/** A point in the at-bat view, as an offset from the plate, with its size. */
export interface BallPoint {
  x: number;
  y: number;
  r: number;
}

/**
 * The release point, as an offset from the plate — the vanishing point of this
 * whole view. drawBall() has drawn the pitch out of canvas y 52 since there was
 * a pitch to draw; this is that number, said once.
 */
export const RELEASE_DY = -198;

/**
 * HOW FAST THE BALL CROSSES THE FRAME, per mph off the bat. The one dial.
 *
 * At the game's ceiling of 122mph this is 1.1 px/ms, which is most of a 420px
 * canvas in the 300ms before the camera cuts. At 60mph it is half that, and the
 * two read as different balls — which is the whole of what S3 asks for.
 */
const EXIT_PX_PER_MPH = 0.009;

/**
 * How far away from the plate the ball has to get before it is at the release
 * point and there is nothing left to see. Sixty feet, in the same units.
 *
 * ponytail: linear, so `k` falls off evenly rather than the way a real lens
 * would. At this canvas size the difference is under a pixel and it costs a
 * divide instead of a log.
 */
const DEPTH_TO_VANISH = 330;

/**
 * Near and far, and they are drawBall()'s own numbers: the pitch grows 2.5 →
 * 9.5 on its way in. A batted ball leaving at 9.5 is the same ball that just
 * arrived, which is the only reason contact reads as one event.
 */
const BALL_R_FAR = 2.5;
const BALL_R_NEAR = 9.5;

/**
 * Nothing is drawn past these. `K_MIN` is the ball at the horizon; `K_MAX` is a
 * foul coming back over the catcher's head, where the projection would
 * otherwise grow without bound and paint a dinner plate across the screen.
 */
const K_MIN = 0.05;
const K_MAX = 2.2;

/** How near the ball is: 1 at the plate, 0 at the release point. */
export const nearness = (depth: number): number =>
  Math.max(K_MIN, Math.min(K_MAX, 1 - depth / DEPTH_TO_VANISH));

/** How big the ball is drawn at that nearness. The pitch's own curve. */
export const radiusAt = (k: number): number => BALL_R_FAR + k * k * (BALL_R_NEAR - BALL_R_FAR);

const rad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * WHERE THE BALL IS, `sinceMs` after it left the bat.
 *
 * `from` is the contact point as an offset from the plate — main.ts takes its x
 * off the pose the engine graded and its y off where the pitch crossed.
 *
 * ⚠️ THE SIGN OF x IS THE SAME SIGN overheadPoint() USES, and that is the one
 * thing in this file that can be wrong without anybody noticing. Both cameras
 * look out from home toward centre, so `sin(direction)` is screen-right in both
 * — the ball leaves the bat going the way the overhead is about to show it
 * going. flight.test.ts holds the two together.
 *
 * ⚠️ NO GRAVITY, AND THAT IS DELIBERATE. Three hundred milliseconds of a real
 * arc is a pixel and a half. What separates a chopper from a pop-up here is the
 * launch angle itself, not the fall — the pop is still climbing when the camera
 * cuts, and the chopper is on the dirt. Null once the ball has reached the
 * horizon: there is nothing left to draw, and the overhead owns it from here. A
 * foul comes back the other way and leaves the frame instead, which only the
 * caller can test, because only the caller knows how big the frame is.
 */
export function battedAt(
  hit: Batted,
  from: { x: number; y: number },
  sinceMs: number,
): BallPoint | null {
  const v = Math.max(0, hit.exitVelocity) * EXIT_PX_PER_MPH;
  const la = rad(hit.launchAngle);
  const dir = rad(hit.direction);

  // Split the speed the way the verdict describes it: up, and along the ground.
  const flat = Math.cos(la) * v;
  const rise = Math.sin(la) * v;

  const t = Math.max(0, sinceMs);
  const lateral = Math.sin(dir) * flat * t;
  const depth = Math.cos(dir) * flat * t;

  // ⚠️ THE DIRT IS A FLOOR, NOT A BOUNCE. overhead.ts owns hops, friction and
  // hang time three hundred milliseconds from now; all this view has to do is
  // stop a chopper burrowing under the plate. It reaches the ground and skips
  // out along it, which is what a chopper looks like from behind the catcher.
  const height = Math.min(0, from.y - rise * t);

  const k = nearness(depth);
  if (k <= K_MIN) return null;

  return {
    x: (from.x + lateral) * k,
    y: RELEASE_DY + (height - RELEASE_DY) * k,
    r: radiusAt(k),
  };
}
