import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import prewinnerSelectionService from './prewinner-selection.service.js';

/**
 * Safety net: if draw is CLOSED without a preselect (pg-boss preselect didn't run,
 * crashed, or sweep skipped), run selectPrewinner inline before processing.
 * Idempotent: re-reads the draw after the call and returns the fresh row. On
 * failure, returns the input unchanged (caller's existing fallback handles
 * missing preselect).
 *
 * Extracted from the legacy Croner execute-draw.job.js as part of the
 * post-migration cleanup. Workers should import from this service, not
 * from `jobs/execute-draw.job.js`.
 *
 * @param {object} draw - draw row with at least { id, status, preselectedItemId }
 * @returns {Promise<object>} fresh draw row or the input if no recovery needed
 */
export async function recoverPreselectIfMissing(draw) {
  if (draw.status !== 'CLOSED' || draw.preselectedItemId) {
    return draw;
  }
  logger.warn(`[draw-recovery] ⚠️ Recovery inline: ${draw.id} CLOSED sin preselect, ejecutando selectPrewinner`);
  try {
    await prewinnerSelectionService.selectPrewinner(draw.id);
    const fresh = await prisma.draw.findUnique({
      where: { id: draw.id },
      include: { game: true, preselectedItem: true },
    });
    return fresh || draw;
  } catch (err) {
    logger.error(`[draw-recovery] Recovery falló para ${draw.id}: ${err.message}`);
    return draw;
  }
}

export default { recoverPreselectIfMissing };
