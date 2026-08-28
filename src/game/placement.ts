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
 * ponytail: this does NOT convert outs into hits or hits into outs. That would
 * put geometry in charge of the run environment, and the run environment is the
 * thing that took three rounds of tuning to get to 4.4. Placement changes what
 * a hit is worth. It does not change how often you get one.
 */

import type { HitResult } from '../core/hit.ts';
import type { Outcome } from '../core/hitTables.ts';
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
  | 'wall';

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
 * ⚠️ MEASURED, NOT GUESSED — and the first guess was wrong by a factor of two
 * and a half. 52ft "looked right" for nine men spread over an outfield; run
 * against the actual distribution (scripts/place.ts) it caught **72% of every
 * ball in play**, upgraded half of all hits, and turned triples into a quarter
 * of the hit column.
 *
 * The real distribution of gap distance on a hit: p25 49ft, p50 74ft, p75
 * 125ft, p90 145ft. Nine fielders cover a very large area and most balls land
 * a long way from all of them, so the bar for "in space" has to sit up at the
 * top of that range, not in the middle of it.
 */
export const GAP_FT = 128;

/**
 * Inside this, it went right at somebody and there is no extra base in it.
 * Around p35 of the same distribution.
 */
export const AT_HIM_FT = 74;

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
 * in real baseball and 4.3% of them before placement, so roughly a third
 * survive:
 *
 *   bar 70ft -> 2.43% of hits    bar 78ft -> 1.32%
 *   bar 74ft -> 2.14%            bar 82ft -> 0.87%
 *   bar 76ft -> ~1.8%
 *
 * ⚠️ THE CURVE IS STEEP RIGHT HERE — p60 is 75.3ft and p70 is 78.2ft — so this
 * is the calibration knob for the triple rate and a few feet is a big move.
 * Re-measure with scripts/place.ts against TRIPLES, not against all hits.
 */
export const TRIPLE_GAP_FT = 76;

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

function zoneFor(distFt: number, dirDeg: number): Zone {
  if (distFt >= WALL_FT) return 'wall';
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

/** Plot one batted ball and describe where it finished. */
export function place(hit: HitResult): Placement {
  const plot = plotBatted(hit.outcome, hit.exitVelocity, hit.launchAngle);
  const dirDeg = hit.direction;
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

/**
 * Plot a finished at-bat, apply the stretch, and hand back both.
 *
 * Both callers — the sim and the live screen — go through this one function so
 * the geometry cannot drift between the half you play and the half you watch.
 *
 * Note what is NOT touched: `isHit` and `isOut`. Every stretch this can apply
 * moves a hit to another kind of hit, so the hit column and the run environment
 * are unaffected by construction.
 */
export function withPlacement(result: AtBatResult): {
  result: AtBatResult;
  placement: Placement | null;
  text: string;
} {
  if (result.kind !== 'in_play') {
    const text = result.kind === 'walk' ? 'walked' : result.kind === 'hit_by_pitch' ? 'hit by pitch' : 'struck out';
    return { result, placement: null, text };
  }

  const p = place(result.hit);
  const outcome = stretch(result.hit.outcome, p);
  const hit = outcome === result.hit.outcome ? result.hit : { ...result.hit, outcome };

  return {
    result: { kind: 'in_play', hit },
    placement: p,
    text: describePlay(outcome, hit, p),
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
};

const POSITION_WORD: Record<number, string> = {
  1: 'the pitcher', 2: 'the catcher', 3: 'first', 4: 'second', 5: 'third',
  6: 'short', 7: 'left', 8: 'center', 9: 'right',
};

/**
 * The scorer's sentence. This is the payoff of the whole file — the player
 * finally gets told WHERE it went, which is the information they need to learn
 * that pulling everything into the shift is why they keep making outs.
 */
export function describePlay(outcome: Outcome, hit: HitResult, p: Placement): string {
  const who = POSITION_WORD[p.fielderNum] ?? 'somebody';
  const hard = hit.exitVelocity >= 95;

  switch (outcome) {
    case 'home_run':
      return `home run to ${ZONE_WORDS[p.zone === 'wall' ? 'center' : p.zone]}, ${Math.round(p.distFt)} feet`;
    case 'triple':
      return `triple into ${ZONE_WORDS[p.zone]}`;
    case 'double':
      return p.inTheGap
        ? `double into ${ZONE_WORDS[p.zone]}`
        : `double past ${who}`;
    case 'single':
      if (p.zone === 'infield') return `infield single past ${who}`;
      return hard ? `single, lined into ${ZONE_WORDS[p.zone]}` : `single to ${ZONE_WORDS[p.zone]}`;
    case 'line_out':
      return hard ? `lined out hard to ${who}` : `lined out to ${who}`;
    case 'popup':
      return `popped up to ${who}`;
    case 'ground_out':
      return `grounded out to ${who}`;
    case 'foul':
      return 'fouled it off';
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

    // A hit has no putout in it. Nobody was retired, so there is nothing for
    // the scorer to write down but the hit itself.
    default:
      return '';
  }
}

/** "8-5" — the man who chased it down, to the man standing on the bag. */
export const throwNotation = (fielderNum: number, bag: number): string =>
  `${fielderNum}-${COVERS[bag] ?? 2}`;

/** "third", for a sentence. Same bag numbering advance() uses. */
export const BAG_WORD: Record<number, string> = { 2: 'second', 3: 'third', 4: 'the plate' };
