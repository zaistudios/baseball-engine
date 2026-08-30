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

import { makeRng } from '../core/rng.ts';
import type { Player } from '../core/roster.ts';
import type { Pitcher } from '../core/pitcher.ts';
import { LEAGUE, type Team } from './teams.ts';
import { ALL_IDENTITIES, type Identity } from './identity.ts';
import { playerValue, armValue, clubValue } from './value.ts';
import { regularDays, standings, teamOf, type NewsItem, type Result, type Season } from './franchise.ts';
import { avg, era, ip, rate, type ArmLine, type BatLine } from './stats.ts';

/**
 * WHEN THEY FIRE. Both inside the regular season, both far enough from the end
 * that the choice has games left to matter in.
 *
 * ⚠️ DERIVED FROM THE SEASON'S OWN LENGTH, NOT WRITTEN AS 5 AND 10, and it is
 * now a function rather than a constant because the length is a thing the
 * player picks. Two hard-coded days would sit in the wrong third of a
 * twenty-eight-game year and off the end of a fourteen-game one.
 */
export const momentDays = (s: Season): readonly number[] => [
  Math.round(regularDays(s) / 3),
  Math.round((regularDays(s) * 2) / 3),
];

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

/** Games behind the leader, off the table this season has. */
const gamesBack = (s: Season): number =>
  standings(s).find((r) => r.abbr === s.you)?.gb ?? 0;

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
const restBetween = (s: Season): number => Math.max(3, Math.round(regularDays(s) / 9));

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
      id: 'deadline',
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
    id: 'bench',
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
    body:
      `${cold.p.name} is hitting ${rate(avg(cold.l))}. He has been in the ` +
      `lineup all year and the bat has not come. ${hot.p.name} has been on the ` +
      `bench hitting ${rate(avg(hot.l))} in a third of the work, and the ` +
      `clubhouse has noticed which way round that is.`,
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
    body:
      `${best.a.name} has been your best arm all year — ${card(best.l)} — and ` +
      `he is throwing behind ${ace.a.name}, who is at ${era(ace.l).toFixed(2)}. ` +
      `The front of a rotation takes the ball more often and on less rest. ` +
      `Nobody's stuff changes either way.`,
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
 * ⚠️ IT IS THE BENCH MOMENT, EARNED. Same machinery, same "not one rating
 * moves" promise — what changes is that it arrives BECAUSE of something, on
 * the day it is true, with the run of losses named in the headline. The
 * scheduled version still exists further down the list for a season where this
 * never triggers.
 *
 * ⚠️ THE BAR SCALES WITH THE SCHEDULE. Four straight in a fourteen-game season
 * is most of a bad month; four in a hundred and sixty-two is a normal week.
 */
function skid(s: Season, day: number): Moment | null {
  const need = Math.max(4, Math.round(regularDays(s) / 18));
  const lost = skidLength(s);
  if (lost < need) return null;

  const base = bench(s, day);
  if (!base) return null;
  const back = gamesBack(s);
  return {
    ...base,
    id: 'skid',
    headline: 'THE SKID',
    body:
      `${lost} straight. ` +
      (back > 0 ? `You are ${back.toFixed(1)} back and the room is quiet. ` : `You are still in front, and nobody upstairs cares. `) +
      `The front office is not asking about the roster — they have two names ` +
      `and they want to know how this club is supposed to play.`,
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

/**
 * EVERY SCENARIO, IN PRIORITY ORDER. The first one whose conditions the season
 * actually meets is the one that fires.
 *
 * ⚠️ ORDER IS THE TIE-BREAK AND IT IS DELIBERATE. Several of these are usually
 * true at once — a club on a losing run generally has a man slumping too — so
 * the list is sorted by how much the moment is ABOUT something. The deadline
 * and the manager are scheduled events that happen to every club; they go
 * last, so an earned scenario takes the day ahead of a calendar one.
 *
 * ⚠️ TRADE-OFFS ONLY, WHICH IS THE RULE THIS FILE WAS BUILT ON. Not one of
 * these hands you value for having played well — the slump trades a better
 * player for a hotter one, the rotation trades rest for starts, the manager
 * moves no ratings at all, and the deadline is matched to FAIR. That is a
 * DESIGN decision rather than a technical limit: if a good season should earn
 * a real reward, the seam is a Choice whose apply() raises a rating, and
 * nothing else here has to change.
 *
 * ⚠️ AN ID NAMES ITS SUBJECT WHERE IT HAS ONE. `slump:Ed Mancuso`, not
 * `slump` — see momentOn(). A season is only as talkative as the number of
 * distinct things it can notice, and gating on the bare scenario name capped a
 * hundred-and-sixty-two-game year at five decisions total. The club-level ones
 * (a skid, the deadline, the manager) keep bare ids: those are once a year by
 * nature.
 *
 * ⚠️ THE LAST TWO KEEP THEIR FIXED DAYS ON PURPOSE. A quiet season — no
 * slumps, no rotation muddle — would otherwise ask you nothing at all, and a
 * franchise mode whose one decision layer can silently never appear is worse
 * than one that is occasionally on rails.
 */
const SCENARIOS: readonly Scenario[] = [
  { id: 'slump', offer: (s, d) => (inWindow(s, d) ? slump(s, d) : null) },
  { id: 'rotation', offer: (s, d) => (inWindow(s, d) ? rotation(s, d) : null) },
  { id: 'skid', offer: (s, d) => (inWindow(s, d) ? skid(s, d) : null) },
  { id: 'deadline', offer: (s, d) => (d === momentDays(s)[0] ? deadline(s, d) : null) },
  { id: 'bench', offer: (s, d) => (d === momentDays(s)[1] ? bench(s, d) : null) },
];

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
  if (day >= regularDays(s)) return null;
  if ((s.decided ?? []).includes(day)) return null;

  // ⚠️ THE FRONT OFFICE DOES NOT RING EVERY MORNING. See restBetween().
  const last = Math.max(-Infinity, ...(s.decided ?? []));
  if (day - last < restBetween(s)) return null;

  // ⚠️ THE GATE IS THE MOMENT'S ID, NOT THE SCENARIO'S, and that is what lets a
  // long season keep finding things to say. A slump is identified by the man
  // slumping — `slump:Ed Mancuso` — so a DIFFERENT hitter going cold in August
  // is a different question and gets asked. The scenario itself filters out
  // subjects it has already raised, so this is a backstop rather than the rule.
  const used = new Set(s.seen ?? []);
  for (const sc of SCENARIOS) {
    const m = sc.offer(s, day);
    if (m && !used.has(m.id)) return m;
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
