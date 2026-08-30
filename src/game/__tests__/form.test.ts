/**
 * HOT AND COLD. The claims that make form a mechanic rather than noise: it is
 * reproducible from the save, it drifts rather than flickering, it averages to
 * nothing over a season, and it moves the ratings that decide an at-bat and no
 * others.
 *
 * ⚠️ THE REPRODUCIBILITY TEST IS THE LOAD-BEARING ONE. franchise.ts re-derives
 * every headless game from the season seed and the day so that a reloaded save
 * is the same season — see its header — and form is read on the way into every
 * one of those games. A form roll that was not a pure function of (seed, day,
 * name) would be the single thing in the engine able to break that, and it
 * would break it quietly: the standings would simply differ after a reload.
 */

import { describe, expect, it } from 'vitest';
import { FORM_DAYS, FORM_SWING, formOf, formMult, formLabel, inForm } from '../form.ts';
import { club } from '../teams.ts';
import { newSeason, playDay, standings } from '../franchise.ts';

const NAMES = ['Sal Bevilacqua', 'Ed Mancuso', 'Miss Ada Quill', 'Lock Seven Brennan'];

describe('where a man is', () => {
  it('is the same answer every time it is asked', () => {
    for (const n of NAMES) {
      for (const d of [0, 1, 7, 55, 161]) {
        expect(formOf(4242, d, n)).toBe(formOf(4242, d, n));
      }
    }
  });

  it('stays inside its own bounds', () => {
    for (const n of NAMES) {
      for (let d = 0; d < 200; d++) {
        const f = formOf(99, d, n);
        expect(f).toBeGreaterThanOrEqual(-1);
        expect(f).toBeLessThanOrEqual(1);
      }
    }
  });

  it('drifts rather than flickering — a slump lasts', () => {
    // ⚠️ THE POINT OF FORM_DAYS. Day-to-day change has to be small against the
    // range form covers, or the label means nothing: a man tagged HOT today and
    // COLD tomorrow is a dice roll wearing a word.
    let biggest = 0;
    for (const n of NAMES) {
      for (let d = 1; d < 200; d++) {
        biggest = Math.max(biggest, Math.abs(formOf(7, d, n) - formOf(7, d - 1, n)));
      }
    }
    // A full turn takes FORM_DAYS, so no single day may move more than a
    // generous share of the whole two-wide range.
    expect(biggest).toBeLessThan(4 / FORM_DAYS);
  });

  it('goes both hot and cold, and averages out across a season', () => {
    const all: number[] = [];
    for (const n of NAMES) for (let d = 0; d < 162; d++) all.push(formOf(31337, d, n));
    expect(Math.max(...all)).toBeGreaterThan(0.5);
    expect(Math.min(...all)).toBeLessThan(-0.5);
    // ⚠️ NEAR ZERO OVER A YEAR, or form is a league-wide buff rather than a
    // streak, and every rate stat in the record book quietly inflates.
    const avg = all.reduce((a, b) => a + b, 0) / all.length;
    expect(Math.abs(avg)).toBeLessThan(0.15);
  });

  it('is about the man, not the lineup slot he is batting in', () => {
    // Same name, same day, same season: the number cannot depend on anything
    // the player can rearrange on the pre-game card.
    expect(formOf(5, 20, 'Ed Mancuso')).toBe(formOf(5, 20, 'Ed Mancuso'));
    expect(formOf(5, 20, 'Ed Mancuso')).not.toBe(formOf(5, 20, 'Sal Bevilacqua'));
  });

  it('gives two seasons different weather', () => {
    const a = Array.from({ length: 40 }, (_, d) => formOf(1, d, 'Ed Mancuso'));
    const b = Array.from({ length: 40 }, (_, d) => formOf(2, d, 'Ed Mancuso'));
    expect(a).not.toEqual(b);
  });

  it('labels only the ends', () => {
    expect(formLabel(0.9)).toMatchObject({ text: 'HOT', hot: true });
    expect(formLabel(-0.9)).toMatchObject({ text: 'COLD', hot: false });
    expect(formLabel(0)).toBeNull();
    expect(formLabel(0.4)).toBeNull();
  });
});

describe('the club that walks out there', () => {
  const ALB = club('ALB');

  it('moves the ratings that decide an at-bat', () => {
    // Find a day this man is clearly off his card, so the assertion is not
            // measuring a rounding difference.
    let day = 0;
    while (Math.abs(formOf(1, day, ALB.lineup[0]!.name)) < 0.5 && day < 200) day++;
    const hot = inForm(ALB, 1, day);
    const m = formMult(1, day, ALB.lineup[0]!.name);

    expect(hot.lineup[0]!.power).toBeCloseTo(ALB.lineup[0]!.power * m);
    expect(hot.lineup[0]!.contact).toBeCloseTo(ALB.lineup[0]!.contact * m);
    expect(hot.lineup[0]!.vision).toBeCloseTo(ALB.lineup[0]!.vision * m);
  });

  it('leaves legs, bunting and conditioning alone', () => {
    // ⚠️ A SLUMP IS NOT AN INJURY. Speed and stamina are what a man IS; form is
    // what he is doing at the plate. If these ever start moving, a cold streak
    // starts costing infield hits and innings pitched too, and "hot" stops
    // being a hitting word.
    for (const d of [0, 6, 13, 40]) {
      const t = inForm(ALB, 1, d);
      t.lineup.forEach((p, i) => {
        expect(p.speed).toBe(ALB.lineup[i]!.speed);
        expect(p.bunt).toBe(ALB.lineup[i]!.bunt);
      });
      t.rotation.forEach((a, i) => {
        expect(a.stamina ?? 1).toBe(ALB.rotation[i]!.stamina ?? 1);
      });
    }
  });

  it('keeps a pitcher\'s command a legal share of pitches', () => {
    for (let d = 0; d < 120; d++) {
      for (const a of [...inForm(ALB, 3, d).rotation, ...inForm(ALB, 3, d).bullpen]) {
        expect(a.zoneRate).toBeGreaterThanOrEqual(0.2);
        expect(a.zoneRate).toBeLessThanOrEqual(0.95);
      }
    }
  });

  it('is off entirely when the swing is zero', () => {
    // The documented off switch. Guarded here so a future edit that drops the
    // early return has to explain itself.
    if (FORM_SWING === 0) expect(inForm(ALB, 1, 5)).toBe(ALB);
    else expect(FORM_SWING).toBeGreaterThan(0);
  });
});

describe('a season with form in it', () => {
  it('replays identically from the same seed', () => {
    // ⚠️ THE WHOLE REASON FORM IS DERIVED RATHER THAN STORED. Two seasons run
    // from one seed have to be the same season, slumps included.
    const run = (): string => {
      let s = newSeason('---', 20260829, 14);
      for (let d = 0; d < 14; d++) s = playDay(s);
      return standings(s).map((r) => `${r.abbr}${r.w}-${r.l}`).join(',');
    };
    expect(run()).toBe(run());
  });
});
