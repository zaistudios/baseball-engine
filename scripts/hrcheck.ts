/** Home run rate on a perfect swing, across the power range. */
import { makeRng } from '../src/core/rng.ts';
import { resolveSwing } from '../src/core/hit.ts';

for (const power of [0.65, 0.8, 1.0, 1.2, 1.5, 1.8]) {
  const rng = makeRng(4242);
  let hr = 0;
  const N = 40000;
  for (let i = 0; i < N; i++) {
    const r = resolveSwing(
      { offsetMs: 0, pitchType: 'fastball', stats: { power, contact: 1, clutch: 1 } },
      rng,
    );
    if (r.outcome === 'home_run') hr++;
  }
  console.log(`power ${power.toFixed(2)}   perfect-swing HR ${((hr / N) * 100).toFixed(1)}%`);
}
