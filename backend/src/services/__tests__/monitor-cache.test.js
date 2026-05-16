import { jest } from '@jest/globals';

const mockCacheOrCompute = jest.fn();
jest.unstable_mockModule('../../lib/redis.js', () => ({
  cacheOrCompute: mockCacheOrCompute,
  invalidate: jest.fn(),
  invalidatePattern: jest.fn(),
  isHealthy: jest.fn(),
  shutdown: jest.fn(),
}));

jest.unstable_mockModule('../../lib/prisma.js', () => ({
  prisma: {
    draw: { findMany: jest.fn() },
    ticket: { findMany: jest.fn(), count: jest.fn() },
    drawFinancial: { findMany: jest.fn() },
    dailyAggregateSnapshot: { findMany: jest.fn() },
    apiSystem: { findMany: jest.fn() },
    gameItem: { findMany: jest.fn() },
  },
}));

let monitorSvc;

beforeAll(async () => {
  monitorSvc = await import('../monitor.service.js');
});

beforeEach(() => {
  jest.clearAllMocks();
  // Default: cache miss → call through to fn
  mockCacheOrCompute.mockImplementation(async (_key, _ttl, fn) => fn());
});

describe('getDailyReport caching', () => {
  it('passes a stable key derived from filters', async () => {
    mockCacheOrCompute.mockResolvedValueOnce({ summary: { totalSales: 0 } });

    await monitorSvc.default.getDailyReport({
      dateFrom: new Date('2026-05-01'),
      dateTo: new Date('2026-05-15'),
      gameId: 'g1',
      source: null,
      apiSystemId: null,
    });

    expect(mockCacheOrCompute).toHaveBeenCalled();
    const callKey = mockCacheOrCompute.mock.calls[0][0];
    expect(callKey).toMatch(/^tote:v1:report:daily:[a-f0-9]+$/);
  });

  it('uses TTL=60 when dateTo includes today, TTL=3600 otherwise', async () => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const lastMonth = new Date(); lastMonth.setMonth(lastMonth.getMonth() - 1);

    mockCacheOrCompute.mockResolvedValue({ summary: {} });

    await monitorSvc.default.getDailyReport({ dateFrom: today, dateTo: today });
    expect(mockCacheOrCompute.mock.calls[0][1]).toBe(60);

    await monitorSvc.default.getDailyReport({ dateFrom: lastMonth, dateTo: lastMonth });
    expect(mockCacheOrCompute.mock.calls[1][1]).toBe(3600);
  });

  it('passes trackingSet option for pattern-based invalidation', async () => {
    mockCacheOrCompute.mockResolvedValueOnce({ summary: {} });

    await monitorSvc.default.getDailyReport({
      dateFrom: new Date('2026-05-01'),
      dateTo: new Date('2026-05-15'),
    });

    const opts = mockCacheOrCompute.mock.calls[0][3];
    expect(opts).toBeDefined();
    expect(opts.trackingSet).toBe('tote:v1:report:daily:*');
  });

  it('different filter sets produce different cache keys', async () => {
    mockCacheOrCompute.mockResolvedValue({ summary: {} });

    await monitorSvc.default.getDailyReport({ dateFrom: new Date('2026-05-01'), dateTo: new Date('2026-05-15'), gameId: 'g1' });
    await monitorSvc.default.getDailyReport({ dateFrom: new Date('2026-05-01'), dateTo: new Date('2026-05-15'), gameId: 'g2' });

    expect(mockCacheOrCompute.mock.calls[0][0]).not.toBe(mockCacheOrCompute.mock.calls[1][0]);
  });
});
