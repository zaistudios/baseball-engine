/**
 * WHAT IS ONE RATING POINT ACTUALLY WORTH? `node scripts/sensitivity.ts [games]`
 *
 * Take a club, move ONE rating across its whole roster, play it against the
 * untouched league, and read the difference back. Those numbers, normalised,
 * are the weights value.ts should carry.
 *
 * ⚠️ REWRITTEN 2026-08-25, AND THE OLD VERSION WAS NOT CONVERGING. It measured
 * WIN RATE for a bump on ONE club (New England), and then normalised every
 * weight by dividing through the biggest hitting delta. Three faults, and they
 * compounded:
 *
 *  1. A WIN IS ONE BIT PER GAME. Win rate is a Bernoulli outcome, so its
 *     standard error is about 2.3 points over a thousand games — against the
 *     two-to-four point deltas being measured. Two runs at different sample
 *     sizes disagreed about whether POWER or CONTACT is the biggest lever in
 *     the game, which is not a close call the data was entitled to make.
 *  2. ONE SUBJECT IS ONE ROSTER'S SHAPE. Bumping power on a club that already
 *     has the power measures something different from bumping it on a club
 *     that does not, and there is no way to tell that apart from signal.
 *  3. PINNING TO THE MAXIMUM PROPAGATES THE NOISIEST NUMBER INTO EVERY OTHER
 *     ONE. Whichever rating won by luck became the denominator for the whole
 *     table, so one noisy measurement moved all eleven weights at once.
 *
 * What replaces them, in the same order:
 *
 *  1. RUN DIFFERENTIAL, NOT WINS. Runs are continuous and there are eight or
 *     nine of them a game instead of one bit, so the same number of games buys
 *     several times the precision. It is also the more honest question — value.ts
 *     exists to RANK rosters, and run differential is what a ranking is made of.
 *     Win rate is still printed, because it is the number a human feels.
 *  2. SEVERAL SUBJECTS, AVERAGED. Five clubs spread across the middle of the
 *     ladder, so no single roster shape decides the answer, and the spread
 *     between them becomes part of the error bar instead of hiding inside it.
 *  3. A FIXED ANCHOR AND AN ERROR BAR. Weights are normalised against CONTACT,
 *     which is where value.ts's 1.6 already lives, so a noisy reading moves its
 *     own row and nobody else's. Every row prints a 95% interval, and the
 *     script says out loud which ratings it cannot distinguish from zero.
 *
 * ⚠️ READ THE INTERVAL BEFORE YOU COPY THE WEIGHT. A rating whose interval
 * spans zero has not been measured, it has been sampled. Raise the game count
 * or leave the weight alone; do not paste it in because it printed.
 *
 * ⚠️ FOURTH FAULT, FOUND 2026-08-29: THE STEP WAS THE SAME SIZE FOR EVERY
 * RATING, AND THAT SIZE WAS OFF THE END OF THE LEAGUE. It bumped every rating
 * by a flat +0.1. Measured against the clubs that actually exist, the
 * between-club standard deviation of a club's average is 0.023 for power,
 * 0.017 for contact, 0.013 for vision, and 0.006 for an arm's zone rate — so a
 * flat tenth was FOUR standard deviations of power, SIX of contact, and
 * SIXTEEN of zone rate. Two things went wrong and they pull in opposite
 * directions:
 *
 *   1. EVERY READING WAS TAKEN OUTSIDE THE LEAGUE. No club is four standard
 *      deviations better than average at anything, so the number came from a
 *      part of the response curve no roster occupies, where hit tables and
 *      thresholds have long since saturated.
 *   2. THE RATINGS WERE NOT COMPARED AT THE SAME PLACE. Bumping one rating 4σ
 *      and another 16σ and then printing the two side by side as if they were
 *      the same experiment is the fault this file's own header spends three
 *      paragraphs warning about, in a fourth costume. It is why zoneRate and
 *      stamina kept coming back "indistinguishable from zero": they were being
 *      read so far out that the curve had gone flat.
 *
 * So the step is now PER RATING, and it is a multiple of that rating's own
 * between-club spread — see SPREADS. The question the table answers becomes the
 * question value.ts actually asks: what is a club that is better than average
 * at this worth? The weight is then divided back down to per rating point,
 * which is the unit value.ts multiplies in.
 */
import { LEAGUE, type Team } from '../src/game/teams.ts';
import { simulateGame } from '../src/game/sim.ts';
import type { Player } from '../src/core/roster.ts';
import type { Pitcher } from '../src/core/pitcher.ts';

const N = Number(process.argv[2] ?? 16);

/**
 * HOW BIG A BUMP, IN BETWEEN-CLUB STANDARD DEVIATIONS OF THAT RATING.
 *
 * ⚠️ TWO, NOT ONE, AND IT IS A COMPROMISE BETWEEN TWO HONEST FAILURES. One
 * sigma is the most faithful bump — it is "a club a bit better than average at
 * this" — but the effect it produces is small enough that resolving it takes
 * about ten times the games, and every rating comes back inside its error bar
 * at any sample size a person will actually wait for. Two sigma is still a real
 * roster: it is roughly the gap between an average club and one of the best
 * three in the league at that rating, which is a difference a trade can
 * actually make. Anything past about three is back to measuring a club that
 * does not exist.
 */
const SPREADS = 2;

const meanOf = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const sdOf = (xs: readonly number[]): number => {
  const m = meanOf(xs);
  return Math.sqrt(meanOf(xs.map((x) => (x - m) ** 2)));
};

/**
 * Five clubs from the middle of the table. Not the best and not the worst:
 * a bump on a club that already wins 70% of its games runs into a ceiling, and
 * one on a club that wins 27% is measuring the floor.
 */
const SUBJECT_ABBRS = ['NEM', 'MIL', 'PIT', 'SEA', 'CIN'];

type BatKey = 'power' | 'contact' | 'vision' | 'clutch' | 'speed' | 'bunt';
type ArmKey = 'zoneRate' | 'break' | 'clutch' | 'stamina' | 'speedBonus';

const bumpBats = (t: Team, key: BatKey, by: number): Team => ({
  ...t,
  lineup: t.lineup.map((p): Player => ({ ...p, [key]: p[key] + by })),
});

/** What an arm reads at a rating today, with the engine's own default. */
const ARM_DEFAULT: Record<ArmKey, number> = {
  zoneRate: 0.55,
  break: 1,
  clutch: 1,
  stamina: 1,
  speedBonus: 0,
};

// ⚠️ THE WHOLE STAFF, ROTATION AND PEN. It moved only the rotation, which was
// the whole staff when it was written and is now half of one — a weight
// measured by bumping three of six arms would read about half of what the
// rating is actually worth, and value.ts prices all six.
//
// ⚠️ THE BUMP IS IN THE FIELD'S OWN UNITS AND IS NO LONGER RESCALED HERE. This
// used to multiply zoneRate's step by 0.5 and speedBonus's by 20 to paper over
// the fact that one is a share and one is miles an hour while the step was a
// flat tenth for everybody. Now that the step is that rating's own spread, the
// units come out right on their own and the fudge factors were a second,
// undocumented weighting sitting on top of the measurement.
const bumpArm = (a: Pitcher, key: ArmKey, by: number): Pitcher => {
  const v = (a[key] ?? ARM_DEFAULT[key]) + by;
  if (key === 'zoneRate') return { ...a, zoneRate: Math.max(0.2, Math.min(0.95, v)) };
  return { ...a, [key]: v };
};

const bumpArms = (t: Team, key: ArmKey, by: number): Team => ({
  ...t,
  rotation: t.rotation.map((a) => bumpArm(a, key, by)),
  bullpen: t.bullpen.map((a) => bumpArm(a, key, by)),
});

interface Sample {
  /** Mean run differential per game, from the subject's point of view. */
  mean: number;
  /** Variance of that per-game differential, for the error bar. */
  variance: number;
  n: number;
  winPct: number;
}

/**
 * Play the subject against every other club, home and away, and keep the
 * per-game run differential rather than just who won.
 *
 * ⚠️ THE SEEDS ARE SHARED BETWEEN THE BASELINE AND THE BUMPED RUN, deliberately.
 * The same seed means the same league, the same rotation order and the same
 * opening conditions, so the difference between the two runs is much closer to
 * being the rating and much less of it is the weather. It is not perfect —
 * changing a rating changes the first at-bat and the games diverge from there —
 * but it costs nothing and it removes the easiest half of the noise.
 */
function measure(subject: Team, seedBase: number): Sample {
  let sum = 0;
  let sumSq = 0;
  let wins = 0;
  let n = 0;

  const record = (diff: number, won: boolean): void => {
    sum += diff;
    sumSq += diff * diff;
    if (won) wins++;
    n++;
  };

  for (const other of LEAGUE) {
    if (other.abbr === subject.abbr) continue;
    for (let i = 0; i < N; i++) {
      const h = simulateGame(seedBase + i, 9, subject, other).game;
      record(h.homeState.runs - h.awayState.runs, h.winner === 'home');

      const a = simulateGame(seedBase + i + 500_000, 9, other, subject).game;
      record(a.awayState.runs - a.homeState.runs, a.winner === 'away');
    }
  }

  const mean = sum / n;
  return { mean, variance: sumSq / n - mean * mean, n, winPct: (wins / n) * 100 };
}

/** Standard error of (bumped − baseline), treating the two runs as independent. */
const seOf = (a: Sample, b: Sample): number =>
  Math.sqrt(a.variance / a.n + b.variance / b.n);

interface Result {
  key: string;
  /** Mean change in run differential per game, averaged over the subjects. */
  delta: number;
  /** 95% half-width on that mean. */
  ci: number;
  winDelta: number;
  /** How much the rating was moved, in its own units. */
  step: number;
}

/**
 * THE BUMP FOR EACH RATING: SPREADS times the standard deviation of that
 * rating's CLUB AVERAGE across the league.
 *
 * ⚠️ THE SPREAD OF CLUB AVERAGES, NOT OF PLAYERS. value.ts exists to rank
 * CLUBS, so the difference that matters is the one between two clubs' nines,
 * not the one between two men in a lineup. The player-level spread is several
 * times wider and using it would put the bump back outside the league.
 */
const batStep: Record<BatKey, number> = {} as Record<BatKey, number>;
for (const key of ['power', 'contact', 'vision', 'clutch', 'speed', 'bunt'] as BatKey[]) {
  batStep[key] = SPREADS * sdOf(LEAGUE.map((t) => meanOf(t.lineup.map((p) => p[key]))));
}

const armStep: Record<ArmKey, number> = {} as Record<ArmKey, number>;
for (const key of ['zoneRate', 'break', 'clutch', 'stamina', 'speedBonus'] as ArmKey[]) {
  armStep[key] = SPREADS * sdOf(
    LEAGUE.map((t) =>
      meanOf([...t.rotation, ...t.bullpen].map((a) => a[key] ?? ARM_DEFAULT[key])),
    ),
  );
}

const SUBJECTS = SUBJECT_ABBRS.map((abbr) => LEAGUE.find((t) => t.abbr === abbr)!);
const SEED = 918_273;

console.log(
  `${SUBJECTS.length} subjects × ${N * (LEAGUE.length - 1) * 2} games each` +
    `  (${SUBJECTS.map((s) => s.abbr).join(', ')})`,
);

// One baseline per subject, reused by every rating. The bumps are what cost.
const baselines = SUBJECTS.map((s, i) => measure(s, SEED + i * 7_000));
baselines.forEach((b, i) => {
  console.log(
    `  ${SUBJECTS[i]!.abbr}  baseline ${b.winPct.toFixed(1)}%` +
      `  ${b.mean >= 0 ? '+' : ''}${b.mean.toFixed(2)} run diff/g`,
  );
});

/** Bump one rating on every subject and average what it was worth. */
function sweep(key: string, step: number, bump: (t: Team) => Team): Result {
  let delta = 0;
  let winDelta = 0;
  let varSum = 0;

  SUBJECTS.forEach((subject, i) => {
    const base = baselines[i]!;
    const bumped = measure(bump(subject), SEED + i * 7_000);
    delta += bumped.mean - base.mean;
    winDelta += bumped.winPct - base.winPct;
    const se = seOf(bumped, base);
    varSum += se * se;
  });

  const k = SUBJECTS.length;
  // Averaging k independent estimates: the variances add, the mean divides.
  return {
    key,
    delta: delta / k,
    ci: 1.96 * (Math.sqrt(varSum) / k),
    winDelta: winDelta / k,
    step,
  };
}

const bat: Result[] = [];
for (const key of ['power', 'contact', 'vision', 'clutch', 'speed', 'bunt'] as BatKey[]) {
  bat.push(sweep(key, batStep[key], (t) => bumpBats(t, key, batStep[key])));
}

const arm: Result[] = [];
for (const key of ['zoneRate', 'break', 'clutch', 'stamina', 'speedBonus'] as ArmKey[]) {
  arm.push(sweep(key, armStep[key], (t) => bumpArms(t, key, armStep[key])));
}

/**
 * ⚠️ THE WEIGHT IS PER RATING POINT, NOT PER BUMP. Each rating was moved by a
 * different amount — its own two sigma — so the raw deltas are not comparable
 * and dividing each by the step it was measured at is what makes them so. This
 * is the unit value.ts multiplies, which is the whole point of printing it.
 */
const perPoint = (r: Result): number => (r.step === 0 ? 0 : r.delta / r.step);

const row = (r: Result, anchor: number): string => {
  const weight = anchor === 0 ? 0 : (perPoint(r) / anchor) * 1.6;
  const flat = Math.abs(r.delta) <= r.ci;
  return (
    `  ${r.key.padEnd(12)}` +
    `${r.step.toFixed(4)}`.padStart(7) +
    `${(r.delta >= 0 ? '+' : '') + r.delta.toFixed(3)}`.padStart(8) +
    ` ± ${r.ci.toFixed(3)}` +
    `${(r.winDelta >= 0 ? '+' : '') + r.winDelta.toFixed(2)}%`.padStart(9) +
    `${weight.toFixed(2)}`.padStart(8) +
    (flat ? '   ⚠ indistinguishable from zero' : '')
  );
};

// ⚠️ ANCHORED ON CONTACT, not on whichever row won. See fault 3 in the header.
const anchor = perPoint(bat.find((r) => r.key === 'contact')!);

console.log(`\nEffect of a ${SPREADS}σ club-level bump across the lineup, per game`);
console.log('  rating         step  Δ run diff        Δ win   weight');
for (const r of bat) console.log(row(r, anchor));

console.log(`\nEffect of a ${SPREADS}σ club-level bump across the whole staff, per game`);
console.log('  rating         step  Δ run diff        Δ win   weight');
for (const r of arm) console.log(row(r, anchor));

const unresolved = [...bat, ...arm].filter((r) => Math.abs(r.delta) <= r.ci);
console.log(
  `\n${unresolved.length} of ${bat.length + arm.length} ratings are inside their own error bar` +
    (unresolved.length ? `: ${unresolved.map((r) => r.key).join(', ')}` : ''),
);
console.log(
  'A rating inside its error bar has not been measured. Raise the game count,',
);
console.log('or leave that weight where it is — do not paste a number you cannot see.');
