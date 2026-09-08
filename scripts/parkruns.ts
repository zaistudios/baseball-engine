/**
 * DID THE PARKS MOVE THE RUN ENVIRONMENT? `node scripts/parkruns.ts [games]`
 *
 * Plays the same schedule twice — once with every club's park and once with
 * the parks stripped off — and prints what changed.
 *
 * ⚠️ THIS IS THE CHECK NEUTRAL_SIZE EXISTS TO PASS, and scripts/parks.ts cannot
 * make it. That script says the thirty average to a MULTIPLIER of 1, which is
 * necessary and not sufficient: the runs-per-multiplier curve is not symmetric
 * (0.95 costs about four fifths of a run, 1.05 gains about a half), so thirty
 * parks centred on 1.0 still lose offence overall. The number that has to hold
 * is RUNS, and this is the only thing that measures it.
 */
import { simulateGame } from '../src/game/sim.ts';
import { LEAGUE, type Team } from '../src/game/teams.ts';

const N = Number(process.argv[2] ?? 1200);
const bare = (t: Team): Team => {
  const { park: _park, ...rest } = t;
  return rest;
};

const PAIRS = LEAGUE.flatMap((h) => LEAGUE.filter((a) => a !== h).map((a) => [h, a] as const));

function run(withParks: boolean) {
  let runs = 0,
    hr = 0,
    foulOuts = 0,
    ks = 0,
    hits = 0,
    pas = 0,
    games = 0;
  for (let i = 0; i < N; i++) {
    const [h, a] = PAIRS[i % PAIRS.length]!;
    const home = withParks ? h : bare(h);
    const away = withParks ? a : bare(a);
    const { game, outcomes, foulOuts: fo } = simulateGame(i * 7919 + 13, 9, home, away, {
      home: { index: i % home.rotation.length },
      away: { index: (i + 1) % away.rotation.length },
    });
    if (!game.over) continue;
    games++;
    runs += game.homeState.runs + game.awayState.runs;
    hits += game.homeState.hits + game.awayState.hits;
    ks += outcomes.strikeout;
    foulOuts += fo;
    pas += outcomes.walk + outcomes.hit_by_pitch + outcomes.strikeout + outcomes.in_play;
    for (const line of Object.values(game.stats.bat)) hr += line.hr;
  }
  return {
    runs: runs / games / 2,
    hr: hr / games,
    foulOutPct: (foulOuts / pas) * 100,
    kPct: (ks / pas) * 100,
    hits: hits / games / 2,
    games,
  };
}

const off = run(false);
const on = run(true);

const row = (k: string, a: number, b: number, dp = 3) =>
  console.log(
    `${k.padEnd(22)} ${a.toFixed(dp).padStart(8)} ${b.toFixed(dp).padStart(8)}   ` +
      `${(b - a >= 0 ? '+' : '')}${(b - a).toFixed(dp)}`,
  );

console.log(`${N} games each, every pairing, both rotations turning over\n`);
console.log(`${''.padEnd(22)} ${'no parks'.padStart(8)} ${'parks'.padStart(8)}   change`);
console.log('-'.repeat(52));
row('runs per club', off.runs, on.runs);
row('home runs per game', off.hr, on.hr);
row('hits per club', off.hits, on.hits);
row('strikeout %', off.kPct, on.kPct, 2);
row('foul-out % of PA', off.foulOutPct, on.foulOutPct, 2);
console.log('-'.repeat(52));
console.log(
  `\nruns moved ${(((on.runs - off.runs) / off.runs) * 100).toFixed(2)}% — ` +
    `under 1% is the parks redistributing rather than inflating.`,
);
