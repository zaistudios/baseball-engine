/**
 * What the league screen's document actually weighs. `node scripts/leaguedoc.ts`
 *
 * A textarea is only a usable editor if a person can find their club in it, so
 * the size of the exported document is a design fact rather than trivia — and
 * it is the number to re-read if a club ever grows a field.
 */
import { LEAGUE_AS_WRITTEN } from '../src/game/teams.ts';
import { checkLeague, serialiseLeague } from '../src/game/league.ts';

const text = serialiseLeague(LEAGUE_AS_WRITTEN);
const check = checkLeague(JSON.parse(text));

console.log(`clubs        ${LEAGUE_AS_WRITTEN.length}`);
console.log(`characters   ${text.length.toLocaleString()}`);
console.log(`lines        ${text.split('\n').length.toLocaleString()}`);
console.log(`per club     ${Math.round(text.length / LEAGUE_AS_WRITTEN.length)} characters`);
console.log(`round trip   ${check.ok ? 'ok' : 'BROKEN'}`);
if (!check.ok) for (const p of check.problems) console.log(`  ${p}`);
