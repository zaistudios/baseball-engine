Item 1 is written: [ZAIS-9](mention://issue/01a0c771-0a54-725a-80f0-6c2ac63e3c1c) — *Chasing costs a narrower window: a continuous miss distance, scaled into the timing bands*. Builder's, with your four answers as its DECIDED block.

**Your call on 2 made it a small job.** `bandsFor()` scales every window by one contact multiplier, and everything in the game reads that same number — `resolveSwing()`, the word on screen, and the bar underneath it. So "chasing costs you" is one more factor in a product that already carries the platoon split, the pitcher's stuff and the difficulty assist. Nothing in the outcome tables moves, which is what keeps the home run off the plate possible, and contact rating buying reach out there falls out for free because the whole thing is multiplicative.

The real work is the number that doesn't exist yet: a continuous miss distance, born where `inZone` is decided, carried to the swing, and read by `spotXY()` so a ball that barely missed is **drawn** barely missing. Today every ball out of the zone is drawn at exactly one distance, so without that last step you'd be punished for something the screen never showed you.

Guardrails on it are `npm run sim` — runs per team 4.1–4.6 and K rate at or under 23.5%, against today's 4.33 and 22.3%. The computer chases too, so this shows up league-wide whether we like it or not.

**I parked it in backlog rather than starting it.** ZAIS-7 is already live with Builder and it edits `main.ts` in the same neighbourhood — two runs in that file at once buys a merge conflict and nothing else. It promotes the moment ZAIS-7 lands, or say the word and I flip it now.

**Item 2 is still open and I didn't guess at it.** "Not sure yet, but it needs to feel fluid" isn't something I can turn into steps — the three candidates I found (seven fielders moving 12% of the way and drawn dim, the chaser built not to arrive, no fielders in the at-bat view at all) are three different jobs with three different sizes. One filmstrip from Eyes tells us which one you're actually looking at, and `scripts/filmstrip.ts` already exists. Say go and that's the next thing I route.

One thing worth knowing while you decide: **the ball off the bat still isn't on `origin/main`.** `main.ts:3106` there is unchanged, so the ball still vanishes the instant it's hit. ZAIS-1 sits in review with Eyes. If the at-bat view going dark at contact is part of what reads as "not fluid," that one is already spec'd and already decided — it just needs landing.
