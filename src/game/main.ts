/**
 * The playable screen. One nine-inning game, you against the computer.
 *
 * YOU PLAY BOTH HALVES, which is the whole point of the rebuild:
 *
 *   BOTTOM HALF — you hit.  The pitch is on a real clock and your swing is a
 *                 real keypress. Timing is measured in milliseconds between
 *                 the two, exactly as core/timing.ts wants it. This is the
 *                 only path in the codebase where a swing is not a dice roll.
 *   TOP HALF    — you pitch. You pick the pitch and the spot; the computer's
 *                 hitter decides what to do with it. It is watching what you
 *                 call, so a pattern will get punished.
 *
 * ⚠️ EDIT NOTES. This file is deliberately one screen with one state machine
 * and no framework. The render is a full redraw every frame — at this size
 * that is free, and it means there is no diffing layer to be wrong. If you
 * want to change how it LOOKS, everything is in drawField() and the three
 * render* functions. If you want to change how it PLAYS, none of that is
 * here — it is in game.ts, ai.ts and the core.
 */

import { makeRng } from '../core/rng.ts';
import { newAtBat, swingAt, takePitch, isOver, type AtBatState } from '../core/atBat.ts';
import type { Player } from '../core/roster.ts';
import { ALL_LOCATIONS, locationOffset } from '../core/hit.ts';
import type { SwingInput, PitchLocation } from '../core/hit.ts';
import { ballArrivalMs, computeOffsetMs, grade } from '../core/timing.ts';
import {
  ARM_MS,
  DELIVERY_MS,
  RELEASE_AT_MS,
  RELEASE_LABEL,
  RELEASE_SHORT,
  controlOf,
  gradeRelease,
  releaseWindowMs,
  type ReleaseGrade,
} from '../core/delivery.ts';
import type { PitchType, Outcome } from '../core/hitTables.ts';
import { extend, loadStreak, saveStreak, type Streak } from './streak.ts';
import { bestYear, file, loadCareer, records, saveCareer, totals, winPct } from './career.ts';
import { clubValue, showScale, strengthLabel, strengthRank } from './value.ts';
import {
  COMMAND,
  arsenalOf,
  movementOf,
  pitchToSpot,
  ratingsOf,
  scoutingReport,
  stuffFactor,
  type ThrownPitch,
  type Situation,
} from '../core/pitcher.ts';
import {
  callPitch,
  aiSwing,
  newRead,
  observeCall,
  observePitch,
  chaseRate,
  swingRate,
  timingBias,
  weakestPitch,
  predictedCall,
  hasTimingRead,
  shouldBunt,
  type Read,
} from './ai.ts';
import {
  newGame,
  recordPlay,
  boxScore,
  countPitch,
  goToBullpen,
  benchOf,
  pinchHit,
  fieldingStaff,
  fieldingAlignment,
  battingSide,
  fieldingSide,
  currentBatter,
  currentPitcher,
  onDeck,
  stateOf,
  inningLabel,
  type GameState,
  type Side,
} from './game.ts';
import { HOME, AWAY, LEAGUE, LEAGUE_SOURCE, statsOf, type Team } from './teams.ts';
import {
  clearCustomLeague,
  leagueStatus,
  saveCustomLeague,
  serialiseLeague,
  storedLeagueProblems,
  storedLeagueText,
} from './league.ts';
import {
  DEFAULT_GAMES,
  LENGTHS,
  DEFAULT_RULES,
  type Rules,
  champion,
  clearSeason,
  dayLabel,
  gameInRound,
  gamesOn,
  loadSeason,
  newSeason,
  playDay,
  regularDays,
  seasonEnd,
  saveSeason,
  seasonOver,
  seeds,
  roundName,
  roundOn,
  roundsOf,
  rulesOf,
  seriesOf,
  matchupsInRound,
  stillIn,
  simTo,
  clubsIn,
  standings,
  teamOf,
  yourGame,
  armFor,
  starterFor,
  restOf,
  penRestOf,
  workOf,
  type Matchup,
  type Standing,
  type Result,
  type Season,
} from './franchise.ts';
import { armCondition, fatigue, hasRelief, openedBy, ZONE_FATIGUE_PENALTY } from './bullpen.ts';
import { autoCaller, manageBench, manageBullpen, rollLoose, runTheBases } from './sim.ts';
import { fieldBall } from './defense.ts';
import { withPlacement, place, scorecard, throwNotation, BAG_WORD } from './placement.ts';
import { FOUL_BOOST, HOME_EDGE } from './tuning.ts';
import { knob } from './identity.ts';
import { momentOn, decide, valueShift, type Moment } from './moments.ts';
import { formOf, formLabel, inForm } from './form.ts';
import { BRACKET, OFFENCE, PARITY, SERIES, STREAK, cleanRules, roundsIn } from './rules.ts';
import { restedStamina } from './rotation.ts';
import type { StarterPick } from './game.ts';
import { aiShouldSend, sendRunner, stealOpportunity, chanceFor } from './running.ts';
import {
  LEVELS,
  calibrationLabel,
  levelOf,
  loadSettings,
  observe as observeTiming,
  saveSettings,
} from './difficulty.ts';
import {
  avg,
  clubArms,
  clubBatting,
  era,
  ip,
  leaders,
  ops,
  rate,
  whip,
  type ArmLine,
  type BatLine,
  type StatBook,
} from './stats.ts';
import { runnerMoves, scorersFrom } from '../core/inning.ts';
import { travelMs, canCheck, batSpeedLabel, CHECK_PULL_MS } from '../web/swing.ts';
import {
  makeCam,
  newReplay,
  drawOverhead,
  overheadAlpha,
  replayLength,
  type Replay,
} from '../web/overhead.ts';

// --------------------------------------------------------------- the setup

/**
 * Which dugout you are in. An exhibition puts you at home so you bat last; a
 * franchise game puts you where the schedule says. Set by kickOff().
 */
let YOU: Side = 'home';

/**
 * The season, or null in an exhibition. Everything franchise-shaped in this
 * file is guarded on this being non-null — the engine below knows nothing
 * about it, and a one-off game is still a one-off game.
 */
let season: Season | null = null;

const rng = makeRng(Date.now() >>> 0);

let game: GameState = newGame(HOME, AWAY, 9);

/** What the computer has learned about you. One book, both roles. */
const book: Read = newRead();

// ------------------------------------------------------------- the machine

/**
 * Where the screen is. Everything the render and the input handler do is a
 * function of this — there is no other mode flag anywhere.
 *
 *  idle      between at-bats / waiting for you to start the pitch
 *  windup    the ball is in flight; a swing is legal if you are the hitter
 *  resolve   showing what just happened, briefly
 *  calling   you are pitching and choosing what to throw
 *  winding   you are pitching, the delivery is running, a release is legal
 *  over      final
 *
 * ⚠️ 'winding' IS THE MOUND'S 'windup', and the symmetry is the point. Both are
 * the window between a press that STARTS something with a duration and the
 * later moment that gets graded — the barrel reaching the plate on one side,
 * the ball leaving the hand on the other. See core/delivery.ts.
 */
type Phase = 'idle' | 'windup' | 'resolve' | 'calling' | 'winding' | 'over';

let phase: Phase = 'idle';
let atBat: AtBatState = newAtBat();
let previous: PitchType[] = [];

/** Live pitch, only meaningful in 'windup'. */
let pitch: ThrownPitch | null = null;
let launchAt = 0;
let arriveAt = 0;

/**
 * THE SWING, which is a thing with a duration rather than an instant.
 *
 * The press STARTS the bat; the barrel reaches the plate `swingTravel` later
 * and THAT is the moment graded. The press decides nothing on its own, and the
 * gap between the two is a window you are inside of — which is where the check
 * swing lives: a second press early in it pulls the bat back and the pitch
 * becomes a take, ball or called strike by `inZone` like any other take.
 *
 * ⚠️ THIS MAKES YOU COMMIT BEFORE THE BALL REACHES THE PLATE, and that is a
 * real difficulty change, not a tuning one. The timing windows did not move —
 * still ±12/±35/±80 — they just apply at CONTACT instead of at the press, so
 * every press moves a bat's length earlier. Waiting to see it at the plate and
 * then reacting is no longer a swing, it is a late one.
 */
let swingStartedAt: number | null = null;
/**
 * How long THIS swing's barrel takes, captured at the press rather than
 * recomputed. The frame loop grades at `swingStartedAt + swingTravel` and
 * drawBall draws the bat from the same pair, so there is exactly one number
 * behind the picture and the verdict.
 */
let swingTravel = 0;
/** When it was pulled back, or null while it is still coming. */
let checkedAt: number | null = null;

/**
 * Squared up in a row, and the best you have ever run. See streak.ts.
 *
 * Loaded once at module scope rather than per game: the record is yours, not
 * the game's, and starting a new one must not reset it.
 */
let streak: Streak = loadStreak();

/**
 * HOW HARD THE SWING IS, and what this monitor's lag has been measured at.
 * See difficulty.ts. Module scope, like the streak, and for the same reason:
 * both belong to the person at the keyboard rather than to any one ball game.
 */
let settings = loadSettings();

/**
 * The timing-window multiplier for a swing YOU are taking.
 *
 * ⚠️ ONE IN AUTO MODE, ALWAYS. Watch mode is the computer playing your half,
 * and a difficulty setting that made the CPU a better hitter while you were
 * away is not a difficulty setting. Same rule as the calibration below.
 */
const assist = (): number => (auto ? 1 : levelOf(settings.level).assist);

/**
 * Ball arrival as the PLAYER experienced it, which is the clock a swing has to
 * be graded against — see FAULT 4 in timing.ts and the header of difficulty.ts.
 *
 * ⚠️ THE DRAWN BALL IS NOT MOVED. `arriveAt` stays exactly what it was for
 * every renderer and for contactAt()'s own deadline; only the grading reads
 * this. The correction is a statement about the display pipeline, not about
 * where the ball is, and shifting the picture to match would re-introduce the
 * same lag one layer down.
 */
const gradedArrival = (): number => arriveAt + (auto ? 0 : settings.calibration.shift);

/**
 * SQUARED TO BUNT. Armed between pitches, and it stays armed until it resolves.
 *
 * ⚠️ IT IS NOT TIMED, and that is the whole reason it is a separate control
 * rather than a modifier on SPACE. A bunt has no swing in it — you get the bat
 * out over the plate and the ball hits it — so grading one against the ±12ms
 * window would be asking for a skill the act does not contain. What it costs
 * instead is the count: a bunt only offers at STRIKES, and a foul bunt with two
 * strikes rings you up (atBat.ts). That is the trade, and it is the real one.
 */
let bunting = false;

/** The barrel's moment of truth, or null if no swing is on the way. */
const contactAt = (): number | null =>
  swingStartedAt === null || checkedAt !== null ? null : swingStartedAt + swingTravel;

/**
 * THE PLAY, once the ball is in play.
 *
 * The camera cuts to an overhead of the field and the nine go to work. It is a
 * REPLAY of a result the engine already decided — see overhead.ts — so nothing
 * you watch here can change what the scorer already wrote.
 */
let replay: Replay | null = null;

/** What to draw in 'resolve'. */
let flash = '';
let flashUntil = 0;
let lastGrade = '';

/**
 * WHAT THE COMPUTER’S HITTER DECIDED, held while your pitch is in the air.
 *
 * Decided at release and read at the plate, because that is when a hitter
 * actually decides — see pitchToThem(). Null whenever you are the one batting.
 */
let theirCall: { bunt: boolean; guess: PitchType | null } | null = null;

/**
 * THE PEN IS ARMED, waiting on a second press.
 *
 * ⚠️ THIS EXISTS BECAUSE THE PITCHING CHANGE WAS A ONE-KEY MISTAKE. Going to
 * the bullpen was a full-width button sitting directly under THROW IT and a
 * single unguarded press of B — the same key that squares you to bunt when you
 * are hitting. It is also the one control on this screen you cannot take back:
 * the starter is done the instant it fires, and there is no undo in baseball.
 * A control that is irreversible, adjacent to the one you press every pitch,
 * and one keystroke deep is a control that gets pressed by accident, and it
 * did — repeatedly.
 *
 * Disarmed by anything that changes what you are looking at: throwing a pitch,
 * the half rolling over, actually going to the pen. Nothing here is a timer.
 */
let penArmed = false;

/** Your current pitch call, in 'calling'. */
let callType: PitchType = 'fastball';
let callSpot: PitchLocation = 'middle';

/**
 * THE DELIVERY, which is a thing with a duration rather than an instant.
 *
 * `deliveryAt` is when the arm started, on the same clock everything else in
 * this file is read off. The release point is RELEASE_AT_MS into it and the
 * press is graded against that — see core/delivery.ts for why the grade is a
 * `control` multiplier and nothing else.
 *
 * ⚠️ NOT SCALED BY speed(), EVER, and it is the same rule flightScale() states
 * for the ball: the part somebody is TIMING runs on the real clock. Dead time
 * compresses at 8x because nobody is playing it; a delivery you are trying to
 * release inside is not dead time. Watch mode never enters this phase at all,
 * so there is nothing for a speed setting to be tempted by.
 */
let deliveryAt = 0;

/**
 * How the last one left the hand, or null before the first pitch of an at-bat.
 *
 * Kept after the release so the bar can show the verdict for the length of the
 * flight — the swing's grade appears in the same breath as the swing, and the
 * mound had nothing at all until this.
 */
let releaseGrade: ReleaseGrade | null = null;

/** When it left the hand, so the bar can freeze the mark where you let go. */
let releasedAt: number | null = null;

/**
 * WHAT YOU HAVE THROWN THIS HITTER — one row per pitch, the call, whether it
 * got there, and what it came to.
 *
 * ⚠️ IT EXISTS BECAUSE THE ONLY RECORD WAS A ONE-SECOND FLASH. drawFlash()
 * names the outcome of a pitch for 1000ms on the canvas and then it is gone;
 * the play log below only ever gets the at-bat's RESULT. So the sequence you
 * had just thrown a man — the thing every real battery in the sport writes
 * down — was unreadable by the time you called the next one, and the miss
 * between where you aimed and where it went was never on the screen at all.
 *
 * ⚠️ REPLACED, NEVER MUTATED. render()'s memo key compares by identity, so a
 * row edited in place would never redraw — that is the same trap the warning
 * on render() describes. resolveTheirSwing() rewrites the last row into a new
 * array rather than assigning into it.
 *
 * ponytail: this at-bat only, and only while YOU are the one pitching. A
 * whole-game chart is a screen rather than a panel, and the hitter's half
 * already has the scouting book.
 */
interface ChartRow {
  type: PitchType;
  /** Where you called it. */
  called: PitchLocation;
  /** Where it actually crossed — the same field the renderer draws it at. */
  actual: PitchLocation;
  inZone: boolean;
  release: ReleaseGrade;
  /** What it came to. Empty while the ball is still in the air. */
  result: string;
}
let chart: readonly ChartRow[] = [];

/**
 * WATCH MODE. The computer takes both of your jobs and the game plays itself.
 *
 * Almost none of this is new code. autoCaller() already picks a pitch and
 * aiSwing() already decides a swing — they are what the headless sim in sim.ts
 * has always used. Auto mode just points them at the two decisions YOU
 * normally make, so the same engine drives the screen with nobody watching it.
 */
let auto = false;

/** When the computer is batting for you, the moment it starts the swing. */
let autoSwingAt: number | null = null;

/** 8x is a real setting, not a joke — it is how you leave a game running. */
const SPEEDS = [1, 2, 4, 8] as const;
let speedIdx = 0;
const speed = (): number => SPEEDS[speedIdx]!;

/**
 * Dead time between pitches, divided by the speed. Always applies.
 *
 * ⚠️ THE BALL FLIGHT IS SCALED ONLY IN AUTO — see deliver(). Speeding up the
 * pitch while YOU are swinging is not a speed setting, it is a difficulty
 * change: the timing windows are ±12/±35/±80ms, and at 4x the ball crosses in
 * about a tenth of a second, which no human hits. Dead time is the part
 * nobody is playing, so dead time is the part that gets cut.
 */
const pauseFor = (ms: number): number => performance.now() + ms / speed();

/**
 * Ball flight compresses only when nobody is timing it — which is watch mode,
 * and now also YOUR HALF ON THE MOUND. The ±12/±35/±80 windows belong to the
 * hitter, and when the hitter is the computer its offset is unscaled (see
 * pitchToThem), so the grade at 8x is the grade at 1x and the only thing speed
 * buys you is a shorter afternoon.
 */
const flightScale = (): number => (auto || !youBat() ? speed() : 1);

/**
 * This batter's bat, on the clock the ball is actually flying on.
 *
 * ⚠️ THE BAT IS SCALED BY EXACTLY WHAT THE FLIGHT IS SCALED BY, and it has to
 * be. deliver() keeps the AI's timing offset unscaled so a swing grades the
 * same at 1x and at 8x — that is the whole promise of watch mode. A bat that
 * stayed 120ms while the flight compressed to 55ms would break it in the worst
 * possible direction: at 8x the barrel could not physically arrive before the
 * ball was past, so every computer swing would grade late and the game you
 * left running would stop being the game you would have played.
 *
 * At 1x, and any time you are the one hitting, this is just travelMs().
 */
const batTravel = (): number =>
  travelMs(statsOf(currentBatter(game)).power) / flightScale();


const youBat = (): boolean => battingSide(game) === YOU;

/**
 * WHICH RELIEVER IS COMING IN, an index into what is left in the pen.
 *
 * ⚠️ IT IS A SELECTION, NOT A QUEUE. The pen used to hand you `bullpen[0]` and
 * nothing else, which made a three-man pen a formality — you could not save
 * your best arm for the ninth because you were never asked. Now you pick, and
 * so does the computer (pickReliever() in rotation.ts).
 */
let penPick = 0;

/**
 * WHICH BENCH MAN IS SELECTED, and whether the button has been pressed once.
 *
 * Two locals rather than one, exactly like penPick and penArmed — and for the
 * reason those two exist: picking who is a different act from deciding to do
 * it, and a substitution that happened on the first click was how pitchers kept
 * getting changed by accident. See benchPanel().
 */
let benchPick = 0;
let benchArmed = false;

/** Which of your three starters takes the ball in the NEXT franchise game. */
let myStarter = 0;

/**
 * THE MAN YOU HAVE PICKED UP OUT OF YOUR LINEUP, or nobody.
 *
 * ⚠️ CLICK TWO, NOT DRAG. Dragging nine rows needs pointer capture, an
 * insertion marker, an autoscroll while the list runs off a phone screen, and
 * a keyboard path bolted on afterwards for anyone who cannot drag — for a
 * gesture that is used nine times a season. Two clicks is the same edit, works
 * on a touchscreen, and is already how the rotation picker and the pen behave,
 * so it is the gesture this screen has taught you.
 */
let lineupPick: number | null = null;

/**
 * WHICH CARD myStarter WAS LAST SEEDED FOR — club and day.
 *
 * ⚠️ WITHOUT THIS THE PICKER DOES NOT WORK, and it looked like it did. The
 * card seeds myStarter from pickStarter() so a player who never opens the
 * panel still turns his rotation over; clicking a row redraws the card so the
 * marquee can rename the starter. Those two together meant every click was
 * overwritten by the default on the way back in — the row highlighted for a
 * frame and snapped back. Seed once per CARD, not once per draw.
 */
let starterSeededFor = '';

/**
 * THE OTHER CLUB'S PERSONALITY — see identity.ts.
 *
 * ⚠️ ALWAYS THEIRS, NEVER YOURS, and that is the difference between this and
 * sim.ts's battingKnob(). The sim reads the identity of whichever side is
 * batting because both sides are the computer. Here exactly one side is, so
 * the only club whose manager these knobs describe is the one across the
 * field. Your own identity is a fact about your ROSTER — it shows on the
 * pre-game card — and it does not reach in and swing the bat for you.
 */
const theirKnob = (k: 'aggression' | 'running' | 'bunt'): number =>
  knob((YOU === 'home' ? game.away : game.home).identity, k);

/**
 * The crowd, against you — so it applies exactly when THEY are the home club,
 * which is exactly when you are on the road. See HOME_EDGE in tuning.ts.
 *
 * ⚠️ The other half of it — your own crowd helping YOU — is not here and
 * cannot be. You are the one swinging the bat, and a hidden multiplier on a
 * human's timing is not a home-field advantage, it is the game lying about
 * what your swing did. Yours is the schedule: at home you bat last.
 */
const theirCrowd = (): number => (YOU === 'away' ? HOME_EDGE : 1);

/**
 * WHAT THIS ARM CAN THROW. The buttons, the number keys and the clamp all read
 * it, so there is one answer to the question on screen and in the handler.
 *
 * ⚠️ THE PANEL USED TO OFFER ALL SIX to everybody, so you could call a
 * knuckleball with a fireballer who has never thrown one. The arsenal is the
 * first rating a pitcher has and it was the one the mound ignored.
 */
const myArsenal = (): PitchType[] => arsenalOf(currentPitcher(game));

// ------------------------------------------------------------------- dom

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

const canvas = $<HTMLCanvasElement>('field');
const ctx = canvas.getContext('2d')!;
const elScore = $('scoreboard');
const elSit = $('situation');
const elMeta = $('meta');
const elControls = $('controls');
const elLog = $('log');
const elBanner = $('banner');
const elBook = $('book');
/** The masthead, which says which mode you are in. */
const elTitle = document.querySelector('h1')!;

function say(text: string, cls = ''): void {
  const div = document.createElement('div');
  div.textContent = text;
  if (cls) div.className = cls;
  elLog.prepend(div);
  while (elLog.childElementCount > 80) elLog.lastElementChild?.remove();
}

// ------------------------------------------------------------- your at-bat

/** Throw the next pitch TO you. The computer is on the mound. */
function deliver(): void {
  if (game.over) return;
  const sit: Situation = {
    previous,
    firstBaseOpen: game.bases[0] === null,
    batterPower: statsOf(currentBatter(game)).power,
    outs: game.outs,
  };
  pitch = callPitch(currentPitcher(game), atBat, sit, book, rng, {
    fatigue: fatigue(fieldingStaff(game)),
  });
  previous.push(pitch.type);
  game = countPitch(game);

  launchAt = performance.now();
  const flight = ballArrivalMs(launchAt, pitch.speedMph) - launchAt;
  arriveAt = launchAt + flight / flightScale();
  swingStartedAt = null;
  checkedAt = null;

  // Decide the computer's swing NOW, at release, exactly like a hitter does.
  //
  // ⚠️ The offset is deliberately NOT scaled. computeOffsetMs() grades
  // (swing - arrival) directly, so an unscaled offset lands on the same grade
  // whatever the flight is doing. Scaling it here would quietly make auto mode
  // a BETTER hitter at 8x than at 1x, and the whole point of watch mode is
  // that the game you leave running is the game you would have played.
  autoSwingAt = null;
  if (auto) {
    const decision = aiSwing(
      pitch,
      {
        count: atBat,
        stats: statsOf(currentBatter(game)),
        pitcherFatigue: fatigue(fieldingStaff(game)),
      },
      book,
      rng,
    );
    // The AI's offset is where it wants the BARREL, so it has to press a bat's
    // travel earlier — same as you do. Without this subtraction watch mode
    // would be systematically late by 100–155ms and stop being the game you
    // would have played, which is the only thing watch mode is for.
    if (decision.swing) autoSwingAt = arriveAt + decision.offsetMs - batTravel();
  }

  phase = 'windup';
}

/**
 * SPACE / click during the flight. The FIRST press starts the bat; a SECOND
 * one, early enough, takes it back.
 *
 * One verb doing both is the R.B.I. discipline: it ran the whole sport on two
 * buttons, and a check swing on its own key would be the sixth thing this
 * screen asks you to remember. Tap it again — that is the whole control.
 */
/**
 * Square up, or stand back down. Between pitches only — a hitter who could
 * drop the bat mid-flight would be getting the read for free.
 */
function toggleBunt(): void {
  if (!youBat() || game.over || phase !== 'idle') return;
  bunting = !bunting;
  render();
}

function swing(): void {
  // Squared to bunt: the bat is already out there and there is nothing to
  // start. Deliberately silent — the button did what the stance says.
  if (bunting) return;
  if (phase !== 'windup') return;
  const now = performance.now();

  if (swingStartedAt === null) {
    swingStartedAt = now;
    // Read off THIS batter's power: the heavy bat is slower to get around, and
    // being slower is exactly what buys it a longer look at the pitch.
    swingTravel = batTravel();
    return;
  }

  // Too late to change your mind means the swing stands — nothing to do, and
  // deliberately no error: the button did what a button does.
  if (checkedAt === null && canCheck(now - swingStartedAt, swingTravel)) checkedAt = now;
}

/**
 * Send the runner. Legal only between pitches while YOU are batting.
 *
 * ponytail: between pitches, not mid-flight. A steal that resolves while a
 * pitch is in the air needs the two to be interleaved on one clock, and the
 * whole running game is one decision — see running.ts.
 */
function steal(): void {
  if (phase !== 'idle' || !youBat() || game.over) return;
  const op = stealOpportunity(game);
  if (!op) return;

  const defence = fieldingAlignment(game);
  const odds = Math.round(chanceFor(game, op, defence) * 100);
  const out = sendRunner(game, defence, rng);
  if (!out) return;

  game = out.game;
  const bag = out.to === 1 ? 'second' : 'third';
  say(
    out.safe
      ? `${out.runner.name} steals ${bag}! (${odds}%)`
      : `${out.runner.name} caught stealing ${bag}. (${odds}%)`,
    out.safe ? 'big' : 'out',
  );
  flash = out.safe ? 'SAFE!' : 'CAUGHT STEALING';
  flashUntil = pauseFor(1100);

  // Caught stealing can be the third out, which ends the half — and may end
  // the game. Route through the same finish path the at-bat uses.
  if (game.over) {
    finalize();
    return;
  }
  if (!out.safe && game.outs === 0) {
    // The half rolled over: reset the count and hand the ball over.
    atBat = newAtBat();
    bunting = false;
    penArmed = false;
    previous = [];
    phase = youBat() ? 'idle' : 'calling';
  }
  render();
}

/**
 * The ball got to the plate. Resolve whatever you did about it.
 *
 * Called from the frame loop rather than a timer, so the resolution uses the
 * same clock the swing was stamped against.
 */
function resolvePitch(): void {
  if (!pitch) return;
  const batter = currentBatter(game);
  const stats = statsOf(batter);
  const risp = game.bases[1] !== null || game.bases[2] !== null;
  // What his break and his clutch are worth against this pitch. One dial, same
  // one the platoon split and the hitter's own contact turn — see stuffFactor.
  const stuff = stuffFactor(currentPitcher(game), pitch.type, {
    runnersInScoringPosition: risp,
  });

  // THE BUNT resolves before anything else and shares none of the swing path.
  if (bunting) {
    observePitch(book, pitch, false);
    if (!pitch.inZone) {
      // You do not chase with the bat out over the plate. Pull it back.
      atBat = takePitch(atBat, false, pitch.hitBatter);
      lastGrade = 'BUNT — TOOK IT';
      flash = pitch.hitBatter ? 'HIT BY PITCH' : 'BALL';
    } else {

      atBat = swingAt(
        atBat,
        { offsetMs: 0, pitchType: pitch.type, location: pitch.location, stats, isBunt: true },
        rng,
      );
      lastGrade = 'BUNT';
      // ⚠️ READ OFF THE SWING, NOT THE COUNT. This asked whether the count moved,
      // and a bunt foul ALWAYS moves it — swingAt() has no free-foul branch for a
      // bunt — so 'BUNT FOUL' was unreachable long before lastSwing existed.
      flash = atBat.lastSwing?.outcome === 'foul' ? 'BUNT FOUL' : 'BUNT';
      // Two strikes and he fouled it off: the count already rang him up, and
      // the banner should say so rather than reading like a live at-bat.
      if (atBat.result?.kind === 'strikeout') flash = 'FOUL BUNT — STRIKE THREE';
    }
    bunting = false;
    flashUntil = pauseFor(1000);
    phase = 'resolve';
    return;
  }

  const contact = contactAt();

  if (contact === null) {
    // Took it — and a swing pulled back in time IS a take, which is the whole
    // reason the check swing needed no new rule. `inZone` decides it either
    // way; an umpire ruling the check a strike is simply what a called strike
    // already is.
    //
    // ponytail: the book is told this was a take, not an offer. Recording a
    // check as a swing-and-no-contact would push the computer to feed you more
    // junk out of the zone, which is a real and defensible read — it is just a
    // difficulty change nobody asked for yet. One argument to observePitch()
    // if that turns out to be the better game.
    observePitch(book, pitch, false);
    atBat = takePitch(atBat, pitch.inZone, pitch.hitBatter);
    const call = pitch.inZone ? 'STRIKE' : 'BALL';
    lastGrade = checkedAt !== null ? `CHECKED — ${call}` : call;
    flash = pitch.hitBatter ? 'HIT BY PITCH' : lastGrade;
  } else {
    // ⚠️ TWO OFFSETS, AND THE DIFFERENCE BETWEEN THEM IS THE WHOLE FEATURE.
    // `raw` is measured against the ball's real arrival and is the only thing
    // the calibration may ever learn from — medianOffset() says so in its own
    // signature, and feeding it corrected samples makes the correction chase
    // itself to zero. `offset` is measured against arrival as the player saw
    // it, and is what the at-bat is actually graded on.
    const raw = computeOffsetMs(contact, arriveAt);
    const offset = computeOffsetMs(contact, gradedArrival());
    if (!auto) {
      settings = { ...settings, calibration: observeTiming(settings.calibration, raw) };
      saveSettings(settings);
    }
    // Graded with the SAME multipliers resolveSwing() will use, the assist
    // included, or the word on screen and the outcome in the book come from
    // different at-bats.
    const g = grade(offset, stats.contact * stuff * assist(), stats.vision);
    lastGrade = g.toUpperCase();

    const input: SwingInput = {
      offsetMs: offset,
      pitchType: pitch.type,
      location: pitch.location,
      stats,
      batterHand: batter.bats,
      pitcherHand: currentPitcher(game).throws,
      twoStrikes: atBat.strikes >= 2,
      runnersInScoringPosition: risp,
      stuff,
      foulBoost: FOUL_BOOST,
      assist: assist(),
    };
    const before = atBat;
    atBat = swingAt(atBat, input, rng);
    // A whiff for the book's purposes is a swing that produced no contact.
    const whiffed = g === 'miss';
    observePitch(book, pitch, true, offset, whiffed);
    flash = g === 'miss' ? 'SWING AND MISS' : `${g.toUpperCase()}`;
    if (wasFreeFoul(before, atBat)) flash = 'FOUL';
    if (showFoul(batter.speed)) flash = 'FOUL';

    // The streak, and the loud version of it. Only a SWING moves this — a take
    // is left alone deliberately, see streak.ts.
    //
    // ⚠️ NOT IN WATCH MODE. aiSwing() takes this swing when auto is on, and a
    // record the computer set at 8x while you were in a meeting would empty the
    // number of everything it means. The whole point is that YOU squared it up.
    if (!auto) {
      const run = extend(streak, g);
      streak = run.streak;
      // A record is only worth announcing once there is something to beat.
      // Without the floor, the first swing on a fresh install is a "new best".
      if (run.record && streak.current >= 3) {
        flash = `${streak.current} IN A ROW — NEW BEST`;
        say(`New best: ${streak.current} squared up in a row.`, 'big');
      } else if (streak.current >= 3) {
        flash = `${flash} — ${streak.current} IN A ROW`;
      }
      // Saved on every record, loud or quiet — the number on disk must be the
      // real one even when nobody was told about it.
      if (run.record) saveStreak(streak);
    }
  }

  // ⚠️ THE FOUL'S BEAT IS THE REPLAY'S, not the flat second every other pitch
  // gets. Without this the next pitch is thrown while the ball is still in the
  // air on the overhead — the pause and the replay are two clocks and they have
  // to agree about how long a foul takes. Speed-scaled for the same reason
  // finishAtBat's is: at 8x the replay is 8x faster and the wait must be too.
  flashUntil =
    replay && replay.outcome === 'foul'
      ? performance.now() + replayLength(replay) / speed()
      : pauseFor(1000);
  phase = 'resolve';
}

// --------------------------------------------------------------- your half
//                                                        (you on the mound)

/**
 * Go to your bullpen. Only legal between batters, same as the real rule, and
 * enforced by only ever being reachable from the 'calling' phase.
 */
function relieve(): void {
  if (phase !== 'calling' || youBat()) return;
  const staff = fieldingStaff(game);
  if (!hasRelief(staff)) return;

  // FIRST PRESS ARMS IT, SECOND PRESS MAKES THE CHANGE. See penArmed — this is
  // the whole fix for pitchers being changed by accident, and it is deliberately
  // the same shape as the check swing: one verb, pressed twice, no new key to
  // remember. The panel says out loud that it is waiting.
  if (!penArmed) {
    penArmed = true;
    render();
    return;
  }

  penArmed = false;
  const going = staff.current.pitcher.name;
  game = goToBullpen(game, penPick);
  // The list just got shorter. Anything past the end would silently become the
  // top of the pen on the next press.
  penPick = 0;
  say(`You go to the pen: ${going} → ${currentPitcher(game).name}.`, 'half');
  render();
}

/** Move the selection inside the pen. Only meaningful while it is armed. */
function cyclePen(by: number): void {
  const n = fieldingStaff(game).bullpen.length;
  if (n === 0 || youBat()) return;
  penPick = ((penPick + by) % n + n) % n;
  render();
}

/**
 * THIS ARM'S RELEASE WINDOW, at whatever the difficulty has done to it.
 *
 * ⚠️ ONE CALL FOR THE VERDICT AND FOR THE PICTURE. Both release() and
 * drawDelivery() come through here, so the band drawn on the bar is the band
 * the press is graded against — including the two things that move it, the
 * signature on the card and the level in the menu. A meter with its own copy of
 * the numbers is a meter that lies the first time either one changes.
 *
 * COMMAND[signature] and not zoneRate: see the note on COMMAND in pitcher.ts,
 * which is emphatic about why reading zone rate as precision would hand the
 * worst command in the league to your best arm.
 */
const releaseWindow = (kind: Parameters<typeof releaseWindowMs>[0]): number =>
  releaseWindowMs(kind, COMMAND[currentPitcher(game).signature], assist());

/**
 * START THE DELIVERY. The press that used to throw the pitch now only begins
 * it — see core/delivery.ts for what the second press is worth.
 */
function startDelivery(): void {
  if (game.over || youBat() || phase !== 'calling') return;
  deliveryAt = performance.now();
  releaseGrade = null;
  // The pen is disarmed by anything that changes what you are looking at, and
  // the arm coming set is exactly that. Same rule as throwing the pitch was.
  penArmed = false;
  phase = 'winding';
  render();
}

/**
 * LET GO OF IT AT A GRADE SOMEBODY ELSE DECIDED.
 *
 * Two callers, and they want opposite things, which is why the grade is an
 * argument rather than a flag: the sweep running out is 'wild' — a pitch that
 * got away, not a pitch that never happened — and watch mode taking over
 * mid-delivery is 'good', because the computer plays your half at the league's
 * numbers and must not be charged for a press you were in the middle of.
 */
function releaseAs(graded: ReleaseGrade): void {
  if (phase !== 'winding') return;
  // No `at`: neither caller is a press, so there is no mark to freeze on the
  // bar — only a verdict. See pitchToThem().
  pitchToThem(graded);
}

/** LET GO OF IT. `at` is when the press landed, on the delivery's own clock. */
function release(at: number): void {
  if (phase !== 'winding') return;
  // The arm is not forward yet. Deliberately silent and deliberately not a
  // pitch — see ARM_MS, which exists because the second half of a double-tap
  // lands here and used to cost one.
  if (at - deliveryAt < ARM_MS) return;
  pitchToThem(
    gradeRelease(
      // Same clock, same sign convention as the swing: negative is early.
      at - (deliveryAt + RELEASE_AT_MS),
      COMMAND[currentPitcher(game).signature],
      assist(),
    ),
    at,
  );
}

/**
 * DELIVER THE PITCH YOU CALLED — and then let go of it.
 *
 * ⚠️ THIS USED TO RESOLVE THE WHOLE PITCH ON THE PRESS. You picked a spot, hit
 * THROW, and a banner told you what had already happened: the ball was never in
 * the air, the computer's hitter never took a swing anybody could see, and your
 * half of the game was a menu with a scoreboard attached. Everything past the
 * release now happens at the plate, in resolveTheirSwing(), on the same clock
 * your own at-bat runs on. One loop, one picture, both directions.
 *
 * WHAT IS STILL DECIDED HERE, AT RELEASE: what the arm actually threw, and what
 * the hitter has decided to do about it. Both are release-time facts — a hitter
 * has to commit before he can see the ball arrive, which is the whole reason
 * hitting is hard — so deciding them now and SHOWING them later is not a cheat.
 * It is the order deliver() already puts them in when you are the one batting.
 *
 * @param graded how it left the hand. Watch mode passes 'good' and never goes
 *        near the meter — that is control 1.0, which is what every arm in
 *        sim.ts throws at, so the game you leave running is still the game.
 * @param at when the press that released it landed, or null when there was no
 *        press: the arm emptying at the end of the sweep, and every pitch watch
 *        mode throws. The bar draws a verdict either way and a frozen mark only
 *        when there is a moment to freeze.
 */
function pitchToThem(graded: ReleaseGrade = 'good', at: number | null = null): void {
  if (game.over) return;
  const stats = statsOf(currentBatter(game));
  const tired = fatigue(fieldingStaff(game));

  // Your call is where he AIMS. Whether the ball gets there is his control
  // rating — see pitchToSpot(), which is where the flat 0.72 that every arm in
  // the game used to share has gone.
  //
  // ⚠️ TWO INDEPENDENT THINGS, MULTIPLIED, which is what `control` is for. The
  // arm's fatigue was already here; the release is new and comes off YOUR
  // press. 'good' is exactly 1, so this line still evaluates to what it always
  // did for a competent pitch and for every pitch watch mode throws — see the
  // invariant at the top of core/delivery.ts.
  pitch = pitchToSpot(currentPitcher(game), callType, callSpot, rng, {
    control: controlOf(graded) * (1 - ZONE_FATIGUE_PENALTY * tired),
  });
  // ⚠️ SET HERE AND NOT IN release(), so that EVERY path that throws a pitch
  // leaves the bar telling the truth — including the two that never touch the
  // meter. autoStep() calls straight through to this function, and before this
  // line lived here watch mode pitched under a bar still offering you the
  // keyboard hint for a control that was not yours at the time.
  releaseGrade = graded;
  releasedAt = at;
  // Written now, completed at the plate by resolveTheirSwing(). The call and
  // where it actually crossed are both known here; what it came to is not.
  chart = [
    ...chart,
    {
      type: callType,
      called: callSpot,
      actual: pitch.location,
      inZone: pitch.inZone,
      release: graded,
      result: '',
    },
  ];
  penArmed = false;
  observeCall(book, callType, atBat.strikes >= 2);
  previous.push(callType);
  game = countPitch(game);

  launchAt = performance.now();
  const flight = ballArrivalMs(launchAt, pitch.speedMph) - launchAt;
  arriveAt = launchAt + flight / flightScale();
  swingStartedAt = null;
  checkedAt = null;
  autoSwingAt = null;

  // THE COMPUTER BUNTS ON YOU TOO, by the same rule the headless sim uses — a
  // sacrifice that only ever happened in sim.ts would be a mechanic the player
  // never actually meets. It is untimed exactly like yours: the bat is already
  // out over the plate, so there is no swing to schedule.
  const bunt = shouldBunt(stats, {
    count: atBat,
    outs: game.outs,
    bases: game.bases.map((b) => b !== null),
    deficit: stateOf(game, fieldingSide(game)).runs - stateOf(game, battingSide(game)).runs,
    inning: game.inning,
    bunt: theirKnob('bunt'),
  });

  if (bunt) {
    theirCall = { bunt: true, guess: null };
  } else {
    const decision = aiSwing(
      pitch,
      {
        count: atBat,
        stats,
        pitcherFatigue: tired,
        aggression: theirKnob('aggression'),
        barrel: theirCrowd(),
      },
      book,
      rng,
    );
    theirCall = { bunt: false, guess: decision.guess };
    // He wants the BARREL there at that offset, so the bat has to start a
    // travel earlier — the same subtraction watch mode makes, for the same
    // reason, off the same clock.
    if (decision.swing) autoSwingAt = arriveAt + decision.offsetMs - batTravel();
  }

  phase = 'windup';
}

/**
 * The ball reached the plate and YOU are the one who threw it. Resolve what he
 * did about it.
 *
 * ponytail: a separate function from resolvePitch() rather than a youBat()
 * branch inside it. The two share the flight, the clock and the swing state,
 * and they differ in exactly three things that all point the same way — the
 * book is only ever told about pitches thrown AT you, the streak only counts
 * swings YOU took, and the bunt arrives as his decision rather than your
 * stance. Three guards inside one function is a function that is really two.
 */
function resolveTheirSwing(): void {
  if (!pitch || !theirCall) return;
  const batter = currentBatter(game);
  const stats = statsOf(batter);
  const twoStrikes = atBat.strikes >= 2;
  const risp = game.bases[1] !== null || game.bases[2] !== null;
  // What his break and his clutch are worth against this pitch — the same one
  // dial your own at-bat is graded through.
  const stuff = stuffFactor(currentPitcher(game), pitch.type, {
    runnersInScoringPosition: risp,
  });

  // What the chart calls it. Set on every branch below, next to the flash it
  // shortens, so the two cannot describe different pitches.
  let scored = '';

  if (theirCall.bunt) {
    if (!pitch.inZone) {
      atBat = takePitch(atBat, false, false);
      flash = 'BALL — he had it squared';
      scored = 'ball';
    } else {

      atBat = swingAt(
        atBat,
        { offsetMs: 0, pitchType: pitch.type, location: pitch.location, stats, isBunt: true },
        rng,
      );
      // Same unreachable test as the human bunt above — see the note there.
      flash = atBat.lastSwing?.outcome === 'foul' ? 'BUNT FOUL' : 'HE BUNTS';
      scored = atBat.lastSwing?.outcome === 'foul' ? 'bunt foul' : 'bunted';
      if (atBat.result?.kind === 'strikeout') flash = 'FOUL BUNT — STRIKE THREE';
    }
  } else {
    const contact = contactAt();
    if (contact === null) {
      atBat = takePitch(atBat, pitch.inZone, pitch.hitBatter);
      // ⚠️ THE PLUNKING USED TO READ 'BALL'. takePitch() has taken hitBatter
      // since interactive pitching shipped and this line only ever asked about
      // the zone, so the one pitch that ENDS the at-bat and puts a man on first
      // announced itself as ball three. The batting half has said HIT BY PITCH
      // all along — see resolvePitch() — so this was the two halves of the same
      // event disagreeing, which is the defect and not a wording preference.
      flash = pitch.hitBatter ? 'HIT BY PITCH' : pitch.inZone ? 'CALLED STRIKE' : 'BALL';
      scored = pitch.hitBatter ? 'hit batter' : pitch.inZone ? 'called strike' : 'ball';
    } else {
      // Graded off where the barrel ACTUALLY arrived, not off the offset he
      // asked for. The frame the bat is drawn crossing the plate is the frame
      // that decides it — the same rule your swing is held to.
      const offset = computeOffsetMs(contact, arriveAt);
      const input: SwingInput = {
        offsetMs: offset,
        pitchType: pitch.type,
        location: pitch.location,
        stats,
        batterHand: batter.bats,
        pitcherHand: currentPitcher(game).throws,
        twoStrikes,
        runnersInScoringPosition: risp,
        stuff,
        foulBoost: FOUL_BOOST,
      };
      const before = atBat;
      atBat = swingAt(atBat, input, rng);
      const g = grade(offset, stats.contact * stuff, stats.vision);
      flash = g === 'miss' ? 'SWING AND MISS' : 'IN PLAY';
      scored = g === 'miss' ? 'swinging strike' : 'in play';
      // ⚠️ THE COUNT, NOT THE OBJECT — see wasFreeFoul(). This site said
      // `atBat === before` and so started calling every two-strike foul the
      // computer hit "IN PLAY".
      if (wasFreeFoul(before, atBat)) flash = 'FOUL';
      // Their fouls are drawn too. Same event, same picture.
      if (showFoul(batter.speed)) flash = 'FOUL';
      // ⚠️ ASKED OF THE SWING, NOT OF THE TWO LINES ABOVE. Both of those are
      // conditions on DRAWING a foul — one is the free two-strike case and the
      // other is whether there was a replay to build — and a foul that is
      // neither still has to reach the chart as a foul.
      if (atBat.lastSwing?.outcome === 'foul') scored = 'foul';
      if (theirCall.guess === pitch.type && g !== 'miss') flash += ' — he sat on it';
    }
  }

  // The last row was written at release with everything but this.
  chart = chart.map((r, i) => (i === chart.length - 1 ? { ...r, result: scored } : r));

  theirCall = null;
  flashUntil = pauseFor(1000);
  phase = 'resolve';
}

// ------------------------------------------------------- ending an at-bat

/**
 * WAS THAT FOUL FREE — the two-strike one that costs nothing.
 *
 * ⚠️ COMPARED ON THE COUNT, NEVER ON THE OBJECT. Three call sites used to ask
 * `atBat === before`, which worked only because swingAt() returned the SAME
 * state object when a foul changed nothing. It returns a new one on every swing
 * now — it has to, because it carries `lastSwing` so the ball can be drawn — so
 * that test became permanently false and the screen started calling a
 * two-strike foul "IN PLAY". The count is what "nothing happened" actually
 * means, and it cannot rot the same way.
 */
const wasFreeFoul = (before: AtBatState, after: AtBatState): boolean =>
  after.result === undefined &&
  after.strikes === before.strikes &&
  after.balls === before.balls;

/**
 * DRAW THE FOUL, if the last swing was one. Returns whether it did.
 *
 * ⚠️ EVERY OTHER BATTED BALL REACHES THE REPLAY FROM finishAtBat(), which a
 * foul never reaches because it does not end the at-bat. Before this the ball
 * simply vanished off the bat. It gets the same cut to the overhead a ball in
 * play gets, sized to a play that decides nothing — see FOUL_HOLD_MS.
 *
 * ⚠️ BOTH HALVES OF THE INNING CALL THIS. Your fouls and theirs are the same
 * event and drawing only yours would be the two halves of the game disagreeing
 * about what a foul ball is.
 *
 * The CAUGHT one is deliberately not built here: it ends the at-bat and goes
 * through finishAtBat() like any other out, replay and all.
 */
function showFoul(runnerSpeed: number): boolean {
  const swing = atBat.lastSwing;
  if (!swing || swing.outcome !== 'foul') return false;
  replay = newReplay({
    now: performance.now(),
    outcome: swing.outcome,
    exitVelocity: swing.exitVelocity,
    launchAngle: swing.launchAngle,
    direction: swing.direction,
    speed: runnerSpeed,
    safe: false,
    chaserNum: place(swing).fielderNum,
  });
  return true;
}

/** The count says the at-bat is done. Fold it into the game. */
function finishAtBat(): void {
  // Where it landed decides what the hit is worth AND what the scorer says.
  const placed = withPlacement(atBat.result!);
  const result = placed.result;
  const batter = currentBatter(game);

  // Positional defence: WHO the ball was hit at decides whether it is booted.
  const fielding =
    result.kind === 'in_play'
      ? fieldBall(
          result.hit,
          fieldingAlignment(game),
          { batterSpeed: batter.speed, forceAtFirst: game.bases[0] !== null, outs: game.outs },
          rng,
        )
      : undefined;

  const half = inningLabel(game);
  const wasBatting = battingSide(game);
  const { game: next, log } = recordPlay(game, result, fielding);
  game = next;

  // Cut to the overhead. Built HERE and not at contact because two of the
  // things it needs are only known now: whether the defence booted it, and
  // where recordPlay just put the runners.
  //
  // Fouls never reach this — a foul does not end the at-bat, so it never gets
  // to finishAtBat at all, and there is nothing to watch anyway.
  replay =
    result.kind === 'in_play'
      ? newReplay({
          now: performance.now(),
          outcome: result.hit.outcome,
          exitVelocity: result.hit.exitVelocity,
          launchAngle: result.hit.launchAngle,
          direction: result.hit.direction,
          speed: batter.speed,
          safe: result.hit.isHit || !!fielding?.error,
          doublePlay: !!fielding?.doublePlay,
          error: !!fielding?.error,
          // Only a foul out sets this, and only because nobody stands in foul
          // ground for nearestFielder() to find. See raceFor().
          ...(result.hit.outcome === 'foul_out' && placed.placement
            ? { chaserNum: placed.placement.fielderNum }
            : {}),
          // from === -1 is the batter, and he is drawn by the race instead.
          moves: runnerMoves(log.before, log.after).filter((m) => m.from >= 0),
          scoredFrom: scorersFrom(log.before, log.after, log.runs),
        })
      : null;

  say(
    `${half} ${batter.name}: ${describe(result, fielding, placed.text, placed.placement?.fielderNum)}`,
    lineClass(result),
  );

  // ⚠️ ITS OWN LINE, not part of the batter's. The man gunned down going for
  // the extra base is the only out on a play that did not happen to the hitter,
  // and folding it into "single to right" produces a sentence where an out
  // appears from nowhere.
  if (log.thrownOut) {
    const { runner, at } = log.thrownOut;
    const num = placed.placement?.fielderNum;
    say(
      `   ${runner.name} thrown out at ${BAG_WORD[at] ?? 'the bag'}` +
        (num === undefined ? '' : `, ${throwNotation(num, at)}`),
      'out',
    );
  }
  if (log.runs > 0) {
    const who = wasBatting === YOU ? 'YOU SCORE' : 'THEY SCORE';
    say(`   ${who} ${log.runs}`, 'big');
  }
  if (log.halfEnded && !game.over) {
    say(`— end ${half} —  ${game.away.abbr} ${game.awayState.runs}, ${game.home.abbr} ${game.homeState.runs}`, 'half');
  }

  atBat = newAtBat();
  bunting = false;
  previous = [];
  pitch = null;
  // The chart is what you have thrown THIS hitter, so it empties with him.
  chart = [];
  releaseGrade = null;

  // The COMPUTER manages its pen between batters, exactly where you get to
  // manage yours. Announced, because a pitching change you did not notice is
  // a difficulty spike that reads as the game cheating.
  if (!game.over && youBat()) {
    const before = currentPitcher(game).name;
    game = manageBullpen(game);
    const after = currentPitcher(game).name;
    if (after !== before) say(`They go to the pen: ${before} → ${after}.`, 'half');
  }

  // ...and THEY go to their bench while you are the one on the mound, by the
  // same rule the headless sim uses. Announced for the same reason the pitching
  // change is: a hitter you were not expecting is only fair if you are told.
  if (!game.over && !youBat()) {
    const before = currentBatter(game);
    game = manageBench(game);
    const after = currentBatter(game);
    if (after !== before) say(`Pinch hitter: ${after.name} bats for ${before.name}.`, 'half');
  }

  // ...and THEY run the bases while you are the one on the mound.
  if (!game.over && !youBat()) {
    const op = stealOpportunity(game);
    const outsBefore = game.outs;
    const basesBefore = game.bases;
    game = runTheBases(game, rng);
    if (op && game.bases !== basesBefore) {
      const caught = game.outs > outsBefore;
      say(caught ? `${op.runner.name} caught stealing.` : `${op.runner.name} steals.`,
        caught ? 'out' : 'big');
    }
  }

  // One can get away in EITHER half. You are on the mound for the top and at
  // the plate for the bottom, and the backstop is live in both — a wild pitch
  // that only ever happened to one side would read as the game cheating.
  if (!game.over) {
    const loose = rollLoose(game, rng);
    game = loose.game;
    if (loose.wild) {
      const who = loose.wild.advanced.map((r) => r.name).join(' and ');
      say(
        loose.wild.runs > 0
          ? `Ball gets away — ${who} moves up, and a run scores.`
          : `Ball gets away — ${who} moves up.`,
        loose.wild.runs > 0 ? 'big' : 'out',
      );
    }
  }

  if (game.over) {
    say(
      `FINAL — ${game.away.abbr} ${game.awayState.runs}, ${game.home.abbr} ${game.homeState.runs}` +
        (game.ending === 'walk_off' ? ' (walk-off)' : ''),
      'big',
    );
    finalize();
    return;
  }
  // Stay in 'resolve' while the play is on the screen. The count has already
  // been reset above, so the frame loop's isOver() check falls straight through
  // to the phase switch the moment the replay is done.
  if (replay) {
    flash = '';
    flashUntil = performance.now() + replayLength(replay) / speed();
    phase = 'resolve';
    return;
  }
  phase = youBat() ? 'idle' : 'calling';
}

/**
 * The game is final, from wherever it ended.
 *
 * In an exhibition that is the whole of it. In a franchise the result goes
 * into the season and playDay() runs the rest of the day's card headlessly,
 * so the standings you are shown on the next screen already include everyone
 * else's afternoon.
 */
function finalize(): void {
  phase = 'over';
  elBanner.textContent = game.winner === YOU ? 'YOU WIN.' : 'YOU LOSE.';
  if (!season) return;

  // Read the day BEFORE playDay advances it — this is the day just played.
  const played = season.day;
  season = playDay(season, {
    home: game.home.abbr,
    away: game.away.abbr,
    day: played,
    hr: game.homeState.runs,
    ar: game.awayState.runs,
    hh: game.homeState.hits,
    ah: game.awayState.hits,
    // ⚠️ READ OFF THE STAFF, not off the pick we made before the game. They
    // are the same man, and reading the one that actually threw means a
    // result can never rest somebody who did not pitch.
    hs: openedBy(game.homeState.staff).pitcher.name,
    as: openedBy(game.awayState.staff).pitcher.name,
    // ...and everybody who came out of either pen, with what he threw. Without
    // these two the relievers in YOUR games would rest for free while the
    // other twenty-nine clubs' did not.
    hb: workOf(game.homeState.staff),
    ab: workOf(game.awayState.staff),
    // ...and the box score of the game you just played, which is the only one
    // on today's card playDay() cannot read off a GameState of its own.
  }, boxScore(game));
  saveSeason(season);

  // ⚠️ ASKED OF THE SEASON, NOT OF THE DAY NUMBER. A round is a series now, so
  // "was that the last game" has no fixed answer — a best-of-seven can end on
  // any of four nights. champion() going from null to a name is the event.
  const champ = champion(season);
  if (champ) {
    elBanner.textContent =
      champ === season.you ? `${champ} WIN IT ALL.` : `${champ} TAKE THE TITLE.`;
    say(`${champ} are champions.`, 'big');
    // The year goes in the book. See retire().
    retire(season);
    say('Your year is in the record book — press K.', 'half');
    return;
  }

  if (played >= regularDays(season)) {
    // A playoff night that did not end the year: you are out, the series goes
    // on, or you have won it and moved up a round.
    const round = roundOn(season, played);
    if (!stillIn(season, season.you)) {
      say(`${season.you} are out.`, 'half');
    } else if (roundOn(season, season.day) > round) {
      say(`${season.you} take the ${roundName(season, round).toLowerCase()}.`, 'half');
    } else {
      say(`${season.you} play on — ${dayLabel(season).toLowerCase()} next.`, 'half');
    }
    return;
  }

  const me = standings(season).find((r) => r.abbr === season!.you)!;
  const left = regularDays(season) - season.day;
  say(
    `${season.you} are ${me.w}-${me.l}. ` + (left > 0 ? `${left} to play.` : 'That is the year.'),
    'half',
  );
  // The last day of the schedule is also the day the bracket exists.
  if (left === 0) say(`Playoffs: ${seeds(season).join(', ')}.`, 'half');
}

/**
 * The scorer's line. `placed` is placement.ts's sentence — "double into the
 * left-center gap" — which is the whole reason ball placement exists: the
 * player has to be TOLD where it went to learn to aim.
 *
 * The two fielding outcomes override it, because "reached on an error" is a
 * more important fact about the play than where the ball landed.
 */
/**
 * The play-by-play line: what happened, then who is on the hook for it.
 *
 * ⚠️ THE SENTENCE AND THE NOTATION ARE BOTH HERE ON PURPOSE. "grounded out to
 * short" says where the ball went; "6-3" says who actually made the out and
 * who threw it there. The first is what you watch, the second is what you can
 * read down a column of and notice that everything you hit ends up at 6. See
 * scorecard() in placement.ts.
 */
function describe(
  result: AtBatState['result'],
  fielding?: { error: boolean; doublePlay: boolean },
  placed?: string,
  fielderNum?: number,
): string {
  if (!result) return '';

  const mark = (words: string, outcome: Outcome): string => {
    if (fielderNum === undefined) return words;
    const card = scorecard(outcome, fielderNum, fielding);
    return card ? `${words}, ${card}` : words;
  };

  switch (result.kind) {
    case 'walk': return 'walk';
    case 'hit_by_pitch': return 'hit by pitch';
    case 'strikeout': return 'struck out';
    case 'in_play': {
      const outcome = result.hit.outcome;
      if (fielding?.error) return mark('reached on an error', outcome);
      if (fielding?.doublePlay) return mark('grounded into a double play', outcome);
      return mark(placed ?? outcome.replace('_', ' '), outcome);
    }
  }
}

const lineClass = (result: AtBatState['result']): string => {
  if (!result) return '';
  if (result.kind === 'in_play' && result.hit.isHit) return 'big';
  if (result.kind === 'walk' || result.kind === 'hit_by_pitch') return '';
  return 'out';
};

// ------------------------------------------------------------- watch mode

/**
 * Play your half for you. Called from the frame loop, once per frame.
 *
 * Every branch here ends in a function the human keys already call, so auto
 * mode cannot drift away from the game a person plays — it presses the same
 * buttons. It also manages your pen and runs your bases, because an auto mode
 * whose starter throws 200 pitches and whose runners never go is not the game
 * being played, it is the game being watched badly.
 */
function autoStep(): void {
  if (game.over) return;

  // ⚠️ TAKING OVER MID-DELIVERY. You can press T at any moment, including with
  // the arm already going, and watch mode does not play the meter — so it
  // finishes the pitch you started at 'good' rather than letting the sweep run
  // out and charging a wild one to a player who has just handed over. It is the
  // same rule the rest of this function keeps: the computer plays your half at
  // the league's numbers, never worse and never better.
  if (phase === 'winding') {
    releaseAs('good');
    return;
  }

  if (phase === 'calling') {
    const before = currentPitcher(game).name;
    game = manageBullpen(game);
    const after = currentPitcher(game).name;
    if (after !== before) say('You go to the pen: ' + before + ' → ' + after + '.', 'half');

    const sit: Situation = {
      previous,
      firstBaseOpen: game.bases[0] === null,
      batterPower: statsOf(currentBatter(game)).power,
      outs: game.outs,
    };
    const choice = autoCaller(currentPitcher(game), book, rng, fatigue(fieldingStaff(game)))(
      { balls: atBat.balls, strikes: atBat.strikes },
      sit,
    );
    // Set the call and go through pitchToThem(), so auto mode throws under the
    // same rules you do — including the one that says your pitch goes exactly
    // where you put it until your arm gets tired.
    callType = choice.type;
    callSpot = choice.location;
    pitchToThem();
    return;
  }

  if (phase === 'idle' && youBat()) {
    // YOUR club's running knob, not theirs — in watch mode the computer is
    // managing your dugout, so it runs the way your club runs.
    const mine = knob((YOU === 'home' ? game.home : game.away).identity, 'running');
    if (aiShouldSend(game, fieldingAlignment(game), rng, mine)) steal();
    // steal() can end the half, the game, or nothing at all — only deliver if
    // it left us still waiting on a pitch.
    if (phase === 'idle') deliver();
    return;
  }
}

// ------------------------------------------------------------------ input

function press(key: string): void {
  // Auto and speed are live in EVERY phase, the final screen included — the
  // point of them is reaching for them without first getting back to a menu.
  if (key === 't') {
    auto = !auto;
    autoSwingAt = null;
    say(auto ? 'AUTO ON — the computer plays your half.' : 'AUTO OFF — you are back in.', 'half');
    return;
  }
  if (key === 'f') {
    speedIdx = (speedIdx + 1) % SPEEDS.length;
    return;
  }
  // Live in every phase, same as the two above — this is the control a player
  // reaches for at the exact moment he decides the window is wrong.
  if (key === 'g') {
    const at = LEVELS.findIndex((l) => l.key === settings.level);
    const next = LEVELS[(at + 1) % LEVELS.length]!;
    settings = { ...settings, level: next.key };
    saveSettings(settings);
    say(`${next.name} — ${next.blurb}`, 'half');
    return;
  }

  if (phase === 'over' && key === 'b' && season) {
    showBox();
    return;
  }
  if (phase === 'over' && key === 'k' && season && seasonOver(season)) {
    showCareer(() => render());
    return;
  }
  if (phase === 'over') {
    if (key === 'r') location.reload();
    if (key === 'n' && season && !seasonOver(season)) nextGame();
    return;
  }

  // Batting: space starts the pitch, then space is the swing.
  if (youBat()) {
    if (key === ' ') {
      if (phase === 'idle') deliver();
      else if (phase === 'windup') swing();
    } else if (key === 's') steal();
    else if (key === 'b') toggleBunt();
    else if (key === 'h') pinchHitNow();
    // The pen's two arrow keys, pointed at the bench while you are hitting —
    // the pen panel is not on this half of the screen, so they are free.
    else if (key === ',' || key === '.') {
      const n = benchOf(game, YOU).length;
      if (n > 0) {
        benchPick = (benchPick + (key === '.' ? 1 : n - 1)) % n;
        benchArmed = false;
        render();
      }
    }
    return;
  }

  // ⚠️ THE RELEASE COMES FIRST, ABOVE THE 'calling' GATE. Once the arm is
  // going, the call is made and the only live control is letting go of it —
  // a spot key that still moved the target mid-delivery would be aiming a ball
  // that has already been decided.
  if (phase === 'winding') {
    if (key === ' ' || key === 'enter') release(performance.now());
    return;
  }

  // Pitching: pick a pitch, pick a spot, throw it.
  if (phase !== 'calling') return;
  const arms = myArsenal();
  const n = Number(key);
  if (n >= 1 && n <= arms.length) {
    callType = arms[n - 1]!;
    render();
    return;
  }
  // QWE / ASD / ZXC laid over the strike zone exactly as it is drawn, so the
  // key you press is where the ball goes. This moved S from low to middle and
  // X from middle to low — the grid decides that, not taste.
  const spots: Record<string, PitchLocation> = {
    q: 'high_inside', w: 'high',   e: 'high_outside',
    a: 'inside',      s: 'middle', d: 'outside',
    z: 'low_inside',  x: 'low',    c: 'low_outside',
  };
  if (spots[key]) {
    callSpot = spots[key]!;
    render();
    return;
  }
  if (key === 'b') { relieve(); return; }
  // Move the selection inside the pen. Two keys nothing else uses, next to
  // each other, and only meaningful while you are the one on the mound.
  if (key === ',') { cyclePen(-1); return; }
  if (key === '.') { cyclePen(1); return; }
  if (key === ' ' || key === 'enter') startDelivery();
}

addEventListener('keydown', (e) => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  // ⚠️ A HELD KEY IS ONE ACT, NOT THIRTY. The browser repeats keydown while a
  // key is down, and SPACE is now the key that both STARTS a delivery and ends
  // it — so a leaned-on spacebar started the arm and had the autorepeat let go
  // of it 500ms later, which is a wild pitch nobody asked for. Only the two
  // action keys are filtered: ',' and '.' walk a list, where repeating is the
  // point, and every other key here is idempotent.
  if (e.repeat && (k === ' ' || k === 'enter')) {
    e.preventDefault();
    return;
  }
  if (
    // ⚠️ THIS LIST IS THE GATE, AND A KEY press() HANDLES BUT THIS DOES NOT
    // LIST IS A DEAD KEY. The pen selector shipped broken for exactly that
    // reason: press() knew ',' and '.' and the listener never forwarded them.
    [' ', 'enter', 'q', 'w', 'e', 'a', 's', 'd', 'z', 'x', 'c', 'r', 'b', 'g', 'h', 'k', 't', 'f', 'n', ',', '.'].includes(k) ||
    /^[1-9]$/.test(k)
  ) {
    e.preventDefault();
    press(k === 'enter' ? 'enter' : k);
  }
});

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  press(' ');
});

// ----------------------------------------------------------------- render

/**
 * The overhead camera, sized to whatever the canvas is. Home near the bottom,
 * the wall arc near the top — the at-bat view is painted over completely while
 * it is up, which is what makes the cut read as a cut.
 */
const OH_CAM = makeCam(canvas.width, canvas.height);
/** The two field colours, matched to game.html's palette. */
const OH_PALETTE = { field: '#1d2b1f', dirt: '#3a2e20' };

/**
 * The replay's clock, sped up with everything else. Scaling the CLOCK rather
 * than the constants means the sound cues, the fielders' legs and the throw all
 * stay in step at 8x, because they are all read off this one number.
 */
const replayNow = (now: number): number =>
  replay ? replay.startedAt + (now - replay.startedAt) * speed() : now;

/**
 * `__play('triple')` in the console — see any play without waiting for the RNG
 * to hand you one. Dev only: Vite folds import.meta.env.DEV to false and drops
 * the branch, so there is no hook to find in the exported file.
 *
 * ponytail: tuning an animation you can only see once every twenty at-bats is
 * how animations end up untuned. Two lines, not a debug menu.
 */
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>)['__play'] = (
    outcome: Outcome = 'double',
    exitVelocity = 95,
    launchAngle = 22,
    direction = -18,
    extra: Partial<Parameters<typeof newReplay>[0]> = {},
  ) => {
    replay = newReplay({
      now: performance.now(),
      outcome,
      exitVelocity,
      launchAngle,
      direction,
      speed: 1,
      safe: !outcome.includes('out'),
      ...extra,
    });
    return outcome;
  };
  // Step the play to an exact millisecond and hand back the frame. Frame-level
  // tuning without having to catch a two-second animation live.
  (window as unknown as Record<string, unknown>)['__frame'] = (ms: number) => {
    const now = performance.now();
    if (replay) replay.startedAt = now - ms;
    drawField(now);
    return canvas.toDataURL('image/png');
  };
}

const PLATE_Y = 250;
const ZONE = { x: 160, y: 118, w: 100, h: 108 };

function drawField(now: number): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Backstop dirt and the mound sightline.
  ctx.fillStyle = '#101a12';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#16211a';
  ctx.beginPath();
  ctx.ellipse(210, 60, 92, 34, 0, 0, Math.PI * 2);
  ctx.fill();

  // Strike zone.
  ctx.strokeStyle = '#3d4a38';
  ctx.lineWidth = 1;
  ctx.strokeRect(ZONE.x, ZONE.y, ZONE.w, ZONE.h);
  ctx.strokeStyle = '#222c20';
  for (let i = 1; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(ZONE.x + (ZONE.w / 3) * i, ZONE.y);
    ctx.lineTo(ZONE.x + (ZONE.w / 3) * i, ZONE.y + ZONE.h);
    ctx.moveTo(ZONE.x, ZONE.y + (ZONE.h / 3) * i);
    ctx.lineTo(ZONE.x + ZONE.w, ZONE.y + (ZONE.h / 3) * i);
    ctx.stroke();
  }

  // Home plate.
  ctx.fillStyle = '#cfd6c4';
  ctx.beginPath();
  ctx.moveTo(180, PLATE_Y);
  ctx.lineTo(240, PLATE_Y);
  ctx.lineTo(240, PLATE_Y + 10);
  ctx.lineTo(210, PLATE_Y + 20);
  ctx.lineTo(180, PLATE_Y + 10);
  ctx.closePath();
  ctx.fill();

  drawBases();

  if (phase === 'windup' && pitch) drawBall(now);
  // The call stays on the zone through the delivery. It is locked once the arm
  // starts, and taking the reticle away at the exact moment you are watching
  // the bar would hide what you are throwing at from the pitch you are throwing.
  if (phase === 'calling' || phase === 'winding') drawCall();
  // Your half only: there is no delivery to draw while you are the hitter.
  if (!youBat() && !game.over) drawDelivery(now);
  drawFlash(now);

  // Last, and opaque: the cut to the field covers the at-bat view rather than
  // replacing it, so neither view has to know the other exists.
  if (replay) {
    const rn = replayNow(now);
    const oh = overheadAlpha(replay, rn);
    if (oh > 0) {
      ctx.globalAlpha = oh;
      drawOverhead(ctx, OH_CAM, replay, rn, OH_PALETTE);
      ctx.globalAlpha = 1;
    }
  }
}

/** Where the pitch crosses, given its nominal location. */
function spotXY(location: PitchLocation, inZone: boolean): [number, number] {
  const cx = ZONE.x + ZONE.w / 2;
  const cy = ZONE.y + ZONE.h / 2;
  const off = inZone ? 0.22 : 0.78;
  const { dx, dy } = locationOffset(location);
  return [cx + dx * ZONE.w * off, cy + dy * ZONE.h * off];
}

function drawBall(now: number): void {
  if (!pitch) return;
  const flight = arriveAt - launchAt;
  const t = Math.max(0, Math.min(1.15, (now - launchAt) / flight));

  const [tx, ty] = spotXY(pitch.location, pitch.inZone);

  // THE BREAK. Off the straight line on the way in, and back onto the spot by
  // the time it gets there — movementOf() owns the shape, the sign and the
  // reason for both. Scaled by the ZONE so a curveball is the same size pitch
  // on both screens, and seeded off the launch so no two knuckleballs wander
  // the same way.
  const arm = currentPitcher(game);
  const m = movementOf(pitch.type, t, {
    break: arm.break,
    throws: arm.throws,
    seed: Math.floor(launchAt),
  });

  // Release point above the mound, arriving at the spot.
  const x = 210 + (tx - 210) * t + m.dx * ZONE.w;
  const y = 52 + (ty - 52) * t + m.dy * ZONE.h;
  const r = 2.5 + t * t * 7;

  ctx.fillStyle = swingStartedAt !== null && checkedAt === null ? '#fff2b0' : '#f0f0e2';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  // The tell: a coloured ring on a pitcher who leaks it.
  if (pitch.tell && (pitch.tell.timing === 'pre_pitch' || t > 0.12)) {
    ctx.strokeStyle = TELL_COLOR[pitch.tell.pitch];
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r + 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  // The bat, travelling. It used to be a 130ms flash AFTER the press, which is
  // a picture of a decision already made; now the sweep IS the travel, so the
  // barrel is visibly on its way and you can watch it get pulled back.
  if (swingStartedAt !== null) {
    const sweep =
      checkedAt === null
        ? Math.min(1.3, (now - swingStartedAt) / swingTravel)
        : // Checked: the barrel retreats from wherever it had got to.
          ((checkedAt - swingStartedAt) / swingTravel) *
          Math.max(0, 1 - (now - checkedAt) / CHECK_PULL_MS);

    if (sweep > 0.02) {
      ctx.strokeStyle = checkedAt === null ? '#d8b44a' : '#7a8a6a';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(210, PLATE_Y - 30, 62, Math.PI * (0.15 + sweep * 0.8), Math.PI * (0.25 + sweep * 0.8));
      ctx.stroke();
    }
  }
}

const TELL_COLOR: Record<PitchType, string> = {
  fastball: '#c4574a',
  slider: '#7a9ed8',
  changeup: '#6fbf62',
  curveball: '#b57ad8',
  knuckleball: '#d8b44a',
  // Orange, next door to the fastball's red — a sinker IS a fastball that
  // dies, and the two reading as cousins on the screen is the honest signal.
  sinker: '#d8813a',
};

/** In 'calling', show where you are aiming. */
function drawCall(): void {
  const [x, y] = spotXY(callSpot, true);
  ctx.strokeStyle = TELL_COLOR[callType];
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.arc(x, y, 20, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
}

/**
 * THE DELIVERY BAR — the sweep, the release point, and where you let go.
 *
 * ⚠️ THE BANDS ARE DRAWN OFF THE FUNCTION THAT GRADES THEM. releaseWindow()
 * closes over the arm's signature and the difficulty level, so a painter's band
 * is visibly wider than a knuckleballer's and ROOKIE's is visibly wider than
 * ALL-STAR's, without this function knowing either fact. Hard-coding the widths
 * here is how the picture and the verdict come apart.
 *
 * It sits bottom-left because that is the only quiet corner of this canvas:
 * the zone runs x160-260 down to y226, the plate to y270, and the bases live
 * around x315-385. Nothing here overlaps any of them.
 */
const BAR = { x: 24, y: 296, w: 252, h: 14 } as const;

/** Milliseconds into the sweep, as an x on the bar. Clamped to the bar. */
const barX = (ms: number): number =>
  BAR.x + (Math.max(0, Math.min(DELIVERY_MS, ms)) / DELIVERY_MS) * BAR.w;

/** What each verdict is painted in. Gold rewards, red costs, dim is the shrug. */
const RELEASE_COLOR: Record<ReleaseGrade, string> = {
  perfect: '#d8b44a',
  good: '#6fbf62',
  early: '#7a8a6a',
  late: '#7a8a6a',
  wild: '#c4574a',
};

function drawDelivery(now: number): void {
  const band = (halfWidthMs: number, fill: string): void => {
    const a = barX(RELEASE_AT_MS - halfWidthMs);
    const b = barX(RELEASE_AT_MS + halfWidthMs);
    ctx.fillStyle = fill;
    ctx.fillRect(a, BAR.y, b - a, BAR.h);
  };

  ctx.fillStyle = '#0a0f0c';
  ctx.fillRect(BAR.x, BAR.y, BAR.w, BAR.h);
  // The arm coming forward, drawn hatched-dark so the one stretch of the sweep
  // where a press does nothing at all is a place on the bar rather than a
  // surprise. See ARM_MS.
  ctx.fillStyle = '#131a14';
  ctx.fillRect(BAR.x, BAR.y, barX(ARM_MS) - BAR.x, BAR.h);
  band(releaseWindow('good'), '#243320');
  band(releaseWindow('perfect'), '#3d5733');

  ctx.strokeStyle = '#2f3a2a';
  ctx.lineWidth = 1;
  ctx.strokeRect(BAR.x + 0.5, BAR.y + 0.5, BAR.w - 1, BAR.h - 1);

  // The release point. One line, and it is the thing you are aiming the press
  // at — the bands either side of it are what that press is worth.
  const rx = barX(RELEASE_AT_MS);
  ctx.strokeStyle = '#cfd6c4';
  ctx.beginPath();
  ctx.moveTo(rx, BAR.y - 3);
  ctx.lineTo(rx, BAR.y + BAR.h + 3);
  ctx.stroke();

  // The arm while it is going, then frozen at the moment it let go — so the
  // verdict is readable against the mark that earned it rather than on its own.
  const at =
    phase === 'winding'
      ? now - deliveryAt
      : releasedAt === null
        ? null
        : releasedAt - deliveryAt;
  if (at !== null) {
    ctx.fillStyle =
      phase === 'winding' ? '#e8e8d8' : RELEASE_COLOR[releaseGrade ?? 'good'];
    ctx.fillRect(barX(at) - 1, BAR.y - 4, 2, BAR.h + 8);
  }

  ctx.font = '10px ui-monospace, monospace';
  ctx.textAlign = 'left';
  if (phase === 'winding') {
    // Nothing. The marker is saying it, and a line of text under a bar you are
    // trying to time is one more thing pulling the eye off it.
  } else if (releaseGrade) {
    ctx.fillStyle = RELEASE_COLOR[releaseGrade];
    ctx.fillText(RELEASE_LABEL[releaseGrade], BAR.x, BAR.y + BAR.h + 15);
  } else {
    ctx.fillStyle = '#7a8a6a';
    ctx.fillText('SPACE starts the arm — SPACE again to let go', BAR.x, BAR.y + BAR.h + 15);
  }
}

function drawBases(): void {
  const cx = 350;
  const cy = 300;
  const s = 13;
  const bags: [number, number][] = [
    [cx + 22, cy],       // first
    [cx, cy - 22],       // second
    [cx - 22, cy],       // third
  ];
  ctx.strokeStyle = '#3d4a38';
  ctx.lineWidth = 1;
  bags.forEach(([bx, by], i) => {
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(Math.PI / 4);
    if (game.bases[i]) {
      ctx.fillStyle = '#d8b44a';
      ctx.fillRect(-s / 2, -s / 2, s, s);
    } else {
      ctx.strokeRect(-s / 2, -s / 2, s, s);
    }
    ctx.restore();
  });
  // Home.
  ctx.save();
  ctx.translate(cx, cy + 22);
  ctx.rotate(Math.PI / 4);
  ctx.strokeStyle = '#5c6b52';
  ctx.strokeRect(-s / 2, -s / 2, s, s);
  ctx.restore();

  // Outs.
  ctx.fillStyle = '#c4574a';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(cx - 20 + i * 20, cy + 46, 5, 0, Math.PI * 2);
    if (i < game.outs) ctx.fill();
    else { ctx.strokeStyle = '#3d4a38'; ctx.stroke(); }
  }
}

function drawFlash(now: number): void {
  if (!flash || phase !== 'resolve' || now > flashUntil) return;
  ctx.fillStyle = 'rgba(13,18,16,0.72)';
  ctx.fillRect(0, 140, canvas.width, 60);
  ctx.fillStyle = '#d8b44a';
  ctx.font = '18px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(flash, canvas.width / 2, 176);
  ctx.textAlign = 'left';
}

// ------------------------------------------------------------ dom render

/**
 * Rewrite the panels — but only when they would actually say something new.
 *
 * ⚠️ THE BUG THIS FIXES, AND WHY IT LOOKED LIKE NOTHING. render() is called
 * from the frame loop, so before this guard every panel's innerHTML was
 * rebuilt SIXTY TIMES A SECOND. Text survives that. A button does not: a click
 * is a mousedown and a mouseup on the SAME element, and the element you
 * pressed on was replaced by a fresh one a few milliseconds later, so the
 * mouseup landed on a different node and no click ever fired. Every on-screen
 * control — pitch, spot, throw, pen, steal — was dead to the mouse and to
 * touch, and only the keyboard worked. Nothing errored, which is why it went
 * unnoticed: the buttons drew perfectly and simply did not respond.
 *
 * The check is identity, not deep equality, and that is safe because
 * `game` and `atBat` are REPLACED rather than mutated on every change. `book`
 * is the one thing here that mutates in place, and it is covered by `phase` —
 * observePitch() only ever runs on the way into 'resolve'.
 *
 * ⚠️ Do NOT add a time value to this key. The animation lives on the canvas in
 * drawField(), which is still called every frame; the moment the DOM depends
 * on the clock, the buttons die again.
 */
let lastKey: unknown[] = [];

function render(): void {
  // penArmed is in here for the same reason bunting is: it is a STANCE the
  // panel has to show. Leave it out and the first press of the pen arms it
  // silently, the button keeps saying GO TO THE PEN, and the second press is
  // the accident this was all meant to prevent.
  // ⚠️ ANYTHING THE PANELS DRAW MUST BE IN THIS ARRAY. It is a memo key — a
  // value that is rendered but not listed here simply never redraws, silently.
  // penPick shipped missing from it: the pen list highlighted the wrong arm
  // all game while the GO TO THE PEN button named the right one, because the
  // button rides on penArmed, which IS listed, and the rows rode on nothing.
  const key = [phase, game, atBat, callType, callSpot, auto, speedIdx, lastGrade, season, bunting, penArmed, penPick, benchArmed, benchPick, streak, settings, chart, releaseGrade];
  if (key.length === lastKey.length && key.every((v, i) => v === lastKey[i])) return;
  lastKey = key;

  renderScore();
  renderSituation();
  renderMeta();
  renderControls();
  renderBook();
}

/**
 * The auto / speed strip.
 *
 * The buttons here work because render() no longer runs every frame — see the
 * dirty check on render(), which is what keeps every control on the screen
 * clickable rather than just this one.
 */
function renderMeta(): void {
  // ⚠️ THE DIFFICULTY IS ON THE SCREEN, NEXT TO THE THING IT CHANGES, and it
  // is changeable here rather than only on the title screen. A player who finds
  // out in the fourth inning of game nine that the window is too narrow should
  // not have to abandon a franchise to say so.
  //
  // The calibration reads out beside it for the same reason: it moves the
  // grading of every swing, so it says so out loud. A silent correction and a
  // timing bug look identical from the batter's box.
  const level = levelOf(settings.level);
  elMeta.innerHTML =
    '<button data-auto="1">' +
    (auto ? 'AUTO — computer plays your half' : 'MANUAL — you play') +
    ' <kbd>T</kbd></button>' +
    '<button data-speed="1" style="margin-left:8px">speed ' +
    speed() +
    '&times; <kbd>F</kbd></button>' +
    '<button data-diff="1" style="margin-left:8px">' +
    level.name +
    ' <kbd>G</kbd></button>' +
    '<span class="dim" style="margin-left:10px">' +
    calibrationLabel(settings.calibration) +
    '</span>' +
    (auto
      ? '<span class="dim" style="margin-left:10px">watching · press T to take over</span>'
      : '');

  const autoBtn = elMeta.querySelector<HTMLButtonElement>('[data-auto]');
  if (autoBtn) autoBtn.onclick = () => press('t');
  const speedBtn = elMeta.querySelector<HTMLButtonElement>('[data-speed]');
  if (speedBtn) speedBtn.onclick = () => press('f');
  const diffBtn = elMeta.querySelector<HTMLButtonElement>('[data-diff]');
  if (diffBtn) diffBtn.onclick = () => press('g');
}

function renderScore(): void {
  const innings = Math.max(9, game.inning);
  const head = ['', ...Array.from({ length: innings }, (_, i) => String(i + 1)), 'R', 'H'];
  const row = (side: 'home' | 'away') => {
    const t = side === 'home' ? game.home : game.away;
    const s = stateOf(game, side);
    const cells = Array.from({ length: innings }, (_, i) =>
      i < s.byInning.length ? String(s.byInning[i]) : '·',
    );
    const batting = !game.over && battingSide(game) === side ? ' class="batting"' : '';
    return `<tr${batting}><td class="team">${t.abbr}${side === YOU ? ' (you)' : ''}</td>${cells
      .map((c) => `<td>${c}</td>`)
      .join('')}<td class="tot">${s.runs}</td><td>${s.hits}</td></tr>`;
  };
  elScore.innerHTML = `<table class="line"><thead><tr>${head
    .map((h) => `<th>${h}</th>`)
    .join('')}</tr></thead><tbody>${row('away')}${row('home')}</tbody></table>`;
}

function renderSituation(): void {
  if (game.over) {
    if (!season) {
      elSit.innerHTML = `<span><b>FINAL</b></span><span class="dim">press R for a new game</span>`;
      return;
    }
    const me = standings(season).find((r) => r.abbr === season!.you)!;
    const champ = champion(season);
    elSit.innerHTML = [
      `<span><b>FINAL</b></span>`,
      `<span>${season.you} <b>${me.w}-${me.l}</b></span>`,
      champ
        ? `<span class="dim">${champ} win the championship</span>`
        : yourGame(season)
          ? `<span class="dim">up next: ${dayLabel(season)}</span>`
          : `<span class="dim">you are out — ${dayLabel(season)} still to play</span>`,
    ].join('');
    return;
  }
  const b = currentBatter(game);
  const role = youBat() ? 'YOU BAT' : 'YOU PITCH';
  const staff = fieldingStaff(game);
  const cond = armCondition(staff);
  const condColor =
    cond === 'gassed' ? 'var(--bad)' : cond === 'tiring' ? 'var(--hot)' : 'var(--dim)';

  elSit.innerHTML = [
    `<span><b>${inningLabel(game)}</b></span>`,
    `<span>${atBat.balls}–${atBat.strikes}</span>`,
    `<span>${game.outs} out</span>`,
    `<span class="dim">|</span>`,
    `<span><b>${role}</b></span>`,
    // The bat speed is shown because the check swing is what makes it matter:
    // a heavy bat arrives late AND gives you longer to change your mind, and a
    // trade you cannot see is not a trade.
    `<span>${b.name} <span class="dim">(${b.bats}, ${batSpeedLabel(statsOf(b).power)})</span></span>`,
    `<span class="dim">on deck ${onDeck(game).name}</span>`,
    `<span class="dim">|</span>`,
    `<span>${currentPitcher(game).name}` +
      ` <span class="dim">${staff.current.pitches}p</span>` +
      ` <span style="color:${condColor}">${cond}</span></span>`,
  ].join('');
}

/**
 * YOUR BENCH, on the controls panel while you are the one hitting.
 *
 * ⚠️ IT IS THE PEN PANEL AGAIN, DELIBERATELY. Same rows, same picked
 * highlight, same ARMED-THEN-CONFIRMED button — because it is the same shape of
 * decision: pick one of a short list of men, and once he is in, the man he
 * replaced is gone for the night. The bullpen grew its second press because
 * pitchers were being changed by accident; a pinch hitter costs exactly as much
 * and would be lost exactly as easily, so it does not get to happen on one
 * click either.
 *
 * ⚠️ ONLY FOR THE MAN AT THE PLATE, and only between pitches. `phase === 'idle'`
 * is the same gate the bunt and the steal use — a substitution mid-flight would
 * change who is swinging at a ball already in the air.
 */
function benchPanel(): string {
  const bench = benchOf(game, YOU);
  if (bench.length === 0) return '';

  const due = currentBatter(game);
  const ready = phase === 'idle' ? '' : ' disabled';
  const picked = bench[Math.min(benchPick, bench.length - 1)]!;

  // ⚠️ TWO LINES PER MAN, NOT THE PEN'S FOUR COLUMNS. The pen panel's grid
  // carries two ratings and fits; this one has to carry three plus a hand plus
  // what he is FOR, and in a 240px side column that grid wrapped every name
  // onto three lines. Same rows, same picked highlight — stacked instead of
  // columned, because the column count is what did not fit.
  const man = (p: Player, tag: string, on: boolean, attr = ''): string => {
    const s = statsOf(p);
    return (
      `<div class="benchrow${on ? ' picked' : ''}"${attr}>` +
      `<div class="benchname"><b>${on ? '▸ ' : ''}${p.name}</b>` +
      `<span class="dim">${tag}</span></div>` +
      `<div class="dim">${p.bats}H · POW ${showScale(s.power)} · CON ${showScale(s.contact)}` +
      ` · SPD ${showScale(s.speed)}</div></div>`
    );
  };

  const rows = bench
    .map((p, i) =>
      // What he is FOR, read off the shape of his card rather than stored. The
      // three archetypes in teams.ts are built to be legible at a glance and
      // this is the glance — see the bench section there.
      man(
        p,
        statsOf(p).power >= 1.3 ? 'bat' : statsOf(p).speed >= 1.25 ? 'legs' : 'platoon',
        i === benchPick,
        ` data-bench="${i}" style="cursor:pointer"`,
      ),
    )
    .join('');

  return (
    `<div class="pen"><div class="dim penhead">YOUR BENCH — ${bench.length} LEFT</div>` +
    man(due, 'at the plate', false) +
    rows +
    `<button class="pengo${benchArmed ? ' on' : ''}" data-hit="1"${ready}>` +
    (benchArmed
      ? `PRESS AGAIN — ${picked.name.toUpperCase()} BATS FOR ${due.name.toUpperCase()} <kbd>H</kbd>`
      : `PINCH HIT <kbd>H</kbd>`) +
    `</button>` +
    `<div class="dim" style="font-size:10px;margin-top:4px">` +
    `${due.name} is out of the game. Pick the man — click, or <kbd>,</kbd> <kbd>.</kbd></div>` +
    `</div>`
  );
}

function bindBench(): void {
  elControls.querySelectorAll<HTMLElement>('[data-bench]').forEach((row) => {
    row.onclick = () => {
      benchPick = Number(row.dataset['bench']);
      // Picking a different man DISARMS. Otherwise clicking a row while the
      // button was armed would send up somebody the button had not named.
      benchArmed = false;
      render();
    };
  });
  const go = elControls.querySelector<HTMLButtonElement>('[data-hit]');
  if (go) go.onclick = () => press('h');
}

/**
 * Send him up. Two presses; see benchPanel().
 *
 * ⚠️ THE BUNT STANCE IS DROPPED WITH HIM. `bunting` is a decision made about
 * the man who was at the plate, and carrying it onto a pinch hitter would have
 * him squaring round without being asked — most likely the power bat you just
 * spent, which is the one man in the park who should never be bunting.
 */
function pinchHitNow(): void {
  if (phase !== 'idle' || game.over) return;
  const bench = benchOf(game, YOU);
  if (bench.length === 0) return;

  if (!benchArmed) {
    benchArmed = true;
    render();
    return;
  }
  benchArmed = false;

  const sub = bench[Math.min(benchPick, bench.length - 1)]!;
  const out = currentBatter(game);
  game = pinchHit(game, YOU, sub);
  if (currentBatter(game) === out) return;

  bunting = false;
  benchPick = 0;
  say(`${sub.name} bats for ${out.name}.`, 'big');
  flash = 'PINCH HITTER';
  flashUntil = pauseFor(900);
  render();
}

/**
 * The nine spots in the player's words. Module scope because two panels name
 * them now — the picker you call the pitch on, and the chart that says where it
 * actually went. Two copies of this table is two vocabularies for one grid.
 */
const SPOT_LABEL: Record<PitchLocation, string> = {
  high_inside: 'high in', high: 'high', high_outside: 'high away',
  inside: 'in',           middle: 'middle', outside: 'away',
  low_inside: 'low in',   low: 'low',   low_outside: 'low away',
};

/**
 * The six pitches on a scorer's card. Only the chart uses these — the picker
 * has room for the whole word and a button that said "KN" would be a quiz.
 */
const TYPE_SHORT: Record<PitchType, string> = {
  fastball: 'FB',
  curveball: 'CB',
  changeup: 'CH',
  slider: 'SL',
  knuckleball: 'KN',
  sinker: 'SI',
};

function renderControls(): void {
  if (game.over) {
    // Eliminated but the bracket is not decided: the button plays it out
    // rather than disappearing and stranding you on a season with no ending.
    const label =
      season && !seasonOver(season) ? (yourGame(season) ? 'Next game' : 'Watch it out') : null;
    const next = label ? `<button data-next="1">${label} <kbd>N</kbd></button>` : '';
    // The box score, which only exists in a franchise: an exhibition has no
    // season to put the game in and no leaders to compare it against.
    const box = season ? '<button data-box="1">Box score <kbd>B</kbd></button>' : '';
    // The book is offered on the screen where the season ENDED, which is the
    // one moment it is about — see showCareer().
    const bookBtn =
      season && seasonOver(season) ? '<button data-book="1">Record book <kbd>K</kbd></button>' : '';
    elControls.innerHTML =
      `<div class="keys">${next}${box}${bookBtn}<button onclick="location.reload()">` +
      `${season ? 'Quit to menu' : 'Play again'} <kbd>R</kbd></button></div>`;
    const btn = elControls.querySelector<HTMLButtonElement>('[data-next]');
    if (btn) btn.onclick = () => nextGame();
    const boxBtn = elControls.querySelector<HTMLButtonElement>('[data-box]');
    if (boxBtn) boxBtn.onclick = () => showBox();
    const kBtn = elControls.querySelector<HTMLButtonElement>('[data-book]');
    if (kBtn) kBtn.onclick = () => showCareer(() => render());
    return;
  }

  if (youBat()) {
    const hint =
      phase === 'idle'
        ? 'Click the field or press SPACE for the pitch.'
        : phase === 'windup'
          ? // Both presses named at once, deliberately. The controls panel only
            // rebuilds when render()'s dirty key changes, and a hint that
            // rewrote itself mid-flight would need the swing in that key — see
            // the warning on render() for why putting a live value in there is
            // how every button on this screen died last time.
            'SWING — press SPACE. Press it again early to check.'
          : '…';

    // The steal offer carries its ODDS. A gamble whose price you cannot see is
    // not a decision, it is a coin flip with extra steps.
    const op = stealOpportunity(game);
    let stealBtn = '';
    if (op) {
      const odds = Math.round(chanceFor(game, op, fieldingAlignment(game)) * 100);
      const bag = op.to === 1 ? 'second' : 'third';
      const enabled = phase === 'idle';
      stealBtn =
        `<button style="margin-top:8px;width:100%;text-align:center" data-steal="1"${enabled ? '' : ' disabled'}>` +
        `SEND ${op.runner.name.toUpperCase()} — ${odds}% <kbd>S</kbd><br>` +
        `<kbd>stealing ${bag} · caught costs an out</kbd></button>`;
    }

    // The bunt carries HIS rating on the button, for the same reason the steal
    // carries its odds: a stance whose price you cannot see is not a decision.
    // Squaring up is legal between pitches only, so the button is live in
    // 'idle' and reads as a stance the rest of the time.
    const bstat = statsOf(currentBatter(game)).bunt;
    // ⚠️ AND IT ONLY SAYS "MOVES THE RUNNER" WHEN ONE ACTUALLY MOVES. The
    // sacrifice in inning.ts is gated on fewer than two outs, and there has to
    // be somebody to move — so with two down, or with the bases empty, the line
    // was promising a sacrifice the engine will not give. What a bunt is in
    // that state is a bunt for a hit: BUNT_HIT is 11%, which is the real offer.
    const sacrifice = game.outs < 2 && game.bases.some((b) => b !== null);
    const buntBtn =
      `<button style="margin-top:8px;width:100%;text-align:center" data-bunt="1"` +
      `${phase === 'idle' ? '' : ' disabled'} class="${bunting ? 'on' : ''}">` +
      `${bunting ? 'SQUARED TO BUNT' : 'BUNT'} — ${showScale(bstat)} <kbd>B</kbd><br>` +
      `<kbd>${
        bunting
          ? 'offers at strikes only · foul with 2K is out'
          : sacrifice
            ? 'moves the runner, costs the out'
            : 'for a hit — no sacrifice on from here'
      }</kbd></button>`;

    // The number and the record, together. A record you cannot see is not a
    // record — it is the steal button with no odds on it all over again.
    const heat = streak.current >= 3 ? 'var(--hot)' : 'var(--ink)';
    const streakLine =
      `<div class="dim">last swing: ${lastGrade || '—'}` +
      ` &nbsp;·&nbsp; squared up <b style="color:${heat}">${streak.current}</b> in a row` +
      ` <span class="dim">(best ${streak.best})</span></div>`;

    elControls.innerHTML =
      `<div style="margin-bottom:6px">${hint}</div>` +
      streakLine +
      stealBtn +
      buntBtn +
      benchPanel();

    const stealEl = elControls.querySelector<HTMLButtonElement>('[data-steal]');
    if (stealEl) stealEl.onclick = () => steal();
    const buntEl = elControls.querySelector<HTMLButtonElement>('[data-bunt]');
    if (buntEl) buntEl.onclick = () => toggleBunt();
    bindBench();
    return;
  }

  // Clamped here because here is where the pitcher changing — the pen, the
  // half, the next game — first has to be shown. A selection he cannot throw
  // is a button that lies.
  const arms = myArsenal();
  if (!arms.includes(callType)) callType = arms[0]!;

  // ⚠️ THE CALL IS LOCKED ONCE THE ARM STARTS, ON BOTH INPUT PATHS. press()
  // returns early on a spot key during 'winding'; without this the MOUSE could
  // still re-aim a pitch that is already being delivered, because these
  // handlers set callSpot directly and pitchToThem() does not read it until the
  // release. Two inputs to one control that disagreed about when it was live is
  // the kind of thing only ever found by the person who plays with a mouse.
  //
  // Deliberately still live during 'windup': picking the NEXT pitch while the
  // current one is in the air changes nothing about the one already thrown.
  const locked = phase === 'winding' ? ' disabled' : '';

  const pitches = arms.map(
    (t, i) =>
      `<button data-pitch="${t}"${locked} class="${t === callType ? 'on' : ''}">${t}<br><kbd>${i + 1}</kbd></button>`,
  ).join('');
  // Drawn in reading order, which IS the grid order, which is the key order.
  // ALL_LOCATIONS is the single source for all three.
  const spotKeys = ['Q', 'W', 'E', 'A', 'S', 'D', 'Z', 'X', 'C'];
  const spots = ALL_LOCATIONS.map(
    (s, i) =>
      `<button data-spot="${s}"${locked} class="${s === callSpot ? 'on' : ''}">${SPOT_LABEL[s]}` +
      `<br><kbd>${spotKeys[i]}</kbd></button>`,
  ).join('');

  // Live only between pitches. While the ball is in the air there is nothing
  // left to decide, and a THROW button you can press twice is a button that
  // lies about what the phase is.
  //
  // ⚠️ 'winding' IS NOT A DEAD PHASE THOUGH — it is the one phase where this
  // button is the whole game. The pen and the pitch grid stay disabled through
  // it (the call is made, and the pen mid-delivery is nonsense), but the throw
  // button below reads `phase` for itself and stays live to take the release.
  const ready = phase === 'calling' ? '' : ' disabled';
  const throwable = phase === 'calling' || phase === 'winding' ? '' : ' disabled';

  // ---- THE BULLPEN, which is its own panel and not another pitch button.
  //
  // It reads top to bottom as the question a manager actually asks: how is the
  // man I have, who is warm, and is he better. The arm on the mound carries its
  // pitch count and its condition; the next one out carries the two ratings
  // that decide whether the change is worth making.
  const staff = fieldingStaff(game);
  const penLeft = staff.bullpen.length;
  const cond = armCondition(staff);
  const condColor =
    cond === 'gassed' ? 'var(--bad)' : cond === 'tiring' ? 'var(--hot)' : 'var(--dim)';
  const mine = currentPitcher(game);
  const mineR = ratingsOf(mine);

  // ⚠️ THE WHOLE PEN, NOT JUST THE NEXT MAN. It listed one arm because
  // bringInRelief() only ever took one; now every available arm is a row you
  // can pick, which is the difference between a bullpen and a queue. The
  // starter's own STA is the number rest has already been folded into — see
  // ArmState.stamina — so a short-rest man reads short here all game.
  const onMound =
    `<div class="penrow"><span>on the mound</span><b>${mine.name}</b>` +
    `<span class="dim">${staff.current.pitches}p · BRE ${showScale(mineR['break']!)} · STA ${showScale(staff.current.stamina)}</span>` +
    `<span style="color:${condColor}">${cond}</span></div>`;

  const penRows = penLeft
    ? onMound +
      staff.bullpen
        .map((arm, i) => {
          const on = i === penPick;
          // ⚠️ HIS LEGS TONIGHT, NOT THE RATING ON HIS CARD. Staff.legs has
          // yesterday's work already folded in, and a pen panel that showed the
          // card number would be quietly recommending a man who is not there.
          const legs = staff.legs?.[arm.name] ?? arm.stamina ?? 1;
          const share = legs / Math.max(0.01, arm.stamina ?? 1);
          const word = share >= 0.99 ? '' : share >= 0.7 ? 'used' : share >= 0.45 ? 'tired' : 'gassed';
          const colour = share >= 0.7 ? 'var(--dim)' : share >= 0.45 ? 'var(--hot)' : 'var(--bad)';
          return (
            `<div class="penrow${on ? ' picked' : ''}" data-arm="${i}" style="cursor:pointer">` +
            `<span>${on ? '▸ warming' : ''}</span><b>${arm.name}</b>` +
            `<span class="dim">BRE ${showScale(ratingsOf(arm)['break']!)} · STA ${showScale(legs)}</span>` +
            `<span style="color:${colour}">${on ? (word || 'next') : word}</span></div>`
          );
        })
        .join('')
    : onMound +
      `<div class="penrow dim"><span>warm</span><b>nobody</b><span>the pen is empty</span><span></span></div>`;

  // ⚠️ ARMED, THEN CONFIRMED, and the button says which state it is in. The
  // change cannot be taken back, so it does not happen on one press — see
  // penArmed. It is also no longer full-width or adjacent to THROW IT.
  const penBtn = penLeft
    ? `<button class="pengo${penArmed ? ' on' : ''}" data-pen="1"${ready}>` +
      (penArmed
        ? `PRESS AGAIN — ${staff.bullpen[penPick]!.name.toUpperCase()} COMES IN <kbd>B</kbd>`
        : `GO TO THE PEN <kbd>B</kbd>`) +
      `</button>` +
      (penLeft > 1
        ? `<div class="dim" style="font-size:10px;margin-top:4px">pick the arm — click, or <kbd>,</kbd> <kbd>.</kbd></div>`
        : '')
    : '';

  const penPanel =
    `<div class="pen"><div class="dim penhead">BULLPEN</div>${penRows}${penBtn}</div>`;

  elControls.innerHTML =
    `<div style="margin-bottom:6px" class="dim">pitch</div><div class="keys">${pitches}</div>` +
    `<div style="margin:8px 0 6px" class="dim">spot</div><div class="zone">${spots}</div>` +
    `<button style="margin-top:8px;width:100%;text-align:center" data-throw="1"${throwable}` +
    `${phase === 'winding' ? ' class="on"' : ''}>` +
    (phase === 'calling'
      ? 'THROW IT <kbd>SPACE</kbd>'
      : phase === 'winding'
        ? 'LET GO <kbd>SPACE</kbd>'
        : phase === 'windup'
          ? 'ON ITS WAY…'
          : '…') +
    '</button>' +
    chartPanel() +
    penPanel;

  elControls.querySelectorAll<HTMLButtonElement>('[data-pitch]').forEach((btn) => {
    btn.onclick = () => { callType = btn.dataset.pitch as PitchType; render(); };
  });
  elControls.querySelectorAll<HTMLButtonElement>('[data-spot]').forEach((btn) => {
    btn.onclick = () => { callSpot = btn.dataset.spot as PitchLocation; render(); };
  });
  elControls.querySelectorAll<HTMLElement>('[data-arm]').forEach((row) => {
    row.onclick = () => {
      penPick = Number(row.dataset['arm']);
      render();
    };
  });
  const penBtnEl = elControls.querySelector<HTMLButtonElement>('[data-pen]');
  if (penBtnEl) penBtnEl.onclick = () => relieve();
  // ⚠️ ONE BUTTON, TWO PRESSES, ROUTED BY THE PHASE — the same button the
  // keyboard's SPACE is, and it has to be: a mouse player who could start the
  // arm but not let go of it would be handed a wild pitch every time.
  const throwBtn = elControls.querySelector<HTMLButtonElement>('[data-throw]');
  if (throwBtn) {
    throwBtn.onclick = () => {
      if (phase === 'calling') startDelivery();
      else if (phase === 'winding') release(performance.now());
    };
  }
}

/**
 * WHAT YOU HAVE THROWN THIS HITTER — the chart, under the throw button.
 *
 * Four columns, and the middle two are the pair that makes it worth drawing:
 * the call, and then whether the ball got there. `low away → away` is a pitch
 * that missed off the plate; `low away → middle` is the mistake pitch, and it
 * is the one you want to see written down after somebody has just hit it.
 *
 * ⚠️ THE RELEASE IS IN HERE FOR A REASON. It is the only place the two halves
 * of a pitch sit on one line: what you DID, and what it CAME TO. Painting one
 * and having it leak back over the plate anyway is the arm's command roll doing
 * its job, and a player who cannot see both numbers has no way to learn that.
 */
function chartPanel(): string {
  if (chart.length === 0) return '';
  const rows = chart
    .map((r, i) => {
      // ⚠️ TWO KINDS OF MISS, AND THE SECOND ONE IS INVISIBLE IN `actual`.
      // pitchToSpot() misses three ways: a middle call leaks to a corner, a
      // corner call leaks to the MIDDLE — the mistake pitch — and, most often
      // of all, a corner call stays on its corner and simply runs OFF THE
      // PLATE, which changes `inZone` and leaves `location` exactly where it
      // was. Comparing locations alone caught the first two and drew the third
      // as a pitch that hit its spot, so a painted corner that the umpire
      // called ball four read as the game cheating rather than as a miss.
      const miss =
        r.actual !== r.called
          ? ` <span style="color:var(--bad)">&rarr; ${SPOT_LABEL[r.actual]}</span>`
          : r.inZone
            ? ''
            : ` <span style="color:var(--bad)">&rarr; off the plate</span>`;
      const word = r.result || '…';
      const colour =
        r.result === 'ball' || r.result === 'hit batter'
          ? 'var(--bad)'
          : r.result === 'in play'
            ? 'var(--hot)'
            : r.result === ''
              ? 'var(--dim)'
              : 'var(--good)';
      // ⚠️ FOUR CHILDREN, FOUR COLUMNS. .penrow is a grid, so every element is
      // a cell — the call has to arrive as ONE span or the type and the spot
      // take a column each and the result is pushed onto a row of its own.
      return (
        `<div class="penrow"><span>${i + 1}</span>` +
        `<span><b>${TYPE_SHORT[r.type]}</b> <span class="dim">${SPOT_LABEL[r.called]}</span>${miss}</span>` +
        `<span class="dim">${RELEASE_SHORT[r.release]}</span>` +
        `<span style="color:${colour}">${word}</span></div>`
      );
    })
    .join('');
  return `<div class="pen chart"><div class="dim penhead">THIS AT-BAT</div>${rows}</div>`;
}

/**
 * The table, in the panel the scouting report usually has. Shown only when a
 * franchise game is final, because that is the only moment it is the thing
 * you want to look at — mid-game the scouting report is.
 */
function renderStandings(s: Season): void {
  const rows = standings(s).map((r, i) => {
    const line =
      // The seed number is the whole reason to look at the table late in the
      // year — fourth and fifth are one line apart and one is elimination.
      `${i < 4 ? i + 1 : ' '} ${r.abbr}  ${String(r.w).padStart(2)}-${String(r.l).padStart(2)}` +
      `  ${r.gb === 0 ? '  —' : r.gb.toFixed(1).padStart(3)}` +
      `  ${String(r.rf - r.ra > 0 ? '+' + (r.rf - r.ra) : r.rf - r.ra).padStart(4)}`;
    return r.abbr === s.you ? `<b>${line}</b>` : line;
  });
  const lines = ['<b>STANDINGS</b>', '       W -L   GB   DIFF', ...rows, ...bracketLines(s)];
  elBook.innerHTML =
    '<div style="white-space:pre">' + lines.join('\n') + '</div>';
}

/** The bracket, once there is one. Empty for the whole regular season. */
function bracketLines(s: Season): string[] {
  if (s.day < regularDays(s)) return [];

  // ⚠️ ONE LINE PER SERIES, NOT PER GAME. A best-of-seven bracket of eight
  // clubs is up to twenty-eight ball games, and printing them all would bury
  // the panel it shares with the standings. What a bracket is FOR is who is
  // beating whom, so each pairing gets its series score and its winner.
  const out: string[] = [];
  for (let r = 0; r < roundsOf(s); r++) {
    const pairs = matchupsInRound(s, r);
    if (!pairs.length) break;
    out.push(`<b>${roundName(s, r)}</b>`);
    for (const p of pairs) {
      const score = seriesOf(s) === 1 ? '' : ` ${p.homeWins}-${p.awayWins}`;
      const tail = p.winner ? ` — ${p.winner}` : '';
      out.push(`  ${p.home} v ${p.away}${score}${tail}`);
    }
  }
  return out.length ? ['', '<b>PLAYOFFS</b>', ...out] : [];
}

/**
 * The scouting report, shown to YOU — deliberately.
 *
 * The computer's read is not a secret mechanic. A hidden system that makes the
 * game harder is indistinguishable from the game cheating; a visible one is a
 * thing you can play against, which is the entire point of building it.
 */
/** One rating card: label, then the numbers, dimmed under average. */
function card(title: string, ratings: Record<string, number>): string {
  const cells = Object.entries(ratings)
    .map(([k, v]) => {
      const n = showScale(v);
      const colour = n >= 75 ? 'var(--hot)' : n < 45 ? 'var(--bad)' : 'var(--ink)';
      return `${k.slice(0, 3).toUpperCase()} <b style="color:${colour}">${n}</b>`;
    })
    .join(' &nbsp; ');
  return `<b>${title}</b><br>${cells}`;
}

function renderBook(): void {
  if (game.over && season) {
    renderStandings(season);
    return;
  }
  // THE RATINGS GO FIRST, above the scouting book. They are the thing that
  // decides the at-bat you are about to play; the book is what happens over
  // nine of them.
  const bat = currentBatter(game);
  const arm = currentPitcher(game);
  // Nobody is at the plate once it is final — currentBatter() still answers,
  // but it answers with the man who was due up, and a card for an at-bat that
  // never happened reads as a bug.
  const lines: string[] = game.over ? ['<b>WHAT THEY HAVE ON YOU</b>'] : [
    card(`AT THE PLATE — ${bat.name}`, {
      power: bat.power,
      contact: bat.contact,
      vision: bat.vision,
      clutch: bat.clutch,
      bunt: bat.bunt,
      speed: bat.speed,
    }),
    '',
    card(`ON THE MOUND — ${arm.name}`, ratingsOf(arm)),
    '',
    '<b>WHAT THEY HAVE ON YOU</b>',
  ];
  if (book.seen < 12) {
    lines.push('Still watching. Nothing yet.');
  } else {
    lines.push(`chase rate <b>${(chaseRate(book) * 100).toFixed(0)}%</b> &nbsp; swing rate <b>${(swingRate(book) * 100).toFixed(0)}%</b>`);
    if (hasTimingRead(book)) {
      const bias = timingBias(book);
      const word = bias < -12 ? 'OUT IN FRONT' : bias > 35 ? 'BEHIND IT' : 'on time';
      lines.push(`timing <b>${word}</b> (${bias > 0 ? '+' : ''}${bias.toFixed(0)}ms)`);
    }
    const weak = weakestPitch(book);
    if (weak) lines.push(`can't touch the <b>${weak}</b>`);
  }
  // Who is standing where, for the side in the field. The player needs this to
  // read an error as "you hid a bat at third" rather than as bad luck.
  const a = fieldingAlignment(game);
  lines.push('<br><b>IN THE FIELD</b>');
  lines.push(
    (['SS', 'CF', '2B', '3B', 'C', '1B'] as const)
      .map((p) => `${p} <b>${a[p]?.name ?? '—'}</b>`)
      .join('<br>'),
  );

  if (book.callsTotal >= 12) {
    const p = predictedCall(book, false);
    const p2 = predictedCall(book, true);
    lines.push('<br><b>WHAT THEY EXPECT YOU TO THROW</b>');
    lines.push(p ? `sitting <b>${p}</b>` : 'you are mixing it well');
    if (p2) lines.push(`two strikes: sitting <b>${p2}</b>`);
  }
  elBook.innerHTML = lines.join('<br>');
}

// -------------------------------------------------------------- the loop

/**
 * ⚠️ THE RE-QUEUE IS IN A `finally`, AND THAT IS THE WHOLE POINT.
 *
 * It used to be the last statement of step(), which meant any throw anywhere
 * under it skipped the re-queue and the loop simply stopped — a black, silent,
 * permanently frozen game with no message and nothing to press. That is how
 * one bad pitch call in ai.ts turned into "the game freezes in auto mode":
 * auto reaches a few hundred pitches a minute at 8x, so it found the throw
 * long before a person playing by hand would.
 *
 * There is no `catch`. The error still goes to the console exactly as before —
 * this does not hide a bug, it stops a bug from being fatal.
 */
function frame(): void {
  try {
    step();
  } finally {
    requestAnimationFrame(frame);
  }
}

function step(): void {
  const now = performance.now();

  if (replay && replayNow(now) - replay.startedAt > replayLength(replay)) replay = null;

  if (auto) autoStep();

  // ⚠️ THE ARM EMPTIES WHETHER YOU ASK IT TO OR NOT. A delivery with no exit is
  // a frozen game, and the tab this is played in gets switched away from — see
  // SANE_SAMPLE_MS in difficulty.ts for what a sleeping frame loop does to a
  // press. Letting go at the end of the sweep is a pitch that got away, which
  // is the honest outcome and not a free take. DELIVERY_MS is set to outlast
  // the widest late press that still grades; delivery.test.ts holds it there.
  if (phase === 'winding' && now >= deliveryAt + DELIVERY_MS) releaseAs('wild');

  if (phase === 'windup') {
    // THE COMPUTER’S BAT, whichever of the two of you it is hitting for: watch
    // mode taking your at-bat, or its own hitter facing a pitch you threw.
    //
    // ⚠️ DISARMED THE MOMENT IT FIRES, and that is a fix, not a tidy-up. This
    // lived in autoStep() and left autoSwingAt set, so the next frame called
    // swing() a second time — and a second press inside the check window is a
    // CHECK. Every computer swing was being pulled back into a take.
    if (autoSwingAt !== null && now >= autoSwingAt) {
      autoSwingAt = null;
      swing();
    }

    // The swing window closes a little after the ball arrives, so a very late
    // swing is still a swing rather than a take.
    // A committed swing resolves when the BARREL arrives, not when the ball
    // does — that is the frame the bat is drawn crossing the plate, and the
    // picture and the verdict have to be one event.
    const contact = contactAt();
    if (contact !== null ? now >= contact : now > arriveAt + 90 / flightScale()) {
      if (youBat()) resolvePitch();
      else resolveTheirSwing();
    }
  }

  if (phase === 'resolve' && now > flashUntil) {
    if (isOver(atBat)) finishAtBat();
    else phase = youBat() ? 'idle' : 'calling';
  }

  drawField(now);
  render();
}

// ------------------------------------------------------------- the pregame

/**
 * The frame loop re-queues itself forever, so it is started exactly once. A
 * second kickOff() — the next game of a season — must not start a second one,
 * or every clock in the file runs at double speed.
 */
let looping = false;

// --------------------------------------------------------- the pre-game card

/**
 * A FRANCHISE MOMENT, on the days moments.ts says there is one.
 *
 * ⚠️ IT REUSES #pre, THE PRE-GAME OVERLAY, rather than adding an element.
 * They are the same object at two moments — a full-screen thing you read and
 * then dismiss into a ball game — and game.html already styles that once for
 * both. A third overlay is a third copy of the same CSS block to drift.
 *
 * ⚠️ THE VALUE SHIFT IS SHOWN AFTER, NEVER BEFORE. Printing "-0.02" next to
 * each button turns a baseball decision into an arithmetic one, and the whole
 * design of moments.ts is that the trades are matched flat so there is no
 * arithmetic to do. Showing it afterwards is the receipt: it is how the player
 * learns the screen was telling the truth.
 */
function showMoment(s: Season, m: Moment, then: () => void): void {
  const el = document.getElementById('pre');
  if (!el) {
    // No overlay in the document. Skip the moment and play the game — a
    // missing panel must never be a season that cannot advance.
    then();
    return;
  }

  const buttons = m.choices
    .map(
      (c, i) =>
        `<button class="choice" data-pick="${i}"><b>${c.label}</b> <kbd>${i + 1}</kbd><br>` +
        `<span class="dim">${c.detail}</span></button>`,
    )
    .join('');

  // ⚠️ YOUR OWN CLUB, ON THIS SCREEN. Found by playing it: THE BENCH tells you
  // to "look at what your nine can actually do — the card lists it", and the
  // card is the NEXT screen. You cannot reach it without answering first, so
  // the one instruction the moment gives you was impossible to follow.
  //
  // It is the same four averages showPregame() prints, off the same scale, for
  // the same reason: hiring the running-game man is a good idea at 61 SPD and
  // a disaster at 44, and that number IS the decision. The deadline wants it
  // too — a trade that moves your shape is only legible against the shape you
  // already have.
  const you = teamOf(s, s.you);
  const avg = (pick: (p: Player) => number): number =>
    showScale(you.lineup.reduce((a, p) => a + pick(p), 0) / you.lineup.length);
  const record = standings(s).find((r) => r.abbr === s.you);
  const mine =
    `<div class="panel">` +
    `<div class="club">${you.abbr}</div>` +
    `<div class="dim">${you.name}${record ? ` · ${record.w}-${record.l}` : ''}</div>` +
    `<div style="margin-top:6px"><b style="color:var(--good)">${you.identity?.name ?? 'STEADY'}</b>` +
    `<span class="dim"> — ${you.identity?.blurb ?? ''}</span></div>` +
    `<div style="margin-top:6px" class="dim">lineup &nbsp; ` +
    `POW <b>${avg((p) => p.power)}</b> &nbsp; CON <b>${avg((p) => p.contact)}</b> &nbsp;` +
    ` VIS <b>${avg((p) => p.vision)}</b> &nbsp; SPD <b>${avg((p) => p.speed)}</b></div>` +
    `</div>`;

  el.innerHTML =
    `<div class="wrap">` +
    `<h1>${dayLabel(s)}</h1>` +
    `<h2>${m.headline}</h2>` +
    `<div class="panel">${m.body}</div>` +
    mine +
    `<div class="choices">${buttons}</div>` +
    `</div>`;
  el.style.display = 'flex';
  el.scrollTop = 0;

  const take = (i: number): void => {
    const after = decide(s, m, i);
    season = after;
    saveSeason(after);
    const shift = valueShift(s, after);
    // The receipt. Two decimals, signed, in the same units the card ranks by.
    say(
      `${m.headline}: ${m.choices[i]!.label}. Roster ${shift >= 0 ? '+' : ''}${shift.toFixed(2)}.`,
      'half',
    );
    el.style.display = 'none';
    el.innerHTML = '';
    removeEventListener('keydown', onKey);
    then();
  };

  el.querySelectorAll<HTMLButtonElement>('[data-pick]').forEach((btn) => {
    btn.onclick = () => take(Number(btn.dataset['pick']));
  });

  /**
   * ⚠️ NUMBER KEYS, because everything else in this game has them and this
   * screen did not — the pitch is 1-5, the spot is WASD, the card is SPACE,
   * and the one screen that asks you a QUESTION was mouse-only.
   *
   * ⚠️ NO SPACE AND NO ENTER, deliberately, which is the one place this screen
   * departs from the card. SPACE means "go" everywhere else, and a player who
   * has hammered it through nine pre-game cards would answer a trade offer
   * without reading it. There is no default here; you have to name a choice.
   *
   * Its own listener, removed on the way out — the main handler runs press(),
   * which drives a game that has not started yet.
   */
  function onKey(e: KeyboardEvent): void {
    const i = Number(e.key) - 1;
    if (Number.isInteger(i) && i >= 0 && i < m.choices.length) {
      e.preventDefault();
      take(i);
    }
  }
  addEventListener('keydown', onKey);
}

/**
 * YOUR BATTING ORDER, on the pre-game card — and it is yours to set.
 *
 * ⚠️ THE ORDER IS PURELY OFFENSIVE, WHICH IS WHY THIS IS SAFE. `Team.lineup` is
 * the batting order and nothing else: assignPositions() in defense.ts sorts the
 * same nine by glove to decide who plays where, independently, so moving your
 * best bat to the top cannot accidentally put him at shortstop. Nothing else in
 * the engine reads the order except whose turn it is to hit.
 *
 * ⚠️ IT WRITES TO THE SEASON'S OWN ROSTERS, not to LEAGUE. franchise.ts says
 * the season owns all thirty clubs and everything reads them through teamOf();
 * this is the first feature to actually take it up on that. Your order is part
 * of the save, it survives a reload, and it does not follow you into the next
 * franchise — which is right, because the next franchise is a new club.
 *
 * ponytail: yours only, and no bench. The other twenty-nine clubs bat in the
 * order teams.ts wrote them in, and they are not worse for it — the computer
 * cannot tell you why it moved somebody, so a lineup it shuffled would read as
 * noise. Give the CPU an order rule when a club identity wants one.
 */
/**
 * HOT or COLD beside a man's name, or nothing.
 *
 * ⚠️ IT READS THE SAME FUNCTION THE AT-BAT DOES. form.ts is what inForm()
 * applies to the club that walks out there, so a man tagged HOT here is
 * measurably better tonight — the tag is a readout, not flavour. A label drawn
 * off a second rule would be the game lying to the player about its own dice.
 */
function formTag(s: Season, name: string): string {
  const f = formOf(s.seed, s.day, name);
  const tag = formLabel(f);
  if (!tag) return '';
  return ` <b style="color:var(--${tag.hot ? 'good' : 'bad'})">${tag.text}</b>`;
}

function lineupPanel(s: Season): string {
  const you = teamOf(s, s.you);
  const book = s.stats;

  const rows = you.lineup
    .map((p, i) => {
      const on = i === lineupPick;
      const line = book?.bat[p.name];
      // His season, if there is one yet. Day one shows the ratings alone rather
      // than a column of .000s, which would read as nine men in a slump.
      const so_far = line && line.pa > 0
        ? `${rate(avg(line))} &middot; ${line.hr}HR ${line.rbi}RBI`
        : '';
      return (
        '<div class="penrow' + (on ? ' picked' : '') + '" data-lu="' + i + '" style="cursor:pointer">' +
        '<span>' + (on ? '&#9656; moving' : String(i + 1)) + '</span>' +
        '<b>' + p.name + formTag(s, p.name) + '</b>' +
        '<span class="dim">' + p.bats + 'H &middot; POW ' + showScale(p.power) +
        ' &middot; CON ' + showScale(p.contact) + ' &middot; VIS ' + showScale(p.vision) +
        ' &middot; SPD ' + showScale(p.speed) + '</span>' +
        '<span class="dim">' + so_far + '</span></div>'
      );
    })
    .join('');

  // ⚠️ THE BENCH IS IN THE SAME LIST AND THE SAME SWAP HANDLES IT. Clicking a
  // starter and then a bench man exchanges them, which is how a man gets INTO
  // the nine for a night — there is no second widget and no "promote" verb.
  // Both arrays live on the same Team in Season.rosters, so the exchange is one
  // edit to each and it is in the save.
  //
  // ⚠️ THIS IS THE ONLY PLACE THE BENCH CAN BE RESHUFFLED. Once the game starts,
  // pinchHit() writes into the GAME's copy only — a substitution is for tonight,
  // and a season whose roster quietly rearranged itself every ninth inning
  // would be an offseason nobody asked for.
  const benched = (you.bench ?? [])
    .map((p, i) => {
      const at = you.lineup.length + i;
      const on = at === lineupPick;
      const line = book?.bat[p.name];
      // ⚠️ NOT `s`. This used to shadow the Season with the man's batting line,
      // which was harmless while nothing in the row needed the season — and
      // stopped being harmless the moment formTag() did.
      const bat = statsOf(p);
      const so_far = line && line.pa > 0
        ? `${rate(avg(line))} &middot; ${line.hr}HR ${line.rbi}RBI`
        : '';
      return (
        '<div class="penrow' + (on ? ' picked' : '') + '" data-lu="' + at + '" style="cursor:pointer">' +
        '<span class="dim">' + (on ? '&#9656; moving' : bat.power >= 1.3 ? 'bat' : bat.speed >= 1.25 ? 'legs' : 'platoon') + '</span>' +
        '<b>' + p.name + formTag(s, p.name) + '</b>' +
        '<span class="dim">' + p.bats + 'H &middot; POW ' + showScale(bat.power) +
        ' &middot; CON ' + showScale(bat.contact) + ' &middot; VIS ' + showScale(bat.vision) +
        ' &middot; SPD ' + showScale(bat.speed) + '</span>' +
        '<span class="dim">' + so_far + '</span></div>'
      );
    })
    .join('');

  return (
    '<div class="panel lineup"><div class="dim penhead">YOUR LINEUP &mdash; CLICK TWO MEN TO SWAP THEM</div>' +
    rows +
    (benched
      ? '<div class="dim penhead" style="margin-top:12px">YOUR BENCH</div>' + benched
      : '') +
    '<div class="dim" style="font-size:10px;margin-top:6px">' +
    (lineupPick === null
      ? 'Slot one bats the most times. Swap a bench man with a starter to put him in the nine tonight. ' +
        'Nobody bats where he does because of his glove &mdash; that is worked out separately.'
      : 'Now click the man he changes places with.') +
    '</div></div>'
  );
}

/**
 * YOUR ROTATION, on the pre-game card.
 *
 * ⚠️ THIS PANEL IS THE FEATURE. Before it there was no choice to make: every
 * club started rotation[0] in every game it ever played, so a fourteen-game
 * season was one starter fourteen times and you met exactly seven opposing
 * arms all year. Three starters and a rest rule are only a rotation if
 * somebody picks, and this is where you pick.
 *
 * ⚠️ REST IS SHOWN AS STA, THE SAME NUMBER THE PEN PANEL SHOWS IN-GAME. Not a
 * separate "days rest" column — rest is spent as stamina and as nothing else
 * (see rotation.ts), so giving it its own quantity on screen would imply a
 * second mechanic that does not exist. The word beside it is the plain-English
 * reading: RESTED, WORKING, SHORT REST, SPENT.
 */
function rotationPanel(s: Season): string {
  const you = teamOf(s, s.you);
  const rows = you.rotation
    .map((arm, i) => {
      const fresh = restOf(s, s.you, arm.name);
      const sta = restedStamina(arm, fresh);
      const word =
        fresh >= 1 ? 'RESTED' : fresh >= 0.66 ? 'WORKING' : fresh > 0 ? 'SHORT REST' : 'SPENT';
      const colour = fresh >= 1 ? 'var(--good)' : fresh >= 0.66 ? 'var(--ink)' : 'var(--bad)';
      const on = i === myStarter;
      return (
        '<div class="penrow' + (on ? ' picked' : '') + '" data-sp="' + i + '" style="cursor:pointer">' +
        '<span>' + (on ? '&#9656; starting' : '') + '</span><b>' + arm.name + formTag(s, arm.name) + '</b>' +
        '<span class="dim">' + arm.throws + 'HP &middot; BRE ' + showScale(arm.break ?? 1) +
        ' &middot; STA ' + showScale(sta) + '</span>' +
        '<span style="color:' + colour + '">' + word + '</span></div>'
      );
    })
    .join('');
  // ⚠️ THE PEN IS ON THIS SCREEN TOO, and it is NOT pickable here. Who starts
  // is a decision you make before the first pitch; who relieves is one you make
  // in the seventh, with the score in front of you. What you need now is only
  // to know who is available — a closer who threw the last three nights is a
  // fact you want BEFORE you decide how long to leave your starter in.
  const pen = you.bullpen
    .map((arm) => {
      const fresh = penRestOf(s, s.you, arm.name);
      const legs = restedStamina(arm, fresh);
      const word =
        fresh >= 0.99 ? 'READY' : fresh >= 0.7 ? 'USED' : fresh >= 0.45 ? 'TIRED' : 'GASSED';
      const colour =
        fresh >= 0.99 ? 'var(--good)' : fresh >= 0.7 ? 'var(--ink)' : fresh >= 0.45 ? 'var(--hot)' : 'var(--bad)';
      return (
        '<div class="penrow"><span></span><b>' + arm.name + '</b>' +
        '<span class="dim">' + arm.throws + 'HP &middot; BRE ' + showScale(arm.break ?? 1) +
        ' &middot; STA ' + showScale(legs) + '</span>' +
        '<span style="color:' + colour + '">' + word + '</span></div>'
      );
    })
    .join('');

  return (
    '<div class="panel rotation"><div class="dim penhead">YOUR ROTATION &mdash; PICK A STARTER</div>' +
    rows +
    '<div class="dim" style="font-size:10px;margin-top:6px">' +
    'A start costs him a game and a half. Turn the three over and everybody is always whole.</div>' +
    '<div class="dim penhead" style="margin-top:12px">YOUR PEN &mdash; WHO IS AVAILABLE</div>' +
    pen +
    '<div class="dim" style="font-size:10px;margin-top:6px">' +
    'An outing costs a reliever most of a night and he refills slower than a starter. ' +
    'Use him every other day for ever; use him four nights running and there is nothing left.</div>' +
    '</div>'
  );
}

/**
 * THE CARD, shown before every franchise game.
 *
 * ⚠️ FRANCHISE ONLY, and that is not an omission. An exhibition has no
 * standings, no wire and no record — every panel below would be empty or a
 * lie, and a screen that shows you eight rows of 0-0 before a one-off game is
 * a loading screen with extra steps. You picked both clubs in an exhibition;
 * there is nothing here you do not already know.
 *
 * WHAT IT IS FOR. The season already simulated the other seven clubs' afternoon
 * — playDay() has done that since franchise mode existed — and the player never
 * saw any of it. They walked out of one game and straight into the next with a
 * standings table buried behind a finished-game screen. Everything on this
 * screen is state that was ALREADY BEING COMPUTED and never shown.
 *
 * ⚠️ ROSTER STRENGTH IS ON IT DELIBERATELY, top and centre on both clubs. The
 * league is no longer balanced — see value.ts — so who is better is now a real
 * fact about the night, and a player who cannot see it before the first pitch
 * has to infer it from fourteen games of results. It is also the number every
 * future roster move will be judged by, which is the other reason it wants a
 * home now rather than the day trades land.
 */
function showPregame(s: Season, m: Matchup): void {
  const el = document.getElementById('pre');
  if (!el) {
    // No overlay in the document: play the game rather than stranding them on
    // a blank screen. A missing panel must never be a locked season.
    kickOff(teamOf(s, m.home), teamOf(s, m.away), m.home === s.you ? 'home' : 'away');
    return;
  }

  // ⚠️ THE DEFAULT IS WHAT A MANAGER WOULD DO, NOT THE ACE.
  //
  // myStarter persists between games so the panel remembers what you clicked,
  // and if it were simply left alone a player who never opens the picker would
  // start rotation[0] every single game — which is EXACTLY the bug this whole
  // change exists to remove, reintroduced through the front door. So every
  // card re-seeds it from pickStarter(), the same call the computer makes for
  // its own clubs. Ignore the panel entirely and your rotation still turns
  // over properly; open it and you can overrule the man.
  const cardKey = `${s.you}:${s.day}`;
  if (starterSeededFor !== cardKey) {
    myStarter = starterFor(s, s.you).index;
    starterSeededFor = cardKey;
  }

  const table = standings(s);
  const recordOf = (abbr: string): Standing =>
    table.find((r) => r.abbr === abbr) ?? { abbr, w: 0, l: 0, rf: 0, ra: 0, hf: 0, gb: 0, value: 0 };
  // ⚠️ THE SEASON'S OWN CLUBS, NOT `LEAGUE`. This is the pool the rank on the
  // card is measured against — "THIN, 28 of 30" — and reading the module-level
  // league made that sentence describe a different competition than the one
  // being played. Resume a thirty-club franchise after importing a league of
  // six and every card read "0 of 6", the nought because your club was not in
  // the six at all and strengthRank() had nothing to find.
  const clubs = clubsIn(s).map((abbr: string) => teamOf(s, abbr));

  /** One club's half of the marquee. */
  const side = (abbr: string, where: string): string => {
    const t = teamOf(s, abbr);
    const r = recordOf(abbr);
    const rank = strengthRank(t, clubs);
    // ⚠️ NOT rotation[0]. The card has to name the man the game will actually
    // send out, or the screen and the first pitch disagree — and with a
    // rotation they no longer agree by default. Yours is your pick; theirs is
    // the same pickStarter() call the game itself will make.
    const at = abbr === s.you ? myStarter : starterFor(s, abbr).index;
    const arm = t.rotation[at] ?? t.rotation[0]!;
    // The lineup as one line of ratings — the club's averages, on the same
    // 20-99 scale the in-game namecards use, so the two never disagree.
    const avg = (pick: (p: Player) => number): number =>
      showScale(t.lineup.reduce((a, p) => a + pick(p), 0) / t.lineup.length);
    return (
      `<div class="panel">` +
      `<div class="club">${t.abbr}${abbr === s.you ? ' (you)' : ''}</div>` +
      `<div class="dim">${t.name} · ${where}</div>` +
      `<div style="margin-top:6px">${r.w}-${r.l} <span class="dim">` +
      `${r.rf} for, ${r.ra} against</span></div>` +
      `<div style="margin-top:6px"><b>${strengthLabel(rank, clubs.length)}</b> ` +
      `<span class="dim">${rank} of ${clubs.length} by roster · ${clubValue(t).toFixed(2)}</span></div>` +
      // HOW THEY PLAY, directly under how good they are. The two answer
      // different questions and the card has always only answered the first.
      `<div style="margin-top:6px"><b style="color:var(--good)">${t.identity?.name ?? 'STEADY'}</b>` +
      `<span class="dim"> — ${t.identity?.blurb ?? ''}</span></div>` +
      `<div style="margin-top:6px" class="dim">lineup &nbsp; ` +
      `POW <b>${avg((p) => p.power)}</b> &nbsp; CON <b>${avg((p) => p.contact)}</b> &nbsp;` +
      ` VIS <b>${avg((p) => p.vision)}</b> &nbsp; SPD <b>${avg((p) => p.speed)}</b></div>` +
      // ⚠️ THEIR STARTER'S FORM IS ON THE CARD TOO, not just yours. Who is hot
      // is the one thing on this screen that changes week to week, and hiding
      // the away half of it would make the tag read as a house advantage.
      `<div style="margin-top:6px">${arm.name}${formTag(s, arm.name)} <span class="dim">` +
      `(${arm.throws}HP, ${scoutingReport(arm).split(' · ').slice(1).join(' · ')})</span></div>` +
      `<div class="dim">${arm.blurb}</div>` +
      `</div>`
    );
  };

  // The rest of today's card. Nothing else on this screen tells you that the
  // club chasing you is playing the club at the bottom tonight.
  const elsewhere = gamesOn(s)
    .filter((g) => g.home !== m.home || g.away !== m.away)
    .map((g) => `${g.away} at ${g.home}`)
    .join(' &nbsp;·&nbsp; ');

  const rows = table
    .map((r) => {
      const you = r.abbr === s.you ? ' class="you"' : '';
      const playing = r.abbr === m.home || r.abbr === m.away ? '▸ ' : '';
      return (
        `<tr${you}><td class="team">${playing}${r.abbr}</td><td>${r.w}</td><td>${r.l}</td>` +
        `<td>${r.gb === 0 ? '—' : r.gb.toFixed(1)}</td><td>${r.rf}</td><td>${r.ra}</td>` +
        `<td>${r.hf}</td><td>${clubValue(teamOf(s, r.abbr)).toFixed(2)}</td></tr>`
      );
    })
    .join('');

  // The wire, newest first, most recent handful only. See franchise.ts — this
  // is where a trade or an injury will appear the day one exists.
  const wire = [...(s.news ?? [])]
    .reverse()
    .slice(0, 6)
    .map((n) => `<div class="${n.kind}">${n.text}</div>`)
    .join('');

  el.innerHTML =
    `<div class="wrap">` +
    `<h1>${dayLabel(s)}</h1>` +
    `<h2>${m.away} AT ${m.home}</h2>` +
    `<div class="vs">${side(m.away, 'away')}${side(m.home, 'home')}</div>` +
    (elsewhere ? `<div class="panel dim">also today &nbsp; ${elsewhere}</div>` : '') +
    `<div class="panel"><table class="line"><thead><tr>` +
    `<th></th><th>W</th><th>L</th><th>GB</th><th>RF</th><th>RA</th><th>H</th><th>ROSTER</th>` +
    `</tr></thead><tbody>${rows}</tbody></table></div>` +
    (wire ? `<div class="panel wire"><b>AROUND THE LEAGUE</b>${wire}</div>` : '') +
    lineupPanel(s) +
    rotationPanel(s) +
    `<button class="go" data-play="1">PLAY BALL <kbd>SPACE</kbd></button>` +
    `<button class="go" data-cal="1">THE SCHEDULE <kbd>C</kbd></button>` +
    `<button class="go" data-stats="1">LEAGUE LEADERS <kbd>L</kbd></button>` +
    `</div>`;
  el.style.display = 'flex';
  el.scrollTop = 0;

  /**
   * Redraw the whole card, and stay where the player was reading.
   *
   * ⚠️ THE SCROLL POSITION IS THE WHOLE REASON THIS EXISTS. showPregame() puts
   * the card back to the top, which is right when you arrive at it and wrong
   * every time you press something ON it: both pickers sit below the standings
   * table, so picking a starter — or the first of the two men you are swapping
   * — threw you back to the top of the page and you had to scroll down again to
   * make the second click. Restoring it here fixes both pickers at once,
   * because both of them redraw through this.
   */
  const redraw = (next: Season): void => {
    const at = el.scrollTop;
    showPregame(next, m);
    el.scrollTop = at;
  };

  /**
   * Hand the keyboard back. See onKey at the bottom — every door off this card
   * that is not go() has to take the card's listener down first, or the screen
   * it opens is sharing SPACE with a PLAY BALL button nobody can see.
   */
  const leaveCard = (): void => {
    removeEventListener('keydown', onKey);
  };

  /** Click one of this card's buttons. See onKey. */
  const press = (sel: string): void => el.querySelector<HTMLButtonElement>(sel)?.click();

  const bindRotation = (): void => {
    el.querySelectorAll<HTMLElement>('[data-sp]').forEach((row) => {
      row.onclick = () => {
        myStarter = Number(row.dataset['sp']);
        // The marquee names the starter too, so the whole card is redrawn
        // rather than just the picker — two places showing one fact.
        redraw(s);
      };
    });
    el.querySelectorAll<HTMLElement>('[data-lu]').forEach((row) => {
      row.onclick = () => swapInto(Number(row.dataset['lu']));
    });
    el.querySelector<HTMLButtonElement>('[data-stats]')!.onclick = () => {
      leaveCard();
      showStats(season ?? s, null, () => showPregame(season ?? s, m));
    };
    // ⚠️ THE CALENDAR LEAVES THIS CARD FOR GOOD IF YOU SKIP. Its `back` puts
    // you here again, but a day cell calls skipTo(), which advances the season
    // and re-enters through nextGame() — so the card you come back to is the
    // card for the day you jumped to, drawn fresh, not this closure.
    el.querySelector<HTMLButtonElement>('[data-cal]')!.onclick = () => {
      leaveCard();
      showCalendar(season ?? s, () => showPregame(season ?? s, m));
    };
  };

  /**
   * Pick a man up, or put the one you are holding down here.
   *
   * ⚠️ THE WHOLE CARD IS REDRAWN, and it is redrawn against the SAVED season
   * rather than the `s` this render closed over. go() captures the season it
   * was built with and hands those rosters to kickOff(), so re-rendering with
   * the old one would start the game with the order you had before the swap —
   * the screen would show the change and the first inning would not.
   */
  const swapInto = (i: number): void => {
    if (lineupPick === null) {
      lineupPick = i;
      redraw(s);
      return;
    }
    const at = lineupPick;
    lineupPick = null;
    if (at === i) {
      // Clicking the same man again puts him back down. A pick you cannot undo
      // is a trap on a touchscreen.
      redraw(s);
      return;
    }
    // ⚠️ ONE FLAT LIST, NINE STARTERS THEN THE BENCH. The panel numbers the
    // bench rows straight on from the lineup, so a swap is a swap whether it
    // is two starters, two bench men, or one of each — and "put him in the
    // nine" needs no rule of its own. Split back into the two arrays at the
    // end, because that is the shape a Team is.
    const you = teamOf(s, s.you);
    const all = [...you.lineup, ...(you.bench ?? [])];
    [all[at], all[i]] = [all[i]!, all[at]!];
    const after: Season = {
      ...s,
      rosters: {
        ...s.rosters,
        [s.you]: {
          ...you,
          lineup: all.slice(0, you.lineup.length),
          ...(you.bench ? { bench: all.slice(you.lineup.length) } : {}),
        },
      },
    };
    season = after;
    saveSeason(after);
    redraw(after);
  };
  bindRotation();

  const go = (): void => {
    el.style.display = 'none';
    el.innerHTML = '';
    removeEventListener('keydown', onKey);
    const youAre: Side = m.home === s.you ? 'home' : 'away';
    const them = youAre === 'home' ? m.away : m.home;
    // Your choice, and the computer's — resolved HERE so the man on the card
    // is the man who takes the ball.
    const mineP = armFor(s, s.you, myStarter);
    const theirsP = starterFor(s, them);
    // ⚠️ penLegs TRAVELS WITH THE STARTER. Dropping it here is invisible and
    // wrong in exactly one direction: the pre-game card reads the season and
    // showed two gassed relievers, the in-game pen panel reads the Staff and
    // showed them at their card rating, and the arm that came in was whole.
    // Both screens have to be looking at the same ledger.
    // ⚠️ IN TODAY'S FORM, both sides, exactly as playDay() sends out the other
    // fourteen games on the card. See form.ts: if the game you play read the
    // flat roster while the league's games read form, your club would be the
    // only one in it whose slumps never happened.
    kickOff(
      inForm(teamOf(s, m.home), s.seed, s.day, rulesOf(s).streak),
      inForm(teamOf(s, m.away), s.seed, s.day, rulesOf(s).streak),
      youAre,
      {
        [youAre]: { index: mineP.index, stamina: mineP.stamina, penLegs: mineP.penLegs },
        [them === m.home ? 'home' : 'away']: {
          index: theirsP.index,
          stamina: theirsP.stamina,
          penLegs: theirsP.penLegs,
        },
      } as { home?: StarterPick; away?: StarterPick },
    );
  };
  // ⚠️ Its own listener, removed on the way out. The main keydown handler runs
  // press(), which drives a game that has not started yet — routing SPACE
  // through it here would deliver a pitch behind the screen.
  //
  // ⚠️ AND IT HAS TO COME DOWN BEFORE ANOTHER SCREEN GOES UP, or the card is
  // still listening underneath it: SPACE on the calendar would close the
  // calendar AND throw the first pitch of a game the player did not ask to
  // start. leaveCard() is that, on its own, for the doors that are not go().
  function onKey(e: KeyboardEvent): void {
    const k = e.key.toLowerCase();
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      go();
      return;
    }
    // The two other doors off this card, both of which the buttons advertise.
    // Routed through the buttons rather than calling the two screens directly,
    // so the key and the click can never take different paths off this card —
    // the click is the one that remembers to hand the keyboard back.
    if (k === 'c' || k === 'l') {
      e.preventDefault();
      press(k === 'c' ? '[data-cal]' : '[data-stats]');
    }
  }
  addEventListener('keydown', onKey);
  el.querySelector<HTMLButtonElement>('[data-play]')!.onclick = () => go();
}

/**
 * THE CALENDAR — every day of your year, and the one control that makes a long
 * season possible: pick a day and everything before it is played without you.
 *
 * ⚠️ WHY THIS EXISTS. A fourteen-game year is a schedule you can simply play.
 * A hundred and sixty-two is not, and shipping the longer years without a way
 * past them would be a menu option that hands the player a chore. So the
 * calendar is not a view — it is the second half of the season-length feature,
 * and every cell in it is a button.
 *
 * ⚠️ IT JUMPS FORWARD ONLY. There is no rewinding a season — see simTo() — so
 * a played day is text and an unplayed one is a door. Clicking today plays
 * today, which is the same thing PLAY BALL does, and is there so the grid has
 * no dead cell in the middle of it.
 *
 * ponytail: a flat wrap of day cells, not a month grid with weekday columns
 * and empty leading squares. The season has no dates in it — day 1 is not a
 * Tuesday and nothing in the engine thinks otherwise — so a real calendar
 * would be six weeks of decoration around the only number that means anything.
 * Give it dates when there is something that CARES about dates, like a
 * day-of-week rest rule; what it grows then is a label per cell.
 */
function showCalendar(s: Season, back: () => void): void {
  const el = document.getElementById('pre');
  if (!el) return back();

  const n = regularDays(s);
  const mine = (m: Matchup): boolean => m.home === s.you || m.away === s.you;

  // Your results, by day. Playoff days are in here too — the grid runs to the
  // end of the bracket, not to the end of the schedule, because "sim to the
  // final" is the jump a knocked-out player wants.
  //
  // ⚠️ INDEXED ONCE, not filtered per cell. resultsOn() walks every result in
  // the season, and a hundred and sixty-four cells each walking two and a half
  // thousand results is the same answer computed four hundred thousand times.
  const yours = new Map<number, Result>();
  for (const r of s.results) if (mine(r)) yours.set(r.day, r);

  const cell = (day: number): string => {
    // ⚠️ THE PLAYOFF CELLS ARE NAMED FOR THEIR ROUND, NOT NUMBERED ON FROM THE
    // SCHEDULE. "163" means nothing beside "SF 2"; and with a bracket of eight
    // and a best-of-seven there are twenty-one playoff days to tell apart.
    const label =
      day < n
        ? String(day + 1)
        : shortRound(s, roundOn(s, day)) + (seriesOf(s) > 1 ? ` ${gameInRound(s, day) + 1}` : '');
    const m = gamesOn(s, day).find(mine);
    const r = yours.get(day);

    // ---- Behind you. Either a result to read, or a day you sat out.
    if (day < s.day) {
      if (!r) {
        return (
          `<div class="cal off"><span class="calday">${label}</span>` +
          `<span class="dim">—</span></div>`
        );
      }
      const home = r.home === s.you;
      const [us, them] = home ? [r.hr, r.ar] : [r.ar, r.hr];
      const won = us > them;
      return (
        `<div class="cal done"><span class="calday">${label}</span>` +
        `<span class="dim">${home ? 'vs' : 'at'} ${home ? r.away : r.home}</span>` +
        `<span class="${won ? 'w' : 'l'}">${won ? 'W' : 'L'} ${us}-${them}</span></div>`
      );
    }

    // ---- Ahead of you, so it is a door whatever is in it. A playoff day with
    // no opponent yet is STILL a door, and it is the most useful one on the
    // screen: "sim the rest of the year" is a click on the semifinal. Naming
    // an opponent there would be a lie — see the note in gamesOn().
    const today = day === s.day;
    const who = m
      ? `${m.home === s.you ? 'vs' : 'at'} ${m.home === s.you ? m.away : m.home}`
      : day >= n
        ? 'bracket'
        : 'not you';
    return (
      `<button class="cal${today ? ' now' : ''}" data-day="${day}">` +
      `<span class="calday">${label}</span>` +
      `<span class="${m ? '' : 'dim'}">${who}</span>` +
      `<span class="dim">${today && m ? 'play' : 'sim to here'}</span></button>`
    );
  };

  const days: string[] = [];
  for (let d = 0; d < seasonEnd(s); d++) days.push(cell(d));

  const table = standings(s);
  const me = table.find((r) => r.abbr === s.you);
  const played = s.results.filter((r) => mine(r) && r.day < n).length;

  el.innerHTML =
    `<div class="wrap">` +
    `<h1>${dayLabel(s)}</h1>` +
    `<h2>${s.you} — THE SCHEDULE</h2>` +
    `<div class="panel dim">` +
    `${me ? `<b>${me.w}-${me.l}</b>, ` : ''}${played} of ${n} played. ` +
    `Pick a day and the ones before it are played for you — your club included.` +
    `</div>` +
    `<div class="calgrid">${days.join('')}</div>` +
    `<button class="go" data-back="1">BACK TO THE CARD <kbd>SPACE</kbd></button>` +
    `</div>`;
  el.style.display = 'flex';
  el.scrollTop = 0;

  const leave = (): void => {
    el.style.display = 'none';
    el.innerHTML = '';
    removeEventListener('keydown', onKey);
  };
  function onKey(e: KeyboardEvent): void {
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      leave();
      back();
    }
  }
  addEventListener('keydown', onKey);
  el.querySelector<HTMLButtonElement>('[data-back]')!.onclick = () => {
    leave();
    back();
  };

  el.querySelectorAll<HTMLElement>('[data-day]').forEach((b) => {
    b.onclick = () => {
      leave();
      skipTo(Number(b.dataset['day']));
    };
  });
}

/** A round's name in two or three characters, for a calendar cell. */
const shortRound = (s: Season, round: number): string => {
  const left = roundsOf(s) - round;
  return left <= 1 ? 'F' : left === 2 ? 'SF' : `R${2 ** left}`;
};

/**
 * Play everything up to a day, then arrive at it.
 *
 * ⚠️ THE MOMENT GATE IS WHY THIS IS NOT ONE LINE. simTo() halts on a day a
 * franchise moment would fire on, WITHOUT playing it — see franchise.ts — so a
 * jump from day two to day ninety stops at the trade deadline and hands the
 * player the question. nextGame() then does what it always does: shows the
 * moment, then the card. Which means a skip lands you either on the day you
 * asked for or on a decision, and never past one.
 *
 * ⚠️ AND IT PAINTS BEFORE IT WORKS. A day of a thirty-club league is fifteen
 * whole ball games and costs about a tenth of a second; a jump across a
 * hundred and sixty of them is the better part of twenty seconds of blocked
 * main thread. Measured, not guessed: thirty-nine days took 4.3s in Chrome.
 * Without a frame in between, the tab simply stops responding on the click and
 * every player's first thought is that it crashed.
 *
 * ⚠️ A TIMER, NOT requestAnimationFrame, AND THAT IS A BUG FIX RATHER THAN A
 * PREFERENCE. This first used the two-frame rAF idiom — the standard way to run
 * something strictly after a paint. Chrome DOES NOT FIRE rAF IN A BACKGROUND
 * TAB, and a hundred-and-thirty-day skip is precisely when a person tabs away:
 * they click it BECAUSE it is going to take half a minute. Caught in the
 * browser with document.hidden true and the callback never arriving — the
 * screen sat on "PLAYING 132 DAYS" for ever, the season frozen mid-jump, and
 * coming back to the tab was the only thing that would restart it. A timer
 * fires either way. Yielding to a macrotask is enough of a gap for the browser
 * to paint the note first when it IS visible, which is all the rAF was buying.
 *
 * ponytail: a note and a timer, not a web worker and a progress bar. The work
 * is one synchronous call into a pure function, and moving it off the main
 * thread means shipping the engine, the league and the whole season across a
 * structured clone to save a wait nobody does twice a game.
 */
function skipTo(day: number): void {
  if (!season) return;
  const el = document.getElementById('pre');
  const days = day - season.day;

  const work = (): void => {
    season = simTo(season!, day, (at) => momentOn(at) !== null);
    saveSeason(season);
    if (el) {
      el.style.display = 'none';
      el.innerHTML = '';
    }
    nextGame();
  };

  // A jump of a day or three is over before a frame lands. Telling the player
  // to wait for something that already happened is its own kind of broken.
  if (!el || days <= 3) return work();

  el.innerHTML =
    `<div class="wrap"><h1>${dayLabel(season)}</h1>` +
    `<h2>PLAYING ${days} DAYS</h2>` +
    `<div class="panel dim">The rest of the league is on the field. ` +
    `${days * (gamesOn(season).length || 15)} ball games — this takes a moment.</div></div>`;
  el.style.display = 'flex';
  setTimeout(work, 32);
}

/**
 * THE NUMBERS — last night's box score, the league's leaders, and your club's
 * year. Same overlay as the card, because it is the same moment: something to
 * read between two ball games.
 *
 * ⚠️ ONE SCREEN, TWO DOORS. It is reached from the finished-game controls with
 * a box score in hand, and from the pre-game card with none — and in both cases
 * `back` is what the button at the bottom does. A separate screen per door
 * would be the same three tables written twice, and the second copy is where
 * the columns stop agreeing.
 *
 * ⚠️ THE BOX SCORE IS NOT SAVED ANYWHERE. It is read straight off the GameState
 * of the game that just ended and it is gone when you leave. Keeping fourteen
 * of them would be weight in the save to re-show a game the player watched;
 * everything that has to survive the night is already in `Season.stats`.
 */
function showStats(s: Season, box: StatBook | null, back: () => void): void {
  const el = document.getElementById('pre');
  if (!el) return back();

  const head = (cols: string[]): string =>
    `<thead><tr><th></th>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead>`;

  // ⚠️ THE COUNTING COLUMNS AND THE RATE COLUMNS COME FROM DIFFERENT BOOKS in a
  // box score, and that is how a box score has always read: "2 for 4, and he is
  // hitting .312" — the game on the left, the season on the right. Passing the
  // season book in is what makes the last two columns mean something; without
  // it AVG in a box score is just the same four numbers divided, which tells
  // you nothing you cannot see two columns to the left.
  const batRows = (rows: { name: string; line: BatLine }[], rates?: StatBook): string =>
    rows
      .map((r) => {
        const year = rates?.bat[r.name] ?? r.line;
        return (
          `<tr><td class="team">${r.name}</td>` +
          `<td>${r.line.ab}</td><td>${r.line.h}</td><td>${r.line.d}</td><td>${r.line.t}</td>` +
          `<td>${r.line.hr}</td><td>${r.line.rbi}</td><td>${r.line.bb}</td><td>${r.line.k}</td>` +
          `<td class="tot">${rate(avg(year))}</td><td>${rate(ops(year))}</td></tr>`
        );
      })
      .join('');

  const armRows = (rows: { name: string; line: ArmLine }[], decisions: boolean): string =>
    rows
      .map((r) => {
        // In a box score the decision is a letter beside the name; over a season
        // it is a record, and W-L is the column everyone reads first.
        const mark = r.line.w ? ' <b style="color:var(--good)">W</b>' : r.line.l ? ' <b style="color:var(--bad)">L</b>' : '';
        return (
          `<tr><td class="team">${r.name}${decisions ? '' : mark}</td>` +
          (decisions ? `<td>${r.line.w}-${r.line.l}</td>` : '') +
          `<td>${ip(r.line.outs)}</td><td>${r.line.h}</td><td>${r.line.r}</td><td>${r.line.er}</td>` +
          `<td>${r.line.bb}</td><td>${r.line.k}</td>` +
          `<td class="tot">${era(r.line).toFixed(2)}</td><td>${whip(r.line).toFixed(2)}</td></tr>`
        );
      })
      .join('');

  const panel = (title: string, table: string): string =>
    `<div class="panel"><div class="dim penhead">${title}</div>` +
    `<div style="overflow-x:auto"><table class="line">${table}</table></div></div>`;

  const BAT = ['AB', 'H', '2B', '3B', 'HR', 'RBI', 'BB', 'K', 'AVG', 'OPS'];
  const ARM = ['IP', 'H', 'R', 'ER', 'BB', 'K', 'ERA', 'WHIP'];

  // ---- last night, if there is a last night. Both clubs, one panel each,
  // in the order they batted: the visitors hit first and their line goes first.
  const clubs = (b: StatBook): string[] => [
    ...new Set(Object.values(b.bat).map((l) => l.tm)),
  ];
  const boxPanels = box
    ? clubs(box)
        .map((abbr) => {
          const bats = Object.entries(box.bat)
            .filter(([, l]) => l.tm === abbr)
            .map(([name, line]) => ({ name, line }));
          const arms = Object.entries(box.arm)
            .filter(([, l]) => l.tm === abbr)
            .map(([name, line]) => ({ name, line }));
          return (
            panel(
              `${teamOf(s, abbr).name.toUpperCase()} — BATTING`,
              // The rates are the season's, not the night's. See batRows().
              head(BAT) + `<tbody>${batRows(bats, s.stats)}</tbody>`,
            ) + panel(`${abbr} — PITCHING`, head(ARM) + `<tbody>${armRows(arms, false)}</tbody>`)
          );
        })
        .join('')
    : '';

  // ---- the league. Six short lists rather than one long table: nobody reads a
  // four-hundred-row sort, and the question is always "who is leading".
  //
  // ⚠️ EVERY ROW CARRIES ITS PLAYING TIME, and that is not decoration. ".577"
  // and "0.00" are different claims over 26 at-bats and over 300, and in a
  // fourteen-game season they are ALWAYS over the small number — a board that
  // prints the rate alone is asking the player to trust a sample he cannot see.
  const book = s.stats;
  const board = (
    title: string,
    rows: { name: string; line: { tm: string } }[],
    over: (l: never) => string,
    val: (l: never) => string,
  ): string =>
    `<div class="panel" style="flex:1 1 200px"><div class="dim penhead">${title}</div>` +
    (rows.length === 0
      ? '<div class="dim">nothing yet</div>'
      : rows
          .map(
            (r) =>
              `<div class="penrow" style="grid-template-columns:1fr auto auto"><b>${r.name}` +
              ` <span class="dim">${r.line.tm}</span></b>` +
              `<span class="dim" style="font-size:10px">${over(r.line as never)}</span>` +
              `<span class="tot">${val(r.line as never)}</span></div>`,
          )
          .join('')) +
    '</div>';

  const AB = (l: BatLine): string => `${l.ab}ab`;
  const IP = (l: ArmLine): string => `${ip(l.outs)}ip`;
  const leaderBoards = book
    ? '<div class="vs">' +
      board('BATTING AVERAGE', leaders(book.bat, avg, (l) => l.pa, 5), AB, (l: BatLine) => rate(avg(l))) +
      board('HOME RUNS', leaders(book.bat, (l) => l.hr, (l) => l.pa, 5), AB, (l: BatLine) => String(l.hr)) +
      board('RUNS BATTED IN', leaders(book.bat, (l) => l.rbi, (l) => l.pa, 5), AB, (l: BatLine) => String(l.rbi)) +
      '</div><div class="vs">' +
      board('EARNED RUN AVERAGE', leaders(book.arm, era, (l) => l.outs, 5, true), IP, (l: ArmLine) => era(l).toFixed(2)) +
      board('STRIKEOUTS', leaders(book.arm, (l) => l.k, (l) => l.outs, 5), IP, (l: ArmLine) => String(l.k)) +
      board('WINS', leaders(book.arm, (l) => l.w, (l) => l.outs, 5), IP, (l: ArmLine) => `${l.w}-${l.l}`) +
      '</div>'
    : '';

  // ---- and your own club, everybody, in the order they bat. This is the one
  // list where a man hitting .180 matters as much as the league leader does:
  // he is in YOUR lineup and you can move him. See lineupPanel().
  const you = teamOf(s, s.you);
  const mine = book
    ? panel(
        `${you.name.toUpperCase()} — THE YEAR SO FAR`,
        head(BAT) + `<tbody>${batRows(clubBatting(book, you.lineup.map((p) => p.name)))}</tbody>`,
      ) +
      panel(
        `${you.abbr} — STAFF`,
        head(['W-L', ...ARM]) +
          `<tbody>${armRows(
            clubArms(book, [...you.rotation, ...you.bullpen].map((p) => p.name)),
            true,
          )}</tbody>`,
      )
    : '<div class="panel dim">No games played yet.</div>';

  // ⚠️ A BOX SCORE IS LABELLED WITH THE NIGHT IT IS OF, WHICH IS YESTERDAY.
  // finalize() has already handed the result to playDay(), and playDay advances
  // the cursor — so `s.day` on this screen is the game you are about to play
  // and the box score of the one you just finished was headed "GAME 8 OF 28"
  // while being the box score of game seven. The leaders screen is opened from
  // the card and is about today; the box is only ever opened from the final.
  const on = box ? s.day - 1 : s.day;
  el.innerHTML =
    `<div class="wrap">` +
    `<h1>${dayLabel(s, on)}</h1>` +
    `<h2>${box ? 'FINAL — THE BOX SCORE' : 'LEAGUE LEADERS'}</h2>` +
    boxPanels +
    leaderBoards +
    mine +
    `<button class="go" data-back="1">${box ? 'ON TO THE NEXT ONE' : 'BACK TO THE CARD'} <kbd>SPACE</kbd></button>` +
    `</div>`;
  el.style.display = 'flex';
  el.scrollTop = 0;

  const leave = (): void => {
    el.style.display = 'none';
    el.innerHTML = '';
    removeEventListener('keydown', onKey);
    back();
  };
  // Its own listener, removed on the way out — same reason as the card's.
  function onKey(e: KeyboardEvent): void {
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      leave();
    }
  }
  addEventListener('keydown', onKey);
  el.querySelector<HTMLButtonElement>('[data-back]')!.onclick = () => leave();
}

/**
 * THE RECORD BOOK — every season you have finished, and the best any of your
 * men has ever had. Same overlay again; see showStats().
 *
 * ⚠️ IT IS REACHABLE FROM THE TITLE SCREEN, which is the only place it can
 * usefully live: the book is about seasons that are OVER, and the one moment
 * you want it is when you are deciding whether to start another. `back` is what
 * the button at the bottom does, so the same screen serves the title screen and
 * the end of a franchise.
 */
function showCareer(back: () => void): void {
  const el = document.getElementById('pre');
  if (!el) return back();

  const c = loadCareer();
  const t = totals(c);
  const best = bestYear(c);

  const line = (label: string, value: string): string =>
    `<div class="penrow" style="grid-template-columns:1fr auto">` +
    `<span class="dim">${label}</span><b>${value}</b></div>`;

  const summary =
    `<div class="panel">` +
    `<div class="dim penhead">THE CAREER</div>` +
    line('seasons managed', String(t.seasons)) +
    line('record', `${t.w}-${t.l} · ${rate(winPct(t))}`) +
    line('championships', String(t.titles)) +
    line('clubs run', t.clubs.length ? t.clubs.join(' · ') : '—') +
    line('longest barrel streak', String(streak.best)) +
    (best
      ? line(
          'best year',
          `${best.club} ${best.w}-${best.l}` + (best.champion === best.club ? ' — CHAMPIONS' : ''),
        )
      : '') +
    `</div>`;

  const marks = records(c);
  const recordPanel = marks.length
    ? `<div class="panel"><div class="dim penhead">SINGLE-SEASON RECORDS</div>` +
      marks
        .map(
          (r) =>
            `<div class="penrow" style="grid-template-columns:150px 1fr auto">` +
            `<span class="dim">${r.label}</span><b>${r.name} <span class="dim">${r.club}</span></b>` +
            `<span class="tot">${r.value}</span></div>`,
        )
        .join('') +
      `</div>`
    : '';

  // Newest first — the season you just finished is the one you came here to see.
  const rows = [...c.years]
    .reverse()
    .map((y, i) => {
      const won = y.champion === y.club;
      return (
        `<tr${won ? ' class="you"' : ''}><td class="team">${c.years.length - i}. ${y.club}` +
        // ⚠️ THE LENGTH OF THE YEAR IS A COLUMN. A 9-5 and a 96-66 stacked in
        // one table with no games column read as one scale and are not.
        `${won ? ' ★' : ''}</td><td class="dim">${y.games ?? DEFAULT_GAMES}</td>` +
        `<td>${y.w}</td><td>${y.l}</td><td>${y.finish}</td>` +
        `<td>${y.champion}</td>` +
        `<td class="team">${y.bat ? `${y.bat.name} ${rate(y.bat.avg)}` : '—'}</td>` +
        `<td class="team">${y.arm ? `${y.arm.name} ${y.arm.era.toFixed(2)}` : '—'}</td></tr>`
      );
    })
    .join('');

  const table = c.years.length
    ? `<div class="panel"><div class="dim penhead">EVERY SEASON</div>` +
      `<div style="overflow-x:auto"><table class="line"><thead><tr>` +
      `<th></th><th>G</th><th>W</th><th>L</th><th>FIN</th><th>CHAMP</th>` +
      `<th>BEST BAT</th><th>BEST ARM</th>` +
      `</tr></thead><tbody>${rows}</tbody></table></div></div>`
    : `<div class="panel dim">Nothing in the book yet. Finish a franchise and it lands here.</div>`;

  el.innerHTML =
    `<div class="wrap"><h1>ALL-STAR BASEBALL</h1><h2>THE RECORD BOOK</h2>` +
    summary +
    recordPanel +
    table +
    `<button class="go" data-back="1">BACK <kbd>SPACE</kbd></button></div>`;
  el.style.display = 'flex';
  el.scrollTop = 0;

  const leave = (): void => {
    el.style.display = 'none';
    el.innerHTML = '';
    removeEventListener('keydown', onKey);
    back();
  };
  function onKey(e: KeyboardEvent): void {
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      leave();
    }
  }
  addEventListener('keydown', onKey);
  el.querySelector<HTMLButtonElement>('[data-back]')!.onclick = () => leave();
}

/**
 * The year is over — put it in the book.
 *
 * ⚠️ CALLED FROM BOTH ENDINGS, and it has to be. A season finishes two ways:
 * you play the final (finalize()), or you were knocked out and the bracket
 * played itself out in front of you (nextGame()). Filing from only the first
 * would mean a career that remembers exclusively the years you reached the
 * final, which is the opposite of a record.
 *
 * file() is idempotent on the season's seed, so calling it from both — and
 * again on a reload of a finished save — files the year once.
 */
function retire(s: Season): void {
  saveCareer(file(loadCareer(), s));
}

/** Start a ball game. `you` is which dugout is yours; away hits first. */
function kickOff(
  home: Team,
  away: Team,
  you: Side,
  starters?: { home?: StarterPick; away?: StarterPick },
): void {
  YOU = you;
  game = newGame(home, away, 9, starters);
  penPick = 0;
  atBat = newAtBat();
  bunting = false;
  previous = [];
  replay = null;
  flash = '';
  lastGrade = '';
  autoSwingAt = null;
  chart = [];
  releaseGrade = null;

  const mine = you === 'home' ? home : away;
  const theirs = you === 'home' ? away : home;
  say(`${away.name} at ${home.name} — nine innings.`, 'half');
  say(
    `You are ${mine.name} against ${theirs.name}. ` +
      (you === 'home' ? 'At home, so you pitch first.' : 'On the road, so you hit first.'),
    'half',
  );

  elTitle.textContent = season
    ? `ALL-STAR BASEBALL — ${season.you} FRANCHISE · ${dayLabel(season)}`
    : 'ALL-STAR BASEBALL — EXHIBITION';
  phase = youBat() ? 'idle' : 'calling';
  elBanner.textContent = '';
  render();
  if (!looping) {
    looping = true;
    requestAnimationFrame(frame);
  }
}

/**
 * The next game on your schedule — or, if you are not on the card, the rest of
 * the season.
 *
 * THE LOOP IS THE ELIMINATED CASE. Miss the bracket and days 15 and 16 have no
 * game with your name on them; lose the semifinal and the final still has to
 * be decided. Either way those days play themselves and you land on a screen
 * that names a champion, rather than on a season with no ending.
 *
 * ponytail: the scouting book carries over from game to game and is never
 * reset. That is a season-long read on you rather than a per-game one, which
 * is the more interesting version and costs a line of nothing.
 */
/**
 * The finished game's box score, over the top of the finished game.
 *
 * ⚠️ IT DOES NOT ADVANCE THE SEASON. Closing it puts you back on the final
 * screen exactly as you left it, with Next game still there — the box score is
 * something to read, not a step in the schedule, and a screen that quietly ate
 * your click on the way past would be worse than no screen.
 */
function showBox(): void {
  if (!season) return;
  showStats(season, boxScore(game), () => render());
}

function nextGame(): void {
  let s = season;
  if (!s) return;

  while (!seasonOver(s) && !yourGame(s)) s = playDay(s);
  season = s;
  saveSeason(s);

  const m = yourGame(s);
  if (!m) {
    const champ = champion(s);
    if (champ) {
      elBanner.textContent =
        champ === s.you ? `${champ} WIN IT ALL.` : `${champ} TAKE THE TITLE.`;
      say(`${champ} are champions.`, 'big');
      // ⚠️ THE ELIMINATED ENDING FILES THE YEAR TOO. This is the branch a
      // player who missed the bracket lands on, and it is most of them.
      retire(s);
      say('Your year is in the record book — press K.', 'half');
    }
    // No kickOff, so nothing else will redraw the panels. Stay on the final
    // screen; it now shows the finished bracket.
    render();
    return;
  }

  // ⚠️ THE MOMENT COMES BEFORE THE CARD, and that ordering is the feature.
  // A trade made on the deadline has to be on the pre-game card that follows
  // it — you should see the man you just acquired in the lineup you are about
  // to send out. Showing the card first and asking afterwards would put the
  // decision behind the game it was supposed to change.
  const ask = momentOn(s);
  if (ask) {
    showMoment(s, ask, () => showPregame(season ?? s, m));
    return;
  }

  // The card. It is the one place the season's own simulation — the other
  // clubs' afternoon, the table, the wire — is ever shown.
  showPregame(s, m);
}

/**
 * The title screen: mode, then (franchise only) how long the year is, then
 * club, then (exhibition only) opponent. One overlay that is removed once there
 * is a game to start.
 *
 * ponytail: still no back button and still no phase enum — `mode`, `len` and
 * `mine` being null IS the state, and a four-click form does not need more
 * than three nullable locals.
 *
 * ⚠️ THE LENGTH IS ASKED BEFORE THE CLUB, and that order is the point. It is
 * the only question on this screen that cannot be changed afterwards — the
 * schedule is laid down at kickoff and a season cannot be lengthened mid-year
 * without invalidating every standing in it — so it goes where a question you
 * only get one shot at goes, which is first.
 */
function pregame(): void {
  const el = document.getElementById('start')!;
  const prompt = el.querySelector('h2')!;
  const grid = el.querySelector('.keys')!;
  const levels = el.querySelector('.levels');
  const saved = loadSeason();

  let mode: 'exhibition' | 'franchise' | 'league' | null = null;
  let mine: Team | null = null;
  /** What the league screen last had to say — a refusal, or a confirmation. */
  let leagueSays: readonly string[] = [];
  /**
   * What is in the league screen's box, held here so a redraw does not throw
   * away a paste somebody has just made. Seeded with the stored text when that
   * text is the thing that is broken — the fix belongs in front of them.
   */
  let box = leagueStatus() === 'broken' ? (storedLeagueText() ?? '') : '';

  /**
   * ⚠️ EVERY PIECE OF THIS SCREEN IS SOMEBODY ELSE'S TEXT. A club name, a bio,
   * a parser's complaint about a paste — all of it is written by whoever is
   * holding the keyboard and all of it is going into innerHTML, which is the
   * one place in this file where that is true. A `<` in a bio would otherwise
   * eat the rest of the panel.
   */
  const escapeText = (s: string): string =>
    s.replace(/[&<>"]/g, (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' }[c]};`);
  /** What this franchise will play under, edited in place by the rules screen. */
  let rules: Rules = { ...DEFAULT_RULES };
  /** Whether the player has pressed START on that screen. */
  let ruled = false;

  const card = (go: string, title: string, sub: string): string =>
    `<button data-go="${go}"><b>${title}</b><br>${sub}</button>`;

  /**
   * A SETTING AS A DIAL — ◀ VALUE ▶, the control every baseball game since RBI
   * has put its options behind.
   *
   * ⚠️ IT REPLACED SIX ROWS OF BUTTONS, and the reason is legibility rather
   * than taste. Every setting drew its whole list at once, so the franchise
   * screen was twenty-two buttons in which exactly six were lit — you had to
   * hunt for the highlight in each row to find out what you had chosen. A dial
   * shows the ANSWER, at size, and hides the alternatives behind two arrows
   * that are always in the same place.
   *
   * The pips underneath are the one thing the old grid did better: with the
   * list hidden you cannot see that a setting has four positions and you are on
   * the second. Four marks under the value put that back for nothing.
   *
   * `step` is what the click handler switches on; the arrows carry the
   * direction. Both ends wrap, so a dial can never be a dead end.
   */
  const dial = (
    step: string,
    title: string,
    options: readonly { name: string; blurb: string }[],
    at: number,
  ): string => {
    const cur = options[at] ?? options[0];
    if (!cur) return '';
    // One option is not a choice: the arrows stay, greyed, so the row does not
    // change shape between a four-club league and a thirty-club one.
    const dead = options.length > 1 ? '' : ' disabled';
    return (
      `<div class="dial"><div class="dialhead">${title}</div><div class="dialbody">` +
      `<button class="arrow" data-step="${step}" data-by="-1"${dead}>&#9664;</button>` +
      `<div class="dialval"><b>${escapeText(cur.name)}</b>` +
      `<span>${escapeText(cur.blurb)}</span></div>` +
      `<button class="arrow" data-step="${step}" data-by="1"${dead}>&#9654;</button>` +
      `</div><div class="pips">` +
      options.map((_, i) => `<i class="${i === at ? 'on' : ''}"></i>`).join('') +
      `</div></div>`
    );
  };

  /**
   * THE FRANCHISE SETTINGS, as one list rather than six hand-written rows.
   *
   * Built fresh on every draw because the bracket's options depend on how many
   * clubs the league has — see the note on the filter — and a list captured
   * once would go stale the moment somebody imported a smaller league.
   */
  interface Row {
    key: keyof Rules;
    title: string;
    choices: readonly { value: number; name: string; blurb: string }[];
  }
  const rowsOf = (): readonly Row[] => [
    {
      key: 'games',
      title: 'HOW LONG IS THE SEASON',
      choices: LENGTHS.map((l) => ({ value: l.games, name: `${l.games} GAMES`, blurb: l.blurb })),
    },
    { key: 'parity', title: 'HOW MUCH DOES TALENT DECIDE GAMES', choices: PARITY },
    { key: 'streak', title: 'DO MEN RUN HOT AND COLD', choices: STREAK },
    { key: 'offence', title: 'HOW MANY RUNS A NIGHT', choices: OFFENCE },
    {
      // ⚠️ ONLY THE BRACKETS THIS LEAGUE CAN FILL. An imported league can be
      // four clubs, and offering an eight-club postseason to four of them is a
      // control that cannot do what it says — newSeason() would clamp it back
      // and the screen would go on claiming three rounds. Filtered here so the
      // question is never asked; bracketFor() is still the one that decides.
      key: 'bracket',
      title: 'HOW MANY CLUBS MAKE THE PLAYOFFS',
      choices: BRACKET.filter((c) => c.value <= LEAGUE.length),
    },
    { key: 'series', title: 'HOW LONG IS A PLAYOFF ROUND', choices: SERIES },
  ];

  /**
   * THE RULES SCREEN — every setting on one page, each a row of buttons with
   * the current pick lit.
   *
   * ⚠️ ONE PAGE, NOT A WIZARD. Season length was a step of its own when it was
   * the only setting, and five sequential steps to start a franchise is four
   * screens between a player and a ball game — which is pillar one. Everything
   * is defaulted and every row is optional, so START is reachable on the first
   * press and a player who wants none of this never has to read it.
   *
   * ⚠️ AND IT IS A SCREEN RATHER THAN A MENU YOU CAN REOPEN. Every one of these
   * builds the season's rosters or its calendar at kickoff — see rules.ts — so
   * there is nothing here that can honestly be changed in August.
   */
  const drawRules = (): void => {
    prompt.textContent = 'HOW SHOULD THIS LEAGUE PLAY';
    const rounds = roundsIn(rules.bracket);
    grid.innerHTML =
      rowsOf()
        .map((r) =>
          dial(
            r.key,
            r.title,
            r.choices,
            // ⚠️ FOUND, NOT REMEMBERED. The dial's position is looked up from
            // the value in `rules` every draw rather than tracked beside it —
            // cleanRules() is allowed to refuse or clamp what an arrow asked
            // for, and an index kept in step with the arrow rather than with
            // the setting would then point at a value the season is not
            // playing under. Missing lands on 0, which is what a clamp means.
            Math.max(
              0,
              r.choices.findIndex((c) => c.value === rules[r.key]),
            ),
          ),
        )
        .join('') +
      `<button class="plate" data-go="start"><b>PLAY BALL</b>` +
      `<span class="sub">${rules.games} GAMES · ${rounds} ROUND` +
      `${rounds === 1 ? '' : 'S'} OF ${rules.series}</span></button>`;
  };

  /**
   * THE LEAGUE SCREEN — export the clubs, edit them, paste them back.
   *
   * ⚠️ THE BOX IS TRANSPORT, NOT AN EDITOR, and the size is why it is built
   * this way. The full document is a quarter of a megabyte over eight thousand
   * lines (scripts/leaguedoc.ts prints it), so the flow that works is: fill the
   * box, copy it out, edit it somewhere with a search function, paste it back.
   * It therefore opens EMPTY — rendering a 230kB string into the DOM to show
   * somebody a wall they are going to scroll past is a worse first screen than
   * a button that says what it will do. And because re-casting one club is the
   * edit people actually make, the box takes a single club too.
   *
   * ⚠️ IT RELOADS RATHER THAN SWAPPING THE LEAGUE UNDER A RUNNING PAGE. LEAGUE
   * is a module constant read at import by teams.ts, sim.ts and by main.ts's
   * own opening newGame(); half a dozen things already hold references into it.
   * Rebuilding all of that live is a feature nobody asked for, and this is a
   * single page that reloads in a blink and comes straight back here.
   *
   * ⚠️ A FRANCHISE IN PROGRESS SURVIVES IT, and the screen says so out loud
   * because it is the first thing anybody would worry about. A season owns its
   * rosters and loadSeason() now validates a save against those rather than
   * against the current league — see franchise.ts — so importing a league is
   * something you do BETWEEN franchises without losing the one you are in.
   */
  const drawLeague = (): void => {
    prompt.textContent = 'YOUR LEAGUE';
    const status = leagueStatus();
    const ladder = [...LEAGUE].sort((a, b) => clubValue(b) - clubValue(a));
    const deepest = ladder[0];
    const thinnest = ladder.at(-1);
    const where =
      status === 'custom'
        ? `Playing <b>your own league</b> — ${LEAGUE.length} clubs` +
          (deepest && thinnest && deepest !== thinnest
            ? `, deepest ${deepest.abbr}, thinnest ${thinnest.abbr}.`
            : '.')
        : status === 'broken'
          ? 'A league is stored, but it no longer reads — the clubs that shipped are ' +
            'playing instead. What is wrong with it is below, and the text is in the box.'
          : `Playing <b>the league that shipped</b> — ${LEAGUE.length} clubs.`;

    const notes = leagueSays.length ? leagueSays : storedLeagueProblems();
    const said = notes.length
      ? `<div class="says" style="grid-column:1/-1">${notes
          .map((p) => `<div>${escapeText(p)}</div>`)
          .join('')}</div>`
      : '';

    grid.innerHTML =
      `<div class="dim" style="grid-column:1/-1;line-height:1.7">${where}<br>` +
      'Fill the box, copy it into a text editor, change what you like and paste it back. ' +
      'You can paste <b>one club</b> on its own too — it goes over the club with the same ' +
      'abbreviation.<br>A franchise already in progress keeps the clubs it started with.' +
      '</div>' +
      said +
      `<div style="grid-column:1/-1"><textarea id="leaguebox" spellcheck="false" ` +
      `placeholder="Paste a league here — a JSON array of clubs, or one club on its own."` +
      `>${escapeText(box)}</textarea></div>` +
      `<button data-lg="fill"><b>FILL THE BOX</b><br>the clubs you are playing, ready to copy` +
      `</button>` +
      `<button data-lg="use"><b>USE WHAT IS IN THE BOX</b><br>checked before anything is kept` +
      `</button>` +
      (status === 'none'
        ? ''
        : `<button data-lg="shipped"><b>BACK TO THE SHIPPED LEAGUE</b><br>` +
          `drops the one you imported</button>`) +
      `<button data-lg="back"><b>BACK</b><br>nothing is changed</button>`;
  };

  // ⚠️ THE DIFFICULTY SITS ON THE FIRST SCREEN, BEFORE THE MODE, because it is
  // the only setting on it that decides whether the game is playable at all for
  // the person reading — and pillar one is that it be reachable. It is drawn on
  // the mode screen only: once you are picking clubs the question has been
  // answered, and it stays answerable all game from the meta strip anyway.
  const drawLevels = (): void => {
    if (!levels) return;
    levels.innerHTML = mode
      ? ''
      : dial(
          'level',
          'HOW HARD IS THE SWING',
          LEVELS.map((l) => ({ name: l.name, blurb: l.blurb })),
          Math.max(
            0,
            LEVELS.findIndex((l) => l.key === settings.level),
          ),
        );
  };

  /**
   * A CLUB'S COLOUR, out of its three letters.
   *
   * ⚠️ DERIVED, NOT STORED, and deliberately so. `Team` has no colour field and
   * adding one would mean thirty hand-picked values plus a rule about what an
   * IMPORTED club that omits it should look like. A hash of the abbreviation is
   * stable, unique enough across thirty, and gives somebody's twelve-club
   * league its own set of caps for free.
   *
   * Only the hue moves. Saturation and lightness are pinned where dark text
   * stays readable on top, so no club can draw itself an unreadable patch.
   */
  const clubHue = (abbr: string): number => {
    let h = 0;
    for (let i = 0; i < abbr.length; i++) h = (h * 31 + abbr.charCodeAt(i)) >>> 0;
    return h % 360;
  };

  /** What a roster rank is worth saying, in colour. */
  const RANK_COLOUR: Record<string, string> = {
    STACKED: 'var(--good)',
    STRONG: 'var(--good)',
    EVEN: 'var(--dim)',
    LIGHT: 'var(--hot)',
    THIN: 'var(--bad)',
  };

  /**
   * ONE CLUB, AS A CARD.
   *
   * ⚠️ IT SAYS WHAT THE CLUB IS, and that is the point of the change rather
   * than the cap patch. The picker was thirty identical tiles carrying a
   * three-letter code and a name, so choosing was choosing blind — and then the
   * pre-game screen immediately told you the club you had just taken was 28th
   * of 30 and swings for the fences. Both of those facts already existed
   * (value.ts, identity.ts); they were simply not on the screen where the
   * decision is made.
   */
  const clubCard = (c: Team, n: number): string => {
    const label = strengthLabel(strengthRank(c, LEAGUE), LEAGUE.length);
    const who = c.identity?.name ?? '';
    return (
      `<button class="clubcard" data-i="${n}">` +
      `<span class="patch" style="background:hsl(${clubHue(c.abbr)} 45% 62%)">` +
      `${escapeText(c.abbr)}</span>` +
      `<span class="nm">${escapeText(c.name)}</span>` +
      `<span class="who"><b style="color:${RANK_COLOUR[label] ?? 'var(--dim)'}">` +
      `${escapeText(label)}</b>${who ? ` · ${escapeText(who)}` : ''}</span>` +
      `</button>`
    );
  };

  const draw = (): void => {
    drawLevels();
    if (!mode) {
      prompt.textContent = 'PICK A MODE';
      const resume =
        saved && !seasonOver(saved)
          ? card('resume', 'CONTINUE', `${saved.you} — ${dayLabel(saved).toLowerCase()}`)
          : '';
      // The book is offered only once there is something in it. A RECORD BOOK
      // card on a fresh install is a door to an empty room.
      const t = totals(loadCareer());
      const book = t.seasons
        ? card(
            'book',
            'RECORD BOOK',
            `${t.seasons} season${t.seasons === 1 ? '' : 's'}` +
              `, ${t.titles} title${t.titles === 1 ? '' : 's'}`,
          )
        : '';
      // The league card says what is loaded rather than what it does, because
      // "the clubs that shipped" is the answer to the question somebody opening
      // this screen actually has.
      const status = leagueStatus();
      const leagueSub =
        status === 'custom'
          ? `yours — ${LEAGUE.length} clubs`
          : status === 'broken'
            ? 'the stored one will not read'
            : `the ${LEAGUE.length} that shipped`;
      grid.innerHTML =
        resume +
        card('exhibition', 'EXHIBITION', 'one game, you pick both clubs') +
        card('franchise', 'FRANCHISE', 'a season of your own length, then a bracket') +
        book +
        card('league', 'LEAGUE', leagueSub);
      return;
    }
    if (mode === 'league') {
      drawLeague();
      return;
    }
    // The questions you only get to answer once. See the header.
    if (mode === 'franchise' && !ruled) {
      drawRules();
      return;
    }
    prompt.textContent = mine
      ? `${mine.abbr} — NOW PICK YOUR OPPONENT`
      : mode === 'franchise'
        ? 'PICK THE CLUB YOU RUN'
        : 'PICK YOUR CLUB';
    grid.innerHTML =
      `<div class="chalk">${
        mine ? `WHO ${escapeText(mine.abbr)} PLAYS` : `${LEAGUE.length} CLUBS · ROSTER RANK AND HOW THEY PLAY`
      }</div>` +
      LEAGUE.map((c, n) => (c === mine ? '' : clubCard(c, n))).join('');
  };

  const start = (): void => {
    el.remove();
    nextGame();
  };

  // ⚠️ THE DIFFICULTY DIAL LIVES IN ITS OWN CONTAINER, so its arrows never
  // reach the grid's handler. It walks LEVELS rather than a Rules row, but by
  // the same rule and with the same wrap — one implementation, called from the
  // two places the two containers make necessary.
  levels?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('button');
    if (btn?.dataset['step'] !== 'level') return;
    const by = Number(btn.dataset['by']);
    const at = Math.max(0, LEVELS.findIndex((l) => l.key === settings.level));
    const next = LEVELS[((at + by) % LEVELS.length + LEVELS.length) % LEVELS.length]!;
    settings = { ...settings, level: next.key };
    saveSettings(settings);
    drawLevels();
  });

  grid.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('button');
    if (!btn) return;

    const go = btn.dataset['go'];
    if (go === 'book') {
      // The title screen stays underneath; the book hands control straight back
      // to it, so this is a look rather than a step.
      showCareer(() => draw());
      return;
    }
    if (go === 'resume') {
      season = saved;
      start();
      return;
    }
    if (go === 'exhibition' || go === 'franchise' || go === 'league') {
      mode = go;
      leagueSays = [];
      draw();
      return;
    }

    // ---- the league screen. Everything here either changes nothing or ends
    // in a reload, because LEAGUE is a module constant half the file already
    // holds a reference into. See drawLeague().
    const lg = btn.dataset['lg'];
    if (lg) {
      const boxEl = document.getElementById('leaguebox') as HTMLTextAreaElement | null;
      // Read back before ANY redraw — the element is about to be replaced, and
      // a paste that only lived in the DOM would go with it.
      box = boxEl?.value ?? box;
      if (lg === 'back') {
        mode = null;
        leagueSays = [];
        draw();
      } else if (lg === 'fill') {
        // ⚠️ LEAGUE_SOURCE, NOT LEAGUE. The played clubs have had parity
        // applied; the source is what an import goes back in as. Filling the
        // box with the compressed ones would move every rating a little every
        // time somebody edited a bio. See league.ts.
        box = serialiseLeague(LEAGUE_SOURCE);
        leagueSays = [];
        draw();
        const filled = document.getElementById('leaguebox') as HTMLTextAreaElement | null;
        filled?.focus();
        filled?.select();
      } else if (lg === 'shipped') {
        clearCustomLeague();
        location.reload();
      } else if (lg === 'use') {
        const problems = saveCustomLeague(box, LEAGUE_SOURCE);
        if (problems === null) location.reload();
        else {
          leagueSays = problems;
          draw();
        }
      }
      return;
    }
    // ---- an arrow on a dial. One handler for all seven, because they differ
    // in exactly one thing: which list is being walked.
    const step = btn.dataset['step'];
    if (step) {
      const by = Number(btn.dataset['by']);
      // Both ends wrap. A dial you can drive off the end of is a control that
      // silently stops responding, and there is nothing at either end worth
      // stopping at — see the note on dial().
      const wrap = (at: number, n: number): number => ((at + by) % n + n) % n;

      // Only the rules dials reach here. The difficulty one is drawn into the
      // `levels` container, which has a listener of its own — see below.
      const row = rowsOf().find((r) => r.key === step);
      if (row && row.choices.length > 0) {
        const at = Math.max(0, row.choices.findIndex((c) => c.value === rules[row.key]));
        const next = row.choices[wrap(at, row.choices.length)]!;
        // ⚠️ STILL THROUGH cleanRules(). The value came off a list this screen
        // drew from rules.ts, so it is already legal — but cleanRules is the
        // one function that decides what a legal Rules is, and a second opinion
        // here is exactly how the two drift apart. It is also what clamps the
        // bracket, which no arrow should be able to route around.
        rules = cleanRules({ ...rules, [row.key]: next.value });
        drawRules();
      }
      return;
    }
    if (go === 'start') {
      ruled = true;
      draw();
      return;
    }

    const picked = LEAGUE[Number(btn.dataset['i'])]!;
    if (mode === 'franchise') {
      // A fresh season replaces whatever was saved — there is one slot, and
      // the CONTINUE card above is the only way back to the old one.
      clearSeason();
      season = newSeason(picked.abbr, Date.now() >>> 0, rules.games, rules);
      saveSeason(season);
      start();
      return;
    }
    if (!mine) {
      mine = picked;
      draw();
      return;
    }
    // Exhibition: you are the home club, so you bat last.
    el.remove();
    kickOff(mine, picked, 'home');
  });

  draw();
}

pregame();
