import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import crypto from 'crypto';
import logger from '../lib/logger.js';

const prisma = new PrismaClient();

/**
 * Servicio para gestionar instancias de Facebook Messenger API
 */
class FacebookService {
  constructor() {
    this.instances = new Map(); // Cache de instancias activas
    this.baseUrl = 'https://graph.facebook.com/v18.0';
  }

  /**
   * Crear nueva instancia de Facebook
   */
  async createInstance(instanceId, name, pageAccessToken, appSecret, webhookToken, pageId) {
    try {
      // Validar el page access token
      const pageInfo = await this.validatePageToken(pageAccessToken);
      
      // Crear instancia en la base de datos
      const instance = await prisma.facebookInstance.create({
        data: {
          instanceId,
          name,
          pageAccessToken: this.encryptSecret(pageAccessToken),
          appSecret: this.encryptSecret(appSecret),
          webhookToken,
          pageId,
          pageName: pageInfo.name,
          status: 'CONNECTED',
          connectedAt: new Date(),
          config: {
            pageInfo,
            permissions: pageInfo.permissions || []
          }
        }
      });

      logger.info(`Instancia de Facebook creada: ${instanceId}`);
      
      return {
        success: true,
        instance: {
          ...instance,
          pageAccessToken: '***hidden***',
          appSecret: '***hidden***'
        },
        message: 'Instancia de Facebook creada exitosamente'
      };

    } catch (error) {
      logger.error('Error al crear instancia de Facebook:', error);
      throw new Error(`Error al crear instancia: ${error.message}`);
    }
  }

  /**
   * Validar Page Access Token
   */
  async validatePageToken(pageAccessToken) {
    try {
      const response = await axios.get(`${this.baseUrl}/me`, {
        params: {
          access_token: pageAccessToken,
          fields: 'id,name,category,permissions'
        }
      });

      return response.data;
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error('Page Access Token inválido o expirado');
      }
      throw new Error(`Error al validar token: ${error.message}`);
    }
  }

  /**
   * Configurar webhook
   */
  async setupWebhook(instanceId, webhookUrl) {
    try {
      const instance = await this.getInstance(instanceId);
      const pageAccessToken = this.decryptSecret(instance.pageAccessToken);

      // Suscribir la página al webhook
      const response = await axios.post(`${this.baseUrl}/${instance.pageId}/subscribed_apps`, {
        access_token: pageAccessToken
      });

      if (response.data.success) {
        // Actualizar URL del webhook en la instancia
        await prisma.facebookInstance.update({
          where: { instanceId },
          data: {
            config: {
              ...instance.config,
              webhookUrl
            }
          }
        });

        return {
          success: true,
          message: 'Webhook configurado exitosamente'
        };
      }

      throw new Error('Error al configurar webhook');

    } catch (error) {
      logger.error('Error al configurar webhook:', error);
      throw error;
    }
  }

  /**
   * Verificar webhook (para el proceso de verificación de Facebook)
   */
  verifyWebhook(mode, token, challenge, instanceId) {
    try {
      // En una implementación real, buscar el webhook token de la instancia
      const VERIFY_TOKEN = process.env.FACEBOOK_WEBHOOK_TOKEN || 'your_verify_token';
      
      if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        logger.info(`Webhook verificado para instancia: ${instanceId}`);
        return challenge;
      }
      
      throw new Error('Token de verificación inválido');
    } catch (error) {
      logger.error('Error en verificación de webhook:', error);
      throw error;
    }
  }

  /**
   * Enviar mensaje de texto
   */
  async sendMessage(instanceId, recipientId, message, options = {}) {
    try {
      const instance = await this.getInstance(instanceId);
      const pageAccessToken = this.decryptSecret(instance.pageAccessToken);
      
      const payload = {
        recipient: { id: recipientId },
        message: { text: message },
        messaging_type: options.messagingType || 'RESPONSE'
      };

      const response = await axios.post(`${this.baseUrl}/me/messages`, payload, {
        params: { access_token: pageAccessToken }
      });

      // Actualizar última actividad
      await this.updateLastSeen(instanceId);

      return {
        success: true,
        messageId: response.data.message_id,
        recipientId: response.data.recipient_id
      };

    } catch (error) {
      logger.error('Error al enviar mensaje de Facebook:', error);
      throw error;
    }
  }

  /**
   * Enviar imagen
   */
  async sendImage(instanceId, recipientId, imageUrl, options = {}) {
    try {
      const instance = await this.getInstance(instanceId);
      const pageAccessToken = this.decryptSecret(instance.pageAccessToken);
      
      const payload = {
        recipient: { id: recipientId },
        message: {
          attachment: {
            type: 'image',
            payload: { url: imageUrl }
          }
        },
        messaging_type: options.messagingType || 'RESPONSE'
      };

      const response = await axios.post(`${this.baseUrl}/me/messages`, payload, {
        params: { access_token: pageAccessToken }
      });

      await this.updateLastSeen(instanceId);

      return {
        success: true,
        messageId: response.data.message_id,
        recipientId: response.data.recipient_id
      };

    } catch (error) {
      logger.error('Error al enviar imagen de Facebook:', error);
      throw error;
    }
  }

  /**
   * Obtener información del usuario
   */
  async getUserInfo(instanceId, userId) {
    try {
      const instance = await this.getInstance(instanceId);
      const pageAccessToken = this.decryptSecret(instance.pageAccessToken);
      
      const response = await axios.get(`${this.baseUrl}/${userId}`, {
        params: {
          access_token: pageAccessToken,
          fields: 'first_name,last_name,profile_pic'
        }
      });

      return {
        success: true,
        user: response.data
      };

    } catch (error) {
      logger.error('Error al obtener info del usuario:', error);
      throw error;
    }
  }

  /**
   * Procesar webhook entrante
   */
  async processWebhook(instanceId, body, signature) {
    try {
      const instance = await this.getInstance(instanceId);
      const appSecret = this.decryptSecret(instance.appSecret);

      // Verificar firma del webhook
      if (!this.verifySignature(body, signature, appSecret)) {
        throw new Error('Firma de webhook inválida');
      }

      // Procesar eventos
      if (body.object === 'page') {
        for (const entry of body.entry) {
          if (entry.messaging) {
            for (const event of entry.messaging) {
              await this.handleMessagingEvent(instanceId, event);
            }
          }
        }
      }

      await this.updateLastSeen(instanceId);

      return { success: true };

    } catch (error) {
      logger.error('Error al procesar webhook:', error);
      throw error;
    }
  }

  /**
   * Verificar firma del webhook
   */
  verifySignature(body, signature, appSecret) {
    try {
      const expectedSignature = 'sha1=' + crypto
        .createHmac('sha1', appSecret)
        .update(JSON.stringify(body))
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      logger.error('Error al verificar firma:', error);
      return false;
    }
  }

  /**
   * Manejar evento de messaging
   */
  async handleMessagingEvent(instanceId, event) {
    try {
      logger.info(`Evento de messaging recibido para ${instanceId}:`, event);

      // Aquí puedes implementar la lógica para manejar diferentes tipos de eventos
      if (event.message) {
        // Mensaje recibido
        logger.info('Mensaje recibido:', event.message);
      }

      if (event.postback) {
        // Postback recibido
        logger.info('Postback recibido:', event.postback);
      }

      // Implementar más tipos de eventos según sea necesario

    } catch (error) {
      logger.error('Error al manejar evento:', error);
    }
  }

  /**
   * Listar todas las instancias
   */
  async listInstances() {
    try {
      const instances = await prisma.facebookInstance.findMany({
        where: { isActive: true },
        orderBy: { createdAt: 'desc' }
      });

      // Ocultar secrets
      return instances.map(instance => ({
        ...instance,
        pageAccessToken: '***hidden***',
        appSecret: '***hidden***'
      }));
    } catch (error) {
      logger.error('Error al listar instancias de Facebook:', error);
      throw error;
    }
  }

  /**
   * Obtener instancia por ID
   */
  async getInstance(instanceId) {
    try {
      const instance = await prisma.facebookInstance.findUnique({
        where: { instanceId }
      });

      if (!instance) {
        throw new Error(`Instancia de Facebook no encontrada: ${instanceId}`);
      }

      if (!instance.isActive) {
        throw new Error(`Instancia de Facebook inactiva: ${instanceId}`);
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
          lastError: error
        };
      }

      await prisma.facebookInstance.update({
        where: { instanceId },
        data: updateData
      });

      logger.info(`Estado de instancia Facebook actualizado: ${instanceId} -> ${status}`);
    } catch (error) {
      logger.error('Error al actualizar estado:', error);
    }
  }

  /**
   * Actualizar última actividad
   */
  async updateLastSeen(instanceId) {
    try {
      await prisma.facebookInstance.update({
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
      await prisma.facebookInstance.update({
        where: { instanceId },
        data: {
          status: 'DISCONNECTED',
          lastSeen: new Date()
        }
      });

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
   * Eliminar instancia
   */
  async deleteInstance(instanceId) {
    try {
      await prisma.facebookInstance.update({
        where: { instanceId },
        data: { isActive: false }
      });

      logger.info(`Instancia de Facebook eliminada: ${instanceId}`);

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
   * Publicar post en el feed de la página
   */
  async publishPost(instanceId, message, imageUrl = null, options = {}) {
    try {
      const instance = await this.getInstance(instanceId);
      const pageAccessToken = this.decryptSecret(instance.pageAccessToken);

      const payload = {
        access_token: pageAccessToken
      };

      // Si hay imagen, publicar como foto
      if (imageUrl) {
        payload.url = imageUrl;
        payload.caption = message;

        const response = await axios.post(
          `${this.baseUrl}/${instance.pageId}/photos`,
          payload
        );

        await this.updateLastSeen(instanceId);

        return {
          success: true,
          postId: response.data.id,
          post_id: response.data.post_id
        };
      } else {
        // Publicar solo texto
        payload.message = message;

        const response = await axios.post(
          `${this.baseUrl}/${instance.pageId}/feed`,
          payload
        );

        await this.updateLastSeen(instanceId);

        return {
          success: true,
          postId: response.data.id
        };
      }

    } catch (error) {
      logger.error('Error al publicar en Facebook:', error);
      throw error;
    }
  }

  /**
   * Publicar foto en la página
   */
  async publishPhoto(instanceId, imageUrl, caption = '', options = {}) {
    try {
      const instance = await this.getInstance(instanceId);
      const pageAccessToken = this.decryptSecret(instance.pageAccessToken);

      const payload = {
        url: imageUrl,
        caption: caption,
        access_token: pageAccessToken,
        ...options
      };

      const response = await axios.post(
        `${this.baseUrl}/${instance.pageId}/photos`,
        payload
      );

      await this.updateLastSeen(instanceId);

      return {
        success: true,
        photoId: response.data.id,
        post_id: response.data.post_id
      };

    } catch (error) {
      logger.error('Error al publicar foto en Facebook:', error);
      throw error;
    }
  }

  /**
   * Probar conexión
   */
  async testConnection(instanceId) {
    try {
      const instance = await this.getInstance(instanceId);
      const pageAccessToken = this.decryptSecret(instance.pageAccessToken);

      const pageInfo = await this.validatePageToken(pageAccessToken);
      await this.updateConnectionStatus(instanceId, 'CONNECTED');

      return {
        success: true,
        pageInfo,
        message: 'Conexión exitosa'
      };

    } catch (error) {
      await this.updateConnectionStatus(instanceId, 'ERROR', error.message);
      throw error;
    }
  }

  /**
   * Encriptar secret (implementación básica - usar crypto en producción)
   */
  encryptSecret(secret) {
    // En producción, usar una librería de encriptación real
    return Buffer.from(secret).toString('base64');
  }

  /**
   * Desencriptar secret
   */
  decryptSecret(encryptedSecret) {
    // En producción, usar una librería de encriptación real
    return Buffer.from(encryptedSecret, 'base64').toString('utf8');
  }
}

export default new FacebookService();
