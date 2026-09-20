## User request

> I want the game to be more accessible. Pause screen, menu settings ability to quit game, reset stats in record book.

Four things, in Zane's words: a **pause screen**, **menu settings**, the **ability to quit the game**, and **reset stats in the record book**.

## Why this is not a build issue yet

No spec note in the vault covers a pause screen, a settings screen, a mid-game quit, or clearing the record book. The closest note is **All-Star Baseball Engine — The Three Pillars (Accessible, Customizable, Playable)**, and its "ACCESSIBLE" pillar means something different from the word used here: it means *no install, one HTML file, opens offline, finishes in a session*. It says that pillar is "mostly solved, nothing structural owed." The request is about **controls you can reach on screen**, which that note does not cover.

Per the routing rules, no issue goes to Builder until the decisions below are made. Four questions, each with a recommendation.

## What is true in the repo today (verified 2026-09-20)

- **There is no pause.** The phase machine is `type Phase = 'idle' | 'windup' | 'resolve' | 'calling' | 'winding' | 'throw' | 'over'` (`src/game/main.ts:337`), driven by a `requestAnimationFrame` loop (`src/game/main.ts:4793`). `idle` is the between-pitches state.
- **There is no settings screen.** Settings exist as live hotkeys that work in every phase, handled in `press()` (`src/game/main.ts:2484`-`2519`): `t` auto, `f` speed, `g` difficulty, `p` pitch speed. Each writes through `saveSettings()` to `localStorage['asb-timing']` (`src/game/difficulty.ts:278`, `:350`). The only settings *UI* is the difficulty dial on the title screen, drawn by `drawLevels()` (`src/game/main.ts:7175`) and hidden the moment a mode is picked.
- **Quit exists only after the last out.** The `Quit to menu` / `Play again` button is built at `src/game/main.ts:4285`-`4288`, inside the `phase === 'over'` branch, and it is `onclick="location.reload()"`. The `r` key does the same, also gated on `phase === 'over'` (`src/game/main.ts:2530`). Mid-game there is no way out.
- **The record book has no reset.** `showCareer()` (`src/game/main.ts:6173`, header at `:6091`) renders from `loadCareer()` and ends with a single `BACK` button (`src/game/main.ts:6247`).
- **Five separate localStorage keys exist**, and "stats" could mean any of them: `asb-career` (`src/game/career.ts:287`), `asb-streak` (`src/game/streak.ts:62`), `asb-timing` (`src/game/difficulty.ts:278`), `asb.season.v1` (`src/game/franchise.ts:959`), `asb-league` — the custom clubs (`src/game/league.ts:46`).

## The fact that makes this small

The reset needs no new persistence code. `newCareer()` / `saveCareer()` (`src/game/career.ts:89`, `:318`) and `newStreak()` / `saveStreak()` (`src/game/streak.ts:46`, `:84`) are already exported; a reset is those calls behind a confirm. `clearSeason()` (`src/game/franchise.ts:969`) already exists too. The settings screen has nothing new to compute either — the four knobs and their persistence already work; they have no door.

## The rule that decides everything

The engine grades TIMING, in milliseconds, against `performance.now()`. Anything that stops or restarts the clock mid-pitch changes what a swing is worth. That is why question 1 is a design decision and not an implementation detail.

## The four questions

**1. What may be paused?** A pause during `windup` / `throw` freezes a ball in flight, and the resume either hands the batter a free read of a pitch he has already seen or has to throw the pitch away. Options: pause only at `phase === 'idle'`, or freeze anywhere and discard the live pitch on resume.
*Recommendation: pause only at `idle`, between pitches. It costs one guard and it cannot corrupt a graded swing.*

**2. Does "reset stats" mean the record book only, or everything?** `asb-career` and `asb-streak` are stats. `asb-league` is the custom clubs, and wiping it destroys work that is not a stat.
*Recommendation: the button clears `asb-career` and `asb-streak` only, behind a confirm, and says out loud that the custom league and the saved season are untouched.*

**3. Does the settings screen replace the hotkeys or document them?** The four knobs are deliberately live in every phase — the comments at `src/game/main.ts:2485` and `:2507` say the point is reaching them without going to a menu.
*Recommendation: the screen lists the same four knobs and shows each one's key. Nothing moves; the hotkeys keep working.*

**4. What happens to a franchise game you quit mid-way?** The season is persisted separately (`saveSeason()`, `src/game/franchise.ts:961`), so quitting mid-game leaves a season whose current game is half-played.
*Recommendation: quitting mid-game discards that game and returns to the schedule with it unplayed. Needs Zane's word — it is the difference between quit as an exit and quit as a re-roll.*

## Handoff

Back to Zane for the four answers. Once they land, this becomes one Builder issue against `src/game/main.ts` and nothing else. `src/web` and `index.html` stay frozen.
