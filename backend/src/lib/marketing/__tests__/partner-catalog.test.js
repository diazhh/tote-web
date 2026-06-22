import { describe, test, expect } from '@jest/globals';
import {
  loadPartners, dayOfYearUTC, pickDailyGroup, buildLinksCaption, chunkThread,
} from '../partner-catalog.js';

const sample = Array.from({ length: 16 }, (_, i) => ({
  name: `Casa${i + 1}`, slug: `casa-${i + 1}`, url: `https://casa${i + 1}.com/`, logoPath: `/abs/casa-${i + 1}.png`,
}));

describe('dayOfYearUTC', () => {
  test('Jan 1 is 1, Dec 31 (non-leap) is 365', () => {
    expect(dayOfYearUTC(new Date(Date.UTC(2026, 0, 1)))).toBe(1);
    expect(dayOfYearUTC(new Date(Date.UTC(2026, 11, 31)))).toBe(365);
  });
});

describe('pickDailyGroup', () => {
  test('deterministic: same date -> same 4', () => {
    const d = new Date(Date.UTC(2026, 5, 22));
    expect(pickDailyGroup(sample, d)).toEqual(pickDailyGroup(sample, d));
  });
  test('returns 4 and cycles through all 4 groups over consecutive days', () => {
    const seen = new Set();
    for (let i = 0; i < 4; i++) {
      const g = pickDailyGroup(sample, new Date(Date.UTC(2026, 0, 1 + i)));
      expect(g).toHaveLength(4);
      seen.add(g[0].slug);
    }
    expect(seen.size).toBe(4); // 4 distinct starting partners => full coverage
  });
});

describe('buildLinksCaption', () => {
  test('header + one bullet per partner with name and url', () => {
    const cap = buildLinksCaption(sample.slice(0, 2), { header: '🎰 Hoy' });
    expect(cap).toContain('🎰 Hoy');
    expect(cap).toContain('• Casa1 → https://casa1.com/');
    expect(cap).toContain('• Casa2 → https://casa2.com/');
  });
});

describe('chunkThread', () => {
  test('every chunk <= maxLen and all 16 partners covered', () => {
    const chunks = chunkThread(sample, { maxLen: 270 });
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(270);
    const joined = chunks.join('\n');
    for (const p of sample) expect(joined).toContain(p.name);
  });
});

describe('loadPartners', () => {
  test('reads the real catalog: 16 partners with absolute logoPath', async () => {
    const partners = await loadPartners();
    expect(partners).toHaveLength(16);
    for (const p of partners) {
      expect(typeof p.name).toBe('string');
      expect(p.url).toMatch(/^https?:\/\//);
      expect(p.logoPath.startsWith('/')).toBe(true);
      expect(p.logoPath).toContain('storage/marketing/partners/logos/');
    }
  });
});
