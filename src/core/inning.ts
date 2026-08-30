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
import { CLEAN, gunDown, type FieldingResult } from './fielding.ts';

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

/** A runner who changed bags between two states. -1 means he came from home. */
export interface RunnerMove {
  name: string;
  from: number;
  to: number;
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
    moves.push({ name: runner.name, from: from >= 0 ? from : -1, to });
  });

  return moves;
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
export function scorersFrom(prev: Bases, next: Bases, scored: number): number[] {
  if (scored <= 0) return [];
  const stillOn = new Set(next.filter(Boolean).map((r) => r!.name));
  const gone: number[] = [];
  for (let i = 2; i >= 0; i--) {
    const r = prev[i];
    if (r && !stillOn.has(r.name)) gone.push(i);
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

const BASES_GAINED: Record<Outcome, number> = {
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
): { bases: Bases; runs: number; thrownOut: ThrownOut | null } {
  const next: [Runner | null, Runner | null, Runner | null] = [null, null, null];
  let runs = 0;
  let thrownOut: ThrownOut | null = null;

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
    if (
      canStretch &&
      from >= 0 &&
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
      // No die means nobody rolled one — the CLI and every caller that passes
      // CLEAN — so fall back to the flat threshold this used to be.
      (rolls ? rolls[from]! < sendChance(who.speed, wants) : who.speed >= EXTRA_BASE_SPEED)
    ) {
      // ⚠️ NOW THERE IS A THROW. He used to take this base for free; the arm
      // out there gets one chance at him, and only one per play — there is one
      // ball and it can only be thrown to one base. See gunDown().
      if (arm && !thrownOut && gunDown(arm.odds, arm.roll, who.speed)) {
        thrownOut = { runner: who, at: wants };
        // He is off the bases and NOT counted in `next`. Everybody behind him
        // still moves: the throw went to the lead base, which is exactly why
        // the man behind takes the extra one on it. `ceiling` is deliberately
        // left where it was — the bag he was gunned down at is now empty.
        continue;
      }
      to = wants;
    }

    if (to >= 4) runs++;
    else {
      next[to - 1] = who;
      ceiling = to;
    }
  }

  return { bases: next, runs, thrownOut };
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
 * At 85 a `line_out` on good timing (95 × 0.95) qualifies, and a weakly hit
 * one does not. That is the intended shape — the sacrifice fly should be a fly
 * ball you hit, not an out you got lucky on.
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
export const SAC_FLY_MIN_EV = 85;

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
): boolean {
  return (
    outs < 2 && bases[2] !== null && FLY_OUTS.has(outcome) && exitVelocity >= SAC_FLY_MIN_EV
  );
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
 * The double play, applied. The batter is out at first and the runner forced
 * at second is erased; anyone else holds, same as any other out.
 *
 * ponytail: always 6-4-3. No 5-4-3 round the horn, no 4-6-3, no lead runner
 * taken at third, and no strike-him-out-throw-him-out. One shape, two outs.
 */
function turnTwo(bases: Bases): Bases {
  return removeRunner(bases, 0);
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
 * ponytail: the batter is always out at first. The FIELDER'S CHOICE — lead man
 * erased at second, batter safe — is a different out with the same shape, and
 * it needs the scorer to pick a bag before it is worth having. Add it when the
 * play-by-play starts caring who was retired.
 */
function groundOut(
  bases: Bases,
  rolls?: readonly [number, number, number],
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
    const sends =
      forced ||
      (!!rolls &&
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
 * The productive ground out is still absent and is the obvious next one.
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
): MatchState {
  if (state.over) throw new Error('match already over');

  const play = applyAtBat(state, result, batter, fielding);
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
): PlayResult {
  let { outs, bases } = state;
  let runs = 0;
  let thrownOut: ThrownOut | null = null;

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
        } else if (fielding.doublePlay) {
          outs += 2;
          bases = turnTwo(bases);
        } else {
          // THE SACRIFICE FLY — checked BEFORE the out is recorded, because
          // "fewer than two outs" is a question about the count when the ball
          // was hit, not after the catch.
          if (isSacrificeFly(outcome, result.hit.exitVelocity, outs, bases)) {
            bases = removeRunner(bases, 2);
            runs++;
          } else if (outcome === 'ground_out' && outs < 2) {
            // The ordinary ground ball. Forced men go, the rest take their
            // chances — see groundOut(). Gated on outs < 2 because the batter
            // being thrown out at first for the third out scores nobody,
            // however far down the line the runner from third got.
            const g = groundOut(bases, fielding.advanceRolls);
            bases = g.bases;
            runs += g.runs;
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
        );
        bases = a.bases;
        runs += a.runs;
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

  return { outs, bases, runs, thrownOut };
}
