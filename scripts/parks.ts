/**
 * WHAT EVERY PARK IS WORTH. `node scripts/parks.ts`
 *
 * Prints each of the thirty buildings — its fences, its size, the multiplier
 * that size derives, and the foul-pop bar it sets — then the league's own mean.
 *
 * ⚠️ RUN THIS AFTER TOUCHING ANY FENCE. NEUTRAL_SIZE in teams.ts is what keeps
 * the thirty averaging to a multiplier of 1, which is what keeps parks from
 * moving the run environment the whole engine was tuned around. Cut one fence
 * and the mean moves; this is what says by how much.
 *
 * The number to read is MEAN FACTOR at the bottom. It wants to be 1.000. If it
 * is not, move NEUTRAL_SIZE to the mean SIZE printed beside it.
 *
 * ponytail: arithmetic over the thirty rows, no simulation. What a park is
 * worth in RUNS is scripts/balance.ts and scripts/league.ts; this is only
 * whether the derivation is centred.
 */
import {
  LEAGUE_AS_WRITTEN,
  PARKS,
  parkSize,
  parkPower,
  parkFoulAngle,
  wallAt,
  NEUTRAL_SIZE,
  type Park,
} from '../src/game/teams.ts';

const rows = LEAGUE_AS_WRITTEN.map((t) => ({ abbr: t.abbr, park: t.park! }));

console.log(
  'club  park'.padEnd(28) +
    'LF   CF   RF   foul   size    factor   pop°   gap(LCF)',
);
console.log('-'.repeat(84));

const sorted = [...rows].sort((a, b) => parkSize(a.park) - parkSize(b.park));
for (const { abbr, park } of sorted) {
  const size = parkSize(park);
  const f = parkPower(park);
  console.log(
    `${abbr.padEnd(5)} ${park.name.padEnd(21)} ` +
      `${String(park.left).padStart(3)}  ${String(park.center).padStart(3)}  ` +
      `${String(park.right).padStart(3)}  ${park.foul.toFixed(2)}  ` +
      `${size.toFixed(1).padStart(6)}  ${f.toFixed(4).padStart(7)}  ` +
      `${parkFoulAngle(park).toFixed(1).padStart(5)}  ${wallAt(-22, park).toFixed(0).padStart(4)}`,
  );
}

const sizes = rows.map((r) => parkSize(r.park));
const factors = rows.map((r) => parkPower(r.park));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

console.log('-'.repeat(84));
console.log(`clubs            ${rows.length}`);
console.log(`distinct parks   ${new Set(rows.map((r) => r.park.name)).size}`);
console.log(`NEUTRAL_SIZE     ${NEUTRAL_SIZE}`);
console.log(`mean SIZE        ${mean(sizes).toFixed(2)}   <- set NEUTRAL_SIZE here for a centred factor`);
console.log(`MEAN FACTOR      ${mean(factors).toFixed(4)}   <- wants 1.0000`);
console.log(
  `factor range     ${Math.min(...factors).toFixed(4)} … ${Math.max(...factors).toFixed(4)}`,
);
console.log(
  `foul-pop range   ${Math.min(...rows.map((r) => parkFoulAngle(r.park))).toFixed(1)}° … ` +
    `${Math.max(...rows.map((r) => parkFoulAngle(r.park))).toFixed(1)}°`,
);
console.log(
  `mean foul        ${mean(rows.map((r) => r.park.foul)).toFixed(4)}   <- wants 1.0000 too`,
);

// The shape of one park across the outfield, so an eased wall can be eyeballed.
const show: Park = PARKS.NEM;
console.log(`\n${show.name} across the outfield (${show.left}/${show.center}/${show.right}):`);
console.log(
  [-45, -34, -22, -11, 0, 11, 22, 34, 45]
    .map((d) => `${d > 0 ? '+' : ''}${d}° ${wallAt(d, show).toFixed(0)}ft`)
    .join('   '),
);
