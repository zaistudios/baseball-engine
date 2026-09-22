import { createServer } from 'vite';
import { chromium } from 'file:///C:/Users/zaneg/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';

const server = await createServer({ configFile: 'vite.game.config.ts', server: { port: 5198 } });
await server.listen();
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.addInitScript('window.__name = (fn) => fn; globalThis.__name = (fn) => fn;');
await page.goto('http://localhost:5198/game.html');
await page.waitForLoadState('networkidle');
for (const sel of ['button[data-go="exhibition"]', 'button[data-i="0"]', 'button[data-i="1"]']) {
  await (await page.waitForSelector(sel, { timeout: 8000 })).click();
  await page.waitForTimeout(400);
}
await page.waitForSelector('#field', { timeout: 8000 });
const hud = () => page.evaluate(() => document.body.innerText);
if ((await hud()).includes('YOU PITCH')) {
  await page.keyboard.press('t');
  for (let i = 0; i < 160 && (await hud()).includes('YOU PITCH'); i++) await page.waitForTimeout(400);
  await page.keyboard.press('t');
  await page.waitForTimeout(600);
}
console.log('REACHED: the batter\u2019s box, MANUAL, four clicks from the title screen.\n');

const out = await page.evaluate(async (THRESHOLDS) => {
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
  const tap = () =>
    dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const read = () => {
    const t = document.body.innerText;
    return {
      pitch: (/last pitch:\s*([^\u00b7\n]*)/.exec(t)?.[1] ?? '').trim(),
      swing: (/last swing:\s*([^\n]*)/.exec(t)?.[1] ?? '').trim(),
    };
  };

  const res = [];
  for (let p = 0; p < THRESHOLDS.length; p++) {
    while (ball()) await sleep(60);            // wait out the previous pitch
    await sleep(500);
    const was = read().swing;
    tap();                                      // deliver
    let spot = null;
    const t0 = performance.now();
    let fired = false;
    while (performance.now() - t0 < 5000) {
      await frame();
      const b = ball();
      if (!b) { if (fired) break; continue; }
      if (b.n > (spot?.n ?? 0)) spot = b;
      if (!fired && b.n >= THRESHOLDS[p]) { tap(); fired = true; }   // swing
    }
    await sleep(140);
    const png = c.toDataURL('image/png');
    await sleep(700);
    const now = read();
    res.push({
      at: THRESHOLDS[p],
      fired,
      x: spot ? +spot.x.toFixed(1) : null,
      y: spot ? +spot.y.toFixed(1) : null,
      nMax: spot?.n ?? 0,
      ...now,
      changed: now.swing !== was,
      png,
    });
  }
  return res;
}, [90, 120, 90, 120, 90, 120, 90, 120, 90, 120, 90, 120, 90, 120]);

console.log('  trig   drawn off          last pitch    last swing');
out.forEach((r, i) => {
  const off = r.x === null ? null : Math.max(Math.abs(r.x - 210) / 100, Math.abs(r.y - 172) / 108);
  console.log(
    `  ${String(r.at).padStart(4)}   ${off === null ? '  ?  ' : off.toFixed(2)} ${off !== null && off > 0.5 ? '(BALL)  ' : '(strike)'}  ` +
      `${(r.pitch || '-').padEnd(12)}  ${r.swing || '-'}${r.changed ? '' : '   [no new swing]'}`,
  );
  writeFileSync(`.verify/sw${String(i).padStart(2, '0')}.png`, Buffer.from(r.png.split(',')[1], 'base64'));
});
await browser.close();
await server.close();
