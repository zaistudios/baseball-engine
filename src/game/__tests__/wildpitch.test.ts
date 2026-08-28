/**
 * The ball that gets away.
 *
 * The checks that matter are the ones a rate alone cannot catch: that nobody
 * on means no event, that a run from third is credited to the batting side and
 * charged to the arm, and that it can end a game — a wild pitch in the last of
 * the ninth is a walk-off, and that path shares isWalkOff() with the base hit.
 */

import { describe, expect, it } from 'vitest';
import { makeRng, type Rng } from '../../core/rng.ts';
import { newGame, fieldingAlignment, withBases, stateOf, type GameState } from '../game.ts';
import { rollWildPitch, WILD_PITCH_RATE } from '../running.ts';
import { HOME, AWAY } from '../teams.ts';

const runner = (name: string, speed = 1) => ({ name, speed });

/** An rng that always fires, so the roll is not what is under test. */
const always = () => ({ next: () => 0, range: (lo: number) => lo }) as unknown as Rng;
/** ...and one that never does, whatever the multipliers do to the rate. */
const never = () => ({ next: () => 0.999999, range: (lo: number) => lo }) as unknown as Rng;

const game = (): GameState => newGame(HOME, AWAY, 9);

describe('the wild pitch', () => {
  it('does not fire with nobody on — an empty-bases wild pitch is just a ball', () => {
    const g = game();
    expect(rollWildPitch(g, fieldingAlignment(g), always())).toBeNull();
  });

  it('moves everybody up one', () => {
    const g = withBases(game(), [runner('a'), runner('b'), null]);
    const wp = rollWildPitch(g, fieldingAlignment(g), always());
    expect(wp).not.toBeNull();
    expect(wp!.game.bases[0]).toBeNull();
    expect(wp!.game.bases[1]?.name).toBe('a');
    expect(wp!.game.bases[2]?.name).toBe('b');
    expect(wp!.runs).toBe(0);
  });

  it('scores the man from third, and charges it to the arm', () => {
    const g = withBases(game(), [null, null, runner('c')]);
    const before = stateOf(g, 'home').staff.current.runsAllowed;
    const wp = rollWildPitch(g, fieldingAlignment(g), always())!;
    // Top of the first: away bats, home pitches.
    expect(wp.runs).toBe(1);
    expect(wp.game.awayState.runs).toBe(1);
    expect(wp.game.bases[2]).toBeNull();
    expect(stateOf(wp.game, 'home').staff.current.runsAllowed).toBe(before + 1);
  });

  it('does not fake a plate appearance — battersFaced is untouched', () => {
    const g = withBases(game(), [null, null, runner('c')]);
    const before = stateOf(g, 'home').staff.current.battersFaced;
    const wp = rollWildPitch(g, fieldingAlignment(g), always())!;
    expect(stateOf(wp.game, 'home').staff.current.battersFaced).toBe(before);
  });

  it('walks a game off from third in the last of the ninth', () => {
    let g = game();
    g = { ...g, half: 'bottom', inning: 9, bases: [null, null, runner('c')] };
    const wp = rollWildPitch(g, fieldingAlignment(g), always())!;
    expect(wp.game.over).toBe(true);
    expect(wp.game.winner).toBe('home');
    expect(wp.game.ending).toBe('walk_off');
  });

  it('never fires on a roll above the rate', () => {
    const g = withBases(game(), [runner('a'), null, null]);
    expect(rollWildPitch(g, fieldingAlignment(g), never())).toBeNull();
  });

  it('lands near the league rate over a season of opportunities', () => {
    const g = withBases(game(), [runner('a'), null, null]);
    const rng = makeRng(99);
    let fired = 0;
    for (let i = 0; i < 20000; i++) if (rollWildPitch(g, fieldingAlignment(g), rng)) fired++;
    const rate = fired / 20000;
    // Wildness and the catcher's glove scale it, so this is a band not a point.
    expect(rate).toBeGreaterThan(WILD_PITCH_RATE * 0.4);
    expect(rate).toBeLessThan(WILD_PITCH_RATE * 2.2);
  });
});
