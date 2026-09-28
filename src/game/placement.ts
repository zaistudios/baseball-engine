/**
 * WHERE THE BALL WENT, and what that is worth.
 *
 * ⚠️ THE GAP THIS FILLS. Until now the outcome table decided everything and
 * the ball's flight was decoration: plotBatted() ran only so the overhead
 * replay had something to draw, and web/plot.ts says so out loud — chaseReach()
 * is "the one place the replay is rigged", deriving the fielder's position from
 * an outcome that was already in the book. So a single was a single whether it
 * was a seeing-eye grounder or a rocket into the left-centre gap, and the
 * player never learned that hitting it WHERE THEY AREN'T is the actual skill.
 *
 * This reverses that for one specific thing: EXTRA BASES. The table still says
 * hit or out — that spine is ported from the prototype and the vault is
 * explicit that it is not the thing to redesign — but how FAR a hit goes is now
 * decided by where it landed relative to the nine men standing there.
 *
 * The rule, in one line: **a hit that lands a long way from anybody is worth
 * an extra base, and a hit dropped right next to somebody is not.**
 *
 * ⚠️ AND SINCE 2026-09-03, GEOMETRY ALSO DECIDES HIT OR OUT. This note used to
 * end by forbidding exactly that — "placement changes what a hit is worth, it
 * does not change how often you get one" — on the grounds that the run
 * environment took three rounds of tuning and geometry must not be allowed near
 * it. The risk was real; the conclusion was not. With the flip banned, a line
 * drive at the shortstop and one into the hole he was not standing in were the
 * same event, so the skill the whole file exists to teach could never actually
 * be practised.
 *
 * It is decided by who can get there — cutOff() on the ground, catchFly() in
 * the air — and the balance is measured with scripts/balance.ts, not argued.
 */

import type { HitResult } from '../core/hit.ts';
import { isHit, isOut, type Outcome } from '../core/hitTables.ts';
import type { AtBatResult } from '../core/atBat.ts';
import {
  plotBatted,
  nearestFielder,
  groundBallMs,
  FIELDERS,
  GROUND_ANGLE,
  REACTION_MS,
  INFIELD_RANGE,
  REPLAY_CUT_MS,
  runToFirstMs,
  rollFor,
  ballAlongFt,
  restFt,
  throwsFrom,
  type Fielder,
  type Plot,
  type Roll,
} from './plot.ts';

// It lives in plot.ts so defense.ts can run a pivot on it without importing
// this file's teams. Re-exported for everything that asks here.
export { INFIELD_RANGE };
import { fieldersFor, type Shift } from './shift.ts';
import { wallAt, type Park } from './teams.ts';

/** Where on the field it finished, in words. */
export type Zone =
  | 'infield'
  | 'shallow'
  | 'left'
  | 'left-center'
  | 'center'
  | 'right-center'
  | 'right'
  | 'down-the-line'
  | 'wall'
  /** Outside the lines. Only a foul ball is ever here — see place(). */
  | 'foul-ground';

export interface Placement {
  distFt: number;
  dirDeg: number;
  zone: Zone;
  /** Feet from where the ball finished to the nearest man, before he moves. */
  gapFt: number;
  /** Scorer's number of that man, 1-9. */
  fielderNum: number;
  /** True when it landed a long way from anybody. */
  inTheGap: boolean;
  /**
   * THE FENCE THIS BALL WAS HIT TOWARD, in feet — 400 in a park-less game.
   *
   * The zone words and the replay read it; the roll stops at it (rollFor()),
   * so a 302-foot corner turns a wall ball into a carom sooner than centre.
   */
  wallFt: number;
  /**
   * WHO CUT THE GROUND BALL OFF — set on every fair ball on the ground, and on
   * nothing else. See cutOff(). When it was fielded, `fielderNum` is that man;
   * when it got through, `fielderNum` is the outfielder who picks it up and
   * this names the infielder it got past.
   */
  cutOff?: CutOff;
  /**
   * WHO GOT TO THE BALL IN THE AIR — set on every fair ball in the air that is
   * not a home run, and on nothing else. See catchFly(). `fielderNum` is that
   * man, whether he caught it or it dropped in front of him.
   */
  airCatch?: AirCatch;
  /**
   * WHO RAN DOWN A BALL NOBODY CAUGHT OR CUT OFF — set on a fair hit that got
   * into the outfield grass or dropped in, and on nothing else. `fielderNum`
   * is that man. See pickUp().
   */
  pickup?: Pickup;
}

/**
 * How far from the nearest fielder a ball has to land to count as "in the gap".
 *
 * ⚠️ MEASURED, NOT GUESSED, AND RE-MEASURED WHENEVER THE FLIGHT MODEL MOVES.
 * The first guess was 52ft, wrong by half: nine fielders cover a very large
 * area, and against the real distribution that caught 72% of every ball in
 * play. It was then raised to 128 — and 128 was wrong the other way, because it
 * sat ABOVE the ceiling of the population it was being asked about. No double
 * could reach it (p90 of a double's gap was 118), so `inTheGap` was false on
 * essentially every hit, the single-to-double upgrade never once fired, and
 * every double in the game printed "double past centre" instead of "into the
 * gap". A threshold nothing can cross is not a threshold.
 *
 * 100 is set against the NON-HOME-RUN hits, which is the population that asks
 * the question: single p90 83, double p90 118, triple p90 83. So it means
 * roughly the top fifth of doubles and almost no singles, which is what "in
 * space" should mean.
 *
 * ⚠️ RE-MEASURE WITH scripts/place.ts AFTER ANY CHANGE TO EXIT VELOCITY, DRAG
 * OR SPRAY. All three move where balls land, and this is a distance in feet.
 */
export const GAP_FT = 100;

const feetXY = (distFt: number, dirDeg: number) => {
  const rad = (dirDeg * Math.PI) / 180;
  return { x: Math.sin(rad) * distFt, y: Math.cos(rad) * distFt };
};

/** Straight-line feet between two polar points. */
function gapTo(
  distFt: number,
  dirDeg: number,
  num: number,
  fielders: readonly Fielder[] = FIELDERS,
): number {
  const f = fielders.find((x) => x.num === num);
  if (!f) return 0;
  const a = feetXY(distFt, dirDeg);
  const b = feetXY(f.distFt, f.dirDeg);
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * ⚠️ `wall` IS A BALL THAT DIED ON THE FENCE, NOT ANY DEEP BALL — and getting
 * that wrong is why every home run in the game was hit to centre field.
 *
 * This read `distFt >= WALL_FT -> 'wall'` first, and plot.ts floors a home run
 * ABOVE the wall by construction, so every single one landed in this branch.
 * `wall` has no side to it, so describePlay() had to carry a hack that turned
 * it into 'centre' — meaning a ball hooked 40° down the left-field line and a
 * ball into the right-field seats printed the same sentence. The direction was
 * right there in the same argument list and nothing looked at it.
 *
 * So the band is now narrow and IN-PARK: from a few feet short of the fence up
 * to the fence itself, which is exactly where plot.ts parks a non-home-run it
 * had to hold back (`WALL_FT - 8`). Anything past the wall falls through to the
 * directional zones below and gets named for the field it actually left over.
 */
const WALL_BAND_FT = 14;

function zoneFor(distFt: number, dirDeg: number, wallFt: number): Zone {
  if (distFt >= wallFt - WALL_BAND_FT && distFt <= wallFt) return 'wall';
  if (distFt < 150) return 'infield';
  if (distFt < 200) return 'shallow';
  // Down the line is a direction thing, not a distance thing.
  if (Math.abs(dirDeg) > 36) return 'down-the-line';
  if (dirDeg <= -22) return 'left';
  if (dirDeg <= -8) return 'left-center';
  if (dirDeg < 8) return 'center';
  if (dirDeg < 22) return 'right-center';
  return 'right';
}

/**
 * WHICH SIDE OF THE PLATE A FOUL WENT, in the three ways that read differently.
 *
 * Past ±90 is genuinely behind home. Between the line and there it is the
 * corner — the first- or third-base side, in the seats or off the netting.
 */
export type FoulSide = 'back' | 'first' | 'third';

export const foulSide = (dirDeg: number): FoulSide =>
  Math.abs(dirDeg) >= 90 ? 'back' : dirDeg > 0 ? 'first' : 'third';

const FOUL_WORDS: Record<FoulSide, string> = {
  back: 'straight back',
  first: 'off down the first-base side',
  third: 'off down the third-base side',
};

/**
 * WHO IS UNDER A FOUL POP.
 *
 * ⚠️ NOT nearestFielder(). That function measures against the nine standing in
 * FAIR territory, and it is right for every ball hit into it — but nobody
 * plays a position in foul ground, so asking it who is nearest a ball behind
 * the plate gets whichever of the nine happens to be least far away, which is
 * usually the pitcher. The three men who actually catch foul pops are the
 * catcher and the two corners, and which one it is depends only on the side.
 */
const foulCatcher = (dirDeg: number): number => {
  const side = foulSide(dirDeg);
  return side === 'back' ? 2 : side === 'first' ? 3 : 5;
};

/**
 * Plot one batted ball and describe where it finished.
 *
 * ⚠️ A FOUL DOES NOT GO THROUGH THE FAIR MACHINERY. `zoneFor`, `nearestFielder`
 * and the gap are all statements about the wedge between the lines — "the
 * left-center gap" is not a place a foul ball can be, and a gap distance
 * measured to a fielder who is not playing there is a number with nothing
 * behind it. So a foul gets its own short answer: how far, which side, and who
 * would be under it. `inTheGap` is false by construction, which also keeps
 * stretchChance() from ever looking at one.
 */
export function place(
  hit: HitResult,
  park?: Park,
  /**
   * WHERE THE DEFENCE IS STANDING. Omitted is standard depth, which is what
   * every caller wanted before shifts existed. game/shift.ts builds the moved
   * tables; a shifted man changes both who chases the ball and how much room
   * the hitter found, and the race decides whether he gets there.
   */
  fielders: readonly Fielder[] = FIELDERS,
  /** The glove at each number, for the cut-off. See withPlacement(). */
  reachAt: (fielderNum: number) => number = () => 1,
): Placement {
  /**
   * ⚠️ THE PARK IS RESOLVED TO ONE NUMBER HERE, and this is the only place it
   * happens. plot.ts is a geometry leaf and must not import a league, so it
   * takes a fence in feet; wallAt() is what turns three fences and an easing
   * curve into that number for the direction this particular ball went.
   */
  const wallFt = wallAt(hit.direction, park);
  const plot = plotBatted(hit.outcome, hit.exitVelocity, hit.launchAngle, hit.direction, wallFt);
  const dirDeg = hit.direction;

  if (hit.outcome === 'foul' || hit.outcome === 'foul_out') {
    return {
      distFt: plot.distFt,
      dirDeg,
      zone: 'foul-ground',
      gapFt: 0,
      fielderNum: foulCatcher(dirDeg),
      inTheGap: false,
      wallFt,
    };
  }

  // ⚠️ A GROUND BALL IS PLAYED WHERE IT PASSES, NOT WHERE IT STOPS. Picking the
  // man nearest the resting point is how a 240-foot roller dead centre went to
  // the centre fielder — 78 feet from it against the middle infielders' 112 —
  // who then threw the batter out at first. See cutOff().
  const cut = hit.launchAngle < GROUND_ANGLE ? cutOff(plot, dirDeg, fielders, reachAt) : undefined;
  // A ball in the air is played by whoever gets there. A home run is not on
  // the field to be caught.
  const air = !cut && hit.outcome !== 'home_run' ? catchFly(plot, dirDeg, fielders, reachAt) : undefined;
  const loose = (cut?.past || (air && !air.caught)) && hit.outcome !== 'home_run';
  const pickup = loose
    ? pickUp(plot, rollFor(plot, hit.exitVelocity, hit.launchAngle, wallFt), dirDeg, fielders, reachAt, !!cut, wallFt)
    : undefined;
  const num = pickup
    ? pickup.num
    : air
      ? air.num
      : cut && !cut.past
        ? cut.num
        : nearestFielder(plot.distFt, dirDeg, cut ? fielders.filter((f) => f.num >= 7) : fielders).num;
  const gapFt = gapTo(plot.distFt, dirDeg, num, fielders);

  return {
    distFt: plot.distFt,
    dirDeg,
    zone: zoneFor(plot.distFt, dirDeg, wallFt),
    gapFt,
    fielderNum: num,
    inTheGap: gapFt >= GAP_FT,
    wallFt,
    ...(cut ? { cutOff: cut } : {}),
    ...(air ? { airCatch: air } : {}),
    ...(pickup ? { pickup } : {}),
  };
}

// --------------------------------------------------------------- the cut-off

/** The men who can cut a ground ball off. The catcher is behind it. */
const INFIELDERS: readonly number[] = [1, 3, 4, 5, 6];

/** Who got to a ground ball, or who came closest, and where and when. */
export interface CutOff {
  /** Scorer's number of the man who fielded it — or, when nobody did, who came closest. */
  num: number;
  /** Feet from home along the ball's line: where he fields it, or where it went by him. */
  alongFt: number;
  /** Contact-clock ms the ball gets there. groundBallMs(), the picture's clock. */
  ms: number;
  /** He got there first. */
  fielded: boolean;
  /** Share of his run he had made when the ball got there. 1 when he fielded it. */
  reach: number;
  /**
   * It rolled by every infielder into the outfield. False with `fielded` false
   * is a ball that died in the dirt before anybody reached it: an infield hit,
   * picked up by `num`.
   */
  past: boolean;
}

/**
 * STEP (a) FOR GROUND BALLS: does anybody cut it off?
 *
 * The ball runs a straight line from home at `dirDeg`. For each infielder, the
 * spot he runs to is the foot of his perpendicular on that line — or, if the
 * ball stops short of it, the ball itself. He gets there at `REACTION_MS` plus
 * the run at INFIELD_RANGE scaled by his glove; the ball gets there at
 * groundBallMs(). They are asked in the order the ball reaches them, and the
 * first man who beats it has it.
 *
 * No new RNG and no new ratings. Nothing here rolls; it measures.
 */
export function cutOff(
  plot: Plot,
  dirDeg: number,
  fielders: readonly Fielder[],
  reachAt: (fielderNum: number) => number,
): CutOff {
  const rad = (dirDeg * Math.PI) / 180;
  const ux = Math.sin(rad);
  const uy = Math.cos(rad);
  const tries = fielders
    .filter((f) => INFIELDERS.includes(f.num))
    .map((f) => {
      const p = feetXY(f.distFt, f.dirDeg);
      const foot = p.x * ux + p.y * uy;
      const along = Math.max(0, Math.min(foot, plot.distFt));
      const runFt = Math.hypot(p.x - ux * along, p.y - uy * along);
      const ms = groundBallMs(plot, along);
      const speed = INFIELD_RANGE * reachAt(f.num);
      const runMs = REACTION_MS + runFt / speed;
      const reach = runFt === 0 ? 1 : Math.max(0, Math.min(1, ((ms - REACTION_MS) * speed) / runFt));
      return { num: f.num, alongFt: along, ms, runMs, reach, fielded: runMs <= ms, stopped: foot >= plot.distFt };
    })
    .sort((a, b) => a.alongFt - b.alongFt);

  const pick = (t: (typeof tries)[number], past: boolean): CutOff => ({
    num: t.num,
    alongFt: t.alongFt,
    ms: t.ms,
    fielded: t.fielded,
    reach: t.fielded ? 1 : t.reach,
    past,
  });

  const got = tries.find((t) => t.fielded);
  if (got) return pick(got, false);
  // It died in the dirt short of somebody: whoever gets to it first has it.
  const dead = tries.filter((t) => t.stopped).sort((a, b) => a.runMs - b.runMs)[0];
  if (dead) return pick(dead, false);
  // Past everybody. The man drawn diving for it is the one who came closest.
  const near = [...tries].sort((a, b) => b.reach - a.reach)[0]!;
  return pick(near, true);
}

// ------------------------------------------------------------ the fly ball

/**
 * HOW FAST A FIELDER GETS TO WHERE A BALL IN THE AIR COMES DOWN — feet per
 * replay millisecond for a glove of 1.0. INFIELD_RANGE's twin, on the same
 * kind of clock: the ball's is `plot.hangMs`, the pacing the overhead flies it
 * at, so a man drawn at this speed arrives when the box score says he did.
 *
 * Measured with scripts/balance.ts, 400 games each, 2026-09-24, DIVE_REACH
 * 0.97 and CAMP_MS 350. Before this change: 4.18 runs and 8.14 hits per team.
 *
 *   range   runs   hits   BABIP  air catches/tm  diving
 *   0.036   4.80   9.69   .340       5.89          4%
 *   0.040   4.26   8.86   .309       6.73          4%
 *   0.042   4.08   8.42   .295       6.85          3%
 *   0.043   3.99   8.16   .286       6.95          4%
 *   0.044   3.94   8.03   .279       7.17          4%
 *   0.046   3.64   7.48   .261       7.42          3%
 *   0.050   3.34   6.81   .237       7.85          3%
 *
 * ⚠️ RUNS AND HITS CANNOT BOTH BE HIT WITH THIS ONE KNOB. A caught table-double
 * is an out now, not a single held to one bag, so runs fall a little faster
 * than hits: 0.043 matches hits to the hundredth and is 0.19 runs light. 0.042
 * splits the miss. Over 1,200 games it reads 4.01 runs, 8.39 hits, BABIP .294.
 */
export const AIR_RANGE = 0.042;

/**
 * Arrive with this much of the ball's hang to spare and he is waiting under it.
 * Only the picture and the words read it — it moves nothing in the box score.
 * 250 camps 78% of catches, 350 camps 71%, 500 camps 60%.
 */
export const CAMP_MS = 350;

/**
 * A 1.0 glove who has made this share of his run when the ball comes down lays
 * out for it and catches it. Below it, it drops in front of him.
 *
 * ⚠️ THE DIVE IS A SHARE OF HIS RUN THAT GROWS WITH THE GLOVE — the bar is
 * `1 - (1 - DIVE_REACH) × glove`. A flat bar looked right and made the rating
 * say nothing about HOW: a fixed share of anybody's run is the same share of
 * the balls he gets to, so the fast man and the slow man dived exactly as often
 * per catch — and the rangier man dived slightly LESS, because the edge of a
 * big range is where fewer balls come down (1,200 games: 3.7% bottom glove
 * quartile, 3.4% top). Zane asked for the better glove to make more of the big
 * plays, diving ones included.
 *
 * So the band is scaled by glove to the fourth, DIVE_GLOVE_POW. The glove
 * spread is narrow — 0.86 to 1.17 — and a linear scale left it inside the noise.
 * At 4, over 1,200 games: 3.1% of catches diving in the bottom quartile, 4.0%
 * in the top. Swept at 400 games, 0.042 range: 0.95 dives 6% of catches, 0.97
 * dives 3-4%, 0.98 dives 3%.
 */
export const DIVE_REACH = 0.97;

/** How hard the glove bends the dive band. See DIVE_REACH. */
const DIVE_GLOVE_POW = 4;

export type CatchHow = 'camped' | 'running' | 'diving';

/** Who got to a ball in the air, or who came closest, and how. */
export interface AirCatch {
  /** Scorer's number of the man who caught it — or, when nobody did, who came closest. */
  num: number;
  /** Contact-clock ms he got to the spot, or the ball's hang when he did not. */
  ms: number;
  /** Share of his run made when the ball came down. 1 when he got there. */
  reach: number;
  caught: boolean;
  /** How it was caught. Null when it dropped. */
  how: CatchHow | null;
}

/**
 * STEP (a) FOR BALLS IN THE AIR: does anybody get there?
 *
 * Every fielder runs straight at the landing spot and arrives at
 * `REACTION_MS + runFt / (AIR_RANGE × glove)`. The ball arrives at
 * `plot.hangMs`. First man there has it; with room to spare he camped, without
 * it he took it running. Nobody there, and the man who came closest dives if he
 * had made enough of his run — see DIVE_REACH.
 *
 * ⚠️ ONE CLOCK. hangMs is the picture's clock, not real hang time, and it is
 * clamped 900-2600ms in plot.ts. ponytail: the clamp means a towering pop and a
 * very high fly hang the same 2.6s here — give the engine real flight time only
 * if the picture gets it too, or the two will disagree about who camped.
 *
 * No new RNG and no new ratings. Nothing here rolls; it measures.
 */
export function catchFly(
  plot: Plot,
  dirDeg: number,
  fielders: readonly Fielder[],
  reachAt: (fielderNum: number) => number,
): AirCatch {
  const ball = feetXY(plot.distFt, dirDeg);
  const hang = plot.hangMs;
  const best = fielders
    .map((f) => {
      const p = feetXY(f.distFt, f.dirDeg);
      const runFt = Math.hypot(p.x - ball.x, p.y - ball.y);
      const speed = AIR_RANGE * reachAt(f.num);
      const runMs = REACTION_MS + runFt / speed;
      const reach = runFt === 0 ? 1 : Math.max(0, Math.min(1, ((hang - REACTION_MS) * speed) / runFt));
      return { num: f.num, runMs, reach, glove: reachAt(f.num) };
    })
    // Earliest arrival is also the highest reach, so one sort answers both.
    .sort((a, b) => a.runMs - b.runMs)[0]!;

  if (best.runMs <= hang) {
    return {
      num: best.num,
      ms: best.runMs,
      reach: 1,
      caught: true,
      how: hang - best.runMs >= CAMP_MS ? 'camped' : 'running',
    };
  }
  const diving = best.reach >= 1 - (1 - DIVE_REACH) * best.glove ** DIVE_GLOVE_POW;
  return { num: best.num, ms: hang, reach: best.reach, caught: diving, how: diving ? 'diving' : null };
}

// ------------------------------------------------------------ the pickup

/**
 * WHO RUNS DOWN A BALL NOBODY CAUGHT OR CUT OFF, where, and when he has it in
 * his throwing hand. Clocks are ball-clock ms from the cut, like cutOff()'s.
 */
export interface Pickup {
  num: number;
  /** Feet from home along the ball's line where he picks it up. */
  alongFt: number;
  /** He gets to that spot. */
  runMs: number;
  /** He has it and is ready to throw: the ball is there, he is there, he has gathered it. */
  ms: number;
  /** It got all the way to the fence and he played it off the wall. */
  wall: boolean;
  /** The bounce and roll after it came down. See rollFor(). */
  roll: Roll;
}

/** Bend, glove and set. Every pickup pays it. */
export const GATHER_MS = 150;
/** Playing it off the fence: the carom, the turn, the search for the cut-off man. */
export const WALL_MS = 150;
const PICKUP_STEP_MS = 20;

/**
 * THE RETRIEVAL RACE. The ball rolls along its line (ballAlongFt()); every
 * fielder who can get there runs straight at where it will be, at AIR_RANGE ×
 * his glove, and the first man who can be standing where the ball is, when it
 * is there, picks it up. A ball that stops before anyone reaches it is picked
 * up by whoever gets to it first. A grounder that got through the infield is
 * the outfielders' — the men it got past are behind it.
 *
 * Before this the outfielder on a hit ran a fixed share of the way toward
 * where it landed, chosen by the hit type the table had already rolled, and
 * the throw left from the landing spot the instant it landed. Nothing here
 * rolls; it measures.
 */
export function pickUp(
  plot: Plot,
  roll: Roll,
  dirDeg: number,
  fielders: readonly Fielder[],
  reachAt: (fielderNum: number) => number,
  groundThrough: boolean,
  wallFt: number,
): Pickup {
  const chasers = fielders.filter((f) => (groundThrough ? f.num >= 7 : f.num >= 3));
  const posts = chasers.map((f) => ({ num: f.num, at: feetXY(f.distFt, f.dirDeg), speed: AIR_RANGE * reachAt(f.num) }));
  const arrive = (m: (typeof posts)[number], alongFt: number): number => {
    const b = feetXY(alongFt, dirDeg);
    return REACTION_MS + Math.hypot(m.at.x - b.x, m.at.y - b.y) / m.speed;
  };
  const restAt = restFt(plot, roll);
  const stopMs = roll.ms > 0 ? roll.fromMs + roll.ms : plot.hangMs;
  const wall = restAt >= wallFt - 9;
  const done = (num: number, alongFt: number, runMs: number, ballMs: number): Pickup => ({
    num,
    alongFt,
    runMs,
    ms: Math.max(runMs, ballMs) + GATHER_MS + (wall && alongFt >= restAt - 1 ? WALL_MS : 0),
    wall,
    roll,
  });
  // A ball in the air cannot be picked up before it comes down — catchFly()
  // already said nobody caught it.
  for (let t = plot.ground ? 0 : plot.hangMs; t < stopMs; t += PICKUP_STEP_MS) {
    const along = ballAlongFt(plot, roll, t);
    for (const m of posts) {
      const runMs = arrive(m, along);
      if (runMs <= t) return done(m.num, along, runMs, t);
    }
  }
  const first = posts
    .map((m) => ({ num: m.num, runMs: arrive(m, restAt) }))
    .sort((a, b) => a.runMs - b.runMs)[0]!;
  return done(first.num, restAt, first.runMs, stopMs);
}

/**
 * HOW MUCH DAYLIGHT THE BATTER WANTS before he takes the next bag without
 * being waved: he gets there this many ms before the throw would. Anything
 * closer is the gamble stretchChance() rolls for, raced in hitRace().
 */
export const LEG_MARGIN_MS = 250;
/**
 * ...and for third, where he wants it far surer: the old rule, never make
 * the first or the third out at third base. Without its own number a ball
 * slow enough to be a double was usually slow enough to be a triple, and
 * three-baggers came out at a third of the doubles against a real tenth.
 */
export const THIRD_MARGIN_MS = 800;

/**
 * THE BASES ON A HIT, RUN OUT. He takes second if he beats the throw there by
 * LEG_MARGIN_MS, then third by THIRD_MARGIN_MS. He sees the ball in front of him,
 * so it is the true clock, not a read. Single, double or triple is what the
 * legs and the throw say, not what the table rolled.
 */
export function legs(
  p: Placement,
  batterSpeed: number,
  reachAt: (fielderNum: number) => number,
): 1 | 2 | 3 {
  if (!p.pickup) return 1;
  const readyMs = REPLAY_CUT_MS + p.pickup.ms;
  const { throwMs } = throwsFrom(feetXY(p.pickup.alongFt, p.dirDeg), readyMs, p.pickup.num, reachAt(p.pickup.num), reachAt);
  let n: 1 | 2 | 3 = 1;
  while (n < 3 && REPLAY_CUT_MS + runToFirstMs(batterSpeed) * (n + 1) + (n === 1 ? LEG_MARGIN_MS : THIRD_MARGIN_MS) < throwMs[n - 1]!) {
    n = (n + 1) as 2 | 3;
  }
  return n;
}

// ------------------------------------------------------------- the verdict

/**
 * WHERE THE BALL WENT GETS A VOTE ON HIT OR OUT, not just on how many bases.
 *
 * The table still rolls a call, and the play overrules it both ways: a table
 * hit somebody got to is an out (`robbed`), and a table out nobody got to is a
 * single (`dropped`). Since ZAIS-17 the ground ball is decided by cutOff(), and
 * since ZAIS-20 the ball in the air by catchFly() — who could get there, not
 * how far it landed from anybody. The fixed-distance bars that used to decide
 * the air are gone; scripts/balance.ts holds the run environment where they
 * had it.
 */

/** What a robbed hit is scored as. The ball's own shape decides, not the bar. */
const outKindFor = (launchAngle: number): Outcome =>
  launchAngle < 10 ? 'ground_out' : launchAngle >= 45 ? 'popup' : 'line_out';

/** Which way the geometry went, for the sentence. Null is the table's own call. */
export type Verdict = 'robbed' | 'dropped' | null;

/**
 * THE GROUND BALL'S VERDICT, from the cut-off.
 *
 * Fielded by an infielder is a ground out, whatever the table said. Through
 * every infielder, an out becomes a hit — legs() decides how many bases. A ball that died in the dirt before anybody
 * reached it is the same infield single, told as one rather than as a hole.
 */
function cutOffVerdict(o: Outcome, cut: CutOff): { outcome: Outcome; verdict: Verdict } {
  if (cut.fielded) return { outcome: 'ground_out', verdict: isHit(o) ? 'robbed' : null };
  if (isOut(o)) return { outcome: 'single', verdict: cut.past ? 'dropped' : null };
  return { outcome: o, verdict: null };
}

/**
 * THE FLY BALL'S VERDICT, from catchFly(). The mirror of cutOffVerdict().
 *
 * Caught is an out, typed by the ball's shape; a table hit caught is `robbed`.
 * Not caught, an out becomes a hit that `dropped` — legs() decides how many
 * bases.
 */
function airVerdict(o: Outcome, c: AirCatch, launchAngle: number): { outcome: Outcome; verdict: Verdict } {
  if (c.caught) return { outcome: outKindFor(launchAngle), verdict: isHit(o) ? 'robbed' : null };
  if (isOut(o)) return { outcome: 'single', verdict: 'dropped' };
  return { outcome: o, verdict: null };
}

/**
 * Plot a finished at-bat, race for it, run the bases out, and hand back all of
 * it.
 *
 * Both callers — the sim and the live screen — go through this one function so
 * the geometry cannot drift between the half you play and the half you watch.
 *
 * ⚠️ `isHit` AND `isOut` ARE RECOMPUTED NOW, and forgetting to was the bug
 * waiting inside this change. The old body did `{ ...result.hit, outcome }` and
 * said in its own comment that the two flags were safe to carry over, which was
 * true while every stretch moved a hit to another kind of hit. The race
 * moves a hit to an OUT, so a stale `isHit: true` would have put a man on first
 * on a ball the scorer had just called a line out.
 */
export function withPlacement(
  result: AtBatResult,
  opts: {
    /**
     * The glove on the man the ball was hit at, by scorer's number. Omitted
     * means league average everywhere.
     */
    reachAt?: (fielderNum: number) => number;
    /**
     * THE BUILDING. Omitted is the 400-foot bowl — a park-less exhibition, or
     * any test that does not care where the fence is. Both clubs get the HOME
     * club's park; see atPark() in teams.ts.
     */
    park?: Park;
    /**
     * WHAT THE DEFENCE CALLED. Omitted plays everyone straight up, which is
     * every caller written before 2026-09-08. See game/shift.ts.
     */
    shift?: Shift;
    /** The batter's legs, for legs(). Omitted is league average. */
    batterSpeed?: number;
  } = {},
): {
  result: AtBatResult;
  placement: Placement | null;
  text: string;
  verdict: Verdict;
} {
  if (result.kind !== 'in_play') {
    const text = result.kind === 'walk' ? 'walked' : result.kind === 'hit_by_pitch' ? 'hit by pitch' : 'struck out';
    return { result, placement: null, text, verdict: null };
  }

  const p = place(result.hit, opts.park, fieldersFor(opts.shift ?? 'straight'), opts.reachAt);
  // A foul is not a play and has nobody standing where it landed — place()
  // zeroes its gap by construction, which would read as "robbed" every time.
  const live = p.zone !== 'foul-ground';
  const { outcome: contested, verdict } = !live
    ? { outcome: result.hit.outcome, verdict: null as Verdict }
    : p.cutOff
      ? cutOffVerdict(result.hit.outcome, p.cutOff)
      : p.airCatch
        ? airVerdict(result.hit.outcome, p.airCatch, result.hit.launchAngle)
        : { outcome: result.hit.outcome, verdict: null as Verdict };

  // ⚠️ THE TABLE SAYS HIT OR OUT AND NOTHING ELSE ANY MORE (2026-09-28). Which
  // hit it is comes off the clocks: a ball that died in the infield dirt is a
  // single, one somebody had to run down is as many bases as the batter beats
  // the throw to. The home run is still the table's call.
  const outcome: Outcome =
    !live || !isHit(contested) || contested === 'home_run'
      ? contested
      : (['single', 'double', 'triple'] as const)[legs(p, opts.batterSpeed ?? 1, opts.reachAt ?? (() => 1)) - 1]!;
  const hit =
    outcome === result.hit.outcome
      ? result.hit
      : { ...result.hit, outcome, isHit: isHit(outcome), isOut: isOut(outcome) };

  return {
    result: { kind: 'in_play', hit },
    placement: p,
    text: describePlay(outcome, hit, p, verdict),
    verdict,
  };
}

/**
 * THE BATTER BEAT THE THROW: a grounder somebody fielded, scored as the infield
 * single it turned into. groundRace() in defense.ts decides it from the clocks;
 * this is only the rescoring, so both callers rescore the same way.
 */
export function beatenOut(placed: ReturnType<typeof withPlacement>): ReturnType<typeof withPlacement> {
  if (placed.result.kind !== 'in_play' || !placed.placement) return placed;
  const hit = { ...placed.result.hit, outcome: 'single' as const, isHit: true, isOut: false };
  const who = POSITION_WORD[placed.placement.fielderNum] ?? 'somebody';
  return {
    ...placed,
    result: { kind: 'in_play', hit },
    text: `infield single, beat the throw from ${who}`,
    verdict: null,
  };
}

// ------------------------------------------------------------- the words

const ZONE_WORDS: Record<Zone, string> = {
  infield: 'the infield',
  shallow: 'shallow outfield',
  left: 'left field',
  'left-center': 'the left-center gap',
  center: 'center field',
  'right-center': 'the right-center gap',
  right: 'right field',
  'down-the-line': 'down the line',
  wall: 'the wall',
  'foul-ground': 'foul ground',
};

/**
 * Where it went, as a phrase that can follow a verb — and it takes the
 * PREPOSITION, because one zone needs to supply its own.
 *
 * `down-the-line` is a direction band rather than a place, and it catches both
 * corners, so the table above can only call it "down the line". Every sentence
 * built from it came out as "double into down the line" — which nobody noticed
 * while direction was pure timing and 0.3% of balls reached a corner. The pull
 * term in hit.ts now sends them there several times a game.
 *
 * The fix is not to name the side and stop, because "home run to down the
 * left-field line" is just as wrong. English wants "down the line" to REPLACE
 * the preposition rather than follow it, so the caller hands its preposition in
 * and this zone swallows it.
 *
 * ponytail: one zone gets a special case because one zone needs one. The other
 * eight name a place and take any preposition you give them.
 */
export const whereWords = (p: Placement, prep: 'to' | 'into'): string =>
  p.zone === 'down-the-line'
    ? `down the ${p.dirDeg < 0 ? 'left' : 'right'}-field line`
    : `${prep} ${ZONE_WORDS[p.zone]}`;

export const POSITION_WORD: Record<number, string> = {
  1: 'the pitcher', 2: 'the catcher', 3: 'first', 4: 'second', 5: 'third',
  6: 'short', 7: 'left', 8: 'center', 9: 'right',
};

/**
 * The scorer's sentence. This is the payoff of the whole file — the player
 * finally gets told WHERE it went, which is the information they need to learn
 * that pulling everything into the shift is why they keep making outs.
 */
export function describePlay(
  outcome: Outcome,
  hit: HitResult,
  p: Placement,
  /**
   * Whether the play overruled the table — see withPlacement().
   *
   * ⚠️ THE SENTENCE IS THE WHOLE POINT OF THE CONTEST. A flip the player is not
   * told about is indistinguishable from the RNG being unkind, and a mechanic
   * that cannot be noticed cannot be learned. "robbed by short" and "found a
   * hole past third" are the two lines that teach where the men are standing.
   */
  verdict: Verdict = null,
): string {
  // A ground ball through the infield is picked up by an outfielder, but the
  // man it went PAST is the infielder — "found a hole past center" is not a
  // sentence about a grounder.
  const who = POSITION_WORD[p.cutOff?.past ? p.cutOff.num : p.fielderNum] ?? 'somebody';
  const hard = hit.exitVelocity >= 95;
  // The one catch worth a word of its own. Camped and running read as they
  // always have; see catchFly().
  const dove = p.airCatch?.caught && p.airCatch.how === 'diving' ? ', diving catch' : '';

  if (verdict === 'robbed') {
    if (dove) return `robbed by ${who}${dove}`;
    return hit.launchAngle < 10
      ? `robbed by ${who}, a step to his left`
      : `robbed by ${who} on the run`;
  }
  if (verdict === 'dropped') {
    // ⚠️ IT NAMES THE MAN, NOT THE ZONE, and that is a grammar fix as much as a
    // design one. Built from whereWords() this read "dropped in into shallow
    // outfield" — the zone phrase brings its own preposition — and worse,
    // "dropped in into the wall" for a ball that fell in front of the fence.
    // The fielder is also the more useful half: the whole lesson of a ball that
    // drops is WHO it dropped in front of.
    return p.zone === 'infield'
      ? `single, found a hole past ${who}`
      : `single, dropped in front of ${who}`;
  }

  switch (outcome) {
    case 'home_run':
      // No `wall` special case any more — zoneFor() reserves that band for a
      // ball that stayed in the park, so a home run always carries the field it
      // was hit to. See WALL_BAND_FT.
      return `home run ${whereWords(p, 'to')}, ${Math.round(p.distFt)} feet`;
    case 'triple':
      return `triple ${whereWords(p, 'into')}`;
    case 'double':
      return p.inTheGap
        ? `double ${whereWords(p, 'into')}`
        : `double past ${who}`;
    case 'single':
      if (p.zone === 'infield') return `infield single past ${who}`;
      return hard ? `single, lined ${whereWords(p, 'into')}` : `single ${whereWords(p, 'to')}`;
    case 'line_out':
      return (hard ? `lined out hard to ${who}` : `lined out to ${who}`) + dove;
    case 'popup':
      return `popped up to ${who}${dove}`;
    case 'ground_out':
      return `grounded out to ${who}`;
    case 'foul':
      // ⚠️ IT SAYS WHERE IT WENT NOW. A foul used to be four words because
      // nothing knew anything about it; it has a real direction and a real
      // shape, so the play-by-play can tell a chopper down the line from one
      // hooked into the seats from one straight up over the catcher.
      return `fouled it ${FOUL_WORDS[foulSide(p.dirDeg)]}`;
    case 'foul_out':
      return p.fielderNum === 2
        ? 'fouled out to the catcher'
        : `fouled out to ${who}`;
    case 'strikeout':
      return 'struck out';
  }
}

// ------------------------------------------------------- the scorer's numbers

/**
 * THE SCORECARD LINE — "6-3", "F8", "4-6-3".
 *
 * ⚠️ WHY BOTH THIS AND describePlay(). They answer different questions and the
 * screen has room for both, same argument the strength card makes for showing
 * "STACKED" next to "4 of 30". describePlay() is the sentence — where it went,
 * who was standing there, whether it was hit hard. This is the RECORD: who
 * actually made the out. A sentence tells you what happened once; the notation
 * is the thing you can read down a column of and notice that everything you hit
 * ends up at 6.
 *
 * ponytail: no assists column, no errors column, no box score. Nine of those
 * exist and none of them is what was asked for — this is one string on one
 * line. The moment somebody wants a per-fielder total, the numbers are already
 * here to add up.
 */

/**
 * Where the throw goes on a ground ball, and who covers on a double play.
 *
 * The pivot is the real rule and not a lookup: whoever covers second is the
 * middle infielder who did NOT field it, so a ball to the second baseman is
 * 4-6-3 and a ball to the shortstop is 6-4-3. Everything hit anywhere else
 * goes through the second baseman, because the shortstop is the one man on the
 * field who is usually too far away to get there first.
 */
const pivotFor = (fielderNum: number): number => (fielderNum === 4 ? 6 : 4);

/** Scorer's number of the man standing on each bag. Home is the catcher. */
const COVERS: Record<number, number> = { 1: 3, 2: 4, 3: 5, 4: 2 };

/**
 * WHO TAKES THE THROW AT THE BAG THE FORCE IS BEING MADE AT.
 *
 * Second is the only one with a choice in it, and pivotFor() is that choice —
 * whichever middle infielder did not field the ball. Third and the plate are
 * simply the man standing there.
 */
const coverFor = (bag: number, fielderNum: number): number =>
  bag === 2 ? pivotFor(fielderNum) : (COVERS[bag] ?? 2);

/** What the scorer writes on a ground ball, given how far the throw went. */
export interface PlayShape {
  error?: boolean;
  doublePlay?: boolean;
  /** THREE outs on the ball. Written the same as a double play — see below. */
  triplePlay?: boolean;
  /** A line drive caught, and the man on first doubled off. */
  doubledOff?: boolean;
  /**
   * THE BAG THE FORCE WAS TAKEN AT — 2, 3 or 4, or `true` for the old
   * "somewhere, assume second" that every caller written before the lead force
   * existed passes.
   */
  force?: number | boolean;
}

/** The bag a force ended at, as a number. `true` and nothing both mean second. */
const bagOf = (force: PlayShape['force']): number =>
  typeof force === 'number' ? force : 2;

export function scorecard(outcome: Outcome, fielderNum: number, opts: PlayShape = {}): string {
  if (opts.error) return `E${fielderNum}`;

  // ⚠️ THE LINE-DRIVE DOUBLE PLAY IS SCORED OFF THE CATCH, not off a bag. `L6-3`
  // is the whole play: caught at 6, thrown to 3, and the man who could not get
  // back is out there. It is checked before the switch because the outcome is
  // `line_out` and the plain `L6` below would drop the second out on the floor.
  if (opts.doubledOff) return `L${fielderNum}-3`;

  switch (outcome) {
    case 'strikeout':
      return 'K';

    case 'ground_out': {
      // ⚠️ A TRIPLE PLAY IS WRITTEN THE SAME AS A DOUBLE PLAY and that is not a
      // shortcut — `5-4-3` really is the notation for both, and what separates
      // them is the number of men who were on, which the line does not carry.
      // Real scorecards mark it "TP" beside the same three numbers.
      if (opts.doublePlay || opts.triplePlay) {
        // ⚠️ A TRIPLE PLAY ALWAYS RELAYS THROUGH SECOND. Its lead out is the one
        // the fielder makes standing on his own bag before he throws — see
        // TRIPLE_PLAY in core/fielding.ts — so the notation is the pivot's, not
        // the lead bag's, and `5-4-3` covers both plays exactly as a real
        // scorecard does.
        const cover = opts.triplePlay
          ? pivotFor(fielderNum)
          : coverFor(bagOf(opts.force), fielderNum);
        // He fielded it standing on the bag: no throw, no assist, one man.
        return cover === fielderNum ? `${fielderNum}-3` : `${fielderNum}-${cover}-3`;
      }
      // ⚠️ THE FORCE ENDS AT THE BAG, so the notation does too — `6-4`, not
      // `6-3`. Nobody was retired at first and the batter is standing on it.
      if (opts.force) {
        const cover = coverFor(bagOf(opts.force), fielderNum);
        return cover === fielderNum ? `${fielderNum}U` : `${fielderNum}-${cover}`;
      }
      // Unassisted: he fielded it standing on the bag he was going to throw to.
      return fielderNum === 3 ? '3U' : `${fielderNum}-3`;
    }

    // The infield fly and the fly ball are scored differently on purpose —
    // P is a pop, F is a fly, and which one it was is the difference between
    // an inning ending quietly and a man scoring from third.
    case 'popup':
      return fielderNum >= 7 ? `F${fielderNum}` : `P${fielderNum}`;

    case 'line_out':
      return `L${fielderNum}`;

    // ⚠️ A FOUL OUT IS A PUTOUT AND HAS TO BE SCORED AS ONE. It fell through to
    // the empty default below on the first pass, which reads as "nobody was
    // retired" — and a man is out. Scored `P2` for the catcher and the corners
    // alike: real scoring does not mark it foul, it marks who caught it.
    case 'foul_out':
      return `P${fielderNum}`;

    // A hit has no putout in it. Nobody was retired, so there is nothing for
    // the scorer to write down but the hit itself. `foul` lands here too: the
    // at-bat is still going and there is nothing to record yet.
    default:
      return '';
  }
}

/**
 * THE PUTOUTS, ASSISTS AND ERRORS ON ONE BALL — the other half of scorecard().
 *
 * ⚠️ WHY IT IS NOT A PARSER OVER THE STRING. That was the first cut and it is
 * the wrong kind of lazy: `L6-3` credits 6 with a putout AND an assist, `6-4-3`
 * credits 6 and 4 with assists and only 3 with a putout, and `K` credits a man
 * whose number is not in the string at all. A reader that gets all three right
 * is bigger than this function and breaks silently the first time the notation
 * gains a shape. Two short functions off one PlayShape, side by side, with a
 * test asserting the putouts always add up to the outs recorded.
 *
 * ⚠️ THE STRIKEOUT'S PUTOUT BELONGS TO THE CATCHER, which surprises people and
 * is real scoring: somebody has to catch strike three. It is the reason a
 * catcher leads every club in putouts, and printing a fielding table where he
 * does not would look wrong to anyone who has read one.
 */
export function creditsFor(
  outcome: Outcome,
  fielderNum: number,
  opts: PlayShape = {},
): { po: number[]; a: number[]; e: number[] } {
  const none = { po: [] as number[], a: [] as number[], e: [] as number[] };
  // ⚠️ AN ERROR IS CHARGED AND NOBODY IS RETIRED. Both halves matter: the man
  // wears it, and no putout is invented for an out that was not made.
  if (opts.error) return { ...none, e: [fielderNum] };
  if (outcome === 'strikeout') return { ...none, po: [2] };
  if (opts.doubledOff) return { po: [fielderNum, 3], a: [fielderNum], e: [] };

  if (outcome === 'ground_out') {
    const cover = coverFor(bagOf(opts.force), fielderNum);
    if (opts.triplePlay) {
      // THREE PUTOUTS, and they are the three men in the notation. He retires
      // the lead runner himself standing on the bag, throws to the pivot for the
      // second, and the pivot throws to first for the third.
      const pivot = pivotFor(fielderNum);
      return { po: [fielderNum, pivot, 3], a: [fielderNum, pivot], e: [] };
    }
    if (opts.doublePlay) {
      // TWO PUTOUTS: the forced man at the bag, and the batter at first. When
      // the fielder IS the man covering the bag he takes that one himself and
      // there is no assist on it.
      return cover === fielderNum
        ? { po: [fielderNum, 3], a: [fielderNum], e: [] }
        : { po: [cover, 3], a: [fielderNum, cover], e: [] };
    }
    if (opts.force) {
      return cover === fielderNum
        ? { po: [fielderNum], a: [], e: [] }
        : { po: [cover], a: [fielderNum], e: [] };
    }
    return fielderNum === 3
      ? { po: [3], a: [], e: [] }
      : { po: [3], a: [fielderNum], e: [] };
  }

  // Caught in the air — popup, line_out, foul_out. One man, one putout, no
  // throw. A hit and a live foul reach here with nothing to record.
  return outcome === 'popup' || outcome === 'line_out' || outcome === 'foul_out'
    ? { ...none, po: [fielderNum] }
    : none;
}

/** "8-5" — the man who chased it down, to the man standing on the bag. */
export const throwNotation = (fielderNum: number, bag: number): string =>
  `${fielderNum}-${COVERS[bag] ?? 2}`;

/** "third", for a sentence. Same bag numbering advance() uses. */
export const BAG_WORD: Record<number, string> = { 2: 'second', 3: 'third', 4: 'the plate' };
