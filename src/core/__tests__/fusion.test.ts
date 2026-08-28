/**
 * The two pieces the vertical slice actually asked for: divisions that change
 * the RULES, and one synergy system.
 *
 * THE SETTING IS ONE WORLD — baseball, robotized. Not three eras of time
 * travel; that framing was dropped. What escalates is how automated the
 * league is, and the human-versus-machine axis carries the chemistry.
 */

import { describe, it, expect } from 'vitest';
import { DIVISIONS, DIVISION_ORDER, divisionAt } from '../division.ts';
import {
  POOL,
  CHEMISTRY,
  resolveLineup,
  draftOffer,
  startingLineup,
  reorder,
  chemistryCount,
  playerSynergies,
  doublingItems,
  type Player,
} from '../roster.ts';
import {
  newRun,
  completeMatch,
  rerollCost,
  STARTING_PATIENCE,
  MAX_PATIENCE,
  REROLL_BASE,
  lossCost,
} from '../run.ts';
import { newMatch } from '../inning.ts';
import { resolveSwingSeeded } from '../hit.ts';
import { makeRng } from '../rng.ts';
import type { Outcome } from '../hitTables.ts';

/**
 * Roll a lot of swings in one division and count the outcomes.
 *
 * Sampled across the whole contact window rather than at dead-centre. A
 * perfectly timed swing has strikeout 0.0 in every table — no multiplier can
 * scale zero — so a division's strikeout rule only bites on mistimed swings,
 * which is exactly right and is why this sweeps offsets.
 */
const OFFSETS = [0, 8, -8, 20, -20, 45, -45, 70, -70];

function outcomes(division: keyof typeof DIVISIONS, n = 3000): Record<string, number> {
  const counts: Record<string, number> = {};
  for (let seed = 1; seed <= n; seed++) {
    const r = resolveSwingSeeded(
      {
        offsetMs: OFFSETS[seed % OFFSETS.length]!,
        pitchType: 'fastball',
        divisionRules: DIVISIONS[division].rules,
      },
      seed,
    );
    counts[r.outcome] = (counts[r.outcome] ?? 0) + 1;
  }
  return counts;
}

describe('a division changes the rules, not just the palette', () => {
  const dead = outcomes('holdouts');
  const modern = outcomes('splice');
  const future = outcomes('foundry');

  it('nearly erases the home run among the human holdouts', () => {
    expect(dead.home_run ?? 0).toBeLessThan((modern.home_run ?? 0) / 3);
  });

  it('escalates the home run as the league automates', () => {
    expect(dead.home_run ?? 0).toBeLessThan(modern.home_run ?? 0);
    expect(modern.home_run ?? 0).toBeLessThan(future.home_run ?? 0);
  });

  it('gives the holdouts their triples back', () => {
    expect(dead.triple ?? 0).toBeGreaterThan(modern.triple ?? 0);
  });

  it('makes the augmented division the three-true-outcomes game', () => {
    // More homers AND more strikeouts than the holdouts, fewer singles.
    expect(modern.strikeout ?? 0).toBeGreaterThan(dead.strikeout ?? 0);
    expect(modern.single ?? 0).toBeLessThan(dead.single ?? 0);
  });

  it('never produces an outcome the tables do not contain', () => {
    const legal: Outcome[] = ['strikeout', 'popup', 'ground_out', 'line_out', 'foul', 'single', 'double', 'triple', 'home_run'];
    for (const key of [...Object.keys(dead), ...Object.keys(future)]) {
      expect(legal).toContain(key as Outcome);
    }
  });

  it('speeds the pitching machines up as the league automates', () => {
    expect(DIVISIONS.holdouts.speedMult).toBeLessThan(DIVISIONS.splice.speedMult);
    expect(DIVISIONS.splice.speedMult).toBeLessThan(DIVISIONS.foundry.speedMult);
  });

  it('orders the three divisions and clamps out of range', () => {
    expect(DIVISION_ORDER).toEqual(['holdouts', 'splice', 'foundry']);
    expect(divisionAt(0).id).toBe('holdouts');
    expect(divisionAt(99).id).toBe('holdouts');
  });
});

describe('chemistry — the synergy system', () => {
  const find = (id: string) => POOL.find((p) => p.id === id)!;

  it('reads between neighbours, so batting order is the build', () => {
    const a: Player[] = [find('hu1'), find('ma2')]; // human then machine
    const b: Player[] = [find('ma2'), find('hu1')]; // reversed
    const [first] = resolveLineup(a);
    const [other] = resolveLineup(b);
    expect(first!.stats.power).not.toBe(other!.stats.power);
  });

  it('pays off the human-next-to-machine pairing the setting is built on', () => {
    const solo = resolveLineup([find('hu1')])[0]!;
    const paired = resolveLineup([find('hu1'), find('ma2')])[0]!;
    expect(paired.stats.power).toBeGreaterThan(solo.stats.power);
    expect(paired.chemistry).toContain('Studying the Machine');
  });

  it('lets a pairing be actively bad', () => {
    const clash = resolveLineup([find('ma1'), find('hu2')])[0]!; // machine then human
    expect(clash.chemistry).toContain('Nobody Talks to the Robot');
    expect(clash.stats.contact).toBeLessThan(find('ma1').contact);
  });

  it('wraps, so the last hitter is protected by the leadoff man', () => {
    const lineup = [find('hu1'), find('au1'), find('ma2')];
    const resolved = resolveLineup(lineup);
    // Slot 3 reads against slot 1, not against nothing.
    expect(resolved[2]!.player.id).toBe('ma2');
    expect(resolved).toHaveLength(3);
  });

  it('never drives a stat the engine reads to zero or below', () => {
    for (const a of POOL) {
      for (const b of POOL) {
        const [slot] = resolveLineup([a, b]);
        expect(slot!.stats.power).toBeGreaterThan(0);
        expect(slot!.stats.contact).toBeGreaterThan(0);
        expect(slot!.stats.clutch).toBeGreaterThan(0);
      }
    }
  });

  it('leaves a one-man lineup alone', () => {
    const solo = resolveLineup([find('au1')])[0]!;
    expect(solo.chemistry).toEqual([]);
    expect(solo.stats.power).toBe(find('au1').power);
  });

  it('covers all three builds in the pool, with clashes as well as payoffs', () => {
    for (const b of ['human', 'augmented', 'machine'] as const)
      expect(POOL.some((p) => p.build === b)).toBe(true);
    expect(CHEMISTRY.some((c) => (c.contact ?? 0) < 0 || (c.clutch ?? 0) < 0)).toBe(true);
  });
});

describe('the draft', () => {
  it('never offers someone already signed', () => {
    const signed = startingLineup(makeRng(7));
    for (let seed = 1; seed < 50; seed++) {
      for (const p of draftOffer(signed, makeRng(seed))) {
        expect(signed.map((s) => s.id)).not.toContain(p.id);
      }
    }
  });

  it('offers distinct players', () => {
    const offer = draftOffer([], makeRng(4));
    expect(new Set(offer.map((p) => p.id)).size).toBe(offer.length);
  });

  it('replays identically from the same seed', () => {
    const go = () => draftOffer([], makeRng(21)).map((p) => p.id);
    expect(go()).toEqual(go());
  });

  it('starts you with three distinct players, and not the same three', () => {
    const ids = (seed: number) => startingLineup(makeRng(seed)).map((p) => p.id);
    expect(ids(1).length).toBe(3);
    expect(new Set(ids(1)).size).toBe(3);
    expect(ids(1)).toEqual(ids(1)); // same seed, same open
    // Random means the opening build differs run to run — that is the point.
    const opens = new Set(Array.from({ length: 20 }, (_, i) => ids(i + 1).join()));
    expect(opens.size).toBeGreaterThan(1);
  });
});

describe('reordering — what makes chemistry a decision', () => {
  const find = (id: string) => POOL.find((p) => p.id === id)!;

  it('swaps two slots', () => {
    const l = [find('hu1'), find('au1'), find('ma2')];
    expect(reorder(l, 0, 1).map((p) => p.id)).toEqual(['au1', 'hu1', 'ma2']);
  });

  it('refuses to move off either end rather than throwing', () => {
    const l = [find('hu1'), find('au1')];
    expect(reorder(l, 0, -1).map((p) => p.id)).toEqual(['hu1', 'au1']);
    expect(reorder(l, 1, 1).map((p) => p.id)).toEqual(['hu1', 'au1']);
  });

  it('changes WHO gets the chemistry, which is the point', () => {
    // The TOTAL link count is not the right measure. With one of each build
    // in a wrapped three-man order, every ordered build-pair has a rule, so
    // every arrangement scores the same three links whichever way round it
    // goes — that is structural, not a bug. What reordering actually changes
    // is which hitter collects which bonus, and therefore the stats.
    const [x, y, z] = [find('ma1'), find('hu2'), find('au4')];
    const shape = (l: Player[]) =>
      JSON.stringify(resolveLineup(l).map((s) => [s.player.id, s.stats]));

    const arrangements = [
      [x, y, z],
      [x, z, y],
      [y, x, z],
      [y, z, x],
      [z, x, y],
      [z, y, x],
    ].map(shape);
    expect(new Set(arrangements).size).toBeGreaterThan(1);
  });

  it('does change the link total once traits are in play', () => {
    // Trait rules are sparse and asymmetric, unlike the build rules, so they
    // are where the raw count moves.
    const l = [find('hu2'), find('hu5'), find('au2'), find('au4')];
    const counts = new Set([chemistryCount(l), chemistryCount(reorder(l, 0, 1))]);
    expect(counts.size).toBeGreaterThan(1);
  });

  it('never loses or duplicates a player', () => {
    const l = [find('hu1'), find('au1'), find('ma2'), find('hu3')];
    const moved = reorder(reorder(l, 3, -1), 0, 1);
    expect(new Set(moved.map((p) => p.id)).size).toBe(4);
    expect(moved).toHaveLength(4);
  });
});

describe('the owner runs out of patience', () => {
  it('ends the run early when patience hits zero', () => {
    let r = newRun();
    const loss = { ...newMatch(1, [5]), runs: 0, over: true };
    const box = { hits: 0, atBats: 3, homeRuns: 0, rbis: 0 };
    for (let i = 0; i < STARTING_PATIENCE; i++) {
      expect(r.over).toBe(false);
      r = completeMatch(r, loss, box);
    }
    expect(r.over).toBe(true);
    expect(r.fired).toBe(true);
    expect(r.history).toHaveLength(STARTING_PATIENCE);
  });

  it('buys patience back with a win, but never past the cap', () => {
    let r = newRun();
    const win = { ...newMatch(1, [0]), runs: 4, over: true };
    const box = { hits: 2, atBats: 3, homeRuns: 1, rbis: 2 };
    for (let i = 0; i < 6; i++) if (!r.over) r = completeMatch(r, win, box);
    expect(r.patience).toBeLessThanOrEqual(MAX_PATIENCE);
    expect(r.fired).toBe(false);
  });

  it('costs more to lose the deeper you are', () => {
    expect(lossCost(0)).toBe(1);
    expect(lossCost(1)).toBe(2);
    expect(lossCost(2)).toBe(3);
  });

  it('cannot bank more than one point of rope above the start', () => {
    // The whole reason the old meter never bit: the cap sat two above the
    // start, so three wins bought enough slack to absorb the rest of the run.
    expect(MAX_PATIENCE - STARTING_PATIENCE).toBe(1);
  });

  it('fires you for one Foundry loss if you dropped the game before it', () => {
    // The escalation, end to end and through the real advance path: win five
    // so patience is at the cap, drop the last of the Splice (costs 2, leaves
    // 2), then lose the Foundry opener (costs 3) and the run is over.
    let r = newRun();
    const win = { ...newMatch(1, [0]), runs: 4, over: true };
    const loss = { ...newMatch(1, [5]), runs: 0, over: true };
    const box = { hits: 2, atBats: 3, homeRuns: 1, rbis: 2 };

    for (let i = 0; i < 5; i++) r = completeMatch(r, win, box);
    expect(r.patience).toBe(MAX_PATIENCE);

    r = completeMatch(r, loss, box); // last of the Splice, costs 2
    expect(r.leagueIndex).toBe(2);
    expect(r.patience).toBe(2);
    expect(r.fired).toBe(false);

    r = completeMatch(r, loss, box); // first of the Foundry, costs 3
    expect(r.patience).toBe(0);
    expect(r.fired).toBe(true);
    expect(r.over).toBe(true);
    expect(r.history).toHaveLength(7);
  });

  it('still survives a Foundry loss if you banked the fourth point', () => {
    // The other side of the same rule — the fourth dot is what the earlier
    // leagues are for, and it has to actually buy something.
    let r = newRun();
    const win = { ...newMatch(1, [0]), runs: 4, over: true };
    const loss = { ...newMatch(1, [5]), runs: 0, over: true };
    const box = { hits: 2, atBats: 3, homeRuns: 1, rbis: 2 };

    for (let i = 0; i < 6; i++) r = completeMatch(r, win, box);
    expect(r.leagueIndex).toBe(2);
    expect(r.patience).toBe(MAX_PATIENCE);

    r = completeMatch(r, loss, box);
    expect(r.patience).toBe(1);
    expect(r.fired).toBe(false);
  });

  it('prices a reroll higher each time you use it', () => {
    expect(rerollCost(1)).toBeGreaterThan(rerollCost(0));
    expect(rerollCost(0)).toBe(REROLL_BASE);
  });

  it('records every game played for the summary', () => {
    let r = newRun();
    const win = { ...newMatch(1, [1]), runs: 3, over: true };
    r = completeMatch(r, win, { hits: 1, atBats: 3, homeRuns: 0, rbis: 1 });
    expect(r.history[0]).toMatchObject({ runs: 3, against: 1, won: true });
    expect(r.history[0]!.payday).toBeGreaterThan(0);
  });
});

describe('no build is chemistry-dead', () => {
  it('gives every build at least one outgoing rule', () => {
    // Without an outgoing rule a build contributes nothing when it bats ahead
    // of someone, which silently makes reordering pointless for that third of
    // the pool. This is the test that caught exactly that for 'augmented'.
    for (const b of ['human', 'augmented', 'machine'] as const) {
      const ahead = POOL.find((p) => p.build === b)!;
      const links = POOL.filter((p) => p.build !== b).some(
        (behind) => resolveLineup([ahead, behind])[0]!.chemistry.length > 0,
      );
      expect(links).toBe(true);
    }
  });
});

describe('explaining a player — what the hover card reads from', () => {
  const find = (id: string) => POOL.find((p) => p.id === id)!;

  it('gives every player a bio', () => {
    expect(POOL.every((p) => p.bio.length > 20)).toBe(true);
    expect(new Set(POOL.map((p) => p.bio)).size).toBe(POOL.length);
  });

  it('reports a rule as GAINS for the man it actually pays', () => {
    // 'Studying the Machine' is applies(human, machine) and resolveLineup
    // credits the FIRST argument — so the human gains it, and the machine
    // merely has to be batting after him. Getting this backwards would teach
    // the batting order inside out.
    const human = find('hu1');
    const note = playerSynergies(human).find((n) => n.label === 'Studying the Machine')!;
    expect(note.direction).toBe('gains');
    expect(note.needs).toContain('after him');

    const machine = find('ma2');
    const mirror = playerSynergies(machine).find((n) => n.label === 'Studying the Machine')!;
    expect(mirror.direction).toBe('gives');
    expect(mirror.needs).toContain('before him');
  });

  it('matches what resolveLineup actually computes', () => {
    // The card claims Cap gains power batting in front of a machine. Prove it
    // against the engine rather than against the rule table.
    const human = find('hu1');
    const machine = find('ma2');
    const note = playerSynergies(human).find((n) => n.label === 'Studying the Machine')!;
    const paired = resolveLineup([human, machine])[0]!;
    expect(paired.chemistry).toContain('Studying the Machine');
    expect(paired.stats.power).toBeGreaterThan(human.power);
    expect(note.effect).toContain('pow');
  });

  it('names the attribute the rule actually keys on, not a coincidence', () => {
    // Table Setter keys on the GRIT TRAIT. Both grit players happen to be
    // human, so describing the matched set by its first shared attribute
    // called it "a human" — true today, and a lie the moment a gritty machine
    // is added. It must only name a category it covers completely.
    const slugger = find('ma2');
    const note = playerSynergies(slugger).find((n) => n.label === 'Table Setter')!;
    expect(note.needs).toContain('grit');
    expect(note.needs).not.toContain('human');
  });

  it('uses the right article', () => {
    const notes = POOL.flatMap(playerSynergies);
    expect(notes.some((n) => n.needs.includes('an augmented'))).toBe(true);
    expect(notes.every((n) => !n.needs.includes('a augmented'))).toBe(true);
  });

  it('flags a clash as bad so the card can colour it', () => {
    // 'Nobody Talks to the Robot' is all downside.
    const machine = find('ma1');
    const clash = playerSynergies(machine).find((n) => n.label === 'Nobody Talks to the Robot')!;
    expect(clash.good).toBe(false);
  });

  it('lists only items that really double, per the engine predicate', () => {
    for (const p of POOL) {
      for (const item of doublingItems(p)) {
        const solo = resolveLineup([p], { [p.id]: item.id })[0]!;
        expect(solo.item!.synergised).toBe(true);
      }
    }
  });
});
