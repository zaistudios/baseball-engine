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
import {
  PARTS,
  clubBuild,
  drawFigure,
  lookFor,
  lookForArm,
  partsFor,
  safeLook,
  uniformFor,
  artSlots,
  idForFilename,
  partId,
} from '../look.ts';
import type { Player } from '../../core/roster.ts';

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
        for (let crest = 0; crest < set.crests.length; crest++) {
          for (const stance of ['bat', 'pitch', 'crouch'] as const) {
            drawFigure(ctx, {
              look: { frame, head: 0, crest, tone: 0, number: 8, wear: 0.9 },
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
    expect(calls.length).toBeGreaterThan(100);
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
