/**
 * IS THE 26-MAN ROSTER HONEST? `node scripts/staff.ts [seasons]`
 *
 * The companion to scripts/league.ts, which asks whether the LEAGUE is fair.
 * This asks the four questions the depth in src/game/depth.ts can quietly get
 * wrong, none of which show up in a win column:
 *
 *   1. SIZE AND NAMES.    Twenty-six men, and no two of them the same person.
 *                         The rest ledger is keyed by name; a collision is two
 *                         pitchers sharing one arm's fatigue for a season.
 *   2. THE PECKING ORDER. No generated arm out-pitches a man teams.ts wrote,
 *                         and the ninth inning of a one-run game goes to one of
 *                         the three the club was built around.
 *   3. THE LADDER.        Eight more men per club must not re-rank the league —
 *                         see value.ts, which the pre-game card reads.
 *   4. USE.               A thirteenth pitcher nobody ever warms up is not
 *                         depth, it is a list. Plays real seasons and counts.
 *
 * ponytail: it prints, it does not assert. depth.test.ts holds the invariants;
 * this is the instrument you re-run after moving a role slope, to see WHERE the
 * numbers went rather than just that something broke.
 */
import { LEAGUE, LEAGUE_AS_WRITTEN, type Team } from '../src/game/teams.ts';
import { clubValue, stuffValue } from '../src/game/value.ts';
import { pickReliever } from '../src/game/rotation.ts';
import { newSeason, playDay, seasonOver } from '../src/game/franchise.ts';
import {
  rosterSize,
  ROSTER_SIZE,
  ROTATION_SIZE,
  BULLPEN_SIZE,
  BENCH_SIZE,
} from '../src/game/depth.ts';

/** The written arms — the ones teams.ts casts by hand — and the generated rest. */
const writtenRot = (t: Team) => t.rotation.slice(0, ROTATION_SIZE - 2);
const depthRot = (t: Team) => t.rotation.slice(ROTATION_SIZE - 2);
const writtenPen = (t: Team) => t.bullpen.slice(0, BULLPEN_SIZE - 5);
const depthPen = (t: Team) => t.bullpen.slice(BULLPEN_SIZE - 5);

// ------------------------------------------------------ 1. size and names

const names = new Map<string, string>();
let dupes = 0;
let wrongSize = 0;
for (const t of LEAGUE) {
  if (rosterSize(t) !== ROSTER_SIZE) {
    wrongSize++;
    console.log(`SIZE ${t.abbr} dresses ${rosterSize(t)}, not ${ROSTER_SIZE}`);
  }
  const all = [
    ...t.lineup.map((p) => p.name),
    ...(t.bench ?? []).map((p) => p.name),
    ...t.rotation.map((a) => a.name),
    ...t.bullpen.map((a) => a.name),
  ];
  for (const n of all) {
    if (names.has(n)) {
      dupes++;
      console.log(`DUPE "${n}" on both ${names.get(n)} and ${t.abbr}`);
    }
    names.set(n, t.abbr);
  }
}
console.log(
  `roster    ${LEAGUE.length} clubs x ${ROSTER_SIZE} = ${names.size} men` +
    `  (${LEAGUE.length * (ROTATION_SIZE + BULLPEN_SIZE)} arms, ` +
    `${LEAGUE.length * (9 + BENCH_SIZE)} bats)` +
    `  ${wrongSize} wrong size, ${dupes} name clashes`,
);

// -------------------------------------------------- 2. the pecking order

let outRated = 0;
let stolenSave = 0;
for (const t of LEAGUE) {
  const best = (xs: readonly { name: string }[]) =>
    Math.max(...(xs as never as Parameters<typeof stuffValue>[0][]).map(stuffValue));
  if (best(depthRot(t)) >= best(writtenRot(t)) || best(depthPen(t)) >= best(writtenPen(t))) {
    outRated++;
    console.log(`OUT-RATED ${t.abbr}: a generated arm has better stuff than a written one`);
  }
  const at = pickReliever(t.bullpen, { inning: 9, deficit: 1 });
  if (at >= BULLPEN_SIZE - 5) {
    stolenSave++;
    console.log(`SAVE ${t.abbr} sends ${t.bullpen[at]!.name}, who is a generated arm`);
  }
}
console.log(
  `pecking   ${outRated}/${LEAGUE.length} clubs out-rated, ` +
    `${stolenSave}/${LEAGUE.length} ninth innings taken by the depth`,
);

// ----------------------------------------------------------- 3. the ladder

const thin = (t: Team): Team => ({
  ...t,
  rotation: writtenRot(t),
  bullpen: writtenPen(t),
  bench: (t.bench ?? []).slice(0, BENCH_SIZE - 1),
});
const rankOf = (list: readonly Team[]) =>
  new Map([...list].sort((a, b) => clubValue(b) - clubValue(a)).map((t, i) => [t.abbr, i + 1]));
const before = rankOf(LEAGUE_AS_WRITTEN.map(thin));
const after = rankOf(LEAGUE_AS_WRITTEN);
let moved = 0;
let worst = 0;
for (const t of LEAGUE_AS_WRITTEN) {
  const d = after.get(t.abbr)! - before.get(t.abbr)!;
  if (d !== 0) moved++;
  worst = Math.max(worst, Math.abs(d));
}
console.log(`ladder    ${moved}/${LEAGUE.length} clubs changed rank, worst move ${worst}`);

// -------------------------------------------------------------- 4. the use

const SEASONS = Number(process.argv[2] ?? 5);
const spRan = new Array(ROTATION_SIZE).fill(0);
const rpRan = new Array(BULLPEN_SIZE).fill(0);
let clubSeasons = 0;
for (let i = 0; i < SEASONS; i++) {
  let s = newSeason('---', 11 + i * 11);
  while (!seasonOver(s)) s = playDay(s);
  for (const t of LEAGUE) {
    clubSeasons++;
    const worked = new Set(Object.keys(s.rest?.[t.abbr] ?? {}));
    t.rotation.forEach((a, k) => { if (worked.has(a.name)) spRan[k]++; });
    t.bullpen.forEach((a, k) => { if (worked.has(a.name)) rpRan[k]++; });
  }
}
const pct = (n: number) => `${Math.round((n / clubSeasons) * 100)}%`;
console.log(
  `\n${SEASONS} seasons, ${clubSeasons} club-seasons — how often each slot works at all\n` +
    `  rotation  ${spRan.map(pct).join('  ')}\n` +
    `  bullpen   ${rpRan.map(pct).join('  ')}\n` +
    `  averages  ${(spRan.reduce((a, b) => a + b, 0) / clubSeasons).toFixed(2)} of ` +
    `${ROTATION_SIZE} starters, ` +
    `${(rpRan.reduce((a, b) => a + b, 0) / clubSeasons).toFixed(2)} of ${BULLPEN_SIZE} relievers`,
);
