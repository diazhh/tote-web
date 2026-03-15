import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import whatsappClient from '../lib/whatsapp-client.js';
import messageTemplateService from './message-template.service.js';
import telegramService from './telegram.service.js';
import facebookService from './facebook.service.js';
import instagramService from './instagram.service.js';

/**
 * Servicio para publicar sorteos en diferentes canales
 */
class PublicationService {
  constructor() {
    // Lock para evitar publicaciones simultáneas en Instagram
    this.instagramLock = false;
    this.instagramQueue = [];
  }

  /**
   * Adquirir lock de Instagram con cola
   */
  async acquireInstagramLock() {
    while (this.instagramLock) {
      await this.sleep(1000); // Esperar 1 segundo
    }
    this.instagramLock = true;
  }

  /**
   * Liberar lock de Instagram
   */
  releaseInstagramLock() {
    this.instagramLock = false;
  }

  /**
   * Publicar sorteo en todos los canales activos
   */
  async publishDraw(drawId) {
    // Guard: si DISABLE_SOCIAL_CHANNELS=true, no publicar en ningún canal
    if (process.env.DISABLE_SOCIAL_CHANNELS === 'true') {
      logger.warn(`⛔ [LOCAL] DISABLE_SOCIAL_CHANNELS=true — publicación en redes sociales desactivada para sorteo ${drawId}`);
      return { success: true, drawId, results: [], skipped: true };
    }

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

      // Idempotencia: si ya se publicó, no volver a enviar a redes sociales
      if (draw.publishedAt) {
        logger.info(`📢 Sorteo ${drawId} ya fue publicado (${draw.publishedAt.toISOString()}), saltando`);
        return { success: true, drawId, results: [], skipped: true, reason: 'already_published' };
      }

      // Marcar publishedAt para tracking — el status se mantiene en DRAWN
      // DrawPublication rastrea el estado por canal individual
      await prisma.draw.update({
        where: { id: drawId },
        data: { publishedAt: new Date() }
      });

      logger.info(`📢 Sorteo ${drawId} marcado con publishedAt - iniciando publicación en canales`);

      // Obtener canales activos para este juego
      const channels = await prisma.gameChannel.findMany({
        where: { 
          gameId: draw.gameId,
          isActive: true 
        }
      });

      if (channels.length === 0) {
        logger.warn(`⚠️ No hay canales activos configurados para el juego ${draw.game.name}`);
        return {
          success: true,
          drawId,
          results: []
        };
      }

      // Separar canales de Instagram del resto para evitar rate limits
      const instagramChannels = channels.filter(c => c.channelType === 'INSTAGRAM');
      const otherChannels = channels.filter(c => c.channelType !== 'INSTAGRAM');

      // Publicar en canales no-Instagram en paralelo
      const otherPromises = otherChannels.map(async (channel) => {
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
            default:
              logger.warn(`Canal no soportado: ${channel.channelType}`);
              return {
                channelId: channel.id,
                channelName: channel.name,
                channelType: channel.channelType,
                success: false,
                error: 'Canal no soportado'
              };
          }

          return {
            channelId: channel.id,
            channelName: channel.name,
            channelType: channel.channelType,
            ...result
          };
        } catch (error) {
          logger.error(`Error publicando en canal ${channel.name}:`, error);
          return {
            channelId: channel.id,
            channelName: channel.name,
            channelType: channel.channelType,
            success: false,
            error: error.message
          };
        }
      });

      // Publicar en Instagram secuencialmente con delay para evitar rate limits
      const instagramResults = [];
      for (const channel of instagramChannels) {
        try {
          logger.info(`📸 Publicando en Instagram para ${draw.game.name} - esperando para evitar rate limits`);
          
          const result = await this.publishToInstagram(draw, channel);
          
          instagramResults.push({
            channelId: channel.id,
            channelName: channel.name,
            channelType: channel.channelType,
            ...result
          });

          // Esperar 5 segundos entre publicaciones de Instagram para evitar rate limits
          if (instagramChannels.indexOf(channel) < instagramChannels.length - 1) {
            await this.sleep(5000);
          }
        } catch (error) {
          logger.error(`Error publicando en Instagram canal ${channel.name}:`, error);
          instagramResults.push({
            channelId: channel.id,
            channelName: channel.name,
            channelType: channel.channelType,
            success: false,
            error: error.message
          });
        }
      }

      // Esperar a que todas las publicaciones no-Instagram terminen
      const otherResults = await Promise.all(otherPromises);
      
      // Combinar resultados
      const results = [...otherResults, ...instagramResults];

      // Los resultados individuales se registran en DrawPublication

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
   * Publicar en WhatsApp usando el nuevo servicio standalone
   */
  async publishToWhatsApp(draw, channel) {
    try {
      const recipients = channel.recipients || [];

      // Verificar si ya se envió a este canal
      const existingPub = await prisma.drawPublication.findUnique({
        where: { drawId_channel: { drawId: draw.id, channel: 'WHATSAPP' } }
      });
      if (existingPub?.status === 'SENT') {
        logger.info(`📢 WhatsApp ya enviado para draw ${draw.id}, saltando`);
        return { success: true, skipped: true, reason: 'already_sent' };
      }

      // Crear o actualizar registro de publicación PRIMERO
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

      // Verificar estado del servicio WhatsApp
      const status = await whatsappClient.getStatus();
      
      if (!status.isReady) {
        logger.warn('WhatsApp service not ready, marking as failed');
        
        // Marcar como fallido en la base de datos
        await prisma.drawPublication.update({
          where: { id: publication.id },
          data: {
            status: 'FAILED',
            error: 'Servicio WhatsApp no está listo'
          }
        });
        
        return {
          success: false,
          skipped: true,
          message: 'Servicio WhatsApp no está listo'
        };
      }

      if (!recipients || recipients.length === 0) {
        throw new Error('No hay destinatarios configurados para este canal');
      }

      // Publicar usando el nuevo servicio
      const result = await this.publishViaNewWhatsAppService(draw, channel);

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
   * Publicar usando el nuevo servicio WhatsApp standalone
   */
  async publishViaNewWhatsAppService(draw, channel) {
    try {
      const recipients = channel.recipients || [];

      // Preparar mensaje usando la plantilla del canal
      const caption = messageTemplateService.renderDrawMessage(
        channel.messageTemplate,
        draw
      );

      // Convertir URL relativa a URL completa
      const baseUrl = process.env.BACKEND_PUBLIC_URL || 'https://toteback.atilax.io';
      const fullImageUrl = draw.imageUrl 
        ? (draw.imageUrl.startsWith('http') ? draw.imageUrl : `${baseUrl}${draw.imageUrl}`)
        : null;

      // Preparar datos de imagen si existe
      const imageData = fullImageUrl ? {
        type: 'url',
        url: fullImageUrl
      } : null;

      // Enviar a múltiples destinatarios usando el servicio
      const result = await whatsappClient.sendToMultipleGroups(
        recipients,
        caption,
        fullImageUrl
      );

      const messageIds = result.results
        .filter(r => r.success)
        .map(r => r.messageId);

      const errors = result.results
        .filter(r => !r.success)
        .map(r => ({ recipient: r.chatId, error: r.error }));

      return {
        success: result.summary.successful > 0,
        messageIds,
        totalSent: result.summary.successful,
        totalFailed: result.summary.failed,
        errors: errors.length > 0 ? errors : undefined
      };
    } catch (error) {
      logger.error('Error en publishViaNewWhatsAppService:', error);
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

      // Validar configuración
      if (!instanceId) {
        throw new Error('No hay instancia de Telegram configurada para este canal');
      }

      // Verificar que la instancia esté activa (no pausada)
      const instance = await prisma.telegramInstance.findUnique({
        where: { instanceId }
      });

      if (!instance) {
        throw new Error(`Instancia ${instanceId} no encontrada`);
      }

      if (instance.isActive === false) {
        logger.info(`Instancia Telegram ${instanceId} está pausada, omitiendo envío`);
        return {
          success: false,
          skipped: true,
          message: 'Instancia pausada por el administrador'
        };
      }

      // Verificar si ya se envió a este canal
      const existingPub = await prisma.drawPublication.findUnique({
        where: { drawId_channel: { drawId: draw.id, channel: 'TELEGRAM' } }
      });
      if (existingPub?.status === 'SENT') {
        logger.info(`📢 Telegram ya enviado para draw ${draw.id}, saltando`);
        return { success: true, skipped: true, reason: 'already_sent' };
      }

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
        // Convertir URL relativa a URL completa para Telegram
        const baseUrl = process.env.BACKEND_PUBLIC_URL || 'https://toteback.atilax.io';
        const fullImageUrl = draw.imageUrl.startsWith('http') 
          ? draw.imageUrl 
          : `${baseUrl}${draw.imageUrl}`;
        
        // Enviar foto con caption
        // Convertir mensaje Markdown/Mustache a HTML para Telegram
        const htmlMessage = this.formatMessageForTelegram(message);

        result = await telegramService.sendPhoto(
          instanceId,
          chatId,
          fullImageUrl,
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

      // Validar configuración
      if (!instanceId) {
        throw new Error('No hay instancia de Facebook configurada para este canal');
      }

      // Verificar que la instancia esté activa (no pausada)
      const instance = await prisma.facebookInstance.findUnique({
        where: { instanceId }
      });

      if (!instance) {
        throw new Error(`Instancia ${instanceId} no encontrada`);
      }

      if (instance.isActive === false) {
        logger.info(`Instancia Facebook ${instanceId} está pausada, omitiendo envío`);
        return {
          success: false,
          skipped: true,
          message: 'Instancia pausada por el administrador'
        };
      }

      // Verificar si ya se envió a este canal
      const existingPub = await prisma.drawPublication.findUnique({
        where: { drawId_channel: { drawId: draw.id, channel: 'FACEBOOK' } }
      });
      if (existingPub?.status === 'SENT') {
        logger.info(`📢 Facebook ya enviado para draw ${draw.id}, saltando`);
        return { success: true, skipped: true, reason: 'already_sent' };
      }

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

      // Preparar mensaje usando la plantilla del canal
      const message = messageTemplateService.renderDrawMessage(
        channel.messageTemplate,
        draw
      );

      // Construir URL pública de la imagen usando el endpoint público
      const baseUrl = process.env.BACKEND_PUBLIC_URL || 'https://toteback.atilax.io';
      const imageUrl = `${baseUrl}/api/public/images/draw/${draw.id}`;

      logger.info(`📸 Publicando en Facebook con imagen: ${imageUrl}`);

      // Publicar post con imagen
      const result = await facebookService.publishPost(
        instanceId,
        message,
        imageUrl
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
    // Adquirir lock global de Instagram para evitar rate limits
    await this.acquireInstagramLock();
    
    try {
      const instanceId = channel.instagramInstanceId;

      // Validar configuración
      if (!instanceId) {
        throw new Error('No hay instancia de Instagram configurada para este canal');
      }

      // Verificar que la instancia esté activa (no pausada)
      const instance = await prisma.instagramInstance.findUnique({
        where: { instanceId }
      });

      if (!instance) {
        throw new Error(`Instancia ${instanceId} no encontrada`);
      }

      if (instance.isActive === false) {
        logger.info(`Instancia Instagram ${instanceId} está pausada, omitiendo envío`);
        return {
          success: false,
          skipped: true,
          message: 'Instancia pausada por el administrador'
        };
      }

      // Verificar si ya se envió a este canal
      const existingPub = await prisma.drawPublication.findUnique({
        where: { drawId_channel: { drawId: draw.id, channel: 'INSTAGRAM' } }
      });
      if (existingPub?.status === 'SENT') {
        logger.info(`📢 Instagram ya enviado para draw ${draw.id}, saltando`);
        return { success: true, skipped: true, reason: 'already_sent' };
      }

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

      if (!draw.imageUrl) {
        throw new Error('Instagram requiere una imagen para publicar');
      }

      // Preparar mensaje usando la plantilla del canal
      const caption = messageTemplateService.renderDrawMessage(
        channel.messageTemplate,
        draw
      );

      // Construir URL pública de la imagen usando el endpoint público
      const baseUrl = process.env.BACKEND_PUBLIC_URL || 'https://toteback.atilax.io';
      const imageUrl = `${baseUrl}/api/public/images/draw/${draw.id}`;

      logger.info(`📸 Publicando en Instagram con imagen: ${imageUrl}`);

      // Publicar foto
      const result = await instagramService.publishPhoto(
        instanceId,
        imageUrl,
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

      // Esperar 3 segundos adicionales después de publicar para respetar rate limits
      await this.sleep(3000);

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
    } finally {
      // Siempre liberar el lock
      this.releaseInstagramLock();
    }
  }

  /**
   * Publicar imagen especial (pirámide, resumen, recomendaciones) en canales sociales.
   * A diferencia de publishDraw(), no requiere un Draw ni crea registros DrawPublication.
   *
   * @param {string} gameId    - ID del juego al que pertenece la imagen
   * @param {string} imagePath - Ruta local del archivo (para logging)
   * @param {string} filename  - Nombre del archivo (se construye la URL pública con él)
   * @param {string} caption   - Texto del mensaje a enviar junto a la imagen
   */
  async publishImageToChannels(gameId, imagePath, filename, caption) {
    if (process.env.DISABLE_SOCIAL_CHANNELS === 'true') {
      logger.warn(`⛔ [LOCAL] DISABLE_SOCIAL_CHANNELS=true — publicación de imagen especial desactivada`);
      return { success: true, skipped: true, results: [] };
    }

    const MAX_ATTEMPTS = 5;
    const RETRY_DELAY_MS = 5000;

    try {
      // Obtener canales activos para este juego
      const channels = await prisma.gameChannel.findMany({
        where: { gameId, isActive: true }
      });

      if (channels.length === 0) {
        logger.warn(`⚠️ No hay canales activos para gameId=${gameId} (imagen especial)`);
        return { success: true, results: [] };
      }

      const baseUrl = process.env.BACKEND_PUBLIC_URL || 'https://toteback.atilax.io';
      const imageUrl = `${baseUrl}/api/public/images/results/${filename}`;

      logger.info(`📢 Publicando imagen especial en ${channels.length} canal(es): ${imageUrl}`);

      // Helper: intenta publicar en un canal con hasta MAX_ATTEMPTS reintentos.
      // Los errores de configuración (sin instancia, canal pausado, sin destinatarios)
      // se devuelven de inmediato sin reintentar.
      const sendWithRetry = async (channel) => {
        let lastError = null;

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          try {
            switch (channel.channelType) {
              case 'WHATSAPP': {
                const recipients = channel.recipients || [];
                if (!recipients.length) {
                  return { channel: channel.channelType, name: channel.name, success: false, skipped: true, error: 'Sin destinatarios' };
                }
                const result = await whatsappClient.sendToMultipleGroups(recipients, caption, imageUrl);
                if (result.summary.successful === 0) {
                  throw new Error(`WhatsApp: 0 de ${recipients.length} grupos exitosos`);
                }
                return { channel: channel.channelType, name: channel.name, success: true, sent: result.summary.successful, failed: result.summary.failed, attempts: attempt };
              }

              case 'TELEGRAM': {
                const instanceId = channel.telegramInstanceId;
                const chatId = channel.telegramChatId;
                if (!instanceId || !chatId) {
                  return { channel: channel.channelType, name: channel.name, success: false, skipped: true, error: 'Sin instancia o chatId' };
                }
                const instance = await prisma.telegramInstance.findUnique({ where: { instanceId } });
                if (!instance || instance.isActive === false) {
                  return { channel: channel.channelType, name: channel.name, success: false, skipped: true, message: 'Instancia pausada' };
                }
                const htmlCaption = this.formatMessageForTelegram(caption);
                const result = await telegramService.sendPhoto(instanceId, chatId, imageUrl, htmlCaption);
                if (!result.success) {
                  throw new Error(`Telegram sendPhoto falló: ${result.error || 'error desconocido'}`);
                }
                return { channel: channel.channelType, name: channel.name, success: true, messageId: result.messageId, attempts: attempt };
              }

              case 'FACEBOOK': {
                const instanceId = channel.facebookInstanceId;
                if (!instanceId) {
                  return { channel: channel.channelType, name: channel.name, success: false, skipped: true, error: 'Sin instancia' };
                }
                const instance = await prisma.facebookInstance.findUnique({ where: { instanceId } });
                if (!instance || instance.isActive === false) {
                  return { channel: channel.channelType, name: channel.name, success: false, skipped: true, message: 'Instancia pausada' };
                }
                const result = await facebookService.publishPost(instanceId, caption, imageUrl);
                if (!result.success) {
                  throw new Error(`Facebook publishPost falló: ${result.error || 'error desconocido'}`);
                }
                return { channel: channel.channelType, name: channel.name, success: true, postId: result.postId, attempts: attempt };
              }

              case 'INSTAGRAM': {
                const instanceId = channel.instagramInstanceId;
                if (!instanceId) {
                  return { channel: 'INSTAGRAM', name: channel.name, success: false, skipped: true, error: 'Sin instancia' };
                }
                const instance = await prisma.instagramInstance.findUnique({ where: { instanceId } });
                if (!instance || instance.isActive === false) {
                  return { channel: 'INSTAGRAM', name: channel.name, success: false, skipped: true, message: 'Instancia pausada' };
                }
                const result = await instagramService.publishPhoto(instanceId, imageUrl, caption);
                if (!result.success) {
                  throw new Error(`Instagram publishPhoto falló: ${result.error || 'error desconocido'}`);
                }
                return { channel: 'INSTAGRAM', name: channel.name, success: true, mediaId: result.mediaId, attempts: attempt };
              }

              default:
                return { channel: channel.channelType, name: channel.name, success: false, skipped: true, error: 'Canal no soportado' };
            }
          } catch (error) {
            lastError = error;
            if (attempt < MAX_ATTEMPTS) {
              logger.warn(`⚠️ [imagen] Intento ${attempt}/${MAX_ATTEMPTS} fallido — ${channel.channelType} (${channel.name}): ${error.message}. Reintentando en ${RETRY_DELAY_MS / 1000}s...`);
              await this.sleep(RETRY_DELAY_MS);
            }
          }
        }

        // Todos los intentos agotados
        logger.error(`❌ [imagen] Canal ${channel.channelType} (${channel.name}) falló tras ${MAX_ATTEMPTS} intentos: ${lastError?.message}`);
        return { channel: channel.channelType, name: channel.name, success: false, attempts: MAX_ATTEMPTS, error: lastError?.message };
      };

      // Separar Instagram del resto para evitar rate limits
      const instagramChannels = channels.filter(c => c.channelType === 'INSTAGRAM');
      const otherChannels = channels.filter(c => c.channelType !== 'INSTAGRAM');

      // Publicar en canales no-Instagram en paralelo (cada uno con reintentos independientes)
      const otherResults = await Promise.all(otherChannels.map(c => sendWithRetry(c)));

      // Publicar en Instagram secuencialmente con delay entre canales (cada uno con reintentos)
      const instagramResults = [];
      for (let i = 0; i < instagramChannels.length; i++) {
        const result = await sendWithRetry(instagramChannels[i]);
        instagramResults.push(result);
        if (i < instagramChannels.length - 1) {
          await this.sleep(5000);
        }
      }

      const results = [...otherResults, ...instagramResults];
      const successCount = results.filter(r => r.success).length;
      logger.info(`✅ Imagen especial publicada: ${successCount}/${results.length} canales exitosos`);

      return { success: successCount > 0, results };
    } catch (error) {
      logger.error('Error al publicar imagen especial en canales:', error);
      return { success: false, error: error.message, results: [] };
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
    
    // drawTime ya está en formato "HH:MM:SS" hora Venezuela
    const [hours, mins] = (draw.drawTime || '00:00:00').split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'p. m.' : 'a. m.';
    const displayHour = hour % 12 || 12;
    const time = `${displayHour}:${mins} ${ampm}`;

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
