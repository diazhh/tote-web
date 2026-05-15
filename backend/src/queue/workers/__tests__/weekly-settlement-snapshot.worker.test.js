/**
 * Tests for weekly-settlement-snapshot.worker.js (Phase 12, Plan 12-02 Task 2).
 *
 * Hermetic — mocks prisma and the date helpers (we want deterministic ISO week).
 *
 * Coverage (D-02 + D-03 state-conditional matrix):
 *   1. No existing row → CREATE DRAFT
 *   2. Existing DRAFT  → UPDATE amount + ledgerRowCount
 *   3. Existing CONFIRMED + no drift → freeze (no mutation)
 *   4. Existing CONFIRMED + drift → mark ADJUSTED with reason 'auto: drift detected by snapshot'
 *   5. Existing ADJUSTED → freeze regardless of drift
 */

import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

const mockPrisma = {
  providerWeeklySettlement: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  $queryRaw: jest.fn(),
};

jest.unstable_mockModule('../../../lib/prisma.js', () => ({ prisma: mockPrisma }));
jest.unstable_mockModule('../../../lib/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
// Stable date helpers — we don't care about the real ISO math here, we care
// about the branching matrix.
jest.unstable_mockModule('../../../lib/dateUtils.js', () => ({
  getISOWeekVE: jest.fn(() => ({ isoYear: 2026, isoWeek: 20 })),
  startOfISOWeekVE: jest.fn(() => new Date('2026-05-11T04:00:00Z')),
  endOfISOWeekVE: jest.fn(() => new Date('2026-05-18T03:59:59.999Z')),
}));

describe('weekly-settlement-snapshot.worker', () => {
  let weeklySettlementSnapshotWorker;

  beforeAll(async () => {
    ({ weeklySettlementSnapshotWorker } = await import(
      '../weekly-settlement-snapshot.worker.js'
    ));
  });

  beforeEach(() => jest.clearAllMocks());

  test('no existing settlement → CREATE with status DRAFT', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { apiSystemId: 'api-1', totalAmount: '500.00000000', ledgerRowCount: 10 },
    ]);
    mockPrisma.providerWeeklySettlement.findFirst.mockResolvedValue(null);
    mockPrisma.providerWeeklySettlement.create.mockResolvedValue({});

    const result = await weeklySettlementSnapshotWorker({});

    expect(mockPrisma.providerWeeklySettlement.create).toHaveBeenCalledTimes(1);
    const createCall = mockPrisma.providerWeeklySettlement.create.mock.calls[0][0];
    expect(createCall.data.apiSystemId).toBe('api-1');
    expect(createCall.data.isoYear).toBe(2026);
    expect(createCall.data.isoWeek).toBe(20);
    expect(createCall.data.amount).toBe('500.00000000');
    expect(createCall.data.ledgerRowCount).toBe(10);
    expect(createCall.data.status).toBe('DRAFT');

    expect(mockPrisma.providerWeeklySettlement.update).not.toHaveBeenCalled();
    expect(result).toEqual({
      isoYear: 2026,
      isoWeek: 20,
      created: 1,
      updated: 0,
      frozen: 0,
      drifted: 0,
    });
  });

  test('existing DRAFT settlement → UPDATE amount + ledgerRowCount', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { apiSystemId: 'api-1', totalAmount: '600.00000000', ledgerRowCount: 12 },
    ]);
    mockPrisma.providerWeeklySettlement.findFirst.mockResolvedValue({
      id: 'sett-1',
      apiSystemId: 'api-1',
      isoYear: 2026,
      isoWeek: 20,
      amount: '500.00000000',
      ledgerRowCount: 10,
      status: 'DRAFT',
    });
    mockPrisma.providerWeeklySettlement.update.mockResolvedValue({});

    const result = await weeklySettlementSnapshotWorker({});

    expect(mockPrisma.providerWeeklySettlement.update).toHaveBeenCalledTimes(1);
    const updateCall = mockPrisma.providerWeeklySettlement.update.mock.calls[0][0];
    expect(updateCall.where).toEqual({ id: 'sett-1' });
    expect(updateCall.data.amount).toBe('600.00000000');
    expect(updateCall.data.ledgerRowCount).toBe(12);
    expect(updateCall.data.status).toBeUndefined(); // status NOT touched on DRAFT update

    expect(mockPrisma.providerWeeklySettlement.create).not.toHaveBeenCalled();
    expect(result).toEqual({
      isoYear: 2026,
      isoWeek: 20,
      created: 0,
      updated: 1,
      frozen: 0,
      drifted: 0,
    });
  });

  test('existing CONFIRMED with NO drift → freeze, no mutation', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { apiSystemId: 'api-1', totalAmount: '500.00000000', ledgerRowCount: 10 },
    ]);
    mockPrisma.providerWeeklySettlement.findFirst.mockResolvedValue({
      id: 'sett-2',
      apiSystemId: 'api-1',
      isoYear: 2026,
      isoWeek: 20,
      amount: '500.00000000',
      ledgerRowCount: 10,
      status: 'CONFIRMED',
    });

    const result = await weeklySettlementSnapshotWorker({});

    expect(mockPrisma.providerWeeklySettlement.update).not.toHaveBeenCalled();
    expect(mockPrisma.providerWeeklySettlement.create).not.toHaveBeenCalled();
    expect(result).toEqual({
      isoYear: 2026,
      isoWeek: 20,
      created: 0,
      updated: 0,
      frozen: 1,
      drifted: 0,
    });
  });

  test('existing CONFIRMED with drift → mark ADJUSTED, amount NOT overwritten (D-02 path 2 / D-03 freeze)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { apiSystemId: 'api-1', totalAmount: '550.00000000', ledgerRowCount: 11 },
    ]);
    mockPrisma.providerWeeklySettlement.findFirst.mockResolvedValue({
      id: 'sett-3',
      apiSystemId: 'api-1',
      isoYear: 2026,
      isoWeek: 20,
      amount: '500.00000000',
      ledgerRowCount: 10,
      status: 'CONFIRMED',
    });
    mockPrisma.providerWeeklySettlement.update.mockResolvedValue({});

    const result = await weeklySettlementSnapshotWorker({});

    expect(mockPrisma.providerWeeklySettlement.update).toHaveBeenCalledTimes(1);
    const updateCall = mockPrisma.providerWeeklySettlement.update.mock.calls[0][0];
    expect(updateCall.where).toEqual({ id: 'sett-3' });
    expect(updateCall.data.status).toBe('ADJUSTED');
    expect(updateCall.data.adjustmentReason).toBe('auto: drift detected by snapshot');
    // CRITICAL: amount is NOT overwritten — D-03 freeze on financial value.
    expect(updateCall.data.amount).toBeUndefined();

    expect(result).toEqual({
      isoYear: 2026,
      isoWeek: 20,
      created: 0,
      updated: 0,
      frozen: 0,
      drifted: 1,
    });
  });

  test('existing ADJUSTED (any drift) → freeze, no mutation', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { apiSystemId: 'api-1', totalAmount: '999.00000000', ledgerRowCount: 99 },
    ]);
    mockPrisma.providerWeeklySettlement.findFirst.mockResolvedValue({
      id: 'sett-4',
      apiSystemId: 'api-1',
      isoYear: 2026,
      isoWeek: 20,
      amount: '500.00000000',
      ledgerRowCount: 10,
      status: 'ADJUSTED',
    });

    const result = await weeklySettlementSnapshotWorker({});

    // ADJUSTED is terminal vs automatic recomputation (D-02 final sentence).
    expect(mockPrisma.providerWeeklySettlement.update).not.toHaveBeenCalled();
    expect(mockPrisma.providerWeeklySettlement.create).not.toHaveBeenCalled();
    expect(result).toEqual({
      isoYear: 2026,
      isoWeek: 20,
      created: 0,
      updated: 0,
      frozen: 1,
      drifted: 0,
    });
  });
});
