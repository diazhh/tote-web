/**
 * Phase 11 — DrawFinancial materialized aggregate service (FIN-AGG-01..04, FIN-AGG-06, FIN-AGG-07).
 *
 * Two-phase pipeline:
 *   - computeAndUpsertSales(drawId, closedAt)   → upserts totalSales/ticketCount/closedAt
 *   - computeAndUpsertPrizes(drawId, totalizedAt) → upserts totalPrize/utility/totalizedAt
 *
 * CRITICAL DESIGN NOTES:
 *   1. Aggregation key is TicketDetail.drawId, NOT Ticket.drawId (F-3 fix in PITFALLS.md).
 *      A single Ticket may carry TicketDetails for multiple draws (multi-draw webhook tickets).
 *      Aggregating via Ticket.drawId overcounts the originating draw and undercounts the
 *      target draws. This service inverts the accounting-report.service.js anti-pattern.
 *
 *   2. CANCELLED Tickets are excluded via `ticket.status != 'CANCELLED'` (D-17).
 *
 *   3. PrizesNotProcessedError is thrown when phase PRIZES is invoked on a draw whose
 *      prizesProcessed flag is still false (F-1 / D-14 / FIN-AGG-07). Worker-level retry
 *      surfaces this to dead-letter — never silently writes zero-prize rows.
 *
 *   4. DrawFinancialProvider uses explicit findFirst + update/create (D-08), NOT
 *      prisma.upsert — Postgres treats NULLs as distinct in unique indices, so the
 *      Prisma upsert on @@unique([drawId, apiSystemId]) would always INSERT when
 *      apiSystemId IS NULL (TAQUILLA_ONLINE house bucket).
 *
 *   5. Module exports are named (computeAndUpsertSales, computeAndUpsertPrizes,
 *      PrizesNotProcessedError) — no default export. Plan 11-04 (backfill) and the
 *      Phase 11 worker import them by name.
 */

import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

/**
 * Thrown by computeAndUpsertPrizes when Draw.prizesProcessed === false.
 * Worker rethrows so pg-boss retry/dead-letter machinery surfaces the issue to ops.
 */
export class PrizesNotProcessedError extends Error {
  constructor(drawId) {
    super(`Draw ${drawId} prizes not processed — cannot compute totalPrize/utility`);
    this.name = 'PrizesNotProcessedError';
  }
}

/**
 * Coerce a Prisma Decimal | number | string | null/undefined into a JS number string for
 * Decimal column storage. Returns '0' for null/undefined. Pass-through for everything else
 * so Prisma's Decimal serialization handles precision (no Number()/parseFloat()).
 */
function decOrZero(v) {
  if (v === null || v === undefined) return '0';
  return v;
}

/**
 * Phase SALES: aggregates TicketDetail rows for the given draw and upserts DrawFinancial
 * (totalSales, ticketCount, closedAt) + per-provider DrawFinancialProvider rows (totalSales,
 * ticketCount only — totalPrize stays at its default 0 until phase PRIZES).
 *
 * Idempotent — re-running on the same drawId updates the existing row(s).
 *
 * @param {string} drawId
 * @param {Date|null} closedAt - the Draw.closedAt timestamp at trigger time
 * @returns {Promise<{drawId: string, phase: 'SALES', totalSales: any, ticketCount: number}>}
 */
export const computeAndUpsertSales = async (drawId, closedAt) => {
  // ----- 1. Whole-draw aggregation via TicketDetail.drawId (F-3 fix) -----
  const salesAgg = await prisma.ticketDetail.aggregate({
    where: {
      drawId,
      ticket: { status: { not: 'CANCELLED' } },
    },
    _sum: { amount: true },
  });
  const totalSalesSum = decOrZero(salesAgg._sum.amount);

  const distinctTickets = await prisma.ticketDetail.findMany({
    where: { drawId, ticket: { status: { not: 'CANCELLED' } } },
    distinct: ['ticketId'],
    select: { ticketId: true },
  });
  const ticketCount = distinctTickets.length;

  // ----- 2. Per-provider breakdown via raw SQL (groupBy across nested relation
  //          requires $queryRaw — Prisma's groupBy can't group by ticket.apiSystemId). -----
  const byProvider = await prisma.$queryRaw`
    SELECT t."apiSystemId"                          AS "apiSystemId",
           SUM(td.amount)::numeric(12,2)            AS "totalSales",
           COUNT(DISTINCT td."ticketId")::int       AS "ticketCount"
    FROM   "TicketDetail" td
    JOIN   "Ticket" t ON t.id = td."ticketId"
    WHERE  td."drawId" = ${drawId}
      AND  t.status != 'CANCELLED'
    GROUP  BY t."apiSystemId"
  `;

  // ----- 3. Upsert the whole-draw row (single-column unique, prisma.upsert is safe here). -----
  await prisma.drawFinancial.upsert({
    where: { drawId },
    update: { totalSales: totalSalesSum, ticketCount, closedAt },
    create: { drawId, totalSales: totalSalesSum, ticketCount, closedAt },
  });

  // ----- 4. Per-provider upserts via explicit findFirst + update/create (D-08). -----
  for (const row of byProvider) {
    const apiSystemId = row.apiSystemId ?? null;
    const existing = await prisma.drawFinancialProvider.findFirst({
      where: { drawId, apiSystemId },
    });
    if (existing) {
      await prisma.drawFinancialProvider.update({
        where: { id: existing.id },
        data: { totalSales: row.totalSales, ticketCount: row.ticketCount },
      });
    } else {
      await prisma.drawFinancialProvider.create({
        data: {
          drawId,
          apiSystemId,
          totalSales: row.totalSales,
          ticketCount: row.ticketCount,
        },
      });
    }
  }

  logger.info(
    `[draw-financial] phase=SALES drawId=${drawId} totalSales=${totalSalesSum} ticketCount=${ticketCount}`,
  );
  return { drawId, phase: 'SALES', totalSales: totalSalesSum, ticketCount };
};

/**
 * Phase PRIZES: re-aggregates TicketDetail (sales + prizes) from a single consistent
 * snapshot, then upserts DrawFinancial (totalPrize, utility, totalizedAt) and the
 * per-provider DrawFinancialProvider rows' totalPrize.
 *
 * Throws PrizesNotProcessedError when Draw.prizesProcessed === false.
 *
 * @param {string} drawId
 * @param {Date|null} totalizedAt - timestamp written into DrawFinancial.totalizedAt
 *        (Draw.drawnAt for the live worker, also Draw.drawnAt for the backfill — D-05)
 * @returns {Promise<{drawId: string, phase: 'PRIZES', totalSales: any, totalPrize: any, utility: string, totalizedAt: any}>}
 */
export const computeAndUpsertPrizes = async (drawId, totalizedAt) => {
  // ----- 1. Guard: prizesProcessed must be true (F-1, FIN-AGG-07). -----
  const draw = await prisma.draw.findUnique({
    where: { id: drawId },
    select: { prizesProcessed: true },
  });
  if (!draw) {
    // Defensive — worker also pre-checks but the service can be called by the backfill.
    throw new Error(`Draw ${drawId} no encontrado`);
  }
  if (draw.prizesProcessed === false) {
    throw new PrizesNotProcessedError(drawId);
  }

  // ----- 2. Aggregate sales AND prizes from the same TicketDetail snapshot -----
  const agg = await prisma.ticketDetail.aggregate({
    where: { drawId, ticket: { status: { not: 'CANCELLED' } } },
    _sum: { amount: true, prize: true },
  });
  const totalSales = decOrZero(agg._sum.amount);
  const totalPrize = decOrZero(agg._sum.prize);

  // Recompute distinct ticketCount from TicketDetail for symmetry with phase SALES
  // (write-through to DrawFinancial so a PRIZES-only run still has a sensible ticketCount).
  const distinctTickets = await prisma.ticketDetail.findMany({
    where: { drawId, ticket: { status: { not: 'CANCELLED' } } },
    distinct: ['ticketId'],
    select: { ticketId: true },
  });
  const ticketCount = distinctTickets.length;

  // utility = totalSales - totalPrize, computed with Decimal arithmetic.
  // Both inputs are Prisma Decimal (or '0' string) — Number() drift on small numbers is
  // acceptable for the (12,2) target, but we go through the safer toFixed(2) path so
  // we never write a value Postgres has to round.
  const utility = (
    Number(totalSales.toString ? totalSales.toString() : totalSales) -
    Number(totalPrize.toString ? totalPrize.toString() : totalPrize)
  ).toFixed(2);

  // ----- 3. Per-provider breakdown — sum BOTH amount and prize together. -----
  const byProvider = await prisma.$queryRaw`
    SELECT t."apiSystemId"                          AS "apiSystemId",
           SUM(td.amount)::numeric(12,2)            AS "totalSales",
           SUM(td.prize)::numeric(12,2)             AS "totalPrize",
           COUNT(DISTINCT td."ticketId")::int       AS "ticketCount"
    FROM   "TicketDetail" td
    JOIN   "Ticket" t ON t.id = td."ticketId"
    WHERE  td."drawId" = ${drawId}
      AND  t.status != 'CANCELLED'
    GROUP  BY t."apiSystemId"
  `;

  // ----- 4. Upsert DrawFinancial: write totalSales, totalPrize, utility,
  //          ticketCount, totalizedAt. Re-escribir sales+ticketCount aquí
  //          captura los tickets late-arriving entre SALES y PRIZES (sync 5min
  //          de SRQ/Maxplay puede traer tickets después del cierre).
  //          NO sobreescribe closedAt (lo preserva SALES). -----
  await prisma.drawFinancial.upsert({
    where: { drawId },
    update: { totalSales, totalPrize, utility, ticketCount, totalizedAt },
    create: {
      drawId,
      totalSales,
      totalPrize,
      utility,
      ticketCount,
      closedAt: null,
      totalizedAt,
    },
  });

  // ----- 5. Per-provider upserts via D-08 pattern. Re-escribir totalSales y
  //          ticketCount además del totalPrize — captura tickets late-arriving
  //          igual que el upsert de DrawFinancial arriba. -----
  for (const row of byProvider) {
    const apiSystemId = row.apiSystemId ?? null;
    const existing = await prisma.drawFinancialProvider.findFirst({
      where: { drawId, apiSystemId },
    });
    if (existing) {
      await prisma.drawFinancialProvider.update({
        where: { id: existing.id },
        data: {
          totalSales: row.totalSales,
          totalPrize: row.totalPrize,
          ticketCount: row.ticketCount,
        },
      });
    } else {
      // Defensive — provider absent at SALES time but present here. Create with full set.
      await prisma.drawFinancialProvider.create({
        data: {
          drawId,
          apiSystemId,
          totalSales: row.totalSales,
          totalPrize: row.totalPrize,
          ticketCount: row.ticketCount,
        },
      });
    }
  }

  logger.info(
    `[draw-financial] phase=PRIZES drawId=${drawId} totalSales=${totalSales} totalPrize=${totalPrize} utility=${utility}`,
  );
  return { drawId, phase: 'PRIZES', totalSales, totalPrize, utility, totalizedAt };
};
