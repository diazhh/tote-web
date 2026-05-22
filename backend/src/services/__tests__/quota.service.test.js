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

describe('quota.service — setQuota', () => {
  let setQuota;
  beforeAll(async () => {
    ({ setQuota } = await import('../quota.service.js'));
  });
  beforeEach(() => jest.clearAllMocks());

  test('upserts by (drawId, gameItemId) with maxAmount and createdBy', async () => {
    mockPrisma.drawItemQuota.upsert.mockResolvedValue({
      id: 'q-1', drawId: 'draw-1', gameItemId: 'item-30', maxAmount: 20000, createdBy: 'user-1',
    });
    const result = await setQuota({ drawId: 'draw-1', gameItemId: 'item-30', maxAmount: 20000, userId: 'user-1' });

    expect(mockPrisma.drawItemQuota.upsert).toHaveBeenCalledWith({
      where: { drawId_gameItemId: { drawId: 'draw-1', gameItemId: 'item-30' } },
      create: { drawId: 'draw-1', gameItemId: 'item-30', maxAmount: 20000, createdBy: 'user-1' },
      update: { maxAmount: 20000 },
    });
    expect(result.maxAmount).toBe(20000);
  });

  test('accepts maxAmount=0 (bloqueo duro) and rejects negative', async () => {
    // maxAmount=0 ahora se acepta y funciona como bloqueo duro
    // (cualquier intento de venta > 0 supera el cupo y se rechaza).
    mockPrisma.drawItemQuota.upsert.mockResolvedValueOnce({
      drawId: 'draw-1', gameItemId: 'item-30', maxAmount: 0, createdBy: null,
    });
    await expect(setQuota({ drawId: 'draw-1', gameItemId: 'item-30', maxAmount: 0 })).resolves.toEqual(
      expect.objectContaining({ maxAmount: 0 }),
    );
    // Negativo sigue siendo inválido.
    await expect(setQuota({ drawId: 'draw-1', gameItemId: 'item-30', maxAmount: -100 })).rejects.toThrow(/non-negative/i);
  });
});

describe('quota.service — removeQuota', () => {
  let removeQuota;
  beforeAll(async () => {
    ({ removeQuota } = await import('../quota.service.js'));
  });
  beforeEach(() => jest.clearAllMocks());

  test('deletes by unique key', async () => {
    mockPrisma.drawItemQuota.delete.mockResolvedValue({ id: 'q-1' });
    await removeQuota({ drawId: 'draw-1', gameItemId: 'item-30' });
    expect(mockPrisma.drawItemQuota.delete).toHaveBeenCalledWith({
      where: { drawId_gameItemId: { drawId: 'draw-1', gameItemId: 'item-30' } },
    });
  });

  test('is idempotent — swallows "record not found" errors', async () => {
    const err = new Error('Record not found');
    err.code = 'P2025';
    mockPrisma.drawItemQuota.delete.mockRejectedValue(err);
    await expect(removeQuota({ drawId: 'draw-1', gameItemId: 'item-30' })).resolves.toBeUndefined();
  });
});

describe('quota.service — checkTicketQuotas', () => {
  let checkTicketQuotas;
  let mockTx;

  beforeAll(async () => {
    ({ checkTicketQuotas } = await import('../quota.service.js'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockTx = {
      $queryRaw: jest.fn(),
      ticketDetail: { groupBy: jest.fn() },
      gameItem: { findUnique: jest.fn() },
      draw: { findUnique: jest.fn() },
    };
  });

  test('returns ok when no quotas exist for any play', async () => {
    mockTx.$queryRaw.mockResolvedValue([]); // no quota rows
    const result = await checkTicketQuotas(
      [{ drawId: 'draw-1', gameItemId: 'item-30', amount: 500 }],
      mockTx,
    );
    expect(result).toEqual({ ok: true });
    expect(mockTx.ticketDetail.groupBy).not.toHaveBeenCalled(); // early exit
  });

  test('returns ok when sold + attempt <= max', async () => {
    mockTx.$queryRaw.mockResolvedValue([
      { drawId: 'draw-1', gameItemId: 'item-30', maxAmount: 20000 },
    ]);
    mockTx.ticketDetail.groupBy.mockResolvedValue([
      { drawId: 'draw-1', gameItemId: 'item-30', _sum: { amount: 19500 } },
    ]);
    const result = await checkTicketQuotas(
      [{ drawId: 'draw-1', gameItemId: 'item-30', amount: 500 }],
      mockTx,
    );
    expect(result).toEqual({ ok: true });
  });

  test('rejects when sold + attempt > max, includes item number and drawTime in reason', async () => {
    mockTx.$queryRaw.mockResolvedValue([
      { drawId: 'draw-1', gameItemId: 'item-30', maxAmount: 20000 },
    ]);
    mockTx.ticketDetail.groupBy.mockResolvedValue([
      { drawId: 'draw-1', gameItemId: 'item-30', _sum: { amount: 19500 } },
    ]);
    mockTx.gameItem.findUnique.mockResolvedValue({ number: '30', name: 'CARNERO' });
    mockTx.draw.findUnique.mockResolvedValue({ drawTime: '10:00:00' });

    const result = await checkTicketQuotas(
      [{ drawId: 'draw-1', gameItemId: 'item-30', amount: 1000 }],
      mockTx,
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/30/);
    expect(result.reason).toMatch(/CARNERO/);
    expect(result.reason).toMatch(/10:00/);
    expect(result.reason).toMatch(/20500/);
    expect(result.reason).toMatch(/20000/);
  });

  test('aggregates multiple plays on the same (draw, item) before checking', async () => {
    mockTx.$queryRaw.mockResolvedValue([
      { drawId: 'draw-1', gameItemId: 'item-30', maxAmount: 1000 },
    ]);
    mockTx.ticketDetail.groupBy.mockResolvedValue([]);
    mockTx.gameItem.findUnique.mockResolvedValue({ number: '30', name: 'CARNERO' });
    mockTx.draw.findUnique.mockResolvedValue({ drawTime: '10:00:00' });

    // Two plays of 600 on same item = 1200, exceeds 1000
    const result = await checkTicketQuotas(
      [
        { drawId: 'draw-1', gameItemId: 'item-30', amount: 600 },
        { drawId: 'draw-1', gameItemId: 'item-30', amount: 600 },
      ],
      mockTx,
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/1200/);
  });

  test('rejects ticket when any single (draw, item) exceeds (all-or-nothing)', async () => {
    mockTx.$queryRaw.mockResolvedValue([
      { drawId: 'draw-1', gameItemId: 'item-30', maxAmount: 20000 },
      { drawId: 'draw-1', gameItemId: 'item-31', maxAmount: 5000 },
    ]);
    mockTx.ticketDetail.groupBy.mockResolvedValue([
      { drawId: 'draw-1', gameItemId: 'item-30', _sum: { amount: 100 } },
      { drawId: 'draw-1', gameItemId: 'item-31', _sum: { amount: 4900 } },
    ]);
    mockTx.gameItem.findUnique.mockResolvedValue({ number: '31', name: 'TIGRE' });
    mockTx.draw.findUnique.mockResolvedValue({ drawTime: '10:00:00' });

    const result = await checkTicketQuotas(
      [
        { drawId: 'draw-1', gameItemId: 'item-30', amount: 500 }, // ok
        { drawId: 'draw-1', gameItemId: 'item-31', amount: 200 }, // exceeds
      ],
      mockTx,
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/31/);
  });

  test('requires tx parameter', async () => {
    await expect(
      checkTicketQuotas([{ drawId: 'd', gameItemId: 'i', amount: 1 }], null),
    ).rejects.toThrow(/tx is required/i);
  });
});
