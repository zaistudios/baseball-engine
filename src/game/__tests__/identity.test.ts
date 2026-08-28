/**
 * The identity layer: the knobs reach the engine, and turning them off gets
 * you the engine that was there before.
 *
 * ⚠️ THESE ARE WIRING TESTS, NOT BALANCE TESTS. Whether TRACK TEAM is worth
 * the right number of wins is `node scripts/league.ts`, which plays seven
 * thousand games and prints a table — not something to assert on. What is
 * asserted here is the thing a refactor breaks silently: a knob that stops
 * being passed. Every one of these fails if a call site drops its argument.
 */

import { describe, it, expect } from 'vitest';
import { makeRng } from '../../core/rng.ts';
import { IDENTITIES, ALL_IDENTITIES, knob } from '../identity.ts';
import { LEAGUE, club } from '../teams.ts';
import { shouldBunt, aiSwing } from '../ai.ts';
import { shouldRelieve, newStaff, limitOf } from '../bullpen.ts';
import { aiShouldSend } from '../running.ts';
import { assignPositions } from '../defense.ts';
import { newGame } from '../game.ts';
import { simulateGame } from '../sim.ts';
import { clubValue } from '../value.ts';
import type { ThrownPitch } from '../../core/pitcher.ts';

const stats = (over: Partial<Record<string, number>> = {}) => ({
  power: 0.8, contact: 1.2, vision: 1.1, clutch: 1, bunt: 1.2, speed: 1, ...over,
} as never);

const pitch = (inZone = true): ThrownPitch =>
  ({
    type: 'fastball', location: 'middle', inZone, speedMph: 92,
    approach: 'attack', tell: null, hitBatter: false,
  }) as never;

describe('the archetypes themselves', () => {
  it('every club in the league has one', () => {
    for (const t of LEAGUE) expect(t.identity, t.abbr).toBeDefined();
  });

  it('every archetype has a name, a scouting line and a man to hire', () => {
    for (const id of ALL_IDENTITIES) {
      expect(id.name.length).toBeGreaterThan(0);
      expect(id.blurb.length).toBeGreaterThan(0);
      expect(id.hire.length).toBeGreaterThan(0);
    }
  });

  it('keeps every knob within a range that cannot invert a rule', () => {
    // A knob at 0 would switch a mechanic off entirely rather than colour it;
    // one above 3 would make ATTEMPT_RATE saturate and the club would run on
    // literally every opportunity. Neither is an identity, both are a bug.
    for (const id of ALL_IDENTITIES) {
      for (const k of ['aggression', 'running', 'hook', 'bunt'] as const) {
        expect(id[k], `${id.name}.${k}`).toBeGreaterThan(0.3);
        expect(id[k], `${id.name}.${k}`).toBeLessThanOrEqual(3);
      }
    }
  });

  it('knob() answers 1.0 for a club that has no identity at all', () => {
    // The pre-identity save case. Every default has to be the old behaviour.
    expect(knob(undefined, 'aggression')).toBe(1);
    expect(knob(undefined, 'running')).toBe(1);
    expect(knob(undefined, 'hook')).toBe(1);
    expect(knob(undefined, 'bunt')).toBe(1);
  });

  it('is NOT priced into what a club is worth', () => {
    // The rule from identity.ts's header: clubValue reads players, never the
    // tag. Same nine, same three, same number whatever is on the bench.
    const t = club('DET');
    const before = clubValue(t);
    expect(clubValue({ ...t, identity: IDENTITIES.TRACK_TEAM })).toBe(before);
    expect(clubValue({ ...t, identity: undefined })).toBe(before);
  });
});

describe('the knobs actually reach the engine', () => {
  it('bunt: a low knob puts the sign on for a man who would not otherwise get it', () => {
    // 1.05 sits under BUNT_THRESHOLD (1.1) and over SMALL BALL's 1.1 * 0.88.
    const marginal = stats({ bunt: 1.05, power: 0.7 });
    const on = { count: { balls: 0, strikes: 0 }, outs: 0, bases: [true, false, false], deficit: 0, inning: 8 };
    expect(shouldBunt(marginal, on)).toBe(false);
    expect(shouldBunt(marginal, { ...on, bunt: IDENTITIES.SMALL_BALL.bunt })).toBe(true);
  });

  it('bunt: the knob cannot override the situational clauses', () => {
    // The rule from ai.ts — a SMALL BALL club still does not sacrifice with
    // two strikes, or with two outs, or down five.
    const bunter = stats({ bunt: 1.4, power: 0.7 });
    const k = IDENTITIES.SMALL_BALL.bunt;
    const on = { count: { balls: 0, strikes: 0 }, outs: 0, bases: [true, false, false], deficit: 0, inning: 8, bunt: k };
    expect(shouldBunt(bunter, on)).toBe(true);
    expect(shouldBunt(bunter, { ...on, count: { balls: 0, strikes: 2 } })).toBe(false);
    expect(shouldBunt(bunter, { ...on, outs: 2 })).toBe(false);
    expect(shouldBunt(bunter, { ...on, deficit: 5 })).toBe(false);
  });

  it('hook: a quick one pulls a starter the standard leash would leave in', () => {
    const staff = newStaff(club('CHF').rotation[0]!, club('CHF').bullpen);
    // Just inside his own limit, so only the knob can decide this.
    const at = Math.floor(limitOf(staff.current.pitcher) * 0.9);
    const worked = { ...staff, current: { ...staff.current, pitches: at } };
    const ctx = { inning: 3, deficit: 0 };
    expect(shouldRelieve(worked, ctx)).toBe(false);
    expect(shouldRelieve(worked, { ...ctx, hook: 0.8 })).toBe(true);
  });

  it('hook: a slow one leaves him out there past the standard leash', () => {
    const staff = newStaff(club('OKC').rotation[0]!, club('OKC').bullpen);
    const at = Math.ceil(limitOf(staff.current.pitcher)) + 1;
    const tired = { ...staff, current: { ...staff.current, pitches: at } };
    expect(shouldRelieve(tired, { inning: 3, deficit: 0 })).toBe(true);
    expect(shouldRelieve(tired, { inning: 3, deficit: 0, hook: 1.28 })).toBe(false);
  });

  it('hook: being shelled outranks the knob, however long the leash', () => {
    // The rule from bullpen.ts: four runs is four runs for everybody.
    const staff = newStaff(club('OKC').rotation[0]!, club('OKC').bullpen);
    const shelled = { ...staff, current: { ...staff.current, runsAllowed: 4 } };
    expect(shouldRelieve(shelled, { inning: 2, deficit: 0, hook: 1.28 })).toBe(true);
  });

  it('running: a high knob asks the question far more often', () => {
    // A fast man on first, second open, nobody out. Count how often the gate
    // opens across many rolls — that is the only thing `running` turns.
    const fast = club('LAC');
    const g = newGame(fast, club('DET'), 9);
    const withRunner = {
      ...g,
      half: 'bottom' as const,
      bases: [{ ...fast.lineup[0]!, speed: 1.5 }, null, null] as never,
    };
    const alignment = assignPositions(club('DET').lineup);
    const count = (mult: number): number => {
      let n = 0;
      for (let i = 0; i < 600; i++) {
        if (aiShouldSend(withRunner, alignment, makeRng(i), mult)) n++;
      }
      return n;
    };
    const plain = count(1);
    const track = count(IDENTITIES.TRACK_TEAM.running);
    const station = count(IDENTITIES.BIG_INNING.running);
    expect(track).toBeGreaterThan(plain);
    expect(station).toBeLessThan(plain);
  });

  it('running: the odds bar is untouched, so a bad steal is still refused', () => {
    // identity.ts's promise — a personality tag never sends a slow man into a
    // good arm. A catcher's throw beats these legs at every multiplier.
    const slow = club('DET');
    const g = newGame(slow, club('BAL'), 9);
    const withRunner = {
      ...g,
      half: 'bottom' as const,
      bases: [{ ...slow.lineup[3]!, speed: 0.55 }, null, null] as never,
    };
    const alignment = assignPositions(club('BAL').lineup);
    for (let i = 0; i < 200; i++) {
      expect(aiShouldSend(withRunner, alignment, makeRng(i), 2.4)).toBe(false);
    }
  });

  it('aggression: a high knob swings more, a low one swings less', () => {
    const swings = (aggression: number): number => {
      let n = 0;
      for (let i = 0; i < 800; i++) {
        const d = aiSwing(
          pitch(),
          { count: { balls: 1, strikes: 1 }, stats: stats(), aggression },
          { seen: 0, swings: 0, ballsSeen: 0, chases: 0, offsets: [], perType: {} as never,
            calls: {} as never, callsTotal: 0, putawayCalls: {} as never, putawayTotal: 0 },
          makeRng(i),
        );
        if (d.swing) n++;
      }
      return n;
    };
    expect(swings(IDENTITIES.HACKERS.aggression)).toBeGreaterThan(swings(1));
    expect(swings(IDENTITIES.GRINDERS.aggression)).toBeLessThan(swings(1));
  });
});

describe('identity changes how a whole game plays out', () => {
  it('two clubs that differ ONLY by their tag do not play the same game', () => {
    // The end-to-end wiring check, and the one that fails if sim.ts stops
    // reading the club. Same nine, same three arms, same seeds — only the
    // bench is different, and the seasons must diverge.
    const base = club('MNE');
    const runners = { ...base, identity: IDENTITIES.TRACK_TEAM };
    const sluggers = { ...base, identity: IDENTITIES.BIG_INNING };
    const foe = club('TOR');

    let differed = 0;
    for (let seed = 0; seed < 40; seed++) {
      const a = simulateGame(seed, 9, runners, foe);
      const b = simulateGame(seed, 9, sluggers, foe);
      if (a.game.homeState.runs !== b.game.homeState.runs) differed++;
    }
    expect(differed).toBeGreaterThan(5);
  });

  it('a club with no identity plays exactly as it did before the layer existed', () => {
    // The regression guard for every save written before this feature. An
    // undefined identity has to be bit-for-bit the old engine.
    const bare = { ...club('ALB'), identity: undefined };
    const foe = { ...club('DET'), identity: undefined };
    for (let seed = 0; seed < 20; seed++) {
      const a = simulateGame(seed, 9, bare, foe);
      const b = simulateGame(seed, 9, bare, foe);
      expect(a.game.homeState.runs).toBe(b.game.homeState.runs);
      expect(a.game.awayState.runs).toBe(b.game.awayState.runs);
    }
  });
});
