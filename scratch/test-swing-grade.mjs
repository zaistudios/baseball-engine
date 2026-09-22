import { spawn } from 'child_process';
import fs from 'fs';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CHROME_PORT = 9242;
const VITE_PORT = 5192;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  const vite = spawn('node', ['./node_modules/vite/bin/vite.js', '--port', String(VITE_PORT), '--host', '127.0.0.1', '--strictPort'], {
    stdio: 'ignore'
  });

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
    for (let i = 0; i < 40; i++) {
      await sleep(250);
      try {
        const res = await fetch(`http://127.0.0.1:${VITE_PORT}/game.html`);
        if (res.ok) break;
      } catch (e) {}
    }

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

    // Start Exhibition
    await evaluate(`document.querySelector('button[data-go="exhibition"]').click()`);
    await sleep(300);
    await evaluate(`document.querySelector('button[data-i="0"]').click()`);
    await sleep(300);
    await evaluate(`document.querySelector('button[data-i="1"]').click()`);
    await sleep(1000);

    // Fast-sim or pitch out half-inning to get to bottom of 1st where YOU bat
    console.log('Turning AUTO on to get to batting half...');
    await pressKey('t', 'KeyT'); // AUTO ON
    await pressKey('f', 'KeyF'); // 2x
    await pressKey('f', 'KeyF'); // 4x
    await pressKey('f', 'KeyF'); // 8x

    // Wait until bottom of 1st inning (B1)
    let youBatting = false;
    for (let i = 0; i < 60; i++) {
      await sleep(500);
      const sit = await evaluate(`document.getElementById('situation')?.textContent || ''`);
      if (sit.includes('YOU BAT') || sit.includes('B1')) {
        youBatting = true;
        break;
      }
    }
    console.log('Reached batting half:', youBatting);

    // Turn AUTO off
    await pressKey('t', 'KeyT');
    await sleep(500);

    // Wait for pitch to begin coming in (phase 'windup')
    console.log('Waiting for pitch from opposing arm...');
    // In idle batting phase, pressing Space or wait for pitcher windup
    // Let's check banner or controls
    const phaseNow = await evaluate(`(() => {
      const b = document.getElementById('banner')?.textContent || '';
      const c = document.getElementById('controls')?.textContent || '';
      return { b, c };
    })()`);
    console.log('Batting phase info:', phaseNow);

    ws.close();
  } finally {
    try { chrome.kill(); } catch (e) {}
    try { vite.kill(); } catch (e) {}
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
