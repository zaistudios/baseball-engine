Five commits on `agent/builder/zais-6`, not pushed. `npm run check` clean — 49 files, 1239 tests, the same count as before I started, nothing skipped or renamed.

## WHAT TO OPEN, AND THE CONTROL THAT REACHES IT

- **SETTINGS** — a new card on the title menu, beside CUSTOMIZE. Four rows, each showing its key. The same screen opens from the pause screen's SETTINGS button, and BACK there returns to the pause screen rather than to the game.
- **The pause screen** — start an EXHIBITION, get to **your batting half**, press <kbd>ESC</kbd>. RESUME / SETTINGS / QUIT TO MENU. <kbd>ESC</kbd> resumes too.
- **EMPTY THE RECORD BOOK** — title menu → RECORD BOOK, scroll past the whole book, under BACK. One confirm.

## WHAT I DROVE IN A VISIBLE BROWSER

Not the suite — a Playwright script against `npm run dev` in a real window, playing by hand. What it showed:

- **AUTO turned on while the pause screen is up plays nothing.** The canvas is byte-identical across 2.5 seconds of it. That is the check this job exists for and it is the one I most wanted to see fail.
- **The clock shift holds.** Paused on a MIDDLE OF THE 2ND card, held eight seconds — four times the card's whole life — resumed, and the card was still there, still fading in from where it had got to, then ran out on its own. Two canvas dumps attached.
- <kbd>ESC</kbd> during a pitch in flight puts up nothing and the pitch goes on running.
- The reset empties the book in place and on disk (`asb-career` → `{"years":[]}`, `asb-streak` → `{"best":0}`), leaves `asb-league` exactly as it was, and the RECORD BOOK card disappears from the title menu afterwards.
- QUIT TO MENU lands on the title screen with nothing written — no career row, no season file.

## A SECOND DEFECT, FIXED AT THE ROOT

Reaching for BACK on the new settings screen found that **the title screen's d-pad has been swallowing <kbd>SPACE</kbd> and <kbd>ENTER</kbd> for every screen opened over it**. `installDpad` stands down when its root is "gone, or hidden behind something else" and read that as `#start` being disconnected or `display:none` — but `#pre` opens *over* `#start` and leaves it connected and displayed, so the title's cursor went on capturing those two keys and `stopPropagation()`ing them before they reached the handler those screens leave their own BACK key on.

Which means **the record book's `BACK SPACE` has never worked from its title card**, since the day it shipped. One guard in `installDpad` rather than one per screen; it repairs the book and the calendar along with the new screen. Committed separately.

## WHAT I COULD NOT VERIFY MYSELF

- **The settings screen has no cursor on it,** because none of the five screens built out of `#pre` do — the spec said build it in the shape of `showCareer()` and I did. So it is mouse plus the key printed on the row. If the title menu's "ARROWS MOVE · ENTER SELECTS" is meant to hold on these screens too, that is a different job and now a cheap one, since the d-pad fix above is what was stopping it.
- **Everything I drove, a script drove.** A script clicking a button is not a person finding it. Nobody has looked at these screens with their eyes and decided they read right — in particular whether the settings rows are legible as *rows of a setting* rather than three buttons stacked, and whether the quit warning lands before somebody presses QUIT rather than after.
- **Franchise, specifically.** Everything above was an exhibition. The claim "a half-played franchise day is never written, so CONTINUE puts you back on it" is read off the code and the storage keys, not off a franchise I quit out of and resumed.
- **The EMPTY button shows on an already-empty book.** It is a no-op there. I left it rather than grow the diff.

## WHAT THIS DISPLACED

**ZAIS-7**, opened and parked in backlog, marked for Zane: <kbd>ESC</kbd> is dead for the half of the game you spend on the mound. `phase` is `calling` while you pick a pitch, never `idle`, and decision 1 says `idle` only — so the pause key does nothing for nine half-innings of every game. Reaching a pause from a cold exhibition took 21 to 36 pitches thrown by hand, because the half I started in was the pitching half. It is not an implementation bug and I did not widen the guard: that is Zane's decision, with my recommendation on the issue.
