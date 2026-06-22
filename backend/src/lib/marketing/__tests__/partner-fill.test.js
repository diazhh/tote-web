import { describe, test, expect } from '@jest/globals';
import {
  getFamily, buildDondeJugarStoryFill, buildDondeJugarDirectorioFill,
} from '../partner-fill.js';

const four = Array.from({ length: 4 }, (_, i) => ({
  name: `Casa${i + 1}`, slug: `casa-${i + 1}`, url: `https://casa${i + 1}.com/`, logoPath: `/abs/casa-${i + 1}.png`,
}));
const sixteen = Array.from({ length: 16 }, (_, i) => ({
  name: `Casa${i + 1}`, slug: `casa-${i + 1}`, url: `https://casa${i + 1}.com/`, logoPath: `/abs/casa-${i + 1}.png`,
}));

describe('getFamily', () => {
  test('known families resolve, unknown throws', () => {
    expect(getFamily('lotoanimalito').gameSlug).toBe('lotoanimalito');
    expect(getFamily('lottopantera').handle).toBe('@LottoPantera');
    expect(() => getFamily('nope')).toThrow();
  });
});

describe('buildDondeJugarStoryFill', () => {
  const r = buildDondeJugarStoryFill('lotoanimalito', four);
  test('uses the story template', () => {
    expect(r.templatePath).toMatch(/donde-jugar-story\.html$/);
  });
  test('injects palette CSS vars on #board', () => {
    const style = r.fill.attrs.find(([sel, attr]) => sel === '#board' && attr === 'style');
    expect(style).toBeTruthy();
    expect(style[2]).toContain('--bg1:');
    expect(style[2]).toContain('--accent:');
  });
  test('injects 4 logos by file:// and name+url texts', () => {
    const img = r.fill.attrs.find(([sel, attr]) => sel === '[data-logo="1"] .logo__img' && attr === 'src');
    expect(img[2]).toBe('file:///abs/casa-1.png');
    expect(r.fill.texts).toContainEqual(['[data-logo="1"] .logo__name', 'Casa1']);
    expect(r.fill.texts).toContainEqual(['[data-logo="1"] .logo__url', 'casa1.com']);
    expect(r.fill.texts).toContainEqual(['.board__handle', '@lotoanimalito']);
  });
});

describe('buildDondeJugarDirectorioFill', () => {
  test('uses the directorio template and injects 16 logos', () => {
    const r = buildDondeJugarDirectorioFill('lottopantera', sixteen);
    expect(r.templatePath).toMatch(/donde-jugar-directorio\.html$/);
    const img16 = r.fill.attrs.find(([sel, attr]) => sel === '[data-logo="16"] .logo__img' && attr === 'src');
    expect(img16[2]).toBe('file:///abs/casa-16.png');
  });
});

describe('darkChip', () => {
  test('partners flagged darkChip get a dark chip style; others do not', () => {
    const partners = [
      { name: 'Light', slug: 'light', url: 'https://light.com/', logoPath: '/abs/light.png', darkChip: true },
      { name: 'Normal', slug: 'normal', url: 'https://normal.com/', logoPath: '/abs/normal.png' },
    ];
    const r = buildDondeJugarStoryFill('lotoanimalito', partners);
    const chip1 = r.fill.attrs.find(([sel, attr]) => sel === '[data-logo="1"] .logo__chip' && attr === 'style');
    const chip2 = r.fill.attrs.find(([sel, attr]) => sel === '[data-logo="2"] .logo__chip' && attr === 'style');
    expect(chip1).toBeTruthy();
    expect(chip1[2]).toContain('background:');
    expect(chip2).toBeUndefined();
  });
});
