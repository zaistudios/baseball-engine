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

Rebuild in progress. Playable end to end: a full nine-encounter run in the browser, or a single encounter in the terminal.

```
src/core/
  rng.ts         seeded RNG (mulberry32) — determinism is a hard requirement
  timing.ts      grade(offsetMs) — pure swing grading, no engine underneath
  hitTables.ts   outcome probability tables, ported from the prototype
  hit.ts         resolveSwing() — stat, power-swing and location modifiers
  atBat.ts       the count — balls, strikes, walks, fouls, whiff ≠ strikeout
  inning.ts      outs, bases, runs, the sac fly and the extra base
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

```bash
npm run game    # play it — opens /game.html
npm run sim     # 500 headless games, prints run scoring
npm run export  # fold it into ONE html file you can play offline
```

`npm run export` writes **`dist/baseball-engine-v<version>.html`** — the whole
game in a single 42 kB file with nothing external in it. Double-click it, put it
on a USB stick, email it to yourself. It is a classic script at the end of
`<body>` rather than a module, because browsers refuse to fetch ES modules
across a `file://` origin and opening by double-click is the entire point.

⚠️ `npm run demo` (the roguelike) and `npm run export` (this game) both clear
`dist/`, so each wipes the other's output. Run whichever one you want last.

The game opens on a **start screen** with two modes:

- **Exhibition** — pick your club and pick who you are playing. One game. Your
  club is the home team, so you bat last and can win it in the ninth.
- **Franchise** — pick the club you run and play its schedule.

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
| Top | **Pitch.** Pick the pitch and the spot, manage the pen. | `1`–`5` pitch, `W/A/S/D/X` spot, `SPACE` throw, `B` bullpen |
| Bottom | **Hit,** and send runners. | `SPACE` (or click) to start the pitch, `SPACE` to swing, `SPACE` **again** to check it, `S` to steal |

```
src/game/
  teams.ts   the thirty clubs, their nines and their staffs — EDIT HERE FIRST
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

Pinch hitting and substitutions, a productive ground out, defensive shifts, and
a box score. The roguelike layer (`run.ts`, `division.ts`, `opponent.ts`)
is untouched and still builds — this sits beside it, not on top of it.

## Play it

```bash
npm run dev     # then open http://localhost:5173
npm run demo    # check + build + fold it all into ONE html file
```

`npm run demo` writes `dist/all-star-baseball-v<version>.html` (the roguelike) — the version
comes from package.json, so it is `v1.1.0` today — the entire game
in a single file with nothing external in it. Double-click it to play offline,
drag it into itch.io, or drop it on any static host. It also writes
`dist/artifact.html`, the same game with the document shell stripped for
posting as a Claude Artifact.

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
- 🟡 **Sacrifice flies measured a little high** — 1.5–2.7% of plate appearances against a real ~1% — on a bot hitting .500 that puts men on third constantly, so the sample is flattering. Re-measure after a human run before touching `SAC_FLY_MIN_EV`.
- 🟡 **The fail state now escalates — unplaytested.** `completeMatch()` in `run.ts` tracks `patience`: starts at 3, `patience === 0` ends the run early with `fired: true`. That much was always built. What was missing is that it never threatened — cap 5 with +1 per win let a decent player bank enough rope to coast, and a loss cost the same one point in the Foundry as in the Holdouts, so the last league was no scarier than the first.

  **Changed 2026-08-15:** cap is now 4 (one above the start, not two), and a loss costs `lossCost(leagueIndex)` — **1 in the Holdouts, 2 in the Splice, 3 in the Foundry**. A win still buys back exactly one, anywhere. The asymmetry is the point: you cannot win your way out of a late collapse at the rate it costs you, and the fourth dot is something the early leagues buy you the right to spend later. The HUD shows the dots *and* the current stake, and goes amber when the next loss in this league would end the run.

  **Open: whether 1/2/3 is the right ladder.** A Foundry loss at 3 dots is exactly fatal, which is deliberate but sharp — arriving there on the starting 3 means the first bad night ends the run at encounter 7. If that reads as unfair rather than tense, 1/2/2 is the softer version and it is one line. Play a full run before touching it.
- **Encounter length and the opposing offence.** An encounter is one inning of three outs, and the difficulty ladder is `RUNS_ALLOWED` in `opponent.ts`. Both are placeholders set by arithmetic rather than by play. They are now the tightest knobs in the game.
- 🟡 **THE TIMING BIAS IS FIXED; THE WINDOW WIDTHS ARE STILL UNJUDGED.** Playtested 2026-08-11 — *batting is too hard and the windows are not accurate* — and diagnosed 2026-08-13. Cause was suspect 2 on the old list, and it was the **output** half rather than the input half: `main.ts` stamps `launchMs` at the top of a rAF callback, but that image reaches the player's eyes a frame or more later, after drawing and compositing. Every swing was graded against an arrival the player could not yet have seen, so an honest swing read LATE by 30–80ms against a ±35ms `good` window. An accuracy bug, not a difficulty one — and widening the windows would have buried it.

  **Fix: `medianOffset()` in `timing.ts`.** The game learns the latency from the running median of the player's own raw offsets (median so one abandoned swing cannot drag it), clamped to ±120ms, applied to arrival before grading. Settles in about eight swings, persists in `settings.timingOffsetMs`, manual slider and a Recalibrate button in Settings. The `cal ±NNms (n)` read-out under the timing bar is how you watch it converge — the yellow mark should stop drifting right.

  ✅ **Playtested 2026-08-13, after the fix: the timing is enjoyable.** Zane's own verdict, and it closes the 08-11 defect. The calibration was the whole of it.

  **What is still open:** whether ±12/±35/±80 are the right *widths* once the bias is gone. ±12ms perfect is tighter than most rhythm games' "perfect" and human timing on a telegraphed cue sits around ±20–30ms, so perfect may still be near-unreachable for the same reason the prototype's ±5ms was. **Play a few innings before touching the numbers** — the calibration may be the whole of it. If not, roughly ±22/±55/±110 is the next thing to try, in its own commit.

  Two things ruled out and worth not re-checking: `settings.pitchSpeed` already defaults to 0.75, so flight is slowed and difficulty was never coming from speed; and the windows scale by contact stat, where the dead-ball holdouts you start with run 1.25–1.35 — the *starting* lineup already had the widest windows in the game and still felt hard, which is what pointed at a bias rather than a width.
