/**
 * Nine men standing somewhere, and what happens when the ball reaches them.
 *
 * ⚠️ WHAT WAS WRONG BEFORE. core/fielding.ts rolled a FLAT 5% error on every
 * bootable ball, whoever hit it and wherever it went. So a scorching grounder
 * to a slow first baseman and a routine one to a gold-glove shortstop were
 * literally the same event, and a team's defence had no identity at all —
 * nine players' worth of `speed` stat did nothing on the field.
 *
 * WHAT THIS ADDS, and the ladder rung it sits on: almost none of the geometry
 * is new. `plotBatted()` already turns exit velocity and launch angle into a
 * landing spot, and `nearestFielder()` already answers who is closest to it —
 * both written for the roguelike's overhead replay, both already tested. This
 * file assigns REAL PLAYERS to those nine slots and lets their stats decide
 * whether the play gets made.
 *
 * ponytail, on the layering: this imports from `web/plot.ts`, which is a
 * presentation module, and that is the wrong direction on paper. The functions
 * taken are pure geometry with no DOM in them, and moving them to core/ would
 * touch every roguelike import for no behavioural gain. If core/ ever needs
 * them too, move them then.
 *
 * STILL NOT A FIELDING SIMULATION. No shifts, no cutoff men, no assists, no
 * runner-specific throws, no scorer deciding hit-or-error. One alignment, one
 * chaser, one roll.
 */

import type { Player } from '../core/roster.ts';
import type { HitResult } from '../core/hit.ts';
import { rollFielding, type FieldingResult } from '../core/fielding.ts';
import type { Rng } from '../core/rng.ts';
import { plotBatted, nearestFielder } from '../web/plot.ts';

export type Position = 'P' | 'C' | '1B' | '2B' | '3B' | 'SS' | 'LF' | 'CF' | 'RF' | 'DH';

/** The scorer's numbering, which is what plot.ts's FIELDERS carry. */
export const POSITION_BY_NUMBER: Record<number, Position> = {
  1: 'P',
  2: 'C',
  3: '1B',
  4: '2B',
  5: '3B',
  6: 'SS',
  7: 'LF',
  8: 'CF',
  9: 'RF',
};

/**
 * How hard each spot is to play, as a multiplier on the error rate.
 *
 * The shape is the real defensive spectrum: up the middle is hard, the corners
 * are where you hide a bat. First base is the easiest job on the field and
 * shortstop is the hardest, which is why lineups are built the way assign()
 * builds them below.
 */
export const POSITION_DIFFICULTY: Record<Position, number> = {
  P: 1.0,
  C: 1.1,
  '1B': 0.7,
  '2B': 1.25,
  '3B': 1.35,
  SS: 1.45,
  LF: 0.85,
  CF: 1.05,
  RF: 0.9,
  DH: 1.0, // never fields; here so the record is total
};

/**
 * The order the manager fills the field in, hardest job first.
 *
 * A nine-man lineup covers eight positions plus a DH — the pitcher comes off
 * the staff, not the batting order, which makes this a designated-hitter
 * league by construction rather than by decision.
 */
const FILL_ORDER: readonly Position[] = ['SS', 'CF', '2B', '3B', 'C', 'RF', 'LF', '1B', 'DH'];

export type Alignment = Readonly<Record<Position, Player | null>>;

/**
 * A player's glove, derived rather than stored.
 *
 * ponytail: `Player` has no fielding stat and adding one means touching the
 * roster the roguelike shares. Legs are most of range and the build says
 * something honest about hands — the machines were manufactured to be
 * consistent, the augmented traded control for power. When a real `glove`
 * stat is worth having, add it to Player and delete this function; every
 * caller already goes through it.
 */
export function gloveOf(p: Player): number {
  const range = 0.7 + p.speed * 0.3;
  const hands = p.build === 'machine' ? 1.12 : p.build === 'augmented' ? 0.92 : 1.0;
  return range * hands;
}

/**
 * Put the nine somewhere sensible: best gloves at the hardest positions.
 *
 * Deterministic — same lineup in, same alignment out — so a game replays from
 * its seed and so the player can learn where his own people are.
 */
export function assignPositions(lineup: readonly Player[]): Alignment {
  const ranked = [...lineup].sort((a, b) => gloveOf(b) - gloveOf(a));
  const out: Record<Position, Player | null> = {
    P: null, C: null, '1B': null, '2B': null, '3B': null,
    SS: null, LF: null, CF: null, RF: null, DH: null,
  };
  FILL_ORDER.forEach((pos, i) => {
    out[pos] = ranked[i] ?? null;
  });
  return out;
}

/** Which position handles this batted ball. Geometry, not opinion. */
export function fielderFor(hit: HitResult): Position {
  const plot = plotBatted(hit.outcome, hit.exitVelocity, hit.launchAngle);
  const f = nearestFielder(plot.distFt, hit.direction);
  return POSITION_BY_NUMBER[f.num] ?? 'P';
}

/** The middle infield turns the double play — average their gloves. */
function relayQuality(a: Alignment): number {
  const ss = a.SS ? gloveOf(a.SS) : 1;
  const second = a['2B'] ? gloveOf(a['2B']) : 1;
  return (ss + second) / 2;
}

export interface DefensivePlay extends FieldingResult {
  /** Who it was hit at. Shown in the play-by-play — "6-4-3" needs a 6. */
  by: Position;
  /** The glove that had to make it, for a UI that wants to explain an error. */
  fielder: Player | null;
}

/**
 * Roll the defence on a ball in play, with a real fielder attached.
 *
 * The error chance is the league rate, made harder by the POSITION and easier
 * by the GLOVE standing there. A machine shortstop is close to the flat old
 * number; an augmented slugger hidden at third is meaningfully worse, which is
 * the whole point — where you put people now matters.
 */
export function fieldBall(
  hit: HitResult,
  alignment: Alignment,
  opts: { batterSpeed: number; forceAtFirst: boolean; outs: number },
  rng: Rng,
): DefensivePlay {
  const by = fielderFor(hit);
  const fielder = alignment[by];
  const glove = fielder ? gloveOf(fielder) : 1;

  const result = rollFielding(
    hit.outcome,
    {
      speed: opts.batterSpeed,
      forceAtFirst: opts.forceAtFirst,
      outs: opts.outs,
      errorMult: POSITION_DIFFICULTY[by] / glove,
      dpMult: relayQuality(alignment),
      // ⚠️ THE ARM IS THE GLOVE, and that is a deliberate simplification. A
      // real outfielder's arm and his range are different scouting numbers;
      // here gloveOf() is one number off build and legs, and inventing a
      // second rating for thirty clubs would be thirty-five numbers nobody has
      // measured. What it gets right is the part that matters: the man out
      // there is a fielder with a rating, and running on him is now a bet.
      //
      // ponytail: split arm from glove when a club is built around one rifle
      // in right and the shared number stops telling that story.
      arm: glove,
    },
    rng,
  );

  return { ...result, by, fielder };
}

/**
 * The catcher's arm, for the running game.
 *
 * Exported here rather than in baserunning because it is a DEFENSIVE property —
 * and because it is the one link that makes putting a bad glove behind the
 * plate cost you something you can see.
 */
export const catcherArm = (a: Alignment): number => (a.C ? gloveOf(a.C) : 1);

/** For the UI: "SS" and the name standing there. */
export const describeAlignment = (a: Alignment): string =>
  FILL_ORDER.filter((p) => p !== 'DH')
    .map((p) => `${p} ${a[p]?.name ?? '—'}`)
    .join(' · ');
