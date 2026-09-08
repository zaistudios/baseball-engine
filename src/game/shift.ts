/**
 * THE SHIFT — where the nine choose to stand, as against where they always did.
 *
 * ⚠️ THE GAME HAS BEEN TALKING ABOUT THIS FEATURE FOR WEEKS WITHOUT HAVING IT.
 * `describePlay()` in placement.ts says the scorer's sentence exists so the
 * player learns "that pulling everything into the shift is why they keep making
 * outs" — and there was no shift. `FIELDERS` in web/plot.ts is one fixed table
 * and every hitter in the league was played straight up, so the sentence was
 * describing a punishment the game could not administer.
 *
 * WHY THIS IS ALMOST NO CODE. None of the consequences are written here. The
 * geometry already reads the fielder table three times and all three fall out
 * of moving it:
 *
 *   nearestFielder()  who chases it — a shifted man is nearest to more balls
 *   gapTo()           how much room the hitter found, which is contest()'s
 *                     whole input for robbed-or-through
 *   overhead.ts       the nine dots, which is how the player SEES it happen
 *
 * So a shift is a different table, threaded as far as the three callers and no
 * further. Nothing in here decides an out.
 *
 * ⚠️ IT IS ASYMMETRIC ON PURPOSE, and that is not a bug to tidy. Against a
 * left-handed pull hitter the first baseman stays at the bag because somebody
 * has to take the throw, and the shift is built out of the other three. Against
 * a right-handed one the third baseman is the man on the line and the first
 * baseman only cheats a step. Mirroring the tables would put nobody at first.
 *
 * ponytail: four named alignments, not a continuous positioning model. A real
 * defence places nine men on a spray chart per hitter per count; this is the
 * four a manager would call out loud, which is all a player can read off nine
 * dots anyway. Go continuous when the game has a spray chart to read from.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ THE TABLES BELOW ARE MEASURED, AND THE FIRST TWO VERSIONS WERE WRONG IN
 * THE SAME DIRECTION: A SHIFT THAT HELPED THE HITTER.
 *
 * scripts/balance.ts, 500 games, runs per team:
 *
 *   no shift at all      4.41   (baseline)
 *   v1 infield + outfield 4.65  ← +0.24. Shipping this would have handed the
 *                                 offence a quarter of a run a game.
 *   v2 infield only       4.53  ← +0.12. Better, still backwards.
 *   v3 as written         4.45  ← neutral, and what is here.
 *
 * WHY IT KEPT COMING OUT BACKWARDS, because the next person to widen these
 * numbers needs to know: moving a man CLOSES a hole worth one gap and OPENS
 * one worth another, and contest() reads gap distance more or less linearly.
 * v1 moved all three outfielders, where a few degrees is a lot of feet and
 * gaps turn into extra bases. v2 still swung the second baseman across the bag
 * — a 25° move that vacated the entire right side, and pull hitters in this
 * engine do not pull hard enough to pay for it.
 *
 * So the rule for these numbers: the hole you open must be smaller than the
 * hole you close. In practice that caps a man at about 15° — a LEAN rather
 * than the four-men-on-one-side picture the word "shift" suggests, and the
 * shift.test.ts case that asserts the cap will fail if somebody widens it
 * without re-running balance.ts.
 *
 * ⚠️ RE-RUN scripts/balance.ts AFTER TOUCHING ANY NUMBER IN MOVES. Neutral in
 * aggregate is the requirement — a defensive alignment is meant to redistribute
 * who gets out, not to move the league's run environment.
 *
 * STILL UNMEASURED, and the honest next question: whether it punishes the
 * PULL HITTERS specifically. Aggregate neutrality is consistent both with "the
 * shift works and the opposite-field hitters take the runs back" and with "it
 * does nothing to anybody". Splitting the batted-ball outcomes by pullScore
 * would settle it and no script does that yet.
 */

import { FIELDERS, type Fielder } from '../web/plot.ts';
import type { Player } from '../core/roster.ts';

export type Shift = 'straight' | 'left' | 'right' | 'in';

/** Menu order, which is also the order the d-pad cycles them. */
export const SHIFTS: readonly Shift[] = ['straight', 'left', 'right', 'in'];

/** What the HUD calls each one. Short — it sits in a cartridge-width box. */
export const SHIFT_WORDS: Record<Shift, string> = {
  straight: 'STRAIGHT UP',
  left: 'SHIFT LEFT',
  right: 'SHIFT RIGHT',
  in: 'INFIELD IN',
};

/** The one-line explanation under the menu, so a shift is never a mystery. */
export const SHIFT_BLURB: Record<Shift, string> = {
  straight: 'nobody moves',
  left: 'stacked against a right-handed pull hitter',
  right: 'stacked against a left-handed pull hitter',
  in: 'cuts the run at third — and opens the holes',
};

/**
 * WHO MOVES, and only who moves. Merged over FIELDERS below.
 *
 * Written as overrides rather than four full tables because the interesting
 * information is the difference — and because a full copy would silently stop
 * tracking FIELDERS the first time somebody adjusts standard depth.
 *
 * ⚠️ THE PITCHER AND THE CATCHER ARE NEVER IN HERE. 1 and 2 have jobs that are
 * not positioning, and a shifted catcher is a passed ball.
 */
const MOVES: Record<Exclude<Shift, 'straight'>, Record<number, Partial<Omit<Fielder, 'num'>>>> = {
  // Against a LEFTY, who pulls to right (positive degrees). First base holds
  // the bag; second goes deep toward the line, short crosses the bag, and
  // third comes all the way over to where short usually plays.
  right: {
    4: { dirDeg: 27 },
    6: { dirDeg: -4 },
    5: { distFt: 122, dirDeg: -26 },
  },
  // Against a RIGHTY, who pulls to left (negative degrees). Third is the man
  // on the line, short plays deep in the hole, second slides across the bag —
  // and first only cheats over, because he still has to cover.
  left: {
    5: { dirDeg: -34 },
    6: { dirDeg: -26 },
    4: { dirDeg: 4 },
    3: { distFt: 112, dirDeg: 32 },
  },
  // All four infielders shallow enough to throw home. The outfield does not
  // move — this is a play at the plate, not a rewrite of the defence.
  in: {
    3: { distFt: 85, dirDeg: 34 },
    4: { distFt: 112, dirDeg: 20 },
    5: { distFt: 85, dirDeg: -34 },
    6: { distFt: 112, dirDeg: -20 },
  },
};

/**
 * The nine, standing where this shift puts them.
 *
 * `straight` returns the shared FIELDERS array itself, which keeps the default
 * path allocation-free and makes "did anything move" an identity check.
 */
export function fieldersFor(shift: Shift): readonly Fielder[] {
  if (shift === 'straight') return FIELDERS;
  const moves = MOVES[shift];
  return FIELDERS.map((f) => (moves[f.num] ? { ...f, ...moves[f.num] } : f));
}

/**
 * How much a hitter deserves to be shifted on, 0 to 1.
 *
 * Power pulls and contact sprays — the man you shift is the one who cannot or
 * will not go the other way, which in this engine's stats is high power against
 * low contact.
 *
 * ⚠️ NO SWITCH-HITTER CASE, and that is not an omission here. `Hand` is 'L' |
 * 'R' and roster.ts says why: "S" is not a hand, it is whichever side is better
 * against tonight's arm, and it needs a rule at every read site. If that
 * deferral is ever taken up, this is one of the read sites — a switch hitter
 * should score 0, because batting from the side the shift is wrong for is the
 * entire reason to switch hit.
 */
export const pullScore = (b: Player): number =>
  Math.max(0, Math.min(1, (b.power - 0.95) / 0.55 - (b.contact - 1) * 0.6));

/**
 * Shift on a hitter this extreme or worse. Set where the league's genuine
 * sluggers clear it and its contact hitters do not: Ty Brennan (1.55 power,
 * 0.70 contact) is a 1.0, Cap Mullaney (0.70 power, 1.30 contact) is a 0.
 *
 * ponytail: one threshold, not a per-club aggression setting. Raise it if the
 * computer shifts on men it has no business shifting on.
 */
export const SHIFT_ON = 0.55;

/**
 * WHAT THE COMPUTER CALLS. The manager's version of this decision.
 *
 * Infield in outranks the shift, because a run beats a base: with the tying or
 * go-ahead run ninety feet away and fewer than two outs, you stop the run and
 * accept the holes. Otherwise it shifts the pull hitters and plays everyone
 * else honest.
 */
export function pickShift(
  batter: Player,
  situation: { outs: number; runnerOnThird: boolean; late: boolean },
): Shift {
  if (situation.runnerOnThird && situation.outs < 2 && situation.late) return 'in';
  if (pullScore(batter) < SHIFT_ON) return 'straight';
  // He pulls. A righty pulls to left field, a lefty to right — see the sign
  // note in core/hit.ts, which is the one place this convention is stated.
  return batter.bats === 'L' ? 'right' : 'left';
}
