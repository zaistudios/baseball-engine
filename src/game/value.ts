/**
 * WHAT A CLUB IS WORTH. One number for a player, one for an arm, one for a
 * ball club, and the rank that number earns in the league.
 *
 * ⚠️ THIS EXISTS BECAUSE THE LEAGUE IS NO LONGER TRYING TO BE FAIR. teams.ts
 * was balanced to hold every club between 45% and 55%, and scripts/league.ts
 * printed a "roster value" purely so a club that drifted out of that band could
 * be nudged back in. That is the right goal for an EXHIBITION, where you pick
 * both clubs and a coin flip is the point.
 *
 * It is the wrong goal for a FRANCHISE. If a stacked club and a thin one finish
 * 7-7, then nothing you ever do to a roster can matter, and every roster
 * feature that follows — trades, development, signings, injuries — is decided
 * in advance to be decoration. So the franchise takes the opposite rule: the
 * good clubs win, the thin ones lose, and this file is how anybody can see
 * which is which BEFORE the game rather than inferring it from a standings
 * table in September.
 *
 * ⚠️ NO SCALE WAS INVENTED FOR THE CLUB NUMBER. The obvious move is to map
 * club strength onto the 20-99 card scale, and it does not work: the eight
 * clubs sit inside about 3% of each other on raw value, which lands them all
 * between 46 and 54 and reads as "every club is average" — the exact lie this
 * file exists to stop telling. RANK IN THE LEAGUE is legible with no constant
 * to calibrate and no re-tuning when a roster changes, which is the whole point
 * of a number that has to survive trades.
 *
 * ponytail: weights, not a model. Six numbers on a hitter and four on an arm,
 * multiplied and added — no regression, no fitted curve. But they are MEASURED
 * weights, not chosen ones: `node scripts/sensitivity.ts` moves one rating
 * across a whole roster, plays two thousand games and reads the win rate back.
 * Re-run it if you move one. The first cut of this file guessed instead, and
 * three of the seven guesses were wrong.
 */

import type { Player } from '../core/roster.ts';
import type { Pitcher } from '../core/pitcher.ts';
import type { Team } from './teams.ts';
import { gloveOf } from './defense.ts';
import { EXTRA_BASE_SPEED } from '../core/inning.ts';

/**
 * A 1.0-centred multiplier, shown on THE SHOW'S 20-99 SCALE.
 *
 * ⚠️ THE SCALE IS A DISPLAY, NOT A STORAGE FORMAT. Everything in the engine is
 * a multiplier around 1.0 because that is what the maths wants — 1.3 contact
 * widens a window by 30% and reads as itself in every formula it appears in.
 * Nobody reads a ratings card that way, so the conversion lives here, at the
 * one place a human looks at the number, and nowhere else.
 *
 * 1.0 lands on 50, which is what an average major leaguer is on that scale.
 */
export const showScale = (v: number): number =>
  Math.max(20, Math.min(99, Math.round((99 * (v - 0.4)) / 1.2)));

/**
 * One number for what a hitter is worth.
 *
 * ⚠️ EVERY WEIGHT HERE WAS MEASURED BY scripts/sensitivity.ts, WHICH IS THE
 * ONLY REASON TO TRUST ANY OF THEM. The first cut inherited five weights from
 * an older scoring function and guessed at the two ratings that did not exist
 * when it was written. Measurement — move one rating across a whole roster,
 * play 2,100 games, read the win rate — said three of the seven were wrong,
 * and one of them badly:
 *
 *   POWER was 0.9 and is worth 1.46. Nearly as much as contact, not half.
 *   VISION was 0.7 and is worth 0.32. It converts whiffs into weak contact,
 *     which is worth real runs but not contact-stat money.
 *   SPEED was 0.8 and is worth ABOUT NOTHING as a linear term — see below.
 *     This single weight is why Los Angeles, the fastest club in the league,
 *     showed up on the pre-game screen as the 4th-best roster and finished
 *     6th over three hundred seasons.
 *
 * ⚠️ SPEED IS A THRESHOLD STAT AND A LINEAR WEIGHT CANNOT SAY SO. Bumping a
 * whole lineup +0.1 is worth nothing measurable; bumping it +0.5 is worth
 * fifteen points of win rate. The difference is EXTRA_BASE_SPEED (1.15 in
 * inning.ts): legs pay in a LUMP when a man crosses it and pay almost nothing
 * either side. So the lump is priced as a lump. Steals and the double play do
 * scale continuously, which is what the small linear term is for.
 *
 * ponytail: bunt has no term at all. Measured at 0.02 points of win rate, it
 * is a rounding error on a club total — and a weight of zero written out is a
 * weight somebody will "fix" later. It is a real rating that decides real
 * plate appearances; it is just not how you tell two ROSTERS apart.
 */
export const playerValue = (p: Player): number =>
  p.contact * 1.6 +
  p.power * 1.46 +
  p.clutch * 0.51 +
  p.vision * 0.32 +
  p.speed * 0.1 +
  (p.speed >= EXTRA_BASE_SPEED ? 0.35 : 0) +
  gloveOf(p) * 0.3;

/**
 * ...and one for an arm. Measured the same way, and it moved further than the
 * hitters did.
 *
 * ⚠️ CONTROL WAS THE HEAVIEST WEIGHT HERE AND IS WORTH ALMOST NOTHING. It was
 * 1.4 on the strength of a note in teams.ts calling a high zone rate the
 * single biggest lever on a staff. That note was true when it was written and
 * is not true now: BREAK did not exist then, and an arm that can miss bats has
 * made throwing strikes far less of a trade. Measured, +0.05 of zone rate buys
 * 0.33 points of win rate against break's 3.33. Twenty to one, the other way
 * round from what this file used to claim.
 *
 * ⚠️ VELOCITY IS WORTH EXACTLY ZERO AND IS NOT PRICED AT ALL. Not "small" —
 * zero, to every decimal, in every simulated game. The AI hitter draws its
 * timing offset from AI_TIMING_BANDS and never reads how fast the pitch is
 * coming, so a 132mph fastball is hit exactly as often as a 92mph one. Against
 * a HUMAN velocity is real — it is the reaction time in ballArrivalMs — which
 * is why the rating still exists and still shows on the card. It just cannot
 * be part of what a roster is WORTH while every game the league plays is
 * simulated. See the note in ai.ts.
 */
export const armValue = (a: Pitcher): number =>
  (a.clutch ?? 1) * 0.76 +
  (a.break ?? 1) * 0.73 +
  (a.stamina ?? 1) * 0.43 +
  (a.zoneRate / 0.55) * 0.07;

/**
 * The bats and the arms, added.
 *
 * ⚠️ THERE IS NO LONGER A HITTING SHARE, and deleting it was a correction, not
 * a simplification. The old 0.65/0.35 split was a guess about how much a
 * lineup matters against a rotation. It is not needed: sensitivity.ts measures
 * hitting and pitching ON THE SAME AXIS — points of win rate, with the bump
 * applied to the whole lineup or the whole rotation exactly as a real roster
 * difference would be — so the weights above ALREADY carry their relative
 * importance. Multiplying by a share on top applied that judgement twice.
 */
export function clubValue(t: Team): number {
  const bats = t.lineup.reduce((a, p) => a + playerValue(p), 0) / Math.max(1, t.lineup.length);
  // ⚠️ ALL SIX ARMS, ROTATION AND PEN TOGETHER, on one flat average.
  //
  // The obvious alternative is to weight starters above relievers, because
  // starters throw most of the innings. That is a GUESS about how much, and
  // this file deleted its last such guess on purpose — see the note on the
  // hitting share below. A flat mean over the whole staff says "your pen is
  // part of your club" without inventing a number to say how much.
  //
  // It is also why every club's value fell when the pen arrived: relievers run
  // 0.6-0.74 stamina and stamina is weighted 0.43, so six arms average lower
  // than three did. The whole league moved together, so the RANK — which is
  // the only thing this file exists to produce — barely moved at all.
  const staff = [...t.rotation, ...t.bullpen];
  const arms = staff.reduce((a, p) => a + armValue(p), 0) / Math.max(1, staff.length);
  return bats + arms;
}

/** Every club, strongest first. The pre-game screen reads its rank off this. */
export const byStrength = (teams: readonly Team[]): Team[] =>
  [...teams].sort((a, b) => clubValue(b) - clubValue(a));

/** Where this club sits, 1-based. 1 is the best roster in the league. */
export const strengthRank = (t: Team, teams: readonly Team[]): number =>
  byStrength(teams).findIndex((x) => x.abbr === t.abbr) + 1;

/**
 * A word for the rank, because "4th of 8" and "STACKED" answer different
 * questions and the screen has room for both.
 */
export function strengthLabel(rank: number, total: number): string {
  if (total <= 1) return 'THE LEAGUE';
  const share = (rank - 1) / (total - 1);
  if (share <= 0.15) return 'STACKED';
  if (share <= 0.4) return 'STRONG';
  if (share <= 0.6) return 'EVEN';
  if (share <= 0.85) return 'LIGHT';
  return 'THIN';
}
