/** Pick two three-man staffs that are fair to each other. Target 54% home. */
import { newGame, type GameState, currentPitcher, battingSide, fieldingSide, stateOf } from '../src/game/game.ts';
import { HOME, AWAY, type Team } from '../src/game/teams.ts';
import { PITCHERS, type Pitcher } from '../src/core/pitcher.ts';
import { makeRng } from '../src/core/rng.ts';
import { newRead } from '../src/game/ai.ts';
import { playAiAtBat, autoCaller, manageBullpen } from '../src/game/sim.ts';
import { fieldingStaff } from '../src/game/game.ts';
import { fatigue } from '../src/game/bullpen.ts';

const ARMS: Pitcher[] = ['holdouts','splice','foundry'].flatMap((d) => [...PITCHERS[d]!]);

function play(home: Team, away: Team, n: number) {
  let hw = 0, hr = 0, ar = 0;
  for (let s = 0; s < n; s++) {
    const rng = makeRng(s * 7919 + 13);
    let g: GameState = newGame(home, away, 9);
    const books: any = { home: newRead(), away: newRead() };
    let halves = 0, last = '1top';
    while (!g.over && halves < 60) {
      g = manageBullpen(g);
      const caller = autoCaller(currentPitcher(g), books[fieldingSide(g)], rng, fatigue(fieldingStaff(g)));
      g = playAiAtBat(g, caller, books[battingSide(g)], rng).game;
      const cur = `${g.inning}${g.half}`;
      if (cur !== last) { halves++; last = cur; }
    }
    if (g.winner === 'home') hw++;
    hr += g.homeState.runs; ar += g.awayState.runs;
  }
  return { pct: hw / n, hr: hr / n, ar: ar / n };
}

const rng = makeRng(7);
let best: any = null;
for (let trial = 0; trial < 260; trial++) {
  const pool = [...ARMS];
  for (let i = pool.length - 1; i > 0; i--) { const j = rng.int(0, i); [pool[i], pool[j]] = [pool[j]!, pool[i]!]; }
  const h = pool.slice(0, 3), a = pool.slice(3, 6);
  const { pct, hr, ar } = play({ ...HOME, rotation: h }, { ...AWAY, rotation: a }, 50);
  const score = Math.abs(pct - 0.54) + Math.abs((hr + ar) / 2 - 4.35) * 0.06;
  if (!best || score < best.score) best = { score, h, a };
}
const final = play({ ...HOME, rotation: best.h }, { ...AWAY, rotation: best.a }, 500);
console.log(`home ${(final.pct*100).toFixed(0)}%  runs H${final.hr.toFixed(2)} A${final.ar.toFixed(2)}`);
console.log('HOME', best.h.map((p: Pitcher) => `${p.name} (z${p.zoneRate} ${p.signature})`).join(' | '));
console.log('AWAY', best.a.map((p: Pitcher) => `${p.name} (z${p.zoneRate} ${p.signature})`).join(' | '));
