// Throwaway verification for ZAIS-6. Not committed.
// Drives a VISIBLE browser: a hidden tab freezes rAF and a frozen game and a
// paused game look identical in a screenshot.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const shots = 'shots';
mkdirSync(shots, { recursive: true });

const fails = [];
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!cond) fails.push(name);
};

const server = await createServer({
  server: { port: 5199, host: '127.0.0.1' },
  logLevel: 'error',
});
await server.listen();
const url = `http://127.0.0.1:${server.config.server.port}/game.html`;
console.log('serving ' + url);

const browser = await chromium.launch({ headless: false });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
await ctx.addInitScript('window.__name = (fn) => fn; globalThis.__name = (fn) => fn;');
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('[pageerror] ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.error('[browser] ' + m.text());
});

const preUp = () => page.evaluate(() => {
  const el = document.getElementById('pre');
  return !!el && el.style.display !== 'none' && el.innerHTML.length > 0;
});
const preH2 = () => page.evaluate(() => document.querySelector('#pre h2')?.textContent ?? '');
// The horizontal band the half-time card is drawn in, as one number. A frame
// with the card up and a frame without it are nowhere near each other; two
// frames of the same card differ only by whatever else is breathing on screen.
const cardBand = () => page.evaluate(() => {
  const c = document.querySelector('canvas');
  const g = c.getContext('2d');
  const y = Math.round(c.height / 2 - 52);
  const d = g.getImageData(0, y, c.width, 104).data;
  // The card's two gold rules and its gold heading. Nothing else in the band
  // is that colour, so this counts "is the card there" rather than brightness.
  let gold = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] > 120 && d[i + 1] > 90 && d[i + 2] < 90) gold++;
  }
  return gold;
});

const canvasHash = () => page.evaluate(() => {
  const c = document.querySelector('canvas');
  if (!c) return 'no-canvas';
  const d = c.toDataURL();
  let h = 0;
  for (let i = 0; i < d.length; i++) h = (h * 31 + d.charCodeAt(i)) | 0;
  return String(h) + ':' + d.length;
});

try {
  // ---- seed a record book, a streak, and a sentinel in the league slot
  await page.goto(url);
  await page.evaluate(() => {
    localStorage.setItem(
      'asb-career',
      JSON.stringify({
        years: [
          { club: 'MAI', w: 9, l: 5, finish: 1, champion: 'MAI', games: 14, seed: 101 },
          { club: 'MAI', w: 8, l: 6, finish: 3, champion: 'TEX', games: 14, seed: 202 },
        ],
      }),
    );
    localStorage.setItem('asb-streak', JSON.stringify({ current: 2, best: 7 }));
    localStorage.setItem('asb-league', 'SENTINEL-DO-NOT-TOUCH');
  });
  await page.reload();
  await page.waitForSelector('button[data-go="exhibition"]', { timeout: 10000 });

  // ================= door 1: the title card =================
  ok('title menu offers a SETTINGS card', await page.$('button[data-go="settings"]') !== null);
  await page.click('button[data-go="settings"]');
  await page.waitForTimeout(250);
  ok('SETTINGS screen opens from the title', (await preH2()) === 'SETTINGS');
  const keys = await page.$$eval('#pre [data-key]', (bs) => bs.map((b) => b.dataset.key));
  ok('four rows, one per hotkey', JSON.stringify(keys) === '["g","p","t","f"]', keys.join(','));
  await page.screenshot({ path: `${shots}/settings-from-title.png` });

  const readRow = (k) =>
    page.$eval(`#pre [data-key="${k}"] b`, (b) => b.textContent.trim());
  const before = await readRow('g');
  await page.click('#pre [data-key="g"]');
  await page.waitForTimeout(120);
  const after = await readRow('g');
  ok('the difficulty row turns the difficulty', before !== after, `${before} -> ${after}`);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('asb-timing') ?? '{}').level);
  ok('and it is persisted', typeof stored === 'string', String(stored));

  const speedBefore = await readRow('f');
  await page.click('#pre [data-key="f"]');
  await page.waitForTimeout(120);
  ok('the game-speed row turns the game speed', (await readRow('f')) !== speedBefore,
    `${speedBefore} -> ${await readRow('f')}`);
  await page.click('#pre [data-key="f"]'); // put it back somewhere sane
  await page.click('#pre [data-key="f"]');
  await page.click('#pre [data-key="f"]');

  await page.keyboard.press('Space');
  await page.waitForTimeout(250);
  ok('BACK returns to the title menu', await page.$('button[data-go="exhibition"]') !== null);
  const preState = await page.evaluate(() => {
    const el = document.getElementById('pre');
    return { display: el?.style.display, len: el?.innerHTML.length, head: el?.innerHTML.slice(0, 120) };
  });
  ok('and SPACE on that screen started nothing', !(await preUp()), JSON.stringify(preState));

  // ================= the reset =================
  await page.click('button[data-go="book"]');
  await page.waitForTimeout(250);
  ok('the record book opens', (await preH2()) === 'THE RECORD BOOK');
  ok('and carries an EMPTY button', await page.$('#pre [data-reset]') !== null);
  await page.screenshot({ path: `${shots}/book-before-reset.png` });

  page.once('dialog', (d) => {
    console.log('confirm said: ' + d.message().replace(/\n+/g, ' / '));
    d.accept();
  });
  await page.click('#pre [data-reset]');
  await page.waitForTimeout(400);
  const bookText = await page.$eval('#pre', (e) => e.textContent);
  ok('the book empties in place', bookText.includes('Nothing in the book yet'));
  ok('and the longest streak goes with it', /longest barrel streak\s*0/.test(bookText.replace(/\s+/g, ' ')),
    bookText.replace(/\s+/g, ' ').match(/longest barrel streak\s*\S+/)?.[0] ?? '?');
  const keep = await page.evaluate(() => ({
    league: localStorage.getItem('asb-league'),
    career: localStorage.getItem('asb-career'),
    streak: localStorage.getItem('asb-streak'),
  }));
  ok('asb-league is untouched', keep.league === 'SENTINEL-DO-NOT-TOUCH', String(keep.league));
  ok('asb-career is emptied on disk', keep.career === '{"years":[]}', String(keep.career));
  ok('asb-streak is emptied on disk', keep.streak === '{"best":0}', String(keep.streak));
  await page.screenshot({ path: `${shots}/book-after-reset.png` });

  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  ok('the RECORD BOOK card is gone once the book is empty',
    (await page.$('button[data-go="book"]')) === null);

  // ================= into a ball game =================
  await page.click('button[data-go="exhibition"]');
  await page.waitForTimeout(250);
  await page.click('button[data-i="0"]');
  await page.waitForTimeout(250);
  await page.click('button[data-i="1"]');
  await page.waitForSelector('canvas', { timeout: 10000 });
  await page.waitForTimeout(800);

  // Played by hand. `idle` is where the game WAITS for the man batting, so it
  // is the one phase a person actually sits in — and the only one ESC takes.
  // When you are on the mound the game sits at `calling` instead, so this
  // throws pitches until the half flips and you are in the box.
  let tries = 0;
  while (!(await preUp()) && tries < 120) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(90);
    if (await preUp()) break;
    // Still pitching: throw one. SPACE starts the arm, SPACE lets go of it.
    await page.keyboard.press('Space');
    await page.waitForTimeout(220);
    await page.keyboard.press('Space');
    await page.waitForTimeout(1400);
    tries++;
  }
  ok('ESC puts up the pause screen', await preUp(), `after ${tries} pitches thrown by hand`);
  ok('and it is the pause screen', (await preH2()) === 'PAUSED');
  await page.screenshot({ path: `${shots}/paused-with-auto-on.png` });

  const frozen1 = await canvasHash();
  await page.waitForTimeout(1500);
  ok('the clock is stopped', frozen1 === (await canvasHash()));

  // ⚠️ THE CHECK THIS WHOLE JOB GUARDS AGAINST. T is live on the pause screen,
  // so this hands the game to the computer WHILE it is paused: if the flag did
  // not gate step(), autoStep() would start playing behind the screen.
  await page.keyboard.press('t');
  await page.waitForTimeout(2500);
  const frozen2 = await canvasHash();
  ok('AUTO turned on behind the pause screen plays nothing', frozen1 === frozen2,
    `${frozen1} vs ${frozen2}`);

  // SETTINGS from the pause screen, and BACK to the pause screen.
  await page.click('#pre [data-go="settings"]');
  await page.waitForTimeout(250);
  ok('SETTINGS opens from the pause screen too', (await preH2()) === 'SETTINGS');
  await page.screenshot({ path: `${shots}/settings-from-pause.png` });
  const frozen3 = await canvasHash();
  ok('and the game is still stopped under it', frozen3 === frozen2);
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  ok('BACK from there lands on the pause screen, not in the game',
    (await preH2()) === 'PAUSED');

  // RESUME.
  await page.click('#pre [data-go="resume"]');
  await page.waitForTimeout(250);
  ok('RESUME takes the screen down', !(await preUp()));
  const after1 = await canvasHash();
  await page.waitForTimeout(700);
  ok('and the game carries on', after1 !== (await canvasHash()));

  // ================= ESC mid-flight does nothing =================
  // Pause first, so the phase on the other side of RESUME is KNOWN to be idle
  // — and known to be your half, because idle is the only phase ESC takes.
  await page.keyboard.press('t'); // AUTO OFF — take the game back
  await page.waitForTimeout(1200);
  tries = 0;
  while (!(await preUp()) && tries < 120) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(90);
    if (await preUp()) break;
    await page.keyboard.press('Space');
    await page.waitForTimeout(220);
    await page.keyboard.press('Space');
    await page.waitForTimeout(1400);
    tries++;
  }
  ok('ESC pauses again after a pitch it refused to interrupt', await preUp());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  ok('ESC resumes as well as RESUME does', !(await preUp()));

  // Straight off the resume, at idle, with nobody else's hands on it: SPACE
  // puts a pitch in the air, and ESC on top of that must be a dead key.
  await page.keyboard.press('Space');
  await page.waitForTimeout(70);
  const mid1 = await canvasHash();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(90);
  ok('ESC mid-flight puts up nothing', !(await preUp()));
  ok('and the pitch SPACE started is still running', mid1 !== (await canvasHash()));
  await page.waitForTimeout(2500);

  // ================= the clock shift, on a break card =================
  // ⚠️ THIS IS A PROOF, NOT A GUESS. autoStep() returns early while a break
  // card is up and delivers instantly at `idle` otherwise — so with AUTO ON,
  // `idle` exists for exactly as long as a half-time card is on screen. An ESC
  // that lands while the computer is playing both halves therefore landed on a
  // break card, and nowhere else.
  await page.keyboard.press('t'); // AUTO ON
  await page.waitForTimeout(500);
  tries = 0;
  // Wait for the HALF TO ROLL OVER before reaching for ESC — the break card
  // goes up at that moment and holds `idle` for BREAK_MS, because autoStep()
  // takes the break too. The scoreboard is what says the half turned.
  // Which club is batting, off the scoreboard. It flips on the third out, which
  // is the moment the half-time card is queued.
  const batting = () =>
    page.$eval('#scoreboard tr.batting td.team', (e) => e.textContent ?? '').catch(() => '');
  let where = await batting();
  while (!(await preUp()) && tries < 900) {
    await page.waitForTimeout(60);
    tries++;
    const now = await batting();
    if (now === where || !now) continue;
    where = now;
    // The half just rolled. The card goes up once the replay clears and then
    // holds `idle` open for BREAK_MS, because autoStep() takes the break too.
    for (let i = 0; i < 70 && !(await preUp()); i++) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(60);
    }
  }
  if (await preUp()) {
    const dumpCanvas = async (name) => {
      const d = await page.evaluate(() => document.querySelector('canvas').toDataURL());
      writeFileSync(`${shots}/${name}.png`, Buffer.from(d.split(',')[1], 'base64'));
    };
    const card1 = await cardBand();
    await dumpCanvas('canvas-at-pause');
    // BREAK_MS is 2400 at 1x. Hold far longer than the card had left.
    await page.waitForTimeout(8000);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(70);
    const card2 = await cardBand();
    await dumpCanvas('canvas-after-resume');
    // It should run out shortly after the clock starts again — but the next
    // half can queue a card of its own, so watch for the low point rather than
    // one sample.
    let gone = card2;
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(200);
      gone = Math.min(gone, await cardBand());
    }
    await dumpCanvas('canvas-after-the-card-expired');
    const trail = `gold pixels — paused ${card1}, resumed ${card2}, later ${gone}`;
    ok('a half-time card was on screen when ESC landed', card1 > 200, trail);
    ok('the break card is still up after an 8-second pause', card2 > card1 * 0.8, trail);
    ok('and it runs out on its own once the clock is going again', gone < card1 * 0.3, trail);
  } else {
    ok('caught a break card to pause on', false, `no idle in ${tries} presses`);
  }

  // ================= quit =================
  await page.keyboard.press('t'); // AUTO OFF
  tries = 0;
  while (!(await preUp()) && tries < 120) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(90);
    if (await preUp()) break;
    await page.keyboard.press('Space');
    await page.waitForTimeout(220);
    await page.keyboard.press('Space');
    await page.waitForTimeout(1400);
    tries++;
  }
  ok('paused once more, to quit from', await preUp());
  await page.click('#pre [data-go="quit"]');
  await page.waitForSelector('button[data-go="exhibition"]', { timeout: 15000 });
  await page.waitForTimeout(400);
  ok('QUIT TO MENU lands on the title screen', await page.$('button[data-go="exhibition"]') !== null);
  const afterQuit = await page.evaluate(() => ({
    career: localStorage.getItem('asb-career'),
    season: localStorage.getItem('asb.season.v1'),
    league: localStorage.getItem('asb-league'),
  }));
  ok('and nothing was recorded on the way out', afterQuit.career === '{"years":[]}',
    String(afterQuit.career));
  ok('the saved season is untouched by a quit', afterQuit.season === null, String(afterQuit.season));
  ok('the league is untouched by a quit', afterQuit.league === 'SENTINEL-DO-NOT-TOUCH');
  await page.screenshot({ path: `${shots}/title-after-quit.png` });
} catch (e) {
  console.error('THREW: ' + (e && e.stack ? e.stack : e));
  fails.push('threw');
} finally {
  await page.screenshot({ path: `${shots}/last.png` }).catch(() => {});
  await browser.close();
  await server.close();
}

console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nall green');
process.exit(fails.length ? 1 : 0);
