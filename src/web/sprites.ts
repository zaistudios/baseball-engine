/**
 * THE ASSET LAYER. Every drawn thing is a shell until a PNG replaces it.
 *
 * The brief: "each player represented is a shell during this development. When
 * I have 20 different batter assets I want easily put them in."
 *
 * So the install step for an asset is DROPPING A FILE IN A FOLDER. There is no
 * manifest to edit, no import to add, no id to register, and no build step to
 * re-run beyond the one that already exists. `assets/batters/cap-mullaney.png`
 * appears and Cap Mullaney stops being a rectangle.
 *
 * ------------------------------------------------------------------ how
 *
 * `import.meta.glob` reads the folders at BUILD time, so the bundle contains
 * exactly the assets on disk and nothing has to be fetched at run time. With no
 * files present the record is empty, every lookup returns null, and every draw
 * site falls back to the shape it drew before — which is why this can land
 * before any art exists and change nothing on screen.
 *
 * ---------------------------------------------------- two hard constraints
 *
 * 1. THE OFFLINE FILE HAS NO SECOND FILE TO LOAD. `npm run demo` folds the
 *    game into one html opened by double-click from a file:// origin, and
 *    scripts/bundle.mjs THROWS if the build emitted more than one asset. So
 *    vite.config.ts forces `assetsInlineLimit` to inline everything as a
 *    data: URI. An image that stays external would break the demo build
 *    loudly rather than silently shipping a game full of missing sprites.
 *
 * 2. ASSETS LOAD ASYNC AND THE GAME DRAWS AT 60Hz. `sprite()` returns null
 *    until the image has decoded, so the first frames of a session may draw
 *    shells even for art that exists. That is correct and invisible — it is
 *    the same fallback path, taken for a few milliseconds.
 *
 * ------------------------------------------------------------------ sizing
 *
 * NOTHING HERE READS A PIXEL DIMENSION FROM A CONFIG. Each kind of sprite
 * declares a target height in game units and the image is scaled to it with
 * its aspect ratio preserved. A 32px batter and a 512px batter both land the
 * right size in the box, which is the difference between "drop the file in"
 * and "drop the file in and then go and tune four numbers".
 */

import type { Hand } from '../core/hit.ts';

/**
 * Every folder under assets/ that the game knows how to read.
 *
 * ponytail: a flat union, not a plugin system. Adding a kind is one entry
 * here, one entry in SPRITE_SPECS, and one call at the draw site.
 */
export type SpriteKind = 'batters' | 'pitchers' | 'ball' | 'field' | 'fielders';

export interface SpriteSpec {
  /**
   * Height in canvas units. The image is scaled to this and its width follows
   * from its own aspect ratio, so the art can be any resolution.
   */
  height: number;
  /**
   * Where the sprite's origin sits inside its own box.
   *
   * 'feet' is bottom-centre and is what every standing figure wants — a batter
   * is positioned by where he stands, and a taller drawing of him should grow
   * upward out of the box rather than sink through the dirt.
   */
  anchor: 'feet' | 'centre';
}

export const SPRITE_SPECS: Record<SpriteKind, SpriteSpec> = {
  batters: { height: 92, anchor: 'feet' },
  pitchers: { height: 46, anchor: 'feet' },
  ball: { height: 16, anchor: 'centre' },
  field: { height: 480, anchor: 'centre' },
  fielders: { height: 14, anchor: 'feet' },
};

/**
 * The filename a human would write, from a name a human would say.
 *
 * `UNIT-7 "Cletus"` becomes `unit-7-cletus`. Punctuation and case are the two
 * things nobody gets right twice in a row, so neither is allowed to matter.
 */
export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * The catch-all filename. `assets/batters/_default.png` dresses every batter
 * without a file of his own.
 *
 * ⚠️ IT IS A SENTINEL AND IT MUST NOT BE SLUGGED. `slug('_default')` is
 * `default` — the underscore is not [a-z0-9], so it becomes a hyphen and then
 * gets stripped as leading punctuation. That bit once: the index stored
 * `batters/default` while every lookup asked for `batters/_default`, so a
 * `_default.png` sitting right there in the folder was counted, served, and
 * never drawn. Both sides go through `indexKey`/`spriteKeys` now and both
 * special-case this exact string.
 */
export const DEFAULT_KEY = '_default';

/**
 * The lookup key for a file on disk. The other half of `spriteKeys`, and the
 * two have to agree or nothing ever resolves.
 */
export function indexKey(kind: string, filename: string): string {
  const bare = filename.replace(/\.[^.]+$/, '');
  const key = bare.toLowerCase() === DEFAULT_KEY ? DEFAULT_KEY : slug(bare);
  return `${kind}/${key}`;
}

/**
 * The filenames that would satisfy this lookup, best first.
 *
 * BOTH THE ID AND THE NAME WORK, and that is deliberate. Player ids are
 * `hu1`, `au3`, `ma2` — fine for code and hostile to a human sorting twenty
 * PNGs in a folder. So `cap-mullaney.png` resolves, and `hu1.png` also
 * resolves for anyone who prefers the stable key.
 *
 * `_default` is last and is the reason one file can dress the whole roster:
 * drop a single `assets/batters/_default.png` and every batter uses it until
 * a more specific file outranks it.
 */
export function spriteKeys(id?: string, name?: string): string[] {
  const keys: string[] = [];
  if (id) keys.push(slug(id));
  if (name) keys.push(slug(name));
  keys.push(DEFAULT_KEY);
  return keys;
}

/**
 * Scale factor that makes an image the spec's height, and the box it lands in.
 *
 * Guards a zero-height image rather than returning Infinity — a broken or
 * still-decoding image must draw nothing, never a division by zero smeared
 * across the canvas.
 */
export function fitBox(
  imgW: number,
  imgH: number,
  spec: SpriteSpec,
): { w: number; h: number } {
  if (imgW <= 0 || imgH <= 0) return { w: 0, h: 0 };
  const k = spec.height / imgH;
  return { w: imgW * k, h: spec.height };
}

/** Top-left corner for a sprite of this size drawn at (x, y) under this anchor. */
export function anchorAt(
  x: number,
  y: number,
  w: number,
  h: number,
  anchor: SpriteSpec['anchor'],
): { x: number; y: number } {
  return anchor === 'feet' ? { x: x - w / 2, y: y - h } : { x: x - w / 2, y: y - h / 2 };
}

// ------------------------------------------------------------------ loading

/**
 * Every PNG under assets/, keyed by its path, resolved to a URL at build time.
 *
 * The `**` matters: `assets/batters/holdouts/cap.png` is found too, so the
 * folders can be organised however makes sense later without touching this.
 *
 * Vite rewrites this to a plain object literal, so an empty assets/ tree costs
 * one empty object and no runtime work at all.
 */
const FILES: Record<string, string> = import.meta.glob('/assets/**/*.{png,gif,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** kind/key -> url, built once from the glob. */
const INDEX = new Map<string, string>();
for (const [path, url] of Object.entries(FILES)) {
  // /assets/<kind>/<...>/<name>.png  ->  "<kind>/<name>"
  const parts = path.split('/').filter(Boolean);
  const kind = parts[1];
  const file = parts[parts.length - 1];
  if (kind && file) INDEX.set(indexKey(kind, file), url);
}

const cache = new Map<string, HTMLImageElement | null>();

/**
 * Start decoding an image, and remember it.
 *
 * A failed load is cached as null rather than retried, so a corrupt file costs
 * one console warning and then draws the shell forever instead of hammering
 * the loader every frame for the rest of the session.
 */
function load(cacheKey: string, url: string): void {
  cache.set(cacheKey, null);
  // No DOM, no decoding — this module is imported by a node test suite, and
  // "there is no Image constructor here" is the same answer as "the art has
  // not loaded yet", which every call site already handles.
  if (typeof Image === 'undefined') return;
  const img = new Image();
  img.onload = () => cache.set(cacheKey, img);
  img.onerror = () => {
    cache.set(cacheKey, null);
    console.warn(`[sprites] could not decode ${url} — drawing the shell instead`);
  };
  img.src = url;
}

/**
 * The image for this thing, or null if there is no asset for it yet.
 *
 * Null is the normal case during development and the caller's cue to draw its
 * shell. It is never an error.
 */
export function sprite(kind: SpriteKind, id?: string, name?: string): HTMLImageElement | null {
  for (const key of spriteKeys(id, name)) {
    const cacheKey = `${kind}/${key}`;
    if (cache.has(cacheKey)) {
      const hit = cache.get(cacheKey);
      if (hit) return hit;
      // Cached null means "loading, or known bad" — fall through to the next
      // candidate so a missing `hu1.png` still reaches `_default.png`.
      continue;
    }
    const url = INDEX.get(cacheKey);
    if (!url) continue;
    load(cacheKey, url);
    return null;
  }
  return null;
}

/** How many assets the build found. Reported on the title screen in dev. */
export const assetCount = (): number => INDEX.size;

/** Every filename the build actually picked up, for the dev report. */
export const foundKeys = (): string[] => [...INDEX.keys()].sort();

/** Is there a file behind this exact key? `kind/name`, already slugged. */
export const hasAsset = (key: string): boolean => INDEX.has(key);

// ------------------------------------------------------------------ drawing

export interface DrawOpts {
  /** Mirror horizontally about (x). Left-handed batters, and nothing else yet. */
  flip?: boolean;
  /** Radians, about the anchor point. Small body rotations during a swing. */
  rotate?: number;
  /** Multiplies the spec height. For a sprite that should read bigger or smaller. */
  scale?: number;
  alpha?: number;
}

/**
 * Draw a sprite at (x, y) under its kind's spec. Returns false if there was
 * nothing to draw, which is the caller's signal to draw its shell instead.
 *
 * THE RETURN VALUE IS THE WHOLE FALLBACK PROTOCOL. Every call site reads:
 *
 *     if (!drawSprite(...)) { ...the rectangles we drew before... }
 *
 * so the shells are not dead code kept around out of politeness — they are the
 * live path until the art lands, and they stay exercised for as long as any
 * single asset is missing.
 */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  kind: SpriteKind,
  x: number,
  y: number,
  ref: { id?: string; name?: string } = {},
  opts: DrawOpts = {},
): boolean {
  const img = sprite(kind, ref.id, ref.name);
  if (!img) return false;

  const spec = SPRITE_SPECS[kind];
  const scaled = { ...spec, height: spec.height * (opts.scale ?? 1) };
  const { w, h } = fitBox(img.naturalWidth, img.naturalHeight, scaled);
  if (w <= 0 || h <= 0) return false;

  ctx.save();
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
  ctx.translate(x, y);
  if (opts.flip) ctx.scale(-1, 1);
  if (opts.rotate) ctx.rotate(opts.rotate);
  const at = anchorAt(0, 0, w, h, spec.anchor);
  // Pixel art must not be smoothed into mush by the browser's scaler.
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, at.x, at.y, w, h);
  ctx.restore();
  return true;
}

/** Which way a batter of this hand faces. Right-handers are drawn unmirrored. */
export const facing = (bats: Hand): 1 | -1 => (bats === 'L' ? -1 : 1);
