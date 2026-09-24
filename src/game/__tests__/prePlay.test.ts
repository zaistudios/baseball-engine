/**
 * THE MAP NEVER GETS AHEAD OF THE REPLAY — ZAIS-16 / ZAIS-22.
 *
 * The bags, the outs, the line score and the situation strip show the game as
 * it stood before the play until the replay is over. main.ts is a DOM entry
 * point and cannot be imported here (see the same note in look.test.ts), so
 * this reads its source and pins the three things the freeze is made of. Any
 * one of them going missing is the result on the screen before the picture.
 *
 * ponytail: a source read, not a run. It proves the wiring, not the pixels —
 * the filmstrip is what says the bags do not move in the first 300ms.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = readFileSync(fileURLToPath(new URL('../main.ts', import.meta.url)), 'utf8');

const body = (name: string): string => {
  const i = src.indexOf(`function ${name}(): void {\n`);
  expect(i, name).toBeGreaterThan(-1);
  return src.slice(i, src.indexOf('\n}\n', i));
};

describe('the picture waits for the replay', () => {
  it('starts every replay through playReplay(), which takes the pre-play game', () => {
    // The only assignments to `replay` are playReplay's own and the clears.
    const sets = [...src.matchAll(/\breplay = (.+);/g)].map((m) => m[1]);
    expect(sets.filter((v) => v !== 'null' && v !== 'r')).toEqual([]);
    expect(src.match(/\breplay = r;/g)).toHaveLength(1);
  });

  it('lets the snapshot go everywhere the replay goes', () => {
    const clears = [...src.matchAll(/\breplay = null;\n\s*(.+)/g)].map((m) => m[1]);
    expect(clears.length).toBeGreaterThan(0);
    for (const next of clears) expect(next).toBe('shown = null;');
  });

  it('draws the bags, the outs, the score and the situation from the snapshot', () => {
    for (const name of ['drawBases', 'renderScore', 'renderSituation']) {
      const b = body(name);
      expect(b, name).toContain('const g = onScreen();');
      // Not one read of the live game, and not through the helpers that make one.
      const code = b.replace(/\/\/.*$/gm, '').replace('press R for a new game', '');
      expect(code, name).not.toMatch(/\bgame\b|youBat\(\)|showingFinal\(\)/);
    }
  });

  it('redraws the strips when the snapshot clears', () => {
    expect(body('render')).toMatch(/const key = \[[^\]]*\bshown\b/);
  });
});
