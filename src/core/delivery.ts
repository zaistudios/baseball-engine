/**
 * THE DELIVERY — grading the moment you let go of the ball.
 *
 * ⚠️ WHY THIS FILE EXISTS. Batting is a physical act with a duration behind it:
 * the press starts the bat, the barrel arrives `swingTravel` later, and the
 * ARRIVAL is what gets graded — see web/swing.ts and core/timing.ts. Pitching
 * was a menu. You picked a type, picked a spot, pressed a key, and the arm
 * rolled pitchToSpot() against its own command with nothing of yours in it.
 * Half the game was a dropdown, and no pitch you threw could be thrown well or
 * badly.
 *
 * This is the other half of the timing model and it is deliberately the same
 * shape: a press starts the delivery, a LATER moment is the release, and the
 * distance from the release point is a signed number of milliseconds graded
 * against windows. Nothing new is invented downstream — the grade comes out as
 * a multiplier on `control`, which is the argument pitchToSpot() has always
 * taken and which main.ts was already feeding fatigue through.
 *
 * ⚠️ GOOD IS EXACTLY 1.0, AND THAT IS THE INVARIANT THIS FILE IS BUILT ON.
 * Every arm in the headless sim throws at control = 1, so a competent release
 * has to land there precisely, or your copy of an arm is a different arm from
 * the league's copy of it and every number scripts/balance.ts prints describes
 * a game nobody plays. PERFECT is a reward above the league, the two loose
 * grades are a cost below it, and the middle of the curve is where the sim
 * already lives. A mound mechanic that was a flat buff would not be a mechanic,
 * it would be a difficulty setting with a meter drawn on it.
 *
 * ⚠️ THE WINDOWS SCALE BY THE SIGNATURE AND POINTEDLY NOT BY zoneRate.
 * pitcher.ts is explicit that zoneRate is WILLINGNESS rather than precision and
 * that reading it as command hands the worst control in the league to your best
 * arm — going to the closer would make your pitches wilder. The thing on the
 * card that does mean precision is COMMAND[signature], which is already
 * exported and already multiplies the same roll, so the painter gets a wider
 * release window and the knuckleballer a narrower one off ONE table.
 *
 * ⚠️ THE DIFFICULTY ASSIST APPLIES TO YOU AND NEVER TO THE COMPUTER, which is
 * difficulty.ts's rule and it is kept STRUCTURALLY here rather than by care:
 * watch mode never grades a release at all. autoStep() throws at 'good'
 * directly, so there is no path on which a wider window could reach the
 * opposition.
 *
 * ponytail: one press, one number, one multiplier into a function that already
 * took one. No wind-up stages, no arm slot, no power-then-accuracy double
 * meter, no per-delivery stamina drain. Fatigue stays exactly where it already
 * was — main.ts multiplies ZONE_FATIGUE_PENALTY on top of this — because two
 * independent things multiplying is precisely what `control` is for.
 */

/**
 * SIGN CONVENTION — the same one core/timing.ts states for the swing, and it
 * is the same one on purpose: two graded presses in one game that disagreed
 * about which way is early would be a bug waiting for whoever reads them next.
 *
 *   offsetMs < 0  ->  released EARLY (you let go before the release point)
 *   offsetMs > 0  ->  released LATE
 *   offsetMs = 0  ->  on it
 */
export type ReleaseGrade = 'perfect' | 'good' | 'early' | 'late' | 'wild';

/**
 * How long the whole delivery runs, from the press that starts it to the arm
 * being empty whether you asked for it or not.
 *
 * ⚠️ IT MUST OUTLAST THE WIDEST LATE PRESS THAT STILL GRADES. The forced
 * release at the end of the sweep hands back 'wild'; if the sweep ended sooner
 * than gradeRelease()'s own outer window, a press this file would have called
 * 'late' would be cut off and called 'wild' instead — the picture and the
 * verdict disagreeing, which is the one thing the swing model refuses to do.
 *
 * ponytail: a constant with a stated ceiling rather than a value derived from
 * LEVELS and COMMAND. Deriving it means core/ importing game/difficulty.ts,
 * which is a layer inversion for one number. The ceiling is guarded by a test
 * instead, so widening a window or adding an easier level fails the check
 * rather than quietly clipping the tail.
 */
export const DELIVERY_MS = 1000;

/** Where in the sweep the ball should leave the hand. */
export const RELEASE_AT_MS = 700;

/**
 * BEFORE THIS, THE ARM HAS NOT COME FORWARD AND THERE IS NOTHING TO LET GO OF.
 * A press this early is not graded and does not throw the pitch; the sweep
 * simply carries on.
 *
 * ⚠️ IT IS NOT A MERCY, IT IS THE DOUBLE-TAP. Every player arrives at this
 * screen with "SPACE throws the pitch" in their hands — from the old build,
 * and from the batting half, where one press is the whole act. The first thing
 * they do is press it twice fast because nothing appeared to happen, and
 * without this that second press lands 40ms into the sweep, grades 'wild' and
 * costs a pitch. Every time, until they read the hint.
 *
 * It gives up nothing. This region is inside 'wild' at every command and every
 * difficulty — see the test, which holds ARM_MS below the earliest press that
 * could still have graded as anything else — so no release a player might
 * actually have meant is being swallowed here.
 */
export const ARM_MS = 200;

/**
 * Milliseconds from the release point, for a 1.0-command arm on VETERAN.
 *
 * Wider than the bat's ±12/±35/±80, and they should be: a swing is a reaction
 * to a ball you have not seen the whole flight of, and this is a marker
 * crossing a band you can watch the whole way. The skill here is repeating a
 * motion, not reading one — so the windows are set where a person who is
 * actually watching lands most of the time, and PERFECT is the one that asks
 * for something.
 */
export const RELEASE_WINDOWS_MS = {
  perfect: 25,
  good: 70,
  loose: 130,
} as const;

export type ReleaseWindow = keyof typeof RELEASE_WINDOWS_MS;

/** A multiplier that cannot make a window zero, negative or NaN wide. */
const positive = (n: number): number => (Number.isFinite(n) && n > 0 ? n : 1);

/**
 * ONE FUNCTION FOR THE VERDICT AND FOR THE PICTURE.
 *
 * ⚠️ THE RENDERER CALLS THIS TOO. main.ts draws the target band off this exact
 * function, so the band you are aiming at is the band you are graded against,
 * at whatever the arm and the difficulty have scaled it to. A meter drawn from
 * its own constants is a meter that lies the first time either one moves — and
 * the swing model's whole FAULT 5 note is about the picture and the verdict
 * being one event rather than two.
 *
 * @param command  the arm's COMMAND[signature]; >1 widens every window
 * @param assist   the difficulty level's assist; >1 widens every window
 */
export const releaseWindowMs = (kind: ReleaseWindow, command = 1, assist = 1): number =>
  RELEASE_WINDOWS_MS[kind] * positive(command) * positive(assist);

/**
 * Grade a release. Pure, synchronous, no engine underneath it — the same
 * contract grade() keeps for the swing.
 *
 * @param offsetMs signed milliseconds, negative early / positive late
 */
export function gradeRelease(offsetMs: number, command = 1, assist = 1): ReleaseGrade {
  // A non-finite offset means the clock, not the pitcher. It cannot be graded
  // as anything, and 'wild' is the only grade that does not reward it.
  if (!Number.isFinite(offsetMs)) return 'wild';

  const magnitude = Math.abs(offsetMs);
  if (magnitude <= releaseWindowMs('perfect', command, assist)) return 'perfect';
  if (magnitude <= releaseWindowMs('good', command, assist)) return 'good';
  if (magnitude <= releaseWindowMs('loose', command, assist)) {
    return offsetMs < 0 ? 'early' : 'late';
  }
  return 'wild';
}

/**
 * WHAT THE RELEASE IS WORTH, as pitchToSpot()'s `control` multiplier.
 *
 * ⚠️ `good: 1` IS LOAD-BEARING — see the header. Changing it re-tunes every
 * pitch a human has ever thrown against a league that did not move.
 *
 * The spread either side is deliberately not symmetric. PERFECT buys 15%,
 * which on a corner call is 0.72 → 0.83 and on the middle 0.92 → capped: real
 * but not a different pitcher. WILD costs 45%, which is the pitch that gets
 * away, and it has to hurt or "press something, anything" would be a strategy.
 */
export const RELEASE_CONTROL: Record<ReleaseGrade, number> = {
  perfect: 1.15,
  good: 1,
  early: 0.82,
  late: 0.82,
  wild: 0.55,
};

export const controlOf = (g: ReleaseGrade): number => RELEASE_CONTROL[g];

/**
 * What the screen calls it.
 *
 * ⚠️ NEUTRAL ABOUT WHERE THE BALL WENT, and that is not squeamishness. A real
 * early release sails and a late one buries, but pitchToSpot() models a miss as
 * a magnitude with no direction in it — so a label that said "up" or "down"
 * would be the game narrating a rule it does not have. These name the PRESS,
 * which is the only thing this file actually measured.
 */
export const RELEASE_LABEL: Record<ReleaseGrade, string> = {
  perfect: 'PAINTED',
  good: 'ON THE SPOT',
  early: 'RUSHED',
  late: 'DRAGGED',
  wild: 'WILD',
};

/** The short form, for a column in the pitch chart. */
export const RELEASE_SHORT: Record<ReleaseGrade, string> = {
  perfect: 'painted',
  good: 'on the spot',
  early: 'rushed',
  late: 'dragged',
  wild: 'wild',
};
