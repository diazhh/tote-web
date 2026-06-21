import { describe, test, expect } from '@jest/globals';
import sharp from 'sharp';
import { fileExists, fontFace, resolveBackground, logoLayer } from '../assets.js';
import { getGameConfig } from '../game-config.js';
import { CANVAS } from '../layout.js';

describe('assets', () => {
  test('fileExists distinguishes present/absent', async () => {
    expect(await fileExists(new URL(import.meta.url).pathname)).toBe(true);
    expect(await fileExists('/no/such/file.xyz')).toBe(false);
  });

  test('fontFace embeds family and file url', () => {
    const css = fontFace('Display', 'panda.otf');
    expect(css).toContain("font-family: 'Display'");
    expect(css).toContain('panda.otf');
  });

  test('resolveBackground returns a canvas-sized PNG even without AI asset', async () => {
    const cfg = getGameConfig('lotoanimalito'); // marketing/background.png not expected yet
    const buf = await resolveBackground(cfg, CANVAS.portrait);
    const meta = await sharp(buf).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1350);
    expect(meta.format).toBe('png');
  });

  test('logoLayer returns a centered raster layer when the logo exists', async () => {
    const cfg = getGameConfig('lotoanimalito'); // storage/LOGO LOTTOANIMALITO.png exists
    const layer = await logoLayer(cfg, CANVAS.portrait);
    expect(layer).not.toBeNull();
    expect(layer.left).toBeGreaterThanOrEqual(0);
    expect(typeof layer.top).toBe('number');
  });
});
