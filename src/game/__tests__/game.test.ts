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
import { HOME, AWAY, LEAGUE, starterOf } from '../teams.ts';
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

  /**
   * ⚠️ THE INSTRUMENT scripts/place.ts CANNOT BE. It reports the foul rate per
   * SWING — 33.9% against a real ~35%, and it always did, including while the
   * league was ending 72.5% of its plate appearances with a ball in play
   * against a real 68%. It rolls a uniform spread of swing timings and the
   * computer's swings come out of AI_TIMING_BANDS, which is not uniform, so
   * the foul rate that reaches a real at-bat was lower than the one it read.
   *
   * A plate appearance ends exactly three ways and they have to add up like
   * baseball. This is the shape FOUL_BOOST is tuned against — see tuning.ts.
   *
   * ⚠️ IT ROTATES THROUGH THE LEAGUE, and that is not decoration. The default
   * matchup alone reads K 26.9% and BB 5.8% — both outside this band — because
   * two clubs are not a league. Tuning FOUL_BOOST against one pair is exactly
   * how it ended up at 2.3, so a test that guards it off one pair would be the
   * same mistake wearing a green tick.
   */
  it('⚠️ a plate appearance ends the way baseball ends one', () => {
    const mix = { walk: 0, hit_by_pitch: 0, strikeout: 0, in_play: 0 };
    let pitches = 0;
    const N = 120;
    for (let seed = 0; seed < N; seed++) {
      const home = LEAGUE[(seed * 7) % LEAGUE.length]!;
      const away = LEAGUE[(seed * 13 + 5) % LEAGUE.length]!;
      if (home.abbr === away.abbr) continue;
      const r = simulateGame(seed * 7919 + 13, 9, home, away);
      pitches += r.pitches;
      for (const k of Object.keys(mix) as (keyof typeof mix)[]) mix[k] += r.outcomes[k];
    }
    const pa = mix.walk + mix.hit_by_pitch + mix.strikeout + mix.in_play;

    // Real: K 22.4%, BB+HBP 9.6%, ball in play 68%, on 3.9 pitches per PA.
    expect(mix.strikeout / pa).toBeGreaterThan(0.17);
    expect(mix.strikeout / pa).toBeLessThan(0.28);
    expect((mix.walk + mix.hit_by_pitch) / pa).toBeGreaterThan(0.06);
    expect((mix.walk + mix.hit_by_pitch) / pa).toBeLessThan(0.13);
    // The one that was wrong, and the reason the other two matter.
    expect(mix.in_play / pa).toBeGreaterThan(0.63);
    expect(mix.in_play / pa).toBeLessThan(0.73);
    expect(pitches / pa).toBeGreaterThan(3.5);
    expect(pitches / pa).toBeLessThan(4.3);
  });
});
