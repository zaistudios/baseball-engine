/**
 * THE BARREL STREAK. Consecutive squared-up swings, and the best you have ever
 * run — the arcade high score, hung on the one thing you do most.
 *
 * ⚠️ WHY THIS AND NOT ANOTHER MODE. The game already has both long hooks: a
 * franchise with a save and a bracket at the end of it. What it had no version
 * of was the SHORT one. Every swing was graded, the grade was written to
 * `lastGrade`, and the next pitch overwrote it — so a perfect swing in the
 * third inning of a game you are losing 8-1 was worth nothing and led nowhere.
 * A number that goes up, breaks, and remembers its own record is the cheapest
 * possible answer to "why do I want the next pitch", and the next pitch is the
 * whole game.
 *
 * WHAT COUNTS, and each of the three is a decision:
 *
 *   perfect / good   EXTENDS it. This is `grade()`'s own word for squared up,
 *                    so the streak measures exactly the skill the game is
 *                    about and needs no second definition to drift from it.
 *   early / late     BREAKS it. Contact, but not the good kind. Being generous
 *                    here would make the streak measure "did you swing".
 *   a take           LEAVES IT ALONE. Laying off a slider off the plate is the
 *                    right play and the game must never punish it — a streak
 *                    that broke on a walk would teach hacking, which is the
 *                    opposite of every other lesson in this engine.
 *
 * A foul counts if it was struck well, because grade() says it was. You barrel
 * one straight back and it is a strike; you still barrelled it.
 *
 * ponytail: two integers and a localStorage key. No per-pitch-type streaks, no
 * daily record, no leaderboard, no achievement tiers. The number and the record
 * are the whole feature — add a tier when one number stops being enough.
 */

import type { TimingGrade } from '../core/timing.ts';

export interface Streak {
  /** Squared up in a row, right now. */
  current: number;
  /** The most you have ever run, across every session on this machine. */
  best: number;
}

/** Grades that keep it alive. The engine's own word for squared up. */
export const BARRELS: ReadonlySet<TimingGrade> = new Set<TimingGrade>(['perfect', 'good']);

export const newStreak = (): Streak => ({ current: 0, best: 0 });

/**
 * Fold one swing in. Returns a new streak and whether the record just moved,
 * because "you beat it" is a different thing to say than "you are at 6" and the
 * caller has to be able to say the loud one.
 */
export function extend(s: Streak, grade: TimingGrade): { streak: Streak; record: boolean } {
  if (!BARRELS.has(grade)) return { streak: { ...s, current: 0 }, record: false };
  const current = s.current + 1;
  const record = current > s.best;
  return { streak: { current, best: Math.max(current, s.best) }, record };
}

// ------------------------------------------------------------- persistence

const KEY = 'asb-streak';

/**
 * The record, off disk. Only `best` survives — a streak in progress belongs to
 * the game you were playing, and restoring one would hand you a number you did
 * not earn in the at-bat you are about to take.
 */
export function loadStreak(): Streak {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return newStreak();
    const best = Number(JSON.parse(raw)?.best);
    // Anything that is not a real count is a corrupt or hand-edited file, and
    // a NaN best would compare false against every swing forever — the record
    // would silently stop existing rather than fail loudly.
    return { current: 0, best: Number.isFinite(best) && best > 0 ? Math.floor(best) : 0 };
  } catch {
    return newStreak();
  }
}

/** ponytail: written on every new record, not every swing. Records are rare. */
export function saveStreak(s: Streak): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ best: s.best }));
  } catch {
    /* private window, or the disk said no. The streak still runs in memory. */
  }
}
