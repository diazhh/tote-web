import { describe, test, expect } from '@jest/globals';
import { getCaidas, hasCaidas, CAIDAS } from '../caidas.js';

const NUMS = (arr) => arr.map((c) => c.number);

describe('caidas data module', () => {
  test('hasCaidas only for animalito games', () => {
    expect(hasCaidas('lotoanimalito')).toBe(true);
    expect(hasCaidas('lottopantera')).toBe(true);
    expect(hasCaidas('triple-pantera')).toBe(false);
    expect(hasCaidas('terminal-pantera')).toBe(false);
  });

  test('reciprocity is 100% in both tables', () => {
    for (const slug of ['lotoanimalito', 'lottopantera']) {
      const map = CAIDAS[slug];
      for (const [a, list] of map) {
        for (const c of list) {
          const back = map.get(c.number) || [];
          expect(NUMS(back)).toContain(a);
        }
      }
    }
  });

  test('mirror numbers are present when both exist', () => {
    // 03<->30, 12<->21, 13<->31 in animalito
    expect(NUMS(getCaidas('lotoanimalito', '03'))).toContain('30');
    expect(NUMS(getCaidas('lotoanimalito', '30'))).toContain('03');
    expect(NUMS(getCaidas('lotoanimalito', '12'))).toContain('21');
    expect(NUMS(getCaidas('lotoanimalito', '13'))).toContain('31');
    // 04<->40 only in pantera (40 doesn't exist in animalito)
    expect(NUMS(getCaidas('lottopantera', '04'))).toContain('40');
    expect(NUMS(getCaidas('lottopantera', '40'))).toContain('04');
  });

  test('reciprocal affinity: perro<->gato', () => {
    expect(NUMS(getCaidas('lotoanimalito', '27'))).toContain('11');
    expect(NUMS(getCaidas('lotoanimalito', '11'))).toContain('27');
  });

  test('degree within range and no orphans', () => {
    const domain = (max) => [
      '0',
      '00',
      ...Array.from({ length: max }, (_, i) => String(i + 1).padStart(2, '0')),
    ];
    const DOMAINS = { lottopantera: domain(48), lotoanimalito: domain(36) };

    for (const [slug, min] of [['lottopantera', 5], ['lotoanimalito', 4]]) {
      const map = CAIDAS[slug];
      const expectedDomain = DOMAINS[slug];

      // Every expected node must be present as a key (catches orphaned nodes
      // absent from the Map) and there must be no unexpected extra nodes.
      for (const n of expectedDomain) {
        expect(map.has(n)).toBe(true);
      }
      expect(map.size).toBe(expectedDomain.length);

      for (const [n, list] of map) {
        expect(list.length).toBeGreaterThanOrEqual(min);
        expect(list.length).toBeLessThanOrEqual(7);
      }
    }
  });

  test('animalito never references pantera-only animals (37-48)', () => {
    for (const [, list] of CAIDAS.lotoanimalito) {
      for (const c of list) {
        const n = parseInt(c.number, 10);
        expect(n).toBeLessThanOrEqual(36);
      }
    }
  });

  test('every caida carries number, name and reason', () => {
    const c = getCaidas('lottopantera', '13')[0];
    expect(c).toHaveProperty('number');
    expect(c).toHaveProperty('name');
    expect(c).toHaveProperty('reason');
  });

  test('unknown game returns empty', () => {
    expect(getCaidas('triple-pantera', '00')).toEqual([]);
    expect(getCaidas('lotoanimalito', '99')).toEqual([]);
  });
});
