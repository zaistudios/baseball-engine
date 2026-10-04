/**
 * TITLE SCREEN ACCESSIBILITY TEST SUITE
 *
 * Verifies accessibility (WCAG 2.1 AA/AAA principles) for Basedball's title screen:
 * - Semantic ARIA roles, landmarks, and live regions
 * - Screen-reader announcements for dynamic prompts and dial changes
 * - Clear visual hierarchy and mode categorization
 * - Visible, high-contrast keyboard focus indicators
 * - Full keyboard navigation (D-pad, Tab navigation, hotkeys, and Esc/Backspace return)
 * - Explicit Back navigation on all sub-screens to prevent dead ends
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const htmlSrc = readFileSync(fileURLToPath(new URL('../../../game.html', import.meta.url)), 'utf8');
const mainSrc = readFileSync(fileURLToPath(new URL('../main.ts', import.meta.url)), 'utf8');

describe('Title Screen Accessibility - Markup & Styles (game.html)', () => {
  it('defines semantic landmark role and aria-label on #start', () => {
    expect(htmlSrc).toMatch(/<div\s+id="start"[^>]*role="region"[^>]*aria-label="Title Screen"/);
  });

  it('marks prompt as an aria-live region so screen readers announce heading changes', () => {
    expect(htmlSrc).toMatch(/<h2\s+id="start-prompt"[^>]*aria-live="polite"/);
  });

  it('labels the keys container with role="group" and aria-labelledby="start-prompt"', () => {
    expect(htmlSrc).toMatch(/<div\s+class="keys"[^>]*role="group"[^>]*aria-labelledby="start-prompt"/);
  });

  it('hides decorative ball seam from screen readers with aria-hidden="true"', () => {
    expect(htmlSrc).toMatch(/<div\s+class="seam"[^>]*aria-hidden="true"/);
  });

  it('provides accessible footer with dynamic hint container #start-hints', () => {
    expect(htmlSrc).toContain('id="start-hints"');
    expect(htmlSrc).toMatch(/<div\s+class="copy"[^>]*aria-label="Controls and Shortcuts"/);
  });

  it('defines visible, high-contrast focus rings for buttons on #start', () => {
    expect(htmlSrc).toMatch(/#start\s+button:focus\s*\{[^}]*outline:\s*2px\s+solid\s+var\(--hot\)/);
  });

  it('ensures minimum touch target height of at least 48px for buttons', () => {
    expect(htmlSrc).toMatch(/#start\s+button\s*\{[^}]*min-height:\s*48px/);
  });

  it('boosts --dim text contrast on #start to meet WCAG AA standards', () => {
    expect(htmlSrc).toMatch(/#start\s*\{[^}]*--dim:\s*#8b95a8/);
  });

  it('includes styling for hotkey badges and special action cards', () => {
    expect(htmlSrc).toContain('#start .hk');
    expect(htmlSrc).toContain('#start button.card-resume');
    expect(htmlSrc).toContain('#start button.card-back');
  });
});

describe('Title Screen Accessibility - Navigation & Interaction (main.ts)', () => {
  const pregameFn = (): string => {
    const start = mainSrc.indexOf('function pregame(): void {');
    expect(start).toBeGreaterThan(-1);
    return mainSrc.slice(start, mainSrc.indexOf('\npregame();', start));
  };

  it('card helper supports hotkeys and accessible aria-keyshortcuts attributes', () => {
    const code = pregameFn();
    expect(code).toContain('data-hotkey=');
    expect(code).toContain('aria-keyshortcuts=');
    expect(code).toContain('class="hk"');
  });

  it('dials provide role="group", aria-label, and aria-live on values', () => {
    const code = pregameFn();
    expect(code).toMatch(/class="dial"[^>]*role="group"[^>]*aria-label=/);
    expect(code).toContain('aria-live="polite"');
    expect(code).toContain('aria-label="Previous ');
    expect(code).toContain('aria-label="Next ');
  });

  it('mode screen categorizes choices under PLAY BALL and CLUBHOUSE & SETTINGS', () => {
    const code = pregameFn();
    expect(code).toContain('PLAY BALL');
    expect(code).toContain('CLUBHOUSE &amp; SETTINGS');
  });

  it('mode cards configure intuitive hotkeys [E], [F], [S], [C], [B], [R]', () => {
    const code = pregameFn();
    expect(code).toMatch(/card\('exhibition',\s*'EXHIBITION'[^)]*hotkey:\s*'E'/);
    expect(code).toMatch(/card\('franchise',\s*'FRANCHISE'[^)]*hotkey:\s*'F'/);
    expect(code).toMatch(/card\('settings',\s*'SETTINGS'[^)]*hotkey:\s*'S'/);
    expect(code).toMatch(/card\('league',\s*'CUSTOMIZE'[^)]*hotkey:\s*'C'/);
  });

  it('provides explicit BACK buttons on all sub-screens to prevent navigation traps', () => {
    const code = pregameFn();
    // Rules screen has Back button
    expect(code).toMatch(/data-go="back"[^>]*><b>BACK<\/b>/);
    // Club picker has Back button
    expect(code).toMatch(/card\('back',\s*'BACK'/);
    // Opponent picker has Unpick/Back button
    expect(code).toMatch(/card\('unpick',\s*'BACK'/);
  });

  it('club cards provide comprehensive aria-label describing team, rank, and park', () => {
    const code = pregameFn();
    expect(code).toContain('aria-label="${escapeText(desc)}"');
  });

  it('updates accessible footer hints on each screen state via updateHints()', () => {
    const code = pregameFn();
    expect(code).toContain('updateHints()');
    expect(code).toContain('start-hints');
  });

  it('handles Escape and Backspace to return gracefully without eating form input', () => {
    const code = pregameFn();
    expect(code).toContain("e.key === 'Escape' || e.key === 'Backspace'");
    expect(code).toContain("active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA'");
  });

  it('installs dpad with swallow: handled so native tab navigation works', () => {
    const code = pregameFn();
    expect(code).toContain("installDpad(el, { swallow: 'handled' })");
  });

  it('registers cleanup to teardown listeners when a game starts', () => {
    const code = pregameFn();
    expect(code).toContain('cleanup();');
    expect(code).toContain('teardownDpad?.();');
    expect(code).toContain("removeEventListener('keydown', onKeyDown)");
  });
});
