/**
 * Tests for pnl-provider-breakdown.service.js
 *
 * Strategy: mocked Prisma client (jest.unstable_mockModule).
 *
 * Coverage:
 *   1. Empty week → empty byGame, zero totals, no warnings
 *   2. SALES_AND_UTILITY_PCT — sales+utility commission per game, totals, net to house
 *   3. UTILITY_PCT only — salesRate/salesCommission null, utility math
 *   4. SALES_PCT only — utilityRate/utilityCommission null, sales math
 *   5. Missing config — configMissing flag + warning emitted, commission=0
 *   6. Negative gross with utilityRate — utility component reduces commission, warning emitted
 *   7. Configs grouping — games sharing identical formula+rates+effectiveFrom collapse into one entry
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

    // Cascada (2026-05-22): la comisión sobre utilidad se calcula sobre
    // (ventas − comisiónVenta − premios), no sobre (ventas − premios).
    const ani = out.byGame.find((r) => r.gameName === 'LOTOANIMALITO');
    expect(ani.sales).toBe('15154.99');
    expect(ani.prizes).toBe('8100.00');
    expect(ani.gross).toBe('7054.99'); // gross = sales − prizes (sin cambio)
    expect(ani.salesRate).toBe('16.00');
    expect(ani.salesCommission).toBe('2424.80'); // 15154.99 × 16%
    expect(ani.utilityRate).toBe('30.00');
    // utilityBaseCascade = 15154.99 − 2424.7984 − 8100 = 4630.1916
    // utilityCommission  = 4630.1916 × 30% = 1389.05748
    expect(ani.utilityCommission).toBe('1389.06');
    expect(ani.totalCommission).toBe('3813.86');
    expect(ani.netToHouse).toBe('3241.13');
    expect(ani.configMissing).toBe(false);

    const trp = out.byGame.find((r) => r.gameName === 'TRIPLE PANTERA');
    expect(trp.salesCommission).toBe('11691.25'); // 46765 × 25%
    // utilityBaseCascade = 46765 − 11691.25 − 12500 = 22573.75
    // utilityCommission  = 22573.75 × 30% = 6772.125
    expect(trp.utilityCommission).toBe('6772.13');
    expect(trp.totalCommission).toBe('18463.38');
    expect(trp.netToHouse).toBe('15801.63');

    expect(out.totals.sales).toBe('61919.99');
    expect(out.totals.totalCommission).toBe('22277.23');
    expect(out.totals.netToHouse).toBe('19042.76');
    expect(out.warnings).toEqual([]);
  });
});

describe('getProviderBreakdownForWeek — UTILITY_PCT only', () => {
  test('emits salesRate=null, computes utility commission from gross', async () => {
    mockPrisma.apiSystem.findUnique.mockResolvedValue({ id: 'p2', name: 'virtuales' });
    mockPrisma.$queryRaw.mockResolvedValueOnce([
      { gameId: 'g1', gameName: 'LOTOANIMALITO', sales: '32843.00', prizes: '22200.00' },
    ]);
    mockPrisma.providerCommissionConfig.findFirst.mockResolvedValueOnce({
      id: 'c1', formulaType: 'UTILITY_PCT',
      salesRate: null, utilityRate: '70.00',
      effectiveFrom: new Date('2026-04-07'),
      gameId: null, tiers: [],
    });

    const out = await service.getProviderBreakdownForWeek({
      apiSystemId: 'p2', isoYear: 2026, isoWeek: 21,
    });

    const row = out.byGame[0];
    expect(row.salesRate).toBeNull();
    expect(row.salesCommission).toBeNull();
    expect(row.utilityRate).toBe('70.00');
    expect(row.utilityCommission).toBe('7450.10');
    expect(row.totalCommission).toBe('7450.10');
    expect(row.netToHouse).toBe('3192.90');
  });
});

describe('getProviderBreakdownForWeek — SALES_PCT only', () => {
  test('emits utilityRate=null, computes sales commission only', async () => {
    mockPrisma.apiSystem.findUnique.mockResolvedValue({ id: 'p3', name: 'Some' });
    mockPrisma.$queryRaw.mockResolvedValueOnce([
      { gameId: 'g1', gameName: 'LOTTOPANTERA', sales: '500.00', prizes: '100.00' },
    ]);
    mockPrisma.providerCommissionConfig.findFirst.mockResolvedValueOnce({
      id: 'c1', formulaType: 'SALES_PCT',
      salesRate: '8.00', utilityRate: null,
      effectiveFrom: new Date('2026-01-01'),
      gameId: null, tiers: [],
    });

    const out = await service.getProviderBreakdownForWeek({
      apiSystemId: 'p3', isoYear: 2026, isoWeek: 21,
    });
    const row = out.byGame[0];
    expect(row.salesRate).toBe('8.00');
    expect(row.salesCommission).toBe('40.00');
    expect(row.utilityRate).toBeNull();
    expect(row.utilityCommission).toBeNull();
    expect(row.totalCommission).toBe('40.00');
    expect(row.netToHouse).toBe('360.00');
  });
});

describe('getProviderBreakdownForWeek — warnings', () => {
  test('emits warning when no config vigente for a game', async () => {
    mockPrisma.apiSystem.findUnique.mockResolvedValue({ id: 'p1', name: 'Prov' });
    mockPrisma.$queryRaw.mockResolvedValueOnce([
      { gameId: 'g1', gameName: 'JUEGO X', sales: '1000', prizes: '500' },
    ]);
    mockPrisma.providerCommissionConfig.findFirst.mockResolvedValue(null);

    const out = await service.getProviderBreakdownForWeek({
      apiSystemId: 'p1', isoYear: 2026, isoWeek: 21,
    });

    expect(out.byGame[0].configMissing).toBe(true);
    expect(out.byGame[0].totalCommission).toBe('0.00');
    expect(out.byGame[0].netToHouse).toBe('500.00');
    expect(out.warnings).toContain('Sin config vigente para: JUEGO X');
  });

  test('emits warning when gross is negative and utilityRate is set', async () => {
    mockPrisma.apiSystem.findUnique.mockResolvedValue({ id: 'p1', name: 'Maxplay' });
    mockPrisma.$queryRaw.mockResolvedValueOnce([
      { gameId: 'g1', gameName: 'TRIPLE PANTERA', sales: '17595.00', prizes: '30100.00' },
    ]);
    mockPrisma.providerCommissionConfig.findFirst.mockResolvedValueOnce({
      id: 'c1', formulaType: 'SALES_AND_UTILITY_PCT',
      salesRate: '26.00', utilityRate: '35.00',
      effectiveFrom: new Date('2026-05-04'),
      gameId: 'g1', tiers: [],
    });

    const out = await service.getProviderBreakdownForWeek({
      apiSystemId: 'p1', isoYear: 2026, isoWeek: 21,
    });

    // Cascada (2026-05-22):
    //   salesCommission    = 17595 × 26% = 4574.70
    //   utilityBaseCascade = 17595 − 4574.70 − 30100 = −17079.70
    //   utilityCommission  = −17079.70 × 35% = −5977.895 (HALF_UP → −5977.90)
    //   totalCommission    = 4574.70 + (−5977.895) = −1403.195 → −1403.20
    expect(out.byGame[0].gross).toBe('-12505.00');
    expect(out.byGame[0].utilityCommission).toBe('-5977.90');
    expect(out.byGame[0].totalCommission).toBe('-1403.20');
    expect(out.warnings).toContain(
      'Utilidad negativa en TRIPLE PANTERA: el componente de utilidad redujo la comisión'
    );
  });
});

describe('getProviderBreakdownForWeek — configs grouping', () => {
  test('groups games sharing identical formula+rates+effectiveFrom into one entry', async () => {
    mockPrisma.apiSystem.findUnique.mockResolvedValue({ id: 'p1', name: 'SRQ' });
    mockPrisma.$queryRaw.mockResolvedValueOnce([
      { gameId: 'g1', gameName: 'LOTOANIMALITO', sales: '100', prizes: '50' },
      { gameId: 'g2', gameName: 'LOTTOPANTERA', sales: '100', prizes: '50' },
      { gameId: 'g3', gameName: 'TRIPLE PANTERA', sales: '100', prizes: '50' },
    ]);
    const sameDate = new Date('2025-12-20');
    mockPrisma.providerCommissionConfig.findFirst
      .mockResolvedValueOnce({
        id: 'c1', formulaType: 'SALES_AND_UTILITY_PCT',
        salesRate: '16.00', utilityRate: '30.00',
        effectiveFrom: sameDate, gameId: 'g1', tiers: [],
      })
      .mockResolvedValueOnce({
        id: 'c2', formulaType: 'SALES_AND_UTILITY_PCT',
        salesRate: '16.00', utilityRate: '30.00',
        effectiveFrom: sameDate, gameId: 'g2', tiers: [],
      })
      .mockResolvedValueOnce({
        id: 'c3', formulaType: 'SALES_AND_UTILITY_PCT',
        salesRate: '25.00', utilityRate: '30.00',
        effectiveFrom: sameDate, gameId: 'g3', tiers: [],
      });

    const out = await service.getProviderBreakdownForWeek({
      apiSystemId: 'p1', isoYear: 2026, isoWeek: 21,
    });

    expect(out.configs).toHaveLength(2);
    const sixteen = out.configs.find((c) => c.salesRate === '16.00');
    expect(sixteen.gameNames).toEqual(['LOTOANIMALITO', 'LOTTOPANTERA']);
    const twentyFive = out.configs.find((c) => c.salesRate === '25.00');
    expect(twentyFive.gameNames).toEqual(['TRIPLE PANTERA']);
  });
});
