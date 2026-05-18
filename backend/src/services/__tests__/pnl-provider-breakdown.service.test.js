/**
 * Tests for pnl-provider-breakdown.service.js
 *
 * Strategy: mocked Prisma client (jest.unstable_mockModule).
 *
 * Coverage:
 *   1. Empty week → empty byGame, zero totals, no warnings
 *   2. SALES_AND_UTILITY_PCT — sales+utility commission per game, totals, net to house
 *   (More cases added in Tasks 3-5.)
 */

import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

const mockPrisma = {
  apiSystem: { findUnique: jest.fn() },
  $queryRaw: jest.fn(),
  providerCommissionConfig: { findFirst: jest.fn() },
};

jest.unstable_mockModule('../../lib/prisma.js', () => ({
  prisma: mockPrisma,
}));
jest.unstable_mockModule('../../lib/logger.js', () => ({
  default: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

let service;
beforeAll(async () => {
  service = await import('../pnl-provider-breakdown.service.js');
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getProviderBreakdownForWeek — empty week', () => {
  test('returns empty byGame + zero totals when provider had no sales', async () => {
    mockPrisma.apiSystem.findUnique.mockResolvedValue({ id: 'p1', name: 'TestProv' });
    mockPrisma.$queryRaw.mockResolvedValue([]); // no draw rows

    const out = await service.getProviderBreakdownForWeek({
      apiSystemId: 'p1',
      isoYear: 2026,
      isoWeek: 21,
    });

    expect(out.apiSystemId).toBe('p1');
    expect(out.apiSystemName).toBe('TestProv');
    expect(out.byGame).toEqual([]);
    expect(out.configs).toEqual([]);
    expect(out.totals.sales).toBe('0.00');
    expect(out.totals.totalCommission).toBe('0.00');
    expect(out.warnings).toEqual([]);
  });
});

describe('getProviderBreakdownForWeek — SALES_AND_UTILITY_PCT', () => {
  test('computes salesCommission, utilityCommission, totalCommission, netToHouse per game', async () => {
    mockPrisma.apiSystem.findUnique.mockResolvedValue({ id: 'p1', name: 'SRQ' });
    mockPrisma.$queryRaw.mockResolvedValueOnce([
      { gameId: 'g1', gameName: 'LOTOANIMALITO', sales: '15154.99', prizes: '8100.00' },
      { gameId: 'g2', gameName: 'TRIPLE PANTERA', sales: '46765.00', prizes: '12500.00' },
    ]);
    mockPrisma.providerCommissionConfig.findFirst
      .mockResolvedValueOnce({
        id: 'c1', formulaType: 'SALES_AND_UTILITY_PCT',
        salesRate: '16.00', utilityRate: '30.00',
        effectiveFrom: new Date('2025-12-20'),
        gameId: 'g1', tiers: [],
      })
      .mockResolvedValueOnce({
        id: 'c2', formulaType: 'SALES_AND_UTILITY_PCT',
        salesRate: '25.00', utilityRate: '30.00',
        effectiveFrom: new Date('2025-12-20'),
        gameId: 'g2', tiers: [],
      });

    const out = await service.getProviderBreakdownForWeek({
      apiSystemId: 'p1', isoYear: 2026, isoWeek: 21,
    });

    expect(out.byGame).toHaveLength(2);

    const ani = out.byGame.find((r) => r.gameName === 'LOTOANIMALITO');
    expect(ani.sales).toBe('15154.99');
    expect(ani.prizes).toBe('8100.00');
    expect(ani.gross).toBe('7054.99');
    expect(ani.salesRate).toBe('16.00');
    expect(ani.salesCommission).toBe('2424.80');
    expect(ani.utilityRate).toBe('30.00');
    expect(ani.utilityCommission).toBe('2116.50');
    expect(ani.totalCommission).toBe('4541.30');
    expect(ani.netToHouse).toBe('2513.69');
    expect(ani.configMissing).toBe(false);

    const trp = out.byGame.find((r) => r.gameName === 'TRIPLE PANTERA');
    expect(trp.salesCommission).toBe('11691.25');
    expect(trp.utilityCommission).toBe('10279.50');
    expect(trp.totalCommission).toBe('21970.75');
    expect(trp.netToHouse).toBe('12294.25');

    expect(out.totals.sales).toBe('61919.99');
    expect(out.totals.totalCommission).toBe('26512.05');
    expect(out.totals.netToHouse).toBe('14807.94');
    expect(out.warnings).toEqual([]);
  });
});
