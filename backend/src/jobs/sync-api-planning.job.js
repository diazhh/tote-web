import cron from 'node-cron';
import logger from '../lib/logger.js';
import apiIntegrationService from '../services/api-integration.service.js';

/**
 * Job para sincronizar planificación de sorteos con APIs externas
 * Se ejecuta todos los días a las 6:00 AM
 */
class SyncApiPlanningJob {
  constructor() {
    this.cronExpression = '0 6 * * *'; // 6:00 AM todos los días
    this.task = null;
  }

  /**
   * Iniciar el job
   */
  start() {
    this.task = cron.schedule(this.cronExpression, async () => {
      await this.execute();
    });

    logger.info('✅ Job SyncApiPlanning iniciado (6:00 AM diario)');
  }

  /**
   * Detener el job
   */
  stop() {
    if (this.task) {
      this.task.stop();
      logger.info('Job SyncApiPlanning detenido');
    }
  }

  /**
   * Ejecutar el job manualmente
   */
  async execute() {
    try {
      logger.info('🔄 Iniciando sincronización de planificación con APIs externas...');

      const today = new Date();

      // Sincronizar con SRQ
      const result = await apiIntegrationService.syncSRQPlanning(today);

      logger.info(
        `✅ Sincronización completada: ${result.mapped} sorteos mapeados, ${result.skipped} saltados`
      );

      return result;
    } catch (error) {
      logger.error('❌ Error en SyncApiPlanningJob:', error);
      throw error;
    }
  }
}

export default new SyncApiPlanningJob();
