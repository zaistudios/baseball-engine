/**
 * THE OTHER EIGHT MEN — how eighteen written ballplayers become a 26-man club.
 *
 * ⚠️ WHY THIS IS NOT IN teams.ts. That file says EDIT HERE FIRST and it is
 * right: it is where a club's IDENTITY lives, in nine hitters, three bench men
 * and six arms that were cast by hand and balanced by measurement. What it is
 * not is a place to keep two hundred and forty more arms. A real club dresses
 * twenty-six and most of them are DEPTH — the fifth starter, the second long
 * man, the arm who pitches the eighth of a 9-1 game. Those men are defined by
 * their ROLE far more than by themselves, and writing two hundred and forty of
 * them out by hand would be two hundred and forty sets of numbers nobody could
 * keep in step with each other or with the six above them.
 *
 * So the roles are a table, the QUALITY comes from the club's own written
 * staff, and the names are the one part that is still hand-cast — because the
 * names are the part a person reads.
 *
 * ⚠️ IT IS PURE AND IDEMPOTENT, AND BOTH MATTER. Pure, because a franchise
 * stores its rosters WHOLE and a club has to come out the same every time it
 * is expanded or the save and the league disagree about who is on the staff.
 * Idempotent, because an imported league — or a season saved after this
 * existed — arrives already full, and filling it again would deal it a second
 * bullpen.
 *
 * ⚠️ IT RUNS BEFORE temper(). The depth is generated from what teams.ts
 * WRITES, then the whole 26 is compressed together, so a generated arm is
 * pulled toward the league mean by exactly the same k as the ace beside him.
 * Doing it the other way round would leave the depth uncompressed and hand
 * every club a second, wider talent ladder underneath the first — which is the
 * fault bench.test.ts already exists to forbid.
 */

import type { Player } from '../core/roster.ts';
import type { Arsenal, Pitcher, Signature, TellTiming } from '../core/pitcher.ts';
import type { PitchType } from '../core/hitTables.ts';
import type { Hand } from '../core/hit.ts';
import { knob, type Identity } from './identity.ts';
import { stuffValue } from './value.ts';
import { DEPTH_NAMES } from './depthNames.ts';

/**
 * A 26-MAN CLUB, split the way a real one is: thirteen pitchers and thirteen
 * position players.
 *
 * ⚠️ THE FOURTH BENCH MAN CONTRADICTS A NOTE IN teams.ts AND THE NOTE WAS
 * RIGHT. It says three covers a pinch hit, a defensive change and a platoon,
 * and that "a fourth would be a second version of one of them". True — and it
 * is what a real bench carries, because with twenty-six men you WILL spend the
 * first one. The fourth is the second bat, and he is honestly labelled as
 * such; see benchDepth().
 */
export const ROTATION_SIZE = 5;
export const BULLPEN_SIZE = 8;
export const BENCH_SIZE = 4;
export const LINEUP_SIZE = 9;
export const ROSTER_SIZE = LINEUP_SIZE + BENCH_SIZE + ROTATION_SIZE + BULLPEN_SIZE;

/** Anything with a staff and a bench. Kept structural so teams.ts can call in. */
export interface Roster {
  abbr: string;
  lineup: readonly Player[];
  rotation: readonly Pitcher[];
  bullpen: readonly Pitcher[];
  bench?: readonly Player[];
  identity?: Identity;
}

// ------------------------------------------------------------------ the roles

/**
 * WHAT EACH DEPTH ARM IS FOR, as multipliers on his own group's written mean.
 *
 * `stamina` is the exception and is ABSOLUTE, because stamina is not a measure
 * of how good an arm is — it is the definition of the job. A long man is a
 * long man on every club in the league; whether he is any good is what the
 * other three numbers say. Multiplying a club's pen mean would have given the
 * best pen in the league the longest long man, which is not a thing.
 */
interface Role {
  /** Shown nowhere; it is the blurb and the reason the numbers are what they are. */
  tag: string;
  blurb: string;
  stamina: number;
  break: number;
  clutch: number;
  zone: number;
}

/**
 * THE FOURTH AND FIFTH STARTERS.
 *
 * The back of a rotation is worse than the front — that is what makes it the
 * back — and the fifth man is the one a club is trying to replace all season.
 */
const ROTATION_DEPTH: readonly Role[] = [
  {
    tag: 'four',
    blurb: 'Takes the ball every fifth day and asks for nothing.',
    stamina: 1.02,
    break: 0.95,
    clutch: 0.96,
    zone: 1.0,
  },
  {
    tag: 'five',
    blurb: 'The fifth starter. Gives you five and hands it over.',
    stamina: 0.94,
    break: 0.9,
    clutch: 0.93,
    zone: 0.97,
  },
];

/**
 * THE FIVE ARMS BEHIND THE THREE teams.ts WRITES.
 *
 * The written pen is long man, setup, closer — the three a manager names. These
 * are the rest of a real bullpen, and they are in the order the phone rings:
 * the second long man first, because he is who you get in the third inning of a
 * bad night, and the mop-up man last, because he is who you get in the ninth of
 * one.
 *
 * ⚠️ THE MATCHUP ARM THROWS THE OTHER WAY, ALWAYS. Every other depth arm
 * inherits a hand from the man he was derived from, which on some clubs would
 * have produced eight right-handers and a platoon system nobody ever meets —
 * see the note on `throws` in core/pitcher.ts, which says the same thing about
 * why three of nine are left-handed in the first place.
 */
const RELIEF_DEPTH: readonly Role[] = [
  {
    tag: 'long',
    blurb: 'The long man. Comes in when it is already ugly and finishes it.',
    stamina: 0.95,
    break: 0.93,
    clutch: 0.92,
    zone: 1.0,
  },
  {
    tag: 'middle',
    blurb: 'Sixth and seventh, most nights, and nobody notices either.',
    stamina: 0.84,
    break: 0.98,
    clutch: 0.97,
    zone: 1.0,
  },
  {
    tag: 'middle',
    blurb: 'Warms up more often than he pitches.',
    stamina: 0.76,
    break: 0.96,
    clutch: 0.95,
    zone: 0.99,
  },
  {
    tag: 'matchup',
    blurb: 'In for one hitter, out again. That is the whole job.',
    stamina: 0.62,
    break: 1.04,
    clutch: 0.99,
    zone: 0.96,
  },
  {
    tag: 'mop',
    blurb: 'Gets the ball when the game has already gone. Somebody has to.',
    stamina: 0.88,
    break: 0.86,
    clutch: 0.86,
    zone: 0.95,
  },
];

/**
 * HOW FAR A CLUB'S PHILOSOPHY MOVES ITS STAFF, in raw stamina.
 *
 * ⚠️ IT IS A TRANSFER, NOT A BONUS. A QUICK HOOK club needs four innings out of
 * its pen every night, so its depth relievers are longer and its back-end
 * starters shorter; IRON ARMS is the same trade the other way. The two new
 * starters give up `TILT` each and the five new relievers split exactly that
 * much between them, so the staff's total stamina is the same either way.
 *
 * ⚠️ THE REASON IT HAS TO CANCEL IS clubValue(). armValue() weights stamina at
 * 0.43 and clubValue() is a flat mean over the whole staff, so a tilt that did
 * not cancel would put IDENTITY INTO WHAT A CLUB IS WORTH — which identity.ts
 * forbids in as many words, because the pre-game card's rank is meant to say
 * what the PLAYERS are worth and not what the manager does with them.
 *
 * It is not quite arithmetically exact, because the stamina clamps below can
 * bite one end of the trade and not the other. Measured across all eight
 * identities on all thirty clubs the widest that leaves any club's value is
 * 0.002, against a league spread of 1.42 — a seventh of one percent, and no
 * club changes rank under any identity. depth.test.ts holds it there.
 */
const TILT = 0.55;

/**
 * The league's ordinary relief stamina, which the pen roles above are written
 * against. A club whose written pen runs longer than this gets longer depth
 * arms in proportion; Chicago's pen is deep and stays deep.
 */
const PEN_STAMINA_MID = 0.8;

/**
 * ONE MEASURED CONSTANT ON TOP OF THE ROLE SLOPES, AND IT IS NOT COSMETIC.
 *
 * ⚠️ THE SLOPES ALONE MOVED THE WHOLE LEAGUE'S RUN ENVIRONMENT. The six arms
 * teams.ts writes are a club's BEST six, and the run environment in
 * scripts/balance.ts was tuned against a league where every start and every
 * relief inning came from one of them. Give each club a fourth and fifth
 * starter and five more relievers, all correctly worse than the six above
 * them, and roughly a third of the innings in the league are suddenly thrown
 * by arms that did not exist when 4.4 runs a game was measured:
 *
 *   role slopes alone   4.66 runs per team    (MLB ~4.4)
 *   with this at 1.05   4.42
 *
 * ⚠️ WHAT IT IS NOT is a thumb on the scale for anybody. It is the same number
 * for all thirty clubs, so it lifts the whole league together and moves no
 * rank — scripts/staff.ts reads 0 of 30 clubs changing place. What it says, in
 * one number, is "the ace was
 * never the average arm on the staff, and the numbers in teams.ts were written
 * as though he was."
 *
 * Re-measure with `node scripts/balance.ts` if the role table moves, and
 * `node scripts/staff.ts` for everything else the depth can quietly break.
 */
const DEPTH_QUALITY = 1.05;

/** Which name in the club's list belongs to the fourth bench man — the last. */
const BENCH_NAME_AT = ROTATION_SIZE - 3 + (BULLPEN_SIZE - 3);

/**
 * A STARTER HAS STARTER LEGS AND A RELIEVER HAS SHORT ONES, and these are the
 * lines rotation.test.ts holds the whole league to.
 *
 * ⚠️ THIS IS A CLAMP, NOT A PREFERENCE, AND IT CAUGHT A REAL ONE. The long
 * man's role stamina scales with the club's own pen, and on a club with a long
 * pen that arithmetic produced a RELIEVER AT 1.14 — longer legs than four of
 * the five starters in front of him, which is not a bullpen, it is a sixth
 * starter with a bullpen's name on him. The identity tilt can push a
 * quick-hook club's fifth starter the other way through the floor for exactly
 * the same reason.
 *
 * ⚠️ IT DOES NOT SEPARATE THE TWO GROUPS COMPLETELY AND MUST NOT. Denver has
 * the shortest ace in the league and a manager on the phone in the fifth, so
 * its generated fifth starter lands under its own long man — and that is what
 * a quick-hook club with no staff looks like. What the clamps guarantee is
 * that no reliever out-lasts an arm teams.ts wrote as a starter; depth.test.ts
 * states it that way round.
 *
 * ⚠️ THE CEILING IS 0.93 AND NOT THE 0.95 THE TEST ASKS FOR, because this runs
 * BEFORE temper() and temper moves stamina afterwards. A long man clamped to
 * exactly 0.95 came out of compression at 0.9599 and failed the invariant he
 * had been clamped to satisfy. The two hundredths are the room compression
 * needs.
 */
const SP_STAMINA_FLOOR = 0.88;
const RP_STAMINA_CEILING = 0.93;

// -------------------------------------------------------------- the arithmetic

const mean = (xs: readonly number[]): number =>
  xs.length === 0 ? 1 : xs.reduce((a, b) => a + b, 0) / xs.length;

/** Every rating a Pitcher can leave off, read with its default. */
const brk = (a: Pitcher): number => a.break ?? 1;
const clu = (a: Pitcher): number => a.clutch ?? 1;

/**
 * The other hand. Used only by the matchup arm — see RELIEF_DEPTH.
 */
const flip = (h: Hand): Hand => (h === 'L' ? 'R' : 'L');

/**
 * A depth arm's ARSENAL comes off a man already on the staff.
 *
 * ⚠️ THIS IS WHY PHOENIX'S NINTH ARM STILL THROWS GAS AND MAINE'S STILL THROWS
 * JUNK. A generated mix would have been a league-average mix on every club, and
 * the pitch mix is most of what a club FEELS like from the box. Borrowing one
 * costs nothing and inherits the whole voice.
 *
 * `putaway` comes from the same man, which is also the invariant: pitcher.ts
 * requires an out pitch that is actually in the mix, and copying the pair
 * together can never break it.
 */
const borrow = (
  src: Pitcher,
): { arsenal: Arsenal; putaway: PitchType; signature: Signature; speedBonus?: number } => ({
  arsenal: { ...src.arsenal },
  putaway: src.putaway,
  signature: src.signature,
  ...(src.speedBonus === undefined ? {} : { speedBonus: src.speedBonus }),
});

/**
 * The tells, cycled rather than copied.
 *
 * A tell is the thing a human learns about an arm across a season, so eight
 * depth pitchers who all tipped it at release would be one fact repeated eight
 * times. The cycle is fixed by slot, which keeps it deterministic.
 */
const TELLS: readonly TellTiming[] = ['none', 'release', 'pre_pitch'];

/**
 * NOBODY GENERATED OUT-PITCHES A MAN teams.ts WROTE.
 *
 * ⚠️ THIS IS THE BUG A SEASON PROBE FOUND AND THE RATINGS HID. A depth arm's
 * break and clutch are the club's own group mean times a role slope times
 * DEPTH_QUALITY — and 0.98 × 1.05 is 1.03, so the first middle man came out
 * three percent ABOVE the average of the long man, the setup man and the
 * closer. On Chicago that put a generated arm called Halligan Bar Sobieski
 * over THE EXTINGUISHER, and pickReliever() sends the best arm out late and
 * close — so the club whose whole identity is the man who comes in to put the
 * rally out was bringing in its sixth-inning man for the save. Ten of the
 * thirty clubs. Nothing on any screen said so.
 *
 * ⚠️ THE CAP IS ON STUFF, NOT ON VALUE, AND BOTH ATTEMPTS AT THE OTHER THING
 * FAILED THE SAME WAY. Cap full armValue and whether the cap bites depends on
 * the arm's LEGS, so the identity tilt decides it — two clubs changed rank and
 * the spread across identities went from 0.002 to 0.010, which is the identity
 * inside clubValue() by the side door. Judge it at an untilted stamina instead
 * and the arithmetic is identity-blind again, but the three IRON ARMS clubs
 * get depth starters rating over their own ace.
 *
 * Stuff is the resolution because it is the honest split. An iron-arms club's
 * fourth starter IS worth more than a quick-hook club's — he goes deeper, and
 * armValue() prices that at 0.43 because it is real. What he must not be is a
 * better PITCHER than the man written as the ace, and that is a statement
 * about break, clutch and control with the innings left out of it.
 *
 * It is the same number pickReliever() now sorts the ninth inning by, so "no
 * generated arm out-pitches a written one" and "the save goes to a written
 * arm" are ONE fact rather than two that could drift apart. See stuffValue()
 * in value.ts, and `node scripts/staff.ts`, which counts both.
 */
const OUT_RATED = 0.98;

/** Pull an arm back under the ceiling, if the role slopes pushed him over. */
function underCeiling(arm: Pitcher, ceiling: number): Pitcher {
  const v = stuffValue(arm);
  if (v <= ceiling) return arm;
  // break and clutch carry the cut. Stamina is the JOB — shortening a long man
  // to make him worse would make him a different pitcher — and zoneRate is
  // weighted 0.07, so there is nothing worth taking off it.
  const movable = (arm.clutch ?? 1) * 0.61 + (arm.break ?? 1) * 0.68;
  const k = Math.max(0.2, (movable - (v - ceiling)) / Math.max(0.01, movable));
  return { ...arm, break: (arm.break ?? 1) * k, clutch: (arm.clutch ?? 1) * k };
}

/** One arm, built out of a role, a source arm and a club's own averages. */
function depthArm(opts: {
  name: string;
  role: Role;
  src: Pitcher;
  slot: number;
  breakMid: number;
  clutchMid: number;
  zoneMid: number;
  stamina: number;
  lefty?: boolean;
}): Pitcher {
  const { role, src, slot } = opts;
  return {
    name: opts.name,
    blurb: role.blurb,
    throws: opts.lefty ? flip(src.throws) : src.throws,
    tellTiming: TELLS[slot % TELLS.length]!,
    zoneRate: Math.max(0.2, Math.min(0.95, opts.zoneMid * role.zone * DEPTH_QUALITY)),
    break: Math.max(0.05, opts.breakMid * role.break * DEPTH_QUALITY),
    clutch: Math.max(0.05, opts.clutchMid * role.clutch * DEPTH_QUALITY),
    stamina: Math.max(0.2, opts.stamina),
    ...borrow(src),
  };
}

// -------------------------------------------------------------------- the pen

/**
 * The two starters and five relievers a club is short of a real staff.
 *
 * Quality is the club's OWN written mean for that group, so a good rotation
 * gets a good fourth starter and Oklahoma City does not. Shape is the role
 * table. The two are deliberately separate: the depth is where a club plays
 * like itself, not where it stops being itself.
 */
function staffDepth(
  t: Roster,
  names: readonly string[],
): { rotation: readonly Pitcher[]; bullpen: readonly Pitcher[] } {
  const rot = t.rotation;
  const pen = t.bullpen;
  const wantRot = Math.max(0, ROTATION_SIZE - rot.length);
  const wantPen = Math.max(0, BULLPEN_SIZE - pen.length);
  if (wantRot === 0 && wantPen === 0) return { rotation: rot, bullpen: pen };

  const from: readonly Pitcher[] = rot.length + pen.length > 0 ? [...rot, ...pen] : [];
  // A club with no staff at all cannot have depth derived from one. That is a
  // malformed import, not something to invent nine arms for.
  if (from.length === 0) return { rotation: rot, bullpen: pen };

  const rotMid = {
    break: mean(rot.map(brk)),
    clutch: mean(rot.map(clu)),
    zone: mean(rot.map((a) => a.zoneRate)),
    stamina: mean(rot.map((a) => a.stamina ?? 1)),
  };
  const penMid = {
    break: mean(pen.map(brk)),
    clutch: mean(pen.map(clu)),
    zone: mean(pen.map((a) => a.zoneRate)),
    stamina: mean(pen.map((a) => a.stamina ?? 1)),
  };

  // A quick hook buys pen innings with rotation innings. See TILT — the two
  // halves are the same total, which is what keeps this out of clubValue().
  const tilt = (1 - knob(t.identity, 'hook')) * TILT;
  const penShare = wantPen > 0 ? (tilt * wantRot) / wantPen : 0;

  // ⚠️ THE ROLES ARE TAKEN FROM THE BACK, AND THE NAME COMES WITH THE ROLE. A
  // club that already carries a fourth starter is missing the FIFTH, not the
  // fourth — slicing from the front would have given him the fourth starter's
  // job and the fourth starter's name while the fifth slot went unfilled.
  const rotRoles = ROTATION_DEPTH.slice(ROTATION_DEPTH.length - wantRot);
  const penRoles = RELIEF_DEPTH.slice(RELIEF_DEPTH.length - wantPen);

  // Nobody generated out-rates the best man teams.ts wrote for that group.
  const rotCeiling = Math.max(...rot.map(stuffValue)) * OUT_RATED;
  const penCeiling = Math.max(...pen.map(stuffValue)) * OUT_RATED;

  const newRot = rotRoles.map((role, i) => {
    const slot = ROTATION_DEPTH.length - wantRot + i;
    return underCeiling(depthArm({
      name: names[slot] ?? `${t.abbr} Starter ${slot + 4}`,
      role,
      src: rot[slot % rot.length] ?? from[0]!,
      slot,
      breakMid: rotMid.break,
      clutchMid: rotMid.clutch,
      zoneMid: rotMid.zone,
      // The role's stamina is a multiple of a STARTER'S, which is the group he
      // belongs to; the pen's roles are absolute because a reliever's job is
      // the same length everywhere. See Role.
      stamina: Math.max(SP_STAMINA_FLOOR, rotMid.stamina * role.stamina - tilt),
    }), rotCeiling);
  });

  const newPen = penRoles.map((role, i) => {
    const slot = RELIEF_DEPTH.length - wantPen + i;
    return underCeiling(depthArm({
      name: names[ROTATION_DEPTH.length + slot] ?? `${t.abbr} Reliever ${slot + 4}`,
      role,
      src: from[(slot + 1) % from.length]!,
      slot: ROTATION_DEPTH.length + slot,
      breakMid: penMid.break,
      clutchMid: penMid.clutch,
      zoneMid: penMid.zone,
      stamina: Math.min(RP_STAMINA_CEILING, role.stamina * (penMid.stamina / PEN_STAMINA_MID) + penShare),
      lefty: role.tag === 'matchup',
    }), penCeiling);
  });

  return { rotation: [...rot, ...newRot], bullpen: [...pen, ...newPen] };
}

// ------------------------------------------------------------------ the bench

/**
 * THE FOURTH BENCH MAN — the second bat, and the one a club plays like itself
 * with.
 *
 * The other three are the same three archetypes on every club, deliberately;
 * see the bench section in teams.ts. This one is allowed to lean, because the
 * bench is NOT priced into clubValue() at all — so a TRACK TEAM's last man off
 * the bench can have legs and a BIG INNING club's can have a swing without any
 * of it touching a rank on the pre-game card. It is the cheapest place in the
 * league to say what a club is.
 *
 * He is centred on the club's OWN BENCH average rather than its lineup, which
 * is the correction temper() already had to make once — reserves are their own
 * population and measuring them against the nine overshoots every time.
 */
function benchDepth(t: Roster, name: string): readonly Player[] {
  const bench = t.bench ?? [];
  if (bench.length >= BENCH_SIZE) return bench;
  const src = bench.length > 0 ? bench : t.lineup;
  if (src.length === 0) return bench;

  const mid = (k: 'power' | 'contact' | 'vision' | 'clutch' | 'bunt' | 'speed'): number =>
    mean(src.map((p) => p[k]));

  // Legs against pop, and it is a trade rather than a bonus: a club that runs
  // gets a runner off the bench and gives up the swing to have him.
  const legs = knob(t.identity, 'running');
  const lean = Math.max(-0.2, Math.min(0.2, (legs - 1) * 0.22));
  // ...and the small-ball clubs' last man can lay one down, which costs
  // nothing anywhere — bunt has no weight in value.ts at all. See playerValue.
  const bunt = mid('bunt') * (2 - knob(t.identity, 'bunt'));

  return [
    ...bench,
    {
      id: `${t.abbr.toLowerCase()}B${bench.length + 1}`,
      build: 'human',
      trait: 'grit',
      name,
      power: Math.max(0.05, mid('power') - lean),
      contact: mid('contact'),
      vision: mid('vision'),
      clutch: mid('clutch'),
      bunt: Math.max(0.05, bunt),
      speed: Math.max(0.05, mid('speed') + lean),
      // The other three benches carry a lefty in the platoon slot, so the
      // fourth man bats right and the bench keeps both hands available.
      bats: 'R',
      bio: 'Twenty-fifth man. Plays five positions and none of them well.',
    },
  ];
}

// ------------------------------------------------------------------- the club

/**
 * Fill one club out to twenty-six. A club already at twenty-six comes back
 * untouched — see the note on idempotency in the header.
 */
export function fillRoster<T extends Roster>(t: T): T {
  const shortRot = Math.max(0, ROTATION_SIZE - t.rotation.length);
  const shortPen = Math.max(0, BULLPEN_SIZE - t.bullpen.length);
  const shortBench = Math.max(0, BENCH_SIZE - (t.bench?.length ?? 0));
  if (shortRot + shortPen + shortBench === 0) return t;

  // ⚠️ THE NAME LIST IS POSITIONAL: two starters, five relievers, one bench
  // man, in that order. A club short of only some of them still takes its
  // names from the same slots, so importing a league with a fourth starter
  // already in it does not shuffle everybody else's name onto the wrong man.
  const names = DEPTH_NAMES[t.abbr] ?? [];
  const staff = staffDepth(t, names);
  const bench = benchDepth(
    t,
    names[BENCH_NAME_AT] ?? `${t.abbr} Reserve`,
  );
  return { ...t, rotation: staff.rotation, bullpen: staff.bullpen, bench };
}

/** How many men this club actually dresses. The screen and the tests both ask. */
export const rosterSize = (t: Roster): number =>
  t.lineup.length + (t.bench?.length ?? 0) + t.rotation.length + t.bullpen.length;
