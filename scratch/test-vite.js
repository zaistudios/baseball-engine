import { spawn } from 'child_process';

const vite = spawn('npx.cmd', ['vite', '--port', '5173'], { stdio: 'pipe' });

vite.stdout.on('data', d => console.log('vite:', d.toString().trim()));
vite.stderr.on('data', d => console.error('vite err:', d.toString().trim()));

async function check() {
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 200));
    try {
      const res = await fetch('http://localhost:5173/game.html');
      if (res.ok) {
        console.log('Vite serves game.html! Status:', res.status);
        vite.kill();
        process.exit(0);
      }
    } catch (e) {
      // retry
    }
  }
  console.log('Failed to fetch from Vite');
  vite.kill();
  process.exit(1);
}

check();
