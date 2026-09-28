import { describe, it, expect, beforeEach } from 'vitest';
import {
  setMasterVolume,
  setMusicVolume,
  setSfxVolume,
  toggleMute,
  sfxContact,
  sfxWhiff,
  sfxMitt,
  sfxCall,
  sfxOnBase,
  sfxOut,
  sfxCrowd,
  organCharge,
  organTwoStrikes,
  organStrikeout,
  organHomeRun,
  overheadSfx,
  startMenuMusic,
  stopMenuMusic,
} from '../audio.ts';

describe('Audio Engine', () => {
  beforeEach(() => {
    // Reset / ensure safe mocks if running in Node environment without native AudioContext
    stopMenuMusic();
  });

  it('handles volume and mute toggling gracefully', () => {
    expect(() => setMasterVolume(0.5)).not.toThrow();
    expect(() => setMusicVolume(0.3)).not.toThrow();
    expect(() => setSfxVolume(0.7)).not.toThrow();
    const muted = toggleMute();
    expect(typeof muted).toBe('boolean');
    const unmuted = toggleMute();
    expect(unmuted).toBe(!muted);
  });

  it('runs sound effects without error in headless environments', () => {
    expect(() => sfxContact(102)).not.toThrow();
    expect(() => sfxContact(60)).not.toThrow();
    expect(() => sfxWhiff()).not.toThrow();
    expect(() => sfxMitt()).not.toThrow();
    expect(() => sfxCall(true)).not.toThrow();
    expect(() => sfxCall(false)).not.toThrow();
    expect(() => sfxOnBase()).not.toThrow();
    expect(() => sfxOut()).not.toThrow();
    expect(() => sfxCrowd(0.8)).not.toThrow();
  });

  it('runs organ fanfares safely', () => {
    expect(() => organCharge()).not.toThrow();
    expect(() => organTwoStrikes()).not.toThrow();
    expect(() => organStrikeout()).not.toThrow();
    expect(() => organHomeRun()).not.toThrow();
  });

  it('connects overheadSfx bridge for all named cues', () => {
    expect(() => overheadSfx('crowd', 0.5)).not.toThrow();
    expect(() => overheadSfx('mitt')).not.toThrow();
    expect(() => overheadSfx('whiff')).not.toThrow();
    expect(() => overheadSfx('onBase')).not.toThrow();
    expect(() => overheadSfx('out')).not.toThrow();
  });

  it('starts and stops menu music safely', () => {
    expect(() => startMenuMusic()).not.toThrow();
    expect(() => stopMenuMusic()).not.toThrow();
  });
});
