/**
 * FRANCHISE MOMENTS. Twice a year the season stops and asks you something.
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
 * ponytail: TWO moments, on FIXED DAYS, with RANDOM contents. Fixed days
 * because a moment that might not come is a moment the player cannot plan
 * around, and because "day 5" is one comparison rather than a scheduler.
 * Random contents because the same trade every season is a puzzle you solve
 * once. No third moment, no draft, no free agency, no arbitration — those are
 * an offseason, which franchise.ts is explicit about not being.
 */

import { makeRng } from '../core/rng.ts';
import type { Player } from '../core/roster.ts';
import type { Pitcher } from '../core/pitcher.ts';
import { LEAGUE, type Team } from './teams.ts';
import { ALL_IDENTITIES, type Identity } from './identity.ts';
import { playerValue, armValue, clubValue } from './value.ts';
import { REGULAR_DAYS, teamOf, type NewsItem, type Season } from './franchise.ts';

/**
 * WHEN THEY FIRE. Both inside the regular season, both far enough from the end
 * that the choice has games left to matter in.
 *
 * ⚠️ DERIVED FROM REGULAR_DAYS, NOT WRITTEN AS 5 AND 10. The schedule length
 * is a number franchise.ts reserves the right to change — OPPONENTS is one
 * constant away from a longer year — and two hard-coded days would silently
 * drift to the wrong third of the season, or past the end of it.
 */
export const MOMENT_DAYS: readonly number[] = [
  Math.round(REGULAR_DAYS / 3),
  Math.round((REGULAR_DAYS * 2) / 3),
];

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
function deadline(s: Season, day: number): Moment | null {
  const you = teamOf(s, s.you);
  const rng = makeRng((s.seed ^ 0x5eed) + day * 7919);
  const others = LEAGUE.map((t) => teamOf(s, t.abbr)).filter((t) => t.abbr !== s.you);

  for (let attempt = 0; attempt < 6; attempt++) {
    const partner = rng.pick(others);
    const forArm = bestTrade(you, partner, true);
    const forBat = bestTrade(you, partner, false);
    if (!forArm && !forBat) continue;

    return {
      day,
      headline: 'THE DEADLINE',
      body:
        `${partner.name} are on the phone. They have looked at your club and ` +
        `they know what you are short of. Nothing here makes you better on ` +
        `paper — it moves what you are made of.`,
      choices: [
        ...(forArm ? [tradeChoice(you, forArm, true)] : []),
        ...(forBat ? [tradeChoice(you, forBat, false)] : []),
        {
          label: 'STAND PAT',
          detail: 'You like your club. Nine games left to prove it.',
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
function bench(s: Season, day: number): Moment | null {
  const you = teamOf(s, s.you);
  const rng = makeRng((s.seed ^ 0xbe4c) + day * 104729);
  const current = you.identity?.name;
  const options = ALL_IDENTITIES.filter((i) => i.name !== current);
  if (options.length < 2) return null;

  // Two names, drawn without replacement.
  const first = rng.pick(options);
  const second = rng.pick(options.filter((i) => i.name !== first.name));

  const hire = (id: Identity): Choice => ({
    label: id.name,
    detail: id.hire,
    news: `${s.you} hire a new bench boss. They are a ${id.name} club now.`,
    apply: (x: Season) => withTeam(x, { ...teamOf(x, x.you), identity: id }),
  });

  return {
    day,
    headline: 'THE BENCH',
    body:
      `Your manager is gone. The front office has two names and wants an ` +
      `answer before the bus leaves. Nobody's ratings move either way — what ` +
      `changes is how the club is asked to play.`,
    choices: [
      hire(first),
      hire(second),
      {
        label: 'PROMOTE INSIDE',
        detail: `The bench coach steps up and nothing changes. ${you.identity?.blurb ?? ''}`,
        news: `${s.you} promote from within. No change on the bench.`,
        apply: (x: Season) => x,
      },
    ],
  };
}

// ------------------------------------------------------------- the caller

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
  if (day >= REGULAR_DAYS) return null;
  if (!MOMENT_DAYS.includes(day)) return null;
  if ((s.decided ?? []).includes(day)) return null;
  // The deadline first, the bench second. Fixed, so a season reads as a story
  // rather than as two rolls of the same die.
  return day === MOMENT_DAYS[0] ? deadline(s, day) : bench(s, day);
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
