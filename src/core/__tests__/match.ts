/**
 * A short game with a scoreboard around it, for testing the inning rules one
 * at-bat at a time: recordAtBat() folds a result into outs, bases, runs and a
 * line score. The real game keeps its own state in game/game.ts.
 */
import { applyAtBat, EMPTY_BASES, ANON, type Bases, type Runner } from '../inning.ts';
import { CLEAN, type FieldingResult } from '../fielding.ts';
import type { AtBatResult } from '../atBat.ts';

export interface MatchState {
  /** 1-based, counts up. */
  inning: number;
  /** How many innings this encounter lasts. */
  innings: number;
  outs: number;
  bases: Bases;
  runs: number;
  over: boolean;
  /** Their runs, one per inning, fixed before the game. */
  opponentByInning: readonly number[];
  /** Yours, one per inning, filled in as innings close. The line score. */
  byInning: readonly number[];
}

export const opponentRuns = (m: MatchState): number =>
  m.opponentByInning.reduce((a, b) => a + b, 0);

/** A tie is not a win — you have to beat them. */
export const playerWon = (m: MatchState): boolean => m.runs > opponentRuns(m);

/** Three innings unless told otherwise; tests rarely need more. */
export function newMatch(innings = 3, opponentByInning: readonly number[] = []): MatchState {
  return {
    inning: 1,
    innings,
    outs: 0,
    bases: EMPTY_BASES,
    runs: 0,
    over: false,
    // Default to a shutout so a caller that does not care about the opposing
    // team still gets a coherent match.
    opponentByInning: opponentByInning.length ? opponentByInning : Array(innings).fill(0),
    byInning: [],
  };
}

export function recordAtBat(
  state: MatchState,
  result: AtBatResult,
  batter: Runner = ANON,
  fielding: FieldingResult = CLEAN,
  defense: { infieldIn?: boolean } = {},
): MatchState {
  if (state.over) throw new Error('match already over');

  const play = applyAtBat(state, result, batter, fielding, defense);
  const outs = play.outs;
  const bases = play.bases;
  const runs = state.runs + play.runs;

  if (outs < 3) return { ...state, outs, runs, bases };

  // Third out: close the inning and post your half to the line score.
  const scoredThisInning = runs - state.byInning.reduce((a, b) => a + b, 0);
  const inning = state.inning + 1;
  return {
    ...state,
    inning,
    outs: 0,
    bases: EMPTY_BASES,
    runs,
    byInning: [...state.byInning, scoredThisInning],
    over: inning > state.innings,
  };
}
