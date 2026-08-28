/**
 * HOW HARD THE SWING IS, and how honest the clock is. Two settings that both
 * live on the same one millisecond number, which is why they live in one file.
 *
 * ⚠️ BEFORE THIS, DIFFICULTY WAS "WHICH CLUB YOU PICKED". The league has a
 * deliberate talent ladder — the card says THIN 30 OF 30 out loud — and that
 * is a fine way to choose how hard the SEASON is. It is not a way to choose
 * how hard the SWING is, and the swing is the game. A player who cannot
 * consistently square one up does not have a hard season; he has a game he
 * cannot play, and no club in the league fixes that.
 *
 * ⚠️ THE KNOB IS THE TIMING WINDOW AND NOTHING ELSE, and that is deliberate.
 * The obvious alternative — slow the pitch down — is the one thing this engine
 * must not do casually: flightScale() in main.ts has to scale the BAT by the
 * same factor or watch mode stops being the game you would have played, and a
 * difficulty setting that quietly took a side in that invariant would be a bug
 * with a menu entry. Widening the window buys the player the same milliseconds
 * without moving the ball, and milliseconds are the whole quantity grade() has
 * ever measured.
 *
 * ⚠️ IT APPLIES TO YOU AND NEVER TO THE COMPUTER. The CPU hitter is graded by
 * the same grade() call, so passing the assist down the wrong path would make
 * ROOKIE a setting that improves the opposition. The multiplier travels on
 * SwingInput, which only the human path fills in.
 *
 * ----------------------------------------------------------------- and then
 *
 * THE CALIBRATION IS NOT A DIFFICULTY. It is the bug fix timing.ts described
 * at length under FAULT 4 and nobody ever wired up: medianOffset() has been
 * exported, tested and DEAD since it was written. The reasoning there is
 * exact, so it is not repeated here — the short version is that a player reacts
 * to photons, photons leave the display 30-80ms after the frame that computed
 * them, and against a 35ms 'good' window that is not difficulty, it is the
 * instrument being wrong. Every swing already reports its own offset, so the
 * bias can be measured and cancelled.
 *
 * ⚠️ THE SAMPLES MUST BE RAW. medianOffset() says so in its own signature —
 * they are measured against UNCORRECTED arrival. Feed it corrected offsets and
 * the correction chases its own tail: it lands at zero, cancels itself, and the
 * player is back where he started with a screen confidently reporting that he
 * is calibrated.
 *
 * ponytail: one rolling buffer and one median. No per-pitch-type bias, no
 * variance estimate, no confidence interval, no separate "calibration mode"
 * that makes you take twenty pitches before you may play. The samples are
 * swings you were taking anyway.
 */

import { MAX_CALIBRATION_MS, medianOffset } from '../core/timing.ts';

export interface Level {
  key: string;
  name: string;
  /** What it does, in the player's terms rather than in milliseconds. */
  blurb: string;
  /**
   * Multiplies every timing window in grade(). Above one is wider and easier.
   *
   * It is fed in as a CONTACT multiplier, because contact is already the
   * rating that scales all three windows and nothing else — see grade(). So
   * the assist is literally "the bat is this much better at finding it", which
   * is a sentence the engine already knew how to say.
   */
  assist: number;
}

/**
 * ⚠️ VETERAN IS 1.0 AND IS THE DEFAULT, so the game everybody has been playing
 * is still exactly the game, under a name. A difficulty menu whose middle
 * setting quietly re-tunes the existing balance would invalidate every number
 * in the memory of this project.
 *
 * The spread is set against timing.ts's own note that skilled human timing on
 * a telegraphed cue sits near 20-30ms: VETERAN's 35ms 'good' is right at that
 * line, ROOKIE's 56ms is forgiving of a bad guess, and ALL-STAR's 26ms asks
 * for the top of the human range every swing.
 */
export const LEVELS: readonly Level[] = [
  {
    key: 'rookie',
    name: 'ROOKIE',
    blurb: 'Wide timing window. You will square up a lot of them.',
    assist: 1.6,
  },
  {
    key: 'veteran',
    name: 'VETERAN',
    blurb: 'The window the game was built and balanced around.',
    assist: 1.0,
  },
  {
    key: 'allstar',
    name: 'ALL-STAR',
    blurb: 'Narrow. Good is nearly perfect and perfect is a moment.',
    assist: 0.75,
  },
];

export const levelOf = (key: string): Level =>
  LEVELS.find((l) => l.key === key) ?? LEVELS[1]!;

// ------------------------------------------------------------- calibration

/**
 * How many swings before the correction is trusted enough to apply.
 *
 * ⚠️ IT IS NOT ONE. A median of three samples is one bad hack away from a 60ms
 * shift, and a correction that lurches after every swing is worse than none:
 * the player is trying to learn a window that keeps moving under him. Twelve
 * is roughly one game's worth of swings and settles down hard after that.
 */
export const MIN_SAMPLES = 12;

/**
 * How many swings the median is taken over.
 *
 * Rolling rather than cumulative on purpose — the number being measured belongs
 * to a monitor, and the monitor can change. A career-long average would take a
 * thousand swings to notice a new one.
 */
export const WINDOW = 40;

export interface Calibration {
  /** Raw offsets, newest last, capped at WINDOW. See the header: RAW. */
  samples: readonly number[];
  /** Milliseconds to add to ball arrival before grading. */
  shift: number;
}

export const newCalibration = (): Calibration => ({ samples: [], shift: 0 });

/**
 * BEYOND THIS, IT WAS NOT A SWING AT A PITCH.
 *
 * ⚠️ THIS EXISTS BECAUSE IT HAPPENED. A sample of 4834ms went into the record
 * during testing: the browser throttles requestAnimationFrame in a tab that is
 * not focused, so the ball's arrival went by while the frame loop was asleep and
 * the next click registered five seconds late. That is not a hypothetical —
 * this game is built to be played in a tab somebody keeps switching away from,
 * which is the exact condition that produces it.
 *
 * A median resists outliers, and medianOffset() clamps its result to ±120
 * either way, so one of these could not move the correction. Enough of them
 * could: a player who alt-tabs away twenty times has a sample set whose middle
 * value is garbage, and the correction would then be a confident lie about his
 * monitor rather than a measurement of it.
 *
 * 400ms is well outside anything a person swinging at a pitch can produce — the
 * whole contact window is 80ms wide — and well inside the seconds-long values a
 * sleeping frame loop hands over.
 */
export const SANE_SAMPLE_MS = 400;

/**
 * Fold one raw swing in. Below MIN_SAMPLES the shift stays at zero rather than
 * being applied weakly — a half-trusted correction is a moving target.
 */
export function observe(c: Calibration, rawOffsetMs: number): Calibration {
  if (!Number.isFinite(rawOffsetMs)) return c;
  // Not a swing at a pitch. See SANE_SAMPLE_MS.
  if (Math.abs(rawOffsetMs) > SANE_SAMPLE_MS) return c;
  const samples = [...c.samples, rawOffsetMs].slice(-WINDOW);
  return {
    samples,
    shift: samples.length >= MIN_SAMPLES ? medianOffset(samples) : 0,
  };
}

/**
 * What to tell the player. The correction is never silent — a game that
 * secretly moved the strike window would be indistinguishable from a game with
 * a timing bug, which is precisely the complaint this exists to answer.
 */
export function calibrationLabel(c: Calibration): string {
  if (c.samples.length < MIN_SAMPLES) {
    return `calibrating ${c.samples.length}/${MIN_SAMPLES}`;
  }
  if (Math.abs(c.shift) < 4) return 'calibrated · no lag';
  // Positive shift means the player's swings read LATE, so the display is
  // behind and arrival is moved later to meet him.
  return `calibrated ${c.shift > 0 ? '+' : ''}${Math.round(c.shift)}ms`;
}

// ------------------------------------------------------------- persistence

const KEY = 'asb-timing';

export interface Settings {
  level: string;
  calibration: Calibration;
}

export const defaults = (): Settings => ({ level: 'veteran', calibration: newCalibration() });

/**
 * Off disk, validated. The shift reaches grade() through arrival, so a
 * hand-edited file could otherwise hand the player a 10-second window or a NaN
 * that grades every swing a miss for ever.
 */
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const s = JSON.parse(raw) as Partial<Settings> | null;
    const level = LEVELS.some((l) => l.key === s?.level) ? s!.level! : 'veteran';
    // Filtered by the same bar observe() uses, so a file written before that
     // bar existed — or edited by hand — cannot smuggle a five-second "swing"
    // back into the record.
    const samples = Array.isArray(s?.calibration?.samples)
      ? s!
          .calibration!.samples.filter(
            (n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= SANE_SAMPLE_MS,
          )
          .slice(-WINDOW)
      : [];
    const shift = Number(s?.calibration?.shift);
    return {
      level,
      calibration: {
        samples,
        // Recomputed rather than trusted where it can be: the samples are the
        // record and the shift is a fold of them, so a file whose shift
        // disagrees with its own samples loses the argument.
        shift:
          samples.length >= MIN_SAMPLES
            ? medianOffset(samples)
            : Number.isFinite(shift)
              ? Math.max(-MAX_CALIBRATION_MS, Math.min(MAX_CALIBRATION_MS, shift))
              : 0,
      },
    };
  } catch {
    return defaults();
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private window, or the disk said no. The setting still holds in memory. */
  }
}
