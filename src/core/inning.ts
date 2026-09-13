/**
 * Outs, bases and innings. The layer above the count.
 *
 * atBat.ts ends an at-bat; this decides what that cost and what it scored.
 * You are only ever the batter, so there is no top and bottom here - an
 * inning is three outs of your own, and the pitcher you are facing is the
 * whole opposition.
 *
 * Base running is deliberately blunt. Every runner takes exactly the number
 * of bases the batter did, walks force, and outs freeze everyone. That is not
 * real baseball and it is not meant to be yet - see the ponytail notes below
 * for each rule and what would replace it.
 */

import { isHit, isOut, type Outcome } from './hitTables.ts';
import type { AtBatResult } from './atBat.ts';
import { CLEAN, gunDown, TAG_THROW, type FieldingResult, type ForceBag } from './fielding.ts';

/**
 * [first, second, third]. A slot holds the RUNNER standing on it, or null.
 *
 * These used to be booleans. Runners had to gain identity for stealing to
 * work at all — "can this runner take second" is a question about a specific
 * person's speed, and an anonymous `true` cannot answer it.
 */
export type Runner = { name: string; speed: number };
export type Bases = readonly [Runner | null, Runner | null, Runner | null];

export const EMPTY_BASES: Bases = [null, null, null];

/** A placeholder runner, for callers that do not track who is on base. */
export const ANON: Runner = { name: 'runner', speed: 1 };

export const occupied = (b: Bases): boolean[] => b.map((r) => r !== null);

/**
 * HOW MANY RUNNERS ARE FORCED — the unbroken run of occupied bases from first.
 *
 * 0 with nobody on first, 3 with the bases loaded. A man on second with first
 * open is NOT forced and does not count, which is the whole reason this is a
 * run rather than a tally: he can stand there all day.
 *
 * Exported because core/fielding.ts has to know which bag the lead force is at
 * and is deliberately blind to the bases — so both callers hand it this number
 * rather than each counting the bags their own way. See LEAD_FORCE.
 */
export const forcedRunners = (b: Bases): number => {
  let n = 0;
  while (n < 3 && b[n]) n++;
  return n;
};

/** A runner who changed bags between two states. -1 means he came from home. */
export interface RunnerMove {
  name: string;
  from: number;
  to: number;
  /**
   * His legs, carried along so the picture can run him at his own pace.
   *
   * ⚠️ WITHOUT THIS EVERY RUNNER MOVED AT THE BATTER'S SPEED, over any
   * distance, in the same fixed span of time — so a catcher going first to
   * third arrived with a burner going first to second, and both of them beat
   * the man who only had ninety feet to cover. Distance and legs are the two
   * things that decide when a runner gets somewhere, and the replay had
   * neither.
   */
  speed: number;
}

/**
 * What moved between two base states.
 *
 * The base HUD draws runners sliding between bags, and it works this out by
 * DIFFING rather than by listening for events — runners are moved by hits,
 * walks, steals and outs in several different places, and a diff catches all
 * of them without any of those sites knowing the HUD exists.
 *
 * Matching is by name against a pool that gets consumed, because a short
 * lineup wraps: with three players signed, the same man really can be standing
 * on two bases at once, and matching him to the wrong bag draws a runner
 * sliding backwards.
 *
 * Runners who LEFT the bases are not reported. Scoring and being thrown out
 * are the same absence in a diff, and this cannot tell them apart.
 */
export function runnerMoves(prev: Bases, next: Bases): RunnerMove[] {
  const moves: RunnerMove[] = [];
  const taken = new Set<number>();

  next.forEach((runner, to) => {
    if (!runner) return;
    const from = prev.findIndex((old, i) => old?.name === runner.name && !taken.has(i));
    if (from === to) return;
    if (from >= 0) taken.add(from);
    moves.push({ name: runner.name, from: from >= 0 ? from : -1, to, speed: runner.speed });
  });

  return moves;
}

/**
 * Runners who were on base and are STILL ON THE SAME BAG — the third of the
 * three things that can happen to a man on base, and the one nothing reported.
 *
 * runnerMoves() sees the men who advanced and scorersFrom() sees the men who
 * came home; the man who held was simply absent from both, so a picture built
 * from the pair drew him nowhere and the base he was standing on looked empty.
 */
export function heldRunners(prev: Bases, next: Bases): number[] {
  const held: number[] = [];
  prev.forEach((runner, i) => {
    if (runner && next[i]?.name === runner.name) held.push(i);
  });
  return held;
}

/**
 * Which bases the runs came from — the other half of `runnerMoves`.
 *
 * A diff cannot tell a man who scored from a man erased at second on a double
 * play: both are simply gone from `next`. This resolves it by COUNTING rather
 * than by identity. The lead runner is always the one who scores, so take them
 * from third down, as many as there were runs.
 *
 * `scored` is the caller's run differential, not something re-derived here.
 * recordAtBat already did that arithmetic and it is the authority; a second
 * implementation could disagree with the scoreboard, and the scoreboard is
 * what the player believes.
 *
 * Lives next to runnerMoves for the same reason runnerMoves lives here: it
 * reads base state, and the diff belongs with the state it reads.
 */
export function scorersFrom(prev: Bases, next: Bases, scored: number): RunnerMove[] {
  if (scored <= 0) return [];
  const stillOn = new Set(next.filter(Boolean).map((r) => r!.name));
  const gone: RunnerMove[] = [];
  for (let i = 2; i >= 0; i--) {
    const r = prev[i];
    // `to: 3` is the plate. One bag past third, so a scorer is an ordinary
    // RunnerMove and the picture does not need a second kind of runner to
    // draw a man who happened to go all the way.
    if (r && !stillOn.has(r.name)) gone.push({ name: r.name, from: i, to: 3, speed: r.speed });
  }
  return gone.slice(0, scored);
}

export interface MatchState {
  /** 1-based, counts up. */
  inning: number;
  /** How many innings this encounter lasts. */
  innings: number;
  outs: number;
  bases: Bases;
  runs: number;
  over: boolean;
  /** Their runs, one per inning, rolled before the game. See opponent.ts. */
  opponentByInning: readonly number[];
  /** Yours, one per inning, filled in as innings close. The line score. */
  byInning: readonly number[];
}

export const opponentRuns = (m: MatchState): number =>
  m.opponentByInning.reduce((a, b) => a + b, 0);

/** A tie is not a win — you have to beat them. */
export const playerWon = (m: MatchState): boolean => m.runs > opponentRuns(m);

/**
 * ponytail: three innings is a guess, not a design decision. Nine encounters
 * of nine innings is a very long roguelike run. Zane's call, same shelf as
 * the home run rate and the timing windows.
 */
export function newMatch(innings = 3, opponentByInning: readonly number[] = []): MatchState {
  return {
    inning: 1,
    innings,
    outs: 0,
    bases: EMPTY_BASES,
    runs: 0,
    over: false,
    // Default to a shutout so a caller that does not care about the opposing
    // team still gets a coherent match.
    opponentByInning: opponentByInning.length ? opponentByInning : Array(innings).fill(0),
    byInning: [],
  };
}

/**
 * How many bags the HIT is worth. 0 for anything that is not one.
 *
 * ⚠️ NOT THE SAME QUESTION AS overhead.ts's basesFor(), which asks how far the
 * BATTER RUNS and answers 1 on an out because he still has to run it out. They
 * agree on every hit and disagree on every out, so neither can be written in
 * terms of the other; exported because the headless sim needs the hit half and
 * cannot import the web layer (sprites.ts uses import.meta.glob).
 */
export const BASES_GAINED: Record<Outcome, number> = {
  single: 1,
  double: 2,
  triple: 3,
  home_run: 4,
  strikeout: 0,
  popup: 0,
  ground_out: 0,
  line_out: 0,
  // An out. He never left the box.
  foul_out: 0,
  foul: 0,
};

/**
 * The speed at which a runner takes the extra base.
 *
 * Five of the fifteen players in the pool clear it, so it is a real property
 * of a third of the roster rather than a rounding effect. It is also the first
 * thing `speed` does for a hitter who is not stealing and not avoiding a
 * double play — before this, legs were worth nothing on a ball you actually
 * hit, which is backwards.
 *
 * ANON is speed 1, below the line, so every caller that does not track who is
 * on base keeps exactly its old behaviour.
 */
export const EXTRA_BASE_SPEED = 1.15;

/**
 * ⚠️ THE SPEED GATE ABOVE IS THE FALLBACK NOW, NOT THE RULE — 2026-08-25.
 *
 * A flat threshold made the extra base a property of the roster instead of a
 * property of the play: a 1.2 runner took it every single time and a 1.1
 * runner never did, so the man on second either always scored on a single or
 * never did, for his whole career. That is what "runners don't run home on
 * singles" is — for two thirds of the league it was literally true.
 *
 * These are the real rates, and they are the rates BEFORE the throw in
 * fielding.ts gets its chance: second-to-home on a single is about 60% in MLB
 * and first-to-third about 28%, so sending three quarters of the time and
 * getting gunned down on 28% of those lands on 54%, and 0.40 × 0.72 lands on
 * 29%. Multiplied by the runner's legs, so speed still matters — it just
 * stopped being a switch.
 */
export const SEND_HOME = 0.75;
export const SEND_UP = 0.4;

/**
 * Odds a runner goes for one more bag than the batter took. `toBag` is the bag
 * he is going for, 4 being the plate.
 *
 * Exported for the same reason isSacrificeFly() is: a UI that wants to say
 * what a send is worth needs the predicate, not a second copy of it.
 */
export const sendChance = (speed: number, toBag: number): number =>
  odds(speed, toBag >= 4 ? SEND_HOME : SEND_UP);

/** A base rate, scaled by legs, kept off both certainties. */
const odds = (speed: number, base: number): number =>
  Math.max(0.05, Math.min(0.95, base * speed));

/**
 * Batter and every runner move n bases. Anyone past third scores.
 *
 * ⚠️ THE EXTRA BASE, added 2026-08-16. The old note here said "no first-to-third
 * on a single, no runner held at second, no runner thrown out stretching", and
 * the first of those three is now gone: on a SINGLE OR A DOUBLE a runner who
 * can run takes one more bag than the batter did. First to third, and second
 * scores from second — the two most ordinary pieces of baseball there are, and
 * neither existed.
 *
 * Still absent, deliberately: nobody is thrown out stretching, and the batter
 * never takes an extra base himself. The batter is excluded because a man
 * stretching a single into a double is a play with a throw and a call at the
 * far end, and the overhead replay stops him at first — see the README. A
 * runner advancing behind the play needs neither.
 *
 * RUNNERS ARE PROCESSED LEAD-FIRST so nobody can run into the back of the man
 * in front. Without `ceiling` a fast runner on first would take third while a
 * slow runner from second was standing on it, and the diff in runnerMoves()
 * would draw two dots on one bag.
 */
function advance(
  bases: Bases,
  n: number,
  batter: Runner,
  extraBases = false,
  arm?: { odds: number; roll: number },
  rolls?: readonly [number, number, number],
  /** The batter's own gamble on one more bag. See stretchChance(). */
  stretch?: { odds: number; roll: number; armOdds: number },
): { bases: Bases; runs: number; thrownOut: ThrownOut | null; batterTo: number } {
  const next: [Runner | null, Runner | null, Runner | null] = [null, null, null];
  let runs = 0;
  let thrownOut: ThrownOut | null = null;
  // How far the man at the plate actually got. The replay cannot read it off
  // the outcome any more — a single he stretched leaves him on second.
  let batterTo = n;

  // Third, second, first, then the batter. `from` is -1 for the man at the
  // plate, matching runnerMoves()' convention for a runner who came from home.
  const queue: { from: number; who: Runner }[] = [];
  for (let i = 2; i >= 0; i--) {
    const who = bases[i];
    if (who) queue.push({ from: i, who });
  }
  queue.push({ from: -1, who: batter });

  // The bag the runner ahead stopped on. 4 means he scored, so the road is open.
  let ceiling = 4;
  // The extra base is a single-and-double thing. On a triple everyone scores
  // anyway, and on a ground out or a walk nobody is running behind a play.
  const canStretch = extraBases && (n === 1 || n === 2);

  for (const { from, who } of queue) {
    let to = from + 1 + n;

    // Legs, and a gap in front of him. Scoring never collides, so a runner
    // rounding third for the plate is never blocked.
    const wants = to + 1;
    // ⚠️ THE BATTER IS IN THIS NOW, and `from >= 0` used to keep him out. His
    // gamble is rolled somewhere else from the runners' — he is starting from
    // the box rather than off a lead, and what decides it is how far the ball
    // he just hit got from anybody. See stretchChance().
    const goes =
      from < 0
        ? !!stretch && stretch.roll < stretch.odds
        : rolls
          ? rolls[from]! < sendChance(who.speed, wants)
          : who.speed >= EXTRA_BASE_SPEED;

    if (
      canStretch &&
      // ⚠️ HE IS NOT ALREADY SCORING. Without this a man on third when the
      // batter doubles has `to` of 5 and asks for SIX — the clause below lets
      // him, because `wants >= 4` was written to say the road home is never
      // blocked and cannot tell "going home" from "going past it". That was
      // invisible until there was an arm: he used to just take the bogus base
      // and score off `to >= 4`. Now he can be gunned down at it, and the
      // play-by-play prints its own fallback text — "thrown out at the bag",
      // with the throw notated to the catcher because neither table has a
      // sixth base in it. Found by playing the game, not by a test.
      to < 4 &&
      (wants >= 4 || wants < ceiling) &&
      goes
    ) {
      // ⚠️ NOW THERE IS A THROW. He used to take this base for free; the arm
      // out there gets one chance at him, and only one per play — there is one
      // ball and it can only be thrown to one base. See gunDown().
      // ⚠️ THE BATTER IS THROWN AT ON HIS OWN TERMS. He is the one man on the
      // field who saw where the ball went before he decided to run, so the arm
      // gets a worse chance at him than at a runner breaking off a lead. Same
      // die — there is one ball and one throw — different odds. See
      // STRETCH_THROW.
      const armOdds = from < 0 && stretch ? stretch.armOdds : arm?.odds;
      if (arm && armOdds !== undefined && !thrownOut && gunDown(armOdds, arm.roll, who.speed)) {
        thrownOut = { runner: who, at: wants, batter: from < 0 };
        if (from < 0) batterTo = wants;
        // He is off the bases and NOT counted in `next`. Everybody behind him
        // still moves: the throw went to the lead base, which is exactly why
        // the man behind takes the extra one on it. `ceiling` is deliberately
        // left where it was — the bag he was gunned down at is now empty.
        continue;
      }
      to = wants;
    }

    if (from < 0) batterTo = to;
    if (to >= 4) runs++;
    else {
      next[to - 1] = who;
      ceiling = to;
    }
  }

  return { bases: next, runs, thrownOut, batterTo };
}

/**
 * A runner gunned down going for one too many, and the bag he was gunned down
 * at — 2, 3 or 4 for second, third and home, the same numbering advance() uses
 * internally. The scorer needs the bag as much as the name: "thrown out" is a
 * fact and "thrown out at the plate" is a story.
 */
export interface ThrownOut {
  runner: Runner;
  at: number;
  /**
   * TRUE WHEN IT IS THE MAN WHO HIT THE BALL, stretching his own hit.
   *
   * ⚠️ THE PICTURE NEEDS IT AND THE SENTENCE NEEDS IT. Every other man on this
   * list started the play standing on a bag, so the replay can work out where
   * he ran from by subtracting; the batter started in the box and is already
   * being drawn by the race to first, so without this he is drawn twice — once
   * sprinting a leg he never ran, and once by the race that owns him.
   */
  batter: boolean;
}

/**
 * A caught fly a man can score on. LINE_OUT ONLY — see the note below.
 *
 * ⚠️ 'popup' WAS IN THIS SET AND IT WAS A BUG. The outcome vocabulary has two
 * caught flies and they are not two depths of the same thing: 'line_out' is the
 * ball hit to the outfield and 'popup' is the INFIELD FLY, straight up over
 * somebody's head. Nobody has ever tagged from third on one, and the exit
 * velocity gate below was doing the discriminating instead — which held for an
 * average hitter and failed for everyone else.
 */
const FLY_OUTS: ReadonlySet<Outcome> = new Set<Outcome>(['line_out']);

/**
 * How hard a caught fly has to be hit to score a man from third.
 *
 * The outcome table has no depth in it — `popup` and `line_out` are the only
 * two caught flies and neither says how far the ball went. Exit velocity does,
 * and it is already computed from the timing and the hitter's power, so the
 * discriminator costs nothing and means the right thing: you cannot tag up on
 * an infield popup, and a well-struck ball to the outfield scores him.
 *
 * A well-struck ball qualifies and a weakly hit one does not. That is the
 * intended shape — the sacrifice fly should be a fly ball you hit, not an out
 * you got lucky on.
 *
 * ⚠️ 85 → 76 ON 2026-09-12, AND IT IS A CONSEQUENCE OF SAC_FLY_MIN_ANGLE RATHER
 * THAN A LOOSENING. This number was carrying two jobs: "is it a fly ball" and
 * "is it a DEEP fly ball". The angle gate below took the first one off it, so
 * the bar it sets can go back to being only about depth — and at 85 it was set
 * for a population that included line drives.
 *
 * Measured at 300 games a step: 85 gave 0.05 sacrifice flies a team a game, 76
 * gives 0.09 and 68 gives 0.10 against a real 0.25. It plateaus because the
 * binding constraint is not this number at all — it is how often a man is
 * standing on third with an out to spare and somebody hits a fly, which is an
 * upstream property of the run environment and not something the sacrifice fly
 * rule should fake. 76 takes the free half of the gap; going further buys
 * almost nothing and starts scoring men on balls nobody could tag on. Runs per
 * team moved 4.24 → 4.30 against a real 4.4.
 *
 * ⚠️ THIS NUMBER USED TO BE THE INFIELD FLY RULE AS WELL, AND IT COULD NOT BE.
 * The note here read "a popup (65 × 0.95) does not qualify", which is true of a
 * 1.0-power hitter on good timing and false of nearly everybody else: exit
 * velocity is `base × timing × (0.8 + power × 0.4)`, so a popup off a 1.0-power
 * bat squared up is 65 × 1.1 × 1.2 = 86, and off Mulholland it is 111. Well over
 * the gate. The result was a run scoring from third on a ball hit straight up
 * over the second baseman, which is not a thing that happens in baseball and is
 * exactly what Zane reported. The popup is out of FLY_OUTS now, so no amount of
 * power can turn an infield fly into a sacrifice; this number goes back to
 * doing the one job it is good at, which is separating a deep fly from a lazy
 * one among balls that actually reached the outfield.
 */
export const SAC_FLY_MIN_EV = 76;

/**
 * HOW STEEPLY IT HAS TO LEAVE THE BAT before it is a fly ball at all.
 *
 * ⚠️ EXIT VELOCITY ALONE COULD NOT TELL A FLY BALL FROM A LINE DRIVE, and once
 * LAUNCH_ANGLE widened `line_out` to [10, 38]° it had to. That one outcome now
 * covers the screamer caught at the shortstop's shoulder AND the lazy fly to
 * right — see the note in hit.ts — and SAC_FLY_MIN_EV was the only gate on it.
 * A line drive is by definition hit HARD, so a 100mph rope straight at the
 * second baseman cleared an 85mph bar comfortably and scored a man from third.
 * Nobody tags on a line drive to the infield. It is the same failure the popup
 * had before FLY_OUTS was narrowed: a velocity test standing in for a question
 * about the SHAPE of the ball.
 *
 * 20° is the real line, near enough — under it the ball is still climbing when
 * it reaches somebody, over it a fielder has to camp under it. It is also the
 * bar defense.ts reads to decide whether a man on first can be doubled off,
 * which is the same distinction seen from the other side, so the two plays
 * cannot both be true of one ball.
 */
export const SAC_FLY_MIN_ANGLE = 20;

/**
 * Can this out score the man from third?
 *
 * Exported because it is a rule the player has to be able to see explained,
 * and because a UI that wants to say "deep enough" needs the same predicate
 * rather than a second copy of it.
 */
export function isSacrificeFly(
  outcome: Outcome,
  exitVelocity: number,
  outs: number,
  bases: Bases,
  launchAngle?: number,
): boolean {
  return isDeepFly(outcome, exitVelocity, outs, launchAngle) && bases[2] !== null;
}

/**
 * A caught fly deep enough for ANYBODY to tag on, with an out to spare.
 *
 * ⚠️ SPLIT OUT OF isSacrificeFly() WHEN THE MAN ON SECOND LEARNED TO RUN. That
 * predicate asks two questions at once — "is this ball deep enough" and "is
 * there a man on third" — and the tag from second needs the first without the
 * second. Two runners can tag on one fly ball, so the depth test cannot keep
 * living inside a question about one particular bag.
 */
export function isDeepFly(
  outcome: Outcome,
  exitVelocity: number,
  outs: number,
  /**
   * Off the bat, in degrees. Omitted passes — which is exactly the old
   * behaviour, and what the CLI and the roguelike get: neither carries an angle
   * this far and neither has ever had a line drive to tell apart from a fly.
   */
  launchAngle: number = SAC_FLY_MIN_ANGLE,
): boolean {
  return (
    outs < 2 &&
    FLY_OUTS.has(outcome) &&
    exitVelocity >= SAC_FLY_MIN_EV &&
    launchAngle >= SAC_FLY_MIN_ANGLE
  );
}

/**
 * HOW OFTEN A MAN ON SECOND TAGS AND TAKES THIRD on a deep fly.
 *
 * ⚠️ LOWER THAN THE MAN ON THIRD GOING HOME, and it is not the same decision.
 * Scoring is worth a run and third base is worth a base, so the man on third
 * goes on almost anything he can; the man on second is trading a bag for the
 * chance of being doubled off, and the throw behind him goes to the bag he
 * left. 0.55 × his legs puts a burner near the top of the range and a catcher
 * nowhere near it.
 *
 * ponytail: no second throw at the tagging runner. The arm gets ONE chance per
 * play and it spends it on the man going home — see tagUp() — because that is
 * the run. The man taking third goes or he holds.
 */
export const TAG_UP_RATE = 0.55;

/**
 * THE TAG-UP. Everyone who can advance on a caught fly does, and the arm gets
 * its one throw at the man who is scoring.
 *
 * Lead runner first, same as every other advance in this file: whether second
 * can go depends on whether third just emptied.
 *
 * `scored` is what the play has already counted, and is untouched here — it is
 * taken only so the caller's arithmetic stays the single authority on runs.
 */
function tagUp(
  bases: Bases,
  _scored: number,
  rolls?: readonly [number, number, number],
  /**
   * THE THROW HOME, pre-rolled — the same `extraBase` die rollFielding() puts
   * on every ball in play.
   *
   * ⚠️ IT IS A DIE NOBODY WAS USING. `extraBase` is only ever read by advance(),
   * which a caught fly never reaches, so on every fly ball in the game that
   * roll was drawn and thrown away. Spending it here costs no draw, shifts no
   * seeded season, and buys the one thing a sacrifice fly was missing.
   */
  arm?: { odds: number; roll: number },
): { bases: Bases; runs: number; thrownOut: ThrownOut | null } {
  const next: [Runner | null, Runner | null, Runner | null] = [...bases];
  let runs = 0;
  let thrownOut: ThrownOut | null = null;

  // The man on third goes. That is the sacrifice fly, and on a ball this deep
  // he goes unconditionally — see SAC_FLY_MIN_EV. What is NOT unconditional any
  // more is that he gets there: see TAG_THROW.
  const third = next[2];
  if (third) {
    next[2] = null;
    if (arm && gunDown(arm.odds * TAG_THROW, arm.roll, third.speed)) {
      thrownOut = { runner: third, at: 4, batter: false };
    } else {
      runs++;
    }
  }

  // ...and the man on second takes the bag he just vacated, if he goes. He is
  // not thrown at whether or not the man in front of him was: there is one ball
  // and it went to the plate.
  const second = next[1];
  if (second && next[2] === null) {
    const goes = rolls ? rolls[1]! < odds(second.speed, TAG_UP_RATE) : false;
    if (goes) {
      next[2] = second;
      next[1] = null;
    }
  }

  return { bases: next, runs, thrownOut };
}

/** A walk pushes only the runners it has to. Bases loaded forces in a run. */
function walk(bases: Bases, batter: Runner): { bases: Bases; runs: number } {
  const next: [Runner | null, Runner | null, Runner | null] = [...bases];
  const open = next.indexOf(null);

  // Bases loaded: the man on third is forced home, everyone else shuffles up.
  if (open === -1) return { bases: [batter, next[0]!, next[1]!], runs: 1 };

  // Only the runners between the batter and the first open bag are forced.
  // A man on second with first empty does not move.
  for (let i = open; i > 0; i--) next[i] = next[i - 1]!;
  next[0] = batter;
  return { bases: next, runs: 0 };
}

/**
 * A runner takes the next base. The inning layer only moves them; whether
 * they made it is baserunning.ts's decision.
 */
export function moveRunner(bases: Bases, from: number): Bases {
  const next: [Runner | null, Runner | null, Runner | null] = [...bases];
  next[from + 1] = next[from]!;
  next[from] = null;
  return next;
}

/** Caught stealing: the runner is erased. The out is recorded separately. */
export function removeRunner(bases: Bases, from: number): Bases {
  const next: [Runner | null, Runner | null, Runner | null] = [...bases];
  next[from] = null;
  return next;
}

/**
 * THE DOUBLE PLAY, APPLIED — the man forced at `at` is erased and the batter is
 * out at first.
 *
 * ⚠️ IT WAS `removeRunner(bases, 0)` AND NOTHING ELSE, WHICH IS TWO BUGS IN ONE
 * LINE. It always took the man on FIRST, whatever the bases looked like — so a
 * grounder with the bases loaded and the infield drawn in went 6-4-3 and let
 * the run walk home, when the whole reason a manager plays the infield in is
 * that the ball goes to the plate. And it FROZE EVERYBODY ELSE: the runner on
 * third stood still on every double play ever turned here, so the routine
 * run-scoring 6-4-3 — a real, ordinary, several-times-a-week play — scored
 * nothing, ever.
 *
 * ⚠️ IT IS fieldersChoice() WITH NOBODY REACHING, and writing it that way is the
 * point rather than a shortcut. A double play IS a fielder's choice plus the
 * throw to first: the same bag, the same men running behind it, the same rule
 * about the man on third. Two implementations of "who is forced and who
 * gambles" would disagree eventually, and the one that disagreed would be the
 * one under the picture the player is watching.
 *
 * ⚠️ THE CALLER GATES THE RUNS ON `outs === 0`, NOT THIS FUNCTION. When the
 * double play is the second and third outs of the half, no run scores on it —
 * the third out was a force. See applyAtBat().
 */
function turnTwo(
  bases: Bases,
  at: ForceBag,
  rolls?: readonly [number, number, number],
  infieldIn = false,
): { bases: Bases; runs: number } {
  return fieldersChoice(bases, null, at, rolls, infieldIn);
}

/**
 * Chance a runner who is NOT forced goes anyway on a ground ball.
 *
 * The man on third breaking for the plate is the productive out — it happens
 * on roughly half of the grounders he could go on, because half the time the
 * infield is in or the ball is hit at the wrong man. Going first-to-second is
 * free (he was forced); second-to-third with first empty is the ball hit to
 * the right side, which is about a third of them.
 */
export const GROUND_SEND_HOME = 0.45;
export const GROUND_SEND_UP = 0.35;

/**
 * ⚠️ WHAT AN ORDINARY GROUND OUT DOES TO THE BASES — added 2026-08-25, and
 * before this it did NOTHING. The batter was out at first and every runner
 * stood still: no forced runner moving up, no run scoring from third, no
 * productive out of any kind. The file's own note called the productive ground
 * out "the obvious next one" and it stayed obvious for nine days.
 *
 * The rule, lead runner first so nobody runs into the back of the man ahead:
 *
 *   FORCED runners always go. The batter is out at first, but the men behind
 *   him broke with the pitch and had nowhere to go back to. A runner is forced
 *   when every bag behind him is occupied.
 *   EVERYONE ELSE rolls — see the two rates above.
 *
 * ✅ The FIELDER'S CHOICE — lead man erased at a bag, batter safe — landed as
 * fieldersChoice() below, which is this function plus one substitution. The
 * double play is the same thing again with nobody reaching. This one is now
 * only the case where the batter really is retired at first.
 */
function groundOut(
  bases: Bases,
  rolls?: readonly [number, number, number],
  /**
   * THE INFIELD IS IN. The four of them are playing shallow enough to throw
   * home, so the man on third does not go on a ball he would otherwise gamble
   * on — that is the entire point of the alignment, and the price is paid in
   * the holes it opens, which placement.ts charges separately.
   *
   * ⚠️ IT DOES NOT STOP A FORCED RUNNER. With the bases loaded he has nowhere
   * to go back to and the play is at the plate anyway.
   */
  infieldIn = false,
): { bases: Bases; runs: number } {
  const next: [Runner | null, Runner | null, Runner | null] = [null, null, null];
  let runs = 0;
  // The bag the man ahead stopped on, same convention advance() uses: 1, 2, 3
  // are the bags and 4 means he scored, so the road behind him is open.
  let ceiling = 4;

  for (let from = 2; from >= 0; from--) {
    const who = bases[from];
    if (!who) continue;

    const forced = bases.slice(0, from).every((r) => r !== null);
    const to = from + 2; // ninety feet, as a bag number
    const clear = to >= 4 || to < ceiling;
    // Nobody rolled a die: forced runners still have to go, and nobody else
    // does. That is the old frozen behaviour for every caller passing CLEAN.
    const held = infieldIn && to >= 4;
    const sends =
      forced ||
      (!held &&
        !!rolls &&
        rolls[from]! < odds(who.speed, to >= 4 ? GROUND_SEND_HOME : GROUND_SEND_UP));

    if (!clear || !sends) {
      next[from] = who;
      ceiling = from + 1;
      continue;
    }

    if (to >= 4) runs++;
    else {
      next[to - 1] = who;
      ceiling = to;
    }
  }

  return { bases: next, runs };
}

/**
 * THE FIELDER'S CHOICE — the man forced at second is out, the batter is safe.
 *
 * ⚠️ THE COMMONEST OUT IN BASEBALL, AND IT WAS NOT IN THE GAME. Every ground
 * ball retired the BATTER at first and handed the man on first second base for
 * nothing. One out either way, so no run total ever noticed; but it means the
 * throw the player watches on a grounder with a man on first always went to
 * the wrong bag, and nobody was ever thrown out at the one the play was
 * actually at. See FORCE_AT_SECOND in fielding.ts for the note this pairs with.
 *
 * ⚠️ IT IS groundOut() PLUS ONE SUBSTITUTION, and deliberately not a second set
 * of advancement rules. Everyone who is not the man on first runs the ground
 * ball exactly as they always did — the man on third still gambles on the
 * plate, the man on second still takes third on a ball to the right side. The
 * only difference is at the end: the runner groundOut() moved from first to
 * second never got there, and the batter is standing on first behind him.
 */
function fieldersChoice(
  bases: Bases,
  /** Null when he did NOT reach — which is the double play. See turnTwo(). */
  batter: Runner | null,
  /** 2, 3 or 4 — the bag the throw went to. See LEAD_FORCE in fielding.ts. */
  at: ForceBag,
  rolls?: readonly [number, number, number],
  infieldIn = false,
): { bases: Bases; runs: number } {
  const g = groundOut(bases, rolls, infieldIn);
  // g.bases[0] is always null — nobody advances INTO first on a ground ball —
  // so the batter drops straight in behind everybody.
  const next: [Runner | null, Runner | null, Runner | null] = [batter, g.bases[1], g.bases[2]];

  // ⚠️ THE MAN WHO IS OUT IS THE ONE groundOut() JUST PUT ON `at`, because a
  // force is exactly "he was made to run there and the ball beat him". Taking
  // him off the bag afterwards is the whole of the rule, and it means the three
  // bags need no separate cases: second is g.bases[1], third is g.bases[2], and
  // the plate is a run that groundOut() counted and does not get to keep.
  if (at === 4) return { bases: next, runs: Math.max(0, g.runs - 1) };
  next[at - 1] = null;
  return { bases: next, runs: g.runs };
}

/**
 * Fold one finished at-bat into the match. Rolls the inning on the third out
 * and ends the match after the last one.
 *
 * `fielding` is what the defence did with a ball already ruled an out — see
 * fielding.ts, which rolls it. Default is a clean play, so every existing
 * caller and test keeps its old behaviour exactly.
 *
 * ⚠️ ponytail, RESOLVED 2026-08-16 — the pair is closed.
 *
 * The history, because the balance depends on it. The original note said an out
 * never scores a runner (no sacrifice fly, no productive ground out) and never
 * costs two, and that "the two omissions pull in opposite directions, which is
 * the only reason it is safe to leave both out." 2026-08-14 added the DOUBLE
 * PLAY, removing one half of that pair and pushing run scoring down.
 *
 * 2026-08-16 adds the SACRIFICE FLY, which is the paired lever that puts the
 * runs back, plus the EXTRA BASE in advance(). Both push scoring up, so the
 * three changes are meant to be judged together and not one at a time:
 *
 *   double play    −runs, and it lands on slow hitters with a man on first
 *   sacrifice fly  +runs, and only with a man on THIRD and under two outs
 *   extra base     +runs, and only for the fast third of the roster
 *
 * All three read the same `speed` stat that stealing already read, which is
 * the point — legs now matter on a ball you hit, not only on a ball you steal.
 *
 * ✅ The productive ground out — "still absent and the obvious next one" here
 * for nine days — landed 2026-08-25. See groundOut() above: forced men always
 * go, everyone else rolls GROUND_SEND_HOME / GROUND_SEND_UP. It is a fourth
 * +runs lever and it belongs in the list to be judged with the other three.
 *
 * If scoring comes out too high, cut in this order: EXTRA_BASE_SPEED up first
 * (it is the broadest of the three), then SAC_FLY_MIN_EV up. Do not touch
 * DOUBLE_PLAY_RATE, which was tuned against play.
 */
export function recordAtBat(
  state: MatchState,
  result: AtBatResult,
  batter: Runner = ANON,
  fielding: FieldingResult = CLEAN,
  defense: { infieldIn?: boolean } = {},
): MatchState {
  if (state.over) throw new Error('match already over');

  const play = applyAtBat(state, result, batter, fielding, defense);
  const outs = play.outs;
  const bases = play.bases;
  const runs = state.runs + play.runs;

  if (outs < 3) return { ...state, outs, runs, bases };

  // Third out: close the inning and post your half to the line score.
  const scoredThisInning = runs - state.byInning.reduce((a, b) => a + b, 0);
  const inning = state.inning + 1;
  return {
    ...state,
    inning,
    outs: 0,
    bases: EMPTY_BASES,
    runs,
    byInning: [...state.byInning, scoredThisInning],
    over: inning > state.innings,
  };
}

/** Outs and bases, with no scoreboard attached. */
export interface PlayState {
  outs: number;
  bases: Bases;
}

/** The same, plus what the at-bat scored. */
export interface PlayResult extends PlayState {
  runs: number;
  /**
   * HOW MANY BAGS THE BATTER ENDED ON — 1 for a single he did not stretch, 2
   * for one he did, 4 for a home run, 0 when he never reached.
   *
   * ⚠️ THE REPLAY USED TO DERIVE THIS FROM THE OUTCOME, and it cannot any
   * more: a stretched single is still scored a single and leaves him standing
   * on second. A picture that ran him to first under a scoreboard that had him
   * on second is the two halves of one play disagreeing, which is the failure
   * this whole file's notes keep circling.
   */
  batterTo: number;
  /**
   * The man gunned down going for one too many, or null. Carried out of here
   * because the scorer needs his NAME and his BAG — "thrown out" with neither
   * is a line nobody can read, and this is the only out on the play that did
   * not happen to the batter.
   */
  thrownOut?: ThrownOut | null;
}

/**
 * ⚠️ EVERY BASEBALL RULE ABOUT WHAT AN AT-BAT DOES TO OUTS AND BASES LIVES HERE.
 *
 * Extracted from recordAtBat() 2026-08-19, when the two-sided game in
 * src/game/ needed the same rules for both halves of an inning. It reads outs
 * and bases and returns outs, bases and runs — it does NOT know about innings,
 * line scores, or whose half it is, which is exactly why both callers can
 * share it.
 *
 * The alternative was a second implementation of walks-that-force, the sac fly
 * and the double play inside the new game state. Two copies of the rules is
 * two copies that disagree eventually, and the one that disagrees is the one
 * the player is looking at.
 */
export function applyAtBat(
  state: PlayState,
  result: AtBatResult,
  batter: Runner = ANON,
  fielding: FieldingResult = CLEAN,
  /**
   * WHAT THE DEFENCE CALLED, for the one alignment that changes a rule rather
   * than only the geometry. Omitted plays it straight — see groundOut().
   */
  defense: { infieldIn?: boolean } = {},
): PlayResult {
  let { outs, bases } = state;
  let runs = 0;
  let thrownOut: ThrownOut | null = null;
  // How many bags the man at the plate ended on. The replay cannot read it off
  // the outcome once he is allowed to stretch — see advance().
  let batterTo = 0;

  switch (result.kind) {
    case 'strikeout':
      outs++;
      break;

    // A hit batsman takes first exactly like a walk does, forcing only what
    // it has to. Same advance, different way of earning it.
    case 'walk':
    case 'hit_by_pitch': {
      const w = walk(bases, batter);
      bases = w.bases;
      runs += w.runs;
      break;
    }

    case 'in_play': {
      const { outcome } = result.hit;
      if (isOut(outcome)) {
        if (fielding.error) {
          // Booted. Nobody is out and the batter is standing on first, which
          // is the same movement a single produces — reuse it rather than
          // writing a second advance path that can drift out of step.
          // It is NOT a hit: the caller tallies off result.hit.isHit, which
          // is false here, so batting average is untouched. That is correct.
          const a = advance(bases, 1, batter);
          bases = a.bases;
          runs += a.runs;
        } else if (result.hit.bunted && outcome === 'ground_out' && outs < 2) {
          // THE SACRIFICE. He gave himself up and everyone moves ninety feet —
          // which is the entire reason anyone lays one down, and the reason
          // the `bunted` flag has to travel this far. Checked BEFORE the double
          // play: you do not turn two on a bunt, and a bunt that scores a man
          // from third is a squeeze, not a fielder's choice.
          const lead = bases[2] !== null;
          bases = [null, bases[0], bases[1]];
          if (lead) runs++;
          outs++;
        } else if (fielding.triplePlay) {
          // ⚠️ THREE OUTS AND NOTHING SCORES, AND THAT IS A RULE RATHER THAN A
          // SIMPLIFICATION. Every out on a triple play is a force or the play at
          // first, and no run counts on a play whose third out is either — so
          // even the man on third, forced home with the bases loaded, gets
          // nothing. The half is over, so the bases are wiped for the picture's
          // sake and for nothing else. See TRIPLE_PLAY in fielding.ts.
          outs += 3;
          bases = EMPTY_BASES;
        } else if (fielding.doubledOff) {
          // THE LINE DRIVE. Caught on the fly, and the man on first never got
          // back — the only out in this file recorded with a TAG. Nobody else
          // moves: they are all diving back to the bag they left.
          outs += 2;
          bases = removeRunner(bases, 0);
        } else if (fielding.doublePlay) {
          // ⚠️ THE RUNS ARE GATED ON THE OUTS THAT WERE ALREADY THERE. With
          // nobody out the double play is the first and second, and the man on
          // third scores ahead of it — the ordinary RBI ground ball. With ONE
          // out it is the second and third, the third of them a force, and no
          // run can cross on it.
          const t = turnTwo(bases, fielding.forceAt ?? 2, fielding.advanceRolls, defense.infieldIn);
          bases = t.bases;
          if (outs === 0) runs += t.runs;
          outs += 2;
        } else {
          // THE SACRIFICE FLY — checked BEFORE the out is recorded, because
          // "fewer than two outs" is a question about the count when the ball
          // was hit, not after the catch.
          if (isDeepFly(outcome, result.hit.exitVelocity, outs, result.hit.launchAngle)) {
            // ⚠️ THE TAG-UP, AND IT IS TWO RUNNERS RATHER THAN ONE. The
            // sacrifice fly has been here since 2026-08-16 and only ever moved
            // the man on THIRD; the man on SECOND stood still on every fly ball
            // ever caught in this game, which is the other half of the same
            // play and about as common. inning.ts's own test said so in a
            // comment — "no runner advancing from second on a sac fly. He can
            // tag on a deep one in real ball."
            //
            // LEAD RUNNER FIRST, for the reason every advance in this file does
            // it: the man on second is only going if third is CLEAR, and
            // whether it is clear depends on whether the man who was standing
            // there just scored.
            //
            // ⚠️ AND THE ARM GETS ITS THROW. The man from third is not home
            // until the ball is not — see TAG_THROW. When it beats him the
            // sacrifice fly is two outs and no run, which is the play the whole
            // outfield-arm rating existed to make possible.
            const tag = tagUp(bases, runs, fielding.advanceRolls, fielding.extraBase);
            bases = tag.bases;
            runs += tag.runs;
            if (tag.thrownOut) {
              outs++;
              thrownOut = tag.thrownOut;
            }
          } else if (outcome === 'ground_out') {
            // ⚠️ WHICH MAN IS OUT is the defence's call, not this file's: with a
            // force at second they mostly take the lead runner and the batter
            // reaches. See fieldersChoice(), and FORCE_AT_SECOND for the roll.
            //
            // ⚠️ THE FORCE IS NOT GATED ON `outs < 2` AND THE PLAIN GROUND OUT
            // IS. They are different questions. A force with two down is the
            // third out at the BAG — perfectly legal, and the commonest way an
            // inning ends — while the plain ground ball's advancement only
            // matters when there are outs left to use it. A run never crosses
            // on either one with two away, which is what the `outs < 2` on
            // `runs` says; the bases are about to be wiped by the half rolling
            // over, so they are set for the picture's sake and nothing else.
            const g =
              fielding.forceAt && bases[0] !== null
                ? fieldersChoice(bases, batter, fielding.forceAt, fielding.advanceRolls, defense.infieldIn)
                : outs < 2
                  ? groundOut(bases, fielding.advanceRolls, defense.infieldIn)
                  : null;
            if (g) {
              bases = g.bases;
              if (outs < 2) runs += g.runs;
            }
          }
          outs++;
        }
      } else if (isHit(outcome)) {
        // Hits are the only advance where a runner takes the extra base. A
        // walk forces and does not stretch, and the booted-ball path below
        // deliberately does not either — an error is already a gift, and
        // stacking a stretch on top of it turns one bad hop into three bases.
        const a = advance(
          bases,
          BASES_GAINED[outcome],
          batter,
          true,
          fielding.extraBase,
          fielding.advanceRolls,
          fielding.stretch,
        );
        bases = a.bases;
        runs += a.runs;
        batterTo = a.batterTo;
        // Gunned down going for one too many. It is an out like any other, and
        // it is the only out in the file that happens to a man who was not at
        // the plate.
        if (a.thrownOut) {
          outs++;
          thrownOut = a.thrownOut;
        }
      } else {
        // 'foul' - atBat.ts never ends an at-bat on one.
        throw new Error(`unreachable at-bat outcome: ${outcome}`);
      }
      break;
    }

    default: {
      // Adding a member to AtBatResult without handling it here is now a
      // COMPILE error, not a silent fall-through. hit_by_pitch got in without
      // tsc noticing, which is exactly the class of gap this closes.
      const unhandled: never = result;
      throw new Error(`unhandled at-bat result: ${JSON.stringify(unhandled)}`);
    }
  }

  return { outs, bases, runs, thrownOut, batterTo };
}
