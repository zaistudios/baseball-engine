/**
 * Split the eighteen into two matched nines by SNAKE DRAFT, not by search.
 *
 * A random search over partitions overfits: scored on a small sample it picks
 * the extreme of the noise, and the win rate regresses the moment you confirm
 * it on a bigger one. A snake draft cannot overfit — it is deterministic and
 * it equalises by construction.
 */
import { HOME, AWAY, type Team } from '../src/game/teams.ts';
import { newGame, type GameState, currentPitcher, battingSide, fieldingSide, fieldingStaff } from '../src/game/game.ts';
import { fatigue } from '../src/game/bullpen.ts';
import { makeRng } from '../src/core/rng.ts';
import { newRead } from '../src/game/ai.ts';
import { playAiAtBat, autoCaller, manageBullpen, runTheBases } from '../src/game/sim.ts';
import { gloveOf } from '../src/game/defense.ts';
import type { Player } from '../src/core/roster.ts';

const ALL = [...HOME.lineup, ...AWAY.lineup];

/** One number for how much a player is worth to a team, all four stats in it. */
const value = (p: Player) =>
  p.contact * 1.6 + p.power * 0.9 + p.speed * 0.8 + p.clutch * 0.4 + gloveOf(p) * 0.6;

function snake(all: readonly Player[]): [Player[], Player[]] {
  const ranked = [...all].sort((a, b) => value(b) - value(a));
  const a: Player[] = [], b: Player[] = [];
  ranked.forEach((p, i) => {
    // A B B A A B B A ... — the pattern that equalises serial picks.
    (Math.floor(i / 2) % 2 === 0 ? (i % 2 === 0 ? a : b) : (i % 2 === 0 ? b : a)).push(p);
  });
  return [a, b];
}

/** Legs and contact up top, the two biggest bats third and fourth. */
function order(nine: Player[]): Player[] {
  const s = [...nine].sort((x, y) => (y.contact + y.speed * 0.5) - (x.contact + x.speed * 0.5));
  const bats = [...s].sort((x, y) => y.power - x.power);
  const top2 = s.slice(0, 2);
  const heart = bats.filter((p) => !top2.includes(p)).slice(0, 2);
  const rest = s.filter((p) => !top2.includes(p) && !heart.includes(p));
  return [...top2, ...heart, ...rest];
}

function play(home: Team, away: Team, n: number) {
  let hw = 0, hr = 0, ar = 0;
  for (let s = 0; s < n; s++) {
    const rng = makeRng(s * 7919 + 13);
    let g: GameState = newGame(home, away, 9);
    const books: any = { home: newRead(), away: newRead() };
    let halves = 0, last = '1top';
    while (!g.over && halves < 60) {
      g = manageBullpen(g);
      g = runTheBases(g, rng);
      if (g.over) break;
      g = playAiAtBat(g, autoCaller(currentPitcher(g), books[fieldingSide(g)], rng, fatigue(fieldingStaff(g))), books[battingSide(g)], rng).game;
      const cur = `${g.inning}${g.half}`;
      if (cur !== last) { halves++; last = cur; }
    }
    if (g.winner === 'home') hw++;
    hr += g.homeState.runs; ar += g.awayState.runs;
  }
  return { pct: hw / n, hr: hr / n, ar: ar / n };
}

const [x, y] = snake(ALL);
for (const [hl, al] of [[x, y], [y, x]] as const) {
  const home = { ...HOME, lineup: order(hl) };
  const away = { ...AWAY, lineup: order(al) };
  const r = play(home, away, 600);
  const avg = (l: Player[], f: (p: Player) => number) => (l.reduce((s, p) => s + f(p), 0) / 9).toFixed(2);
  console.log(`home ${(r.pct * 100).toFixed(0)}%  runs H${r.hr.toFixed(2)} A${r.ar.toFixed(2)}`);
  console.log(`  HOME ${JSON.stringify(home.lineup.map((p) => p.id))}`);
  console.log(`  AWAY ${JSON.stringify(away.lineup.map((p) => p.id))}`);
  console.log(`  HOME val ${avg(hl, value)} glove ${avg(hl, gloveOf)} | AWAY val ${avg(al, value)} glove ${avg(al, gloveOf)}`);
}
