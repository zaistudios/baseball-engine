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

    console.log('Turn on AUTO mode...');
    await sendSession('Runtime.evaluate', {
      expression: `
        // Click the auto button
        const btn = document.querySelector('button kbd')?.parentElement;
        if (btn) btn.click();
      `
    });

    // Let's hook canvas render or sample frames every 40ms for 6 seconds
    await sendSession('Runtime.evaluate', {
      expression: `
        window.__samples = [];
        const cvs = document.querySelector('canvas');
        let count = 0;
        const interval = setInterval(() => {
          if (count++ > 150) { // ~6 seconds
            clearInterval(interval);
            return;
          }
          window.__samples.push(cvs.toDataURL('image/png'));
        }, 40);
      `
    });

    console.log('Watching for 6 seconds...');
    await sleep(6500);

    const countRes = await sendSession('Runtime.evaluate', {
      expression: `window.__samples.length`,
      returnByValue: true
    });
    console.log('Sampled frames:', countRes.result.value);

    // Check if the game progressed (e.g. scoreboard or log)
    const logRes = await sendSession('Runtime.evaluate', {
      expression: `document.querySelector('.playlog')?.textContent || document.body.innerText`,
      returnByValue: true
    });
    console.log('Play text excerpt:', logRes.result.value.substring(0, 300));

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
