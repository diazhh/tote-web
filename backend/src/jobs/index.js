import publishDrawJob from './publish-draw.job.js';
import testBetsJob from './test-bets.job.js';
import simulateBetsJob from './simulate-bets.job.js';
import specialImagesJob from './special-images.job.js';
import logger from '../lib/logger.js';

/**
 * Job orchestration — POST-MIGRATION STATE (2026-05-12).
 *
 * Five lifecycle/integration jobs were migrated to a unified scheduling
 * pattern: cron Linux (/etc/cron.d/tote-triggers on VPS 94) →
 * trigger-pgboss-cron.mjs → pg-boss workers in backend/src/queue/workers/.
 *
 * The legacy .job.js files for the migrated jobs (execute-draw,
 * generate-daily-draws, sync-api-tickets, sync-api-planning,
 * sync-scrape-tickets) are KEPT ON DISK because their corresponding
 * pg-boss workers still import them as a library for the inline sync /
 * sweep logic. They are no longer scheduled by Croner — `.start()` is
 * not called and they are not imported here anymore.
 *
 * Strategy: the .job.js library files will be deleted in a follow-up
 * task after a stability period (~2 weeks of clean prod runs on the
 * unified scheduler). The workers will absorb the relevant helpers
 * before that deletion.
 *
 * Jobs that remain Croner-scheduled (still .start()ed below):
 *   - simulateBetsJob   — every 30s, dev/staging only
 *   - testBetsJob       — every minute, dev/staging only
 *   - specialImagesJob  — 7:00am piramides/reco, 7:01pm resumenes
 *   - publishDrawJob    — DISABLED (publication runs inside pg-boss pipeline)
 */
export function startAllJobs() {
  try {
    logger.info('🚀 Iniciando sistema de Jobs...');

    // Migrated to pg-boss + cron Linux 2026-05-12 — NOT started here:
    //   generateDailyDrawsJob → cron Linux 07:05 server / 01:05 VE diario
    //   executeDrawJob        → cron Linux + execute-draw-sweep cada minuto
    //   publishDrawJob        → DESHABILITADO - publicación dentro del pipeline pg-boss
    //   syncApiPlanningJob    → cron Linux 12:00 server / 06:00 VE diario
    //   syncApiTicketsJob     → cron Linux cada 5 min
    //   syncScrapeTicketsJob  → cron Linux cada 5 min

    // Jobs de simulación (aún Croner)
    simulateBetsJob.start();         // Cada 30 segundos - Simular jugadas
    testBetsJob.start();             // Cada minuto - Verificar jugadas de prueba

    // Jobs de imagenes especiales (aún Croner)
    specialImagesJob.start();        // 7:00am piramides/reco, 7:01pm resumenes

    logger.info('✅ Todos los Jobs iniciados correctamente');
  } catch (error) {
    logger.error('❌ Error al iniciar Jobs:', error);
    throw error;
  }
}

/**
 * Detener todos los jobs Croner-scheduled.
 */
export function stopAllJobs() {
  try {
    logger.info('Deteniendo sistema de Jobs...');

    simulateBetsJob.stop();
    testBetsJob.stop();
    specialImagesJob.stop();

    logger.info('✅ Todos los Jobs detenidos');
  } catch (error) {
    logger.error('Error al detener Jobs:', error);
  }
}

export default {
  startAllJobs,
  stopAllJobs,
  publishDrawJob,
  simulateBetsJob,
  testBetsJob,
  specialImagesJob
};
