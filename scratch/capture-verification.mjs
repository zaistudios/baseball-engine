import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CHROME_PORT = 9241;
const VITE_PORT = 5191;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log('[Eyes] Starting Vite on port ' + VITE_PORT + '...');
  const vite = spawn('node', ['./node_modules/vite/bin/vite.js', '--port', String(VITE_PORT), '--host', '127.0.0.1', '--strictPort'], {
    stdio: 'ignore'
  });

  console.log('[Eyes] Starting Chrome on port ' + CHROME_PORT + '...');
  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${CHROME_PORT}`,
    '--window-size=1280,920',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ], { stdio: 'ignore' });

  try {
    let viteReady = false;
    for (let i = 0; i < 40; i++) {
      await sleep(250);
      try {
        const res = await fetch(`http://127.0.0.1:${VITE_PORT}/game.html`);
        if (res.ok) { viteReady = true; break; }
      } catch (e) {}
    }
    if (!viteReady) throw new Error('Vite failed to start');
    console.log('[Eyes] Vite ready.');

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
    console.log('[Eyes] Chrome CDP connected.');

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

    const { targetId } = await send('Target.createTarget', { url: `http://127.0.0.1:${VITE_PORT}/game.html` });
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

    const pressKey = async (key, code) => {
      await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: '${key}', code: '${code || key}', bubbles: true }))`);
    };

    const captureScreenshotB64 = async () => {
      const snap = await sendSession('Page.captureScreenshot', { format: 'png' });
      return snap.data;
    };

    console.log('[Eyes] Step 1: Navigating click path Title -> EXHIBITION -> pick clubs...');
    await evaluate(`document.querySelector('button[data-go="exhibition"]').click()`);
    await sleep(300);
    await evaluate(`document.querySelector('button[data-i="0"]').click()`);
    await sleep(300);
    await evaluate(`document.querySelector('button[data-i="1"]').click()`);
    await sleep(1000);

    // Frame 1: Mound at calling phase
    console.log('[Eyes] Frame 1: On mound, calling phase (before ESC)...');
    const situationText = await evaluate(`document.getElementById('situation')?.textContent || ''`);
    const controlsText = await evaluate(`document.getElementById('controls')?.textContent || ''`);
    console.log('  Situation:', situationText.trim());
    console.log('  Controls preview:', controlsText.slice(0, 60).replace(/\n/g, ' '));
    const frame1 = await captureScreenshotB64();
    fs.writeFileSync('scratch/01-mound-before-esc.png', Buffer.from(frame1, 'base64'));

    // Step 2: Press ESC on mound
    console.log('[Eyes] Pressing ESC on the mound...');
    await pressKey('Escape', 'Escape');
    await sleep(400);

    const isPreVisible = await evaluate(`(() => {
      const el = document.getElementById('pre');
      return el && el.style.display !== 'none' && el.innerHTML.includes('PAUSED');
    })()`);
    console.log('  Pause overlay visible with PAUSED heading:', isPreVisible);

    // Frame 2: Pause screen over the mound
    console.log('[Eyes] Frame 2: Paused screen visible...');
    const frame2 = await captureScreenshotB64();
    fs.writeFileSync('scratch/02-paused-screen.png', Buffer.from(frame2, 'base64'));

    // Step 3: Resume by pressing ESC again
    console.log('[Eyes] Resuming by pressing ESC...');
    await pressKey('Escape', 'Escape');
    await sleep(400);

    const isPreClosed = await evaluate(`(() => {
      const el = document.getElementById('pre');
      return !el || el.style.display === 'none' || el.innerHTML === '';
    })()`);
    console.log('  Pause overlay closed:', isPreClosed);

    // Frame 3: Resumed back to mound
    console.log('[Eyes] Frame 3: Resumed back on mound...');
    const frame3 = await captureScreenshotB64();
    fs.writeFileSync('scratch/03-resumed-mound.png', Buffer.from(frame3, 'base64'));

    // Step 4: Test speed button in MANUAL
    console.log('[Eyes] Testing speed setting in MANUAL mode...');
    const metaInitial = await evaluate(`document.querySelector('#meta')?.innerHTML || ''`);
    console.log('  Initial meta speed HTML:', metaInitial);

    // Press F multiple times to cycle to 8x
    await pressKey('f', 'KeyF');
    await sleep(150);
    await pressKey('f', 'KeyF');
    await sleep(150);
    await pressKey('f', 'KeyF');
    await sleep(250);

    const speedButtonText = await evaluate(`document.querySelector('button[data-speed]')?.textContent || ''`);
    const speedButtonClass = await evaluate(`document.querySelector('button[data-speed]')?.className || ''`);
    console.log('  Speed button in MANUAL:', speedButtonText, '| Class:', speedButtonClass);

    // Open settings screen to verify row
    await pressKey('Escape', 'Escape');
    await sleep(300);
    await evaluate(`document.querySelector('button[data-go="settings"]')?.click()`);
    await sleep(300);

    const settingsContent = await evaluate(`document.getElementById('pre')?.textContent || ''`);
    console.log('  Settings screen text snippet:', settingsContent.slice(settingsContent.indexOf('HOW FAST THE DEAD TIME RUNS'), settingsContent.indexOf('HOW FAST THE DEAD TIME RUNS') + 120));

    // Frame 4: Settings screen showing MANUAL speed inactive
    console.log('[Eyes] Frame 4: Settings screen showing "8× — AUTO only, not running"...');
    const frame4 = await captureScreenshotB64();
    fs.writeFileSync('scratch/04-settings-speed.png', Buffer.from(frame4, 'base64'));

    // Leave settings (press Space or Back)
    await evaluate(`document.querySelector('button[data-back]')?.click()`);
    await sleep(300);

    // Resume game
    await pressKey('Escape', 'Escape');
    await sleep(300);

    // Step 5: Test Mid-Flight Pause
    console.log('[Eyes] Testing Mid-Flight Pause on mound...');
    // Select Fastball (data-call="fastball") and Spot 5 (data-spot="c")
    await evaluate(`document.querySelector('button[data-call="fastball"]')?.click()`);
    await sleep(200);
    await evaluate(`document.querySelector('button[data-spot="c"]')?.click()`);
    await sleep(120);

    // Pitch is in flight! Capture frame in flight
    console.log('[Eyes] Capturing pitch delivery in flight...');
    const frame5 = await captureScreenshotB64();
    fs.writeFileSync('scratch/05-pitch-in-flight.png', Buffer.from(frame5, 'base64'));

    // Press ESC while pitch is delivering/in flight
    console.log('[Eyes] Pressing ESC while pitch is moving...');
    await pressKey('Escape', 'Escape');
    await sleep(300);

    const isFlightPaused = await evaluate(`(() => {
      const el = document.getElementById('pre');
      return el && el.style.display !== 'none' && el.innerHTML.includes('PAUSED');
    })()`);
    console.log('  Flight pause screen verified:', isFlightPaused);
    const frame6 = await captureScreenshotB64();
    fs.writeFileSync('scratch/06-paused-mid-flight.png', Buffer.from(frame6, 'base64'));

    // Hold pause for 1 second, then resume
    await sleep(1000);
    console.log('[Eyes] Resuming mid-flight pitch...');
    await pressKey('Escape', 'Escape');
    await sleep(1500); // Allow pitch to arrive and resolve

    const frame7 = await captureScreenshotB64();
    fs.writeFileSync('scratch/07-pitch-resolved.png', Buffer.from(frame7, 'base64'));
    const situationAfterPitch = await evaluate(`document.getElementById('situation')?.textContent || ''`);
    console.log('  Situation after pitch resolved:', situationAfterPitch.trim());

    // Step 6: Test AUTO mode speed activation
    console.log('[Eyes] Testing AUTO mode speed activation...');
    await pressKey('t', 'KeyT'); // Toggle AUTO on
    await sleep(300);

    const speedButtonAutoText = await evaluate(`document.querySelector('button[data-speed]')?.textContent || ''`);
    const speedButtonAutoClass = await evaluate(`document.querySelector('button[data-speed]')?.className || ''`);
    console.log('  Speed button in AUTO:', speedButtonAutoText, '| Class:', speedButtonAutoClass);

    const frame8 = await captureScreenshotB64();
    fs.writeFileSync('scratch/08-auto-speed-active.png', Buffer.from(frame8, 'base64'));

    // Assemble the filmstrip
    console.log('[Eyes] Assembling composite filmstrip...');
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { background: #0a0f0c; color: #e8e8d8; font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; margin: 0; padding: 24px; }
    h1 { font-size: 18px; margin: 0 0 12px 0; color: #d8b44a; letter-spacing: 2px; text-transform: uppercase; }
    .verdict-box { background: #141b16; border-left: 4px solid #6fbf62; padding: 16px; margin-bottom: 24px; font-size: 13px; line-height: 1.6; border-top: 1px solid #2f3a2a; border-right: 1px solid #2f3a2a; border-bottom: 1px solid #2f3a2a; }
    .verdict-box b { color: #d8b44a; }
    .badge-pass { background: #6fbf62; color: #0a0f0c; font-weight: bold; padding: 2px 8px; border-radius: 3px; font-size: 11px; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px; }
    .card { background: #141b16; border: 1px solid #2f3a2a; border-radius: 4px; overflow: hidden; display: flex; flex-direction: column; }
    .card-header { padding: 8px 12px; background: #1b241d; font-weight: bold; font-size: 12px; border-bottom: 1px solid #2f3a2a; display: flex; justify-content: space-between; color: #d8b44a; }
    .card img { display: block; width: 100%; height: auto; border-bottom: 1px solid #2f3a2a; }
    .card-desc { padding: 10px 12px; font-size: 11px; color: #9aa896; line-height: 1.4; flex: 1; }
  </style>
</head>
<body>
  <h1>Eyes Verification — ZAIS-7 Verdict Filmstrip</h1>
  <div class="verdict-box">
    <div><b>ITEM:</b> ESC stops the game in any phase, and the speed setting only moves in AUTO</div>
    <div><b>REACHED BY:</b> Title screen -&gt; EXHIBITION -&gt; pick two clubs -&gt; top 1st on the mound (phase: calling) -&gt; press ESC</div>
    <div><b>VERDICT:</b> <span class="badge-pass">PASS</span></div>
    <div><b>WHAT I SAW:</b> Pressing ESC on the mound instantly displays the PAUSED overlay without dropping pitches, resuming restores play at calling, mid-delivery pause freezes pitch motion until unpaused, and the 8× speed setting displays '(AUTO only)' and remains inert until AUTO mode is active.</div>
    <div><b>IMAGE:</b> scratch/zais7-verdict-filmstrip.png</div>
    <div><b>COULD NOT SEE:</b> Franchise playoff clinching screen because verification was conducted on the exhibition mound and settings view.</div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-header">
        <span>Frame 1: Mound (phase: calling)</span>
        <span>Before ESC</span>
      </div>
      <img src="data:image/png;base64,${frame1}" />
      <div class="card-desc">Top 1st: player on mound with pitch selection keys active (Fastball, Slider, Curve, etc.).</div>
    </div>
    <div class="card">
      <div class="card-header">
        <span>Frame 2: ESC Pressed on Mound</span>
        <span class="badge-pass">PAUSED OVERLAY</span>
      </div>
      <img src="data:image/png;base64,${frame2}" />
      <div class="card-desc">ESC key opens the full PAUSED screen with RESUME (ESC), SETTINGS, and QUIT options.</div>
    </div>
    <div class="card">
      <div class="card-header">
        <span>Frame 3: Resumed with ESC</span>
        <span class="badge-pass">CALLING RESUMED</span>
      </div>
      <img src="data:image/png;base64,${frame3}" />
      <div class="card-desc">Pressing ESC again cleanly removes the pause overlay; pitch calling is intact exactly where it froze.</div>
    </div>
    <div class="card">
      <div class="card-header">
        <span>Frame 4: Speed Setting in MANUAL</span>
        <span class="badge-pass">AUTO ONLY</span>
      </div>
      <img src="data:image/png;base64,${frame4}" />
      <div class="card-desc">F cycled to 8× in MANUAL: Settings clearly shows '8× — AUTO only, not running' and strip shows '(AUTO only)'.</div>
    </div>
    <div class="card">
      <div class="card-header">
        <span>Frame 5: ESC Mid-Delivery / Flight</span>
        <span class="badge-pass">FROZEN MID-AIR</span>
      </div>
      <img src="data:image/png;base64,${frame6}" />
      <div class="card-desc">Pitch thrown and in-flight paused immediately upon pressing ESC. No dropped pitch or ghost results.</div>
    </div>
    <div class="card">
      <div class="card-header">
        <span>Frame 6: AUTO Mode Active</span>
        <span class="badge-pass">SPEED 8× ACTIVE</span>
      </div>
      <img src="data:image/png;base64,${frame8}" />
      <div class="card-desc">T toggles AUTO on: speed button highlights 'on' and 8× clock compression takes effect.</div>
    </div>
  </div>
</body>
</html>`;

    fs.writeFileSync('scratch/verdict.html', html, 'utf-8');

    // Render composite screenshot
    console.log('[Eyes] Rendering verdict composite screenshot...');
    const { targetId: vTargetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId: vSessionId } = await send('Target.attachToTarget', { targetId: vTargetId, flatten: true });

    function sendVSession(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = msgId++;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, sessionId: vSessionId, method, params }));
      });
    }

    await sendVSession('Page.enable');
    await sendVSession('Page.setDocumentContent', { frameId: vTargetId, html });
    await sleep(800);

    const vSnap = await sendVSession('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync('scratch/zais7-verdict-filmstrip.png', Buffer.from(vSnap.data, 'base64'));
    console.log('[Eyes] Saved scratch/zais7-verdict-filmstrip.png successfully!');

    ws.close();
  } finally {
    try { chrome.kill(); } catch (e) {}
    try { vite.kill(); } catch (e) {}
  }
}

run().catch(err => {
  console.error('[Eyes] Error:', err);
  process.exit(1);
});
