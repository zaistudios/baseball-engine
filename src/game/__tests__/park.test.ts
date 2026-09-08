/**
 * THE BALLPARK — thirty layouts, and what the engine does with them.
 *
 * ⚠️ THE ONE THAT WOULD HAVE CAUGHT THE WRONG DESIGN. The first place a park
 * looks like it belongs is WALL_FT in plot.ts, and putting it only there would
 * have changed the replay and not one result — plotBatted() is a picture
 * reconciled to a verdict the outcome table has already reached. So the tests
 * that matter here are the ones that assert a park moves RUNS and HOME RUNS,
 * not the ones that assert a field got set. Both are below; only the first kind
 * would have failed against that mistake.
 *
 * The four things held:
 *
 *  1. the derivation is centred — the thirty average to a multiplier of 1, so
 *     switching parks on redistributes offence without moving the league's run
 *     environment;
 *  2. every park is distinct, legal, and reachable through the editor;
 *  3. a bandbox actually out-scores a canyon, by a margin big enough to notice;
 *  4. fouls and home runs stay adequate — the foul-out rate stays inside the
 *     band hit.ts measured, and every home run is drawn beyond the fence it was
 *     actually hit toward while nothing else is.
 */
import { describe, expect, it } from 'vitest';
import { checkLeague, FENCE_MIN_FT, FENCE_MAX_FT, FOUL_MAX } from '../league.ts';
import {
  atPark,
  wallAt,
  parkSize,
  parkPower,
  parkFoulAngle,
  LEAGUE_AS_WRITTEN,
  LEAGUE,
  NEUTRAL_SIZE,
  NEUTRAL_WALL_FT,
  DEEPEST_REACH_FT,
  PARKS,
  type Park,
  type Team,
} from '../teams.ts';
import { newGame } from '../game.ts';
import { simulateGame } from '../sim.ts';
import { place, stretch } from '../placement.ts';
import { workingCopy, withParkField, replaceClub, PARK_FIELDS } from '../editor.ts';
import { WALL_FT, plotBatted } from '../../web/plot.ts';
import {
  FOUL_POP_ANGLE,
  caughtFoul,
  resolveSwingSeeded,
  type HitResult,
} from '../../core/hit.ts';

const league = () => workingCopy(LEAGUE_AS_WRITTEN);

const said = (l: readonly Team[]): string => {
  const check = checkLeague(l);
  return check.ok ? '' : check.problems.join('\n');
};

const withPark = (club: Team, park: Park): Team => ({ ...club, park });
const bare = (club: Team): Team => {
  const { park: _p, ...rest } = club;
  return rest;
};

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const PARK_LIST = Object.values(PARKS) as Park[];

// ------------------------------------------------------------ the thirty

describe('the thirty buildings', () => {
  it('gives every club one, and no two clubs the same one', () => {
    expect(LEAGUE_AS_WRITTEN.every((t) => t.park !== undefined)).toBe(true);
    const names = LEAGUE_AS_WRITTEN.map((t) => t.park!.name);
    expect(new Set(names).size).toBe(LEAGUE_AS_WRITTEN.length);
    // ...and no two share a shape either, or two "different" parks play alike.
    const shapes = LEAGUE_AS_WRITTEN.map((t) => {
      const p = t.park!;
      return `${p.left}/${p.center}/${p.right}/${p.foul}`;
    });
    expect(new Set(shapes).size).toBe(LEAGUE_AS_WRITTEN.length);
  });

  it('survives the validator — the shipped league is held to the pasted rules', () => {
    expect(said(league())).toBe('');
  });

  it('carries the parks through temper(), which LEAGUE is built by', () => {
    // ⚠️ parity compresses RATINGS. A park is a building and must come through
    // untouched, or the club you picked is not playing in the park you saw.
    for (let i = 0; i < LEAGUE.length; i++) {
      expect(LEAGUE[i]!.park).toEqual(LEAGUE_AS_WRITTEN[i]!.park);
    }
  });

  /**
   * ⚠️ THE ARITHMETIC THAT KEEPS THE RUN ENVIRONMENT WHERE IT WAS. If the mean
   * factor drifts off 1, thirty parks quietly add or remove offence from the
   * whole league — and every run-scoring number in the engine was tuned before
   * parks existed. scripts/parks.ts prints this; this is what fails the build.
   */
  it('averages to neutral, so parks redistribute rather than inflate', () => {
    expect(mean(PARK_LIST.map(parkPower))).toBeCloseTo(1, 2);
    expect(mean(PARK_LIST.map((p) => p.foul))).toBeCloseTo(1, 2);
    expect(mean(PARK_LIST.map(parkSize))).toBeCloseTo(NEUTRAL_SIZE, 0);
  });

  it('spreads far enough to be worth having and not so far as to be silly', () => {
    const factors = PARK_LIST.map(parkPower);
    expect(Math.min(...factors)).toBeGreaterThan(0.93);
    expect(Math.max(...factors)).toBeLessThan(1.08);
    // A spread under about eight points would not survive a season's noise.
    expect(Math.max(...factors) - Math.min(...factors)).toBeGreaterThan(0.08);
  });

  it('keeps every foul-pop bar inside the band hit.ts measured', () => {
    // hit.ts: the foul population runs to 78°, and past about 4% of plate
    // appearances a foul out starts eating strikeouts that should have
    // happened. One degree is a third of the effect, so the whole league lives
    // within a degree and a half of the default either way.
    for (const p of PARK_LIST) {
      expect(Math.abs(parkFoulAngle(p) - FOUL_POP_ANGLE), p.name).toBeLessThanOrEqual(1.5);
    }
  });

  it('has fences the validator would accept from a stranger', () => {
    for (const p of PARK_LIST) {
      for (const ft of [p.left, p.center, p.right]) {
        expect(ft, p.name).toBeGreaterThanOrEqual(FENCE_MIN_FT);
        expect(ft, p.name).toBeLessThanOrEqual(FENCE_MAX_FT);
      }
      expect(p.foul, p.name).toBeLessThanOrEqual(FOUL_MAX);
      // Centre is the deepest point of a ballpark. A park with a line deeper
      // than its centre field would draw an outfield that caves inward.
      expect(p.center, p.name).toBeGreaterThanOrEqual(Math.max(p.left, p.right));
    }
  });
});

// ------------------------------------------------------------ the geometry

describe('the fence, direction by direction', () => {
  it('hits each written number exactly on its own line and in centre', () => {
    const p = PARKS.NEM;
    expect(wallAt(-45, p)).toBe(p.left);
    expect(wallAt(0, p)).toBe(p.center);
    expect(wallAt(45, p)).toBe(p.right);
  });

  it('keeps the gaps deep — a straight line would drain them', () => {
    const p = PARKS.NEM;
    // Halfway out to the line, a linear wall would sit at the average of the
    // two ends. The quadratic keeps it three quarters of the way to centre.
    const linear = (p.center + p.left) / 2;
    expect(wallAt(-22.5, p)).toBeGreaterThan(linear);
  });

  it('never runs past the lines, however foul the direction', () => {
    const p = PARKS.NEM;
    // A foul carries to ±128°. There is no outfield fence out there.
    for (const d of [-128, -90, -46, 46, 90, 128]) {
      const w = wallAt(d, p);
      expect(w).toBeGreaterThanOrEqual(Math.min(p.left, p.right));
      expect(w).toBeLessThanOrEqual(p.center);
    }
  });

  it('is the 400-foot bowl when there is no park, and agrees with plot.ts', () => {
    expect(NEUTRAL_WALL_FT).toBe(WALL_FT);
    for (const d of [-45, -20, 0, 20, 45]) expect(wallAt(d, undefined)).toBe(WALL_FT);
  });

  it('frames the deepest park in the league, and every fence inside it', () => {
    for (const p of PARK_LIST) {
      for (const d of [-45, -22, 0, 22, 45]) {
        expect(wallAt(d, p), p.name).toBeLessThanOrEqual(DEEPEST_REACH_FT);
      }
    }
    // ⚠️ AND IT IS NOT SCALED TO THE FURTHEST BALL. MAX_CARRY_FT is 505, and
    // fitting that would draw every park a fifth smaller so a rare monster shot
    // could stay on the canvas — see the note on DEEPEST_REACH_FT. Home runs
    // have sailed past the top of the frame since before parks existed.
    expect(DEEPEST_REACH_FT).toBeLessThan(plotBatted('home_run', 122, 30, 0, 420).distFt);
  });
});

// ------------------------------------------------------------ the validator

describe('what a park may be', () => {
  const legal: Park = { name: 'The Sandlot', left: 330, center: 400, right: 330, foul: 1 };

  it('accepts a complete one', () => {
    expect(said(replaceClub(league(), 0, withPark(league()[0]!, legal)))).toBe('');
  });

  it('accepts a club with no park at all — an old save has none', () => {
    expect(said(replaceClub(league(), 0, bare(league()[0]!)))).toBe('');
  });

  it('refuses a park with no name', () => {
    const { name: _n, ...noName } = legal;
    const club = { ...league()[0]!, park: noName as unknown as Park };
    expect(said(replaceClub(league(), 0, club))).toMatch(/park needs a name/);
  });

  /**
   * ⚠️ HALF A LAYOUT IS NOT A LAYOUT. wallAt() interpolates the whole of right
   * field out of `right`, so a missing fence is not "an ordinary right field",
   * it is a building with a hole in it.
   */
  it('refuses a park missing any one fence', () => {
    for (const k of ['left', 'center', 'right'] as const) {
      const { [k]: _drop, ...partial } = legal;
      const club = { ...league()[0]!, park: partial as unknown as Park };
      expect(said(replaceClub(league(), 0, club)), k).toMatch(
        new RegExp(`park ${k} must be a distance`),
      );
    }
  });

  it('refuses a fence inside the infield or past what anybody can hit', () => {
    for (const ft of [0, 100, FENCE_MIN_FT - 1, FENCE_MAX_FT + 1, 900]) {
      const club = withPark(league()[0]!, { ...legal, center: ft });
      expect(said(replaceClub(league(), 0, club)), String(ft)).toMatch(/fences run 150 to 500/);
    }
  });

  it('refuses the numbers that break the engine, by name', () => {
    for (const bad of [NaN, Infinity, -1]) {
      const club = withPark(league()[0]!, { ...legal, left: bad });
      expect(said(replaceClub(league(), 0, club)), String(bad)).toMatch(/park left/);
    }
    const fouled = withPark(league()[0]!, { ...legal, foul: NaN });
    expect(said(replaceClub(league(), 0, fouled))).toMatch(/park foul must be a number/);
  });

  it('refuses foul ground deep enough to rewrite the strikeout rate', () => {
    const club = withPark(league()[0]!, { ...legal, foul: FOUL_MAX + 0.5 });
    expect(said(replaceClub(league(), 0, club))).toMatch(/start being the strikeout rate/);
  });

  it('is not an object at all', () => {
    const club = { ...league()[0]!, park: 'Wrigley' as unknown as Park };
    expect(said(replaceClub(league(), 0, club))).toMatch(/park is not an object/);
  });
});

// -------------------------------------------------------------- the editor

describe('building one in the editor', () => {
  it('offers exactly the fields the validator requires, and no factor', () => {
    const keys = PARK_FIELDS.map((f) => f.key);
    expect(keys).toEqual(['name', 'left', 'center', 'right', 'foul']);
    // ⚠️ A power field here would be a second knob turning the same thing.
    expect(keys).not.toContain('power');
  });

  it('starts a named park neutral, so naming one changes nothing on its own', () => {
    const club = withParkField(bare(league()[0]!), 'name', 'The Sandlot');
    expect(club.park).toBeDefined();
    expect(parkPower(club.park)).toBeCloseTo(parkPower(undefined), 3);
    expect(said(replaceClub(league(), 0, club))).toBe('');
  });

  it('edits a fence and the factor follows, with nothing else to keep in step', () => {
    let club = withParkField(bare(league()[0]!), 'name', 'The Sandlot');
    const before = parkPower(club.park);
    club = withParkField(club, 'left', 310);
    club = withParkField(club, 'right', 305);
    expect(parkPower(club.park)).toBeGreaterThan(before);
    expect(said(replaceClub(league(), 0, club))).toBe('');
  });

  it('drops the whole block when the name goes, leaving no orphan fences', () => {
    let club = withParkField(bare(league()[0]!), 'name', 'The Sandlot');
    club = withParkField(club, 'left', 310);
    club = withParkField(club, 'name', '');
    expect(club.park).toBeUndefined();
    expect(said(replaceClub(league(), 0, club))).toBe('');
  });

  it('round-trips every shipped park through the document', () => {
    const back = JSON.parse(JSON.stringify(LEAGUE_AS_WRITTEN)) as Team[];
    for (let i = 0; i < back.length; i++) {
      expect(back[i]!.park).toEqual(LEAGUE_AS_WRITTEN[i]!.park);
    }
    expect(said(back)).toBe('');
  });
});

// ---------------------------------------------------- what it does in a game

describe('what a park does to a ball game', () => {
  const HOME = bare(LEAGUE_AS_WRITTEN[6]!);
  const AWAY = bare(LEAGUE_AS_WRITTEN[7]!);
  const SEEDS = Array.from({ length: 150 }, (_, i) => i + 1);

  const play = (home: Team, away: Team) => {
    let runs = 0;
    let hr = 0;
    let foulOuts = 0;
    let pas = 0;
    for (const s of SEEDS) {
      const { game, outcomes, foulOuts: fo } = simulateGame(s, 9, home, away);
      runs += game.homeState.runs + game.awayState.runs;
      foulOuts += fo;
      pas += outcomes.walk + outcomes.hit_by_pitch + outcomes.strikeout + outcomes.in_play;
      for (const line of Object.values(game.stats.bat)) hr += line.hr;
    }
    return {
      runs: runs / SEEDS.length / 2,
      hr: hr / SEEDS.length,
      foulOutPct: (foulOuts / pas) * 100,
    };
  };

  const BANDBOX: Park = { name: 'Bandbox', left: 305, center: 380, right: 305, foul: 1 };
  const CANYON: Park = { name: 'Canyon', left: 360, center: 425, right: 360, foul: 1 };

  it('a neutral park is the same object back — no copy, no drift', () => {
    const flat: Park = { name: 'Flat', left: 400, center: 400, right: 400, foul: 1 };
    expect(atPark(HOME, undefined)).toBe(HOME);
    // parkSize of a 400-foot bowl is 400, not NEUTRAL_SIZE, so this one is a
    // pitcher's park rather than a neutral one — which is the honest answer.
    expect(parkPower(flat)).toBeLessThan(1);
  });

  it('a bandbox out-scores a canyon by a margin worth noticing', () => {
    const small = play(withPark(HOME, BANDBOX), AWAY);
    const big = play(withPark(HOME, CANYON), AWAY);
    expect(small.runs).toBeGreaterThan(big.runs);
    expect(small.runs - big.runs).toBeGreaterThan(0.5);
    expect(small.hr).toBeGreaterThan(big.hr);
  });

  it('gives the building to BOTH clubs, so it is a scoreboard and not an edge', () => {
    const g = newGame(withPark(HOME, BANDBOX), AWAY);
    const f = parkPower(BANDBOX);
    expect(g.away.lineup[0]!.power).toBeCloseTo(AWAY.lineup[0]!.power * f, 10);
    expect(g.home.lineup[0]!.power).toBeCloseTo(HOME.lineup[0]!.power * f, 10);
  });

  it("is the HOME club's building — the visitors' park stays at home", () => {
    const g = newGame(HOME, withPark(AWAY, BANDBOX));
    expect(g.away.lineup[0]!.power).toBe(AWAY.lineup[0]!.power);
    expect(g.home.lineup[0]!.power).toBe(HOME.lineup[0]!.power);
  });

  it('reaches the bench, so a pinch hitter is not the one man playing elsewhere', () => {
    const g = newGame(withPark(HOME, BANDBOX), AWAY);
    expect(g.home.bench![0]!.power).toBeCloseTo(HOME.bench![0]!.power * parkPower(BANDBOX), 10);
  });

  it('leaves the arms alone — a lively park is the hitters, not a worse staff', () => {
    const g = newGame(withPark(HOME, BANDBOX), AWAY);
    expect(g.home.rotation).toEqual(HOME.rotation);
    expect(g.home.bullpen).toEqual(HOME.bullpen);
  });

  /**
   * ⚠️ THE ONE THAT WOULD ROT SILENTLY. atPark() runs on the way INTO a game
   * and the result lives only in that GameState. If anything ever wrote a
   * parked roster back to the club it came from, a season would compound the
   * same park a hundred and sixty-two times.
   */
  it('does not compound — the club it was given is untouched', () => {
    const club = withPark(HOME, BANDBOX);
    const before = club.lineup[0]!.power;
    for (let i = 0; i < 5; i++) simulateGame(i, 9, club, AWAY);
    expect(club.lineup[0]!.power).toBe(before);
    expect(newGame(club, AWAY).home.lineup[0]!.power).toBeCloseTo(
      before * parkPower(BANDBOX),
      10,
    );
  });

  /**
   * ⚠️ FOUL GROUND HAS TO REACH THE OUTCOME, NOT JUST THE DERIVATION. The bar
   * is threaded through SwingInput.foulPopAngle into caughtFoul(); before it
   * was, parkFoulAngle() existed and did nothing, and every measurement of it
   * was reading noise.
   */
  it('acreage in foul ground catches more pops, and the seats catch fewer', () => {
    const roomy = play(withPark(HOME, { ...BANDBOX, name: 'Acres', foul: 1.5 }), AWAY);
    const tight = play(withPark(HOME, { ...BANDBOX, name: 'Tight', foul: 0.5 }), AWAY);
    expect(roomy.foulOutPct).toBeGreaterThan(tight.foulOutPct);
  });
});

// ------------------------------------------------------ fouls and home runs

describe('fouls and home runs stay adequate', () => {
  const HOME = LEAGUE_AS_WRITTEN[6]!;
  const AWAY = LEAGUE_AS_WRITTEN[7]!;

  it('never catches a foul that is not a pop, in any park in the league', () => {
    for (const p of PARK_LIST) {
      const bar = parkFoulAngle(p);
      // A grounder down the line and an ordinary screamer into the seats are
      // never outs, however much room the catcher has.
      expect(caughtFoul(-40, bar), p.name).toBe(false);
      expect(caughtFoul(20, bar), p.name).toBe(false);
      expect(caughtFoul(60, bar), p.name).toBe(false);
      // ...and the top of the range always is one, however tight the seats.
      expect(caughtFoul(78, bar), p.name).toBe(true);
    }
  });

  it('holds the foul-out rate inside the band hit.ts tuned it in', () => {
    let foulOuts = 0;
    let pas = 0;
    for (let i = 0; i < 400; i++) {
      const home = LEAGUE_AS_WRITTEN[i % LEAGUE_AS_WRITTEN.length]!;
      const away = LEAGUE_AS_WRITTEN[(i + 7) % LEAGUE_AS_WRITTEN.length]!;
      if (home === away) continue;
      const { outcomes, foulOuts: fo } = simulateGame(i * 7919 + 13, 9, home, away);
      foulOuts += fo;
      pas += outcomes.walk + outcomes.hit_by_pitch + outcomes.strikeout + outcomes.in_play;
    }
    const pct = (foulOuts / pas) * 100;
    // hit.ts: real is about 2% of plate appearances, and past about 4% foul
    // outs start eating strikeouts that should have happened.
    expect(pct).toBeGreaterThan(0.8);
    expect(pct).toBeLessThan(4);
  });

  /**
   * ⚠️ EVERY HOME RUN IS OUTSIDE THE FENCE IT WAS HIT TOWARD, AND NOTHING ELSE
   * IS. This is the symmetric clamp in plot.ts, re-asserted against a park
   * rather than against the 400-foot bowl. Before parks, a ball drawn out of
   * the yard that the scoreboard called a double was "the worst thing this
   * replay can do"; a per-park fence gives that bug thirty new ways to happen.
   */
  it('draws every home run beyond its own fence and everything else short of it', () => {
    let homers = 0;
    let inPark = 0;
    for (const park of PARK_LIST) {
      for (const hit of battedBalls(6000)) {
        const p = place(hit, park);
        const fence = wallAt(hit.direction, park);
        expect(p.wallFt).toBeCloseTo(fence, 10);
        if (hit.outcome === 'home_run') {
          expect(p.distFt, `${park.name} at ${hit.direction.toFixed(0)}°`).toBeGreaterThan(fence);
          homers++;
        } else if (p.zone !== 'foul-ground') {
          expect(p.distFt, `${park.name} ${hit.outcome}`).toBeLessThanOrEqual(fence);
          inPark++;
        }
      }
    }
    // The assertions are worthless if the loop found nothing to assert on.
    expect(homers).toBeGreaterThan(1000);
    expect(inPark).toBeGreaterThan(20000);
  });

  /**
   * ⚠️ AND THE SHORT PARKS ACTUALLY PRODUCE SHORTER HOME RUNS. The clamp above
   * only says nothing is on the wrong side of the fence; this says the fence is
   * doing something. A league where every homer still read 400-odd feet would
   * pass every assertion above it.
   *
   * ⚠️ THE MARGIN IS TENS OF FEET, NOT HUNDREDS, AND THAT IS CORRECT PHYSICS. A
   * ball struck 430 feet travels 430 feet in any building; the fence only
   * changes where the ones that CAME UP SHORT are drawn, which is the 59% of
   * table home runs the note on Park in teams.ts counts. So the mean moves a
   * little and the FLOOR moves a lot, and the floor is the assertion that would
   * catch a fence being ignored.
   */
  it('reports shorter home runs in the small parks than in the deep ones', () => {
    const homers = (park: Park): number[] =>
      battedBalls(8000)
        .filter((h) => h.outcome === 'home_run')
        .map((h) => place(h, park).distFt);
    const small = homers(PARKS.NEM);
    const big = homers(PARKS.DEN);
    expect(mean(big) - mean(small)).toBeGreaterThan(8);
    // The cheapest home run in a 302-foot park is much cheaper than the
    // cheapest one in a 420-foot one — thirty-odd feet, measured.
    expect(Math.min(...big) - Math.min(...small)).toBeGreaterThan(20);
  });

  /**
   * ⚠️ THE BALL HAS TO BE ONE THE FLIGHT MODEL COULD NOT CARRY, or the test is
   * not testing the fence. A well-struck one clears a 302-foot porch by sixty
   * feet and is drawn at its own distance in every park, correctly. It is the
   * ball the table called a home run and the parabola landed on the warning
   * track that justOut() has to place, and THAT one belongs just over whatever
   * fence it was hit toward.
   */
  it('draws a home run it could not carry just over the fence it was hit toward', () => {
    const porch: Park = { name: 'Porch', left: 400, center: 400, right: 302, foul: 1 };
    // Flat and not hard: the parabola puts this on the track, not in the seats.
    const hit = {
      outcome: 'home_run' as const,
      timing: 'perfect' as const,
      pitchType: 'fastball' as const,
      isOut: false,
      isHit: true,
      platoon: 1,
      stance: 'normal' as const,
      clutchApplied: false,
      exitVelocity: 96,
      launchAngle: 14,
      direction: 45,
    };
    const short = place(hit, porch);
    const deep = place(hit, undefined);
    expect(short.distFt).toBeGreaterThan(302);
    expect(short.distFt).toBeLessThan(320);
    // The same swing in the 400-foot bowl has to be drawn out of a 400-foot
    // park, so it reads a hundred feet further — same ball, different building.
    expect(deep.distFt).toBeGreaterThan(400);
    expect(deep.distFt - short.distFt).toBeGreaterThan(90);
  });

  /**
   * ⚠️ THE UPGRADE HAS TO STAY REACHABLE IN THE SMALLEST PARKS. plot.ts clamps
   * every non-home-run to `fence - 8`, so in a 302-foot corner nothing in play
   * can reach a fixed 320-foot bar — the "threshold nothing can cross" failure
   * GAP_FT's own header describes, which is why the bar is a share of the fence.
   */
  it('can still stretch a single into a double in a 302-foot corner', () => {
    const porch: Park = { name: 'Porch', left: 400, center: 400, right: 302, foul: 1 };
    const hit = {
      outcome: 'single' as const,
      timing: 'good' as const,
      pitchType: 'fastball' as const,
      isOut: false,
      isHit: true,
      platoon: 1,
      stance: 'normal' as const,
      clutchApplied: false,
      exitVelocity: 104,
      launchAngle: 24,
      direction: 44,
    };
    const p = place(hit, porch);
    expect(p.distFt).toBeLessThan(320);
    expect(stretch('single', { ...p, inTheGap: true })).toBe('double');
    // ...and the neutral bowl is unchanged to the foot: 0.8 of 400 is 320.
    expect(stretch('single', { ...p, inTheGap: true, distFt: 319, wallFt: 400 })).toBe('single');
    expect(stretch('single', { ...p, inTheGap: true, distFt: 321, wallFt: 400 })).toBe('double');
  });

  it('a park-less game is bit-for-bit the game it always was', () => {
    // ⚠️ THE REGRESSION GUARD FOR EVERYTHING ABOVE. Every default in this
    // feature — wallAt(undefined), foulPopAngle omitted, park omitted — has to
    // add up to the engine as it was before parks existed.
    const a = simulateGame(4242, 9, bare(HOME), bare(AWAY));
    const b = simulateGame(4242, 9, bare(HOME), bare(AWAY));
    expect(a.game.homeState.runs).toBe(b.game.homeState.runs);
    expect(a.game.awayState.runs).toBe(b.game.awayState.runs);
    for (const hit of battedBalls(500)) {
      const p = place(hit);
      expect(p.wallFt).toBe(WALL_FT);
      // Which is the same answer the old fixed-wall code gave, by construction.
      expect(p.distFt).toBe(place(hit, undefined).distFt);
    }
  });
});

/**
 * A population of batted balls, spread across timing, power and location.
 *
 * ⚠️ resolveSwingSeeded RATHER THAN A SIMULATED GAME, and the difference
 * matters for what the placement tests can claim. A game's batted balls are
 * whatever two particular clubs happened to hit that afternoon; this walks the
 * swing space directly, so every park below is asked about the same population
 * — including the corners of it a nine-inning game rarely reaches.
 */
function battedBalls(n: number): HitResult[] {
  const out: HitResult[] = [];
  for (let i = 0; i < n; i++) {
    const hit = resolveSwingSeeded(
      {
        offsetMs: ((i % 25) - 12) * 2,
        pitchType: PITCHES[i % PITCHES.length]!,
        stats: { power: 0.8 + ((i * 7) % 11) * 0.09, contact: 1.1 },
        isPowerSwing: i % 3 === 0,
      },
      i * 7919 + 17,
    );
    if (hit.outcome !== 'strikeout') out.push(hit);
  }
  return out;
}

const PITCHES = ['fastball', 'curveball', 'slider', 'changeup', 'sinker'] as const;
