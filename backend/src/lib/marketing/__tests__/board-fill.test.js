import { describe, test, expect } from '@jest/globals';
import { buildDailyFill, buildPizarraFill } from '../board-fill.js';

describe('board-fill variants', () => {
  test('daily feed vs story pick different templates but identical selectors', () => {
    const feed = buildDailyFill('lotoanimalito', { dateText: '21/06/26', slots: {} });
    const story = buildDailyFill('lotoanimalito', { dateText: '21/06/26', slots: {}, variant: 'story' });
    expect(feed.templatePath).toMatch(/lotoanimalito\.html$/);
    expect(story.templatePath).toMatch(/lotoanimalito-story\.html$/);
    // same injectable selector regardless of variant
    expect(feed.fill.texts[0]).toEqual(['.board__date', '21/06/26']);
    expect(story.fill.texts[0]).toEqual(['.board__date', '21/06/26']);
  });

  test('animal daily injects cell art by data-slot; number daily injects text', () => {
    const animal = buildDailyFill('lotoanimalito', { dateText: 'x', slots: { 8: { number: '5' } } });
    expect(animal.fill.attrs.some(([sel, attr]) => sel === '[data-slot="1"] .cell__art' && attr === 'src')).toBe(true);
    const number = buildDailyFill('triple-pantera', { dateText: 'x', slots: { 8: { number: 328 } } });
    expect(number.fill.texts).toContainEqual(['[data-slot="1"] .cell__number', '328']);
  });

  test('pizarra feed vs story pick different templates', () => {
    const feed = buildPizarraFill('triple-pantera', { weekText: 'x', matrix: [] });
    const story = buildPizarraFill('triple-pantera', { weekText: 'x', matrix: [], variant: 'story' });
    expect(feed.templatePath).toMatch(/pizarra-triple\.html$/);
    expect(story.templatePath).toMatch(/pizarra-triple-story\.html$/);
  });
});
