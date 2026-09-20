A player can press ESC between pitches and get a screen that stops the ball game — resume, open the settings, or quit to the title — the same settings screen has a card on the title menu, and the record book has a button that empties it.

## DECIDED — Zane, 2026-09-20, on ZAIS-5

1. **Pause only at `phase === 'idle'`.** Between pitches. ESC during a windup, a delivery or a throw does nothing at all.
2. **Reset clears the record book only** — `asb-career` and `asb-streak` — behind a confirm, "similar to every other game that has the option." The custom league (`asb-league`) and the saved season (`asb.season.v1`) are NOT touched, and the screen says so out loud.
3. **Settings is ONE screen with TWO doors**: a card on the title menu, and a button on the pause screen. The four live hotkeys keep working everywhere, unchanged.
4. **Quit just ends the game.** No forfeit, no recorded loss, no returning to the schedule with the day marked unplayed — the game stops and you are on the title screen, which is exactly what `location.reload()` already does at `src/game/main.ts:4287`. A franchise day that was half-played is simply never written, so CONTINUE resumes on the same day and that game is played again from the top. Zane's words were "for now it can just end the game"; if that re-roll is the wrong reading, say so on this issue before step 3 is committed.

## WHERE TO READ

Spec note: **All-Star Baseball Engine - The Three Pillars (Accessible, Customizable, Playable)**. Read it for the voice, not for this job: its ACCESSIBLE pillar means no install, one file, opens offline — not controls you can reach on screen. Nothing in the vault covers a pause screen, a settings screen or a reset. The DECIDED block above is the entire spec for this job.

- `src/game/main.ts:337` — `type Phase`; `:339` — `let phase`.
- `src/game/main.ts:4789` `frame()` → `:4797` `step()`. Everything that moves runs inside `step()`, `if (auto) autoStep()` at `:4841` included.
- `src/game/main.ts:2484` `press()`. The four live knobs at `:2485`–`:2519`: `t` auto, `f` game speed, `g` difficulty, `p` pitch speed.
- `src/game/main.ts:2617` — the window keydown listener. The key gate list at `:2655`–`:2661`, `press(...)` at `:2663`.
- `src/game/main.ts:4287`–`4288` — the only quit that exists today, inside the `phase === 'over'` branch.
- `src/game/main.ts:6173` `showCareer()`; its BACK button at `:6247`.
- `src/game/main.ts:7282`–`7287` — the title mode cards; `:7531`–`:7535` their click wiring (`go === 'book'` → `showCareer(() => drawn())`).
- `src/game/main.ts:2829` `dpadOffPre()`; `game.html:764` — `<div id="pre">`, the room every full-screen screen in this game reuses.
- Live module state a reset has to touch: `let streak` `:402`. Also `let settings` `:409`, `let auto` `:731`, `let speedIdx` `:738` — what the settings screen reads and writes.
- Persistence, all of it already written: `newCareer` `src/game/career.ts:89`, `saveCareer` `:318`, `loadCareer` `:297`; `newStreak` `src/game/streak.ts:46`, `saveStreak` `:84`; `clearSeason` `src/game/franchise.ts:969` — which this job does NOT call.

## THE FACT THAT MAKES THIS SMALL

`#pre` already is the full-screen room, and five screens are already built out of it — `showMoment` `:4974`, `showCalendar` `:5617`, `showStats` `:5887`, `showChampion` `:6115`, `showCareer` `:6173`. Every one is the same six lines: `dpadOffPre()`, write `el.innerHTML`, `el.style.display = 'flex'`, a `leave()`, a keydown handler, a `[data-back]` click. The pause screen and the settings screen are two more of those. No new element, no new CSS, `game.html` is not edited.

The reset needs no new persistence either. `saveCareer(newCareer())` and `saveStreak(newStreak())` are both exported today; the reset is those two calls behind a confirm.

## THE RULE THAT DECIDES EVERYTHING

**An overlay is not a pause.** The file already says it, at `src/game/main.ts:2799`: *"A BALL GAME IS LIVE UNDERNEATH EVERY ONE OF THESE OVERLAYS."* `#pre` covers the canvas and captures the keyboard, and the rAF loop goes right on running underneath it — `autoStep()` keeps playing your half. The pause is a flag that gates `step()`. The screen is what you draw once the clock has actually stopped.

And the corollary, because the engine grades TIMING against `performance.now()` and never geometry: **every absolute timestamp still live at `idle` must be shifted forward by the paused duration on resume**, or a pause silently expires things. At `idle` that is `sceneAt` (`:478`) and `breakFrom` (`:540`) — a break card that is up when you pause would be gone the instant you resume. `flashUntil`, `arriveAt`, `deliveryAt` and `throwAt` cannot be live at `idle`, and that is the whole reason decision 1 is idle-only: there is no graded swing in flight to corrupt.

## STEPS

1. **The flag and the clock.** `let paused = false` and `let pausedAt = 0`, near `phase` at `:339`. First line of `step()` (`:4798`): return while `paused`. A `pause()` that sets the flag only when `phase === 'idle'` and records `pausedAt = performance.now()`; a `resume()` that adds the elapsed paused time to `sceneAt` and `breakFrom` and clears the flag.
2. **The key.** ESC in `press()` → `pause()` at `idle`, nothing in any other phase. Add `'escape'` to the gate list at `:2655`–`:2661`. A key `press()` handles and that list does not forward is a dead key — the file carries that scar twice already, in the notes about `v` and `,`/`.`.
3. **The pause screen.** `showPause()` on `#pre`, built in the shape of `showCareer()` `:6173`. Three buttons: RESUME, SETTINGS, QUIT TO MENU. RESUME and ESC both `resume()`. QUIT is `location.reload()`, the same thing `:4287` does. The screen says what quitting costs, in the game's voice, so nobody loses a franchise day by surprise.
4. **The settings screen.** `showSettings(back)` on `#pre`, same shape. Four rows, each showing its key: difficulty (`g`, `settings.level`, persisted), pitch speed (`p`, `settings.pitchSpeed`, persisted), auto (`t`, this session only), game speed (`f`, this session only). A row does exactly what its hotkey does — call the same code, do not copy the bodies out of `press()`. `back` is what BACK does, which is what lets one screen serve both doors.
5. **The two doors.** A `card('settings', 'SETTINGS', ...)` beside CUSTOMIZE at `:7287`, wired at `:7531` the way `go === 'book'` is: `showSettings(() => drawn())`, title screen left underneath, a look rather than a step. And the SETTINGS button from step 3, whose `back` re-opens the pause screen rather than resuming the game.
6. **The reset.** A second button beside BACK at `:6247` in `showCareer()`. One browser `confirm()`, not a new screen. On yes: `saveCareer(newCareer())`, `saveStreak(newStreak())`, and `streak = newStreak()` for the module-level one at `:402` — miss that and the book goes on showing the old longest streak. Then re-draw the book in place. The confirm text names what goes and what stays: the seasons and the streak go, your clubs and your saved season do not.

## DO NOT

- Do not remove, move or re-key the four hotkeys. The comments at `:2485` and `:2507` say why they are live in every phase. The settings screen documents them; it does not replace them.
- Do not pause outside `idle`, and do not build a "discard the live pitch on resume" path. That was the option Zane did not pick.
- Do not call `clearSeason()` and do not touch `asb-league`. The reset is the record book and nothing else.
- Do not write a loss, a forfeit, or a season row on quit. Quit ends the game; nothing is recorded.
- Do not add an overlay element or new CSS to `game.html`. `#pre` is the room.
- Do not touch `src/web` or `index.html`. Frozen.
- Do not add settings rows the four knobs do not already cover. No new setting is being invented here.

## CHECKS

`npm install` first — this worktree has no `node_modules`.

- `npm run check` clean. 33 test files under `src/game/__tests__/`; record the pass count before you touch anything and it must not fall. No test deleted, renamed or skipped.
- `npm run dev`, in a VISIBLE browser window — a hidden tab freezes rAF and everything looks fine:
  - Exhibition, at `idle`, press ESC: the pause screen is up and the pitcher has stopped moving.
  - Turn AUTO on with `t`, let it play, ESC between pitches: it stops. Resume: it carries on. **Auto still playing behind a pause screen is the failure this whole job guards against.**
  - Hold SPACE to start a delivery and press ESC during the sweep: nothing happens, and the pitch still grades the way it did before.
  - Let a half end so a break card is up, pause on it, wait ten seconds, resume: the card is still there with the time it had left. That is the clock-shift check.
  - Open settings from the title card and from the pause screen: the same screen both ways, and a difficulty set on it is the one the meta strip shows when you are back in the box.
  - Record book → reset → confirm: the book empties in place. Reload the page: still empty. Open CUSTOMIZE: your clubs are still there. Title screen: CONTINUE is still offered if you had a season going.

## HANDOFF

Builder. Commit in the order above, one commit per step where the steps are coherent. `npm run check` clean. **Do not push.** Hand to Eyes with what you could not see for yourself.
