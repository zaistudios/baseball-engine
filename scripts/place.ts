/** What placement does to the hit mix. Real MLB: 1B 65%, 2B 20%, 3B 2%, HR 13%. */
import { makeRng } from '../src/core/rng.ts';
import { resolveSwing, type SwingInput } from '../src/core/hit.ts';
import { place, stretch, GAP_FT, AT_HIM_FT } from '../src/game/placement.ts';
import { ALL_PITCH_TYPES, isHit, type Outcome } from '../src/core/hitTables.ts';
import { FOUL_BOOST } from '../src/game/tuning.ts';

const before: Record<string, number> = {};
const after: Record<string, number> = {};
let up = 0, down = 0, hits = 0, fouls = 0, swings = 0;

const rng = makeRng(99);
for (let i = 0; i < 120000; i++) {
  const input: SwingInput = {
    offsetMs: rng.range(-90, 90),
    pitchType: ALL_PITCH_TYPES[rng.int(0, 4)]!,
    stats: { power: 0.7 + rng.next() * 0.9, contact: 0.7 + rng.next() * 0.6, clutch: 1 },
    batterHand: rng.next() < 0.4 ? 'L' : 'R',
    pitcherHand: 'R',
    foulBoost: FOUL_BOOST,
  };
  const h = resolveSwing(input, rng);
  swings++;
  if (h.outcome === 'foul') { fouls++; continue; }
  if (!isHit(h.outcome)) continue;
  hits++;
  const p = place(h);
  const s = stretch(h.outcome, p);
  before[h.outcome] = (before[h.outcome] ?? 0) + 1;
  after[s] = (after[s] ?? 0) + 1;
  const rank: Record<string, number> = { single: 1, double: 2, triple: 3, home_run: 4 };
  if (rank[s]! > rank[h.outcome]!) up++;
  if (rank[s]! < rank[h.outcome]!) down++;
}

const pct = (t: Record<string, number>, k: string) => (((t[k] ?? 0) / hits) * 100).toFixed(1);
console.log(`foul rate        ${((fouls / swings) * 100).toFixed(1)}% of swings   (MLB ~35%)`);
console.log(`GAP_FT ${GAP_FT}  AT_HIM_FT ${AT_HIM_FT}`);
console.log(`upgraded ${((up / hits) * 100).toFixed(1)}%   downgraded ${((down / hits) * 100).toFixed(1)}%`);
console.log('');
console.log('          1B     2B     3B     HR');
console.log(`before  ${pct(before,'single')}  ${pct(before,'double')}  ${pct(before,'triple')}  ${pct(before,'home_run')}`);
console.log(`after   ${pct(after,'single')}  ${pct(after,'double')}  ${pct(after,'triple')}  ${pct(after,'home_run')}`);
console.log(`real     65.0   20.0    2.0   13.0`);

// --- what does the gap distance actually look like?
//
// ⚠️ BROKEN OUT BY OUTCOME, AND THAT IS THE WHOLE POINT OF THIS BLOCK. Every
// threshold in placement.ts is set against ITS OWN population, because they do
// not share one: a ground ball dies in an infield where four men stand close
// together and never lands more than about 50ft from anybody, while a fly ball
// routinely lands 90ft from the nearest glove. Read off the pooled row instead
// and you get TRIPLE_GAP_FT sitting above the ceiling of the triples (which
// deleted every three-bagger in the game), or one shared HOLE_FT that can only
// ever convert fly balls.
//
// The comments on GAP_FT, AT_HIM_FT, TRIPLE_GAP_FT, ROBBED_FT and HOLE_FT all
// send the reader here. This is the table they mean.
const seen: Record<string, number[]> = {};
const rng2 = makeRng(7);
for (let i = 0; i < 120000; i++) {
  const h = resolveSwing({
    offsetMs: rng2.range(-90, 90),
    pitchType: ALL_PITCH_TYPES[rng2.int(0, 4)]!,
    stats: { power: 0.7 + rng2.next() * 0.9, contact: 0.7 + rng2.next() * 0.6, clutch: 1 },
    foulBoost: FOUL_BOOST,
  }, rng2);
  if (h.outcome === 'foul' || h.outcome === 'foul_out' || h.outcome === 'strikeout') continue;
  (seen[h.outcome] ??= []).push(place(h).gapFt);
  if (isHit(h.outcome)) (seen['ALL HITS'] ??= []).push(place(h).gapFt);
}

const QS = [0.02, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.98];
console.log('');
console.log(
  'gapFt by outcome'.padEnd(14) + '     n' + QS.map((p) => `p${Math.round(p * 100)}`.padStart(6)).join(''),
);
for (const k of ['single', 'double', 'triple', 'home_run', 'ground_out', 'line_out', 'popup', 'ALL HITS']) {
  const g = (seen[k] ?? []).slice().sort((a, b) => a - b);
  if (g.length === 0) continue;
  console.log(
    k.padEnd(14) +
      String(g.length).padStart(6) +
      QS.map((p) => g[Math.floor(g.length * p)]!.toFixed(0).padStart(6)).join(''),
  );
}
