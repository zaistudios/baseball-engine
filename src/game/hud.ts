/**
 * THE SITUATION BUG — the strip a broadcast keeps in the corner while the ball
 * is in the air: inning, count, outs, who is on, who is up, who is throwing.
 *
 * ⚠️ IT DRAWS THE STATE IT IS HANDED AND READS NOTHING ELSE. main.ts hands it
 * onScreen(), which is the game as it stood before the play until the replay
 * of that play is over — so the outs and the bags cannot get ahead of the
 * picture. A helper that reached for the live game would be the spoiler the
 * snapshot exists to stop; see `shown` in main.ts and prePlay.test.ts.
 *
 * ⚠️ FIXED CELLS, FIXED ORDER. Every cell is always there and always the same
 * width class, so a long name wraps inside its own cell and never moves the
 * count. The stage below it must not jump while somebody is timing a bat.
 */
import { armCondition } from './bullpen.ts';
import { currentBatter, currentPitcher, fieldingStaff, onDeck, battingSide, type GameState } from './game.ts';
import type { Side } from './game.ts';
import { batSpeedLabel } from './swing.ts';
import { statsOf } from './teams.ts';

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' }[c]};`);

/** "1ST", "2ND", "11TH". */
export const ordinal = (n: number): string => {
  const t = n % 100;
  const s = t >= 11 && t <= 13 ? 'TH' : (['TH', 'ST', 'ND', 'RD'][n % 10] ?? 'TH');
  return `${n}${s}`;
};

/** A row of lamps, `lit` of `of` on. Text for a screen reader goes beside it. */
const lamps = (lit: number, of: number, cls: string): string =>
  `<span class="lamps ${cls}" aria-hidden="true">${Array.from(
    { length: of },
    (_, i) => `<i${i < lit ? ' class="on"' : ''}></i>`,
  ).join('')}</span>`;

/** Who is on, as a little diamond: first, second, third. */
const diamond = (bases: readonly unknown[]): string => {
  const on = bases.map((b) => b !== null);
  const names = ['1st', '2nd', '3rd'].filter((_, i) => on[i]);
  const said = names.length === 0 ? 'bases empty' : `on ${names.join(', ')}`;
  return (
    `<span class="bags" role="img" aria-label="${said}">` +
    `<i class="b2${on[1] ? ' on' : ''}"></i><i class="b3${on[2] ? ' on' : ''}"></i>` +
    `<i class="b1${on[0] ? ' on' : ''}"></i></span>`
  );
};

/**
 * The strip, as HTML. `count` is the at-bat's — it belongs to the man at the
 * plate, and between at-bats it is the fresh 0-0 of the next one.
 */
export function situationHtml(
  g: GameState,
  count: { balls: number; strikes: number },
  you: Side,
): string {
  const b = currentBatter(g);
  const staff = fieldingStaff(g);
  const cond = armCondition(staff);
  const youBat = battingSide(g) === you;
  const top = g.half === 'top';

  return (
    `<div class="sit-cell sit-inning" aria-label="${top ? 'top' : 'bottom'} of the ${ordinal(g.inning).toLowerCase()}">` +
    `<span class="arrow" aria-hidden="true">${top ? '▲' : '▼'}</span><b>${ordinal(g.inning)}</b></div>` +
    `<div class="sit-cell sit-count" aria-label="${count.balls} balls, ${count.strikes} strikes, ${g.outs} out">` +
    `<span class="lbl">B</span>${lamps(count.balls, 3, 'ball')}` +
    `<span class="lbl">S</span>${lamps(count.strikes, 2, 'strike')}` +
    `<span class="lbl">O</span>${lamps(g.outs, 2, 'out')}` +
    `<span class="num" aria-hidden="true">${count.balls}-${count.strikes}</span></div>` +
    `<div class="sit-cell sit-bases">${diamond(g.bases)}</div>` +
    `<div class="sit-cell sit-who">` +
    `<span class="role${youBat ? ' you' : ''}">${youBat ? 'YOU BAT' : 'AT BAT'}</span>` +
    `<b class="name">${b.pos ? `<span class="dim">${esc(b.pos)}</span> ` : ''}${esc(b.name)}</b>` +
    // The bat speed is shown because the check swing is what makes it matter:
    // a heavy bat arrives late AND gives you longer to change your mind.
    `<span class="dim sub">${b.bats} · ${batSpeedLabel(statsOf(b).power)} · next ${esc(onDeck(g).name)}</span></div>` +
    `<div class="sit-cell sit-who">` +
    `<span class="role${youBat ? '' : ' you'}">${youBat ? 'PITCHING' : 'YOU PITCH'}</span>` +
    `<b class="name">${esc(currentPitcher(g).name)}</b>` +
    `<span class="dim sub">${staff.current.pitches} pitches · <span class="cond ${cond}">${cond}</span></span></div>`
  );
}
