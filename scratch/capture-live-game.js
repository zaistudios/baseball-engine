import { spawn } from 'child_process';
import fs from 'fs';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CHROME_PORT = 9222;
const VITE_PORT = 5173;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  const vite = spawn('node', ['./node_modules/vite/bin/vite.js', '--port', String(VITE_PORT)], { stdio: 'ignore' });
  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${CHROME_PORT}`,
    '--window-size=1800,1200',
    '--disable-gpu',
    'about:blank'
  ], { stdio: 'ignore' });

  try {
    for (let i = 0; i < 30; i++) {
      await sleep(200);
      try {
        const res = await fetch(`http://localhost:${VITE_PORT}/game.html`);
        if (res.ok) break;
      } catch (e) {}
    }

    let wsUrl = null;
    for (let i = 0; i < 30; i++) {
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

    // Title -> EXHIBITION -> Club 0 -> Club 1
    await sendSession('Runtime.evaluate', { expression: `document.querySelector('button[data-go="exhibition"]').click()` });
    await sleep(300);
    await sendSession('Runtime.evaluate', { expression: `document.querySelector('button[data-i="0"]').click()` });
    await sleep(300);
    await sendSession('Runtime.evaluate', { expression: `document.querySelector('button[data-i="1"]').click()` });
    await sleep(500);

    console.log('In game, turning on AUTO mode and filming live frames...');
    await sendSession('Runtime.evaluate', {
      expression: `
        // Turn on auto
        document.querySelector('button kbd')?.parentElement?.click();

        window.__liveFrames = [];
        const cvs = document.querySelector('canvas');
        
        // Sample every 40ms for 250 frames (~10 seconds)
        let total = 0;
        const iv = setInterval(() => {
          if (total++ > 200) {
            clearInterval(iv);
            return;
          }
          window.__liveFrames.push({
            t: performance.now(),
            dataUrl: cvs.toDataURL('image/png')
          });
        }, 40);
      `
    });

    console.log('Recording 8 seconds of live game play...');
    await sleep(8500);

    // Build overlay in the live game.html page!
    await sendSession('Runtime.evaluate', {
      expression: `
        (function() {
          const frames = window.__liveFrames;
          // Find a sequence where a pitch was thrown and resolve/hit occurred
          // Let's sample a slice of 12 consecutive frames (480ms) around a pitch
          // Let's create an overlay showing the filmstrip in live game
          const overlay = document.createElement('div');
          overlay.id = 'live-filmstrip-overlay';
          overlay.style = 'position:fixed;top:0;left:0;width:100vw;min-height:100vh;background:#0d1210;z-index:999999;padding:16px;box-sizing:border-box;color:#e8e8d8;font-family:monospace;overflow-y:auto;';
          
          // Let's pick 10 frames from frame 40 to 50
          const slice = frames.slice(35, 47);
          overlay.innerHTML = \`
            <div style="font-size:16px;color:#d8b44a;font-weight:bold;margin-bottom:6px;">
              LIVE GAMEPLAY FILMSTRIP (Captured from game.html in browser)
            </div>
            <div style="font-size:12px;color:#7a8a6a;margin-bottom:12px;">
              Title screen -> EXHIBITION -> NYE vs NYV. 40ms canvas snapshot intervals during live at-bat.
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;">
              \${slice.map((f, i) => \`
                <div style="background:#141b16;border:1px solid #2f3a2a;padding:4px;text-align:center;">
                  <div style="font-size:10px;color:#d8b44a;">+\${i * 40}ms</div>
                  <img src="\${f.dataUrl}" style="width:230px;height:186px;display:block;border:1px solid #222c20;" />
                </div>
              \`).join('')}
            </div>
          \`;
          document.body.appendChild(overlay);
        })()
      `
    });

    await sleep(200);
    const snap = await sendSession('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scratch/live-game-filmstrip.png', Buffer.from(snap.data, 'base64'));
    console.log('Saved scratch/live-game-filmstrip.png');

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
