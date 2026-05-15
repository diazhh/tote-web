/**
 * Phase 12 — calculate-provider-commission pg-boss worker.
 *
 * Replaces the Phase 11 D-15 placeholder. Fires (parallel) after
 * step-process-prizes commits PRIZES — wired in Plan 12-03.
 *
 * Race-condition guard (Pitfall 7): DrawFinancial.totalizedAt may still be NULL
 * if the commission worker dequeues before the PRIZES upsert commits. We throw
 * DrawFinancialNotReadyError so pg-boss retries 3× with backoff — by which time
 * the PRIZES phase will have committed (or the job dead-letters and ops sees it).
 *
 * pg-boss v10 always invokes the handler with an array of jobs — array-unwrap
 * matches the convention used everywhere else in this codebase
 * (e.g. calculate-draw-financials.worker.js).
 */

import { prisma } from '../../lib/prisma.js';
import logger from '../../lib/logger.js';
import {
  computeAndUpsertLedgerForDraw,
  DrawFinancialNotReadyError,
} from '../../services/commission.service.js';

export async function calculateProviderCommissionWorker(jobs) {
  const job = Array.isArray(jobs) ? jobs[0] : jobs;
  const { drawId } = job.data;

  // Race-condition guard — Pitfall 7.
  const df = await prisma.drawFinancial.findUnique({
    where: { drawId },
    select: { totalizedAt: true },
  });
  if (!df || df.totalizedAt === null) {
    throw new DrawFinancialNotReadyError(drawId);
  }

  logger.info(`[calculate-provider-commission] drawId=${drawId}`);
  const result = await computeAndUpsertLedgerForDraw(drawId);
  return {
    success: true,
    drawId,
    providersProcessed: result.providersProcessed,
    skipped: result.skipped,
  };
}
