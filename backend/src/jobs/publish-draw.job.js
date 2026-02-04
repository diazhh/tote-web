import { Cron } from 'croner';
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import systemConfigService from '../services/system-config.service.js';
import telegramService from '../services/telegram.service.js';
import whatsappBaileysService from '../services/whatsapp-baileys.service.js';
import publicationService from '../services/publication.service.js';
import { emitToAll } from '../lib/socket.js';

/**
 * Job para publicar sorteos ejecutados en los canales configurados
 * Se ejecuta cada minuto
 */
class PublishDrawJob {
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
        logger.error('Error en PublishDraws job:', error);
      }
    }, async () => {
      await this.execute();
    });

    logger.info('✅ Job PublishDraws iniciado (cada minuto, TZ: America/Caracas)');
  }

  /**
   * Detener el job
   */
  stop() {
    if (this.task) {
      this.task.stop();
      logger.info('Job PublishDraws detenido');
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
        logger.warn('🚨 Sistema en parada de emergencia - Publicaciones canceladas');
        return;
      }

      // Buscar sorteos con status DRAWN que no han sido publicados
      const drawsToPublish = await prisma.draw.findMany({
        where: {
          status: 'DRAWN',
          publishedAt: null,
          imageUrl: { not: null } // Solo publicar si ya tiene imagen
        },
        include: {
          game: true,
          winnerItem: true
        },
        orderBy: {
          drawnAt: 'asc'
        },
        take: 10 // Procesar máximo 10 sorteos por iteración
      });

      if (drawsToPublish.length === 0) {
        return; // No hay sorteos para publicar
      }

      logger.info(`📢 Publicando ${drawsToPublish.length} sorteo(s)...`);

      for (const draw of drawsToPublish) {
        try {
          // Publicar en todos los canales configurados
          const result = await publicationService.publishDraw(draw.id);

          if (result.success) {
            logger.info(
              `📢 Sorteo publicado: ${draw.game.name} - ${draw.drawTime}`
            );

            // Emitir evento WebSocket
            emitToAll('draw:published', {
              drawId: draw.id,
              game: {
                name: draw.game.name,
                slug: draw.game.slug
              },
              drawDate: draw.drawDate,
              drawTime: draw.drawTime,
              publications: result.results
            });

            // Registrar en audit log
            await prisma.auditLog.create({
              data: {
                action: 'DRAW_PUBLISHED',
                entity: 'Draw',
                entityId: draw.id,
                changes: {
                  channels: result.results.map(r => ({
                    type: r.channelType,
                    name: r.channelName,
                    success: r.success,
                    error: r.error
                  }))
                }
              }
            });
          } else {
            logger.warn(`⚠️  Error al publicar sorteo ${draw.id}: ${result.error || 'Error desconocido'}`);
          }

        } catch (error) {
          logger.error(`❌ Error al procesar publicación de sorteo ${draw.id}:`, error);
        }
      }

    } catch (error) {
      logger.error('❌ Error en PublishDrawJob:', error);
    }
  }

  /**
   * Reintentar publicaciones fallidas
   */
  async retryFailedPublications() {
    try {
      const maxRetries = 3;
      const retryAfterMinutes = 5;

      // Buscar publicaciones fallidas con menos de X reintentos
      const failedPublications = await prisma.drawPublication.findMany({
        where: {
          status: 'FAILED',
          retries: { lt: maxRetries },
          updatedAt: {
            lte: new Date(Date.now() - retryAfterMinutes * 60 * 1000)
          }
        },
        include: {
          draw: {
            include: {
              game: true,
              winnerItem: true
            }
          }
        },
        take: 5 // Máximo 5 reintentos por iteración
      });

      if (failedPublications.length === 0) {
        return;
      }

      logger.info(`🔄 Reintentando ${failedPublications.length} publicación(es) fallida(s)...`);

      for (const publication of failedPublications) {
        try {
          await publicationService.republishToChannel(
            publication.drawId,
            publication.channel
          );

          logger.info(`✅ Reintento exitoso: ${publication.channel} - Draw ${publication.drawId}`);

        } catch (error) {
          logger.error(`❌ Error en reintento de publicación ${publication.id}:`, error);
        }
      }

    } catch (error) {
      logger.error('❌ Error en retryFailedPublications:', error);
    }
  }
}

export default new PublishDrawJob();
