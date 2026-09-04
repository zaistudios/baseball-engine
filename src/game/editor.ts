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
import type { Player } from '../core/roster.ts';
import type { Pitcher } from '../core/pitcher.ts';
import { ALL_PITCH_TYPES } from '../core/hitTables.ts';
import {
  BUILDS,
  TRAITS,
  HANDS,
  SIGNATURES,
  TELLS,
  BAT_RATINGS,
  ARM_OPTIONAL,
  IDENTITY_KNOBS,
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
  kind: 'text' | 'line' | 'number' | 'choice';
  /** For 'choice'. Always a list league.ts will accept. */
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
  ...IDENTITY_KNOBS.map((k) => rating(k, k, true)),
];

export const HITTER_FIELDS: readonly Field[] = [
  { key: 'name', label: 'Name', kind: 'text' },
  { key: 'bats', label: 'Bats', kind: 'choice', choices: HANDS },
  { key: 'build', label: 'Build', kind: 'choice', choices: BUILDS },
  { key: 'trait', label: 'Trait', kind: 'choice', choices: TRAITS },
  ...BAT_RATINGS.map((k) => rating(k, k)),
  { key: 'bio', label: 'Bio', kind: 'line' },
];

export const ARM_FIELDS: readonly Field[] = [
  { key: 'name', label: 'Name', kind: 'text' },
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
  { key: 'rotation', label: 'ROTATION', of: 'arm', min: 1, max: 6 },
  { key: 'bullpen', label: 'BULLPEN', of: 'arm', min: 1, max: 8 },
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
  return raw;
}

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
  const base = club.identity ?? { name: '', blurb: '' };
  const next = put(base, key, value) as Record<string, unknown>;
  const bare = !String(next['name'] ?? '').trim() && !String(next['blurb'] ?? '').trim();
  return put(club, 'identity', bare ? undefined : next);
}

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
