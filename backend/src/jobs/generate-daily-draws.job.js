import cron from 'node-cron';
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import drawTemplateService from '../services/draw-template.service.js';
import drawPauseService from '../services/draw-pause.service.js';
import systemConfigService from '../services/system-config.service.js';
import { emitToAll } from '../lib/socket.js';
import { now, getDayOfWeek, timeStringToDate } from '../lib/dateUtils.js';

/**
 * Job para generar sorteos diarios basados en plantillas
 * Se ejecuta todos los días a las 00:05 AM
 */
class GenerateDailyDrawsJob {
  constructor() {
    this.cronExpression = '5 1 * * *'; // 01:05 AM todos los días (para que en Caracas UTC-4 ya sea el nuevo día)
    this.task = null;
  }

  /**
   * Iniciar el job
   */
  start() {
    this.task = cron.schedule(this.cronExpression, async () => {
      await this.execute();
    }, { timezone: 'America/Caracas' });

    logger.info('✅ Job GenerateDailyDraws iniciado (01:05 AM diario, TZ: America/Caracas)');
  }

  /**
   * Detener el job
   */
  stop() {
    if (this.task) {
      this.task.stop();
      logger.info('Job GenerateDailyDraws detenido');
    }
  }

  /**
   * Ejecutar el job manualmente
   */
  async execute() {
    try {
      logger.info('🔄 Iniciando generación de sorteos diarios...');

      // Verificar parada de emergencia
      const isEmergencyStop = await systemConfigService.isEmergencyStop();
      if (isEmergencyStop) {
        logger.warn('🚨 Sistema en parada de emergencia - Generación de sorteos cancelada');
        return;
      }

      // Get current date
      const today = now();
      const dayOfWeek = getDayOfWeek(today);

      // Obtener plantillas activas para este día
      const templates = await drawTemplateService.getActiveForDay(dayOfWeek);

      if (templates.length === 0) {
        logger.info('No hay plantillas activas para hoy');
        return;
      }

      let createdCount = 0;
      let skippedCount = 0;

      for (const template of templates) {
        // Verificar si el juego está pausado hoy
        const isPaused = await drawPauseService.isGamePausedOnDate(
          template.gameId,
          today
        );

        if (isPaused) {
          logger.info(`Juego ${template.game.name} está pausado hoy, saltando...`);
          skippedCount += template.drawTimes.length;
          continue;
        }

        // Crear sorteos para cada hora de la plantilla
        for (const time of template.drawTimes) {
          // Convert time string to date
          const scheduledAt = timeStringToDate(today, time);

          // Verificar si ya existe un sorteo para esta fecha/hora/juego
          const existing = await prisma.draw.findFirst({
            where: {
              gameId: template.gameId,
              scheduledAt
            }
          });

          if (existing) {
            logger.debug(`Sorteo ya existe: ${template.game.name} - ${time}`);
            skippedCount++;
            continue;
          }

          // Crear el sorteo
          await prisma.draw.create({
            data: {
              gameId: template.gameId,
              templateId: template.id,
              drawDate: today,
              drawTime: time,
              scheduledAt,
              status: 'SCHEDULED'
            }
          });

          createdCount++;
          logger.debug(`Sorteo creado: ${template.game.name} - ${time}`);
        }
      }

      logger.info(`✅ Sorteos generados: ${createdCount} creados, ${skippedCount} saltados`);

      // Emitir evento WebSocket
      emitToAll('draws:generated', {
        date: today.toISOString(),
        created: createdCount,
        skipped: skippedCount
      });

      // Registrar en audit log
      await prisma.auditLog.create({
        data: {
          action: 'DRAWS_GENERATED',
          entity: 'Draw',
          entityId: 'batch',
          changes: {
            date: today.toISOString(),
            created: createdCount,
            skipped: skippedCount
          }
        }
      });

      logger.info(`✅ Generación completada: ${createdCount} sorteos creados, ${skippedCount} saltados`);

      // Emitir evento de actualización
      emitToAll('draws:generated', {
        created: createdCount,
        skipped: skippedCount
      });

      // Si el simulador está habilitado, ejecutar generación de jugadas
      if (createdCount > 0) {
        const isSimulatorEnabled = await systemConfigService.isBetSimulatorEnabled();
        if (isSimulatorEnabled) {
          logger.info('🎲 Simulador habilitado - Generando jugadas para nuevos sorteos...');
          const betSimulatorService = (await import('../services/bet-simulator.service.js')).default;
          
          betSimulatorService.runSimulation({
            includeTripletas: true,
            delayMs: 50
          }).then(result => {
            if (result.success) {
              logger.info(
                `✅ Jugadas generadas: ${result.stats.tickets} tickets, ` +
                `${result.stats.tripletas} tripletas, $${result.stats.totalAmount.toFixed(2)}`
              );
              systemConfigService.updateBetSimulatorLastExecution();
            }
          }).catch(error => {
            logger.error('Error generando jugadas automáticas:', error);
          });
        }
      }

    } catch (error) {
      logger.error('❌ Error en GenerateDailyDrawsJob:', error);
    }
  }
}

export default new GenerateDailyDrawsJob();
