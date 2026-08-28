/**
 * Regenerate the `perfect` and `good` outcome rows for a new home-run target.
 *
 * The increase is taken from the OTHER HIT outcomes in proportion, never from
 * the outs — so the out rate (and therefore batting average and the whole run
 * environment) is preserved, and only the SHAPE of the hits changes. A ball
 * that used to be a double now sometimes leaves the yard.
 */
import { OUTCOME_TABLES, type OutcomeTable, type PitchType } from '../src/core/hitTables.ts';

const TARGET_PERFECT: Record<PitchType, number> = {
  fastball: 0.19, slider: 0.17, curveball: 0.15, knuckleball: 0.13, changeup: 0.12,
};
const TARGET_GOOD: Record<PitchType, number> = {
  fastball: 0.035, slider: 0.03, curveball: 0.025, knuckleball: 0.02, changeup: 0.02,
};

function retarget(t: OutcomeTable, hr: number): OutcomeTable {
  const others = t.single + t.double + t.triple;
  const hitsTotal = others + t.home_run;
  const left = hitsTotal - hr;
  if (left <= 0 || others <= 0) throw new Error('target too high');
  const k = left / others;
  return { ...t, single: t.single * k, double: t.double * k, triple: t.triple * k, home_run: hr };
}

/**
 * Round to 3dp AND make the row sum to exactly 1.
 *
 * ⚠️ Rounding each entry independently lost up to 0.001 per row, and
 * rollOutcome() treats missing probability mass as a silent fall-through to
 * ground_out — so a row summing to 0.999 quietly biases the game. The residual
 * is absorbed into the LARGEST entry, where it is proportionally invisible.
 */
function row(t: OutcomeTable): OutcomeTable {
  const keys = Object.keys(t) as (keyof OutcomeTable)[];
  const out = {} as OutcomeTable;
  for (const k of keys) out[k] = Math.round(t[k] * 1000) / 1000;
  const sum = keys.reduce((a, k) => a + out[k], 0);
  const residual = Math.round((1 - sum) * 1000) / 1000;
  const biggest = keys.reduce((a, b) => (out[a] >= out[b] ? a : b));
  out[biggest] = Math.round((out[biggest] + residual) * 1000) / 1000;
  return out;
}

const f = (n: number) => String(n);

for (const [grade, targets] of [['perfect', TARGET_PERFECT], ['good', TARGET_GOOD]] as const) {
  console.log(`  ${grade}: {`);
  for (const p of ['fastball', 'curveball', 'changeup', 'slider', 'knuckleball'] as PitchType[]) {
    const t = row(retarget(OUTCOME_TABLES[grade][p], targets[p]));
    const sum = Object.values(t).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) > 1e-9) throw new Error(`${grade}/${p} sums to ${sum}`);
    console.log(
      `    ${p}: t(${f(t.strikeout)}, ${f(t.popup)}, ${f(t.ground_out)}, ${f(t.line_out)}, ` +
        `${f(t.foul)}, ${f(t.single)}, ${f(t.double)}, ${f(t.triple)}, ${f(t.home_run)}),`,
    );
  }
  console.log('  },');
}
