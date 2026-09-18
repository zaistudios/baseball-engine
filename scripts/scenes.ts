/**
 * WHAT THE SCENES COST, AND WHAT THEY SAY. `node scripts/scenes.ts [games]`
 *
 * Plays real games, builds the scene EVERY PLATE APPEARANCE would have got —
 * the ball in play through sceneFor(), the strikeout and the walk through
 * sceneForTake() — and prints two things: how much time the beats add to a
 * nine-inning game, and how often each caption actually fires.
 *
 * ⚠️ THIS IS THE BILL. overhead.ts's note on FOUL_HOLD_MS is the standing
 * warning — the mode's premise is that a season fits in an afternoon, and half
 * a second on every ball in play is how that quietly stops being true. A
 * nine-inning game has roughly 74 plate appearances in it, 55 of them balls in
 * play, so a mean of 100ms is about seven seconds a game and 400ms is thirty.
 *
 * ⚠️ AND IT IS THE OTHER HALF OF THE CHECK: a tier nothing ever reaches is a
 * tier that does not exist. If `huge` fires on one ball in ten thousand, the
 * grand slam beat is dead code with a comment on it. Read the FIRES column.
 *
 * ⚠️ AND THE FIRST THING TO READ IS THE HEADER LINE, which prints the measured
 * population beside the played one. They have to be equal. For two days they
 * were not — 3006 against 4347 — because this script could only see balls in
 * play, and nobody read the two numbers sitting next to each other. If they
 * ever diverge again, every percentage below it is over the wrong denominator.
 */
import { simulateGame } from '../src/game/sim.ts';
import { LEAGUE, type Team } from '../src/game/teams.ts';
import { newGame } from '../src/game/game.ts';
import { resolveSwingSeeded } from '../src/core/hit.ts';
import { place, stretch } from '../src/game/placement.ts';
import {
  sceneFor,
  sceneForTake,
  situationOf,
  isHighLeverage,
  type Scene,
  type Tier,
} from '../src/game/scene.ts';
import type { Outcome } from '../src/core/hitTables.ts';
import type { ForceBag } from '../src/core/fielding.ts';

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

/**
 * ONE PLATE APPEARANCE, as the instrument models it.
 *
 * ⚠️ THE FLAGS ARE THE WHOLE POINT OF THIS TYPE, and until 2026-09-17 every
 * one of them was the literal `false` written at the sceneFor() call below.
 * The double play, the triple play, the man doubled off, the sacrifice fly,
 * the error and the walk-off — everything that shipped on 09-12 and 09-13 —
 * were unreachable, so this script printed a caption table with no DOUBLE PLAY
 * line in it and read as though the beat simply never fired. The fourth time a
 * measurement here sampled the wrong population; see the README.
 */
type Event =
  | {
      kind: 'in_play';
      outcome: Outcome;
      error: boolean;
      doublePlay: boolean;
      triplePlay: boolean;
      doubledOff: boolean;
      sacFly: boolean;
      forceAt?: ForceBag;
      walkOff: boolean;
    }
  | { kind: 'strikeout' | 'walk' | 'hit_by_pitch'; walkOff: boolean };

const tiers: Record<Tier, number> = { routine: 0, solid: 0, big: 0, huge: 0 };
const titles = new Map<string, number>();
let totalHold = 0;
let takeHold = 0;
let balls = 0;
let takes = 0;
let leveraged = 0;
let highSpots = 0;
let plateAppearances = 0;

for (let i = 0; i < N; i++) {
  const home = LEAGUE[i % LEAGUE.length]!;
  const away: Team = LEAGUE[(i + 9) % LEAGUE.length]!;
  if (home === away) continue;

  // A real game, for the SITUATIONS — the inning, the score and the men on.
  const sim = simulateGame(i * 7919 + 13, 9, home, away);
  const { game, outcomes } = sim;
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
  // Outs in play, split roughly the way the engine splits them.
  const grounders = Math.round(outsInPlay * 0.47);
  const liners = Math.round(outsInPlay * 0.3);
  // The remainder rather than a third rounded share, so the three buckets add
  // to exactly the outs the book recorded. Rounding all three independently ran
  // the measured population about 0.2% over the played one.
  const popups = Math.max(0, outsInPlay - grounders - liners);

  const fill = (n: number, outcome: Outcome): Event[] =>
    Array.from({ length: n }, () => ({
      kind: 'in_play' as const,
      outcome,
      error: false,
      doublePlay: false,
      triplePlay: false,
      doubledOff: false,
      sacFly: false,
      walkOff: false,
    }));

  // Balls in play, in the proportions the book says this game had.
  const played: Event[] = [
    ...fill(hr, 'home_run'),
    ...fill(tpl, 'triple'),
    ...fill(dbl, 'double'),
    ...fill(singles, 'single'),
    ...fill(grounders, 'ground_out'),
    ...fill(liners, 'line_out'),
    ...fill(popups, 'popup'),
  ];

  /**
   * ⚠️ AND NOW THE FIELDING FACTS GO ON, FROM THE SIM'S OWN COUNTERS rather
   * than from a rate somebody guessed. simulateGame() already counts every one
   * of these off `AtBatLog` — it has to, because each is a knob balance.ts
   * reads — so the honest instrument reads them rather than modelling them.
   *
   * WHICH BALLS THEY LAND ON IS GEOMETRY, NOT A CHOICE. The multi-out plays off
   * a grounder go on the ground-out block; the sacrifice fly and the man
   * doubled off are line drives, because FLY_OUTS in core/inning.ts is exactly
   * `{ line_out }` and nothing else in this vocabulary can be either one.
   */
  const outsAt = hr + tpl + dbl + singles;
  const ground = played.slice(outsAt, outsAt + grounders);
  const liner = played.slice(outsAt + grounders, outsAt + grounders + liners);
  const stamp = (pool: Event[], from: number, n: number, set: (e: Event, j: number) => void) => {
    for (let j = 0; j < n && from + j < pool.length; j++) set(pool[from + j]!, j);
    return from + n;
  };

  // Ground balls: the triple play, the double play and the force, disjoint —
  // which is how fielding.ts returns them, a triple play coming back with
  // doublePlay:false beside it.
  let nextGrounder = stamp(ground, 0, sim.triplePlays, (e) => {
    if (e.kind === 'in_play') {
      e.triplePlay = true;
      e.forceAt = 2;
    }
  });
  nextGrounder = stamp(ground, nextGrounder, sim.doublePlays, (e, j) => {
    if (e.kind !== 'in_play') return;
    e.doublePlay = true;
    // leadDoublePlays are the ones taken somewhere other than second — the 2-3
    // with the bases loaded, which is the whole point of the infield-in call.
    e.forceAt = j < sim.leadDoublePlays ? 4 : 2;
  });
  stamp(ground, nextGrounder, sim.forceOuts, (e, j) => {
    if (e.kind === 'in_play') e.forceAt = j < sim.leadForces ? 3 : 2;
  });

  const nextLiner = stamp(liner, 0, sim.doubledOff, (e) => {
    if (e.kind === 'in_play') e.doubledOff = true;
  });
  stamp(liner, nextLiner, sim.sacFlies, (e) => {
    if (e.kind === 'in_play') e.sacFly = true;
  });

  /**
   * The error goes on a ball that was FIELDED — it is the out that did not get
   * made, which is why it spreads across the outs block and not across the whole
   * in-play list. The first cut of this put the first error of every game on
   * index 0, which is a home run, and a muff on a ball in the seats is not a
   * population sceneFor() should ever be asked about.
   *
   * ⚠️ AND IT GOES ON A BALL NOTHING ELSE CLAIMED, which the second cut got
   * wrong and which the caption table caught. sceneFor() branches error BEFORE
   * the double play, so an error stamped on a ball that had already been given
   * a double play silently ate the `TWO` caption — 227 of them fell to 168 the
   * moment errors were spread evenly across the outs. A man who booted it did
   * not also turn two on the same ball; the two facts are exclusive, and the
   * instrument has to hold them that way or it mismeasures both.
   */
  const spare = played
    .slice(outsAt)
    .filter(
      (e) =>
        e.kind === 'in_play' &&
        !e.doublePlay && !e.triplePlay && !e.doubledOff && !e.sacFly && e.forceAt === undefined,
    );
  for (let j = 0; j < sim.errors && j < spare.length; j++) {
    const e = spare[Math.floor((j * spare.length) / Math.max(1, sim.errors))]!;
    if (e.kind === 'in_play') e.error = true;
  }

  /**
   * ⚠️ AND THE THIRD OF THE GAME THAT NEVER HAD A BALL IN IT. sceneForTake()
   * has existed since Zane's 09-12 note "NO STRIKEOUT PROMPT ON SCREEN", and
   * this script had never once called it — so the strikeout and the walk, about
   * 31% of all plate appearances, contributed nothing to either half of the
   * check. They are the beats with NO REPLAY UNDER THEM, which makes their hold
   * pure added time and the least affordable thing here to be guessing at.
   */
  played.push(
    ...Array.from({ length: outcomes.strikeout }, () => ({ kind: 'strikeout' as const, walkOff: false })),
    ...Array.from({ length: outcomes.walk }, () => ({ kind: 'walk' as const, walkOff: false })),
    ...Array.from({ length: outcomes.hit_by_pitch }, () => ({ kind: 'hit_by_pitch' as const, walkOff: false })),
  );

  /**
   * ⚠️ AND THEY GET SHUFFLED, WHICH THE OLD LOOP NEEDED AND DID NOT DO. The
   * inning below is derived from the index, so a list built home-runs-first put
   * every home run in the 1st and every popup in the 9th — a leverage bias on
   * exactly the captions leverage exists to promote. Deterministic, so two runs
   * of the script still agree.
   */
  const order = played.map((e, k) => ({ e, key: frac(i * 6151 + k * 233) }));
  order.sort((a, b) => a.key - b.key);
  const events = order.map((o) => o.e);

  // The walk-off is a fact about THIS GAME, read off the ending the engine set
  // — so WALK-OFF fires exactly as often as one really happens, which is the
  // number this script existed to print and never has.
  if (game.ending === 'walk_off' && events.length > 0) events[events.length - 1]!.walkOff = true;

  const g0 = newGame(home, away);
  for (let k = 0; k < events.length; k++) {
    const ev = events[k]!;

    // Walk the inning and the score across the game so leverage is sampled at
    // every part of an afternoon rather than always at 0-0 in the first.
    const inning = 1 + Math.floor((k / Math.max(1, events.length)) * 9);
    /**
     * ⚠️ AND MEN GET ON BASE, which the first cut of this script forgot. It
     * built every situation off a fresh GameState, so `bases` was empty on all
     * 15,564 of them — which made isHighLeverage() reduce to "within one run",
     * and reported the jam captions as firing 0.0% of the time when they were
     * simply never reachable. Roughly half of all plate appearances have
     * somebody aboard.
     */
    const b = frac(i * 31337 + k * 911);
    const on = [b > 0.55, b > 0.78, b > 0.9];
    const bases = on.map((yes) =>
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

    let s: Scene;
    if (ev.kind !== 'in_play') {
      /**
       * ⚠️ SWINGING VS LOOKING IS MODELLED, because AtBatLog does not carry it
       * — it is the one fact sceneForTake() branches on that the sim does not
       * already count. Real major-league strikeouts go down swinging about two
       * thirds of the time. If that flag ever lands on the log, read it from
       * there and delete this line.
       */
      const swinging = frac(i * 104729 + k * 7919) < 0.67;
      // Only a bases-loaded walk or plunking can force a run in.
      const forced = on[0] && on[1] && on[2] ? 1 : 0;
      s = sceneForTake({ kind: ev.kind, swinging, runs: forced, before, walkOff: ev.walkOff });
      takes++;
      takeHold += s.hold;
    } else {
      const drawn = draw(ev.outcome, i * 31 + k);
      if (!drawn) continue;

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
        ev.outcome === 'home_run'
          ? r < 0.57
            ? 1
            : r < 0.85
              ? 2
              : r < 0.97
                ? 3
                : 4
          : ev.outcome === 'single' || ev.outcome === 'double' || ev.outcome === 'triple'
            ? r < 0.8
              ? 0
              : r < 0.96
                ? 1
                : 2
            : // The sacrifice fly is the one OUT that drives a run in, and the
              // caption it never had is the whole reason sacFly is a fact.
              ev.sacFly
              ? 1
              : 0;
      s = sceneFor({
        outcome: ev.outcome,
        placement: drawn.p,
        verdict: null,
        runs,
        error: ev.error,
        doublePlay: ev.doublePlay,
        triplePlay: ev.triplePlay,
        doubledOff: ev.doubledOff,
        sacFly: ev.sacFly,
        forceAt: ev.forceAt,
        exitVelocity: drawn.ev,
        before,
        gameOver: ev.walkOff,
        walkOff: ev.walkOff,
      });
      balls++;
    }

    totalHold += s.hold;
    tiers[s.tier]++;
    if (s.leverage) leveraged++;
    titles.set(s.title, (titles.get(s.title) ?? 0) + 1);
  }
}

const shown = balls + takes;
const pct = (n: number) => ((n / shown) * 100).toFixed(1).padStart(5);

console.log(
  `${N} games · ${shown} plate appearances measured (${balls} in play, ${takes} takes) · ${plateAppearances} played\n`,
);
console.log('TIER       fires    share    ms each');
console.log('-'.repeat(40));
for (const t of ['routine', 'solid', 'big', 'huge'] as Tier[]) {
  console.log(
    `${t.padEnd(10)} ${String(tiers[t]).padStart(5)}   ${pct(tiers[t])}%`,
  );
}
console.log('-'.repeat(40));
console.log(`mean extra hold        ${(totalHold / shown).toFixed(1).padStart(6)} ms per plate appearance`);
console.log(`  on a ball in play    ${((totalHold - takeHold) / balls).toFixed(1).padStart(6)} ms`);
/**
 * ⚠️ THE TAKE HAS NO REPLAY UNDER IT, so every ms on this line is time the
 * screen spends holding a caption over a still picture. On a ball in play the
 * hold is partly covered by an overhead that is worth watching anyway; here it
 * is not covered by anything. See the note on sceneForTake().
 */
console.log(`  on a strikeout/walk  ${(takeHold / takes).toFixed(1).padStart(6)} ms`);
console.log(`per nine-inning game   ${(totalHold / N / 1000).toFixed(2).padStart(6)} s added`);
console.log(`high-leverage spots    ${pct(highSpots)}% of plate appearances`);
console.log(`scenes flagged big     ${pct(leveraged)}%`);

console.log('\nCAPTIONS, most common first:');
for (const [title, n] of [...titles.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${title.padEnd(20)} ${String(n).padStart(5)}   ${pct(n)}%`);
}

/** A deterministic 0-1 from an integer, so two runs of the script agree. */
function frac(n: number): number {
  let x = (n ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
