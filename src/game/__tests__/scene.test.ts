/**
 * THE SCENE, and the two things about it that would rot.
 *
 *  1. LEVERAGE MEANS WHAT IT SAYS. "One swing changes who is winning" is a rule
 *     with edges — bases loaded down four IS a moment and nobody on down two is
 *     NOT — and a version of it that quietly drifted to "late and close" would
 *     still look right on every screen.
 *  2. THE PACING BILL IS PAID. Every scene gets a caption because captions are
 *     free; only some get time. A tier table where the routine plays crept above
 *     zero would add most of a second to every plate appearance in the game and
 *     nothing on screen would say so.
 */
import { describe, expect, it } from 'vitest';
import {
  deficitOf,
  isHighLeverage,
  momentLine,
  sceneFor,
  sceneForTake,
  situationOf,
  TIER_HOLD_MS,
  LATE_INNING,
  type Situation,
  type SceneFacts,
} from '../scene.ts';
import { newGame } from '../game.ts';
import { LEAGUE_AS_WRITTEN } from '../teams.ts';
import type { Bases } from '../../core/inning.ts';
import { EMPTY_BASES } from '../../core/inning.ts';
import type { Placement } from '../placement.ts';

const runner = { name: 'a runner', speed: 1 };
/** Bases from a list of bag numbers — on([1]) is a man on second. */
const on = (bags: number[]): Bases =>
  [0, 1, 2].map((i) => (bags.includes(i) ? runner : null)) as unknown as Bases;

const sit = (over: Partial<Situation> = {}): Situation => ({
  inning: 8,
  regulation: 9,
  outs: 1,
  bases: EMPTY_BASES,
  us: 3,
  them: 3,
  ...over,
});

const place = (over: Partial<Placement> = {}): Placement => ({
  distFt: 340,
  dirDeg: -18,
  zone: 'left-center',
  gapFt: 110,
  fielderNum: 7,
  inTheGap: true,
  wallFt: 400,
  ...over,
});

const facts = (over: Partial<SceneFacts> = {}): SceneFacts => ({
  outcome: 'single',
  placement: place(),
  verdict: null,
  runs: 0,
  error: false,
  doublePlay: false,
  exitVelocity: 92,
  before: sit({ inning: 3 }),
  gameOver: false,
  walkOff: false,
  ...over,
});

// ------------------------------------------------------------- leverage

describe('when the game turns on one swing', () => {
  it('is never early, however tight the game', () => {
    for (let i = 1; i < LATE_INNING; i++) {
      expect(isHighLeverage(sit({ inning: i, us: 3, them: 3 })), `inning ${i}`).toBe(false);
    }
    expect(isHighLeverage(sit({ inning: LATE_INNING }))).toBe(true);
  });

  it('scales with the men on base, which is the whole rule', () => {
    // Down two, nobody on: two swings away, so not a moment.
    expect(isHighLeverage(sit({ us: 1, them: 3, bases: EMPTY_BASES }))).toBe(false);
    // Down two with a man on: the tying run is at the plate. It is.
    expect(isHighLeverage(sit({ us: 1, them: 3, bases: on([0]) }))).toBe(true);
    // Bases loaded down four — one swing ties it, and the rule says so with no
    // special case for the grand slam.
    expect(isHighLeverage(sit({ us: 0, them: 4, bases: on([0, 1, 2]) }))).toBe(true);
    // ...but down five with them loaded is not.
    expect(isHighLeverage(sit({ us: 0, them: 5, bases: on([0, 1, 2]) }))).toBe(false);
  });

  /**
   * ⚠️ SYMMETRY IS A DESIGN DECISION, NOT AN ACCIDENT OF THE ARITHMETIC. A
   * one-run lead in the ninth with a man aboard is the same moment from both
   * dugouts, and the screen must not be able to say it only counts when you
   * are the one hitting.
   */
  it('is the same moment for the side that is ahead', () => {
    const behind = sit({ inning: 9, us: 3, them: 4, bases: on([1]) });
    const ahead = sit({ inning: 9, us: 4, them: 3, bases: on([1]) });
    expect(isHighLeverage(behind)).toBe(true);
    expect(isHighLeverage(ahead)).toBe(true);
    expect(deficitOf(behind)).toBe(1);
    expect(deficitOf(ahead)).toBe(-1);
  });

  it('treats extra innings as late in a season of any length', () => {
    // A seven-inning game: the eighth is extras and must count.
    expect(isHighLeverage(sit({ inning: 8, regulation: 7, us: 2, them: 2 }))).toBe(true);
    // ...and the seventh is its ninth, so it counts too.
    expect(isHighLeverage(sit({ inning: 7, regulation: 7, us: 2, them: 2 }))).toBe(true);
    expect(isHighLeverage(sit({ inning: 3, regulation: 7, us: 2, them: 2 }))).toBe(false);
  });

  it('reads a real game state from the batting side’s point of view', () => {
    const g = newGame(LEAGUE_AS_WRITTEN[0]!, LEAGUE_AS_WRITTEN[1]!);
    const home = situationOf(g, 'home');
    const away = situationOf(g, 'away');
    expect(home.us).toBe(g.homeState.runs);
    expect(home.them).toBe(g.awayState.runs);
    expect(away.us).toBe(g.awayState.runs);
    // The two deficits cancel. Written as a sum rather than a negation because
    // a 0-0 game makes one of them -0, and Object.is says -0 is not 0.
    expect(deficitOf(home) + deficitOf(away)).toBe(0);
  });
});

describe('the card that announces the moment', () => {
  it('says nothing at all when there is nothing to announce', () => {
    expect(momentLine(sit({ inning: 2 }))).toBeNull();
    expect(momentLine(sit({ us: 0, them: 9 }))).toBeNull();
  });

  it('names the tying run when the batting side is behind', () => {
    expect(momentLine(sit({ inning: 9, us: 2, them: 3, bases: on([1]) }))).toMatch(
      /TYING RUN IN SCORING POSITION/,
    );
    expect(momentLine(sit({ inning: 9, us: 2, them: 3, bases: EMPTY_BASES }))).toMatch(
      /TYING RUN AT THE PLATE/,
    );
  });

  it('names the lead when they are defending one', () => {
    expect(momentLine(sit({ inning: 9, us: 4, them: 3, bases: on([1]) }))).toMatch(/1-RUN LEAD/);
  });

  it('calls extras extras', () => {
    expect(momentLine(sit({ inning: 10, regulation: 9, us: 3, them: 3 }))).toMatch(/^EXTRAS/);
    expect(momentLine(sit({ inning: 9, us: 3, them: 3 }))).toMatch(/^9TH/);
  });

  /**
   * ⚠️ NEVER A PERCENTAGE. The card exists to create tension and a win
   * probability relieves it — the game has already told you how this goes.
   */
  it('describes the situation and never the odds', () => {
    for (const inning of [7, 8, 9, 10]) {
      for (const bags of [[], [0], [1, 2], [0, 1, 2]]) {
        const line = momentLine(sit({ inning, us: 3, them: 3, bases: on(bags) }));
        if (line) expect(line).not.toMatch(/%|CHANCE|ODDS/);
      }
    }
  });
});

// -------------------------------------------------------------- the scenes

describe('a scene for every kind of hit', () => {
  it('gives one to every outcome, so the screen is never blank', () => {
    const every = [
      'single', 'double', 'triple', 'home_run',
      'ground_out', 'line_out', 'popup', 'foul_out', 'strikeout',
    ] as const;
    for (const outcome of every) {
      const s = sceneFor(facts({ outcome }));
      expect(s.title, outcome).toBeTruthy();
      expect(s.title.length, outcome).toBeLessThan(24);
    }
  });

  it('scales a home run by what it was worth', () => {
    const solo = sceneFor(facts({ outcome: 'home_run', runs: 1 }));
    const two = sceneFor(facts({ outcome: 'home_run', runs: 2 }));
    const three = sceneFor(facts({ outcome: 'home_run', runs: 3 }));
    const slam = sceneFor(facts({ outcome: 'home_run', runs: 4 }));
    expect(solo.title).toBe('HOME RUN');
    expect(two.title).toBe('TWO-RUN SHOT');
    expect(three.title).toBe('THREE-RUN SHOT');
    expect(slam.title).toBe('GRAND SLAM');
    expect(slam.hold).toBeGreaterThan(solo.hold);
    // The distance is on the card, because that is what makes it THIS homer.
    expect(solo.detail).toMatch(/\d+ FEET/);
  });

  it('puts the walk-off above everything else on the list', () => {
    const s = sceneFor(facts({ outcome: 'single', runs: 1, gameOver: true, walkOff: true }));
    expect(s.title).toMatch(/WALK-OFF/);
    expect(s.tier).toBe('huge');
    // A slam that ends it is a walk-off first, which is what the room shouts.
    const slam = sceneFor(facts({ outcome: 'home_run', runs: 4, gameOver: true, walkOff: true }));
    expect(slam.title).toBe('WALK-OFF HOME RUN');
    expect(slam.hold).toBeGreaterThan(sceneFor(facts({ outcome: 'home_run', runs: 4 })).hold);
  });

  it('tells a gap double from a wall ball from an ordinary one', () => {
    expect(sceneFor(facts({ outcome: 'double', placement: place({ inTheGap: true }) })).title)
      .toBe('INTO THE GAP');
    expect(sceneFor(facts({ outcome: 'double', placement: place({ zone: 'wall' }) })).title)
      .toBe('OFF THE WALL');
    expect(sceneFor(facts({ outcome: 'double', placement: place({ inTheGap: false, zone: 'left' }) })).title)
      .toBe('DOUBLE');
  });

  it('gives the robbery to the defence and says where it happened', () => {
    const s = sceneFor(facts({ outcome: 'line_out', verdict: 'robbed' }));
    expect(s.title).toBe('ROBBED');
    expect(s.tier).toBe('big');
  });

  /**
   * ⚠️ AN OUT IN A BIG SPOT IS A SCENE TOO. A caption that only ever appears
   * when you succeed is a scoreboard, not a broadcast — half of what makes a
   * moment land is that it could have gone the other way.
   */
  it('marks the out that got them out of it', () => {
    const jam = sit({ inning: 9, us: 3, them: 3, bases: on([1, 2]), outs: 2 });
    const quiet = sit({ inning: 2 });
    expect(sceneFor(facts({ outcome: 'ground_out', before: jam })).leverage).toBe(true);
    expect(sceneFor(facts({ outcome: 'ground_out', before: jam })).title).toBe('OUT OF THE JAM');
    expect(sceneFor(facts({ outcome: 'ground_out', before: jam })).tier).toBe('solid');
    expect(sceneFor(facts({ outcome: 'ground_out', before: quiet })).tier).toBe('routine');
  });

  /**
   * ⚠️ A CLOSE GAME IS NOT A JAM. This branch used to fire on any out at high
   * leverage, which measured at 10.9% of every ball in play — six a game, more
   * often than a home run — and a caption that common stops marking anything.
   */
  it('leaves an ordinary out alone when nobody is on to be stranded', () => {
    const tightButEmpty = sit({ inning: 9, us: 3, them: 3, bases: EMPTY_BASES });
    expect(isHighLeverage(tightButEmpty)).toBe(true);
    const s = sceneFor(facts({ outcome: 'ground_out', before: tightButEmpty }));
    expect(s.title).toBe('GROUND OUT');
    expect(s.tier).toBe('routine');
    expect(s.hold).toBe(0);
  });

  it('gives the hit that delivers in a big spot its own words', () => {
    const jam = sit({ inning: 9, us: 2, them: 3, bases: on([1]) });
    const s = sceneFor(facts({ outcome: 'single', runs: 1, before: jam }));
    expect(s.title).toBe('HE DELIVERS');
    expect(s.tier).toBe('big');
    expect(s.leverage).toBe(true);
    // ...and the same hit in the second inning is an ordinary RBI single.
    const quiet = sceneFor(facts({ outcome: 'single', runs: 1, before: sit({ inning: 2 }) }));
    expect(quiet.title).toBe('RBI SINGLE');
    expect(quiet.hold).toBeLessThan(s.hold);
  });

  it('reuses the play-by-play’s own words for where it went', () => {
    const s = sceneFor(facts({ outcome: 'home_run', placement: place({ zone: 'left-center' }) }));
    expect(s.detail).toContain('THE LEFT-CENTER GAP');
  });

  it('survives a play with no placement at all', () => {
    for (const outcome of ['single', 'double', 'home_run', 'ground_out'] as const) {
      const s = sceneFor(facts({ outcome, placement: null }));
      expect(s.title, outcome).toBeTruthy();
      expect(s.detail, outcome).not.toMatch(/undefined|NaN/);
    }
  });
});

// ------------------------------------------------------------- the pacing

describe('the pacing bill', () => {
  /**
   * ⚠️ THE CONSTRAINT THE WHOLE FILE IS BUILT AROUND. overhead.ts's note on
   * FOUL_HOLD_MS is the standing warning: the mode's premise is that a season
   * fits in an afternoon, and adding half a second to every ball in play is
   * exactly how that quietly stops being true.
   */
  it('charges nothing for a routine play', () => {
    expect(TIER_HOLD_MS.routine).toBe(0);
    for (const outcome of ['ground_out', 'line_out', 'popup', 'single'] as const) {
      expect(sceneFor(facts({ outcome })).hold, outcome).toBe(0);
    }
  });

  it('still gives a routine play a caption, because captions are free', () => {
    const s = sceneFor(facts({ outcome: 'ground_out' }));
    expect(s.hold).toBe(0);
    expect(s.title).toBe('GROUND OUT');
  });

  it('spends more the bigger the moment, and never the other way round', () => {
    expect(TIER_HOLD_MS.routine).toBeLessThan(TIER_HOLD_MS.solid);
    expect(TIER_HOLD_MS.solid).toBeLessThan(TIER_HOLD_MS.big);
    expect(TIER_HOLD_MS.big).toBeLessThan(TIER_HOLD_MS.huge);
  });

  /**
   * The whole point, in one number: what a scene costs an AVERAGE plate
   * appearance. Most balls in play are outs and singles, so a table that is
   * generous to the big plays can still be nearly free overall — and this is
   * the assertion that fails if it stops being.
   */
  it('costs an average ball in play almost nothing', () => {
    // Roughly the real mix of what a ball in play turns into.
    const mix: [SceneFacts['outcome'], number][] = [
      ['ground_out', 26], ['line_out', 10], ['popup', 8], ['foul_out', 2],
      ['single', 22], ['double', 7], ['triple', 1], ['home_run', 4],
    ];
    let ms = 0;
    let n = 0;
    for (const [outcome, weight] of mix) {
      ms += sceneFor(facts({ outcome })).hold * weight;
      n += weight;
    }
    const perBall = ms / n;
    expect(perBall).toBeLessThan(120);
  });
});

/**
 * ⚠️ THE AT-BAT THAT ENDS WITHOUT A BALL IN PLAY. Before sceneForTake() these
 * produced NO caption at all — main.ts called sceneFor() on `in_play` and
 * passed null for everything else — so a strikeout, a walk and a plunking, about
 * a third of every plate appearance in the game, went past with nothing on the
 * screen. Zane, playing the mound: "NO STRIKEOUT PROMPT ON SCREEN."
 */
describe('the caption for a strikeout, a walk and a plunking', () => {
  const quiet = sit({ inning: 2, us: 0, them: 0, bases: EMPTY_BASES });
  const jam = sit({ inning: 9, outs: 2, us: 3, them: 4, bases: on([0, 1]) });

  it('always says something — a caption is never empty', () => {
    for (const kind of ['strikeout', 'walk', 'hit_by_pitch'] as const) {
      for (const before of [quiet, jam]) {
        const s = sceneForTake({ kind, swinging: true, runs: 0, before, walkOff: false });
        expect(s.title, kind).toBeTruthy();
        expect(s.hold, kind).toBe(TIER_HOLD_MS[s.tier]);
      }
    }
  });

  it('tells going down swinging from going down looking', () => {
    const swung = sceneForTake({ kind: 'strikeout', swinging: true, runs: 0, before: quiet, walkOff: false });
    const looked = sceneForTake({ kind: 'strikeout', swinging: false, runs: 0, before: quiet, walkOff: false });
    expect(swung.detail).not.toBe(looked.detail);
  });

  it('makes a punch-out in a jam a bigger scene than one in the second', () => {
    const quietK = sceneForTake({ kind: 'strikeout', swinging: true, runs: 0, before: quiet, walkOff: false });
    const jamK = sceneForTake({ kind: 'strikeout', swinging: true, runs: 0, before: jam, walkOff: false });
    expect(quietK.tier).toBe('routine');
    expect(jamK.hold).toBeGreaterThan(quietK.hold);
    expect(jamK.leverage).toBe(true);
  });

  it('says a run scored when the bases were loaded', () => {
    const forced = sceneForTake({
      kind: 'walk',
      swinging: false,
      runs: 1,
      before: sit({ bases: on([0, 1, 2]) }),
      walkOff: false,
    });
    expect(forced.detail).toContain('RUN SCORES');
    expect(forced.tier).toBe('big');
  });

  it('lets a walk-off outrank everything, including how it happened', () => {
    const s = sceneForTake({ kind: 'walk', swinging: false, runs: 1, before: jam, walkOff: true });
    expect(s.tier).toBe('huge');
    // The longest beat in the game, same as sceneFor's walk-off arm.
    expect(s.hold).toBeGreaterThan(TIER_HOLD_MS.huge);
  });

  /**
   * The same pacing bill sceneFor() is held to. A strikeout is the single most
   * common way a plate appearance ends, so a tier that crept up here would cost
   * more time than any ball in play.
   */
  it('keeps the ordinary strikeout free', () => {
    const s = sceneForTake({ kind: 'strikeout', swinging: true, runs: 0, before: quiet, walkOff: false });
    expect(s.hold).toBe(0);
  });
});
