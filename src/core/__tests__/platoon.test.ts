/**
 * The platoon split — the most legible fact in baseball, which this game did
 * not have until 2026-08-16.
 *
 * These lock the SHAPE of the rule rather than the exact multipliers, because
 * the multipliers are game-feel knobs on the same shelf as the timing windows
 * and the home run rate. What must not drift is the direction: opposite hands
 * favour the hitter, same hands favour the pitcher, the gap is widest on a
 * breaking ball, and the knuckleball has no split at all.
 */

import { describe, it, expect } from 'vitest';
import { platoonContact, resolveSwing, type Hand, type SwingInput } from '../hit.ts';
import { grade } from '../timing.ts';
import { makeRng } from '../rng.ts';
import { POOL } from '../roster.ts';
import { PITCHERS, scoutingReport } from '../pitcher.ts';
import { ALL_PITCH_TYPES } from '../hitTables.ts';

const ALL_PITCHERS = Object.values(PITCHERS).flat();
const HANDS: readonly Hand[] = ['L', 'R'];

describe('the split runs the right way', () => {
  it('favours the hitter with the platoon advantage', () => {
    for (const pitch of ALL_PITCH_TYPES) {
      if (pitch === 'knuckleball') continue;
      expect(platoonContact('R', 'L', pitch)).toBeGreaterThan(platoonContact('R', 'R', pitch));
      expect(platoonContact('L', 'R', pitch)).toBeGreaterThan(platoonContact('L', 'L', pitch));
    }
  });

  it('is symmetric — neither hand is inherently better', () => {
    for (const pitch of ALL_PITCH_TYPES) {
      expect(platoonContact('R', 'R', pitch)).toBe(platoonContact('L', 'L', pitch));
      expect(platoonContact('R', 'L', pitch)).toBe(platoonContact('L', 'R', pitch));
    }
  });

  it('penalises a same-handed hitter rather than merely failing to help him', () => {
    // A same-side matchup has to be worse than no matchup at all, or the whole
    // system is a bonus for lefty-righty and nothing else.
    expect(platoonContact('R', 'R', 'slider')).toBeLessThan(1);
    expect(platoonContact('R', 'R', 'fastball')).toBeLessThan(1);
  });
});

describe('the breaking ball carries the split', () => {
  it('hurts a same-handed hitter more than the fastball does', () => {
    expect(platoonContact('R', 'R', 'slider')).toBeLessThan(platoonContact('R', 'R', 'fastball'));
    expect(platoonContact('R', 'R', 'curveball')).toBeLessThan(platoonContact('R', 'R', 'fastball'));
  });

  it('helps an opposite-handed hitter more than the fastball does', () => {
    expect(platoonContact('R', 'L', 'slider')).toBeGreaterThan(platoonContact('R', 'L', 'fastball'));
  });

  it('leaves the changeup on the fastball side of the ledger', () => {
    // The changeup is the pitch that beats the platoon advantage in real
    // baseball — it is what a lefty throws to a righty. Treating it as a
    // breaking ball would invert that.
    expect(platoonContact('R', 'R', 'changeup')).toBe(platoonContact('R', 'R', 'fastball'));
  });
});

describe('the knuckleball is exempt, and that is real', () => {
  it('has no split from either box', () => {
    for (const b of HANDS) {
      for (const p of HANDS) expect(platoonContact(b, p, 'knuckleball')).toBe(1.0);
    }
  });

  it('keeps its identity — nobody gets an edge on it, so nobody should swing', () => {
    // Its counterplay is DON'T SWING. A platoon edge would muddy that, and it
    // has no spin for handedness to be relative to anyway.
    expect(platoonContact('L', 'L', 'knuckleball')).toBe(platoonContact('L', 'R', 'knuckleball'));
  });
});

describe('it reaches the swing, which is the only place it matters', () => {
  const swing = (over: Partial<SwingInput>): SwingInput => ({
    offsetMs: 30,
    pitchType: 'slider',
    ...over,
  });

  it('narrows the timing windows on a same-handed slider', () => {
    // +30ms is 'good' at contact 1.0 (window 35) and falls out to 'late' once
    // the same-handed slider shrinks that window to 28.7. That is the whole
    // mechanism: the platoon split is time to decide, not bat behaviour.
    // Positive is LATE — the sign convention is stated once, in timing.ts.
    const neutral = resolveSwing(swing({}), makeRng(7));
    const matched = resolveSwing(swing({ batterHand: 'R', pitcherHand: 'R' }), makeRng(7));
    expect(neutral.timing).toBe('good');
    expect(matched.timing).toBe('late');
  });

  it('reports the multiplier it applied', () => {
    const r = resolveSwing(swing({ batterHand: 'L', pitcherHand: 'R' }), makeRng(7));
    expect(r.platoon).toBe(platoonContact('L', 'R', 'slider'));
  });

  it('applies nothing at all when only one hand is supplied', () => {
    // Half a matchup is not a matchup. Both fields or neither.
    expect(resolveSwing(swing({ batterHand: 'R' }), makeRng(7)).platoon).toBe(1);
    expect(resolveSwing(swing({ pitcherHand: 'R' }), makeRng(7)).platoon).toBe(1);
  });

  it('stacks with the contact stat instead of replacing it', () => {
    // grade() is the shared multiplier, so a 1.35-contact hitter facing a
    // same-handed slider still sees the ball better than a 0.7 does.
    const good = platoonContact('R', 'R', 'slider') * 1.35;
    const poor = platoonContact('R', 'R', 'slider') * 0.7;
    expect(grade(35, good)).toBe('good');
    expect(grade(35, poor)).not.toBe('good');
  });
});

describe('everyone has a hand', () => {
  it('gives every player in the pool a side of the plate', () => {
    for (const p of POOL) expect(HANDS).toContain(p.bats);
  });

  it('gives every pitcher an arm', () => {
    for (const p of ALL_PITCHERS) expect(HANDS).toContain(p.throws);
  });

  it('keeps the pool mixed, so a random opening lineup is not all one hand', () => {
    const lefties = POOL.filter((p) => p.bats === 'L').length;
    expect(lefties).toBeGreaterThan(2);
    expect(lefties).toBeLessThan(POOL.length - 2);
  });

  it('puts a lefty in every division, so a run always meets the matchup', () => {
    // A platoon system the player never runs into is a system that does not
    // exist. One left-handed arm per division guarantees it comes up.
    for (const staff of Object.values(PITCHERS)) {
      expect(staff.some((p) => p.throws === 'L')).toBe(true);
    }
  });

  it('tells the player which arm before the first pitch', () => {
    for (const p of ALL_PITCHERS) {
      expect(scoutingReport(p)).toContain(p.throws === 'L' ? 'LHP' : 'RHP');
    }
  });
});
