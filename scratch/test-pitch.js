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
    '--window-size=1200,900',
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

    // Exhibition -> Club 0 -> Club 1
    await sendSession('Runtime.evaluate', { expression: `document.querySelector('button[data-go="exhibition"]').click()` });
    await sleep(300);
    await sendSession('Runtime.evaluate', { expression: `document.querySelector('button[data-i="0"]').click()` });
    await sleep(300);
    await sendSession('Runtime.evaluate', { expression: `document.querySelector('button[data-i="1"]').click()` });
    await sleep(500);

    console.log('Setting up frame recorder in page...');
    await sendSession('Runtime.evaluate', {
      expression: `
        window.__recordedFrames = [];
        window.__isRecording = false;
        const cvs = document.querySelector('canvas');

        // Snapshot every 40ms while recording
        setInterval(() => {
          if (window.__isRecording) {
            window.__recordedFrames.push({
              time: performance.now(),
              dataUrl: cvs.toDataURL('image/png')
            });
          }
        }, 40);

        window.__startRecord = () => {
          window.__recordedFrames = [];
          window.__isRecording = true;
        };

        window.__stopRecord = () => {
          window.__isRecording = false;
          return window.__recordedFrames;
        };
      `
    });

    // Pitch delivery: press space to start delivery
    console.log('Pressing Space to start delivery...');
    await sendSession('Runtime.evaluate', {
      expression: `
        window.__startRecord();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
      `
    });

    // Wait 400ms for meter/delivery, press space again to release pitch
    await sleep(400);
    console.log('Pressing Space to release pitch...');
    await sendSession('Runtime.evaluate', {
      expression: `window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));`
    });

    // Wait 2000ms for pitch flight, swing/contact, and resolve
    await sleep(2000);
    const recRes = await sendSession('Runtime.evaluate', {
      expression: `window.__stopRecord();`
    });
    console.log('Recorded frames count:', recRes.result.value ? recRes.result.value.length : 0);

    // Save overlay of recorded frames
    await sendSession('Runtime.evaluate', {
      expression: `
        const frames = window.__recordedFrames;
        let overlay = document.createElement('div');
        overlay.id = 'pitch-filmstrip';
        overlay.style = 'position:fixed;top:0;left:0;width:100vw;min-height:100vh;background:#0d1210;z-index:999999;padding:16px;box-sizing:border-box;color:#e8e8d8;font-family:monospace;overflow-y:auto;';
        overlay.innerHTML = '<div style="font-size:16px;color:#d8b44a;margin-bottom:10px;">LIVE PITCH FILMSTRIP (' + frames.length + ' frames @ 40ms)</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:8px;">' +
          frames.map((f, i) =>
            '<div style="background:#141b16;border:1px solid #2f3a2a;padding:4px;text-align:center;">' +
              '<div style="font-size:10px;color:#7a8a6a;">+' + (i * 40) + 'ms</div>' +
              '<img src="' + f.dataUrl + '" style="width:210px;height:170px;display:block;" />' +
            '</div>'
          ).join('') +
          '</div>';
        document.body.appendChild(overlay);
      `
    });

    const snap = await sendSession('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scratch/live-pitch-filmstrip.png', Buffer.from(snap.data, 'base64'));
    console.log('Saved scratch/live-pitch-filmstrip.png');

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
