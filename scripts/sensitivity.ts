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
 */
import { LEAGUE, type Team } from '../src/game/teams.ts';
import { simulateGame } from '../src/game/sim.ts';
import type { Player } from '../src/core/roster.ts';
import type { Pitcher } from '../src/core/pitcher.ts';

const N = Number(process.argv[2] ?? 16);
const STEP = 0.1;

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

// ⚠️ THE WHOLE STAFF, ROTATION AND PEN. It moved only the rotation, which was
// the whole staff when it was written and is now half of one — a weight
// measured by bumping three of six arms would read about half of what the
// rating is actually worth, and value.ts prices all six.
const bumpArm = (a: Pitcher, key: ArmKey, by: number): Pitcher => {
  // zoneRate is a share and speedBonus is mph — neither is a 1.0-centred
  // multiplier, so a flat +0.1 would mean something different on each.
  if (key === 'zoneRate') return { ...a, zoneRate: Math.min(0.95, a.zoneRate + by * 0.5) };
  if (key === 'speedBonus') return { ...a, speedBonus: (a.speedBonus ?? 0) + by * 20 };
  return { ...a, [key]: (a[key] ?? 1) + by };
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
function sweep(key: string, bump: (t: Team) => Team): Result {
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
  };
}

const bat: Result[] = [];
for (const key of ['power', 'contact', 'vision', 'clutch', 'speed', 'bunt'] as BatKey[]) {
  bat.push(sweep(key, (t) => bumpBats(t, key, STEP)));
}

const arm: Result[] = [];
for (const key of ['zoneRate', 'break', 'clutch', 'stamina', 'speedBonus'] as ArmKey[]) {
  arm.push(sweep(key, (t) => bumpArms(t, key, STEP)));
}

const row = (r: Result, anchor: number): string => {
  const weight = anchor === 0 ? 0 : (r.delta / anchor) * 1.6;
  const flat = Math.abs(r.delta) <= r.ci;
  return (
    `  ${r.key.padEnd(12)}` +
    `${(r.delta >= 0 ? '+' : '') + r.delta.toFixed(3)}`.padStart(7) +
    ` ± ${r.ci.toFixed(3)}` +
    `${(r.winDelta >= 0 ? '+' : '') + r.winDelta.toFixed(2)}%`.padStart(9) +
    `${weight.toFixed(2)}`.padStart(8) +
    (flat ? '   ⚠ indistinguishable from zero' : '')
  );
};

// ⚠️ ANCHORED ON CONTACT, not on whichever row won. See fault 3 in the header.
const anchor = bat.find((r) => r.key === 'contact')!.delta;

console.log(`\nEffect of +${STEP} across the lineup, per game`);
console.log('  rating       Δ run diff        Δ win   weight');
for (const r of bat) console.log(row(r, anchor));

console.log(`\nEffect of +${STEP} across the rotation, per game`);
console.log('  rating       Δ run diff        Δ win   weight');
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
