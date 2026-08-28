/**
 * The run: nine encounters, money, and the shop between them.
 *
 * This is the roguelike layer. inning.ts owns one match; this owns the
 * sequence of them and everything that carries across.
 *
 * THE SCOPE LINE, from the hub, stated once: **three leagues x three matches
 * = nine encounters.** The GDD's 5 leagues x 3 pitchers plus playoffs is on
 * the record and was not chosen. Nine is what makes the batter-only design
 * fit a mobile session, and it is the project's cleanest scope artifact.
 *
 * The cash numbers started as a port of GameState.gd, which paid per at-bat
 * as it happened. That drip is gone — see matchPayout(). The prototype's
 * relative values survive; the moment of payment does not.
 */

import type { Rng } from './rng.ts';
import { playerWon, opponentRuns, type MatchState } from './inning.ts';

import { DIVISION_ORDER, DIVISIONS, type DivisionId } from './division.ts';
// Type-only, so this does not close a cycle with roster.ts at runtime.
import type { Build, Trait, Equipment } from './roster.ts';

/** Leagues became DIVISIONS — how automated the league is. See division.ts. */
export type LeagueId = DivisionId;
export const LEAGUE_ORDER = DIVISION_ORDER;

/** Matches per league is 3 everywhere — the prototype's own league_data. */
export const MATCHES_PER_LEAGUE = 3;

/**
 * How long one encounter lasts, in innings of three outs.
 *
 * Was 3 (nine outs). Zane played it and said it felt like an endless batting
 * simulator, which the arithmetic backs up: nine outs is 12-18 at-bats, times
 * nine encounters is well over a hundred at-bats a run. A roguelike round
 * should be a handful of decisions, not a ball game.
 *
 * One inning makes an encounter short and tense: three outs to hit the
 * target, and every out costs a third of the round.
 */
export const INNINGS_PER_MATCH = 1;

/**
 * RUN_TARGET is gone. It was a placeholder number the player had to be told;
 * the opposing team's score is the same information delivered as a ball game,
 * and it comes with a scoreboard. See opponent.ts. The difficulty ladder now
 * lives in how many runs each league's offence puts up, which is one table
 * instead of a rule.
 */

// ------------------------------------------------------------------- economy

/**
 * REBALANCED after play. The first pass paid a win $200 against a $500 float
 * and $100 items, so one good game bought anything on the shelf and the shop
 * stopped being a decision. Everything below is roughly a third of what it
 * was, and prices moved down with it, so a typical game buys about one
 * common and a great one buys a rare.
 */
export const MATCH_WIN_CASH = 60;
export const MATCH_LOSS_CASH = 25;
export const STARTING_MONEY = 100;

/**
 * NO MONEY CHANGES HANDS DURING A GAME.
 *
 * The at-bat drip is gone — a single used to pay $10 the instant it landed.
 * Zane's call, and it is the right one: paying per at-bat makes every game
 * the same slow accumulation, so nothing about a particular game feels
 * different from any other. Settling once, off the box score, means a 6-0
 * blowout and a scraped 2-1 win are different paydays.
 *
 * The prototype's numbers survive inside the box-score lines below — a homer
 * is still worth more than a single. They are just paid at the window instead
 * of at the plate.
 */
export interface PayoutLine {
  label: string;
  amount: number;
}

export interface BoxScore {
  hits: number;
  atBats: number;
  homeRuns: number;
  rbis: number;
}

/**
 * What the game paid, itemised.
 *
 * Returned as lines rather than a total on purpose. The Balatro note in the
 * vault is explicit that the SENSATION of the arithmetic is the product —
 * an itemised payout that counts itself out is worth more than the same
 * number arriving silently.
 */
export function matchPayout(
  match: MatchState,
  box: BoxScore,
  division: DivisionId = 'holdouts',
  endorsements = 0,
): PayoutLine[] {
  const lines: PayoutLine[] = [];
  const won = playerWon(match);
  const them = opponentRuns(match);
  const margin = match.runs - them;

  lines.push({ label: won ? 'Win' : 'Loss', amount: won ? MATCH_WIN_CASH : MATCH_LOSS_CASH });

  if (won && margin >= 2) lines.push({ label: `Margin (${margin} runs)`, amount: margin * 12 });
  if (won && them === 0) lines.push({ label: 'Shutout', amount: 30 });
  // They batted first, so any win over a team that scored is a comeback.
  if (won && them > 0) lines.push({ label: 'Came from behind', amount: 25 });
  if (!won && margin === 0) lines.push({ label: 'Tied it up', amount: 15 });

  // Your line in this game. The prototype's ordering survives: the homer is
  // worth several hits, the hit is worth more than the RBI that followed it.
  if (box.homeRuns > 0) lines.push({ label: `Home runs (${box.homeRuns})`, amount: box.homeRuns * 40 });
  if (box.hits > 0) lines.push({ label: `Hits (${box.hits})`, amount: box.hits * 10 });
  if (box.rbis > 0) lines.push({ label: `RBI (${box.rbis})`, amount: box.rbis * 8 });
  if (box.atBats > 0 && box.hits / box.atBats >= 0.5) {
    lines.push({ label: 'Hit .500 or better', amount: 20 });
  }
  if (box.atBats >= 2 && box.hits === 0) lines.push({ label: 'Held hitless', amount: -15 });

  // Endorsement items pay on top of the game, not per at-bat.
  if (endorsements > 0) lines.push({ label: 'Endorsements', amount: endorsements });

  // The ladder pays for the harder room.
  const multiplier = { holdouts: 1, splice: 1.4, foundry: 1.9 }[division];
  if (multiplier > 1) {
    const base = lines.reduce((a, l) => a + l.amount, 0);
    lines.push({
      label: `${DIVISIONS[division].name} (x${multiplier})`,
      amount: Math.round(base * (multiplier - 1)),
    });
  }

  return lines;
}

export const payoutTotal = (lines: readonly PayoutLine[]): number =>
  lines.reduce((a, l) => a + l.amount, 0);

// --------------------------------------------------------------------- shop

export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary' | 'mythic';

/** The GDD's rarity ladder. Weights are draw chances, not prices. */
export const RARITY_WEIGHT: Record<Rarity, number> = {
  common: 50,
  uncommon: 28,
  rare: 15,
  legendary: 6,
  mythic: 1,
};

export interface PowerUp {
  id: string;
  name: string;
  description: string;
  cost: number;
  rarity: Rarity;
  /** Only stats the hit engine actually reads. An item that moved a stat
   *  nothing consumes would be a lie told in the shop. */
  power?: number;
  contact?: number;
  clutch?: number;
  /** Flat cash added to every future payout. The economy build. */
  endorsement?: number;
  /**
   * The right hands for this item. Give it to a matching player and every
   * stat line above DOUBLES, downsides included.
   *
   * This is the fix for "the items don't synergize enough". A flat +0.20 power
   * is a number; "+0.20 power, +0.40 in a slugger's hands" is a reason to buy
   * a player, and a reason to buy this item AFTER that player. Items that
   * leave this undefined are the plain ones, and the shelf needs plain ones or
   * a synergy is not a payoff.
   */
  synergy?: { build?: Build; trait?: Trait; label: string };
}

/**
 * One item per player, and no more than six items in a run.
 *
 * Nine roster slots and six items means three of your hitters bat bare — you
 * cannot kit out the whole order, so where an item goes stays a decision right
 * to the last shop.
 */
export const MAX_ITEMS = 6;

/**
 * What the next signing costs, given how many you already have.
 *
 * Signing used to be free, which made the draft a strict upgrade every stop
 * and the shop a formality. The price climbs so a nine-man order is a real
 * ambition you pay for in items you did not buy.
 *
 * ponytail: linear, tuned against ~$150-250 a game over nine games. Move the
 * base if a full roster proves trivially or never affordable.
 */
export const SIGN_BASE = 50;
export const signCost = (signedCount: number): number =>
  SIGN_BASE * Math.max(1, signedCount - 2);

/**
 * Twenty items across four axes: power, contact, clutch, and money.
 *
 * The money axis exists so there is a BUILD to make rather than a stat to
 * raise. An endorsement pays whether you go 3-for-3 or 0-for-3, so stacking
 * them is a real alternative strategy to stacking power — and it makes the
 * early shop decision (spend on the bat, or on the paycheck that buys the
 * next bat) actually interesting.
 *
 * Downsides on the strong items keep them from being straight upgrades.
 *
 * ponytail: generic names. The vault holds researched, named items drawn from
 * real baseball — swap them in when their effects are specified rather than
 * inventing effects here and attributing them to the research.
 */
export const CATALOG: readonly PowerUp[] = [
  // Common — one small thing each.
  { id: 'pine_tar', name: 'Pine Tar', description: '+0.10 contact', cost: 60, rarity: 'common', contact: 0.1,
    synergy: { build: 'human', label: 'Tar and Bare Hands' } },
  { id: 'weighted_donut', name: 'Weighted Donut', description: '+0.10 power', cost: 60, rarity: 'common', power: 0.1,
    synergy: { trait: 'slugger', label: "Slugger's Warmup" } },
  { id: 'rosin_bag', name: 'Rosin Bag', description: '+0.08 contact, +0.08 clutch', cost: 70, rarity: 'common', contact: 0.08, clutch: 0.08,
    synergy: { trait: 'grit', label: 'Dust and Nerve' } },
  { id: 'local_radio', name: 'Local Radio Spot', description: '+$8 every game', cost: 70, rarity: 'common', endorsement: 8 },
  { id: 'batting_cage', name: 'Cage Time', description: '+0.12 contact, −0.04 power', cost: 65, rarity: 'common', contact: 0.12, power: -0.04,
    synergy: { trait: 'reader', label: 'Reps on Tape' } },

  // Uncommon — bigger, or two things at once.
  { id: 'batting_gloves', name: 'Batting Gloves', description: '+0.16 contact', cost: 110, rarity: 'uncommon', contact: 0.16,
    synergy: { build: 'augmented', label: 'Grip on the Graft' } },
  { id: 'ash_bat', name: 'Ash Bat', description: '+0.20 power', cost: 110, rarity: 'uncommon', power: 0.2,
    synergy: { build: 'human', label: 'Wood in Human Hands' } },
  { id: 'diner_sponsor', name: 'Diner Sponsorship', description: '+$18 every game', cost: 120, rarity: 'uncommon', endorsement: 18 },
  { id: 'leg_kick', name: 'Leg Kick', description: '+0.22 power, −0.08 contact', cost: 115, rarity: 'uncommon', power: 0.22, contact: -0.08,
    synergy: { trait: 'slugger', label: 'All of It, Every Time' } },
  { id: 'walkup_song', name: 'Walk-Up Song', description: '+0.18 clutch', cost: 105, rarity: 'uncommon', clutch: 0.18,
    synergy: { trait: 'showman', label: 'They Came to See This' } },

  // Rare — a real shift in how you hit.
  { id: 'film_study', name: 'Film Study', description: '+0.26 contact', cost: 200, rarity: 'rare', contact: 0.26,
    synergy: { trait: 'reader', label: 'Knows the Whole Book' } },
  { id: 'corked_bat', name: 'Corked Bat', description: '+0.35 power, −0.10 contact', cost: 200, rarity: 'rare', power: 0.35, contact: -0.1,
    synergy: { build: 'machine', label: 'Nobody Checks the Robot' } },
  { id: 'shoe_deal', name: 'Shoe Deal', description: '+$35 every game', cost: 210, rarity: 'rare', endorsement: 35 },
  { id: 'two_strike_approach', name: 'Two-Strike Approach', description: '+0.20 contact, +0.15 clutch', cost: 230, rarity: 'rare', contact: 0.2, clutch: 0.15,
    synergy: { trait: 'grit', label: 'Fights It Off' } },
  { id: 'uppercut', name: 'Uppercut Swing', description: '+0.40 power, −0.15 contact', cost: 215, rarity: 'rare', power: 0.4, contact: -0.15,
    synergy: { build: 'augmented', label: 'Torque It Past the Spec' } },

  // Legendary — build-defining.
  { id: 'ice_water', name: 'Ice Water', description: '+0.40 clutch', cost: 320, rarity: 'legendary', clutch: 0.4,
    synergy: { trait: 'precision', label: 'No Pulse to Raise' } },
  { id: 'the_natural', name: 'The Natural', description: '+0.30 power, +0.15 contact', cost: 360, rarity: 'legendary', power: 0.3, contact: 0.15,
    synergy: { build: 'human', label: 'Born With It' } },
  { id: 'national_ad', name: 'National Ad Campaign', description: '+$70 every game', cost: 340, rarity: 'legendary', endorsement: 70 },

  // Mythic — one each, and they should feel unfair.
  { id: 'the_eye', name: 'The Eye', description: '+0.32 contact, +0.22 clutch', cost: 500, rarity: 'mythic', contact: 0.32, clutch: 0.22,
    synergy: { trait: 'reader', label: 'Sees the Seams' } },
  // ponytail: the cash on this one does NOT double — synergy multiplies the
  // stat lines only, because endorsements are paid off the box score, not at
  // the plate. Pure-endorsement items are left unsynergised for the same
  // reason rather than shipping a doubling the payout never performs.
  { id: 'murderers_row', name: "Murderer's Row", description: '+0.45 power, +0.20 clutch, +$40 a game', cost: 560, rarity: 'mythic', power: 0.45, clutch: 0.2, endorsement: 40,
    synergy: { trait: 'slugger', label: 'Third Through Sixth' } },
];

/** Every item in the run, regardless of who is carrying it. */
export const ownedItems = (run: { equipped: Equipment }): string[] =>
  Object.values(run.equipped);

/** Cash your kit adds to every payout. Endorsements pay from any hands. */
export const endorsementIncome = (owned: readonly string[]): number =>
  owned.reduce((a, id) => a + (CATALOG.find((p) => p.id === id)?.endorsement ?? 0), 0);

/** Draw one rarity by weight. */
function rollRarity(rng: Rng): Rarity {
  const entries = Object.entries(RARITY_WEIGHT) as [Rarity, number][];
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let roll = rng.next() * total;
  for (const [rarity, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return rarity;
  }
  return 'common';
}

/**
 * Offer `count` distinct items the player does not already own.
 *
 * ponytail: rolls a rarity, then takes any unowned item of that rarity,
 * falling back to any unowned item at all. No pity timer, no guaranteed slot.
 * Add those when the run is long enough for a dry streak to matter.
 */
export function shopOffer(owned: readonly string[], rng: Rng, count = 3): PowerUp[] {
  const pool = CATALOG.filter((p) => !owned.includes(p.id));
  const offer: PowerUp[] = [];

  while (offer.length < count && offer.length < pool.length) {
    const rarity = rollRarity(rng);
    const chosen = pool.filter((p) => p.rarity === rarity && !offer.includes(p));
    const fallback = pool.filter((p) => !offer.includes(p));
    offer.push(rng.pick(chosen.length > 0 ? chosen : fallback));
  }
  return offer;
}

// ---------------------------------------------------------------------- run

/** One line of the run's history, for the summary at the end. */
export interface Result {
  era: DivisionId;
  runs: number;
  against: number;
  won: boolean;
  payday: number;
}

/**
 * How much rope the owner gives you before you are fired.
 *
 * The Fusion Concept's coach direction names this directly: Football
 * Manager's board confidence, "miss expectations and you get sacked, then
 * restart elsewhere. The meter is the pressure that makes every game matter."
 * Without it the run is a gauntlet you cannot fail, which is what the note
 * means by "permadeath ends the run".
 */
export const STARTING_PATIENCE = 3;
/**
 * The cap sits ONE above the start, not two. A clean early league banks a
 * single extra point of rope and no more, so "am I at 4 going into the
 * Foundry" is a real question with a real answer, and a good streak still
 * cannot coast.
 */
export const MAX_PATIENCE = 4;

/**
 * What a loss costs, by division: Holdouts 1, Splice 2, Foundry 3.
 *
 * This is the escalation the meter was missing. Before, every loss cost one
 * point anywhere in the run, so the last league — the one the whole climb is
 * pointed at — threatened exactly as much as the first. Now the same bad game
 * is a scratch in encounter 2 and very nearly the run in encounter 8.
 *
 * At the cap of 4, a Foundry loss leaves you on 1 and the next one fires you.
 * Limp into the Foundry on 2 and your first loss there ends it. That is the
 * intended shape: the earlier leagues are where you buy the right to survive
 * a bad night in the last one.
 *
 * ponytail: derived from leagueIndex rather than stored on the division, so
 * there is nothing to keep in step if a fourth league is ever added.
 */
export const lossCost = (leagueIndex: number): number => leagueIndex + 1;

export interface RunState {
  /** Index into LEAGUE_ORDER. */
  leagueIndex: number;
  /** 1-based within the league. */
  match: number;
  money: number;
  /**
   * Who carries what: player id -> item id.
   *
   * This replaced a global `stats: BatterStats` that every batter shared. That
   * bucket is why items felt like nothing — see Equipment in roster.ts.
   */
  equipped: Record<string, string>;
  /** The owner's patience. Hits zero and the run ends early. */
  patience: number;
  history: Result[];
  /** Set when the run ends, either way. */
  over: boolean;
  won: boolean;
  /** True only when the run ended because patience ran out. */
  fired: boolean;
}

/** Rerolling the shop and draft. Rises each time within a single stop. */
export const REROLL_BASE = 25;
export const rerollCost = (timesRerolled: number): number =>
  REROLL_BASE * (timesRerolled + 1);

export function newRun(): RunState {
  return {
    leagueIndex: 0,
    match: 1,
    money: STARTING_MONEY,
    equipped: {},
    patience: STARTING_PATIENCE,
    history: [],
    over: false,
    won: false,
    fired: false,
  };
}

export const currentDivision = (run: RunState): DivisionId => LEAGUE_ORDER[run.leagueIndex]!;
export const currentLeague = currentDivision;

/** 1-based, out of 9. Reads nicely in a HUD. */
export const encounterNumber = (run: RunState): number =>
  run.leagueIndex * MATCHES_PER_LEAGUE + run.match;

/**
 * Buy an item and hand it to a specific player.
 *
 * The playerId is the decision. The same Corked Bat is +0.35 power in most
 * hands and +0.70 in a machine's, and it is dead weight on a hitter whose
 * chemistry you were relying on for contact.
 */
export function buy(run: RunState, item: PowerUp, playerId: string): RunState {
  const owned = ownedItems(run);
  if (owned.includes(item.id)) throw new Error(`already owned: ${item.id}`);
  if (run.money < item.cost) throw new Error(`cannot afford ${item.id}`);
  if (run.equipped[playerId]) throw new Error(`${playerId} already carries an item`);
  if (owned.length >= MAX_ITEMS) throw new Error(`kit is full (${MAX_ITEMS})`);
  return {
    ...run,
    money: run.money - item.cost,
    equipped: { ...run.equipped, [playerId]: item.id },
  };
}

/** Pay for a signing. The roster cap is enforced by the caller that owns it. */
export function sign(run: RunState, signedCount: number): RunState {
  const cost = signCost(signedCount);
  if (run.money < cost) throw new Error('cannot afford the signing');
  return { ...run, money: run.money - cost };
}

/**
 * Fold a finished match into the run: pay out, then advance or end.
 *
 * ⚠️ This comment used to say the opposite — "a batting gauntlet, not a
 * permadeath roguelike, the run ends when the nine are played." That has not
 * been true since patience was added. A loss advances the encounter AND spends
 * the owner's rope, and running out of it ends the run early with `fired`.
 */
export function completeMatch(run: RunState, match: MatchState, box: BoxScore): RunState {
  if (run.over) throw new Error('run already over');

  const won = playerWon(match);
  // Never let a bad game go negative on the bankroll.
  const money = Math.max(
    0,
    run.money +
      payoutTotal(matchPayout(match, box, currentDivision(run), endorsementIncome(ownedItems(run)))),
  );

  // The owner's patience. A win always buys back exactly one, whatever league
  // it came in; a loss costs more the higher you have climbed. The asymmetry
  // is the point — you cannot win your way out of a late collapse at the rate
  // it costs you.
  const patience = Math.max(
    0,
    Math.min(MAX_PATIENCE, run.patience + (won ? 1 : -lossCost(run.leagueIndex))),
  );

  const history: Result[] = [
    ...run.history,
    {
      era: currentDivision(run),
      runs: match.runs,
      against: opponentRuns(match),
      won,
      payday: money - run.money,
    },
  ];

  const base = { ...run, money, patience, history };

  // Fired. This is the permadeath the concept note asks for — the run ends
  // early and the remaining encounters are never played.
  if (patience === 0) return { ...base, over: true, won: false, fired: true };

  const lastOfLeague = run.match >= MATCHES_PER_LEAGUE;
  const lastLeague = run.leagueIndex >= LEAGUE_ORDER.length - 1;

  if (lastOfLeague && lastLeague) return { ...base, over: true, won };
  return lastOfLeague
    ? { ...base, leagueIndex: run.leagueIndex + 1, match: 1 }
    : { ...base, match: run.match + 1 };
}
