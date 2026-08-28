/**
 * The handful of numbers that make the two-sided game feel like baseball
 * rather than like the roguelike it grew out of.
 *
 * They live in one file because they are the knobs somebody will actually want
 * to turn, and because every one of them is shared by BOTH halves — the sim and
 * the live screen must agree or the half you play and the half you watch drift
 * apart.
 */

/**
 * How much more often a swing is fouled off than the ported tables say.
 *
 * ⚠️ Real baseball fouls off roughly a THIRD of all swings, and the prototype's
 * tables are nowhere near that: a well-timed fastball fouls 5% of the time.
 * That is why at-bats were ending in 2-3 pitches and the game was running ~240
 * pitches against a real ~290.
 *
 * More fouls does three things at once, and they are all wanted: at-bats get
 * longer, the pitch count climbs toward real, and the two-strike foul finally
 * matters — staying alive with two strikes is a thing that happens to you now
 * rather than a rule you read about.
 *
 * Tuned against scripts/balance.ts. Raising it further keeps pushing the pitch
 * count up; watch that at-bats do not start feeling like a war of attrition.
 */
export const FOUL_BOOST = 2.3;

/**
 * THE HOME CROWD, as a multiplier on the home club's swing chance.
 *
 * ⚠️ WHY THIS HAD TO EXIST. Measured over 6,960 games before it, home clubs won
 * **49.7%** against a real ~54%. The engine had no home-field effect of any
 * kind — batting last is the only thing the home team got, and batting last is
 * worth nothing on average because the ninth is only played when it matters.
 *
 * That is a bug in FRANCHISE specifically, not a realism quibble. The bracket
 * hands the higher seed home field in both rounds and calls it the reward for
 * fourteen games of standings — and it was paying out zero. Winning the
 * one-seed bought a nicer line on a screen.
 *
 * ⚠️ IT IS A BARREL MULTIPLIER, NOT A SWING-RATE ONE, and the first version
 * got that wrong. Turning the home side's `aggression` up 5% moved home wins
 * from 49.7% to 50.4% — swing rate trades walks for balls in play and nets out
 * near nothing. The two GOOD timing bands are where run scoring lives, which
 * is why fatigue turns those and not the swing rate. Same dial here.
 *
 * ponytail: one number, applied to the home side only, riding the band
 * weights aiSwing already has. Small on purpose — a home edge a player can
 * FEEL as a rule is a home edge that reads as the game cheating. Set it to 1
 * to switch the whole thing off.
 */
export const HOME_EDGE = 1.2;
