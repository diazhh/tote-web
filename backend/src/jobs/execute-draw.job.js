import cron from 'node-cron';
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import { emitToAll, emitToGame } from '../lib/socket.js';
import adminNotificationService from '../services/admin-notification.service.js';
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';

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
    this.task = cron.schedule(this.cronExpression, async () => {
      await this.execute();
    }, { timezone: 'America/Caracas' });

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
      const now = new Date();
      const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);

      // Buscar sorteos que deben ejecutarse (hora programada ya pasó)
      const drawsToExecute = await prisma.draw.findMany({
        where: {
          status: 'CLOSED',
          scheduledAt: {
            lte: now,
            gte: oneMinuteAgo
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
            `🎲 Sorteo ejecutado: ${draw.game.name} - ${draw.scheduledAt.toLocaleTimeString()} ` +
            `| Ganador: ${updatedDraw.winnerItem.number} - ${updatedDraw.winnerItem.name}`
          );

          // Emitir evento WebSocket
          emitToAll('draw:executed', {
            drawId: updatedDraw.id,
            game: {
              name: updatedDraw.game.name,
              slug: updatedDraw.game.slug
            },
            scheduledAt: updatedDraw.scheduledAt,
            winnerItem: {
              number: updatedDraw.winnerItem.number,
              name: updatedDraw.winnerItem.name
            }
          });

          emitToGame(updatedDraw.game.slug, 'draw:executed', {
            drawId: updatedDraw.id,
            scheduledAt: updatedDraw.scheduledAt,
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

          // Calcular estadísticas y notificar a administradores
          try {
            const stats = await this.calculateDrawStats(updatedDraw);
            await adminNotificationService.notifyDrawResult({
              drawId: updatedDraw.id,
              game: updatedDraw.game,
              scheduledAt: updatedDraw.scheduledAt,
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

          // NOTA: El PublishDrawJob se encargará de publicar en los canales automáticamente
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

    // Obtener tickets del sorteo actual
    const currentDrawTickets = await prisma.externalTicket.findMany({
      where: {
        mapping: {
          drawId: draw.id
        }
      }
    });

    const totalSales = currentDrawTickets.reduce((sum, t) => sum + parseFloat(t.amount), 0);
    
    // Calcular pago del sorteo actual
    const winnerTickets = currentDrawTickets.filter(t => t.gameItemId === draw.winnerItemId);
    const winnerSales = winnerTickets.reduce((sum, t) => sum + parseFloat(t.amount), 0);
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
          scheduledAt: {
            gte: startDate,
            lte: endDate
          },
          status: {
            in: ['DRAWN', 'PUBLISHED']
          }
        },
        include: {
          winnerItem: true,
          apiMappings: {
            include: {
              tickets: true
            }
          }
        }
      });

      let sales = 0;
      let payouts = 0;

      for (const draw of draws) {
        const tickets = draw.apiMappings.flatMap(m => m.tickets);
        const drawSales = tickets.reduce((sum, t) => sum + parseFloat(t.amount), 0);
        sales += drawSales;

        if (draw.winnerItemId && draw.winnerItem) {
          const winnerTickets = tickets.filter(t => t.gameItemId === draw.winnerItemId);
          const winnerSales = winnerTickets.reduce((sum, t) => sum + parseFloat(t.amount), 0);
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
