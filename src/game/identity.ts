/**
 * HOW A CLUB PLAYS, as opposed to what it is worth.
 *
 * ⚠️ THIS IS THE TECMO BOWL LAYER AND IT IS NOT A STAT BUFF. teams.ts already
 * says how GOOD a club is — seventy-two hitters and ninety arms, and value.ts
 * turns that into one number and a rank. What none of it said was how a club
 * BEHAVES, and behaviour is the half a person sitting at the plate actually
 * feels. Two clubs with identical ratings should still be a different night:
 * one chases your slider off the plate in the first inning, the other makes
 * you throw forty strikes and steals second when you finally do.
 *
 * FOUR KNOBS, AND EVERY ONE OF THEM ALREADY HAD A CALL SITE.
 *
 *   aggression  multiplies the computer's swing chance (ai.ts aiSwing). This
 *               parameter has existed since aiSwing was written and NOTHING
 *               HAS EVER PASSED IT — dead flexibility waiting for exactly
 *               this. High is a free swinger: more contact, more chases,
 *               fewer walks. Low is a grinder: deep counts, more walks, more
 *               called third strikes.
 *   running     multiplies ATTEMPT_RATE (running.ts aiShouldSend). The odds
 *               test is unchanged — a slow club that runs a lot still will not
 *               send a catcher into a good arm. This is how OFTEN the manager
 *               even asks the question.
 *   hook        scales the starter's leash (bullpen.ts shouldRelieve). Under 1
 *               the manager goes and gets him early and you face the pen for
 *               four innings; over 1 he rides the starter into trouble.
 *   bunt        scales BUNT_THRESHOLD (ai.ts shouldBunt). Under 1 more of the
 *               lineup rates as a man worth giving an out for.
 *
 * ⚠️ EVERY ARCHETYPE IS TWO-SIDED, DELIBERATELY. None of these is free. A club
 * that swings at everything puts more balls in play AND walks less; a club
 * that runs steals bases AND makes outs on the bases; a quick hook gets you
 * fresh arms AND gets you the third-best arm on the staff in the sixth. That
 * is what keeps identity out of value.ts — see the note there. If an archetype
 * ever measures as a straight gain, it is mis-tuned, not under-priced.
 *
 * ⚠️ IDENTITY IS NOT IN clubValue(). A club's rank is what its PLAYERS are
 * worth, and it has to stay that way: the pre-game screen, the franchise
 * moments and the standings table all read that number, and folding a
 * behaviour multiplier into it would make "STACKED" mean two different things
 * on the same screen. Measure identity with scripts/league.ts — win% is where
 * it shows up, and it is supposed to show up small.
 *
 * ponytail: eight archetypes, thirty clubs, no per-club knob overrides. A club
 * is a lineup, a staff and ONE of these. Give a club its own numbers when a
 * club actually needs numbers no archetype has, and expect that to be never —
 * the rosters are already what make two HACKERS clubs different.
 */

export interface Identity {
  /** Shown on the pre-game card, in caps. Short enough to sit next to a rank. */
  name: string;
  /** One line, in the voice of a scouting report. */
  blurb: string;
  /** Swing-chance multiplier. 1.0 is a disciplined professional. */
  aggression: number;
  /** How often the manager even considers sending a runner. 1.0 is normal. */
  running: number;
  /** The starter's leash. Under 1 is a quick hook. */
  hook: number;
  /** Scales the bunt threshold. Under 1 means more men get the sign. */
  bunt: number;
  /**
   * THE MAN WHO PLAYS THIS WAY, for the franchise's manager moment.
   *
   * ⚠️ It is a job description and never the tag itself. A screen that offers
   * you "hire TRACK TEAM" is offering a stat block; a screen that offers you a
   * first-base coach who has never met a runner he would not send is offering
   * a baseball decision, and they are the same decision. The tag is what the
   * engine reads and this is what a person reads. See moments.ts.
   */
  hire: string;
}

const identity = (
  name: string,
  blurb: string,
  hire: string,
  knobs: Partial<Omit<Identity, 'name' | 'blurb' | 'hire'>>,
): Identity => ({ name, blurb, hire, aggression: 1, running: 1, hook: 1, bunt: 1, ...knobs });

/**
 * THE EIGHT WAYS TO PLAY A BALL GAME.
 *
 * Read each pair as the trade it is. The comment on every one names what it
 * costs, because the cost is the reason the archetype is allowed to exist.
 */
export const IDENTITIES = {
  /** The default. Nothing to say about them, which is itself a thing to know. */
  STEADY: identity(
    'STEADY',
    'They play it straight. No book on them beyond the nine names.',
    'A steady hand who will not be the story. Nine names, nine jobs, and no speeches.',
    {},
  ),

  /** More balls in play, and they will chase you out of the zone all night. */
  HACKERS: identity(
    'HACKERS',
    'First good one they see, and a few that are not. Nobody here has ever walked on purpose.',
    'A hitting coach who thinks a walk is a wasted at-bat. See a good one, hit it.',
    { aggression: 1.15, running: 1.15, bunt: 1.2 },
  ),

  /** Walks and deep counts — and they take called strikes and burn your pen slower. */
  GRINDERS: identity(
    'GRINDERS',
    'They will make you throw it. Expect long counts and a tired arm by the sixth.',
    'A hitting coach who counts the pitch total out loud. Wear him out, take your base.',
    { aggression: 0.94, running: 0.85 },
  ),

  /** Bases stolen, and outs made on the bases. The most visible identity there is. */
  TRACK_TEAM: identity(
    'TRACK TEAM',
    'They run on everybody. Hold them close or they are standing on second before you look.',
    'A first-base coach who has never met a runner he would not send.',
    { running: 2.0, aggression: 1.05, bunt: 0.9 },
  ),

  /** They wait for the three-run homer, and they die on the vine when it does not come. */
  BIG_INNING: identity(
    'BIG INNING',
    'Station to station and swinging for the seats. Quiet for six and then it is 6-0.',
    'A bench boss who does not give away outs and will not chase one run.',
    { running: 0.45, bunt: 1.4 },
  ),

  /** Ninety feet at a time — and an out handed over every time they take it. */
  SMALL_BALL: identity(
    'SMALL BALL',
    'Bunt, steal, move him over. They will trade you an out for a base all night long.',
    'An old infielder who wants the bunt down and the runner moved over.',
    { running: 1.7, bunt: 0.88, aggression: 0.97 },
  ),

  /** Fresh arms all game, and the third-best of them is out there in the sixth. */
  QUICK_HOOK: identity(
    'QUICK HOOK',
    'The starter goes five and the phone rings. You will see the whole staff.',
    'A pitching coach with the phone already in his hand in the fifth.',
    { hook: 0.82 },
  ),

  /** One arm, all night — magnificent until he is gassed, and then he stays out there. */
  IRON_ARMS: identity(
    'IRON ARMS',
    'They ride him. Get to him late, because the manager is not coming to get him.',
    "A pitching coach who thinks a starter's job is nine innings, and says so.",
    { hook: 1.28 },
  ),
} as const satisfies Record<string, Identity>;

export type IdentityKey = keyof typeof IDENTITIES;

/**
 * The neutral one, for anything that has no club — the roguelike's lineups, a
 * test that only cares about the count, a Team loaded from a save written
 * before identities existed.
 *
 * ⚠️ EVERY CALL SITE TAKES A PLAIN NUMBER, NOT AN Identity. ai.ts, running.ts
 * and bullpen.ts each want ONE of these four, and handing them the whole
 * object would make three engine files import the league. They take the knob;
 * sim.ts and main.ts read it off the club. That is also why every one of those
 * parameters is optional and defaults to 1 — the identity layer is additive,
 * and turning it off gets you exactly the engine that measured 39.2 points of
 * spread before it existed.
 */
export const STEADY: Identity = IDENTITIES.STEADY;

/** The knob, or 1.0 when there is no club to ask. */
export const knob = (
  id: Identity | undefined,
  k: 'aggression' | 'running' | 'hook' | 'bunt',
): number => id?.[k] ?? 1;

/** Every archetype, for the manager moment to draw from. See moments.ts. */
export const ALL_IDENTITIES: readonly Identity[] = Object.values(IDENTITIES);
