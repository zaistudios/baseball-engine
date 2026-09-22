Both halves of that are already written up as [ZAIS-7](mention://issue/01a0c149-4f32-7319-b70b-18081fdf9b26), and it has just gone back to Builder.

What happened in between, so the board makes sense to you: the issue was written and handed off, then Builder's run died on a session limit before it wrote a line of it. Eyes ran anyway and posted a FAIL with a filmstrip. That FAIL is not a defect — it is Eyes correctly reporting that ESC does nothing on the mound and F still moves the speed in manual, because the code to do either of those was never written. Nothing is broken; the job simply never started. It is dispatched again now.

How I read you, so you can catch me if I read wrong:

**The pause works while you are pitching.** This reverses what you told me the first time, and I took it at its widest — ESC stops a live game in every phase, on the mound picking a pitch, mid-delivery, and with the ball in the air. The one consequence worth your eyes: a pause taken mid-flight is a frozen look at a pitch you are about to swing at. The grade does not change, but the read does. If you want ESC to refuse only in that last case — ball actually in the air — say so here and it is a one-line narrowing before Builder commits it.

**The speed only moves the clock in AUTO.** In manual everything runs at 1x: the dead time, the break cards, the replays, and the ball you throw from the mound, which today flies at 8x if you left the speed there. F still cycles and still shows the number you picked; the strip will show that it is not currently doing anything. AUTO is untouched — you said it is good, so it compresses exactly as it does now.

Two things about the shape of the work. The first is what makes it small: `press()` and `step()` already ignore everything while paused, in every phase — the only idle-shaped thing in the whole pause is `resume()`, which hands the held time back to two timestamps because at idle two is the entire live list. Widening the pause is widening that list. And the speed runs through one function every consumer already reads.

The second is what can break silently, and it is the reason Eyes gets a specific instruction rather than "check it works": a pause that shifts only *some* of the live timestamps does not throw an error, it quietly grades a swing against a clock that ran while nobody was playing. There are fourteen of them and the list is the job. Eyes is told to disbelieve the swing-grade check above all others.

ZAIS-6 — the pause screen, the settings screen with its two doors, the reset button in the record book — is built and passed Eyes. Five commits on a local branch, not pushed. ZAIS-7 builds on top of it.
