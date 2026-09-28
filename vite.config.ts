import { defineConfig } from 'vite';

/**
 * The build exists for one reason: the game has to run from a file:// URL.
 *
 * scripts/bundle.mjs folds the build into a single html file you open by
 * double-clicking. Browsers refuse to fetch ES modules across a file://
 * origin, so the output is a classic `iife` script, which bundle.mjs drops at
 * the end of <body> because main.ts reads the DOM at module scope.
 */
export default defineConfig({
  base: './',
  build: {
    // bundle.mjs reads the build from here and writes the one-file game up in dist/.
    outDir: 'dist/build-game',
    modulePreload: false,
    /**
     * EVERY ASSET IS INLINED AS A data: URI, whatever its size. bundle.mjs
     * asserts the build produced exactly one asset, and a file opened from
     * disk has no server to fetch a sibling PNG from anyway.
     */
    assetsInlineLimit: () => true,
    rollupOptions: {
      input: 'game.html',
      output: {
        format: 'iife',
        inlineDynamicImports: true,
      },
    },
  },
});
