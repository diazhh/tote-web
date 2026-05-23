/**
 * Tests for commission.service.js (Phase 12, Plan 12-02 Task 1).
 *
 * Strategy: mocked Prisma client (jest.unstable_mockModule) — same pattern as
 * draw-financial.service.test.js. Each test seeds the mocks with the shape the
 * real DB query would return.
 *
 * Coverage (11 behaviours per <behavior> block in Plan 12-02 Task 1):
 *   1.  SALES_PCT @ 5% on 1000/200            → 50
 *   2.  UTILITY_PCT @ 10% on 1000/200          → 80 (utility=800 × 10%)
 *   3.  SALES_AND_UTILITY_PCT (2% sales, 5% util) → 60 (20 + 40)
 *   4.  TIERED @ cum=4500 → first bracket (3%) → 30
 *   5.  TIERED @ cum=7000 → second bracket (5%) → 50
 *   6.  TIERED @ cum=5000 → second bracket (open-ended top, gte boundary) → 50
 *   7.  findEffectiveConfig — picks latest effectiveFrom ≤ drawnAt (NOT latest overall)
 *   8.  D-01 silent skip when no config — warning logged, no row written
 *   9.  Idempotent re-run — second call UPDATEs the existing row
 *   10. configSnapshot Json populated with { formulaType, salesRate, utilityRate, tiers }
 *   11. D-04 multi-draw cumulative — getCumulativeWeeklySales sums via raw SQL
 *   12. Append-only assertion — prisma.providerCommissionConfig.update never called
 */

import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

// ----- Mock prisma -----
const mockPrisma = {
  draw: {
    findUnique: jest.fn(),
  },
  drawFinancialProvider: {
    findMany: jest.fn(),
  },
  providerCommissionConfig: {
    findFirst: jest.fn(),
    update: jest.fn(), // F-5 — assert NEVER called
    create: jest.fn(),
    findMany: jest.fn(),
  },
  providerCommissionLedger: {
    findFirst: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
  },
  providerWeeklySettlement: {
    findUnique: jest.fn(),
  },
  $queryRaw: jest.fn(),
};

jest.unstable_mockModule('../../lib/prisma.js', () => ({ prisma: mockPrisma }));
jest.unstable_mockModule('../../lib/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('commission.service — computeCommission (formula evaluators)', () => {
  let computeCommission;

  beforeAll(async () => {
    ({ computeCommission } = await import('../commission.service.js'));
  });

  beforeEach(() => jest.clearAllMocks());

  test('SALES_PCT @ 5% on sales=1000 prize=200 returns "50.00000000"', () => {
    const config = { formulaType: 'SALES_PCT', salesRate: '5', utilityRate: null, tiers: [] };
    const providerRow = { totalSales: '1000', totalPrize: '200' };
    expect(computeCommission(config, providerRow, '0')).toBe('50.00000000');
  });

  test('UTILITY_PCT @ 10% on sales=1000 prize=200 (utility=800) returns "80.00000000"', () => {
    const config = { formulaType: 'UTILITY_PCT', salesRate: null, utilityRate: '10', tiers: [] };
    const providerRow = { totalSales: '1000', totalPrize: '200' };
    expect(computeCommission(config, providerRow, '0')).toBe('80.00000000');
  });

  test('SALES_AND_UTILITY_PCT cascada sales=2% util=5% on 1000/200 returns "59.00000000" (20 + 39)', () => {
    // Modelo cascada (2026-05-22):
    //   salesCommission    = 1000 × 2% = 20
    //   utilityBaseCascade = 1000 − 20 − 200 = 780
    //   utilityCommission  = 780 × 5% = 39
    //   total              = 20 + 39 = 59
    const config = {
      formulaType: 'SALES_AND_UTILITY_PCT',
      salesRate: '2',
      utilityRate: '5',
      tiers: [],
    };
    const providerRow = { totalSales: '1000', totalPrize: '200' };
    expect(computeCommission(config, providerRow, '0')).toBe('59.00000000');
  });

  test('SALES_AND_UTILITY_PCT cascada — caso de referencia del usuario 100/50 @ 15%/35% = "27.25000000"', () => {
    // Ejemplo discutido el 2026-05-22:
    //   salesCommission    = 100 × 15% = 15
    //   utilityBaseCascade = 100 − 15 − 50 = 35
    //   utilityCommission  = 35 × 35% = 12.25
    //   total              = 15 + 12.25 = 27.25
    //   netoCasa           = (100 − 50) − 27.25 = 22.75
    const config = {
      formulaType: 'SALES_AND_UTILITY_PCT',
      salesRate: '15',
      utilityRate: '35',
      tiers: [],
    };
    const providerRow = { totalSales: '100', totalPrize: '50' };
    expect(computeCommission(config, providerRow, '0')).toBe('27.25000000');
  });

  test('TIERED — cum=4500 → first bracket (3%) → "30.00000000"', () => {
    const config = {
      id: 'cfg-1',
      formulaType: 'TIERED',
      salesRate: null,
      utilityRate: null,
      tiers: [
        { minSales: '0', maxSales: '5000', rate: '3' },
        { minSales: '5000', maxSales: null, rate: '5' },
      ],
    };
    const providerRow = { totalSales: '1000', totalPrize: '0' };
    expect(computeCommission(config, providerRow, '4500')).toBe('30.00000000');
  });

  test('TIERED — cum=7000 → second bracket (5%) → "50.00000000"', () => {
    const config = {
      id: 'cfg-1',
      formulaType: 'TIERED',
      salesRate: null,
      utilityRate: null,
      tiers: [
        { minSales: '0', maxSales: '5000', rate: '3' },
        { minSales: '5000', maxSales: null, rate: '5' },
      ],
    };
    const providerRow = { totalSales: '1000', totalPrize: '0' };
    expect(computeCommission(config, providerRow, '7000')).toBe('50.00000000');
  });

  test('TIERED — cum=5000 (boundary: gte 5000 AND open-ended top tier) selects second bracket → "50.00000000"', () => {
    const config = {
      id: 'cfg-1',
      formulaType: 'TIERED',
      salesRate: null,
      utilityRate: null,
      tiers: [
        { minSales: '0', maxSales: '5000', rate: '3' },
        { minSales: '5000', maxSales: null, rate: '5' },
      ],
    };
    const providerRow = { totalSales: '1000', totalPrize: '0' };
    expect(computeCommission(config, providerRow, '5000')).toBe('50.00000000');
  });

  test('unknown formulaType throws', () => {
    const config = { formulaType: 'WHATEVER', tiers: [] };
    expect(() => computeCommission(config, { totalSales: '1', totalPrize: '0' }, '0')).toThrow(
      /Unknown formulaType/,
    );
  });
});

describe('commission.service — findEffectiveConfig', () => {
  let findEffectiveConfig;

  beforeAll(async () => {
    ({ findEffectiveConfig } = await import('../commission.service.js'));
  });

  beforeEach(() => jest.clearAllMocks());

  test('returns the row with the latest effectiveFrom ≤ drawnAt (NOT the latest overall)', async () => {
    // Two configs exist: one effective 2026-01-01 (rate 3%), one effective 2026-04-01 (rate 5%).
    // Query with drawnAt=2026-03-15 should return the FIRST (rate 3%) — even though the second
    // exists, it's not effective yet. We simulate Prisma's behaviour by returning the right row.
    const drawnAt = new Date('2026-03-15T00:00:00Z');
    const expected = {
      id: 'cfg-old',
      apiSystemId: 'api-1',
      formulaType: 'SALES_PCT',
      salesRate: '3',
      effectiveFrom: new Date('2026-01-01T00:00:00Z'),
      tiers: [],
    };
    mockPrisma.providerCommissionConfig.findFirst.mockResolvedValue(expected);

    const result = await findEffectiveConfig('api-1', drawnAt);

    expect(result).toEqual(expected);
    const call = mockPrisma.providerCommissionConfig.findFirst.mock.calls[0][0];
    expect(call.where).toEqual({ apiSystemId: 'api-1', effectiveFrom: { lte: drawnAt } });
    expect(call.orderBy).toEqual({ effectiveFrom: 'desc' });
    expect(call.include).toEqual({ tiers: { orderBy: { minSales: 'asc' } } });
  });
});

describe('commission.service — getCumulativeWeeklySales (D-04)', () => {
  let getCumulativeWeeklySales;

  beforeAll(async () => {
    ({ getCumulativeWeeklySales } = await import('../commission.service.js'));
  });

  beforeEach(() => jest.clearAllMocks());

  test('D-04 multi-draw cumulative: SUM across 3 draws in same ISO week', async () => {
    // Simulate raw SQL returning a single row with the aggregated cumulative across
    // 3 DrawFinancialProvider rows (300 + 400 + 500 = 1200).
    mockPrisma.$queryRaw.mockResolvedValue([{ cumulative: '1200.00000000' }]);

    const drawnAt = new Date('2026-05-13T18:00:00Z'); // Wednesday in ISO week 2026-W20
    const result = await getCumulativeWeeklySales('api-1', drawnAt);

    expect(result).toBe('1200.00000000');
    // $queryRaw was called exactly once with the right shape
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});

describe('commission.service — computeAndUpsertLedgerForDraw', () => {
  let computeAndUpsertLedgerForDraw;

  beforeAll(async () => {
    ({ computeAndUpsertLedgerForDraw } = await import('../commission.service.js'));
  });

  beforeEach(() => jest.clearAllMocks());

  test('D-01 silent skip: provider without effective config logs warning, writes no row', async () => {
    mockPrisma.draw.findUnique.mockResolvedValue({ drawnAt: new Date('2026-05-13T18:00:00Z') });
    mockPrisma.drawFinancialProvider.findMany.mockResolvedValue([
      {
        drawId: 'd-1',
        apiSystemId: 'api-1',
        totalSales: '100',
        totalPrize: '20',
        apiSystem: { id: 'api-1', name: 'P1', slug: 'p1' },
      },
    ]);
    // findEffectiveConfig (the prisma call) returns null → D-01 silent skip.
    mockPrisma.providerCommissionConfig.findFirst.mockResolvedValue(null);

    const result = await computeAndUpsertLedgerForDraw('d-1');

    expect(result).toEqual({ providersProcessed: 0, skipped: 1 });
    expect(mockPrisma.providerCommissionLedger.create).not.toHaveBeenCalled();
    expect(mockPrisma.providerCommissionLedger.update).not.toHaveBeenCalled();
  });

  test('idempotent: second run UPDATES the existing ledger row (D-08)', async () => {
    mockPrisma.draw.findUnique.mockResolvedValue({ drawnAt: new Date('2026-05-13T18:00:00Z') });
    mockPrisma.drawFinancialProvider.findMany.mockResolvedValue([
      {
        drawId: 'd-2',
        apiSystemId: 'api-1',
        totalSales: '1000',
        totalPrize: '200',
        apiSystem: { id: 'api-1', name: 'P1', slug: 'p1' },
      },
    ]);
    const config = {
      id: 'cfg-1',
      formulaType: 'SALES_PCT',
      salesRate: '5',
      utilityRate: null,
      tiers: [],
    };
    mockPrisma.providerCommissionConfig.findFirst.mockResolvedValue(config);

    // First call: existing is null → create
    mockPrisma.providerCommissionLedger.findFirst.mockResolvedValueOnce(null);
    mockPrisma.providerCommissionLedger.create.mockResolvedValueOnce({ id: 'led-1' });

    const r1 = await computeAndUpsertLedgerForDraw('d-2');
    expect(r1).toEqual({ providersProcessed: 1, skipped: 0 });
    expect(mockPrisma.providerCommissionLedger.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.providerCommissionLedger.update).not.toHaveBeenCalled();

    // Second call: existing row → update (no duplicate insert)
    mockPrisma.providerCommissionLedger.findFirst.mockResolvedValueOnce({ id: 'led-1' });
    mockPrisma.providerCommissionLedger.update.mockResolvedValueOnce({ id: 'led-1' });

    const r2 = await computeAndUpsertLedgerForDraw('d-2');
    expect(r2).toEqual({ providersProcessed: 1, skipped: 0 });
    expect(mockPrisma.providerCommissionLedger.create).toHaveBeenCalledTimes(1); // not 2
    expect(mockPrisma.providerCommissionLedger.update).toHaveBeenCalledTimes(1);
  });

  test('configSnapshot Json carries { formulaType, salesRate, utilityRate, tiers }', async () => {
    mockPrisma.draw.findUnique.mockResolvedValue({ drawnAt: new Date('2026-05-13T18:00:00Z') });
    mockPrisma.drawFinancialProvider.findMany.mockResolvedValue([
      {
        drawId: 'd-3',
        apiSystemId: 'api-1',
        totalSales: '1000',
        totalPrize: '200',
        apiSystem: { id: 'api-1', name: 'P1', slug: 'p1' },
      },
    ]);
    const config = {
      id: 'cfg-2',
      formulaType: 'SALES_AND_UTILITY_PCT',
      salesRate: '2',
      utilityRate: '5',
      tiers: [],
    };
    mockPrisma.providerCommissionConfig.findFirst.mockResolvedValue(config);
    mockPrisma.providerCommissionLedger.findFirst.mockResolvedValue(null);
    mockPrisma.providerCommissionLedger.create.mockResolvedValue({ id: 'led-x' });

    await computeAndUpsertLedgerForDraw('d-3');

    const createCall = mockPrisma.providerCommissionLedger.create.mock.calls[0][0];
    expect(createCall.data.configSnapshot).toEqual({
      formulaType: 'SALES_AND_UTILITY_PCT',
      salesRate: '2',
      utilityRate: '5',
      tiers: [],
    });
    // Cascada: 1000×2% + (1000−20−200)×5% = 20 + 39 = 59
    expect(createCall.data.amount).toBe('59.00000000');
    expect(createCall.data.salesBase).toBe('1000.00000000');
    // utilityBase histórica = sales − prizes (sin tocar para no romper reportes)
    expect(createCall.data.utilityBase).toBe('800.00000000');
    expect(createCall.data.configId).toBe('cfg-2');
  });
});

describe('commission.service — F-5 append-only assertion', () => {
  let svc;

  beforeAll(async () => {
    svc = await import('../commission.service.js');
  });

  beforeEach(() => jest.clearAllMocks());

  test('prisma.providerCommissionConfig.update is NEVER called from any exported function', async () => {
    // Drive a representative happy path through every public surface.
    mockPrisma.draw.findUnique.mockResolvedValue({ drawnAt: new Date('2026-05-13T18:00:00Z') });
    mockPrisma.drawFinancialProvider.findMany.mockResolvedValue([
      {
        drawId: 'd-app',
        apiSystemId: 'api-1',
        totalSales: '1000',
        totalPrize: '200',
        apiSystem: { id: 'api-1', name: 'P1', slug: 'p1' },
      },
    ]);
    const config = {
      id: 'cfg-app',
      formulaType: 'SALES_PCT',
      salesRate: '5',
      utilityRate: null,
      tiers: [],
    };
    mockPrisma.providerCommissionConfig.findFirst.mockResolvedValue(config);
    mockPrisma.providerCommissionLedger.findFirst.mockResolvedValue(null);
    mockPrisma.providerCommissionLedger.create.mockResolvedValue({ id: 'led-app' });
    mockPrisma.providerCommissionLedger.findMany.mockResolvedValue([]);
    mockPrisma.$queryRaw.mockResolvedValue([{ total: '0', rows: 0 }]);
    mockPrisma.providerWeeklySettlement.findUnique.mockResolvedValue({
      id: 'sett-1',
      apiSystemId: 'api-1',
      isoYear: 2026,
      isoWeek: 20,
      amount: '0',
      apiSystem: { id: 'api-1', name: 'P1', slug: 'p1' },
    });

    // Invoke service surfaces
    await svc.findEffectiveConfig('api-1', new Date());
    svc.computeCommission(config, { totalSales: '100', totalPrize: '0' }, '0');
    await svc.getCumulativeWeeklySales('api-1', new Date('2026-05-13T18:00:00Z'));
    await svc.computeAndUpsertLedgerForDraw('d-app');
    await svc.computeSettlementForWeek('api-1', 2026, 20);
    await svc.getSettlementWithLedger('sett-1');
    await svc.getSettlementPdfData('sett-1');

    // F-5 — never an UPDATE on the append-only config table.
    expect(mockPrisma.providerCommissionConfig.update).not.toHaveBeenCalled();
  });
});
