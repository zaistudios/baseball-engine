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
 * ⚠️ RETUNED 2.3 -> 2.7 ON 2026-08-28, AGAINST THE LEAGUE.
 *
 * ⚠️ AND A CORRECTION, 2026-08-29: this comment used to say the old value was
 * tuned against scripts/balance.ts, "which plays ALB and DET and nobody else."
 * That is FALSE and it was written here without opening the file — balance.ts
 * rotates through every ordered pairing in the league and its own header
 * explains that it was changed for exactly this reason. The claim came out of
 * a stale note and got repeated into a code comment, a vault note and a commit
 * message before anybody checked. Where 2.3 actually came from is not
 * recorded. Do not repeat an instrument's flaw second-hand; open it.
 *
 * Measured across three full seasons, 2.3 left every plate-appearance number
 * short at once —
 * strikeouts 19.7% against a real 22.4%, walks 7.7% against 9.6%, and
 * therefore **72.5% of plate appearances ending with a ball in play against a
 * real 68%**, on 3.61 pitches per PA against 3.90.
 *
 * ⚠️ THE FOUL RATE PER SWING LOOKED FINE THE WHOLE TIME. scripts/place.ts read
 * 33.9% against a real ~35% and always had. It rolls a UNIFORM spread of swing
 * timings; the computer's swings come out of AI_TIMING_BANDS, which is not
 * uniform, so the rate that reaches a real at-bat was lower than the rate the
 * script measured. A per-swing number cannot see this. The instrument that can
 * is the plate-appearance mix — see game.test.ts, which now guards it.
 *
 * This is ONE knob and it moves everything the right way at once, because a
 * foul is what makes an at-bat long enough to reach a third strike or a fourth
 * ball. Measured over three seasons per value:
 *
 *   2.3   K 19.7%  BB 7.7%  in play 72.6%  P/PA 3.61  273 pitches/game
 *   2.6   K 22.1%  BB 8.0%  in play 69.9%  P/PA 3.79  282
 *   2.7   K 22.8%  BB 8.1%  in play 69.1%  P/PA 3.91  303   <- shipped
 *   2.8   K 24.1%  BB 8.4%  in play 67.5%  P/PA 3.94  298
 *   3.3   K 28.3%  BB 8.9%  in play 62.8%  P/PA 4.24  323
 *   real  K 22.4%  BB 9.6%  in play 68.0%  P/PA 3.90  ~295
 *
 * 2.7 rather than 2.8 because 2.8 overshoots the strikeout rate, which is the
 * tightest of the three. Run scoring barely moves across the whole range
 * (4.50 to 4.68 per team), so this is not a run-environment knob — it is an
 * at-bat LENGTH knob, and the run environment survives it by construction.
 *
 * Raising it further keeps pushing the pitch count up; watch that at-bats do
 * not start feeling like a war of attrition. Past about 3.3 they do.
 */
export const FOUL_BOOST = 2.7;

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
