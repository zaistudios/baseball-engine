/** Play a whole franchise as a real club, taking every moment, no UI. */
import { newSeason, playDay, standings, seasonOver, dayLabel, champion, teamOf, yourGame } from '../src/game/franchise.ts';
import { momentOn, decide, valueShift } from '../src/game/moments.ts';
import { simulateGame } from '../src/game/sim.ts';
import { clubValue } from '../src/game/value.ts';

for (const you of ['OKC', 'NYE', 'MNE']) {
  let s = newSeason(you, 20260826);
  console.log(`\n===== ${you} — start value ${clubValue(teamOf(s, you)).toFixed(3)}, plays ${teamOf(s, you).identity!.name} =====`);

  while (!seasonOver(s)) {
    const ask = momentOn(s);
    if (ask) {
      console.log(`\n  [${dayLabel(s)}] ${ask.headline}`);
      console.log(`  ${ask.body}`);
      ask.choices.forEach((c, i) => console.log(`    ${i}) ${c.label} — ${c.detail}`));
      const before = s;
      s = decide(s, ask, 0);
      console.log(`    -> took "${ask.choices[0]!.label}", roster shift ${valueShift(before, s) >= 0 ? '+' : ''}${valueShift(before, s).toFixed(3)}`);
    }
    const mine = yourGame(s);
    if (mine) {
      const { game } = simulateGame(s.seed + s.day * 31, 9, teamOf(s, mine.home), teamOf(s, mine.away));
      s = playDay(s, { ...mine, day: s.day, hr: game.homeState.runs, ar: game.awayState.runs, hh: game.homeState.hits, ah: game.awayState.hits });
    } else {
      s = playDay(s);
    }
  }

  const table = standings(s);
  const row = table.find((r) => r.abbr === you)!;
  console.log(`\n  finished ${row.w}-${row.l}, ${table.findIndex((r) => r.abbr === you) + 1} of 30, value ${clubValue(teamOf(s, you)).toFixed(3)}, plays ${teamOf(s, you).identity!.name}`);
  console.log(`  champion: ${champion(s)}`);
  for (const n of (s.news ?? []).filter((x) => x.kind === 'roster')) console.log(`  wire day ${n.day}: ${n.text}`);
}
