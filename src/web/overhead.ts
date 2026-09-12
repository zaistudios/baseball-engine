/**
 * THE OVERHEAD REPLAY — the camera that cuts to the field when a ball is hit.
 *
 * This was inside the roguelike screen until both screens wanted it. It is a
 * REPLAY, not a simulation, and that distinction is load-bearing: the outcome
 * was decided by hitTables.ts before contact was even drawn. Nothing here can
 * change it and nothing here is allowed to try — see the scope note in plot.ts.
 * Fielders converging and the throw-versus-runner race are choreography over a
 * result already in the book.
 *
 * Everything that used to be a module global in the caller is a parameter now:
 * the canvas, the camera, the two field colours and the sound bank. That is the
 * whole of the extraction — no behaviour moved, so the roguelike screen draws
 * exactly what it drew before.
 */

import type { RunnerMove } from '../core/inning.ts';
import type { Outcome } from '../core/hitTables.ts';
import type { ForceBag } from '../core/fielding.ts';
import {
  WALL_FT,
  BASE_FT,
  plotBatted,
  overheadPoint,
  nearestFielder,
  chaseReach,
  hasPlayAtFirst,
  raceTiming,
  runToFirstMs,
  playCues,
  roleFor,
  relayFor,
  RELAY_OUT,
  FIELDERS,
  REACTION_MS,
  SHADE,
  type Plot,
  type Fielder,
  type Race,
} from './plot.ts';
import { drawSprite } from './sprites.ts';

// ------------------------------------------------------------- the camera

/**
 * Home plate near the bottom, the wall arc near the top.
 *
 * `pxPerFt` defaults to whatever fits the canvas. Straightaway centre is the
 * tightest direction — down the line only needs 400·sin45 = 283ft of width and
 * there is usually more width than height to spend.
 */
export interface Cam {
  w: number;
  h: number;
  home: { x: number; y: number };
  pxPerFt: number;
  /** Centre of the diamond to a bag, so first sits 90ft down the line. */
  baseR: number;
  centre: { x: number; y: number };
}

export function makeCam(
  w: number,
  h: number,
  pxPerFt?: number,
  /**
   * The furthest a ball has to be drawable, in feet. Only read when pxPerFt is
   * left to fit — see the note below.
   *
   * ⚠️ THE CAMERA IS FIXED AND DOES NOT FOLLOW THE PARK, WHICH IS THE POINT.
   * Rescaling per building so each one filled the canvas would draw every park
   * the same size, and the layout — the whole reason a park exists — would be
   * invisible. One scale, set to fit the deepest fence in the league plus the
   * overshoot a home run gets, and then a 302-foot corner LOOKS like a 302-foot
   * corner next to a 420-foot centre field.
   */
  reachFt = WALL_FT,
): Cam {
  const px =
    pxPerFt ?? Math.min((h - 60) / reachFt, (w / 2 - 14) / (reachFt * Math.SQRT1_2));
  const home = { x: w / 2, y: h - 44 * (px / 0.92) };
  const baseR = (BASE_FT * px) / Math.SQRT2;
  return { w, h, home, pxPerFt: px, baseR, centre: { x: home.x, y: home.y - baseR } };
}

/** The foul lines, and the wall, both run to ±45°. */
const FOUL_DEG = 45;

// -------------------------------------------------------------- the state

export interface Replay {
  startedAt: number;
  /**
   * WHERE THE NINE WERE STANDING when this ball was hit.
   *
   * ⚠️ IT IS ON THE REPLAY RATHER THAN READ FROM THE MODULE, for the same
   * reason `wallFt` is: the picture has to agree with the play-by-play. The
   * shift that decided whether this was a hit is the shift that has to be drawn
   * under it, and a replay that looked up the current alignment would draw the
   * NEXT hitter's defence over the last hitter's result.
   */
  fielders: readonly Fielder[];
  plot: Plot;
  direction: number;
  outcome: Outcome;
  /** The batter's legs, which set how long the race to first takes. */
  speed: number;
  /** Did he reach first. Rigged from the outcome, never from the geometry. */
  safe: boolean;
  /** 6-4-3. The relay stops at second and the forced man is erased there. */
  doublePlay: boolean;
  /**
   * THE BAG A FORCE WAS TAKEN AT — 2, 3 or 4, or undefined for no force.
   * Same numbering runnerPoint() counts in, so the throw, the runner and the
   * call all read it straight.
   */
  forceAt?: ForceBag;
  /** Booted: the chaser gets there and it gets past him anyway. */
  error: boolean;
  /**
   * Everyone already on base who ended up somewhere else — `runnerMoves()`
   * plus `scorersFrom()`, whose `to` of 3 is the plate. The batter's own move
   * is excluded, because he has the race.
   */
  moves: RunnerMove[];
  /**
   * Bags whose runner DID NOT MOVE, and is therefore in neither list above.
   *
   * ⚠️ HE USED TO BE INVISIBLE. A fly ball with a man on second drew nine
   * fielders, a ball, a batter — and an empty second base, because the only
   * runners the replay knew about were the ones who changed bags. The man
   * standing on the bag is a baserunner too; he takes his lead and gets back.
   */
  held: number[];
  /**
   * The bag a runner was GUNNED DOWN at going for one too many, 2/3/4 for
   * second, third and home — inning.ts's numbering, which is also the bag
   * count from home that runnerPoint() takes.
   *
   * The play-by-play has printed this line since the arm existed and the field
   * never showed it: the throw beat a man nobody could see running.
   */
  thrownOut?: { at: number; speed: number; batter?: boolean };
  /**
   * HOW MANY BAGS THE BATTER ENDED ON — 1 unless he stretched. Omitted falls
   * back to basesFor(outcome), which is what every caller that cannot stretch
   * gets and exactly the old behaviour.
   *
   * ⚠️ IT CANNOT BE READ OFF THE OUTCOME ANY MORE. A stretched single is still
   * scored a single and leaves him on second; a replay that ran him to first
   * under a scoreboard showing him on second is the picture contradicting the
   * book.
   */
  batterTo?: number;
  /**
   * Who goes after it, when the geometry cannot say. Only fouls set this —
   * see raceFor(). Undefined means "ask nearestFielder", which is right for
   * every ball hit into fair territory.
   */
  chaserNum?: number;
  /**
   * EXTRA MILLISECONDS THE BALL SITS before the cut back — the beat a big play
   * earns. Absent is the ordinary hold, which is what a foul, an exhibition and
   * the roguelike all get.
   *
   * ⚠️ THE NUMBER COMES FROM game/scene.ts AND THIS FILE MUST NOT GUESS AT IT.
   * How much of an occasion a play is depends on the score, the inning and the
   * men on base, none of which the replay knows or should learn — it is a
   * picture of a ball, not a reader of the game state. It is handed a length.
   */
  holdMs?: number;
  /**
   * A STOLEN BASE, drawn instead of a batted ball.
   *
   * ⚠️ THE MOST RECOGNISABLE TAG PLAY IN THE SPORT HAD NO PICTURE AT ALL. A
   * steal resolved in a die and a line of text: the base HUD simply showed the
   * runner one bag further along, or gone. Everything needed to draw it was
   * already here — bags, runners, a throw, a call — and the only thing missing
   * was a reason to put them on the screen without a ball in play.
   *
   * ⚠️ IT IS NOT A FORCE AND THE CALL SAYS SO. Nobody made this man run, so the
   * catcher has to put the ball on him; `tag` is what separates it from every
   * other OUT this file draws, all of which are somebody stepping on a bag.
   *
   * from and to are bag numbers in runnerPoint()'s counting — 1 first, 2
   * second, 3 third — so the runner, the throw and the call read one set.
   */
  steal?: { from: number; to: number; safe: boolean; speed: number };
  /**
   * Which of the replay's sounds have already played.
   *
   * Keyed rather than a queue of timers because the game clock stops behind a
   * menu and setTimeout does not: a pause would fire the whole play's audio at
   * once. Checked against `t` each frame, so pausing holds the sound too.
   */
  cued: Set<string>;
}

/** Build a replay from what the engine already decided. */
export function newReplay(o: {
  now: number;
  outcome: Outcome;
  exitVelocity: number;
  launchAngle: number;
  direction: number;
  speed: number;
  safe: boolean;
  doublePlay?: boolean;
  forceAt?: ForceBag;
  error?: boolean;
  moves?: RunnerMove[];
  held?: number[];
  /** Where the defence was standing. Omitted is standard depth. */
  fielders?: readonly Fielder[];
  thrownOut?: { at: number; speed: number; batter?: boolean };
  batterTo?: number;
  steal?: { from: number; to: number; safe: boolean; speed: number };
  chaserNum?: number;
  /**
   * THE FENCE THIS BALL WENT TOWARD, in feet — the same number place() resolved
   * out of the park. Omitted is the 400-foot bowl.
   *
   * ⚠️ IT HAS TO MATCH WHAT placement.ts USED, for exactly the reason the note
   * below gives about direction. plot.ts clamps a non-home-run to `wall - 8`
   * and shoves a home run past it, so a replay plotted against a different
   * fence from the one the play-by-play was written against draws the ball
   * somewhere the sentence did not put it — a wall-ball double landing forty
   * feet inside the fence it was supposed to have hit.
   */
  wallFt?: number;
  /** The beat this play earned. See Replay.holdMs. */
  holdMs?: number;
}): Replay {
  return {
    startedAt: o.now,
    fielders: o.fielders ?? FIELDERS,
    // Direction matters to the plot for fouls only, and it must be the same
    // call placement.ts makes or the ball is drawn somewhere the play-by-play
    // did not put it.
    plot: plotBatted(o.outcome, o.exitVelocity, o.launchAngle, o.direction, o.wallFt),
    direction: o.direction,
    outcome: o.outcome,
    speed: o.speed,
    safe: o.safe,
    doublePlay: !!o.doublePlay,
    ...(o.forceAt === undefined ? {} : { forceAt: o.forceAt }),
    error: !!o.error,
    moves: o.moves ?? [],
    held: o.held ?? [],
    ...(o.thrownOut === undefined ? {} : { thrownOut: o.thrownOut }),
    ...(o.batterTo === undefined ? {} : { batterTo: o.batterTo }),
    ...(o.steal === undefined ? {} : { steal: o.steal }),
    ...(o.chaserNum === undefined ? {} : { chaserNum: o.chaserNum }),
    ...(o.holdMs === undefined ? {} : { holdMs: o.holdMs }),
    cued: new Set(),
  };
}

/** Which noises a play can make. The caller owns the samples. */
export type Sfx = (name: 'crowd' | 'mitt' | 'whiff' | 'onBase' | 'out', level?: number) => void;

export interface OverheadOpts {
  /** Grass and dirt, so each division keeps its own colour. */
  field: string;
  dirt: string;
  sfx?: Sfx;
  /**
   * THE FENCE, AS A FUNCTION OF DIRECTION — the park's outline. Omitted draws
   * the 400-foot bowl this file has always drawn, which is what the roguelike
   * and a park-less exhibition are played in.
   *
   * It is a callback rather than a Park because this file is the roguelike's
   * and has no business importing thirty ball clubs. game/main.ts hands it
   * `(d) => wallAt(d, game.home.park)`.
   */
  wall?: (dirDeg: number) => number;
}

/**
 * The beat stays in the batter's view before cutting — the crack of the bat
 * and the ball starting to leave are worth seeing from behind the plate, and
 * cutting on contact throws away the one frame the swing paid for.
 */
export const REPLAY_CUT_MS = 300;
/** The cut itself. Short: a broadcast cuts, it does not dissolve. */
export const REPLAY_FADE_MS = 200;
/** How long the ball sits where it finished before cutting back. */
export const REPLAY_HOLD_MS = 900;
/** How long after the throw resolves the call stays up. */
export const REPLAY_CALL_MS = 700;

/**
 * How long a FOUL sits there before cutting back — much less than a ball in
 * play, and this is a pacing decision rather than a cosmetic one.
 *
 * ⚠️ THERE IS MORE THAN ONE FOUL IN AN AVERAGE PLATE APPEARANCE. Giving each
 * one the full nine hundred milliseconds a finished play gets would add most of
 * a second to every at-bat in the game, several times over — the mode's whole
 * premise is that a season fits in an afternoon, and this is exactly the kind of
 * change that quietly eats that. The ball leaves the bat, you see where it went,
 * and the pitcher is getting the ball back.
 *
 * The caught one does NOT use this: a foul out ends an at-bat and gets the same
 * beat as any other out. See replayLength().
 */
export const FOUL_HOLD_MS = 220;

/**
 * Everything about the play at first, resolved once.
 *
 * Both the frame loop (which needs to know how long to stay overhead) and the
 * draw (which needs the dots) ask for this, and they must agree — a replay
 * that ends before the runner reaches the bag cuts away mid-race.
 */
export function raceFor(r: Replay): { chaser: Fielder; fieldedAt: number } & Race {
  // ⚠️ NOBODY STANDS IN FOUL GROUND, so nearestFielder() — which measures
  // against the nine at their posts in fair territory — answers the wrong
  // question about a foul and usually returns the pitcher. The catcher and the
  // two corners are the men who chase these, and placement.ts already decided
  // which; `chaserNum` carries that answer over rather than working it out a
  // second way and disagreeing.
  const chaser =
    (r.chaserNum !== undefined ? r.fielders.find((f) => f.num === r.chaserNum) : undefined) ??
    nearestFielder(r.plot.distFt, r.direction);
  const fieldedAt = REPLAY_CUT_MS + r.plot.hangMs;
  return {
    chaser,
    fieldedAt,
    ...raceTiming({
      speed: r.speed,
      safe: r.safe,
      // ⚠️ A FOUL HAS NO PLAY ANYWHERE. Nobody runs, nobody covers, nothing is
      // thrown — the at-bat either continues or the batter is already out in
      // the air. Without this the replay draws a man breaking for first on a
      // ball hit into the seats.
      play: !isFoul(r) && (hasPlayAtFirst(r.plot, chaser) || r.doublePlay),
      fieldedAt,
      doublePlay: r.doublePlay,
      force: r.forceAt !== undefined,
    }),
  };
}

/**
 * IS THERE A CUT-OFF MAN ON THIS PLAY?
 *
 * ⚠️ ONLY WHEN THERE IS A THROW TO A BAG AND AN OUTFIELDER HAS THE BALL. Those
 * are exactly the plays that used to draw nothing between the man who picked it
 * up and the runner who was called out three hundred feet away — a die decided
 * it, the play-by-play printed it, and the field showed a man stopping for no
 * visible reason. A relay drawn on every base hit would be clutter; this is the
 * one case where its absence was a hole.
 */
const needsRelay = (r: Replay, chaser: Fielder): boolean =>
  chaser.num >= 7 && r.thrownOut !== undefined;

/**
 * Where the cut-off man stands. Derived rather than stored so the fielder who
 * runs there and the ball that passes through him cannot end up in two places.
 */
function relaySpot(
  cam: Cam,
  r: Replay,
  chaser: Fielder,
  landing: { x: number; y: number },
): { x: number; y: number } {
  const num = relayFor(chaser);
  const f = r.fielders.find((x) => x.num === num);
  if (!f) return landing;
  const post = overheadPoint(f.distFt, f.dirDeg, cam.home, cam.pxPerFt);
  return {
    x: post.x + (landing.x - post.x) * RELAY_OUT,
    y: post.y + (landing.y - post.y) * RELAY_OUT,
  };
}

/** Fouls of both kinds — the one that continues the at-bat and the one that ends it. */
export const isFoul = (r: Replay): boolean =>
  r.outcome === 'foul' || r.outcome === 'foul_out';

/**
 * Total. The longer of the two things the replay might be waiting on: the ball
 * finishing its flight, or the race at first finishing.
 *
 * A slow runner on a chopper is the case that needs this — the ball is fielded
 * in half a second and he is still 1.4 seconds from the bag. Worst case is a
 * 0.6 hitter at 1900 + 460 = 2360ms.
 */
/**
 * HOW LONG A STOLEN BASE IS ON SCREEN.
 *
 * ⚠️ SHORTER THAN A BALL IN PLAY AND LONGER THAN A FOUL. It is a real play with
 * a call at the end of it, so it earns more than the 220ms a foul gets; it also
 * happens between pitches with the next hitter waiting, so it cannot have the
 * two full seconds a batted ball takes. The throw lands at THROW_MS and the
 * call sits under it for the rest.
 */
export const STEAL_MS = 1500;
export const STEAL_THROW_MS = 900;

export const replayLength = (r: Replay): number => {
  if (r.steal) return REPLAY_CUT_MS + STEAL_MS;
  // A foul that did not end the at-bat has no race to wait on and no call to
  // hold — see FOUL_HOLD_MS. The caught one falls through to the normal beat,
  // because it is an out and an out is worth a moment.
  if (r.outcome === 'foul') return REPLAY_CUT_MS + r.plot.hangMs + FOUL_HOLD_MS;
  const race = raceFor(r);
  // ⚠️ THE EXTRA BEAT IS ADDED TO BOTH ARMS OF THE MAX, and putting it on only
  // the first would make it disappear on exactly the plays worth watching. A
  // ball hit into the gap has a long race, so the race arm is usually the one
  // that wins — hold it on only the hang-time arm and a triple would get the
  // same beat as a groundout while a home run got a whole extra second.
  const extra = r.holdMs ?? 0;
  return Math.max(
    REPLAY_CUT_MS + r.plot.hangMs + REPLAY_HOLD_MS + extra,
    Math.max(race.runMs, race.throwMs ?? 0) + REPLAY_CALL_MS + extra,
  );
};

/**
 * 0 while behind the plate, 1 while overhead, ramping at each end.
 *
 * One function for both directions so the cut in and the cut back cannot drift
 * apart, and so `> 0` is the only test the frame loop needs.
 */
export function overheadAlpha(r: Replay | null, now: number): number {
  if (!r) return 0;
  const t = now - r.startedAt;
  const total = replayLength(r);
  if (t < REPLAY_CUT_MS) return 0;
  if (t > total) return 0;
  const inK = Math.min(1, (t - REPLAY_CUT_MS) / REPLAY_FADE_MS);
  const outK = Math.min(1, (total - t) / REPLAY_FADE_MS);
  return Math.min(inK, outK);
}

export const OUTCOME_COLOR: Record<string, string> = {
  home_run: '#ffd76a',
  triple: '#a8e06a',
  double: '#a8e06a',
  single: '#a8e06a',
  // Both fouls are drawn in the same dead grey — the ball is out of play and
  // the colour says so before the banner does. The green in this map is
  // reserved for a ball that is still alive.
  foul: '#8a8a7a',
  foul_out: '#8a8a7a',
};

/**
 * Where a bag sits. -1 is home plate, 0-2 are first through third.
 *
 * `r` is the centre-to-bag distance. The corner HUD passes its own and the
 * overhead passes the camera's, and the layout is already geometrically true
 * (home to first is r√2, home to second is 2r, and 2r / r√2 is √2, which is
 * 127ft over 90ft), so there was nothing to write a second time.
 */
export function basePoint(i: number, cx: number, cy: number, r: number): { x: number; y: number } {
  if (i === 0) return { x: cx + r, y: cy };
  if (i === 1) return { x: cx, y: cy - r };
  if (i === 2) return { x: cx - r, y: cy };
  return { x: cx, y: cy + r }; // home
}

/**
 * Where a covering fielder stands: at the bag, pulled a few pixels toward the
 * middle of the diamond.
 *
 * He is not ON the bag — the runner is, and drawn later, so a coverer sharing
 * the exact point vanishes underneath him. That put the picture straight back
 * where it started, with the throw arriving at what looks like an empty base.
 * It is also just true: you stretch from beside the bag, not on top of it.
 */
function besideBag(cam: Cam, bag: { x: number; y: number }): { x: number; y: number } {
  const dx = cam.centre.x - bag.x;
  const dy = cam.centre.y - bag.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x: bag.x + (dx / d) * 11, y: bag.y + (dy / d) * 11 };
}

/** Where a runner is, lerped between two bags. -1 is home, 3 is home again. */
const bagAt = (cam: Cam, i: number): { x: number; y: number } =>
  basePoint(i > 2 ? -1 : i, cam.centre.x, cam.centre.y, cam.baseR);

/**
 * How many bags the batter finishes on.
 *
 * ⚠️ THE REPLAY USED TO STOP HIM AT FIRST ON EVERY BALL IN PLAY, whatever the
 * scoreboard said. drawRace() drew one leg — home to first — unconditionally,
 * so a double, a triple and a home run all ended with the hitter standing on
 * first base while the banner over him read HOME RUN. It is the single most
 * visible way the picture contradicted the result.
 */
/**
 * How many times a ground ball bounces on its way out, and how fast the hops
 * flatten off.
 *
 * Three is what a chopper through the infield actually does before it is
 * fielded; the decay is what makes the last one a skid rather than a hop.
 */
const HOPS = 3;

/**
 * The height of a ground ball at a point in its travel, 0 to 1, as a series of
 * decaying bounces.
 *
 * ponytail: `|sin|` and a falling envelope, not a restitution model. Nothing
 * downstream reads this — it scales a radius by a few pixels — and a real
 * coefficient of restitution would need the ball's speed, the angle it struck
 * at and what the infield dirt is like, to move a dot by two pixels.
 */
const hop = (k: number): number =>
  Math.abs(Math.sin(k * HOPS * Math.PI)) * (1 - k) ** 1.5 * 0.45;

export const basesFor = (outcome: Outcome): number =>
  outcome === 'home_run' ? 4 : outcome === 'triple' ? 3 : outcome === 'double' ? 2 : 1;

/**
 * Where a runner is after covering `bases` bags, following the basepath rather
 * than cutting across the diamond.
 *
 * `bases` is fractional and runs 0 (in the box) to 4 (across the plate). The
 * corner is the whole point — a man going first to third runs two legs, and
 * lerping straight from first to third would send him through the pitcher.
 */
export function pathPoint(cam: Cam, bases: number): { x: number; y: number } {
  const leg = Math.max(0, Math.min(3, Math.floor(bases)));
  const k = Math.max(0, Math.min(1, bases - leg));
  const a = bagAt(cam, leg - 1);
  const b = bagAt(cam, leg);
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

/**
 * How far outside the basepath a runner swings to round a bag, as a fraction
 * of the diamond's own radius. Small on purpose — a runner rounds second, he
 * does not run a lap of the mound.
 */
const ROUND_OUT = 0.13;
/** How much of a leg either side of the bag the arc occupies. */
const ROUND_SPAN = 0.62;

/** Smooth at both ends, so the arc has no kink where it meets the straight. */
const smooth = (k: number): number => k * k * (3 - 2 * k);

/**
 * WHERE A RUNNER ACTUALLY IS, `k` of the way from one bag to another.
 *
 * ⚠️ THIS IS THE FUNCTION THAT WAS MISSING, and its absence is what made the
 * replay read as a diagram rather than a baseball play. Every runner used to
 * be lerped STRAIGHT from the bag he left to the bag he reached — so a man
 * scoring from first ran a diagonal across the infield, through the mound and
 * over the pitcher, arriving at the plate having never touched second or
 * third. Two dots crossing the diamond in an X is not baserunning.
 *
 * `from` and `to` are bags COUNTED FROM HOME, the same numbering pathPoint()
 * takes: 0 is the box, 1/2/3 are the bags, 4 is back across the plate. So a
 * man on first who scores is `from: 1, to: 4` and runs three legs.
 *
 * The bulge is the other half. A runner who is CONTINUING past a bag swings
 * wide of it and cuts back — he cannot take a ninety-degree corner at speed —
 * and the bag he finishes on gets no arc at all, because he stops there. One
 * outward push per bag being rounded, biggest at the bag itself, gone by the
 * middle of the legs either side.
 */
export function runnerPoint(
  cam: Cam,
  from: number,
  to: number,
  k: number,
): { x: number; y: number } {
  const u = from + (to - from) * Math.max(0, Math.min(1, k));
  const p = pathPoint(cam, u);

  let bulge = 0;
  for (let bag = Math.floor(from) + 1; bag < to; bag++) {
    bulge = Math.max(bulge, 1 - Math.abs(u - bag) / ROUND_SPAN);
  }
  if (bulge <= 0) return p;

  // Outward is away from the middle of the diamond, which at a bag is exactly
  // the corner's bisector and mid-leg is exactly perpendicular to the path.
  const dx = p.x - cam.centre.x;
  const dy = p.y - cam.centre.y;
  const d = Math.hypot(dx, dy) || 1;
  const out = smooth(bulge) * cam.baseR * ROUND_OUT;
  return { x: p.x + (dx / d) * out, y: p.y + (dy / d) * out };
}

export function drawOverhead(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  r: Replay,
  now: number,
  opts: OverheadOpts,
): void {
  const t = now - r.startedAt - REPLAY_CUT_MS;
  // Fraction of the flight completed. Clamped, so the HOLD beat parks the ball
  // at its landing spot rather than sailing it off the canvas.
  const k = Math.max(0, Math.min(1, t / r.plot.hangMs));

  ctx.save();

  // Foul ground first, as the era's field colour knocked back, then fair
  // territory lifted out of it.
  //
  // The wedge needs real contrast, not a hint of one: the Holdouts run
  // field #3b3524 against dirt #4a3d29, two browns a few points apart, and at
  // the 3.5% lift this started with the whole overhead read as one flat pane.
  ctx.fillStyle = opts.field;
  ctx.fillRect(0, 0, cam.w, cam.h);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(0, 0, cam.w, cam.h);

  const wallFt = opts.wall ?? (() => WALL_FT);

  /**
   * The fence, as a path from the left-field line round to the right.
   *
   * ⚠️ IT IS SAMPLED, NOT AN ARC, AND THAT IS THE WHOLE VISIBLE PAYOFF OF A
   * LAYOUT. An arc can only draw a park that is the same distance in every
   * direction — which is the bowl this file drew for its whole life. Walking
   * the ninety degrees between the foul lines and asking wallAt() at each step
   * is what puts a short porch in right and a 420-foot notch in centre on the
   * screen. Two degrees a step is smooth at any canvas size this game runs at.
   */
  const fencePath = (): void => {
    ctx.moveTo(cam.home.x, cam.home.y);
    for (let d = -FOUL_DEG; d <= FOUL_DEG; d += 2) {
      const p = overheadPoint(wallFt(d), d, cam.home, cam.pxPerFt);
      ctx.lineTo(p.x, p.y);
    }
    const end = overheadPoint(wallFt(FOUL_DEG), FOUL_DEG, cam.home, cam.pxPerFt);
    ctx.lineTo(end.x, end.y);
  };

  // Fair territory: the wedge between the foul lines, out to the wall.
  ctx.fillStyle = opts.field;
  ctx.beginPath();
  fencePath();
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fill();

  // The infield dirt, as a skin around the diamond rather than a square —
  // which is what it looks like from above.
  ctx.fillStyle = opts.dirt;
  ctx.beginPath();
  ctx.arc(cam.centre.x, cam.centre.y, cam.baseR * 1.62, 0, Math.PI * 2);
  ctx.fill();

  // Foul lines and the wall.
  ctx.strokeStyle = 'rgba(216,216,192,0.4)';
  ctx.lineWidth = 2;
  for (const d of [-FOUL_DEG, FOUL_DEG]) {
    const end = overheadPoint(wallFt(d), d, cam.home, cam.pxPerFt);
    ctx.beginPath();
    ctx.moveTo(cam.home.x, cam.home.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(216,216,192,0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  // ⚠️ THE FENCE ONLY, NOT fencePath() — that one starts at home plate so it
  // can be filled as a wedge, and stroking it would draw both foul lines a
  // second time in the wall's heavier colour.
  for (let d = -FOUL_DEG; d <= FOUL_DEG; d += 2) {
    const p = overheadPoint(wallFt(d), d, cam.home, cam.pxPerFt);
    if (d === -FOUL_DEG) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();

  // The bags. Outlines only, and no runners on them — the engine has ALREADY
  // moved the runners by the time this draws, so lighting the bags from base
  // state would put the man on second before the ball he hit has landed. The
  // race below owns that.
  ctx.strokeStyle = 'rgba(232,232,212,0.8)';
  ctx.lineWidth = 2;
  for (let i = -1; i < 3; i++) {
    const p = basePoint(i, cam.centre.x, cam.centre.y, cam.baseR);
    const s = i === -1 ? 5 : 7;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - s);
    ctx.lineTo(p.x + s, p.y);
    ctx.lineTo(p.x, p.y + s);
    ctx.lineTo(p.x - s, p.y);
    ctx.closePath();
    ctx.stroke();
  }

  // The nine, each with a job. The chaser is computed against where the ball
  // FINISHES, not where it is right now — a fielder who re-picks his target
  // every frame wanders, and real ones break on the ball once.
  const race = raceFor(r);
  const { chaser } = race;
  const landing = overheadPoint(r.plot.distFt, r.direction, cam.home, cam.pxPerFt);
  const relaying = needsRelay(r, chaser);
  // Fielder clocks run from CONTACT, not from the cut — `t` above is the
  // ball's flight time and they are 220ms apart.
  const tc = now - r.startedAt;
  const first = basePoint(0, cam.centre.x, cam.centre.y, cam.baseR);
  const second = basePoint(1, cam.centre.x, cam.centre.y, cam.baseR);

  /** Ease-out over a window, with the reaction beat in front of it. */
  const leg = (endMs: number): number => {
    const span = Math.max(120, endMs - REACTION_MS);
    return 1 - (1 - Math.max(0, Math.min(1, (tc - REACTION_MS) / span))) ** 2;
  };

  for (const f of r.fielders) {
    const post = overheadPoint(f.distFt, f.dirDeg, cam.home, cam.pxPerFt);
    const role = roleFor(f, chaser, r.doublePlay, relaying);
    let to = post;
    let k2 = 0;

    if (role === 'chase') {
      to = landing;
      // A booted ball is one he GOT to — he just did not hold it. Reaching
      // short of it would read as him giving up, which is a different play.
      k2 = (r.error ? 1 : chaseReach(r.outcome)) * leg(race.fieldedAt);
    } else if (role === 'cover-first') {
      to = besideBag(cam, first);
      k2 = leg(race.throwMs ?? race.fieldedAt);
    } else if (role === 'cover-second') {
      to = besideBag(cam, second);
      k2 = leg(race.relayMs ?? race.fieldedAt);
    } else if (role === 'relay') {
      // Out toward the ball and not onto it — see relaySpot(). He has to be
      // standing there BEFORE the outfielder lets go, so his clock is the catch.
      to = relaySpot(cam, r, chaser, landing);
      k2 = leg(race.fieldedAt);
    } else {
      to = landing;
      k2 = SHADE * leg(race.fieldedAt);
    }

    const p = { x: post.x + (to.x - post.x) * k2, y: post.y + (to.y - post.y) * k2 };
    const busy = role !== 'shade';

    // A per-position asset (`assets/fielders/6.png`) or one `_default.png` for
    // all nine. The man who is not involved in the play is drawn faded either
    // way, which is what stops nine equally-bright figures reading as a crowd.
    if (
      drawSprite(ctx, 'fielders', p.x, p.y + 5, { id: String(f.num) }, { alpha: busy ? 1 : 0.55 })
    ) {
      continue;
    }

    ctx.fillStyle = busy ? '#e8e8d4' : 'rgba(200,204,208,0.55)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, busy ? 6 : 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(11,17,12,0.9)';
    ctx.font = 'bold 8px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(f.num), p.x, p.y + 0.5);
  }

  // ⚠️ A STEAL HAS NO BATTED BALL, so everything below — the flight, the trail,
  // the hop, the race to first — is about a ball that was never hit. It gets
  // its own short block and returns.
  if (r.steal) {
    drawSteal(ctx, cam, now, r, r.steal, opts);
    ctx.restore();
    return;
  }

  // The ball, and the ground it has covered.
  //
  // Two outcomes are allowed past their own landing point. A home run keeps
  // going and leaves the frame, because a ball that stops dead on the warning
  // track is not what the banner just said; and a booted one trickles on past
  // the man who should have had it, which is the whole picture of an error.
  let kBall = k;
  const over = (t - r.plot.hangMs) / 900;
  if (r.outcome === 'home_run') kBall = Math.max(0, t / r.plot.hangMs);
  else if (r.error && over > 0) kBall = k + Math.min(0.22, over * 0.22);

  // ⚠️ A GROUND BALL SLOWS DOWN AND A BALL IN THE AIR DOES NOT. Both used to
  // cross the field at a constant rate, which is the detail that made a
  // six-hopper through the infield read like a laser: the dot left the bat and
  // arrived at the shortstop at the same speed the whole way. Friction is most
  // of what a grounder looks like, so it gets an ease-out — quick out of the
  // box, dying as it reaches somebody. The arrival time is unchanged, so the
  // chaser still meets it exactly where and when he did.
  if (r.plot.ground) kBall = 1 - (1 - kBall) ** 2;

  const at = overheadPoint(r.plot.distFt * kBall, r.direction, cam.home, cam.pxPerFt);

  // ⚠️ A TRAIL, NOT A TETHER. This was a flat 30%-alpha line from home plate to
  // the ball, held at full strength for the whole play — so a home run dragged
  // a four-hundred-foot rubber band behind it that never faded, and the eye
  // read the line rather than the ball. A gradient that dies out toward the
  // plate says the same thing about where the ball came from while leaving the
  // ball itself the brightest thing on the field.
  const trail = ctx.createLinearGradient(cam.home.x, cam.home.y, at.x, at.y);
  trail.addColorStop(0, 'rgba(244,244,232,0)');
  trail.addColorStop(0.7, 'rgba(244,244,232,0.09)');
  trail.addColorStop(1, 'rgba(244,244,232,0.4)');
  ctx.strokeStyle = trail;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cam.home.x, cam.home.y);
  ctx.lineTo(at.x, at.y);
  ctx.stroke();

  // A fly ball rises and falls; a grounder HOPS. From above both are the ball's
  // SIZE, not its height — which is the whole reason this view can reuse one
  // coordinate and still tell a popup from a chopper.
  //
  // ⚠️ THE GROUNDER USED TO BE PERFECTLY FLAT — `ground ? 0 : ...` — and a dot
  // sliding across the dirt at a fixed size is the one thing on this field that
  // looks like a cursor rather than a baseball. Real ground balls bounce, each
  // hop lower than the last, and that shape is legible even at four pixels.
  const lift = r.plot.ground ? hop(kBall) : Math.sin(k * Math.PI);
  const ballR = 3.5 + lift * 4.5;
  if (lift > 0.05) {
    // Its shadow stays on the grass, so the arc is legible from overhead.
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.arc(at.x + lift * 5, at.y + lift * 7, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = OUTCOME_COLOR[r.outcome] ?? '#f4f4e8';
  ctx.beginPath();
  ctx.arc(at.x, at.y, ballR, 0, Math.PI * 2);
  ctx.fill();

  // ⚠️ NOBODY RUNS ON A FOUL. drawRace() puts the batter down the line and
  // moves every runner up; on a ball into the seats none of that happened, and
  // on a foul out the batter never left the box. It also owns the SAFE/OUT
  // call, which a foul has no business showing.
  if (!isFoul(r)) drawRace(ctx, cam, now, r, landing, opts);

  ctx.restore();
}

/**
 * Play a sound the first time the replay clock passes a moment.
 *
 * Driven off `t` rather than scheduled, so it inherits the game clock: pause
 * mid-flight and the throw does not thump into a glove behind the menu.
 */
function cue(r: Replay, key: string, at: number, t: number, sound: () => void): void {
  if (t < at || r.cued.has(key)) return;
  r.cued.add(key);
  sound();
}

/**
 * Every noise the play makes after the bat.
 *
 * The schedule lives in plot.ts and is pure; this only decides which sample a
 * cue maps to. The samples themselves belong to the caller — a glove is a
 * glove whether the ball arrives from a bat or a throw.
 */
function cuePlaySounds(
  r: Replay,
  t: number,
  race: ReturnType<typeof raceFor>,
  sfx: Sfx,
): void {
  const cues = playCues({
    plot: r.plot,
    outcome: r.outcome,
    safe: r.safe,
    cutMs: REPLAY_CUT_MS,
    fieldedAt: race.fieldedAt,
    race,
  });

  for (const c of cues) {
    cue(r, c.key, c.at, t, () => {
      switch (c.key) {
        case 'carry':
          return sfx('crowd', Math.min(0.9, (r.plot.distFt - 240) / 220));
        case 'gone':
          // The homer sting already fired at contact; this is the park
          // reacting when it actually clears the wall.
          return sfx('crowd', 1);
        case 'field':
          return sfx(r.error ? 'whiff' : 'mitt');
        case 'relay':
        case 'catch':
          return sfx('mitt');
        case 'call':
          return sfx(r.safe ? 'onBase' : 'out');
      }
    });
  }
}

/**
 * A runner in the overhead replay.
 *
 * Reads `assets/fielders/runner.png` rather than a folder of its own — the
 * replay's figures are all the same size at the same scale, and a `runners/`
 * kind holding one file would be a folder to explain for no benefit.
 */
function drawRunnerDot(
  ctx: CanvasRenderingContext2D,
  p: { x: number; y: number },
  dim = false,
): void {
  if (drawSprite(ctx, 'fielders', p.x, p.y + 5, { id: 'runner' }, { alpha: dim ? 0.55 : 1 })) {
    return;
  }
  ctx.fillStyle = dim ? 'rgba(90,169,230,0.55)' : '#5aa9e6';
  ctx.beginPath();
  ctx.arc(p.x, p.y, 5.5, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * THE STOLEN BASE — the runner, the catcher's throw, and a tag at the end.
 *
 * ⚠️ THE THROW COMES FROM HOME, not from wherever a batted ball finished, and
 * that is the whole shape of the play: the catcher is the fielder, the bag is
 * the target, and the runner left before either of them moved. Everything here
 * is drawn with the same helpers a ball in play uses, so a steal and a force
 * look like the same sport.
 */
function drawSteal(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  now: number,
  r: Replay,
  steal: NonNullable<Replay['steal']>,
  opts: OverheadOpts,
): void {
  const t = now - r.startedAt - REPLAY_CUT_MS;
  const bag = bagAt(cam, steal.to - 1);

  // The nine at their posts, with the man taking the throw coming to the bag.
  // The shortstop covers second on a steal and the third baseman covers third —
  // which is where they already are, and the only positioning a dot can say.
  const cover = steal.to === 3 ? 5 : 6;
  for (const f of r.fielders) {
    const post = overheadPoint(f.distFt, f.dirDeg, cam.home, cam.pxPerFt);
    const takes = f.num === cover;
    const to = takes ? besideBag(cam, bag) : post;
    const k = takes ? Math.min(1, Math.max(0, t / STEAL_THROW_MS)) : 0;
    const p = { x: post.x + (to.x - post.x) * k, y: post.y + (to.y - post.y) * k };
    if (!drawSprite(ctx, 'fielders', p.x, p.y + 5, { id: String(f.num) }, { alpha: takes ? 1 : 0.55 })) {
      ctx.fillStyle = takes ? '#e8e8d4' : 'rgba(200,204,208,0.55)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // The runner. He is off at the pitch, so his clock starts at zero, and he
  // stops dim on the bag he did not get.
  const runMs = runToFirstMs(steal.speed) * RUNNING_START;
  const k = Math.min(1, t / runMs);
  drawRunnerDot(ctx, runnerPoint(cam, steal.from, steal.to, k), !steal.safe && t > runMs);

  // The catcher's throw, from the plate to the bag.
  if (t > 120) {
    const k2 = Math.min(1, (t - 120) / (STEAL_THROW_MS - 120));
    ctx.strokeStyle = 'rgba(244,244,232,0.22)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cam.home.x, cam.home.y);
    ctx.lineTo(bag.x, bag.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#f4f4e8';
    ctx.beginPath();
    ctx.arc(cam.home.x + (bag.x - cam.home.x) * k2, cam.home.y + (bag.y - cam.home.y) * k2, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // The call, once both the man and the ball have got there.
  if (t > Math.max(runMs, STEAL_THROW_MS)) {
    ctx.font = 'bold 15px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = steal.safe ? '#6fbf73' : '#ff8c66';
    ctx.fillText(steal.safe ? 'SAFE' : 'OUT', bag.x + (steal.to === 3 ? -24 : 22), bag.y - 16);
  }
  // ⚠️ THROUGH cue(), NOT A BARE CALL. The draw runs every frame, so a sound
  // fired straight from here plays sixty times a second for the rest of the
  // play — and the keyed set is also what makes it survive the clock stopping
  // behind a menu. See cuePlaySounds().
  if (opts.sfx) {
    const sfx = opts.sfx;
    cue(r, 'mitt', STEAL_THROW_MS, t, () => sfx('mitt'));
    cue(r, 'call', Math.max(runMs, STEAL_THROW_MS), t, () =>
      sfx(steal.safe ? 'onBase' : 'out'),
    );
  }
}

/**
 * A man on base is already moving when the ball is hit, so a bag costs him
 * less than the ninety feet out of the box costs the hitter.
 */
const RUNNING_START = 0.86;

/**
 * The lead: off the bag and back on it, for a runner who is going nowhere.
 *
 * Twelve feet of ninety, out and back over the first second — a real primary
 * lead, and no more. The point is that he is a person rather than a lit lamp,
 * not that he is about to steal.
 */
const LEAD_LEG = 0.13;
const leadOff = (t: number): number => Math.sin(Math.min(1, t / 900) * Math.PI) * LEAD_LEG;

/**
 * The race to first, the relay on a double play, and everyone else moving up.
 *
 * All clocks are measured from CONTACT, not from the cut, because that is when
 * they all started — at the cut the batter is already a fifth of the way down
 * the line, which is what it looks like on television too.
 */
function drawRace(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  now: number,
  r: Replay,
  landing: { x: number; y: number },
  opts: OverheadOpts,
): void {
  const t = now - r.startedAt;
  const first = bagAt(cam, 0);
  /**
   * WHERE THE FORCE IS BEING TAKEN. A double play always goes through second;
   * a plain force goes to whichever bag the defence chose, which is second,
   * third or the plate — see LEAD_FORCE in core/fielding.ts.
   *
   * ⚠️ ONE VARIABLE FOR THE THROW, THE RUNNER AND THE CALL. Three separate
   * `second`s is how the ball ends up at one bag and the OUT at another.
   */
  const forceAt: ForceBag = r.doublePlay ? 2 : (r.forceAt ?? 2);
  const forceBag = bagAt(cam, forceAt - 1);
  const race = raceFor(r);
  const { fieldedAt, runMs, throwMs, relayMs } = race;
  if (opts.sfx) cuePlaySounds(r, t, race, opts.sfx);

  /**
   * How long a man already on base takes to cover `legs` bags.
   *
   * A RUNNING START IS THE DIFFERENCE. He broke with the pitch, so ninety feet
   * costs him less than it costs the batter standing still in the box — and
   * two bags cost him about twice one, which is the part that used to be
   * missing entirely.
   *
   * Capped the same way the batter's trip is, and for the same reason: a man
   * scoring from first covers three bags, and three bags at an honest pace
   * outlasts a replay that is over in under four seconds. See the note on the
   * batter below.
   */
  // Named, not `window`: this file runs in a browser and that name is taken.
  const onScreen = replayLength(r) - REPLAY_FADE_MS;
  const trip = (speed: number, legs: number): number =>
    Math.min(runToFirstMs(speed) * RUNNING_START * legs, Math.max(onScreen, runMs));

  /**
   * The man gunned down going for one too many, and where he set off from.
   *
   * ⚠️ THE BAG HE LEFT IS NOT STORED ANYWHERE, and it does not need to be.
   * advance() only ever lets a runner stretch for ONE bag past what the hit
   * was worth, so the bag he was cut down at minus the hit minus that one
   * extra IS the bag he was standing on. See the extra-base clause in
   * core/inning.ts, which is the only thing that can produce this.
   */
  const gunned =
    // ⚠️ NOT THE BATTER. He is already being drawn by the race below, so a
    // second dot here sprints a leg he never ran while the real one runs the
    // one he did. See ThrownOut.batter.
    r.thrownOut === undefined || r.thrownOut.batter
      ? null
      : {
          at: r.thrownOut.at,
          from: r.thrownOut.at - 1 - basesFor(r.outcome),
          ms: trip(r.thrownOut.speed, 1 + basesFor(r.outcome)),
        };

  /**
   * THE MAN THE THROW IS GOING AFTER, and when it gets there. It is either a
   * runner gunned down going for one too many or the batter caught stretching
   * his own hit, and both are drawn from the same two numbers.
   */
  // ⚠️ HOW FAR THE BATTER RUNS, HOISTED ABOVE THE THROWS. Both the ball and the
  // man have to be worked out from one pair of numbers, or a throw lands at a
  // bag the runner is still two hundred milliseconds from reaching.
  const bases = r.batterTo ?? basesFor(r.outcome);
  const stretchedOut = r.thrownOut?.batter === true;
  const tripMs = bases === 1 ? runMs : Math.min(runMs * bases, onScreen);

  /**
   * THE MAN THE THROW IS GOING AFTER, and when it has to get there. It is
   * either a runner gunned down going for one too many or the batter caught
   * stretching his own hit, and both are drawn from the same two numbers.
   */
  const gunnedThrow = stretchedOut
    ? { at: bases, ms: tripMs }
    : gunned
      ? { at: gunned.at, ms: gunned.ms }
      : null;

  // Whether an outfielder has to cut it off on the way. See relaySpot().
  const relaying = needsRelay(r, race.chaser);

  // A caught fly is out on the catch. He pulls up rather than running it out,
  // which is both what happens and what stops a pointless dot finishing a race
  // that was decided in the air.
  const caught = !r.plot.ground && !r.safe;

  // The men standing on a bag, doing what a man on a bag does: edging off it
  // and getting back. They are not going anywhere on this play and they are
  // still baserunners — an occupied base with nobody drawn on it is the thing
  // that made the field look like a diagram.
  for (const bag of r.held) {
    drawRunnerDot(ctx, runnerPoint(cam, bag + 1, bag + 2, leadOff(t)));
  }

  // Everyone who was already on and went somewhere, ALONG THE BASEPATH and at
  // his own pace. Both halves of that sentence used to be false: they cut
  // straight across the diamond, and they all took exactly as long as the
  // batter's race to first however far they were going.
  for (const m of r.moves) {
    const from = m.from + 1;
    const to = m.to + 1;
    drawRunnerDot(ctx, runnerPoint(cam, from, to, t / trip(m.speed, to - from)));
  }

  // The man gunned down going for one too many. He runs it exactly like the
  // rest and then stops, dim, at the bag he did not get — until now the only
  // trace of that on screen was a line of text.
  if (gunned) {
    drawRunnerDot(ctx, runnerPoint(cam, gunned.from, gunned.at, t / gunned.ms), t > gunned.ms);
  }

  // The forced man, on a double play AND on a plain force. He is erased from
  // the base state, so he is in neither list above — he has to be drawn from
  // the fact of the play itself. He stops dead at second when the throw beats
  // him, which IS the out.
  if ((r.doublePlay || r.forceAt !== undefined) && relayMs !== null) {
    // ⚠️ THE LEG HE WAS ACTUALLY RUNNING, not first-to-second every time. A man
    // forced at third came from second and a man forced at the plate came from
    // third; drawing all three of them breaking out of first put a runner on a
    // basepath he was never on. runnerPoint() counts bags the same way
    // `forceAt` does, so the two ends need no translating.
    drawRunnerDot(ctx, runnerPoint(cam, forceAt - 1, forceAt, t / relayMs), t > relayMs);
  }

  // The ball's route: to second first on a double play, then on to first.
  const throwLeg = (
    from: { x: number; y: number },
    to: { x: number; y: number },
    startMs: number,
    endMs: number,
  ) => {
    if (t < startMs) return;
    const k = Math.min(1, (t - startMs) / Math.max(90, endMs - startMs));
    ctx.strokeStyle = 'rgba(244,244,232,0.22)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#f4f4e8';
    ctx.beginPath();
    ctx.arc(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k, 3.5, 0, Math.PI * 2);
    ctx.fill();
  };

  if (throwMs !== null) {
    if (relayMs !== null) {
      throwLeg(landing, forceBag, fieldedAt, relayMs);
      throwLeg(forceBag, first, relayMs, throwMs);
    } else {
      throwLeg(landing, first, fieldedAt, throwMs);
    }
  } else if (r.forceAt !== undefined && relayMs !== null) {
    // One leg, and it ends at the bag. Nothing is thrown to first behind it.
    throwLeg(landing, forceBag, fieldedAt, relayMs);
  }

  // ⚠️ THE THROW THAT GOT A RUNNER USED TO BE DRAWN NOWHERE AT ALL. gunDown()
  // has decided this since the arm shipped and the field never showed it: a man
  // stopped dead at a bag and a line of text said why. Now the ball goes there,
  // through the cut-off man when an outfielder has it — see relaySpot().
  //
  // It is timed off the runner rather than off a clock of its own, because the
  // one thing it must never do is arrive after the man it beat.
  if (gunnedThrow) {
    const bag = bagAt(cam, gunnedThrow.at - 1);
    const land = gunnedThrow.ms;
    if (relaying) {
      const cut = relaySpot(cam, r, race.chaser, landing);
      const cutAt = fieldedAt + (land - fieldedAt) * 0.45;
      throwLeg(landing, cut, fieldedAt, cutAt);
      throwLeg(cut, bag, cutAt, land);
    } else {
      throwLeg(landing, bag, fieldedAt, land);
    }
  }

  // The batter, running it out as far as the scoreboard says he got.
  //
  // ⚠️ THE PACE IS THE TRIP, NOT THE LEG. `runMs` is the race to FIRST and it
  // is the only clock raceTiming() models, because the only play it has to keep
  // honest is the one at first. Multiplying it by the bags gives the natural
  // pace — but on a home run that is 4 × 1400ms against a replay that is over
  // in 3.8 seconds, and he would be cut off rounding third. So the trip is
  // capped to land him on the bag just before the camera cuts back, which on a
  // long ball reads as the trot it should be.
  // ⚠️ HOW FAR HE ACTUALLY GOT, not how far the hit was worth. A stretched
  // single leaves him on second and a stretch he lost leaves him dead at it.
  const tripK = Math.min(caught ? 0.55 : 1, t / tripMs);
  drawRunnerDot(ctx, runnerPoint(cam, 0, bases, tripK), stretchedOut && t > tripMs);

  // The calls. A double play gets two, each landing when its own throw does,
  // which is what makes 6-4-3 read as two outs rather than one long one.
  ctx.font = 'bold 15px ui-monospace, Menlo, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const call = (text: string, at: { x: number; y: number }, safe: boolean, dx = 22) => {
    ctx.fillStyle = safe ? '#6fbf73' : '#ff8c66';
    ctx.fillText(text, at.x + dx, at.y - 16);
  };

  // The man cut down going for the extra base gets his own call, at his own
  // bag. It is a second out on a play the batter was safe on, which is exactly
  // why it needs saying somewhere other than the play-by-play.
  if (gunned && t > gunned.ms) {
    call('OUT', bagAt(cam, gunned.at - 1), false, gunned.at === 3 ? -24 : 22);
  }

  // The batter cut down stretching his own hit. Called at the bag he was
  // reaching for, which is the one the race just ran him to.
  if (stretchedOut && t > tripMs) {
    call('OUT', bagAt(cam, bases - 1), false, bases >= 3 ? -24 : 22);
  }

  if (caught) {
    // Out in the air, so it is called where the catch happened.
    if (t > fieldedAt) call('OUT', landing, false, 0);
    return;
  }

  // ⚠️ THE CALL AT SECOND COMES BEFORE THE `throwMs === null` RETURN BELOW, and
  // putting it after was a real bug the screen caught. On a FORCE PLAY the only
  // throw there is ends at the bag — there is nothing thrown to first, so
  // `throwMs` is null by design — and the early return skipped the one call the
  // whole play is about. The ball flew to second, the runner stopped dead on
  // it, and no umpire said anything. It is drawn on a double play from the same
  // line, where `throwMs` happens to be set, which is why it read as working.
  // ⚠️ SAME BAG THE BALL WENT TO. The dx flips for third and the plate so the
  // word does not sit on top of the diamond it is calling.
  if (relayMs !== null && t > relayMs) call('OUT', forceBag, false, forceAt >= 3 ? -24 : 22);

  // No throw means no play at FIRST, and no play means no call. An umpire does
  // not signal safe at first on a ball off the wall — and doing it anyway put a
  // green SAFE next to the bag under a banner reading HOME RUN.
  if (throwMs === null) return;
  if (t > Math.min(runMs, throwMs)) call(r.safe ? 'SAFE' : 'OUT', first, r.safe);
}
