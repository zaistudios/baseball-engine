/**
 * Swing timing. This is the file the whole stack decision was made over.
 *
 * The Godot prototype's timing carried three compounding faults, all of them
 * living in the seam between a collision callback, scene timer awaits, and
 * HitCalculator. Here that seam does not exist: grade() is a pure function of
 * one number, so all three faults are testable in one line.
 *
 * The faults, and what replaces them:
 *
 *  1. EARLY AND LATE WERE INVERTED.
 *     playercontroller.gd computed `timing_difference = swing_duration - 0.2`,
 *     where swing_duration ran from swing start to bat/ball collision. Swinging
 *     early means the ball arrives LATER in the swing window, so swing_duration
 *     grows and timing_difference goes POSITIVE. HitCalculator then read
 *     `is_early = swing_timing < 0` and labelled every early swing "late".
 *     Fix: offsetMs is measured directly against ball arrival, sign convention
 *     stated below and locked by test.
 *
 *  2. THE PERFECT WINDOW WAS NARROWER THAN THE INSTRUMENT SAMPLING IT.
 *     PERFECT_WINDOW was +/-0.005s = 5ms, but contact was detected on the
 *     physics tick, which at 60Hz quantises to ~16.67ms. A 5ms window is
 *     smaller than one tick, so "perfect" was near unreachable by construction.
 *     Fix: timestamps off pointerdown's event.timeStamp resolve well under 1ms,
 *     and the windows below were re-tuned rather than ported (see hub
 *     decision 3 - the old numbers were set against an instrument that could
 *     not resolve them, so they are not a settled starting point).
 *
 *  3. A "MISS" GRADE WITH NO OUTCOME TABLE BEHIND IT - A GUARANTEED CRASH.
 *     get_timing_quality_with_contact() could return "miss", but
 *     hit_outcome_tables has no "miss" key, so calculate_hit() did an invalid
 *     dictionary index the moment it happened. The bat hitbox was live from
 *     0.15s to 0.35s after swing start against a 0.2s target, so contact after
 *     0.26s crashed - roughly 45% of the contact window.
 *     Fix: 'miss' is a member of the TimingGrade union, so the outcome tables
 *     are a Record over that union and tsc refuses to compile a table that
 *     omits it. This is the class of bug the stack was chosen to make
 *     structurally impossible.
 */

/**
 * SIGN CONVENTION - the whole file depends on this and nothing may restate it.
 *
 *   offsetMs < 0  ->  swung EARLY  (bat arrived before the ball)
 *   offsetMs > 0  ->  swung LATE   (bat arrived after the ball)
 *   offsetMs = 0  ->  dead on
 */
export type TimingGrade = 'perfect' | 'good' | 'early' | 'late' | 'miss';

/**
 * Provisional windows, in milliseconds from perfect.
 *
 * NOT the prototype's numbers. Those were +/-5ms perfect, +/-20ms good,
 * +/-60ms early/late, chosen against a 16.67ms instrument. Skilled human
 * timing on a telegraphed cue sits around +/-20-30ms, which made a 5ms
 * perfect window luck rather than skill.
 *
 * These need playtesting before anyone calls them settled.
 */
export const TIMING_WINDOWS_MS = {
  perfect: 12,
  good: 35,
  contact: 80,
} as const;

/**
 * Grade a swing. Pure, synchronous, no engine underneath it.
 *
 * ⚠️ CONTACT AND VISION ARE DIFFERENT STATS AND THEY SCALE DIFFERENT WINDOWS.
 * This is the split MLB The Show makes, and it is the reason both are worth
 * carrying:
 *
 *   CONTACT scales ALL THREE windows. It is how well you square one up — 1.3
 *   contact turns off-balance swings into good ones and good ones into
 *   barrels.
 *
 *   VISION scales ONLY THE OUTER ONE. It is how often you get the bat on it at
 *   all. High vision does not barrel more balls; it stops you MISSING them,
 *   and a ball fouled off is an at-bat still alive. That is the Ichiro-shaped
 *   hitter contact alone cannot describe, and it is why vision is not just
 *   "contact by another name".
 *
 * @param offsetMs  signed milliseconds, negative early / positive late
 * @param contact   contact stat; >1 widens every window proportionally
 * @param vision    plate vision; >1 widens ONLY the whiff boundary
 */
export function grade(offsetMs: number, contact = 1.0, vision = 1.0): TimingGrade {
  if (!Number.isFinite(offsetMs)) return 'miss';

  const scale = contact > 0 ? contact : 1.0;
  const eyes = vision > 0 ? vision : 1.0;
  const magnitude = Math.abs(offsetMs);

  if (magnitude <= TIMING_WINDOWS_MS.perfect * scale) return 'perfect';
  if (magnitude <= TIMING_WINDOWS_MS.good * scale) return 'good';
  if (magnitude <= TIMING_WINDOWS_MS.contact * scale * eyes) {
    return offsetMs < 0 ? 'early' : 'late';
  }
  return 'miss';
}

/**
 * Timestamp-based offset. Hub decision 3.
 *
 * Both arguments must come from the SAME continuous clock - read the swing off
 * pointerdown's event.timeStamp and compute arrival from the pitch's launch
 * timestamp plus its flight time. Never frame counts, never collision
 * callbacks. Trivial on day one, miserable to retrofit; the prototype is the
 * standing proof of what skipping it costs.
 */
export function computeOffsetMs(swingAtMs: number, ballArrivesAtMs: number): number {
  return swingAtMs - ballArrivesAtMs;
}

/** Release point to the plate. Real release is ~5ft in front of the 60.5ft rubber. */
export const PITCH_DISTANCE_FT = 55;

/**
 * The other half of the clock rule: when the ball reaches the plate, on the
 * same clock the swing is read off. Feed the launch timestamp in, feed the
 * result to computeOffsetMs.
 *
 * ponytail: straight line at constant speed. Break and drop are a renderer
 * concern until a pitch actually needs to arrive later than it looks.
 */
export function ballArrivalMs(launchAtMs: number, speedMph: number): number {
  return launchAtMs + (PITCH_DISTANCE_FT / (speedMph * 1.467)) * 1000;
}

/** True when the swing made contact at all (anything but a whiff). */
export function isContact(g: TimingGrade): boolean {
  return g !== 'miss';
}

/**
 * FAULT 4 - THE CLOCK IS HONEST AND THE DISPLAY IS NOT.
 *
 * Everything above grades against ball arrival on the computation clock.
 * The player does not react to the computation clock. They react to photons,
 * which leave the display one or more frames after the frame that drew them:
 * main.ts stamps launchMs at the top of a rAF callback, and that image is
 * drawn, composited, and presented some time later.
 *
 * So a player who swings perfectly, by their own eyes, is measured LATE by
 * however long that pipeline takes - typically 30-80ms, against a 35ms 'good'
 * window. That is the whole of the "batting is too hard and the windows are
 * not accurate" playtest verdict, and it is an accuracy bug, not a difficulty
 * one. Widening the windows on top of it would have hidden it.
 *
 * The latency cannot be computed. It belongs to a monitor nobody here can see.
 * But it can be MEASURED, since every swing already reports its own offset,
 * and a player's systematic bias is exactly the number we want to cancel.
 *
 * Median, not mean: one wild swing at a pitch already given up on is a 400ms
 * outlier, and a mean would let it move the calibration. A median will not.
 *
 * @param samples raw offsets, measured against UNCORRECTED arrival
 * @returns ms to add to arrival before grading, clamped to +/-120
 */
export const MAX_CALIBRATION_MS = 120;

export function medianOffset(samples: readonly number[]): number {
  const usable = samples.filter(Number.isFinite);
  if (usable.length === 0) return 0;

  const sorted = [...usable].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;

  // A garbage sample set must not be able to make the game unplayable.
  return Math.max(-MAX_CALIBRATION_MS, Math.min(MAX_CALIBRATION_MS, median));
}
