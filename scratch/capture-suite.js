import { spawn } from 'child_process';
import fs from 'fs';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CHROME_PORT = 9222;
const VITE_PORT = 5173;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log('Starting Vite...');
  const vite = spawn('node', ['./node_modules/vite/bin/vite.js', '--port', String(VITE_PORT)], { stdio: 'ignore' });

  console.log('Starting Chrome...');
  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${CHROME_PORT}`,
    '--window-size=1800,1200',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ], { stdio: 'ignore' });

  try {
    for (let i = 0; i < 30; i++) {
      await sleep(200);
      try {
        const res = await fetch(`http://localhost:${VITE_PORT}/scratch/filmstrip.html`);
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
      if (msg.method === 'Runtime.consoleAPICalled') {
        console.log('Browser log:', msg.params.args.map(a => a.value || a.description).join(' '));
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        console.error('Browser exception:', msg.params.exceptionDetails);
      }
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

    const { targetId } = await send('Target.createTarget', { url: `http://localhost:${VITE_PORT}/scratch/filmstrip.html` });
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
    await sendSession('DOM.enable');

    console.log('Waiting for filmstrip suite to render...');
    for (let i = 0; i < 40; i++) {
      await sleep(250);
      const ready = await sendSession('Runtime.evaluate', {
        expression: 'window.__ready === true',
        returnByValue: true
      });
      if (ready.result?.value) {
        console.log('Filmstrip suite ready!');
        break;
      }
    }

    // Capture each strip individually
    const strips = [
      'strip-pulled-rh',
      'strip-overhead-pulled',
      'strip-popup',
      'strip-chopper',
      'strip-foul',
      'strip-mitt',
      'strip-lefty-pulled',
      'strip-check-swing',
      'strip-bunt',
      'strip-zone-meeting'
    ];

    for (const stripId of strips) {
      console.log('Capturing:', stripId);
      await sendSession('Runtime.evaluate', {
        expression: `
          (function() {
            let overlay = document.getElementById('capture-overlay');
            if (!overlay) {
              overlay = document.createElement('div');
              overlay.id = 'capture-overlay';
              overlay.style = 'position:fixed;top:0;left:0;width:100vw;min-height:100vh;background:#0d1210;z-index:999999;padding:16px;box-sizing:border-box;color:#e8e8d8;font-family:monospace;';
              document.body.appendChild(overlay);
            }
            overlay.innerHTML = '';
            overlay.appendChild(document.getElementById('${stripId}').cloneNode(true));
          })()
        `
      });
      await sleep(150);

      const snap = await sendSession('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(`scratch/${stripId}.png`, Buffer.from(snap.data, 'base64'));
      console.log(`Saved scratch/${stripId}.png`);
    }

    // Hide overlay
    await sendSession('Runtime.evaluate', {
      expression: `
        const ov = document.getElementById('capture-overlay');
        if (ov) ov.remove();
      `
    });

    // Also capture the main combined filmstrip for the primary deliverable
    console.log('Capturing main combined filmstrip...');
    // Scroll to top
    await sendSession('Runtime.evaluate', { expression: `window.scrollTo(0, 0);` });
    await sleep(200);

    // Capture pulled-rh + overhead combined in one frame for the verdict image
    await sendSession('Runtime.evaluate', {
      expression: `
        (function() {
          const combo = document.createElement('div');
          combo.id = 'verdict-combo';
          combo.style = 'position:fixed;top:0;left:0;width:100vw;min-height:100vh;background:#0d1210;z-index:999999;padding:16px;box-sizing:border-box;color:#e8e8d8;font-family:monospace;';
          combo.appendChild(document.getElementById('strip-pulled-rh').cloneNode(true));
          combo.appendChild(document.getElementById('strip-overhead-pulled').cloneNode(true));
          document.body.appendChild(combo);
        })()
      `
    });
    await sleep(100);
    const comboSnap = await sendSession('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scratch/verdict-filmstrip.png', Buffer.from(comboSnap.data, 'base64'));
    console.log('Saved scratch/verdict-filmstrip.png');

    console.log('All captures completed successfully.');
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
