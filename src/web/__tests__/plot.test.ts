/**
 * The overhead plot. Every one of these guards a way the picture could
 * contradict the scoreboard, which is the only failure mode a replay has.
 */

import { describe, it, expect } from 'vitest';
import {
  plotBatted,
  overheadPoint,
  nearestFielder,
  chaseReach,
  runToFirstMs,
  throwMarginMs,
  raceTiming,
  hasPlayAtFirst,
  playCues,
  roleFor,
  coverFor,
  FIELDERS,
  WALL_FT,
} from '../plot.ts';
import { REPLAY_CUT_MS, REPLAY_HOLD_MS } from '../overhead.ts';
import { resolveSwingSeeded } from '../../core/hit.ts';
import type { Outcome } from '../../core/hitTables.ts';

const ALL_OUTCOMES: Outcome[] = [
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

/** Roll seeds until the wanted outcome shows up. Real rolls from the real engine. */
function find(want: Outcome, offsetMs = 20) {
  for (let seed = 1; seed < 8000; seed++) {
    const r = resolveSwingSeeded({ offsetMs, pitchType: 'fastball' }, seed);
    if (r.outcome === want) return r;
  }
  throw new Error(`no seed produced ${want}`);
}

const plotOf = (want: Outcome, offsetMs = 20) => {
  const h = find(want, offsetMs);
  return plotBatted(h.outcome, h.exitVelocity, h.launchAngle);
};

describe('the plot never contradicts the outcome', () => {
  it('puts a home run past the wall', () => {
    // offsetMs 0: no table gives a home run off a mistimed swing, so asking at
    // the default 20 finds no seed at all.
    expect(plotOf('home_run', 0).distFt).toBeGreaterThan(WALL_FT);
  });

  it('keeps a chopper in front of the plate', () => {
    // ground_out launches from -10°, and the range formula returns a NEGATIVE
    // number for a negative angle. Unguarded that plots the ball behind the
    // catcher, which is the bug this whole branch exists to not have.
    const p = plotOf('ground_out');
    expect(p.distFt).toBeGreaterThan(0);
    expect(p.distFt).toBeLessThan(260);
    expect(p.ground).toBe(true);
  });

  it('sends a triple deeper than a single', () => {
    // The roll term earns its place here. A triple launches at 8-18° and a
    // single at 5-25°, so on the range formula alone the triple — the harder,
    // flatter ball — plots SHORTER, and a gapper lands in shallow centre.
    expect(plotOf('triple').distFt).toBeGreaterThan(plotOf('single').distFt);
  });

  it('sends a popup up rather than out', () => {
    const pop = plotOf('popup');
    expect(pop.ground).toBe(false);
    expect(pop.distFt).toBeLessThan(plotOf('double').distFt);
  });
});

describe('the replay always fits the beat', () => {
  it('never asks for longer than the walk-up allows', () => {
    // The roguelike screen (web/main.ts) gives a replay DONE_MS + WALKUP_MS to
    // finish in, and it needs REPLAY_CUT_MS + hangMs + REPLAY_HOLD_MS to do it.
    // Asserted against the real constants rather than a copied number, because
    // the copied number is what went stale when the pacing was slowed down.
    const BEAT_MS = 1800 + 2000; // DONE_MS + WALKUP_MS
    const room = BEAT_MS - REPLAY_CUT_MS - REPLAY_HOLD_MS;
    for (let v = 40; v <= 130; v += 5) {
      for (let a = -12; a <= 80; a += 4) {
        const p = plotBatted('single', v, a);
        expect(p.hangMs).toBeGreaterThan(0);
        expect(p.hangMs).toBeLessThanOrEqual(room);
      }
    }
  });
});

describe('harder is further', () => {
  it('rewards the exit velocity the timing earned', () => {
    const soft = plotBatted('double', 80, 24);
    const crushed = plotBatted('double', 105, 24);
    expect(crushed.distFt).toBeGreaterThan(soft.distFt);
  });
});

describe('who goes after it', () => {
  const chaserFor = (distFt: number, dirDeg: number) => nearestFielder(distFt, dirDeg).num;

  it('sends the outfielder standing in that gap', () => {
    expect(chaserFor(300, -32)).toBe(7);
    expect(chaserFor(330, 2)).toBe(8);
    expect(chaserFor(300, 32)).toBe(9);
  });

  it('gives the comebacker to the pitcher and the slow roller to the catcher', () => {
    expect(chaserFor(62, 0)).toBe(1);
    expect(chaserFor(20, -10)).toBe(2);
  });

  it('splits the infield between short and second by which side it went', () => {
    expect(chaserFor(150, -20)).toBe(6);
    expect(chaserFor(150, 20)).toBe(4);
  });

  it('always names somebody, anywhere in fair territory', () => {
    // The loop has an Infinity seed in it. A NaN distance or an empty sweep
    // would return the pitcher by default and never be noticed in play.
    for (let d = 20; d <= 460; d += 20) {
      for (let a = -45; a <= 45; a += 5) {
        const f = nearestFielder(d, a);
        expect(FIELDERS).toContain(f);
      }
    }
  });
});

describe('the chase is rigged, and only here', () => {
  it('gets the fielder there on every out and on no hit', () => {
    for (const out of ['popup', 'ground_out', 'line_out'] as const) {
      expect(chaseReach(out)).toBe(1);
    }
    for (const hit of ['single', 'double', 'triple', 'home_run'] as const) {
      expect(chaseReach(hit)).toBeLessThan(1);
    }
  });

  it('leaves him further behind the further the ball got', () => {
    // A single should look like a play he almost made and a triple should not.
    expect(chaseReach('single')).toBeGreaterThan(chaseReach('double'));
    expect(chaseReach('double')).toBeGreaterThan(chaseReach('triple'));
  });
});

describe('the race to first', () => {
  it('gets the fast man down the line quicker', () => {
    expect(runToFirstMs(1.4)).toBeLessThan(runToFirstMs(1.0));
    expect(runToFirstMs(1.0)).toBeLessThan(runToFirstMs(0.6));
  });

  it('never lets the runner beat the ball to the infielder', () => {
    // The floor is what stops a burner arriving at first before the fielder
    // has touched the ball — main.ts clamps the throw's departure to the
    // catch, so if the run were shorter than the field-and-throw the picture
    // would show a ball teleporting to the bag.
    for (let s = 0.3; s <= 2.0; s += 0.05) {
      expect(runToFirstMs(s)).toBeGreaterThanOrEqual(850);
      expect(runToFirstMs(s)).toBeLessThanOrEqual(1900);
    }
  });

  it('makes the same out routine for a plodder and bang-bang for a burner', () => {
    // The whole point of phase 3. Outcome is identical; only the margin moves.
    expect(throwMarginMs(0.6)).toBeGreaterThan(throwMarginMs(1.0));
    expect(throwMarginMs(1.0)).toBeGreaterThan(throwMarginMs(1.4));
    expect(throwMarginMs(1.4)).toBeGreaterThan(0);
  });

  it('varies the gap the EYE sees, not just the millisecond count', () => {
    // The regression that shipped silently once. What reads on screen is the
    // distance between the runner and the bag, which is margin as a fraction
    // of his own trip — and a millisecond margin scaling with speed cancels
    // against a run time that also scales with speed. The first version moved
    // from 19.2% to 15.6% across the whole stat range: four pixels, invisible.
    const gap = (s: number) => throwMarginMs(s) / runToFirstMs(s);
    expect(gap(0.6)).toBeGreaterThan(gap(1.4) * 3);
    expect(gap(1.4)).toBeLessThan(0.1);
    expect(gap(0.6)).toBeGreaterThan(0.2);
  });

  it('keeps the margin positive at absurd speeds', () => {
    // An unclamped fraction goes negative past the fast end, which would flip
    // an out into a safe call from a stat line no item should be able to reach.
    for (const s of [0, 0.1, 2, 3, 99]) {
      expect(throwMarginMs(s)).toBeGreaterThan(0);
    }
  });

  it('only draws a throw when an infielder fielded it on the ground', () => {
    const ground = plotBatted('ground_out', 78, -2);
    const fly = plotBatted('double', 98, 24);
    const infielder = nearestFielder(140, -18);
    const outfielder = nearestFielder(300, -30);

    expect(hasPlayAtFirst(ground, infielder)).toBe(true);
    expect(hasPlayAtFirst(fly, outfielder)).toBe(false);
    // A fly ball an infielder catches is out on the catch — no race, no throw.
    expect(hasPlayAtFirst(fly, infielder)).toBe(false);
  });
});

describe('the picture never calls it the other way', () => {
  // The camera cuts at 220ms, so fieldedAt is 220 + the plot's hang time.
  const CUT = 220;
  const fieldedFor = (exitVelocity: number) => {
    const p = plotBatted('ground_out', exitVelocity, -2);
    return CUT + p.hangMs;
  };

  it('lands the throw before the runner on every out, at every speed', () => {
    // The case that forced raceTiming() to exist: a scorched grounder to a
    // deep infielder is not fielded until ~930ms, a throw needs 140 more, and
    // an unstretched 1.4 runner is standing on the bag at 1000. No margin
    // fixes that — the runner gets stretched instead.
    for (let s = 0.4; s <= 1.8; s += 0.05) {
      for (let ev = 45; ev <= 120; ev += 5) {
        const { runMs, throwMs } = raceTiming({ speed: s, safe: false, play: true, fieldedAt: fieldedFor(ev) });
        expect(throwMs).not.toBeNull();
        expect(throwMs!).toBeLessThan(runMs);
      }
    }
  });

  it('lands the throw after the runner on every hit, at every speed', () => {
    for (let s = 0.4; s <= 1.8; s += 0.05) {
      for (let ev = 45; ev <= 120; ev += 5) {
        const { runMs, throwMs } = raceTiming({ speed: s, safe: true, play: true, fieldedAt: fieldedFor(ev) });
        expect(throwMs!).toBeGreaterThan(runMs);
      }
    }
  });

  it('never throws the ball before the fielder has it', () => {
    for (let s = 0.4; s <= 1.8; s += 0.1) {
      for (const safe of [true, false]) {
        const fielded = fieldedFor(115);
        const { throwMs } = raceTiming({ speed: s, safe, play: true, fieldedAt: fielded });
        expect(throwMs!).toBeGreaterThan(fielded);
      }
    }
  });

  it('has no throw at all when there is no play at first', () => {
    expect(raceTiming({ speed: 1, safe: true, play: false, fieldedAt: 600 }).throwMs).toBeNull();
  });

  it('still keeps the burner closer than the plodder after stretching', () => {
    // Stretching the runner must not flatten the drama back out — that would
    // undo the fix above by another route.
    const fielded = fieldedFor(78);
    const slow = raceTiming({ speed: 0.6, safe: false, play: true, fieldedAt: fielded });
    const fast = raceTiming({ speed: 1.4, safe: false, play: true, fieldedAt: fielded });
    const gap = (r: { runMs: number; throwMs: number | null }) =>
      (r.runMs - r.throwMs!) / r.runMs;
    expect(gap(slow)).toBeGreaterThan(gap(fast) * 2);
  });
});

describe('everybody has a job', () => {
  const at = (num: number) => FIELDERS.find((f) => f.num === num)!;

  it('sends the first baseman to first, and the pitcher when he cannot', () => {
    // The play that used to look wrong: a grounder to the first baseman left
    // nobody on the bag and the throw arrived at empty dirt.
    expect(coverFor(0, at(6))).toBe(3);
    expect(coverFor(0, at(3))).toBe(1);
  });

  it('covers second with the middle infielder who is not chasing', () => {
    // A shortstop covering the bag on his own ground ball is the classic
    // version of getting this backwards.
    expect(coverFor(1, at(6))).toBe(4);
    expect(coverFor(1, at(5))).toBe(4);
    expect(coverFor(1, at(4))).toBe(6);
    expect(coverFor(1, at(3))).toBe(6);
  });

  it('never gives one man two jobs', () => {
    for (const chaser of FIELDERS) {
      const roles = FIELDERS.map((f) => roleFor(f, chaser, true));
      expect(roles.filter((r) => r === 'chase')).toHaveLength(1);
      expect(roles.filter((r) => r === 'cover-first').length).toBeLessThanOrEqual(1);
      expect(roles.filter((r) => r === 'cover-second').length).toBeLessThanOrEqual(1);
    }
  });

  it('leaves the covers unassigned to the chaser himself', () => {
    // roleFor checks 'chase' first, so a chaser who is also the nominal
    // cover keeps chasing — otherwise the ball would have nobody going to it.
    for (const chaser of FIELDERS) {
      expect(roleFor(chaser, chaser, true)).toBe('chase');
    }
  });

  it('assigns nobody to second unless there is a double play', () => {
    const roles = FIELDERS.map((f) => roleFor(f, at(6), false));
    expect(roles).not.toContain('cover-second');
  });
});

describe('the double play', () => {
  const fielded = 220 + plotBatted('ground_out', 80, -2).hangMs;

  it('stops at second on the way to first', () => {
    const { relayMs, throwMs, runMs } = raceTiming({
      speed: 1,
      safe: false,
      play: true,
      fieldedAt: fielded,
      doublePlay: true,
    });
    expect(relayMs).not.toBeNull();
    expect(relayMs!).toBeGreaterThan(fielded);
    expect(throwMs!).toBeGreaterThan(relayMs!);
    expect(runMs).toBeGreaterThan(throwMs!);
  });

  it('still beats the batter to first at every speed', () => {
    // The longest sequence in the game — two throws — against the fastest
    // runner. The stretch has more work to do here than anywhere else.
    for (let s = 0.4; s <= 1.8; s += 0.05) {
      const { throwMs, runMs } = raceTiming({
        speed: s,
        safe: false,
        play: true,
        fieldedAt: fielded,
        doublePlay: true,
      });
      expect(throwMs!).toBeLessThan(runMs);
    }
  });

  it('costs the defence real time against a runner quick enough to matter', () => {
    // Against a plodder the relay is free: he is so slow that the margin sets
    // the throw either way and both land at the same instant. The extra leg
    // only shows up when the runner is fast enough to be pressing it, which is
    // also the only time a viewer could tell.
    const fast = { speed: 1.4, safe: false, play: true, fieldedAt: fielded };
    const one = raceTiming(fast);
    const two = raceTiming({ ...fast, doublePlay: true });
    expect(two.throwMs!).toBeGreaterThan(one.throwMs!);
    expect(two.runMs).toBeGreaterThan(one.runMs);
  });
});

describe('the play makes noise all the way through', () => {
  const CUT = 220;
  const cuesFor = (
    outcome: Outcome,
    ev: number,
    ang: number,
    safe: boolean,
    doublePlay = false,
  ) => {
    const plot = plotBatted(outcome, ev, ang);
    const fieldedAt = CUT + plot.hangMs;
    const race = raceTiming({ speed: 1, safe, play: plot.ground, fieldedAt, doublePlay });
    return playCues({ plot, outcome, safe, cutMs: CUT, fieldedAt, race });
  };
  const at = (cs: ReturnType<typeof cuesFor>, k: string) => cs.find((c) => c.key === k)?.at;

  it('never makes a sound before the ball is fielded', () => {
    // Barring the crowd, which is reacting to the flight and is supposed to
    // come first. Everything else is a glove or an umpire and cannot precede
    // the ball arriving.
    const cs = cuesFor('ground_out', 80, -2, false);
    const fielded = at(cs, 'field')!;
    for (const c of cs) {
      if (c.key === 'carry') continue;
      expect(c.at).toBeGreaterThanOrEqual(fielded);
    }
  });

  it('pops the glove before the umpire calls it', () => {
    const cs = cuesFor('ground_out', 80, -2, false);
    expect(at(cs, 'catch')!).toBeLessThan(at(cs, 'call')!);
  });

  it('runs a double play glove, glove, call, in that order', () => {
    const cs = cuesFor('ground_out', 80, -2, false, true);
    expect(at(cs, 'field')!).toBeLessThan(at(cs, 'relay')!);
    expect(at(cs, 'relay')!).toBeLessThan(at(cs, 'catch')!);
    expect(at(cs, 'catch')!).toBeLessThan(at(cs, 'call')!);
  });

  it('gets the crowd up while a deep fly is still in the air', () => {
    const cs = cuesFor('home_run', 108, 30, true);
    expect(at(cs, 'carry')!).toBeLessThan(at(cs, 'gone')!);
  });

  it('leaves a routine popup alone', () => {
    // No crowd on a 90ft popup — the swell is for balls that might leave.
    const cs = cuesFor('popup', 66, 62, false);
    expect(at(cs, 'carry')).toBeUndefined();
  });

  it('calls a caught fly without waiting for a throw', () => {
    const cs = cuesFor('line_out', 96, 15, false);
    expect(at(cs, 'call')).toBeDefined();
    expect(at(cs, 'catch')).toBeUndefined();
    expect(at(cs, 'relay')).toBeUndefined();
  });

  it('says something on every outcome', () => {
    // A silent branch is the bug this whole section exists to prevent, and it
    // is invisible in play — you cannot see a sound that did not happen.
    for (const o of ALL_OUTCOMES) {
      if (o === 'strikeout' || o === 'foul') continue;
      const cs = cuesFor(o, 90, o === 'ground_out' ? -2 : 20, o !== 'popup' && o !== 'line_out');
      expect(cs.length).toBeGreaterThan(0);
    }
  });
});

describe('the camera', () => {
  const home = { x: 320, y: 436 };

  it('puts an early swing in left and a late one in right', () => {
    // Restating the sign convention as a test rather than as a second comment.
    expect(overheadPoint(200, -30, home, 1).x).toBeLessThan(home.x);
    expect(overheadPoint(200, 30, home, 1).x).toBeGreaterThan(home.x);
  });

  it('sends a ball up the middle straight up the screen', () => {
    const p = overheadPoint(200, 0, home, 1);
    expect(p.x).toBeCloseTo(home.x);
    expect(p.y).toBe(home.y - 200);
  });

  it('keeps a ball to the wall on the canvas', () => {
    for (const d of [-45, -20, 0, 20, 45]) {
      const p = overheadPoint(WALL_FT + 60, d, home, 0.92);
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(640);
      expect(p.y).toBeGreaterThan(0);
    }
  });
});

describe('the wall', () => {
  // ⚠️ THE REGRESSION THIS FILE EXISTS FOR. Before the symmetric clamp, 8.5%
  // of balls in play were drawn landing in the seats and scored as something
  // else — including 258 line outs per 20,000 that an outfielder ran down
  // beyond the fence. Every outcome, every velocity the engine can produce,
  // every angle.
  const OUTCOMES = ['ground_out', 'line_out', 'popup', 'single', 'double', 'triple'] as const;

  it('never plots anything but a home run past the wall', () => {
    for (const outcome of OUTCOMES) {
      for (let ev = 60; ev <= 130; ev += 5) {
        for (let angle = -10; angle <= 80; angle += 5) {
          const p = plotBatted(outcome, ev, angle);
          expect(p.distFt, `${outcome} ${ev}mph ${angle}deg`).toBeLessThanOrEqual(WALL_FT);
        }
      }
    }
  });

  it('always plots a home run past the wall, however badly it was struck', () => {
    for (let ev = 60; ev <= 130; ev += 5) {
      for (let angle = 10; angle <= 80; angle += 5) {
        expect(plotBatted('home_run', ev, angle).distFt).toBeGreaterThan(WALL_FT);
      }
    }
  });
});
