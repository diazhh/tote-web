import logger from '../lib/logger.js';
import { QUEUES, QUEUE_CONFIGS } from './constants.js';

/**
 * Registra todos los workers en pg-boss y configura la cadena onComplete del pipeline.
 */
export async function registerAllWorkers(boss) {
  logger.info('[pg-boss] Registrando workers...');

  // Close-draw flow (pg-boss native). PGBOSS_CLOSE_DRAW=true activates the new
  // two-phase scheduler: close-and-ingest (xx:55) + preselect (xx:56).
  // The legacy single-worker close-draw.worker.js has been retired (deleted).
  // QUEUES.CLOSE_DRAW row is kept (createQueue defensive) so any stale callers
  // don't silently drop jobs.
  if (process.env.PGBOSS_CLOSE_DRAW === 'true') {
    const { closeAndIngestSweepWorker } = await import('./workers/close-and-ingest-sweep.worker.js');
    const { closeAndIngestWorker } = await import('./workers/close-and-ingest.worker.js');

    await boss.createQueue(QUEUES.CLOSE_DRAW); // defensive, no worker bound
    await boss.createQueue(QUEUES.CLOSE_AND_INGEST_SWEEP);
    await boss.createQueue(QUEUES.CLOSE_AND_INGEST);

    await boss.work(
      QUEUES.CLOSE_AND_INGEST_SWEEP,
      QUEUE_CONFIGS[QUEUES.CLOSE_AND_INGEST_SWEEP],
      closeAndIngestSweepWorker
    );
    await boss.work(
      QUEUES.CLOSE_AND_INGEST,
      { ...QUEUE_CONFIGS[QUEUES.CLOSE_AND_INGEST], teamSize: 4, teamConcurrency: 4 },
      closeAndIngestWorker
    );

    // El trigger del sweep ahora viene de cron Linux (NO de boss.schedule).
    // boss.schedule en pg-boss v10 tiene una ventana hardcoded de 60s en
    // shouldSendIt: si onCron() se atrasa >60s, el tick se descarta sin retry.
    // Cron del SO + script /scripts/trigger-pgboss-cron.mjs lo reemplaza.
    // Ver /etc/cron.d/tote-triggers en VPS 94.
    logger.info('[pg-boss] Workers close-and-ingest registrados (trigger via cron Linux, teamSize=4)');
  }

  // Preselect flow — runs at xx:56 against draws closed at xx:55 without preselect.
  if (process.env.PGBOSS_PRESELECT === 'true') {
    const { preselectSweepWorker } = await import('./workers/preselect-sweep.worker.js');
    const { preselectWorker } = await import('./workers/preselect.worker.js');

    await boss.createQueue(QUEUES.PRESELECT_SWEEP);
    await boss.createQueue(QUEUES.PRESELECT);

    await boss.work(
      QUEUES.PRESELECT_SWEEP,
      QUEUE_CONFIGS[QUEUES.PRESELECT_SWEEP],
      preselectSweepWorker
    );
    await boss.work(
      QUEUES.PRESELECT,
      { ...QUEUE_CONFIGS[QUEUES.PRESELECT], teamSize: 4, teamConcurrency: 4 },
      preselectWorker
    );

    // Trigger via cron Linux (ver comentario en bloque CLOSE_DRAW arriba).
    logger.info('[pg-boss] Workers preselect registrados (trigger via cron Linux, teamSize=4)');
  }

  // Pipeline execute-draw (TW-6 a TW-11)
  if (process.env.PGBOSS_EXECUTE_DRAW === 'true') {
    const { executeDrawSweepWorker } = await import('./workers/execute-draw-sweep.worker.js');
    const { executeDrawWorker } = await import('./workers/execute-draw.worker.js');
    const { stepGenerateImageWorker } = await import('./workers/step-generate-image.worker.js');
    const { stepNotifyAdminsWorker } = await import('./workers/step-notify-admins.worker.js');
    const { stepPublishDrawWorker } = await import('./workers/step-publish-draw.worker.js');
    const { stepProcessPrizesWorker } = await import('./workers/step-process-prizes.worker.js');
    const { stepCalculateStatsWorker } = await import('./workers/step-calculate-stats.worker.js');

    await boss.createQueue(QUEUES.EXECUTE_DRAW_SWEEP);
    await boss.createQueue(QUEUES.EXECUTE_DRAW);
    await boss.createQueue(QUEUES.STEP_GENERATE_IMAGE);
    await boss.createQueue(QUEUES.STEP_NOTIFY_ADMINS);
    await boss.createQueue(QUEUES.STEP_PUBLISH_DRAW);
    await boss.createQueue(QUEUES.STEP_PROCESS_PRIZES);
    await boss.createQueue(QUEUES.STEP_CALCULATE_STATS);

    const parallel = { teamSize: 3, teamConcurrency: 3 };
    await boss.work(QUEUES.EXECUTE_DRAW_SWEEP, QUEUE_CONFIGS[QUEUES.EXECUTE_DRAW_SWEEP], executeDrawSweepWorker);
    await boss.work(QUEUES.EXECUTE_DRAW, { ...QUEUE_CONFIGS[QUEUES.EXECUTE_DRAW], ...parallel }, executeDrawWorker);
    await boss.work(QUEUES.STEP_GENERATE_IMAGE, { ...QUEUE_CONFIGS[QUEUES.STEP_GENERATE_IMAGE], ...parallel }, stepGenerateImageWorker);
    await boss.work(QUEUES.STEP_NOTIFY_ADMINS, { ...QUEUE_CONFIGS[QUEUES.STEP_NOTIFY_ADMINS], ...parallel }, stepNotifyAdminsWorker);
    await boss.work(QUEUES.STEP_PUBLISH_DRAW, { ...QUEUE_CONFIGS[QUEUES.STEP_PUBLISH_DRAW], ...parallel }, stepPublishDrawWorker);
    await boss.work(QUEUES.STEP_PROCESS_PRIZES, { ...QUEUE_CONFIGS[QUEUES.STEP_PROCESS_PRIZES], ...parallel }, stepProcessPrizesWorker);
    await boss.work(QUEUES.STEP_CALCULATE_STATS, { ...QUEUE_CONFIGS[QUEUES.STEP_CALCULATE_STATS], ...parallel }, stepCalculateStatsWorker);
    logger.info('[pg-boss] Pipeline execute-draw registrado (trigger via cron Linux, teamSize=3)');
  }

  // Phase 11: DrawFinancial materialization (calculate-draw-financials).
  // Phase 12: real commission worker (replaces D-15 placeholder) + weekly
  // settlement snapshot worker (cron-triggered Monday 06:00 VE). Always-on per
  // CLAUDE.md ("PGBOSS_* env flags are no longer load-bearing"). F-11 demands
  // createQueue BEFORE work for every queue.
  const { calculateDrawFinancialsWorker } = await import('./workers/calculate-draw-financials.worker.js');
  const { calculateProviderCommissionWorker } = await import('./workers/calculate-provider-commission.worker.js');

  await boss.createQueue(QUEUES.CALCULATE_DRAW_FINANCIALS);
  await boss.createQueue(QUEUES.CALCULATE_PROVIDER_COMMISSION); // queue created in Phase 11; real handler now bound below

  await boss.work(QUEUES.CALCULATE_DRAW_FINANCIALS, QUEUE_CONFIGS[QUEUES.CALCULATE_DRAW_FINANCIALS], calculateDrawFinancialsWorker);

  // Phase 12 — real commission handler (was no-op placeholder).
  await boss.work(
    QUEUES.CALCULATE_PROVIDER_COMMISSION,
    QUEUE_CONFIGS[QUEUES.CALCULATE_PROVIDER_COMMISSION],
    calculateProviderCommissionWorker,
  );
  logger.info('[pg-boss] Workers calculate-draw-financials + calculate-provider-commission registrados');

  // Phase 12 — weekly settlement snapshot. Cron-triggered (Linux), always-on.
  // F-11 mandate: createQueue BEFORE work. The cron line lives in
  // /etc/cron.d/tote-triggers and Plan 12-03 adds 'weekly-settlement-snapshot'
  // to the ALLOWED_QUEUES set in trigger-pgboss-cron.mjs.
  const { weeklySettlementSnapshotWorker } = await import('./workers/weekly-settlement-snapshot.worker.js');
  await boss.createQueue(QUEUES.WEEKLY_SETTLEMENT_SNAPSHOT);
  await boss.work(
    QUEUES.WEEKLY_SETTLEMENT_SNAPSHOT,
    QUEUE_CONFIGS[QUEUES.WEEKLY_SETTLEMENT_SNAPSHOT],
    weeklySettlementSnapshotWorker,
  );
  logger.info('[pg-boss] Worker weekly-settlement-snapshot registrado (trigger via cron Linux, Lunes 06:00 VE)');

  // ======================================================================
  // Phase v1.4 — perf cache layer
  // refresh-live-snapshots (cron 1/min) + refresh-daily-snapshot (cron 1/min)
  // Cron lines live in /etc/cron.d/tote-triggers on prod. Allowlist is in
  // trigger-pgboss-cron.mjs.
  // ======================================================================
  const { refreshLiveSnapshotsWorker } = await import('./workers/refresh-live-snapshots.worker.js');
  const { refreshDailySnapshotWorker } = await import('./workers/refresh-daily-snapshot.worker.js');

  await boss.createQueue(QUEUES.REFRESH_LIVE_SNAPSHOTS);
  await boss.createQueue(QUEUES.REFRESH_DAILY_SNAPSHOT);

  await boss.work(
    QUEUES.REFRESH_LIVE_SNAPSHOTS,
    QUEUE_CONFIGS[QUEUES.REFRESH_LIVE_SNAPSHOTS],
    refreshLiveSnapshotsWorker,
  );
  await boss.work(
    QUEUES.REFRESH_DAILY_SNAPSHOT,
    QUEUE_CONFIGS[QUEUES.REFRESH_DAILY_SNAPSHOT],
    refreshDailySnapshotWorker,
  );
  logger.info('[pg-boss] Workers refresh-live-snapshots + refresh-daily-snapshot registrados (cron 1/min)');

  // Retry failed publications — siempre activo, cada 5 minutos
  const { retryFailedPublicationsWorker } = await import('./workers/retry-failed-publications.worker.js');
  await boss.createQueue(QUEUES.RETRY_FAILED_PUBLICATIONS);
  await boss.work(QUEUES.RETRY_FAILED_PUBLICATIONS, QUEUE_CONFIGS[QUEUES.RETRY_FAILED_PUBLICATIONS], retryFailedPublicationsWorker);
  // Trigger via cron Linux.
  logger.info('[pg-boss] Retry failed publications registrado (trigger via cron Linux, cada 5 min)');

  // Monitor DLQ (TW-16) — siempre activo cuando pg-boss está habilitado
  const { monitorDlqWorker } = await import('./workers/monitor-dlq.worker.js');
  // createQueue es necesario antes de schedule (la cola debe existir en pgboss.queue)
  await boss.createQueue('monitor-dlq');
  await boss.work('monitor-dlq', monitorDlqWorker);
  // Trigger via cron Linux (ver /etc/cron.d/tote-triggers). boss.schedule
  // de pg-boss v10 tiene drift bug — ver commit 0f8d3f0.
  logger.info('[pg-boss] Monitor DLQ registrado (trigger via cron Linux, cada 2 min)');

  // Cleanup logs (security/retención) — siempre activo. Patrón createQueue +
  // work + schedule para evitar el bug latente de pg-boss v10 (ver nota más abajo).
  const { cleanupLogsWorker } = await import('./workers/cleanup-logs.worker.js');
  await boss.createQueue(QUEUES.CLEANUP_LOGS);
  await boss.work(QUEUES.CLEANUP_LOGS, cleanupLogsWorker);
  // 03:15 diario hora Caracas — fuera del peak de sorteos
  // Trigger via cron Linux (ver /etc/cron.d/tote-triggers). 03:15 VE = 09:15 server CEST.
  logger.info('[pg-boss] Worker cleanup-logs registrado (trigger via cron Linux, 03:15 VE diario)');

  // Workers sync y generate-daily-draws (TW-12, TW-13, TW-15)
  if (process.env.PGBOSS_SYNC_API_PLANNING === 'true') {
    const { syncApiPlanningWorker } = await import('./workers/sync-api-planning.worker.js');
    await boss.createQueue(QUEUES.SYNC_API_PLANNING);
    await boss.work(QUEUES.SYNC_API_PLANNING, QUEUE_CONFIGS[QUEUES.SYNC_API_PLANNING], syncApiPlanningWorker);
    logger.info('[pg-boss] Worker sync-api-planning registrado (trigger via cron Linux, 06:00 VE diario)');
  }

  if (process.env.PGBOSS_SYNC_API_TICKETS === 'true') {
    const { syncApiTicketsWorker } = await import('./workers/sync-api-tickets.worker.js');
    // pg-boss v10 NO crea la cola con boss.work() — boss.send() falla silente sin esto.
    await boss.createQueue(QUEUES.SYNC_API_TICKETS);
    await boss.work(QUEUES.SYNC_API_TICKETS, QUEUE_CONFIGS[QUEUES.SYNC_API_TICKETS], syncApiTicketsWorker);
    logger.info('[pg-boss] Worker sync-api-tickets registrado (trigger via cron Linux, cada 5 min)');
  }

  if (process.env.PGBOSS_SYNC_SCRAPE_TICKETS === 'true') {
    const { syncScrapeTicketsWorker } = await import('./workers/sync-scrape-tickets.worker.js');
    // pg-boss v10 NO crea la cola con boss.work() — FIX del bug latente
    // (los boss.send() del cron Croner sync-scrape-tickets.job.js fallaban silente).
    await boss.createQueue(QUEUES.SYNC_SCRAPE_TICKETS);
    await boss.work(QUEUES.SYNC_SCRAPE_TICKETS, QUEUE_CONFIGS[QUEUES.SYNC_SCRAPE_TICKETS], syncScrapeTicketsWorker);
    logger.info('[pg-boss] Worker sync-scrape-tickets registrado (trigger via cron Linux, cada 5 min)');
  }

  if (process.env.PGBOSS_GENERATE_DAILY_DRAWS === 'true') {
    const { generateDailyDrawsWorker } = await import('./workers/generate-daily-draws.worker.js');
    await boss.createQueue(QUEUES.GENERATE_DAILY_DRAWS);
    await boss.work(QUEUES.GENERATE_DAILY_DRAWS, QUEUE_CONFIGS[QUEUES.GENERATE_DAILY_DRAWS], generateDailyDrawsWorker);
    logger.info('[pg-boss] Worker generate-daily-draws registrado (trigger via cron Linux, 01:05 VE diario)');
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

    // En pg-boss v10, boss.work() NO crea la cola automaticamente.
    // La cola debe existir en pgboss.queue para que boss.send() pueda insertar jobs (usa JOIN).
    // Sin createQueue(), boss.send() retorna null silenciosamente y los jobs nunca se procesan.
    await boss.createQueue(QUEUES.PIRAMIDE_LOTOANIMALITO);
    await boss.createQueue(QUEUES.RESUMEN_LOTOANIMALITO);
    await boss.createQueue(QUEUES.PIRAMIDE_LOTTOPANTERA);
    await boss.createQueue(QUEUES.RESUMEN_LOTTOPANTERA);
    await boss.createQueue(QUEUES.RECOMENDACIONES_TRIPLE);
    await boss.createQueue(QUEUES.RESUMEN_TRIPLE);

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
