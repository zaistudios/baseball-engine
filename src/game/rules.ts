/**
 * THE RULES OF YOUR LEAGUE. What a franchise decided, once, before it played a
 * game — how long the year is, how far apart the clubs are, how much a hot
 * streak is worth, how many runs a night, and what the bracket looks like.
 *
 * ⚠️ THIS FILE IS THE CUSTOMIZATION PILLAR'S SPINE. Season length was the first
 * setting and it lived as a bare number on the Season; every setting after it
 * would have been another bare number, another optional field, another place to
 * remember to validate. So they live together in one object with one default,
 * one validator and one screen — and the next knob is a line here rather than a
 * change in five files.
 *
 * ⚠️ IT HOLDS NO ENGINE LOGIC. Everything that ACTS on a setting lives with the
 * thing being acted on — parity is temper() in teams.ts, streakiness is
 * form.ts, the bracket is franchise.ts. This is types, bounds, and the list of
 * what the screen may offer.
 *
 * ⚠️ THE DEFAULTS ARE IMPORTED, NOT RETYPED. `parity` and `streak` default to
 * the values tuning.ts and form.ts were MEASURED at — see the notes there — and
 * writing 0.35 here as well would be two sources for one number. They drift the
 * first time somebody retunes one and greps for the other: the exhibition and
 * the scripts read LEAGUE, which is built at TALENT_SPREAD, while a default
 * franchise would quietly have been built at whatever this file still said.
 *
 * ⚠️ A SETTING IS FIXED FOR THE YEAR. Every one of these is read at kickoff to
 * build the season's rosters and its calendar, so changing one mid-season would
 * mean a standings table half-played under one set of rules and half under
 * another. The title screen asks; nothing else may write.
 *
 * ponytail: plain numbers with bounds, no per-setting class, no registry, no
 * schema library. The validator is one function and it is the only thing that
 * ever has to agree with the bounds.
 */

import { TALENT_SPREAD } from './tuning.ts';
import { FORM_SWING } from './form.ts';

/** How long the regular season runs. See schedule() in franchise.ts. */
export const DEFAULT_GAMES = 14;

/** The longest year the picker offers, and the ceiling a save is clamped to. */
export const MAX_GAMES = 162;

/**
 * ⚠️ EVERY LENGTH IS EVEN, and that is a requirement rather than a taste. The
 * schedule is laid down in HOME-AND-AWAY PAIRS, so an odd length would cut the
 * last pair in half and hand one club a home game the other never gets back.
 */
export const LENGTHS: readonly { games: number; blurb: string }[] = [
  { games: DEFAULT_GAMES, blurb: 'an afternoon — seven clubs, home and away' },
  { games: 28, blurb: 'fourteen rivals, twice each' },
  { games: 56, blurb: 'almost the whole league, home and away' },
  { games: 100, blurb: 'everybody twice, and then some' },
  { games: MAX_GAMES, blurb: 'the real slate — sim the ones you skip' },
];

export interface Rules {
  /** How long the regular season is. */
  games: number;
  /**
   * HOW FAR APART THE CLUBS ARE — a multiplier on each club's distance from the
   * league average at every rating. 1 plays teams.ts exactly as written; lower
   * pulls the thirty toward each other. See temper() in teams.ts and the note
   * on TALENT_SPREAD in tuning.ts for how the shipped default was measured.
   */
  parity: number;
  /**
   * HOW FAR FORM SWINGS. 0 switches hot and cold off entirely and every man
   * plays to his card all year. See form.ts.
   */
  streak: number;
  /**
   * THE RUN ENVIRONMENT — a multiplier on the league's hitting. Above 1 is a
   * hitter's era, below is a pitcher's. Applied to every club equally at
   * kickoff, so it moves the scoreboard without moving the ladder.
   */
  offence: number;
  /**
   * HOW MANY CLUBS MAKE THE BRACKET. A power of two, so every round halves.
   */
  bracket: number;
  /**
   * GAMES IN A PLAYOFF ROUND. 1 is the single-elimination the mode shipped
   * with; 7 is a real series. Odd, so a round cannot end level.
   */
  series: number;
}

export const DEFAULT_RULES: Rules = {
  games: DEFAULT_GAMES,
  parity: TALENT_SPREAD,
  streak: FORM_SWING,
  offence: 1,
  bracket: 4,
  series: 1,
};

/**
 * WHAT THE SCREEN OFFERS, and the only values the picker can produce.
 *
 * ⚠️ THE LABELS ARE WHAT THE SETTING DOES, NOT WHAT IT IS. "How much does
 * talent decide games" is answerable by somebody who has never read this file;
 * "TALENT_SPREAD 0.35" is not. The number stays visible in the blurb because a
 * player who wants to know exactly what he picked deserves to.
 */
export interface Choice<K extends keyof Rules> {
  value: Rules[K];
  name: string;
  blurb: string;
}

export const PARITY: readonly Choice<'parity'>[] = [
  { value: 0.2, name: 'TIGHT', blurb: 'anybody can beat anybody — talent barely shows' },
  { value: TALENT_SPREAD, name: 'REAL', blurb: 'a real major league: the good clubs win ~62%' },
  { value: 0.6, name: 'WIDE', blurb: 'the ladder pays, and the bottom is grim' },
  { value: 1, name: 'BRUTAL', blurb: 'teams.ts as written — two leagues in one table' },
];

export const STREAK: readonly Choice<'streak'>[] = [
  { value: 0, name: 'NONE', blurb: 'every man plays to his card, all year' },
  { value: FORM_SWING, name: 'REAL', blurb: 'men run hot and cold for a fortnight at a time' },
  { value: 0.3, name: 'STREAKY', blurb: 'a slump can cost you a month' },
];

export const OFFENCE: readonly Choice<'offence'>[] = [
  { value: 0.9, name: 'DEADBALL', blurb: 'low scoring, one run at a time' },
  { value: 1, name: 'MODERN', blurb: 'about four and a half a night' },
  { value: 1.1, name: 'LIVELY', blurb: 'the ball is flying — bring your bullpen' },
];

export const BRACKET: readonly Choice<'bracket'>[] = [
  { value: 2, name: 'ONE GAME', blurb: 'top two, winner takes it' },
  { value: 4, name: 'FOUR CLUBS', blurb: 'semifinals, then a final' },
  { value: 8, name: 'EIGHT CLUBS', blurb: 'three rounds — a real postseason' },
];

export const SERIES: readonly Choice<'series'>[] = [
  { value: 1, name: 'ONE AND DONE', blurb: 'every round is a single game' },
  { value: 3, name: 'BEST OF THREE', blurb: 'a bad night is survivable' },
  { value: 5, name: 'BEST OF FIVE', blurb: 'rotation depth starts to matter' },
  { value: 7, name: 'BEST OF SEVEN', blurb: 'the long haul' },
];

/**
 * A trusted Rules out of anything at all.
 *
 * ⚠️ IT CLAMPS RATHER THAN REFUSES, AND THAT IS THE OPPOSITE OF loadSeason().
 * A bad `day` or a missing roster means a season that cannot be played and the
 * save is thrown away whole. A bad `parity` means a season that plays slightly
 * differently from the one that was saved — annoying, not broken — and throwing
 * away somebody's franchise over a hand-edited feel knob is the worse trade. The
 * one exception is `games`, which the calendar is built from: franchise.ts
 * validates that itself and refuses the save, because a schedule of the wrong
 * length is a standings table nobody can finish.
 */
export function cleanRules(raw: unknown): Rules {
  const r = (raw ?? {}) as Partial<Record<keyof Rules, unknown>>;
  const num = (v: unknown, lo: number, hi: number, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;
  const oneOf = <K extends keyof Rules>(
    v: unknown,
    among: readonly Choice<K>[],
    fallback: number,
  ): number => (among.some((c) => c.value === v) ? (v as number) : fallback);

  return {
    games: num(r.games, 2, MAX_GAMES, DEFAULT_GAMES),
    parity: num(r.parity, 0, 1, DEFAULT_RULES.parity),
    streak: num(r.streak, 0, 0.5, DEFAULT_RULES.streak),
    offence: num(r.offence, 0.7, 1.4, DEFAULT_RULES.offence),
    // ⚠️ THESE TWO ARE PICKED FROM A LIST, NOT CLAMPED TO A RANGE. The bracket
    // has to be a power of two or a round cannot halve, and a series has to be
    // odd or it can end level — neither is a property a clamp can enforce, and
    // a league with a six-club bracket would hang the round arithmetic rather
    // than play slightly wrong.
    bracket: oneOf(r.bracket, BRACKET, DEFAULT_RULES.bracket),
    series: oneOf(r.series, SERIES, DEFAULT_RULES.series),
  };
}

/** How many rounds a bracket of this size takes. 2 → 1, 4 → 2, 8 → 3. */
export const roundsIn = (bracket: number): number => Math.max(1, Math.round(Math.log2(bracket)));

/** How many games it takes to win a round of this length. */
export const winsNeeded = (series: number): number => Math.floor(series / 2) + 1;
