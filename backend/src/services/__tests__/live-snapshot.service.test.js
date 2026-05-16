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
