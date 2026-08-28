/**
 * Does a better roster finish higher? `node scripts/season.ts [seasons]`
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
 */
import { LEAGUE } from '../src/game/teams.ts';
import { clubValue, byStrength } from '../src/game/value.ts';
import { newSeason, playDay, standings, REGULAR_DAYS } from '../src/game/franchise.ts';

const N = Number(process.argv[2] ?? 40);

const finishes: Record<string, number[]> = {};
for (const t of LEAGUE) finishes[t.abbr] = [];

for (let i = 0; i < N; i++) {
  // ⚠️ `you` MUST NAME NOBODY. playDay() skips your club's game — the human is
  // expected to hand that result in — so seeding this with a real abbr leaves
  // that club 0-0 and last in every season ever simulated. A sentinel matches
  // no club, so all four games on the card are played.
  let s = newSeason('---', i * 7919 + 3);
  while (s.day < REGULAR_DAYS) s = playDay(s);
  standings(s).forEach((row, place) => finishes[row.abbr]!.push(place + 1));
}

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const avg: Record<string, number> = {};
for (const t of LEAGUE) avg[t.abbr] = mean(finishes[t.abbr]!);

console.log(`${N} seasons of ${REGULAR_DAYS} games\n`);
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
