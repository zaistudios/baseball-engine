/**
 * Settings, persisted to localStorage.
 *
 * Two of these are accessibility rather than preference, and neither is
 * optional:
 *
 *  - `shake` off. Screen shake is a common motion-sickness trigger, and this
 *    game shakes on every contact. There has to be a way to turn it off.
 *  - `pitchSpeed`. Real flight is ~400ms and human reaction to a visual cue
 *    is ~250ms, so the default is genuinely hard. Slowing the ball is the
 *    difference between "difficult" and "unplayable" for a lot of people.
 *
 * ponytail: a plain object and one JSON blob. No settings framework, no
 * observable store — the game reads these live on every frame anyway.
 */

export interface Settings {
  /** 0 to 1. */
  volume: number;
  /** Multiplier on pitch speed. Below 1 gives the batter more time. */
  pitchSpeed: number;
  /** Screen shake. Off is an accessibility need, not a preference. */
  shake: boolean;
  /** The freeze on contact. Some people read it as lag. */
  hitstop: boolean;
  /** Show the millisecond read-out under the field. */
  timingBar: boolean;
  /**
   * Learned display latency, in ms, added to ball arrival before grading.
   * Render-to-photons is not free, so an honest swing reads late without it.
   * See FAULT 4 in core/timing.ts.
   */
  timingOffsetMs: number;
  /** Keep learning the offset from recent swings. Off once the slider moves. */
  autoCalibrate: boolean;
}

const DEFAULTS: Settings = {
  volume: 0.7,
  pitchSpeed: 0.75,
  shake: true,
  hitstop: true,
  timingBar: true,
  timingOffsetMs: 0,
  autoCalibrate: true,
};

const KEY = 'asb.settings.v1';

export const settings: Settings = load();

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    // Spread over the defaults so a stored blob from an older version, or a
    // hand-edited one missing keys, cannot produce an undefined setting.
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Private browsing, or storage disabled. The game still plays.
  }
}

export function resetSettings(): void {
  Object.assign(settings, DEFAULTS);
  saveSettings();
}

export const SPEED_LABELS: readonly { value: number; label: string }[] = [
  { value: 0.55, label: 'Batting practice' },
  { value: 0.75, label: 'Relaxed' },
  { value: 1.0, label: 'Real speed' },
  { value: 1.2, label: 'Fireballer' },
];
