/**
 * Basedball Web Audio Engine — Zero-Byte Synthesizer & Soundscapes.
 *
 * Adheres strictly to Pillar 1 (Accessible): 100% synthesized at runtime using
 * browser native Web Audio API oscillators and noise buffers.
 * Zero external audio files, zero CDN dependencies, zero licenses needed.
 *
 * Features:
 * - 8-Bit Universe style chiptune menu music loop
 * - Classic stadium organ fanfares (Charge!, Two-Strike suspense, Strikeout sting, Home Run fanfare)
 * - Dynamic game SFX (wood bat crack pitched by exit velocity, mitt pop, whiff, crowd swells)
 * - Connects cleanly to Sfx type in overhead.ts
 */

import type { Sfx } from './overhead.ts';

let ac: AudioContext | null = null;
let masterGain: GainNode | null = null;
let musicGain: GainNode | null = null;
let sfxGain: GainNode | null = null;

let isMuted = false;
let masterVol = 0.7;
let musicVol = 0.45;
let sfxVol = 0.8;

// Music state
let isMusicPlaying = false;
let musicTimer: number | null = null;
let musicStep = 0;

/** Ensure AudioContext is instantiated and awake on first user interaction. */
export function wakeAudio(): void {
  if (typeof window === 'undefined') return;
  if (!ac) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    ac = new AudioCtx();

    masterGain = ac.createGain();
    masterGain.gain.setValueAtTime(isMuted ? 0 : masterVol, ac.currentTime);
    masterGain.connect(ac.destination);

    musicGain = ac.createGain();
    musicGain.gain.setValueAtTime(musicVol, ac.currentTime);
    musicGain.connect(masterGain);

    sfxGain = ac.createGain();
    sfxGain.gain.setValueAtTime(sfxVol, ac.currentTime);
    sfxGain.connect(masterGain);
  }

  if (ac.state === 'suspended') {
    void ac.resume();
  }
}

export function setMasterVolume(v: number): void {
  masterVol = Math.max(0, Math.min(1, v));
  if (masterGain && ac) {
    masterGain.gain.setValueAtTime(isMuted ? 0 : masterVol, ac.currentTime);
  }
}

export function setMusicVolume(v: number): void {
  musicVol = Math.max(0, Math.min(1, v));
  if (musicGain && ac) {
    musicGain.gain.setValueAtTime(musicVol, ac.currentTime);
  }
}

export function setSfxVolume(v: number): void {
  sfxVol = Math.max(0, Math.min(1, v));
  if (sfxGain && ac) {
    sfxGain.gain.setValueAtTime(sfxVol, ac.currentTime);
  }
}

export function toggleMute(): boolean {
  isMuted = !isMuted;
  if (masterGain && ac) {
    masterGain.gain.setValueAtTime(isMuted ? 0 : masterVol, ac.currentTime);
  }
  return isMuted;
}

const getSfxDest = (): AudioNode => sfxGain ?? masterGain ?? ac!.destination;
const getMusicDest = (): AudioNode => musicGain ?? masterGain ?? ac!.destination;

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
  isMusic?: boolean;
}

function tone({ freq, to, type = 'square', dur = 0.12, gain = 0.15, delay = 0, isMusic = false }: ToneOpts): void {
  if (!ac) return;
  const dest = isMusic ? getMusicDest() : getSfxDest();
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
  }
  amp.gain.setValueAtTime(gain, t0);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(amp).connect(dest);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

function noise(dur: number, gain: number, filterHz: number, type: BiquadFilterType = 'lowpass'): void {
  if (!ac) return;
  const dest = getSfxDest();
  const t0 = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, dur);
  const filter = ac.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = filterHz;
  const amp = ac.createGain();
  amp.gain.setValueAtTime(gain, t0);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(amp).connect(dest);
  src.start(t0);
}

// ------------------------------------------------------------------- SFX

/** The crack of the bat, dynamically pitched and shaped by exit velocity. */
export function sfxContact(exitVelocity: number): void {
  wakeAudio();
  if (!ac) return;
  const hard = Math.min(1, Math.max(0, (exitVelocity - 60) / 48));
  // Highpass wood transient crack
  noise(0.04 + 0.05 * hard, 0.25 + 0.22 * hard, 1600 + 3800 * hard, 'highpass');
  // Resonant bat body ping
  tone({ freq: 210 + 220 * hard, to: 80, type: 'triangle', dur: 0.1 + 0.08 * hard, gain: 0.24 + 0.18 * hard });
  // Sub pop
  tone({ freq: 95, to: 40, type: 'sine', dur: 0.07, gain: 0.18 * hard });
}

/** Swish of a bat whiffing empty air. */
export function sfxWhiff(): void {
  wakeAudio();
  noise(0.18, 0.12, 850, 'bandpass');
}

/** Ball slapping into the catcher's leather pocket. */
export function sfxMitt(): void {
  wakeAudio();
  noise(0.07, 0.18, 650);
  tone({ freq: 110, to: 55, type: 'sine', dur: 0.08, gain: 0.12 });
}

/** Umpire call: sharp rising tone for strike, low blunt tone for ball. */
export function sfxCall(strike: boolean): void {
  wakeAudio();
  if (strike) {
    tone({ freq: 660, type: 'square', dur: 0.07, gain: 0.12 });
    tone({ freq: 940, type: 'square', dur: 0.12, gain: 0.12, delay: 0.07 });
  } else {
    tone({ freq: 280, to: 240, type: 'triangle', dur: 0.15, gain: 0.12 });
  }
}

/** Safe on base sound. */
export function sfxOnBase(): void {
  wakeAudio();
  tone({ freq: 440, type: 'triangle', dur: 0.09, gain: 0.12 });
  tone({ freq: 554, type: 'triangle', dur: 0.09, gain: 0.12, delay: 0.08 });
  tone({ freq: 659, type: 'triangle', dur: 0.14, gain: 0.12, delay: 0.16 });
}

/** Out sound: retro descending buzz. */
export function sfxOut(): void {
  wakeAudio();
  tone({ freq: 360, to: 220, type: 'sawtooth', dur: 0.16, gain: 0.1 });
  tone({ freq: 220, to: 140, type: 'sawtooth', dur: 0.2, gain: 0.1, delay: 0.14 });
}

/** Crowd reaction swell with variable intensity (0..1). */
export function sfxCrowd(intensity: number): void {
  wakeAudio();
  if (!ac) return;
  const dur = 0.6 + 1.8 * intensity;
  const t0 = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, dur);
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(450, t0);
  filter.frequency.linearRampToValueAtTime(1150, t0 + dur * 0.3);
  filter.Q.value = 0.8;
  const amp = ac.createGain();
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.linearRampToValueAtTime(0.06 + 0.18 * intensity, t0 + dur * 0.22);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(amp).connect(getSfxDest());
  src.start(t0);
}

// ------------------------------------------------------------------- STADIUM ORGAN

/** Classic "Charge!" organ riff: G4, C5, E5, G5, E5, G5. */
export function organCharge(): void {
  wakeAudio();
  const notes = [
    { f: 392.00, d: 0.12, delay: 0 },
    { f: 523.25, d: 0.12, delay: 0.14 },
    { f: 659.25, d: 0.12, delay: 0.28 },
    { f: 783.99, d: 0.25, delay: 0.42 },
    { f: 659.25, d: 0.12, delay: 0.72 },
    { f: 783.99, d: 0.45, delay: 0.86 },
  ];
  for (const n of notes) {
    tone({ freq: n.f, type: 'square', dur: n.d, gain: 0.15, delay: n.delay });
    tone({ freq: n.f * 2, type: 'triangle', dur: n.d, gain: 0.08, delay: n.delay });
  }
}

/** Two-strike tension organ chord. */
export function organTwoStrikes(): void {
  wakeAudio();
  const notes = [330, 392, 494, 659]; // E minor triad + octave
  for (const f of notes) {
    tone({ freq: f, type: 'triangle', dur: 0.6, gain: 0.08 });
    tone({ freq: f * 1.5, type: 'sine', dur: 0.6, gain: 0.04 });
  }
}

/** Strikeout sting: descending arcade game over motif. */
export function organStrikeout(): void {
  wakeAudio();
  const notes = [494, 466, 440, 370, 294];
  notes.forEach((f, i) => {
    tone({ freq: f, type: 'square', dur: 0.14, gain: 0.12, delay: i * 0.11 });
  });
  sfxCrowd(0.4);
}

/** Home run celebratory fanfare. */
export function organHomeRun(): void {
  wakeAudio();
  const melody = [
    { f: 523.25, d: 0.14, delay: 0.00 }, // C5
    { f: 659.25, d: 0.14, delay: 0.12 }, // E5
    { f: 783.99, d: 0.14, delay: 0.24 }, // G5
    { f: 1046.50, d: 0.35, delay: 0.38 }, // C6
    { f: 880.00, d: 0.14, delay: 0.76 }, // A5
    { f: 1046.50, d: 0.60, delay: 0.90 }, // C6
  ];
  for (const n of melody) {
    tone({ freq: n.f, type: 'square', dur: n.d, gain: 0.18, delay: n.delay });
    tone({ freq: n.f / 2, type: 'triangle', dur: n.d, gain: 0.14, delay: n.delay });
  }
  sfxCrowd(1.0);
}

/** Implementation of Sfx bridge expected by overhead.ts */
export const overheadSfx: Sfx = (name, level = 0.5) => {
  switch (name) {
    case 'crowd':
      sfxCrowd(level);
      break;
    case 'mitt':
      sfxMitt();
      break;
    case 'whiff':
      sfxWhiff();
      break;
    case 'onBase':
      sfxOnBase();
      break;
    case 'out':
      sfxOut();
      break;
  }
};

// ------------------------------------------------------------------- CHIPTUNE MUSIC

/**
 * 8-Bit Universe Style Menu Theme:
 * Driving square/triangle chiptune progression in A minor (Am -> F -> C -> G).
 * Fast, upbeat arpeggiator and driving bassline.
 */
const BASS_PATTERN = [
  // Am (A2)
  110, 110, 220, 110, 110, 220, 110, 165,
  // F (F2)
  87.31, 87.31, 174.61, 87.31, 87.31, 174.61, 87.31, 130.81,
  // C (C3)
  130.81, 130.81, 261.63, 130.81, 130.81, 261.63, 130.81, 196.00,
  // G (G2)
  98.00, 98.00, 196.00, 98.00, 98.00, 196.00, 98.00, 146.83,
];

const LEAD_PATTERN = [
  // Bar 1 (Am)
  440, 523.25, 659.25, 880, 659.25, 523.25, 440, 523.25,
  // Bar 2 (F)
  349.23, 440, 523.25, 698.46, 523.25, 440, 349.23, 440,
  // Bar 3 (C)
  523.25, 659.25, 783.99, 1046.50, 783.99, 659.25, 523.25, 659.25,
  // Bar 4 (G)
  392.00, 493.88, 587.33, 783.99, 587.33, 493.88, 392.00, 493.88,
];

function stepMusic(): void {
  if (!isMusicPlaying) return;
  wakeAudio();

  const step16 = musicStep % 32;

  // Bass (Triangle wave, crisp rhythmic thump)
  const bFreq = BASS_PATTERN[step16] ?? 110;
  tone({
    freq: bFreq,
    type: 'triangle',
    dur: 0.11,
    gain: 0.22,
    isMusic: true,
  });

  // Lead arpeggio (Square wave with fast decay)
  const lFreq = LEAD_PATTERN[step16] ?? 440;
  tone({
    freq: lFreq,
    type: 'square',
    dur: 0.08,
    gain: 0.09,
    isMusic: true,
  });

  // Chiptune hi-hat every even step, snare on steps 4, 12, 20, 28
  if (step16 % 2 === 0) {
    const isSnare = step16 % 8 === 4;
    noise(isSnare ? 0.06 : 0.025, isSnare ? 0.08 : 0.03, isSnare ? 2200 : 7000, 'highpass');
  }

  musicStep++;
}

/** Start 8-bit universe style menu music loop (135 BPM = ~111ms per 16th note). */
export function startMenuMusic(): void {
  if (isMusicPlaying) return;
  wakeAudio();
  isMusicPlaying = true;
  musicStep = 0;
  musicTimer = typeof window !== 'undefined' ? window.setInterval(stepMusic, 112) : null;
}

/** Stop menu music cleanly. */
export function stopMenuMusic(): void {
  isMusicPlaying = false;
  if (musicTimer !== null) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}
