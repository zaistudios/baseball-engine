/**
 * The divisions.
 *
 * THE SETTING: baseball has been robotized. Not a time-travel gimmick — one
 * world, one timeline, and the machines have already won. What escalates
 * across a run is not the decade, it is HOW AUTOMATED THE LEAGUE IS.
 *
 * That is the ladder, and it does the same job the three eras did while
 * actually meaning something:
 *
 *   THE HOLDOUTS  the last human league. Wooden bats, no implants, nobody
 *                 can drive the ball. Small ball because they are outgunned.
 *   THE SPLICE    augmented players. Grafted arms, calibrated eyes. The
 *                 power arrives and so do the strikeouts.
 *   THE FOUNDRY   machines only. You are the last human on the field, and
 *                 the ball leaves at speeds nobody designed a person to see.
 *
 * The rules multiply the outcome tables, never replace them, so the
 * Strat-O-Matic spine the vault says not to redesign stays untouched.
 */

import type { Outcome } from './hitTables.ts';

export type DivisionId = 'holdouts' | 'splice' | 'foundry';
export const DIVISION_ORDER: readonly DivisionId[] = ['holdouts', 'splice', 'foundry'];

export interface Division {
  id: DivisionId;
  name: string;
  rank: string;
  tagline: string;
  /** Multiplied into the outcome table before the roll. Missing = 1.0. */
  rules: Partial<Record<Outcome, number>>;
  /** Pitching machines get faster the deeper in you go. */
  speedMult: number;
  /** Runs the opposition puts up per half-inning, as a weighted table. */
  runsAllowed: readonly number[];
  opponent: string;
  palette: { field: string; dirt: string; ink: string; accent: string };
}

export const DIVISIONS: Record<DivisionId, Division> = {
  holdouts: {
    id: 'holdouts',
    name: 'The Holdouts',
    rank: 'DIV I',
    tagline: 'The last human league. Nobody here can drive the ball.',
    rules: { home_run: 0.12, triple: 2.0, double: 1.2, single: 1.25, strikeout: 0.7 },
    speedMult: 0.9,
    runsAllowed: [0.66, 0.24, 0.07, 0.02, 0.01],
    opponent: 'RUST BELT NINE',
    palette: { field: '#3b3524', dirt: '#4a3d29', ink: '#e8dfc8', accent: '#c9a24a' },
  },
  splice: {
    id: 'splice',
    name: 'The Splice',
    rank: 'DIV II',
    tagline: 'Grafted arms, calibrated eyes. Power arrives, and so do the whiffs.',
    rules: { home_run: 1.7, strikeout: 1.45, single: 0.75, triple: 0.4, ground_out: 0.85 },
    speedMult: 1.0,
    runsAllowed: [0.48, 0.26, 0.14, 0.08, 0.04],
    opponent: 'GRAFT CITY SPLICERS',
    palette: { field: '#1a2416', dirt: '#3d3226', ink: '#e8e8d8', accent: '#5aa9e6' },
  },
  foundry: {
    id: 'foundry',
    name: 'The Foundry',
    rank: 'DIV III',
    tagline: 'Machines only. You are the last person on the field.',
    rules: { home_run: 2.4, triple: 1.6, double: 1.4, popup: 0.6, line_out: 0.7 },
    speedMult: 1.15,
    runsAllowed: [0.32, 0.26, 0.2, 0.13, 0.09],
    opponent: 'FOUNDRY PRIME',
    palette: { field: '#141033', dirt: '#2a1f4a', ink: '#e8e0ff', accent: '#d264d2' },
  },
};

export const divisionAt = (index: number): Division =>
  DIVISIONS[DIVISION_ORDER[index] ?? 'holdouts']!;
