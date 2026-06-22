import { describe, test, expect } from '@jest/globals';
import { cardSvg, hourSvg, animalTextSvg, numberTextSvg, animalRasterLayer } from '../cells.js';
import { getGameConfig } from '../game-config.js';

const rect = { index: 0, x: 40, y: 250, w: 317, h: 242 };

describe('cells', () => {
  test('cardSvg draws a bordered rounded rect with palette colors', () => {
    const cfg = getGameConfig('lotoanimalito');
    const svg = cardSvg(rect, cfg);
    expect(svg).toContain('<rect');
    expect(svg).toContain(cfg.palette.border);
    expect(svg).toContain('rx="22"');
  });

  test('animalTextSvg includes number and uppercased name', () => {
    const cfg = getGameConfig('lotoanimalito');
    const svg = animalTextSvg(rect, { number: '16', name: 'PANDA' }, cfg, 'Display');
    expect(svg).toContain('>16<');
    expect(svg).toContain('>PANDA<');
  });

  test('numberTextSvg includes the 3-digit number', () => {
    const cfg = getGameConfig('triple-pantera');
    const svg = numberTextSvg(rect, { number: '472' }, cfg, 'Display');
    expect(svg).toContain('>472<');
  });

  test('animalRasterLayer returns null for a missing asset', async () => {
    expect(await animalRasterLayer(rect, '/no/such/animal.png')).toBeNull();
    expect(await animalRasterLayer(rect, null)).toBeNull();
  });

  test('animalRasterLayer returns a positioned layer for a real asset', async () => {
    const cfg = getGameConfig('lotoanimalito');
    const layer = await animalRasterLayer(rect, cfg.assetFor('16'));
    expect(layer).not.toBeNull();
    expect(layer.left).toBeGreaterThanOrEqual(rect.x);
    expect(layer.top).toBeGreaterThanOrEqual(rect.y);
  });
});
