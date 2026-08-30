/**
 * THE DEEP AUDIT. `node scripts/audit.ts [seasons]`
 *
 * league.ts asks who wins, season.ts asks whether the better roster finishes
 * higher, balance.ts asks what a game looks like. This asks the questions none
 * of those three can:
 *
 *   THE BRACKET   does the top seed just win it every year? A four-club single
 *                 elimination that the one seed takes 70% of the time is not a
 *                 playoff, and one it takes 25% of the time makes the whole
 *                 fourteen-game schedule pointless.
 *   THE PEN       is anybody actually using their bullpen, and does stamina
 *                 mean anything? A starter who always finishes, or a pen that
 *                 empties by the fifth, are both broken and neither shows up
 *                 in a runs-per-game number.
 *   THE SHAPE     per-club scoring and allowing, so a club that is winning for
 *                 the WRONG reason is visible — a bad roster carried by a soft
 *                 schedule, or a good one whose staff is quietly the story.
 *   THE TAILS     the games nobody wants: 20-run laughers, 1-0 slogs, and
 *                 at-bats that hit the loop guard.
 */
import { LEAGUE } from '../src/game/teams.ts';
import { clubValue, byStrength } from '../src/game/value.ts';
import {
  newSeason,
  playDay,
  standings,
  seeds,
  champion,
  regularDays,
  seasonEnd,
} from '../src/game/franchise.ts';
import { simulateGame } from '../src/game/sim.ts';
import { newStaff, fatigueOf, limitOf } from '../src/game/bullpen.ts';

const N = Number(process.argv[2] ?? 200);
const rank = Object.fromEntries(byStrength(LEAGUE).map((t, i) => [t.abbr, i + 1]));

// ------------------------------------------------------------- the bracket
const titles: Record<string, number> = {};
const seedTitles = [0, 0, 0, 0];
const seedApp = [0, 0, 0, 0];
let finishedSeasons = 0;

for (const t of LEAGUE) titles[t.abbr] = 0;

for (let i = 0; i < N; i++) {
  let s = newSeason('---', i * 7919 + 3);
  while (s.day < seasonEnd(s)) s = playDay(s);
  const four = seeds(s);
  four.forEach((_, k) => seedApp[k]!++);
  const champ = champion(s);
  if (champ) {
    titles[champ] = (titles[champ] ?? 0) + 1;
    const k = four.indexOf(champ);
    if (k >= 0) seedTitles[k]!++;
    finishedSeasons++;
  }
}

console.log(`=== THE BRACKET (${N} seasons, ${finishedSeasons} decided) ===\n`);
console.log('seed   titles   share');
for (let k = 0; k < 4; k++) {
  console.log(
    `  ${k + 1}    ${String(seedTitles[k]).padStart(6)}   ` +
      `${((seedTitles[k]! / Math.max(1, finishedSeasons)) * 100).toFixed(1)}%`,
  );
}
console.log('\nclub   roster rank   titles');
for (const t of byStrength(LEAGUE)) {
  console.log(
    `${t.abbr}    ${String(rank[t.abbr]).padStart(10)}   ` +
      `${((titles[t.abbr]! / Math.max(1, finishedSeasons)) * 100).toFixed(1)}%`,
  );
}

// --------------------------------------------------------------- the tails
// Straight game sims across every pairing, so the distribution is the league's
// and not one matchup's.
const PAIRS = LEAGUE.flatMap((h) => LEAGUE.filter((a) => a !== h).map((a) => [h, a] as const));
const GAMES = 3000;
let blowouts = 0;
let onerun = 0;
let extras = 0;
let unfinished = 0;
let maxRuns = 0;
let maxLine = '';
const relieved: number[] = [];
const starterPitches: number[] = [];

for (let i = 0; i < GAMES; i++) {
  const [home, away] = PAIRS[i % PAIRS.length]!;
  const { game } = simulateGame(i * 104729 + 7, 9, home, away);
  if (!game.over) {
    unfinished++;
    continue;
  }
  const h = game.homeState.runs;
  const a = game.awayState.runs;
  if (Math.abs(h - a) >= 10) blowouts++;
  if (Math.abs(h - a) === 1) onerun++;
  if (game.inning > 9) extras++;
  if (h + a > maxRuns) {
    maxRuns = h + a;
    maxLine = `${away.abbr} ${a} at ${home.abbr} ${h}`;
  }
  // How deep each side got into its staff, and how far the starter went. The
  // starter is used[0] once he has been pulled and the current arm while he is
  // still out there — both are ArmState, so both carry the pitch count.
  for (const st of [game.homeState, game.awayState]) {
    relieved.push(st.staff.used.length);
    starterPitches.push((st.staff.used[0] ?? st.staff.current).pitches);
  }
}

const mean = (xs: readonly number[]) => xs.reduce((x, y) => x + y, 0) / Math.max(1, xs.length);
const share = (xs: readonly number[], f: (n: number) => boolean) =>
  (xs.filter(f).length / Math.max(1, xs.length)) * 100;

console.log(`\n=== THE TAILS (${GAMES} games, all pairings) ===\n`);
console.log(`10+ run margin   ${((blowouts / GAMES) * 100).toFixed(1)}%  (MLB ~4%)`);
console.log(`one-run games    ${((onerun / GAMES) * 100).toFixed(1)}%  (MLB ~29%)`);
console.log(`extra innings    ${((extras / GAMES) * 100).toFixed(1)}%  (MLB ~9%)`);
console.log(`unfinished       ${unfinished}`);
console.log(`highest scoring  ${maxLine} (${maxRuns} runs)`);

console.log(`\n=== THE PEN ===\n`);
console.log(`relievers used   ${mean(relieved).toFixed(2)} per team per game  (MLB ~3)`);
console.log(`  never went to the pen  ${share(relieved, (n) => n === 0).toFixed(1)}%`);
console.log(`  emptied it (2+)        ${share(relieved, (n) => n >= 2).toFixed(1)}%`);
console.log(`starter pitches  ${mean(starterPitches).toFixed(1)}  (MLB ~88)`);
console.log(`  under 50               ${share(starterPitches, (n) => n < 50).toFixed(1)}%`);
console.log(`  went the distance      ${share(starterPitches, (n) => n >= 100).toFixed(1)}%`);

console.log(`\n=== STAMINA, AS WRITTEN ===\n`);
console.log('club   starter   limit   fresh until');
for (const t of byStrength(LEAGUE)) {
  const s = newStaff(t.rotation[0]!, t.bullpen);
  const p = s.current.pitcher;
  let fresh = 0;
  while (fresh < 200 && fatigueOf(fresh, p.stamina) === 0) fresh++;
  console.log(
    `${t.abbr}    ${p.name.slice(0, 18).padEnd(18)} ${limitOf(p).toFixed(0).padStart(5)}   ${String(fresh - 1).padStart(5)}`,
  );
}

console.log(`\n=== THE SHAPE (${N} seasons) ===\n`);
const rf: Record<string, number> = {};
const ra: Record<string, number> = {};
const wins: Record<string, number> = {};
const gp: Record<string, number> = {};
for (const t of LEAGUE) {
  rf[t.abbr] = 0;
  ra[t.abbr] = 0;
  wins[t.abbr] = 0;
  gp[t.abbr] = 0;
}
for (let i = 0; i < N; i++) {
  let s = newSeason('---', i * 31 + 11);
  while (s.day < regularDays(s)) s = playDay(s);
  for (const row of standings(s)) {
    rf[row.abbr]! += row.rf;
    ra[row.abbr]! += row.ra;
    wins[row.abbr]! += row.w;
    gp[row.abbr]! += row.w + row.l;
  }
}
console.log('club  rank  value   win%    R/G    RA/G   diff');
for (const t of byStrength(LEAGUE)) {
  const a = t.abbr;
  console.log(
    `${a}   ${String(rank[a]).padStart(4)}  ${clubValue(t).toFixed(2)}  ` +
      `${((wins[a]! / gp[a]!) * 100).toFixed(1).padStart(5)}%  ` +
      `${(rf[a]! / gp[a]!).toFixed(2).padStart(5)}  ${(ra[a]! / gp[a]!).toFixed(2).padStart(5)}  ` +
      `${((rf[a]! - ra[a]!) / gp[a]!).toFixed(2).padStart(6)}`,
  );
}
