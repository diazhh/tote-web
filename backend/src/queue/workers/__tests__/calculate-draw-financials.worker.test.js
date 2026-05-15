/**
 * Tests for calculate-draw-financials.worker.js (Phase 11, Plan 11-02 Task 2).
 *
 * Hermetic — service module is mocked so the worker tests don't hit the DB.
 * Pattern follows quota.service.test.js / monitor.service.test.js (jest.unstable_mockModule).
 */

import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

const mockPrisma = {
  draw: { findUnique: jest.fn() },
};

const mockComputeAndUpsertSales = jest.fn();
const mockComputeAndUpsertPrizes = jest.fn();

// Real PrizesNotProcessedError class so `instanceof` works on the worker rethrow path.
class PrizesNotProcessedError extends Error {
  constructor(drawId) {
    super(`Draw ${drawId} prizes not processed — cannot compute totalPrize/utility`);
    this.name = 'PrizesNotProcessedError';
  }
}

jest.unstable_mockModule('../../../lib/prisma.js', () => ({ prisma: mockPrisma }));
jest.unstable_mockModule('../../../lib/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.unstable_mockModule('../../../services/draw-financial.service.js', () => ({
  computeAndUpsertSales: mockComputeAndUpsertSales,
  computeAndUpsertPrizes: mockComputeAndUpsertPrizes,
  PrizesNotProcessedError,
}));

describe('calculate-draw-financials.worker', () => {
  let calculateDrawFinancialsWorker;

  beforeAll(async () => {
    ({ calculateDrawFinancialsWorker } = await import(
      '../calculate-draw-financials.worker.js'
    ));
  });

  beforeEach(() => jest.clearAllMocks());

  test('phase=SALES invokes computeAndUpsertSales(drawId, draw.closedAt) and returns success', async () => {
    const closedAt = new Date('2026-05-15T17:55:00Z');
    mockPrisma.draw.findUnique.mockResolvedValue({
      prizesProcessed: false,
      closedAt,
      drawnAt: null,
    });
    mockComputeAndUpsertSales.mockResolvedValue({});

    const result = await calculateDrawFinancialsWorker({
      data: { drawId: 'draw-1', phase: 'SALES' },
    });

    expect(mockComputeAndUpsertSales).toHaveBeenCalledWith('draw-1', closedAt);
    expect(mockComputeAndUpsertPrizes).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, drawId: 'draw-1', phase: 'SALES' });
  });

  test('phase=PRIZES with prizesProcessed=false throws PrizesNotProcessedError; service is never called (F-1)', async () => {
    mockPrisma.draw.findUnique.mockResolvedValue({
      prizesProcessed: false,
      closedAt: new Date(),
      drawnAt: new Date(),
    });

    await expect(
      calculateDrawFinancialsWorker({ data: { drawId: 'draw-x', phase: 'PRIZES' } }),
    ).rejects.toBeInstanceOf(PrizesNotProcessedError);

    expect(mockComputeAndUpsertPrizes).not.toHaveBeenCalled();
    expect(mockComputeAndUpsertSales).not.toHaveBeenCalled();
  });

  test('phase=PRIZES with prizesProcessed=true invokes computeAndUpsertPrizes(drawId, draw.drawnAt)', async () => {
    const drawnAt = new Date('2026-05-15T18:00:00Z');
    mockPrisma.draw.findUnique.mockResolvedValue({
      prizesProcessed: true,
      closedAt: new Date('2026-05-15T17:55:00Z'),
      drawnAt,
    });
    mockComputeAndUpsertPrizes.mockResolvedValue({});

    const result = await calculateDrawFinancialsWorker({
      data: { drawId: 'draw-2', phase: 'PRIZES' },
    });

    expect(mockComputeAndUpsertPrizes).toHaveBeenCalledWith('draw-2', drawnAt);
    expect(result).toEqual({ success: true, drawId: 'draw-2', phase: 'PRIZES' });
  });

  test('unknown phase throws an error mentioning the unknown phase value', async () => {
    mockPrisma.draw.findUnique.mockResolvedValue({
      prizesProcessed: true,
      closedAt: new Date(),
      drawnAt: new Date(),
    });

    await expect(
      calculateDrawFinancialsWorker({ data: { drawId: 'draw-3', phase: 'UNKNOWN' } }),
    ).rejects.toThrow(/unknown phase: UNKNOWN/);
  });

  test('non-existent drawId throws "Draw {drawId} no encontrado"', async () => {
    mockPrisma.draw.findUnique.mockResolvedValue(null);

    await expect(
      calculateDrawFinancialsWorker({ data: { drawId: 'missing-id', phase: 'SALES' } }),
    ).rejects.toThrow('Draw missing-id no encontrado');

    expect(mockComputeAndUpsertSales).not.toHaveBeenCalled();
  });

  test('jobs may arrive as an array (pg-boss v10) — handler unwraps jobs[0]', async () => {
    const closedAt = new Date();
    mockPrisma.draw.findUnique.mockResolvedValue({
      prizesProcessed: false,
      closedAt,
      drawnAt: null,
    });
    mockComputeAndUpsertSales.mockResolvedValue({});

    const result = await calculateDrawFinancialsWorker([
      { data: { drawId: 'draw-arr', phase: 'SALES' } },
    ]);

    expect(mockComputeAndUpsertSales).toHaveBeenCalledWith('draw-arr', closedAt);
    expect(result).toEqual({ success: true, drawId: 'draw-arr', phase: 'SALES' });
  });
});
