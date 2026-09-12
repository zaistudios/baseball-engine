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
 * ⚠️ AND IT IS THE MOUND'S WINDOW TOO, SINCE core/delivery.ts. The release is
 * the same kind of act as the swing — a press measured in milliseconds against
 * windows — so one difficulty knob scales both, and `assist` is the number it
 * scales them by. The rule above survives structurally rather than by care:
 * watch mode never grades a release at all, it throws at 'good' directly, so
 * there is no path on which a wider window could reach the opposition's arm.
 * The blurbs below still talk about squaring the ball up because that is the
 * half a player feels first; both windows move together.
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

// ------------------------------------------------------------ pitch speed

/**
 * HOW FAST THE BALL COMES, and it is a different question from how wide the
 * window is. Both buy a struggling hitter the same thing — a chance — and they
 * buy it in two places that are not interchangeable:
 *
 *   THE ASSIST above widens the window. It forgives a swing you already
 *   committed to, and it does nothing at all for a pitch you never read.
 *
 *   THIS stretches the FLIGHT. The window stays ±12/±35/±80ms of real
 *   milliseconds and squaring one up is exactly as precise an act as it was —
 *   you simply get longer to decide what the pitch is before you have to be
 *   that precise. That is what a batting cage is, and it is the one thing a
 *   game with a 120ms bat and a 400ms flight ought to have had first.
 *
 * ⚠️ IT STRETCHES THE BALL AND NOT THE BAT, and the asymmetry is the feature.
 * flightScale()'s note in main.ts is emphatic that the bat must move in
 * lockstep with the ball — that rule belongs to WATCH MODE, where the computer
 * swings on an unscaled offset and a bat that did not compress could not
 * physically arrive. Nobody is watching here: a human is holding the bat, his
 * reflexes are the length they are, and slowing his swing down with the pitch
 * would hand back the reading time this exists to give him. The roguelike half
 * of this repo settled the same question the same way — see `pitchSpeed` in
 * web/settings.ts, whose batterTravel() is likewise unscaled.
 *
 * ⚠️ AND IT APPLIES TO YOUR AT-BATS ONLY. readScale() in main.ts returns 1 in
 * watch mode and on your half in the field, so nothing here can reach the
 * computer's hitters or the game you left running.
 */
export interface PitchSpeed {
  value: number;
  name: string;
  blurb: string;
}

/**
 * ⚠️ FULL IS 1.0 AND IS THE DEFAULT, for the same reason VETERAN is: the game
 * everybody has played is still exactly the game until somebody asks for
 * something else. Every balance number in this project's notes was measured
 * here.
 */
export const PITCH_SPEEDS: readonly PitchSpeed[] = [
  { value: 1, name: 'FULL', blurb: 'Real flight. The game as it is balanced.' },
  { value: 0.85, name: 'EASED', blurb: 'A shade longer to read it. The window is unchanged.' },
  { value: 0.7, name: 'SLOW', blurb: 'Half again the flight time. Good for learning a pitch.' },
  { value: 0.55, name: 'CAGE', blurb: 'Batting practice. Nearly twice the look.' },
];

/** The slowest the ball may be asked to go, so a bad file cannot stop it. */
export const SLOWEST_PITCH = 0.4;

export const pitchSpeedOf = (value: number): PitchSpeed =>
  PITCH_SPEEDS.find((s) => s.value === value) ?? PITCH_SPEEDS[0]!;

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
export function calibrationLabel(c: Calibration, locked = false): string {
  if (c.samples.length < MIN_SAMPLES) {
    // ⚠️ AND IT SAYS SO WHEN THE COUNT HAS STOPPED. Holding before the twelfth
    // swing freezes the tally where it stands — which, unlabelled, is a
    // progress bar that silently gave up. The word is what stops a player
    // waiting out a number that is never going to move.
    return `calibrating ${c.samples.length}/${MIN_SAMPLES}${locked ? ' · paused' : ''}`;
  }
  const tail = locked ? ' · held' : '';
  if (Math.abs(c.shift) < 4) return `calibrated · no lag${tail}`;
  // Positive shift means the player's swings read LATE, so the display is
  // behind and arrival is moved later to meet him.
  return `calibrated ${c.shift > 0 ? '+' : ''}${Math.round(c.shift)}ms${tail}`;
}

/**
 * THE LOCK, and it is the answer to a complaint that only shows up in play.
 *
 * ⚠️ observe() NEVER STOPS. The window is rolling by design — the number it
 * measures belongs to a monitor and a monitor can be swapped — so the shift
 * keeps moving for as long as you keep swinging. Watched from the batter's
 * box that reads as the game changing its mind: a session settled on +79ms,
 * then +78, then +75 over three more swings, and a player trying to learn a
 * window is trying to learn one that is walking away from him.
 *
 * ⚠️ AND THE DRIFT IS NOT NOISE. A player who has just been corrected swings
 * differently, which is the correction's whole purpose — so his new offsets
 * are a measurement of the CORRECTED game, and folding them back in is the
 * same tail-chasing the header warns about one layer up. A median over a
 * forty-swing window does not chase it to zero, but it does creep.
 *
 * So: measure it, apply it, then let the player nail it down. Off by default —
 * a first-time player should never have to find a setting to get the fix.
 *
 * It is `Settings.holdCalibration` below; there is no function here because a
 * boolean does not need one.
 */

// ------------------------------------------------------------- persistence

const KEY = 'asb-timing';

export interface Settings {
  level: string;
  calibration: Calibration;
  /** Multiplier on ball flight for YOUR at-bats. Below 1 is slower. */
  pitchSpeed: number;
  /** Stop folding new swings into the calibration. See the note on LOCK. */
  holdCalibration: boolean;
}

export const defaults = (): Settings => ({
  level: 'veteran',
  calibration: newCalibration(),
  pitchSpeed: 1,
  holdCalibration: false,
});

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
    // ⚠️ CLAMPED, NOT MATCHED TO THE LIST. A hand-edited file holding 0.62 is
    // a perfectly playable game and there is no reason to throw it away; a
    // file holding 0 or -3 stops the ball arriving at all, and THAT is what
    // this is for. Same shape as the shift below: validate the range the
    // engine needs, not the menu's taste.
    const rawSpeed = Number(s?.pitchSpeed);
    const pitchSpeed =
      Number.isFinite(rawSpeed) && rawSpeed > 0
        ? Math.max(SLOWEST_PITCH, Math.min(1, rawSpeed))
        : 1;
    return {
      level,
      pitchSpeed,
      holdCalibration: s?.holdCalibration === true,
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
