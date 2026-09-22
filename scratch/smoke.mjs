import { spawn } from 'child_process';
import fs from 'fs';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CHROME_PORT = 9240;
const VITE_PORT = 5190;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log('Starting Vite server on port ' + VITE_PORT + '...');
  const vite = spawn('node', ['./node_modules/vite/bin/vite.js', '--port', String(VITE_PORT), '--host', '127.0.0.1', '--strictPort'], {
    stdio: 'inherit'
  });

  console.log('Starting Chrome on port ' + CHROME_PORT + '...');
  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${CHROME_PORT}`,
    '--window-size=1280,900',
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
    console.log('Vite ready.');

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
    console.log('Chrome CDP ready:', wsUrl);

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
    await sleep(1500);

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

    const title = await evaluate('document.title');
    console.log('Page title:', title);

    const startVisible = await evaluate(`(() => {
      const el = document.getElementById('start');
      return el && el.style.display !== 'none';
    })()`);
    console.log('Start menu visible:', startVisible);

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
