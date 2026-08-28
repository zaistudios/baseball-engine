# Assets

**Drop a PNG in a folder. That is the whole install step.**

No manifest to edit, no import to add, no id to register. The folders are read
at build time by `import.meta.glob` in `src/web/sprites.ts`, so a file that
exists is a file the game uses, and a file that does not exist means the game
draws the coloured rectangle it drew before.

That fallback is the point: **everything in here is optional, always.** You can
ship one batter or twenty or none, in any order, and the game runs identically
either way. Nothing half-loads and nothing 404s.

```
assets/
  batters/     one per hitter
  pitchers/    one per arm
  ball/        ball.png
  field/       background.png, or one per division
  fielders/    the overhead replay's nine, and the runner
```

`.png`, `.gif` and `.webp` are all picked up.

## Naming

A file is matched by its name, lowercased, with punctuation turned into
hyphens. **Two names work for every player** — use whichever you prefer:

| file | matches |
|---|---|
| `assets/batters/cap-mullaney.png` | Cap Mullaney, by name |
| `assets/batters/hu1.png` | the same man, by his stable id |
| `assets/batters/unit-7-cletus.png` | `UNIT-7 "Cletus"` — quotes and dashes don't matter |
| `assets/batters/_default.png` | **every** batter without a file of his own |

`_default.png` is how you dress the whole roster with one drawing while the
other nineteen are still being made. A named file always beats it.

Subfolders are fine — `batters/holdouts/cap-mullaney.png` resolves the same
way, since only the filename is matched.

### The names the game knows

**Batters** (id → name): `hu1` Cap Mullaney · `hu2` Deacon Roy · `hu3` Wee Tom
Barrow · `hu4` Rosa Ivern · `hu5` Smoky Joe Vance · `au1` Dex Okafor · `au2`
Marco Vela · `au3` Ty Brennan · `au4` Ravi Sundaram · `au5` Junior Castellanos ·
`ma1` UNIT-7 "Cletus" · `ma2` Xandra Kō · `ma3` Orbital Pete · `ma4` The Gantry ·
`ma5` Nine-Iron Nadia

**Pitchers**: `hank-sowell`, `birdie-lomax`, `old-man-prewitt`, `vector-ruiz`,
`delta-nakamura`, `the-surgeon`, `model-9`, `vulcan-ii`, `the-architect`

**Field**: `holdouts`, `splice`, `foundry`, or `background` for all three.

**Fielders**: `1`–`9` by scorer's position number, `runner`, or `_default`.

## Size and shape

**Draw at whatever resolution you like.** Each kind has a target height in
`SPRITE_SPECS` and your image is scaled to it with its aspect ratio kept, so a
32px sprite and a 512px one both land correctly. Nothing needs tuning per file.

| kind | drawn at | anchored |
|---|---|---|
| batters | 92px tall | at his feet |
| pitchers | 46px tall | at his feet |
| fielders | 14px tall | at his feet |
| ball | 16px, then scaled by distance | centre |
| field | 480px tall | centre |

"Anchored at his feet" means the sprite is positioned by where the player
**stands**, so a taller drawing grows upward out of the box rather than sinking
through the dirt. Leave no empty padding under the feet or he will float.

Scaling is done with smoothing **off**, so pixel art stays crisp instead of
being blurred by the browser's scaler.

## Facing

**Draw every batter and pitcher right-handed, facing the plate.** Left-handers
are the same file mirrored, and the game does that for you — the whole swing
mirrors with him.

The camera sits behind the catcher looking out at the mound, so a right-handed
hitter stands on the **left** of the screen (third-base side) and is seen from
behind and slightly to the side. Draw him from that angle.

One consequence worth knowing: **anything written on a uniform comes out
backwards on a left-hander.** Avoid text and numbers on the art, or accept it.

## The swing is code, not art

A batter asset is a **single standing pose**. You do not draw a swing.

`swing.ts` owns the whole animation — the bat sweeps a level arc through a
foreshortened plane, the barrel arrives over the strike zone at exactly
`SWING_TRAVEL_MS` (120ms), and the body opens up about 14° and shifts into the
pitch. That is written once and every batter inherits it, which is why twenty
batters costs twenty files rather than twenty animations.

The bat is drawn separately, on top. **Do not draw a bat into the sprite** — you
will get two.

## Did it work?

Run `npm run dev` and look at the title screen. In development it prints
`N assets loaded` under the buttons. If your file is not counted, the name did
not match; if it is counted and you still see a rectangle, check the console for
a decode warning.

## The one-file demo

`npm run demo` inlines every asset into the single html file as a `data:` URI,
because that file is opened by double-click from a `file://` origin where there
is no server to fetch a sibling PNG from. Base64 costs about 4/3 the size on
disk, and the build prints the total, so keep an eye on it if you ever add
something large.
