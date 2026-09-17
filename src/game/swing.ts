/**
 * The bat, as a physical object with a duration.
 *
 * FAULT 5 — THE SWING WAS NOT A SWING.
 *
 * Before this file, pointerdown was graded on the spot and the bat animation
 * played *afterwards*, driven off the outcome banner's expiry. So the press
 * decided everything at t=0 and the picture of the bat moving was a replay of
 * a decision already made. Nothing on screen was caused by the input, and the
 * verdict ("SWING AND MISS") appeared before the bat had left the shoulder.
 * That disconnect is what "the swing isn't actually a swing" means, and it is
 * also why contact felt arbitrary: there was no moment to aim at, only a
 * number to hit.
 *
 * Here the press STARTS the bat and the barrel reaches the plate
 * SWING_TRAVEL_MS later. Contact is graded at that arrival, not at the press,
 * so the frame where the bat crosses the zone is the frame the outcome is
 * decided — the picture and the verdict are one event. You can see yourself
 * being early.
 */

/**
 * Press to barrel-in-the-zone. The whole feel of the change is this number.
 *
 * It buys anticipation: you can no longer wait until the ball is at the plate
 * and react, you have to start the bat before it gets there, which is the
 * thing batting actually is. It does NOT narrow anything — the same
 * ±12/±35/±80 windows apply, they just apply at contact instead of at the
 * press, so every press moves this much earlier.
 *
 * 120ms is roughly a real bat's time from launch to the zone, and it is short
 * enough that the swing still reads as a reflex rather than a wind-up.
 *
 * THIS IS THE BASE, for a 1.0-power hitter. Every batter scales it — see
 * travelMs() below. Read this number as "the neutral bat", not "the bat".
 */
export const SWING_TRAVEL_MS = 120;

/**
 * BAT SPEED, AND WHY IT COMES OFF THE POWER STAT.
 *
 * A heavy bat is slower to get around. That is the oldest trade in hitting and
 * the game did not have it: `SWING_TRAVEL_MS` was one constant for all fifteen
 * players, so Xandra Kō's 1.7-power factory frame got around exactly as fast as
 * Wee Tom Barrow, who is five foot four.
 *
 * NO NEW STAT. Power already exists, already means "how hard he swings", and
 * after the applyPower rewrite it was pure upside — more home runs, more
 * doubles, fewer grounders, and no cost anywhere. This is the cost, and it is
 * the honest one: the big swing takes longer to arrive.
 *
 * WHAT IT ACTUALLY COSTS YOU IS INFORMATION, not precision. The timing windows
 * do not move — ±12/±35/±80 still apply, at contact, exactly as before. What
 * moves is HOW EARLY you must commit, and committing earlier means deciding
 * with less of the pitch seen. Against THE ARCHITECT's fastball, the fastest
 * thing in the game at ~500ms of flight, a quick bat gets 395ms of looking at
 * it and a heavy bat gets 351ms. Both are above the ~250ms a person needs to
 * react to a visual cue, which is what keeps the heavy bat playable rather
 * than merely punishing.
 *
 * The clamps matter more than the slope. Chemistry and items both add power,
 * so effective power is not bounded by the roster's 1.7, and an unclamped
 * curve would eventually produce a bat that cannot be swung in time at all.
 */
export const TRAVEL_PER_POWER = 0.35;
export const MIN_TRAVEL_MS = 100;
export const MAX_TRAVEL_MS = 155;

/**
 * How long THIS hitter's barrel takes to reach the plate.
 *
 * Across the roster's 0.65–1.70 power this runs about 105ms to 149ms — a 44ms
 * spread, which is comfortably more than the ±35ms `good` window and so is
 * something a player can actually feel rather than a decimal on a card.
 */
export function travelMs(power: number): number {
  const t = SWING_TRAVEL_MS * (1 + TRAVEL_PER_POWER * (power - 1));
  return Math.max(MIN_TRAVEL_MS, Math.min(MAX_TRAVEL_MS, t));
}

/**
 * What to call it on a card. Words, not milliseconds — the walk-up card is a
 * thing you glance at, and `bat 149ms` is telemetry. The hover tip carries the
 * number for anyone who wants it.
 */
export function batSpeedLabel(power: number): string {
  const t = travelMs(power);
  if (t <= 112) return 'quick bat';
  if (t >= 132) return 'heavy bat';
  return 'average bat';
}

/** Barrel decelerating past the ball. Cosmetic; grading is over at contact. */
export const FOLLOW_THROUGH_MS = 220;

/**
 * ⚠️ FAULTS 6 AND 7, AND WHY THE MODEL CHANGED. 2026-08-16.
 *
 * The bat used to be a LINE ROTATING ABOUT A FIXED POINT, interpolated
 * smoothly between three angles. It was wrong twice over, and then wrong a
 * third way that no amount of retuning could reach:
 *
 *  FAULT 6 — it swung through a VERTICAL plane. −69° over the shoulder to
 *  +77° at the dirt: an axe. Zane: "the batter swings up to down, when it
 *  should be how a NES baseball game goes."
 *
 *  FAULT 7 — it rotated the WRONG WAY. `hit.ts` fixes the convention that
 *  early pulls and `fieldOf()` calls negative degrees left field, so for a
 *  right-hander the barrel has to sweep on toward the PITCHER after contact.
 *  Every version of this file swept it toward the catcher instead. The
 *  animation showed a swing that could not have produced the hits the engine
 *  was scoring.
 *
 *  AND THE ONE THAT KILLED THE MODEL — a single rotation about a fixed pivot
 *  CANNOT have both a high cocked load and a high wrapped finish. Go one way
 *  round and you get the load and a finish in the dirt; go the other and you
 *  get the finish and a load pointing at the ground. There is no set of three
 *  angles that is a baseball swing, which is why retuning kept producing
 *  something wrong in a new way. Real swings escape this because the HANDS
 *  TRAVEL and the rotation is not planar — neither of which a fixed pivot can
 *  express.
 *
 * ------------------------------------------------------------------ the model
 *
 * So the swing is POSES now, which is how NES baseball actually did it: a
 * handful of drawn positions that CUT from one to the next. Each pose carries
 * its own hand position, its own bat angle and its own apparent bat length, so
 * the hands travel, the bat foreshortens, and no pose has to be reachable from
 * the last one by rotating about anything.
 *
 * THE ANGLES ARE NOT A CONTINUOUS ROTATION AND ARE NOT MEANT TO BE. Read down
 * the table and the bat goes up, drops into the plane, sweeps level, extends,
 * then wraps — and the raw angle numbers jump. That is the point. Sprite
 * animation cuts; only a vector tween has to be continuous, and being
 * continuous is exactly what made the old one impossible to pose.
 *
 * ---------------------------------------------------------------- what holds
 *
 * ONE INVARIANT SURVIVES ALL OF IT: the pose at `t === 1` is drawn in the frame
 * main.ts grades, and its barrel must sit on the strike zone. That is FAULT 5's
 * rule — the picture and the verdict are one event — and swing.test.ts holds it
 * whatever anybody does to the numbers below.
 *
 * ------------------------------------------------------------------- tuning
 *
 * This is DATA. Move a number, reload, look at it — `__swingGhosts()` in the
 * dev console draws every pose at once. Nothing here is derived from anything
 * else, so there is no formula to keep consistent and no second place to edit.
 */

/**
 * THE GEOMETRY OF THE BOX, as offsets from the plate.
 *
 * These lived in main.ts as absolute canvas numbers, which meant the one thing
 * most worth testing — is the barrel actually over the strike zone when the
 * swing is graded — could not be tested at all, because reaching it required
 * `canvas.width` and therefore a DOM. Expressed as offsets they are pure data,
 * main.ts adds the plate's position back, and swing.test.ts checks the
 * invariant directly.
 *
 * X is measured from the plate's centre line, Y from the plate, both in canvas
 * units, and all of it in RIGHT-HANDED-BATTER coordinates. A left-hander is
 * this mirrored by the canvas transform at the draw site, so there is exactly
 * one swing in the codebase rather than two to keep in step.
 */
export const BATTER_DX = -96;
export const BAT_LEN = 96;

/** The strike zone, same convention. It is 110 wide and 96 tall. */
export const ZONE_DY = -48;
export const ZONE_HALF_W = 55;
export const ZONE_HALF_H = 48;

export interface BatPose {
  /** Name, for the dev overlay and for reading the table. */
  name: string;
  /**
   * When this pose starts, in units of the swing.
   *
   *   0     the press
   *   1     CONTACT — the frame that gets graded
   *   >1    into the follow-through, in units of FOLLOW_THROUGH_MS
   *
   * A pose is held until the next one starts. Nothing is interpolated.
   */
  t: number;
  /** Hands, offset from the plate. These TRAVEL — that is half the point. */
  hx: number;
  hy: number;
  /** Barrel direction from the hands, radians, canvas convention (+y is down). */
  angle: number;
  /**
   * How long the bat LOOKS in this pose, in canvas units.
   *
   * A bat pointing away from the camera is drawn short. That is the
   * foreshortening, authored per pose rather than computed from one squash
   * factor — which is what lets the load read as cocked back toward the
   * backstop instead of as a bat lying flat.
   */
  len: number;
  /** How far the body has opened up, radians. 0 at the load. */
  turn: number;
}

const deg = (d: number): number => (d * Math.PI) / 180;

/**
 * THE SWING. Five keyframes, and the whole animation.
 *
 * ⚠️ THE HANDS ARE IN FRONT OF HIM, and that is a correction. They used to sit
 * at hx −84, which is the batter's own BACK edge — his body runs −96 to −70 —
 * so he was holding the bat behind himself. Zane: "batter hold bat in front of
 * them, not behind them." Every hand position here is now forward of his
 * torso, which is where a hitter's hands actually are and, just as important,
 * where they can be SEEN.
 *
 * Barrel positions that fall out of the numbers, so the shape is readable
 * without doing the trigonometry yourself:
 *
 *   LOAD     (-76, -135)   bat up in front of the back shoulder, near vertical
 *   COIL     (-123, -52)   tipped back into the swing plane, barrel lagging
 *   CONTACT  (   3,  -47)  through the middle of the zone  <-- GRADED HERE
 *   THROUGH  (  44,  -51)  arms extended, barrel past the plate
 *   FINISH   ( -88, -115)  wrapped up high over the front shoulder
 *
 * COIL → CONTACT → THROUGH is 167px of travel at a near-constant height. That
 * is the level swing, and it is level because it was drawn level rather than
 * because a squash factor made a circle look flat.
 *
 * The barrel does pass behind him at the coil, because that is where a lagging
 * barrel physically is — you cannot have a level swing whose barrel is never
 * behind the hitter. What changed is that the HANDS never are, and the bat is
 * always drawn OVER the body rather than under it, so nothing is hidden.
 *
 * TIMING IS THE ACCELERATION. The gap from load to coil is 0.70 of the swing
 * and coil to contact is 0.30, so the bat covers most of its arc in the last
 * third and is moving fastest through the ball. That is what the old t² curve
 * bought, expressed as keyframe spacing instead of as an easing function.
 */
export const BAT_POSES: readonly BatPose[] = [
  { name: 'load',    t: 0,    hx: -64, hy: -70, angle: deg(-100), len: 66, turn: 0 },
  { name: 'coil',    t: 0.7,  hx: -66, hy: -62, angle: deg(170),  len: 58, turn: deg(3) },
  { name: 'contact', t: 1,    hx: -58, hy: -56, angle: deg(8),    len: 62, turn: deg(14) },
  { name: 'through', t: 1.25, hx: -48, hy: -54, angle: deg(2),    len: 92, turn: deg(20) },
  { name: 'finish',  t: 1.7,  hx: -56, hy: -60, angle: deg(-120), len: 64, turn: deg(24) },
];

/** The pose at rest, between pitches. */
export const REST_POSE: BatPose = BAT_POSES[0]!;

/**
 * The pose that must land on the zone.
 *
 * Found by its `t`, not by an index, so inserting a pose before it cannot
 * silently move which one gets graded.
 */
export const CONTACT_POSE: BatPose = BAT_POSES.find((p) => p.t === 1)!;

/** Where a pose puts the barrel, relative to the plate. */
export function barrelOf(pose: BatPose): { x: number; y: number } {
  return {
    x: pose.hx + Math.cos(pose.angle) * pose.len,
    y: pose.hy + Math.sin(pose.angle) * pose.len,
  };
}

/**
 * Pose time to milliseconds. Before contact it is a fraction of this batter's
 * travel; after it, a fraction of the follow-through.
 *
 * That split is what lets bat speed stretch the approach without stretching
 * the follow-through — a heavy bat takes longer to ARRIVE, it does not take
 * longer to finish, and scaling both would make slow hitters look like they
 * were swinging underwater.
 */
export function poseTimeMs(t: number, travel = SWING_TRAVEL_MS): number {
  return t <= 1 ? t * travel : travel + (t - 1) * FOLLOW_THROUGH_MS;
}

/**
 * Shortest way round from one angle to another.
 *
 * Load is −100° and coil is +170°; interpolated naively that is a 270° trip
 * forward through the plate, which draws the bat swinging out and then back.
 * The short way is 90° backwards — the barrel tipping back over his shoulder,
 * which is the motion that is actually happening.
 */
function lerpAngle(a: number, b: number, k: number): number {
  const TAU = Math.PI * 2;
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * k;
}

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

/**
 * The bat `sinceMs` after the press, INTERPOLATED between keyframes.
 *
 * ⚠️ IT USED TO SNAP, and snapping is what Zane meant by "batting isn't fluid
 * like it should be." Five hard cuts across 340ms is five discrete images, and
 * the eye reads that as a slideshow rather than a swing.
 *
 * Poses stay the authoring model — hands travel, each position is drawn rather
 * than derived, and that is what let the load and the finish both be high. But
 * they are KEYFRAMES now, not frames. Position is continuous, so the bat never
 * stops; only its velocity changes, and it changes where a real swing's does.
 *
 * NO EASING INSIDE A SEGMENT, deliberately. Smoothstep would bring the bat to
 * a halt at every keyframe, which is the stutter again wearing a nicer curve.
 * The acceleration comes from keyframe SPACING instead — see the timing note
 * on BAT_POSES.
 *
 * Linear interpolation hits its endpoints exactly, so at `t === 1` this returns
 * the contact pose unchanged and the graded frame is still the drawn frame.
 */
export function poseAt(sinceMs: number, travel = SWING_TRAVEL_MS): BatPose {
  const first = BAT_POSES[0]!;
  if (sinceMs <= 0) return first;

  for (let i = 0; i < BAT_POSES.length - 1; i++) {
    const a = BAT_POSES[i]!;
    const b = BAT_POSES[i + 1]!;
    const t0 = poseTimeMs(a.t, travel);
    const t1 = poseTimeMs(b.t, travel);
    if (sinceMs >= t1) continue;

    const k = t1 > t0 ? (sinceMs - t0) / (t1 - t0) : 0;
    return {
      name: k < 0.5 ? a.name : b.name,
      t: lerp(a.t, b.t, k),
      hx: lerp(a.hx, b.hx, k),
      hy: lerp(a.hy, b.hy, k),
      angle: lerpAngle(a.angle, b.angle, k),
      len: lerp(a.len, b.len, k),
      turn: lerp(a.turn, b.turn, k),
    };
  }

  return BAT_POSES[BAT_POSES.length - 1]!;
}

/** True while the bat is still moving. After this it is back at rest. */
export function isSwinging(sinceMs: number, travel = SWING_TRAVEL_MS): boolean {
  return sinceMs >= 0 && sinceMs < travel + FOLLOW_THROUGH_MS;
}

/**
 * THE CHECK SWING — how much of the bat's travel you can still take back.
 *
 * R.B.I. Baseball let you stop the bat dead wherever it was on the swing path;
 * tap it over the plate and you had bunted. The structure that needs was
 * already here and unused: the press starts the bat and the barrel does not
 * arrive for `travelMs()`, and that gap was dead time the player could not act
 * in. A second press inside this fraction of it pulls the bat back.
 *
 * The consequence needs no new rule — a checked swing is a TAKE, and `inZone`
 * already decides ball or called strike.
 *
 * WHY A FRACTION AND NOT A FIXED WINDOW. Scaled to the bat, a heavy bat gives
 * you longer to change your mind: 149ms of travel is ~89ms of second thoughts
 * against a quick bat's ~63ms. That is the first thing that has ever been
 * *good* about a slow bat, and a fixed window would throw it away.
 *
 * ponytail: one number and one predicate. A commit point that moved with the
 * count, the pitch or the stance is four more numbers to balance and nothing
 * to show for them yet.
 */
export const CHECK_WINDOW = 0.6;

/** Can this swing still be pulled back? `sinceMs` is time since the press. */
export function canCheck(sinceMs: number, travel = SWING_TRAVEL_MS): boolean {
  return sinceMs >= 0 && sinceMs < travel * CHECK_WINDOW;
}

/** How long the barrel takes to retreat once it is checked. Cosmetic. */
export const CHECK_PULL_MS = 90;
