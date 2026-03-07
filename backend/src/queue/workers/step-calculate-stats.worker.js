import { prisma } from '../../lib/prisma.js';
import logger from '../../lib/logger.js';
import drawStatsService from '../../services/draw-stats.service.js';

export async function stepCalculateStatsWorker(jobs) {
  // pg-boss v10 siempre llama al handler con un array de jobs
  const job = Array.isArray(jobs) ? jobs[0] : jobs;
  const { drawId } = job.data;

  // Idempotencia
  const draw = await prisma.draw.findUnique({ where: { id: drawId }, select: { statsCalculated: true } });
  if (!draw) throw new Error(`Draw ${drawId} no encontrado`);

  if (draw.statsCalculated) {
    logger.info(`[step-calculate-stats] Draw ${drawId} stats ya calculadas, saltando`);
    return { skipped: true, reason: 'already_calculated' };
  }

  logger.info(`[step-calculate-stats] Calculando estadísticas para draw ${drawId}...`);
  await drawStatsService.calculateAllStats(drawId);

  await prisma.draw.update({
    where: { id: drawId },
    data: { statsCalculated: true, pipelineStatus: 'COMPLETED' },
  });

  logger.info(`[step-calculate-stats] Estadísticas guardadas para draw ${drawId}`);
  return { success: true, drawId };
}
