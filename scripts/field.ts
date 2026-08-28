/**
 * Steal and error rates, and where the balance went.
 *
 * ⚠️ THIS SCRIPT HAND-ROLLS THE GAME LOOP instead of calling simulateGame(),
 * so that it can watch the steal decision from the outside — and that means it
 * DRIFTS every time the real loop in sim.ts grows a step. It already did once:
 * identity.ts gave the batting club a `running` knob, sim.ts passes it, and
 * this file did not, so it reported the baseline attempt rate for a league
 * that no longer plays at the baseline. The number it exists to produce is the
 * one ATTEMPT_RATE is tuned against, which is exactly the number you cannot
 * afford to have quietly stale.
 *
 * If it drifts again, the fix is to make sim.ts expose what this needs rather
 * than to copy another step across.
 */
import { newGame, type GameState, currentPitcher, battingSide, fieldingSide, fieldingAlignment, fieldingStaff } from '../src/game/game.ts';
import { HOME, AWAY } from '../src/game/teams.ts';
import { makeRng } from '../src/core/rng.ts';
import { newRead } from '../src/game/ai.ts';
import { playAiAtBat, autoCaller, manageBullpen } from '../src/game/sim.ts';
import { fatigue } from '../src/game/bullpen.ts';
import { aiShouldSend, sendRunner, stealOpportunity } from '../src/game/running.ts';
import { assignPositions, gloveOf, describeAlignment, catcherArm } from '../src/game/defense.ts';
import { battingTeam } from '../src/game/game.ts';
import { knob } from '../src/game/identity.ts';

const N = 300;
let attempts = 0, safe = 0, errors = 0, chances = 0, dps = 0, homeW = 0;
for (let s = 0; s < N; s++) {
  const rng = makeRng(s * 7919 + 13);
  let g: GameState = newGame(HOME, AWAY, 9);
  const books: any = { home: newRead(), away: newRead() };
  let halves = 0, last = '1top';
  while (!g.over && halves < 60) {
    g = manageBullpen(g);
    const def = fieldingAlignment(g);
    // The batting club's running knob, exactly as sim.ts passes it.
    if (stealOpportunity(g) && aiShouldSend(g, def, rng, knob(battingTeam(g).identity, 'running'))) {
      const before = g.outs + g.homeState.runs + g.awayState.runs;
      const r = sendRunner(g, def, rng);
      if (r) { attempts++; if (r.safe) safe++; g = r.game; }
    }
    if (g.over) break;
    const caller = autoCaller(currentPitcher(g), books[fieldingSide(g)], rng, fatigue(fieldingStaff(g)));
    const out = playAiAtBat(g, caller, books[battingSide(g)], rng);
    if (out.log && (out as any).atBat.kind === 'in_play') chances++;
    g = out.game;
    const cur = `${g.inning}${g.half}`;
    if (cur !== last) { halves++; last = cur; }
  }
  if (g.winner === 'home') homeW++;
}
console.log(`steal attempts / game  ${(attempts / N).toFixed(2)}   (MLB ~0.9 per team, so ~1.8)`);
console.log(`steal success          ${((safe / Math.max(1,attempts)) * 100).toFixed(0)}%   (MLB ~75%)`);
console.log(`home win               ${((homeW / N) * 100).toFixed(0)}%`);
console.log('');
for (const [label, t] of [['HOME', HOME], ['AWAY', AWAY]] as const) {
  const a = assignPositions(t.lineup);
  const avgGlove = (t.lineup.reduce((x, p) => x + gloveOf(p), 0) / 9).toFixed(3);
  const avgSpeed = (t.lineup.reduce((x, p) => x + p.speed, 0) / 9).toFixed(2);
  console.log(`${label} glove ${avgGlove}  catcher ${catcherArm(a).toFixed(2)}  speed ${avgSpeed}`);
  console.log(`  ${describeAlignment(a)}`);
}
