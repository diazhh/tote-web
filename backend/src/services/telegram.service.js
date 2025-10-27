import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import logger from '../lib/logger.js';

const prisma = new PrismaClient();

/**
 * Servicio para gestionar instancias de Telegram Bot
 */
class TelegramService {
  constructor() {
    this.instances = new Map(); // Cache de instancias activas
  }

  /**
   * Crear nueva instancia de Telegram
   */
  async createInstance(instanceId, name, botToken, chatId = null, webhookUrl = null) {
    try {
      // Validar el bot token
      const botInfo = await this.validateBotToken(botToken);
      
      // Crear instancia en la base de datos
      const instance = await prisma.telegramInstance.create({
        data: {
          instanceId,
          name,
          botToken,
          chatId,
          webhookUrl,
          status: 'CONNECTED',
          connectedAt: new Date(),
          config: {
            botInfo,
            username: botInfo.username
          }
        }
      });

      // Configurar webhook si se proporciona
      if (webhookUrl) {
        await this.setWebhook(botToken, webhookUrl);
      }

      logger.info(`Instancia de Telegram creada: ${instanceId}`);
      
      return {
        success: true,
        instance,
        message: 'Instancia de Telegram creada exitosamente'
      };

    } catch (error) {
      logger.error('Error al crear instancia de Telegram:', error);
      throw new Error(`Error al crear instancia: ${error.message}`);
    }
  }

  /**
   * Validar token del bot de Telegram
   */
  async validateBotToken(botToken) {
    try {
      const response = await axios.get(`https://api.telegram.org/bot${botToken}/getMe`);
      
      if (!response.data.ok) {
        throw new Error('Token de bot inválido');
      }

      return response.data.result;
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error('Token de bot inválido o expirado');
      }
      throw new Error(`Error al validar bot: ${error.message}`);
    }
  }

  /**
   * Configurar webhook
   */
  async setWebhook(botToken, webhookUrl) {
    try {
      const response = await axios.post(`https://api.telegram.org/bot${botToken}/setWebhook`, {
        url: webhookUrl
      });

      if (!response.data.ok) {
        throw new Error(`Error al configurar webhook: ${response.data.description}`);
      }

      return response.data;
    } catch (error) {
      logger.error('Error al configurar webhook:', error);
      throw error;
    }
  }

  /**
   * Enviar mensaje
   */
  async sendMessage(instanceId, chatId, message, options = {}) {
    try {
      const instance = await this.getInstance(instanceId);
      
      const payload = {
        chat_id: chatId,
        text: message,
        parse_mode: options.parseMode || 'HTML',
        ...options
      };

      const response = await axios.post(
        `https://api.telegram.org/bot${instance.botToken}/sendMessage`,
        payload
      );

      if (!response.data.ok) {
        throw new Error(`Error al enviar mensaje: ${response.data.description}`);
      }

      // Actualizar última actividad
      await this.updateLastSeen(instanceId);

      return {
        success: true,
        messageId: response.data.result.message_id,
        data: response.data.result
      };

    } catch (error) {
      logger.error('Error al enviar mensaje de Telegram:', error);
      throw error;
    }
  }

  /**
   * Enviar foto
   */
  async sendPhoto(instanceId, chatId, photo, caption = '', options = {}) {
    try {
      const instance = await this.getInstance(instanceId);
      
      const payload = {
        chat_id: chatId,
        photo: photo,
        caption: caption,
        parse_mode: options.parseMode || 'HTML',
        ...options
      };

      const response = await axios.post(
        `https://api.telegram.org/bot${instance.botToken}/sendPhoto`,
        payload
      );

      if (!response.data.ok) {
        throw new Error(`Error al enviar foto: ${response.data.description}`);
      }

      await this.updateLastSeen(instanceId);

      return {
        success: true,
        messageId: response.data.result.message_id,
        data: response.data.result
      };

    } catch (error) {
      logger.error('Error al enviar foto de Telegram:', error);
      throw error;
    }
  }

  /**
   * Obtener información del chat
   */
  async getChatInfo(instanceId, chatId) {
    try {
      const instance = await this.getInstance(instanceId);
      
      const response = await axios.get(
        `https://api.telegram.org/bot${instance.botToken}/getChat?chat_id=${chatId}`
      );

      if (!response.data.ok) {
        throw new Error(`Error al obtener info del chat: ${response.data.description}`);
      }

      return {
        success: true,
        chat: response.data.result
      };

    } catch (error) {
      logger.error('Error al obtener info del chat:', error);
      throw error;
    }
  }

  /**
   * Listar todas las instancias
   */
  async listInstances() {
    try {
      const instances = await prisma.telegramInstance.findMany({
        where: { isActive: true },
        orderBy: { createdAt: 'desc' }
      });

      return instances;
    } catch (error) {
      logger.error('Error al listar instancias de Telegram:', error);
      throw error;
    }
  }

  /**
   * Obtener instancia por ID
   */
  async getInstance(instanceId) {
    try {
      const instance = await prisma.telegramInstance.findUnique({
        where: { instanceId }
      });

      if (!instance) {
        throw new Error(`Instancia de Telegram no encontrada: ${instanceId}`);
      }

      if (!instance.isActive) {
        throw new Error(`Instancia de Telegram inactiva: ${instanceId}`);
      }

      return instance;
    } catch (error) {
      logger.error('Error al obtener instancia:', error);
      throw error;
    }
  }

  /**
   * Actualizar estado de conexión
   */
  async updateConnectionStatus(instanceId, status, error = null) {
    try {
      const updateData = {
        status,
        lastSeen: new Date()
      };

      if (status === 'CONNECTED') {
        updateData.connectedAt = new Date();
      }

      if (error) {
        updateData.config = {
          ...updateData.config,
          lastError: error
        };
      }

      await prisma.telegramInstance.update({
        where: { instanceId },
        data: updateData
      });

      logger.info(`Estado de instancia Telegram actualizado: ${instanceId} -> ${status}`);
    } catch (error) {
      logger.error('Error al actualizar estado:', error);
    }
  }

  /**
   * Actualizar última actividad
   */
  async updateLastSeen(instanceId) {
    try {
      await prisma.telegramInstance.update({
        where: { instanceId },
        data: { lastSeen: new Date() }
      });
    } catch (error) {
      logger.error('Error al actualizar última actividad:', error);
    }
  }

  /**
   * Desconectar instancia
   */
  async disconnectInstance(instanceId) {
    try {
      const instance = await this.getInstance(instanceId);

      // Eliminar webhook si existe
      if (instance.webhookUrl) {
        await this.deleteWebhook(instance.botToken);
      }

      // Actualizar estado
      await this.updateConnectionStatus(instanceId, 'DISCONNECTED');

      return {
        success: true,
        message: 'Instancia desconectada exitosamente'
      };

    } catch (error) {
      logger.error('Error al desconectar instancia:', error);
      throw error;
    }
  }

  /**
   * Eliminar webhook
   */
  async deleteWebhook(botToken) {
    try {
      const response = await axios.post(`https://api.telegram.org/bot${botToken}/deleteWebhook`);
      return response.data;
    } catch (error) {
      logger.error('Error al eliminar webhook:', error);
      throw error;
    }
  }

  /**
   * Eliminar instancia
   */
  async deleteInstance(instanceId) {
    try {
      const instance = await this.getInstance(instanceId);

      // Desconectar primero
      await this.disconnectInstance(instanceId);

      // Marcar como inactiva
      await prisma.telegramInstance.update({
        where: { instanceId },
        data: { isActive: false }
      });

      logger.info(`Instancia de Telegram eliminada: ${instanceId}`);

      return {
        success: true,
        message: 'Instancia eliminada exitosamente'
      };

    } catch (error) {
      logger.error('Error al eliminar instancia:', error);
      throw error;
    }
  }

  /**
   * Probar conexión
   */
  async testConnection(instanceId) {
    try {
      const instance = await this.getInstance(instanceId);
      const botInfo = await this.validateBotToken(instance.botToken);

      await this.updateConnectionStatus(instanceId, 'CONNECTED');

      return {
        success: true,
        botInfo,
        message: 'Conexión exitosa'
      };

    } catch (error) {
      await this.updateConnectionStatus(instanceId, 'ERROR', error.message);
      throw error;
    }
  }
}

export default new TelegramService();
