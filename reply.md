Four answers, one issue. It's with Builder now: **ZAIS-6 — Pause at idle, a settings screen with two doors, and a reset button in the record book.**

How I read you, so you can catch me if I read wrong:

1. **Pause only at idle.** Taken literally — ESC between pitches works, ESC during a windup or a delivery does nothing.
2. **"Similar to every other game"** → one confirm, then the book empties. Seasons and the barrel streak go. Your custom clubs and your saved season do not, and the confirm says so before you press it.
3. **Two doors, one screen.** A SETTINGS card on the title menu next to CUSTOMIZE, and a SETTINGS button on the pause screen. Same screen both ways. The four hotkeys (`t` `f` `g` `p`) keep working everywhere — the screen lists them and shows each key rather than replacing them.
4. **Quit just ends the game.** One thing worth your eyes: mid-franchise, "just ends the game" means nothing gets written, so CONTINUE puts you back on the same day and you play that game again from the top. A re-roll, in other words, not a forfeit. That's the simplest reading of what you said and it's what the existing Quit button already does — but if you meant the day should count as played, say so here and I'll get it changed before Builder commits that step.

Two things I found in the code that shape the job. The first: an overlay is not a pause. `#pre` covers the canvas and takes the keyboard, but the frame loop keeps running underneath it — with AUTO on, the computer would go on playing your half behind the pause screen. So the pause is a real flag that stops the loop, and the screen is just what you see once it's stopped. The second: the engine grades timing off the wall clock, so a pause has to hand back the time it took, or a between-innings card would vanish the instant you resumed.

What makes it small: five screens in the game are already built out of the same overlay, so the pause screen and the settings screen are two more of those — no new element, no new CSS, `game.html` untouched. And the reset is two function calls that already exist behind a confirm.

ZAIS-5 stays open as the parent until Builder and Eyes are through.
