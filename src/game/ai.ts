/**
 * The computer manager. It is trying to beat you, and it is watching you do it.
 *
 * TWO JOBS, because in a full game the computer plays both sides of the ball:
 *
 *   1. IT PITCHES TO YOU.  callPitch() takes the pitcher's own plan from
 *      core/pitcher.ts and then bends it against what you have shown it.
 *   2. IT HITS OFF YOU.    aiSwing() decides take-or-swing and how well it
 *      timed the pitch, and it guesses based on what you keep calling.
 *
 * ⚠️ THE ADAPTATION IS A LAYER, NOT A REWRITE. throwPitch() still makes the
 * baseline decision — approach, pitch, location, zone rate, signature — and
 * this file overrides pieces of the result afterwards. That is deliberate:
 * the pitcher's plan is already good baseball and the tests in
 * core/__tests__/pitcher.test.ts hold it to that. Adaptation that reached
 * inside would have to re-prove all of it. Turning `adapt` off here gets you
 * the honest baseline pitcher, which is also the control condition.
 *
 * EVERY RULE BELOW IS GATED ON A SAMPLE SIZE. A computer that "adapts" off two
 * pitches is not adapting, it is reacting to noise, and the player reads it as
 * the game cheating rather than the game learning.
 */

import type { Rng } from '../core/rng.ts';
import {
  throwPitch,
  PITCH_SPEED_MPH,
  type Count,
  type Pitcher,
  type Situation,
  type ThrownPitch,
} from '../core/pitcher.ts';
import { ALL_PITCH_TYPES, type PitchType } from '../core/hitTables.ts';
import { TIMING_WINDOWS_MS } from '../core/timing.ts';
import { ZONE_FATIGUE_PENALTY } from './bullpen.ts';
import type { BatterStats } from '../core/hit.ts';
import type { Player } from '../core/roster.ts';
import { playerValue } from './value.ts';

// --------------------------------------------------------------- the book

/** What the computer has written down about one human opponent. */
export interface Read {
  // ---- you, batting
  seen: number;
  swings: number;
  /** Pitches out of the zone you were shown. */
  ballsSeen: number;
  /** ...and how many of those you went after. */
  chases: number;
  /** Signed timing offsets, most recent last. Trimmed to MEMORY. */
  offsets: number[];
  perType: Record<PitchType, { seen: number; swings: number; whiffs: number }>;

  // ---- you, pitching
  calls: Record<PitchType, number>;
  callsTotal: number;
  /** What you go to with two strikes, which is the most predictable thing anyone does. */
  putawayCalls: Record<PitchType, number>;
  putawayTotal: number;
}

/**
 * How many recent swings the timing read remembers.
 *
 * ponytail: a flat window, not a decay. A player who adjusts mid-game should
 * be able to shake the book off within an inning or two, and 40 swings is
 * roughly that. Swap for an exponential decay if it feels too slow to forget.
 */
export const MEMORY = 40;

/** Below this many observations a rule does not fire at all. */
export const MIN_SAMPLE = 12;

const zeroTypes = <T,>(make: () => T): Record<PitchType, T> =>
  Object.fromEntries(ALL_PITCH_TYPES.map((t) => [t, make()])) as Record<PitchType, T>;

export const newRead = (): Read => ({
  seen: 0,
  swings: 0,
  ballsSeen: 0,
  chases: 0,
  offsets: [],
  perType: zeroTypes(() => ({ seen: 0, swings: 0, whiffs: 0 })),
  calls: zeroTypes(() => 0),
  callsTotal: 0,
  putawayCalls: zeroTypes(() => 0),
  putawayTotal: 0,
});

/**
 * One pitch thrown to the human, and what he did with it.
 *
 * Mutates rather than returning a copy — the read is a scratchpad the game
 * owns, not game state that has to replay from a seed. Determinism lives in
 * the RNG; this is a tally.
 */
export function observePitch(
  read: Read,
  pitch: ThrownPitch,
  swung: boolean,
  offsetMs?: number,
  whiffed = false,
): void {
  read.seen++;
  const t = read.perType[pitch.type];
  t.seen++;
  if (!pitch.inZone) read.ballsSeen++;
  if (swung) {
    read.swings++;
    t.swings++;
    if (!pitch.inZone) read.chases++;
    if (whiffed) t.whiffs++;
    if (offsetMs !== undefined && Number.isFinite(offsetMs)) {
      read.offsets.push(offsetMs);
      if (read.offsets.length > MEMORY) read.offsets.shift();
    }
  }
}

/** One pitch the human CALLED, while he was the one on the mound. */
export function observeCall(read: Read, type: PitchType, twoStrikes: boolean): void {
  read.calls[type]++;
  read.callsTotal++;
  if (twoStrikes) {
    read.putawayCalls[type]++;
    read.putawayTotal++;
  }
}

// ------------------------------------------------------------ what it means

/** Share of out-of-zone pitches the hitter goes after. League-ish is ~0.28. */
export const chaseRate = (r: Read): number => (r.ballsSeen ? r.chases / r.ballsSeen : 0);

export const swingRate = (r: Read): number => (r.seen ? r.swings / r.seen : 0);

/**
 * Mean timing error in ms. Negative means he is consistently EARLY.
 *
 * The single most exploitable thing about a hitter: a man who is early is
 * guessing fastball, and the counter is to stop throwing him one.
 */
export const timingBias = (r: Read): number =>
  r.offsets.length ? r.offsets.reduce((a, b) => a + b, 0) / r.offsets.length : 0;

/** Enough swings to trust the timing read. */
export const hasTimingRead = (r: Read): boolean => r.offsets.length >= MIN_SAMPLE;

/**
 * The pitch he misses most, among those he has actually seen enough of.
 *
 * Whiff rate per swing, not per pitch — a pitch he never offers at is not a
 * weakness, it is a pitch he lays off, and throwing it to him is a ball.
 */
export function weakestPitch(r: Read): PitchType | null {
  let worst: PitchType | null = null;
  let rate = 0;
  for (const t of ALL_PITCH_TYPES) {
    const rec = r.perType[t];
    if (rec.swings < 6) continue;
    const whiffRate = rec.whiffs / rec.swings;
    if (whiffRate > rate) {
      rate = whiffRate;
      worst = t;
    }
  }
  return rate >= 0.3 ? worst : null;
}

/**
 * The two-strike book gets a smaller minimum than the general one.
 *
 * Two-strike counts are a fraction of all pitches, so holding the putaway
 * book to MIN_SAMPLE means it never fires before the late innings — and what
 * a pitcher goes to with two strikes is the most legible habit he has.
 */
export const MIN_PUTAWAY_SAMPLE = 8;

/** What the human is most likely to call next. Null until he shows a pattern. */
export function predictedCall(r: Read, twoStrikes: boolean): PitchType | null {
  // ⚠️ The minimum travels WITH the table. Picking the putaway book and then
  // testing it against MIN_SAMPLE made the smaller gate dead code — the book
  // was selected at 8 and then rejected at 12, so it never fired at all.
  const usePutaway = twoStrikes && r.putawayTotal >= MIN_PUTAWAY_SAMPLE;
  const table = usePutaway ? r.putawayCalls : r.calls;
  const total = usePutaway ? r.putawayTotal : r.callsTotal;
  const min = usePutaway ? MIN_PUTAWAY_SAMPLE : MIN_SAMPLE;
  if (total < min) return null;

  let best: PitchType | null = null;
  let share = 0;
  for (const t of ALL_PITCH_TYPES) {
    const s = table[t] / total;
    if (s > share) {
      share = s;
      best = t;
    }
  }
  // A even spread is not a tendency. Five pitch types means 0.2 is random.
  return share >= 0.38 ? best : null;
}

// ------------------------------------------------- the computer, pitching

/** Slower than a fastball — what you throw a man who is out in front. */
const OFFSPEED: readonly PitchType[] = ['changeup', 'curveball', 'knuckleball'];

export interface CallOptions {
  /** Off gives the plain pitcher from core/pitcher.ts. The control condition. */
  adapt?: boolean;
  /**
   * 0 fresh, 1 gassed. See bullpen.ts.
   *
   * A tiring arm LOSES THE PLATE — the first and most visible symptom, and the
   * one the player can read without being told, because the counts run deep.
   * The other half of fatigue (hitters squaring him up) lives in aiSwing().
   */
  fatigue?: number;
}

/**
 * Pick the next pitch to the human hitter.
 *
 * Runs the pitcher's own plan first, then applies at most a few adjustments.
 * Each one is a real thing a pitching coach says out loud, and each is gated
 * on having actually seen it enough times to say it.
 */
export function callPitch(
  pitcher: Pitcher,
  count: Count,
  sit: Situation,
  read: Read,
  rng: Rng,
  opts: CallOptions = {},
): ThrownPitch {
  const base = throwPitch(pitcher, count, sit, rng);
  const tired = opts.fatigue ?? 0;

  // Fatigue is applied even with adaptation off — it is a property of the arm,
  // not of the book. A gassed pitcher misses the zone whether or not he has
  // anything written down about you.
  const withFatigue = (p: ThrownPitch): ThrownPitch => {
    if (tired <= 0 || !p.inZone) return p;
    // He loses the plate: some share of would-be strikes drift off it. Never
    // on a pitch he had to throw — that rule outranks his legs.
    if (p.approach === 'attack') return p;
    if (rng.next() >= ZONE_FATIGUE_PENALTY * tired) return p;
    return { ...p, inZone: false };
  };

  if (opts.adapt === false || read.seen < MIN_SAMPLE) return withFatigue(base);

  let { type, inZone } = base;
  const twoStrikes = count.strikes >= 2;
  const mustStrike = base.approach === 'attack';

  // 1. "HE'LL CHASE." Two strikes on a free swinger: get it off the plate.
  //    Not applied when he has to throw a strike — that rule outranks the book.
  if (twoStrikes && !mustStrike && chaseRate(read) > 0.35 && rng.next() < 0.6) {
    inZone = false;
  }

  // 2. "HE WON'T SWING." A patient hitter who is not chasing gets challenged,
  //    because walking him is worse than letting him hit it.
  if (!twoStrikes && chaseRate(read) < 0.15 && swingRate(read) < 0.35 && rng.next() < 0.5) {
    inZone = true;
  }

  // 3. "HE'S OUT IN FRONT." Consistently early means he is timing the fastball;
  //    take it away. Consistently late means the opposite — beat him with it.
  if (hasTimingRead(read)) {
    const bias = timingBias(read);
    if (bias < -TIMING_WINDOWS_MS.perfect && rng.next() < 0.5) {
      // ⚠️ THE `?? type` HERE WAS A LIE AND IT FROZE THE GAME. rng.pick THROWS
      // on an empty array — it does not return undefined — so the fallback
      // could never run, and 26 of the league's 90 arms throw no offspeed at
      // all (fastball/sinker/slider men). The first time the book read a
      // hitter as early against one of them, callPitch threw, the throw came
      // up through frame(), and the loop died where it stood.
      //
      // Check the list before picking from it. A man with nothing soft to
      // throw keeps the pitch he already had.
      const offspeed = OFFSPEED.filter((t) => pitcher.arsenal[t] !== undefined);
      if (offspeed.length) type = rng.pick(offspeed);
    } else if (bias > TIMING_WINDOWS_MS.good && pitcher.arsenal.fastball && rng.next() < 0.5) {
      type = 'fastball';
    }
  }

  // 4. "HE CAN'T TOUCH THE SLIDER." With two strikes, go to the pitch he
  //    misses — provided this arm actually throws it.
  if (twoStrikes) {
    const weak = weakestPitch(read);
    if (weak && pitcher.arsenal[weak] !== undefined && rng.next() < 0.55) type = weak;
  }

  if (type === base.type && inZone === base.inZone) return withFatigue(base);

  return withFatigue({
    ...base,
    type,
    inZone,
    speedMph: PITCH_SPEED_MPH[type] + (pitcher.speedBonus ?? 0),
    // A pitch he was never shown cannot be tipped as the pitch he was shown.
    tell: base.tell ? { ...base.tell, pitch: type } : null,
    // The knockdown belongs to a pitch that was inside and wild. Forcing the
    // ball into the zone has to retract it or the batter is hit by a strike.
    hitBatter: base.hitBatter && !inZone,
  });
}

// -------------------------------------------------- the computer, hitting

/**
 * THE SACRIFICE. When the computer squares one up on purpose.
 *
 * ⚠️ IT IS NOT A SWING DECISION, which is why it does not live in aiSwing().
 * A manager puts the bunt on before the pitch and it is on until the count
 * says otherwise; folding it into the per-pitch swing roll would have the
 * computer changing its mind mid-at-bat, which is not a thing a bench does.
 *
 * The rule is the one a real bench actually uses, and every clause is a
 * reason not to bunt:
 *
 *   two strikes      a foul is the third one now. Nobody sacrifices into that.
 *   any outs at all  the sacrifice buys a run that a second out erases. Real
 *                    sac bunts are overwhelmingly a nobody-out play.
 *   nobody to move   there is no runner the ninety feet is worth.
 *   he can hit       a man with power is not giving up an out, whatever his
 *                    bunt rating says. This is the clause that keeps the
 *                    RATING from turning every good bunter into a bunter.
 *   not a one-run    two runs back, one run is not the game.
 *   early, and he    the modern bench bunts LATE. Before the sixth only a bat
 *   can hit a bit    with nothing in it gets the sign.
 *
 * ⚠️ EVERY ONE OF THOSE CLAUSES IS PAYING FOR ITSELF, and the number that says
 * so is `bunts per team` in scripts/balance.ts. The first cut had only the
 * first four and produced **3.0 sacrifices per team per game** against a real
 * 0.25 — twelve times the rate, because a third of the league rates as a
 * bunter and "runner on, under two outs" is a quarter of all plate appearances.
 * A rating that fires that often stops being a decision and becomes the game.
 * Re-measure after touching any of them.
 *
 * ponytail: no squeeze, no bunting for a hit off the shift, no dropping one on
 * a third baseman playing back. One situation, one rule. The drag bunt exists
 * — resolveBunt() rolls for it — the computer just does not go looking for it.
 */
export interface BuntContext {
  count: Count;
  outs: number;
  /** Occupied bases, [first, second, third]. */
  bases: readonly boolean[];
  /** Runs the batting side is behind by. Negative means they lead. */
  deficit: number;
  /** Defaults to 9 — a caller with no inning is asking about a late one. */
  inning?: number;
  /**
   * The club's bunt knob — see identity.ts. Scales BUNT_THRESHOLD only, so it
   * moves WHO gets the sign and never any of the six situational clauses
   * above. A SMALL BALL club still does not sacrifice with two strikes.
   */
  bunt?: number;
}

/** Bunt ratings at or above this are worth giving an out for. */
export const BUNT_THRESHOLD = 1.1;
/** ...and power at or above this means he is not being asked to. */
export const BUNT_POWER_CEILING = 1.05;
/** Under this he is not going to drive anybody in anyway, so bunt him early too. */
export const HELPLESS_POWER = 0.8;

export function shouldBunt(stats: BatterStats, ctx: BuntContext): boolean {
  if (ctx.count.strikes >= 2) return false;
  if (ctx.outs !== 0) return false;
  if (!ctx.bases[0] && !ctx.bases[1]) return false;
  // Already in scoring position with first empty: there is nothing to move him
  // to that an out is worth.
  if (!ctx.bases[0] && ctx.bases[2]) return false;
  if (stats.bunt < BUNT_THRESHOLD * (ctx.bunt ?? 1)) return false;
  if (stats.power >= BUNT_POWER_CEILING) return false;
  if (Math.abs(ctx.deficit) > 1) return false;

  // ⚠️ A SMALL-BALL BENCH DOES NOT WAIT FOR THE SIXTH, and this clause is the
  // only part of the bunt knob that actually does anything on a real roster.
  //
  // Measured 2026-08-26: scaling BUNT_THRESHOLD is ONE-DIRECTIONAL. Raising it
  // works — 1.2 takes Baltimore from five eligible bunters to one, 1.4 to
  // none. Lowering it recruits NOBODY: bunt ratings are bimodal, the contact
  // men sit at 1.05-1.35 and the sluggers at 0.15-0.50, and there is nothing
  // in the 0.8-1.0 band for a lower bar to pick up. Baltimore had exactly five
  // eligible bunters at a knob of 1.0, 0.88 and 0.72 alike — so SMALL BALL,
  // on the club chosen to BE the small-ball club, was a no-op.
  //
  // The bench cannot conjure bunters it does not have. What it can do is use
  // the ones it has ALL GAME rather than from the sixth on, which is what
  // "trade you an out for a base all night long" actually describes.
  const smallBall = (ctx.bunt ?? 1) < 1;
  // Late, or hopeless, or a bench that plays this way from the first pitch.
  return smallBall || (ctx.inning ?? 9) >= 6 || stats.power <= HELPLESS_POWER;
}

export interface SwingDecision {
  swing: boolean;
  /** Signed ms, only meaningful when `swing`. Feeds resolveSwing(). */
  offsetMs: number;
  /** What it was sitting on, for the UI to show after the fact. */
  guess: PitchType | null;
}

/**
 * ⚠️ HOW OFTEN THE COMPUTER SQUARES ONE UP. The most important numbers here.
 *
 * THE TRAP, AND WHY THIS IS NOT A BELL CURVE. The first version drew the
 * timing offset from a normal distribution with a 26ms standard deviation,
 * which sounds reasonable and produced **25.6 runs per team per game**. The
 * cause is in core/hitTables.ts: a `perfect` swing is a hit 75% of the time
 * and a `good` one about 25%. Those tables are a REWARD CURVE for a human
 * hitter — nailing the timing is supposed to feel enormous — and they are not
 * a batting-average model. Any distribution that lands on `perfect` a third of
 * the time turns them into softball.
 *
 * A bell curve cannot be tuned out of it either. The windows are 12 / 35 / 80,
 * so squeezing `perfect` down to a realistic share pushes so much mass past 80
 * that the hitter whiffs more than half the time. The ratios forbid it.
 *
 * So the band is drawn DIRECTLY. These four weights are the plate appearance
 * you want, stated as itself: square one up rarely, make ordinary contact
 * most of the time, whiff sometimes. One knob per band, and each knob means a
 * plain English sentence.
 *
 * ponytail: tuned against scripts/balance.ts, not derived. Re-run it after
 * touching these — 400 games takes about a second and prints runs per team.
 */
export const AI_TIMING_BANDS = {
  /** Barrelled it. */
  perfect: 0.08,
  /** Squared up, not perfectly. */
  good: 0.28,
  /** Out in front or beaten — contact, but bad contact. */
  offBalance: 0.39,
  /**
   * Swing and miss.
   *
   * ⚠️ THIS IS THE RUN-SCORING KNOB, and `good` is not. Chasing a run surplus
   * through the contact bands barely moves it — 0.28 down to 0.24 bought 0.11
   * runs. The surplus was never contact quality: at 0.13 the computer struck
   * out 7.6 times a game against a real 8.6, and every strikeout that did not
   * happen became a ball in play, some of which became hits. Fixing the whiff
   * rate pulled runs, hits AND the K rate onto their real numbers together,
   * because they were all the same missing out. Run scripts/balance.ts and
   * read the K line before touching anything else.
   */
  miss: 0.16,
} as const;

/**
 * Bounds in ms for each band, matching TIMING_WINDOWS_MS.
 *
 * Generated against the BASE windows on purpose. grade() re-scales those
 * windows by the contact stat, so a 1.3-contact hitter has a 40ms swing
 * upgraded from off-balance to good for free — which is exactly what the
 * contact stat should buy, without a second mechanism to say so.
 *
 * The miss band is the one exception: it starts at 150, well past any real
 * contact multiplier, so a whiff stays a whiff for everyone.
 */
const BANDS: Record<keyof typeof AI_TIMING_BANDS, readonly [number, number]> = {
  perfect: [0, TIMING_WINDOWS_MS.perfect],
  good: [TIMING_WINDOWS_MS.perfect, TIMING_WINDOWS_MS.good],
  offBalance: [TIMING_WINDOWS_MS.good, TIMING_WINDOWS_MS.contact],
  miss: [150, 320],
};

type BandName = keyof typeof AI_TIMING_BANDS;
const BAND_ORDER: readonly BandName[] = ['perfect', 'good', 'offBalance', 'miss'];

/** Draw a signed timing offset from weighted bands. */
function sampleOffset(rng: Rng, weights: Record<BandName, number>): number {
  const total = BAND_ORDER.reduce((a, b) => a + weights[b], 0);
  let roll = rng.next() * total;
  let band: BandName = 'offBalance';
  for (const b of BAND_ORDER) {
    roll -= weights[b];
    if (roll <= 0) {
      band = b;
      break;
    }
  }
  const [lo, hi] = BANDS[band];
  const magnitude = rng.range(lo, hi);
  return rng.next() < 0.5 ? -magnitude : magnitude;
}

/**
 * What guessing right is worth: weight moved INTO the two good bands.
 *
 * A hitter sitting on the right pitch is a different hitter, and this is the
 * whole payoff of the adaptation — if you keep calling the same pitch, these
 * multipliers are what beat you.
 */
export const GUESS_BONUS = 2.2;
/** ...and guessing wrong moves weight into miss. Wrong hurts more than right helps. */
export const GUESS_PENALTY = 2.0;

export interface SwingContext {
  count: Count;
  stats: BatterStats;
  /** Higher swings more and chases more. 1.0 is a disciplined professional. */
  aggression?: number;
  /**
   * How tired the man he is facing is, 0..1. The other half of fatigue: a
   * gassed arm gets squared up. See bullpen.ts.
   */
  pitcherFatigue?: number;
  /**
   * A multiplier on the two GOOD timing bands. 1.0 is neutral.
   *
   * ⚠️ THIS IS THE STRONG DIAL AND `aggression` IS THE WEAK ONE. Worth stating
   * because the first attempt at a home-field edge turned aggression and got
   * +0.7 points of win rate for a 5% bump — swing rate mostly trades walks for
   * outs and nets out near zero. The barrel weights are where run scoring
   * actually lives: FATIGUE_BARREL_BONUS moves them and a gassed arm is the
   * most decisive thing in the game.
   *
   * So anything that needs to be worth REAL wins goes here, and anything that
   * should be visible without being decisive goes on aggression. See
   * HOME_EDGE in tuning.ts, which is this one's only caller.
   */
  barrel?: number;
}

/** What a fully gassed pitcher adds to the hitter's two good bands. */
export const FATIGUE_BARREL_BONUS = 1.1;

/**
 * PLATE DISCIPLINE, BY THE COUNT. The two tables below are the difference
 * between a hitter and a swing generator.
 *
 * ⚠️ THE COUNT USED TO BARELY MATTER, and it was the most visible dumb thing
 * the computer did. One rate for the zone (0.82 on everything that was not
 * 0-0), one for a ball off the plate (0.22), and two-strike protection bolted
 * on top. Which meant that on 3-0 — the count where a real hitter has the bat
 * on his shoulder and the pitcher has to come to him — the computer hacked at
 * 82% of strikes and chased one ball in five. It never took a walk on purpose.
 * A man watching that correctly says the CPU is not playing baseball.
 *
 * So: ahead in the count he waits for one he can drive, behind it he expands,
 * and with three balls he makes you throw a strike. Real major-league swing
 * rates on 3-0 are under 10%; these are close to the real shape and rounded to
 * numbers you can read.
 *
 * ⚠️ TWO STRIKES OVERRIDES BOTH TABLES — see aiSwing. 3-2 is a two-strike
 * count before it is a three-ball count, and protecting the plate wins.
 */
const ZONE_SWING: Record<string, number> = {
  '0-0': 0.55, // take a look at the first one
  '0-1': 0.82,
  '1-0': 0.7,
  '1-1': 0.82,
  '2-0': 0.62, // ahead: hunting one to drive, not just any strike
  '2-1': 0.8,
  '3-0': 0.08, // the take sign is on
  '3-1': 0.55,
};

const CHASE: Record<string, number> = {
  '0-0': 0.22,
  '0-1': 0.28,
  '1-0': 0.18,
  '1-1': 0.24,
  '2-0': 0.12,
  '2-1': 0.2,
  '3-0': 0.01, // he is not giving you this one back
  '3-1': 0.08,
};

/**
 * WHOSE EYE IT IS. The tables above are the same for every hitter in the
 * league; this is the only thing that makes one of them harder to fool.
 *
 * ⚠️ WITHOUT IT, WALKS RAN BACKWARDS. Measured over a full season (16,479 PA)
 * on 2026-08-28: correlation between walk rate and `vision` was **-0.697**,
 * and between walk rate and `power` **+0.747**. Sluggers walked 19.4% of the
 * time and the best-eye quartile walked 2.3%; a fifth of all regulars finished
 * the year with ZERO walks in 40+ plate appearances. The league total was
 * 9.4%, which is right, which is why nothing ever caught it.
 *
 * The cause was that take-or-swing read the count and nothing else, so a walk
 * was a byproduct of AT-BAT LENGTH: `vision` widens the whiff boundary in
 * grade(), so a good eye put the ball in play early and never reached ball
 * four, while a slugger fouled and whiffed his way to 3-2 and got walked. The
 * rating that is supposed to mean "he is hard to fool" was making him easier.
 *
 * ⚠️ IT SCALES THE CHASE ONLY, NEVER THE ZONE. Real plate discipline is almost
 * entirely about the pitch off the plate — good and bad hitters swing at
 * strikes at similar rates. Putting it on ZONE_SWING as well would make a good
 * eye take strikes, which is not discipline, it is a slump.
 *
 * ⚠️ IT IS CENTRED, NOT SCALED FROM 1.0, and the centre is SOLVED rather than
 * eyeballed. The fix has to redistribute discipline without handing the league
 * more or fewer walks than it was measured to have, so `EYE_CENTER` is the c
 * that makes the mean of `(c / vision)^k` come out to exactly 1.0 across all
 * 270 hitters. It is NOT the mean vision (1.058) — (c/v)^k is convex, so
 * centring on the mean quietly raises the average chase. Doing exactly that
 * cost the league 21% of its walks on the first attempt.
 *
 * ⚠️ SO THE TWO CONSTANTS MOVE TOGETHER. Changing the exponent without
 * re-solving the centre changes the league's walk rate as a side effect. The
 * solved pairs, and what they buy the extremes:
 *
 *   k=1  centre 1.0449   best eye 0.79x chase .. worst 1.32x
 *   k=2  centre 1.0384   0.62x .. 1.73x
 *   k=3  centre 1.0317   0.48x .. 2.23x
 *   k=4  centre 1.0251   0.36x .. 2.84x   <- shipped
 *
 * k=4 because vision only spans 0.79-1.32 and the at-bat-length effect above
 * is strong — k=1 is invisible on a stat line. It lands the chase rates where
 * a real league has them: 10% for the best eye in the game, 48% for the worst,
 * against a real major-league range of about 18% to 45%.
 *
 * ⚠️ IT DOES NOT FULLY UNDO THE BACKWARDS CORRELATION, and the rest is not in
 * this file. Two things outside it still push walks toward the sluggers, both
 * on purpose: teams.ts is built with corr(vision, power) = -0.81, so a good
 * eye and real power almost never share a card, and DANGEROUS_POWER in
 * pitcher.ts has the arm pitch around a big bat, which is real baseball. The
 * third is not on purpose — a high-contact hitter ends 88% of his plate
 * appearances with a ball in play against a real ~68%, so he never sees enough
 * pitches to walk. That one is the foul/contact model, not the swing decision,
 * and it is the next thing to look at if the walk column still reads thin.
 */
export const EYE_CENTER = 1.0251;
export const CHASE_BY_EYE = 4;

/**
 * The computer's hitter decides what to do with the pitch you just called.
 *
 * THE GUESS IS THE ADAPTATION. If you call the same pitch in the same spot
 * often enough, it starts sitting on it, and a hitter sitting on a pitch is a
 * much better hitter. Mix your pitches and the guess is null and it hits like
 * its stat line says it should.
 */
export function aiSwing(
  pitch: ThrownPitch,
  ctx: SwingContext,
  read: Read,
  rng: Rng,
): SwingDecision {
  const { count } = ctx;
  const aggression = ctx.aggression ?? 1;
  const twoStrikes = count.strikes >= 2;
  const guess = predictedCall(read, twoStrikes);

  // ---- take or swing
  //
  // Two strikes is its own rule and it beats everything: protect the plate,
  // whatever the balls are. Otherwise the count decides, out of the two tables
  // above — ahead he waits, behind he expands, 3-0 he makes you throw one.
  const key = `${count.balls}-${count.strikes}`;
  let swingChance: number;
  if (twoStrikes) swingChance = pitch.inZone ? 0.95 : 0.45;
  else swingChance = (pitch.inZone ? ZONE_SWING[key] : CHASE[key]) ?? (pitch.inZone ? 0.82 : 0.22);
  // ...and then whose eye it is. Off the plate only, and it applies to the
  // two-strike chase above as well — protecting the plate is still a decision
  // a man with a good eye makes better. See CHASE_BY_EYE.
  if (!pitch.inZone) {
    const eye = ctx.stats.vision > 0 ? ctx.stats.vision : 1;
    swingChance *= (EYE_CENTER / eye) ** CHASE_BY_EYE;
  }
  // A hitter who has guessed right goes after it.
  if (guess && guess === pitch.type) swingChance = Math.min(1, swingChance * 1.25);
  swingChance = Math.min(1, swingChance * aggression);

  if (rng.next() >= swingChance) return { swing: false, offsetMs: 0, guess };

  // ---- how well it timed it
  const w: Record<BandName, number> = { ...AI_TIMING_BANDS };

  // A tiring arm gets barrelled. Same dial as everything else in the model.
  const tired = ctx.pitcherFatigue ?? 0;
  if (tired > 0) {
    w.perfect *= 1 + FATIGUE_BARREL_BONUS * tired;
    w.good *= 1 + FATIGUE_BARREL_BONUS * 0.5 * tired;
  }

  // ...and so does a man hitting in front of his own crowd. Same two weights,
  // for the same reason they are the ones fatigue turns.
  const barrel = ctx.barrel ?? 1;
  if (barrel !== 1) {
    w.perfect *= barrel;
    w.good *= barrel;
  }

  if (guess) {
    if (guess === pitch.type) {
      w.perfect *= GUESS_BONUS;
      w.good *= GUESS_BONUS;
    } else {
      w.miss *= GUESS_PENALTY;
    }
  }

  // Chasing a ball off the plate is not the same swing as one over it.
  if (!pitch.inZone) {
    w.perfect *= 0.35;
    w.good *= 0.6;
    w.miss *= 1.6;
  }

  // A knuckleball is the pitch nobody times. That is its whole identity.
  if (pitch.type === 'knuckleball') {
    w.perfect *= 0.5;
    w.miss *= 1.5;
  }

  return { swing: true, offsetMs: sampleOffset(rng, w), guess };
}

// ------------------------------------------------------- going to the bench

/**
 * SEND SOMEBODY UP FOR HIM — the computer's version of the decision the pre-game
 * card lets you make in the eighth inning.
 *
 * ⚠️ THE COMPUTER HAS TO DO THIS OR THE BENCH IS A CHEAT CODE. Three extra men
 * are worth nothing to a club that never uses them, so a bench only YOU could
 * go to would be a flat advantage over all twenty-nine opponents, quietly
 * applied every game — the exact shape of "a feature that is really a
 * difficulty setting" the engine has been careful to avoid elsewhere.
 *
 * ⚠️ IT USES playerValue(), NOT A SECOND OPINION ABOUT WHO IS GOOD. value.ts is
 * already the file that answers "is this man better than that one", it is what
 * the pre-game card ranks clubs by, and the trade deadline in moments.ts prices
 * against it. A private rating here would be a fourth answer to a question that
 * already has one, and the first time value.ts moved they would disagree.
 *
 * THE RULE, and every clause is a clause because leaving it out was wrong:
 *
 *   LATE ONLY. A pinch hitter used in the third is a man you do not have in the
 *   ninth, and the bench is three deep. `regulation - 2` is the seventh of a
 *   nine-inning game and stays right if somebody plays a seven-inning one.
 *
 *   CLOSE ONLY. Nobody empties his bench down nine. WITHIN measures both
 *   directions: protecting a lead is as real a reason as chasing one.
 *
 *   AND HE HAS TO BE BETTER BY A MARGIN. Without one the computer would swap
 *   for a hundredth of a point and burn its bench on the first man up in the
 *   seventh every single game.
 *
 * ponytail: no platoon check and no defensive replacements. THE HAND on every
 * bench bats the other way round, so a hand-aware version would want the
 * pitcher passed down here, and the margin already keeps the computer off the
 * marginal cases where a platoon edge is the whole difference. Send the
 * pitcher's hand in and compare with platoonContact() when it is worth it.
 */
export interface PinchContext {
  inning: number;
  /** Nine, normally. The length of a full game — see GameState.regulation. */
  regulation: number;
  /** Runs the batting side is behind by. Negative means they lead. */
  deficit: number;
  /** Somebody is on second or third. Lowers the bar; the spot is worth more. */
  risp?: boolean;
}

/** Runs either way, inside which the game is still worth managing. */
export const PINCH_WITHIN = 3;
/** How much better the bench man has to be, in value.ts units. */
export const PINCH_MARGIN = 0.09;
/** ...and how much of that margin a runner in scoring position forgives. */
export const PINCH_RISP_MARGIN = 0.04;

export function pinchHitter(
  due: Player,
  bench: readonly Player[],
  ctx: PinchContext,
): Player | null {
  if (bench.length === 0) return null;
  if (ctx.inning < ctx.regulation - 2) return null;
  if (Math.abs(ctx.deficit) > PINCH_WITHIN) return null;

  const bar =
    playerValue(due) + (ctx.risp ? PINCH_RISP_MARGIN : PINCH_MARGIN);

  let best: Player | null = null;
  let bestValue = bar;
  for (const p of bench) {
    const v = playerValue(p);
    if (v > bestValue) {
      best = p;
      bestValue = v;
    }
  }
  return best;
}
