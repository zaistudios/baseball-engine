/**
 * Where a batted ball goes, on an overhead field.
 *
 * THE SCOPE LINE, and it moved. This file used to say nothing here decides
 * anything, and that stopped being true twice. placement.ts has decided hit or
 * out from where the ball finished since 2026-09-03 — the contest, for balls
 * in the air. And since ZAIS-17 a GROUND BALL is played out, not presented: the
 * infielder who beats it to his spot on its line fields it, and one that beats
 * all of them is a hit into the outfield. That race is run on this file's
 * numbers — plotBatted()'s distance and hang, groundBallMs(), REACTION_MS and
 * the FIELDERS table — so they are the engine's inputs now, not decoration.
 *
 * And since ZAIS-21 the throws on a FIELDED grounder are raced too: the
 * batter's runToFirstMs(), a runner's runnerMs(), the throw's throwArrivalMs()
 * at THROW_SPEED and the pivot's run to his bag, compared in defense.ts's
 * groundRace(). The replay draws those same numbers (Replay.clock).
 *
 * What is STILL only a picture: the fly ball and the liner (decided by
 * contest()'s fixed distances, next in line), the race on everything that has
 * no clock (rolled in fielding.ts and drawn to agree — raceTiming()), errors,
 * and extra bases. Each is its own step in the Unscripted Plays spec.
 *
 * The rule that has not moved: the engine decides and the picture draws it. If
 * the replay and the box score disagree, the box score is right.
 *
 * Which also means the plot is free to be unphysical where physics reads
 * wrong. It takes the hit engine's real exit velocity and launch angle so a
 * scorched double travels further than a mishit one — the timing you actually
 * put on the ball shows up in the picture — but every constant below is a
 * game-feel knob, not a measurement.
 */

import type { Outcome } from '../core/hitTables.ts';
import type { Player } from '../core/roster.ts';

/** Feet from home to the outfield wall, straightaway and down the lines. */
export const WALL_FT = 400;
/** Bases are 90ft apart. Used to scale the diamond, not to simulate one. */
export const BASE_FT = 90;

/**
 * The furthest anyone hits one, and it is a CEILING rather than a target.
 *
 * ⚠️ IT USED TO BE `WALL_FT + 60` = 460, AND THAT NUMBER WAS THE GAME'S ONLY
 * HOME RUN. Measured over 10k home runs the distance was p10 446, p50 460,
 * p90 460 — the median WAS the clamp, so the play-by-play read "home run to
 * centre field, 460 feet" over and over, eight times in one nine-inning game.
 * Two ceilings were stacked: MAX_EXIT_VELOCITY in hit.ts pinned the velocity,
 * and then this pinned what the velocity could do with it.
 *
 * hit.ts now spreads the velocity (EV_SPREAD_LO/HI), which is what actually
 * fixed the pile-up. This is set out at the real record — 505 feet — so that
 * it is a bound on the absurd rather than the shape of the distribution.
 */
const MAX_CARRY_FT = 505;

/**
 * How far a home run the parabola came up short on is drawn.
 *
 * ⚠️ IT IS NOT A CONSTANT, AND MAKING IT ONE JUST MOVES THE PILE. The table
 * decides a home run before any of this runs, so it will sometimes call one on
 * a ball the flight model would land on the warning track — a 105mph ball at
 * the flat end of the launch band computes 377 feet. Those all have to be
 * pushed over the fence, and a fixed `WALL_FT + 4` put 12% of every home run
 * in the game at exactly 404 feet: the same repeated-number problem the 460
 * ceiling had, just at the other end.
 *
 * So the shove scales with how hard it was actually struck. A ball that just
 * snuck out reads 402; one hit 122mph that the single-multiplier drag model
 * under-rated reads 426. Both are honest — this is the case where the picture
 * is being reconciled to a verdict already in the book, and the velocity is the
 * only real information available to do it with.
 */
const justOut = (exitVelocityMph: number, wallFt: number): number =>
  wallFt + 2 + Math.max(0, exitVelocityMph - 95) * 0.9;

/**
 * HOW DEEP A TRIPLE IS DRAWN, AT THE LEAST, as a share of the fence.
 *
 * ⚠️ EXACTLY THE SAME RECONCILIATION justOut() DOES, for exactly the same
 * reason, on the other three-base hit. The table calls the triple before any of
 * this runs, and it calls plenty of them on soft liners — measured over 120,000
 * swings, a triple's median plotted distance was 262 FEET against a DOUBLE's
 * 321, and 41% of them landed inside the median SINGLE. So the most exciting
 * hit in the sport was routinely drawn as a bloop, with a runner sprinting
 * three bases on it. Zane, in one line: "Triple when the scene looks like a
 * single."
 *
 * It is a floor and not a shove, so a triple that already carried stays where
 * the physics put it; only the ones the picture would contradict get moved.
 *
 * ⚠️ AND IT SCALES WITH THE EXIT VELOCITY FOR THE REASON justOut() DOES — a
 * FLAT floor just moves the pile, which is the mistake this file has now made
 * twice (the 460 ceiling, then 404 feet on an eighth of all home runs). Tried
 * flat at 0.80 first: it put p5 through p75 of every triple in the game on
 * exactly 320 feet. The table's triples run 78 to 107mph, so the velocity is 29
 * miles an hour of real spread and it is the only honest information here.
 *
 * ⚠️ IT FEEDS BACK INTO THE HIT MIX AND THAT IS NOT A SIDE EFFECT TO IGNORE.
 * place() measures `gapFt` from this distance and stretch() holds a table
 * triple to a double on a small gap, so moving the ball out among the
 * outfielders costs some of them. Measured, not assumed: 2.1% of hits against a
 * real 2.0% and 3.8% off the raw table, so TRIPLE_GAP_FT did NOT need moving.
 * Re-measure with scripts/place.ts after any change here — that constant is the
 * paired knob if it ever does.
 *
 * Where the ball now lands: p5 302ft, p50 353, p95 385, and the most repeated
 * single distance is 13 of 339. Deeper than the median double, which is what a
 * triple is, and no pile anywhere.
 */
const TRIPLE_MIN_SHARE = 0.75;
const TRIPLE_FT_PER_MPH = 2.8;
const TRIPLE_BASE_MPH = 78;

/** How deep a triple is drawn, at the least. See TRIPLE_MIN_SHARE. */
const deepEnough = (exitVelocityMph: number, wallFt: number): number =>
  wallFt * TRIPLE_MIN_SHARE +
  Math.max(0, exitVelocityMph - TRIPLE_BASE_MPH) * TRIPLE_FT_PER_MPH;

/**
 * Drag, as one number: the share of the vacuum range a real ball keeps.
 *
 * ⚠️ RAISED FROM 0.57 WHEN hit.ts STOPPED SATURATING THE VELOCITY CAP, and the
 * two changes belong together.
 *
 * 0.57 was calibrated to put "110mph at 30°" on a 400-foot wall, which is
 * arithmetically exact — but 110 was not a well-struck ball in the old engine.
 * It was the FLOOR of a population that MAX_EXIT_VELOCITY had squashed flat
 * onto 122. Now that a home run leaves the bat at a realistic 95-115, the old
 * constant carried a real 103mph/28° ball just 335 feet, which is a warning
 * track out rather than a home run.
 *
 * ⚠️ AND IT IS NO LONGER ONE NUMBER, because one number cannot fit both ends.
 * Air resistance costs a 115mph ball proportionally more than a 95mph one, so a
 * flat ratio tuned to make an average home run travel 400 feet then sends the
 * hardest-hit 10% past 500 — measured, 9.4% of home runs landed on the 505-foot
 * ceiling, which is the same repeated number the old 460 clamp produced, moved
 * twenty percent further out.
 *
 * So the ratio falls with velocity. Anchored at 100mph and sloped so that
 * 103mph/28° carries 400 feet and 114mph/28° carries 450 rather than 475.
 *
 * ponytail: a real model integrates over the flight and depends on spin, air
 * density and the seams. This is a straight line through two points, and no one
 * watching a 2-second replay can tell the difference.
 */
const DRAG_AT_100 = 0.696;
const DRAG_PER_MPH = 0.0051;

const dragFor = (exitVelocityMph: number): number =>
  Math.max(0.55, Math.min(0.78, DRAG_AT_100 - (exitVelocityMph - 100) * DRAG_PER_MPH));

/** ft/s per mph, and gravity in ft/s². */
const FPS_PER_MPH = 1.467;
const G = 32.2;

/** Below this launch angle it is a ball on the ground, not a ball in the air. */
export const GROUND_ANGLE = 10;

/**
 * How far a grounder or a liner keeps going after the range formula is done
 * with it, as a multiple of exit velocity in mph.
 *
 * Without this a triple plots shorter than a single, which is the one result
 * that would visibly give the game away: the range formula rewards a 25° fly
 * and punishes the 13° screamer into the gap that a triple actually is.
 */
const ROLL_PER_MPH = 0.9;
/** Liners roll too, just less — they are in the air for part of it. */
const LINER_ANGLE = 20;

export interface Plot {
  /** Feet from home plate along the direction line. */
  distFt: number;
  /** How long the replay should take to get it there. NOT real hang time. */
  hangMs: number;
  /** True when it never left the dirt — drawn flat, no arc. */
  ground: boolean;
}

/**
 * Replay duration, from distance.
 *
 * Real hang time on a 400ft home run is about five seconds. The replay does
 * not need to be honest, it needs to be WATCHABLE: distance maps to a duration
 * that always fits, deeper takes longer, and a ball out of the park hangs for
 * 2.4 seconds.
 *
 * ⚠️ THIS IS THE PACING KNOB AND IT HAS BEEN TURNED UP ONCE. The first cut
 * capped the flight at 1.5s and the whole presentation read as rushed — a home
 * run and a routine fly ball took nearly the same time to land, so nothing
 * felt big. If it needs to breathe more, this and REPLAY_HOLD_MS in
 * overhead.ts are the two numbers.
 */
const HANG_MIN_MS = 900;
const HANG_MAX_MS = 2600;

/**
 * ⚠️ A FOUL GETS ITS OWN, MUCH TIGHTER BAND, and this is pacing rather than
 * physics. The floor above is 900ms because nothing in play should feel
 * hurried; a foul is not a play, there is more than one of them in an average
 * plate appearance, and the batter's-view flash it interrupts is a second long.
 * Left on the normal band a foul pop measured 1,570ms of hang and the next
 * pitch was thrown while the replay was still drawing.
 *
 * The band is still WIDE ENOUGH TO READ: a foul liner comes in around 620ms
 * and a foul pop hits the 900 ceiling, so the two are visibly different plays,
 * which is the whole reason the angle term exists.
 */
const FOUL_HANG_MIN_MS = 380;
const FOUL_HANG_MAX_MS = 900;

/** A mishit does not hang like a struck one, and there are several a PA. */
const FOUL_HANG_SCALE = 0.62;

/**
 * ⚠️ IT IS DERIVED FROM THE VERTICAL HALF OF THE LAUNCH, NOT FROM DISTANCE, and
 * the first attempt at this fixed the popup and introduced a subtler bug.
 *
 * That version kept the old distance curve and multiplied it by an angle
 * factor. It reads fine and it is NOT MONOTONIC: past about 45° a steeper ball
 * travels LESS far, so the distance term falls faster than the angle term
 * rises, and a 64° popup came back forty milliseconds SHORTER than a 60° one.
 * The test that caught it is in foul.test.ts and it was written before the
 * failure, not after.
 *
 * Time in the air is `2·v·sin(θ)/g` and nothing else — it does not care how far
 * the ball went sideways. So that is what this is, scaled to land the existing
 * pacing where it already was: a 110mph home run at 30° comes out near the
 * 2,380ms the distance curve used to give it, and an ordinary fly is within a
 * few percent of its old value. What changes is the two cases the old curve got
 * wrong — the popup, which now hangs like one, and the screamer, which no
 * longer does.
 */
const HANG_PER_FPS = 43.3;

const airHang = (exitVelocityMph: number, launchAngleDeg: number, foul: boolean): number => {
  const deg = Math.max(0, Math.min(89, launchAngleDeg));
  const up = exitVelocityMph * Math.sin((deg * Math.PI) / 180);
  const ms = up * HANG_PER_FPS * (foul ? FOUL_HANG_SCALE : 1);
  return foul
    ? Math.max(FOUL_HANG_MIN_MS, Math.min(FOUL_HANG_MAX_MS, ms))
    : Math.max(HANG_MIN_MS, Math.min(HANG_MAX_MS, ms));
};

/**
 * A ball on the ground has no hang at all — this is time to REACH somebody, so
 * unlike the air it really does go with distance. Kept on the original curve.
 */
const groundHang = (distFt: number, foul: boolean): number => {
  const ms = (700 + distFt * 4.2) * 0.72;
  return foul
    ? Math.max(FOUL_HANG_MIN_MS, Math.min(FOUL_HANG_MAX_MS, ms * FOUL_HANG_SCALE))
    : Math.max(HANG_MIN_MS * 0.72, Math.min(HANG_MAX_MS, ms));
};

/**
 * THE SHAPE OF A GROUNDER'S ROLL: share of the distance covered at share `k`
 * of its hang. Quick out of the box, dying as it reaches somebody.
 */
export const groundEase = (k: number): number => 1 - (1 - k) ** 2;

/**
 * THE BALL'S CLOCK ON THE GROUND — replay-clock ms (from the cut, the clock the
 * overhead flies the ball on) at which a ground ball has rolled `d` feet. The
 * inverse of groundEase() over the plot's hang.
 *
 * ⚠️ ONE FUNCTION FOR THE ENGINE AND THE PICTURE. placement.ts asks it whether
 * an infielder beats the ball to his spot on its line; overhead.ts draws the
 * ball through groundEase(), which this inverts. If the two ever disagree the
 * man is drawn diving at a ball the box score says he caught.
 */
export const groundBallMs = (plot: Plot, d: number): number =>
  plot.hangMs * (1 - Math.sqrt(1 - Math.max(0, Math.min(1, d / plot.distFt))));

/**
 * Plot one batted ball.
 *
 * `outcome` is taken for one job: keeping the picture on the same side of the
 * wall as the scoreboard, both ways. Everything else — how far, how long, how
 * flat — comes from the velocity and angle the hit engine already rolled.
 */
/** The lines, and the furthest round the back a foul is allowed to be drawn. */
export const FOUL_LINE_DEG = 45;

/**
 * How far a foul is allowed to finish from the plate.
 *
 * A long one down the line reaches the seats; nothing needs to be drawn beyond
 * that, and the camera does not have the room for it anyway.
 */
export const FOUL_MAX_FT = 250;

/**
 * The same ceiling, tightened as the ball goes round the back — and it is a
 * HARD CAP rather than another multiplier, on purpose.
 *
 * ⚠️ ADDED BECAUSE foulCarry() ALONE IS COUPLED TO THE FLIGHT MODEL, and that
 * coupling broke when DRAG was retuned. The old carry was a fraction of a range
 * the parabola produced, so raising drag by 16% raised the ball behind the
 * catcher by 16% too: a foul straight back went from 48 feet to 66, and the
 * overhead camera only has about 48 feet of room behind home plate. A picture
 * that is correct only while an unrelated constant does not move is a test
 * waiting to fail, and foul.test.ts duly failed.
 *
 * The constraint being expressed is the CAMERA, not the physics — so it is
 * stated in feet, where the camera lives, and nothing upstream can push through
 * it. 250 down the line, 38 at the backstop.
 */
const foulMaxFt = (dirDeg: number): number => {
  const span = FOUL_MAX_DEG_DRAWN - FOUL_LINE_DEG;
  const back = Math.max(0, Math.min(1, (Math.abs(dirDeg) - FOUL_LINE_DEG) / span));
  return FOUL_MAX_FT + (38 - FOUL_MAX_FT) * back;
};

/**
 * ⚠️ A FOUL HIT STRAIGHT BACK DOES NOT TRAVEL, and the range formula does not
 * know that. Physically the bat has reversed most of the ball's energy rather
 * than redirecting it — that is WHY it went backwards — so the ball that ends
 * up over the catcher went twenty feet, not the hundred and twenty the parabola
 * would give it at the same speed and angle.
 *
 * It is also what keeps the replay on the canvas. The overhead camera puts home
 * plate about forty-eight feet from the bottom edge, because until now nothing
 * was ever drawn behind it. A foul plotted a hundred feet straight back is
 * off-screen, which is not a picture of anything.
 *
 * So carry falls off from full at the line to a fifth of it at the backstop.
 */
const foulCarry = (dirDeg: number): number => {
  const span = FOUL_MAX_DEG_DRAWN - FOUL_LINE_DEG;
  const back = Math.max(0, Math.min(1, (Math.abs(dirDeg) - FOUL_LINE_DEG) / span));
  return 1 - 0.8 * back;
};

/** Matches FOUL_MAX_DEG in core/hit.ts — the furthest round a foul is sent. */
const FOUL_MAX_DEG_DRAWN = 128;

export function plotBatted(
  outcome: Outcome,
  exitVelocityMph: number,
  launchAngleDeg: number,
  /**
   * Only read for fouls, and only to decide how far it carries — see
   * foulCarry(). A fair ball's distance has never depended on its direction and
   * still does not, so every existing caller is unaffected by the default.
   */
  directionDeg = 0,
  /**
   * THE FENCE IN THIS DIRECTION, in feet. Defaults to the 400-foot bowl this
   * file has always drawn, which is what a game with no park is played in — an
   * exhibition between clubs nobody gave a building to, and every test written
   * before parks existed.
   *
   * ⚠️ THE CALLER RESOLVES THE DIRECTION, NOT THIS FUNCTION. A park is three
   * fences and an easing curve (wallAt() in teams.ts), and this file is a LEAF:
   * it takes a number so the geometry never has to import a league. place() in
   * placement.ts is what turns a park into this number.
   */
  wallFt = WALL_FT,
): Plot {
  const foul = outcome === 'foul' || outcome === 'foul_out';
  if (launchAngleDeg < GROUND_ANGLE) {
    // On the ground. Range formula does not apply — a -5° chopper has negative
    // range in it, which would plot behind the catcher.
    //
    // Hang is asked for at the reference angle rather than the ball's own: a
    // grounder's launch angle can be negative, the lift factor would floor out,
    // and a ball that never leaves the dirt is not "hanging" at all. The 0.72
    // is what makes it scurry, and it is measured against the same curve every
    // other ball uses.
    // ⚠️ 1.7 BECAME 1.42 WHEN THE EXIT VELOCITY TABLE WAS RAISED. Both numbers
    // put the median ground ball about 140 feet from the plate, which is where
    // the middle infield stands; the old one did it from a median of 82mph and
    // this one from 95. Left alone it walked every grounder out to 162 feet,
    // behind the shortstop, and the corner infielders stopped getting any.
    const rolled = Math.max(50, Math.min(240, exitVelocityMph * 1.6));
    // A foul chopper dies against the screen or trickles into the coach's box;
    // it does not run 200ft the way a fair one down the line does.
    const distFt = foul
      ? Math.max(18, rolled * foulCarry(directionDeg) * 0.6)
      : // A triple on the ground is a ball in the corner that nobody cut off,
        // so it has to have got there. See TRIPLE_MIN_SHARE.
        outcome === 'triple'
        ? Math.min(wallFt - 8, Math.max(rolled, deepEnough(exitVelocityMph, wallFt)))
        : rolled;
    return { distFt, hangMs: groundHang(distFt, foul), ground: true };
  }

  const v = exitVelocityMph * FPS_PER_MPH;
  const rad = (launchAngleDeg * Math.PI) / 180;
  let distFt = ((v * v * Math.sin(2 * rad)) / G) * dragFor(exitVelocityMph);

  if (launchAngleDeg < LINER_ANGLE) distFt += exitVelocityMph * ROLL_PER_MPH;

  // ⚠️ THE WALL IS A BOUNDARY IN BOTH DIRECTIONS, and it used to only be one.
  //
  // A home run was forced to clear it and NOTHING was stopped from clearing
  // it, which measured out at 8.5% of balls in play landing in the seats and
  // being scored as something else — 914 doubles, and 258 LINE OUTS that an
  // outfielder then ran down forty feet beyond the fence. A ball drawn out of
  // the park that the scoreboard calls an out is the worst thing this replay
  // can do: it makes the engine look broken when the engine was right.
  //
  // So the clamp is symmetric now. Over the wall is a home run and nothing
  // else, and everything else dies in front of it. The wall ball lands at
  // WALL_FT - 8, which is a double off the fence and reads like one.
  distFt =
    outcome === 'home_run'
      ? Math.max(distFt, justOut(exitVelocityMph, wallFt))
      : outcome === 'triple'
        ? // A triple has to be a ball that got out there — see TRIPLE_MIN_SHARE.
          // The ceiling still applies: nothing but a home run clears the wall.
          Math.min(Math.max(distFt, deepEnough(exitVelocityMph, wallFt)), wallFt - 8)
        : Math.min(distFt, wallFt - 8);

  // ⚠️ THE FOUL CLAMP COMES BEFORE THE FAIR ONE, and it has a much lower floor.
  // The 60ft minimum below is right for a ball in play — nothing fair finishes
  // in the batter's box — and wrong for the pop straight up that the catcher
  // takes four strides for.
  if (foul) {
    distFt = Math.max(18, Math.min(foulMaxFt(directionDeg), distFt * foulCarry(directionDeg)));
    return { distFt, hangMs: airHang(exitVelocityMph, launchAngleDeg, true), ground: false };
  }

  distFt = Math.max(60, Math.min(MAX_CARRY_FT, distFt));
  return { distFt, hangMs: airHang(exitVelocityMph, launchAngleDeg, false), ground: false };
}

/**
 * Polar to screen, for the overhead camera. Home plate is the origin and the
 * foul lines run at ±45°, which is what `direction` is already measured in.
 *
 * Negative direction is left field — the same sign the batter-view flight
 * uses, and the same one an early swing produces. Stated here once.
 */
export function overheadPoint(
  distFt: number,
  directionDeg: number,
  home: { x: number; y: number },
  pxPerFt: number,
): { x: number; y: number } {
  const rad = (directionDeg * Math.PI) / 180;
  return {
    x: home.x + Math.sin(rad) * distFt * pxPerFt,
    y: home.y - Math.cos(rad) * distFt * pxPerFt,
  };
}

/** The same polar pair in feet, for measuring one spot against another. */
export function feetXY(distFt: number, dirDeg: number): { x: number; y: number } {
  const rad = (dirDeg * Math.PI) / 180;
  return { x: Math.sin(rad) * distFt, y: Math.cos(rad) * distFt };
}

// ----------------------------------------------------------------- fielders

export interface Fielder {
  /** Scorer's number, 1-9. Drawn on the dot, and the only label they get. */
  num: number;
  distFt: number;
  dirDeg: number;
  /**
   * WHO IS ACTUALLY STANDING THERE, when the caller knows.
   *
   * ⚠️ OPTIONAL, AND THE POSITIONS ALONE ARE STILL A LEGAL ALIGNMENT. FIELDERS
   * below is standard depth with nobody in it, `fieldersFor()` shifts those
   * positions around, and placement.ts only ever asks which one is nearest —
   * none of that wants a roster. The man is attached at the one site that has
   * one, so the overhead replay can draw him as himself and look for HIS art
   * before the position's.
   *
   * The pitcher is normally absent even when the rest are filled: he is not in
   * a DH league's batting order and carries no Player record at all.
   */
  man?: Player;
}

/**
 * Where the nine stand, in standard depth. Feet and degrees from home, same
 * polar frame as everything else here.
 *
 * ⚠️ THIS IS STANDARD DEPTH, NOT THE ONLY ALIGNMENT ANY MORE. It was "ONE
 * alignment, no shifts, no playing in with a man on third" until 2026-09-08,
 * on the reasoning that a shift is a decision the defence would be making and
 * nothing was making it. That is still true HERE — this table is standard
 * depth and nothing else.
 *
 * shift.ts builds moved tables out of this one and hands them to
 * nearestFielder() below. Standard depth stays the default at every seam, so
 * nothing that does not ask for a shift gets one.
 */
export const FIELDERS: readonly Fielder[] = [
  { num: 1, distFt: 60, dirDeg: 0 }, // pitcher
  { num: 2, distFt: 8, dirDeg: 180 }, // catcher, behind the plate
  { num: 3, distFt: 104, dirDeg: 38 }, // first
  { num: 4, distFt: 146, dirDeg: 19 }, // second
  { num: 5, distFt: 104, dirDeg: -38 }, // third
  { num: 6, distFt: 146, dirDeg: -19 }, // short
  { num: 7, distFt: 288, dirDeg: -30 }, // left
  { num: 8, distFt: 318, dirDeg: 0 }, // centre
  { num: 9, distFt: 288, dirDeg: 30 }, // right
];

/**
 * Which one goes after it: whoever is closest to where the ball finished.
 *
 * Straight-line distance on the ground, which is wrong in all the ways real
 * positioning is subtle — it will send the second baseman after a ball the
 * first baseman would take because the runner is coming — and right in the
 * only way that matters here, which is that the dot nearest the ball is the
 * dot that moves. This picks WHO chases. It does not decide whether he gets
 * there; see the scope note at the top of this file.
 */
export function nearestFielder(
  distFt: number,
  dirDeg: number,
  /**
   * Where the nine are actually standing. Defaults to standard depth, so every
   * caller that has no opinion keeps the one alignment this file was written
   * against; shift.ts hands in a moved table. See its header.
   */
  fielders: readonly Fielder[] = FIELDERS,
): Fielder {
  const ball = feetXY(distFt, dirDeg);
  let best = fielders[0]!;
  let bestD = Infinity;
  for (const f of fielders) {
    const p = feetXY(f.distFt, f.dirDeg);
    const d = (p.x - ball.x) ** 2 + (p.y - ball.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }
  return best;
}

/**
 * How far along his run to the ball the chaser is when the ball gets there.
 *
 * STILL RIGGED FOR A BALL IN THE AIR, and only there. The outcome of a fly or a
 * liner comes from contest()'s distances, so the picture has to agree with it:
 * on an out the chaser arrives with the ball, and on a hit he is still closing
 * when it lands. That is the next step of the Unscripted Plays spec to replace.
 *
 * ⚠️ A GROUND BALL IS NOT RIGGED ANY MORE. placement.ts's cutOff() decides who
 * got there, where and when, and the overhead draws that: a ground out is 1
 * here because he really did get there first, and the infielder a ball got
 * past is drawn at the engine's own `reach`, not at anything on this list.
 *
 * A home run is the one case with no chase in it at all.
 */
export function chaseReach(outcome: Outcome): number {
  if (outcome === 'home_run') return 0.62; // drifts back, watches it go
  if (outcome === 'triple') return 0.58; // it got well past him
  if (outcome === 'double') return 0.72;
  if (outcome === 'single') return 0.84; // close, and not close enough
  // ⚠️ A FOUL HE DID NOT CATCH IS A FOUL HE COULD NOT REACH, and drawing him
  // arriving under it would say the opposite. He breaks, he gets most of the
  // way, the ball lands past him — which is what a foul into the seats looks
  // like from above. The caught one is `foul_out` and falls through to 1.
  if (outcome === 'foul') return 0.55;
  return 1; // popup, line out, ground out, foul out — he is there
}

// ------------------------------------------------------------- the defence

/**
 * Nobody breaks on contact.
 *
 * A tenth of a second of nothing is most of what separates nine dots that look
 * like fielders from nine dots that look like a screensaver. Real defenders
 * read the ball first, and the eye notices the absence even when it cannot say
 * what is wrong.
 */
export const REACTION_MS = 110;

/**
 * HOW FAST AN INFIELDER GETS TO HIS SPOT ON A GROUND BALL'S LINE — feet per
 * replay millisecond for a glove of 1.0.
 *
 * It is a REPLAY-CLOCK speed, not a real one: the ball's clock is
 * groundBallMs(), which is the pacing the overhead draws at, so this is
 * whatever speed makes a man drawn at that pace arrive when the box score says
 * he did. The one new constant step (a) was allowed.
 *
 * ⚠️ HIS RUN AND THE BALL'S ROLL BOTH START AT ZERO. The overhead holds the
 * batter's view for REPLAY_CUT_MS before the ball leaves the plate, and giving
 * the fielder those 300ms free made the pitcher field a third of the
 * grounders that were fielded — he stands on the line of everything hit up
 * the middle.
 *
 * Measured with scripts/balance.ts, 400 games each, 2026-09-23. Before this
 * change: 4.12 runs and 7.99 hits per team.
 *
 *   range   runs   hits   DP/tm  force/tm  errors
 *   0.035   5.25  10.46   0.61    1.60     0.61
 *   0.040   4.54   8.98   0.67    1.65     0.56
 *   0.042   4.34   8.62   0.67    1.64     0.61
 *   0.045   4.18   8.14   0.67    1.64     0.65
 *   0.048   4.11   7.91   0.67    1.65     0.67
 *   0.050   4.00   7.70   0.66    1.66     0.66
 *   0.055   3.82   7.29   0.62    1.67     0.66
 *
 * ⚠️ THE CURVE IS STEEP HERE — 0.005 is most of a hit per team. At 0.045, over
 * 200 games of real at-bats, 89% of grounders are fielded, 7% get through and
 * 4% die in the dirt before anybody reaches them; the fielded ones go 2B 26%,
 * SS 22%, 3B 19%, 1B 19%, P 13%. The pitcher is high against a real 6-8%,
 * because nothing here slows his first step after the follow-through.
 */
export const INFIELD_RANGE = 0.045;

/**
 * What each fielder does on this play.
 *
 * The first version moved the chaser and left the other eight standing, which
 * is the single thing that made the replay read as fake — nobody covers, and
 * the throw arrives at an empty bag. Everyone has a job on every pitch.
 */
export type Role = 'chase' | 'cover-first' | 'cover-second' | 'relay' | 'shade';

/**
 * THE CUT-OFF MAN — the infielder who runs out to take the relay.
 *
 * ⚠️ THE OUTFIELD USED TO THROW THE BALL THREE HUNDRED FEET ON THE FLY, which
 * is the one thing no outfielder does. A runner going first-to-third was gunned
 * down by a die with nothing drawn between the man who picked the ball up and
 * the bag — no throw, no cut-off, no ball travelling. So the arm rating that
 * decided it was invisible twice over: you could not see the throw and you
 * could not see who made it.
 *
 * The rule is the real one and it is short enough to state: the SHORTSTOP goes
 * out for anything to left and centre, the SECOND BASEMAN for anything to
 * right. That is where they line up and it is the only positioning a dot at
 * this scale can express.
 */
export const relayFor = (chaser: Fielder): number => (chaser.num === 9 ? 4 : 6);

/**
 * Where the cut-off man stands: out toward the ball, but not on it.
 *
 * A third of the way from his post to where the ball finished puts him in the
 * outfield grass on a deep ball and barely off the dirt on a shallow one,
 * which is what a cut-off man actually does.
 */
export const RELAY_OUT = 0.34;

/**
 * Who takes the throw at a bag. `bag` is 0 for first, 1 for second, the same
 * indices `Bases` uses.
 *
 * The rules are the two a batter can actually see from the box: the first
 * baseman covers first unless he is the one fielding it, in which case the
 * pitcher runs over; and second is covered by whichever middle infielder is
 * not going after the ball. That is real positioning, and it is also the only
 * positioning a dot at this scale can express.
 */
export function coverFor(bag: 0 | 1, chaser: Fielder): number {
  if (bag === 0) return chaser.num === 3 ? 1 : 3;
  // Ball to the left side (3B, SS) is the second baseman's bag, and the other
  // way round. The shortstop covering on his own ground ball is the mistake
  // this avoids.
  return chaser.num === 5 || chaser.num === 6 ? 4 : 6;
}

export function roleFor(
  f: Fielder,
  chaser: Fielder,
  needsSecond: boolean,
  /** True when the ball is in the outfield and somebody has to cut it off. */
  needsRelay = false,
): Role {
  if (f.num === chaser.num) return 'chase';
  if (needsSecond && f.num === coverFor(1, chaser)) return 'cover-second';
  // ⚠️ AFTER cover-second AND BEFORE cover-first. A middle infielder cannot do
  // two jobs, and on a relay the bag he was covering is somebody else's problem
  // — which is what the shade does. Putting this first would empty second base
  // on a double play, and putting it last would never fire at all, because the
  // cut-off man is one of the two men coverFor() hands the bags to.
  if (needsRelay && f.num === relayFor(chaser)) return 'relay';
  if (f.num === coverFor(0, chaser)) return 'cover-first';
  return 'shade';
}

/**
 * How far everyone else drifts toward the ball, as a fraction of their distance
 * to it.
 *
 * ponytail: one number for all seven. Backing up a base, hitting a cutoff spot
 * and shading with the hit are three different movements and this is none of
 * them — it is "the defence leaned that way", which at five pixels a dot is
 * the whole of what reads. Real backup assignments are a table nobody watching
 * a two-second replay could tell apart from this.
 */
export const SHADE = 0.12;

// -------------------------------------------------------------- the race

/**
 * How long the batter takes to reach first, at speed 1.0.
 *
 * Long enough that the throw has somewhere to sit. The ball has to reach an
 * infielder before it can be thrown, and on a compressed replay clock that is
 * already ~700ms of the play; a shorter run than this leaves a burner arriving
 * at first before the ball has been fielded, which is a picture no margin can
 * fix.
 */
export const RUN_TO_FIRST_MS = 1400;

/** Legs. The one thing a hitter who is not stealing gets from a speed stat. */
export function runToFirstMs(speed: number): number {
  return Math.max(850, Math.min(1900, RUN_TO_FIRST_MS / Math.max(0.3, speed)));
}

/**
 * A man on base is already moving when the ball is hit, so a bag costs him
 * less than the ninety feet out of the box costs the hitter.
 */
export const RUNNING_START = 0.86;

/**
 * A RUNNER'S CLOCK — ms from contact for a man of `speed` to get from bag
 * `from` to bag `to`, counted the way runnerPoint() counts: 0 is the box, 1
 * first, 4 the plate. Anyone already on base gets his running start.
 *
 * ⚠️ IT LIVED IN overhead.ts, AS A PICTURE'S CLOCK. Moved here when the force
 * play started being decided from it (ZAIS-21): the engine asks when the man
 * from first reaches second, and the replay draws him arriving then. One
 * function, so the two cannot disagree.
 */
export function runnerMs(speed: number, from: number, to: number): number {
  return runToFirstMs(speed) * (from > 0 ? RUNNING_START : 1) * (to - from);
}

/**
 * How much the throw beats him by — or misses him by.
 *
 * THE DRAMA LIVES HERE. The same `ground_out` should be routine for a 0.60
 * catcher and very nearly beaten out by a 1.40 burner: the outcome never
 * changed, only how close it looked, and it varies with a number the player
 * can read on the namecard before he swings.
 *
 * ⚠️ IT IS A FRACTION OF HIS OWN TRIP, NOT A FIXED NUMBER OF MILLISECONDS.
 * That was the first attempt and it silently did nothing. What the eye reads
 * is the gap in PIXELS between the runner and the bag, which is
 * margin/runToFirst — and a millisecond margin that scaled with speed cancelled
 * against a run time that also scaled with speed. Measured across 0.6 to 1.4 it
 * moved from 19.2% of the line to 15.6%, an indistinguishable four pixels, so
 * every play looked equally close and the speed stat bought nothing.
 */
const MARGIN_AT_SLOW = 0.3; // a third of the line back: never in doubt
const MARGIN_AT_FAST = 0.05; // half a stride: bang-bang
const SLOW = 0.6;
const FAST = 1.4;

/** The gap, as a share of the runner's own trip. See the note above. */
function marginFraction(speed: number): number {
  const k = (Math.max(SLOW, Math.min(FAST, speed)) - SLOW) / (FAST - SLOW);
  return MARGIN_AT_SLOW + (MARGIN_AT_FAST - MARGIN_AT_SLOW) * k;
}

export function throwMarginMs(speed: number): number {
  return runToFirstMs(speed) * marginFraction(speed);
}

/**
 * The beat stays in the batter's view before cutting — the crack of the bat
 * and the ball starting to leave are worth seeing from behind the plate, and
 * cutting on contact throws away the one frame the swing paid for.
 *
 * ⚠️ IT IS PART OF THE PLAY NOW, NOT ONLY OF THE PICTURE. The ball leaves the
 * plate on the overhead at this mark while the batter has been running since
 * contact, and the race at first is decided on exactly that clock (ZAIS-21) —
 * so it is the batter's head start. Changing it changes how many grounders are
 * beaten out; re-run scripts/balance.ts.
 */
export const REPLAY_CUT_MS = 300;

/** A fielder cannot catch and release instantly, and the ball has to travel. */
export const MIN_THROW_MS = 140;

/**
 * HOW FAST A THROW TRAVELS — feet per replay millisecond, for an arm of 1.0.
 *
 * The one new constant the force play was allowed (ZAIS-21). Every other clock
 * a grounder needs already existed: the ball's (groundBallMs()), the fielder's
 * (cutOff()), the batter's (runToFirstMs()) and a runner's (runnerMs()). With
 * this, "out or safe at the bag" is two numbers compared. Like INFIELD_RANGE it
 * is a REPLAY-clock speed — whatever makes a ball drawn at this pace land when
 * the book says it did — and the arm is gloveOf(), the same number range is.
 *
 * Measured with scripts/balance.ts, 400 games each, 2026-09-23. Before the
 * race (dice): 4.18 runs, 8.14 hits, 0.67 DP, 1.64 force outs, 0.65 errors.
 * "beat" is the share of fielded grounders a 1.0 batter beats out, bases empty.
 *
 * With the pivot on his own clock (pivotReadyMs() in defense.ts):
 *
 *   speed   runs   hits   DP/tm  force/tm  errors  beat
 *   0.40    4.59   9.09   0.65    2.10     0.65    1.6%
 *   0.45    4.41   8.92   0.70    2.07     0.62    0.2%
 *   0.50    4.27   8.69   0.73    2.01     0.60    0.0%
 *   0.55    4.20   8.63   0.79    2.04     0.60    0.0%
 *   0.60    4.23   8.63   0.82    2.02     0.60    0.0%
 *   0.65    4.23   8.53   0.82    1.98     0.61    0.0%
 *   0.70    4.18   8.45   0.85    1.99     0.62    0.0%
 *   0.75    4.17   8.40   0.85    1.97     0.61    0.0%
 *   0.80    4.12   8.33   0.86    1.96     0.60    0.0%
 *
 * 0.65 is the slowest arm that lands all five inside ZAIS-21's bands. Once the
 * pivot at second became coverFor()'s man (the one the replay draws), it read
 * 4.17 runs, 8.52 hits, 0.86 DP, 1.99 force outs, 0.61 errors.
 *
 * ⚠️ FORCE OUTS SIT AT THE TOP OF THEIR BAND AT EVERY SPEED. The pivot, not
 * the throw, decides them: the second baseman reaches the bag within a few ms
 * of an average runner from first, so the force comes down to the runner's
 * legs. And NOBODY BEATS OUT A CLEAN PLAY at this speed — an infield hit is a
 * ball nobody got to (cutOff()), never a race lost at first.
 *
 * Without the pivot's clock (the first sweep): 0.45 gave 4.00 runs, 8.51
 * hits, 1.08 DP and 2.14 force outs, and no speed from 0.30 to 0.60 brought
 * DP under 0.92 — the lead force cost the fielder's transfer and nothing else.
 *
 * ⚠️ BEFORE THE RUNNERS LEFT WITH THE BALL (see REPLAY_CUT_MS) the batter's
 * free 300ms put hits at 11.90 at 0.40 and still 9.83 at 1.30 — no speed
 * could land it.
 */
export const THROW_SPEED = 0.65;

/**
 * Where each bag is, in feet from home in feetXY()'s frame. Counted the way
 * runnerPoint() and ForceBag count: 1 first, 2 second, 3 third, 4 the plate.
 */
export function bagFeet(bag: number): { x: number; y: number } {
  if (bag === 2) return feetXY(BASE_FT * Math.SQRT2, 0);
  if (bag === 1 || bag === 3) return feetXY(BASE_FT, bag === 1 ? 45 : -45);
  return { x: 0, y: 0 };
}

/**
 * THE THROW'S CLOCK — ms from the moment he has the ball until it is in the
 * glove at `toBag`: the transfer, then the flight at THROW_SPEED × arm.
 */
export function throwArrivalMs(from: { x: number; y: number }, toBag: number, arm: number): number {
  const to = bagFeet(toBag);
  return MIN_THROW_MS + Math.hypot(to.x - from.x, to.y - from.y) / (THROW_SPEED * Math.max(0.1, arm));
}
/** The closest "he beat him" is allowed to look before it reads as a tie. */
const MIN_GAP_MS = 60;

export interface Race {
  /** When the batter reaches the bag, from contact. */
  runMs: number;
  /** When the ball reaches first. Null when there is no play at first. */
  throwMs: number | null;
  /** When the ball reaches SECOND, on a double play. Null otherwise. */
  relayMs: number | null;
}

/**
 * The whole race, resolved in one place so the invariant can be stated once.
 *
 * THE INVARIANT: on an out the throw arrives before the runner, and on a hit
 * it arrives after. Always. The scoreboard already said which, and a replay
 * that shows the other thing is worse than the sentence it replaced.
 *
 * The hard case is a scorched grounder to a deep infielder with a burner
 * running: the ball is not fielded until ~930ms, a throw needs 140 more, and a
 * 1.4 runner is on the bag at 1000. There is no margin that fixes that, so the
 * RUNNER is stretched instead — his trip becomes as long as the play needs. It
 * is unphysical by a few tens of milliseconds and invisible on screen, and it
 * is the only lever that keeps the picture honest without letting geometry
 * decide the out.
 *
 * `fieldedAt` is when the chaser reaches the ball, measured from contact — the
 * caller owns that because it depends on the camera's cut timing.
 *
 * ⚠️ NOT FOR A GROUNDER SOMEBODY FIELDED, ANY MORE. Those are decided from the
 * clocks in defense.ts's groundRace() and the replay draws its numbers
 * (Replay.clock, ZAIS-21): nothing to stretch, because nothing was rolled.
 * This is what is left — a booted ball, a bunt, a ball nobody got to, the
 * debug hook, and every caller that has no clock.
 */
export function raceTiming(opts: {
  speed: number;
  safe: boolean;
  play: boolean;
  fieldedAt: number;
  /** 6-4-3: the ball stops at second on its way to first. */
  doublePlay?: boolean;
  /**
   * 4-6: the ball stops at second AND STAYS THERE. The lead man is out at the
   * bag and there is no play at first behind him — see FORCE_AT_SECOND.
   */
  force?: boolean;
}): Race {
  const { speed, safe, play, fieldedAt } = opts;
  const base = runToFirstMs(speed);

  // ⚠️ CHECKED BEFORE `play`, because the play is not at first. The throw goes
  // to the bag, the man from first is out there, and the batter reaches with
  // nobody contesting it — so there is a relay and no first-base throw at all.
  // Drawing a throw to first here is what put a SAFE call under an out.
  if (opts.force) return { runMs: base, throwMs: null, relayMs: fieldedAt + MIN_THROW_MS };

  if (!play) return { runMs: base, throwMs: null, relayMs: null };

  const earliest = fieldedAt + MIN_THROW_MS;

  if (opts.doublePlay) {
    // Two legs, and the second cannot start before the first lands. The runner
    // stretch below is doing more work here than anywhere else — a double play
    // is the longest sequence in the game and the batter has to lose it.
    const relayMs = earliest;
    const earliestFirst = relayMs + MIN_THROW_MS;
    const runMs = Math.max(base, earliestFirst + MIN_GAP_MS);
    return {
      runMs,
      throwMs: Math.max(earliestFirst, runMs - runMs * marginFraction(speed)),
      relayMs,
    };
  }

  if (safe) {
    // He beat it, or it was booted. The throw simply lands late.
    return {
      runMs: base,
      throwMs: Math.max(earliest, base + base * marginFraction(speed)),
      relayMs: null,
    };
  }

  const runMs = Math.max(base, earliest + MIN_GAP_MS);
  return {
    runMs,
    throwMs: Math.max(earliest, runMs - runMs * marginFraction(speed)),
    relayMs: null,
  };
}

/**
 * Is there a play at first to watch?
 *
 * Only when the ball was on the ground AND an infielder got to it. A fly ball
 * to the gap has no throw in it worth drawing, and a caught fly is out on the
 * catch with nothing to race.
 */
export function hasPlayAtFirst(plot: Plot, chaser: Fielder): boolean {
  return plot.ground && chaser.num <= 6;
}

// ------------------------------------------------------------- the soundtrack

/** One noise, and when in the play it happens. Milliseconds from contact. */
export interface Cue {
  key: 'carry' | 'gone' | 'field' | 'relay' | 'catch' | 'call';
  at: number;
}

/**
 * When the play makes each of its noises.
 *
 * The replay used to be silent. Every sound in the game fired in the single
 * frame of contact — bat, crowd, the out — and then two seconds went by with
 * the ball carrying, a man running it down, a throw and an umpire's call, all
 * of it mute. Baseball is a sport you hear, and a play whose only sound is at
 * the start is a play that already ended.
 *
 * Pure and separate from the playing so the ORDER is testable. Whether a
 * speaker actually made a noise is not something a test can see, but "the
 * glove pops before the umpire calls, and nothing happens before the ball is
 * fielded" is exactly the part that breaks silently.
 */
export function playCues(opts: {
  plot: Plot;
  outcome: Outcome;
  safe: boolean;
  cutMs: number;
  fieldedAt: number;
  race: Race;
}): Cue[] {
  const { plot, outcome, safe, cutMs, fieldedAt, race } = opts;
  const cues: Cue[] = [];

  // A deep fly gets the crowd up while it is still in the air. The sound
  // arriving BEFORE the outcome is most of why a long fly is exciting to watch
  // rather than to be told about.
  if (!plot.ground && plot.distFt > 270) cues.push({ key: 'carry', at: cutMs + plot.hangMs * 0.35 });

  if (outcome === 'home_run') {
    cues.push({ key: 'gone', at: cutMs + plot.hangMs });
    return cues;
  }

  cues.push({ key: 'field', at: fieldedAt });

  // Caught in the air: out on the catch, no throw to wait for.
  if (!plot.ground && !safe) {
    cues.push({ key: 'call', at: fieldedAt + 60 });
    return cues;
  }

  if (race.relayMs !== null) cues.push({ key: 'relay', at: race.relayMs });
  if (race.throwMs !== null) {
    cues.push({ key: 'catch', at: race.throwMs });
    cues.push({ key: 'call', at: Math.min(race.runMs, race.throwMs) + 70 });
  }
  return cues;
}
