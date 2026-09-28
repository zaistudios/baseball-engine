# Basedball

A baseball game set a century from now, when the sport is being taken over by
machines. Every player is **human**, **augmented** or a **machine**, and every
club is some mix of the three. The Albany Holdouts are nine humans who refuse
to change. The Detroit Foundry doesn't have a human on the roster.

You hit and you pitch. At the plate you time your swing against the pitch. On
the mound you call the pitch and the spot, then time the release. Every ball in
play is decided on the field. Fielders run it down, throws race runners to the
bag, and the replay shows you exactly what happened.

## Play it

Download `basedball-vX.Y.Z.html` from the
[latest release](https://github.com/zaistudios/baseball-engine/releases/latest)
and double-click it. That's the whole install: one file, no server, works
offline.

## What's in it

- **Exhibition games** between any two of thirty clubs, nine innings, both
  halves played.
- **A franchise season** at a length you choose, with a schedule, a trade
  deadline, a playoff bracket and a champion.
- **Thirty ballparks**, each with its own fences, weather, skyline and
  landmark. Old yards have hand-turned scoreboards; new ones have holograms.
  Games start in the afternoon, at twilight or at night, and the light changes
  as the innings go by.
- **Real rosters** of 26 per club: lineups, benches, rotations and bullpens
  that tire.
- **An editor** for clubs, parks, lineups, and every rating and pitch on every
  player. Bring your own league as JSON.

## Controls

| At the plate | |
|---|---|
| <kbd>Space</kbd> | Swing |
| <kbd>B</kbd> | Square to bunt |
| <kbd>S</kbd> | Send the runner |
| <kbd>H</kbd> | Pinch-hit (<kbd>,</kbd> <kbd>.</kbd> to choose) |

| On the mound | |
|---|---|
| <kbd>1</kbd>–<kbd>6</kbd> | Pick the pitch |
| <kbd>Q</kbd> <kbd>W</kbd> <kbd>E</kbd> / <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> / <kbd>Z</kbd> <kbd>X</kbd> <kbd>C</kbd> | Pick the spot (laid out like the zone) |
| <kbd>Space</kbd> | Start the delivery, then release |
| <kbd>V</kbd> | Change the defensive shift |
| <kbd>B</kbd> | Go to the bullpen (<kbd>,</kbd> <kbd>.</kbd> to choose) |

| Anywhere | |
|---|---|
| <kbd>Esc</kbd> | Pause and settings |
| <kbd>T</kbd> | Watch mode |
| <kbd>F</kbd> | Game speed (watch mode) |
| <kbd>P</kbd> | Pitch speed |

## Building it

Needs Node 23.6 or newer (the scripts run TypeScript directly).

```bash
npm install
npm run dev       # play it in the browser with hot reload
npm run check     # typecheck and tests
npm run sim       # simulate 500 games and print the league's numbers
npm run export    # check, build, and write dist/basedball-vX.Y.Z.html
npm run release   # export, tag and publish a GitHub release
```

`src/core/` is the engine: pitches, swings, the count, the rules of an inning.
`src/game/` is everything else: the league, the field, the replay, the
screens. The engine is deterministic from a seed, so any game can be replayed
exactly.

Art is optional. Drop PNGs into `assets/` to replace the drawn figures; see
[assets/README.md](assets/README.md).
