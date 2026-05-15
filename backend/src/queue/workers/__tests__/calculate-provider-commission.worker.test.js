/**
 * Tests for calculate-provider-commission.worker.js (Phase 12, Plan 12-02 Task 2).
 *
 * Hermetic — service module is mocked so the worker tests don't hit the DB.
 * Pattern mirrors calculate-draw-financials.worker.test.js (jest.unstable_mockModule).
 *
 * Coverage:
 *   1. DrawFinancial.totalizedAt IS NULL → throws DrawFinancialNotReadyError
 *   2. DrawFinancial row absent (df === null) → also throws (defensive race guard)
 *   3. DrawFinancial.totalizedAt IS NOT NULL → calls computeAndUpsertLedgerForDraw + returns result
 *   4. jobs may arrive as an array (pg-boss v10) — handler unwraps jobs[0]
 */

import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

const mockPrisma = {
  drawFinancial: { findUnique: jest.fn() },
};

const mockComputeAndUpsertLedgerForDraw = jest.fn();

// Real DrawFinancialNotReadyError class so `instanceof` works on rethrow.
class DrawFinancialNotReadyError extends Error {
  constructor(drawId) {
    super(`DrawFinancial not ready for ${drawId} — retrying`);
    this.name = 'DrawFinancialNotReadyError';
  }
}

jest.unstable_mockModule('../../../lib/prisma.js', () => ({ prisma: mockPrisma }));
jest.unstable_mockModule('../../../lib/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.unstable_mockModule('../../../services/commission.service.js', () => ({
  computeAndUpsertLedgerForDraw: mockComputeAndUpsertLedgerForDraw,
  DrawFinancialNotReadyError,
}));

describe('calculate-provider-commission.worker', () => {
  let calculateProviderCommissionWorker;

  beforeAll(async () => {
    ({ calculateProviderCommissionWorker } = await import(
      '../calculate-provider-commission.worker.js'
    ));
  });

  beforeEach(() => jest.clearAllMocks());

  test('totalizedAt IS NULL → throws DrawFinancialNotReadyError; service is never called (Pitfall 7)', async () => {
    mockPrisma.drawFinancial.findUnique.mockResolvedValue({ totalizedAt: null });

    await expect(
      calculateProviderCommissionWorker({ data: { drawId: 'draw-x' } }),
    ).rejects.toBeInstanceOf(DrawFinancialNotReadyError);

    expect(mockComputeAndUpsertLedgerForDraw).not.toHaveBeenCalled();
  });

  test('DrawFinancial row absent → throws DrawFinancialNotReadyError (defensive)', async () => {
    mockPrisma.drawFinancial.findUnique.mockResolvedValue(null);

    await expect(
      calculateProviderCommissionWorker({ data: { drawId: 'draw-missing' } }),
    ).rejects.toBeInstanceOf(DrawFinancialNotReadyError);

    expect(mockComputeAndUpsertLedgerForDraw).not.toHaveBeenCalled();
  });

  test('totalizedAt IS NOT NULL → delegates to commission.service and returns the result', async () => {
    mockPrisma.drawFinancial.findUnique.mockResolvedValue({
      totalizedAt: new Date('2026-05-15T20:00:00Z'),
    });
    mockComputeAndUpsertLedgerForDraw.mockResolvedValue({
      providersProcessed: 2,
      skipped: 1,
    });

    const result = await calculateProviderCommissionWorker({ data: { drawId: 'draw-ok' } });

    expect(mockComputeAndUpsertLedgerForDraw).toHaveBeenCalledWith('draw-ok');
    expect(result).toEqual({
      success: true,
      drawId: 'draw-ok',
      providersProcessed: 2,
      skipped: 1,
    });
  });

  test('jobs may arrive as an array (pg-boss v10) — handler unwraps jobs[0]', async () => {
    mockPrisma.drawFinancial.findUnique.mockResolvedValue({
      totalizedAt: new Date('2026-05-15T20:00:00Z'),
    });
    mockComputeAndUpsertLedgerForDraw.mockResolvedValue({ providersProcessed: 1, skipped: 0 });

    const result = await calculateProviderCommissionWorker([
      { data: { drawId: 'draw-arr' } },
    ]);

    expect(mockComputeAndUpsertLedgerForDraw).toHaveBeenCalledWith('draw-arr');
    expect(result).toEqual({
      success: true,
      drawId: 'draw-arr',
      providersProcessed: 1,
      skipped: 0,
    });
  });
});
