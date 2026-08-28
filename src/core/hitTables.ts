/**
 * The salvage. Ported verbatim from HitCalculator.gd - pure data and rules,
 * which is why it survived the engine change intact.
 *
 * Hub first-move #3: port the tables, do NOT port the +/-0.005s window numbers
 * as settled. The windows live in timing.ts and were re-tuned; these
 * probabilities are unchanged from the prototype.
 *
 * The structural fix is the type, not the numbers. OUTCOME_TABLES is a
 * Record over TimingGrade, and TimingGrade includes 'miss'. The GDScript
 * dictionary had no "miss" key and crashed the moment the grader returned one.
 * Here, deleting the 'miss' row is a compile error.
 *
 * ✅ THE HOME RUN CONFLICT IS SETTLED — 2026-08-20, Zane's call, the GDD wins.
 *
 * It stood open for the whole project: GDD v4.0 asks for a 15-20% home run
 * rate on a perfectly-timed swing; the ported tables gave 4%, which is honest
 * real baseball. The decision is that this is an ARCADE batting game and the
 * reward for nailing the timing has to feel enormous. A perfect fastball at
 * power 1.0 now leaves the yard **19%** of the time.
 *
 * The rate still reads off the power curve, so it is a range rather than one
 * number: 6.7% at power 0.65, 19% at 1.00, 39.6% at 1.50. See the note on the
 * perfect row for how the room was made without moving the out rate.
 */

import type { TimingGrade } from './timing.ts';

export type PitchType =
  | 'fastball'
  | 'curveball'
  | 'changeup'
  | 'slider'
  | 'knuckleball'
  /**
   * The sixth, added 2026-08-20. Its whole identity is that it gets hit into
   * the GROUND: squared up it is a single or a grounder far more often than it
   * is a home run, where a squared-up fastball leaves the yard 19% of the
   * time. Its rows were derived from the fastball's by a documented multiplier
   * and re-normalised, never hand-typed — see scripts/sinker in the session
   * notes. Every row sums to 1, which rollOutcome() depends on.
   */
  | 'sinker';

export type Outcome =
  | 'strikeout'
  | 'popup'
  | 'ground_out'
  | 'line_out'
  | 'foul'
  | 'single'
  | 'double'
  | 'triple'
  | 'home_run';

export type OutcomeTable = Record<Outcome, number>;

const OUTS: ReadonlySet<Outcome> = new Set<Outcome>([
  'strikeout',
  'popup',
  'ground_out',
  'line_out',
]);

const HITS: ReadonlySet<Outcome> = new Set<Outcome>([
  'single',
  'double',
  'triple',
  'home_run',
]);

export const isOut = (o: Outcome): boolean => OUTS.has(o);
export const isHit = (o: Outcome): boolean => HITS.has(o);

/** Every table lists all nine outcomes explicitly, including the zeroes. */
const t = (
  strikeout: number,
  popup: number,
  ground_out: number,
  line_out: number,
  foul: number,
  single: number,
  double: number,
  triple: number,
  home_run: number,
): OutcomeTable => ({
  strikeout,
  popup,
  ground_out,
  line_out,
  foul,
  single,
  double,
  triple,
  home_run,
});

export const OUTCOME_TABLES: Record<TimingGrade, Record<PitchType, OutcomeTable>> = {
  //          K     PU    GO    LO    F     1B    2B    3B    HR
  //
  // ⚠️ THE HOME RUN RATE WAS RAISED TO THE DESIGN DOC'S NUMBER ON 2026-08-20.
  //
  // The long-standing conflict, finally decided by Zane: the GDD asks for
  // **15-20% home runs on a perfectly-timed swing**, and the ported tables gave
  // ~4%. Four percent is honest real baseball and the port was faithful to the
  // prototype's code, which is why it stood for so long — but this is an
  // arcade batting game, and the whole reward curve is built on nailing the
  // timing feeling enormous. Squaring one up now leaves the yard.
  //
  // HOW THE ROOM WAS MADE, and it matters: the increase is taken from the
  // OTHER HIT OUTCOMES in proportion — never from the outs. So the out rate is
  // untouched, batting average is untouched, and only the SHAPE of the hits
  // changes: a ball that used to be a double now sometimes clears the fence.
  // Taking it from the outs would have raised the hit rate as well and put the
  // run environment somewhere nobody chose.
  //
  // `good` gets a small share too, because a zero there meant a well-struck
  // ball with slightly-off timing could NEVER leave the park, which is not a
  // thing anyone has ever seen at a ballgame.
  //
  // Regenerate with `node scripts/hrtable.ts` after changing the targets there;
  // it asserts every row still sums to 1, which rollOutcome() depends on.
  perfect: {
    fastball: t(0, 0.05, 0.08, 0.07, 0.05, 0.355, 0.158, 0.047, 0.19),
    sinker: t(0, 0.033, 0.17, 0.072, 0.061, 0.432, 0.134, 0.029, 0.069),
    curveball: t(0, 0.08, 0.1, 0.08, 0.06, 0.386, 0.12, 0.024, 0.15),
    changeup: t(0, 0.06, 0.09, 0.07, 0.05, 0.423, 0.153, 0.034, 0.12),
    slider: t(0, 0.07, 0.1, 0.08, 0.06, 0.362, 0.126, 0.032, 0.17),
    knuckleball: t(0, 0.14, 0.12, 0.08, 0.18, 0.274, 0.061, 0.015, 0.13),
  },
  good: {
    fastball: t(0.05, 0.15, 0.25, 0.15, 0.15, 0.172, 0.034, 0.009, 0.035),
    sinker: t(0.047, 0.078, 0.414, 0.12, 0.142, 0.163, 0.022, 0.004, 0.01),
    curveball: t(0.08, 0.2, 0.3, 0.12, 0.15, 0.1, 0.025, 0, 0.025),
    changeup: t(0.06, 0.18, 0.28, 0.13, 0.15, 0.135, 0.036, 0.009, 0.02),
    slider: t(0.07, 0.18, 0.281, 0.13, 0.15, 0.126, 0.025, 0.008, 0.03),
    knuckleball: t(0.1, 0.24, 0.2, 0.08, 0.24, 0.094, 0.017, 0.009, 0.02),
  },
  early: {
    fastball: t(0.15, 0.25, 0.3, 0.0, 0.2, 0.08, 0.02, 0.0, 0.0),
    sinker: t(0.136, 0.124, 0.474, 0, 0.181, 0.072, 0.013, 0, 0),
    curveball: t(0.25, 0.3, 0.25, 0.0, 0.15, 0.05, 0.0, 0.0, 0.0),
    changeup: t(0.2, 0.35, 0.25, 0.0, 0.15, 0.05, 0.0, 0.0, 0.0),
    slider: t(0.22, 0.28, 0.27, 0.0, 0.16, 0.06, 0.01, 0.0, 0.0),
    knuckleball: t(0.28, 0.3, 0.16, 0.0, 0.22, 0.04, 0.0, 0.0, 0.0),
  },
  late: {
    fastball: t(0.2, 0.15, 0.35, 0.0, 0.2, 0.08, 0.02, 0.0, 0.0),
    sinker: t(0.168, 0.069, 0.516, 0, 0.168, 0.067, 0.012, 0, 0),
    curveball: t(0.15, 0.2, 0.3, 0.0, 0.25, 0.08, 0.02, 0.0, 0.0),
    changeup: t(0.1, 0.25, 0.35, 0.0, 0.2, 0.08, 0.02, 0.0, 0.0),
    slider: t(0.18, 0.18, 0.32, 0.0, 0.23, 0.07, 0.02, 0.0, 0.0),
    knuckleball: t(0.22, 0.22, 0.2, 0.0, 0.3, 0.05, 0.01, 0.0, 0.0),
  },
  // The row whose absence crashed the prototype. A whiff is a whiff.
  miss: {
    fastball: t(1.0, 0, 0, 0, 0, 0, 0, 0, 0),
    sinker: t(1.0, 0, 0, 0, 0, 0, 0, 0, 0),
    curveball: t(1.0, 0, 0, 0, 0, 0, 0, 0, 0),
    changeup: t(1.0, 0, 0, 0, 0, 0, 0, 0, 0),
    slider: t(1.0, 0, 0, 0, 0, 0, 0, 0, 0),
    knuckleball: t(1.0, 0, 0, 0, 0, 0, 0, 0, 0),
  },
};

export const ALL_OUTCOMES: readonly Outcome[] = [
  'strikeout',
  'popup',
  'ground_out',
  'line_out',
  'foul',
  'single',
  'double',
  'triple',
  'home_run',
];

export const ALL_PITCH_TYPES: readonly PitchType[] = [
  'fastball',
  'curveball',
  'changeup',
  'slider',
  'knuckleball',
  'sinker',
];
