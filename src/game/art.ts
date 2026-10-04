/**
 * THE PART LIBRARY — the drawings that replace the shells, one part at a time.
 *
 * ⚠️ THIS IS THE HALF THAT GROWS, AND IT IS WHY IT IS NOT IN localStorage.
 * A look is six integers and rides the league document; the PICTURES are
 * megabytes and belong to the machine rather than to any league. localStorage
 * is a ~5 MB string quota and a live save already spends 680 kB of it on a
 * league and a season, so base64 art in there would evict somebody's franchise
 * to store a hat. IndexedDB holds `Blob`s natively, has hundreds of megabytes,
 * and works from a `file://` origin — which is the whole distribution story.
 *
 * ⚠️ IT IS PER PART, NOT PER PLAYER, AND THAT IS THE ECONOMY OF THE WHOLE
 * FEATURE. 780 men are drawn out of roughly fifty parts. A cap arrives once, in
 * greyscale, and is TINTED to each club's kit at draw time — so one drawing
 * dresses all thirty. Art keyed per player would be 780 files and would have to
 * be redrawn every time somebody renamed a man.
 *
 * ⚠️ NOTHING HERE IS EVER REQUIRED. `sprite()` returns undefined until a part
 * exists and drawFigure() falls through to the shape it drew before — the same
 * contract src/game/sprites.ts has always had, moved down a level so it applies
 * per part instead of per player. An empty library is the shipped state and the
 * game is complete without it.
 *
 * ⚠️ ART DOES NOT TRAVEL WITH AN EXPORTED LEAGUE, deliberately and for now. The
 * league document is JSON in a textarea; fifty images are not. A league you
 * hand somebody carries the LOOKS — which parts each man wears — and lands on
 * their shells until they import the same pack. Closing that needs a real file
 * download, which is awkward from `file://`, and nobody has asked yet.
 *
 * ponytail: one object store, a Map, and three functions. No asset manager, no
 * manifest, no preloader, no reference counting. The browser is the database
 * and `createImageBitmap` is the decoder.
 */
/**
 * ⚠️ THIS FILE KNOWS NOTHING ABOUT PARTS, AND THAT IS DELIBERATE. It is a store
 * of blobs under string keys and a tinter. Which keys exist, what they are
 * called and which ones carry a drawing all live in look.ts, which imports this
 * — one direction, no cycle. The first cut had the two importing each other,
 * which ES modules tolerate right up until somebody calls one at module scope.
 */
const DB = 'basedball-art';
const STORE = 'parts';

/**
 * ⚠️ FOUR MEGABYTES A FILE, and it is a guard rather than a taste. These are
 * sprites a few hundred pixels tall; a file above this is somebody's layered
 * export or the wrong file entirely, and the honest thing is to say so at the
 * import rather than to spend a user's disk quota finding out.
 */
export const MAX_ART_BYTES = 4 * 1024 * 1024;

/**
 * The decoded library, read synchronously by drawFigure() at 60Hz.
 *
 * ⚠️ IT IS A PLAIN MAP AND THE DRAW PATH NEVER AWAITS. Loading is async and
 * happens once at boot; until it finishes every lookup misses and the shells
 * draw, which is correct and invisible. An `await` anywhere in the draw would
 * be a frame that renders half a man.
 */
type Pic = ImageBitmap | HTMLCanvasElement;
const live = new Map<string, Pic>();

/** What is loaded right now. Undefined means "draw the shell". */
export const sprite = (id: string): Pic | undefined => live.get(id);

/**
 * Draw with an unsaved drawing standing in for one part — the pixel box's
 * TEST ON A MAN. Nothing is stored; the slot is put back however `fn` exits.
 */
export function withDraft(id: string, pic: HTMLCanvasElement, fn: () => void): void {
  const had = live.get(id);
  live.set(id, pic);
  tints.clear();
  try {
    fn();
  } finally {
    if (had) live.set(id, had);
    else live.delete(id);
    tints.clear();
  }
}

/** How many parts are in the library — the editor prints it. */
export const artCount = (): number => live.size;

export const hasArt = (id: string): boolean => live.has(id);

// ------------------------------------------------------------------ the db

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const run = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

/**
 * Read the whole library into memory. Called once, at boot.
 *
 * ⚠️ IT SWALLOWS EVERY FAILURE ON PURPOSE. A private window, blocked site data,
 * a corrupt blob or no IndexedDB at all must cost the shells and nothing else —
 * the game has to open. There is no state in which missing art is an error.
 */
export async function loadArt(): Promise<void> {
  try {
    const db = await open();
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const keys = await run(store.getAllKeys());
    const blobs = await run(store.getAll());
    for (let i = 0; i < keys.length; i++) {
      const key = String(keys[i]);
      const blob = blobs[i] as Blob | undefined;
      if (!blob) continue;
      try {
        live.set(key, await createImageBitmap(blob));
      } catch {
        // One unreadable part, not a broken library.
      }
    }
    db.close();
  } catch {
    // No library. Shells, which is the shipped state anyway.
  }
}

/** Store one part and make it live immediately. */
export async function putArt(id: string, blob: Blob): Promise<void> {
  live.set(id, await createImageBitmap(blob));
  tints.clear();
  const db = await open();
  await run(db.transaction(STORE, 'readwrite').objectStore(STORE).put(blob, id) as IDBRequest<IDBValidKey>);
  db.close();
}

/** Forget one part. The shell comes back. */
export async function removeArt(id: string): Promise<void> {
  live.delete(id);
  tints.clear();
  const db = await open();
  await run(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id) as IDBRequest<undefined>);
  db.close();
}

/**
 * THE PACK — every stored part as `{ id: dataURL }`, which is what a `.bbpack`
 * file is. JSON with base64 inside: bigger than a zip, and needs no zip.
 */
export async function exportArt(): Promise<Record<string, string>> {
  const db = await open();
  const store = db.transaction(STORE, 'readonly').objectStore(STORE);
  const keys = await run(store.getAllKeys());
  const blobs = (await run(store.getAll())) as Blob[];
  db.close();
  const out: Record<string, string> = {};
  for (let i = 0; i < keys.length; i++) {
    out[String(keys[i])] = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blobs[i]!);
    });
  }
  return out;
}

/** Forget all of it. */
export async function clearArt(): Promise<void> {
  live.clear();
  tints.clear();
  const db = await open();
  await run(db.transaction(STORE, 'readwrite').objectStore(STORE).clear() as IDBRequest<undefined>);
  db.close();
}

// -------------------------------------------------------------- the naming

/** `UNIT-7 "Cletus"` and `unit 7 cletus` both become `unit-7-cletus`. */
export const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// --------------------------------------------------------------- the tint

/**
 * ⚠️ ONE DRAWING, THIRTY CLUBS. Parts arrive in greyscale and are recoloured to
 * the club's kit here, which is the single decision that turns "an impossible
 * amount of art" into about fifty files. Without it a cap is one colour forever
 * and every club needs its own.
 *
 * ⚠️ IT IS A PALETTE REMAP, NOT A MULTIPLY. Multiply turned dark greys to
 * sludge and killed every highlight — white chrome came out jersey-coloured.
 * Retro hardware swapped palettes instead, and so does this: the grey of each
 * pixel picks a shade off a three-stop ramp built from the kit colour —
 * black → outline, mid grey → the colour itself, white → a specular near-white.
 * Strict 4-shade pixel art (clear / #000 / #808080 / #fff) lands exactly on
 * the stops; any other greyscale blends between them, so old packs still draw.
 *
 * ⚠️ IT IS CACHED BECAUSE THE DRAW PATH RUNS AT 60Hz. Re-tinting eleven figures
 * every frame is eleven offscreen canvases a frame; the GDD's own acceptance
 * criterion is sprite assembly under 0.1s and this is the line it turns on. The
 * key is the part and the colour, so a club changing its jersey in the editor
 * simply misses once.
 */
const tints = new Map<string, HTMLCanvasElement>();
/** Parts times colours. A couple of hundred is a few megabytes of canvas. */
const MAX_TINTS = 240;

export function tinted(id: string, colour: string): CanvasImageSource | undefined {
  const img = live.get(id);
  if (!img) return undefined;
  const key = `${id}|${colour}`;
  const had = tints.get(key);
  if (had) return had;

  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return img;
  g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, c.width, c.height);
  remap(px.data, ramp(colour));
  g.putImageData(px, 0, 0);

  // ponytail: clear the whole cache at the cap rather than evicting least-used.
  // It refills in one frame and an LRU here is bookkeeping for a Map that is
  // only ever a few hundred entries in the worst case anybody has described.
  if (tints.size >= MAX_TINTS) tints.clear();
  tints.set(key, c);
  return c;
}

type RGB = [number, number, number];

/**
 * The three stops a grey is read against: outline, base, highlight. The
 * outline is the colour at a quarter strength (a shadow fold, not pure black);
 * the highlight is 70% of the way to white, so chrome gleams in any kit.
 * An unreadable colour falls back to plain grey rather than throwing.
 */
export function ramp(colour: string): [RGB, RGB, RGB] {
  const m = /^#?([0-9a-f]{6})$/i.exec(colour.trim());
  const n = m ? parseInt(m[1]!, 16) : 0x808080;
  const base: RGB = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return [
    base.map((v) => Math.round(v * 0.25)) as RGB,
    base,
    base.map((v) => Math.round(v + (255 - v) * 0.7)) as RGB,
  ];
}

/** Recolour RGBA pixels in place by luminance; alpha is left alone. */
export function remap(px: Uint8ClampedArray, [lo, mid, hi]: [RGB, RGB, RGB]): void {
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const l = (px[i]! * 299 + px[i + 1]! * 587 + px[i + 2]! * 114) / 255000;
    const [a, b, t] = l < 0.5 ? [lo, mid, l * 2] : [mid, hi, l * 2 - 1];
    px[i] = a[0] + (b[0] - a[0]) * t;
    px[i + 1] = a[1] + (b[1] - a[1]) * t;
    px[i + 2] = a[2] + (b[2] - a[2]) * t;
  }
}
