/**
 * THE CLUB EDITOR, minus the screen — what is editable, and how an edit is
 * applied.
 *
 * ⚠️ WHY THIS EXISTS WHEN league.ts ALREADY DOES. league.ts is the whole
 * customization ENGINE and none of it is duplicated here: it validates, it
 * stores, it round-trips, and it already accepts a whole league or one club.
 * What it does not have is a way in that is not a text box. Editing a club
 * through the paste box means holding a quarter-megabyte JSON document in a
 * text editor and finding the right one of thirty by hand, which is a fine
 * transport format and a terrible interface.
 *
 * So this file answers exactly one question — WHICH FIELDS ARE EDITABLE, and
 * what shape is each one — and hands back edited clubs. It does not validate
 * and it does not save. The screen serialises the league it gets back and puts
 * it through saveCustomLeague() like any other paste, so there is still exactly
 * one gate and one storage path, and an edit made here is held to the same
 * rules as a document typed by hand.
 *
 * ⚠️ THE VOCABULARIES ARE IMPORTED FROM league.ts, NOT RETYPED. A dropdown
 * offering a build the validator rejects — or missing one it accepts — is the
 * exact failure mode a second copy of these lists produces, and it would show
 * up as "the editor saved something the game then refused to load". They are
 * exported from the validator for this, so the list you can pick from IS the
 * list that is checked.
 *
 * ponytail: a table of fields and four immutable setters. No form library, no
 * schema DSL, no dirty-tracking, no undo stack. The screen renders the table
 * and calls a setter; the league in progress is a plain deep-cloned array.
 */

import type { Team } from './teams.ts';
import type { Build, Look, Player } from '../core/roster.ts';
import type { Pitcher } from '../core/pitcher.ts';
import type { Identity } from './identity.ts';
import { ALL_PITCH_TYPES } from '../core/hitTables.ts';
import {
  PART_KEYS,
  clubBuild,
  lookFor,
  lookForArm,
  partNames,
  safeLook,
  uniformFor,
} from './look.ts';
import {
  BUILDS,
  TRAITS,
  HANDS,
  SIGNATURES,
  TELLS,
  BAT_RATINGS,
  BAT_OPTIONAL,
  ARM_OPTIONAL,
  IDENTITY_KNOBS,
  FENCE_MIN_FT,
  FENCE_MAX_FT,
  FOUL_MAX,
  LINEUP_SIZE,
} from './league.ts';

// ------------------------------------------------------------- the fields

/**
 * One editable thing.
 *
 * `kind` is what the screen draws and what coerce() does with the string a form
 * control hands back — the two have to agree, so they are one field rather than
 * two. `optional` marks the ratings league.ts allows to be left off entirely;
 * blanking one of those removes the key rather than writing a zero, which is
 * the difference between "league average" and "no stamina at all".
 */
export interface Field {
  key: string;
  label: string;
  /**
   * ⚠️ 'part' IS A CHOICE WHOSE VALUE IS AN INDEX. The screen shows the part's
   * NAME and the object stores its position, because that is what keeps a look
   * thirty bytes and what survives somebody renaming "vent stack". It is its
   * own kind rather than a flag on 'choice' so coerce() cannot forget to turn
   * the string back into a number — which would write `frame: "2"` into a
   * league document and fail nowhere until it was drawn.
   *
   * 'colour' is a native `<input type="color">`. No picker library.
   */
  kind: 'text' | 'line' | 'number' | 'choice' | 'part' | 'colour';
  /** For 'choice'. Always a list league.ts will accept. For 'part', the names. */
  choices?: readonly string[];
  /** For 'number'. A sane band for the control — NOT a validation rule. */
  min?: number;
  max?: number;
  step?: number;
  /** May be absent from the object entirely. See coerce(). */
  optional?: boolean;
}

const rating = (key: string, label: string, optional = false): Field => ({
  key,
  label,
  kind: 'number',
  min: 0,
  max: 2.5,
  step: 0.01,
  ...(optional ? { optional: true } : {}),
});

/** A club's own fields. The roster is handled separately — see GROUPS. */
export const CLUB_FIELDS: readonly Field[] = [
  { key: 'name', label: 'Club name', kind: 'text' },
  // Four characters, because league.ts caps it there: it is a column in the
  // line score and a row in the standings, both laid out for three letters.
  { key: 'abbr', label: 'Abbr', kind: 'text' },
];

/**
 * The identity block. Optional on a Team, so the screen has to be able to add
 * and remove the whole thing — see withIdentity().
 */
export const IDENTITY_FIELDS: readonly Field[] = [
  { key: 'name', label: 'Identity', kind: 'text' },
  { key: 'blurb', label: 'How they play', kind: 'line' },
  // ⚠️ NOT OPTIONAL, AND NOT ORNAMENT. checkIdentity() requires it and
  // moments.ts prints it — see both. It is the job description the manager
  // moment offers, so it is written in the voice of a man you would hire.
  { key: 'hire', label: 'The man who plays this way', kind: 'line' },
  ...IDENTITY_KNOBS.map((k) => rating(k, k, true)),
];

/**
 * The park block — a NAME, THREE FENCES AND FOUL GROUND, and nothing else.
 *
 * ⚠️ THERE IS NO POWER FIELD ON THIS SCREEN AND THERE MUST NOT BE. What a park
 * does to the ball is derived from its fences by parkPower() in teams.ts, so a
 * multiplier here would be a second knob turning the same thing — a 310-foot
 * wall and a 0.95 power factor on the same club is a building that says two
 * different things about itself. Move a fence and the factor follows.
 *
 * ⚠️ NOTHING IS optional. checkPark() requires all four the moment the block
 * exists, because wallAt() interpolates right field out of `right` and there is
 * no honest default for a fence nobody wrote. See the note there.
 *
 * The number bands are the control's, and they are the validator's real bounds
 * rather than a taste — see FENCE_MIN_FT and FOUL_MAX in league.ts. A step of a
 * foot is the resolution anybody actually thinks in.
 */
const fence = (key: string, label: string): Field => ({
  key,
  label,
  kind: 'number',
  min: FENCE_MIN_FT,
  max: FENCE_MAX_FT,
  step: 1,
});

export const PARK_FIELDS: readonly Field[] = [
  { key: 'name', label: 'Park', kind: 'text' },
  fence('left', 'Left field (ft)'),
  fence('center', 'Centre field (ft)'),
  fence('right', 'Right field (ft)'),
  { key: 'foul', label: 'Foul ground', kind: 'number', min: 0, max: FOUL_MAX, step: 0.05 },
];

/**
 * What a new park starts as when somebody names one.
 *
 * ⚠️ IT IS NOT A 400-FOOT BOWL, AND THAT WAS THE FIRST GUESS AND A TRAP. 400
 * feet in every direction is what a club with NO park plays in — but only
 * because a club with no park skips parkPower() entirely. Written down as an
 * actual park, 400/400/400 has a size of 400 against a league mean of 362, so
 * it derives a multiplier of 0.89: naming your park would have quietly cost
 * your club eleven percent of its offence, with every fence still reading like
 * a default. park.test.ts is what caught it.
 *
 * 330/410/330 is the shape whose size IS the league mean, so it derives exactly
 * 1.0000 — the one layout that genuinely changes nothing. Naming a park must
 * not move a club; editing its fences is what does that, and they are right
 * there.
 */
export const BLANK_PARK = { name: '', left: 330, center: 410, right: 330, foul: 1 };

export const HITTER_FIELDS: readonly Field[] = [
  { key: 'name', label: 'Name', kind: 'text' },
  { key: 'bats', label: 'Bats', kind: 'choice', choices: HANDS },
  { key: 'build', label: 'Build', kind: 'choice', choices: BUILDS },
  { key: 'trait', label: 'Trait', kind: 'choice', choices: TRAITS },
  ...BAT_RATINGS.map((k) => rating(k, k)),
  ...BAT_OPTIONAL.map((k) => rating(k, k, true)),
  { key: 'bio', label: 'Bio', kind: 'line' },
];

export const ARM_FIELDS: readonly Field[] = [
  { key: 'name', label: 'Name', kind: 'text' },
  /**
   * ⚠️ THE ARM GETS A BUILD — 2026-09-17, and it is the field that unlocked
   * half the league. Without it `Pitcher` had no lore tier at all, an arm's
   * parts were borrowed from his club's modal build, and the look block in the
   * editor was hitters only: 390 of the 780 men in the league could not be
   * dressed. It is the SETTING and not a rating — see the note on Pitcher.build
   * — and nothing in the sim may read it.
   */
  { key: 'build', label: 'Build', kind: 'choice', choices: BUILDS },
  { key: 'throws', label: 'Throws', kind: 'choice', choices: HANDS },
  { key: 'signature', label: 'Signature', kind: 'choice', choices: SIGNATURES },
  { key: 'tellTiming', label: 'Tell', kind: 'choice', choices: TELLS },
  rating('zoneRate', 'control'),
  ...ARM_OPTIONAL.map((k) => rating(k, k, true)),
  { key: 'putaway', label: 'Out pitch', kind: 'choice', choices: ALL_PITCH_TYPES },
  { key: 'blurb', label: 'Blurb', kind: 'line' },
];

/**
 * The arsenal, as one field per pitch.
 *
 * ⚠️ IT IS A SHARE, NOT A PROBABILITY, and the screen must not normalise these
 * to add to one. arsenalOf() in pitcher.ts divides by the total itself, so
 * "fastball 6, slider 3, curveball 1" is a legal and readable way to write a
 * mix — and a screen that helpfully rescaled them would fight whoever typed it.
 */
/**
 * THE KIT — three colours, and every man on the club wears them.
 *
 * ⚠️ IT IS ON THE CLUB AND NOT ON THE PLAYER, which is the whole economy of the
 * thing: thirty uniforms dress 780 men, and a jersey change is one edit instead
 * of 780. See look.ts.
 *
 * ⚠️ NATIVE COLOUR INPUTS, and no picker library. `<input type="color">` is in
 * every browser this runs in, works offline, and hands back exactly the
 * `#rrggbb` the canvas wants.
 */
export const UNIFORM_FIELDS: readonly Field[] = [
  { key: 'primary', label: 'Jersey', kind: 'colour' },
  { key: 'secondary', label: 'Trousers', kind: 'colour' },
  { key: 'trim', label: 'Trim', kind: 'colour' },
];

/**
 * WHAT A MAN LOOKS LIKE — the four picked parts, his number and his wear.
 *
 * ⚠️ IT IS A FUNCTION OF `build`, WHICH IS WHY IT IS NOT A CONSTANT TABLE like
 * every other block in this file. A human picks from hair and caps and a
 * machine picks from vent stacks and antennae; one shared list would offer a
 * holdout a sensor rail. The setting decides the parts — see look.ts.
 *
 * ⚠️ CHANGING A MAN'S BUILD CHANGES WHAT THESE MEAN. The indices are read
 * against the new set, safeLook() clamps anything out of range, and nothing
 * breaks — he is simply a different-looking man, which is the honest result of
 * turning a person into a machine.
 */
export function lookFields(build: Build): readonly Field[] {
  return [
    ...PART_KEYS.map(
      (k): Field => ({
        key: k,
        label: k === 'tone' ? 'skin / alloy' : k,
        kind: 'part',
        choices: partNames(build, k),
      }),
    ),
    { key: 'number', label: 'Number', kind: 'number', min: 0, max: 99, step: 1 },
    { key: 'wear', label: 'Dirt / rust', kind: 'number', min: 0, max: 1, step: 0.05 },
  ];
}

export const ARSENAL_FIELDS: readonly Field[] = ALL_PITCH_TYPES.map((p) => ({
  key: p,
  label: p,
  kind: 'number' as const,
  min: 0,
  max: 10,
  step: 0.1,
}));

// ------------------------------------------------------------- the roster

export type Group = 'lineup' | 'bench' | 'rotation' | 'bullpen';

/**
 * The four lists a club carries, and what each one is allowed to be.
 *
 * ⚠️ EVERY BOUND HERE IS league.ts's, COPIED DELIBERATELY AND FOR ONE REASON:
 * so the screen can grey out a button instead of letting somebody build a club
 * the save is then going to refuse. checkClub() is still the authority and
 * still runs — this is the editor being polite about it, not a second opinion.
 * If a rule there moves, move it here too; editor.test.ts checks that adding
 * and removing at the bounds behaves, not that the bounds are right.
 */
export const GROUPS: readonly {
  key: Group;
  label: string;
  of: 'hitter' | 'arm';
  min: number;
  max: number;
}[] = [
  { key: 'lineup', label: 'LINEUP', of: 'hitter', min: LINEUP_SIZE, max: LINEUP_SIZE },
  { key: 'bench', label: 'BENCH', of: 'hitter', min: 0, max: 8 },
  // ⚠️ THE CAPS ARE ABOVE WHAT A CLUB SHIPS WITH, AND THEY HAVE TO BE. The
  // shipped bullpen used to be three against a cap of eight; it is eight now
  // (see depth.ts), and a cap equal to the default is an ADD button that is
  // greyed out the first time anybody opens the panel. Room for a sixth
  // starter and four more arms is room to actually build something.
  { key: 'rotation', label: 'ROTATION', of: 'arm', min: 1, max: 8 },
  { key: 'bullpen', label: 'BULLPEN', of: 'arm', min: 1, max: 12 },
];

export const groupOf = (key: Group) => GROUPS.find((g) => g.key === key)!;

// --------------------------------------------------------- reading a value

/** What the screen should show in the control for `field` on `obj`. */
export function valueOf(obj: Record<string, unknown>, f: Field): string {
  const v = obj[f.key];
  if (v === undefined || v === null) return '';
  return String(v);
}

/**
 * Turn what a form control handed back into what the object should hold.
 *
 * ⚠️ AN EMPTY OPTIONAL NUMBER IS A DELETION, NOT A ZERO. `stamina` left off
 * means league average — every read site defaults it to 1.0 — while `stamina: 0`
 * is an arm that is exhausted before he throws a pitch. A number input hands
 * back "" when it is cleared, and writing that through as 0 would quietly
 * ruin a pitcher every time somebody selected the field and hit delete.
 */
export function coerce(f: Field, raw: string): unknown {
  if (f.kind === 'number') {
    if (raw.trim() === '') return f.optional ? undefined : 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  // A part select carries the index in its value and the name in its label, so
  // what comes back is "2" and what the look stores is 2. See Field.kind.
  if (f.kind === 'part') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  return raw;
}

/**
 * WHICH PART SET A MAN IS DRAWN FROM — hitter or arm, in one place.
 *
 * ⚠️ A HITTER WITH NO BUILD IS A HUMAN; AN ARM WITH NO BUILD IS HIS CLUB'S.
 * Those two defaults are not interchangeable and getting it wrong is silent:
 * `Pitcher.build` is optional, so every arm in every league written before
 * 09-17 has none, and defaulting him to 'human' would offer a Detroit Foundry
 * reliever a list of haircuts and then draw him as a chassis. His club's modal
 * build is what lookForArm() has always drawn him as, so it is what the form
 * has to agree with.
 *
 * Three functions below need this answer and they must not each compute it.
 */
export function buildOf(who: Player | Pitcher, club: Team, group: Group): Build {
  const written = (who as { build?: Build }).build;
  if (written) return written;
  return groupOf(group).of === 'arm' ? clubBuild(club) : 'human';
}

/**
 * What the screen should show in a part select — the index, as a string.
 *
 * ⚠️ A MAN WITH NO STORED LOOK STILL HAS ONE, and this is where that shows up.
 * lookFor() rolls him a stable face off his id, so opening the editor on an
 * untouched player shows the face he has actually been wearing all along rather
 * than a form full of zeroes that would redress him the moment it was saved.
 *
 * ⚠️ AND AN ARM GOES THROUGH lookForArm(), NOT lookFor() — 09-17. lookFor()
 * reads `p.id`, `p.power` and `p.speed` to bias the silhouette, and a `Pitcher`
 * has none of the three: it would roll off `undefined` and arrive as NaN, which
 * safeLook() then clamps to a form full of zeroes. That is the exact failure
 * the note above says this function exists to prevent, one record type over.
 */
export const lookOf = (who: Player | Pitcher, club: Team, group: Group): Look =>
  safeLook(
    groupOf(group).of === 'arm' ? lookForArm(who as Pitcher, club) : lookFor(who as Player),
    buildOf(who, club, group),
  );

// ------------------------------------------------------------ the setters

/** A shallow copy with one key set — or removed, when the value is undefined. */
function put<T extends object>(obj: T, key: string, value: unknown): T {
  const next = { ...obj } as Record<string, unknown>;
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next as T;
}

/** One of the club's own fields. */
export const withClubField = (club: Team, key: string, value: unknown): Team =>
  put(club, key, value);

/**
 * One identity field — creating the block if the club had none, and dropping it
 * again once it is empty.
 *
 * ⚠️ AN IDENTITY THAT EXISTS BUT HAS NO NAME IS A VALIDATION ERROR, not an
 * absent identity: checkIdentity() requires a name and a blurb the moment the
 * key is present at all. So clearing both has to remove the whole block rather
 * than leave `{}` behind, or the club stops saving and the screen has no field
 * left to point at.
 */
export function withIdentityField(club: Team, key: string, value: unknown): Team {
  const base = club.identity ?? { name: '', blurb: '', hire: '' };
  const next = put(base, key, value) as Record<string, unknown>;
  // ⚠️ ALL THREE WRITTEN FIELDS HAVE TO BE EMPTY, not just two. `hire` joined
  // them when checkIdentity() started requiring it; a bare check that ignored
  // it would drop a block somebody had written a hire line into the moment
  // they cleared the name, and the line would be gone with no way back.
  const bare = ['name', 'blurb', 'hire'].every((k) => !String(next[k] ?? '').trim());
  return put(club, 'identity', bare ? undefined : next);
}

/**
 * One park field — same create-and-drop dance as withIdentityField().
 *
 * ⚠️ THE NAME IS WHAT HOLDS THE BLOCK OPEN. checkPark() requires a name the
 * moment the key is present at all, so clearing it has to take the whole block
 * away rather than leave `{ power: 1.1 }` behind for the save to refuse. A park
 * with factors and no name is not a park, it is a club that will not load.
 */
export function withParkField(club: Team, key: string, value: unknown): Team {
  const base: Record<string, unknown> = { ...(club.park ?? BLANK_PARK) };
  const next = put(base, key, value);
  return put(club, 'park', String(next['name'] ?? '').trim() ? next : undefined);
}

/**
 * Put a whole identity on a club — the editor's preset gesture.
 *
 * ⚠️ IT COPIES, IT DOES NOT REFERENCE. What lands on the club is a plain object
 * the next keystroke can edit, which is the entire difference between "one of
 * the eight archetypes" and "somewhere to start". A club holding a reference
 * into IDENTITIES would serialise the same and then surprise whoever edited it
 * by moving the other twenty-nine clubs that shared it.
 */
export const withIdentity = (club: Team, id: Identity): Team =>
  put(club, 'identity', { ...id });

/** One field on one person in one of the four lists. */
export function withPersonField(
  club: Team,
  group: Group,
  index: number,
  key: string,
  value: unknown,
): Team {
  const list = [...((club[group] ?? []) as readonly object[])];
  const who = list[index];
  if (!who) return club;
  list[index] = put(who, key, value);
  return put(club, group, list);
}

/**
 * One uniform field — same create-and-drop shape as identity and park.
 *
 * ⚠️ IT SEEDS FROM uniformFor(), NOT FROM BLANK. A club with no `uniform` is
 * already wearing one of the sixteen hashed kits on screen, so opening the
 * block on three black swatches and forcing somebody to rebuild the kit they
 * can already see would be a lie about the current state. Touching one colour
 * materialises the kit it was already wearing, plus that change.
 */
export function withUniformField(club: Team, key: string, value: unknown): Team {
  const next = put({ ...uniformFor(club) }, key, value);
  return put(club, 'uniform', next);
}

/** Drop the block, so the club goes back to the kit its abbr hashes to. */
export const withoutUniform = (club: Team): Team => put(club, 'uniform', undefined);

/**
 * One field of one man's look.
 *
 * ⚠️ THE FIRST EDIT MATERIALISES THE WHOLE RECORD. Writing only the changed key
 * would leave `{ crest: 3 }` on the player, and lookFor() returns a stored look
 * WHOLE — so the other five fields would read as undefined, clamp to zero, and
 * the one part somebody picked would arrive attached to a man they had never
 * seen. Seeding from lookOf() means the edit is a change to the face he already
 * had, which is what it looks like on screen.
 */
export function withLookField(
  club: Team,
  group: Group,
  index: number,
  key: string,
  value: unknown,
): Team {
  const list = [...((club[group] ?? []) as readonly Player[])];
  const who = list[index];
  if (!who) return club;
  const build = buildOf(who, club, group);
  const next = put(lookOf(who, club, group), key, value);
  list[index] = { ...who, look: safeLook(next, build) };
  return put(club, group, list);
}

/**
 * Give him a face nobody chose. The GDD asked for Randomize on the character
 * screen and it is the cheapest way to see what the part sets actually hold.
 *
 * ⚠️ IT ROLLS FROM A THROWAWAY SEED, not from his id — lookFor()'s roll is
 * deterministic by design, so re-rolling off the id would hand back the same
 * face every time and read as a dead button.
 */
export function withRandomLook(
  club: Team,
  group: Group,
  index: number,
  roll: () => number,
): Team {
  const list = [...((club[group] ?? []) as readonly Player[])];
  const who = list[index];
  if (!who) return club;
  const pick = (n: number): number => Math.min(n - 1, Math.floor(roll() * n));
  // buildOf(), not who.build — an arm's is optional and RANDOMIZE on one with
  // none would call partNames(undefined) and roll him out of an empty list.
  const counts = PART_KEYS.map((k) => partNames(buildOf(who, club, group), k).length);
  list[index] = {
    ...who,
    look: {
      frame: pick(counts[0]!),
      head: pick(counts[1]!),
      crest: pick(counts[2]!),
      tone: pick(counts[3]!),
      number: 1 + pick(99),
      wear: roll(),
    },
  };
  return put(club, group, list);
}

/** One pitch's share in an arm's mix. */
export function withArsenalShare(
  club: Team,
  group: Group,
  index: number,
  pitch: string,
  share: number,
): Team {
  const list = [...((club[group] ?? []) as readonly Pitcher[])];
  const arm = list[index];
  if (!arm) return club;
  list[index] = { ...arm, arsenal: { ...arm.arsenal, [pitch]: share } };
  return put(club, group, list);
}

// ------------------------------------------------------- adding a new one

/**
 * ⚠️ EVERY ONE OF THESE IS UNIQUE ACROSS THE WHOLE LEAGUE, NOT PER CLUB, and
 * this is the rule the editor was written twice for. checkUnique() holds player
 * ids, HITTER NAMES, PITCHER NAMES, club names and club abbrs each to their own
 * map spanning all thirty clubs — so a fresh man called "New Hitter" is fine
 * once and a validation error the second time, on any club at all. The first
 * cut of blankHitter() only checked the club it was being added to; adding
 * three men to one bench produced a league that would not load, and
 * editor.test.ts caught it because every case there ends at checkLeague().
 */
function takenIn(league: readonly Team[], what: 'id' | 'hitter' | 'arm'): Set<string> {
  const out = new Set<string>();
  for (const t of league) {
    if (what === 'arm') {
      for (const p of [...t.rotation, ...t.bullpen]) out.add(p.name);
    } else {
      for (const p of [...t.lineup, ...(t.bench ?? [])]) out.add(what === 'id' ? p.id : p.name);
    }
  }
  return out;
}

/**
 * The first `stem`, `stem 2`, `stem 3`… nobody is using.
 *
 * Deterministic, which is what makes it testable — `crypto.randomUUID()` would
 * do the job for the id and could not be asserted on, and it is no help at all
 * for the NAME, which a person has to read.
 */
function free(taken: ReadonlySet<string>, stem: string, join = ' '): string {
  if (!taken.has(stem)) return stem;
  for (let n = 2; ; n++) {
    const next = `${stem}${join}${n}`;
    if (!taken.has(next)) return next;
  }
}

/** A free player id, scoped to the club so the league reads as it is written. */
export const freeId = (league: readonly Team[], club: Team): string =>
  free(takenIn(league, 'id'), `${club.abbr.toLowerCase()}-new`, '-');

/** A hitter with every field the validator asks for, all of them league average. */
export function blankHitter(league: readonly Team[], club: Team): Player {
  return {
    id: freeId(league, club),
    name: free(takenIn(league, 'hitter'), 'New Hitter'),
    build: 'human',
    trait: 'grit',
    bats: 'R',
    power: 1,
    contact: 1,
    vision: 1,
    clutch: 1,
    bunt: 1,
    speed: 1,
    bio: 'Signed out of nowhere in particular.',
  };
}

/**
 * An arm with every field the validator asks for.
 *
 * The arsenal is not empty and the putaway is in it — both are things
 * checkArm() refuses, and a freshly added pitcher that cannot be saved is a
 * dead end rather than a starting point.
 */
export function blankArm(league: readonly Team[]): Pitcher {
  return {
    name: free(takenIn(league, 'arm'), 'New Arm'),
    blurb: 'Nobody has seen much of him.',
    throws: 'R',
    signature: 'none',
    tellTiming: 'release',
    arsenal: { fastball: 6, slider: 2, changeup: 2 },
    putaway: 'slider',
    zoneRate: 0.5,
  };
}

/**
 * Add one to a list, if the list has room.
 *
 * ⚠️ IT TAKES THE WHOLE LEAGUE, not just the club, and that is not overreach —
 * see takenIn(). A new man's id and name have to be free everywhere, so the
 * league is the smallest thing that can answer the question.
 */
export function addPerson(
  league: readonly Team[],
  index: number,
  group: Group,
): readonly Team[] {
  const club = league[index];
  if (!club) return league;
  const g = groupOf(group);
  const list = [...((club[group] ?? []) as readonly object[])];
  if (list.length >= g.max) return league;
  list.push(g.of === 'hitter' ? blankHitter(league, club) : blankArm(league));
  return replaceClub(league, index, put(club, group, list));
}

/** Drop one, if the list can spare it. */
export function removePerson(club: Team, group: Group, index: number): Team {
  const g = groupOf(group);
  const list = [...((club[group] ?? []) as readonly object[])];
  if (list.length <= g.min || !list[index]) return club;
  list.splice(index, 1);
  // An empty bench is written as an absent bench, which is what the shipped
  // clubs that have none look like.
  return put(club, group, group === 'bench' && list.length === 0 ? undefined : list);
}

/** Move a man up or down his list — the batting order is an order. */
export function movePerson(club: Team, group: Group, index: number, by: number): Team {
  const list = [...((club[group] ?? []) as readonly object[])];
  const to = index + by;
  if (!list[index] || to < 0 || to >= list.length) return club;
  const [who] = list.splice(index, 1);
  list.splice(to, 0, who!);
  return put(club, group, list);
}

// -------------------------------------------------------------- the league

/**
 * Put an edited club back into the league it came from.
 *
 * Matched on POSITION, not on abbr, because the abbr is one of the things the
 * editor can change — looking it up by the value being edited would lose the
 * club the moment somebody renamed it.
 */
export function replaceClub(
  league: readonly Team[],
  index: number,
  club: Team,
): readonly Team[] {
  return league.map((t, i) => (i === index ? club : t));
}

/**
 * A working copy the editor can mutate freely.
 *
 * `structuredClone` rather than a hand-written walk: it is native, it is deep,
 * and a Team is plain data all the way down.
 */
export const workingCopy = (league: readonly Team[]): Team[] =>
  structuredClone(league) as Team[];
