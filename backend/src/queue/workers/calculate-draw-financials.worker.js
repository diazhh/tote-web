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

export async function calculateDrawFinancialsWorker(jobs) {
  // pg-boss v10 siempre llama al handler con un array de jobs
  const job = Array.isArray(jobs) ? jobs[0] : jobs;
  const { drawId, phase } = job.data;

  const draw = await prisma.draw.findUnique({
    where: { id: drawId },
    select: { prizesProcessed: true, closedAt: true, drawnAt: true },
  });
  if (!draw) throw new Error(`Draw ${drawId} no encontrado`);

  switch (phase) {
    case 'SALES': {
      logger.info(`[calculate-draw-financials] phase=SALES drawId=${drawId}`);
      await computeAndUpsertSales(drawId, draw.closedAt);
      return { success: true, drawId, phase: 'SALES' };
    }

    case 'PRIZES': {
      // F-1 / D-14 — fail fast at the worker boundary so the error is visible in
      // pg-boss job state. Do NOT call the service when prizesProcessed=false.
      if (draw.prizesProcessed === false) {
        throw new PrizesNotProcessedError(drawId);
      }
      logger.info(`[calculate-draw-financials] phase=PRIZES drawId=${drawId}`);
      await computeAndUpsertPrizes(drawId, draw.drawnAt);
      return { success: true, drawId, phase: 'PRIZES' };
    }

    default:
      throw new Error(`[calculate-draw-financials] unknown phase: ${phase}`);
  }
}
