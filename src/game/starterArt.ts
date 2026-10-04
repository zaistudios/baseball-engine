/**
 * THE VAULT SPEC STARTER PACK — handcrafted retro pixel art for the 2026-10-03
 * retro spec taxonomy.
 *
 * ⚠️ DATA, NOT BLIND BINARIES. Each part is authored programmatically onto
 * the spec's fixed grid (16×16 for heads and crests, 32×32 for frames) using
 * the four palette indices defined in pixels.ts:
 *
 *   0 clear · 1 outline (#000) · 2 base (#808080) · 3 highlight (#fff)
 *
 * When loaded into IndexedDB via putArt(), these parts:
 *   1. Remap synchronously at 60Hz through art.ts to every club's uniform kit.
 *   2. Populate the CUSTOMIZE Art Pack slots immediately.
 *   3. Open directly in the in-browser Pixel Box (✎ DRAW), where players can
 *      view the grid, edit with pencil/fill/mirror, test in real time, and bake.
 *
 * Pure TypeScript, zero external dependencies, works offline and in Node tests.
 */

import { padFor, paint, fill, line, toRGBA, type Pad } from './pixels.ts';
import { putArt } from './art.ts';

// ----------------------------------------------------------- PNG Encoder

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(buf: Uint8Array): number {
  let s1 = 1;
  let s2 = 0;
  for (let i = 0; i < buf.length; i++) {
    s1 = (s1 + buf[i]!) % 65521;
    s2 = (s2 + s1) % 65521;
  }
  return ((s2 << 16) | s1) >>> 0;
}

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function toBase64(bytes: Uint8Array): string {
  let res = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i]!;
    const b1 = i + 1 < len ? bytes[i + 1]! : 0;
    const b2 = i + 2 < len ? bytes[i + 2]! : 0;
    res += B64_CHARS[b0 >> 2]!;
    res += B64_CHARS[((b0 & 3) << 4) | (b1 >> 4)]!;
    res += i + 1 < len ? B64_CHARS[((b1 & 15) << 2) | (b2 >> 6)]! : '=';
    res += i + 2 < len ? B64_CHARS[b2 & 63]! : '=';
  }
  return res;
}

/** Encode a 16x16 or 32x32 Pad into a standard PNG data URL. */
export function padToPngDataUrl(p: Pad): string {
  const w = p.n;
  const h = p.n;
  const rgba = toRGBA(p);

  // Scanline data with filter byte 0x00 per row
  const rawRowLen = 1 + w * 4;
  const rawLen = h * rawRowLen;
  const raw = new Uint8Array(rawLen);
  for (let y = 0; y < h; y++) {
    const rowOffset = y * rawRowLen;
    raw[rowOffset] = 0; // Filter 0 (None)
    raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), rowOffset + 1);
  }

  // Deflate stream (zlib uncompressed block)
  const zlibLen = 2 + 5 + rawLen + 4;
  const zlib = new Uint8Array(zlibLen);
  zlib[0] = 0x78;
  zlib[1] = 0x01; // Zlib header
  zlib[2] = 0x01; // BFINAL=1, BTYPE=00 (uncompressed block)
  zlib[3] = rawLen & 0xff;
  zlib[4] = (rawLen >> 8) & 0xff;
  const nlen = (~rawLen) & 0xffff;
  zlib[5] = nlen & 0xff;
  zlib[6] = (nlen >> 8) & 0xff;
  zlib.set(raw, 7);
  const adler = adler32(raw);
  const adlerPos = 7 + rawLen;
  zlib[adlerPos] = (adler >>> 24) & 0xff;
  zlib[adlerPos + 1] = (adler >>> 16) & 0xff;
  zlib[adlerPos + 2] = (adler >>> 8) & 0xff;
  zlib[adlerPos + 3] = adler & 0xff;

  // Build PNG chunks: Header, IHDR, IDAT, IEND
  const chunk = (type: string, data: Uint8Array): Uint8Array => {
    const out = new Uint8Array(8 + data.length + 4);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    const crcBuf = out.subarray(4, 8 + data.length);
    view.setUint32(8 + data.length, crc32(crcBuf));
    return out;
  };

  const ihdrData = new Uint8Array(13);
  const ihdrView = new DataView(ihdrData.buffer);
  ihdrView.setUint32(0, w);
  ihdrView.setUint32(4, h);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const ihdrChunk = chunk('IHDR', ihdrData);
  const idatChunk = chunk('IDAT', zlib);
  const iendChunk = chunk('IEND', new Uint8Array(0));

  const totalLen = 8 + ihdrChunk.length + idatChunk.length + iendChunk.length;
  const png = new Uint8Array(totalLen);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  let pos = 8;
  png.set(ihdrChunk, pos);
  pos += ihdrChunk.length;
  png.set(idatChunk, pos);
  pos += idatChunk.length;
  png.set(iendChunk, pos);

  return `data:image/png;base64,${toBase64(png)}`;
}

// ----------------------------------------------------------- The Art Drawings

/** 16x16 Machine Head: CRT Monitor Face (machine/head/4) */
export function drawCrtMonitorFace(): Pad {
  const p = padFor('head');
  // Outer monitor casing
  for (let x = 2; x <= 13; x++) {
    paint(p, x, 2, 1);
    paint(p, x, 13, 1);
  }
  for (let y = 2; y <= 13; y++) {
    paint(p, 2, y, 1);
    paint(p, 13, y, 1);
  }
  // Fill screen with base tint
  for (let y = 3; y <= 12; y++) {
    for (let x = 3; x <= 11; x++) {
      paint(p, x, y, 2);
    }
  }
  // Monitor side controls / dial column (x=12)
  for (let y = 3; y <= 12; y++) {
    paint(p, 12, y, 1);
  }
  paint(p, 12, 4, 3);
  paint(p, 12, 7, 3);
  paint(p, 12, 10, 3);
  // Phosphor pixel eyes [ ^ _ ^ ]
  paint(p, 5, 6, 3);
  paint(p, 6, 5, 3);
  paint(p, 7, 6, 3);

  paint(p, 8, 6, 3);
  paint(p, 9, 5, 3);
  paint(p, 10, 6, 3);

  // Digital mouth smile
  paint(p, 6, 9, 3);
  paint(p, 7, 10, 3);
  paint(p, 8, 10, 3);
  paint(p, 9, 9, 3);
  return p;
}

/** 16x16 Machine Crest: Warning Siren (machine/crest/7) */
export function drawWarningSiren(): Pad {
  const p = padFor('crest');
  // Mounting base
  line(p, 4, 14, 11, 14, 1);
  line(p, 5, 13, 10, 13, 2);
  // Dome outline
  line(p, 5, 12, 5, 7, 1);
  line(p, 10, 12, 10, 7, 1);
  line(p, 6, 6, 9, 6, 1);
  paint(p, 5, 6, 1);
  paint(p, 10, 6, 1);
  // Fill dome with base
  for (let y = 7; y <= 12; y++) {
    for (let x = 6; x <= 9; x++) {
      paint(p, x, y, 2);
    }
  }
  // Internal reflector & highlight beacon
  paint(p, 7, 8, 3);
  paint(p, 8, 8, 3);
  paint(p, 7, 9, 3);
  paint(p, 8, 9, 3);
  // Protective vertical cage ribs
  line(p, 6, 7, 6, 12, 1);
  line(p, 9, 7, 9, 12, 1);
  // Top cage cap & radiation rays
  paint(p, 7, 5, 3);
  paint(p, 8, 5, 3);
  paint(p, 3, 5, 3);
  paint(p, 12, 5, 3);
  paint(p, 2, 8, 3);
  paint(p, 13, 8, 3);
  return p;
}

/** 16x16 Machine Crest: Vent Stack (machine/crest/1) */
export function drawVentStack(): Pad {
  const p = padFor('crest');
  // Base plate
  line(p, 2, 14, 13, 14, 1);
  line(p, 3, 13, 12, 13, 2);
  // Three vertical stacks
  const stacks = [3, 7, 11];
  for (const sx of stacks) {
    line(p, sx, 12, sx, 6, 1);
    line(p, sx + 1, 12, sx + 1, 6, 2);
    line(p, sx + 2, 12, sx + 2, 6, 1);
    // Stack rims
    paint(p, sx, 5, 1);
    paint(p, sx + 1, 5, 3);
    paint(p, sx + 2, 5, 1);
    // Exhaust steam puffs
    paint(p, sx + 1, 3, 3);
    paint(p, sx, 2, 3);
  }
  return p;
}

/** 16x16 Human Crest: Pine-Tar Helmet (human/crest/8) */
export function drawPineTarHelmet(): Pad {
  const p = padFor('crest');
  // Helmet crown curve
  line(p, 4, 12, 2, 8, 1);
  line(p, 2, 8, 4, 4, 1);
  line(p, 4, 4, 11, 4, 1);
  line(p, 11, 4, 14, 7, 1);
  // Brim sticking forward
  line(p, 11, 11, 15, 9, 1);
  line(p, 14, 7, 15, 9, 1);
  line(p, 4, 12, 11, 11, 1);
  // Fill helmet base
  fill(p, 7, 7, 2);
  // Helmet gloss highlight on crown
  line(p, 5, 5, 10, 5, 3);
  paint(p, 11, 6, 3);
  // Heavy dark pine-tar smudges and resin stains (outline ink 1)
  paint(p, 4, 6, 1);
  paint(p, 4, 7, 1);
  paint(p, 5, 7, 1);
  paint(p, 5, 8, 1);
  paint(p, 6, 8, 1);
  paint(p, 7, 9, 1);
  paint(p, 8, 9, 1);
  paint(p, 9, 10, 1);
  paint(p, 12, 8, 1);
  paint(p, 13, 9, 1);
  paint(p, 14, 9, 1);
  return p;
}

/** 16x16 Human Crest: Classic Cap (human/crest/1) */
export function drawClassicCap(): Pad {
  const p = padFor('crest');
  // Rounded crown
  line(p, 3, 11, 3, 7, 1);
  line(p, 3, 7, 6, 4, 1);
  line(p, 6, 4, 10, 4, 1);
  line(p, 10, 4, 12, 7, 1);
  line(p, 12, 7, 12, 10, 1);
  // Bill
  line(p, 12, 10, 15, 9, 1);
  line(p, 15, 9, 14, 11, 1);
  line(p, 14, 11, 3, 11, 1);
  fill(p, 7, 7, 2);
  // Cap top button
  paint(p, 8, 3, 3);
  // Bill highlight & crown seam
  line(p, 6, 5, 9, 5, 3);
  line(p, 8, 5, 8, 10, 1);
  line(p, 11, 10, 14, 10, 3);
  return p;
}

/** 16x16 Augmented Head: Monocle HUD (augmented/head/5) */
export function drawMonocleHud(): Pad {
  const p = padFor('head');
  // Head contour
  line(p, 5, 2, 10, 2, 1);
  line(p, 5, 2, 3, 5, 1);
  line(p, 3, 5, 3, 11, 1);
  line(p, 3, 11, 5, 13, 1);
  line(p, 5, 13, 9, 13, 1);
  line(p, 9, 13, 11, 11, 1);
  line(p, 11, 11, 11, 5, 1);
  line(p, 11, 5, 10, 2, 1);
  fill(p, 7, 7, 2);
  // Monocle rim over right eye (x=8, y=6)
  paint(p, 7, 5, 1);
  paint(p, 8, 5, 1);
  paint(p, 9, 5, 1);
  paint(p, 6, 6, 1);
  paint(p, 10, 6, 1);
  paint(p, 6, 7, 1);
  paint(p, 10, 7, 1);
  paint(p, 7, 8, 1);
  paint(p, 8, 8, 1);
  paint(p, 9, 8, 1);
  // Holographic crosshair reticle (highlight)
  paint(p, 8, 6, 3);
  paint(p, 8, 7, 3);
  paint(p, 7, 6, 3);
  paint(p, 9, 7, 3);
  // Projected HUD telemetry bracket
  paint(p, 12, 4, 3);
  paint(p, 13, 4, 3);
  paint(p, 13, 5, 3);
  paint(p, 13, 8, 3);
  paint(p, 13, 9, 3);
  paint(p, 12, 9, 3);
  // Eye on other side
  paint(p, 5, 6, 1);
  return p;
}

/** 16x16 Augmented Crest: Neural Uplink (augmented/crest/7) */
export function drawNeuralUplink(): Pad {
  const p = padFor('crest');
  // Cranial base socket
  line(p, 4, 13, 9, 13, 1);
  line(p, 5, 12, 8, 12, 2);
  line(p, 5, 11, 8, 11, 1);
  // Antenna mast
  line(p, 6, 10, 6, 4, 1);
  line(p, 7, 10, 7, 4, 2);
  // Pulsing telemetry ring node
  line(p, 4, 5, 9, 5, 3);
  paint(p, 4, 4, 3);
  paint(p, 9, 4, 3);
  // Top beacon needle
  paint(p, 6, 3, 3);
  paint(p, 6, 2, 3);
  return p;
}

/** 32x32 Human Frame: Pinstripe Classic Jersey (human/frame/9) */
export function drawPinstripeClassic(): Pad {
  const p = padFor('frame');
  // Jersey silhouette outline
  line(p, 10, 4, 21, 4, 1); // collar top
  line(p, 10, 4, 5, 9, 1);   // left shoulder
  line(p, 5, 9, 7, 13, 1);   // left sleeve
  line(p, 7, 13, 9, 12, 1);  // left armpit
  line(p, 9, 12, 8, 28, 1);  // left flank
  line(p, 8, 28, 23, 28, 1); // hem bottom
  line(p, 23, 28, 22, 12, 1);// right flank
  line(p, 22, 12, 24, 13, 1);// right armpit
  line(p, 24, 13, 26, 9, 1); // right sleeve
  line(p, 26, 9, 21, 4, 1);  // right shoulder
  fill(p, 15, 15, 2);        // fill jersey with base
  // Collar V-neck in outline
  line(p, 12, 4, 15, 8, 1);
  line(p, 19, 4, 16, 8, 1);
  // Crisp vertical pinstripes running down the torso (ink 1 outline / ink 3 highlight)
  const pinstripeCols = [10, 13, 16, 19, 21];
  for (const cx of pinstripeCols) {
    for (let y = 9; y <= 27; y++) {
      paint(p, cx, y, 1);
    }
  }
  // Placket center buttons
  paint(p, 16, 11, 3);
  paint(p, 16, 16, 3);
  paint(p, 16, 21, 3);
  paint(p, 16, 25, 3);
  return p;
}

/** 32x32 Human Frame: Wool Veteran Jersey (human/frame/8) */
export function drawWoolVeteran(): Pad {
  const p = padFor('frame');
  // Torso outline
  line(p, 9, 5, 22, 5, 1);
  line(p, 9, 5, 4, 10, 1);
  line(p, 4, 10, 6, 14, 1);
  line(p, 6, 14, 8, 13, 1);
  line(p, 8, 13, 8, 28, 1);
  line(p, 8, 28, 23, 28, 1);
  line(p, 23, 28, 23, 13, 1);
  line(p, 23, 13, 25, 14, 1);
  line(p, 25, 14, 27, 10, 1);
  line(p, 27, 10, 22, 5, 1);
  fill(p, 15, 15, 2);
  // Raglan sleeve contrasting lines
  line(p, 9, 5, 8, 13, 1);
  line(p, 22, 5, 23, 13, 1);
  // Flannel button placket down center (width 3)
  for (let y = 6; y <= 27; y++) {
    paint(p, 14, y, 1);
    paint(p, 17, y, 1);
  }
  // 4 Ivory jersey buttons
  for (const by of [9, 14, 19, 24]) {
    paint(p, 15, by, 3);
    paint(p, 16, by, 3);
    paint(p, 15, by + 1, 3);
    paint(p, 16, by + 1, 3);
  }
  return p;
}

/** 32x32 Machine Frame: Steam Boiler Chassis (machine/frame/6) */
export function drawSteamBoiler(): Pad {
  const p = padFor('frame');
  // Heavy rounded boiler chassis
  line(p, 8, 5, 23, 5, 1);
  line(p, 8, 5, 5, 9, 1);
  line(p, 5, 9, 5, 24, 1);
  line(p, 5, 24, 8, 28, 1);
  line(p, 8, 28, 23, 28, 1);
  line(p, 23, 28, 26, 24, 1);
  line(p, 26, 24, 26, 9, 1);
  line(p, 26, 9, 23, 5, 1);
  fill(p, 15, 15, 2);
  // Riveted top and bottom rim bands
  line(p, 6, 8, 25, 8, 1);
  line(p, 6, 25, 25, 25, 1);
  for (let x = 7; x <= 24; x += 3) {
    paint(p, x, 7, 3);
    paint(p, x, 26, 3);
  }
  // Circular steam pressure gauge in center
  for (let deg = 0; deg < 16; deg++) {
    const th = (deg / 16) * Math.PI * 2;
    const gx = Math.round(15.5 + Math.cos(th) * 5);
    const gy = Math.round(16.5 + Math.sin(th) * 5);
    paint(p, gx, gy, 1);
  }
  // Gauge face (highlight)
  for (let y = 13; y <= 20; y++) {
    for (let x = 12; x <= 19; x++) {
      const dx = x - 15.5;
      const dy = y - 16.5;
      if (dx * dx + dy * dy < 17) paint(p, x, y, 3);
    }
  }
  // Gauge center pivot & needle
  paint(p, 15, 16, 1);
  paint(p, 16, 16, 1);
  paint(p, 16, 15, 1);
  paint(p, 17, 14, 1);
  // Copper steam bypass pipe along the right flank
  line(p, 23, 9, 23, 24, 3);
  line(p, 24, 9, 24, 24, 1);
  return p;
}

/** 16x16 Machine Head: Optic Slit (machine/head/0) */
export function drawOpticSlit(): Pad {
  const p = padFor('head');
  line(p, 4, 3, 11, 3, 1);
  line(p, 4, 3, 3, 6, 1);
  line(p, 3, 6, 3, 11, 1);
  line(p, 3, 11, 5, 13, 1);
  line(p, 5, 13, 10, 13, 1);
  line(p, 10, 13, 12, 11, 1);
  line(p, 12, 11, 12, 6, 1);
  line(p, 12, 6, 11, 3, 1);
  fill(p, 7, 7, 2);
  // Horizontal visor slit
  line(p, 4, 7, 11, 7, 1);
  line(p, 4, 8, 11, 8, 3);
  line(p, 4, 9, 11, 9, 1);
  return p;
}

/** 16x16 Augmented Head: Scanner Jaw (augmented/head/3) */
export function drawScannerJaw(): Pad {
  const p = padFor('head');
  // Human upper face
  line(p, 5, 2, 10, 2, 1);
  line(p, 5, 2, 3, 5, 1);
  line(p, 3, 5, 3, 8, 1);
  line(p, 10, 2, 12, 5, 1);
  line(p, 12, 5, 12, 8, 1);
  fill(p, 7, 5, 2);
  paint(p, 8, 6, 1); // Eye
  // Heavy prosthetic metal jaw (y >= 8)
  line(p, 3, 8, 12, 8, 1);
  line(p, 3, 8, 4, 13, 1);
  line(p, 4, 13, 11, 13, 1);
  line(p, 11, 13, 12, 8, 1);
  fill(p, 7, 10, 1);
  // Synthesizer speaker grill vents
  for (let x = 5; x <= 10; x += 2) {
    line(p, x, 10, x, 12, 3);
  }
  return p;
}

// ----------------------------------------------------------- The Starter Pack

export interface VaultPackEntry {
  id: string;
  pad: Pad;
  dataUrl: string;
}

/** The complete collection of 12 handcrafted starter parts for the Vault spec. */
export function createVaultSpecParts(): VaultPackEntry[] {
  const list: { id: string; pad: Pad }[] = [
    { id: 'machine/head/4', pad: drawCrtMonitorFace() },
    { id: 'machine/crest/7', pad: drawWarningSiren() },
    { id: 'machine/crest/1', pad: drawVentStack() },
    { id: 'machine/head/0', pad: drawOpticSlit() },
    { id: 'machine/frame/6', pad: drawSteamBoiler() },
    { id: 'human/crest/8', pad: drawPineTarHelmet() },
    { id: 'human/crest/1', pad: drawClassicCap() },
    { id: 'human/frame/9', pad: drawPinstripeClassic() },
    { id: 'human/frame/8', pad: drawWoolVeteran() },
    { id: 'augmented/head/5', pad: drawMonocleHud() },
    { id: 'augmented/crest/7', pad: drawNeuralUplink() },
    { id: 'augmented/head/3', pad: drawScannerJaw() },
  ];

  return list.map((item) => ({
    id: item.id,
    pad: item.pad,
    dataUrl: padToPngDataUrl(item.pad),
  }));
}

/** Export the Vault Spec Pack as a .bbpack JSON object. */
export function exportVaultSpecPackJson(): string {
  const parts = createVaultSpecParts();
  const pack: Record<string, string> = {};
  for (const p of parts) {
    pack[p.id] = p.dataUrl;
  }
  return JSON.stringify(pack, null, 2);
}

/** Load all Vault Spec starter parts directly into IndexedDB. */
export async function loadVaultSpecPack(): Promise<number> {
  const parts = createVaultSpecParts();
  let ok = 0;
  for (const p of parts) {
    try {
      const res = await fetch(p.dataUrl);
      const blob = await res.blob();
      await putArt(p.id, blob);
      ok++;
    } catch {
      // Ignored if offline or test environment without fetch/Blob
    }
  }
  return ok;
}
