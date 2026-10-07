/**
 * THE BEATS BETWEEN PITCHES — beat.ts, and the wiring in main.ts that only a
 * source read can see (main.ts is a DOM entry point; see prePlay.test.ts).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  PITCH_BEAT_MS,
  PLAY_BEAT_MS,
  QUEUE_GUARD_MS,
  ballOut,
  beatMs,
  canQueue,
  fireQueued,
  windupTempo,
} from '../beat.ts';
import { deliveryOf, DELIVERIES } from '../../core/delivery.ts';
import { armPoseAt } from '../look.ts';

const src = readFileSync(fileURLToPath(new URL('../main.ts', import.meta.url)), 'utf8');
const body = (name: string): string => {
  const i = src.search(new RegExp(`function ${name}\\([^)]*\\): \\w+ \\{\\n`));
  expect(i, name).toBeGreaterThan(-1);
  return src.slice(i, src.indexOf('\n}\n', i));
};

describe('the beat after a pitch', () => {
  it('is shorter for a routine pitch than for the one that ends the at-bat', () => {
    expect(beatMs(false)).toBe(PITCH_BEAT_MS);
    expect(beatMs(true)).toBe(PLAY_BEAT_MS);
    expect(PITCH_BEAT_MS).toBeGreaterThanOrEqual(500);
    expect(PITCH_BEAT_MS).toBeLessThanOrEqual(650);
    expect(PLAY_BEAT_MS).toBeGreaterThan(PITCH_BEAT_MS);
  });

  it('is what all three resolve paths hold for, never the old flat second', () => {
    for (const name of ['resolvePitch', 'resolveTheirSwing']) {
      expect(body(name), name).toContain('pauseFor(beatMs(isOver(atBat)))');
      expect(body(name), name).not.toContain('pauseFor(1000)');
    }
  });
});

describe("the computer's windup", () => {
  it('is the neutral tempo at 1x, so no pitch type is told by the arm', () => {
    const t = windupTempo(deliveryOf(), 1);
    expect(t.releaseAtMs).toBe(deliveryOf().releaseAtMs);
    // deliver() never names the pitch — the curveball's slower arm is a tell.
    expect(body('windUp')).toContain('deliveryOf()');
    expect(body('windUp')).not.toMatch(/deliveryOf\(\w/);
  });

  it('compresses with the flight in watch mode', () => {
    const t = windupTempo(deliveryOf(), 8);
    expect(t.releaseAtMs).toBeCloseTo(deliveryOf().releaseAtMs / 8);
    expect(t.sweepMs).toBeCloseTo(deliveryOf().sweepMs / 8);
    expect(body('windUp')).toContain('flightScale()');
    expect(body('windUp')).not.toContain('readScale()');
  });

  it('has the arm visibly coming through before release and at rest after the sweep', () => {
    const t = windupTempo(deliveryOf(), 1);
    const set = armPoseAt(0, t);
    const mid = armPoseAt(t.releaseAtMs * 0.6, t);
    const after = armPoseAt(t.sweepMs + 50, t);
    expect(mid.armBack).not.toBe(set.armBack);
    expect(after.armBack).toBe(set.armBack);
    // A watch-mode tempo is still a tempo the pose table can read.
    expect(Object.keys(DELIVERIES).length).toBeGreaterThan(0);
  });

  it('launches the ball at the release, from both deliveries nobody times', () => {
    expect(body('deliver')).toContain('launchAt = windUp();');
    expect(body('pitchToThem')).toContain('launchAt = windup ? windUp() : performance.now();');
    // Watch mode on the mound winds up too; your own release does not.
    expect(body('autoStep')).toContain("pitchToThem('good', null, true)");
    expect(body('releaseAs')).not.toContain('true');
  });

  it('draws no ball, and takes no human swing, until it is out of his hand', () => {
    expect(ballOut(999, 1000)).toBe(false);
    expect(ballOut(1000, 1000)).toBe(true);
    expect(body('drawBall')).toContain('if (now < launchAt) {');
    expect(body('press')).toContain('if (ballOut(now, launchAt)) swing();');
    // The computer's bat is scheduled off the arrival and must not be gated:
    // at 8x an early offset can come before the release.
    expect(body('step')).toMatch(/autoSwingAt = null;\n\s*swing\(\);/);
  });

  it('gives the time back to every new clock on resume', () => {
    const r = body('resume');
    for (const clock of ['launchAt', 'arriveAt', 'deliveryAt', 'resolvedAt']) {
      expect(r, clock).toContain(`${clock} += held;`);
    }
  });
});

describe('the banked next pitch', () => {
  it('drops a press that is the tail of the swing', () => {
    expect(canQueue(1000 + QUEUE_GUARD_MS - 1, 1000)).toBe(false);
    expect(canQueue(1000 + QUEUE_GUARD_MS, 1000)).toBe(true);
  });

  const clear = { phase: 'idle', youBat: true, auto: false, replay: false, breakUp: false };

  it('fires only for a hitter waiting on a pitch with nothing on the screen', () => {
    expect(fireQueued(clear)).toBe(true);
    expect(fireQueued({ ...clear, replay: true })).toBe(false);
    expect(fireQueued({ ...clear, breakUp: true })).toBe(false);
    expect(fireQueued({ ...clear, auto: true })).toBe(false);
    expect(fireQueued({ ...clear, youBat: false })).toBe(false);
    for (const phase of ['throw', 'calling', 'resolve', 'windup', 'over']) {
      expect(fireQueued({ ...clear, phase }), phase).toBe(false);
    }
  });

  it('is spent the frame it is read, so one press is at most one pitch', () => {
    const s = body('step');
    expect(s).toMatch(/if \(queuedPitch && phase !== 'resolve'\) \{\n\s*queuedPitch = false;/);
    // Never banked on the pitch that ended the at-bat, nor under a replay.
    const p = body('press');
    expect(p).toContain('!isOver(atBat)');
    expect(p).toContain('!replay');
    expect(p).toContain('canQueue(now, resolvedAt)');
  });

  it('redraws the panel when it is banked', () => {
    expect(body('render')).toMatch(/const key = \[[^\]]*\bqueuedPitch\b/);
  });
});
