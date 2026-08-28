/**
 * THE NUMBERS. Who did what, folded out of the at-bats as they happen.
 *
 * ⚠️ WHY THIS EXISTS. Before it, nobody in this league had ever recorded a
 * hit. A Result carried team runs and team hits and nothing else, so you could
 * finish a fourteen-game season, win the thing, and the game could not tell you
 * that your leadoff man hit .380 or that your ace struck out forty. A baseball
 * game that cannot answer "how is he hitting" is a scoreboard with a bat
 * attached.
 *
 * ⚠️ ONE CHOKE POINT, AND IT IS NOT THIS FILE. recordPlay() in game.ts is the
 * single function both halves of the engine go through — the human at the
 * plate (main.ts) and the headless sim (sim.ts) both end their at-bats there.
 * So the fold is called from exactly one place and no call site has to
 * remember to keep score. Adding a fourth way to play a game gets stats for
 * free, or it is not going through recordPlay, which would be the real bug.
 *
 * ⚠️ KEYED BY NAME, NOT BY ID. Every one of the names in teams.ts is unique,
 * Pitcher has no id to key on anyway, and the name is what the screen has to
 * print. A trade moves a man between clubs and his line follows him, which is
 * what you want. `tm` is stamped on every update, so it says where he last
 * played rather than where he started.
 *
 * ponytail: no stolen bases, no sacrifices, no saves, no holds, no splits.
 * Steals resolve outside recordPlay (running.ts, three call sites) and would
 * need their own hook; the rest are columns nobody has asked for yet. AB is PA
 * minus walks, so a sacrifice costs an at-bat here that it would not cost in a
 * real book.
 */

import type { AtBatResult } from '../core/atBat.ts';

/** One hitter's line. Counting numbers only — every rate is derived below. */
export interface BatLine {
  /** Plate appearances. The denominator OBP wants and AB is not. */
  pa: number;
  ab: number;
  h: number;
  /** Doubles, triples, home runs. All three are already counted inside `h`. */
  d: number;
  t: number;
  hr: number;
  /**
   * Walks — AND hit batsmen, which are folded in here.
   *
   * ponytail: a plunking is a free base that is not an at-bat, which is
   * exactly what a walk is, and the two differ only in a column nobody reads.
   * Split it when somebody wants HBP on the screen.
   */
  bb: number;
  k: number;
  rbi: number;
  /** Where he last played. Stamped every update, so a trade moves it. */
  tm: string;
}

/** One pitcher's line. */
export interface ArmLine {
  /** Outs recorded. Innings pitched is this over three — see ip(). */
  outs: number;
  h: number;
  bb: number;
  k: number;
  /** Runs allowed, earned and not. */
  r: number;
  /**
   * Earned runs. A run that scores on a play the defence booted is unearned.
   *
   * ponytail: only the runs on the error play itself. Reconstructing the
   * inning as it would have gone without the error — which is the actual rule
   * — needs a shadow inning per half, and this catches the common case for
   * nothing. Upgrade it when ERA is a number somebody is tuning against.
   */
  er: number;
  w: number;
  l: number;
  tm: string;
}

export interface StatBook {
  bat: Readonly<Record<string, BatLine>>;
  arm: Readonly<Record<string, ArmLine>>;
}

export const EMPTY_BOOK: StatBook = { bat: {}, arm: {} };

const newBat = (tm: string): BatLine =>
  ({ pa: 0, ab: 0, h: 0, d: 0, t: 0, hr: 0, bb: 0, k: 0, rbi: 0, tm });

const newArm = (tm: string): ArmLine =>
  ({ outs: 0, h: 0, bb: 0, k: 0, r: 0, er: 0, w: 0, l: 0, tm });

/** Everything one completed at-bat is worth to both men in it. */
export interface PlayFacts {
  batter: string;
  batterTeam: string;
  pitcher: string;
  pitcherTeam: string;
  result: AtBatResult;
  /** The defence booted it: he reached, nobody is out, nothing is earned. */
  error: boolean;
  /** Runs that scored on the play. */
  runs: number;
  /** Outs made on the play — one, two on a double play, or none. */
  outs: number;
}

/**
 * Fold one at-bat into the book. Pure: a new book out, the old one untouched,
 * same as every other piece of state in this engine.
 */
export function recordAtBat(book: StatBook, f: PlayFacts): StatBook {
  const b = { ...(book.bat[f.batter] ?? newBat(f.batterTeam)), tm: f.batterTeam };
  const a = { ...(book.arm[f.pitcher] ?? newArm(f.pitcherTeam)), tm: f.pitcherTeam };

  b.pa += 1;
  a.outs += f.outs;
  a.r += f.runs;
  // A run that scores on a booted ball is not on the pitcher. See ArmLine.er.
  a.er += f.error ? 0 : f.runs;
  // ...and it is not an RBI either, for the same reason: the bat did not
  // drive it in, the glove let it in.
  b.rbi += f.error ? 0 : f.runs;

  switch (f.result.kind) {
    case 'walk':
    case 'hit_by_pitch':
      b.bb += 1;
      a.bb += 1;
      break;
    case 'strikeout':
      b.ab += 1;
      b.k += 1;
      a.k += 1;
      break;
    case 'in_play': {
      b.ab += 1;
      const o = f.result.hit.outcome;
      if (o === 'single' || o === 'double' || o === 'triple' || o === 'home_run') {
        b.h += 1;
        a.h += 1;
        if (o === 'double') b.d += 1;
        else if (o === 'triple') b.t += 1;
        else if (o === 'home_run') b.hr += 1;
      }
      break;
    }
  }

  return { bat: { ...book.bat, [f.batter]: b }, arm: { ...book.arm, [f.pitcher]: a } };
}

/**
 * Credit the decision. Called once, when the game is final — see game.ts.
 *
 * A name that never appears in the book cannot be given a decision: it would
 * invent a pitcher who threw no innings and put him on the leaderboard.
 */
export function recordDecision(book: StatBook, winner: string, loser: string): StatBook {
  const arm: Record<string, ArmLine> = { ...book.arm };
  const w = arm[winner];
  const l = arm[loser];
  if (w) arm[winner] = { ...w, w: w.w + 1 };
  if (l) arm[loser] = { ...l, l: l.l + 1 };
  return { ...book, arm };
}

/** Add two books together — a game into a season, in playDay(). */
export function merge(into: StatBook, from: StatBook): StatBook {
  const bat: Record<string, BatLine> = { ...into.bat };
  const arm: Record<string, ArmLine> = { ...into.arm };

  for (const [name, l] of Object.entries(from.bat)) {
    const p = bat[name] ?? newBat(l.tm);
    bat[name] = {
      pa: p.pa + l.pa, ab: p.ab + l.ab, h: p.h + l.h, d: p.d + l.d, t: p.t + l.t,
      hr: p.hr + l.hr, bb: p.bb + l.bb, k: p.k + l.k, rbi: p.rbi + l.rbi, tm: l.tm,
    };
  }
  for (const [name, l] of Object.entries(from.arm)) {
    const p = arm[name] ?? newArm(l.tm);
    arm[name] = {
      outs: p.outs + l.outs, h: p.h + l.h, bb: p.bb + l.bb, k: p.k + l.k,
      r: p.r + l.r, er: p.er + l.er, w: p.w + l.w, l: p.l + l.l, tm: l.tm || p.tm,
    };
  }
  return { bat, arm };
}

// ------------------------------------------------------------------ derived

export const avg = (l: BatLine): number => (l.ab === 0 ? 0 : l.h / l.ab);

/** (H + BB) / PA. No sacrifices in this engine, so PA is the whole denominator. */
export const obp = (l: BatLine): number => (l.pa === 0 ? 0 : (l.h + l.bb) / l.pa);

export const slg = (l: BatLine): number =>
  l.ab === 0 ? 0 : (l.h + l.d + 2 * l.t + 3 * l.hr) / l.ab;

export const ops = (l: BatLine): number => obp(l) + slg(l);

/** Innings, the way a box score writes them: 6.2 is six and two thirds. */
export const ip = (outs: number): string => `${Math.floor(outs / 3)}.${outs % 3}`;

export const era = (l: ArmLine): number => (l.outs === 0 ? 0 : (l.er * 27) / l.outs);

export const whip = (l: ArmLine): number => (l.outs === 0 ? 0 : ((l.h + l.bb) * 3) / l.outs);

/** ".380", not "0.380" — the way an average is written on a scoreboard. */
export const rate = (n: number): string => n.toFixed(3).replace(/^0\./, '.');

/**
 * WHO QUALIFIES FOR A RATE TITLE. A man who went 1-for-1 in September does not
 * lead the league at 1.000.
 *
 * ponytail: measured against the league's busiest player rather than against
 * the schedule. It needs nothing from franchise.ts, it is right on day one and
 * right on day fourteen, and it holds up if the season length ever moves.
 */
export const QUALIFY = 0.6;

/**
 * The top `n` by some measure, qualified. `of` reads the number to sort on and
 * `weight` reads the playing-time column the bar is set against.
 */
export function leaders<T>(
  lines: Readonly<Record<string, T>>,
  of: (l: T) => number,
  weight: (l: T) => number,
  n = 5,
  ascending = false,
): { name: string; line: T }[] {
  const all = Object.entries(lines);
  if (all.length === 0) return [];
  const bar = QUALIFY * Math.max(...all.map(([, l]) => weight(l)));
  return all
    .filter(([, l]) => weight(l) >= bar && weight(l) > 0)
    .sort((a, b) => {
      const by = ascending ? of(a[1]) - of(b[1]) : of(b[1]) - of(a[1]);
      // ⚠️ TIES BREAK ON PLAYING TIME, and a short season is full of ties: with
      // fourteen games a 0.00 ERA is four men deep and a round batting average
      // is common. The man who did it over more innings did more of it, which
      // is both the real tiebreak and the only one that is not the order the
      // objects happened to be created in.
      return by !== 0 ? by : weight(b[1]) - weight(a[1]);
    })
    .slice(0, n)
    .map(([name, line]) => ({ name, line }));
}

/** Everyone on one club, in the order the roster lists them. */
export function clubBatting(
  book: StatBook,
  names: readonly string[],
): { name: string; line: BatLine }[] {
  return names
    .map((name) => ({ name, line: book.bat[name] }))
    .filter((r): r is { name: string; line: BatLine } => !!r.line);
}

export function clubArms(
  book: StatBook,
  names: readonly string[],
): { name: string; line: ArmLine }[] {
  return names
    .map((name) => ({ name, line: book.arm[name] }))
    .filter((r): r is { name: string; line: ArmLine } => !!r.line);
}
