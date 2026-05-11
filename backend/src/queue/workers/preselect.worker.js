/**
 * preselect worker — runs the optimizer for ONE draw.
 *
 * `selectPrewinner` internally:
 *   - acquires withDrawLock(drawId)
 *   - runs prewinner-optimizer
 *   - persists preselectedItemId + closedAt (idempotent)
 *   - emits WS draw:closed
 *   - sends Telegram admin notification (no PDF)
 *
 * So this worker is thin — it just re-verifies state, calls the service, and logs.
 */
import { prisma } from '../../lib/prisma.js';
import logger from '../../lib/logger.js';
import prewinnerSelectionService from '../../services/prewinner-selection.service.js';

export async function preselectWorker(jobs) {
  const job = Array.isArray(jobs) ? jobs[0] : jobs;
  const { drawId } = job.data;

  const draw = await prisma.draw.findUnique({
    where: { id: drawId },
    select: {
      status: true,
      preselectedItemId: true,
      drawTime: true,
      game: { select: { name: true } },
    },
  });
  if (!draw) {
    logger.warn(`[preselect] Draw ${drawId} no encontrado`);
    return { skipped: 'draw_not_found' };
  }
  if (draw.status !== 'CLOSED') {
    return { skipped: `status_is_${draw.status}` };
  }
  if (draw.preselectedItemId) {
    return { skipped: 'already_preselected' };
  }

  const selected = await prewinnerSelectionService.selectPrewinner(drawId);
  if (!selected) {
    logger.warn(`[preselect] No se pudo preseleccionar ${drawId} (optimizer returned null)`);
    return { skipped: 'optimizer_returned_null' };
  }

  logger.info(`✅ [preselect] ${draw.game.name} - ${draw.drawTime} preselect: ${selected.number}`);
  return { preselected: selected.number };
}
