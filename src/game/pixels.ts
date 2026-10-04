/**
 * THE PIXEL BOX — the drawing half of the in-browser part editor, minus the
 * screen. A pad is a square of palette indices, and the four indices are the
 * four greys art.ts remaps to a club's kit:
 *
 *   0 clear · 1 outline (#000) · 2 base (#808080) · 3 highlight (#fff)
 *
 * ⚠️ IT STORES INDICES, NOT COLOURS, so nothing drawn here can be off-palette.
 * A bake writes exactly those four greys, which land on the ramp's stops.
 *
 * ponytail: pencil, fill and a mirror. No undo stack, no layers, no zoom — the
 * pad is 16 or 32 cells and CLEAR is one press.
 */
import type { ArtPart } from './look.ts';

export const SHADES = [-1, 0, 128, 255] as const;
export const INK_NAMES = ['clear', 'outline', 'base', 'highlight'] as const;

export interface Pad {
  n: number;
  cells: Uint8Array;
}

/** The spec's grid: a torso is 32 square, a head or a crest 16. */
export const padFor = (part: ArtPart): Pad => {
  const n = part === 'frame' ? 32 : 16;
  return { n, cells: new Uint8Array(n * n) };
};

/** One cell, and its twin across the middle when mirroring. */
export function paint(p: Pad, x: number, y: number, ink: number, mirror = false): void {
  if (x < 0 || y < 0 || x >= p.n || y >= p.n) return;
  p.cells[y * p.n + x] = ink;
  if (mirror) p.cells[y * p.n + (p.n - 1 - x)] = ink;
}

/**
 * A straight run of cells. ⚠️ A FAST DRAG SKIPS CELLS — pointermove fires per
 * frame, not per pixel — so a stroke is joined to where the last one landed.
 * Without it an outline has holes and FILL pours out through them.
 */
export function line(p: Pad, x0: number, y0: number, x1: number, y1: number, ink: number, mirror = false): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= steps; i++) {
    const t = steps ? i / steps : 0;
    paint(p, Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), ink, mirror);
  }
}

/** Flood the 4-connected run of the clicked index. */
export function fill(p: Pad, x: number, y: number, ink: number): void {
  if (x < 0 || y < 0 || x >= p.n || y >= p.n) return;
  const from = p.cells[y * p.n + x]!;
  if (from === ink) return;
  const stack = [y * p.n + x];
  while (stack.length) {
    const i = stack.pop()!;
    if (p.cells[i] !== from) continue;
    p.cells[i] = ink;
    const cx = i % p.n;
    if (cx > 0) stack.push(i - 1);
    if (cx < p.n - 1) stack.push(i + 1);
    if (i >= p.n) stack.push(i - p.n);
    if (i < p.n * (p.n - 1)) stack.push(i + p.n);
  }
}

/** The pad as RGBA, ready for putImageData. */
export function toRGBA(p: Pad): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(p.cells.length * 4);
  p.cells.forEach((ink, i) => {
    if (!ink) return;
    out.fill(SHADES[ink]!, i * 4, i * 4 + 3);
    out[i * 4 + 3] = 255;
  });
  return out;
}

/**
 * RGBA back to indices — how an imported drawing opens in the box. Mostly
 * transparent is clear; anything else snaps to the nearest of the three greys.
 */
export function fromRGBA(data: Uint8ClampedArray, n: number): Pad {
  const cells = new Uint8Array(n * n);
  for (let i = 0; i < cells.length; i++) {
    if (data[i * 4 + 3]! < 128) continue;
    const l = (data[i * 4]! * 299 + data[i * 4 + 1]! * 587 + data[i * 4 + 2]! * 114) / 1000;
    cells[i] = l < 64 ? 1 : l < 192 ? 2 : 3;
  }
  return { n, cells };
}
