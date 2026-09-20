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
  const vite = spawn('node', ['./node_modules/vite/bin/vite.js', '--port', String(VITE_PORT)], {
    stdio: 'ignore'
  });

  console.log('Starting Chrome...');
  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${CHROME_PORT}`,
    '--window-size=1600,1200',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ], { stdio: 'ignore' });

  try {
    let viteReady = false;
    for (let i = 0; i < 30; i++) {
      await sleep(200);
      try {
        const res = await fetch(`http://localhost:${VITE_PORT}/game.html`);
        if (res.ok) { viteReady = true; break; }
      } catch (e) {}
    }
    if (!viteReady) throw new Error('Vite failed to start');

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

    // Click Exhibition
    await sendSession('Runtime.evaluate', {
      expression: `document.querySelector('button[data-go="exhibition"]').click()`
    });
    await sleep(300);

    // Pick first club (NYE)
    await sendSession('Runtime.evaluate', {
      expression: `document.querySelector('button[data-i="0"]').click()`
    });
    await sleep(300);

    // Pick second club (BOS or similar)
    await sendSession('Runtime.evaluate', {
      expression: `document.querySelector('button[data-i="1"]').click()`
    });
    await sleep(500);

    console.log('In game.');

    // Helper to evaluate in page
    async function evaluate(code) {
      const res = await sendSession('Runtime.evaluate', {
        expression: code,
        returnByValue: true,
        awaitPromise: true
      });
      if (res.exceptionDetails) {
        throw new Error(JSON.stringify(res.exceptionDetails));
      }
      return res.result.value;
    }

    // Capture filmstrip function inside page
    await evaluate(`
      window.__makeFilmstrip = function(title, blurb, frames) {
        let el = document.getElementById('filmstrip-overlay');
        if (!el) {
          el = document.createElement('div');
          el.id = 'filmstrip-overlay';
          document.body.appendChild(el);
        }
        el.style = 'position:fixed;top:0;left:0;width:100vw;min-height:100vh;background:#0d1210;z-index:999999;padding:16px;box-sizing:border-box;color:#e8e8d8;font-family:monospace;overflow-y:auto;';
        el.innerHTML = \`
          <div style="font-size:16px;font-weight:bold;margin-bottom:6px;color:#d8b44a;">\${title}</div>
          <div style="font-size:12px;color:#7a8a6a;margin-bottom:14px;">\${blurb}</div>
          <div style="display:flex;flex-wrap:wrap;gap:10px;">
            \${frames.map(f => \`
              <div style="background:#141b16;border:1px solid #2f3a2a;padding:6px;text-align:center;">
                <div style="font-size:11px;color:#e8e8d8;margin-bottom:4px;">\${f.label}</div>
                <img src="\${f.dataUrl}" style="width:280px;height:226px;display:block;border:1px solid #222c20;" />
                \${f.sub ? \`<div style="font-size:10px;color:#7a8a6a;margin-top:4px;">\${f.sub}</div>\` : ''}
              </div>
            \`).join('')}
          </div>
        \`;
      };

      window.__hideFilmstrip = function() {
        const el = document.getElementById('filmstrip-overlay');
        if (el) el.remove();
      };
    `);

    // Let's create filmstrips for the 5 shots and key mechanics:

    // 1. Pulled line drive: RH batter, exit 102mph, LA 14, Dir -24 (pulled to left field)
    console.log('Capturing: Pulled line drive (RH batter)...');
    await evaluate(`
      (function() {
        const cvs = document.querySelector('canvas');
        const frames = [];
        const times = [0, 40, 80, 120, 160, 200, 240, 280, 320, 360, 400];
        
        // Render each frame of batted flight
        for (const t of times) {
          // Set batted state
          batted = {
            at: performance.now() - t,
            from: { x: 3.4, y: -48 }, // contact barrel at zone center
            hit: { exitVelocity: 102, launchAngle: 14, direction: -24 }
          };
          phase = 'resolve';
          drawField(performance.now());
          frames.push({
            label: '+' + t + 'ms',
            dataUrl: cvs.toDataURL('image/png'),
            sub: t === 0 ? 'contact' : (t >= 320 ? 'horizon / vanished' : 'flying to LF')
          });
        }
        
        window.__makeFilmstrip(
          'ITEM: PULLED LINE DRIVE (Right-handed batter)',
          '102 mph · 14° launch angle · -24° spray (left field). Ball leaves bat screen-left, shrinks toward mound vanishing point, vanishes at horizon.',
          frames
        );
      })()
    `);
    let snap = await sendSession('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scratch/filmstrip-1-pulled-line-drive.png', Buffer.from(snap.data, 'base64'));
    console.log('Saved scratch/filmstrip-1-pulled-line-drive.png');

    // Also check overhead for the pulled line drive!
    console.log('Capturing overhead for pulled line drive...');
    await evaluate(`
      (function() {
        window.__hideFilmstrip();
        window.__play('double', 102, 14, -24);
        const cvs = document.querySelector('canvas');
        const frames = [];
        for (let ms = 0; ms <= 1600; ms += 200) {
          const dataUrl = window.__frame(ms);
          frames.push({
            label: '+' + ms + 'ms',
            dataUrl: dataUrl,
            sub: ms === 0 ? 'cut to overhead' : (ms === 800 ? 'over left field' : 'landing / fielded')
          });
        }
        window.__makeFilmstrip(
          'ITEM: PULLED LINE DRIVE — OVERHEAD LANDING',
          '102 mph · -24° spray. Does the overhead land it in left field to match the screen-left at-bat flight?',
          frames
        );
      })()
    `);
    snap = await sendSession('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scratch/filmstrip-1b-overhead-pulled-line-drive.png', Buffer.from(snap.data, 'base64'));
    console.log('Saved scratch/filmstrip-1b-overhead-pulled-line-drive.png');

    // 2. Pop-up: exit 84mph, LA 68, Dir 4
    console.log('Capturing: Pop-up...');
    await evaluate(`
      (function() {
        window.__hideFilmstrip();
        const cvs = document.querySelector('canvas');
        const frames = [];
        const times = [0, 40, 80, 120, 160, 200, 240, 280, 320];
        for (const t of times) {
          batted = {
            at: performance.now() - t,
            from: { x: 3.4, y: -48 },
            hit: { exitVelocity: 84, launchAngle: 68, direction: 4 }
          };
          phase = 'resolve';
          drawField(performance.now());
          frames.push({
            label: '+' + t + 'ms',
            dataUrl: cvs.toDataURL('image/png'),
            sub: t === 0 ? 'contact' : (t >= 200 ? 'climbing out of frame' : 'rising steeply')
          });
        }
        window.__makeFilmstrip(
          'ITEM: POP-UP',
          '84 mph · 68° launch angle · 4° spray. Ball climbs straight up and exits top of frame before camera cuts.',
          frames
        );
      })()
    `);
    snap = await sendSession('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scratch/filmstrip-2-popup.png', Buffer.from(snap.data, 'base64'));
    console.log('Saved scratch/filmstrip-2-popup.png');

    // 3. Chopper: exit 68mph, LA -16, Dir -6
    console.log('Capturing: Chopper...');
    await evaluate(`
      (function() {
        window.__hideFilmstrip();
        const cvs = document.querySelector('canvas');
        const frames = [];
        const times = [0, 40, 80, 120, 160, 200, 240, 280, 320, 360, 400];
        for (const t of times) {
          batted = {
            at: performance.now() - t,
            from: { x: 3.4, y: -48 },
            hit: { exitVelocity: 68, launchAngle: -16, direction: -6 }
          };
          phase = 'resolve';
          drawField(performance.now());
          frames.push({
            label: '+' + t + 'ms',
            dataUrl: cvs.toDataURL('image/png'),
            sub: t === 0 ? 'contact' : 'skips on dirt floor near plate line'
          });
        }
        window.__makeFilmstrip(
          'ITEM: CHOPPER',
          '68 mph · -16° launch angle (into dirt). Ball hits dirt floor and trickles forward low near plate line.',
          frames
        );
      })()
    `);
    snap = await sendSession('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scratch/filmstrip-3-chopper.png', Buffer.from(snap.data, 'base64'));
    console.log('Saved scratch/filmstrip-3-chopper.png');

    // 4. Foul: exit 92mph, LA 32, Dir -72 (back over/beside camera)
    console.log('Capturing: Foul...');
    await evaluate(`
      (function() {
        window.__hideFilmstrip();
        const cvs = document.querySelector('canvas');
        const frames = [];
        const times = [0, 40, 80, 120, 160, 200, 240];
        for (const t of times) {
          batted = {
            at: performance.now() - t,
            from: { x: 3.4, y: -48 },
            hit: { exitVelocity: 92, launchAngle: 32, direction: -72 }
          };
          phase = 'resolve';
          drawField(performance.now());
          frames.push({
            label: '+' + t + 'ms',
            dataUrl: cvs.toDataURL('image/png'),
            sub: t === 0 ? 'contact' : (t >= 160 ? 'leaves frame edge' : 'grows toward camera')
          });
        }
        window.__makeFilmstrip(
          'ITEM: FOUL BACK / ASIDE',
          '92 mph · 32° launch angle · -72° spray. Ball comes back at camera, expands in size, and exits frame edge.',
          frames
        );
      })()
    `);
    snap = await sendSession('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scratch/filmstrip-4-foul.png', Buffer.from(snap.data, 'base64'));
    console.log('Saved scratch/filmstrip-4-foul.png');

    // 5. Swing and miss / Take into catcher's mitt
    console.log('Capturing: Swing and miss / Catcher mitt...');
    await evaluate(`
      (function() {
        window.__hideFilmstrip();
        const cvs = document.querySelector('canvas');
        const frames = [];
        const times = [0, 40, 80, 120, 160, 200, 240, 280];
        
        // Pitch arriving at middle (210, 202)
        pitch = {
          type: 'fastball',
          location: 'middle',
          inZone: true,
          hitBatter: false,
        };
        launchAt = performance.now() - 500;
        arriveAt = performance.now(); // arrives at t=0
        batted = null;
        swingStartedAt = null;
        phase = 'resolve';
        
        for (const t of times) {
          const now = arriveAt + t;
          drawField(now);
          frames.push({
            label: '+' + t + 'ms past plate',
            dataUrl: cvs.toDataURL('image/png'),
            sub: t === 0 ? 'crosses plate' : (t >= 140 ? 'settled in mitt' : 'decelerating to mitt')
          });
        }
        window.__makeFilmstrip(
          'ITEM: SWING AND MISS / PITCH INTO CATCHER MITT',
          'Unbatted pitch crosses plate at t=0, decelerates over 140ms into catcher glove at (217, 284), and rests there.',
          frames
        );
      })()
    `);
    snap = await sendSession('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scratch/filmstrip-5-catcher-mitt.png', Buffer.from(snap.data, 'base64'));
    console.log('Saved scratch/filmstrip-5-catcher-mitt.png');

    // 6. Left-handed batter pulled line drive: exit 100mph, LA 15, Dir +25 (pulled to right field)
    console.log('Capturing: Left-handed batter pulled line drive...');
    await evaluate(`
      (function() {
        window.__hideFilmstrip();
        const cvs = document.querySelector('canvas');
        const frames = [];
        const times = [0, 40, 80, 120, 160, 200, 240, 280, 320, 360, 400];
        
        for (const t of times) {
          batted = {
            at: performance.now() - t,
            from: { x: -3.4, y: -48 }, // Left-handed batter barrel
            hit: { exitVelocity: 100, launchAngle: 15, direction: 25 } // Pulled for lefty (+ is right field)
          };
          phase = 'resolve';
          drawField(performance.now());
          frames.push({
            label: '+' + t + 'ms',
            dataUrl: cvs.toDataURL('image/png'),
            sub: t === 0 ? 'contact' : 'flies screen-right toward RF'
          });
        }
        window.__makeFilmstrip(
          'ITEM: LEFT-HANDED BATTER PULLED LINE DRIVE',
          '100 mph · 15° launch angle · +25° spray (right field for lefty). Ball leaves bat screen-right, shrinking toward mound.',
          frames
        );
      })()
    `);
    snap = await sendSession('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scratch/filmstrip-6-lefty-pulled.png', Buffer.from(snap.data, 'base64'));
    console.log('Saved scratch/filmstrip-6-lefty-pulled.png');

    // 7. Check swing retreat
    console.log('Capturing: Check swing retreat...');
    await evaluate(`
      (function() {
        window.__hideFilmstrip();
        const cvs = document.querySelector('canvas');
        const frames = [];
        const times = [0, 40, 80, 120, 160, 200, 240];
        
        const start = performance.now();
        swingTravel = 200;
        swingStartedAt = start - 150;
        checkedAt = start; // checked at 150ms into swing
        batted = null;
        phase = 'windup';
        
        for (const t of times) {
          const now = checkedAt + t;
          drawField(now);
          frames.push({
            label: '+' + t + 'ms after check',
            dataUrl: cvs.toDataURL('image/png'),
            sub: t === 0 ? 'peak check reach' : (t >= 200 ? 'retreated to load' : 'winding backwards')
          });
        }
        window.__makeFilmstrip(
          'ITEM: CHECK SWING RETREAT',
          'Bat is checked mid-swing, winds backwards toward load pose over 200ms rather than completing swing.',
          frames
        );
      })()
    `);
    snap = await sendSession('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scratch/filmstrip-7-check-swing.png', Buffer.from(snap.data, 'base64'));
    console.log('Saved scratch/filmstrip-7-check-swing.png');

    // 8. Bunt: exit 42mph, LA 2, Dir 10
    console.log('Capturing: Bunt...');
    await evaluate(`
      (function() {
        window.__hideFilmstrip();
        const cvs = document.querySelector('canvas');
        const frames = [];
        const times = [0, 40, 80, 120, 160, 200, 240, 280, 320, 360, 400];
        
        for (const t of times) {
          batted = {
            at: performance.now() - t,
            from: { x: 0, y: 0 }, // at plate
            hit: { exitVelocity: 42, launchAngle: 2, direction: 10 }
          };
          phase = 'resolve';
          drawField(performance.now());
          frames.push({
            label: '+' + t + 'ms',
            dataUrl: cvs.toDataURL('image/png'),
            sub: t === 0 ? 'contact' : 'slow trickle out'
          });
        }
        window.__makeFilmstrip(
          'ITEM: BUNT',
          '42 mph exit velocity · 2° launch angle. Ball trickles forward slowly, barely leaving the plate area.',
          frames
        );
      })()
    `);
    snap = await sendSession('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scratch/filmstrip-8-bunt.png', Buffer.from(snap.data, 'base64'));
    console.log('Saved scratch/filmstrip-8-bunt.png');

    console.log('All filmstrips captured successfully!');
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
