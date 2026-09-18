/**
 * HOW A PLAYER LOOKS — the customization engine's data half, and the shells
 * that draw it until there is art.
 *
 * ⚠️ A LOOK IS DATA, NOT AN ASSET. A player does not have a picture; he has six
 * small numbers that say how to assemble one. Everything else here falls out of
 * that sentence, and it is what makes the whole league customizable at all:
 *
 *   - 780 men is ~25 kB of integers, so a look RIDES THE LEAGUE DOCUMENT that
 *     already exports and imports. Hand somebody a league and you hand them the
 *     faces too. A per-player PNG could never have done that.
 *   - Integers can be written by a script. `look` can be set across the whole
 *     league by rule — every Foundry club gets chassis frames and oxide tones —
 *     and then hand-corrected one man at a time in the editor.
 *   - A traded man keeps his face for free, because the look is on the player
 *     record and the player record is the thing that moves.
 *
 * ⚠️ `build` PICKS THE PART SET AND IS NOT A FIELD ON `Look`. `{ frame: 2 }` is
 * a body on a Holdout and a chassis on a Foundry man. That is the setting doing
 * the art direction rather than being painted on top of it, and it means new
 * content for a league the machines are taking over is PARTS ADDED TO THE
 * MACHINE SET — no schema change, no new code, no migration.
 *
 * ⚠️ THE LOOK IS PRESENTATION AND NEVER REACHES THE SIM. Rule 3 of this
 * codebase is that the engine replays from a seed. Nothing in here may be read
 * by a rating, a roll, a stat or a save the simulation replays from, and the
 * arrow between power and frame runs ONE WAY:
 *
 *      frame is derived FROM power.  power is NEVER derived from frame.
 *
 * A heavy man defaults to a heavy frame because that reads right. Editing him
 * lean must change nothing but the picture. Say it out loud, because "the big
 * guy should hit harder" is exactly the change somebody makes later without
 * noticing what it costs.
 *
 * ponytail: shells, not a sprite pipeline. Every part below is a path drawn in
 * code, which is the live path until somebody imports art — the same contract
 * sprites.ts already has, moved down a level so it applies PER PART instead of
 * per player. The runtime part library (IndexedDB, a file input, per-part
 * override) is the next commit and this file is the seam it plugs into.
 */
import type { Build, Look, Player } from '../core/roster.ts';
import type { Pitcher } from '../core/pitcher.ts';
import { makeRng, seedFromString } from '../core/rng.ts';
import { slug, tinted } from './art.ts';
import type { Team } from './teams.ts';

/** Re-exported so everything about looks can be imported from one place. */
export type { Look };

// ------------------------------------------------------------------ the kit

/**
 * WHAT A CLUB WEARS. Thirty of these dress 780 men, which is the whole reason
 * the uniform lives on the club and not on the player.
 *
 * ponytail: no road kit yet. You always see YOUR batter against THEIR pitcher,
 * so two different clubs' colours are already on screen at once and the thing a
 * road kit buys — telling the sides apart — is bought. Add `road` when somebody
 * wants a specific grey.
 */
export interface Uniform {
  /** The body of the kit — jersey. */
  primary: string;
  /** Sleeves and trousers. */
  secondary: string;
  /** Piping, the number, the cap's contrast. */
  trim: string;
}

/**
 * ⚠️ SIXTEEN KITS, AND A CLUB WITH NO `uniform` GETS ONE BY HASH OF ITS ABBR.
 *
 * So the entire league is dressed distinctly before anybody authors a single
 * one, `teams.ts` is untouched by this commit, and the editor can overwrite any
 * of them later. A random-colour generator was the other option and it is the
 * wrong one: sixteen hand-picked kits all look like baseball, and three random
 * hex values look like a test fixture.
 */
const KITS: readonly Uniform[] = [
  { primary: '#2f4f8a', secondary: '#d8dce0', trim: '#d8b44a' }, // navy / white / gold
  { primary: '#a8342c', secondary: '#d8dce0', trim: '#1a1d1c' }, // red / white / black
  { primary: '#1f6b44', secondary: '#d8dce0', trim: '#d8b44a' }, // green
  { primary: '#3a3f46', secondary: '#9aa2aa', trim: '#d8813a' }, // slate / orange
  { primary: '#6b2f6b', secondary: '#d8dce0', trim: '#c8c8c8' }, // purple
  { primary: '#0f3b52', secondary: '#4a8ba8', trim: '#d8dce0' }, // teal
  { primary: '#8a6a24', secondary: '#2a2420', trim: '#d8b44a' }, // bronze
  { primary: '#d8dce0', secondary: '#2f4f8a', trim: '#a8342c' }, // white / navy
  { primary: '#31403a', secondary: '#7a8580', trim: '#6fbf62' }, // slate green
  { primary: '#b5452a', secondary: '#e0d4b8', trim: '#3a2a1c' }, // rust / sand
  { primary: '#2a5c3a', secondary: '#c8cfc0', trim: '#d8b44a' }, // forest
  { primary: '#4a4a6b', secondary: '#c0c0d0', trim: '#d8813a' }, // steel blue
  { primary: '#7a1f2c', secondary: '#c8b89a', trim: '#d8dce0' }, // maroon / cream
  { primary: '#245c7a', secondary: '#d8dce0', trim: '#d8b44a' }, // ocean
  { primary: '#5c5c1f', secondary: '#d0d0b0', trim: '#2a2a1a' }, // olive
  { primary: '#4a4a52', secondary: '#9a9aa4', trim: '#c4574a' }, // graphite
];

/**
 * ⚠️ NOTHING IN A KIT MAY GO NEAR THE BACKSTOP'S OWN #101a12. The first cut had
 * a near-black and a graphite in this list and both produced a man you could
 * not see against the wall behind him — the figure was drawn correctly and was
 * simply invisible, which no test can fail on and a browser shows instantly.
 * Keep every `primary` well clear of the field colours in drawField().
 */

/** Hair, for the two crests that show any. Same rule as the kits above. */
const HAIR = ['#4a3626', '#2e2a28', '#6b5238', '#8a7a5c', '#3a3038'] as const;

/** The club's kit — its own, or the one its abbr hashes to. */
export const uniformFor = (team: Team): Uniform =>
  team.uniform ?? KITS[seedFromString(team.abbr) % KITS.length]!;

// ----------------------------------------------------------------- the look

/**
 * ⚠️ `Look` ITSELF IS DECLARED IN core/roster.ts, next to `Player`, and is
 * re-exported at the top of this file. Six numbers, about 30 bytes of JSON.
 * Every index is read against the part set `build` selects, so the same record
 * means different things on a human and on a machine — see PARTS below.
 */

/**
 * ⚠️ ONE PART SET PER BUILD, AND THIS IS WHERE THE SETTING LIVES.
 *
 * `frames` carries a width and a height multiplier rather than a count, because
 * the shells need the numbers and a count would be a second table to keep in
 * step with them. Everything else is a count or a palette.
 *
 * Adding a machine chassis is one entry in `frames` under `machine`. Nothing
 * else in the codebase changes, and every existing saved look stays valid
 * because indices only ever grow.
 */
/**
 * ⚠️ EVERY PART IS NAMED, AND THE NAME IS NOT DECORATION. The editor picks
 * parts by name — "vent stack", not "crest 2" — because a customization screen
 * that makes somebody guess what index 3 is is a debug form with a nicer font.
 * The stored value is still the INDEX: it survives a rename and it keeps a look
 * at thirty bytes.
 *
 * ⚠️ AN INDEX IS A PROMISE. Saved looks point into these lists, so entries may
 * be APPENDED and RENAMED freely and must never be REORDERED or REMOVED — that
 * silently redresses everybody pointing at the old position, in every league
 * anybody has ever exported.
 */
interface Frame {
  name: string;
  /** Scales shoulders. */
  w: number;
  /** Scales standing height. */
  h: number;
}

interface Tone {
  name: string;
  hex: string;
}

interface PartSet {
  frames: readonly Frame[];
  /** Head, face, optic array. */
  heads: readonly string[];
  /** Hair, visors, vents, antennae. */
  crests: readonly string[];
  /** Skin, or alloy. */
  tones: readonly Tone[];
}

const HUMAN_TONES: readonly Tone[] = [
  { name: 'fair', hex: '#e8c8a8' },
  { name: 'light', hex: '#d8a878' },
  { name: 'tan', hex: '#b88458' },
  { name: 'brown', hex: '#8a5c3a' },
  { name: 'deep', hex: '#5c3a24' },
  { name: 'dark', hex: '#3a2418' },
];

export const PARTS: Record<Build, PartSet> = {
  human: {
    frames: [
      { name: 'lean', w: 0.84, h: 0.96 },
      { name: 'average', w: 1.0, h: 1.0 },
      { name: 'thick', w: 1.18, h: 0.98 },
      { name: 'tall', w: 0.9, h: 1.09 },
      { name: 'squat', w: 1.1, h: 0.92 },
      { name: 'enormous', w: 1.3, h: 1.04 },
    ],
    heads: ['round', 'square', 'narrow'],
    crests: ['bare', 'cap', 'cap over hair', 'long hair', 'batting helmet'],
    tones: HUMAN_TONES,
  },
  augmented: {
    frames: [
      { name: 'wiry', w: 0.9, h: 1.0 },
      { name: 'braced', w: 1.06, h: 1.02 },
      { name: 'reinforced', w: 1.22, h: 1.0 },
      { name: 'lanky', w: 0.96, h: 1.12 },
      { name: 'grafted', w: 1.34, h: 1.06 },
    ],
    heads: ['round', 'square', 'narrow'],
    crests: ['half-visor', 'port', 'braced cap', 'plated crown'],
    tones: HUMAN_TONES,
  },
  machine: {
    frames: [
      { name: 'service chassis', w: 1.0, h: 1.0 },
      { name: 'heavy chassis', w: 1.2, h: 1.03 },
      { name: 'spire', w: 0.88, h: 1.14 },
      { name: 'foundry unit', w: 1.42, h: 1.08 },
    ],
    heads: ['optic slit', 'single lens'],
    crests: ['flat crown', 'vent stack', 'antenna', 'sensor rail'],
    tones: [
      { name: 'steel', hex: '#9aa2aa' },
      { name: 'chrome', hex: '#c0c4c8' },
      { name: 'gunmetal', hex: '#6a7078' },
      { name: 'brass', hex: '#8a7a5c' },
      { name: 'slate', hex: '#5c6068' },
    ],
  },
};

/** The four picked parts, in the order a screen should offer them. */
export const PART_KEYS = ['frame', 'head', 'crest', 'tone'] as const;
export type PartKey = (typeof PART_KEYS)[number];

/** What a build offers for one part, in index order — the editor's dropdown. */
export function partNames(build: Build, key: PartKey): readonly string[] {
  const set = partsFor(build);
  if (key === 'frame') return set.frames.map((f) => f.name);
  if (key === 'tone') return set.tones.map((t) => t.name);
  return key === 'head' ? set.heads : set.crests;
}

// ------------------------------------------------------- the art vocabulary

/**
 * ⚠️ TONE IS A COLOUR AND NOT A DRAWING, which is why it is missing here. A
 * frame, a head and a crest are shapes somebody can draw; skin and alloy are
 * one fill that those shapes are tinted against. A "tone part" would be a PNG
 * of a flat colour.
 */
export const ART_PARTS = ['frame', 'head', 'crest'] as const;
export type ArtPart = (typeof ART_PARTS)[number];

/** A part's address in the library. `machine/crest/1`. */
export const partId = (build: Build, part: ArtPart, index: number): string =>
  `${build}/${part}/${index}`;

const BUILDS_IN_ORDER = ['human', 'augmented', 'machine'] as const;

/**
 * WHICH PART A FILENAME MEANS — `machine-crest-vent-stack.png`.
 *
 * ⚠️ IT MATCHES ON THE PART'S NAME, NOT ITS INDEX. `machine-crest-1.png` is the
 * shorter convention and it is the wrong one: an index is an implementation
 * detail nobody drawing a vent stack should have to look up, and a file named
 * after the thing inside it still means something a year later. The names come
 * from PARTS above, which is the same list the editor's dropdown offers — so
 * what you picked in the select is what you call the file.
 *
 * Returns null when nothing matches, and the caller REPORTS that rather than
 * dropping it. A file that silently does nothing is the 09-03 bug — a control
 * that looks broken because the thing it did had no way to say so — in a new
 * screen.
 */
export function idForFilename(name: string): string | null {
  const s = slug(name);
  for (const build of BUILDS_IN_ORDER) {
    for (const part of ART_PARTS) {
      const prefix = `${build}-${part}-`;
      if (!s.startsWith(prefix)) continue;
      const want = s.slice(prefix.length);
      const at = partNames(build, part).findIndex((n) => slug(n) === want);
      if (at >= 0) return partId(build, part, at);
    }
  }
  return null;
}

/** Every slot a drawing could fill, for the screen that lists them. */
export const artSlots = (): readonly { id: string; file: string; label: string }[] =>
  BUILDS_IN_ORDER.flatMap((build) =>
    ART_PARTS.flatMap((part) =>
      partNames(build, part).map((name, i) => ({
        id: partId(build, part, i),
        file: `${build}-${part}-${slug(name)}.png`,
        label: `${build} ${part} — ${name}`,
      })),
    ),
  );

/** The set a player is drawn out of. */
export const partsFor = (build: Build): PartSet => PARTS[build];

/**
 * ⚠️ NOBODY AUTHORS 780. Rolled from the player's own stable id, so it is the
 * same face in every season, on every machine, forever, with NOTHING STORED —
 * which is what makes "the whole league is dressed" the default state rather
 * than a job somebody has to finish.
 *
 * A stored `look` wins outright. Absent means roll. That is the whole override
 * rule, and it is why bulk authoring and hand-editing compose instead of
 * fighting: the bulk case is no data at all.
 *
 * ⚠️ IT READS THE PLAYER AND NOT THE CLUB. A traded man has to look the same on
 * his new club, so nothing here may depend on where he currently plays — the
 * uniform is the club's half and it is applied at DRAW time, not baked in here.
 */
export function lookFor(p: Player): Look {
  if (p.look) return p.look;
  // Power and speed bias the silhouette.
  // ⚠️ ONE WAY ONLY. See the file header. This reads power; nothing reads back.
  const heft = Math.max(0, Math.min(1, (p.power - 0.6) / 1.2 + (1.3 - p.speed) * 0.2));
  return rollLook(p.id, p.build, heft);
}

/**
 * THE MAN ON THE MOUND. Three ways to answer, and they are tried in that order.
 *
 * ✅ **HE HAS HIS OWN RECORD NOW — 2026-09-17.** The note that used to live here
 * said `Pitcher` carried neither an `id` nor a `build`, that both had to be
 * borrowed, and that it made this the one look in the game that depends on the
 * club — so a traded arm changed species. `Pitcher` carries all three fields
 * today and this reads them:
 *
 *   his look   somebody chose it in the editor. Wins outright, as it does for a
 *              hitter. This is the half that did not exist at all before.
 *   his build  his own, if he has one. Falls back to his CLUB's modal build via
 *              clubBuild() — right for an arm nobody has opened, because an
 *              Albany Holdouts arm has to be a holdout and rolling it off the
 *              name would put a robot in the last human league.
 *   his seed   his own id, if he has one. Falls back to his NAME, which is
 *              league-wide unique and is the exact roll every arm has had since
 *              the feature shipped.
 *
 * ⚠️ THE FALLBACKS ARE NOT TIDINESS, THEY ARE THE COMPATIBILITY CONTRACT. Every
 * league anybody has exported before today has arms with no id and no build. All
 * of them still open, and every one of those men still turns up wearing the same
 * face he has always worn. Do not make either field required.
 *
 * ⚠️ AND THE CLUB FALLBACK IS STILL A CLUB DEPENDENCE, which lookFor() forbids
 * for hitters. It is narrower than it was — it now only reaches an arm nobody
 * has dressed — but a man traded between a holdout club and a foundry club will
 * still change species until somebody opens him in the editor and picks one.
 * That is the honest cost of `build` being optional, and it is the right trade:
 * the alternative is refusing to load every league that exists.
 */
export function lookForArm(arm: Pitcher, team: Team): Look {
  if (arm.look) return arm.look;
  return rollLook(arm.id ?? arm.name, armBuild(arm, team), 0.45);
}

/**
 * WHICH PART SET AN ARM IS DRAWN FROM, and it exists so that it cannot
 * disagree with lookForArm().
 *
 * ⚠️ THE LOOK AND THE BUILD ARE ONE ANSWER, NOT TWO. drawFigure() takes them as
 * separate fields, so every call site that rolled the look one way and the build
 * another was one edit away from a machine-indexed look drawn out of the human
 * parts — a man with `crest: 3` out of a list of two, silently clamped to
 * something nobody picked. Three call sites in main.ts passed `clubBuild(club)`
 * next to a `lookForArm()` that now reads the arm's OWN build. Both go through
 * here instead.
 */
export const armBuild = (arm: Pitcher, team: Team): Build => arm.build ?? clubBuild(team);

/**
 * A MAN WITH NO RECORD ANYWHERE — the catcher, and every baserunner the overhead
 * replay knows only as a bag number.
 *
 * ⚠️ THIS EXISTS BECAUSE THE OLD TRICK BECAME A BUG. Both call sites used to
 * build a fake Pitcher — `{ ...currentPitcher(game), name: 'DET-catcher' }` —
 * and hand it to lookForArm(), which was harmless while `Pitcher` held nothing
 * but ratings and a name. The moment an arm could carry a stored `look`, that
 * spread copied the pitcher's chosen face onto his own catcher and onto every
 * runner on the field: nine men wearing one face, and only for clubs somebody
 * had bothered to customize.
 *
 * Scenery gets its own door. No record is spread, so nothing can leak through
 * it, and the seed is plainly what it is — a string.
 */
export function lookForExtra(seed: string, team: Team): Look {
  return rollLook(seed, clubBuild(team), 0.45);
}

/** What this club mostly is — the modal build of its nine. */
export function clubBuild(team: Team): Build {
  const count: Record<Build, number> = { human: 0, augmented: 0, machine: 0 };
  for (const p of team.lineup) count[p.build]++;
  let best: Build = 'human';
  for (const b of ['human', 'augmented', 'machine'] as const) {
    if (count[b] > count[best]) best = b;
  }
  return best;
}

/**
 * The roll itself. `heft` in 0..1 slides along the frame list, which is ordered
 * lean → huge, so the bias is a position rather than a lookup table.
 */
function rollLook(seedText: string, build: Build, heft: number): Look {
  const set = partsFor(build);
  const rng = makeRng(seedFromString(seedText));
  const span = set.frames.length - 1;
  // Two thirds from the biased position, one third rolled, so a slugger is
  // usually big and occasionally is not.
  const frame = Math.max(
    0,
    Math.min(span, Math.round(heft * span * 0.72 + rng.next() * span * 0.34)),
  );
  return {
    frame,
    head: rng.int(0, set.heads.length - 1),
    crest: rng.int(0, set.crests.length - 1),
    tone: rng.int(0, set.tones.length - 1),
    number: rng.int(1, 99),
    wear: rng.next(),
  };
}

/**
 * Clamp a look to the part sets it is drawn against.
 *
 * ⚠️ WHY IT EXISTS: an imported league, a hand-edited JSON document or a look
 * saved before a part set shrank can all carry an index nobody has a part for.
 * Every draw goes through here, so the worst an illegal look can do is pick the
 * wrong part — never throw in the middle of a pitch.
 */
export function safeLook(look: Look, build: Build): Look {
  const set = partsFor(build);
  const fit = (v: unknown, n: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(n - 1, Math.floor(v))) : 0;
  return {
    frame: fit(look.frame, set.frames.length),
    head: fit(look.head, set.heads.length),
    crest: fit(look.crest, set.crests.length),
    tone: fit(look.tone, set.tones.length),
    number: Math.max(0, Math.min(99, Math.floor(Number(look.number) || 0))),
    wear: Math.max(0, Math.min(1, Number(look.wear) || 0)),
  };
}

// --------------------------------------------------------------- the shells

/** What a figure is doing. Three, not an animation — see the ⚠️ below. */
export type Stance = 'bat' | 'pitch' | 'crouch';

export interface FigureOpts {
  look: Look;
  uniform: Uniform;
  build: Build;
  /** Feet, or the seat of a crouch. */
  x: number;
  y: number;
  /** Standing height in canvas units. The whole body is drawn in fractions. */
  h: number;
  stance: Stance;
  /** Radians of turn about the feet — the swing opens him up. */
  turn?: number;
  /** Mirror about x. A left-handed batter is the same man, flipped. */
  flip?: boolean;
}

/**
 * DRAW ONE MAN.
 *
 * ⚠️ THREE STANCES, NOT AN ANIMATION, and that is deliberate rather than
 * unfinished. swing.ts already rotates a real bat through a real arc and
 * main.ts already draws it; a body that turns with `turn` under a bat that
 * sweeps is most of what motion buys, at none of the cost of a frame sheet.
 * Add frames when three stances read as stiff IN PLAY, not in imagination.
 *
 * ⚠️ EVERY DIMENSION IS A FRACTION OF `h`. One geometry serves the 96px batter,
 * the 38px pitcher and the crouched catcher, which is the only reason there is
 * one of these functions instead of three.
 *
 * ⚠️ COLOUR IS APPLIED AT DRAW TIME, NEVER BAKED. That is the seam the art
 * layer plugs into: a part arrives greyscale and gets tinted to the club's kit
 * here, so ONE cap drawing serves all thirty clubs. It is also why the whole
 * league needs ~50 drawings rather than 780.
 */
export function drawFigure(ctx: CanvasRenderingContext2D, o: FigureOpts): void {
  const look = safeLook(o.look, o.build);
  const set = partsFor(o.build);
  const f = set.frames[look.frame]!;
  const tone = set.tones[look.tone]!.hex;
  const u = o.uniform;
  const machine = o.build === 'machine';

  const h = o.h * f.h;
  // ⚠️ A CROUCH IS WIDE, NOT TALL, and it needs the extra on this canvas more
  // than anywhere: the catcher has a 26-pixel band between home plate and the
  // delivery bar to exist in, so width is the only axis left for him to read
  // on. At the first cut's 0.26 he was a speck.
  const w = h * (o.stance === 'crouch' ? 0.44 : 0.30) * f.w;

  ctx.save();
  ctx.translate(o.x, o.y);
  if (o.flip) ctx.scale(-1, 1);

  // A crouch folds the legs away and drops everything. One number, applied to
  // the two heights that matter, rather than a second set of proportions.
  const crouch = o.stance === 'crouch';
  const legTop = crouch ? -h * 0.18 : -h * 0.46;
  const torsoTop = crouch ? -h * 0.62 : -h * 0.80;
  // ⚠️ THE HEAD IS DAMPED AGAINST THE FRAME, NOT SCALED WITH IT. At a flat
  // h * 0.115 the head was 77% of the shoulder width — a bobblehead — and worse,
  // it ignored `f.w` entirely, so `enormous` widened the body and left the head
  // alone. Two faults with one cause: the one dimension that says "big man" was
  // the only one the frame could not reach.
  //
  // 0.6 + 0.4 * f.w grows the head by 12% across the frame list while the
  // shoulders grow by 55%, so a slugger reads as heavy rather than as the same
  // man drawn wider. Full `f.w` here would put `enormous` back above the old
  // flat number and undo the fix.
  const headR = h * 0.095 * (0.6 + 0.4 * f.w);
  // Lifted clear of the shoulders rather than resting on them, so the dark
  // backstop shows through as a neck and the head stops reading as the top of
  // the torso. On a machine under a vent stack it was one unbroken column.
  const headY = torsoTop - headR * 1.15;

  const box = (x: number, y: number, bw: number, bh: number, fill: string): void => {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, bw, bh);
  };

  /**
   * ⚠️ THE ART SEAM, AND EVERY PART GOES THROUGH IT. A drawing replaces the
   * shape below it and inherits the same box, the same anchor and the same
   * tint — so importing a cap changes one part of one build and nothing else
   * moves. `false` means there is no art and the shell should draw, which is
   * the state the game ships in and the one it must be complete in.
   *
   * Scaled to the box's WIDTH with the aspect ratio kept, and anchored at the
   * bottom: a taller drawing of a torso grows upward rather than sinking
   * through the legs, which is the same rule sprites.ts settled on.
   */
  const art = (part: ArtPart, index: number, cx: number, bottom: number, bw: number, colour: string): boolean => {
    const img = tinted(partId(o.build, part, index), colour);
    if (!img) return false;
    const iw = (img as { width: number }).width || 1;
    const ih = (img as { height: number }).height || 1;
    const k = bw / iw;
    ctx.drawImage(img, cx - bw / 2, bottom - ih * k, bw, ih * k);
    return true;
  };

  // ---- the shadow. ⚠️ ONE ELLIPSE, AND IT IS MOST OF WHY HE READS AS STANDING
  // ON SOMETHING. Without it every figure floats against a flat backstop, which
  // was the first thing wrong with these in a browser and is invisible in any
  // test that could be written for them.
  if (!crouch) {
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.62, h * 0.035, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- legs. Two of them, so a turn reads as a stance and not as a slab.
  //
  // ⚠️ A MACHINE'S LEGS ARE ALLOY, NOT TROUSERS. Painting them the club's
  // secondary made the brightest thing on screen a pair of white stilts under a
  // robot, which is the one place the kit should stop and the chassis start.
  const legW = w * 0.34;
  const legFill = machine ? tone : u.secondary;
  box(-w * 0.44, legTop, legW, -legTop, legFill);
  box(w * 0.1, legTop, legW, -legTop, legFill);

  // ---- ⚠️ THE TURN STARTS HERE, AT THE BELT, AND NOT AT THE FEET.
  //
  // `rotate` used to sit up with the translate, which pivoted the whole man
  // about his shoes. At the pose table's 24° finish that is a 96px lever: he
  // leaned bodily out of the batter's box like a felled tree instead of turning
  // on himself, and the taller the figure the worse it got.
  //
  // A swing is hips and shoulders over planted feet, so the legs and the shadow
  // are drawn BEFORE this and stay where they are. Everything above — torso,
  // number, arms, mitt, bat, head, crest — turns about the belt, which is the
  // same lever a real one has and about half the travel at the head.
  if (o.turn) {
    ctx.translate(0, legTop);
    ctx.rotate(o.turn);
    ctx.translate(0, -legTop);
  }

  // ---- torso. Square on a machine, shouldered on a person. A `frame` drawing
  // replaces the whole body — it is the part that carries the jersey, so it is
  // tinted to the club's primary.
  const torsoH = legTop - torsoTop;
  /**
   * ⚠️ THE JERSEY HANGS PAST THE BELT BY EXACTLY WHAT THE TURN OPENS UP. Now
   * that the body pivots at legTop, the torso's bottom corner swings ABOVE the
   * legs and a wedge of backstop shows through at the waist — a seam that grows
   * with the swing and is worst at the pose the eye stops on.
   *
   * (w / 2) * sin(turn) is how far that corner lifts, so this is the gap and not
   * a guess at it. It is zero at rest, which is why it costs the standing figure
   * nothing: `torsoH` is still measured to the belt, so the number, the arms and
   * the chassis seam do not move either.
   */
  const hem = legTop + (w / 2) * Math.sin(Math.abs(o.turn ?? 0));
  const drawnFrame = art('frame', look.frame, 0, hem, w * 1.12, u.primary);
  if (drawnFrame) {
    // nothing: the drawing is the torso.
  } else if (machine) {
    box(-w / 2, torsoTop, w, hem - torsoTop, u.primary);
    // The chassis seam — one line, and it is most of what says "not a person".
    box(-w / 2, torsoTop + torsoH * 0.42, w, Math.max(1, h * 0.02), u.trim);
  } else {
    ctx.fillStyle = u.primary;
    ctx.beginPath();
    ctx.moveTo(-w / 2, hem);
    ctx.lineTo(-w * 0.44, torsoTop + torsoH * 0.16);
    ctx.quadraticCurveTo(0, torsoTop - torsoH * 0.04, w * 0.44, torsoTop + torsoH * 0.16);
    ctx.lineTo(w / 2, hem);
    ctx.closePath();
    ctx.fill();
  }

  // ---- augmented plating: one squared shoulder over a human silhouette, which
  // is the cheapest thing that reads as "half of him is hardware".
  if (o.build === 'augmented') {
    box(w * 0.16, torsoTop + torsoH * 0.06, w * 0.34, torsoH * 0.34, '#9aa2aa');
  }

  // ---- the number, on the back. ⚠️ ONLY ON A FIGURE BIG ENOUGH TO READ IT.
  // The gate was 40, which let the 42px pitcher through, and two digits across
  // a twelve-pixel chest is noise that looks like a glyph bug.
  //
  // ⚠️ IT GATES ON THE GLYPH SIZE, WHICH IS WHAT LEGIBILITY ACTUALLY IS. The
  // old `h > 60` was this measurement in disguise and its threshold landed in
  // the middle of the mound figure's own range: `h` carries the frame's height
  // multiplier, so at the mound's 58 a `spire` arm is 66 tall and was let
  // through while a `service chassis` beside him was not — the same pitcher's
  // number appearing or vanishing on a roll nobody can see.
  //
  // 14px is clear of every batter (the leanest draws at 16) and clear of every
  // arm (the tallest draws at 11), so no frame multiplier can reach across the
  // gap. Gating on `w` instead does not work, and the reason is worth keeping:
  // the number's width and the chest's width are both linear in `h`, so their
  // ratio is the frame's and a wide pitcher passes any width test a wide batter
  // does.
  const numFont = Math.round(h * 0.17);
  if (numFont >= 14 && look.number > 0) {
    ctx.fillStyle = u.trim;
    ctx.font = `${numFont}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.save();
    if (o.flip) ctx.scale(-1, 1);
    ctx.fillText(String(look.number), 0, torsoTop + torsoH * 0.55);
    ctx.restore();
  }

  // ---- arms. One forward on a bat or a crouch, both down on the mound.
  const armW = w * 0.22;
  const skin = machine ? '#8a9098' : tone;
  if (o.stance === 'pitch') {
    box(-w / 2 - armW * 0.6, torsoTop + torsoH * 0.2, armW, torsoH * 0.7, skin);
    box(w / 2 - armW * 0.4, torsoTop + torsoH * 0.2, armW, torsoH * 0.7, skin);
  } else {
    box(w * 0.3, torsoTop + torsoH * 0.18, armW, torsoH * 0.55, skin);
  }

  // ---- the mitt. A crouched man with nothing in his hand is a man squatting.
  if (crouch) {
    ctx.fillStyle = '#5a3a1c';
    ctx.beginPath();
    ctx.arc(w * 0.52, torsoTop + torsoH * 0.5, h * 0.15, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- THE BAT, and he has to be holding one even standing still.
  //
  // ⚠️ THE FIRST CUT DREW HIM EMPTY-HANDED. main.ts only draws a barrel once a
  // swing is in flight, so between pitches there was a man at the plate with
  // nothing in his hands — which reads as a bug rather than as a hitter, and is
  // the kind of thing only playing it finds.
  //
  // ponytail: a line at a fixed angle off the hands, not swing.ts's pose table.
  // That table is authored against the roguelike's 640-wide canvas and its own
  // plate origin; borrowing its geometry would mean rescaling five keyframes to
  // draw a stick. The BODY still turns off `turn`, so the bat turns with him and
  // the two cannot drift.
  if (o.stance === 'bat') {
    const hx = w * 0.42;
    const hy = torsoTop + torsoH * 0.3;
    ctx.strokeStyle = '#c8a05a';
    ctx.lineWidth = Math.max(1.5, h * 0.035);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    // Up and BACK over the shoulder, which is where a bat at rest is. Forward
    // put the barrel across the strike zone from the camera's side of it, and a
    // bat lying over the zone reads as a rendering fault rather than a stance.
    ctx.lineTo(hx - h * 0.07, hy - h * 0.42);
    ctx.stroke();
  }

  // ---- head. Tinted to his TONE rather than to the kit — a face is skin or
  // alloy, and a head that took the jersey colour would be a green man.
  const drawnHead = art('head', look.head, 0, headY + headR, headR * 2.1, tone);
  if (drawnHead) {
    // nothing: the drawing is the head.
  } else if (machine) {
    box(-headR, headY - headR, headR * 2, headR * 2, tone);
    // The optic: a slit, or a single lens.
    ctx.fillStyle = '#c4574a';
    if (look.head === 0) box(-headR * 0.75, headY - headR * 0.25, headR * 1.5, headR * 0.42, '#c4574a');
    else {
      ctx.beginPath();
      ctx.arc(0, headY, headR * 0.38, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // ⚠️ `look.head` USED TO DO NOTHING HERE. Only the machine branch above read
    // it; every other build fell through to one circle, so the editor offered
    // round / square / narrow and all three drew the same head. A third of the
    // customization surface was a dropdown that moved no pixels — and the robots
    // had more face than the people, which is the wrong way round.
    ctx.fillStyle = tone;
    ctx.beginPath();
    if (look.head === 1) {
      // Square: a jaw, not a machine's box. The corner radius is what keeps it
      // on the human side of the line the chassis above already holds.
      ctx.roundRect(-headR, headY - headR, headR * 2, headR * 2, headR * 0.34);
    } else if (look.head === 2) {
      ctx.ellipse(0, headY, headR * 0.76, headR * 1.1, 0, 0, Math.PI * 2);
    } else {
      ctx.ellipse(0, headY, headR, headR, 0, 0, Math.PI * 2);
    }
    ctx.fill();
    drawFace(ctx, headY, headR);
  }

  // ---- crest. The part that most says which league he belongs to, and the one
  // an art pack will show up in first — a cap takes the club's primary, which
  // is what makes one drawing serve all thirty.
  //
  // Hair rides the tone index, so a man's hair and his skin are picked together
  // rather than by two independent rolls that can disagree.
  if (!art('crest', look.crest, 0, headY + headR * 0.3, headR * 2.6, u.primary)) {
    drawCrest(ctx, o.build, look.crest, headY, headR, u, machine, HAIR[look.tone % HAIR.length]!);
  }

  // ---- wear. Free variation, and the one field nobody will ever want to edit.
  if (look.wear > 0.45 && h > 40) {
    ctx.fillStyle = machine ? 'rgba(120,70,30,0.35)' : 'rgba(40,30,20,0.30)';
    const n = Math.round(look.wear * 4);
    for (let i = 0; i < n; i++) {
      const wy = legTop + (torsoTop - legTop) * 0.1 * i;
      ctx.fillRect(-w * 0.4 + ((i * 37) % Math.max(1, w * 0.7)), wy, w * 0.16, h * 0.03);
    }
  }

  ctx.restore();
}

/**
 * AN EYE AND A MOUTH. The smallest thing that turns a tone-filled shape into a
 * person, and the reason `head` was worth making mean something.
 *
 * ⚠️ ONE EYE, BECAUSE THE FIGURE IS IN PROFILE. The cap's brim points +x and so
 * does the bat, the forward arm and the mitt — he is drawn side-on facing the
 * mound. A second eye would sit on the side of his head the camera cannot see.
 *
 * ⚠️ IT SITS BELOW THE BRIM LINE ON PURPOSE. A cap's brim runs from headY-0.22r
 * to headY+0.12r and is drawn AFTER this, so an eye any higher is painted over
 * and half the league looks faceless again. Low is also simply where an eye is
 * under a cap.
 *
 * ⚠️ MACHINES DO NOT COME HERE. Their optic is the face and it is drawn with the
 * head, because on a chassis the lens IS the feature rather than a mark on one.
 *
 * Below headR 5 the eye would be a sub-pixel smudge, so it is dropped — the same
 * gate the number and the wear marks already use, at the size a head needs.
 */
function drawFace(ctx: CanvasRenderingContext2D, headY: number, headR: number): void {
  if (headR < 5) return;
  ctx.fillStyle = 'rgba(28,22,18,0.82)';
  ctx.beginPath();
  // Well forward of centre. At 0.38 it sat near the middle of the head and read
  // as a nostril; an eye in profile belongs close to the front of the face, and
  // 0.45 is as far as `narrow` (rx 0.76r) will take it and still be on the head.
  ctx.arc(headR * 0.45, headY + headR * 0.18, Math.max(1, headR * 0.18), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(headR * 0.26, headY + headR * 0.56, headR * 0.44, Math.max(1, headR * 0.12));
}

/**
 * Hair, helmet, visor, antenna, vent stack. Split out because it is the part
 * with the most entries and the most future — it is where an art pack will
 * show up first, and a fat switch inside drawFigure would bury the body.
 */
function drawCrest(
  ctx: CanvasRenderingContext2D,
  build: Build,
  crest: number,
  headY: number,
  r: number,
  u: Uniform,
  machine: boolean,
  hair: string,
): void {
  const cap = (fill: string): void => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(0, headY, r * 1.06, Math.PI, 0);
    ctx.fill();
    // The brim, pointing where he is facing.
    ctx.fillRect(0, headY - r * 0.22, r * 1.7, r * 0.34);
  };

  // ⚠️ THE THIN DIMENSIONS ARE FLOORED AT A PIXEL. An antenna is 0.18r wide,
  // which on the man on the mound is 0.99px — the browser draws that as a faint
  // smear or as nothing, so the crest that says which club he pitches for was
  // invisible on the one figure you stare at for a whole at-bat. Every other
  // sub-pixel risk in this file is already floored the same way; these were the
  // ones nobody had drawn small enough to notice.
  const px = (v: number): number => Math.max(1, v);

  if (machine) {
    switch (crest) {
      case 0:
        ctx.fillStyle = u.primary;
        ctx.fillRect(-r * 1.1, headY - r * 1.35, r * 2.2, px(r * 0.42));
        break;
      case 1: // vent stack
        ctx.fillStyle = u.trim;
        for (let i = 0; i < 3; i++) ctx.fillRect(-r * 0.8 + i * r * 0.62, headY - r * 1.7, px(r * 0.3), r * 0.75);
        break;
      case 2: // antenna
        ctx.fillStyle = u.trim;
        ctx.fillRect(-r * 0.09, headY - r * 2.2, px(r * 0.18), r * 1.2);
        break;
      default: // sensor rail
        ctx.fillStyle = u.primary;
        ctx.fillRect(-r * 1.25, headY - r * 1.2, r * 2.5, px(r * 0.3));
        break;
    }
    return;
  }

  if (build === 'augmented') {
    switch (crest) {
      case 0: // half-visor
        ctx.fillStyle = '#7a9ed8';
        ctx.fillRect(-r * 0.2, headY - r * 0.4, r * 1.2, r * 0.44);
        break;
      case 1: // port
        ctx.fillStyle = '#9aa2aa';
        ctx.beginPath();
        ctx.arc(-r * 0.6, headY - r * 0.1, r * 0.3, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 2:
        cap(u.primary);
        ctx.fillStyle = '#9aa2aa';
        ctx.fillRect(-r * 1.1, headY - r * 0.5, r * 0.4, r * 0.9);
        break;
      default: // plated crown
        cap('#9aa2aa');
        break;
    }
    return;
  }

  switch (crest) {
    case 0:
      break; // bare
    case 1:
      cap(u.primary);
      break;
    case 2: // cap over hair
      ctx.fillStyle = hair;
      ctx.beginPath();
      ctx.arc(0, headY + r * 0.12, r * 1.02, Math.PI * 0.9, Math.PI * 2.1);
      ctx.fill();
      cap(u.primary);
      break;
    case 3: // long hair
      ctx.fillStyle = hair;
      ctx.beginPath();
      ctx.arc(0, headY, r * 1.12, Math.PI, 0);
      ctx.fill();
      // ⚠️ IT HANGS DOWN THE BACK, NOT ACROSS THE FACE. The full-width slab this
      // replaces ran to +1.12r and buried the eye and the mouth under it, so one
      // crest in five drew a man with his face painted out. He is in profile and
      // his back is -x, which is the only side hair belongs on.
      ctx.fillRect(-r * 1.12, headY, r * 0.72, r * 1.1);
      break;
    default: // batting helmet — the trim wraps it, which is what makes it read
      cap(u.primary);
      ctx.fillStyle = u.trim;
      ctx.fillRect(-r * 1.06, headY - r * 0.14, r * 2.12, px(r * 0.16));
      break;
  }
}
