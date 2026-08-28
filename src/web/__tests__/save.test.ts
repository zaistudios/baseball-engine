/**
 * The save file. Every test here is about REFUSING a bad one.
 *
 * This is the only input to the game a user can hand-edit, and the failure it
 * causes is the worst kind: a malformed blob reaching resolveLineup() throws
 * on the title screen and locks them out of a game that is otherwise fine.
 * Loading must degrade to "no save", never to a crash.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { saveRun, loadRun, clearRun } from '../save.ts';
import { newRun, type RunState } from '../../core/run.ts';

/** localStorage does not exist in the test environment. This is all save.ts uses. */
function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    _raw: map,
  };
}

let store: ReturnType<typeof fakeStorage>;

beforeEach(() => {
  store = fakeStorage();
  vi.stubGlobal('localStorage', store);
});

const KEY = 'asb.run.v1';
const good = () => ({ rng: 123456, run: newRun(), signed: ['hu1', 'hu2', 'hu3'], atBatIndex: 4 });
const stored = () => JSON.parse(store._raw.get(KEY)!) as Record<string, unknown>;
const put = (o: unknown) => store._raw.set(KEY, JSON.stringify(o));

describe('a good save round-trips', () => {
  it('comes back with everything it needs to resume', () => {
    saveRun(good());
    const s = loadRun()!;
    expect(s).not.toBeNull();
    expect(s.rng).toBe(123456);
    expect(s.signed).toEqual(['hu1', 'hu2', 'hu3']);
    expect(s.atBatIndex).toBe(4);
    expect(s.run.money).toBe(newRun().money);
  });

  it('stamps a version and a time', () => {
    saveRun(good());
    expect(typeof stored()['v']).toBe('number');
    expect(typeof stored()['savedAt']).toBe('number');
  });

  it('clears', () => {
    saveRun(good());
    clearRun();
    expect(loadRun()).toBeNull();
  });

  it('reports no save when there never was one', () => {
    expect(loadRun()).toBeNull();
  });
});

describe('a bad save is refused, never thrown on', () => {
  it('refuses junk that is not even JSON', () => {
    store._raw.set(KEY, '{not json');
    expect(loadRun()).toBeNull();
  });

  it('refuses a blob from a different version', () => {
    saveRun(good());
    put({ ...stored(), v: 99 });
    expect(loadRun()).toBeNull();
  });

  it('refuses a missing or non-numeric rng state', () => {
    // makeRng(0, NaN) would produce a generator that is not the saved one, and
    // nothing downstream would notice.
    for (const rng of [undefined, null, 'abc', NaN, Infinity]) {
      saveRun(good());
      put({ ...stored(), rng });
      expect(loadRun()).toBeNull();
    }
  });

  it('refuses an empty or non-string roster', () => {
    for (const signed of [undefined, [], 'hu1', [1, 2, 3], [null]]) {
      saveRun(good());
      put({ ...stored(), signed });
      expect(loadRun()).toBeNull();
    }
  });

  it('refuses a broken atBatIndex', () => {
    for (const atBatIndex of [undefined, 'four', NaN]) {
      saveRun(good());
      put({ ...stored(), atBatIndex });
      expect(loadRun()).toBeNull();
    }
  });

  it('refuses a missing run', () => {
    saveRun(good());
    put({ ...stored(), run: undefined });
    expect(loadRun()).toBeNull();
  });

  it('refuses a run that is already over', () => {
    // Otherwise the menu offers Continue straight into a game-over screen.
    const over: RunState = { ...newRun(), over: true, fired: true };
    saveRun({ ...good(), run: over });
    expect(loadRun()).toBeNull();
  });
});

describe('storage being unavailable is not a crash', () => {
  it('swallows a throwing setItem', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('nope');
      },
    });
    // Private browsing throws on write. The run still plays; it just cannot be
    // resumed, and silently is the right way to fail at that.
    expect(() => saveRun(good())).not.toThrow();
    expect(() => clearRun()).not.toThrow();
    expect(loadRun()).toBeNull();
  });
});
