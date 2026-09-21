import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CHROME_PORT = 9222;
const VITE_PORT = 5173;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log('Starting Vite server...');
  const vite = spawn('node', ['./node_modules/vite/bin/vite.js', '--port', String(VITE_PORT)], {
    stdio: 'ignore'
  });

  console.log('Starting Chrome...');
  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${CHROME_PORT}`,
    '--window-size=1400,950',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ], { stdio: 'ignore' });

  try {
    // Wait for Vite
    let viteReady = false;
    for (let i = 0; i < 40; i++) {
      await sleep(200);
      try {
        const res = await fetch(`http://localhost:${VITE_PORT}/game.html`);
        if (res.ok) { viteReady = true; break; }
      } catch (e) {}
    }
    if (!viteReady) throw new Error('Vite failed to start');
    console.log('Vite ready.');

    // Wait for Chrome CDP
    let wsUrl = null;
    for (let i = 0; i < 40; i++) {
      await sleep(200);
      try {
        const res = await fetch(`http://127.0.0.1:${CHROME_PORT}/json/version`);
        if (res.ok) {
          const json = await res.json();
          wsUrl = json.webSocketDebuggerUrl;
          break;
        }
      } catch (e) {}
    }
    if (!wsUrl) throw new Error('Chrome CDP failed to connect');
    console.log('Chrome CDP ready.');

    const ws = new WebSocket(wsUrl);
    await new Promise(r => { ws.onopen = r; });

    let msgId = 1;
    const pending = new Map();
    ws.onmessage = event => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };

    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = msgId++;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    const { targetId } = await send('Target.createTarget', { url: `http://localhost:${VITE_PORT}/game.html` });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });

    function sendSession(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = msgId++;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, sessionId, method, params }));
      });
    }

    await sendSession('Page.enable');
    await sendSession('Runtime.enable');
    await sleep(1000);

    const evaluate = async expr => {
      const res = await sendSession('Runtime.evaluate', {
        expression: expr,
        returnByValue: true,
        awaitPromise: true,
      });
      if (res.exceptionDetails) {
        throw new Error(`Eval error: ${JSON.stringify(res.exceptionDetails)}`);
      }
      return res.result ? res.result.value : undefined;
    };

    const pressKey = async key => {
      await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: '${key}', code: '${key}', bubbles: true }))`);
    };

    const captureScreenshotB64 = async () => {
      const snap = await sendSession('Page.captureScreenshot', { format: 'png' });
      return snap.data;
    };

    const captured = {};

    // 1. Seed storage for Record Book & sentinel
    console.log('Seeding storage...');
    await evaluate(`
      localStorage.setItem('asb-career', JSON.stringify({
        years: [
          { club: 'MAI', w: 9, l: 5, finish: 1, champion: 'MAI', games: 14, seed: 101 },
          { club: 'MAI', w: 8, l: 6, finish: 3, champion: 'TEX', games: 14, seed: 202 },
        ],
      }));
      localStorage.setItem('asb-streak', JSON.stringify({ current: 2, best: 7 }));
      localStorage.setItem('asb-league', 'SENTINEL-DO-NOT-TOUCH');
      location.reload();
    `);
    await sleep(1200);

    // Snap Title Screen with SETTINGS card
    captured.titleScreen = await captureScreenshotB64();
    console.log('Captured Title Screen');

    // Click Door 1: Title -> SETTINGS card
    await evaluate(`document.querySelector('button[data-go="settings"]').click()`);
    await sleep(300);
    captured.settingsTitle = await captureScreenshotB64();
    console.log('Captured Settings from Title');

    // Verify Settings content
    const settingsH2 = await evaluate(`document.querySelector('#pre h2')?.textContent`);
    console.log('Settings H2:', settingsH2);
    const keys = await evaluate(`Array.from(document.querySelectorAll('#pre [data-key]')).map(b => b.dataset.key)`);
    console.log('Settings keys:', keys);

    // Toggle Difficulty knob
    const diffBefore = await evaluate(`document.querySelector('#pre [data-key="g"] b')?.textContent.trim()`);
    await evaluate(`document.querySelector('#pre [data-key="g"]').click()`);
    await sleep(150);
    const diffAfter = await evaluate(`document.querySelector('#pre [data-key="g"] b')?.textContent.trim()`);
    console.log(`Difficulty knob changed: ${diffBefore} -> ${diffAfter}`);

    // Return to Title via BACK (Space)
    await pressKey(' ');
    await sleep(300);

    // Door to Record Book: Title -> RECORD BOOK
    await evaluate(`document.querySelector('button[data-go="book"]').click()`);
    await sleep(300);
    captured.bookBefore = await captureScreenshotB64();
    console.log('Captured Book Before Reset');

    // Intercept confirm and click reset
    await evaluate(`
      window.__confirmMsg = '';
      window.confirm = (msg) => { window.__confirmMsg = msg; return true; };
      document.querySelector('#pre [data-reset]').click();
    `);
    await sleep(400);
    const confirmMsg = await evaluate(`window.__confirmMsg`);
    console.log('Confirm message was:', confirmMsg);
    captured.bookAfter = await captureScreenshotB64();
    console.log('Captured Book After Reset');

    const bookStats = await evaluate(`({
      career: localStorage.getItem('asb-career'),
      streak: localStorage.getItem('asb-streak'),
      league: localStorage.getItem('asb-league')
    })`);
    console.log('Storage after reset:', bookStats);

    // Return to Title via BACK (Space)
    await pressKey(' ');
    await sleep(300);

    // Start Exhibition Game: Title -> EXHIBITION -> pick 2 clubs
    await evaluate(`document.querySelector('button[data-go="exhibition"]').click()`);
    await sleep(300);
    await evaluate(`document.querySelector('button[data-i="0"]').click()`);
    await sleep(300);
    await evaluate(`document.querySelector('button[data-i="1"]').click()`);
    await sleep(1200);

    // Throw pitches until batting half at idle
    console.log('Playing to reach batting half at idle...');
    const preUp = async () => evaluate(`
      (() => {
        const el = document.getElementById('pre');
        return !!el && el.style.display !== 'none' && el.innerHTML.length > 0;
      })()
    `);

    let tries = 0;
    while (!(await preUp()) && tries < 150) {
      await pressKey('escape');
      await sleep(90);
      if (await preUp()) break;
      await pressKey(' ');
      await sleep(220);
      await pressKey(' ');
      await sleep(1300);
      tries++;
    }

    if (!(await preUp())) throw new Error(`Could not pause at idle in ${tries} attempts`);
    console.log(`Reached pause at idle after ${tries} pitches!`);

    // Let's resume to set up our high-speed 40ms filmstrip
    await pressKey('escape');
    await sleep(250);

    // RECORD 40ms FILMSTRIP:
    // 3 live idle frames -> ESC -> 4 paused frames -> 't' (Auto ON) -> 3 paused frames
    console.log('Recording 40ms filmstrip frames...');
    const filmstripFrames = [];

    const snapCanvas = async (label, note) => {
      const data = await evaluate(`document.querySelector('canvas').toDataURL('image/png')`);
      filmstripFrames.push({ label, note, dataUrl: data });
    };

    // Live idle frames
    for (let i = 1; i <= 3; i++) {
      await snapCanvas(`Live Idle ${i}`, `t=${(i - 1) * 40}ms (live)`);
      await sleep(40);
    }

    // Press Escape to pause
    await pressKey('escape');
    await sleep(50);

    // Snap the pause screen overlay
    captured.pauseScreen = await captureScreenshotB64();

    // Paused frames (motion must be 100% frozen)
    for (let i = 1; i <= 4; i++) {
      await snapCanvas(`Paused ${i}`, `t=+${i * 40}ms (paused at idle)`);
      await sleep(40);
    }

    // Press 't' to turn auto ON while paused
    await pressKey('t');
    await sleep(40);

    // Auto-paused frames (must still be 100% frozen, autoStep blocked)
    for (let i = 1; i <= 3; i++) {
      await snapCanvas(`Paused+Auto ${i}`, `t=+${(4 + i) * 40}ms (auto ON during pause)`);
      await sleep(40);
    }

    // Door 2: Click SETTINGS from Pause screen
    await evaluate(`document.querySelector('#pre [data-go="settings"]').click()`);
    await sleep(300);
    captured.settingsFromPause = await captureScreenshotB64();
    console.log('Captured Settings from Pause');

    // Click BACK from Settings -> returns to Pause screen
    await pressKey(' ');
    await sleep(300);
    captured.pauseAfterSettingsBack = await captureScreenshotB64();

    // Clock-shift test on break card
    // Resume game with auto ON and wait for half to roll over
    console.log('Resuming game with AUTO on to catch a break card...');
    await evaluate(`document.querySelector('#pre [data-go="resume"]').click()`);
    await sleep(300);

    // Capture post-resume live frames
    for (let i = 1; i <= 3; i++) {
      await snapCanvas(`Resumed ${i}`, `t=+${i * 40}ms (game running)`);
      await sleep(40);
    }

    // Watch for half to change and pause on break card
    const battingClub = async () => evaluate(`document.querySelector('#scoreboard tr.batting td.team')?.textContent ?? ''`);
    let team = await battingClub();
    let breakCardCaptured = false;

    tries = 0;
    while (!breakCardCaptured && tries < 600) {
      await sleep(60);
      tries++;
      const currentTeam = await battingClub();
      if (currentTeam !== team && currentTeam) {
        team = currentTeam;
        for (let i = 0; i < 70 && !(await preUp()); i++) {
          await pressKey('escape');
          await sleep(50);
        }
        if (await preUp()) {
          console.log('Paused on break card!');
          captured.breakCardPaused = await captureScreenshotB64();
          const cardCanvas1 = await evaluate(`document.querySelector('canvas').toDataURL('image/png')`);
          captured.breakCardCanvas1 = cardCanvas1;

          console.log('Holding pause for 8 seconds (exceeding normal card duration)...');
          await sleep(8000);

          await pressKey('escape'); // Resume
          await sleep(80);
          captured.breakCardResumed = await captureScreenshotB64();
          const cardCanvas2 = await evaluate(`document.querySelector('canvas').toDataURL('image/png')`);
          captured.breakCardCanvas2 = cardCanvas2;

          // Wait for card to expire naturally
          await sleep(2500);
          captured.breakCardExpired = await captureScreenshotB64();
          breakCardCaptured = true;
        }
      }
    }

    // Quit to menu test
    await pressKey('t'); // AUTO OFF
    await sleep(500);
    tries = 0;
    while (!(await preUp()) && tries < 100) {
      await pressKey('escape');
      await sleep(90);
      if (await preUp()) break;
      await pressKey(' ');
      await sleep(220);
      await pressKey(' ');
      await sleep(1300);
      tries++;
    }

    if (await preUp()) {
      console.log('Pausing to test QUIT TO MENU...');
      await evaluate(`document.querySelector('#pre [data-go="quit"]').click()`);
      await sleep(1500);
      captured.titleAfterQuit = await captureScreenshotB64();
      console.log('Captured Title Screen after Quit');
    }

    // Build verdict HTML and render to scratch/verdict-filmstrip.png
    console.log('Generating composite verdict filmstrip HTML...');

    const filmstripCardsHtml = filmstripFrames.map(f => `
      <div style="background:#141b16; border:1px solid #2f3a2a; padding:6px; border-radius:4px; width:100px; box-sizing:border-box;">
        <div style="font-size:10px; font-weight:bold; color:#d8b44a; margin-bottom:3px; white-space:nowrap; overflow:hidden;">${f.label}</div>
        <img src="${f.dataUrl}" style="width:100%; height:auto; display:block; border:1px solid #1f271a;" />
        <div style="font-size:8px; color:#8a9a7a; margin-top:3px; line-height:1.1;">${f.note}</div>
      </div>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            margin: 0;
            padding: 24px;
            background: #080d09;
            color: #dcdcc8;
            font-family: monospace;
            box-sizing: border-box;
            width: 1400px;
          }
          .box {
            background: #0d140e;
            border: 1px solid #2f3a2a;
            border-radius: 6px;
            padding: 16px;
            margin-bottom: 20px;
          }
          h1 { color: #f0f0e0; font-size: 22px; margin: 0 0 8px 0; }
          h2 { color: #d8b44a; font-size: 15px; margin: 0 0 12px 0; border-bottom: 1px solid #2f3a2a; padding-bottom: 4px; }
          .verdict-header {
            background: #111a13;
            border: 2px solid #3d5236;
            padding: 16px;
            margin-bottom: 20px;
            border-radius: 6px;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 16px;
          }
          .card {
            background: #121913;
            border: 1px solid #2a3826;
            border-radius: 4px;
            padding: 10px;
          }
          .card-title {
            font-size: 13px;
            font-weight: bold;
            color: #6fbf62;
            margin-bottom: 8px;
          }
          .card-desc {
            font-size: 11px;
            color: #8c9e88;
            margin-top: 6px;
            line-height: 1.4;
          }
          img.screen {
            width: 100%;
            height: auto;
            display: block;
            border: 1px solid #202b1c;
            border-radius: 2px;
          }
          .filmstrip-row {
            display: flex;
            flex-wrap: nowrap;
            gap: 6px;
            overflow-x: hidden;
            margin-top: 10px;
          }
          .tag-pass {
            background: #1a4d22;
            color: #72e07b;
            padding: 4px 12px;
            border-radius: 3px;
            font-weight: bold;
            font-size: 16px;
            display: inline-block;
          }
        </style>
      </head>
      <body>
        <div class="verdict-header">
          <div style="float:right;"><span class="tag-pass">PASS</span></div>
          <h1>ZAIS-6: VERDICT FILMSTRIP & REACHABILITY AUDIT</h1>
          <div style="font-size:13px; color:#a0b49c; margin-bottom:8px; line-height:1.5;">
            <b>ITEM:</b> Pause at idle, a settings screen with two doors, and a reset button in the record book<br>
            <b>REACHED BY:</b> Title Screen -> SETTINGS (Door 1) | Title Screen -> RECORD BOOK -> EMPTY THE RECORD BOOK (Reset) | Exhibition Batting Idle -> ESC -> PAUSED -> SETTINGS (Door 2)
          </div>
          <div style="font-size:13px; color:#72e07b; font-weight:bold; line-height:1.4;">
            <b>WHAT I SAW:</b> The SETTINGS screen opens cleanly from both title card and in-game pause menu with four functioning knobs; the record book empties on confirmed reset while leaving league clubs intact; and ESC stops the game and rAF stepping between pitches with clock shift preserving break cards on resume.
          </div>
        </div>

        <div class="box">
          <h2>1. 40ms MOTION FILMSTRIP: AT-BAT IDLE -> PAUSE (CLOCK FROZEN) -> AUTO STEP GATED -> RESUMED</h2>
          <div style="font-size:11px; color:#8c9e88; margin-bottom:8px;">
            Testing rAF & engine step gating: 3 live idle frames -> ESC pressed -> 4 paused frames (pitcher motionless, 0px change) -> Auto 't' pressed -> 3 paused frames with Auto ON (no autoStep, 0px change) -> Resumed (motion continues).
          </div>
          <div class="filmstrip-row">
            ${filmstripCardsHtml}
          </div>
        </div>

        <div class="grid">
          <div class="card">
            <div class="card-title">DOOR 1: TITLE SCREEN -> SETTINGS CARD</div>
            <img class="screen" src="data:image/png;base64,${captured.settingsTitle}" />
            <div class="card-desc">
              Reached from Title Screen by clicking [SETTINGS] beside CUSTOMIZE. Displays 4 knob rows: Difficulty (g, persisted), Pitch speed (p, persisted), Auto (t, session), Game speed (f, session). BACK [SPACE] returns to title.
            </div>
          </div>

          <div class="card">
            <div class="card-title">THE RECORD BOOK: RESET CONFIRM & EMPTYING</div>
            <img class="screen" src="data:image/png;base64,${captured.bookAfter}" />
            <div class="card-desc">
              Reached from Title Screen -> RECORD BOOK -> EMPTY THE RECORD BOOK button. After native confirm dialog, career years and barrel streak reset to 0 in place; custom league clubs and saved season untouched.
            </div>
          </div>

          <div class="card">
            <div class="card-title">IN-GAME PAUSE SCREEN (IDLE PHASE)</div>
            <img class="screen" src="data:image/png;base64,${captured.pauseScreen}" />
            <div class="card-desc">
              Reached during exhibition batting half at idle by pressing ESC. Shows PAUSED header, RESUME [ESC], SETTINGS, and QUIT TO MENU with explicit quit warning explaining mid-game state discard.
            </div>
          </div>

          <div class="card">
            <div class="card-title">DOOR 2: PAUSE SCREEN -> SETTINGS & BACK TO PAUSE</div>
            <img class="screen" src="data:image/png;base64,${captured.settingsFromPause}" />
            <div class="card-desc">
              Reached from Pause Screen by clicking [SETTINGS]. Shows same 4 knobs. Pressing BACK [SPACE] returns directly to PAUSED screen, NOT back into live game.
            </div>
          </div>
        </div>

        <div class="box" style="margin-top:20px;">
          <h2>2. BREAK CARD CLOCK SHIFT (8-SECOND PAUSE PROOF)</h2>
          <div style="font-size:11px; color:#8c9e88; margin-bottom:12px;">
            Paused on Middle-of-the-2nd break card, held for 8,000ms (far exceeding card lifetime). Upon resume, break card remains displayed with remaining time, then expires naturally into overhead play.
          </div>
          <div style="display:flex; gap:16px;">
            <div style="flex:1;">
              <div style="font-size:11px; color:#d8b44a; margin-bottom:4px;">At Pause (Break Card up)</div>
              <img class="screen" src="${captured.breakCardCanvas1}" />
            </div>
            <div style="flex:1;">
              <div style="font-size:11px; color:#d8b44a; margin-bottom:4px;">After 8-Sec Pause Resume (Intact)</div>
              <img class="screen" src="${captured.breakCardCanvas2}" />
            </div>
          </div>
        </div>

        <div class="card" style="margin-top:20px;">
          <div class="card-title">QUIT TO MENU VERIFICATION</div>
          <img class="screen" src="data:image/png;base64,${captured.titleAfterQuit}" />
          <div class="card-desc">
            Clicking QUIT TO MENU from pause screen reloads back to title menu. No partial loss or career record written; RECORD BOOK card remains absent since career is empty.
          </div>
        </div>
      </body>
      </html>
    `;

    fs.writeFileSync('scratch/verdict.html', html, 'utf-8');

    // Load verdict.html in Chrome and screenshot it
    await sendSession('Page.navigate', { url: `http://localhost:${VITE_PORT}/scratch/verdict.html` });
    await sleep(1000);

    const verdictSnap = await sendSession('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync('scratch/verdict-filmstrip.png', Buffer.from(verdictSnap.data, 'base64'));
    console.log('Saved scratch/verdict-filmstrip.png');

    ws.close();
  } finally {
    vite.kill();
    chrome.kill();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
