/**
 * THE RECORD BOOK. What you have done, across every franchise you have ever
 * started on this machine.
 *
 * ⚠️ WHY IT EXISTS. franchise.ts is deliberate about there being ONE year and
 * no year two — "a second year is not a bigger number in a field, it is an
 * offseason, which is a whole mode of its own" — and that is still true. But it
 * left the fourteen games you just played leading nowhere: you win the thing,
 * a banner says so, you start a new franchise, and the old one has never
 * existed. A season with a champion and no memory of the champion is a season
 * that ends twice.
 *
 * This is the cheap half of the answer, and it is not an offseason. Nothing in
 * here is ever read back INTO a game: no ageing, no carried-over roster, no
 * dynasty bonus. It is a ledger. The season is still one year; this is the
 * shelf you put the year on.
 *
 * ⚠️ ONE ROW PER SEASON, AND EVERYTHING ELSE IS A FOLD. Career totals, titles,
 * the best year you ever had, the single-season records your men hold — all of
 * them are computed from `years` on demand. This is franchise.ts's own rule
 * (WHY RESULTS AND NOT RECORDS) and it applies here for the same reason: a
 * stored "career wins" can disagree with the seasons that produced it and a
 * fold cannot. The season book itself is the exception that proved it, and the
 * exception was made because there was nothing left to fold from. Here there
 * is.
 *
 * ⚠️ THE SEED IS THE IDENTITY. A season is filed once, keyed on the seed it was
 * created with, so reaching the final screen twice — reloading a finished save,
 * watching the bracket play out after being eliminated — cannot file the same
 * year twice and hand you two championships for one.
 *
 * ponytail: no dates, no career leaderboards across all players in the league,
 * no per-club splits deeper than the row itself. The book answers "what have I
 * done" and "what is the best anyone of mine has done", which is the whole of
 * why anybody opens one.
 */

import { champion, regularDays, standings, teamOf, type Season } from './franchise.ts';
import { avg, era, type StatBook } from './stats.ts';

/** One hitter's season, as the book remembers it. */
export interface BatMark {
  name: string;
  avg: number;
  hr: number;
  rbi: number;
}

export interface ArmMark {
  name: string;
  w: number;
  l: number;
  era: number;
  k: number;
  /** Outs, so the book can tell a 0.00 over six innings from one over sixty. */
  outs: number;
}

/** One finished season under your management. */
export interface Year {
  /** Which club you ran. */
  club: string;
  w: number;
  l: number;
  /** Where you finished in the table, one-based. */
  finish: number;
  /**
   * How long the year was. Optional — a season filed before the length was
   * pickable was always DEFAULT_GAMES, and the book renders it as such.
   *
   * ⚠️ IT IS RECORDED BECAUSE THE BOOK PUTS YEARS SIDE BY SIDE. A 9-5 and a
   * 96-66 in adjacent rows with no games column is two records that look like
   * one scale and are not, and the career total underneath silently adds them.
   */
  games?: number;
  /** Who won it all — you, or somebody else. */
  champion: string;
  /** The season's seed. See the header: this is what stops a double entry. */
  seed: number;
  /** Your best bat and your best arm that year, for the records page. */
  bat?: BatMark;
  arm?: ArmMark;
}

export interface Career {
  years: readonly Year[];
}

export const newCareer = (): Career => ({ years: [] });

// -------------------------------------------------------------- writing it

/**
 * Your best hitter and your best arm of the season just finished.
 *
 * ⚠️ MEASURED BY THE THING THE RECORD IS FOR, not by an overall rating. The
 * batting mark is picked on average and the pitching mark on ERA, because those
 * are the two numbers the records page sorts by; picking "best player" some
 * other way would put a man in the book who does not hold any of its records.
 *
 * ponytail: a floor of one plate appearance per scheduled game rather than a
 * real qualifying rule. A reliever who threw four scoreless innings is not your
 * best arm, and that is the whole of what needs saying. `games` is the season's
 * own length — the bar has to grow with the year, or a hundred-and-sixty-two
 * game season lets a man who played a fortnight hold the batting mark.
 */
function marks(
  book: StatBook,
  names: { bats: string[]; arms: string[] },
  games: number,
): Pick<Year, 'bat' | 'arm'> {
  const FLOOR_PA = games;
  const FLOOR_OUTS = games;

  const bats = names.bats
    .map((n) => ({ n, l: book.bat[n] }))
    .filter((r) => r.l && r.l.pa >= FLOOR_PA);
  const arms = names.arms
    .map((n) => ({ n, l: book.arm[n] }))
    .filter((r) => r.l && r.l.outs >= FLOOR_OUTS);

  const bestBat = bats.sort((a, b) => avg(b.l!) - avg(a.l!))[0];
  const bestArm = arms.sort((a, b) => era(a.l!) - era(b.l!))[0];

  return {
    ...(bestBat
      ? { bat: { name: bestBat.n, avg: avg(bestBat.l!), hr: bestBat.l!.hr, rbi: bestBat.l!.rbi } }
      : {}),
    ...(bestArm
      ? {
          arm: {
            name: bestArm.n,
            w: bestArm.l!.w,
            l: bestArm.l!.l,
            era: era(bestArm.l!),
            k: bestArm.l!.k,
            outs: bestArm.l!.outs,
          },
        }
      : {}),
  };
}

/**
 * File a finished season. Returns the career unchanged if this one is already
 * in it — see the header on why that guard is not optional.
 */
export function file(c: Career, s: Season): Career {
  if (c.years.some((y) => y.seed === s.seed)) return c;

  const table = standings(s);
  const at = table.findIndex((r) => r.abbr === s.you);
  const me = table[at];
  const you = teamOf(s, s.you);

  const year: Year = {
    club: s.you,
    w: me?.w ?? 0,
    l: me?.l ?? 0,
    finish: at + 1,
    champion: champion(s) ?? '—',
    seed: s.seed,
    games: regularDays(s),
    ...(s.stats
      ? marks(
          s.stats,
          {
            bats: you.lineup.map((p) => p.name),
            arms: [...you.rotation, ...you.bullpen].map((p) => p.name),
          },
          regularDays(s),
        )
      : {}),
  };

  return { years: [...c.years, year] };
}

// -------------------------------------------------------------- reading it

export interface Totals {
  seasons: number;
  w: number;
  l: number;
  titles: number;
  /** Clubs you have run, each once, in the order you first ran them. */
  clubs: string[];
}

export const totals = (c: Career): Totals => ({
  seasons: c.years.length,
  w: c.years.reduce((a, y) => a + y.w, 0),
  l: c.years.reduce((a, y) => a + y.l, 0),
  titles: c.years.filter((y) => y.champion === y.club).length,
  clubs: [...new Set(c.years.map((y) => y.club))],
});

/** Winning percentage across everything. Zero seasons is zero, not NaN. */
export const winPct = (t: Totals): number => (t.w + t.l === 0 ? 0 : t.w / (t.w + t.l));

/**
 * THE RECORDS — the best single season anybody of yours has ever had.
 *
 * ⚠️ SINGLE SEASON, NOT CAREER TOTALS. Career home runs would only ever measure
 * how many franchises you have started, because a player who appears in five
 * seasons has five times the at-bats of one who appears in one. A season record
 * is a fair comparison between any two years, which is the only comparison the
 * book can honestly make.
 */
export interface Record_ {
  label: string;
  name: string;
  club: string;
  value: string;
}

export function records(c: Career): Record_[] {
  const out: Record_[] = [];
  const withBat = c.years.filter((y) => y.bat);
  const withArm = c.years.filter((y) => y.arm);

  const best = <T>(rows: T[], of: (r: T) => number, low = false): T | undefined =>
    rows.length === 0
      ? undefined
      : rows.reduce((a, b) => (low ? (of(b) < of(a) ? b : a) : of(b) > of(a) ? b : a));

  const add = (label: string, y: Year | undefined, name: string | undefined, value: string): void => {
    if (y && name) out.push({ label, name, club: y.club, value });
  };

  const bestAvg = best(withBat, (y) => y.bat!.avg);
  add('BATTING AVERAGE', bestAvg, bestAvg?.bat?.name, bestAvg ? bestAvg.bat!.avg.toFixed(3).replace(/^0\./, '.') : '');

  const bestHr = best(withBat, (y) => y.bat!.hr);
  add('HOME RUNS', bestHr, bestHr?.bat?.name, `${bestHr?.bat?.hr ?? 0}`);

  const bestRbi = best(withBat, (y) => y.bat!.rbi);
  add('RUNS BATTED IN', bestRbi, bestRbi?.bat?.name, `${bestRbi?.bat?.rbi ?? 0}`);

  const bestEra = best(withArm, (y) => y.arm!.era, true);
  add('EARNED RUN AVERAGE', bestEra, bestEra?.arm?.name, bestEra ? bestEra.arm!.era.toFixed(2) : '');

  const bestK = best(withArm, (y) => y.arm!.k);
  add('STRIKEOUTS', bestK, bestK?.arm?.name, `${bestK?.arm?.k ?? 0}`);

  return out;
}

/** The best year you ever managed, by record. Ties go to the championship. */
export const bestYear = (c: Career): Year | undefined =>
  c.years.length === 0
    ? undefined
    : [...c.years].sort((a, b) => {
        const pct = (y: Year): number => (y.w + y.l === 0 ? 0 : y.w / (y.w + y.l));
        const title = (y: Year): number => (y.champion === y.club ? 1 : 0);
        return title(b) - title(a) || pct(b) - pct(a);
      })[0];

// ------------------------------------------------------------- persistence

const KEY = 'asb-career';

/**
 * Off disk, validated row by row.
 *
 * A garbled year is DROPPED rather than repaired, and the rest of the book
 * survives it. The alternative — refusing the whole file, the way loadSeason()
 * refuses a bad save — would throw away a career of real seasons over one bad
 * row, and unlike a season there is no way to play this one again.
 */
export function loadCareer(): Career {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return newCareer();
    const parsed = JSON.parse(raw) as { years?: unknown };
    if (!Array.isArray(parsed?.years)) return newCareer();

    const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
    const years = (parsed.years as Year[]).filter(
      (y) =>
        y &&
        typeof y.club === 'string' &&
        typeof y.champion === 'string' &&
        num(y.w) && num(y.l) && num(y.finish) && num(y.seed),
    );
    return { years };
  } catch {
    return newCareer();
  }
}

export function saveCareer(c: Career): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* private window, or the disk said no. The book still holds in memory. */
  }
}
