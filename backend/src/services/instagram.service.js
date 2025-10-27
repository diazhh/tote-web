import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import logger from '../lib/logger.js';

const prisma = new PrismaClient();

/**
 * Servicio para gestionar instancias de Instagram Basic Display API
 */
class InstagramService {
  constructor() {
    this.instances = new Map(); // Cache de instancias activas
    this.baseUrl = 'https://graph.instagram.com';
  }

  /**
   * Crear nueva instancia de Instagram
   */
  async createInstance(instanceId, name, appId, appSecret, redirectUri) {
    try {
      // Crear instancia en la base de datos
      const instance = await prisma.instagramInstance.create({
        data: {
          instanceId,
          name,
          appId,
          appSecret: this.encryptSecret(appSecret), // En producción usar encriptación real
          status: 'DISCONNECTED',
          config: {
            redirectUri,
            scopes: ['user_profile', 'user_media']
          }
        }
      });

      logger.info(`Instancia de Instagram creada: ${instanceId}`);
      
      return {
        success: true,
        instance: {
          ...instance,
          appSecret: '***hidden***' // No exponer el secret
        },
        authUrl: this.generateAuthUrl(appId, redirectUri),
        message: 'Instancia de Instagram creada. Autoriza la aplicación usando la URL proporcionada.'
      };

    } catch (error) {
      logger.error('Error al crear instancia de Instagram:', error);
      throw new Error(`Error al crear instancia: ${error.message}`);
    }
  }

  /**
   * Generar URL de autorización OAuth
   */
  generateAuthUrl(appId, redirectUri) {
    const scopes = 'user_profile,user_media';
    const baseUrl = 'https://api.instagram.com/oauth/authorize';
    
    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      scope: scopes,
      response_type: 'code'
    });

    return `${baseUrl}?${params.toString()}`;
  }

  /**
   * Intercambiar código de autorización por access token
   */
  async exchangeCodeForToken(instanceId, authCode, redirectUri) {
    try {
      const instance = await this.getInstance(instanceId);
      const appSecret = this.decryptSecret(instance.appSecret);

      // Intercambiar código por token de corta duración
      const shortTokenResponse = await axios.post('https://api.instagram.com/oauth/access_token', {
        client_id: instance.appId,
        client_secret: appSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code: authCode
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const shortToken = shortTokenResponse.data.access_token;
      const userId = shortTokenResponse.data.user_id;

      // Intercambiar por token de larga duración
      const longTokenResponse = await axios.get('https://graph.instagram.com/access_token', {
        params: {
          grant_type: 'ig_exchange_token',
          client_secret: appSecret,
          access_token: shortToken
        }
      });

      const accessToken = longTokenResponse.data.access_token;
      const expiresIn = longTokenResponse.data.expires_in; // 60 días

      // Obtener información del usuario
      const userInfo = await this.getUserInfo(accessToken);

      // Actualizar instancia
      const updatedInstance = await prisma.instagramInstance.update({
        where: { instanceId },
        data: {
          accessToken,
          userId: userId.toString(),
          username: userInfo.username,
          tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
          status: 'CONNECTED',
          connectedAt: new Date(),
          config: {
            ...instance.config,
            userInfo
          }
        }
      });

      logger.info(`Instancia de Instagram conectada: ${instanceId}`);

      return {
        success: true,
        instance: {
          ...updatedInstance,
          appSecret: '***hidden***'
        },
        message: 'Autorización exitosa. Instagram conectado.'
      };

    } catch (error) {
      logger.error('Error al intercambiar código:', error);
      await this.updateConnectionStatus(instanceId, 'ERROR', error.message);
      throw new Error(`Error en autorización: ${error.message}`);
    }
  }

  /**
   * Obtener información del usuario
   */
  async getUserInfo(accessToken) {
    try {
      const response = await axios.get(`${this.baseUrl}/me`, {
        params: {
          fields: 'id,username,account_type,media_count',
          access_token: accessToken
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error al obtener info del usuario:', error);
      throw error;
    }
  }

  /**
   * Obtener media del usuario
   */
  async getUserMedia(instanceId, limit = 25) {
    try {
      const instance = await this.getInstance(instanceId);
      
      if (!instance.accessToken) {
        throw new Error('Instancia no autorizada');
      }

      // Verificar si el token ha expirado
      if (instance.tokenExpiresAt && new Date() > instance.tokenExpiresAt) {
        await this.updateConnectionStatus(instanceId, 'EXPIRED');
        throw new Error('Token expirado. Reautoriza la aplicación.');
      }

      const response = await axios.get(`${this.baseUrl}/${instance.userId}/media`, {
        params: {
          fields: 'id,caption,media_type,media_url,thumbnail_url,timestamp,permalink',
          limit,
          access_token: instance.accessToken
        }
      });

      await this.updateLastSeen(instanceId);

      return {
        success: true,
        media: response.data.data,
        paging: response.data.paging
      };

    } catch (error) {
      logger.error('Error al obtener media:', error);
      if (error.response?.status === 401) {
        await this.updateConnectionStatus(instanceId, 'EXPIRED');
      }
      throw error;
    }
  }

  /**
   * Publicar imagen (Instagram Graph API)
   * Nota: Requiere que la cuenta sea Business/Creator y esté vinculada a una página de Facebook
   */
  async publishPhoto(instanceId, imageUrl, caption = '', options = {}) {
    try {
      const instance = await this.getInstance(instanceId);

      if (!instance.accessToken) {
        throw new Error('Instancia no autorizada');
      }

      // Verificar si el token ha expirado
      if (instance.tokenExpiresAt && new Date() > instance.tokenExpiresAt) {
        await this.updateConnectionStatus(instanceId, 'EXPIRED');
        throw new Error('Token expirado. Reautoriza la aplicación.');
      }

      // Paso 1: Crear container de media
      const containerResponse = await axios.post(
        `${this.baseUrl}/${instance.userId}/media`,
        {
          image_url: imageUrl,
          caption: caption,
          access_token: instance.accessToken
        }
      );

      const creationId = containerResponse.data.id;

      // Paso 2: Publicar el container
      const publishResponse = await axios.post(
        `${this.baseUrl}/${instance.userId}/media_publish`,
        {
          creation_id: creationId,
          access_token: instance.accessToken
        }
      );

      await this.updateLastSeen(instanceId);

      return {
        success: true,
        mediaId: publishResponse.data.id,
        creationId
      };

    } catch (error) {
      logger.error('Error al publicar foto en Instagram:', error);

      // Manejar errores específicos
      if (error.response?.status === 401) {
        await this.updateConnectionStatus(instanceId, 'EXPIRED');
      }

      throw error;
    }
  }

  /**
   * Publicar video (Instagram Graph API)
   */
  async publishVideo(instanceId, videoUrl, caption = '', thumbnailUrl = null) {
    try {
      const instance = await this.getInstance(instanceId);

      if (!instance.accessToken) {
        throw new Error('Instancia no autorizada');
      }

      // Verificar expiración
      if (instance.tokenExpiresAt && new Date() > instance.tokenExpiresAt) {
        await this.updateConnectionStatus(instanceId, 'EXPIRED');
        throw new Error('Token expirado. Reautoriza la aplicación.');
      }

      const payload = {
        media_type: 'VIDEO',
        video_url: videoUrl,
        caption: caption,
        access_token: instance.accessToken
      };

      if (thumbnailUrl) {
        payload.thumb_offset = 0; // Opcional: offset en milisegundos para el thumbnail
      }

      // Paso 1: Crear container
      const containerResponse = await axios.post(
        `${this.baseUrl}/${instance.userId}/media`,
        payload
      );

      const creationId = containerResponse.data.id;

      // Paso 2: Verificar estado del procesamiento
      let status = 'IN_PROGRESS';
      let attempts = 0;
      const maxAttempts = 30; // 5 minutos máximo

      while (status === 'IN_PROGRESS' && attempts < maxAttempts) {
        await this.sleep(10000); // Esperar 10 segundos

        const statusResponse = await axios.get(
          `${this.baseUrl}/${creationId}`,
          {
            params: {
              fields: 'status_code',
              access_token: instance.accessToken
            }
          }
        );

        status = statusResponse.data.status_code;
        attempts++;
      }

      if (status !== 'FINISHED') {
        throw new Error(`Error en procesamiento del video: ${status}`);
      }

      // Paso 3: Publicar
      const publishResponse = await axios.post(
        `${this.baseUrl}/${instance.userId}/media_publish`,
        {
          creation_id: creationId,
          access_token: instance.accessToken
        }
      );

      await this.updateLastSeen(instanceId);

      return {
        success: true,
        mediaId: publishResponse.data.id,
        creationId
      };

    } catch (error) {
      logger.error('Error al publicar video en Instagram:', error);

      if (error.response?.status === 401) {
        await this.updateConnectionStatus(instanceId, 'EXPIRED');
      }

      throw error;
    }
  }

  /**
   * Helper: Sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Refrescar token de acceso
   */
  async refreshAccessToken(instanceId) {
    try {
      const instance = await this.getInstance(instanceId);
      
      if (!instance.accessToken) {
        throw new Error('No hay token para refrescar');
      }

      const response = await axios.get('https://graph.instagram.com/refresh_access_token', {
        params: {
          grant_type: 'ig_refresh_token',
          access_token: instance.accessToken
        }
      });

      const newToken = response.data.access_token;
      const expiresIn = response.data.expires_in;

      // Actualizar token
      await prisma.instagramInstance.update({
        where: { instanceId },
        data: {
          accessToken: newToken,
          tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
          status: 'CONNECTED',
          lastSeen: new Date()
        }
      });

      logger.info(`Token de Instagram refrescado: ${instanceId}`);

      return {
        success: true,
        message: 'Token refrescado exitosamente',
        expiresAt: new Date(Date.now() + expiresIn * 1000)
      };

    } catch (error) {
      logger.error('Error al refrescar token:', error);
      await this.updateConnectionStatus(instanceId, 'ERROR', error.message);
      throw error;
    }
  }

  /**
   * Listar todas las instancias
   */
  async listInstances() {
    try {
      const instances = await prisma.instagramInstance.findMany({
        where: { isActive: true },
        orderBy: { createdAt: 'desc' }
      });

      // Ocultar secrets
      return instances.map(instance => ({
        ...instance,
        appSecret: '***hidden***',
        accessToken: instance.accessToken ? '***hidden***' : null
      }));
    } catch (error) {
      logger.error('Error al listar instancias de Instagram:', error);
      throw error;
    }
  }

  /**
   * Obtener instancia por ID
   */
  async getInstance(instanceId) {
    try {
      const instance = await prisma.instagramInstance.findUnique({
        where: { instanceId }
      });

      if (!instance) {
        throw new Error(`Instancia de Instagram no encontrada: ${instanceId}`);
      }

      if (!instance.isActive) {
        throw new Error(`Instancia de Instagram inactiva: ${instanceId}`);
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

      await prisma.instagramInstance.update({
        where: { instanceId },
        data: updateData
      });

      logger.info(`Estado de instancia Instagram actualizado: ${instanceId} -> ${status}`);
    } catch (error) {
      logger.error('Error al actualizar estado:', error);
    }
  }

  /**
   * Actualizar última actividad
   */
  async updateLastSeen(instanceId) {
    try {
      await prisma.instagramInstance.update({
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
      await prisma.instagramInstance.update({
        where: { instanceId },
        data: {
          status: 'DISCONNECTED',
          accessToken: null,
          refreshToken: null,
          tokenExpiresAt: null,
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
      await prisma.instagramInstance.update({
        where: { instanceId },
        data: { isActive: false }
      });

      logger.info(`Instancia de Instagram eliminada: ${instanceId}`);

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
      
      if (!instance.accessToken) {
        throw new Error('Instancia no autorizada');
      }

      const userInfo = await this.getUserInfo(instance.accessToken);
      await this.updateConnectionStatus(instanceId, 'CONNECTED');

      return {
        success: true,
        userInfo,
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

export default new InstagramService();
