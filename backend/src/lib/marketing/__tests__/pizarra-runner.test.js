import { describe, test, expect, jest, beforeAll } from '@jest/globals';

// Mock the heavy side-effect deps so importing pizarra-runner stays pure/fast.
jest.unstable_mockModule('../../prisma.js', () => ({ prisma: {} }));
jest.unstable_mockModule('../../logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.unstable_mockModule('../html-renderer.js', () => ({ renderTemplateToPng: jest.fn() }));
jest.unstable_mockModule('../video-renderer.js', () => ({ buildStoryVideo: jest.fn() }));

let isSunday, PIZARRA_CHANNELS;

beforeAll(async () => {
  ({ isSunday, PIZARRA_CHANNELS } = await import('../pizarra-runner.js'));
});

describe('pizarra-runner', () => {
  test('isSunday detects Sunday (VE date keyed UTC-midnight)', () => {
    // 2026-06-21 is a Sunday; 2026-06-22 is the following Monday.
    expect(isSunday(new Date(Date.UTC(2026, 5, 21)))).toBe(true);
    expect(isSunday(new Date(Date.UTC(2026, 5, 22)))).toBe(false);
    expect(isSunday('2026-06-21T00:00:00.000Z')).toBe(true);
  });

  test('pizarra never targets Twitter', () => {
    expect(PIZARRA_CHANNELS).toEqual(['INSTAGRAM', 'FACEBOOK', 'TELEGRAM', 'WHATSAPP']);
    expect(PIZARRA_CHANNELS).not.toContain('TWITTER');
  });
});
