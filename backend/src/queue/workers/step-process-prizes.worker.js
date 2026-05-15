import { prisma } from '../../lib/prisma.js';
import logger from '../../lib/logger.js';
import prizeProcessorService from '../../services/prize-processor.service.js';
import { getBoss } from '../boss.js';
import { QUEUES, QUEUE_CONFIGS } from '../constants.js';

export async function stepProcessPrizesWorker(jobs) {
  // pg-boss v10 siempre llama al handler con un array de jobs
  const job = Array.isArray(jobs) ? jobs[0] : jobs;
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

    // Phase 11 (D-11): parallel-trigger DrawFinancial phase PRIZES
    await boss.send(QUEUES.CALCULATE_DRAW_FINANCIALS, { drawId, phase: 'PRIZES' }, {
      singletonKey: `df-prizes-${drawId}`,
      ...QUEUE_CONFIGS[QUEUES.CALCULATE_DRAW_FINANCIALS],
    });

    // Phase 12: parallel-trigger provider commission. Worker has DrawFinancialNotReadyError race-guard (Pitfall 7) — pg-boss retries 3× with backoff if PRIZES has not committed.
    await boss.send(QUEUES.CALCULATE_PROVIDER_COMMISSION, { drawId }, {
      singletonKey: `comm-${drawId}`,
      ...QUEUE_CONFIGS[QUEUES.CALCULATE_PROVIDER_COMMISSION],
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

  // Phase 11 (D-11): parallel-trigger DrawFinancial phase PRIZES
  await boss.send(QUEUES.CALCULATE_DRAW_FINANCIALS, { drawId, phase: 'PRIZES' }, {
    singletonKey: `df-prizes-${drawId}`,
    ...QUEUE_CONFIGS[QUEUES.CALCULATE_DRAW_FINANCIALS],
  });

  // Phase 12: parallel-trigger provider commission. Worker has DrawFinancialNotReadyError race-guard (Pitfall 7) — pg-boss retries 3× with backoff if PRIZES has not committed.
  await boss.send(QUEUES.CALCULATE_PROVIDER_COMMISSION, { drawId }, {
    singletonKey: `comm-${drawId}`,
    ...QUEUE_CONFIGS[QUEUES.CALCULATE_PROVIDER_COMMISSION],
  });

  return { success: true, drawId, ...result };
}
