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
  console.log('Starting Vite...');
  const vite = spawn('node', ['./node_modules/vite/bin/vite.js', '--port', String(VITE_PORT)], {
    stdio: 'ignore'
  });

  console.log('Starting Chrome...');
  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${CHROME_PORT}`,
    '--window-size=1200,900',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ], { stdio: 'ignore' });

  try {
    // Wait for Vite
    let viteReady = false;
    for (let i = 0; i < 30; i++) {
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

    // Create target page
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

    // Let's inspect page title and DOM
    const evalRes = await sendSession('Runtime.evaluate', {
      expression: 'document.title'
    });
    console.log('Page title:', evalRes.result.value);

    // Take screenshot of title screen
    const snap1 = await sendSession('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scratch/snap1-title.png', Buffer.from(snap1.data, 'base64'));
    console.log('Saved scratch/snap1-title.png');

    // Click Exhibition
    await sendSession('Runtime.evaluate', {
      expression: `document.querySelector('button[data-go="exhibition"]').click()`
    });
    await sleep(300);

    // Pick first club
    await sendSession('Runtime.evaluate', {
      expression: `document.querySelector('button[data-i="0"]').click()`
    });
    await sleep(300);

    // Pick second club (opponent)
    await sendSession('Runtime.evaluate', {
      expression: `document.querySelector('button[data-i="1"]').click()`
    });
    await sleep(500);

    // Take screenshot of in-game screen
    const snap2 = await sendSession('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scratch/snap2-ingame.png', Buffer.from(snap2.data, 'base64'));
    console.log('Saved scratch/snap2-ingame.png');

    // Check __swingGhosts
    await sendSession('Runtime.evaluate', {
      expression: `window.__swingGhosts(true)`
    });
    await sleep(100);
    const snap3 = await sendSession('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scratch/snap3-swingghosts.png', Buffer.from(snap3.data, 'base64'));
    console.log('Saved scratch/snap3-swingghosts.png');

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
