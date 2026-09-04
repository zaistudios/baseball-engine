/**
 * YOUR LEAGUE, NOT THE ONE THAT SHIPPED. Export the thirty clubs as JSON, edit
 * them, paste them back.
 *
 * ⚠️ WHY THIS IS A FILE AND NOT A FEATURE OF teams.ts. teams.ts says EDIT HERE
 * FIRST, and that is true for whoever has the repo and npm. It is not true for
 * anybody holding the one-file export — `npm run export` ships a single HTML
 * document with nothing external in it, so there is no filesystem to read a
 * league off and no fetch to make. The only way custom data reaches that build
 * is through the keyboard and localStorage, which is what this file is.
 *
 * ⚠️ IT ROUND-TRIPS `LEAGUE_AS_WRITTEN`, NEVER `LEAGUE`, and getting that
 * backwards would quietly compress the league twice. temper() pulls every club
 * toward the mean and teams.ts applies it on the way out — `LEAGUE =
 * temper(WRITTEN, TALENT_SPREAD)`. So the document this exports is the
 * UNCOMPRESSED source form, it goes back in where WRITTEN went in, and parity
 * is applied to it exactly once, by the same line, at the same strength. Which
 * also means the PARITY setting still answers "will you mangle my numbers":
 * BRUTAL is 1, and 1 is temper() returning what it was given untouched.
 *
 * ⚠️ IT VALIDATES RATHER THAN TRUSTS, and for a stronger reason than
 * loadSeason() has. A bad season blob costs one franchise. A bad league reaches
 * every screen in the game before a ball is thrown — the pickers, the schedule,
 * the standings table, the rank on the pre-game card — so a club with eight
 * hitters or a NaN where a power rating goes is not a garbled row, it is a
 * title screen that throws. Every rule below is derived from something the
 * engine actually does, and each one says which.
 *
 * ⚠️ THE SHIPPED LEAGUE GOES THROUGH THE SAME FUNCTION. teams.test.ts checks
 * the thirty by calling checkLeague() rather than by asserting the invariants a
 * second time, so the rules a custom league is held to and the rules the
 * shipped one is held to cannot drift apart. That was the whole reason to write
 * the checks here instead of in the test.
 *
 * ponytail: one localStorage key holding the JSON TEXT, re-validated on every
 * boot. Not a parsed cache, not a schema library, not a migration chain. Text
 * because it round-trips exactly and because a hand-edited entry then has to
 * pass the same gate a pasted one does; re-validated because thirty clubs is
 * microseconds and "it was valid when we stored it" is how a save format rots.
 */

import { ALL_PITCH_TYPES, type PitchType } from '../core/hitTables.ts';
import type { Team } from './teams.ts';

/** Where a custom league lives. Its own key — a season save is unrelated. */
const KEY = 'asb-league';

/**
 * How many complaints one bad document is allowed to make.
 *
 * A blob that is wrong in a structural way is wrong on every club, and thirty
 * clubs times twelve men is a wall of text nobody reads. The first few name the
 * actual mistake; the count says how much more there is.
 */
export const MAX_PROBLEMS = 24;

export type LeagueCheck =
  | { ok: true; teams: readonly Team[] }
  | { ok: false; problems: readonly string[] };

// ------------------------------------------------------------ the vocabulary

export const BUILDS = ['human', 'augmented', 'machine'] as const;
export const TRAITS = ['grit', 'slugger', 'reader', 'precision', 'showman'] as const;
export const HANDS = ['L', 'R'] as const;
export const SIGNATURES = ['none', 'knuckler', 'fireball', 'painter', 'junk'] as const;
export const TELLS = ['pre_pitch', 'release', 'none'] as const;

/** Every rating a hitter must carry. Same six as BatterStats, same order. */
export const BAT_RATINGS = ['power', 'contact', 'vision', 'clutch', 'bunt', 'speed'] as const;

/** An arm's ratings that may be left off. Each defaults to 1.0 at its read site. */
export const ARM_OPTIONAL = ['speedBonus', 'break', 'clutch', 'stamina'] as const;

/** The four knobs on an Identity. knob() defaults each to 1, so all are optional. */
export const IDENTITY_KNOBS = ['aggression', 'running', 'hook', 'bunt'] as const;

type Bag = Record<string, unknown>;

const bag = (v: unknown): Bag | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Bag) : null;

const isText = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/**
 * ⚠️ THE ONE NUMBER RULE, AND IT IS THE ONLY ONE. Finite and not negative.
 *
 * The temptation is to clamp ratings to something "sensible" and the temptation
 * is wrong twice over. It would silently rewrite what somebody typed — a 3.0
 * power becomes 2.0 and the game never says so — and it would be guarding
 * against the wrong thing. A large finite rating makes a silly league, which is
 * the player's business and is visible on the rank ladder the import screen
 * prints. What actually breaks the engine is a NaN or an Infinity, which
 * propagates through every average, every probability and every rate on the
 * screen until nothing means anything, and a negative, which flips comparisons
 * that were written assuming a magnitude. Those two are refused by name.
 */
const isRating = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0;

const oneOf = <T extends string>(v: unknown, among: readonly T[]): v is T =>
  typeof v === 'string' && (among as readonly string[]).includes(v);

// ------------------------------------------------------------- one club deep

/** Collects complaints without letting a wrong-shaped blob write a novel. */
class Report {
  readonly problems: string[] = [];
  private extra = 0;

  add(where: string, what: string): void {
    if (this.problems.length >= MAX_PROBLEMS) {
      this.extra++;
      return;
    }
    this.problems.push(`${where}: ${what}`);
  }

  get bad(): boolean {
    return this.problems.length > 0 || this.extra > 0;
  }

  finish(): readonly string[] {
    return this.extra > 0
      ? [...this.problems, `…and ${this.extra} more like these.`]
      : this.problems;
  }
}

function checkHitter(raw: unknown, where: string, r: Report): void {
  const p = bag(raw);
  if (!p) {
    r.add(where, 'is not an object.');
    return;
  }
  if (!isText(p['id'])) r.add(where, 'needs an id.');
  if (!isText(p['name'])) r.add(where, 'needs a name.');
  // The bio is the hover card and nothing reads it, but a missing one prints
  // "undefined" at the player, which looks exactly like a broken game.
  if (!isText(p['bio'])) r.add(where, 'needs a bio — one line, it is shown on the card.');
  if (!oneOf(p['build'], BUILDS)) r.add(where, `build must be one of ${BUILDS.join(', ')}.`);
  if (!oneOf(p['trait'], TRAITS)) r.add(where, `trait must be one of ${TRAITS.join(', ')}.`);
  if (!oneOf(p['bats'], HANDS)) r.add(where, "bats must be 'L' or 'R'.");
  for (const k of BAT_RATINGS) {
    if (!isRating(p[k])) r.add(where, `${k} must be a number, zero or above.`);
  }
}

function checkArm(raw: unknown, where: string, r: Report): void {
  const p = bag(raw);
  if (!p) {
    r.add(where, 'is not an object.');
    return;
  }
  if (!isText(p['name'])) r.add(where, 'needs a name.');
  if (!isText(p['blurb'])) r.add(where, 'needs a blurb — it is shown when he takes the mound.');
  if (!oneOf(p['throws'], HANDS)) r.add(where, "throws must be 'L' or 'R'.");
  if (!oneOf(p['signature'], SIGNATURES)) {
    r.add(where, `signature must be one of ${SIGNATURES.join(', ')}.`);
  }
  if (!oneOf(p['tellTiming'], TELLS)) r.add(where, `tellTiming must be one of ${TELLS.join(', ')}.`);
  if (!isRating(p['zoneRate'])) r.add(where, 'zoneRate must be a number, zero or above.');
  for (const k of ARM_OPTIONAL) {
    if (p[k] !== undefined && !isRating(p[k])) {
      r.add(where, `${k} must be a number, zero or above, or left off entirely.`);
    }
  }

  // ⚠️ AN ARM WITH NOTHING TO THROW IS A CRASH, NOT A BAD PITCHER. arsenalOf()
  // filters the mix to pitches with a positive share, and main.ts opens the
  // pitch picker with `arms[0]` — so an empty or all-zero arsenal is an
  // undefined pitch type reaching the tables the moment he takes the mound.
  const arsenal = bag(p['arsenal']);
  if (!arsenal) {
    r.add(where, 'needs an arsenal.');
    return;
  }
  const thrown: PitchType[] = [];
  for (const [type, share] of Object.entries(arsenal)) {
    if (!ALL_PITCH_TYPES.includes(type as PitchType)) {
      r.add(where, `does not know the pitch "${type}" — pick from ${ALL_PITCH_TYPES.join(', ')}.`);
      continue;
    }
    if (!isRating(share)) {
      r.add(where, `share of ${type} must be a number, zero or above.`);
      continue;
    }
    if (share > 0) thrown.push(type as PitchType);
  }
  if (thrown.length === 0) r.add(where, 'has to actually throw something — every share is zero.');

  // ⚠️ THE OUT PITCH MUST BE IN THE MIX. callPitch() reaches for `putaway` with
  // two strikes whether or not it is in the arsenal, so a putaway he does not
  // throw is a pitcher whose most legible trait silently stops existing — and
  // the one the hitter's scouting book is built to learn.
  if (!oneOf(p['putaway'], ALL_PITCH_TYPES)) {
    r.add(where, `putaway must be one of ${ALL_PITCH_TYPES.join(', ')}.`);
  } else if (thrown.length > 0 && !thrown.includes(p['putaway'] as PitchType)) {
    r.add(where, `puts hitters away with a ${p['putaway']} he never throws.`);
  }
}

function checkIdentity(raw: unknown, where: string, r: Report): void {
  const id = bag(raw);
  if (!id) {
    r.add(where, 'identity is not an object — leave it off entirely if the club has none.');
    return;
  }
  if (!isText(id['name'])) r.add(where, 'identity needs a name.');
  if (!isText(id['blurb'])) r.add(where, 'identity needs a blurb.');
  for (const k of IDENTITY_KNOBS) {
    if (id[k] !== undefined && !isRating(id[k])) {
      r.add(where, `identity ${k} must be a number, zero or above, or left off.`);
    }
  }
}

/**
 * ⚠️ NINE HITTERS, EXACTLY, AND IT IS NOT AN ARBITRARY NUMBER. assignPositions()
 * fills FILL_ORDER — eight fielding positions and a DH — from the batting order
 * by glove. Eight men leaves the last position null, fieldBall() falls back to a
 * glove of 1.0 for it, and the club silently fields a ghost at first base with
 * league-average hands. Ten men means the tenth never takes the field. Neither
 * throws; both are a club playing a different game from the one on the screen.
 */
export const LINEUP_SIZE = 9;

function checkClub(raw: unknown, index: number, r: Report): void {
  const t = bag(raw);
  if (!t) {
    r.add(`club ${index + 1}`, 'is not an object.');
    return;
  }
  const where = isText(t['abbr']) ? String(t['abbr']) : `club ${index + 1}`;

  if (!isText(t['name'])) r.add(where, 'needs a name.');
  // Length is capped because the abbreviation is a column in the line score and
  // a row in the standings table, both of which are laid out for three letters.
  if (!isText(t['abbr']) || String(t['abbr']).length > 4) {
    r.add(where, 'needs an abbr of one to four characters — it is the scoreboard column.');
  }

  const lineup = t['lineup'];
  if (!Array.isArray(lineup) || lineup.length !== LINEUP_SIZE) {
    r.add(where, `needs exactly ${LINEUP_SIZE} hitters in the lineup, in batting order.`);
  } else {
    lineup.forEach((p, i) => checkHitter(p, `${where} lineup ${i + 1}`, r));
  }

  // The bench is optional and any size — everything reads `bench ?? []`.
  const bench = t['bench'];
  if (bench !== undefined) {
    if (!Array.isArray(bench)) r.add(where, 'bench must be a list, or left off entirely.');
    else bench.forEach((p, i) => checkHitter(p, `${where} bench ${i + 1}`, r));
  }

  // ⚠️ ONE ARM MINIMUM IN EACH, NOT THREE. pickReliever() and the rotation
  // picker both index modulo the array's own length, so a club can carry any
  // number — but zero starters is a game with nobody to open it and zero
  // relievers is a pen button that hands back undefined.
  for (const group of ['rotation', 'bullpen'] as const) {
    const arms = t[group];
    if (!Array.isArray(arms) || arms.length === 0) {
      r.add(where, `needs at least one arm in the ${group}.`);
      continue;
    }
    arms.forEach((p, i) => checkArm(p, `${where} ${group} ${i + 1}`, r));
  }

  if (t['identity'] !== undefined) checkIdentity(t['identity'], where, r);
}

// ------------------------------------------------------------ the whole thing

/** Names a duplicate once, wherever it turns up. */
function checkUnique(
  seen: Map<string, string>,
  value: unknown,
  owner: string,
  what: string,
  r: Report,
): void {
  if (typeof value !== 'string') return;
  const already = seen.get(value);
  if (already !== undefined) r.add(owner, `${what} "${value}" is already on ${already}.`);
  else seen.set(value, owner);
}

/**
 * A league out of anything at all, or the list of reasons it is not one.
 *
 * The returned teams are the SAME objects that were passed in — this reads and
 * complains, it does not rebuild or normalise. A document that comes back `ok`
 * is one the engine can be handed as it stands.
 */
export function checkLeague(raw: unknown): LeagueCheck {
  const r = new Report();

  if (!Array.isArray(raw)) {
    return { ok: false, problems: ['The league has to be a list of clubs — a JSON array.'] };
  }

  // ⚠️ TWO CLUBS MINIMUM AND AN EVEN NUMBER OF THEM. schedule() lays the year
  // down by the circle method: it pairs slot `i` against slot `n-1-i` for
  // `i < n/2`. With an odd count the middle slot pairs with ITSELF and a club
  // is scheduled to play a game against nobody. One club has nobody to play at
  // all. Neither is caught anywhere downstream — the season simply builds a
  // fixture that cannot be played — so it is caught here.
  //
  // ponytail: refuse odd rather than teach the schedule a bye round. A bye is
  // real work in the one function whose output every standings table is folded
  // from, and every league anybody has asked for has an even number of clubs.
  // Add the bye when somebody actually wants thirteen.
  if (raw.length < 2) {
    r.add('the league', 'needs at least two clubs — somebody has to play somebody.');
  } else if (raw.length % 2 !== 0) {
    r.add(
      'the league',
      `has ${raw.length} clubs. It needs an even number, or the schedule pairs a club with itself.`,
    );
  }

  raw.forEach((club, i) => checkClub(club, i, r));

  // ⚠️ NAMES ARE KEYS, NOT DECORATION, AND THIS IS THE TRAP NOBODY SEES COMING.
  // stats.ts is keyed by NAME and says so — "every one of the names in teams.ts
  // is unique" is load-bearing, not an observation. Two hitters sharing a name
  // share one batting line for the whole season. Two arms sharing a name share
  // a line AND share `Season.rest`, so working one rests the other, and the
  // computer will keep sending out a man it believes is fresh.
  //
  // The two namespaces are checked separately on purpose: the book keeps `bat`
  // and `arm` apart, so a hitter and a pitcher called the same thing collide
  // nowhere and refusing that pair would be a rule with no defect under it.
  const abbrs = new Map<string, string>();
  const clubNames = new Map<string, string>();
  const ids = new Map<string, string>();
  const hitters = new Map<string, string>();
  const arms = new Map<string, string>();

  raw.forEach((club, i) => {
    const t = bag(club);
    if (!t) return;
    const where = isText(t['abbr']) ? String(t['abbr']) : `club ${i + 1}`;
    checkUnique(abbrs, t['abbr'], where, 'abbr', r);
    checkUnique(clubNames, t['name'], where, 'club name', r);

    for (const group of ['lineup', 'bench'] as const) {
      const men = t[group];
      if (!Array.isArray(men)) continue;
      for (const raw of men) {
        const p = bag(raw);
        if (!p) continue;
        checkUnique(ids, p['id'], where, 'player id', r);
        checkUnique(hitters, p['name'], where, 'hitter', r);
      }
    }
    for (const group of ['rotation', 'bullpen'] as const) {
      const staff = t[group];
      if (!Array.isArray(staff)) continue;
      for (const raw of staff) {
        const p = bag(raw);
        if (!p) continue;
        checkUnique(arms, p['name'], where, 'pitcher', r);
      }
    }
  });

  return r.bad ? { ok: false, problems: r.finish() } : { ok: true, teams: raw as Team[] };
}

// -------------------------------------------------------------- the document

/**
 * The league as an editable document.
 *
 * ⚠️ HAND IT `LEAGUE_AS_WRITTEN`, NEVER `LEAGUE` — see the header. This does
 * not reach for either itself, which is why it takes an argument: teams.ts
 * imports this module to build LEAGUE, so a call back the other way would be a
 * cycle evaluated halfway through teams.ts's own initialisation.
 */
export const serialiseLeague = (teams: readonly Team[]): string =>
  JSON.stringify(teams, null, 2);

/** The raw text somebody stored, whether or not it is any good. */
export function storedLeagueText(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    // Private window, or storage is off. There is no custom league, then.
    return null;
  }
}

/**
 * The custom league, or null for "play the one that shipped".
 *
 * ⚠️ RE-VALIDATED ON EVERY BOOT rather than trusted because it parsed once.
 * This is a blob a user can hand-edit — the same argument loadSeason() makes —
 * and the cost of being wrong is worse: a bad league reaches the title screen,
 * which is the one screen that has to work for the game to be recoverable at
 * all. A stored document that no longer passes is IGNORED, never deleted; the
 * league screen re-checks the same text and shows the player what is wrong with
 * it, which cannot happen if this threw the evidence away.
 */
export function loadCustomLeague(): readonly Team[] | null {
  const text = storedLeagueText();
  if (text === null) return null;
  try {
    const check = checkLeague(JSON.parse(text));
    return check.ok ? check.teams : null;
  } catch {
    return null;
  }
}

/** What the league screen says about what is stored. */
export type LeagueStatus = 'none' | 'custom' | 'broken';

export function leagueStatus(): LeagueStatus {
  const text = storedLeagueText();
  if (text === null) return 'none';
  return loadCustomLeague() === null ? 'broken' : 'custom';
}

/**
 * What is wrong with the stored league, or [] if nothing is or there is none.
 *
 * The league screen's whole job when a document has gone bad: teams.ts fell
 * back to the shipped clubs at boot without a word, because there was no screen
 * yet to say it to. This is where it gets said.
 */
export function storedLeagueProblems(): readonly string[] {
  const text = storedLeagueText();
  if (text === null) return [];
  try {
    const check = checkLeague(JSON.parse(text));
    return check.ok ? [] : check.problems;
  } catch (e) {
    return [`The stored league is not JSON any more. ${e instanceof Error ? e.message : ''}`.trim()];
  }
}

/**
 * Take a pasted document. Returns the problems, or null when it went in.
 *
 * ⚠️ IT TAKES ONE CLUB AS WELL AS A WHOLE LEAGUE, and that is not a
 * convenience so much as an admission about the size of the thing. The full
 * document is a quarter of a megabyte across eight thousand lines — see
 * scripts/leaguedoc.ts — which is fine as TRANSPORT and hopeless as a place to
 * find your shortstop. Re-casting one club is the edit somebody actually wants
 * to make, so a bare club object is spliced in over the club with the same
 * abbreviation and the RESULT is validated as a league. One validator, one set
 * of rules, and pasting one club can still not produce a league with two
 * shortstops called the same thing.
 *
 * `current` is what to splice into. Passed rather than imported because
 * teams.ts imports this module to build the league in the first place — a call
 * the other way would be a cycle read halfway through its initialisation.
 *
 * Nothing is written unless it passes, so a bad paste cannot cost somebody the
 * league they already had.
 */
export function saveCustomLeague(
  text: string,
  current: readonly Team[],
): readonly string[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return [`That is not JSON. ${e instanceof Error ? e.message : ''}`.trim()];
  }

  let league: unknown = parsed;
  if (!Array.isArray(parsed)) {
    const one = bag(parsed);
    const abbr = one && isText(one['abbr']) ? String(one['abbr']) : null;
    if (abbr === null) {
      return [
        'That is one object but it has no abbr, so there is no club to put it over. ' +
          'Paste a whole league as a JSON array, or one club with its abbr.',
      ];
    }
    if (!current.some((t) => t.abbr === abbr)) {
      return [
        `No club in this league has the abbreviation "${abbr}". ` +
          'Paste the whole league as a JSON array to change which clubs there are.',
      ];
    }
    league = current.map((t) => (t.abbr === abbr ? (parsed as Team) : t));
  }

  const check = checkLeague(league);
  if (!check.ok) return check.problems;
  try {
    // ⚠️ THE WHOLE LEAGUE IS STORED, not the paste. A one-club paste is only
    // an edit gesture; what has to survive a reload is the document the game
    // will be rebuilt from.
    localStorage.setItem(KEY, serialiseLeague(check.teams));
  } catch {
    return ['The browser refused to store it — private window, or storage is full.'];
  }
  return null;
}

/** Back to the league that shipped. */
export function clearCustomLeague(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing stored to clear, then */
  }
}
