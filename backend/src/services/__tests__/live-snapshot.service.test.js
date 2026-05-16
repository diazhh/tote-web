import { jest } from '@jest/globals';

jest.unstable_mockModule('../../lib/prisma.js', () => ({
  prisma: {
    ticket: { findMany: jest.fn() },
    drawLiveSnapshot: { upsert: jest.fn(), findUnique: jest.fn() },
    draw: { findMany: jest.fn() },
    dailyAggregateSnapshot: { createMany: jest.fn(), deleteMany: jest.fn() },
    drawFinancial: { findMany: jest.fn() },
    drawFinancialProvider: { findMany: jest.fn() },
  },
}));

let svc;
let prismaLib;

beforeAll(async () => {
  prismaLib = await import('../../lib/prisma.js');
  svc = await import('../live-snapshot.service.js');
});

beforeEach(() => {
  jest.clearAllMocks();
  svc.__setLiveSnapResolver(null); // restore default
});

describe('computeDrawLiveSnapshot', () => {
  it('aggregates totalSales + ticketCount + byProvider from raw tickets', async () => {
    prismaLib.prisma.ticket.findMany.mockResolvedValueOnce([
      { totalAmount: '10.00', source: 'WEBHOOK_PUSH',    apiSystemId: 'sys-a', apiSystem: { name: 'A' } },
      { totalAmount: '5.50',  source: 'WEBHOOK_PUSH',    apiSystemId: 'sys-a', apiSystem: { name: 'A' } },
      { totalAmount: '20.00', source: 'EXTERNAL_SCRAPE', apiSystemId: 'sys-b', apiSystem: { name: 'B' } },
      { totalAmount: '7.25',  source: 'TAQUILLA_ONLINE', apiSystemId: null,    apiSystem: null },
    ]);
    prismaLib.prisma.drawLiveSnapshot.upsert.mockResolvedValueOnce({});

    await svc.computeDrawLiveSnapshot('draw-1');

    expect(prismaLib.prisma.drawLiveSnapshot.upsert).toHaveBeenCalledTimes(1);
    const args = prismaLib.prisma.drawLiveSnapshot.upsert.mock.calls[0][0];
    expect(args.where).toEqual({ drawId: 'draw-1' });
    expect(Number(args.create.totalSales)).toBeCloseTo(42.75, 2);
    expect(args.create.ticketCount).toBe(4);
    expect(args.create.byProvider).toEqual(
      expect.arrayContaining([
        { apiSystemId: 'sys-a', source: 'WEBHOOK_PUSH',    name: 'A',        sales: 15.5, count: 2 },
        { apiSystemId: 'sys-b', source: 'EXTERNAL_SCRAPE', name: 'B',        sales: 20,   count: 1 },
        { apiSystemId: null,    source: 'TAQUILLA_ONLINE', name: 'TAQUILLA', sales: 7.25, count: 1 },
      ]),
    );
  });

  it('handles zero tickets gracefully', async () => {
    prismaLib.prisma.ticket.findMany.mockResolvedValueOnce([]);
    prismaLib.prisma.drawLiveSnapshot.upsert.mockResolvedValueOnce({});

    await svc.computeDrawLiveSnapshot('draw-empty');

    const args = prismaLib.prisma.drawLiveSnapshot.upsert.mock.calls[0][0];
    expect(Number(args.create.totalSales)).toBe(0);
    expect(args.create.ticketCount).toBe(0);
    expect(args.create.byProvider).toEqual([]);
  });

  it('excludes CANCELLED tickets via the where clause', async () => {
    prismaLib.prisma.ticket.findMany.mockResolvedValueOnce([]);
    prismaLib.prisma.drawLiveSnapshot.upsert.mockResolvedValueOnce({});

    await svc.computeDrawLiveSnapshot('draw-x');

    const findArgs = prismaLib.prisma.ticket.findMany.mock.calls[0][0];
    expect(findArgs.where.status).toEqual({ not: 'CANCELLED' });
    expect(findArgs.where.drawId).toBe('draw-x');
  });
});

describe('computeDailyAggregateSnapshot', () => {
  it('aggregates by (gameId, source, apiSystemId), combining DrawFinancial + DrawLiveSnapshot for the date', async () => {
    // 2 draws today: one DRAWN (uses DrawFinancial), one CLOSED (uses DrawLiveSnapshot)
    prismaLib.prisma.draw.findMany.mockResolvedValueOnce([
      { id: 'd1', gameId: 'g1', status: 'DRAWN' },
      { id: 'd2', gameId: 'g1', status: 'CLOSED' },
    ]);
    prismaLib.prisma.drawFinancialProvider.findMany.mockResolvedValueOnce([
      { drawId: 'd1', apiSystemId: 'sys-a', totalSales: '60.00', totalPrize: '20.00', ticketCount: 3, apiSystem: { mode: 'PUSH' }, draw: { gameId: 'g1' } },
      { drawId: 'd1', apiSystemId: null,    totalSales: '40.00', totalPrize: '20.00', ticketCount: 2, apiSystem: null,             draw: { gameId: 'g1' } },
    ]);
    prismaLib.prisma.dailyAggregateSnapshot.deleteMany.mockResolvedValueOnce({ count: 0 });
    prismaLib.prisma.dailyAggregateSnapshot.createMany.mockResolvedValueOnce({ count: 3 });

    // Stub the live-side lookup
    const liveSnapMock = jest.fn().mockResolvedValueOnce({
      drawId: 'd2',
      gameId: 'g1',
      totalSales: 50,
      ticketCount: 2,
      byProvider: [{ apiSystemId: 'sys-b', source: 'EXTERNAL_SCRAPE', name: 'B', sales: 50, count: 2 }],
    });
    svc.__setLiveSnapResolver(liveSnapMock);

    await svc.computeDailyAggregateSnapshot(new Date('2026-05-16'));

    expect(prismaLib.prisma.dailyAggregateSnapshot.createMany).toHaveBeenCalledTimes(1);
    const rows = prismaLib.prisma.dailyAggregateSnapshot.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(3);
    const bucketKeys = rows.map((r) => `${r.gameId}|${r.source}|${r.apiSystemId}`);
    expect(new Set(bucketKeys).size).toBe(3);
    expect(bucketKeys).toEqual(expect.arrayContaining([
      'g1|WEBHOOK_PUSH|sys-a',
      'g1|TAQUILLA_ONLINE|null',
      'g1|EXTERNAL_SCRAPE|sys-b',
    ]));

    const sysA = rows.find((r) => r.apiSystemId === 'sys-a');
    expect(Number(sysA.totalSales)).toBe(60);
    expect(Number(sysA.prizeTotal)).toBe(20);
    expect(sysA.ticketCount).toBe(3);

    const taquilla = rows.find((r) => r.apiSystemId === null);
    expect(Number(taquilla.totalSales)).toBe(40);
    expect(taquilla.source).toBe('TAQUILLA_ONLINE');

    const sysB = rows.find((r) => r.apiSystemId === 'sys-b');
    expect(Number(sysB.totalSales)).toBe(50);
    expect(Number(sysB.prizeTotal)).toBe(0);
    expect(sysB.ticketCount).toBe(2);
  });

  it('clears previous rows for the date before writing', async () => {
    prismaLib.prisma.draw.findMany.mockResolvedValueOnce([]);
    prismaLib.prisma.drawFinancialProvider.findMany.mockResolvedValueOnce([]);
    prismaLib.prisma.dailyAggregateSnapshot.deleteMany.mockResolvedValueOnce({ count: 7 });

    await svc.computeDailyAggregateSnapshot(new Date('2026-05-16'));

    expect(prismaLib.prisma.dailyAggregateSnapshot.deleteMany).toHaveBeenCalledWith({
      where: { date: expect.any(Date) },
    });
  });
});
