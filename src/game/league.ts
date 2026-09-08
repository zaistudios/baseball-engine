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

/** A park's three fences, in feet. All required — a layout is not half a layout. */
export const PARK_FENCES = ['left', 'center', 'right'] as const;

/**
 * HOW SHORT AND HOW DEEP A FENCE MAY BE, and both ends are engine facts rather
 * than taste.
 *
 * Under 150 the fence is inside the infield: zoneFor() in placement.ts calls
 * everything short of 150 feet `infield`, and a wall band sitting under that
 * would swallow the branch and name ground balls as balls off the wall.
 *
 * Over 500 nobody can reach it. MAX_CARRY_FT in plot.ts clamps the hardest ball
 * anybody hits at 505 feet, so a fence past that is a park in which the home
 * run does not exist — and the table would still call them, leaving every one
 * of them drawn short of a wall it was supposed to have cleared.
 */
export const FENCE_MIN_FT = 150;
export const FENCE_MAX_FT = 500;

/**
 * The ceiling on foul acreage.
 *
 * ⚠️ IT IS NOT THE ONE NUMBER RULE AND IT IS NOT TASTE EITHER. parkFoulAngle()
 * turns this into the bar caughtFoul() cuts the foul population at, and that
 * population runs from -45° to 78°. At 3 the bar is 69° — already nine degrees
 * deep into a range where hit.ts measured that foul outs start eating
 * strikeouts that should have happened, and a tenth of a run a side with them.
 * Past there the knob stops describing foul ground and starts rewriting the
 * strikeout rate, and by 41 every foul ball in the game is an out. Refused with
 * the reason rather than left as a trap.
 */
export const FOUL_MAX = 3;

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
  /**
   * ⚠️ AND A HIRE LINE, WHICH WAS MISSING AND IS NOT DECORATION. moments.ts
   * reads `identity.hire` for the detail on the manager moment — the whole
   * point of that field is that the screen offers you a first-base coach
   * rather than a stat block. Every shipped identity has one because they all
   * go through the identity() factory; a hand-written or editor-made one had
   * nothing to stop it going without, and the failure surfaced two thirds of
   * the way through a franchise as the word "undefined" on a decision screen.
   */
  if (!isText(id['hire'])) {
    r.add(where, 'identity needs a hire line — what the manager moment offers you.');
  }
  for (const k of IDENTITY_KNOBS) {
    if (id[k] !== undefined && !isRating(id[k])) {
      r.add(where, `identity ${k} must be a number, zero or above, or left off.`);
    }
  }
}

/**
 * A ballpark. Same shape of rule as an identity: present means complete.
 *
 * ⚠️ EVERY FIELD IS REQUIRED, WHICH IS NOT HOW THE IDENTITY KNOBS WORK, and the
 * difference is that a park has no sensible default for half of itself. An
 * identity knob left off is 1.0 — "this manager does the ordinary thing" — and
 * reads correctly. A park with a left-field fence and no right-field fence is
 * not a park with an ordinary right field; it is a building with a hole in it,
 * and wallAt() would interpolate the whole of right field out of a number
 * nobody wrote. Leave the park off entirely, or give it all four.
 *
 * ⚠️ THE BOUNDS ARE ENGINE FACTS, NOT TIDINESS. See FENCE_MIN_FT, FENCE_MAX_FT
 * and FOUL_MAX above — each one names the thing in the engine it protects. A
 * park at 340/500/340 is a silly park and passes, exactly like a 3.0 power
 * rating does; a park at 340/900/340 is one nobody can hit a home run in and is
 * refused by name.
 */
function checkPark(raw: unknown, where: string, r: Report): void {
  const p = bag(raw);
  if (!p) {
    r.add(where, 'park is not an object — leave it off entirely if the club has none.');
    return;
  }
  if (!isText(p['name'])) r.add(where, 'park needs a name.');
  for (const k of PARK_FENCES) {
    const v = p[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      r.add(where, `park ${k} must be a distance in feet.`);
    } else if (v < FENCE_MIN_FT || v > FENCE_MAX_FT) {
      r.add(
        where,
        `park ${k} is ${v}ft — fences run ${FENCE_MIN_FT} to ${FENCE_MAX_FT} feet. ` +
          'Shorter is inside the infield; longer is a park nobody can homer in.',
      );
    }
  }
  const foul = p['foul'];
  if (!isRating(foul)) {
    r.add(where, 'park foul must be a number, zero or above — 1 is ordinary foul ground.');
  } else if (foul > FOUL_MAX) {
    r.add(
      where,
      `park foul is ${foul} — keep it at ${FOUL_MAX} or under, or foul pops stop being ` +
        'a park and start being the strikeout rate.',
    );
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
  if (t['park'] !== undefined) checkPark(t['park'], where, r);
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

// ---------------------------------------------------------- the named slots

/**
 * A LEAGUE YOU KEEP, UNDER A NAME.
 *
 * ⚠️ THE ACTIVE DOCUMENT DID NOT MOVE, AND THAT IS THE WHOLE DESIGN. KEY is
 * still the one league the game plays, still read by loadCustomLeague(),
 * leagueStatus() and storedLeagueProblems() exactly as before. These are COPIES
 * filed beside it. So there is no migration, no pointer to chase on the boot
 * path, and a league imported before slots existed is still the active one
 * after — the feature is additive to a degree that the load path cannot tell it
 * happened.
 *
 * ⚠️ WHY ONE KEY WAS NOT ENOUGH. A single slot means a custom league can only
 * ever be THE custom league: keeping a deadball year and a thirty-club fantasy
 * world at the same time is impossible, so nobody builds the second one. The
 * import box was already transport for handing a league to somebody else; this
 * is the shelf you put your own on.
 *
 * ponytail: the prefix IS the index. No manifest key listing what exists, no
 * per-slot metadata, no compression, no pointer at the active slot. An index
 * that can disagree with the keys it indexes is a bug waiting for a browser to
 * fail one setItem out of two, and Storage can already enumerate itself.
 */
const SLOT = `${KEY}:`;

/**
 * The longest a slot name may be. It is a row on a menu, not a document.
 *
 * ⚠️ THE CAP IS THE SCREEN'S, NOT STORAGE'S. localStorage would take a name of
 * any length; the league screen draws these in a fixed-width console list and a
 * name that runs off it is a slot you cannot tell from the one below it.
 */
export const MAX_SLOT_NAME = 24;

/**
 * What is wrong with a slot name, or null if it will do.
 *
 * Trimmed before anything else, because " my league" and "my league" are the
 * same shelf to a person and two keys to a Map.
 */
export function checkSlotName(name: string): string | null {
  const n = name.trim();
  if (n.length === 0) return 'A saved league needs a name.';
  if (n.length > MAX_SLOT_NAME) return `Keep the name to ${MAX_SLOT_NAME} characters or fewer.`;
  return null;
}

/**
 * Every league on the shelf, in alphabetical order.
 *
 * ⚠️ length/key() RATHER THAN Object.keys(localStorage). Both work in a
 * browser, but only these two are the Storage interface — the index properties
 * are a convenience the spec layers on top, and every fake storage anybody
 * writes for a test implements the methods and not the proxy.
 */
export function listSlots(): readonly string[] {
  const names: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k !== null && k.startsWith(SLOT)) names.push(k.slice(SLOT.length));
    }
  } catch {
    // Private window, or storage is off. There is no shelf, then.
    return [];
  }
  return names.sort((a, b) => a.localeCompare(b));
}

/** The document filed under a name, whether or not it is any good. */
export function slotText(name: string): string | null {
  try {
    return localStorage.getItem(SLOT + name.trim());
  } catch {
    return null;
  }
}

/**
 * File a document under a name. Returns the problems, or null when it went in.
 *
 * ⚠️ IT GOES THROUGH checkLeague() TOO, and the reason is not symmetry. A slot
 * is loaded MUCH later than it is saved — that is what a shelf is for — so a
 * document allowed onto it unvalidated is a failure that surfaces weeks after
 * the mistake, on a screen that cannot say what was typed. Thirty clubs is
 * microseconds; refusing at the moment somebody is still looking at what they
 * wrote is worth all of them.
 *
 * ⚠️ AND THE CANONICAL FORM IS WHAT IS STORED, never the caller's text, so a
 * slot and the active league are byte-identical for the same clubs.
 */
export function saveSlot(name: string, text: string): readonly string[] | null {
  const bad = checkSlotName(name);
  if (bad) return [bad];

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return [`That is not JSON. ${e instanceof Error ? e.message : ''}`.trim()];
  }

  const check = checkLeague(parsed);
  if (!check.ok) return check.problems;

  try {
    localStorage.setItem(SLOT + name.trim(), serialiseLeague(check.teams));
  } catch {
    // ⚠️ SAID OUT LOUD, because the shelf has a ceiling and a silent one is
    // worse than a low one. The document is ~230 kB against a 5 MB budget, so
    // this is roughly twenty leagues — reachable by somebody actually using
    // the feature, and a refusal nobody reports looks like a league that
    // vanished.
    return ['The browser refused to store it — private window, or storage is full.'];
  }
  return null;
}

/**
 * Make a filed league the one the game plays. Returns problems, or null.
 *
 * ⚠️ IT GOES THROUGH saveCustomLeague() LIKE ANY OTHER PASTE. One gate, one
 * storage path — the rule the editor already follows. A slot written by an
 * older build, or hand-edited in the browser's own storage inspector, is held
 * to exactly the rules a typed document is, and a slot that has gone bad cannot
 * take the active league down with it because nothing is written unless it
 * passes.
 */
export function loadSlot(name: string, current: readonly Team[]): readonly string[] | null {
  const text = slotText(name);
  if (text === null) return [`There is no saved league called "${name.trim()}".`];
  return saveCustomLeague(text, current);
}

/** Take one off the shelf. The active league is untouched either way. */
export function deleteSlot(name: string): void {
  try {
    localStorage.removeItem(SLOT + name.trim());
  } catch {
    /* nothing stored to clear, then */
  }
}
