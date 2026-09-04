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
 * See contest() for how it is done safely: the two flows are MATCHED rather
 * than one of them being forbidden, and the balance is measured rather than
 * argued. Runs per team held at 4.25 across 400 games.
 */

import type { HitResult } from '../core/hit.ts';
import { isHit, isOut, type Outcome } from '../core/hitTables.ts';
import type { AtBatResult } from '../core/atBat.ts';
import { plotBatted, nearestFielder, FIELDERS, WALL_FT } from '../web/plot.ts';

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

/**
 * Inside this, a table-double went more or less straight at somebody and gets
 * held to a single.
 *
 * ⚠️ LOWERED FROM 74 TO 24 WHEN THE SPRAY MODEL LANDED, and leaving it at 74
 * would have quietly deleted the double from the game. 74 was about p35 of the
 * old, tighter gap distribution; with balls actually spread around the field
 * the median double now lands 88ft from the nearest man but the LOW tail came
 * down too, and 74 caught over half of them. Measured: doubles fell to 8.5% of
 * hits against a real 20%.
 *
 * So it is set at roughly p3 of the double population — a ball that genuinely
 * landed on top of somebody, not merely one that landed nearer than average.
 * The downgrade is meant to be the exception that teaches the rule.
 */
export const AT_HIM_FT = 24;

/**
 * The bar a table-triple has to clear to stay a triple.
 *
 * ⚠️ IT IS NOT `GAP_FT`, AND USING `GAP_FT` HERE KILLED EVERY TRIPLE IN THE
 * GAME. Measured 2026-08-28 after a season came back 2,676 singles, 742
 * doubles, 558 home runs and **zero** three-baggers: the triple branch below
 * asked for `gapFt >= 128`, and across 4,706 balls the table called a triple
 * the gap to the nearest fielder tops out at **128.3ft**. Three of them
 * cleared it. The bar was sitting on the ceiling of the distribution.
 *
 * The 128 above is not wrong for what it measures — p90 of gap distance over
 * ALL HITS really is 145ft. It is the wrong population. The far-from-anybody
 * balls are bloopers and stuff down the line; a ball the table calls a triple
 * carries 183-392ft into the deep outfield, where the fielders are, and its
 * own distribution is p25 52ft, p50 74ft, p75 80ft, p90 93ft, max 128ft.
 *
 * So the bar is set against the triples themselves. A triple is ~1.7% of hits
 * in real baseball and ~4% of them before placement, so roughly half survive.
 *
 * ⚠️ RE-SET FROM 76 TO 51 WHEN THE SPRAY MODEL LANDED, for the same reason
 * AT_HIM_FT moved and by the same method. The triple population's own gap
 * distribution is now p10 20, p50 53, p90 83 — 76 sat up at its p75 and held
 * three-quarters of them, which took triples down to 1.2% of hits. 51 is its
 * median, so about half survive and the rate comes out at 2.0% against a real
 * 2.0%.
 *
 * ⚠️ THE CURVE IS STEEP RIGHT HERE, so this is the calibration knob for the
 * triple rate and a few feet is a big move. Re-measure with scripts/place.ts
 * against TRIPLES, not against all hits.
 */
export const TRIPLE_GAP_FT = 51;

const feetXY = (distFt: number, dirDeg: number) => {
  const rad = (dirDeg * Math.PI) / 180;
  return { x: Math.sin(rad) * distFt, y: Math.cos(rad) * distFt };
};

/** Straight-line feet between two polar points. */
function gapTo(distFt: number, dirDeg: number, num: number): number {
  const f = FIELDERS.find((x) => x.num === num);
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

function zoneFor(distFt: number, dirDeg: number): Zone {
  if (distFt >= WALL_FT - WALL_BAND_FT && distFt <= WALL_FT) return 'wall';
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
 * stretch() from ever looking at one.
 */
export function place(hit: HitResult): Placement {
  const plot = plotBatted(hit.outcome, hit.exitVelocity, hit.launchAngle, hit.direction);
  const dirDeg = hit.direction;

  if (hit.outcome === 'foul' || hit.outcome === 'foul_out') {
    return {
      distFt: plot.distFt,
      dirDeg,
      zone: 'foul-ground',
      gapFt: 0,
      fielderNum: foulCatcher(dirDeg),
      inTheGap: false,
    };
  }

  const f = nearestFielder(plot.distFt, dirDeg);
  const gapFt = gapTo(plot.distFt, dirDeg, f.num);

  return {
    distFt: plot.distFt,
    dirDeg,
    zone: zoneFor(plot.distFt, dirDeg),
    gapFt,
    fielderNum: f.num,
    inTheGap: gapFt >= GAP_FT,
  };
}

/**
 * Extra bases, decided by where it landed.
 *
 * Only ever moves a hit ONE step, and never past a triple — a home run is the
 * table's call and geometry does not get to award one, because "it cleared the
 * wall" is already what `home_run` means.
 *
 * The downgrade is as important as the upgrade: a double that landed on top of
 * the left fielder becomes a single, which is what makes hitting it into space
 * a skill rather than a bonus.
 */
export function stretch(outcome: Outcome, p: Placement): Outcome {
  if (outcome === 'single') {
    // Rare, and it has to be genuinely deep AND genuinely in space.
    if (p.inTheGap && p.distFt > 320) return 'double';
    return 'single';
  }
  if (outcome === 'double') {
    // ⚠️ THERE IS NO DOUBLE-TO-TRIPLE UPGRADE, and it was removed rather than
    // tuned. Gap distance clumps hard at the top — p90 is 145ft and p97 is
    // 149ft — so any threshold high enough to be "exceptional" still catches a
    // big slice of a population that is far more numerous than triples are.
    // With it in, three-baggers went UP to 6.6% against a real 2%.
    //
    // Geometry holds runners to fewer bases here; it does not award more. A
    // triple is mostly a fact about the RUNNER's legs, and speed already earns
    // the extra base in inning.ts.
    if (p.gapFt < AT_HIM_FT) return 'single';
    return 'double';
  }
  if (outcome === 'triple') {
    // THE MAIN JOB OF THIS FUNCTION. The ported tables give ~4.3% triples
    // against a real ~1.7%, so most of them are held to two bases because
    // somebody was in position to cut the ball off.
    //
    // ⚠️ THE BAR IS TRIPLE_GAP_FT, NOT GAP_FT. See the header on that constant:
    // GAP_FT is measured over all hits and no table-triple can reach it, so
    // this line used to hold ALL of them and the game had no triples at all.
    if (p.gapFt < TRIPLE_GAP_FT) return 'double';
    return 'triple';
  }
  return outcome;
}

// ----------------------------------------------------------- the contest

/**
 * THE CONTEST — where the ball landed gets a vote on HIT OR OUT, not just on
 * how many bases.
 *
 * ⚠️ THIS IS THE RULE THE FILE HEADER USED TO FORBID, and it is worth being
 * precise about what changed. The old note said geometry must not convert outs
 * into hits, because "the run environment is the thing that took three rounds
 * of tuning". That reasoning was right about the RISK and wrong about the
 * conclusion: with the flip banned, a line drive hit straight at the shortstop
 * and one hit into the same hole he was not standing in were the same event,
 * and the player could never learn the actual skill — hit it where they
 * aren't. The extra-base rule alone cannot teach that, because the table only
 * hands out an extra base on a ball it had already called a hit.
 *
 * So the flip is allowed now, and the run environment is protected by MATCHING
 * THE TWO FLOWS instead of by forbidding one of them. A hit dropped on top of
 * somebody becomes an out; an out that landed a long way from anybody becomes a
 * hit; and the two thresholds are set so the counts cancel. Verified against
 * scripts/balance.ts, not asserted: runs per team, hits per team and BABIP all
 * sit where they sat before.
 *
 * ⚠️ EACH BAR IS SET AGAINST ITS OWN POPULATION, which is the lesson
 * TRIPLE_GAP_FT already learned the hard way. Measured over 98,778 balls in
 * play, gap distance by outcome:
 *
 *              p2   p5  p10  p50  p90  p95  p98
 *   ground_out   5    8   12   27   44   47   50
 *   line_out    12   19   28   63   89   98  111
 *   popup       11   16   23   59   91  101  113
 *   single       8   12   18   51   83   89   95
 *
 * A grounder never lands more than about 50ft from anybody, because it dies in
 * an infield where four men stand close together; a fly ball routinely lands
 * 90ft from the nearest glove. ONE shared threshold would therefore convert
 * only fly balls and never a single ground ball, and "it found the hole" is the
 * most common version of this play in real baseball. Hence three bars.
 */

/**
 * A hit dropped this close to a fielder is a hit he takes away. Around p13 of
 * the single population, which is a ball hit more or less at somebody.
 */
export const ROBBED_FT = 22;

/**
 * How far from the nearest man an out has to land before it drops in, per kind
 * of batted ball. Each is roughly p93 of its own distribution — see the table
 * above, and re-measure with scripts/place.ts if the flight model moves.
 */
export const HOLE_FT: Readonly<Record<string, number>> = {
  ground_out: 46,
  line_out: 94,
  popup: 96,
};

/** What a robbed hit is scored as. The ball's own shape decides, not the bar. */
const outKindFor = (launchAngle: number): Outcome =>
  launchAngle < 10 ? 'ground_out' : launchAngle >= 45 ? 'popup' : 'line_out';

/** Which way the geometry went, for the sentence. Null is the table's own call. */
export type Verdict = 'robbed' | 'dropped' | null;

/**
 * Run the contest.
 *
 * `reach` is the glove standing there, around 1.0 — see gloveOf() in
 * defense.ts. It scales BOTH bars in the same direction, because both are
 * statements about how much ground one man covers: a rangy fielder robs from
 * further away AND lets fewer balls fall in behind him. Defaulting it to 1
 * keeps every caller that has no fielders — the roguelike, most tests —
 * on exactly the league-average behaviour.
 */
export function contest(
  hit: HitResult,
  p: Placement,
  reach = 1,
): { outcome: Outcome; verdict: Verdict } {
  const o = hit.outcome;

  // ⚠️ ONLY THE SINGLE IS ROBBABLE. A double or a triple got past everybody by
  // definition, and a home run is not on the field to be caught — letting
  // geometry retire one of those would be geometry overruling the wall.
  if (o === 'single' && p.gapFt <= ROBBED_FT * reach) {
    return { outcome: outKindFor(hit.launchAngle), verdict: 'robbed' };
  }

  const bar = HOLE_FT[o];
  if (bar !== undefined && p.gapFt >= bar * reach) {
    return { outcome: 'single', verdict: 'dropped' };
  }

  return { outcome: o, verdict: null };
}

/**
 * Plot a finished at-bat, contest it, apply the stretch, and hand back all of
 * it.
 *
 * Both callers — the sim and the live screen — go through this one function so
 * the geometry cannot drift between the half you play and the half you watch.
 *
 * ⚠️ `isHit` AND `isOut` ARE RECOMPUTED NOW, and forgetting to was the bug
 * waiting inside this change. The old body did `{ ...result.hit, outcome }` and
 * said in its own comment that the two flags were safe to carry over, which was
 * true while every stretch moved a hit to another kind of hit. The contest
 * moves a hit to an OUT, so a stale `isHit: true` would have put a man on first
 * on a ball the scorer had just called a line out.
 */
export function withPlacement(
  result: AtBatResult,
  opts: {
    /**
     * The glove on the man the ball was hit at, by scorer's number. Omitted
     * means league average everywhere — see contest().
     */
    reachAt?: (fielderNum: number) => number;
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

  const p = place(result.hit);
  // A foul is not a play and has nobody standing where it landed — place()
  // zeroes its gap by construction, which would read as "robbed" every time.
  const live = p.zone !== 'foul-ground';
  const { outcome: contested, verdict } = live
    ? contest(result.hit, p, opts.reachAt?.(p.fielderNum) ?? 1)
    : { outcome: result.hit.outcome, verdict: null as Verdict };

  const outcome = stretch(contested, p);
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
const whereWords = (p: Placement, prep: 'to' | 'into'): string =>
  p.zone === 'down-the-line'
    ? `down the ${p.dirDeg < 0 ? 'left' : 'right'}-field line`
    : `${prep} ${ZONE_WORDS[p.zone]}`;

const POSITION_WORD: Record<number, string> = {
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
   * Whether the geometry overruled the table — see contest().
   *
   * ⚠️ THE SENTENCE IS THE WHOLE POINT OF THE CONTEST. A flip the player is not
   * told about is indistinguishable from the RNG being unkind, and a mechanic
   * that cannot be noticed cannot be learned. "robbed by short" and "found a
   * hole past third" are the two lines that teach where the men are standing.
   */
  verdict: Verdict = null,
): string {
  const who = POSITION_WORD[p.fielderNum] ?? 'somebody';
  const hard = hit.exitVelocity >= 95;

  if (verdict === 'robbed') {
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
      return hard ? `lined out hard to ${who}` : `lined out to ${who}`;
    case 'popup':
      return `popped up to ${who}`;
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

export function scorecard(
  outcome: Outcome,
  fielderNum: number,
  opts: { error?: boolean; doublePlay?: boolean } = {},
): string {
  if (opts.error) return `E${fielderNum}`;

  switch (outcome) {
    case 'strikeout':
      return 'K';

    case 'ground_out':
      if (opts.doublePlay) return `${fielderNum}-${pivotFor(fielderNum)}-3`;
      // Unassisted: he fielded it standing on the bag he was going to throw to.
      return fielderNum === 3 ? '3U' : `${fielderNum}-3`;

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

/** "8-5" — the man who chased it down, to the man standing on the bag. */
export const throwNotation = (fielderNum: number, bag: number): string =>
  `${fielderNum}-${COVERS[bag] ?? 2}`;

/** "third", for a sentence. Same bag numbering advance() uses. */
export const BAG_WORD: Record<number, string> = { 2: 'second', 3: 'third', 4: 'the plate' };
