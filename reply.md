Zane — this one is waiting on you, not on an agent. Four answers and it becomes a single Builder issue.

I re-checked the vault: nothing in it covers a pause screen, a settings screen, a mid-game quit, or clearing the record book. The nearest note, **The Three Pillars**, uses "accessible" to mean *no install, one HTML file, opens offline* — a different word than the one in your request, which is about controls you can reach on screen. So there is no spec to build from, and I am not inventing one.

Re-verified against the code today:

- No pause exists. `Phase` is `'idle' | 'windup' | 'resolve' | 'calling' | 'winding' | 'throw' | 'over'` — `src/game/main.ts:337`.
- No settings screen. The four knobs are live hotkeys in `press()` — `src/game/main.ts:2484`-`2519`: `t` auto, `f` speed, `g` difficulty, `p` pitch speed. The comments there say outright that the point is reaching them *without* going to a menu.
- Quit exists only after the last out: `Quit to menu` / `Play again` is `location.reload()` inside the `phase === 'over'` branch — `src/game/main.ts:4285`. The `r` key is gated the same way (`:2530`). Mid-game there is no exit.
- The record book ends in a lone `BACK` button — `src/game/main.ts:6247`.
- Five storage keys exist and "stats" could mean any of them: `asb-career`, `asb-streak`, `asb-timing`, `asb.season.v1`, `asb-league`.

**The fact that keeps this small:** nothing new has to be computed or persisted. `newCareer()` / `saveCareer()`, `newStreak()` / `saveStreak()` and `clearSeason()` are all already exported — a reset is those calls behind a confirm. The settings screen has no new logic either; the four knobs already work and persist. They just have no door.

**The rule that decides it:** the engine grades TIMING in milliseconds against `performance.now()`. Anything that stops the clock mid-pitch changes what a swing is worth. That is why question 1 is yours and not an implementation detail.

## The four questions

**1. What may be paused?** Pausing during `windup`/`throw` freezes a ball in flight; resuming either hands the batter a free second read or throws the pitch away.
*I recommend: pause only at `idle`, between pitches. One guard, and it cannot corrupt a graded swing.*

**2. Does "reset stats" mean the record book only, or everything?** `asb-career` and `asb-streak` are stats. `asb-league` is your custom clubs — wiping that destroys work that is not a stat.
*I recommend: clear `asb-career` and `asb-streak` only, behind a confirm, with the screen saying out loud that the custom league and the saved season are untouched.*

**3. Does the settings screen replace the hotkeys or document them?**
*I recommend: it lists the same four knobs and shows each one's key. Nothing moves; the hotkeys keep working.*

**4. What happens to a franchise game you quit mid-way?** The season persists separately, so a mid-game quit leaves a half-played game on the schedule.
*I recommend: discard that game and return to the schedule with it unplayed — but this is the one I least want to guess. It is the difference between quit-as-exit and quit-as-re-roll, and a re-roll is a way to farm a good game.*

Answer 1, 2, 3 with "yes to your rec" if you agree, and tell me your call on 4. Then this goes to Builder as one issue against `src/game/main.ts` and nothing else — `src/web` and `index.html` stay frozen.
