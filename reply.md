Six commits on `agent/builder/zais-9`, one per step, not pushed. Branch base verified: `src/` at the worktree baseline is byte-identical to `origin/main` at `aeac27e`.

```
7716c4d tune: the chase factor lands inside the guardrails, and the record catches up
3c3998b feat: a ball that barely missed is drawn barely missing
efb2ffe feat: every swing in the game is graded against where the pitch was
f059d91 fix: the word on screen and the line in the book grade the same swing
6b9d545 feat: chasing narrows the timing bands
b312967 feat: a ball knows how far off the plate it missed
```

`ThrownPitch.missDistance` is a continuous number in zone half-widths past the edge, rolled where `inZone` is decided in both producers, squared so near misses are the common case. `chaseContact()` turns it into one factor in `effectiveContact`, beside `stuff` and `platoon`. Nothing else reads it. No outcome table, no `hitTables.ts`, no `ai.ts`, no fielding.

## `npm run check`

Clean typecheck. **50 test files / 1248 tests**, against the 49 / 1239 baseline — nine added, nothing deleted, renamed or skipped.

## `npm run sim` — 500 games

```
runs per team    4.18   K rate   23.2%   walks per team   3.12
hits per team    8.10   K/team   8.56    errors per team  0.71
```

Inside every guardrail: runs 4.18 in 4.1–4.6, K 23.2% under 23.5%, errors 0.71 against 0.70. For a control I ran the same build with the factor switched off — 4.33 runs / 22.2% K / 0.68 errors, which reproduces the issue's baseline, so the deltas above are the feature and not the rng shift.

**The tuning took a second shape, and that is the one thing worth reading in the diff.** A plain curve from the edge outward could not land: at `CHASE_COST` 1.15 the league read 26.1% K and 3.92 runs, and pulling it back far enough to fix that left nothing to charge a pitch a foot off the plate. The average ball off the plate is a *near* miss, so a curve steep at the edge spends its whole league-wide budget on pitches that ought to be hittable. So the black is free: the first `CHASE_FREE` (0.4) costs nothing and the cost rises with the square of the rest. At `CHASE_COST` 2 that is a ball half a plate out at 0.93 of its window and one most of a foot off the plate at 0.51 — half the window, about 6ms of PERFECT. The runs floor binds before the K ceiling (3.0 reads 23.7% and 4.03); that is written into the constant's doc comment.

**One site the issue did not list, and it was the one that mattered.** `resolveTheirSwing()` in `main.ts` — the computer's swing while you are on the mound — grades the swing a second time for the flash and the chart line, exactly as your own half does. Without the factor there, a pitch you missed the spot with would punish him in the book and not in the word on screen: the same lie step 3 fixes, facing the other way. It is in `efb2ffe`.

The three bunt paths are deliberately untouched — all of them pull the bat back on a ball, so a bunt is never a chase.

## What to open, and how to reach it

`npm run dev` → title screen → **EXHIBITION** → pick two clubs → **PLAY BALL**. Batting: SPACE starts the pitch, SPACE again is the swing. `T` flips MANUAL/watch.

Watch the ball's spot at the plate, and the bar under the verdict.

## What I did see

I drove the real game in a **visible** Chromium window — title screen through four clicks into the at-bat view — and sampled where the ball was actually drawn.

**Step 5 lands.** 15 balls out of the zone across 28 pitches, drawn at **12 distinct distances from 0.52 to 1.03** of the zone from its centre, where the edge is 0.50. Every one of them used to be drawn at exactly 0.78. Two attached: one nicking the bottom edge, one out in the other batter's box.

**Decision 2 holds in the running game.** Taking real swings, a **+8ms swing at a ball drawn 0.65 out graded PERFECT and went in play**. A +34ms swing at a ball drawn 0.95 out graded LATE — the same +34ms on a strike is GOOD. The penalty is real and the window is never shut.

## What I could not see, and one correction to the verification list

- **I never played a whole at-bat with human hands.** I drove the keys from a script and the timing came off a pixel detector, so a third of my deliveries fell out of phase and had to be discarded. Feel — whether chasing is *readable* before you commit rather than only explicable afterwards — is not something I can report on.
- **⚠️ "The bar is narrower than on a strike" is not what happens on screen, and the issue's §CHECKS should not ask Eyes to look for it.** `drawSwingBar()` derives its drawing scale from the bands it just computed (`half / (bands.contact * 1.25)`), so the coloured bands always occupy the same fraction of the bar whatever the multipliers are. What actually changes is that the same offset lands **further out** against those bands. The two attached bar shots show it: +25ms on a strike sits inside the mid-green and reads GOOD; +34ms on a ball 0.95 out sits well past it in the dark band and reads LATE. The bar is honest either way — I am not filing this as a defect, because nothing is drawing a lie — but the prediction in the issue is wrong about the visuals and a reviewer told to look for a narrower bar will report a failure that is not there.
- **I did not read the play log against the flash on a swing I took myself.** The HUD's `last pitch` and `last swing` agreed on every swing I landed, but both come off the same snapshot, so that is a weak check. The strong one — flash versus the line in the play log — needs eyes.
- `npm run sim` is a rotation of every pairing; I did not play a season.

One more thing for whoever picks up the record: **step 1 shifted the seeded rng stream**, so every seeded season in the project replays differently from here. Second time; `hit.ts:469` documents the first.

README carries the feature, the tuning table and the shape argument, under **Chasing costs a narrower window**. The comment at `atBat.ts:84` stated the opposite of what is now true and has been rewritten.
