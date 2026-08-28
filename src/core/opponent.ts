/**
 * The other team.
 *
 * You never field, so their half-inning is not played — it is rolled. This is
 * the FIP licence the vault's spec grants in §5: a batter-only game should
 * "model the K/BB/HR spine honestly and let the rest be a weighted roll",
 * because a game with no fielders on screen has no business modelling
 * fielding. Their runs are a distribution, not a simulation of nine men.
 *
 * WHAT THIS IS NOT: a season, a roster, a draft, or a franchise layer. The
 * spec's §6 rules those out by name — a season simulator and a batting
 * roguelike are different products. This is one opposing score per encounter,
 * so the scoreboard has two rows instead of one.
 *
 * What it buys: the run target stops being an abstract number and becomes a
 * deficit. "You need 2" is a rule. "You are down 2-0 going to the bottom of
 * the 1st" is a ball game.
 */

import type { Rng } from './rng.ts';
import { DIVISIONS, type DivisionId } from './division.ts';

/**
 * The runs-allowed tables live in era.ts now, next to the era's other rules,
 * because how much the opposition scores IS part of what makes an era feel
 * different — the dead-ball era is 1-0 baseball on both sides of the ball.
 *
 * Still nonuniform random into a lookup: the Strat-O-Matic trick the vault
 * identifies as the engine behind tabletop baseball, same shape as
 * OUTCOME_TABLES.
 */
export const OPPONENT_NAME = (era: DivisionId): string => DIVISIONS[era].opponent;

/** One half-inning of theirs. */
export function simHalfInning(era: DivisionId, rng: Rng): number {
  const table = DIVISIONS[era].runsAllowed;
  const roll = rng.next();
  let cumulative = 0;
  for (let runs = 0; runs < table.length; runs++) {
    cumulative += table[runs]!;
    if (roll <= cumulative) return runs;
  }
  return 0;
}

/**
 * Their whole game, one entry per inning. Rolled up front so the scoreboard
 * can show the top half already played when you step in — which is what a
 * scoreboard is for.
 */
export function simOpponent(era: DivisionId, innings: number, rng: Rng): number[] {
  return Array.from({ length: innings }, () => simHalfInning(era, rng));
}
