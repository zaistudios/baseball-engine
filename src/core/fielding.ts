/**
 * The defence gets a say. Two rolls, both on balls already ruled outs.
 *
 * THE SCOPE LINE, same shape as baserunning.ts: this is not a fielding
 * simulation. There are no positions, no fielders, no range ratings, no
 * assists and no scorer deciding hit-or-error. There are two questions a
 * batter-only game can feel from the box — "did that turn two" and "did they
 * boot it" — and nothing else.
 *
 * Rolled here, applied by inning.ts. Same split as baserunning: the core
 * decides whether it happened, the inning layer decides what it cost.
 *
 * ⚠️ BALANCE COUPLING, read before tuning either number. inning.ts carried a
 * standing note that an out never scores a runner (no sac fly, no productive
 * ground out) AND never costs two, and that "the two omissions pull in
 * opposite directions, which is the only reason it is safe to leave both out."
 * The double play below removes one half of that pair. Run scoring will fall.
 * The sacrifice fly is the paired lever that puts it back, and it is
 * deliberately NOT here — see the note in inning.ts.
 */

import type { Rng } from './rng.ts';
import type { Outcome } from './hitTables.ts';

/**
 * Chance a ground ball with a force at first turns two, at speed 1.0.
 *
 * ponytail: 0.35 is a game-feel number, not a measured one. Real ball turns
 * two on roughly an eighth of ground-ball opportunities; that is too rare to
 * register in a three-inning encounter, and the point of the feature is that
 * the player feels it. Tune here, not at the call site.
 */
export const DOUBLE_PLAY_RATE = 0.35;

/**
 * Chance a ball in play is booted, at speed 1.0.
 *
 * ponytail: real MLB errors run near 1.5% of chances. Same argument as above —
 * at that rate a player would finish a run having never seen one. 0.05 shows
 * up about once every couple of encounters, which is often enough to read as
 * a rule and rare enough to still feel like luck.
 */
export const ERROR_RATE = 0.05;

/** Only these can be booted. A popup is caught or it is not, and a strikeout has no fielder. */
const BOOTABLE: ReadonlySet<Outcome> = new Set<Outcome>(['ground_out', 'line_out']);

export interface FieldingResult {
  /** The batter reaches, and nobody is out. */
  error: boolean;
  /** The batter and the forced runner are both out. */
  doublePlay: boolean;
  /**
   * THE THROW TO THE EXTRA BASE, pre-rolled — see gunDown() and the note on
   * ARM_STRENGTH below.
   *
   * ⚠️ WHY IT IS A ROLL AND NOT A VERDICT. Only advance() knows which runner
   * actually goes: it depends on his legs, on whether the road in front of him
   * is open, and on how many bases the hit was worth. None of that is knowable
   * out here. But advance() is pure and has no rng, by design — the whole core
   * replays from a seed. So the caller throws ONE die and hands over both the
   * die and the odds, and inning.ts decides what they mean once it knows who
   * is running. One roll, the right runner, and still deterministic.
   */
  extraBase?: { odds: number; roll: number };
  /**
   * ONE DIE PER OCCUPIED BAG — [first, second, third] — for "does this runner
   * go", pre-rolled for the same reason extraBase is: inning.ts decides, and
   * inning.ts has no rng.
   *
   * Indexed by the base he is STANDING on, not the one he wants, so a hit and
   * a ground ball read the same slot for the same man. Absent means the caller
   * did not roll (the CLI, and every test that passes CLEAN), and inning.ts
   * falls back to the old flat speed threshold.
   */
  advanceRolls?: readonly [number, number, number];
}

export const CLEAN: FieldingResult = { error: false, doublePlay: false };

/**
 * ODDS AN AVERAGE RUNNER IS GUNNED DOWN going first-to-third or second-to-home,
 * before his own legs are taken into account.
 *
 * ⚠️ THE EXTRA BASE USED TO BE FREE, and that is what this changes. A runner at
 * 1.15 speed or better simply took it, every time, with no throw and no risk —
 * so an outfield arm was a rating that appeared on a card and could not be felt,
 * and there was never a reason not to send him.
 *
 * 0.28 against a league-average arm is deliberately well under half. Sending a
 * runner has to stay the RIGHT play most of the time or nobody sends anybody
 * and the mechanic just removes baserunning. What it buys is that the extra
 * base is now a bet with a price, and a cannon in right field is a thing you
 * notice before you notice it in a stat line.
 */
export const THROW_RATE = 0.28;

/**
 * Does the throw beat him? The runner's own legs divide it, the arm multiplies.
 *
 * Exported because the UI has to be able to say what a send is worth — the same
 * reason isSacrificeFly() is exported. A gamble whose price you cannot see is
 * not a decision, which is the rule the steal button already follows.
 */
export function gunDown(odds: number, roll: number, runnerSpeed: number): boolean {
  return roll < Math.max(0, Math.min(0.75, odds / Math.max(0.1, runnerSpeed)));
}

/**
 * Odds the batter beats the relay. Fast men stay out of double plays, which is
 * the main reason speed should matter to a hitter who is not stealing.
 *
 * `speed` is the same multiplier around 1.0 that baserunning.ts uses.
 */
export function doublePlayChance(speed: number): number {
  // Divide rather than subtract, so a 1.4 burner and a 0.7 catcher sit either
  // side of the base rate by the same factor.
  return Math.max(0.05, Math.min(0.9, DOUBLE_PLAY_RATE / Math.max(0.1, speed)));
}

/**
 * Roll the defence on a ball in play.
 *
 * `forceAtFirst` is the caller's answer to "is there a runner on first" — the
 * double play needs a force, and this module does not know about bases.
 *
 * Order matters: the error is rolled first, because a booted ball is not also
 * a double play. Getting that backwards produces a turn-two that the fielder
 * simultaneously dropped.
 */
export function rollFielding(
  outcome: Outcome,
  opts: {
    speed: number;
    forceAtFirst: boolean;
    outs: number;
    /**
     * Scales the error chance for THIS ball. 1 is the flat league rate.
     *
     * Added 2026-08-20 for the positional defence in game/defense.ts, where a
     * ball hit at a shortstop and a ball hit at a first baseman are no longer
     * the same play. Defaults to 1, so the roguelike — which has no fielders —
     * behaves exactly as it always did.
     */
    errorMult?: number;
    /** Same idea for the relay. A better middle infield turns more of them. */
    dpMult?: number;
    /**
     * The arm out there, as a multiplier around 1.0. Scales THROW_RATE, so a
     * cannon in right actually costs a runner the base he used to get free.
     * Defaults to 1 — the roguelike has no fielders and is unchanged.
     */
    arm?: number;
  },
  rng: Rng,
): FieldingResult {
  // ⚠️ THE THROW IS ROLLED LAST, AFTER the outs, and the order is load-bearing.
  // Putting it first shifted every draw behind it, which quietly re-rolled
  // every error and every double play in the game — a seeded season would have
  // replayed differently for a reason that had nothing to do with it. Outs
  // first, exactly as before; the throw takes the draw after them.
  const outs = rollOuts(outcome, opts, rng);
  return {
    ...outs,
    extraBase: { odds: THROW_RATE * (opts.arm ?? 1), roll: rng.next() },
    // Same rule as the throw: rolled LAST, so nothing already drawn shifts.
    advanceRolls: [rng.next(), rng.next(), rng.next()],
  };
}

/** The original two rolls, untouched: is it booted, and is it two? */
function rollOuts(
  outcome: Outcome,
  opts: { speed: number; forceAtFirst: boolean; outs: number; errorMult?: number; dpMult?: number },
  rng: Rng,
): FieldingResult {
  if (!BOOTABLE.has(outcome)) return CLEAN;

  const errorChance = Math.max(0, Math.min(0.5, ERROR_RATE * (opts.errorMult ?? 1)));
  if (rng.next() < errorChance) return { error: true, doublePlay: false };

  const canTurnTwo =
    outcome === 'ground_out' && opts.forceAtFirst && opts.outs < 2;
  if (!canTurnTwo) return CLEAN;

  const dp = Math.max(0, Math.min(0.95, doublePlayChance(opts.speed) * (opts.dpMult ?? 1)));
  return { error: false, doublePlay: rng.next() < dp };
}
