/**
 * A playable at-bat in the terminal. `npm run play`.
 *
 * There is no renderer yet, so this is the stand-in — and it is not a toy: it
 * drives the real core with the real clock. The ball's arrival is computed by
 * ballArrivalMs() from the pitch's launch timestamp and speed, the swing is
 * read from the keypress timestamp, and the two are subtracted by
 * computeOffsetMs(). That is the timing rule the whole rebuild exists for,
 * exercised end to end against a human instead of a test.
 *
 * The design shows up on its own here: the tell names the pitch, the pitch
 * names the speed, and the speed is what tells you when to swing. Face the
 * Ace, who tells you nothing, and the only thing left is the count — he is
 * still pitching to a plan, he just will not tell you which part of it.
 *
 * ponytail: node's built-in type stripping runs this file directly, so no
 * bundler and no ts-node. Raw stdin, no readline, no dependency.
 */

import { stdin, stdout, argv, exit } from 'node:process';
import { makeRng, seedFromString } from '../core/rng.ts';
import { ballArrivalMs, computeOffsetMs, TIMING_WINDOWS_MS } from '../core/timing.ts';
import {
  PITCHERS,
  pitcherFor,
  scoutingReport,
  throwPitch,
  type Pitcher,
} from '../core/pitcher.ts';
import type { PitchType } from '../core/hitTables.ts';
import { newAtBat, swingAt, takePitch, isOver, type AtBatState } from '../core/atBat.ts';
import { newMatch, recordAtBat, type Bases, type MatchState } from '../core/inning.ts';
import { INNINGS_PER_MATCH } from '../core/run.ts';

const SLOW = argv.includes('--slow') ? 2.5 : 1;
const DIVISION = argv.find((a) => a in PITCHERS) ?? 'holdouts';
const MATCH = Number(argv.find((a) => /^--match=/.test(a))?.slice(8) ?? 1);
const SEED = argv.find((a) => a.startsWith('--seed='))?.slice(7) ?? String(Date.now());

const write = (s: string) => stdout.write(s);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Resolves on the first keypress, or null if the window closes first. */
function readKey(windowMs: number): Promise<{ key: string; at: number } | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: { key: string; at: number } | null) => {
      if (done) return;
      done = true;
      stdin.off('data', onData);
      clearTimeout(timer);
      resolve(v);
    };
    const onData = (buf: Buffer) => {
      const at = performance.now();
      const key = buf.toString();
      if (key === '') {
        write('\n\nbye.\n');
        exit(0);
      }
      finish({ key, at });
    };
    const timer = setTimeout(() => finish(null), windowMs);
    stdin.on('data', onData);
  });
}

const BASES = (b: Bases) =>
  b.some(Boolean)
    ? b.map((r, i) => (r ? ['1st', '2nd', '3rd'][i] : null)).filter(Boolean).join(' ')
    : 'bases empty';

function scoreboard(m: MatchState, ab: AtBatState, p: Pitcher) {
  write(
    `\n  ── inning ${m.inning}/${m.innings} · ${m.outs} out · ${BASES(m.bases)} · ${m.runs} run${m.runs === 1 ? '' : 's'}` +
      ` · vs ${p.name}\n     count ${ab.balls}-${ab.strikes}\n`,
  );
}

async function main() {
  const pitcher = pitcherFor(DIVISION, MATCH);
  const rng = makeRng(seedFromString(SEED));
  let match = newMatch(INNINGS_PER_MATCH);

  write(`\n  BASEDBALL — terminal at-bat\n`);
  write(`  facing ${pitcher.name} — ${pitcher.blurb}\n`);
  write(`  ${DIVISION} #${MATCH} · seed ${SEED}${SLOW > 1 ? ' · SLOW' : ''}\n`);
  write(`  SPACE swings, T takes, S sends the runner, Ctrl-C quits.\n`);
  write(`  ${scoutingReport(pitcher)}\n`);
  write(`  ${pitcher.tellTiming === 'none' ? 'This one tips nothing. Read the count.' : `Watch for the tell (${pitcher.tellTiming.replace('_', '-')}).`}\n`);

  stdin.setRawMode?.(true);
  stdin.resume();

  while (!match.over) {
    let ab = newAtBat();
    // Resets with the at-bat, because "what has he shown me" is a question
    // about THIS at-bat. Carrying it across turnovers would let the sequencing
    // rules read a pitch thrown to somebody else.
    const previous: PitchType[] = [];

    while (!isOver(ab)) {
      scoreboard(match, ab, pitcher);
      const pitch = throwPitch(
        pitcher,
        ab,
        // The terminal build has no lineup, so there is no batter to be
        // dangerous and nothing to pitch around — the bases it does have are
        // enough to make `firstBaseOpen` honest.
        { previous, firstBaseOpen: match.bases[0] === null, outs: match.outs },
        rng,
      );
      previous.push(pitch.type);

      if (pitch.tell?.timing === 'pre_pitch') {
        write(`     he's gripping a ${pitch.tell.pitch.toUpperCase()}\n`);
        await sleep(700);
      }

      write('     winding up');
      for (let i = 0; i < 3; i++) {
        await sleep(260);
        write('.');
      }

      // RELEASE. Everything below is on one continuous clock.
      const launch = performance.now();
      const arrival = ballArrivalMs(launch, pitch.speedMph / SLOW);
      write(`\n     ▸ RELEASE`);
      if (pitch.tell?.timing === 'release') write(`  ...looks like a ${pitch.tell.pitch}`);
      write('\n');

      // Stay open past arrival so a late swing is still a late swing, not a take.
      const press = await readKey(arrival - performance.now() + TIMING_WINDOWS_MS.contact + 150);

      if (!press || press.key.toLowerCase() === 't') {
        write(
          pitch.hitBatter
            ? `     it rides up and in — you wear it.\n`
            : `     you take it — ${pitch.location}. ${pitch.inZone ? 'STRIKE.' : 'Ball.'}\n`,
        );
        ab = takePitch(ab, pitch.inZone, pitch.hitBatter);
        continue;
      }

      const offsetMs = computeOffsetMs(press.at, arrival);
      const before = ab;
      ab = swingAt(ab, { offsetMs, pitchType: pitch.type, location: pitch.location }, rng);

      const sign = offsetMs < 0 ? 'early' : 'late';
      write(`     swing — ${Math.abs(offsetMs).toFixed(0)}ms ${sign} (${pitch.type})\n`);

      if (isOver(ab) && ab.result?.kind === 'in_play') {
        write(`     ▶ ${ab.result.hit.outcome.replace('_', ' ').toUpperCase()}\n`);
      } else if (ab.strikes > before.strikes) {
        write(`     strike.\n`);
      } else {
        write(`     fouled off.\n`);
      }
    }

    if (ab.result?.kind === 'strikeout') write(`     ▶ STRUCK OUT.\n`);
    if (ab.result?.kind === 'walk') write(`     ▶ WALK. Patience paid.\n`);
    if (ab.result?.kind === 'hit_by_pitch') write(`     ▶ HIT BY PITCH. Take your base.\n`);

    const runsBefore = match.runs;
    match = recordAtBat(match, ab.result!);
    if (match.runs > runsBefore) write(`     ${match.runs - runsBefore} run(s) score!\n`);
  }

  write(`\n  ── FINAL: ${match.runs} run${match.runs === 1 ? '' : 's'} in ${match.innings} innings.\n`);
  write(`  same at-bats again: npm run play --  --match= --seed=\n\n`);
  exit(0);
}

main();
