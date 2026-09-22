import { createServer } from 'vite';
import { chromium } from 'file:///C:/Users/zaneg/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';

const server = await createServer({ configFile: 'vite.game.config.ts', server: { port: 5199 } });
await server.listen();
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.addInitScript('window.__name = (fn) => fn; globalThis.__name = (fn) => fn;');
await page.goto('http://localhost:5199/game.html');
await page.waitForLoadState('networkidle');
await (await page.waitForSelector('button[data-go="exhibition"]', { timeout: 8000 })).click();
await page.waitForTimeout(300);
await (await page.waitForSelector('button[data-i="0"]', { timeout: 5000 })).click();
await page.waitForTimeout(300);
await (await page.waitForSelector('button[data-i="1"]', { timeout: 5000 })).click();
await page.waitForTimeout(800);
await page.waitForSelector('#field', { timeout: 8000 });
console.log('REACHED: Title -> EXHIBITION -> two clubs -> the at-bat view');

// T flips MANUAL -> watch, so the league plays itself and every pitch is drawn
// by the same spotXY() a pitch you take is drawn by.
await page.keyboard.press('t');
await page.waitForTimeout(500);

const shots = await page.evaluate(async () => {
  const c = document.getElementById('field');
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const ball = () => {
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0, sx = 0, sy = 0;
    for (let y = 30; y < 300; y++)
      for (let x = 50; x < 390; x++) {
        const i = (y * c.width + x) * 4;
        if (d[i] > 228 && d[i + 1] > 228 && d[i + 2] > 205) { n++; sx += x; sy += y; }
      }
    return n ? { n, x: sx / n, y: sy / n } : null;
  };
  const out = [];
  const t0 = performance.now();
  let armed = true;
  while (performance.now() - t0 < 90000 && out.length < 40) {
    await new Promise((r) => requestAnimationFrame(r));
    const b = ball();
    if (!b) { armed = true; continue; }
    // r = 2.5 + 7t^2, so area ~ 250 is the ball arriving at the plate. One
    // capture per pitch, at the frame it gets there.
    if (armed && b.n >= 230) {
      armed = false;
      out.push({ n: b.n, x: +b.x.toFixed(1), y: +b.y.toFixed(1), png: c.toDataURL('image/png') });
    }
  }
  return out;
});

console.log(`\n  ${shots.length} pitches caught at the plate. ZONE centre (210,172), w=100 h=108.`);
console.log('  off = distance from centre in ZONE widths/heights. The zone edge is 0.50.');
console.log('  Before this branch EVERY ball out of the zone drew at exactly 0.78.\n');
const offs = [];
shots.forEach((s, i) => {
  const ox = Math.abs(s.x - 210) / 100;
  const oy = Math.abs(s.y - 172) / 108;
  const off = Math.max(ox, oy);
  offs.push(off);
  console.log(`  ${String(i).padStart(2)}  x=${String(s.x).padStart(6)} y=${String(s.y).padStart(6)}  offX ${ox.toFixed(2)}  offY ${oy.toFixed(2)}  -> ${off > 0.5 ? 'BALL ' : 'strike'} off ${off.toFixed(2)}`);
  writeFileSync(`.verify/p${String(i).padStart(2, '0')}.png`, Buffer.from(s.png.split(',')[1], 'base64'));
});
const balls = offs.filter((o) => o > 0.5).sort((a, b) => a - b);
console.log(`\n  balls out of the zone: ${balls.length}`);
if (balls.length) console.log(`  drawn offsets  min ${balls[0].toFixed(2)}  max ${balls[balls.length - 1].toFixed(2)}  distinct ${new Set(balls.map((b) => b.toFixed(2))).size}`);
await browser.close();
await server.close();
