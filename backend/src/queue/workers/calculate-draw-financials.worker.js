/**
 * Phase 11 — calculate-draw-financials pg-boss worker (D-13, D-14, F-1, F-13).
 *
 * Two-phase routing by job.data.phase:
 *   - 'SALES'  → fires on close (best-effort from close-and-ingest, Plan 11-03).
 *                Upserts totalSales / ticketCount / closedAt and per-provider sales rows.
 *   - 'PRIZES' → fires alongside step-calculate-stats after prizesProcessed=true (Plan 11-03).
 *                Upserts totalPrize / utility / totalizedAt and per-provider prize rows.
 *
 * Worker is a thin router that delegates aggregation to draw-financial.service.js.
 * Fail-fast PrizesNotProcessedError surfaces to pg-boss retry/dead-letter — no silent
 * zero-prize writes (F-1, FIN-AGG-07).
 */

import { prisma } from '../../lib/prisma.js';
import logger from '../../lib/logger.js';
import { computeAndUpsertSales, computeAndUpsertPrizes, PrizesNotProcessedError } from '../../services/draw-financial.service.js';
import { invalidate, invalidatePattern } from '../../lib/redis.js';

export async function calculateDrawFinancialsWorker(jobs) {
  // pg-boss v10 siempre llama al handler con un array de jobs
  const job = Array.isArray(jobs) ? jobs[0] : jobs;
  const { drawId, phase } = job.data;

  const draw = await prisma.draw.findUnique({
    where: { id: drawId },
    select: { prizesProcessed: true, closedAt: true, drawnAt: true },
  });
  if (!draw) throw new Error(`Draw ${drawId} no encontrado`);

  let result;
  switch (phase) {
    case 'SALES': {
      logger.info(`[calculate-draw-financials] phase=SALES drawId=${drawId}`);
      await computeAndUpsertSales(drawId, draw.closedAt);
      result = { success: true, drawId, phase: 'SALES' };
      break;
    }

    case 'PRIZES': {
      // F-1 / D-14 — fail fast at the worker boundary so the error is visible in
      // pg-boss job state. Do NOT call the service when prizesProcessed=false.
      if (draw.prizesProcessed === false) {
        throw new PrizesNotProcessedError(drawId);
      }
      logger.info(`[calculate-draw-financials] phase=PRIZES drawId=${drawId}`);
      await computeAndUpsertPrizes(drawId, draw.drawnAt);
      result = { success: true, drawId, phase: 'PRIZES' };
      break;
    }

    default:
      throw new Error(`[calculate-draw-financials] unknown phase: ${phase}`);
  }

  // v1.4 — cache invalidation. Best-effort; failures must NOT roll back the
  // authoritative DrawFinancial write that just committed.
  try {
    await invalidate(`tote:v1:draw:${drawId}:snap`);
    // Monitor caches (banca/item stats) — invalidar siempre, sales-only y
    // prizes-final ambos cambian los números visibles en /admin/monitor.
    await invalidate(`tote:v1:banca:stats:${drawId}`);
    await invalidate(`tote:v1:items:stats:full:${drawId}`);
    await invalidatePattern(`tote:v1:items:stats:${drawId}:*`);
    if (phase === 'PRIZES') {
      await prisma.drawLiveSnapshot.deleteMany({ where: { drawId } });
      await invalidatePattern('tote:v1:report:daily:*');
    }
  } catch (err) {
    logger.warn(`[calculate-draw-financials] cache invalidation failed drawId=${drawId}: ${err.message}`);
  }

  return result;
}
