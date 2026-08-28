/**
 * Headless balance run. `node scripts/balance.ts [games]`
 *
 * ⚠️ IT ROTATES THROUGH EVERY PAIRING, and it has to. It used to play the
 * default HOME/AWAY over and over — fine while the eight clubs were balanced to
 * within 4% of each other, and useless the moment they were not: that pairing
 * is now the strongest club against the weakest, so a "runs per team" read off
 * it describes a mismatch rather than the league. Run scripts/league.ts for who
 * WINS and this for what a game LOOKS like.
 */
import { simulateGame, boxLine } from '../src/game/sim.ts';
import { LEAGUE } from '../src/game/teams.ts';

/** Every ordered pair, so each club hosts and travels equally. */
const PAIRS = LEAGUE.flatMap((h) => LEAGUE.filter((a) => a !== h).map((a) => [h, a] as const));

const N = Number(process.argv[2] ?? 500);
let homeW = 0, awayW = 0, runs = 0, pitches = 0, extras = 0, walkoffs = 0, unfinished = 0;
let hits = 0, walks = 0, ks = 0, pas = 0, errs = 0, wp = 0, sacs = 0;
const scores: number[] = [];

for (let i = 0; i < N; i++) {
  const [home, away] = PAIRS[i % PAIRS.length]!;
  // Both rotations turn over, for the same reason league.ts does — the shape
  // of a plate appearance should be read off the arms a season actually sends
  // out, not off thirty aces.
  const { game, pitches: p, outcomes, errors, wilds, bunts } = simulateGame(
    i * 7919 + 13, 9, home, away,
    { home: { index: i % home.rotation.length }, away: { index: (i + 1) % away.rotation.length } },
  );
  if (!game.over) { unfinished++; continue; }
  if (game.winner === 'home') homeW++; else awayW++;
  const total = game.homeState.runs + game.awayState.runs;
  runs += total;
  scores.push(game.homeState.runs, game.awayState.runs);
  pitches += p;
  hits += game.homeState.hits + game.awayState.hits;
  walks += outcomes.walk + outcomes.hit_by_pitch;
  ks += outcomes.strikeout;
  errs += errors;
  wp += wilds;
  sacs += bunts;
  pas += outcomes.walk + outcomes.hit_by_pitch + outcomes.strikeout + outcomes.in_play;
  if (game.inning > 9) extras++;
  if (game.ending === 'walk_off') walkoffs++;
}

const played = N - unfinished;
console.log(`games            ${played} (${unfinished} unfinished)`);
console.log(`home / away wins ${homeW} / ${awayW}`);
console.log(`runs per team    ${(runs / played / 2).toFixed(2)}   (MLB ~4.4)`);
console.log(`pitches per game ${(pitches / played).toFixed(0)}   (MLB ~290)`);
console.log(`extra innings    ${((extras / played) * 100).toFixed(1)}%  (MLB ~9%)`);
console.log(`walk-offs        ${((walkoffs / played) * 100).toFixed(1)}%`);
console.log(`hits per team    ${(hits / played / 2).toFixed(2)}   (MLB ~8.5)`);
console.log(`walks per team   ${(walks / played / 2).toFixed(2)}   (MLB ~3.3)`);
console.log(`K per team       ${(ks / played / 2).toFixed(2)}   (MLB ~8.6)`);
console.log(`K rate           ${((ks / pas) * 100).toFixed(1)}%  (MLB ~22%)`);
console.log(`errors per team  ${(errs / played / 2).toFixed(2)}   (MLB ~0.55)`);
console.log(`wild pitches     ${(wp / played / 2).toFixed(2)}   (MLB ~0.46)`);
console.log(`bunts per team   ${(sacs / played / 2).toFixed(2)}   (MLB ~0.25)`);
console.log(`shutouts         ${((scores.filter((s) => s === 0).length / scores.length) * 100).toFixed(1)}%`);
console.log('');
console.log(boxLine(simulateGame(13).game));
