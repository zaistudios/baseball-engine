/**
 * THE SCENE — what the replay is ABOUT, in two lines and a length.
 *
 * ⚠️ THE PROBLEM THIS FIXES. A ball in play cuts to the overhead for about a
 * second and a half and says NOTHING. finishAtBat() sets `flash = ''` the
 * moment there is a replay to show, so the one screen the player watches after
 * every swing is silent — and the beat is the same second and a half whether it
 * was a routine grounder to short or a three-run shot into the left-field seats.
 * A game where the biggest thing that can happen looks exactly like the most
 * ordinary thing that can happen has no reward in it, and both get skipped.
 *
 * So this file answers one question: GIVEN WHAT JUST HAPPENED, what does the
 * broadcast put on the screen and how long does it stay there. It decides
 * nothing about the game — every fact it reads has already been settled by
 * placement.ts, inning.ts and game.ts — and it is pure, so the whole thing is
 * testable without a canvas.
 *
 * ⚠️ THE CAPTION IS FREE AND THE TIME IS NOT, AND THAT IS THE WHOLE PACING
 * DESIGN. The overhead already holds for REPLAY_HOLD_MS on every ball in play.
 * Writing two lines over that hold costs nothing, so EVERY scene gets one —
 * that is what stops an ordinary single from being nothing. Extra milliseconds
 * are spent only on the plays that earn them, because the mode's premise is
 * that a season fits in an afternoon and overhead.ts's note on FOUL_HOLD_MS is
 * the standing warning about exactly this. scripts/scenes.ts measures the bill.
 *
 * ⚠️ IT REUSES placement.ts's VOCABULARY RATHER THAN INVENTING A SECOND ONE.
 * The play-by-play already says "into the left-center gap" and "down the
 * right-field line"; a caption that called the same place something else would
 * read as two different games being described at once.
 */

import type { Outcome } from '../core/hitTables.ts';
import type { Bases } from '../core/inning.ts';
import { occupied } from '../core/inning.ts';
import type { GameState, Side } from './game.ts';
import type { Placement, Verdict } from './placement.ts';
import { whereWords, POSITION_WORD } from './placement.ts';

// ------------------------------------------------------------- leverage

/**
 * When the late innings start.
 *
 * ⚠️ SEVEN, AND IT IS NOT A NEW NUMBER. rotation.ts already draws its
 * late-and-close line at `inning >= 7 && Math.abs(deficit) <= 3` for deciding
 * which arm comes in, and bullpen.ts reads the same shape. A screen that called
 * the eighth "late" while the manager called the seventh late would be two
 * files disagreeing about the same afternoon in front of the player.
 */
export const LATE_INNING = 7;

/** The situation a batter walked into. Everything leverage is read from. */
export interface Situation {
  inning: number;
  /** Nine, normally. Anything past it is extras, which are always late. */
  regulation: number;
  outs: number;
  bases: Bases;
  /** Runs the batting side has. */
  us: number;
  /** Runs the other side has. */
  them: number;
}

/** Positive when the batting side is behind. */
export const deficitOf = (s: Situation): number => s.them - s.us;

/**
 * A GameState as a Situation, from the batting side's point of view.
 *
 * ⚠️ THE TYPES ARE IMPORTED type-ONLY, so this file still adds no runtime edge
 * to game.ts and every rule above stays testable with six plain numbers. The
 * adapter lives here rather than in main.ts because "whose runs are `us`" is a
 * decision about leverage, and leverage is this file's job.
 */
export const situationOf = (g: GameState, batting: Side): Situation => ({
  inning: g.inning,
  regulation: g.regulation,
  outs: g.outs,
  bases: g.bases,
  us: batting === 'home' ? g.homeState.runs : g.awayState.runs,
  them: batting === 'home' ? g.awayState.runs : g.homeState.runs,
});

/**
 * IS THIS THE MOMENT THE GAME TURNS ON?
 *
 * ⚠️ THE RULE IS "ONE SWING CHANGES WHO IS WINNING", not a table of innings and
 * margins, and stating it that way is what makes it scale with the bases by
 * itself. A runner on is a run closer, so the margin a single swing can erase is
 * exactly the men on base plus the man at the plate — `|deficit| <= on + 1`. Two
 * down by two with nobody on is not a moment; two down by two with two on is.
 * Bases loaded down four is, and the same expression says so without a special
 * case for it.
 *
 * It is symmetric on purpose. The defending side is in the same moment the
 * batting side is — a one-run lead in the ninth with the tying run aboard is
 * the most tense thing in the sport from BOTH dugouts, and the screen should
 * not be able to tell you it only matters when you are the one hitting.
 *
 * ⚠️ EXTRA INNINGS ARE ALWAYS LATE. `inning >= LATE_INNING` covers it for a
 * nine-inning game and quietly fails for a shortened one, where the tenth
 * inning of a seven-inning game is extras and the seventh is the last regular
 * one. Reading `regulation` handles both.
 */
export function isHighLeverage(s: Situation): boolean {
  const late = s.inning >= Math.min(LATE_INNING, s.regulation) || s.inning > s.regulation;
  if (!late) return false;
  const on = occupied(s.bases).filter(Boolean).length;
  return Math.abs(deficitOf(s)) <= on + 1;
}

/**
 * What the pre-pitch card says about the moment, or null when there is nothing
 * to say. One line, in the voice of a broadcast coming back from the break.
 *
 * ⚠️ IT DESCRIBES THE SITUATION, NEVER THE ODDS. "Tying run at second" is
 * something the player can see on the field and now knows to feel; a win
 * probability is a number that tells them the game has already decided how this
 * goes. The whole point of the beat is tension, and a percentage relieves it.
 */
export function momentLine(s: Situation): string | null {
  if (!isHighLeverage(s)) return null;
  const d = deficitOf(s);
  const on = occupied(s.bases);
  const inScoring = on[1] || on[2];
  const last = s.inning > s.regulation ? 'EXTRAS' : `${ordinal(s.inning)}`;
  const outs = s.outs === 2 ? 'TWO DOWN' : s.outs === 1 ? 'ONE DOWN' : 'NOBODY OUT';

  if (d > 0) {
    // Behind. The tying run is the interesting one.
    const where = d === 1 && !on.some(Boolean) ? 'AT THE PLATE' : inScoring ? 'IN SCORING POSITION' : 'ABOARD';
    return `${last} · ${outs} · TYING RUN ${where}`;
  }
  if (d === 0) return `${last} · ${outs} · TIED, AND THE WINNING RUN IS UP`;
  // Ahead, and defending a lead a swing can take.
  return `${last} · ${outs} · ${Math.abs(d)}-RUN LEAD, ${
    inScoring ? 'AND THEY ARE IN SCORING POSITION' : 'AND THE TYING RUN IS UP'
  }`;
}

const ORDINALS = ['', '1ST', '2ND', '3RD', '4TH', '5TH', '6TH', '7TH', '8TH', '9TH'];
const ordinal = (n: number): string => ORDINALS[n] ?? `${n}TH`;

// --------------------------------------------------------------- the scene

/**
 * How much of an occasion this is.
 *
 * ⚠️ THE TIER IS THE ONLY THING THAT COSTS TIME, so it is the only thing worth
 * being strict about. `routine` is the default and adds nothing to the clock —
 * it still gets a caption, because the caption is free.
 */
export type Tier = 'routine' | 'solid' | 'big' | 'huge';

/** Extra milliseconds the ball sits before the cut back, by tier. */
export const TIER_HOLD_MS: Readonly<Record<Tier, number>> = {
  routine: 0,
  solid: 220,
  big: 620,
  huge: 1150,
};

export interface Scene {
  /** The big word. Short enough to set large — three words at the outside. */
  title: string;
  /** One line under it, and the reason the scene is about THIS play. */
  detail: string;
  tier: Tier;
  /** Extra ms on top of the ordinary hold. TIER_HOLD_MS, unless a rule says more. */
  hold: number;
  /** True when the MOMENT is why this is a scene, not the hit. */
  leverage: boolean;
}

/** Everything the caption is written from. All of it already decided elsewhere. */
export interface SceneFacts {
  outcome: Outcome;
  placement: Placement | null;
  verdict: Verdict;
  /** Runs that crossed on this play. */
  runs: number;
  /** The defence booted it. */
  error: boolean;
  doublePlay: boolean;
  /** How hard it was hit, for the one adjective that is worth an adjective. */
  exitVelocity: number;
  /** The situation he walked into — leverage is a fact about BEFORE. */
  before: Situation;
  /** The game ended on this play. */
  gameOver: boolean;
  /** ...and it ended in the home half, with the winning run. */
  walkOff: boolean;
}

const rbi = (n: number): string => (n === 1 ? '1 RBI' : `${n} RBI`);

/**
 * Where it went, in the play-by-play's own words, upper-cased for a caption.
 *
 * ⚠️ THIS IS FOR HITS. A ball that fell in is about the PLACE — "the
 * left-center gap" is the thing the hitter did. See who() for the other half.
 */
function where(p: Placement | null): string {
  if (!p || p.zone === 'foul-ground') return '';
  return whereWords(p, 'to').replace(/^to /, '').toUpperCase();
}

/**
 * Who fielded it, upper-cased for a caption.
 *
 * ⚠️ THIS IS FOR OUTS, and mixing the two up made the first cut read badly. An
 * out is about the MAN — describePlay() says "grounded out to short" for
 * exactly this reason — and keying a groundout's detail off the zone instead
 * printed "THE INFIELD", which is both flatter and less true: it names the
 * whole half of the field a ball that one specific man picked up.
 */
function who(p: Placement | null): string {
  if (!p || p.zone === 'foul-ground') return '';
  return (POSITION_WORD[p.fielderNum] ?? '').replace(/^the /, '').toUpperCase();
}

/**
 * THE SCENE FOR ONE FINISHED PLAY.
 *
 * Read the order of the branches as the order of what matters: the game ending
 * beats everything, then how many runs crossed, then what the hit was, then how
 * it was fielded. A grand slam that ends a game is a walk-off first and a grand
 * slam second, because that is what the room would shout.
 */
export function sceneFor(f: SceneFacts): Scene {
  const p = f.placement;
  const big = f.before && isHighLeverage(f.before);
  const spot = where(p);

  const made = (title: string, detail: string, tier: Tier, leverage = false): Scene => ({
    title,
    detail,
    tier,
    hold: TIER_HOLD_MS[tier],
    leverage,
  });

  // ---- the game is over, and nothing else on this list outranks that
  if (f.walkOff) {
    return {
      ...made(
        f.outcome === 'home_run' ? 'WALK-OFF HOME RUN' : 'WALK-OFF',
        f.outcome === 'home_run' && p
          ? `${Math.round(p.distFt)} FEET, AND THAT IS THE BALL GAME`
          : 'AND THAT IS THE BALL GAME',
        'huge',
        true,
      ),
      // ⚠️ THE LONGEST BEAT IN THE GAME, AND IT IS THE ONE PLACE WORTH IT. The
      // screen is about to become a box score; this is the last thing that
      // happens on a field all afternoon.
      hold: TIER_HOLD_MS.huge + 500,
    };
  }

  // ---- the swing itself
  if (f.outcome === 'home_run') {
    const feet = p ? `${Math.round(p.distFt)} FEET` : '';
    const to = spot ? ` TO ${spot}` : '';
    if (f.runs >= 4) return made('GRAND SLAM', `${feet}${to}`, 'huge', big);
    if (f.runs === 3) return made('THREE-RUN SHOT', `${feet}${to}`, 'huge', big);
    if (f.runs === 2) return made('TWO-RUN SHOT', `${feet}${to}`, 'big', big);
    return made('HOME RUN', `${feet}${to}`, 'big', big);
  }

  if (f.verdict === 'robbed') {
    // ⚠️ A ROBBERY IS A SCENE FOR THE DEFENCE, and it is the one caption on this
    // list the hitter does not want to see. It gets a big beat anyway: the
    // whole reason contest() exists is that a flip the player is not told about
    // is indistinguishable from the dice being unkind.
    return made('ROBBED', p ? `TAKEN AWAY IN ${spot}` : 'TAKEN AWAY', 'big', big);
  }

  if (f.outcome === 'triple') {
    return made('TRIPLE', spot ? `INTO ${spot} — HE IS GOING` : 'HE IS GOING', 'big', big);
  }

  if (f.outcome === 'double') {
    /**
     * ⚠️ THE HEADLINE IS READ OFF THE ZONE, NOT OFF `inTheGap`, and using the
     * flag was the first draft's mistake. `inTheGap` means "a long way from the
     * nearest man" — a FIELDER distance, which is what stretch() needs and what
     * GAP_FT was measured against. It is deliberately the top fifth of doubles.
     * Measured over 8,983 balls in play, keying the caption off it fired INTO
     * THE GAP on 0.2% of them against a bare DOUBLE on 9.3%: the one caption on
     * the list that describes a picture almost never appeared. The zone is a
     * statement about WHERE THE BALL WENT, which is what a caption is for.
     */
    const head =
      p?.zone === 'wall'
        ? 'OFF THE WALL'
        : p?.zone === 'left-center' || p?.zone === 'right-center'
          ? 'INTO THE GAP'
          : p?.zone === 'down-the-line'
            ? 'DOWN THE LINE'
            : 'DOUBLE';
    const tail = f.runs > 0 ? rbi(f.runs) : spot ? `TWO BASES, ${spot}` : 'TWO BASES';
    return made(head, tail, f.runs > 0 || big ? 'solid' : 'routine', big);
  }

  if (f.outcome === 'single') {
    if (f.runs > 0) {
      const head = big && f.runs > 0 ? 'HE DELIVERS' : 'RBI SINGLE';
      return made(head, `${rbi(f.runs)}${spot ? ` — ${spot}` : ''}`, big ? 'big' : 'solid', big);
    }
    if (f.verdict === 'dropped') return made('IT DROPS', spot ? `IN FRONT OF ${spot}` : 'BASE HIT', 'routine', big);
    if (f.exitVelocity >= 100) return made('LINED', spot ? `A BASE HIT ${spot}` : 'A BASE HIT', 'routine', big);
    return made('BASE HIT', spot ? `${spot}` : '', 'routine', big);
  }

  // ---- how it was fielded
  if (f.error) return made('ERROR', 'HE IS ABOARD ON THE MISPLAY', 'solid', big);
  if (f.doublePlay) return made('TWO', 'TURNED, AND THE INNING IS OVER', 'solid', big);

  /**
   * ⚠️ AN OUT IN A BIG SPOT IS A SCENE TOO, and leaving it silent was the first
   * draft's mistake. Half of what makes a moment land is that it can go wrong —
   * a caption that only ever appears when you succeed is a scoreboard, not a
   * broadcast.
   *
   * ⚠️ BUT IT HAS TO BE A JAM, NOT MERELY A CLOSE GAME, and the first cut of
   * this branch fired on any out at high leverage. Measured over 15,564 balls
   * in play that was 10.9% of them — about six a game, more often than a home
   * run — so the caption meant to mark the tense moments was the second most
   * common thing on the screen. Men on base is what makes an out a escape;
   * with nobody aboard a groundout in a one-run ninth is just a groundout.
   */
  const menOn = occupied(f.before.bases).some(Boolean);
  if (big && menOn) {
    const stranded = f.before.outs === 2;
    if (f.outcome === 'strikeout') {
      return made('STRUCK HIM OUT', stranded ? 'OUT OF THE JAM' : 'ONE AWAY', 'solid', true);
    }
    return made(
      stranded ? 'OUT OF THE JAM' : 'HE GETS HIM',
      who(p) ? `PUT AWAY, TO ${who(p)}` : 'PUT AWAY',
      'solid',
      true,
    );
  }

  // Everything else — a routine out — keeps the beat it always had and says
  // what it was and who took it, so the screen is never blank.
  const fielder = who(p);
  return made(ROUTINE[f.outcome] ?? 'OUT', fielder ? `TO ${fielder}` : '', 'routine');
}

const ROUTINE: Partial<Record<Outcome, string>> = {
  ground_out: 'GROUND OUT',
  line_out: 'LINE OUT',
  popup: 'POPPED UP',
  foul_out: 'FOUL OUT',
  strikeout: 'STRIKE THREE',
};

/**
 * The accent a scene is drawn in.
 *
 * ⚠️ IT IS THE TIER, NOT THE OUTCOME, and that is the point of having a tier at
 * all. overhead.ts's OUTCOME_COLOR answers a different question — what colour is
 * the BALL, which is about whether it is still alive — and a caption keyed off
 * that would paint a robbery and a base hit the same green.
 */
export const TIER_COLOUR: Readonly<Record<Tier, string>> = {
  routine: '#8a9a86',
  solid: '#d8d8c0',
  big: '#7fd68a',
  huge: '#ffd76a',
};
