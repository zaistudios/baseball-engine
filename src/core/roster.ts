/**
 * The player record: who a man is, what he can do, and what he looks like.
 * The ratings are read by the engine; the look never is (see game/look.ts).
 */

import type { BatSide } from './hit.ts';

export type Position = 'P' | 'C' | '1B' | '2B' | '3B' | 'SS' | 'LF' | 'CF' | 'RF' | 'DH';

/**
 * What a player IS, in a league the machines took over.
 *
 * This replaced the era tag. Chemistry needs an axis with tension on it, and
 * in this setting human-versus-machine is the tension — a flesh-and-blood
 * holdout batting next to a factory unit is the interesting pairing, and it
 * needs no time travel to justify.
 */
export type Build = 'human' | 'augmented' | 'machine';

export type Trait =
  | 'grit' // contact and clutch, no power
  | 'slugger' // swings for the fences
  | 'reader' // picks the pitcher apart
  | 'precision' // consistent, no nerves, no soul
  | 'showman' // thrives with people on base
  | 'speedster' // burns on basepaths, beats out grounders
  | 'utility' // plays any position cleanly, ultimate defensive versatility
  | 'cannon' // rifle arm, shuts down extra base advances
  | 'ironman'; // immune to slumps and fatigue

export interface Player {
  id: string;
  name: string;
  build: Build;
  trait: Trait;
  /**
   * THE RATING CARD. Same six as BatterStats in hit.ts, and in the same order —
   * power, contact, vision, clutch, bunt, speed. See that interface for what
   * each one is read by; a rating with no read site is a namecard decoration.
   */
  power: number;
  contact: number;
  /** Plate vision. Fewer swings and misses, not better contact. grade(). */
  vision: number;
  clutch: number;
  /** Laying one down. resolveBunt() in hit.ts. */
  bunt: number;
  /** Legs. Steals, the extra base, the double play, and beating out a bunt. */
  speed: number;
  /**
   * THE GLOVE. Range and hands as one multiplier around 1.0 — it decides which
   * position he is put at, how often a ball he reaches gets booted, and what a
   * runner risks going first to third on him. gloveOf() in game/defense.ts is
   * the only read site.
   *
   * ⚠️ OPTIONAL, AND ABSENT IS THE ORDINARY CASE. Left off, gloveOf() derives
   * the same number it always did — legs for range, build for hands — so the
   * 780 authored men in teams.ts and every league anybody has exported keep
   * playing EXACTLY as they do today. That is the whole reason this is a `?`
   * and not a required field: a defensive rating is worth having, and it is not
   * worth a four-hundred-literal migration to get one, nor worth silently
   * re-rating somebody else's league on load.
   *
   * ⚠️ IT IS A REAL RATING AND IT REACHES THE SIM, unlike `look` above. Editing
   * it changes who plays shortstop, the error rate behind your arm and the
   * club's rank on the pre-game card. That is the point of it.
   */
  glove?: number;
  /** Primary / preferred defensive position. Optional. */
  pos?: Position;
  /** Secondary defensive positions for versatile utility players. Optional. */
  secondaryPos?: readonly Position[];
  /**
   * Which side he hits from. Feeds platoonContact() in hit.ts.
   * 'S' indicates switch-hitting (always takes platoon advantage).
   */
  bats: BatSide;
  /**
   * One line of who he is, for the hover card.
   *
   * ponytail: written, not generated. Fifteen lines of prose beat a template
   * mill that would need a seed, a grammar and a shuffle to produce worse
   * sentences — and a bio that changed every time you hovered would read as a
   * bug. Swap in a generator if these should differ run to run.
   */
  bio: string;
  /**
   * WHAT HE LOOKS LIKE. Optional, and absent is the ordinary case — see
   * `lookFor()` in game/look.ts, which rolls a stable one off `id` so the whole
   * league is dressed with nothing stored.
   *
   * ⚠️ IT LIVES ON THE PLAYER RECORD ON PURPOSE. That is what makes a look ride
   * the league document somebody exports, and what makes a traded man keep his
   * face for free — the record is the thing that moves.
   *
   * ⚠️ PRESENTATION ONLY. Nothing here may be read by a rating, a roll, a stat,
   * or a save the simulation replays from. game/look.ts states the rule in full.
   */
  look?: Look;
}

/**
 * Six numbers that say how to assemble a picture of somebody. The indices are
 * read against the part set his `build` selects, so the same record means
 * different things on a human and on a machine.
 *
 * ⚠️ THE SHAPE LIVES HERE, WITH THE PLAYER RECORD; THE PARTS AND THE DRAWING
 * LIVE IN game/look.ts, so `core/` never has to import upward to describe
 * its own record.
 */
export interface Look {
  /** Body silhouette. Defaults biased by power and speed — never the reverse. */
  frame: number;
  /** Head, face, or optic array. */
  head: number;
  /** Hair, helmet, visor, antenna, vent stack — whatever the build allows. */
  crest: number;
  /** Palette index: skin on a human, alloy on a machine. */
  tone: number;
  /** Back number, 1–99. */
  number: number;
  /** 0..1 — dirt on a human, oxide on a machine. */
  wear: number;
  /** Accessory / gear index (e.g. eye black, wristbands, high socks, cyber visors, reactors). */
  accessory?: number;
  /** Batting stance index (0: standard, 1: crouch, 2: upright, 3: open). */
  stance?: number;
  /**
   * Pitching delivery index into DELIVERY_STYLE_NAMES in game/look.ts
   * (0 overhand, 1 three-quarter, 2 sidearm, 3 high kick, 4 slide step).
   * Left off, an arm's delivery is hashed from his id — see deliveryStyleOf().
   */
  delivery?: number;
}
