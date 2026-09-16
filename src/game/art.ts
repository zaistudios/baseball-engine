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
 * contract src/web/sprites.ts has always had, moved down a level so it applies
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
const live = new Map<string, ImageBitmap>();

/** What is loaded right now. Undefined means "draw the shell". */
export const sprite = (id: string): ImageBitmap | undefined => live.get(id);

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
 * The three steps are the standard canvas tint and the order matters: multiply
 * lays the colour over the greyscale and keeps its shading, then
 * `destination-in` puts the original alpha back so the transparent margin does
 * not come out as a solid rectangle.
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
  const g = c.getContext('2d');
  if (!g) return img;
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = colour;
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(img, 0, 0);

  // ponytail: clear the whole cache at the cap rather than evicting least-used.
  // It refills in one frame and an LRU here is bookkeeping for a Map that is
  // only ever a few hundred entries in the worst case anybody has described.
  if (tints.size >= MAX_TINTS) tints.clear();
  tints.set(key, c);
  return c;
}

