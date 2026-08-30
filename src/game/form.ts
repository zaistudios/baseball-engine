/**
 * HOT AND COLD. What a man is doing THIS WEEK, as against what he is.
 *
 * ⚠️ WHY THIS EXISTS. teams.ts says what a player is worth and it never
 * changes, so before this file every meeting of two clubs had one answer and
 * the schedule just collected it. The better roster won, at exactly its rate,
 * for a hundred and sixty-two games. That is a spreadsheet, not a season — the
 * thing a baseball year actually feels like is that the best club in the league
 * gets swept in June by somebody twenty games under, because their three-hitter
 * cannot buy a knock and the other lot's fourth starter has the best week of
 * his life.
 *
 * So every player carries a FORM that drifts over the season: a multiplier on
 * the ratings that decide an at-bat, above 1 when he is seeing it and below
 * when he is not.
 *
 * ⚠️ IT IS DERIVED, NOT STORED. Form is a pure function of (season seed, day,
 * name) — so it costs the save nothing, it cannot drift out of step with a
 * reloaded season, and re-simulating a day gives the same slumps it gave the
 * first time. That last property is not a nicety: franchise.ts re-derives every
 * headless game from the season seed and the day precisely so a reloaded save
 * is the same season, and a form roll held in a mutable ledger would have been
 * the one thing that broke it.
 *
 * ⚠️ IT IS NOT PART OF WHAT A CLUB IS WORTH. value.ts does not read this and
 * must not start — the rank on the pre-game card is the roster you assembled,
 * and a club whose ranking slid because four men were cold in August would make
 * the one honest number on the screen unreadable. Form is what happens TO the
 * roster; clubValue is the roster.
 *
 * ponytail: a two-point interpolation over a hash, not a Markov chain, not a
 * stored streak counter, not a regression to a true-talent mean. Three lines of
 * arithmetic buy a curve that rises, holds and falls, which is the whole of
 * what "he is hot right now" has to mean on a screen.
 */

import { makeRng, seedFromString } from '../core/rng.ts';
import type { Player } from '../core/roster.ts';
import type { Pitcher } from '../core/pitcher.ts';
import type { Team } from './teams.ts';

/**
 * HOW LONG A RUN OF FORM LASTS, in days, before it has fully turned over.
 *
 * ⚠️ NOT ONE. Rolling form fresh every day would be noise, not a streak — the
 * player would see a different set of hot men every morning and correctly
 * conclude the label meant nothing. Twelve days is about two turns through a
 * rotation and long enough that "he has been carrying us for a week" is a true
 * sentence, while still turning over a dozen times across a full season.
 */
export const FORM_DAYS = 12;

/**
 * HOW FAR FORM MOVES A RATING, at the extremes. 0.18 means the hottest a man
 * gets is 18% above his card and the coldest is 18% below.
 *
 * ⚠️ THIS IS A BIG NUMBER ON PURPOSE AND IT IS STILL SMALL IN A GAME. Nine
 * hitters' forms average out, so a lineup's aggregate swing is roughly a third
 * of this — which is why the individual number has to be large enough to read
 * as a slump before the team number is large enough to decide a ball game.
 *
 * ⚠️ IT WIDENS THE STANDINGS RATHER THAN NARROWING THEM, WHICH IS THE OPPOSITE
 * OF WHAT IT LOOKS LIKE IT SHOULD DO. The obvious reasoning — form is symmetric
 * noise, noise makes games coin flips, coin flips pull everybody toward .500 —
 * is wrong, and it was the first thing tried. Measured over sixteen 162-game
 * seasons with `node scripts/season.ts`, at TALENT_SPREAD 0.4:
 *
 *   FORM_SWING   season win% SD   separation
 *   0            6.9              71.3%
 *   0.18         7.2              67.2%
 *   0.28         8.0              65.5%
 *   0.38         7.8              62.8%
 *
 * The reason is FORM_DAYS. A run of form lasts a fortnight, so a season is only
 * about a dozen independent draws per man, not a hundred and sixty-two — and a
 * club whose middle of the order is hot together for two weeks banks real games
 * out of it. That is a HOT TEAM, which is the thing that was missing, and it
 * costs about half a point of SD. tuning.ts sets the compression tighter to pay
 * for it; the two knobs are tuned together and moving one wants a re-read of
 * the other.
 *
 * 0.18 rather than 0.28 because separation is what a franchise is for: past
 * about a fifth, a hot fortnight starts outweighing the roster you built.
 *
 * Set it to 0 to switch form off entirely — inForm() then returns the club
 * unchanged, and every screen that reads formOf() reads flat.
 */
export const FORM_SWING: number = 0.18;

/**
 * WHERE A MAN IS, −1 (ice cold) to +1 (locked in).
 *
 * Two hashes, one per twelve-day window, smoothly blended across it. The blend
 * is a smoothstep rather than a straight line so form eases in and out instead
 * of tracking toward its next value at a constant rate — a slump should have a
 * bottom that it sits at for a few days, which is what the flat ends of the
 * curve are.
 */
export function formOf(seed: number, day: number, name: string): number {
  const t = day / FORM_DAYS;
  const i = Math.floor(t);
  const f = t - i;
  // ⚠️ THE NAME IS IN THE HASH, NOT THE ROSTER SLOT. Bat a man seventh instead
  // of third and he is the same man having the same month; hashing his position
  // would re-roll every slump in the lineup every time you set an order.
  const at = (w: number): number => makeRng(seedFromString(`${seed}:${name}:${w}`)).next() * 2 - 1;
  const w = f * f * (3 - 2 * f);
  return at(i) + (at(i + 1) - at(i)) * w;
}

/**
 * The multiplier that form is worth today. 1.0 is a man playing to his card.
 *
 * `swing` is the season's own streakiness — see rules.ts. It defaults to the
 * shipped value so an exhibition, a test or a script that has no Rules in hand
 * still gets the game as tuned.
 */
export const formMult = (
  seed: number,
  day: number,
  name: string,
  swing: number = FORM_SWING,
): number => 1 + formOf(seed, day, name) * swing;

/** A word for it, for the screens. Null when he is simply himself today. */
export function formLabel(f: number): { text: string; hot: boolean } | null {
  if (f >= 0.55) return { text: 'HOT', hot: true };
  if (f <= -0.55) return { text: 'COLD', hot: false };
  return null;
}

/**
 * THE CLUB AS IT IS PLAYING TODAY.
 *
 * ⚠️ APPLIED WHERE THE GAME IS MADE, so the half you play and the half the
 * league plays headlessly cannot disagree — the same rule tuning.ts states for
 * every knob in it. franchise.ts calls this for both sides of every simulated
 * game and main.ts calls it for yours; nothing else needs to know form exists.
 *
 * ⚠️ THE RATINGS IT MOVES ARE THE ONES THAT DECIDE AN AT-BAT, and no others.
 * Not speed — legs are legs, a man in a slump still beats out the same
 * grounders. Not stamina — how long an arm lasts is conditioning, not touch.
 * Not bunt. What gets hot is seeing the ball and squaring it up, and for a
 * pitcher, his stuff and where he is putting it.
 */
export function inForm(t: Team, seed: number, day: number, swing: number = FORM_SWING): Team {
  if (swing === 0) return t;

  const bat = (p: Player): Player => {
    const m = formMult(seed, day, p.name, swing);
    return {
      ...p,
      power: p.power * m,
      contact: p.contact * m,
      vision: p.vision * m,
      clutch: p.clutch * m,
    };
  };

  const arm = (a: Pitcher): Pitcher => {
    const m = formMult(seed, day, a.name, swing);
    return {
      ...a,
      break: (a.break ?? 1) * m,
      clutch: (a.clutch ?? 1) * m,
      // Command is a share of pitches, so it takes the same multiplier but
      // keeps the bounds every other writer of this field respects.
      zoneRate: Math.max(0.2, Math.min(0.95, a.zoneRate * m)),
    };
  };

  return {
    ...t,
    lineup: t.lineup.map(bat),
    rotation: t.rotation.map(arm),
    bullpen: t.bullpen.map(arm),
    ...(t.bench ? { bench: t.bench.map(bat) } : {}),
  };
}
