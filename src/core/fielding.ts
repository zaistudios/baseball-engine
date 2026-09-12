/**
 * The defence gets a say. Two rolls, both on balls already ruled outs.
 *
 * THE SCOPE LINE, same shape as baserunning.ts: this is not a fielding
 * simulation. There are no positions, no fielders, no range ratings, no
 * assists and no scorer deciding hit-or-error. There are two questions a
 * batter-only game can feel from the box — "did that turn two" and "did they
 * boot it" — and nothing else.
 *
 * Rolled here, applied by inning.ts. Same split as baserunning: the core
 * decides whether it happened, the inning layer decides what it cost.
 *
 * ⚠️ BALANCE COUPLING, read before tuning either number. inning.ts carried a
 * standing note that an out never scores a runner (no sac fly, no productive
 * ground out) AND never costs two, and that "the two omissions pull in
 * opposite directions, which is the only reason it is safe to leave both out."
 * The double play below removes one half of that pair. Run scoring will fall.
 * The sacrifice fly is the paired lever that puts it back, and it is
 * deliberately NOT here — see the note in inning.ts.
 */

import type { Rng } from './rng.ts';
import type { Outcome } from './hitTables.ts';
import type { ReleaseGrade } from './delivery.ts';

/**
 * Chance a ground ball with a force at first turns two, at speed 1.0.
 *
 * ponytail: 0.35 is a game-feel number, not a measured one. Real ball turns
 * two on roughly an eighth of ground-ball opportunities; that is too rare to
 * register in a three-inning encounter, and the point of the feature is that
 * the player feels it. Tune here, not at the call site.
 */
export const DOUBLE_PLAY_RATE = 0.35;

/**
 * Chance a ball in play is booted, at speed 1.0.
 *
 * ponytail: real MLB errors run near 1.5% of chances. Same argument as above —
 * at that rate a player would finish a run having never seen one. 0.05 shows
 * up about once every couple of encounters, which is often enough to read as
 * a rule and rare enough to still feel like luck.
 */
export const ERROR_RATE = 0.05;

/**
 * THE FORCE AT SECOND — how often a ground ball with a man on first that does
 * NOT turn two takes the LEAD runner instead of the batter.
 *
 * ⚠️ THE BATTER USED TO BE RETIRED AT FIRST EVERY SINGLE TIME, and the man on
 * first strolled up to second on the play. That is one out either way, so it
 * never showed up in a run total — and it is the most common play in baseball
 * rendered backwards. Zane, watching a grounder to his second baseman: "THIS
 * GAME NEEDS TO BE REWRITTEN to feel FLUID and like baseball", and one line
 * later, "Throw-outs are not shown". They are the same note. The throw that
 * was missing is 4-6 — the one that goes to the BAG rather than to first — and
 * with the batter always out at first there was never a runner at the other
 * end of it to be thrown out.
 *
 * ⚠️ IT COSTS THE OFFENCE A BASE AND THAT IS THE POINT. Before, a grounder with
 * a man on first bought him second for free. Now he is usually erased there and
 * the batter inherits first, which is the same out and a worse base state —
 * exactly the trade a real force play is. Measured with scripts/balance.ts, not
 * argued: see the README.
 *
 * 0.6 rather than something nearer 1 because the fielder does not always have
 * the lead man: a slow chopper, a ball to the first baseman with his foot on
 * the bag, a hitter who beat it out of the box. This is the share of them where
 * the play at the bag is there to be made.
 */
export const FORCE_AT_SECOND = 0.6;

/**
 * WHICH BAG A FORCE IS TAKEN AT — 2, 3 or 4 for second, third and the plate.
 *
 * Same numbering advance() and runnerPoint() use, so the rule, the scorer and
 * the picture all count bases the same way and nothing has to translate.
 */
export type ForceBag = 2 | 3 | 4;

/**
 * CHANCE THE DEFENCE GOES FOR THE LEAD FORCE instead of the easy one at second.
 *
 * ⚠️ EVERY FORCE IN THE GAME WAS TAKEN AT SECOND, whatever the bases looked
 * like. Men on first and second, a ground ball to third, and the throw went
 * across the diamond to the trailing runner instead of to the bag six feet
 * away. Bases loaded and the play was still at second — so the single most
 * dramatic routine play in baseball, the force at the plate with the infield
 * in, could not happen. Zane: "the fielding really needs to be fixed."
 *
 * ⚠️ IT IS ONLY EVER THE *LEAD* FORCE OR SECOND, never a bag in between, and
 * that is a rule rather than a simplification. With the bases loaded a throw to
 * third retires the trailing man and lets the run score, which is bad baseball
 * nobody would play — the choice a real infielder makes is "the front end or
 * the sure one", and those are the two this models.
 *
 * ⚠️ IT IS *NOT* GATED ON THE OUTS, AND GATING IT THERE MADE IT INVISIBLE. The
 * first cut reasoned that with two down any force ends the inning, so the
 * fielder takes the surest out and the lead bag is not worth the risk. That is
 * backwards: with men on first and second and a ball hit to third, the lead bag
 * is the surest out on the field — he is standing on it. And because the double
 * play only rolls under two outs, forces skew heavily toward two-out
 * situations, so the gate was suppressing the majority of them. Measured: 5% of
 * force outs went anywhere but second, which is one every sixteen games and
 * reads as never. It is also free — a force for the third out scores nobody
 * whichever bag it is taken at, so the run environment cannot see this.
 *
 * ponytail: a flat rate rather than one that reads WHERE the ball was fielded.
 * A grounder to third really should go to third more often than one to the
 * right side does, and defense.ts already knows who fielded it. That is a
 * correlation; this is a frequency, and a frequency is what a person watching
 * can actually judge. Add the positional version when the flat one reads wrong.
 */
export const LEAD_FORCE = 0.5;

/**
 * ...and with the INFIELD IN they are standing there to make exactly this play.
 *
 * ⚠️ THIS IS THE PAYOFF FOR THE CALL. Drawing the infield in has cost the
 * defence the holes placement.ts charges for since it shipped, and bought one
 * thing: the man on third does not gamble on a grounder. Now it also means what
 * the alignment is actually FOR — they are conceding nothing at the plate and
 * the throw goes home.
 */
export const LEAD_FORCE_INFIELD_IN = 0.85;

// ---------------------------------------------------------- the stretch

/**
 * HOW FAR FROM THE NEAREST MAN A HIT HAS TO LAND before the batter thinks about
 * one more bag.
 *
 * ⚠️ THE BATTER HAS NEVER STRETCHED ANYTHING, and inning.ts said so in its own
 * note: "the batter never takes an extra base himself... because a man
 * stretching a single into a double is a play with a throw and a call at the
 * far end, and the overhead replay stops him at first." The replay does not
 * stop him at first any more, so the reason is spent. Every runner on base
 * could gamble for an extra ninety feet; the one man who actually hit the ball
 * could not, which is the wrong way round — he is the one who can see where it
 * went.
 *
 * Set against the single population measured in placement.ts: p50 of a single's
 * gap is 51ft and p90 is 83, so 78 is roughly the top fifth — a ball that
 * genuinely got into space rather than one that merely fell in. Below it he is
 * not thinking about it, and no roll happens at all.
 */
export const STRETCH_GAP_FT = 78;

/**
 * ...and how often he goes, once it IS in space, at speed 1.0.
 *
 * ⚠️ IT IS A GAMBLE WITH A PRICE, not a bonus base. The same arm that guns down
 * a runner going first-to-third gets its one throw at him — see gunDown() — so
 * a slow man stretching into a good outfield is making a bad bet, and the rate
 * has to be low enough that it stays HIS decision rather than a tax on every
 * ball in the gap. Multiplied by his legs, so it is the fast third of the
 * roster doing most of it, which is who does it in real ball.
 */
export const STRETCH_RATE = 0.45;

/**
 * ODDS THEY GET HIM, against THROW_RATE's 0.28 for a runner already on base.
 *
 * ⚠️ MEASURED, AND THE FIRST CUT HAD THE ECONOMICS BACKWARDS. Sharing the
 * runner's 0.28 arm cost **0.08 runs per team per game** — so stretching was a
 * straight loss, and the model had the batter choosing it on 45% of the balls
 * that qualified. That is not a gamble, it is a mistake the game makes on your
 * behalf several times a night.
 *
 * The reason it is lower is not generosity. A man on first breaking for third
 * is running on a read he made before the ball landed; the BATTER watched the
 * thing come off his own bat and is the one person on the field who already
 * knows it got into the gap. He picks his spots, so the spots he picks are the
 * ones he makes. 0.18 puts the realized out rate near a fifth, which is where
 * a play worth attempting sits — enough to hurt, not enough to make going a
 * mistake.
 *
 * Tune this before STRETCH_RATE. This one moves whether the gamble is worth
 * taking; that one only moves how often it comes up.
 */
export const STRETCH_THROW = 0.18;

/**
 * Odds the batter goes for one more than the hit was worth. 0 when the ball did
 * not get far enough from anybody to be worth thinking about.
 *
 * Exported for the same reason sendChance() and isSacrificeFly() are: a UI that
 * wants to explain the gamble needs the predicate, not a second copy of it.
 */
export const stretchChance = (speed: number, gapFt: number): number =>
  gapFt < STRETCH_GAP_FT ? 0 : Math.max(0, Math.min(0.95, STRETCH_RATE * speed));

// ------------------------------------------------------------- the throw

/**
 * WHAT A GRADED THROW IS WORTH — the third press in the game, and the one the
 * player makes with a glove on.
 *
 * ⚠️ IT MULTIPLIES THE ROLLS, IT DOES NOT OVERRULE A VERDICT. This is the same
 * contract RELEASE_CONTROL keeps on the mound: the release does not decide
 * where the pitch goes, it multiplies `control` and lets pitchToSpot() decide.
 * A ball already called `ground_out` by the table is still an out however this
 * press lands — what is genuinely still open when the ball reaches a fielder is
 * whether it is BOOTED and whether it turns TWO, and those are the two things a
 * throw is actually about. Letting the press flip the out itself would put the
 * player's hands inside the outcome seam, which is the one rule plot.ts states
 * in its header and the reason the whole replay is a replay.
 *
 * ⚠️ `good` IS EXACTLY 1 ON BOTH NUMBERS, and it is load-bearing for the same
 * reason delivery.ts says it is. Every play in the headless sim is resolved
 * without a press, so a competent throw has to land precisely on the league's
 * own rates — otherwise your copy of a defence is a different defence from the
 * one scripts/balance.ts measured, and every number in the README describes a
 * game nobody plays.
 *
 * The spread is deliberately asymmetric, same shape as the release. PERFECT
 * buys a third more double plays, which is a real reward on the one play it
 * fires on. WILD triples the error chance, because "press something, anything"
 * has to be worse than not pressing at all or it is not a decision.
 */
export interface ThrowEffect {
  /** Multiplies the double-play chance. */
  dp: number;
  /** Multiplies the error chance. Above 1 is a throw that got away. */
  error: number;
}

export const THROW_EFFECT: Record<ReleaseGrade, ThrowEffect> = {
  perfect: { dp: 1.3, error: 0.5 },
  good: { dp: 1, error: 1 },
  early: { dp: 0.85, error: 1.4 },
  late: { dp: 0.85, error: 1.4 },
  wild: { dp: 0.45, error: 3 },
};

/** No press was made — the league's own rates, exactly. */
export const CLEAN_THROW: ThrowEffect = THROW_EFFECT.good;

/**
 * HOW LONG THE THROW TAKES, and where in it the ball should leave the hand.
 *
 * ⚠️ QUICKER THAN ANY DELIVERY IN THE GAME, on purpose. The fastest pitch is a
 * 960ms sweep because a wind-up is a thing you settle into; a double-play pivot
 * is the opposite of that, and a bar that gave you as long to think about it
 * would be describing a different act. It is also the pacing bound: this fires
 * on the order of once or twice a game and has to be over before it is felt as
 * an interruption.
 *
 * ponytail: no second bar for the relay, no separate pivot press, no throw
 * meter that charges. One press, one number, into the two multipliers
 * rollFielding() already took.
 */
export const THROW_SWEEP_MS = 720;
export const THROW_AT_MS = 470;

/**
 * IS THIS A PLAY WORTH STOPPING THE GAME FOR?
 *
 * ⚠️ THE WHOLE DESIGN IS IN HOW NARROW THIS IS. A press on every ball you
 * field is five or six interruptions a game, and the mode's premise is that a
 * season fits in an afternoon — the same bound FOUL_HOLD_MS in overhead.ts has
 * been the standing warning about. A press on a lazy fly is worse than nothing,
 * because it teaches the player that the bar means whatever happens next was
 * routine.
 *
 * So it is exactly the DOUBLE-PLAY BALL: a ground ball, a man forced at first,
 * and an out to spare. That is the play where both things the throw can change
 * are genuinely open at once — turn two, or boot it and have nobody out — and
 * it is the one Zane named when he said the fielding needed fixing. It works
 * out around one or two a game on the half you are on the mound for, which is
 * rare enough that the bar appearing is itself information.
 */
export const isClosePlay = (
  outcome: Outcome,
  opts: { forceAtFirst: boolean; outs: number },
): boolean => outcome === 'ground_out' && opts.forceAtFirst && opts.outs < 2;

/** Only these can be booted. A popup is caught or it is not, and a strikeout has no fielder. */
const BOOTABLE: ReadonlySet<Outcome> = new Set<Outcome>(['ground_out', 'line_out']);

export interface FieldingResult {
  /** The batter reaches, and nobody is out. */
  error: boolean;
  /** The batter and the forced runner are both out. */
  doublePlay: boolean;
  /**
   * THE FIELDER'S CHOICE: a forced man is out AT THIS BAG and the BATTER IS
   * SAFE at first. One out, like the play at first it replaces, and a bag worse
   * for the side that hit it.
   *
   * 2, 3 or 4 for second, third and the plate — see LEAD_FORCE for which. Only
   * ever set on a ground ball with a man on first; absent means the ordinary
   * play, with the batter retired at first.
   */
  forceAt?: ForceBag;
  /**
   * THE THROW TO THE EXTRA BASE, pre-rolled — see gunDown() and the note on
   * ARM_STRENGTH below.
   *
   * ⚠️ WHY IT IS A ROLL AND NOT A VERDICT. Only advance() knows which runner
   * actually goes: it depends on his legs, on whether the road in front of him
   * is open, and on how many bases the hit was worth. None of that is knowable
   * out here. But advance() is pure and has no rng, by design — the whole core
   * replays from a seed. So the caller throws ONE die and hands over both the
   * die and the odds, and inning.ts decides what they mean once it knows who
   * is running. One roll, the right runner, and still deterministic.
   */
  extraBase?: { odds: number; roll: number };
  /**
   * ONE DIE PER OCCUPIED BAG — [first, second, third] — for "does this runner
   * go", pre-rolled for the same reason extraBase is: inning.ts decides, and
   * inning.ts has no rng.
   *
   * Indexed by the base he is STANDING on, not the one he wants, so a hit and
   * a ground ball read the same slot for the same man. Absent means the caller
   * did not roll (the CLI, and every test that passes CLEAN), and inning.ts
   * falls back to the old flat speed threshold.
   */
  advanceRolls?: readonly [number, number, number];
  /**
   * THE BATTER'S OWN GAMBLE, pre-rolled — see stretchChance(). Same shape and
   * the same reason as `extraBase`: only advance() knows whether the bag in
   * front of him is free, and advance() is pure.
   *
   * Absent means nobody rolled one, which is every caller written before the
   * batter could stretch — and they all keep exactly their old behaviour,
   * because he simply stops where the hit put him.
   */
  stretch?: {
    /** Chance he goes. */
    odds: number;
    roll: number;
    /** Chance they get him if he does — see STRETCH_THROW. */
    armOdds: number;
  };
}

export const CLEAN: FieldingResult = { error: false, doublePlay: false };

/**
 * ODDS AN AVERAGE RUNNER IS GUNNED DOWN going first-to-third or second-to-home,
 * before his own legs are taken into account.
 *
 * ⚠️ THE EXTRA BASE USED TO BE FREE, and that is what this changes. A runner at
 * 1.15 speed or better simply took it, every time, with no throw and no risk —
 * so an outfield arm was a rating that appeared on a card and could not be felt,
 * and there was never a reason not to send him.
 *
 * 0.28 against a league-average arm is deliberately well under half. Sending a
 * runner has to stay the RIGHT play most of the time or nobody sends anybody
 * and the mechanic just removes baserunning. What it buys is that the extra
 * base is now a bet with a price, and a cannon in right field is a thing you
 * notice before you notice it in a stat line.
 */
export const THROW_RATE = 0.28;

/**
 * Does the throw beat him? The runner's own legs divide it, the arm multiplies.
 *
 * Exported because the UI has to be able to say what a send is worth — the same
 * reason isSacrificeFly() is exported. A gamble whose price you cannot see is
 * not a decision, which is the rule the steal button already follows.
 */
export function gunDown(odds: number, roll: number, runnerSpeed: number): boolean {
  return roll < Math.max(0, Math.min(0.75, odds / Math.max(0.1, runnerSpeed)));
}

/**
 * Odds the batter beats the relay. Fast men stay out of double plays, which is
 * the main reason speed should matter to a hitter who is not stealing.
 *
 * `speed` is the same multiplier around 1.0 that baserunning.ts uses.
 */
export function doublePlayChance(speed: number): number {
  // Divide rather than subtract, so a 1.4 burner and a 0.7 catcher sit either
  // side of the base rate by the same factor.
  return Math.max(0.05, Math.min(0.9, DOUBLE_PLAY_RATE / Math.max(0.1, speed)));
}

/**
 * Roll the defence on a ball in play.
 *
 * `forceAtFirst` is the caller's answer to "is there a runner on first" — the
 * double play needs a force, and this module does not know about bases.
 *
 * Order matters: the error is rolled first, because a booted ball is not also
 * a double play. Getting that backwards produces a turn-two that the fielder
 * simultaneously dropped.
 */
export function rollFielding(
  outcome: Outcome,
  opts: {
    speed: number;
    forceAtFirst: boolean;
    outs: number;
    /**
     * Scales the error chance for THIS ball. 1 is the flat league rate.
     *
     * Added 2026-08-20 for the positional defence in game/defense.ts, where a
     * ball hit at a shortstop and a ball hit at a first baseman are no longer
     * the same play. Defaults to 1, so the roguelike — which has no fielders —
     * behaves exactly as it always did.
     */
    errorMult?: number;
    /** Same idea for the relay. A better middle infield turns more of them. */
    dpMult?: number;
    /**
     * WHAT THE PLAYER'S THROW WAS WORTH, when there was one. Omitted is
     * CLEAN_THROW — exactly the league — which is what the headless sim, watch
     * mode and the roguelike all get. See THROW_EFFECT.
     */
    throwEffect?: ThrowEffect;
    /**
     * HOW MANY RUNNERS ARE FORCED — the unbroken run of occupied bases starting
     * at first. 1 is a man on first alone, 3 is the bases loaded. It decides
     * which bag the LEAD force is at and nothing else; the caller knows the
     * base state and this module deliberately does not.
     *
     * Defaults to 1, which is the behaviour every caller had before the lead
     * force existed: the throw always went to second.
     */
    forcedRunners?: number;
    /**
     * THE INFIELD IS IN. They are playing for the out at the plate, so the lead
     * force is much likelier — see LEAD_FORCE_INFIELD_IN.
     */
    infieldIn?: boolean;

    /**
     * The arm out there, as a multiplier around 1.0. Scales THROW_RATE, so a
     * cannon in right actually costs a runner the base he used to get free.
     * Defaults to 1 — the roguelike has no fielders and is unchanged.
     */
    arm?: number;
  },
  rng: Rng,
): FieldingResult {
  // ⚠️ THE THROW IS ROLLED LAST, AFTER the outs, and the order is load-bearing.
  // Putting it first shifted every draw behind it, which quietly re-rolled
  // every error and every double play in the game — a seeded season would have
  // replayed differently for a reason that had nothing to do with it. Outs
  // first, exactly as before; the throw takes the draw after them.
  const outs = rollOuts(outcome, opts, rng);
  return {
    ...outs,
    extraBase: { odds: THROW_RATE * (opts.arm ?? 1), roll: rng.next() },
    // Same rule as the throw: rolled LAST, so nothing already drawn shifts.
    advanceRolls: [rng.next(), rng.next(), rng.next()],
  };
}

/** The original two rolls, untouched: is it booted, and is it two? */
function rollOuts(
  outcome: Outcome,
  opts: {
    speed: number;
    forceAtFirst: boolean;
    outs: number;
    errorMult?: number;
    dpMult?: number;
    forcedRunners?: number;
    infieldIn?: boolean;
    throwEffect?: ThrowEffect;
  },
  rng: Rng,
): FieldingResult {
  if (!BOOTABLE.has(outcome)) return CLEAN;

  const thrown = opts.throwEffect ?? CLEAN_THROW;
  const errorChance = Math.max(
    0,
    Math.min(0.5, ERROR_RATE * (opts.errorMult ?? 1) * thrown.error),
  );
  if (rng.next() < errorChance) return { error: true, doublePlay: false };

  // ⚠️ THE FORCE AND THE DOUBLE PLAY NEED DIFFERENT GATES, and hanging both off
  // `canTurnTwo` hid a third of every force out in the game. Turning two needs
  // an out to spare; taking the lead man at the bag needs only a man on first,
  // and with TWO down it is the easiest out on the field and the most
  // recognisable version of the play there is — the bang-bang throw to second
  // that ends the inning. Measured: 0.52 force outs per team per game with the
  // shared gate, which from one seat across nine innings reads as none at all.
  // Zane played it and said exactly that: "Theres no force outs."
  const forceable = outcome === 'ground_out' && opts.forceAtFirst;
  if (!forceable) return CLEAN;

  if (opts.outs < 2) {
    const dp = Math.max(
      0,
      Math.min(0.95, doublePlayChance(opts.speed) * (opts.dpMult ?? 1) * thrown.dp),
    );
    if (rng.next() < dp) return { error: false, doublePlay: true };
  }

  // He did not turn two, and the throw still mostly goes to a bag rather than
  // to first. See FORCE_AT_SECOND.
  if (rng.next() >= FORCE_AT_SECOND) return { error: false, doublePlay: false };

  // WHICH bag. The lead force is one past the last man who has to run — two
  // forced runners means third, three means the plate. See LEAD_FORCE.
  const lead = Math.min(4, 1 + Math.max(1, opts.forcedRunners ?? 1)) as ForceBag;
  const goesForLead =
    lead > 2 && rng.next() < (opts.infieldIn ? LEAD_FORCE_INFIELD_IN : LEAD_FORCE);

  return { error: false, doublePlay: false, forceAt: goesForLead ? lead : 2 };
}
