/**
 * The asset layer's pure half.
 *
 * Nothing here touches an Image or a canvas — those need a DOM and this suite
 * runs in node. What is worth locking is the part a person interacts with when
 * they drop a file into assets/: does the filename they chose resolve, does a
 * drawing of any size land at the right scale, and does a missing file fall
 * back rather than throw.
 *
 * The last of those is the one that matters most. Every asset is optional
 * forever, so "no file" must be an ordinary answer and never an error.
 */

import { describe, it, expect } from 'vitest';
import {
  slug,
  spriteKeys,
  indexKey,
  fitBox,
  anchorAt,
  facing,
  sprite,
  assetCount,
  SPRITE_SPECS,
  type SpriteKind,
} from '../sprites.ts';
import { POOL } from '../../core/roster.ts';
import { PITCHERS } from '../../core/pitcher.ts';

describe('naming — the filename a human would actually write', () => {
  it('lowercases and hyphenates', () => {
    expect(slug('Cap Mullaney')).toBe('cap-mullaney');
    expect(slug('Smoky Joe Vance')).toBe('smoky-joe-vance');
  });

  it('survives the punctuation in the awkward names', () => {
    // These are the three in the pool that would break a naive slug.
    expect(slug('UNIT-7 "Cletus"')).toBe('unit-7-cletus');
    expect(slug('Xandra Kō')).toBe('xandra-k');
    expect(slug('MODEL-9')).toBe('model-9');
  });

  it('never leaves a leading or trailing hyphen', () => {
    expect(slug('"Cletus"')).toBe('cletus');
    expect(slug('  spaced  ')).toBe('spaced');
    expect(slug('!!!')).toBe('');
  });

  it('gives every player in the pool a non-empty, unique filename', () => {
    // If two players slug to the same name, one of them silently wears the
    // other's art and there is no error anywhere to tell you.
    const names = POOL.map((p) => slug(p.name));
    expect(names.every((n) => n.length > 0)).toBe(true);
    expect(new Set(names).size).toBe(POOL.length);

    const ids = POOL.map((p) => slug(p.id));
    expect(new Set(ids).size).toBe(POOL.length);
  });

  it('gives every pitcher a non-empty, unique filename', () => {
    const arms = Object.values(PITCHERS).flat();
    const names = arms.map((p) => slug(p.name));
    expect(names.every((n) => n.length > 0)).toBe(true);
    expect(new Set(names).size).toBe(arms.length);
  });
});

describe('lookup order — specific beats general, and _default catches all', () => {
  it('tries the id, then the name, then the default', () => {
    expect(spriteKeys('hu1', 'Cap Mullaney')).toEqual(['hu1', 'cap-mullaney', '_default']);
  });

  it('always ends at _default, so one file can dress the whole roster', () => {
    expect(spriteKeys()).toEqual(['_default']);
    expect(spriteKeys('ma2')).toEqual(['ma2', '_default']);
    expect(spriteKeys(undefined, 'The Gantry')).toEqual(['the-gantry', '_default']);
  });
});

/**
 * ⚠️ THE ROUND TRIP. This block exists because of a bug that shipped past the
 * two blocks above it.
 *
 * `slug()` was tested. `spriteKeys()` was tested. Neither test put a FILENAME
 * in one end and a LOOKUP out of the other, and that is where the fault was:
 * `slug('_default')` is `default`, because the underscore is not [a-z0-9] and
 * gets hyphenated and then stripped as leading punctuation. So the index
 * stored `batters/default` while every lookup asked for `batters/_default`,
 * and a `_default.png` sitting in the folder was globbed, counted, served over
 * HTTP, and never once drawn.
 *
 * It only turned up by running the game and looking at it. Every test here is
 * the same shape: a real filename in, a key that a real lookup asks for out.
 */
describe('a file on disk resolves to a lookup that asks for it', () => {
  /** The assertion the bug violated: what the index stores is what we ask for. */
  const resolves = (filename: string, id?: string, name?: string): boolean =>
    spriteKeys(id, name).some((k) => `batters/${k}` === indexKey('batters', filename));

  it('finds _default.png — the exact case that was broken', () => {
    expect(indexKey('batters', '_default.png')).toBe('batters/_default');
    expect(resolves('_default.png')).toBe(true);
    expect(resolves('_default.png', 'au3', 'Ty Brennan')).toBe(true);
  });

  it('does not mangle the sentinel into "default"', () => {
    expect(indexKey('batters', '_default.png')).not.toBe('batters/default');
  });

  it('finds a file named for the player', () => {
    expect(resolves('cap-mullaney.png', 'hu1', 'Cap Mullaney')).toBe(true);
    expect(resolves('hu1.png', 'hu1', 'Cap Mullaney')).toBe(true);
  });

  it('finds the awkward names, from either direction', () => {
    expect(resolves('unit-7-cletus.png', 'ma1', 'UNIT-7 "Cletus"')).toBe(true);
    expect(resolves('ma1.png', 'ma1', 'UNIT-7 "Cletus"')).toBe(true);
    expect(resolves('model-9.png', undefined, 'MODEL-9')).toBe(true);
  });

  it('does not resolve somebody else', () => {
    expect(resolves('cap-mullaney.png', 'ma2', 'Xandra Kō')).toBe(false);
  });

  it('strips any extension the glob accepts', () => {
    for (const ext of ['png', 'gif', 'webp']) {
      expect(indexKey('batters', `cap-mullaney.${ext}`)).toBe('batters/cap-mullaney');
    }
  });

  it('is case-insensitive about the sentinel too', () => {
    expect(indexKey('batters', '_DEFAULT.PNG')).toBe('batters/_default');
  });

  it('resolves every player in the pool against a file named after him', () => {
    // The whole roster, both naming schemes, end to end.
    for (const p of POOL) {
      expect(resolves(`${slug(p.name)}.png`, p.id, p.name)).toBe(true);
      expect(resolves(`${slug(p.id)}.png`, p.id, p.name)).toBe(true);
    }
  });
});

describe('sizing — any resolution of art lands the right size', () => {
  const batter = SPRITE_SPECS.batters;

  it('scales to the spec height and keeps the aspect ratio', () => {
    // A 32px drawing and a 512px drawing of the same thing must come out
    // identical on screen, or "drop the file in" turns into "drop the file in
    // and then tune four numbers".
    const small = fitBox(16, 32, batter);
    const large = fitBox(256, 512, batter);
    expect(small.h).toBe(batter.height);
    expect(large.h).toBe(batter.height);
    expect(small.w).toBeCloseTo(large.w, 6);
  });

  it('keeps a wide sprite wide', () => {
    const wide = fitBox(64, 32, batter);
    expect(wide.w / wide.h).toBeCloseTo(2, 6);
  });

  it('refuses to divide by a zero-sized image', () => {
    // A still-decoding or broken image reports 0x0. Infinity here would smear
    // a NaN across the canvas rather than falling back to the shell.
    expect(fitBox(0, 0, batter)).toEqual({ w: 0, h: 0 });
    expect(fitBox(32, 0, batter)).toEqual({ w: 0, h: 0 });
  });
});

describe('anchoring — a taller drawing grows upward, it does not sink', () => {
  it('stands a figure on the point it is drawn at', () => {
    // 'feet' is why a 92px batter and a 140px batter both have their shoes in
    // the batter's box instead of one of them buried to the knee.
    const short = anchorAt(100, 400, 26, 92, 'feet');
    const tall = anchorAt(100, 400, 26, 140, 'feet');
    expect(short.y + 92).toBe(400);
    expect(tall.y + 140).toBe(400);
    expect(short.x).toBe(tall.x);
  });

  it('centres a ball on the point it is drawn at', () => {
    expect(anchorAt(100, 200, 16, 16, 'centre')).toEqual({ x: 92, y: 192 });
  });
});

describe('handedness', () => {
  it('draws right-handers unmirrored', () => {
    // The camera is behind the catcher, so a right-hander stands on the left
    // of the screen — which is the pose the art is drawn in.
    expect(facing('R')).toBe(1);
    expect(facing('L')).toBe(-1);
  });
});

describe('a missing asset is an ordinary answer, never an error', () => {
  const KINDS: SpriteKind[] = ['batters', 'pitchers', 'ball', 'field', 'fielders'];

  it('returns null rather than throwing when there is no art and no DOM', () => {
    // Deliberately NOT "assets/ is empty" — that was the first version of this
    // test and it would have started failing the day Zane added his first PNG,
    // which is the one day it must not. What is being locked is that a lookup
    // with nothing behind it is an ordinary null, in an environment with no
    // Image constructor at all.
    for (const kind of KINDS) {
      expect(sprite(kind, 'nobody-at-all', 'Nobody At All')).toBeNull();
    }
  });

  it('does not throw for a player who has no art', () => {
    for (const p of POOL) {
      expect(() => sprite('batters', p.id, p.name)).not.toThrow();
    }
  });

  it('reports how many it found without needing any to exist', () => {
    expect(assetCount()).toBeGreaterThanOrEqual(0);
  });

  it('declares a spec for every kind it can be asked for', () => {
    // A kind without a spec would be an undefined height and a NaN scale.
    for (const kind of KINDS) {
      expect(SPRITE_SPECS[kind].height).toBeGreaterThan(0);
      expect(['feet', 'centre']).toContain(SPRITE_SPECS[kind].anchor);
    }
  });
});
