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

let generateResumenImage;
let writtenPath;

beforeAll(async () => {
  ({ generateResumenImage } = await import('../resumen-runner.js'));
});

afterAll(async () => {
  if (writtenPath) { try { await fs.unlink(writtenPath); } catch {} }
});

describe('generateResumenImage', () => {
  test('builds slots from draws and writes a 1080x1350 PNG with the preserved filename', async () => {
    mockPrisma.game.findFirst.mockResolvedValue({ id: 'game-1', slug: 'lotoanimalito' });
    mockPrisma.draw.findMany.mockResolvedValue([
      { drawTime: '08:00', winnerItem: { number: '16', name: 'panda' } },
      { drawTime: '12:00', winnerItem: { number: '05', name: 'leon' } },
    ]);

    const result = await generateResumenImage({
      slug: 'lotoanimalito',
      title: 'RESULTADOS DEL DÍA',
      date: new Date(Date.UTC(2026, 5, 21)),
    });

    expect(result.gameId).toBe('game-1');
    expect(result.filename).toBe('resumen_lotoanimalito_20260621.png');
    writtenPath = result.path;
    const meta = await sharp(await fs.readFile(result.path)).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1350);

    // Query preserved verbatim
    const args = mockPrisma.draw.findMany.mock.calls[0][0];
    expect(args.where.status).toBe('DRAWN');
    expect(args.where.winnerItemId).toEqual({ not: null });
  });
});
