import generateDailyDrawsJob from './generate-daily-draws.job.js';
import executeDrawJob from './execute-draw.job.js';
import publishDrawJob from './publish-draw.job.js';
import syncApiPlanningJob from './sync-api-planning.job.js';
import syncApiTicketsJob from './sync-api-tickets.job.js';
import syncScrapeTicketsJob from './sync-scrape-tickets.job.js';
import testBetsJob from './test-bets.job.js';
import simulateBetsJob from './simulate-bets.job.js';
import specialImagesJob from './special-images.job.js';
import logger from '../lib/logger.js';

/**
 * Inicializar todos los jobs
 */
export function startAllJobs() {
  try {
    logger.info('🚀 Iniciando sistema de Jobs...');

    // Jobs del ciclo de vida de sorteos — migrados a pg-boss + cron Linux 2026-05-12.
    // Ver /etc/cron.d/tote-triggers en VPS 94 y backend/src/queue/workers/.
    // generateDailyDrawsJob.start();  // → cron Linux 07:05 server / 01:05 VE diario
    // executeDrawJob.start();         // → cron Linux + execute-draw-sweep cada minuto
    // publishDrawJob.start();         // DESHABILITADO - publicación dentro del pipeline pg-boss

    // Jobs de integración con APIs externas — migrados a pg-boss + cron Linux 2026-05-12
    // syncApiPlanningJob.start();    // → cron Linux 12:00 server / 06:00 VE diario
    // syncApiTicketsJob.start();     // → cron Linux cada 5 min
    // syncScrapeTicketsJob.start();  // → cron Linux cada 5 min (arregla bug latente createQueue)

    // Jobs de simulación
    simulateBetsJob.start();         // Cada 30 segundos - Simular jugadas
    testBetsJob.start();             // Cada minuto - Verificar jugadas de prueba

    // Jobs de imagenes especiales
    specialImagesJob.start();        // 7:00am piramides/reco, 7:01pm resumenes

    logger.info('✅ Todos los Jobs iniciados correctamente');
  } catch (error) {
    logger.error('❌ Error al iniciar Jobs:', error);
    throw error;
  }
}

/**
 * Detener todos los jobs
 */
export function stopAllJobs() {
  try {
    logger.info('Deteniendo sistema de Jobs...');

    // Migrados a pg-boss + cron Linux — ya no se .stop()
    // generateDailyDrawsJob.stop();
    // executeDrawJob.stop();
    // syncApiPlanningJob.stop();
    // syncApiTicketsJob.stop();
    // syncScrapeTicketsJob.stop();
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
  generateDailyDrawsJob,
  executeDrawJob,
  publishDrawJob,
  syncApiPlanningJob,
  syncApiTicketsJob,
  syncScrapeTicketsJob,
  simulateBetsJob,
  testBetsJob,
  specialImagesJob
};
