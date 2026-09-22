Playtest notes from 2026-09-22. Two separate complaints, neither covered by an existing vault spec note. This issue is the spec gate: the decisions below get answered before any implementation issue is written.

## User request

> pitches outside the zone act as contact on swing and misses. Pitches further outside of the zone must be harder to swing and make contact. So a ball that barely touches the zone can be hittable depending on contact rating further out, less likely for contact, let alone a hit. In baseball its possible to get a hit, or even a home run on a pitch outside, further out from the zone, the less likely
>
> It seems like the current hitting is still very scripted in terms of how its presented. Scripted feeling, maybe due to fielders not fully moving during play. AI for fielders may need to be implemented. Errors need to happen similar to actual baseball. Its not fluid, maybe I'm just not receiving.
>
> Orchestrate the models into developing the features im looking for. Marking issues on the project to effectively implement them.

## Context — what is true in the code today

Read out of the repo at `agent/foreman/0459c014dab7`, not from memory.

**The vault does not cover either item.** The only Basedball spec note is *Basedball - Spec - The Ball Off The Bat (Contact in the At-Bat View)*, which is about drawing the ball inside `REPLAY_CUT_MS`. It says nothing about chase penalties or fielder movement. Its §2 rule still governs anything that draws: **the engine grades TIMING, never geometry, and the picture is derived from the verdict.**

### Item 1 — chasing costs nothing today, and that is deliberate

- `src/core/atBat.ts:84-88` states the current decision in a comment: *"A pitch out of the zone is still swung at the same way - the penalty for chasing is that the outcome tables punish bad timing, and a swing can never be called a ball."* The playtest note asks to overturn this. Only Zane can.
- `grade(offsetMs, contact, vision)` — `src/core/timing.ts:87` — takes timing and hitter ratings. Zone position is not an argument. `resolveSwing()`/`SwingInput` (`src/core/hit.ts:136-176`) carries `offsetMs`, `pitchType`, `location`, stats, hands — no `inZone`, no miss distance.
- **There is no "how far outside" number anywhere in the engine.** `inZone` is a boolean rolled off `zoneRate` at `src/core/pitcher.ts:572`. `PitchLocation` (`src/core/hit.ts:38-47`) is nine categorical buckets. The renderer's `spotXY()` at `src/game/main.ts:3300` is the only place distance appears at all, as one constant: `const off = inZone ? 0.22 : 0.78`. Every ball out of the zone sits at exactly 0.78; a pitch that "barely touches the zone" does not exist yet.
- So the ask is not a tuning change. It requires a continuous miss distance that does not currently exist, produced by the pitcher and consumed by the swing grader.

### Item 2 — "not fluid" is at least two different jobs

- `src/core/fielding.ts:5-6` opens with: *"There are no positions, no fielders, no range ratings, no assists and no scorer deciding hit-or-error."* The core module answers two questions with dice.
- `src/game/plot.ts:459-469` is a static table of nine `{num, distFt, dirDeg}` markers. `nearestFielder()` (`plot.ts:481`) picks whoever is closest to the landing spot; `fielderFor()` (`src/game/defense.ts:170`) names him. **Nobody moves to the ball — the ball's landing spot selects a name.** That is the most likely source of "fielders not fully moving during play."
- Errors already exist and are already tuned ABOVE real baseball, not below: `ERROR_RATE = 0.05` (`fielding.ts:44`), with the comment *"real MLB errors run near 1.5% of chances… 0.05 shows up about once every couple of encounters."* Throw quality multiplies it (`fielding.ts:317-321`, wild ×3). So "errors need to happen similar to actual baseball" is a request about how errors are **presented and attributed**, not how often they roll — unless Zane means the opposite and wants the rate cut to 1.5%.

## What a spec has to answer before an implementation issue exists

1. **Does the engine get a continuous miss distance?** Adding one to the pitcher's output and into the swing grader is the whole of item 1; without it there is nothing to scale. Is that change in scope, or is a coarse version — "one bucket further out is harder than the zone edge" off the existing categorical `PitchLocation` — the version wanted?
2. **What does chasing cost, exactly?** Widen/narrow the timing bands from `bandsFor()`, multiply the outcome table toward `strikeout`, or both? And what does `contact` rating buy at distance — the notes say a high-contact hitter should still reach a ball off the plate.
3. **Item 2: presentation or simulation?** Fielders that visibly break on the ball is a renderer job inside the existing replay. Fielders with range ratings who convert or fail to convert a ball is a rewrite of `fielding.ts`, which is currently dice by design. These are not the same job and the notes do not distinguish them.
4. **The error rate: up, down, or unchanged?** It is 0.05 against a real 1.5% and the deviation is documented as intentional. "Similar to actual baseball" reads as a request to lower it, which contradicts the reason it was raised.

**No fact was found that makes item 2 small.** By the Foreman rule that is a signal it needs splitting before anybody starts. Item 1 is one job; item 2 is at least two.

One job at a time — whichever of these goes first displaces the other.
