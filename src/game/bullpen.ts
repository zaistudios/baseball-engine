/**
 * Pitcher fatigue and the bullpen. The decision that makes late innings mean
 * something on both sides of the ball.
 *
 * ⚠️ WHY THIS EXISTS. Before it, one arm threw all nine innings at full
 * strength. That is not a small realism gap — it deletes an entire layer of
 * the game. A starter who tires is the reason a 2-1 lead in the seventh is
 * tense, the reason the fifth inning is a decision and not a formality, and
 * the reason the computer has something to manage besides pitch selection.
 *
 * FATIGUE IS ONE NUMBER AND IT DOES TWO THINGS, on purpose:
 *
 *   1. HE LOSES THE PLATE.  zoneRate falls, so he walks people. This is what
 *      tiring actually looks like first, and it is visible to the player
 *      without any UI telling them — the count runs deep.
 *   2. HE LOSES HIS STUFF.  Hitters square him up more often. Applied as a
 *      shift in the AI's timing bands (see ai.ts), which is the same dial the
 *      whole hitting model already turns.
 *
 * ponytail: no per-pitch-type stamina, no arm-slot decay, no velocity tracking,
 * no warm-up timers in the pen. One curve, two effects. The nine systems that
 * could live here are the same trap baserunning.ts warns about.
 */

import type { Pitcher } from '../core/pitcher.ts';

/** One arm, and what this game has cost him. */
export interface ArmState {
  pitcher: Pitcher;
  pitches: number;
  battersFaced: number;
  runsAllowed: number;
  /**
   * HIS LEGS FOR THIS OUTING — the rating, already scaled by how rested he is.
   *
   * ⚠️ IT LIVES HERE AND NOT ON THE Pitcher, and that is the whole seam the
   * rotation hangs off. A Team is configuration; a man who threw yesterday is
   * STATE, and the same arm is a different arm on two days' rest than on none.
   * Everything downstream reads this instead of `pitcher.stamina` — fatigue(),
   * and the pitch limit in shouldRelieve() — so a short-rest starter loses the
   * plate exactly the way a starter deep in a game loses it. See rotation.ts.
   */
  stamina: number;
}

/** The whole staff: who is out there, who is left, who is done. */
export interface Staff {
  current: ArmState;
  /** Available, in the order the manager would go to them. */
  bullpen: readonly Pitcher[];
  /**
   * Already pitched, with their LINE ON THE GAME. Cannot come back — same as
   * the real rule.
   *
   * ⚠️ THIS WAS `readonly Pitcher[]` AND THREW THE LINE AWAY. The moment a
   * manager went to the pen, how many pitches the starter had thrown, how many
   * men he faced and what they scored off him ceased to exist anywhere — the
   * numbers were on ArmState and only the Pitcher was kept. Nothing noticed
   * because nothing asked, right up until scripts/audit.ts asked how deep
   * starters go and got NaN back for every game in the league.
   *
   * Keeping the whole ArmState is the same object the staff was already
   * holding, and it is the difference between a box score being possible and
   * not. Pitcher stats have nowhere else to come from.
   */
  used: readonly ArmState[];
  /**
   * EACH RELIEVER'S LEGS TONIGHT, by name — rest already folded in.
   *
   * ⚠️ A MAP, NOT AN ARRAY. bringInRelief() removes the arm it picked, so any
   * index-aligned list would be one filter away from pointing at the wrong
   * man. See penLegs() in rotation.ts.
   *
   * Optional, and a missing name means a whole man. That is every exhibition,
   * every test that does not care, and every club in a season that has not
   * used its pen yet.
   */
  legs?: Readonly<Record<string, number>>;
}

/** `stamina` defaults to his rating — a fully rested man, and every exhibition. */
export const newArm = (pitcher: Pitcher, stamina?: number): ArmState => ({
  pitcher,
  pitches: 0,
  battersFaced: 0,
  runsAllowed: 0,
  stamina: stamina ?? pitcher.stamina ?? 1,
});

/**
 * The staff for one game: the man you chose to start, and the pen behind him.
 *
 * ⚠️ THE STARTER IS AN ARGUMENT NOW. It used to be `rotation[0]`, computed in
 * here, which is why every club started the same man in every game it ever
 * played. Who starts is a decision that belongs to the caller — the player on
 * the pre-game screen, pickStarter() for the computer.
 */
export function newStaff(
  starter: Pitcher,
  pen: readonly Pitcher[],
  stamina?: number,
  legs?: Readonly<Record<string, number>>,
): Staff {
  return { current: newArm(starter, stamina), bullpen: pen, used: [], legs };
}

/**
 * Where a starter stops being fresh, and where he is finished.
 *
 * 70 and 110 against a real starter's ~100-pitch limit. The game runs about
 * 234 pitches total (see scripts/balance.ts), so a starter reaches FRESH_UNTIL
 * somewhere around the fifth or sixth — which is where a manager starts
 * watching, and is the shape we want.
 */
export const FRESH_UNTIL = 70;
export const GASSED_AT = 110;

/**
 * 0 while he is fresh, ramping to 1 when he is done. Linear between.
 *
 * ⚠️ STAMINA MOVES BOTH ENDS OF THE RAMP, not just the far one. A 0.75 arm is
 * not a starter who breaks down late, he is a one-inning reliever who was
 * never fresh past 52 pitches — and that is exactly why a manager does not
 * bring him in during the fourth. Scaling only GASSED_AT would have made every
 * arm in the league identical for the first seventy pitches, which is most of
 * the game and all of the decision.
 *
 * ponytail: linear, not a curve. The difference between a linear ramp and a
 * smooth one is invisible across 40 pitches, and this one can be reasoned
 * about in your head while tuning.
 */
export function fatigueOf(pitches: number, stamina = 1): number {
  const s = Math.max(0.2, stamina);
  const fresh = FRESH_UNTIL * s;
  const gassed = GASSED_AT * s;
  if (pitches <= fresh) return 0;
  if (pitches >= gassed) return 1;
  return (pitches - fresh) / (gassed - fresh);
}

export const fatigue = (s: Staff): number =>
  fatigueOf(s.current.pitches, s.current.stamina);

/** What this arm is good for, in pitches. The number shouldRelieve() works to. */
export const limitOf = (p: Pitcher): number => GASSED_AT * Math.max(0.2, p.stamina ?? 1);

/** How much of the plate a tiring arm still gives you. */
export const ZONE_FATIGUE_PENALTY = 0.25;

export const fatiguedZoneRate = (base: number, f: number): number =>
  base * (1 - ZONE_FATIGUE_PENALTY * f);

/** One pitch thrown by whoever is out there. */
export const recordPitch = (s: Staff): Staff => ({
  ...s,
  current: { ...s.current, pitches: s.current.pitches + 1 },
});

/** One batter retired or otherwise disposed of, and what it cost. */
/**
 * Runs go on the arm, without a plate appearance ending.
 *
 * Split out of recordBatter() for the wild pitch: a run can score with nobody
 * having completed an at-bat, and folding it into recordBatter() would inflate
 * battersFaced — the number shouldRelieve() reads to decide a man is done.
 */
export const chargeRuns = (s: Staff, runs: number): Staff =>
  runs === 0 ? s : { ...s, current: { ...s.current, runsAllowed: s.current.runsAllowed + runs } };

export const recordBatter = (s: Staff, runs: number): Staff => ({
  ...chargeRuns(s, runs),
  current: {
    ...s.current,
    battersFaced: s.current.battersFaced + 1,
    runsAllowed: s.current.runsAllowed + runs,
  },
});

export const hasRelief = (s: Staff): boolean => s.bullpen.length > 0;

/**
 * THE MAN WHO STARTED, whether or not he is still out there.
 *
 * `used` is append-only and the starter is always the first man into it, so
 * this is exact rather than a guess. franchise.ts writes his name onto the
 * Result, which is what the rest ledger is built from.
 */
export const openedBy = (s: Staff): ArmState => s.used[0] ?? s.current;

/**
 * Go to the pen. The man on the mound is done for the game.
 *
 * `index` is WHICH arm — the pen is a list you pick from, not a queue you pop.
 * Out of range or omitted means the top of the list, which is what the
 * computer falls back to and what every caller did before there was a choice.
 *
 * Returns the staff unchanged when there is nobody left, rather than throwing:
 * a manager who runs out of arms has to leave the starter in, which is a real
 * situation and not a programming error.
 *
 * ⚠️ HE COMES IN ON THE LEGS REST LEFT HIM. This used to say a reliever was
 * always fresh, and that was the honest description of a real gap: three whole
 * arms in every game of the season however hard they had been worked the day
 * before, which made "get to the pen early" close to free and left starter
 * stamina — and therefore the whole rotation rule — half decorative. Staff.legs
 * carries what each man has tonight; see penLegs() in rotation.ts.
 */
export function bringInRelief(s: Staff, index = 0): Staff {
  if (s.bullpen.length === 0) return s;
  const at = index >= 0 && index < s.bullpen.length ? index : 0;
  const next = s.bullpen[at]!;
  return {
    ...s,
    current: newArm(next, s.legs?.[next.name]),
    bullpen: s.bullpen.filter((_, i) => i !== at),
    // The whole arm, not just the man. See ArmState on Staff.used.
    used: [...s.used, s.current],
  };
}

/**
 * EVERY ARM THAT CAME OUT OF THE PEN, with his line. The starter is excluded.
 *
 * This is what the season charges rest against — see recordRelief(). It has to
 * include the man still standing on the mound at the final out, who is in
 * `current` and not in `used`.
 */
export function reliefWork(s: Staff): readonly ArmState[] {
  if (s.used.length === 0) return [];
  // used[0] is the starter; everything after him came out of the pen, and the
  // current arm did too because somebody replaced the starter.
  return [...s.used.slice(1), s.current];
}

/**
 * Should the COMPUTER go to its bullpen?
 *
 * Three reasons a manager pulls someone, in the order they actually apply:
 *
 *   gassed   past GASSED_AT, no argument
 *   tiring   past FRESH_UNTIL and it is late enough to matter
 *   shelled  he has been hit hard, regardless of how fresh he is
 *
 * Deliberately checked BETWEEN batters only — nobody gets pulled mid-count.
 */
export interface ReliefContext {
  inning: number;
  /** Runs the pitching side is behind by. Negative means they lead. */
  deficit: number;
  /**
   * The club's hook knob — see identity.ts. Under 1 the manager goes and gets
   * him early; over 1 he rides him.
   *
   * ⚠️ IT MOVES THE LEASH, NOT THE SHELLING. Four runs is four runs for
   * everybody: a manager who leaves a man out there after that is not showing
   * confidence, he is not managing, and IRON ARMS is supposed to be a
   * philosophy rather than an absence of one. What it turns is the pitch limit
   * and the tiring-late rule — the two judgement calls a real bench actually
   * differs on.
   */
  hook?: number;
}

export function shouldRelieve(s: Staff, ctx: ReliefContext): boolean {
  if (!hasRelief(s)) return false;
  const { pitches, runsAllowed, battersFaced } = s.current;
  const hook = ctx.hook ?? 1;

  // Against HIS limit, not the league's. A manager who left a 0.7-stamina
  // reliever out there until 110 would be ignoring the only reason that arm
  // has a rating.
  // Against the legs he actually has TODAY, not the rating on his card. A
  // starter on short rest is done earlier, which is the whole cost of rest.
  if (pitches >= GASSED_AT * Math.max(0.2, s.current.stamina) * hook) return true;

  // Getting hit: four runs at any point, or three before he is even tired.
  if (runsAllowed >= 4) return true;
  if (runsAllowed >= 3 && battersFaced >= 9) return true;

  // Tiring late in a close game — the situation where a real manager acts
  // early rather than waiting for the wheels to come off. A quick hook counts
  // the sixth as late; a slow one waits for the eighth.
  const late = Math.round(6 * hook);
  if (fatigue(s) > 0 && ctx.inning >= late && Math.abs(ctx.deficit) <= 3) return true;

  return false;
}

/** For the UI: a word for how he looks out there. */
export function armCondition(s: Staff): 'fresh' | 'working' | 'tiring' | 'gassed' {
  const f = fatigue(s);
  if (f >= 1) return 'gassed';
  if (f > 0.45) return 'tiring';
  if (f > 0) return 'working';
  return s.current.pitches > 35 ? 'working' : 'fresh';
}
