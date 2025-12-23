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
    }, { timezone: 'America/Caracas' });

    logger.info('✅ Job SyncApiPlanning iniciado (6:00 AM diario, TZ: America/Caracas)');
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
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Sincronizar con SRQ para HOY
      logger.info('📅 Sincronizando sorteos de HOY...');
      const resultToday = await apiIntegrationService.syncSRQPlanning(today);

      // Sincronizar con SRQ para MAÑANA (necesario para tripletas)
      logger.info('📅 Sincronizando sorteos de MAÑANA...');
      const resultTomorrow = await apiIntegrationService.syncSRQPlanning(tomorrow);

      const totalMapped = resultToday.mapped + resultTomorrow.mapped;
      const totalSkipped = resultToday.skipped + resultTomorrow.skipped;

      logger.info(
        `✅ Sincronización completada: ${totalMapped} sorteos mapeados (${resultToday.mapped} hoy, ${resultTomorrow.mapped} mañana), ${totalSkipped} saltados`
      );

      return { 
        today: resultToday, 
        tomorrow: resultTomorrow,
        mapped: totalMapped,
        skipped: totalSkipped
      };
    } catch (error) {
      logger.error('❌ Error en SyncApiPlanningJob:', error);
      throw error;
    }
  }
}

export default new SyncApiPlanningJob();
