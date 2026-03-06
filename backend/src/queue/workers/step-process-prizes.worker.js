import { prisma } from '../../lib/prisma.js';
import logger from '../../lib/logger.js';
import prizeProcessorService from '../../services/prize-processor.service.js';
import { getBoss } from '../boss.js';
import { QUEUES, QUEUE_CONFIGS } from '../constants.js';

export async function stepProcessPrizesWorker(job) {
  const { drawId } = job.data;

  // Idempotencia: verificar si ya se procesaron los premios
  const draw = await prisma.draw.findUnique({ where: { id: drawId }, select: { prizesProcessed: true } });
  if (!draw) throw new Error(`Draw ${drawId} no encontrado`);

  if (draw.prizesProcessed) {
    logger.info(`[step-process-prizes] Draw ${drawId} ya procesado, encolando stats...`);
    // Aún así encolar calculate-stats en caso de que tampoco se haya ejecutado
    const boss = getBoss();
    await boss.send(QUEUES.STEP_CALCULATE_STATS, { drawId }, {
      singletonKey: `stats-${drawId}`,
      ...QUEUE_CONFIGS[QUEUES.STEP_CALCULATE_STATS],
    });
    return { skipped: true, reason: 'already_processed' };
  }

  // PASO CRÍTICO: si lanza, pg-boss reintenta hasta 5 veces. Si agota reintentos → failed → monitor DLQ alerta
  logger.info(`[step-process-prizes] Totalizando premios para draw ${drawId}...`);
  const result = await prizeProcessorService.processPrizesForDraw(drawId);

  await prisma.draw.update({
    where: { id: drawId },
    data: { prizesProcessed: true },
  });

  logger.info(
    `[step-process-prizes] Draw ${drawId}: ${result.winnersCount} ganadores, ` +
    `${result.losersCount} perdedores, $${result.totalPrizesAwarded.toFixed(2)} en premios`
  );

  // Encolar último paso
  const boss = getBoss();
  await boss.send(QUEUES.STEP_CALCULATE_STATS, { drawId }, {
    singletonKey: `stats-${drawId}`,
    ...QUEUE_CONFIGS[QUEUES.STEP_CALCULATE_STATS],
  });

  return { success: true, drawId, ...result };
}
