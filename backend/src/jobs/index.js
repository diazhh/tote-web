import generateDailyDrawsJob from './generate-daily-draws.job.js';
import closeDrawJob from './close-draw.job.js';
import executeDrawJob from './execute-draw.job.js';
import publishDrawJob from './publish-draw.job.js';
import syncApiPlanningJob from './sync-api-planning.job.js';
import logger from '../lib/logger.js';

/**
 * Inicializar todos los jobs
 */
export function startAllJobs() {
  try {
    logger.info('🚀 Iniciando sistema de Jobs...');

    // Jobs del ciclo de vida de sorteos
    generateDailyDrawsJob.start();  // 00:05 AM - Generar sorteos del día
    closeDrawJob.start();            // Cada minuto - Cerrar sorteos 5 min antes
    executeDrawJob.start();          // Cada minuto - Ejecutar sorteos
    publishDrawJob.start();          // Cada minuto - Publicar en canales

    // Jobs de integración con APIs externas
    syncApiPlanningJob.start();      // 06:00 AM - Sincronizar con API SRQ

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

    generateDailyDrawsJob.stop();
    closeDrawJob.stop();
    executeDrawJob.stop();
    publishDrawJob.stop();
    syncApiPlanningJob.stop();

    logger.info('✅ Todos los Jobs detenidos');
  } catch (error) {
    logger.error('Error al detener Jobs:', error);
  }
}

export default {
  startAllJobs,
  stopAllJobs,
  generateDailyDrawsJob,
  closeDrawJob,
  executeDrawJob,
  publishDrawJob,
  syncApiPlanningJob
};
