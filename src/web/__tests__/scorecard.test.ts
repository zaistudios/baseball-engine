/**
 * The words. These guard the thing that made the log read as a debug readout:
 * enum names, launch angles, and degrees leaking into the booth.
 */

import { describe, it, expect } from 'vitest';
import { callPlay, fieldOf, type PlayInput } from '../scorecard.ts';
import type { Outcome } from '../../core/hitTables.ts';

const ALL: Outcome[] = [
  'strikeout',
  'popup',
  'ground_out',
  'line_out',
  'foul',
  'single',
  'double',
  'triple',
  'home_run',
];

const base: PlayInput = {
  outcome: 'single',
  chaser: 6,
  doublePlay: false,
  error: false,
  outs: 1,
  scored: 0,
  direction: -12,
};
const call = (over: Partial<PlayInput> = {}) => callPlay({ ...base, ...over });

describe('every outcome gets called', () => {
  it('has a scorer line and a sentence for all nine', () => {
    // The union is a Record everywhere else in this codebase for exactly this
    // reason — a missing arm here is a blank log line in play.
    for (const outcome of ALL) {
      const c = call({ outcome });
      expect(c.score.length).toBeGreaterThan(0);
      expect(c.says.length).toBeGreaterThan(0);
    }
  });

  it('never says an enum name or a number of degrees', () => {
    // What the old line actually printed: "GROUND OUT — perfect, pulled, 3°".
    for (const outcome of ALL) {
      for (const dp of [true, false]) {
        for (const err of [true, false]) {
          const c = call({ outcome, doublePlay: dp, error: err, direction: 21 });
          expect(c.says).not.toMatch(/_/);
          expect(c.says).not.toMatch(/°/);
          expect(c.says).not.toMatch(/GROUND OUT|LINE OUT|HOME RUN/);
        }
      }
    }
  });
});

describe('the scorer line', () => {
  it('writes a ground out as the fielder to first', () => {
    expect(call({ outcome: 'ground_out', chaser: 6 }).score).toBe('6-3');
  });

  it('writes an unassisted play at first as 3U, not 3-3', () => {
    expect(call({ outcome: 'ground_out', chaser: 3 }).score).toBe('3U');
  });

  it('writes a double play through second', () => {
    expect(call({ outcome: 'ground_out', chaser: 6, doublePlay: true }).score).toBe('6-4-3');
  });

  it('writes an error against whoever booted it', () => {
    expect(call({ outcome: 'ground_out', chaser: 4, error: true }).score).toBe('E4');
  });

  it('flies to the outfield and pops up to the infield', () => {
    expect(call({ outcome: 'popup', chaser: 4 }).score).toBe('P4');
    expect(call({ outcome: 'popup', chaser: 8 }).score).toBe('F8');
    expect(call({ outcome: 'line_out', chaser: 6 }).score).toBe('L6');
    expect(call({ outcome: 'line_out', chaser: 7 }).score).toBe('F7');
  });

  it('lets the error and the double play beat the outcome', () => {
    // Both are rolled after the outcome and both change what the play WAS.
    // A booted ground out is not a ground out on the card.
    expect(call({ outcome: 'ground_out', error: true }).score).toMatch(/^E/);
    expect(call({ outcome: 'ground_out', doublePlay: true }).score).not.toBe('6-3');
  });
});

describe('the booth', () => {
  it('counts the outs the way a park announcer does', () => {
    expect(call({ outcome: 'ground_out', outs: 1 }).says).toContain('one away');
    expect(call({ outcome: 'ground_out', outs: 2 }).says).toContain('two away');
    expect(call({ outcome: 'ground_out', outs: 3 }).says).toContain('retires the side');
  });

  it('mentions runs only when runs scored', () => {
    expect(call({ outcome: 'single', scored: 0 }).says).not.toMatch(/scores?\./i);
    expect(call({ outcome: 'single', scored: 1 }).says).toContain('A run scores');
    expect(call({ outcome: 'single', scored: 2 }).says).toContain('2 score');
  });

  it('sizes a home run by how many it drove in', () => {
    expect(call({ outcome: 'home_run', scored: 3 }).says).toContain('3-run');
    expect(call({ outcome: 'home_run', scored: 1 }).says).not.toContain('-run shot');
  });
});

describe('where it went', () => {
  it('reads left to right across the field', () => {
    expect(fieldOf(-40)).toContain('left-field corner');
    expect(fieldOf(-15)).toContain('left');
    expect(fieldOf(0)).toContain('center');
    expect(fieldOf(15)).toContain('right');
    expect(fieldOf(40)).toContain('right-field corner');
  });

  it('carries no preposition of its own', () => {
    // Every caller writes "to ${fieldOf(d)}". A place that brought its own
    // preposition produced "into the gap into right-center".
    for (const d of [-45, -30, -12, -5, 0, 5, 12, 30, 45]) {
      expect(fieldOf(d)).not.toMatch(/^(to|into|down|up) /);
    }
  });

  it('agrees with the sign convention the rest of the game uses', () => {
    // Negative is left field. Stated once in plot.ts; this stops the words
    // from quietly disagreeing with the picture.
    expect(fieldOf(-30)).not.toContain('right');
    expect(fieldOf(30)).not.toContain('left');
  });
});

describe('the sacrifice fly gets its own words', () => {
  const sac = (over: Partial<PlayInput> = {}): PlayInput => ({
    ...base,
    outcome: 'line_out',
    chaser: 8,
    outs: 1,
    scored: 1,
    sacFly: true,
    ...over,
  });

  it('is scored SF, not F', () => {
    expect(callPlay(sac()).score).toBe('SF8');
  });

  it('says the run scored', () => {
    // The bug this exists to prevent: popup and line_out never append `runs`,
    // so before the flag a sacrifice fly put a run on the board and the booth
    // called it "hit hard, but right at center" — the picture contradicting
    // the book, which is the one thing the replay subsystem may never do.
    expect(callPlay(sac()).says).toMatch(/scores/);
  });

  it('names who caught it and how many are away', () => {
    expect(callPlay(sac()).says).toContain('center');
    expect(callPlay(sac({ outs: 2 })).says).toContain('two away');
  });

  it('reads as a popup off the bat of an infielder too', () => {
    // A deep enough popup is vanishingly rare but not impossible, and the
    // call must not say "fly ball to short".
    expect(callPlay(sac({ outcome: 'popup', chaser: 6 })).score).toBe('SF6');
  });

  it('never fires on a play that is not one', () => {
    expect(callPlay({ ...sac(), sacFly: false }).score).toBe('F8');
  });

  it('loses to the error and the double play, which are bigger news', () => {
    expect(callPlay({ ...sac(), error: true }).score).toBe('E8');
    expect(callPlay({ ...sac(), doublePlay: true }).score).toBe('8-4-3');
  });
});
