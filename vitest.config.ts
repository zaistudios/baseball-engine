/**
 * Vitest's own config, and it exists for one line: src/web does not run.
 *
 * ⚠️ WITHOUT THIS FILE VITEST READS vite.config.ts, which is the BUILD config
 * and says nothing about tests — so the default glob picked up the roguelike's
 * three remaining suites and `npm run check` was still gated on a frozen app.
 * tsconfig.json already excludes the folder from typecheck; this is the other
 * half of the same decision, and the two have to agree or `check` half-ignores
 * it.
 *
 * ponytail: a config file rather than an --exclude flag in the npm script,
 * because the flag would have to be repeated on `test`, `test:watch` and
 * `coverage`, and the one that got missed would be the one that failed at an
 * awkward moment.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // The defaults, plus the roguelike. Vitest replaces this list rather than
    // adding to it, so node_modules and dist have to be repeated here.
    exclude: ['**/node_modules/**', '**/dist/**', 'src/web/**'],
  },
});
