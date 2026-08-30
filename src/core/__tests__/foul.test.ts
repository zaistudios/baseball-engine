/**
 * FOUL BALLS: where they go, and the ones somebody catches.
 *
 * Three claims, and the middle one is the gameplay change:
 *
 *   1. A foul leaves the bat into FOUL GROUND. It did not before — `direction`
 *      was clamped to the foul lines, so every foul carried a heading somewhere
 *      between them, which is fair territory.
 *   2. A soft, steep one is an OUT. That ends at-bats, so it moves the plate
 *      appearance mix and is a balance change, not a cosmetic one.
 *   3. A popup and a line drive are different flights. They were identical at
 *      the same distance, because hang time came off distance alone.
 */

import { describe, expect, it } from 'vitest';
import {
  FOUL_MAX_DEG,
  FOUL_POP_ANGLE,
  caughtFoul,
  foulDirection,
  resolveSwing,
} from '../hit.ts';
import { ALL_OUTCOMES, OUTCOME_TABLES, isOut, isHit, type Outcome } from '../hitTables.ts';
import { swingAt, isOver } from '../atBat.ts';
import { makeRng } from '../rng.ts';
import { plotBatted, FOUL_MAX_FT } from '../../web/plot.ts';

const FOUL_LINE = 45;

describe('the outcome vocabulary', () => {
  it('carries foul_out, and no table can roll it', () => {
    // ⚠️ THE SECOND HALF IS THE LOAD-BEARING ONE. A foul_out column in any
    // table would mean the forty-five hand-tuned rows had been re-normalised to
    // make room for it, which is the balance change this deliberately is not.
    expect(ALL_OUTCOMES).toContain('foul_out');
    for (const [timing, byPitch] of Object.entries(OUTCOME_TABLES)) {
      for (const [pitch, table] of Object.entries(byPitch)) {
        expect(table.foul_out, `${timing}/${pitch}`).toBe(0);
        const sum = ALL_OUTCOMES.reduce((a, o) => a + table[o], 0);
        expect(sum, `${timing}/${pitch} sums to 1`).toBeCloseTo(1, 10);
      }
    }
  });

  it('is an out, and is not a hit', () => {
    expect(isOut('foul_out')).toBe(true);
    expect(isHit('foul_out')).toBe(false);
    // The uncaught one is neither — it does not end an at-bat at all.
    expect(isOut('foul')).toBe(false);
    expect(isHit('foul')).toBe(false);
  });
});

describe('where a foul goes', () => {
  it('always leaves the field of play', () => {
    for (let d = -45; d <= 45; d += 1) {
      expect(Math.abs(foulDirection(d)), `from ${d}`).toBeGreaterThan(FOUL_LINE);
      expect(Math.abs(foulDirection(d)), `from ${d}`).toBeLessThanOrEqual(FOUL_MAX_DEG);
    }
  });

  it('keeps the side he hit it to', () => {
    expect(foulDirection(30)).toBeGreaterThan(0);
    expect(foulDirection(-30)).toBeLessThan(0);
    expect(foulDirection(45)).toBeGreaterThan(0);
    expect(foulDirection(-45)).toBeLessThan(0);
  });

  it('sends the well-struck one straight back and the pulled one near the line', () => {
    // ⚠️ THE INVERSION, WHICH READS BACKWARDS UNTIL YOU SAY IT OUT LOUD. A ball
    // yanked to the pull side and foul was nearly fair — it leaves just past the
    // line. A ball hit off the middle of the bat and fouled was not mistimed
    // sideways at all; it was hit UNDER, and it goes over the catcher.
    expect(Math.abs(foulDirection(45))).toBeLessThan(Math.abs(foulDirection(0)));
    expect(Math.abs(foulDirection(0))).toBeGreaterThan(90); // behind the plate
    expect(Math.abs(foulDirection(44))).toBeLessThan(50); // just past the line
  });
});

describe('the one somebody catches', () => {
  it('is decided by the angle it left at, and by nothing else', () => {
    expect(caughtFoul(FOUL_POP_ANGLE + 5)).toBe(true);
    expect(caughtFoul(FOUL_POP_ANGLE)).toBe(true);
    expect(caughtFoul(FOUL_POP_ANGLE - 0.1)).toBe(false);
    expect(caughtFoul(0)).toBe(false);
    expect(caughtFoul(-30)).toBe(false);
  });

  it('does not care how strong the hitter is', () => {
    // ⚠️ THE BUG THIS REPLACED. The rule used to require a low exit velocity,
    // and a foul's exit velocity is 70 x timing x (0.8 + power x 0.4) — so the
    // cap was a cap on POWER, and whole clubs could never foul out. Three full
    // games produced zero foul outs in 230 plate appearances where four were
    // expected, and a 200-game headless average had hidden it.
    const strong = { power: 1.6 };
    const weak = { power: 0.8 };
    const rate = (stats: { power: number }) => {
      let outs = 0;
      let fouls = 0;
      for (let seed = 1; seed < 6000; seed++) {
        const h = resolveSwing({ offsetMs: 55, pitchType: 'fastball', stats }, makeRng(seed));
        if (h.outcome === 'foul') fouls++;
        if (h.outcome === 'foul_out') { fouls++; outs++; }
      }
      return outs / fouls;
    };
    const s = rate(strong);
    const w = rate(weak);
    expect(s).toBeGreaterThan(0);
    expect(w).toBeGreaterThan(0);
    // Same share of fouls caught, whoever is swinging.
    expect(Math.abs(s - w)).toBeLessThan(0.04);
  });

  it('ends the at-bat, at any count', () => {
    // ⚠️ AT ANY COUNT is the whole rule. A foul is free with two strikes; a
    // foul somebody CATCHES is an out on the first pitch of the at-bat.
    for (let strikes = 0; strikes <= 2; strikes++) {
      const state = { balls: 0, strikes };
      let found = false;
      for (let seed = 1; seed < 4000 && !found; seed++) {
        const next = swingAt(state, { offsetMs: 55, pitchType: 'fastball' }, makeRng(seed));
        if (next.lastSwing?.outcome !== 'foul_out') continue;
        found = true;
        expect(isOver(next), `${strikes} strikes`).toBe(true);
        expect(next.result?.kind).toBe('in_play');
      }
      expect(found, `no foul_out found at ${strikes} strikes`).toBe(true);
    }
  });

  it('reports itself as an out on the HitResult', () => {
    for (let seed = 1; seed < 4000; seed++) {
      const hit = resolveSwing({ offsetMs: 55, pitchType: 'fastball' }, makeRng(seed));
      if (hit.outcome !== 'foul_out') continue;
      expect(hit.isOut).toBe(true);
      expect(hit.isHit).toBe(false);
      // It kept the ball its foul roll produced — same angle, same speed.
      expect(hit.launchAngle).toBeGreaterThanOrEqual(FOUL_POP_ANGLE);
      expect(Math.abs(hit.direction)).toBeGreaterThan(FOUL_LINE);
      return;
    }
    throw new Error('no foul_out produced in 4000 swings');
  });
});

describe('an ordinary foul still does what a foul does', () => {
  const swing = (state: { balls: number; strikes: number }, seed: number) =>
    swingAt(state, { offsetMs: 55, pitchType: 'fastball' }, makeRng(seed));

  it('is free with two strikes, and the swing survives so it can be drawn', () => {
    for (let seed = 1; seed < 4000; seed++) {
      const next = swing({ balls: 1, strikes: 2 }, seed);
      if (next.lastSwing?.outcome !== 'foul') continue;
      expect(next.strikes).toBe(2);
      expect(next.balls).toBe(1);
      expect(isOver(next)).toBe(false);
      // ⚠️ THE SWING HAS TO SURVIVE. Before lastSwing the HitResult was thrown
      // away here and the screen had nothing to draw the ball from.
      expect(next.lastSwing).toBeTruthy();
      return;
    }
    throw new Error('no free foul produced');
  });

  it('is a strike with fewer than two', () => {
    for (let seed = 1; seed < 4000; seed++) {
      const next = swing({ balls: 0, strikes: 0 }, seed);
      if (next.lastSwing?.outcome !== 'foul') continue;
      expect(next.strikes).toBe(1);
      expect(isOver(next)).toBe(false);
      return;
    }
    throw new Error('no foul produced');
  });
});

describe('a popup is not a line drive', () => {
  const at = (angle: number, ev = 80): ReturnType<typeof plotBatted> =>
    plotBatted('line_out', ev, angle);

  it('hangs longer the steeper it leaves', () => {
    // ⚠️ THE BUG THIS FIXES. Hang time came off DISTANCE alone, so a 150ft
    // popup and a 150ft line drive were the same flight — same arc, same
    // duration, same size ball drawn. Nothing could tell them apart.
    const liner = at(14);
    const pop = at(70);
    expect(pop.hangMs).toBeGreaterThan(liner.hangMs * 1.5);
  });

  it('is monotonic across the whole range', () => {
    let last = 0;
    for (let a = 12; a <= 80; a += 4) {
      const ms = plotBatted('popup', 70, a).hangMs;
      expect(ms, `${a}°`).toBeGreaterThanOrEqual(last);
      last = ms;
    }
  });

  it('still separates two fouls, on the tighter foul clock', () => {
    // Fouls run on their own band for pacing — see FOUL_HANG_MIN_MS — but the
    // two shapes must still read as different plays.
    const liner = plotBatted('foul', 75, 14, 60);
    const pop = plotBatted('foul', 65, 70, 100);
    expect(pop.hangMs).toBeGreaterThan(liner.hangMs);
    // ...and both are quick, because there are several a plate appearance.
    expect(pop.hangMs).toBeLessThanOrEqual(900);
  });
});

describe('a foul is plotted somewhere it could really be', () => {
  const angles = [-40, -20, -5, 0, 5, 20, 40];

  it('never lands further out than a foul can reach', () => {
    for (const a of angles) {
      for (const ev of [60, 75, 95]) {
        for (const dir of [46, 70, 90, 110, FOUL_MAX_DEG]) {
          for (const sign of [1, -1]) {
            const p = plotBatted('foul', ev, a, sign * dir);
            expect(p.distFt, `${a}° ${ev}mph at ${sign * dir}`).toBeGreaterThan(0);
            expect(p.distFt).toBeLessThanOrEqual(FOUL_MAX_FT);
            expect(Number.isFinite(p.hangMs)).toBe(true);
          }
        }
      }
    }
  });

  it('carries less the further round the back it goes', () => {
    // ⚠️ WHAT KEEPS IT ON THE CANVAS as well as what is physically true. The
    // overhead camera has about forty-eight feet behind home plate; a ball
    // fouled straight back and plotted at its parabola distance is off-screen.
    const line = plotBatted('foul', 80, 30, 46);
    const back = plotBatted('foul', 80, 30, 125);
    expect(back.distFt).toBeLessThan(line.distFt);
    expect(back.distFt).toBeLessThan(50);
  });

  it('leaves a fair ball plot exactly as it was', () => {
    // The direction argument is read for fouls only. Every existing caller
    // passes nothing, and must be unaffected.
    for (const o of ['single', 'double', 'home_run', 'popup', 'ground_out'] as Outcome[]) {
      for (const dir of [0, 30, -30, 44]) {
        expect(plotBatted(o, 95, 25, dir).distFt).toBe(plotBatted(o, 95, 25).distFt);
      }
    }
  });
});
