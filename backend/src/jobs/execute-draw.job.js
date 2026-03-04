import { Cron } from 'croner';
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import systemConfigService from '../services/system-config.service.js';
import { emitToAll, emitToGame } from '../lib/socket.js';
import adminNotificationService from '../services/admin-notification.service.js';
import prizeProcessorService from '../services/prize-processor.service.js';
import drawStatsService from '../services/draw-stats.service.js';
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { getVenezuelaTimeString, getVenezuelaDateAsUTC } from '../lib/dateUtils.js';

/**
 * Job para ejecutar sorteos en su hora programada
 * Se ejecuta cada minuto
 */
class ExecuteDrawJob {
  constructor() {
    this.cronExpression = '* * * * *'; // Cada minuto
    this.task = null;
  }

  /**
   * Iniciar el job
   */
  start() {
    this.task = new Cron(this.cronExpression, { 
      timezone: 'America/Caracas',
      catch: (error) => {
        logger.error('Error en ExecuteDraws job:', error);
      }
    }, async () => {
      await this.execute();
    });

    logger.info('✅ Job ExecuteDraws iniciado (cada minuto, TZ: America/Caracas)');
  }

  /**
   * Detener el job
   */
  stop() {
    if (this.task) {
      this.task.stop();
      logger.info('Job ExecuteDraws detenido');
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
        return;
      }

      // Obtener fecha y hora actual en Venezuela
      const venezuelaTime = getVenezuelaTimeString(); // HH:MM:SS
      const venezuelaDate = getVenezuelaDateAsUTC(); // Date object para DB

      // Log cada ejecución para monitoreo
      logger.info(`[ExecuteDraws] Ejecutando - VE Time: ${venezuelaTime}, VE Date: ${venezuelaDate.toISOString()}`);

      // Buscar sorteos que deben ejecutarse (hora programada ya pasó)
      // Usar drawDate y drawTime (hora Venezuela directa)
      const drawsToExecute = await prisma.draw.findMany({
        where: {
          status: 'CLOSED',
          drawDate: venezuelaDate,
          drawTime: {
            lte: venezuelaTime
          }
        },
        include: {
          game: true,
          preselectedItem: true
        }
      });

      if (drawsToExecute.length === 0) {
        return; // No hay sorteos para ejecutar
      }

      logger.info(`🎲 Ejecutando ${drawsToExecute.length} sorteo(s)...`);

      for (const draw of drawsToExecute) {
        try {
          // El número ganador es el preseleccionado (puede haber sido cambiado manualmente)
          const winnerItemId = draw.preselectedItemId;

          if (!winnerItemId) {
            logger.error(`Sorteo ${draw.id} no tiene número preseleccionado`);
            continue;
          }

          // Actualizar sorteo a DRAWN
          const updatedDraw = await prisma.draw.update({
            where: { id: draw.id },
            data: {
              status: 'DRAWN',
              winnerItemId: winnerItemId,
              drawnAt: new Date()
            },
            include: {
              game: true,
              winnerItem: true
            }
          });

          logger.info(
            `🎲 Sorteo ejecutado: ${draw.game.name} - ${draw.drawTime} ` +
            `| Ganador: ${updatedDraw.winnerItem.number} - ${updatedDraw.winnerItem.name}`
          );

          // Emitir evento WebSocket
          emitToAll('draw:executed', {
            drawId: updatedDraw.id,
            game: {
              name: updatedDraw.game.name,
              slug: updatedDraw.game.slug
            },
            drawDate: updatedDraw.drawDate,
            drawTime: updatedDraw.drawTime,
            winnerItem: {
              number: updatedDraw.winnerItem.number,
              name: updatedDraw.winnerItem.name
            }
          });

          emitToGame(updatedDraw.game.slug, 'draw:executed', {
            drawId: updatedDraw.id,
            drawDate: updatedDraw.drawDate,
            drawTime: updatedDraw.drawTime,
            winnerItem: {
              number: updatedDraw.winnerItem.number,
              name: updatedDraw.winnerItem.name
            }
          });

          // Registrar en audit log
          await prisma.auditLog.create({
            data: {
              action: 'DRAW_EXECUTED',
              entity: 'Draw',
              entityId: draw.id,
              changes: {
                status: 'DRAWN',
                winnerItemId: winnerItemId,
                winnerNumber: updatedDraw.winnerItem.number,
                winnerName: updatedDraw.winnerItem.name
              }
            }
          });

          // Generar imagen del sorteo
          let imagePath = null;
          try {
            const { generateDrawImage } = await import('../services/imageService.js');
            const imageResult = await generateDrawImage(updatedDraw.id);
            // Construir ruta local del archivo para enviar por Telegram
            if (imageResult && imageResult.filename) {
              imagePath = `./storage/results/${imageResult.filename}`;
            }
            logger.info(`✅ Imagen generada para sorteo ${updatedDraw.id}: ${imagePath}`);
          } catch (imageError) {
            logger.error(`❌ Error generando imagen para sorteo ${updatedDraw.id}:`, imageError);
            await prisma.draw.update({
              where: { id: updatedDraw.id },
              data: {
                imageError: imageError.message
              }
            });
          }

          // Publicar en canales PRIMERO (antes de totalizar para no bloquear envío)
          try {
            logger.info(`📢 Publicando sorteo ${updatedDraw.id} en canales...`);
            const publicationService = (await import('../services/publication.service.js')).default;
            const publicationResult = await publicationService.publishDraw(updatedDraw.id);

            if (publicationResult.success) {
              const successCount = publicationResult.results.filter(r => r.success).length;
              const totalCount = publicationResult.results.length;
              logger.info(
                `✅ Sorteo publicado en ${successCount}/${totalCount} canales para ${updatedDraw.game.name} - ${updatedDraw.drawTime}`
              );
            }
          } catch (publishError) {
            logger.error(`❌ Error publicando sorteo ${updatedDraw.id}:`, publishError);
          }

          // Totalizar premios: calcular ganadores/perdedores y actualizar tickets
          try {
            logger.info(`💰 Totalizando premios para sorteo ${updatedDraw.id}...`);
            const prizeResult = await prizeProcessorService.processPrizesForDraw(updatedDraw.id);
            logger.info(
              `✅ Premios totalizados: ${prizeResult.winnersCount} ganadores, ` +
              `${prizeResult.losersCount} perdedores, ` +
              `$${prizeResult.totalPrizesAwarded.toFixed(2)} en premios`
            );
          } catch (prizeError) {
            logger.error(`❌ Error totalizando premios para sorteo ${updatedDraw.id}:`, prizeError);
          }

          // Calcular y persistir estadísticas del sorteo y proveedores
          try {
            logger.info(`📊 Calculando estadísticas para sorteo ${updatedDraw.id}...`);
            await drawStatsService.calculateAllStats(updatedDraw.id);
            logger.info(`✅ Estadísticas calculadas y guardadas para sorteo ${updatedDraw.id}`);
          } catch (statsError) {
            logger.error(`❌ Error calculando estadísticas para sorteo ${updatedDraw.id}:`, statsError);
          }

          // Notificar a administradores (después de totalizar para tener stats reales)
          try {
            const stats = await this.calculateDrawStats(updatedDraw);
            await adminNotificationService.notifyDrawResult({
              drawId: updatedDraw.id,
              game: updatedDraw.game,
              drawDate: updatedDraw.drawDate,
              drawTime: updatedDraw.drawTime,
              winnerItem: updatedDraw.winnerItem,
              totalSales: stats.totalSales,
              totalPayout: stats.totalPayout,
              profit: stats.profit,
              dailyStats: stats.daily,
              weeklyStats: stats.weekly,
              monthlyStats: stats.monthly,
              imagePath // Ruta local del archivo
            });
            logger.info(`📱 Notificación enviada a administradores para sorteo ${updatedDraw.id}`);
          } catch (notifyError) {
            logger.error(`❌ Error notificando administradores para sorteo ${updatedDraw.id}:`, notifyError);
          }
        } catch (error) {
          logger.error(`Error al ejecutar sorteo ${draw.id}:`, error);
        }
      }
    } catch (error) {
      logger.error('❌ Error en ExecuteDrawJob:', error);
    }
  }

  /**
   * Calcular estadísticas del sorteo (ventas, pagos, ganancias)
   * @param {object} draw - Sorteo con game y winnerItem incluidos
   * @returns {Promise<object>} - Estadísticas calculadas
   */
  async calculateDrawStats(draw) {
    const now = new Date();
    const gameId = draw.gameId;

    // Obtener tickets del sorteo actual (todos los orígenes)
    const currentDrawTickets = await prisma.ticket.findMany({
      where: {
        drawId: draw.id
      },
      include: {
        details: true
      }
    });

    const totalSales = currentDrawTickets.reduce((sum, t) => sum + parseFloat(t.totalAmount), 0);
    
    // Calcular pago del sorteo actual
    let winnerSales = 0;
    currentDrawTickets.forEach(ticket => {
      ticket.details.forEach(detail => {
        if (detail.gameItemId === draw.winnerItemId) {
          winnerSales += parseFloat(detail.amount);
        }
      });
    });
    
    const multiplier = parseFloat(draw.winnerItem?.multiplier || 30);
    const totalPayout = winnerSales * multiplier;
    const profit = totalSales - totalPayout;

    // Estadísticas diarias
    const daily = await this.getPeriodStats(gameId, startOfDay(now), endOfDay(now));
    
    // Estadísticas semanales (lunes a domingo)
    const weekly = await this.getPeriodStats(gameId, startOfWeek(now, { weekStartsOn: 1 }), endOfWeek(now, { weekStartsOn: 1 }));
    
    // Estadísticas mensuales
    const monthly = await this.getPeriodStats(gameId, startOfMonth(now), endOfMonth(now));

    return {
      totalSales,
      totalPayout,
      profit,
      daily,
      weekly,
      monthly
    };
  }

  /**
   * Obtener estadísticas de un período
   * @param {string} gameId - ID del juego
   * @param {Date} startDate - Fecha inicio
   * @param {Date} endDate - Fecha fin
   * @returns {Promise<object>} - { sales, payouts, profit }
   */
  async getPeriodStats(gameId, startDate, endDate) {
    try {
      // Obtener todos los sorteos del período que ya fueron ejecutados
      const draws = await prisma.draw.findMany({
        where: {
          gameId,
          drawDate: {
            gte: startDate,
            lte: endDate
          },
          status: {
            in: ['DRAWN', 'PUBLISHED']
          }
        },
        include: {
          winnerItem: true,
          tickets: {
            include: {
              details: true
            }
          }
        }
      });

      let sales = 0;
      let payouts = 0;

      for (const draw of draws) {
        const tickets = draw.tickets || [];
        const drawSales = tickets.reduce((sum, t) => sum + parseFloat(t.totalAmount), 0);
        sales += drawSales;

        if (draw.winnerItemId && draw.winnerItem) {
          let winnerSales = 0;
          tickets.forEach(ticket => {
            ticket.details.forEach(detail => {
              if (detail.gameItemId === draw.winnerItemId) {
                winnerSales += parseFloat(detail.amount);
              }
            });
          });
          const multiplier = parseFloat(draw.winnerItem.multiplier || 30);
          payouts += winnerSales * multiplier;
        }
      }

      return {
        sales,
        payouts,
        profit: sales - payouts
      };
    } catch (error) {
      logger.error('Error calculando estadísticas del período:', error);
      return { sales: 0, payouts: 0, profit: 0 };
    }
  }
}

export default new ExecuteDrawJob();
