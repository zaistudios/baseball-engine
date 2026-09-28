/**
 * WHAT MAKES ONE PARK THAT PARK — the landmark over the wall, the weather,
 * the roof, the scoreboard, and how far into the future the place lives.
 *
 * The league is a century from now and still has the old yards in it, so the
 * backdrop borrows from both ends. The Grange keeps a hand-turned scoreboard
 * and pennants on a wire because the Holdouts are nine humans; the Foundry
 * Yard has a holographic board and drones over the lights because the
 * Foundry is nine machines (eraOf() in venue.ts). The landmarks mix the same
 * way: the Arch and a lighthouse, a space-elevator tether and a maglev.
 *
 * Every painter draws into the band behind the stands — the skyline's
 * baseline is y 30 and the sky ends at 44 — and stays off the middle, where
 * the pitcher stands and the scoreboard hangs. `t` is the page clock in ms,
 * for the few things that move: a beam, a train, a wheel, a flake.
 *
 * ⚠️ PRESENTATION ONLY, like the rest of venue.ts.
 */

import type { Light, Venue } from './venue.ts';
import { mix } from './venue.ts';

type Ctx = CanvasRenderingContext2D;
interface Scene {
  c: Ctx;
  w: number;
  v: Venue;
  l: Light;
  t: number;
}

/** A lit window's colour at this hour, or null in daylight. */
const glow = (l: Light, a = 0.7): string | null =>
  l.windows < 0.3 ? null : `rgba(255,214,130,${a * l.windows})`;

const rect = (c: Ctx, fill: string, x: number, y: number, w: number, h: number) => {
  c.fillStyle = fill;
  c.fillRect(x, y, w, h);
};

const poly = (c: Ctx, fill: string, pts: readonly number[]) => {
  c.fillStyle = fill;
  c.beginPath();
  c.moveTo(pts[0]!, pts[1]!);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i]!, pts[i + 1]!);
  c.closePath();
  c.fill();
};

const line = (c: Ctx, stroke: string, width: number, pts: readonly number[]) => {
  c.strokeStyle = stroke;
  c.lineWidth = width;
  c.beginPath();
  c.moveTo(pts[0]!, pts[1]!);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i]!, pts[i + 1]!);
  c.stroke();
};

const disc = (c: Ctx, fill: string, x: number, y: number, r: number) => {
  c.fillStyle = fill;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
};

/** A slowly blinking aircraft-warning light on anything tall. */
const beacon = (s: Scene, x: number, y: number) => {
  if (s.l.day < 0.6 && Math.floor(s.t / 900) % 2 === 0) rect(s.c, '#ff4a3a', x - 1, y - 1, 2, 2);
};

// ------------------------------------------------------------ the landmarks

const LANDMARKS: Record<string, (s: Scene) => void> = {
  /** The Cathedral: a spire over right, and a lit sky-bridge between two towers in left. */
  spire({ c, l, t, ...s }) {
    const f = l.far;
    rect(c, f, 292, 14, 28, 16);
    poly(c, f, [292, 14, 306, 0, 320, 14]);
    rect(c, f, 303, 2, 6, 12);
    const g = glow(l, 0.9);
    if (g) disc(c, g, 306, 20, 3);
    rect(c, f, 52, 2, 12, 28);
    rect(c, f, 96, 6, 12, 24);
    line(c, g ?? mix(f, '#9fd8ff', 0.4), 2, [64, 10, 96, 10]);
    beacon({ c, l, t, ...s }, 58, 2);
  },
  /** Ironworks Park: a shipyard gantry crane over the river. */
  gantry(s) {
    const { c, l } = s;
    line(s.c, l.far, 2, [320, 30, 320, 6, 346, 30]);
    line(c, l.far, 2, [286, 6, 390, 6]);
    line(c, l.far, 1, [370, 6, 370, 18]);
    rect(c, l.far, 366, 18, 8, 3);
    beacon(s, 390, 6);
  },
  /** The Basin: the club's name spelled on the hills. */
  sign({ c, l, v }) {
    poly(c, mix(l.far, l.skyLow, 0.25), [0, 30, 30, 12, 90, 8, 150, 16, 170, 30]);
    c.fillStyle = `rgba(240,240,232,${0.5 + 0.4 * l.day})`;
    c.font = 'bold 7px ui-monospace, monospace';
    c.fillText(v.sign.split('').join(' '), 34, 20);
  },
  /** Cistern Field: the aqueduct behind the bleachers — and water in it that glows after dark. */
  aqueduct({ c, l, w }) {
    rect(c, l.far, 0, 14, w, 4);
    for (let x = 0; x < w; x += 18) rect(c, l.far, x, 18, 5, 12);
    const water = l.day < 0.5 ? `rgba(90,220,255,${0.8 - l.day})` : mix(l.far, '#6aa8c8', 0.4);
    rect(c, water, 0, 13, w, 1);
  },
  /** Engine House: a brick firehouse bell tower and a water tower. */
  firehouse(s) {
    const { c, l } = s;
    const brick = mix(l.far, '#7a3a2a', 0.45 * l.day + 0.15);
    rect(c, brick, 66, 8, 16, 22);
    poly(c, brick, [64, 8, 74, 0, 84, 8]);
    disc(c, mix(brick, '#d8b44a', 0.6), 74, 12, 2);
    rect(c, l.far, 326, 8, 20, 10);
    line(c, l.far, 1, [328, 18, 326, 30, 336, 18, 336, 30, 344, 18, 346, 30]);
    beacon(s, 336, 8);
  },
  /** The Trellis: the neighbours' rooftop bleachers across the street, full. */
  rooftops({ c, l, v }) {
    for (const [x, bw, y] of [[20, 50, 16], [76, 40, 19], [290, 44, 17], [340, 56, 15]] as const) {
      rect(c, mix(l.far, '#6a4a3a', 0.35), x, y, bw, 30 - y);
      rect(c, l.far, x, y - 3, bw, 2);
      c.fillStyle = v.crowd;
      for (let k = x + 2; k < x + bw - 2; k += 3) c.fillRect(k, y - 5 + (k % 2), 2, 2);
    }
  },
  /** The Grange: a red barn and a silo past the fence, the way it has always been. */
  barn({ c, l }) {
    const red = mix(l.far, '#8a2a20', 0.6 * l.day + 0.1);
    rect(c, red, 300, 18, 36, 12);
    poly(c, red, [296, 18, 306, 10, 330, 10, 340, 18]);
    rect(c, 'rgba(240,235,220,0.5)', 312, 20, 12, 10);
    rect(c, mix(l.far, '#a8a8a0', 0.4), 344, 8, 10, 22);
    disc(c, mix(l.far, '#a8a8a0', 0.4), 349, 8, 5);
  },
  /** The Wharf: the brick warehouse in right, close enough to hit. */
  warehouse({ c, l, w }) {
    const brick = mix(l.far, '#8a4a30', 0.5 * l.day + 0.15);
    rect(c, brick, 282, 4, w - 282, 26);
    for (let y = 8; y < 26; y += 5) {
      for (let x = 286; x < w - 2; x += 7) rect(c, glow(l, 0.8) ?? 'rgba(20,20,30,0.45)', x, y, 3, 3);
    }
  },
  /** The Drift: grain elevators on the lake. */
  elevators({ c, l }) {
    const con = mix(l.far, '#c8c0b0', 0.3 * l.day);
    for (let i = 0; i < 5; i++) rect(c, con, 40 + i * 11, 8, 10, 22);
    rect(c, con, 44, 2, 30, 6);
    rect(c, glow(l) ?? 'rgba(0,0,0,0)', 50, 4, 2, 2);
  },
  /** The Sty: a paddle-wheeler working the river, wheel turning. */
  paddleboat({ c, l, t, w }) {
    const x = ((t / 90) % (w + 80)) - 60;
    rect(c, mix(l.far, '#e0ddd0', 0.5 * l.day), x, 22, 44, 5);
    rect(c, mix(l.far, '#e0ddd0', 0.4 * l.day), x + 6, 17, 30, 5);
    rect(c, l.far, x + 12, 8, 3, 9);
    rect(c, l.far, x + 20, 8, 3, 9);
    const a = t / 300;
    for (let k = 0; k < 4; k++) {
      const r = a + (k * Math.PI) / 4;
      line(c, l.far, 1, [x + 48 - Math.cos(r) * 5, 24 - Math.sin(r) * 5, x + 48 + Math.cos(r) * 5, 24 + Math.sin(r) * 5]);
    }
    const g = glow(l, 0.9);
    if (g) for (let k = x + 8; k < x + 36; k += 5) rect(c, g, k, 18, 2, 2);
  },
  /** The Rivetworks: its high wall in left is drawn with the wall. Here, the works themselves. */
  highwall({ c, l, t }) {
    rect(c, l.far, 300, 12, 60, 18);
    for (let x = 306; x < 360; x += 12) poly(c, l.far, [x, 12, x + 6, 6, x + 12, 12]);
    rect(c, `rgba(255,140,60,${0.35 + 0.25 * Math.sin(t / 400)})`, 320, 20, 20, 3);
  },
  /** The Void: a space-elevator tether out of the mountains, a climber on its way up. */
  tether({ c, l, t }) {
    // Out of the top of the frame and on up: the Void is where it goes.
    line(c, l.day < 0.5 ? 'rgba(140,220,255,0.8)' : 'rgba(230,240,255,0.85)', 2, [340, 30, 340, 0]);
    poly(c, mix(l.far, '#c8d0dc', 0.3 * l.day), [322, 30, 330, 18, 350, 18, 358, 30]);
    rect(c, glow(l, 1) ?? 'rgba(255,255,255,0.4)', 330, 22, 20, 1);
    const y = 18 - ((t / 60) % 22);
    rect(c, l.day < 0.5 ? '#ffffff' : '#ffb040', 337, y, 6, 3);
    if (l.day < 0.6) {
      const g = c.createRadialGradient(340, 22, 1, 340, 22, 16);
      g.addColorStop(0, `rgba(140,220,255,${0.4 * (1 - l.day)})`);
      g.addColorStop(1, 'rgba(140,220,255,0)');
      c.fillStyle = g;
      c.fillRect(324, 6, 32, 30);
    }
  },
  /** The Foundry Yard: a pour glowing in the open furnace door, and a robot arm feeding it. */
  furnace({ c, l, t }) {
    rect(c, l.far, 36, 12, 80, 18);
    rect(c, l.far, 48, 0, 6, 12);
    rect(c, l.far, 96, 2, 6, 10);
    const heat = 0.55 + 0.3 * Math.sin(t / 250);
    rect(c, `rgba(255,120,40,${heat})`, 64, 18, 22, 12);
    rect(c, `rgba(255,220,120,${heat})`, 70, 22, 10, 8);
    // The arm: base, upper, forearm, swinging slowly.
    const a = Math.sin(t / 1400) * 0.5;
    const ex = 330 + Math.cos(-1.2 + a) * 14;
    const ey = 26 + Math.sin(-1.2 + a) * 14;
    line(c, mix(l.far, '#c8ccd4', 0.35), 3, [330, 30, 330, 26, ex, ey, ex + 12, ey + 4]);
    disc(c, '#ffb040', ex + 12, ey + 4, 1.5);
  },
  /** The Tank: under the dome, an aquarium wall behind centre, and things swimming in it. */
  aquarium({ c, t }) {
    const g = c.createLinearGradient(0, 8, 0, 30);
    g.addColorStop(0, '#1a6a8a');
    g.addColorStop(1, '#0c3048');
    c.fillStyle = g;
    c.fillRect(60, 8, 300, 22);
    rect(c, 'rgba(200,240,255,0.25)', 60, 8, 300, 1);
    for (let i = 0; i < 7; i++) {
      const dir = i % 2 ? 1 : -1;
      const x = 60 + ((((t / (40 + i * 7)) * dir + i * 97) % 300) + 300) % 300;
      const y = 12 + ((i * 5) % 15);
      c.fillStyle = ['#ffb040', '#ff6a8a', '#9ff0ff', '#e8e060'][i % 4]!;
      c.beginPath();
      c.ellipse(x, y, 3, 1.5, 0, 0, Math.PI * 2);
      c.fill();
      poly(c, c.fillStyle as string, [x - 3 * dir, y, x - 5 * dir, y - 2, x - 5 * dir, y + 2]);
    }
    for (let i = 0; i < 5; i++) disc(c, 'rgba(220,250,255,0.5)', 80 + i * 60, 28 - ((t / 30 + i * 40) % 20), 0.8);
  },
  /** The Yardworks: the fountains past the wall, the city's old signature, rising and falling. */
  fountains({ c, t }) {
    for (const x of [40, 90, 330, 380]) {
      const hgt = 10 + 6 * Math.sin(t / 500 + x);
      for (let k = -2; k <= 2; k++) line(c, 'rgba(210,235,255,0.55)', 1, [x, 30, x + k * 2, 30 - hgt]);
    }
  },
  /** The Landing: a glass pyramid on the river, its apex lit after dark. */
  pyramid({ c, l }) {
    poly(c, mix(l.far, '#b8c8d8', 0.35 * l.day), [296, 30, 340, 2, 384, 30]);
    line(c, 'rgba(255,255,255,0.2)', 1, [340, 2, 330, 30]);
    if (l.day < 0.6) {
      line(c, `rgba(200,230,255,${0.5 * (1 - l.day)})`, 2, [340, 2, 340, -40]);
      disc(c, '#e8f4ff', 340, 3, 2);
    }
  },
  /** The Cooperage: barrels stacked by the brewhouse, and fireworks after dark. */
  barrels({ c, l, t }) {
    const oak = mix(l.far, '#7a5a30', 0.5 * l.day + 0.1);
    for (let row = 0; row < 3; row++) {
      for (let k = 0; k < 4 - row; k++) disc(c, oak, 70 + k * 10 + row * 5, 26 - row * 8, 4.5);
    }
    rect(c, l.far, 300, 10, 50, 20);
    rect(c, l.far, 312, 2, 6, 8);
    if (l.day < 0.35) {
      const cycle = t % 3600;
      if (cycle < 1200) {
        const k = cycle / 1200;
        const bx = 150 + ((Math.floor(t / 3600) * 97) % 140);
        c.fillStyle = `rgba(255,${160 + ((bx * 3) % 90)},90,${1 - k})`;
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          c.fillRect(bx + Math.cos(a) * 14 * k, 10 + Math.sin(a) * 10 * k, 2, 2);
        }
      }
    }
  },
  /** The Mill: limestone, a flour sign on the roof, a wheel still turning. */
  mill({ c, l, t }) {
    const stone = mix(l.far, '#c8c0a8', 0.4 * l.day + 0.1);
    rect(c, stone, 290, 10, 44, 20);
    c.fillStyle = glow(l, 1) ?? 'rgba(240,235,220,0.8)';
    c.font = '6px ui-monospace, monospace';
    c.fillText('FLOUR', 297, 8);
    const a = t / 700;
    c.strokeStyle = l.far;
    c.lineWidth = 1;
    c.beginPath();
    c.arc(344, 24, 7, 0, Math.PI * 2);
    for (let k = 0; k < 4; k++) {
      const r = a + (k * Math.PI) / 4;
      c.moveTo(344 - Math.cos(r) * 7, 24 - Math.sin(r) * 7);
      c.lineTo(344 + Math.cos(r) * 7, 24 + Math.sin(r) * 7);
    }
    c.stroke();
  },
  /** The Pound: a lighthouse on the point, and its beam sweeping after dark. */
  lighthouse({ c, l, t }) {
    poly(c, '#e8e4dc', [344, 30, 347, 4, 355, 4, 358, 30]);
    for (let y = 8; y < 30; y += 8) rect(c, '#b83a2c', 345, y, 12, 3);
    rect(c, l.far, 346, 0, 10, 4);
    if (l.day < 0.7) {
      const a = (t / 1600) % (Math.PI * 2);
      const reach = 160 * Math.abs(Math.cos(a));
      const dir = Math.cos(a) > 0 ? 1 : -1;
      poly(c, `rgba(255,245,200,${0.25 * (1 - l.day)})`, [351, 2, 351 + dir * reach, -6, 351 + dir * reach, 10]);
      disc(c, '#fff8d0', 351, 2, 2);
    }
  },
  /** The Common: two white meeting-house steeples over the rooftops. */
  steeples({ c, l }) {
    const white = mix(l.far, '#e8e8e0', 0.5 * l.day + 0.2);
    for (const x of [60, 332]) {
      rect(c, white, x, 16, 18, 14);
      rect(c, white, x + 6, 6, 6, 10);
      poly(c, white, [x + 5, 6, x + 9, -4, x + 13, 6]);
    }
    for (let x = 84; x < 160; x += 14) rect(c, mix(l.far, '#7a3a2a', 0.4), x, 20, 12, 10);
  },
  /** The Quarter: wrought-iron balconies in pastel, and a streetcar going by. */
  balconies({ c, l, t, w }) {
    const pastel = ['#c89a8a', '#9ab8a0', '#d8c890', '#a0a8c8'];
    for (let i = 0; i < 6; i++) {
      const x = 4 + i * 24;
      rect(c, mix(l.far, pastel[i % 4]!, 0.45 * l.day + 0.1), x, 12, 22, 18);
      line(c, l.far, 1, [x, 19, x + 22, 19]);
      line(c, l.far, 1, [x, 25, x + 22, 25]);
      rect(c, glow(l) ?? 'rgba(20,20,30,0.3)', x + 4, 14, 3, 4);
      rect(c, glow(l) ?? 'rgba(20,20,30,0.3)', x + 14, 20, 3, 4);
    }
    const x = w - ((t / 70) % (w + 60));
    rect(c, mix(l.far, '#3a7a4a', 0.5), x, 20, 30, 8);
    rect(c, glow(l, 0.9) ?? 'rgba(220,230,220,0.5)', x + 3, 21, 24, 3);
  },
  /** The Section: wind turbines turning over the flat. */
  turbines({ c, l, t }) {
    for (const [x, top] of [[50, 6], [100, 10], [330, 4], [380, 9]] as const) {
      line(c, mix(l.far, '#dfe4e8', 0.5 * l.day), 1, [x, 30, x, top]);
      const a = t / 900 + x;
      for (let k = 0; k < 3; k++) {
        const r = a + (k * 2 * Math.PI) / 3;
        line(c, mix(l.far, '#eef2f4', 0.6 * l.day), 1, [x, top, x + Math.cos(r) * 9, top + Math.sin(r) * 9]);
      }
      beacon({ c, l, t } as Scene, x, top);
    }
  },
  /** The Navy Yard: a grey warship at the pier and a hammerhead crane. */
  ships({ c, l }) {
    const grey = mix(l.far, '#6a7480', 0.4 * l.day);
    poly(c, grey, [280, 24, 290, 30, 390, 30, 400, 24]);
    rect(c, grey, 310, 16, 40, 8);
    rect(c, grey, 326, 8, 10, 8);
    line(c, grey, 1, [350, 20, 372, 16]);
    line(c, l.far, 2, [80, 30, 80, 6]);
    line(c, l.far, 2, [56, 6, 110, 6]);
  },
  /** The Kiln: beehive kilns, and the solar field glinting past them. */
  kilns({ c, l }) {
    const clay = mix(l.far, '#9a5a3a', 0.5 * l.day + 0.1);
    for (const x of [50, 76, 102]) {
      c.fillStyle = clay;
      c.beginPath();
      c.arc(x, 30, 11, Math.PI, 0);
      c.fill();
      rect(c, clay, x - 2, 12, 4, 8);
    }
    for (let x = 290; x < 400; x += 12) poly(c, mix('#1a2a4a', '#8ab0e0', 0.5 * l.day), [x, 30, x + 4, 24, x + 14, 24, x + 10, 30]);
  },
  /** The Puddle: the incline up the bluff, a car climbing it. */
  incline({ c, l, t }) {
    poly(c, mix(l.far, '#4a5a3a', 0.3), [0, 30, 0, 4, 60, 8, 130, 30]);
    line(c, mix(l.far, '#d8b44a', 0.5), 1, [110, 30, 20, 6]);
    const k = (Math.sin(t / 3000) + 1) / 2;
    rect(c, '#d8b44a', 110 - 90 * k - 3, 30 - 24 * k - 3, 6, 4);
  },
  /** The Cloudbank: the needle over the sound. */
  needle(s) {
    const { c, l } = s;
    line(c, mix(l.far, '#e0e4e8', 0.4 * l.day), 2, [330, 30, 336, 8, 342, 30]);
    c.fillStyle = mix(l.far, '#e0e4e8', 0.5 * l.day);
    c.beginPath();
    c.ellipse(336, 7, 12, 2.5, 0, 0, Math.PI * 2);
    c.fill();
    line(c, l.far, 1, [336, 4, 336, -4]);
    beacon(s, 336, -3);
    const g = glow(l, 0.9);
    if (g) rect(c, g, 326, 6, 20, 1);
  },
  /** The Horn: the rock in the bay and the light on it. The fog does the rest. */
  foghorn({ c, l, t }) {
    poly(c, l.far, [40, 30, 52, 20, 100, 18, 116, 30]);
    rect(c, l.far, 66, 12, 20, 6);
    rect(c, l.far, 82, 6, 4, 6);
    if (Math.floor(t / 1300) % 3 === 0) disc(c, '#fff4c0', 84, 6, 2);
  },
  /** The Crossing: the Arch. */
  arch({ c, l }) {
    const steel = mix(l.far, '#dfe6ee', 0.55 * l.day + 0.1);
    c.strokeStyle = steel;
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(304, 30);
    c.quadraticCurveTo(336, -26, 368, 30);
    c.stroke();
    if (l.day > 0.5) line(c, 'rgba(255,255,255,0.35)', 1, [307, 26, 318, 8]);
  },
  /** The Skillet: pumpjacks nodding in the heat. */
  derricks({ c, l, t }) {
    for (const [x, p] of [[50, 0], [104, 2], [334, 4], [380, 1]] as const) {
      const a = Math.sin(t / 700 + p) * 0.35;
      poly(c, l.far, [x - 4, 30, x, 20, x + 4, 30]);
      const dx = Math.cos(a) * 12;
      const dy = Math.sin(a) * 12;
      line(c, l.far, 2, [x - dx, 20 - dy, x + dx, 20 + dy]);
      rect(c, l.far, x + dx - 1, 20 + dy - 1, 4, 6);
    }
  },
  /** The Terminal: the tower over the lake, and the maglev running along the shore. */
  maglev(s) {
    const { c, l, t, w } = s;
    // Clear of the rolled-back roof over both corners.
    const tw = mix(l.far, '#c8ccd0', 0.4 * l.day);
    line(c, tw, 3, [268, 30, 268, 0]);
    rect(c, tw, 262, 9, 12, 4);
    rect(c, glow(l, 1) ?? 'rgba(255,255,255,0.3)', 263, 10, 10, 1);
    beacon(s, 268, 1);
    rect(c, l.far, 0, 24, w, 1);
    const x = ((t / 14) % (w + 400)) - 200;
    c.fillStyle = mix(l.far, '#e8ecf0', 0.6 * l.day + 0.2);
    c.beginPath();
    c.ellipse(x + 40, 22, 42, 2.5, 0, 0, Math.PI * 2);
    c.fill();
    rect(c, l.day < 0.5 ? '#7ae8ff' : 'rgba(60,120,160,0.6)', x + 6, 22, 68, 1);
  },
};

/** Every landmark there is a painter for. PARK_LOOK in venue.ts may only name these. */
export const LANDMARK_NAMES: readonly string[] = Object.keys(LANDMARKS);

export function drawLandmark(c: Ctx, w: number, v: Venue, l: Light, t: number): void {
  LANDMARKS[v.landmark]?.({ c, w, v, l, t });
}

// ------------------------------------------------------------- the future

/**
 * WHAT IS IN THE SKY. A dirigible over the parks that are neither old nor
 * new, and after dark a swarm of camera drones over the ones that are new.
 */
export function drawSkyTraffic(c: Ctx, w: number, v: Venue, l: Light, t: number): void {
  if (v.roof === 'dome') return;
  if (v.era > 0.2 && v.era < 0.7 && v.seed % 3 !== 0) {
    const x = ((t / 120 + v.seed) % (w + 120)) - 60;
    const hull = mix(l.far, '#d8d4c8', 0.6 * l.day + 0.15);
    c.fillStyle = hull;
    c.beginPath();
    c.ellipse(x, 8, 18, 5, 0, 0, Math.PI * 2);
    c.fill();
    poly(c, hull, [x - 16, 8, x - 22, 3, x - 22, 13]);
    rect(c, l.far, x - 4, 12, 8, 3);
    rect(c, l.day < 0.5 ? '#ffd080' : v.trim, x - 10, 7, 20, 2);
  }
  if (v.era >= 0.55 && l.day < 0.6) {
    for (let i = 0; i < 6; i++) {
      const a = t / 2400 + i * 1.05;
      const x = 210 + Math.cos(a) * (110 + i * 12);
      const y = 12 + Math.sin(a * 1.7) * 6;
      rect(c, Math.floor(t / 400 + i) % 2 ? '#7ae8ff' : '#ff5a8a', x, y, 2, 1);
    }
  }
}

/**
 * THE ROOF. A dome covers the sky with its ribs and a ring of lamps; a
 * retractable one is rolled back and sits over both corners.
 */
export function drawRoof(c: Ctx, w: number, v: Venue): void {
  if (v.roof === 'dome') {
    const g = c.createLinearGradient(0, 0, 0, 30);
    g.addColorStop(0, '#0e131c');
    g.addColorStop(1, '#232c3a');
    c.fillStyle = g;
    c.fillRect(0, 0, w, 30);
    for (let x = -200; x <= w + 200; x += 40) line(c, 'rgba(120,140,170,0.35)', 1, [210, -120, x, 30]);
    for (let x = 8; x < w; x += 16) rect(c, '#fff4d8', x, 3, 3, 1);
  } else if (v.roof === 'retract') {
    const steel = '#3a4450';
    poly(c, steel, [0, 0, 120, 0, 60, 14, 0, 18]);
    poly(c, steel, [w, 0, w - 120, 0, w - 60, 14, w, 18]);
    for (let k = 0; k < 5; k++) {
      line(c, 'rgba(160,175,190,0.5)', 1, [k * 24, 0, k * 12, 16]);
      line(c, 'rgba(160,175,190,0.5)', 1, [w - k * 24, 0, w - k * 12, 16]);
    }
  }
}

/**
 * THE WEATHER, over the skyline and the top of the wall and never over the
 * zone: marine fog rolling in, lake-effect snow, a dust wind off the plains,
 * wet river haze, and heat coming off the desert.
 */
export function drawWeather(c: Ctx, w: number, v: Venue, l: Light, t: number): void {
  if (v.roof === 'dome') return;
  switch (v.weather) {
    case 'fog':
      for (let i = 0; i < 3; i++) {
        const x = ((t / (80 + i * 30) + i * 140) % (w + 200)) - 200;
        const g = c.createLinearGradient(x, 0, x + 260, 0);
        const a = 0.3 + 0.1 * l.day;
        g.addColorStop(0, 'rgba(210,218,226,0)');
        g.addColorStop(0.5, `rgba(210,218,226,${a})`);
        g.addColorStop(1, 'rgba(210,218,226,0)');
        c.fillStyle = g;
        c.fillRect(x, 10 + i * 6, 260, 10);
      }
      break;
    case 'snow':
      c.fillStyle = 'rgba(245,248,255,0.8)';
      for (let i = 0; i < 40; i++) {
        const x = ((i * 53 + t / (20 + (i % 5) * 6)) % w + w) % w;
        const y = (i * 37 + t / (14 + (i % 4) * 5)) % 64;
        c.fillRect(x + Math.sin(t / 500 + i) * 2, y, i % 3 ? 1 : 2, i % 3 ? 1 : 2);
      }
      break;
    case 'dust': {
      rect(c, `rgba(170,130,80,${0.18 + 0.08 * Math.sin(t / 2000)})`, 0, 0, w, 44);
      c.fillStyle = 'rgba(200,160,110,0.35)';
      for (let i = 0; i < 12; i++) c.fillRect((i * 47 + t / 8) % w, 6 + ((i * 11) % 30), 10, 1);
      break;
    }
    case 'haze':
      rect(c, `rgba(230,200,160,${0.08 + 0.1 * l.day})`, 0, 0, w, 36);
      break;
    case 'heat':
      if (l.day > 0.4) {
        for (let i = 0; i < 4; i++) {
          const y = 27 + i;
          c.strokeStyle = `rgba(255,230,190,${0.12 + 0.08 * Math.sin(t / 150 + i)})`;
          c.beginPath();
          for (let x = 0; x <= w; x += 10) c.lineTo(x, y + Math.sin(x / 9 + t / 200 + i) * 0.8);
          c.stroke();
        }
      }
      break;
  }
}

/**
 * THE STANDS DRESSED FOR THEIR ERA: pennants on a wire at the old yards,
 * nothing at all at the new ones, which let the light do it.
 */
export function drawBunting(c: Ctx, w: number, v: Venue): void {
  if (v.era >= 0.3) return;
  line(c, 'rgba(200,200,190,0.4)', 1, [0, 25, w, 25]);
  for (let x = 4, i = 0; x < w; x += 12, i++) poly(c, i % 2 ? v.trim : v.crowd, [x, 25, x + 6, 25, x + 3, 30]);
}

/**
 * THE WALL, DRESSED. Painted signs at the old yards; hologram panels that
 * flicker at the new ones; and the Rivetworks' high wall in left.
 */
export function drawWallDressing(c: Ctx, w: number, v: Venue, l: Light, t: number): void {
  if (v.landmark === 'highwall') {
    rect(c, v.wall, 0, 24, 130, 14);
    rect(c, v.trim, 0, 23, 130, 1);
    rect(c, '#0a120c', 60, 27, 40, 8);
  }
  const panels = [70, 110, 290, 330];
  if (v.era < 0.35) {
    for (const x of panels) {
      rect(c, 'rgba(232,222,190,0.75)', x, 40, 26, 7);
      rect(c, v.crowd, x + 3, 42, 20, 1);
      rect(c, v.crowd, x + 3, 44, 14, 1);
    }
  } else if (v.era > 0.6) {
    for (const x of panels) {
      const a = 0.35 + 0.15 * Math.sin(t / 300 + x);
      rect(c, `rgba(90,220,255,${a})`, x, 40, 26, 7);
      for (let y = 40; y < 47; y += 2) rect(c, `rgba(200,250,255,${a * 0.6})`, x, y, 26, 1);
    }
    // The trim along the top of the wall is lit, not painted.
    rect(c, `rgba(120,230,255,${0.35 + 0.35 * (1 - l.day)})`, 0, 36, w, 1);
  }
}

export interface Board {
  away: string;
  home: string;
  a: number;
  h: number;
  inning: number;
  top: boolean;
}

/**
 * THE SCOREBOARD over the batter's eye, and it shows the real score. What
 * kind of board it is comes from the club's era: a hand-turned green one with
 * white cards, a bulb board, or a hologram.
 */
export function drawBoard(c: Ctx, v: Venue, b: Board, t: number): void {
  const x = 180;
  const y = 2;
  const bw = 60;
  const bh = 17;
  const style = v.era < 0.34 ? 'hand' : v.era < 0.67 ? 'bulb' : 'holo';
  if (style === 'hand') {
    rect(c, '#1f4a2c', x, y, bw, bh);
    rect(c, '#dcd6c0', x, y, bw, 1);
  } else if (style === 'bulb') {
    rect(c, '#0b0d10', x, y, bw, bh);
  } else {
    rect(c, `rgba(40,160,210,${0.28 + 0.05 * Math.sin(t / 120)})`, x, y, bw, bh);
    for (let k = y; k < y + bh; k += 2) rect(c, 'rgba(160,240,255,0.12)', x, k, bw, 1);
  }
  const ink = style === 'hand' ? '#f4f0e0' : style === 'bulb' ? '#ffb840' : '#bff4ff';
  c.font = '6px ui-monospace, monospace';
  c.textAlign = 'left';
  const row = (abbr: string, runs: number, ry: number) => {
    c.fillStyle = ink;
    c.fillText(abbr, x + 3, ry);
    if (style === 'hand') rect(c, '#f4f0e0', x + 37, ry - 5, 9, 6);
    c.fillStyle = style === 'hand' ? '#1a1a1a' : ink;
    c.fillText(String(runs).padStart(2, ' '), x + 37, ry);
  };
  row(b.away, b.a, y + 8);
  row(b.home, b.h, y + 15);
  c.fillStyle = ink;
  c.fillText(`${b.top ? '▲' : '▼'}${b.inning}`, x + 48, y + 11);
}
