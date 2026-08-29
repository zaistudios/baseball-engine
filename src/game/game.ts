/**
 * A whole baseball game. Two teams, nine innings, both halves actually played.
 *
 * ⚠️ WHY THIS FILE EXISTS AT ALL. The roguelike's MatchState models exactly
 * one half of an inning: "you are only ever the batter, so there is no top and
 * bottom here", and the other team's runs were ROLLED rather than played
 * (see core/opponent.ts). That is a fine shape for a batting game and the
 * wrong shape for baseball. This is the two-sided replacement.
 *
 * What it does NOT do is re-implement the rules of an at-bat. Walks that force
 * only what they have to, the sacrifice fly, the double play, the extra base —
 * all of that lives in core/inning.ts's applyAtBat(), and both halves call it.
 * One set of baseball rules, two teams using them.
 *
 * The state is a plain object and every function returns a new one, so a whole
 * game replays exactly from a seed. Same requirement as the rest of the core,
 * same reason: the experiment depends on determinism.
 */

import {
  applyAtBat,
  EMPTY_BASES,
  type Bases,
  type Runner,
  type ThrownOut,
} from '../core/inning.ts';
import { isHit } from '../core/hitTables.ts';
import type { AtBatResult } from '../core/atBat.ts';
import { CLEAN, type FieldingResult } from '../core/fielding.ts';
import type { Player } from '../core/roster.ts';
import type { Pitcher } from '../core/pitcher.ts';
import type { Team } from './teams.ts';
import {
  bringInRelief,
  newStaff,
  recordBatter,
  chargeRuns,
  recordPitch,
  type Staff,
} from './bullpen.ts';
import { assignPositions, type Alignment } from './defense.ts';
import { EMPTY_BOOK, recordAtBat, recordDecision, recordFieldingOut, type StatBook } from './stats.ts';

export type Half = 'top' | 'bottom';
export type Side = 'home' | 'away';

/** Everything about one club that changes during a game. */
export interface TeamState {
  runs: number;
  hits: number;
  /** Index into the lineup of the man due up. Wraps at nine. */
  order: number;
  /** Runs per inning — the line score. Grows as halves close. */
  byInning: readonly number[];
  /** Who is on the mound, how tired he is, and who is left. */
  staff: Staff;
}

export interface GameState {
  home: Team;
  away: Team;
  homeState: TeamState;
  awayState: TeamState;
  /** 1-based. Can exceed `regulation` — that is extra innings. */
  inning: number;
  half: Half;
  outs: number;
  bases: Bases;
  /** Nine, normally. The length of a full game before extras. */
  regulation: number;
  over: boolean;
  /** Set exactly once, when the game ends. */
  winner?: Side;
  /** Why it ended, for the UI to say something better than "over". */
  ending?: 'regulation' | 'walk_off' | 'home_wins_early';
  /**
   * EVERY LINE IN THIS BALL GAME, both clubs. See stats.ts.
   *
   * It lives on the game state rather than beside it so that recordPlay() —
   * the one function every completed at-bat in the engine goes through — can
   * keep it without any call site being told to. A game that is played gets a
   * box score; there is no way to play one that does not.
   */
  stats: StatBook;
  /**
   * THE PITCHER OF RECORD, both sides, as of the last time the lead changed
   * hands. Absent until somebody has been ahead.
   *
   * ⚠️ THE LEAD-CHANGE RULE, WHICH IS THE ACTUAL RULE. The winning pitcher is
   * the man who was on the mound for his club when it took the lead for good,
   * and "for good" is only knowable at the end — so this is overwritten every
   * time the lead turns over and whoever is left holding it when the game ends
   * is right by construction. `win` is always the winner's, because the club
   * that took the lead last is the club that is ahead at the end.
   *
   * ponytail: no five-inning rule for the starter and no saves. Both are
   * scorer's judgment layered on top of this, and this is the part that
   * decides who the two names are.
   */
  record?: { win: string; lose: string };
}

const newTeamState = (t: Team, pick?: StarterPick): TeamState => {
  const at = pick?.index ?? 0;
  const starter = t.rotation[at] ?? t.rotation[0]!;
  return {
    runs: 0,
    hits: 0,
    order: 0,
    byInning: [],
    staff: newStaff(starter, t.bullpen, pick?.stamina, pick?.penLegs),
  };
};

/**
 * WHO STARTS, AND WITH WHAT LEGS.
 *
 * `index` into the club's three-man rotation; `stamina` is what rest has left
 * him — see rotation.ts. Both optional, and omitting them gets you the ace at
 * his card rating, which is what an exhibition wants and what every test that
 * does not care about the rotation wants.
 */
export interface StarterPick {
  index: number;
  /** His legs today. Defaults to the rating on his card. */
  stamina?: number;
  /**
   * Each RELIEVER's legs today, by name. Defaults to whole men, which is what
   * an exhibition wants — see Staff.legs.
   */
  penLegs?: Readonly<Record<string, number>>;
}

export function newGame(
  home: Team,
  away: Team,
  regulation = 9,
  starters?: { home?: StarterPick; away?: StarterPick },
): GameState {
  return {
    home,
    away,
    homeState: newTeamState(home, starters?.home),
    awayState: newTeamState(away, starters?.away),
    inning: 1,
    half: 'top',
    outs: 0,
    bases: EMPTY_BASES,
    regulation,
    over: false,
    stats: EMPTY_BOOK,
  };
}

/**
 * The book as it should be READ — which is the running book, plus the decision
 * once there is one to give out.
 *
 * ⚠️ THE DECISION IS APPLIED HERE AND NOT WHEN THE GAME ENDS, because a game
 * ends in four different places (a walk-off from an at-bat, a walk-off from a
 * wild pitch, the visitors making the last out down, and regulation) and
 * writing the same two lines into all four is how two of them end up wrong.
 * Reading it once, at the point somebody asks for the box score, cannot drift.
 */
export const boxScore = (g: GameState): StatBook =>
  g.over && g.record ? recordDecision(g.stats, g.record.win, g.record.lose) : g.stats;

/**
 * Whoever is ahead, or nobody. The pitcher of record turns over when this
 * changes — see GameState.record.
 */
const leader = (g: GameState): Side | null =>
  g.homeState.runs > g.awayState.runs
    ? 'home'
    : g.awayState.runs > g.homeState.runs
      ? 'away'
      : null;

/** Runs just crossed. If the lead turned over with them, so do the decisions. */
function turnover(before: GameState, after: GameState): GameState {
  const now = leader(after);
  if (now === null || now === leader(before)) return after;
  const trailing: Side = now === 'home' ? 'away' : 'home';
  return {
    ...after,
    record: {
      win: stateOf(after, now).staff.current.pitcher.name,
      lose: stateOf(after, trailing).staff.current.pitcher.name,
    },
  };
}

// ------------------------------------------------------------ reading it

/** The away team bats in the top half. That is the whole rule. */
export const battingSide = (g: GameState): Side => (g.half === 'top' ? 'away' : 'home');
export const fieldingSide = (g: GameState): Side => (g.half === 'top' ? 'home' : 'away');

export const teamOf = (g: GameState, side: Side): Team => (side === 'home' ? g.home : g.away);
export const stateOf = (g: GameState, side: Side): TeamState =>
  side === 'home' ? g.homeState : g.awayState;

export const battingTeam = (g: GameState): Team => teamOf(g, battingSide(g));
export const fieldingTeam = (g: GameState): Team => teamOf(g, fieldingSide(g));

/** The man at the plate. */
export const currentBatter = (g: GameState): Player => {
  const side = battingSide(g);
  return teamOf(g, side).lineup[stateOf(g, side).order]!;
};

/** The staff of whichever side is in the field. */
export const fieldingStaff = (g: GameState): Staff => stateOf(g, fieldingSide(g)).staff;

/**
 * Who is standing where, for the side currently in the field.
 *
 * Derived from the lineup rather than stored, because it never changes during
 * a game — there are no substitutions yet. When there are, this becomes state
 * and every caller already goes through this one function.
 */
export const fieldingAlignment = (g: GameState): Alignment =>
  assignPositions(fieldingTeam(g).lineup);


/**
 * The arm on the mound — the FIELDING team's CURRENT pitcher.
 *
 * Reads game state, not the Team, because the man out there changes.
 */
export const currentPitcher = (g: GameState): Pitcher => fieldingStaff(g).current.pitcher;

/** Replace the fielding side's staff. Used by the pitch counter and the pen. */
export function withStaff(g: GameState, staff: Staff): GameState {
  const side = fieldingSide(g);
  return {
    ...g,
    [side === 'home' ? 'homeState' : 'awayState']: { ...stateOf(g, side), staff },
  } as GameState;
}

/** One pitch thrown by whoever is on the mound. Call it for every pitch. */
export const countPitch = (g: GameState): GameState =>
  withStaff(g, recordPitch(fieldingStaff(g)));

/**
 * Go to the bullpen. No-op when the pen is empty.
 *
 * `index` picks WHICH arm out of what is left — the player chooses from the
 * pen panel, the computer from pickReliever(). Omitted means the top of the
 * list.
 */
export const goToBullpen = (g: GameState, index = 0): GameState =>
  withStaff(g, bringInRelief(fieldingStaff(g), index));

/** A batter as the base-runner he becomes. Legs come from the player. */
// ------------------------------------------------------------- the bench

/**
 * WHO IS LEFT ON THE BENCH for this side, right now.
 *
 * ⚠️ DERIVED, NOT TRACKED. A pinch hitter is written INTO the lineup and the
 * man he hit for is written out, so the lineup is already a complete record of
 * who has come in — anybody on the bench list who is not in it has not been
 * used. A parallel `used` array would be a second copy of that fact, and the
 * two would drift the first time anything else moved a lineup (the pre-game
 * editor does, every game).
 *
 * ⚠️ COMPARED BY IDENTITY, NOT BY NAME. Two Players are the same man only if
 * they are the same object, which they are: the season stores its rosters whole
 * and hands the very same Player objects to newGame().
 */
export const benchOf = (g: GameState, side: Side): readonly Player[] => {
  const t = teamOf(g, side);
  return (t.bench ?? []).filter((p) => !t.lineup.includes(p));
};

/**
 * SEND SOMEBODY UP. The bench man takes the batting slot of the man due up,
 * and the man due up is out of the ball game — same as the real rule, and it is
 * what makes a pinch hit a decision rather than a free look.
 *
 * ⚠️ ONLY FOR THE MAN AT THE PLATE. Substituting anywhere else in the order
 * would be a lineup edit, and the place to make one of those is the pre-game
 * card, where you can see the whole nine and the season they are having.
 *
 * ⚠️ THE DEFENCE RE-SORTS ITSELF AND THAT IS THE POINT. assignPositions() is a
 * pure function of the lineup and fieldingAlignment() calls it fresh, so the
 * man who just came in takes a position without anything here saying so — and a
 * fast bench man genuinely does move the whole infield, which is why THE GLOVE
 * is worth carrying at all. See the bench section in teams.ts.
 *
 * Returns the game unchanged if he is not on the bench or has already been
 * used: this is called from a click handler, and a UI that gets one frame out
 * of step must not be able to clone a player into two lineup slots.
 */
export function pinchHit(g: GameState, side: Side, sub: Player): GameState {
  if (g.over) throw new Error('game already over');
  if (!benchOf(g, side).includes(sub)) return g;

  const t = teamOf(g, side);
  const at = stateOf(g, side).order;
  const lineup = t.lineup.map((p, i) => (i === at ? sub : p));

  return {
    ...g,
    [side === 'home' ? 'home' : 'away']: { ...t, lineup },
  } as GameState;
}

export const asRunner = (p: Player): Runner => ({ name: p.name, speed: p.speed });

/** Who is up next after this one, for an on-deck display. */
export const onDeck = (g: GameState): Player => {
  const side = battingSide(g);
  const team = teamOf(g, side);
  return team.lineup[(stateOf(g, side).order + 1) % team.lineup.length]!;
};

export const homeLeads = (g: GameState): boolean => g.homeState.runs > g.awayState.runs;
export const tied = (g: GameState): boolean => g.homeState.runs === g.awayState.runs;

/** Runs the batting team is behind by. Negative means they are ahead. */
export const deficit = (g: GameState): number => {
  const us = stateOf(g, battingSide(g)).runs;
  const them = stateOf(g, fieldingSide(g)).runs;
  return them - us;
};

// ------------------------------------------------------------ playing it

/**
 * Fold one finished at-bat into the game.
 *
 * Returns the new state plus what just happened, because the UI needs to
 * narrate the play and re-deriving "did that score anyone" from two states is
 * both harder and a second place for the arithmetic to be wrong.
 */
export interface PlayLog {
  runs: number;
  /** Bases BEFORE the play, so the UI can animate the difference. */
  before: Bases;
  after: Bases;
  batter: Player;
  side: Side;
  /** True when the third out just closed a half. */
  halfEnded: boolean;
  scored: number;
  /**
   * The runner gunned down going for the extra base, or null.
   *
   * ⚠️ THE ONLY OUT ON A PLAY THAT DID NOT HAPPEN TO THE BATTER, which is
   * exactly why it has to be carried out separately: the play-by-play line is
   * built around the man at the plate, and "single to right" with an out
   * appearing from nowhere is a line that reads like a bug.
   */
  thrownOut?: ThrownOut | null;
}

export function recordPlay(
  g: GameState,
  result: AtBatResult,
  fielding: FieldingResult = CLEAN,
): { game: GameState; log: PlayLog } {
  if (g.over) throw new Error('game already over');

  const side = battingSide(g);
  const batter = currentBatter(g);
  const before = g.bases;

  const play = applyAtBat({ outs: g.outs, bases: g.bases }, result, asRunner(batter), fielding);
  const thrownOut = play.thrownOut ?? null;

  const team = stateOf(g, side);
  const hit = result.kind === 'in_play' && isHit(result.hit.outcome);

  // The at-bat touches BOTH clubs: the batting side scores it, and the man on
  // the mound for the other side wears it. Charging the runs here rather than
  // at the call site is what lets shouldRelieve() ever be true.
  const defSide = fieldingSide(g);
  const defence = stateOf(g, defSide);

  let next: GameState = {
    ...g,
    outs: play.outs,
    bases: play.bases,
    // THE BOOK. Both men in the at-bat, from the one place every at-bat in the
    // engine ends up — see stats.ts. The outs are clamped because a double
    // play with two down finishes the half at three, not at four, and innings
    // pitched must not be able to run ahead of the innings played.
    stats: recordAtBat(g.stats, {
      batter: batter.name,
      batterTeam: teamOf(g, side).abbr,
      pitcher: currentPitcher(g).name,
      pitcherTeam: teamOf(g, defSide).abbr,
      result,
      error: !!fielding.error,
      runs: play.runs,
      outs: Math.min(3, play.outs) - g.outs,
    }),
    [side === 'home' ? 'homeState' : 'awayState']: {
      ...team,
      runs: team.runs + play.runs,
      hits: team.hits + (hit ? 1 : 0),
      // The order advances on every completed at-bat, including outs.
      order: (team.order + 1) % teamOf(g, side).lineup.length,
    },
    [defSide === 'home' ? 'homeState' : 'awayState']: {
      ...defence,
      staff: recordBatter(defence.staff, play.runs),
    },
  } as GameState;

  // Who is on the hook for the game, if these runs changed who is ahead.
  next = turnover(g, next);

  // A walk-off ends the game the instant the run scores — the half does not
  // finish and the outs never reach three. Checked BEFORE the third-out roll
  // for exactly that reason.
  if (play.runs > 0 && isWalkOff(next)) {
    next = closeHalf(next, { ...next, over: true, winner: 'home', ending: 'walk_off' });
    return { game: next, log: log(play.runs, before, next.bases, batter, side, true, thrownOut) };
  }

  if (play.outs < 3) {
    return { game: next, log: log(play.runs, before, next.bases, batter, side, false, thrownOut) };
  }

  next = rollHalf(next);
  return { game: next, log: log(play.runs, before, next.bases, batter, side, true, thrownOut) };
}

const log = (
  runs: number,
  before: Bases,
  after: Bases,
  batter: Player,
  side: Side,
  halfEnded: boolean,
  thrownOut: ThrownOut | null = null,
): PlayLog => ({ runs, before, after, batter, side, halfEnded, scored: runs, thrownOut });

/**
 * The home team is batting in the last of it and just went ahead.
 *
 * Requires regulation to be complete: a run in the bottom of the third does
 * not end anything, however far ahead it puts them.
 */
function isWalkOff(g: GameState): boolean {
  return g.half === 'bottom' && g.inning >= g.regulation && homeLeads(g);
}

/**
 * Post the half's runs to the line score. Called on the third out and on a
 * walk-off, which is why it takes the state to carry forward separately.
 */
function closeHalf(g: GameState, carry: GameState): GameState {
  const side = battingSide(g);
  const team = stateOf(g, side);
  const already = team.byInning.reduce((a, b) => a + b, 0);
  const posted = { ...team, byInning: [...team.byInning, team.runs - already] };
  return {
    ...carry,
    [side === 'home' ? 'homeState' : 'awayState']: posted,
  } as GameState;
}

/**
 * Third out. Close the half, then decide whether there is another one.
 *
 * The three endings, in the order they are checked:
 *
 *  home_wins_early  Top of the ninth or later is over and the home team is
 *                   ahead. They do not bat — you cannot add to a win.
 *  regulation       Bottom of the ninth or later is over and it is not tied.
 *  (walk-off is handled in recordPlay, before the outs are counted.)
 *
 * Anything else rolls on, which is what makes extra innings free: nothing here
 * caps `inning`, so a tie game simply keeps going.
 */
function rollHalf(g: GameState): GameState {
  const closed = closeHalf(g, g);
  const regulationDone = closed.inning >= closed.regulation;

  if (closed.half === 'top') {
    // Home team leads after the visitors' last at-bat: no bottom half.
    if (regulationDone && homeLeads(closed)) {
      return { ...closed, over: true, winner: 'home', ending: 'home_wins_early' };
    }
    return { ...closed, half: 'bottom', outs: 0, bases: EMPTY_BASES };
  }

  // Bottom half just ended.
  if (regulationDone && !tied(closed)) {
    return {
      ...closed,
      over: true,
      winner: homeLeads(closed) ? 'home' : 'away',
      ending: 'regulation',
    };
  }

  return {
    ...closed,
    inning: closed.inning + 1,
    half: 'top',
    outs: 0,
    bases: EMPTY_BASES,
  };
}

// ------------------------------------------------------------ base running

/** Swap the bases wholesale — for a steal, which baserunning.ts resolves. */
export const withBases = (g: GameState, bases: Bases): GameState => ({ ...g, bases });

/**
 * Runners moved and some of them came home, with no at-bat involved.
 *
 * A wild pitch is the case this exists for. It shares isWalkOff() and
 * closeHalf() with recordPlay() ON PURPOSE: a run is a run, and a wild pitch
 * that scores the winner in the last of the ninth ends the game exactly like a
 * base hit does. Writing that check twice is how the two paths drift.
 *
 * It does NOT touch hits or the batting order — nobody completed a plate
 * appearance — but it DOES charge the runs to the man on the mound, because
 * shouldRelieve() has to see them.
 */
export function creditRuns(g: GameState, bases: Bases, runs: number): GameState {
  if (g.over) throw new Error('game already over');
  if (runs === 0) return withBases(g, bases);

  const side = battingSide(g);
  const team = stateOf(g, side);
  const defSide = fieldingSide(g);
  const defence = stateOf(g, defSide);

  // The arm wears it in the box score too. Without this a run that came home
  // on a wild pitch would be missing from his ERA while sitting on the
  // scoreboard — the pitcher's line and the line score would disagree, and the
  // line score is the one the player can check.
  const arm = currentPitcher(g).name;
  const line = g.stats.arm[arm];

  const next = turnover(g, {
    ...g,
    bases,
    stats: line
      ? { ...g.stats, arm: { ...g.stats.arm, [arm]: { ...line, r: line.r + runs, er: line.er + runs } } }
      : g.stats,
    [side === 'home' ? 'homeState' : 'awayState']: { ...team, runs: team.runs + runs },
    [defSide === 'home' ? 'homeState' : 'awayState']: {
      ...defence,
      staff: chargeRuns(defence.staff, runs),
    },
  } as GameState);

  return isWalkOff(next)
    ? closeHalf(next, { ...next, over: true, winner: 'home', ending: 'walk_off' })
    : next;
}

/**
 * A runner was thrown out. Costs an out and may end the half.
 *
 * Shares rollHalf with the at-bat path so a caught stealing that ends an
 * inning posts the line score exactly like a strikeout does.
 */
export function recordOut(g: GameState, bases: Bases): GameState {
  if (g.over) throw new Error('game already over');
  const outs = g.outs + 1;

  // ⚠️ IT GOES ON THE PITCHER'S LINE TOO. This is the out that does NOT come
  // from a plate appearance — a caught stealing — so it never passes through
  // recordAtBat(), and without this the box score is one out short of the game
  // for every runner thrown out. In real baseball an out on the bases counts
  // toward innings pitched exactly like a strikeout does.
  //
  // Found 2026-08-28 by stats.test.ts, which allows a walk-off to leave one
  // half unfinished: a game that had BOTH a walk-off and a caught stealing
  // finally ran past the tolerance. It had been wrong the whole time.
  //
  // Safe against double-counting: recordOut() has exactly one caller, and the
  // batter's outs go through recordPlay() -> recordAtBat() instead.
  const next: GameState = {
    ...g,
    outs,
    bases,
    stats: recordFieldingOut(
      g.stats,
      currentPitcher(g).name,
      fieldingTeam(g).abbr,
    ),
  };
  return outs < 3 ? next : rollHalf(next);
}

// ------------------------------------------------------------ presentation

/** "T3" / "B7" — the half and the inning, short enough for a scoreboard. */
export const inningLabel = (g: GameState): string =>
  `${g.half === 'top' ? 'T' : 'B'}${g.inning}`;
