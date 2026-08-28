/**
 * The at-bat screen. Decision 2: canvas here, DOM for everything else.
 *
 * THE ONE RULE THIS FILE EXISTS TO HONOUR:
 * the ball's position on screen and the grading of your swing are read from
 * the SAME clock. `launchMs` comes from gameNow(), arrival from
 * ballArrivalMs(), the swing from pointerdown's event.timeStamp put through
 * toGameTime() — all on one clock. Nothing here counts frames.
 * requestAnimationFrame only decides when to *draw*; it never decides when the
 * ball arrives.
 *
 * That clock is gameNow(), not performance.now(), and the difference is the
 * time spent behind a menu — see clock.ts. Never read performance.now() in
 * this file; a mixed pair of timestamps is the fault class below.
 *
 * That is the seam every fault in the Godot prototype lived in. Keeping the
 * simulation out of the render loop is what makes it impossible here.
 *
 * ponytail: shapes, not sprites. The experiment protocol puts assets on the
 * human — swap the draw* functions for drawImage() when the art exists. The
 * geometry and the timing do not change when it does.
 */

import { makeRng, seedFromString } from '../core/rng.ts';
import {
  ballArrivalMs,
  computeOffsetMs,
  medianOffset,
  TIMING_WINDOWS_MS,
} from '../core/timing.ts';
import {
  movementOf,
  pitcherFor,
  PITCHERS,
  scoutingReport,
  stuffFactor,
  throwPitch,
  type Pitcher,
  type ThrownPitch,
} from '../core/pitcher.ts';
import { newAtBat, swingAt, takePitch, isOver, type AtBatState } from '../core/atBat.ts';
import {
  newMatch,
  recordAtBat,
  opponentRuns,
  playerWon,
  moveRunner,
  removeRunner,
  runnerMoves,
  scorersFrom,
  isSacrificeFly,
  EMPTY_BASES,
  type Bases,
  type MatchState,
  type RunnerMove,
} from '../core/inning.ts';
import { attemptSteal, stealChance } from '../core/baserunning.ts';
import { rollFielding, CLEAN } from '../core/fielding.ts';
import { isHit, type Outcome, type PitchType } from '../core/hitTables.ts';
import {
  platoonContact,
  locationOffset,
  SIT_ON_IT_CONTACT,
  PROTECT_CONTACT,
  type Hand,
} from '../core/hit.ts';
import { drawSprite, SPRITE_SPECS, assetCount, hasAsset, slug } from './sprites.ts';
import { callPlay } from './scorecard.ts';
import { saveRun, loadRun, clearRun } from './save.ts';
import { plotBatted } from './plot.ts';
import {
  makeCam,
  basePoint,
  drawOverhead,
  overheadAlpha,
  raceFor,
  replayLength,
  OUTCOME_COLOR,
  type Replay,
  type Sfx,
} from './overhead.ts';
import { simOpponent, OPPONENT_NAME } from '../core/opponent.ts';
import { DIVISIONS, DIVISION_ORDER, type Division } from '../core/division.ts';
import { settings, saveSettings, resetSettings, SPEED_LABELS } from './settings.ts';
import { gameNow, tickClock, toGameTime } from './clock.ts';
import {
  poseAt,
  isSwinging,
  BAT_POSES,
  REST_POSE,
  SWING_TRAVEL_MS,
  travelMs,
  batSpeedLabel,
  BATTER_DX,
  type BatPose,
} from './swing.ts';
import {
  resolveLineup,
  draftOffer,
  startingLineup,
  reorder,
  chemistryCount,
  playerSynergies,
  doublingItems,
  POOL,
  MAX_ROSTER,
  type LineupSlot,
  type Player,
} from '../core/roster.ts';
import {
  wakeAudio,
  applyVolume,
  sfxContact,
  sfxWhiff,
  sfxMitt,
  sfxCall,
  sfxOnBase,
  sfxCrowd,
  sfxHomer,
  sfxOut,
  sfxBuy,
  shake,
  hitstop,
  isStopped,
  shakeBegin,
  shakeEnd,
  burst,
  drawSparks,
} from './juice.ts';
import {
  newRun,
  buy,
  sign,
  signCost,
  ownedItems,
  MAX_ITEMS,
  completeMatch,
  shopOffer,
  matchPayout,
  endorsementIncome,
  payoutTotal,
  currentDivision,
  rerollCost,
  INNINGS_PER_MATCH,
  encounterNumber,
  lossCost,
  MAX_PATIENCE,
  type PowerUp,
  type RunState,
} from '../core/run.ts';

const canvas = document.getElementById('field') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const el = (id: string) => document.getElementById(id)!;

const W = canvas.width;
const H = canvas.height;
const MOUND_Y = 150;
const PLATE_Y = 400;

type Phase =
  | { kind: 'idle' }
  | { kind: 'windup'; pitch: ThrownPitch; startedAt: number }
  | { kind: 'flight'; pitch: ThrownPitch; launchMs: number; arrivalMs: number }
  | { kind: 'done'; pitch: ThrownPitch; text: string; until: number };

/**
 * A ball in play, flying off the bat.
 *
 * There is no per-outcome animation here and there does not need to be. A
 * popup launches at 45-80 degrees and comes almost straight back down; a
 * homer leaves at 25-35 with 110 exit velocity and clears the top of the
 * screen; a chopper leaves at -10 and skips. The outcome shapes the flight
 * because the hit engine already decides angle, direction and speed — nine
 * distinct animations for the price of reading three numbers.
 */
interface BallInPlay {
  startedAt: number;
  from: { x: number; y: number };
  exitVelocity: number;
  launchAngle: number;
  direction: number;
  outcome: string;
}
let inPlay: BallInPlay | null = null;

let replay: Replay | null = null;

/** The overhead camera. 0.92 px/ft is what this screen has always drawn at. */
const OH_CAM = makeCam(W, H, 0.92);

/**
 * The replay's sound bank. overhead.ts names a noise; this screen owns the
 * samples, so the module can be dropped into a screen with no audio at all.
 */
const playSfx: Sfx = (name, level = 1) => {
  if (name === 'crowd') return sfxCrowd(level);
  if (name === 'mitt') return sfxMitt();
  if (name === 'whiff') return sfxWhiff();
  if (name === 'onBase') return sfxOnBase();
  return sfxOut();
};


/**
 * Preview any replay without waiting for the RNG to hand you a triple.
 *
 * `__replay('home_run')` in the console. Dev only — Vite folds `import.meta
 * .env.DEV` to false and drops this whole branch from the demo build, so there
 * is no hook to find in the shipped file.
 *
 * ponytail: this exists because tuning an animation you can only see once
 * every twenty at-bats is how animations end up untuned. It is a two-line
 * escape hatch, not a debug menu.
 */
if (import.meta.env.DEV) {
  /**
   * `__assets()` — every filename the game is looking for, and whether it has
   * it yet.
   *
   * The asset pipeline needs no manifest, which is the point, but that leaves
   * nowhere to LOOK UP what a file should be called. Reading assets/README.md
   * works and nobody does it. This prints the exact list, marks off what has
   * landed, and can be pasted straight into a folder listing.
   */
  (window as unknown as Record<string, unknown>)['__assets'] = () => {
    const rows: string[] = [];
    const line = (kind: string, key: string, label: string) =>
      rows.push(`${hasAsset(`${kind}/${key}`) ? '  ✓' : '  ·'} assets/${kind}/${key}.png   ${label}`);

    rows.push('BATTERS — one per hitter, or _default.png for all of them');
    line('batters', '_default', '(covers everyone without a file)');
    for (const p of POOL) line('batters', slug(p.name), `${p.name}  · or ${slug(p.id)}.png`);

    rows.push('', 'PITCHERS');
    line('pitchers', '_default', '(covers every arm)');
    for (const p of Object.values(PITCHERS).flat()) line('pitchers', slug(p.name), p.name);

    rows.push('', 'THE REST');
    line('ball', 'ball', 'the baseball');
    for (const d of DIVISION_ORDER) line('field', d, `${DIVISIONS[d].name} background`);
    line('field', 'background', '(covers all three divisions)');
    line('fielders', '_default', 'the nine in the overhead replay');
    line('fielders', 'runner', 'a baserunner');

    rows.push(
      '',
      `${assetCount()} file${assetCount() === 1 ? '' : 's'} loaded.`,
      'Drop a PNG in and reload — no manifest, no imports, no rebuild.',
      'Draw everyone RIGHT-handed; lefties are mirrored for you.',
      'Any size works. Anchor the feet at the bottom. Do NOT draw a bat.',
    );
    console.log(rows.join('\n'));
    return `${assetCount()} loaded`;
  };

  (window as unknown as Record<string, unknown>)['__swingGhosts'] = (on = !swingGhosts) => {
    swingGhosts = on;
    return `swing ghosts ${on ? 'on' : 'off'}`;
  };
  (window as unknown as Record<string, unknown>)['__replay'] = (
    outcome: Outcome,
    exitVelocity = 95,
    launchAngle = 22,
    direction = -18,
    speed = 1,
    extra: { doublePlay?: boolean; error?: boolean; moves?: RunnerMove[]; scoredFrom?: number[] } = {},
  ) => {
    replay = {
      startedAt: gameNow(),
      plot: plotBatted(outcome, exitVelocity, launchAngle),
      direction,
      outcome,
      speed,
      safe: isHit(outcome) || !!extra.error,
      doublePlay: !!extra.doublePlay,
      error: !!extra.error,
      moves: extra.moves ?? [],
      scoredFrom: extra.scoredFrom ?? [],
      cued: new Set(),
    };
  };
}


const WINDUP_MS = 900;

/**
 * The lineup. You are no longer one anonymous hitter — you bat through a
 * cross-era order, and chemistry between neighbours is the build.
 */
// `let`, because resuming a saved run replaces the generator with one restored
// mid-stream. Everything reads this binding rather than capturing it, so the
// swap reaches every call site.
let rng = makeRng(seedFromString(String(Date.now())));
let run: RunState = newRun();
let signed: Player[] = startingLineup(rng);
let lineup: LineupSlot[] = resolveLineup(signed, run.equipped);
let atBatIndex = 0;

const division = (): Division => DIVISIONS[currentDivision(run)];
const batter = (): LineupSlot => lineup[atBatIndex % lineup.length]!;

/**
 * This batter's contact against THIS pitch — chemistry and their own item
 * already folded in by resolveLineup, the matchup folded in here.
 *
 * The pitch type is a parameter because the platoon split is not a property of
 * the batter, it is a property of the pairing: a lefty facing a lefty sees the
 * slider worst and the fastball nearly normally. `pitchType` is optional so a
 * caller with no pitch in flight — the timing bar between pitches — still gets
 * the batter's own number rather than a wrong one.
 */
const effectiveContact = (pitchType?: PitchType): number =>
  batter().stats.contact *
  (pitchType ? platoonContact(batter().player.bats, pitcher.throws, pitchType) : 1) *
  // The arm's break and clutch, same as resolveSwing() applies them.
  (pitchType
    ? stuffFactor(pitcher, pitchType, {
        runnersInScoringPosition: match.bases[1] !== null || match.bases[2] !== null,
      })
    : 1) *
  // The stance moves the windows too, so the auto-take and the timing bar have
  // to apply the same rule resolveSwing() applies — including its exclusivity,
  // where sitting on it beats protecting. Duplicated arithmetic, not duplicated
  // policy: the two constants are imported from the engine.
  (sittingOnIt ? SIT_ON_IT_CONTACT : atBat.strikes >= 2 ? PROTECT_CONTACT : 1);

/**
 * How long after arrival a swing can still make contact, for THIS batter
 * against THIS pitch. Mirrors the scaling inside grade(), so the auto-take and
 * the grader agree — and now that the matchup narrows that window, the auto-
 * take has to know about it or it will pull the bat back on swings the grader
 * would still have called contact.
 */
const swingWindowMs = (pitchType?: PitchType): number =>
  // ⚠️ VISION BELONGS ON THIS WINDOW AND ONLY THIS ONE. grade() scales perfect
  // and good by contact alone and the OUTER boundary by contact × vision, so
  // an auto-take that left vision out would pull the bat back on swings the
  // grader would still have called contact — which is the whole rating.
  TIMING_WINDOWS_MS.contact *
  Math.max(0.1, effectiveContact(pitchType)) *
  Math.max(0.1, batter().stats.vision);

let pitcher: Pitcher = pitcherFor(currentDivision(run), run.match);
let match: MatchState = newMatch(
  INNINGS_PER_MATCH,
  simOpponent(currentDivision(run), INNINGS_PER_MATCH, rng),
);
let atBat: AtBatState = newAtBat();
/**
 * What he has shown THIS batter. Feeds the pitcher's sequencing rules, and
 * resets on every turnover — a pitch thrown to the last man is not something
 * this one has seen.
 */
let pitchesThisAtBat: PitchType[] = [];
let phase: Phase = { kind: 'idle' };
/** Last swing, kept only to draw the timing bar. */
let lastOffset: number | null = null;
/**
 * And what it was swung at. The bar draws the windows the swing was actually
 * graded against, and the matchup moves those — a lefty's slider narrows them
 * and the bar has to narrow with it, or it draws a lie about the swing it is
 * reporting on.
 */
let lastPitchType: PitchType | null = null;

/**
 * When the bat started moving, on the game clock. null = at rest.
 *
 * This is the swing now — not a flag, a start time. The bat is drawn from it
 * and the contact is graded off it, so there is exactly one number behind both
 * and they cannot drift apart. See swing.ts, FAULT 5.
 */
let swingStartedAt: number | null = null;

/**
 * How long THIS swing's barrel takes to arrive, captured at the press.
 *
 * ⚠️ CAPTURED, NOT RECOMPUTED, and that is the FAULT 5 lesson applied to bat
 * speed. The frame loop grades at `swingStartedAt + swingTravel` and
 * drawBatter draws from the same pair, so there is exactly one number behind
 * the picture and the verdict. Reading `travelMs(batter().stats.power)` at
 * both sites instead would work today and come apart the first time anything
 * can change a batter's power mid-swing.
 */
let swingTravel = SWING_TRAVEL_MS;

/** This batter's bat speed. The live value, for anything not mid-swing. */
const batterTravel = (): number => travelMs(batter().stats.power);
/** True once the swing has been graded, so it cannot resolve twice. */
let swingResolved = false;

/**
 * SITTING ON IT — the hitter's half of the duel, and the input the risk-reward
 * power swing never had. `isPowerSwing` has been implemented and tested in the
 * hit engine since the port with no key, no button and no way to reach it.
 *
 * It is ARMED BETWEEN PITCHES rather than held during the press, and that is
 * the important decision here. Three reasons, in order:
 *
 *  1. It is when a real hitter decides. You sit on a pitch before it is
 *     thrown; you do not choose your swing halfway through it.
 *  2. A held modifier would put a second reading of the input device inside
 *     the timing seam, which is rule 1 of this codebase.
 *  3. A modifier key has no touch equivalent. A toggle is a button, the same
 *     way steal and pause got their touch path.
 *
 * It survives the pitch — an approach is a stance you hold for an at-bat, not
 * a per-pitch keystroke — and clears on the turnover with the new batter.
 */
let sittingOnIt = false;

/** Dev-only: ghost the whole swing arc. Toggled by `__swingGhosts()`. */
let swingGhosts = false;

/**
 * Raw swing offsets, newest last, for the latency calibration (timing.ts
 * FAULT 4). These are measured against UNCORRECTED arrival on purpose —
 * feeding corrected offsets back in would make the estimate chase itself to
 * zero instead of converging on the display's real latency.
 *
 * ponytail: takes contribute nothing, so a player who only ever swings at
 * pitches they read late will bias this. Fine — the population being
 * corrected is swings, and that is the population being sampled.
 */
const recentOffsets: number[] = [];
const CALIBRATION_WINDOW = 20;
const CALIBRATION_MIN_SAMPLES = 8;

/** Ball arrival as the player's eyes saw it, which is the only one worth grading. */
const perceivedArrival = (arrivalMs: number): number => arrivalMs + settings.timingOffsetMs;

/**
 * ⚠️ BAT SPEED AND THE CALIBRATION. Reasoned out once, 2026-08-16, because it
 * is subtle and the wrong fix is the obvious one.
 *
 * Samples are recorded RAW and are NOT normalised for this batter's travel
 * time. That looks like an oversight and is the deliberate choice.
 *
 * For a player who correctly anticipates the bat he is holding, travel cancels
 * exactly: he presses at `perceivedArrival − travel`, contact lands at
 * `perceivedArrival`, and the raw offset is the display latency whatever the
 * travel was. The estimator is already unbiased for the player who has
 * adapted — which is the player the feature exists to create.
 *
 * "Correcting" by subtracting `travel − SWING_TRAVEL_MS` would fix the
 * UNADAPTED player and break the adapted one, pushing a skilled player's
 * calibration wrong by the full spread. That is the wrong trade.
 *
 * What remains is that an unadapted player's error is partly absorbed as if it
 * were latency, over a 20-swing window. Across a mixed lineup the median sits
 * near the middle bat, so the DIFFERENCE between a quick bat and a heavy one —
 * the whole point — survives; only the lineup-wide average is absorbed, and
 * that is exactly what a calibration is supposed to remove. A lineup that is
 * uniformly heavy is the one case where it flattens out, and there "heavy" is
 * simply the new normal with nothing left to distinguish.
 */
function recordCalibrationSample(rawOffsetMs: number): void {
  recentOffsets.push(rawOffsetMs);
  if (recentOffsets.length > CALIBRATION_WINDOW) recentOffsets.shift();
  if (!settings.autoCalibrate || recentOffsets.length < CALIBRATION_MIN_SAMPLES) return;

  settings.timingOffsetMs = medianOffset(recentOffsets);
  saveSettings();
}

function resetCalibration(): void {
  recentOffsets.length = 0;
  settings.timingOffsetMs = 0;
  settings.autoCalibrate = true;
  saveSettings();
}

/** Your line in this game. The only thing money is computed from. */
let tally = { hits: 0, atBats: 0, homeRuns: 0, rbis: 0 };
const resetTally = () => (tally = { hits: 0, atBats: 0, homeRuns: 0, rbis: 0 });

// ---------------------------------------------------------------- simulation

function nextPitch(): void {
  if (match.over || run.over || phase.kind !== 'idle') return;
  const pitch = throwPitch(
    pitcher,
    atBat,
    {
      previous: pitchesThisAtBat,
      // First base open is what makes a walk cheap, which is what lets him
      // pitch around your best hitter. Reading it off the real base state is
      // what turns "who bats where" into a decision the pitcher answers.
      firstBaseOpen: match.bases[0] === null,
      batterPower: batter().stats.power,
      outs: match.outs,
    },
    rng,
  );
  pitchesThisAtBat.push(pitch.type);
  // Bat back on the shoulder. The follow-through has had the whole 'done'
  // beat to finish, so nothing is cut short here.
  swingStartedAt = null;
  phase = { kind: 'windup', pitch, startedAt: gameNow() };
  say(
    pitch.tell?.timing === 'pre_pitch'
      ? `he's gripping a <b>${pitch.tell.pitch}</b>`
      : 'here it comes...',
  );
}

/**
 * Start the bat. This is what a press does now — it does not decide anything.
 *
 * The outcome is graded SWING_TRAVEL_MS later by resolveSwing(), from the
 * frame loop, which is the frame the barrel is drawn crossing the plate.
 */
function startSwing(at: number): void {
  if (phase.kind !== 'flight' || swingStartedAt !== null) return;
  swingStartedAt = at;
  swingTravel = batterTravel();
  swingResolved = false;
  // The bat moving through air, at the moment it starts moving. It used to
  // play on a whiff, 0ms after the press and only if you missed; the swing
  // needs a sound of its own or the press has no feedback until the verdict.
  sfxWhiff();
}

/**
 * The swing lands. `at` is the moment the barrel reached the zone —
 * press + SWING_TRAVEL_MS — on the same clock the ball is flying on.
 */
function swing(at: number): void {
  if (phase.kind !== 'flight') return;
  const { pitch, arrivalMs } = phase;
  // Grade against arrival AS SEEN, and learn from the raw miss between the two.
  const offsetMs = computeOffsetMs(at, perceivedArrival(arrivalMs));
  lastOffset = offsetMs;
  lastPitchType = pitch.type;
  recordCalibrationSample(computeOffsetMs(at, arrivalMs));

  const before = atBat;
  atBat = swingAt(
    atBat,
    {
      offsetMs,
      pitchType: pitch.type,
      location: pitch.location,
      // The batter's own numbers, with chemistry AND their item folded in by
      // resolveLineup. Items are per-player now, so there is nothing global
      // left to add here.
      stats: batter().stats,
      divisionRules: division().rules,
      // Clutch only pays with a runner in scoring position — 2nd or 3rd.
      runnersInScoringPosition: match.bases[1] !== null || match.bases[2] !== null,
      // The matchup. Both or neither — see platoonContact().
      batterHand: batter().player.bats,
      pitcherHand: pitcher.throws,
      // The approach. Sitting on it wins over protecting — see resolveSwing.
      isPowerSwing: sittingOnIt,
      twoStrikes: before.strikes >= 2,
      // His break and his clutch. One dial — see stuffFactor().
      stuff: stuffFactor(pitcher, pitch.type, {
        runnersInScoringPosition: match.bases[1] !== null || match.bases[2] !== null,
      }),
    },
    rng,
  );

  // Anything that left the bat gets flown, fouls and outs included.
  const contact = atBat.result?.kind === 'in_play' ? atBat.result.hit : null;
  const spot = crossing(pitch, batter().player.bats);

  if (contact && contact.outcome !== 'strikeout') {
    inPlay = {
      startedAt: gameNow(),
      from: spot,
      exitVelocity: contact.exitVelocity,
      launchAngle: contact.launchAngle,
      direction: contact.direction,
      outcome: contact.outcome,
    };

    // Everything scales off how hard it was hit, so a homer and a dribbler
    // are different events to the hand as well as to the scoreboard.
    const hard = Math.min(1, Math.max(0, (contact.exitVelocity - 60) / 50));
    sfxContact(contact.exitVelocity);
    hitstop(35 + 75 * hard);
    shake(4 + 16 * hard);
    burst(spot.x, spot.y, 6 + Math.round(18 * hard), contact.isHit ? '#ffe9a8' : '#cfcfc0', 130 + 190 * hard);

    if (contact.outcome === 'home_run') {
      sfxHomer();
      shake(26, 520);
      burst(spot.x, spot.y, 34, '#ffd76a', 300);
    } else if (contact.isHit) {
      sfxCrowd(0.45);
    } else {
      sfxOut();
    }
  } else if (contact) {
    // The whoosh already played when the bat started. Nothing was hit, so the
    // only thing left to sell is the empty swing.
    shake(3, 140);
  }

  const how = `${Math.abs(offsetMs).toFixed(0)}ms ${offsetMs < 0 ? 'early' : 'late'}`;
  let text: string;
  if (isOver(atBat) && atBat.result?.kind === 'in_play') {
    const h = atBat.result.hit;
    // The words are written in finishPitch, where the fielding roll is known —
    // "booted by second" and "two, around the horn" are not decided yet here.
    // The banner still fires now, because it belongs to the swing.
    text = '';
    const label = h.outcome.replace('_', ' ').toUpperCase();
    shout(label, h.isHit ? (h.outcome === 'home_run' ? '#ffd76a' : '#a8e06a') : '#ff8c66');
  } else if (atBat.strikes > before.strikes) {
    text = `strike — ${how}`;
    shout(contact ? 'STRIKE' : 'SWING AND MISS', '#ff8c66');
  } else {
    text = `fouled off — ${how}`;
    shout('FOUL', '#8a8a7a');
  }
  finishPitch(pitch, text);
}

/**
 * Who gets sent: the runner furthest along who has somewhere to go. Nobody
 * steals home here, so third is never the origin.
 */
function leadRunner(): { from: 0 | 1; runner: { name: string; speed: number } } | null {
  if (match.bases[1]) return { from: 1, runner: match.bases[1] };
  if (match.bases[0]) return { from: 0, runner: match.bases[0] };
  return null;
}

/**
 * Send the runner. Only between pitches — a steal during the flight would be
 * two decisions competing for one keystroke.
 *
 * The lead runner goes, because sending the trail runner into an occupied bag
 * is not a thing. Caught stealing costs an out like any other.
 */
function steal(): void {
  if (blocked() || phase.kind === 'flight' || phase.kind === 'windup') return;

  const send = leadRunner();
  if (!send) return;
  const { from, runner } = send;

  wakeAudio();
  const result = attemptSteal(runner.speed, from + 1, rng);
  const bag = from === 0 ? 'second' : 'third';

  if (result.safe) {
    match = { ...match, bases: moveRunner(match.bases, from) };
    sfxOnBase();
    shout('STOLEN', '#6fbf73');
    say(`<b>${runner.name}</b> takes ${bag}. Safe.`);
  } else {
    const outs = match.outs + 1;
    sfxOut();
    shake(8, 260);
    shout('CAUGHT', '#ff8c66');
    say(`<b>${runner.name}</b> hung out to dry at ${bag}.`);
    // Third out ends the inning, so route it through the same path an out
    // from the plate takes rather than hand-rolling the roll-over here.
    match =
      outs >= 3
        ? recordAtBat({ ...match, bases: removeRunner(match.bases, from) }, { kind: 'strikeout' })
        : { ...match, outs, bases: removeRunner(match.bases, from) };
  }

  paintHud();
  if (match.over) endMatch();
}

/**
 * Arm or drop the big swing. Only between pitches — deciding to sit on
 * something while it is already in the air is not sitting on it.
 */
function toggleSitOnIt(): void {
  if (blocked() || phase.kind === 'flight') return;
  sittingOnIt = !sittingOnIt;
  sfxMitt();
  paintHud();
}

function take(): void {
  if (phase.kind !== 'flight') return;
  const { pitch } = phase;
  atBat = takePitch(atBat, pitch.inZone, pitch.hitBatter);
  if (pitch.hitBatter) {
    sfxContact(70);
    shake(14, 340);
    burst(crossing(pitch, batter().player.bats).x, crossing(pitch, batter().player.bats).y, 12, '#ff8c66', 150);
    sfxOnBase();
    shout('HIT BY PITCH', '#ff8c66');
    finishPitch(pitch, 'up and in — <b>HIT BY PITCH</b>. Take your base.');
    return;
  }
  sfxMitt();
  sfxCall(pitch.inZone);
  shout(pitch.inZone ? 'STRIKE' : 'BALL', pitch.inZone ? '#ff8c66' : '#9ab0c8');
  finishPitch(pitch, pitch.inZone ? 'called <b>STRIKE</b>' : 'ball');
}

/**
 * The beat after any pitch — long enough to read the call.
 *
 * ⚠️ THIS PLUS WALKUP_MS IS THE REPLAY BUDGET. The overhead replay needs
 * REPLAY_CUT_MS + hangMs + REPLAY_HOLD_MS to finish inside it, and it was
 * raised from 1400 when the replay pacing slowed down — a 2.6s home run does
 * not fit in a 3.4s beat. plot.test.ts holds the arithmetic; slow the replay
 * again and this number goes up with it.
 */
const DONE_MS = 1800;
/**
 * The EXTRA beat when the at-bat ended and a new man is walking to the box.
 *
 * The old code gave a turnover the same 1400ms as a called ball, so the next
 * pitcher's windup started while the batter's card was still sliding in and
 * you had not yet read who was up. A broadcast holds on the card; the pitcher
 * is still getting the sign. Nothing about the timing seam changes here — this
 * only moves when the windup STARTS, and arrival is still computed from that
 * pitch's own launch stamp.
 */
const WALKUP_MS = 2000;

function finishPitch(pitch: ThrownPitch, text: string): void {
  // Captured before the at-bat is reset below, which is what clears isOver().
  const turnedOver = isOver(atBat);
  if (isOver(atBat)) {
    const result = atBat.result!;
    // No text appended here any more — the whole line is rewritten below, once
    // the fielding roll and the runners are known. These only fire the noise.
    if (result.kind === 'walk') {
      shout('WALK', '#9ab0c8');
      sfxOnBase();
    }
    // The strikeout was the ONE terminal outcome with no banner — every other
    // way an at-bat ends shouted and this one only wrote a log line, which is
    // why it kept reading as "nothing happened" on the most common result in
    // the game. Not a design decision, an omission.
    if (result.kind === 'strikeout') {
      shout('STRIKEOUT', '#ff8c66');
      sfxOut();
    }

    // What the defence did with it. Rolled here and handed down, so inning.ts
    // stays pure and the seeded run stays reproducible.
    const speed = batter().player.speed;
    const fielding =
      result.kind === 'in_play'
        ? rollFielding(
            result.hit.outcome,
            { speed, forceAtFirst: match.bases[0] !== null, outs: match.outs },
            rng,
          )
        : CLEAN;

    const runsBefore = match.runs;
    const basesBefore = match.bases;
    // Asked BEFORE recordAtBat, because it reads the outs and the bases as
    // they stood when the ball was hit — which is what the rule is about.
    const sacFly =
      result.kind === 'in_play' &&
      !fielding.error &&
      !fielding.doublePlay &&
      isSacrificeFly(result.hit.outcome, result.hit.exitVelocity, match.outs, match.bases);
    match = recordAtBat(match, result, { name: batter().player.name, speed }, fielding);

    // Cut to the overhead. Built HERE rather than at contact because two things
    // it needs are only known after the rolls above: the fielding result — an
    // error puts the batter on first off a ball the defence got to, and the
    // replay has to show the throw losing that race — and where the runners
    // ended up, which recordAtBat has just decided.
    //
    // Sitting inside `isOver(atBat)` is also what excludes fouls, for free: a
    // foul does not end the at-bat, so it never reaches this branch. It gets
    // the short beat, and there is nothing to watch anyway.
    if (result.kind === 'in_play') {
      const h = result.hit;
      replay = {
        startedAt: gameNow(),
        plot: plotBatted(h.outcome, h.exitVelocity, h.launchAngle),
        direction: h.direction,
        outcome: h.outcome,
        speed,
        safe: h.isHit || fielding.error,
        doublePlay: fielding.doublePlay,
        error: fielding.error,
        // from === -1 is the batter, and he is drawn by the race instead.
        moves: runnerMoves(basesBefore, match.bases).filter((m) => m.from >= 0),
        scoredFrom: scorersFrom(basesBefore, match.bases, match.runs - runsBefore),
        cued: new Set(),
      };
    }

    if (fielding.error) {
      shout('ERROR', '#9ab0c8');
      sfxOnBase();
    } else if (fielding.doublePlay) {
      shout('TWO', '#ff8c66');
      shake(12, 320);
      sfxOut();
    }

    const scored = match.runs - runsBefore;
    if (scored > 0) {
      sfxCrowd(Math.min(1, 0.5 + scored * 0.25));
      shake(10 + scored * 4, 380);
    }

    // The words, now that everything is known. A scorer's line and one
    // sentence of booth, in place of the enum-and-launch-angle readout.
    if (result.kind === 'in_play' && replay) {
      const call = callPlay({
        outcome: result.hit.outcome,
        chaser: raceFor(replay).chaser.num,
        doublePlay: fielding.doublePlay,
        error: fielding.error,
        outs: match.outs,
        scored,
        direction: result.hit.direction,
        sacFly,
      });
      text = `<b>${call.score}</b> &nbsp;·&nbsp; ${call.says}`;
    } else if (result.kind === 'strikeout') {
      text = `<b>K</b> &nbsp;·&nbsp; Struck him out${match.outs >= 3 ? ', and that retires the side' : ''}.`;
    } else if (result.kind === 'walk') {
      text = `<b>BB</b> &nbsp;·&nbsp; Ball four — he takes his base.`;
    } else if (result.kind === 'hit_by_pitch') {
      text = `<b>HBP</b> &nbsp;·&nbsp; Up and in, and it got him. Take your base.`;
    }

    // Tally for the ported performance bonus. Neither a walk nor a hit
    // batsman is an at-bat, which is why they do not hurt your average.
    if (result.kind !== 'walk' && result.kind !== 'hit_by_pitch') tally.atBats++;
    if (result.kind === 'in_play' && result.hit.isHit) tally.hits++;
    if (result.kind === 'in_play' && result.hit.outcome === 'home_run') tally.homeRuns++;
    tally.rbis += scored;

    atBatIndex++;
    atBat = newAtBat();
    pitchesThisAtBat = [];
    // A stance belongs to a hitter, not to the box. The next man decides for
    // himself, and leaving it armed would silently hand him a swing he never
    // chose — with the strikeout multiplier attached.
    sittingOnIt = false;
  }
  phase = {
    kind: 'done',
    pitch,
    text,
    until: gameNow() + DONE_MS + (turnedOver ? WALKUP_MS : 0),
  };
  say(text);
  paintHud();
}

// ---------------------------------------------------------------- run + shop

function endMatch(): void {
  const won = playerWon(match);
  const them = opponentRuns(match);
  const lines = matchPayout(match, tally, currentDivision(run), endorsementIncome(ownedItems(run)));

  run = completeMatch(run, match, tally);
  // The save point. After the run has absorbed the match and before the shop,
  // so a resume lands on the shop screen with the payday already banked.
  saveProgress();
  paintHud();

  el('shop-title').textContent = run.over
    ? run.fired
      ? 'YOU ARE FIRED'
      : won
        ? 'RUN COMPLETE'
        : 'RUN OVER'
    : won
      ? `WIN ${match.runs}-${them}`
      : match.runs === them
        ? `TIED ${match.runs}-${them}`
        : `LOSS ${match.runs}-${them}`;

  // The payout, counted out. An itemised total is worth more than the same
  // number arriving silently — the Balatro lesson, applied to the paycheck.
  const box = `${tally.hits}-for-${tally.atBats}`;
  el('shop-sub').innerHTML =
    `<span class="boxline">you went ${box}${tally.homeRuns ? `, ${tally.homeRuns} HR` : ''}${tally.rbis ? `, ${tally.rbis} RBI` : ''}</span>` +
    `<table class="payout">${lines
      .map(
        (l) =>
          `<tr><td>${l.label}</td><td class="${l.amount < 0 ? 'neg' : ''}">${l.amount < 0 ? '−' : '+'}$${Math.abs(l.amount)}</td></tr>`,
      )
      .join('')}<tr class="total"><td>Payday</td><td>$${payoutTotal(lines)}</td></tr></table>` +
    (run.over
      ? `<p>${run.fired ? 'The owner ran out of patience.' : 'Nine encounters played.'} Final bankroll <b>$${run.money}</b>.</p>`
      : `<p>bankroll <b>$${run.money}</b></p>`);


  rerolls = 0;
  paintOffers();
  paintLineupEditor();

  el('draft-label').hidden = run.over;
  el('lineup-edit').hidden = run.over;
  (el('reroll') as HTMLButtonElement).hidden = run.over;
  (el('next') as HTMLButtonElement).hidden = run.over;
  (el('newrun') as HTMLButtonElement).hidden = !run.over;
  if (run.over) el('shop-sub').innerHTML += runSummary();

  (el('next') as HTMLButtonElement).hidden = run.over;
  el('shop').hidden = false;
}

/** How many times the shelf has been rerolled at THIS stop. */
let rerolls = 0;

function paintOffers(): void {
  const offers = el('offers');
  const draft = el('draft');
  offers.innerHTML = '';
  draft.innerHTML = '';
  if (run.over) return;

  for (const item of shopOffer(ownedItems(run), rng)) offers.appendChild(card(item));
  for (const p of draftOffer(signed, rng)) draft.appendChild(playerCard(p));

  const cost = rerollCost(rerolls);
  const btn = el('reroll') as HTMLButtonElement;
  btn.textContent = `Reroll ($${cost})`;
  btn.disabled = run.money < cost;
}

/**
 * The batting order, editable.
 *
 * Chemistry reads between neighbours, so without this the order is just
 * whatever you happened to sign in and "the batting order is the build" is a
 * claim the player cannot act on. This is the screen where the synergy
 * system becomes a decision.
 */
function paintLineupEditor(): void {
  const list = el('lineup-list');
  list.innerHTML = '';
  el('chem-count').textContent = String(chemistryCount(signed));

  lineup.forEach((slot, i) => {
    const li = document.createElement('li');
    li.innerHTML =
      `<span class="slot">${i + 1}</span>` +
      `<span class="who"><span data-player="${slot.player.id}">${slot.player.name}</span> <span class="dim">(${slot.player.build})</span>` +
      (slot.item ? ` <b>${slot.item.name}${slot.item.synergised ? ' ×2' : ''}</b>` : '') +
      `</span>` +
      `<span class="links">${slot.chemistry.join(', ')}</span>`;

    for (const [label, delta] of [['↑', -1], ['↓', 1]] as const) {
      const b = document.createElement('button');
      b.textContent = label;
      b.disabled = (delta === -1 && i === 0) || (delta === 1 && i === lineup.length - 1);
      b.addEventListener('click', () => {
        signed = reorder(signed, i, delta);
        lineup = resolveLineup(signed, run.equipped);
        paintLineupEditor();
        paintHud();
      });
      li.appendChild(b);
    }
    list.appendChild(li);
  });
}

// ------------------------------------------------------------ the hover card

/**
 * Balatro's joker tooltip, for players.
 *
 * The problem this solves, in Zane's words: "I don't know what the players do
 * and the synergies and how they work." Nothing on screen said what a trait
 * was for, or which neighbour made a chemistry link fire — the lineup editor
 * listed links only AFTER you had already signed the man and guessed the
 * order. This puts the whole rule on the card before you spend.
 *
 * ponytail: ONE node, ONE delegated listener on document. Every place a player
 * name is rendered just tags itself `data-player="<id>"` and gets the card for
 * free — no per-site wiring, and no listener to leak when a panel repaints.
 * The native `title` attribute was the lazier rung and does not reach: it
 * cannot show the stat table or colour a clash red, which is the whole point.
 */
function playerTip(p: Player): string {
  const notes = playerSynergies(p);
  const gains = notes.filter((n) => n.direction === 'gains');
  const gives = notes.filter((n) => n.direction === 'gives');
  const doubles = doublingItems(p);

  const line = (n: (typeof notes)[number]): string =>
    `<div class="t-syn${n.good ? '' : ' bad'}">` +
    `<span class="t-label">${n.label}</span> ` +
    `<span class="t-eff">${n.effect}</span><br>` +
    `<span class="t-needs">${n.needs}</span></div>`;

  return (
    `<div class="t-kind">${p.build.toUpperCase()} · ${p.trait.toUpperCase()} · BATS ${p.bats}</div>` +
    `<div class="t-name">${p.name}</div>` +
    `<div class="t-bio">${p.bio}</div>` +
    `<div class="t-stats">` +
    `<span>pow <b>${p.power.toFixed(2)}</b></span>` +
    `<span>con <b>${p.contact.toFixed(2)}</b></span>` +
    `<span>clu <b>${p.clutch.toFixed(2)}</b></span>` +
    `<span>spd <b>${p.speed.toFixed(2)}</b></span>` +
    // The number, on the detail view. A heavy bat has to be started earlier,
    // and "how much earlier" is a question with an actual answer.
    `<span>bat <b>${travelMs(p.power).toFixed(0)}ms</b></span>` +
    `</div>` +
    (gains.length ? `<div class="t-head">HE GAINS</div>${gains.map(line).join('')}` : '') +
    (gives.length
      ? `<div class="t-head">HE GIVES</div>` +
        `<div class="t-gives">${gives.map((n) => `${n.label} (${n.effect}) ${n.needs}`).join('<br>')}</div>`
      : '') +
    (doubles.length
      ? `<div class="t-head">ITEMS THAT DOUBLE FOR HIM</div>` +
        `<div class="t-gives">${doubles.map((i) => i.name).join(', ')}</div>`
      : '')
  );
}

/**
 * The batter's card, when he steps in — a broadcast lower-third, not the
 * hover tip.
 *
 * It used to render `playerTip()`, which is the right content for a thing you
 * deliberately pointed at and the wrong content for a thing that appears
 * unbidden for two seconds: a bio in italics, then HE GAINS and HE GIVES,
 * three hundred pixels of reading while a pitch is coming. A real namecard
 * carries four things — order, name, who he is, and his numbers — and you can
 * take all four in at a glance. The full detail is still one hover away on the
 * batter's name in the HUD, which is where someone who wants it will look.
 *
 * ponytail: no jersey numbers on the Player type and none added. The number in
 * the block is the batting order slot, which a broadcast puts on the card
 * anyway and which this screen already knows.
 *
 * The sub-line used to end "· batting 4TH", spelled out from an ORDINALS table.
 * That was saying the same thing as the big number to its left, so bat speed
 * took the slot when it needed one — a card has room for four things and
 * "which one is he" was already answered.
 */
function batterCard(slot: LineupSlot, order: number): string {
  const p = slot.player;
  const stat = (label: string, v: number): string =>
    `<span><i>${label}</i><b>${v.toFixed(2)}</b></span>`;

  return (
    `<div class="bc-num">${order + 1}</div>` +
    `<div class="bc-body">` +
    `<div class="bc-name">${p.name}</div>` +
    // The matchup, on the card, where a broadcast puts it. "LHB vs RHP" is the
    // whole platoon system stated in six characters, and the card is the only
    // moment the player is looking at this batter and this pitcher together.
    // Bat speed goes on the card because it changes WHEN to press, and a
    // timing change nobody is told about is just unexplained difficulty — the
    // same mistake as the invisible-build problem. Words here, milliseconds on
    // the hover tip: this is a thing you glance at with a pitch coming.
    `<div class="bc-sub">${p.bats}HB vs ${pitcher.throws}HP · ${p.build} · ${p.trait} · <b>${batSpeedLabel(slot.stats.power)}</b></div>` +
    `<div class="bc-stats">` +
    stat('POW', slot.stats.power) +
    stat('CON', slot.stats.contact) +
    stat('CLU', slot.stats.clutch) +
    stat('SPD', p.speed) +
    `</div>` +
    // The item and the chemistry are the two things that make THIS lineup
    // different from the same nine names in another order, so they earn the
    // last line. Everything else on the old card did not.
    (slot.item || slot.chemistry.length
      ? `<div class="bc-chem">` +
        [slot.item ? `carrying ${slot.item.name}` : '', ...slot.chemistry]
          .filter(Boolean)
          .join(' · ') +
        `</div>`
      : '')
  );
}

/**
 * ponytail: driven from paintHud by watching the id change, rather than wired
 * into each of the four places the batter can turn over (new at-bat, new
 * inning, new encounter, lineup edit). One check catches all four, and cannot
 * fall out of step with a fifth.
 */
let cardShownFor: string | null = null;
let cardTimer = 0;
/**
 * On screen for the whole walk-up and gone by the time the ball is released —
 * derived from the pacing above rather than typed twice, so retuning the beat
 * cannot leave the card hanging over a live pitch.
 */
const CARD_MS = DONE_MS + WALKUP_MS - 300;

function announceBatter(slot: LineupSlot, order: number): void {
  // Nothing is announced behind the title screen, the shop, or the pause menu.
  // Returning BEFORE recording the id is the point: the card is still owed, so
  // it fires on the first paint after the overlay clears rather than being
  // silently spent while nobody could see it.
  if (blocked()) return;
  if (slot.player.id === cardShownFor) return;
  cardShownFor = slot.player.id;

  const card = el('batter-card');
  card.innerHTML = batterCard(slot, order);
  card.hidden = false;
  // Next frame, so the transition has a start state to move from.
  requestAnimationFrame(() => card.classList.add('show'));

  clearTimeout(cardTimer);
  cardTimer = window.setTimeout(() => {
    card.classList.remove('show');
    // Hide only after the fade, or it snaps out.
    cardTimer = window.setTimeout(() => (card.hidden = true), 320);
  }, CARD_MS);
}

/** Park the card next to the cursor, nudged back inside the window. */
function placeTip(e: MouseEvent): void {
  const tip = el('tip');
  const r = tip.getBoundingClientRect();
  const x = Math.min(e.clientX + 16, window.innerWidth - r.width - 8);
  const y = Math.min(e.clientY + 16, window.innerHeight - r.height - 8);
  tip.style.left = `${Math.max(8, x)}px`;
  tip.style.top = `${Math.max(8, y)}px`;
}

function wireTips(): void {
  const tip = el('tip');
  const named = (t: EventTarget | null): HTMLElement | null =>
    t instanceof Element ? t.closest<HTMLElement>('[data-player]') : null;

  document.addEventListener('mouseover', (e) => {
    const host = named(e.target);
    if (!host) return;
    const p = POOL.find((x) => x.id === host.dataset.player);
    if (!p) return;
    tip.innerHTML = playerTip(p);
    tip.hidden = false;
    placeTip(e);
  });

  document.addEventListener('mousemove', (e) => {
    if (!tip.hidden && named(e.target)) placeTip(e);
  });

  document.addEventListener('mouseout', (e) => {
    if (named(e.target) && !named(e.relatedTarget)) tip.hidden = true;
  });
}

function runSummary(): string {
  const rows = run.history
    .map(
      (r, i) =>
        `<tr><td>${i + 1}</td><td>${r.era}</td><td class="${r.won ? 'w' : 'l'}">${r.runs}-${r.against}</td><td>$${r.payday}</td></tr>`,
    )
    .join('');
  const won = run.history.filter((r) => r.won).length;
  return (
    `<table id="summary">${rows}</table>` +
    `<p>${won} won, ${run.history.length - won} lost.</p>`
  );
}

/**
 * A draftable player. Signing appends to the batting order, so the preview
 * shows what the new man does to the hitter he lands behind — that is the
 * decision, not the raw stat line.
 */
function playerCard(p: Player): HTMLElement {
  const div = document.createElement('div');
  div.className = 'pcard';

  const preview = resolveLineup([...signed, p], run.equipped);
  const gained = preview.flatMap((s) => s.chemistry).filter((c, i, a) => a.indexOf(c) === i);
  const before = lineup.flatMap((s) => s.chemistry);
  const fresh = gained.filter((c) => !before.includes(c));

  div.innerHTML =
    // Which hand he bats from belongs on the SIGNING card, not just the
    // namecard: with the platoon split in, an all-right-handed roster is a
    // roster the next left-hander shuts down, and that is a decision made here.
    `<span class="pera">${p.build.toUpperCase()} · ${p.trait} · bats ${p.bats}</span>` +
    `<span class="pname" data-player="${p.id}">${p.name}</span>` +
    // Bat speed belongs on the SIGNING card as much as the walk-up one: a
    // 1.55-power augment is a different thing to time than the 0.7 human he
    // replaces, and that is the decision being made on this screen.
    `<span class="pstat">pow ${p.power.toFixed(2)} · con ${p.contact.toFixed(2)} · clu ${p.clutch.toFixed(2)} · ${batSpeedLabel(p.power)}</span>` +
    (fresh.length ? `<span class="chem">${fresh.join(', ')}</span>` : '<span class="dim">no new chemistry</span>');

  // Signing is no longer free. The price climbs with the roster, so the ninth
  // man costs what a legendary does and "sign everyone" stops being automatic.
  const cost = signCost(signed.length);
  const full = signed.length >= MAX_ROSTER;

  const btn = document.createElement('button');
  btn.textContent = full ? 'Roster full' : `Sign $${cost}`;
  btn.disabled = full || run.money < cost;
  btn.addEventListener('click', () => {
    if (signed.length >= MAX_ROSTER || run.money < cost) return;
    run = sign(run, signed.length);
    signed = [...signed, p];
    lineup = resolveLineup(signed, run.equipped);
    sfxBuy();
    paintHud();
    // One signing per stop, so the roster grows at the pace of the run.
    for (const other of el('draft').querySelectorAll('button')) other.disabled = true;
    btn.textContent = 'Signed';
    paintLineupEditor();
    repriceOffers();
  });
  div.appendChild(btn);
  return div;
}

/**
 * A shop item, and the hands it goes into.
 *
 * The <select> IS the new decision. An item with nobody to hand it to is not
 * buyable, and the option list marks who doubles it — so the shop asks "who
 * gets this" instead of "can you afford this".
 *
 * ponytail: a native <select>, not a drag target or a modal. Swap it when the
 * assignment needs to be undoable.
 */
function card(item: PowerUp): HTMLElement {
  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML =
    `<span class="rarity r-${item.rarity}">${item.rarity.toUpperCase()}</span>` +
    `<span class="name">${item.name}</span>` +
    `<span class="desc">${item.description}</span>` +
    (item.synergy ? `<span class="chem">×2 for ${item.synergy.build ?? item.synergy.trait} — ${item.synergy.label}</span>` : '');

  const free = signed.filter((p) => !run.equipped[p.id]);
  const who = document.createElement('select');
  const s = item.synergy;
  const doubles = (p: Player) => !!s && (!s.build || s.build === p.build) && (!s.trait || s.trait === p.trait);
  who.innerHTML = free
    .map((p) => `<option value="${p.id}">${p.name}${doubles(p) ? ' ×2' : ''}</option>`)
    .join('');
  div.appendChild(who);

  const kitFull = ownedItems(run).length >= MAX_ITEMS;
  const btn = document.createElement('button');
  btn.textContent = kitFull ? `Kit full (${MAX_ITEMS})` : `Buy $${item.cost}`;
  btn.dataset.cost = String(item.cost);
  btn.disabled = run.money < item.cost || free.length === 0 || kitFull;
  btn.addEventListener('click', () => {
    const target = who.value;
    if (!target || run.money < item.cost || ownedItems(run).includes(item.id)) return;
    run = buy(run, item, target);
    lineup = resolveLineup(signed, run.equipped);
    sfxBuy();
    btn.textContent = 'Bought';
    btn.dataset.bought = 'y';
    who.disabled = true;
    paintHud();
    paintLineupEditor();
    repriceOffers();
  });
  div.appendChild(btn);
  return div;
}

/**
 * Buying one item can put another out of reach — or fill the kit outright.
 *
 * The holder lists go stale too: a player who just took an item cannot take a
 * second, so drop them from every other card rather than letting buy() throw.
 */
function repriceOffers(): void {
  const kitFull = ownedItems(run).length >= MAX_ITEMS;
  for (const sel of el('offers').querySelectorAll<HTMLSelectElement>('select')) {
    if (sel.disabled) continue;
    for (const opt of [...sel.options]) if (run.equipped[opt.value]) opt.remove();
  }
  for (const btn of el('offers').querySelectorAll<HTMLButtonElement>('button')) {
    const sel = btn.parentElement!.querySelector('select');
    btn.disabled =
      btn.dataset.bought === 'y' ||
      kitFull ||
      run.money < Number(btn.dataset.cost) ||
      (!!sel && sel.options.length === 0);
  }
}

function startNextMatch(): void {
  el('shop').hidden = true;
  pitcher = pitcherFor(currentDivision(run), run.match);
  match = newMatch(INNINGS_PER_MATCH, simOpponent(currentDivision(run), INNINGS_PER_MATCH, rng));
  atBat = newAtBat();
  pitchesThisAtBat = [];
  phase = { kind: 'idle' };
  lastOffset = null;
  resetTally();
  paintHud();
  sayScoutingReport();
}

/**
 * Who is on the mound and what he throws.
 *
 * This line existed and was EMPTY — `<b></b> — <i></i>`, every interpolation
 * gone, so the pitcher took the mound anonymously. Filling it in matters more
 * now than it did: the pitcher rework moved the skill from memorising a fixed
 * pattern to reading a plan, and a plan the player is never told is not a plan,
 * it is noise. The out pitch named here is the fact the whole two-strike count
 * turns on.
 */
function sayScoutingReport(): void {
  say(
    `<b>${pitcher.name}</b> — <i>${pitcher.blurb}</i><br>` +
      `<span class="scout">${scoutingReport(pitcher)}</span>`,
  );
}

// ---------------------------------------------------------------------- draw

function ballProgress(now: number, launchMs: number, arrivalMs: number): number {
  return (now - launchMs) / (arrivalMs - launchMs);
}

/**
 * The field.
 *
 * A background asset, if there is one, replaces the flat fill and the dirt —
 * `assets/field/background.png`, or one per division (`holdouts.png`) so the
 * three leagues can look as different as their palettes say they are.
 *
 * THE STRIKE ZONE AND THE PLATE ARE ALWAYS DRAWN ON TOP, asset or not. They
 * are not scenery: the zone is the only thing telling the player what a strike
 * is, and burying it under someone's artwork would remove the game's own
 * readout. An asset that wants to include a painted plate can — this one just
 * sits over it.
 */
function drawField(): void {
  const div = division();
  if (!drawSprite(ctx, 'field', W / 2, H / 2, { id: div.id, name: 'background' })) {
    // The era owns the palette. Dead-ball is sepia, the future is neon.
    ctx.fillStyle = div.palette.field;
    ctx.fillRect(0, 0, W, H);

    // Dirt mound and the plate area.
    ctx.fillStyle = div.palette.dirt;
    ctx.beginPath();
    ctx.ellipse(W / 2, MOUND_Y + 20, 74, 26, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Strike zone, drawn where the ball crosses.
  ctx.strokeStyle = 'rgba(216,216,192,0.45)';
  ctx.lineWidth = 2;
  ctx.strokeRect(W / 2 - 55, PLATE_Y - 96, 110, 96);

  ctx.fillStyle = '#d8d8c0';
  ctx.beginPath();
  ctx.moveTo(W / 2 - 34, PLATE_Y + 8);
  ctx.lineTo(W / 2 + 34, PLATE_Y + 8);
  ctx.lineTo(W / 2 + 26, PLATE_Y + 22);
  ctx.lineTo(W / 2 - 26, PLATE_Y + 22);
  ctx.closePath();
  ctx.fill();
}

function drawPitcher(windupT: number): void {
  // Leg kick: a crude lean that peaks mid-windup, so release has a beat.
  const lean = Math.sin(Math.min(windupT, 1) * Math.PI) * 12;
  // A left-hander is mirrored, the same way the batter is — one asset, both
  // arms, and the picture agrees with the LHP/RHP on the scouting report.
  if (
    drawSprite(
      ctx,
      'pitchers',
      W / 2 + lean,
      MOUND_Y,
      { name: pitcher.name },
      { flip: pitcher.throws === 'L' },
    )
  ) {
    return;
  }
  ctx.fillStyle = '#c8ccd0';
  ctx.fillRect(W / 2 - 12 + lean, MOUND_Y - 46, 24, 46);
  ctx.fillStyle = '#8a1f1f';
  ctx.fillRect(W / 2 - 12 + lean, MOUND_Y - 46, 24, 14);
}

/*
 * Where the batter stands is BATTER_DX in swing.ts, and where his hands are is
 * now per-pose — they travel, which is the whole reason the rotating-line
 * model had to go.
 *
 * A right-handed hitter stands on the third-base side, and from a camera behind
 * the catcher looking out at the mound, third base is on the left. So the
 * unmirrored drawing is the right-hander, and that is why `flip` means "bats
 * left" everywhere below.
 */

/** Draw one bat pose, hands and all, in plate-relative coordinates. */
function drawBatPose(pose: BatPose, alpha = 1): void {
  const hx = W / 2 + pose.hx;
  const hy = PLATE_Y + pose.hy;
  const tipX = hx + Math.cos(pose.angle) * pose.len;
  const tipY = hy + Math.sin(pose.angle) * pose.len;
  const midX = hx + Math.cos(pose.angle) * pose.len * 0.66;
  const midY = hy + Math.sin(pose.angle) * pose.len * 0.66;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  // Handle, then a fatter barrel over the outer third, so it reads as a bat.
  ctx.strokeStyle = '#b98a4a';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(midX, midY);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();
  ctx.restore();
}

/**
 * The batter, and the bat, drawn as POSES that cut rather than a line that
 * rotates. See the model note in swing.ts — three separate faults died with
 * the rotating-line version, and the third one could not be fixed inside it.
 *
 * The pose at `t === 1` is drawn in the frame swing() grades, so a perfectly
 * timed swing is one you can SEE meet the ball rather than read off a bar
 * afterwards. `swing.test.ts` holds that whatever the pose table says.
 *
 * ponytail: the barrel lands on the middle of the zone, not on this pitch's
 * crossing point. Aiming the bat is a different game (and a harder one); this
 * only has to make the timing legible.
 */
function drawBatter(now: number): void {
  const player = batter().player;
  const since = swingStartedAt === null ? -1 : now - swingStartedAt;
  const swinging = isSwinging(since, swingTravel);
  const pose = swinging ? poseAt(since, swingTravel) : REST_POSE;

  ctx.save();
  // THE WHOLE LEFT-HANDED CASE, IN TWO LINES. Mirroring the canvas about the
  // plate means the swing exists once in this codebase rather than twice —
  // there is no second pose table to keep in step, and a change to the swing
  // cannot land on one side of the plate and not the other.
  if (player.bats === 'L') {
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
  }

  const drawBat = (): void => {
    // Every pose at once, frozen. `__swingGhosts()` in the dev console.
    //
    // Same argument as `__replay`: this animation exists for 340ms at a time
    // and only when you swing, which is not enough to tune a shape by. Two
    // separate faults survived for months precisely because nobody could hold
    // still and look at the thing.
    if (import.meta.env.DEV && swingGhosts) {
      for (const ghost of BAT_POSES) drawBatPose(ghost, 0.28);
    }
    drawBatPose(pose);
  };

  const drawBody = (): void => {
    // `drawSprite` returns false when there is no art for him yet, and the
    // rectangles are the live path until there is — see sprites.ts.
    //
    // The sprite is a STATIC pose and the pose table does the swinging: `turn`
    // opens him up and the hands travel around him. Written once, and every
    // one of the twenty batters inherits it without anyone drawing a frame.
    const bx = W / 2 + BATTER_DX + 13 + pose.turn * 20;
    if (
      drawSprite(ctx, 'batters', bx, PLATE_Y, { id: player.id, name: player.name }, {
        rotate: pose.turn,
      })
    ) {
      return;
    }
    ctx.save();
    ctx.translate(bx, PLATE_Y);
    ctx.rotate(pose.turn);
    ctx.fillStyle = '#c8ccd0';
    ctx.fillRect(-13, -92, 26, 92);
    ctx.fillStyle = '#1f4f8a';
    ctx.fillRect(-13, -92, 26, 16);
    ctx.restore();
  };

  // THE BAT IS ALWAYS DRAWN OVER HIM.
  //
  // ⚠️ It used to go UNDER the body whenever the barrel was further from the
  // plate than the batter — three of the five poses — on the reasoning that a
  // barrel behind him should be occluded by him. Correct in three dimensions
  // and wrong on screen: the body is a solid shape, so the bat simply vanished
  // for most of the swing, and what was left read as a man holding a bat behind
  // his back. Zane: "batters hold bat in front of them, not behind them."
  //
  // Sprite games draw the bat on top for exactly this reason. Occlusion needs
  // art with a silhouette to hide behind, and even then it costs more than it
  // buys — a bat you cannot see is a swing you cannot time.
  drawBody();
  drawBat();

  ctx.restore();
}

const ZONE_TOP = PLATE_Y - 96;
const ZONE_H = 96;
const ZONE_CY = ZONE_TOP + ZONE_H / 2;

/**
 * Where the pitch crosses, in canvas pixels. Off-zone pitches go further.
 *
 * ⚠️ INSIDE AND OUTSIDE ARE RELATIVE TO THE HITTER, and until 2026-08-16 this
 * did not know that. `inside` was hardcoded to −34 — correct for a right-hander
 * on the third-base side, and drawn on completely the wrong side of the plate
 * for a left-hander, who stands on the other one. Adding handedness last
 * session created the bug: the ENGINE was pitching in on the hands while the
 * PICTURE showed the ball off the outside corner.
 *
 * It is purely a rendering fault — applyLocation() in hit.ts reads the word,
 * not the pixels, so nothing was ever mis-scored. It just meant a left-handed
 * hitter could not believe his eyes, which for a timing game is worse.
 */
function crossing(pitch: ThrownPitch, bats: Hand = 'R'): { x: number; y: number } {
  const miss = pitch.inZone ? 1 : 2.1;
  // Toward the batter is negative for a right-hander and positive for a lefty.
  const in$ = bats === 'L' ? 34 : -34;
  // Off the shared grid in hit.ts, so this renderer and the engine renderer
  // cannot disagree about where a spot is.
  const off = locationOffset(pitch.location);
  const dx = off.dx * -in$;
  const dy = off.dy < 0 ? -32 : off.dy > 0 ? 30 : 0;
  return { x: W / 2 + dx * miss, y: ZONE_CY + dy * miss };
}

/**
 * ⚠️ THE PRIVATE breakOffset() IS GONE, and it was wrong in two ways worth
 * naming. It moved three of the six pitch types and left the other three dead
 * straight, and its t^3 never came back to zero — a curveball finished 34px
 * BELOW the spot the engine had already scored it at, so this screen drew the
 * ball crossing somewhere the strike zone disagreed with.
 *
 * movementOf() in core/pitcher.ts is the one answer now, it reads the arm's own
 * break rating, and it lands on the spot. Same reason locationOffset() lives
 * there: two renderers, one geometry, no drift.
 */

function drawBall(pitch: ThrownPitch, progress: number): void {
  const p = Math.max(0, Math.min(progress, 1.3));
  const target = crossing(pitch, batter().player.bats);
  const m = movementOf(pitch.type, p, {
    break: pitcher.break,
    throws: pitcher.throws,
    seed: Math.floor(progress * 1e6),
  });

  // Zone units to pixels, off this screen's own zone. See movementOf().
  const x = W / 2 + (target.x - W / 2) * p + m.dx * 110;
  const y = MOUND_Y + (target.y - MOUND_Y) * p + m.dy * 96;
  // Apparent size goes as 1/distance, not linearly. A linear ramp gives the
  // eye no acceleration to read, so the ball seems to crawl in and arrival is
  // a guess; swelling late is the cue that says "now", and it is the cue you
  // start the bat against.
  const near = Math.min(p, 1);
  const r = 3.2 / (1 - 0.66 * near);

  // The ball asset scales with the SAME 1/distance curve the circle does, so
  // swapping in art cannot flatten the one cue the player times the swing
  // against. `scale` is relative to the spec height, hence the divide.
  if (drawSprite(ctx, 'ball', x, y, { name: 'ball' }, { scale: (r * 2) / SPRITE_SPECS.ball.height })) {
    return;
  }

  ctx.fillStyle = '#f4f4e8';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#c0392b';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.62, -0.7, 0.7);
  ctx.stroke();
}

/**
 * The call, on the field, in big letters. The DOM log under the canvas has
 * the detail; this is the thing you actually read while looking at the ball.
 */
let banner: { text: string; color: string; until: number } | null = null;
function shout(text: string, color: string): void {
  banner = { text, color, until: gameNow() + 1300 };
}

function drawBanner(now: number): void {
  const b = banner!;
  const left = b.until - now;
  if (left <= 0) {
    banner = null;
    return;
  }
  // Punch in fast, fade out slow.
  const age = 1300 - left;
  const scale = age < 110 ? 0.72 + 0.28 * (age / 110) : 1;
  ctx.globalAlpha = Math.min(1, left / 380);
  ctx.save();
  ctx.translate(W / 2, 92);
  ctx.scale(scale, scale);
  ctx.font = 'bold 40px ui-monospace, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(9,14,11,0.9)';
  ctx.strokeText(b.text, 0, 0);
  ctx.fillStyle = b.color;
  ctx.fillText(b.text, 0, 0);
  ctx.restore();
  ctx.globalAlpha = 1;
}


/**
 * Draw the ball after contact. Screen-space projectile, not a physics sim:
 * `depth` carries it up the screen toward the outfield, `height` arcs it.
 *
 * ponytail: no fielders, no fence, no landing detection. The outcome is
 * already decided by the hit engine — this only has to make it look like what
 * it is. Add a fence when the art exists to draw one.
 */
function drawInPlay(now: number): void {
  const b = inPlay!;
  const t = (now - b.startedAt) / 1000;

  const rad = (b.launchAngle * Math.PI) / 180;
  const speed = b.exitVelocity * 2.6;
  const depth = speed * Math.cos(rad) * t;
  const height = speed * Math.sin(rad) * t - 0.5 * 620 * t * t;

  const x = b.from.x + Math.tan((b.direction * Math.PI) / 180) * depth * 1.1;
  const y = b.from.y - depth * 0.42 - height;
  const r = Math.max(2, 9 - depth / 90);

  // Trail, so a screamer reads differently from a lazy fly.
  ctx.strokeStyle = 'rgba(244,244,232,0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(b.from.x, b.from.y);
  ctx.lineTo(x, y);
  ctx.stroke();

  ctx.fillStyle = OUTCOME_COLOR[b.outcome] ?? '#f4f4e8';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  // Gone when it lands, leaves the frame, or the beat is over.
  if (t > 1.5 || y > H + 40 || x < -40 || x > W + 40) inPlay = null;
}


/**
 * Where the swing landed, against THIS batter's windows.
 *
 * The bands are scaled by the batter's contact stat, same as grade() does, so
 * the meter shows the window you actually have rather than the base one. A
 * high-contact hitter can see their green get wider, which is the only place
 * in the game that stat is legible.
 *
 * Drawn wider and taller than the first version, with the number on it — it
 * was small enough to miss entirely.
 */
// ------------------------------------------------------------- the base HUD

/**
 * The base diamond, the count and the outs — one cluster, top left.
 *
 * REFERENCE: the MVP Baseball 2005 game screen (manual p.7) groups exactly
 * these three in the top-left corner and labels the diamond a "baserunning
 * picture-in-picture" — it is a live inset showing the runners, not a static
 * lamp. Score and inning sit apart from it, top centre. That grouping is what
 * is copied here; the art is ours.
 *
 * It lives on the CANVAS rather than in the DOM strip below for the reason the
 * layout exists at all: during a pitch your eye is on the ball, and a count
 * you have to look away to read is a count you do not read. The DOM strip
 * keeps its copies for the between-pitch glance.
 *
 * Drawn after shakeEnd() so the HUD does not shake with the field — MVP's
 * doesn't, and a jittering count is unreadable at the exact moment it matters.
 */
const HUD_X = 16;
const HUD_Y = 14;
const HUD_W = 132;
const HUD_H = 96;
/** Distance from the diamond's centre to a bag. */
const BASE_R = 24;

/**
 * A runner moving between bags — the "picture-in-picture" part of the
 * reference, and the reason this is drawn per-frame instead of painted once.
 */
interface RunnerTween {
  name: string;
  from: number;
  to: number;
  startedAt: number;
}
const RUNNER_TWEEN_MS = 280;
let runnerTweens: RunnerTween[] = [];
let basesSnapshot: Bases = EMPTY_BASES;


/**
 * Spot what moved and start a tween.
 *
 * The diff itself lives in inning.ts next to the state it reads. This checks
 * it once a frame rather than at each mutation site, so the HUD cannot fall
 * out of sync with the bases it is drawing.
 */
function syncRunners(now: number): void {
  if (match.bases === basesSnapshot) return;
  for (const m of runnerMoves(basesSnapshot, match.bases)) {
    runnerTweens.push({ ...m, startedAt: now });
  }
  basesSnapshot = match.bases;
}

function drawBases(now: number): void {
  syncRunners(now);
  runnerTweens = runnerTweens.filter((t) => now - t.startedAt < RUNNER_TWEEN_MS);

  const cx = HUD_X + 46;
  const cy = HUD_Y + 56;

  ctx.save();

  // The panel. Dark enough to read against sepia, neon or grass.
  ctx.fillStyle = 'rgba(8,12,9,0.72)';
  ctx.fillRect(HUD_X, HUD_Y, HUD_W, HUD_H);
  ctx.strokeStyle = 'rgba(216,216,192,0.22)';
  ctx.lineWidth = 1;
  ctx.strokeRect(HUD_X + 0.5, HUD_Y + 0.5, HUD_W, HUD_H);

  // The count, MVP's own ordering: balls then strikes.
  ctx.font = 'bold 17px ui-monospace, Menlo, Consolas, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#e8e8d4';
  ctx.fillText(`${atBat.balls}-${atBat.strikes}`, HUD_X + 10, HUD_Y + 22);
  ctx.font = '9px ui-monospace, Menlo, Consolas, monospace';
  ctx.fillStyle = 'rgba(216,216,192,0.55)';
  ctx.fillText('B-S', HUD_X + 46, HUD_Y + 22);

  // Base paths, so the four bags read as a diamond and not as loose pips.
  ctx.strokeStyle = 'rgba(216,216,192,0.20)';
  ctx.beginPath();
  for (let i = -1; i < 3; i++) {
    const a = basePoint(i, cx, cy, BASE_R);
    const b = basePoint(i + 1 > 2 ? -1 : i + 1, cx, cy, BASE_R);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();

  // The bags. Occupied ones light up; home is always an outline.
  const bag = (i: number, lit: boolean) => {
    const { x, y } = basePoint(i, cx, cy, BASE_R);
    const s = i === -1 ? 5 : 7;
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s, y);
    ctx.lineTo(x, y + s);
    ctx.lineTo(x - s, y);
    ctx.closePath();
    if (lit) {
      ctx.fillStyle = '#f2c14e';
      ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(216,216,192,0.45)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  };

  // A bag whose runner is mid-slide is not lit yet — he has not arrived.
  const arriving = new Set(runnerTweens.map((t) => t.to));
  for (let i = 0; i < 3; i++) bag(i, match.bases[i] !== null && !arriving.has(i));
  bag(-1, false);

  // Runners in transit.
  for (const t of runnerTweens) {
    const k = Math.min(1, (now - t.startedAt) / RUNNER_TWEEN_MS);
    const a = basePoint(t.from, cx, cy, BASE_R);
    const b = basePoint(t.to, cx, cy, BASE_R);
    ctx.fillStyle = '#f2c14e';
    ctx.beginPath();
    ctx.arc(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Outs, as dots. Three of them, because the third ends your inning.
  ctx.font = '9px ui-monospace, Menlo, Consolas, monospace';
  ctx.fillStyle = 'rgba(216,216,192,0.55)';
  ctx.fillText('OUT', HUD_X + 92, HUD_Y + 46);
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(HUD_X + 98 + i * 12, HUD_Y + 60, 4, 0, Math.PI * 2);
    if (i < match.outs) {
      ctx.fillStyle = '#d05a4a';
      ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(216,216,192,0.45)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawTimingBar(offsetMs: number, pitchType: PitchType | null): void {
  const w = 420;
  const x = (W - w) / 2;
  const y = H - 40;
  const c = Math.max(0.1, effectiveContact(pitchType ?? undefined));
  const scale = w / 2 / (TIMING_WINDOWS_MS.contact * c * 1.25);

  ctx.fillStyle = 'rgba(9,14,11,0.55)';
  ctx.fillRect(x - 10, y - 22, w + 20, 44);

  const band = (ms: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(W / 2 - ms * c * scale, y, ms * c * 2 * scale, 16);
  };
  band(TIMING_WINDOWS_MS.contact, '#3a4a30');
  band(TIMING_WINDOWS_MS.good, '#5e7a3e');
  band(TIMING_WINDOWS_MS.perfect, '#a8c25a');

  // Dead centre, so "perfect" has something to be measured against.
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(W / 2 - 0.5, y - 3, 1, 22);

  ctx.fillStyle = '#ffd76a';
  const mark = W / 2 + Math.max(-w / 2, Math.min(offsetMs * scale, w / 2));
  ctx.fillRect(mark - 2, y - 6, 4, 28);

  ctx.font = '11px ui-monospace, monospace';
  ctx.fillStyle = '#7a8a6a';
  ctx.textAlign = 'left';
  ctx.fillText('EARLY', x, y - 8);
  ctx.textAlign = 'right';
  ctx.fillText('LATE', x + w, y - 8);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd76a';
  ctx.fillText(
    `${offsetMs < 0 ? '−' : '+'}${Math.abs(offsetMs).toFixed(0)}ms`,
    W / 2,
    y - 8,
  );

  // The calibration read-out. Once this settles, the yellow mark should sit
  // centred instead of drifting right — that is the latency fix working, and
  // it is the only way to see it from inside the game.
  const cal = settings.timingOffsetMs;
  ctx.fillStyle = '#7a8a6a';
  ctx.fillText(
    `cal ${cal < 0 ? '−' : '+'}${Math.abs(cal).toFixed(0)}ms (${recentOffsets.length})` +
      (settings.autoCalibrate ? '' : ' manual'),
    W / 2,
    y + 32,
  );
}

let lastFrame = gameNow();

function frame(): void {
  // Before anything reads the clock. A menu on screen freezes it, which is
  // what stops the game from playing itself behind the pause screen.
  tickClock(blocked());
  const now = gameNow();
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  const elapsed = now - lastFrame;
  lastFrame = now;

  // Hitstop: hold the batted ball in place by pushing its start time forward,
  // so the freeze delays the flight instead of skipping part of it. The replay
  // is pushed the same way or the freeze would eat the front of the cut.
  if (isStopped(now) && inPlay) inPlay.startedAt += elapsed;
  if (isStopped(now) && replay) replay.startedAt += elapsed;
  if (replay && now - replay.startedAt > replayLength(replay)) replay = null;

  shakeBegin(ctx, now);
  drawField();

  let windupT = 0;
  let progress = -1;

  if (phase.kind === 'windup') {
    windupT = (now - phase.startedAt) / WINDUP_MS;
    if (windupT >= 1) {
      // RELEASE. This is the only moment that matters, and it is a timestamp.
      // The previous swing's meter clears HERE, not when the next pitch is
      // queued — it used to vanish the instant the windup began, which left
      // far too little time to read it.
      lastOffset = null;
      const launchMs = now;
      phase = {
        kind: 'flight',
        pitch: phase.pitch,
        launchMs,
        arrivalMs: ballArrivalMs(launchMs, phase.pitch.speedMph * division().speedMult * settings.pitchSpeed),
      };
      if (phase.pitch.tell?.timing === 'release') say(`looks like a <b>${phase.pitch.tell.pitch}</b>`);
    }
  }

  if (phase.kind === 'flight') {
    windupT = 1;
    progress = ballProgress(now, phase.launchMs, phase.arrivalMs);

    // THE BARREL ARRIVES. Graded here, in the frame the bat is drawn crossing
    // the plate, so the outcome and the picture of the outcome are one event.
    // The timestamp handed to swing() is the exact contact moment, not this
    // frame's clock — rAF decides when to draw, never when anything happens.
    if (swingStartedAt !== null && !swingResolved && now >= swingStartedAt + swingTravel) {
      swingResolved = true;
      swing(swingStartedAt + swingTravel);
    }
    // Past the plate with no swing is a take, decided by the clock not a frame.
    //
    // The window has to be THIS BATTER'S, not the base one. grade() scales
    // every window by the contact stat, so a 1.35-contact dead-ball hitter can
    // still make contact well past 80ms. Closing at the base number stole the
    // back half of their own window and made a high contact stat partly
    // unusable — they could never swing late however good they were.
    //
    // `phase` may already be 'done' here — swing() above resolves the at-bat
    // and finishes the pitch — so this reads the phase again rather than
    // trusting the narrowing from the top of the block. A swing in the air is
    // not a take, however long the bat is taking to get there.
    if (
      phase.kind === 'flight' &&
      swingStartedAt === null &&
      now > perceivedArrival(phase.arrivalMs) + swingWindowMs(phase.pitch.type)
    ) {
      take();
    }
  }

  if (phase.kind === 'done') {
    windupT = 1;
    if (now > phase.until) {
      phase = { kind: 'idle' };
      if (!match.over) nextPitch();
      else endMatch();
    }
  }

  drawPitcher(windupT);
  drawBatter(now);
  if (progress >= 0 && phase.kind === 'flight') drawBall(phase.pitch, progress);
  if (inPlay) drawInPlay(now);
  drawSparks(ctx, dt);

  // The cut. Painted over the batter's view rather than instead of it, so the
  // dissolve is one globalAlpha and neither view needs to know about the
  // other. The timing bar and the banner draw ON TOP of it on purpose — those
  // are feedback about the swing, and the camera moving should not take them
  // away at the moment they are being read.
  const oh = overheadAlpha(replay, now);
  if (oh > 0 && replay) {
    ctx.globalAlpha = oh;
    const pal = division().palette;
    drawOverhead(ctx, OH_CAM, replay, now, { field: pal.field, dirt: pal.dirt, sfx: playSfx });
    ctx.globalAlpha = 1;
  }

  if (lastOffset !== null && settings.timingBar) drawTimingBar(lastOffset, lastPitchType);
  if (banner) drawBanner(now);
  shakeEnd(ctx);
  // After shakeEnd: the HUD is bolted to the screen, not to the field.
  // Held back while the camera is overhead: the bases behind it already show
  // the finished play, and a runner appearing on second before the ball lands
  // spoils the replay it is sitting on top of.
  if (oh < 0.5) drawBases(now);

  requestAnimationFrame(frame);
}

// --------------------------------------------------------------------- chrome

function say(html: string): void {
  el('log').innerHTML = html;
}

/** The line score: their half already played, yours filling in. */
function paintScoreboard(): void {
  const league = currentDivision(run);
  const head = el('sb-innings');
  const away = el('sb-away');
  const home = el('sb-home');

  head.innerHTML = '<th class="team"></th>';
  away.innerHTML = `<td class="team">${OPPONENT_NAME(league)}</td>`;
  home.innerHTML = '<td class="team">YOU</td>';

  for (let i = 0; i < match.innings; i++) {
    head.innerHTML += `<th>${i + 1}</th>`;
    away.innerHTML += `<td>${match.opponentByInning[i] ?? 0}</td>`;
    // Your current inning shows a dash until it is in the books.
    const mine = match.byInning[i];
    home.innerHTML += `<td>${mine ?? (i + 1 === match.inning ? '·' : '')}</td>`;
  }

  head.innerHTML += '<th class="tot">R</th>';
  away.innerHTML += `<td class="tot">${opponentRuns(match)}</td>`;
  home.innerHTML += `<td class="tot">${match.runs}</td>`;
  home.classList.toggle('batting', !match.over);
}

function paintHud(): void {
  el('count').textContent = `${atBat.balls}-${atBat.strikes}`;
  el('outs').textContent = String(match.outs);
  el('inning').textContent = `${match.inning}/${match.innings}`;
  el('money').textContent = String(run.money);
  paintScoreboard();
  el('encounter').textContent = String(encounterNumber(run));
  const e = division();
  el('league').textContent = `${e.rank} · ${e.name}`;

  // Who is up, and what their neighbour is doing for them.
  const b = batter();
  el('batter').innerHTML =
    `<b data-player="${b.player.id}">${b.player.name}</b> <span class="dim">(${b.player.build})</span>` +
    (b.chemistry.length ? ` — <span class="chem">${b.chemistry.join(', ')}</span>` : '');
  announceBatter(b, atBatIndex % lineup.length);
  const next = lineup[(atBatIndex + 1) % lineup.length]!.player;
  el('ondeck').innerHTML = `<span data-player="${next.id}">${next.name}</span>`;

  // The steal prompt only exists when there is somebody to send, and it shows
  // the odds — sending a 0.6-speed machine is a choice, not a mistake.
  const send = leadRunner();
  el('steal').innerHTML = send
    ? `<b>S</b> send <b>${send.runner.name}</b> — ${Math.round(stealChance(send.runner.speed, send.from + 1) * 100)}%`
    : '';

  // The stance, and what it is currently costing or buying. Naming the live
  // one matters more than naming the toggle: two strikes silently widens the
  // window and drops the power, and a hitter who is not told that will read it
  // as the game getting easier for no reason.
  const sit = el('sit');
  sit.classList.toggle('armed', sittingOnIt);
  sit.textContent = sittingOnIt
    ? 'SITTING ON IT'
    : atBat.strikes >= 2
      ? 'shortened up'
      : 'sit on it (P)';

  // The owner's patience, as dots, followed by what THIS league's loss costs.
  // The stake has to be on screen or the escalation is invisible until it
  // fires you — the dots alone read the same in the Foundry as the Holdouts.
  // The empty dots run to MAX_PATIENCE, not a hardcoded 3, so the banked
  // fourth point has somewhere to show up.
  const cost = lossCost(run.leagueIndex);
  const pat = el('patience');
  pat.textContent =
    '•'.repeat(run.patience) + '·'.repeat(Math.max(0, MAX_PATIENCE - run.patience));
  el('stake').textContent = `a loss costs ${cost}`;
  // Amber when the next loss in THIS league would end the run, rather than at
  // a fixed one dot — in the Foundry that warning has to arrive three dots out.
  pat.classList.toggle('low', run.patience <= cost);
  el('pitcher').textContent = pitcher.name;
  // The kit reads as who-carries-what now, because that is what it is.
  const carried = lineup.filter((s) => s.item);
  el('kit').innerHTML = carried.length
    ? `kit: ${carried
        .map(
          (s) =>
            `<span data-player="${s.player.id}">${s.player.name}</span>: ` +
            `<b>${s.item!.name}</b>${s.item!.synergised ? ' ×2' : ''}`,
        )
        .join(' · ')}`
    : '';
}

// ------------------------------------------------------------------ screens

/** True when anything is covering the field, so input must not reach the game. */
const blocked = (): boolean =>
  !el('shop').hidden || !el('menu').hidden || !el('pause').hidden || !el('settings').hidden;

function showScreen(id: string): void {
  el(id).hidden = false;
}

/**
 * Pause. The clock itself stops in clock.ts — that is what actually pauses the
 * game, and it is what this function used to be missing.
 *
 * A pitch already in the air is still thrown out rather than frozen, but the
 * reason has changed. The old reason was that a paused clock would desync the
 * simulation from the screen; gameNow() shifts both together, so that is no
 * longer true. What is left is a game-feel call: resuming into a ball frozen
 * halfway to the plate gives away the read. No strike is charged. Delete the
 * three lines below if freezing mid-flight plays better.
 */
function togglePause(): void {
  if (!el('menu').hidden || !el('shop').hidden) return;
  if (!el('settings').hidden) return closeSettings();

  if (el('pause').hidden) {
    if (phase.kind === 'windup' || phase.kind === 'flight') {
      phase = { kind: 'idle' };
      // A bat mid-swing when the pitch is thrown out has nothing to swing at.
      swingStartedAt = null;
      say('pitch thrown out — resume for a new one.');
    }
    showScreen('pause');
  } else {
    el('pause').hidden = true;
  }
}

function openSettings(): void {
  paintSettings();
  showScreen('settings');
}

function closeSettings(): void {
  el('settings').hidden = true;
  saveSettings();
}

function paintSettings(): void {
  const speedIndex = Math.max(
    0,
    SPEED_LABELS.findIndex((s) => s.value === settings.pitchSpeed),
  );
  (el('s-volume') as HTMLInputElement).value = String(settings.volume);
  el('s-volume-out').textContent = `${Math.round(settings.volume * 100)}%`;
  (el('s-speed') as HTMLInputElement).value = String(speedIndex);
  el('s-speed-out').textContent = SPEED_LABELS[speedIndex]!.label;
  (el('s-shake') as HTMLInputElement).checked = settings.shake;
  (el('s-hitstop') as HTMLInputElement).checked = settings.hitstop;
  (el('s-timingbar') as HTMLInputElement).checked = settings.timingBar;
  (el('s-offset') as HTMLInputElement).value = String(settings.timingOffsetMs);
  paintOffsetLabel();
}

function paintOffsetLabel(): void {
  const ms = Math.round(settings.timingOffsetMs);
  el('s-offset-out').textContent =
    `${ms < 0 ? '−' : '+'}${Math.abs(ms)}ms` + (settings.autoCalibrate ? ' (auto)' : '');
}

function startRun(): void {
  el('menu').hidden = true;
  el('pause').hidden = true;
  clearRun();
  run = newRun();
  signed = startingLineup(rng);
  lineup = resolveLineup(signed, run.equipped);
  atBatIndex = 0;
  startNextMatch();
}

/**
 * Pick a run back up where it was left.
 *
 * Restoring the generator mid-stream is what makes this a resume rather than a
 * reroll: the encounter you get is the encounter you would have got. Returns
 * false if the save is gone or unreadable, so the caller can fall back to a
 * fresh run instead of stranding the player on the menu.
 */
function resumeRun(): boolean {
  const s = loadRun();
  if (!s) return false;

  const roster = s.signed
    .map((id: string) => POOL.find((p) => p.id === id))
    .filter(Boolean) as Player[];
  // An id that no longer exists means the POOL changed under a save from an
  // older build. Half a lineup is worse than none.
  if (roster.length !== s.signed.length) {
    clearRun();
    return false;
  }

  rng = makeRng(0, s.rng);
  run = s.run;
  signed = roster;
  lineup = resolveLineup(signed, run.equipped);
  atBatIndex = s.atBatIndex;

  el('menu').hidden = true;
  el('pause').hidden = true;
  startNextMatch();
  return true;
}

/**
 * Write the save. Called once a match is in the books, which is the only
 * boundary where there is no pitch, no swing and no runner in motion to
 * reconstruct.
 */
function saveProgress(): void {
  if (run.over) {
    clearRun();
    return;
  }
  saveRun({ rng: rng.state(), run, signed: signed.map((p) => p.id), atBatIndex });
}

function act(at: number): void {
  if (blocked()) return;
  // `at` arrives on the wall clock. The ball is on the game clock.
  if (phase.kind === 'idle' && !match.over) nextPitch();
  else startSwing(toGameTime(at));
}

// Browsers refuse audio until a gesture, so every input path wakes it first.
canvas.addEventListener('pointerdown', (e) => {
  wakeAudio();
  act(e.timeStamp);
});
window.addEventListener('keydown', (e) => {
  wakeAudio();
  if (e.code === 'Escape') {
    e.preventDefault();
    return togglePause();
  }
  if (e.code === 'Space') {
    e.preventDefault();
    act(e.timeStamp);
  }
  if (e.key.toLowerCase() === 't' && !blocked()) take();
  if (e.key.toLowerCase() === 's' && !blocked()) steal();
  if (e.key.toLowerCase() === 'p') toggleSitOnIt();
});

el('next').addEventListener('click', startNextMatch);
el('start').addEventListener('click', startRun);
el('newrun').addEventListener('click', startRun);

/**
 * Offer the resume, and say what it is.
 *
 * Run once at load. The save only changes between matches, and the title
 * screen is only reachable before the first one — so there is nothing to keep
 * in sync and no need to re-check.
 */
function offerResume(): void {
  const s = loadRun();
  const btn = el('continue');
  const note = el('save-note');
  if (!s) return;

  btn.hidden = false;
  note.hidden = false;
  const div = DIVISIONS[currentDivision(s.run)];
  note.textContent = `encounter ${encounterNumber(s.run)}/9 · ${div.name} · $${s.run.money}`;
  // A failed resume falls back rather than stranding the player on a menu with
  // a button that does nothing.
  btn.addEventListener('click', () => {
    if (!resumeRun()) {
      btn.hidden = true;
      note.hidden = true;
    }
  });
}
offerResume();

/**
 * Say how many assets the build found, on the title screen, in dev only.
 *
 * The one question you have after dropping a PNG into assets/ is "did it pick
 * that up?" — and without this the answer is indistinguishable from "my art is
 * wrong", because both look like a rectangle. Vite folds the guard to false
 * and drops this from the demo build, same as `__replay`.
 *
 * Runs AFTER offerResume(), which writes to the same element.
 */
if (import.meta.env.DEV) {
  const n = assetCount();
  const note = el('save-note');
  note.hidden = false;
  note.textContent = [note.textContent, `${n} asset${n === 1 ? '' : 's'} loaded`]
    .filter(Boolean)
    .join(' · ');
}
el('reroll').addEventListener('click', () => {
  const cost = rerollCost(rerolls);
  if (run.money < cost) return;
  run = { ...run, money: run.money - cost };
  rerolls++;
  sfxBuy();
  paintOffers();
  paintHud();
});
el('resume').addEventListener('click', togglePause);
// T, S and ESC are keyboard-only, and a phone has no keyboard. The take is
// already handled by the clock, so these two are the whole gap.
el('pause-btn').addEventListener('click', togglePause);
el('steal').addEventListener('click', steal);
el('sit').addEventListener('click', toggleSitOnIt);
el('quit').addEventListener('click', () => {
  el('pause').hidden = true;
  el('shop').hidden = true;
  showScreen('menu');
});

for (const b of document.querySelectorAll<HTMLButtonElement>('button[data-open]')) {
  b.addEventListener('click', openSettings);
}
el('s-close').addEventListener('click', closeSettings);
el('s-reset').addEventListener('click', () => {
  resetSettings();
  // Defaults put the offset back to 0, so the samples behind it have to go too
  // or the next swing restores the old number from a stale window.
  recentOffsets.length = 0;
  applyVolume();
  paintSettings();
});

el('s-volume').addEventListener('input', (e) => {
  settings.volume = Number((e.target as HTMLInputElement).value);
  el('s-volume-out').textContent = `${Math.round(settings.volume * 100)}%`;
  applyVolume();
  saveSettings();
});
el('s-speed').addEventListener('input', (e) => {
  const choice = SPEED_LABELS[Number((e.target as HTMLInputElement).value)]!;
  settings.pitchSpeed = choice.value;
  el('s-speed-out').textContent = choice.label;
  saveSettings();
});
// Touching the slider is the player saying they'd rather set this themselves,
// so auto-calibration stops fighting them for it.
el('s-offset').addEventListener('input', (e) => {
  settings.timingOffsetMs = Number((e.target as HTMLInputElement).value);
  settings.autoCalibrate = false;
  paintOffsetLabel();
  saveSettings();
});
el('s-recal').addEventListener('click', () => {
  resetCalibration();
  paintSettings();
});
for (const [id, key] of [
  ['s-shake', 'shake'],
  ['s-hitstop', 'hitstop'],
  ['s-timingbar', 'timingBar'],
] as const) {
  el(id).addEventListener('change', (e) => {
    settings[key] = (e.target as HTMLInputElement).checked;
    saveSettings();
  });
}

wireTips();
paintHud();
requestAnimationFrame(frame);
