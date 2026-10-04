import { describe, expect, it } from 'vitest';
import { fill, fromRGBA, line, padFor, paint, toRGBA } from '../pixels';

describe('the pixel box', () => {
  it('sizes a torso at 32 and a crest at 16', () => {
    expect(padFor('frame').n).toBe(32);
    expect(padFor('crest').n).toBe(16);
  });

  it('mirrors a stroke across the middle and ignores the edge', () => {
    const p = padFor('head');
    paint(p, 2, 5, 1, true);
    paint(p, -1, 0, 3);
    expect(p.cells[5 * 16 + 2]).toBe(1);
    expect(p.cells[5 * 16 + 13]).toBe(1);
    expect(p.cells.filter(Boolean).length).toBe(2);
  });

  it('fills inside an outline and stops at it', () => {
    const p = padFor('head');
    for (let i = 0; i < 16; i++) paint(p, i, 8, 1); // a wall across the middle
    fill(p, 0, 0, 2);
    expect(p.cells[0]).toBe(2);
    expect(p.cells[7 * 16 + 15]).toBe(2);
    expect(p.cells[8 * 16]).toBe(1);
    expect(p.cells[15 * 16]).toBe(0);
  });

  it('round-trips through RGBA on the four greys', () => {
    const p = padFor('head');
    paint(p, 0, 0, 1);
    paint(p, 1, 0, 2);
    paint(p, 2, 0, 3);
    const rgba = toRGBA(p);
    expect([...rgba.slice(4, 8)]).toEqual([128, 128, 128, 255]);
    expect(fromRGBA(rgba, 16).cells).toEqual(p.cells);
  });
});

describe('a dragged stroke', () => {
  it('leaves no gap between two far-apart pointer samples', () => {
    const p = padFor('head');
    line(p, 0, 0, 15, 15, 1);
    for (let i = 0; i < 16; i++) expect(p.cells[i * 16 + i]).toBe(1);
  });
});
