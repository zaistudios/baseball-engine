/**
 * The roster, and chemistry — the one synergy system the vertical slice needs.
 *
 * From the Fusion Concept note, twice over:
 *   "A vertical slice would be one short run, ONE SYNERGY SYSTEM."
 *   "Chemistry is the keystone. It IS roguelike synergy and the story engine
 *    at once. The coaching job becomes assembling a roster whose chemistry
 *    clicks."
 *
 * So: you no longer bat as one anonymous hitter. You have a NINE-SLOT LINEUP
 * of players drafted from across the three builds, and it cycles. Every at-bat
 * is somebody specific.
 *
 * THE SIGNATURE MECHANIC: mixing HUMANS, AUGMENTS AND MACHINES in one order.
 * Chemistry is read between ADJACENT LINEUP SLOTS, so the order you bat them
 * in is the build. That is the whole decision layer, and it costs one array.
 *
 * No licensing risk, per the note's own workaround: authentic archetypes and
 * stats, invented names.
 */

import type { Rng } from './rng.ts';
import type { BatterStats, Hand } from './hit.ts';
import { CATALOG, type PowerUp } from './run.ts';

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
  | 'showman'; // thrives with people on base

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
   * Which side he hits from. Feeds platoonContact() in hit.ts.
   *
   * ponytail: no switch hitters. A third value would need its own rule at
   * every read site — "S" is not a hand, it is "whichever hand is better right
   * now" — and the pool is fifteen players deep. Add `bats: 'S'` and resolve it
   * against the pitcher at the top of the at-bat when somebody is worth it.
   *
   * Six of the fifteen bat left, which is roughly the real league share, so a
   * random three-man opening lineup is usually mixed rather than uniform.
   */
  bats: Hand;
  /**
   * One line of who he is, for the hover card.
   *
   * ponytail: written, not generated. Fifteen lines of prose beat a template
   * mill that would need a seed, a grammar and a shuffle to produce worse
   * sentences — and a bio that changed every time you hovered would read as a
   * bug. Swap in a generator if these should differ run to run.
   */
  bio: string;
}

/** A batter with chemistry already applied. */
export interface LineupSlot {
  player: Player;
  stats: BatterStats;
  /** Why the numbers moved, for the UI to show. */
  chemistry: string[];
  /** The one item this player carries, if any. */
  item?: { id: string; name: string; synergised: boolean };
}

/**
 * Who is carrying what: player id -> item id.
 *
 * Items used to live in one global bucket on RunState, added to every batter
 * equally. Zane played it and called them meaningless, and the structure is
 * why: +0.10 contact spread across a nine-man order is invisible, and it
 * touched nothing the chemistry system knew about. An item now belongs to a
 * PLAYER, so buying one is a decision about WHO, and the item can read the
 * holder — see PowerUp.synergy.
 */
export type Equipment = Readonly<Record<string, string>>;

/** How many players you can carry. Three to start, six more to sign. */
export const MAX_ROSTER = 9;

// --------------------------------------------------------------- the pool

/** ponytail: invented names, real archetypes — the note's licensing dodge. */
export const POOL: readonly Player[] = [
  // HUMAN — the holdouts. Contact and nerve, no power. Outgunned and know it.
  { id: 'hu1', name: 'Cap Mullaney', build: 'human', trait: 'grit', power: 0.7, contact: 1.3, vision: 1.27, clutch: 1.1, bunt: 1.29, speed: 1.15, bats: 'R',
    bio: 'Player-manager of a team that folded under him. Has never once been rung up looking.' },
  { id: 'hu2', name: 'Deacon Roy', build: 'human', trait: 'grit', power: 0.75, contact: 1.25, vision: 1.24, clutch: 1.2, bunt: 1.12, speed: 0.95, bats: 'R',
    bio: 'Preaches Sundays, catches doubleheaders. Says the machines cannot be nervous, so they cannot be brave.' },
  { id: 'hu3', name: 'Wee Tom Barrow', build: 'human', trait: 'showman', power: 0.65, contact: 1.35, vision: 1.19, clutch: 1.0, bunt: 1.05, speed: 1.4, bats: 'L',
    bio: "Five foot four and the fastest pair of legs in the division. Tips his cap before he's reached the bag." },
  { id: 'hu4', name: 'Rosa Ivern', build: 'human', trait: 'reader', power: 0.8, contact: 1.28, vision: 1.31, clutch: 1.05, bunt: 1.17, speed: 1.2, bats: 'R',
    bio: 'Charts every pitcher she faces in a notebook she will not let anyone photograph.' },
  { id: 'hu5', name: 'Smoky Joe Vance', build: 'human', trait: 'slugger', power: 1.05, contact: 1.05, vision: 0.92, clutch: 0.95, bunt: 0.35, speed: 0.8, bats: 'L',
    bio: 'Last man to win a home run title on nothing but breakfast. Reminds you of it hourly.' },

  // AUGMENTED — grafted and calibrated. Power arrives, contact suffers.
  { id: 'au1', name: 'Dex Okafor', build: 'augmented', trait: 'slugger', power: 1.45, contact: 0.8, vision: 0.81, clutch: 1.0, bunt: 0.38, speed: 0.85, bats: 'R',
    bio: 'Traded both shoulders for a contract. Swings like the debt is due today.' },
  { id: 'au2', name: 'Marco Vela', build: 'augmented', trait: 'reader', power: 1.1, contact: 1.15, vision: 1.25, clutch: 0.9, bunt: 1.06, speed: 1.1, bats: 'L',
    bio: 'Optical graft reads spin at the release point. Still cannot hit a changeup.' },
  { id: 'au3', name: 'Ty Brennan', build: 'augmented', trait: 'slugger', power: 1.55, contact: 0.7, vision: 0.75, clutch: 1.05, bunt: 0.3, speed: 0.7, bats: 'R',
    bio: 'Four surgeries, three of them elective. Makes contact perhaps once a week, and the wall remembers it.' },
  { id: 'au4', name: 'Ravi Sundaram', build: 'augmented', trait: 'reader', power: 0.95, contact: 1.3, vision: 1.28, clutch: 1.0, bunt: 1.1, speed: 1.25, bats: 'R',
    bio: 'Took the smallest legal augment and out-hit everyone who took the largest.' },
  { id: 'au5', name: 'Junior Castellanos', build: 'augmented', trait: 'showman', power: 1.25, contact: 0.95, vision: 0.96, clutch: 1.25, bunt: 0.84, speed: 1.0, bats: 'L',
    bio: 'Third generation ballplayer, first to be built. The crowd has not decided how it feels.' },

  // MACHINE — factory units. Consistent, powerful, and nobody's teammate.
  { id: 'ma1', name: 'UNIT-7 "Cletus"', build: 'machine', trait: 'precision', power: 1.3, contact: 1.2, vision: 1.11, clutch: 1.0, bunt: 0.66, speed: 1.0, bats: 'R',
    bio: 'The clubhouse named him. He has filed no objection and no thanks.' },
  { id: 'ma2', name: 'Xandra Kō', build: 'machine', trait: 'slugger', power: 1.7, contact: 0.75, vision: 0.8, clutch: 0.9, bunt: 0.15, speed: 0.75, bats: 'L',
    bio: 'Built to one specification: exit velocity. Nobody specified what to do with two strikes.' },
  { id: 'ma3', name: 'Orbital Pete', build: 'machine', trait: 'showman', power: 1.4, contact: 0.9, vision: 0.93, clutch: 1.35, bunt: 0.96, speed: 1.5, bats: 'R',
    bio: 'Runs a highlight reel of himself on his own chest plate. Somehow the fans love it.' },
  { id: 'ma4', name: 'The Gantry', build: 'machine', trait: 'precision', power: 1.5, contact: 1.0, vision: 1.01, clutch: 1.0, bunt: 0.47, speed: 0.6, bats: 'L',
    bio: 'Two metres of factory frame that has never been thrown out at first, because it has never tried.' },
  { id: 'ma5', name: 'Nine-Iron Nadia', build: 'machine', trait: 'reader', power: 1.15, contact: 1.25, vision: 1.32, clutch: 1.05, bunt: 0.85, speed: 1.05, bats: 'R',
    bio: 'Decommissioned from a driving range and rebuilt for the league. The swing plane never changed.' },
];

// -------------------------------------------------------------- chemistry

export interface Chem {
  label: string;
  /** Reads a pair of adjacent players; null when it does not apply. */
  applies: (a: Player, b: Player) => boolean;
  power?: number;
  contact?: number;
  clutch?: number;
}

/**
 * ponytail: chemistry moves power, contact and clutch only — NOT vision, bunt
 * or speed. Those three were added as a rating card, not as nine more knobs for
 * nine chemistry rules to turn, and every rule below was measured against the
 * three it already had. Give a rule a `vision` field when one is actually worth
 * having; the resolve loop reads the keys it finds.
 */

/**
 * Chemistry is read between neighbours in the batting order.
 *
 * MIXING BUILDS IS THE POINT. Stacking one kind is safe and dull; a human
 * batting next to a machine is where both the payoffs and the clashes live.
 * That tension is the setting stated as a mechanic — the sport is being
 * automated, and your lineup is where that argument actually happens.
 */
export const CHEMISTRY: readonly Chem[] = [
  {
    label: 'Studying the Machine',
    applies: (a, b) => a.build === 'human' && b.build === 'machine',
    power: 0.3,
    contact: 0.1,
  },
  {
    label: 'Something to Prove',
    applies: (a, b) => a.build === 'human' && b.build === 'augmented',
    contact: 0.2,
    clutch: 0.1,
  },
  {
    label: 'Overclocked',
    applies: (a, b) => a.build === 'machine' && b.build === 'augmented',
    power: 0.25,
    contact: -0.05,
  },
  // Every build needs OUTGOING rules or it is chemistry-dead ahead of a
  // neighbour. Without these two, augmented contributed nothing in front of
  // anyone, and a lineup of one-of-each scored identically in every possible
  // order — which quietly made reordering pointless for a third of the pool.
  {
    label: 'Calibrated for Flesh',
    applies: (a, b) => a.build === 'augmented' && b.build === 'human',
    contact: 0.15,
    power: 0.1,
  },
  {
    label: 'Half a Machine Already',
    applies: (a, b) => a.build === 'augmented' && b.build === 'machine',
    power: 0.2,
    clutch: -0.1,
  },
  {
    label: 'Table Setter',
    applies: (a, b) => a.trait === 'grit' && b.trait === 'slugger',
    power: 0.2,
    clutch: 0.1,
  },
  {
    label: 'Plays to the Crowd',
    applies: (a, b) => a.trait === 'showman' && b.trait === 'showman',
    clutch: 0.3,
    contact: -0.1,
  },
  {
    label: 'Nobody Talks to the Robot',
    applies: (a, b) => a.build === 'machine' && b.build === 'human',
    contact: -0.15,
    clutch: -0.1,
  },
  {
    label: 'Same Film Room',
    applies: (a, b) => a.trait === 'reader' && b.trait === 'reader',
    contact: 0.18,
  },
];

/**
 * Resolve the lineup into batters, chemistry applied.
 *
 * Each slot is compared against the one BEHIND it in the order — that is what
 * makes batting order a decision rather than a list. The lineup wraps, so the
 * ninth hitter is protected by the leadoff man exactly as in real baseball.
 */
export function resolveLineup(
  lineup: readonly Player[],
  equipped: Equipment = {},
): LineupSlot[] {
  return lineup.map((player, i) => {
    const next = lineup[(i + 1) % lineup.length]!;
    const stats: BatterStats = {
      power: player.power,
      contact: player.contact,
      vision: player.vision,
      clutch: player.clutch,
      bunt: player.bunt,
      speed: player.speed,
    };
    const chemistry: string[] = [];

    if (lineup.length > 1) {
      for (const c of CHEMISTRY) {
        if (!c.applies(player, next)) continue;
        stats.power += c.power ?? 0;
        stats.contact += c.contact ?? 0;
        stats.clutch += c.clutch ?? 0;
        chemistry.push(c.label);
      }
    }

    // The item this player carries, folded in on top of chemistry. A matching
    // holder DOUBLES it — that is the whole reason to think about who gets
    // what instead of buying the biggest number on the shelf.
    const held = CATALOG.find((p) => p.id === equipped[player.id]);
    let item: LineupSlot['item'];
    if (held) {
      const synergised = synergises(held, player);
      const mult = synergised ? 2 : 1;
      stats.power += (held.power ?? 0) * mult;
      stats.contact += (held.contact ?? 0) * mult;
      stats.clutch += (held.clutch ?? 0) * mult;
      if (synergised) chemistry.push(held.synergy!.label);
      item = { id: held.id, name: held.name, synergised };
    }

    // A stat the engine reads must never go negative or the tables invert.
    stats.power = Math.max(0.1, stats.power);
    stats.contact = Math.max(0.1, stats.contact);
    stats.clutch = Math.max(0.1, stats.clutch);

    return { player, stats, chemistry, item };
  });
}

/**
 * Move a batter one slot up or down the order.
 *
 * This is the whole reason chemistry exists. Without it the order is whatever
 * you happened to sign in, and "the batting order is the build" is a claim the
 * player has no way to act on.
 */
export function reorder(lineup: readonly Player[], from: number, delta: number): Player[] {
  const to = from + delta;
  if (from < 0 || from >= lineup.length || to < 0 || to >= lineup.length) return [...lineup];
  const next = [...lineup];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

/** Total chemistry links in an order — the number the player is optimising. */
export function chemistryCount(lineup: readonly Player[]): number {
  return resolveLineup(lineup).reduce((a, s) => a + s.chemistry.length, 0);
}

// ------------------------------------------------------------- explain thyself

/**
 * Does this item double in this player's hands?
 *
 * One definition, used by the hit resolution, the shop card and the tooltip.
 * It was written out three times and the tooltip is the one that would have
 * quietly started lying when a fourth kind of synergy key got added.
 */
export function synergises(item: PowerUp, p: Player): boolean {
  const s = item.synergy;
  return !!s && (!s.build || s.build === p.build) && (!s.trait || s.trait === p.trait);
}

/** One chemistry rule, in words, from this player's point of view. */
export interface SynergyNote {
  label: string;
  /** 'gains' — the bonus lands on him. 'gives' — it lands on his neighbour. */
  direction: 'gains' | 'gives';
  /** Who has to be next to him for it to fire. */
  needs: string;
  /** The stat movement, already signed. */
  effect: string;
  /** False when the rule is a net negative — the clashes are worth flagging. */
  good: boolean;
}

const STAT_KEYS = ['power', 'contact', 'clutch'] as const;

const effectText = (c: Chem): string =>
  STAT_KEYS.filter((k) => c[k])
    .map((k) => `${c[k]! > 0 ? '+' : '−'}${Math.abs(c[k]!).toFixed(2)} ${k.slice(0, 3)}`)
    .join(', ');

const netEffect = (c: Chem): number =>
  STAT_KEYS.reduce((a, k) => a + (c[k] ?? 0), 0);

const article = (word: string): string => (/^[aeiou]/i.test(word) ? 'an' : 'a');

/**
 * Say what a group of players has in common, in as few words as possible.
 *
 * The chemistry rules key on build or on trait, so a matched set is almost
 * always "every machine" or "every slugger" — saying that is far more use to a
 * player than listing five names they have not signed yet.
 *
 * IT MUST COVER THE WHOLE CATEGORY BEFORE IT NAMES IT. Reporting the first
 * shared attribute is what a naive version did, and it described Table Setter
 * — which keys on the GRIT TRAIT — as applying to "a human", because both grit
 * players in the pool happen to be human. True today, a lie the moment a
 * gritty machine is signed, and the sort of wrong that teaches a player a rule
 * the game does not have. So a category is only named when the matched set is
 * every pool member of it, self excluded.
 */
function describeSet(subject: Player, matches: readonly Player[]): string {
  const ids = new Set(matches.map((p) => p.id));
  const covers = (group: readonly Player[]): boolean => {
    const g = group.filter((p) => p.id !== subject.id);
    return g.length === matches.length && g.every((p) => ids.has(p.id));
  };

  const builds = [...new Set(matches.map((p) => p.build))];
  if (builds.length === 1 && covers(POOL.filter((p) => p.build === builds[0]))) {
    return `${article(builds[0]!)} ${builds[0]}`;
  }
  const traits = [...new Set(matches.map((p) => p.trait))];
  if (traits.length === 1 && covers(POOL.filter((p) => p.trait === traits[0]))) {
    return `${article(traits[0]!)} ${traits[0]}`;
  }
  return matches.map((p) => p.name).join(', ');
}

/**
 * Every chemistry rule this player can be part of, explained.
 *
 * PROBED AGAINST THE REAL POOL rather than described by hand. `applies` is an
 * opaque predicate, so the only way to state what it does without risking a
 * lie is to ask it — run every other player past it in both directions and
 * report what came back. Add a chemistry rule and this explains it for free;
 * change one and this cannot fall out of step with it.
 *
 * DIRECTION IS THE THING PLAYERS GET WRONG. resolveLineup credits the bonus to
 * the FIRST argument, so `applies(him, other)` means he gains it with `other`
 * batting after him, and `applies(other, him)` means he is the one handing it
 * out. A tooltip that blurred those two would teach the batting order
 * backwards.
 */
export function playerSynergies(p: Player): SynergyNote[] {
  const others = POOL.filter((o) => o.id !== p.id);
  const notes: SynergyNote[] = [];

  for (const c of CHEMISTRY) {
    const effect = effectText(c);
    const good = netEffect(c) >= 0;

    const gains = others.filter((o) => c.applies(p, o));
    if (gains.length) {
      notes.push({
        label: c.label,
        direction: 'gains',
        needs: `with ${describeSet(p, gains)} batting after him`,
        effect,
        good,
      });
    }

    const gives = others.filter((o) => c.applies(o, p));
    if (gives.length) {
      notes.push({
        label: c.label,
        direction: 'gives',
        needs: `to ${describeSet(p, gives)} batting before him`,
        effect,
        good,
      });
    }
  }

  return notes;
}

/** Items that double in this player's hands. */
export const doublingItems = (p: Player): PowerUp[] =>
  CATALOG.filter((i) => synergises(i, p));

/** Offer players to draft, excluding anyone already signed. */
export function draftOffer(signed: readonly Player[], rng: Rng, count = 3): Player[] {
  const ids = new Set(signed.map((p) => p.id));
  const pool = POOL.filter((p) => !ids.has(p.id));
  const offer: Player[] = [];
  while (offer.length < count && offer.length < pool.length) {
    const pick = rng.pick(pool.filter((p) => !offer.includes(p)));
    offer.push(pick);
  }
  return offer;
}

/**
 * The three you start with, drawn at random.
 *
 * Was a fixed trio of human holdouts. Random means the opening chemistry — and
 * so the build you are pushed toward — differs every run, which is the whole
 * point of the shop existing. ponytail: no rarity floor, no "one of each
 * build" guarantee. Add one when an all-machine open proves unwinnable.
 */
export function startingLineup(rng: Rng, count = 3): Player[] {
  return draftOffer([], rng, count);
}
