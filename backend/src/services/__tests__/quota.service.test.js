/**
 * Tests for quota.service.js
 * Uses Jest ESM mock pattern (unstable_mockModule) consistent with the codebase.
 */
import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

const mockPrisma = {
  draw: { findUnique: jest.fn() },
  gameItem: { findMany: jest.fn() },
  drawItemQuota: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
  },
  ticketDetail: { groupBy: jest.fn() },
  $queryRaw: jest.fn(),
};

jest.unstable_mockModule('../../lib/prisma.js', () => ({ prisma: mockPrisma }));
jest.unstable_mockModule('../../lib/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('quota.service — getDrawQuotas', () => {
  let getDrawQuotas;

  beforeAll(async () => {
    ({ getDrawQuotas } = await import('../quota.service.js'));
  });

  beforeEach(() => jest.clearAllMocks());

  test('returns items with maxAmount null when no quota exists, and correct soldAmount', async () => {
    mockPrisma.draw.findUnique.mockResolvedValue({ id: 'draw-1', gameId: 'game-1', status: 'SCHEDULED' });
    mockPrisma.gameItem.findMany.mockResolvedValue([
      { id: 'item-30', number: '30', name: 'CARNERO' },
      { id: 'item-31', number: '31', name: 'TIGRE' },
    ]);
    mockPrisma.drawItemQuota.findMany.mockResolvedValue([]);
    mockPrisma.ticketDetail.groupBy.mockResolvedValue([
      { gameItemId: 'item-30', _sum: { amount: 5000 } },
    ]);

    const result = await getDrawQuotas('draw-1');

    expect(result).toEqual([
      {
        gameItemId: 'item-30',
        number: '30',
        name: 'CARNERO',
        maxAmount: null,
        soldAmount: 5000,
        availableAmount: null,
        exceeded: false,
      },
      {
        gameItemId: 'item-31',
        number: '31',
        name: 'TIGRE',
        maxAmount: null,
        soldAmount: 0,
        availableAmount: null,
        exceeded: false,
      },
    ]);
  });

  test('computes availableAmount and exceeded when quota exists', async () => {
    mockPrisma.draw.findUnique.mockResolvedValue({ id: 'draw-1', gameId: 'game-1', status: 'SCHEDULED' });
    mockPrisma.gameItem.findMany.mockResolvedValue([
      { id: 'item-30', number: '30', name: 'CARNERO' },
    ]);
    mockPrisma.drawItemQuota.findMany.mockResolvedValue([
      { gameItemId: 'item-30', maxAmount: 10000 },
    ]);
    mockPrisma.ticketDetail.groupBy.mockResolvedValue([
      { gameItemId: 'item-30', _sum: { amount: 15000 } },
    ]);

    const result = await getDrawQuotas('draw-1');

    expect(result[0]).toEqual({
      gameItemId: 'item-30',
      number: '30',
      name: 'CARNERO',
      maxAmount: 10000,
      soldAmount: 15000,
      availableAmount: -5000,
      exceeded: true,
    });
  });

  test('throws when draw does not exist', async () => {
    mockPrisma.draw.findUnique.mockResolvedValue(null);
    await expect(getDrawQuotas('missing')).rejects.toThrow(/not found/i);
  });
});
