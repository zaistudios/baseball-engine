/**
 * FRANCHISE. One season: a fourteen-game schedule, a four-club playoff, and a
 * champion. The rest of the league plays its own games headlessly the same day
 * you play yours, so the standings you are shown already have that afternoon in
 * them — fourteen other games a day at thirty clubs, and none of them wait.
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
import { LEAGUE, club, type Team } from './teams.ts';
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

/**
 * HOW MANY CLUBS YOU MEET, home and away. Fourteen games, and the number does
 * not move when the league does.
 *
 * ⚠️ THIS IS WHAT KEEPS A THIRTY-CLUB LEAGUE A HALF-HOUR GAME. The circle
 * method below will happily produce a full double round robin, and at thirty
 * clubs that is FIFTY-EIGHT days — a season nobody sitting down after work is
 * going to finish, and twenty-nine of those days are games you watch rather
 * than play. So the rotation is cut after seven rounds and mirrored, which
 * gives you seven opponents twice each instead of twenty-nine once each.
 *
 * ⚠️ YOU DO NOT PLAY EVERYBODY, and that is the trade. Half the league is
 * somebody you only ever meet in the bracket. Playing a club home AND away was
 * the better half of the trade to keep: a fourteen-game schedule of fourteen
 * strangers has no rivalry in it and no chance to take one back.
 */
export const OPPONENTS = 7;

/**
 * A double round-robin by the circle method: fix one club, rotate the rest,
 * pair the ends. Every club is paired every round, so nobody is ever idle; the
 * second half is the first half with the venues swapped.
 */
function buildSchedule(): Matchup[][] {
  const abbrs = LEAGUE.map((t) => t.abbr);
  const n = abbrs.length;
  const rot = abbrs.slice(1);
  const first: Matchup[][] = [];

  for (let r = 0; r < Math.min(OPPONENTS, n - 1); r++) {
    const order = [abbrs[0]!, ...rot];
    const games: Matchup[] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = order[i]!;
      const b = order[n - 1 - i]!;
      // Alternate the host by round and by slot, or the fixed club hosts every
      // round in the first half and travels every round in the second.
      games.push(r % 2 === i % 2 ? { home: a, away: b } : { home: b, away: a });
    }
    first.push(games);
    rot.unshift(rot.pop()!);
  }

  return [...first, ...first.map((d) => d.map((g) => ({ home: g.away, away: g.home })))];
}

/** The regular season, one array per day. Static — the schedule is static. */
export const DAYS: readonly (readonly Matchup[])[] = buildSchedule();

/**
 * THE CALENDAR IS ONE CURSOR. `day` indexes DAYS through the regular season
 * and then keeps counting into the bracket, so there is no phase enum to keep
 * in step with it and no second piece of state that can disagree about where
 * the season has got to.
 */
export const REGULAR_DAYS = DAYS.length;
export const SEMIS = REGULAR_DAYS;
export const FINAL = REGULAR_DAYS + 1;
export const SEASON_END = REGULAR_DAYS + 2;

export const newSeason = (you: string, seed: number): Season => ({
  you,
  day: 0,
  seed,
  rosters: Object.fromEntries(LEAGUE.map((t) => [t.abbr, t])),
  results: [],
  news: [],
  decided: [],
  rest: {},
});

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

export const seasonOver = (s: Season): boolean => s.day >= SEASON_END;

const winnerOf = (r: Result): string => (r.hr > r.ar ? r.home : r.away);

/** What was played on a given day. */
export const resultsOn = (s: Season, day: number): Result[] =>
  s.results.filter((r) => r.day === day);

/** The top four, best first. Seeding and the bracket both come from here. */
export const seeds = (s: Season): string[] => standings(s).slice(0, 4).map((r) => r.abbr);

/**
 * The card for a day — the schedule during the regular season, the bracket
 * after it.
 *
 * ponytail: SINGLE ELIMINATION, ONE GAME A ROUND, higher seed hosts. A
 * best-of-anything needs a series with its own win count, its own home-and-away
 * pattern and its own "is it over", which is three pieces of state to hold
 * something that is currently one row of results. Make it best-of-seven when a
 * round lasting one game is the actual complaint; what it grows then is a
 * `wins` counter, not a rewrite.
 */
export function gamesOn(s: Season, day: number = s.day): readonly Matchup[] {
  if (day < REGULAR_DAYS) return DAYS[day] ?? [];

  const four = seeds(s);
  if (four.length < 4) return [];

  if (day === SEMIS) {
    return [
      { home: four[0]!, away: four[3]! },
      { home: four[1]!, away: four[2]! },
    ];
  }

  if (day === FINAL) {
    const survivors = resultsOn(s, SEMIS).map(winnerOf);
    if (survivors.length < 2) return [];
    // The better seed hosts. Read off the seed order rather than the order the
    // semifinals happen to have been appended in, which is not the bracket.
    const [a, b] = survivors as [string, string];
    return four.indexOf(a) < four.indexOf(b) ? [{ home: a, away: b }] : [{ home: b, away: a }];
  }

  return [];
}

/** Today's matchup involving you, or null — you are out, or the year is done. */
export const yourGame = (s: Season): Matchup | null =>
  gamesOn(s).find((g) => g.home === s.you || g.away === s.you) ?? null;

/** Who won it all, or null until somebody has. */
export function champion(s: Season): string | null {
  const decided = resultsOn(s, FINAL)[0];
  return decided ? winnerOf(decided) : null;
}

/** What to call the day on a screen. */
export function dayLabel(s: Season): string {
  if (s.day < REGULAR_DAYS) return `GAME ${s.day + 1} OF ${REGULAR_DAYS}`;
  if (s.day === SEMIS) return 'SEMIFINAL';
  if (s.day === FINAL) return 'CHAMPIONSHIP';
  return 'SEASON OVER';
}

/**
 * Close out the day: your final goes in as given, everything else on the card
 * is simulated, and the calendar turns over.
 *
 * `yours` is OPTIONAL, and that is the eliminated case — miss the bracket, or
 * lose the semifinal, and the rest of the playoffs is a day you watch rather
 * than a day you play.
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
  const others = gamesOn(s).filter((g) => g.home !== s.you && g.away !== s.you);
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
    const { game } = simulateGame(
      s.seed + s.day * 101 + i,
      9,
      teamOf(s, g.home),
      teamOf(s, g.away),
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

/** The margin at which a result stops being a result and becomes a story. */
export const BLOWOUT = 7;

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
  const story =
    played.find((r) => Math.min(r.hr, r.ar) === 0 && Math.max(r.hr, r.ar) >= 3) ??
    played.find((r) => Math.abs(r.hr - r.ar) >= BLOWOUT);
  if (story) {
    const [w, l, wr, lr] =
      story.hr > story.ar
        ? [story.home, story.away, story.hr, story.ar]
        : [story.away, story.home, story.ar, story.hr];
    note('game', lr === 0 ? `${w} shut out ${l}, ${wr}-0.` : `${w} rout ${l}, ${wr}-${lr}.`);
  }

  // 2. A change at the top. Regular season only — the bracket is seeded off
  //    that table and standings() deliberately does not fold playoffs in.
  if (day < REGULAR_DAYS && day > 0) {
    const was = standings(before)[0]?.abbr;
    const now = standings(after)[0]?.abbr;
    if (was && now && was !== now) note('season', `${now} take over first place.`);
  }

  // 3. The milestones. Each is a fact about the calendar, so each fires once.
  if (after.day === REGULAR_DAYS) note('season', `Playoffs set: ${seeds(after).join(', ')}.`);
  if (day === FINAL) {
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
  const rows = new Map<string, Standing>(
    LEAGUE.map((t) => [
      t.abbr,
      { abbr: t.abbr, w: 0, l: 0, rf: 0, ra: 0, hf: 0, gb: 0, value: clubValue(teamOf(s, t.abbr)) },
    ]),
  );
  for (const g of s.results) {
    if (g.day >= REGULAR_DAYS) continue;
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
    if (typeof s.you !== 'string' || !LEAGUE.some((t) => t.abbr === s.you)) return null;
    if (typeof s.day !== 'number' || s.day < 0 || s.day > SEASON_END) return null;
    if (typeof s.seed !== 'number' || !Number.isFinite(s.seed)) return null;
    if (!s.rosters || LEAGUE.some((t) => !looksLikeTeam(s.rosters![t.abbr]))) return null;
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
      rosters: s.rosters,
      results: s.results,
      news,
      decided,
      rest,
      stats: cleanBook(s.stats),
    };
  } catch {
    return null;
  }
}
