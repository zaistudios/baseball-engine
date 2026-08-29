/**
 * Ship the one-file build as a GitHub release. `npm run release`.
 *
 * The release is the DELIVERABLE and the repo is not. `dist/` is gitignored on
 * purpose — the built html changes wholesale every time and does not belong in
 * git history — which means a clone of this repo is not something you can play:
 * game.html loads `/src/game/main.ts`, and a browser will neither execute
 * TypeScript nor fetch a module over file://. The release is how the game gets
 * to a machine that has no Node and no network: download one file, double-click
 * it. See the README.
 *
 * Bump first, then release:
 *
 *   npm version patch --no-git-tag-version   # or minor / major
 *   npm run release
 *
 * ⚠️ THE VERSION IS NOT BUMPED HERE. Whether a change is a patch or a minor is
 * a judgement about what moved, and a script that guesses it would eventually
 * ship a gameplay change as a patch. This refuses to reuse a version instead.
 *
 * `--dry-run` does every check and prints the commands without pushing a tag
 * or creating anything. That is also how this file is tested — there is no
 * pleasant way to unit-test `gh release create`.
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const dry = process.argv.includes('--dry-run');

const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();
/** Same, but a non-zero exit is an answer rather than a crash. */
const tryRun = (cmd, args) => {
  try {
    return run(cmd, args);
  } catch {
    return null;
  }
};
const die = (msg) => {
  console.error(`\n  release stopped: ${msg}\n`);
  process.exit(1);
};

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const tag = `v${version}`;
const file = `dist/baseball-engine-${tag}.html`;

// ---- the build has to exist, and `npm run release` is what puts it there.
// Checked anyway: running this file directly is the obvious way to skip it,
// and a release with no asset is worse than no release.
if (!existsSync(file)) die(`${file} is missing — run \`npm run export\` first`);

// ---- ⚠️ THE ONE THAT MATTERS. A release built from a dirty tree ships code
// that is not in the tag, so nobody — including you — can ever rebuild the
// file somebody downloaded. Everything else here is convenience; this is the
// promise the tag makes.
const dirty = run('git', ['status', '--porcelain']);
if (dirty) die(`working tree is dirty, so the tag would not describe the build:\n${dirty}`);

// ---- a tag that already exists is a version that was already shipped.
if (tryRun('git', ['rev-parse', '-q', '--verify', `refs/tags/${tag}`])) {
  die(`${tag} already exists locally — bump the version in package.json`);
}
if (tryRun('git', ['ls-remote', '--exit-code', 'origin', `refs/tags/${tag}`])) {
  die(`${tag} is already on the remote — bump the version in package.json`);
}

// ---- the commit has to be on the remote. Pushing a tag carries its objects
// but does NOT move the branch, so releasing here would leave main behind a
// tag that points at a commit nobody can find by browsing the repo.
const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
if (run('git', ['rev-parse', 'HEAD']) !== tryRun('git', ['rev-parse', `origin/${branch}`])) {
  die(`HEAD is not what origin/${branch} points at — push your commits first`);
}

const steps = [
  ['git', ['tag', '-a', tag, '-m', tag]],
  ['git', ['push', 'origin', tag]],
  ['gh', ['release', 'create', tag, file,
    '--title', `${tag} — Baseball Engine`,
    '--generate-notes',
    // The one line the notes must not lose. Generated notes are appended
    // under it, so the commit log still tells the story.
    '--notes', `**Download \`baseball-engine-${tag}.html\` below and double-click it.** ` +
      `That is the whole install — one file, no Node, no clone, no network. Works off a USB stick.\n`,
  ]],
];

console.log(`\n  ${tag}  ${file}\n`);
for (const [cmd, args] of steps) {
  console.log(`  ${dry ? 'would run' : 'running '}  ${cmd} ${args.map((a) => (a.includes(' ') ? `"${a.slice(0, 40)}…"` : a)).join(' ')}`);
  if (!dry) run(cmd, args);
}
console.log(
  dry
    ? '\n  dry run — nothing was tagged, pushed or published.\n'
    : `\n  released: ${tryRun('gh', ['release', 'view', tag, '--json', 'url', '-q', '.url']) ?? tag}\n`,
);
