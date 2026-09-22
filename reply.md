All four things you asked for are built and both children passed Eyes. Marking this ready for your review.

## What you asked for, and where it is

> "Pause screen, menu settings ability to quit game, reset stats in record book."

- **Pause screen** — ESC stops a live game in *every* phase: on the mound at `calling`, mid-delivery, ball in the air. Eyes' last pass, today at 14:24, saw it stop on the mound and resume clean.
- **Settings menu** — one screen, two doors: a `SETTINGS` card on the title menu and a button on the pause screen. The four hotkeys (`t` `f` `g` `p`) still work everywhere, unchanged.
- **Quit** — `QUIT TO MENU` on the pause screen (`src/game/main.ts:6361`). Ends the game, records nothing.
- **Reset stats** — a button in the record book behind a `confirm()` (`src/game/main.ts:6591`). Clears `asb-career` and `asb-streak`. Your custom clubs and your saved season are not touched, and the confirm says so.

Plus the thing you added on 2026-09-21: the speed multiplier now only runs the clock in AUTO. In manual it reads `8× — AUTO only, not running` and does nothing.

## The one thing standing between this and you playing it

**None of it is pushed.** All of it — both children — sits on one local branch:

`agent/builder/zais-7` at `173444f`. `origin/main` contains none of it.

Three things I checked so nobody has to guess at merge time:

1. **There is only one branch to land, not two.** `agent/builder/zais-7` already contains every product commit from `agent/builder/zais-6`. The single commit on zais-6 that is not on zais-7 is `2e1e1ce`, and it is an agent's `reply.md` — no product code.
2. **Eyes passed exactly this code.** The branch Eyes ran its final check on (`agent/eyes/zais-7-916afb02eb34`) has a byte-identical `src/` and `game.html` to `173444f`. The PASS covers what is on the builder branch.
3. **The branch is not clean and it is not current.** Its tip commit `173444f` is pure agent scratch — `a.patch`, `all.patch`, `b.patch`, `description.md`, `msg1.txt`–`msg3.txt`, `split.mjs`. Those must not reach main. And the branch was cut from `33d7125`, while `origin/main` has since moved to `aeac27e`, so it needs a rebase before it lands.

Landing it is your call — I don't merge or push. Say the word and I'll write Builder the issue that drops the scratch, rebases onto `origin/main`, and pushes.

## One decision still open, not a blocker

ESC was built at the widest reading of your word: it stops the game with the ball in the air too. That is a frozen look at a pitch you are about to swing at. The grade does not move — a pause adds the same held milliseconds to all fourteen live clocks, so no interval changes — but the *read* does. If you want ESC to refuse while the ball is actually in flight, say so and it is one condition in `pause()`.

## Loose end

ZAIS-10 is open and unassigned: `scripts/filmstrip.ts` imports `playwright`, which is not in `package.json`. It is why Builder could not film its own verification and had to hand the swing-grade check to Eyes unproven. Eyes then confirmed it. Not urgent, but it will bite the next agent who tries to capture frames.
