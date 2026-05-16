import { jest } from '@jest/globals';

jest.unstable_mockModule('../../lib/prisma.js', () => ({
  prisma: {
    ticket: { findMany: jest.fn() },
    drawLiveSnapshot: { upsert: jest.fn(), findUnique: jest.fn() },
    draw: { findMany: jest.fn() },
    dailyAggregateSnapshot: { upsert: jest.fn(), deleteMany: jest.fn() },
    drawFinancial: { findMany: jest.fn() },
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
});

describe('computeDrawLiveSnapshot', () => {
  it('aggregates totalSales + ticketCount + byProvider from raw tickets', async () => {
    prismaLib.prisma.ticket.findMany.mockResolvedValueOnce([
      { amount: '10.00', apiSystemId: 'sys-a', apiSystem: { name: 'A' } },
      { amount: '5.50',  apiSystemId: 'sys-a', apiSystem: { name: 'A' } },
      { amount: '20.00', apiSystemId: 'sys-b', apiSystem: { name: 'B' } },
      { amount: '7.25',  apiSystemId: null,    apiSystem: null },
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
        { apiSystemId: 'sys-a', name: 'A',         sales: 15.5,  count: 2 },
        { apiSystemId: 'sys-b', name: 'B',         sales: 20,    count: 1 },
        { apiSystemId: null,    name: 'TAQUILLA',  sales: 7.25,  count: 1 },
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
    prismaLib.prisma.drawFinancial.findMany.mockResolvedValueOnce([
      {
        drawId: 'd1',
        totalSales: '100.00',
        totalPrize: '40.00',
        ticketCount: 5,
        draw: { gameId: 'g1' },
        providers: [
          { apiSystemId: 'sys-a', totalSales: '60.00', totalPrize: '20.00', ticketCount: 3 },
          { apiSystemId: null,    totalSales: '40.00', totalPrize: '20.00', ticketCount: 2 },
        ],
      },
    ]);
    prismaLib.prisma.ticket.findMany.mockResolvedValue([]); // unused in this branch
    prismaLib.prisma.dailyAggregateSnapshot.deleteMany.mockResolvedValueOnce({ count: 0 });
    prismaLib.prisma.dailyAggregateSnapshot.upsert.mockResolvedValue({});

    // Stub the live-side lookup
    const liveSnapMock = jest.fn().mockResolvedValueOnce({
      drawId: 'd2',
      gameId: 'g1',
      totalSales: 50,
      ticketCount: 2,
      byProvider: [{ apiSystemId: 'sys-b', name: 'B', sales: 50, count: 2 }],
    });
    svc.__setLiveSnapResolver(liveSnapMock); // implementation must expose this test seam

    await svc.computeDailyAggregateSnapshot(new Date('2026-05-16'));

    // Expect at least 3 upsert calls (sys-a from DRAWN, taquilla from DRAWN, sys-b from CLOSED)
    expect(prismaLib.prisma.dailyAggregateSnapshot.upsert).toHaveBeenCalledTimes(3);
  });

  it('clears previous rows for the date before writing', async () => {
    prismaLib.prisma.draw.findMany.mockResolvedValueOnce([]);
    prismaLib.prisma.drawFinancial.findMany.mockResolvedValueOnce([]);
    prismaLib.prisma.dailyAggregateSnapshot.deleteMany.mockResolvedValueOnce({ count: 7 });

    await svc.computeDailyAggregateSnapshot(new Date('2026-05-16'));

    expect(prismaLib.prisma.dailyAggregateSnapshot.deleteMany).toHaveBeenCalledWith({
      where: { date: expect.any(Date) },
    });
  });
});
