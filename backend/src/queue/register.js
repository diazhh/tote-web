import logger from '../lib/logger.js';
import { QUEUES, QUEUE_CONFIGS } from './constants.js';

/**
 * Registra todos los workers en pg-boss y configura la cadena onComplete del pipeline.
 */
export async function registerAllWorkers(boss) {
  logger.info('[pg-boss] Registrando workers...');

  // Worker close-draw (TW-5) — teamSize=3 para procesar los 3 juegos en paralelo
  if (process.env.PGBOSS_CLOSE_DRAW === 'true') {
    const { closeDrawWorker } = await import('./workers/close-draw.worker.js');
    await boss.work(QUEUES.CLOSE_DRAW, { ...QUEUE_CONFIGS[QUEUES.CLOSE_DRAW], teamSize: 3, teamConcurrency: 3 }, closeDrawWorker);
    logger.info('[pg-boss] Worker close-draw registrado (teamSize=3, concurrency=3)');
  }

  // Pipeline execute-draw (TW-6 a TW-11)
  if (process.env.PGBOSS_EXECUTE_DRAW === 'true') {
    const { executeDrawWorker } = await import('./workers/execute-draw.worker.js');
    const { stepGenerateImageWorker } = await import('./workers/step-generate-image.worker.js');
    const { stepNotifyAdminsWorker } = await import('./workers/step-notify-admins.worker.js');
    const { stepPublishDrawWorker } = await import('./workers/step-publish-draw.worker.js');
    const { stepProcessPrizesWorker } = await import('./workers/step-process-prizes.worker.js');
    const { stepCalculateStatsWorker } = await import('./workers/step-calculate-stats.worker.js');

    const parallel = { teamSize: 3, teamConcurrency: 3 };
    await boss.work(QUEUES.EXECUTE_DRAW, { ...QUEUE_CONFIGS[QUEUES.EXECUTE_DRAW], ...parallel }, executeDrawWorker);
    await boss.work(QUEUES.STEP_GENERATE_IMAGE, { ...QUEUE_CONFIGS[QUEUES.STEP_GENERATE_IMAGE], ...parallel }, stepGenerateImageWorker);
    await boss.work(QUEUES.STEP_NOTIFY_ADMINS, { ...QUEUE_CONFIGS[QUEUES.STEP_NOTIFY_ADMINS], ...parallel }, stepNotifyAdminsWorker);
    await boss.work(QUEUES.STEP_PUBLISH_DRAW, { ...QUEUE_CONFIGS[QUEUES.STEP_PUBLISH_DRAW], ...parallel }, stepPublishDrawWorker);
    await boss.work(QUEUES.STEP_PROCESS_PRIZES, { ...QUEUE_CONFIGS[QUEUES.STEP_PROCESS_PRIZES], ...parallel }, stepProcessPrizesWorker);
    await boss.work(QUEUES.STEP_CALCULATE_STATS, { ...QUEUE_CONFIGS[QUEUES.STEP_CALCULATE_STATS], ...parallel }, stepCalculateStatsWorker);
    logger.info('[pg-boss] Workers del pipeline execute-draw registrados (teamSize=3, concurrency=3)');
    // Nota: el encadenamiento de pasos se realiza dentro de cada worker (ver workers/step-*.worker.js)
    // pg-boss v10 no tiene onComplete; cada worker encola el siguiente paso al completar.
  }

  // Monitor DLQ (TW-16) — siempre activo cuando pg-boss está habilitado
  const { monitorDlqWorker } = await import('./workers/monitor-dlq.worker.js');
  // createQueue es necesario antes de schedule (la cola debe existir en pgboss.queue)
  await boss.createQueue('monitor-dlq');
  await boss.work('monitor-dlq', monitorDlqWorker);
  // Schedule: cada 2 minutos
  await boss.schedule('monitor-dlq', '*/2 * * * *', {}, { tz: 'America/Caracas' });
  logger.info('[pg-boss] Monitor DLQ registrado (cada 2 min)');

  // Workers sync y generate-daily-draws (TW-12, TW-13, TW-15)
  if (process.env.PGBOSS_SYNC_API_PLANNING === 'true') {
    const { syncApiPlanningWorker } = await import('./workers/sync-api-planning.worker.js');
    await boss.work(QUEUES.SYNC_API_PLANNING, QUEUE_CONFIGS[QUEUES.SYNC_API_PLANNING], syncApiPlanningWorker);
    logger.info('[pg-boss] Worker sync-api-planning registrado');
  }

  if (process.env.PGBOSS_SYNC_API_TICKETS === 'true') {
    const { syncApiTicketsWorker } = await import('./workers/sync-api-tickets.worker.js');
    await boss.work(QUEUES.SYNC_API_TICKETS, QUEUE_CONFIGS[QUEUES.SYNC_API_TICKETS], syncApiTicketsWorker);
    logger.info('[pg-boss] Worker sync-api-tickets registrado');
  }

  if (process.env.PGBOSS_GENERATE_DAILY_DRAWS === 'true') {
    const { generateDailyDrawsWorker } = await import('./workers/generate-daily-draws.worker.js');
    await boss.work(QUEUES.GENERATE_DAILY_DRAWS, QUEUE_CONFIGS[QUEUES.GENERATE_DAILY_DRAWS], generateDailyDrawsWorker);
    logger.info('[pg-boss] Worker generate-daily-draws registrado');
  }

  // Workers de simulación (TW-14)
  if (process.env.PGBOSS_SIMULATE_BETS === 'true') {
    const { simulateBetsWorker } = await import('./workers/simulate-bets.worker.js');
    await boss.work(QUEUES.SIMULATE_BETS, QUEUE_CONFIGS[QUEUES.SIMULATE_BETS], simulateBetsWorker);
    logger.info('[pg-boss] Worker simulate-bets registrado');
  }

  if (process.env.PGBOSS_TEST_BETS === 'true') {
    const { testBetsWorker } = await import('./workers/test-bets.worker.js');
    await boss.work(QUEUES.TEST_BETS, QUEUE_CONFIGS[QUEUES.TEST_BETS], testBetsWorker);
    logger.info('[pg-boss] Worker test-bets registrado');
  }

  // Workers de imagenes especiales (TW-22 a TW-28)
  if (process.env.PGBOSS_SPECIAL_IMAGES === 'true') {
    const { piramideLotoanimalitoWorker } = await import('./workers/piramide-lotoanimalito.worker.js');
    const { resumenLotoanimalitoWorker } = await import('./workers/resumen-lotoanimalito.worker.js');
    const { piramideLottopanteraWorker } = await import('./workers/piramide-lottopantera.worker.js');
    const { resumenLottopanteraWorker } = await import('./workers/resumen-lottopantera.worker.js');
    const { recomendacionesTripleWorker } = await import('./workers/recomendaciones-triple.worker.js');
    const { resumenTripleWorker } = await import('./workers/resumen-triple.worker.js');

    await boss.work(QUEUES.PIRAMIDE_LOTOANIMALITO, QUEUE_CONFIGS[QUEUES.PIRAMIDE_LOTOANIMALITO], piramideLotoanimalitoWorker);
    await boss.work(QUEUES.RESUMEN_LOTOANIMALITO, QUEUE_CONFIGS[QUEUES.RESUMEN_LOTOANIMALITO], resumenLotoanimalitoWorker);
    await boss.work(QUEUES.PIRAMIDE_LOTTOPANTERA, QUEUE_CONFIGS[QUEUES.PIRAMIDE_LOTTOPANTERA], piramideLottopanteraWorker);
    await boss.work(QUEUES.RESUMEN_LOTTOPANTERA, QUEUE_CONFIGS[QUEUES.RESUMEN_LOTTOPANTERA], resumenLottopanteraWorker);
    await boss.work(QUEUES.RECOMENDACIONES_TRIPLE, QUEUE_CONFIGS[QUEUES.RECOMENDACIONES_TRIPLE], recomendacionesTripleWorker);
    await boss.work(QUEUES.RESUMEN_TRIPLE, QUEUE_CONFIGS[QUEUES.RESUMEN_TRIPLE], resumenTripleWorker);
    logger.info('[pg-boss] Workers de imagenes especiales registrados (6 workers)');
  }

  logger.info('[pg-boss] Workers registrados correctamente');
}
