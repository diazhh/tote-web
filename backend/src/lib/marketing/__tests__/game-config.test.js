import { describe, test, expect } from '@jest/globals';
import { getGameConfig } from '../game-config.js';

describe('game-config', () => {
  test('lotoanimalito is animal mode with padded asset paths', () => {
    const cfg = getGameConfig('lotoanimalito');
    expect(cfg.cellMode).toBe('animal');
    expect(cfg.assetFor('5').endsWith('/bases/1/05.png')).toBe(true);
    expect(cfg.assetFor('0').endsWith('/bases/1/0.png')).toBe(true);
    expect(cfg.fonts.display).toBe('panda.otf');
  });

  test('triple-pantera is number mode with no animal asset', () => {
    const cfg = getGameConfig('triple-pantera');
    expect(cfg.cellMode).toBe('number');
    expect(cfg.assetFor('472')).toBeNull();
  });

  test('unknown slug throws', () => {
    expect(() => getGameConfig('nope')).toThrow(/Unknown game slug/);
  });
});
