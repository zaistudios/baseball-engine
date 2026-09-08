/**
 * DO THE THIRTY PARKS ACTUALLY PLAY DIFFERENTLY? `node scripts/parkplay.ts [games]`
 *
 * Plays the SAME two clubs in every building in the league and prints what each
 * one did to the ball. Same rosters, same seeds, same everything — the only
 * thing that changes down the table is the park.
 *
 * ⚠️ THIS IS THE SCRIPT THAT ANSWERS "DO PARKS WORK". scripts/parks.ts only
 * checks the arithmetic is centred, and scripts/parkruns.ts only checks the
 * league total did not move. Neither would notice a park that derived a factor
 * and then never reached the field — which is exactly what parkFoulAngle() did
 * for its first hour of existence, before anything threaded it into the swing.
 *
 * What to read:
 *
 *   runs / HR      should descend with SIZE. If they do not, the factor is not
 *                  reaching the bats.
 *   foul%          should descend with FOUL. If it does not, the bar is not
 *                  reaching caughtFoul().
 *   HR ft (min)    should descend with the fence. If it does not, the park is
 *                  not reaching plotBatted() and the replay is drawing a
 *                  400-foot bowl under a 302-foot sentence.
 */
import { simulateGame } from '../src/game/sim.ts';
import { LEAGUE_AS_WRITTEN, parkSize, parkPower, type Team, type Park } from '../src/game/teams.ts';
import { place } from '../src/game/placement.ts';
import { resolveSwingSeeded } from '../src/core/hit.ts';

const N = Number(process.argv[2] ?? 300);

const bare = (t: Team): Team => {
  const { park: _p, ...rest } = t;
  return rest;
};

/** Two ordinary clubs, stripped of their own buildings, to play everywhere. */
const HOME = bare(LEAGUE_AS_WRITTEN.find((t) => t.abbr === 'STL')!);
const AWAY = bare(LEAGUE_AS_WRITTEN.find((t) => t.abbr === 'KCF')!);

/** A fixed population of batted balls, for the distances a game rarely reaches. */
const PITCHES = ['fastball', 'curveball', 'slider', 'changeup', 'sinker'] as const;
const BALLS = (() => {
  const out = [];
  for (let i = 0; i < 30000; i++) {
    const h = resolveSwingSeeded(
      {
        offsetMs: ((i % 25) - 12) * 2,
        pitchType: PITCHES[i % PITCHES.length]!,
        stats: { power: 0.8 + ((i * 7) % 11) * 0.09, contact: 1.1 },
        isPowerSwing: i % 3 === 0,
      },
      i * 7919 + 17,
    );
    if (h.outcome === 'home_run') out.push(h);
  }
  return out;
})();

function playIn(park: Park | undefined) {
  const home: Team = park ? { ...HOME, park } : HOME;
  let runs = 0,
    hr = 0,
    foulOuts = 0,
    pas = 0,
    doubles = 0;
  for (let s = 1; s <= N; s++) {
    const { game, outcomes, foulOuts: fo } = simulateGame(s * 31 + 7, 9, home, AWAY);
    runs += game.homeState.runs + game.awayState.runs;
    foulOuts += fo;
    pas += outcomes.walk + outcomes.hit_by_pitch + outcomes.strikeout + outcomes.in_play;
    for (const line of Object.values(game.stats.bat)) {
      hr += line.hr;
      doubles += line.d;
    }
  }
  const dists = BALLS.map((h) => place(h, park).distFt);
  return {
    runs: runs / N / 2,
    hr: hr / N,
    doubles: doubles / N,
    foulPct: (foulOuts / pas) * 100,
    hrMin: Math.min(...dists),
    hrMean: dists.reduce((a, b) => a + b, 0) / dists.length,
  };
}

const rows = LEAGUE_AS_WRITTEN.map((t) => ({ abbr: t.abbr, park: t.park! })).sort(
  (a, b) => parkSize(a.park) - parkSize(b.park),
);

console.log(`${N} games in each building — same two clubs, same seeds\n`);
console.log(
  'club  park                  size  factor  foul   runs    HR    2B   foul%   HR ft (min/mean)',
);
console.log('-'.repeat(94));

const base = playIn(undefined);
for (const { abbr, park } of rows) {
  const r = playIn(park);
  console.log(
    `${abbr.padEnd(5)} ${park.name.padEnd(21)} ${parkSize(park).toFixed(0)}  ` +
      `${parkPower(park).toFixed(3)}  ${park.foul.toFixed(2)}  ` +
      `${r.runs.toFixed(2).padStart(5)}  ${r.hr.toFixed(2).padStart(4)}  ` +
      `${r.doubles.toFixed(2).padStart(4)}  ${r.foulPct.toFixed(2).padStart(5)}   ` +
      `${r.hrMin.toFixed(0).padStart(3)} / ${r.hrMean.toFixed(0)}`,
  );
}
console.log('-'.repeat(94));
console.log(
  `${'—'.padEnd(5)} ${'no park (400ft bowl)'.padEnd(21)} ${'400'}  ${'1.000'}  ${'1.00'}  ` +
    `${base.runs.toFixed(2).padStart(5)}  ${base.hr.toFixed(2).padStart(4)}  ` +
    `${base.doubles.toFixed(2).padStart(4)}  ${base.foulPct.toFixed(2).padStart(5)}   ` +
    `${base.hrMin.toFixed(0).padStart(3)} / ${base.hrMean.toFixed(0)}`,
);

/** Rank correlation, so "descends together" is a number and not an impression. */
function spearman(xs: number[], ys: number[]): number {
  const rank = (v: number[]) => {
    const idx = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
    const r = new Array<number>(v.length);
    idx.forEach(([, i], k) => (r[i] = k));
    return r;
  };
  const rx = rank(xs);
  const ry = rank(ys);
  const n = xs.length;
  const mx = (n - 1) / 2;
  let num = 0,
    dx = 0,
    dy = 0;
  for (let i = 0; i < n; i++) {
    const a = rx[i]! - mx;
    const b = ry[i]! - mx;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  return num / Math.sqrt(dx * dy);
}

const played = rows.map((r) => ({ ...r, ...playIn(r.park) }));
console.log('\nrank correlation against the layout — each wants to be strongly negative:');
console.log(
  `  size  ↔ runs     ${spearman(played.map((p) => parkSize(p.park)), played.map((p) => p.runs)).toFixed(3)}`,
);
console.log(
  `  size  ↔ home runs${spearman(played.map((p) => parkSize(p.park)), played.map((p) => p.hr)).toFixed(3).padStart(7)}`,
);
console.log(
  `  fence ↔ cheapest HR${spearman(
    played.map((p) => (p.park.left + p.park.center + p.park.right) / 3),
    played.map((p) => p.hrMin),
  ).toFixed(3).padStart(6)}   (wants POSITIVE — deeper fence, dearer homer)`,
);
console.log(
  `  foul  ↔ foul-out %${spearman(played.map((p) => p.park.foul), played.map((p) => p.foulPct)).toFixed(3).padStart(7)}   (wants POSITIVE — more room, more caught)`,
);
