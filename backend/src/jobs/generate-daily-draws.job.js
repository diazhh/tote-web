import cron from 'node-cron';
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import drawTemplateService from '../services/draw-template.service.js';
import drawPauseService from '../services/draw-pause.service.js';
import { emitToAll } from '../lib/socket.js';
import { nowInCaracas, getDayOfWeekInCaracas, timeStringToCaracasDate } from '../lib/dateUtils.js';

/**
 * Job para generar sorteos diarios basados en plantillas
 * Se ejecuta todos los días a las 00:05 AM
 */
class GenerateDailyDrawsJob {
  constructor() {
    this.cronExpression = '5 0 * * *'; // 00:05 AM todos los días
    this.task = null;
  }

  /**
   * Iniciar el job
   */
  start() {
    this.task = cron.schedule(this.cronExpression, async () => {
      await this.execute();
    });

    logger.info('✅ Job GenerateDailyDraws iniciado (00:05 AM diario)');
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

      // Get current date in Caracas timezone
      const today = nowInCaracas();
      const dayOfWeek = getDayOfWeekInCaracas(today);

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
          // Convert time string to Caracas date and then to UTC for storage
          const scheduledAt = timeStringToCaracasDate(today, time);

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
    } catch (error) {
      logger.error('❌ Error en GenerateDailyDraws:', error);
    }
  }
}

export default new GenerateDailyDrawsJob();
