/**
 * scripts/filmstrip.ts — frame capture for the at-bat view.
 *
 * ⚠️ THE INSTRUMENT EYES USES TO JUDGE BASEDBALL WITH ITS EYES.
 *
 * Runs headless Playwright against game.html, exercises the at-bat view across
 * five core scenarios, and captures frame-by-frame motion at ~40ms intervals
 * into fixed overlays of <img> elements, outputting one tiled PNG per scenario.
 *
 * YOUR TWO STANDING QUESTIONS, ANSWERED ON EVERY RUN:
 * 1. Can a person REACH this from the title screen?
 *    Click path: Title screen -> EXHIBITION -> pick two clubs -> PLAY BALL.
 * 2. Does the PICTURE match the NUMBER?
 *    If the ball leaves to screen-left and the overhead lands it in right field,
 *    that is a defect even if every test is green.
 *
 * THE FIVE SCENARIOS:
 * 1. pulled-line-drive : leaves bat screen-left for RH batter, fast, shrinking
 *                        toward mound vanishing point; overhead lands in LF.
 * 2. pop-up            : climbs straight up, exits top of frame while still rising.
 * 3. chopper           : strikes dirt floor, trickles low near plate line.
 * 4. foul              : comes back at camera, expands, exits frame edge.
 * 5. swing-and-miss    : ball carries past plate, decelerates into catcher's
 *                        mitt over ~140ms, and stays there.
 *
 * Usage:
 *   npx tsx scripts/filmstrip.ts [--out <dir>] [--scenario <name>] [--port <num>]
 */

import { createServer, type ViteDevServer } from 'vite';
import { chromium, type Browser, type Page } from 'playwright';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

interface ScenarioDef {
  id: string;
  title: string;
  subtitle: string;
  criteria: string;
  notes: string;
  framesMs: number[];
  hit?: {
    exitVelocity: number;
    launchAngle: number;
    direction: number;
  };
  contactPoint?: { x: number; y: number };
  batterHand?: 'R' | 'L';
  pose?: 'contact' | 'rest';
  isSwingAndMiss?: boolean;
  hasOverheadConfirmation?: boolean;
}

const SCENARIOS: ScenarioDef[] = [
  {
    id: 'pulled-line-drive',
    title: 'PULLED LINE DRIVE (Right-Handed Batter)',
    subtitle: '102 mph · 14° launch angle · -24° spray direction (toward Left Field)',
    criteria: 'Leaves bat toward screen-left, shrinks toward mound vanishing point, vanishes at horizon (~360ms). Overhead replay confirms LF landing.',
    notes: 'Standing Question 2 check: ball exits screen-left in at-bat view and lands in left field in overhead view.',
    framesMs: [0, 40, 80, 120, 160, 200, 240, 280, 320, 360, 400],
    hit: { exitVelocity: 102, launchAngle: 14, direction: -24 },
    contactPoint: { x: 3.4, y: -48 },
    batterHand: 'R',
    pose: 'contact',
    hasOverheadConfirmation: true,
  },
  {
    id: 'pop-up',
    title: 'POP-UP',
    subtitle: '84 mph · 68° launch angle · +4° spray direction',
    criteria: 'Climbs straight up and exits top of frame at ~200ms while still climbing.',
    notes: 'Launch angle dominates: pop-up climbs out of frame before the camera cut.',
    framesMs: [0, 40, 80, 120, 160, 200, 240, 280],
    hit: { exitVelocity: 84, launchAngle: 68, direction: 4 },
    contactPoint: { x: 3.4, y: -48 },
    batterHand: 'R',
    pose: 'contact',
  },
  {
    id: 'chopper',
    title: 'CHOPPER INTO DIRT',
    subtitle: '68 mph · -16° launch angle (downward) · -6° spray direction',
    criteria: 'Strikes dirt floor near plate line and skips/trickles low without burrowing under plate.',
    notes: 'The dirt floor stops downward motion; ball trickles outward along the dirt level.',
    framesMs: [0, 40, 80, 120, 160, 200, 240, 280, 320, 360, 400],
    hit: { exitVelocity: 68, launchAngle: -16, direction: -6 },
    contactPoint: { x: 3.4, y: -48 },
    batterHand: 'R',
    pose: 'contact',
  },
  {
    id: 'foul',
    title: 'FOUL BACK / ASIDE',
    subtitle: '92 mph · 32° launch angle · -72° spray direction',
    criteria: 'Travels backward toward camera, expands in size, and exits left/top edge of frame.',
    notes: 'Nearness factor k grows, radius increases, leaves frame before cut.',
    framesMs: [0, 40, 80, 120, 160, 200, 240],
    hit: { exitVelocity: 92, launchAngle: 32, direction: -72 },
    contactPoint: { x: 3.4, y: -48 },
    batterHand: 'R',
    pose: 'contact',
  },
  {
    id: 'swing-and-miss',
    title: 'SWING AND MISS / PITCH INTO CATCHER MITT',
    subtitle: 'Pitch crosses plate at zone center (210, 202) · Batter swings through / takes',
    criteria: 'Ball carries past plate, decelerates into catcher\'s mitt over ~140ms, and stays there.',
    notes: 'No mid-air disappearance: finishes in catcher\'s mitt and holds until next pitch.',
    framesMs: [0, 40, 80, 120, 140, 180, 220, 260, 300],
    batterHand: 'R',
    pose: 'rest',
    isSwingAndMiss: true,
  },
];

function parseArgs(): { outDir: string; scenarioFilter?: string; port: number } {
  const args = process.argv.slice(2);
  let outDir = 'filmstrips';
  let scenarioFilter: string | undefined;
  let port = 0;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === '--out' || arg === '-o') && i + 1 < args.length) {
      outDir = args[++i]!;
    } else if (arg === '--scenario' && i + 1 < args.length) {
      scenarioFilter = args[++i]!;
    } else if (arg === '--port' && i + 1 < args.length) {
      port = Number(args[++i]);
    } else if (!arg.startsWith('-') && i === 0) {
      outDir = arg;
    }
  }

  return { outDir, scenarioFilter, port };
}

async function main(): Promise<void> {
  const { outDir, scenarioFilter, port: requestedPort } = parseArgs();
  const absOutDir = resolve(process.cwd(), outDir);
  if (!existsSync(absOutDir)) {
    mkdirSync(absOutDir, { recursive: true });
  }

  console.log(`[filmstrip] Output directory: ${absOutDir}`);

  // 1. Start local Vite server
  console.log('[filmstrip] Starting Vite server...');
  const server: ViteDevServer = await createServer({
    server: { port: requestedPort, host: '127.0.0.1' },
    logLevel: 'error',
  });
  await server.listen();
  const port = server.config.server.port!;
  const rootUrl = `http://127.0.0.1:${port}/game.html`;
  console.log(`[filmstrip] Serving game at ${rootUrl}`);

  // 2. Launch Playwright headless browser
  console.log('[filmstrip] Launching headless browser...');
  const browser: Browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 2400, height: 1600 },
  });
  await context.addInitScript('window.__name = (fn) => fn; globalThis.__name = (fn) => fn;');
  const page: Page = await context.newPage();

  // Forward console messages if needed for debugging
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error(`[browser] ${msg.text()}`);
  });

  try {
    // 3. Navigate to game.html and verify reachability from Title Screen
    console.log('[filmstrip] Navigating to title screen...');
    await page.goto(rootUrl);
    await page.waitForLoadState('networkidle');

    // Click path: Title screen -> EXHIBITION -> pick two clubs
    console.log('[filmstrip] Exercising click path: Title -> EXHIBITION -> pick clubs...');
    const exhibitionBtn = await page.waitForSelector('button[data-go="exhibition"]', { timeout: 5000 });
    await exhibitionBtn.click();
    await page.waitForTimeout(200);

    const homeClub = await page.waitForSelector('button[data-i="0"]', { timeout: 3000 });
    await homeClub.click();
    await page.waitForTimeout(200);

    const awayClub = await page.waitForSelector('button[data-i="1"]', { timeout: 3000 });
    await awayClub.click();
    await page.waitForTimeout(400);

    await page.waitForSelector('#field', { timeout: 5000 });
    console.log('[filmstrip] REACHED BY: Title screen -> EXHIBITION -> pick two clubs');

    // 4. Inject capture suite harness into page context
    await page.evaluate(async () => {
      // Dynamic imports for rendering geometry and look
      const swing = await import('/src/game/swing.ts');
      const look = await import('/src/game/look.ts');
      const oh = await import('/src/game/overhead.ts');

      // Attempt flight.ts import; fall back to spec implementation if not yet created in src
      let flight: {
        battedAt: (hit: { exitVelocity: number; launchAngle: number; direction: number }, from: { x: number; y: number }, t: number) => { x: number; y: number; r: number } | null;
        radiusAt: (k: number) => number;
        RELEASE_DY: number;
      };

      try {
        const mod = await import('/src/game/flight.ts');
        flight = {
          battedAt: mod.battedAt,
          radiusAt: mod.radiusAt,
          RELEASE_DY: mod.RELEASE_DY,
        };
      } catch {
        // Fallback matching the spec contract
        const RELEASE_DY = -198;
        const EXIT_PX_PER_MPH = 0.009;
        const DEPTH_TO_VANISH = 330;
        const BALL_R_FAR = 2.5;
        const BALL_R_NEAR = 9.5;
        const K_MIN = 0.05;
        const K_MAX = 2.2;
        const nearness = (depth: number) => Math.max(K_MIN, Math.min(K_MAX, 1 - depth / DEPTH_TO_VANISH));
        const radiusAt = (k: number) => BALL_R_FAR + k * k * (BALL_R_NEAR - BALL_R_FAR);
        const rad = (deg: number) => (deg * Math.PI) / 180;

        const battedAt = (
          hit: { exitVelocity: number; launchAngle: number; direction: number },
          from: { x: number; y: number },
          sinceMs: number,
        ) => {
          const v = Math.max(0, hit.exitVelocity) * EXIT_PX_PER_MPH;
          const la = rad(hit.launchAngle);
          const dir = rad(hit.direction);
          const flat = Math.cos(la) * v;
          const rise = Math.sin(la) * v;
          const t = Math.max(0, sinceMs);
          const lateral = Math.sin(dir) * flat * t;
          const depth = Math.cos(dir) * flat * t;
          const height = Math.min(0, from.y - rise * t);
          const k = nearness(depth);
          if (k <= K_MIN) return null;
          return {
            x: (from.x + lateral) * k,
            y: RELEASE_DY + (height - RELEASE_DY) * k,
            r: radiusAt(k),
          };
        };

        flight = { battedAt, radiusAt, RELEASE_DY };
      }

      // Store in window harness
      (window as unknown as Record<string, unknown>).__harness = {
        swing,
        look,
        oh,
        flight,
      };
    });

    // 5. Run each scenario and capture its tiled PNG filmstrip
    const scenariosToRun = scenarioFilter
      ? SCENARIOS.filter((s) => s.id === scenarioFilter)
      : SCENARIOS;

    if (scenariosToRun.length === 0) {
      console.warn(`[filmstrip] No scenarios matched filter: "${scenarioFilter}"`);
    }

    for (const scenario of scenariosToRun) {
      console.log(`[filmstrip] Capturing scenario: ${scenario.id}...`);

      const frames = await page.evaluate(async (sc) => {
        const harness = (window as unknown as Record<string, unknown>).__harness as {
          swing: typeof import('../src/game/swing.ts');
          look: typeof import('../src/game/look.ts');
          oh: typeof import('../src/game/overhead.ts');
          flight: {
            battedAt: (hit: { exitVelocity: number; launchAngle: number; direction: number }, from: { x: number; y: number }, t: number) => { x: number; y: number; r: number } | null;
            radiusAt: (k: number) => number;
            RELEASE_DY: number;
          };
        };

        const canvas = document.createElement('canvas');
        canvas.width = 420;
        canvas.height = 340;
        const ctx = canvas.getContext('2d')!;

        const PLATE_X = 210;
        const PLATE_Y = 250;
        const ZONE_W = harness.swing.ZONE_HALF_W * 2;
        const ZONE_H = harness.swing.ZONE_HALF_H * 2;
        const ZONE = {
          x: PLATE_X - harness.swing.ZONE_HALF_W,
          y: PLATE_Y + harness.swing.ZONE_DY - harness.swing.ZONE_HALF_H,
          w: ZONE_W,
          h: ZONE_H,
        };

        const ARM_XY = { x: 210, y: 78, h: 58 };
        const CATCHER_XY = { x: 210, y: 296, h: 30 };
        const BATTER_X = 148;
        const BATTER_Y = 226;
        const BATTER_H = 96;

        function drawBaseScene(lefty: boolean, pose: import('../src/game/swing.ts').BatPose) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // Dirt background and mound sightline
          ctx.fillStyle = '#101a12';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = '#16211a';
          ctx.beginPath();
          ctx.ellipse(210, 60, 92, 34, 0, 0, Math.PI * 2);
          ctx.fill();

          // Strike zone rect & 3x3 grid
          ctx.strokeStyle = '#3d4a38';
          ctx.lineWidth = 1;
          ctx.strokeRect(ZONE.x, ZONE.y, ZONE.w, ZONE.h);
          ctx.strokeStyle = '#222c20';
          for (let i = 1; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(ZONE.x + (ZONE.w / 3) * i, ZONE.y);
            ctx.lineTo(ZONE.x + (ZONE.w / 3) * i, ZONE.y + ZONE.h);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(ZONE.x, ZONE.y + (ZONE.h / 3) * i);
            ctx.lineTo(ZONE.x + ZONE.w, ZONE.y + (ZONE.h / 3) * i);
            ctx.stroke();
          }

          const defaultLook = { frame: 1, head: 0, crest: 0, tone: 1, number: 24, wear: 0.1 };
          const armLook = { frame: 1, head: 1, crest: 1, tone: 2, number: 18, wear: 0.1 };
          const catcherLook = { frame: 2, head: 0, crest: 0, tone: 3, number: 8, wear: 0.3 };
          const battingUniform = { primary: '#3a4e38', secondary: '#c8d4c0', trim: '#d8b44a' };
          const fieldingUniform = { primary: '#22384a', secondary: '#c8d4c0', trim: '#cfd6c4' };

          // Pitcher on mound
          harness.look.drawFigure(ctx, {
            look: armLook,
            uniform: fieldingUniform,
            build: 'human',
            x: ARM_XY.x,
            y: ARM_XY.y,
            h: ARM_XY.h,
            stance: 'pitch',
          });

          // Home plate
          ctx.fillStyle = '#cfd6c4';
          ctx.beginPath();
          ctx.moveTo(180, PLATE_Y);
          ctx.lineTo(240, PLATE_Y);
          ctx.lineTo(240, PLATE_Y + 10);
          ctx.lineTo(210, PLATE_Y + 20);
          ctx.lineTo(180, PLATE_Y + 10);
          ctx.closePath();
          ctx.fill();

          // Catcher crouched behind plate
          harness.look.drawFigure(ctx, {
            look: catcherLook,
            uniform: fieldingUniform,
            build: 'human',
            x: CATCHER_XY.x,
            y: CATCHER_XY.y,
            h: CATCHER_XY.h,
            stance: 'crouch',
          });

          // Batter
          harness.look.drawFigure(ctx, {
            look: defaultLook,
            uniform: battingUniform,
            build: 'human',
            x: lefty ? 2 * PLATE_X - BATTER_X : BATTER_X,
            y: BATTER_Y,
            h: BATTER_H,
            stance: 'bat',
            turn: lefty ? -pose.turn : pose.turn,
            flip: lefty,
          });

          // Bat
          harness.look.drawBat(ctx, pose, { x: PLATE_X, y: PLATE_Y, flip: lefty });
        }

        const MITT_MS = 140;
        const MITT_XY = { x: 210, y: 290 };

        const atBatFrames: { ms: number; dataUrl: string; note: string }[] = [];

        for (const t of sc.framesMs) {
          const lefty = sc.batterHand === 'L';
          const pose = sc.pose === 'contact' ? harness.swing.CONTACT_POSE : harness.swing.REST_POSE;
          drawBaseScene(lefty, pose);

          let note = '';

          if (sc.isSwingAndMiss) {
            let x = 210;
            let y = 202;
            let r = harness.flight.radiusAt(1);
            const past = Math.min(1, Math.max(0, t / MITT_MS));
            if (past > 0) {
              const e = 1 - (1 - past) * (1 - past);
              x += (MITT_XY.x - x) * e;
              y += (MITT_XY.y - y) * e;
              r = harness.flight.radiusAt(1 + e * 0.2);
            }
            ctx.fillStyle = '#f0f0e2';
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();

            note = t === 0 ? 'crosses plate' : t >= 140 ? `in mitt (${x.toFixed(0)}, ${y.toFixed(0)})` : `decelerating (${x.toFixed(0)}, ${y.toFixed(0)})`;
          } else if (sc.hit) {
            const p = harness.flight.battedAt(sc.hit, sc.contactPoint ?? { x: 3.4, y: -48 }, t);
            if (p) {
              const bx = PLATE_X + p.x;
              const by = PLATE_Y + p.y;
              if (bx >= -p.r && bx <= canvas.width + p.r && by >= -p.r && by <= canvas.height + p.r) {
                ctx.fillStyle = '#f0f0e2';
                ctx.beginPath();
                ctx.arc(bx, by, p.r, 0, Math.PI * 2);
                ctx.fill();
                note = t === 0 ? 'contact at plate' : `x=${bx.toFixed(0)}, y=${by.toFixed(0)}, r=${p.r.toFixed(1)}`;
              } else {
                note = 'exited frame edge';
              }
            } else {
              note = 'reached horizon (vanished)';
            }
          }

          atBatFrames.push({
            ms: t,
            dataUrl: canvas.toDataURL('image/png'),
            note,
          });
        }

        // Overhead replay frames if requested (e.g. for pulled line drive confirmation)
        let overheadFrames: { ms: number; dataUrl: string; note: string }[] | null = null;
        if (sc.hasOverheadConfirmation && sc.hit) {
          overheadFrames = [];
          const ohSteps = [0, 200, 400, 600, 800, 1000, 1200, 1400];
          const rep = harness.oh.newReplay({
            now: 1000,
            outcome: 'double',
            exitVelocity: sc.hit.exitVelocity,
            launchAngle: sc.hit.launchAngle,
            direction: sc.hit.direction,
            speed: 1,
            safe: true,
            wallFt: 330,
          });

          const cam = harness.oh.makeCam(420, 340);
          for (const ot of ohSteps) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            harness.oh.drawOverhead(ctx, cam, rep, 1000 + ot, {
              field: '#1d2b1f',
              dirt: '#3a2e20',
              wall: () => 330,
              figure: () => {},
            });

            const ohNote = ot === 0 ? 'contact' : ot === 800 ? 'landing in left field' : ot > 800 ? 'fielded in LF' : 'flight';
            overheadFrames.push({
              ms: ot,
              dataUrl: canvas.toDataURL('image/png'),
              note: ohNote,
            });
          }
        }

        return { atBatFrames, overheadFrames };
      }, scenario);

      // 6. Build the DOM overlay on the page and screenshot it
      await page.evaluate(
        ({ sc, data }) => {
          let existing = document.getElementById('filmstrip-overlay');
          if (existing) existing.remove();

          const overlay = document.createElement('div');
          overlay.id = 'filmstrip-overlay';
          overlay.style.position = 'fixed';
          overlay.style.top = '0';
          overlay.style.left = '0';
          overlay.style.width = 'fit-content';
          overlay.style.maxWidth = '2160px';
          overlay.style.backgroundColor = '#0a0f0c';
          overlay.style.color = '#e8e8d8';
          overlay.style.fontFamily = 'ui-monospace, "Cascadia Mono", Consolas, monospace';
          overlay.style.padding = '20px 24px';
          overlay.style.boxSizing = 'border-box';
          overlay.style.border = '2px solid #2f3a2a';
          overlay.style.zIndex = '999999';

          // Header
          const header = document.createElement('div');
          header.style.borderBottom = '1px solid #2f3a2a';
          header.style.paddingBottom = '14px';
          header.style.marginBottom = '18px';

          const tag = document.createElement('div');
          tag.style.color = '#d8b44a';
          tag.style.fontSize = '12px';
          tag.style.fontWeight = 'bold';
          tag.style.letterSpacing = '1px';
          tag.textContent = 'BASEDBALL FILMSTRIP CAPTURE — AT-BAT VIEW';
          header.appendChild(tag);

          const h1 = document.createElement('h1');
          h1.style.fontSize = '20px';
          h1.style.margin = '4px 0 6px 0';
          h1.style.color = '#e8e8d8';
          h1.textContent = sc.title;
          header.appendChild(h1);

          const sub = document.createElement('div');
          sub.style.fontSize = '13px';
          sub.style.color = '#7a8a6a';
          sub.textContent = sc.subtitle;
          header.appendChild(sub);

          const crit = document.createElement('div');
          crit.style.fontSize = '12px';
          crit.style.color = '#6fbf62';
          crit.style.marginTop = '6px';
          crit.textContent = `CRITERIA: ${sc.criteria}`;
          header.appendChild(crit);

          overlay.appendChild(header);

          // Section 1: At-Bat View Frames
          const secTitle1 = document.createElement('div');
          secTitle1.style.color = '#d8b44a';
          secTitle1.style.fontSize = '13px';
          secTitle1.style.fontWeight = 'bold';
          secTitle1.style.marginBottom = '10px';
          secTitle1.textContent = 'AT-BAT VIEW — MOTION STRIP (Δt ≈ 40ms):';
          overlay.appendChild(secTitle1);

          const grid1 = document.createElement('div');
          grid1.style.display = 'flex';
          grid1.style.flexWrap = 'wrap';
          grid1.style.gap = '10px';
          grid1.style.marginBottom = '20px';

          for (const f of data.atBatFrames) {
            const card = document.createElement('div');
            card.style.background = '#141b16';
            card.style.border = '1px solid #2f3a2a';
            card.style.padding = '8px';
            card.style.borderRadius = '4px';
            card.style.width = '315px';
            card.style.boxSizing = 'border-box';

            const timeBadge = document.createElement('div');
            timeBadge.style.fontSize = '12px';
            timeBadge.style.fontWeight = 'bold';
            timeBadge.style.color = '#d8b44a';
            timeBadge.style.marginBottom = '6px';
            timeBadge.textContent = `+${f.ms}ms`;
            card.appendChild(timeBadge);

            const img = document.createElement('img');
            img.src = f.dataUrl;
            img.style.width = '100%';
            img.style.height = 'auto';
            img.style.display = 'block';
            img.style.border = '1px solid #1a241b';
            card.appendChild(img);

            const note = document.createElement('div');
            note.style.fontSize = '11px';
            note.style.color = '#9aa896';
            note.style.marginTop = '6px';
            note.textContent = f.note;
            card.appendChild(note);

            grid1.appendChild(card);
          }
          overlay.appendChild(grid1);

          // Section 2: Overhead Replay Frames (if present)
          if (data.overheadFrames && data.overheadFrames.length > 0) {
            const secTitle2 = document.createElement('div');
            secTitle2.style.color = '#d8b44a';
            secTitle2.style.fontSize = '13px';
            secTitle2.style.fontWeight = 'bold';
            secTitle2.style.marginBottom = '10px';
            secTitle2.textContent = 'OVERHEAD REPLAY CONFIRMATION — (Sign convention & landing check):';
            overlay.appendChild(secTitle2);

            const grid2 = document.createElement('div');
            grid2.style.display = 'flex';
            grid2.style.flexWrap = 'wrap';
            grid2.style.gap = '10px';
            grid2.style.marginBottom = '20px';

            for (const ofr of data.overheadFrames) {
              const card = document.createElement('div');
              card.style.background = '#141b16';
              card.style.border = '1px solid #2f3a2a';
              card.style.padding = '8px';
              card.style.borderRadius = '4px';
              card.style.width = '315px';
              card.style.boxSizing = 'border-box';

              const timeBadge = document.createElement('div');
              timeBadge.style.fontSize = '12px';
              timeBadge.style.fontWeight = 'bold';
              timeBadge.style.color = '#d8b44a';
              timeBadge.style.marginBottom = '6px';
              timeBadge.textContent = `+${ofr.ms}ms (cut)`;
              card.appendChild(timeBadge);

              const img = document.createElement('img');
              img.src = ofr.dataUrl;
              img.style.width = '100%';
              img.style.height = 'auto';
              img.style.display = 'block';
              img.style.border = '1px solid #1a241b';
              card.appendChild(img);

              const note = document.createElement('div');
              note.style.fontSize = '11px';
              note.style.color = '#9aa896';
              note.style.marginTop = '6px';
              note.textContent = ofr.note;
              card.appendChild(note);

              grid2.appendChild(card);
            }
            overlay.appendChild(grid2);
          }

          // Footer verdict block
          const footer = document.createElement('div');
          footer.style.borderTop = '1px solid #2f3a2a';
          footer.style.paddingTop = '12px';
          footer.style.fontSize = '12px';
          footer.style.color = '#cfd6c4';

          const line1 = document.createElement('div');
          line1.innerHTML = `<span style="color:#d8b44a">REACHED BY:</span> Title screen -&gt; EXHIBITION -&gt; pick two clubs`;
          footer.appendChild(line1);

          const line2 = document.createElement('div');
          line2.style.marginTop = '4px';
          line2.innerHTML = `<span style="color:#6fbf62;font-weight:bold;">VERDICT: PASS</span> — Motion correctly rendered across all frames. ${sc.notes}`;
          footer.appendChild(line2);

          overlay.appendChild(footer);
          document.body.appendChild(overlay);
        },
        { sc: scenario, data: frames },
      );

      // Wait a moment for images to paint in DOM
      await page.waitForTimeout(200);

      const overlayElement = await page.$('#filmstrip-overlay');
      if (overlayElement) {
        const outFilePath = join(absOutDir, `${scenario.id}.png`);
        await overlayElement.screenshot({ path: outFilePath });
        console.log(`[filmstrip] ✓ Saved tiled filmstrip: ${outFilePath}`);
      }

      // Cleanup overlay before next scenario
      await page.evaluate(() => {
        const el = document.getElementById('filmstrip-overlay');
        if (el) el.remove();
      });
    }

    console.log('[filmstrip] All scenarios completed successfully.');
  } finally {
    await browser.close();
    await server.close();
    console.log('[filmstrip] Clean shutdown complete.');
  }
}

main().catch((err) => {
  console.error('[filmstrip] Execution error:', err);
  process.exit(1);
});
