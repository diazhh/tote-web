import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import whatsappBaileysService from './whatsapp-baileys.service.js';
import sessionManager from '../lib/whatsapp/session-manager.js';
import messageTemplateService from './message-template.service.js';
import telegramService from './telegram.service.js';
import facebookService from './facebook.service.js';
import instagramService from './instagram.service.js';

/**
 * Servicio para publicar sorteos en diferentes canales
 */
class PublicationService {
  /**
   * Publicar sorteo en todos los canales activos
   */
  async publishDraw(drawId) {
    try {
      const draw = await prisma.draw.findUnique({
        where: { id: drawId },
        include: {
          game: true,
          winnerItem: true,
          publications: true
        }
      });

      if (!draw) {
        throw new Error('Sorteo no encontrado');
      }

      if (draw.status !== 'DRAWN') {
        throw new Error('El sorteo debe estar en estado DRAWN para publicar');
      }

      // Obtener canales activos para este juego
      const channels = await prisma.gameChannel.findMany({
        where: { 
          gameId: draw.gameId,
          isActive: true 
        }
      });

      const results = [];

      // Publicar en cada canal
      for (const channel of channels) {
        try {
          let result;

          switch (channel.channelType) {
            case 'WHATSAPP':
              result = await this.publishToWhatsApp(draw, channel);
              break;
            case 'TELEGRAM':
              result = await this.publishToTelegram(draw, channel);
              break;
            case 'FACEBOOK':
              result = await this.publishToFacebook(draw, channel);
              break;
            case 'INSTAGRAM':
              result = await this.publishToInstagram(draw, channel);
              break;
            default:
              logger.warn(`Canal no soportado: ${channel.channelType}`);
              continue;
          }

          results.push({
            channelId: channel.id,
            channelName: channel.name,
            channelType: channel.channelType,
            ...result
          });
        } catch (error) {
          logger.error(`Error publicando en canal ${channel.name}:`, error);
          results.push({
            channelId: channel.id,
            channelName: channel.name,
            channelType: channel.channelType,
            success: false,
            error: error.message
          });
        }
      }

      // Actualizar estado del sorteo
      await prisma.draw.update({
        where: { id: drawId },
        data: { 
          status: 'PUBLISHED',
          publishedAt: new Date()
        }
      });

      return {
        success: true,
        drawId,
        results
      };
    } catch (error) {
      logger.error('Error al publicar sorteo:', error);
      throw error;
    }
  }

  /**
   * Publicar en WhatsApp (soporta Baileys y API oficial)
   */
  async publishToWhatsApp(draw, channel) {
    try {
      const instanceId = channel.whatsappInstanceId;
      const recipients = channel.recipients || [];

      // Crear o actualizar registro de publicación
      const publication = await prisma.drawPublication.upsert({
        where: {
          drawId_channel: {
            drawId: draw.id,
            channel: 'WHATSAPP'
          }
        },
        create: {
          drawId: draw.id,
          channel: 'WHATSAPP',
          status: 'PENDING'
        },
        update: {
          status: 'PENDING',
          error: null,
          retries: { increment: 1 }
        }
      });

      // Validar instancia
      if (!instanceId) {
        throw new Error('No hay instancia de WhatsApp configurada para este canal');
      }

      if (!recipients || recipients.length === 0) {
        throw new Error('No hay destinatarios configurados para este canal');
      }

      if (!sessionManager.isConnected(instanceId)) {
        throw new Error(`Instancia ${instanceId} no está conectada`);
      }

      // Publicar usando Baileys
      const result = await this.publishViaBaileys(draw, channel);

      // Actualizar publicación con resultado
      await prisma.drawPublication.update({
        where: { id: publication.id },
        data: {
          status: result.success ? 'SENT' : 'FAILED',
          sentAt: result.success ? new Date() : null,
          externalId: result.messageIds ? result.messageIds.join(',') : null,
          error: result.error || null
        }
      });

      return result;
    } catch (error) {
      logger.error('Error al publicar en WhatsApp:', error);
      
      // Marcar como fallido
      await prisma.drawPublication.updateMany({
        where: {
          drawId: draw.id,
          channel: 'WHATSAPP'
        },
        data: {
          status: 'FAILED',
          error: error.message
        }
      });

      throw error;
    }
  }

  /**
   * Publicar usando Baileys
   */
  async publishViaBaileys(draw, channel) {
    try {
      const instanceId = channel.whatsappInstanceId;
      const recipients = channel.recipients || [];

      const messageIds = [];
      const errors = [];

      // Preparar mensaje usando la plantilla del canal
      const caption = messageTemplateService.renderDrawMessage(
        channel.messageTemplate,
        draw
      );

      // Enviar a cada destinatario
      for (const recipient of recipients) {
        try {
          let result;

          if (draw.imageUrl) {
            // Enviar imagen con caption
            result = await sessionManager.sendImageFromUrl(
              instanceId,
              recipient,
              draw.imageUrl,
              caption
            );
          } else {
            // Enviar solo texto
            result = await sessionManager.sendTextMessage(
              instanceId,
              recipient,
              caption
            );
          }

          messageIds.push(result.key.id);

          // Pequeña pausa entre mensajes
          await this.sleep(1000);
        } catch (error) {
          logger.error(`Error enviando a ${recipient}:`, error);
          errors.push({ recipient, error: error.message });
        }
      }

      return {
        success: messageIds.length > 0,
        messageIds,
        totalSent: messageIds.length,
        totalFailed: errors.length,
        errors: errors.length > 0 ? errors : undefined
      };
    } catch (error) {
      logger.error('Error en publishViaBaileys:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Publicar usando API oficial de WhatsApp
   */
  async publishViaWhatsAppAPI(draw, config) {
    try {
      // TODO: Implementar integración con API oficial de WhatsApp
      logger.warn('API oficial de WhatsApp no implementada aún');
      return {
        success: false,
        error: 'API oficial de WhatsApp no implementada'
      };
    } catch (error) {
      logger.error('Error en publishViaWhatsAppAPI:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Publicar en Telegram
   */
  async publishToTelegram(draw, channel) {
    try {
      const instanceId = channel.telegramInstanceId;
      const chatId = channel.telegramChatId;

      // Crear o actualizar registro de publicación
      const publication = await prisma.drawPublication.upsert({
        where: {
          drawId_channel: {
            drawId: draw.id,
            channel: 'TELEGRAM'
          }
        },
        create: {
          drawId: draw.id,
          channel: 'TELEGRAM',
          status: 'PENDING'
        },
        update: {
          status: 'PENDING',
          error: null,
          retries: { increment: 1 }
        }
      });

      // Validar configuración
      if (!instanceId) {
        throw new Error('No hay instancia de Telegram configurada para este canal');
      }

      if (!chatId) {
        throw new Error('No hay chat ID configurado para este canal');
      }

      // Preparar mensaje usando la plantilla del canal
      const message = messageTemplateService.renderDrawMessage(
        channel.messageTemplate,
        draw
      );

      let result;

      if (draw.imageUrl) {
        // Enviar foto con caption
        // Convertir mensaje Markdown/Mustache a HTML para Telegram
        const htmlMessage = this.formatMessageForTelegram(message);

        result = await telegramService.sendPhoto(
          instanceId,
          chatId,
          draw.imageUrl,
          htmlMessage
        );
      } else {
        // Enviar solo texto
        const htmlMessage = this.formatMessageForTelegram(message);

        result = await telegramService.sendMessage(
          instanceId,
          chatId,
          htmlMessage
        );
      }

      // Actualizar publicación con resultado
      await prisma.drawPublication.update({
        where: { id: publication.id },
        data: {
          status: result.success ? 'SENT' : 'FAILED',
          sentAt: result.success ? new Date() : null,
          externalId: result.messageId ? result.messageId.toString() : null,
          error: result.error || null
        }
      });

      return {
        success: result.success,
        messageId: result.messageId
      };

    } catch (error) {
      logger.error('Error al publicar en Telegram:', error);

      // Marcar como fallido
      await prisma.drawPublication.updateMany({
        where: {
          drawId: draw.id,
          channel: 'TELEGRAM'
        },
        data: {
          status: 'FAILED',
          error: error.message
        }
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Publicar en Facebook
   */
  async publishToFacebook(draw, channel) {
    try {
      const instanceId = channel.facebookInstanceId;

      // Crear o actualizar registro de publicación
      const publication = await prisma.drawPublication.upsert({
        where: {
          drawId_channel: {
            drawId: draw.id,
            channel: 'FACEBOOK'
          }
        },
        create: {
          drawId: draw.id,
          channel: 'FACEBOOK',
          status: 'PENDING'
        },
        update: {
          status: 'PENDING',
          error: null,
          retries: { increment: 1 }
        }
      });

      // Validar configuración
      if (!instanceId) {
        throw new Error('No hay instancia de Facebook configurada para este canal');
      }

      // Preparar mensaje usando la plantilla del canal
      const message = messageTemplateService.renderDrawMessage(
        channel.messageTemplate,
        draw
      );

      // Publicar post con imagen
      const result = await facebookService.publishPost(
        instanceId,
        message,
        draw.imageUrl
      );

      // Actualizar publicación con resultado
      await prisma.drawPublication.update({
        where: { id: publication.id },
        data: {
          status: result.success ? 'SENT' : 'FAILED',
          sentAt: result.success ? new Date() : null,
          externalId: result.postId || result.post_id || null,
          error: result.error || null
        }
      });

      return {
        success: result.success,
        postId: result.postId
      };

    } catch (error) {
      logger.error('Error al publicar en Facebook:', error);

      // Marcar como fallido
      await prisma.drawPublication.updateMany({
        where: {
          drawId: draw.id,
          channel: 'FACEBOOK'
        },
        data: {
          status: 'FAILED',
          error: error.message
        }
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Publicar en Instagram
   */
  async publishToInstagram(draw, channel) {
    try {
      const instanceId = channel.instagramInstanceId;

      // Crear o actualizar registro de publicación
      const publication = await prisma.drawPublication.upsert({
        where: {
          drawId_channel: {
            drawId: draw.id,
            channel: 'INSTAGRAM'
          }
        },
        create: {
          drawId: draw.id,
          channel: 'INSTAGRAM',
          status: 'PENDING'
        },
        update: {
          status: 'PENDING',
          error: null,
          retries: { increment: 1 }
        }
      });

      // Validar configuración
      if (!instanceId) {
        throw new Error('No hay instancia de Instagram configurada para este canal');
      }

      if (!draw.imageUrl) {
        throw new Error('Instagram requiere una imagen para publicar');
      }

      // Preparar mensaje usando la plantilla del canal
      const caption = messageTemplateService.renderDrawMessage(
        channel.messageTemplate,
        draw
      );

      // Publicar foto
      const result = await instagramService.publishPhoto(
        instanceId,
        draw.imageUrl,
        caption
      );

      // Actualizar publicación con resultado
      await prisma.drawPublication.update({
        where: { id: publication.id },
        data: {
          status: result.success ? 'SENT' : 'FAILED',
          sentAt: result.success ? new Date() : null,
          externalId: result.mediaId || null,
          error: result.error || null
        }
      });

      return {
        success: result.success,
        mediaId: result.mediaId
      };

    } catch (error) {
      logger.error('Error al publicar en Instagram:', error);

      // Marcar como fallido
      await prisma.drawPublication.updateMany({
        where: {
          drawId: draw.id,
          channel: 'INSTAGRAM'
        },
        data: {
          status: 'FAILED',
          error: error.message
        }
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Republicar sorteo en un canal específico
   */
  async republishToChannel(drawId, channelType) {
    try {
      const draw = await prisma.draw.findUnique({
        where: { id: drawId },
        include: {
          game: true,
          winnerItem: true
        }
      });

      if (!draw) {
        throw new Error('Sorteo no encontrado');
      }

      const channel = await prisma.gameChannel.findFirst({
        where: {
          gameId: draw.gameId,
          channelType: channelType,
          isActive: true
        }
      });

      if (!channel) {
        throw new Error(`No hay canal activo de tipo ${channelType}`);
      }

      let result;

      switch (channelType) {
        case 'WHATSAPP':
          result = await this.publishToWhatsApp(draw, channel);
          break;
        case 'TELEGRAM':
          result = await this.publishToTelegram(draw, channel);
          break;
        case 'FACEBOOK':
          result = await this.publishToFacebook(draw, channel);
          break;
        case 'INSTAGRAM':
          result = await this.publishToInstagram(draw, channel);
          break;
        default:
          throw new Error(`Canal no soportado: ${channelType}`);
      }

      return result;
    } catch (error) {
      logger.error('Error al republicar sorteo:', error);
      throw error;
    }
  }

  /**
   * Formatear mensaje de sorteo
   */
  formatDrawMessage(draw) {
    const gameName = draw.game?.name || 'Sorteo';
    const winnerNumber = draw.winnerItem?.number || 'N/A';
    const winnerName = draw.winnerItem?.name || 'N/A';
    const time = new Date(draw.scheduledAt).toLocaleTimeString('es-VE', {
      hour: '2-digit',
      minute: '2-digit'
    });

    return `🎰 *${gameName}*\n\n` +
           `⏰ Hora: ${time}\n` +
           `🎯 Resultado: *${winnerNumber}*\n` +
           `🏆 ${winnerName}\n\n` +
           `✨ ¡Buena suerte en el próximo sorteo!`;
  }

  /**
   * Formatear mensaje para Telegram (Markdown a HTML)
   */
  formatMessageForTelegram(message) {
    // Convertir formato Markdown a HTML para Telegram
    return message
      .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')  // **texto** -> <b>texto</b>
      .replace(/\*(.*?)\*/g, '<b>$1</b>')      // *texto* -> <b>texto</b>
      .replace(/_(.*?)_/g, '<i>$1</i>')        // _texto_ -> <i>texto</i>
      .replace(/`(.*?)`/g, '<code>$1</code>'); // `texto` -> <code>texto</code>
  }

  /**
   * Utilidad: sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new PublicationService();
