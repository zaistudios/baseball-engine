Found while building ZAIS-6. The pause ships exactly as decided — `idle` only — and it works. But `idle` is only half the game, and the half it is missing is the half you spend on the mound.

## WHAT IS TRUE TODAY

`kickOff()` at `src/game/main.ts` sets `phase = youBat() ? 'idle' : 'calling'`, and every at-bat ends back at the same fork. So:

- **You are batting.** The game sits at `idle` waiting for your SPACE. ESC pauses. This is the case the spec's acceptance checks exercise, and it passes.
- **You are pitching.** The game sits at `calling` waiting for you to pick a pitch and a spot. ESC does nothing. There is no `idle` anywhere in your half on the mound.

So for nine half-innings of every game — the ones where a manager is most likely to want a moment — the pause key is dead. It is not a bug in the implementation; `pause()` refuses outside `idle` because decision 1 of ZAIS-5 says to, and the DO NOT list says "Do not pause outside `idle`."

Verified by hand in a visible browser: reaching a pause from a cold exhibition took 21–36 pitches thrown by hand, because the half I started in was the pitching half and ESC would not take until the side was retired.

## WHY IT IS NOT A ONE-LINE FIX SOMEBODY SHOULD JUST DO

It looks like one: add `'calling'` to the phase test. And the safety argument holds — `calling` has no graded moment in flight. `arriveAt`, `deliveryAt`, `throwAt` and `flashUntil` are all dead there, exactly as they are at `idle`, so `resume()`'s existing shift of `sceneAt` and `breakFrom` covers it unchanged.

But it is a change to a decision Zane made by name, and the same question has at least one more phase in it — `resolve`, the dead time between the call and the next pitch, which is where the clock actually spends most of the gap. That one DOES have a live deadline (`flashUntil`) and would need a third line in `resume()`.

## THE DECISION

**For Zane.** Three readings of "between pitches":

1. `idle` only. What shipped. ESC works in your batting half and nowhere else.
2. `idle` + `calling`. ESC works whenever the game is waiting on YOU. No new clock arithmetic. My recommendation.
3. `idle` + `calling` + `resolve`. ESC works any time nothing graded is in the air. Needs `flashUntil` added to the shift in `resume()`, which is one line and the same pattern as the two already there.

None of the three can interrupt a windup, a delivery or a throw, which is the thing decision 1 was actually protecting.

## WHERE

- `src/game/main.ts` — `pause()`, the `phase !== 'idle'` guard.
- `src/game/main.ts` — `resume()`, the two lines that hand the time back.
- README, the `ESC stops it, and an overlay never did` section, which currently says "between pitches, and nowhere else".
