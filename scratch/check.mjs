import fs from 'fs';
const code = fs.readFileSync('src/game/main.ts', 'utf8');
const lines = code.split('\n');
lines.forEach((l, i) => {
  if (l.includes('youBat') || l.includes('exhibition') || l.includes('startExhibition')) {
    console.log(`${i + 1}: ${l}`);
  }
});
