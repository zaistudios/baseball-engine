import { describe, expect, it } from 'vitest';
import { battedAt, radiusAt, nearness, RELEASE_DY, type Batted } from '../flight.ts';
import { barrelOf, poseAt, travelMs, CONTACT_POSE, MIN_TRAVEL_MS, MAX_TRAVEL_MS } from '../swing.ts';
import { overheadPoint } from '../plot.ts';
import { resolveSwingSeeded, FOUL_MAX_DEG } from '../../core/hit.ts';
import type { SwingInput } from '../../core/hit.ts';

/** Roughly where the barrel crosses: middle of the zone, a shade above the plate. */
const CONTACT = { x: 3.4, y: -47.4 };

const liner = (direction: number): Batted => ({
  exitVelocity: 98,
  launchAngle: 14,
  direction,
});

/**
 * THE ONE THAT WILL BREAK SILENTLY.
 *
 * The camera cuts 300ms after the ball leaves the bat and the two pictures are
 * of the same batted ball. If the at-bat view sends it to screen-left and the
 * overhead lands it in right field, every test in the project still passes and
 * the feature is worse than not having been built. `direction` is in field
 * degrees and hit.ts has ALREADY signed it for the batter's hand, so the only
 * thing that can go wrong is this file's own convention — or someone applying
 * the hand a second time.
 */
describe('the ball leaves the way the overhead is about to show it going', () => {
  const home = { x: 200, y: 300 };
  /**
   * Struck on the plate's centre line, so what is being measured is the
   * DIRECTION and nothing else. From the barrel's real x the perspective pulls
   * the ball toward the vanishing point as it recedes, which is a second
   * movement on the same axis and would make 0° look like a pull.
   */
  const CENTRED = { x: 0, y: CONTACT.y };

  for (const deg of [-42, -25, -8, 0, 8, 25, 42]) {
    it(`sends ${deg}° the same way overheadPoint() does`, () => {
      const here = battedAt(liner(deg), CENTRED, 120)!;
      const there = overheadPoint(300, deg, home, 0.5);
      expect(Math.sign(here.x - CENTRED.x)).toBe(Math.sign(there.x - home.x));
    });
  }

  /**
   * ⚠️ BOTH HANDS, THROUGH THE ENGINE, not through a hand-written direction.
   * sprayDirection() flips the sign for a left-hander — `batterHand === 'L' ? -
   * pulled : pulled` — so an early swing pulls to opposite fields. What has to
   * hold is that this file is BLIND to the hand: it draws whatever degrees the
   * verdict gives it, and the overhead does the same, so the two agree by
   * construction. A hand applied here would mirror every left-hander.
   */
  for (const bats of ['L', 'R'] as const) {
    it(`agrees with the overhead on a ${bats}-handed hitter's real swing`, () => {
      const input: SwingInput = {
        // Early, so the ball is genuinely pulled and the sign is not a coin toss.
        offsetMs: -40,
        pitchType: 'fastball',
        location: 'middle',
        stats: { contact: 1, power: 1, speed: 1, vision: 1, clutch: 1 },
        batterHand: bats,
        pitcherHand: 'R',
      };
      let checked = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const hit = resolveSwingSeeded(input, seed);
        if (hit.timing === 'miss' || hit.exitVelocity === 0 || hit.direction === 0) continue;
        checked++;
        const here = battedAt(hit, CENTRED, 90)!;
        const there = overheadPoint(300, hit.direction, home, 0.5);
        expect(Math.sign(here.x - CENTRED.x)).toBe(Math.sign(there.x - home.x));
      }
      expect(checked).toBeGreaterThan(10);
    });
  }
});

/**
 * S2: the contact point is the pose the engine GRADED, not one re-derived from
 * a constant that happens to agree today.
 */
describe('the contact point comes off the graded pose', () => {
  it('holds the contact pose at every bat speed in the game, not just the base one', () => {
    for (const power of [0.65, 1.0, 1.2, 1.7]) {
      const travel = travelMs(power);
      expect(poseAt(travel, travel)).toEqual(CONTACT_POSE);
    }
    // And at the clamps, which is where a table change would show first.
    expect(poseAt(MIN_TRAVEL_MS, MIN_TRAVEL_MS)).toEqual(CONTACT_POSE);
    expect(poseAt(MAX_TRAVEL_MS, MAX_TRAVEL_MS)).toEqual(CONTACT_POSE);
  });

  it('is where the barrel is drawn, to the pixel', () => {
    const b = barrelOf(poseAt(120, 120));
    expect(b.x).toBeCloseTo(CONTACT.x, 0);
    expect(b.y).toBeCloseTo(CONTACT.y, 0);
  });
});

describe('a ball that was never struck', () => {
  /**
   * A whiff has a verdict like everything else and its exit velocity is 0 —
   * main.ts refuses to build a contact point at all (`timing === 'miss'`), and
   * this is the second lock: even handed the record, nothing moves and nothing
   * divides. A steal's dummy record comes through the same hole.
   */
  it('does not move, and does not divide by anything', () => {
    const dead: Batted = { exitVelocity: 0, launchAngle: 0, direction: 0 };
    for (const t of [0, 1, 150, 300, 5000]) {
      const p = battedAt(dead, CONTACT, t)!;
      expect(p.x).toBeCloseTo(CONTACT.x, 6);
      expect(p.y).toBeCloseTo(CONTACT.y, 6);
      expect(Number.isFinite(p.r)).toBe(true);
    }
  });

  it('survives a negative exit velocity without flying backwards', () => {
    const p = battedAt({ exitVelocity: -40, launchAngle: 10, direction: 20 }, CONTACT, 300)!;
    expect(p.x).toBeCloseTo(CONTACT.x, 6);
  });
});

describe('the three numbers make three different pictures', () => {
  const at = (hit: Batted, t: number) => battedAt(hit, CONTACT, t)!;

  it('starts exactly where the bat met the ball', () => {
    const p = at(liner(-20), 0);
    expect(p.x).toBeCloseTo(CONTACT.x, 6);
    expect(p.y).toBeCloseTo(CONTACT.y, 6);
    // And at the size the arriving pitch had just reached, so contact is one
    // event rather than a ball swapped for a different ball.
    expect(p.r).toBeCloseTo(radiusAt(1), 6);
  });

  it('puts a harder ball further from the plate than a softer one', () => {
    const hard = at({ exitVelocity: 105, launchAngle: 14, direction: -25 }, 250);
    const soft = at({ exitVelocity: 60, launchAngle: 14, direction: -25 }, 250);
    expect(Math.abs(hard.x - CONTACT.x)).toBeGreaterThan(Math.abs(soft.x - CONTACT.x));
    // Further away is smaller. The overhead gets it 300ms from now either way.
    expect(hard.r).toBeLessThan(soft.r);
  });

  it('stacks the pop-up above the liner above the chopper', () => {
    const pop = at({ exitVelocity: 80, launchAngle: 62, direction: -4 }, 280);
    const line = at({ exitVelocity: 95, launchAngle: 14, direction: -4 }, 280);
    const chop = at({ exitVelocity: 68, launchAngle: -9, direction: -4 }, 280);
    expect(pop.y).toBeLessThan(line.y);
    expect(line.y).toBeLessThan(chop.y);
  });

  it('will not let a chopper burrow under the plate', () => {
    for (let t = 0; t <= 600; t += 20) {
      // Steep and slow: straight into the dirt in front of him.
      const p = battedAt({ exitVelocity: 45, launchAngle: -35, direction: 0 }, CONTACT, t);
      if (!p) break;
      // y is an offset from the plate; 0 is the dirt and the ball cannot be
      // below it. Perspective lifts it back toward the horizon, never under.
      expect(p.y).toBeLessThanOrEqual(0.0001);
    }
  });

  /**
   * S4: a foul is the one batted ball the overhead does not really explain, and
   * it is the one a person sees best from here. Past the lines the direction is
   * obtuse, so the ball comes BACK at the camera — it grows and it leaves the
   * frame rather than shrinking into the mound.
   */
  it('brings a foul back over the catcher instead of out to the mound', () => {
    const foul = { exitVelocity: 77, launchAngle: 40, direction: FOUL_MAX_DEG };
    const early = battedAt(foul, CONTACT, 40)!;
    const late = battedAt(foul, CONTACT, 260)!;
    expect(late.r).toBeGreaterThan(early.r);
    expect(late.r).toBeGreaterThan(radiusAt(1));
    // Up and out, not down the screen into the plate.
    expect(late.y).toBeLessThan(CONTACT.y);
  });

  it('gives up once the ball has reached the horizon', () => {
    expect(battedAt(liner(0), CONTACT, 100_000)).toBeNull();
  });
});

describe('the perspective the pitch and the batted ball share', () => {
  it('is 1 at the plate and 0 at the release point', () => {
    expect(nearness(0)).toBe(1);
    expect(radiusAt(1)).toBeCloseTo(9.5, 6);
    expect(radiusAt(0)).toBeCloseTo(2.5, 6);
  });

  it('puts the ball on the release point as it goes away', () => {
    // Straight back at the pitcher, so there is no lateral to muddy it.
    const p = battedAt({ exitVelocity: 120, launchAngle: 0, direction: 0 }, CONTACT, 260)!;
    expect(Math.abs(p.x)).toBeLessThan(Math.abs(CONTACT.x));
    expect(p.y).toBeGreaterThan(RELEASE_DY);
    expect(p.y).toBeLessThan(CONTACT.y);
  });
});
