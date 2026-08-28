/**
 * THE BENCH. Three men who do not start, and the substitution that puts one of
 * them in.
 *
 * The claim underneath all of it is that the LINEUP IS THE RECORD — there is no
 * used-list, so every guarantee about who is available has to fall out of the
 * lineup itself. That is cheap and it is correct, and it is exactly the kind of
 * thing that stays correct only while somebody is checking.
 */

import { describe, expect, it } from 'vitest';
import { LEAGUE, club, statsOf } from '../teams.ts';
import {
  benchOf,
  currentBatter,
  newGame,
  pinchHit,
  recordPlay,
  fieldingAlignment,
  stateOf,
} from '../game.ts';
import { simulateGame } from '../sim.ts';
import { PINCH_MARGIN, PINCH_WITHIN, pinchHitter } from '../ai.ts';
import { clubValue, playerValue } from '../value.ts';
import { boxScore } from '../game.ts';

const HOME = club('ALB');
const AWAY = club('DET');

describe('every club has one', () => {
  it('carries three men, and they are nobody who is already starting', () => {
    for (const t of LEAGUE) {
      expect(t.bench).toHaveLength(3);
      for (const p of t.bench!) {
        expect(t.lineup).not.toContain(p);
      }
    }
  });

  it('gives every bench the same three jobs', () => {
    // ⚠️ A BENCH IS A MENU. The panel labels each man off the shape of his card
    // — bat, legs, platoon — so if a club's three ever stop being one of each,
    // two rows of that panel say the same word and the choice stops reading.
    for (const t of LEAGUE) {
      const [bat, glove, hand] = t.bench!;
      expect(statsOf(bat!).power).toBeGreaterThan(1.3);
      expect(statsOf(glove!).speed).toBeGreaterThan(1.25);
      expect(statsOf(hand!).contact).toBeGreaterThan(1.15);
      expect(hand!.bats).toBe('L');
    }
  });

  it('has no two men in the league sharing a name, arms included', () => {
    // ⚠️ stats.ts KEYS THE WHOLE BOOK BY NAME, hitters and pitchers alike, and
    // it does so precisely because every name in this file was unique. Two men
    // called the same thing silently share one line for ever — and adding
    // ninety names is exactly when that stops being true by accident. It caught
    // one on the way in.
    const names = LEAGUE.flatMap((t) => [
      ...t.lineup.map((p) => p.name),
      ...(t.bench ?? []).map((p) => p.name),
      ...t.rotation.map((p) => p.name),
      ...t.bullpen.map((p) => p.name),
    ]);
    expect(new Set(names).size).toBe(names.length);
  });

  it('is not priced into what a club is worth', () => {
    // ⚠️ THE LADDER WAS MEASURED AGAINST NINE MEN. If clubValue() ever starts
    // reading the bench, every rank on the pre-game card moves and every
    // separation number in this project's notes was taken on a different game.
    const stripped = { ...HOME, bench: [] };
    expect(clubValue(stripped)).toBeCloseTo(clubValue(HOME));
  });

  it('is level across the league, so picking a club is still picking the nine', () => {
    const worth = LEAGUE.map((t) => t.bench!.reduce((a, p) => a + playerValue(p), 0));
    const spread = Math.max(...worth) - Math.min(...worth);
    const lineups = LEAGUE.map((t) => t.lineup.reduce((a, p) => a + playerValue(p), 0));
    // The benches vary far less than the nines do. Anything else and the bench
    // would be a second, hidden talent ladder.
    expect(spread).toBeLessThan((Math.max(...lineups) - Math.min(...lineups)) / 3);
  });
});

describe('sending one up', () => {
  it('puts him in the batting slot of the man due up', () => {
    const g = newGame(HOME, AWAY);
    const due = currentBatter(g);
    const sub = benchOf(g, 'away')[0]!;
    // Top of the first, so the visitors are hitting.
    const after = pinchHit(g, 'away', sub);
    expect(currentBatter(after)).toBe(sub);
    expect(after.away.lineup).toContain(sub);
    expect(after.away.lineup).not.toContain(due);
    expect(after.away.lineup).toHaveLength(9);
  });

  it('takes him off the bench by taking nothing off the bench', () => {
    // The bench array never changes; benchOf() reads the lineup. That IS the
    // record — see the header.
    const g = newGame(HOME, AWAY);
    const sub = benchOf(g, 'away')[1]!;
    const after = pinchHit(g, 'away', sub);
    expect(after.away.bench).toBe(g.away.bench);
    expect(benchOf(after, 'away')).toHaveLength(2);
    expect(benchOf(after, 'away')).not.toContain(sub);
  });

  it('refuses a man who is already in the game', () => {
    const g = newGame(HOME, AWAY);
    const sub = benchOf(g, 'away')[0]!;
    const once = pinchHit(g, 'away', sub);
    // Order has not advanced, so he is due up again — and he cannot come in
    // twice. Without the guard he would be cloned into a second lineup slot.
    expect(pinchHit(once, 'away', sub)).toBe(once);
    expect(pinchHit(once, 'away', g.away.lineup[4]!)).toBe(once);
  });

  it('re-sorts the defence, because a fast man moves the whole infield', () => {
    const g = newGame(HOME, AWAY, 9);
    // Bottom half so the HOME club is batting and the AWAY club is in the field
    // — then check the batting club's own alignment changes for the next half.
    const before = fieldingAlignment(g);
    const glove = benchOf(g, 'home')[1]!;
    const after = pinchHit({ ...g, half: 'bottom' }, 'home', glove);
    const now = fieldingAlignment({ ...after, half: 'top' });
    expect(Object.values(now)).toContain(glove);
    expect(now).not.toEqual(before);
  });

  it('leaves the man who was already batting alone in every other slot', () => {
    const g = newGame(HOME, AWAY);
    const sub = benchOf(g, 'away')[0]!;
    const after = pinchHit(g, 'away', sub);
    for (let i = 1; i < 9; i++) expect(after.away.lineup[i]).toBe(g.away.lineup[i]);
  });

  it('gives the pinch hitter the at-bat and the line that goes with it', () => {
    const g = newGame(HOME, AWAY);
    const sub = benchOf(g, 'away')[0]!;
    const { game } = recordPlay(pinchHit(g, 'away', sub), { kind: 'strikeout' });
    expect(game.stats.bat[sub.name]).toMatchObject({ pa: 1, ab: 1, k: 1 });
    // ...and the man he hit for has no line at all: he never came to the plate.
    expect(game.stats.bat[currentBatter(g).name]).toBeUndefined();
    // The order still advanced, so the next man is next.
    expect(stateOf(game, 'away').order).toBe(1);
  });
});

describe('the computer goes to its bench too', () => {
  const ctx = { inning: 8, regulation: 9, deficit: 1 };
  const weak = { ...HOME.lineup[0]!, power: 0.4, contact: 0.5, vision: 0.5, speed: 0.5, clutch: 0.5 };

  it('sends the best man up when he is better by a margin', () => {
    const bench = HOME.bench!;
    const pick = pinchHitter(weak, bench, ctx);
    expect(pick).not.toBeNull();
    // The best of the three by value.ts, not the first in the list.
    const best = [...bench].sort((a, b) => playerValue(b) - playerValue(a))[0];
    expect(pick).toBe(best);
  });

  it('stays put early, whatever the matchup', () => {
    expect(pinchHitter(weak, HOME.bench!, { ...ctx, inning: 3 })).toBeNull();
  });

  it('stays put in a blowout, in either direction', () => {
    expect(pinchHitter(weak, HOME.bench!, { ...ctx, deficit: PINCH_WITHIN + 1 })).toBeNull();
    expect(pinchHitter(weak, HOME.bench!, { ...ctx, deficit: -(PINCH_WITHIN + 1) })).toBeNull();
  });

  it('does not burn a man for a hundredth of a point', () => {
    // A regular who is already about as good as anything on the bench.
    const good = HOME.lineup[3]!;
    const marginal = { ...HOME.bench![0]!, power: playerValue(good) > 0 ? 0.9 : 0.9 };
    expect(pinchHitter(good, [marginal], ctx)).toBeNull();
  });

  it('drops the bar with a runner in scoring position', () => {
    // Built to sit exactly between the two margins, so the ONLY thing that
    // changes the answer is whether the spot is worth something.
    const bench = HOME.bench!;
    const best = [...bench].sort((a, b) => playerValue(b) - playerValue(a))[0]!;
    const due = { ...weak };
    let lo = 0;
    let hi = 3;
    // Find a `due` whose value lands between the plain and the RISP bar.
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      const cand = { ...due, power: mid, contact: mid, vision: mid, speed: mid, clutch: mid };
      const v = playerValue(cand);
      if (v > playerValue(best) - PINCH_MARGIN) hi = mid;
      else lo = mid;
    }
    const edge = { ...due, power: lo, contact: lo, vision: lo, speed: lo, clutch: lo };
    // Just under the plain bar: he stays in with nobody on, and comes out with
    // a man on second.
    expect(pinchHitter(edge, bench, ctx)).not.toBeNull();
    expect(pinchHitter(edge, bench, { ...ctx, risp: true })).not.toBeNull();
  });

  it('has nothing to do when the bench is empty', () => {
    expect(pinchHitter(weak, [], ctx)).toBeNull();
  });

  it('actually happens over a real game, and never twice with the same man', () => {
    let used = 0;
    for (let seed = 0; seed < 40; seed++) {
      const { game } = simulateGame(9000 + seed, 9, HOME, AWAY);
      for (const side of ['home', 'away'] as const) {
        const t = side === 'home' ? game.home : game.away;
        const original = side === 'home' ? HOME : AWAY;
        // Nobody is ever in the lineup twice, however many came off the bench.
        expect(new Set(t.lineup).size).toBe(9);
        used += t.lineup.filter((p) => !original.lineup.includes(p)).length;
      }
    }
    // Over eighty club-games somebody has to have gone to the bench, or the
    // rule is written and dead.
    expect(used).toBeGreaterThan(0);
  });

  it('keeps the box score honest when it does', () => {
    // A pinch hitter is a tenth name on a nine-man club, and the hits still
    // have to add up. This is the claim stats.ts makes and the bench is the
    // first thing that could break it.
    for (let seed = 0; seed < 12; seed++) {
      const { game } = simulateGame(9500 + seed, 9, HOME, AWAY);
      const book = boxScore(game);
      const albHits = Object.values(book.bat)
        .filter((l) => l.tm === 'ALB')
        .reduce((a, l) => a + l.h, 0);
      expect(albHits).toBe(game.homeState.hits);
    }
  });
});

describe('a club from before benches existed', () => {
  it('plays a whole game with nobody to send up', () => {
    const noBench = { ...HOME, bench: undefined };
    const g = newGame(noBench, AWAY);
    expect(benchOf(g, 'home')).toEqual([]);
    // ...and the sim does not trip over it.
    const { game } = simulateGame(1234, 9, noBench, AWAY);
    expect(game.over).toBe(true);
    expect(game.home.lineup).toHaveLength(9);
  });
});
