import { spawn } from 'child_process';
import fs from 'fs';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CHROME_PORT = 9223;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  const card1B64 = fs.readFileSync('shots/canvas-at-pause.png').toString('base64');
  const card2B64 = fs.readFileSync('shots/canvas-after-resume.png').toString('base64');

  let html = fs.readFileSync('scratch/verdict.html', 'utf-8');
  // Replace undefined or broken src with data URIs
  html = html.replace(/<img class="screen" src="undefined" \/>/g, (match, offset) => {
    // There are two occurrences in order
    return `<img class="screen" src="data:image/png;base64,${card1B64}" />`;
  });
  // Fix second occurrence
  const idx = html.lastIndexOf('data:image/png;base64,' + card1B64);
  if (idx !== -1) {
    html = html.substring(0, idx) + 'data:image/png;base64,' + card2B64 + html.substring(idx + ('data:image/png;base64,' + card1B64).length);
  }

  fs.writeFileSync('scratch/verdict.html', html, 'utf-8');

  console.log('Starting Chrome to render updated verdict-filmstrip.png...');
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
    let wsUrl = null;
    for (let i = 0; i < 30; i++) {
      await sleep(150);
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

    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });

    function sendSession(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = msgId++;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, sessionId, method, params }));
      });
    }

    await sendSession('Page.enable');
    await sendSession('Page.setDocumentContent', { frameId: targetId, html });
    await sleep(600);

    const verdictSnap = await sendSession('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync('scratch/verdict-filmstrip.png', Buffer.from(verdictSnap.data, 'base64'));
    console.log('Saved updated scratch/verdict-filmstrip.png successfully!');

    ws.close();
  } finally {
    chrome.kill();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
