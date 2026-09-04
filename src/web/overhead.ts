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
import {
  WALL_FT,
  BASE_FT,
  plotBatted,
  overheadPoint,
  nearestFielder,
  chaseReach,
  hasPlayAtFirst,
  raceTiming,
  playCues,
  roleFor,
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

export function makeCam(w: number, h: number, pxPerFt?: number): Cam {
  const px =
    pxPerFt ?? Math.min((h - 60) / WALL_FT, (w / 2 - 14) / (WALL_FT * Math.SQRT1_2));
  const home = { x: w / 2, y: h - 44 * (px / 0.92) };
  const baseR = (BASE_FT * px) / Math.SQRT2;
  return { w, h, home, pxPerFt: px, baseR, centre: { x: home.x, y: home.y - baseR } };
}

/** The foul lines, and the wall, both run to ±45°. */
const FOUL_DEG = 45;

// -------------------------------------------------------------- the state

export interface Replay {
  startedAt: number;
  plot: Plot;
  direction: number;
  outcome: Outcome;
  /** The batter's legs, which set how long the race to first takes. */
  speed: number;
  /** Did he reach first. Rigged from the outcome, never from the geometry. */
  safe: boolean;
  /** 6-4-3. The relay stops at second and the forced man is erased there. */
  doublePlay: boolean;
  /** Booted: the chaser gets there and it gets past him anyway. */
  error: boolean;
  /**
   * Everyone already on base who ended up somewhere else, from
   * `runnerMoves()`. The batter's own move is excluded — he has the race.
   */
  moves: RunnerMove[];
  /** Runners who came all the way home, by the base they started on. */
  scoredFrom: number[];
  /**
   * Who goes after it, when the geometry cannot say. Only fouls set this —
   * see raceFor(). Undefined means "ask nearestFielder", which is right for
   * every ball hit into fair territory.
   */
  chaserNum?: number;
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
  error?: boolean;
  moves?: RunnerMove[];
  scoredFrom?: number[];
  chaserNum?: number;
}): Replay {
  return {
    startedAt: o.now,
    // Direction matters to the plot for fouls only, and it must be the same
    // call placement.ts makes or the ball is drawn somewhere the play-by-play
    // did not put it.
    plot: plotBatted(o.outcome, o.exitVelocity, o.launchAngle, o.direction),
    direction: o.direction,
    outcome: o.outcome,
    speed: o.speed,
    safe: o.safe,
    doublePlay: !!o.doublePlay,
    error: !!o.error,
    moves: o.moves ?? [],
    scoredFrom: o.scoredFrom ?? [],
    ...(o.chaserNum === undefined ? {} : { chaserNum: o.chaserNum }),
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
    (r.chaserNum !== undefined ? FIELDERS.find((f) => f.num === r.chaserNum) : undefined) ??
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
    }),
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
export const replayLength = (r: Replay): number => {
  // A foul that did not end the at-bat has no race to wait on and no call to
  // hold — see FOUL_HOLD_MS. The caught one falls through to the normal beat,
  // because it is an out and an out is worth a moment.
  if (r.outcome === 'foul') return REPLAY_CUT_MS + r.plot.hangMs + FOUL_HOLD_MS;
  const race = raceFor(r);
  return Math.max(
    REPLAY_CUT_MS + r.plot.hangMs + REPLAY_HOLD_MS,
    Math.max(race.runMs, race.throwMs ?? 0) + REPLAY_CALL_MS,
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

  const wallPx = WALL_FT * cam.pxPerFt;
  const rad = (d: number) => ((d - 90) * Math.PI) / 180;

  // Fair territory: the wedge between the foul lines, out to the wall.
  ctx.fillStyle = opts.field;
  ctx.beginPath();
  ctx.moveTo(cam.home.x, cam.home.y);
  ctx.arc(cam.home.x, cam.home.y, wallPx, rad(-FOUL_DEG), rad(FOUL_DEG));
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
    const end = overheadPoint(WALL_FT, d, cam.home, cam.pxPerFt);
    ctx.beginPath();
    ctx.moveTo(cam.home.x, cam.home.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(216,216,192,0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cam.home.x, cam.home.y, wallPx, rad(-FOUL_DEG), rad(FOUL_DEG));
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

  for (const f of FIELDERS) {
    const post = overheadPoint(f.distFt, f.dirDeg, cam.home, cam.pxPerFt);
    const role = roleFor(f, chaser, r.doublePlay);
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
  const second = bagAt(cam, 1);
  const home = bagAt(cam, -1);
  const race = raceFor(r);
  const { fieldedAt, runMs, throwMs, relayMs } = race;
  if (opts.sfx) cuePlaySounds(r, t, race, opts.sfx);

  // A caught fly is out on the catch. He pulls up rather than running it out,
  // which is both what happens and what stops a pointless dot finishing a race
  // that was decided in the air.
  const caught = !r.plot.ground && !r.safe;

  // Everyone who was already on. They break with the pitch and take the whole
  // race to get where inning.ts has already put them.
  //
  // ponytail: one leg each, straight from the bag they left to the bag they
  // reached, at the same pace regardless of who they are. A man going first to
  // third is doing two legs at real speed and this draws it as one — which at
  // this scale is a dot travelling a corner, and reads correctly.
  for (const m of r.moves) {
    const k = Math.min(1, t / runMs);
    const a = bagAt(cam, m.from);
    const b = bagAt(cam, m.to);
    drawRunnerDot(ctx, { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
  }
  for (const from of r.scoredFrom) {
    const k = Math.min(1, t / runMs);
    const a = bagAt(cam, from);
    drawRunnerDot(ctx, { x: a.x + (home.x - a.x) * k, y: a.y + (home.y - a.y) * k });
  }

  // The forced man on a double play. He is erased from the base state, so he is
  // in neither list above — he has to be drawn from the fact of the DP itself.
  // He stops dead at second when the relay beats him, which IS the out.
  if (r.doublePlay && relayMs !== null) {
    const k = Math.min(1, t / relayMs);
    drawRunnerDot(
      ctx,
      { x: first.x + (second.x - first.x) * k, y: first.y + (second.y - first.y) * k },
      t > relayMs,
    );
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
      throwLeg(landing, second, fieldedAt, relayMs);
      throwLeg(second, first, relayMs, throwMs);
    } else {
      throwLeg(landing, first, fieldedAt, throwMs);
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
  const bases = basesFor(r.outcome);
  const tripMs =
    bases === 1 ? runMs : Math.min(runMs * bases, replayLength(r) - REPLAY_FADE_MS);
  const tripK = Math.min(caught ? 0.55 : 1, t / tripMs);
  drawRunnerDot(ctx, pathPoint(cam, tripK * bases));

  // The calls. A double play gets two, each landing when its own throw does,
  // which is what makes 6-4-3 read as two outs rather than one long one.
  ctx.font = 'bold 15px ui-monospace, Menlo, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const call = (text: string, at: { x: number; y: number }, safe: boolean, dx = 22) => {
    ctx.fillStyle = safe ? '#6fbf73' : '#ff8c66';
    ctx.fillText(text, at.x + dx, at.y - 16);
  };

  if (caught) {
    // Out in the air, so it is called where the catch happened.
    if (t > fieldedAt) call('OUT', landing, false, 0);
    return;
  }
  // No throw means no play, and no play means no call. An umpire does not
  // signal safe at first on a ball off the wall — and doing it anyway put a
  // green SAFE next to the bag under a banner reading HOME RUN.
  if (throwMs === null) return;
  if (relayMs !== null && t > relayMs) call('OUT', second, false, -24);
  if (t > Math.min(runMs, throwMs)) call(r.safe ? 'SAFE' : 'OUT', first, r.safe);
}
