/**
 * WHAT THE SCENES COST, AND WHAT THEY SAY. `node scripts/scenes.ts [games]`
 *
 * Plays real games, builds the scene every ball in play would have got, and
 * prints two things: how much time the beats add to a nine-inning game, and how
 * often each caption actually fires.
 *
 * ⚠️ THIS IS THE BILL. overhead.ts's note on FOUL_HOLD_MS is the standing
 * warning — the mode's premise is that a season fits in an afternoon, and half
 * a second on every ball in play is how that quietly stops being true. A
 * nine-inning game has roughly 55 balls in play in it, so a mean of 100ms is
 * about five and a half seconds a game and a mean of 400ms is over twenty.
 *
 * ⚠️ AND IT IS THE OTHER HALF OF THE CHECK: a tier nothing ever reaches is a
 * tier that does not exist. If `huge` fires on one ball in ten thousand, the
 * grand slam beat is dead code with a comment on it. Read the FIRES column.
 */
import { simulateGame } from '../src/game/sim.ts';
import { LEAGUE, type Team } from '../src/game/teams.ts';
import { newGame } from '../src/game/game.ts';
import { resolveSwingSeeded } from '../src/core/hit.ts';
import { place, stretch, withPlacement } from '../src/game/placement.ts';
import {
  sceneFor,
  situationOf,
  isHighLeverage,
  type Scene,
  type Tier,
} from '../src/game/scene.ts';
import type { Outcome } from '../src/core/hitTables.ts';

const N = Number(process.argv[2] ?? 200);

/**
 * ⚠️ THE OUTCOME MIX COMES FROM THE BOX SCORE AND ONLY THE PLACEMENT IS
 * MODELLED, and getting that backwards is how the first cut of this script
 * reported a bill twice the real one. Generating swings and counting what they
 * turned into samples a population nobody plays: a fixed power rating and a
 * power swing every third pitch produced home runs on 11.4% of balls in play
 * against the 4.7% a real game has, so every beat the home run earns was
 * counted more than twice as often as it happens.
 *
 * So the counts are read off `game.stats` — real hits, real doubles, real home
 * runs, from games the engine actually played — and the swing pool below is
 * used only to answer "what did a double of this kind look like", which is a
 * question about geometry and not about how often anything happens.
 */
const PITCHES = ['fastball', 'curveball', 'slider', 'changeup', 'sinker'] as const;

/** Placements to draw from, bucketed by what the outcome turned out to be. */
const POOL = new Map<Outcome, { p: ReturnType<typeof place>; ev: number }[]>();
for (let k = 0; k < 30000; k++) {
  const hit = resolveSwingSeeded(
    {
      offsetMs: ((k % 25) - 12) * 2,
      pitchType: PITCHES[k % PITCHES.length]!,
      stats: { power: 0.75 + ((k * 7) % 13) * 0.06, contact: 1.1 },
      isPowerSwing: k % 4 === 0,
    },
    k * 7919 + 17,
  );
  if (hit.outcome === 'strikeout') continue;
  const p = place(hit, LEAGUE[k % LEAGUE.length]!.park);
  if (p.zone === 'foul-ground') continue;
  const outcome = stretch(hit.outcome, p) as Outcome;
  const bucket = POOL.get(outcome) ?? [];
  bucket.push({ p, ev: hit.exitVelocity });
  POOL.set(outcome, bucket);
}

/** One placement of the right kind, or null when the pool has none. */
const draw = (outcome: Outcome, n: number) => {
  const bucket = POOL.get(outcome);
  if (!bucket || bucket.length === 0) return null;
  return bucket[n % bucket.length]!;
};

const tiers: Record<Tier, number> = { routine: 0, solid: 0, big: 0, huge: 0 };
const titles = new Map<string, number>();
let totalHold = 0;
let balls = 0;
let leveraged = 0;
let highSpots = 0;
let plateAppearances = 0;

for (let i = 0; i < N; i++) {
  const home = LEAGUE[i % LEAGUE.length]!;
  const away: Team = LEAGUE[(i + 9) % LEAGUE.length]!;
  if (home === away) continue;

  // A real game, for the SITUATIONS — the inning, the score and the men on.
  const { game, outcomes } = simulateGame(i * 7919 + 13, 9, home, away);
  plateAppearances += outcomes.walk + outcomes.hit_by_pitch + outcomes.strikeout + outcomes.in_play;

  // WHAT THIS GAME ACTUALLY PRODUCED, off the book both clubs share.
  let hr = 0;
  let dbl = 0;
  let tpl = 0;
  let hits = 0;
  for (const line of Object.values(game.stats.bat)) {
    hr += line.hr;
    dbl += line.d;
    tpl += line.t;
    hits += line.h;
  }
  const singles = Math.max(0, hits - dbl - tpl - hr);
  const outsInPlay = Math.max(0, outcomes.in_play - hits);
  // Balls in play, in the order the book says they happened.
  const played: Outcome[] = [
    ...Array<Outcome>(hr).fill('home_run'),
    ...Array<Outcome>(tpl).fill('triple'),
    ...Array<Outcome>(dbl).fill('double'),
    ...Array<Outcome>(singles).fill('single'),
    // Outs in play, split roughly the way the engine splits them.
    ...Array<Outcome>(Math.round(outsInPlay * 0.47)).fill('ground_out'),
    ...Array<Outcome>(Math.round(outsInPlay * 0.3)).fill('line_out'),
    ...Array<Outcome>(Math.round(outsInPlay * 0.23)).fill('popup'),
  ];

  const g0 = newGame(home, away);
  for (let k = 0; k < played.length; k++) {
    const outcome = played[k]!;
    const drawn = draw(outcome, i * 31 + k);
    if (!drawn) continue;
    const p = drawn.p;

    // Walk the inning and the score across the game so leverage is sampled at
    // every part of an afternoon rather than always at 0-0 in the first.
    const inning = 1 + Math.floor((k / Math.max(1, played.length)) * 9);
    /**
     * ⚠️ AND MEN GET ON BASE, which the first cut of this script forgot. It
     * built every situation off a fresh GameState, so `bases` was empty on all
     * 15,564 of them — which made isHighLeverage() reduce to "within one run",
     * and reported the jam captions as firing 0.0% of the time when they were
     * simply never reachable. Roughly half of all plate appearances have
     * somebody aboard.
     */
    const b = frac(i * 31337 + k * 911);
    const bases = [b > 0.55, b > 0.78, b > 0.9].map((yes) =>
      yes ? { name: 'runner', speed: 1 } : null,
    ) as unknown as typeof g0.bases;
    const before = situationOf(
      {
        ...g0,
        inning,
        outs: k % 3,
        bases,
        homeState: { ...g0.homeState, runs: (i + k) % 6 },
        awayState: { ...g0.awayState, runs: (i + k * 3) % 6 },
      },
      k % 2 === 0 ? 'home' : 'away',
    );
    if (isHighLeverage(before)) highSpots++;

    /**
     * ⚠️ THE RBI ARE MODELLED, AND THE FIRST CUT OF THIS SCRIPT GOT IT BADLY
     * WRONG. `1 + (k % 4)` put a quarter of all home runs in as grand slams,
     * which reported 5.6% of every ball in play as a GRAND SLAM caption and
     * inflated the pacing bill by a factor of four. Real shares: a home run is
     * solo 57% of the time, two-run 28%, three-run 12%, a slam about 3%; a
     * single or a double drives in nobody about four times in five.
     */
    const r = frac(i * 7919 + k * 104729);
    const runs =
      outcome === 'home_run'
        ? r < 0.57
          ? 1
          : r < 0.85
            ? 2
            : r < 0.97
              ? 3
              : 4
        : outcome === 'single' || outcome === 'double' || outcome === 'triple'
          ? r < 0.8
            ? 0
            : r < 0.96
              ? 1
              : 2
          : 0;
    const s: Scene = sceneFor({
      outcome,
      placement: p,
      verdict: null,
      runs,
      error: false,
      doublePlay: false,
      exitVelocity: drawn.ev,
      before,
      gameOver: false,
      walkOff: false,
    });
    balls++;
    totalHold += s.hold;
    tiers[s.tier]++;
    if (s.leverage) leveraged++;
    titles.set(s.title, (titles.get(s.title) ?? 0) + 1);
  }

}

const pct = (n: number) => ((n / balls) * 100).toFixed(1).padStart(5);

console.log(`${N} games · ${balls} balls in play · ${plateAppearances} plate appearances\n`);
console.log('TIER       fires    share    ms each');
console.log('-'.repeat(40));
for (const t of ['routine', 'solid', 'big', 'huge'] as Tier[]) {
  console.log(
    `${t.padEnd(10)} ${String(tiers[t]).padStart(5)}   ${pct(tiers[t])}%`,
  );
}
console.log('-'.repeat(40));
console.log(`mean extra hold      ${(totalHold / balls).toFixed(1).padStart(6)} ms per ball in play`);
console.log(`per nine-inning game ${((totalHold / balls) * (balls / N) / 1000).toFixed(2).padStart(6)} s added`);
console.log(`high-leverage spots  ${pct(highSpots)}% of balls in play`);
console.log(`scenes flagged big   ${pct(leveraged)}%`);

console.log('\nCAPTIONS, most common first:');
for (const [title, n] of [...titles.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${title.padEnd(20)} ${String(n).padStart(5)}   ${pct(n)}%`);
}

void withPlacement;

/** A deterministic 0-1 from an integer, so two runs of the script agree. */
function frac(n: number): number {
  let x = (n ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
