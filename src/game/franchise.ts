/**
 * FRANCHISE. One season: a schedule you chose the length of, a four-club
 * playoff, and a champion. The rest of the league plays its own games headlessly
 * the same day you play yours, so the standings you are shown already have that
 * afternoon in them — fourteen other games a day at thirty clubs, and none of
 * them wait.
 *
 * ⚠️ THE SEASON'S LENGTH IS ON THE SEASON, NOT IN THIS FILE. `Season.games` is
 * picked on the title screen and never moves again, and every calendar figure
 * — the last day of the schedule, the semifinal, the final, the end — is
 * derived from it by the four functions below. There is no module-level
 * REGULAR_DAYS any more, deliberately: a constant read at import time is a
 * second answer to a question the save already answers, and the two disagree
 * the moment a fourteen-game save is loaded next to a hundred-and-sixty-two.
 *
 * ⚠️ ONE YEAR, DELIBERATELY. There is no offseason and no year two. The season
 * ends when somebody wins the final, and the only way on from there is a new
 * franchise from the start screen. A second year is not a bigger number in a
 * field — it is an offseason, which is a whole mode of its own.
 *
 * ⚠️ THE SEASON OWNS ITS ROSTERS — all thirty. `Season.rosters` is seeded from LEAGUE at
 * kickoff and read through teamOf() everywhere after that; nothing in a
 * running season reads LEAGUE again. Two things follow, and the second is the
 * point:
 *
 *   1. teams.ts says EDIT HERE FIRST, and now you can — re-cast a club
 *      mid-season and the season in progress keeps the nine it started with,
 *      rather than silently swapping a hitter out from under the standings.
 *   2. It is the seam every roster feature needs. A trade moves a Player
 *      between two entries in `rosters`. Development edits a stat in place.
 *      An injury pulls a man out of a lineup. None of them exist yet, and none
 *      of them will need anything from this file except a new Season.
 *
 *   ponytail: rosters are stored WHOLE, every club, not as a diff against
 *   LEAGUE. Seventy kilobytes of JSON against a five-megabyte budget, and a
 *   diff layer is a migration problem the moment a club changes shape. Store
 *   the diff when the blob is actually a cost, which it is not.
 *
 * WHY RESULTS AND NOT RECORDS: the save holds the games played and standings()
 * folds them on demand. A stored W-L can disagree with the games that produced
 * it; a fold cannot.
 */

import { simulateGame } from './sim.ts';
import { inForm } from './form.ts';
import { LEAGUE, club, leagueUnder, type Team } from './teams.ts';
import {
  DEFAULT_GAMES,
  DEFAULT_RULES,
  MAX_GAMES,
  bracketFor,
  cleanRules,
  roundsIn,
  winsNeeded,
  type Rules,
} from './rules.ts';
import { clubValue } from './value.ts';
import {
  pickStarter,
  recordStart,
  recordRelief,
  restedStamina,
  freshness,
  penFreshness,
  penLegs,
  type RestLog,
} from './rotation.ts';
import { reliefWork } from './bullpen.ts';
import { boxScore } from './game.ts';
import { EMPTY_BOOK, merge, type StatBook } from './stats.ts';
import type { Pitcher } from '../core/pitcher.ts';

export interface Matchup {
  /** Three-letter abbrs, per teams.ts. */
  home: string;
  away: string;
}

/** One relief outing: who, and how many pitches. */
export interface ArmWork {
  n: string;
  p: number;
}

export interface Result extends Matchup {
  /**
   * Which day it was played. Carried because the playoff rounds are days too,
   * and standings() has to be able to leave them out of the record.
   */
  day: number;
  /** Home runs scored, away runs scored. */
  hr: number;
  ar: number;
  /** Home hits, away hits. Optional — a save from before these existed loads. */
  hh?: number;
  ah?: number;
  /**
   * WHO CAME OUT OF EACH PEN AND HOW MUCH HE THREW — home and away.
   *
   * The starter is not in here; he is `hs`/`as`. A relief outing costs rest in
   * proportion to the work, so the pitch count has to travel with the name —
   * see reliefCost() in rotation.ts.
   */
  hb?: readonly ArmWork[];
  ab?: readonly ArmWork[];
  /**
   * WHO STARTED, by name, home and away.
   *
   * ⚠️ THE REST LEDGER IS BUILT FROM THESE. `Season.rest` is a fold over the
   * results, exactly the way the standings are — see the header's note on
   * storing results rather than records. A stored "days rest" figure can
   * disagree with the games that produced it; a fold cannot.
   *
   * Optional because a result handed in by a caller that does not care about
   * the rotation is still a result. Such a game simply rests nobody.
   */
  hs?: string;
  as?: string;
}

/**
 * ONE LINE OF LEAGUE NEWS. The foundation the roster features land on.
 *
 * ⚠️ WHAT THIS IS FOR, because it looks like flavour and is not. Season.rosters
 * has always been the seam a trade, an injury or a development step writes
 * THROUGH — the header says so. What was missing was the other half: a roster
 * move nobody is told about did not happen. A club that quietly got better in
 * March is indistinguishable from the schedule being kind.
 *
 * So every league update gets a line here, and the pre-game screen reads them
 * back. What writes to it today is the day's results and the season's
 * milestones. What writes to it next is whatever changes a roster — and that
 * feature needs to add a `kind` and a call to note(), nothing else.
 */
export interface NewsItem {
  day: number;
  /**
   * What sort of thing happened. 'game' and 'season' are what exists; the
   * roster kinds are named now so the pre-game screen can style them the day
   * they start firing, rather than being edited in the same change.
   */
  kind: 'game' | 'season' | 'roster';
  text: string;
}

export interface Season {
  /** Your club's abbr. */
  you: string;
  /** Which day is NEXT. Runs past the schedule into the bracket; see below. */
  day: number;
  /**
   * HOW LONG THE REGULAR SEASON IS. Chosen once, on the title screen, and
   * fixed for the year — see LENGTHS.
   *
   * Optional so a save written before the picker existed still loads, and it
   * loads as what it actually was: DEFAULT_GAMES. Read it through
   * regularDays(), never directly, so the fallback lives in one place.
   */
  games?: number;
  /**
   * EVERYTHING THIS FRANCHISE DECIDED BEFORE IT PLAYED — see rules.ts. Length,
   * parity, streakiness, run environment, and the shape of the bracket.
   *
   * ⚠️ `games` ABOVE IS THE SAME NUMBER AND IT IS KEPT ON PURPOSE. It shipped
   * one change earlier, so saves exist that have it and no `rules`; regularDays()
   * reads rules first and falls back to it. newSeason() writes both and keeps
   * them equal — rulesOf() is the only thing that should ever read `rules`
   * directly, so there is one place the two can be reconciled.
   *
   * Optional, like everything else added after the fact: a season saved before
   * rules existed plays under DEFAULT_RULES, which is what it was playing under.
   */
  rules?: Rules;
  /** Seeds every headless game, so a reloaded season plays out identically. */
  seed: number;
  /** Every club as this season has them, by abbr. See the header. */
  rosters: Readonly<Record<string, Team>>;
  results: readonly Result[];
  /**
   * The wire, newest last. Optional so a save written before it existed still
   * loads — an empty feed is a season with nothing to report, not a bad file.
   */
  news?: readonly NewsItem[];
  /**
   * WHEN EACH ARM IN THE LEAGUE LAST WORKED, STARTER AND RELIEVER. See
   * rotation.ts.
   *
   * ⚠️ IT IS STORED RATHER THAN FOLDED, and that is a deliberate exception to
   * this file's own rule. Folding it out of `results` would work and would be
   * purer — but the rest ledger is read once per club per day by playDay() to
   * pick thirty starters, and re-folding the whole season on every one of those
   * is a quadratic walk to answer a question one number already answers.
   * `Result.hs`/`as` are still written, so the fold remains possible and the
   * stored map can always be rebuilt if it is ever doubted.
   */
  rest?: RestLog;
  /**
   * Which days you have already been asked a question on. See moments.ts.
   *
   * ⚠️ THIS IS WHY A MOMENT FIRES ONCE, and it is a real field rather than a
   * lookup into `news` on purpose. The wire is display text — this file says
   * so, and deliberately does not validate it line by line — so hanging a
   * roster mutation off it would let a hand-edited save collect a second free
   * trade. Optional, like `news`, so a season saved before moments existed
   * loads as one that has not been asked anything yet.
   */
  decided?: readonly number[];
  /**
   * WHICH SCENARIOS HAVE ALREADY ASKED. See moments.ts.
   *
   * ⚠️ THIS IS THE GATE AND `decided` IS NOT, ANY MORE. `decided` holds the
   * DAYS you were asked on, which was gate enough while moments were two fixed
   * days — a day cannot come round twice. A scenario fires on a CONDITION, and
   * a condition stays true: a man in a slump is still in a slump tomorrow, so
   * without a record of which questions have been asked the same one arrives
   * every morning until the average moves.
   *
   * Both are kept. `decided` still stops a second question on a day you have
   * already answered, and it is what a season saved before scenarios existed
   * carries — such a save simply has no `seen`, and its two scheduled moments
   * are gated by their days exactly as they were.
   *
   * Validated on load like `decided`, and for the same reason: it reaches the
   * engine, so a garbled entry must cost at most the scenario it names.
   */
  seen?: readonly string[];
  /**
   * EVERY LINE IN THE LEAGUE, running. See stats.ts.
   *
   * ⚠️ A STOCK RATHER THAN A FOLD, and this is the second deliberate exception
   * to this file's own rule — the first is `rest`, for the same reason. There
   * is nothing to fold it OUT of: a Result carries the score and the arms that
   * worked, not the at-bats, so the moment a game is over the detail that
   * produced the line is gone. Storing every game's box score instead would be
   * two hundred books for a season, and folding them on every render of the
   * stats screen, to answer a question one running map already answers.
   *
   * Optional, like `news` — a season saved before it existed loads as one that
   * has not written anything down yet, and starts keeping score from the next
   * game it plays.
   */
  stats?: StatBook;
}

// ⚠️ DEFAULT_GAMES, MAX_GAMES and LENGTHS MOVED TO rules.ts and are re-exported
// here. They were declared in this file when season length was the only
// setting; they are now three of six, and a file that owns one of a set owns
// the odd one out. Re-exported rather than relocated silently because every
// screen and script that already imports them from here should keep working —
// there is nothing to gain from making callers chase the move.
export { DEFAULT_GAMES, MAX_GAMES, LENGTHS, DEFAULT_RULES, type Rules } from './rules.ts';

/**
 * THE SCHEDULE, one array per day, for a season of any length.
 *
 * A round-robin by the circle method: fix one club, rotate the rest, pair the
 * ends. Every club is paired every round, so nobody is ever idle.
 *
 * ⚠️ HOME AND AWAY, BACK TO BACK — day 2r is a round and day 2r+1 is that same
 * round with the venues swapped. That is a two-game series, which is what
 * baseball looks like, and it is also what makes ONE builder serve fourteen
 * games and a hundred and sixty-two. The old version cut the rotation at seven
 * rounds and appended all seven mirrors at the end; generalised to a hundred
 * and sixty-two that would have made the entire second half of the year a
 * replay of the first with the venues flipped. Pairing them as they are dealt
 * costs nothing and slices cleanly at any even length.
 *
 * ⚠️ THE ROTATION WRAPS. At thirty clubs it has a period of twenty-nine, so a
 * season longer than fifty-eight games simply comes round again — which is
 * right: that is how a club ends up facing a division rival six times and
 * somebody across the league four.
 *
 * ⚠️ THE CLUBS ARE AN ARGUMENT, NOT `LEAGUE`, AND THAT IS A FIX. This read the
 * module-level league, so a season's fixtures were laid out from whatever
 * league was loaded WHEN THE SCHEDULE WAS ASKED FOR rather than from the clubs
 * the season actually contains. Import a league and resume a franchise and it
 * would deal a card of teams that were not in it, against results that named
 * teams it no longer had. The season already owns its rosters — this is the
 * last place that was still going around them.
 *
 * ⚠️ AN EVEN NUMBER OF CLUBS IS REQUIRED, and checkLeague() is what requires
 * it. The pairing below walks `i` up to `n/2` and pairs it with `n-1-i`; on an
 * odd count the middle index meets itself and a club is scheduled against
 * nobody. The thirty that ship are even, so nothing here changed.
 */
const CACHE = new Map<string, readonly (readonly Matchup[])[]>();

export function schedule(
  games: number,
  abbrs: readonly string[],
): readonly (readonly Matchup[])[] {
  // Keyed by the clubs as well as the length: two leagues of the same size are
  // two different schedules, and a cache that could not tell them apart would
  // hand one season the other's fixtures.
  const key = `${games}|${abbrs.join(',')}`;
  const hit = CACHE.get(key);
  if (hit) return hit;
  const n = abbrs.length;
  const rot = abbrs.slice(1);
  const days: Matchup[][] = [];

  for (let r = 0; days.length < games; r++) {
    const order = [abbrs[0]!, ...rot];
    const home: Matchup[] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = order[i]!;
      const b = order[n - 1 - i]!;
      // Alternate the host by round and by slot, or the fixed club hosts every
      // single opener and travels every single return.
      home.push(r % 2 === i % 2 ? { home: a, away: b } : { home: b, away: a });
    }
    days.push(home);
    if (days.length < games) days.push(home.map((g) => ({ home: g.away, away: g.home })));
    rot.unshift(rot.pop()!);
  }

  const out: readonly (readonly Matchup[])[] = days.slice(0, games);
  CACHE.set(key, out);
  return out;
}

/**
 * THE CLUBS THIS SEASON IS PLAYED BETWEEN, in the order it was built with.
 *
 * ⚠️ NOT SORTED, AND NOT `LEAGUE`. The schedule is dealt off this order, so
 * sorting it here would deal a different card than the one a franchise already
 * in progress has been playing. Insertion order survives JSON round-tripping
 * for keys that are not integer-like — three-letter abbreviations never are —
 * so a save reopens on the fixtures it was saved on.
 */
export const clubsIn = (s: Season): readonly string[] => Object.keys(s.rosters);

/**
 * THE CALENDAR IS ONE CURSOR. `day` indexes the schedule through the regular
 * season and then keeps counting into the bracket, so there is no phase enum to
 * keep in step with it and no second piece of state that can disagree about
 * where the season has got to.
 */
/** The rules this season is playing under. See rules.ts. */
export const rulesOf = (s: Season): Rules => s.rules ?? { ...DEFAULT_RULES, games: regularDays(s) };

export const regularDays = (s: Season): number => s.rules?.games ?? s.games ?? DEFAULT_GAMES;

/**
 * THE BRACKET, AS DAYS.
 *
 * ⚠️ A ROUND OWNS A FIXED BLOCK OF DAYS WHETHER IT NEEDS THEM OR NOT. A
 * best-of-seven that ends in five leaves two empty days on the calendar rather
 * than shifting everything after it forward. That is deliberate: the day cursor
 * is the only piece of state saying where the season has got to (see the header
 * on gamesOn), and a round whose length depended on how it went would make
 * "which day is the final" a question you can only answer by replaying the
 * whole bracket. An empty day costs a card with no games on it, which gamesOn()
 * already returns for a dozen other reasons.
 */
export const roundsOf = (s: Season): number => roundsIn(rulesOf(s).bracket);
export const seriesOf = (s: Season): number => rulesOf(s).series;
export const playoffDays = (s: Season): number => roundsOf(s) * seriesOf(s);
export const seasonEnd = (s: Season): number => regularDays(s) + playoffDays(s);

/** Which round a day belongs to, 0-based. Negative during the schedule. */
export const roundOn = (s: Season, day: number = s.day): number =>
  Math.floor((day - regularDays(s)) / seriesOf(s));

/** Which game of its round a day is, 0-based. */
export const gameInRound = (s: Season, day: number = s.day): number =>
  (day - regularDays(s)) % seriesOf(s);

/**
 * The day the last round starts. Kept because "is the season over" and "who is
 * the champion" both want the final round and neither wants the arithmetic.
 */
export const finalRound = (s: Season): number => roundsOf(s) - 1;

export const newSeason = (
  you: string,
  seed: number,
  games: number = DEFAULT_GAMES,
  rules: Rules = DEFAULT_RULES,
): Season => {
  // ⚠️ THE BRACKET IS PINNED TO THE LEAGUE HERE, ONCE. An imported league can
  // be as small as two clubs, and `bracket` is read both by roundsIn() to lay
  // out the calendar and by seeds() to lay out the pairings — so it has to be a
  // number those two can agree on for the whole year, decided against the clubs
  // this season is actually being built from. See bracketFor().
  const r: Rules = { ...rules, games, bracket: bracketFor(rules.bracket, LEAGUE.length) };
  return {
    you,
    day: 0,
    seed,
    games,
    rules: r,
    // ⚠️ THE SEASON'S ROSTERS ARE BUILT UNDER ITS OWN RULES, and this is the
    // one place that happens. parity and offence are roster transformations —
    // see leagueUnder() in teams.ts — so applying them here means every read
    // through teamOf() gets the league this franchise actually plays in, and
    // nothing downstream needs to know a setting existed.
    rosters: Object.fromEntries(leagueUnder(r.parity, r.offence).map((t) => [t.abbr, t])),
    results: [],
    news: [],
    decided: [],
    rest: {},
  };
};

/** The relief outings from one side of a finished game, ready for a Result. */
export const workOf = (staff: Parameters<typeof reliefWork>[0]): ArmWork[] =>
  reliefWork(staff).map((a) => ({ n: a.pitcher.name, p: a.pitches }));

/**
 * WHO THE COMPUTER WOULD START FOR THIS CLUB TODAY, and on what legs.
 *
 * Exported because the pre-game screen has to name the opposing starter before
 * the game exists, and it must be the SAME man the game then sends out. Two
 * calls, one answer — pickStarter() is pure and reads only the season.
 */
export interface StarterFor {
  index: number;
  name: string;
  /** His legs today, rest already folded in. Goes straight to newGame(). */
  stamina: number;
  /** ...and every reliever's, by name. Goes to newGame() with him. */
  penLegs: Readonly<Record<string, number>>;
}

/** A NAMED arm of this club, on the legs today's rest leaves him. */
export function armFor(s: Season, abbr: string, index: number, day: number = s.day): StarterFor {
  const t = teamOf(s, abbr);
  const at = index >= 0 && index < t.rotation.length ? index : 0;
  const arm = t.rotation[at]!;
  return {
    index: at,
    name: arm.name,
    stamina: restedStamina(arm, freshness(s.rest ?? {}, abbr, arm.name, day)),
    penLegs: penLegs(t.bullpen, s.rest ?? {}, abbr, day),
  };
}

export const starterFor = (s: Season, abbr: string, day: number = s.day): StarterFor =>
  armFor(s, abbr, pickStarter(teamOf(s, abbr), s.rest ?? {}, day), day);

/** How rested one club's arm is today, 0..1. For the starter picker's rows. */
export const restOf = (s: Season, abbr: string, arm: string, day: number = s.day): number =>
  freshness(s.rest ?? {}, abbr, arm, day);

/** ...and how rested one RELIEVER is, on the pen's slower clock. */
export const penRestOf = (s: Season, abbr: string, arm: string, day: number = s.day): number =>
  penFreshness(s.rest ?? {}, abbr, arm, day);

/** An arm on a club's staff, by name — for charging relief work. */
const armNamed = (s: Season, abbr: string, name: string): Pitcher | undefined =>
  teamOf(s, abbr).bullpen.find((a) => a.name === name) ??
  teamOf(s, abbr).rotation.find((a) => a.name === name);

/** A club as THIS season has it. Falls back to config if one has gone missing. */
export const teamOf = (s: Season, abbr: string): Team => s.rosters[abbr] ?? club(abbr);

export const seasonOver = (s: Season): boolean => s.day >= seasonEnd(s);

const winnerOf = (r: Result): string => (r.hr > r.ar ? r.home : r.away);

/** What was played on a given day. */
export const resultsOn = (s: Season, day: number): Result[] =>
  s.results.filter((r) => r.day === day);

/** The top four, best first. Seeding and the bracket both come from here. */
export const seeds = (s: Season): string[] =>
  standings(s).slice(0, rulesOf(s).bracket).map((r) => r.abbr);

/**
 * PAIR A ROUND OFF: best against worst, second against second-worst.
 *
 * The list is always in seed order — survivors() keeps it that way — so this is
 * the whole of what a bracket is. Eight clubs give 1-8, 2-7, 3-6, 4-5; the four
 * winners come back in seed order and give 1-4, 2-3.
 */
const pairUp = (alive: readonly string[]): Matchup[] => {
  const out: Matchup[] = [];
  for (let i = 0; i < alive.length / 2; i++) {
    out.push({ home: alive[i]!, away: alive[alive.length - 1 - i]! });
  }
  return out;
};

/** Every day a given round occupies. */
const daysOfRound = (s: Season, round: number): number[] => {
  const first = regularDays(s) + round * seriesOf(s);
  return Array.from({ length: seriesOf(s) }, (_, i) => first + i);
};

/**
 * Who won a series, or null if it is still going.
 *
 * ⚠️ COUNTED OFF THE RESULTS, NOT TRACKED IN A COUNTER. franchise.ts's header
 * says the save holds the games and everything else is a fold — a stored series
 * score can disagree with the games that produced it, a fold cannot. This is
 * the `wins` counter the old single-elimination note said a series would grow,
 * and it turns out not to need storing at all.
 */
function seriesScore(s: Season, round: number, m: Matchup): { home: number; away: number } {
  let home = 0;
  let away = 0;
  for (const day of daysOfRound(s, round)) {
    for (const r of resultsOn(s, day)) {
      // A series is one pairing, whichever way round the venue was that night —
      // the host alternates, so half these results have the sides swapped.
      const inIt =
        (r.home === m.home && r.away === m.away) || (r.home === m.away && r.away === m.home);
      if (!inIt) continue;
      if (winnerOf(r) === m.home) home++;
      else away++;
    }
  }
  return { home, away };
}

function seriesWinner(s: Season, round: number, m: Matchup): string | null {
  const need = winsNeeded(seriesOf(s));
  const { home, away } = seriesScore(s, round, m);
  if (home >= need) return m.home;
  if (away >= need) return m.away;
  return null;
}

/** One pairing of a round, with where the series stands. For the screens. */
export interface SeriesLine extends Matchup {
  /** Wins for the higher seed, and for the lower. */
  homeWins: number;
  awayWins: number;
  winner: string | null;
}

/** Every pairing of a round, or [] if the bracket has not reached it. */
export function matchupsInRound(s: Season, round: number): SeriesLine[] {
  if (s.day < regularDays(s)) return [];
  const alive = survivors(s, round);
  if (alive.length < 2) return [];
  return pairUp(alive).map((m) => {
    const { home, away } = seriesScore(s, round, m);
    return { ...m, homeWins: home, awayWins: away, winner: seriesWinner(s, round, m) };
  });
}

/**
 * The clubs still alive going INTO a round, in seed order, or [] if the bracket
 * has not got that far.
 */
function survivors(s: Season, round: number): string[] {
  const order = seeds(s);
  let alive = order;
  for (let r = 0; r < round; r++) {
    const won = pairUp(alive).map((m) => seriesWinner(s, r, m));
    if (won.some((w) => w === null)) return [];
    // ⚠️ BACK INTO SEED ORDER, not into the order the games were appended in.
    // pairUp() reads "best against worst" straight off the list it is handed,
    // so a list in finishing order would re-pair the next round wrongly the
    // moment an underdog won.
    alive = (won as string[]).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }
  return alive;
}

/**
 * The card for a day — the schedule during the regular season, the bracket
 * after it.
 *
 * ⚠️ A SERIES THAT IS ALREADY DECIDED PLAYS NOTHING. Sweep a best-of-seven in
 * four and days five, six and seven come back empty, exactly the way a real
 * postseason does not play them. That is what makes the fixed block of days
 * per round in playoffDays() honest rather than a fiction.
 *
 * ⚠️ THE HOST ALTERNATES, HIGHER SEED FIRST. So a best-of-seven gives the
 * better club games one, three, five and seven at home — four of the seven, and
 * the decider. Not the real 2-3-2, which exists for travel reasons this league
 * does not have; what it has to get right is that the seed is worth something,
 * and the majority plus the last game is that.
 */
export function gamesOn(s: Season, day: number = s.day): readonly Matchup[] {
  if (day < regularDays(s)) return schedule(regularDays(s), clubsIn(s))[day] ?? [];

  // ⚠️ THERE IS NO BRACKET UNTIL THE SCHEDULE IS PLAYED OUT. seeds() will
  // happily hand back a top four of a table that is all zeroes — sorted on the
  // abbr tiebreak — so asking this about a playoff day mid-season used to get a
  // confident, alphabetical, completely fictional semifinal.
  //
  // It was invisible while the only caller asked about TODAY: you cannot be on
  // day fifteen without having played fourteen. The calendar asks about days
  // that have not happened, and it drew "SEMIFINAL — vs CHF" beside game one.
  // Guarded here rather than there, because every future caller that looks
  // forward has the same question and deserves the same answer.
  if (s.day < regularDays(s)) return [];

  const round = roundOn(s, day);
  if (round < 0 || round >= roundsOf(s)) return [];

  const alive = survivors(s, round);
  if (alive.length < 2) return [];

  const nth = gameInRound(s, day);
  return pairUp(alive).flatMap((m) => {
    if (seriesWinner(s, round, m)) return [];
    return [nth % 2 === 0 ? m : { home: m.away, away: m.home }];
  });
}

/**
 * IS THIS CLUB STILL ALIVE IN THE BRACKET?
 *
 * ⚠️ THE FURTHEST ROUND ANYBODY HAS FINISHED, not the round today belongs to.
 * A series can end early, so the day cursor and the state of the bracket are
 * not the same question — sweep in four and the bracket has moved on while the
 * calendar has three empty days left in the round. Walking back from the last
 * round to the first finds the newest answer that exists.
 *
 * Everyone is alive during the regular season, including the clubs that are
 * about to miss out: the bracket does not exist yet. See gamesOn().
 */
export function stillIn(s: Season, abbr: string): boolean {
  if (s.day < regularDays(s)) return true;
  for (let r = roundsOf(s); r >= 0; r--) {
    const alive = survivors(s, r);
    if (alive.length) return alive.includes(abbr);
  }
  return false;
}

/** Today's matchup involving you, or null — you are out, or the year is done. */
export const yourGame = (s: Season): Matchup | null =>
  gamesOn(s).find((g) => g.home === s.you || g.away === s.you) ?? null;

/** Who won it all, or null until somebody has. */
export function champion(s: Season): string | null {
  const last = finalRound(s);
  const two = survivors(s, last);
  if (two.length < 2) return null;
  return seriesWinner(s, last, pairUp(two)[0]!);
}

/**
 * WHAT A ROUND IS CALLED. Named from the end backwards — the last one is always
 * the CHAMPIONSHIP whether the bracket has one round or three, and the one
 * before it is always the SEMIFINAL. A bracket of two is a championship and
 * nothing else, which is why counting forwards ("round 1") would print
 * "ROUND 1 OF 1" for a one-game final.
 */
export function roundName(s: Season, round: number): string {
  const left = roundsOf(s) - round;
  if (left <= 1) return 'CHAMPIONSHIP';
  if (left === 2) return 'SEMIFINAL';
  // Everything earlier is named for how many clubs are still in it.
  return `ROUND OF ${2 ** left}`;
}

/** What to call a day on a screen. Defaults to the day the season is on. */
export function dayLabel(s: Season, day: number = s.day): string {
  const n = regularDays(s);
  if (day < n) return `GAME ${day + 1} OF ${n}`;
  if (day >= seasonEnd(s)) return 'SEASON OVER';
  const name = roundName(s, roundOn(s, day));
  // A one-game round is just its name; a series says which night it is.
  return seriesOf(s) === 1 ? name : `${name} — GAME ${gameInRound(s, day) + 1}`;
}

/**
 * Close out the day: your final goes in as given, everything else on the card
 * is simulated, and the calendar turns over.
 *
 * `yours` is OPTIONAL, and it now means TWO things — the second is what makes a
 * hundred-and-sixty-two-game year playable at all:
 *
 *   1. You are OUT. Miss the bracket, or lose the semifinal, and the rest of
 *      the playoffs is a day you watch rather than a day you play. There is no
 *      game of yours on the card to hand in.
 *   2. You are SIMMING PAST IT. The calendar lets you jump forward to a date,
 *      and the games in between have to be played by somebody.
 *
 * ⚠️ SO A DAY WITH NO `yours` SIMULATES THE WHOLE CARD, YOUR GAME INCLUDED.
 * It used to filter your club out unconditionally, which was invisible while
 * the only caller that omitted `yours` was the eliminated case — you had no
 * game that day, so the filter removed nothing. The moment anything skips a
 * day you were ON the card, that filter is a club quietly playing a shorter
 * schedule than the other twenty-nine and sitting above them in the table.
 *
 *
 * The seed is derived from the season seed and the day, NOT carried forward,
 * so re-simulating a day gives the same finals — a reloaded save is the same
 * season, not a fresh roll of everyone else's schedule.
 *
 * `book` is YOUR game's box score — the one game on the card this function did
 * not play, and so cannot read off a GameState of its own. It rides BESIDE
 * `yours` rather than on it because a Result is what gets stored, and keeping
 * fourteen whole box scores of games the player already watched is weight in
 * the save to answer a question `Season.stats` already answers.
 */
export function playDay(s: Season, yours?: Result, book?: StatBook): Season {
  const others = yours
    ? gamesOn(s).filter((g) => g.home !== s.you && g.away !== s.you)
    : gamesOn(s);
  // Every game played today, yours first — folded into the league's book at the
  // bottom. Collected on the way past rather than returned, because a Result is
  // the wrong shape to carry one and the sims are the only place they exist.
  const books: StatBook[] = book ? [book] : [];
  const simmed = others.map((g, i): Result => {
    // ⚠️ EVERY CLUB IN THE LEAGUE TURNS ITS ROTATION OVER, not just yours. A
    // rest rule that only applied to the club you run would mean the other
    // twenty-nine still ran one arm out there all year, and the seven clubs on
    // your schedule would still show you the same seven starters twice each —
    // which was the actual complaint. See rotation.ts.
    const hp = starterFor(s, g.home);
    const ap = starterFor(s, g.away);
    // ⚠️ BOTH SIDES GO OUT IN TODAY'S FORM. See form.ts — the club that plays
    // is the roster with this week's hot and cold folded in, and it has to be
    // applied HERE, where the season's seed and day are known, rather than
    // inside simulateGame() which only ever sees a per-game seed. main.ts does
    // the same to the two clubs it hands kickOff().
    const { game } = simulateGame(
      s.seed + s.day * 101 + i,
      9,
      inForm(teamOf(s, g.home), s.seed, s.day, rulesOf(s).streak),
      inForm(teamOf(s, g.away), s.seed, s.day, rulesOf(s).streak),
      {
        home: { index: hp.index, stamina: hp.stamina, penLegs: hp.penLegs },
        away: { index: ap.index, stamina: ap.stamina, penLegs: ap.penLegs },
      },
    );
    books.push(boxScore(game));
    return {
      ...g,
      day: s.day,
      hr: game.homeState.runs,
      ar: game.awayState.runs,
      hh: game.homeState.hits,
      ah: game.awayState.hits,
      hs: hp.name,
      as: ap.name,
      hb: workOf(game.homeState.staff),
      ab: workOf(game.awayState.staff),
    };
  });

  const played = [...(yours ? [yours] : []), ...simmed];

  // Every start on the card goes in the ledger, yours included — main.ts puts
  // the two names on the Result it hands in.
  let rest: RestLog = s.rest ?? {};
  for (const r of played) {
    if (r.hs) rest = recordStart(rest, r.home, r.hs, r.day);
    if (r.as) rest = recordStart(rest, r.away, r.as, r.day);
    // ...and every arm that came out of either pen, charged for the work.
    for (const [abbr, work] of [[r.home, r.hb], [r.away, r.ab]] as const) {
      for (const w of work ?? []) {
        const arm = armNamed(s, abbr, w.n);
        if (arm) rest = recordRelief(rest, abbr, arm, w.p, r.day);
      }
    }
  }

  const next: Season = {
    ...s,
    day: s.day + 1,
    results: [...s.results, ...played],
    rest,
    stats: books.reduce(merge, s.stats ?? EMPTY_BOOK),
  };

  // ⚠️ THE WIRE IS WRITTEN AGAINST THE NEW SEASON, NOT THE OLD ONE. The
  // headlines that matter are the ones about the table AFTER today — "they take
  // over first" is a statement about the standings the player is about to be
  // shown, and reading it off the season we were handed would report
  // yesterday's leader as today's news.
  //
  // ⚠️ THE ROSTER HOOK GOES HERE, between the games and the headlines: a
  // trade deadline, a development step, an injury roll. Each one returns a new
  // `rosters` and calls note() to say what it did. Nothing else in this file
  // has to change for it, which is the whole reason the wire exists before any
  // of them do.
  return { ...next, news: [...(s.news ?? []), ...headlines(s, next, played)] };
}

/**
 * FAST-FORWARD TO A DAY, playing everything on the way headlessly — yours
 * included, which is what the note on playDay's `yours` is about.
 *
 * This is the engine half of the calendar. A hundred-and-sixty-two-game year is
 * only playable because you do not have to play all of it, and "skip to here"
 * is the whole of what that means.
 *
 * ⚠️ `stop` IS HOW A MOMENT SURVIVES A SKIP. moments.ts fires on two fixed days
 * of the schedule and asks you a question that changes a roster; a jump from
 * day two to day ninety would sail straight past both and quietly cost you the
 * only two decisions in the mode. The caller passes momentOn — this file cannot
 * import it, because moments.ts imports this one — and the jump halts on the
 * day it would have fired, with the day NOT yet played, so the normal flow
 * asks the question and then plays it.
 *
 * Returns `s` untouched if the target is behind you. There is no rewinding a
 * season, and a target in the past is a stale button, not an error.
 */
export function simTo(s: Season, target: number, stop?: (s: Season) => boolean): Season {
  while (s.day < target && !seasonOver(s) && !stop?.(s)) s = playDay(s);
  return s;
}

/** The margin at which a result stops being a result and becomes a story. */
export const BLOWOUT = 7;

/**
 * ...and the margin at which YOUR club's result becomes one. Lower, because
 * you played it. See headlines() — a stranger needs a rout, you need an
 * afternoon worth reading about.
 */
export const YOUR_STORY = 4;

/**
 * What was worth saying about today.
 *
 * ponytail: at most three lines a day — one story game, one table note, one
 * milestone. A wire that reported all four games every day is a scrolling list
 * of scores the standings table already shows better, and the player stops
 * reading it, which costs the roster news its only audience.
 */
function headlines(before: Season, after: Season, played: readonly Result[]): NewsItem[] {
  const day = before.day;
  const out: NewsItem[] = [];
  const note = (kind: NewsItem['kind'], text: string): void => {
    out.push({ day, kind, text });
  };

  // 1. The one game anybody would mention. A shutout outranks a blowout — it is
  //    rarer, and it is about a pitcher, which is the half of the league the
  //    standings table says least about.
  //
  // ⚠️ YOUR CLUB GETS THE SLOT FIRST, AND AT A LOWER BAR. Without both halves
  // of that the wire was a humiliation feed: it picked one game out of fifteen
  // with no preference at all, so your club appeared only by accident, and the
  // only accidents that qualified were the days somebody hung a touchdown on
  // you. Measured over a full season 2026-08-28 — Albany's three mentions were
  // "MIN rout ALB", "MIN shut out ALB", "FLA rout ALB", and the 10-6 win, the
  // eleven-inning loss and the 7-2 finale went unwritten.
  //
  // A stranger's game has to be a rout or a shutout to be news. Yours only has
  // to be a good afternoon, because it is your newspaper.
  const margin = (r: Result): number => Math.abs(r.hr - r.ar);
  const shutout = (r: Result): boolean => Math.min(r.hr, r.ar) === 0;
  const mine = (r: Result): boolean => r.home === after.you || r.away === after.you;
  const story =
    played.find((r) => mine(r) && (shutout(r) || margin(r) >= YOUR_STORY)) ??
    played.find((r) => shutout(r) && Math.max(r.hr, r.ar) >= 3) ??
    played.find((r) => margin(r) >= BLOWOUT);
  if (story) {
    const [w, l, wr, lr] =
      story.hr > story.ar
        ? [story.home, story.away, story.hr, story.ar]
        : [story.away, story.home, story.ar, story.hr];
    note(
      'game',
      lr === 0
        ? `${w} shut out ${l}, ${wr}-0.`
        : margin(story) >= BLOWOUT
          ? `${w} rout ${l}, ${wr}-${lr}.`
          : `${w} beat ${l}, ${wr}-${lr}.`,
    );
  }

  // 2. A change at the top. Regular season only — the bracket is seeded off
  //    that table and standings() deliberately does not fold playoffs in.
  if (day < regularDays(before) && day > 0) {
    const was = standings(before)[0]?.abbr;
    const now = standings(after)[0]?.abbr;
    if (was && now && was !== now) note('season', `${now} take over first place.`);
  }

  // 3. The milestones.
  if (after.day === regularDays(after)) note('season', `Playoffs set: ${seeds(after).join(', ')}.`);

  // ⚠️ THE TITLE FIRES ON THE DAY IT WAS WON, NOT ON A DAY NUMBER. It used to
  // ask "is today the final?", which was answerable while the bracket was two
  // fixed days long. A round is now a series that can end on any of its nights
  // — a sweep leaves the rest of the block empty — so the honest question is
  // whether somebody has just become champion who was not one this morning.
  // That fires exactly once however the series went.
  if (!champion(before)) {
    const champ = champion(after);
    if (champ) note('season', `${champ} are champions.`);
  }

  return out;
}

export interface Standing {
  abbr: string;
  w: number;
  l: number;
  /** Runs for and against, which is the tiebreak. */
  rf: number;
  ra: number;
  /** Hits for. Zero on a season saved before results carried them. */
  hf: number;
  /** Games behind the leader, to one decimal. */
  gb: number;
  /** What this roster is worth. See value.ts — the franchise's whole premise. */
  value: number;
}

/**
 * The table, best first. Ties broken on run differential, then on abbr.
 *
 * ⚠️ REGULAR SEASON ONLY. A club knocked out in the semifinal must not carry
 * that loss into the record the bracket was seeded from — gamesOn() reads the
 * seeding back out of this table every time it is asked, so folding a playoff
 * result in here would let the bracket re-seed itself halfway through.
 */
export function standings(s: Season): Standing[] {
  // ⚠️ THE SEASON'S OWN CLUBS, NOT `LEAGUE`. This built its rows from the
  // module-level league, so a franchise resumed after a league had been
  // imported produced a table of clubs that were not in it and dropped every
  // result that named one that was. The season owns its rosters; the standings
  // are a fold of its results over them.
  const rows = new Map<string, Standing>(
    clubsIn(s).map((abbr) => [
      abbr,
      { abbr, w: 0, l: 0, rf: 0, ra: 0, hf: 0, gb: 0, value: clubValue(teamOf(s, abbr)) },
    ]),
  );
  const n = regularDays(s);
  for (const g of s.results) {
    if (g.day >= n) continue;
    const h = rows.get(g.home);
    const a = rows.get(g.away);
    if (!h || !a) continue; // a result naming a club the league no longer has
    h.rf += g.hr; h.ra += g.ar; h.hf += g.hh ?? 0;
    a.rf += g.ar; a.ra += g.hr; a.hf += g.ah ?? 0;
    // A tie cannot happen — the engine plays extras until somebody leads.
    if (g.hr > g.ar) { h.w++; a.l++; } else { a.w++; h.l++; }
  }
  const table = [...rows.values()].sort(
    (x, y) => y.w - x.w || (y.rf - y.ra) - (x.rf - x.ra) || x.abbr.localeCompare(y.abbr),
  );
  const top = table[0];
  if (top) for (const r of table) r.gb = ((top.w - r.w) + (r.l - top.l)) / 2;
  return table;
}

// ------------------------------------------------------------------ saving

/**
 * Bumped when the shape changes. An old blob is discarded, not migrated.
 *
 * 3: every club grew a three-man `bullpen` alongside its rotation. A version-2
 * blob holds thirty clubs with no pen in them, and a staff with nobody to go to
 * is not a season that can be played out — so it is refused rather than patched.
 *
 * 4: `starts` became `rest` and now holds the whole staff rather than the
 * rotation. A version-3 blob would load with an empty ledger, which is a league
 * whose relievers are all mysteriously whole — quiet and wrong, so it is
 * refused like the rest.
 */
const VERSION = 4;
const KEY = 'asb.season.v1';

export function saveSeason(s: Season): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...s, v: VERSION }));
  } catch {
    // Storage off or full. The season still plays; it just will not resume.
  }
}

export function clearSeason(): void {
  try { localStorage.removeItem(KEY); } catch { /* nothing to clear, then */ }
}

/** A stored club is shaped like a Team, or the whole save is not trusted. */
function looksLikeTeam(t: unknown): t is Team {
  const c = t as Partial<Team> | null;
  return (
    !!c &&
    typeof c.name === 'string' &&
    typeof c.abbr === 'string' &&
    Array.isArray(c.lineup) &&
    c.lineup.length === 9 &&
    Array.isArray(c.rotation) &&
    c.rotation.length > 0 &&
    Array.isArray(c.bullpen) &&
    c.bullpen.length > 0
  );
}

/**
 * The book, with anything that is not a line thrown away.
 *
 * The numbers here never reach the engine — nothing in a simulated game reads
 * a batting average — so a bad entry costs a garbled row rather than a broken
 * season. But they DO reach arithmetic, and one NaN in a stat book poisons
 * every rate on the screen and the qualifying bar every leaderboard is measured
 * against. So a line with a bad number in it is dropped whole.
 */
function cleanBook(raw: unknown): StatBook {
  const src = raw as { bat?: unknown; arm?: unknown } | null;
  if (!src || typeof src !== 'object') return EMPTY_BOOK;
  const sane = <T>(v: unknown): Record<string, T> => {
    const out: Record<string, T> = {};
    if (v && typeof v === 'object') {
      for (const [name, line] of Object.entries(v as Record<string, unknown>)) {
        if (!line || typeof line !== 'object') continue;
        // `tm` is the only column that is not a number; everything else has to
        // be one, or the whole line goes.
        const nums = Object.entries(line as Record<string, unknown>).filter(([k]) => k !== 'tm');
        if (nums.every(([, n]) => typeof n === 'number' && Number.isFinite(n))) out[name] = line as T;
      }
    }
    return out;
  };
  return { bat: sane(src.bat), arm: sane(src.arm) };
}

/**
 * The saved season, or null. Validates rather than trusts — this is a blob a
 * user can hand-edit, and a bad one reaching the engine throws on the title
 * screen and locks them out of a game they can otherwise still play.
 */
export function loadSeason(): Season | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<Season> & { v?: number };
    if (s.v !== VERSION) return null;

    // ⚠️ A SAVE IS CHECKED AGAINST ITS OWN CLUBS, NEVER AGAINST `LEAGUE`, and
    // this is the fix that makes an importable league safe to import. Both
    // checks below used to ask the module-level league: is `you` one of its
    // thirty, and does the save carry a roster for every one of them. So the
    // first custom league anybody loaded silently refused every franchise in
    // progress — different abbreviations, no match, `null`, and the CONTINUE
    // button simply stopped being there with nothing to explain why.
    //
    // The season owns its rosters. That is the whole claim in this file's
    // header, and asking the rosters rather than the league is what makes it
    // true at the one boundary where it was not.
    const rosters = s.rosters;
    if (!rosters || typeof rosters !== 'object' || Array.isArray(rosters)) return null;
    const abbrs = Object.keys(rosters);
    // Two clubs minimum and an even number of them — the same bound
    // checkLeague() holds an imported league to, for the same reason: the
    // schedule pairs slot `i` with slot `n-1-i`, and an odd count pairs the
    // middle club with itself. A save is a blob a user can hand-edit, so the
    // bound is re-checked here rather than assumed from where it came.
    if (abbrs.length < 2 || abbrs.length % 2 !== 0) return null;
    if (abbrs.some((abbr) => !looksLikeTeam(rosters[abbr]))) return null;
    if (typeof s.you !== 'string' || !abbrs.includes(s.you)) return null;
    // ⚠️ THE LENGTH IS READ FIRST, because every other bound below is derived
    // from it. A blob from before the picker has no `games` and is what it
    // always was; anything outside the range the builder is willing to lay down
    // is refused rather than clamped — a season silently shortened under a
    // player mid-year is worse than one that will not resume.
    //
    // ⚠️ THE REST OF THE RULES ARE CLEANED, NOT REFUSED — see cleanRules(). A
    // garbled parity is a season that plays a bit differently; a garbled length
    // is a calendar nobody can finish, which is why this one number is still
    // checked here and thrown out rather than clamped.
    // Clamped against the clubs THIS SAVE has, not against the current league —
    // a franchise saved in a thirty-club world keeps its eight-club bracket
    // even if a four-club league has been imported since.
    const rules = cleanRules(
      { ...(s.rules ?? {}), games: s.rules?.games ?? s.games },
      abbrs.length,
    );
    const games = s.rules?.games ?? s.games ?? DEFAULT_GAMES;
    if (!Number.isInteger(games) || games < 2 || games > MAX_GAMES) return null;
    const end = games + roundsIn(rules.bracket) * rules.series;
    if (typeof s.day !== 'number' || s.day < 0 || s.day > end) return null;
    if (typeof s.seed !== 'number' || !Number.isFinite(s.seed)) return null;
    if (!Array.isArray(s.results)) return null;
    const ok = s.results.every(
      (r) =>
        r && typeof r.home === 'string' && typeof r.away === 'string' &&
        Number.isFinite(r.day) && Number.isFinite(r.hr) && Number.isFinite(r.ar),
    );
    if (!ok) return null;
    // The wire is not validated line by line — it is display text, it cannot
    // reach the engine, and a malformed entry costs a garbled headline rather
    // than a broken season. Anything that is not an array is dropped whole.
    const news = Array.isArray(s.news) ? s.news : [];
    // `decided` DOES reach the engine — it is what stops a moment firing twice
    // — so unlike the wire it is filtered to the finite numbers it claims to
    // be. A garbled entry costs you the moment it names, never a thrown save.
    const decided = Array.isArray(s.decided) ? s.decided.filter(Number.isFinite) : [];
    // ...and the same for the scenario ids, filtered to strings. A garbled one
    // is a scenario that gets to ask a second time, which is the same cost.
    const seen = Array.isArray(s.seen) ? s.seen.filter((x) => typeof x === 'string') : [];
    // The rest ledger reaches the engine — it decides who takes the ball — so
    // it is filtered to the finite day numbers it claims to hold. A garbled
    // entry costs one arm a day of rest, never a thrown save.
    const rest: Record<string, Record<string, { day: number; left: number }>> = {};
    if (s.rest && typeof s.rest === 'object') {
      for (const [abbr, arms] of Object.entries(s.rest)) {
        if (!arms || typeof arms !== 'object') continue;
        const clean: Record<string, { day: number; left: number }> = {};
        for (const [name, r] of Object.entries(arms as Record<string, unknown>)) {
          const e = r as { day?: unknown; left?: unknown } | null;
          if (!e || typeof e !== 'object') continue;
          if (typeof e.day !== 'number' || !Number.isFinite(e.day)) continue;
          if (typeof e.left !== 'number' || !Number.isFinite(e.left)) continue;
          clean[name] = { day: e.day, left: e.left };
        }
        rest[abbr] = clean;
      }
    }
    return {
      you: s.you,
      day: s.day,
      seed: s.seed,
      games,
      rules,
      // Narrowed at the top of this function, where `abbrs` was read off it.
      rosters,
      results: s.results,
      news,
      decided,
      seen,
      rest,
      stats: cleanBook(s.stats),
    };
  } catch {
    return null;
  }
}
