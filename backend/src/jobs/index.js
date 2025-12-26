import generateDailyDrawsJob from './generate-daily-draws.job.js';
import closeDrawJob from './close-draw.job.js';
import executeDrawJob from './execute-draw.job.js';
import publishDrawJob from './publish-draw.job.js';
import syncApiPlanningJob from './sync-api-planning.job.js';
import syncApiTicketsJob from './sync-api-tickets.job.js';
import testBetsJob from './test-bets.job.js';
import simulateBetsJob from './simulate-bets.job.js';
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
    executeDrawJob.start();          // Cada minuto - Ejecutar sorteos Y publicar inmediatamente
    // publishDrawJob.start();       // DESHABILITADO - La publicación ahora ocurre en executeDrawJob

    // Jobs de integración con APIs externas
    syncApiPlanningJob.start();      // Cada 5 minutos - Sincronizar planificación
    syncApiTicketsJob.start();       // Cada 2 minutos - Sincronizar tickets

    // Jobs de simulación
    simulateBetsJob.start();         // Cada 30 segundos - Simular jugadas
    testBetsJob.start();             // Cada minuto - Verificar jugadas de prueba

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
    // publishDrawJob.stop(); // Ya no se inicia
    syncApiPlanningJob.stop();
    syncApiTicketsJob.stop();
    simulateBetsJob.stop();
    testBetsJob.stop();

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
  syncApiPlanningJob,
  syncApiTicketsJob,
  simulateBetsJob,
  testBetsJob
};
