/**
 * Playing an at-bat out, without a human in the loop.
 *
 * Used three ways, which is why it lives apart from both the UI and the AI:
 *
 *   - the half-innings where the COMPUTER hits and the player pitches
 *   - the headless whole-game sim, for balance work and for the tests
 *   - the CLI
 *
 * The human-batting path does NOT come through here. That one is driven by a
 * real clock and a real pointer event in the web layer, because the swing is
 * the game and it cannot be a dice roll on the player's side.
 */

import { makeRng, type Rng } from '../core/rng.ts';
import { newAtBat, swingAt, takePitch, isOver, type AtBatState } from '../core/atBat.ts';
import { resolveSwing, type SwingInput } from '../core/hit.ts';
import { grade } from '../core/timing.ts';
import type { PitchType } from '../core/hitTables.ts';
import { stuffFactor, type ThrownPitch, type Pitcher, type Situation } from '../core/pitcher.ts';
import {
  aiSwing,
  callPitch,
  newRead,
  shouldBunt,
  pinchHitter,
  type Read,
} from './ai.ts';
import {
  currentBatter,
  currentPitcher,
  recordPlay,
  battingSide,
  fieldingSide,
  stateOf,
  countPitch,
  goToBullpen,
  benchOf,
  pinchHit,
  fieldingStaff,
  fieldingAlignment,
  battingTeam,
  fieldingTeam,
  type GameState,
  type PlayLog,
  type Side,
} from './game.ts';
import { statsOf, HOME, AWAY } from './teams.ts';
import { fatigue, shouldRelieve } from './bullpen.ts';
import { fieldBall } from './defense.ts';
import { aiShouldSend, sendRunner, rollWildPitch, type WildPitch } from './running.ts';
import { withPlacement } from './placement.ts';
import { FOUL_BOOST, HOME_EDGE } from './tuning.ts';
import { newGame } from './game.ts';
import { knob } from './identity.ts';
import { pickReliever } from './rotation.ts';
import type { StarterPick } from './game.ts';

/**
 * THE CLUB'S PERSONALITY, READ OFF WHICHEVER SIDE IS DOING THE THING.
 *
 * ⚠️ Read here rather than passed down from a caller, and read from the SIDE
 * rather than from a fixed club: half of these functions run in the top half
 * and half in the bottom, and a game where the away club's identity governed
 * both halves is a game with one manager in it. game.ts already answers "whose
 * turn is it" in one call, so this is a lookup and not state.
 */
const battingKnob = (g: GameState, k: 'aggression' | 'running' | 'bunt'): number =>
  knob(battingTeam(g).identity, k);

const fieldingHook = (g: GameState): number => knob(fieldingTeam(g).identity, 'hook');

/** The crowd, and only the crowd. See HOME_EDGE in tuning.ts. */
const crowd = (g: GameState): number => (battingSide(g) === 'home' ? HOME_EDGE : 1);

/** How the pitch gets chosen when the COMPUTER is hitting. */
export type PitchCaller = (count: { balls: number; strikes: number }, sit: Situation) => ThrownPitch;

export interface AtBatLog {
  pitches: number;
  /** What ended it. */
  kind: 'walk' | 'hit_by_pitch' | 'strikeout' | 'in_play';
  outcome?: string;
  guesses: (PitchType | null)[];
  /** The defence booted it. Counted so balance.ts can see the error rate. */
  error?: boolean;
  /** He squared up at least once. Counted for the same reason errors are. */
  bunt?: boolean;
}

/**
 * Play one at-bat where the computer is the hitter.
 *
 * `caller` is how the pitch gets picked. Pass the player's chosen pitch to let
 * a human call the game; pass a callPitch() closure to let the computer pitch
 * to itself, which is what the headless sim does.
 */
export function playAiAtBat(
  g: GameState,
  caller: PitchCaller,
  read: Read,
  rng: Rng,
): { game: GameState; log: PlayLog; atBat: AtBatLog } {
  const batter = currentBatter(g);
  const stats = statsOf(batter);
  const pitcher = currentPitcher(g);
  // Fixed for the whole at-bat: nobody gets tired between two pitches, and
  // reading it once keeps the hitter facing the same arm he started against.
  const tired = fatigue(fieldingStaff(g));

  let ab: AtBatState = newAtBat();
  const previous: PitchType[] = [];
  const guesses: (PitchType | null)[] = [];
  let pitches = 0;
  let bunted = false;

  // A safety valve, not a rule. An at-bat cannot actually run forever — fouls
  // with two strikes are the only way to stay alive and they are a minority
  // outcome — but an infinite loop in a game loop is worse than a strikeout.
  while (!isOver(ab) && pitches < 30) {
    const sit: Situation = {
      previous,
      firstBaseOpen: g.bases[0] === null,
      batterPower: stats.power,
      outs: g.outs,
    };
    const pitch = caller({ balls: ab.balls, strikes: ab.strikes }, sit);
    previous.push(pitch.type);
    pitches++;

    const risp = g.bases[1] !== null || g.bases[2] !== null;
    // The arm's break and clutch, on the same dial the platoon split turns.
    const stuff = stuffFactor(pitcher, pitch.type, { runnersInScoringPosition: risp });

    // THE BUNT IS DECIDED BEFORE THE SWING, because it is a different act. A
    // squared-up bunter offers at strikes and pulls it back on anything else —
    // there is no chasing a ball with the bat already out over the plate.
    const bunting = shouldBunt(stats, {
      count: ab,
      outs: g.outs,
      bases: g.bases.map((b) => b !== null),
      deficit: stateOf(g, fieldingSide(g)).runs - stateOf(g, battingSide(g)).runs,
      inning: g.inning,
      bunt: battingKnob(g, 'bunt'),
    });
    if (bunting) {
      bunted = true;
      guesses.push(null);
      if (!pitch.inZone) {
        ab = takePitch(ab, false, pitch.hitBatter);
        continue;
      }
      ab = swingAt(
        ab,
        { offsetMs: 0, pitchType: pitch.type, location: pitch.location, stats, isBunt: true },
        rng,
      );
      continue;
    }

    const decision = aiSwing(
      pitch,
      {
        count: ab,
        stats,
        pitcherFatigue: tired,
        aggression: battingKnob(g, 'aggression'),
        barrel: crowd(g),
      },
      read,
      rng,
    );
    guesses.push(decision.guess);

    if (!decision.swing) {
      ab = takePitch(ab, pitch.inZone, pitch.hitBatter);
      continue;
    }

    const input: SwingInput = {
      offsetMs: decision.offsetMs,
      pitchType: pitch.type,
      location: pitch.location,
      stats,
      batterHand: batter.bats,
      pitcherHand: pitcher.throws,
      twoStrikes: ab.strikes >= 2,
      runnersInScoringPosition: risp,
      stuff,
      foulBoost: FOUL_BOOST,
    };
    ab = swingAt(ab, input, rng);
  }

  // Ran out of patience: call it a strikeout rather than leaving a live at-bat
  // on the field. Unreachable in practice; see the loop guard above.
  if (!isOver(ab)) {
    const forced = recordPlay(g, { kind: 'strikeout' });
    return { ...forced, atBat: { pitches, kind: 'strikeout', guesses, bunt: bunted } };
  }

  // Where it landed decides what the hit is worth. See placement.ts.
  const result = withPlacement(ab.result!).result;
  // The defence now has people in it: who the ball was hit at decides how
  // likely it is to be booted. See defense.ts.
  const fielding =
    result.kind === 'in_play'
      ? fieldBall(
          result.hit,
          fieldingAlignment(g),
          { batterSpeed: batter.speed, forceAtFirst: g.bases[0] !== null, outs: g.outs },
          rng,
        )
      : undefined;

  // Charge the pitches to the arm BEFORE the at-bat is folded in, so the man
  // who threw them wears them even if the third out changes who is pitching.
  let charged = g;
  for (let i = 0; i < pitches; i++) charged = countPitch(charged);

  const played = recordPlay(charged, result, fielding);
  return {
    ...played,
    atBat: {
      pitches,
      kind: result.kind,
      outcome: result.kind === 'in_play' ? result.hit.outcome : undefined,
      guesses,
      error: fielding?.error,
      bunt: bunted,
    },
  };
}

/**
 * A pitch caller that lets the computer pitch to itself. The headless case.
 */
export const autoCaller =
  (pitcher: Pitcher, read: Read, rng: Rng, tired = 0): PitchCaller =>
  (count, sit) =>
    callPitch(pitcher, count, sit, read, rng, { fatigue: tired });

/**
 * The computer manager's between-batters decision: leave him in, or go get him.
 *
 * Called from the game loop rather than inside playAiAtBat, because pulling a
 * pitcher mid-count is not a thing and the loop is where "between batters"
 * actually exists.
 */
export function manageBullpen(g: GameState): GameState {
  if (g.over) return g;
  const staff = fieldingStaff(g);
  const them = stateOf(g, fieldingSide(g)).runs;
  const us = stateOf(g, battingSide(g)).runs;
  const sit = { inning: g.inning, deficit: us - them };
  if (!shouldRelieve(staff, { ...sit, hook: fieldingHook(g) })) return g;
  // WHICH arm, not just "the next one", and on the legs rest left him — a
  // closer on his fourth straight day is not the best arm you have.
  return goToBullpen(g, pickReliever(staff.bullpen, sit, staff.legs));
}

/**
 * THE OTHER MANAGER'S BENCH. Called before each batter, exactly like
 * manageBullpen() above and for the same reason: it is a decision a manager
 * makes between hitters, and both halves of the game have to make it.
 *
 * ⚠️ IT RUNS FOR THE BATTING SIDE, WHICHEVER SIDE THAT IS. In the headless sim
 * that is both clubs over the course of a game; in main.ts it is only ever the
 * computer, because when YOU are batting the panel is yours. One function, and
 * neither caller has to know which case it is in.
 *
 * Returns the game unchanged when the manager stays put, which is most of the
 * time — see pinchHitter() in ai.ts for the rule.
 */
export function manageBench(g: GameState): GameState {
  if (g.over) return g;
  const side = battingSide(g);
  const bench = benchOf(g, side);
  if (bench.length === 0) return g;

  const sub = pinchHitter(currentBatter(g), bench, {
    inning: g.inning,
    regulation: g.regulation,
    deficit: stateOf(g, fieldingSide(g)).runs - stateOf(g, side).runs,
    risp: g.bases[1] !== null || g.bases[2] !== null,
  });
  return sub ? pinchHit(g, side, sub) : g;
}

/**
 * One gets away from the catcher, or it does not.
 *
 * Its own function rather than a line inside runTheBases() because the wild
 * pitch happens in BOTH halves — main.ts only runs the bases while the
 * computer bats, but a ball to the backstop has to be possible while the
 * player is hitting too, or half the game is missing an event.
 */
export function rollLoose(g: GameState, rng: Rng): { game: GameState; wild: WildPitch | null } {
  if (g.over) return { game: g, wild: null };
  const wild = rollWildPitch(g, fieldingAlignment(g), rng);
  return { game: wild?.game ?? g, wild };
}

/**
 * The computer's running game: send the man if the odds and the situation say
 * so. Returns the state unchanged when there is nobody to send.
 *
 * Only one attempt per trip through the loop — a runner who steals second does
 * not immediately try third off the same decision.
 */
export function runTheBases(g: GameState, rng: Rng): GameState {
  if (g.over) return g;
  const defence = fieldingAlignment(g);
  if (!aiShouldSend(g, defence, rng, battingKnob(g, 'running'))) return g;
  return sendRunner(g, defence, rng)?.game ?? g;
}

export interface SimResult {
  game: GameState;
  /** Total pitches thrown in the game, both sides. */
  pitches: number;
  /** Half-innings played. Guards against a game that never ends. */
  halves: number;
  /** Balls booted, both sides. */
  errors: number;
  /** Balls that got away from the catcher, both sides. */
  wilds: number;
  /** Plate appearances where the bunt was on, both sides. */
  bunts: number;
  /**
   * How the plate appearances ended, both sides.
   *
   * Here because runs-per-game alone cannot say WHY the number is off. A run
   * surplus made of walks and one made of extra hits want opposite knobs, and
   * counting them is the only way to tell which one you have.
   */
  outcomes: Record<AtBatLog["kind"], number>;
}

/**
 * Play a WHOLE GAME with nobody watching. Both teams computer-run.
 *
 * This is the runnable check for the whole two-sided engine — if half-innings,
 * the batting order, walk-offs or extra innings are broken, a few hundred of
 * these fall over immediately. It is also how you balance run scoring without
 * playing four hundred games by hand.
 */
export function simulateGame(
  seed: number,
  regulation = 9,
  home = HOME,
  away = AWAY,
  /**
   * Who starts for each side, and on what rest. Omitted means the ace at his
   * card rating — right for an exhibition and for every test that is not about
   * the rotation. franchise.ts passes real picks off the season's start log.
   */
  starters?: { home?: StarterPick; away?: StarterPick },
): SimResult {
  const rng = makeRng(seed);
  let g = newGame(home, away, regulation, starters);

  // One book per hitting side. The computer keeps a read on its opponent even
  // when both sides are the computer — it costs nothing and it means the sim
  // exercises the same code path the human game uses.
  const books: Record<Side, Read> = { home: newRead(), away: newRead() };

  let pitches = 0;
  let halves = 0;
  const outcomes: Record<AtBatLog["kind"], number> = {
    walk: 0,
    hit_by_pitch: 0,
    strikeout: 0,
    in_play: 0,
  };
  let errors = 0;
  let wilds = 0;
  let bunts = 0;
  let lastHalf = `${g.inning}${g.half}`;

  while (!g.over && halves < 60) {
    // Both managers get their chance to go to the pen before each batter.
    g = manageBullpen(g);
    // ...and to go to his bench, which is the same kind of call and the same
    // moment: between hitters, with the man due up known. See manageBench().
    g = manageBench(g);
    // ...and to send a runner. Between batters only, which is a simplification
    // — real steals happen mid-count — but it keeps the running game out of
    // the at-bat loop, where it would have to interleave with the pitch clock.
    g = runTheBases(g, rng);
    const loose = rollLoose(g, rng);
    g = loose.game;
    if (loose.wild) wilds++;
    if (g.over) break;

    const pitcher = currentPitcher(g);
    const book = books[fieldingSide(g)];
    const caller = autoCaller(pitcher, book, rng, fatigue(fieldingStaff(g)));

    const before = pitches;
    const out = playAiAtBat(g, caller, books[battingSide(g)], rng);
    g = out.game;
    outcomes[out.atBat.kind]++;
    if (out.atBat.error) errors++;
    if (out.atBat.bunt) bunts++;
    pitches += out.atBat.pitches;
    if (pitches === before) pitches++; // paranoia: never spin without progress

    const nowHalf = `${g.inning}${g.half}`;
    if (nowHalf !== lastHalf) {
      halves++;
      lastHalf = nowHalf;
    }
  }

  return { game: g, pitches, halves, outcomes, errors, wilds, bunts };
}

/** A one-line box score, for the CLI and for eyeballing a sim run. */
export function boxLine(g: GameState): string {
  const fmt = (name: string, s: ReturnType<typeof stateOf>) =>
    `${name.padEnd(16)} ${s.byInning.map((r) => String(r)).join(' ').padEnd(20)}  ${String(s.runs).padStart(2)}R ${String(s.hits).padStart(2)}H`;
  return [
    fmt(g.away.name, g.awayState),
    fmt(g.home.name, g.homeState),
  ].join('\n');
}

/** Re-exported so a caller can grade a human swing with the same function. */
export { grade, resolveSwing };
