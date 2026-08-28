# Prototype autopsy — the evidence, not the code

The Godot prototype this project replaces is the "before" artifact for the AI-workforce
experiment. On 2026-08-11 its three documented faults were executed rather than
read. **All three reproduce.** This directory holds the harness that proves it.

None of this is built or tested by `npm run check`. It is a record.

## Running it

The prototype lives at `C:\Users\zaneg\Downloads\Baseball proto\all-star-baseball`.
It has no version control, so **work on a copy** — the original is the artifact.

```bash
cp -r "<prototype>" ./proto-copy
cd proto-copy
head -401 scripts/systems/GameManager.gd > gm.gd && mv gm.gd scripts/systems/GameManager.gd
cp <this dir>/autopsy_harness.gd .
godot --headless --path . --script autopsy_harness.gd
```

## The one-line fix, and why it is the interesting part

`GameManager.gd` is 549 lines and does not parse. Lines 403–549 are **GameField
code pasted into it**, still carrying the instructions that shipped with it:

```gdscript
# FILE 2: Integration with GameField.gd
# ADD these modifications to your existing GameField.gd
```

Those lines reference `match_stats`, `match_in_progress` and `game_state` —
GameField's variables — producing 19 cascading parse errors. The real
implementations already exist in `gamefield.gd`, and nothing calls the copies.
Deleting 403–549 is the whole fix: 147 lines out, none in. The project then boots
clean.

**The defect that killed the build was an un-followed instruction inside generated
output**, not a logic error. That is the finding worth keeping.

## What the harness shows

| Fault | Verdict | Correction to the autopsy |
|---|---|---|
| 1 — early graded as late | confirmed | only reproducible when driven from the press time; grading a `timing_difference` directly shows nothing |
| 2 — perfect window under the instrument | confirmed | the ±0.005s band is **0.60 of one 60Hz tick** — unreachable, not merely hard |
| 3 — `miss` with no table | confirmed | **48%** of the contact window, from exactly 0.26s. And it is **not a crash** — Godot 4 logs an error and returns `{}`, which is why it shipped |

Fault 3's silent-empty-return is the reason `TimingGrade` includes `'miss'` and
`OUTCOME_TABLES` is a `Record` over it: in TypeScript the same omission cannot
compile. See `src/core/hitTables.ts`.

Full writeup, with output: vault note
`Baseball Roguelike - Autopsy Verified in Godot (2026-08-11)`.
