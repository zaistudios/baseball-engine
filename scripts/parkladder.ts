/**
 * DID THE PARKS BREAK THE LADDER? `node scripts/parkladder.ts [games per matchup]`
 *
 * Plays the whole round robin twice — parks on, parks stripped — and prints
 * every club's win% both ways with the difference, then the two things that
 * actually matter.
 *
 * ⚠️ WHAT A PARK IS ALLOWED TO DO. atPark() gives the building to BOTH lineups
 * and a club plays half its schedule away, so a park is a scoreboard rather
 * than an edge — but it is not neutral for everybody, and it is not supposed to
 * be. A bandbox is worth more to a club whose bats are better than its arms and
 * costs a club whose arms are better than its bats. That is the feature.
 *
 * ⚠️ WHAT IT IS NOT ALLOWED TO DO IS DECIDE THE LADDER. teams.ts carries a
 * deliberate talent ladder and scripts/league.ts's own header says the check is
 * whether win% and roster value descend TOGETHER. So the number to read at the
 * bottom is the correlation between roster value and win rate, before and
 * after. If parks knocked it down, the fences are doing more than the rosters
 * are, and the slope is too steep.
 */
import { simulateGame } from '../src/game/sim.ts';
import { LEAGUE, type Team } from '../src/game/teams.ts';
import { clubValue } from '../src/game/value.ts';

const N = Number(process.argv[2] ?? 20);

const bare = (t: Team): Team => {
  const { park: _park, ...rest } = t;
  return rest;
};

function roundRobin(withParks: boolean): Record<string, number> {
  const wins: Record<string, number> = {};
  const games: Record<string, number> = {};
  for (const t of LEAGUE) {
    wins[t.abbr] = 0;
    games[t.abbr] = 0;
  }
  for (let i = 0; i < LEAGUE.length; i++) {
    for (let j = 0; j < LEAGUE.length; j++) {
      if (i === j) continue;
      const h = LEAGUE[i]!;
      const a = LEAGUE[j]!;
      const home = withParks ? h : bare(h);
      const away = withParks ? a : bare(a);
      for (let s = 0; s < N; s++) {
        const { game } = simulateGame((i * 31 + j) * 7919 + s * 13 + 1, 9, home, away, {
          home: { index: s % home.rotation.length },
          away: { index: (s + 1) % away.rotation.length },
        });
        if (!game.over) continue;
        games[h.abbr]!++;
        games[a.abbr]!++;
        if (game.winner === 'home') wins[h.abbr]!++;
        else wins[a.abbr]!++;
      }
    }
  }
  const pct: Record<string, number> = {};
  for (const t of LEAGUE) pct[t.abbr] = (wins[t.abbr]! / games[t.abbr]!) * 100;
  return pct;
}

/** Pearson correlation, which is the whole point of the script. */
function corr(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0,
    dx = 0,
    dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i]! - mx;
    const b = ys[i]! - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  return num / Math.sqrt(dx * dy);
}

const off = roundRobin(false);
const on = roundRobin(true);

const values = LEAGUE.map((t) => clubValue(t));
const rows = LEAGUE.map((t, i) => ({
  abbr: t.abbr,
  park: t.park!.name,
  value: values[i]!,
  off: off[t.abbr]!,
  on: on[t.abbr]!,
})).sort((a, b) => b.value - a.value);

console.log(`${N} games per matchup, both ways\n`);
console.log('club  park                   value   no parks   parks    change');
console.log('-'.repeat(66));
for (const r of rows) {
  const d = r.on - r.off;
  console.log(
    `${r.abbr.padEnd(5)} ${r.park.padEnd(21)} ${r.value.toFixed(2).padStart(5)}  ` +
      `${r.off.toFixed(1).padStart(8)}%  ${r.on.toFixed(1).padStart(6)}%  ` +
      `${(d >= 0 ? '+' : '')}${d.toFixed(1).padStart(5)}`,
  );
}

const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
const offPct = rows.map((r) => r.off);
const onPct = rows.map((r) => r.on);
const vals = rows.map((r) => r.value);

console.log('-'.repeat(66));
console.log(`                              no parks     parks`);
console.log(
  `win% spread                 ${spread(offPct).toFixed(1).padStart(6)}   ${spread(onPct).toFixed(1).padStart(7)}`,
);
console.log(
  `value↔win% correlation      ${corr(vals, offPct).toFixed(3).padStart(6)}   ${corr(vals, onPct).toFixed(3).padStart(7)}   <- the ladder`,
);
console.log(
  `biggest single club move    ${Math.max(...rows.map((r) => Math.abs(r.on - r.off))).toFixed(1)} points`,
);
console.log(
  `mean |move|                 ${(rows.reduce((a, r) => a + Math.abs(r.on - r.off), 0) / rows.length).toFixed(2)} points`,
);
