A pitch that barely misses the zone is drawn barely missing it, and is still hittable. A pitch a foot off the plate gives you a window so narrow you will almost certainly come up empty — and a high-contact hitter still has a usable one out there when a low-contact hitter does not. Timing it dead-on off the plate can still leave the yard.

## DECIDED — Zane, 2026-09-22, on ZAIS-8

1. **The engine gets a continuous miss distance.** Not a coarse version off the nine `PitchLocation` buckets. (Q1: *"yes"*)
2. **Chasing narrows the TIMING BANDS. It does not touch the outcome tables.** Zane: *"narrow the timing band, not the outcome, similar to MLB the Show."* A dead-on swing at a ball off the plate must still be able to leave the yard; the window to find it in is just very small.
3. **`ERROR_RATE` is unchanged.** (Q4: *"unchanged"*) Nothing in this job goes near `fielding.ts`.
4. **Fielder movement and "fluid" are NOT in this job.** Zane on that one: *"im not sure yet."* It stays open on ZAIS-8 and is not to be anticipated here.

No vault note covers this feature. The ZAIS-8 comment thread is the decision record. The only spec note that governs is *Basedball - Spec - The Ball Off The Bat (Contact in the At-Bat View)*, and only for its §2 rule, restated below.

## WHERE TO READ

Line numbers are against `origin/main` at `aeac27e`; `src/` there is byte-identical to this worktree.

**Where the distance has to be born — there are TWO pitch producers and both need it:**

- `src/core/pitcher.ts:572` — `const inZone = rng.next() < zoneRate;` inside `throwPitch()`. The computer's pitch.
- `src/core/pitcher.ts:1085` — `pitchToSpot()`, the pitch YOU throw. `inZone` goes false at `:1101` (a middle call missed off the plate) and `:1107` (`MISS_OFF_PLATE`).
- `src/core/pitcher.ts:250-277` — `interface ThrownPitch`. `inZone: boolean` at `:253` is the only "where" the engine has.

**Where it has to land:**

- `src/core/hit.ts:936-941` — `effectiveContact`. Clutch, platoon, approach and the pitcher's `stuff` are already multiplied together here.
- `src/core/hit.ts:946` — `grade(input.offsetMs, effectiveContact * (input.assist ?? 1), stats.vision)`. The only grade call in the engine.
- `src/core/timing.ts:117` — `bandsFor(contact, vision)`. Every window edge in the game comes out of this one function.
- `src/core/hit.ts:136+` — `interface SwingInput`. `location?` at `:139`; `stuff?` and `assist?` are the two existing precedents for "a scalar the pitch hands the swing".

**The three call sites that assemble a swing:**

- `src/game/main.ts:1300-1320` — the human at-bat. **Read `:1301` and the comment above it at `:1297` before you touch anything.**
- `src/game/sim.ts:187` and `:228`.
- `src/cli/play.ts:148`.

**Where it is drawn:**

- `src/game/main.ts:3300-3306` — `spotXY()`. `const off = inZone ? 0.22 : 0.78;` at `:3303`. **Every ball out of the zone in this game is drawn at exactly 0.78.** The pitch Zane described — one that barely touches the zone — is not currently drawable.
- `src/game/main.ts:3500` — `spotXY()`'s only caller, inside the ball's flight.
- `src/game/main.ts:3767` `drawSwingBar()`, `:3775` `bandsFor(read.scale, read.eyes)`. The bar under the verdict.

**What this must not disturb:**

- `src/game/ai.ts:458-471` — `BANDS`, and `AI_TIMING_BANDS` at `:436`. The computer draws its offset directly in a band against the BASE windows and `resolveSwing()` re-grades it. Read the warning on `miss` at `:449`: *"THIS IS THE RUN-SCORING KNOB."*
- `src/game/ai.ts:662` — `CHASE[key]`, how often the computer chases at all. Unchanged.
- `src/core/atBat.ts:84-88` — the comment stating today's rule. **It becomes wrong, and rewriting it is part of the job.**

## THE FACT THAT MAKES THIS SMALL

**`bandsFor()` scales every window by ONE contact multiplier, and every path in the game reads that same number.** So the whole of "chasing costs you" is one more factor in an existing product — the same seam `platoon`, `stuff`, `approach`, `clutch` and `assist` already use. No new grading path, no branch inside `grade()`, and the bar under the verdict narrows for free, because `drawSwingBar()` draws from the `scale` the swing was snapshotted with.

The structural work is only the number itself: producing a continuous miss distance and carrying it from the pitch to the swing.

## THE RULE THAT DECIDES EVERYTHING

**The engine grades TIMING, never geometry, and the picture is derived from the verdict.** The miss distance is allowed to move a window edge and nothing else. It may not roll a whiff, may not index an outcome table, may not add a probability, and may not decide where the ball goes once it is hit. If it appears anywhere except as a factor in the contact multiplier, it is in the wrong place.

**The corollary is where this job will actually break:** the swing is graded TWICE. `resolveSwing()` grades it for the book at `hit.ts:946`, and `main.ts:1301` grades it again for the word on screen and the bar under it. `main.ts:1297` already says why: *"Graded with the SAME multipliers resolveSwing() will use, the assist included, or the word on screen and the outcome in the book come from different at-bats."* A chase factor applied in one and not the other is that exact bug, shipped.

## STEPS

Commit in this order.

1. **The number exists.** Add a continuous miss distance to `ThrownPitch` — one optional number, zero in the zone, growing outward, with its unit stated in its doc comment. Produce it in both `throwPitch()` (`pitcher.ts:572`) and `pitchToSpot()` (`pitcher.ts:1085`), at the point `inZone` is decided. Optional with a default, so every existing caller and test compiles unchanged.
   **A pitch nicking the edge and a pitch a foot off the plate must both be common.** One constant dressed up as a range is the failure this step exists to avoid — that is what `0.78` already is.
   This adds a draw to the seeded rng stream, so every seeded season in the project replays differently afterwards. Accepted: `hit.ts:469` documents the last time it happened. Do not contort the code to preserve the old streams.
   Test: in the zone it is zero; out of the zone, across many pitches, it spans a real range rather than one value.
2. **The engine reads it.** A field on `SwingInput`, absent by default, and one factor multiplied into `effectiveContact` at `hit.ts:936-941` beside `stuff` and `platoon`. Absent means 1.0, and nothing in the existing suite moves.
   Test: same `offsetMs`, same seed, three distances — the grade degrades as the distance grows, and a 1.35-contact hitter still grades better at a given distance than a 0.85-contact one. That second assertion is Zane's requirement written as a test.
   Test: a dead-on swing (`offsetMs: 0`) off the plate still reaches `perfect` and can still roll a home run. Decision 2 says it must.
3. **The screen agrees with the book.** Pass the same factor into `scale` at `main.ts:1301`. The word, the bar and the outcome come off one number, or this job has shipped a lie.
4. **Wire the call sites.** `main.ts:1304`, `sim.ts:187` and `:228`, `cli/play.ts:148`.
5. **It is visible.** `spotXY()` (`main.ts:3300`) reads the distance instead of the `0.22 : 0.78` constant, so a pitch that barely missed is drawn barely missing and a pitch in the other batter's box is drawn out there. **An invisible penalty is an unfair penalty** — without this step the player is punished for something the screen never showed him.
6. **Tune it, then correct the record.** Run `scripts/balance.ts` and land inside the guardrails below. Then rewrite the comment at `atBat.ts:84-88`, which now states the opposite rule.

## DO NOT

- Do not multiply `OUTCOME_TABLES`, add a strikeout weight, or touch `hitTables.ts`. Decision 2.
- Do not make a home run on a ball off the plate impossible. It is the thing Zane specifically asked to keep.
- Do not touch `ERROR_RATE`, `fielding.ts`, `plot.ts`, `overhead.ts`, `defense.ts`, or anything at all about fielders. Decision 4 — that question is unanswered and it is not yours to answer.
- Do not roll the distance inside `resolveSwing()`. It belongs to the pitch; a draw taken at swing time desynchronises a seeded replay against the same swing taken from the CLI.
- Do not retune `AI_TIMING_BANDS` or `CHASE` to pull the K rate back. If the league moves outside the guardrails, the chase factor is too strong — that is the knob.
- Do not widen `TIMING_WINDOWS_MS` to compensate.
- Do not add a tenth `PitchLocation` and do not change `applyLocation()`. The nine buckets still do their job; this number sits beside them.
- Do not touch `src/web` or `index.html`. Frozen.
- Do not push.

## CHECKS

`npm install` first — this worktree has no `node_modules`.

- `npm run check` — clean typecheck, and **49 test files / 1239 tests passing**, measured 2026-09-22 before any of this. That count must not fall, plus your new tests. Nothing deleted, renamed or skipped.
- `npm run sim` (500 games), measured on the same baseline:

  ```
  runs per team   4.33    K rate   22.3%    walks per team   3.10
  hits per team   8.42    K/team   8.36     errors per team  0.70
  ```

  Step 1 shifts the rng stream, so these will not reproduce exactly and are not meant to. The guardrails after the change:

  - **runs per team 4.1–4.6.** Outside that, the penalty is mistuned.
  - **K rate at or under 23.5%.** The computer chases at `CHASE` rates today and its swings are drawn against the base windows, so every chase it makes now grades worse — this line is where the feature shows up league-wide.
  - **errors per team still near 0.70.** Nothing in this diff touches fielding; a real move there means the diff strayed.
- `npm run dev`, **in a visible browser window** — a hidden tab freezes rAF:
  - Take pitches until you have seen one drawn just off the edge of the zone and one drawn well outside. **If every ball is still drawn the same distance out, step 5 did not land.**
  - Swing at the one just off the edge with your best timing: the bar is narrower than on a strike, and PERFECT is still reachable.
  - Swing at the one well outside with the same timing: the bar is narrower again, and the swing misses.
  - On every one of those swings, the word on screen and the line in the play log describe the same swing. That is step 3.

## HANDOFF

Builder. One commit per step. `npm run check` clean, `npm run sim` inside the guardrails, and **paste the sim output into your report** — the K rate line is what this gets reviewed against. Do not push. Hand back with what you could not see for yourself; Foreman writes Eyes a verification list off the diff.
