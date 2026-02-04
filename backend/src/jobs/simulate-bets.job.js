import { Cron } from 'croner';
import logger from '../lib/logger.js';
import systemConfigService from '../services/system-config.service.js';
import betSimulatorService from '../services/bet-simulator.service.js';

/**
 * Job para simular jugadas automáticamente
 * Se ejecuta cada 30 minutos para generar jugadas de prueba
 */
class SimulateBetsJob {
  constructor() {
    this.cronExpression = '*/30 * * * *'; // Cada 30 minutos
    this.task = null;
  }

  /**
   * Iniciar el job
   */
  start() {
    this.task = new Cron(this.cronExpression, { 
      timezone: 'America/Caracas',
      catch: (error) => {
        logger.error('Error en SimulateBets job:', error);
      }
    }, async () => {
      await this.execute();
    });

    logger.info('✅ Job SimulateBets iniciado (cada 30 minutos, TZ: America/Caracas)');
  }

  /**
   * Detener el job
   */
  stop() {
    if (this.task) {
      this.task.stop();
      logger.info('Job SimulateBets detenido');
    }
  }

  /**
   * Ejecutar el job
   */
  async execute() {
    try {
      // Verificar parada de emergencia
      const isEmergencyStop = await systemConfigService.isEmergencyStop();
      if (isEmergencyStop) {
        return; // Silenciosamente no hacer nada
      }

      // Verificar si el simulador está habilitado
      const isSimulatorEnabled = await systemConfigService.isBetSimulatorEnabled();
      if (!isSimulatorEnabled) {
        return; // Silenciosamente no hacer nada si está desactivado
      }

      logger.info('🎲 Iniciando simulación automática de jugadas...');

      const result = await betSimulatorService.runSimulation({
        includeTripletas: true,
        delayMs: 50 // Más rápido en automático
      });

      if (result.success) {
        logger.info(
          `✅ Simulación completada: ${result.stats.tickets} tickets, ` +
          `${result.stats.tripletas} tripletas, $${result.stats.totalAmount.toFixed(2)} apostados`
        );
      } else {
        logger.info(`ℹ️ ${result.message}`);
      }
    } catch (error) {
      logger.error('❌ Error en SimulateBetsJob:', error);
    }
  }
}

export default new SimulateBetsJob();
