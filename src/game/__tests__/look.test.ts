/**
 * THE LOOK — six numbers per man, and the four things that have to hold.
 *
 * ⚠️ THE ONE THAT ACTUALLY CATCHES A BUG is "every man in the league rolls an
 * index somebody has a part for". The default look is generated, the part sets
 * differ per build, and `noUncheckedIndexedAccess` cannot see across that seam —
 * so an off-by-one in PARTS is a `undefined` mid-pitch and nothing else here
 * would find it. It runs against the whole shipped league, depth men included,
 * which is ~780 rolls and still milliseconds.
 *
 * The four:
 *
 *  1. it is DETERMINISTIC — the same man is the same face forever, which is
 *     what makes "nothing stored" the default state rather than a job;
 *  2. every rolled index is in range for that man's build;
 *  3. a stored look WINS and survives a JSON round-trip — that is the whole of
 *     "bulk authoring and hand-editing compose";
 *  4. an illegal look cannot throw, because it arrives from a text box.
 */
import { describe, it, expect } from 'vitest';
import { LEAGUE, type Team } from '../teams.ts';
import { BAT_POSES, CONTACT_POSE, REST_POSE, barrelOf } from '../swing.ts';
import {
  PARTS,
  ARM_POSES,
  ARM_REST,
  armPoseAt,
  batLine,
  clubBuild,
  drawFigure,
  runCycle,
  lookFor,
  lookForArm,
  lookForExtra,
  armBuild,
  partsFor,
  safeLook,
  uniformFor,
  artSlots,
  idForFilename,
  partId,
} from '../look.ts';
import type { Player } from '../../core/roster.ts';
import type { Pitcher } from '../../core/pitcher.ts';

/** Everybody with a `build` — the nine, the bench, and the depth behind them. */
const hitters = (t: Team): readonly Player[] => [...t.lineup, ...(t.bench ?? [])];

describe('the look is stable', () => {
  it('rolls the same face for the same man, every time', () => {
    const man = LEAGUE[0]!.lineup[0]!;
    expect(lookFor(man)).toEqual(lookFor(man));
  });

  it('gives different men different faces', () => {
    const seen = new Set(
      LEAGUE.flatMap((t) => hitters(t)).map((p) => JSON.stringify(lookFor(p))),
    );
    // Not all distinct — six small integers over hundreds of men will collide,
    // and a roll that never collides is a roll that is not random. The claim is
    // only that it is not one face stamped on everybody.
    expect(seen.size).toBeGreaterThan(100);
  });
});

describe('every index has a part behind it', () => {
  it('holds for every hitter in the shipped league', () => {
    let n = 0;
    for (const t of LEAGUE) {
      for (const p of hitters(t)) {
        const look = lookFor(p);
        const set = partsFor(p.build);
        expect(set.frames[look.frame], `${p.name} frame ${look.frame}`).toBeDefined();
        expect(look.head).toBeLessThan(set.heads.length);
        expect(look.crest).toBeLessThan(set.crests.length);
        expect(set.tones[look.tone], `${p.name} tone ${look.tone}`).toBeDefined();
        expect(look.number).toBeGreaterThanOrEqual(1);
        expect(look.number).toBeLessThanOrEqual(99);
        n++;
      }
    }
    expect(n).toBeGreaterThan(300);
  });

  it('holds for every arm, which rolls off a name and its club', () => {
    for (const t of LEAGUE) {
      const set = partsFor(clubBuild(t));
      for (const arm of [...t.rotation, ...t.bullpen]) {
        const look = lookForArm(arm, t);
        expect(set.frames[look.frame], `${arm.name} frame`).toBeDefined();
        expect(set.tones[look.tone], `${arm.name} tone`).toBeDefined();
        expect(look.crest).toBeLessThan(set.crests.length);
      }
    }
  });

  it('gives an arm his club’s build, so no robot pitches for the Holdouts', () => {
    const allHuman = LEAGUE.find((t) => t.lineup.every((p) => p.build === 'human'));
    if (allHuman) expect(clubBuild(allHuman)).toBe('human');
    const allMachine = LEAGUE.find((t) => t.lineup.every((p) => p.build === 'machine'));
    if (allMachine) expect(clubBuild(allMachine)).toBe('machine');
  });
});

describe('a stored look wins', () => {
  it('overrides the roll outright', () => {
    const base = LEAGUE[0]!.lineup[0]!;
    const mine = { frame: 0, head: 0, crest: 0, tone: 0, number: 42, wear: 0 };
    expect(lookFor({ ...base, look: mine })).toEqual(mine);
  });

  it('survives the league document, which is how it travels', () => {
    const mine = { frame: 1, head: 1, crest: 2, tone: 3, number: 7, wear: 0.5 };
    const man: Player = { ...LEAGUE[0]!.lineup[0]!, look: mine };
    // serialiseLeague is JSON.stringify; this is the round trip it performs.
    const back = JSON.parse(JSON.stringify(man)) as Player;
    expect(lookFor(back)).toEqual(mine);
  });
});

describe('an illegal look cannot break a pitch', () => {
  it('clamps anything a text box can produce', () => {
    const junk = {
      frame: 999,
      head: -4,
      crest: Number.NaN,
      tone: 1e9,
      number: 4000,
      wear: 12,
    };
    const safe = safeLook(junk, 'machine');
    const set = PARTS.machine;
    expect(safe.frame).toBe(set.frames.length - 1);
    expect(safe.head).toBe(0);
    expect(safe.crest).toBe(0);
    expect(safe.tone).toBe(set.tones.length - 1);
    expect(safe.number).toBe(99);
    expect(safe.wear).toBe(1);
  });

  it('draws every build without throwing, on a stub context', () => {
    // ponytail: a recording stub, not a canvas library. drawFigure only ever
    // calls a dozen 2D methods and the claim under test is "it completes for
    // every build and stance", not "the pixels are right" — which is a thing
    // for eyes, and is why this got played in a browser before it shipped.
    const calls: string[] = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (_t, k: string) => {
        if (k === 'fillStyle' || k === 'strokeStyle' || k === 'font') return '';
        if (k === 'textAlign' || k === 'textBaseline') return '';
        return (...a: unknown[]) => {
          calls.push(`${k}(${a.length})`);
        };
      },
      set: () => true,
    }) as unknown as CanvasRenderingContext2D;

    const u = uniformFor(LEAGUE[0]!);
    for (const build of ['human', 'augmented', 'machine'] as const) {
      const set = PARTS[build];
      for (let frame = 0; frame < set.frames.length; frame++) {
        for (let head = 0; head < set.heads.length; head++) {
          for (let crest = 0; crest < set.crests.length; crest++) {
            for (const stance of ['bat', 'pitch', 'crouch'] as const) {
              drawFigure(ctx, {
                look: { frame, head, crest, tone: 0, number: 8, wear: 0.9 },
                uniform: u,
                build,
                x: 100,
                y: 200,
                h: 96,
                stance,
              });
            }
          }
        }
      }
    }
    expect(calls.length).toBeGreaterThan(100);
  });

  /**
   * ⚠️ THE REGRESSION THIS EXISTS FOR: `look.head` was read only by the machine
   * branch of drawFigure, so round / square / narrow drew the identical circle
   * on a human and on an augmented man. The editor offered the choice, the
   * preview did not move, and nothing failed — a dead control is invisible to
   * every test that only asks "did it throw".
   *
   * Recording the ARGUMENTS and not just the call names is the whole point. A
   * shape change is a different arc/ellipse/roundRect call with different
   * numbers in it; a count would have passed against the bug.
   */
  it('draws a different head for every head part, on every build', () => {
    const trace = (build: 'human' | 'augmented' | 'machine', head: number): string => {
      const calls: string[] = [];
      const ctx = new Proxy({} as Record<string, unknown>, {
        get: (_t, k: string) => {
          if (['fillStyle', 'strokeStyle', 'font', 'textAlign', 'textBaseline'].includes(k)) return '';
          return (...a: unknown[]) => {
            calls.push(`${k}(${a.join(',')})`);
          };
        },
        set: (_t, k: string, v: unknown) => {
          calls.push(`${k}=${String(v)}`);
          return true;
        },
      }) as unknown as CanvasRenderingContext2D;
      drawFigure(ctx, {
        look: { frame: 0, head, crest: 0, tone: 0, number: 8, wear: 0 },
        uniform: uniformFor(LEAGUE[0]!),
        build,
        x: 100,
        y: 200,
        h: 96,
        stance: 'bat',
      });
      return calls.join('|');
    };

    for (const build of ['human', 'augmented', 'machine'] as const) {
      const drawn = PARTS[build].heads.map((_, i) => trace(build, i));
      expect(new Set(drawn).size, `${build} heads all draw the same`).toBe(drawn.length);
    }
  });

  /**
   * ⚠️ THE OTHER HALF OF THE SAME FAULT. `headR` was a flat fraction of `h`, so
   * the head was 77% of the shoulder width AND `enormous` could not touch it —
   * the frame slider widened the body around a head that never moved. Both
   * claims are pinned here because either one alone reads as a tuning taste.
   */
  it('keeps the head under the shoulders and lets the frame move it', () => {
    const headWidths: number[] = [];
    for (let frame = 0; frame < PARTS.human.frames.length; frame++) {
      const arcs: number[] = [];
      const ctx = new Proxy({} as Record<string, unknown>, {
        get: (_t, k: string) => {
          if (['fillStyle', 'strokeStyle', 'font', 'textAlign', 'textBaseline'].includes(k)) return '';
          return (...a: unknown[]) => {
            // The round head is one ellipse whose radii are equal — that is the
            // head and nothing else in the figure is drawn that way.
            if (k === 'ellipse' && a[2] === a[3]) arcs.push(Number(a[2]));
          };
        },
        set: () => true,
      }) as unknown as CanvasRenderingContext2D;
      drawFigure(ctx, {
        look: { frame, head: 0, crest: 0, tone: 0, number: 8, wear: 0 },
        uniform: uniformFor(LEAGUE[0]!),
        build: 'human',
        x: 100,
        y: 200,
        h: 96,
        stance: 'bat',
      });
      const r = arcs[0]!;
      // Both the head and the shoulders are fractions of the FRAME-SCALED
      // height, so `f.h` belongs on both sides or `tall` reads as a bobblehead
      // that is not one.
      const f = PARTS.human.frames[frame]!;
      const shoulders = 96 * f.h * 0.3 * f.w;
      headWidths.push(r * 2);
      expect(r * 2, `frame ${frame} is a bobblehead`).toBeLessThan(shoulders * 0.72);
    }
    // Lean and enormous have to be different heads, or the frame is cosmetic.
    expect(Math.max(...headWidths)).toBeGreaterThan(Math.min(...headWidths) * 1.08);
  });

  /**
   * ⚠️ THE NUMBER GATE HAS TO ANSWER THE SAME WAY FOR EVERY FRAME AT A GIVEN
   * HEIGHT. It gated on `h`, which the frame's own height multiplier scales, so
   * raising the mound figure to 58 would have put a `spire` arm over the line
   * and a `service chassis` under it — one pitcher wearing a number and the next
   * one not, off a roll nobody can see.
   *
   * Both claims below are the ones that would break if somebody moved the gate
   * back to a height: every batter keeps his number, no arm gets one.
   */
  it('puts a number on every batter and on no pitcher', () => {
    const wearsNumber = (build: 'human' | 'augmented' | 'machine', frame: number, h: number): boolean => {
      let drew = false;
      const ctx = new Proxy({} as Record<string, unknown>, {
        get: (_t, k: string) => {
          if (['fillStyle', 'strokeStyle', 'font', 'textAlign', 'textBaseline'].includes(k)) return '';
          return (...a: unknown[]) => {
            if (k === 'fillText' && a[0] === '42') drew = true;
          };
        },
        set: () => true,
      }) as unknown as CanvasRenderingContext2D;
      drawFigure(ctx, {
        look: { frame, head: 0, crest: 1, tone: 0, number: 42, wear: 0 },
        uniform: uniformFor(LEAGUE[0]!),
        build,
        x: 100,
        y: 200,
        h,
        stance: h === 96 ? 'bat' : 'pitch',
      });
      return drew;
    };

    for (const build of ['human', 'augmented', 'machine'] as const) {
      for (let frame = 0; frame < PARTS[build].frames.length; frame++) {
        const name = `${build} frame ${frame}`;
        expect(wearsNumber(build, frame, 96), `batter ${name} lost his number`).toBe(true);
        expect(wearsNumber(build, frame, 58), `pitcher ${name} wears one he has no room for`).toBe(false);
      }
    }
  });

  /**
   * ⚠️ THE SWING USED TO PIVOT ABOUT THE FEET. `rotate` sat with the translate,
   * so the pose table's 24° finish swung a 96px lever and the batter leaned
   * bodily out of the box — a man toppling, not a man turning.
   *
   * The claim is structural, so the test is too: the legs and the shadow have to
   * be laid down BEFORE any rotate, and a rotate has to happen after them. A
   * pixel assertion would need a canvas and would not say which of the two
   * mistakes it caught.
   */
  it('plants the feet and turns from the belt', () => {
    const order: string[] = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (_t, k: string) => {
        if (['fillStyle', 'strokeStyle', 'font', 'textAlign', 'textBaseline'].includes(k)) return '';
        return (...a: unknown[]) => {
          if (k === 'rotate' && a[0] !== 0) order.push('rotate');
          if (k === 'fillRect' || k === 'ellipse') order.push(k);
        };
      },
      set: () => true,
    }) as unknown as CanvasRenderingContext2D;

    drawFigure(ctx, {
      look: { frame: 1, head: 0, crest: 1, tone: 0, number: 8, wear: 0 },
      uniform: uniformFor(LEAGUE[0]!),
      build: 'human',
      x: 100,
      y: 200,
      h: 96,
      stance: 'bat',
      turn: 0.42,
    });

    const turnedAt = order.indexOf('rotate');
    expect(turnedAt, 'nothing rotates — the turn was dropped').toBeGreaterThan(-1);
    // The shadow is the one ellipse before the legs, and the legs are the first
    // two fillRects. All three are ground contact and none of them may swing.
    expect(order.indexOf('ellipse'), 'the shadow swings with him').toBeLessThan(turnedAt);
    expect(
      order.filter((c, i) => c === 'fillRect' && i < turnedAt).length,
      'the legs swing with him',
    ).toBe(2);
  });
});

describe('the kit', () => {
  it('dresses all thirty clubs with nothing authored', () => {
    for (const t of LEAGUE) {
      const u = uniformFor(t);
      for (const c of [u.primary, u.secondary, u.trim]) {
        expect(c, `${t.abbr} ${c}`).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it('lets a club say what it wears', () => {
    const mine = { primary: '#111111', secondary: '#222222', trim: '#333333' };
    expect(uniformFor({ ...LEAGUE[0]!, uniform: mine })).toEqual(mine);
  });
});

/**
 * THE ART VOCABULARY — which filename means which part.
 *
 * ⚠️ THE ONE THAT MATTERS is that every slot the screen ADVERTISES round-trips
 * back to the slot it names. The screen prints `artSlots().file` as the list of
 * names to use, and `idForFilename()` is what actually matches an import — two
 * functions that have to agree, and the failure if they do not is somebody
 * naming a file exactly as instructed and being told no part is called that.
 * Nothing else in the feature can catch it, because the store and the tint both
 * need a browser.
 */
describe('naming a drawing', () => {
  it('round-trips every slot the screen tells you to use', () => {
    const slots = artSlots();
    expect(slots.length).toBeGreaterThan(20);
    for (const s of slots) {
      expect(idForFilename(s.file), s.file).toBe(s.id);
    }
  });

  it('gives every slot its own id and its own filename', () => {
    const slots = artSlots();
    expect(new Set(slots.map((s) => s.id)).size).toBe(slots.length);
    expect(new Set(slots.map((s) => s.file)).size).toBe(slots.length);
  });

  it('does not care about case, spaces or the extension', () => {
    const want = idForFilename('machine-crest-vent-stack.png');
    expect(want).toBe(partId('machine', 'crest', 1));
    for (const v of [
      'Machine Crest Vent Stack.PNG',
      'machine_crest_vent_stack.webp',
      'MACHINE--CREST--VENT--STACK.gif',
    ]) {
      expect(idForFilename(v), v).toBe(want);
    }
  });

  it('refuses a name no part answers to, rather than guessing', () => {
    for (const v of [
      'crest-vent-stack.png', // no build
      'machine-crest-flux-capacitor.png', // no such part
      'machine-tone-steel.png', // tone is a colour, not a drawing
      'human-crest-vent-stack.png', // right part name, wrong build
      'screenshot.png',
      '',
    ]) {
      expect(idForFilename(v), v).toBeNull();
    }
  });

  it('covers exactly the three drawable parts, and not tone', () => {
    const parts = new Set(artSlots().map((s) => s.id.split('/')[1]));
    expect([...parts].sort()).toEqual(['crest', 'frame', 'head']);
  });
});

/**
 * THE MAN ON THE MOUND — 2026-09-17, when he stopped being undressable.
 *
 * `Pitcher` grew `id`, `build` and `look?`, which moved 390 of the league's 780
 * men out of "rolled off a name" and into "chosen". Three things have to hold
 * and none of them is visible to tsc:
 *
 *  1. THE COMPATIBILITY CONTRACT. Every league exported before today has arms
 *     with no id and no build, and every one of those men has to keep the exact
 *     face he has always had. A changed default here silently redresses the
 *     whole league for everybody who ever exported one.
 *  2. A STORED LOOK WINS, the same rule a hitter has.
 *  3. THE SCENERY CANNOT INHERIT. The catcher and the overhead baserunners used
 *     to be built by spreading the real pitcher into a fake one. The moment an
 *     arm could carry a look, that spread copied his chosen face onto nine other
 *     men — so lookForExtra() exists and must not take a record at all.
 */
describe('the arm has his own face', () => {
  const club = LEAGUE[0]!;
  const arm = club.rotation[0]!;
  const bare = (a: Pitcher): Pitcher => {
    const c = { ...a };
    delete c.id;
    delete c.build;
    return c;
  };

  /**
   * ⚠️ A GOLDEN VALUE, AND IT IS THE POINT OF THIS TEST. Every league anybody
   * has exported before 09-17 carries arms with no id and no build, so the
   * fallback roll — his NAME as the seed, his CLUB's modal build — is a promise
   * to every one of those documents. Writing the six numbers out means a change
   * to the default fails here instead of silently redressing 390 men in every
   * league in the wild. If this test fails, the question is not "what is the new
   * number", it is "why did the default move".
   */
  it('dresses an arm with no id and no build exactly as it always did', () => {
    expect(club.abbr).toBe('NYE');
    expect(arm.name).toBe('Whitey Pastore');
    expect(clubBuild(club)).toBe('human');
    expect(lookForArm(bare(arm), club)).toEqual({
      frame: 2,
      head: 2,
      crest: 3,
      tone: 4,
      number: 27,
      wear: 0.6541119925677776,
    });
  });

  it('seeds the fallback off his NAME, not his ratings', () => {
    // Same name, different everything else — the same man as far as a face goes.
    const twin = bare({ ...arm, zoneRate: 0.4, putaway: arm.putaway, blurb: 'x' });
    expect(lookForArm(twin, club)).toEqual(lookForArm(bare(arm), club));
    const renamed = bare({ ...arm, name: 'Somebody Else' });
    expect(lookForArm(renamed, club)).not.toEqual(lookForArm(bare(arm), club));
  });

  it('prefers his own id and his own build when he has them', () => {
    const own: Pitcher = { ...arm, id: 'nye-r1', build: 'machine' };
    const byName = lookForArm(bare(arm), club);
    expect(lookForArm(own, club)).not.toEqual(byName);
    // ⚠️ armBuild() HAS TO AGREE, or the look is indexed against one part set
    // and drawn out of another — a `crest: 3` out of a list of two.
    expect(armBuild(own, club)).toBe('machine');
    expect(armBuild(bare(arm), club)).toBe(clubBuild(club));
  });

  it('lets a stored look win outright', () => {
    const chosen = { frame: 1, head: 1, crest: 2, tone: 3, number: 41, wear: 0.2 };
    expect(lookForArm({ ...arm, look: chosen }, club)).toEqual(chosen);
    // ...and it wins over his own build and id too — a look is a look.
    expect(lookForArm({ ...arm, id: 'x', build: 'machine', look: chosen }, club)).toEqual(chosen);
  });

  /**
   * ⚠️ THE REGRESSION THIS EXISTS FOR. The catcher and every overhead baserunner
   * used to be drawn by spreading the real pitcher into a fake one and changing
   * only `name` — harmless while `Pitcher` held nothing but ratings. The moment
   * an arm could carry a stored `look`, that spread returned HIS look, because a
   * stored look wins: one chosen face on nine men, and only on clubs somebody
   * had customized. lookForExtra() takes a string and no record at all, so there
   * is nothing for a face to leak through.
   */
  it('never leaks the pitcher his own face onto the catcher or a baserunner', () => {
    const chosen = { frame: 0, head: 0, crest: 0, tone: 0, number: 99, wear: 1 };
    const dressed: Pitcher = { ...arm, look: chosen };
    expect(lookForArm(dressed, club)).toEqual(chosen);
    expect(lookForExtra(`${club.abbr}-catcher`, club)).not.toEqual(chosen);
    expect(lookForExtra(`${club.abbr}-F2`, club)).not.toEqual(chosen);
    // ...and the extras are not each other, or the nine share one face.
    expect(lookForExtra(`${club.abbr}-catcher`, club)).not.toEqual(
      lookForExtra(`${club.abbr}-F2`, club),
    );
  });

  /**
   * The same check the hitters get, and for the same reason: an off-by-one in
   * PARTS is an `undefined` mid-pitch that nothing else here would find. 390
   * arms that were never covered by it until today.
   */
  it('rolls every arm in the league an index somebody has a part for', () => {
    for (const t of LEAGUE) {
      for (const a of [...t.rotation, ...t.bullpen]) {
        const set = partsFor(armBuild(a, t));
        const l = safeLook(lookForArm(a, t), armBuild(a, t));
        expect(l.frame, a.name).toBeLessThan(set.frames.length);
        expect(l.head, a.name).toBeLessThan(set.heads.length);
        expect(l.crest, a.name).toBeLessThan(set.crests.length);
        expect(l.tone, a.name).toBeLessThan(set.tones.length);
      }
    }
  });
});

/**
 * WHERE THE BAT LANDS, which is the one thing about drawing a bat that a test
 * can actually hold.
 *
 * ⚠️ THIS IS THE CHECK THAT WAS MISSING FOR THE WHOLE LIFE OF THE BUG. The
 * pose table had 38 tests and every one of them passed while the at-bat view
 * drew a fixed stick and read one of BatPose's six fields — because nothing
 * asserted that the ARC reaches the CANVAS. batLine() exists to be asserted.
 *
 * The layout numbers below are main.ts's: PLATE_X / PLATE_Y, the ZONE rect, and
 * the batter's own box. main.ts is a DOM entry point and cannot be imported
 * here, so they are repeated — and that is the point of repeating them. If the
 * at-bat view moves the plate or the zone and this is not updated, the bat is
 * drawn somewhere nobody checked, and that is exactly the failure being pinned.
 */
describe('the bat on the canvas', () => {
  const PLATE = { x: 210, y: 250 };
  const ZONE = { x: 160, y: 118, w: 100, h: 108 };
  const BATTER_X = 134;
  const BATTER_Y = 264;
  const BATTER_H = 96;

  it('puts the barrel through the strike zone at contact', () => {
    const { tx, ty } = batLine(CONTACT_POSE, PLATE);
    expect(tx).toBeGreaterThan(ZONE.x);
    expect(tx).toBeLessThan(ZONE.x + ZONE.w);
    expect(ty).toBeGreaterThan(ZONE.y);
    expect(ty).toBeLessThan(ZONE.y + ZONE.h);
  });

  /**
   * The hands are the half of this that says the mapping is right. A barrel can
   * be in the zone with the hands anywhere; hands off the body are how a
   * rescale, a flipped sign or a wrong origin actually shows up.
   */
  it(`keeps every pose's hands on the man, not in the air beside him`, () => {
    for (const pose of BAT_POSES) {
      const { hx, hy } = batLine(pose, PLATE);
      // Between his own centre line and the plate: his hands are in front of
      // him, which is the correction BAT_POSES was rewritten for.
      expect(hx, `${pose.name} hands x`).toBeGreaterThan(BATTER_X);
      expect(hx, `${pose.name} hands x`).toBeLessThan(PLATE.x);
      // Between his feet and the top of his head.
      expect(hy, `${pose.name} hands y`).toBeLessThan(BATTER_Y);
      expect(hy, `${pose.name} hands y`).toBeGreaterThan(BATTER_Y - BATTER_H);
    }
  });

  it('draws the barrel exactly where the pose grades it, at 1:1', () => {
    const b = barrelOf(CONTACT_POSE);
    const { tx, ty } = batLine(CONTACT_POSE, PLATE);
    expect(tx).toBeCloseTo(PLATE.x + b.x, 6);
    expect(ty).toBeCloseTo(PLATE.y + b.y, 6);
  });

  it('mirrors a left-hander about the plate, not about himself', () => {
    const r = batLine(CONTACT_POSE, PLATE);
    const l = batLine(CONTACT_POSE, { ...PLATE, flip: true });
    expect(l.hx - PLATE.x).toBeCloseTo(PLATE.x - r.hx, 6);
    expect(l.tx - PLATE.x).toBeCloseTo(PLATE.x - r.tx, 6);
    // The lefty stands on the other side, so his hands must be on that side.
    expect(l.hx).toBeGreaterThan(PLATE.x);
    expect(l.hy).toBeCloseTo(r.hy, 6);
  });

  it('scales the whole rig about the plate, so a panel can shrink it', () => {
    const full = batLine(REST_POSE, PLATE);
    const half = batLine(REST_POSE, { ...PLATE, scale: 0.5 });
    expect(half.hx - PLATE.x).toBeCloseTo((full.hx - PLATE.x) / 2, 6);
    expect(half.ty - PLATE.y).toBeCloseTo((full.ty - PLATE.y) / 2, 6);
  });

  /**
   * The editor preview has no plate in it and hangs one off the at-bat layout.
   * At BATTER_H with the feet on the floor of a 120x150 box, the bat at rest
   * has to FIT — it reaches 149px above his feet, which is what forced the
   * preview figure down from 108.
   */
  it('fits the resting bat, cap and all, inside the editor preview box', () => {
    const W = 120;
    const H = 150;
    // The same fit paintLookPreviews() derives, and the reason it is derived:
    // at 1:1 the tip landed on y = 0 in a browser and the round cap was shaved.
    const rig = BATTER_Y - PLATE.y - barrelOf(REST_POSE).y;
    const k = Math.min(1, (H - 8) / rig);
    const feet = H - 4;
    const { hx, hy, tx, ty } = batLine(REST_POSE, {
      x: W / 2 + (PLATE.x - BATTER_X) * k,
      y: feet - (BATTER_Y - PLATE.y) * k,
      scale: k,
    });
    // CAP is half the barrel stroke: the drawing reaches past the tip by it.
    const CAP = 4 * k;
    for (const [name, v] of [['hands x', hx], ['tip x', tx]] as const) {
      expect(v, name).toBeGreaterThan(CAP);
      expect(v, name).toBeLessThan(W - CAP);
    }
    expect(ty - CAP, 'tip y').toBeGreaterThan(0);
    expect(hy, 'hands y').toBeLessThan(H);
  });
});

/**
 * THE BODIES, now that they have joints.
 *
 * ⚠️ WHAT THESE PIN IS THE CONTRACT, NOT THE PIXELS. A limb angle is a thing
 * for eyes; "a man nobody posed is drawn exactly as he was before joints
 * existed" is a thing a test can hold, and it is the one that protects every
 * league and every screen that never asked for animation.
 */
describe('joints, and the two pose tables that drive them', () => {
  it('draws an unposed figure with no rotation at all', () => {
    const calls: string[] = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (_t, k: string) => {
        if (['fillStyle', 'strokeStyle', 'font', 'textAlign', 'textBaseline'].includes(k)) return '';
        return (...a: unknown[]) => calls.push(`${k}(${a.join(',')})`);
      },
      set: () => true,
    }) as unknown as CanvasRenderingContext2D;

    const base = {
      look: { frame: 0, head: 0, crest: 0, tone: 0, number: 8, wear: 0 },
      uniform: uniformFor(LEAGUE[0] as Team),
      build: 'human' as const,
      x: 100,
      y: 200,
      h: 96,
      stance: 'pitch' as const,
    };
    drawFigure(ctx, base);
    const bare = calls.slice();
    calls.length = 0;
    drawFigure(ctx, { ...base, legFront: 0, legBack: 0, armFront: 0, armBack: 0 });
    // Same calls, and in particular NO rotate() — a zero angle is skipped, not
    // applied, so "omitted" and "zero" are one drawing and not two.
    expect(calls).toEqual(bare);
    expect(bare.some((c) => c.startsWith('rotate('))).toBe(false);
  });

  describe('the run cycle', () => {
    it('stands a man still at phase 0', () => {
      // Every joint zero, and limb() skips a zero rather than rotating by it.
      // (Some come back as -0, which is falsy and draws identically — the
      // contract is "no rotation", not "the sign of nothing".)
      for (const [k, v] of Object.entries(runCycle(0))) expect(v, k).toBeFalsy();
    });

    it('opposes the arms to the legs, which is what makes it read as running', () => {
      const c = runCycle(Math.PI / 2);
      expect(c.legFront!).toBeGreaterThan(0);
      expect(c.legBack!).toBeLessThan(0);
      // The arm on the same side goes the other way.
      expect(Math.sign(c.armFront!)).toBe(-Math.sign(c.legFront!));
      expect(Math.sign(c.armBack!)).toBe(-Math.sign(c.legBack!));
    });

    it('is a cycle: half a turn later every limb has swapped', () => {
      const a = runCycle(1);
      const b = runCycle(1 + Math.PI);
      expect(b.legFront!).toBeCloseTo(-a.legFront!, 10);
      expect(b.armBack!).toBeCloseTo(-a.armBack!, 10);
    });
  });

  describe('the delivery', () => {
    const TEMPO = { sweepMs: 960, releaseAtMs: 603 };

    it('is at rest before the press and after the recovery', () => {
      expect(armPoseAt(-1, TEMPO)).toEqual(ARM_REST);
      expect(armPoseAt(0, TEMPO)).toEqual(ARM_REST);
      expect(armPoseAt(99999, TEMPO)).toEqual(ARM_REST);
    });

    /**
     * The old code turned him to −0.22 over the whole sweep and snapped him
     * back to 0 the frame the ball left. `t: 1` is RELEASE, so that number now
     * lands where the ball does.
     */
    it('hits the release pose exactly at releaseAtMs', () => {
      const p = armPoseAt(TEMPO.releaseAtMs, TEMPO);
      expect(p.name).toBe('release');
      expect(p.turn).toBeCloseTo(-0.22, 10);
    });

    it('recovers to the set pose instead of snapping to it', () => {
      const end = armPoseAt(TEMPO.sweepMs, TEMPO);
      expect(end.turn).toBeCloseTo(0, 10);
      expect(end.legFront).toBeCloseTo(0, 10);
      // −2π is 0 as far as a canvas is concerned, which is the whole trick.
      expect(Math.abs(end.armBack! % (Math.PI * 2))).toBeCloseTo(0, 10);
    });

    /**
     * ⚠️ THE ARM GOES OVER THE TOP, AND THIS IS WHAT SAYS SO. The keyframes
     * decrease monotonically through a full revolution; if anybody ever
     * "tidies" one of them into the equivalent angle nearer zero, the
     * interpolation reverses and he throws underarm.
     */
    it('carries the throwing arm one way round, never back through the bottom', () => {
      const backs = ARM_POSES.map((p) => p.armBack);
      for (let i = 1; i < backs.length; i++) {
        expect(backs[i]!, ARM_POSES[i]!.name).toBeLessThan(backs[i - 1]!);
      }
      expect(backs[backs.length - 1]).toBeCloseTo(-Math.PI * 2, 10);
      // and the sampled path never turns round either
      let prev = 0;
      for (let ms = 1; ms <= TEMPO.sweepMs; ms += 17) {
        const v = armPoseAt(ms, TEMPO).armBack;
        expect(v).toBeLessThanOrEqual(prev + 1e-9);
        prev = v;
      }
    });

    it('scales with the pitch: a slower delivery reaches the same pose later', () => {
      const slow = { sweepMs: 1110, releaseAtMs: 710 };
      expect(armPoseAt(710, slow).name).toBe('release');
      // At the fastball's release the changeup is not there yet.
      expect(armPoseAt(603, slow).turn).toBeGreaterThan(-0.22);
    });
  });
});
