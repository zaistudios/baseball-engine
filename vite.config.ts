import { defineConfig } from 'vite';

/**
 * Build config exists for exactly one reason: the demo has to run from a
 * file:// URL.
 *
 * `npm run demo` folds the build into a single html file you open by
 * double-clicking on whatever device you are testing on. Browsers treat
 * file:// as an opaque origin and refuse to fetch ES modules across it, so the
 * default `<script type="module">` output is the wrong shape for that — an
 * inline module has no fetch and would probably survive, but "probably" is not
 * what you want in the one artifact whose whole job is to open anywhere.
 *
 * `iife` gives a plain classic script instead, which has never had an origin
 * restriction. bundle.mjs then drops it at the end of <body>, because a
 * classic script runs where it sits and main.ts reads the DOM at module scope.
 *
 * ponytail: no plugins, no polyfills, no legacy target. Two build settings.
 * Everything else vite already does correctly.
 */
export default defineConfig({
  base: './',
  build: {
    modulePreload: false,
    /**
     * EVERY ASSET IS INLINED AS A data: URI, whatever its size.
     *
     * The default is 4kB, above which vite emits a separate file next to the
     * bundle. That would break the demo twice over: scripts/bundle.mjs asserts
     * the build produced exactly ONE asset to inline and throws otherwise, and
     * the resulting html is opened by double-click from a file:// origin where
     * there is no server to serve a sibling PNG from anyway.
     *
     * The cost is that art lands in the html as base64, at about 4/3 its size
     * on disk. Twenty batter sprites at a few kB each is nothing against the
     * 16MB artifact ceiling; a folder of full-resolution photographs would not
     * be, and bundle.mjs prints the file size on every build so that shows up
     * the moment it starts to matter.
     */
    assetsInlineLimit: () => true,
    rollupOptions: {
      output: {
        format: 'iife',
        // One chunk. Code-splitting an iife bundle is not a thing, and a
        // single-file demo has nothing to split anyway.
        inlineDynamicImports: true,
      },
    },
  },
});
