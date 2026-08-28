/**
 * What the play is CALLED — the scorer's line and the words a broadcast uses.
 *
 * The log used to read `GROUND OUT — perfect, pulled, 3°`. Every one of those
 * is true and none of them is baseball: launch angle is telemetry, the outcome
 * name is an enum, and no announcer has ever said "opposite field, 14 degrees".
 * Baseball says "six-four-three, two away" and "that is gone", and the sport is
 * mostly carried by the fact that it says those things.
 *
 * This is text only. It reads the outcome, the fielder who got there and the
 * fielding roll, and describes them. It decides nothing.
 */

import type { Outcome } from '../core/hitTables.ts';

/** Scorer's shorthand for the nine positions. */
const POS: Record<number, string> = {
  1: 'the pitcher',
  2: 'the catcher',
  3: 'first',
  4: 'second',
  5: 'third',
  6: 'short',
  7: 'left',
  8: 'center',
  9: 'right',
};

const isOutfield = (num: number): boolean => num >= 7;

/**
 * Where it went, in the only terms a broadcast uses.
 *
 * Returns a BARE place, carrying no preposition of its own — every caller
 * writes "to ${fieldOf(d)}". The first version baked one in and produced "into
 * the gap into right-center", which is the sort of thing that only shows up
 * once the sentences are read out loud.
 */
export function fieldOf(directionDeg: number): string {
  if (directionDeg < -28) return 'the left-field corner';
  if (directionDeg < -10) return 'left field';
  if (directionDeg < -3) return 'left-center';
  if (directionDeg <= 3) return 'center';
  if (directionDeg <= 10) return 'right-center';
  if (directionDeg <= 28) return 'right field';
  return 'the right-field corner';
}

/** How many are gone, said the way a park announcer says it. */
function away(outs: number): string {
  if (outs >= 3) return 'and that retires the side';
  if (outs === 2) return 'two away';
  if (outs === 1) return 'one away';
  return 'nobody out';
}

export interface PlayCall {
  /** The scorer's line: 6-4-3, F8, E4, 1B. Short enough to sit in a HUD. */
  score: string;
  /** What the booth says. One sentence, no telemetry in it. */
  says: string;
}

export interface PlayInput {
  outcome: Outcome;
  /** Scorer's number of whoever got to the ball. */
  chaser: number;
  doublePlay: boolean;
  error: boolean;
  /** Outs AFTER the play, for the "two away" tag. */
  outs: number;
  /** Runs that scored on the play. */
  scored: number;
  direction: number;
  /**
   * The man on third tagged and scored on this out.
   *
   * Needed as its own flag rather than inferred from `outcome is an out && ran
   * scored`, because the sacrifice fly is the only out that scores anybody and
   * the caller already knows — inning.ts decided it. Without this the popup
   * and line_out arms below would score a run and say nothing about it, which
   * is the picture contradicting the book.
   */
  sacFly?: boolean;
}

/**
 * Name the play.
 *
 * ponytail: the scorer's line is assembled from the chaser and the outcome
 * rather than from a real putout/assist chain, because there is no such chain
 * — fielding.ts rolls two booleans and nobody is tracked touching the ball. So
 * a ground out is always `N-3` and a double play is always `N-4-3`, which is
 * true of the picture the replay draws and would be a lie in a game that
 * modelled the relay. If fielding ever gains real assists, this reads them
 * instead of guessing.
 */
export function callPlay(p: PlayInput): PlayCall {
  const who = POS[p.chaser] ?? 'the infield';
  const runs = p.scored > 0 ? (p.scored === 1 ? ' A run scores.' : ` ${p.scored} score.`) : '';

  if (p.error) {
    return {
      score: `E${p.chaser}`,
      says: `Booted by ${who} — he's aboard on the error.${runs}`,
    };
  }

  if (p.doublePlay) {
    // Always through second. See the note above.
    return {
      score: `${p.chaser}-4-3`,
      says: `Two! Around the horn, ${away(p.outs)}.${runs}`,
    };
  }

  // Ahead of the outcome switch, because a sacrifice fly IS a popup or a
  // line_out and both of those arms describe an out that scored nobody.
  if (p.sacFly) {
    return {
      score: `SF${p.chaser}`,
      says: `Deep enough to ${who} — he tags, and he scores. ${away(p.outs)}.`,
    };
  }

  switch (p.outcome) {
    case 'home_run':
      return {
        score: 'HR',
        says:
          p.scored > 1
            ? `That is GONE — a ${p.scored}-run shot to ${fieldOf(p.direction)}.`
            : `That is GONE, deep to ${fieldOf(p.direction)}.`,
      };
    case 'triple':
      return {
        score: '3B',
        says: `All the way to ${fieldOf(p.direction)} — he's going to make third.${runs}`,
      };
    case 'double':
      return {
        score: '2B',
        says: `A drive to ${fieldOf(p.direction)}, he's got two.${runs}`,
      };
    case 'single':
      return { score: '1B', says: `Base hit to ${fieldOf(p.direction)}.${runs}` };
    case 'popup':
      // The outcome is named `popup`, but one caught by an outfielder is a fly
      // ball and calling it a popup is the enum leaking into the booth.
      return isOutfield(p.chaser)
        ? { score: `F${p.chaser}`, says: `Fly ball to ${who}, ${away(p.outs)}.` }
        : { score: `P${p.chaser}`, says: `Popped up — ${who} takes it, ${away(p.outs)}.` };
    case 'line_out':
      return {
        score: `${isOutfield(p.chaser) ? 'F' : 'L'}${p.chaser}`,
        says: isOutfield(p.chaser)
          ? `Hit hard, but right at ${who}. ${away(p.outs)}.`
          : `Lined right at ${who} — ${away(p.outs)}.`,
      };
    case 'ground_out':
      // The first baseman fielding it himself steps on the bag. "Over to
      // first, to first" was the seam showing.
      return p.chaser === 3
        ? { score: '3U', says: `Ground ball to first — he steps on it himself, ${away(p.outs)}.` }
        : {
            score: `${p.chaser}-3`,
            says: `Ground ball to ${who}, over to first, ${away(p.outs)}.`,
          };
    case 'foul':
      return { score: 'F', says: 'Fouled off.' };
    case 'strikeout':
      return { score: 'K', says: `Struck him out, ${away(p.outs)}.` };
  }
}
