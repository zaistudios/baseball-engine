/**
 * The game clock: performance.now() minus every millisecond spent behind a menu.
 *
 * Everything in this game is timed by TIMESTAMP rather than by frame count —
 * that is the decision the whole rebuild exists for, and it is the right one.
 * Its one cost is that a menu does not stop time on its own. The wall clock
 * runs on behind the pause screen, so the result screen expires, nextPitch()
 * fires, the windup completes, the ball arrives, and take() charges a strike,
 * all while the player is looking at a pause menu. The game plays itself.
 *
 * Throwing away the in-flight pitch at the moment of pausing only covered the
 * single pitch in the air. Everything after it kept going.
 *
 * One accumulator stops all of it, and keeps the simulation and the screen on
 * the same clock while doing it — which is the property that mattered. Nothing
 * in the game may read performance.now() directly; read gameNow() instead, and
 * put input timestamps through toGameTime() first.
 */

let pausedMs = 0;
let lastWall = performance.now();
/**
 * Whether the interval that is about to elapse is a paused one.
 *
 * The absorption has to LAG the flag by one tick. tickClock() measures the
 * interval that just ended, and the flag it is handed describes the one about
 * to start — so crediting the incoming flag to the outgoing interval loses the
 * whole final stretch of the pause on the frame the player hits Resume.
 */
let wasFrozen = false;

/** Now, on the clock the game actually runs on. */
export const gameNow = (): number => performance.now() - pausedMs;

/**
 * Advance the clock. Call once at the top of every frame, before anything
 * reads it. While `frozen`, this absorbs the frame's whole delta, so gameNow()
 * stops moving and every timestamp comparison downstream stays put.
 */
export function tickClock(frozen: boolean): void {
  const wall = performance.now();
  if (wasFrozen) pausedMs += wall - lastWall;
  lastWall = wall;
  wasFrozen = frozen;
}

/**
 * Put an input event's timeStamp on the game clock. Pointer and key events are
 * stamped against the page's time origin, so they need the same shift or a
 * swing after the first pause grades against a clock the ball is not on.
 */
export const toGameTime = (wallMs: number): number => wallMs - pausedMs;
