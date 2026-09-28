/**
 * WHERE THE GAME IS PLAYED, AND WHEN — the backdrop behind the plate.
 *
 * Every park used to be one hardcoded dusk: the same sky, the same grey
 * grandstand, and 330 / 395 / 335 painted on the wall whatever the fences
 * really were. Zane: "every field looks the same."
 *
 * Now a park is three things, all drawn, none of them an image:
 *
 * - **A skyline** for its town (SKYLINE below): towers in New York, stacks in
 *   Detroit, the bay and a bridge in San Francisco, mesas in Phoenix.
 * - **The home club's colours** on the wall, the seats and the crowd, from
 *   its kit (uniformFor()). The ivy is the one wall that is not painted.
 * - **The hour.** A game has a first pitch (firstPitch()) and the clock moves
 *   with the innings (hourAt()). A 1:05 start stays in daylight, a 5:10 start
 *   runs into the sunset, and a 7:05 start is lit by the towers from the
 *   first pitch. The same light tints the overhead replay's grass.
 *
 * ⚠️ PRESENTATION ONLY. Nothing here is read by the engine and nothing here
 * draws from the game's RNG — a night game plays exactly like a day game.
 *
 * ponytail: nine skyline painters of a few rectangles each, keyed by abbr.
 * A custom club gets one by hash. Real art per park is a bigger job than the
 * 16 kB this whole file is allowed.
 */

import type { Team } from './teams.ts';
import { uniformFor } from './look.ts';
import { seedFromString } from '../core/rng.ts';
import {
  drawLandmark,
  drawSkyTraffic,
  drawRoof,
  drawWeather,
  drawBunting,
  drawWallDressing,
  drawBoard,
  type Board,
} from './landmarks.ts';

export type { Board };

export type Skyline =
  | 'city'
  | 'industrial'
  | 'bridge'
  | 'water'
  | 'hills'
  | 'mountains'
  | 'desert'
  | 'plains'
  | 'palms';

/** What stands behind each club's outfield wall. Read off the park notes in teams.ts. */
export const SKYLINE: Readonly<Record<string, Skyline>> = {
  NYE: 'city', NYV: 'bridge', LAC: 'palms', LAA: 'hills', CHF: 'industrial', CHI: 'city',
  ALB: 'hills', BAL: 'water', BUF: 'water', CIN: 'water', CLE: 'industrial', DEN: 'mountains',
  DET: 'industrial', FLA: 'palms', KCF: 'plains', MEM: 'water', MIL: 'industrial', MIN: 'plains',
  MNE: 'water', NEM: 'city', NOL: 'palms', OKC: 'plains', PHI: 'industrial', PHX: 'desert',
  PIT: 'bridge', SEA: 'mountains', SFO: 'bridge', STL: 'city', TEX: 'desert', TOR: 'city',
};

const KINDS: readonly Skyline[] = ['city', 'industrial', 'bridge', 'water', 'hills', 'mountains', 'desert', 'plains', 'palms'];

/** Parks whose wall is grown, not painted. */
const IVY = new Set(['CHI']);

export type Weather = 'clear' | 'fog' | 'snow' | 'dust' | 'haze' | 'heat';
export type Roof = 'open' | 'dome' | 'retract';

/**
 * THE ONE THING EACH PARK HAS THAT NO OTHER DOES, its weather and its roof —
 * read off the park's own note in teams.ts. `landmark` names a painter in
 * landmarks.ts. A club not in this table gets its town's skyline and nothing
 * else, which is still a park.
 */
export const PARK_LOOK: Readonly<Record<string, readonly [landmark: string, weather: Weather, roof: Roof]>> = {
  NYE: ['spire', 'clear', 'open'],
  NYV: ['gantry', 'clear', 'open'],
  LAC: ['sign', 'haze', 'open'],
  LAA: ['aqueduct', 'clear', 'open'],
  CHF: ['firehouse', 'clear', 'open'],
  CHI: ['rooftops', 'clear', 'open'],
  ALB: ['barn', 'clear', 'open'],
  BAL: ['warehouse', 'clear', 'open'],
  BUF: ['elevators', 'snow', 'open'],
  CIN: ['paddleboat', 'haze', 'open'],
  CLE: ['highwall', 'clear', 'open'],
  DEN: ['tether', 'clear', 'open'],
  DET: ['furnace', 'clear', 'open'],
  FLA: ['aquarium', 'clear', 'dome'],
  KCF: ['fountains', 'clear', 'open'],
  MEM: ['pyramid', 'haze', 'open'],
  MIL: ['barrels', 'clear', 'retract'],
  MIN: ['mill', 'clear', 'open'],
  MNE: ['lighthouse', 'fog', 'open'],
  NEM: ['steeples', 'clear', 'open'],
  NOL: ['balconies', 'haze', 'open'],
  OKC: ['turbines', 'dust', 'open'],
  PHI: ['ships', 'clear', 'open'],
  PHX: ['kilns', 'heat', 'open'],
  PIT: ['incline', 'clear', 'open'],
  SEA: ['needle', 'fog', 'open'],
  SFO: ['foghorn', 'fog', 'open'],
  STL: ['arch', 'clear', 'open'],
  TEX: ['derricks', 'heat', 'open'],
  TOR: ['maglev', 'clear', 'retract'],
};

/**
 * HOW FAR INTO THE FUTURE THIS CLUB LIVES, 0 to 1, off who is in its lineup:
 * a machine counts 1, an augmented man 0.6, a human nothing. The Holdouts'
 * nine humans play in a yard with a hand-turned scoreboard and pennants on a
 * wire; the Foundry's nine machines play under a holographic board with
 * drones over the lights. The rest are somewhere between, which is where a
 * dirigible belongs.
 */
export const eraOf = (club: Team): number => {
  const n = club.lineup.length || 1;
  return club.lineup.reduce((a, p) => a + (p.build === 'machine' ? 1 : p.build === 'augmented' ? 0.6 : 0), 0) / n;
};

export interface Venue {
  skyline: Skyline;
  landmark: string;
  weather: Weather;
  roof: Roof;
  era: number;
  /** The club's own word for itself, for the signs: "COMETS". */
  sign: string;
  /** The wall's padding, the seats, the crowd's shirts, the trim along the top. */
  wall: string;
  seats: string;
  crowd: string;
  trim: string;
  /** The three fences, for the numbers on the wall. */
  left: number;
  center: number;
  right: number;
  /** Per-park variety that is not a colour: which building goes where. */
  seed: number;
}

export function venueFor(home: Team): Venue {
  const kit = uniformFor(home);
  const seed = seedFromString(home.abbr);
  const park = home.park;
  const [landmark, weather, roof] = PARK_LOOK[home.abbr] ?? ['', 'clear', 'open'];
  return {
    skyline: SKYLINE[home.abbr] ?? KINDS[seed % KINDS.length]!,
    landmark,
    weather,
    roof,
    era: eraOf(home),
    sign: (home.name.split(' ').pop() ?? home.abbr).toUpperCase(),
    wall: IVY.has(home.abbr) ? '#1f4a22' : mix(kit.primary, '#0b120d', 0.55),
    seats: mix(kit.secondary, '#0d1117', 0.6),
    crowd: kit.primary,
    trim: kit.trim,
    left: park?.left ?? 330,
    center: park?.center ?? 400,
    right: park?.right ?? 330,
    seed,
  };
}

// ------------------------------------------------------------------ the hour

/** The three start times a schedule uses, in hours: 1:05, 5:10 and 7:05. */
export const STARTS = [13.08, 17.17, 19.08] as const;

/**
 * THE FIRST PITCH. A third of games in the daytime, about one in six at
 * 5:10 — the twilight start that turns from day to night while you watch — and the
 * rest at night. `roll` is 0-1 and comes from the caller, never from the
 * game's own seeded stream.
 */
export const firstPitch = (roll: number): number =>
  roll < 0.3 ? STARTS[0] : roll < 0.45 ? STARTS[1] : STARTS[2];

/** A nine-inning game takes about three hours; so does every half of it. */
const HOURS_PER_INNING = 3 / 9;

/** What the clock says, `innings` innings into a game that started at `start`. */
export const hourAt = (start: number, innings: number): number =>
  start + Math.max(0, innings) * HOURS_PER_INNING;

export interface Light {
  skyTop: string;
  skyLow: string;
  /** 0 is night under the towers, 1 is full sun. */
  day: number;
  /** The towers are on. */
  lights: boolean;
  grass: string;
  stripe: string;
  dirt: string;
  dirtLight: string;
  /** Far buildings and hills, and their lit windows. */
  far: string;
  windows: number;
}

/** Sky keyframes by hour: top, horizon, daylight. Between two, it blends. */
const SKY: readonly [number, string, string, number][] = [
  [12, '#3d78c0', '#9fcbe8', 1],
  [17, '#4a70b0', '#c6d4dc', 0.95],
  [18.6, '#39508e', '#f0a55e', 0.7],
  [19.6, '#23244f', '#d8603f', 0.4],
  [20.4, '#10142c', '#4b2f52', 0.12],
  [21.3, '#070a14', '#141c2e', 0],
];

export function lightAt(hour: number): Light {
  let i = 0;
  while (i < SKY.length - 2 && hour > SKY[i + 1]![0]) i++;
  const [h0, top0, low0, d0] = SKY[i]!;
  const [h1, top1, low1, d1] = SKY[i + 1]!;
  const k = Math.max(0, Math.min(1, (hour - h0) / (h1 - h0)));
  const day = d0 + (d1 - d0) * k;
  return {
    skyTop: mix(top0, top1, k),
    skyLow: mix(low0, low1, k),
    day,
    lights: day < 0.8,
    // Under the towers the grass is still green; in the sun it is greener.
    grass: mix('#1a3322', '#2e5a31', day),
    stripe: mix('#1f3a27', '#356838', day),
    dirt: mix('#3a2417', '#6b4128', day),
    dirtLight: mix('#442b1b', '#7a4d30', day),
    far: mix('#101720', '#5d7187', day),
    windows: 1 - day,
  };
}

/**
 * THE LIGHT IN THIS PARK. Under a dome it is the same at 1:05 and at 9:30 —
 * the lamps are on and the grass is lit for day.
 */
export const lightFor = (v: Venue, hour: number): Light =>
  v.roof === 'dome' ? { ...lightAt(14), lights: true, windows: 0 } : lightAt(hour);

/** The overhead replay's palette, in the same light. */
export const overheadPalette = (l: Light): { field: string; dirt: string } => ({
  field: mix('#1d2b1f', '#2a4a2c', l.day),
  dirt: mix('#3a2e20', '#5a4029', l.day),
});

// ------------------------------------------------------------------ drawing

/**
 * THE VIEW FROM BEHIND THE PLATE, everything behind the strike zone: sky,
 * skyline, stands, wall, grass, the mound and the plate's dirt, the lines.
 * `w`/`h` are the canvas, `plateY` the plate's top edge.
 */
export function drawVenue(
  c: CanvasRenderingContext2D,
  w: number,
  h: number,
  plateY: number,
  v: Venue,
  l: Light,
  /** The page clock, ms, for the things that move. */
  t = 0,
  /** The score, for the board over centre. Omitted, no board. */
  board?: Board,
): void {
  const sky = c.createLinearGradient(0, 0, 0, 44);
  sky.addColorStop(0, l.skyTop);
  sky.addColorStop(1, l.skyLow);
  c.fillStyle = sky;
  c.fillRect(0, 0, w, 44);

  // Night: a few stars, fixed per park so they do not twinkle between frames.
  if (l.day < 0.1) {
    c.fillStyle = `rgba(255,255,240,${0.5 * (1 - l.day * 10)})`;
    for (let i = 0; i < 14; i++) c.fillRect((v.seed * (i + 3) * 37) % w, (v.seed * (i + 7) * 13) % 18, 1, 1);
  }
  // Day: the sun or its glow, low in the west as it sets.
  if (l.day > 0.3 && l.day < 0.98) {
    const sun = c.createRadialGradient(w * 0.82, 30, 1, w * 0.82, 30, 40);
    sun.addColorStop(0, `rgba(255,220,150,${0.6 * (1 - l.day) + 0.2})`);
    sun.addColorStop(1, 'rgba(255,220,150,0)');
    c.fillStyle = sun;
    c.fillRect(0, 0, w, 44);
  }
  // Night: a moon, a crescent cut by the sky behind it.
  if (l.day < 0.3) {
    const mx = 120 + (v.seed % 60);
    c.fillStyle = '#f0ecd8';
    c.beginPath();
    c.arc(mx, 9, 4, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = l.skyTop;
    c.beginPath();
    c.arc(mx + 2, 8, 3.6, 0, Math.PI * 2);
    c.fill();
  }

  // A dome covers all of that, and the town with it: the tank is inside.
  if (v.roof === 'dome') drawRoof(c, w, v);
  else drawSkyline(c, w, v, l);
  drawLandmark(c, w, v, l, t);
  drawSkyTraffic(c, w, v, l, t);
  drawWeather(c, w, v, l, t);
  if (v.roof === 'retract') drawRoof(c, w, v);

  // The stands: seats in the club's second colour, the crowd in its first.
  c.fillStyle = v.seats;
  c.fillRect(0, 26, w, 16);
  c.fillStyle = v.crowd;
  c.globalAlpha = 0.35 + 0.35 * l.day;
  for (let x = 4; x < w - 4; x += 6) {
    c.fillRect(x, 28 + ((x * 13) % 7), 2, 2);
    c.fillRect(x + 3, 32 + ((x * 7) % 6), 2, 2);
  }
  c.globalAlpha = 1;
  drawBunting(c, w, v);

  if (l.lights && v.roof !== 'dome') {
    tower(c, 32, 1 - l.day);
    tower(c, w - 32, 1 - l.day);
  }

  // The wall, in the club's colours, with the fences painted on it.
  c.fillStyle = v.wall;
  c.fillRect(0, 38, w, 12);
  c.fillStyle = v.trim;
  c.fillRect(0, 37, w, 2);
  drawWallDressing(c, w, v, l, t);
  if (board) drawBoard(c, v, board, t);
  // The batter's eye: dark behind the pitcher's release, and no taller than
  // it has to be, so the town still shows over it.
  c.fillStyle = '#0a120c';
  c.fillRect(164, 28, 92, 20);
  c.fillStyle = 'rgba(235,240,228,0.8)';
  c.font = '7px ui-monospace, monospace';
  c.textAlign = 'center';
  c.fillText(String(v.left), 50, 47);
  c.fillText(String(v.center), 210, 47);
  c.fillText(String(v.right), 370, 47);
  c.textAlign = 'left';

  c.fillStyle = l.grass;
  c.fillRect(0, 49, w, h - 49);
  c.fillStyle = l.stripe;
  for (let y = 54; y < h; y += 18) c.fillRect(0, y, w, 9);

  const clay = (x: number, y: number, rx: number, ry: number, fill: string) => {
    c.fillStyle = fill;
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    c.fill();
  };
  clay(210, 68, 76, 26, l.dirt);
  clay(210, 66, 60, 18, l.dirtLight);
  c.fillStyle = '#1e140d';
  c.fillRect(202, 58, 16, 4);
  c.fillStyle = '#e5e8e0';
  c.fillRect(202, 57, 16, 3);
  clay(210, 262, 74, 30, l.dirt);
  clay(210, 260, 58, 22, l.dirtLight);

  c.strokeStyle = 'rgba(224, 232, 220, 0.4)';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(180, plateY);
  c.lineTo(0, 80);
  c.moveTo(240, plateY);
  c.lineTo(w, 80);
  c.stroke();
  c.strokeRect(124, 232, 38, 56);
  c.strokeRect(258, 232, 38, 56);

  // Under the lights the field is lit and the sky is not: a warm wash on the grass.
  if (l.lights) {
    c.fillStyle = `rgba(255,240,200,${0.05 * (1 - l.day)})`;
    c.fillRect(0, 49, w, h - 49);
  }
}

function tower(c: CanvasRenderingContext2D, x: number, glow: number): void {
  c.strokeStyle = '#32414c';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(x - 6, 26);
  c.lineTo(x, 6);
  c.lineTo(x + 6, 26);
  c.stroke();
  c.fillStyle = '#1b252e';
  c.fillRect(x - 11, 4, 22, 8);
  c.fillStyle = '#fff9e6';
  for (let b = -9; b <= 6; b += 5) c.fillRect(x + b, 6, 3, 4);
  const g = c.createRadialGradient(x, 8, 2, x, 8, 24);
  g.addColorStop(0, `rgba(255,245,200,${0.32 * glow})`);
  g.addColorStop(1, 'rgba(255,245,200,0)');
  c.fillStyle = g;
  c.fillRect(x - 24, 0, 48, 34);
}

/** Everything past the stands. Drawn into the band from the top down to 30. */
function drawSkyline(c: CanvasRenderingContext2D, w: number, v: Venue, l: Light): void {
  const s = v.seed;
  const lit = (x: number, y: number, bw: number, bh: number) => {
    if (l.windows < 0.3) return;
    c.fillStyle = `rgba(255,214,130,${0.6 * l.windows})`;
    for (let wy = y + 2; wy < y + bh - 1; wy += 3) {
      for (let wx = x + 1; wx < x + bw - 1; wx += 3) if ((wx * 7 + wy * 3 + s) % 5 < 2) c.fillRect(wx, wy, 1, 1);
    }
  };
  const block = (x: number, bw: number, bh: number, windows = true) => {
    c.fillStyle = l.far;
    c.fillRect(x, 30 - bh, bw, bh);
    if (windows) lit(x, 30 - bh, bw, bh);
  };
  const water = (y: number) => {
    c.fillStyle = mix(l.skyLow, '#0a1a2a', 0.5);
    c.fillRect(0, y, w, 30 - y);
    c.fillStyle = `rgba(255,255,255,${0.15 + 0.2 * l.day})`;
    for (let x = s % 9; x < w; x += 11) c.fillRect(x, y + 1 + (x % 3), 4, 1);
  };
  const ridge = (peak: number, n: number, color: string) => {
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(0, 30);
    for (let i = 0; i <= n; i++) {
      const x = (w * i) / n;
      const hgt = peak * (0.45 + 0.55 * (((s >> (i % 8)) + i * 5) % 7) / 6);
      c.lineTo(x, 30 - hgt);
    }
    c.lineTo(w, 30);
    c.fill();
  };

  switch (v.skyline) {
    case 'city':
      for (let x = 0, i = 0; x < w; i++) {
        const bw = 10 + ((s + i * 7) % 14);
        block(x, bw, 8 + ((s * (i + 1)) % 20));
        x += bw + ((s + i) % 3);
      }
      // One landmark over the centre-field screen.
      block(196 + (s % 30) - 15, 7, 28);
      break;
    case 'industrial':
      for (let x = 0, i = 0; x < w; i++) {
        const bw = 18 + ((s + i * 5) % 16);
        block(x, bw, 5 + ((s + i * 3) % 7));
        if (i % 2 === 0) {
          c.fillStyle = l.far;
          c.fillRect(x + 4, 30 - 22, 4, 22);
          c.fillStyle = `rgba(160,160,160,${0.2 + 0.15 * l.day})`;
          c.fillRect(x + 3, 30 - 26, 6, 3);
        }
        x += bw + 4;
      }
      break;
    case 'bridge': {
      water(20);
      c.strokeStyle = l.far;
      c.lineWidth = 2;
      const a = 60 + (s % 60);
      const b = a + 180;
      c.beginPath();
      c.moveTo(0, 18);
      c.lineTo(w, 18);
      c.moveTo(a, 18);
      c.lineTo(a, 2);
      c.moveTo(b, 18);
      c.lineTo(b, 2);
      c.stroke();
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(0, 12);
      c.quadraticCurveTo(a / 2, 16, a, 2);
      c.quadraticCurveTo((a + b) / 2, 20, b, 2);
      c.quadraticCurveTo((b + w) / 2, 16, w, 12);
      c.stroke();
      if (l.lights) {
        c.fillStyle = `rgba(255,214,130,${0.7 * l.windows})`;
        for (let x = 4; x < w; x += 12) c.fillRect(x, 17, 1, 1);
      }
      break;
    }
    case 'water':
      water(16);
      for (let i = 0; i < 3; i++) block(((s * (i + 2)) % (w - 30)) + 5, 16 + (i * 9) % 10, 4 + ((s + i) % 5));
      // A boat.
      c.fillStyle = l.far;
      c.fillRect((s * 3) % (w - 20), 21, 14, 2);
      c.fillRect(((s * 3) % (w - 20)) + 5, 16, 1, 5);
      break;
    case 'hills':
      ridge(12, 9, mix(l.far, l.skyLow, 0.35));
      ridge(7, 14, l.far);
      break;
    case 'mountains':
      ridge(26, 7, mix(l.far, l.skyLow, 0.3));
      // Snow on the peaks, in any light.
      c.fillStyle = `rgba(240,244,250,${0.35 + 0.4 * l.day})`;
      for (let i = 1; i < 7; i++) {
        const x = (w * i) / 7;
        c.fillRect(x - 3, 30 - 26 * (0.45 + 0.55 * (((s >> (i % 8)) + i * 5) % 7) / 6), 6, 2);
      }
      ridge(9, 12, l.far);
      break;
    case 'desert':
      for (let i = 0; i < 3; i++) {
        const x = ((s * (i + 1) * 53) % (w - 60)) + 10;
        c.fillStyle = mix(l.far, '#8a4a2a', 0.35 * l.day);
        c.fillRect(x, 30 - 12 - i * 3, 44 + i * 8, 12 + i * 3);
        c.fillRect(x - 6, 30 - 5, 58 + i * 8, 5);
      }
      for (let x = s % 40; x < w; x += 70) {
        c.fillStyle = l.far;
        c.fillRect(x, 16, 2, 14);
        c.fillRect(x - 3, 20, 3, 1);
        c.fillRect(x - 3, 18, 1, 3);
        c.fillRect(x + 2, 19, 3, 1);
        c.fillRect(x + 4, 17, 1, 3);
      }
      break;
    case 'plains':
      c.fillStyle = mix(l.far, '#8a7a3a', 0.3 * l.day);
      c.fillRect(0, 26, w, 4);
      // A grain elevator and a water tower on the flat.
      block(60 + (s % 50), 14, 20, false);
      block(80 + (s % 50), 8, 16, false);
      c.fillStyle = l.far;
      c.fillRect(300 - (s % 40), 12, 14, 6);
      c.fillRect(306 - (s % 40), 18, 2, 10);
      break;
    case 'palms':
      for (let x = s % 30; x < w; x += 34 + (x % 11)) {
        const top = 8 + (x % 7);
        c.strokeStyle = l.far;
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(x, 30);
        c.quadraticCurveTo(x + 2, 20, x + 3, top);
        c.stroke();
        c.lineWidth = 1;
        c.beginPath();
        for (const d of [-7, -4, 4, 7]) {
          c.moveTo(x + 3, top);
          c.quadraticCurveTo(x + 3 + d * 0.6, top - 3, x + 3 + d, top + 3);
        }
        c.stroke();
      }
      break;
  }
}

// ------------------------------------------------------------------ colour

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** `a` blended toward `b` by `k`, as #rrggbb. */
export function mix(a: string, b: string, k: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return (
    '#' +
    x.map((v, i) => Math.round(v + (y[i]! - v) * k).toString(16).padStart(2, '0')).join('')
  );
}
