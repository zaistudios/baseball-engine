/**
 * Is the league fair? `node scripts/league.ts [games per matchup]`
 *
 * Every club plays every other club home and away, and the script prints each
 * one's record and its roster value.
 *
 * ⚠️ THE 45-55% RULE IS GONE. This script used to say a club outside that band
 * had numbers that moved too far, and that was right while the league existed
 * to serve the exhibition, where you pick both clubs and a coin flip is the
 * point. The franchise wants the opposite: if a stacked club and a thin one
 * both finish .500, no trade, no signing and no development step can ever
 * matter. teams.ts now carries a deliberate talent ladder, and the eight clubs
 * are MEANT to spread.
 *
 * What this script still catches is a club that has fallen off the ladder
 * rather than sat on it — a win rate far from where its roster value ranks.
 * Read the two columns TOGETHER: they should descend together. Whether a
 * better roster actually finishes higher is scripts/season.ts.
 *
 * ponytail: a round robin, not a search. A search over rosters overfits (see
 * the note in teams.ts); this just measures what is written down.
 */
import { LEAGUE } from '../src/game/teams.ts';
import { simulateGame } from '../src/game/sim.ts';
import { clubValue } from '../src/game/value.ts';

/** One number for what a player is worth, all five stats in it. */
// ⚠️ clubValue, NOT a lineup total. This column scored the nine hitters and
// ignored the three arms, so a club with a good staff and an ordinary lineup
// read as weaker than it plays — which is the same class of error the weights
// themselves had. The pre-game screen shows clubValue; so does this.

const N = Number(process.argv[2] ?? 60);
const wins: Record<string, number> = {};
const games: Record<string, number> = {};
const scored: Record<string, number> = {};
const allowed: Record<string, number> = {};
for (const t of LEAGUE) {
  wins[t.abbr] = 0;
  games[t.abbr] = 0;
  scored[t.abbr] = 0;
  allowed[t.abbr] = 0;
}

let homeWins = 0;
let played = 0;

for (let i = 0; i < LEAGUE.length; i++) {
  for (let j = 0; j < LEAGUE.length; j++) {
    if (i === j) continue;
    const home = LEAGUE[i]!;
    const away = LEAGUE[j]!;
    for (let s = 0; s < N; s++) {
      // ⚠️ TURN BOTH ROTATIONS OVER. simulateGame() defaults to rotation[0],
      // which is what the whole league used to do and is no longer what a
      // season looks like — a win rate read off three aces would describe a
      // league nobody plays. Everybody is fully rested here: this script asks
      // whether a ROSTER is good, and short rest is a decision, not a rating.
      const { game } = simulateGame((i * 31 + j) * 7919 + s * 13 + 1, 9, home, away, {
        home: { index: s % home.rotation.length },
        away: { index: (s + 1) % away.rotation.length },
      });
      if (!game.over) continue;
      played++;
      games[home.abbr]!++;
      games[away.abbr]!++;
      scored[home.abbr]! += game.homeState.runs;
      scored[away.abbr]! += game.awayState.runs;
      allowed[home.abbr]! += game.awayState.runs;
      allowed[away.abbr]! += game.homeState.runs;
      if (game.winner === 'home') {
        wins[home.abbr]!++;
        homeWins++;
      } else {
        wins[away.abbr]!++;
      }
    }
  }
}

const rows = LEAGUE.map((t) => ({
  abbr: t.abbr,
  name: t.name,
  pct: wins[t.abbr]! / games[t.abbr]!,
  rpg: scored[t.abbr]! / games[t.abbr]!,
  apg: allowed[t.abbr]! / games[t.abbr]!,
  val: clubValue(t),
})).sort((a, b) => b.pct - a.pct);

console.log(`${played} games, ${N} per matchup\n`);
console.log('club                     win%   runs/g  allowed   roster value');
for (const r of rows) {
  console.log(
    `${r.abbr}  ${r.name.padEnd(21)} ${(r.pct * 100).toFixed(1).padStart(5)}%  ${r.rpg.toFixed(2).padStart(5)}    ${r.apg.toFixed(2).padStart(5)}   ${r.val.toFixed(2)}`,
  );
}

const pcts = rows.map((r) => r.pct);
const vals = rows.map((r) => r.val);
console.log('');
console.log(`spread          ${((Math.max(...pcts) - Math.min(...pcts)) * 100).toFixed(1)} points of win%`);
console.log(`roster value    ${Math.min(...vals).toFixed(2)} to ${Math.max(...vals).toFixed(2)}`);
console.log(`home teams      ${((homeWins / played) * 100).toFixed(1)}%   (MLB ~54%)`);
