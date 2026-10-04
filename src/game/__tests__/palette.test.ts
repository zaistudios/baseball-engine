import { describe, expect, it } from 'vitest';
import { ramp, remap } from '../art';

describe('palette remap', () => {
  it('lands the four indexed greys on transparent / outline / kit / highlight', () => {
    const px = new Uint8ClampedArray([
      9, 9, 9, 0, // index 0: clear stays clear
      0, 0, 0, 255, // index 1: outline
      128, 128, 128, 255, // index 2: the kit colour
      255, 255, 255, 255, // index 3: highlight
    ]);
    remap(px, ramp('#a8342c'));
    expect([...px.slice(0, 4)]).toEqual([9, 9, 9, 0]);
    expect([...px.slice(4, 7)]).toEqual([42, 13, 11]);
    expect([...px.slice(8, 11)].map((v, i) => Math.abs(v - [0xa8, 0x34, 0x2c][i]!) <= 1)).toEqual([true, true, true]);
    expect([...px.slice(12, 15)]).toEqual([229, 194, 192]);
  });

  it('keeps a white highlight brighter than the kit, unlike multiply', () => {
    const px = new Uint8ClampedArray([255, 255, 255, 255]);
    remap(px, ramp('#2f4f8a'));
    expect(px[0]!).toBeGreaterThan(0x2f);
    expect(px[2]!).toBeGreaterThan(0x8a);
  });

  it('reads a bad colour as grey instead of throwing', () => {
    expect(ramp('not a colour')[1]).toEqual([128, 128, 128]);
  });
});
