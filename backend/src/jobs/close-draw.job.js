import cron from 'node-cron';
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import { emitToAll, emitToGame } from '../lib/socket.js';
import apiIntegrationService from '../services/api-integration.service.js';

/**
 * Job para cerrar sorteos 5 minutos antes y preseleccionar ganador
 * Se ejecuta cada minuto
 */
class CloseDrawJob {
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
    });

    logger.info('✅ Job CloseDraws iniciado (cada minuto)');
  }

  /**
   * Detener el job
   */
  stop() {
    if (this.task) {
      this.task.stop();
      logger.info('Job CloseDraws detenido');
    }
  }

  /**
   * Ejecutar el job
   */
  async execute() {
    try {
      const now = new Date();
      const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

      // Buscar sorteos que deben cerrarse (5 minutos antes)
      const drawsToClose = await prisma.draw.findMany({
        where: {
          status: 'SCHEDULED',
          scheduledAt: {
            lte: fiveMinutesFromNow,
            gte: now
          }
        },
        include: {
          game: {
            include: {
              items: {
                where: {
                  isActive: true
                }
              }
            }
          }
        }
      });

      if (drawsToClose.length === 0) {
        return; // No hay sorteos para cerrar
      }

      logger.info(`🔒 Cerrando ${drawsToClose.length} sorteo(s)...`);

      for (const draw of drawsToClose) {
        try {
          // Seleccionar número ganador aleatorio
          const items = draw.game.items;
          
          if (items.length === 0) {
            logger.error(`No hay items activos para el juego ${draw.game.name}`);
            continue;
          }

          const randomIndex = Math.floor(Math.random() * items.length);
          const selectedItem = items[randomIndex];

          // ANTES DE CERRAR: Importar tickets de APIs externas
          try {
            logger.info(`📥 Importando ventas externas para sorteo ${draw.id}...`);
            const importResult = await apiIntegrationService.importSRQTickets(draw.id);
            logger.info(
              `✅ Ventas importadas: ${importResult.imported} tickets guardados, ${importResult.skipped} saltados`
            );
          } catch (error) {
            logger.warn(`⚠️ No se pudieron importar ventas para sorteo ${draw.id}:`, error.message);
            // Continuar aunque falle la importación
          }

          // Actualizar sorteo
          const updatedDraw = await prisma.draw.update({
            where: { id: draw.id },
            data: {
              status: 'CLOSED',
              preselectedItemId: selectedItem.id,
              closedAt: new Date()
            },
            include: {
              game: true,
              preselectedItem: true
            }
          });

          logger.info(
            `🔒 Sorteo cerrado: ${draw.game.name} - ${draw.scheduledAt.toLocaleTimeString()} ` +
            `| Preselección: ${selectedItem.number} - ${selectedItem.name}`
          );

          // Emitir evento WebSocket
          emitToAll('draw:closed', {
            drawId: updatedDraw.id,
            game: {
              name: updatedDraw.game.name,
              slug: updatedDraw.game.slug
            },
            scheduledAt: updatedDraw.scheduledAt,
            preselectedItem: {
              number: selectedItem.number,
              name: selectedItem.name
            }
          });

          emitToGame(updatedDraw.game.slug, 'draw:closed', {
            drawId: updatedDraw.id,
            scheduledAt: updatedDraw.scheduledAt,
            preselectedItem: {
              number: selectedItem.number,
              name: selectedItem.name
            }
          });

          // Registrar en audit log
          await prisma.auditLog.create({
            data: {
              action: 'DRAW_CLOSED',
              entity: 'Draw',
              entityId: draw.id,
              changes: {
                status: 'CLOSED',
                preselectedItemId: selectedItem.id,
                preselectedNumber: selectedItem.number,
                preselectedName: selectedItem.name
              }
            }
          });

          // TODO: Enviar notificación a Telegram
          // await telegramBot.notifyDrawClosed(updatedDraw);
        } catch (error) {
          logger.error(`Error al cerrar sorteo ${draw.id}:`, error);
        }
      }
    } catch (error) {
      logger.error('❌ Error en CloseDrawJob:', error);
    }
  }
}

export default new CloseDrawJob();
