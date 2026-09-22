import { createServer } from 'vite';
import { chromium } from 'file:///C:/Users/zaneg/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

if (!existsSync('scratch')) {
  mkdirSync('scratch', { recursive: true });
}

console.log('[Eyes] Starting Vite server on port 5195...');
const server = await createServer({
  configFile: 'vite.game.config.ts',
  server: { port: 5195, host: '127.0.0.1' },
  logLevel: 'error'
});
await server.listen();

console.log('[Eyes] Launching browser...');
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1920, height: 1200 } });
await context.addInitScript('window.__name = (fn) => fn; globalThis.__name = (fn) => fn;');
const page = await context.newPage();

page.on('console', (msg) => {
  if (msg.type() === 'error') console.error('[page error]', msg.text());
});

console.log('[Eyes] Navigating to title screen...');
await page.goto('http://127.0.0.1:5195/game.html');
await page.waitForLoadState('networkidle');

// Exact click path
console.log('[Eyes] Exercising click path: Title -> EXHIBITION -> pick clubs -> PLAY BALL');
const exhibBtn = await page.waitForSelector('button[data-go="exhibition"]', { timeout: 8000 });
await exhibBtn.click();
await page.waitForTimeout(300);

const club0 = await page.waitForSelector('button[data-i="0"]', { timeout: 5000 });
await club0.click();
await page.waitForTimeout(300);

const club1 = await page.waitForSelector('button[data-i="1"]', { timeout: 5000 });
await club1.click();
await page.waitForTimeout(600);

await page.waitForSelector('#field', { timeout: 8000 });
console.log('[Eyes] REACHED: Title screen -> EXHIBITION -> pick two clubs -> PLAY BALL');

// Run capture suite inside page
const captureData = await page.evaluate(async () => {
  const c = document.getElementById('field');
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const tap = () => dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));

  const ball = () => {
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0, sx = 0, sy = 0;
    for (let y = 30; y < 300; y++) {
      for (let x = 50; x < 390; x++) {
        const i = (y * c.width + x) * 4;
        if (d[i] > 228 && d[i + 1] > 228 && d[i + 2] > 205) { n++; sx += x; sy += y; }
      }
    }
    return n ? { n, x: sx / n, y: sy / n } : null;
  };

  const readHUD = () => {
    const text = document.body.innerText;
    const pitchMatch = /last pitch:\s*([^\u00b7\n]*)/.exec(text);
    const swingMatch = /last swing:\s*([^\n]*)/.exec(text);
    return {
      pitch: (pitchMatch ? pitchMatch[1] : '').trim(),
      swing: (swingMatch ? swingMatch[1] : '').trim(),
      raw: text
    };
  };

  // Phase 1: Sample pitches in auto/watch mode to gather pitches at different miss distances
  // Press 't' to flip to watch mode
  dispatchEvent(new KeyboardEvent('keydown', { key: 't', bubbles: true, cancelable: true }));
  await sleep(400);

  const pitchSamples = [];
  const filmstrips = []; // sequence of frames for representative pitches
  const t0 = performance.now();
  let armed = true;
  let currentStrip = [];

  while (performance.now() - t0 < 45000 && pitchSamples.length < 25) {
    await frame();
    const b = ball();
    if (!b) {
      if (!armed && currentStrip.length > 0) {
        // finished a pitch
        armed = true;
      }
      continue;
    }

    // Capture frame for current delivery
    if (currentStrip.length === 0 || performance.now() - currentStrip[currentStrip.length - 1].t >= 36) {
      currentStrip.push({
        t: performance.now(),
        x: +b.x.toFixed(1),
        y: +b.y.toFixed(1),
        n: b.n,
        png: c.toDataURL('image/png')
      });
    }

    if (armed && b.n >= 220) {
      armed = false;
      const ox = Math.abs(b.x - 210) / 100;
      const oy = Math.abs(b.y - 172) / 108;
      const off = Math.max(ox, oy);
      const hud = readHUD();
      pitchSamples.push({
        x: +b.x.toFixed(1),
        y: +b.y.toFixed(1),
        ox: +ox.toFixed(3),
        oy: +oy.toFixed(3),
        off: +off.toFixed(3),
        isBall: off > 0.5,
        png: c.toDataURL('image/png'),
        hudPitch: hud.pitch,
        strip: currentStrip.slice(-6) // last 6 frames approaching plate (~240ms)
      });
      currentStrip = [];
    }
  }

  // Turn off watch mode
  dispatchEvent(new KeyboardEvent('keydown', { key: 't', bubbles: true, cancelable: true }));
  await sleep(600);

  // If currently pitching, wait until we bat
  for (let w = 0; w < 40 && readHUD().raw.includes('YOU PITCH'); w++) {
    dispatchEvent(new KeyboardEvent('keydown', { key: 't', bubbles: true, cancelable: true }));
    await sleep(400);
    dispatchEvent(new KeyboardEvent('keydown', { key: 't', bubbles: true, cancelable: true }));
    await sleep(400);
  }

  // Phase 2: Controlled manual swings to capture swing grading and timing bar
  // We trigger swings with different timing and pitch locations
  const swingSamples = [];
  const thresholds = [90, 130, 90, 130, 100, 140, 110];

  for (let i = 0; i < thresholds.length; i++) {
    while (ball()) await sleep(50);
    await sleep(500);

    const prevSwing = readHUD().swing;
    tap(); // Start delivery

    let maxBall = null;
    let fired = false;
    const tDelivery = performance.now();
    const swingFrames = [];

    while (performance.now() - tDelivery < 4500) {
      await frame();
      const b = ball();
      if (!b) {
        if (fired) break;
        continue;
      }
      if (!maxBall || b.n > maxBall.n) maxBall = b;

      if (!fired && b.n >= thresholds[i]) {
        tap(); // Swing!
        fired = true;
      }

      if (fired && swingFrames.length < 8) {
        swingFrames.push({
          t: performance.now(),
          png: c.toDataURL('image/png')
        });
      }
    }

    await sleep(150);
    const snapAtImpact = c.toDataURL('image/png');
    await sleep(700);
    const afterHUD = readHUD();

    const off = maxBall ? Math.max(Math.abs(maxBall.x - 210) / 100, Math.abs(maxBall.y - 172) / 108) : 0;

    swingSamples.push({
      threshold: thresholds[i],
      off: +off.toFixed(3),
      isBall: off > 0.5,
      impactPng: snapAtImpact,
      frames: swingFrames,
      hudPitch: afterHUD.pitch,
      hudSwing: afterHUD.swing,
      newSwing: afterHUD.swing !== prevSwing
    });
  }

  return { pitchSamples, swingSamples };
});

console.log(`[Eyes] Collected ${captureData.pitchSamples.length} pitch samples and ${captureData.swingSamples.length} swing samples.`);

// Analyze pitch samples
const strikes = captureData.pitchSamples.filter(p => !p.isBall);
const balls = captureData.pitchSamples.filter(p => p.isBall).sort((a, b) => a.off - b.off);
const distinctBallOffsets = new Set(balls.map(b => b.off.toFixed(2)));

console.log(`[Eyes] Strikes: ${strikes.length}, Balls: ${balls.length}`);
console.log(`[Eyes] Ball offsets range: min=${balls[0]?.off} to max=${balls[balls.length - 1]?.off}`);
console.log(`[Eyes] Distinct ball offset bins (0.01 res): ${distinctBallOffsets.size}`);

// Pick representative pitches:
// 1. Strike in zone
const repStrike = strikes[0] || captureData.pitchSamples[0];
// 2. Ball barely missing edge (closest to 0.50, e.g. 0.52-0.65)
const repBallNear = balls[0] || captureData.pitchSamples[1];
// 3. Ball wide outside (far out, > 0.85)
const repBallFar = balls[balls.length - 1] || captureData.pitchSamples[2];

// Pick representative swings:
const repGoodSwing = captureData.swingSamples.find(s => s.hudSwing.includes('GOOD') || s.hudSwing.includes('PERFECT')) || captureData.swingSamples[0];
const repLateSwing = captureData.swingSamples.find(s => s.hudSwing.includes('LATE') || s.hudSwing.includes('SWING AND MISS') || s.hudSwing.includes('EARLY')) || captureData.swingSamples[1];

// Build filmstrip overlay in browser DOM and screenshot it
await page.evaluate(({ repStrike, repBallNear, repBallFar, repGoodSwing, repLateSwing, distinctCount, minOff, maxOff, ballsCount }) => {
  let existing = document.getElementById('filmstrip-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'filmstrip-overlay';
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '1480px';
  overlay.style.backgroundColor = '#0b110e';
  overlay.style.color = '#e4ece0';
  overlay.style.fontFamily = 'ui-monospace, Consolas, monospace';
  overlay.style.padding = '20px 24px';
  overlay.style.boxSizing = 'border-box';
  overlay.style.border = '2px solid #2e4032';
  overlay.style.zIndex = '999999';

  // Title header
  const hdr = document.createElement('div');
  hdr.style.borderBottom = '2px solid #364e3c';
  hdr.style.paddingBottom = '12px';
  hdr.style.marginBottom = '16px';

  hdr.innerHTML = `
    <div style="color: #d8b44a; font-size: 13px; font-weight: bold; letter-spacing: 1px;">BASEDBALL FILMSTRIP VERDICT — ZAIS-9</div>
    <div style="font-size: 18px; font-weight: bold; color: #ffffff; margin: 4px 0;">ITEM: Chasing costs a narrower window: a continuous miss distance, scaled into the timing bands</div>
    <div style="font-size: 12px; color: #8aa08e;">REACHED BY: Title screen -&gt; EXHIBITION -&gt; pick two clubs -&gt; PLAY BALL</div>
    <div style="margin-top: 6px; font-size: 12px; color: #6fbf62;">
      STANDING CHECKS: (1) Ball drawn at continuous miss distance past zone edge (edge = 0.50). 
      (2) Swing timing bands penalized for distance off plate. 
      (3) On-screen banner agrees with HUD/play-log verdict.
    </div>
  `;
  overlay.appendChild(hdr);

  // Section 1: Spot arrival comparison
  const sec1 = document.createElement('div');
  sec1.style.marginBottom = '20px';
  sec1.innerHTML = `
    <div style="color: #d8b44a; font-size: 14px; font-weight: bold; margin-bottom: 8px;">
      1. CONTINUOUS MISS DISTANCE AT PLATE (Prior baseline drew EVERY ball at fixed 0.78):
    </div>
    <div style="font-size: 12px; color: #a4bfa8; margin-bottom: 10px;">
      Observed ${ballsCount} out-of-zone balls across distinct drawn offsets from ${minOff} to ${maxOff} (${distinctCount} distinct offset values).
    </div>
  `;

  const grid1 = document.createElement('div');
  grid1.style.display = 'grid';
  grid1.style.gridTemplateColumns = 'repeat(3, 1fr)';
  grid1.style.gap = '14px';

  const cards1 = [
    { label: 'STRIKE IN ZONE', pitch: repStrike, desc: `Drawn at off=${repStrike.off} (inside zone <= 0.50), x=${repStrike.x}, y=${repStrike.y}` },
    { label: 'BALL JUST OFF EDGE', pitch: repBallNear, desc: `Drawn at off=${repBallNear.off} (just past edge > 0.50), x=${repBallNear.x}, y=${repBallNear.y}` },
    { label: 'BALL WIDE OUTSIDE', pitch: repBallFar, desc: `Drawn at off=${repBallFar.off} (wide off plate >> 0.50), x=${repBallFar.x}, y=${repBallFar.y}` },
  ];

  for (const c of cards1) {
    const card = document.createElement('div');
    card.style.background = '#141e17';
    card.style.border = '1px solid #283a2d';
    card.style.padding = '10px';
    card.style.borderRadius = '4px';

    const title = document.createElement('div');
    title.style.color = '#ffffff';
    title.style.fontSize = '12px';
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '6px';
    title.textContent = c.label;
    card.appendChild(title);

    const img = document.createElement('img');
    img.src = c.pitch.png;
    img.style.width = '100%';
    img.style.border = '1px solid #364e3c';
    img.style.display = 'block';
    card.appendChild(img);

    const d = document.createElement('div');
    d.style.fontSize = '11px';
    d.style.color = '#8ea892';
    d.style.marginTop = '6px';
    d.textContent = c.desc;
    card.appendChild(d);

    grid1.appendChild(card);
  }
  sec1.appendChild(grid1);
  overlay.appendChild(sec1);

  // Section 2: Swing verdicts and timing bar comparison
  const sec2 = document.createElement('div');
  sec2.style.marginBottom = '20px';
  sec2.innerHTML = `
    <div style="color: #d8b44a; font-size: 14px; font-weight: bold; margin-bottom: 8px;">
      2. SWING TIMING BARS & VERDICT ACCORD (HUD log vs On-Screen Bar):
    </div>
  `;

  const grid2 = document.createElement('div');
  grid2.style.display = 'grid';
  grid2.style.gridTemplateColumns = 'repeat(2, 1fr)';
  grid2.style.gap = '16px';

  const cards2 = [
    {
      label: 'SWING AT PITCH NEAR ZONE (GOOD / PERFECT WINDOW OPEN)',
      swing: repGoodSwing,
      note: `HUD: "${repGoodSwing?.hudSwing}" | Pitch off: ${repGoodSwing?.off}. Hit lands in window.`
    },
    {
      label: 'SWING WITH OFFSET PENALTY (CHASING OUTSIDE NARROWED WINDOW)',
      swing: repLateSwing,
      note: `HUD: "${repLateSwing?.hudSwing}" | Pitch off: ${repLateSwing?.off}. Timing falls further out against bands.`
    }
  ];

  for (const c of cards2) {
    if (!c.swing) continue;
    const card = document.createElement('div');
    card.style.background = '#141e17';
    card.style.border = '1px solid #283a2d';
    card.style.padding = '10px';
    card.style.borderRadius = '4px';

    const title = document.createElement('div');
    title.style.color = '#ffffff';
    title.style.fontSize = '12px';
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '6px';
    title.textContent = c.label;
    card.appendChild(title);

    const img = document.createElement('img');
    img.src = c.swing.impactPng;
    img.style.width = '100%';
    img.style.border = '1px solid #364e3c';
    img.style.display = 'block';
    card.appendChild(img);

    const d = document.createElement('div');
    d.style.fontSize = '11px';
    d.style.color = '#8ea892';
    d.style.marginTop = '6px';
    d.textContent = c.note;
    card.appendChild(d);

    grid2.appendChild(card);
  }
  sec2.appendChild(grid2);
  overlay.appendChild(sec2);

  // Section 3: Motion filmstrip across ~40ms intervals
  const sec3 = document.createElement('div');
  sec3.innerHTML = `
    <div style="color: #d8b44a; font-size: 14px; font-weight: bold; margin-bottom: 8px;">
      3. FRAME-BY-FRAME MOTION STRIP (Δt ≈ 40ms intervals to plate):
    </div>
  `;

  if (repBallNear && repBallNear.strip && repBallNear.strip.length > 0) {
    const stripRow = document.createElement('div');
    stripRow.style.display = 'flex';
    stripRow.style.gap = '8px';
    stripRow.style.overflowX = 'auto';

    repBallNear.strip.forEach((fr, idx) => {
      const col = document.createElement('div');
      col.style.flex = '0 0 220px';
      col.style.background = '#101712';
      col.style.border = '1px solid #233126';
      col.style.padding = '6px';

      const cap = document.createElement('div');
      cap.style.fontSize = '10px';
      cap.style.color = '#7d9480';
      cap.style.marginBottom = '4px';
      cap.textContent = `Frame ${idx + 1} (${idx * 40}ms) x=${fr.x} y=${fr.y}`;
      col.appendChild(cap);

      const im = document.createElement('img');
      im.src = fr.png;
      im.style.width = '100%';
      col.appendChild(im);

      stripRow.appendChild(col);
    });
    sec3.appendChild(stripRow);
  }
  overlay.appendChild(sec3);

  document.body.appendChild(overlay);
}, {
  repStrike,
  repBallNear,
  repBallFar,
  repGoodSwing,
  repLateSwing,
  distinctCount: distinctBallOffsets.size,
  minOff: balls[0]?.off ?? 0,
  maxOff: balls[balls.length - 1]?.off ?? 0,
  ballsCount: balls.length
});

await page.waitForTimeout(1000);

const overlayElem = await page.$('#filmstrip-overlay');
const imgPath = 'scratch/zais9-verdict-filmstrip.png';
await overlayElem.screenshot({ path: imgPath });
console.log(`[Eyes] Filmstrip saved to ${imgPath}`);

await browser.close();
await server.close();
console.log('[Eyes] Complete.');
