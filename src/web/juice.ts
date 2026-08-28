/**
 * Juice: sound, shake, hitstop, particles.
 *
 * The vault's Balatro note is the brief. "Layered animation, particle effects
 * and sound make arithmetic feel like fireworks. The math is simple; the
 * sensation of the math is a jackpot." Its conclusion — pour DISPROPORTIONATE
 * polish into the feedback — is the whole reason this file exists.
 *
 * Everything here is synthesised at runtime. No audio files, no sprite sheets,
 * no dependency, nothing for a human to draw first. That matters on this
 * project: assets are Zane's job, and game feel should not be blocked behind
 * them.
 *
 * ponytail: one WebAudio context, oscillators and noise buffers on demand. If
 * this ever needs real recorded samples, the call sites do not change.
 */

// ------------------------------------------------------------------- audio

import { settings } from './settings.ts';

let ac: AudioContext | null = null;
/** Everything routes through here, so one setting controls the whole mix. */
let master: GainNode | null = null;

/** Browsers refuse audio before a gesture, so this runs on the first click. */
export function wakeAudio(): void {
  if (!ac) {
    ac = new AudioContext();
    master = ac.createGain();
    master.connect(ac.destination);
  }
  if (ac.state === 'suspended') void ac.resume();
  applyVolume();
}

export function applyVolume(): void {
  if (master && ac) master.gain.setValueAtTime(settings.volume, ac.currentTime);
}

/** Where sounds connect. Never the raw destination, or volume is bypassed. */
const out = (): AudioNode => master ?? ac!.destination;

function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

interface ToneOpts {
  freq: number;
  to?: number;
  type?: OscillatorType;
  dur?: number;
  gain?: number;
  delay?: number;
}

function tone({ freq, to, type = 'square', dur = 0.12, gain = 0.15, delay = 0 }: ToneOpts): void {
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
  amp.gain.setValueAtTime(gain, t0);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(amp).connect(out());
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur: number, gain: number, filterHz: number, type: BiquadFilterType = 'lowpass'): void {
  if (!ac) return;
  const t0 = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, dur);
  const filter = ac.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = filterHz;
  const amp = ac.createGain();
  amp.gain.setValueAtTime(gain, t0);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(amp).connect(out());
  src.start(t0);
}

/**
 * The crack of the bat, pitched by how hard it was hit.
 *
 * This is the single most important sound in a batting game, so it is two
 * layers: a wood transient and a short noise burst. A 110mph homer and a 65mph
 * popup should not sound the same, and here they cannot.
 */
export function sfxContact(exitVelocity: number): void {
  const hard = Math.min(1, Math.max(0, (exitVelocity - 60) / 50));
  noise(0.05 + 0.04 * hard, 0.22 + 0.2 * hard, 1400 + 3600 * hard, 'highpass');
  tone({ freq: 190 + 190 * hard, to: 70, type: 'triangle', dur: 0.1 + 0.09 * hard, gain: 0.2 + 0.16 * hard });
}

/** Bat through empty air. */
export function sfxWhiff(): void {
  noise(0.16, 0.1, 900, 'bandpass');
}

/** Ball into the catcher's mitt on a take. */
export function sfxMitt(): void {
  noise(0.07, 0.16, 700);
  tone({ freq: 120, to: 60, type: 'sine', dur: 0.07, gain: 0.1 });
}

/** The umpire. Strike is up and sharp, ball is flat and low. */
export function sfxCall(strike: boolean): void {
  if (strike) {
    tone({ freq: 620, type: 'square', dur: 0.07, gain: 0.1 });
    tone({ freq: 880, type: 'square', dur: 0.11, gain: 0.1, delay: 0.08 });
  } else {
    tone({ freq: 300, type: 'square', dur: 0.13, gain: 0.08 });
  }
}

/** Reaching base — a walk or a plunking. */
export function sfxOnBase(): void {
  tone({ freq: 440, type: 'square', dur: 0.09, gain: 0.09 });
  tone({ freq: 587, type: 'square', dur: 0.13, gain: 0.09, delay: 0.09 });
}

/** Crowd. Length and volume scale with how big the moment is. */
export function sfxCrowd(intensity: number): void {
  if (!ac) return;
  const dur = 0.5 + 1.5 * intensity;
  const t0 = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, dur);
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(500, t0);
  filter.frequency.linearRampToValueAtTime(1100, t0 + dur * 0.3);
  filter.Q.value = 0.7;
  const amp = ac.createGain();
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.linearRampToValueAtTime(0.05 + 0.16 * intensity, t0 + dur * 0.25);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(amp).connect(out());
  src.start(t0);
}

/** Home run. The one moment allowed to be loud. */
export function sfxHomer(): void {
  const notes = [523, 659, 784, 1047];
  notes.forEach((f, i) =>
    tone({ freq: f, type: 'square', dur: 0.16, gain: 0.13, delay: i * 0.085 }),
  );
  sfxCrowd(1);
}

export function sfxOut(): void {
  tone({ freq: 200, to: 110, type: 'sawtooth', dur: 0.22, gain: 0.09 });
}

export function sfxBuy(): void {
  tone({ freq: 700, type: 'square', dur: 0.06, gain: 0.1 });
  tone({ freq: 1050, type: 'square', dur: 0.1, gain: 0.1, delay: 0.06 });
}

// ------------------------------------------------------------ shake + stop

import { gameNow } from './clock.ts';

let shakeUntil = 0;
let shakeMag = 0;
let stopUntil = 0;

/** Camera kick. Decays over its lifetime. */
export function shake(magnitude: number, ms = 260): void {
  if (!settings.shake) return;
  shakeUntil = gameNow() + ms;
  shakeMag = Math.max(shakeMag, magnitude);
}

/**
 * Hitstop: freeze everything for a few frames on impact.
 *
 * The cheapest trick in game feel and the most effective — the pause is what
 * makes a hit read as a HIT rather than as the ball changing direction.
 */
export function hitstop(ms: number): void {
  if (!settings.hitstop) return;
  stopUntil = gameNow() + ms;
}

export const isStopped = (now: number): boolean => now < stopUntil;

/** Wrap a frame in the current shake offset. Always pair with shakeEnd(). */
export function shakeBegin(ctx: CanvasRenderingContext2D, now: number): void {
  ctx.save();
  if (now >= shakeUntil) {
    shakeMag = 0;
    return;
  }
  const left = (shakeUntil - now) / 260;
  const m = shakeMag * left;
  ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
}

export const shakeEnd = (ctx: CanvasRenderingContext2D): void => ctx.restore();

// ------------------------------------------------------------------ sparks

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
}
const sparks: Spark[] = [];

export function burst(x: number, y: number, count: number, color: string, speed = 190): void {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.35 + Math.random() * 0.65);
    const life = 0.3 + Math.random() * 0.45;
    sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life, max: life, color });
  }
}

export function drawSparks(ctx: CanvasRenderingContext2D, dt: number): void {
  for (let i = sparks.length - 1; i >= 0; i--) {
    const p = sparks[i]!;
    p.life -= dt;
    if (p.life <= 0) {
      sparks.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 520 * dt;
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    const s = 1 + 3 * (p.life / p.max);
    ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
}
