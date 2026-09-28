/**
 * PLAYS THAT DO NOT LOOK LIKE BASEBALL. `node scripts/sanity.ts [games]`
 *
 * balance.ts counts rates. This hunts the individual plays a playtest keeps
 * flagging, the ones a rate can hide: a man scoring from second on a ground
 * out, a runner moving up on a popup, a clean single that scores a man from
 * first. Each is counted, and the first few are printed with the base state
 * so they can be replayed in the head.
 *
 * Runs the same loop simulateGame() does, over playAiAtBat(), so the plays
 * are the ones a season actually produces.
 */
import { playAiAtBat, manageBullpen, manageBench, runTheBases, rollLoose, autoCaller } from '../src/game/sim.ts';
import { newGame, currentPitcher, fieldingSide, battingSide, fieldingStaff } from '../src/game/game.ts';
import { LEAGUE } from '../src/game/teams.ts';
import { makeRng } from '../src/core/rng.ts';
import { newRead, type Read } from '../src/game/ai.ts';
import { fatigue } from '../src/game/bullpen.ts';
import type { Bases } from '../src/core/inning.ts';
import type { PlayLog } from '../src/game/game.ts';
import type { AtBatLog } from '../src/game/sim.ts';

const N = Number(process.argv[2] ?? 300);
const PAIRS = LEAGUE.flatMap((h) => LEAGUE.filter((a) => a !== h).map((a) => [h, a] as const));

const counts: Record<string, number> = {};
const shown: Record<string, number> = {};
let inPlay = 0;

const bag = (b: Bases) => b.map((r) => (r ? 'X' : '-')).join('');
const flag = (name: string, log: PlayLog, ab: AtBatLog, outs: number) => {
  counts[name] = (counts[name] ?? 0) + 1;
  if ((shown[name] = (shown[name] ?? 0) + 1) <= 3) {
    console.log(
      `  ${name.padEnd(34)} ${ab.outcome ?? ab.kind} ${bag(log.before)}→${bag(log.after)} ` +
        `${outs} out, ${log.scored} scored${ab.error ? ', ERROR' : ''}${log.thrownOut ? ', thrown out' : ''}`,
    );
  }
};

for (let i = 0; i < N; i++) {
  const [home, away] = PAIRS[i % PAIRS.length]!;
  const rng = makeRng(i * 7919 + 13);
  let g = newGame(home, away, 9);
  const books: Record<'home' | 'away', Read> = { home: newRead(), away: newRead() };
  let guard = 0;
  while (!g.over && guard++ < 400) {
    g = manageBench(manageBullpen(g));
    g = runTheBases(g, rng);
    g = rollLoose(g, rng).game;
    if (g.over) break;
    const caller = autoCaller(currentPitcher(g), books[fieldingSide(g)], rng, fatigue(fieldingStaff(g)));
    const outs = g.outs;
    const { game, log, atBat } = playAiAtBat(g, caller, books[battingSide(g)], rng);
    g = game;
    if (atBat.kind !== 'in_play') continue;
    inPlay++;
    const o = atBat.outcome!;
    const b = log.before;
    // Where each man who was on base ended up: an index into `after`, or -1.
    const at = (r: (typeof b)[number]) => (r ? log.after.indexOf(r) : -2);
    const gone = (r: (typeof b)[number]) => r && at(r) === -1 && log.thrownOut?.runner !== r;
    if (atBat.error) continue;

    // More runs than there was a man on third to score them.
    if (o === 'ground_out' && log.scored > (b[2] ? 1 : 0)) flag('scored from 2nd on a ground out', log, atBat, outs);
    if ((o === 'popup' || o === 'foul_out') && b.some((r, k) => r && at(r) > k))
      flag('moved up on a popup / foul pop', log, atBat, outs);
    if (o === 'line_out' && !atBat.sacFly && b.some((r, k) => r && k < 2 && at(r) > k) && atBat.outSends === undefined)
      flag('moved up on a caught liner', log, atBat, outs);
    if (o === 'single' && log.scored > (b[2] ? 1 : 0) + (b[1] ? 1 : 0)) flag('scored from 1st on a single', log, atBat, outs);
    if (o === 'ground_out' && log.batterTo > 0 && !atBat.forceAt) flag('batter safe on a ground out', log, atBat, outs);
  }
}

console.log(`\n${N} games, ${inPlay} balls in play\n`);
for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(`${k.padEnd(36)} ${String(v).padStart(5)}   (${((1000 * v) / inPlay).toFixed(2)} per 1000 in play)`);
}
if (!Object.keys(counts).length) console.log('nothing flagged');
