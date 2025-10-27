import cron from 'node-cron';
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import { emitToAll, emitToGame } from '../lib/socket.js';

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
    });

    logger.info('✅ Job ExecuteDraws iniciado (cada minuto)');
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
          try {
            const { generateDrawImage } = await import('../services/imageService.js');
            await generateDrawImage(updatedDraw.id);
            logger.info(`✅ Imagen generada para sorteo ${updatedDraw.id}`);
          } catch (imageError) {
            logger.error(`❌ Error generando imagen para sorteo ${updatedDraw.id}:`, imageError);
            // Marcar error pero no detener el flujo
            await prisma.draw.update({
              where: { id: updatedDraw.id },
              data: {
                imageError: imageError.message
              }
            });
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
}

export default new ExecuteDrawJob();
