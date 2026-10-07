/**
 * THE SITUATION BUG — hud.ts. It draws the state it is handed, so handing it
 * the pre-play snapshot is all it takes for it not to spoil a replay.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ordinal, situationHtml } from '../hud.ts';
import { newGame, recordPlay, type GameState } from '../game.ts';
import { HOME, AWAY } from '../teams.ts';

const HR = {
  kind: 'in_play',
  hit: {
    outcome: 'home_run',
    timing: 'perfect',
    pitchType: 'fastball',
    isOut: false,
    isHit: true,
    exitVelocity: 105,
    platoon: 1,
    directionDeg: 0,
  },
} as any;
const K = { kind: 'strikeout' } as const;
const WALK = { kind: 'walk' } as const;

const fresh = (): GameState => newGame(HOME, AWAY, 9);
const lit = (html: string, cls: string): number =>
  (html.match(new RegExp(`lamps ${cls}"[^>]*>(.*?)</span>`))?.[1]?.match(/class="on"/g) ?? []).length;

describe('the situation bug', () => {
  it('names the half, the count, the outs, the hitter and the arm', () => {
    const g = fresh();
    const html = situationHtml(g, { balls: 2, strikes: 1 }, 'home');
    expect(html).toContain('▲');
    expect(html).toContain('<b>1ST</b>');
    expect(lit(html, 'ball')).toBe(2);
    expect(lit(html, 'strike')).toBe(1);
    expect(lit(html, 'out')).toBe(0);
    expect(html).toContain('2 balls, 1 strikes, 0 out');
    expect(html).toContain('bases empty');
    // The away club bats first, so the home side is on the mound.
    expect(html).toContain('YOU PITCH');
  });

  it('is not a pipe-separated debug strip', () => {
    expect(situationHtml(fresh(), { balls: 0, strikes: 0 }, 'home')).not.toContain('|');
  });

  it('shows the bags and outs of the state it is given, and only that state', () => {
    const before = recordPlay(fresh(), WALK).game;
    const afterK = recordPlay(before, K).game;
    const pre = situationHtml(before, { balls: 0, strikes: 0 }, 'away');
    const post = situationHtml(afterK, { balls: 0, strikes: 0 }, 'away');
    expect(pre).toContain('on 1st');
    expect(lit(pre, 'out')).toBe(0);
    expect(lit(post, 'out')).toBe(1);

    // A home run clears the bags — but not on the snapshot taken before it.
    const afterHr = recordPlay(before, HR).game;
    expect(situationHtml(afterHr, { balls: 0, strikes: 0 }, 'away')).toContain('bases empty');
    expect(situationHtml(before, { balls: 0, strikes: 0 }, 'away')).toContain('on 1st');
  });

  it('escapes names, which are user text', () => {
    const g = fresh();
    const evil = { ...g, away: { ...g.away, lineup: g.away.lineup.map((p) => ({ ...p, name: '<b>x' })) } };
    expect(situationHtml(evil, { balls: 0, strikes: 0 }, 'home')).toContain('&lt;b&gt;x');
  });

  it('counts its innings in words a scoreboard uses', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual([
      '1ST', '2ND', '3RD', '4TH', '11TH', '12TH', '13TH', '21ST', '22ND',
    ]);
  });
});

describe('the screen never gets ahead of the replay', () => {
  const src = readFileSync(fileURLToPath(new URL('../main.ts', import.meta.url)), 'utf8');

  it('feeds the bug the snapshot', () => {
    expect(src).toContain('elSit.innerHTML = situationHtml(g, atBat, YOU);');
  });

  it('puts the snapshot on the scoreboard in the outfield too', () => {
    const i = src.indexOf('function drawField(now: number): void {');
    const field = src.slice(i, src.indexOf('drawVenue(', i) + 400);
    expect(field).toContain('const board = onScreen();');
    expect(field).not.toMatch(/a: game\.|h: game\./);
  });

  it('says a replay caption only once the replay is over', () => {
    const i = src.indexOf('if (replay && replayNow(now) - replay.startedAt > replayLength(replay)) {');
    expect(src.slice(i, i + 300)).toContain('announce(scene');
    expect(src).toContain("if (!replay && scene) announce(scene");
  });
});
