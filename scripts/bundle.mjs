/**
 * Fold the build into ONE html file.
 *
 * That file is the whole demo: double-click it to play offline, drag it into
 * itch.io, drop it on any static host, put it on a USB stick, email it. No
 * server, no asset paths, nothing to break when it moves. For a game that is
 * canvas + DOM + Web Audio with zero external assets, a single file is the
 * honest shape of the thing.
 *
 * ponytail: a replace over one <script> tag, not vite-plugin-singlefile. The
 * build emits exactly one JS chunk and no CSS file — the stylesheet already
 * lives inline in index.html — so there is nothing else to inline. Both
 * assumptions throw below rather than silently shipping half a game.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));

/**
 * WHICH PAGE WAS BUILT. 'index' is the roguelike, 'game' is the baseball game.
 *
 * Passed as argv rather than inferred, because both land in dist/ and guessing
 * wrong would ship a confident, working, entirely different game.
 */
const page = process.argv[2] ?? 'index';
const NAMES = { index: 'all-star-baseball', game: 'baseball-engine' };
const TITLES = { index: 'All-Star Baseball', game: 'Baseball Engine' };
if (!NAMES[page]) {
  throw new Error(`unknown page ${page}`);
}

const html = readFileSync(`dist/${page}.html`, "utf8");

const assets = readdirSync('dist/assets');
if (assets.length !== 1) {
  // Almost always means an image escaped inlining. vite.config.ts forces
  // assetsInlineLimit so every PNG under assets/ becomes a data: URI inside
  // the bundle; a file appearing here means something bypassed that, and the
  // demo would ship looking for a sibling file it will never find on file://.
  throw new Error(
    `expected one built asset to inline, got: ${assets.join(', ')}\n` +
      `If any of those are images, check build.assetsInlineLimit in vite.config.ts.`,
  );
}
const js = readFileSync(`dist/assets/${assets[0]}`, 'utf8');

// A literal </script> in the bundle would close the tag early and the page
// would render the rest of the game as text. Nothing in this codebase writes
// one, but "nothing does yet" is how that bug always ships.
if (js.includes('</script>')) {
  throw new Error('bundle contains a literal </script> — it cannot be inlined as-is');
}

// A CLASSIC script, at the END of <body>, and both halves of that matter.
//
// Classic: browsers refuse to fetch ES modules across a file:// origin, and
// this file's whole job is to open by double-click on someone else's device.
// vite.config.ts builds iife output so there is no module syntax left to lose.
//
// End of body: a classic script runs where it sits, and main.ts reads the DOM
// at module scope. Vite puts its tag in <head>, where a module's implicit
// defer saved it. Nothing defers this one, so it has to come after the markup.
const stripped = html.replace(/\s*<script\b[^>]*\bsrc="[^"]*"[^>]*><\/script>/, '');
if (stripped === html) throw new Error('found no external <script> tag to inline');

// Function replacement, so $& and friends inside the bundle stay literal.
const out = stripped.replace(/(\s*)<\/body>/, () => `\n<script>\n${js}\n</script>\n  </body>`);
if (out === stripped) throw new Error('found no </body> to put the bundle before');

const file = `dist/${NAMES[page]}-v${version}.html`;
writeFileSync(file, out);
console.log(`${file} — ${(out.length / 1024).toFixed(0)} kB, one file, plays offline`);

/**
 * The same game again, as a fragment.
 *
 * Claude Artifacts supply their own <!doctype>, <html>, <head> and <body> and
 * wrap whatever you hand them, so the standalone file above cannot be posted
 * as-is — its own document tags would nest inside theirs. This strips the
 * shell and keeps the style, the markup and the inlined script.
 *
 * Written to a fixed path on purpose: republishing an artifact means handing
 * the same file path back, so this must not carry the version in its name.
 *
 * ponytail: string surgery on a file this build produced, not a parser. It is
 * our own known-shape output, and the assertion below is the whole safety net.
 */
const fragment = out
  .replace(/^[\s\S]*?<head>/, '')
  .replace(/<\/head>\s*<body>/, '')
  .replace(/<\/body>\s*<\/html>\s*$/, '')
  .replace(/<meta\b[^>]*>\s*/g, '')
  .replace(/<title>[\s\S]*?<\/title>\s*/, '');

if (/<(!doctype|html|head|body)\b/i.test(fragment)) {
  throw new Error('document tags survived the strip — the artifact would nest documents');
}

writeFileSync(`dist/artifact-${page}.html`, `<title>${TITLES[page]}</title>\n${fragment}`);
console.log(`dist/artifact-${page}.html — same game, shell stripped, ready to publish`);
