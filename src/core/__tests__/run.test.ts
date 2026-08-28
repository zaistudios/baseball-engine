import { describe, it, expect } from 'vitest';
import {
  newRun,
  buy,
  completeMatch,
  shopOffer,
  matchPayout,
  payoutTotal,
  encounterNumber,
  currentLeague,
  CATALOG,
  MATCHES_PER_LEAGUE,
  LEAGUE_ORDER,
  STARTING_MONEY,
  MAX_ITEMS,
  ownedItems,
  sign,
  signCost,
  type RunState,
} from '../run.ts';
import { POOL, resolveLineup } from '../roster.ts';
import { makeRng } from '../rng.ts';
import type { DivisionId } from '../division.ts';
import { newMatch, type MatchState } from '../inning.ts';

/** A game you did nothing in — isolates the result half of the payout. */
const EMPTY_BOX = { hits: 0, atBats: 0, homeRuns: 0, rbis: 0 };

/** A finished match: you scored `runs`, they scored `against`. */
const matchScoring = (runs: number, against = 0): MatchState => ({
  ...newMatch(1, [against]),
  runs,
  over: true,
});

describe('the run is nine encounters, not fifteen', () => {
  it('runs three eras of three and then ends', () => {
    let run = newRun();
    const seen: string[] = [];

    for (let i = 0; i < 9; i++) {
      expect(run.over).toBe(false);
      expect(encounterNumber(run)).toBe(i + 1);
      seen.push(currentLeague(run));
      run = completeMatch(run, matchScoring(5), EMPTY_BOX);
    }

    expect(run.over).toBe(true);
    expect(seen).toEqual([
      'holdouts', 'holdouts', 'holdouts',
      'splice', 'splice', 'splice',
      'foundry', 'foundry', 'foundry',
    ]);
    expect(LEAGUE_ORDER.length * MATCHES_PER_LEAGUE).toBe(9);
  });

  it('refuses another match once the run is done', () => {
    let run = newRun();
    for (let i = 0; i < 9; i++) run = completeMatch(run, matchScoring(5), EMPTY_BOX);
    expect(() => completeMatch(run, matchScoring(5), EMPTY_BOX)).toThrow(/already over/);
  });

  it('rolls into the next era only after the third match', () => {
    let run = newRun();
    run = completeMatch(run, matchScoring(5), EMPTY_BOX);
    expect(currentLeague(run)).toBe('holdouts');
    expect(run.match).toBe(2);

    run = completeMatch(run, matchScoring(5), EMPTY_BOX);
    run = completeMatch(run, matchScoring(5), EMPTY_BOX);
    expect(currentLeague(run)).toBe('splice');
    expect(run.match).toBe(1);
  });
});

describe('the game result is what pays, not the at-bats', () => {
  const pay = (
    m: MatchState,
    box = EMPTY_BOX,
    league: DivisionId = 'holdouts',
    endorsements = 0,
  ) => payoutTotal(matchPayout(m, box, league, endorsements));

  it('pays more for winning than losing', () => {
    expect(pay(matchScoring(3, 1))).toBeGreaterThan(pay(matchScoring(1, 3)));
  });

  it('makes each game a different payday', () => {
    // The whole point of moving off the at-bat drip: identical batting lines
    // in different games must not pay the same.
    const line = { hits: 2, atBats: 3, homeRuns: 1, rbis: 2 };
    const blowout = pay(matchScoring(7, 0), line);
    const squeaker = pay(matchScoring(2, 1), line);
    const beaten = pay(matchScoring(1, 4), line);
    expect(new Set([blowout, squeaker, beaten]).size).toBe(3);
    expect(blowout).toBeGreaterThan(squeaker);
    expect(squeaker).toBeGreaterThan(beaten);
  });

  it('pays a shutout and a comeback differently', () => {
    expect(pay(matchScoring(3, 0))).not.toBe(pay(matchScoring(3, 1)));
  });

  it('treats a tie as a loss — you have to beat them', () => {
    const tie = matchPayout(matchScoring(2, 2), EMPTY_BOX);
    expect(tie[0]!.label).toBe('Loss');
  });

  it('pays the box score, homers most', () => {
    const homer = pay(matchScoring(2, 1), { hits: 1, atBats: 3, homeRuns: 1, rbis: 1 });
    const single = pay(matchScoring(2, 1), { hits: 1, atBats: 3, homeRuns: 0, rbis: 1 });
    expect(homer).toBeGreaterThan(single);
  });

  it('docks a hitless game', () => {
    const lines = matchPayout(matchScoring(1, 2), { hits: 0, atBats: 3, homeRuns: 0, rbis: 0 });
    expect(lines.some((l) => l.amount < 0)).toBe(true);
  });

  it('pays more for the same game in a later era', () => {
    const m = matchScoring(3, 1);
    const box = { hits: 2, atBats: 3, homeRuns: 1, rbis: 2 };
    expect(pay(m, box, 'foundry')).toBeGreaterThan(pay(m, box, 'splice'));
    expect(pay(m, box, 'splice')).toBeGreaterThan(pay(m, box, 'holdouts'));
  });

  it('never drives the bankroll below zero', () => {
    const broke: RunState = { ...newRun(), money: 0 };
    const awful = completeMatch(broke, matchScoring(0, 9), { hits: 0, atBats: 3, homeRuns: 0, rbis: 0 });
    expect(awful.money).toBeGreaterThanOrEqual(0);
  });

  it('leaves the shop a real decision at the new prices', () => {
    // The rebalance target: a typical dead-ball win buys about one common, and
    // does NOT buy the shelf. This is the test that fails if payouts creep.
    const typical = pay(matchScoring(2, 1), { hits: 1, atBats: 3, homeRuns: 0, rbis: 1 });
    const cheapest = Math.min(...CATALOG.map((p) => p.cost));
    const dearest = Math.max(...CATALOG.map((p) => p.cost));
    expect(typical).toBeGreaterThan(cheapest);
    expect(typical).toBeLessThan(dearest);
  });

  it('pays endorsements on top, win or lose', () => {
    const withKit = pay(matchScoring(0, 4), EMPTY_BOX, 'holdouts', 35);
    const without = pay(matchScoring(0, 4), EMPTY_BOX, 'holdouts', 0);
    expect(withKit - without).toBe(35);
  });

  it('itemises rather than handing over one number', () => {
    const lines = matchPayout(matchScoring(4, 0), { hits: 2, atBats: 3, homeRuns: 1, rbis: 3 });
    expect(lines.length).toBeGreaterThan(3);
    for (const l of lines) expect(l.label).toBeTruthy();
  });
});

describe('the shop', () => {
  it('offers distinct items', () => {
    const offer = shopOffer([], makeRng(11));
    expect(offer).toHaveLength(3);
    expect(new Set(offer.map((o) => o.id)).size).toBe(3);
  });

  it('never offers something already owned', () => {
    const owned = CATALOG.slice(0, 5).map((p) => p.id);
    for (let seed = 1; seed < 40; seed++) {
      for (const item of shopOffer(owned, makeRng(seed))) {
        expect(owned).not.toContain(item.id);
      }
    }
  });

  it('runs dry gracefully when almost everything is owned', () => {
    const owned = CATALOG.slice(1).map((p) => p.id);
    expect(shopOffer(owned, makeRng(2))).toHaveLength(1);
  });

  it('favours common over mythic across many draws', () => {
    const counts: Record<string, number> = {};
    const rng = makeRng(7);
    for (let i = 0; i < 300; i++) {
      for (const item of shopOffer([], rng)) counts[item.rarity] = (counts[item.rarity] ?? 0) + 1;
    }
    expect(counts.common ?? 0).toBeGreaterThan(counts.mythic ?? 0);
  });

  it('replays identically from the same seed', () => {
    const draw = () => shopOffer([], makeRng(99)).map((p) => p.id);
    expect(draw()).toEqual(draw());
  });
});

describe('buying', () => {
  const donut = CATALOG.find((p) => p.id === 'weighted_donut')!;

  it('spends money and hands the item to the player you named', () => {
    const run = buy(newRun(), donut, 'hu1');
    expect(run.money).toBe(STARTING_MONEY - donut.cost);
    expect(run.equipped).toEqual({ hu1: 'weighted_donut' });
    expect(ownedItems(run)).toEqual(['weighted_donut']);
  });

  it('applies a downside as well as an upside, to the holder only', () => {
    const corked = CATALOG.find((p) => p.id === 'corked_bat')!;
    // A rare costs more than the starting float now — that is the rebalance.
    const holder = POOL.find((p) => p.id === 'hu2')!;
    const run = buy({ ...newRun(), money: corked.cost }, corked, holder.id);
    const [slot] = resolveLineup([holder], run.equipped);
    expect(slot!.stats.power).toBeGreaterThan(holder.power);
    expect(slot!.stats.contact).toBeLessThan(holder.contact);
    // The man batting next to him gets nothing — that is the whole change.
    const bare = resolveLineup([POOL.find((p) => p.id === 'hu4')!], run.equipped)[0]!;
    expect(bare.stats.power).toBe(POOL.find((p) => p.id === 'hu4')!.power);
  });

  it('doubles an item in the right hands, and only then', () => {
    // Corked Bat reads machine. Same item, same cost, twice the power.
    const corked = CATALOG.find((p) => p.id === 'corked_bat')!;
    const machine = POOL.find((p) => p.build === 'machine')!;
    const human = POOL.find((p) => p.build === 'human')!;
    const gain = (p: (typeof POOL)[number]) =>
      resolveLineup([p], { [p.id]: corked.id })[0]!.stats.power - p.power;
    expect(gain(machine)).toBeCloseTo(corked.power! * 2);
    expect(gain(human)).toBeCloseTo(corked.power!);
    expect(resolveLineup([machine], { [machine.id]: corked.id })[0]!.chemistry).toContain(
      corked.synergy!.label,
    );
  });

  it('refuses a second item on the same player, and a seventh overall', () => {
    let run = newRun();
    run = buy({ ...run, money: 9999 }, donut, 'hu1');
    expect(() => buy(run, CATALOG.find((p) => p.id === 'pine_tar')!, 'hu1')).toThrow(
      /already carries/,
    );
    // Fill the kit to the cap, then try one more.
    const ids = CATALOG.slice(0, MAX_ITEMS + 1).map((p) => p.id);
    let full: RunState = { ...newRun(), money: 99999 };
    ids.slice(0, MAX_ITEMS).forEach((id, i) => {
      full = buy(full, CATALOG.find((p) => p.id === id)!, `slot${i}`);
    });
    expect(ownedItems(full).length).toBe(MAX_ITEMS);
    expect(() => buy(full, CATALOG.find((p) => p.id === ids[MAX_ITEMS])!, 'spare')).toThrow(
      /kit is full/,
    );
  });

  it('charges more for each signing than the last', () => {
    expect(signCost(3)).toBeLessThan(signCost(8));
    expect(sign({ ...newRun(), money: 500 }, 3).money).toBe(500 - signCost(3));
    expect(() => sign({ ...newRun(), money: 0 }, 3)).toThrow(/afford/);
  });

  it('prices the ladder so rarity costs more', () => {
    const cheapest = (r: string) =>
      Math.min(...CATALOG.filter((p) => p.rarity === r).map((p) => p.cost));
    expect(cheapest('common')).toBeLessThan(cheapest('uncommon'));
    expect(cheapest('uncommon')).toBeLessThan(cheapest('rare'));
    expect(cheapest('rare')).toBeLessThan(cheapest('legendary'));
    expect(cheapest('legendary')).toBeLessThan(cheapest('mythic'));
  });

  it('cannot buy anything but a common on the starting float', () => {
    const affordable = CATALOG.filter((p) => p.cost <= STARTING_MONEY);
    expect(affordable.length).toBeGreaterThan(0);
    expect(affordable.every((p) => p.rarity === 'common')).toBe(true);
  });

  it('offers an economy build, not just bigger numbers', () => {
    expect(CATALOG.filter((p) => p.endorsement).length).toBeGreaterThanOrEqual(4);
    expect(CATALOG.length).toBeGreaterThanOrEqual(20);
  });

  it('refuses what cannot be afforded or is already owned', () => {
    const broke: RunState = { ...newRun(), money: 0 };
    expect(() => buy(broke, donut, 'hu1')).toThrow(/afford/);
    expect(() => buy(buy(newRun(), donut, 'hu1'), donut, 'hu2')).toThrow(/already owned/);
  });

  it('carries the kit and money across a match', () => {
    let run = buy(newRun(), donut, 'hu1');
    run = completeMatch(run, matchScoring(5), { hits: 2, atBats: 4, homeRuns: 0, rbis: 1 });
    expect(run.equipped).toEqual({ hu1: 'weighted_donut' });
    expect(run.money).toBeGreaterThan(STARTING_MONEY - donut.cost);
  });
});
