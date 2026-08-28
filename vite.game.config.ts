/**
 * The one-file build for the BASEBALL GAME (game.html), as opposed to the
 * roguelike (index.html) that vite.config.ts builds.
 *
 * ponytail: a second config file rather than an env var, and the reason is
 * Windows. `ENTRY=game.html vite build` in an npm script runs through cmd.exe,
 * which has no such syntax, and fixing that means adding cross-env — a
 * dependency to set one string. Vite has no --input flag, so a config that
 * spreads the base one and overrides the entry is the smallest thing that
 * works on every platform.
 *
 * Everything else — iife output, one chunk, every asset inlined, base './' —
 * is inherited, because the reasons for all of it are the same: the file has
 * to open by double-click from a file:// URL on somebody else's machine.
 */
import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config.ts';

export default mergeConfig(
  base,
  defineConfig({
    build: {
      rollupOptions: { input: 'game.html' },
    },
  }),
);
