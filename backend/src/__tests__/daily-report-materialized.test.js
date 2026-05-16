/**
 * Phase 14 Plan 14-02 Task 2 — materialized branch correctness against seeded data
 * (FIN-REPORT-01).
 *
 * Seeds a single-provider draw with deterministic ticket amounts, runs the Phase 11
 * computeAndUpsertSales to materialize the aggregate, then calls
 * getDailyReport({ useMaterialized: true }) and asserts the totals match the seed.
 *
 * Also verifies the empty-data P-C path: a date with zero draws returns a clean zero-totals
 * response (not 500, not crash).
 *
 * Run: cd backend && NODE_OPTIONS='--experimental-vm-modules' npx jest --testPathPattern='daily-report-materialized' --runInBand
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const { default: monitorService } = await import('../services/monitor.service.js');
const { prisma } = await import('../lib/prisma.js');
const { computeAndUpsertSales } = await import('../services/draw-financial.service.js');

// Use a unique far-past date so the test is isolated from any real data.
const TEST_DATE = '1998-12-31';
const TEST_PREFIX = `TEST-14-02-MAT-${Date.now()}`;

let gameId;
let drawId;
let cleanupIds = { drawIds: [], ticketIds: [], detailIds: [] };

describe('FIN-REPORT-01: getDailyReport materialized branch correctness', () => {
  beforeAll(async () => {
    // Pick any existing game (we don't create one — fewer FK constraints to worry about).
    const game = await prisma.game.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!game) throw new Error('No game in DB — cannot seed materialized test');
    gameId = game.id;

    // Pick an existing gameItem for the chosen game.
    const item = await prisma.gameItem.findFirst({ where: { gameId, isActive: true } });
    if (!item) throw new Error(`No active gameItem for game ${gameId}`);

    // Seed a single draw on the test date.
    const draw = await prisma.draw.create({
      data: {
        gameId,
        drawDate: new Date(TEST_DATE + 'T00:00:00.000Z'),
        drawTime: '12:00:00',
        status: 'DRAWN',
        winnerItemId: item.id,
        closedAt: new Date(TEST_DATE + 'T11:55:00.000Z'),
        drawnAt:  new Date(TEST_DATE + 'T12:00:00.000Z'),
        prizesProcessed: true,
      },
    });
    drawId = draw.id;
    cleanupIds.drawIds.push(draw.id);

    // Seed a ticket with two TicketDetail rows summing to 100.
    // ticketNumber is an autoincrement Int — let Prisma supply it.
    const ticket = await prisma.ticket.create({
      data: {
        externalTicketId: `${TEST_PREFIX}-T1`,
        drawId: draw.id,
        source: 'TAQUILLA_ONLINE',
        totalAmount: 100,
        totalPrize: 0,
        status: 'ACTIVE',
        details: {
          create: [
            { gameItemId: item.id, amount: 60, multiplier: 50, drawId: draw.id },
            { gameItemId: item.id, amount: 40, multiplier: 50, drawId: draw.id },
          ],
        },
      },
      include: { details: true },
    });
    cleanupIds.ticketIds.push(ticket.id);
    cleanupIds.detailIds.push(...ticket.details.map((d) => d.id));

    // Run Phase 11 SALES materialization for this draw.
    await computeAndUpsertSales(draw.id, draw.closedAt);
  });

  test('totals.totalSales matches the seeded amount (100)', async () => {
    const result = await monitorService.getDailyReport({
      dateFrom: TEST_DATE,
      dateTo:   TEST_DATE,
      useMaterialized: true,
    });

    expect(result.draws).toHaveLength(1);
    expect(result.draws[0].drawId).toBe(drawId);
    expect(result.draws[0].totalSales).toBe(100);
    expect(result.totals.totalSales).toBe(100);
    expect(result.totals.drawCount).toBe(1);
    expect(result.totals.totalTickets).toBe(1);
  });

  test('P-C: empty date returns zero-totals, not 500', async () => {
    const result = await monitorService.getDailyReport({
      dateFrom: '1997-01-01',
      dateTo:   '1997-01-01',
      useMaterialized: true,
    });

    expect(result.draws).toEqual([]);
    expect(result.totals).toEqual({
      totalSales: 0,
      totalPrize: 0,
      totalBalance: 0,
      totalTickets: 0,
      drawCount: 0,
    });
    expect(result.byGame).toEqual([]);
    expect(result.bySource).toEqual([]);
  });

  afterAll(async () => {
    // FK order: TicketDetail → Ticket → DrawFinancialProvider → DrawFinancial → Draw
    if (cleanupIds.detailIds.length > 0) {
      await prisma.ticketDetail.deleteMany({ where: { id: { in: cleanupIds.detailIds } } });
    }
    if (cleanupIds.ticketIds.length > 0) {
      await prisma.ticket.deleteMany({ where: { id: { in: cleanupIds.ticketIds } } });
    }
    if (cleanupIds.drawIds.length > 0) {
      await prisma.drawFinancialProvider.deleteMany({ where: { drawId: { in: cleanupIds.drawIds } } });
      await prisma.drawFinancial.deleteMany({ where: { drawId: { in: cleanupIds.drawIds } } });
      await prisma.draw.deleteMany({ where: { id: { in: cleanupIds.drawIds } } });
    }
    await prisma.$disconnect();
  });
});
