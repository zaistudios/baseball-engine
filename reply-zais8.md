Item 1 is built and verified. Item 2 has never been answered. And **nothing from this project is on `main`** — including the four jobs already marked done.

## What ZAIS-9 shipped

I read the diff, not the report. Six commits on `agent/builder/zais-9`, and it does what you asked and only what you asked.

- `ThrownPitch.missDistance` — a continuous number in zone half-widths past the edge, rolled where `inZone` is decided in **both** pitch producers (`pitcher.ts:606` and `:1159`). Squared, so a near miss is the common case, which is how arms actually miss.
- `chaseContact()` (`hit.ts:180`) — one factor in `effectiveContact`, beside `stuff` and `platoon`. **Nothing reaches an outcome table.** No `hitTables.ts`, no `ai.ts`, no fielding. A swing timed dead-on at a ball in the other batter's box still grades PERFECT and can still leave the yard — the thing you specifically said to keep. Your call 2, intact.
- Both grade-twice sites carry it: yours at `main.ts:1303`, the computer's at `main.ts:1762`. That second one was not in my issue and Builder found it — without it, a pitch *you* missed the spot with would have punished him in the book and not in the word on screen. Same lie, facing the other way.
- `spotXY()` (`main.ts:3336`) reads the same number, so a ball that barely missed is drawn barely missing. Eyes saw **12 distinct distances from 0.52 to 1.03 across 28 pitches**, where every ball out of the zone used to be drawn at exactly 0.78.
- 500 games: **4.18 runs / 23.2% K / 0.71 errors** — inside every guardrail (4.1–4.6, at or under 23.5%, errors near 0.70). Builder ran a control with the factor switched off and got 4.33 / 22.2%, which reproduces the old baseline, so those deltas are the feature and not the rng shift.

Eyes: **PASS**. 50 test files / 1248 tests, nothing deleted or skipped.

Two housekeeping facts for whoever merges it: the branch forked at `33d7125`, one commit behind `origin/main` — `aeac27e` only added vault notes and `src/` is byte-identical, so a diff against `aeac27e` will *look* like it deletes your playtest notes file and does not. And the platform's auto-commit swept `.verify/` (44 screenshots), `evidence/` and a stray `reply.md` onto the branch; they should come off before it lands.

## Three things that need you

**1. None of it is on `main`, and that includes the ball off the bat.**

ZAIS-1, ZAIS-6, ZAIS-7 and ZAIS-9 are all marked done. All four sit on unpushed local branches. `origin/main` is still `aeac27e`, where `main.ts:3106` reads `if (phase === 'windup' && pitch) drawBall(now)` — **the ball still vanishes the instant you hit it, in the only build you can actually play.** Four finished jobs you have not been able to feel, which is very likely part of why 09-22 reads the same as 09-12. I don't merge. That one is yours.

**2. The window narrows. The bar does not look narrower.**

My CHECKS told Eyes to look for a narrower bar. That was wrong, and both Builder and Eyes caught it: `drawSwingBar()` divides by the bands it just computed (`main.ts:3811`), so the coloured bands always fill the same fraction of the bar whatever the multipliers are. What actually changes is that the same swing lands **further out** against them — +25ms on a strike reads GOOD, +34ms on a ball 0.95 out reads LATE. Nothing is drawing a lie. But the window closing is not something you can watch happen; you see the ball further out, and your marker further out.

The Show shows you the window. *Recommendation: leave it as shipped.* The ball's position is the read you take **before** you commit, and it is honest now; the bar is after the fact. But if you want the bands themselves to visibly close up, say so — it is one small job in `drawSwingBar()` and I'll write it.

**3. Item 2 — "fluid" — is still unanswered, and it is now the only thing left on this issue.**

"Im not sure yet" is where it stopped, and I am not guessing a third time. 09-12 was "scripted, not fluid"; the run cycle on 09-19 was the fix; the complaint came back on 09-22. My three candidates are unchanged and still three different jobs of three different sizes:

1. `SHADE = 0.12` (`plot.ts:623`) — seven of the nine move **12% of the way** to the ball and are drawn dim.
2. `chaseReach()` (`plot.ts:516`) — the chaser is *built* not to arrive: 0.84 of the way on a single, 0.58 on a triple.
3. The at-bat view has **no fielders in it at all**. They only exist in the cut, 300ms after contact.

One word and Eyes films one ball in play with `scripts/filmstrip.ts` and we look at the same frames. That is the cheap move and it costs one run. Until then I'm parked — I'm marking this issue blocked on you, not stalled.

## One number worth having in your hands when you play it

`CHASE_FREE` is 0.4 against a squared distribution, so **56% of balls out of the zone still cost nothing at all**. The black is genuinely free, by design — that is your "a ball that barely touches the zone can be hittable," built. The cost only bites past half a plate: 0.93 of the window at 0.60 out, 0.51 at the wildest pitch in the game.

Small record correction while it's in view: the doc comment on `chaseContact` says "a ball half a plate out at 0.93." The formula gives 0.98 at 0.50 and 0.93 at 0.60. That comment is what the next person to tune this will read, so it's worth a one-word fix whenever anyone next touches the constant.
