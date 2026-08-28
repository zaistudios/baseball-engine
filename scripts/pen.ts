/** Does the bullpen actually get used, and does fatigue show up in the box? */
import { simulateGame } from '../src/game/sim.ts';
import { GASSED_AT, FRESH_UNTIL } from '../src/game/bullpen.ts';

const N = 300;
let relievers = 0, maxPitches = 0, starterPitches = 0, gassedLeftIn = 0;
const pitchCounts: number[] = [];
for (let s = 0; s < N; s++) {
  const { game } = simulateGame(s * 7919 + 13);
  for (const st of [game.homeState, game.awayState]) {
    relievers += st.staff.used.length;
    starterPitches += (st.staff.used[0] ? -1 : st.staff.current.pitches);
    pitchCounts.push(st.staff.current.pitches);
    maxPitches = Math.max(maxPitches, st.staff.current.pitches);
    if (st.staff.current.pitches > GASSED_AT && st.staff.bullpen.length > 0) gassedLeftIn++;
  }
}
console.log(`relief appearances per game  ${(relievers / N).toFixed(2)}`);
console.log(`max pitches by one arm       ${maxPitches}  (gassed at ${GASSED_AT}, fresh to ${FRESH_UNTIL})`);
// NOT a defect: this is measured AT GAME END, so it can only catch an arm whose
// last at-bat pushed him past the line — the game finished before the manager
// got his between-batters chance to act. Relief is decided between batters.
console.log(`past the line at the final out    ${gassedLeftIn} / ${N * 2}`);

pitchCounts.sort((a, b) => a - b);
const q = (p: number) => pitchCounts[Math.floor(pitchCounts.length * p)];
console.log(`final arm pitch count: p50 ${q(0.5)}  p90 ${q(0.9)}  p99 ${q(0.99)}  max ${pitchCounts[pitchCounts.length-1]}`);
const stranded = pitchCounts.filter((x) => x > 130).length;
console.log(`arms over 130 pitches  ${stranded} / ${pitchCounts.length}`);
