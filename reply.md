Read both playtest items against the code and the vault. **No spec note covers either one**, so no implementation issue gets written until you answer below. One correction to my own issue body first, because it was wrong and it changes item 2.

## ⚠️ Correction: the fielders DO move. All nine, every frame.

My issue body said *"nobody moves to the ball — the landing spot selects a name."* That is true of `src/core/fielding.ts` (no positions, no range ratings — dice by design) and **false of what you are looking at**. The overhead replay moves every one of the nine:

- `src/game/plot.ts:594` `roleFor()` gives each man a job every play — `chase`, `cover-first`, `cover-second`, `relay`, `shade`.
- `src/game/overhead.ts:944-971` walks all nine per frame, eases them out of their posts, and `src/game/main.ts:3489` drives a `runCycle()` so their legs move.
- `REACTION_MS = 110` (`plot.ts:539`) holds them still for a tenth of a second first, deliberately.

So "fielders not fully moving" is not "no fielder AI." It is something specific on screen, and I can point at three candidates in the code — but I am not going to guess a second time:

1. **`SHADE = 0.12`** (`plot.ts:623`) — seven of the nine move **12% of the way** to the ball and are drawn `dim`. That is the nearest thing in the code to "not *fully* moving."
2. **`chaseReach()`** (`plot.ts:516-526`) — the chaser is **built to not arrive** on a hit: 0.84 of the way on a single, 0.72 on a double, 0.58 on a triple.
3. The at-bat view has **no fielders in it at all**. They exist only in the cut, which starts 300ms after contact.

⚠️ **This is the second time you have said this.** 09-12 was *"scripted, not fluid"*; the fix shipped for it was the run cycle on 09-19 — and the complaint came back on 09-22. Guessing a third time is the expensive move.

## Item 1 — you are right that chasing is free, and it is deliberate

`src/core/atBat.ts:86` states it outright: *"the penalty for chasing is that the outcome tables punish bad timing, and a swing can never be called a ball."* Only you can overturn that.

**There is no "how far outside" number anywhere in the engine.** `inZone` is a boolean (`pitcher.ts:572`), `PitchLocation` is nine categorical buckets (`hit.ts:38-47`), and `grade(offsetMs, contact, vision)` (`timing.ts:87`) never sees location at all. The only distance that exists is one constant in the renderer — `const off = inZone ? 0.22 : 0.78` (`main.ts:3303`). **Every ball out of the zone sits at exactly 0.78.** The pitch you described — one that "barely touches the zone" — does not exist yet.

## The four questions

**1. Does the engine get a continuous miss distance?**
*Recommendation: yes.* Without it there is nothing to scale and item 1 cannot be built at all. The coarse version off the nine buckets can only say "outside," which is the thing you are already unhappy with. It also buys the renderer a real spread instead of one constant.

**2. What does chasing actually cost — and what does `contact` buy out there?**
*Recommendation: narrow the timing bands, not the outcome table.* `bandsFor()` (`timing.ts:117`) already scales every window by `contact`, so shrinking it by distance gives you exactly what you described for free: a high-contact hitter keeps a usable window further out, a low-contact one loses it near the plate. Pushing the outcome table toward strikeout instead would kill the home run on a ball off the plate — the thing you specifically said should stay possible.

**3. Item 2 — presentation or simulation?**
*Recommendation: neither yet — send Eyes to film it first.* A filmstrip of one ball in play already has a tool (`scripts/filmstrip.ts`, landed at `33d7125`). My read of this was wrong once today; the cheap move is one capture that names which of the three candidates above you are actually seeing. Rewriting `fielding.ts` into a real fielding sim is the largest job on this project and I will not open it on a guess.

**4. The error rate — up, down, or unchanged?**
*Recommendation: unchanged.* `ERROR_RATE = 0.05` (`fielding.ts:44`) against a real MLB ~1.5%, and the comment says it was raised on purpose so you would actually see one. "Similar to actual baseball" reads as *lower*, which would make errors roughly three times rarer than they are now. I think what you want is errors that are **attributed and visible** — a name and a play — not fewer of them. Tell me if I have that backwards.

## What this displaces

**The Ball Off The Bat.** It is spec'd (`Basedball - Spec - The Ball Off The Bat`), you unblocked it on 09-20 with Option A, and **it is still not built** — `main.ts:3106` still reads `if (phase === 'windup' && pitch) drawBall(now)`, so the ball still vanishes the instant it is hit. One job at a time: item 1 here is one clean job and would go next, but it takes the slot that spec is holding.

Answer 1, 2 and 4, and say go on 3, and I will write item 1 as a single issue for Builder.
