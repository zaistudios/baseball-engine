# Baseball Engine

Two things share one core, both TypeScript, both offline-playable single files.

- **The baseball game** (`src/game/`, `game.html`) — a whole nine-inning game
  against the computer, franchise seasons, playoffs. **This is the live work.**
- **The roguelike** (`src/core/`, `src/web/`, `index.html`) — a retro NES-style
  batting run: nine encounters, three leagues, you are only ever the batter.
  On the backburner.

Personal project. An AI agent team does the engineering, the human does assets
and direction. Design notes live outside this repo.

## Status

**Both are playable end to end, and the baseball game is where the work is.**

- **Basedball** — nine innings against the computer, both halves; a franchise
  season of a length you set, with a bracket and a champion at the end of it;
  thirty clubs in thirty ballparks, 26 men to a club, and an editor that lets
  you rewrite any of it without touching the repo. Shipped as one html file:
  [the latest release](https://github.com/zaistudios/baseball-engine/releases/latest).
- **The roguelike** — a full nine-encounter run in the browser, or a single
  encounter in the terminal. Still builds, still passes, not being extended.

```
src/core/
  rng.ts         seeded RNG (mulberry32) — determinism is a hard requirement
  timing.ts      grade(offsetMs) — pure swing grading, no engine underneath
  delivery.ts    the same, for the mound — when you let go, and what it is worth
  hitTables.ts   outcome probability tables, ported from the prototype
  hit.ts         resolveSwing() — stat, power-swing and location modifiers
  atBat.ts       the count — balls, strikes, walks, fouls, whiff ≠ strikeout
  inning.ts      outs, bases, runs, the sac fly, the double play and the extra base
  pitcher.ts     5 pitch types, 9 arms, and the PLAN each one pitches to
  run.ts         the roguelike layer — 9 encounters, money, shop, power-ups
  opponent.ts    the other team's runs, rolled not played — the scoreboard
  baserunning.ts steals — one decision, one stat, one resolution
  division.ts    the three divisions — how automated the league is
  roster.ts      players, builds, and chemistry between adjacent lineup slots

src/web/
  main.ts        the at-bat screen on canvas; DOM/CSS for the HUD
  swing.ts       the bat as a physical object — the level arc, and its geometry
  sprites.ts     the asset layer: drop a PNG in assets/ and it replaces a shell
  plot.ts        where a batted ball lands, for the overhead replay
  overhead.ts    the replay itself — the cut, the nine, the race to first
  scorecard.ts   the scorer's line and what the booth says
  save.ts        resuming a run — validated, and refuses a bad blob
src/cli/
  play.ts        the same core, played in a terminal
```

## The full baseball game (`src/game/`)

**A whole nine-inning game, both halves played, you against the computer.** No
roguelike: no run, no shop, no money, no divisions. The engine foundation.

```
src/game/
  main.ts        the playable screen — you hit the bottom half, you pitch the top
  game.ts        a whole nine-inning game: two teams, both halves, real innings
  sim.ts         the same at-bat with no human in it — the computer's half
  ai.ts          the computer manager: what it throws you, and how it hits you
  teams.ts       ⚠️ EDIT HERE FIRST — thirty clubs, nine hitters and six arms each
  depth.ts       eighteen written men become a 26-man club
  depthNames.ts  the 240 names the depth is not allowed to generate
  identity.ts    HOW a club plays, as against what it is worth (the Tecmo layer)
  value.ts       one number for a player, one for a club, and its rank of thirty
  rotation.ts    who starts tonight, and what his last start cost him
  bullpen.ts     an arm gets tired, and somebody has to come get him
  defense.ts     nine men standing somewhere, and the ball reaching one of them
  placement.ts   where the ball actually went, and what the geometry is worth
  running.ts     the running game — steals, and taking the extra base
  form.ts        hot and cold: what a man is doing THIS week
  streak.ts      the barrel streak — the arcade score hung on squaring one up
  stats.ts       the box score, folded out of the at-bats as they happen
  franchise.ts   one season: a schedule, a bracket, a champion
  moments.ts     the season stops and asks you something it earned the right to
  career.ts      the shelf — every finished season on this machine
  rules.ts       what your league decided before it played a game
  league.ts      export the thirty clubs as JSON, edit them, paste them back
  editor.ts      the club editor, minus the screen
  scene.ts       what the replay is ABOUT, in two lines and a length
  difficulty.ts  how hard the swing is, how fast the ball comes, and how honest
                 the clock is
  tuning.ts      the knobs somebody will actually want to turn
```

```bash
npm run game    # play it — opens /game.html
npm run sim     # 500 headless games, prints run scoring
npm run export  # fold it into ONE html file you can play offline
npm run release # ...and ship that file as a GitHub release
```

The measurement scripts are the other half of the engine, and each one answers
one question. Run the relevant one after touching what it measures — every
balance number quoted in this README came out of one of them.

```bash
node scripts/league.ts     # the round robin — does a better roster finish higher
node scripts/balance.ts    # what a game LOOKS like: runs, hits, K rate, pitches
node scripts/parks.ts      # every park's size and factor, and whether they average to neutral
node scripts/parkplay.ts   # the same two clubs in all thirty buildings
node scripts/parkruns.ts   # did the parks move the run environment (they must not)
node scripts/parkladder.ts # did the parks break the ladder (they must not)
node scripts/scenes.ts     # what the replay captions cost, and how often each fires
node scripts/hrswap.ts     # the probe that proved geometry cannot decide a home run
```

`npm run export` writes **`dist/basedball-v<version>.html`** — the whole
game in a single 336 kB file with nothing external in it. Double-click it, put it
on a USB stick, email it to yourself. It is a classic script at the end of
`<body>` rather than a module, because browsers refuse to fetch ES modules
across a `file://` origin and opening by double-click is the entire point.

## Getting it onto another machine

⚠️ **Cloning this repo does not get you a playable game.** `dist/` is gitignored
— the built html changes wholesale every build and does not belong in git
history — and `game.html` loads `/src/game/main.ts`, which a browser will
neither execute nor fetch over `file://`. A clone gets you the source; you still
need Node and one `npm install` to turn it into something you can play.

**The releases are the deliverable.** Grab the html from
[the latest release](https://github.com/zaistudios/baseball-engine/releases/latest)
and double-click it: no clone, no Node, no network. That is the copy to put on a
USB stick.

To cut one:

```bash
npm version patch --no-git-tag-version   # or minor / major — your call
git commit -am "vX.Y.Z" && git push
npm run release
```

`npm run release` exports, tags, pushes the tag and creates the release with the
file attached. It refuses to run on a dirty tree — a release built from
uncommitted code can never be rebuilt from its own tag — and refuses a version
that already shipped. `node scripts/release.mjs --dry-run` shows what it would
do without doing any of it.

`npm run demo` (the roguelike) and `npm run export` (this game) used to both
clear `dist/`, so each silently wiped the other's output and `dist/` never said
which one you had. Each page now builds into its own `dist/build-<page>/` and
only the finished files land in `dist/`, where their names already differ.
**Run them in either order; both survive.**

The game opens on a **start screen** with two modes:

- **Exhibition** — pick your club and pick who you are playing. One game. Your
  club is the home team, so you bat last and can win it in the ninth.
- **Franchise** — pick the club you run and play its schedule.

### The title screen is a cartridge

**It is a console menu now, and that is a control scheme as much as a look.**
Arrows walk a blinking cursor over whatever the screen is showing, ENTER
presses it, and left/right on a dial turns it — so the whole of mode, rules,
difficulty and thirty clubs is reachable without a mouse. The cursor is put on
the first thing on every screen that draws, because a console menu is never
pointing at nothing: without that, ENTER means "wake the cursor" on its first
press and "start a franchise over the one you have saved" on its second.

⚠️ **THE MENU CAPTURES THE KEYBOARD, AND IT HAD TO.** A ball game is live
underneath this overlay, and the game's own key handler is on the window — so
SPACE on the title screen threw a pitch nobody could see and G cycled the
difficulty behind a dial that went on showing the old value. The screen in
front owns the keyboard now, which is what being in front means.

⚠️ **AND THE GAME NO LONGER EATS WHAT YOU TYPE.** That same handler
`preventDefault`s every key it knows, which is most of the alphabet — so
typing `{"abbr":"OKC"}` into the league box put `{"":"O"}` in it and squared
the hitter to bunt on the way past. **The import box could only ever be pasted
into**, and paste is exactly why nobody found it. Any text field is now the
field's, not the game's.

The look is a stylesheet and one font, no images. Borders, hard shadows,
scanlines and a blinking cursor do most of it; the type is **Press Start 2P**
(CodeMan38, [SIL Open Font License 1.1](https://openfontlicense.org)), embedded
as base64 rather than linked. That is the rule the screen cannot break —
`npm run export` folds everything into ONE file to be opened off a USB stick,
so a font that has to be fetched is a font that is not there. It costs 19 kB of
a 336 kB export and it is the one 8-bit mark CSS could not fake. It is used for
the FURNITURE only — the marquee, the prompt, the value on a dial, the letters
on a cap — because a club called Los Angeles Aqueducts set in an 8×8 face is
three lines of stairs.

### Franchise

**One year, sixteen games, a champion at the end of it.**

A **fourteen-game regular season** — a double round-robin, so you play each of
the other seven at home and on the road. You play your game; the other three on
the card that day are simulated headlessly while you do, and the standings you
get on the final screen already have everyone else's afternoon in them. The
season saves to `localStorage` after every game and the start screen offers to
continue it.

Home and away are the schedule's call, not yours — on the road you hit first
and there is no last at-bat. The computer's scouting read on you **carries over
between games**, so a pattern you lean on in April is a pattern it has all
season.

**The top four make the bracket.** Single elimination, one game a round, higher
seed hosts: 1v4 and 2v3 in the semifinals, winners in the championship. Miss the
bracket or lose the semifinal and the rest of it plays itself — the button on
the final screen turns into *Watch it out* and takes you to a champion rather
than leaving the year without an ending. Playoff results are kept out of the
W-L on purpose; the bracket is seeded off the regular season and has to stay
that way once it starts.

**The season owns its rosters.** `Season.rosters` is seeded from `LEAGUE` at
kickoff and read through `teamOf()` from then on — nothing in a running season
reads `teams.ts` again. Two consequences: you can re-cast a club mid-season and
the year in progress keeps the nine it started with, and a trade, an injury or
a development curve is now an edit to one entry in that map instead of a
redesign. Costs about 20 kB of JSON in the save.

⚠️ **Still the foundation, not the mode.** No draft, no free agency, no
injuries, no player development, no second year. Trades exist only inside a
franchise moment — there is no trade *screen* and you cannot go looking for a
deal. Year two is an offseason, which is a mode of its own. Rounds are one game
each — the upgrade to a best-of is a `wins` counter on the bracket, noted in
`franchise.ts`.

### The rotation — three starters, three relievers

**Before this, every club started `rotation[0]` in every game it ever played.**
Measured over a fourteen-game franchise: one man started all fourteen, you met
exactly **seven** opposing starters all season (seven opponents, twice each,
the same arm both times) while the computer's book on you carried over all
year, and two-thirds of every staff never threw a pitch.

Every club now carries **three starters and three relievers** — ninety new arms,
with the old third man moving to the pen, which is where twenty-one of the
thirty were already written to be ("The Understudy", "Last Call", "one good
inning in him and nobody knows which one it is").

| | |
|---|---|
| **You pick the starter** | A panel on the pre-game card, with each man's rest and legs. Ignore it and your rotation still turns over properly — the card seeds it from the same call the computer makes. |
| **You pick the reliever** | The pen is a list, not a queue. Click a row, or `,` / `.` to cycle, then `B` twice as before. |
| **The computer picks too** | Its rotation goes in ORDER; its pen sends the best arm late and close, the longest arm otherwise. |
| **Rest is spent as stamina** | A start costs a game and a half. Nothing else in the engine had to change: `stamina` already scales `FRESH_UNTIL`/`GASSED_AT`, and fatigue already takes the plate away through `ZONE_FATIGUE_PENALTY`. |

Measured after: **14 different opposing starters in 14 games**, all three of
your own used, whole pen worked.

⚠️ **A GREEDY "BEST AVAILABLE" MANAGER ONLY EVER NEEDS TWO STARTERS, and a test
caught it.** The first `pickStarter()` scored rest and quality together. Day 0
it takes the ace; day 1 the ace is spent so it takes the second; day 2 the ace
is whole again after 1.5 — so it takes the ace; day 3 the second. **The third
starter never throws a pitch all season.** A recovery of a game and a half means
two arms cover every day of the schedule. The rest rule was right and the greedy
pick was wrong: a rotation is an ORDER, so it is now longest-since-last-start,
ties to the better arm, which cycles 1-2-3 on its own.

⚠️ **REST IS A STOCK, NOT A TIMER, and that is what makes it a constraint.**
Keeping only the day a man last started did not bite — measured over 120
seasons a club could start its ace in all fourteen games and finish *better*
than one that rotated, because one day's rest always returned him to the same
two-thirds however many times you had already done it to him. Each arm now
carries what he has **left**: a start spends a whole unit, each day refills
`1/REST_TO_FULL`. Turn the rotation over and the refill outruns the spend and
everybody is permanently whole; ride one man and he goes 1.00 → 0.67 → 0.33 →
0.00 and stays on the floor. A ridden ace drops from **74 pitches a start to
45**.

⚠️ **THE SECOND STARTER WAS WORTH HALF A RUN A GAME, AND THE CAUSE WAS HIS
ARSENAL.** Promoting the old slot-1 arms to a starting job put league scoring
from 4.43 to 4.98. Isolated, aces allowed 4.27 and second starters **5.13** —
worse than the brand-new third starters at 4.60. They were throwing **39%
fastballs against the ace's 18%**, and `stuffFactor()` exempts the fastball from
`break`, so the slot with the *highest* break rating in the league was getting
the least out of it. They had been written as relievers, and a heater plus one
thing to go with it is the right shape for four batters and the wrong one for
turning a lineup over three times. Capping the fastball at 25% and letting their
breaking stuff carry the mix took them to 4.75 and the league to **4.63**.

⚠️ **THE ROTATION TEST ASSERTS THE STARTER'S OWN WORKLOAD, NOT HIS CLUB'S RUNS
ALLOWED.** A starter yanked in the fourth hands the game to the pen, so what
rest buys or spends is **innings from your starter** — measure that. It was
written when a spent starter's club could give up slightly FEWER runs, because
relievers had no cross-game rest at all. They do now; see below.

### Bring your own league

**The clubs are not fixed.** `CUSTOMIZE` on the title screen — and on the club
picker, where somebody actually decides they want a different club — opens the
editor: names, ratings, identities, **ballparks** and all four roster lists,
club by club. Whatever it saves is what the game plays, and every screen
follows: the pickers, the schedule, the standings, the rank on the pre-game
card. Rename a club, re-rate a shortstop, move a fence, cut the league to six,
write thirty of your own — and **keep as many leagues as you like on the
shelf**.

- **The editor is the way in; the box is transport.** `IMPORT OR EXPORT` behind
  it hands you the league as JSON — ~230 kB over 8,700 lines
  (`node scripts/leaguedoc.ts`) — to keep a league, hand it to somebody, or
  bulk-edit it somewhere with a search function. **You can paste one club on its
  own**, and it goes over the club with the same abbreviation.
- **Both go through the same gate.** The editor serialises what it built and
  hands it to `saveCustomLeague()` exactly like a paste, so a mouse-made club is
  held to the rules a typed one is and there is one storage path.
- **Anything illegal is refused with the club named**, before a byte is stored:
  `LAC rotation 1: puts hitters away with a knuckleball he never throws.` The
  rules are `checkLeague()` in `league.ts`, and **the thirty that ship are
  checked by the same function** — `teams.test.ts` asserts it rather than
  keeping a second opinion about what a legal club is.
- **A rating is refused only when it would break the engine** — not finite, or
  negative. A 9.0-power hitter makes a silly league, which is your business; a
  `NaN` makes every average, rate and probability downstream meaningless.
- **What a league must have, and why:** an even number of clubs, two or more
  (the schedule is a circle-method round robin, and an odd count pairs a club
  with itself); exactly nine hitters (the eight fielding positions and the DH
  are filled from the batting order, so eight men leaves somebody's position
  unmanned); at least one starter and one reliever; an out pitch a man actually
  throws; and unique names — **the stat book and the rest table are keyed by
  name**, so two men called the same thing share one line and one set of legs.
- **Parity still means what it says.** An imported league goes in where
  `teams.ts` goes in, so `temper()` applies your chosen parity to it exactly
  once. BRUTAL is a parity of 1, which is temper() handing back what it was
  given, untouched.
- **A franchise already in progress keeps the clubs it started with.** A season
  owns its rosters, and `loadSeason()` validates a save against those rather
  than against the current league — so importing is something you do between
  franchises without losing the one you are in. The playoff bracket is pinned to
  the league size at kickoff, so a four-club league cannot be asked for an
  eight-club postseason.

### The shelf — leagues you keep, plural

**One storage key meant a custom league could only ever be THE custom league.**
You could not hold a deadball year and a thirty-club fantasy world at the same
time, so nobody ever built the second one. The import box was already transport
for handing a league to somebody else; this is the shelf you put your own on.

`KEEP THIS LEAGUE` on the league screen files the clubs you are playing under a
name, and every kept league gets a `LOAD` and a `DROP` beside it.

- **The active document did not move.** It is still the one key
  `loadCustomLeague()` reads, and named copies live beside it under
  `asb-league:<name>`. There is no migration, no pointer to chase on the boot
  path, and a league imported before the shelf existed is still the active one
  after — the load path cannot tell the feature happened.
- **Loading a slot goes through `saveCustomLeague()` like any other paste**, so
  there is still exactly one gate and one storage path. A slot written by an
  older build, or hand-edited in the browser's own storage inspector, is held to
  the rules a typed document is — and a slot that has gone bad cannot take the
  active league down with it, because nothing is written unless it passes.
- **Filing it validates it too**, and that is not symmetry for its own sake. A
  slot is loaded much later than it is saved — that is what a shelf is for — so
  a document allowed on unvalidated is a mistake that surfaces weeks later on a
  screen that cannot say what was typed.
- ⚠️ **A slot is a copy, and copies cost.** The document is ~230 kB against a
  5 MB `localStorage` budget, so the shelf holds roughly twenty leagues before
  the browser starts refusing writes. The save path reports the refusal by name
  rather than silently losing a league, which is the one thing worse than the
  cap.
- **`length`/`key()` rather than `Object.keys(localStorage)`.** Both work in a
  browser, but only those two are the Storage interface — the index properties
  are a convenience the spec layers on top, and every fake storage anybody
  writes for a test implements the methods and not the proxy.

### Every club plays its own way

**Thirty clubs, eight ways to play a ball game.** `identity.ts` is the Tecmo
Bowl layer: it does not touch a single rating, it changes what the manager
*does* with the ratings the club already has.

| | what you feel across nine innings |
|---|---|
| **HACKERS** | chase your slider off the plate all night, and never walk |
| **GRINDERS** | make you throw it — long counts, and your starter is done by the sixth |
| **TRACK TEAM** | run on everybody; look away and they are standing on second |
| **BIG INNING** | station to station, quiet for six, and then it is 6-0 |
| **SMALL BALL** | bunt it down, move him over, trade you an out for a base |
| **QUICK HOOK** | the starter goes five and you face the whole staff |
| **IRON ARMS** | they ride him — get to him late, nobody is coming to get him |
| **STEADY** | nothing to say about them, which is itself worth knowing |

Four knobs, and **every one of them already had a call site**: `aggression`
multiplies the computer's swing chance in `aiSwing()` — a parameter that had
existed since that function was written and which *nothing had ever passed*;
`running` multiplies `ATTEMPT_RATE`; `hook` scales the starter's leash in
`shouldRelieve()`; `bunt` scales `BUNT_THRESHOLD`.

⚠️ **Identity is not priced into `clubValue()` and must not be.** The rank on
the pre-game card is what a club's *players* are worth; the identity is what
the bench does with them. Folding one into the other would make "STACKED" mean
two different things on the same screen. The tag is read off each club's own
prose in `teams.ts` — Baltimore bunts for a hit, Chicago's south side is named
for the man who comes in to put the rally out — so **a tag that disagrees with
the paragraph above it is the bug.**

Measured over 6,960 games, identity moved pairwise separation — does the better
roster actually finish higher — from **72.4% to 71.9%**, which is inside the
noise. That is the whole target: change how a club plays without changing
whether talent reaches the table. What it *did* widen is the win-rate spread,
39.2 to 41.6 points, by amplifying differences that were already there.

⚠️ **Phoenix is STEADY and it looks like a mistake.** "Two Hundred Innings Bly"
reads as IRON ARMS, and was, for exactly one measurement: it cost them five
points of win rate, because `hook` multiplies `limitOf()`, `limitOf()` already
scales by stamina, and that staff runs 0.84–1.05. Riding a low-stamina arm 28%
past a limit that is already short is not a philosophy, it is abuse. Their real
identity is the one no simulated game can price — see the club's own header.

**The eight are a starting point, not a list you pick from.** A club carries its
identity *inline* — it is not a reference into `IDENTITIES` — so a pasted league
could always carry a ninth archetype nobody wrote. What was missing was a way in
that was not typing four knobs from nothing, so the editor offers all eight as
buttons that **copy** an archetype onto the club and leave every field editable
afterwards. Four knobs with GRINDERS already in them is a form somebody edits;
four empty ones is a form nobody fills in.

⚠️ **`hire` was a real hole, and it was invisible until two thirds of the way
through a franchise.** `moments.ts` prints `identity.hire` as the detail on the
manager moment — the line that makes the screen offer you a first-base coach
rather than a stat block — but it was set only by the `identity()` factory. It
was not in the editor's fields and not checked by `checkIdentity()`, so any
hand-written or editor-made identity put the word **`undefined`** on a decision
screen. It is required now, and the shipped thirty go through the same check.

### Where they play it

**Thirty clubs, thirty ballparks, and a park is a LAYOUT** — a name, three
fences and how much foul ground there is. Everything the engine does with one is
*derived* from those four numbers, so a 310-foot wall and a 0.95 power factor
can never disagree about the same building. Move a fence and the factor follows.

|   | what each number reaches |
|---|---|
| **left / center / right** | `parkPower()`, the multiplier on every hitter in the building — and `wallAt()`, the fence the replay draws and the distance a home run is reported at |
| **foul** | `foulPopAngle()`, how much of the foul population somebody can get under — `caughtFoul()` in `hit.ts` |

The park is read off the club, not chosen to balance anything — the same rule
the identity tags follow. New England is a 310-foot wall in left because that is
what the Minutemen are; Denver is the deepest outfield in the league because the
club is called the **Void** and a fly ball that dies on the track is what a void
does. Detroit has the most power in the league and its second-deepest centre
field, which is the building disagreeing with the roster on purpose.

| park | fences | factor | runs | HR | cheapest HR |
|---|---|---|---|---|---|
| **The Common** (NEM) | 310/390/302 | 1.065 | 5.20 | 2.68 | 366 ft |
| The Yardworks (KCF) | 330/410/330 | 1.000 | 3.96 | 1.95 | 387 ft |
| The Section (OKC) | 345/408/345 | 0.976 | 3.62 | 1.90 | 390 ft |
| **The Void** (DEN) | 352/420/352 | 0.950 | 3.30 | 1.64 | 401 ft |

*Same two clubs, 300 games in each building. `node scripts/parkplay.ts`.*

- **A park is a scoreboard, not an edge.** `atPark()` gives the building to
  **both** lineups and a club plays half its schedule away. What it *does* do is
  reward a roster that fits it, which is why Detroit's power in a 420-foot centre
  field is meant to cost them.
- **It is applied once, inside `newGame()`.** Both the game you play and the
  three simulated behind it every afternoon open through that function, so the
  standings cannot mix two scales — and every one of the thirteen `statsOf()`
  readers downstream followed without being told.
- **It moves the bats, not the arms**, which is `leagueUnder()`'s rule for
  `offence` and is right here for the same reason: weakening a staff to raise
  scoring in a bandbox would make every ERA in the record book a lie about the
  pitchers.
- **The thirty average to neutral.** `NEUTRAL_SIZE` is set where the league's
  *runs* come out level, so switching parks on redistributes offence without
  moving the run environment the whole engine was tuned around. Measured over
  2,400 games each way, parks on and stripped: runs per club **4.391 → 4.378**
  (−0.30%), strikeout rate 22.41 → 22.45%, foul-outs 1.74 → 1.76% of plate
  appearances, and the roster-value/win-rate correlation **0.533 → 0.536**.
  Run `node scripts/parks.ts` after touching any fence.
- **Across the thirty**, ranked against the layout: size against runs **−0.971**,
  size against home runs **−0.967**, fence depth against the cheapest home run
  **+0.912**, foul acreage against the foul-out rate **+0.953**. Four mechanisms,
  four confirmations that each one actually reaches the field — which is the
  check that would have caught `parkFoulAngle()` in its first hour, when it
  derived a number and nothing threaded it into the swing.

⚠️ **`WALL_FT` IS THE TRAP.** `WALL_FT = 400` in `plot.ts` looks like where a
park belongs and is exactly the wrong place. `plotBatted()` is a *picture
reconciled to a verdict already in the book* — the outcome table calls
`home_run` first and `justOut()` shoves the flight over whatever fence is there
— so a per-park wall alone would change the replay and not one result.

⚠️ **AND GEOMETRY CANNOT DECIDE A HOME RUN, WHICH WAS MEASURED RATHER THAN
ASSUMED.** The obvious next step is to let the fence vote the way `contest()`
votes on hit-or-out: demote a table-homer whose flight never reached the wall,
promote a double that cleared it, matched so the rate holds. Counted over 52,417
balls in play against the neutral 400-foot bowl:

```
table home runs                       11,316
...whose flight never reached 400ft    6,683   (59% of them)
doubles that would have cleared it        154
```

The flight model and the outcome table are not on the same scale for home runs
and never were — `plot.ts`'s own note on `justOut()` says so, and **59%** is what
its "sometimes" turns out to mean. A matched swap would delete three fifths of
the home runs in the game and hand back two hundred. So **the fence decides where
a home run is drawn and the park decides how often one is hit**, two mechanisms
on purpose. `scripts/hrswap.ts` is the probe; re-run it before anybody tries this
again.

**You can see it.** The pre-game card carries the building across the top, above
both clubs — *"The Pound · 350 / 415 / 338 ft · plays big — fly balls go to die ·
acres of foul ground"* — the club picker shows every park's name and fences, and
the overhead replay draws the real outline: the fence is **sampled** every two
degrees rather than struck as an arc, so a short porch in right and a 420-foot
notch in centre are on the screen. The camera is fixed at one scale for every
building, which is the point — rescaling per park so each one filled the canvas
would draw them all the same size and the layout would be invisible.

### The pen gets tired too

The rotation work left one gap open and said so: **a reliever was always fresh.**
Three whole arms in every game of the season however hard they had been worked
the night before, which made *get to the pen early* close to free and left
starter stamina — and therefore the whole rotation rule — half decorative.

Now the ledger covers the whole staff. `StartLog` became `RestLog`, and
`Season.rest` holds all six arms.

**A relief outing costs the appearance plus the work.** `APPEARANCE_COST` is
0.25 of a unit before he has thrown a pitch that counts — he got loose, he came
in — and the rest is `pitches / his own limit`, so a closer built for twenty
pitches pays a full tank for twenty and a long man pays the same for forty.

| use | what happens |
|---|---|
| every other night | **100% for ever.** The refill outruns the spend. |
| four nights running | 100 → 88 → 77 → 65 → 53 → 42 |
| one night off after a normal outing | about 85% back, not whole |

⚠️ **WITHOUT `APPEARANCE_COST` PEN REST DOES NOTHING, and the first cut proved
it.** Cost measured purely as `pitches / limit` makes an ordinary outing worth
about a third of a unit against a refill of 0.4 a day — so a reliever used
*every single day* still gained ground, and the ledger existed without ever
constraining anybody.

⚠️ **THE CONSTANTS WERE MEASURED, NOT CHOSEN, AND THE FIRST GUESS MADE THE GAME
UNPLAYABLE.** At `APPEARANCE_COST` 0.35 and a 2.5-game refill the league ground
itself into the floor: **52.8% of all reliever-days GASSED**, all three arms
gassed on **37% of club-days**, and mean pen freshness decaying monotonically
from 100% on opening day to **21% by day 13**. It never recovered, because a
tired pen gives up more runs, which means more relief appearances, which is a
spiral.

The fix was to measure the workload instead of guessing at it. A three-man pen
carries about **2.0 outings a club-game at 32 pitches each**, so one arm works
roughly **56%** of his club's games. That gives a window with two hard edges:

```
refill must be ABOVE  0.381/day   or normal use decays the pen all season
refill must be BELOW  0.683/day   or a night off fully restores him and
                                   nothing ever costs anything
=> RELIEF_REST_TO_FULL between 1.46 and 2.62
```

At **1.9**, in the middle: pen freshness plateaus at **82%** from day four
onward, gassed arms fall to **6.6%**, and a club with all three arms gone is
down to **1.5% of club-days** — rare enough to be a night you remember rather
than the permanent state of the league.

⚠️ **AND IT IS WHAT MAKES THE ROTATION RULE BITE.** Measured across all thirty
clubs, 25 seasons each, rotating your three starters against riding the ace
every game:

| | rotating better | league mean wins |
|---|---|---|
| before pen rest | **1 of 3** clubs tested | ride ace ahead |
| after pen rest | **24 of 30** clubs | rotate 7.06, ride 6.62 |

Riding the ace means going to the pen early every night, and the pen is now
something you can run out of. The six clubs where bullpenning still wins are
led by the Chicago Firemen, who are written as the deepest pen in the league —
which is the answer you want that club to have.

⚠️ **`penLegs` TRAVELS WITH THE STARTER PICK, and forgetting it is invisible.**
The pre-game card reads the season and the in-game pen panel reads the Staff.
When `go()` built the picks without it, the card showed two gassed relievers,
the panel showed them at their card rating, and the arm that came in was whole.
Both screens have to be looking at the same ledger.

### Franchise moments

**Twice a year the season stops and asks you something.** Fixed days, random
contents, and `Season.rosters` is the seam both of them write through — which
is what that field was put there for.

- **THE DEADLINE**, a third of the way in. A club is on the phone with two
  offers pointing in opposite directions: pay with the middle of your order to
  fix the rotation, or give up an arm to get the bat back. Plus stand pat.
- **THE BENCH**, two thirds in. Your manager is gone and there are two names on
  the list. **Not one rating moves** — your nine are the same nine, and the
  club plays a completely different game.

⚠️ **Trade-offs only — every option is a sideways move.** The trades are
matched so your roster value shifts by less than `FAIR` (0.04, under 4% of the
whole league ladder). There is deliberately no "good option", because a screen
where one choice is better is a screen with one choice on it.

⚠️ **Every trade is two-for-two, and that is what makes it self-balancing.** A
bat and an arm each way, so both clubs keep nine hitters and three arms and no
roster can ever go illegal. And because `clubValue()` is `mean(lineup) +
mean(rotation)` with the same 9 and 3 on both sides, your delta and theirs are
**exact mirrors** — a trade matched flat for you is flat for them too, and
there is no second balancing pass to write.

⚠️ **THE BENCH IS A LOW-STAKES CHOICE, AND THE FIRST VERSION OF THIS PARAGRAPH
CLAIMED THE OPPOSITE.** It said hiring the running-game man was "terrific with
legs on the roster and a disaster in Detroit". Measured — one roster, eight
benches, same seeds, 300 games each — that is false. On Detroit, the slowest
club in the league, TRACK TEAM is the *best* of the eight at 46.7% against
STEADY's 44.7%.

The reason is a rule working exactly as designed: `running` scales how often
the manager ASKS, and never the odds bar he answers against (see
`running.ts`). So Detroit asks more often, gets refused nearly every time —
0.35 steal attempts a game against Baltimore's 2.36 with the same tag — and
the few it green-lights were good gambles anyway. **A personality tag cannot
run a slow club into outs, which means it cannot be a trap either.**

Across both clubs the whole eight-bench spread is about five or six points of
win rate, which at N=300 is under two standard errors. Treat the bench as
flavour with a mild tilt, not as a decision that makes or breaks a season. If
it should have real teeth, the lever is the odds bar, and turning it is a
deliberate design change rather than a tuning one — an aggressive first-base
coach who sends men who should not go is real baseball, and it is honest as
long as the runner is visibly thrown out.

⚠️ **The moment comes BEFORE the card.** A trade made at the deadline has to be
in the lineup you are about to send out; asking afterwards would put the
decision behind the game it was supposed to change.

⚠️ **`Season.decided` is the gate, not the news feed.** It would have been one
fewer field to ask whether a roster headline had already fired that day — the
wire is saved and it would have worked. But `franchise.ts` is explicit that the
wire is display text that "cannot reach the engine" and is deliberately not
validated line by line, and gating a roster mutation on it would let a
hand-edited save collect a second free trade.

### Home field finally means something

Measured before this: home clubs won **49.7%** against a real ~54%. The engine
had no home-field effect of any kind — batting last is the only thing the home
team got, and batting last is worth nothing on average, because the ninth is
only played when it matters.

That is a bug in **franchise** specifically, not a realism quibble. The bracket
hands the higher seed home field in both rounds and calls it the reward for
fourteen games of standings, and it was paying out zero. Winning the one-seed
bought a nicer line on a screen.

`HOME_EDGE` in `tuning.ts` is one multiplier on the home side's two good timing
bands. ⚠️ **It is a barrel multiplier, not a swing-rate one, and the first
version got that wrong** — turning the home side's `aggression` up 5% moved
home wins from 49.7% to only 50.4%, because swing rate trades walks for balls
in play and nets out near nothing. The band weights are where run scoring
lives, which is exactly why fatigue turns those and not the swing rate. Home
clubs now win **53.9%**.

⚠️ **It applies to the computer only.** You are the one swinging the bat, and a
hidden multiplier on a human's timing is not a home-field advantage, it is the
game lying about what your swing did. Your half of it is the schedule: at home
you bat last.

The eight are real rosters, not skins — seventy-two hitters and twenty-four
arms, every club with its own shape. Maine is contact and legs, Texas is
nothing but power, Albany has no power anywhere and the best late innings in
the league. They are matched on RECORD, not on a stat line: see `teams.ts` and
`node scripts/league.ts`.

| Half | You | Controls |
|---|---|---|
| Top | **Pitch.** Pick the pitch and the spot, then *throw* it. Manage the pen. | `1`–`5` pitch, `W/A/S/D/X` spot, `SPACE` starts the arm, `SPACE` **again** to let go, `B` bullpen |
| Bottom | **Hit,** and send runners. | `SPACE` (or click) to start the pitch, `SPACE` to swing, `SPACE` **again** to check it, `S` to steal |

**Both halves are timed now.** The mound used to be a menu — pick, press,
watch the dice. The second press is the release: a marker sweeps the bar under
the plate and where you let go of it is your COMMAND on that pitch, feeding
`pitchToSpot()`'s `control` exactly the way fatigue already did. Painting one
buys 15% on hitting your spot, a rushed or dragged release costs 18%, and
letting the arm empty on its own costs 45% — but **a competent release is worth
exactly 1.0**, which is what every arm in the headless sim throws at, so the
league you are measured against did not move. The window scales with the arm's
signature (a painter's is wider, a knuckleballer's narrower) and with the
difficulty level, same as the swing's. See `core/delivery.ts`.

Under the throw button, **the pitch chart**: what you have thrown this hitter,
where you called it, where it actually crossed, how it left your hand and what
it came to. `low away → middle` is the mistake pitch, written down.

```
src/game/
  teams.ts   the thirty clubs, their nines and their staffs — EDIT HERE FIRST
  league.ts  ...or bring your own: export the clubs, edit them, paste them back
  identity.ts how a club PLAYS — eight archetypes, four knobs, no ratings
  rotation.ts who starts, who relieves, and what last night cost each of them
  franchise.ts the season: schedule, standings, the bracket, rosters, save
  moments.ts the two decisions a season asks you — the deadline, the bench
  game.ts    the two-sided game: halves, the order, walk-offs, extras
  ai.ts      the computer manager — what it learns and what it does about it
  bullpen.ts fatigue, the pen, and when a manager goes and gets him
  defense.ts who is standing where, and whether he makes the play
  running.ts the steal — who can go, and whether the manager sends him
  placement.ts where the ball landed, and what that is worth
  tuning.ts  the few numbers both halves must agree on
  sim.ts     at-bats with nobody watching; the headless whole-game sim
  main.ts    the screen — the at-bat, and the overhead replay of the play
```

Put a ball in play here and the camera cuts to the field: the nine break on it,
the covers run to their bags, the throw races the batter down the line and an
umpire calls it. That is `src/web/overhead.ts`, the same module the roguelike
screen uses — it moved out of that screen the day this one wanted it. Both pass
their own canvas, camera and field colours; neither owns it.

### The check swing, and the swing that takes time to get there

Taken from R.B.I., which let you stop the bat dead wherever it was on the
swing path. **The press starts the bat; the barrel arrives `travelMs()` later,
and THAT is the moment graded.** Press `SPACE` again in the first 60% of that
travel and the bat comes back — the pitch becomes a take, ball or called
strike by `inZone` exactly like any other take. Press it too late and the
swing stands.

It needed no new rule and no new key. The consequence was already in `atBat.ts`
and the second press is the same button, which is the R.B.I. discipline: it ran
the whole sport on two.

**A heavy bat is now good at something.** Bat speed comes off power, so a 1.7
hitter’s barrel takes ~149ms against a quick bat’s ~105ms. Slow used to be pure
cost. It now buys ~89ms of second thoughts against ~63ms — the first thing that
has ever been *good* about being slow to get around. The batter line names it
(`quick bat` / `average bat` / `heavy bat`) because a trade you cannot see is
not a trade.

⚠️ **This is a real difficulty change, not a tuning one.** The timing windows
did not move — still ±12/±35/±80 — they apply at CONTACT instead of at the
press, so every press moves a bat’s length earlier. Waiting until the ball is
at the plate and then reacting is no longer a swing; it is a late one.

### What the computer does

It keeps one book on you and uses it in both directions.

**When it pitches:** it runs the pitcher's own plan from `core/pitcher.ts`
first, then bends it — gets a free swinger to chase with two strikes,
challenges a hitter who will not swing, takes the fastball away from a man who
is out in front, and goes to the pitch you keep missing. Every rule is gated on
a sample size, because adapting off two pitches is reacting to noise and reads
as cheating.

**When it hits:** it guesses what you are about to throw. Call the same pitch
often enough and it starts sitting on it, and a hitter sitting on a pitch is a
much better hitter. Mix them and the guess goes away.

**The book is shown to you on screen, on purpose.** A hidden system that makes
the game harder is indistinguishable from the game cheating. A visible one is
something you can play against.

### Fatigue and the bullpen

One arm no longer throws all nine. Each club carries a **starter and two out of
the pen** (`teams.ts`), and fatigue is one number doing two things:

- **He loses the plate.** `zoneRate` falls, so he walks people. Visible without
  any UI telling you — the counts just start running deep.
- **He loses his stuff.** Hitters square him up more often, applied as a shift
  in the same timing bands the whole hitting model already uses.

Fresh through **70** pitches, finished at **110**, linear between.

**You manage your own pen** — `B` or the button, between batters only. The
computer manages its own on the same schedule and announces it in the log, so a
pitching change never happens silently. Relievers are *better arms than the
starters*, which is backwards from how the nine were originally graded and
correct for baseball: a man throwing one inning can be nastier than one pacing
himself for six. Without that, going to the pen would be pure downside.

Measured over 500 games: **2.83 relief appearances per game** against a real
~3.0, and no arm past ~119 pitches.

⚠️ **Matching the staffs matters as much as matching the lineups.** When relief
was first added, both pens were assigned by eye and the win split went to 45%
home — the visiting pen was simply better. The current six came out of
`scripts/findpens.ts`. Old Man Prewitt (knuckleballer) is deliberately on
neither staff: as a starter he cut opposing scoring from 4.8 to 2.7 on his own,
because the knuckleball penalty in `ai.ts` hits every AI hitter at once.


### Defence and the running game

**Positional defence.** Before this, `core/fielding.ts` rolled a flat 5% error
on every bootable ball, whoever hit it and wherever it went — a scorcher to a
slow first baseman and a routine grounder to a gold-glove shortstop were
literally the same event, and nine players' worth of `speed` did nothing on
defence.

Now the ball is plotted, the nearest fielder takes it, and **his glove and his
position decide whether the play gets made**. Almost none of that geometry is
new: `plotBatted()` and `nearestFielder()` were already written and tested for
the roguelike's overhead replay. This assigns real players to the nine slots.

A nine-man lineup covers eight positions plus a DH — the pitcher comes off the
staff, not the batting order, which makes this a designated-hitter league by
construction. Gloves are ranked hardest position first: SS, CF, 2B, 3B, C, RF,
LF, 1B, DH. The bottom-right panel shows who is where.

**The running game.** `core/baserunning.ts` had existed since the first build
and **nothing had ever called it** — `attemptSteal()` was written, tested, and
wired to nothing. Press `S` while batting to send the lead runner; the button
carries the live odds, because a gamble whose price you cannot see is a coin
flip with extra steps. The catcher's arm is now part of that number, which is
what makes hiding a bad glove behind the plate cost you something.

⚠️ **Odds alone are not a decision.** Gating steals purely on the odds produced
**9.2 attempts a game** against a real ~1.8 — a chance to steal exists on most
plate appearances and gets checked every time, so a pure odds test fires on
every opportunity a fast runner ever gets. `ATTEMPT_RATE` is the manager
deciding not to. Now 1.58 attempts a game at 82% success (real ~75%).

### Ball placement, fouls, and which way you pull it

**Placement now decides what a hit is worth.** Before this, `plotBatted()` ran
only so the overhead replay had something to draw — `web/plot.ts` says so out
loud, calling `chaseReach()` "the one place the replay is rigged". A single was
a single whether it was a seeing-eye grounder or a rocket into the gap, and the
player never learned that hitting it *where they aren't* is the actual skill.

Now the ball is plotted, its distance to the nearest fielder is measured, and
that decides the extra base. The play-by-play tells you where it went —
"double into the left-center gap", "grounded out to short" — which is the
information you need in order to learn to aim.

Placement **only moves a hit between kinds of hit**. It never turns an out into
a hit or the reverse, so the run environment that took several rounds to tune
is untouched by construction.

⚠️ **Measure the distribution before picking a threshold.** `GAP_FT` was first
guessed at 52ft, which "looked right" for nine men spread over an outfield. It
caught **72% of every ball in play**, upgraded half of all hits, and turned
triples into a quarter of the hit column. The real distribution of gap distance
on a hit is p25 49ft, p50 74ft, p75 125ft — nine fielders cover a lot of
ground, so the bar for "in space" belongs at the top of that range. It is 128ft.

⚠️ **Geometry does not award triples, and that rule was reached by failing.**
Gap distance clumps hard at the top (p90 145ft, p97 149ft), so any threshold
high enough to read as "exceptional" still catches a big slice of doubles — a
population far more numerous than triples. With a double→triple upgrade in,
three-baggers went *up* to 6.6% against a real 2%. The upgrade was removed
rather than tuned. Placement holds runners to fewer bases; it does not grant
more. Triples are a fact about legs, and speed already earns the extra base in
`inning.ts`.

**More foul balls.** The ported tables foul off a well-timed fastball 5% of the
time; real baseball fouls off roughly a **third of all swings**. `FOUL_BOOST`
in `tuning.ts` scales the foul share and renormalises, so the relative mix of
every other outcome is untouched — the alternative was hand-editing forty-five
table entries and changing the hit engine's balance as a side effect. At 2.3 the
foul rate is 34% and the pitch count went from 244 to **293** against a real
~290. Longer at-bats also mean the two-strike foul finally matters.

The roguelike passes no `foulBoost` and is unaffected.

⚠️ **A left-hander who pulled the ball was hitting it to the opposite field.**
`direction` was `offsetMs * DIRECTION_DEG_PER_MS` with no reference to the
batter, and negative degrees is left field — right for a right-handed hitter,
exactly backwards for a lefty, who pulls to *right*. Six of the fifteen in
`POOL` bat left. It went unnoticed for the whole project because nothing read
`direction` for **results** until `defense.ts` started using it to decide who
fields the ball. Fixed in `directionFor()`.

### ⚠️ The third trap: a search that overfits

The two lineups were picked by a random partition search scored on a small
sample. It **overfits** — it picks the extreme of the noise, and the win rate
regresses the moment you confirm on a bigger sample. Widening the inner sample
made it *worse*: one run reported 58% home, the next 66%. That is winner's
curse, and more trials cannot fix it.

`scripts/splitteams.ts` replaces it with a **snake draft**: rank all eighteen
by one value number and deal them A-B-B-A. It cannot overfit, because it is
deterministic and it equalises by construction. Result: **49% home, 4.68 runs
per team**, with team value matched at 4.55 against 4.60 and average glove
identical at 1.01.

A number that comes from a rule you can read beats a number that came from a
fit you cannot reproduce.


### ⚠️ The fourth trap: a stat line that scores equal does not play equal

The league went from two clubs to eight, and the obvious way to balance eight
is the rule that balanced two — score every player with `value()` (contact,
power, speed, clutch, glove, one number) and give every club the same total.

Done. All eight matched inside 1% of roster value. Over **2,240 games the
spread was forty points of win rate**, 26% to 70%.

The score was not wrong about players, it was wrong about *weights*. What the
record actually tracked was **average power**, at roughly 8 points of win rate
per 0.1, with clutch worth about 3 and contact and speed nearly free. So the
clubs are matched on the only thing that cannot lie — **their record** — and
`node scripts/league.ts` plays all twenty-eight matchups and prints it:

```
club                     win%   runs/g  allowed
FLA  Florida Stingrays      52.8%   4.83     4.63
MNE  Maine Lobsters         51.8%   4.94     4.75
...
NYE  New York Empire        46.3%   4.38     4.75

spread          6.4 points of win%
```

Then the staffs got the same treatment, and taught the same lesson twice more:

- **Arsenal beats velocity.** Detroit and Texas threw the hardest in the league
  and were the two worst clubs in it (44%, 42%). Making the same arms
  sinker- and slider-first — one line each, not one mph — moved them to 48%
  and 51%.
- **`junk` is the strongest signature**, because turning every fastball into a
  breaking ball is that same trick by another route. Albany ran two junk arms
  and allowed 3.6 runs a game in a 4.6-run league.
- **A high zone rate is good**, which is backwards from what the two-club file
  assumed. Walks cost more than the extra contact does.

None of the three was predictable from reading the engine. All three took one
sim run each to find. **Measure the thing you are balancing; do not score it.**


### ⚠️ The balance trap, recorded so nobody re-learns it

The AI's swing timing is drawn from **weighted bands**, not a bell curve
(`AI_TIMING_BANDS` in `ai.ts`). The first version used a normal distribution
with a 26ms standard deviation and produced **25.6 runs per team per game**.

The cause is in `core/hitTables.ts`: a `perfect` swing is a hit **75%** of the
time. Those tables are a *reward curve for a human hitter*, not a batting
average model. Any distribution landing on `perfect` a third of the time turns
them into softball — and the 12/35/80ms windows make it impossible to tune a
bell curve out, because squeezing `perfect` down pushes more than half the
swings past 80ms into whiffs.

Current numbers, from `npm run sim` over 500 games — and that script **rotates
through every pairing**, and turns both rotations over, so these are league
numbers rather than one matchup's:

```
games            500 (0 unfinished)
home / away wins 267 / 233
runs per team    4.63   (MLB ~4.4)
pitches per game 277   (MLB ~290)
extra innings    10.4%  (MLB ~9%)
walk-offs        13.0%
hits per team    9.08   (MLB ~8.5)
walks per team   3.52   (MLB ~3.3)
K per team       7.21   (MLB ~8.6)
K rate           18.7%  (MLB ~22%)
errors per team  0.82   (MLB ~0.55)
wild pitches     0.45   (MLB ~0.46)
bunts per team   0.30   (MLB ~0.25)
shutouts         6.6%
home runs         19%   on a perfect swing at power 1.0 (GDD 15-20%)
```

⚠️ **`scripts/field.ts` DOES hand-roll the loop, and it drifted.** It copies
sim.ts's game loop so it can watch the steal decision from outside, and it was
still calling `aiShouldSend()` without the club's `running` knob — reporting
the baseline attempt rate for a league that no longer plays at the baseline.
Fixed 2026-08-26. It also defaults to the `HOME`/`AWAY` pair, which is Albany
(GRINDERS) against Detroit (BIG INNING) — two of the *least* aggressive
baserunning clubs in the league — so read its steal rate as that pairing's, not
as the league's. `balance.ts` above has no such problem.

### What is deliberately not in it yet

**Pinch hitting, the box score, the productive ground out and the shift were
all on this list and none of them are any more** — the ground out landed 2026-08-25
(`groundOut()` in `inning.ts`: forced men always go, everyone else rolls the
two send rates), the bench is real (`pinchHit()` in `game.ts`, `manageBench()`
in `sim.ts`, and the computer goes to its bench between hitters the same way it
goes to its pen), and the final screen reads a full box score straight off the
`GameState`.

### The list a playthrough produced — 2026-09-09

Half of a 162-game franchise played by hand, both halves, then a 14-game year
start to finish: rules, club pick, card, moments, the deadline, the calendar,
missing the bracket, a champion, the record book. **Everything below is a thing
that was reached for and was not there.** In rough order of what the next
session is worth spending on.

**1. Sound.** `web/juice.ts` is a whole audio layer and `src/game/` does not
import a line of it — grep says so. Nine innings happen in total silence. The
crack of the bat, the glove pop, a crowd that comes up under BIG SPOT: this is
the widest gap between what the screen already does and what it feels like, and
the code to do it is written and in the repo.

**2. A second year.** Still the honest headline. No draft, no ageing, no
development, no free agency, and because men are re-rolled the record book can
only ever hold single-season marks — a career total is not a missing screen,
it is a missing model.

**3. Injuries.** Fatigue is arms only. Nobody is ever hurt, which is why the
fourth bench man and most of the 26 never have to matter. It is also the
cheapest way to make the depth `depth.ts` already builds mean something.

**4. THE DEADLINE trades blind.** The screen offers two players by name and
prose and shows no numbers at either end of the deal. Put POW/CON/VIS/SPD on
both sides — `card()` in `main.ts` already draws exactly that block.

**5. More moments.** Five scenarios exist (`deadline`, `bench`, `slump`,
`rotation`, `skid`) and two of them are the scheduled floor. A fourteen-game
year sees three. A 162-game year would be silent for weeks at a stretch.

**6. The box score is missing columns.** No R for batters, no SB/CS, no LOB, no
pitch counts, and no saves anywhere — not in the box, not in LEAGUE LEADERS.
The night's counting stats and the season's rate stats also share a row with
nothing saying which is which.

**7. The standings are one flat table of thirty.** No divisions, no
conferences, no L10, no streak, and a four-way tie at the seed-4 line is
printed without a word about what broke it.

**8. The editor hands you raw engine floats.** `break 1.178`, `clutch 0.921` in
bare text boxes with no range, no slider, no hint and no preview of the rating
the card will show. Cap colours are drawn on the club-select screen and are not
editable anywhere.

**9. The game screen does not fit a laptop.** At 1212x702 the plate is below the
fold — you cannot see the HUD and the strike zone at once — and clicking scrolls
you back to the top. At 1568 wide the field panel spends about 40% of its box on
empty grass. *(2026-09-12: the half that mattered is fixed — the situation strip
is sticky, so the count follows you down the page. The empty grass is still
there.)*

**10. Nothing goes slower than 1x.** `F` is 1/2/4/8 and all of it is faster.
There is no practice mode to learn the six deliveries against, which is the one
thing a batting game with a 120ms bat ought to have. *(2026-09-12: done. `P`
cycles FULL / EASED / SLOW / CAGE — see below.)*

Also noticed and deliberately left alone: several clubs carry surnames one
letter apart on purpose — Minneapolis is Scandinavian (Lindqvist / Lindquist /
Lindgren), Maine is Québécois (Ouellet / Ouellette), Memphis is Delacroix /
Delahunt / Delahoussaye. Those read fine because the nicknames differ. The
three that did NOT are fixed, and `depth.test.ts` now forbids them; see the
note there.

### The hitter gets an instrument — 2026-09-12

**The finding: the game measured every swing in milliseconds, and told the
opposing manager.** `resolvePitch()` has always computed a signed offset, graded
it, and then thrown the number away behind one adjective. That same number goes
to `ai.ts`, gets averaged over the at-bats, and reappears at the very bottom of
the page in the scouting panel as `timing BEHIND IT (+42ms)` — a read on how the
HITTER is timing this arm, handed to the man on the mound. The hitter, trying to
learn a ±35ms window, had the word LATE.

Same species as the 09-03 finding one layer down: **a fact the engine knows and
a fact the player can see are independent.** Three straight 0-2 fouls read `last
swing: LATE` three times over a count that never moved and a play log that never
got a line. From the batter's box that is a frozen game.

- **`bandsFor()` in core/timing.ts.** `grade()` now reads its own boundaries from
  it, and so does anything that draws them — so a meter cannot disagree with the
  verdict beside it. Same rule `releaseWindow()` states for the mound's bar. The
  test feeds every edge it reports straight back into `grade()`.
- **The swing bar**, in the mound bar's own rectangle, since the two halves of
  this game are one press timed against one window and are never on screen
  together. Bands, a marker, and the signed number.
- **`last pitch` and `last swing` are two lines now.** One line fed by every
  pitch wrote BALL into a field labelled "swing".
- **Fouls reach the play log**, on both halves. A foul is the one pitch that
  changes nothing a reader can see, which is exactly when somebody asks what
  just happened.
- **`P` cycles the pitch speed** — FULL / EASED / SLOW / CAGE. It stretches the
  FLIGHT and not the bat, and not one timing window: you get longer to read it,
  not more room to be wrong. `readScale()` returns 1 on every path but your own
  at-bat, so watch mode is untouched by construction.
- **The calibration can be held.** It never stopped learning, so a shift settled
  at +79ms read +78 then +75 over three more swings — a window walking away from
  a player trying to learn it. Click the read-out.
- **`V` was a dead key.** The panel has been drawing `DEFENCE <kbd>V</kbd>` and
  `press()` has handled it since the shift shipped; the keydown gate never
  forwarded it. Exactly the failure the note above that list warns about, found
  the only way it ever is — by pressing it.

⚠️ **And the read-out immediately caught the thing it was built to expose.** The
first swing it ever drew reported **+10732ms**. A background tab stops getting
animation frames, arrival goes by while the loop is asleep, and the press that
wakes it is stamped ten seconds late — the case `SANE_SAMPLE_MS` has kept out of
the *calibration* since it was written. Putting the number on screen handed the
player the exact garbage the engine had been carefully discarding. The clock is
now held to the same bar; the grade and the outcome still show, since those are
true on that pitch. Only the clock is withheld.

**Measured, playing it:** a swing read +132ms, correcting by 132ms produced
−8ms — PERFECT, single to shallow outfield. That is the whole feature: the
number is accurate enough to act on.

### A shift on the mound, and eight things it found — 2026-09-12

`Work Playtest Notes 9/12` at the repo root is Zane's own file, written while
playing, and the headline in it is not a bug report:

> *"The plays need to feel more fluid. Not scripted. And the problem is I dont
> know how to convey that to the bot."*

He conveyed it. Every line under it turns out to name the same defect from a
different angle, and the defect has a one-sentence statement:

> **THINGS WERE HAPPENING WITH NO VISIBLE CAUSE, AND THE PICTURE DID NOT ALWAYS
> AGREE WITH THE BOOK.**

That is what "scripted" means in a game with no script in it. Below is each
note, what it actually was, and what it is now.

**1. Runners moved between plate appearances, with no ball anywhere.** The two
loudest notes — *"Pop up first base foul line and runner from second advanced to
third. THIS DOES NOT PLAY LIKE BASEBALL"* and *"SOMEONE FROM SECOND JUST SCORED
ON A GROUNDOUT"* — were both this, and neither was a baserunning bug.
`core/inning.ts` never moves a man further than the play is worth and was right
in both cases. `finishAtBat()` called `rollLoose()` and `runTheBases()` **after
the at-bat**, between hitters: a wild pitch and a steal resolving with the
screen showing nothing at all. The runner appeared one bag along and the
play-by-play explained it afterwards in text, which is not the same as watching
it happen.

Both now run from `runnersGoOnThePitch()`, on the first pitch of the at-bat that
the batter does not put in play. Same odds, same once per plate appearance — the
rates in `running.ts` are per-at-bat numbers and the run environment was
measured against them — but there is a ball in the air when the runner goes, and
the flash over that pitch says BALL GETS AWAY. The headless sim keeps its own
call sites untouched, which is why `scripts/balance.ts` cannot have moved.

**2. A strikeout said nothing.** *"NO STRIKEOUT PROMPT ON SCREEN. PROMPTS ARE
TOO FAST."* `sceneFor()` is written from a batted ball and `main.ts` only ever
called it on in-play results, passing null for everything else — so the
strikeout, the walk and the hit batsman, **about a third of every plate
appearance in the game**, had no caption at all. `sceneForTake()` is the other
half. It has no replay under it, so it runs on its own clock (`TAKE_SCENE_MS`,
1600ms against the replay caption's 900) and comes up immediately rather than
anchored to the end of a flight that does not exist. It still does not block:
the next pitch is yours to throw straight through it.

It also tells **going down swinging from going down looking**, which are two
different things to watch and were one word before.

**3. A foul pop announced itself as IN PLAY.** Your half worked the word out
inline; the computer's half said IN PLAY for anything that was not a whiff. So a
ball that ENDS the at-bat in the seats behind first — on a replay that barely
moves, which is the *"no ball movement on the screen"* half of the note — came
up as a ball in play. One `swingWord()` now, called by both halves.

**4. The throw always went to the wrong bag.** *"grounder to second baseman and
doesn't turn double play"*, then *"Throw-outs are not shown"*. Those are one
note. Every ground ball retired the **batter at first** and handed the man on
first second base for nothing — one out either way, so no run total in three
rounds of tuning ever noticed, and it is the commonest play in baseball rendered
backwards. There was never a runner at the far end of a throw to be thrown out,
because the game had no force play in it.

`FORCE_AT_SECOND` (0.6) and `fieldersChoice()` add it: the lead man is out at
the bag, the batter reaches, and everyone else runs the ground ball exactly as
before. The replay draws the one throw ending at second with an OUT call on it,
the scorer writes 6-4, and the sentence says *reached on a fielder's choice*. It
costs the offence a base, which is what a force play is.

**And the double play now knows where the ball went.** `DP_BY_POSITION` — one
flat 35% coin used to cover both a two-hopper at the second baseman and a
swinging bunt the pitcher fell off the mound for. The middle infield is at 1.3,
the corners below 1, the outfield at zero.

**5. A triple was drawn as a bloop.** *"Triple when the scene looks like a
single."* Measured over 120,000 swings: a triple's median plotted distance was
**262 feet against a double's 321**, and 41% of them landed inside the median
single. The table calls triples on 8–17° liners and the range formula does not
carry those. `TRIPLE_MIN_SHARE` in `plot.ts` is the same reconciliation
`justOut()` already does for the home run — a floor, velocity-scaled so it
spreads instead of piling. (The flat first cut put p5 through p75 on exactly 320
feet, which is the 460-foot ceiling mistake for the third time in this file.)
Now p5 302, p50 353, p95 385, and 2.1% of hits against a real 2.0%.

**6. Six pitches, one motion.** *"Pitches during pitching need to be more
unique. Sliders and changeups are the same."* He is right, and the standing note
in `delivery.ts` says why without noticing: there were two cues, and the second
one — marker SPEED — was constant *within* a pitch, so all it ever did was make
one line arrive slightly sooner than another. The release lines for the slider
and the changeup sat 27 pixels apart and the two presses were identical to
perform.

`Delivery.ease` is a third cue and the only one that is a **motion**. Above 1
the marker crawls out of the hand and whips through the release — the slider's
wrist snap at 1.55, the sharpest in the game. Below 1 it leaps out with the arm
and dies into the release — the changeup you have to hold, at 0.65. Opposite
motions, not the same motion 27 pixels apart. `releaseAtMs` is compensated so
every line still lands where the design put it; `releaseMark()` is the one
answer to where that is, and the spread tests assert against it now.

A second axis of difficulty falls out of it for free and is deliberately **not**
aligned with `scale`: a whipping marker draws a narrow band and a dying one
draws a wide one, so the curveball — which is hard because you have to wait it
out, not because it is hard to see — has the most legible band on the bar.

**8. Two more the screen itself caught, after all of the above was
written.** Driving the new force play in the browser rather than trusting the
tests: the throw flew to second, the runner stopped dead on the bag, and **no
umpire said anything** — the call at second sat below an early return that fires
when there is no throw to FIRST, which on a force play is always. It read as
working only because a double play happens to set that field. And the caption
over it said `GROUND OUT`, because `sceneFor()` had never been told the force
exists. Both fixed; it now reads FORCE AT SECOND / SHORT TO THE BAG with the OUT
called at the bag.

Worth writing down because it is the second time this repo has learned it: a
green suite says the rules are right and nothing at all about what is on the
screen. `window.__scene()` next to `window.__play()` is the read-out that told
the difference between a caption that was never built and one that was built and
not drawn.

**7. "He sat on it" is gone.** *"He sat on it is stupid thing to have."* One
line deleted. The hot bat and the squared-up streak he says he likes are
untouched.

**⚠️ What this cost on the scoreboard.** The force play takes a base off the
offence on every non-double-play grounder with a man on first, and that is real:
**4.28 runs per team over 1200 games, against 4.47 before and a real 4.4.** Hits
8.46, K rate 22.6%, everything else inside noise. It sits in the band this repo
has accepted before — 4.25 and 4.34 are both in the notes above — and the trade
was taken knowingly, because the play it buys is the one the sport is made of.
`FORCE_AT_SECOND` is the single knob if it reads as too few runs.

**What is still open from that file.** *"My game inning ended with a runner on
third, an error on base"* is the one line nobody has been able to reproduce or
explain; it may be a scoring-display problem and it may be nothing. And the
deepest reading of "not scripted" is untouched: the outcome table still decides
hit-or-out before the ball is ever plotted, and geometry only gets a vote
afterwards in `contest()`. Everything above makes the picture agree with that
verdict. None of it makes the verdict come from the picture.

### Tags, relays, and the batter finally runs — 2026-09-12, third pass

Zane: *"now we need tags, relays, and batters stretching hits implemented,
fluid."* Three holes, and each one turned out to be a place where the engine
already knew something the screen never showed.

**1. The batter never stretched anything.** `advance()` excluded him by hand —
`from >= 0` — and its own note gave the reason: *"a man stretching a single into
a double is a play with a throw and a call at the far end, and the overhead
replay stops him at first."* The replay does not stop him at first any more, so
the reason was spent. Every runner on base could gamble for ninety feet; the one
man who actually hit the ball and could see where it went could not.

`STRETCH_GAP_FT` (78ft, the top fifth of the single population) decides whether
it is even worth thinking about, and `stretchChance()` scales by his legs from
there. He is thrown at like anyone else, and `batterTo` now travels out through
`PlayResult` → `PlayLog` → the replay, because **a stretched single is still
scored a single and leaves him standing on second** — the outcome cannot say how
far he ran any more.

⚠️ **The economics were backwards on the first cut, and only measuring caught
it.** Sharing the runners' `THROW_RATE` of 0.28 made stretching cost **0.08 runs
per team per game** — a straight loss that the model chose on 45% of qualifying
balls, which is not a gamble, it is a mistake the game makes on your behalf
several times a night. `STRETCH_THROW` is 0.18, and the reason is not
generosity: a man on first breaking for third is running on a read he made
before the ball landed, while the batter watched it come off his own bat. He
picks his spots, so the spots he picks are the ones he makes. **0.51 stretches
per team per game, 83% of them safe.**

⚠️ **AND A DIE THROWN WHEN IT CANNOT DECIDE ANYTHING IS NOT FREE.** The first
version rolled the stretch on every ball in play. Every draw shifts the whole
stream behind it, so that re-randomised every seeded season in the project and
put a 0.13-run wobble in the balance numbers that had nothing to do with the
feature being measured — I nearly tuned a constant to chase it. It fires only on
the tenth or so of balls that land in space now, and runs sit at **4.34**.

**2. Nobody was ever tagged, and one throw was drawn nowhere at all.** Every out
in the game was a force or a catch. But nobody on the `thrownOut` line is forced
— every man there *chose* to run — so the fielder has to put the ball on him.
That is now what the play-by-play says, and it is the word that separates it from
every other OUT on the field, all of which are somebody stepping on a bag.

**The steal got a picture.** It is the most recognisable tag play in the sport
and it resolved in a die, a flash and a line of text — the base HUD simply showed
the man one bag along, or gone. `drawSteal()` puts the runner, the catcher's
throw from the plate, the man covering the bag and the call on the screen, using
the same helpers a ball in play uses so a steal and a force look like the same
sport. Both halves call one `showSteal()`, for the reason `showFoul()` is shared:
yours and theirs are the same event.

**3. The outfield threw the ball three hundred feet on the fly**, which is the
one thing no outfielder does. A runner gunned down going first-to-third was
decided by `gunDown()`, printed by the play-by-play, and shown as a man stopping
dead at a bag for no visible reason — **the throw was not drawn at any point**.

`relayFor()` sends the shortstop out on anything to left or centre and the second
baseman on anything to right, `RELAY_OUT` stands him a third of the way to the
ball, and the throw goes in two legs through him. The `relay` role slots into
`roleFor()` *after* cover-second and *before* cover-first — a middle infielder
cannot do two jobs, and getting that order wrong would either empty second base
on a double play or never fire at all.

⚠️ **One fix that was not asked for and is worth naming.** Threading the
`Placement` into `fieldBall()` settled an argument the codebase was having with
itself: `fielderFor()` re-derived who fielded the ball from a bare
`plotBatted()` with no park and **no shift**, while `withPlacement()` derived it
against the alignment the defence was actually standing in. Measured over 22,000
balls in play they agree 100% straight up and **84.5% under a shift** — so on one
shifted ball in six, the play-by-play named one man and the error was rolled
against a different man's glove. One answer now, and it is the same one the
stretch reads its gap from.

**Watched on screen, not trusted.** `window.__steal(to, safe)` joins `__throw()`
and `__scene()`. Confirmed: OUT at second with the runner dimmed under the ball,
SAFE at third with the third baseman covering, the batter rounding first on a
stretched single, and — the one that had never been drawn in the project's life —
a ball going right fielder → cut-off man → second base, with the tag at the end
of it.

### The fielding, and the third press — 2026-09-12, later the same day

Zane, after playing the morning's build: *"Theres no force outs the fielding
really needs to be fixed. Close plays can have a QTE?"*

**Force outs existed and were invisible, which is the same thing.** Measured
before believing it: **0.52 per team per game**, so across nine innings from one
seat you would see roughly none. The cause was a gate. The force roll hung off
`canTurnTwo`, and turning two needs an out to spare — so with **two down**, the
most recognisable version of the play in the sport, the bang-bang throw to
second that ends an inning, could not happen at all. A third of every chance.
Different questions want different gates. **1.11 per team per game** after.

`scripts/balance.ts` counts force outs from here on, for exactly the reason it
counts errors: this rule has a knob and no way to see it was the whole bug.

**Then the throw went to the wrong bag anyway.** Every force was taken at
SECOND whatever the bases looked like — men on first and second, a grounder to
third, and the ball went across the diamond to the trailing runner instead of to
the bag he was standing on. Bases loaded and the play was *still* at second, so
the force at the plate simply did not exist.

`force: boolean` is `forceAt: 2 | 3 | 4` now, rolled against the base state the
core is deliberately blind to (`forcedRunners()` hands it over), and the throw,
the runner, the umpire's call, the scorer's line and the caption all read that
one number. **INFIELD IN finally means what the alignment is for:** 85% they
take him at the plate, against 50% otherwise. That is the payoff the call has
never had — it has cost the defence the holes `placement.ts` charges for since
it shipped and bought nothing but the man on third staying put.

⚠️ **The first cut of the lead force was wrong, and measurement is the only
reason it did not ship that way.** It was gated on `outs < 2`, reasoning that
with two down you take the surest out. Backwards: with men on first and second
the lead bag *is* the surest out, because he is standing on it. And since the
double play only rolls under two outs, forces skew two-out — so the gate
suppressed the majority of them. **5%** of forces went anywhere but second, one
every sixteen games, which is the same invisibility that started this section.
Ungated: **14%**. It is also free, because a force for the third out scores
nobody whichever bag it is taken at.

### The throw — the third graded press

The game already had this verb twice: the swing is one graded press against a
window (`timing.ts`), the release is one graded press against a window
(`delivery.ts`). The throw is the third instance of a thing the game already is,
not a new mechanic bolted on, and it reuses `gradeRelease()` and
`RELEASE_WINDOWS_MS` rather than inventing a third set of numbers.

**⚠️ IT MULTIPLIES THE ROLLS AND CANNOT OVERRULE A VERDICT.** This is the
constraint the whole design hangs on. A ball the table already called
`ground_out` is an out however the press lands. What is genuinely still open
when the ball reaches a fielder is whether it is **booted** and whether it turns
**two** — which is what a throw is actually about — so those are the two numbers
`THROW_EFFECT` scales. Letting a press flip the out itself would put the
player's hands inside the outcome seam, which is the one rule `plot.ts` states
in its header and the reason the replay is a replay.

    PERFECT   dp ×1.3   error ×0.5
    GOOD      dp ×1     error ×1      ← the league, exactly
    RUSHED    dp ×0.85  error ×1.4
    DRAGGED   dp ×0.85  error ×1.4
    WILD      dp ×0.45  error ×3

`good` being exactly 1 on both is load-bearing for the same reason
`RELEASE_CONTROL.good` is: every play in the headless sim resolves without a
press, so a competent throw has to land precisely on the league's own rates or
your copy of a defence is a different defence from the one the README measured.
Verified rather than asserted — `scripts/balance.ts` reads **4.36 runs per team
either side of this change**, to the hundredth.

**⚠️ THE WHOLE DESIGN IS IN HOW NARROW `isClosePlay()` IS.** A press on every
ball you field is five or six interruptions a game, and the mode's premise is
that a season fits in an afternoon — the same bound `FOUL_HOLD_MS` has been the
standing warning about. A press on a lazy fly is *worse* than nothing, because
it teaches the player that the bar means the next thing was routine. So it is
exactly the double-play ball: a ground ball, a man forced at first, an out to
spare, and only while you are the one on the mound. Once or twice a game, which
is rare enough that the bar appearing is itself information.

The sweep is 720ms against the fastest pitch's 960 — a pivot is the opposite of
a wind-up, and it has to be over before it is felt as an interruption. It takes
the delivery bar's own rectangle, because both halves of this game are one press
timed against one window and putting every instrument in one place is the
cheapest way to say so. No press by the end of the sweep is a wild throw, the
same way the arm empties at the end of a delivery: a play that waits forever on
a press is a frozen game.

**Driven in the browser, not trusted.** `window.__throw()` in the dev block
builds a real `pendingPlay` from the live game and hands it to the same phase a
batted ball does, so a press runs `completePlay()` for real. Confirmed on
screen: the bar and its bands draw, a press on the target grades and resolves
the play, and no press at all prints "The throw gets away." and resolves it
anyway. That hook exists because the bar appears once or twice a game and never
when you are looking for it — and because twice today a green suite said a
feature worked when the screen said otherwise.

### The defence moves — and it is a lean, not a stack

`describePlay()` had been promising this for weeks: the scorer's sentence exists
so the player learns "that pulling everything into the shift is why they keep
making outs", and until 2026-09-08 there was no shift to pull into. `FIELDERS`
in `web/plot.ts` was one fixed table and all thirty clubs played every hitter
straight up.

Four alignments — **STRAIGHT UP, SHIFT LEFT, SHIFT RIGHT, INFIELD IN**. The
computer calls its own off the man in the box (`pickShift()`); you call yours
from the DEFENCE panel next to the bullpen, or with <kbd>V</kbd>, and the panel
names the hitter and says why. **The nine dots move in the overhead replay**, so
a shift is something you watch happen rather than a number in a file.

Almost none of it is new code. The geometry already read the fielder table three
times — who chases it, how much room the hitter found, and where the dots are
drawn — so a shift is a different table threaded to those three callers and
nowhere else. `shift.ts` decides no outs.

⚠️ **The tables are measured, and the first two versions were backwards.** A
shift is supposed to cost the hitter; the stacked version — three infielders on
one side of second, the picture the word suggests — measured at **4.65 runs per
team against a 4.41 baseline**, because the side it vacated was worth more than
the side it covered. Infield-only got it to 4.53. What shipped is a *lean* of at
most ~15° a man, and it measures **4.45, neutral within noise**. The rule those
runs produced, written on the file: the hole you open must be smaller than the
hole you close. Re-run `npm run sim` after touching any number in `MOVES`.

*Still unmeasured: whether it punishes pull hitters **specifically**. Neutral in
aggregate is consistent both with "it works and the opposite-field hitters take
the runs back" and with "it does nothing to anybody" — splitting batted-ball
outcomes by `pullScore` would settle it, and no script does that yet.*

Still nothing in the door for a **second year**: no draft, no free agency, no
ageing, no development. `career.ts` is the shelf you put a finished season on,
not an offseason. A park is editable but its shape is the only thing about the
world that is; there are no wall heights, no altitude, and no weather.

The roguelike layer (`run.ts`, `division.ts`, `opponent.ts`) is untouched and
still builds — this sits beside it, not on top of it.

### Double plays, triple plays, and nobody had ever recorded a putout — 2026-09-12, fourth pass

Zane: *"lets finish up the fielding with double plays now. The fielders choice
works, but there needs to be double and triple plays, along with sac flys that
make sense. Also putouts are another necessity."*

**1. The double play was one line, and that line held two bugs.** `turnTwo()`
was `removeRunner(bases, 0)` — and had been since the double play shipped. So it
**always erased the man on first**, whatever the bases looked like, which meant
the one double play a manager actually plays for — the 2-3 home-to-first with the
infield in and the bases loaded — could not happen. It also **froze everybody
else**, so the ordinary run-scoring 6-4-3 scored nothing, ever, in the history of
this league.

`forceAt` now rides on the double play the same way it rides on a plain force,
and `turnTwo()` is `fieldersChoice()` with nobody reaching. Writing it that way
is the point rather than a shortcut: a double play *is* a fielder's choice plus
the throw to first, and two implementations of "who is forced and who gambles"
would disagree eventually — under the picture the player is watching. The runs
are gated on `outs === 0`, because when the double play is the second and third
outs the third one is a force and nothing counts.

**11% of double plays are now taken somewhere other than second.**

**2. The triple play.** `TRIPLE_PLAY` (0.05) on a double-play ball with nobody
out and two men forced. The rate was measured rather than guessed — set to 1 the
qualifying ball comes up once every **nine** games, so 0.05 lands one roughly
**every 190 games**: about sixteen times commoner than the real thing and still a
freak event, the same order of distortion `DOUBLE_PLAY_RATE` and `ERROR_RATE`
already carry. It is the only caption in the game outside a walk-off that gets a
`huge` beat.

**3. The sacrifice fly could be a line drive, and was free.** Two separate
faults, both consequences of `LAUNCH_ANGLE` widening `line_out` to [10, 38]°
earlier the same day — one outcome now covers the rope at the shortstop and the
lazy fly to right.

- `SAC_FLY_MIN_EV` was the only gate, and a line drive is by definition hit
  *hard*, so a 100mph screamer at the second baseman cleared an 85mph bar
  comfortably and **scored a man from third**. `SAC_FLY_MIN_ANGLE` (20°) is the
  missing half. This is the same failure the popup had before `FLY_OUTS` was
  narrowed: a velocity test standing in for a question about the *shape* of the
  ball.
- **The man on third scored on every qualifying ball, with no throw.** It was the
  last free base in the game — the extra base has `gunDown()`, the stretch has
  `STRETCH_THROW`, the steal has the catcher's arm, and a cannon in centre field
  was worth exactly nothing on the play an outfield arm is most famous for.
  `TAG_THROW` spends the `extraBase` die that a caught fly **had been drawing and
  throwing away on every fly ball in the game** — no new draw, no shifted season.
  6% of sends are now cut down, and the sacrifice fly can be two outs and no run.

With the angle gate doing the "is it a fly ball" half, `SAC_FLY_MIN_EV` goes
85 → **76**: it only has to separate a deep fly from a lazy one now, and 85 was
set for a population that included liners.

⚠️ **And the sacrifice fly is RARE, not common — the open question below had it
backwards.** 0.09 per team per game against a real 0.25. Measured at 300 games a
step, the gate plateaus: 85 gives 0.05, 76 gives 0.09, 68 gives 0.10. The binding
constraint is not this number at all — it is how often a man stands on third with
an out to spare and somebody hits a fly, which is an upstream property of the run
environment and **not something the sacrifice fly rule should fake**. The old
note measured it as a share of plate appearances off a bot hitting .500; that
sample was flattering and the conclusion was wrong.

**4. Putouts — two halves, and the first is the plays that make them.** Every out
in this game was the batter, a force, or a catch. Nothing ever *tagged* anybody
on a batted ball. `DOUBLE_OFF` (0.33) adds the line drive caught on the fly with
the man on first doubled off — the only out on the field recorded with a tag
rather than somebody stepping on something. Population measured the same way: set
to 1 the qualifying ball comes up 0.24 a team a game, so a third of them lands on
the real **0.08**.

⚠️ **The first cut gated it on an infielder catching it and the population
collapsed to 0.04, which no rate can turn into 0.08.** One rate across the whole
band instead. The honest ceiling — named in the constant — is that an outfield
liner doubles a man off slightly too often; split the constant in two when that
is what reads wrong.

**5. Putouts — and nobody in this league had ever recorded one.** `placement.ts`
has written `6-4-3` on the screen since the scorecard shipped, and its own header
said what was missing: *"the moment somebody wants a per-fielder total, the
numbers are already here to add up."* Nothing added them up. Meanwhile
`gloveOf()` decides who plays shortstop and how often a ball is booted — so a
player could build a defence, watch it cost him a game, and find no record that
anybody had fielded anything.

`FieldLine` (PO / A / E) is the third book, folded at the same choke point as the
other two, and it shows up as a **FIELDING** panel per club in the box score and
a **GLOVES** panel for your own club over the season, with TC and FPCT.

⚠️ **`creditsFor()` is deliberately not a parser over `scorecard()`'s string.**
That was the first cut and it is the wrong kind of lazy: `L6-3` credits 6 with a
putout *and* an assist, `6-4-3` credits only 3 with the putout, and `K` credits a
man whose number is not in the string at all. Two short functions off one
`PlayShape`, with the one invariant a box score is actually checked against — the
putouts add up to the outs — asserted for every shape.

**Three real bugs fell out of writing that test, and none of them could have been
found any other way.**

- **`recordAtBat()` was throwing the whole fielding book away on every at-bat.**
  It built a fresh object out of exactly `bat` and `arm`, so the moment a third
  book existed it reset to whatever the last play credited. One game came out
  with **one putout in it**. The fix is `...book` first.
- **Every fielder's choice in the game has been scored `6-3`.** `describePlay()`
  handed `scorecard()` a `FieldingResult`, whose bag field is `forceAt` — and
  `scorecard()` reads `force`. So the one line of the book that says *who was
  retired* named the batter, who is the one man who was **not** out. TypeScript
  cannot catch it: excess properties are only checked on object literals, and
  this was a variable.
- **The pitcher is not in the alignment.** `assignPositions()` fills eight spots
  out of the nine-man batting order and leaves `P` null, which is what makes this
  a DH league — so a comebacker is `1-3` and number 1 had to be read off the
  mound instead.

**6. The screen, because a green suite says nothing about it.** The relay was
hard-wired to second on every double play, so a 2-3 drew a ball flying past the
catcher out to second base under a caption saying the run had been cut down at
home. And `force` in `raceTiming()` means *"the play ends at the bag"* — checked
before the double play — so handing a double play its new bag would have erased
the throw to first and drawn a 6-4-3 as a 6-4. Both named where they are.

New captions: **THREE / A TRIPLE PLAY**, **TWO / LINED INTO IT — DOUBLED OFF**,
**TWO, AND THE RUN IS OUT** for the 2-3, **SACRIFICE FLY**, and **HE IS OUT AT
THE PLATE** for the throw that beat the tag — which is the one the arm rating
existed for and had never once been seen.

**⚠️ What this cost on the scoreboard: nothing.** 800 games, **4.36 runs per
team** against 4.4 real and 4.34 before this pass. Double plays 0.72 (real 0.75),
doubled off 0.08 (real ~0.08), hits 8.38, K rate 22.3%. The new outs and the new
runs cancel, which is the same pairing `inning.ts` has been balancing since the
double play first shipped.

## Play it

```bash
npm run dev     # then open http://localhost:5173
npm run demo    # check + build + fold it all into ONE html file
```

`npm run demo` writes `dist/basedball-roguelike-v<version>.html` (the roguelike),
the version taken from package.json — the entire game in a single file with
nothing external in it. Double-click it to play offline, drag it into itch.io,
or drop it on any static host. It also writes `dist/artifact-index.html`, the
same game with the document shell stripped for posting as a Claude Artifact.

Baseball has been robotized. A full run is **nine encounters** climbing three
divisions — **The Holdouts** (the last human league), **The Splice**
(augmented), **The Foundry** (machines only). Tap the field or press SPACE to
start the bat, **T** to take, **P** to sit on the next pitch, **S** to send the
runner, **ESC** to pause.
Settings live on the title screen and in the pause menu. The bar along the
bottom shows where your swing landed against the real timing windows.

**The press starts a swing; it does not land one.** The barrel takes
`SWING_TRAVEL_MS` (120ms, `src/web/swing.ts`) to reach the plate and the
outcome is graded when it gets there, in the same frame the bat is drawn
crossing the zone. So you have to start the bat *before* the ball arrives —
which is the difference between timing a pitch and reacting to one. No window
changed to make this true.

### The swing is level — fault 6, fixed 2026-08-16

It used to be a golf swing. The angles ran REST −1.20 rad (−69°, up over the
shoulder) through CONTACT +0.25 to FOLLOW +1.35 (+77°, at the dirt): 146° of
rotation through a **vertical** plane. Zane's report was "the batter swings up
to down, when it should be how a NES baseball game goes", and that is exactly
what it was doing.

The contact angle was never wrong — it aims the barrel at the middle of the
zone and still does. Rest and follow-through were the chop.

**What makes a level swing look level from this camera.** The at-bat view sits
high behind the catcher. A real swing rotates in a roughly *horizontal* plane,
and a horizontal circle seen from above does not project to a circle — it
projects to an **ellipse**, wide and squashed. So the fix is not different
angles inside the same circle; it is the same rotation drawn through a
foreshortened one (`SWING_FORESHORTEN`, 0.34). The bat now sweeps 238° all the
way around him and barely moves up or down doing it. That is also why the old
version could never have been tuned into looking right: every angle of a
circular sweep spends most of its travel going up or down.

Measured, before and after — the barrel's sweep box:

```
old   75 wide x 183 tall     vertical travel 2.4x horizontal   (an axe)
new  152 wide x  65 tall     horizontal travel 2.3x vertical   (a swing)
```

Everything in `swing.test.ts` before this passed on the chop, because it all
referenced the angle *constants* rather than the geometry. The new block asserts
the shape instead — sweep box, barrel height through the swing, rest behind the
hands — and each of those fails on the old numbers. **`__swingGhosts()` in the
dev console** freezes the whole arc in one picture; a 340ms animation is not
something you can tune by eye in motion, which is how the chop survived so long.

Left-handers are the same swing through `ctx.scale(-1, 1)` about the plate, so
there is exactly one swing in the codebase rather than two to keep in step.

### Bat speed is the cost of power

`SWING_TRAVEL_MS` was one constant for all fifteen players, so Xandra Kō's
1.7-power factory frame got around exactly as fast as Wee Tom Barrow, who is
five foot four. It scales with **power** now — no new stat, and power needed a
cost: after the `applyPower` rewrite it was pure upside everywhere.

```
Wee Tom Barrow   pow 0.65   105ms   quick bat
Smoky Joe Vance  pow 1.05   122ms   average bat
Dex Okafor       pow 1.45   139ms   heavy bat
Xandra Kō        pow 1.70   149ms   heavy bat
```

A 44ms spread, against a ±35ms `good` window — wide enough to feel rather than
a decimal on a card.

**What it costs you is information, not precision.** No timing window moved;
they still apply at contact exactly as before. What moves is how early you must
commit, and committing earlier means deciding with less of the pitch seen.
Against THE ARCHITECT's fastball — the fastest thing in the game at ~500ms of
flight — a quick bat gets 395ms of looking at it and a heavy bat gets 351ms.
Both sit above the ~250ms a person needs to react to a visual cue, which is
what keeps a heavy bat playable rather than merely punishing.

The clamps (100–155ms) matter more than the slope: chemistry and items both add
power, so effective power is not bounded by the roster's 1.70.

**Travel is captured at the press, not recomputed.** `swingTravel` is set
alongside `swingStartedAt`, so the frame that grades and the frame that draws
read the same number — FAULT 5's lesson applied to bat speed.

**It is on the walk-up card, the hover tip and the signing card**, in words on
the first two and milliseconds on the tip. A timing change nobody is told about
is just unexplained difficulty.

⚠️ **Bat speed and the auto-calibration interact, and the obvious fix is wrong.**
Samples are recorded raw and deliberately *not* normalised for travel. For a
player who correctly anticipates the bat he is holding, travel cancels exactly —
the estimator is already unbiased for the adapted player, who is the player the
feature exists to create. Subtracting `travel − SWING_TRAVEL_MS` would fix the
unadapted player and push a skilled one's calibration wrong by the full spread.
Across a mixed lineup the median sits near the middle bat, so the *difference*
between a quick bat and a heavy one survives; only the lineup-wide average gets
absorbed, which is what a calibration is for. Full reasoning is in `main.ts` at
`recordCalibrationSample`.

**One bug this exposed:** `crossing()` hardcoded `inside` to −34px, correct for
a right-hander and drawn on the wrong side of the plate for a lefty. Adding
handedness created it — the engine was pitching in on the hands while the
picture showed the ball off the outside corner. Rendering only; `applyLocation`
reads the word, not the pixels, so nothing was ever mis-scored.

## Art: drop a PNG in a folder

**Every drawn thing is a shell until an asset replaces it, and every asset is
optional forever.** See `assets/README.md` for the full convention.

```
assets/batters/cap-mullaney.png     <- he stops being a rectangle
assets/batters/hu1.png              <- the same man, by his stable id
assets/batters/_default.png         <- every batter without a file of his own
```

There is no manifest, no import to add and no id to register: `import.meta.glob`
in `src/web/sprites.ts` reads the folders at build time, so a file that exists
is a file the game uses. `drawSprite()` returns false when there is no art and
every call site falls back to the shape it drew before — which is why the shells
are the live path rather than dead code, and why this landed before any art did
and changed nothing on screen.

Sizing needs no per-file tuning: each kind declares a target height and images
are scaled to it with aspect preserved, so a 32px sprite and a 512px one both
land correctly. Figures anchor at the **feet**. Draw everyone **right-handed**;
left-handers are mirrored for you.

**A batter asset is a single standing pose — you do not draw a swing.**
`swing.ts` owns the whole animation and every batter inherits it, which is what
makes twenty batters cost twenty files instead of twenty animations. The bat is
drawn separately on top, so don't draw one into the sprite.

`build.assetsInlineLimit` is forced on in `vite.config.ts` so every asset inlines
as a `data:` URI. Without it the demo breaks twice: `bundle.mjs` asserts the
build emitted exactly one asset, and the one-file demo runs from `file://` where
there is no server to fetch a sibling PNG from. In dev the title screen prints
`N assets loaded`, which is how you tell "it didn't pick up my file" from "my
art is wrong" — two things that otherwise both look like a rectangle.

Hits pay — 10/25/40/100 for single/double/triple/homer, +20 clutch, $5 for a
walk — and between matches you spend it in the shop. The league you are in
picks the pitcher, so the tell ladder *is* the difficulty curve: the Rookie
tips his grip before the windup, the Veteran leaks it at release, and the
Foundry gives you nothing per pitch at all — against a machine the count is the
only read you have left.

### Six pitches, six deliveries

**Every pitch used to ask for the identical press** — 700ms into a 1000ms sweep,
whichever of the six you called. So the one decision the mound offers, *what to
throw*, had no effect on the act of throwing it: six buttons, one motion, and
after an inning your hands stop reading the bar because they already know where
the line is. That is what made it repetitive, and it was not a feedback problem.

A pitch is an arm action now, and arm actions differ:

| pitch | sweep | release | line sits at | window | on screen |
|---|---|---|---|---|---|
| fastball | 960ms | 500ms | 52% | ×1.10 | quick |
| sinker | 980 | 560 | 57% | ×1.05 | quick |
| slider | 1000 | 640 | 64% | ×0.95 | even |
| knuckleball | 1000 | 700 | 70% | ×0.80 | even |
| changeup | 1110 | 830 | 75% | ×0.92 | slow |
| curveball | 1180 | 920 | 78% | ×0.90 | long |

**Mixing pitches costs you your rhythm, and that is the point.** Coming to the
changeup straight off a fastball is a 270ms difference in when to let go — the
changeup's own deception, turned on the man throwing it. Sitting on the fastball
all night is the one sequence that costs nothing, which is exactly the trade a
pitcher makes. The hard pitches to command are the ones with the best tables
behind them, so calling the curveball is a bet rather than a free upgrade.

The bar is the **same width for every pitch and the sweep is not**, so the
marker crawls on a curveball and snaps on a fastball. Scaling the bar to the
sweep would have made all six look identical again. The tempo is written on the
pitch button (`1 · quick`) so you can see which is which *before* you call one —
otherwise it is just the bar behaving oddly.

⚠️ **The release/sweep RATIO is a design number, and the first table got it
wrong by never considering it.** The line is drawn at `release/sweep` across a
fixed-width bar; v1's sweeps and releases scaled together, so every ratio landed
between 63.6% and 73.6% — **25px of travel on a 252px bar.** Playtested on the
real screen, the line looked like it sat in the same place on all six and the
only cue left was marker speed. The spread is now **52%→78%, 65px**, so the
target visibly walks right as the pitches slow down and the marker speed still
varies underneath it. Two cues, not one. `delivery.test.ts` asserts the spread
and the ordering — the two bounds tests never caught this, because neither is
about where the line is *drawn*.

⚠️ Still one press. `delivery.ts` rules out wind-up stages, arm slots and double
meters and none of them are here — the same single graded press against
different geometry. `RELEASE_CONTROL` is untouched, so **`good` is still exactly
1.0** and your copy of an arm still belongs to the league the sim measures. It
never reaches the computer: `autoStep()` throws at `good` directly and never
grades a release. Confirmed — `npm run sim` is unchanged to the decimal at 4.45
runs per team.

## The pitcher pitches to a plan

**Rewritten 2026-08-16, and it is the largest change to how the game plays
since the swing became a swing.**

He used to pick with `pattern[pitchNumber % pattern.length]`, where
`pitchNumber` counted across the whole match. That made the arm on the mound a
tape loop: it ignored what it had just thrown, who was batting, who was on
base, how many outs there were and what the score was. The only situational
logic in the file was two hard branches at `|strikes − balls| ≥ 2`.

Now every pitch picks an **approach** first, and the pitch, the location and
the share of the plate all fall out of it:

| count | approach | what he does |
|---|---|---|
| 0-0 | `establish` | his best pitch, in the zone. Hittable on purpose |
| behind by 2, or 3-2 | `attack` | fastball, over the plate |
| even or ahead by one | `setup` | mix, work the edges |
| 2 strikes | `putaway` | his **out pitch**, off the plate — chase it |
| 0-2 | `waste` | elevated fastball or a buried breaking ball. Unhittable |
| 1B open, slugger up | `around` | nothing good, and he does not mind walking you |

On top of that: he damps whatever he just threw rather than banning it, so
back-to-back sliders are possible but not the norm; and each pitcher has an
**out pitch** named in his scouting report, which is the single most useful
fact about him.

**The readability did not go away, it moved.** The old skill was memorising an
index — "his fourth pitch is a slider". The new one is reading an intent — "he
goes to the slider away with two strikes". It is easier to learn, it transfers
between pitchers instead of being thrown away with each one, and it is the
skill real hitters actually have. The Ace's decoy pattern died with the cycle
it lived in; what makes him an Ace now is that he is the only one who tips no
intent per pitch.

Two rules with teeth in them:

- **`attack` gives `ATTACK_ZONE_FLOOR` (0.92) of the plate, not all of it.** A
  guaranteed strike at 3-0 is a solved puzzle rather than a payoff. The pitch is
  still certain; only the location rolls.
- **`around` outranks being behind.** A pitcher 3-0 to a slugger with first base
  open finishes the walk rather than grooving one. This is the one rule that can
  take the patience payoff away, and it should — the price of building a lineup
  that scares people is that they stop pitching to it. Bat your slugger where
  first base is occupied and it never fires.

**One coupling found by measuring, not by feel.** The plan misses the zone far
more than the tape loop did (`putaway` 55% of his usual plate, `around` 35%,
`waste` 15%), and `HBP_CHANCE` rolls *per wild pitch inside* — so hit batsmen
tripled to 1.8–3.1% of plate appearances against a real 1%. It is 0.045 now, not
0.12. Anyone adding another off-the-plate approach has to re-measure this.

## Handedness

Every player bats from a side and every pitcher throws from one, and
`platoonContact()` in `hit.ts` is the whole rule. It lands on the **contact
stat**, not on the outcome table, because contact scales the timing windows
inside `grade()` — a same-handed slider is hard to hit because you pick it up
late, not because the bat behaves differently when it gets there.

The breaking ball carries the split (0.82 same-side against 0.93 on a
fastball), which is why real relievers are matched up an inning at a time. The
**knuckleball is exempt and returns exactly 1.0**: no spin means no arm-side
movement for handedness to be relative to, and a platoon edge on it would muddy
the one pitch whose counterplay is *don't swing*.

Three of the nine arms are left-handed, about double the real share — with nine
encounters a truer 1-in-4 would leave most runs never facing a lefty, and a
platoon system nobody meets is a system that does not exist.

## The hitter has two approaches

`isPowerSwing` was implemented, tested, and reachable by **no input path in the
game** for months. It is wired now, and it needed a counterpart first, because a
free damage toggle is not a decision.

- **Sit on it** (`P`, or the button) — more damage, more strikeouts, and a
  *narrower* timing window. Without the window cost it was pure upside on any
  pitch you had already timed.
- **Protect** — automatic at two strikes. Wider window, less damage, and **1.5×
  the foul balls**, which is free survival because `atBat.ts` already knows a
  foul with two strikes is not the third one.

**They are mutually exclusive, and that exclusivity is the decision.** At two
strikes, normal means survive and sitting on it means all or nothing.

It is **armed between pitches, not held during the press** — that is when a real
hitter decides, it keeps a second read of the input device out of the timing
seam (rule 1), and a toggle has a touch path where a modifier key does not.

You are the home team. The other side bats first — their half-inning is rolled,
not played, since you never field — so you step in already knowing the deficit.
The line score above the field is the win condition: beat them, and a tie is a
loss.


The ball's position on screen and the grade on your swing come off the **same
clock** — `performance.now()` at release, `ballArrivalMs()` for arrival,
`pointerdown`'s `event.timeStamp` for the swing. `requestAnimationFrame` only
decides when to *draw*; it never decides when the ball arrives. That seam is
where every fault in the Godot prototype lived.

Art is shapes until a PNG lands on top of it — assets are the human's job on
this project, and the swap changes no geometry and no timing. See "Art: drop a
PNG in a folder" above.

### The overhead replay

**Lives in `src/web/overhead.ts` and both screens use it** — the roguelike and
the full nine-inning game. It was inside the roguelike screen until the game
screen wanted it; the canvas, camera, field colours and sound bank are all
parameters now, so a screen with no audio simply passes none.

Put one in play and the camera cuts to an overhead of the whole field and
flies the ball to where it went, the way a broadcast cuts to the outfield
camera. It fills the walk-up beat that was already there, so it costs no
pacing.

**It is a replay, not a simulation, and that is load-bearing.** `hitTables.ts`
returned `single` or `ground_out` before contact was drawn and `fielding.ts`
had already rolled the double play. Nothing in the replay may decide anything —
that would put an engine back in the outcome seam, which is rule 1 and the
thing that killed the Godot prototype. `plot.ts` states the same scope line
where someone changing it will read it.

The plot takes the hit engine's real exit velocity and launch angle, so the
timing you actually put on the ball shows up in the picture, but every constant
in it is a game-feel knob rather than a measurement — drag is one multiply, and
"hang time" is a duration picked to fit the beat, not five real seconds.

Built in four phases, **all in:**

1. ✅ **Camera and ball.** The cut, the field, the flight. No fielders.
2. ✅ **Fielders converge.** Nine numbered dots in one standard alignment; the
   one nearest to where the ball *finishes* breaks on contact and closes on it.
   No shifts, no depth by hitter, no corners in for the bunt — every one of
   those is a decision the defence would be making.

   `chaseReach()` is **the one place the replay is rigged**, and it is rigged
   deliberately: on an out the chaser arrives with the ball, on a hit he is
   still closing when it lands, and the gap widens from single to triple. The
   outcome is already in the book, so the picture has to be made to agree with
   it. Letting the geometry decide who got there is the fielding simulation
   this is not.
3. ✅ **The race.** The batter runs, and on a ground ball an infielder fielded,
   a throw races him to first. `raceTiming()` in `plot.ts` owns it and holds
   one invariant: **on an out the throw lands first, on a hit it lands second,
   always.** Caught flies are out in the air — no throw, and the runner pulls
   up rather than finishing a race decided already.

   Two traps found by scrubbing it frame by frame, both worth not re-learning:

   - **A margin in milliseconds does nothing.** What the eye reads is the gap
     in *pixels*, which is margin ÷ run time — and a margin that scales with
     speed cancels against a run time that also scales with speed. Measured, it
     moved 19.2% → 15.6% across the entire stat range: four pixels. The margin
     is a **fraction of the runner's own trip** now, 30% at 0.6 down to 5% at
     1.4, which is daylight versus a photo finish.
   - **Sometimes no margin exists.** A scorched grounder to a deep infielder is
     not fielded until ~930ms, a throw needs 140 more, and a 1.4 burner is on
     the bag at 1000. The *runner* gets stretched instead — unphysical by tens
     of milliseconds, invisible, and the only lever that keeps the call honest
     without letting geometry decide the out.

4. ✅ **A defence, and the set pieces.** Playtested after phase 3, the verdict
   was *the fielding needs to feel authentic* — and the cause was that eight
   men stood still while one dot slid on a rail, so every throw arrived at an
   unattended bag. Three things fixed it, in order of how much they mattered:

   - **Everybody has a job.** `roleFor()` gives each fielder one of chase,
     cover-first, cover-second or shade. The first baseman covers first unless
     he is the one fielding it, in which case the pitcher runs over; second is
     covered by whichever middle infielder is *not* chasing. The other seven
     lean 12% toward the ball.
   - **Nobody breaks on contact.** `REACTION_MS` is 110. A tenth of a second of
     nothing is most of what separates nine fielders from a screensaver, and
     the eye notices its absence without being able to name it.
   - **Covers stand BESIDE the bag,** not on it. Drawn on it they vanish under
     the runner, which puts the picture straight back to a throw arriving at
     an empty base.

   Set pieces: the **6-4-3** relays through second with its own out call and
   the forced man erased there; the **home run** clears the wall and leaves the
   frame; a **booted** ball squirts past the man who reached it. Runners
   already on base advance, and runners who scored run home — `scorersFrom()`
   works out which is which, because `runnerMoves()` only reports men who
   ended up *on* a base and cannot tell a scorer from a man erased at second.

   One rule learned here: **no throw means no play, and no play means no
   call.** Signalling safe at first on a ball off the wall put a green SAFE
   next to the bag under a banner reading HOME RUN.

The risk this whole subsystem carries is exposing that outcomes were
pre-decided — a ball landing in a fielder's lap and being ruled a single. The
mitigation, if it ever shows: pick the landing point *from* the outcome rather
than from raw geometry, nudging hits toward gaps and outs toward gloves.

Still not drawn: an extra-base hit stops the batter at first rather than
running him to second or third. There is no play there and no call, so it
reads as the replay ending rather than as a contradiction — but it is the
obvious next thing if the replay gets another pass.

### The replay says what just happened

⚠️ **IT WAS SILENT, AND IT WAS THE SAME LENGTH EVERY TIME.** `finishAtBat()` set
`flash = ''` the moment there was a replay to show, so the one screen the player
watches after every swing said **nothing** — and the beat was the same second
and a half whether it was a routine grounder to short or a three-run shot into
the seats. A game where the biggest thing that can happen looks exactly like the
most ordinary thing has no reward in it, and both get skipped.

`scene.ts` answers one question — *given what just happened, what does the
broadcast put on the screen and how long does it stay there* — and decides
nothing about the game. Every fact it reads was already settled by
`placement.ts`, `inning.ts` and `game.ts`, so it is pure and tested without a
canvas.

**The caption is free and the time is not, and that is the whole pacing design.**
The overhead already holds on every ball in play, so writing two lines over that
hold costs nothing — which is what stops an ordinary single from being nothing.
Extra milliseconds are spent only where they are earned.

| tier | fires | pays | what reaches it |
|---|---|---|---|
| **routine** | 77.0% | 0 ms | `GROUND OUT · TO SHORT`, `BASE HIT`, `POPPED UP` |
| **solid** | 17.5% | 220 ms | `RBI SINGLE`, `INTO THE GAP`, `OFF THE WALL`, `ERROR`, `TWO` |
| **big** | 4.7% | 620 ms | `HOME RUN`, `TRIPLE`, `ROBBED`, `HE DELIVERS` |
| **huge** | 0.7% | 1150 ms | `GRAND SLAM`, `THREE-RUN SHOT`, `WALK-OFF` (+500) |

**The bill: 3.94 seconds added to a nine-inning game**, measured over 15,564
balls in play. `node scripts/scenes.ts` prints it, and also how often each
caption fires — *a tier nothing ever reaches is dead code with a comment on it.*

It reuses `placement.ts`'s own vocabulary rather than inventing a second one. A
hit is about the **place** it went (`INTO THE GAP`, `TO LEFT FIELD`); an out is
about the **man** who took it (`TO SHORT`) — which is the same split
`describePlay()` makes, for the same reason.

### And a big spot announces itself

**Late in a close game the screen tells you where you are** —
*`9TH · TWO DOWN · TYING RUN IN SCORING POSITION`* — before the pitch rather
than after it.

⚠️ **THE RULE IS "ONE SWING CHANGES WHO IS WINNING",** not a table of innings
and margins, and stating it that way is what makes it scale with the bases by
itself: `|deficit| <= men on + 1`, late. Two down by two with nobody on is not a
moment; two down by two with two on is. Bases loaded down four is, and the same
expression says so with no special case for the grand slam.

**It is symmetric on purpose.** A one-run lead in the ninth with the tying run
aboard is the tensest thing in the sport from *both* dugouts, and the screen must
not be able to say it only counts when you are the one hitting.

- **It describes the situation, never the odds.** "Tying run at second" is
  something you can see on the field and now know to feel; a win probability is
  a number that tells you the game has already decided how this goes.
- **It fires only when the line changes.** A tight ninth is high leverage for
  every hitter in it, and a card that reappeared before all four of them would
  stop meaning *look at this* by the second one. Comparing the text means the
  card marks the moment the situation **turned**.
- **It does not block.** You can throw the next pitch straight through it.
- **Extra innings are always late**, at any season length — the tenth of a
  seven-inning game is extras and its seventh is its ninth.

Three things measurement changed, and all three would have shipped looking fine:

- ⚠️ **`INTO THE GAP` fired on 0.2% of balls in play** against a bare `DOUBLE`
  on 9.3%. The caption was keyed off `inTheGap`, which is a **fielder** distance
  — deliberately the top fifth of doubles, and the right input for `stretch()`.
  A caption is about where the ball went, so it reads the zone. Now 2.3%.
- ⚠️ **An out in a big spot fired on 10.9%** — about six a game, more often than
  a home run, so the caption meant to mark tension was the second most common
  thing on screen. A close game is not a jam: it needs men on base to be an
  escape. `OUT OF THE JAM` with two down, `HE GETS HIM` otherwise.
- ⚠️ **The caption is timed off the END of the replay, not the start.** It is a
  lower third, so it covers home plate and the race to first; a fixed delay put
  it over a groundout while the runner was still running. Anchored to the end, it
  appears once the ball has finished doing whatever it was going to do — on
  every kind of play, without anything having to know which kind this was. The
  window grows with the beat the tier bought, which is what that beat is *for*.

### Runners do baseball things now

Two rules landed 2026-08-16, both reading the `speed` stat that only stealing
and the double play used to read — so legs finally matter on a ball you hit.

- **The sacrifice fly.** A caught fly with a man on third and under two outs
  scores him. The outcome vocabulary has no depth in it — `popup` and `line_out`
  are the only two caught flies — so **exit velocity is the discriminator**, at
  `SAC_FLY_MIN_EV` (85). You cannot tag up on an infield popup; a well-struck
  ball to the outfield scores him, and power pushes borderline balls either way.
  It gets its own scorer's line (`SF8`) and its own booth call, because `popup`
  and `line_out` never mention runs and a run scoring silently is exactly the
  picture-contradicting-the-book failure the replay may never commit.
- **The extra base.** On a single or a double, a runner at or above
  `EXTRA_BASE_SPEED` (1.15) takes one more bag than the batter did — first to
  third, and second scores from second. Runners are processed **lead-first** so
  nobody runs into the back of the man in front. The batter is excluded: him
  stretching one is a play with a throw and a call at the far end, and the replay
  stops him at first.

**These close the balance pair the double play opened.** `inning.ts` carried a
standing note that an out never scores a runner and never costs two, and that
"the two omissions pull in opposite directions, which is the only reason it is
safe to leave both out". The double play (08-14) removed one half. The sac fly
and the extra base are the paired levers that put the runs back, and all three
are meant to be judged together. If scoring comes out too high, raise
`EXTRA_BASE_SPEED` first (it is the broadest), then `SAC_FLY_MIN_EV`. Do not
touch `DOUBLE_PLAY_RATE`, which was tuned against play.

Still absent: the productive ground out, and nobody is ever thrown out
stretching.

Fouls get no replay. A foul does not end the at-bat, so it only has the short
beat, and there is nothing to watch.

In dev, `__replay('triple')` in the console previews any outcome without
waiting for the RNG to hand you one — tuning an animation you see once every
twenty at-bats is how animations end up untuned. Vite folds the `import.meta
.env.DEV` guard to false and drops it from the demo build.

### Or in the terminal

```bash
npm run play                        # face the Holdouts, pre-pitch tells
npm run play -- splice              # release-point tells
npm run play -- foundry             # no tell at all — read the count instead
npm run play -- foundry --match=3   # THE ARCHITECT
npm run play -- foundry --slow      # 2.5x flight time while you get the feel
npm run play -- splice --seed=abc   # replay the exact same at-bats
```

The division names are `holdouts`, `splice` and `foundry` — they are matched
against the keys of `PITCHERS`, so anything else silently falls back to the
Holdouts. (This block said `rookie`/`veteran`/`ace` for a while after the
divisions were renamed, and all three quietly did nothing.)

SPACE swings, T takes, Ctrl-C quits. One encounter against one arm.

⚠️ **The terminal build grades at the press, not at press + travel.** It has no
bat to draw, so `SWING_TRAVEL_MS` was never applied there and bat speed is not
either. Pre-existing, and it means CLI timing is not web timing — fine while
this is a bare-wire harness for the core, wrong the day anyone tunes windows
against it.

The terminal build has no scoreboard and no shop — it is the core on a bare
wire, and useful for exactly that. It drives the real core on the real clock: arrival comes from `ballArrivalMs()`,
the swing from the keypress timestamp, and the two meet in `computeOffsetMs()`.
Node strips the types and runs it directly, so there is no build step.

The design shows up on its own once you play it. **The tell names the pitch, the
pitch names the speed, and the speed is what tells you when to swing.** Against
the Ace, who tells you nothing, the only read left is the count — he is still
pitching to a plan, he just will not tell you which part of it. The scouting
report printed at the top names his arm, his mix and his out pitch, which is
what a hitter would know walking up.

## Commands

```bash
npm run typecheck   # tsc --noEmit — the build gate
npm test            # vitest run
npm run check       # both
npm run coverage    # where the untested logic is
```

`coverage` earns its dependency: it found two live code paths that had never
executed in any test. `applyLocation`'s four non-middle arms (every pitch has a
location and no test supplied one) and the whole body of `applyPower` (it
returned early below 1.0 and the starting lineup is all below 1.0). Both change
outcome probabilities by large factors in ordinary play.

## Saving

A run is written to localStorage **between matches** and offered as "Continue
run" on the title screen. `save.ts` validates rather than trusts — it is the
one input a user can hand-edit, and a malformed blob reaching `resolveLineup()`
would throw on the title screen and lock them out of a game that is otherwise
fine. Anything suspicious is treated as no save at all.

Resuming restores `rng.state()`, so **a resumed run rolls the numbers the
unsaved run would have rolled.** Reloading and replaying the same encounter
gives the same pitches in the same order — save-scumming buys nothing. That is
the determinism guarantee from rule 3 spent on making a save file trustworthy.

Never mid-at-bat. Resuming inside a pitch means restoring a phase, a ball in
flight, a swing that may already have started, and two clocks that have to
agree about when it did — all to spare the player one encounter.

## The rules this codebase is built on

There is a Godot prototype behind this rewrite. Its design was sound; its architecture was not. It carried three GameStates and seven managers, and it stopped working. Four rules come directly out of that autopsy, and none of them are negotiable.

**1. The timing seam has no engine in it.**

Every faulted behaviour in the prototype lived in the seam between a collision callback, scene timer awaits, and the hit resolver. `grade()` is a pure function of one signed number, so it is testable in one line.

**2. Timing is timestamp-based, always.**

Read the swing from `pointerdown`'s `event.timeStamp`; compute ball arrival from the pitch's launch timestamp and speed. One continuous clock. Never frame counts, never collision callbacks. Trivial on day one, miserable to retrofit.

**3. RNG is seeded. `Math.random()` is banned.**

Same seed plus same inputs gives the same at-bat. Agent-written tests are only verifiable if runs reproduce, and the experiment's dataset depends on it.

**4. Every grade the grader can return has a table behind it.**

`TimingGrade` includes `'miss'`, and the outcome tables are a `Record` over that union. Omitting a row is a compile error. In the prototype it was a runtime crash that shipped.

### The sign convention, stated once

```
offsetMs < 0   swung EARLY   (bat arrived before the ball)
offsetMs > 0   swung LATE    (bat arrived after the ball)
```

The prototype inverted this and graded every early swing as late. Do not restate this convention anywhere else in the codebase.

## Open questions

- ✅ **Home run rate — SETTLED 2026-08-20, the design doc wins.** It asked for 15–20% on a perfectly-timed swing; the ported tables gave ~4%, which is honest real baseball. Zane's call: this is an arcade batting game and the reward for nailing the timing has to feel enormous. A perfect fastball at power 1.0 now leaves the yard **19%** of the time.

  It still reads off the power curve, so it is a range rather than one number: **6.7% at power 0.65, 19% at 1.00, 39.6% at 1.50.** The room was taken from the other HIT outcomes in proportion and never from the outs, so batting average and the out rate are untouched — only the shape of the hits moved. Regenerate the rows with `node scripts/hrtable.ts`.

  Two things this broke, both fixed: three rows stopped summing to 1 because the generator rounded each entry independently (`rollOutcome` treats missing mass as a silent fall-through to ground outs), and the "no cliff at 1.0" test was asserting an ABSOLUTE gap that quietly depended on the 4% base — it now compares the step across the seam to a control step of the same width, which is scale-free.
- ⚠️ **`applyPower` had a cliff at exactly 1.0, and it is gone.** The old version returned early at `power <= 1.0` and multiplied home runs by `power * 2.0` above it. So 1.00 was neutral and 1.001 doubled the home run rate — and since every Holdout runs 0.65–0.80, **power did not influence hitting at all for the entire first league**, while the first sliver of power was worth more than everything after it. It is now a continuous exponent curve through 1.0, which reads all the way down. One deliberate change of character: the old code raised popups for BIG power (the uppercut read); the new curve raises them for LOW power (weak contact). One sign flip in `hit.ts` if that is wrong.

- ✅ **`isPowerSwing` is wired.** Closed 2026-08-16 — it is the `P` key and the *sit on it* button, paired with the automatic two-strike protective swing. See "The hitter has two approaches" above. It sat unreachable in the middle of the engine for months.
- ✅ **Which way count leverage runs — the question dissolved.** The design note's §3 rules stated it backwards from the Hample bullets quoted three lines above them in the same section, and `pitcher.ts` implemented the source direction. The pitching plan replaced the two-branch leverage rule with six named approaches, and *both* readings are now in it and not in conflict: behind, he has to `attack`; ahead, he `waste`s and then goes to the `putaway` off the plate. Nothing left to flip.
- 🟡 **Is `around` too generous to a big lineup?** It self-limits — it needs first base *open*, so the walk it produces switches it off for the next hitter — and headless simulation put walks at 5–8% of plate appearances across all nine arms, under the real 8.5%. But it has not been played. If it reads as the game refusing to let you swing, the first knob is `DANGEROUS_POWER` (1.2), not the approach.
- ✅ **Sacrifice flies were measured the wrong way round — SETTLED 2026-09-12, and the old note had it backwards.** It said "a little high, 1.5–2.7% of plate appearances against a real ~1%", off a bot hitting .500 that puts men on third constantly. Counted per team per game against the number a box score actually prints, they are **RARE**: 0.09 against a real 0.25. `SAC_FLY_MIN_EV` went 85 → 76 on the back of it, and the gate plateaus above that — the binding constraint is how often a man stands on third with an out to spare and somebody hits a fly, which is a property of the run environment and not something this rule should fake. `scripts/balance.ts` counts them from here on.
- 🟡 **The fail state now escalates — unplaytested.** `completeMatch()` in `run.ts` tracks `patience`: starts at 3, `patience === 0` ends the run early with `fired: true`. That much was always built. What was missing is that it never threatened — cap 5 with +1 per win let a decent player bank enough rope to coast, and a loss cost the same one point in the Foundry as in the Holdouts, so the last league was no scarier than the first.

  **Changed 2026-08-15:** cap is now 4 (one above the start, not two), and a loss costs `lossCost(leagueIndex)` — **1 in the Holdouts, 2 in the Splice, 3 in the Foundry**. A win still buys back exactly one, anywhere. The asymmetry is the point: you cannot win your way out of a late collapse at the rate it costs you, and the fourth dot is something the early leagues buy you the right to spend later. The HUD shows the dots *and* the current stake, and goes amber when the next loss in this league would end the run.

  **Open: whether 1/2/3 is the right ladder.** A Foundry loss at 3 dots is exactly fatal, which is deliberate but sharp — arriving there on the starting 3 means the first bad night ends the run at encounter 7. If that reads as unfair rather than tense, 1/2/2 is the softer version and it is one line. Play a full run before touching it.
- **Encounter length and the opposing offence.** An encounter is one inning of three outs, and the difficulty ladder is `RUNS_ALLOWED` in `opponent.ts`. Both are placeholders set by arithmetic rather than by play. They are now the tightest knobs in the game.
- 🟡 **THE TIMING BIAS IS FIXED; THE WINDOW WIDTHS ARE STILL UNJUDGED.** Playtested 2026-08-11 — *batting is too hard and the windows are not accurate* — and diagnosed 2026-08-13. Cause was suspect 2 on the old list, and it was the **output** half rather than the input half: `main.ts` stamps `launchMs` at the top of a rAF callback, but that image reaches the player's eyes a frame or more later, after drawing and compositing. Every swing was graded against an arrival the player could not yet have seen, so an honest swing read LATE by 30–80ms against a ±35ms `good` window. An accuracy bug, not a difficulty one — and widening the windows would have buried it.

  **Fix: `medianOffset()` in `timing.ts`.** The game learns the latency from the running median of the player's own raw offsets (median so one abandoned swing cannot drag it), clamped to ±120ms, applied to arrival before grading. Settles in about eight swings, persists in `settings.timingOffsetMs`, manual slider and a Recalibrate button in Settings. The `cal ±NNms (n)` read-out under the timing bar is how you watch it converge — the yellow mark should stop drifting right.

  ✅ **Playtested 2026-08-13, after the fix: the timing is enjoyable.** Zane's own verdict, and it closes the 08-11 defect. The calibration was the whole of it.

  **What is still open:** whether ±12/±35/±80 are the right *widths* once the bias is gone. ±12ms perfect is tighter than most rhythm games' "perfect" and human timing on a telegraphed cue sits around ±20–30ms, so perfect may still be near-unreachable for the same reason the prototype's ±5ms was. **Play a few innings before touching the numbers** — the calibration may be the whole of it. If not, roughly ±22/±55/±110 is the next thing to try, in its own commit.

  Two things ruled out and worth not re-checking: `settings.pitchSpeed` already defaults to 0.75, so flight is slowed and difficulty was never coming from speed; and the windows scale by contact stat, where the dead-ball holdouts you start with run 1.25–1.35 — the *starting* lineup already had the widest windows in the game and still felt hard, which is what pointed at a bias rather than a width.
