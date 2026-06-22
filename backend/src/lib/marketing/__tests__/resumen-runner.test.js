// backend/src/lib/marketing/__tests__/resumen-runner.test.js
import { describe, test, expect, jest, beforeAll, afterAll } from '@jest/globals';
import fs from 'fs/promises';
import sharp from 'sharp';

const mockPrisma = {
  game: { findFirst: jest.fn() },
  draw: { findMany: jest.fn() },
};
jest.unstable_mockModule('../../prisma.js', () => ({ prisma: mockPrisma }));
jest.unstable_mockModule('../../logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
// Don't shell out to ffmpeg in unit tests — the story-video is covered separately.
jest.unstable_mockModule('../video-renderer.js', () => ({
  buildStoryVideo: jest.fn().mockResolvedValue('mock.mp4'),
}));

let generateResumenImage;
let result;

beforeAll(async () => {
  ({ generateResumenImage } = await import('../resumen-runner.js'));
});

afterAll(async () => {
  for (const p of [result?.feedPath, result?.storyPath]) {
    if (p) { try { await fs.unlink(p); } catch { /* ignore */ } }
  }
});

describe('generateResumenImage', () => {
  test('renders feed 1080x1350 and story 1080x1920, preserves filename and query', async () => {
    mockPrisma.game.findFirst.mockResolvedValue({ id: 'game-1', slug: 'lotoanimalito' });
    mockPrisma.draw.findMany.mockResolvedValue([
      { drawTime: '08:00', winnerItem: { number: '16', name: 'panda' } },
      { drawTime: '12:00', winnerItem: { number: '05', name: 'leon' } },
    ]);

    result = await generateResumenImage({
      slug: 'lotoanimalito',
      title: 'RESULTADOS DEL DÍA',
      date: new Date(Date.UTC(2026, 5, 21)),
    });

    expect(result.gameId).toBe('game-1');
    // back-compat: filename/path still point at the feed image
    expect(result.filename).toBe('resumen_lotoanimalito_20260621.png');
    expect(result.storyFilename).toBe('resumen_lotoanimalito_20260621_story.png');

    const feed = await sharp(await fs.readFile(result.feedPath)).metadata();
    expect(feed.width).toBe(1080);
    expect(feed.height).toBe(1350);
    const story = await sharp(await fs.readFile(result.storyPath)).metadata();
    expect(story.width).toBe(1080);
    expect(story.height).toBe(1920);

    // Query preserved verbatim
    const args = mockPrisma.draw.findMany.mock.calls[0][0];
    expect(args.where.status).toBe('DRAWN');
    expect(args.where.winnerItemId).toEqual({ not: null });
  }, 60000); // launches Puppeteer + renders feed and story
});
