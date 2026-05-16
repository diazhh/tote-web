/**
 * Phase 14 Plan 14-02 Task 3 — D-06 shadow comparison test.
 *
 * Demonstrates that the v1.2 multi-draw attribution bug is CLOSED under
 * `useMaterialized: true` and STILL PRESENT (intentionally — legacy is verbatim)
 * under `useMaterialized: false`. This is the regression net that documents WHY
 * the refactor matters.
 *
 * Test 1 — bug demonstration:
 *   Seeds 2 draws (drawA at 09:00, drawB at 10:00) on a unique far-past date and
 *   a WEBHOOK_PUSH ticket with details spanning BOTH draws (50/50 split via
 *   TicketDetail.drawId). Calls getDailyReport with both flag values and asserts:
 *     - materialized: drawA.totalSales=100, drawB.totalSales=100 (correct)
 *     - legacy:       drawA.totalSales=200, drawB.totalSales=0   (BUG visible)
 *
 * Test 2 — single-provider day sanity:
 *   Picks the captured snapshot date (a real day with only single-provider tickets)
 *   and asserts materialized.totals.totalSales matches legacy.totals.totalSales
 *   within tolerance. Note: 2026-05-14 is a real day where SOME tickets DO have
 *   multi-draw details — the assertion is "totalPrize matches within 0.01"
 *   (prize attribution is unaffected by the bug) rather than total sales.
 *
 * Run: cd backend && NODE_OPTIONS='--experimental-vm-modules' npx jest --testPathPattern='pnl-shadow-comparison' --runInBand
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const { default: monitorService } = await import('../services/monitor.service.js');
const { prisma } = await import('../lib/prisma.js');
const { computeAndUpsertSales } = await import('../services/draw-financial.service.js');

const TEST_DATE = '1999-01-01';
const TEST_PREFIX = `TEST-14-02-SHADOW-${Date.now()}`;

let pushSystemId;
let gameId;
let drawAId;
let drawBId;
const cleanup = {
  drawIds: [],
  ticketIds: [],
  detailIds: [],
  createdApiSystemId: null,
};

describe('D-06 shadow comparison — getDailyReport materialized vs legacy', () => {
  beforeAll(async () => {
    // Use real Virtuales PUSH ApiSystem if present; otherwise create one in the test namespace.
    let push = await prisma.apiSystem.findFirst({ where: { mode: 'PUSH' } });
    if (!push) {
      push = await prisma.apiSystem.create({
        data: {
          name: `${TEST_PREFIX}-system`,
          slug: `shadow-test-${Date.now()}`,
          mode: 'PUSH',
        },
      });
      cleanup.createdApiSystemId = push.id;
    }
    pushSystemId = push.id;

    const game = await prisma.game.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!game) throw new Error('No game in DB — cannot seed shadow test');
    gameId = game.id;

    const item = await prisma.gameItem.findFirst({ where: { gameId, isActive: true } });
    if (!item) throw new Error(`No active gameItem for game ${gameId}`);

    // Seed two draws on the same far-past date but different times.
    const drawA = await prisma.draw.create({
      data: {
        gameId,
        drawDate: new Date(TEST_DATE + 'T00:00:00.000Z'),
        drawTime: '09:00:00',
        status: 'DRAWN',
        winnerItemId: item.id,
        closedAt: new Date(TEST_DATE + 'T08:55:00.000Z'),
        drawnAt:  new Date(TEST_DATE + 'T09:00:00.000Z'),
        prizesProcessed: true,
      },
    });
    drawAId = drawA.id;
    cleanup.drawIds.push(drawA.id);

    const drawB = await prisma.draw.create({
      data: {
        gameId,
        drawDate: new Date(TEST_DATE + 'T00:00:00.000Z'),
        drawTime: '10:00:00',
        status: 'DRAWN',
        winnerItemId: item.id,
        closedAt: new Date(TEST_DATE + 'T09:55:00.000Z'),
        drawnAt:  new Date(TEST_DATE + 'T10:00:00.000Z'),
        prizesProcessed: true,
      },
    });
    drawBId = drawB.id;
    cleanup.drawIds.push(drawB.id);

    // Seed ONE multi-draw webhook ticket: total 200, with two TicketDetail rows
    // (100 → drawA, 100 → drawB). Originating Ticket.drawId = drawA.
    const ticket = await prisma.ticket.create({
      data: {
        externalTicketId: `${TEST_PREFIX}-multidraw`,
        drawId: drawA.id,
        source: 'WEBHOOK_PUSH',
        apiSystemId: pushSystemId,
        totalAmount: 200,
        totalPrize: 0,
        status: 'ACTIVE',
        details: {
          create: [
            { gameItemId: item.id, amount: 100, multiplier: 50, drawId: drawA.id },
            { gameItemId: item.id, amount: 100, multiplier: 50, drawId: drawB.id },
          ],
        },
      },
      include: { details: true },
    });
    cleanup.ticketIds.push(ticket.id);
    cleanup.detailIds.push(...ticket.details.map((d) => d.id));

    // Run Phase 11 SALES materialization for both draws.
    await computeAndUpsertSales(drawA.id, drawA.closedAt);
    await computeAndUpsertSales(drawB.id, drawB.closedAt);
  });

  test('Test 1: multi-draw webhook day — materialized splits correctly (100/100), legacy overcounts originating draw (200/0)', async () => {
    const materialized = await monitorService.getDailyReport({
      dateFrom: TEST_DATE,
      dateTo:   TEST_DATE,
      useMaterialized: true,
    });
    const legacy = await monitorService.getDailyReport({
      dateFrom: TEST_DATE,
      dateTo:   TEST_DATE,
      useMaterialized: false,
    });

    const matA = materialized.draws.find((d) => d.drawId === drawAId);
    const matB = materialized.draws.find((d) => d.drawId === drawBId);
    const legA = legacy.draws.find((d) => d.drawId === drawAId);
    const legB = legacy.draws.find((d) => d.drawId === drawBId);

    // Materialized — correct per-detail attribution
    expect(matA.totalSales).toBe(100);
    expect(matB.totalSales).toBe(100);

    // Legacy — the bug. Originating draw gets the full ticket; target draw gets zero.
    expect(legA.totalSales).toBe(200);
    expect(legB.totalSales).toBe(0);

    // Totals: both branches sum to 200 (the ticket's totalAmount) — the bug is in
    // ATTRIBUTION, not in the day-level total.
    expect(materialized.totals.totalSales).toBe(200);
    expect(legacy.totals.totalSales).toBe(200);
  });

  test('Test 2: prize totals match across branches (prize attribution unaffected by the bug)', async () => {
    const fixtureDate = '2026-05-14';
    const materialized = await monitorService.getDailyReport({
      dateFrom: fixtureDate,
      dateTo:   fixtureDate,
      useMaterialized: true,
    });
    const legacy = await monitorService.getDailyReport({
      dateFrom: fixtureDate,
      dateTo:   fixtureDate,
      useMaterialized: false,
    });

    // Prizes use TicketDetail.prize which is per-detail in both branches — they should match.
    expect(materialized.totals.totalPrize).toBeCloseTo(legacy.totals.totalPrize, 2);

    // Both branches see the same set of draws.
    expect(materialized.totals.drawCount).toBe(legacy.totals.drawCount);
  });

  afterAll(async () => {
    // FK order: TicketDetail → Ticket → DrawFinancialProvider → DrawFinancial → Draw → ApiSystem
    if (cleanup.detailIds.length > 0) {
      await prisma.ticketDetail.deleteMany({ where: { id: { in: cleanup.detailIds } } });
    }
    if (cleanup.ticketIds.length > 0) {
      await prisma.ticket.deleteMany({ where: { id: { in: cleanup.ticketIds } } });
    }
    if (cleanup.drawIds.length > 0) {
      await prisma.drawFinancialProvider.deleteMany({ where: { drawId: { in: cleanup.drawIds } } });
      await prisma.drawFinancial.deleteMany({ where: { drawId: { in: cleanup.drawIds } } });
      await prisma.draw.deleteMany({ where: { id: { in: cleanup.drawIds } } });
    }
    if (cleanup.createdApiSystemId) {
      await prisma.apiSystem.delete({ where: { id: cleanup.createdApiSystemId } });
    }
    await prisma.$disconnect();
  });
});
