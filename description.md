A player can press ESC at any point in a live game — on the mound picking a pitch, in the middle of a delivery, with the ball in the air — and the game stops where it stands; and the speed multiplier does nothing at all while you are the one playing.

## DECIDED — Zane, 2026-09-21, on ZAIS-5

1. **The pause works while you are pitching.** This reverses decision 1 of ZAIS-6 ("pause only at `idle`"), which is what this issue was opened to question. Taken at its widest: ESC stops a live game in **every** phase. The narrow reading — the waiting phases only, `idle` + `calling` + `resolve` — is a subset of the same work, so it is not being built separately.
   *One consequence, in writing, because it is the thing decision 1 was protecting: a pause taken with the ball in the air is a frozen look at a pitch you are about to swing at. The grade does not change — see THE RULE — but the read does. If you want ESC to refuse while the ball is actually in flight, say so on ZAIS-5 before step 2 is committed and it is a one-line narrowing.*
2. **AUTO stays as it is.** Zane: "the games auto play mode is good."
3. **The speed multiplier may only run the clock faster in AUTO.** `F` in manual play changes nothing — the dead time, the break cards, the replays and the ball you throw from the mound all run at 1×. `F` still cycles and still shows what you picked; it takes effect the moment AUTO goes on.
4. Everything ZAIS-6 shipped stands. It PASSed Eyes and is not reopened here.

## WHERE TO READ

Spec note: **All-Star Baseball Engine - The Three Pillars (Accessible, Customizable, Playable)** — for the voice, not for this job. Nothing in the vault covers a pause; the DECIDED block above is the whole spec.

⚠️ **Every line number below is on `agent/builder/zais-6`, not on `main`.** That branch is local, five commits, not pushed. Branch off it; do not rebase it onto main and do not re-run ZAIS-6's work.

- `src/game/main.ts:359`–`361` — `paused`, `pausedAt`.
- `src/game/main.ts:375`–`380` — `pause()`, and the `phase !== 'idle'` guard this job opens.
- `src/game/main.ts:392`–`398` — `resume()`, and the two timestamps it currently shifts.
- `src/game/main.ts:2583`–`2586` — `escape` in `press()`. `:2594` — `if (paused || !looping) return;`.
- `src/game/main.ts:4882`–`4885` — `step()` and the `if (paused) return;` that is the pause.
- The absolute timestamps, all of them: `launchAt` `:427`, `arriveAt` `:428`, `swingStartedAt` `:445`, `checkedAt` `:454`, `flashUntil` `:519`, `sceneAt` `:538`, `momentFrom` `:585`, `breakFrom` `:600`, `deliveryAt` `:725`, `releasedAt` `:748`, `autoSwingAt` `:794`, `throwAt` `:1537`, `thrownAt` `:1538`, and `replay.startedAt` (read at `:2938`, written at `:3078`).
- `src/game/main.ts:797`–`799` — `SPEEDS`, `speedIdx`, `speed()`. `:810` `pauseFor()`, `:819` `flightScale()`, `:845` `readScale()`, `:564` `sceneMs`, `:627` `breakLen()`.
- `src/game/main.ts:4008` — `renderMeta()`'s cache key. `:4044`–`4045` — the speed button. `:4049` — the `class="on"` the pitch button already uses for "this one is doing something".
- `src/game/main.ts:6366`–`6370` — the settings screen's `F` row, whose blurb currently reads "Between pitches only. A pitch you are swinging at is never sped up."
- README `### ESC stops it, and an overlay never did` (~`1105`), and the `P` / settings paragraph (~`1131`, ~`1502`).

## THE FACT THAT MAKES THIS SMALL

**Two one-place changes, and neither is new machinery.**

The pause: `press()` already returns at `:2594` while `paused`, so no keystroke can land during a pause, in any phase. `step()` already returns at `:4885`, so nothing moves. Both of those are phase-blind already. The *only* thing that is idle-shaped is `resume()`, which hands back the held time to two timestamps because at `idle` two is the whole live list. Widening the pause is widening that list.

The speed: `const speed = (): number => (auto ? SPEEDS[speedIdx]! : 1)`. Every consumer in the file — `pauseFor`, `breakLen`, `sceneMs`, the four replay lengths, `flightScale` — already reads through that one function.

## THE RULE THAT DECIDES EVERYTHING

The engine grades TIMING, in milliseconds, never geometry. **A pause that adds the same `held` to every live timestamp changes no interval at all** — `arriveAt - swingStartedAt` is the difference it always was, and the swing grades exactly as it would have. That is what makes pausing mid-flight safe.

And the corollary, which is the whole risk in this job: **a pause that shifts only some of them is a silent grading bug.** A timestamp left out does not throw; it quietly expires, or grades against a clock that ran while nobody was playing. The list is the job. If it is not on the list, it is wrong.

## STEPS

1. **Shift everything.** `resume()` `:392`–`398`: replace `sceneAt += held; breakFrom += held;` with the full list at WHERE TO READ, nullables guarded, `replay.startedAt` included. The ⚠️ comment above it currently says those two "are the entire list" — rewrite it to say what is now true and why an omission is a grading bug rather than a cosmetic one.
2. **Open the gate.** `pause()` `:376`: drop `phase !== 'idle'`. Keep `paused` and `!looping` — the title screen still has a keyboard and no game behind it — and add `phase !== 'over'`: the final screen has its own buttons and there is nothing left to stop. Rewrite the ⚠️ block above `pause()` at `:363`–`374`, which currently argues idle-only is the whole design; it is now the opposite argument and the file should say so in its own voice.
3. **The speed only moves in AUTO.** `:799`. Note what this does through `flightScale()` at `:819`: on your half on the mound in manual, `!youBat()` is true today, so a pitch you throw at 8× flies at 8×. After this it flies at 1×. **No grade moves** — the mound is graded on release against `deliveryAt`, which is unscaled by design (see the note at `:719`–`725`); only the picture's duration changes.
4. **Say it on screen, or `F` looks broken.** The meta strip `:4044`–`4045` and the settings row `:6366`–`6370` must still show the number you picked *and* read as not currently doing anything while MANUAL — the pitch button's `class="on"` at `:4049` is the pattern already in the file. The settings row's blurb is now wrong twice over; rewrite it. `renderMeta()`'s cache key at `:4008` already carries both `auto` and `speedIdx`, so it needs no change.
5. **README.** The pause section (~`1105`) says "between pitches, and nowhere else" and "ESC during a windup, a delivery or a throw does nothing at all" — both are now false. The speed paragraphs get the AUTO condition.

## DO NOT

- Do not discard, re-throw, or re-grade a pitch on resume. The ball picks up exactly where it froze.
- Do not add a count-in, a 3-2-1, a resume delay, or a blur over the frozen ball. Nobody asked and each one is a new timing path.
- Do not touch `readScale()` `:845` or the `P` setting. It is the opposite lever — it stretches the one part somebody is playing — and it is not in this request.
- Do not change what `SPEEDS` holds or what `F` cycles through. Only *when* it applies.
- Do not remove the `!looping` guard, and do not let ESC put a pause screen over the title menu or over the final screen.
- Do not reopen anything ZAIS-6 shipped — the settings screen, the two doors, the reset, the `installDpad` fix. It PASSed.
- Do not touch `src/web` or `index.html`. Frozen. `game.html` is not edited.

## CHECKS

- `npm run check` clean. **49 files, 1239 tests** — Builder's own count before ZAIS-6 and after it. It must not fall, and nothing is deleted, renamed or skipped.
- `npm run dev`, in a VISIBLE browser window — a hidden tab freezes rAF and everything looks fine:
  - **On the mound, at `calling`, ESC stops the game.** That is the complaint that opened this issue. It took 21–36 hand-thrown pitches to reach a pause before.
  - **Mid-delivery and mid-flight.** ESC with the ball in the air: it stops where it is. Hold ten seconds, resume, take the pitch — the verdict is the one that pitch was already going to get.
  - **The swing grade is the one that can break silently.** Press to swing, ESC during `windup`, hold ten seconds, resume, let it reach the plate. The grade must be the grade an unpaused swing of the same press would have got. If it is not, a timestamp is missing from step 1.
  - The ZAIS-6 break-card check still passes: pause on a MIDDLE OF THE 2ND card, hold eight seconds, resume, the card is still there with the time it had left.
  - AUTO still plays nothing behind a pause screen — ZAIS-6's central check, now from a pitching phase too.
  - **MANUAL, `F` to 8×:** the dead time between pitches, the break cards and the replays run at the speed they ran at 1×. The strip shows `8×` and shows it is not doing anything.
  - **MANUAL, 8×, your half on the mound:** the ball you throw flies at 1×. Today it flies at 8×. This is the one a person feels.
  - **AUTO on, 8×:** the game still compresses exactly as it does today. Nothing about watch mode got slower.

## HANDOFF

Builder, off `agent/builder/zais-6`. Commit in the order above. `npm run check` clean. **Do not push.** Then Eyes, with the swing-grade check named as the one to disbelieve.
