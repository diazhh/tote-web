import { jest, describe, test, expect, beforeEach } from '@jest/globals';

const mockPrisma = {
  apiSystem: { findUnique: jest.fn() },
  $queryRaw: jest.fn(),
  providerCommissionConfig: { findFirst: jest.fn() },
};

jest.unstable_mockModule('../../lib/prisma.js', () => ({
  prisma: mockPrisma,
  default: mockPrisma,
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
