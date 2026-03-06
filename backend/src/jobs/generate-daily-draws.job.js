import { Cron } from 'croner';
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import drawTemplateService from '../services/draw-template.service.js';
import drawPauseService from '../services/draw-pause.service.js';
import systemConfigService from '../services/system-config.service.js';
import { emitToAll } from '../lib/socket.js';
import { getVenezuelaDateString, getVenezuelaDateAsUTC, getVenezuelaDayOfWeek } from '../lib/dateUtils.js';
import { getBoss } from '../queue/boss.js';
import { QUEUES, QUEUE_CONFIGS } from '../queue/constants.js';

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
    this.task = new Cron(this.cronExpression, { 
      timezone: 'America/Caracas',
      catch: (error) => {
        logger.error('Error en GenerateDailyDraws job:', error);
      }
    }, async () => {
      await this.execute();
    });

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
      if (process.env.PGBOSS_GENERATE_DAILY_DRAWS === 'true') {
        const boss = getBoss();
        const dateKey = new Date().toISOString().slice(0, 10);
        await boss.send(QUEUES.GENERATE_DAILY_DRAWS, {}, {
          singletonKey: `gen-draws-${dateKey}`,
          ...QUEUE_CONFIGS[QUEUES.GENERATE_DAILY_DRAWS],
        });
        logger.info('[generate-daily-draws] Job encolado en pg-boss');
        return;
      }

      logger.info('🔄 Iniciando generación de sorteos diarios...');

      // Verificar parada de emergencia
      const isEmergencyStop = await systemConfigService.isEmergencyStop();
      if (isEmergencyStop) {
        logger.warn('🚨 Sistema en parada de emergencia - Generación de sorteos cancelada');
        return;
      }

      // Obtener fecha actual en Venezuela
      const venezuelaDateStr = getVenezuelaDateString(); // YYYY-MM-DD
      const today = getVenezuelaDateAsUTC(); // Date object para guardar en DB
      
      // Calcular mañana (necesario para tripletas que abarcan múltiples días)
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const dayOfWeek = getVenezuelaDayOfWeek(); // 1-7 (Lun-Dom)
      const tomorrowDayOfWeek = (dayOfWeek % 7) + 1; // Siguiente día
      
      logger.info(`📅 Generando sorteos para HOY (${venezuelaDateStr}) y MAÑANA`);
      logger.info(`   Hoy: Día ${dayOfWeek}, Mañana: Día ${tomorrowDayOfWeek}`);

      let totalCreated = 0;
      let totalSkipped = 0;

      // Generar sorteos para HOY y MAÑANA
      const daysToGenerate = [
        { date: today, dayOfWeek, label: 'HOY' },
        { date: tomorrow, dayOfWeek: tomorrowDayOfWeek, label: 'MAÑANA' }
      ];

      for (const { date, dayOfWeek: dow, label } of daysToGenerate) {
        logger.info(`\n📆 Procesando sorteos para ${label}...`);
        
        // Obtener plantillas activas para este día
        const templates = await drawTemplateService.getActiveForDay(dow);

        if (templates.length === 0) {
          logger.info(`   No hay plantillas activas para ${label}`);
          continue;
        }

        let createdCount = 0;
        let skippedCount = 0;

        for (const template of templates) {
          // Verificar si el juego está pausado en esta fecha
          const isPaused = await drawPauseService.isGamePausedOnDate(
            template.gameId,
            date
          );

          if (isPaused) {
            logger.info(`   Juego ${template.game.name} está pausado en ${label}, saltando...`);
            skippedCount += template.drawTimes.length;
            continue;
          }

          // Crear sorteos para cada hora de la plantilla
          for (const time of template.drawTimes) {
            // Verificar si ya existe un sorteo para esta fecha/hora/juego
            const existing = await prisma.draw.findFirst({
              where: {
                gameId: template.gameId,
                drawDate: date,
                drawTime: time
              }
            });

            if (existing) {
              logger.debug(`   Sorteo ya existe: ${template.game.name} - ${time}`);
              skippedCount++;
              continue;
            }

            // Crear el sorteo con hora de Venezuela
            await prisma.draw.create({
              data: {
                gameId: template.gameId,
                templateId: template.id,
                drawDate: date,
                drawTime: time, // Hora Venezuela directa (ej: "08:00")
                status: 'SCHEDULED'
              }
            });

            createdCount++;
            logger.debug(`   Sorteo creado: ${template.game.name} - ${time}`);
          }
        }

        logger.info(`   ✅ ${label}: ${createdCount} creados, ${skippedCount} saltados`);
        totalCreated += createdCount;
        totalSkipped += skippedCount;
      }

      logger.info(`\n✅ Sorteos generados: ${totalCreated} creados, ${totalSkipped} saltados`);

      // Emitir evento WebSocket
      emitToAll('draws:generated', {
        date: today.toISOString(),
        created: totalCreated,
        skipped: totalSkipped
      });

      // Registrar en audit log
      await prisma.auditLog.create({
        data: {
          action: 'DRAWS_GENERATED',
          entity: 'Draw',
          entityId: 'batch',
          changes: {
            date: today.toISOString(),
            tomorrow: tomorrow.toISOString(),
            created: totalCreated,
            skipped: totalSkipped
          }
        }
      });

      logger.info(`✅ Generación completada: ${totalCreated} sorteos creados, ${totalSkipped} saltados`);

      // Emitir evento de actualización
      emitToAll('draws:generated', {
        created: totalCreated,
        skipped: totalSkipped
      });

      // Si el simulador está habilitado, ejecutar generación de jugadas
      if (totalCreated > 0) {
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
