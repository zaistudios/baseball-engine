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
import type { PitchType } from './hitTables.ts';


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
 * ⚠️ THE TWO NUMBERS ABOVE ARE THE DEFAULT, NOT THE ONLY ANSWER ANY MORE.
 *
 * WHY. Every pitch in the game asked for the identical press — 700ms into a
 * 1000ms sweep — whichever of the six you called. So the one decision the
 * mound actually offers, WHAT TO THROW, had no effect whatever on the act of
 * throwing it: six buttons, one motion, and after an inning your hands stop
 * reading the bar at all because they already know where the line is. That is
 * the repetition, and it is not a lack of feedback, it is a lack of anything
 * to feel.
 *
 * WHAT REPLACES IT. A pitch is an arm action, and arm actions differ. The
 * fastball is quick and lets go early; the curveball is a long slow wind you
 * have to wait out; the changeup has to be held past where the fastball went.
 * So the tempo comes off the pitch, and MIXING pitches costs you your rhythm —
 * which is the thing that makes a mixed sequence a real decision rather than a
 * dropdown, and the thing a repeated fastball now deliberately does not cost.
 *
 * ⚠️ IT IS STILL ONE PRESS. The ponytail note at the top of this file rules out
 * wind-up stages, arm slots and double meters, and none of them are here — this
 * is the same single graded press against different geometry.
 *
 * ⚠️ `scale` NARROWS OR WIDENS THE WINDOWS AND IS THE TRADEOFF. The pitches
 * that are hardest to command are the ones with the best tables behind them, so
 * calling the curveball is a bet rather than a free upgrade. It multiplies the
 * SAME windows COMMAND and the difficulty assist already multiply — there is no
 * second grading path, and RELEASE_CONTROL is untouched, so `good` is still
 * exactly 1.0 and the league your copy of an arm belongs to has not moved.
 *
 * ⚠️ THIS ONLY EVER REACHES A HUMAN ON THE MOUND. autoStep() throws at 'good'
 * directly and never grades a release, so the headless sim and the computer's
 * half are byte-identical to before. Confirmed against scripts/balance.ts.
 *
 * ⚠️ EVERY ROW IS BOUND BY TWO INEQUALITIES, and delivery.test.ts checks all
 * six rather than the old pair of constants:
 *
 *   releaseAtMs + widest_loose <= sweepMs     the sweep outlasts a late press
 *   ARM_MS      + widest_loose <  releaseAtMs the dead region stays inside wild
 *
 * where widest_loose is 130 × 1.15 (painter) × 1.6 (rookie) × scale. Adding a
 * slower pitch or an easier level fails that test rather than silently clipping
 * a press the player meant.
 */
export interface Delivery {
  /** Press to empty hand. The forced 'wild' lands here. */
  sweepMs: number;
  /** Where in that sweep the ball should go. */
  releaseAtMs: number;
  /** Multiplies every release window. Below 1 is a harder pitch to repeat. */
  scale: number;
}

/**
 * ⚠️ THE RATIO release/sweep IS A DESIGN NUMBER, NOT A CONSEQUENCE — and the
 * first version of this table got it wrong by not thinking about it at all.
 *
 * The bar is one fixed width, so the release LINE is drawn at release/sweep
 * across it. v1 picked a sweep and a release per pitch that happened to scale
 * together, which put every ratio between 63.6% and 73.6%: playtested on the
 * real screen, that is 25px of travel on a 252px bar, and the line looked like
 * it was in the same place on all six. The only cue left was marker SPEED, so
 * the variety was there to feel and not to see.
 *
 * The spread is now 52.1% to 78.0% — 65px — so the target visibly walks right
 * as the pitches get slower, and the marker speed still varies underneath it.
 * Two cues, not one. Keep the spread when retuning: delivery.test.ts asserts it.
 */
export const DELIVERIES: Record<PitchType, Delivery> = {
  // Quick, early, and the most forgiving of the six. It is the pitch you go
  // back to when the rhythm is gone, which is what a fastball is for.
  fastball: { sweepMs: 960, releaseAtMs: 500, scale: 1.1 },
  // The fastball's cousin, a touch longer through the bottom.
  sinker: { sweepMs: 980, releaseAtMs: 560, scale: 1.05 },
  // Middle tempo, and the first one that asks for something.
  slider: { sweepMs: 1000, releaseAtMs: 640, scale: 0.95 },
  // ⚠️ HELD PAST WHERE THE FASTBALL WENT, which is the whole pitch. Coming to
  // it straight off a fastball is a 270ms difference in when to let go, and
  // that mis-press is the changeup's own deception turned on the man throwing it.
  changeup: { sweepMs: 1110, releaseAtMs: 830, scale: 0.92 },
  // The long slow wind. Latest release in the game and you have to wait it out.
  curveball: { sweepMs: 1180, releaseAtMs: 920, scale: 0.9 },
  // Nobody repeats a knuckleball, including you. Ordinary tempo, narrowest
  // window — this is the per-PITCH half of what COMMAND.knuckler already says
  // about the per-ARM half.
  knuckleball: { sweepMs: 1000, releaseAtMs: 700, scale: 0.8 },
};

/**
 * The delivery for a pitch, or the neutral default when nobody said which.
 *
 * The fallback is the old pair of constants exactly, so any caller that has not
 * been told about pitch types keeps the behaviour it was written against.
 */
export const deliveryOf = (type?: PitchType): Delivery =>
  (type && DELIVERIES[type]) || { sweepMs: DELIVERY_MS, releaseAtMs: RELEASE_AT_MS, scale: 1 };

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
export const releaseWindowMs = (
  kind: ReleaseWindow,
  command = 1,
  assist = 1,
  /** The pitch's own difficulty — see DELIVERIES. 1 is the neutral default. */
  scale = 1,
): number => RELEASE_WINDOWS_MS[kind] * positive(command) * positive(assist) * positive(scale);

/**
 * Grade a release. Pure, synchronous, no engine underneath it — the same
 * contract grade() keeps for the swing.
 *
 * @param offsetMs signed milliseconds, negative early / positive late
 */
export function gradeRelease(offsetMs: number, command = 1, assist = 1, scale = 1): ReleaseGrade {
  // A non-finite offset means the clock, not the pitcher. It cannot be graded
  // as anything, and 'wild' is the only grade that does not reward it.
  if (!Number.isFinite(offsetMs)) return 'wild';

  const magnitude = Math.abs(offsetMs);
  if (magnitude <= releaseWindowMs('perfect', command, assist, scale)) return 'perfect';
  if (magnitude <= releaseWindowMs('good', command, assist, scale)) return 'good';
  if (magnitude <= releaseWindowMs('loose', command, assist, scale)) {
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

/**
 * WHAT THE TEMPO IS CALLED ON SCREEN, for the pitch buttons and the bar.
 *
 * ⚠️ DERIVED FROM THE RELEASE POINT RATHER THAN A SECOND TABLE. A hand-written
 * word per pitch is a thing that goes quietly wrong the first time somebody
 * retunes a number above it and does not scroll down — the same failure the
 * release band had before it was drawn off releaseWindowMs(). Retune a row and
 * the word follows it.
 */
export const tempoWord = (type: PitchType): string => {
  const r = DELIVERIES[type].releaseAtMs;
  return r <= 600 ? 'quick' : r <= 700 ? 'even' : r <= 850 ? 'slow' : 'long';
};
