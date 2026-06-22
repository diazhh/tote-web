// backend/src/lib/marketing/__tests__/renderer.test.js
import { describe, test, expect } from '@jest/globals';
import sharp from 'sharp';
import { renderResultsBoard } from '../renderer.js';

describe('renderResultsBoard', () => {
  test('produces a 1080x1350 PNG for an animal game with partial slots', async () => {
    const slots = {
      8: { number: '16', name: 'panda' },
      12: { number: '05', name: 'leon' },
      19: { number: '00', name: 'ballena' },
    };
    const buf = await renderResultsBoard({
      slug: 'lotoanimalito',
      title: 'RESULTADOS DEL DÍA',
      dateText: '21/06/26',
      slots,
    });
    const meta = await sharp(buf).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1350);
    expect(meta.format).toBe('png');
  });

  test('produces a 1080x1350 PNG for the number game (triple)', async () => {
    const slots = { 8: { number: '472' }, 9: { number: '089' } };
    const buf = await renderResultsBoard({
      slug: 'triple-pantera',
      title: 'RESULTADOS DEL DÍA',
      dateText: '21/06/26',
      slots,
    });
    const meta = await sharp(buf).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1350);
  });
});
