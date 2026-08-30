/**
 * Does a better roster finish higher? `node scripts/season.ts [seasons] [games]`
 *
 * ⚠️ `games` DEFAULTS TO THE FULL SLATE, NOT TO THE FOURTEEN-GAME DEFAULT, and
 * that is deliberate: a fourteen-game standings table is mostly luck by
 * construction, so it is the length that hides a balance problem best. Every
 * number below is a claim about the shape of a SEASON, and the season the
 * claims are worth checking against is the long one.
 *
 * ⚠️ THIS IS THE FRANCHISE'S CHECK, AND IT ASKS THE OPPOSITE QUESTION TO
 * scripts/league.ts. That one asks whether the league is FAIR, and wants every
 * club near 50% — the right goal for an exhibition, where you pick both sides.
 * This one asks whether the league is HONEST: does the club with the better
 * roster actually finish ahead of the club with the worse one? A franchise
 * where it does not is a franchise where no roster move can ever matter.
 *
 * It prints two things:
 *
 *   FINISH BY STRENGTH  each club's average finishing position against its
 *                       rank by roster value. Read down the column — if the
 *                       numbers do not descend, talent is not reaching the
 *                       table.
 *   SEPARATION          how often the stronger roster of a pair finishes above
 *                       the weaker one. 50% is a coin flip and means roster
 *                       value is decoration; 100% would mean the season is
 *                       decided before it is played and nothing is worth
 *                       watching. Somewhere in the 60s is a league where
 *                       building a better club pays and upsets still happen.
 *   THE SHAPE           what the finished table LOOKS like, against the real
 *                       thing. This is the balance question a win-rate round
 *                       robin cannot answer, because a player never sees a
 *                       round robin — he sees one standings table in
 *                       September. See the reference numbers beside it.
 */
import { LEAGUE } from '../src/game/teams.ts';
import { clubValue, byStrength } from '../src/game/value.ts';
import { MAX_GAMES, newSeason, playDay, standings, regularDays } from '../src/game/franchise.ts';

const N = Number(process.argv[2] ?? 40);
const G = Number(process.argv[3] ?? MAX_GAMES);

const finishes: Record<string, number[]> = {};
for (const t of LEAGUE) finishes[t.abbr] = [];

/** Every club's win% in every season, and the best and worst of each table. */
const pcts: number[] = [];
const bests: number[] = [];
const worsts: number[] = [];
const spreads: number[] = [];

for (let i = 0; i < N; i++) {
  // ⚠️ `you` MUST NAME NOBODY. playDay() skips your club's game — the human is
  // expected to hand that result in — so seeding this with a real abbr leaves
  // that club 0-0 and last in every season ever simulated. A sentinel matches
  // no club, so all four games on the card are played.
  let s = newSeason('---', i * 7919 + 3, G);
  while (s.day < regularDays(s)) s = playDay(s);
  const table = standings(s);
  table.forEach((row, place) => finishes[row.abbr]!.push(place + 1));

  const w = table.map((r) => (r.w / Math.max(1, r.w + r.l)) * 100);
  pcts.push(...w);
  bests.push(Math.max(...w));
  worsts.push(Math.min(...w));
  spreads.push(Math.max(...w) - Math.min(...w));
}

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const avg: Record<string, number> = {};
for (const t of LEAGUE) avg[t.abbr] = mean(finishes[t.abbr]!);

console.log(`${N} seasons of ${G} games\n`);
console.log('club   roster value   strength rank   avg finish');
for (const t of byStrength(LEAGUE)) {
  const rank = byStrength(LEAGUE).findIndex((x) => x.abbr === t.abbr) + 1;
  console.log(
    `${t.abbr}    ${clubValue(t).toFixed(3).padStart(10)}` +
      `${String(rank).padStart(14)}${avg[t.abbr]!.toFixed(2).padStart(13)}`,
  );
}

// Every pair, counted once: did the better roster finish ahead?
let right = 0;
let pairs = 0;
for (let i = 0; i < LEAGUE.length; i++) {
  for (let j = i + 1; j < LEAGUE.length; j++) {
    const a = LEAGUE[i]!;
    const b = LEAGUE[j]!;
    const [strong, weak] = clubValue(a) >= clubValue(b) ? [a, b] : [b, a];
    for (let n = 0; n < N; n++) {
      pairs++;
      if (finishes[strong.abbr]![n]! < finishes[weak.abbr]![n]!) right++;
    }
  }
}
console.log(`\nseparation      ${((right / pairs) * 100).toFixed(1)}%  (50% = roster value is decoration)`);

/**
 * THE SHAPE OF A FINISHED TABLE, against the real thing.
 *
 * ⚠️ THE REFERENCE NUMBERS ARE MODERN MLB, 162 GAMES. A typical year's best
 * club wins 98-104 and its worst wins 55-62; the standard deviation of team
 * win% across the thirty is about 6.8 points, and roughly 3.9 of that is pure
 * coin-flip luck over 162 games rather than talent. So a league whose SD is
 * much past 7 is not a league with more drama in it — it is one where the
 * standings were written in March.
 *
 * ⚠️ SD IS THE NUMBER TO TUNE ON, NOT THE BEST RECORD. The best record is a
 * maximum over thirty draws and bounces around by five wins a year on nothing;
 * the SD uses all thirty clubs every season and holds still.
 */
const mean2 = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: readonly number[]): number => {
  const m = mean2(xs);
  return Math.sqrt(mean2(xs.map((x) => (x - m) ** 2)));
};
const wins = (pct: number): string => `${Math.round((pct / 100) * G)}-${Math.round((1 - pct / 100) * G)}`;

console.log(`\nthe shape of a ${G}-game table    (${N} seasons)`);
console.log(`  best record       ${mean2(bests).toFixed(1)}%  ${wins(mean2(bests))}` +
  `      real ~63%  102-60`);
console.log(`  worst record      ${mean2(worsts).toFixed(1)}%  ${wins(mean2(worsts))}` +
  `      real ~36%  58-104`);
console.log(`  spread            ${mean2(spreads).toFixed(1)} points` +
  `              real ~27`);
console.log(`  win% SD           ${sd(pcts).toFixed(1)} points` +
  `               real ~6.8   <- tune on this`);
