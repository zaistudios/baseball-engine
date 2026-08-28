/**
 * Seeded RNG. Hub first-move #4: this lands before any game logic.
 *
 * Math.random() cannot be seeded, so retrofitting means touching every call
 * site. Determinism is what makes agent-written tests verifiable, and the
 * experiment's dataset depends on runs being reproducible.
 *
 * mulberry32 - 32-bit state, uniform output, fast, ~10 lines. No dependency.
 */

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Integer in [min, max]. */
  int(min: number, max: number): number;
  /** Float in [min, max). */
  range(min: number, max: number): number;
  /** Uniformly pick one element. Throws on an empty array. */
  pick<T>(items: readonly T[]): T;
  /** Current internal state - persist this to resume a run mid-save. */
  state(): number;
}

/**
 * `state` restores a generator mid-stream instead of starting it at the seed.
 *
 * mulberry32 keeps everything it knows in one 32-bit word, so resuming is
 * literally assigning that word back — there is no buffer, no counter and no
 * warm-up to reproduce. That is the property that makes a save file honest:
 * a resumed run rolls the same numbers it would have rolled without the save,
 * which is the whole reason determinism is a hard requirement here.
 *
 * `state()` shipped for this and had no counterpart for months, so it was a
 * hook to nowhere.
 */
export function makeRng(seed: number, state?: number): Rng {
  let s = (state ?? seed) >>> 0;

  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    range: (min, max) => min + next() * (max - min),
    pick: <T,>(items: readonly T[]): T => {
      if (items.length === 0) throw new Error('rng.pick: empty array');
      return items[Math.floor(next() * items.length)]!;
    },
    state: () => s,
  };
}

/** Derive a stable seed from a run string, so "seed sharing" works later. */
export function seedFromString(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
