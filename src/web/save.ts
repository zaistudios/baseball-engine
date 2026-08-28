/**
 * Resuming a run.
 *
 * `rng.state()` shipped documented as "persist this to resume a run mid-save"
 * and then had no caller and no counterpart for months — a hook to nowhere.
 * This is the feature it was waiting for.
 *
 * WHAT MAKES THIS HONEST: mulberry32 keeps everything it knows in one 32-bit
 * word, so a resumed run rolls exactly the numbers the unsaved run would have
 * rolled. Save-scumming is therefore pointless — reloading and replaying the
 * same encounter gives the same pitches in the same order, which is the same
 * determinism guarantee the tests and the experiment's dataset rest on, spent
 * here on making a save file trustworthy.
 *
 * ponytail: SAVED BETWEEN MATCHES ONLY, never mid-at-bat. Resuming inside a
 * pitch means restoring a phase, a ball in flight, a swing that may already
 * have started and two clocks that have to agree about when it did — all of
 * that to spare the player one encounter. The shop is a natural boundary and
 * every roguelike that matters saves at exactly this granularity.
 */

import type { RunState } from '../core/run.ts';

/** Bumped when the shape changes. An old blob is discarded, not migrated. */
const VERSION = 3;
const KEY = 'asb.run.v1';

export interface SaveFile {
  v: number;
  /** `rng.state()` at the moment of saving. */
  rng: number;
  run: RunState;
  /** Player ids. The POOL is static, so ids rebuild the roster exactly. */
  signed: string[];
  /** Where the order had got to, so the lineup does not restart at the top. */
  atBatIndex: number;
  /** For the menu, so it can say what you would be resuming. */
  savedAt: number;
}

export function saveRun(s: Omit<SaveFile, 'v' | 'savedAt'>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...s, v: VERSION, savedAt: Date.now() }));
  } catch {
    // Private browsing, or storage disabled. The run still plays; it just
    // cannot be resumed, and silently is the right way to fail at that.
  }
}

/**
 * The saved run, or null.
 *
 * Validates rather than trusts. This is the one input to the game that a user
 * can hand-edit, and a malformed blob reaching `resolveLineup` would throw on
 * the title screen and lock them out of a game they can otherwise still play.
 * Anything suspicious is treated as no save at all.
 */
export function loadRun(): SaveFile | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<SaveFile>;
    if (s.v !== VERSION) return null;
    if (typeof s.rng !== 'number' || !Number.isFinite(s.rng)) return null;
    if (!s.run || typeof s.run !== 'object') return null;
    if (!Array.isArray(s.signed) || s.signed.length === 0) return null;
    if (!s.signed.every((id) => typeof id === 'string')) return null;
    if (typeof s.atBatIndex !== 'number' || !Number.isFinite(s.atBatIndex)) return null;
    // A finished run is not resumable. Storing one would offer "Continue" into
    // an immediate game-over screen.
    if (s.run.over) return null;
    return s as SaveFile;
  } catch {
    return null;
  }
}

export function clearRun(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Same as above.
  }
}
