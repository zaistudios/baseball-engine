import { describe, it, expect } from 'vitest';
import {
  newMatch,
  applyAtBat,
  recordAtBat,
  occupied,
  runnerMoves,
  scorersFrom,
  EMPTY_BASES,
  ANON,
  SAC_FLY_MIN_EV,
  EXTRA_BASE_SPEED,
  type Bases,
  type Runner,
  type MatchState,
} from '../inning.ts';
import type { AtBatResult } from '../atBat.ts';
import type { Outcome } from '../hitTables.ts';
import type { HitResult } from '../hit.ts';

/**
 * A finished at-bat carrying one outcome.
 *
 * `exitVelocity` used to be hardcoded 0 because inning.ts only read `outcome`.
 * It reads exit velocity now — that is how a sacrifice fly is told from a
 * popup — so it is a parameter, and it defaults BELOW SAC_FLY_MIN_EV so every
 * pre-existing test keeps meaning exactly what it meant.
 */
const hit = (outcome: Outcome, exitVelocity = 0): HitResult => ({
  outcome,
  timing: 'perfect',
  pitchType: 'fastball',
  isOut: false,
  isHit: false,
  exitVelocity,
  launchAngle: 20,
  direction: 0,
  clutchApplied: false,
  platoon: 1,
  stance: 'normal' as const,
});

const inPlay = (outcome: Outcome, exitVelocity = 0): AtBatResult => ({
  kind: 'in_play',
  hit: hit(outcome, exitVelocity),
});

const K: AtBatResult = { kind: 'strikeout' };
const BB: AtBatResult = { kind: 'walk' };

const play = (state: MatchState, ...results: AtBatResult[]): MatchState =>
  results.reduce((s, r) => recordAtBat(s, r), state);

describe('outs', () => {
  it('rolls the inning on the third out and clears the bases', () => {
    const s = play(newMatch(), inPlay('single'), K, K, K);
    expect(s.inning).toBe(2);
    expect(s.outs).toBe(0);
    expect(occupied(s.bases)).toEqual([false, false, false]);
  });

  it('keeps runs across the inning change', () => {
    const s = play(newMatch(), inPlay('home_run'), K, K, K);
    expect(s.runs).toBe(1);
    expect(s.inning).toBe(2);
  });

  it('ends the match after the last inning, and refuses another at-bat', () => {
    let s = newMatch(2);
    s = play(s, K, K, K, K, K);
    expect(s.over).toBe(false);
    s = recordAtBat(s, K);
    expect(s.over).toBe(true);
    expect(() => recordAtBat(s, K)).toThrow(/already over/);
  });

  it('does not score a runner from third on a ball that had nothing on it', () => {
    // ⚠️ REPLACED 2026-08-16. This used to read "does not score a runner from
    // third on a fly out — ponytail: no sacrifice fly", and it was the rule's
    // tripwire. The sacrifice fly now exists, so what is left to assert is the
    // half that has not changed: a fly that was not hit hard enough is still
    // just an out. See the SAC_FLY block below for the other half.
    const s = play(newMatch(), inPlay('triple'), inPlay('popup', SAC_FLY_MIN_EV - 1));
    expect(s.runs).toBe(0);
    expect(occupied(s.bases)).toEqual([false, false, true]);
  });
});

describe('the sacrifice fly', () => {
  /** A man on third, nobody out. The situation the rule exists for. */
  const onThird = () => play(newMatch(), inPlay('triple'));

  it('scores him on a fly hit deep enough', () => {
    const s = recordAtBat(onThird(), inPlay('line_out', SAC_FLY_MIN_EV));
    expect(s.runs).toBe(1);
    expect(s.outs).toBe(1);
    expect(occupied(s.bases)).toEqual([false, false, false]);
  });

  it('still costs the out — it is a sacrifice', () => {
    expect(recordAtBat(onThird(), inPlay('line_out', 120)).outs).toBe(1);
  });

  it('will not score him on an infield popup, however hard it was hit', () => {
    // ⚠️ THIS TEST USED TO PASS A WEAK POPUP AND THAT IS WHY THE BUG SURVIVED.
    // It asserted `SAC_FLY_MIN_EV - 10`, which is a popup that fails the gate
    // on exit velocity alone — so it proved the gate worked and said nothing
    // about the popup. Real popups clear 85 easily: exit velocity is
    // `base × timing × (0.8 + power × 0.4)`, so 65 off a 1.0-power bat squared
    // up is 86 and off a 1.9-power bat is 111. A run was scoring from third on
    // a ball hit straight up over the infield.
    //
    // The rule is categorical, not a threshold: you cannot tag up on an infield
    // fly at any exit velocity, so that is what gets asserted.
    for (const ev of [SAC_FLY_MIN_EV - 10, SAC_FLY_MIN_EV, 100, 122]) {
      const s = recordAtBat(onThird(), inPlay('popup', ev));
      expect(s.runs, `popup at ${ev} mph`).toBe(0);
      expect(occupied(s.bases), `popup at ${ev} mph`).toEqual([false, false, true]);
      expect(s.outs, `popup at ${ev} mph`).toBe(1);
    }
  });

  it('will not score him with two outs', () => {
    const twoOut = play(newMatch(), K, K, inPlay('triple'));
    const s = recordAtBat(twoOut, inPlay('line_out', 120));
    expect(s.runs).toBe(0);
    // Third out: the inning rolled and the run did not count.
    expect(s.inning).toBe(2);
  });

  it('does nothing on a ground out, however hard it was hit', () => {
    const s = recordAtBat(onThird(), inPlay('ground_out', 120));
    expect(s.runs).toBe(0);
    expect(occupied(s.bases)).toEqual([false, false, true]);
  });

  it('does nothing with nobody on third', () => {
    const s = recordAtBat(play(newMatch(), inPlay('single')), inPlay('line_out', 120));
    expect(s.runs).toBe(0);
  });

  it('leaves the men on first and second where they were', () => {
    // ponytail: no runner advancing from second on a sac fly. He can tag on a
    // deep one in real ball; here only the man on third moves.
    const loaded = play(newMatch(), BB, BB, BB);
    const s = recordAtBat(loaded, inPlay('line_out', 120));
    expect(s.runs).toBe(1);
    expect(occupied(s.bases)).toEqual([true, true, false]);
  });
});

describe('the extra base', () => {
  const fast = (name: string): Runner => ({ name, speed: EXTRA_BASE_SPEED });
  const slow = (name: string): Runner => ({ name, speed: 0.7 });

  it('sends a fast runner first to third on a single', () => {
    let s = recordAtBat(newMatch(), inPlay('single'), fast('Wee Tom'));
    s = recordAtBat(s, inPlay('single'), slow('Deacon'));
    expect(occupied(s.bases)).toEqual([true, false, true]);
    expect(s.runs).toBe(0);
  });

  it('holds a slow runner at second, the way it always did', () => {
    let s = recordAtBat(newMatch(), inPlay('single'), slow('Deacon'));
    s = recordAtBat(s, inPlay('single'), slow('Deacon'));
    expect(occupied(s.bases)).toEqual([true, true, false]);
  });

  it('scores a fast runner from second on a single', () => {
    let s = recordAtBat(newMatch(), inPlay('double'), fast('Wee Tom'));
    s = recordAtBat(s, inPlay('single'), slow('Deacon'));
    expect(s.runs).toBe(1);
    expect(occupied(s.bases)).toEqual([true, false, false]);
  });

  it('never lets a runner pass the man in front of him', () => {
    // THE case the lead-first ordering exists for. A slow man on second only
    // reaches third; a burner on first must not arrive there too.
    let s = recordAtBat(newMatch(), inPlay('single'), slow('Deacon'));
    s = recordAtBat(s, inPlay('single'), fast('Wee Tom'));
    // Deacon 1st→2nd, Wee Tom on 1st. Now a single: Deacon 2nd→3rd (slow),
    // Wee Tom wants 1st→3rd and cannot have it.
    s = recordAtBat(s, inPlay('single'), slow('Cap'));
    expect(occupied(s.bases)).toEqual([true, true, true]);
    expect(s.runs).toBe(0);
  });

  it('does not apply to the batter — nobody stretches a single', () => {
    const s = recordAtBat(newMatch(), inPlay('single'), fast('Wee Tom'));
    expect(occupied(s.bases)).toEqual([true, false, false]);
  });

  it('does not apply on a walk', () => {
    let s = recordAtBat(newMatch(), inPlay('single'), fast('Wee Tom'));
    s = recordAtBat(s, BB, fast('Rosa'));
    expect(occupied(s.bases)).toEqual([true, true, false]);
  });

  it('leaves ANON callers exactly where they were', () => {
    // The whole point of putting the threshold above 1.0: every caller that
    // does not track who is on base keeps its old behaviour.
    expect(ANON.speed).toBeLessThan(EXTRA_BASE_SPEED);
    const s = play(newMatch(), inPlay('single'), inPlay('single'));
    expect(occupied(s.bases)).toEqual([true, true, false]);
  });
});

describe('bases', () => {
  it('moves every runner one base on a single', () => {
    const s = play(newMatch(), inPlay('single'), inPlay('single'));
    expect(occupied(s.bases)).toEqual([true, true, false]);
    expect(s.runs).toBe(0);
  });

  it('scores everyone on a home run', () => {
    const s = play(newMatch(), inPlay('single'), inPlay('single'), inPlay('home_run'));
    expect(s.runs).toBe(3);
    expect(occupied(s.bases)).toEqual([false, false, false]);
  });

  it('scores a runner from second on a double', () => {
    const s = play(newMatch(), inPlay('double'), inPlay('double'));
    expect(s.runs).toBe(1);
    expect(occupied(s.bases)).toEqual([false, true, false]);
  });
});

describe('hit by pitch advances exactly like a walk', () => {
  const HBP: AtBatResult = { kind: 'hit_by_pitch' };

  it('puts the batter on first', () => {
    expect(occupied(recordAtBat(newMatch(), HBP).bases)).toEqual([true, false, false]);
  });

  it('forces in a run with the bases loaded, and only then', () => {
    const loaded = play(newMatch(), HBP, HBP, HBP);
    expect(loaded.runs).toBe(0);
    expect(play(loaded, HBP).runs).toBe(1);
  });

  it('costs no outs', () => {
    expect(play(newMatch(), HBP, HBP, HBP, HBP).outs).toBe(0);
  });
});

describe('walks force, and only force', () => {
  it('puts the batter on first with the bases empty', () => {
    const s = recordAtBat(newMatch(), BB);
    expect(occupied(s.bases)).toEqual([true, false, false]);
  });

  it('leaves a runner on second alone', () => {
    const s = play(newMatch(), inPlay('double'), BB);
    expect(occupied(s.bases)).toEqual([true, true, false]);
    expect(s.runs).toBe(0);
  });

  it('forces in a run only with the bases loaded', () => {
    const loaded = play(newMatch(), BB, BB, BB);
    expect(occupied(loaded.bases)).toEqual([true, true, true]);
    expect(loaded.runs).toBe(0);

    const s = recordAtBat(loaded, BB);
    expect(s.runs).toBe(1);
    expect(occupied(s.bases)).toEqual([true, true, true]);
  });
});

describe('a full encounter runs end to end', () => {
  it('never leaves outs at 3 or a negative run total', () => {
    let s = newMatch(9);
    const script = [BB, K, inPlay('single'), inPlay('ground_out'), inPlay('home_run'), K, K];
    while (!s.over) {
      for (const r of script) {
        if (s.over) break;
        s = recordAtBat(s, r);
        expect(s.outs).toBeLessThan(3);
        expect(s.runs).toBeGreaterThanOrEqual(0);
      }
    }
    expect(s.inning).toBe(10);
  });
});

describe('runnerMoves — what the base HUD draws', () => {
  const r = (name: string): Runner => ({ name, speed: 1 });
  const bases = (a: string | null, b: string | null, c: string | null): Bases => [
    a ? r(a) : null,
    b ? r(b) : null,
    c ? r(c) : null,
  ];

  it('reports nothing when nothing moved', () => {
    expect(runnerMoves(bases('Cap', null, null), bases('Cap', null, null))).toEqual([]);
  });

  it('reports a steal of second as first to second', () => {
    expect(runnerMoves(bases('Cap', null, null), bases(null, 'Cap', null))).toEqual([
      { name: 'Cap', from: 0, to: 1 },
    ]);
  });

  it('treats a new runner as coming from home', () => {
    expect(runnerMoves(EMPTY_BASES, bases('Rosa', null, null))).toEqual([
      { name: 'Rosa', from: -1, to: 0 },
    ]);
  });

  it('moves everyone a single advanced', () => {
    const moves = runnerMoves(bases('Cap', 'Rosa', null), bases('Dex', 'Cap', 'Rosa'));
    expect(moves).toContainEqual({ name: 'Cap', from: 0, to: 1 });
    expect(moves).toContainEqual({ name: 'Rosa', from: 1, to: 2 });
    expect(moves).toContainEqual({ name: 'Dex', from: -1, to: 0 });
  });

  it('never slides a runner backwards when a short lineup wraps the same name', () => {
    // Three signed players means the order comes round again — the same man
    // can genuinely be on two bases, and naive name matching drew him
    // retreating from second to first.
    const moves = runnerMoves(bases('Cap', null, null), bases('Cap', 'Cap', null));
    expect(moves.every((m) => m.to > m.from)).toBe(true);
    expect(moves).toHaveLength(1);
  });

  it('reports nothing for runners who left the bases', () => {
    expect(runnerMoves(bases('Cap', null, null), EMPTY_BASES)).toEqual([]);
  });

  describe('scorersFrom — the half runnerMoves cannot see', () => {
    it('reports nobody when nobody scored', () => {
      expect(scorersFrom(bases('Cap', null, 'Rosa'), EMPTY_BASES, 0)).toEqual([]);
    });

    it('sends the man on third home on a one-run play', () => {
      expect(scorersFrom(bases(null, null, 'Rosa'), EMPTY_BASES, 1)).toEqual([2]);
    });

    it('scores the LEAD runners first when several came home', () => {
      // Third before second before first: a man cannot score past the runner
      // in front of him, so the order is never in question.
      expect(scorersFrom(bases('Cap', 'Dex', 'Rosa'), EMPTY_BASES, 2)).toEqual([2, 1]);
    });

    it('does not run the man erased on a double play home', () => {
      // THE case this function exists for. turnTwo() removes the forced runner
      // from first, so he vanishes from `next` exactly the way a scorer does.
      // With no runs on the play, nobody is sent home.
      expect(scorersFrom(bases('Cap', null, null), EMPTY_BASES, 0)).toEqual([]);
    });

    it('separates a scorer from a man erased in the same play', () => {
      // Man on first forced at second, man on third scores. Both are gone from
      // the diff; only one of them ran home, and the run count is what says so.
      expect(scorersFrom(bases('Cap', null, 'Rosa'), EMPTY_BASES, 1)).toEqual([2]);
    });

    it('never reports more scorers than runs', () => {
      expect(scorersFrom(bases('Cap', 'Dex', 'Rosa'), EMPTY_BASES, 1)).toHaveLength(1);
    });

    it('ignores runners who are still standing on a bag', () => {
      // Rosa scored from third; Cap only moved up and must not be counted.
      expect(scorersFrom(bases('Cap', null, 'Rosa'), bases(null, 'Cap', null), 1)).toEqual([2]);
    });
  });
});

/**
 * THE THROW TO THE EXTRA BASE. The extra base used to be free — a runner at
 * EXTRA_BASE_SPEED or better simply took it, every time, so an outfield arm was
 * a rating that could not be felt and there was never a reason not to send him.
 */
describe('gunning down the extra base', () => {
  /** A man on first with the legs to try for third. */
  const BATTER: Runner = { name: 'batter', speed: 1 };
  const FAST: Runner = { name: 'Wheels', speed: 1.4 };
  const SLOW: Runner = { name: 'Piano', speed: 0.8 };
  const single = (): AtBatResult => inPlay('single');

  /** Certain to be thrown out, and certain not to be. */
  const gunned = { odds: 1, roll: 0 };
  const safe = { odds: 1, roll: 0.999 };

  const withRunnerOnFirst = (who: Runner) => ({
    outs: 0,
    bases: [who, null, null] as Bases,
  });

  it('takes the runner off the bases and charges an out', () => {
    const p = applyAtBat(withRunnerOnFirst(FAST), single(), BATTER, {
      error: false,
      doublePlay: false,
      extraBase: gunned,
    });
    expect(p.outs).toBe(1);
    expect(p.thrownOut?.runner.name).toBe('Wheels');
    // He was going for third, which is bag 3.
    expect(p.thrownOut?.at).toBe(3);
    expect(occupied(p.bases)).toEqual([true, false, false]);
  });

  it('still lets everybody behind him move up', () => {
    // ⚠️ THE THROW WENT TO THE LEAD BASE, which is exactly why the man behind
    // takes the extra one on it. A throwout that froze the other runners would
    // be a double play with no second putout in it.
    const p = applyAtBat(withRunnerOnFirst(FAST), single(), BATTER, {
      error: false,
      doublePlay: false,
      extraBase: gunned,
    });
    expect(occupied(p.bases)).toEqual([true, false, false]);
    expect(p.runs).toBe(0);
  });

  it('leaves him alone when the throw is late', () => {
    const p = applyAtBat(withRunnerOnFirst(FAST), single(), BATTER, {
      error: false,
      doublePlay: false,
      extraBase: safe,
    });
    expect(p.outs).toBe(0);
    expect(p.thrownOut).toBeNull();
    // First to third, batter on first.
    expect(occupied(p.bases)).toEqual([true, false, true]);
  });

  it('never throws out a man who was not running', () => {
    // A slow runner does not try for the extra base, so there is nothing to
    // throw at — the arm cannot punish a decision nobody made.
    const p = applyAtBat(withRunnerOnFirst(SLOW), single(), BATTER, {
      error: false,
      doublePlay: false,
      extraBase: gunned,
    });
    expect(p.outs).toBe(0);
    expect(p.thrownOut).toBeNull();
    expect(occupied(p.bases)).toEqual([true, true, false]);
  });

  it('gets at most one runner — there is one ball', () => {
    const p = applyAtBat(
      { outs: 0, bases: [FAST, FAST, null] as Bases },
      single(),
      { name: 'batter', speed: 1 },
      { error: false, doublePlay: false, extraBase: gunned },
    );
    expect(p.outs).toBe(1);
  });

  it('is unchanged when nobody hands it a throw', () => {
    // Every caller that does not roll one — the roguelike, every old test —
    // keeps the free extra base it always had.
    const p = applyAtBat(withRunnerOnFirst(FAST), single(), { name: 'batter', speed: 1 });
    expect(p.outs).toBe(0);
    expect(occupied(p.bases)).toEqual([true, false, true]);
  });
});

/**
 * THE GROUND BALL AND THE SEND — 2026-08-25.
 *
 * The complaint that produced this: "runners don't advance on ground outs and
 * don't run home on singles." Both were true. An ordinary grounder froze the
 * bases entirely, and the man on second only scored on a single if his speed
 * cleared a hard 1.15 gate, which two thirds of the league never do.
 */
describe('running the bases on a ball in play', () => {
  const man = (name: string, speed = 1): Runner => ({ name, speed });
  const rolls = (a: number, b: number, c: number) =>
    ({ error: false, doublePlay: false, advanceRolls: [a, b, c] }) as const;

  it('moves the forced man up on an ordinary ground out', () => {
    const p = applyAtBat({ outs: 0, bases: [man('a'), null, null] }, inPlay('ground_out'));
    expect(p.outs).toBe(1);
    expect(occupied(p.bases)).toEqual([false, true, false]);
  });

  it('scores the man from third on a grounder when he goes', () => {
    const bases: Bases = [null, null, man('c')];
    // 0 beats any send chance; 0.99 beats none.
    expect(applyAtBat({ outs: 0, bases }, inPlay('ground_out'), ANON, rolls(0, 0, 0)).runs).toBe(1);
    expect(
      applyAtBat({ outs: 0, bases }, inPlay('ground_out'), ANON, rolls(0.99, 0.99, 0.99)).runs,
    ).toBe(0);
  });

  it('scores nobody on a ground out that is the third out', () => {
    const p = applyAtBat(
      { outs: 2, bases: [man('a'), man('b'), man('c')] },
      inPlay('ground_out'),
      ANON,
      rolls(0, 0, 0),
    );
    expect(p.outs).toBe(3);
    expect(p.runs).toBe(0);
  });

  it('never runs a man into the back of the one ahead of him', () => {
    // Everyone sent, but the lead man holds — bases loaded, nobody forced
    // past him, so the bags stay one runner each.
    const p = applyAtBat(
      { outs: 0, bases: [null, man('b'), man('c')] },
      inPlay('ground_out'),
      ANON,
      rolls(0, 0, 0.99),
    );
    expect(occupied(p.bases)).toEqual([false, true, true]);
    expect(p.runs).toBe(0);
  });

  it('sends an ordinary runner home from second on a single', () => {
    // Speed 1.0 — nowhere near the old EXTRA_BASE_SPEED gate, and he scores.
    const p = applyAtBat({ outs: 0, bases: [null, man('b'), null] }, inPlay('single'), ANON, rolls(0, 0, 0));
    expect(p.runs).toBe(1);
    expect(p.thrownOut).toBeFalsy();
  });

  it('holds him when the roll says hold', () => {
    const p = applyAtBat(
      { outs: 0, bases: [null, man('b'), null] },
      inPlay('single'),
      ANON,
      rolls(0.99, 0.99, 0.99),
    );
    expect(p.runs).toBe(0);
    expect(occupied(p.bases)).toEqual([true, false, true]);
  });
});

/**
 * THE PHANTOM BASE, found by playing the game 2026-08-26.
 *
 * The play-by-play said "Buoy Callahan thrown out at the bag, 7-2" — and both
 * halves of that are fallback text. `BAG_WORD` has 2, 3 and 4 in it, so "the
 * bag" only prints for a base that is not second, third or home; `throwNotation`
 * defaults to the catcher for the same reason. A man was being gunned down at a
 * base that does not exist.
 *
 * WHERE IT COMES FROM. advance() offers the extra base whenever
 * `wants >= 4 || wants < ceiling`. That first clause is there to say the road
 * home is never blocked by the man in front — true and needed — but it also
 * lets a runner whose NATURAL destination is already home try for one MORE.
 * A man on third when the batter doubles has `to = 5` and `wants = 6`.
 *
 * ⚠️ IT WAS HARMLESS UNTIL THE THROW EXISTED. Before gunDown(), that runner
 * just took `to = 6`, and `to >= 4` scored him — the bogus number never left
 * the function. With an arm out there he can now be ERASED instead, so a
 * runner who should score automatically is thrown out at a base beyond home.
 * Silently: it reads as flavour text, not as a lost run.
 */
describe('nobody is thrown out at a base that does not exist', () => {
  const fast = { name: 'Wheels', speed: 1.5 };
  const slow = { name: 'Anchor', speed: 0.5 };
  /** An arm that always guns down whoever is offered to it. */
  const cannon = { error: false, doublePlay: false, extraBase: { odds: 1, roll: 0 },
    advanceRolls: [0, 0, 0] as const };
  const hit = (outcome: 'single' | 'double') =>
    ({ kind: 'in_play', hit: { outcome, bases: outcome === 'single' ? 1 : 2 } }) as never;

  it('scores the man from third on a double instead of gunning him down at base six', () => {
    const out = applyAtBat(
      { outs: 0, bases: [null, null, fast] },
      hit('double'),
      slow,
      cannon,
    );
    expect(out.thrownOut).toBeNull();
    expect(out.runs).toBe(1);
  });

  it('scores the man from third on a single, too', () => {
    const out = applyAtBat(
      { outs: 0, bases: [null, null, fast] },
      hit('single'),
      slow,
      cannon,
    );
    expect(out.thrownOut).toBeNull();
    expect(out.runs).toBe(1);
  });

  it('still guns a man down going second-to-home on a single — the real play', () => {
    const out = applyAtBat(
      { outs: 0, bases: [null, fast, null] },
      hit('single'),
      slow,
      cannon,
    );
    expect(out.thrownOut?.at).toBe(4);
    expect(out.runs).toBe(0);
  });

  it('never reports a base outside second, third and home, over every arrangement', () => {
    // The property the two fallbacks in main.ts exist to cover, asserted so
    // they stay unreachable.
    const men = [null, fast, slow];
    for (const a of men) for (const b of men) for (const c of men) {
      for (const outcome of ['single', 'double'] as const) {
        const out = applyAtBat({ outs: 0, bases: [a, b, c] }, hit(outcome), slow, cannon);
        if (out.thrownOut) expect([2, 3, 4]).toContain(out.thrownOut.at);
      }
    }
  });
});
