import { describe, expect, it } from 'vitest';
import { createVaultSpecParts, exportVaultSpecPackJson, padToPngDataUrl } from '../starterArt.ts';
import { artSlots } from '../look.ts';
import { padFor, paint } from '../pixels.ts';

describe('Vault Spec starter pixel art', () => {
  it('encodes a pad into a valid PNG data URL', () => {
    const p = padFor('head');
    paint(p, 5, 5, 1);
    paint(p, 6, 6, 2);
    paint(p, 7, 7, 3);
    const url = padToPngDataUrl(p);
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
    // Base64 decoding test
    const b64 = url.slice('data:image/png;base64,'.length);
    const bin = atob(b64);
    // PNG magic bytes
    expect(bin.charCodeAt(0)).toBe(0x89);
    expect(bin.charCodeAt(1)).toBe(0x50); // 'P'
    expect(bin.charCodeAt(2)).toBe(0x4e); // 'N'
    expect(bin.charCodeAt(3)).toBe(0x47); // 'G'
  });

  it('provides 12 handcrafted parts that all match real art slots', () => {
    const parts = createVaultSpecParts();
    expect(parts.length).toBe(12);
    const validSlots = new Set(artSlots().map((s) => s.id));
    for (const p of parts) {
      expect(validSlots.has(p.id), `${p.id} must be a known slot`).toBe(true);
      expect(p.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
      expect(p.pad.cells.filter(Boolean).length).toBeGreaterThan(10);
    }
  });

  it('exports a valid .bbpack JSON bundle', () => {
    const json = exportVaultSpecPackJson();
    const parsed = JSON.parse(json) as Record<string, string>;
    expect(Object.keys(parsed).length).toBe(12);
    for (const [id, url] of Object.entries(parsed)) {
      expect(id).toMatch(/^(human|augmented|machine)\/(head|crest|frame)\/\d+$/);
      expect(url.startsWith('data:image/png;base64,')).toBe(true);
    }
  });
});
