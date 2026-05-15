/**
 * Tests for draw-financial.service.js (Phase 11, Plan 11-02).
 *
 * Strategy: mocked Prisma client (jest.unstable_mockModule) — matches the dominant pattern
 * in this directory (quota.service.test.js, monitor.service.test.js). The tests model the
 * SQL/Prisma behaviour by feeding mock return values that simulate real DB queries:
 *
 *   - test 1: sales aggregation excludes CANCELLED tickets (D-17).
 *   - test 2: re-running SALES doesn't duplicate the DrawFinancial row (idempotency).
 *   - test 3: PRIZES throws PrizesNotProcessedError when prizesProcessed=false (F-1).
 *   - test 4: PRIZES writes totalPrize/utility/totalizedAt from the passed-in argument.
 *   - test 5: NULL-apiSystemId provider rows use explicit findFirst + update/create (D-08),
 *             not prisma.upsert — verified by counting calls to .create vs .update across reruns.
 *   - test 6: F-3 fix proved — multi-draw Ticket whose TicketDetails point to two
 *             different drawIds aggregates the right amount into EACH draw.
 */

import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

// ----- Mock prisma -----
const mockPrisma = {
  draw: {
    findUnique: jest.fn(),
  },
  ticketDetail: {
    aggregate: jest.fn(),
    findMany: jest.fn(),
  },
  drawFinancial: {
    upsert: jest.fn(),
  },
  drawFinancialProvider: {
    findFirst: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  $queryRaw: jest.fn(),
};

jest.unstable_mockModule('../../lib/prisma.js', () => ({ prisma: mockPrisma }));
jest.unstable_mockModule('../../lib/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('draw-financial.service — computeAndUpsertSales (FIN-AGG-01..04)', () => {
  let computeAndUpsertSales;
  let PrizesNotProcessedError;

  beforeAll(async () => {
    ({ computeAndUpsertSales, PrizesNotProcessedError } = await import(
      '../draw-financial.service.js'
    ));
  });

  beforeEach(() => jest.clearAllMocks());

  // ---------- TEST 1 ----------
  test('aggregates totalSales as SUM(TicketDetail.amount) of non-CANCELLED tickets only (D-17)', async () => {
    // Simulated draw with 3 tickets, one CANCELLED. The mocked aggregate returns the
    // sum of the two non-cancelled (5.00 + 7.50 = 12.50). The CANCELLED-filter is
    // applied via the `where: { ticket: { status: { not: 'CANCELLED' } } }` clause —
    // we assert that the service passes that clause to Prisma.
    mockPrisma.ticketDetail.aggregate.mockResolvedValue({ _sum: { amount: '12.50' } });
    mockPrisma.ticketDetail.findMany.mockResolvedValue([
      { ticketId: 't1' },
      { ticketId: 't2' },
    ]); // 2 distinct non-cancelled tickets
    mockPrisma.$queryRaw.mockResolvedValue([]); // no providers in this simple case
    mockPrisma.drawFinancial.upsert.mockResolvedValue({});

    const result = await computeAndUpsertSales('draw-1', new Date('2026-05-15T18:00:00Z'));

    // Assert CANCELLED filter was used (D-17)
    const aggCall = mockPrisma.ticketDetail.aggregate.mock.calls[0][0];
    expect(aggCall.where).toEqual({
      drawId: 'draw-1',
      ticket: { status: { not: 'CANCELLED' } },
    });
    expect(aggCall._sum).toEqual({ amount: true });

    // Assert the distinct-ticket count query also has the CANCELLED filter (F-3 fix)
    const findCall = mockPrisma.ticketDetail.findMany.mock.calls[0][0];
    expect(findCall.where).toEqual({
      drawId: 'draw-1',
      ticket: { status: { not: 'CANCELLED' } },
    });
    expect(findCall.distinct).toEqual(['ticketId']);

    // Assert upsert wrote the aggregated values
    const upsertCall = mockPrisma.drawFinancial.upsert.mock.calls[0][0];
    expect(upsertCall.where).toEqual({ drawId: 'draw-1' });
    expect(upsertCall.update.totalSales).toBe('12.50');
    expect(upsertCall.update.ticketCount).toBe(2);
    expect(upsertCall.create.totalSales).toBe('12.50');
    expect(upsertCall.create.ticketCount).toBe(2);

    expect(result).toEqual({
      drawId: 'draw-1',
      phase: 'SALES',
      totalSales: '12.50',
      ticketCount: 2,
    });
  });

  // ---------- TEST 2 ----------
  test('idempotent — re-running SALES on the same drawId calls prisma.drawFinancial.upsert again with the same WHERE (no duplicate insert) (FIN-AGG-06)', async () => {
    mockPrisma.ticketDetail.aggregate.mockResolvedValue({ _sum: { amount: '100.00' } });
    mockPrisma.ticketDetail.findMany.mockResolvedValue([{ ticketId: 't1' }]);
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockPrisma.drawFinancial.upsert.mockResolvedValue({});

    await computeAndUpsertSales('draw-2', null);
    await computeAndUpsertSales('draw-2', null);

    // Both runs went through prisma.drawFinancial.upsert (Prisma upsert is itself
    // idempotent for single-column unique). No raw create() was called.
    expect(mockPrisma.drawFinancial.upsert).toHaveBeenCalledTimes(2);
    // Same WHERE both times — proves we're targeting the same unique row
    expect(mockPrisma.drawFinancial.upsert.mock.calls[0][0].where).toEqual({ drawId: 'draw-2' });
    expect(mockPrisma.drawFinancial.upsert.mock.calls[1][0].where).toEqual({ drawId: 'draw-2' });
  });

  // ---------- TEST 5 (NULL-apiSystemId D-08 idempotency) ----------
  test('NULL apiSystemId rows go through findFirst+update/create — never prisma.upsert (D-08)', async () => {
    mockPrisma.ticketDetail.aggregate.mockResolvedValue({ _sum: { amount: '50.00' } });
    mockPrisma.ticketDetail.findMany.mockResolvedValue([{ ticketId: 't1' }]);

    // $queryRaw returns one provider row with apiSystemId = null (TAQUILLA_ONLINE).
    mockPrisma.$queryRaw.mockResolvedValue([
      { apiSystemId: null, totalSales: '50.00', ticketCount: 1 },
    ]);
    mockPrisma.drawFinancial.upsert.mockResolvedValue({});

    // First run: findFirst returns null → create
    mockPrisma.drawFinancialProvider.findFirst.mockResolvedValueOnce(null);
    mockPrisma.drawFinancialProvider.create.mockResolvedValueOnce({ id: 'dfp-1' });

    await computeAndUpsertSales('draw-3', null);

    expect(mockPrisma.drawFinancialProvider.findFirst).toHaveBeenCalledWith({
      where: { drawId: 'draw-3', apiSystemId: null },
    });
    expect(mockPrisma.drawFinancialProvider.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.drawFinancialProvider.update).not.toHaveBeenCalled();

    // Second run: findFirst returns the existing row → update (no duplicate insert)
    mockPrisma.drawFinancialProvider.findFirst.mockResolvedValueOnce({ id: 'dfp-1' });
    mockPrisma.drawFinancialProvider.update.mockResolvedValueOnce({ id: 'dfp-1' });

    await computeAndUpsertSales('draw-3', null);

    expect(mockPrisma.drawFinancialProvider.findFirst).toHaveBeenCalledTimes(2);
    expect(mockPrisma.drawFinancialProvider.create).toHaveBeenCalledTimes(1); // not 2
    expect(mockPrisma.drawFinancialProvider.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.drawFinancialProvider.update.mock.calls[0][0]).toEqual({
      where: { id: 'dfp-1' },
      data: { totalSales: '50.00', ticketCount: 1 },
    });
  });

  // ---------- TEST 6 (F-3 multi-draw fix) ----------
  test('multi-draw ticket: aggregation via TicketDetail.drawId attributes the right amount to EACH draw (F-3 fix, FIN-AGG-03)', async () => {
    // Simulate a single Ticket with two TicketDetails — one for draw-A (amount=10),
    // one for draw-B (amount=20). The service queries each draw separately;
    // each query's where:{drawId} restricts the SUM to that draw's detail.
    //
    // If the service incorrectly grouped by Ticket.drawId (the F-3 bug), draw-A would
    // see both details (30 total) and draw-B would see zero. Below we prove the service
    // queries by td.drawId — so draw-A sees 10 and draw-B sees 20, summing to 30 across.

    // ----- draw-A run -----
    mockPrisma.ticketDetail.aggregate.mockResolvedValueOnce({ _sum: { amount: '10.00' } });
    mockPrisma.ticketDetail.findMany.mockResolvedValueOnce([{ ticketId: 't-shared' }]);
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);
    mockPrisma.drawFinancial.upsert.mockResolvedValueOnce({});

    const rA = await computeAndUpsertSales('draw-A', null);

    // ----- draw-B run -----
    mockPrisma.ticketDetail.aggregate.mockResolvedValueOnce({ _sum: { amount: '20.00' } });
    mockPrisma.ticketDetail.findMany.mockResolvedValueOnce([{ ticketId: 't-shared' }]);
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);
    mockPrisma.drawFinancial.upsert.mockResolvedValueOnce({});

    const rB = await computeAndUpsertSales('draw-B', null);

    expect(rA.totalSales).toBe('10.00');
    expect(rB.totalSales).toBe('20.00');

    // Sum across both draws = 30, matching SUM of all TicketDetail.amount.
    const total = Number(rA.totalSales) + Number(rB.totalSales);
    expect(total).toBe(30);

    // Verify each call passed the per-draw drawId (proves we aggregate by TicketDetail.drawId,
    // not by joining via Ticket.drawId).
    const calls = mockPrisma.ticketDetail.aggregate.mock.calls;
    expect(calls[0][0].where.drawId).toBe('draw-A');
    expect(calls[1][0].where.drawId).toBe('draw-B');
  });
});

describe('draw-financial.service — computeAndUpsertPrizes (FIN-AGG-04, FIN-AGG-07)', () => {
  let computeAndUpsertPrizes;
  let PrizesNotProcessedError;

  beforeAll(async () => {
    ({ computeAndUpsertPrizes, PrizesNotProcessedError } = await import(
      '../draw-financial.service.js'
    ));
  });

  beforeEach(() => jest.clearAllMocks());

  // ---------- TEST 3 ----------
  test('throws PrizesNotProcessedError when Draw.prizesProcessed = false; does NOT mutate DrawFinancial.totalizedAt (F-1)', async () => {
    mockPrisma.draw.findUnique.mockResolvedValue({ prizesProcessed: false });

    await expect(computeAndUpsertPrizes('draw-x', new Date())).rejects.toBeInstanceOf(
      PrizesNotProcessedError,
    );

    // No mutation to DrawFinancial — the upsert must NOT have been called.
    expect(mockPrisma.drawFinancial.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.drawFinancialProvider.findFirst).not.toHaveBeenCalled();
  });

  // ---------- TEST 4 ----------
  test('after prizesProcessed=true writes totalPrize, utility=totalSales-totalPrize, totalizedAt = the passed-in arg (not now())', async () => {
    const totalizedAt = new Date('2026-05-15T20:30:00Z');

    mockPrisma.draw.findUnique.mockResolvedValue({ prizesProcessed: true });
    mockPrisma.ticketDetail.aggregate.mockResolvedValue({
      _sum: { amount: '100.00', prize: '30.00' },
    });
    mockPrisma.ticketDetail.findMany.mockResolvedValue([{ ticketId: 't1' }]);
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockPrisma.drawFinancial.upsert.mockResolvedValue({});

    const result = await computeAndUpsertPrizes('draw-y', totalizedAt);

    const upsertCall = mockPrisma.drawFinancial.upsert.mock.calls[0][0];
    expect(upsertCall.where).toEqual({ drawId: 'draw-y' });
    // Update path writes totalPrize + utility + totalizedAt. closedAt is NOT in update
    // (preserves what phase SALES wrote).
    expect(upsertCall.update.totalPrize).toBe('30.00');
    expect(upsertCall.update.utility).toBe('70.00');
    expect(upsertCall.update.totalizedAt).toBe(totalizedAt);
    expect(upsertCall.update).not.toHaveProperty('closedAt');

    expect(result).toEqual({
      drawId: 'draw-y',
      phase: 'PRIZES',
      totalSales: '100.00',
      totalPrize: '30.00',
      utility: '70.00',
      totalizedAt,
    });
  });
});
