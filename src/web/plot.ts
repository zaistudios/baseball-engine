/**
 * Where a batted ball goes, on an overhead field.
 *
 * THE SCOPE LINE, and it is the important one: nothing here decides anything.
 * `hitTables.ts` has already returned `single` or `ground_out` by the time any
 * of this runs, and `fielding.ts` has already rolled the double play. This
 * module answers "so what should that LOOK like" and nothing else. If a future
 * change ever has a landing point deciding an out, the engine is back in the
 * outcome seam and rule 1 is broken.
 *
 * Which also means the plot is free to be unphysical where physics reads
 * wrong. It takes the hit engine's real exit velocity and launch angle so a
 * scorched double travels further than a mishit one — the timing you actually
 * put on the ball shows up in the picture — but every constant below is a
 * game-feel knob, not a measurement.
 */

import type { Outcome } from '../core/hitTables.ts';

/** Feet from home to the outfield wall, straightaway and down the lines. */
export const WALL_FT = 400;
/** Bases are 90ft apart. Used to scale the diamond, not to simulate one. */
export const BASE_FT = 90;

/**
 * Drag, as one number.
 *
 * Vacuum range at 110mph and 30° is about 700ft. Real balls hit that hard go
 * roughly 400. 0.57 is that ratio, applied flat.
 *
 * ponytail: a real drag model integrates over the flight and depends on spin,
 * air density and the seams. This is one multiply, it puts a well-struck home
 * run just over a 400ft wall, and no one watching a 2-second replay can tell
 * the difference.
 */
const DRAG = 0.57;

/** ft/s per mph, and gravity in ft/s². */
const FPS_PER_MPH = 1.467;
const G = 32.2;

/** Below this launch angle it is a ball on the ground, not a ball in the air. */
const GROUND_ANGLE = 10;

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
    const rolled = Math.max(50, Math.min(240, exitVelocityMph * 1.7));
    // A foul chopper dies against the screen or trickles into the coach's box;
    // it does not run 200ft the way a fair one down the line does.
    const distFt = foul ? Math.max(18, rolled * foulCarry(directionDeg) * 0.6) : rolled;
    return { distFt, hangMs: groundHang(distFt, foul), ground: true };
  }

  const v = exitVelocityMph * FPS_PER_MPH;
  const rad = (launchAngleDeg * Math.PI) / 180;
  let distFt = ((v * v * Math.sin(2 * rad)) / G) * DRAG;

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
      ? Math.max(distFt, WALL_FT + 14)
      : Math.min(distFt, WALL_FT - 8);

  // ⚠️ THE FOUL CLAMP COMES BEFORE THE FAIR ONE, and it has a much lower floor.
  // The 60ft minimum below is right for a ball in play — nothing fair finishes
  // in the batter's box — and wrong for the pop straight up that the catcher
  // takes four strides for.
  if (foul) {
    distFt = Math.max(18, Math.min(FOUL_MAX_FT, distFt * foulCarry(directionDeg)));
    return { distFt, hangMs: airHang(exitVelocityMph, launchAngleDeg, true), ground: false };
  }

  distFt = Math.max(60, Math.min(WALL_FT + 60, distFt));
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
function feetXY(distFt: number, dirDeg: number): { x: number; y: number } {
  const rad = (dirDeg * Math.PI) / 180;
  return { x: Math.sin(rad) * distFt, y: Math.cos(rad) * distFt };
}

// ----------------------------------------------------------------- fielders

export interface Fielder {
  /** Scorer's number, 1-9. Drawn on the dot, and the only label they get. */
  num: number;
  distFt: number;
  dirDeg: number;
}

/**
 * Where the nine stand, in standard depth. Feet and degrees from home, same
 * polar frame as everything else here.
 *
 * ponytail: ONE alignment. No shifts, no playing in with a man on third, no
 * pulling the corners for a bunt, no outfield depth by hitter. A batter-only
 * game can read "somebody was standing there" and nothing finer, and every
 * one of those variations is a decision the defence would be making — which
 * is the thing this whole subsystem is not allowed to do.
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
export function nearestFielder(distFt: number, dirDeg: number): Fielder {
  const ball = feetXY(distFt, dirDeg);
  let best = FIELDERS[0]!;
  let bestD = Infinity;
  for (const f of FIELDERS) {
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
 * THIS IS THE ONE PLACE THE REPLAY IS RIGGED, and it is rigged on purpose. The
 * outcome is already in the book, so the picture has to agree with it: on an
 * out the chaser arrives with the ball, and on a hit he is still closing when
 * it lands. Deriving it the other way round — letting the geometry decide who
 * got there — would be a fielding simulation, and a different game.
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
 * What each fielder does on this play.
 *
 * The first version moved the chaser and left the other eight standing, which
 * is the single thing that made the replay read as fake — nobody covers, and
 * the throw arrives at an empty bag. Everyone has a job on every pitch.
 */
export type Role = 'chase' | 'cover-first' | 'cover-second' | 'shade';

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

export function roleFor(f: Fielder, chaser: Fielder, needsSecond: boolean): Role {
  if (f.num === chaser.num) return 'chase';
  if (needsSecond && f.num === coverFor(1, chaser)) return 'cover-second';
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

/** A fielder cannot catch and release instantly, and the ball has to travel. */
const MIN_THROW_MS = 140;
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
 */
export function raceTiming(opts: {
  speed: number;
  safe: boolean;
  play: boolean;
  fieldedAt: number;
  /** 6-4-3: the ball stops at second on its way to first. */
  doublePlay?: boolean;
}): Race {
  const { speed, safe, play, fieldedAt } = opts;
  const base = runToFirstMs(speed);
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
