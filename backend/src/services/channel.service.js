import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

class ChannelService {
  /**
   * Crear una nueva configuración de canal
   */
  async create({ type, name, config }) {
    try {
      // Validar tipo de canal
      const validTypes = ['TELEGRAM', 'WHATSAPP', 'FACEBOOK', 'INSTAGRAM', 'TIKTOK'];
      if (!validTypes.includes(type)) {
        throw new Error(`Tipo de canal inválido. Debe ser uno de: ${validTypes.join(', ')}`);
      }

      // Validar configuración según tipo
      this.validateConfig(type, config);

      const channel = await prisma.channelConfig.create({
        data: {
          type,
          name,
          config,
          isActive: true
        }
      });

      logger.info(`Canal creado: ${name} (${type})`);
      return channel;
    } catch (error) {
      logger.error('Error al crear canal:', error);
      throw error;
    }
  }

  /**
   * Obtener todas las configuraciones de canales
   */
  async getAll({ type, isActive } = {}) {
    try {
      const where = {};
      
      if (type) {
        where.type = type;
      }
      
      if (isActive !== undefined) {
        where.isActive = isActive;
      }

      const channels = await prisma.channelConfig.findMany({
        where,
        orderBy: { createdAt: 'desc' }
      });

      return channels;
    } catch (error) {
      logger.error('Error al obtener canales:', error);
      throw error;
    }
  }

  /**
   * Obtener canal por ID
   */
  async getById(id) {
    try {
      const channel = await prisma.channelConfig.findUnique({
        where: { id }
      });

      if (!channel) {
        throw new Error('Canal no encontrado');
      }

      return channel;
    } catch (error) {
      logger.error('Error al obtener canal:', error);
      throw error;
    }
  }

  /**
   * Actualizar configuración de canal
   */
  async update(id, data) {
    try {
      const channel = await prisma.channelConfig.findUnique({
        where: { id }
      });

      if (!channel) {
        throw new Error('Canal no encontrado');
      }

      // Validar configuración si se proporciona
      if (data.config) {
        this.validateConfig(data.type || channel.type, data.config);
      }

      const updated = await prisma.channelConfig.update({
        where: { id },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.config && { config: data.config }),
          ...(data.isActive !== undefined && { isActive: data.isActive })
        }
      });

      logger.info(`Canal actualizado: ${updated.name}`);
      return updated;
    } catch (error) {
      logger.error('Error al actualizar canal:', error);
      throw error;
    }
  }

  /**
   * Eliminar canal
   */
  async delete(id) {
    try {
      const channel = await prisma.channelConfig.findUnique({
        where: { id }
      });

      if (!channel) {
        throw new Error('Canal no encontrado');
      }

      await prisma.channelConfig.delete({
        where: { id }
      });

      logger.info(`Canal eliminado: ${channel.name}`);
      return true;
    } catch (error) {
      logger.error('Error al eliminar canal:', error);
      throw error;
    }
  }

  /**
   * Probar conexión de un canal
   */
  async testConnection(id) {
    try {
      const channel = await this.getById(id);

      // Aquí implementarías la lógica específica para probar cada tipo de canal
      // Por ahora, solo validamos que la configuración esté presente
      
      switch (channel.type) {
        case 'TELEGRAM':
          if (!channel.config.botToken || !channel.config.chatId) {
            throw new Error('Configuración de Telegram incompleta');
          }
          // TODO: Implementar prueba real con API de Telegram
          break;
          
        case 'WHATSAPP':
          if (channel.config.type === 'baileys') {
            // Verificar configuración de Baileys
            if (!channel.config.instanceId) {
              throw new Error('Configuración de WhatsApp Baileys incompleta');
            }
            // Verificar si la instancia está conectada
            const sessionManager = (await import('../lib/whatsapp/session-manager.js')).default;
            const session = sessionManager.getSession(channel.config.instanceId);
            if (!session || session.status !== 'connected') {
              throw new Error('Instancia de WhatsApp no está conectada');
            }
          } else {
            // API oficial de WhatsApp
            if (!channel.config.apiUrl || !channel.config.phoneNumberId || !channel.config.accessToken) {
              throw new Error('Configuración de WhatsApp API incompleta');
            }
            // TODO: Implementar prueba real con API de WhatsApp
          }
          break;
          
        case 'FACEBOOK':
          if (!channel.config.pageAccessToken || !channel.config.pageId) {
            throw new Error('Configuración de Facebook incompleta');
          }
          // TODO: Implementar prueba real con API de Facebook
          break;
          
        case 'INSTAGRAM':
          if (!channel.config.accessToken || !channel.config.instagramAccountId) {
            throw new Error('Configuración de Instagram incompleta');
          }
          // TODO: Implementar prueba real con API de Instagram
          break;
          
        case 'TIKTOK':
          if (!channel.config.accessToken) {
            throw new Error('Configuración de TikTok incompleta');
          }
          // TODO: Implementar prueba real con API de TikTok
          break;
          
        default:
          throw new Error('Tipo de canal no soportado');
      }

      logger.info(`Prueba de conexión exitosa para canal: ${channel.name}`);
      return { status: 'ok', message: 'Configuración válida' };
    } catch (error) {
      logger.error('Error al probar conexión:', error);
      throw error;
    }
  }

  /**
   * Probar publicación con imagen negra de prueba
   */
  async testPublish(id) {
    try {
      const channel = await this.getById(id);
      const testImageGenerator = (await import('../lib/test-image-generator.js')).default;
      
      // Generar imagen negra de prueba
      const imageResult = await testImageGenerator.generateBlackTestImage();
      
      // Construir URL pública de la imagen usando el backend público
      const baseUrl = process.env.BACKEND_PUBLIC_URL || 'https://toteback.atilax.io';
      const imageUrl = `${baseUrl}${imageResult.publicUrl}`;
      
      logger.info(`Imagen de prueba generada: ${imageUrl}`);
      
      let result;
      
      switch (channel.type) {
        case 'FACEBOOK':
          const facebookService = (await import('./facebook.service.js')).default;
          if (!channel.config.instanceId) {
            throw new Error('instanceId no configurado para Facebook');
          }
          result = await facebookService.publishPhoto(
            channel.config.instanceId,
            imageUrl,
            '🧪 Prueba de publicación - Imagen generada automáticamente'
          );
          break;
          
        case 'INSTAGRAM':
          const instagramService = (await import('./instagram.service.js')).default;
          if (!channel.config.instanceId) {
            throw new Error('instanceId no configurado para Instagram');
          }
          result = await instagramService.publishPhoto(
            channel.config.instanceId,
            imageUrl,
            '🧪 Prueba de publicación - Imagen generada automáticamente'
          );
          break;
          
        default:
          throw new Error(`Prueba de publicación no implementada para ${channel.type}`);
      }

      logger.info(`Prueba de publicación exitosa para canal: ${channel.name}`);
      return { 
        status: 'ok', 
        message: 'Publicación de prueba exitosa',
        imageUrl,
        result
      };
    } catch (error) {
      logger.error('Error al probar publicación:', error);
      throw error;
    }
  }

  /**
   * Validar configuración según tipo de canal
   */
  validateConfig(type, config) {
    if (!config || typeof config !== 'object') {
      throw new Error('La configuración debe ser un objeto');
    }

    switch (type) {
      case 'TELEGRAM':
        if (!config.botToken) {
          throw new Error('botToken es requerido para Telegram');
        }
        if (!config.chatId) {
          throw new Error('chatId es requerido para Telegram');
        }
        break;
        
      case 'WHATSAPP':
        // Soportar dos tipos de configuración: API oficial o Baileys
        if (config.type === 'baileys') {
          // Configuración para Baileys
          if (!config.instanceId) {
            throw new Error('instanceId es requerido para WhatsApp Baileys');
          }
          // recipients es opcional, se puede configurar después
        } else {
          // Configuración para API oficial de WhatsApp
          if (!config.apiUrl) {
            throw new Error('apiUrl es requerido para WhatsApp API');
          }
          if (!config.phoneNumberId) {
            throw new Error('phoneNumberId es requerido para WhatsApp API');
          }
          if (!config.accessToken) {
            throw new Error('accessToken es requerido para WhatsApp API');
          }
        }
        break;
        
      case 'FACEBOOK':
        if (!config.pageAccessToken) {
          throw new Error('pageAccessToken es requerido para Facebook');
        }
        if (!config.pageId) {
          throw new Error('pageId es requerido para Facebook');
        }
        break;
        
      case 'INSTAGRAM':
        if (!config.accessToken) {
          throw new Error('accessToken es requerido para Instagram');
        }
        if (!config.instagramAccountId) {
          throw new Error('instagramAccountId es requerido para Instagram');
        }
        break;
        
      case 'TIKTOK':
        if (!config.accessToken) {
          throw new Error('accessToken es requerido para TikTok');
        }
        break;
        
      default:
        throw new Error('Tipo de canal no soportado');
    }
  }

  /**
   * Obtener canales activos por tipo
   */
  async getActiveByType(type) {
    try {
      return await this.getAll({ type, isActive: true });
    } catch (error) {
      logger.error('Error al obtener canales activos:', error);
      throw error;
    }
  }
}

export default new ChannelService();
