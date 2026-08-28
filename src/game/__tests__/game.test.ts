/**
 * The two-sided game: half-innings, the batting order, and the four ways a
 * game can end. These are the rules the roguelike's MatchState never had.
 */

import { describe, expect, it } from 'vitest';
import {
  battingSide,
  currentBatter,
  fieldingSide,
  inningLabel,
  newGame,
  onDeck,
  recordPlay,
  recordOut,
  currentPitcher,
  type GameState,
} from '../game.ts';
import { HOME, AWAY, starterOf } from '../teams.ts';
import { simulateGame } from '../sim.ts';

const OUT = { kind: 'strikeout' } as const;
const HR = {
  kind: 'in_play',
  hit: {
    outcome: 'home_run',
    timing: 'perfect',
    pitchType: 'fastball',
    isOut: false,
    isHit: true,
    exitVelocity: 105,
    platoon: 1,
    directionDeg: 0,
  },
} as any;

const fresh = (regulation = 9) => newGame(HOME, AWAY, regulation);

/** Retire the side, whoever is up. */
const threeOuts = (g: GameState): GameState => {
  let s = g;
  for (let i = 0; i < 3; i++) s = recordPlay(s, OUT).game;
  return s;
};

describe('halves and innings', () => {
  it('opens in the top of the first with the away team batting', () => {
    const g = fresh();
    expect(g.inning).toBe(1);
    expect(g.half).toBe('top');
    expect(battingSide(g)).toBe('away');
    expect(fieldingSide(g)).toBe('home');
    expect(inningLabel(g)).toBe('T1');
  });

  it('three outs flips to the bottom of the SAME inning', () => {
    const g = threeOuts(fresh());
    expect(g.inning).toBe(1);
    expect(g.half).toBe('bottom');
    expect(battingSide(g)).toBe('home');
  });

  it('three more rolls to the top of the next', () => {
    const g = threeOuts(threeOuts(fresh()));
    expect(g.inning).toBe(2);
    expect(g.half).toBe('top');
  });

  it('clears the bases and the outs between halves', () => {
    let g = recordPlay(fresh(), { kind: 'walk' }).game;
    expect(g.bases[0]).not.toBeNull();
    g = threeOuts(g);
    expect(g.outs).toBe(0);
    expect(g.bases).toEqual([null, null, null]);
  });

  it('posts each half to its own line score', () => {
    let g = recordPlay(fresh(), HR).game; // away go up 1-0
    g = threeOuts(g);
    expect(g.awayState.byInning).toEqual([1]);
    expect(g.homeState.byInning).toEqual([]);
    g = threeOuts(g);
    expect(g.homeState.byInning).toEqual([0]);
  });

  it('the pitcher on the mound is the FIELDING team\'s starter', () => {
    const g = fresh();
    // Top half: away bats, so the home starter works.
    expect(fieldingSide(g)).toBe('home');
    expect(currentPitcher(g).name).toBe(starterOf(HOME).name);
    const bottom = threeOuts(g);
    expect(fieldingSide(bottom)).toBe('away');
    expect(currentPitcher(bottom).name).toBe(starterOf(AWAY).name);
  });
});

describe('the batting order', () => {
  it('starts at the leadoff man and advances on every at-bat', () => {
    const g = fresh();
    expect(currentBatter(g).name).toBe(AWAY.lineup[0]!.name);
    expect(onDeck(g).name).toBe(AWAY.lineup[1]!.name);
    const next = recordPlay(g, OUT).game;
    expect(currentBatter(next).name).toBe(AWAY.lineup[1]!.name);
  });

  it('advances on an out, not only on a hit', () => {
    let g = fresh();
    g = recordPlay(g, OUT).game;
    g = recordPlay(g, OUT).game;
    expect(currentBatter(g).name).toBe(AWAY.lineup[2]!.name);
  });

  it('wraps after nine and does NOT reset between innings', () => {
    let g = fresh();
    for (let i = 0; i < 9; i++) g = recordPlay(g, { kind: 'walk' }).game;
    expect(currentBatter(g).name).toBe(AWAY.lineup[0]!.name);
    // Retire them; the away order must resume where it left off next inning.
    g = threeOuts(g);
    const orderAfter = g.awayState.order;
    g = threeOuts(g); // home's half
    expect(g.awayState.order).toBe(orderAfter);
  });

  it('each side keeps its own order pointer', () => {
    let g = threeOuts(fresh()); // away made three outs
    expect(g.awayState.order).toBe(3);
    expect(g.homeState.order).toBe(0);
    g = recordPlay(g, OUT).game;
    expect(g.homeState.order).toBe(1);
    expect(g.awayState.order).toBe(3);
  });
});

describe('how a game ends', () => {
  /** Play `n` scoreless half-innings from a fresh game. */
  const halves = (n: number): GameState => {
    let g = fresh();
    for (let i = 0; i < n && !g.over; i++) g = threeOuts(g);
    return g;
  };

  it('a scoreless nine goes to extras rather than ending tied', () => {
    const g = halves(18);
    expect(g.over).toBe(false);
    expect(g.inning).toBe(10);
  });

  it('ends in regulation when the away team leads after the bottom of the ninth', () => {
    let g = fresh();
    g = recordPlay(g, HR).game; // away 1-0
    for (let i = 0; i < 18 && !g.over; i++) g = threeOuts(g);
    expect(g.over).toBe(true);
    expect(g.winner).toBe('away');
    expect(g.ending).toBe('regulation');
  });

  it('the home team does not bat in the ninth when already ahead', () => {
    let g = fresh();
    g = threeOuts(g); // T1 done
    g = recordPlay(g, HR).game; // home 1-0
    for (let i = 0; i < 17 && !g.over; i++) g = threeOuts(g);
    expect(g.over).toBe(true);
    expect(g.winner).toBe('home');
    expect(g.ending).toBe('home_wins_early');
    // Eight full bottom halves plus the first — never a ninth.
    expect(g.homeState.byInning.length).toBeLessThan(9);
  });

  it('a walk-off ends it the instant the run scores, mid-inning', () => {
    let g = halves(17); // through the top of the ninth, 0-0
    expect(g.half).toBe('bottom');
    expect(g.inning).toBe(9);
    expect(g.outs).toBe(0);
    g = recordPlay(g, HR).game;
    expect(g.over).toBe(true);
    expect(g.winner).toBe('home');
    expect(g.ending).toBe('walk_off');
    expect(g.outs).toBe(0); // the half never finished
    expect(g.homeState.byInning.length).toBe(9); // still posted to the line
  });

  it('a lead taken in the third is not a walk-off', () => {
    let g = fresh();
    g = threeOuts(g);
    g = recordPlay(g, HR).game;
    expect(g.over).toBe(false);
  });

  it('refuses to play on after it is over', () => {
    let g = halves(17);
    g = recordPlay(g, HR).game;
    expect(() => recordPlay(g, OUT)).toThrow(/over/);
  });
});

describe('caught stealing shares the inning roll', () => {
  it('a third out on the bases closes the half like any other', () => {
    let g = recordPlay(fresh(), { kind: 'walk' }).game;
    g = recordPlay(g, OUT).game;
    g = recordPlay(g, OUT).game;
    expect(g.outs).toBe(2);
    g = recordOut(g, [null, null, null]);
    expect(g.half).toBe('bottom');
    expect(g.awayState.byInning).toEqual([0]);
  });
});

describe('a whole game, simulated', () => {
  it('always reaches a finished, non-tied game', () => {
    for (let seed = 0; seed < 60; seed++) {
      const { game } = simulateGame(seed * 131 + 7);
      expect(game.over).toBe(true);
      expect(game.homeState.runs).not.toBe(game.awayState.runs);
      expect(game.winner).toBe(
        game.homeState.runs > game.awayState.runs ? 'home' : 'away',
      );
    }
  });

  it('plays at least nine innings unless the home team wins early', () => {
    for (let seed = 0; seed < 40; seed++) {
      const { game } = simulateGame(seed * 977 + 3);
      expect(game.inning).toBeGreaterThanOrEqual(9);
      // The visitors always get nine full turns at bat.
      expect(game.awayState.byInning.length).toBeGreaterThanOrEqual(9);
    }
  });

  it('is deterministic from the seed', () => {
    const a = simulateGame(4242);
    const b = simulateGame(4242);
    expect(a.game.homeState.runs).toBe(b.game.homeState.runs);
    expect(a.game.awayState.runs).toBe(b.game.awayState.runs);
    expect(a.pitches).toBe(b.pitches);
  });

  it('scores like baseball, not like softball', () => {
    // The regression that mattered: a normal-distribution timing model put
    // this at 25.6 runs per team. See AI_TIMING_BANDS in ai.ts.
    let runs = 0;
    const N = 120;
    for (let seed = 0; seed < N; seed++) {
      const { game } = simulateGame(seed * 7919 + 13);
      runs += game.homeState.runs + game.awayState.runs;
    }
    const perTeam = runs / N / 2;
    expect(perTeam).toBeGreaterThan(2.5);
    expect(perTeam).toBeLessThan(6.5);
  });
});
