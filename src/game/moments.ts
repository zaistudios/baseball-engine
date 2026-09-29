/**
 * FRANCHISE MOMENTS. Every so often the season stops and asks you something —
 * and most of the time it asks because of something that actually happened.
 *
 * ⚠️ THEY ARE EARNED NOW, NOT SCHEDULED. This file used to hold two moments on
 * two fixed days with random contents; the note at the bottom of this header
 * defending that is kept, because the reasoning was right for what it was. What
 * changed is that a SCENARIO reads the season back — the stat book, the
 * standings, the run of results — and fires when its own conditions are true.
 * "Your three-hitter is at .164 and there is a .400 bat on the bench" is a
 * question the season asked; a trade offer on day five is a question the
 * calendar asked. Both still exist, and the scheduled two are last in the list
 * precisely so an earned one takes the day ahead of them.
 *
 * ⚠️ THE HARD PART IS NOT THE PLUMBING, IT IS THE SAMPLE SIZE. See enoughPA().
 * Every trigger reads a rate, and a rate over nine at-bats is noise with a
 * decimal point in it — a scenario system that fires on that looks exactly like
 * one that works, because the headline still names a real man and quotes a real
 * number. That is the failure this file is built to avoid and the one
 * scenarios.test.ts spends most of its length on.
 *
 * ⚠️ THIS IS THE FEATURE franchise.ts HAS BEEN BUILDING TOWARD SINCE IT WAS
 * WRITTEN, and it is worth reading that file's header before this one. Two
 * things were put there for a day that had not come:
 *
 *   1. `Season.rosters` — every club stored WHOLE, "the seam every roster
 *      feature needs. A trade moves a Player between two entries."
 *   2. `NewsItem.kind` already had `'roster'` in the union, with a comment
 *      saying the roster kinds are named now so the pre-game screen can style
 *      them the day they start firing.
 *
 * Both of those are now load-bearing. This file writes through the first and
 * files against the second, and franchise.ts did not have to change shape for
 * it — playDay() still knows nothing about any of this.
 *
 * ⚠️ A MOMENT IS NOT A REWARD AND NOT A PUNISHMENT. Every option is a genuine
 * sideways move: the trades are matched so your roster value barely changes,
 * and the manager hire does not touch a rating at all. What changes is the
 * SHAPE of the club — whether your runs come from a three-run homer or from
 * first-to-third, whether your starter finishes the sixth. That is the whole
 * design and the reason there is no "good option": a screen where one choice
 * is better is a screen with one choice on it.
 *
 * WHY THE TRADES BALANCE THEMSELVES, which is the nicest thing in this file.
 * Every trade is TWO FOR TWO — a bat and an arm, each way — so both clubs keep
 * nine hitters and three arms and no roster can ever go illegal. And because
 * clubValue() is `mean(lineup) + mean(rotation)` and both clubs carry the same
 * 9 and 3, your delta and theirs are EXACT MIRRORS:
 *
 *     yours  = (Pin - Pout)/9 + (Ain - Aout)/3
 *     theirs = (Pout - Pin)/9 + (Aout - Ain)/3  = -yours
 *
 * So a trade matched to be flat for you is flat for them too, and there is no
 * second balancing pass to write. Pick the counterparty that minimises your
 * delta and the league stays where it was.
 *
 * ponytail (2026-08-26, and still half true): TWO moments, on FIXED DAYS, with
 * RANDOM contents. Fixed days because a moment that might not come is a moment
 * the player cannot plan around, and because "day 5" is one comparison rather
 * than a scheduler. Random contents because the same trade every season is a
 * puzzle you solve once.
 *
 * ⚠️ WHAT THAT NOTE GOT RIGHT AND WHAT IT COST. It was right that a scheduler
 * is more machinery than two comparisons — the SCENARIOS list below is exactly
 * the scheduler it declined to write, and it is thirty lines. It was right that
 * a moment which might not come cannot be planned around, which is why the two
 * scheduled ones are still here as a floor: a quiet season still gets asked
 * something. What it cost was the whole point of keeping a stat book. The
 * season was recording every line in the league and no moment ever read one.
 *
 * Still no draft, no free agency, no arbitration — those are an offseason,
 * which franchise.ts is explicit about not being.
 */

import { makeRng, type Rng } from '../core/rng.ts';
import type { Player } from '../core/roster.ts';
import type { Pitcher } from '../core/pitcher.ts';
import { type Team } from './teams.ts';
import { ALL_IDENTITIES, type Identity } from './identity.ts';
import { playerValue, armValue, clubValue } from './value.ts';
import { gloveOf } from './defense.ts';
import {
  clubsIn,
  gamesOn,
  regularDays,
  standings,
  teamOf,
  type NewsItem,
  type Result,
  type Season,
} from './franchise.ts';
import { avg, era, ip, obp, ops, rate, type ArmLine, type BatLine } from './stats.ts';

/**
 * WHEN THE TWO GUARANTEED QUESTIONS COME — see anchorPlan(). One in the first
 * half, one in the second, on days drawn from the season's seed.
 *
 * ⚠️ DRAWN, NOT 1/3 AND 2/3. Fixed days meant every franchise stopped at the
 * same two places for the same two questions; the floor is still two, but
 * which two and when is the season's own.
 */
export const momentDays = (s: Season): readonly number[] => anchorPlan(s).days;

// ------------------------------------------------- reading the season back

/**
 * HOW MANY PLATE APPEARANCES BEFORE A BATTING AVERAGE MEANS ANYTHING.
 *
 * ⚠️ THIS IS THE WHOLE DIFFERENCE BETWEEN A SCENARIO SYSTEM AND A RANDOM ONE.
 * Every trigger below reads a RATE, and a rate over four at-bats is noise
 * wearing a decimal point — in a fourteen-game season a .400 hitter is
 * eight-for-twenty and a man "in a slump" is one-for-nine. A scenario that
 * fires on that is not reading the season, it is reading the dice, and the
 * player learns within two franchises that the headline means nothing.
 *
 * So it scales with the games played: about two and a half PA a game is a
 * regular who has been in the lineup throughout, with a floor for the early
 * weeks. stats.ts and career.ts both learned this the same way — see QUALIFY
 * and the floor in marks().
 */
const enoughPA = (day: number): number => Math.max(24, Math.round(day * 2.5));

/** ...and the same for an arm, in outs. Twenty-seven is nine innings. */
const enoughOuts = (day: number): number => Math.max(27, Math.round(day * 2.5));

const batLine = (s: Season, name: string): BatLine | undefined => s.stats?.bat[name];
const armLine = (s: Season, name: string): ArmLine | undefined => s.stats?.arm[name];

/** Your club's games, oldest first. Regular season only — the bracket is not form. */
const yourGames = (s: Season): Result[] =>
  s.results
    .filter((r) => (r.home === s.you || r.away === s.you) && r.day < regularDays(s))
    .sort((a, b) => a.day - b.day);

const wonIt = (s: Season, r: Result): boolean => (r.home === s.you) === (r.hr > r.ar);

/** How many in a row you have just lost. Zero if you won the last one. */
function skidLength(s: Season): number {
  let n = 0;
  for (const r of [...yourGames(s)].reverse()) {
    if (wonIt(s, r)) break;
    n++;
  }
  return n;
}

/** ...and how many in a row you have just won. */
function streakLength(s: Season): number {
  let n = 0;
  for (const r of [...yourGames(s)].reverse()) {
    if (!wonIt(s, r)) break;
    n++;
  }
  return n;
}

/** Games behind the leader, off the table this season has. */
const gamesBack = (s: Season): number =>
  standings(s).find((r) => r.abbr === s.you)?.gb ?? 0;

// ------------------------------------------------------------ the variety

/**
 * A seeded draw for one scenario on one day. `salt` keeps two scenarios on the
 * same day from drawing the same numbers. Everything random in this file comes
 * through here or makeRng directly — a reloaded save asks the same questions.
 */
const rngFor = (s: Season, day: number, salt: number): Rng =>
  makeRng((s.seed ^ salt) + day * 104729);

/** One of a scenario's ways of putting it, drawn from the season. */
const oneOf = (s: Season, day: number, salt: number, lines: readonly string[]): string =>
  rngFor(s, day, salt ^ 0x7e47).pick(lines);

function shuffled<T>(rng: Rng, xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const surname = (name: string): string => name.split(' ').pop()!;

/** The clubs you could deal with — this season's, never LEAGUE. See deadline(). */
const othersOf = (s: Season): Team[] =>
  clubsIn(s).filter((abbr) => abbr !== s.you).map((abbr) => teamOf(s, abbr));

/**
 * IS THE SEASON IN A STATE TO ASK YOU ANYTHING?
 *
 * ⚠️ NOT TOO EARLY AND NOT TOO LATE, and both halves matter. Early, there is no
 * record to read and every trigger fires on a three-game sample. Late, a
 * decision has no games left to be right or wrong in — which is the rule the
 * original two fixed days were built on, kept now that the days are earned.
 */
function inWindow(s: Season, day: number): boolean {
  const n = regularDays(s);
  return day >= Math.max(3, Math.round(n * 0.2)) && day <= Math.round(n * 0.85);
}

/**
 * HOW LONG THE FRONT OFFICE LEAVES YOU ALONE between questions.
 *
 * ⚠️ WITHOUT THIS A GOOD TRIGGER BECOMES A NAG. Several scenarios can be true
 * at once — a club on a skid usually also has a man slumping — and firing them
 * on consecutive days turns a season into a questionnaire. One decision, then
 * a stretch of baseball, then the next.
 */
const restBetween = (s: Season): number => Math.max(4, Math.round(regularDays(s) / 9));

/** One thing you can do about it. */
export interface Choice {
  /** The button. Two or three words. */
  label: string;
  /** What it actually does, in baseball, not in ratings. */
  detail: string;
  /** The wire line if you take it. Goes in as a `roster` NewsItem. */
  news: string;
  /** The new season. Pure — it does not save, and it does not advance the day. */
  apply: (s: Season) => Season;
}

export interface Moment {
  /**
   * WHICH SCENARIO THIS IS. Written into Season.seen when the choice is taken,
   * so a scenario asks once a season however many days its trigger stays true.
   * A slump does not clear up because you were asked about it.
   */
  id: string;
  day: number;
  /** THE DEADLINE, THE BENCH. */
  headline: string;
  /** The situation, two or three sentences. */
  body: string;
  choices: readonly Choice[];
}

// ------------------------------------------------------------- the roster

/** Put a changed club back. Returns a whole new `rosters` map, as ever. */
const withTeam = (s: Season, t: Team): Season => ({
  ...s,
  rosters: { ...s.rosters, [t.abbr]: t },
});

/** Swap one man for another, keeping the batting order slot he stood in. */
const swapPlayer = (t: Team, out: Player, inn: Player): Team => ({
  ...t,
  lineup: t.lineup.map((p) => (p.id === out.id ? inn : p)),
});

/**
 * ...and one arm for another, keeping his place in the rotation.
 *
 * ⚠️ MATCHED ON NAME, because a Pitcher has no id. Every arm in teams.ts is
 * named once and the names are absurd enough that a collision is not a
 * realistic worry — but it is why this takes the index rather than searching,
 * where it can.
 */
const swapArm = (t: Team, at: number, inn: Pitcher): Team => ({
  ...t,
  rotation: t.rotation.map((a, i) => (i === at ? inn : a)),
});

// -------------------------------------------------------------- the trade

/**
 * How much a two-for-two moves YOUR club.
 *
 * ⚠️ IT ASKS clubValue() RATHER THAN DOING THE ARITHMETIC, and it used to do
 * the arithmetic: `(Pin-Pout)/9 + (Ain-Aout)/3`. That was correct while a
 * staff was three arms and it went silently wrong the day the pen arrived and
 * the divisor became six. A hand-inlined copy of a formula that lives
 * somewhere else is a promise to update two places forever, and this one had
 * a test asserting the promise rather than the formula.
 *
 * Nine candidate trades per shape, one clubValue() each. It is not hot.
 */
const tradeDelta = (
  you: Team,
  outBat: Player, inBat: Player,
  outArmAt: number, inArm: Pitcher,
): number =>
  clubValue(swapArm(swapPlayer(you, outBat, inBat), outArmAt, inArm)) - clubValue(you);

/**
 * A trade is fair enough to offer when it moves your club less than this.
 *
 * The league spans about 1.1 of club value from best roster to worst, so 0.04
 * is under 4% of the whole ladder — small enough that a trade cannot move you
 * a place in the standings by itself, which is the promise the screen makes.
 */
export const FAIR = 0.04;

interface Trade {
  partner: Team;
  /** Yours, going out. */
  outBat: Player;
  outArmAt: number;
  /** Theirs, coming in. */
  inBat: Player;
  inArmAt: number;
  delta: number;
}

/**
 * Build the fairest two-for-two of a given SHAPE against one partner.
 *
 * `wantArm` is the shape: true means you are buying pitching and paying with a
 * bat, false means the reverse. The arm side is fixed by that — their best arm
 * for your worst, or the other way — and then the BAT is chosen to settle the
 * bill, by scanning their nine for the one that lands the delta nearest zero.
 *
 * ponytail: a scan over nine, not a search over both sides. Searching both
 * would find a flatter trade and would also be the overfitting move teams.ts
 * warns about twice — and a delta of 0.001 instead of 0.01 is invisible in a
 * fourteen-game season. Nine comparisons, take the best, move on.
 */
function bestTrade(you: Team, partner: Team, wantArm: boolean): Trade | null {
  const rank = <T,>(xs: readonly T[], v: (x: T) => number): T[] =>
    [...xs].sort((a, b) => v(b) - v(a));

  const yourArms = rank(you.rotation, armValue);
  const theirArms = rank(partner.rotation, armValue);
  // Buying an arm: their best for your worst. Selling one: your best for their
  // worst. Either way it is the two ENDS of the two staffs, which is what a
  // deadline trade actually looks like.
  const inArm = wantArm ? theirArms[0]! : theirArms[theirArms.length - 1]!;
  const outArm = wantArm ? yourArms[yourArms.length - 1]! : yourArms[0]!;

  const yourBats = rank(you.lineup, playerValue);
  // Paying with a bat costs you a good one; being paid in bats gets you one.
  const outBat = wantArm ? yourBats[0]! : yourBats[yourBats.length - 1]!;

  const outArmAt = you.rotation.indexOf(outArm);
  let best: Trade | null = null;
  for (const inBat of partner.lineup) {
    const delta = tradeDelta(you, outBat, inBat, outArmAt, inArm);
    if (best === null || Math.abs(delta) < Math.abs(best.delta)) {
      best = {
        partner,
        outBat,
        inBat,
        outArmAt,
        inArmAt: partner.rotation.indexOf(inArm),
        delta,
      };
    }
  }
  return best && Math.abs(best.delta) <= FAIR ? best : null;
}

/** Execute one. Both clubs are written, because a trade has two sides. */
function settle(s: Season, you: Team, t: Trade): Season {
  const inArm = t.partner.rotation[t.inArmAt]!;
  const outArm = you.rotation[t.outArmAt]!;
  const mine = swapArm(swapPlayer(you, t.outBat, t.inBat), t.outArmAt, inArm);
  const theirs = swapArm(swapPlayer(t.partner, t.inBat, t.outBat), t.inArmAt, outArm);
  return withTeam(withTeam(s, mine), theirs);
}

const tradeChoice = (you: Team, t: Trade, buyingArm: boolean): Choice => {
  const inArm = t.partner.rotation[t.inArmAt]!;
  const outArm = you.rotation[t.outArmAt]!;
  return {
    label: buyingArm ? `GET ${inArm.name.split(' ').pop()}` : `GET ${t.inBat.name.split(' ').pop()}`,
    detail:
      `${t.outBat.name} and ${outArm.name} to ${t.partner.abbr} ` +
      `for ${t.inBat.name} and ${inArm.name}. ` +
      (buyingArm
        ? 'You are paying with the middle of your order to fix the rotation.'
        : 'You are giving up an arm to get the bat back.'),
    news: `${you.abbr} and ${t.partner.abbr} swap: ${t.outBat.name} and ${outArm.name} for ${t.inBat.name} and ${inArm.name}.`,
    apply: (s) => settle(s, you, t),
  };
};

/**
 * THE DEADLINE. Somebody wants to make a deal, and the two offers on the table
 * point in opposite directions.
 *
 * The partner club is drawn at random and then the two shapes are built
 * against it. Either can come back null — a club whose nine are all similar
 * cannot settle the bill inside FAIR — and a moment with only "stand pat" on
 * it is not a moment, so the caller re-rolls the partner a few times before
 * giving up on the day entirely.
 */
// ------------------------------------------------------ one for one

/**
 * A STRAIGHT SWAP, ONE MAN FOR ONE IN THE SAME ROLE — a bat for a bat, a
 * starter for a starter, a reliever for a reliever. Rosters stay legal by
 * construction, since nobody changes jobs.
 *
 * ⚠️ FLAT FOR BOTH CLUBS, CHECKED BOTH WAYS. The 2-for-2 gets its mirror for
 * free (see the header); a 1-for-1 does not when two staffs are different
 * sizes, so the partner's side is priced too and has to clear FAIR as well.
 *
 * ⚠️ AND IT HAS TO CHANGE SOMETHING. Among the fair ones, the swap that moves
 * the man's SHAPE most is the one offered — power for legs, length for
 * movement. A fair swap of two identical men is a button that does nothing.
 */
type Slot = 'lineup' | 'rotation' | 'bullpen';
type Man = Player | Pitcher;

const menIn = (t: Team, slot: Slot): readonly Man[] => t[slot] as readonly Man[];
const setAt = (t: Team, slot: Slot, at: number, inn: Man): Team =>
  ({ ...t, [slot]: menIn(t, slot).map((m, i) => (i === at ? inn : m)) }) as Team;

const BAT_TOOLS = [['power', 'pop'], ['contact', 'contact'], ['vision', 'eye'], ['speed', 'legs']] as const;
const ARM_TOOLS = [['break', 'movement'], ['stamina', 'length'], ['clutch', 'nerve']] as const;
const tool = (m: Man, k: string): number => (m as unknown as Record<string, number | undefined>)[k] ?? 1;

/** "more pop, less legs" — what the swap changes about the man in that spot. */
function shapeOf(out: Man, inn: Man, slot: Slot): { gap: number; words: string } {
  const d = (slot === 'lineup' ? BAT_TOOLS : ARM_TOOLS)
    .map(([k, w]) => ({ w, v: tool(inn, k) - tool(out, k) }))
    .sort((a, b) => b.v - a.v);
  const up = d[0]!;
  const down = d[d.length - 1]!;
  return { gap: up.v - down.v, words: `more ${up.w}, less ${down.w}` };
}

interface Swap {
  partner: string;
  slot: Slot;
  outAt: number;
  inAt: number;
  words: string;
}

/** Less than this between the two men's tools is not a change of shape. */
const SHAPE_GAP = 0.12;

function oneForOne(s: Season, partner: Team, slot: Slot, rng: Rng, outAt?: number): Swap | null {
  const you = teamOf(s, s.you);
  const mine = menIn(you, slot);
  const theirs = menIn(partner, slot);
  if (mine.length === 0 || theirs.length === 0) return null;
  const base = clubValue(you);
  const their = clubValue(partner);
  const outs = outAt !== undefined ? [outAt] : shuffled(rng, mine.map((_, i) => i));
  for (const o of outs) {
    let best: Swap | null = null;
    let gap = SHAPE_GAP;
    theirs.forEach((inn, i) => {
      if (Math.abs(clubValue(setAt(you, slot, o, inn)) - base) > FAIR) return;
      if (Math.abs(clubValue(setAt(partner, slot, i, mine[o]!)) - their) > FAIR) return;
      const sh = shapeOf(mine[o]!, inn, slot);
      if (sh.gap > gap) {
        gap = sh.gap;
        best = { partner: partner.abbr, slot, outAt: o, inAt: i, words: sh.words };
      }
    });
    if (best) return best;
  }
  return null;
}

const ROLE: Record<Slot, string> = { lineup: 'bat', rotation: 'rotation spot', bullpen: 'pen arm' };

/** A swap as a button. Reads the rosters at apply time, not at offer time. */
function swapChoice(s: Season, w: Swap, label?: string): Choice {
  const out = menIn(teamOf(s, s.you), w.slot)[w.outAt]!;
  const inn = menIn(teamOf(s, w.partner), w.slot)[w.inAt]!;
  return {
    label: label ?? `GET ${surname(inn.name)}`,
    detail: `${out.name} to ${w.partner} for ${inn.name}, straight up — ${w.words} in that ${ROLE[w.slot]}.`,
    news: `${s.you} send ${out.name} to ${w.partner} for ${inn.name}.`,
    apply: (x) => {
      const you = teamOf(x, x.you);
      const them = teamOf(x, w.partner);
      const a = menIn(you, w.slot)[w.outAt]!;
      const b = menIn(them, w.slot)[w.inAt]!;
      return withTeam(withTeam(x, setAt(you, w.slot, w.outAt, b)), setAt(them, w.slot, w.inAt, a));
    },
  };
}

/** The first club in `partners` that has a swap of this kind to offer. */
function firstSwap(s: Season, partners: readonly Team[], slot: Slot, rng: Rng, outAt?: number): Swap | null {
  for (const p of partners) {
    const w = oneForOne(s, p, slot, rng, outAt);
    if (w) return w;
  }
  return null;
}

type Shape = 'buyArm' | 'buyBat' | Slot;
const SHAPES: readonly Shape[] = ['buyArm', 'buyBat', 'lineup', 'rotation', 'bullpen'];

function deadline(s: Season, day: number): Moment | null {
  const you = teamOf(s, s.you);
  const rng = makeRng((s.seed ^ 0x5eed) + day * 7919);
  // ⚠️ THE SEASON'S OWN CLUBS, NOT `LEAGUE`. A trade partner has to be a club
  // that is actually in this franchise: reading the module-level league meant
  // that once a league could be imported, the deadline would offer you a deal
  // with somebody who was not in your standings table — and teamOf() would fall
  // back to a club from the NEW league to build the offer out of.
  const others = othersOf(s);

  for (let attempt = 0; attempt < 6; attempt++) {
    const partner = rng.pick(others);
    // ⚠️ TWO OFFERS OF DIFFERENT SHAPES, DRAWN. It was always the same pair —
    // a bat-and-arm each way — so the deadline read the same every year.
    const offers: Choice[] = [];
    for (const shape of shuffled(rng, SHAPES)) {
      if (offers.length === 2) break;
      if (shape === 'buyArm' || shape === 'buyBat') {
        const t = bestTrade(you, partner, shape === 'buyArm');
        if (t) offers.push(tradeChoice(you, t, shape === 'buyArm'));
      } else {
        const w = oneForOne(s, partner, shape, rng);
        if (w) offers.push(swapChoice(s, w));
      }
    }
    if (offers.length === 0 || new Set(offers.map((c) => c.label)).size < offers.length) continue;

    return {
      id: 'deadline',
      day,
      headline: 'THE DEADLINE',
      body: oneOf(s, day, 0xdead, [
        `${partner.name} are on the phone. They have looked at your club and ` +
          `they know what you are short of. Nothing here makes you better on ` +
          `paper — it moves what you are made of.`,
        `The deadline is tonight and ${partner.name} want to deal. Their GM ` +
          `has two ideas and neither is a steal — each one trades what your ` +
          `club is good at for something it is not.`,
        `${partner.name} have been scouting your games all week. The offers ` +
          `came in at breakfast. Same value going out as coming in; a ` +
          `different club walking off the plane.`,
      ]),
      choices: [
        ...offers,
        {
          label: 'STAND PAT',
          // ⚠️ COUNTED, NOT WRITTEN AS "NINE". It was nine because the deadline
          // sat on day five of a fourteen-game year and nothing else was
          // possible. It is a hundred and eight in a full season.
          detail: `You like your club. ${regularDays(s) - day} games left to prove it.`,
          news: `${s.you} stand pat at the deadline.`,
          apply: (x: Season) => x,
        },
      ],
    };
  }
  return null;
}

// ------------------------------------------------------------ the manager

/**
 * THE BENCH. Your manager is out, and there are two names on the list.
 *
 * ⚠️ NOT ONE RATING MOVES. This is the identity swap and it is the purest form
 * of the design note at the top: your nine are the same nine, your three arms
 * are the same three arms, and the club plays a completely different game.
 *
 * ⚠️ IT IS A MILD TILT, NOT A TRAP, AND THIS COMMENT USED TO CLAIM OTHERWISE.
 * It said hiring the running-game man was a disaster in Detroit. Measured —
 * one roster, eight benches, same seeds, 300 games each — TRACK TEAM is the
 * BEST of the eight on Detroit, 46.7% against STEADY's 44.7%.
 *
 * The cause is running.ts working as designed: `running` scales how often the
 * manager asks, never the odds bar he answers against. Detroit asks more and
 * is refused nearly every time (0.35 attempts a game against Baltimore's 2.36
 * on the same tag), so the tag cannot run a slow club into outs — and a tag
 * that cannot hurt you cannot be a trap. The whole eight-bench spread is five
 * or six points of win rate, under two standard errors at that sample.
 *
 * Keep the club's own card on the screen anyway (main.ts draws it): the choice
 * is still more legible with the numbers in front of you, and if the bench is
 * ever given real teeth the lever is the odds bar and the card is what makes
 * that fair rather than arbitrary.
 */
/** Hand the club to a new bench boss. Not one rating moves. */
const hireChoice = (s: Season, id: Identity): Choice => ({
  label: id.name,
  detail: id.hire,
  news: `${s.you} hire a new bench boss. They are a ${id.name} club now.`,
  apply: (x: Season) => withTeam(x, { ...teamOf(x, x.you), identity: id }),
});

function bench(s: Season, day: number): Moment | null {
  const you = teamOf(s, s.you);
  const rng = makeRng((s.seed ^ 0xbe4c) + day * 104729);
  const current = you.identity?.name;
  const options = ALL_IDENTITIES.filter((i) => i.name !== current);
  if (options.length < 2) return null;

  // Two names, drawn without replacement.
  const first = rng.pick(options);
  const second = rng.pick(options.filter((i) => i.name !== first.name));

  return {
    id: 'bench',
    day,
    headline: 'THE BENCH',
    body: oneOf(s, day, 0xbe4c, [
      `Your manager is gone. The front office has two names and wants an ` +
        `answer before the bus leaves. Nobody's ratings move either way — what ` +
        `changes is how the club is asked to play.`,
      `The manager took a job with a college program and nobody saw it ` +
        `coming. Two candidates flew in overnight. Same players, whoever you ` +
        `pick — a different idea of how to use them.`,
      `Health reasons, the statement said. The bench is empty and two men ` +
        `want it. Neither touches a rating; each would run a different game ` +
        `with the nine you have.`,
    ]),
    choices: [
      hireChoice(s, first),
      hireChoice(s, second),
      {
        label: 'PROMOTE INSIDE',
        detail: `The bench coach steps up and nothing changes. ${you.identity?.blurb ?? ''}`,
        news: `${s.you} promote from within. No change on the bench.`,
        apply: (x: Season) => x,
      },
    ],
  };
}

// -------------------------------------------------- what the season noticed

/** Put a bench man in the nine and the man he replaces on the bench. */
const promoteBat = (t: Team, out: Player, inn: Player): Team => ({
  ...t,
  lineup: t.lineup.map((p) => (p.id === out.id ? inn : p)),
  bench: (t.bench ?? []).map((p) => (p.id === inn.id ? out : p)),
});

/**
 * THE SLUMP. A man in your nine cannot buy a hit, and somebody on the bench is
 * swinging it.
 *
 * ⚠️ BOTH HALVES HAVE TO BE TRUE, and that is what makes it a decision rather
 * than a complaint. "Your seven-hitter is at .190" on its own has one sensible
 * answer and it is "so what, he is your seven-hitter" — there is nobody else.
 * The scenario only exists when there is a real alternative sitting there, and
 * the numbers on the screen are the ones the season actually produced.
 *
 * ⚠️ IT IS A TRADE-OFF, NOT A FREE UPGRADE. The bench man is hitting better in
 * FEWER at-bats, which is exactly the situation where a manager is most likely
 * to be fooled — and playerValue() usually still rates the regular higher,
 * because a bench bat is a bench bat. Taking it is a bet on the hot hand over
 * the better player, which is the oldest argument in the sport and has no
 * right answer.
 */
function slump(s: Season, day: number): Moment | null {
  const you = teamOf(s, s.you);
  const bench = you.bench ?? [];
  if (!s.stats || bench.length === 0) return null;

  const floor = enoughPA(day);
  const asked = new Set(s.seen ?? []);
  // The coldest regular who has actually been out there — and who you have not
  // already been asked about. See the note on subject ids in SCENARIOS.
  const cold = you.lineup
    .map((p) => ({ p, l: batLine(s, p.name) }))
    .filter((r): r is { p: Player; l: BatLine } => !!r.l && r.l.pa >= floor)
    .filter((r) => !asked.has(`slump:${r.p.name}`))
    .sort((a, b) => avg(a.l) - avg(b.l))[0];
  if (!cold || avg(cold.l) > 0.21) return null;

  // ...and the best bench man, on a lighter but not empty sample.
  const hot = bench
    .map((p) => ({ p, l: batLine(s, p.name) }))
    .filter((r): r is { p: Player; l: BatLine } => !!r.l && r.l.pa >= Math.max(8, floor / 3))
    .sort((a, b) => avg(b.l) - avg(a.l))[0];
  if (!hot || avg(hot.l) < avg(cold.l) + 0.09) return null;

  const line = (l: BatLine): string => `${rate(avg(l))} in ${l.ab} at-bats, ${l.hr} home runs`;

  return {
    id: `slump:${cold.p.name}`,
    day,
    headline: 'THE SLUMP',
    body: oneOf(s, day, 0x51b9, [
      `${cold.p.name} is hitting ${rate(avg(cold.l))}. He has been in the ` +
        `lineup all year and the bat has not come. ${hot.p.name} has been on the ` +
        `bench hitting ${rate(avg(hot.l))} in a third of the work, and the ` +
        `clubhouse has noticed which way round that is.`,
      `${rate(avg(cold.l))}. That is ${cold.p.name}'s average, and the beat ` +
        `writers have started printing it every morning. ${hot.p.name} is at ` +
        `${rate(avg(hot.l))} off the bench and asked the hitting coach today ` +
        `whether he should keep his glove oiled.`,
      `${cold.p.name} went to the cage at six this morning, again. It is not ` +
        `working — ${rate(avg(cold.l))} in ${cold.l.ab} at-bats. ${hot.p.name} ` +
        `has hit ${rate(avg(hot.l))} every time he has been given a chance.`,
    ]),
    choices: [
      {
        label: `START ${hot.p.name.split(' ').pop()}`,
        detail:
          `${hot.p.name} takes the ${you.lineup.findIndex((p) => p.id === cold.p.id) + 1} slot. ` +
          `${line(hot.l)} — on a sample a third the size, which is the whole risk.`,
        news: `${s.you} bench ${cold.p.name} for ${hot.p.name}.`,
        apply: (x) => withTeam(x, promoteBat(teamOf(x, x.you), cold.p, hot.p)),
      },
      {
        label: 'RIDE IT OUT',
        detail:
          `${cold.p.name} stays where he is. ${line(cold.l)}. He is the better ` +
          `player and a season is long enough for him to prove it.`,
        news: `${s.you} stick with ${cold.p.name}.`,
        apply: (x) => x,
      },
    ],
  };
}

/** Move one arm to the front of the rotation, keeping everybody else in order. */
const promoteArm = (t: Team, name: string): Team => {
  const at = t.rotation.findIndex((a) => a.name === name);
  if (at <= 0) return t;
  const rot = [...t.rotation];
  const [arm] = rot.splice(at, 1);
  return { ...t, rotation: [arm!, ...rot] };
};

/**
 * THE ROTATION. The man you have been calling your ace is not the one pitching
 * like it.
 *
 * ⚠️ NOT ONE RATING MOVES, and no value changes hands — this is the identity
 * swap's cousin. Rotation ORDER is not priced by value.ts and cannot be: it
 * decides who takes the ball on the biggest days and how often, which is a
 * tactical fact about a season rather than a fact about a roster.
 *
 * ⚠️ AND IT IS STILL A TRADE-OFF, because rotation.ts spends rest as stamina.
 * The front of the rotation starts MORE often, so promoting a man is asking
 * him to work on shorter rest for the rest of the year — and the ERA that
 * earned him the promotion was built on the lighter schedule he is leaving.
 */
function rotation(s: Season, day: number): Moment | null {
  const you = teamOf(s, s.you);
  if (!s.stats || you.rotation.length < 2) return null;

  const floor = enoughOuts(day);
  const lines = you.rotation
    .map((a) => ({ a, l: armLine(s, a.name) }))
    .filter((r): r is { a: Pitcher; l: ArmLine } => !!r.l && r.l.outs >= floor);
  if (lines.length < 2) return null;

  const asked = new Set(s.seen ?? []);
  const best = [...lines]
    .filter((r) => !asked.has(`rotation:${r.a.name}`))
    .sort((x, y) => era(x.l) - era(y.l))[0];
  if (!best) return null;
  const ace = lines.find((r) => r.a.name === you.rotation[0]!.name);
  // Nothing to say if your ace IS your best arm, or if the gap is noise.
  if (!ace || best.a.name === ace.a.name) return null;
  if (era(ace.l) - era(best.l) < 1.2) return null;

  const card = (l: ArmLine): string =>
    `${l.w}-${l.l}, ${era(l).toFixed(2)} over ${ip(l.outs)} innings`;

  return {
    id: `rotation:${best.a.name}`,
    day,
    headline: 'THE ROTATION',
    body: oneOf(s, day, 0x7071, [
      `${best.a.name} has been your best arm all year — ${card(best.l)} — and ` +
        `he is throwing behind ${ace.a.name}, who is at ${era(ace.l).toFixed(2)}. ` +
        `The front of a rotation takes the ball more often and on less rest. ` +
        `Nobody's stuff changes either way.`,
      `The pitching coach brought the numbers in himself: ${best.a.name}, ` +
        `${card(best.l)}; ${ace.a.name}, ${era(ace.l).toFixed(2)}. He wants to ` +
        `know who you think your ace is.`,
      `${ace.a.name} has the opening-day start and the big contract. ` +
        `${best.a.name} has ${card(best.l)}. The room knows which one it would ` +
        `rather see on a Friday.`,
    ]),
    choices: [
      {
        label: `${best.a.name.split(' ').pop()} TO THE FRONT`,
        detail:
          `He starts the openers and the big days from here. More starts on ` +
          `shorter rest than the ones that built that ERA.`,
        news: `${s.you} move ${best.a.name} to the front of the rotation.`,
        apply: (x) => withTeam(x, promoteArm(teamOf(x, x.you), best.a.name)),
      },
      {
        label: 'LEAVE IT',
        detail:
          `${ace.a.name} keeps the ball. ${card(ace.l)} — he has been your ace ` +
          `on paper since March and half a season is half a season.`,
        news: `${s.you} keep their rotation as it is.`,
        apply: (x) => x,
      },
    ],
  };
}

/**
 * THE SKID. You have lost enough in a row that somebody upstairs has started
 * counting, and the manager is the one who answers for it.
 *
 * It arrives BECAUSE of something, on the day it is true, with the run of
 * losses named in the body — and it offers what a losing club actually does:
 * change the manager, change the card, or ride it out. Not one rating moves.
 *
 * ⚠️ THE BAR SCALES WITH THE SCHEDULE. Four straight in a fourteen-game season
 * is most of a bad month; four in a hundred and sixty-two is a normal week.
 */
function skid(s: Season, day: number): Moment | null {
  const need = Math.max(4, Math.round(regularDays(s) / 18));
  const lost = skidLength(s);
  if (lost < need) return null;

  const you = teamOf(s, s.you);
  const options = ALL_IDENTITIES.filter((i) => i.name !== you.identity?.name);
  if (options.length === 0) return null;
  const man = rngFor(s, day, 0x5c1d).pick(options);
  const back = gamesBack(s);
  // ⚠️ NOT THE BENCH WITH A NEW HEADLINE ANY MORE. It was exactly that — two
  // hires and "promote inside" — so it now offers the three things a club on a
  // skid actually does: fire the manager, shake the card up, or wait.
  const meeting = cardChoice(
    s,
    'SHAKE UP THE CARD',
    `The lineup is re-cut by what each man has actually hit this year. Same nine, different order.`,
    `${s.you} shuffle the lineup after ${lost} straight.`,
    byOps,
  );
  return {
    id: 'skid',
    day,
    headline: 'THE SKID',
    body:
      `${lost} straight. ` +
      (back > 0 ? `You are ${back.toFixed(1)} back and the room is quiet. ` : `You are still in front, and nobody upstairs cares. `) +
      oneOf(s, day, 0x5c1d, [
        `Somebody has to answer for it, and the front office has a name ready.`,
        `The owner came down to the clubhouse after the last one. He did not say much.`,
        `The radio call-in show has one topic and it is the manager.`,
      ]),
    choices: [
      { ...hireChoice(s, man), label: `HIRE ${man.name}` },
      ...(meeting ? [meeting] : []),
      {
        label: 'STAY THE COURSE',
        detail: `Nobody moves. It is ${lost} games, and baseball is long.`,
        news: `${s.you} stand behind their manager.`,
        apply: (x: Season) => x,
      },
    ],
  };
}

// ------------------------------------------------------- the lineup card

/** This season's OPS for a man, zero if he has not batted. */
const opsOf = (s: Season, p: Player): number => {
  const l = batLine(s, p.name);
  return l && l.pa > 0 ? ops(l) : 0;
};

/** Best season OPS first — the most trips to the plate for the hottest bats. */
const byOps = (t: Team, s: Season): Player[] => [...t.lineup].sort((a, b) => opsOf(s, b) - opsOf(s, a));

/** The textbook card: two table-setters, then the thump, then the rest. */
const byTheBook = (t: Team): Player[] => {
  const setter = (p: Player): number => p.contact + p.vision + p.speed;
  const top = [...t.lineup].sort((a, b) => setter(b) - setter(a)).slice(0, 2);
  const rest = t.lineup.filter((p) => !top.includes(p));
  const thump = [...rest].sort((a, b) => b.power - a.power).slice(0, 3);
  const tail = rest.filter((p) => !thump.includes(p)).sort((a, b) => playerValue(b) - playerValue(a));
  return [...top, ...thump, ...tail];
};

/** Every slugger up top, most at-bats to the most pop. */
const byPower = (t: Team): Player[] => [...t.lineup].sort((a, b) => b.power - a.power);

/**
 * A new batting order as a button, or null if it is the order you already
 * have. The order is re-derived at apply time off the club as it then is.
 *
 * ⚠️ BATTING ORDER REACHES THE GAME, which is why it is a lever here and
 * rotation order is not: pickStarter() never reads the rotation's order, but
 * the top of the card gets more trips to the plate every night.
 */
function cardChoice(
  s: Season,
  label: string,
  detail: string,
  news: string,
  order: (t: Team, s: Season) => Player[],
): Choice | null {
  const you = teamOf(s, s.you);
  const next = order(you, s);
  if (next.every((p, i) => p.id === you.lineup[i]!.id)) return null;
  return {
    label,
    detail: `${detail} Top four: ${next.slice(0, 4).map((p) => surname(p.name)).join(', ')}.`,
    news,
    apply: (x) => {
      const t = teamOf(x, x.you);
      return withTeam(x, { ...t, lineup: order(t, x) });
    },
  };
}

/** Two players trade places in the order. */
const swapSlots = (t: Team, a: Player, b: Player): Team => ({
  ...t,
  lineup: t.lineup.map((p) => (p.id === a.id ? b : p.id === b.id ? a : p)),
});

/**
 * THE LINEUP CARD. One of the floor's always-possible questions: the new
 * hitting coach wants to know how you want the order built.
 */
function card(s: Season, day: number): Moment | null {
  const rng = rngFor(s, day, 0xca4d);
  const all = [
    cardChoice(s, 'BY THE BOOK', 'Two men who get on base, then the three biggest bats, then the rest.', `${s.you} rebuild the lineup by the book.`, byTheBook),
    cardChoice(s, 'BOMBS AWAY', 'Most pop first. More swings for the sluggers, fewer men on base in front of them.', `${s.you} stack the power at the top.`, byPower),
    s.stats ? cardChoice(s, 'RIDE THE HOT HANDS', 'Whoever is hitting now, first.', `${s.you} write the lineup off this year's numbers.`, byOps) : null,
  ].filter((c): c is Choice => c !== null);
  if (all.length === 0) return null;
  return {
    id: 'card',
    day,
    headline: 'THE LINEUP CARD',
    body: oneOf(s, day, 0xca4d, [
      `The new hitting coach has three versions of your lineup taped to the ` +
        `dugout wall and wants you to pick one. Same nine men; different ` +
        `people up with runners on.`,
      `An analyst sent down a memo about batting order. The veterans want it ` +
        `left alone. Nobody's bat changes — who gets the extra at-bat does.`,
      `The lineup card has not changed since spring. The coaches think it is ` +
        `time; some of the players think the opposite.`,
    ]),
    choices: [
      ...shuffled(rng, all).slice(0, 2),
      { label: 'LEAVE IT', detail: 'The order stays as it is.', news: `${s.you} keep their batting order.`, apply: (x) => x },
    ],
  };
}

/**
 * THE HOT BAT. A man hitting at the bottom of the order is out-hitting your
 * cleanup man by a distance. Move him up and he gets more at-bats with men on
 * — and the man you move down gets fewer.
 */
function hotBat(s: Season, day: number): Moment | null {
  const you = teamOf(s, s.you);
  if (!s.stats || you.lineup.length < 6) return null;
  const floor = enoughPA(day);
  const asked = new Set(s.seen ?? []);
  const lined = you.lineup
    .map((p, i) => ({ p, i, l: batLine(s, p.name) }))
    .filter((r): r is { p: Player; i: number; l: BatLine } => !!r.l && r.l.pa >= floor);
  const hot = lined
    .filter((r) => r.i >= 5 && !asked.has(`hot:${r.p.name}`))
    .sort((a, b) => ops(b.l) - ops(a.l))[0];
  const clean = lined.find((r) => r.i === 3);
  if (!hot || !clean || ops(hot.l) < 0.85 || ops(hot.l) - ops(clean.l) < 0.12) return null;
  const o = (l: BatLine): string => ops(l).toFixed(3).replace(/^0/, '');
  return {
    id: `hot:${hot.p.name}`,
    day,
    headline: 'THE HOT BAT',
    body: oneOf(s, day, 0x407b, [
      `${hot.p.name} is batting ${hot.i + 1}th and has an OPS of ${o(hot.l)}. ` +
        `Your cleanup man, ${clean.p.name}, is at ${o(clean.l)}. The coaches ` +
        `want to know if the card still means anything.`,
      `Nobody bats ${hot.p.name} fourth — nobody ever has. He is at ${o(hot.l)} ` +
        `with ${hot.l.hr} home runs from the ${hot.i + 1} hole, and ` +
        `${clean.p.name} is at ${o(clean.l)} batting cleanup.`,
      `Opposing managers have started pitching around the bottom of your order. ` +
        `That is ${hot.p.name}'s doing: ${o(hot.l)}, ${hot.l.rbi} driven in. ` +
        `${clean.p.name} has ${clean.l.rbi} from the four hole.`,
    ]),
    choices: [
      {
        label: `BAT ${surname(hot.p.name)} FOURTH`,
        detail: `${hot.p.name} and ${clean.p.name} trade places. More at-bats with men on for the hot one; the other drops to ${hot.i + 1}th.`,
        news: `${s.you} move ${hot.p.name} into the cleanup spot.`,
        apply: (x) => withTeam(x, swapSlots(teamOf(x, x.you), hot.p, clean.p)),
      },
      {
        label: 'LEAVE THE CARD',
        detail: `${clean.p.name} has hit fourth all year for a reason. A hot month is a hot month.`,
        news: `${s.you} leave the order alone.`,
        apply: (x) => x,
      },
    ],
  };
}

/**
 * THE TABLE-SETTER. Your leadoff man is not getting on base, and somebody
 * further down the order is.
 */
function leadoff(s: Season, day: number): Moment | null {
  const you = teamOf(s, s.you);
  if (!s.stats) return null;
  const floor = enoughPA(day);
  const lead = you.lineup[0]!;
  const ll = batLine(s, lead.name);
  if (!ll || ll.pa < floor || obp(ll) >= 0.3 || (s.seen ?? []).includes(`leadoff:${lead.name}`)) return null;
  const best = you.lineup
    .slice(1)
    .map((p) => ({ p, l: batLine(s, p.name) }))
    .filter((r): r is { p: Player; l: BatLine } => !!r.l && r.l.pa >= floor)
    .sort((a, b) => obp(b.l) - obp(a.l))[0];
  if (!best || obp(best.l) < obp(ll) + 0.07) return null;
  const at = you.lineup.indexOf(best.p) + 1;
  return {
    id: `leadoff:${lead.name}`,
    day,
    headline: 'THE TABLE-SETTER',
    body: oneOf(s, day, 0x1ead, [
      `${lead.name} leads off and is getting on base at ${rate(obp(ll))}. ` +
        `${best.p.name}, batting ${at}th, is at ${rate(obp(best.l))}. The ` +
        `middle of your order keeps coming up with the bases empty.`,
      `Your first man up has reached ${rate(obp(ll))} of the time. The hitting ` +
        `coach has circled ${best.p.name} — ${rate(obp(best.l))}, ${best.l.bb} ` +
        `walks — on the stat sheet twice.`,
      `The first inning has been dead for weeks. ${lead.name} is at ` +
        `${rate(obp(ll))} on base; ${best.p.name} is at ${rate(obp(best.l))} ` +
        `and hitting ${at}th.`,
    ]),
    choices: [
      {
        label: `${surname(best.p.name)} LEADS OFF`,
        detail: `${best.p.name} and ${lead.name} trade places. More men on for the heart of the order — and ${best.p.name}'s bat moves away from the runners he has been driving in.`,
        news: `${s.you} move ${best.p.name} to leadoff.`,
        apply: (x) => withTeam(x, swapSlots(teamOf(x, x.you), lead, best.p)),
      },
      {
        label: 'KEEP HIM THERE',
        detail: `${lead.name} has the legs for the job. The on-base will come.`,
        news: `${s.you} keep ${lead.name} at the top.`,
        apply: (x) => x,
      },
    ],
  };
}

/**
 * THE GLOVE. A regular keeps kicking the ball, and there is a better glove on
 * the bench. His bat for the other man's leather.
 */
function glove(s: Season, day: number): Moment | null {
  const you = teamOf(s, s.you);
  const field = s.stats?.field;
  const bench = you.bench ?? [];
  if (!field || bench.length === 0) return null;
  const need = Math.max(3, Math.round(day / 6));
  const asked = new Set(s.seen ?? []);
  const worst = you.lineup
    .map((p) => ({ p, f: field[p.name] }))
    .filter((r) => !!r.f && !asked.has(`glove:${r.p.name}`))
    .map((r) => ({ ...r, e: r.f!.e, pct: (r.f!.po + r.f!.a) / Math.max(1, r.f!.po + r.f!.a + r.f!.e) }))
    .filter((r) => r.e >= need && r.pct < 0.955)
    .sort((a, b) => b.e - a.e)[0];
  if (!worst) return null;
  const sub = [...bench].sort((a, b) => gloveOf(b) - gloveOf(a))[0]!;
  if (gloveOf(sub) < gloveOf(worst.p) + 0.05) return null;
  const pct = worst.pct.toFixed(3).replace(/^0/, '');
  const bl = batLine(s, worst.p.name);
  return {
    id: `glove:${worst.p.name}`,
    day,
    headline: 'THE GLOVE',
    body: oneOf(s, day, 0x610e, [
      `${worst.p.name} has ${worst.e} errors and is fielding ${pct}. Your ` +
        `pitchers have stopped pretending not to notice. ${sub.name} has the ` +
        `best hands on the club and has not played all week.`,
      `Another one went through ${worst.p.name}'s legs last night — ` +
        `${worst.e} on the year. ${sub.name} takes ground balls before every ` +
        `game and the coaches keep watching him do it.`,
      `${worst.e} errors. The pitching coach asked, politely, whether ` +
        `${sub.name} might play behind his starters for a while.`,
    ]),
    choices: [
      {
        label: `${surname(sub.name)}'S GLOVE`,
        detail: `${sub.name} starts; ${worst.p.name} sits. Fewer runs given away — and ${bl ? `a ${rate(avg(bl))} bat` : 'his bat'} out of the lineup.`,
        news: `${s.you} bench ${worst.p.name} for ${sub.name}'s defense.`,
        apply: (x) => withTeam(x, promoteBat(teamOf(x, x.you), worst.p, sub)),
      },
      {
        label: 'KEEP THE BAT',
        detail: `${worst.p.name} stays out there. You live with the errors for what he does at the plate.`,
        news: `${s.you} stick with ${worst.p.name} in the field.`,
        apply: (x) => x,
      },
    ],
  };
}

/**
 * THE ROLES. A starter keeps getting hit and a reliever keeps getting outs:
 * swap their jobs.
 *
 * ⚠️ WORTH EXACTLY NOTHING TO clubValue(), and on purpose — it averages the
 * rotation and the pen as one staff, so moving a man from one to the other
 * cannot change it. What it changes is real: pickStarter() only reads the
 * rotation, so the reliever now starts, on his short stamina, and the pen gets
 * the long man it has been missing.
 */
function roles(s: Season, day: number): Moment | null {
  const you = teamOf(s, s.you);
  if (!s.stats || you.bullpen.length === 0) return null;
  const asked = new Set(s.seen ?? []);
  const shaky = you.rotation
    .map((a, i) => ({ a, i, l: armLine(s, a.name) }))
    .filter((r): r is { a: Pitcher; i: number; l: ArmLine } => !!r.l && r.l.outs >= enoughOuts(day))
    .filter((r) => !asked.has(`roles:${r.a.name}`))
    .sort((x, y) => era(y.l) - era(x.l))[0];
  const relief = Math.max(12, Math.round(day * 0.8));
  const sharp = you.bullpen
    .map((a, i) => ({ a, i, l: armLine(s, a.name) }))
    .filter((r): r is { a: Pitcher; i: number; l: ArmLine } => !!r.l && r.l.outs >= relief)
    .sort((x, y) => era(x.l) - era(y.l))[0];
  if (!shaky || !sharp || era(shaky.l) < 5.5 || era(shaky.l) - era(sharp.l) < 2.5) return null;
  const e = (l: ArmLine): string => era(l).toFixed(2);
  return {
    id: `roles:${shaky.a.name}`,
    day,
    headline: 'THE ROLES',
    body: oneOf(s, day, 0x401e, [
      `${shaky.a.name} is starting every fifth day with a ${e(shaky.l)} ERA. ` +
        `${sharp.a.name} has a ${e(sharp.l)} out of the pen over ` +
        `${ip(sharp.l.outs)} innings. The pitching coach wants to swap them.`,
      `Every time ${shaky.a.name} takes the ball the pen is up by the fourth. ` +
        `${sharp.a.name} has been the one they call — ${e(sharp.l)} in relief.`,
      `${sharp.a.name} came to the office and asked to start. His ${e(sharp.l)} ` +
        `says he has earned the question; ${shaky.a.name}'s ${e(shaky.l)} says ` +
        `somebody should.`,
    ]),
    choices: [
      {
        label: `${surname(sharp.a.name)} STARTS`,
        detail: `${sharp.a.name} joins the rotation and ${shaky.a.name} goes to the pen. A reliever's legs will not carry him deep, so the pen works more on his days.`,
        news: `${s.you} move ${sharp.a.name} into the rotation and ${shaky.a.name} to the bullpen.`,
        apply: (x) => {
          const t = teamOf(x, x.you);
          const st = t.rotation[shaky.i]!;
          const rp = t.bullpen[sharp.i]!;
          return withTeam(x, {
            ...t,
            rotation: t.rotation.map((a, i) => (i === shaky.i ? rp : a)),
            bullpen: t.bullpen.map((a, i) => (i === sharp.i ? st : a)),
          });
        },
      },
      {
        label: 'EVERYBODY STAYS',
        detail: `${shaky.a.name} keeps his turn. Starters are hard to find; so are relievers you trust.`,
        news: `${s.you} leave the staff as it is.`,
        apply: (x) => x,
      },
    ],
  };
}

/** THE STREAK. You cannot lose, and the front office wants to add while it is hot. */
function streak(s: Season, day: number): Moment | null {
  const won = streakLength(s);
  if (won < Math.max(4, Math.round(regularDays(s) / 18))) return null;
  const rng = rngFor(s, day, 0x57ea);
  const w = firstSwap(s, shuffled(rng, othersOf(s)).slice(0, 6), 'lineup', rng);
  if (!w) return null;
  return {
    id: 'streak',
    day,
    headline: 'THE STREAK',
    body: oneOf(s, day, 0x57ea, [
      `${won} straight. The GM called during the last one and wants to strike ` +
        `while it is going — there is a bat available if you want to change ` +
        `what this club looks like.`,
      `${won} in a row and the park sold out on a Tuesday. Everybody wants to ` +
        `add. Everybody also knows you do not touch a streak.`,
      `The streak is at ${won}. ${teamOf(s, w.partner).name} have called about ` +
        `a swap. It will not make you better; it will make you different.`,
    ]),
    choices: [
      swapChoice(s, w),
      {
        label: "DON'T TOUCH IT",
        detail: `${won} straight with these nine. You are not going to be the one who breaks it.`,
        news: `${s.you} stay put in the middle of a ${won}-game streak.`,
        apply: (x) => x,
      },
    ],
  };
}

/**
 * THE WHITE FLAG. Past the midpoint and well out of it: a contender wants
 * your best starter, and will send a different kind of arm back.
 */
function sellers(s: Season, day: number): Moment | null {
  const n = regularDays(s);
  const back = gamesBack(s);
  if (day < n * 0.5 || back < Math.max(5, n * 0.1)) return null;
  // Bottom third too: ten back in a tight league can still be fourth.
  const table = standings(s);
  if (table.findIndex((r) => r.abbr === s.you) < (table.length * 2) / 3) return null;
  const you = teamOf(s, s.you);
  const ace = you.rotation.reduce((b, a, i) => (armValue(a) > armValue(you.rotation[b]!) ? i : b), 0);
  const contenders = standings(s).filter((r) => r.abbr !== s.you).slice(0, 4).map((r) => teamOf(s, r.abbr));
  const w = firstSwap(s, contenders, 'rotation', rngFor(s, day, 0x5e11), ace);
  if (!w) return null;
  const name = you.rotation[ace]!.name;
  const buyer = teamOf(s, w.partner).name;
  return {
    id: 'sellers',
    day,
    headline: 'THE WHITE FLAG',
    body: oneOf(s, day, 0x5e11, [
      `You are ${back.toFixed(1)} back and the calendar is running out. ` +
        `${buyer} are in the race and want ${name}. They will send a ` +
        `starter back — not a better one, a different one.`,
      `The scouts in the stands are all watching ${name}. ${buyer} made the ` +
        `call first. ${back.toFixed(1)} games back is a long way to come.`,
      `${buyer} think ${name} is the last piece. You are ${back.toFixed(1)} ` +
        `out. Nobody here is saying the word "rebuild", but the phone rang.`,
    ]),
    choices: [
      swapChoice(s, w, `DEAL ${surname(name)}`),
      {
        label: 'KEEP HIM',
        detail: `${name} stays. There are ${n - day} games left, and you are not waving anything.`,
        news: `${s.you} hang up on ${buyer}.`,
        apply: (x) => x,
      },
    ],
  };
}

/**
 * THE RIVAL. The club you play today has had your number all year. The lever
 * is the batting order, the one thing a manager rewrites before a series.
 */
function rival(s: Season, day: number): Moment | null {
  const g = gamesOn(s, day).find((m) => m.home === s.you || m.away === s.you);
  if (!g) return null;
  const opp = g.home === s.you ? g.away : g.home;
  const seen = s.seen ?? [];
  // Two grudges a year at most — at 162 games there are a lot of clubs you are 1-4 against.
  if (seen.includes(`rival:${opp}`) || seen.filter((x) => x.startsWith("rival:")).length >= 2) return null;
  const met = yourGames(s).filter((r) => r.home === opp || r.away === opp);
  const w = met.filter((r) => wonIt(s, r)).length;
  const l = met.length - w;
  if (l < 4 || l < w * 2 + 2) return null;
  const them = teamOf(s, opp);
  const cards = [
    cardChoice(s, 'STACK THE TOP', 'Whoever is hitting now, first — for this series and after.', `${s.you} reshuffle the order for ${opp}.`, byOps),
    cardChoice(s, 'BY THE BOOK', 'Two on-base men, then the thump. The order the book says beats good pitching.', `${s.you} rebuild the lineup by the book before ${opp}.`, byTheBook),
  ].filter((c): c is Choice => c !== null);
  if (cards.length === 0) return null;
  return {
    id: `rival:${opp}`,
    day,
    headline: 'THE RIVAL',
    body: oneOf(s, day, 0x41a1, [
      `${them.name} again. They are ${l}-${w} against you this year and it ` +
        `has started to feel personal. The coaches want to change something ` +
        `before first pitch.`,
      `${l}-${w}. That is the season series with ${them.name}, and they are ` +
        `on the schedule today. Your players have been asked about it all week.`,
      `Nobody on this club likes ${them.name}, and ${them.name} have won ${l} ` +
        `of ${met.length}. The lineup card is on your desk.`,
    ]),
    choices: [
      ...cards,
      {
        label: 'PLAY IT STRAIGHT',
        detail: `Same card as always. It is one series, and ${l}-${w} is a small sample.`,
        news: `${s.you} change nothing for ${opp}.`,
        apply: (x) => x,
      },
    ],
  };
}

/**
 * THE PHONE CALL. A club out of the race is shopping a bat and will take one
 * of yours for him — a different kind of hitter at the same price.
 */
function phone(s: Season, day: number): Moment | null {
  const rng = rngFor(s, day, 0x9407);
  const cellar = standings(s).filter((r) => r.abbr !== s.you).slice(-6).map((r) => teamOf(s, r.abbr));
  const offers: Swap[] = [];
  for (const p of shuffled(rng, cellar)) {
    const w = oneForOne(s, p, 'lineup', rng);
    if (w && !offers.some((o) => o.outAt === w.outAt)) offers.push(w);
    if (offers.length === 2) break;
  }
  if (offers.length === 0) return null;
  const who = offers.map((w) => teamOf(s, w.partner).name).join(' and ');
  const many = offers.length > 1;
  return {
    id: 'phone',
    day,
    headline: 'THE PHONE CALL',
    body: oneOf(s, day, 0x9407, [
      `${who} ${many ? 'are' : 'is'} going nowhere this year and shopping ` +
        `bats. They want one of yours back — same value, a different kind of ` +
        `hitter.`,
      `A GM with nothing to play for called at midnight. ${who} will move a ` +
        `bat for a bat; the question is what kind of lineup you want.`,
      `${who} ${many ? 'have' : 'has'} started selling. The scouts like the ` +
        `swap on paper — it changes your lineup's shape, not its strength.`,
    ]),
    choices: [
      ...offers.map((w) => swapChoice(s, w)),
      { label: 'NOT INTERESTED', detail: 'Your nine stay your nine.', news: `${s.you} pass on the phone call.`, apply: (x) => x },
    ],
  };
}

/** THE BULLPEN. A reliever for a reliever, a different kind of arm. */
function pen(s: Season, day: number): Moment | null {
  const rng = rngFor(s, day, 0x9e11);
  const w = firstSwap(s, shuffled(rng, othersOf(s)).slice(0, 8), 'bullpen', rng);
  if (!w) return null;
  const out = teamOf(s, s.you).bullpen[w.outAt]!;
  const them = teamOf(s, w.partner).name;
  return {
    id: 'pen',
    day,
    headline: 'THE BULLPEN',
    body: oneOf(s, day, 0x9e11, [
      `${them} want ${out.name} out of your pen and will send a reliever ` +
        `back. Not a better arm — a different one.`,
      `Your bullpen coach has been asking for ${w.words.split(',')[0]} for ` +
        `a month. ${them} have it, and they want ${out.name}.`,
      `A reliever-for-reliever call from ${them}. A small move, the kind ` +
        `nobody writes about until October.`,
    ]),
    choices: [
      swapChoice(s, w),
      { label: 'KEEP THE PEN', detail: `${out.name} stays where he is.`, news: `${s.you} keep their bullpen together.`, apply: (x) => x },
    ],
  };
}

// ---------------------------------------------------------- the scenarios

/** One thing the season might ask you about. */
interface Scenario {
  /**
   * Stable across versions — it is written into the save as the record of
   * what has already been asked. Renaming one re-arms it for every season in
   * progress, which is a free second trade.
   */
  id: string;
  offer(s: Season, day: number): Moment | null;
}

const earned = (id: string, f: (s: Season, d: number) => Moment | null): Scenario => ({
  id,
  offer: (s, d) => (inWindow(s, d) ? f(s, d) : null),
});

/**
 * EVERY EARNED SCENARIO, IN TWO TIERS. The man-level ones — something one
 * player or one arm did — come first; the club-level ones after. Within a tier
 * the order is SHUFFLED BY THE SEASON on each day: several are usually true at
 * once, and a fixed order meant the slump won that tie every time.
 *
 * ⚠️ TRADE-OFFS ONLY, WHICH IS THE RULE THIS FILE WAS BUILT ON, and it is now
 * enforced in one place rather than trusted: see fair(). Any choice that moves
 * your club by more than FAIR is dropped before the screen sees it.
 *
 * ⚠️ AN ID NAMES ITS SUBJECT WHERE IT HAS ONE. `slump:Ed Mancuso`, not
 * `slump` — see momentOn(). The club-level ones keep bare ids, except the
 * rival, which names the club: a different rival later is a different story.
 */
const EARNED: readonly (readonly Scenario[])[] = [
  [
    earned('slump', slump),
    earned('rotation', rotation),
    earned('hot', hotBat),
    earned('leadoff', leadoff),
    earned('glove', glove),
    earned('roles', roles),
  ],
  [earned('skid', skid), earned('streak', streak), earned('sellers', sellers), earned('rival', rival)],
];

/**
 * THE FLOOR: THE QUESTIONS THAT NEED NOTHING TO HAVE HAPPENED. A quiet season
 * must still ask something, so every season draws two of these, on two days
 * of its own. None of them needs the stat book, so any of them can fire on
 * any day of any season.
 *
 * ⚠️ THEY OWN THEIR DAY — checked before the earned list AND before the rest
 * gate. A slump three days earlier must not be able to eat the only deadline
 * of the year; measured, that happened in 18 seasons of 40 when the dated two
 * were the last rows of one list.
 */
const FLOOR: Readonly<Record<string, (s: Season, d: number) => Moment | null>> = {
  deadline,
  bench,
  phone,
  pen,
  card,
};

/** The floor's ids — exported so the tests can ask "was that one of them". */
export const FLOOR_IDS: readonly string[] = Object.keys(FLOOR);

/**
 * Which two floor questions this season asks, and when. Drawn from the seed
 * alone, so it is fixed for the year and survives a reload.
 *
 * ponytail: `kinds` is the whole pool, shuffled. Day one tries kinds[0], day
 * two kinds[1], and either falls back through kinds[2..] if its own has
 * nothing to offer that day (a deadline with no fair trade).
 */
export function anchorPlan(s: Season): { days: [number, number]; kinds: string[] } {
  const n = regularDays(s);
  const rng = makeRng(s.seed ^ 0xa2c4);
  const kinds = shuffled(rng, FLOOR_IDS);
  const between = (a: number, b: number): number =>
    Math.min(n - 1, rng.int(Math.max(1, Math.round(n * a)), Math.max(1, Math.round(n * b))));
  return { days: [between(0.25, 0.45), between(0.55, 0.75)], kinds };
}

function anchorOn(s: Season, day: number, used: ReadonlySet<string>): Moment | null {
  const { days, kinds } = anchorPlan(s);
  const i = days.indexOf(day);
  if (i < 0) return null;
  for (const k of [kinds[i]!, ...kinds.slice(2)]) {
    if (used.has(k)) continue;
    const m = fair(s, FLOOR[k]!(s, day));
    if (m && !used.has(m.id)) return m;
  }
  return null;
}

/**
 * ⚠️ THE TRADE-OFF RULE, ENFORCED. Drops any choice that RAISES your club by
 * more than FAIR, and the whole moment if fewer than two choices survive — a
 * screen with one button is not a question.
 *
 * ⚠️ ONE-SIDED ON PURPOSE. The rule is that a moment never HANDS you value —
 * a reward compounds and the club in front runs away with it. Spending value
 * is allowed: the slump and the glove put a lesser man in the nine, and that
 * cost is the bet. Trades are held to FAIR both ways in oneForOne() and
 * bestTrade(), because there the other club is the one who would gain.
 */
function fair(s: Season, m: Moment | null): Moment | null {
  if (!m) return null;
  const choices = m.choices.filter((c) => valueShift(s, c.apply(s)) <= FAIR);
  return choices.length >= 2 ? { ...m, choices } : null;
}

// ------------------------------------------------------------- the caller

/** One kind, asked directly and held to fair() — the tests aim at triggers with it. */
export function offer(kind: string, s: Season, day: number = s.day): Moment | null {
  const sc = EARNED.flat().find((x) => x.id === kind);
  return fair(s, sc ? sc.offer(s, day) : (FLOOR[kind]?.(s, day) ?? null));
}


/**
 * The moment waiting on this day, or null.
 *
 * ⚠️ `decided` IS THE GATE AND THE NEWS FEED IS NOT. It would have been one
 * fewer field to ask "did a roster headline already fire on this day" — the
 * wire is saved and it would have worked. But franchise.ts is explicit that
 * the news is display text that "cannot reach the engine" and is deliberately
 * not validated line by line, and gating a roster mutation on it would make a
 * hand-edited save able to hand out a second free trade. One number in an
 * array, validated on load, is the honest version.
 */
export function momentOn(s: Season, day: number = s.day): Moment | null {
  if (day >= regularDays(s)) return null;
  if ((s.decided ?? []).includes(day)) return null;

  const used = new Set(s.seen ?? []);
  const anchor = anchorOn(s, day, used);
  if (anchor) return anchor;

  // ⚠️ THE FRONT OFFICE DOES NOT RING EVERY MORNING. See restBetween().
  const last = Math.max(-Infinity, ...(s.decided ?? []));
  if (day - last < restBetween(s)) return null;

  // ⚠️ THE GATE IS THE MOMENT'S ID, NOT THE SCENARIO'S, and that is what lets a
  // long season keep finding things to say. A slump is identified by the man
  // slumping — `slump:Ed Mancuso` — so a DIFFERENT hitter going cold in August
  // is a different question and gets asked. The scenario itself filters out
  // subjects it has already raised, so this is a backstop rather than the rule.
  const rng = rngFor(s, day, 0x71e5);
  for (const tier of EARNED) {
    for (const sc of shuffled(rng, tier)) {
      const m = fair(s, sc.offer(s, day));
      if (m && !used.has(m.id)) return m;
    }
  }
  return null;
}

/**
 * Take one. Marks the day decided, applies the roster edit and files the wire
 * line — in that order, so a choice that somehow throws cannot leave a season
 * that thinks it already asked.
 *
 * ⚠️ IT DOES NOT ADVANCE THE DAY. A moment happens BEFORE the day's game, and
 * playDay() still has to run afterwards; folding the two together would make
 * the trade land after the game it was supposed to change.
 */
export function decide(s: Season, m: Moment, index: number): Season {
  const choice = m.choices[index];
  if (!choice) return s;
  const applied = choice.apply(s);
  const note: NewsItem = { day: m.day, kind: 'roster', text: choice.news };
  return {
    ...applied,
    decided: [...(s.decided ?? []), m.day],
    // ⚠️ THE ID IS THE REAL GATE.  records the DAY you were asked on,
    // which was gate enough while there were two moments on two fixed days. A
    // trigger stays true for as long as the thing it noticed is true, so
    // without this the slump would ask again tomorrow, and the day after.
    seen: [...(s.seen ?? []), m.id],
    news: [...(applied.news ?? []), note],
  };
}

/**
 * What the choice did to your roster value, for the screen to show AFTER the
 * fact. Not before — see the design note at the top. The number is the point
 * of the whole "trade-offs only" rule and it should be near zero.
 */
export const valueShift = (before: Season, after: Season): number =>
  clubValue(teamOf(after, after.you)) - clubValue(teamOf(before, before.you));
