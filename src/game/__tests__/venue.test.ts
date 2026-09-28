import { describe, expect, it } from 'vitest';
import { venueFor, lightAt, lightFor, firstPitch, hourAt, mix, overheadPalette, eraOf, SKYLINE, STARTS, PARK_LOOK } from '../venue.ts';
import { LANDMARK_NAMES } from '../landmarks.ts';
import { LEAGUE } from '../teams.ts';

describe('every park looks like its own town', () => {
  it('gives all thirty clubs a skyline, and uses every kind of one', () => {
    for (const club of LEAGUE) expect(SKYLINE[club.abbr], club.abbr).toBeDefined();
    expect(new Set(LEAGUE.map((c) => venueFor(c).skyline)).size).toBe(9);
  });

  it('paints the real fences on the wall, not 330 / 395 / 335 everywhere', () => {
    for (const club of LEAGUE) {
      const v = venueFor(club);
      expect([v.left, v.center, v.right]).toEqual([club.park!.left, club.park!.center, club.park!.right]);
    }
  });

  it('dresses the park in the home club\'s colours, so no two walls in a town match', () => {
    const walls = new Set(LEAGUE.map((c) => `${venueFor(c).wall}${venueFor(c).trim}`));
    expect(walls.size).toBeGreaterThan(10);
  });

  it('gives every club its own landmark, and a painter exists for each', () => {
    const names = LEAGUE.map((c) => PARK_LOOK[c.abbr]?.[0]);
    for (const n of names) expect(LANDMARK_NAMES).toContain(n);
    expect(new Set(names).size).toBe(LEAGUE.length);
  });

  it('puts the all-human club in the past and the all-machine club in the future', () => {
    const era = (abbr: string) => eraOf(LEAGUE.find((c) => c.abbr === abbr)!);
    expect(era('ALB')).toBe(0);
    expect(era('DET')).toBe(1);
    expect(era('FLA')).toBeCloseTo(0.6, 6);
  });

  it('keeps the light under a dome the same all game', () => {
    const tank = venueFor(LEAGUE.find((c) => c.abbr === 'FLA')!);
    expect(lightFor(tank, 13)).toEqual(lightFor(tank, 22));
    expect(lightFor(tank, 22).lights).toBe(true);
  });

  it('a custom club with no park note still gets a skyline', () => {
    const v = venueFor({ ...LEAGUE[0]!, abbr: 'ZZZ' });
    expect(v.skyline).toBeTruthy();
  });
});

describe('the clock runs with the innings', () => {
  it('starts a third of games in the day, some at 5:10, the rest at night', () => {
    expect(firstPitch(0.1)).toBe(STARTS[0]);
    expect(firstPitch(0.4)).toBe(STARTS[1]);
    expect(firstPitch(0.9)).toBe(STARTS[2]);
  });

  it('a 1:05 game stays in daylight, a 7:05 game is under the lights all night', () => {
    expect(lightAt(hourAt(STARTS[0], 9)).lights).toBe(false);
    expect(lightAt(hourAt(STARTS[2], 0)).lights).toBe(true);
  });

  it('a 5:10 game turns from day to night while it is played', () => {
    expect(lightAt(hourAt(STARTS[1], 0)).day).toBeGreaterThan(0.9);
    expect(lightAt(hourAt(STARTS[1], 9)).day).toBeLessThan(0.5);
  });

  it('only ever gets darker as the evening goes on', () => {
    let last = 1;
    for (let h = 12; h <= 24; h += 0.1) {
      const d = lightAt(h).day;
      expect(d).toBeLessThanOrEqual(last + 1e-9);
      last = d;
    }
  });

  it('keeps the overhead in the same light as the view behind the plate', () => {
    expect(overheadPalette(lightAt(13)).field).not.toBe(overheadPalette(lightAt(22)).field);
  });
});

describe('mix', () => {
  it('blends two colours, end to end', () => {
    expect(mix('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
});
