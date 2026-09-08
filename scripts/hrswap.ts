/**
 * Would a MATCHED home-run flow be rate-neutral? Counts, per park:
 *   demote  — table said home_run, the parabola never reached the fence
 *   promote — table said double, the parabola cleared the fence
 * If the two are close in a neutral park, geometry can decide home runs the way
 * contest() already decides hit-or-out. If they are not, it cannot.
 */
import { resolveSwingSeeded } from '../src/core/hit.ts';
import { wallAt, PARKS, type Park } from '../src/game/teams.ts';

// The raw parabola, lifted out of plotBatted() with no clamp of any kind.
const FPS_PER_MPH = 1.467;
const G = 32.174;
const GROUND_ANGLE = 5;
const LINER_ANGLE = 12;
const ROLL_PER_MPH = 0.55;
const dragFor = (mph: number) => 0.63 - Math.max(0, mph - 95) * 0.0016;

function rawCarry(ev: number, la: number): number {
  if (la < GROUND_ANGLE) return Math.max(50, Math.min(240, ev * 1.6));
  const v = ev * FPS_PER_MPH;
  const rad = (la * Math.PI) / 180;
  let d = ((v * v * Math.sin(2 * rad)) / G) * dragFor(ev);
  if (la < LINER_ANGLE) d += ev * ROLL_PER_MPH;
  return d;
}

const PITCHES = ['fastball', 'curveball', 'slider', 'changeup', 'sinker'] as const;
const balls = [];
for (let i = 0; i < 60000; i++) {
  const h = resolveSwingSeeded(
    {
      offsetMs: ((i % 25) - 12) * 2,
      pitchType: PITCHES[i % PITCHES.length]!,
      stats: { power: 0.8 + ((i * 7) % 11) * 0.09, contact: 1.1 },
      isPowerSwing: i % 3 === 0,
    },
    i * 7919 + 17,
  );
  if (h.outcome !== 'strikeout' && h.outcome !== 'foul' && h.outcome !== 'foul_out') balls.push(h);
}

console.log(`${balls.length} balls in play\n`);
console.log('park                  HR now   demote   promote(2B)  promote(all)   net');
console.log('-'.repeat(76));

function row(label: string, park: Park | undefined) {
  let hr = 0,
    demote = 0,
    promo2b = 0,
    promoAll = 0;
  for (const h of balls) {
    const fence = wallAt(h.direction, park);
    const carry = rawCarry(h.exitVelocity, h.launchAngle);
    if (h.outcome === 'home_run') {
      hr++;
      if (carry < fence) demote++;
    } else if (carry > fence) {
      promoAll++;
      if (h.outcome === 'double') promo2b++;
    }
  }
  console.log(
    `${label.padEnd(21)} ${String(hr).padStart(6)}   ${String(demote).padStart(6)}   ` +
      `${String(promo2b).padStart(11)}   ${String(promoAll).padStart(12)}   ` +
      `${(promo2b - demote >= 0 ? '+' : '') + String(promo2b - demote).padStart(5)}`,
  );
}

row('no park (400)', undefined);
row('NEM 310/390/302', PARKS.NEM);
row('NYE 318/408/314', PARKS.NYE);
row('KCF 330/410/330', PARKS.KCF);
row('DEN 352/420/352', PARKS.DEN);
