import fs from 'node:fs';
const txt = fs.readFileSync('all.patch', 'utf8');
const files = txt.split(/^(?=diff --git )/m).filter((f) => f.trim());
const SPEED = ['speedPick', 'SPEEDS[speedIdx]', 'flightScale', 'pauseFor', 'data-speed',
  'HOW FAST THE DEAD TIME', 'is a watch-mode control'];
const out = { a: [], b: [] };
for (const f of files) {
  const i = f.search(/^@@ /m);
  const head = f.slice(0, i);
  const hunks = f.slice(i).split(/^(?=@@ )/m);
  const ha = hunks.filter((h) => !SPEED.some((m) => h.includes(m)));
  const hb = hunks.filter((h) => SPEED.some((m) => h.includes(m)));
  if (ha.length) out.a.push(head + ha.join(''));
  if (hb.length) out.b.push(head + hb.join(''));
}
for (const k of ['a', 'b']) {
  fs.writeFileSync(k + '.patch', out[k].join(''));
  console.log(k, out[k].join('').split(/^@@ /m).length - 1, 'hunks');
}
